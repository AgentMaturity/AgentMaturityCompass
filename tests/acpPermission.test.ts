import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAcpAgent, type AcpAgent, type AcpApprovalRaisedHook } from "../src/acp/acpAgentServer.js";
import { createAcpPermissionHandler, permissionReason, type AcpApprovalRaised } from "../src/acp/acpPermission.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import type { AgentSession } from "../src/agent/agentSession.js";
import { createApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { listApprovalDecisions } from "../src/approvals/approvalChainStore.js";
import { getApprovalInboxItem } from "../src/approvals/approvalInbox.js";
import { createSession, initUsersConfig } from "../src/auth/authApi.js";
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
  return { approvalId, approvalRequestId: created.request.approvalRequestId };
}
function reviewerToken(): string {
  const user = initUsersConfig({ workspace, username: "alice", password: "alice-fixture-password" }).owner;
  const session = createSession({ workspace, user });
  const path = join(workspace, "reviewer-session.txt");
  writeFileSync(path, session.token, { mode: 0o600 });
  return path;
}
const decisions = (approvalRequestId: string) => listApprovalDecisions({ workspace, agentId: "default", approvalRequestId });

function event(raised: { approvalId: string; approvalRequestId: string }, answer: unknown, negotiated = true) {
  const requests: unknown[] = [], cancels: string[] = [];
  const settled = new Promise<void>(done => { void done; });
  const base: AcpApprovalRaised = { sessionId: "s1", ...raised, negotiated, cancelTurn: by => cancels.push(by),
    request: async (method, params) => { requests.push({ method, params }); return typeof answer === "function" ? (answer as () => unknown)() : answer; } };
  return { event: base, requests, cancels, settled };
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
    expect(sent.params.toolCall).toMatchObject({ toolCallId: raised.approvalId, title: "fs.write", kind: "edit" });
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

  function peer(options: { onApprovalRaised?: (event: AcpApprovalRaised) => void; commands?: boolean } = {}) {
    const frames: Frame[] = [];
    let writer!: SessionService, hook: AcpApprovalRaisedHook | undefined;
    const agent = createAcpAgent({ workspace, agentId: "default", write: bytes => frames.push(JSON.parse(bytes.toString("utf8")) as Frame),
      ...(options.onApprovalRaised ? { onApprovalRaised: options.onApprovalRaised } : {}),
      ...(options.commands === false ? {} : { availableCommands: () => [{ name: "review", description: "Review the diff", input: { hint: "what to focus on" } }] }),
      sessionFactory: ({ sessionId, approvalRaised }): AgentSession => {
        hook = approvalRaised;
        writer = new SessionService(workspace);
        writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
        return { sessionId, prompt: async () => { writer.startTurn({ trigger: "user" }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
          return { ok: true, text: "", status: "idle", validation: { status: "not-requested", turn: null, configSha256: null, checks: [] } }; },
          cancel() {}, readEvents: () => writer.readEvents(),
          close: () => { try { writer.close({ reason: "completed" }); } finally { writer.disposeWithoutClosing(); } } };
      } });
    agents.push(agent); let sequence = 0;
    return { frames, get hook() { return hook; }, async call(method: string, params: unknown) {
      const id = ++sequence; agent.connection.ingest(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`));
      await vi.waitFor(() => expect(frames.find(frame => frame.id === id)).toBeDefined(), { timeout: 5000, interval: 5 });
      return frames.find(frame => frame.id === id)!;
    } };
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
      client.hook!(created.result!.sessionId as string, { approvalId: "apr_x", approvalRequestId: "apprreq_y" });
      expect(seen.at(-1)).toMatchObject({ sessionId: created.result!.sessionId, approvalId: "apr_x", approvalRequestId: "apprreq_y", negotiated });
      // The hook's request goes out as an agent-to-client JSON-RPC request on this connection.
      const aborted = new AbortController(); const pending = seen.at(-1)!.request("ping", {}, aborted.signal); aborted.abort();
      await expect(pending).rejects.toThrow(/cancelled/);
      expect(client.frames.some(frame => frame.method === "ping" && typeof frame.id === "string")).toBe(true);
    }
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
