import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import YAML from "yaml";
import type { ExperimentReport } from "../types.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { getSigningKey, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { parseWindowToMs } from "../utils/time.js";
import { appendTransparencyEntry, appendTransparencyEntryAsync } from "../transparency/logChain.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { runCasebook, assertCasebookRunCurrent } from "../casebooks/casebookRunner.js";
import { casebookContentSha256, casebookMeasurementWarnings, loadCasebook } from "../casebooks/casebookStore.js";
import { captureRunHashAuthority, runHashVerificationKeys } from "../ledger/runHashSignature.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { vaultStatus } from "../vault/vault.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { experimentGateSchema, experimentSchema, type ExperimentFile, type ExperimentGatePolicy } from "./experimentSchema.js";
import { deterministicSeed, meanDifference, pairedBootstrapCI, pairedStandardizedEffect } from "./stats.js";
import { DEFAULT_MIN_PAIRED_CASES, evaluateExperimentGate, type ExperimentGateStatus } from "./experimentGatePolicy.js";
import { listExperimentRunFiles, readExperimentRun } from "./experimentHistory.js";

interface SignedDigest {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

function experimentsRoot(workspace: string, agentId: string): string {
  const paths = getAgentPaths(workspace, agentId);
  return join(paths.rootDir, "experiments");
}

function experimentDir(workspace: string, agentId: string, experimentId: string): string {
  // An experiment ID names one directory under the experiments root, never a path.
  if (!/^[A-Za-z0-9_-]+$/.test(experimentId)) throw new ExperimentInputError(`invalid experiment ID '${experimentId}'`);
  return join(experimentsRoot(workspace, agentId), experimentId);
}

function experimentFilePath(workspace: string, agentId: string, experimentId: string): string {
  return join(experimentDir(workspace, agentId, experimentId), "experiment.yaml");
}

function experimentRunsDir(workspace: string, agentId: string, experimentId: string): string {
  return join(experimentDir(workspace, agentId, experimentId), "runs");
}

function loadExperiment(workspace: string, agentId: string, experimentId: string): ExperimentFile {
  const file = experimentFilePath(workspace, agentId, experimentId);
  if (!pathExists(file)) {
    throw new Error(`experiment not found: ${file}`);
  }
  return experimentSchema.parse(YAML.parse(readUtf8(file)) as unknown);
}

function saveExperiment(workspace: string, agentId: string, experiment: ExperimentFile): string {
  const file = experimentFilePath(workspace, agentId, experiment.experiment.experimentId);
  ensureDir(experimentDir(workspace, agentId, experiment.experiment.experimentId));
  writeFileAtomic(file, YAML.stringify(experiment), 0o644);
  return file;
}

function verifySignedCandidateFile(workspace: string, file: string): { valid: boolean; digestSha256: string; reason: string | null } {
  const sigPath = `${file}.sig`;
  if (!pathExists(file)) {
    return { valid: false, digestSha256: "", reason: "candidate file missing" };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, digestSha256: "", reason: "candidate signature missing" };
  }
  try {
    const payload = JSON.parse(readUtf8(sigPath)) as SignedDigest;
    const digest = sha256Hex(readFileSync(file));
    if (digest !== payload.digestSha256) {
      return { valid: false, digestSha256: digest, reason: "candidate digest mismatch" };
    }
    const valid = verifyHexDigestAny(digest, payload.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      digestSha256: digest,
      reason: valid ? null : "candidate signature verification failed"
    };
  } catch (error) {
    return {
      valid: false,
      digestSha256: "",
      reason: String(error)
    };
  }
}

/** The newest run, admitted against the current configuration; null when there are no runs. */
function latestRunOrNull(workspace: string, agentId: string, experimentId: string): ExperimentReport | null {
  const experiment = loadExperiment(workspace, agentId, experimentId);
  const file = listExperimentRunFiles(experimentRunsDir(workspace, agentId, experimentId)).at(-1);
  return file ? readExperimentRun(workspace, agentId, experiment, file) : null;
}

function latestRun(workspace: string, agentId: string, experimentId: string): ExperimentReport {
  const report = latestRunOrNull(workspace, agentId, experimentId);
  if (!report) throw new Error(`no experiment runs for ${experimentId}`);
  return report;
}

/** experiment.yaml read-modify-write, serialized so concurrent set-baseline and set-candidate cannot drop each other's update. */
function updateExperiment(workspace: string, agentId: string, experimentId: string, update: (experiment: ExperimentFile) => void): string {
  loadExperiment(workspace, agentId, experimentId); // refuse an unknown experiment before the lock creates its directory
  return withControlFileLock({ root: experimentDir(workspace, agentId, experimentId), name: "experiment-definition", operation: () => {
    const experiment = loadExperiment(workspace, agentId, experimentId);
    update(experiment);
    return saveExperiment(workspace, agentId, experiment);
  } });
}

const fixed = (value: number | null | undefined, digits: number): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "unavailable";

function toMarkdown(report: ExperimentReport): string {
  const rows = report.cases
    .map(
      (row) =>
        `- ${row.caseId}: baseline=${row.baselineStatus ?? String(row.baselineSuccess)} candidate=${row.candidateStatus ?? String(row.candidateSuccess)} ` +
        `paired=${row.paired ?? "legacy"} baselineValue=${fixed(row.baselineValuePoints, 2)} candidateValue=${fixed(row.candidateValuePoints, 2)} ` +
        `baselineTokens=${fixed(row.baselineCost, 4)} candidateTokens=${fixed(row.candidateCost, 4)} ` +
        `baselineSuccessPoints=${fixed(row.baselineSuccessPoints, 2)} candidateSuccessPoints=${fixed(row.candidateSuccessPoints, 2)}`
    )
    .join("\n");
  const counts = report.counts;
  return [
    `# Experiment ${report.experimentId}`,
    "",
    `- Agent: ${report.agentId}`,
    `- Mode: ${report.mode}`,
    `- Casebook: ${report.casebookId}`,
    `- Schema: ${report.schemaVersion === 2 ? `v2 (${report.methodVersion ?? "unknown method"})` : "legacy (not promotion-eligible)"}`,
    ...(counts ? [`- Cases: ${counts.cases} (paired ${counts.pairedCases}, excluded ${counts.excludedCases})`] : []),
    `- Baseline success rate: ${report.baselineSuccessRate.toFixed(4)}`,
    `- Candidate success rate: ${report.candidateSuccessRate.toFixed(4)}`,
    `- Uplift success rate: ${report.upliftSuccessRate.toFixed(4)}`,
    `- Baseline value avg (points, 0..100 scale): ${report.baselineValuePointsAvg.toFixed(4)}`,
    `- Candidate value avg (points, 0..100 scale): ${report.candidateValuePointsAvg.toFixed(4)}`,
    `- Uplift value points: ${report.upliftValuePoints.toFixed(4)}`,
    `- Baseline tokens/success: ${fixed(report.baselineCostPerSuccess, 6)}`,
    `- Candidate tokens/success: ${fixed(report.candidateCostPerSuccess, 6)}`,
    `- 95% CI (${report.schemaVersion === 2 ? "paired" : "legacy unpaired"} value-point difference): ${report.confidenceInterval95 ? `[${report.confidenceInterval95[0].toFixed(6)}, ${report.confidenceInterval95[1].toFixed(6)}]` : "unavailable (insufficient sample)"}`,
    ...(report.meanDifference !== undefined ? [`- Mean difference: ${report.meanDifference.toFixed(6)}`] : []),
    `- ${report.schemaVersion === 2 ? "Standardized paired effect (d_z)" : "Effect size (legacy: raw mean difference)"}: ${fixed(report.effectSize, 6)}`,
    "",
    "## Comparability warnings",
    ...(report.warnings ?? ["Comparability warnings were not recorded for this legacy report."]).map(warning => `- ${warning}`),
    "",
    "## Cases",
    rows,
    "",
    "No-hallucination disclaimer: results only reflect measured deterministic signals and configured validators.",
    ""
  ].join("\n");
}

export function createExperiment(params: {
  workspace: string;
  agentId?: string;
  name: string;
  casebookId: string;
}): { experimentId: string; path: string } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const experimentId = `exp_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const payload: ExperimentFile = experimentSchema.parse({
    experiment: {
      version: 1,
      experimentId,
      agentId,
      name: params.name,
      casebookId: params.casebookId,
      createdTs: Date.now(),
      baselineConfig: {
        id: "current",
        kind: "current",
        path: null
      },
      candidateConfig: null
    }
  });
  const path = saveExperiment(params.workspace, agentId, payload);
  return {
    experimentId,
    path
  };
}

export function setExperimentBaseline(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  config: "current" | { path: string };
}): { path: string } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const baselineConfig = params.config === "current"
    ? { id: "current", kind: "current" as const, path: null }
    : { id: sha256Hex(readFileSync(params.config.path)).slice(0, 12), kind: "file" as const, path: params.config.path };
  return {
    path: updateExperiment(params.workspace, agentId, params.experimentId, (experiment) => { experiment.experiment.baselineConfig = baselineConfig; })
  };
}

export function setExperimentCandidate(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  candidateFile: string;
}): { path: string; digestSha256: string } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const verify = verifySignedCandidateFile(params.workspace, params.candidateFile);
  if (!verify.valid) {
    throw new Error(`candidate file verification failed: ${verify.reason ?? "unknown"}`);
  }
  const path = updateExperiment(params.workspace, agentId, params.experimentId, (experiment) => {
    experiment.experiment.candidateConfig = {
      id: verify.digestSha256.slice(0, 12),
      kind: "overlay-file",
      path: params.candidateFile,
      digestSha256: verify.digestSha256,
      signatureValid: true
    };
  });
  return {
    path,
    digestSha256: verify.digestSha256
  };
}

/** Invalid experiment request input, refused before any casebook or report work. */
export class ExperimentInputError extends Error {
  readonly code = "EXPERIMENT_INPUT_INVALID";
  constructor(message: string) { super(message); this.name = "ExperimentInputError"; }
}

/**
 * Compares a baseline run against a candidate run.
 *
 * Both sides must be real: casebook results are computed from evidence in the
 * ledger, so the candidate configuration has to have actually run and produced
 * evidence. Previously the candidate was never executed — its outcomes were the
 * baseline's plus deterministic jitter — so every "candidate improves on
 * baseline by X%" figure was invented.
 *
 * @throws when no candidate evidence window is supplied, because AMC cannot
 * execute a candidate configuration itself.
 */
const EXPERIMENT_METHOD_VERSION = "casebook-paired/2";

type CasebookSide = ReturnType<typeof runCasebook>;
const executionOf = (row: CasebookSide["results"][number]) =>
  row.execution ? { trialId: row.execution.trialId, configDigest: row.execution.configDigest, caseSha256: row.execution.caseSha256, eventIds: row.execution.eventIds } : null;

function sideIdentity(run: CasebookSide) {
  return { agentId: run.agentId, startedTs: run.startedTs, endedTs: run.endedTs,
    trialId: run.trial?.trialId ?? null, configDigest: run.trial?.configDigest ?? null };
}

/** Tokens per success over paired cases; null with no success or any paired case lacking measured usage. */
function costPerSuccess(costs: Array<number | null>, successes: number): number | null {
  if (successes === 0 || costs.some((cost) => cost === null)) return null;
  return Number(((costs as number[]).reduce((sum, cost) => sum + cost, 0) / successes).toFixed(6));
}

/**
 * Compares a baseline run against a candidate run.
 *
 * Both sides must be real: casebook results are computed from evidence in the
 * ledger, so the candidate configuration has to have actually run and produced
 * evidence. Previously the candidate was never executed — its outcomes were the
 * baseline's plus deterministic jitter — so every "candidate improves on
 * baseline by X%" figure was invented.
 *
 * Two evidence designs: bound trials (baselineTrialId/candidateTrialId), where each case counts only rows stamped with
 * its own case execution identity; or legacy windows, where a same-agent baseline window ends where the candidate
 * window starts so the two sides never read the same evidence. Rates and statistics use only paired cases (determinate
 * on both sides); excluded cases are counted, never scored.
 *
 * @throws when no candidate evidence window is supplied, because AMC cannot
 * execute a candidate configuration itself; when the casebook is empty; or when no case is determinate on both sides.
 */
function prepareExperimentReport(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  mode: "supervise" | "sandbox";
  /**
   * Evidence window covering the candidate configuration's own run
   * (e.g. "7d"). Required: without it there is nothing real to compare.
   */
  candidateWindow?: string;
  /** Agent id the candidate ran under, when it differs from the baseline. */
  candidateAgentId?: string;
  /** Bound trials: the trial identities stamped on each side's case execution rows. Both or neither. */
  baselineTrialId?: string;
  candidateTrialId?: string;
}) {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const experiment = loadExperiment(params.workspace, agentId, params.experimentId);
  // Every input is checked before any casebook work, so invalid input cannot produce a partial comparison.
  if (params.mode !== "supervise" && params.mode !== "sandbox") {
    throw new ExperimentInputError(`invalid experiment mode '${String(params.mode)}'; expected supervise or sandbox`);
  }
  const candidateConfig = experiment.experiment.candidateConfig;
  if (!candidateConfig || !candidateConfig.signatureValid) {
    throw new ExperimentInputError("candidate config is missing or unsigned");
  }
  if (!params.candidateWindow) {
    throw new ExperimentInputError(
      "Experiment requires a candidate evidence window (--candidate-window). " +
        "AMC cannot execute a candidate configuration itself, so the candidate must " +
        "have run and produced evidence; synthesizing its outcomes would fabricate the comparison."
    );
  }
  try { parseWindowToMs(params.candidateWindow); }
  catch (error) { throw new ExperimentInputError(error instanceof Error ? error.message : String(error)); }
  const candidateAgentId = params.candidateAgentId === undefined ? agentId : resolveAgentId(params.workspace, params.candidateAgentId);
  try { loadCasebook(params.workspace, experiment.experiment.casebookId, candidateAgentId); }
  catch { throw new ExperimentInputError(`candidate agent '${candidateAgentId}' has no casebook '${experiment.experiment.casebookId}'`); }
  if (loadCasebook(params.workspace, experiment.experiment.casebookId, agentId).casebook.caseIds.length === 0) {
    throw new ExperimentInputError("experiment casebook has no cases; an empty task universe is not an experiment");
  }
  const bound = params.baselineTrialId !== undefined || params.candidateTrialId !== undefined;
  let trials: { baseline: { trialId: string; configDigest: string }; candidate: { trialId: string; configDigest: string } } | null = null;
  if (bound) {
    const baselinePath = experiment.experiment.baselineConfig.kind === "file" ? experiment.experiment.baselineConfig.path : null;
    if (!params.baselineTrialId || !params.candidateTrialId) throw new ExperimentInputError("bound experiment requires both baselineTrialId and candidateTrialId");
    if (params.baselineTrialId === params.candidateTrialId) throw new ExperimentInputError("baseline and candidate trials must be distinct");
    if (!baselinePath) throw new ExperimentInputError("bound experiment requires a pinned baseline configuration file");
    if (!candidateConfig.digestSha256) throw new ExperimentInputError("bound experiment requires a candidate configuration digest");
    trials = {
      baseline: { trialId: params.baselineTrialId, configDigest: sha256Hex(readFileSync(baselinePath)) },
      candidate: { trialId: params.candidateTrialId, configDigest: candidateConfig.digestSha256 }
    };
  }
  const now = Date.now();
  const candidateRange = { startedTs: now - parseWindowToMs(params.candidateWindow), endedTs: now };
  // A legacy same-agent baseline must not read the candidate's evidence: it ends where the candidate window starts.
  const baselineEnd = !trials && candidateAgentId === agentId ? candidateRange.startedTs - 1 : now;
  const baselineRange = { startedTs: baselineEnd - parseWindowToMs("14d"), endedTs: baselineEnd };

  const baselineRun = runCasebook({ workspace: params.workspace, agentId, casebookId: experiment.experiment.casebookId,
    mode: params.mode, range: baselineRange, trial: trials?.baseline });
  // The candidate side is a second real casebook run over the candidate's own evidence.
  const candidateRun = runCasebook({ workspace: params.workspace, agentId: candidateAgentId, casebookId: experiment.experiment.casebookId,
    mode: params.mode, range: candidateRange, trial: trials?.candidate });
  const candidateById = new Map(candidateRun.results.map((row) => [row.caseId, row]));

  const cases = baselineRun.results.map((row) => {
    const candidate = candidateById.get(row.caseId);
    if (!candidate) {
      throw new Error(
        `Candidate run has no result for case '${row.caseId}'. ` +
          "Both sides of an experiment must cover the same cases."
      );
    }
    if (trials && row.execution?.caseSha256 !== candidate.execution?.caseSha256) {
      throw new Error(`Case '${row.caseId}' differs between the baseline and candidate casebooks.`);
    }
    return {
      caseId: row.caseId,
      title: row.title,
      baselineSuccess: row.success,
      candidateSuccess: candidate.success,
      baselineValuePoints: row.valuePoints,
      candidateValuePoints: candidate.valuePoints === null ? null : Number(candidate.valuePoints.toFixed(4)),
      baselineSuccessPoints: row.successPoints,
      candidateSuccessPoints: candidate.successPoints,
      baselineCost: row.costTokens,
      candidateCost: candidate.costTokens === null ? null : Number(candidate.costTokens.toFixed(6)),
      reasons: row.reasons,
      baselineStatus: row.status,
      candidateStatus: candidate.status,
      candidateReasons: candidate.reasons,
      paired: row.status !== "unavailable" && candidate.status !== "unavailable",
      baselineExecution: executionOf(row),
      candidateExecution: executionOf(candidate)
    };
  });
  const paired = cases.filter((row): row is typeof row & { baselineValuePoints: number; candidateValuePoints: number } =>
    row.paired && row.baselineValuePoints !== null && row.candidateValuePoints !== null);
  if (paired.length === 0) {
    throw new Error("No case has determinate evidence on both sides; the experiment cannot compare missing evidence.");
  }

  const rate = (count: number) => count / paired.length;
  const baselineSuccesses = paired.filter((row) => row.baselineSuccess).length;
  const candidateSuccesses = paired.filter((row) => row.candidateSuccess).length;
  const baselineSuccessRate = rate(baselineSuccesses);
  const candidateSuccessRate = rate(candidateSuccesses);
  const baselineValues = paired.map((row) => row.baselineValuePoints);
  const candidateValues = paired.map((row) => row.candidateValuePoints);
  const baselineValuePointsAvg = baselineValues.reduce((sum, value) => sum + value, 0) / paired.length;
  const candidateValuePointsAvg = candidateValues.reduce((sum, value) => sum + value, 0) / paired.length;
  const pairs = paired.map((row) => [row.baselineValuePoints, row.candidateValuePoints] as const);

  // Bootstrap resampling is seeded deterministically so the CI is reproducible
  // for a given experiment; the underlying values are real measurements.
  const bootstrapSeed = deterministicSeed([experiment.experiment.experimentId, candidateConfig.digestSha256 ?? "candidate"]);
  const interval = pairedBootstrapCI({ pairs, seed: bootstrapSeed });

  const warnings: string[] = ["Value scores use points on a 0..100 scale; success rates use fractions and cost uses tokens, not currency."];
  if (paired.length < DEFAULT_MIN_PAIRED_CASES) warnings.push(`${paired.length} paired case(s); at least ${DEFAULT_MIN_PAIRED_CASES} required by the default gate. Small samples do not establish a reliable uplift.`);
  if (paired.length < cases.length) warnings.push(`${cases.length - paired.length} case(s) excluded because evidence was unavailable on one or both sides; conditional averages cover only ${paired.length} paired cases.`);
  if (baselineSuccesses === 0) warnings.push("Baseline has zero successful cases; tokens per success are unavailable.");
  if (candidateSuccesses === 0) warnings.push("Candidate has zero successful cases; tokens per success are unavailable.");
  if (paired.some(row => row.baselineCost === null || row.candidateCost === null)) warnings.push("Token usage is missing for at least one paired case; cost per success is unavailable on the affected side.");
  if (!trials) warnings.push("Legacy window evidence is not bound to case, trial and configuration identities and cannot support promotion.");
  if (candidateAgentId === agentId && Math.max(baselineRange.startedTs, candidateRange.startedTs) <= Math.min(baselineRange.endedTs, candidateRange.endedTs)) {
    warnings.push("Same-agent baseline and candidate windows overlap; comparability depends on distinct, correctly attributed trial identities.");
  }
  if (new Set([...baselineRun.results, ...candidateRun.results].map(row => row.maxValuePoints)).size > 1) warnings.push("Case value-point maxima differ; averages are unnormalized points and reflect those configured weights.");
  const runId = `exp_run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const base = {
    schemaVersion: 2 as const,
    methodVersion: EXPERIMENT_METHOD_VERSION,
    casebookSha256: casebookContentSha256(params.workspace, experiment.experiment.casebookId, agentId),
    inputWarnings: casebookMeasurementWarnings(params.workspace, experiment.experiment.casebookId, agentId),
    candidateConfigDigest: candidateConfig.digestSha256 ?? null,
    baseline: sideIdentity(baselineRun),
    candidate: sideIdentity(candidateRun),
    pairing: "paired-cases" as const,
    counts: { cases: cases.length, pairedCases: paired.length, excludedCases: cases.length - paired.length, baselineSuccesses, candidateSuccesses },
    costUnit: "tokens" as const,
    valueUnit: "points" as const,
    warnings,
    experimentId: experiment.experiment.experimentId,
    agentId,
    ts: Date.now(),
    mode: params.mode,
    casebookId: experiment.experiment.casebookId,
    baselineConfigId: experiment.experiment.baselineConfig.id,
    candidateConfigId: candidateConfig.id,
    runId,
    cases,
    baselineSuccessRate: Number(baselineSuccessRate.toFixed(6)),
    candidateSuccessRate: Number(candidateSuccessRate.toFixed(6)),
    upliftSuccessRate: Number((candidateSuccessRate - baselineSuccessRate).toFixed(6)),
    baselineValuePointsAvg: Number(baselineValuePointsAvg.toFixed(6)),
    candidateValuePointsAvg: Number(candidateValuePointsAvg.toFixed(6)),
    upliftValuePoints: Number((candidateValuePointsAvg - baselineValuePointsAvg).toFixed(6)),
    baselineCostPerSuccess: costPerSuccess(paired.map((row) => row.baselineCost), baselineSuccesses),
    candidateCostPerSuccess: costPerSuccess(paired.map((row) => row.candidateCost), candidateSuccesses),
    confidenceInterval95: interval.interval,
    confidenceStatus: interval.status,
    meanDifference: meanDifference(baselineValues, candidateValues),
    effectSize: pairedStandardizedEffect(pairs)
  } satisfies Omit<ExperimentReport, "reportJsonSha256" | "reportSealSig">;

  const runsDir = experimentRunsDir(params.workspace, agentId, params.experimentId);
  return { agentId, experiment, baselineRun, candidateRun, base, runsDir,
    jsonPath: join(runsDir, `${runId}.json`), mdPath: join(runsDir, `${runId}.md`) };
}

function recordExperimentReport(workspace: string, agentId: string, report: ExperimentReport): void {
  appendTransparencyEntry({ workspace, type: "EXPERIMENT_RECORDED", agentId,
    artifact: { kind: "policy", sha256: report.reportJsonSha256, id: report.runId } });
}

type ExperimentOutputState = { bytes: Buffer; mode: number } | null;
function experimentOutputState(file: string): ExperimentOutputState {
  try { return { bytes: readFileSync(file), mode: statSync(file).mode & 0o777 }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
function experimentOutputMatches(file: string, before: ExperimentOutputState): boolean {
  const current = experimentOutputState(file);
  return before === null ? current === null : current !== null && current.mode === before.mode && before.bytes.equals(current.bytes);
}
function experimentReportInputs(workspace: string, prepared: ReturnType<typeof prepareExperimentReport>, actualLedger?: Ledger): string {
  try {
    const { agentId, experiment, baselineRun, candidateRun } = prepared, config = experiment.experiment;
    const files = [experimentFilePath(workspace, agentId, config.experimentId)];
    if (config.baselineConfig.path) files.push(config.baselineConfig.path);
    if (config.candidateConfig?.path) files.push(config.candidateConfig.path, `${config.candidateConfig.path}.sig`);
    for (const id of new Set([baselineRun.agentId, candidateRun.agentId])) {
      const root = join(getAgentPaths(workspace, id).rootDir, "casebooks", config.casebookId), file = join(root, "casebook.yaml");
      const book = loadCasebook(workspace, config.casebookId, id);
      files.push(file, `${file}.sig`);
      for (const caseId of book.casebook.caseIds) { const path = join(root, "cases", `${caseId}.json`); files.push(path, `${path}.sig`); }
    }
    const ledger = actualLedger ?? openLedger(workspace);
    try {
      const windows = [baselineRun, candidateRun].map(run => ({ agentId: run.agentId, startedTs: run.startedTs, endedTs: run.endedTs,
        evidence: ledger.getEventsBetween(run.startedTs, run.endedTs).filter(event => {
          try { return (JSON.parse(event.meta_json).agentId ?? "default") === run.agentId; } catch { return false; }
        }) }));
      return canonicalize({ files: [...new Set(files)].sort().map(file => [file, readFileSync(file).toString("base64")]), windows });
    } finally { if (actualLedger === undefined) ledger.close(); }
  } catch { throw new Error("experiment report inputs could not be read"); }
}
function assertExperimentSourcesCurrent(workspace: string, prepared: ReturnType<typeof prepareExperimentReport>, actualLedger?: Ledger): void {
  const candidate = prepared.experiment.experiment.candidateConfig;
  if (candidate?.path) {
    const admission = verifySignedCandidateFile(workspace, candidate.path);
    if (!admission.valid || admission.digestSha256 !== candidate.digestSha256) throw new Error("experiment candidate admission changed while signing");
  }
  try {
    for (const run of [prepared.baselineRun, prepared.candidateRun]) assertCasebookRunCurrent({
      workspace, agentId: run.agentId, casebookId: run.casebookId, mode: run.mode
    }, run, actualLedger);
  } catch { throw new Error("experiment casebook inputs changed while signing"); }
}

class ExperimentReportPublicationError extends Error {
  readonly code = "EXPERIMENT_REPORT_PUBLICATION_INCOMPLETE";
  readonly entryHash: string | null;
  readonly pendingRecorded: boolean | null;
  constructor(readonly publishedFiles: readonly string[], cause: unknown,
    readonly phase: "prepare" | "sign" | "members" | "log" | "close" = "members", readonly attemptedFile: string | null = null,
    completedEntryHash: string | null = null, readonly closeCause?: unknown) {
    super("Experiment report publication is incomplete; acknowledged files are retained", { cause }); this.name = "ExperimentReportPublicationError";
    this.entryHash = cause instanceof TransparencyMerkleLagError || cause instanceof ExperimentReportPublicationError ? cause.entryHash : completedEntryHash;
    this.pendingRecorded = cause instanceof TransparencyMerkleLagError || cause instanceof ExperimentReportPublicationError ? cause.pendingRecorded : null;
  }
}

export function runExperiment(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  mode: "supervise" | "sandbox";
  /**
   * Evidence window covering the candidate configuration's own run
   * (e.g. "7d"). Required: without it there is nothing real to compare.
   */
  candidateWindow?: string;
  /** Agent id the candidate ran under, when it differs from the baseline. */
  candidateAgentId?: string;
  /** Bound trials (both or neither): see prepareExperimentReport. */
  baselineTrialId?: string;
  candidateTrialId?: string;
}): { report: ExperimentReport; jsonPath: string; mdPath: string } {
  const prepared = prepareExperimentReport(params), { agentId, base, runsDir, jsonPath, mdPath } = prepared;
  const reportJsonSha256 = sha256Hex(canonicalize(base));
  const report: ExperimentReport = { ...base, reportJsonSha256,
    reportSealSig: signHexDigest(reportJsonSha256, getSigningKey(params.workspace, "artifact-seal")) };
  ensureDir(runsDir);
  writeFileAtomic(jsonPath, JSON.stringify(report, null, 2), 0o644);
  writeFileAtomic(mdPath, toMarkdown(report), 0o644);
  recordExperimentReport(params.workspace, agentId, report);
  return { report, jsonPath, mdPath };
}

/** Maintained async producer; raw artifact-seal report, then the actual awaitable workspace transparency append. */
export async function runExperimentAsync(params: Parameters<typeof runExperiment>[0], options: { beforePublish?: () => void } = {}): Promise<ReturnType<typeof runExperiment>> {
  const input = { workspace: params.workspace, agentId: params.agentId, experimentId: params.experimentId, mode: params.mode,
    candidateWindow: params.candidateWindow, candidateAgentId: params.candidateAgentId,
    baselineTrialId: params.baselineTrialId, candidateTrialId: params.candidateTrialId }, beforePublish = options.beforePublish;
  beforePublish?.();
  // All original authorities precede the first await. Log policy does not choose or replace the raw report purpose.
  const captured = capturePurposePublication(input.workspace, "artifact-seal");
  const originalArtifact = captureRunHashAuthority(input.workspace, false);
  const logSigners = [describePolicySigner(input.workspace, "TRANSPARENCY_ROOT"), describePolicySigner(input.workspace, "MERKLE_ROOT")];
  const logPolicy = JSON.stringify(loadTrustConfig(input.workspace)), prepared = prepareExperimentReport(input);
  const evidencePath = join(input.workspace, ".amc", "evidence.sqlite"), evidenceFile = statSync(evidencePath);
  const evidence = openLedger(input.workspace, { readonly: true }), publishedFiles: string[] = [];
  let phase: "prepare" | "sign" | "members" | "log" = "prepare", attemptedFile: string | null = null, entryHash: string | null = null;
  let failed = false, failure: unknown;
  try {
    const assertEvidenceFileCurrent = () => {
      const current = statSync(evidencePath);
      if (current.dev !== evidenceFile.dev || current.ino !== evidenceFile.ino) throw new Error("experiment evidence store changed while signing");
    };
    assertEvidenceFileCurrent();
    assertExperimentSourcesCurrent(input.workspace, prepared, evidence);
    const source = experimentReportInputs(input.workspace, prepared, evidence);
    const locked = <T>(operation: () => T): T => withControlFileLock({ root: prepared.runsDir, name: "experiment-report", operation });
    const destinations = locked(() => ({ json: experimentOutputState(prepared.jsonPath), markdown: experimentOutputState(prepared.mdPath) }));
    const reportJsonSha256 = sha256Hex(canonicalize(prepared.base));
    const assertUsedInputsCurrent = () => {
      beforePublish?.(); assertEvidenceFileCurrent();
      if (experimentReportInputs(input.workspace, prepared, evidence) !== source) throw new Error("experiment report inputs changed while signing");
      assertExperimentSourcesCurrent(input.workspace, prepared, evidence);
    };
    const assertOriginalPreparingAuthority = () => {
      originalArtifact();
      for (const descriptor of logSigners) assertPolicySignerCurrent(input.workspace, descriptor);
      if (JSON.stringify(loadTrustConfig(input.workspace)) !== logPolicy) throw new Error("experiment log signing policy changed while signing");
    };
    const beforeSign = () => locked(() => {
      assertUsedInputsCurrent(); assertOriginalPreparingAuthority();
      if (!experimentOutputMatches(prepared.jsonPath, destinations.json) || !experimentOutputMatches(prepared.mdPath, destinations.markdown))
        throw new Error("experiment report outputs changed while signing");
    });
    phase = "sign";
    const signed = await signWithPurposeKey(input.workspace, "artifact-seal", Buffer.from(reportJsonSha256, "hex"), { beforeSign });
    // Do not let the inherited file getter reopen an explicitly locked vault through an environment passphrase.
    const assertFileVaultCurrent = () => {
      if (signed.provider === "file" && !vaultStatus(input.workspace).unlocked)
        throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup.");
    };
    assertFileVaultCurrent(); phase = "members";
    const report: ExperimentReport = { ...prepared.base, reportJsonSha256, reportSealSig: signed.signature.toString("base64") };
    const json = JSON.stringify(report, null, 2), markdown = toMarkdown(report);
    const assertOriginalAuthority = () => {
      assertFileVaultCurrent(); assertOriginalPreparingAuthority(); assertPurposePublicationCurrent(input.workspace, captured, signed);
    };
    locked(() => {
      assertUsedInputsCurrent(); assertOriginalAuthority();
      if (!experimentOutputMatches(prepared.jsonPath, destinations.json) || !experimentOutputMatches(prepared.mdPath, destinations.markdown))
        throw new Error("experiment report outputs changed while signing");
      try {
        attemptedFile = prepared.jsonPath; writeFileAtomic(prepared.jsonPath, json, 0o644); publishedFiles.push(prepared.jsonPath);
        attemptedFile = prepared.mdPath; writeFileAtomic(prepared.mdPath, markdown, 0o644); publishedFiles.push(prepared.mdPath);
      } catch (error) { throw new ExperimentReportPublicationError(Object.freeze([...publishedFiles]), error, "members", attemptedFile); }
    });
    phase = "log"; attemptedFile = null;
    const assertPublishedCurrent = () => {
      assertUsedInputsCurrent(); assertOriginalAuthority();
      if (!experimentOutputMatches(prepared.jsonPath, { bytes: Buffer.from(json), mode: 0o644 })
        || !experimentOutputMatches(prepared.mdPath, { bytes: Buffer.from(markdown), mode: 0o644 }))
        throw new Error("published experiment report changed before transparency publication");
    };
    try {
      // Refuse earlier-operation drift before the log helper selects its own actual signing metadata.
      locked(assertPublishedCurrent);
      entryHash = (await appendTransparencyEntryAsync({ workspace: input.workspace, type: "EXPERIMENT_RECORDED", agentId: prepared.agentId,
        artifact: { kind: "policy", sha256: reportJsonSha256, id: report.runId } }, { beforeCommit: () => {
        // Common log -> report file lock. Reuse the owned readonly handle; no open/init/Sign or transaction here.
        locked(assertPublishedCurrent);
      } })).hash;
    } catch (error) { throw new ExperimentReportPublicationError(Object.freeze([...publishedFiles]), error, "log", null, entryHash); }
    return { report, jsonPath: prepared.jsonPath, mdPath: prepared.mdPath };
  } catch (error) { failed = true; failure = error; throw error; }
  finally {
    try { evidence.close(); }
    catch (closeError) {
      // oxlint-disable-next-line no-unsafe-finally -- A cleanup failure must surface, with any primary failure, instead of reporting success.
      if (failed) throw new ExperimentReportPublicationError(Object.freeze([...publishedFiles]), failure, phase, attemptedFile, entryHash, closeError);
      // oxlint-disable-next-line no-unsafe-finally -- A cleanup failure must surface, with any primary failure, instead of reporting success.
      throw new ExperimentReportPublicationError(Object.freeze([...publishedFiles]), closeError, "close", null, entryHash);
    }
  }
}

export function analyzeExperiment(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  outFile?: string;
  /** Verify and tabulate every stored run without executing casebooks, solvers or judges. */
  all?: boolean;
}): { report: ExperimentReport; reports: ExperimentReport[]; outFile: string | null } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const experiment = loadExperiment(params.workspace, agentId, params.experimentId);
  const reports = params.all
    ? listExperimentRunFiles(experimentRunsDir(params.workspace, agentId, params.experimentId)).map(file => readExperimentRun(params.workspace, agentId, experiment, file, false))
    : [latestRun(params.workspace, agentId, params.experimentId)];
  const report = reports.at(-1);
  if (!report) throw new Error(`no experiment runs for ${params.experimentId}`);
  if (params.outFile) {
    const history = [
      `# Experiment ${params.experimentId} history`, "",
      "Read-only analysis. Every listed report seal and run identity verified. Historical configurations remain separate; these rows do not authorize promotion.", "",
      "| Run | Candidate | Seal | Cases | Paired | Missing / excluded | Value unit | Warnings |",
      "| --- | --- | --- | ---: | ---: | ---: | --- | ---: |",
      ...reports.map(row => `| ${row.runId} | ${row.candidateConfigId} | verified | ${row.counts?.cases ?? row.cases.length} | ${row.counts?.pairedCases ?? "unavailable"} | ${row.counts?.excludedCases ?? "unavailable"} | ${row.valueUnit ?? "legacy implicit points"} | ${row.warnings?.length ?? "not recorded"} |`),
      "", ...reports.map(toMarkdown)
    ].join("\n");
    const output = params.outFile.endsWith(".json")
      ? JSON.stringify(params.all ? { experimentId: params.experimentId, reports } : report, null, 2)
      : params.all ? history : toMarkdown(report);
    writeFileAtomic(params.outFile, output, 0o644);
  }
  return { report, reports, outFile: params.outFile ?? null };
}

/**
 * Read-side admission for promotion: the report must be the bytes its writer sealed, about this experiment and this
 * casebook as it is now, for the candidate configuration that is admitted now. Problems are reasons; none is skipped.
 */
function experimentReportAdmissionProblems(workspace: string, agentId: string, experiment: ExperimentFile, report: ExperimentReport): string[] {
  const problems: string[] = [];
  try {
    const { reportJsonSha256, reportSealSig, ...payload } = report;
    if (typeof reportJsonSha256 !== "string" || sha256Hex(canonicalize(payload)) !== reportJsonSha256) problems.push("report hash does not match its content");
    else if (typeof reportSealSig !== "string" || !verifyHexDigestAny(reportJsonSha256, reportSealSig, runHashVerificationKeys(workspace))) {
      problems.push("report seal does not verify against the artifact-seal key history");
    }
  } catch {
    problems.push("report seal could not be verified");
  }
  const config = experiment.experiment;
  if (report.experimentId !== config.experimentId || report.agentId !== agentId || report.casebookId !== config.casebookId) {
    problems.push("report does not belong to this experiment, agent and casebook");
  }
  try {
    if (report.casebookSha256 !== undefined && report.casebookSha256 !== casebookContentSha256(workspace, config.casebookId, agentId)) {
      problems.push("casebook changed since the report was computed");
    }
  } catch {
    problems.push("casebook could not be read");
  }
  const candidate = config.candidateConfig;
  if (!candidate?.path || !candidate.digestSha256) problems.push("experiment has no admitted candidate configuration");
  else {
    const current = verifySignedCandidateFile(workspace, candidate.path);
    if (!current.valid || current.digestSha256 !== candidate.digestSha256) problems.push(`candidate configuration is no longer admitted: ${current.reason ?? "digest changed"}`);
    if (report.candidateConfigId !== candidate.id) problems.push("report was computed for a different candidate configuration");
  }
  return problems;
}

/**
 * Promotion decision for the latest run. The unchanged baseline is always eligible: `promote-candidate` only on a
 * verified report that passes every policy check; `keep-baseline` when the candidate fails policy; `abstain` when the
 * report cannot be admitted or the evidence cannot decide.
 */
export function gateExperiment(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  policyPath: string;
}): {
  pass: boolean;
  status: ExperimentGateStatus;
  decision: "promote-candidate" | "keep-baseline" | "abstain";
  reasons: string[];
  report: ExperimentReport;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const experiment = loadExperiment(params.workspace, agentId, params.experimentId);
  const report = latestRun(params.workspace, agentId, params.experimentId);
  const policy = experimentGateSchema.parse(JSON.parse(readUtf8(params.policyPath)) as unknown);
  const admission = experimentReportAdmissionProblems(params.workspace, agentId, experiment, report);
  const evaluated = evaluateExperimentGate(report, { ...policy, candidateConfigDigest: experiment.experiment.candidateConfig?.digestSha256 ?? undefined });
  const status: ExperimentGateStatus = admission.length > 0 ? "inconclusive" : evaluated.status;
  const reasons = [...admission.map((problem) => `report admission: ${problem}`), ...evaluated.reasons];
  const pass = status === "pass";
  const decision = pass ? "promote-candidate" : status === "fail" ? "keep-baseline" : "abstain";
  void dispatchIntegrationEvent({
    workspace: params.workspace,
    eventName: pass ? "EXPERIMENT_PASSED" : "EXPERIMENT_FAILED",
    agentId,
    summary: pass
      ? `Experiment ${params.experimentId} passed gate policy`
      : `Experiment ${params.experimentId} did not pass gate policy (${decision})`,
    details: {
      experimentId: params.experimentId,
      runId: report.runId,
      status,
      decision,
      reasons
    }
  }).catch(() => undefined);

  return {
    pass,
    status,
    decision,
    reasons,
    report
  };
}

export function listExperiments(params: { workspace: string; agentId?: string }): Array<{
  experimentId: string;
  name: string;
  casebookId: string;
  hasCandidate: boolean;
}> {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const root = experimentsRoot(params.workspace, agentId);
  if (!pathExists(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    // Only directories holding an experiment.yaml are experiments; governed optimizer runs share this root.
    .filter((entry) => entry.isDirectory() && pathExists(join(root, entry.name, "experiment.yaml")))
    .map((entry) => {
      const loaded = loadExperiment(params.workspace, agentId, entry.name);
      return {
        experimentId: loaded.experiment.experimentId,
        name: loaded.experiment.name,
        casebookId: loaded.experiment.casebookId,
        hasCandidate: !!loaded.experiment.candidateConfig
      };
    })
    .sort((a, b) => a.experimentId.localeCompare(b.experimentId));
}

/** The verified latest run, or null when the experiment has none; throws when the newest run is unreadable or refused. */
export function loadLatestExperimentRun(params: { workspace: string; agentId?: string; experimentId: string }): ExperimentReport | null {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  return latestRunOrNull(params.workspace, agentId, params.experimentId);
}
