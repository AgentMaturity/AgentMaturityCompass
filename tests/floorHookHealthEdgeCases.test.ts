// Hook health (src/watch/hookHealthDiagnostics.ts) on the edge cases the main suite does not reach: an evidence file
// that is not a database, a hook row stored under the wrong event type, and Codex rows that are malformed or only
// flag a conflict. Each must fail closed or be left out, never read as a verified observation.
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { installHookIntegration } from "../src/adapters/hookIntegration.js";
import { ingestObservedAepHookEvent } from "../src/bridge/hookIngress.js";
import { hashBinaryOrPath, openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { inspectHookHealth } from "../src/watch/hookHealthDiagnostics.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
beforeEach(() => { vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-hook-health-edges"); });
afterEach(() => {
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-hook-health-edges-")));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated", witnessing: false });
  return root;
}

function append(root: string, input: { id: string; eventType: "tool_action" | "tool_result" | "audit"; meta: Record<string, unknown>; agentId: string }): void {
  const ledger = openLedger(root);
  const sessionId = `edge-session-${input.id}`;
  try {
    ledger.startSession({ sessionId, runtime: "any", binaryPath: "amc-edge-test", binarySha256: hashBinaryOrPath("amc-edge-test", "1") });
    ledger.appendEvidenceWithReceipt({ id: input.id, sessionId, runtime: "any", eventType: input.eventType, payload: "{}", payloadExt: "json", meta: input.meta,
      receipt: { kind: input.eventType === "audit" ? "tool_result" : input.eventType, agentId: input.agentId, providerId: `edge:${input.agentId}`, model: null, bodySha256: sha256Hex("{}") } });
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

describe("hook health edge cases", () => {
  test("an evidence file that cannot be opened as a database is unavailable and fails closed, naming the passphrase step first", () => {
    const root = workspace();
    installHookIntegration({ workspace: root, provider: "claude-code", agentId: "edge-agent", ttl: "7d" });
    // Its write-ahead log would still hold valid pages: remove it so the file on its own is all there is.
    rmSync(join(root, ".amc", "evidence.sqlite-wal"), { force: true });
    rmSync(join(root, ".amc", "evidence.sqlite-shm"), { force: true });
    writeFileSync(join(root, ".amc", "evidence.sqlite"), "this is not a sqlite database");
    const health = inspectHookHealth({ workspace: root, provider: "claude-code" });
    expect(health).toMatchObject({
      status: "fail_closed",
      failClosed: true,
      reasonCodes: ["HOOK_EVIDENCE_UNAVAILABLE"],
      evidence: { state: "unavailable", eventCount: 0, lastEvent: null }
    });
    expect(health.repairCommands[0]).toBe("AMC_VAULT_PASSPHRASE='<your vault passphrase>' amc connect hooks health --provider claude-code");
    expect(health.repairCommands).toContain("amc connect hooks install --provider claude-code --dry-run");
  });

  test("a valid hook record stored under the other event type is malformed metadata, not an observation", () => {
    const root = workspace();
    installHookIntegration({ workspace: root, provider: "claude-code", agentId: "edge-agent", ttl: "7d" });
    const now = Date.now();
    const realId = ingestObservedAepHookEvent({ workspace: root, authenticatedAgentId: "edge-agent", now,
      rawBody: Buffer.from(JSON.stringify({ aep_version: "0.1", id: "edge-source-1", type: "action.requested", time: new Date(now).toISOString(), hook: "PreToolUse",
        agent: { slug: "edge-agent", surface: "claude-code" }, action: { type: "tool_call", id: "toolu_edge_1" }, tool: { type: "native", name: "Read", original_name: "Read" } }), "utf8") }).eventId;
    const ledger = openLedger(root);
    const meta = JSON.parse(ledger.getEventById(realId)!.meta_json) as Record<string, unknown>;
    ledger.close();
    expect(meta.sourceEventType).toBe("action.requested");
    // The same metadata on a tool_result row: a requested action must be a tool_action row.
    append(root, { id: "edge-mismatched-type", eventType: "tool_result", meta, agentId: "edge-agent" });
    const health = inspectHookHealth({ workspace: root, provider: "claude-code" });
    expect(health.status).toBe("fail_closed");
    expect(health.reasonCodes).toContain("HOOK_EVENT_METADATA_INVALID");
    expect(health.evidence.state).toBe("invalid");
    expect(health.evidence.lastEvent).toBeNull();
  });

  test("Codex: a conflict-only row is not counted, and a row missing its receipt fields fails closed", () => {
    const root = workspace();
    installHookIntegration({ workspace: root, provider: "codex", agentId: "codex-edge", mode: "observe" });
    const base = { provider: "codex", codexObservationSchemaVersion: 1, agentId: "codex-edge" };
    append(root, { id: "cxpost-edge-conflict", eventType: "audit", agentId: "codex-edge",
      meta: { ...base, actionId: "a1", receipt_id: "r1", receipt_sha256: "f".repeat(64), conflictOf: "cxpost-earlier" } });
    append(root, { id: "cxpost-edge-other-agent", eventType: "audit", agentId: "someone-else",
      meta: { ...base, agentId: "someone-else", actionId: "a2", receipt_id: "r2", receipt_sha256: "e".repeat(64) } });
    const quiet = inspectHookHealth({ workspace: root, provider: "codex" });
    expect(quiet).toMatchObject({ status: "awaiting_first_event", reasonCodes: ["HOOK_EVENT_NOT_OBSERVED"], evidence: { state: "missing", eventCount: 0 } });

    append(root, { id: "cxpost-edge-malformed", eventType: "audit", agentId: "codex-edge", meta: { ...base, actionId: 7 } });
    const malformed = inspectHookHealth({ workspace: root, provider: "codex" });
    expect(malformed).toMatchObject({ status: "fail_closed", failClosed: true, evidence: { state: "invalid", eventCount: 0, lastEvent: null } });
    expect(malformed.reasonCodes).toContain("HOOK_EVENT_METADATA_INVALID");
    expect(malformed.reasonCodes).not.toContain("HOOK_EVENT_NOT_OBSERVED");
    expect(malformed.repairCommands).toEqual(["amc connect hooks status --provider codex", "amc connect hooks install --provider codex --dry-run"]);
  });
});
