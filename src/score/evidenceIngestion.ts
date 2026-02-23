/**
 * Evidence Ingestion Protocol
 *
 * Standardized API for accepting structured confidence reports from
 * ANY internal measurement system and mapping them to AMC's evidence
 * schema at the ATTESTED trust tier (0.8× weight).
 *
 * This makes AMC the universal external measurement layer that any
 * internal system can feed into — the credit bureau, not the bank.
 *
 * Supported formats:
 * - openai-evals: OpenAI Evals JSON format
 * - langsmith: LangSmith trace export format
 * - custom: Generic JSON with dimension/score/evidence fields
 * - mlflow: MLflow model evaluation artifacts
 * - weights-biases: W&B evaluation tables
 *
 * Trust tiers for ingested evidence:
 * - OBSERVED (1.0×): Directly observed by AMC gateway
 * - ATTESTED (0.8×): Ingested from external system with provenance
 * - SELF_REPORTED (0.5×): Agent's own confidence claims
 * - UNVERIFIED (0.3×): No provenance, no attestation
 */

export type TrustTier = "OBSERVED" | "ATTESTED" | "SELF_REPORTED" | "UNVERIFIED";

export const TRUST_WEIGHTS: Record<TrustTier, number> = {
  OBSERVED: 1.0,
  ATTESTED: 0.8,
  SELF_REPORTED: 0.5,
  UNVERIFIED: 0.3,
};

export type IngestFormat = "openai-evals" | "langsmith" | "custom" | "mlflow" | "weights-biases";

export interface IngestInput {
  /** Source format */
  format: IngestFormat;
  /** Raw data from the external system */
  data: Record<string, unknown>;
  /** Source system identifier */
  sourceSystem: string;
  /** Timestamp of the evaluation */
  timestamp: string;
  /** Optional cryptographic signature from source */
  signature?: string;
  /** Optional provenance chain */
  provenance?: string[];
}

export interface NormalizedEvidence {
  /** AMC dimension this maps to */
  dimension: string;
  /** AMC question ID if mappable */
  questionId?: string;
  /** Normalized score (0-5 AMC scale) */
  score: number;
  /** Raw score from source system */
  rawScore: number;
  /** Trust tier based on provenance */
  trustTier: TrustTier;
  /** Effective weight (score × trust weight) */
  effectiveScore: number;
  /** Source metadata */
  source: {
    system: string;
    format: IngestFormat;
    timestamp: string;
    signature?: string;
  };
}

export interface IngestReport {
  /** Successfully mapped evidence items */
  evidence: NormalizedEvidence[];
  /** Items that couldn't be mapped */
  unmapped: { field: string; reason: string }[];
  /** Trust tier assigned */
  trustTier: TrustTier;
  /** Total items ingested */
  totalIngested: number;
  /** Mapping coverage (what % of source data mapped to AMC dimensions) */
  mappingCoverage: number;
  /** Gaps */
  gaps: string[];
}

/**
 * AMC dimension mapping for common evaluation categories.
 */
const DIMENSION_MAP: Record<string, string> = {
  // OpenAI Evals categories
  accuracy: "Skills",
  safety: "Resilience",
  helpfulness: "Culture & Alignment",
  harmlessness: "Culture & Alignment",
  reasoning: "Skills",
  coding: "Skills",
  instruction_following: "Leadership & Autonomy",
  // LangSmith categories
  correctness: "Skills",
  relevance: "Skills",
  groundedness: "Culture & Alignment",
  toxicity: "Resilience",
  latency: "Strategic Agent Operations",
  cost: "Strategic Agent Operations",
  // Generic categories
  reliability: "Resilience",
  security: "Resilience",
  observability: "Strategic Agent Operations",
  governance: "Leadership & Autonomy",
  evaluation: "Skills",
  trust: "Culture & Alignment",
  compliance: "Leadership & Autonomy",
  performance: "Skills",
  robustness: "Resilience",
};

/**
 * Determine trust tier based on provenance quality.
 */
function determineTrustTier(input: IngestInput): TrustTier {
  if (input.signature && input.provenance && input.provenance.length > 0) {
    return "ATTESTED";
  }
  if (input.sourceSystem && input.timestamp) {
    return "ATTESTED"; // Known source system = attested
  }
  return "UNVERIFIED";
}

/**
 * Normalize a score from various scales to AMC's 0-5 scale.
 */
function normalizeScore(value: number, format: IngestFormat): number {
  if (format === "openai-evals") {
    // OpenAI evals typically use 0-1 scale
    return Math.min(5, Math.max(0, value * 5));
  }
  if (format === "langsmith") {
    // LangSmith uses 0-1 for most metrics
    return Math.min(5, Math.max(0, value * 5));
  }
  if (format === "mlflow") {
    // MLflow varies, assume 0-1
    return Math.min(5, Math.max(0, value * 5));
  }
  if (format === "weights-biases") {
    // W&B varies, assume 0-1
    return Math.min(5, Math.max(0, value * 5));
  }
  // Custom: try to detect scale
  if (value > 5 && value <= 100) return value / 20; // 0-100 → 0-5
  if (value > 1 && value <= 5) return value; // Already 0-5
  if (value >= 0 && value <= 1) return value * 5; // 0-1 → 0-5
  return Math.min(5, Math.max(0, value));
}

/**
 * Map a field name to an AMC dimension.
 */
function mapToDimension(field: string): string | null {
  const lower = field.toLowerCase().replace(/[_-]/g, "");
  for (const [key, dim] of Object.entries(DIMENSION_MAP)) {
    if (lower.includes(key.replace(/[_-]/g, ""))) return dim;
  }
  return null;
}

/**
 * Ingest evidence from an external evaluation system.
 */
export function ingestEvidence(input: IngestInput): IngestReport {
  const gaps: string[] = [];
  const evidence: NormalizedEvidence[] = [];
  const unmapped: { field: string; reason: string }[] = [];

  const trustTier = determineTrustTier(input);
  const trustWeight = TRUST_WEIGHTS[trustTier];

  // Extract score-like fields from data
  const data = input.data;
  let totalFields = 0;
  let mappedFields = 0;

  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== "number") continue;
    totalFields++;

    const dimension = mapToDimension(key);
    if (!dimension) {
      unmapped.push({ field: key, reason: "No AMC dimension mapping found" });
      continue;
    }

    mappedFields++;
    const normalizedScore = normalizeScore(value, input.format);
    evidence.push({
      dimension,
      score: normalizedScore,
      rawScore: value,
      trustTier,
      effectiveScore: normalizedScore * trustWeight,
      source: {
        system: input.sourceSystem,
        format: input.format,
        timestamp: input.timestamp,
        signature: input.signature,
      },
    });
  }

  const mappingCoverage = totalFields > 0 ? mappedFields / totalFields : 0;

  if (unmapped.length > 0) {
    gaps.push(`${unmapped.length} fields could not be mapped to AMC dimensions — consider adding custom mappings`);
  }
  if (trustTier === "UNVERIFIED") {
    gaps.push("Evidence ingested at UNVERIFIED tier (0.3× weight) — add signature and provenance for ATTESTED tier (0.8×)");
  }
  if (mappingCoverage < 0.5) {
    gaps.push(`Only ${(mappingCoverage * 100).toFixed(0)}% of source fields mapped to AMC dimensions — low coverage`);
  }

  return {
    evidence,
    unmapped,
    trustTier,
    totalIngested: evidence.length,
    mappingCoverage,
    gaps,
  };
}
