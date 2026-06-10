import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { EnforceResourceManifestRef } from "../enforce/resourceManifest.js";
import type { FleetScoringResult } from "./fleetScoring.js";
import {
  loadLatestTypedMultiAgentGraph,
  typedMultiAgentGraphRef,
  type TypedGraphValidationIssue,
  type TypedMultiAgentGraphRef
} from "./typedGraph.js";

export type FleetCascadeFailureType =
  | "shared_question_weakness"
  | "weak_link_dependency"
  | "partial_failure"
  | "graph_validation_risk";
export type FleetCascadeFailureSeverity = "low" | "medium" | "high" | "critical";

export interface FleetCascadeFailure {
  failureId: string;
  type: FleetCascadeFailureType;
  severity: FleetCascadeFailureSeverity;
  agentIds: string[];
  questionIds: string[];
  summary: string;
  recommendation: string;
}

export interface FleetLifecycleChildRun {
  agentId: string;
  diagnosticRunId: string | null;
  lifecycleRunId: string | null;
  lifecycleArtifactPath: string | null;
  episodePath: string | null;
  resourceManifestId: string | null;
  status: "VALID" | "INVALID" | "UNSIGNED" | "failed" | "skipped";
  overallScore: number | null;
  integrityIndex: number | null;
  evidenceCoverage: number | null;
}

export interface FleetLifecycleRunArtifact {
  schemaVersion: "2026-05-22";
  fleetLifecycleRunId: string;
  parentRunId: string;
  fleetRunId: string;
  workspace: string;
  createdAt: string;
  status: "complete" | "partial" | "degraded";
  agentCount: number;
  scoredAgentCount: number;
  failedAgentCount: number;
  childRuns: FleetLifecycleChildRun[];
  aggregate: FleetScoringResult["aggregate"];
  weakLinks: FleetScoringResult["weakLinks"];
  cascadeFailures: FleetCascadeFailure[];
  topology: Array<{
    agentId: string;
    dependsOn: string[];
    riskLabel: string;
    lifecycleRunId: string | null;
  }>;
  sharedResources: {
    manifest: EnforceResourceManifestRef | null;
    perAgentManifestIds: Array<{ agentId: string; manifestId: string | null }>;
  };
  typedGraph: TypedMultiAgentGraphRef | null;
  evidenceSummary: {
    childLifecycleRunIds: string[];
    childEpisodePaths: string[];
    childResourceManifestIds: string[];
    reportSha256: string;
  };
  recommendations: string[];
  artifactPath: string | null;
  signaturePath: string | null;
}

export interface FleetLifecycleWriteResult {
  artifact: FleetLifecycleRunArtifact;
  artifactPath: string;
  signaturePath: string | null;
}

function fleetLifecycleRoot(workspace: string): string {
  return join(workspace, ".amc", "fleet", "lifecycle-runs");
}

export function fleetLifecycleRunPath(workspace: string, fleetRunId: string): string {
  return join(fleetLifecycleRoot(workspace), `${fleetRunId}.json`);
}

function redactPath(path: string | null, workspace: string): string | null {
  if (!path) return null;
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

function severityForSharedAgentCount(agentCount: number, totalAgents: number): FleetCascadeFailureSeverity {
  if (agentCount >= Math.max(3, Math.ceil(totalAgents * 0.75))) return "critical";
  if (agentCount >= Math.max(2, Math.ceil(totalAgents * 0.5))) return "high";
  return "medium";
}

function graphRiskSeverity(issue: TypedGraphValidationIssue): FleetCascadeFailureSeverity {
  if (issue.severity === "warning") return "medium";
  if (
    issue.code === "cycle_detected" ||
    issue.code === "unbounded_fanout" ||
    issue.code === "unsafe_permission_without_policy"
  ) {
    return "critical";
  }
  return "high";
}

function graphRiskTarget(issue: TypedGraphValidationIssue): string {
  return issue.nodeId ?? issue.edgeId ?? "graph";
}

function failureIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
}

export function detectFleetCascadeFailures(result: FleetScoringResult): FleetCascadeFailure[] {
  const failures: FleetCascadeFailure[] = [];
  const questionAgents = new Map<string, string[]>();

  for (const report of result.diagnosticReports) {
    for (const score of report.questionScores) {
      if (score.finalLevel <= 1) {
        const agents = questionAgents.get(score.questionId) ?? [];
        agents.push(report.agentId);
        questionAgents.set(score.questionId, agents);
      }
    }
  }

  for (const [questionId, agentIds] of questionAgents) {
    if (agentIds.length < 2) continue;
    failures.push({
      failureId: `cascade-${questionId.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`,
      type: "shared_question_weakness",
      severity: severityForSharedAgentCount(agentIds.length, Math.max(1, result.agentCount)),
      agentIds,
      questionIds: [questionId],
      summary: `${agentIds.length} agents share a low-scoring control on ${questionId}.`,
      recommendation: "Treat this as a fleet-level remediation and validate the shared control before optimizing individual agents."
    });
  }

  for (const weakLink of result.weakLinks.filter((link) => link.riskLabel === "critical" || link.riskLabel === "high")) {
    const pairedAgents = result.pairComparisons
      .filter((comparison) => comparison.agentA === weakLink.agentId || comparison.agentB === weakLink.agentId)
      .flatMap((comparison) => [comparison.agentA, comparison.agentB])
      .filter((agentId, index, all) => agentId !== weakLink.agentId && all.indexOf(agentId) === index);
    if (pairedAgents.length === 0) continue;
    failures.push({
      failureId: `cascade-weak-link-${weakLink.agentId}`,
      type: "weak_link_dependency",
      severity: weakLink.riskLabel === "critical" ? "critical" : "high",
      agentIds: [weakLink.agentId, ...pairedAgents],
      questionIds: weakLink.criticalGaps.map((gap) => gap.questionId),
      summary: `${weakLink.agentId} is a ${weakLink.riskLabel} weak link relative to connected fleet peers.`,
      recommendation: "Review dependencies that route work through this agent and gate shared workflows until the weak-link controls improve."
    });
  }

  for (const failure of result.failures) {
    failures.push({
      failureId: `cascade-partial-failure-${failure.agentId}`,
      type: "partial_failure",
      severity: "high",
      agentIds: [failure.agentId],
      questionIds: [],
      summary: `${failure.agentId} failed during fleet scoring: ${failure.actionableReason}`,
      recommendation: "Score the failed agent individually and rerun the fleet before treating aggregate posture as complete."
    });
  }

  for (const graphRisk of result.graphRisks ?? []) {
    const target = graphRiskTarget(graphRisk);
    failures.push({
      failureId: `cascade-graph-${failureIdPart(graphRisk.code)}-${failureIdPart(target)}`,
      type: "graph_validation_risk",
      severity: graphRiskSeverity(graphRisk),
      agentIds: graphRisk.nodeId ? [graphRisk.nodeId] : [],
      questionIds: [],
      summary: `Typed graph risk on ${target}: ${graphRisk.message}`,
      recommendation: "Fix the typed multi-agent graph contract, policy, or topology issue before treating fleet routing risk as accepted."
    });
  }

  return failures.sort((a, b) => {
    const rank: Record<FleetCascadeFailureSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    return rank[b.severity] - rank[a.severity] || a.failureId.localeCompare(b.failureId);
  });
}

function childRuns(result: FleetScoringResult): FleetLifecycleChildRun[] {
  const scored = result.agents.map((agent) => {
    const report = result.diagnosticReports.find((item) => item.agentId === agent.agentId);
    return {
      agentId: agent.agentId,
      diagnosticRunId: report?.runId ?? null,
      lifecycleRunId: report?.runId ? `lifecycle-${report.runId}` : null,
      lifecycleArtifactPath: agent.lifecycleArtifactPath,
      episodePath: agent.episodePath,
      resourceManifestId: agent.resourceManifestId,
      status: agent.status,
      overallScore: agent.overallScore,
      integrityIndex: agent.integrityIndex,
      evidenceCoverage: agent.evidenceCoverage
    };
  });
  const failed = result.failures.map((failure) => ({
    agentId: failure.agentId,
    diagnosticRunId: null,
    lifecycleRunId: null,
    lifecycleArtifactPath: null,
    episodePath: null,
    resourceManifestId: null,
    status: failure.status,
    overallScore: null,
    integrityIndex: null,
    evidenceCoverage: null
  }));
  return [...scored, ...failed];
}

export function buildFleetLifecycleRunArtifact(input: {
  workspace: string;
  result: FleetScoringResult;
  sharedResourceManifest?: EnforceResourceManifestRef | null;
}): FleetLifecycleRunArtifact {
  const children = childRuns(input.result);
  const cascadeFailures = input.result.cascadeFailures?.length
    ? input.result.cascadeFailures
    : detectFleetCascadeFailures(input.result);
  const childLifecycleRunIds = children.map((child) => child.lifecycleRunId).filter((id): id is string => Boolean(id));
  const childEpisodePaths = children.map((child) => child.episodePath).filter((path): path is string => Boolean(path));
  const childResourceManifestIds = children.map((child) => child.resourceManifestId).filter((id): id is string => Boolean(id));
  const status: FleetLifecycleRunArtifact["status"] =
    input.result.failures.length > 0
      ? "partial"
      : cascadeFailures.some((failure) => failure.severity === "critical" || failure.severity === "high")
        ? "degraded"
        : "complete";
  const topology = children.map((child) => {
    const linked = input.result.pairComparisons
      .filter((comparison) => comparison.agentA === child.agentId || comparison.agentB === child.agentId)
      .map((comparison) => comparison.agentA === child.agentId ? comparison.agentB : comparison.agentA);
    const weakLink = input.result.weakLinks.find((link) => link.agentId === child.agentId);
    return {
      agentId: child.agentId,
      dependsOn: [...new Set(linked)].sort(),
      riskLabel: weakLink?.riskLabel ?? (child.status === "failed" || child.status === "skipped" ? "high" : "low"),
      lifecycleRunId: child.lifecycleRunId
    };
  });
  const latestGraph = loadLatestTypedMultiAgentGraph(input.workspace);
  const typedGraph = latestGraph
    ? typedMultiAgentGraphRef({ workspace: input.workspace, graph: latestGraph })
    : null;

  return {
    schemaVersion: "2026-05-22",
    fleetLifecycleRunId: `fleet-lifecycle-${input.result.runId}`,
    parentRunId: `fleet-parent-${input.result.runId}`,
    fleetRunId: input.result.runId,
    workspace: resolve(input.workspace),
    createdAt: new Date(input.result.ts).toISOString(),
    status,
    agentCount: input.result.agentCount,
    scoredAgentCount: input.result.agents.length,
    failedAgentCount: input.result.failures.length,
    childRuns: children,
    aggregate: input.result.aggregate,
    weakLinks: input.result.weakLinks,
    cascadeFailures,
    topology,
    sharedResources: {
      manifest: input.sharedResourceManifest ?? null,
      perAgentManifestIds: children.map((child) => ({ agentId: child.agentId, manifestId: child.resourceManifestId }))
    },
    typedGraph,
    evidenceSummary: {
      childLifecycleRunIds,
      childEpisodePaths,
      childResourceManifestIds,
      reportSha256: input.result.reportSha256
    },
    recommendations: cascadeFailures.slice(0, 8).map((failure) => failure.recommendation),
    artifactPath: null,
    signaturePath: null
  };
}

export function writeFleetLifecycleRunArtifact(input: {
  workspace: string;
  result: FleetScoringResult;
  sharedResourceManifest?: EnforceResourceManifestRef | null;
}): FleetLifecycleWriteResult {
  const artifact = buildFleetLifecycleRunArtifact(input);
  const artifactPath = fleetLifecycleRunPath(input.workspace, input.result.runId);
  const withPath: FleetLifecycleRunArtifact = { ...artifact, artifactPath };
  writeFileAtomic(artifactPath, `${JSON.stringify(withPath, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace: input.workspace, path: artifactPath, artifactKind: "fleet-lifecycle-run" });
  const signedArtifact: FleetLifecycleRunArtifact = { ...withPath, signaturePath: signed?.sigPath ?? null };
  writeFileAtomic(artifactPath, `${JSON.stringify(signedArtifact, null, 2)}\n`, 0o644);
  return { artifact: signedArtifact, artifactPath, signaturePath: signedArtifact.signaturePath };
}

export function redactFleetLifecycleRunArtifact(artifact: FleetLifecycleRunArtifact): FleetLifecycleRunArtifact {
  return {
    ...artifact,
    workspace: "$WORKSPACE",
    artifactPath: redactPath(artifact.artifactPath, artifact.workspace),
    signaturePath: redactPath(artifact.signaturePath, artifact.workspace),
    childRuns: artifact.childRuns.map((child) => ({
      ...child,
      lifecycleArtifactPath: redactPath(child.lifecycleArtifactPath, artifact.workspace),
      episodePath: redactPath(child.episodePath, artifact.workspace)
    })),
    evidenceSummary: {
      ...artifact.evidenceSummary,
      childEpisodePaths: artifact.evidenceSummary.childEpisodePaths.map((path) => redactPath(path, artifact.workspace) ?? path)
    },
    typedGraph: artifact.typedGraph
      ? {
          ...artifact.typedGraph,
          path: redactPath(artifact.typedGraph.path, artifact.workspace) ?? artifact.typedGraph.path
        }
      : null
  };
}

export function listFleetLifecycleRunArtifacts(input: { workspace: string; limit?: number; redacted?: boolean }): FleetLifecycleRunArtifact[] {
  const root = fleetLifecycleRoot(input.workspace);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readUtf8(join(root, entry))) as FleetLifecycleRunArtifact)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
    .map((artifact) => input.redacted ? redactFleetLifecycleRunArtifact(artifact) : artifact);
}

export function loadFleetLifecycleRunArtifact(input: { workspace: string; selector: string; redacted?: boolean }): FleetLifecycleRunArtifact {
  const direct = fleetLifecycleRunPath(input.workspace, input.selector.replace(/^fleet-lifecycle-/, ""));
  if (existsSync(direct)) {
    const artifact = JSON.parse(readUtf8(direct)) as FleetLifecycleRunArtifact;
    return input.redacted ? redactFleetLifecycleRunArtifact(artifact) : artifact;
  }
  const found = listFleetLifecycleRunArtifacts({ workspace: input.workspace, limit: Number.POSITIVE_INFINITY, redacted: false })
    .find((artifact) =>
      artifact.fleetRunId === input.selector ||
      artifact.fleetLifecycleRunId === input.selector ||
      artifact.parentRunId === input.selector
    );
  if (!found) {
    throw new Error(`Fleet lifecycle run not found: ${input.selector}`);
  }
  return input.redacted ? redactFleetLifecycleRunArtifact(found) : found;
}
