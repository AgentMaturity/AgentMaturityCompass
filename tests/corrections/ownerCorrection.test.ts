import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initCorrectionTables,
  insertCorrection,
  getCorrectionsByAgent,
  getLastCorrectionHash
} from "../../src/corrections/correctionStore.js";
import { buildOwnerCorrection } from "../../src/corrections/correctionTracker.js";

/**
 * `amc correction add` assembled its own object literal with three `as any`
 * casts, which silenced the compiler while the shape was wrong three ways:
 * triggerType was "human_feedback" (the CHECK allows only OWNER_MANUAL and
 * five others), twelve NOT NULL columns were missing, and two invented fields
 * were supplied instead. Every invocation died with
 * `NOT NULL constraint failed: corrections.baseline_run_id`, so the entire
 * `amc correction` family had never worked — the CLI was its only caller.
 */
describe("owner correction", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-corrections-"));
    db = new Database(join(dir, "corrections.sqlite"));
    initCorrectionTables(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const build = (overrides: Record<string, unknown> = {}) =>
    buildOwnerCorrection({
      agentId: "default",
      questionIds: ["AMC-1.1"],
      description: "tightened guardrails",
      appliedAction: "updated guardrails.yaml",
      baselineRunId: "run-baseline-1",
      baselineLevels: { "AMC-1.1": 2 },
      previousCorrectionHash: getLastCorrectionHash(db, "default"),
      correctionId: "11111111-1111-4111-8111-111111111111",
      triggerId: "22222222-2222-4222-8222-222222222222",
      now: 1_700_000_000_000,
      ...overrides
    } as Parameters<typeof buildOwnerCorrection>[0]);

  it("inserts without violating the schema", () => {
    // The exact failure the CLI hit on every invocation.
    expect(() => insertCorrection(db, build())).not.toThrow();
  });

  it("uses a trigger type the CHECK constraint allows", () => {
    const correction = build();
    expect(correction.triggerType).toBe("OWNER_MANUAL");
    insertCorrection(db, correction);
    const stored = db
      .prepare("SELECT trigger_type FROM corrections WHERE correction_id = ?")
      .get(correction.correctionId) as { trigger_type: string };
    expect(stored.trigger_type).toBe("OWNER_MANUAL");
  });

  it("round-trips through the store", () => {
    const correction = build();
    insertCorrection(db, correction);
    const rows = getCorrectionsByAgent(db, "default");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.correctionDescription).toBe("tightened guardrails");
    expect(rows[0]!.baselineRunId).toBe("run-baseline-1");
    expect(rows[0]!.baselineLevels).toEqual({ "AMC-1.1": 2 });
  });

  it("records a baseline so effectiveness can later be verified", () => {
    const correction = build();
    // Unverified on creation — verification needs a later run to compare to.
    expect(correction.status).toBe("PENDING_VERIFICATION");
    expect(correction.verificationRunId).toBeNull();
    expect(correction.effectivenessScore).toBeNull();
    expect(correction.baselineRunId).not.toBe("");
  });

  it("chains each correction to the previous one", () => {
    const first = build();
    insertCorrection(db, first);
    const second = build({
      correctionId: "33333333-3333-4333-8333-333333333333",
      previousCorrectionHash: getLastCorrectionHash(db, "default")
    });
    insertCorrection(db, second);
    expect(second.prev_correction_hash).toBe(first.correction_hash);
    expect(second.correction_hash).not.toBe(first.correction_hash);
  });
});
