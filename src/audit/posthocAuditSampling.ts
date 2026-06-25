import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type PosthocAuditSamplingRiskTier = "low" | "medium" | "high" | "critical";
export type PosthocAuditSamplingMethod = "random" | "risk_weighted_random" | "stratified" | "targeted";
export type PosthocAuditReviewDecision = "pass" | "issue" | "escalate";
export type PosthocAuditFindingSeverity = "low" | "medium" | "high" | "critical";
export type PosthocAuditCorrectiveActionStatus = "open" | "in_progress" | "done" | "waived";

export interface PosthocAuditSamplingSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface PosthocAuditSamplingEvidenceLink {
  eventId: string;
  eventHash: string;
  eventType: string;
  signedEvidenceRef: string;
}

export interface PosthocAuditSamplePlan {
  samplePlanId: string;
  owner: string;
  populationId: string;
  populationSize: number;
  sampleSize: number;
  samplingMethod: PosthocAuditSamplingMethod;
  riskTier: PosthocAuditSamplingRiskTier;
  plannedAt: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PosthocAuditReviewedAction {
  actionId: string;
  samplePlanId: string;
  agentId: string;
  policyId: string;
  completedAt: string;
  sampledAt: string;
  reviewerId: string;
  reviewDecision: PosthocAuditReviewDecision;
  reviewSignedEvidenceRef: string;
  reviewSignatureSha256: string;
  evidenceRefs: PosthocAuditSamplingEvidenceLink[];
  sourceCitationIds?: string[];
}

export interface PosthocAuditFinding {
  findingId: string;
  actionId: string;
  severity: PosthocAuditFindingSeverity;
  description: string;
  owner: string;
  openedAt: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PosthocAuditCorrectiveAction {
  correctiveActionId: string;
  findingId: string;
  owner: string;
  description: string;
  status: PosthocAuditCorrectiveActionStatus;
  dueAt: string;
  signedEvidenceRef: string;
  signatureSha256: string;
  regressionTestRef?: string;
}

export interface PosthocAuditScoreImpact {
  scoreImpactId: string;
  actionId: string;
  dimensionId: string;
  questionId: string;
  beforeScore: number;
  afterScore: number;
  impact: number;
  reason: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PosthocAuditSamplingRow {
  samplePlanId: string;
  actionId: string;
  agentId: string;
  policyId: string;
  completedAt: string;
  sampledAt: string;
  reviewerId: string;
  reviewDecision: PosthocAuditReviewDecision;
  findingIds: string[];
  correctiveActionIds: string[];
  scoreImpactIds: string[];
  scoreImpactQuestionIds: string[];
  scoreImpactValues: number[];
  sourceCitationIds: string[];
  evidenceRefs: PosthocAuditSamplingEvidenceLink[];
  samplePlanHash: string;
  findingsHash: string;
  correctiveActionsHash: string;
  scoreImpactHash: string;
  evidenceChainHash: string;
  rowHash: string;
}

export interface PosthocAuditSamplingReceipt {
  receiptId: string;
  generatedAt: string;
  sourceCitations: PosthocAuditSamplingSourceCitation[];
  rows: PosthocAuditSamplingRow[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface PosthocAuditSamplingVerification {
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

function rowHash(row: Omit<PosthocAuditSamplingRow, "rowHash">): string {
  return sha256Hex(canonicalize(row));
}

function receiptHash(receipt: Omit<PosthocAuditSamplingReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function evidenceRefsValid(evidenceRefs: PosthocAuditSamplingEvidenceLink[]): boolean {
  return evidenceRefs.length > 0 && evidenceRefs.every((evidence) => (
    Boolean(evidence.eventId)
    && Boolean(evidence.eventType)
    && Boolean(evidence.signedEvidenceRef)
    && isSha256(evidence.eventHash)
  ));
}

function samplePlanValid(plan: PosthocAuditSamplePlan | undefined): boolean {
  return Boolean(
    plan
    && plan.samplePlanId
    && plan.owner
    && plan.populationId
    && Number.isInteger(plan.populationSize)
    && Number.isInteger(plan.sampleSize)
    && plan.populationSize > 0
    && plan.sampleSize > 0
    && plan.sampleSize <= plan.populationSize
    && plan.samplingMethod
    && plan.riskTier
    && timestampPresent(plan.plannedAt)
    && signedRefValid(plan)
  );
}

function reviewedActionValid(action: PosthocAuditReviewedAction): boolean {
  return Boolean(
    action.actionId
    && action.samplePlanId
    && action.agentId
    && action.policyId
    && timestampPresent(action.completedAt)
    && timestampPresent(action.sampledAt)
    && action.reviewerId
    && action.reviewDecision
    && signedRefValid({
      signedEvidenceRef: action.reviewSignedEvidenceRef,
      signatureSha256: action.reviewSignatureSha256,
    })
  );
}

function findingValid(finding: PosthocAuditFinding): boolean {
  return Boolean(
    finding.findingId
    && finding.actionId
    && finding.severity
    && finding.description
    && finding.owner
    && timestampPresent(finding.openedAt)
    && signedRefValid(finding)
  );
}

function correctiveActionValid(action: PosthocAuditCorrectiveAction): boolean {
  return Boolean(
    action.correctiveActionId
    && action.findingId
    && action.owner
    && action.description
    && action.status
    && timestampPresent(action.dueAt)
    && signedRefValid(action)
  );
}

function scoreImpactValid(impact: PosthocAuditScoreImpact): boolean {
  return Boolean(
    impact.scoreImpactId
    && impact.actionId
    && impact.dimensionId
    && impact.questionId
    && Number.isFinite(impact.beforeScore)
    && Number.isFinite(impact.afterScore)
    && Number.isFinite(impact.impact)
    && impact.beforeScore >= 0
    && impact.beforeScore <= 1
    && impact.afterScore >= 0
    && impact.afterScore <= 1
    && impact.reason
    && signedRefValid(impact)
  );
}

export function buildPosthocAuditSamplingReceipt(input: {
  receiptId: string;
  sourceCitations: PosthocAuditSamplingSourceCitation[];
  samplePlans: PosthocAuditSamplePlan[];
  reviewedActions: PosthocAuditReviewedAction[];
  findings: PosthocAuditFinding[];
  correctiveActions: PosthocAuditCorrectiveAction[];
  scoreImpacts: PosthocAuditScoreImpact[];
  generatedAt?: string;
}): PosthocAuditSamplingReceipt {
  const failClosedReasons: string[] = [];
  const sourceIds = new Set(input.sourceCitations.map((citation) => citation.sourceId).filter(Boolean));
  if (sourceIds.size === 0) {
    failClosedReasons.push("sourceCitations:missing");
  }

  const samplePlansById = new Map(input.samplePlans.map((plan) => [plan.samplePlanId, plan]));
  const findingsByAction = new Map<string, PosthocAuditFinding[]>();
  const correctiveActionsByFinding = new Map<string, PosthocAuditCorrectiveAction[]>();
  const scoreImpactsByAction = new Map<string, PosthocAuditScoreImpact[]>();

  for (const plan of input.samplePlans) {
    if (!samplePlanValid(plan)) {
      failClosedReasons.push(`${plan.samplePlanId || "samplePlan"}:samplePlan:missing`);
    }
  }
  for (const finding of input.findings) {
    if (!findingValid(finding)) {
      failClosedReasons.push(`${finding.findingId || "finding"}:finding:missing`);
    }
    const existing = findingsByAction.get(finding.actionId) ?? [];
    existing.push(finding);
    findingsByAction.set(finding.actionId, existing);
  }
  for (const action of input.correctiveActions) {
    if (!correctiveActionValid(action)) {
      failClosedReasons.push(`${action.correctiveActionId || "correctiveAction"}:correctiveAction:missing`);
    }
    const existing = correctiveActionsByFinding.get(action.findingId) ?? [];
    existing.push(action);
    correctiveActionsByFinding.set(action.findingId, existing);
  }
  for (const impact of input.scoreImpacts) {
    if (!scoreImpactValid(impact)) {
      failClosedReasons.push(`${impact.scoreImpactId || "scoreImpact"}:scoreImpact:missing`);
    }
    const existing = scoreImpactsByAction.get(impact.actionId) ?? [];
    existing.push(impact);
    scoreImpactsByAction.set(impact.actionId, existing);
  }

  const rows = input.reviewedActions.map((action): PosthocAuditSamplingRow => {
    const sourceCitationIds = action.sourceCitationIds ?? [...sourceIds];
    const samplePlan = samplePlansById.get(action.samplePlanId);
    const findings = findingsByAction.get(action.actionId) ?? [];
    const correctiveActions = findings.flatMap((finding) => correctiveActionsByFinding.get(finding.findingId) ?? []);
    const scoreImpacts = scoreImpactsByAction.get(action.actionId) ?? [];

    if (sourceCitationIds.length === 0) {
      failClosedReasons.push(`${action.actionId}:sourceCitation:missing`);
    }
    if (sourceCitationIds.some((sourceId) => !sourceIds.has(sourceId))) {
      failClosedReasons.push(`${action.actionId}:sourceCitation:unknown`);
    }
    if (!samplePlanValid(samplePlan)) {
      failClosedReasons.push(`${action.samplePlanId || action.actionId}:samplePlan:missing`);
    }
    if (!reviewedActionValid(action)) {
      failClosedReasons.push(`${action.actionId}:reviewedAction:missing`);
    }
    if (!evidenceRefsValid(action.evidenceRefs)) {
      failClosedReasons.push(`${action.actionId}:evidenceChain:missing`);
    }
    if (action.reviewDecision !== "pass" && findings.length === 0) {
      failClosedReasons.push(`${action.actionId}:finding:missing`);
    }
    for (const finding of findings) {
      if ((correctiveActionsByFinding.get(finding.findingId) ?? []).length === 0) {
        failClosedReasons.push(`${finding.findingId}:correctiveAction:missing`);
      }
    }
    if (scoreImpacts.length === 0) {
      failClosedReasons.push(`${action.actionId}:scoreImpact:missing`);
    }

    const baseRow: Omit<PosthocAuditSamplingRow, "rowHash"> = {
      samplePlanId: action.samplePlanId,
      actionId: action.actionId,
      agentId: action.agentId,
      policyId: action.policyId,
      completedAt: action.completedAt,
      sampledAt: action.sampledAt,
      reviewerId: action.reviewerId,
      reviewDecision: action.reviewDecision,
      findingIds: findings.map((finding) => finding.findingId),
      correctiveActionIds: correctiveActions.map((correctiveAction) => correctiveAction.correctiveActionId),
      scoreImpactIds: scoreImpacts.map((impact) => impact.scoreImpactId),
      scoreImpactQuestionIds: scoreImpacts.map((impact) => impact.questionId),
      scoreImpactValues: scoreImpacts.map((impact) => impact.impact),
      sourceCitationIds,
      evidenceRefs: action.evidenceRefs,
      samplePlanHash: sha256Hex(canonicalize(samplePlan ?? null)),
      findingsHash: sha256Hex(canonicalize(findings)),
      correctiveActionsHash: sha256Hex(canonicalize(correctiveActions)),
      scoreImpactHash: sha256Hex(canonicalize(scoreImpacts)),
      evidenceChainHash: sha256Hex(canonicalize(action.evidenceRefs)),
    };

    return {
      ...baseRow,
      rowHash: rowHash(baseRow),
    };
  });

  if (input.samplePlans.length === 0) {
    failClosedReasons.push("samplePlans:missing");
  }
  if (rows.length === 0) {
    failClosedReasons.push("reviewedActions:missing");
  }

  const withoutHash: Omit<PosthocAuditSamplingReceipt, "receiptHash"> = {
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

export function verifyPosthocAuditSamplingReceipt(
  receipt: PosthocAuditSamplingReceipt
): PosthocAuditSamplingVerification {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  }
  if (receipt.rows.length === 0) {
    reasons.push("reviewedActions:missing");
  }
  for (const row of receipt.rows) {
    const { rowHash: actualRowHash, ...withoutRowHash } = row;
    if (rowHash(withoutRowHash) !== actualRowHash) {
      reasons.push(`${row.actionId}:rowHash:mismatch`);
    }
    if (!row.samplePlanId) {
      reasons.push(`${row.actionId}:samplePlan:missing`);
    }
    if (!row.agentId || !row.policyId || !row.reviewerId) {
      reasons.push(`${row.actionId}:reviewedAction:missing`);
    }
    if (!timestampPresent(row.completedAt) || !timestampPresent(row.sampledAt)) {
      reasons.push(`${row.actionId}:reviewTimestamp:missing`);
    }
    if (!evidenceRefsValid(row.evidenceRefs)) {
      reasons.push(`${row.actionId}:evidenceChain:missing`);
    }
    if (row.reviewDecision !== "pass" && row.findingIds.length === 0) {
      reasons.push(`${row.actionId}:finding:missing`);
    }
    if (row.findingIds.length > 0 && row.correctiveActionIds.length === 0) {
      reasons.push(`${row.actionId}:correctiveAction:missing`);
    }
    if (row.scoreImpactIds.length === 0) {
      reasons.push(`${row.actionId}:scoreImpact:missing`);
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

export function renderPosthocAuditSamplingAuditExport(receipt: PosthocAuditSamplingReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Post-Hoc Audit Sampling Export");
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
  lines.push("## Reviewed Rows");
  lines.push("");
  lines.push("| Sample plan | Reviewed action | Agent | Policy | Reviewer | Decision | Findings | Corrective actions | Score impact | Evidence chain |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of receipt.rows) {
    const values = [
      row.samplePlanId,
      row.actionId,
      row.agentId || "MISSING",
      row.policyId || "MISSING",
      row.reviewerId || "MISSING",
      row.reviewDecision,
      row.findingIds.join(", ") || "none",
      row.correctiveActionIds.join(", ") || "MISSING",
      row.scoreImpactQuestionIds.map((questionId, index) => `${questionId}:${row.scoreImpactValues[index] ?? "MISSING"}`).join(", ") || "MISSING",
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
