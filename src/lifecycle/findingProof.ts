import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import type { DiagnosticReport, QuestionScore } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { AMCSurface } from "./lifecycleRunArtifact.js";
import type { DecisionReceipt } from "./decisionReceipt.js";

export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FindingProofStatus = "verified" | "unverified";

export interface FindingProofRef {
  kind: "diagnostic-report" | "episode-record" | "resource-manifest" | "decision-receipt";
  ref: string;
  sha256?: string;
}

export interface FindingProof {
  schemaVersion: "2026-05-22";
  proofId: string;
  findingId: string;
  runId: string;
  lifecycleRunId: string;
  agentId: string;
  workspace: string;
  surface: AMCSurface;
  severity: FindingSeverity;
  status: FindingProofStatus;
  questionId: string;
  scoreImpact: number;
  currentLevel: number;
  targetLevel: number;
  confidence: number;
  uncertaintyNotes: string[];
  evidenceEpisodeIds: string[];
  evidenceEventIds: string[];
  resourceManifestIds: string[];
  policyIds: string[];
  recommendationIds: string[];
  receiptIds: string[];
  proofRefs: FindingProofRef[];
}

export interface FindingProofSetRef {
  proofSetId: string;
  path: string;
  proofCount: number;
  verifiedCount: number;
}

export interface WriteFindingProofsInput {
  workspace: string;
  report: DiagnosticReport;
  command: string;
  episodeIds?: string[];
  resourceManifestIds?: string[];
  decisionReceipts?: DecisionReceipt[];
}

export interface WriteFindingProofsResult {
  proofs: FindingProof[];
  proofSetRef: FindingProofSetRef;
  proofsPath: string;
  markdownPath: string | null;
}

export interface FindingProofExportResult {
  proofs: FindingProof[];
  outputPath: string;
  redacted: boolean;
}

const CRITICAL_FLAGS = new Set([
  "FLAG_LEDGER_INVALID",
  "FLAG_CONFIG_UNTRUSTED",
  "FLAG_INVALID_RECEIPTS"
]);

function surfaceForQuestion(score: QuestionScore): AMCSurface {
  const flags = new Set(score.flags);
  if (flags.has("FLAG_ASSURANCE_CAP") || flags.has("FLAG_ASSURANCE_EVIDENCE_MISSING")) return "Shield";
  if (
    flags.has("FLAG_TOOLHUB_REQUIRED") ||
    flags.has("FLAG_APPROVAL_REPLAY") ||
    flags.has("FLAG_PROVIDER_ROUTE_MISMATCH") ||
    flags.has("FLAG_TRUTH_PROTOCOL_REQUIRED")
  ) return "Enforce";
  if (
    flags.has("FLAG_LEDGER_INVALID") ||
    flags.has("FLAG_CONFIG_UNTRUSTED") ||
    flags.has("FLAG_INVALID_RECEIPTS")
  ) return "Vault";
  if (flags.has("FLAG_CORRELATION_LOW") || flags.has("FLAG_MISSING_LLM_EVIDENCE")) return "Watch";
  if (/COMPLY|REG|EU|ISO|SOC|NIST/i.test(score.questionId)) return "Comply";
  if (/FLEET|MULTI|CROSS/i.test(score.questionId)) return "Fleet";
  if (/PORT|PASSPORT|IDENTITY|REPUTATION/i.test(score.questionId)) return "Passport";
  return "Score";
}

function severityForQuestion(score: QuestionScore): FindingSeverity {
  if (score.flags.some((flag) => CRITICAL_FLAGS.has(flag))) return "critical";
  if (score.finalLevel <= 1) return "high";
  if (score.finalLevel < 3) return "medium";
  return "low";
}

function policyIdsForQuestion(score: QuestionScore): string[] {
  const ids = new Set<string>();
  for (const flag of score.flags) {
    if (flag.includes("TOOLHUB") || flag.includes("APPROVAL")) ids.add("enforce-action-policy");
    if (flag.includes("PROVIDER_ROUTE") || flag.includes("LEASE")) ids.add("model-route-policy");
    if (flag.includes("CONFIG")) ids.add("signed-resource-policy");
    if (flag.includes("ASSURANCE")) ids.add("shield-assurance-policy");
    if (flag.includes("CORRELATION") || flag.includes("MISSING_LLM")) ids.add("watch-evidence-policy");
  }
  return [...ids].sort();
}

function targetLevelForQuestion(report: DiagnosticReport, score: QuestionScore): number {
  return report.targetDiff.find((row) => row.questionId === score.questionId)?.target ?? Math.max(3, score.finalLevel + 1);
}

function recommendationIdsForQuestion(report: DiagnosticReport, score: QuestionScore, receipts: DecisionReceipt[]): string[] {
  const ids = receipts
    .filter((receipt) => receipt.subject.questionId === score.questionId)
    .map((receipt) => receipt.receiptId);
  if (ids.length > 0) {
    return ids.sort();
  }
  return [`recommendation-${report.runId}-${score.questionId}`];
}

function uncertaintyNotes(report: DiagnosticReport, score: QuestionScore): string[] {
  const notes: string[] = [];
  if (score.evidenceEventIds.length === 0) notes.push("No direct evidence event was linked to this finding.");
  if (score.confidence < 0.5) notes.push("Confidence is below the recommended proof threshold.");
  if (report.status !== "VALID") notes.push(`Diagnostic report status is ${report.status}.`);
  if (score.flags.includes("FLAG_LEDGER_INVALID")) notes.push("Evidence ledger verification failed.");
  if (score.flags.length > 0) notes.push(`Flags: ${score.flags.join(", ")}`);
  return notes;
}

function findingStatus(report: DiagnosticReport, score: QuestionScore): FindingProofStatus {
  if (report.status !== "VALID") return "unverified";
  if (score.evidenceEventIds.length === 0) return "unverified";
  if (score.confidence < 0.5) return "unverified";
  if (score.flags.includes("FLAG_LEDGER_INVALID")) return "unverified";
  return "verified";
}

function proofRefs(params: {
  report: DiagnosticReport;
  episodeIds: string[];
  resourceManifestIds: string[];
  receipts: DecisionReceipt[];
  recommendationIds: string[];
}): FindingProofRef[] {
  const refs: FindingProofRef[] = [{
    kind: "diagnostic-report",
    ref: params.report.runId,
    sha256: params.report.reportJsonSha256
  }];
  for (const episodeId of params.episodeIds) refs.push({ kind: "episode-record", ref: episodeId });
  for (const manifestId of params.resourceManifestIds) refs.push({ kind: "resource-manifest", ref: manifestId });
  for (const receipt of params.receipts.filter((row) => params.recommendationIds.includes(row.receiptId))) {
    refs.push({ kind: "decision-receipt", ref: receipt.receiptId });
  }
  return refs;
}

export function buildFindingProofs(input: WriteFindingProofsInput): FindingProof[] {
  const workspace = resolve(input.workspace);
  const receipts = input.decisionReceipts ?? [];
  const episodeIds = input.episodeIds?.length ? input.episodeIds : [`episode-${input.report.runId}`];
  const resourceManifestIds = input.resourceManifestIds ?? [];
  return input.report.questionScores
    .filter((score) => score.finalLevel < 3 || score.flags.length > 0)
    .sort((a, b) => a.finalLevel - b.finalLevel || a.questionId.localeCompare(b.questionId))
    .map((score) => {
      const targetLevel = targetLevelForQuestion(input.report, score);
      const recommendationIds = recommendationIdsForQuestion(input.report, score, receipts);
      const proofId = `finding-proof-${input.report.runId}-${score.questionId}`;
      return {
        schemaVersion: "2026-05-22",
        proofId,
        findingId: `finding-${input.report.runId}-${score.questionId}`,
        runId: input.report.runId,
        lifecycleRunId: `lifecycle-${input.report.runId}`,
        agentId: input.report.agentId,
        workspace,
        surface: surfaceForQuestion(score),
        severity: severityForQuestion(score),
        status: findingStatus(input.report, score),
        questionId: score.questionId,
        scoreImpact: Number(Math.max(0, targetLevel - score.finalLevel).toFixed(3)),
        currentLevel: score.finalLevel,
        targetLevel,
        confidence: Number(score.confidence.toFixed(4)),
        uncertaintyNotes: uncertaintyNotes(input.report, score),
        evidenceEpisodeIds: episodeIds,
        evidenceEventIds: [...new Set(score.evidenceEventIds)].sort(),
        resourceManifestIds,
        policyIds: policyIdsForQuestion(score),
        recommendationIds,
        receiptIds: receipts.map((receipt) => receipt.receiptId).filter((id) => recommendationIds.includes(id)),
        proofRefs: proofRefs({
          report: input.report,
          episodeIds,
          resourceManifestIds,
          receipts,
          recommendationIds
        })
      } satisfies FindingProof;
    });
}

export function findingProofsDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "finding-proofs");
}

export function findingProofsPath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(findingProofsDir(workspace, agentId), `${runId}.json`);
}

function reportMarkdownPath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(getAgentPaths(workspace, agentId).reportsDir, `${runId}.md`);
}

function findingProofMarkdown(proofs: FindingProof[], proofSetRef: FindingProofSetRef): string {
  const rows = proofs.slice(0, 20).map((proof) => (
    `| ${proof.proofId} | ${proof.surface} | ${proof.severity} | ${proof.status} | ${proof.questionId} | ${proof.evidenceEpisodeIds.join(", ")} | ${proof.recommendationIds.join(", ")} |`
  ));
  return [
    "",
    "<!-- amc:finding-proof-chain:start -->",
    "## Finding Proof Chain",
    "",
    `Proof set: \`${proofSetRef.proofSetId}\``,
    "",
    "| Proof | Surface | Severity | Status | Finding | Evidence Episodes | Recommendations |",
    "|---|---|---|---|---|---|---|",
    ...(rows.length > 0 ? rows : ["| - | - | - | - | - | - | - |"]),
    "",
    "<!-- amc:finding-proof-chain:end -->",
    ""
  ].join("\n");
}

function appendFindingProofsToReportMarkdown(input: {
  workspace: string;
  report: DiagnosticReport;
  proofs: FindingProof[];
  proofSetRef: FindingProofSetRef;
}): string | null {
  const markdownPath = reportMarkdownPath(input.workspace, input.report.agentId, input.report.runId);
  if (!existsSync(markdownPath)) {
    return null;
  }
  const current = readUtf8(markdownPath);
  const section = findingProofMarkdown(input.proofs, input.proofSetRef);
  const start = "<!-- amc:finding-proof-chain:start -->";
  const end = "<!-- amc:finding-proof-chain:end -->";
  const startIndex = current.indexOf(start);
  const endIndex = current.indexOf(end);
  const next = startIndex >= 0 && endIndex > startIndex
    ? `${current.slice(0, startIndex).trimEnd()}\n${section}${current.slice(endIndex + end.length).trimStart()}`
    : `${current.trimEnd()}\n${section}`;
  writeFileAtomic(markdownPath, next, 0o644);
  return markdownPath;
}

export function writeFindingProofs(input: WriteFindingProofsInput): WriteFindingProofsResult {
  const proofs = buildFindingProofs(input);
  const proofsPath = findingProofsPath(input.workspace, input.report.agentId, input.report.runId);
  const proofSetRef: FindingProofSetRef = {
    proofSetId: `finding-proofs-${input.report.runId}`,
    path: proofsPath,
    proofCount: proofs.length,
    verifiedCount: proofs.filter((proof) => proof.status === "verified").length
  };
  const body = {
    schemaVersion: "2026-05-22",
    proofSetId: proofSetRef.proofSetId,
    runId: input.report.runId,
    lifecycleRunId: `lifecycle-${input.report.runId}`,
    agentId: input.report.agentId,
    command: input.command,
    proofSetSha256: sha256Hex(JSON.stringify(proofs)),
    proofs
  };
  writeFileAtomic(proofsPath, `${JSON.stringify(body, null, 2)}\n`, 0o644);
  const markdownPath = appendFindingProofsToReportMarkdown({
    workspace: input.workspace,
    report: input.report,
    proofs,
    proofSetRef
  });
  return { proofs, proofSetRef, proofsPath, markdownPath };
}

function parseFindingProofFile(path: string): FindingProof[] {
  const parsed = JSON.parse(readUtf8(path)) as { proofs?: FindingProof[] };
  return Array.isArray(parsed.proofs) ? parsed.proofs : [];
}

export function listFindingProofs(input: { workspace: string; agentId?: string; limit?: number }): FindingProof[] {
  const dir = findingProofsDir(input.workspace, input.agentId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .flatMap((entry) => parseFindingProofFile(join(dir, entry)))
    .sort((a, b) => b.runId.localeCompare(a.runId) || a.questionId.localeCompare(b.questionId))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

export function loadFindingProof(input: { workspace: string; selector: string; agentId?: string }): FindingProof {
  const found = listFindingProofs({ workspace: input.workspace, agentId: input.agentId })
    .find((proof) =>
      proof.proofId === input.selector ||
      proof.findingId === input.selector ||
      proof.runId === input.selector ||
      proof.questionId === input.selector
    );
  if (!found) {
    throw new Error(`Finding proof not found: ${input.selector}`);
  }
  return found;
}

export function redactFindingProof(proof: FindingProof): FindingProof {
  return {
    ...proof,
    workspace: "$WORKSPACE"
  };
}

export function exportFindingProofs(input: {
  workspace: string;
  outputPath: string;
  agentId?: string;
  runId?: string;
  redacted?: boolean;
}): FindingProofExportResult {
  const proofs = listFindingProofs({ workspace: input.workspace, agentId: input.agentId })
    .filter((proof) => !input.runId || proof.runId === input.runId)
    .map((proof) => input.redacted ? redactFindingProof(proof) : proof);
  writeFileAtomic(resolve(input.outputPath), `${JSON.stringify(proofs, null, 2)}\n`, 0o644);
  return { proofs, outputPath: resolve(input.outputPath), redacted: Boolean(input.redacted) };
}
