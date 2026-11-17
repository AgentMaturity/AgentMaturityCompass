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
  // P12 (lane score): the checklist lists only steps that can move a level, so a question at its highest evaluable
  // level gets no line, and below it the hint aims at that level without a notice about the levels beyond.
  test("the runner checklist leaves out a question already at the highest level AMC can evaluate", () => {
    expect(collectEvidenceChecklist([score(1)], questionBank)).toEqual([]);
  });

  test("below an evaluable level the runner keeps its hint, aimed at the level it can reach", () => {
    const [line] = collectEvidenceChecklist([score(0)], questionBank);
    expect(line).toBe(`${blockedAtL2.id}: ${MULTI_SESSION}`);
  });

  test("amc explain gives the reason, not the question-bank gate hints or L3 evidence", () => {
    const out = explainDiagnosticQuestion(blockedAtL2.id);
    expect(out.exampleEvidence).toEqual([notEvaluatedLevel(blockedAtL2, 0, 3)!.notice]);
    const hint = blockedAtL2.evidenceGateHints.trim().split(/[.!?]\s+/)[0]!;
    expect(out.exampleEvidence.join(" ")).not.toContain(hint);
  });
});
