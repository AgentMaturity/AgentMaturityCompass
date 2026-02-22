import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";
import {
  initCorrectionTables,
  insertCorrection,
  updateCorrectionVerification,
  getCorrectionsByAgent,
  getCorrectionsByQuestion,
  getPendingCorrections,
  getLastCorrectionHash,
  getCorrectionById,
  getVerifiedCorrections,
  getCorrectionsByTriggerType,
  getCorrectionsByWindow
} from "../src/corrections/correctionStore.js";
import {
  verifyCorrection,
  computeCorrectionHash,
  computeEffectivenessReport
} from "../src/corrections/correctionTracker.js";
import {
  checkClosureEligibility,
  getOpenFeedbackLoops,
  generateFeedbackClosureReport,
  renderFeedbackClosureReport
} from "../src/corrections/feedbackClosure.js";
import type { CorrectionEvent, CorrectionStatus } from "../src/corrections/correctionTypes.js";
import type { DiagnosticReport } from "../src/types.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initCorrectionTables(db);
  return db;
}

function makeCorrection(overrides: Partial<CorrectionEvent> = {}): CorrectionEvent {
  const now = overrides.createdTs ?? Date.now();
  return {
    correctionId: overrides.correctionId ?? `corr_${Math.random().toString(36).slice(2, 10)}`,
    agentId: overrides.agentId ?? "agent-1",
    triggerType: overrides.triggerType ?? "ASSURANCE_FAILURE",
    triggerId: overrides.triggerId ?? "trigger-1",
    questionIds: overrides.questionIds ?? ["AMC-2.1"],
    correctionDescription: overrides.correctionDescription ?? "Adjusted policy rules",
    appliedAction: overrides.appliedAction ?? "updated policy.yaml",
    status: overrides.status ?? "PENDING_VERIFICATION",
    baselineRunId: overrides.baselineRunId ?? "run-baseline",
    baselineLevels: overrides.baselineLevels ?? { "AMC-2.1": 2 },
    verificationRunId: overrides.verificationRunId ?? null,
    verificationLevels: overrides.verificationLevels ?? null,
    effectivenessScore: overrides.effectivenessScore ?? null,
    verifiedTs: overrides.verifiedTs ?? null,
    verifiedBy: overrides.verifiedBy ?? null,
    createdTs: now,
    updatedTs: overrides.updatedTs ?? now,
    prev_correction_hash: overrides.prev_correction_hash ?? "GENESIS_CORRECTION",
    correction_hash: overrides.correction_hash ?? `hash_${Math.random().toString(36).slice(2, 10)}`,
    signature: overrides.signature ?? "sig"
  };
}

function makeDiagnosticReport(overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  const ts = overrides.ts ?? Date.now();
  return {
    agentId: overrides.agentId ?? "agent-1",
    runId: overrides.runId ?? "run-verify",
    ts,
    windowStartTs: overrides.windowStartTs ?? ts - 86_400_000,
    windowEndTs: overrides.windowEndTs ?? ts,
    status: overrides.status ?? "VALID",
    verificationPassed: overrides.verificationPassed ?? true,
    trustBoundaryViolated: overrides.trustBoundaryViolated ?? false,
    trustBoundaryMessage: overrides.trustBoundaryMessage ?? null,
    integrityIndex: overrides.integrityIndex ?? 0.8,
    trustLabel: overrides.trustLabel ?? "HIGH TRUST",
    targetProfileId: overrides.targetProfileId ?? null,
    layerScores: overrides.layerScores ?? [],
    questionScores: overrides.questionScores ?? [
      {
        questionId: "AMC-2.1",
        claimedLevel: 4,
        supportedMaxLevel: 4,
        finalLevel: 4,
        confidence: 0.9,
        evidenceEventIds: [],
        flags: [],
        narrative: ""
      }
    ],
    inflationAttempts: overrides.inflationAttempts ?? [],
    unsupportedClaimCount: overrides.unsupportedClaimCount ?? 0,
    contradictionCount: overrides.contradictionCount ?? 0,
    correlationRatio: overrides.correlationRatio ?? 1,
    invalidReceiptsCount: overrides.invalidReceiptsCount ?? 0,
    correlationWarnings: overrides.correlationWarnings ?? [],
    evidenceCoverage: overrides.evidenceCoverage ?? 0.9,
    evidenceTrustCoverage: overrides.evidenceTrustCoverage ?? { observed: 0.8, attested: 0.1, selfReported: 0.1 },
    targetDiff: overrides.targetDiff ?? [],
    prioritizedUpgradeActions: overrides.prioritizedUpgradeActions ?? [],
    evidenceToCollectNext: overrides.evidenceToCollectNext ?? [],
    runSealSig: overrides.runSealSig ?? "seal",
    reportJsonSha256: overrides.reportJsonSha256 ?? "x".repeat(64)
  };
}

describe("corrections coverage", () => {
  test("initCorrectionTables is idempotent", () => {
    const db = freshDb();
    initCorrectionTables(db);
    initCorrectionTables(db);
    db.close();
  });

  test("insertCorrection and getCorrectionById round-trip full payload", () => {
    const db = freshDb();
    const correction = makeCorrection({ correctionId: "corr-roundtrip", questionIds: ["AMC-2.1", "AMC-3.1"] });
    insertCorrection(db, correction);
    const loaded = getCorrectionById(db, "corr-roundtrip");
    expect(loaded).not.toBeNull();
    expect(loaded?.questionIds).toEqual(["AMC-2.1", "AMC-3.1"]);
    expect(loaded?.status).toBe("PENDING_VERIFICATION");
    db.close();
  });

  test("getCorrectionById returns null for unknown correction", () => {
    const db = freshDb();
    expect(getCorrectionById(db, "missing")).toBeNull();
    db.close();
  });

  test("getLastCorrectionHash returns genesis value when no corrections exist", () => {
    const db = freshDb();
    expect(getLastCorrectionHash(db, "agent-1")).toBe("GENESIS_CORRECTION");
    db.close();
  });

  test("getCorrectionsByAgent sorts by createdTs desc and filters by status", () => {
    const db = freshDb();
    insertCorrection(db, makeCorrection({ correctionId: "corr-old", createdTs: 1000, status: "APPLIED" }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-new", createdTs: 2000, status: "VERIFIED_EFFECTIVE" }));

    const all = getCorrectionsByAgent(db, "agent-1");
    expect(all.map((c) => c.correctionId)).toEqual(["corr-new", "corr-old"]);

    const verified = getCorrectionsByAgent(db, "agent-1", "VERIFIED_EFFECTIVE");
    expect(verified).toHaveLength(1);
    expect(verified[0]?.correctionId).toBe("corr-new");
    db.close();
  });

  test("getCorrectionsByQuestion finds entries by JSON question id", () => {
    const db = freshDb();
    insertCorrection(db, makeCorrection({ correctionId: "corr-q1", questionIds: ["AMC-1.1"] }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-q2", questionIds: ["AMC-3.3"] }));
    const rows = getCorrectionsByQuestion(db, "agent-1", "AMC-1.1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.correctionId).toBe("corr-q1");
    db.close();
  });

  test("getPendingCorrections includes APPLIED and PENDING_VERIFICATION ordered asc", () => {
    const db = freshDb();
    insertCorrection(db, makeCorrection({ correctionId: "corr-c", createdTs: 3000, status: "VERIFIED_EFFECTIVE" }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-a", createdTs: 1000, status: "APPLIED" }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-b", createdTs: 2000, status: "PENDING_VERIFICATION" }));
    const pending = getPendingCorrections(db, "agent-1");
    expect(pending.map((c) => c.correctionId)).toEqual(["corr-a", "corr-b"]);
    db.close();
  });

  test("getVerifiedCorrections returns both verified states ordered by verifiedTs desc", () => {
    const db = freshDb();
    insertCorrection(db, makeCorrection({ correctionId: "corr-ineff", status: "VERIFIED_INEFFECTIVE", verifiedTs: 1000 }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-eff", status: "VERIFIED_EFFECTIVE", verifiedTs: 2000 }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-pending", status: "PENDING_VERIFICATION" }));
    const verified = getVerifiedCorrections(db, "agent-1");
    expect(verified.map((c) => c.correctionId)).toEqual(["corr-eff", "corr-ineff"]);
    db.close();
  });

  test("getCorrectionsByTriggerType and getCorrectionsByWindow filter correctly", () => {
    const db = freshDb();
    insertCorrection(db, makeCorrection({ correctionId: "corr-trigger", triggerType: "DRIFT_EVENT", createdTs: 1_500 }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-other", triggerType: "OWNER_MANUAL", createdTs: 5_000 }));

    const byTrigger = getCorrectionsByTriggerType(db, "agent-1", "DRIFT_EVENT");
    expect(byTrigger).toHaveLength(1);
    expect(byTrigger[0]?.correctionId).toBe("corr-trigger");

    const byWindow = getCorrectionsByWindow(db, "agent-1", 1000, 2000);
    expect(byWindow.map((c) => c.correctionId)).toEqual(["corr-trigger"]);
    db.close();
  });

  test("updateCorrectionVerification throws when correction ID does not exist", () => {
    const db = freshDb();
    expect(() =>
      updateCorrectionVerification(
        db,
        "missing-id",
        "run-2",
        { "AMC-2.1": 4 },
        0.8,
        "VERIFIED_EFFECTIVE",
        Date.now(),
        "run-2",
        "hash",
        "sig"
      )
    ).toThrow("Correction not found");
    db.close();
  });

  test("updateCorrectionVerification fails on append-only delete trigger (known broken path)", () => {
    const db = freshDb();
    insertCorrection(db, makeCorrection({ correctionId: "corr-broken", status: "PENDING_VERIFICATION" }));
    expect(() =>
      updateCorrectionVerification(
        db,
        "corr-broken",
        "run-2",
        { "AMC-2.1": 4 },
        0.8,
        "VERIFIED_EFFECTIVE",
        Date.now(),
        "run-2",
        "hash-2",
        "sig-2"
      )
    ).toThrow(/corrections cannot be deleted/);
    db.close();
  });

  test("updateCorrectionVerification succeeds if no_delete trigger is removed", () => {
    const db = freshDb();
    db.exec("DROP TRIGGER IF EXISTS no_delete_corrections");
    insertCorrection(db, makeCorrection({ correctionId: "corr-updatable", status: "PENDING_VERIFICATION", createdTs: 1_000 }));

    updateCorrectionVerification(
      db,
      "corr-updatable",
      "run-verify",
      { "AMC-2.1": 5 },
      1,
      "VERIFIED_EFFECTIVE",
      3_000,
      "run-verify",
      "new-hash",
      "new-sig"
    );

    const updated = getCorrectionById(db, "corr-updatable");
    expect(updated?.status).toBe("VERIFIED_EFFECTIVE");
    expect(updated?.verificationRunId).toBe("run-verify");
    expect(updated?.effectivenessScore).toBe(1);
    db.close();
  });

  test("verifyCorrection returns empty ineffective result when baseline levels are missing", () => {
    const correction = makeCorrection({ baselineLevels: {}, questionIds: ["AMC-2.1"] });
    const report = makeDiagnosticReport();
    const result = verifyCorrection(correction, report);
    expect(result.effective).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details).toEqual({});
  });

  test("verifyCorrection treats missing question in report as no-improvement delta", () => {
    const correction = makeCorrection({ questionIds: ["AMC-2.1", "AMC-3.3"], baselineLevels: { "AMC-2.1": 2, "AMC-3.3": 4 } });
    const report = makeDiagnosticReport({
      questionScores: [
        {
          questionId: "AMC-2.1",
          claimedLevel: 3,
          supportedMaxLevel: 3,
          finalLevel: 3,
          confidence: 0.9,
          evidenceEventIds: [],
          flags: [],
          narrative: ""
        }
      ]
    });
    const result = verifyCorrection(correction, report);
    expect(result.details["AMC-3.3"]?.delta).toBe(0);
    expect(result.effective).toBe(true);
  });

  test("verifyCorrection computes normalized score and clamps to [0,1]", () => {
    const correction = makeCorrection({
      questionIds: ["AMC-2.1"],
      baselineLevels: { "AMC-2.1": 1 }
    });
    const report = makeDiagnosticReport({
      questionScores: [
        {
          questionId: "AMC-2.1",
          claimedLevel: 5,
          supportedMaxLevel: 5,
          finalLevel: 10,
          confidence: 0.9,
          evidenceEventIds: [],
          flags: [],
          narrative: ""
        }
      ]
    });
    const result = verifyCorrection(correction, report);
    expect(result.effective).toBe(true);
    expect(result.score).toBe(1);
  });

  test("computeCorrectionHash is deterministic for same correction payload", () => {
    const base = makeCorrection({ correctionId: "corr-hash", updatedTs: 1234 });
    const same = { ...base };
    expect(computeCorrectionHash(base)).toBe(computeCorrectionHash(same));
  });

  test("computeEffectivenessReport aggregates trigger and question metrics", () => {
    const db = freshDb();
    const now = Date.now();

    const seed = (id: string, status: CorrectionStatus, score: number | null) =>
      insertCorrection(
        db,
        makeCorrection({
          correctionId: id,
          triggerType: "DRIFT_EVENT",
          questionIds: ["AMC-4.2"],
          status,
          effectivenessScore: score,
          baselineLevels: { "AMC-4.2": 2 },
          verificationLevels: score === null ? null : { "AMC-4.2": score > 0.5 ? 4 : 2 },
          verifiedTs: score === null ? null : now,
          createdTs: now - 1000
        })
      );

    seed("corr-eff-1", "VERIFIED_EFFECTIVE", 0.8);
    seed("corr-ineff-1", "VERIFIED_INEFFECTIVE", 0.1);
    seed("corr-ineff-2", "VERIFIED_INEFFECTIVE", 0.2);
    seed("corr-ineff-3", "VERIFIED_INEFFECTIVE", 0.1);
    seed("corr-pending", "PENDING_VERIFICATION", null);

    const report = computeEffectivenessReport(db, "agent-1", now - 10_000, now + 10_000);
    expect(report.totalCorrections).toBe(5);
    expect(report.verifiedCorrections).toBe(4);
    expect(report.effectiveCorrections).toBe(1);
    expect(report.ineffectiveCorrections).toBe(3);
    expect(report.pendingCorrections).toBe(1);
    expect(report.byTriggerType.DRIFT_EVENT.total).toBe(5);
    expect(report.byQuestionId["AMC-4.2"]?.total).toBe(5);
    expect(report.frequentlyIneffective).toContain("AMC-4.2");
    expect(report.recommendations.length).toBeGreaterThan(0);
    db.close();
  });

  test("checkClosureEligibility reports not-found and pre-application failures", () => {
    const db = freshDb();
    const report = makeDiagnosticReport({ ts: 2000 });

    const notFound = checkClosureEligibility(db, "no-such-correction", report);
    expect(notFound.canClose).toBe(false);
    expect(notFound.reason).toContain("not found");

    insertCorrection(db, makeCorrection({ correctionId: "corr-pre", createdTs: 3_000 }));
    const tooEarly = checkClosureEligibility(db, "corr-pre", report);
    expect(tooEarly.canClose).toBe(false);
    expect(tooEarly.reason).toContain("No diagnostic run after correction was applied");
    db.close();
  });

  test("checkClosureEligibility can close after measurable improvement", () => {
    const db = freshDb();
    insertCorrection(
      db,
      makeCorrection({
        correctionId: "corr-close",
        createdTs: 1_000,
        questionIds: ["AMC-2.1"],
        baselineLevels: { "AMC-2.1": 1 }
      })
    );
    const report = makeDiagnosticReport({
      ts: 2_000,
      questionScores: [
        {
          questionId: "AMC-2.1",
          claimedLevel: 4,
          supportedMaxLevel: 4,
          finalLevel: 4,
          confidence: 0.8,
          evidenceEventIds: [],
          flags: [],
          narrative: ""
        }
      ]
    });
    const result = checkClosureEligibility(db, "corr-close", report);
    expect(result.canClose).toBe(true);
    expect(result.improvementDetected).toBe(true);
    db.close();
  });

  test("getOpenFeedbackLoops marks stale loops and excludes closed statuses", () => {
    const db = freshDb();
    const now = Date.now();
    const fifteenDays = 15 * 24 * 60 * 60 * 1000;
    insertCorrection(db, makeCorrection({ correctionId: "corr-stale", status: "APPLIED", createdTs: now - fifteenDays }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-open", status: "PENDING_VERIFICATION", createdTs: now - 2_000 }));
    insertCorrection(db, makeCorrection({ correctionId: "corr-closed", status: "VERIFIED_EFFECTIVE" }));

    const loops = getOpenFeedbackLoops(db, "agent-1");
    expect(loops.map((l) => l.correctionId).sort()).toEqual(["corr-open", "corr-stale"]);
    expect(loops.find((l) => l.correctionId === "corr-stale")?.stale).toBe(true);
    db.close();
  });

  test("generateFeedbackClosureReport and renderer include alert sections", () => {
    const db = freshDb();
    const now = Date.now();
    const oldTs = now - 20 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 4; i++) {
      insertCorrection(
        db,
        makeCorrection({
          correctionId: `corr-pending-${i}`,
          status: "PENDING_VERIFICATION",
          createdTs: oldTs + i
        })
      );
    }
    insertCorrection(db, makeCorrection({ correctionId: "corr-ineff-alert", status: "VERIFIED_INEFFECTIVE" }));

    const report = generateFeedbackClosureReport(db, "agent-1");
    expect(report.staleLoops).toBeGreaterThan(0);
    expect(report.alerts.length).toBeGreaterThan(0);

    const md = renderFeedbackClosureReport(report);
    expect(md).toContain("# Feedback Loop Closure Report");
    expect(md).toContain("## Alerts");
    expect(md).toContain("## Open Feedback Loops");
    db.close();
  });
});
