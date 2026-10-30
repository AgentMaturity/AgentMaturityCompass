import { projectNativeRunUsage, type NativeRunUsage } from "../agent/nativeRunUsage.js";
import { budgetMeta, budgetSessionAgent, measuredUsage, readBudgetEvents, NATIVE_BUDGET_RESERVATION } from "../budgets/nativeBudgetUsage.js";
import { projectNativeCost, type NativeCostProjection } from "../budgets/nativeCostProjection.js";
import type { ExperimentCostStage } from "./experimentResourceUsage.js";
import type { CaseExecutionRef } from "../casebooks/casebookRunner.js";
import { displayEvidenceIdentifier } from "../session/evidenceIdentifier.js";
import { parseRequestHeaderMeta } from "../session/requestHeaderMeta.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface TrialRequestReceipt {
  readonly headerEventId: string | null;
  readonly outcomeEventId: string | null;
  readonly dispatchAttempted: boolean | null;
  readonly outcome: "completed" | "failed" | "pending";
  readonly providerId: string | null;
  readonly model: string | null;
  readonly encoderId: string | null;
  readonly encoderVersion: number;
  readonly adapterId: string | null;
  readonly adapterVersion: number | null;
  readonly paramsDigest: string;
  readonly systemPromptSha256: string | null;
  readonly toolSchemaSha256: string | null;
  /** Whether the header resolves its system/tool commitments; endpoint identity remains separate. */
  readonly configurationComplete: boolean;
  readonly modelMetadataDigest: string | null;
  readonly requestDigest: string;
  readonly requestIdentityDigest: string | null;
  /** Effective request settings, independent of the case's prompt and admitted persona. */
  readonly routeConfigDigest: string;
  /** Route settings plus admitted persona, session composition/policy and offered tool schema. */
  readonly effectiveConfigDigest: string;
  /** Existing native request evidence does not attest an endpoint identity. */
  readonly endpointIdentity: "unavailable";
}

export interface TrialSessionReceipt {
  readonly sessionId: string | null;
  readonly closed: boolean;
  readonly effectiveConfigDigests: readonly string[];
  readonly requests: readonly TrialRequestReceipt[];
  readonly usage: Omit<NativeRunUsage, "cost">;
  readonly cost: NativeCostProjection | null;
  /** Request groups use signed native admission stage markers; ordinary trials default to executor. */
  readonly costStages: readonly ExperimentCostStage[];
}

export interface TrialResourceReceipt {
  readonly receiptState: "recorded" | "unavailable" | "invalid";
  readonly evidenceBasis: "verified-native-sessions-with-exact-case-execution";
  readonly sessions: readonly TrialSessionReceipt[];
  /** Known reported subtotal only. Completeness remains separate. */
  readonly observedTokens: number | null;
  readonly tokensComplete: boolean;
  /** Available only when every request has final provider-reported cost; estimates never settle reservations. */
  readonly reportedCostUsd: number | null;
  readonly costComplete: boolean;
}

const digest = (value: unknown) => sha256Hex(canonicalize(value));
const sameExecution = (row: EvidenceEvent, expected: CaseExecutionRef) =>
  canonicalize(budgetMeta(row).caseExecution ?? null) === canonicalize(expected);

function requestReceipts(rows: readonly EvidenceEvent[], configDigest: string): TrialRequestReceipt[] {
  const opened = budgetMeta(rows.find(row => row.event_type === "session/open")!);
  return rows.filter(row => row.event_type === "request/header").map<TrialRequestReceipt>(row => {
    const header = parseRequestHeaderMeta(row.meta_json);
    if (header === null) throw new Error("Experiment request configuration evidence is malformed");
    const settled = rows.find(value => ["request/response", "request/failure"].includes(value.event_type)
      && budgetMeta(value).headerEventId === row.id);
    const outcome = settled === undefined ? null : budgetMeta(settled);
    const paramsDigest = digest(header.params);
    const systemPromptSha256 = rows.find(value => value.id === header.systemPromptEventId && value.event_type === "system/prompt")?.payload_sha256 ?? null;
    const toolSchemaSha256 = header.toolSchemaEventId === null ? null : rows.find(value => value.id === header.toolSchemaEventId
      && value.event_type === "request/tools" && value.payload_sha256 === header.toolSchemaSha256)?.payload_sha256 ?? null;
    const adapterVersion = typeof outcome?.adapterVersion === "number" && Number.isSafeInteger(outcome.adapterVersion)
      && outcome.adapterVersion > 0 ? outcome.adapterVersion : null;
    const routeConfigDigest = digest({ providerId: header.providerId, model: header.model,
      encoderId: header.encoderId, encoderVersion: header.encoderVersion, paramsDigest,
      modelMetadataDigest: header.modelMetadata?.digest ?? null,
      adapterId: outcome?.adapterId ?? null, adapterVersion });
    return { headerEventId: displayEvidenceIdentifier(row.id), outcomeEventId: settled ? displayEvidenceIdentifier(settled.id) : null,
      dispatchAttempted: typeof outcome?.dispatchAttempted === "boolean" ? outcome.dispatchAttempted : null,
      outcome: settled === undefined ? "pending" : settled.event_type === "request/response" ? "completed" : "failed",
      providerId: displayEvidenceIdentifier(header.providerId), model: displayEvidenceIdentifier(header.model),
      encoderId: displayEvidenceIdentifier(header.encoderId), encoderVersion: header.encoderVersion,
      adapterId: displayEvidenceIdentifier(outcome?.adapterId), adapterVersion, paramsDigest, systemPromptSha256, toolSchemaSha256,
      configurationComplete: systemPromptSha256 !== null && (header.toolSchemaEventId === null || toolSchemaSha256 !== null)
        && adapterVersion !== null && typeof outcome?.adapterId === "string",
      modelMetadataDigest: header.modelMetadata?.digest ?? null, requestDigest: header.requestDigest,
      requestIdentityDigest: header.requestIdentityDigest ?? null, routeConfigDigest,
      effectiveConfigDigest: digest({ configDigest, routeConfigDigest, compositionDigest: opened.compositionDigest ?? null,
        policyDigest: opened.policyDigest ?? null, systemPromptSha256, toolSchemaSha256 }), endpointIdentity: "unavailable" as const };
  });
}


/** Split one session at the native dispatch admission boundary, never by copying its aggregate cost into each role. */
function sessionCostStages(rows: readonly EvidenceEvent[], sessionRows: readonly EvidenceEvent[], sessionId: string, closed: boolean): ExperimentCostStage[] {
  const groups = new Map<string, Set<string>>();
  const agentId = budgetSessionAgent(sessionRows, sessionId);
  for (const header of sessionRows.filter(row => row.event_type === "request/header")) {
    const markers = rows.filter(row => row.event_type === "audit" && budgetMeta(row).auditType === NATIVE_BUDGET_RESERVATION
      && budgetMeta(row).headerEventId === header.id);
    if (markers.length > 1) throw new Error("Experiment native request has ambiguous stage reservations");
    const marker = markers[0] === undefined ? null : budgetMeta(markers[0]);
    if (marker !== null && (marker.kind !== "llm" || marker.nativeSessionId !== sessionId || marker.agentId !== agentId
      || marker.reservationKey !== `llm:${sessionId}:${header.id}`)) throw new Error("Experiment stage reservation identity is invalid");
    const stage = marker?.experimentStage === undefined ? "executor" : marker.experimentStage;
    if (typeof stage !== "string" || !["executor", "baseline", "candidate", "proposer", "judge"].includes(stage)
      || (marker?.experimentStage !== undefined && stage === "executor")) throw new Error("Experiment native request stage marker is invalid");
    const ids = groups.get(stage) ?? new Set<string>();
    ids.add(header.id); groups.set(stage, ids);
  }
  return [...groups].map(([stage, ids]) => {
    const selected = sessionRows.filter(row => (row.event_type === "request/header" && ids.has(row.id))
      || (["request/response", "request/failure"].includes(row.event_type) && ids.has(String(budgetMeta(row).headerEventId))));
    const cost = projectNativeCost(selected, sessionId);
    if (cost.status === "invalid") throw new Error("Experiment stage native cost evidence is invalid");
    return { stage, role: stage === "judge" || stage === "proposer" ? stage : "executor",
      state: closed ? "settled" : "unknown", cost };
  });
}

/** Resolve only authoritative signed rows; the runner cannot supply measured counters or request settings. */
export function collectTrialReceipts(workspace: string, expected: { readonly agentId: string; readonly caseExecution: CaseExecutionRef }): TrialResourceReceipt {
  const rows = readBudgetEvents(workspace);
  const selected = rows.filter(row => sameExecution(row, expected.caseExecution));
  const sessionIds = new Set(selected.filter(row => row.event_type === "session/open").map(row => row.session_id));
  if (selected.some(row => ["request/header", "request/response", "request/failure"].includes(row.event_type) && !sessionIds.has(row.session_id))) {
    throw new Error("Experiment native request has no matching stamped session/open");
  }
  let observedTokens = 0, reportedCost = 0, reportedRequests = 0;
  let tokensComplete = sessionIds.size > 0, costComplete = sessionIds.size > 0, requests = 0;
  const sessions: TrialSessionReceipt[] = [];
  for (const sessionId of sessionIds) {
    if (budgetSessionAgent(rows, sessionId) !== expected.agentId) throw new Error("Experiment native session belongs to another agent");
    const sessionRows = rows.filter(row => row.session_id === sessionId);
    if (sessionRows.some(row => !sameExecution(row, expected.caseExecution) || budgetMeta(row).agentId !== expected.agentId)) {
      throw new Error("Experiment native session changed its case execution identity");
    }
    const closes = sessionRows.filter(row => row.event_type === "session/close");
    if (closes.length > 1) throw new Error("Experiment native session has multiple close records");
    const closed = closes.length === 1;
    const projected = projectNativeRunUsage(sessionRows, sessionId);
    if (projected.status === "invalid" || projected.cost?.status === "invalid") throw new Error("Experiment native usage evidence is invalid");
    const { cost, ...usage } = projected;
    const receipts = requestReceipts(sessionRows, expected.caseExecution.configDigest);
    const measured = measuredUsage({ reported: usage.reportedRequests > 0, complete: usage.status === "recorded",
      ...Object.fromEntries(Object.entries(usage.totals).map(([key, value]) => [key, value.observedTokens])) }, true);
    observedTokens += measured.tokens;
    reportedRequests += usage.reportedRequests;
    requests += usage.requests;
    if (!Number.isSafeInteger(observedTokens)) throw new Error("Experiment measured token subtotal overflow");
    tokensComplete &&= closed && usage.requests > 0 && usage.syntheticRequests === 0 && measured.tokensKnown
      && ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"].every(key =>
        usage.totals[key as keyof typeof usage.totals].reportedRequests === usage.requests);
    const measuredCosts = sessionRows.filter(row => row.event_type === "request/response").map(row => budgetMeta(row));
    costComplete &&= closed && usage.requests > 0 && usage.syntheticRequests === 0 && measuredCosts.length === usage.requests
      && measuredCosts.every(meta => {
        const usage = meta.usage as Record<string, unknown> | undefined;
        return meta.dispatchAttempted === true && usage?.reported === true && usage.complete === true && measuredUsage(usage, true).costKnown;
      });
    reportedCost += cost?.reportedSubtotalUsd ?? 0;
    if (!Number.isFinite(reportedCost)) throw new Error("Experiment measured USD subtotal overflow");
    sessions.push({ sessionId: displayEvidenceIdentifier(sessionId), closed, requests: receipts,
      effectiveConfigDigests: [...new Set(receipts.map(receipt => receipt.effectiveConfigDigest))], usage, cost: cost ?? null,
      costStages: sessionCostStages(rows, sessionRows, sessionId, closed) });
  }
  return { receiptState: requests > 0 ? "recorded" : "unavailable", evidenceBasis: "verified-native-sessions-with-exact-case-execution",
    sessions, observedTokens: reportedRequests > 0 ? observedTokens : null, tokensComplete,
    reportedCostUsd: costComplete ? reportedCost : null, costComplete };
}
