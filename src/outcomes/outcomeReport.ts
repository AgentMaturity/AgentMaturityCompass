import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OutcomeCategory, OutcomeReport } from "../types.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { openLedger } from "../ledger/ledger.js";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
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

function readReportEvidence(workspace: string, agentId: string, start: number, end: number) {
  const ledger = openLedger(workspace);
  try { return { outcomeEvents: ledger.getOutcomeEventsBetween(start, end, agentId), evidence: ledger.getEventsBetween(start, end) }; }
  finally { ledger.close(); }
}

function optionalReportBytes(path: string): string | null { return pathExists(path) ? readFileSync(path).toString("base64") : null; }
function reportFileInputs(workspace: string, agentId: string) {
  const contract = outcomeContractPath(workspace, agentId), dir = reportsDir(workspace, agentId), files = listOutcomeReportFiles(dir);
  const previous = files[files.length - 1] ?? null;
  return { contract, contractBytes: optionalReportBytes(contract), signatureBytes: optionalReportBytes(`${contract}.sig`),
    dir, previous, previousBytes: previous === null ? null : optionalReportBytes(previous) };
}
function currentReportInputState(workspace: string, prepared: ReturnType<typeof prepareOutcomeReport>): string {
  return canonicalize({ files: reportFileInputs(workspace, prepared.agentId),
    data: readReportEvidence(workspace, prepared.agentId, prepared.base.windowStartTs, prepared.base.windowEndTs) });
}

function prepareOutcomeReport(input: RunOutcomeReportInput, snapshot = false) {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const files = snapshot ? reportFileInputs(input.workspace, agentId) : null;
  const contract = loadOutcomeContract(input.workspace, agentId);
  const contractSig = verifyOutcomeContractSignature(input.workspace, agentId);
  const windowMs = parseWindowToMs(input.window);
  const windowEndTs = Date.now();
  const windowStartTs = windowEndTs - windowMs;
  const previous = loadPreviousReport(input.workspace, agentId);

  const data = readReportEvidence(input.workspace, agentId, windowStartTs, windowEndTs);
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
  return { base, previous, agentId, jsonPath, mdPath, source: snapshot ? canonicalize({ files, data }) : null };
}

function recordOutcomeReport(workspace: string, prepared: ReturnType<typeof prepareOutcomeReport>, report: OutcomeReport) {
  const { agentId, previous, jsonPath, mdPath } = prepared;
  const { reportId, reportJsonSha256, valueRegressionRisk, valueScore, economicSignificanceIndex } = report;
  appendTransparencyEntry({
    workspace,
    type: "OUTCOME_REPORT_RECORDED",
    agentId,
    artifact: {
      kind: "policy",
      sha256: reportJsonSha256,
      id: reportId
    }
  });

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

class OutcomeReportPublicationError extends Error {
  readonly code = "OUTCOME_REPORT_PUBLICATION_INCOMPLETE";
  constructor(readonly publishedFiles: readonly string[], cause: unknown) {
    super("Outcome report publication is incomplete; published files are retained", { cause });
    this.name = "OutcomeReportPublicationError";
  }
}

/** Awaitable artifact-purpose producer. The report's legacy raw seal and synchronous transparency protocol are retained. */
export async function runOutcomeReportAsync(params: RunOutcomeReportInput, options: { beforePublish?: () => void } = {}): Promise<ReturnType<typeof runOutcomeReport>> {
  const input = { workspace: params.workspace, agentId: params.agentId, window: params.window, outFile: params.outFile }, beforePublish = options.beforePublish;
  const assertSigningAllowed = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize outcome report signing"); };
  beforePublish?.(); assertSigningAllowed();
  const captured = capturePurposePublication(input.workspace, "artifact-seal"), prepared = prepareOutcomeReport(input, true);
  const locked = <T>(operation: () => T): T => withControlFileLock({ root: dirname(prepared.jsonPath), name: "outcome-report", operation });
  const destinations = locked(() => ({ json: optionalReportBytes(prepared.jsonPath), markdown: optionalReportBytes(prepared.mdPath) }));
  const reportJsonSha256 = sha256Hex(canonicalize(prepared.base));
  const signed = await signWithPurposeKey(input.workspace, "artifact-seal", Buffer.from(reportJsonSha256, "hex"));
  const report: OutcomeReport = { ...prepared.base, reportJsonSha256, reportSealSig: signed.signature.toString("base64") };
  const publishedFiles: string[] = [];
  try {
    locked(() => {
      beforePublish?.(); assertSigningAllowed(); assertPurposePublicationCurrent(input.workspace, captured, signed);
      if (currentReportInputState(input.workspace, prepared) !== prepared.source) throw new Error("Outcome report inputs changed while signing was prepared");
      if (optionalReportBytes(prepared.jsonPath) !== destinations.json || optionalReportBytes(prepared.mdPath) !== destinations.markdown) {
        throw new Error("Outcome report destinations changed while signing was prepared");
      }
      ensureDir(reportsDir(input.workspace, prepared.agentId));
      writeFileAtomic(prepared.jsonPath, JSON.stringify(report, null, 2), 0o644); publishedFiles.push(prepared.jsonPath);
      writeFileAtomic(prepared.mdPath, renderOutcomeReportMarkdown(report), 0o644); publishedFiles.push(prepared.mdPath);
    });
  } catch (error) {
    if (publishedFiles.length > 0) throw new OutcomeReportPublicationError([...publishedFiles], error);
    throw error;
  }
  // The existing synchronous transparency call runs after the output lock is released; no automatic rollback is claimed.
  try { return recordOutcomeReport(input.workspace, prepared, report); }
  catch (error) { throw new OutcomeReportPublicationError([...publishedFiles], error); }
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
