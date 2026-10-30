import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OutcomeCategory, OutcomeReport } from "../types.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { openLedger } from "../ledger/ledger.js";
import { getSigningKey, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { parseWindowToMs } from "../utils/time.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { dispatchIntegrationEvent } from "../integrations/integrationDispatcher.js";
import { computeMetric, outcomeTrustTier, scoreCategory, type ComputedMetric } from "./outcomeScoring.js";
import { loadOutcomeContract, outcomeContractPath, verifyOutcomeContractSignature } from "./outcomeContractEngine.js";

import { assertPurposePublicationCurrent, capturePurposePublication } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import YAML from "yaml";
import { outcomeContractSchema } from "./outcomeContractSchema.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { captureOrgFiles, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { captureTransparencyAppendPublication, type TransparencyState } from "../transparency/workspacePublication.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { trustConfigPath, trustConfigSigPath } from "../trust/trustConfig.js";
import { highWaterPath } from "../keys/highWater.js";

export interface RunOutcomeReportInput {
  workspace: string;
  agentId?: string;
  window: string;
  outFile?: string;
}

function reportsDir(workspace: string, agentId: string): string {
  const paths = getAgentPaths(workspace, agentId);
  return join(paths.rootDir, "outcomes", "reports");
}

function parseAuditType(metaJson: string): string {
  try {
    const parsed = JSON.parse(metaJson) as Record<string, unknown>;
    if (typeof parsed.auditType === "string") {
      return parsed.auditType;
    }
  } catch {
    // ignore
  }
  return "";
}

function parseUsageTokens(metaJson: string): number {
  try {
    const parsed = JSON.parse(metaJson) as Record<string, unknown>;
    const usage = parsed.usage;
    if (!usage || typeof usage !== "object") {
      return 0;
    }
    const row = usage as Record<string, unknown>;
    const candidates = [row.total_tokens, row.totalTokens, row.input_tokens, row.inputTokens, row.output_tokens, row.outputTokens]
      .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : 0));
    const sum = candidates.reduce((acc, value) => acc + value, 0);
    return Number(sum.toFixed(6));
  } catch {
    return 0;
  }
}

function listOutcomeReportFiles(dir: string): string[] {
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(dir, file))
    .sort((a, b) => a.localeCompare(b));
}

function loadPreviousReport(workspace: string, agentId: string): OutcomeReport | null {
  const files = listOutcomeReportFiles(reportsDir(workspace, agentId));
  if (files.length === 0) {
    return null;
  }
  try {
    return JSON.parse(readUtf8(files[files.length - 1]!)) as OutcomeReport;
  } catch {
    return null;
  }
}

function baselineMetricValue(previous: OutcomeReport | null, metricId: string): number | null {
  if (!previous) {
    return null;
  }
  const row = previous.metrics.find((metric) => metric.metricId === metricId);
  return typeof row?.measuredValue === "number" ? row.measuredValue : null;
}

function metricToMarkdown(metric: OutcomeReport["metrics"][number]): string {
  const coverage = `obs=${metric.trustCoverage.observed.toFixed(2)} att=${metric.trustCoverage.attested.toFixed(2)} self=${metric.trustCoverage.selfReported.toFixed(2)}`;
  const reasons = metric.reasons.length > 0 ? metric.reasons.map((reason) => `  - ${reason}`).join("\n") : "  - none";
  const checklist = metric.checklist.length > 0 ? metric.checklist.map((item) => `  - ${item}`).join("\n") : "  - none";
  return [
    `### ${metric.metricId}`,
    `- Category: ${metric.category}`,
    `- Status: ${metric.status}`,
    `- Value: ${String(metric.measuredValue)}`,
    `- Sample size: ${metric.sampleSize}`,
    `- Trust coverage: ${coverage}`,
    `- Evidence refs: ${metric.evidenceRefs.join(", ") || "none"}`,
    `- Why:`,
    reasons,
    `- What would make this SATISFIED?`,
    checklist,
    ""
  ].join("\n");
}

export function renderOutcomeReportMarkdown(report: OutcomeReport): string {
  return [
    `# Outcome Report (${report.agentId})`,
    "",
    `- Report ID: ${report.reportId}`,
    `- Window: ${new Date(report.windowStartTs).toISOString()} .. ${new Date(report.windowEndTs).toISOString()}`,
    `- Contract: ${report.contractId ?? "none"} (${report.contractSignatureValid ? "signed" : "UNTRUSTED CONFIG"})`,
    `- ValueScore: ${report.valueScore.toFixed(2)}`,
    `- EconomicSignificanceIndex: ${report.economicSignificanceIndex.toFixed(2)}`,
    `- ValueRegressionRisk: ${report.valueRegressionRisk.toFixed(2)}`,
    "",
    "## Category Scores",
    ...Object.entries(report.categoryScores).map(([name, score]) => `- ${name}: ${Number(score).toFixed(2)}`),
    "",
    "## Metrics",
    ...report.metrics.map((metric) => metricToMarkdown(metric)),
    "## Non-claims",
    ...report.nonClaims.map((line) => `- ${line}`),
    ""
  ].join("\n");
}

function reportEvidenceStoreIdentity(workspace: string): string | null {
  const stat = lstatSync(join(workspace, ".amc", "evidence.sqlite"), { throwIfNoEntry: false });
  if (stat === undefined) return null;
  if (!stat.isFile()) throw new Error("Outcome report evidence store must be a regular file");
  return `${stat.dev}:${stat.ino}`;
}
function readReportEvidence(workspace: string, agentId: string, start: number, end: number, readonly = false) {
  const storeIdentity = readonly ? reportEvidenceStoreIdentity(workspace) : null;
  // The old writer initialized an empty store here. The async observation keeps that result without creating it.
  if (readonly && storeIdentity === null) return { outcomeEvents: [], evidence: [], storeIdentity };
  const ledger = openLedger(workspace, { readonly });
  let failed = false, failure: unknown;
  try {
    const data = { outcomeEvents: ledger.getOutcomeEventsBetween(start, end, agentId), evidence: ledger.getEventsBetween(start, end), storeIdentity };
    if (readonly && reportEvidenceStoreIdentity(workspace) !== storeIdentity) throw new Error("Outcome report evidence store changed while being read");
    return data;
  } catch (cause) { failed = true; failure = cause; throw cause; }
  finally {
    try { ledger.close(); }
    // oxlint-disable-next-line no-unsafe-finally -- A cleanup failure must surface, with any primary failure, instead of reporting success.
    catch (close) { if (readonly && failed) throw new AggregateError([failure, close], "Outcome report evidence observation and close failed"); throw close; }
  }
}

function reportFileInputs(workspace: string, agentId: string) {
  const contract = outcomeContractPath(workspace, agentId), dir = reportsDir(workspace, agentId), files = listOutcomeReportFiles(dir);
  const previous = files[files.length - 1] ?? null;
  const members = captureOrgFiles([contract, `${contract}.sig`, ...(previous === null ? [] : [previous])]).members
    .map(row => ({ ...row, bytes: row.bytes === null ? null : row.bytes.toString("base64") }));
  const bytes = (path: string) => members.find(row => row.path === path)?.bytes ?? null;
  return { contract, contractBytes: bytes(contract), signatureBytes: bytes(`${contract}.sig`), dir, previous,
    previousBytes: previous === null ? null : bytes(previous), members };
}
function capturedReportContractValid(workspace: string, files: ReturnType<typeof reportFileInputs>): boolean {
  if (files.contractBytes === null || files.signatureBytes === null) return false;
  try {
    const sig = JSON.parse(Buffer.from(files.signatureBytes, "base64").toString("utf8")) as { digestSha256: string; signature: string };
    const digest = sha256Hex(Buffer.from(files.contractBytes, "base64"));
    if (digest !== sig.digestSha256) return false;
    // Same current purpose/history admission as verifyOutcomeContractSignature; no new imported key path.
    assertKeysetComplete(workspace);
    return verifyHexDigestAny(digest, sig.signature, getPurposeKeyHistory(workspace, "config-signature"));
  } catch { return false; }
}
function capturedPreviousReport(files: ReturnType<typeof reportFileInputs>): OutcomeReport | null {
  try { return files.previousBytes === null ? null : JSON.parse(Buffer.from(files.previousBytes, "base64").toString("utf8")) as OutcomeReport; }
  catch { return null; }
}
function currentReportInputState(workspace: string, prepared: ReturnType<typeof prepareOutcomeReport>): string {
  const files = reportFileInputs(workspace, prepared.agentId);
  return canonicalize({ files, contractSignatureValid: capturedReportContractValid(workspace, files),
    data: readReportEvidence(workspace, prepared.agentId, prepared.base.windowStartTs, prepared.base.windowEndTs, true) });
}

function prepareOutcomeReport(input: RunOutcomeReportInput, snapshot = false) {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const files = snapshot ? reportFileInputs(input.workspace, agentId) : null;
  if (files !== null && files.contractBytes === null) throw new Error(`Outcome contract missing: ${files.contract}`);
  const contract = files === null ? loadOutcomeContract(input.workspace, agentId)
    : outcomeContractSchema.parse(YAML.parse(Buffer.from(files.contractBytes!, "base64").toString("utf8")) as unknown);
  const contractSig = files === null ? verifyOutcomeContractSignature(input.workspace, agentId)
    : { valid: capturedReportContractValid(input.workspace, files) };
  const windowMs = parseWindowToMs(input.window);
  const windowEndTs = Date.now();
  const windowStartTs = windowEndTs - windowMs;
  const previous = files === null ? loadPreviousReport(input.workspace, agentId) : capturedPreviousReport(files);

  const data = readReportEvidence(input.workspace, agentId, windowStartTs, windowEndTs, snapshot);
  let outcomeEvents = data.outcomeEvents;
  let llmTokens = 0;
  let blockedAudits: string[] = [];
  {
    const evidence = data.evidence;
    const scopedEvidence = evidence.filter((event) => {
      try {
        const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
        return (meta.agentId ?? "default") === agentId;
      } catch {
        return false;
      }
    });
    if (scopedEvidence.length > 0) {
      blockedAudits = scopedEvidence
        .filter((event) => event.event_type === "audit")
        .map((event) => parseAuditType(event.meta_json))
        .filter((auditType) => auditType.length > 0);
      llmTokens = scopedEvidence
        .filter((event) => event.event_type === "llm_response")
        .reduce((sum, event) => sum + parseUsageTokens(event.meta_json), 0);
    }

    if (outcomeEvents.length === 0) {
      outcomeEvents = scopedEvidence
        .filter((event) => event.event_type === "review")
        .map((event) => ({
          outcome_event_id: event.id,
          ts: event.ts,
          agent_id: agentId,
          work_order_id: null,
          category: "Emotional" as OutcomeCategory,
          metric_id: "feedback.rating",
          value: JSON.stringify(0),
          unit: null,
          trust_tier: "SELF_REPORTED" as const, // imported review rows: never observed by AMC (P0-18)
          source: "import" as const,
          meta_json: event.meta_json,
          prev_event_hash: "",
          event_hash: event.event_hash,
          signature: event.writer_sig,
          receipt_id: "",
          receipt: "",
          payload_sha256: event.payload_sha256
        }));
    }
  }

  const computed: ComputedMetric[] = contract.outcomeContract.metrics.map((metric) =>
    computeMetric({
      contract,
      metric,
      events: outcomeEvents,
      llmTokens,
      baselineMetricValue: baselineMetricValue(previous, metric.metricId),
      blockedAudits
    })
  );

  const metrics = computed.map((row) => row.metric);
  const categories: OutcomeCategory[] = ["Emotional", "Functional", "Economic", "Brand", "Lifetime"];
  const categoryScores = Object.fromEntries(
    categories.map((category) => [
      category,
      scoreCategory(computed.filter((row) => row.metric.category === category))
    ])
  ) as Record<OutcomeCategory, number>;

  const valueScore = Number(
    (
      categories.reduce((sum, category) => sum + (categoryScores[category] ?? 0), 0) /
      Math.max(1, categories.length)
    ).toFixed(3)
  );

  const economic = categoryScores.Economic ?? 0;
  const functional = categoryScores.Functional ?? 0;
  const costMetric = metrics.find((metric) => metric.metricId === "economic.cost_per_success");
  let efficiency = economic;
  if (typeof costMetric?.measuredValue === "number") {
    const baseline = baselineMetricValue(previous, "economic.cost_per_success");
    if (baseline !== null && baseline > 0) {
      const ratio = costMetric.measuredValue / baseline;
      efficiency = Number((Math.max(0, Math.min(100, (1.2 - ratio) * 100))).toFixed(3));
    }
  }
  const economicSignificanceIndex = Number(((economic + functional + efficiency) / 3).toFixed(3));

  let valueRegressionRisk = 0;
  if (previous) {
    const valueDrop = Math.max(0, previous.valueScore - valueScore);
    const econDrop = Math.max(0, previous.economicSignificanceIndex - economicSignificanceIndex);
    valueRegressionRisk = Number(Math.min(100, valueDrop * 2 + econDrop * 1.5).toFixed(3));
  }

  const totalOutcomeEvents = outcomeEvents.length;
  const observed = outcomeEvents.filter((event) => outcomeTrustTier(event) === "OBSERVED").length;
  const observedCoverageRatio = totalOutcomeEvents > 0 ? Number((observed / totalOutcomeEvents).toFixed(4)) : 0;

  const reportId = `out_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const base = {
    reportId,
    agentId,
    ts: Date.now(),
    windowStartTs,
    windowEndTs,
    contractId: sha256Hex(canonicalize(contract.outcomeContract)).slice(0, 24),
    contractSignatureValid: contractSig.valid,
    trustLabel: contractSig.valid ? "TRUSTED" : "UNTRUSTED CONFIG",
    valueScore,
    categoryScores,
    economicSignificanceIndex,
    valueRegressionRisk,
    observedCoverageRatio,
    metrics,
    nonClaims: [
      "This is not legal advice.",
      "Value signals are deterministic and evidence-backed only.",
      "This report cannot infer value controls that are not evidenced."
    ]
  } satisfies Omit<OutcomeReport, "reportJsonSha256" | "reportSealSig">;

  const outDir = reportsDir(input.workspace, agentId);
  const jsonPath = input.outFile ? join(input.workspace, input.outFile) : join(outDir, `${reportId}.json`);
  const mdPath = jsonPath.endsWith(".json") ? jsonPath.slice(0, -5) + ".md" : `${jsonPath}.md`;
  if (snapshot && canonicalize(reportFileInputs(input.workspace, agentId)) !== canonicalize(files)) {
    throw new Error("Outcome report inputs changed while calculation was prepared");
  }
  return { base, previous, agentId, jsonPath, mdPath, source: snapshot ? canonicalize({ files, data, contractSignatureValid: contractSig.valid }) : null };
}

function recordOutcomeReport(workspace: string, prepared: ReturnType<typeof prepareOutcomeReport>, report: OutcomeReport) {
  appendTransparencyEntry({ workspace, type: "OUTCOME_REPORT_RECORDED", agentId: prepared.agentId,
    artifact: { kind: "policy", sha256: report.reportJsonSha256, id: report.reportId } });
  return completeOutcomeReport(workspace, prepared, report);
}

/** Post-log notification/return only. Both actual producers call this outside their publication locks. */
function completeOutcomeReport(workspace: string, prepared: ReturnType<typeof prepareOutcomeReport>, report: OutcomeReport) {
  const { agentId, previous, jsonPath, mdPath } = prepared;
  const { reportId, valueRegressionRisk, valueScore, economicSignificanceIndex } = report;
  if (valueRegressionRisk > 0) {
    void dispatchIntegrationEvent({
      workspace,
      eventName: "VALUE_REGRESSION_DETECTED",
      agentId,
      summary: `Value regression detected for ${agentId}`,
      details: {
        reportId,
        valueScore,
        previousValueScore: previous?.valueScore ?? null,
        economicSignificanceIndex,
        previousEconomicSignificanceIndex: previous?.economicSignificanceIndex ?? null,
        valueRegressionRisk
      }
    }).catch(() => undefined);
  }

  return {
    report,
    jsonPath,
    mdPath
  };
}

export function runOutcomeReport(input: RunOutcomeReportInput): { report: OutcomeReport; jsonPath: string; mdPath: string } {
  const prepared = prepareOutcomeReport(input), reportJsonSha256 = sha256Hex(canonicalize(prepared.base));
  const report: OutcomeReport = { ...prepared.base, reportJsonSha256,
    reportSealSig: signHexDigest(reportJsonSha256, getSigningKey(input.workspace, "artifact-seal")) };
  ensureDir(reportsDir(input.workspace, prepared.agentId));
  writeFileAtomic(prepared.jsonPath, JSON.stringify(report, null, 2), 0o644);
  writeFileAtomic(prepared.mdPath, renderOutcomeReportMarkdown(report), 0o644);
  return recordOutcomeReport(input.workspace, prepared, report);
}

interface OutcomeReportPublicationProgress {
  readonly lockSetupAttempted: boolean;
  readonly lockEntered: boolean;
  readonly directoryAttempts: readonly string[];
  readonly directoryReturns: readonly string[];
  readonly attemptedFile: string | null;
  readonly returnedFiles: readonly string[];
  readonly entryHash: string | null;
}
class OutcomeReportPublicationError extends Error {
  readonly code = "OUTCOME_REPORT_PUBLICATION_INCOMPLETE";
  constructor(readonly publishedFiles: readonly string[], cause: unknown, readonly phase: "report-files" | "transparency" | "completion",
    readonly progress: OutcomeReportPublicationProgress) {
    super("Outcome report publication is incomplete; inspect acknowledged files and native progress before retrying", { cause });
    this.name = "OutcomeReportPublicationError";
  }
}
/** Finite actual input/authority/log/lock protection. This is not a general host output authorization policy. */
function reportProtectionPaths(workspace: string, prepared: ReturnType<typeof prepareOutcomeReport>, log: TransparencyState): string[] {
  const contract = outcomeContractPath(workspace, prepared.agentId), keyset = assertKeysetComplete(workspace);
  const previous = reportFileInputs(workspace, prepared.agentId).previous;
  return [...new Set([contract, `${contract}.sig`, ...(previous === null || previous === prepared.jsonPath ? [] : [previous]),
    ...["evidence.sqlite", "evidence.sqlite-wal", "evidence.sqlite-shm", "current-agent", "fleet.yaml", "fleet.yaml.sig",
      "amc.config.yaml", "amc.config.yaml.sig", "mode.json", "vault.amcvault", "vault.amcvault.meta.json",
      "keys/keyset.json", "keys/keyset.pending.json", "keys/revocations.signed.json", "keys/artifact-seal.pub", "keys/artifact-seal_history.json",
      "keys/config-signature.pub", "keys/config-signature_history.json", "keys/auditor_ed25519.pub", "keys/auditor_history.json"]
      .map(path => join(workspace, ".amc", path)), ...Object.keys(keyset?.files ?? {}).map(path => join(workspace, ".amc", path)),
    ...log.keys(), trustConfigPath(workspace), trustConfigSigPath(workspace), highWaterPath(),
    ...[".outcome-report.lock", ".outcome-report-locks"].map(path => join(dirname(prepared.jsonPath), path)),
    ...[".workspace-transparency.lock", ".workspace-transparency-locks"].map(path => join(workspace, ".amc", "transparency", path))])];
}
function assertReportOutputsSafe(outputs: ReturnType<typeof captureOrgFiles>, physical: readonly string[], protectedPaths: readonly string[]): void {
  for (const [index, output] of outputs.members.entries()) {
    if (physicalPathWithMissingSuffix(output.path) !== physical[index]) throw new Error("Outcome report output physical selection changed");
    for (const source of protectedPaths) {
      if (physicalPathWithMissingSuffix(source) === physical[index]) throw new Error("Outcome report output aliases an input, authority or later log destination");
      const stat = lstatSync(source, { throwIfNoEntry: false });
      if (output.identity !== null && stat !== undefined && output.identity === `${stat.dev}:${stat.ino}`)
        throw new Error("Outcome report output hardlinks an input, authority or later log destination");
    }
  }
  const [json, markdown] = outputs.members;
  if (physical[0] === physical[1] || (json!.identity !== null && json!.identity === markdown!.identity))
    throw new Error("Outcome report output members alias each other");
}

/** Awaitable artifact-purpose producer. Raw report bytes remain; successful logging precedes best-effort notification. */
export async function runOutcomeReportAsync(params: RunOutcomeReportInput, options: { beforePublish?: () => void } = {}): Promise<ReturnType<typeof runOutcomeReport>> {
  const input = { workspace: params.workspace, agentId: params.agentId, window: params.window, outFile: params.outFile }, beforePublish = options.beforePublish;
  const actor = () => { beforePublish?.(); if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize outcome report signing"); };
  actor();
  const captured = capturePurposePublication(input.workspace, "artifact-seal"), originalArtifact = captureRunHashAuthority(input.workspace, false);
  const logAuthority = captureWorkspaceLogAuthority(input.workspace, actor), logPublication = captureTransparencyAppendPublication(input.workspace);
  const originalLog = logPublication.state;
  const prepared = prepareOutcomeReport(input, true);
  const locked = <T>(operation: () => T): T => withControlFileLock({ root: dirname(prepared.jsonPath), name: "outcome-report", operation });
  let expectedOutputs = captureOrgFiles([prepared.jsonPath, prepared.mdPath]);
  const physical = expectedOutputs.members.map(row => physicalPathWithMissingSuffix(row.path));
  const protectedPaths = reportProtectionPaths(input.workspace, prepared, originalLog);
  const stable = () => {
    actor(); originalArtifact(); logAuthority.assertIntrinsicCurrent();
    assertReportOutputsSafe(expectedOutputs, physical, protectedPaths); assertOrgPairsCurrent(expectedOutputs);
  };
  const beforeSign = () => {
    stable();
    if (currentReportInputState(input.workspace, prepared) !== prepared.source) throw new Error("Outcome report inputs changed while signing was prepared");
    logPublication.assertCurrent(); assertOrgPairsCurrent(expectedOutputs);
  };
  beforeSign();
  const reportJsonSha256 = sha256Hex(canonicalize(prepared.base));
  const signed = await signWithPurposeKey(input.workspace, "artifact-seal", Buffer.from(reportJsonSha256, "hex"), { beforeSign });
  beforeSign(); assertPurposePublicationCurrent(input.workspace, captured, signed);
  const report: OutcomeReport = { ...prepared.base, reportJsonSha256, reportSealSig: signed.signature.toString("base64") };
  const writes = [{ path: prepared.jsonPath, bytes: Buffer.from(JSON.stringify(report, null, 2)) },
    { path: prepared.mdPath, bytes: Buffer.from(renderOutcomeReportMarkdown(report)) }];
  const publishedFiles: string[] = [], returnedFiles: string[] = [], directoryAttempts: string[] = [], directoryReturns: string[] = [];
  let lockSetupAttempted = false, lockEntered = false, attemptedFile: string | null = null, entryHash: string | null = null;
  const progress = (): OutcomeReportPublicationProgress => Object.freeze({ lockSetupAttempted, lockEntered,
    directoryAttempts: Object.freeze([...directoryAttempts]), directoryReturns: Object.freeze([...directoryReturns]), attemptedFile,
    returnedFiles: Object.freeze([...returnedFiles]), entryHash });
  const signedCurrent = () => { stable(); assertPurposePublicationCurrent(input.workspace, captured, signed); assertOrgPairsCurrent(expectedOutputs); };
  try {
    lockSetupAttempted = true;
    locked(() => {
      lockEntered = true; beforeSign(); assertPurposePublicationCurrent(input.workspace, captured, signed);
      const dir = reportsDir(input.workspace, prepared.agentId);
      directoryAttempts.push(dir); ensureDir(dir); directoryReturns.push(dir);
      for (const row of writes) {
        attemptedFile = null; signedCurrent();
        // Old scoring/latest-selector state ends before the first own output can intentionally replace it.
        if (publishedFiles.length === 0) beforeSign();
        signedCurrent(); attemptedFile = row.path;
        writeFileAtomic(row.path, row.bytes, 0o644); returnedFiles.push(row.path);
        const acknowledged = captureOrgFiles([row.path]).members[0]!;
        if (acknowledged.bytes === null || !acknowledged.bytes.equals(row.bytes) || acknowledged.mode !== 0o644)
          throw new Error("Outcome report returned file differs from exact prepared bytes or mode");
        expectedOutputs = { members: expectedOutputs.members.map(old => old.path === row.path ? acknowledged : old) };
        publishedFiles.push(row.path); attemptedFile = null;
      }
      signedCurrent();
    });
  } catch (cause) { throw new OutcomeReportPublicationError(Object.freeze([...publishedFiles]), cause, "report-files", progress()); }
  // Own report publication can change the old scoring/latest selector; retain only stable authority and acknowledged outputs now.
  let transparency: Awaited<ReturnType<typeof appendTransparencyEntryAttemptAsync>>;
  try {
    transparency = await appendTransparencyEntryAttemptAsync({ workspace: input.workspace, type: "OUTCOME_REPORT_RECORDED", agentId: prepared.agentId,
      artifact: { kind: "policy", sha256: reportJsonSha256, id: report.reportId } }, {
        beforeCommit: () => { signedCurrent(); logPublication.assertCurrent(); }, beforeMember: signedCurrent });
    entryHash = transparency.entry.hash;
    signedCurrent(); transparency.assertCurrent();
  } catch (cause) {
    if (cause instanceof TransparencyMerkleLagError) entryHash = cause.entryHash; // Only the actual acknowledged-line compatibility error proves this prefix.
    throw new OutcomeReportPublicationError(Object.freeze([...publishedFiles]), cause, "transparency", progress());
  }
  try {
    const result = completeOutcomeReport(input.workspace, prepared, report);
    signedCurrent(); transparency.assertCurrent();
    return result;
  } catch (cause) { throw new OutcomeReportPublicationError(Object.freeze([...publishedFiles]), cause, "completion", progress()); }
}

export function loadOutcomeReport(workspace: string, agentId: string, reportId: string | "latest"): OutcomeReport {
  const dir = reportsDir(workspace, agentId);
  const files = listOutcomeReportFiles(dir);
  if (files.length === 0) {
    throw new Error(`No outcome reports found for ${agentId}`);
  }
  const file =
    reportId === "latest"
      ? files[files.length - 1]!
      : join(dir, reportId.endsWith(".json") ? reportId : `${reportId}.json`);
  if (!pathExists(file)) {
    throw new Error(`Outcome report not found: ${file}`);
  }
  return JSON.parse(readUtf8(file)) as OutcomeReport;
}

export function fleetOutcomeReport(params: { workspace: string; window: string }): {
  ts: number;
  window: string;
  agents: Array<{
    agentId: string;
    valueScore: number;
    economicSignificanceIndex: number;
    trustLabel: "TRUSTED" | "UNTRUSTED CONFIG";
  }>;
} {
  const agentsRoot = join(params.workspace, ".amc", "agents");
  const agentIds = pathExists(agentsRoot)
    ? readdirSync(agentsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b))
    : ["default"];

  const rows = agentIds
    .map((agentId) => {
      try {
        const report = loadOutcomeReport(params.workspace, agentId, "latest");
        return {
          agentId,
          valueScore: report.valueScore,
          economicSignificanceIndex: report.economicSignificanceIndex,
          trustLabel: report.trustLabel
        };
      } catch {
        return null;
      }
    })
    .filter(
      (
        row
      ): row is {
        agentId: string;
        valueScore: number;
        economicSignificanceIndex: number;
        trustLabel: "TRUSTED" | "UNTRUSTED CONFIG";
      } => row !== null
    );

  return {
    ts: Date.now(),
    window: params.window,
    agents: rows
  };
}

export function diffOutcomeReports(reportA: OutcomeReport, reportB: OutcomeReport): {
  valueScoreDelta: number;
  economicSignificanceIndexDelta: number;
  categoryDeltas: Array<{ category: OutcomeCategory; delta: number }>;
  metricDeltas: Array<{ metricId: string; statusA: string; statusB: string; changed: boolean }>;
} {
  const categories: OutcomeCategory[] = ["Emotional", "Functional", "Economic", "Brand", "Lifetime"];
  return {
    valueScoreDelta: Number((reportB.valueScore - reportA.valueScore).toFixed(4)),
    economicSignificanceIndexDelta: Number((reportB.economicSignificanceIndex - reportA.economicSignificanceIndex).toFixed(4)),
    categoryDeltas: categories.map((category) => ({
      category,
      delta: Number(((reportB.categoryScores[category] ?? 0) - (reportA.categoryScores[category] ?? 0)).toFixed(4))
    })),
    metricDeltas: reportA.metrics.map((metric) => {
      const b = reportB.metrics.find((row) => row.metricId === metric.metricId);
      return {
        metricId: metric.metricId,
        statusA: metric.status,
        statusB: b?.status ?? "MISSING",
        changed: metric.status !== (b?.status ?? "MISSING")
      };
    })
  };
}
