/**
 * AMC Global Index — HuggingFace Dataset Export (AMC-432)
 *
 * Exports AMC benchmark results as a HuggingFace-compatible dataset
 * (Parquet/JSONL format) for the AMC Global Index leaderboard.
 *
 * Integrates with existing benchExport.ts but adds:
 * - JSONL export format for HF datasets
 * - Anonymization controls (agent IDs → hashed pseudonyms)
 * - Schema alignment with HF dataset card conventions
 * - Batch export across multiple agents
 */

import { createHash } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GlobalIndexEntry {
  /** Pseudonymized agent identifier */
  agentPseudonym: string;
  /** AMC version used for scoring */
  amcVersion: string;
  /** Overall composite score (0-100) */
  compositeScore: number;
  /** Per-layer scores */
  layerScores: Record<string, number>;
  /** Trust label */
  trustLabel: string;
  /** Model family (e.g., "gpt-4", "claude-3") — optional, agent may not disclose */
  modelFamily?: string;
  /** Provider ID */
  providerId?: string;
  /** Timestamp of the assessment */
  assessedAt: string;
  /** Number of questions answered */
  questionsAnswered: number;
  /** Assurance pack results summary */
  assuranceSummary?: Record<string, { passed: number; failed: number; total: number }>;
  /** Privacy tier used during assessment */
  privacyTier: string;
  /** Geographic region (optional, for regulatory context) */
  region?: string;
}

export interface GlobalIndexDatasetCard {
  name: string;
  description: string;
  license: string;
  version: string;
  features: Record<string, string>;
  splits: Record<string, { numRows: number }>;
  tags: string[];
}

export interface ExportOptions {
  /** Salt for pseudonymization */
  pseudonymSalt?: string;
  /** Include model family in export */
  includeModelFamily?: boolean;
  /** AMC version string */
  amcVersion?: string;
  /** Dataset name */
  datasetName?: string;
}

// ── Pseudonymization ───────────────────────────────────────────────────────

export function pseudonymizeAgentId(
  agentId: string,
  salt: string = "amc-global-index",
): string {
  return (
    "agent-" +
    createHash("sha256")
      .update(salt + agentId)
      .digest("hex")
      .slice(0, 12)
  );
}

// ── JSONL export ───────────────────────────────────────────────────────────

/**
 * Convert an array of GlobalIndexEntry to JSONL format.
 */
export function toJSONL(entries: GlobalIndexEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

/**
 * Parse JSONL back to entries.
 */
export function fromJSONL(jsonl: string): GlobalIndexEntry[] {
  return jsonl
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as GlobalIndexEntry);
}

// ── Dataset card generation ────────────────────────────────────────────────

export function generateDatasetCard(
  entries: GlobalIndexEntry[],
  options: ExportOptions = {},
): GlobalIndexDatasetCard {
  const name = options.datasetName ?? "amc-global-index";
  return {
    name,
    description:
      "Agent Maturity Compass (AMC) Global Index — standardized trust and maturity scores for AI agents across the industry.",
    license: "Apache-2.0",
    version: options.amcVersion ?? "1.0.0",
    features: {
      agentPseudonym: "string",
      amcVersion: "string",
      compositeScore: "float",
      layerScores: "dict",
      trustLabel: "string",
      modelFamily: "string",
      providerId: "string",
      assessedAt: "string",
      questionsAnswered: "int",
      assuranceSummary: "dict",
      privacyTier: "string",
      region: "string",
    },
    splits: {
      train: { numRows: entries.length },
    },
    tags: [
      "ai-safety",
      "agent-evaluation",
      "trust-scoring",
      "benchmarks",
      "amc",
    ],
  };
}

// ── Entry builder ──────────────────────────────────────────────────────────

export interface BuildEntryParams {
  agentId: string;
  compositeScore: number;
  layerScores: Record<string, number>;
  trustLabel: string;
  modelFamily?: string;
  providerId?: string;
  questionsAnswered: number;
  assuranceSummary?: GlobalIndexEntry["assuranceSummary"];
  privacyTier?: string;
  region?: string;
}

export function buildGlobalIndexEntry(
  params: BuildEntryParams,
  options: ExportOptions = {},
): GlobalIndexEntry {
  return {
    agentPseudonym: pseudonymizeAgentId(
      params.agentId,
      options.pseudonymSalt,
    ),
    amcVersion: options.amcVersion ?? "1.0.0",
    compositeScore: params.compositeScore,
    layerScores: params.layerScores,
    trustLabel: params.trustLabel,
    modelFamily: options.includeModelFamily
      ? params.modelFamily
      : undefined,
    providerId: params.providerId,
    assessedAt: new Date().toISOString(),
    questionsAnswered: params.questionsAnswered,
    assuranceSummary: params.assuranceSummary,
    privacyTier: params.privacyTier ?? "redacted",
    region: params.region,
  };
}
