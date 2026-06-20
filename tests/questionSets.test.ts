import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { generateReport } from "../src/diagnostic/runner.js";
import {
  DEFAULT_QUESTION_SET_VERSION,
  LIFECYCLE_QUESTION_SET_VERSION,
  getQuestionSet,
  listQuestionSets
} from "../src/diagnostic/questionSets.js";
import { getAllQuestions, scoreFullDiagnostic } from "../src/diagnostic/fullDiagnostic.js";
import type { DiagnosticReport } from "../src/types.js";

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "amc-question-set-"));
}

describe("diagnostic question sets", () => {
  test("legacy-compatible version remains the default assessment", () => {
    const legacy = getQuestionSet();
    const defaultQuestions = getAllQuestions();
    const defaultQuestionCount = defaultQuestions.length;

    expect(DEFAULT_QUESTION_SET_VERSION).toBe("amc-legacy-240-v1");
    expect(legacy.version).toBe(DEFAULT_QUESTION_SET_VERSION);
    expect(legacy.info.default).toBe(true);
    expect(legacy.info.questionCount).toBe(defaultQuestionCount);
    expect(legacy.questions).toHaveLength(defaultQuestionCount);
    expect(legacy.info.title).not.toContain("240-question");

    const result = scoreFullDiagnostic({}, 1000);
    expect(result.questionCount).toBe(defaultQuestionCount);
    expect(result.maxScore).toBe(defaultQuestionCount * 5);
  });

  test("lifecycle set is explicit, versioned, and mapped to surfaces and layers", () => {
    const sets = listQuestionSets();
    const expanded = getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION });
    const expandedOnly = expanded.questions.filter((question) => question.questionSetVersion === LIFECYCLE_QUESTION_SET_VERSION);
    const defaultQuestionCount = getAllQuestions().length;

    expect(sets.map((set) => set.version)).toContain(LIFECYCLE_QUESTION_SET_VERSION);
    expect(expandedOnly).toHaveLength(20);
    expect(expanded.info.questionCount).toBe(defaultQuestionCount + expandedOnly.length);
    expect(expanded.questions).toHaveLength(defaultQuestionCount + expandedOnly.length);
    expect(new Set(expandedOnly.map((question) => question.family))).toEqual(new Set([
      "lifecycle-governance",
      "harness-resources",
      "evidence-binding",
      "typed-multi-agent",
      "trace-repair",
      "proof-exports",
      "reasoning-memory",
      "uncertainty-controls",
      "runtime-gateway-watch",
      "fleet-org-operation"
    ]));

    for (const question of expandedOnly) {
      expect(question.activeByDefault).toBe(false);
      expect(question.surfaces?.length).toBeGreaterThan(0);
      expect(question.assessmentLayers).toContain(question.layerName);
      expect(question.scoringWeight).toBe(1);
    }

    const result = scoreFullDiagnostic({}, 1000, LIFECYCLE_QUESTION_SET_VERSION);
    expect(result.questionCount).toBe(defaultQuestionCount + expandedOnly.length);
    expect(result.maxScore).toBe((defaultQuestionCount + expandedOnly.length) * 5);
  });

  test("industry pack weighting is skipped while paywalled and applied only with entitlement", () => {
    const locked = getQuestionSet({
      version: LIFECYCLE_QUESTION_SET_VERSION,
      workspace: workspace(),
      applyIndustryPackWeights: true,
      env: {}
    });
    const unlocked = getQuestionSet({
      version: LIFECYCLE_QUESTION_SET_VERSION,
      workspace: workspace(),
      applyIndustryPackWeights: true,
      env: { AMC_INDUSTRY_PACKS_ACTIVE: "1" } as NodeJS.ProcessEnv
    });

    expect(locked.info.domainPackWeighting?.requested).toBe(true);
    expect(locked.info.domainPackWeighting?.applied).toBe(false);
    expect(locked.info.domainPackWeighting?.entitlementActive).toBe(false);
    expect(locked.questions.every((question) => (question.scoringWeight ?? 1) === 1)).toBe(true);

    expect(unlocked.info.domainPackWeighting?.requested).toBe(true);
    expect(unlocked.info.domainPackWeighting?.applied).toBe(true);
    expect(unlocked.info.domainPackWeighting?.entitlementActive).toBe(true);
    expect(unlocked.questions.some((question) => (question.scoringWeight ?? 1) > 1)).toBe(true);
  });

  test("markdown reports explain expanded assessment dimensions", () => {
    const expanded = getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION });
    const report = {
      agentId: "agent",
      runId: "run-1",
      ts: Date.now(),
      windowStartTs: Date.now() - 1000,
      windowEndTs: Date.now(),
      status: "UNSIGNED",
      verificationPassed: false,
      trustBoundaryViolated: false,
      trustBoundaryMessage: null,
      integrityIndex: 0.5,
      trustLabel: "LOW TRUST",
      targetProfileId: null,
      layerScores: [],
      questionScores: [],
      inflationAttempts: [],
      unsupportedClaimCount: 0,
      contradictionCount: 0,
      correlationRatio: 1,
      invalidReceiptsCount: 0,
      correlationWarnings: [],
      evidenceCoverage: 0,
      evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 0 },
      targetDiff: [],
      prioritizedUpgradeActions: [],
      evidenceToCollectNext: [],
      questionSet: expanded.info,
      runSealSig: "",
      reportJsonSha256: ""
    } satisfies DiagnosticReport;

    const markdown = generateReport(report, "md") as string;
    expect(markdown).toContain("Question Set: amc-lifecycle-2026-v1");
    expect(markdown).toContain("## Expanded Assessment Dimensions");
    expect(markdown).toContain("Lifecycle Governance");
    expect(markdown).toContain("Runtime Gateway and Watch");
  });
});
