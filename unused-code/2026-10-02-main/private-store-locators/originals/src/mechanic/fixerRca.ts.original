import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import {
  listEnforceResources,
  projectEnforceResourceLifecycleStatus,
  type EnforceResource,
  type EnforceResourceKind
} from "../enforce/resourceManifest.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { loadEpisodeRecord, type EpisodeRecord } from "../lifecycle/episodeRecord.js";
import { loadTraceFailureIndex, type TraceFailureCluster, type TraceFailureIndex, type TraceFailureClass } from "../watch/traceFailureIndex.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export type AgentCallValidatorId =
  | "schema_conformance"
  | "tool_call_correctness"
  | "evidence_citation"
  | "policy_conformance"
  | "latency_timeout"
  | "refusal_overaction"
  | "output_quality";

export interface AgentCallRecord {
  callId: string;
  runId: string;
  episodeId: string | null;
  agentId: string;
  inputRef: string | null;
  outputSnippet: string;
  tool: string | null;
  model: string | null;
  durationMs: number | null;
  policyDecision: string | null;
  failureClass: TraceFailureClass;
  evidenceRefs: string[];
}

export interface AgentCallValidation {
  validatorId: AgentCallValidatorId;
  status: "pass" | "warn" | "fail";
  reason: string;
  evidenceRefs: string[];
}

export interface FixerRootCause {
  rootCauseId: string;
  failureClass: TraceFailureClass;
  likelyCause: string;
  affectedResourceKind: EnforceResourceKind | "unknown";
  affectedResourceId: string | null;
  confidence: number;
  evidenceRefs: string[];
  suggestedRegressionTestId: string;
}

export interface FixerRegressionTest {
  testId: string;
  sourceClusterId: string;
  failureClass: TraceFailureClass;
  name: string;
  inputRef: string;
  expectedBehavior: string;
  mustFailBeforeFix: boolean;
  mustPassAfterFix: boolean;
}

export interface FixerPatchProposal {
  proposalId: string;
  rootCauseId: string;
  status: "proposed" | "blocked";
  blockedReason: string | null;
  mutationSurface: "Enforce";
  resourceKind: EnforceResourceKind | "unknown";
  resourceId: string | null;
  resourcePath: string | null;
  rollbackPointer: string | null;
  patchSummary: string;
  expectedScoreImpact: number;
  confidence: number;
  regressionTestIds: string[];
}

export interface FixerValidationReceipt {
  receiptId: string;
  status: "passed" | "blocked";
  createdAt: string;
  gates: Array<{
    id: string;
    status: "passed" | "blocked";
    reason: string;
  }>;
}

export interface FixerRcaReport {
  schemaVersion: "2026-05-22";
  reportId: string;
  workspace: string;
  agentId: string;
  runId: string;
  episodeId: string | null;
  traceIndexId: string;
  createdAt: string;
  callRecords: AgentCallRecord[];
  validations: AgentCallValidation[];
  rootCauses: FixerRootCause[];
  regressionTests: FixerRegressionTest[];
  proposals: FixerPatchProposal[];
  validationReceipt: FixerValidationReceipt;
  signaturePath: string | null;
}

const FAILURE_RESOURCE_MAP: Record<TraceFailureClass, EnforceResourceKind[]> = {
  prompt_error: ["prompt", "evaluator", "policy"],
  tool_misuse: ["tool", "policy", "guardrail"],
  invalid_schema: ["schema", "evaluator", "prompt"],
  refusal_overreach: ["prompt", "policy", "guardrail"],
  hallucinated_claim: ["prompt", "evaluator", "dataset"],
  unsafe_action: ["policy", "guardrail", "tool"],
  latency_timeout: ["router", "model_provider", "environment"],
  cost_spike: ["router", "model_provider", "policy"],
  retrieval_error: ["dataset", "graph", "tool"],
  memory_error: ["memory", "policy"],
  human_review_gap: ["policy", "guardrail", "agent"],
  orchestration_dead_end: ["agent", "code", "prompt"],
  policy_violation: ["policy", "guardrail"],
  unknown_failure: []
};

function redacted(text: string, max = 260): string {
  const clean = text
    .replace(/sk-[a-z0-9_-]{10,}/gi, "[REDACTED]")
    .replace(/bearer\s+[a-z0-9._-]{10,}/gi, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function resourcesFor(workspace: string, agentId: string): EnforceResource[] {
  try {
    return listEnforceResources({ workspace, agentId });
  } catch {
    return [];
  }
}

export function normalizeAgentCallRecords(index: TraceFailureIndex): AgentCallRecord[] {
  return index.entries.map((entry) => ({
    callId: entry.entryId,
    runId: entry.runId,
    episodeId: entry.episodeId,
    agentId: entry.agentId,
    inputRef: entry.rawTraceRef,
    outputSnippet: redacted(entry.redactedSnippet),
    tool: entry.tool,
    model: entry.model,
    durationMs: null,
    policyDecision: entry.policyDecision,
    failureClass: entry.failureClass,
    evidenceRefs: entry.evidenceRefs
  }));
}

export function validateAgentCallRecord(record: AgentCallRecord): AgentCallValidation[] {
  const out: AgentCallValidation[] = [];
  const add = (validatorId: AgentCallValidatorId, status: AgentCallValidation["status"], reason: string): void => {
    out.push({ validatorId, status, reason, evidenceRefs: record.evidenceRefs });
  };
  add("schema_conformance", record.failureClass === "invalid_schema" ? "fail" : "pass", record.failureClass === "invalid_schema" ? "Schema-shaped failure detected." : "No schema failure detected.");
  add("tool_call_correctness", record.failureClass === "tool_misuse" ? "fail" : record.tool ? "pass" : "warn", record.failureClass === "tool_misuse" ? "Tool misuse failure detected." : "Tool call shape is acceptable or not present.");
  add("evidence_citation", record.failureClass === "hallucinated_claim" ? "fail" : "pass", record.failureClass === "hallucinated_claim" ? "Claim lacks sufficient evidence citation." : "No unsupported-claim failure detected.");
  add("policy_conformance", record.failureClass === "policy_violation" || record.failureClass === "unsafe_action" ? "fail" : "pass", record.policyDecision === "blocked" ? "Policy blocked the call." : "No policy violation detected.");
  add("latency_timeout", record.failureClass === "latency_timeout" ? "fail" : "pass", record.failureClass === "latency_timeout" ? "Latency or timeout failure detected." : "No latency failure detected.");
  add("refusal_overaction", record.failureClass === "refusal_overreach" ? "fail" : "pass", record.failureClass === "refusal_overreach" ? "Refusal or over-action failure detected." : "No refusal/over-action failure detected.");
  add("output_quality", record.failureClass === "unknown_failure" ? "warn" : "pass", record.outputSnippet.length === 0 ? "Output snippet missing." : "Output snippet present and redacted.");
  return out;
}

function chooseResource(cluster: TraceFailureCluster, resources: EnforceResource[]): { kind: EnforceResourceKind | "unknown"; resource: EnforceResource | null; blockedReason: string | null } {
  const allowedKinds = FAILURE_RESOURCE_MAP[cluster.failureClass] ?? [];
  if (allowedKinds.length === 0) {
    return { kind: "unknown", resource: null, blockedReason: "No supported mutation surface for this failure class." };
  }
  const resource = resources.find((candidate) => allowedKinds.includes(candidate.kind) && candidate.mutable) ?? null;
  if (!resource) {
    return { kind: allowedKinds[0]!, resource: null, blockedReason: `No mutable Enforce resource found for ${allowedKinds.join(", ")}.` };
  }
  return { kind: resource.kind, resource, blockedReason: null };
}

function likelyCauseFor(cluster: TraceFailureCluster): string {
  const map: Record<TraceFailureClass, string> = {
    prompt_error: "Prompt contract or instruction boundary is incomplete.",
    tool_misuse: "Tool contract or permission boundary is incomplete.",
    invalid_schema: "Output schema or evaluator contract is underspecified.",
    refusal_overreach: "Prompt or policy boundary is too broad.",
    hallucinated_claim: "Evidence citation and claim grounding are insufficient.",
    unsafe_action: "Sensitive action policy lacks a strong approval gate.",
    latency_timeout: "Route, provider, or environment needs timeout and fallback controls.",
    cost_spike: "Route, provider, or policy budget controls are insufficient.",
    retrieval_error: "Retrieval corpus or graph grounding is incomplete.",
    memory_error: "Memory writeback or recall policy is unsafe.",
    human_review_gap: "Human review escalation or approval routing is incomplete.",
    orchestration_dead_end: "Planner or handoff policy is missing a recovery route.",
    policy_violation: "Policy guardrail requires stricter enforcement or clearer scope.",
    unknown_failure: "Failure needs manual classification before mutation."
  };
  return map[cluster.failureClass];
}

function regressionTestFor(cluster: TraceFailureCluster): FixerRegressionTest {
  return {
    testId: `reg_${sha256Hex(cluster.clusterId).slice(0, 12)}`,
    sourceClusterId: cluster.clusterId,
    failureClass: cluster.failureClass,
    name: `${cluster.failureClass} regression`,
    inputRef: cluster.sampleEvidenceRefs[0] ?? cluster.clusterId,
    expectedBehavior: `The agent must not repeat ${cluster.failureClass}; it should provide evidence, valid structure, safe refusal, or an approved action path as applicable.`,
    mustFailBeforeFix: true,
    mustPassAfterFix: true
  };
}

export function buildFixerRcaReport(input: {
  workspace: string;
  agentId?: string;
  traceIndex: TraceFailureIndex;
  episode?: EpisodeRecord | null;
}): FixerRcaReport {
  const workspace = resolve(input.workspace);
  const agentId = input.agentId ?? input.traceIndex.agentId;
  const resources = resourcesFor(workspace, agentId);
  const lifecycleStatus = projectEnforceResourceLifecycleStatus({ workspace, agentId });
  const activeRollbackPointer = lifecycleStatus.integrity.valid
    ? lifecycleStatus.active?.ref ?? null
    : null;
  const callRecords = normalizeAgentCallRecords(input.traceIndex);
  const validations = callRecords.flatMap(validateAgentCallRecord);
  const regressionTests = input.traceIndex.clusters.map(regressionTestFor);
  const rootCauses = input.traceIndex.clusters.map((cluster) => {
    const selected = chooseResource(cluster, resources);
    const test = regressionTests.find((row) => row.sourceClusterId === cluster.clusterId)!;
    return {
      rootCauseId: `rca_${sha256Hex(cluster.clusterId).slice(0, 12)}`,
      failureClass: cluster.failureClass,
      likelyCause: likelyCauseFor(cluster),
      affectedResourceKind: selected.kind,
      affectedResourceId: selected.resource?.id ?? null,
      confidence: selected.resource ? Math.min(0.9, 0.45 + cluster.count * 0.08) : 0.35,
      evidenceRefs: cluster.sampleEvidenceRefs,
      suggestedRegressionTestId: test.testId
    } satisfies FixerRootCause;
  });
  const proposals = rootCauses.map((cause) => {
    const cluster = input.traceIndex.clusters.find((row) => row.failureClass === cause.failureClass)!;
    const resource = cause.affectedResourceId ? resources.find((row) => row.id === cause.affectedResourceId) ?? null : null;
    const testIds = regressionTests.filter((row) => row.failureClass === cause.failureClass).map((row) => row.testId);
    const blockedReason = !resource
      ? `Unsupported or missing mutable resource for ${cause.failureClass}.`
      : null;
    return {
      proposalId: `fix_${sha256Hex(`${cause.rootCauseId}:${resource?.id ?? "blocked"}`).slice(0, 12)}`,
      rootCauseId: cause.rootCauseId,
      status: blockedReason ? "blocked" : "proposed",
      blockedReason,
      mutationSurface: "Enforce",
      resourceKind: cause.affectedResourceKind,
      resourceId: resource?.id ?? null,
      resourcePath: resource ? resolve(workspace, resource.path) : null,
      rollbackPointer: resource?.rollbackPointer ?? resource?.rollbackTarget ?? activeRollbackPointer,
      patchSummary: blockedReason
        ? "No patch generated because the mutation surface is unsupported or immutable."
        : `Update ${resource!.kind} resource ${resource!.id} to address ${cause.failureClass}.`,
      expectedScoreImpact: cluster.scoreImpact,
      confidence: cause.confidence,
      regressionTestIds: testIds
    } satisfies FixerPatchProposal;
  });
  const gates = [
    {
      id: "allowed-mutation-surface",
      status: proposals.every((proposal) => proposal.status === "proposed") ? "passed" as const : "blocked" as const,
      reason: proposals.every((proposal) => proposal.status === "proposed") ? "All proposals target mutable Enforce resources." : "One or more proposals target unsupported or immutable resources."
    },
    {
      id: "regression-tests-generated",
      status: regressionTests.length > 0 ? "passed" as const : "blocked" as const,
      reason: regressionTests.length > 0 ? "Regression tests generated before patch proposal." : "No regression tests generated."
    },
    {
      id: "rollback-pointer-present",
      status: proposals.filter((proposal) => proposal.status === "proposed").every((proposal) => Boolean(proposal.rollbackPointer)) ? "passed" as const : "blocked" as const,
      reason: "Every proposed fix must carry a rollback pointer."
    }
  ];
  const receipt: FixerValidationReceipt = {
    receiptId: `fixrec_${sha256Hex(`${input.traceIndex.indexId}:${gates.map((gate) => gate.status).join(":")}`).slice(0, 16)}`,
    status: gates.every((gate) => gate.status === "passed") ? "passed" : "blocked",
    createdAt: new Date().toISOString(),
    gates
  };
  return {
    schemaVersion: "2026-05-22",
    reportId: `fixer-rca-${input.traceIndex.runId}`,
    workspace,
    agentId,
    runId: input.traceIndex.runId,
    episodeId: input.episode?.episodeId ?? input.traceIndex.episodeId,
    traceIndexId: input.traceIndex.indexId,
    createdAt: new Date().toISOString(),
    callRecords,
    validations,
    rootCauses,
    regressionTests,
    proposals,
    validationReceipt: receipt,
    signaturePath: null
  };
}

export function fixerRcaDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "fixer");
}

export function fixerRcaPath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(fixerRcaDir(workspace, agentId), `${runId}.json`);
}

export function writeFixerRcaReport(input: { workspace: string; agentId?: string; selector: string }): { report: FixerRcaReport; path: string; signaturePath: string | null } {
  const traceIndex = loadTraceFailureIndex({
    workspace: input.workspace,
    agentId: input.agentId,
    selector: input.selector
  });
  let episode: EpisodeRecord | null = null;
  if (traceIndex.episodeId) {
    try {
      episode = loadEpisodeRecord({ workspace: input.workspace, agentId: input.agentId ?? traceIndex.agentId, selector: traceIndex.episodeId });
    } catch {
      episode = null;
    }
  }
  const report = buildFixerRcaReport({ workspace: input.workspace, agentId: input.agentId ?? traceIndex.agentId, traceIndex, episode });
  const path = fixerRcaPath(input.workspace, report.agentId, report.runId);
  writeFileAtomic(path, `${JSON.stringify(report, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace: input.workspace, path, artifactKind: "fixer-rca-report" });
  const signedReport = signed ? { ...report, signaturePath: signed.sigPath } : report;
  if (signed) {
    writeFileAtomic(path, `${JSON.stringify(signedReport, null, 2)}\n`, 0o644);
    trySignArtifactFile({ workspace: input.workspace, path, artifactKind: "fixer-rca-report" });
  }
  return { report: signedReport, path, signaturePath: signed?.sigPath ?? null };
}

function redactPath(path: string | null, workspace: string): string | null {
  if (!path) return null;
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

export function redactFixerRcaReport(report: FixerRcaReport): FixerRcaReport {
  return {
    ...report,
    workspace: "$WORKSPACE",
    signaturePath: redactPath(report.signaturePath, report.workspace),
    callRecords: report.callRecords.map((record) => ({ ...record, outputSnippet: redacted(record.outputSnippet) })),
    proposals: report.proposals.map((proposal) => ({
      ...proposal,
      resourcePath: redactPath(proposal.resourcePath, report.workspace)
    }))
  };
}

export function listFixerRcaReports(input: { workspace: string; agentId?: string; limit?: number; redacted?: boolean }): FixerRcaReport[] {
  const dir = fixerRcaDir(input.workspace, input.agentId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readUtf8(join(dir, entry))) as FixerRcaReport)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
    .map((report) => input.redacted ? redactFixerRcaReport(report) : report);
}

export function loadFixerRcaReport(input: { workspace: string; agentId?: string; selector: string; redacted?: boolean }): FixerRcaReport {
  const directRunId = input.selector.startsWith("fixer-rca-") ? input.selector.slice("fixer-rca-".length) : input.selector;
  const directPath = fixerRcaPath(input.workspace, input.agentId, directRunId);
  if (existsSync(directPath)) {
    const report = JSON.parse(readUtf8(directPath)) as FixerRcaReport;
    return input.redacted ? redactFixerRcaReport(report) : report;
  }
  const found = listFixerRcaReports({ workspace: input.workspace, agentId: input.agentId })
    .find((report) => report.reportId === input.selector || report.runId === input.selector || report.traceIndexId === input.selector);
  if (!found) {
    throw new Error(`Fixer RCA report not found: ${input.selector}`);
  }
  return input.redacted ? redactFixerRcaReport(found) : found;
}
