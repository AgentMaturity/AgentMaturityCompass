import { randomUUID } from "node:crypto";
import { openLedger } from "../ledger/ledger.js";
import type { SessionService } from "../session/sessionService.js";
import type { ToolExecution } from "../tools/toolTypes.js";
import { sha256Hex } from "../utils/hash.js";
import { acceptUnknownOption, budgetForAgent, evaluateBudgetStatus, loadVerifiedBudgetsConfig, requestTokenCeiling } from "./budgets.js";
import { budgetSessionAgent, LOCAL_STUB_USD_EXPOSURE, NATIVE_BUDGET_RESERVATION, projectBudgetUsage, readBudgetEvents } from "./nativeBudgetUsage.js";
import { workspaceSelfTrust } from "../trust/trustContext.js";
import { nativeUsdReservation, type NativeBudgetDispatch } from "./nativeUsdReservation.js";
import { reserveExperimentModelRequest } from "./experimentBudget.js";
import { nativeUsdUnits } from "./nativeUsdAmount.js";
import { STUB_DISPATCH_URL, STUB_PROVIDER_ID, STUB_PROVIDER_MODEL } from "../agent/stubProvider.js";
import { parseRequestHeaderMeta } from "../session/requestHeaderMeta.js";

export class NativeBudgetRefusal extends Error {
  readonly code = "AMC_NATIVE_BUDGET_REFUSED";
  constructor(message: string) { super(message); this.name = "NativeBudgetRefusal"; }
}

/** The command a person runs to accept earlier unknown usage and continue; it signs the acceptance into budgets.yaml. */
function acceptUnknownCommand(agentId: string): string {
  return `amc budgets reset --agent ${agentId} --accept-unknown`;
}

/**
 * Why the signed default `unknownTokenUsage: BLOCK` refuses, and how to continue (docs/BUDGETS.md, "Missing Usage and
 * Recovery"). Only requests AMC cannot bound block: one with a recorded output limit is counted at its upper estimate.
 */
function unknownUsageRefusal(agentId: string, unknown: number): string {
  return `${unknown} earlier model request(s) for agent ${agentId} ended without a usage report and with no upper estimate to count instead (the request set no output limit, or was recorded before AMC kept one),`
    + " so AMC cannot tell what they cost; the signed budget (unknownTokenUsage: BLOCK) refuses new model requests until the local budget day ends."
    + ` To continue now, check what those requests did (amc budgets status --agent ${agentId}), then run: ${acceptUnknownCommand(agentId)}`;
}

/** The unknown-usage block the next native model request of this agent would meet, or null when none applies. */
export function nativeUnknownUsageNotice(workspace: string, agentId: string): string | null {
  try {
    const status = evaluateBudgetStatus(workspace, agentId);
    if (!status.budgetConfigValid || status.nativeAdmissionPolicy.unknownTokenUsage !== "BLOCK") return null;
    const unknown = Math.max(status.usage.daily.blockingUnknownLlmTokenRequests, status.usage.minute.blockingUnknownLlmTokenRequests);
    return unknown > 0 ? unknownUsageRefusal(agentId, unknown) : null;
  } catch {
    return null; // Unverifiable evidence is reported by budgets verify/status, not guessed here.
  }
}

/** Where the cap's period ends, and how to change a cap on purpose. */
function capRefusal(what: string, agentId: string, daily: boolean): string {
  return `${what} for agent ${agentId}; new model requests are refused until ${daily ? "the local budget day ends (midnight)" : "the current minute passes"}.`
    + ` To change the limit on purpose, edit budgets.perAgent.${agentId} in .amc/budgets.yaml and run amc budgets sign.`;
}

/**
 * The exact signed request bytes go to the stub's never-resolving `.invalid` URL under the stub provider and model.
 * Such a dispatch cannot reach a paid provider, so a USD cap has nothing to bound; any other URL is not exempt.
 */
function localStubDispatch(headerJson: string | undefined, dispatch: NativeBudgetDispatch | undefined): boolean {
  const header = headerJson === undefined ? null : parseRequestHeaderMeta(headerJson);
  return !!header && !!dispatch && header.providerId === STUB_PROVIDER_ID && header.model === STUB_PROVIDER_MODEL
    && dispatch.url === STUB_DISPATCH_URL && sha256Hex(dispatch.body) === header.requestDigest;
}

type Spend = { kind: "llm"; nativeSessionId: string; headerEventId: string } |
  { kind: "tool"; nativeSessionId: string; toolToken: string; callId: string; actionClass: ToolExecution["actionClass"] };

/**
 * One workspace transaction covers read/check/reserve across CLI processes.
 * The reservation is a signed, sealed audit, not a mutable counter or expiring
 * lease. A missing outcome stays pending; only matching recorded facts settle it.
 * This is admission against known usage, not a tokenizer or pricing oracle.
 */
/** `peek`: check a tool spend against the limit and write nothing (the early look before a person is asked, UX-03). */
function reserve(workspace: string, spend: Spend, agentId?: string, dispatch?: NativeBudgetDispatch, peek = false): void {
  // An unsigned reservation would make every later signed budget read fail, so AMC_NO_SIGN=1 admits nothing.
  if (process.env.AMC_NO_SIGN === "1") throw new NativeBudgetRefusal("native budget admission records a signed reservation; AMC_NO_SIGN=1 cannot reserve, so the dispatch is refused");
  const ledger = openLedger(workspace);
  try {
    ledger.db.transaction(() => {
      const config = loadVerifiedBudgetsConfig(workspace);
      const rows = readBudgetEvents(workspace, ledger, { trust: workspaceSelfTrust(workspace) });
      const owner = spend.kind === "llm" ? budgetSessionAgent(rows, spend.nativeSessionId) : agentId;
      if (!owner) throw new NativeBudgetRefusal("native budget identity is missing");
      // Toolset identity is inherited from the root. When a native session
      // exists, a forged tool agent cannot move its spend to a fresh account.
      if (rows.some(row => row.session_id === spend.nativeSessionId && row.event_type === "session/open") &&
          budgetSessionAgent(rows, spend.nativeSessionId) !== owner) throw new NativeBudgetRefusal("native budget identity differs from the session owner");
      const header = spend.kind === "llm" ? rows.find(row => row.id === spend.headerEventId && row.session_id === spend.nativeSessionId && row.event_type === "request/header") : undefined;
      const budget = budgetForAgent(config, owner);
      if (!budget) throw new NativeBudgetRefusal("no signed budget applies to this native agent");
      const now = Date.now();
      const usage = projectBudgetUsage(rows, owner, now, acceptUnknownOption(budget));
      let usd: ReturnType<typeof nativeUsdReservation> | { usdExposure: typeof LOCAL_STUB_USD_EXPOSURE } | undefined;
      let ceiling: number | null = null;
      if (spend.kind === "tool") {
        const limit = budget.daily.maxToolExecutes[spend.actionClass];
        if (limit !== undefined && usage.daily.toolExecutes[spend.actionClass] + usage.daily.toolPending[spend.actionClass] >= limit) {
          throw new NativeBudgetRefusal(`daily tool budget exhausted for ${spend.actionClass}`);
        }
        if (peek) return;
      } else {
        const stub = localStubDispatch(header?.meta_json, dispatch);
        if (usage.daily.llmRequests >= budget.daily.maxLlmRequests) {
          throw new NativeBudgetRefusal(capRefusal(`native model request budget exhausted: ${usage.daily.llmRequests} of ${budget.daily.maxLlmRequests} requests used today`, owner, true));
        }
        if (usage.minute.llmRequests >= budget.perMinute.maxLlmRequests) {
          throw new NativeBudgetRefusal(capRefusal(`native model request budget exhausted: ${usage.minute.llmRequests} of ${budget.perMinute.maxLlmRequests} requests used in the last minute`, owner, false));
        }
        // The stub cannot spend, so unknown spend elsewhere does not stop it; the request and token caps still do.
        const unknown = Math.max(usage.daily.blockingUnknownLlmTokenRequests, usage.minute.blockingUnknownLlmTokenRequests);
        if (!stub && budget.unknownTokenUsage !== "ALLOW_WITH_WARNING" && unknown > 0) throw new NativeBudgetRefusal(unknownUsageRefusal(owner, unknown));
        if (usage.daily.llmTokens >= budget.daily.maxLlmTokens) {
          throw new NativeBudgetRefusal(capRefusal(`native model token budget exhausted: ${usage.daily.llmTokens} of ${budget.daily.maxLlmTokens} tokens counted today (a request without a usage report counts at its upper estimate)`, owner, true));
        }
        if (usage.minute.llmTokens >= budget.perMinute.maxLlmTokens) {
          throw new NativeBudgetRefusal(capRefusal(`native model token budget exhausted: ${usage.minute.llmTokens} of ${budget.perMinute.maxLlmTokens} tokens counted in the last minute`, owner, false));
        }
        if (!stub && dispatch) ceiling = requestTokenCeiling(dispatch.body);
        if (stub) usd = { usdExposure: LOCAL_STUB_USD_EXPOSURE };
        else if (budget.daily.maxCostUsd !== null) {
          if (usage.daily.llmUnreservedCostRequests > 0) throw new NativeBudgetRefusal("USD exposure is unknown for a prior dispatch without a price reservation");
          if (!header) throw new NativeBudgetRefusal("USD reservation has no matching request header");
          let bound: ReturnType<typeof nativeUsdReservation>;
          try { bound = nativeUsdReservation(budget, header.meta_json, dispatch, now); }
          catch (error) { throw new NativeBudgetRefusal(error instanceof Error ? error.message : "USD request bound is unavailable"); }
          usd = bound;
          if (BigInt(usage.daily.llmBudgetCostUnits) + nativeUsdUnits(bound.reservedCostUsd) > nativeUsdUnits(budget.daily.maxCostUsd, false)) throw new NativeBudgetRefusal("USD budget exhausted by measured spend plus request reservations");
        }
      }
      const sessionId = `native-budget-${randomUUID()}`;
      const reservationKey = spend.kind === "llm" ? `llm:${spend.nativeSessionId}:${spend.headerEventId}` : `tool:${spend.nativeSessionId}:${spend.toolToken}`;
      if (rows.some(row => row.event_type === "audit" && JSON.parse(row.meta_json).reservationKey === reservationKey)) throw new NativeBudgetRefusal("native dispatch was already reserved");
      const experiment = spend.kind === "llm" ? reserveExperimentModelRequest(workspace, owner, budget, header?.meta_json ?? "",
        dispatch, now, spend.headerEventId, spend.nativeSessionId) : undefined;
      const meta = { auditType: NATIVE_BUDGET_RESERVATION, agentId: owner, trustTier: "OBSERVED", reservationKey, ...spend, ...usd,
        ...(ceiling === null ? {} : { tokenCeiling: ceiling }), ...experiment };
      ledger.startSession({ sessionId, runtime: "amc", binaryPath: "amc-native-budget-admission", binarySha256: sha256Hex("amc-native-budget-admission-v1") });
      // Inline, like the other audit rows: the small reservation record stays verifiable without the vault's blob key.
      ledger.appendEvidence({ sessionId, runtime: "amc", eventType: "audit", payload: JSON.stringify(meta), payloadExt: "json", inline: true, meta });
      ledger.sealSession(sessionId);
    }).immediate();
  } finally { ledger.close(); }
}

export function reserveNativeModelBudget(session: SessionService, headerEventId: string, dispatch?: NativeBudgetDispatch): void {
  reserve(session.workspace, { kind: "llm", nativeSessionId: session.sessionId, headerEventId }, undefined, dispatch);
}

export function reserveNativeToolBudget(execution: ToolExecution, sessionId: string): string | undefined {
  // UX-03: on the early look (run as SIMULATE) a call that will run as EXECUTE is refused when its budget is already
  // spent, so nobody is asked about it; nothing is reserved until the real EXECUTE after the approval.
  const peek = execution.preApproval?.mode === "EXECUTE";
  if (execution.effectiveMode !== "EXECUTE" && !peek) return undefined;
  if (execution.signal?.aborted) return "native tool cancelled before budget admission";
  try {
    reserve(execution.workspace, { kind: "tool", nativeSessionId: sessionId, toolToken: execution.token, callId: execution.callId, actionClass: execution.actionClass }, execution.agentId, undefined, peek);
    return undefined;
  } catch (error) { return error instanceof Error ? error.message : "native budget admission failed"; }
}
