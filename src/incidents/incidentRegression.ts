import { signSerializedPayloadWithAuditorAsync } from "../org/orgSigner.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { nearestRank } from "../experiments/stats.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type IncidentRegressionReceiptStatus = "ready_to_close" | "fail_closed";
export type IncidentRegressionValidationStatus = "passed" | "failed" | "not_run" | "skipped" | "pending";
export type IncidentRegressionReceiptSignature = Awaited<ReturnType<typeof signSerializedPayloadWithAuditorAsync>>;
export interface IncidentRegressionReceiptVerification {
  valid: boolean;
  failClosedReasons: string[];
}
export type IncidentRegressionAlertSeverity = "warning" | "critical";

export interface IncidentRegressionTraceRow {
  incidentId: string;
  traceId: string;
  agentId: string;
  timestamp: string;
  failureMode: string;
  riskEvent: string;
  promptBoundary: string;
  toolBoundary: string;
  latencyMs: number;
  costUsd: number;
  remediationState: string;
  evidenceRefs: string[];
}

export interface IncidentRegressionTraceIndexEntry {
  incidentId: string;
  traceId: string;
  agentId: string;
  timestamp: string;
  failureMode: string;
  riskEvent: string;
  promptToolBoundary: string;
  /** Retained separately so verification can distinguish missing boundaries from literal labels. */
  promptBoundary?: string;
  toolBoundary?: string;
  latencyMs: number;
  costUsd: number;
  remediationState: string;
  evidenceRefs: string[];
  searchText: string;
  rowHash: string;
}

export interface IncidentRegressionTraceIndex {
  entries: IncidentRegressionTraceIndexEntry[];
  searchFields: [
    "incidentId",
    "traceId",
    "failureMode",
    "riskEvent",
    "promptToolBoundary",
    "remediationState"
  ];
}

export interface IncidentRegressionFailureCluster {
  clusterId: string;
  failureMode: string;
  count: number;
  incidentIds: string[];
  traceIds: string[];
  riskEvents: string[];
  promptToolBoundaries: string[];
  remediationStates: string[];
  evidenceRefs: string[];
}

export interface IncidentRegressionLiveTrends {
  incidentCount: number;
  traceCount: number;
  totalCostUsd: number;
  p95LatencyMs: number;
  openRemediationCount: number;
  failureModeCounts: Record<string, number>;
  riskEventCounts: Record<string, number>;
  remediationStateCounts: Record<string, number>;
}

export interface IncidentRegressionGeneratedTest {
  testId: string;
  sourceIncidentId: string;
  sourceTraceId: string;
  name: string;
  assertion: string;
  expectedOutcome: string;
  evidenceRefs: string[];
}

export interface IncidentRegressionGeneratedTestReceipt extends IncidentRegressionGeneratedTest {
  testHash: string;
}

export interface IncidentRegressionValidationRun {
  runId: string;
  testId: string;
  status: IncidentRegressionValidationStatus;
  /** Legacy unbound runs remain readable but cannot authorize incident closure. */
  phase?: "pre_fix" | "post_fix";
  buildRef?: string;
  validatedAt: string;
  evidenceRefs: string[];
}

export interface IncidentRegressionValidationRunReceipt extends IncidentRegressionValidationRun {
  runHash: string;
}

export interface IncidentRegressionClosureStatus {
  status: "ready_to_close" | "blocked";
  readyIncidentIds: string[];
  blockedIncidentIds: string[];
  generatedTestIds: string[];
  validatedTestIds: string[];
  missingValidationTestIds: string[];
  closureEvidenceRefs: string[];
}

export interface IncidentRegressionWatchAlert {
  alertId: string;
  source: "incident-regression";
  status: IncidentRegressionReceiptStatus;
  severity: IncidentRegressionAlertSeverity;
  message: string;
  evidenceRefs: string[];
  failClosedReasons: string[];
}

export interface BuildIncidentRegressionReceiptInput {
  traces: IncidentRegressionTraceRow[];
  generatedTests: IncidentRegressionGeneratedTest[];
  validationRuns: IncidentRegressionValidationRun[];
  closureEvidenceRefs: string[];
  generatedAt?: string;
  sourceRefs?: string[];
}

export interface IncidentRegressionReceipt {
  schemaVersion: "2026-06-26";
  receiptId: string;
  generatedAt: string;
  surfaceBindings: ["Watch", "Studio", "API"];
  sourceRefs: string[];
  traceIndex: IncidentRegressionTraceIndex;
  failureClusters: IncidentRegressionFailureCluster[];
  liveTrends: IncidentRegressionLiveTrends;
  generatedTests: IncidentRegressionGeneratedTestReceipt[];
  validationRuns: IncidentRegressionValidationRunReceipt[];
  closureStatus: IncidentRegressionClosureStatus;
  status: IncidentRegressionReceiptStatus;
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
  signature?: IncidentRegressionReceiptSignature;
}

const SURFACE_BINDINGS = ["Watch", "Studio", "API"] as const;
const SEARCH_FIELDS = [
  "incidentId",
  "traceId",
  "failureMode",
  "riskEvent",
  "promptToolBoundary",
  "remediationState",
] as const;

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(nonEmpty).map((value) => value.trim()))].sort();
}

function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// Receipt percentiles filter invalid/negative observations and round experiments/stats.ts nearest rank.
function percentile(values: number[], p: number): number {
  return round(nearestRank(values.filter(finiteNonNegative), p));
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (!nonEmpty(value)) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function promptToolBoundary(row: IncidentRegressionTraceRow): string {
  const prompt = nonEmpty(row.promptBoundary) ? row.promptBoundary.trim() : "prompt-unknown";
  const tool = nonEmpty(row.toolBoundary) ? row.toolBoundary.trim() : "tool-unknown";
  return `${prompt}/${tool}`;
}

function entryHash(entry: Omit<IncidentRegressionTraceIndexEntry, "rowHash">): string {
  return sha256Hex(canonicalize(entry));
}

function generatedTestHash(test: IncidentRegressionGeneratedTest): string {
  return sha256Hex(canonicalize({
    testId: test.testId,
    sourceIncidentId: test.sourceIncidentId,
    sourceTraceId: test.sourceTraceId,
    name: test.name,
    assertion: test.assertion,
    expectedOutcome: test.expectedOutcome,
    evidenceRefs: unique(test.evidenceRefs),
  }));
}

function validationRunHash(run: IncidentRegressionValidationRun): string {
  return sha256Hex(canonicalize({
    runId: run.runId,
    testId: run.testId,
    status: run.status,
    phase: run.phase,
    buildRef: run.buildRef,
    validatedAt: run.validatedAt,
    evidenceRefs: unique(run.evidenceRefs),
  }));
}

function buildTraceIndex(traces: IncidentRegressionTraceRow[]): IncidentRegressionTraceIndex {
  const entries = traces
    .map((row): IncidentRegressionTraceIndexEntry => {
      const failureMode = row.failureMode.trim();
      const riskEvent = row.riskEvent.trim();
      const remediationState = row.remediationState.trim();
      const boundary = promptToolBoundary(row);
      const base = {
        incidentId: row.incidentId.trim(),
        traceId: row.traceId.trim(),
        agentId: row.agentId.trim(),
        timestamp: row.timestamp,
        failureMode,
        riskEvent,
        promptToolBoundary: boundary,
        promptBoundary: row.promptBoundary,
        toolBoundary: row.toolBoundary,
        latencyMs: round(row.latencyMs),
        costUsd: round(row.costUsd),
        remediationState,
        evidenceRefs: unique(row.evidenceRefs),
        searchText: [
          row.incidentId,
          row.traceId,
          failureMode,
          riskEvent,
          boundary,
          remediationState,
        ].join(" ").trim(),
      } satisfies Omit<IncidentRegressionTraceIndexEntry, "rowHash">;
      return {
        ...base,
        rowHash: entryHash(base),
      };
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.traceId.localeCompare(b.traceId));

  return {
    entries,
    searchFields: [...SEARCH_FIELDS],
  };
}

function buildFailureClusters(entries: IncidentRegressionTraceIndexEntry[]): IncidentRegressionFailureCluster[] {
  const groups = new Map<string, IncidentRegressionTraceIndexEntry[]>();
  for (const entry of entries) {
    if (!nonEmpty(entry.failureMode)) continue;
    groups.set(entry.failureMode, [...(groups.get(entry.failureMode) ?? []), entry]);
  }

  return [...groups.entries()]
    .map(([failureMode, rows]) => ({
      clusterId: `irfc_${sha256Hex(canonicalize({
        failureMode,
        traceIds: rows.map((row) => row.traceId).sort(),
      })).slice(0, 16)}`,
      failureMode,
      count: rows.length,
      incidentIds: unique(rows.map((row) => row.incidentId)),
      traceIds: unique(rows.map((row) => row.traceId)),
      riskEvents: unique(rows.map((row) => row.riskEvent)),
      promptToolBoundaries: unique(rows.map((row) => row.promptToolBoundary)),
      remediationStates: unique(rows.map((row) => row.remediationState)),
      evidenceRefs: unique(rows.flatMap((row) => row.evidenceRefs)),
    }))
    .sort((a, b) => b.count - a.count || a.failureMode.localeCompare(b.failureMode));
}

function buildLiveTrends(entries: IncidentRegressionTraceIndexEntry[]): IncidentRegressionLiveTrends {
  return {
    incidentCount: unique(entries.map((entry) => entry.incidentId)).length,
    traceCount: entries.length,
    totalCostUsd: round(entries.reduce((sum, entry) => sum + entry.costUsd, 0)),
    p95LatencyMs: percentile(entries.map((entry) => entry.latencyMs), 0.95),
    openRemediationCount: entries.filter((entry) => entry.remediationState !== "closed").length,
    failureModeCounts: countBy(entries.map((entry) => entry.failureMode)),
    riskEventCounts: countBy(entries.map((entry) => entry.riskEvent)),
    remediationStateCounts: countBy(entries.map((entry) => entry.remediationState)),
  };
}

function buildGeneratedTests(tests: IncidentRegressionGeneratedTest[]): IncidentRegressionGeneratedTestReceipt[] {
  return tests
    .map((test) => ({
      ...test,
      evidenceRefs: unique(test.evidenceRefs),
      testHash: generatedTestHash(test),
    }))
    .sort((a, b) => a.testId.localeCompare(b.testId));
}

function buildValidationRuns(runs: IncidentRegressionValidationRun[]): IncidentRegressionValidationRunReceipt[] {
  return runs
    .map((run) => ({
      ...run,
      evidenceRefs: unique(run.evidenceRefs),
      runHash: validationRunHash(run),
    }))
    .sort((a, b) => a.validatedAt.localeCompare(b.validatedAt) || a.runId.localeCompare(b.runId));
}

function traceReasons(traces: IncidentRegressionTraceRow[]): string[] {
  if (traces.length === 0) return ["incidentTraces:missing"];

  const reasons: string[] = [];
  const seenTraceIds = new Set<string>();
  for (const row of traces) {
    const traceRef = nonEmpty(row.traceId) ? row.traceId : "unknown";
    if (!nonEmpty(row.incidentId)) reasons.push(`${traceRef}:incidentId:missing`);
    if (!nonEmpty(row.traceId)) reasons.push("traceId:missing");
    if (seenTraceIds.has(row.traceId.trim())) reasons.push(`${traceRef}:traceId:duplicate`);
    seenTraceIds.add(row.traceId.trim());
    if (!nonEmpty(row.agentId)) reasons.push(`${traceRef}:agentId:missing`);
    if (!Number.isFinite(parseTime(row.timestamp))) reasons.push(`${traceRef}:timestamp:invalid`);
    if (!nonEmpty(row.failureMode)) reasons.push(`${traceRef}:failureMode:missing`);
    if (!nonEmpty(row.riskEvent)) reasons.push(`${traceRef}:riskEvent:missing`);
    if (!nonEmpty(row.promptBoundary)) reasons.push(`${traceRef}:promptBoundary:missing`);
    if (!nonEmpty(row.toolBoundary)) reasons.push(`${traceRef}:toolBoundary:missing`);
    if (!finiteNonNegative(row.latencyMs)) reasons.push(`${traceRef}:latencyMs:invalid`);
    if (!finiteNonNegative(row.costUsd)) reasons.push(`${traceRef}:costUsd:invalid`);
    if (!nonEmpty(row.remediationState)) reasons.push(`${traceRef}:remediationState:missing`);
    if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.filter(nonEmpty).length === 0) {
      reasons.push(`${traceRef}:evidenceRefs:missing`);
    }
  }
  return reasons;
}

function generatedTestReasons(
  traces: IncidentRegressionTraceIndexEntry[],
  tests: IncidentRegressionGeneratedTest[]
): string[] {
  if (tests.length === 0) return ["generatedRegressionTests:missing"];

  const traceIds = new Set(traces.map((entry) => entry.traceId));
  const incidentIds = new Set(traces.map((entry) => entry.incidentId));
  const seenTestIds = new Set<string>();
  const reasons: string[] = [];
  for (const incidentId of incidentIds) {
    if (!tests.some((test) => test.sourceIncidentId === incidentId)) {
      reasons.push(`incident:${incidentId}:generatedRegressionTests:missing`);
    }
  }
  for (const test of tests) {
    const testRef = nonEmpty(test.testId) ? test.testId : "unknown";
    if (!nonEmpty(test.testId)) reasons.push("testId:missing");
    if (seenTestIds.has(test.testId.trim())) reasons.push(`test:${testRef}:testId:duplicate`);
    seenTestIds.add(test.testId.trim());
    if (!nonEmpty(test.sourceIncidentId) || !incidentIds.has(test.sourceIncidentId)) {
      reasons.push(`test:${testRef}:sourceIncident:missing`);
    }
    if (!nonEmpty(test.sourceTraceId) || !traceIds.has(test.sourceTraceId)) {
      reasons.push(`test:${testRef}:sourceTrace:missing`);
    }
    const sourceTrace = traces.find((entry) => entry.traceId === test.sourceTraceId);
    if (sourceTrace && sourceTrace.incidentId !== test.sourceIncidentId) {
      reasons.push(`test:${testRef}:sourceIncident:mismatch`);
    }
    if (!nonEmpty(test.name)) reasons.push(`test:${testRef}:name:missing`);
    if (!nonEmpty(test.assertion)) reasons.push(`test:${testRef}:assertion:missing`);
    if (!nonEmpty(test.expectedOutcome)) reasons.push(`test:${testRef}:expectedOutcome:missing`);
    if (!Array.isArray(test.evidenceRefs) || test.evidenceRefs.filter(nonEmpty).length === 0) {
      reasons.push(`test:${testRef}:evidenceRefs:missing`);
    }
  }
  return reasons;
}

function validationPairReasons(testId: string, runs: IncidentRegressionValidationRun[]): string[] {
  const before = runs.filter((run) => run.testId === testId && run.phase === "pre_fix");
  const after = runs.filter((run) => run.testId === testId && run.phase === "post_fix");
  const reasons: string[] = [];
  for (const [phase, arms] of [["pre_fix", before], ["post_fix", after]] as const) {
    if (arms.length !== 1) {
      reasons.push(`test:${testId}:${phase}:${arms.length === 0 ? "missing_evidence" : "duplicate"}`);
    }
  }
  if (before.length !== 1 || after.length !== 1) return reasons;
  const pre = before[0]!;
  const post = after[0]!;
  if (pre.status !== "failed") reasons.push(`test:${testId}:pre_fix:notFailed`);
  if (post.status !== "passed") reasons.push(`test:${testId}:validation:notPassed`);
  if (!nonEmpty(pre.buildRef) || !nonEmpty(post.buildRef)) {
    reasons.push(`test:${testId}:buildRef:missing_evidence`);
  } else if (pre.buildRef.trim() === post.buildRef.trim()) {
    reasons.push(`test:${testId}:buildRef:identical`);
  }
  if (!nonEmpty(pre.runId) || !nonEmpty(post.runId) || pre.runId.trim() === post.runId.trim()) {
    reasons.push(`test:${testId}:runId:notDistinct`);
  }
  if (!(parseTime(pre.validatedAt) < parseTime(post.validatedAt))) {
    reasons.push(`test:${testId}:validation:invalidOrder`);
  }
  return reasons;
}

function validationReasons(
  tests: IncidentRegressionGeneratedTestReceipt[],
  runs: IncidentRegressionValidationRun[]
): string[] {
  if (runs.length === 0) return ["validationRuns:missing"];

  const testIds = new Set(tests.map((test) => test.testId));
  const passedTestIds = new Set(
    runs.filter((run) => run.status === "passed").map((run) => run.testId)
  );
  const reasons: string[] = [];
  const seenRunIds = new Set<string>();

  for (const run of runs) {
    const runRef = nonEmpty(run.runId) ? run.runId : "unknown";
    if (!nonEmpty(run.runId)) reasons.push("validationRunId:missing");
    if (seenRunIds.has(run.runId.trim())) reasons.push(`validation:${runRef}:runId:duplicate`);
    seenRunIds.add(run.runId.trim());
    if (!nonEmpty(run.testId) || !testIds.has(run.testId)) reasons.push(`validation:${runRef}:test:missing`);
    if (run.status !== "passed" && run.status !== "failed") {
      reasons.push(`validation:${runRef}:status:missing_evidence`);
    }
    if (run.phase !== "pre_fix" && run.phase !== "post_fix") {
      reasons.push(`validation:${runRef}:phase:missing_evidence`);
    }
    if (!nonEmpty(run.buildRef)) reasons.push(`validation:${runRef}:buildRef:missing_evidence`);
    if (!Number.isFinite(parseTime(run.validatedAt))) reasons.push(`validation:${runRef}:validatedAt:invalid`);
    if (!Array.isArray(run.evidenceRefs) || run.evidenceRefs.filter(nonEmpty).length === 0) {
      reasons.push(`validation:${runRef}:evidenceRefs:missing`);
    }
  }

  for (const test of tests) {
    reasons.push(...validationPairReasons(test.testId, runs));
    if (!passedTestIds.has(test.testId)) {
      reasons.push(`test:${test.testId}:validation:notPassed`);
    }
  }

  return reasons;
}

function buildClosureStatus(
  traces: IncidentRegressionTraceIndexEntry[],
  tests: IncidentRegressionGeneratedTestReceipt[],
  runs: IncidentRegressionValidationRunReceipt[],
  closureEvidenceRefs: string[],
  failClosedReasons: string[]
): IncidentRegressionClosureStatus {
  const passedTestIds = new Set(tests
    .filter((test) => validationReasons([test], runs.filter((run) => run.testId === test.testId)).length === 0)
    .map((test) => test.testId));
  const missingValidationTestIds = tests
    .filter((test) => !passedTestIds.has(test.testId))
    .map((test) => test.testId)
    .sort();
  const incidentIds = unique([
    ...traces.map((entry) => entry.incidentId),
    ...tests.map((test) => test.sourceIncidentId),
  ]);
  const testsByIncident = new Map<string, IncidentRegressionGeneratedTestReceipt[]>();
  for (const test of tests) {
    testsByIncident.set(test.sourceIncidentId, [...(testsByIncident.get(test.sourceIncidentId) ?? []), test]);
  }
  const readyIncidentIds: string[] = [];
  const blockedIncidentIds: string[] = [];
  const hasClosureEvidence = closureEvidenceRefs.filter(nonEmpty).length > 0;

  for (const incidentId of incidentIds) {
    const incidentTests = testsByIncident.get(incidentId) ?? [];
    const allValidated = incidentTests.length > 0 && incidentTests.every((test) => passedTestIds.has(test.testId));
    if (hasClosureEvidence && allValidated && failClosedReasons.length === 0) {
      readyIncidentIds.push(incidentId);
    } else {
      blockedIncidentIds.push(incidentId);
    }
  }

  return {
    status: blockedIncidentIds.length === 0 && readyIncidentIds.length > 0 ? "ready_to_close" : "blocked",
    readyIncidentIds: readyIncidentIds.sort(),
    blockedIncidentIds: blockedIncidentIds.sort(),
    generatedTestIds: tests.map((test) => test.testId).sort(),
    validatedTestIds: unique([...passedTestIds]),
    missingValidationTestIds,
    closureEvidenceRefs: unique(closureEvidenceRefs),
  };
}

function receiptHash(receipt: Omit<IncidentRegressionReceipt, "receiptHash" | "signature">): string {
  return sha256Hex(canonicalize(receipt));
}

export function buildIncidentRegressionReceipt(input: BuildIncidentRegressionReceiptInput): IncidentRegressionReceipt {
  const traceIndex = buildTraceIndex(input.traces);
  const generatedTests = buildGeneratedTests(input.generatedTests);
  const validationRuns = buildValidationRuns(input.validationRuns);
  const failClosedReasons = unique([
    ...traceReasons(input.traces),
    ...generatedTestReasons(traceIndex.entries, input.generatedTests),
    ...validationReasons(generatedTests, input.validationRuns),
    ...(input.closureEvidenceRefs.filter(nonEmpty).length === 0 ? ["closureEvidence:missing"] : []),
  ]);
  const closureStatus = buildClosureStatus(
    traceIndex.entries,
    generatedTests,
    validationRuns,
    input.closureEvidenceRefs,
    failClosedReasons
  );
  const status: IncidentRegressionReceiptStatus = failClosedReasons.length > 0 ? "fail_closed" : "ready_to_close";
  const base = {
    schemaVersion: "2026-06-26" as const,
    receiptId: `incident-regression-${sha256Hex(canonicalize({
      traces: traceIndex.entries.map((entry) => entry.traceId),
      tests: generatedTests.map((test) => test.testId),
    })).slice(0, 16)}`,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    surfaceBindings: [...SURFACE_BINDINGS],
    sourceRefs: unique(input.sourceRefs ?? []),
    traceIndex,
    failureClusters: buildFailureClusters(traceIndex.entries),
    liveTrends: buildLiveTrends(traceIndex.entries),
    generatedTests,
    validationRuns,
    closureStatus,
    status,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons,
  } satisfies Omit<IncidentRegressionReceipt, "receiptHash" | "signature">;

  return {
    ...base,
    receiptHash: receiptHash(base),
  };
}

/** Sign a captured receipt through the existing auditor policy/provider route. */
export async function signIncidentRegressionReceipt(
  workspace: string,
  receipt: IncidentRegressionReceipt
): Promise<IncidentRegressionReceipt> {
  const { signature: _signature, ...snapshot } = structuredClone(receipt);
  const { receiptHash: hash, ...body } = snapshot;
  if (hash !== receiptHash(body)) throw new Error("incident regression receipt hash mismatch");
  const signature = await signSerializedPayloadWithAuditorAsync(workspace, canonicalize(snapshot));
  return { ...snapshot, signature };
}

/** Hash-only legacy receipts remain readable but cannot verify as closure evidence. */
export function verifyIncidentRegressionReceipt(
  receipt: IncidentRegressionReceipt,
  workspace?: string
): IncidentRegressionReceiptVerification {
  try {
    const { signature, receiptHash: hash, ...body } = receipt;
    const reasons = [...receipt.failClosedReasons];
    if (receipt.schemaVersion !== "2026-06-26") reasons.push("schema version mismatch");
    if (hash !== receiptHash(body)) reasons.push("receipt hash mismatch");
    for (const entry of receipt.traceIndex.entries) {
      const { rowHash, ...payload } = entry;
      if (rowHash !== entryHash(payload)) reasons.push(`${entry.traceId}:row hash mismatch`);
    }
    for (const test of receipt.generatedTests) {
      if (test.testHash !== generatedTestHash(test)) reasons.push(`${test.testId}:test hash mismatch`);
    }
    for (const run of receipt.validationRuns) {
      if (run.runHash !== validationRunHash(run)) reasons.push(`${run.runId}:run hash mismatch`);
    }
    reasons.push(...generatedTestReasons(receipt.traceIndex.entries, receipt.generatedTests));
    reasons.push(...validationReasons(receipt.generatedTests, receipt.validationRuns));
    reasons.push(...traceReasons(receipt.traceIndex.entries.map((entry) => ({
      ...entry,
      promptBoundary: entry.promptBoundary ?? "",
      toolBoundary: entry.toolBoundary ?? "",
    }))));
    if (receipt.closureStatus.closureEvidenceRefs.filter(nonEmpty).length === 0) reasons.push("closureEvidence:missing");
    const expectedClosure = buildClosureStatus(receipt.traceIndex.entries, receipt.generatedTests,
      receipt.validationRuns, receipt.closureStatus.closureEvidenceRefs, reasons);
    if (canonicalize(receipt.closureStatus) !== canonicalize(expectedClosure)) reasons.push("closure status mismatch");
    if (receipt.status !== "ready_to_close" || receipt.failClosed) reasons.push("receipt is fail_closed");
    if (!signature || !workspace || !verifyAuditorSignatureBytes(workspace, "BUNDLE",
      Buffer.from(canonicalize({ ...body, receiptHash: hash })), Buffer.from(JSON.stringify(signature))).valid) {
      reasons.push("receipt signature missing or untrusted");
    }
    return { valid: reasons.length === 0, failClosedReasons: unique(reasons) };
  } catch {
    return { valid: false, failClosedReasons: ["incident regression receipt malformed"] };
  }
}

export function buildIncidentRegressionWatchAlerts(
  receipt: IncidentRegressionReceipt
): IncidentRegressionWatchAlert[] {
  if (!receipt.failClosed) return [];

  const evidenceRefs = unique([
    ...receipt.closureStatus.closureEvidenceRefs,
    ...receipt.traceIndex.entries.flatMap((entry) => entry.evidenceRefs),
    ...receipt.generatedTests.flatMap((test) => test.evidenceRefs),
    ...receipt.validationRuns.flatMap((run) => run.evidenceRefs),
  ]);

  return [{
    alertId: `incident-regression-${receipt.receiptHash.slice(0, 16)}`,
    source: "incident-regression",
    status: receipt.status,
    severity: "critical",
    message: `Incident regression closure is blocked by ${receipt.failClosedReasons.length} fail-closed reason(s).`,
    evidenceRefs,
    failClosedReasons: receipt.failClosedReasons,
  }];
}
