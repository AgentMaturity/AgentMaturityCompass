import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import type { EnforceResourceManifestRef } from "../enforce/resourceManifest.js";
import type { DiagnosticReport } from "../types.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import { trySignArtifactFile } from "./artifactSignature.js";
import type { LifecycleChangeReceiptRef } from "./changeReceipt.js";
import type { FindingProofSetRef } from "./findingProof.js";
import type { ObservabilityLaneRef } from "./observabilityLane.js";
import { runtimeRunSummaryForLifecycle, type RuntimeRunLifecycleSummary } from "../runtime/runManager.js";
import { evaluateDiagnosticEvidenceReadiness } from "../diagnostic/evidenceReadiness.js";

export type AMCSurface = "Score" | "Shield" | "Enforce" | "Vault" | "Watch" | "Comply" | "Fleet" | "Passport";
export type LifecycleSurfaceStatus = "complete" | "partial" | "pending" | "degraded";

export const AMC_SURFACE_ORDER: AMCSurface[] = ["Score", "Shield", "Enforce", "Vault", "Watch", "Comply", "Fleet", "Passport"];

export interface AMCSurfaceDefinition {
  surface: AMCSurface;
  headline: string;
  description: string;
}

export const AMC_SURFACE_DEFINITIONS: AMCSurfaceDefinition[] = [
  {
    surface: "Score",
    headline: "Score trust before you ship",
    description: "Evidence-weighted scoring across live execution behavior instead of brochure claims."
  },
  {
    surface: "Shield",
    headline: "Attack your agent before attackers do",
    description: "Runs adversarial packs against prompt injection, leakage, memory poisoning, and sycophancy."
  },
  {
    surface: "Enforce",
    headline: "Wrap agent actions in policy",
    description: "Approval gates, scoped permissions, and runtime controls for sensitive operations."
  },
  {
    surface: "Vault",
    headline: "Cryptographically prove what happened",
    description: "Signs evidence, verifies ledgers, and gives auditors a tamper-evident chain of custody."
  },
  {
    surface: "Watch",
    headline: "See trust drift before it hurts you",
    description: "Monitors posture over time and surfaces anomalies, regressions, and risky changes."
  },
  {
    surface: "Comply",
    headline: "Map trust evidence to real frameworks",
    description: "Turns technical evidence into regulator-readable artifacts for audits and risk reviews."
  },
  {
    surface: "Fleet",
    headline: "Govern many agents like an actual platform",
    description: "Benchmarks multiple agents, compares risk posture, and enforces org-wide trust baselines."
  },
  {
    surface: "Passport",
    headline: "Make trust portable between environments",
    description: "Issues a portable, signed trust identity that can move between tools, teams, and environments."
  }
];

export interface LifecycleSurfaceSummary {
  status: LifecycleSurfaceStatus;
  summary: string;
  refs: string[];
}

export interface LifecycleRunArtifact {
  schemaVersion: "2026-05-22";
  lifecycleRunId: string;
  runId: string;
  agentId: string;
  workspace: string;
  source: "cli" | "studio" | "api" | "ci" | "import";
  command: string;
  stage: "score.generated" | "org.run.completed" | "org.role.completed" | "import.completed";
  createdAt: string;
  elapsedMs: number | null;
  surfaces: Record<AMCSurface, LifecycleSurfaceSummary>;
  evidence: {
    diagnosticReport: {
      runId: string;
      status: DiagnosticReport["status"];
      artifactStatus: DiagnosticReport["status"];
      evidenceStatus: NonNullable<DiagnosticReport["evidenceReadiness"]>["status"];
      claimEligible: boolean;
      jsonPath: string;
      markdownPath: string;
      reportJsonSha256: string;
    };
    episodeRecords: Array<{
      episodeId: string;
      path: string;
    }>;
    decisionReceipts: Array<{
      receiptId: string;
      path: string;
    }>;
    lifecycleReceipts: LifecycleChangeReceiptRef[];
    findingProofs: FindingProofSetRef[];
    observabilityRecords: ObservabilityLaneRef[];
    resourceManifests: EnforceResourceManifestRef[];
    runtimeRuns: RuntimeRunLifecycleSummary[];
    evidenceCoverage: number;
    trustCoverage: DiagnosticReport["evidenceTrustCoverage"];
  };
  setup: {
    createdWorkspace: boolean;
    createdAgentContext: boolean;
    signed: boolean;
    vaultReason: string | null;
  };
  receipts: string[];
}

export interface WriteLifecycleRunArtifactInput {
  workspace: string;
  report: DiagnosticReport;
  source: LifecycleRunArtifact["source"];
  command: string;
  stage?: LifecycleRunArtifact["stage"];
  elapsedMs?: number;
  createdWorkspace?: boolean;
  createdAgentContext?: boolean;
  signed?: boolean;
  vaultReason?: string | null;
  episodeRecords?: Array<{
    episodeId: string;
    path: string;
  }>;
  decisionReceipts?: Array<{
    receiptId: string;
    path: string;
  }>;
  lifecycleReceipts?: LifecycleChangeReceiptRef[];
  findingProofs?: FindingProofSetRef[];
  observabilityRecords?: ObservabilityLaneRef[];
  resourceManifests?: EnforceResourceManifestRef[];
  runtimeRuns?: RuntimeRunLifecycleSummary[];
  surfaceOverrides?: Partial<Record<AMCSurface, LifecycleSurfaceSummary>>;
}

export interface WriteLifecycleRunArtifactResult {
  artifact: LifecycleRunArtifact;
  artifactPath: string;
  signaturePath: string | null;
}

export interface LifecycleRunArtifactExportResult {
  artifact: LifecycleRunArtifact;
  outputPath: string;
  redacted: boolean;
}

function lifecycleSurfaces(report: DiagnosticReport): Record<AMCSurface, LifecycleSurfaceSummary> {
  const readiness = evaluateDiagnosticEvidenceReadiness(report);
  const scoreLevel = report.layerScores.length === 0
    ? 0
    : report.layerScores.reduce((sum, layer) => sum + layer.avgFinalLevel, 0) / report.layerScores.length;
  const vaultStatus: LifecycleSurfaceStatus = report.status === "VALID" ? "complete" : report.status === "UNSIGNED" ? "degraded" : "partial";
  const watchStatus: LifecycleSurfaceStatus = report.evidenceCoverage > 0 ? "partial" : "pending";

  return {
    Score: {
      status: readiness.claimEligible ? "complete" : "partial",
      summary: readiness.claimEligible
        ? `Claim-ready full maturity score generated at L${scoreLevel.toFixed(2)} with ${report.questionScores.length} questions.`
        : `Full maturity baseline generated at L${scoreLevel.toFixed(2)}, but evidence is ${readiness.status} and not claim-ready.`,
      refs: [report.runId]
    },
    Shield: {
      status: "pending",
      summary: "Assurance packs are available but were not part of this full-score artifact.",
      refs: []
    },
    Enforce: {
      status: report.approvalHygiene || report.toolHubUsage ? "partial" : "pending",
      summary: "Policy, approval, and tool-use signals are summarized when present in diagnostic evidence.",
      refs: []
    },
    Vault: {
      status: vaultStatus,
      summary: report.status === "VALID"
        ? "Diagnostic report hash was sealed."
        : "Diagnostic report was generated without a fully valid seal.",
      refs: [report.reportJsonSha256]
    },
    Watch: {
      status: watchStatus,
      summary: `Evidence coverage is ${(report.evidenceCoverage * 100).toFixed(1)}%.`,
      refs: report.correlationWarnings
    },
    Comply: {
      status: "pending",
      summary: "Compliance mapping can be generated from this score through AMC compliance commands.",
      refs: []
    },
    Fleet: {
      status: "pending",
      summary: "Fleet parent/child lifecycle evidence is not attached to this single-agent score.",
      refs: []
    },
    Passport: {
      status: "pending",
      summary: "Portable proof export has not been generated for this score yet.",
      refs: []
    }
  };
}

export function buildLifecycleRunArtifact(input: WriteLifecycleRunArtifactInput): LifecycleRunArtifact {
  const readiness = evaluateDiagnosticEvidenceReadiness(input.report);
  const paths = getAgentPaths(input.workspace, input.report.agentId);
  const surfaces = {
    ...lifecycleSurfaces(input.report),
    ...input.surfaceOverrides
  };
  if ((input.observabilityRecords ?? []).length > 0 && !input.surfaceOverrides?.Watch) {
    surfaces.Watch = {
      status: "complete",
      summary: `Decision observability captured ${input.observabilityRecords!.length} run record(s) across components, experience signals, and decision outcomes.`,
      refs: input.observabilityRecords!.map((record) => record.observabilityId)
    };
  }
  const runtimeRuns = input.runtimeRuns ?? runtimeRunSummaryForLifecycle({
    workspace: input.workspace,
    agentId: input.report.agentId,
    runId: input.report.runId
  });
  if (runtimeRuns.length > 0 && !input.surfaceOverrides?.Watch) {
    surfaces.Watch = {
      status: runtimeRuns.some((run) => run.status === "degraded" || run.alertCount > 0) ? "degraded" : "complete",
      summary: `Runtime event store linked ${runtimeRuns.reduce((sum, run) => sum + run.eventCount, 0)} event(s) across ${runtimeRuns.length} connected run(s).`,
      refs: runtimeRuns.flatMap((run) => [run.runId, ...[run.latestEventAt ?? ""].filter(Boolean)])
    };
  }
  return {
    schemaVersion: "2026-05-22",
    lifecycleRunId: `lifecycle-${input.report.runId}`,
    runId: input.report.runId,
    agentId: input.report.agentId,
    workspace: resolve(input.workspace),
    source: input.source,
    command: input.command,
    stage: input.stage ?? "score.generated",
    createdAt: new Date(input.report.ts).toISOString(),
    elapsedMs: input.elapsedMs ?? null,
    surfaces,
    evidence: {
      diagnosticReport: {
        runId: input.report.runId,
        status: input.report.status,
        artifactStatus: input.report.status,
        evidenceStatus: readiness.status,
        claimEligible: readiness.claimEligible,
        jsonPath: join(paths.runsDir, `${input.report.runId}.json`),
        markdownPath: join(paths.reportsDir, `${input.report.runId}.md`),
        reportJsonSha256: input.report.reportJsonSha256
      },
      episodeRecords: input.episodeRecords ?? [],
      decisionReceipts: input.decisionReceipts ?? [],
      lifecycleReceipts: input.lifecycleReceipts ?? [],
      findingProofs: input.findingProofs ?? [],
      observabilityRecords: input.observabilityRecords ?? [],
      resourceManifests: input.resourceManifests ?? [],
      runtimeRuns,
      evidenceCoverage: input.report.evidenceCoverage,
      trustCoverage: input.report.evidenceTrustCoverage
    },
    setup: {
      createdWorkspace: Boolean(input.createdWorkspace),
      createdAgentContext: Boolean(input.createdAgentContext),
      signed: input.signed ?? input.report.status === "VALID",
      vaultReason: input.vaultReason ?? null
    },
    receipts: []
  };
}

export function writeLifecycleRunArtifact(input: WriteLifecycleRunArtifactInput): WriteLifecycleRunArtifactResult {
  const artifact = buildLifecycleRunArtifact(input);
  const artifactPath = lifecycleRunArtifactPath(input.workspace, input.report.agentId, input.report.runId);
  writeFileAtomic(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace: input.workspace, path: artifactPath, artifactKind: "lifecycle-artifact" });
  return { artifact, artifactPath, signaturePath: signed?.sigPath ?? null };
}

function redactPathForExport(path: string, workspace: string): string {
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) {
    return "$WORKSPACE";
  }
  if (full.startsWith(`${root}/`)) {
    return `$WORKSPACE/${full.slice(root.length + 1)}`;
  }
  return path;
}

export function redactLifecycleRunArtifact(artifact: LifecycleRunArtifact): LifecycleRunArtifact {
  return {
    ...artifact,
    workspace: "$WORKSPACE",
    evidence: {
      ...artifact.evidence,
      diagnosticReport: {
        ...artifact.evidence.diagnosticReport,
        jsonPath: redactPathForExport(artifact.evidence.diagnosticReport.jsonPath, artifact.workspace),
        markdownPath: redactPathForExport(artifact.evidence.diagnosticReport.markdownPath, artifact.workspace)
      },
      episodeRecords: artifact.evidence.episodeRecords.map((record) => ({
        ...record,
        path: redactPathForExport(record.path, artifact.workspace)
      })),
      decisionReceipts: artifact.evidence.decisionReceipts.map((receipt) => ({
        ...receipt,
        path: redactPathForExport(receipt.path, artifact.workspace)
      })),
      lifecycleReceipts: (artifact.evidence.lifecycleReceipts ?? []).map((receipt) => ({
        ...receipt,
        path: redactPathForExport(receipt.path, artifact.workspace)
      })),
      findingProofs: (artifact.evidence.findingProofs ?? []).map((proofSet) => ({
        ...proofSet,
        path: redactPathForExport(proofSet.path, artifact.workspace)
      })),
      observabilityRecords: (artifact.evidence.observabilityRecords ?? []).map((record) => ({
        ...record,
        path: redactPathForExport(record.path, artifact.workspace)
      })),
      resourceManifests: artifact.evidence.resourceManifests.map((manifest) => ({
        ...manifest,
        path: redactPathForExport(manifest.path, artifact.workspace)
      })),
      runtimeRuns: (artifact.evidence.runtimeRuns ?? []).map((run) => ({
        ...run,
        path: redactPathForExport(run.path, artifact.workspace)
      }))
    }
  };
}

export function lifecycleRunArtifactsDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "lifecycle-runs");
}

export function lifecycleRunArtifactPath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(lifecycleRunArtifactsDir(workspace, agentId), `${runId}.json`);
}

export function listLifecycleRunArtifacts(input: { workspace: string; agentId?: string; limit?: number }): LifecycleRunArtifact[] {
  const dir = lifecycleRunArtifactsDir(input.workspace, input.agentId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readUtf8(join(dir, entry))) as LifecycleRunArtifact)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

export function loadLifecycleRunArtifact(input: { workspace: string; selector: string; agentId?: string }): LifecycleRunArtifact {
  const directRunId = input.selector.startsWith("lifecycle-") ? input.selector.slice("lifecycle-".length) : input.selector;
  const directPath = lifecycleRunArtifactPath(input.workspace, input.agentId, directRunId);
  if (existsSync(directPath)) {
    return JSON.parse(readUtf8(directPath)) as LifecycleRunArtifact;
  }
  const found = listLifecycleRunArtifacts({ workspace: input.workspace, agentId: input.agentId })
    .find((artifact) => artifact.lifecycleRunId === input.selector || artifact.runId === input.selector);
  if (!found) {
    throw new Error(`Lifecycle run not found: ${input.selector}`);
  }
  return found;
}

export function exportLifecycleRunArtifact(input: {
  workspace: string;
  selector: string;
  outputPath: string;
  agentId?: string;
  redacted?: boolean;
}): LifecycleRunArtifactExportResult {
  const loaded = loadLifecycleRunArtifact(input);
  const artifact = input.redacted ? redactLifecycleRunArtifact(loaded) : loaded;
  writeFileAtomic(resolve(input.outputPath), `${JSON.stringify(artifact, null, 2)}\n`, 0o644);
  return { artifact, outputPath: resolve(input.outputPath), redacted: Boolean(input.redacted) };
}
