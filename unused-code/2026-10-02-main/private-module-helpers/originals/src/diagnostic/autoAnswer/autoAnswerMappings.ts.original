import { questionBank } from "../questionBank.js";
import type { EvidenceEventType } from "../../types.js";

export interface AutoAnswerRule {
  questionId: string;
  requiredEvidenceTypes: EvidenceEventType[];
  minEvents: number;
  minDistinctDays: number;
}

function uniqueSorted<T extends string>(items: T[]): T[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

export function buildAutoAnswerRules(): AutoAnswerRule[] {
  const rules = questionBank.map((question) => {
    const requiredEvidenceTypes = uniqueSorted(
      question.gates.flatMap((gate) => gate.requiredEvidenceTypes).filter((item): item is EvidenceEventType => Boolean(item))
    );
    const minEvents = Math.max(1, ...question.gates.map((gate) => Math.max(1, gate.minEvents)));
    const minDistinctDays = Math.max(1, ...question.gates.map((gate) => Math.max(1, gate.minDistinctDays)));
    return {
      questionId: question.id,
      requiredEvidenceTypes,
      minEvents,
      minDistinctDays
    } satisfies AutoAnswerRule;
  });
  return rules.sort((a, b) => a.questionId.localeCompare(b.questionId));
}

export const AUTO_ANSWER_RULES: AutoAnswerRule[] = buildAutoAnswerRules();

export function autoAnswerRuleByQuestionId(questionId: string): AutoAnswerRule {
  const found = AUTO_ANSWER_RULES.find((row) => row.questionId === questionId);
  if (!found) {
    throw new Error(`Missing auto-answer rule for ${questionId}`);
  }
  return found;
}
