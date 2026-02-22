import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";
import {
  getCorrectionById,
  getCorrectionsByAgent,
  getPendingCorrections,
  getVerifiedCorrections,
  initCorrectionTables,
  insertCorrection,
  updateCorrectionVerification,
} from "../src/corrections/correctionStore.js";
import { insertClaim } from "../src/claims/claimStore.js";
import { sweepStaleClaims } from "../src/claims/claimExpiry.js";
import type { Claim } from "../src/claims/claimTypes.js";
import type { CorrectionEvent } from "../src/corrections/correctionTypes.js";

function makeCorrection(now: number): CorrectionEvent {
  return {
    correctionId: "corr-1",
    agentId: "agent-1",
    triggerType: "ASSURANCE_FAILURE",
    triggerId: "run-0",
    questionIds: ["Q1"],
    correctionDescription: "Improve evidence quality",
    appliedAction: "Updated monitoring policy",
    status: "PENDING_VERIFICATION",
    baselineRunId: "baseline-run",
    baselineLevels: { Q1: 2 },
    verificationRunId: null,
    verificationLevels: null,
    effectivenessScore: null,
    verifiedTs: null,
    verifiedBy: null,
    createdTs: now,
    updatedTs: now,
    prev_correction_hash: "GENESIS_CORRECTION",
    correction_hash: "corr-hash-0",
    signature: "corr-sig-0",
  };
}

function initClaimTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      claim_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      assertion_text TEXT NOT NULL,
      claimed_level INTEGER NOT NULL,
      provenance_tag TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      trust_tier TEXT NOT NULL,
      promoted_from_claim_id TEXT,
      promotion_evidence_json TEXT NOT NULL DEFAULT '[]',
      superseded_by_claim_id TEXT,
      created_ts INTEGER NOT NULL,
      last_verified_ts INTEGER NOT NULL,
      expiry_ts INTEGER,
      prev_claim_hash TEXT NOT NULL,
      claim_hash TEXT NOT NULL,
      signature TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claim_transitions (
      transition_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      ts INTEGER NOT NULL,
      signature TEXT NOT NULL,
      FOREIGN KEY (claim_id) REFERENCES claims(claim_id)
    );

    CREATE TRIGGER IF NOT EXISTS protect_claims_immutable
    BEFORE UPDATE ON claims
    BEGIN
      SELECT RAISE(ABORT, 'claims are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_claims
    BEFORE DELETE ON claims
    BEGIN
      SELECT RAISE(ABORT, 'claims cannot be deleted');
    END;
  `);
}

function makeStaleClaim(now: number): Claim {
  return {
    claimId: "claim-1",
    agentId: "agent-1",
    runId: "run-1",
    questionId: "Q1",
    assertionText: "System meets requirement",
    claimedLevel: 3,
    provenanceTag: "OBSERVED_FACT",
    lifecycleState: "PROMOTED",
    confidence: 0.88,
    evidenceRefs: ["ev-1"],
    trustTier: "OBSERVED",
    promotedFromClaimId: null,
    promotionEvidence: [],
    supersededByClaimId: null,
    createdTs: now - (95 * 24 * 60 * 60 * 1000),
    lastVerifiedTs: now - (95 * 24 * 60 * 60 * 1000),
    expiryTs: null,
    prev_claim_hash: "GENESIS_CLAIMS",
    claim_hash: "claim-hash-1",
    signature: "claim-sig-1",
  };
}

describe("append-only lifecycle fixes", () => {
  test("correction verification appends shadow verification state instead of deleting corrections", () => {
    const db = new Database(":memory:");
    initCorrectionTables(db);

    const now = Date.now();
    insertCorrection(db, makeCorrection(now));

    expect(() =>
      updateCorrectionVerification(
        db,
        "corr-1",
        "verify-run-1",
        { Q1: 4 },
        0.75,
        "VERIFIED_EFFECTIVE",
        now + 1000,
        "verify-run-1",
        "corr-hash-1",
        "corr-sig-1",
      )
    ).not.toThrow();

    const updated = getCorrectionById(db, "corr-1");
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("VERIFIED_EFFECTIVE");
    expect(updated!.verificationRunId).toBe("verify-run-1");
    expect(updated!.effectivenessScore).toBe(0.75);
    expect(updated!.correction_hash).toBe("corr-hash-1");

    expect(getPendingCorrections(db, "agent-1")).toHaveLength(0);
    expect(getVerifiedCorrections(db, "agent-1")).toHaveLength(1);

    const counts = db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM corrections) AS correction_rows,
          (SELECT COUNT(*) FROM corrections_verification) AS verification_rows
      `)
      .get() as { correction_rows: number; verification_rows: number };
    expect(counts.correction_rows).toBe(1);
    expect(counts.verification_rows).toBe(1);

    updateCorrectionVerification(
      db,
      "corr-1",
      "verify-run-2",
      { Q1: 2 },
      0.1,
      "VERIFIED_INEFFECTIVE",
      now + 2000,
      "verify-run-2",
      "corr-hash-2",
      "corr-sig-2",
    );

    const latest = getCorrectionById(db, "corr-1");
    expect(latest).not.toBeNull();
    expect(latest!.status).toBe("VERIFIED_INEFFECTIVE");
    expect(latest!.verificationRunId).toBe("verify-run-2");
    expect(latest!.correction_hash).toBe("corr-hash-2");

    expect(getCorrectionsByAgent(db, "agent-1", "VERIFIED_INEFFECTIVE")).toHaveLength(1);
    expect(getCorrectionsByAgent(db, "agent-1", "PENDING_VERIFICATION")).toHaveLength(0);

    const verificationRows = db
      .prepare("SELECT COUNT(*) AS count FROM corrections_verification")
      .get() as { count: number };
    expect(verificationRows.count).toBe(2);
  });

  test("stale claim sweep appends EXPIRED claim records and never updates claims table", () => {
    const db = new Database(":memory:");
    initClaimTables(db);

    const now = Date.now();
    insertClaim(db, makeStaleClaim(now));

    const firstSweep = sweepStaleClaims(db, "agent-1", "/tmp/amc-wave1/agent-1", now);
    expect(firstSweep.errors).toEqual([]);
    expect(firstSweep.demoted).toEqual(["claim-1"]);

    const claimRows = db
      .prepare(`
        SELECT claim_id, lifecycle_state, promoted_from_claim_id
        FROM claims
        ORDER BY rowid ASC
      `)
      .all() as Array<{
      claim_id: string;
      lifecycle_state: string;
      promoted_from_claim_id: string | null;
    }>;
    expect(claimRows).toHaveLength(2);
    expect(claimRows[0]!.claim_id).toBe("claim-1");
    expect(claimRows[0]!.lifecycle_state).toBe("PROMOTED");

    const expiredRow = claimRows.find((row) => row.lifecycle_state === "EXPIRED");
    expect(expiredRow).toBeDefined();
    expect(expiredRow!.promoted_from_claim_id).toBe("claim-1");

    const transitions = db
      .prepare("SELECT claim_id, to_state FROM claim_transitions")
      .all() as Array<{ claim_id: string; to_state: string }>;
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.claim_id).toBe("claim-1");
    expect(transitions[0]!.to_state).toBe("EXPIRED");

    const secondSweep = sweepStaleClaims(db, "agent-1", "/tmp/amc-wave1/agent-1", now + 1000);
    expect(secondSweep.demoted).toEqual([]);
    expect(secondSweep.skipped).toContain("claim-1");

    const claimCount = db
      .prepare("SELECT COUNT(*) AS count FROM claims")
      .get() as { count: number };
    expect(claimCount.count).toBe(2);
  });
});
