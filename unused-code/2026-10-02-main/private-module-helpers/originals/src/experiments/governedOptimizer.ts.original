import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type EnforceResourceKind } from "../enforce/resourceManifest.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import {
  listFixerRcaReports,
  loadFixerRcaReport,
  type FixerPatchProposal,
  type FixerRcaReport,
  type FixerRegressionTest
} from "../mechanic/fixerRca.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export interface OptimizerSplit {
  searchTestIds: string[];
  validationTestIds: string[];
  blockedReason: string | null;
}

export interface OptimizerLeakageCheck {
  id: string;
  status: "passed" | "blocked";
  reason: string;
  evidenceRefs: string[];
}

export interface OptimizerCandidateMetrics {
  scoreGain: number;
  risk: number;
  cost: number;
  latencyMs: number;
  confidence: number;
  regressionImpact: number;
}

export interface GovernedOptimizerCandidate {
  candidateId: string;
  sourceProposalId: string;
  candidateWorkspace: string;
  resourceKind: EnforceResourceKind | "unknown";
  resourceId: string | null;
  resourcePath: string | null;
  rollbackPointer: string | null;
  patchSummary: string;
  split: OptimizerSplit;
  leakageChecks: OptimizerLeakageCheck[];
  metrics: OptimizerCandidateMetrics;
  paretoFront: boolean;
  rank: number | null;
  decision: "accepted" | "rejected";
  decisionReason: string;
  receiptId: string;
  liveResourceMutated: false;
}

export interface OptimizerCandidateReceipt {
  schemaVersion: "2026-05-22";
  receiptId: string;
  receiptType: "optimizer.candidate";
  candidateId: string;
  sourceProposalId: string;
  decision: "accepted" | "rejected";
  reason: string;
  createdAt: string;
  candidateWorkspace: string;
  resourceKind: EnforceResourceKind | "unknown";
  resourceId: string | null;
  rollbackPointer: string | null;
  liveResourceMutated: false;
  commitRequiresLifecycleReceipt: true;
  gates: OptimizerLeakageCheck[];
}

export interface OptimizerValidationReceipt {
  receiptId: string;
  status: "passed" | "blocked";
  createdAt: string;
  gates: Array<{
    id: string;
    status: "passed" | "blocked";
    reason: string;
  }>;
}

export interface GovernedOptimizerRun {
  schemaVersion: "2026-05-22";
  optimizerRunId: string;
  workspace: string;
  agentId: string;
  sourceRcaReportId: string;
  sourceRunId: string;
  createdAt: string;
  candidateCount: number;
  acceptedCandidateId: string | null;
  candidates: GovernedOptimizerCandidate[];
  receipts: OptimizerCandidateReceipt[];
  validationReceipt: OptimizerValidationReceipt;
  signaturePath: string | null;
}

function optimizerRoot(workspace: string, agentId: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "experiments", "optimizer");
}

function optimizerRunDir(workspace: string, agentId: string, optimizerRunId: string): string {
  return join(optimizerRoot(workspace, agentId), optimizerRunId);
}

function optimizerRunPath(workspace: string, agentId: string, optimizerRunId: string): string {
  return join(optimizerRunDir(workspace, agentId, optimizerRunId), "optimizer-run.json");
}

function candidateWorkspacePath(workspace: string, agentId: string, optimizerRunId: string, candidateId: string): string {
  return join(optimizerRunDir(workspace, agentId, optimizerRunId), "candidates", candidateId, "workspace");
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function sourceRcaReport(input: { workspace: string; agentId: string; selector?: string }): FixerRcaReport {
  if (input.selector && input.selector !== "latest") {
    return loadFixerRcaReport({
      workspace: input.workspace,
      agentId: input.agentId,
      selector: input.selector
    });
  }
  const latest = listFixerRcaReports({
    workspace: input.workspace,
    agentId: input.agentId,
    limit: 1
  })[0];
  if (!latest) {
    throw new Error("No Fixer RCA report found. Run `amc mechanic rca run <runId>` first.");
  }
  return latest;
}

function splitForProposal(proposal: FixerPatchProposal, tests: FixerRegressionTest[]): OptimizerSplit {
  const allTestIds = uniqueSorted(tests.map((test) => test.testId));
  const searchTestIds = uniqueSorted(proposal.regressionTestIds);
  const validationTestIds = allTestIds.filter((testId) => !searchTestIds.includes(testId));
  let blockedReason: string | null = null;
  if (allTestIds.length < 2) {
    blockedReason = "At least two regression tests are required for held-out validation.";
  } else if (searchTestIds.length === 0) {
    blockedReason = "Candidate has no search regression tests.";
  } else if (validationTestIds.length === 0) {
    blockedReason = "Candidate used every regression test during search, leaving no held-out validation set.";
  }
  return {
    searchTestIds,
    validationTestIds,
    blockedReason
  };
}

function validationTokens(split: OptimizerSplit, tests: FixerRegressionTest[]): string[] {
  const validation = new Set(split.validationTestIds);
  return uniqueSorted(
    tests
      .filter((test) => validation.has(test.testId))
      .flatMap((test) => [test.testId, test.inputRef])
      .filter((value) => value.trim().length > 0)
  );
}

function leakageChecksFor(input: {
  proposal: FixerPatchProposal;
  split: OptimizerSplit;
  tests: FixerRegressionTest[];
  candidateWorkspace: string;
}): OptimizerLeakageCheck[] {
  const checks: OptimizerLeakageCheck[] = [];
  const add = (id: string, status: OptimizerLeakageCheck["status"], reason: string, evidenceRefs: string[] = []): void => {
    checks.push({ id, status, reason, evidenceRefs });
  };
  add(
    "heldout-validation-present",
    input.split.blockedReason ? "blocked" : "passed",
    input.split.blockedReason ?? "Search and held-out validation sets are separated."
  );
  const overlap = input.split.searchTestIds.filter((testId) => input.split.validationTestIds.includes(testId));
  add(
    "split-isolated",
    overlap.length > 0 ? "blocked" : "passed",
    overlap.length > 0 ? `Search and validation overlap: ${overlap.join(", ")}` : "No regression test appears in both split sets.",
    overlap
  );
  const haystack = [
    input.proposal.patchSummary,
    input.proposal.resourceId ?? "",
    input.proposal.resourcePath ?? "",
    input.proposal.rollbackPointer ?? ""
  ].join("\n").toLowerCase();
  const leaked = validationTokens(input.split, input.tests).filter((token) => haystack.includes(token.toLowerCase()));
  add(
    "heldout-not-in-candidate-source",
    leaked.length > 0 ? "blocked" : "passed",
    leaked.length > 0 ? `Candidate source references held-out validation token(s): ${leaked.join(", ")}` : "Candidate source does not name held-out validation cases.",
    leaked
  );
  add(
    "proposal-is-governed",
    input.proposal.status === "proposed" ? "passed" : "blocked",
    input.proposal.status === "proposed" ? "Fixer proposal is eligible for optimizer ranking." : input.proposal.blockedReason ?? "Fixer proposal is blocked."
  );
  add(
    "rollback-pointer-present",
    input.proposal.rollbackPointer ? "passed" : "blocked",
    input.proposal.rollbackPointer ? "Candidate carries a rollback pointer." : "Candidate cannot be accepted without a rollback pointer."
  );
  add(
    "candidate-workspace-isolated",
    input.candidateWorkspace.includes(`${join("experiments", "optimizer")}`) ? "passed" : "blocked",
    "Candidate files are written under the optimizer workspace, not over the live resource."
  );
  return checks;
}

function metricsForProposal(proposal: FixerPatchProposal, split: OptimizerSplit): OptimizerCandidateMetrics {
  const confidence = round(clamp(proposal.confidence, 0, 1), 4);
  const regressionImpact = split.validationTestIds.length;
  const riskPenalty = proposal.status === "proposed" ? 0 : 35;
  const rollbackPenalty = proposal.rollbackPointer ? 0 : 25;
  const splitPenalty = split.blockedReason ? 25 : 0;
  return {
    scoreGain: round(proposal.expectedScoreImpact, 4),
    risk: round(clamp((1 - confidence) * 100 + riskPenalty + rollbackPenalty + splitPenalty, 0, 100), 4),
    cost: round(1 + split.searchTestIds.length * 0.5 + split.validationTestIds.length * 0.75, 4),
    latencyMs: Math.round(1000 + (split.searchTestIds.length + split.validationTestIds.length) * 250),
    confidence,
    regressionImpact
  };
}

function checksPassed(candidate: Pick<GovernedOptimizerCandidate, "leakageChecks">): boolean {
  return candidate.leakageChecks.every((check) => check.status === "passed");
}

function dominates(a: GovernedOptimizerCandidate, b: GovernedOptimizerCandidate): boolean {
  const betterOrEqual =
    a.metrics.scoreGain >= b.metrics.scoreGain &&
    a.metrics.confidence >= b.metrics.confidence &&
    a.metrics.risk <= b.metrics.risk &&
    a.metrics.cost <= b.metrics.cost &&
    a.metrics.latencyMs <= b.metrics.latencyMs &&
    a.metrics.regressionImpact <= b.metrics.regressionImpact;
  const strictlyBetter =
    a.metrics.scoreGain > b.metrics.scoreGain ||
    a.metrics.confidence > b.metrics.confidence ||
    a.metrics.risk < b.metrics.risk ||
    a.metrics.cost < b.metrics.cost ||
    a.metrics.latencyMs < b.metrics.latencyMs ||
    a.metrics.regressionImpact < b.metrics.regressionImpact;
  return betterOrEqual && strictlyBetter;
}

function rankCandidates(candidates: GovernedOptimizerCandidate[]): GovernedOptimizerCandidate[] {
  const valid = candidates.filter(checksPassed);
  const ranked = [...valid].sort((a, b) => {
    const gain = b.metrics.scoreGain - a.metrics.scoreGain;
    if (gain !== 0) return gain;
    const risk = a.metrics.risk - b.metrics.risk;
    if (risk !== 0) return risk;
    const cost = a.metrics.cost - b.metrics.cost;
    if (cost !== 0) return cost;
    const latency = a.metrics.latencyMs - b.metrics.latencyMs;
    if (latency !== 0) return latency;
    const confidence = b.metrics.confidence - a.metrics.confidence;
    if (confidence !== 0) return confidence;
    return a.candidateId.localeCompare(b.candidateId);
  });
  const rankById = new Map(ranked.map((candidate, index) => [candidate.candidateId, index + 1]));
  const paretoById = new Map(
    valid.map((candidate) => [
      candidate.candidateId,
      !valid.some((other) => other.candidateId !== candidate.candidateId && dominates(other, candidate))
    ])
  );
  const winner = ranked.find((candidate) => paretoById.get(candidate.candidateId)) ?? null;
  return candidates.map((candidate) => {
    const paretoFront = paretoById.get(candidate.candidateId) ?? false;
    const rank = rankById.get(candidate.candidateId) ?? null;
    if (!checksPassed(candidate)) {
      const blocked = candidate.leakageChecks.find((check) => check.status === "blocked");
      return {
        ...candidate,
        paretoFront,
        rank,
        decision: "rejected" as const,
        decisionReason: blocked?.reason ?? "Candidate failed optimizer gates."
      };
    }
    if (winner?.candidateId === candidate.candidateId) {
      return {
        ...candidate,
        paretoFront,
        rank,
        decision: "accepted" as const,
        decisionReason: "Accepted as the top Pareto candidate after held-out validation and leakage checks."
      };
    }
    return {
      ...candidate,
      paretoFront,
      rank,
      decision: "rejected" as const,
      decisionReason: paretoFront
        ? "Candidate is on the Pareto frontier but ranked behind the accepted candidate."
        : "Candidate is dominated on score, risk, cost, latency, confidence, or regression impact."
    };
  });
}

function receiptForCandidate(candidate: GovernedOptimizerCandidate, createdAt: string): OptimizerCandidateReceipt {
  return {
    schemaVersion: "2026-05-22",
    receiptId: candidate.receiptId,
    receiptType: "optimizer.candidate",
    candidateId: candidate.candidateId,
    sourceProposalId: candidate.sourceProposalId,
    decision: candidate.decision,
    reason: candidate.decisionReason,
    createdAt,
    candidateWorkspace: candidate.candidateWorkspace,
    resourceKind: candidate.resourceKind,
    resourceId: candidate.resourceId,
    rollbackPointer: candidate.rollbackPointer,
    liveResourceMutated: false,
    commitRequiresLifecycleReceipt: true,
    gates: candidate.leakageChecks
  };
}

function buildValidationReceipt(input: {
  optimizerRunId: string;
  candidates: GovernedOptimizerCandidate[];
  receipts: OptimizerCandidateReceipt[];
  createdAt: string;
}): OptimizerValidationReceipt {
  const accepted = input.candidates.filter((candidate) => candidate.decision === "accepted");
  const gates = [
    {
      id: "candidate-workspaces-created",
      status: input.candidates.every((candidate) => existsSync(candidate.candidateWorkspace)) ? "passed" as const : "blocked" as const,
      reason: "Every candidate has an isolated optimizer workspace."
    },
    {
      id: "live-resources-unchanged",
      status: input.candidates.every((candidate) => candidate.liveResourceMutated === false) ? "passed" as const : "blocked" as const,
      reason: "Optimizer records candidates and receipts without mutating live Enforce resources."
    },
    {
      id: "accepted-candidate-present",
      status: accepted.length > 0 ? "passed" as const : "blocked" as const,
      reason: accepted.length > 0 ? "At least one candidate passed validation and Pareto ranking." : "No candidate passed validation and Pareto ranking."
    },
    {
      id: "candidate-receipts-created",
      status: input.receipts.length === input.candidates.length ? "passed" as const : "blocked" as const,
      reason: "Every accepted or rejected candidate has a receipt and reason."
    }
  ];
  return {
    receiptId: `optrec_${sha256Hex(`${input.optimizerRunId}:${gates.map((gate) => gate.status).join(":")}`).slice(0, 16)}`,
    status: gates.every((gate) => gate.status === "passed") ? "passed" : "blocked",
    createdAt: input.createdAt,
    gates
  };
}

function writeCandidateWorkspace(candidate: GovernedOptimizerCandidate, report: FixerRcaReport): void {
  ensureDir(candidate.candidateWorkspace);
  writeFileAtomic(
    join(candidate.candidateWorkspace, "candidate.json"),
    `${JSON.stringify({
      schemaVersion: "2026-05-22",
      sourceRcaReportId: report.reportId,
      sourceRunId: report.runId,
      candidate
    }, null, 2)}\n`,
    0o644
  );
  writeFileAtomic(
    join(candidate.candidateWorkspace, "README.md"),
    [
      `# ${candidate.candidateId}`,
      "",
      "This workspace stores the proposed optimizer candidate only. It does not replace or mutate the live Enforce resource.",
      "",
      `- Decision: ${candidate.decision}`,
      `- Reason: ${candidate.decisionReason}`,
      `- Receipt: ${candidate.receiptId}`,
      ""
    ].join("\n"),
    0o644
  );
}

export function writeGovernedOptimizerRun(input: {
  workspace: string;
  agentId?: string;
  rcaSelector?: string;
}): { run: GovernedOptimizerRun; path: string; signaturePath: string | null } {
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId ?? "default");
  const report = sourceRcaReport({ workspace, agentId, selector: input.rcaSelector });
  const createdAt = new Date().toISOString();
  const optimizerRunId = `optimizer-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const candidates = report.proposals.map((proposal) => {
    const candidateId = `optcand_${sha256Hex(`${report.reportId}:${proposal.proposalId}`).slice(0, 12)}`;
    const candidateWorkspace = candidateWorkspacePath(workspace, agentId, optimizerRunId, candidateId);
    const split = splitForProposal(proposal, report.regressionTests);
    const leakageChecks = leakageChecksFor({ proposal, split, tests: report.regressionTests, candidateWorkspace });
    return {
      candidateId,
      sourceProposalId: proposal.proposalId,
      candidateWorkspace,
      resourceKind: proposal.resourceKind,
      resourceId: proposal.resourceId,
      resourcePath: proposal.resourcePath,
      rollbackPointer: proposal.rollbackPointer,
      patchSummary: proposal.patchSummary,
      split,
      leakageChecks,
      metrics: metricsForProposal(proposal, split),
      paretoFront: false,
      rank: null,
      decision: "rejected",
      decisionReason: "Candidate has not been ranked yet.",
      receiptId: `optcandrec_${sha256Hex(`${optimizerRunId}:${proposal.proposalId}`).slice(0, 16)}`,
      liveResourceMutated: false
    } satisfies GovernedOptimizerCandidate;
  });
  const ranked = rankCandidates(candidates);
  for (const candidate of ranked) {
    writeCandidateWorkspace(candidate, report);
  }
  const receipts = ranked.map((candidate) => receiptForCandidate(candidate, createdAt));
  const run: GovernedOptimizerRun = {
    schemaVersion: "2026-05-22",
    optimizerRunId,
    workspace,
    agentId,
    sourceRcaReportId: report.reportId,
    sourceRunId: report.runId,
    createdAt,
    candidateCount: ranked.length,
    acceptedCandidateId: ranked.find((candidate) => candidate.decision === "accepted")?.candidateId ?? null,
    candidates: ranked,
    receipts,
    validationReceipt: buildValidationReceipt({ optimizerRunId, candidates: ranked, receipts, createdAt }),
    signaturePath: null
  };
  const path = optimizerRunPath(workspace, agentId, optimizerRunId);
  ensureDir(optimizerRunDir(workspace, agentId, optimizerRunId));
  writeFileAtomic(path, `${JSON.stringify(run, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace, path, artifactKind: "governed-optimizer-run" });
  const signedRun = signed ? { ...run, signaturePath: signed.sigPath } : run;
  if (signed) {
    writeFileAtomic(path, `${JSON.stringify(signedRun, null, 2)}\n`, 0o644);
    trySignArtifactFile({ workspace, path, artifactKind: "governed-optimizer-run" });
  }
  return { run: signedRun, path, signaturePath: signed?.sigPath ?? null };
}

function redactPath(path: string | null, workspace: string): string | null {
  if (!path) return null;
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

export function redactGovernedOptimizerRun(run: GovernedOptimizerRun): GovernedOptimizerRun {
  return {
    ...run,
    workspace: "$WORKSPACE",
    signaturePath: redactPath(run.signaturePath, run.workspace),
    candidates: run.candidates.map((candidate) => ({
      ...candidate,
      candidateWorkspace: redactPath(candidate.candidateWorkspace, run.workspace) ?? candidate.candidateWorkspace,
      resourcePath: redactPath(candidate.resourcePath, run.workspace)
    })),
    receipts: run.receipts.map((receipt) => ({
      ...receipt,
      candidateWorkspace: redactPath(receipt.candidateWorkspace, run.workspace) ?? receipt.candidateWorkspace
    }))
  };
}

export function listGovernedOptimizerRuns(input: {
  workspace: string;
  agentId?: string;
  limit?: number;
  redacted?: boolean;
}): GovernedOptimizerRun[] {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  const root = optimizerRoot(input.workspace, agentId);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        return JSON.parse(readUtf8(join(root, entry.name, "optimizer-run.json"))) as GovernedOptimizerRun;
      } catch {
        return null;
      }
    })
    .filter((run): run is GovernedOptimizerRun => run !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
    .map((run) => input.redacted ? redactGovernedOptimizerRun(run) : run);
}

export function loadGovernedOptimizerRun(input: {
  workspace: string;
  agentId?: string;
  selector: string;
  redacted?: boolean;
}): GovernedOptimizerRun {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  if (input.selector === "latest") {
    const latest = listGovernedOptimizerRuns({ workspace: input.workspace, agentId, limit: 1 })[0];
    if (!latest) throw new Error("No governed optimizer run found.");
    return input.redacted ? redactGovernedOptimizerRun(latest) : latest;
  }
  const directPath = optimizerRunPath(input.workspace, agentId, input.selector);
  if (existsSync(directPath)) {
    const run = JSON.parse(readUtf8(directPath)) as GovernedOptimizerRun;
    return input.redacted ? redactGovernedOptimizerRun(run) : run;
  }
  const found = listGovernedOptimizerRuns({ workspace: input.workspace, agentId })
    .find((run) =>
      run.optimizerRunId === input.selector ||
      run.sourceRcaReportId === input.selector ||
      run.sourceRunId === input.selector ||
      run.acceptedCandidateId === input.selector
    );
  if (!found) {
    throw new Error(`Governed optimizer run not found: ${input.selector}`);
  }
  return input.redacted ? redactGovernedOptimizerRun(found) : found;
}
