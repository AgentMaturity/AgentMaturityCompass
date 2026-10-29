import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAcpAgent, type AcpAgent } from "../src/acp/acpAgentServer.js";
import { projectAcpSessionPageState } from "../src/acp/acpSessionPageState.js";
import type { AgentSession } from "../src/agent/agentSession.js";
import { extractEnvelope, SESSION_ENVELOPE_META_KEY } from "../src/session/sessionTypes.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";

const AMC = "dev.agentmaturity.amc";
type Frame = { id?: number; result?: Record<string, unknown>; error?: unknown };
let workspace: string;
const agents: AcpAgent[] = [], writers: SessionService[] = [];
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp20-completion-pin");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp20-completion-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(async () => {
  for (const agent of agents.splice(0)) await agent.close();
  for (const writer of writers.splice(0)) writer.disposeWithoutClosing();
  rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs();
});
function sealedTurn(writer: SessionService, text: string) {
  writer.startTurn({ trigger: "user" }); writer.startStep();
  writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: text });
  writer.endStep({ stopReason: "end_turn", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
}
function opened() {
  const writer = new SessionService(workspace); writers.push(writer);
  writer.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  sealedTurn(writer, "baseline"); return writer;
}
function reference(writer: SessionService) {
  const rows = writer.readEvents(), row = rows.filter(row => row.event_type === "turn/seal").at(-1)!;
  const envelope = extractEnvelope(row.meta_json)!;
  return { turn: envelope.turn, seq: envelope.seq, eventId: row.id, eventHash: row.event_hash };
}
function peer(produceNewSeal: boolean) {
  const frames: Frame[] = []; let writer!: SessionService;
  const agent = createAcpAgent({ workspace, agentId: "default", write: bytes => frames.push(JSON.parse(bytes.toString("utf8")) as Frame),
    sessionFactory: ({ sessionId }): AgentSession => {
      writer = new SessionService(workspace); writers.push(writer);
      writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
      sealedTurn(writer, "pre-prompt baseline");
      return { sessionId, prompt: async () => {
        if (produceNewSeal) sealedTurn(writer, "new committed answer");
        return { ok: true, text: "", status: "idle", validation: { status: "not-requested", turn: null, configSha256: null, checks: [] } };
      }, cancel() {}, readEvents: () => writer.readEvents(),
      close: () => { writer.close({ reason: "completed" }); } };
    } });
  agents.push(agent); let sequence = 0;
  return { get writer() { return writer; }, async call(method: string, params: unknown) {
    const id = ++sequence; agent.connection.ingest(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`));
    await vi.waitFor(() => expect(frames.find(frame => frame.id === id)).toBeDefined(), { timeout: 5000, interval: 5 });
    return frames.find(frame => frame.id === id)!;
  } };
}

describe("WP20 authenticated completion pin", () => {
  it("advertises and returns the new prompt's exact signed turn seal, matching the fixed page snapshot", async () => {
    const client = peer(true);
    const init = await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((init.result!.agentCapabilities as { _meta: Record<string, Record<string, unknown>> })._meta[AMC]!.committedTurn)
      .toBe("amc-committed-turn-v1");
    const sessionId = (await client.call("session/new", { cwd: workspace, mcpServers: [] })).result!.sessionId as string;
    const reply = await client.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "task" }] });
    expect(reply.error).toBeUndefined();
    expect((reply.result!._meta as Record<string, Record<string, unknown>>)[AMC]!.committedTurn).toEqual(reference(client.writer));
    expect(reference(client.writer).turn).toBe(2);
    const page = await client.call("_amc/session/events", { sessionId });
    expect(page.error).toBeUndefined();
    expect((page.result!.state as { turn: { lastSeal: unknown } }).turn.lastSeal).toEqual(reference(client.writer));
  });

  it("does not present a pre-prompt seal as this prompt's completion", async () => {
    const client = peer(false);
    await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const sessionId = (await client.call("session/new", { cwd: workspace, mcpServers: [] })).result!.sessionId as string;
    const reply = await client.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "no new committed turn" }] });
    expect(reply.error).toBeUndefined();
    expect((reply.result!._meta as Record<string, Record<string, unknown>> | undefined)?.[AMC]?.committedTurn ?? null).toBeNull();
  });

  it("resets lastSeal on a new turn and keeps an ended but unsealed prefix explicitly unsealed", () => {
    const writer = opened();
    expect(projectAcpSessionPageState(workspace, writer.sessionId, writer.readEvents()).turn.lastSeal).toEqual(reference(writer));
    writer.startTurn({ trigger: "user" });
    expect(projectAcpSessionPageState(workspace, writer.sessionId, writer.readEvents()).turn.lastSeal).toBeNull();
    writer.endTurn({ reason: "complete" });
    expect(projectAcpSessionPageState(workspace, writer.sessionId, writer.readEvents()).turn.lastSeal).toBeNull();
  });

  it.each(["start-turn", "seal-turn", "seal-envelope", "seal-sequence", "missing-end", "end-turn", "end-turn-prefix"])("refuses an inconsistent completion reference: %s", corruption => {
    const writer = opened();
    const rows = writer.readEvents().filter(row => (corruption !== "missing-end" || row.event_type !== "turn/end")
      && (corruption !== "end-turn-prefix" || row.event_type !== "turn/seal")).map(row => {
      const target = corruption === "start-turn" ? "turn/start" : corruption.startsWith("end-turn") ? "turn/end" : "turn/seal";
      if (row.event_type !== target) return row;
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      const envelope = meta[SESSION_ENVELOPE_META_KEY] as Record<string, unknown>;
      if (corruption === "seal-turn" || corruption === "start-turn" || corruption.startsWith("end-turn")) meta.turn = 999;
      if (corruption === "seal-envelope") envelope.turn = 999;
      if (corruption === "seal-sequence") envelope.seq = 999;
      return { ...row, meta_json: JSON.stringify(meta) };
    });
    expect(() => projectAcpSessionPageState(workspace, writer.sessionId, rows)).toThrow(/faithfully projected/);
  });
});
