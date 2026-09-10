import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { compactionReceipt } from "../src/session/surfaceCompactionValidation.js";
import { validateSurfaceCompactions } from "../src/session/surfaceCompaction.js";
import * as surfaceCompaction from "../src/session/surfaceCompaction.js";
import { resolveRequestSources } from "../src/llm/request/requestSources.js";
import { resumeSession, forkSession } from "../src/session/sessionResume.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";
import { inspectSessionCompaction, compactReleasedSession } from "../src/session/sessionCompactionWorkflow.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";

// Authored for AMC-1522; execution is deferred to the combined qualification phase.
const OPEN = { agentId: "default", harnessVersion: "test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
const roots: string[] = [], services: SessionService[] = [];
let previousPassphrase: string | undefined;
beforeEach(() => { previousPassphrase = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = "origin-compaction-test-only"; });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const service of services.splice(0)) { try { service.disposeWithoutClosing(); } catch { /* already closed */ } }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
});
function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-origin-compaction-")));
  roots.push(root); initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); return root;
}
function open(root: string): SessionService { const service = new SessionService(root); services.push(service); service.open(OPEN); return service; }
function textTurn(service: SessionService, text = "question ".repeat(80), answer = "answer ".repeat(80)): void {
  service.startTurn({ trigger: "user" }); service.recordUserMessage(text); service.startStep();
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: answer, stopReason: "end_turn" });
  service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
}
function bytes(root: string, row: EvidenceEvent): string {
  const payload = readEventPayload(root, row);
  if (payload.status !== "ok") throw new Error(`fixture payload is ${payload.status}`);
  return payload.bytes.toString("utf8");
}
function request(root: string, service: SessionService, systemId: string, cutoff: string) {
  return resolveRequestSources({ workspace: root, events: service.readEvents(), model: "fixture", params: {},
    systemPromptEventId: systemId, toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: cutoff });
}
function storedRows(root: string, sessionId: string): readonly EvidenceEvent[] {
  const store = openSessionEventStore(root, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
}

describe("origin-addressed native compaction", () => {
  it("measures current authenticated bytes, preserves the origin and reconstructs both cutoffs", () => {
    const root = workspace(), service = open(root), system = service.recordSystemPrompt("System instructions.");
    const originalText = "question ".repeat(80); textTurn(service, originalText);
    const originalRows = service.readEvents(), cutoff = originalRows.at(-1)!.id;
    const origin = service.liveSurfaceEntries().find(entry => entry.role === "user")!.originEventId;
    const original = originalRows.find(row => row.id === origin)!;
    const first = service.compactSurfaceEntry({ originEventId: origin, replacement: "retained question", reason: "context pressure", replacedBytes: 99_999_999 });
    const second = service.compactSurfaceEntry({ originEventId: origin, replacement: "Q", reason: "second reduction" });
    const rows = service.readEvents(), firstRow = rows.find(row => row.id === first.eventId)!, secondRow = rows.find(row => row.id === second.eventId)!;
    expect(compactionReceipt(firstRow).replacedBytes).toBe(Buffer.byteLength(originalText));
    expect(compactionReceipt(secondRow).replacedBytes).toBe(Buffer.byteLength("retained question"));
    expect(service.liveSurfaceEntries().find(entry => entry.originEventId === origin)?.sourceEventId).toBe(second.eventId);
    expect(rows.slice(0, originalRows.length)).toEqual(originalRows);
    expect(bytes(root, original)).toBe(originalText);
    const before = request(root, service, system.eventId, cutoff), after = request(root, service, system.eventId, second.eventId);
    expect(before.failure).toBeNull(); expect(after.failure).toBeNull();
    expect(before.sourceEventIds).toContain(origin); expect(after.sourceEventIds).toContain(second.eventId);
    expect(before.request?.messages[0]?.parts).toContainEqual({ kind: "text", text: originalText });
    expect(after.request?.messages[0]?.parts).toContainEqual({ kind: "text", text: "Q" });
  });

  it("refuses invented savings, invalid ranges, excessive summaries and in-flight mutation before an append", () => {
    const root = workspace(), service = open(root); textTurn(service, "tiny", "long answer ".repeat(20));
    const origins = service.liveSurfaceEntries().map(entry => entry.originEventId), before = service.readEvents();
    expect(() => service.compactSurfaceEntry({ originEventId: origins[0]!, replacement: "growing input", replacedBytes: 1_000_000, reason: "pressure" })).toThrow(/smaller/);
    expect(() => service.compactSurfaceRange({ originEventIds: [...origins].reverse(), replacement: "s", reason: "pressure" })).toThrow(/contiguous/);
    expect(() => service.compactSurfaceRange({ originEventIds: [origins[0]!, origins[0]!], replacement: "s", reason: "pressure" })).toThrow(/unique/);
    expect(() => service.compactSurfaceEntry({ originEventId: "missing", replacement: "s", reason: "pressure" })).toThrow(/missing/);
    expect(() => service.compactSurfaceRange({ originEventIds: origins, replacement: "s".repeat(1_000_001), reason: "pressure" })).toThrow(/byte limit/);
    expect(service.readEvents()).toEqual(before);
    service.startTurn({ trigger: "user" }); service.recordUserMessage("next question"); service.startStep();
    const inFlightRows = service.readEvents();
    expect(() => service.compactSurfaceEntry({ originEventId: origins[1]!, replacement: "s", reason: "pressure" })).toThrow(/between steps/);
    expect(service.readEvents()).toEqual(inFlightRows);
  });

  it("summarizes an exact contiguous range atomically and refuses its removed origins", () => {
    const root = workspace(), service = open(root); textTurn(service);
    const entries = service.liveSurfaceEntries(), before = service.readEvents();
    service.compactSurfaceRange({ originEventIds: entries.map(entry => entry.originEventId), replacement: "Conversation summary.", summaryRole: "user", reason: "context pressure" });
    expect(service.readEvents()).toHaveLength(before.length + 1);
    expect(service.liveSurfaceEntries()).toHaveLength(1);
    expect(service.liveSurfaceEntries()[0]?.originEventId).toBe(entries[0]!.originEventId);
    expect(() => service.dropSurfaceEntry({ originEventId: entries[1]!.originEventId, reason: "already removed" })).toThrow(/missing/);
  });

  it("preserves successful tool-result identity and removes completed pairs only together", () => {
    const root = workspace(), service = open(root), system = service.recordSystemPrompt("System instructions.");
    service.startTurn({ trigger: "user" }); service.recordUserMessage("inspect"); service.startStep();
    service.recordToolCall({ toolCallId: "call-1", toolName: "fs.read", dispatch: "native", parentToken: null, args: "{}" });
    service.recordToolResult({ toolCallId: "call-1", outcome: "OK", content: "output ".repeat(80), exitCode: 0, timedOut: false, denied: false });
    service.endStep({ stopReason: "tool_use", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn();
    const ref = service.compactToolResult({ toolCallId: "call-1", replacement: "kept output", reason: "context pressure", replacedBytes: 1 });
    const resolved = request(root, service, system.eventId, ref.eventId);
    expect(resolved.failure).toBeNull();
    expect(resolved.request?.messages.flatMap(message => message.parts)).toContainEqual({ kind: "tool_result", toolCallId: "call-1", isError: false, text: "kept output" });
    const pair = service.liveSurfaceEntries().filter(entry => entry.kind === "tool_use" || entry.kind === "tool_result");
    const before = service.readEvents();
    expect(() => service.dropSurfaceEntry({ originEventId: pair[0]!.originEventId, reason: "pressure" })).toThrow(/orphan/);
    expect(service.readEvents()).toEqual(before);
    service.dropSurfaceRange({ originEventIds: pair.map(entry => entry.originEventId), reason: "remove completed pair" });
    expect(service.readEvents()).toHaveLength(before.length + 1);
    expect(service.liveSurfaceEntries().some(entry => entry.kind === "tool_use" || entry.kind === "tool_result")).toBe(false);
  });

  it("rejects altered origin commitments, basis and actual byte counts on replay", () => {
    const root = workspace(), service = open(root); textTurn(service);
    service.compactSurfaceEntry({ originEventId: service.liveSurfaceEntries()[0]!.originEventId, replacement: "summary", reason: "pressure" });
    const original = service.readEvents();
    for (const alter of [
      (meta: any) => { meta.compaction.basis.eventId = "wrong-parent"; },
      (meta: any) => { meta.compaction.sources[0].originEventId = "wrong-origin"; },
      (meta: any) => { meta.compaction.sources[0].bytes++; meta.compaction.replacedBytes++; meta.compaction.savedBytes++; meta.replacedBytes++; },
      (meta: any) => { meta.compaction.sources[0].sourceEventHash = "f".repeat(64); }
    ]) {
      const rows = original.map(row => {
        if (row.event_type !== "loop/compact") return row;
        const meta = JSON.parse(row.meta_json); alter(meta); return { ...row, meta_json: JSON.stringify(meta) };
      });
      expect(() => validateSurfaceCompactions(root, rows)).toThrow();
    }
    expect(service.readEvents()).toEqual(original);
  });

  it("retains origins through explicit release/resume and refuses parent origins in a lineage-only fork", () => {
    const root = workspace(), service = open(root); textTurn(service);
    const origin = service.liveSurfaceEntries()[0]!.originEventId;
    service.compactSurfaceEntry({ originEventId: origin, replacement: "retained context", reason: "pressure" });
    const sessionId = service.sessionId; service.releaseWithoutClosing();
    const resumed = resumeSession({ workspace: root, sessionId, claimant: { pid: process.pid, hostId: hostname(), bootId: "fixture", startedAt: Date.now() }, ...OPEN }).service;
    services.push(resumed);
    expect(resumed.liveSurfaceEntries().some(entry => entry.originEventId === origin)).toBe(true);
    resumed.compactSurfaceEntry({ originEventId: origin, replacement: "Q", reason: "after handover" });
    resumed.close({ reason: "completed" });
    const child = forkSession({ workspace: root, parentSessionId: sessionId,
      claimant: { pid: process.pid, hostId: hostname(), bootId: "fixture", startedAt: Date.now() }, ...OPEN }).service;
    services.push(child); const childRows = child.readEvents();
    expect(() => child.compactSurfaceEntry({ originEventId: origin, replacement: "s", reason: "foreign parent" })).toThrow(/foreign|missing/);
    expect(child.readEvents()).toEqual(childRows);
  });

  it("native operator compaction reopens the exact listed head and signs release for the next chat turn", () => {
    const root = workspace(), service = open(root); textTurn(service);
    const sessionId = service.sessionId; service.releaseWithoutClosing();
    const listed = inspectSessionCompaction(root, sessionId), before = storedRows(root, sessionId);
    const input = { workspace: root, sessionId, expectedHeadHash: listed.headEventHash,
      originEventIds: [listed.entries[0]!.originEventId], mode: "summarize" as const, replacement: "summary", reason: "operator request" };
    const result = compactReleasedSession(input);
    expect(result.ok).toBe(true); expect(result.writerReleased).toBe(true);
    expect(result.savedBytes).toBe(listed.entries[0]!.bytes! - Buffer.byteLength("summary"));
    const after = storedRows(root, sessionId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length).map(row => row.event_type)).toEqual(["session/resume", "loop/compact", "session/release"]);
    expect(() => compactReleasedSession(input)).toThrow(/head changed/);
    expect(storedRows(root, sessionId)).toEqual(after);
  });

  it("native operator validation refuses a bad range before writer acquisition", () => {
    const root = workspace(), service = open(root); textTurn(service);
    const sessionId = service.sessionId; service.releaseWithoutClosing();
    const listed = inspectSessionCompaction(root, sessionId), before = storedRows(root, sessionId);
    expect(() => compactReleasedSession({ workspace: root, sessionId, expectedHeadHash: listed.headEventHash,
      originEventIds: ["not-a-live-origin"], mode: "summarize", replacement: "summary", reason: "operator request" })).toThrow(/missing/);
    expect(storedRows(root, sessionId)).toEqual(before);
  });

  it.each(["{malformed", JSON.stringify({ v: 2, backend: "sqlite" }), JSON.stringify({ v: 1, backend: "unknown" })])(
    "refuses an invalid recorded backend rather than inspecting fallback SQLite: %s", markerText => {
      const root = workspace(), service = open(root); textTurn(service);
      const sessionId = service.sessionId; service.releaseWithoutClosing();
      const listed = inspectSessionCompaction(root, sessionId), before = storedRows(root, sessionId);
      const marker = join(root, ".amc", "session-store.json"), originalMarker = readFileSync(marker);
      writeFileSync(marker, markerText);
      try {
        expect(() => inspectSessionCompaction(root, sessionId)).toThrow(/UNSUPPORTED_FORMAT/);
        expect(() => compactReleasedSession({ workspace: root, sessionId, expectedHeadHash: listed.headEventHash,
          originEventIds: [listed.entries[0]!.originEventId], mode: "summarize", replacement: "summary", reason: "operator request" }))
          .toThrow(/UNSUPPORTED_FORMAT/);
        expect(readFileSync(marker, "utf8")).toBe(markerText);
      } finally { writeFileSync(marker, originalMarker); }
      expect(storedRows(root, sessionId)).toEqual(before);
    }
  );

  it.each([["not-a-backend", "INVALID_INPUT"], ["jsonl", "BACKEND_MISMATCH"]])(
    "refuses selector %s against recorded SQLite before returning a compaction snapshot", (backend, reason) => {
      const root = workspace(), service = open(root); textTurn(service);
      const sessionId = service.sessionId; service.releaseWithoutClosing();
      const before = storedRows(root, sessionId);
      const marker = join(root, ".amc", "session-store.json"), originalMarker = readFileSync(marker);
      vi.stubEnv("AMC_SESSION_STORE", backend);
      try {
        expect(() => inspectSessionCompaction(root, sessionId)).toThrow(reason);
        expect(readFileSync(marker)).toEqual(originalMarker);
      } finally { vi.unstubAllEnvs(); }
      expect(storedRows(root, sessionId)).toEqual(before);
    }
  );

  it("refuses a backend-marker change during authenticated measurement instead of publishing a stale snapshot", () => {
    const root = workspace(), service = open(root); textTurn(service);
    const sessionId = service.sessionId; service.releaseWithoutClosing();
    const before = storedRows(root, sessionId);
    const marker = join(root, ".amc", "session-store.json"), originalMarker = readFileSync(marker);
    const measure = surfaceCompaction.describeMeasuredLiveEntries;
    vi.spyOn(surfaceCompaction, "describeMeasuredLiveEntries").mockImplementation((selectedWorkspace, rows) => {
      const entries = measure(selectedWorkspace, rows);
      writeFileSync(marker, JSON.stringify({ v: 1, backend: "sqlite", changedDuringMeasurement: true }));
      return entries;
    });
    try {
      expect(() => inspectSessionCompaction(root, sessionId)).toThrow(/CHANGED/);
    } finally { writeFileSync(marker, originalMarker); }
    expect(storedRows(root, sessionId)).toEqual(before);
  });
});
