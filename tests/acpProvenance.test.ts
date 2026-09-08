import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNSIGNED } from "../src/agent/runReport.js";
import { createAcpAgent, type AcpAgent } from "../src/acp/acpAgentServer.js";
import { projectSessionUpdates } from "../src/acp/acpProjection.js";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import type { AgentPromptResult, AgentSession } from "../src/agent/agentSession.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * Three defects found by scoping the Python client against the running server.
 *
 * All three were shipped green, and all three were invisible for the same
 * reason: nothing in the suite produced a row with no provenance, so the guard
 * that was supposed to catch one was never executed.
 */

const dirs: string[] = [];
const agents: AcpAgent[] = [];

function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "acp-provenance-passphrase");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-acpprov-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}

/** A genuinely signed ledger row, with controlled corruption applied only afterward. */
function row(dir: string, overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  const writer = new SessionService(dir);
  try {
    writer.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
    writer.startTurn({ trigger: "user" }); writer.startStep();
    const ref = writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: "the model's words" });
    const recorded = writer.readEvents().find(event => event.id === ref.eventId)!;
    writer.endStep({ stopReason: "end_turn", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn(); writer.close({ reason: "completed" });
    return { ...recorded, ...overrides };
  } finally { writer.disposeWithoutClosing(); }
}

interface Harness {
  readonly sent: Record<string, unknown>[];
  readonly workspace: string;
  send(message: Record<string, unknown>): void;
  finish(result: AgentPromptResult): void;
  commitContent(): void;
  readonly log: string[];
}

function harness(dir: string, withContent = false, mutate?: (events: readonly EvidenceEvent[]) => readonly EvidenceEvent[]): Harness {
  const sent: Record<string, unknown>[] = [];
  const log: string[] = [];
  let finish = (_result: AgentPromptResult): void => {};
  let commitContent = (): void => {};
  const agent = createAcpAgent({
    workspace: dir,
    agentId: "default",
    write: (frame) => {
      for (const line of frame.toString("utf8").split("\n")) {
        if (line.length > 0) sent.push(JSON.parse(line) as Record<string, unknown>);
      }
    },
    sessionFactory: ({ sessionId }) => {
      const writer = new SessionService(dir);
      writer.open({ sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
      let running = false;
      let contentCommitted = false;
      commitContent = () => {
        if (!running || !withContent || contentCommitted) return;
        writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: null, content: "the model's words" });
        contentCommitted = true;
      };
      const session: AgentSession = {
        sessionId,
        prompt: () => new Promise<AgentPromptResult>(resolve => {
          writer.startTurn({ trigger: "user" }); writer.startStep(); running = true; contentCommitted = false;
          finish = result => {
            if (!running) return;
            // Commit immediately before settlement. The failure test then has
            // an authentic unflushed tail, not a row pretending to be signed.
            commitContent();
            writer.endStep({ stopReason: result.ok ? "end_turn" : result.reason === "cancelled" ? "cancelled" : "error", usage: null });
            writer.endTurn(result.ok ? { reason: "complete" } : result.reason === "cancelled"
              ? { reason: "cancelled", cause: { kind: "user" } } : { reason: "error" });
            writer.sealTurn(); running = false; resolve(result);
          };
        }),
        cancel: (_cause, by) => { if (by === "acp-shutdown") finish({ ok: false, reason: "cancelled" }); },
        readEvents: () => { const events = writer.readEvents(); return mutate ? mutate(events) : events; },
        close: () => { try { writer.close({ reason: "completed" }); } finally { writer.disposeWithoutClosing(); } }
      };
      return session;
    },
    log: message => log.push(message)
  });
  agents.push(agent);
  return { sent, log, workspace: dir,
    send: message => agent.connection.ingest(Buffer.from(`${JSON.stringify(message)}\n`, "utf8")),
    finish: result => finish(result), commitContent: () => commitContent() };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
const replyTo = (sent: readonly Record<string, unknown>[], id: unknown) => sent.find((m) => m["id"] === id);

async function promptingHarness(withContent = false, mutate?: (events: readonly EvidenceEvent[]) => readonly EvidenceEvent[]): Promise<{ h: Harness; sessionId: string }> {
  const h = harness(workspace(), withContent, mutate);
  h.send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } });
  await settle();
  h.send({ jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: h.workspace, mcpServers: [] } });
  await settle();
  const sessionId = (replyTo(h.sent, 1)?.["result"] as Record<string, unknown>)["sessionId"] as string;
  h.send({
    jsonrpc: "2.0", id: 2, method: "session/prompt",
    params: { sessionId, prompt: [{ type: "text", text: "hello" }] }
  });
  await settle();
  return { h, sessionId };
}

afterEach(async () => {
  for (const agent of agents.splice(0)) await agent.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("the provenance guard actually fires", () => {
  it("skips a row whose signature is the ledger's unsigned marker", () => {
    const dir = workspace();
    // The exact string `Ledger.signMonitorDigest` writes with AMC_NO_SIGN=1.
    // The projection declared its own uppercase "UNSIGNED", so this comparison
    // matched nothing and every unprovenanced row was projected to the client.
    expect(UNSIGNED).toBe("unsigned");

    const projected = projectSessionUpdates(dir, [row(dir, { writer_sig: UNSIGNED })], 0);
    expect(projected.unsigned).toBe(1);
    expect(projected.updates).toEqual([]);
  });

  it("still projects a row that carries a real signature", () => {
    const dir = workspace();
    // Non-vacuity: a guard that rejected everything would pass the test above.
    const projected = projectSessionUpdates(dir, [row(dir)], 0);
    expect(projected.unsigned).toBe(0);
    expect(projected.updates).toHaveLength(1);
  });

  it("refuses payload bytes changed after their signed digest was committed", () => {
    const dir = workspace();
    const altered = row(dir, { payload_inline: "forged replacement", payload_path: null });
    expect(() => projectSessionUpdates(dir, [altered], 0)).toThrow(/committed digest/);
  });
});

describe("a failed turn sends no content", () => {
  it("refuses before flushing, not after", async () => {
    // The rows are signed and would project fine; the TURN is what failed.
    const { h } = await promptingHarness(true);
    h.finish({ ok: false, reason: "session wrote 23 unsigned row(s); its output has no provenance" });
    await settle();

    const error = replyTo(h.sent, 2)?.["error"] as { code: number };
    expect(error.code).toBe(-32603);
    // The decisive assertion. Flushing first meant a client rendered the model's
    // words as the agent's own and was told afterwards they had no provenance.
    // There is no unsend on a notification.
    expect(h.sent.filter((m) => m["method"] === "session/update")).toEqual([]);
  });

  it("still sends content for a turn that succeeded", async () => {
    const { h } = await promptingHarness(true);
    h.finish({ ok: true, text: "hi", status: "idle" });
    await settle();
    expect(h.sent.filter((m) => m["method"] === "session/update")).toHaveLength(1);
  });

  it("does not emit an apparently successful tail whose signature was forged", async () => {
    const { h } = await promptingHarness(true, events => events.map(event => event.event_type === "assistant/block"
      ? { ...event, writer_sig: "not-a-monitor-signature" } : event));
    h.finish({ ok: true, text: "untrusted claim of success", status: "idle" });
    await settle();
    expect(replyTo(h.sent, 2)?.["error"]).toMatchObject({ code: -32603 });
    expect(h.sent.filter(message => message["method"] === "session/update")).toEqual([]);
  });

  it("sends content for a CANCELLED turn, which also reports ok:false", async () => {
    const { h, sessionId } = await promptingHarness(true);
    h.commitContent();
    h.send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
    await settle();
    h.finish({ ok: false, reason: "cancelled" });
    await settle();
    // A cancel outranks the failure it causes: ACP mandates `cancelled`, and the
    // words produced before the cancel were signed, so they are not withheld.
    expect((replyTo(h.sent, 2)?.["result"] as Record<string, unknown>)["stopReason"]).toBe("cancelled");
    expect(h.sent.filter((m) => m["method"] === "session/update")).toHaveLength(1);
  });
});

describe("an internal fault is diagnosable", () => {
  it("logs the reason it refuses to send to the peer", async () => {
    const dir = workspace();
    const h = harness(dir);
    h.send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } });
    await settle();
    // A handler that throws something unplanned. `toAcpError` deliberately drops
    // the message before it reaches the peer -- which left a missing vault
    // passphrase reaching a client as "the method failed" with nothing on
    // stderr, undiagnosable from either side.
    h.send({ jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: h.workspace, mcpServers: [] } });
    await settle();
    h.send({
      jsonrpc: "2.0", id: 2, method: "session/prompt",
      params: { sessionId: "no-such-session", prompt: [{ type: "text", text: "x" }] }
    });
    await settle();

    // A deliberate refusal keeps its message and is NOT logged as a fault.
    const error = replyTo(h.sent, 2)?.["error"] as { code: number; message: string };
    expect(error.code).toBe(-32602);
    expect(h.log.some((line) => line.includes("session/prompt failed"))).toBe(false);
  });
});
