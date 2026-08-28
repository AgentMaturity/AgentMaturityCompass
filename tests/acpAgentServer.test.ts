import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { createAcpAgent, type AcpAgent } from "../src/acp/acpAgentServer.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import type { AgentPromptResult, AgentSession } from "../src/agent/agentSession.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * The ACP agent, driven the way a client drives it: bytes in, frames out.
 *
 * The AgentSession is a controllable stub here rather than a real driver. That
 * is deliberate — these tests are about the PROTOCOL (handshake order, refusals,
 * cancellation while a prompt is in flight, what reaches the wire), and a real
 * model turn cannot be paused mid-flight to deliver a cancel. The real driver is
 * covered by tests/agentSessionMultiTurn.test.ts.
 *
 * The last test is the one that keeps the rest honest: every frame this agent
 * emits is validated against the VENDORED SCHEMA. A hand-built response that
 * merely looks right would pass every other assertion in this file.
 */

const dirs: string[] = [];
const agents: AcpAgent[] = [];

interface Harness {
  readonly agent: AcpAgent;
  readonly sent: Record<string, unknown>[];
  send(message: Record<string, unknown>): void;
  /** Resolve the pending stub prompt. */
  finish(result: AgentPromptResult): void;
  readonly cancels: string[];
}

/** A session whose prompt resolves only when the test says so. */
function stubSession(cancels: string[], pending: { resolve?: (r: AgentPromptResult) => void }): AgentSession {
  return {
    sessionId: "stub",
    prompt: () => new Promise<AgentPromptResult>((resolve) => { pending.resolve = resolve; }),
    cancel: (_cause, by) => { cancels.push(by); },
    readEvents: (): readonly EvidenceEvent[] => [],
    close: () => undefined
  };
}

function harness(): Harness {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-acp-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });

  const sent: Record<string, unknown>[] = [];
  const cancels: string[] = [];
  const pending: { resolve?: (r: AgentPromptResult) => void } = {};

  const agent = createAcpAgent({
    workspace: dir,
    agentId: "default",
    write: (frame) => {
      for (const line of frame.toString("utf8").split("\n")) {
        if (line.length > 0) sent.push(JSON.parse(line) as Record<string, unknown>);
      }
    },
    sessionFactory: () => stubSession(cancels, pending)
  });
  agents.push(agent);

  return {
    agent,
    sent,
    cancels,
    send: (message) => agent.connection.ingest(Buffer.from(`${JSON.stringify(message)}\n`, "utf8")),
    finish: (result) => pending.resolve?.(result)
  };
}

/** Let the launched (never awaited) handlers settle. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

const replyTo = (sent: readonly Record<string, unknown>[], id: unknown) =>
  sent.find((m) => m["id"] === id);
const errorOf = (m: Record<string, unknown> | undefined) => m?.["error"] as { code: number; message: string };
const resultOf = (m: Record<string, unknown> | undefined) => m?.["result"] as Record<string, unknown>;

async function initialized(): Promise<Harness> {
  const h = harness();
  h.send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: 1, clientCapabilities: {} } });
  await settle();
  return h;
}

afterEach(() => {
  for (const agent of agents.splice(0)) agent.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the handshake", () => {
  it("declares only what it can honour", async () => {
    const h = await initialized();
    const result = resultOf(replyTo(h.sent, 0));
    expect(result["protocolVersion"]).toBe(1);

    const capabilities = result["agentCapabilities"] as Record<string, unknown>;
    // False rather than absent, because there is no path to re-attach a driver
    // to a sealed session. Claiming it would be the undeclarable kind of lie.
    expect(capabilities["loadSession"]).toBe(false);
    // Absent is normatively unsupported: none of these has a handler.
    for (const never of ["sessionCapabilities", "mcpCapabilities"]) {
      expect(result[never]).toBeUndefined();
    }
    expect(result["authMethods"]).toEqual([]);
  });

  it("refuses session work before initialize, and says which problem it is", async () => {
    const h = harness();
    h.send({ jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: "/tmp", mcpServers: [] } });
    await settle();
    // -32002, not -32601. The method exists; reporting method-not-found would
    // send a client hunting a capability problem it does not have.
    expect(errorOf(replyTo(h.sent, 1)).code).toBe(-32002);
  });

  it("answers an unimplemented method rather than dropping it", async () => {
    const h = await initialized();
    h.send({ jsonrpc: "2.0", id: 1, method: "session/load", params: {} });
    await settle();
    expect(errorOf(replyTo(h.sent, 1)).code).toBe(-32601);
  });
});

describe("session/new", () => {
  it("opens a session", async () => {
    const h = await initialized();
    h.send({ jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: "/tmp", mcpServers: [] } });
    await settle();
    expect(resultOf(replyTo(h.sent, 1))["sessionId"]).toBeTypeOf("string");
  });

  it("refuses MCP servers loudly instead of accepting and ignoring them", async () => {
    const h = await initialized();
    h.send({
      jsonrpc: "2.0", id: 1, method: "session/new",
      params: { cwd: "/tmp", mcpServers: [{ name: "x", command: "y", args: [], env: [] }] }
    });
    await settle();
    const error = errorOf(replyTo(h.sent, 1));
    expect(error.code).toBe(-32602);
    // Silently ignoring the array is the dishonest form and the easy one to
    // write by accident: the client would believe its servers were connected.
    expect(error.message).toContain("MCP server");
  });

  it("refuses params the schema rejects", async () => {
    const h = await initialized();
    // `cwd` is required by the vendored schema.
    h.send({ jsonrpc: "2.0", id: 1, method: "session/new", params: { mcpServers: [] } });
    await settle();
    expect(errorOf(replyTo(h.sent, 1)).code).toBe(-32602);
    expect(errorOf(replyTo(h.sent, 1)).message).toContain("cwd");
  });
});

describe("session/prompt and cancellation", () => {
  async function promptingHarness(): Promise<{ h: Harness; sessionId: string }> {
    const h = await initialized();
    h.send({ jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: "/tmp", mcpServers: [] } });
    await settle();
    return { h, sessionId: resultOf(replyTo(h.sent, 1))["sessionId"] as string };
  }

  it("returns a stop reason when the turn completes", async () => {
    const { h, sessionId } = await promptingHarness();
    h.send({
      jsonrpc: "2.0", id: 2, method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "hello" }] }
    });
    await settle();
    h.finish({ ok: true, text: "hi", status: "idle" });
    await settle();
    expect(resultOf(replyTo(h.sent, 2))["stopReason"]).toBe("end_turn");
  });

  it("processes a cancel WHILE the prompt is still running", async () => {
    const { h, sessionId } = await promptingHarness();
    h.send({
      jsonrpc: "2.0", id: 2, method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "long" }] }
    });
    await settle();
    expect(replyTo(h.sent, 2)).toBeUndefined();

    // The whole reason nothing on the read path is awaited. If reading waited on
    // the handler, this could not arrive until the prompt it cancels finished.
    h.send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
    await settle();
    expect(h.cancels).toEqual(["acp-client"]);

    // The request is still answered. Dropping it would leave the client waiting
    // forever, which is the failure this wire exists to avoid.
    h.finish({ ok: false, reason: "cancelled" });
    await settle();
    expect(resultOf(replyTo(h.sent, 2))["stopReason"]).toBe("cancelled");
  });

  it("ignores a cancel for a session with nothing running", async () => {
    const { h, sessionId } = await promptingHarness();
    h.send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
    await settle();
    // Cancelling pre-emptively would kill a turn the client never asked to stop.
    expect(h.cancels).toEqual([]);
  });

  it("refuses a second prompt on a session already running one", async () => {
    const { h, sessionId } = await promptingHarness();
    const body = { sessionId, prompt: [{ type: "text", text: "x" }] };
    h.send({ jsonrpc: "2.0", id: 2, method: "session/prompt", params: body });
    await settle();
    h.send({ jsonrpc: "2.0", id: 3, method: "session/prompt", params: body });
    await settle();
    expect(errorOf(replyTo(h.sent, 3)).code).toBe(-32602);
  });

  it("refuses a prompt carrying nothing it can read", async () => {
    const { h, sessionId } = await promptingHarness();
    h.send({
      jsonrpc: "2.0", id: 2, method: "session/prompt",
      params: { sessionId, prompt: [{ type: "image", data: "AA==", mimeType: "image/png" }] }
    });
    await settle();
    // `promptCapabilities.image` is false, so dropping the block is what the
    // handshake promised -- but answering "end_turn" over an empty prompt would
    // tell the client the agent considered something it never saw.
    expect(errorOf(replyTo(h.sent, 2)).code).toBe(-32602);
  });
});

describe("the frames it emits", () => {
  it("validates every response against the vendored schema", async () => {
    const { h, sessionId } = await (async () => {
      const started = await initialized();
      started.send({ jsonrpc: "2.0", id: 1, method: "session/new", params: { cwd: "/tmp", mcpServers: [] } });
      await settle();
      return { h: started, sessionId: resultOf(replyTo(started.sent, 1))["sessionId"] as string };
    })();
    h.send({
      jsonrpc: "2.0", id: 2, method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "hello" }] }
    });
    await settle();
    h.finish({ ok: true, text: "hi", status: "idle" });
    await settle();

    // The test that keeps the others honest: a hand-built response that merely
    // looked right would satisfy every assertion above.
    const checks: ReadonlyArray<readonly [unknown, string]> = [
      [resultOf(replyTo(h.sent, 0)), "InitializeResponse"],
      [resultOf(replyTo(h.sent, 1)), "NewSessionResponse"],
      [resultOf(replyTo(h.sent, 2)), "PromptResponse"]
    ];
    for (const [value, shape] of checks) {
      const check = await checkAcpDefinition(shape, value);
      expect(check.ok, `${shape}: ${check.ok ? "" : check.reason}`).toBe(true);
    }
  });
});
