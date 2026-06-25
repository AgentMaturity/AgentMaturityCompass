import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type CostBudgetPeriod = "run" | "daily" | "weekly" | "monthly" | "quarterly" | "custom";
export type CostBudgetOwnerDecision = "continue" | "throttle" | "pause" | "escalate" | "waive";
export type CostBudgetRowStatus = "within_budget" | "warning" | "over_budget" | "missing_evidence";
export type PerAgentCostBudgetReceiptStatus = "pass" | "action_required" | "fail_closed";

export interface PerAgentCostBudgetSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface CostBudgetOwnerDecisionRecord {
  decision: CostBudgetOwnerDecision;
  decidedBy: string;
  decidedAt: string;
  rationale: string;
  evidenceRef: string;
}

export interface CostBudgetDefinition {
  budgetId: string;
  agentId: string;
  taskId?: string;
  owner: string;
  period: CostBudgetPeriod;
  budgetUsd: number;
  forecastUsd: number;
  budgetEvidenceRef: string;
  forecastEvidenceRef: string;
  ownerDecision?: CostBudgetOwnerDecisionRecord;
}

export interface CostBudgetToolPathSpendSnapshot {
  toolPathId: string;
  forecastUsd?: number;
  budgetUsd?: number;
  actualUsd: number;
  evidenceRef: string;
}

export interface CostBudgetSpendSnapshot {
  budgetId: string;
  agentId: string;
  periodStart: string;
  periodEnd: string;
  actualUsd: number;
  runCount: number;
  evidenceRef: string;
  toolPathSpend?: CostBudgetToolPathSpendSnapshot[];
}

export interface PerAgentCostBudgetToolPathRow {
  toolPathId: string;
  budgetUsd: number | null;
  forecastUsd: number | null;
  actualUsd: number;
  budgetUsedPct: number | null;
  forecastVarianceUsd: number | null;
  rowStatus: CostBudgetRowStatus;
  evidenceRef: string;
}

export interface PerAgentCostBudgetRow {
  budgetId: string;
  agentId: string;
  taskId: string | null;
  owner: string;
  period: CostBudgetPeriod;
  periodStart: string | null;
  periodEnd: string | null;
  budgetUsd: number;
  forecastUsd: number;
  actualUsd: number;
  runCount: number;
  budgetUsedPct: number;
  forecastVarianceUsd: number;
  forecastVariancePct: number;
  budgetVarianceUsd: number;
  ownerDecision: CostBudgetOwnerDecision | "missing";
  ownerDecisionBy: string | null;
  evidenceRefs: string[];
  toolPathRows: PerAgentCostBudgetToolPathRow[];
  rowStatus: CostBudgetRowStatus;
  rowHash: string;
}

export interface BuildPerAgentCostBudgetEvidenceReceiptInput {
  receiptId: string;
  sourceCitations: PerAgentCostBudgetSourceCitation[];
  budgets: CostBudgetDefinition[];
  spend: CostBudgetSpendSnapshot[];
  generatedAt?: string;
  warningThresholdPct?: number;
  forecastTolerancePct?: number;
}

export interface PerAgentCostBudgetEvidenceReceipt {
  receiptId: string;
  generatedAt: string;
  surfaceBindings: string[];
  sourceCitations: PerAgentCostBudgetSourceCitation[];
  rows: PerAgentCostBudgetRow[];
  requiredEvidenceRefs: string[];
  budgetMet: boolean;
  forecastVarianceWithinTolerance: boolean;
  status: PerAgentCostBudgetReceiptStatus;
  scorePenalty: number;
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface PerAgentCostBudgetEvidenceVerification {
  valid: boolean;
  reasons: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function safeNumber(value: number): number {
  return finite(value) ? value : 0;
}

function pct(numerator: number, denominator: number): number {
  if (!finite(numerator) || !finite(denominator) || denominator <= 0) {
    return 0;
  }
  return round((numerator / denominator) * 100);
}

function rowHash(row: Omit<PerAgentCostBudgetRow, "rowHash">): string {
  return sha256Hex(canonicalize(row));
}

function receiptHash(receipt: Omit<PerAgentCostBudgetEvidenceReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function sourceCitationReasons(citations: PerAgentCostBudgetSourceCitation[]): string[] {
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

function budgetDefinitionReasons(budget: CostBudgetDefinition): string[] {
  const reasons: string[] = [];
  if (!nonEmpty(budget.budgetId)) {
    reasons.push("budgetId:missing");
  }
  if (!nonEmpty(budget.agentId)) {
    reasons.push(`${budget.budgetId}:agentId:missing`);
  }
  if (!nonEmpty(budget.owner)) {
    reasons.push(`${budget.budgetId}:owner:missing`);
  }
  if (!finite(budget.budgetUsd) || budget.budgetUsd <= 0) {
    reasons.push(`${budget.budgetId}:budgetUsd:invalid`);
  }
  if (!finite(budget.forecastUsd) || budget.forecastUsd < 0) {
    reasons.push(`${budget.budgetId}:forecastUsd:invalid`);
  }
  if (!nonEmpty(budget.budgetEvidenceRef)) {
    reasons.push(`${budget.budgetId}:budgetEvidenceRef:missing`);
  }
  if (!nonEmpty(budget.forecastEvidenceRef)) {
    reasons.push(`${budget.budgetId}:forecastEvidenceRef:missing`);
  }
  if (!budget.ownerDecision) {
    reasons.push(`${budget.budgetId}:ownerDecision:missing`);
  } else {
    if (!nonEmpty(budget.ownerDecision.decidedBy)) {
      reasons.push(`${budget.budgetId}:ownerDecisionBy:missing`);
    }
    if (!nonEmpty(budget.ownerDecision.decidedAt)) {
      reasons.push(`${budget.budgetId}:ownerDecisionAt:missing`);
    }
    if (!nonEmpty(budget.ownerDecision.rationale)) {
      reasons.push(`${budget.budgetId}:ownerDecisionRationale:missing`);
    }
    if (!nonEmpty(budget.ownerDecision.evidenceRef)) {
      reasons.push(`${budget.budgetId}:ownerDecisionEvidenceRef:missing`);
    }
  }
  return reasons;
}

function spendReasons(budget: CostBudgetDefinition, spend: CostBudgetSpendSnapshot | undefined): string[] {
  if (!spend) {
    return [`${budget.budgetId}:actualSpend:missing`];
  }
  const reasons: string[] = [];
  if (spend.agentId !== budget.agentId) {
    reasons.push(`${budget.budgetId}:actualSpendAgent:mismatch`);
  }
  if (!nonEmpty(spend.periodStart) || !nonEmpty(spend.periodEnd)) {
    reasons.push(`${budget.budgetId}:actualSpendPeriod:missing`);
  }
  if (!finite(spend.actualUsd) || spend.actualUsd < 0) {
    reasons.push(`${budget.budgetId}:actualSpend:invalid`);
  }
  if (!Number.isInteger(spend.runCount) || spend.runCount < 0) {
    reasons.push(`${budget.budgetId}:runCount:invalid`);
  }
  if (!nonEmpty(spend.evidenceRef)) {
    reasons.push(`${budget.budgetId}:actualSpendEvidenceRef:missing`);
  }
  for (const toolPath of spend.toolPathSpend ?? []) {
    if (!nonEmpty(toolPath.toolPathId)) {
      reasons.push(`${budget.budgetId}:toolPathId:missing`);
    }
    if (!finite(toolPath.actualUsd) || toolPath.actualUsd < 0) {
      reasons.push(`${budget.budgetId}:toolPath:${toolPath.toolPathId}:actualSpend:invalid`);
    }
    if (toolPath.budgetUsd !== undefined && (!finite(toolPath.budgetUsd) || toolPath.budgetUsd < 0)) {
      reasons.push(`${budget.budgetId}:toolPath:${toolPath.toolPathId}:budgetUsd:invalid`);
    }
    if (toolPath.forecastUsd !== undefined && (!finite(toolPath.forecastUsd) || toolPath.forecastUsd < 0)) {
      reasons.push(`${budget.budgetId}:toolPath:${toolPath.toolPathId}:forecastUsd:invalid`);
    }
    if (!nonEmpty(toolPath.evidenceRef)) {
      reasons.push(`${budget.budgetId}:toolPath:${toolPath.toolPathId}:evidenceRef:missing`);
    }
  }
  return reasons;
}

function evidenceRefsFor(budget: CostBudgetDefinition, spend: CostBudgetSpendSnapshot | undefined): string[] {
  return [
    budget.budgetEvidenceRef,
    budget.forecastEvidenceRef,
    budget.ownerDecision?.evidenceRef ?? "",
    spend?.evidenceRef ?? "",
    ...(spend?.toolPathSpend ?? []).map((toolPath) => toolPath.evidenceRef)
  ].filter(nonEmpty);
}

function rowStatus(params: {
  missingEvidence: boolean;
  budgetUsedPct: number;
  warningThresholdPct: number;
}): CostBudgetRowStatus {
  if (params.missingEvidence) {
    return "missing_evidence";
  }
  if (params.budgetUsedPct > 100) {
    return "over_budget";
  }
  if (params.budgetUsedPct >= params.warningThresholdPct) {
    return "warning";
  }
  return "within_budget";
}

function buildToolPathRows(
  spend: CostBudgetSpendSnapshot | undefined,
  warningThresholdPct: number
): PerAgentCostBudgetToolPathRow[] {
  return (spend?.toolPathSpend ?? []).map((toolPath) => {
    const actualUsd = safeNumber(toolPath.actualUsd);
    const budgetUsd = toolPath.budgetUsd !== undefined && finite(toolPath.budgetUsd) ? toolPath.budgetUsd : null;
    const forecastUsd = toolPath.forecastUsd !== undefined && finite(toolPath.forecastUsd) ? toolPath.forecastUsd : null;
    const budgetUsedPct = budgetUsd && budgetUsd > 0 ? pct(actualUsd, budgetUsd) : null;
    const forecastVarianceUsd = forecastUsd !== null ? round(actualUsd - forecastUsd) : null;
    return {
      toolPathId: toolPath.toolPathId,
      budgetUsd,
      forecastUsd,
      actualUsd,
      budgetUsedPct,
      forecastVarianceUsd,
      rowStatus: rowStatus({
        missingEvidence: !nonEmpty(toolPath.evidenceRef) || !finite(toolPath.actualUsd),
        budgetUsedPct: budgetUsedPct ?? 0,
        warningThresholdPct
      }),
      evidenceRef: toolPath.evidenceRef
    };
  });
}

function buildRow(params: {
  budget: CostBudgetDefinition;
  spend: CostBudgetSpendSnapshot | undefined;
  warningThresholdPct: number;
  rowReasons: string[];
}): PerAgentCostBudgetRow {
  const budgetUsd = safeNumber(params.budget.budgetUsd);
  const forecastUsd = safeNumber(params.budget.forecastUsd);
  const actualUsd = safeNumber(params.spend?.actualUsd ?? Number.NaN);
  const budgetUsedPct = pct(actualUsd, budgetUsd);
  const base: Omit<PerAgentCostBudgetRow, "rowHash"> = {
    budgetId: params.budget.budgetId,
    agentId: params.budget.agentId,
    taskId: params.budget.taskId ?? null,
    owner: params.budget.owner,
    period: params.budget.period,
    periodStart: params.spend?.periodStart ?? null,
    periodEnd: params.spend?.periodEnd ?? null,
    budgetUsd,
    forecastUsd,
    actualUsd,
    runCount: params.spend?.runCount ?? 0,
    budgetUsedPct,
    forecastVarianceUsd: round(actualUsd - forecastUsd),
    forecastVariancePct: forecastUsd > 0 ? pct(actualUsd - forecastUsd, forecastUsd) : 0,
    budgetVarianceUsd: round(actualUsd - budgetUsd),
    ownerDecision: params.budget.ownerDecision?.decision ?? "missing",
    ownerDecisionBy: params.budget.ownerDecision?.decidedBy ?? null,
    evidenceRefs: evidenceRefsFor(params.budget, params.spend),
    toolPathRows: buildToolPathRows(params.spend, params.warningThresholdPct),
    rowStatus: rowStatus({
      missingEvidence: params.rowReasons.length > 0,
      budgetUsedPct,
      warningThresholdPct: params.warningThresholdPct
    })
  };
  return {
    ...base,
    rowHash: rowHash(base)
  };
}

export function buildPerAgentCostBudgetEvidenceReceipt(
  input: BuildPerAgentCostBudgetEvidenceReceiptInput
): PerAgentCostBudgetEvidenceReceipt {
  const warningThresholdPct = input.warningThresholdPct ?? 80;
  const forecastTolerancePct = input.forecastTolerancePct ?? 20;
  const spendByBudgetId = new Map(input.spend.map((spend) => [spend.budgetId, spend]));
  const failClosedReasons: string[] = [
    ...sourceCitationReasons(input.sourceCitations)
  ];
  if (!nonEmpty(input.receiptId)) {
    failClosedReasons.push("receiptId:missing");
  }
  if (input.budgets.length === 0) {
    failClosedReasons.push("budgets:missing");
  }

  const rows = input.budgets.map((budget) => {
    const spend = spendByBudgetId.get(budget.budgetId);
    const rowReasons = [
      ...budgetDefinitionReasons(budget),
      ...spendReasons(budget, spend)
    ];
    failClosedReasons.push(...rowReasons);
    return buildRow({ budget, spend, warningThresholdPct, rowReasons });
  });

  const dedupedReasons = unique(failClosedReasons);
  const budgetMet = rows.length > 0 && rows.every((row) => row.rowStatus !== "over_budget" && row.rowStatus !== "missing_evidence");
  const forecastVarianceWithinTolerance = rows.length > 0 && rows.every((row) => Math.abs(row.forecastVariancePct) <= forecastTolerancePct);
  const actionRequired = rows.some((row) => row.rowStatus === "warning" || row.rowStatus === "over_budget") || !forecastVarianceWithinTolerance;
  const status: PerAgentCostBudgetReceiptStatus = dedupedReasons.length > 0
    ? "fail_closed"
    : actionRequired
      ? "action_required"
      : "pass";

  const withoutHash: Omit<PerAgentCostBudgetEvidenceReceipt, "receiptHash"> = {
    receiptId: input.receiptId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    surfaceBindings: ["API", "Studio", "Fleet"],
    sourceCitations: input.sourceCitations,
    rows,
    requiredEvidenceRefs: unique(input.budgets.flatMap((budget) => evidenceRefsFor(budget, spendByBudgetId.get(budget.budgetId)))),
    budgetMet,
    forecastVarianceWithinTolerance,
    status,
    scorePenalty: Math.min(100, (dedupedReasons.length * 5) + (rows.filter((row) => row.rowStatus === "over_budget").length * 10) + (forecastVarianceWithinTolerance ? 0 : 5)),
    failClosed: dedupedReasons.length > 0,
    failClosedReasons: dedupedReasons
  };

  return {
    ...withoutHash,
    receiptHash: receiptHash(withoutHash)
  };
}

export function verifyPerAgentCostBudgetEvidenceReceipt(
  receipt: PerAgentCostBudgetEvidenceReceipt
): PerAgentCostBudgetEvidenceVerification {
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
  if (receipt.rows.length === 0) {
    reasons.push("rows:missing");
  }
  if (receipt.requiredEvidenceRefs.length === 0) {
    reasons.push("requiredEvidenceRefs:missing");
  }
  if (!receipt.surfaceBindings.includes("API") || !receipt.surfaceBindings.includes("Studio") || !receipt.surfaceBindings.includes("Fleet")) {
    reasons.push("surfaceBindings:missing");
  }
  for (const row of receipt.rows) {
    const { rowHash: actualRowHash, ...withoutRowHash } = row;
    if (rowHash(withoutRowHash) !== actualRowHash) {
      reasons.push(`${row.budgetId}:rowHash:mismatch`);
    }
    if (row.evidenceRefs.length === 0) {
      reasons.push(`${row.budgetId}:evidenceRefs:missing`);
    }
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

export function renderPerAgentCostBudgetEvidenceMarkdown(receipt: PerAgentCostBudgetEvidenceReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Per-Agent Cost Budget Evidence Receipt");
  lines.push("");
  lines.push(`- Receipt: \`${receipt.receiptId}\``);
  lines.push(`- Generated: \`${receipt.generatedAt}\``);
  lines.push(`- Status: ${receipt.status}`);
  lines.push(`- Surfaces: ${receipt.surfaceBindings.join(", ")}`);
  lines.push(`- Budget met: ${receipt.budgetMet ? "yes" : "no"}`);
  lines.push(`- Forecast variance within tolerance: ${receipt.forecastVarianceWithinTolerance ? "yes" : "no"}`);
  lines.push(`- Receipt hash: \`${receipt.receiptHash}\``);
  lines.push("");
  lines.push("## Budget Rows");
  lines.push("");
  lines.push("| Agent | Budget | Forecast | Actual | Budget used | Variance | Owner decision | Status |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |");
  for (const row of receipt.rows) {
    lines.push([
      row.agentId,
      `$${row.budgetUsd.toFixed(4)}`,
      `$${row.forecastUsd.toFixed(4)}`,
      `$${row.actualUsd.toFixed(4)}`,
      `${row.budgetUsedPct.toFixed(2)}%`,
      `$${row.budgetVarianceUsd.toFixed(4)}`,
      row.ownerDecision,
      row.rowStatus
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
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
