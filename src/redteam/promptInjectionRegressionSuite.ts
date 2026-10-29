import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { openLedger, verifyEvidenceEventIntegrity, type Ledger } from "../ledger/ledger.js";
import { signSerializedPayloadWithAuditorAsync } from "../org/orgSigner.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";

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
  signature?: SignedDigest;
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

function receiptHashPayload(receipt: Omit<PromptInjectionRegressionSuiteReceipt, "receiptHash" | "signature">): unknown {
  return receipt;
}

function buildRow(fixture: PromptInjectionRegressionFixtureInput, evidenceIssues: string[] = []): PromptInjectionRegressionSuiteRow {
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
  const issues: string[] = [...evidenceIssues];

  if (!textOrNull(fixture.fixtureId)) issues.push("fixture id missing");
  if (!attackTraceRef) issues.push(`${fixtureId} attack trace ref missing`);
  if (!attackTraceHash) issues.push(`${fixtureId} attack trace hash missing`);
  if (!policyId) issues.push(`${fixtureId} policy id missing`);
  if (!policyMappingRef) issues.push(`${fixtureId} policy mapping ref missing`);
  if (!expectedDecision) issues.push(`${fixtureId} expected decision missing`);
  if (!observedDecision) issues.push(`${fixtureId} observed decision missing`);
  if (!observedDecisionReceiptId) issues.push(`${fixtureId} observed decision receipt missing`);
  if (regressionStatus !== "passed" && regressionStatus !== "failed") {
    issues.push(`${fixtureId} measured regression result missing (${regressionStatus ?? "unset"})`);
  }
  if (!regressionStatus) issues.push(`${fixtureId} regression status missing`);
  if (evidenceRefs.length === 0) issues.push(`${fixtureId} evidence refs missing`);
  if (signedEvidenceRefs.length === 0) issues.push(`${fixtureId} signed evidence refs missing`);
  const hasMissingEvidence = issues.length > 0;
  if (expectedDecision && observedDecision && expectedDecision !== observedDecision) {
    issues.push(`${fixtureId} observed decision does not match expected decision`);
  }
  if (regressionStatus && regressionStatus !== "passed") {
    issues.push(`${fixtureId} regression status is ${regressionStatus}`);
  }

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

/** Canonical bytes a ledger event must attest; references are excluded to avoid self-reference. */
export function promptInjectionRegressionEvidencePayload(
  input: PromptInjectionRegressionSuiteInput, fixtureId?: string
): string {
  const claims = input.fixtures.map((fixture) => {
    const { evidenceRefs: _refs, signedEvidenceRefs: _signed, status: _status, issues: _issues,
      rowHash: _hash, sourceMetadata: _metadata, ...claim } = buildRow(fixture);
    return claim;
  });
  const identity = { schemaVersion: PROMPT_INJECTION_REGRESSION_SUITE_SCHEMA_VERSION,
    suiteId: textOrNull(input.suiteId), suiteVersion: textOrNull(input.suiteVersion),
    agentId: textOrNull(input.agentId), runId: textOrNull(input.runId) };
  if (fixtureId !== undefined) {
    const fixture = claims.find((claim) => claim.fixtureId === fixtureId.trim());
    if (!fixture) throw new Error(`fixture ${fixtureId} missing`);
    return canonicalize({ ...identity, fixture });
  }
  return canonicalize({ ...identity, requiredVectors: normalizedVectors(input.requiredVectors), fixtures: claims });
}

function signedEvidenceIssues(ledger: Ledger | null, refs: string[], payload: string, label: string): string[] {
  if (!ledger) return [`${label} signed evidence verification missing (ledger workspace missing or unavailable)`];
  const issues: string[] = [];
  for (const ref of refs) {
    const eventId = ref.startsWith("ledger:") ? ref.slice("ledger:".length) : ref;
    const event = ledger.getEventById(eventId);
    const verified = verifyEvidenceEventIntegrity({ ledger, eventId });
    if (!event || event.payload_sha256 !== sha256Hex(payload) || !verified.ok || verified.payloadsNotEvaluated?.length) {
      issues.push(`${label} signed evidence verification missing for ${ref}`);
    }
  }
  return issues;
}

export function buildPromptInjectionRegressionSuiteReceipt(
  input: PromptInjectionRegressionSuiteInput, workspace?: string
): PromptInjectionRegressionSuiteReceipt {
  let ledger: Ledger | null = null;
  try {
    if (workspace) ledger = openLedger(workspace, { readonly: true });
  } catch { /* Unavailable evidence remains missing, never a successful receipt. */ }
  try {
    const build = () => buildSuiteReceipt(input, ledger);
    return ledger ? ledger.db.transaction(build)() : build();
  } finally { ledger?.close(); }
}

function buildSuiteReceipt(input: PromptInjectionRegressionSuiteInput, ledger: Ledger | null): PromptInjectionRegressionSuiteReceipt {
  const requiredVectors = normalizedVectors(input.requiredVectors);
  const rows = input.fixtures.map((fixture) => buildRow(fixture, signedEvidenceIssues(ledger,
    normalizedRefs(fixture.signedEvidenceRefs), promptInjectionRegressionEvidencePayload(input, textOrNull(fixture.fixtureId) ?? "unknown-fixture"),
    textOrNull(fixture.fixtureId) ?? "unknown-fixture")));
  const presentVectors = requiredVectors.filter((vector) => rows.some((row) => row.vector === vector));
  const missingVectors = requiredVectors.filter((vector) => !presentVectors.includes(vector));
  const evidenceRefs = normalizedRefs(input.evidenceRefs);
  const signedEvidenceRefs = normalizedRefs(input.signedEvidenceRefs);
  const failClosedReasons: string[] = signedEvidenceIssues(ledger, signedEvidenceRefs,
    promptInjectionRegressionEvidencePayload(input), "suite");
  if (!ledger) failClosedReasons.push("ledger workspace missing");
  if (rows.length === 0) failClosedReasons.push("suite fixtures missing");
  const fixtureIds = rows.map((row) => row.fixtureId);
  if (new Set(fixtureIds).size !== fixtureIds.length) failClosedReasons.push("unique fixture ids missing");

  if (!textOrNull(input.suiteId)) failClosedReasons.push("suite id missing");
  if (!textOrNull(input.suiteVersion)) failClosedReasons.push("suite version missing");
  if (!textOrNull(input.agentId)) failClosedReasons.push("agent id missing");
  if (!textOrNull(input.runId)) failClosedReasons.push("run id missing");
  if (normalizedRefs(input.sourceRefs).length === 0) failClosedReasons.push("suite source refs missing");
  if (evidenceRefs.length === 0) failClosedReasons.push("suite evidence refs missing");
  if (signedEvidenceRefs.length === 0) failClosedReasons.push("suite signed evidence refs missing");
  for (const vector of missingVectors) {
    failClosedReasons.push(`required vector ${vector} missing`);
  }
  const missingEvidence = failClosedReasons.length > 0 || rows.some((row) => row.status === "missing_evidence");
  for (const row of rows) {
    failClosedReasons.push(...row.issues);
  }

  const status: PromptInjectionRegressionSuiteStatus = missingEvidence
    ? "fail_closed"
    : rows.some((row) => row.status === "regressed")
      ? "regressed"
      : "pass";

  const receiptWithoutHash: Omit<PromptInjectionRegressionSuiteReceipt, "receiptHash" | "signature"> = {
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
  receipt: PromptInjectionRegressionSuiteReceipt, workspace?: string
): PromptInjectionRegressionSuiteVerification {
  try {
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

    const { receiptHash, signature, ...receiptWithoutHash } = receipt;
    const expectedReceiptHash = sha256Hex(canonicalize(receiptHashPayload(receiptWithoutHash)));
    if (receiptHash !== expectedReceiptHash) {
      failClosedReasons.push("receipt hash mismatch");
    }
    if (receipt.status !== "pass") {
      failClosedReasons.push(`suite status is ${receipt.status}`);
    }
    if (!workspace) failClosedReasons.push("ledger workspace missing");
    if (!signature) failClosedReasons.push("receipt signature missing");
    if (workspace && signature && !verifyAuditorSignatureBytes(workspace, "BUNDLE", Buffer.from(canonicalize({ ...receiptWithoutHash, receiptHash })),
      Buffer.from(JSON.stringify(signature))).valid) failClosedReasons.push("receipt signature invalid");
    const rebuilt = buildPromptInjectionRegressionSuiteReceipt(receiptInput(receipt), workspace);
    if (rebuilt.receiptHash !== receiptHash) failClosedReasons.push("receipt claims mismatch");
    failClosedReasons.push(...rebuilt.failClosedReasons);

    return {
      valid: failClosedReasons.length === 0,
      failClosedReasons: [...new Set(failClosedReasons)],
    };
  } catch {
    return { valid: false, failClosedReasons: ["prompt-injection regression receipt malformed"] };
  }
}

function receiptInput(receipt: PromptInjectionRegressionSuiteReceipt): PromptInjectionRegressionSuiteInput {
  return {
    ...receipt, requiredVectors: receipt.coverage.requiredVectors,
    fixtures: receipt.rows.map((row) => ({
      fixtureId: row.fixtureId, vector: row.vector, attackTraceRef: row.attackTraceRef ?? undefined,
      attackTraceHash: row.attackTraceHash ?? undefined, policyId: row.policyId ?? undefined,
      policyMappingRef: row.policyMappingRef ?? undefined, expectedDecision: row.expectedDecision ?? undefined,
      observedDecision: row.observedDecision ?? undefined, observedDecisionReceiptId: row.observedDecisionReceiptId ?? undefined,
      regressionStatus: row.regressionStatus ?? undefined, evidenceRefs: row.evidenceRefs,
      signedEvidenceRefs: row.signedEvidenceRefs, sourceMetadata: row.sourceMetadata ?? undefined,
    })),
  };
}

/** Signs freshly derived claims, including failures; signing never upgrades missing evidence. */
export async function signPromptInjectionRegressionSuiteReceipt(
  workspace: string, receipt: PromptInjectionRegressionSuiteReceipt
): Promise<PromptInjectionRegressionSuiteReceipt> {
  const rebuilt = buildPromptInjectionRegressionSuiteReceipt(receiptInput(structuredClone(receipt)), workspace);
  const signature = await signSerializedPayloadWithAuditorAsync(workspace, canonicalize(rebuilt));
  return { ...rebuilt, signature };
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
