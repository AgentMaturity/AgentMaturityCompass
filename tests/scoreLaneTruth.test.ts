import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { getQuestionSet, LIFECYCLE_QUESTION_SET_VERSION } from "../src/diagnostic/questionSets.js";
import { LEVEL_GUIDE, levelReach, overallScoreBand, reachableLevel } from "../src/diagnostic/levelSemantics.js";
import { applicabilityPath, loadQuestionApplicability, scoredQuestions, setQuestionApplicability } from "../src/diagnostic/questionApplicability.js";
import { scoreRapidAssessment } from "../src/diagnostic/rapidQuickscore.js";
import { OWASP_LLM_CATEGORIES } from "../src/compliance/mappings/owaspLlmTop10.js";
import { getPublicMethodologyManifest, renderPublicMethodologyMarkdown } from "../src/methodology/publicMethodology.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { initWorkspace } from "../src/workspace.js";

const byId = new Map(questionBank.map((question) => [question.id, question]));

describe("levels a question can reach today (P2)", () => {
  test("240 of 244 questions stop at L1, four reach L2, none L3; the lifecycle set keeps 264", () => {
    const reach = levelReach(questionBank);
    expect(reach.total).toBe(244);
    expect(reach.canReach).toEqual({ L0: 244, L1: 244, L2: 4, L3: 0, L4: 0, L5: 0 });
    expect(reach.sentence).toBe("240 of 244 questions cannot rise above L1 today (L1 is self-declared); 4 can reach L2; no question can reach L3 yet; L4 and L5 are not evaluated.");
    expect(getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION }).questions).toHaveLength(264);
    expect(reachableLevel(byId.get("AMC-5.29"))).toBe(2);
    expect(reachableLevel(byId.get("AMC-1.1"))).toBe(1);
  });

  test("one vocabulary: each level's name is the band label with what it needs", () => {
    expect(LEVEL_GUIDE[1]).toBe("L1 Initial: self-declared");
    expect(LEVEL_GUIDE[5]).toBe("L5 Optimizing: independently attested (not evaluated yet)");
  });

  test("amc methodology publishes the reach and says a level uses no trust weight", () => {
    const manifest = getPublicMethodologyManifest();
    expect(manifest.scoreScale.map((row) => row.questionsThatCanReach)).toEqual([244, 244, 4, 0, 0, 0]);
    expect(manifest.evidenceTrustTiers.find((row) => row.tier === "SELF_REPORTED")).toMatchObject({ highestLevel: "L1", sideScoreWeight: 0.4 });
    expect(manifest.evidenceTrustTiers.find((row) => row.tier === "ATTESTED")?.highestLevel).toBe("L1");
    const markdown = renderPublicMethodologyMarkdown();
    expect(markdown).toContain("A diagnostic level uses no trust weight");
    expect(markdown).toContain("| L2 | 2-2.99 | Developing | Configuration evidence | 4 of 244 |");
    expect(markdown).not.toMatch(/\| Tier \| Weight \| Meaning \|/);
  });
});

describe("OWASP questions follow the 2025 edition (P4)", () => {
  test("AMC-5.8 to AMC-5.17 carry each 2025 entry exactly once", () => {
    const ids = ["AMC-5.8", "AMC-5.9", "AMC-5.10", "AMC-5.11", "AMC-5.12", "AMC-5.13", "AMC-5.14", "AMC-5.15", "AMC-5.16", "AMC-5.17"];
    const titles = ids.map((id) => byId.get(id)!.title.replace(/^OWASP /, ""));
    expect([...titles].sort()).toEqual([...OWASP_LLM_CATEGORIES].sort());
    expect(questionBank.some((question) => /Insecure Plugin Design|Model Theft|LLM\d\d (?!:)/.test(question.title))).toBe(false);
  });
});

describe("fix plans list only steps that can move a level (P12)", () => {
  test("amc improve aims at the highest level AMC can evaluate and drops questions already there", () => {
    const fresh = scoreRapidAssessment({});
    expect(fresh.recommendations.every((rec) => rec.targetLevel === 1)).toBe(true);
    const atCeiling = scoreRapidAssessment({ "AMC-1.1": 1, "AMC-2.1": 1, "AMC-3.1.1": 1, "AMC-4.1": 1, "AMC-5.1": 1 });
    expect(atCeiling.recommendations).toEqual([]);
  });
});

describe("overall range (P8)", () => {
  const questions = [
    { id: "a", layerName: "Skills" as const }, { id: "b", layerName: "Skills" as const },
    { id: "c", layerName: "Resilience" as const }, { id: "d", layerName: "Resilience" as const }
  ];
  test("no spread gives a zero-width range", () => {
    const scores = questions.map((q) => ({ questionId: q.id, finalLevel: 1 }));
    expect(overallScoreBand(1, scores, questions)).toMatchObject({ low: 1, high: 1 });
  });
  test("the half width is 1.96 standard errors of the levels inside each layer", () => {
    const scores = [{ questionId: "a", finalLevel: 0 }, { questionId: "b", finalLevel: 2 }, { questionId: "c", finalLevel: 1 }, { questionId: "d", finalLevel: 1 }];
    // Skills: mean 1, variance 1, effective n 2 -> SE^2 0.5; Resilience 0. Half width 1.96 * sqrt(0.5) / 2 = 0.693.
    const band = overallScoreBand(1, scores, questions);
    expect(band.low).toBe(0.31);
    expect(band.high).toBe(1.69);
    expect(band.method).toContain("an estimate");
  });
});

describe("applicability (P1)", () => {
  const ws = mkdtempSync(join(tmpdir(), "amc-applicability-"));
  process.env.AMC_VAULT_PASSPHRASE ??= "applicability-test-pass";
  initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  afterAll(() => rmSync(ws, { recursive: true, force: true }));

  test("with no answers every question counts and the report says so", async () => {
    expect(loadQuestionApplicability(ws, "default", questionBank)).toEqual({ status: "not_answered", notApplicable: [] });
    const report = await runDiagnostic({ workspace: ws, window: "1d", agentId: "default" });
    expect(report.questionApplicability).toEqual({ status: "not_answered", notApplicable: [] });
    expect(report.questionScores).toHaveLength(244);
  });

  test("a signed answer leaves the question out of the averages and lists it; tampering is ignored", async () => {
    setQuestionApplicability({ workspace: ws, agentId: "default", question: { id: "AMC-5.17" }, reason: "No retrieval in this agent." });
    const answered = loadQuestionApplicability(ws, "default", questionBank);
    expect(answered.status).toBe("answered");
    expect(answered.notApplicable).toEqual([{ questionId: "AMC-5.17", title: byId.get("AMC-5.17")!.title, reason: "No retrieval in this agent." }]);
    expect(scoredQuestions(questionBank, answered)).toHaveLength(243);
    const report = await runDiagnostic({ workspace: ws, window: "1d", agentId: "default" });
    expect(report.questionApplicability?.notApplicable.map((row) => row.questionId)).toEqual(["AMC-5.17"]);
    expect(report.questionScores).toHaveLength(244);
    expect(report.questionSet?.questionCount).toBe(244);

    const path = applicabilityPath(ws, "default");
    writeFileSync(path, readFileSync(path, "utf8").replace("AMC-5.17", "AMC-5.16"));
    expect(loadQuestionApplicability(ws, "default", questionBank)).toEqual({ status: "ignored", notApplicable: [] });
  });

  test("an empty reason is refused", () => {
    expect(() => setQuestionApplicability({ workspace: ws, agentId: "default", question: { id: "AMC-5.16" }, reason: "  " })).toThrow(/reason/);
  });
});
