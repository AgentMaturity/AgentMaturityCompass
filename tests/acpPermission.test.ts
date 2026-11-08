import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAcpAgent, type AcpAgent, type AcpApprovalRaisedHook } from "../src/acp/acpAgentServer.js";
import { createAcpPermissionHandler, permissionReason, type AcpApprovalRaised } from "../src/acp/acpPermission.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import { startAcpStdio } from "../src/acp/acpStdioMain.js";
import type { AgentSession } from "../src/agent/agentSession.js";
import { createApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { listApprovalDecisions } from "../src/approvals/approvalChainStore.js";
import { getApprovalInboxItem } from "../src/approvals/approvalInbox.js";
import { createSession, initUsersConfig } from "../src/auth/authApi.js";
import { readNativeApprovalActor } from "../src/setup/nativeApprovalIdentity.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { SessionService } from "../src/session/sessionService.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * SH-UI-04: `session/request_permission`. The approvals engine raises the signed request first; the client only picks
 * an option this process offered. `allow_once` exists only behind an operator-pinned tracked login and records its
 * decision through the real `amc approvals approve`, digest-bound, then reads the signed decision back.
 */
const CLI = resolve(process.cwd(), "dist/cli.js");
let workspace: string;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "sh-ui-acp-permission");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-acp-permission-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initActionPolicy(workspace); initToolsConfig(workspace); initBudgets(workspace, "default");
});
afterEach(() => { rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function raise() {
  const approvalId = `apr_${randomUUID()}`;
  const created = createApprovalForIntent({ workspace, agentId: "default", intentId: approvalId, toolName: "fs.write", actionClass: "WRITE_LOW",
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "medium", intentPayload: { toolName: "fs.write", rawArguments: '{"path":"notes.txt"}' } });
  return { approvalId, approvalRequestId: created.request.approvalRequestId, toolCallId: `call-${randomUUID().slice(0, 8)}` };
}
function reviewerToken(): string {
  const user = initUsersConfig({ workspace, username: "alice", password: "alice-fixture-password" }).owner;
  const session = createSession({ workspace, user });
  const path = join(workspace, "reviewer-session.txt");
  writeFileSync(path, session.token, { mode: 0o600 });
  return path;
}
const decisions = (approvalRequestId: string) => listApprovalDecisions({ workspace, agentId: "default", approvalRequestId });
/** A reviewer decides the request out of band, as docs/ACP.md allows, through the real `amc approvals deny`. */
function denyElsewhere(approvalRequestId: string, tokenFile: string): void {
  const actor = readNativeApprovalActor(workspace, tokenFile);
  const digest = getApprovalInboxItem({ workspace, agentId: "default", approvalRequestId }).requestDigestSha256;
  const denied = spawnSync(process.execPath, [CLI, "approvals", "deny", "--agent", "default", "--reason", "denied out of band",
    "--username", actor.username, "--roles", actor.roles.join(","), "--user-id", actor.userId, "--session-token-file", tokenFile,
    "--expect-request-digest", digest, "--", approvalRequestId], { cwd: workspace, env: process.env, encoding: "utf8" });
  expect(denied.status, denied.stderr).toBe(0);
}

function event(raised: { approvalId: string; approvalRequestId: string; toolCallId: string }, answer: unknown, negotiated = true) {
  const requests: unknown[] = [], cancels: string[] = [];
  const turn = new AbortController();
  const base: AcpApprovalRaised = { sessionId: "s1", ...raised, negotiated, turnEnded: turn.signal, cancelTurn: by => cancels.push(by),
    request: async (method, params, signal) => {
      requests.push({ method, params });
      if (typeof answer === "function") return (answer as (signal: AbortSignal) => unknown)(signal);
      return answer;
    } };
  return { event: base, requests, cancels, turn };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 50));

describe("createAcpPermissionHandler", () => {
  it("stays silent on the wire for a client that did not negotiate permission requests", async () => {
    const logs: string[] = [];
    const handler = createAcpPermissionHandler({ workspace, agentId: "default", cli: { execPath: process.execPath, execArgv: [], entry: CLI }, log: m => logs.push(m) });
    expect(handler.capability).toBe("reject-only");
    const raised = raise();
    const { event: e, requests, cancels } = event(raised, { outcome: { outcome: "selected", optionId: "reject_once" } }, false);
    handler.handle(e); await flush();
    expect(requests).toEqual([]); expect(cancels).toEqual([]);
    expect(logs.join("\n")).toContain(`signed approval pending: ${raised.approvalRequestId}`);
  });

  it("sends a schema-valid request with reject_once only, and reject_once cancels the turn without a decision", async () => {
    const handler = createAcpPermissionHandler({ workspace, agentId: "default", cli: { execPath: process.execPath, execArgv: [], entry: CLI }, log: () => {} });
    const raised = raise();
    const { event: e, requests, cancels } = event(raised, { outcome: { outcome: "selected", optionId: "reject_once" } });
    handler.handle(e); await flush();
    expect(requests).toHaveLength(1);
    const sent = requests[0] as { method: string; params: { sessionId: string; options: Array<{ optionId: string; kind: string }>; toolCall: { toolCallId: string; title: string; kind: string }; _meta: Record<string, Record<string, unknown>> } };
    expect(sent.method).toBe("session/request_permission");
    expect(await checkAcpDefinition("RequestPermissionRequest", sent.params)).toEqual({ ok: true });
    expect(sent.params.options.map(option => option.kind)).toEqual(["reject_once"]);
    // The request names the committed tool call it gates (the ToolCallUpdate's id), never the seam's audit id.
    expect(sent.params.toolCall).toMatchObject({ toolCallId: raised.toolCallId, title: "fs.write", kind: "edit" });
    expect(sent.params.toolCall.toolCallId).not.toBe(raised.approvalId);
    expect(sent.params._meta["dev.agentmaturity.amc"]).toMatchObject({ approvalRequestId: raised.approvalRequestId, decision: "reject-only", actionClass: "WRITE_LOW" });
    expect(cancels).toEqual(["acp-client"]);
    expect(decisions(raised.approvalRequestId)).toEqual([]);
  });

  it("refuses allow_once from a client when no reviewer was pinned, and a malformed reply, by cancelling the turn", async () => {
    const handler = createAcpPermissionHandler({ workspace, agentId: "default", cli: { execPath: process.execPath, execArgv: [], entry: CLI }, log: () => {} });
    const forged = event(raise(), { outcome: { outcome: "selected", optionId: "allow_once" } });
    handler.handle(forged.event); await flush();
    expect(forged.cancels).toEqual(["acp-client"]);
    const malformed = event(raise(), { outcome: "yes" });
    handler.handle(malformed.event); await flush();
    expect(malformed.cancels).toEqual(["acp-permission-failed"]);
    const cancelled = event(raise(), { outcome: { outcome: "cancelled" } });
    handler.handle(cancelled.event); await flush();
    expect(cancelled.cancels).toEqual([]); // The client cancelled the turn itself.
  });

  it("allow_once with a pinned reviewer records a signed, digest-bound decision through the real approvals CLI; no reason cancels instead", async () => {
    const tokenFile = reviewerToken();
    const logs: string[] = [];
    const handler = createAcpPermissionHandler({ workspace, agentId: "default", cli: { execPath: process.execPath, execArgv: [], entry: CLI },
      reviewer: { tokenFile }, log: m => logs.push(m) });
    expect(handler.capability).toBe("signed-reviewer");
    const noReason = event(raise(), { outcome: { outcome: "selected", optionId: "allow_once" } });
    handler.handle(noReason.event); await flush();
    expect(noReason.cancels).toEqual(["acp-permission-no-reason"]);
    expect(decisions(noReason.event.approvalRequestId)).toEqual([]);

    const raised = raise();
    const allowed = event(raised, { outcome: { outcome: "selected", optionId: "allow_once" }, _meta: { "dev.agentmaturity.amc": { reason: "reviewed in the editor" } } });
    handler.handle(allowed.event);
    await vi.waitFor(() => expect(decisions(raised.approvalRequestId)).toHaveLength(1), { timeout: 60_000, interval: 100 });
    await vi.waitFor(() => expect(logs.join("\n")).toContain("signed approve decision"), { timeout: 30_000, interval: 100 });
    const sent = allowed.requests[0] as { params: { options: Array<{ kind: string }> } };
    expect(sent.params.options.map(option => option.kind)).toEqual(["allow_once", "reject_once"]);
    expect(allowed.cancels).toEqual([]);
    const item = getApprovalInboxItem({ workspace, agentId: "default", approvalRequestId: raised.approvalRequestId });
    const requested = (allowed.requests[0] as { params: { _meta: Record<string, { requestDigestSha256: string }> } }).params._meta["dev.agentmaturity.amc"]!.requestDigestSha256;
    // Bound to the digest the client was shown, not to whatever the request became afterwards.
    expect(item.decisions[0]).toMatchObject({ username: "alice", decision: "APPROVE_EXECUTE", requestDigestSha256: requested, reason: "reviewed in the editor" });
  }, 90_000);

  it("withdraws the request when the raising prompt ends, and decides nothing on an answer that arrives after it", async () => {
    const logs: string[] = [];
    const handler = createAcpPermissionHandler({ workspace, agentId: "default", cli: { execPath: process.execPath, execArgv: [], entry: CLI }, log: m => logs.push(m) });
    // The prompt ends while the dialog is open: the outbound request's signal aborts and nothing is cancelled or decided.
    const withdrawn = event(raise(), (signal: AbortSignal) => new Promise((_resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("request cancelled")), { once: true }); }));
    handler.handle(withdrawn.event); await flush();
    expect(withdrawn.requests).toHaveLength(1);
    withdrawn.turn.abort(); await flush();
    expect(withdrawn.cancels).toEqual([]);
    expect(logs.join("\n")).toContain("the prompt ended before the client answered; request withdrawn");
    // A stale reject_once that lands after the prompt ended is not applied to whatever prompt is active now.
    const late = event(raise(), () => { late.turn.abort(); return { outcome: { outcome: "selected", optionId: "reject_once" } }; });
    handler.handle(late.event); await flush();
    expect(late.cancels).toEqual([]);
    expect(logs.join("\n")).toContain("answered after its prompt ended; nothing decided");
  });

  it("withdraws an outstanding request once the approval is decided elsewhere, and a stale allow_once decides nothing and cancels nothing", async () => {
    const tokenFile = reviewerToken();
    const logs: string[] = [];
    const handler = createAcpPermissionHandler({ workspace, agentId: "default", cli: { execPath: process.execPath, execArgv: [], entry: CLI },
      reviewer: { tokenFile, reason: "reviewed in the editor" }, log: m => logs.push(m) });
    // The dialog is open when a reviewer denies the request with `amc approvals deny`: the server stops waiting on it.
    const open = raise();
    const waiting = event(open, (signal: AbortSignal) => new Promise((_resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("request cancelled")), { once: true }); }));
    handler.handle(waiting.event); await flush();
    expect(waiting.requests).toHaveLength(1);
    denyElsewhere(open.approvalRequestId, tokenFile);
    await vi.waitFor(() => expect(logs.join("\n")).toContain(`approval ${open.approvalRequestId} was decided elsewhere (DENIED) before the client answered; request withdrawn`), { timeout: 10_000, interval: 50 });
    expect(waiting.cancels).toEqual([]);
    // The client's allow_once lands after an out-of-band deny: nothing is left to record and the turn is not cancelled.
    const stale = raise();
    const answered = event(stale, () => { denyElsewhere(stale.approvalRequestId, tokenFile); return { outcome: { outcome: "selected", optionId: "allow_once" } }; });
    handler.handle(answered.event);
    await vi.waitFor(() => expect(logs.join("\n")).toContain(`approval ${stale.approvalRequestId} was already DENIED when the client chose allow_once; nothing decided`), { timeout: 30_000, interval: 50 });
    expect(answered.cancels).toEqual([]);
    expect(decisions(stale.approvalRequestId).map(row => row.decision)).toEqual(["DENY"]);
  }, 90_000);

  it("never reads its own allow_once decision as one made elsewhere, however long the approve command takes to exit", async () => {
    const tokenFile = reviewerToken();
    // WRITE_LOW needs one approval, so the request leaves PENDING the moment our decision lands; the command then lingers.
    const entry = join(workspace, "approve-then-linger.mjs");
    writeFileSync(entry, `import { spawnSync } from "node:child_process";\nconst run = spawnSync(process.execPath, [${JSON.stringify(CLI)}, ...process.argv.slice(2)], { stdio: "inherit" });\nsetTimeout(() => process.exit(run.status ?? 1), 2500);\n`);
    const logs: string[] = [];
    const handler = createAcpPermissionHandler({ workspace, agentId: "default", cli: { execPath: process.execPath, execArgv: [], entry },
      reviewer: { tokenFile, reason: "reviewed in the editor" }, log: m => logs.push(m) });
    const allowed = event(raise(), { outcome: { outcome: "selected", optionId: "allow_once" } });
    handler.handle(allowed.event);
    await vi.waitFor(() => expect(logs.join("\n")).toMatch(/signed approve decision \S+; request status QUORUM_MET, quorum 1\/1/), { timeout: 60_000, interval: 100 });
    expect(allowed.cancels).toEqual([]);
    expect(logs.join("\n")).not.toContain("decided elsewhere");
  }, 90_000);

  it("names a decision that was recorded although its approve command failed, and still cancels the turn", async () => {
    const tokenFile = reviewerToken();
    // The real `amc approvals approve` records the decision, then the command reports failure (as when lifecycle delivery fails).
    const entry = join(workspace, "approve-then-fail.mjs");
    writeFileSync(entry, `import { spawnSync } from "node:child_process";\nspawnSync(process.execPath, [${JSON.stringify(CLI)}, ...process.argv.slice(2)], { stdio: "inherit" });\nprocess.exit(1);\n`);
    const logs: string[] = [];
    const handler = createAcpPermissionHandler({ workspace, agentId: "default", cli: { execPath: process.execPath, execArgv: [], entry },
      reviewer: { tokenFile, reason: "reviewed in the editor" }, log: m => logs.push(m) });
    const raised = raise();
    const allowed = event(raised, { outcome: { outcome: "selected", optionId: "allow_once" } });
    handler.handle(allowed.event);
    await vi.waitFor(() => expect(allowed.cancels).toEqual(["acp-permission-unconfirmed"]), { timeout: 60_000, interval: 100 });
    const recorded = decisions(raised.approvalRequestId);
    expect(recorded.map(row => row.decision)).toEqual(["APPROVE_EXECUTE"]);
    expect(logs.join("\n")).toContain(`the decision ${recorded[0]!.approvalDecisionId} is recorded, but its approve command did not complete cleanly`);
    expect(logs.join("\n")).not.toContain("no matching signed decision was confirmed");
  }, 90_000);

  it("takes the reason from the client's _meta, else the launch default, and refuses empty or oversize text", () => {
    expect(permissionReason({ _meta: { "dev.agentmaturity.amc": { reason: " from client " } } }, "default")).toBe("from client");
    expect(permissionReason({}, "launch default")).toBe("launch default");
    expect(permissionReason({}, undefined)).toBeNull();
    expect(permissionReason({ _meta: { "dev.agentmaturity.amc": { reason: "   " } } }, undefined)).toBeNull();
    expect(permissionReason({}, "x".repeat(1001))).toBeNull();
  });
});

describe("ACP server negotiation of the new frames", () => {
  type Frame = { method?: string; id?: number | string; params?: Record<string, unknown>; result?: Record<string, unknown> };
  const agents: AcpAgent[] = [];
  afterEach(async () => { for (const agent of agents.splice(0)) await agent.close(); });

  function peer(options: { onApprovalRaised?: (event: AcpApprovalRaised) => void; commands?: boolean; tamperReads?: boolean;
    /** Runs inside the fixture's prompt, between turn/start and turn/end. `tamper()` makes later reads return a forged last row. */
    onPrompt?: (context: { writer: SessionService; sessionId: string; hook: AcpApprovalRaisedHook; tamper: () => void }) => Promise<void> } = {}) {
    const frames: Frame[] = [], cancels: string[] = [];
    let writer!: SessionService, hook: AcpApprovalRaisedHook | undefined, tampered = false;
    const tamper = (): void => { tampered = true; };
    const reads = (): ReturnType<SessionService["readEvents"]> => {
      const rows = writer.readEvents();
      return tampered && options.tamperReads ? [...rows.slice(0, -1), { ...rows.at(-1)!, writer_sig: "ab".repeat(64) }] : rows;
    };
    const agent = createAcpAgent({ workspace, agentId: "default", write: bytes => frames.push(JSON.parse(bytes.toString("utf8")) as Frame),
      ...(options.onApprovalRaised ? { onApprovalRaised: options.onApprovalRaised } : {}),
      ...(options.commands === false ? {} : { availableCommands: () => [{ name: "review", description: "Review the diff", input: { hint: "what to focus on" } }] }),
      sessionFactory: ({ sessionId, approvalRaised }): AgentSession => {
        hook = approvalRaised;
        writer = new SessionService(workspace);
        writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
        return { sessionId, prompt: async () => { writer.startTurn({ trigger: "user" }); await options.onPrompt?.({ writer, sessionId, hook: hook!, tamper }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
          return { ok: true, text: "", status: "idle", validation: { status: "not-requested", turn: null, configSha256: null, checks: [] } }; },
          cancel: (_cause, by) => { cancels.push(by); }, readEvents: reads,
          close: () => { try { writer.close({ reason: "completed" }); } finally { writer.disposeWithoutClosing(); } } };
      } });
    agents.push(agent); let sequence = 0;
    const send = (method: string, params: unknown): number => { const id = ++sequence; agent.connection.ingest(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)); return id; };
    const reply = async (id: number): Promise<Frame> => {
      await vi.waitFor(() => expect(frames.find(frame => frame.id === id)).toBeDefined(), { timeout: 5000, interval: 5 });
      return frames.find(frame => frame.id === id)!;
    };
    return { frames, cancels, send, reply, get hook() { return hook; }, call: (method: string, params: unknown) => reply(send(method, params)) };
  }
  const commandsUpdate = (frames: Frame[]) => frames.filter(frame => frame.method === "session/update" && (frame.params?.update as { sessionUpdate?: string })?.sessionUpdate === "available_commands_update");

  it("announces available commands after session/new to a generic client, and to an AMC client only when it opted in", async () => {
    for (const [capabilities, expected] of [[{}, 1], [{ _meta: { "dev.agentmaturity.amc": { currentPlanUpdates: "amc-current-plan-v1" } } }, 0],
      [{ _meta: { "dev.agentmaturity.amc": { availableCommands: "amc-available-commands-v1" } } }, 1]] as const) {
      const client = peer();
      const init = await client.call("initialize", { protocolVersion: 1, clientCapabilities: capabilities });
      expect((init.result!.agentCapabilities as { _meta: Record<string, Record<string, unknown>> })._meta["dev.agentmaturity.amc"]).toMatchObject({ availableCommands: "amc-available-commands-v1", thoughtUpdates: "amc-thought-updates-v1" });
      const created = await client.call("session/new", { cwd: workspace, mcpServers: [] });
      await new Promise(resolve => setImmediate(resolve)); await flush();
      const announced = commandsUpdate(client.frames);
      expect(announced, JSON.stringify(capabilities)).toHaveLength(expected);
      if (expected) {
        expect(client.frames.indexOf(announced[0]!)).toBeGreaterThan(client.frames.indexOf(created));
        expect(announced[0]!.params).toEqual({ sessionId: created.result!.sessionId, update: { sessionUpdate: "available_commands_update", availableCommands: [{ name: "review", description: "Review the diff", input: { hint: "what to focus on" } }] } });
        expect(await checkAcpDefinition("SessionNotification", announced[0]!.params)).toEqual({ ok: true });
      }
    }
  });

  it("routes a raised approval to the launcher's handler with the negotiation state and a cancel bound to the session's prompt", async () => {
    const seen: AcpApprovalRaised[] = [];
    for (const [capabilities, negotiated] of [[{}, true], [{ _meta: { "dev.agentmaturity.amc": {} } }, false],
      [{ _meta: { "dev.agentmaturity.amc": { permissionRequests: "amc-permission-v1" } } }, true]] as const) {
      const client = peer({ onApprovalRaised: e => seen.push(e) });
      const init = await client.call("initialize", { protocolVersion: 1, clientCapabilities: capabilities });
      expect((init.result!.agentCapabilities as { _meta: Record<string, Record<string, unknown>> })._meta["dev.agentmaturity.amc"]).toMatchObject({ permissionRequests: "amc-permission-v1" });
      const created = await client.call("session/new", { cwd: workspace, mcpServers: [] });
      client.hook!(created.result!.sessionId as string, { approvalId: "apr_x", approvalRequestId: "apprreq_y", toolCallId: "call_z" });
      expect(seen.at(-1)).toMatchObject({ sessionId: created.result!.sessionId, approvalId: "apr_x", approvalRequestId: "apprreq_y", toolCallId: "call_z", negotiated });
      // The hook's request goes out as an agent-to-client JSON-RPC request on this connection.
      const aborted = new AbortController(); const pending = seen.at(-1)!.request("ping", {}, aborted.signal); aborted.abort();
      await expect(pending).rejects.toThrow(/cancelled/);
      const ping = client.frames.filter(frame => frame.method === "ping").at(-1)!;
      expect(typeof ping.id).toBe("string");
      // A withdrawn request is announced, so a client that implements `$/cancel_request` closes its dialog.
      const cancel = client.frames.find(frame => frame.method === "$/cancel_request" && frame.params?.requestId === ping.id);
      expect(cancel).toBeDefined();
      expect(await checkAcpDefinition("CancelRequestNotification", cancel!.params)).toEqual({ ok: true });
    }
  });

  it("flushes the gated tool_call before the handler runs, and binds the cancel and the dialog to the prompt that raised it", async () => {
    const seen: AcpApprovalRaised[] = [], toolCallsAtRaise: number[] = [];
    let prompts = 0, release!: () => void;
    const toolCallFrames = (frames: Frame[]) => frames.filter(frame => frame.method === "session/update" && (frame.params?.update as { sessionUpdate?: string })?.sessionUpdate === "tool_call");
    const client = peer({ onApprovalRaised: e => { seen.push(e); toolCallsAtRaise.push(toolCallFrames(client.frames).length); },
      onPrompt: async ({ writer, sessionId, hook }) => {
        prompts += 1;
        if (prompts === 1) {
          writer.startStep();
          writer.recordToolCall({ toolCallId: "call-1", toolName: "fs.read", dispatch: "native", parentToken: null, args: JSON.stringify({ path: "a.md" }) });
          hook(sessionId, { approvalId: "apr_1", approvalRequestId: "apprreq_1", toolCallId: "call-1" });
          writer.endStep({ stopReason: "tool_use", usage: null });
        } else await new Promise<void>(resolve => { release = resolve; });
      } });
    await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const sessionId = (await client.call("session/new", { cwd: workspace, mcpServers: [] })).result!.sessionId as string;
    const first = await client.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "one" }] });
    expect(first.result).toMatchObject({ stopReason: "end_turn" });
    // The committed tool_call the permission names had already reached the client when the handler was invoked.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ toolCallId: "call-1", negotiated: true });
    expect(toolCallsAtRaise).toEqual([1]);
    expect((toolCallFrames(client.frames)[0]!.params!.update as { toolCallId: string }).toolCallId).toBe("call-1");
    // The dialog is withdrawn with its prompt, and a late answer cancels that prompt (ended) or nothing: never prompt 2.
    expect(seen[0]!.turnEnded.aborted).toBe(true);
    const second = client.send("session/prompt", { sessionId, prompt: [{ type: "text", text: "two" }] });
    await vi.waitFor(() => expect(prompts).toBe(2), { timeout: 5000, interval: 5 });
    seen[0]!.cancelTurn("acp-client");
    expect(client.cancels).toEqual([]);
    release();
    expect((await client.reply(second)).result).toMatchObject({ stopReason: "end_turn" });
    expect(client.cancels).toEqual([]);
  });

  it("sends no permission request when the gated tool_call cannot be delivered first, and the prompt fails instead", async () => {
    const seen: AcpApprovalRaised[] = [];
    const client = peer({ onApprovalRaised: e => seen.push(e), tamperReads: true,
      onPrompt: async ({ writer, sessionId, hook, tamper }) => {
        writer.startStep();
        writer.recordToolCall({ toolCallId: "call-1", toolName: "fs.read", dispatch: "native", parentToken: null, args: JSON.stringify({ path: "a.md" }) });
        tamper(); // The committed tail no longer authenticates when the approval is raised.
        hook(sessionId, { approvalId: "apr_1", approvalRequestId: "apprreq_1", toolCallId: "call-1" });
        writer.endStep({ stopReason: "tool_use", usage: null });
      } });
    await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const sessionId = (await client.call("session/new", { cwd: workspace, mcpServers: [] })).result!.sessionId as string;
    const answered = await client.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "one" }] });
    expect(answered.result).toBeUndefined();
    expect(seen).toEqual([]);
    expect(client.frames.some(frame => frame.method === "session/request_permission")).toBe(false);
    expect(client.frames.some(frame => frame.method === "session/update" && (frame.params?.update as { sessionUpdate?: string })?.sessionUpdate === "tool_call")).toBe(false);
  });

  it("does not advertise permission requests or commands when the launcher wired neither", async () => {
    const client = peer({ commands: false });
    const init = await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const meta = (init.result!.agentCapabilities as { _meta: Record<string, Record<string, unknown>> })._meta["dev.agentmaturity.amc"]!;
    expect(meta.permissionRequests).toBeUndefined(); expect(meta.availableCommands).toBeUndefined();
    await client.call("session/new", { cwd: workspace, mcpServers: [] });
    await new Promise(resolve => setImmediate(resolve)); await flush();
    expect(commandsUpdate(client.frames)).toEqual([]);
  });
});

type E2eFrame = { method?: string; id?: number | string; params?: { toolCall?: { toolCallId: string; title: string; kind: string }; update?: { sessionUpdate: string; toolCallId?: string; availableCommands?: { name: string }[] } }; result?: Record<string, unknown>; error?: unknown };

/** `amc init --regulated`, as an operator runs it (the signed tool subset and firewall policy workspace tools require), then `amc acp` in process. */
function regulatedAcp(options: { approveTools?: string; skills?: { workspace: string[]; home: string[] } }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-acp-e2e-")));
  const regulated = join(root, "workspace"), home = join(root, "home");
  mkdirSync(regulated); mkdirSync(home, { mode: 0o700 });
  const env = { AMC_HOME: home, AMC_VAULT_PASSPHRASE: `acp-e2e-${randomUUID()}`, AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"),
    AMC_BOOTSTRAP_OWNER_USERNAME: "acp-owner", AMC_BOOTSTRAP_OWNER_PASSWORD: "acp-owner-fixture-password", NO_COLOR: "1" };
  const init = spawnSync(process.execPath, [CLI, "init", "--regulated"], { cwd: regulated, env: { ...process.env, ...env }, encoding: "utf8" });
  expect(init.status, init.stderr).toBe(0);
  const fingerprint = /AMC_EXPECTED_MONITOR_FINGERPRINT=([a-f0-9]{64})/.exec(init.stdout)?.[1];
  expect(fingerprint).toBeDefined();
  for (const [key, value] of Object.entries({ ...env, AMC_EXPECTED_MONITOR_FINGERPRINT: fingerprint! })) vi.stubEnv(key, value);
  const skill = (dir: string, name: string): void => { mkdirSync(join(dir, name), { recursive: true }); writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} fixture\n---\nSay that ${name} ran.\n`); };
  for (const name of options.skills?.workspace ?? []) skill(join(regulated, ".amc", "skills"), name);
  for (const name of options.skills?.home ?? []) skill(join(home, "skills"), name);
  const stdin = new EventEmitter();
  const frames: E2eFrame[] = [];
  const handle = startAcpStdio({ workspace: regulated, agentId: "default", providerId: "stub", systemPrompt: "s", tools: "workspace",
    ...(options.approveTools === undefined ? {} : { approveTools: options.approveTools }),
    credentialsMode: "operator-only", credentialsHome: home, cliEntry: CLI, stdin,
    stdout: { write: bytes => { frames.push(JSON.parse(bytes.toString("utf8")) as E2eFrame); return true; } }, stderr: { write: () => true } });
  const send = (frame: Record<string, unknown>): void => { stdin.emit("data", Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", ...frame })}\n`)); };
  let next = 1;
  const settled = (id: number) => frames.find(frame => frame.id === id && ("result" in frame || "error" in frame));
  const call = async (method: string, params: unknown): Promise<E2eFrame> => {
    const id = next++; send({ id, method, params });
    await vi.waitFor(() => expect(settled(id)).toBeDefined(), { timeout: 60_000, interval: 20 });
    return settled(id)!;
  };
  return { regulated, frames, send, call, settled, nextId: () => next++,
    close: async () => { try { await handle.close(); } finally { rmSync(root, { recursive: true, force: true }); } } };
}

describe("amc acp against a regulated workspace (real gate, real skills)", () => {
  it("session/request_permission names the committed tool_call, which reaches a generic client before the request; reject_once cancels that prompt", async () => {
    const acp = regulatedAcp({ approveTools: "WRITE_HIGH" });
    try {
      await acp.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const sessionId = (await acp.call("session/new", { cwd: acp.regulated, mcpServers: [] })).result!.sessionId as string;
      const promptId = acp.nextId();
      acp.send({ id: promptId, method: "session/prompt", params: { sessionId, prompt: [{ type: "text", text: JSON.stringify({ tool: "fs.read", arguments: { path: "workspace/n.txt" } }) }] } });
      await vi.waitFor(() => expect(acp.frames.find(frame => frame.method === "session/request_permission")).toBeDefined(), { timeout: 60_000, interval: 20 });
      const request = acp.frames.find(frame => frame.method === "session/request_permission")!;
      const toolCallId = request.params!.toolCall!.toolCallId;
      expect(toolCallId).not.toMatch(/^apr_/);
      expect(request.params!.toolCall).toMatchObject({ title: "fs.read", kind: "read" });
      const announced = acp.frames.findIndex(frame => frame.method === "session/update" && frame.params?.update?.sessionUpdate === "tool_call" && frame.params.update.toolCallId === toolCallId);
      expect(announced).toBeGreaterThanOrEqual(0);
      expect(announced).toBeLessThan(acp.frames.indexOf(request));
      acp.send({ id: request.id, result: { outcome: { outcome: "selected", optionId: "reject_once" } } });
      await vi.waitFor(() => expect(acp.settled(promptId)).toBeDefined(), { timeout: 60_000, interval: 20 });
      expect(acp.settled(promptId)!.result).toMatchObject({ stopReason: "cancelled" });
    } finally { await acp.close(); }
  }, 180_000);

  it("advertises only the skills an ACP prompt can resolve, and every advertised command runs", async () => {
    // `--credentials-home` skills are not resolvable by an ACP session (agentSession.prepareSkillTurn takes no home), so they are not offered.
    const acp = regulatedAcp({ skills: { workspace: ["wsskill"], home: ["homeskill"] } });
    try {
      await acp.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
      const sessionId = (await acp.call("session/new", { cwd: acp.regulated, mcpServers: [] })).result!.sessionId as string;
      await vi.waitFor(() => expect(acp.frames.find(frame => frame.params?.update?.sessionUpdate === "available_commands_update")).toBeDefined(), { timeout: 60_000, interval: 20 });
      const commands = acp.frames.find(frame => frame.params?.update?.sessionUpdate === "available_commands_update")!.params!.update!.availableCommands!.map(command => command.name);
      expect(commands).toEqual(["wsskill"]);
      for (const name of commands) {
        const answered = await acp.call("session/prompt", { sessionId, prompt: [{ type: "text", text: `/${name} please` }] });
        expect(answered.error, name).toBeUndefined();
        expect(answered.result).toMatchObject({ stopReason: "end_turn" });
      }
      const refused = await acp.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "/homeskill please" }] });
      expect(JSON.stringify(refused.error)).toContain("no skill named");
    } finally { await acp.close(); }
  }, 180_000);
});
