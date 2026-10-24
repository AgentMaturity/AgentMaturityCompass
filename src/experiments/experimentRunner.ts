import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { ExperimentReport } from "../types.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { getSigningKey, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { appendTransparencyEntry, appendTransparencyEntryAsync } from "../transparency/logChain.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { runCasebook, assertCasebookRunCurrent } from "../casebooks/casebookRunner.js";
import { loadCasebook } from "../casebooks/casebookStore.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { vaultStatus } from "../vault/vault.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { experimentGateSchema, experimentSchema, type ExperimentFile, type ExperimentGatePolicy } from "./experimentSchema.js";
import { bootstrapDifferenceCI, deterministicSeed, effectSizeDifference } from "./stats.js";

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

function listRunFiles(workspace: string, agentId: string, experimentId: string): string[] {
  const dir = experimentRunsDir(workspace, agentId, experimentId);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name))
    .sort((a, b) => a.localeCompare(b));
}

function latestRun(workspace: string, agentId: string, experimentId: string): ExperimentReport {
  const files = listRunFiles(workspace, agentId, experimentId);
  if (files.length === 0) {
    throw new Error(`no experiment runs for ${experimentId}`);
  }
  return JSON.parse(readUtf8(files[files.length - 1]!)) as ExperimentReport;
}

function toMarkdown(report: ExperimentReport): string {
  const rows = report.cases
    .map(
      (row) =>
        `- ${row.caseId}: baselineSuccess=${row.baselineSuccess} candidateSuccess=${row.candidateSuccess} baselineValue=${row.baselineValuePoints.toFixed(
          2
        )} candidateValue=${row.candidateValuePoints.toFixed(2)} baselineCost=${row.baselineCost.toFixed(4)} candidateCost=${row.candidateCost.toFixed(
          4
        )}`
    )
    .join("\n");
  return [
    `# Experiment ${report.experimentId}`,
    "",
    `- Agent: ${report.agentId}`,
    `- Mode: ${report.mode}`,
    `- Casebook: ${report.casebookId}`,
    `- Baseline success rate: ${report.baselineSuccessRate.toFixed(4)}`,
    `- Candidate success rate: ${report.candidateSuccessRate.toFixed(4)}`,
    `- Uplift success rate: ${report.upliftSuccessRate.toFixed(4)}`,
    `- Baseline value avg: ${report.baselineValuePointsAvg.toFixed(4)}`,
    `- Candidate value avg: ${report.candidateValuePointsAvg.toFixed(4)}`,
    `- Uplift value points: ${report.upliftValuePoints.toFixed(4)}`,
    `- Baseline cost/success: ${report.baselineCostPerSuccess.toFixed(6)}`,
    `- Candidate cost/success: ${report.candidateCostPerSuccess.toFixed(6)}`,
    `- 95% CI: [${report.confidenceInterval95[0].toFixed(6)}, ${report.confidenceInterval95[1].toFixed(6)}]`,
    `- Effect size: ${report.effectSize.toFixed(6)}`,
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
  const experiment = loadExperiment(params.workspace, agentId, params.experimentId);
  if (params.config === "current") {
    experiment.experiment.baselineConfig = {
      id: "current",
      kind: "current",
      path: null
    };
  } else {
    experiment.experiment.baselineConfig = {
      id: sha256Hex(readFileSync(params.config.path)).slice(0, 12),
      kind: "file",
      path: params.config.path
    };
  }
  return {
    path: saveExperiment(params.workspace, agentId, experiment)
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
  const experiment = loadExperiment(params.workspace, agentId, params.experimentId);
  experiment.experiment.candidateConfig = {
    id: verify.digestSha256.slice(0, 12),
    kind: "overlay-file",
    path: params.candidateFile,
    digestSha256: verify.digestSha256,
    signatureValid: true
  };
  return {
    path: saveExperiment(params.workspace, agentId, experiment),
    digestSha256: verify.digestSha256
  };
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
}) {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const experiment = loadExperiment(params.workspace, agentId, params.experimentId);
  if (!experiment.experiment.candidateConfig || !experiment.experiment.candidateConfig.signatureValid) {
    throw new Error("candidate config is missing or unsigned");
  }

  const baselineRun = runCasebook({
    workspace: params.workspace,
    agentId,
    casebookId: experiment.experiment.casebookId,
    mode: params.mode,
    window: "14d"
  });

  if (!params.candidateWindow) {
    throw new Error(
      "Experiment requires a candidate evidence window (--candidate-window). " +
        "AMC cannot execute a candidate configuration itself, so the candidate must " +
        "have run and produced evidence; synthesizing its outcomes would fabricate the comparison."
    );
  }

  // The candidate side is a second real casebook run over the candidate's own
  // evidence window.
  const candidateRun = runCasebook({
    workspace: params.workspace,
    agentId: params.candidateAgentId ?? agentId,
    casebookId: experiment.experiment.casebookId,
    mode: params.mode,
    window: params.candidateWindow
  });
  const candidateById = new Map(candidateRun.results.map((row) => [row.caseId, row]));

  const cases = baselineRun.results.map((row) => {
    const candidate = candidateById.get(row.caseId);
    if (!candidate) {
      throw new Error(
        `Candidate run has no result for case '${row.caseId}'. ` +
          "Both sides of an experiment must cover the same cases."
      );
    }
    const candidateSuccess = candidate.success;
    const baselineValuePoints = row.valuePoints;
    const candidateValuePoints = Number(candidate.valuePoints.toFixed(4));
    const baselineCost = row.costTokens;
    const candidateCost = Number(candidate.costTokens.toFixed(6));
    return {
      caseId: row.caseId,
      title: row.title,
      baselineSuccess: row.success,
      candidateSuccess,
      baselineValuePoints,
      candidateValuePoints,
      baselineCost,
      candidateCost,
      reasons: row.reasons
    };
  });

  const baselineSuccessRate =
    cases.length > 0 ? cases.filter((row) => row.baselineSuccess).length / cases.length : 0;
  const candidateSuccessRate =
    cases.length > 0 ? cases.filter((row) => row.candidateSuccess).length / cases.length : 0;
  const upliftSuccessRate = candidateSuccessRate - baselineSuccessRate;

  const baselineValues = cases.map((row) => row.baselineValuePoints);
  const candidateValues = cases.map((row) => row.candidateValuePoints);
  const baselineValuePointsAvg =
    baselineValues.length > 0
      ? baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
      : 0;
  const candidateValuePointsAvg =
    candidateValues.length > 0
      ? candidateValues.reduce((sum, value) => sum + value, 0) / candidateValues.length
      : 0;
  const upliftValuePoints = candidateValuePointsAvg - baselineValuePointsAvg;

  const baselineCostSum = cases.reduce((sum, row) => sum + row.baselineCost, 0);
  const candidateCostSum = cases.reduce((sum, row) => sum + row.candidateCost, 0);
  const baselineSuccessCount = Math.max(1, cases.filter((row) => row.baselineSuccess).length);
  const candidateSuccessCount = Math.max(1, cases.filter((row) => row.candidateSuccess).length);
  const baselineCostPerSuccess = baselineCostSum / baselineSuccessCount;
  const candidateCostPerSuccess = candidateCostSum / candidateSuccessCount;

  // Bootstrap resampling is seeded deterministically so the CI is reproducible
  // for a given experiment; the underlying values are real measurements.
  const bootstrapSeed = deterministicSeed([
    experiment.experiment.experimentId,
    experiment.experiment.candidateConfig.digestSha256 ?? "candidate"
  ]);
  const confidenceInterval95 = bootstrapDifferenceCI({
    baseline: baselineValues,
    candidate: candidateValues,
    seed: bootstrapSeed
  });
  const effectSize = effectSizeDifference(baselineValues, candidateValues);

  const runId = `exp_run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const base = {
    experimentId: experiment.experiment.experimentId,
    agentId,
    ts: Date.now(),
    mode: params.mode,
    casebookId: experiment.experiment.casebookId,
    baselineConfigId: experiment.experiment.baselineConfig.id,
    candidateConfigId: experiment.experiment.candidateConfig.id,
    runId,
    cases,
    baselineSuccessRate: Number(baselineSuccessRate.toFixed(6)),
    candidateSuccessRate: Number(candidateSuccessRate.toFixed(6)),
    upliftSuccessRate: Number(upliftSuccessRate.toFixed(6)),
    baselineValuePointsAvg: Number(baselineValuePointsAvg.toFixed(6)),
    candidateValuePointsAvg: Number(candidateValuePointsAvg.toFixed(6)),
    upliftValuePoints: Number(upliftValuePoints.toFixed(6)),
    baselineCostPerSuccess: Number(baselineCostPerSuccess.toFixed(6)),
    candidateCostPerSuccess: Number(candidateCostPerSuccess.toFixed(6)),
    confidenceInterval95,
    effectSize: Number(effectSize.toFixed(6))
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
    candidateWindow: params.candidateWindow, candidateAgentId: params.candidateAgentId }, beforePublish = options.beforePublish;
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
      if (failed) throw new ExperimentReportPublicationError(Object.freeze([...publishedFiles]), failure, phase, attemptedFile, entryHash, closeError);
      throw new ExperimentReportPublicationError(Object.freeze([...publishedFiles]), closeError, "close", null, entryHash);
    }
  }
}

export function analyzeExperiment(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  outFile?: string;
}): { report: ExperimentReport; outFile: string | null } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const report = latestRun(params.workspace, agentId, params.experimentId);
  if (!params.outFile) {
    return {
      report,
      outFile: null
    };
  }
  const output = params.outFile.endsWith(".json") ? JSON.stringify(report, null, 2) : toMarkdown(report);
  writeFileAtomic(params.outFile, output, 0o644);
  return {
    report,
    outFile: params.outFile
  };
}

export function gateExperiment(params: {
  workspace: string;
  agentId?: string;
  experimentId: string;
  policyPath: string;
}): {
  pass: boolean;
  reasons: string[];
  report: ExperimentReport;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const report = latestRun(params.workspace, agentId, params.experimentId);
  const policy = experimentGateSchema.parse(JSON.parse(readUtf8(params.policyPath)) as unknown);
  const reasons: string[] = [];

  if (report.upliftSuccessRate < policy.minUpliftSuccessRate) {
    reasons.push(`upliftSuccessRate ${report.upliftSuccessRate.toFixed(4)} is below ${policy.minUpliftSuccessRate.toFixed(4)}`);
  }
  if (report.upliftValuePoints < policy.minUpliftValuePoints) {
    reasons.push(`upliftValuePoints ${report.upliftValuePoints.toFixed(4)} is below ${policy.minUpliftValuePoints.toFixed(4)}`);
  }
  if (policy.maxCostIncreaseRatio && report.baselineCostPerSuccess > 0) {
    const ratio = report.candidateCostPerSuccess / report.baselineCostPerSuccess;
    if (ratio > policy.maxCostIncreaseRatio) {
      reasons.push(`cost increase ratio ${ratio.toFixed(4)} exceeds ${policy.maxCostIncreaseRatio.toFixed(4)}`);
    }
  }
  if (policy.denyIfRegression && (report.upliftSuccessRate < 0 || report.upliftValuePoints < 0)) {
    reasons.push("regression detected while denyIfRegression=true");
  }

  const pass = reasons.length === 0;
  void dispatchIntegrationEvent({
    workspace: params.workspace,
    eventName: pass ? "EXPERIMENT_PASSED" : "EXPERIMENT_FAILED",
    agentId,
    summary: pass
      ? `Experiment ${params.experimentId} passed gate policy`
      : `Experiment ${params.experimentId} failed gate policy`,
    details: {
      experimentId: params.experimentId,
      runId: report.runId,
      reasons
    }
  }).catch(() => undefined);

  return {
    pass,
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
    .filter((entry) => entry.isDirectory())
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

export function loadLatestExperimentRun(params: { workspace: string; agentId?: string; experimentId: string }): ExperimentReport {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  return latestRun(params.workspace, agentId, params.experimentId);
}
