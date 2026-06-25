import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const PROMPT_INJECTION_REGRESSION_SUITE_SCHEMA_VERSION = "amc.redteam.prompt_injection_regression_suite.v1";

export type PromptInjectionRegressionVector =
  | "direct"
  | "indirect"
  | "multimodal"
  | "retrieved_content"
  | "tool_output"
  | "custom";

export type PromptInjectionRegressionDecision =
  | "block"
  | "allow"
  | "escalate"
  | "quarantine"
  | "custom";

export type PromptInjectionRegressionFixtureStatus = "passed" | "failed" | "skipped" | "pending" | "custom";
export type PromptInjectionRegressionRowStatus = "passed" | "regressed" | "missing_evidence";
export type PromptInjectionRegressionSuiteStatus = "pass" | "regressed" | "fail_closed";

export interface PromptInjectionRegressionSourceMetadata {
  sourceTitle?: string;
  sourceUrl?: string;
  sourceId?: string;
}

export interface PromptInjectionRegressionFixtureInput {
  fixtureId: string;
  vector: PromptInjectionRegressionVector;
  attackTraceRef?: string;
  attackTraceHash?: string;
  policyId?: string;
  policyMappingRef?: string;
  expectedDecision?: PromptInjectionRegressionDecision;
  observedDecision?: PromptInjectionRegressionDecision;
  observedDecisionReceiptId?: string;
  regressionStatus?: PromptInjectionRegressionFixtureStatus;
  evidenceRefs?: string[];
  signedEvidenceRefs?: string[];
  sourceMetadata?: PromptInjectionRegressionSourceMetadata;
}

export interface PromptInjectionRegressionSuiteInput {
  suiteId: string;
  suiteVersion: string;
  agentId: string;
  runId: string;
  requiredVectors?: PromptInjectionRegressionVector[];
  sourceRefs?: string[];
  evidenceRefs?: string[];
  signedEvidenceRefs?: string[];
  fixtures: PromptInjectionRegressionFixtureInput[];
}

export interface PromptInjectionRegressionSuiteRow {
  fixtureId: string;
  vector: PromptInjectionRegressionVector;
  attackTraceRef: string | null;
  attackTraceHash: string | null;
  policyId: string | null;
  policyMappingRef: string | null;
  expectedDecision: PromptInjectionRegressionDecision | null;
  observedDecision: PromptInjectionRegressionDecision | null;
  observedDecisionReceiptId: string | null;
  regressionStatus: PromptInjectionRegressionFixtureStatus | null;
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
  sourceMetadata: PromptInjectionRegressionSourceMetadata | null;
  status: PromptInjectionRegressionRowStatus;
  issues: string[];
  rowHash: string;
}

export interface PromptInjectionRegressionSuiteCoverage {
  requiredVectors: PromptInjectionRegressionVector[];
  presentVectors: PromptInjectionRegressionVector[];
  missingVectors: PromptInjectionRegressionVector[];
}

export interface PromptInjectionRegressionSuiteReceipt {
  schemaVersion: typeof PROMPT_INJECTION_REGRESSION_SUITE_SCHEMA_VERSION;
  suiteId: string;
  suiteVersion: string;
  agentId: string;
  runId: string;
  status: PromptInjectionRegressionSuiteStatus;
  sourceRefs: string[];
  evidenceRefs: string[];
  signedEvidenceRefs: string[];
  coverage: PromptInjectionRegressionSuiteCoverage;
  rows: PromptInjectionRegressionSuiteRow[];
  failClosedReasons: string[];
  receiptHash: string;
}

export interface PromptInjectionRegressionSuiteVerification {
  valid: boolean;
  failClosedReasons: string[];
}

const DEFAULT_REQUIRED_VECTORS: PromptInjectionRegressionVector[] = [
  "direct",
  "indirect",
  "multimodal",
  "retrieved_content",
];

function normalizedRefs(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizedVectors(values: readonly PromptInjectionRegressionVector[] | undefined): PromptInjectionRegressionVector[] {
  return [...new Set(values && values.length > 0 ? values : DEFAULT_REQUIRED_VECTORS)];
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function rowHashPayload(row: Omit<PromptInjectionRegressionSuiteRow, "rowHash">): unknown {
  return row;
}

function withRowHash(row: Omit<PromptInjectionRegressionSuiteRow, "rowHash">): PromptInjectionRegressionSuiteRow {
  return {
    ...row,
    rowHash: sha256Hex(canonicalize(rowHashPayload(row))),
  };
}

function receiptHashPayload(receipt: Omit<PromptInjectionRegressionSuiteReceipt, "receiptHash">): unknown {
  return receipt;
}

function buildRow(fixture: PromptInjectionRegressionFixtureInput): PromptInjectionRegressionSuiteRow {
  const fixtureId = textOrNull(fixture.fixtureId) ?? "unknown-fixture";
  const attackTraceRef = textOrNull(fixture.attackTraceRef);
  const attackTraceHash = textOrNull(fixture.attackTraceHash);
  const policyId = textOrNull(fixture.policyId);
  const policyMappingRef = textOrNull(fixture.policyMappingRef);
  const expectedDecision = fixture.expectedDecision ?? null;
  const observedDecision = fixture.observedDecision ?? null;
  const observedDecisionReceiptId = textOrNull(fixture.observedDecisionReceiptId);
  const regressionStatus = fixture.regressionStatus ?? null;
  const evidenceRefs = normalizedRefs(fixture.evidenceRefs);
  const signedEvidenceRefs = normalizedRefs(fixture.signedEvidenceRefs);
  const issues: string[] = [];

  if (!attackTraceRef) issues.push(`${fixtureId} attack trace ref missing`);
  if (!attackTraceHash) issues.push(`${fixtureId} attack trace hash missing`);
  if (!policyId) issues.push(`${fixtureId} policy id missing`);
  if (!policyMappingRef) issues.push(`${fixtureId} policy mapping ref missing`);
  if (!expectedDecision) issues.push(`${fixtureId} expected decision missing`);
  if (!observedDecision) issues.push(`${fixtureId} observed decision missing`);
  if (!observedDecisionReceiptId) issues.push(`${fixtureId} observed decision receipt missing`);
  if (!regressionStatus) issues.push(`${fixtureId} regression status missing`);
  if (evidenceRefs.length === 0) issues.push(`${fixtureId} evidence refs missing`);
  if (signedEvidenceRefs.length === 0) issues.push(`${fixtureId} signed evidence refs missing`);
  if (expectedDecision && observedDecision && expectedDecision !== observedDecision) {
    issues.push(`${fixtureId} observed decision does not match expected decision`);
  }
  if (regressionStatus && regressionStatus !== "passed") {
    issues.push(`${fixtureId} regression status is ${regressionStatus}`);
  }

  const hasMissingEvidence = issues.some((issue) =>
    issue.endsWith("missing") || issue.includes("missing")
  );
  const status: PromptInjectionRegressionRowStatus = hasMissingEvidence
    ? "missing_evidence"
    : issues.length > 0
      ? "regressed"
      : "passed";

  return withRowHash({
    fixtureId,
    vector: fixture.vector,
    attackTraceRef,
    attackTraceHash,
    policyId,
    policyMappingRef,
    expectedDecision,
    observedDecision,
    observedDecisionReceiptId,
    regressionStatus,
    evidenceRefs,
    signedEvidenceRefs,
    sourceMetadata: fixture.sourceMetadata ?? null,
    status,
    issues,
  });
}

export function buildPromptInjectionRegressionSuiteReceipt(
  input: PromptInjectionRegressionSuiteInput,
): PromptInjectionRegressionSuiteReceipt {
  const requiredVectors = normalizedVectors(input.requiredVectors);
  const rows = input.fixtures.map(buildRow);
  const presentVectors = requiredVectors.filter((vector) => rows.some((row) => row.vector === vector));
  const missingVectors = requiredVectors.filter((vector) => !presentVectors.includes(vector));
  const evidenceRefs = normalizedRefs(input.evidenceRefs);
  const signedEvidenceRefs = normalizedRefs(input.signedEvidenceRefs);
  const failClosedReasons: string[] = [];

  if (!textOrNull(input.suiteId)) failClosedReasons.push("suite id missing");
  if (!textOrNull(input.suiteVersion)) failClosedReasons.push("suite version missing");
  if (!textOrNull(input.agentId)) failClosedReasons.push("agent id missing");
  if (!textOrNull(input.runId)) failClosedReasons.push("run id missing");
  if ((input.sourceRefs ?? []).length === 0) failClosedReasons.push("suite source refs missing");
  if (evidenceRefs.length === 0) failClosedReasons.push("suite evidence refs missing");
  if (signedEvidenceRefs.length === 0) failClosedReasons.push("suite signed evidence refs missing");
  for (const vector of missingVectors) {
    failClosedReasons.push(`required vector ${vector} missing`);
  }
  for (const row of rows) {
    failClosedReasons.push(...row.issues);
  }

  const status: PromptInjectionRegressionSuiteStatus = rows.some((row) => row.status === "missing_evidence") || failClosedReasons.some((reason) => reason.includes("missing"))
    ? "fail_closed"
    : rows.some((row) => row.status === "regressed")
      ? "regressed"
      : "pass";

  const receiptWithoutHash: Omit<PromptInjectionRegressionSuiteReceipt, "receiptHash"> = {
    schemaVersion: PROMPT_INJECTION_REGRESSION_SUITE_SCHEMA_VERSION,
    suiteId: textOrNull(input.suiteId) ?? "",
    suiteVersion: textOrNull(input.suiteVersion) ?? "",
    agentId: textOrNull(input.agentId) ?? "",
    runId: textOrNull(input.runId) ?? "",
    status,
    sourceRefs: normalizedRefs(input.sourceRefs),
    evidenceRefs,
    signedEvidenceRefs,
    coverage: {
      requiredVectors,
      presentVectors,
      missingVectors,
    },
    rows,
    failClosedReasons: [...new Set(failClosedReasons)],
  };

  return {
    ...receiptWithoutHash,
    receiptHash: sha256Hex(canonicalize(receiptHashPayload(receiptWithoutHash))),
  };
}

export function verifyPromptInjectionRegressionSuiteReceipt(
  receipt: PromptInjectionRegressionSuiteReceipt,
): PromptInjectionRegressionSuiteVerification {
  const failClosedReasons = [...receipt.failClosedReasons];
  if (receipt.schemaVersion !== PROMPT_INJECTION_REGRESSION_SUITE_SCHEMA_VERSION) {
    failClosedReasons.push("schema version mismatch");
  }

  for (const row of receipt.rows) {
    const { rowHash, ...rowWithoutHash } = row;
    const expectedRowHash = sha256Hex(canonicalize(rowHashPayload(rowWithoutHash)));
    if (rowHash !== expectedRowHash) {
      failClosedReasons.push(`${row.fixtureId} row hash mismatch`);
    }
  }

  const { receiptHash, ...receiptWithoutHash } = receipt;
  const expectedReceiptHash = sha256Hex(canonicalize(receiptHashPayload(receiptWithoutHash)));
  if (receiptHash !== expectedReceiptHash) {
    failClosedReasons.push("receipt hash mismatch");
  }
  if (receipt.status !== "pass") {
    failClosedReasons.push(`suite status is ${receipt.status}`);
  }

  return {
    valid: failClosedReasons.length === 0,
    failClosedReasons: [...new Set(failClosedReasons)],
  };
}

export function renderPromptInjectionRegressionSuiteMarkdown(
  receipt: PromptInjectionRegressionSuiteReceipt,
): string {
  const lines: string[] = [];
  lines.push("# Prompt Injection Regression Suite");
  lines.push("");
  lines.push(`Status: ${receipt.status}`);
  lines.push(`Suite: ${receipt.suiteId}@${receipt.suiteVersion}`);
  lines.push(`Agent: ${receipt.agentId}`);
  lines.push(`Run: ${receipt.runId}`);
  lines.push(`Required Vectors: ${receipt.coverage.requiredVectors.join(", ")}`);
  lines.push(`Present Vectors: ${receipt.coverage.presentVectors.join(", ") || "none"}`);
  lines.push(`Missing Vectors: ${receipt.coverage.missingVectors.join(", ") || "none"}`);
  lines.push(`Rows: ${receipt.rows.length}`);
  lines.push(`Receipt Hash: ${receipt.receiptHash}`);
  if (receipt.failClosedReasons.length > 0) {
    lines.push("");
    lines.push("## Fail-Closed Reasons");
    for (const reason of receipt.failClosedReasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push("");
  lines.push("## Fixtures");
  for (const row of receipt.rows) {
    lines.push(`- ${row.fixtureId}: ${row.vector} -> ${row.status} (${row.expectedDecision ?? "?"} / ${row.observedDecision ?? "?"})`);
  }
  return `${lines.join("\n")}\n`;
}
