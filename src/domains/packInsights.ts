/**
 * What a pack's self-reported answers mean, question by question: the five level descriptors, the scale behind the
 * pack percentage, the top gaps, and coverage of the pack's key risks. Pure functions over a pack and its answers
 * (null = not evaluated); nothing here claims more than the self-reported answers it is given.
 */
import type { IndustryPack, IndustryPackQuestion } from "./industryPacks.js";

/** The audit's PASS bar (industryPackAudit.ts levelStatus): a control at L4 or above is at target. */
export const PACK_PASS_LEVEL = 4;

/** Why an all-L3 answer set reads L2: the percentage scale and the shared level bands (score/units.ts) differ. */
export const PACK_SCALE_NOTE = "Each answer maps L1-L5 to 0/25/50/75/100%; the pack percentage is their weighted mean, "
  + "banded L1 <30%, L2 30-54%, L3 55-74%, L4 75-89%, L5 90%+. Answering L3 everywhere scores 50%, in the L2 band, "
  + "so read the per-question levels beside the percentage.";

const NEUTRAL_DESCRIPTORS: Record<2 | 4, string> = { 2: "between L1 and L3", 4: "between L3 and L5" };

/** The descriptor for one level of a question: l2/l4 when the question carries them, else a neutral label. */
export function levelDescriptor(q: IndustryPackQuestion, level: number): string {
  if (level === 1) return q.l1;
  if (level === 3) return q.l3;
  if (level === 5) return q.l5;
  const own = level === 2 ? q.l2 : level === 4 ? q.l4 : undefined;
  return own?.trim() ? own : NEUTRAL_DESCRIPTORS[level as 2 | 4] ?? `L${level}`;
}

/** The pack's key risk a question mitigates, when its keyRisk index names one. */
export function keyRiskOf(pack: IndustryPack, q: IndustryPackQuestion): { index: number; risk: string } | undefined {
  const index = q.keyRisk;
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= pack.keyRisks.length) return undefined;
  return { index, risk: pack.keyRisks[index]! };
}

export interface PackGap {
  id: string;
  dimension: string;
  level: number;
  weight: number;
  /** (PACK_PASS_LEVEL - level) x weight: how far below target, scaled by how much the question counts. */
  priority: number;
  targetLevel: number;
  targetDescriptor: string;
  failureMode?: string;
  remediation?: string;
  evidence?: readonly string[];
  keyRisk?: { index: number; risk: string };
}

/** Answered questions below the PASS bar, highest priority first (ties: lower level, then pack order). */
export function packTopGaps(pack: IndustryPack, answers: ReadonlyArray<number | null>, limit = 5): PackGap[] {
  return pack.questions
    .map((q, order) => ({ q, order, level: answers[order] ?? null }))
    .filter((row): row is { q: IndustryPackQuestion; order: number; level: number } => row.level !== null && row.level < PACK_PASS_LEVEL)
    .map((row) => ({ ...row, priority: (PACK_PASS_LEVEL - row.level) * row.q.weight }))
    .sort((a, b) => b.priority - a.priority || a.level - b.level || a.order - b.order)
    .slice(0, limit)
    .map(({ q, level, priority }) => toGap(pack, q, level, priority));
}

/** A neutral L2/L4 target names the next described level, so a gap always says what to reach for. */
function gapTarget(q: IndustryPackQuestion, target: number): string {
  const text = levelDescriptor(q, target);
  if (text !== NEUTRAL_DESCRIPTORS[target as 2 | 4]) return text;
  return target === 2 ? `${text}; L3 is: ${q.l3}` : `${text}; L5 is: ${q.l5}`;
}

function toGap(pack: IndustryPack, q: IndustryPackQuestion, level: number, priority: number): PackGap {
  const keyRisk = keyRiskOf(pack, q);
  return {
    id: q.id, dimension: q.dimension, level, weight: q.weight, priority,
    targetLevel: level + 1, targetDescriptor: gapTarget(q, level + 1),
    ...(q.failureMode ? { failureMode: q.failureMode } : {}),
    ...(q.remediation ? { remediation: q.remediation } : {}),
    ...(q.evidence?.length ? { evidence: q.evidence } : {}),
    ...(keyRisk ? { keyRisk } : {}),
  };
}

export interface PackRiskCoverage {
  index: number;
  risk: string;
  /** Questions whose keyRisk names this risk. */
  questionIds: string[];
  answered: number;
  /** Mean self-reported level of the answered mapped questions; null when none is answered. */
  averageLevel: number | null;
}

/**
 * Per-risk coverage when questions carry keyRisk; an empty list when none does (coverage unknown, not zero).
 * The weakest risk is the lowest mean level; a mapped risk with no answer is not evaluated and never the weakest.
 */
export function packRiskCoverage(pack: IndustryPack, answers: ReadonlyArray<number | null>):
  { riskCoverage: PackRiskCoverage[]; weakestRisk: PackRiskCoverage | null } {
  const mapped = pack.questions.map((q, i) => ({ q, i, risk: keyRiskOf(pack, q) })).filter((row) => row.risk !== undefined);
  if (mapped.length === 0) return { riskCoverage: [], weakestRisk: null };
  const riskCoverage = pack.keyRisks.map((risk, index) => {
    const rows = mapped.filter((row) => row.risk!.index === index);
    const levels = rows.map((row) => answers[row.i] ?? null).filter((level): level is number => level !== null);
    const averageLevel = levels.length === 0 ? null : Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10;
    return { index, risk, questionIds: rows.map((row) => row.q.id), answered: levels.length, averageLevel };
  });
  const weakestRisk = riskCoverage.filter((r) => r.averageLevel !== null)
    .reduce<PackRiskCoverage | null>((low, r) => (low === null || r.averageLevel! < low.averageLevel! ? r : low), null);
  return { riskCoverage, weakestRisk };
}

/** Errors in a pack's optional question detail (for content authors; tests/industryPackEngineUpgrade.test.ts runs it). */
export function validatePackQuestionDetail(pack: IndustryPack): string[] {
  const errors: string[] = [];
  for (const q of pack.questions) {
    const at = `pack ${pack.id}: ${q.id}`;
    for (const field of ["l2", "l4", "remediation", "failureMode"] as const) {
      if (q[field] !== undefined && (typeof q[field] !== "string" || !q[field]!.trim())) errors.push(`${at}: ${field} must be non-empty text`);
    }
    if (q.evidence !== undefined && (!Array.isArray(q.evidence) || q.evidence.length === 0
      || q.evidence.some((item) => typeof item !== "string" || !item.trim()))) errors.push(`${at}: evidence must be a non-empty list of non-empty text`);
    if (q.keyRisk !== undefined && keyRiskOf(pack, q) === undefined) {
      errors.push(`${at}: keyRisk ${q.keyRisk} is not an index into the pack's ${pack.keyRisks.length} keyRisks`);
    }
  }
  return errors;
}
