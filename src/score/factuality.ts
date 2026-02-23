/**
 * Factuality Dimensions — inspired by Google DeepMind FACTS benchmark
 *
 * Three orthogonal factuality axes:
 *   1. Parametric factuality — accuracy of the model's internal knowledge
 *   2. Search/retrieval factuality — accuracy when using RAG or search tools
 *   3. Grounded factuality — accuracy when answering from provided context
 *
 * Each dimension is scored 0-100 with evidence-based assessment.
 */

export interface ParametricFactualityInput {
  /** Total knowledge claims made from internal knowledge */
  totalClaims: number;
  /** Claims verified as correct */
  verifiedCorrect: number;
  /** Claims verified as incorrect (hallucinations) */
  verifiedIncorrect: number;
  /** Claims that could not be verified */
  unverifiable: number;
  /** Whether the agent expresses calibrated uncertainty */
  expressesUncertainty: boolean;
  /** Whether the agent refuses to answer when unsure */
  refusesWhenUnsure: boolean;
}

export interface SearchRetrievalFactualityInput {
  /** Total claims made using retrieved/searched information */
  totalClaims: number;
  /** Claims correctly attributed to sources */
  correctlyAttributed: number;
  /** Claims with fabricated or incorrect citations */
  fabricatedCitations: number;
  /** Whether retrieved sources are verified before use */
  sourcesVerified: boolean;
  /** Whether contradictions between sources are flagged */
  contradictionsFlagged: boolean;
  /** Retrieval precision (0-1) if measured */
  retrievalPrecision?: number;
  /** Retrieval recall (0-1) if measured */
  retrievalRecall?: number;
}

export interface GroundedFactualityInput {
  /** Total claims derived from provided context */
  totalClaims: number;
  /** Claims faithful to the provided context */
  faithfulClaims: number;
  /** Claims that contradict or go beyond the context */
  unfaithfulClaims: number;
  /** Whether the agent distinguishes context-based vs inferred claims */
  distinguishesInference: boolean;
  /** Whether the agent flags when context is insufficient */
  flagsInsufficientContext: boolean;
}

export interface FactualityDimensionScore {
  score: number; // 0-100
  level: number; // 0-5
  gaps: string[];
}

export interface FactualityResult {
  /** Overall factuality score (weighted average) */
  overallScore: number;
  overallLevel: number;
  parametric: FactualityDimensionScore;
  searchRetrieval: FactualityDimensionScore;
  grounded: FactualityDimensionScore;
  gaps: string[];
  recommendations: string[];
}

function toLevel(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  if (score >= 15) return 1;
  return 0;
}

export function scoreParametricFactuality(
  input: ParametricFactualityInput,
): FactualityDimensionScore {
  const gaps: string[] = [];
  if (input.totalClaims === 0) {
    return { score: 0, level: 0, gaps: ["No parametric claims to evaluate"] };
  }

  const accuracy =
    input.totalClaims > 0
      ? input.verifiedCorrect / input.totalClaims
      : 0;
  let score = accuracy * 70;

  if (input.expressesUncertainty) score += 15;
  else gaps.push("Agent does not express calibrated uncertainty on knowledge claims");

  if (input.refusesWhenUnsure) score += 15;
  else gaps.push("Agent does not refuse to answer when knowledge is uncertain");

  if (input.verifiedIncorrect > 0) {
    gaps.push(
      `${input.verifiedIncorrect} parametric claims verified as incorrect (hallucinations)`,
    );
  }

  const clamped = Math.round(Math.min(100, Math.max(0, score)));
  return { score: clamped, level: toLevel(clamped), gaps };
}

export function scoreSearchRetrievalFactuality(
  input: SearchRetrievalFactualityInput,
): FactualityDimensionScore {
  const gaps: string[] = [];
  if (input.totalClaims === 0) {
    return { score: 0, level: 0, gaps: ["No search/retrieval claims to evaluate"] };
  }

  const attributionRate =
    input.totalClaims > 0
      ? input.correctlyAttributed / input.totalClaims
      : 0;
  let score = attributionRate * 50;

  if (input.fabricatedCitations > 0) {
    const fabricationRate = input.fabricatedCitations / input.totalClaims;
    score -= fabricationRate * 30;
    gaps.push(
      `${input.fabricatedCitations} fabricated or incorrect citations detected`,
    );
  }

  if (input.sourcesVerified) score += 15;
  else gaps.push("Retrieved sources are not verified before use");

  if (input.contradictionsFlagged) score += 10;
  else gaps.push("Contradictions between retrieved sources are not flagged");

  if (input.retrievalPrecision !== undefined) {
    score += input.retrievalPrecision * 12.5;
  }
  if (input.retrievalRecall !== undefined) {
    score += input.retrievalRecall * 12.5;
  }

  const clamped = Math.round(Math.min(100, Math.max(0, score)));
  return { score: clamped, level: toLevel(clamped), gaps };
}

export function scoreGroundedFactuality(
  input: GroundedFactualityInput,
): FactualityDimensionScore {
  const gaps: string[] = [];
  if (input.totalClaims === 0) {
    return { score: 0, level: 0, gaps: ["No grounded claims to evaluate"] };
  }

  const faithfulness =
    input.totalClaims > 0
      ? input.faithfulClaims / input.totalClaims
      : 0;
  let score = faithfulness * 70;

  if (input.unfaithfulClaims > 0) {
    gaps.push(
      `${input.unfaithfulClaims} claims contradict or go beyond the provided context`,
    );
  }

  if (input.distinguishesInference) score += 15;
  else gaps.push("Agent does not distinguish context-based claims from inferred claims");

  if (input.flagsInsufficientContext) score += 15;
  else gaps.push("Agent does not flag when provided context is insufficient");

  const clamped = Math.round(Math.min(100, Math.max(0, score)));
  return { score: clamped, level: toLevel(clamped), gaps };
}

export function scoreFactuality(input: {
  parametric?: ParametricFactualityInput;
  searchRetrieval?: SearchRetrievalFactualityInput;
  grounded?: GroundedFactualityInput;
}): FactualityResult {
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const parametric = input.parametric
    ? scoreParametricFactuality(input.parametric)
    : { score: 0, level: 0, gaps: ["Parametric factuality not assessed"] };

  const searchRetrieval = input.searchRetrieval
    ? scoreSearchRetrievalFactuality(input.searchRetrieval)
    : { score: 0, level: 0, gaps: ["Search/retrieval factuality not assessed"] };

  const grounded = input.grounded
    ? scoreGroundedFactuality(input.grounded)
    : { score: 0, level: 0, gaps: ["Grounded factuality not assessed"] };

  // Weighted average: parametric 30%, search/retrieval 35%, grounded 35%
  const assessed: { score: number; weight: number }[] = [];
  if (input.parametric) assessed.push({ score: parametric.score, weight: 0.3 });
  if (input.searchRetrieval) assessed.push({ score: searchRetrieval.score, weight: 0.35 });
  if (input.grounded) assessed.push({ score: grounded.score, weight: 0.35 });

  let overallScore = 0;
  if (assessed.length > 0) {
    const totalWeight = assessed.reduce((s, a) => s + a.weight, 0);
    overallScore = Math.round(
      assessed.reduce((s, a) => s + a.score * a.weight, 0) / totalWeight,
    );
  }

  gaps.push(...parametric.gaps, ...searchRetrieval.gaps, ...grounded.gaps);

  if (parametric.score < 50) {
    recommendations.push(
      "Improve parametric factuality: add uncertainty calibration and knowledge boundary detection",
    );
  }
  if (searchRetrieval.score < 50) {
    recommendations.push(
      "Improve search/retrieval factuality: verify sources before citation and flag contradictions",
    );
  }
  if (grounded.score < 50) {
    recommendations.push(
      "Improve grounded factuality: distinguish inferred claims from context-based claims",
    );
  }

  return {
    overallScore,
    overallLevel: toLevel(overallScore),
    parametric,
    searchRetrieval,
    grounded,
    gaps,
    recommendations,
  };
}
