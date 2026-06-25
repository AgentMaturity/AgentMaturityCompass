import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type DegradedModeFailureMode =
  | "provider_outage"
  | "network_loss"
  | "missing_retrieval"
  | "policy_service_failure"
  | "rate_limit"
  | "latency_slo_breach"
  | "unknown";

export type DegradedModeAllowedBehavior =
  | "serve_cached"
  | "read_only"
  | "fallback_provider"
  | "request_human_review"
  | "deny"
  | "local_only"
  | "limited_tool_use"
  | "defer";

export type DegradedModeBehaviorStatus = "allow_degraded" | "block" | "fail_closed";

export interface DegradedModeBehaviorSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface DegradedModeBehaviorTestRun {
  testRunId: string;
  passed: boolean;
  scenario: string;
  evidenceRef: string;
}

export interface DegradedModeOperatorMessage {
  audience: "operator" | "user" | "admin" | "auditor";
  message: string;
  evidenceRef: string;
}

export interface BuildDegradedModeBehaviorReceiptInput {
  receiptId: string;
  policyId: string;
  agentId: string;
  failureMode: DegradedModeFailureMode;
  allowedBehaviors: DegradedModeAllowedBehavior[];
  disallowedBehaviors: string[];
  testRun: DegradedModeBehaviorTestRun;
  operatorMessage: DegradedModeOperatorMessage;
  sourceCitations: DegradedModeBehaviorSourceCitation[];
  recoveryPlanRef?: string;
  generatedAt?: string;
}

export interface DegradedModeBehaviorReceipt {
  receiptId: string;
  generatedAt: string;
  policyId: string;
  agentId: string;
  failureMode: DegradedModeFailureMode;
  surfaceBindings: string[];
  allowedBehaviors: DegradedModeAllowedBehavior[];
  disallowedBehaviors: string[];
  testRun: DegradedModeBehaviorTestRun;
  operatorMessage: DegradedModeOperatorMessage;
  recoveryPlanRef: string | null;
  requiredEvidenceRefs: string[];
  allowedBehaviorMet: boolean;
  testRunMet: boolean;
  operatorMessageMet: boolean;
  status: DegradedModeBehaviorStatus;
  scorePenalty: number;
  sourceCitations: DegradedModeBehaviorSourceCitation[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface DegradedModeBehaviorVerification {
  valid: boolean;
  reasons: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function receiptHash(receipt: Omit<DegradedModeBehaviorReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function sourceCitationReasons(citations: DegradedModeBehaviorSourceCitation[]): string[] {
  if (citations.length === 0) {
    return ["sourceCitations:missing"];
  }
  return citations.flatMap((citation) => {
    if (
      nonEmpty(citation.sourceId)
      && nonEmpty(citation.title)
      && nonEmpty(citation.url)
      && nonEmpty(citation.retrievedAt)
    ) {
      return [];
    }
    return [`sourceCitation:${citation.sourceId || "unknown"}:invalid`];
  });
}

function requiredFieldReasons(input: BuildDegradedModeBehaviorReceiptInput): string[] {
  const reasons: string[] = [];
  if (!nonEmpty(input.receiptId)) {
    reasons.push("receiptId:missing");
  }
  if (!nonEmpty(input.policyId)) {
    reasons.push("policyId:missing");
  }
  if (!nonEmpty(input.agentId)) {
    reasons.push("agentId:missing");
  }
  if (!nonEmpty(input.failureMode) || input.failureMode === "unknown") {
    reasons.push("failureMode:missing");
  }
  if (input.allowedBehaviors.length === 0) {
    reasons.push("allowedBehaviors:missing");
  }
  const allowed = new Set(input.allowedBehaviors);
  for (const behavior of input.disallowedBehaviors) {
    if (allowed.has(behavior as DegradedModeAllowedBehavior)) {
      reasons.push(`behavior:${behavior}:allowed-and-disallowed`);
    }
  }
  if (!nonEmpty(input.testRun.testRunId)) {
    reasons.push("testRunId:missing");
  }
  if (!nonEmpty(input.testRun.scenario)) {
    reasons.push("testRunScenario:missing");
  }
  if (!nonEmpty(input.testRun.evidenceRef)) {
    reasons.push("testRunEvidenceRef:missing");
  }
  if (!nonEmpty(input.operatorMessage.message)) {
    reasons.push("operatorMessage:missing");
  }
  if (!nonEmpty(input.operatorMessage.evidenceRef)) {
    reasons.push("operatorMessageEvidenceRef:missing");
  }
  return reasons;
}

function evidenceRefs(input: BuildDegradedModeBehaviorReceiptInput): string[] {
  return unique([
    input.testRun.evidenceRef,
    input.operatorMessage.evidenceRef,
    input.recoveryPlanRef ?? ""
  ].filter(nonEmpty));
}

export function buildDegradedModeBehaviorReceipt(
  input: BuildDegradedModeBehaviorReceiptInput
): DegradedModeBehaviorReceipt {
  const failClosedReasons = unique([
    ...sourceCitationReasons(input.sourceCitations),
    ...requiredFieldReasons(input)
  ]);
  const allowedBehaviorMet = input.allowedBehaviors.length > 0
    && !input.disallowedBehaviors.some((behavior) => input.allowedBehaviors.includes(behavior as DegradedModeAllowedBehavior));
  const operatorMessageMet = nonEmpty(input.operatorMessage.message) && nonEmpty(input.operatorMessage.evidenceRef);
  const testRunEvidenceMet = nonEmpty(input.testRun.testRunId) && nonEmpty(input.testRun.scenario) && nonEmpty(input.testRun.evidenceRef);
  const testRunMet = testRunEvidenceMet && input.testRun.passed;
  const status: DegradedModeBehaviorStatus = failClosedReasons.length > 0
    ? "fail_closed"
    : testRunMet
      ? "allow_degraded"
      : "block";

  const withoutHash: Omit<DegradedModeBehaviorReceipt, "receiptHash"> = {
    receiptId: input.receiptId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    policyId: input.policyId,
    agentId: input.agentId,
    failureMode: input.failureMode,
    surfaceBindings: ["API", "Studio", "Fleet", "Enforce"],
    allowedBehaviors: input.allowedBehaviors,
    disallowedBehaviors: input.disallowedBehaviors,
    testRun: input.testRun,
    operatorMessage: input.operatorMessage,
    recoveryPlanRef: input.recoveryPlanRef ?? null,
    requiredEvidenceRefs: evidenceRefs(input),
    allowedBehaviorMet,
    testRunMet,
    operatorMessageMet,
    status,
    scorePenalty: Math.min(100, (failClosedReasons.length * 5) + (testRunMet ? 0 : 20)),
    sourceCitations: input.sourceCitations,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons
  };

  return {
    ...withoutHash,
    receiptHash: receiptHash(withoutHash)
  };
}

export function verifyDegradedModeBehaviorReceipt(
  receipt: DegradedModeBehaviorReceipt
): DegradedModeBehaviorVerification {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.status === "fail_closed" && !receipt.failClosed) {
    reasons.push("status:fail-closed-without-reasons");
  }
  if (receipt.status !== "fail_closed" && receipt.failClosed) {
    reasons.push("status:non-fail-closed-with-reasons");
  }
  if (receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  }
  if (receipt.requiredEvidenceRefs.length === 0) {
    reasons.push("requiredEvidenceRefs:missing");
  }
  if (!receipt.surfaceBindings.includes("API") || !receipt.surfaceBindings.includes("Studio") || !receipt.surfaceBindings.includes("Fleet")) {
    reasons.push("surfaceBindings:missing");
  }
  if (receipt.status === "allow_degraded" && !receipt.testRunMet) {
    reasons.push("status:allow-without-passing-test");
  }
  const { receiptHash: actualReceiptHash, ...withoutReceiptHash } = receipt;
  if (receiptHash(withoutReceiptHash) !== actualReceiptHash) {
    reasons.push("receiptHash:mismatch");
  }
  return {
    valid: reasons.length === 0,
    reasons: unique(reasons)
  };
}

export function renderDegradedModeBehaviorMarkdown(receipt: DegradedModeBehaviorReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Degraded-Mode Behavior Receipt");
  lines.push("");
  lines.push(`- Receipt: \`${receipt.receiptId}\``);
  lines.push(`- Generated: \`${receipt.generatedAt}\``);
  lines.push(`- Status: ${receipt.status}`);
  lines.push(`- Agent: \`${receipt.agentId}\``);
  lines.push(`- Failure mode: \`${receipt.failureMode}\``);
  lines.push(`- Surfaces: ${receipt.surfaceBindings.join(", ")}`);
  lines.push(`- Receipt hash: \`${receipt.receiptHash}\``);
  lines.push("");
  lines.push("## Allowed Behavior");
  for (const behavior of receipt.allowedBehaviors) {
    lines.push(`- ${behavior}`);
  }
  lines.push("");
  lines.push("## Operator Message");
  lines.push(`- Audience: ${receipt.operatorMessage.audience}`);
  lines.push(`- Message: ${receipt.operatorMessage.message || "MISSING"}`);
  lines.push("");
  lines.push("## Required Evidence");
  for (const ref of receipt.requiredEvidenceRefs) {
    lines.push(`- ${ref}`);
  }
  if (receipt.failClosedReasons.length > 0) {
    lines.push("");
    lines.push("## Fail-Closed Reasons");
    for (const reason of receipt.failClosedReasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
