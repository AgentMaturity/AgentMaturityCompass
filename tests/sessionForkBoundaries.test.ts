import { mkdtempSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initProcessorRegistry } from "../src/dataflow/processorRegistry.js";
import { createWorkspaceRedactor } from "../src/dataflow/redactingSession.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import type { SessionEventStore } from "../src/persistence/sessionEventStore.js";
import { forkSession } from "../src/session/sessionResume.js";
import { SessionService } from "../src/session/sessionService.js";
import { DEFAULT_SPILL_POLICY } from "../src/session/spill/spillTypes.js";
import { foldSurfaceEntries } from "../src/session/surfaceProjection.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const identity = { agentId: "default", harnessVersion: "fork-boundary-fixture", compositionDigest: sha256Hex("fork-composition"), policyDigest: sha256Hex("fork-policy") };
const claimant = { pid: process.pid, hostId: hostname(), bootId: "fork-boundary-fixture", startedAt: 1_700_000_000 };
const roots: string[] = [], services: SessionService[] = [];

beforeEach(() => {
  for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "disposable-fork-boundary-fixture");
});
afterEach(() => {
  for (const service of services.splice(0)) { try { service.disposeWithoutClosing(); } catch { /* already closed */ } }
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function workspace(backend: "sqlite" | "jsonl"): string {
  vi.stubEnv("AMC_SESSION_STORE", backend);
  const root = mkdtempSync(join(tmpdir(), "amc-fork-boundaries-")); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" }); return root;
}
function open(root: string, maxInlineBytes = DEFAULT_SPILL_POLICY.maxInlineBytes): SessionService {
  const service = new SessionService(root, undefined, { maxInlineBytes }); services.push(service); service.open(identity); return service;
}
function rows(root: string, sessionId?: string) {
  const reader = openSessionEventStore(root, undefined, { readOnly: true });
  try { return sessionId === undefined ? [...reader.readAllEvents()] : [...reader.readSessionEvents(sessionId)]; }
  finally { reader.close(); }
}
function fork(root: string, parentSessionId: string, store?: SessionEventStore) {
  const result = forkSession({ workspace: root, parentSessionId, claimant, ...identity, ...(store ? { store } : {}) });
  services.push(result.service); return result;
}
function toolTurn(service: SessionService, content: string, outcome: "OK" | "TOOL_OUTCOME_UNKNOWN"): void {
  service.startTurn({ trigger: "user" }); service.recordUserMessage("Inspect recorded output"); service.startStep();
  service.recordToolCall({ toolCallId: "source-call", toolName: "fs.read", args: "{}", dispatch: "native", parentToken: null });
  service.recordToolResult({ toolCallId: "source-call", content, outcome, exitCode: outcome === "OK" ? 0 : null, timedOut: false, denied: false });
  service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn(); service.close({ reason: "completed" });
}
function refusedBeforeChild(root: string, parentSessionId: string): void {
  const before = rows(root), opened = vi.spyOn(SessionService.prototype, "open");
  try { expect(() => fork(root, parentSessionId)).toThrow(); expect(opened).not.toHaveBeenCalled(); expect(rows(root)).toEqual(before); }
  finally { opened.mockRestore(); }
}

describe.each(["sqlite", "jsonl"] as const)("fork copy boundaries (%s)", backend => {
  test("requires an explicit boolean for lineage-only mode before creating a child", () => {
    const root = workspace(backend), parent = open(root); parent.close({ reason: "completed" });
    const before = rows(root), opened = vi.spyOn(SessionService.prototype, "open");
    try {
      expect(() => forkSession({ workspace: root, parentSessionId: parent.sessionId, claimant, ...identity,
        inheritConversation: "false" as unknown as boolean })).toThrow("inheritConversation must be a boolean");
      expect(opened).not.toHaveBeenCalled(); expect(rows(root)).toEqual(before);
    } finally { opened.mockRestore(); }
  });

  test("refuses a valid unspilled parent result that the child default policy would truncate", () => {
    const root = workspace(backend), content = "x".repeat(DEFAULT_SPILL_POLICY.maxInlineBytes + 1), parent = open(root, content.length + 1);
    toolTurn(parent, content, "OK");
    const original = rows(root, parent.sessionId).find(row => row.event_type === "tool/result")!;
    expect(JSON.parse(original.meta_json).spilled).toBeNull(); expect(original.payload_sha256).toBe(sha256Hex(content));
    refusedBeforeChild(root, parent.sessionId);
  });

  test("refuses unknown tool outcomes before copied history can acquire false settled accounting", () => {
    const root = workspace(backend), parent = open(root); toolTurn(parent, "The original side effect remains unknown.", "TOOL_OUTCOME_UNKNOWN");
    refusedBeforeChild(root, parent.sessionId);
  });

  test("current redaction that changes inherited bytes refuses without returning an admitted child", () => {
    const root = workspace(backend), original = "Contact patient@example.com for the original record.", parent = open(root);
    parent.startTurn({ trigger: "user" }); parent.recordUserMessage(original); parent.endTurn({ reason: "complete" }); parent.sealTurn(); parent.close({ reason: "completed" });
    const before = rows(root, parent.sessionId);
    initProcessorRegistry(root, { schemaVersion: "amc.dataflow-processors/v1", experimental: true, processors: [], purposes: [], bindings: [] });
    expect(createWorkspaceRedactor(root).redact(original).text).not.toBe(original);
    expect(() => fork(root, parent.sessionId)).toThrow(/changed inherited bytes|redact/i);
    expect(rows(root, parent.sessionId)).toEqual(before);
  });
});

test("a supplied SQLite store cannot change authenticated parent message roles", () => {
  const root = workspace("sqlite"), parent = open(root); parent.startTurn({ trigger: "user" }); parent.recordUserMessage("Untrusted user content.");
  parent.endTurn({ reason: "complete" }); parent.sealTurn(); parent.close({ reason: "completed" });
  const before = rows(root), original = rows(root, parent.sessionId), writer = openSessionEventStore(root);
  const supplied = new Proxy(writer, { get(target, property) {
    if (property === "readSessionEvents") return (sessionId: string) => target.readSessionEvents(sessionId).map(row => {
      if (sessionId !== parent.sessionId || row.event_type !== "user/message") return row;
      const metadata = JSON.parse(row.meta_json); metadata.amcSession.surface.role = "assistant";
      return { ...row, meta_json: JSON.stringify(metadata) }; // Original hashes deliberately retained.
    });
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  let result: ReturnType<typeof fork> | undefined, refusal: unknown;
  try { result = fork(root, parent.sessionId, supplied); } catch (error) { refusal = error; }
  try {
    if (result) {
      const copied = foldSurfaceEntries(result.service.readEvents()).map(entry => ({ role: entry.role, part: entry.part }));
      expect(copied).toEqual(foldSurfaceEntries(original).map(entry => ({ role: entry.role, part: entry.part })));
      result.service.close({ reason: "completed" });
    } else { expect(refusal).toBeInstanceOf(Error); expect(rows(root)).toEqual(before); }
    expect(rows(root, parent.sessionId)).toEqual(original);
  } finally { try { writer.close(); } catch { /* child close may already own the handle */ } }
});
