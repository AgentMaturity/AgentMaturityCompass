import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type EffectAutoAgentReplayGateMode = "ci" | "lifecycle";
export type EffectAutoAgentReplayStatus = "passed" | "regressed" | "missing_evidence";
export type EffectAutoAgentReplaySeverity = "info" | "warning" | "critical";
export type EffectAutoAgentReplayTaskFamily = "hello_world" | "count_files" | "simple_script" | "custom";
export type EffectAutoAgentReplayRuntime = "bun" | "node" | "docker" | "custom";
export type EffectAutoAgentReplayProviderRoute = "openai" | "anthropic" | "multi_provider" | "custom";

export interface EffectAutoAgentReplayRowInput {
  rowId: string;
  taskId: string;
  taskFamily: EffectAutoAgentReplayTaskFamily;
  runtime: EffectAutoAgentReplayRuntime;
  providerRoute: EffectAutoAgentReplayProviderRoute;
  replayCommand?: string;
  fixedSeed?: number | null;
  baselineRunId: string;
  candidateRunId: string;
  baselineScore0to1?: number | null;
  candidateScore0to1?: number | null;
  scoreDelta0to1?: number | null;
  maxScoreRegression0to1?: number | null;
  replayPassRate0to1?: number | null;
  minReplayPassRate0to1?: number | null;
  sourceRefHash?: string | null;
  repositorySnapshotHash?: string | null;
  licenseRefHash?: string | null;
  defaultBranchRefHash?: string | null;
  readmeBlobHash?: string | null;
  packageJsonHash?: string | null;
  lockfileHash?: string | null;
  ciWorkflowHash?: string | null;
  benchmarkRunnerHash?: string | null;
  harnessSpecHash?: string | null;
  taskSpecHash?: string | null;
  metricsHash?: string | null;
  experimentLogHash?: string | null;
  agentBlueprintHash?: string | null;
  agentRunnerHash?: string | null;
  agentRunResultHash?: string | null;
  trajectoryConverterHash?: string | null;
  containerManagerHash?: string | null;
  taskManifestHash?: string | null;
  taskInstructionHash?: string | null;
  fixtureTestHash?: string | null;
  dockerEnvironmentHash?: string | null;
  replayCommandHash?: string | null;
  baselineResultHash?: string | null;
  candidateResultHash?: string | null;
  ciReceiptHash?: string | null;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
  rowHash?: string | null;
}

export interface EffectAutoAgentReplayRow extends EffectAutoAgentReplayRowInput {
  scoreDelta0to1: number | null;
  maxScoreRegression0to1: number;
  minReplayPassRate0to1: number;
  status: EffectAutoAgentReplayStatus;
  issues: string[];
  rowHash: string;
}

export interface RunEffectAutoAgentReplayCorpusInput {
  agentId: string;
  corpusId: string;
  corpusVersion: string;
  baselineRunId: string;
  candidateRunId: string;
  gateMode?: EffectAutoAgentReplayGateMode;
  generatedAt?: string;
  sourceRefs?: string[];
  rows: EffectAutoAgentReplayRowInput[];
}

export interface EffectAutoAgentReplayManifest {
  agentId: string;
  corpusId: string;
  corpusVersion: string;
  baselineRunId: string;
  candidateRunId: string;
  gateMode: EffectAutoAgentReplayGateMode;
  generatedAt: string;
  sourceRefs: string[];
  rows: EffectAutoAgentReplayRow[];
  replayable: boolean;
  fixtureHash: string;
  aggregateScoreDelta0to1: number | null;
  manifestHash: string;
}

export interface EffectAutoAgentReplayCiReceipt {
  receiptId: string;
  agentId: string;
  corpusId: string;
  corpusVersion: string;
  gateMode: EffectAutoAgentReplayGateMode;
  generatedAt: string;
  passed: boolean;
  failClosed: boolean;
  manifestHash: string;
  fixtureHash: string;
  aggregateScoreDelta0to1: number | null;
  effectAutoAgentReplayRowCount: number;
  failedEffectAutoAgentReplayRowIds: string[];
  rowHashes: Record<string, string>;
  recommendation: string;
}

export interface EffectAutoAgentReplayWatchAlert {
  id: string;
  metricId: "effectAutoAgentReplayCorpus";
  severity: EffectAutoAgentReplaySeverity;
  message: string;
  failedRowIds: string[];
  manifestHash: string;
  gateMode: EffectAutoAgentReplayGateMode;
}

export interface EffectAutoAgentReplayResult {
  manifest: EffectAutoAgentReplayManifest;
  ciReceipt: EffectAutoAgentReplayCiReceipt;
  watchAlerts: EffectAutoAgentReplayWatchAlert[];
}

export interface EffectAutoAgentReplayReceiptVerification {
  valid: boolean;
  errors: string[];
}

const defaultMaxScoreRegression0to1 = 0.02;
const defaultMinReplayPassRate0to1 = 1;

const regressionIssues = new Set([
  "effect-autoagent score delta regression exceeded",
  "effect-autoagent replay pass rate below threshold",
]);

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isHashLike(value: string | null | undefined): boolean {
  return Boolean(normalizeString(value));
}

function normalizeRate(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function normalizeScoreDelta(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1 ? value : null;
}

function normalizeNonNegativeInteger(value: number | null | undefined): number | null {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 ? value : null;
}

function addMissingHashIssue(issues: string[], value: string | null | undefined, message: string): void {
  if (!isHashLike(value)) {
    issues.push(message);
  }
}

function rowHashPayload(row: EffectAutoAgentReplayRowInput, scoreDelta0to1: number | null): unknown {
  const { rowHash: _rowHash, ...rest } = row;
  return {
    ...rest,
    scoreDelta0to1,
  };
}

function buildRowHash(row: EffectAutoAgentReplayRowInput, scoreDelta0to1: number | null): string {
  return sha256Hex(canonicalize(rowHashPayload(row, scoreDelta0to1)));
}

function normalizeRow(row: EffectAutoAgentReplayRowInput): EffectAutoAgentReplayRow {
  const issues: string[] = [];
  addMissingHashIssue(issues, row.sourceRefHash, "effect-autoagent source proof missing");
  addMissingHashIssue(issues, row.repositorySnapshotHash, "effect-autoagent repository snapshot proof missing");
  addMissingHashIssue(issues, row.licenseRefHash, "effect-autoagent license proof missing");
  addMissingHashIssue(issues, row.defaultBranchRefHash, "effect-autoagent default branch proof missing");
  addMissingHashIssue(issues, row.readmeBlobHash, "effect-autoagent README proof missing");
  addMissingHashIssue(issues, row.packageJsonHash, "effect-autoagent package proof missing");
  addMissingHashIssue(issues, row.lockfileHash, "effect-autoagent lockfile proof missing");
  addMissingHashIssue(issues, row.ciWorkflowHash, "effect-autoagent CI proof missing");
  addMissingHashIssue(issues, row.benchmarkRunnerHash, "effect-autoagent benchmark runner proof missing");
  addMissingHashIssue(issues, row.harnessSpecHash, "effect-autoagent harness proof missing");
  addMissingHashIssue(issues, row.taskSpecHash, "effect-autoagent task spec proof missing");
  addMissingHashIssue(issues, row.metricsHash, "effect-autoagent metrics proof missing");
  addMissingHashIssue(issues, row.experimentLogHash, "effect-autoagent experiment log proof missing");
  addMissingHashIssue(issues, row.agentBlueprintHash, "effect-autoagent agent blueprint proof missing");
  addMissingHashIssue(issues, row.agentRunnerHash, "effect-autoagent agent runner proof missing");
  addMissingHashIssue(issues, row.agentRunResultHash, "effect-autoagent run result proof missing");
  addMissingHashIssue(issues, row.trajectoryConverterHash, "effect-autoagent trajectory proof missing");
  addMissingHashIssue(issues, row.containerManagerHash, "effect-autoagent container proof missing");
  addMissingHashIssue(issues, row.taskManifestHash, "effect-autoagent task fixture proof missing");
  addMissingHashIssue(issues, row.taskInstructionHash, "effect-autoagent task instruction proof missing");
  addMissingHashIssue(issues, row.fixtureTestHash, "effect-autoagent fixture test proof missing");
  addMissingHashIssue(issues, row.dockerEnvironmentHash, "effect-autoagent Docker environment proof missing");
  addMissingHashIssue(issues, row.replayCommandHash, "effect-autoagent replay command proof missing");
  addMissingHashIssue(issues, row.baselineResultHash, "effect-autoagent baseline result proof missing");
  addMissingHashIssue(issues, row.candidateResultHash, "effect-autoagent candidate result proof missing");
  addMissingHashIssue(issues, row.ciReceiptHash, "effect-autoagent CI receipt proof missing");

  if (!normalizeString(row.rowId)) {
    issues.push("effect-autoagent row id missing");
  }
  if (!normalizeString(row.taskId)) {
    issues.push("effect-autoagent task id missing");
  }
  if (!normalizeString(row.baselineRunId) || !normalizeString(row.candidateRunId)) {
    issues.push("effect-autoagent baseline/candidate run id missing");
  }
  if (normalizeNonNegativeInteger(row.fixedSeed) === null) {
    issues.push("effect-autoagent fixed seed missing");
  }
  if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.length === 0) {
    issues.push("effect-autoagent evidence refs missing");
  }
  if (!Array.isArray(row.signedEvidenceRefs) || row.signedEvidenceRefs.length === 0) {
    issues.push("effect-autoagent signed evidence missing");
  }

  const baselineScore0to1 = normalizeRate(row.baselineScore0to1);
  const candidateScore0to1 = normalizeRate(row.candidateScore0to1);
  if (baselineScore0to1 === null) {
    issues.push("effect-autoagent baseline score missing");
  }
  if (candidateScore0to1 === null) {
    issues.push("effect-autoagent candidate score missing");
  }

  const explicitScoreDelta = normalizeScoreDelta(row.scoreDelta0to1);
  const scoreDelta0to1 = explicitScoreDelta ?? (
    baselineScore0to1 !== null && candidateScore0to1 !== null
      ? Number((candidateScore0to1 - baselineScore0to1).toFixed(6))
      : null
  );
  const maxScoreRegression0to1 = normalizeRate(row.maxScoreRegression0to1) ?? defaultMaxScoreRegression0to1;
  const replayPassRate0to1 = normalizeRate(row.replayPassRate0to1);
  const minReplayPassRate0to1 = normalizeRate(row.minReplayPassRate0to1) ?? defaultMinReplayPassRate0to1;

  if (replayPassRate0to1 === null) {
    issues.push("effect-autoagent replay pass rate missing");
  }
  if (scoreDelta0to1 !== null && scoreDelta0to1 < -maxScoreRegression0to1) {
    issues.push("effect-autoagent score delta regression exceeded");
  }
  if (replayPassRate0to1 !== null && replayPassRate0to1 < minReplayPassRate0to1) {
    issues.push("effect-autoagent replay pass rate below threshold");
  }

  const rowHash = buildRowHash(row, scoreDelta0to1);
  if (isHashLike(row.rowHash) && normalizeString(row.rowHash) !== rowHash) {
    issues.push("effect-autoagent row hash mismatch");
  }

  const hasMissingEvidence = issues.some((issue) => !regressionIssues.has(issue));
  const status: EffectAutoAgentReplayStatus = hasMissingEvidence
    ? "missing_evidence"
    : issues.some((issue) => regressionIssues.has(issue))
      ? "regressed"
      : "passed";

  return {
    ...row,
    scoreDelta0to1,
    maxScoreRegression0to1,
    minReplayPassRate0to1,
    status,
    issues,
    rowHash,
  };
}

function averageScoreDelta(rows: EffectAutoAgentReplayRow[]): number | null {
  const deltas = rows
    .map((row) => row.scoreDelta0to1)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (deltas.length === 0) {
    return null;
  }
  return Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(6));
}

function buildFixtureHash(rows: EffectAutoAgentReplayRow[]): string {
  return sha256Hex(canonicalize(rows.map((row) => ({
    rowId: row.rowId,
    taskId: row.taskId,
    taskFamily: row.taskFamily,
    taskManifestHash: normalizeString(row.taskManifestHash),
    taskInstructionHash: normalizeString(row.taskInstructionHash),
    fixtureTestHash: normalizeString(row.fixtureTestHash),
    dockerEnvironmentHash: normalizeString(row.dockerEnvironmentHash),
  }))));
}

function manifestHashPayload(manifest: Omit<EffectAutoAgentReplayManifest, "manifestHash">): unknown {
  return manifest;
}

function buildManifestHash(manifest: Omit<EffectAutoAgentReplayManifest, "manifestHash">): string {
  return sha256Hex(canonicalize(manifestHashPayload(manifest)));
}

export function runEffectAutoAgentReplayCorpus(
  input: RunEffectAutoAgentReplayCorpusInput,
): EffectAutoAgentReplayResult {
  const gateMode = input.gateMode ?? "ci";
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const rows = input.rows.map(normalizeRow);
  const failedRows = rows.filter((row) => row.status !== "passed");
  const replayable = rows.length > 0 && failedRows.length === 0;
  const fixtureHash = buildFixtureHash(rows);
  const aggregateScoreDelta0to1 = averageScoreDelta(rows);
  const manifestWithoutHash: Omit<EffectAutoAgentReplayManifest, "manifestHash"> = {
    agentId: input.agentId,
    corpusId: input.corpusId,
    corpusVersion: input.corpusVersion,
    baselineRunId: input.baselineRunId,
    candidateRunId: input.candidateRunId,
    gateMode,
    generatedAt,
    sourceRefs: input.sourceRefs ?? [],
    rows,
    replayable,
    fixtureHash,
    aggregateScoreDelta0to1,
  };
  const manifestHash = buildManifestHash(manifestWithoutHash);
  const manifest: EffectAutoAgentReplayManifest = {
    ...manifestWithoutHash,
    manifestHash,
  };
  const failedEffectAutoAgentReplayRowIds = failedRows.map((row) => row.rowId);
  const rowHashes = Object.fromEntries(rows.map((row) => [row.rowId, row.rowHash]));
  const ciReceipt: EffectAutoAgentReplayCiReceipt = {
    receiptId: sha256Hex(canonicalize({
      corpusId: input.corpusId,
      corpusVersion: input.corpusVersion,
      manifestHash,
      generatedAt,
      gateMode,
    })),
    agentId: input.agentId,
    corpusId: input.corpusId,
    corpusVersion: input.corpusVersion,
    gateMode,
    generatedAt,
    passed: replayable,
    failClosed: !replayable,
    manifestHash,
    fixtureHash,
    aggregateScoreDelta0to1,
    effectAutoAgentReplayRowCount: rows.length,
    failedEffectAutoAgentReplayRowIds,
    rowHashes,
    recommendation: replayable
      ? "Replay corpus gate passed; effect-autoagent-style claims may proceed with bound evidence."
      : "Replay corpus gate failed closed; block promotion until missing proof and regressions are resolved.",
  };
  const watchAlerts: EffectAutoAgentReplayWatchAlert[] = replayable
    ? []
    : [{
        id: sha256Hex(canonicalize({
          metricId: "effectAutoAgentReplayCorpus",
          manifestHash,
          failedEffectAutoAgentReplayRowIds,
        })),
        metricId: "effectAutoAgentReplayCorpus",
        severity: "critical",
        message: `Effect-autoagent replay corpus gate failed for ${failedEffectAutoAgentReplayRowIds.length} row(s).`,
        failedRowIds: failedEffectAutoAgentReplayRowIds,
        manifestHash,
        gateMode,
      }];

  return {
    manifest,
    ciReceipt,
    watchAlerts,
  };
}

export function verifyEffectAutoAgentReplayReceipt(
  manifest: EffectAutoAgentReplayManifest,
  receipt: EffectAutoAgentReplayCiReceipt,
): EffectAutoAgentReplayReceiptVerification {
  const errors: string[] = [];
  const { manifestHash: _manifestHash, ...manifestWithoutHash } = manifest;
  const expectedManifestHash = buildManifestHash(manifestWithoutHash);
  if (manifest.manifestHash !== expectedManifestHash || receipt.manifestHash !== expectedManifestHash) {
    errors.push("manifest hash mismatch");
  }

  const expectedFixtureHash = buildFixtureHash(manifest.rows);
  if (manifest.fixtureHash !== expectedFixtureHash || receipt.fixtureHash !== expectedFixtureHash) {
    errors.push("fixture hash mismatch");
  }

  const failedRowIds = manifest.rows.filter((row) => row.status !== "passed").map((row) => row.rowId);
  if (canonicalize(receipt.failedEffectAutoAgentReplayRowIds) !== canonicalize(failedRowIds)) {
    errors.push("failed row ids mismatch");
  }

  const expectedPassed = manifest.rows.length > 0 && failedRowIds.length === 0 && manifest.replayable;
  if (receipt.passed !== expectedPassed || receipt.failClosed !== !expectedPassed) {
    errors.push("pass/fail closed state mismatch");
  }

  const expectedRowHashes = Object.fromEntries(manifest.rows.map((row) => [row.rowId, row.rowHash]));
  if (canonicalize(receipt.rowHashes) !== canonicalize(expectedRowHashes)) {
    errors.push("row hashes mismatch");
  }

  if (receipt.effectAutoAgentReplayRowCount !== manifest.rows.length) {
    errors.push("row count mismatch");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
