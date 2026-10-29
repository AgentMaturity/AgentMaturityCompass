import { parseWindowToMs } from "../utils/time.js";
import { canonicalize } from "../utils/json.js";
import { openLedger, verifyEvidenceEventIntegrity, type Ledger } from "../ledger/ledger.js";
import { readdirSync } from "node:fs";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { measuredUsage } from "../budgets/nativeBudgetUsage.js";
import type { EvidenceEvent } from "../types.js";
import { caseFileSha256, loadCase, loadCasebook, verifyCasebook } from "./casebookStore.js";

/**
 * The identity one case execution stamps on its ledger rows (meta key `caseExecution`). A bound casebook run counts
 * only signed ledger rows carrying exactly this identity; nothing else in the window can satisfy or cost the case.
 */
export interface CaseExecutionRef {
  v: 1;
  casebookId: string;
  caseId: string;
  /** sha256 of the signed case file bytes the execution ran. */
  caseSha256: string;
  trialId: string;
  /** Digest of the effective configuration the execution ran under. */
  configDigest: string;
}

type CaseRunStatus = "passed" | "failed" | "unavailable";

interface CaseRunResult {
  caseId: string;
  title: string;
  /** `unavailable`: the evidence needed to judge the case is missing; neither a pass nor a behavioural failure. */
  status: CaseRunStatus;
  /** Kept for existing readers: true only when status is `passed`. */
  success: boolean;
  valuePoints: number;
  reasons: string[];
  /** Measured tokens of the case's own llm_response rows; null when no attributable complete usage exists. */
  costTokens: number | null;
  /** Null when no readable correlation ratio exists. */
  correlationRatio: number | null;
  /** Null for a legacy observational window run, which is never promotion-eligible. */
  execution: (CaseExecutionRef & { eventIds: string[] }) | null;
}

interface CasebookTrial {
  trialId: string;
  configDigest: string;
}

function parseMeta(event: EvidenceEvent): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(event.meta_json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** The latest diagnostic correlation ratio, or null when it is missing, unreadable or out of range. */
function latestCorrelationRatio(workspace: string, agentId: string): number | null {
  const paths = getAgentPaths(workspace, agentId);
  if (!pathExists(paths.runsDir)) return null;
  const files = readdirSync(paths.runsDir).filter((name) => name.endsWith(".json")).sort((a, b) => a.localeCompare(b));
  if (files.length === 0) return null;
  try {
    const latest = JSON.parse(readUtf8(`${paths.runsDir}/${files[files.length - 1]}`)) as { correlationRatio?: unknown };
    const ratio = latest.correlationRatio;
    return typeof ratio === "number" && Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : null;
  } catch {
    return null;
  }
}

function sameExecution(meta: Record<string, unknown>, expected: CaseExecutionRef): boolean {
  const claimed = meta.caseExecution;
  return !!claimed && typeof claimed === "object" && !Array.isArray(claimed) && canonicalize(claimed) === canonicalize(expected);
}

/** Tokens of llm_response rows; null unless every row reports complete usage (measuredUsage: totals win, aliases once). */
function measuredTokens(events: readonly { event: EvidenceEvent; meta: Record<string, unknown> }[]): number | null {
  const responses = events.filter(({ event }) => event.event_type === "llm_response");
  // No attributable usage row is unknown cost, not zero cost.
  if (responses.length === 0) return null;
  let tokens = 0;
  for (const { meta } of responses) {
    const usage = measuredUsage(meta.usage, false);
    if (!usage.tokensKnown) return null;
    tokens += usage.tokens;
  }
  return tokens;
}

function judgeCase(params: {
  ledger: Ledger;
  mode: "supervise" | "sandbox";
  kase: ReturnType<typeof loadCase>;
  evidence: readonly { event: EvidenceEvent; meta: Record<string, unknown> }[];
  /** Audit rows in the window not attributed to any case execution; a forbidden one fails every bound case. */
  unattributedAudits: readonly string[];
  correlationRatio: number | null;
}): { status: CaseRunStatus; reasons: string[] } {
  const { kase, evidence, correlationRatio } = params;
  const failed: string[] = [];
  const unavailable: string[] = [];
  if ((kase.riskTier === "high" || kase.riskTier === "critical") && params.mode !== "sandbox") {
    failed.push("high-risk case requires sandbox mode");
  }
  for (const audit of kase.validators.forbiddenAudits) {
    if (params.unattributedAudits.includes(audit)) failed.push(`forbidden audit in the evidence window is not attributable to another execution: ${audit}`);
  }
  // Nothing ran: missing evidence is neither a pass nor a behavioural failure of any evidence validator.
  if (evidence.length === 0) return { status: failed.length > 0 ? "failed" : "unavailable", reasons: [...failed, "no execution evidence for case"] };
  if (kase.validators.minCorrelationRatio > 0) {
    if (correlationRatio === null) unavailable.push("correlation ratio unavailable");
    else if (kase.validators.minCorrelationRatio > correlationRatio) {
      failed.push(`correlation ratio ${correlationRatio.toFixed(3)} below required ${kase.validators.minCorrelationRatio.toFixed(3)}`);
    }
  }
  const audits = evidence.filter(({ event }) => event.event_type === "audit")
    .map(({ meta }) => typeof meta.auditType === "string" ? meta.auditType : "");
  for (const audit of kase.validators.forbiddenAudits) {
    if (audits.includes(audit)) failed.push(`forbidden audit detected: ${audit}`);
  }
  const toolActions = evidence.filter(({ event }) => event.event_type === "tool_action");
  const toolNames = new Set(toolActions.map(({ meta }) => meta.toolName).filter((name): name is string => typeof name === "string"));
  for (const required of kase.validators.requiredToolActions) {
    if (!toolNames.has(required)) failed.push(`required tool action missing: ${required}`);
  }
  if (kase.validators.requireReceipts) {
    if (toolActions.length === 0) unavailable.push("no tool action receipt to verify");
    for (const { event } of toolActions) {
      const verified = verifyEvidenceEventIntegrity({ ledger: params.ledger, eventId: event.id, requireReceipt: true });
      if (!verified.ok) failed.push(`tool action ${event.id} receipt did not verify`);
    }
  }
  const reasons = [...failed, ...unavailable];
  return { status: failed.length > 0 ? "failed" : unavailable.length > 0 ? "unavailable" : "passed", reasons };
}

function runCasebookAtWindow(params: {
  workspace: string;
  agentId?: string;
  casebookId: string;
  mode: "supervise" | "sandbox";
  window?: string;
  /** Explicit closed evidence range; overrides `window`. */
  range?: { startedTs: number; endedTs: number };
  /** Bound mode: only rows stamped with this trial's case execution identity count. Absent: legacy window. */
  trial?: CasebookTrial;
}, actualLedger?: Ledger): {
  casebookId: string;
  agentId: string;
  mode: "supervise" | "sandbox";
  startedTs: number;
  endedTs: number;
  trial: CasebookTrial | null;
  results: CaseRunResult[];
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const verify = verifyCasebook(params.workspace, params.casebookId, agentId);
  if (!verify.valid) {
    throw new Error(`casebook verification failed: ${verify.reasons.join("; ")}`);
  }
  if (params.trial && (!params.trial.trialId || !/^[a-f0-9]{64}$/.test(params.trial.configDigest))) {
    throw new Error("casebook trial requires a trialId and a sha256 configDigest");
  }
  const loaded = loadCasebook(params.workspace, params.casebookId, agentId);
  const start = params.range?.startedTs ?? Date.now() - parseWindowToMs(params.window ?? "14d");
  const end = params.range?.endedTs ?? Date.now();
  if (!(Number.isFinite(start) && Number.isFinite(end) && start <= end)) throw new Error("casebook evidence range is invalid");
  const correlationRatio = latestCorrelationRatio(params.workspace, agentId);
  if (actualLedger !== undefined && actualLedger.workspace !== params.workspace) throw new Error("casebook reader belongs to another workspace");
  const ledger = actualLedger ?? openLedger(params.workspace);
  try {
    const evidence = ledger.getEventsBetween(start, end)
      .map((event) => ({ event, meta: parseMeta(event) }))
      .filter((row): row is { event: EvidenceEvent; meta: Record<string, unknown> } => row.meta !== null && (row.meta.agentId ?? "default") === agentId);

    // Bound mode: an unstamped audit cannot be ruled out as this execution's, so it is checked against every case.
    const unattributedAudits = params.trial ? evidence
      .filter(({ event, meta }) => event.event_type === "audit" && meta.caseExecution === undefined)
      .map(({ meta }) => typeof meta.auditType === "string" ? meta.auditType : "") : [];
    const results: CaseRunResult[] = loaded.casebook.caseIds.map((caseId) => {
      const kase = loadCase(params.workspace, params.casebookId, caseId, agentId);
      const ref: CaseExecutionRef | null = params.trial ? {
        v: 1, casebookId: params.casebookId, caseId: kase.caseId,
        caseSha256: caseFileSha256(params.workspace, params.casebookId, caseId, agentId),
        trialId: params.trial.trialId, configDigest: params.trial.configDigest
      } : null;
      // A legacy window cannot attribute rows to a case: every case sees the whole window and no case gets a cost.
      const own = ref ? evidence.filter(({ meta }) => sameExecution(meta, ref)) : evidence;
      const judged = judgeCase({ ledger, mode: params.mode, kase, evidence: own, unattributedAudits, correlationRatio });
      return {
        caseId: kase.caseId,
        title: kase.title,
        status: judged.status,
        success: judged.status === "passed",
        valuePoints: judged.status === "passed" ? kase.scoring.valuePoints : 0,
        reasons: judged.reasons,
        costTokens: ref && own.length > 0 ? measuredTokens(own) : null,
        correlationRatio,
        execution: ref ? { ...ref, eventIds: own.map(({ event }) => event.id) } : null
      };
    });

    return {
      casebookId: params.casebookId,
      agentId,
      mode: params.mode,
      startedTs: start,
      endedTs: end,
      trial: params.trial ?? null,
      results
    };
  } finally {
    if (actualLedger === undefined) ledger.close();
  }
}

/** Existing public API and return shape; default evidence clocks remain unchanged. */
export function runCasebook(params: Parameters<typeof runCasebookAtWindow>[0]): ReturnType<typeof runCasebookAtWindow> {
  return runCasebookAtWindow(params);
}

/** Internal experiment publication consumer: revalidate the same actual read-only evidence windows and validators. */
export function assertCasebookRunCurrent(params: Parameters<typeof runCasebook>[0], prepared: ReturnType<typeof runCasebook>, actualLedger?: Ledger): void {
  const current = runCasebookAtWindow({ ...params, range: { startedTs: prepared.startedTs, endedTs: prepared.endedTs },
    trial: prepared.trial ?? undefined }, actualLedger);
  if (canonicalize(current) !== canonicalize(prepared)) throw new Error("experiment casebook inputs changed while signing");
}
