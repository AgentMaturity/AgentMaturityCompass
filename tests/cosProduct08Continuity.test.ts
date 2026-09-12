/** P08 signed-evidence regressions — authored, not executed. Disposable stores
 * and controlled AgentSession factories exercise the actual server/projection;
 * they are not native-provider, installed-package or ownership-recovery proof. */
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAcpAgent, type AcpAgent, type AcpAgentInit } from "../src/acp/acpAgentServer.js";
import { validateAcpCommittedTail } from "../src/acp/acpCommittedUpdates.js";
import { assertAcpForkLineage, prepareAcpHistory, validateAcpOrderedHistory } from "../src/acp/acpHistoryContinuity.js";
import { checkAcpDefinition } from "../src/acp/acpSchema.js";
import type { AgentPromptResult, AgentSession } from "../src/agent/agentSession.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeOrderedMessage } from "../src/agent/nativeOrderedMessage.js";
import type { NativeInputPart } from "../src/attachments/nativeOrderedInput.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import type { EvidenceEvent } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

type Frame = Record<string, unknown>;
type RowView = (rows: readonly EvidenceEvent[]) => readonly EvidenceEvent[];
const directories: string[] = [], writers: SessionService[] = [], agents: AcpAgent[] = [], unblock: (() => void)[] = [];
const identity = { agentId: "default", harnessVersion: "p08-fixture", compositionDigest: "p08-composition", policyDigest: "p08-policy" };
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=";
const success = (): AgentPromptResult => ({ ok: true, status: "idle", text: "UNCOMMITTED RETURN TEXT MUST NEVER STREAM",
  validation: { status: "not-requested", turn: null, configSha256: null, checks: [] } });
afterEach(async () => {
  for (const finish of unblock.splice(0)) finish();
  for (const agent of agents.splice(0)) await agent.close();
  for (const writer of writers.splice(0)) writer.disposeWithoutClosing();
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
function workspace(backend: "sqlite" | "jsonl" = "sqlite") {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "disposable-p08-fixture-passphrase");
  vi.stubEnv("AMC_SESSION_STORE", backend);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p08-history-"))); directories.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  return root;
}
function writer(root: string, options: Parameters<SessionService["open"]>[0] = identity) {
  const service = new SessionService(root, openSessionEventStore(root)); writers.push(service);
  service.open(options); return service;
}
function route() {
  const registry = new AdapterRegistry();
  registry.register({ providerId: "anthropic", adapter: anthropicAdapter, baseUrl: "https://unused.invalid", credentialRef: null, models: ["fixture"] });
  return registry.pin({ providerId: "anthropic", model: "fixture" });
}
function append(service: SessionService, text: string) {
  service.startTurn({ trigger: "user" }); service.startStep();
  service.recordUserMessage("controlled fixture prompt");
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: text, stopReason: "end_turn" });
  service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
}
function session(service: SessionService, view: RowView = rows => rows) {
  const prompt = vi.fn<AgentSession["prompt"]>(async () => success());
  const release = vi.fn(async () => {}), close = vi.fn(async () => {});
  return { sessionId: service.sessionId, prompt, promptParts: async (_parts: readonly NativeInputPart[]) => success(),
    readEvents: () => view(service.readEvents()), cancel: vi.fn<AgentSession["cancel"]>(), release, close } satisfies AgentSession;
}
function harness(root: string, resumed: AgentSession, extra: Partial<AcpAgentInit> = {}) {
  const frames: Frame[] = [], replies = new Map<number, ReturnType<typeof deferred<Frame>>>(); let nextId = 0;
  const agent = createAcpAgent({ workspace: root, agentId: "default", promptRoute: route(), orderedImageInput: true,
    sessionFactory: () => { throw new Error("not used by this controlled history fixture"); },
    resumeSessionFactory: () => resumed, ...extra,
    write: frameBytes => {
      const frame = JSON.parse(frameBytes.toString("utf8")) as Frame; frames.push(frame);
      if (typeof frame.id === "number") { replies.get(frame.id)?.resolve(frame); replies.delete(frame.id); }
    } });
  agents.push(agent);
  const begin = (method: string, params: unknown) => {
    const id = ++nextId, reply = deferred<Frame>(); replies.set(id, reply);
    agent.connection.ingest(Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"));
    return { id, result: reply.promise };
  };
  const call = (method: string, params: unknown) => begin(method, params).result;
  const initialize = () => call("initialize", { protocolVersion: 1, clientCapabilities: {} });
  const load = () => call("session/load", { sessionId: resumed.sessionId, cwd: root, mcpServers: [] });
  const prompt = (sessionId = resumed.sessionId) => call("session/prompt", { sessionId, prompt: [{ type: "text", text: "next" }] });
  return { agent, frames, begin, call, initialize, load, prompt };
}
function updates(frames: readonly Frame[]) {
  return frames.filter(frame => frame.method === "session/update").map(frame => frame.params as {
    sessionId: string; update: { sessionUpdate: string; content?: { type: string; text?: string; data?: string } };
  });
}
function ordered(service: SessionService, mode: "valid" | "wrong-index" | "missing-tail" | "rewrite" | "interleave" = "valid") {
  const parts: readonly NativeInputPart[] = [
    { type: "text", text: "  before\n" },
    { type: "image", image: { filename: "pixel.png", mediaType: "image/png", bytes: Buffer.from(png, "base64") } },
    { type: "text", text: "" }, { type: "text", text: "after  " }
  ];
  const inbox = new LoopInbox(service, () => {});
  inbox.insert("next-turn", "", "followup", { parts, wake: true, demotedFrom: null });
  service.startTurn({ trigger: "user" }); const message = inbox.claim("next-turn")[0]!; service.startStep();
  if (mode === "valid") recordNativeOrderedMessage(service, message);
  else {
    // Semantic mutations use newly signed disposable fixture rows, not edited
    // production evidence. Signature validity alone must not bless their meaning.
    for (const [index, part] of parts.entries()) {
      if (mode === "missing-tail" && index === parts.length - 1) continue;
      const provenance = { sourceInputEventId: message.inputEventId!, sourceInputFormat: "amc-image-input@2" as const,
        sourceContentIndex: mode === "wrong-index" && index === 0 ? 1 : index };
      if (part.type === "image") service.recordUserAttachment({ filename: part.image.filename, content: part.image.bytes,
        kind: "image", mimeType: part.image.mediaType, sourceInputIndex: 0, ...provenance });
      else service.recordUserMessage(mode === "rewrite" && index === 0 ? "rewritten" : part.text, provenance);
      if (mode === "interleave" && index === 1) service.recordUserMessage("unrelated interleaved message");
    }
  }
  service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
  return parts;
}

describe("P08 committed history and continuity (unexecuted)", () => {
  test.each(["sqlite", "jsonl"] as const)("%s ordered history replays original parts before load response and never leaks into the next prompt", async backend => {
    const root = workspace(backend), service = writer(root); ordered(service);
    const native = session(service), h = harness(root, native); await h.initialize();
    const loading = h.begin("session/load", { sessionId: service.sessionId, cwd: root, mcpServers: [] });
    const loaded = await loading.result; expect(loaded.error).toBeUndefined();
    const replay = updates(h.frames);
    expect(replay.map(item => item.update.content)).toEqual([
      { type: "text", text: "  before\n" }, { type: "image", mimeType: "image/png", data: png },
      { type: "text", text: "" }, { type: "text", text: "after  " }
    ]);
    const responseIndex = h.frames.findIndex(frame => frame.id === loading.id);
    expect(h.frames.every((frame, index) => frame.method !== "session/update" || index < responseIndex)).toBe(true);
    const before = h.frames.length; expect((await h.prompt()).error).toBeUndefined();
    expect(updates(h.frames.slice(before))).toEqual([]); expect(native.prompt).toHaveBeenCalledTimes(1);
  });

  test.each(["wrong-index", "missing-tail", "rewrite", "interleave"] as const)("signed %s corruption fails semantic replay before any prefix", async mode => {
    const root = workspace(), service = writer(root); ordered(service, mode);
    const rows = service.readEvents();
    expect(validateAcpCommittedTail(root, service.sessionId, rows, 0, null)).toBe(rows.at(-1)!.event_hash);
    expect(() => validateAcpOrderedHistory(root, rows)).toThrow(/faithfully continued/);
    const native = session(service), h = harness(root, native); await h.initialize();
    expect((await h.load()).error).toMatchObject({ code: -32603 });
    expect(updates(h.frames)).toEqual([]); expect(native.release).toHaveBeenCalledTimes(1); expect(native.prompt).not.toHaveBeenCalled();
  });

  test.each(["inbox", "image", "text"])("a pruned original %s rejects the entire ordered replay, not just the missing part", async kind => {
    const root = workspace(), service = writer(root); ordered(service);
    const native = session(service, rows => rows.map(row => {
      const matches = kind === "inbox" ? row.event_type === "loop/inbox" && JSON.parse(row.meta_json).op === "insert"
        : kind === "image" ? row.event_type === "user/attachment" : row.event_type === "user/message";
      return matches ? { ...row, payload_pruned: 1 as const } : row;
    }));
    const h = harness(root, native); await h.initialize();
    expect((await h.load()).error).toMatchObject({ code: -32603 }); expect(updates(h.frames)).toEqual([]);
  });

  test("image-capable legacy factories cannot load an ordered sequence without the ordered contract", async () => {
    const root = workspace(), service = writer(root); ordered(service);
    const native: AgentSession = { ...session(service), promptParts: undefined };
    const h = harness(root, native); await h.initialize();
    expect((await h.load()).error).toMatchObject({ code: -32602, message: expect.stringContaining("ordered image contract") });
    expect(updates(h.frames)).toEqual([]);
  });

  test("empty history is not treated as an authenticated resumed session", async () => {
    const root = workspace(), service = writer(root), native = session(service, () => []), h = harness(root, native);
    await h.initialize(); expect((await h.load()).error).toMatchObject({ code: -32603 });
    expect(updates(h.frames)).toEqual([]); expect(native.release).toHaveBeenCalledTimes(1);
  });

  test("a committed block streams before the prompt response, exactly once; return text remains uncommitted", async () => {
    const root = workspace(), service = writer(root), native = session(service), h = harness(root, native);
    await h.initialize(); await h.load(); const gate = deferred<AgentPromptResult>(); unblock.push(() => gate.resolve(success()));
    native.prompt.mockImplementationOnce(() => { append(service, "signed completed block"); return gate.promise; });
    const pending = h.begin("session/prompt", { sessionId: service.sessionId, prompt: [{ type: "text", text: "stream" }] });
    await vi.waitFor(() => expect(updates(h.frames).map(item => item.update.content?.text)).toEqual(["signed completed block"]));
    expect(h.frames.some(frame => frame.id === pending.id)).toBe(false);
    gate.resolve(success()); expect((await pending.result).error).toBeUndefined();
    expect(updates(h.frames).map(item => item.update.content?.text)).toEqual(["signed completed block"]);
    expect(JSON.stringify(h.frames)).not.toContain("UNCOMMITTED RETURN TEXT");
  });

  test("a failed prompt authenticates and retires its tail instead of leaking it into the next turn", async () => {
    const root = workspace(), service = writer(root), native = session(service), h = harness(root, native);
    await h.initialize(); await h.load();
    native.prompt.mockImplementationOnce(async () => { append(service, "withheld failed tail"); return { ok: false, reason: "fixture failure" }; });
    expect((await h.prompt()).error).toMatchObject({ code: -32603 }); expect(updates(h.frames)).toEqual([]);
    native.prompt.mockImplementationOnce(async () => { append(service, "next committed tail"); return success(); });
    expect((await h.prompt()).error).toBeUndefined();
    expect(updates(h.frames).map(item => item.update.content?.text)).toEqual(["next committed tail"]);
  });

  test("missing live bytes refuse explicitly and the next prompt cannot reset the poisoned cursor", async () => {
    const root = workspace(), service = writer(root), native = session(service, rows => rows.map(row => row.event_type === "assistant/block"
      ? { ...row, payload_inline: null, payload_path: null, canonical_payload_path: null,
        canonical_payload_inline: row.canonical_payload_inline ?? row.payload_inline } : row));
    const h = harness(root, native); await h.initialize(); await h.load();
    native.prompt.mockImplementationOnce(async () => { append(service, "original bytes are now unavailable"); return success(); });
    expect((await h.prompt()).error).toMatchObject({ code: -32603 });
    expect(updates(h.frames)).toEqual([]);
    expect((await h.prompt()).error).toMatchObject({ code: -32603, message: expect.stringContaining("unusable") });
    expect(native.prompt).toHaveBeenCalledTimes(1);
  });

  test("cursor anchors require an integer position, exact ownership and the previously authenticated head", () => {
    const root = workspace(), service = writer(root); append(service, "committed"); const rows = service.readEvents();
    const head = validateAcpCommittedTail(root, service.sessionId, rows, 0, null);
    expect(validateAcpCommittedTail(root, service.sessionId, rows, rows.length, head)).toBe(head);
    for (const from of [NaN, 0.5, -1, rows.length + 1]) expect(() => validateAcpCommittedTail(root, service.sessionId, rows, from, null)).toThrow();
    expect(() => validateAcpCommittedTail(root, service.sessionId, rows, rows.length, null)).toThrow(/head changed/);
    expect(() => validateAcpCommittedTail(root, "another-session", rows, 0, null)).toThrow(/ownership/);
    expect(() => validateAcpCommittedTail(root, service.sessionId, rows, 0, head)).toThrow(/head changed/);
  });

  test("a signed fork pointer binds its exact parent prefix without changing the parent's history", () => {
    const root = workspace(), parent = writer(root); append(parent, "parent context"); const rows = parent.readEvents(), last = rows.at(-1)!;
    const parentRef = { sessionId: parent.sessionId, seq: extractEnvelope(last.meta_json)!.seq, finalEventHash: last.event_hash };
    const child = writer(root, { ...identity, parent: parentRef }), native = session(child);
    expect(assertAcpForkLineage(root, parent.sessionId, native, child.readEvents(), "default").parent).toEqual(parentRef);
    expect(parent.readEvents()).toEqual(rows);
    const forged = writer(root, { ...identity, parent: { ...parentRef, finalEventHash: "f".repeat(64) } });
    expect(() => assertAcpForkLineage(root, parent.sessionId, session(forged), forged.readEvents(), "default")).toThrow(/faithfully continued/);
    // A valid lineage pointer is necessary but is deliberately not a model-context claim.
  });

  test("the ACP fork endpoint uses the supplied context factory, isolates child updates and preserves its parent", async () => {
    const root = workspace(), parent = writer(root); append(parent, "inherited fixture context");
    const before = parent.readEvents(), last = before.at(-1)!, nativeParent = session(parent);
    let child!: ReturnType<typeof session>; const observedContext: string[] = [];
    const factory = vi.fn<NonNullable<AcpAgentInit["forkSessionFactory"]>>(async params => {
      expect(params.parentSessionId).toBe(parent.sessionId);
      const inherited = before.filter(row => row.event_type === "assistant/block").map(row => {
        const payload = readEventPayload(root, row); if (payload.status !== "ok") throw new Error("fixture context missing");
        return payload.bytes.toString("utf8");
      });
      const childWriter = writer(root, { ...identity, sessionId: randomUUID(), parent: { sessionId: parent.sessionId,
        finalEventHash: last.event_hash, seq: extractEnvelope(last.meta_json)!.seq } });
      child = session(childWriter);
      // This controlled factory explicitly supplies inherited context to its
      // executable prompt seam. It does not impersonate a native LLM fork.
      child.prompt.mockImplementation(async () => { observedContext.push(...inherited); append(childWriter, "child-only response"); return success(); });
      return child;
    });
    const h = harness(root, nativeParent, { forkSessionFactory: factory }); const initialized = await h.initialize(); await h.load();
    expect(initialized.result).toMatchObject({ agentCapabilities: { sessionCapabilities: { fork: {} } } });
    const forked = await h.call("session/fork", { sessionId: parent.sessionId, cwd: root });
    expect(forked.error).toBeUndefined(); expect(await checkAcpDefinition("ForkSessionResponse", forked.result)).toEqual({ ok: true });
    const childId = (forked.result as { sessionId: string }).sessionId; expect(childId).not.toBe(parent.sessionId);
    const cursor = h.frames.length; expect((await h.prompt(childId)).error).toBeUndefined();
    expect(observedContext).toEqual(["inherited fixture context"]); expect(parent.readEvents()).toEqual(before);
    expect(updates(h.frames.slice(cursor))).toMatchObject([{ sessionId: childId, update: { content: { text: "child-only response" } } }]);
  });

  test("a failed replay cleanup retains the session for shutdown without granting a usable session", async () => {
    const root = workspace(), service = writer(root); ordered(service, "missing-tail");
    const native = session(service); native.release.mockRejectedValueOnce(new Error("release cleanup failed"));
    const h = harness(root, native); await h.initialize(); expect((await h.load()).error).toBeDefined();
    expect((await h.prompt()).error).toMatchObject({ code: -32602 }); expect(native.prompt).not.toHaveBeenCalled();
    expect((await h.load()).error).toMatchObject({ code: -32602, message: expect.stringContaining("cleanup remains unresolved") });
    await h.agent.close(); expect(native.close).toHaveBeenCalledTimes(1);
  });

  test("preflight rejects a route mismatch before exposing any signed image prefix", () => {
    const root = workspace(), service = writer(root); ordered(service);
    expect(() => prepareAcpHistory({ workspace: root, session: session(service), rows: service.readEvents(),
      orderedImageInput: false, audioInput: false })).toThrow(/cannot continue signed image history/);
  });
});
