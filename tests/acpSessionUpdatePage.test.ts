import { mkdtempSync, realpathSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as payloadReader from "../src/session/eventPayload.js";
import { readAcpSessionUpdatePage } from "../src/acp/acpSessionUpdatePage.js";
import { createAcpAgent, type AcpAgent } from "../src/acp/acpAgentServer.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { orderedParts } from "./fixtures/nativeOrderedImageHarness.js";
import { SessionService } from "../src/session/sessionService.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { initWorkspace } from "../src/workspace.js";

type Frame = { id?: number; result?: Record<string, unknown>; error?: { code: number; message: string; data?: unknown } };
let workspace: string;
const agents: AcpAgent[] = [];
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp20-acp-page-fixture");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp20-page-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(async () => {
  for (const agent of agents.splice(0)) await agent.close();
  rmSync(workspace, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
function recordedSession(sessionId: string, agentId = "default", blocks = 1) {
  const writer = new SessionService(workspace);
  writer.open({ sessionId, agentId, harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  writer.startTurn({ trigger: "user" }); writer.recordUserMessage("User fixture."); writer.startStep();
  for (let blockIndex = 0; blockIndex < blocks; blockIndex++) {
    writer.recordAssistantBlock({ blockIndex, blockKind: "text", stopReason: "end_turn", content: blocks === 1 ? "Committed answer." : "x".repeat(30_000) });
  }
  writer.endStep({ stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 2, cacheRead: null, cacheWrite: null } });
  writer.endTurn({ reason: "complete" }); writer.sealTurn(); writer.close({ reason: "completed" });
  const rows = readNativeSessionEvents(workspace, sessionId);
  writer.disposeWithoutClosing();
  return rows;
}
function recordedImage(sessionId: string, size: number): void {
    const writer = new SessionService(workspace);
    writer.open({ sessionId: sessionId, agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
    writer.recordSystemPrompt("Image fixture."); writer.startTurn({ trigger: "user" }); writer.startStep();
    const image = Buffer.alloc(size, 0x61);
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=", "base64").copy(image);
    writer.recordUserAttachment({ filename: "large.png", content: image, kind: "image", mimeType: "image/png" });
    writer.endStep({ stopReason: "end_turn", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn(); writer.close({ reason: "completed" });
}
function peer(agentId = "default") {
  const frames: Frame[] = [];
  const factory = vi.fn(() => { throw new Error("A page read cannot acquire a session writer"); });
  const agent = createAcpAgent({ workspace, agentId, sessionFactory: factory,
    write: bytes => frames.push(JSON.parse(bytes.toString("utf8")) as Frame) });
  agents.push(agent);
  let sequence = 0;
  return { factory, async call(method: string, params: unknown): Promise<Frame> {
    const id = ++sequence;
    agent.connection.ingest(Buffer.from(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`));
    await vi.waitFor(() => expect(frames.find(frame => frame.id === id)).toBeDefined(), { timeout: 5000, interval: 5 });
    return frames.find(frame => frame.id === id)!;
  } };
}
async function ready(agentId = "default") {
  const client = peer(agentId);
  const initialized = await client.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
  expect(initialized.error).toBeUndefined();
  return { ...client, initialized };
}

describe("WP20 read-only ACP committed pages", () => {
  it("advertises a bounded committed page contract and reads sealed history without loading a writer", async () => {
    const rows = recordedSession("committed");
    const client = await ready();
    const capabilities = client.initialized.result!.agentCapabilities as { _meta: Record<string, Record<string, unknown>> };
    expect(capabilities._meta["dev.agentmaturity.amc"]!.sessionEventPage).toBe("amc-session-event-page-v1");
    const read = await client.call("_amc/session/events", { sessionId: "committed", limit: 2 });
    expect(read.error).toBeUndefined();
    expect(read.result).toMatchObject({ format: "amc-session-event-page-v1", sessionId: "committed", agentId: "default", committed: true,
      firstSeq: 0, nextSeq: 2, headSeq: rows.length - 1, headEventHash: rows[rows.length - 1]!.event_hash, updates: [] });
    expect(read.result!.state).toMatchObject({ validation: { status: "not-requested" }, usage: { status: "unavailable" },
      turn: { number: 1, lastEnd: { reason: "complete" } }, approvals: { pending: 0 }, toolOutcomes: { unknown: 0 } });
    expect(typeof read.result!.nextCursor).toBe("string");
    expect(read.result!.events).toBeUndefined();
    const updates: Record<string, unknown>[] = [];
    let page = read.result!;
    while (page.nextCursor !== null) {
      const next = await client.call("_amc/session/events", { sessionId: "committed", cursor: page.nextCursor, limit: 2 });
      expect(next.error).toBeUndefined(); page = next.result!;
      updates.push(...page.updates as Record<string, unknown>[]);
    }
    expect(updates.filter(row => (row.update as { sessionUpdate: string }).sessionUpdate === "agent_message_chunk"))
      .toEqual([expect.objectContaining({ seq: expect.any(Number), eventId: expect.any(String), eventHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Committed answer." } } })]);
    expect(client.factory).not.toHaveBeenCalled();
  });

  it("requires initialization and refuses malformed bounds and cursor substitutions", async () => {
    recordedSession("first"); recordedSession("second");
    const raw = peer();
    expect((await raw.call("_amc/session/events", { sessionId: "first" })).error).toMatchObject({ code: -32002 });
    const client = await ready();
    for (const params of [null, {}, { sessionId: "first", limit: 0 }, { sessionId: "first", limit: 257 },
      { sessionId: "first", limit: 1.5 }, { sessionId: "first", cursor: 4 }, { sessionId: "first", other: true }]) {
      expect((await client.call("_amc/session/events", params)).error).toMatchObject({ code: -32602 });
    }
    const page = (await client.call("_amc/session/events", { sessionId: "first", limit: 2 })).result!;
    expect((await client.call("_amc/session/events", { sessionId: "second", cursor: page.nextCursor })).error).toBeDefined();
    expect((await client.call("_amc/session/events", { sessionId: "first", cursor: "forged" })).error).toBeDefined();
  });

  it("reduces oversized rendered pages without skipping committed blocks or exceeding SDK frames", async () => {
    recordedSession("bounded", "default", 40);
    const client = await ready();
    const read = await client.call("_amc/session/events", { sessionId: "bounded", limit: 64 });
    expect(read.error).toBeUndefined();
    expect(Buffer.byteLength(JSON.stringify(read))).toBeLessThan(1024 * 1024);
    expect(read.result!.nextSeq as number).toBeLessThan(64);
    let page = read.result!;
    let count = (page.updates as { update: { sessionUpdate: string } }[]).filter(row => row.update.sessionUpdate === "agent_message_chunk").length;
    while (page.nextCursor !== null) {
      const next = await client.call("_amc/session/events", { sessionId: "bounded", cursor: page.nextCursor, limit: 64 });
      expect(next.error).toBeUndefined();
      expect(Buffer.byteLength(JSON.stringify(next))).toBeLessThan(1024 * 1024);
      expect(next.result!.firstSeq).toBe(page.nextSeq); page = next.result!;
      count += (page.updates as { update: { sessionUpdate: string } }[]).filter(row => row.update.sessionUpdate === "agent_message_chunk").length;
    }
    expect(count).toBe(40);
  });

  it("refuses a changed head during adaptive sizing instead of switching snapshots", () => {
    const writer = new SessionService(workspace);
    writer.open({ sessionId: "concurrent", agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
    writer.startTurn({ trigger: "user" }); writer.startStep();
    for (let blockIndex = 0; blockIndex < 40; blockIndex++) writer.recordAssistantBlock({ blockIndex, blockKind: "text", stopReason: null, content: "x".repeat(30_000) });
    const original = payloadReader.readEventPayload;
    let appended = false;
    const spy = vi.spyOn(payloadReader, "readEventPayload").mockImplementation((root, event) => {
      const result = original(root, event);
      if (!appended) {
        appended = true;
        writer.recordAssistantBlock({ blockIndex: 40, blockKind: "text", stopReason: null, content: "Concurrent committed block." });
      }
      return result;
    });
    try {
      expect(() => readAcpSessionUpdatePage({ workspace, sessionId: "concurrent", agentId: "default", limit: 64 })).toThrow(/head changed during page sizing/);
    } finally { spy.mockRestore(); writer.disposeWithoutClosing(); }
  });

  it("delivers original media that fits the existing ACP response frame bound", async () => {
    recordedImage("supported-image", 200_000);
    const client = await ready();
    const read = await client.call("_amc/session/events", { sessionId: "supported-image", limit: 256 });
    expect(read.error).toBeUndefined();
    expect((read.result!.updates as { update: { content?: { type?: string } } }[]).some(row => row.update.content?.type === "image")).toBe(true);
  });

  it("refuses a single oversized original media row explicitly instead of skipping it", async () => {
    recordedImage("large-image", 800_000);
    const client = await ready(); let cursor: unknown;
    for (let attempts = 0; attempts < 16; attempts++) {
      const page = await client.call("_amc/session/events", { sessionId: "large-image", ...(cursor === undefined ? {} : { cursor }), limit: 256 });
      if (page.error) {
        expect(page.error).toMatchObject({ data: { reason: "page-output-limit" } });
        expect(page.result).toBeUndefined(); return;
      }
      expect(page.result!.nextCursor).not.toBeNull(); cursor = page.result!.nextCursor;
    }
    throw new Error("The media row was silently skipped instead of refused");
  });

  it("propagates missing payload errors without shrinking into a silently shorter success", async () => {
    const rows = recordedSession("missing-payload", "default", 40);
    const text = rows.find(row => row.event_type === "assistant/block")!;
    expect(text.payload_path).toBeTruthy(); unlinkSync(join(workspace, text.payload_path!));
    const client = await ready();
    const read = await client.call("_amc/session/events", { sessionId: "missing-payload", limit: 64 });
    expect(read.error).toMatchObject({ code: -32603 }); expect(read.result).toBeUndefined();
  });

  it("refuses a signed incomplete ordered-image group before projecting any page range", async () => {
    const writer = new SessionService(workspace);
    writer.open({ sessionId: "incomplete", agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
    const inbox = new LoopInbox(writer, () => {});
    const receipt = inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: orderedParts() });
    writer.startTurn({ trigger: "user" }); writer.startStep(); inbox.claim("next-turn");
    writer.recordUserMessage("  before\n", { sourceInputEventId: receipt.eventId, sourceInputFormat: "amc-image-input@2", sourceContentIndex: 0 });
    writer.endStep({ stopReason: "end_turn", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn(); writer.close({ reason: "completed" });
    const client = await ready();
    const result = await client.call("_amc/session/events", { sessionId: "incomplete", limit: 1 });
    expect(result.error).toBeDefined(); expect(result.result).toBeUndefined();
  });

  it("authenticates ownership on every page and never returns another agent's text", async () => {
    recordedSession("private", "other-agent");
    const client = await ready();
    const read = await client.call("_amc/session/events", { sessionId: "private" });
    expect(read.error).toBeDefined();
    expect(read.result).toBeUndefined();
    expect(JSON.stringify(read)).not.toContain("Committed answer.");
    expect(client.factory).not.toHaveBeenCalled();
  });
});
