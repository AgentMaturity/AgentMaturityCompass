/**
 * Industry-pack answers are self-declared (P0-21): validated Likert 1-5, scored through
 * src/score/units.ts, stamped self_reported and capped at L1 by the claim envelope.
 * An unanswered question is not evaluated (truth rule 2, P1-44): it gets no level, and the
 * pack has no percentage or level until every question is answered.
 */
import { envelopeForSelfAssessment } from "../claims/eligibility/adapters.js";
import type { ClaimEnvelope, ClaimKind } from "../claims/eligibility/types.js";
import { likert, likertToPercent, percent, percentToLevel, type Likert1to5 } from "../score/units.js";
import type { IndustryPack } from "./industryPacks.js";

export interface PackSelfAssessment { complete: boolean; answered: number; total: number }

/** What self-declared pack answers may claim: self-reported, at most L1, never a certification. */
export interface SelfAssessedPack {
  /** One validated answer per pack question, in order; null for an unanswered question (not evaluated). */
  answers: Array<Likert1to5 | null>;
  /** The questions without an answer, in pack order: not evaluated, never a default level. */
  notEvaluatedQuestionIds: string[];
  /** Self-reported score: the weighted answers as a percentage; null until every question is answered. */
  percentage: number | null;
  level: number | null;
  selfAssessment: PackSelfAssessment;
  claimKind: ClaimKind;
  eligibleLevel: number | null;
}

/** Validated answers in pack order; null where the question has no answer. */
function packAnswers(pack: IndustryPack, responses: Record<string, number>): Array<Likert1to5 | null> {
  return pack.questions.map((q) => (responses[q.id] === undefined ? null : likert(responses[q.id]!)));
}

/**
 * The claim envelope for self-declared pack answers: a regulated self-assessment. An incomplete answer set
 * proposes no level, so its eligible level is null.
 */
export function packSelfAssessmentEnvelope(pack: IndustryPack, responses: Record<string, number>, now: number): ClaimEnvelope {
  const answers = packAnswers(pack, responses);
  const complete = answers.every((answer) => answer !== null);
  return envelopeForSelfAssessment({ producer: `industry-pack:${pack.id}`, regulated: true,
    answers: complete ? answers as Likert1to5[] : [], now });
}

/** Validates answers as Likert 1-5 (anything else throws) and scores them through src/score/units.ts. */
export function selfAssessPack(pack: IndustryPack, responses: Record<string, number>, now: number): SelfAssessedPack {
  const answers = packAnswers(pack, responses);
  const notEvaluatedQuestionIds = pack.questions.filter((_, i) => answers[i] === null).map((q) => q.id);
  const complete = notEvaluatedQuestionIds.length === 0;
  let percentage: number | null = null;
  if (complete) {
    const possible = pack.questions.reduce((sum, q) => sum + q.weight, 0);
    const earned = pack.questions.reduce((sum, q, i) => sum + q.weight * likertToPercent(answers[i]!), 0);
    percentage = possible > 0 ? Math.round(earned / possible) : 0;
  }
  const envelope = packSelfAssessmentEnvelope(pack, responses, now);
  return {
    answers,
    notEvaluatedQuestionIds,
    percentage,
    level: percentage === null ? null : percentToLevel(percent(percentage)),
    selfAssessment: { complete, answered: answers.length - notEvaluatedQuestionIds.length, total: pack.questions.length },
    claimKind: envelope.claimKind,
    eligibleLevel: envelope.eligibleLevel,
  };
}
