import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type PolicyDriftImpactLevel = "low" | "medium" | "high" | "critical";
export type PolicyDriftEnvironment = "development" | "staging" | "production";
export type PolicyDriftControlChangeType = "added" | "removed" | "strengthened" | "relaxed" | "renamed";
export type PolicyDriftRecheckStatus = "open" | "in_progress" | "done" | "waived";

export interface PolicyDriftImpactSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface PolicyDriftImpactEvidenceLink {
  eventId: string;
  eventHash: string;
  eventType: string;
  signedEvidenceRef: string;
}

export interface PolicyDriftAffectedAgent {
  agentId: string;
  environment: PolicyDriftEnvironment;
  currentPolicyVersion: string;
  requiredPolicyVersion: string;
  impactLevel: PolicyDriftImpactLevel;
  reason: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftAffectedControl {
  controlId: string;
  framework: string;
  owner: string;
  changeType: PolicyDriftControlChangeType;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftAffectedTest {
  testId: string;
  command: string;
  owner: string;
  reason: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftPriorDecision {
  decisionId: string;
  agentId: string;
  decisionType: string;
  decidedAt: string;
  invalidated: boolean;
  reason: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftRecheckItem {
  recheckId: string;
  owner: string;
  dueAt: string;
  action: string;
  status: PolicyDriftRecheckStatus;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftRolloutReceipt {
  rolloutId: string;
  approvedBy: string;
  approvedAt: string;
  rolloutWindowId: string;
  rollbackPlanRef: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftImpactChange {
  changeId: string;
  policyId: string;
  previousPolicyVersion: string;
  nextPolicyVersion: string;
  previousPolicyHash: string;
  nextPolicyHash: string;
  changeOwner: string;
  changedAt: string;
  rationale: string;
  diffSummary: string;
  signedEvidenceRef: string;
  signatureSha256: string;
  affectedAgents: PolicyDriftAffectedAgent[];
  affectedControls: PolicyDriftAffectedControl[];
  affectedTests: PolicyDriftAffectedTest[];
  priorDecisions: PolicyDriftPriorDecision[];
  recheckItems: PolicyDriftRecheckItem[];
  rolloutReceipt: PolicyDriftRolloutReceipt;
  evidenceRefs: PolicyDriftImpactEvidenceLink[];
  sourceCitationIds?: string[];
}

export interface PolicyDriftImpactRow {
  changeId: string;
  policyId: string;
  previousPolicyVersion: string;
  nextPolicyVersion: string;
  changeOwner: string;
  changedAt: string;
  affectedAgentIds: string[];
  affectedControlIds: string[];
  affectedTestIds: string[];
  priorDecisionIds: string[];
  invalidatedPriorDecisionIds: string[];
  recheckIds: string[];
  rolloutId: string;
  sourceCitationIds: string[];
  evidenceRefs: PolicyDriftImpactEvidenceLink[];
  policyDiffHash: string;
  impactHash: string;
  rolloutHash: string;
  evidenceChainHash: string;
  rowHash: string;
}

export interface PolicyDriftImpactReceipt {
  receiptId: string;
  generatedAt: string;
  sourceCitations: PolicyDriftImpactSourceCitation[];
  rows: PolicyDriftImpactRow[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface PolicyDriftImpactVerification {
  valid: boolean;
  reasons: string[];
}

function isSha256(value: string | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function timestampPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function signedRefValid(value: { signedEvidenceRef?: string; signatureSha256?: string }): boolean {
  return Boolean(value.signedEvidenceRef && isSha256(value.signatureSha256));
}

function rowHash(row: Omit<PolicyDriftImpactRow, "rowHash">): string {
  return sha256Hex(canonicalize(row));
}

function receiptHash(receipt: Omit<PolicyDriftImpactReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function evidenceRefsValid(evidenceRefs: PolicyDriftImpactEvidenceLink[]): boolean {
  return evidenceRefs.length > 0 && evidenceRefs.every((evidence) => (
    Boolean(evidence.eventId)
    && Boolean(evidence.eventType)
    && Boolean(evidence.signedEvidenceRef)
    && isSha256(evidence.eventHash)
  ));
}

function policyDiffValid(change: PolicyDriftImpactChange): boolean {
  return Boolean(
    change.policyId
    && change.previousPolicyVersion
    && change.nextPolicyVersion
    && isSha256(change.previousPolicyHash)
    && isSha256(change.nextPolicyHash)
    && change.previousPolicyHash !== change.nextPolicyHash
    && change.changeOwner
    && timestampPresent(change.changedAt)
    && change.rationale
    && change.diffSummary
    && signedRefValid(change)
  );
}

function affectedAgentValid(agent: PolicyDriftAffectedAgent): boolean {
  return Boolean(
    agent.agentId
    && agent.environment
    && agent.currentPolicyVersion
    && agent.requiredPolicyVersion
    && agent.impactLevel
    && agent.reason
    && signedRefValid(agent)
  );
}

function affectedControlValid(control: PolicyDriftAffectedControl): boolean {
  return Boolean(
    control.controlId
    && control.framework
    && control.owner
    && control.changeType
    && signedRefValid(control)
  );
}

function affectedTestValid(test: PolicyDriftAffectedTest): boolean {
  return Boolean(
    test.testId
    && test.command
    && test.owner
    && test.reason
    && signedRefValid(test)
  );
}

function priorDecisionValid(decision: PolicyDriftPriorDecision): boolean {
  return Boolean(
    decision.decisionId
    && decision.agentId
    && decision.decisionType
    && timestampPresent(decision.decidedAt)
    && decision.reason
    && signedRefValid(decision)
  );
}

function recheckItemValid(item: PolicyDriftRecheckItem): boolean {
  return Boolean(
    item.recheckId
    && item.owner
    && timestampPresent(item.dueAt)
    && item.action
    && item.status
    && signedRefValid(item)
  );
}

function rolloutReceiptValid(receipt: PolicyDriftRolloutReceipt): boolean {
  return Boolean(
    receipt
    && receipt.rolloutId
    && receipt.approvedBy
    && timestampPresent(receipt.approvedAt)
    && receipt.rolloutWindowId
    && receipt.rollbackPlanRef
    && signedRefValid(receipt)
  );
}

export function buildPolicyDriftImpactReceipt(input: {
  receiptId: string;
  sourceCitations: PolicyDriftImpactSourceCitation[];
  changes: PolicyDriftImpactChange[];
  generatedAt?: string;
}): PolicyDriftImpactReceipt {
  const failClosedReasons: string[] = [];
  const sourceIds = new Set(input.sourceCitations.map((citation) => citation.sourceId).filter(Boolean));
  if (sourceIds.size === 0) {
    failClosedReasons.push("sourceCitations:missing");
  }

  const rows = input.changes.map((change): PolicyDriftImpactRow => {
    const sourceCitationIds = change.sourceCitationIds ?? [...sourceIds];
    if (sourceCitationIds.length === 0) {
      failClosedReasons.push(`${change.changeId}:sourceCitation:missing`);
    }
    if (sourceCitationIds.some((sourceId) => !sourceIds.has(sourceId))) {
      failClosedReasons.push(`${change.changeId}:sourceCitation:unknown`);
    }
    if (!policyDiffValid(change)) {
      failClosedReasons.push(`${change.changeId}:policyDiff:missing`);
    }
    if (change.affectedAgents.length === 0 || change.affectedAgents.some((agent) => !affectedAgentValid(agent))) {
      failClosedReasons.push(`${change.changeId}:affectedAgents:missing`);
    }
    if (change.affectedControls.length === 0 || change.affectedControls.some((control) => !affectedControlValid(control))) {
      failClosedReasons.push(`${change.changeId}:affectedControls:missing`);
    }
    if (change.affectedTests.length === 0 || change.affectedTests.some((test) => !affectedTestValid(test))) {
      failClosedReasons.push(`${change.changeId}:affectedTests:missing`);
    }
    if (change.priorDecisions.length === 0 || change.priorDecisions.some((decision) => !priorDecisionValid(decision))) {
      failClosedReasons.push(`${change.changeId}:priorDecisions:missing`);
    }
    const invalidatedPriorDecisionIds = change.priorDecisions.filter((decision) => decision.invalidated).map((decision) => decision.decisionId);
    if (
      change.recheckItems.length === 0
      || change.recheckItems.some((item) => !recheckItemValid(item))
      || (invalidatedPriorDecisionIds.length > 0 && change.recheckItems.length === 0)
    ) {
      failClosedReasons.push(`${change.changeId}:recheckList:missing`);
    }
    if (!rolloutReceiptValid(change.rolloutReceipt)) {
      failClosedReasons.push(`${change.changeId}:rolloutReceipt:missing`);
    }
    if (!evidenceRefsValid(change.evidenceRefs)) {
      failClosedReasons.push(`${change.changeId}:evidenceChain:missing`);
    }

    const policyDiff = {
      policyId: change.policyId,
      previousPolicyVersion: change.previousPolicyVersion,
      nextPolicyVersion: change.nextPolicyVersion,
      previousPolicyHash: change.previousPolicyHash,
      nextPolicyHash: change.nextPolicyHash,
      changeOwner: change.changeOwner,
      changedAt: change.changedAt,
      rationale: change.rationale,
      diffSummary: change.diffSummary,
      signedEvidenceRef: change.signedEvidenceRef,
      signatureSha256: change.signatureSha256,
    };
    const impact = {
      affectedAgents: change.affectedAgents,
      affectedControls: change.affectedControls,
      affectedTests: change.affectedTests,
      priorDecisions: change.priorDecisions,
      recheckItems: change.recheckItems,
    };
    const baseRow: Omit<PolicyDriftImpactRow, "rowHash"> = {
      changeId: change.changeId,
      policyId: change.policyId,
      previousPolicyVersion: change.previousPolicyVersion,
      nextPolicyVersion: change.nextPolicyVersion,
      changeOwner: change.changeOwner,
      changedAt: change.changedAt,
      affectedAgentIds: change.affectedAgents.map((agent) => agent.agentId),
      affectedControlIds: change.affectedControls.map((control) => control.controlId),
      affectedTestIds: change.affectedTests.map((test) => test.testId),
      priorDecisionIds: change.priorDecisions.map((decision) => decision.decisionId),
      invalidatedPriorDecisionIds,
      recheckIds: change.recheckItems.map((item) => item.recheckId),
      rolloutId: change.rolloutReceipt.rolloutId,
      sourceCitationIds,
      evidenceRefs: change.evidenceRefs,
      policyDiffHash: sha256Hex(canonicalize(policyDiff)),
      impactHash: sha256Hex(canonicalize(impact)),
      rolloutHash: sha256Hex(canonicalize(change.rolloutReceipt)),
      evidenceChainHash: sha256Hex(canonicalize(change.evidenceRefs)),
    };

    return {
      ...baseRow,
      rowHash: rowHash(baseRow),
    };
  });

  if (rows.length === 0) {
    failClosedReasons.push("changes:missing");
  }

  const withoutHash: Omit<PolicyDriftImpactReceipt, "receiptHash"> = {
    receiptId: input.receiptId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceCitations: input.sourceCitations,
    rows,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons: unique(failClosedReasons),
  };

  return {
    ...withoutHash,
    receiptHash: receiptHash(withoutHash),
  };
}

export function verifyPolicyDriftImpactReceipt(
  receipt: PolicyDriftImpactReceipt
): PolicyDriftImpactVerification {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  }
  if (receipt.rows.length === 0) {
    reasons.push("changes:missing");
  }
  for (const row of receipt.rows) {
    const { rowHash: actualRowHash, ...withoutRowHash } = row;
    if (rowHash(withoutRowHash) !== actualRowHash) {
      reasons.push(`${row.changeId}:rowHash:mismatch`);
    }
    if (!row.policyId || !row.previousPolicyVersion || !row.nextPolicyVersion || !row.changeOwner) {
      reasons.push(`${row.changeId}:policyDiff:missing`);
    }
    if (row.affectedAgentIds.length === 0) {
      reasons.push(`${row.changeId}:affectedAgents:missing`);
    }
    if (row.affectedControlIds.length === 0) {
      reasons.push(`${row.changeId}:affectedControls:missing`);
    }
    if (row.affectedTestIds.length === 0) {
      reasons.push(`${row.changeId}:affectedTests:missing`);
    }
    if (row.priorDecisionIds.length === 0) {
      reasons.push(`${row.changeId}:priorDecisions:missing`);
    }
    if (row.recheckIds.length === 0) {
      reasons.push(`${row.changeId}:recheckList:missing`);
    }
    if (!row.rolloutId) {
      reasons.push(`${row.changeId}:rolloutReceipt:missing`);
    }
    if (!evidenceRefsValid(row.evidenceRefs)) {
      reasons.push(`${row.changeId}:evidenceChain:missing`);
    }
  }
  const { receiptHash: actualReceiptHash, ...withoutReceiptHash } = receipt;
  if (receiptHash(withoutReceiptHash) !== actualReceiptHash) {
    reasons.push("receiptHash:mismatch");
  }
  return {
    valid: reasons.length === 0,
    reasons: unique(reasons),
  };
}

export function renderPolicyDriftImpactAuditExport(receipt: PolicyDriftImpactReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Policy Drift Impact Audit Export");
  lines.push("");
  lines.push(`- Receipt: \`${receipt.receiptId}\``);
  lines.push(`- Generated: \`${receipt.generatedAt}\``);
  lines.push(`- Status: ${receipt.failClosed ? "FAIL-CLOSED" : "VALID"}`);
  lines.push(`- Receipt hash: \`${receipt.receiptHash}\``);
  lines.push("");
  lines.push("## Source Citations");
  for (const citation of receipt.sourceCitations) {
    lines.push(`- ${citation.sourceId}: ${citation.title} (${citation.url})`);
  }
  lines.push("");
  lines.push("## Policy Drift Rows");
  lines.push("");
  lines.push("| Policy diff | Affected agents | Affected controls | Affected tests | Prior decisions | Recheck list | Rollout receipt | Evidence chain |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of receipt.rows) {
    const values = [
      `${row.policyId} ${row.previousPolicyVersion}->${row.nextPolicyVersion}`,
      row.affectedAgentIds.join(", ") || "MISSING",
      row.affectedControlIds.join(", ") || "MISSING",
      row.affectedTestIds.join(", ") || "MISSING",
      row.priorDecisionIds.join(", ") || "MISSING",
      row.recheckIds.join(", ") || "MISSING",
      row.rolloutId || "MISSING",
      `Evidence chain ${row.evidenceChainHash}`,
    ];
    lines.push(`| ${values.map((value) => value.replace(/\|/g, "\\|")).join(" | ")} |`);
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
