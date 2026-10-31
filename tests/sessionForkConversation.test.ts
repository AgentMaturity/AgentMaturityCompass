import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeAudioMessage } from "../src/agent/nativeAudioMessage.js";
import { recordNativeOrderedMessage } from "../src/agent/nativeOrderedMessage.js";
import { deriveSessionRequests } from "../src/llm/request/deriveRequest.js";
import { prepareRequest } from "../src/llm/request/prepareRequest.js";
import { resolveRequestSources } from "../src/llm/request/requestSources.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { forkSession } from "../src/session/sessionResume.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { foldSurfaceEntries } from "../src/session/surfaceProjection.js";
import type { EvidenceEvent } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { imageInput } from "./fixtures/nativeAcpImageRuntime.js";
import { audioInput } from "./fixtures/nativeSignedAudio.js";

const identity = { agentId: "default", harnessVersion: "fork-fixture", compositionDigest: sha256Hex("fork-composition"), policyDigest: sha256Hex("fork-policy") };
const claimant = { pid: process.pid, hostId: hostname(), bootId: "fork-fixture", startedAt: 1_700_000_000 };
const roots: string[] = [], services: SessionService[] = [];
type Backend = "sqlite" | "jsonl";

beforeEach(() => {
  for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "disposable-fork-conversation-fixture");
});
afterEach(() => {
  for (const service of services.splice(0)) { try { service.disposeWithoutClosing(); } catch { /* already closed */ } }
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

function workspace(backend: Backend): string {
  vi.stubEnv("AMC_SESSION_STORE", backend);
  const root = mkdtempSync(join(tmpdir(), "amc-fork-conversation-"));
  roots.push(root); initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  return root;
}
function open(root: string, smallSpill = false): SessionService {
  const service = new SessionService(root, undefined, smallSpill ? { maxInlineBytes: 256, previewHeadBytes: 32, previewTailBytes: 16 } : {});
  services.push(service); service.open(identity); return service;
}
function fork(root: string, parentSessionId: string, options: { forkTurn?: number; inheritConversation?: boolean } = {}) {
  const result = forkSession({ workspace: root, parentSessionId, claimant, ...identity, ...options });
  services.push(result.service); return result;
}
function textTurn(service: SessionService, text: string, answer = `answer: ${text}`): void {
  service.startTurn({ trigger: "user" }); service.recordUserMessage(text); service.startStep();
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: answer, stopReason: "end_turn" });
  service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
}
function toolTurn(service: SessionService, text: string, callId = "call-1", output = "original tool result"): void {
  service.startTurn({ trigger: "user" }); service.recordUserMessage(text); service.startStep();
  service.recordToolCall({ toolCallId: callId, toolName: "fs.read", args: '{ "path": "README.md" }', dispatch: "native", parentToken: null });
  service.recordToolResult({ toolCallId: callId, content: output, outcome: "OK", exitCode: 0, timedOut: false, denied: false });
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "thinking", content: "recorded reasoning", stopReason: null });
  service.recordAssistantBlock({ blockIndex: 1, blockKind: "text", content: `answer: ${text}`, stopReason: "end_turn" });
  service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
}
function stored(root: string, sessionId?: string) {
  const reader = openSessionEventStore(root, undefined, { readOnly: true });
  try { return sessionId === undefined ? [...reader.readAllEvents()] : [...reader.readSessionEvents(sessionId)]; }
  finally { reader.close(); }
}
function record(root: string, sessionId: string) {
  const reader = openSessionEventStore(root, undefined, { readOnly: true });
  try { return reader.readSessionRecord(sessionId); } finally { reader.close(); }
}
function payload(root: string, event: EvidenceEvent): Buffer {
  const result = readEventPayload(root, event);
  if (result.status !== "ok") throw new Error(`Fixture payload unavailable: ${result.status}`);
  return result.bytes;
}
function surface(root: string, rows: readonly EvidenceEvent[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  return foldSurfaceEntries(rows).map(entry => ({ role: entry.role, kind: entry.part.kind,
    bytes: payload(root, byId.get(entry.sourceEventId)!).toString("base64") }));
}
function receipts(rows: readonly EvidenceEvent[]) {
  return rows.filter(row => row.event_type === "audit").map(row => JSON.parse(row.meta_json) as {
    copiedEventId?: string; forkSource?: { sessionId: string; eventId: string; eventHash: string; turn: number | null };
  }).filter(value => value.forkSource !== undefined);
}
function refusesBeforeChild(root: string, action: () => unknown): void {
  const before = stored(root), opened = vi.spyOn(SessionService.prototype, "open");
  try { expect(action).toThrow(); expect(opened).not.toHaveBeenCalled(); expect(stored(root)).toEqual(before); }
  finally { opened.mockRestore(); }
}
function twoTurns(root: string) {
  const parent = open(root); parent.recordSystemPrompt("Original parent system prompt.");
  toolTurn(parent, "  first question α\n"); textTurn(parent, "second question");
  const sessionId = parent.sessionId; parent.close({ reason: "completed" });
  return { sessionId, rows: stored(root, sessionId) };
}
function corruptRow(root: string, backend: Backend, row: EvidenceEvent): void {
  const changed = JSON.stringify({ ...JSON.parse(row.meta_json), changedAfterSigning: true });
  if (backend === "jsonl") {
    const path = join(root, ".amc", "jsonl", "events.jsonl");
    const lines = readFileSync(path, "utf8").trimEnd().split("\n").map(line => {
      const event = JSON.parse(line) as EvidenceEvent; return JSON.stringify(event.id === row.id ? { ...event, meta_json: changed } : event);
    });
    writeFileSync(path, lines.join("\n") + "\n"); return;
  }
  const db = new Database(join(root, ".amc", "evidence.sqlite"));
  try {
    for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(changed, row.id);
  } finally { db.close(); }
}

describe.each(["sqlite", "jsonl"] as const)("verified conversation fork (%s)", backend => {
  test("copies exact latest sealed text/tool surface with signed provenance and preserves the parent", () => {
    const root = workspace(backend), parent = twoTurns(root), originalRecord = record(root, parent.sessionId);
    const { service: child, parent: lineage } = fork(root, parent.sessionId);
    const rows = child.readEvents(), sourceEntries = foldSurfaceEntries(parent.rows);
    expect(child.sessionId).not.toBe(parent.sessionId);
    expect(surface(root, rows)).toEqual(surface(root, parent.rows));
    expect(lineage).toMatchObject({ sessionId: parent.sessionId, forkTurn: 2 });
    expect(receipts(rows)).toHaveLength(sourceEntries.length);
    for (const receipt of receipts(rows)) {
      const source = parent.rows.find(row => row.id === receipt.forkSource!.eventId)!;
      const copied = rows.find(row => row.id === receipt.copiedEventId)!;
      expect(source).toBeDefined(); expect(copied).toBeDefined();
      expect(receipt.forkSource).toEqual({ sessionId: parent.sessionId, eventId: source.id, eventHash: source.event_hash, turn: extractEnvelope(source.meta_json)!.turn });
      expect(copied.id).not.toBe(source.id); expect(copied.payload_sha256).toBe(source.payload_sha256);
      expect(payload(root, copied)).toEqual(payload(root, source));
    }
    child.close({ reason: "completed" });
    expect(stored(root, parent.sessionId)).toEqual(parent.rows); expect(record(root, parent.sessionId)).toEqual(originalRecord);
  });

  test("selects an exact inclusive fork turn and excludes the parent's later conversation", () => {
    const root = workspace(backend), parent = twoTurns(root), firstSeal = parent.rows.find(row => row.event_type === "turn/seal")!;
    const { service: child, parent: lineage } = fork(root, parent.sessionId, { forkTurn: 1 });
    expect(surface(root, child.readEvents())).toEqual(surface(root, parent.rows.slice(0, parent.rows.indexOf(firstSeal) + 1)));
    expect(lineage).toMatchObject({ forkTurn: 1, finalEventHash: firstSeal.event_hash, seq: extractEnvelope(firstSeal.meta_json)!.seq });
    expect(JSON.parse(child.readEvents()[0]!.meta_json).parentSession).toEqual(lineage);
    expect(receipts(child.readEvents()).some(value => value.forkSource?.turn === 2)).toBe(false);
  });

  test("builds the first child request from inherited history and cold-derives the same bytes with the child's system prompt", () => {
    const root = workspace(backend), parent = twoTurns(root), child = fork(root, parent.sessionId, { forkTurn: 1 }).service;
    const system = child.recordSystemPrompt("Current child system prompt.");
    child.startTurn({ trigger: "user" }); child.recordUserMessage("child follow-up"); child.startStep();
    const before = child.readEvents(), resolved = resolveRequestSources({ workspace: root, events: before, model: "fixture", params: {},
      systemPromptEventId: system.eventId, toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: before.at(-1)!.id });
    expect(resolved.failure).toBeNull(); expect(resolved.notes).toEqual([]);
    expect(resolved.request?.system).toBe("Current child system prompt.");
    const parts = resolved.request!.messages.flatMap(message => message.parts);
    expect(parts).toContainEqual({ kind: "text", text: "  first question α\n" });
    expect(parts).toContainEqual({ kind: "tool_use", toolCallId: "call-1", toolName: "fs.read", argumentsJson: '{ "path": "README.md" }' });
    expect(parts).toContainEqual({ kind: "tool_result", toolCallId: "call-1", isError: false, text: "original tool result" });
    expect(parts).toContainEqual({ kind: "text", text: "child follow-up" });
    const prepared = prepareRequest(child, { model: "fixture", providerId: "openai", encoderId: "openai-chat", encoderVersion: 1,
      params: {}, systemPromptEventId: system.eventId, tools: null });
    child.endStep({ stopReason: "end_turn", usage: null }); child.endTurn({ reason: "complete" }); child.sealTurn(); child.close({ reason: "completed" });
    const [derived] = deriveSessionRequests({ workspace: root, sessionId: child.sessionId });
    expect(derived?.status).toBe("reconstructed"); expect(derived?.bytes).toEqual(prepared.toBytes());
  });

  test("nested forks copy each inherited part once and cite their immediate immutable parent", () => {
    const root = workspace(backend), parent = twoTurns(root), child = fork(root, parent.sessionId, { forkTurn: 1 }).service;
    textTurn(child, "child-only question"); const childId = child.sessionId; child.close({ reason: "completed" });
    const childRows = stored(root, childId), grandchild = fork(root, childId).service;
    expect(surface(root, grandchild.readEvents())).toEqual(surface(root, childRows));
    expect(receipts(grandchild.readEvents())).toHaveLength(foldSurfaceEntries(childRows).length);
    expect(receipts(grandchild.readEvents()).every(value => value.forkSource?.sessionId === childId)).toBe(true);
    expect(stored(root, childId)).toEqual(childRows); expect(stored(root, parent.sessionId)).toEqual(parent.rows);
  });

  test("rejects negative, fractional and nonexistent fork turns before creating a child", () => {
    const root = workspace(backend), parent = twoTurns(root);
    for (const forkTurn of [-1, 1.5, 3]) refusesBeforeChild(root, () => fork(root, parent.sessionId, { forkTurn }));
  });

  test("refuses a fork by a different agent before copying any parent row", () => {
    const root = workspace(backend);
    const parentSessionId = twoTurns(root).sessionId;
    const before = stored(root).length;
    for (const inheritConversation of [true, false]) {
      expect(() => forkSession({ workspace: root, parentSessionId, claimant, ...identity, agentId: "intruder", inheritConversation }))
        .toThrow(/agent recorded in session\/open/);
    }
    expect(stored(root)).toHaveLength(before);
  });

  test("refuses a missing inherited payload before creating a child", () => {
    const root = workspace(backend), parent = twoTurns(root), source = parent.rows.find(row => row.event_type === "user/message")!;
    const path = source.payload_path ?? source.canonical_payload_path;
    expect(path).toBeTruthy(); unlinkSync(join(root, path!));
    refusesBeforeChild(root, () => fork(root, parent.sessionId));
  });

  test("refuses an unverifiable parent suffix even when an earlier fork turn was requested", () => {
    const root = workspace(backend), parent = twoTurns(root);
    corruptRow(root, backend, parent.rows.find(row => row.event_type === "user/message" && extractEnvelope(row.meta_json)?.turn === 2)!);
    refusesBeforeChild(root, () => fork(root, parent.sessionId, { forkTurn: 1 }));
  });

  test("refuses an unsealed active parent turn without repairing or mutating it", () => {
    const root = workspace(backend), parent = open(root); textTurn(parent, "completed question");
    parent.startTurn({ trigger: "user" }); parent.recordUserMessage("unfinished question");
    const sessionId = parent.sessionId; parent.simulateCrash(); const before = stored(root, sessionId), lifecycle = record(root, sessionId);
    refusesBeforeChild(root, () => fork(root, sessionId));
    expect(stored(root, sessionId)).toEqual(before); expect(record(root, sessionId)).toEqual(lifecycle);
  });

  test("refuses spill, Gemini, ordered inbox and audio dependencies before creating a child", () => {
    for (const unsupported of ["spill", "gemini", "ordered", "audio"] as const) {
      const root = workspace(backend), parent = open(root, unsupported === "spill");
      if (unsupported === "spill") toolTurn(parent, "large result", "spilled-call", "original output\n".repeat(100));
      else {
        parent.startTurn({ trigger: "user" }); parent.startStep();
        if (unsupported === "gemini") parent.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: "original provider text", stopReason: "end_turn",
          gemini: { version: 1, responseId: "response-fixture", partIndex: 0, partJson: '{"text":"original provider text"}', headerEventId: "original-provider-header" } });
        else {
          const inbox = new LoopInbox(parent, () => {});
          if (unsupported === "ordered") {
            inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: [{ type: "text", text: "before" }, { type: "image", image: imageInput() }] });
            recordNativeOrderedMessage(parent, inbox.claim("next-turn")[0]!);
          } else {
            inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, audioParts: [{ type: "audio", audio: audioInput() }] });
            recordNativeAudioMessage(parent, inbox.claim("next-turn")[0]!);
          }
        }
        parent.endStep({ stopReason: "end_turn", usage: null }); parent.endTurn({ reason: "complete" }); parent.sealTurn();
      }
      const sessionId = parent.sessionId; parent.close({ reason: "completed" });
      refusesBeforeChild(root, () => fork(root, sessionId));
    }
  });

  test("refuses unresolved tool calls and orphan results before creating a child", () => {
    for (const unmatched of ["call", "result"] as const) {
      const root = workspace(backend), parent = open(root); parent.startTurn({ trigger: "user" }); parent.startStep();
      if (unmatched === "call") parent.recordToolCall({ toolCallId: "unmatched", toolName: "fs.read", args: "{}", dispatch: "native", parentToken: null });
      else parent.recordToolResult({ toolCallId: "unmatched", content: "orphan", outcome: "OK", exitCode: 0, timedOut: false, denied: false });
      parent.endStep({ stopReason: "end_turn", usage: null }); parent.endTurn({ reason: "complete" }); parent.sealTurn();
      const sessionId = parent.sessionId; parent.close({ reason: "completed" });
      refusesBeforeChild(root, () => fork(root, sessionId));
    }
  });

  test("preserves explicit lineage-only forking without inherited conversation", () => {
    const root = workspace(backend), parent = twoTurns(root), child = fork(root, parent.sessionId, { inheritConversation: false }).service;
    expect(child.sessionId).not.toBe(parent.sessionId); expect(child.projectHistory()).toEqual([]); expect(receipts(child.readEvents())).toEqual([]);
    expect(JSON.parse(child.readEvents()[0]!.meta_json).parentSession.sessionId).toBe(parent.sessionId);
    expect(stored(root, parent.sessionId)).toEqual(parent.rows);
  });

  test("copies inline original image bytes and signed attachment metadata without a text conversion", () => {
    const root = workspace(backend), parent = open(root), image = imageInput();
    parent.startTurn({ trigger: "user" }); parent.recordUserMessage("inspect original image");
    parent.recordUserAttachment({ filename: image.filename, content: image.bytes, kind: "image", mimeType: image.mediaType });
    parent.endTurn({ reason: "complete" }); parent.sealTurn(); const sessionId = parent.sessionId; parent.close({ reason: "completed" });
    const child = fork(root, sessionId).service, attachment = child.readEvents().find(row => row.event_type === "user/attachment")!;
    expect(attachment).toBeDefined(); expect(payload(root, attachment)).toEqual(image.bytes);
    expect(JSON.parse(attachment.meta_json)).toMatchObject({ filename: image.filename, mimeType: image.mediaType, bytes: image.bytes.length });
    expect(foldSurfaceEntries(child.readEvents()).find(entry => entry.sourceEventId === attachment.id)?.part.kind).toBe("image");
  });
});
