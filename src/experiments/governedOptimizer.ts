import { redactNullableWorkspacePath } from "../utils/workspacePathRedaction.js";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type EnforceResourceKind } from "../enforce/resourceManifest.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { readAndVerifyArtifactFileSignature, trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import {
  listFixerRcaReports,
  loadFixerRcaReport,
  type FixerPatchProposal,
  type FixerRcaReport,
  type FixerRegressionTest
} from "../mechanic/fixerRca.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { buildHoldoutPartition, holdoutPartitionProblems, type HoldoutPartition } from "./holdoutPartition.js";

/** Upstream BenchSpec refuses observation caps below this many characters. */
export const MIN_OBSERVATION_CAP_CHARS = 10_000;
const MAX_OBSERVATION_CAP_CHARS = 1_000_000;

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

/** Arithmetic over Fixer proposal descriptors (expected impact, test counts, confidence); never an executed measurement. */
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
  /** Estimates used only to rank proposals for probing. */
  metrics: OptimizerCandidateMetrics;
  /** Provenance of `metrics`. Only an executor with trial receipts could produce measured values. */
  metricSource: "estimated";
  /** No executor has run the candidate, so it can never be a measured or promotable winner. */
  evaluationState: "not-run";
  /** Observed values stay absent until an executor produces receipts. */
  observedMetrics: null;
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
  /** Structural planning checks only: splits, leakage, workspaces and receipts. No candidate was executed. */
  validationKind: "structural";
  executedValidationRefs: [];
  status: "passed" | "blocked";
  createdAt: string;
  gates: Array<{
    id: string;
    status: "passed" | "blocked";
    reason: string;
  }>;
}

/**
 * 2026-10-30 draws each candidate's split from a recorded seeded, failure-class-stratified partition; 2026-10-29 labels
 * metrics as estimates; older records are read through `admitOptimizerRun` with `partition: null`.
 */
export interface GovernedOptimizerRun {
  schemaVersion: "2026-05-22" | "2026-10-29" | "2026-10-30";
  optimizerRunId: string;
  workspace: string;
  agentId: string;
  sourceRcaReportId: string;
  sourceRunId: string;
  createdAt: string;
  candidateCount: number;
  acceptedCandidateId: string | null;
  /** "baseline": no candidate is selected and the unchanged baseline stays in place. */
  selection: "candidate" | "baseline";
  candidates: GovernedOptimizerCandidate[];
  receipts: OptimizerCandidateReceipt[];
  validationReceipt: OptimizerValidationReceipt;
  /** Operator-owned holdout partition over the RCA regression tests; null on records written before 2026-10-30. */
  partition: HoldoutPartition | null;
  /** Per-observation cap of the search-split evidence exported to candidate workspaces; null on older records. */
  observationCapChars: number | null;
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

/**
 * Search and validation come from the partition stratum of the proposal's own failure class, so the held-out set holds
 * unseen cases of the problem being fixed rather than tests of other classes.
 */
function splitForProposal(failureClass: string | null, partition: HoldoutPartition): OptimizerSplit {
  const stratum = partition.strata.find((row) => row.stratum === failureClass) ?? null;
  const searchTestIds = stratum?.searchIds ?? [];
  const validationTestIds = stratum?.validationIds ?? [];
  let blockedReason: string | null = null;
  if (!stratum) {
    blockedReason = "Candidate's failure class has no regression tests in the holdout partition.";
  } else if (validationTestIds.length === 0) {
    blockedReason = `No held-out case of failure class ${stratum.stratum}: it has ${searchTestIds.length} regression test(s); at least two are required for held-out validation.`;
  } else if (searchTestIds.length === 0) {
    blockedReason = "Candidate has no search regression tests.";
  }
  return { searchTestIds, validationTestIds, blockedReason };
}

/** Every held-out test ID and input reference of the partition; none may appear in proposer-visible text. */
function heldOutTokens(partition: HoldoutPartition, tests: FixerRegressionTest[]): string[] {
  const validation = new Set(partition.strata.flatMap((row) => row.validationIds));
  return uniqueSorted(
    tests
      .filter((test) => validation.has(test.testId))
      .flatMap((test) => [test.testId, test.inputRef])
      .filter((value) => value.trim().length > 0)
  );
}

interface ProposerObservation {
  callId: string;
  text: string;
  /** Characters cut by this export's per-observation cap. */
  truncatedChars: number;
  /** The upstream trace index or RCA report had already shortened the snippet. */
  sourceTruncated: boolean;
}

interface ProposerTrajectory {
  testId: string;
  failureClass: string;
  observations: ProposerObservation[];
}

function renderObservation(callId: string, snippet: string, cap: number): ProposerObservation {
  const truncatedChars = Math.max(0, snippet.length - cap);
  return {
    callId,
    text: truncatedChars > 0 ? `${snippet.slice(0, cap)}\n[truncated: ${truncatedChars} characters omitted]` : snippet,
    truncatedChars,
    sourceTruncated: snippet.endsWith("...")
  };
}

/** Redacted RCA call records of search-split tests only; a record touching any held-out reference is withheld. */
function proposerTrajectories(split: OptimizerSplit, report: FixerRcaReport, heldOut: Set<string>, cap: number): ProposerTrajectory[] {
  const search = new Set(split.searchTestIds);
  return report.regressionTests
    .filter((test) => search.has(test.testId))
    .map((test) => ({
      testId: test.testId,
      failureClass: test.failureClass,
      observations: report.callRecords
        .filter((record) => record.evidenceRefs.includes(test.inputRef) && !record.evidenceRefs.some((ref) => heldOut.has(ref)))
        .filter((record) => record.outputSnippet.trim().length > 0)
        .map((record) => renderObservation(record.callId, record.outputSnippet, cap))
    }))
    .filter((trajectory) => trajectory.observations.length > 0);
}

function leakageChecksFor(input: {
  proposal: FixerPatchProposal;
  split: OptimizerSplit;
  heldOutTokens: string[];
  trajectories: ProposerTrajectory[];
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
  const leaked = input.heldOutTokens.filter((token) => haystack.includes(token.toLowerCase()));
  add(
    "heldout-not-in-candidate-source",
    leaked.length > 0 ? "blocked" : "passed",
    leaked.length > 0 ? `Candidate source references held-out validation token(s): ${leaked.join(", ")}` : "Candidate summary and resource fields do not name held-out validation cases.",
    leaked
  );
  add(
    "proposal-evidence-rendered",
    input.trajectories.length > 0 ? "passed" : "blocked",
    input.trajectories.length > 0
      ? `${input.trajectories.length} search-split trajectory(ies) rendered for the proposer.`
      : "No search-split trajectory rendered; adaptation is refused without execution evidence."
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

/** Ranking sees the search split only; the held-out split never feeds the optimizer search. */
function metricsForProposal(proposal: FixerPatchProposal, split: OptimizerSplit): OptimizerCandidateMetrics {
  const confidence = round(clamp(proposal.confidence, 0, 1), 4);
  const regressionImpact = split.searchTestIds.length;
  const riskPenalty = proposal.status === "proposed" ? 0 : 35;
  const rollbackPenalty = proposal.rollbackPointer ? 0 : 25;
  const splitPenalty = split.blockedReason ? 25 : 0;
  return {
    scoreGain: round(proposal.expectedScoreImpact, 4),
    risk: round(clamp((1 - confidence) * 100 + riskPenalty + rollbackPenalty + splitPenalty, 0, 100), 4),
    cost: round(1 + split.searchTestIds.length * 0.5, 4),
    latencyMs: Math.round(1000 + split.searchTestIds.length * 250),
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

const canonicalMetrics = (candidate: GovernedOptimizerCandidate): string => JSON.stringify(candidate.metrics);

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
  // The unchanged baseline (gain 0) is always eligible: a candidate wins only with a positive gain and a unique top
  // position. A tie or no gain abstains instead of forcing a winner. Gains are estimates; promotion still needs a
  // measured experiment gate.
  const top = ranked.find((candidate) => paretoById.get(candidate.candidateId)) ?? null;
  const tied = top !== null && ranked.some((other) => other.candidateId !== top.candidateId && canonicalMetrics(other) === canonicalMetrics(top));
  const winner = top !== null && top.metrics.scoreGain > 0 && !tied ? top : null;
  const abstainReason = top === null ? null
    : tied ? "Baseline retained: the top candidates tie, so no candidate is selected."
    : top.metrics.scoreGain > 0 ? null : "Baseline retained: no candidate shows a positive estimated gain over the unchanged baseline.";
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
        decisionReason: "Selected for probing: top Pareto candidate on estimated metrics with a positive estimated gain over the baseline after split and leakage checks. No candidate has been executed or measured."
      };
    }
    return {
      ...candidate,
      paretoFront,
      rank,
      decision: "rejected" as const,
      decisionReason: abstainReason !== null && paretoFront ? abstainReason : paretoFront
        ? "Candidate is on the Pareto frontier but ranked behind the accepted candidate."
        : "Candidate is dominated on estimated score, risk, cost, latency, confidence, or regression impact."
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
  const validated = input.candidates.filter(checksPassed);
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
      // Keeping the baseline is a decided outcome; only a run where no candidate passed the structural gates is blocked.
      id: "selection-decided",
      status: accepted.length > 0 || validated.length > 0 ? "passed" as const : "blocked" as const,
      reason: accepted.length > 0 ? "A candidate ranks first with a positive estimated gain over the retained baseline; it has not been executed or measured."
        : validated.length > 0 ? "Baseline retained: no structurally valid candidate has a positive estimated gain over it."
        : "No candidate passed the structural gates and estimated Pareto ranking."
    },
    {
      id: "candidate-receipts-created",
      status: input.receipts.length === input.candidates.length ? "passed" as const : "blocked" as const,
      reason: "Every accepted or rejected candidate has a receipt and reason."
    }
  ];
  return {
    receiptId: `optrec_${sha256Hex(`${input.optimizerRunId}:${gates.map((gate) => gate.status).join(":")}`).slice(0, 16)}`,
    validationKind: "structural",
    executedValidationRefs: [],
    status: gates.every((gate) => gate.status === "passed") ? "passed" : "blocked",
    createdAt: input.createdAt,
    gates
  };
}

/**
 * The candidate workspace is the proposer/executor view: the search split, redacted search-split trajectories and gate
 * outcomes. Held-out IDs, leakage evidence and decision reasons (which can name held-out cases) stay in the
 * operator-owned run record. The runner is not an OS sandbox, so this narrows what is handed over; it does not stop a
 * process with filesystem access from reading the run record.
 */
function writeCandidateWorkspace(candidate: GovernedOptimizerCandidate, report: FixerRcaReport, partition: HoldoutPartition,
  trajectories: ProposerTrajectory[], observationCapChars: number): void {
  ensureDir(candidate.candidateWorkspace);
  writeFileAtomic(
    join(candidate.candidateWorkspace, "candidate.json"),
    `${JSON.stringify({
      schemaVersion: "2026-10-30",
      sourceRcaReportId: report.reportId,
      sourceRunId: report.runId,
      candidate: {
        candidateId: candidate.candidateId,
        sourceProposalId: candidate.sourceProposalId,
        resourceKind: candidate.resourceKind,
        resourceId: candidate.resourceId,
        resourcePath: candidate.resourcePath,
        rollbackPointer: candidate.rollbackPointer,
        patchSummary: candidate.patchSummary,
        searchTestIds: candidate.split.searchTestIds,
        heldOut: { partitionDigest: partition.digest, validationCaseCount: candidate.split.validationTestIds.length },
        gates: candidate.leakageChecks.map((check) => ({ id: check.id, status: check.status })),
        decision: candidate.decision,
        receiptId: candidate.receiptId
      }
    }, null, 2)}\n`,
    0o644
  );
  writeFileAtomic(
    join(candidate.candidateWorkspace, "evidence.json"),
    `${JSON.stringify({ schemaVersion: "2026-10-30", split: "search", observationCapChars, trajectories }, null, 2)}\n`,
    0o644
  );
  writeFileAtomic(
    join(candidate.candidateWorkspace, "README.md"),
    [
      `# ${candidate.candidateId}`,
      "",
      "This workspace stores the proposed optimizer candidate only. It does not replace or mutate the live Enforce resource.",
      "It holds the search split and its redacted evidence; held-out validation cases are not included.",
      "",
      `- Decision: ${candidate.decision}`,
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
  /** Holdout partition seed; the same seed over the same RCA tests yields the same partition digest. */
  partitionSeed?: string;
  /** Per-observation cap of exported proposer evidence; refused below MIN_OBSERVATION_CAP_CHARS. */
  observationCapChars?: number;
}): { run: GovernedOptimizerRun; path: string; signaturePath: string | null } {
  const observationCapChars = input.observationCapChars ?? MIN_OBSERVATION_CAP_CHARS;
  if (!Number.isSafeInteger(observationCapChars) || observationCapChars < MIN_OBSERVATION_CAP_CHARS || observationCapChars > MAX_OBSERVATION_CAP_CHARS) {
    throw new Error(`Observation cap must be an integer from ${MIN_OBSERVATION_CAP_CHARS} to ${MAX_OBSERVATION_CAP_CHARS} characters.`);
  }
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId ?? "default");
  const report = sourceRcaReport({ workspace, agentId, selector: input.rcaSelector });
  // Frozen before any candidate is built; refuses duplicate test IDs.
  const partition = buildHoldoutPartition({
    population: report.regressionTests.map((test) => ({ id: test.testId, stratum: test.failureClass })),
    ...(input.partitionSeed !== undefined ? { seed: input.partitionSeed } : {})
  });
  const tokens = heldOutTokens(partition, report.regressionTests);
  const heldOutRefs = new Set(tokens);
  const createdAt = new Date().toISOString();
  const optimizerRunId = `optimizer-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const trajectoriesById = new Map<string, ProposerTrajectory[]>();
  const candidates = report.proposals.map((proposal) => {
    const candidateId = `optcand_${sha256Hex(`${report.reportId}:${proposal.proposalId}`).slice(0, 12)}`;
    const candidateWorkspace = candidateWorkspacePath(workspace, agentId, optimizerRunId, candidateId);
    const failureClass = report.rootCauses.find((cause) => cause.rootCauseId === proposal.rootCauseId)?.failureClass ?? null;
    const split = splitForProposal(failureClass, partition);
    const trajectories = proposerTrajectories(split, report, heldOutRefs, observationCapChars);
    trajectoriesById.set(candidateId, trajectories);
    const leakageChecks = leakageChecksFor({ proposal, split, heldOutTokens: tokens, trajectories, candidateWorkspace });
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
      metricSource: "estimated",
      evaluationState: "not-run",
      observedMetrics: null,
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
    writeCandidateWorkspace(candidate, report, partition, trajectoriesById.get(candidate.candidateId) ?? [], observationCapChars);
  }
  const receipts = ranked.map((candidate) => receiptForCandidate(candidate, createdAt));
  const run: GovernedOptimizerRun = {
    schemaVersion: "2026-10-30",
    optimizerRunId,
    workspace,
    agentId,
    sourceRcaReportId: report.reportId,
    sourceRunId: report.runId,
    createdAt,
    candidateCount: ranked.length,
    acceptedCandidateId: ranked.find((candidate) => candidate.decision === "accepted")?.candidateId ?? null,
    selection: ranked.some((candidate) => candidate.decision === "accepted") ? "candidate" : "baseline",
    candidates: ranked,
    receipts,
    validationReceipt: buildValidationReceipt({ optimizerRunId, candidates: ranked, receipts, createdAt }),
    partition,
    observationCapChars,
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
  return redactNullableWorkspacePath(path, workspace);
}

function redactGovernedOptimizerRun(run: GovernedOptimizerRun): GovernedOptimizerRun {
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

export interface GovernedOptimizerRunProblem {
  optimizerRunId: string;
  reason: string;
}

/** Run directory names carry their creation time; an unrecognised name sorts as newest so it can never be skipped. */
function runOrderKey(name: string): number {
  const match = /^optimizer-(\d+)-/.exec(name);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/**
 * Admit one stored run: its signature must verify over the exact bytes read, it must describe this directory and
 * agent, and no candidate may claim measured evaluation. 2026-05-22 records gain the estimate labels on read; their
 * signed bytes are not rewritten.
 */
function admitOptimizerRun(workspace: string, agentId: string, root: string, name: string): GovernedOptimizerRun {
  const verified = readAndVerifyArtifactFileSignature({ workspace, path: join(root, name, "optimizer-run.json"), artifactKind: "governed-optimizer-run" });
  if (!verified.valid || !verified.artifactBytes) throw new Error(verified.reason ?? "signature verification failed");
  const run = JSON.parse(verified.artifactBytes.toString("utf8")) as GovernedOptimizerRun;
  if (typeof run !== "object" || run === null || !Array.isArray(run.candidates)) throw new Error("not an optimizer run record");
  if (run.optimizerRunId !== name || run.agentId !== agentId) throw new Error("record names another run or agent");
  if (run.schemaVersion === "2026-05-22") {
    return {
      ...run,
      candidates: run.candidates.map((candidate) => ({ ...candidate, metricSource: "estimated", evaluationState: "not-run", observedMetrics: null })),
      validationReceipt: { ...run.validationReceipt, validationKind: "structural", executedValidationRefs: [] },
      partition: null,
      observationCapChars: null
    };
  }
  if (run.schemaVersion !== "2026-10-29" && run.schemaVersion !== "2026-10-30") throw new Error(`unknown schema version ${String(run.schemaVersion)}`);
  if (run.schemaVersion === "2026-10-30") assertSplitsFromPartition(run);
  const measured = run.candidates.find((candidate) =>
    candidate.metricSource !== "estimated" || candidate.evaluationState !== "not-run" || candidate.observedMetrics !== null);
  if (measured || run.validationReceipt?.validationKind !== "structural" || run.validationReceipt.executedValidationRefs?.length !== 0) {
    throw new Error("record claims measured evaluation without executed trial receipts");
  }
  return run.schemaVersion === "2026-10-29" ? { ...run, partition: null, observationCapChars: null } : run;
}

/** A signed record must still carry a consistent partition, and every candidate split must be one of its strata. */
function assertSplitsFromPartition(run: GovernedOptimizerRun): void {
  if (!run.partition) throw new Error("record has no holdout partition");
  const problems = holdoutPartitionProblems(run.partition);
  if (problems.length > 0) throw new Error(`holdout partition is invalid: ${problems.join("; ")}`);
  const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((id, index) => id === b[index]);
  for (const candidate of run.candidates) {
    const { searchTestIds, validationTestIds } = candidate.split;
    const drawn = (searchTestIds.length === 0 && validationTestIds.length === 0) ||
      run.partition.strata.some((row) => same(row.searchIds, searchTestIds) && same(row.validationIds, validationTestIds));
    if (!drawn) throw new Error(`candidate ${candidate.candidateId} split is not drawn from the recorded holdout partition`);
  }
}

/** Every stored run, newest first: verified runs, plus a typed problem for each record that could not be admitted. */
function scanGovernedOptimizerRuns(workspace: string, agentId: string): Array<{ name: string; run: GovernedOptimizerRun | null; problem: GovernedOptimizerRunProblem | null }> {
  const root = optimizerRoot(workspace, agentId);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => runOrderKey(b) - runOrderKey(a) || b.localeCompare(a))
    .map((name) => {
      try {
        return { name, run: admitOptimizerRun(workspace, agentId, root, name), problem: null };
      } catch (error) {
        return { name, run: null, problem: { optimizerRunId: name, reason: error instanceof Error ? error.message : String(error) } };
      }
    });
}

export function listGovernedOptimizerRuns(input: {
  workspace: string;
  agentId?: string;
  limit?: number;
  redacted?: boolean;
}): { runs: GovernedOptimizerRun[]; problems: GovernedOptimizerRunProblem[] } {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  const scanned = scanGovernedOptimizerRuns(input.workspace, agentId);
  return {
    runs: scanned
      .flatMap((entry) => entry.run ? [entry.run] : [])
      .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
      .map((run) => input.redacted ? redactGovernedOptimizerRun(run) : run),
    problems: scanned.flatMap((entry) => entry.problem ? [entry.problem] : [])
  };
}

/**
 * Resolve a selector to exactly one verified run. `latest` refuses when the newest record is unreadable; a run ID
 * matches its own record; any other selector must match exactly one run and cannot be resolved past unreadable records.
 */
export function loadGovernedOptimizerRun(input: {
  workspace: string;
  agentId?: string;
  selector: string;
  redacted?: boolean;
}): GovernedOptimizerRun {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  const scanned = scanGovernedOptimizerRuns(input.workspace, agentId);
  const output = (run: GovernedOptimizerRun): GovernedOptimizerRun => input.redacted ? redactGovernedOptimizerRun(run) : run;
  if (input.selector === "latest") {
    const newest = scanned[0];
    if (!newest) throw new Error("No governed optimizer run found.");
    if (newest.problem) throw new Error(`Newest governed optimizer run ${newest.name} is unreadable: ${newest.problem.reason}`);
    return output(newest.run!);
  }
  const named = scanned.find((entry) => entry.name === input.selector);
  if (named) {
    if (named.problem) throw new Error(`Governed optimizer run ${named.name} is unreadable: ${named.problem.reason}`);
    return output(named.run!);
  }
  const matches = scanned.flatMap((entry) => entry.run ? [entry.run] : []).filter((run) =>
    run.sourceRcaReportId === input.selector ||
    run.sourceRunId === input.selector ||
    run.acceptedCandidateId === input.selector
  );
  const unreadable = scanned.filter((entry) => entry.problem).map((entry) => entry.name);
  if (matches.length > 1) {
    throw new Error(`Governed optimizer selector ${input.selector} is ambiguous; it matches ${matches.map((run) => run.optimizerRunId).join(", ")}`);
  }
  if (unreadable.length > 0) {
    throw new Error(`Governed optimizer selector ${input.selector} cannot be resolved uniquely past unreadable run(s): ${unreadable.join(", ")}`);
  }
  if (matches.length === 0) {
    throw new Error(`Governed optimizer run not found: ${input.selector}`);
  }
  return output(matches[0]!);
}
