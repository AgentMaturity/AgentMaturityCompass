import type { DiagnosticQuestion, Gate, LayerName, LayerScore, QuestionScore, TrustLabel } from "../types.js";
import { emitterById, fromRegisteredEmitter, type EmitterEntry, type EmitterLevelUse } from "./evidenceEmitters.js";
import { evidenceMapFor, notYetEvidenceableNeeds } from "./evidenceMaps/index.js";
import { evaluateGate, type GateEvaluation, type ParsedEvidenceEvent } from "./gates.js";

/**
 * What a diagnostic level means, how a question earns one, and how levels roll up (P1-07).
 *
 * One module, so the documented scale (docs/SCORING_METHODOLOGY.md, "How a level is earned") and the code cannot
 * drift apart: the runner, the public methodology manifest and the doc all read these constants.
 */
export type Level = 0 | 1 | 2 | 3 | 4 | 5;

/** Each level includes every level below it. */
export const LEVEL_SEMANTICS: ReadonlyArray<{ level: Level; name: string; requires: string }> = [
  { level: 0, name: "Not evidenced", requires: "nothing" },
  { level: 1, name: "Self-declared", requires: "rows tagged to the question from registered emitters, at any trust tier; self-reported input never yields more than L1" },
  { level: 2, name: "Configuration evidence", requires: "observed rows from every emitter the question's evidence map lists for L2" },
  { level: 3, name: "Runtime evidence", requires: "observed runtime or executed test rows from every emitter the question's evidence map lists for L3; keyword matches never count" },
  { level: 4, name: "Continuity, anchoring and sampling", requires: "not evaluated until anchoring (P1-25, P1-26) and sampling emitters exist" },
  { level: 5, name: "Independently attested", requires: "not evaluated until a registry issues scoped attestations under pinned trust (P0-09, P3-04)" }
];

/** The maturity label band an averaged level falls in (inclusive bounds). */
export const LEVEL_BANDS = {
  L0: [0, 0.99],
  L1: [1, 1.99],
  L2: [2, 2.99],
  L3: [3, 3.99],
  L4: [4, 4.74],
  L5: [4.75, 5]
} as const;

/** An integrity index below `below` earns `label`; at or above every row it is HIGH TRUST. */
export const TRUST_LABEL_THRESHOLDS: ReadonlyArray<{ below: number; label: TrustLabel }> = [
  { below: 0.4, label: "UNRELIABLE — DO NOT USE FOR CLAIMS" },
  { below: 0.6, label: "LOW TRUST" }
];

/** Unsigned or invalid configuration caps the integrity index used for the label at this value (LOW TRUST). */
export const UNTRUSTED_CONFIG_INTEGRITY_CAP = 0.59;

export function trustLabelFromIntegrity(integrity: number): TrustLabel {
  return TRUST_LABEL_THRESHOLDS.find((row) => integrity < row.below)?.label ?? "HIGH TRUST";
}

const L4_NOT_EVALUATED =
  "L4 needs continuity, anchoring (P1-25, P1-26) and a sampling record; no registered emitter produces them yet";
const L5_NOT_EVALUATED =
  "L5 needs a scoped attestation signed by a key with purpose attestation in the pinned trust list (P0-09, P3-04); no registry issues one yet";

/**
 * The gates a question is scored against, rebuilt from its evidence map.
 *
 * L1 accepts any registered row at any tier. L2 and L3 come from the map; a level the map leaves empty keeps its
 * earlier requirements as a description of what it would need and is marked `notEvaluated`, as are L4 and L5.
 * A map naming an unregistered, self-reported or wrong-level emitter fails closed the same way.
 */
export function levelGates(questionId: string, legacy: readonly Gate[]): Gate[] {
  const map = evidenceMapFor(questionId);
  const needs = notYetEvidenceableNeeds(questionId);
  return legacy.map((gate) => {
    if (gate.level === 0) return gate;
    if (gate.level === 1) {
      return {
        ...gate,
        requiredEvidenceTypes: [],
        requiredTrustTier: undefined,
        acceptedTrustTiers: ["OBSERVED", "ATTESTED", "SELF_REPORTED"],
        mustInclude: {},
        mustNotInclude: {}
      };
    }
    if (gate.level === 4) return { ...gate, notEvaluated: L4_NOT_EVALUATED };
    if (gate.level === 5) return { ...gate, notEvaluated: L5_NOT_EVALUATED };
    return mappedGate(gate, gate.level === 2 ? map?.l2 ?? [] : map?.l3 ?? [], needs);
  });
}

function mappedGate(gate: Gate, emitterIds: readonly string[], needs: string | undefined): Gate {
  const level = `L${gate.level}` as EmitterLevelUse;
  if (emitterIds.length === 0) {
    const missing = needs ? `needs ${needs}` : "no evidence map names a registered emitter for this question";
    return { ...gate, notEvaluated: `${level} not evaluable on runtime evidence: ${missing}` };
  }
  const emitters = emitterIds.map((id) => emitterById(id));
  const inadmissible = emitterIds.filter((_, index) => {
    const entry = emitters[index];
    return !entry || entry.claimKind !== "observed" || !entry.levelUse.includes(level);
  });
  if (inadmissible.length > 0) {
    return { ...gate, notEvaluated: `${level} evidence map names unregistered or inadmissible emitters: ${inadmissible.join(", ")}` };
  }
  const admitted = emitters as EmitterEntry[];
  return {
    ...gate,
    requiredEvidenceTypes: [...new Set(admitted.map((entry) => entry.eventType))],
    requiredTrustTier: undefined,
    acceptedTrustTiers: ["OBSERVED"],
    mustInclude: {
      auditTypes: admitted.flatMap((entry) => (entry.auditType ? [entry.auditType] : [])),
      metricKeys: admitted.flatMap((entry) => (entry.metricKey ? [entry.metricKey] : []))
    }
  };
}

/**
 * The questions one event is tagged to: `meta.questionIds` (a list), `meta.questionId` or `meta.question_id`.
 * A list, because one governed fact can evidence several questions; it counts once per question.
 */
export function eventQuestionIds(event: Pick<ParsedEvidenceEvent, "meta">): string[] {
  const raw = event.meta.questionIds ?? event.meta.questionId ?? event.meta.question_id;
  const list = Array.isArray(raw) ? raw : [raw];
  const ids = list.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return [...new Set(ids.map((v) => v.trim()))];
}

export interface LevelEvaluation extends GateEvaluation {
  level: Level;
  status: "pass" | "fail" | "not_evaluated";
}

/**
 * A question's level is the highest n for which gates L1 to Ln all pass. Only rows tagged to the question count,
 * and above L0 only rows a registered emitter writes. Every gate is evaluated so a report can say why each level
 * above the result was not reached.
 */
export function evaluateLevels(
  question: Pick<DiagnosticQuestion, "id" | "gates">,
  events: readonly ParsedEvidenceEvent[]
): { level: Level; perLevel: LevelEvaluation[] } {
  const bound = events.filter((event) => eventQuestionIds(event).includes(question.id));
  const admissible = bound.filter(fromRegisteredEmitter);
  const perLevel = question.gates.map((gate): LevelEvaluation => {
    const evaluation = evaluateGate(gate, gate.level === 0 ? bound : admissible);
    const status = gate.notEvaluated ? "not_evaluated" : evaluation.pass ? "pass" : "fail";
    return { ...evaluation, level: gate.level, status };
  });
  const firstMiss = perLevel.findIndex((row) => row.status !== "pass");
  const level = (firstMiss === -1 ? perLevel.length - 1 : Math.max(0, firstMiss - 1)) as Level;
  return { level, perLevel };
}

/** A layer's score: the scoring-weight average of its questions' final levels, and the confidence-weighted average. */
export function layerScore(
  rows: ReadonlyArray<{ finalLevel: number; confidence: number; weight: number }>
): Omit<LayerScore, "layerName"> {
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const avgFinalLevel = totalWeight > 0
    ? rows.reduce((sum, row) => sum + row.finalLevel * row.weight, 0) / totalWeight
    : rows.reduce((sum, row) => sum + row.finalLevel, 0) / Math.max(rows.length, 1);
  const confidenceWeightSum = rows.reduce((sum, row) => sum + row.confidence * row.weight, 0);
  const confidenceWeightedFinalLevel = confidenceWeightSum > 0
    ? rows.reduce((sum, row) => sum + row.finalLevel * row.confidence * row.weight, 0) / confidenceWeightSum
    : avgFinalLevel;
  return {
    avgFinalLevel: Number(avgFinalLevel.toFixed(3)),
    confidenceWeightedFinalLevel: Number(confidenceWeightedFinalLevel.toFixed(3))
  };
}

/** The overall score: the unweighted mean of layer scores. */
export function overallScore(layers: ReadonlyArray<Pick<LayerScore, "avgFinalLevel">>): number {
  return layers.length > 0 ? layers.reduce((sum, row) => sum + row.avgFinalLevel, 0) / layers.length : 0;
}

export function computeLayerScores(
  questionScores: readonly QuestionScore[],
  questions: ReadonlyArray<{ id: string; layerName: LayerName; scoringWeight?: number }>
): LayerScore[] {
  const scoreByQuestionId = new Map(questionScores.map((score) => [score.questionId, score]));
  const byLayer = new Map<LayerName, Array<{ finalLevel: number; confidence: number; weight: number }>>();
  for (const question of questions) {
    const rows = byLayer.get(question.layerName) ?? [];
    const score = scoreByQuestionId.get(question.id);
    if (score) rows.push({ finalLevel: score.finalLevel, confidence: score.confidence, weight: Math.max(0, question.scoringWeight ?? 1) });
    byLayer.set(question.layerName, rows);
  }
  return [...byLayer.entries()]
    .filter(([, rows]) => rows.length > 0)
    .map(([layerName, rows]) => ({ layerName, ...layerScore(rows) }));
}
