import { mean } from "../experiments/stats.js";
/**
 * RAG Maturity Scoring
 *
 * Adds production diagnostics for:
 * - retrieval quality (precision/recall),
 * - metadata quality,
 * - retrieval drift,
 * - hallucination risk,
 * - citation integrity.
 */

export interface RAGRetrievalEvaluation {
  queryId: string;
  retrievedChunkIds: string[];
  relevantChunkIds: string[];
}

export interface RAGChunkMetadataSample {
  chunkId: string;
  sourceId?: string;
  sourceUri?: string;
  sourceTitle?: string;
  documentVersion?: string;
  ingestedAt?: string;
}

export interface RAGRetrievalQualitySnapshot {
  ts: number | string;
  precision: number;
  recall: number;
}

export interface RAGOutputEvaluation {
  outputId: string;
  claimCount: number;
  groundedClaimCount: number;
  citationCount: number;
  confidence?: number; // 0-1
  contradictingEvidenceCount?: number;
}

export interface RAGCitationEvaluation {
  citationId: string;
  isVerifiable: boolean;
  matchesRetrievedChunk: boolean;
  pointsToValidSource: boolean;
}

export interface RAGCapabilityProfile {
  // Dimension 1: Retrieval Quality
  hybridSearchEnabled: boolean; // semantic + keyword
  rerankingEnabled: boolean; // cross-encoder reranking
  retrievalAccuracyBenchmarked: boolean; // measured hit rate
  retrievalHitRate?: number; // 0-1
  retrievalEvaluations?: RAGRetrievalEvaluation[];

  // Dimension 2: Chunking Strategy + metadata quality
  chunkingStrategy: "naive" | "sentence" | "paragraph" | "semantic" | "hierarchical";
  chunkOverlapConfigured: boolean;
  metadataAttachedToChunks: boolean;
  chunkQualityValidated: boolean;
  chunkMetadataSamples?: RAGChunkMetadataSample[];

  // Dimension 3: Data Freshness
  incrementalIndexingEnabled: boolean;
  stalenessDetectionEnabled: boolean;
  dataLineageTracked: boolean;

  // Dimension 4: Production Readiness + drift
  testedBeyond100Docs: boolean;
  latencyBenchmarked: boolean;
  p99LatencyMs?: number;
  failoverConfigured: boolean;
  retrievalQualityHistory?: RAGRetrievalQualitySnapshot[];

  // Dimension 5: Evidence & Provenance
  sourceAttributionInAnswers: boolean;
  confidenceScoresProvided: boolean;
  groundingVerified: boolean;
  ragOutputEvaluations?: RAGOutputEvaluation[];
  citationEvaluations?: RAGCitationEvaluation[];

  // Dimension 6: Security
  accessControlOnIndex: boolean;
  piiFilteringEnabled: boolean;
  indexTamperDetected: boolean;
}

export interface RetrievalQualityDiagnostics {
  precision: number;
  recall: number;
  f1: number;
  score: number; // 0-100
  sampleSize: number;
}

export interface MetadataQualityDiagnostics {
  attributionRate: number;
  verifiableSourceRate: number;
  completenessRate: number;
  score: number; // 0-100
  sampleSize: number;
}

export interface RetrievalDriftDiagnostics {
  driftDetected: boolean;
  trend: "improving" | "stable" | "degrading" | "insufficient_data";
  deltaF1: number;
  score: number; // 0-100 (higher is better)
  sampleSize: number;
}

export interface HallucinationRiskDiagnostics {
  riskScore: number; // 0-100 (higher is riskier)
  groundedClaimRate: number;
  citationCoverageRate: number;
  highConfidenceUnsupportedRate: number;
  contradictionRate: number;
  sampleSize: number;
}

export interface CitationIntegrityDiagnostics {
  integrityScore: number; // 0-100
  accuracyRate: number;
  verifiabilityRate: number;
  sourceValidityRate: number;
  sampleSize: number;
}

export interface RAGMaturityDiagnostics {
  retrievalQuality: RetrievalQualityDiagnostics;
  metadataQuality: MetadataQualityDiagnostics;
  retrievalDrift: RetrievalDriftDiagnostics;
  hallucinationRisk: HallucinationRiskDiagnostics;
  citationIntegrity: CitationIntegrityDiagnostics;
}

export interface RAGMaturityResult {
  overallScore: number; // 0-100
  level: "L1-Basic" | "L2-Functional" | "L3-Production" | "L4-Enterprise" | "L5-Expert";
  dimensionScores: {
    retrievalQuality: number;
    chunkingStrategy: number;
    dataFreshness: number;
    productionReadiness: number;
    evidenceProvenance: number;
    security: number;
  };
  diagnostics: RAGMaturityDiagnostics;
  gaps: string[];
  recommendations: string[];
  deploymentRisk: "low" | "medium" | "high" | "critical";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clamp100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function average(values: number[]): number {
  return mean(values);
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

function f1FromPrecisionRecall(precision: number, recall: number): number {
  const p = clamp01(precision);
  const r = clamp01(recall);
  if (p + r === 0) return 0;
  return (2 * p * r) / (p + r);
}

function parseTs(ts: number | string): number {
  if (typeof ts === "number") {
    return Number.isFinite(ts) ? ts : 0;
  }
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeRetrievalQuality(profile: RAGCapabilityProfile): RetrievalQualityDiagnostics {
  const evaluations = profile.retrievalEvaluations ?? [];
  if (evaluations.length === 0) {
    const fallback = profile.retrievalAccuracyBenchmarked ? clamp01(profile.retrievalHitRate ?? 0.5) : 0;
    return {
      precision: fallback,
      recall: fallback,
      f1: fallback,
      score: Math.round(fallback * 100),
      sampleSize: 0
    };
  }

  const precisions: number[] = [];
  const recalls: number[] = [];

  for (const sample of evaluations) {
    const retrieved = new Set(uniqueIds(sample.retrievedChunkIds));
    const relevant = new Set(uniqueIds(sample.relevantChunkIds));
    let truePositives = 0;
    for (const chunkId of retrieved) {
      if (relevant.has(chunkId)) truePositives += 1;
    }
    const precision = retrieved.size > 0 ? truePositives / retrieved.size : 0;
    const recall = relevant.size > 0 ? truePositives / relevant.size : 0;
    precisions.push(clamp01(precision));
    recalls.push(clamp01(recall));
  }

  const precision = average(precisions);
  const recall = average(recalls);
  const f1 = f1FromPrecisionRecall(precision, recall);
  const score = Math.round(clamp100((f1 * 0.5 + precision * 0.25 + recall * 0.25) * 100));

  return {
    precision,
    recall,
    f1,
    score,
    sampleSize: evaluations.length
  };
}

function computeMetadataQuality(profile: RAGCapabilityProfile): MetadataQualityDiagnostics {
  const samples = profile.chunkMetadataSamples ?? [];
  if (samples.length === 0) {
    const attributed = profile.metadataAttachedToChunks ? 1 : 0;
    const verifiable = profile.metadataAttachedToChunks ? 0.75 : 0;
    const completeness = profile.metadataAttachedToChunks ? 0.6 : 0;
    const score = Math.round((attributed * 0.4 + verifiable * 0.35 + completeness * 0.25) * 100);
    return {
      attributionRate: attributed,
      verifiableSourceRate: verifiable,
      completenessRate: completeness,
      score,
      sampleSize: 0
    };
  }

  const attributed: number[] = [];
  const verifiable: number[] = [];
  const completeness: number[] = [];

  for (const sample of samples) {
    const hasAttribution = Boolean(sample.sourceId || sample.sourceUri || sample.sourceTitle);
    const hasVerifiableSource = Boolean(sample.sourceId || sample.sourceUri);
    const completenessFields = [
      Boolean(sample.sourceId),
      Boolean(sample.sourceUri),
      Boolean(sample.sourceTitle),
      Boolean(sample.documentVersion),
      Boolean(sample.ingestedAt)
    ];
    const completenessRate = completenessFields.filter(Boolean).length / completenessFields.length;

    attributed.push(hasAttribution ? 1 : 0);
    verifiable.push(hasVerifiableSource ? 1 : 0);
    completeness.push(completenessRate);
  }

  const attributionRate = average(attributed);
  const verifiableSourceRate = average(verifiable);
  const completenessRate = average(completeness);
  const score = Math.round(
    clamp100((attributionRate * 0.4 + verifiableSourceRate * 0.35 + completenessRate * 0.25) * 100)
  );

  return {
    attributionRate,
    verifiableSourceRate,
    completenessRate,
    score,
    sampleSize: samples.length
  };
}

function computeRetrievalDrift(profile: RAGCapabilityProfile): RetrievalDriftDiagnostics {
  const history = (profile.retrievalQualityHistory ?? [])
    .slice()
    .sort((a, b) => parseTs(a.ts) - parseTs(b.ts));

  if (history.length < 4) {
    return {
      driftDetected: false,
      trend: "insufficient_data",
      deltaF1: 0,
      score: 50,
      sampleSize: history.length
    };
  }

  const f1Series = history.map((snapshot) => f1FromPrecisionRecall(snapshot.precision, snapshot.recall));
  const splitIndex = Math.floor(f1Series.length / 2);
  const older = f1Series.slice(0, splitIndex);
  const newer = f1Series.slice(splitIndex);

  if (older.length === 0 || newer.length === 0) {
    return {
      driftDetected: false,
      trend: "insufficient_data",
      deltaF1: 0,
      score: 50,
      sampleSize: history.length
    };
  }

  const olderAvg = average(older);
  const newerAvg = average(newer);
  const deltaF1 = newerAvg - olderAvg;

  let trend: RetrievalDriftDiagnostics["trend"] = "stable";
  if (deltaF1 <= -0.05) trend = "degrading";
  else if (deltaF1 >= 0.05) trend = "improving";

  const driftPenalty = trend === "degrading" ? Math.min(60, Math.round(Math.abs(deltaF1) * 200)) : 0;
  const driftBoost = trend === "improving" ? 5 : 0;
  const score = Math.round(clamp100(newerAvg * 100 - driftPenalty + driftBoost));

  return {
    driftDetected: trend === "degrading",
    trend,
    deltaF1,
    score,
    sampleSize: history.length
  };
}

function computeHallucinationRisk(profile: RAGCapabilityProfile): HallucinationRiskDiagnostics {
  const samples = profile.ragOutputEvaluations ?? [];

  let groundedClaimRate = 0;
  let citationCoverageRate = 0;
  let highConfidenceUnsupportedRate = 0;
  let contradictionRate = 0;

  if (samples.length > 0) {
    const groundedRates: number[] = [];
    const citationRates: number[] = [];
    const highConfidenceUnsupportedRates: number[] = [];
    const contradictionRates: number[] = [];

    for (const sample of samples) {
      const claims = Math.max(1, sample.claimCount);
      const grounded = Math.max(0, Math.min(claims, sample.groundedClaimCount));
      const unsupportedRate = 1 - grounded / claims;
      const citationCoverage = clamp01(sample.citationCount / claims);
      const contradiction = clamp01((sample.contradictingEvidenceCount ?? 0) / claims);
      const confidence = clamp01(sample.confidence ?? 0.5);
      const highConfidenceUnsupported = confidence >= 0.8 ? unsupportedRate : 0;

      groundedRates.push(grounded / claims);
      citationRates.push(citationCoverage);
      highConfidenceUnsupportedRates.push(highConfidenceUnsupported);
      contradictionRates.push(contradiction);
    }

    groundedClaimRate = average(groundedRates);
    citationCoverageRate = average(citationRates);
    highConfidenceUnsupportedRate = average(highConfidenceUnsupportedRates);
    contradictionRate = average(contradictionRates);
  } else {
    groundedClaimRate = profile.groundingVerified ? 0.85 : 0.45;
    citationCoverageRate = profile.sourceAttributionInAnswers ? 0.8 : 0.3;
    highConfidenceUnsupportedRate = profile.confidenceScoresProvided ? 0.2 : 0.35;
    contradictionRate = 0.1;
  }

  const unsupportedRate = 1 - groundedClaimRate;
  const riskScore = Math.round(
    clamp100(
      clamp01(
        unsupportedRate * 0.45 +
          (1 - citationCoverageRate) * 0.25 +
          highConfidenceUnsupportedRate * 0.2 +
          contradictionRate * 0.1
      ) * 100
    )
  );

  return {
    riskScore,
    groundedClaimRate,
    citationCoverageRate,
    highConfidenceUnsupportedRate,
    contradictionRate,
    sampleSize: samples.length
  };
}

function computeCitationIntegrity(profile: RAGCapabilityProfile): CitationIntegrityDiagnostics {
  const samples = profile.citationEvaluations ?? [];
  if (samples.length === 0) {
    const base = profile.sourceAttributionInAnswers ? 0.7 : 0;
    return {
      integrityScore: Math.round(base * 100),
      accuracyRate: base,
      verifiabilityRate: base,
      sourceValidityRate: base,
      sampleSize: 0
    };
  }

  const accuracyRate = average(samples.map((sample) => (sample.matchesRetrievedChunk ? 1 : 0)));
  const verifiabilityRate = average(samples.map((sample) => (sample.isVerifiable ? 1 : 0)));
  const sourceValidityRate = average(samples.map((sample) => (sample.pointsToValidSource ? 1 : 0)));
  const integrityScore = Math.round(
    clamp100((accuracyRate * 0.45 + verifiabilityRate * 0.35 + sourceValidityRate * 0.2) * 100)
  );

  return {
    integrityScore,
    accuracyRate,
    verifiabilityRate,
    sourceValidityRate,
    sampleSize: samples.length
  };
}

export function scoreRAGMaturity(profile: RAGCapabilityProfile): RAGMaturityResult {
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const retrievalQuality = computeRetrievalQuality(profile);
  const metadataQuality = computeMetadataQuality(profile);
  const retrievalDrift = computeRetrievalDrift(profile);
  const hallucinationRisk = computeHallucinationRisk(profile);
  const citationIntegrity = computeCitationIntegrity(profile);

  // Dimension 1: Retrieval Quality (0-100)
  let retrievalBase = 0;
  if (profile.hybridSearchEnabled) retrievalBase += 30;
  else {
    gaps.push("Semantic-only search can lower precision on exact-match queries");
    recommendations.push("Enable hybrid search (vector + lexical/BM25) to improve retrieval precision.");
  }
  if (profile.rerankingEnabled) retrievalBase += 35;
  else {
    gaps.push("No reranking layer for retrieved chunks");
    recommendations.push("Add cross-encoder reranking to improve top-k relevance.");
  }
  if (profile.retrievalAccuracyBenchmarked) {
    retrievalBase += 25;
    if ((profile.retrievalHitRate ?? 0) >= 0.8) retrievalBase += 10;
  } else {
    gaps.push("Retrieval quality is not benchmarked on representative queries");
    recommendations.push("Track retrieval precision/recall with offline query sets before production rollout.");
  }
  let retrieval = retrievalBase;
  if (profile.retrievalAccuracyBenchmarked || retrievalQuality.sampleSize > 0) {
    retrieval = Math.round(clamp100(retrievalBase * 0.55 + retrievalQuality.score * 0.45));
  }

  // Dimension 2: Chunking Strategy (0-100)
  const chunkScoreMap: Record<RAGCapabilityProfile["chunkingStrategy"], number> = {
    naive: 10,
    sentence: 30,
    paragraph: 50,
    semantic: 75,
    hierarchical: 90
  };
  let chunkingBase = chunkScoreMap[profile.chunkingStrategy];
  if (profile.chunkOverlapConfigured) chunkingBase = Math.min(100, chunkingBase + 15);
  if (profile.metadataAttachedToChunks) chunkingBase = Math.min(100, chunkingBase + 20);
  else {
    gaps.push("Chunks are missing metadata/source attribution");
    recommendations.push("Attach source id/version/URI metadata to every chunk at ingestion time.");
  }
  if (profile.chunkQualityValidated) chunkingBase = Math.min(100, chunkingBase + 10);
  const chunking = Math.round(clamp100(chunkingBase * 0.7 + metadataQuality.score * 0.3));

  // Dimension 3: Data Freshness (0-100)
  let freshness = 0;
  if (profile.incrementalIndexingEnabled) freshness += 40;
  else gaps.push("Full reindex required for updates");
  if (profile.stalenessDetectionEnabled) freshness += 35;
  if (profile.dataLineageTracked) freshness += 25;
  else gaps.push("No lineage trail from answer to source version");

  // Dimension 4: Production Readiness (0-100)
  let productionBase = 0;
  if (profile.testedBeyond100Docs) productionBase += 40;
  else {
    gaps.push("RAG stack has not been tested at realistic document scale");
    recommendations.push("Load-test retrieval + generation with production-sized corpus.");
  }
  if (profile.latencyBenchmarked) {
    productionBase += 30;
    if ((profile.p99LatencyMs ?? 9_999) < 500) productionBase += 15;
  }
  if (profile.failoverConfigured) productionBase += 15;
  const production = Math.round(clamp100(productionBase * 0.75 + retrievalDrift.score * 0.25));

  // Dimension 5: Evidence & Provenance (0-100)
  let evidenceBase = 0;
  if (profile.sourceAttributionInAnswers) evidenceBase += 45;
  else {
    gaps.push("Answers do not consistently cite source chunks");
    recommendations.push("Include citation ids for all factual claims in generated answers.");
  }
  if (profile.confidenceScoresProvided) evidenceBase += 30;
  if (profile.groundingVerified) evidenceBase += 25;
  const hallucinationQuality = 100 - hallucinationRisk.riskScore;
  const evidence = Math.round(
    clamp100(evidenceBase * 0.45 + citationIntegrity.integrityScore * 0.3 + hallucinationQuality * 0.25)
  );

  // Dimension 6: Security (0-100)
  let security = 0;
  if (profile.accessControlOnIndex) security += 50;
  else {
    gaps.push("No access control on retrieval index");
    recommendations.push("Implement tenant-aware ACL/RLS on vector and keyword index lookups.");
  }
  if (profile.piiFilteringEnabled) security += 30;
  else gaps.push("No PII filtering before indexing");
  if (profile.indexTamperDetected) security += 20;

  if (retrievalQuality.sampleSize > 0 && (retrievalQuality.precision < 0.7 || retrievalQuality.recall < 0.7)) {
    gaps.push(
      `Retrieval precision/recall below target (p=${retrievalQuality.precision.toFixed(2)}, r=${retrievalQuality.recall.toFixed(2)})`
    );
    recommendations.push("Tune query expansion, reranking, and index filters to raise precision/recall above 0.70.");
  }
  if (metadataQuality.score < 70) {
    gaps.push("Chunk metadata quality is below production threshold");
    recommendations.push("Require source uri/id, title, version, and ingest timestamp for indexed chunks.");
  }
  if (retrievalDrift.trend === "degrading") {
    gaps.push(`Retrieval quality drift detected (deltaF1=${retrievalDrift.deltaF1.toFixed(2)})`);
    recommendations.push("Enable retrieval regression alerts and auto-investigate corpus/index changes.");
  }
  if (hallucinationRisk.riskScore > 40) {
    gaps.push(`Hallucination risk is elevated (${hallucinationRisk.riskScore}/100)`);
    recommendations.push("Raise grounding checks and block unsupported high-confidence claims.");
  }
  if (citationIntegrity.integrityScore < 75) {
    gaps.push(`Citation integrity is weak (${citationIntegrity.integrityScore}/100)`);
    recommendations.push("Validate citations against retrieved chunks and source registry before final answer release.");
  }

  const dimensionScores = {
    retrievalQuality: Math.round(retrieval),
    chunkingStrategy: Math.round(chunking),
    dataFreshness: Math.round(freshness),
    productionReadiness: Math.round(production),
    evidenceProvenance: Math.round(evidence),
    security: Math.round(security)
  };

  const overallScore = Math.round(Object.values(dimensionScores).reduce((sum, score) => sum + score, 0) / 6);

  const level: RAGMaturityResult["level"] =
    overallScore >= 85
      ? "L5-Expert"
      : overallScore >= 70
        ? "L4-Enterprise"
        : overallScore >= 50
          ? "L3-Production"
          : overallScore >= 30
            ? "L2-Functional"
            : "L1-Basic";

  const deploymentRisk: RAGMaturityResult["deploymentRisk"] =
    dimensionScores.security < 30 ||
    dimensionScores.productionReadiness < 20 ||
    hallucinationRisk.riskScore >= 80 ||
    citationIntegrity.integrityScore < 30
      ? "critical"
      : overallScore < 40 || hallucinationRisk.riskScore >= 60
        ? "high"
        : overallScore < 65 || retrievalDrift.trend === "degrading"
          ? "medium"
          : "low";

  return {
    overallScore,
    level,
    dimensionScores,
    diagnostics: {
      retrievalQuality,
      metadataQuality,
      retrievalDrift,
      hallucinationRisk,
      citationIntegrity
    },
    gaps,
    recommendations,
    deploymentRisk
  };
}
