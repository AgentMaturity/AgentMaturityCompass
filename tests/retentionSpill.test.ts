import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractSpillRef } from "../src/session/spill/spillTypes.js";
import { inspectSpilledEvent } from "../src/session/spill/spillEvidence.js";
import { eraseSessionSpills } from "../src/session/spill/spillLifecycle.js";
import { resolveSpillPath } from "../src/session/spill/spillStore.js";
import { runRetention } from "../src/ops/retention/retentionEngine.js";
import { loadBlobPlaintext } from "../src/storage/blobs/blobStore.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../src/ops/policy.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

// Synthetic clock inputs create old signed rows normally. No timestamp is
// rewritten after signing and no production key/workspace is involved.
const DAY = 24 * 60 * 60 * 1000;
const CONTENT = "synthetic-private-retention-output-".repeat(250);
const CONFIG = { maxInlineBytes: 1024, previewHeadBytes: 64, previewTailBytes: 32 };

describe("retention reaches committed spill objects without selecting active sessions", () => {
  let workspace: string;
  let previousPass: string | undefined;
  let previousNoSign: string | undefined;
  let now: number;

  beforeEach(() => {
    previousPass = process.env.AMC_VAULT_PASSPHRASE;
    previousNoSign = process.env.AMC_NO_SIGN;
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-retention-spill-passphrase";
    delete process.env.AMC_NO_SIGN;
    workspace = mkdtempSync(join(tmpdir(), "amc-retention-spill-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    now = Date.now();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    lockVault(workspace);
    rmSync(workspace, { recursive: true, force: true });
    if (previousPass === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = previousPass;
    if (previousNoSign === undefined) delete process.env.AMC_NO_SIGN;
    else process.env.AMC_NO_SIGN = previousNoSign;
  });

  function events(): EvidenceEvent[] {
    const ledger = openLedger(workspace);
    try { return ledger.getAllEvents(); }
    finally { ledger.close(); }
  }

  function auditPayload(event: EvidenceEvent): Record<string, unknown> {
    const inline = event.canonical_payload_inline ?? event.payload_inline;
    if (inline !== null) return JSON.parse(inline);
    const path = event.canonical_payload_path ?? event.payload_path;
    if (!path) throw new Error("audit fixture is missing its recorded payload");
    return JSON.parse(loadBlobPlaintext(workspace, path).bytes.toString("utf8"));
  }

  function oldTime(): number {
    return now - (loadOpsPolicy(workspace).opsPolicy.retention.prunePayloadsAfterDays + 2) * DAY;
  }

  function fixture(sessionId: string, at: number, closeAt: number | null): { event: EvidenceEvent; path: string } {
    const clock = vi.spyOn(Date, "now").mockReturnValue(at);
    let service: SessionService | undefined;
    try {
      service = new SessionService(workspace, undefined, CONFIG);
      service.open({ sessionId, agentId: "default", harnessVersion: "synthetic-fixture",
        compositionDigest: sha256Hex("retention-composition"), policyDigest: sha256Hex("retention-policy") });
      service.startTurn({ trigger: "user" });
      service.startStep();
      service.recordToolCall({ toolCallId: "call-1", toolName: "fixture", args: "{}", dispatch: "native", parentToken: null });
      service.recordToolResult({ toolCallId: "call-1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: CONTENT });
      if (closeAt !== null) {
        clock.mockReturnValue(closeAt);
        service.endStep({ stopReason: "end_turn", usage: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 } });
        service.endTurn({ reason: "complete" });
        service.sealTurn();
        service.close({ reason: "synthetic fixture finished" });
        service = undefined;
      }
    } finally { service?.disposeWithoutClosing(); clock.mockRestore(); }
    const event = events().find(row => row.session_id === sessionId && row.event_type === "tool/result")!;
    const ref = extractSpillRef(event.meta_json)!;
    expect(ref.v).toBe(2);
    expect(ref.unretrievable).toBeNull();
    const path = resolveSpillPath(workspace, ref.locator!)!;
    expect(existsSync(path)).toBe(true);
    return { event, path };
  }

  it("prunes the encrypted object for an expired signed closed session and records exact erasure outcomes", () => {
    const retained = fixture("expired-closed", oldTime(), oldTime());
    const before = events().filter(row => row.session_id === "expired-closed");
    expect(before.at(-1)?.event_type).toBe("session/close");
    const result = runRetention({ workspace, dryRun: false });
    expect(result.prunedSpillCount).toBe(1);
    expect(existsSync(retained.path)).toBe(false);
    const after = events();
    const resultRow = after.find(row => row.id === retained.event.id)!;
    expect(resultRow.payload_pruned).toBe(1);
    expect(resultRow.event_hash).toBe(retained.event.event_hash);
    expect(inspectSpilledEvent(workspace, resultRow).status).toBe("missing");
    const intended = after.find(row => JSON.parse(row.meta_json).auditType === "SESSION_SPILL_ERASURE_INTENDED");
    const finished = after.find(row => JSON.parse(row.meta_json).auditType === "SESSION_SPILL_ERASURE_FINISHED");
    expect(intended).toBeDefined();
    expect(finished).toBeDefined();
    expect(auditPayload(finished!)).toMatchObject({ ok: true,
      outcomes: [expect.objectContaining({ locator: extractSpillRef(retained.event.meta_json)!.locator, status: "removed" })] });
    expect(after.indexOf(intended!)).toBeLessThan(after.indexOf(finished!));
    expect(runRetention({ workspace, dryRun: false }).prunedSpillCount).toBe(0);
  });

  it("makes retention progress when a backlog exceeds one signed audit payload while keeping every locator's exact references together", () => {
    // A deliberately small signed fixture policy exercises the production
    // preflight boundary without manufacturing a large or slow workspace.
    const policy = loadOpsPolicy(workspace);
    policy.opsPolicy.retention.maxPayloadBytesPerEvent = 8192;
    writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
    signOpsPolicy(workspace);
    const retained = ["backlog-first", "backlog-second", "backlog-third"].map(sessionId =>
      fixture(sessionId, oldTime(), oldTime()));
    const before = events();
    const exactReferences = new Map(retained.map(item => {
      const locator = extractSpillRef(item.event.meta_json)!.locator!;
      const linked = before.filter(event => extractSpillRef(event.meta_json)?.locator === locator);
      expect(linked.map(event => event.event_type).sort()).toEqual(["tool/result", "tool/spill-commitment"]);
      return [locator, linked.map(event => event.id).sort()] as const;
    }));
    const snapshots = retained.map(item => readFileSync(item.path));
    // Establish with the actual admission gate that the original aggregate
    // selection cannot proceed. The refusal must occur before any unlink/audit.
    expect(() => eraseSessionSpills({ workspace, events: before,
      scope: { eventIds: [...exactReferences.values()].flat() }, reason: "synthetic backlog admission probe" }))
      .toThrow(/selection exceeds the signed audit payload limit/);
    expect(retained.map(item => readFileSync(item.path))).toEqual(snapshots);
    expect(events().some(event => JSON.parse(event.meta_json).auditType === "SESSION_SPILL_ERASURE_INTENDED")).toBe(false);

    const result = runRetention({ workspace, dryRun: false });
    expect(result.prunedSpillCount).toBe(retained.length);
    for (const item of retained) expect(existsSync(item.path)).toBe(false);
    const after = events();
    const intentions = after.filter(event => JSON.parse(event.meta_json).auditType === "SESSION_SPILL_ERASURE_INTENDED");
    const finished = after.filter(event => JSON.parse(event.meta_json).auditType === "SESSION_SPILL_ERASURE_FINISHED");
    expect(intentions).toHaveLength(retained.length);
    expect(finished).toHaveLength(retained.length);
    const removed = new Set<string>();
    for (const event of finished) {
      const payload = auditPayload(event);
      expect(payload.ok).toBe(true);
      const outcomes = payload.outcomes as Array<{ locator: string; eventIds: string[]; status: string }>;
      expect(outcomes).toHaveLength(1);
      const outcome = outcomes[0]!;
      expect(outcome.status).toBe("removed");
      expect(exactReferences.has(outcome.locator)).toBe(true);
      expect(outcome.eventIds).toEqual(exactReferences.get(outcome.locator));
      expect(removed.has(outcome.locator)).toBe(false);
      removed.add(outcome.locator);
      const intention = intentions.find(row => row.id === payload.intentionEventId);
      expect(intention).toBeDefined();
      expect(auditPayload(intention!)).toMatchObject({ selectedObjects: 1,
        eventIds: exactReferences.get(outcome.locator), sessionIds: [] });
      expect(after.indexOf(intention!)).toBeLessThan(after.indexOf(event));
      expect(result.auditEventIds).toContain(intention!.id);
      expect(result.auditEventIds).toContain(event.id);
    }
    expect([...removed].sort()).toEqual([...exactReferences.keys()].sort());
  });

  it("preserves an old active session, a young closed session and an old result whose close is recent", () => {
    const active = fixture("old-active", oldTime(), null);
    const young = fixture("young-closed", now, now);
    const recentClose = fixture("recent-close", oldTime(), now);
    const before = [active, young, recentClose].map(row => sha256Hex(readFileSync(row.path)));
    const result = runRetention({ workspace, dryRun: false });
    expect(result.prunedSpillCount).toBe(0);
    expect([active, young, recentClose].map(row => sha256Hex(readFileSync(row.path)))).toEqual(before);
    for (const row of [active, young, recentClose]) expect(inspectSpilledEvent(workspace, row.event).status).toBe("ok");
    expect(events().some(row => JSON.parse(row.meta_json).auditType === "SESSION_SPILL_ERASURE_FINISHED")).toBe(false);
  });

  it("dry run leaves expired retained bytes and result payloads intact", () => {
    const retained = fixture("dry-run-closed", oldTime(), oldTime());
    const before = readFileSync(retained.path);
    const result = runRetention({ workspace, dryRun: true });
    expect(result.prunedSpillCount).toBe(0);
    expect(readFileSync(retained.path)).toEqual(before);
    expect(events().find(row => row.id === retained.event.id)?.payload_pruned).toBe(0);
    expect(events().some(row => JSON.parse(row.meta_json).auditType === "SESSION_SPILL_ERASURE_INTENDED")).toBe(false);
  });

  it("a forged spill reference blocks erasure even when the real object and session are expired", () => {
    const retained = fixture("forged-retention", oldTime(), oldTime());
    const before = readFileSync(retained.path);
    const database = new Database(join(workspace, ".amc", "evidence.sqlite"));
    try {
      const triggers = database.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'evidence_events'")
        .all() as Array<{ name: string; sql: string }>;
      const forged = JSON.parse(retained.event.meta_json);
      forged.spilled.contentSha256 = sha256Hex("different synthetic content");
      database.transaction(() => {
        for (const trigger of triggers) database.exec(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`);
        database.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(forged), retained.event.id);
        for (const trigger of triggers) database.exec(trigger.sql);
      })();
    } finally { database.close(); }
    expect(() => runRetention({ workspace, dryRun: false })).toThrow(/Spill retention refused/);
    expect(readFileSync(retained.path)).toEqual(before);
    expect(events().some(row => JSON.parse(row.meta_json).auditType === "SESSION_SPILL_ERASURE_INTENDED")).toBe(false);
  });
});
