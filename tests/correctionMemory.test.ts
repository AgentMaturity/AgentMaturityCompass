import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import {
  initLessonTables,
  insertLesson,
  getActiveLessons,
  getLessonById,
  getAllLessons,
  getLastLessonHash,
  updateLessonStatus,
  updateLessonInjection,
  updateLessonPostInjectionRun,
  extractLessonsFromCorrections,
  buildLessonAdvisories,
  expireStaleLessons,
  detectLessonDrift,
  generateCorrectionMemoryReport,
  renderCorrectionMemoryMarkdown,
  defaultCorrectionMemoryConfig,
  type CorrectionLesson,
  type LessonStatus,
  type CorrectionMemoryConfig,
} from "../src/learning/correctionMemory.js";
import { initCorrectionTables, insertCorrection } from "../src/corrections/correctionStore.js";
import type { CorrectionEvent } from "../src/corrections/correctionTypes.js";
import type { DiagnosticReport, QuestionScore } from "../src/types.js";

const roots: string[] = [];

function freshDb(): { db: Database.Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "amc-corrmem-test-"));
  roots.push(dir);
  const db = new Database(join(dir, "test.db"));
  initLessonTables(db);
  return { db, dir };
}

function makeLesson(
  db: Database.Database,
  overrides: Partial<CorrectionLesson> = {},
): CorrectionLesson {
  const now = Date.now();
  const lesson: CorrectionLesson = {
    lessonId: `lsn_${Math.random().toString(36).slice(2, 10)}`,
    agentId: "agent-1",
    correctionId: `corr_${Math.random().toString(36).slice(2, 10)}`,
    questionIds: ["Q1", "Q2"],
    lessonText: "Test lesson text",
    advisorySeverity: "WARN",
    advisoryCategory: "regression",
    createdTs: now,
    expiryTs: now + 90 * 24 * 60 * 60 * 1000, // 90 days
    status: "ACTIVE",
    injectionCount: 0,
    lastInjectedTs: null,
    postInjectionRunIds: [],
    avgImprovementPostInjection: null,
    driftDetected: false,
    prev_lesson_hash: "GENESIS_LESSON",
    lesson_hash: `hash_${Math.random().toString(36).slice(2, 10)}`,
    signature: "test-sig",
    ...overrides,
  };
  insertLesson(db, lesson);
  return lesson;
}

function makeCorrection(
  db: Database.Database,
  overrides: Partial<CorrectionEvent> = {},
): CorrectionEvent {
  const now = Date.now();
  const correction: CorrectionEvent = {
    correctionId: `corr_${Math.random().toString(36).slice(2, 10)}`,
    agentId: "agent-1",
    triggerType: "ASSURANCE_FAILURE",
    triggerId: "trigger-1",
    questionIds: ["Q1", "Q2"],
    correctionDescription: "Fixed safety issue",
    appliedAction: "Updated guardrails.yaml",
    status: "VERIFIED_EFFECTIVE",
    baselineRunId: "run-baseline",
    baselineLevels: { Q1: 2, Q2: 3 },
    verificationRunId: "run-verify",
    verificationLevels: { Q1: 4, Q2: 4 },
    effectivenessScore: 0.8,
    verifiedTs: now,
    verifiedBy: "run-verify",
    createdTs: now,
    updatedTs: now,
    prev_correction_hash: "GENESIS_CORRECTION",
    correction_hash: `hash_${Math.random().toString(36).slice(2, 10)}`,
    signature: "test-sig",
    ...overrides,
  };
  insertCorrection(db, correction);
  return correction;
}

function makeDiagnosticReport(overrides: Partial<DiagnosticReport> = {}): DiagnosticReport {
  return {
    agentId: "agent-1",
    runId: "run-123",
    ts: Date.now(),
    windowStartTs: Date.now() - 86400000,
    windowEndTs: Date.now(),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.85,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [],
    questionScores: [
      {
        questionId: "Q1",
        claimedLevel: 4,
        supportedMaxLevel: 4,
        finalLevel: 4,
        confidence: 0.9,
        evidenceEventIds: [],
        flags: [],
        narrative: "",
      },
      {
        questionId: "Q2",
        claimedLevel: 4,
        supportedMaxLevel: 4,
        finalLevel: 4,
        confidence: 0.9,
        evidenceEventIds: [],
        flags: [],
        narrative: "",
      },
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.8,
    evidenceTrustCoverage: { observed: 0.7, attested: 0.2, selfReported: 0.1 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "sha",
    ...overrides,
  } as DiagnosticReport;
}

afterEach(() => {
  for (const r of roots) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  roots.length = 0;
});

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------
describe("defaultCorrectionMemoryConfig", () => {
  test("returns sensible defaults", () => {
    const cfg = defaultCorrectionMemoryConfig();
    expect(cfg.maxActiveLessons).toBe(20);
    expect(cfg.lessonTtlDays).toBe(90);
    expect(cfg.minEffectivenessForLesson).toBe(0.3);
    expect(cfg.maxInjectionsPerPack).toBe(10);
    expect(cfg.driftThresholdRuns).toBe(5);
    expect(cfg.driftRegressionThreshold).toBe(-0.5);
  });
});

// ---------------------------------------------------------------------------
// SQLite store operations
// ---------------------------------------------------------------------------
describe("lesson store operations", () => {
  test("initLessonTables creates tables without error", () => {
    const { db } = freshDb();
    // Double init should be safe
    initLessonTables(db);
    db.close();
  });

  test("insertLesson and getLessonById round-trips correctly", () => {
    const { db } = freshDb();
    const lesson = makeLesson(db, { lessonId: "lsn_roundtrip" });
    const retrieved = getLessonById(db, "lsn_roundtrip");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.lessonId).toBe("lsn_roundtrip");
    expect(retrieved!.agentId).toBe(lesson.agentId);
    expect(retrieved!.questionIds).toEqual(lesson.questionIds);
    expect(retrieved!.advisorySeverity).toBe(lesson.advisorySeverity);
    expect(retrieved!.status).toBe("ACTIVE");
    expect(retrieved!.driftDetected).toBe(false);
    db.close();
  });

  test("getActiveLessons returns only ACTIVE lessons", () => {
    const { db } = freshDb();
    makeLesson(db, { agentId: "agent-1", status: "ACTIVE", lessonId: "lsn_a1" });
    makeLesson(db, { agentId: "agent-1", status: "STALE", lessonId: "lsn_a2" });
    makeLesson(db, { agentId: "agent-1", status: "REVOKED", lessonId: "lsn_a3" });
    makeLesson(db, { agentId: "agent-1", status: "ACTIVE", lessonId: "lsn_a4" });

    const active = getActiveLessons(db, "agent-1");
    expect(active.length).toBe(2);
    expect(active.every((l) => l.status === "ACTIVE")).toBe(true);
    db.close();
  });

  test("getAllLessons returns all lessons for an agent", () => {
    const { db } = freshDb();
    makeLesson(db, { agentId: "agent-1", lessonId: "lsn_b1" });
    makeLesson(db, { agentId: "agent-1", status: "STALE", lessonId: "lsn_b2" });
    makeLesson(db, { agentId: "agent-2", lessonId: "lsn_b3" });

    const all1 = getAllLessons(db, "agent-1");
    expect(all1.length).toBe(2);
    const all2 = getAllLessons(db, "agent-2");
    expect(all2.length).toBe(1);
    db.close();
  });

  test("getLastLessonHash returns GENESIS_LESSON when no lessons exist", () => {
    const { db } = freshDb();
    const hash = getLastLessonHash(db, "nonexistent");
    expect(hash).toBe("GENESIS_LESSON");
    db.close();
  });

  test("getLastLessonHash returns last hash after inserts", () => {
    const { db } = freshDb();
    makeLesson(db, { agentId: "agent-1", lesson_hash: "hash_first", lessonId: "lsn_c1" });
    makeLesson(db, { agentId: "agent-1", lesson_hash: "hash_second", lessonId: "lsn_c2" });
    const hash = getLastLessonHash(db, "agent-1");
    expect(hash).toBe("hash_second");
    db.close();
  });

  test("getLessonById returns null for nonexistent lesson", () => {
    const { db } = freshDb();
    expect(getLessonById(db, "nonexistent")).toBeNull();
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Update operations
// ---------------------------------------------------------------------------
describe("lesson update operations", () => {
  test("updateLessonStatus changes status", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_upd1" });
    updateLessonStatus(db, "lsn_upd1", "STALE");
    const lesson = getLessonById(db, "lsn_upd1");
    expect(lesson!.status).toBe("STALE");
    db.close();
  });

  test("updateLessonInjection increments count and sets timestamp", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_inj1" });
    const ts = Date.now();
    updateLessonInjection(db, "lsn_inj1", ts);
    updateLessonInjection(db, "lsn_inj1", ts + 1000);
    const lesson = getLessonById(db, "lsn_inj1");
    expect(lesson!.injectionCount).toBe(2);
    expect(lesson!.lastInjectedTs).toBe(ts + 1000);
    db.close();
  });

  test("updateLessonPostInjectionRun tracks run IDs and drift", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_post1" });
    updateLessonPostInjectionRun(db, "lsn_post1", "run-1", 0.5, false);
    updateLessonPostInjectionRun(db, "lsn_post1", "run-2", -0.3, true);
    const lesson = getLessonById(db, "lsn_post1");
    expect(lesson!.postInjectionRunIds).toEqual(["run-1", "run-2"]);
    expect(lesson!.avgImprovementPostInjection).toBe(-0.3);
    expect(lesson!.driftDetected).toBe(true);
    db.close();
  });

  test("updateLessonPostInjectionRun does nothing for nonexistent lesson", () => {
    const { db } = freshDb();
    // Should not throw
    updateLessonPostInjectionRun(db, "nonexistent", "run-1", 0.5, false);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Lesson extraction from corrections
// ---------------------------------------------------------------------------
describe("extractLessonsFromCorrections", () => {
  test("extracts lessons from verified effective corrections", () => {
    const { db, dir } = freshDb();
    initCorrectionTables(db);

    makeCorrection(db, {
      correctionId: "corr_eff1",
      agentId: "agent-1",
      status: "VERIFIED_EFFECTIVE",
      effectivenessScore: 0.8,
      triggerType: "ASSURANCE_FAILURE",
    });

    const lessons = extractLessonsFromCorrections(db, "agent-1", dir);
    expect(lessons.length).toBe(1);
    expect(lessons[0].correctionId).toBe("corr_eff1");
    expect(lessons[0].advisorySeverity).toBe("CRITICAL"); // ASSURANCE_FAILURE → CRITICAL
    expect(lessons[0].advisoryCategory).toBe("safety");
    expect(lessons[0].status).toBe("ACTIVE");
    expect(lessons[0].lesson_hash).toBeTruthy();
    db.close();
  });

  test("skips corrections below effectiveness threshold", () => {
    const { db, dir } = freshDb();
    initCorrectionTables(db);

    makeCorrection(db, {
      correctionId: "corr_low1",
      agentId: "agent-1",
      status: "VERIFIED_EFFECTIVE",
      effectivenessScore: 0.1, // below default 0.3
    });

    const lessons = extractLessonsFromCorrections(db, "agent-1", dir);
    expect(lessons.length).toBe(0);
    db.close();
  });

  test("skips non-verified corrections", () => {
    const { db, dir } = freshDb();
    initCorrectionTables(db);

    makeCorrection(db, {
      correctionId: "corr_pending1",
      agentId: "agent-1",
      status: "APPLIED",
      effectivenessScore: null,
    });

    const lessons = extractLessonsFromCorrections(db, "agent-1", dir);
    expect(lessons.length).toBe(0);
    db.close();
  });

  test("does not create duplicate lessons for same correction", () => {
    const { db, dir } = freshDb();
    initCorrectionTables(db);

    makeCorrection(db, {
      correctionId: "corr_dup1",
      agentId: "agent-1",
      status: "VERIFIED_EFFECTIVE",
      effectivenessScore: 0.9,
    });

    const firstRun = extractLessonsFromCorrections(db, "agent-1", dir);
    expect(firstRun.length).toBe(1);

    const secondRun = extractLessonsFromCorrections(db, "agent-1", dir);
    expect(secondRun.length).toBe(0); // already extracted
    db.close();
  });

  test("respects maxActiveLessons limit", () => {
    const { db, dir } = freshDb();
    initCorrectionTables(db);

    // Create 25 effective corrections
    for (let i = 0; i < 25; i++) {
      makeCorrection(db, {
        correctionId: `corr_limit_${i}`,
        agentId: "agent-1",
        status: "VERIFIED_EFFECTIVE",
        effectivenessScore: 0.5 + i * 0.01,
      });
    }

    const lessons = extractLessonsFromCorrections(db, "agent-1", dir, {
      maxActiveLessons: 5,
    });
    expect(lessons.length).toBe(5); // capped at 5
    db.close();
  });

  test("maps trigger types to correct severity and category", () => {
    const { db, dir } = freshDb();
    initCorrectionTables(db);

    const triggerTests = [
      { triggerType: "ASSURANCE_FAILURE" as const, severity: "CRITICAL", category: "safety" },
      { triggerType: "INCIDENT_RESPONSE" as const, severity: "CRITICAL", category: "incident" },
      { triggerType: "DRIFT_EVENT" as const, severity: "WARN", category: "regression" },
      { triggerType: "POLICY_CHANGE" as const, severity: "WARN", category: "governance" },
      { triggerType: "EXPERIMENT_RESULT" as const, severity: "INFO", category: "optimization" },
      { triggerType: "OWNER_MANUAL" as const, severity: "INFO", category: "correction" },
    ];

    for (const tt of triggerTests) {
      makeCorrection(db, {
        correctionId: `corr_trigger_${tt.triggerType}`,
        agentId: "agent-1",
        status: "VERIFIED_EFFECTIVE",
        effectivenessScore: 0.8,
        triggerType: tt.triggerType,
      });
    }

    const lessons = extractLessonsFromCorrections(db, "agent-1", dir);
    expect(lessons.length).toBe(6);

    for (const tt of triggerTests) {
      const lesson = lessons.find((l) => l.correctionId === `corr_trigger_${tt.triggerType}`);
      expect(lesson).toBeDefined();
      expect(lesson!.advisorySeverity).toBe(tt.severity);
      expect(lesson!.advisoryCategory).toBe(tt.category);
    }
    db.close();
  });

  test("custom minEffectivenessForLesson config is applied", () => {
    const { db, dir } = freshDb();
    initCorrectionTables(db);

    makeCorrection(db, {
      correctionId: "corr_thresh1",
      agentId: "agent-1",
      status: "VERIFIED_EFFECTIVE",
      effectivenessScore: 0.5,
    });

    // Threshold at 0.6 should exclude this
    const lessons1 = extractLessonsFromCorrections(db, "agent-1", dir, {
      minEffectivenessForLesson: 0.6,
    });
    expect(lessons1.length).toBe(0);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Advisory building
// ---------------------------------------------------------------------------
describe("buildLessonAdvisories", () => {
  test("builds advisories from active lessons", () => {
    const { db } = freshDb();
    makeLesson(db, {
      lessonId: "lsn_adv1",
      advisorySeverity: "WARN",
      advisoryCategory: "regression",
      lessonText: "Avoid repeated tool calls",
    });

    const advisories = buildLessonAdvisories(db, "agent-1");
    expect(advisories.length).toBe(1);
    expect(advisories[0].advisoryId).toBe("lsn_adv1");
    expect(advisories[0].severity).toBe("WARN");
    expect(advisories[0].category).toBe("regression");
    expect(advisories[0].summary).toBe("Avoid repeated tool calls");
    db.close();
  });

  test("prioritizes CRITICAL over WARN over INFO", () => {
    const { db } = freshDb();
    const now = Date.now();
    makeLesson(db, { lessonId: "lsn_info", advisorySeverity: "INFO", createdTs: now });
    makeLesson(db, { lessonId: "lsn_warn", advisorySeverity: "WARN", createdTs: now });
    makeLesson(db, { lessonId: "lsn_crit", advisorySeverity: "CRITICAL", createdTs: now });

    const advisories = buildLessonAdvisories(db, "agent-1");
    expect(advisories.length).toBe(3);
    expect(advisories[0].severity).toBe("CRITICAL");
    expect(advisories[1].severity).toBe("WARN");
    expect(advisories[2].severity).toBe("INFO");
    db.close();
  });

  test("respects maxInjectionsPerPack", () => {
    const { db } = freshDb();
    for (let i = 0; i < 15; i++) {
      makeLesson(db, { lessonId: `lsn_max_${i}` });
    }

    const advisories = buildLessonAdvisories(db, "agent-1", {
      maxInjectionsPerPack: 3,
    });
    expect(advisories.length).toBe(3);
    db.close();
  });

  test("excludes expired lessons", () => {
    const { db } = freshDb();
    const pastExpiry = Date.now() - 1000; // already expired
    makeLesson(db, { lessonId: "lsn_exp1", createdTs: pastExpiry - 1000, expiryTs: pastExpiry });

    const advisories = buildLessonAdvisories(db, "agent-1");
    expect(advisories.length).toBe(0);
    db.close();
  });

  test("tracks injection count on lessons", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_track1" });

    buildLessonAdvisories(db, "agent-1");
    const lesson = getLessonById(db, "lsn_track1");
    expect(lesson!.injectionCount).toBe(1);
    expect(lesson!.lastInjectedTs).not.toBeNull();
    db.close();
  });

  test("returns empty array when no active lessons", () => {
    const { db } = freshDb();
    const advisories = buildLessonAdvisories(db, "agent-1");
    expect(advisories).toEqual([]);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Staleness expiry
// ---------------------------------------------------------------------------
describe("expireStaleLessons", () => {
  test("expires lessons past TTL", () => {
    const { db } = freshDb();
    const pastExpiry = Date.now() - 1000;
    makeLesson(db, { lessonId: "lsn_stale1", createdTs: pastExpiry - 1000, expiryTs: pastExpiry });
    makeLesson(db, { lessonId: "lsn_active1", expiryTs: Date.now() + 999999 });

    const expired = expireStaleLessons(db, "agent-1");
    expect(expired).toEqual(["lsn_stale1"]);

    const staleLesson = getLessonById(db, "lsn_stale1");
    expect(staleLesson!.status).toBe("STALE");

    const activeLesson = getLessonById(db, "lsn_active1");
    expect(activeLesson!.status).toBe("ACTIVE");
    db.close();
  });

  test("returns empty array when nothing to expire", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_fresh1", expiryTs: Date.now() + 999999 });
    const expired = expireStaleLessons(db, "agent-1");
    expect(expired).toEqual([]);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------
describe("detectLessonDrift", () => {
  test("detects drift when improvement regresses", () => {
    const { db } = freshDb();
    makeLesson(db, {
      lessonId: "lsn_drift1",
      questionIds: ["Q1"],
      injectionCount: 10,
      avgImprovementPostInjection: -0.8, // bad regression
    });

    const report = makeDiagnosticReport({
      questionScores: [
        {
          questionId: "Q1",
          claimedLevel: 2,
          supportedMaxLevel: 2,
          finalLevel: 2,
          confidence: 0.5,
          evidenceEventIds: [],
          flags: [],
          narrative: "",
        },
      ],
    });

    const drifting = detectLessonDrift(db, "agent-1", report, {
      driftThresholdRuns: 5,
      driftRegressionThreshold: -0.5,
    });
    expect(drifting).toContain("lsn_drift1");
    db.close();
  });

  test("does not flag drift for new lessons below threshold runs", () => {
    const { db } = freshDb();
    makeLesson(db, {
      lessonId: "lsn_new1",
      questionIds: ["Q1"],
      injectionCount: 2, // below threshold of 5
      avgImprovementPostInjection: -1.0,
    });

    const report = makeDiagnosticReport();
    const drifting = detectLessonDrift(db, "agent-1", report, {
      driftThresholdRuns: 5,
    });
    expect(drifting).toEqual([]);
    db.close();
  });

  test("does not flag drift when improvement is positive", () => {
    const { db } = freshDb();
    makeLesson(db, {
      lessonId: "lsn_good1",
      questionIds: ["Q1"],
      injectionCount: 10,
      avgImprovementPostInjection: 0.5, // positive
    });

    const report = makeDiagnosticReport();
    const drifting = detectLessonDrift(db, "agent-1", report);
    expect(drifting).toEqual([]);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
describe("generateCorrectionMemoryReport", () => {
  test("generates report with lesson summaries", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_rpt1", status: "ACTIVE" });
    makeLesson(db, { lessonId: "lsn_rpt2", status: "STALE" });
    makeLesson(db, { lessonId: "lsn_rpt3", status: "REVOKED" });

    const now = Date.now();
    const report = generateCorrectionMemoryReport(db, "agent-1", now - 86400000, now);
    expect(report.activeLessons).toBe(1);
    expect(report.staleLessons).toBe(1);
    expect(report.revokedLessons).toBe(1);
    expect(report.lessonSummaries.length).toBe(3);
    expect(report.reportId).toMatch(/^cmr_/);
    db.close();
  });

  test("includes recommendations when no active lessons", () => {
    const { db } = freshDb();
    const now = Date.now();
    const report = generateCorrectionMemoryReport(db, "agent-1", now - 86400000, now);
    expect(report.activeLessons).toBe(0);
    expect(report.recommendations.some((r) => r.includes("No active lessons"))).toBe(true);
    db.close();
  });

  test("includes recommendations when drifting lessons exist", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_drift_rpt", driftDetected: true, status: "ACTIVE" });

    const now = Date.now();
    const report = generateCorrectionMemoryReport(db, "agent-1", now - 86400000, now);
    expect(report.driftingLessons.length).toBe(1);
    expect(report.recommendations.some((r) => r.includes("drift"))).toBe(true);
    db.close();
  });

  test("computes average improvement across lessons", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_imp1", avgImprovementPostInjection: 0.6 });
    makeLesson(db, { lessonId: "lsn_imp2", avgImprovementPostInjection: 0.4 });

    const now = Date.now();
    const report = generateCorrectionMemoryReport(db, "agent-1", now - 86400000, now);
    expect(report.avgImprovementAcrossLessons).toBeCloseTo(0.5, 2);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
describe("renderCorrectionMemoryMarkdown", () => {
  test("renders markdown with all sections", () => {
    const { db } = freshDb();
    makeLesson(db, { lessonId: "lsn_md1", driftDetected: true, status: "ACTIVE" });
    makeLesson(db, { lessonId: "lsn_md2", status: "STALE" });

    const now = Date.now();
    const report = generateCorrectionMemoryReport(db, "agent-1", now - 86400000, now);
    const md = renderCorrectionMemoryMarkdown(report);

    expect(md).toContain("# Correction Memory Report");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Lessons");
    expect(md).toContain("## Recommendations");
    expect(md).toContain("Active lessons: 1");
    expect(md).toContain("Stale lessons: 1");
    expect(md).toContain("lsn_md1");
    expect(md).toContain("lsn_md2");
    db.close();
  });

  test("renders empty report gracefully", () => {
    const { db } = freshDb();
    const now = Date.now();
    const report = generateCorrectionMemoryReport(db, "agent-1", now - 86400000, now);
    const md = renderCorrectionMemoryMarkdown(report);
    expect(md).toContain("# Correction Memory Report");
    expect(md).toContain("Active lessons: 0");
    db.close();
  });
});
