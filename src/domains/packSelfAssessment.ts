/**
 * Industry-pack answers are self-declared (P0-21): validated Likert 1-5, scored through
 * src/score/units.ts, stamped self_reported and capped at L1 by the claim envelope.
 */
import { envelopeForSelfAssessment } from "../claims/eligibility/adapters.js";
import type { ClaimKind } from "../claims/eligibility/types.js";
import { likert, likertToPercent, percent, percentToLevel, type Likert1to5 } from "../score/units.js";
import type { IndustryPack } from "./industryPacks.js";

export interface PackSelfAssessment { complete: boolean; answered: number; total: number }

/** What self-declared pack answers may claim: self-reported, at most L1, never a certification. */
export interface SelfAssessedPack {
  /** One validated answer per pack question, in order; an unanswered question counts as 1. */
  answers: Likert1to5[];
  /** Self-reported score: the weighted answers as a percentage. */
  percentage: number;
  level: number;
  selfAssessment: PackSelfAssessment;
  claimKind: ClaimKind;
  eligibleLevel: number | null;
}

/** Validates answers as Likert 1-5 (anything else throws) and scores them through src/score/units.ts. */
export function selfAssessPack(pack: IndustryPack, responses: Record<string, number>, now: number): SelfAssessedPack {
  const given = pack.questions.filter((q) => responses[q.id] !== undefined).map((q) => likert(responses[q.id]!));
  const answers = pack.questions.map((q) => likert(responses[q.id] ?? 1));
  const possible = pack.questions.reduce((sum, q) => sum + q.weight, 0);
  const earned = pack.questions.reduce((sum, q, i) => sum + q.weight * likertToPercent(answers[i]!), 0);
  const percentage = possible > 0 ? Math.round(earned / possible) : 0;
  const envelope = envelopeForSelfAssessment({ producer: `industry-pack:${pack.id}`, regulated: true, answers: given, now });
  return {
    answers,
    percentage,
    level: percentToLevel(percent(percentage)),
    selfAssessment: { complete: given.length === pack.questions.length, answered: given.length, total: pack.questions.length },
    claimKind: envelope.claimKind,
    eligibleLevel: envelope.eligibleLevel,
  };
}
