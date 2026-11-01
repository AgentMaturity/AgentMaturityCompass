import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { notEvaluatedLevel } from "../src/diagnostic/levelSemantics.js";
import { explainDiagnosticQuestion } from "../src/diagnostic/questionExplain.js";
import { collectEvidenceChecklist } from "../src/diagnostic/runner.js";
import type { QuestionScore } from "../src/types.js";

// P1-07 follow-up: the runner's "evidence to collect next" and `amc explain` never ask for a level AMC cannot evaluate.
const MULTI_SESSION = "capture multi-session evidence with audit + metric events.";
const blockedAtL2 = questionBank.find((q) => notEvaluatedLevel(q, 1, 2))!;
const score = (finalLevel: number): QuestionScore =>
  ({ questionId: blockedAtL2.id, finalLevel, flags: [] }) as unknown as QuestionScore;

describe("hints past a not-evaluated level", () => {
  test("the runner checklist says why instead of asking for a level it cannot evaluate", () => {
    const [line] = collectEvidenceChecklist([score(1)], questionBank);
    expect(line).toBe(`${blockedAtL2.id}: ${notEvaluatedLevel(blockedAtL2, 1, 3)!.notice}`);
    expect(line).not.toContain(MULTI_SESSION);
  });

  test("below an evaluable level the runner keeps its hint and names the level it stops at", () => {
    const [line] = collectEvidenceChecklist([score(0)], questionBank);
    expect(line).toBe(`${blockedAtL2.id}: ${MULTI_SESSION} ${notEvaluatedLevel(blockedAtL2, 0, 3)!.notice}`);
  });

  test("amc explain gives the reason, not the question-bank gate hints or L3 evidence", () => {
    const out = explainDiagnosticQuestion(blockedAtL2.id);
    expect(out.exampleEvidence).toEqual([notEvaluatedLevel(blockedAtL2, 0, 3)!.notice]);
    const hint = blockedAtL2.evidenceGateHints.trim().split(/[.!?]\s+/)[0]!;
    expect(out.exampleEvidence.join(" ")).not.toContain(hint);
  });
});
