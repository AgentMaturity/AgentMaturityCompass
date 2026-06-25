import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { artifactSigPath, trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type RagGroundingClaimLabel = "supported" | "unsupported" | "contradicted" | "unknown";
export type RagGroundingFindingKind =
  | "unsupported_claim"
  | "contradiction"
  | "unknown_claim"
  | "weak_retrieved_support"
  | "stale_retrieval"
  | "poisoning_signal";
export type RagGroundingFindingSeverity = "low" | "medium" | "high" | "critical";
export type RagGroundingEnforcementAction = "allow" | "warn" | "block";
export type RagGroundingSourcePermissionStatus = "allowed" | "denied" | "unknown";

export interface RagGroundingEvalSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface RagGroundingRetrievedChunkInput {
  chunkId: string;
  text: string;
  sourceId?: string | null;
  sourceUri?: string | null;
  sourceTitle?: string | null;
  documentVersion?: string | null;
  ingestedAt?: string | null;
  retrievedAt?: string | null;
  permissionStatus?: RagGroundingSourcePermissionStatus | null;
  retrievedRank?: number | null;
  retrievalScore?: number | null;
  stale?: boolean;
  poisoningSignal?: boolean;
}

export interface RagGroundingRetrievedChunk {
  chunkId: string;
  textSha256: string;
  textPreview: string;
  sourceId: string | null;
  sourceUri: string | null;
  sourceTitle: string | null;
  documentVersion: string | null;
  ingestedAt: string | null;
  retrievedAt: string | null;
  permissionStatus: RagGroundingSourcePermissionStatus;
  retrievedRank: number | null;
  retrievalScore: number | null;
  stale: boolean;
  poisoningSignal: boolean;
}

export interface RagGroundingClaimCitationProvenance {
  claimId: string;
  sourceChunkId: string;
  retrievedAt: string | null;
  confidence: number;
  permissionStatus: RagGroundingSourcePermissionStatus;
  sourceId: string | null;
  sourceUri: string | null;
  documentVersion: string | null;
}

export interface RagGroundingClaimEvaluation {
  claimId: string;
  text: string;
  label: RagGroundingClaimLabel;
  evidenceChunkIds: string[];
  confidence: number;
  citationIds?: string[];
}

export interface RagGroundingEvalCaseInput {
  queryId: string;
  query: string;
  answer: string;
  retrievedChunks: RagGroundingRetrievedChunkInput[];
  claims: RagGroundingClaimEvaluation[];
}

export interface RagGroundingEvalCase {
  queryId: string;
  querySha256: string;
  queryPreview: string;
  answerSha256: string;
  answerPreview: string;
  retrievedChunks: RagGroundingRetrievedChunk[];
  claims: RagGroundingClaimEvaluation[];
  citationProvenance: RagGroundingClaimCitationProvenance[];
  caseHash: string;
}

export interface RagGroundingEvalMetrics {
  queryCount: number;
  retrievedChunkCount: number;
  claimCount: number;
  supportedClaimCount: number;
  unsupportedClaimCount: number;
  contradictedClaimCount: number;
  unknownClaimCount: number;
  faithfulnessScore: number;
  retrievedSupportQuality: number;
  unsupportedClaimRate: number;
  contradictionRate: number;
  staleChunkRate: number;
  poisoningSignalRate: number;
  provenanceCoverage: number;
  citationProvenanceCoverage: number;
}

export interface RagGroundingFinding {
  findingId: string;
  kind: RagGroundingFindingKind;
  severity: RagGroundingFindingSeverity;
  action: RagGroundingEnforcementAction;
  queryId: string | null;
  claimId: string | null;
  chunkId: string | null;
  message: string;
  evidenceRefs: string[];
}

export interface RagGroundingEvalReceipt {
  schemaVersion: "2026-06-25";
  receiptId: string;
  evaluationId: string;
  agentId: string;
  runId: string | null;
  createdAt: string;
  surfaceBinding: ["Score", "Watch", "Enforce"];
  sourceCitations: RagGroundingEvalSourceCitation[];
  cases: RagGroundingEvalCase[];
  metrics: RagGroundingEvalMetrics;
  findings: RagGroundingFinding[];
  enforcementAction: RagGroundingEnforcementAction;
  scoreImpact: {
    penalty0to100: number;
    reason: string;
  };
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
  receiptPath: string | null;
  signaturePath: string | null;
}

export interface RagGroundingEvalVerification {
  valid: boolean;
  failClosedReasons: string[];
}

export interface RagGroundingEvalWriteResult {
  receipt: RagGroundingEvalReceipt;
  receiptPath: string;
  signaturePath: string | null;
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "rag-grounding";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function preview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function normalizePermissionStatus(value: RagGroundingSourcePermissionStatus | null | undefined): RagGroundingSourcePermissionStatus {
  if (value === "allowed" || value === "denied" || value === "unknown") return value;
  return "unknown";
}

function normalizeChunk(chunk: RagGroundingRetrievedChunkInput): RagGroundingRetrievedChunk {
  return {
    chunkId: chunk.chunkId,
    textSha256: sha256Hex(chunk.text),
    textPreview: preview(chunk.text),
    sourceId: chunk.sourceId ?? null,
    sourceUri: chunk.sourceUri ?? null,
    sourceTitle: chunk.sourceTitle ?? null,
    documentVersion: chunk.documentVersion ?? null,
    ingestedAt: chunk.ingestedAt ?? null,
    retrievedAt: chunk.retrievedAt ?? null,
    permissionStatus: normalizePermissionStatus(chunk.permissionStatus),
    retrievedRank: Number.isFinite(chunk.retrievedRank ?? NaN) ? Math.max(1, Math.floor(chunk.retrievedRank!)) : null,
    retrievalScore: Number.isFinite(chunk.retrievalScore ?? NaN) ? clamp01(chunk.retrievalScore!) : null,
    stale: chunk.stale ?? false,
    poisoningSignal: chunk.poisoningSignal ?? false
  };
}

function normalizeClaim(claim: RagGroundingClaimEvaluation): RagGroundingClaimEvaluation {
  return {
    claimId: claim.claimId,
    text: claim.text,
    label: claim.label,
    evidenceChunkIds: [...new Set(claim.evidenceChunkIds.filter((id) => id.trim().length > 0))],
    confidence: clamp01(claim.confidence),
    citationIds: [...new Set((claim.citationIds ?? []).filter((id) => id.trim().length > 0))]
  };
}

function buildCitationProvenance(
  chunks: RagGroundingRetrievedChunk[],
  claims: RagGroundingClaimEvaluation[]
): RagGroundingClaimCitationProvenance[] {
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const rows: RagGroundingClaimCitationProvenance[] = [];
  for (const claim of claims) {
    for (const chunkId of claim.evidenceChunkIds) {
      const chunk = chunksById.get(chunkId);
      if (!chunk) continue;
      rows.push({
        claimId: claim.claimId,
        sourceChunkId: chunk.chunkId,
        retrievedAt: chunk.retrievedAt,
        confidence: claim.confidence,
        permissionStatus: chunk.permissionStatus,
        sourceId: chunk.sourceId,
        sourceUri: chunk.sourceUri,
        documentVersion: chunk.documentVersion
      });
    }
  }
  return rows.sort((a, b) => `${a.claimId}:${a.sourceChunkId}`.localeCompare(`${b.claimId}:${b.sourceChunkId}`));
}

function caseDigest(inputCase: Omit<RagGroundingEvalCase, "caseHash">): string {
  return sha256Hex(canonicalize(inputCase));
}

function normalizeCase(inputCase: RagGroundingEvalCaseInput): RagGroundingEvalCase {
  const retrievedChunks = inputCase.retrievedChunks.map(normalizeChunk);
  const claims = inputCase.claims.map(normalizeClaim);
  const normalizedWithoutHash: Omit<RagGroundingEvalCase, "caseHash"> = {
    queryId: inputCase.queryId,
    querySha256: sha256Hex(inputCase.query),
    queryPreview: preview(inputCase.query),
    answerSha256: sha256Hex(inputCase.answer),
    answerPreview: preview(inputCase.answer),
    retrievedChunks,
    claims,
    citationProvenance: buildCitationProvenance(retrievedChunks, claims)
  };
  return { ...normalizedWithoutHash, caseHash: caseDigest(normalizedWithoutHash) };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function hasChunkProvenance(chunk: RagGroundingRetrievedChunk): boolean {
  return Boolean((chunk.sourceId || chunk.sourceUri) && chunk.documentVersion && chunk.ingestedAt);
}

function hasValidTimestamp(value: string | null): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function hasClaimCitationProvenance(row: RagGroundingClaimCitationProvenance): boolean {
  return hasValidTimestamp(row.retrievedAt) && row.permissionStatus === "allowed";
}

function computeMetrics(cases: RagGroundingEvalCase[]): RagGroundingEvalMetrics {
  const chunks = cases.flatMap((inputCase) => inputCase.retrievedChunks);
  const claims = cases.flatMap((inputCase) => inputCase.claims);
  const citationProvenance = cases.flatMap((inputCase) => inputCase.citationProvenance);
  const citationEvidenceEdgeCount = cases.reduce(
    (count, inputCase) => count + inputCase.claims.reduce((claimCount, claim) => claimCount + claim.evidenceChunkIds.length, 0),
    0
  );
  const retrievedByCase = new Map(cases.map((inputCase) => [
    inputCase.queryId,
    new Set(inputCase.retrievedChunks.map((chunk) => chunk.chunkId))
  ]));

  let supportedClaimCount = 0;
  let unsupportedClaimCount = 0;
  let contradictedClaimCount = 0;
  let unknownClaimCount = 0;
  let claimsWithRetrievedSupport = 0;

  for (const inputCase of cases) {
    const retrieved = retrievedByCase.get(inputCase.queryId) ?? new Set<string>();
    for (const claim of inputCase.claims) {
      if (claim.label === "supported") supportedClaimCount += 1;
      if (claim.label === "unsupported") unsupportedClaimCount += 1;
      if (claim.label === "contradicted") contradictedClaimCount += 1;
      if (claim.label === "unknown") unknownClaimCount += 1;
      if (claim.evidenceChunkIds.length > 0 && claim.evidenceChunkIds.every((chunkId) => retrieved.has(chunkId))) {
        claimsWithRetrievedSupport += 1;
      }
    }
  }

  return {
    queryCount: cases.length,
    retrievedChunkCount: chunks.length,
    claimCount: claims.length,
    supportedClaimCount,
    unsupportedClaimCount,
    contradictedClaimCount,
    unknownClaimCount,
    faithfulnessScore: ratio(supportedClaimCount, claims.length),
    retrievedSupportQuality: ratio(claimsWithRetrievedSupport, claims.length),
    unsupportedClaimRate: ratio(unsupportedClaimCount, claims.length),
    contradictionRate: ratio(contradictedClaimCount, claims.length),
    staleChunkRate: ratio(chunks.filter((chunk) => chunk.stale).length, chunks.length),
    poisoningSignalRate: ratio(chunks.filter((chunk) => chunk.poisoningSignal).length, chunks.length),
    provenanceCoverage: ratio(chunks.filter(hasChunkProvenance).length, chunks.length),
    citationProvenanceCoverage: ratio(citationProvenance.filter(hasClaimCitationProvenance).length, citationEvidenceEdgeCount)
  };
}

function findingId(kind: RagGroundingFindingKind, queryId: string | null, claimId: string | null, chunkId: string | null): string {
  return `rgf_${safeIdPart(kind)}_${safeIdPart(queryId ?? "none")}_${safeIdPart(claimId ?? chunkId ?? randomUUID())}`;
}

function buildFindings(cases: RagGroundingEvalCase[], metrics: RagGroundingEvalMetrics): RagGroundingFinding[] {
  const findings: RagGroundingFinding[] = [];
  for (const inputCase of cases) {
    for (const claim of inputCase.claims) {
      if (claim.label === "unsupported") {
        const severity: RagGroundingFindingSeverity = claim.confidence >= 0.8 ? "high" : "medium";
        findings.push({
          findingId: findingId("unsupported_claim", inputCase.queryId, claim.claimId, null),
          kind: "unsupported_claim",
          severity,
          action: severity === "high" ? "block" : "warn",
          queryId: inputCase.queryId,
          claimId: claim.claimId,
          chunkId: null,
          message: "Claim is unsupported by retrieved chunks.",
          evidenceRefs: [...claim.evidenceChunkIds, ...(claim.citationIds ?? [])]
        });
      }
      if (claim.label === "contradicted") {
        findings.push({
          findingId: findingId("contradiction", inputCase.queryId, claim.claimId, null),
          kind: "contradiction",
          severity: "critical",
          action: "block",
          queryId: inputCase.queryId,
          claimId: claim.claimId,
          chunkId: null,
          message: "Claim contradicts retrieved evidence.",
          evidenceRefs: [...claim.evidenceChunkIds, ...(claim.citationIds ?? [])]
        });
      }
      if (claim.label === "unknown" && claim.confidence >= 0.8) {
        findings.push({
          findingId: findingId("unknown_claim", inputCase.queryId, claim.claimId, null),
          kind: "unknown_claim",
          severity: "medium",
          action: "warn",
          queryId: inputCase.queryId,
          claimId: claim.claimId,
          chunkId: null,
          message: "High-confidence claim is unresolved by retrieved evidence.",
          evidenceRefs: [...claim.evidenceChunkIds, ...(claim.citationIds ?? [])]
        });
      }
    }
    for (const chunk of inputCase.retrievedChunks) {
      if (chunk.stale) {
        findings.push({
          findingId: findingId("stale_retrieval", inputCase.queryId, null, chunk.chunkId),
          kind: "stale_retrieval",
          severity: "medium",
          action: "warn",
          queryId: inputCase.queryId,
          claimId: null,
          chunkId: chunk.chunkId,
          message: "Retrieved chunk is marked stale.",
          evidenceRefs: [chunk.chunkId]
        });
      }
      if (chunk.poisoningSignal) {
        findings.push({
          findingId: findingId("poisoning_signal", inputCase.queryId, null, chunk.chunkId),
          kind: "poisoning_signal",
          severity: "critical",
          action: "block",
          queryId: inputCase.queryId,
          claimId: null,
          chunkId: chunk.chunkId,
          message: "Retrieved chunk has a poisoning signal.",
          evidenceRefs: [chunk.chunkId]
        });
      }
    }
  }

  if (metrics.claimCount > 0 && metrics.retrievedSupportQuality < 0.8) {
    findings.push({
      findingId: findingId("weak_retrieved_support", null, null, null),
      kind: "weak_retrieved_support",
      severity: metrics.retrievedSupportQuality < 0.5 ? "high" : "medium",
      action: metrics.retrievedSupportQuality < 0.5 ? "block" : "warn",
      queryId: null,
      claimId: null,
      chunkId: null,
      message: "Retrieved support quality is below threshold.",
      evidenceRefs: []
    });
  }

  return findings.sort((a, b) => a.findingId.localeCompare(b.findingId));
}

function enforcementActionFor(findings: RagGroundingFinding[]): RagGroundingEnforcementAction {
  if (findings.some((finding) => finding.action === "block")) return "block";
  if (findings.some((finding) => finding.action === "warn")) return "warn";
  return "allow";
}

function scoreImpact(metrics: RagGroundingEvalMetrics): RagGroundingEvalReceipt["scoreImpact"] {
  const penalty = Math.round(
    Math.min(100, (1 - metrics.faithfulnessScore) * 45 + metrics.contradictionRate * 35 + metrics.poisoningSignalRate * 20)
  );
  return {
    penalty0to100: penalty,
    reason: penalty > 0
      ? "RAG grounding findings lower Score confidence until unsupported or contradicted claims are resolved."
      : "No RAG grounding penalty."
  };
}

function receiptDigest(receipt: RagGroundingEvalReceipt): string {
  return sha256Hex(canonicalize({
    ...receipt,
    receiptHash: "",
    receiptPath: null,
    signaturePath: null
  }));
}

function collectFailClosedReasons(receipt: RagGroundingEvalReceipt): string[] {
  const reasons: string[] = [];
  if (receipt.sourceCitations.length === 0) reasons.push("rag-grounding-eval:source-citation:missing");
  if (receipt.cases.length === 0) reasons.push("rag-grounding-eval:cases:missing");
  if (!receipt.receiptPath) reasons.push("rag-grounding-eval:receipt-path:missing");
  if (!receipt.signaturePath) reasons.push("rag-grounding-eval:signature:missing");

  for (const inputCase of receipt.cases) {
    if (!inputCase.queryId || !inputCase.queryPreview) {
      reasons.push(`rag-grounding-eval:case:${inputCase.queryId || "unknown"}:query:missing`);
    }
    if (inputCase.retrievedChunks.length === 0) {
      reasons.push(`rag-grounding-eval:case:${inputCase.queryId}:retrieved-chunks:missing`);
    }
    if (inputCase.claims.length === 0) {
      reasons.push(`rag-grounding-eval:case:${inputCase.queryId}:claim-labels:missing`);
    }
    const retrievedIds = new Set(inputCase.retrievedChunks.map((chunk) => chunk.chunkId));
    for (const chunk of inputCase.retrievedChunks) {
      if (!chunk.chunkId || !chunk.textSha256) {
        reasons.push(`rag-grounding-eval:case:${inputCase.queryId}:chunk:invalid`);
      }
      if (!hasChunkProvenance(chunk)) {
        reasons.push(`rag-grounding-eval:chunk:${chunk.chunkId}:provenance:missing`);
      }
    }
    for (const claim of inputCase.claims) {
      if ((claim.label === "supported" || claim.label === "contradicted") && claim.evidenceChunkIds.length === 0) {
        reasons.push(`rag-grounding-eval:claim:${claim.claimId}:evidence:missing`);
      }
      for (const chunkId of claim.evidenceChunkIds) {
        const retrievedChunk = inputCase.retrievedChunks.find((chunk) => chunk.chunkId === chunkId);
        if (!retrievedIds.has(chunkId) || !retrievedChunk) {
          reasons.push(`rag-grounding-eval:claim:${claim.claimId}:evidence-not-retrieved`);
          continue;
        }
        if (!hasValidTimestamp(retrievedChunk.retrievedAt)) {
          reasons.push(`rag-grounding-eval:claim:${claim.claimId}:citation:${chunkId}:retrieved-at:missing`);
        }
        if (retrievedChunk.permissionStatus !== "allowed") {
          reasons.push(`rag-grounding-eval:claim:${claim.claimId}:citation:${chunkId}:permission:not-allowed`);
        }
      }
    }
  }

  const expectedHash = receiptDigest(receipt);
  if (receipt.receiptHash !== expectedHash) reasons.push("rag-grounding-eval:receipt-hash:mismatch");
  if (receipt.failClosed && reasons.length === 0) reasons.push("rag-grounding-eval:fail-closed:mismatch");
  if (!receipt.failClosed && reasons.length > 0) reasons.push("rag-grounding-eval:fail-open:invalid");
  return [...new Set(reasons)];
}

export function buildRagGroundingEvalReceipt(input: {
  evaluationId: string;
  agentId: string;
  runId?: string | null;
  cases: RagGroundingEvalCaseInput[];
  sourceCitations?: RagGroundingEvalSourceCitation[];
  createdAt?: string;
}): RagGroundingEvalReceipt {
  const cases = input.cases.map(normalizeCase);
  const metrics = computeMetrics(cases);
  const findings = buildFindings(cases, metrics);
  const baseReceipt: RagGroundingEvalReceipt = {
    schemaVersion: "2026-06-25",
    receiptId: `rgr_${randomUUID().replace(/-/g, "")}`,
    evaluationId: input.evaluationId,
    agentId: input.agentId,
    runId: input.runId ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    surfaceBinding: ["Score", "Watch", "Enforce"],
    sourceCitations: input.sourceCitations ?? [],
    cases,
    metrics,
    findings,
    enforcementAction: enforcementActionFor(findings),
    scoreImpact: scoreImpact(metrics),
    failClosed: false,
    failClosedReasons: [],
    receiptHash: "",
    receiptPath: null,
    signaturePath: null
  };
  const withHash = { ...baseReceipt, receiptHash: receiptDigest(baseReceipt) };
  const reasons = collectFailClosedReasons(withHash);
  const withStatus: RagGroundingEvalReceipt = {
    ...withHash,
    failClosed: reasons.length > 0,
    failClosedReasons: reasons.filter((reason) => reason !== "rag-grounding-eval:fail-open:invalid"),
    receiptHash: ""
  };
  return { ...withStatus, receiptHash: receiptDigest(withStatus) };
}

export function ragGroundingEvalReceiptPath(workspace: string, evaluationId: string): string {
  return join(resolve(workspace), ".amc", "rag-grounding-evals", `${safeIdPart(evaluationId)}.json`);
}

export function writeRagGroundingEvalReceipt(input: {
  workspace: string;
  evaluationId: string;
  agentId: string;
  runId?: string | null;
  cases: RagGroundingEvalCaseInput[];
  sourceCitations?: RagGroundingEvalSourceCitation[];
  createdAt?: string;
}): RagGroundingEvalWriteResult {
  const built = buildRagGroundingEvalReceipt(input);
  const receiptPath = ragGroundingEvalReceiptPath(input.workspace, input.evaluationId);
  const signaturePath = artifactSigPath(receiptPath);
  const writableWithoutHash: RagGroundingEvalReceipt = {
    ...built,
    failClosed: false,
    failClosedReasons: [],
    receiptHash: "",
    receiptPath,
    signaturePath
  };
  const writable = { ...writableWithoutHash, receiptHash: receiptDigest(writableWithoutHash) };
  const reasons = collectFailClosedReasons(writable);
  const finalWithoutHash: RagGroundingEvalReceipt = {
    ...writableWithoutHash,
    failClosed: reasons.length > 0,
    failClosedReasons: reasons.filter((reason) => reason !== "rag-grounding-eval:fail-open:invalid"),
    receiptHash: ""
  };
  const receipt = { ...finalWithoutHash, receiptHash: receiptDigest(finalWithoutHash) };
  writeFileAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace: input.workspace, path: receiptPath, artifactKind: "rag-grounding-eval-receipt" });
  return { receipt, receiptPath, signaturePath: signed?.sigPath ?? null };
}

export function verifyRagGroundingEvalReceipt(receipt: RagGroundingEvalReceipt): RagGroundingEvalVerification {
  const reasons = collectFailClosedReasons(receipt);
  return {
    valid: reasons.length === 0 && !receipt.failClosed,
    failClosedReasons: reasons
  };
}

export function renderRagGroundingEvalAuditExport(receipt: RagGroundingEvalReceipt): string {
  const verification = verifyRagGroundingEvalReceipt(receipt);
  const status = verification.valid ? receipt.enforcementAction.toUpperCase() : "FAIL_CLOSED";
  const lines = [
    "# AMC RAG Grounding Evaluation Receipt",
    "",
    `- Receipt: ${receipt.receiptId}`,
    `- Evaluation: ${receipt.evaluationId}`,
    `- Agent: ${receipt.agentId}`,
    `- Status: ${status}`,
    `- Surfaces: ${receipt.surfaceBinding.join(", ")}`,
    `- Faithfulness score: ${receipt.metrics.faithfulnessScore.toFixed(3)}`,
    `- Retrieved support quality: ${receipt.metrics.retrievedSupportQuality.toFixed(3)}`,
    `- Unsupported claim rate: ${receipt.metrics.unsupportedClaimRate.toFixed(3)}`,
    `- Contradiction rate: ${receipt.metrics.contradictionRate.toFixed(3)}`,
    `- Citation provenance coverage: ${receipt.metrics.citationProvenanceCoverage.toFixed(3)}`,
    `- Score penalty: ${receipt.scoreImpact.penalty0to100}/100`,
    "",
    "## Citation Provenance",
    ...(receipt.cases.flatMap((inputCase) => inputCase.citationProvenance).length
      ? receipt.cases.flatMap((inputCase) => inputCase.citationProvenance)
        .map((row) => `- ${row.claimId} -> ${row.sourceChunkId}: ${row.retrievedAt ?? "missing"} ${row.permissionStatus}`)
      : ["- None"]),
    "",
    "## Findings",
    ...(receipt.findings.length
      ? receipt.findings.map((finding) => `- ${finding.kind} ${finding.severity} ${finding.action}: ${finding.claimId ?? finding.chunkId ?? "eval"} ${finding.message}`)
      : ["- None"]),
    "",
    "## Verification",
    verification.valid ? "- VALID" : `- FAIL_CLOSED: ${verification.failClosedReasons.join("; ")}`
  ];
  return `${lines.join("\n")}\n`;
}
