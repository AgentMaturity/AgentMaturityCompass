import { ACP_MAX_TURN_UPDATE_BYTES } from "../src/acp/acpCommittedUpdates.js";
import { ACP_MAX_UPDATE_PARAMS_BYTES } from "../src/acp/acpRuntimeContracts.js";
import { sessionPayloadCap } from "../src/session/sessionPayloadCap.js";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAcpAgent, type AcpAgent } from "../src/acp/acpAgentServer.js";
import type { AgentPromptResult, AgentSession } from "../src/agent/agentSession.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { SessionService } from "../src/session/sessionService.js";
import type { EvidenceEvent } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * AMC-1532. AUTHORED UNEXECUTED in native-budget-admission-implementation-04.
 * A controlled AgentSession drives actual signed SessionService rows through
 * ACP's real byte protocol, authentication and projection. No provider, package,
 * budget-race, platform or full-release acceptance is implied by these fixtures.
 */
type Frame = Record<string, unknown>;
type RowView = (rows: readonly EvidenceEvent[]) => readonly EvidenceEvent[];
const agents: AcpAgent[] = [];
const directories: string[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

/** Bounded assistant blocks measured exactly as the server accounts each `session/update` frame; `fit` frames fit the turn aggregate. */
function boundedBlocks(sessionId: string): { fit: number; block: (index: number) => string } {
  const block = (index: number) => `${index}:` + "x".repeat(60_000);
  const frame = (index: number) => Buffer.byteLength(JSON.stringify({ sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: block(index) } } }), "utf8");
  let total = 0, fit = 0;
  while (total + frame(fit) <= ACP_MAX_TURN_UPDATE_BYTES) { total += frame(fit); fit++; }
  return { fit, block };
}

const success = (): AgentPromptResult => ({ ok: true, text: "fixture result is not the output source", status: "idle",
  validation: { status: "not-requested", turn: null, configSha256: null, checks: [] } });

async function harness(backend: "sqlite" | "jsonl" = "sqlite") {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "acp-failed-tail-fixture-passphrase");
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-acp-failed-tail-")));
  directories.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const sent: Frame[] = [];
  const replies = new Map<number, ReturnType<typeof deferred<Frame>>>();
  const cancellations: string[] = [];
  let writer!: SessionService;
  let pending: ReturnType<typeof deferred<AgentPromptResult>> | undefined;
  let started = deferred<void>();
  let view: RowView = rows => rows;
  let invocations = 0;
  let blockIndex = 0;
  let nextId = 0;

  const finish = (result: AgentPromptResult, rejection?: Error): void => {
    if (!pending) throw new Error("No fixture prompt is running");
    const current = pending;
    writer.endStep({ stopReason: result.ok ? "end_turn" : result.reason === "cancelled" ? "cancelled" : "error", usage: null });
    writer.endTurn(result.ok ? { reason: "complete" } : result.reason === "cancelled"
      ? { reason: "cancelled", cause: { kind: "user" } } : { reason: "error" });
    writer.sealTurn();
    pending = undefined;
    started = deferred<void>();
    if (rejection) current.reject(rejection); else current.resolve(result);
  };

  const agent = createAcpAgent({
    workspace, agentId: "default",
    write: frame => {
      for (const line of frame.toString("utf8").split("\n")) {
        if (!line) continue;
        const message = JSON.parse(line) as Frame;
        sent.push(message);
        if (typeof message.id === "number") {
          const reply = replies.get(message.id);
          if (!reply) throw new Error("Unexpected ACP response in fixture");
          replies.delete(message.id);
          reply.resolve(message);
        }
      }
    },
    sessionFactory: ({ sessionId }): AgentSession => {
      writer = new SessionService(workspace, openSessionEventStore(workspace, backend));
      writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
      return {
        sessionId,
        prompt: text => {
          if (pending) throw new Error("Overlapping fixture prompts");
          invocations++;
          blockIndex = 0;
          writer.startTurn({ trigger: "user" });
          writer.recordUserMessage(text);
          writer.startStep();
          pending = deferred<AgentPromptResult>();
          started.resolve(undefined);
          return pending.promise;
        },
        cancel: (_cause, by) => {
          cancellations.push(by);
          if (by === "acp-shutdown" && pending) finish({ ok: false, reason: "cancelled" });
        },
        readEvents: () => view(writer.readEvents()),
        close: () => { try { writer.close({ reason: "completed" }); } finally { writer.disposeWithoutClosing(); } }
      };
    }
  });
  agents.push(agent);

  const send = (message: Frame): void => agent.connection.ingest(Buffer.from(`${JSON.stringify(message)}\n`, "utf8"));
  const request = (method: string, params: Frame): Promise<Frame> => {
    const id = nextId++;
    const reply = deferred<Frame>();
    replies.set(id, reply);
    send({ jsonrpc: "2.0", id, method, params });
    return reply.promise;
  };
  const initialized = await request("initialize", { protocolVersion: 1, clientCapabilities: {} });
  expect(initialized.error).toBeUndefined();
  const opened = await request("session/new", { cwd: workspace, mcpServers: [] });
  expect(opened.error).toBeUndefined();
  const sessionId = (opened.result as { sessionId: string }).sessionId;
  const promptParams = (text: string) => ({ sessionId, prompt: [{ type: "text", text }] });

  return {
    sent, cancellations, sessionId, workspace,
    get invocations() { return invocations; },
    get texts(): string[] {
      return sent.flatMap(frame => {
        if (frame.method !== "session/update") return [];
        const params = frame.params as { update: { sessionUpdate: string; content?: { text?: string } } };
        return params.update.sessionUpdate === "agent_message_chunk" && typeof params.update.content?.text === "string"
          ? [params.update.content.text] : [];
      });
    },
    async begin(text: string) {
      const ready = started.promise;
      const reply = request("session/prompt", promptParams(text));
      await Promise.race([ready, reply.then(() => { throw new Error("ACP refused before starting the expected fixture prompt"); })]);
      return { reply };
    },
    submit: (text: string) => request("session/prompt", promptParams(text)),
    commit: (text: string) => {
      if (!pending) throw new Error("Cannot commit outside a fixture prompt");
      writer.recordAssistantBlock({ blockIndex: blockIndex++, blockKind: "text", stopReason: null, content: text });
    },
    finish,
    reject: () => finish({ ok: false, reason: "fixture prompt rejected" }, new Error("fixture prompt rejected")),
    cancel: () => send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } }),
    view: (next: RowView) => { view = next; }
  };
}

afterEach(async () => {
  try { for (const agent of agents.splice(0)) await agent.close(); }
  finally {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});

describe("AMC-1532 failed ACP prompt tails never become a later prompt's output", () => {
  it.each(["sqlite", "jsonl"] as const)("retires a signed failed tail without rendering it on %s", async backend => {
    const h = await harness(backend);
    const failed = await h.begin("first prompt");
    h.commit("withheld failed output");
    h.finish({ ok: false, reason: "the turn failed" });
    expect((await failed.reply).error).toMatchObject({ code: -32603 });
    expect(h.texts).toEqual([]);

    const next = await h.begin("second prompt");
    h.commit("only the new answer");
    h.finish(success());
    expect((await next.reply).result).toMatchObject({ stopReason: "end_turn" });
    expect(h.texts).toEqual(["only the new answer"]);
    expect(h.invocations).toBe(2);
  });

  it("retires a signed tail when the prompt promise rejects instead of returning ok:false", async () => {
    const h = await harness();
    const failed = await h.begin("reject after recording");
    h.commit("withheld rejected output");
    h.reject();
    expect((await failed.reply).error).toMatchObject({ code: -32603 });
    expect(h.texts).toEqual([]);
    const next = await h.begin("after rejection");
    h.commit("fresh after rejection"); h.finish(success());
    expect((await next.reply).result).toMatchObject({ stopReason: "end_turn" });
    expect(h.texts).toEqual(["fresh after rejection"]);
  });

  it("keeps already delivered committed blocks once and withholds only the remaining failed tail", async () => {
    const h = await harness();
    const failed = await h.begin("partially delivered prompt");
    h.commit("live committed block");
    await vi.waitFor(() => expect(h.texts).toEqual(["live committed block"]), { timeout: 2000 });
    h.commit("withheld terminal block"); h.finish({ ok: false, reason: "later step failed" });
    expect((await failed.reply).error).toMatchObject({ code: -32603 });
    expect(h.texts).toEqual(["live committed block"]);
    const next = await h.begin("next prompt");
    h.commit("new prompt block"); h.finish(success());
    await next.reply;
    expect(h.texts).toEqual(["live committed block", "new prompt block"]);
  });

  it.each(["returned failure", "rejection", "success"])("refuses reuse after forged terminal rows on %s, even if the view later looks valid", async ending => {
    const h = await harness();
    const first = await h.begin("untrusted final row");
    h.commit("must not be emitted");
    h.view(rows => rows.map(row => row.event_type === "assistant/block" ? { ...row, writer_sig: "not-a-monitor-signature" } : row));
    if (ending === "rejection") h.reject();
    else h.finish(ending === "success" ? success() : { ok: false, reason: "fixture failure" });
    expect((await first.reply).error).toMatchObject({ code: -32603 });
    expect(h.texts).toEqual([]);
    h.view(rows => rows);
    expect((await h.submit("must not execute")).error).toMatchObject({ code: -32603, message: expect.stringContaining("unusable") });
    expect(h.invocations).toBe(1);
    expect(h.texts).toEqual([]);
  });

  it("retains a polling authentication failure across the next prompt admission", async () => {
    const h = await harness();
    const first = await h.begin("poll a bad row");
    h.commit("untrusted polled content");
    h.view(rows => rows.map(row => row.event_type === "assistant/block" ? { ...row, writer_sig: "unsigned" } : row));
    await vi.waitFor(() => expect(h.cancellations).toContain("acp-committed-update-failure"), { timeout: 2000 });
    h.finish({ ok: false, reason: "projection cancelled the prompt" });
    expect((await first.reply).error).toMatchObject({ code: -32603 });
    h.view(rows => rows);
    expect((await h.submit("must not spend after bad projection")).error).toMatchObject({ code: -32603 });
    expect(h.invocations).toBe(1);
    expect(h.texts).toEqual([]);
  });

  it("does not reset an exceeded output bound by starting another prompt", async () => {
    const h = await harness();
    // One signed row cannot reach the per-frame bound: the signed per-event cap is smaller, and the ledger refuses
    // above it. The bound a legitimate stream of bounded blocks can exceed is the turn aggregate.
    expect(sessionPayloadCap(h.workspace)).toBeLessThan(ACP_MAX_UPDATE_PARAMS_BYTES);
    const first = await h.begin("oversized committed output");
    const { fit, block } = boundedBlocks(h.sessionId);
    for (let index = 0; index <= fit; index++) h.commit(block(index));
    h.finish(success());
    expect((await first.reply).error).toMatchObject({ code: -32603 });
    expect(h.texts).toHaveLength(fit);
    expect((await h.submit("next prompt cannot reset the failure")).error).toMatchObject({ code: -32603, message: expect.stringContaining("unusable") });
    expect(h.invocations).toBe(1);
    expect(h.texts).toHaveLength(fit);
  });

  it("keeps a cumulative output-bound failure sticky after some signed updates were emitted", async () => {
    const h = await harness("jsonl");
    const first = await h.begin("too much output across bounded frames");
    // Each frame fits within the signed per-event cap; the frame after `fit` exceeds the eight-MiB turn aggregate.
    const { fit, block } = boundedBlocks(h.sessionId);
    for (let index = 0; index <= fit; index++) h.commit(block(index));
    h.finish(success());
    expect((await first.reply).error).toMatchObject({ code: -32603 });
    expect(h.texts).toHaveLength(fit);
    expect((await h.submit("cannot reset cumulative output admission")).error).toMatchObject({ code: -32603, message: expect.stringContaining("unusable") });
    expect(h.invocations).toBe(1);
    expect(h.texts).toHaveLength(fit);
  });

  it("preserves cancellation output and never replays it into the following prompt", async () => {
    const h = await harness();
    const cancelled = await h.begin("cancel this prompt");
    h.cancel();
    await vi.waitFor(() => expect(h.cancellations).toContain("acp-client"), { timeout: 2000 });
    h.commit("signed output before cancellation settled"); h.finish({ ok: false, reason: "cancelled" });
    expect((await cancelled.reply).result).toMatchObject({ stopReason: "cancelled" });
    expect(h.texts).toEqual(["signed output before cancellation settled"]);
    const next = await h.begin("new prompt after cancellation");
    h.commit("new answer"); h.finish(success());
    await next.reply;
    expect(h.texts).toEqual(["signed output before cancellation settled", "new answer"]);
  });
});
