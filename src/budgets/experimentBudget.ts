import { AsyncLocalStorage } from "node:async_hooks";
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { budgetForAgent, loadVerifiedBudgetsConfig, type BudgetsConfig } from "./budgets.js";
import { nativeUsdReservation, type NativeBudgetDispatch } from "./nativeUsdReservation.js";
import { readBudgetEvents, budgetMeta } from "./nativeBudgetUsage.js";
import { summarizeExperimentRoleCosts, type ExperimentCostStage } from "../experiments/experimentResourceUsage.js";
import { projectNativeCost, type NativeCostProjection } from "./nativeCostProjection.js";
import { nativeUsdUnits } from "./nativeUsdAmount.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import type { TrialBudgetHook, TrialBudgetPlan, CaseExecutionRecord, TrialRunInput } from "../experiments/trialExecutor.js";

type Side = "baseline" | "candidate";
type AuxiliaryStage = "proposer" | "judge";
type Budget = BudgetsConfig["budgets"]["perAgent"][string];
interface Scope { stage: Side | AuxiliaryStage; key: string; closed: boolean; requests: number; reserved: bigint; headers: { id: string; sessionId: string }[]; cost: NativeCostProjection | null; settled: boolean; evidenceClosed: boolean }
interface ActiveScope { envelope: EnvelopeState; scope: Scope }
interface EnvelopeState {
  workspace: string;
  agentId: string;
  id: string;
  admitted: boolean;
  stopped: boolean;
  allowedBounds: Set<string>;
  scopes: Map<string, Scope>;
  counts: Record<Side | AuxiliaryStage, number>;
  reserve(scope: Scope, budget: Budget, headerJson: string, dispatch: NativeBudgetDispatch | undefined, now: number, headerId: string, sessionId: string): ReturnType<typeof nativeUsdReservation>;
  trial<T>(stamp: TrialRunInput["stamp"], run: () => Promise<T>): Promise<T>;
}
const active = new AsyncLocalStorage<ActiveScope>();
const envelopes = new WeakMap<TrialBudgetHook, EnvelopeState>();
const usd = (value: bigint) => Number(`${value}e-12`);
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Bounds only native requests in this process. A custom runner using another transport has no spend attestation. */
export function createExperimentBudget(options: {
  workspace: string;
  agentId: string;
  maxCostUsd: number;
  maxRequestsPerExecution: Readonly<Record<Side, number>>;
  auxiliaryRequests?: Partial<Readonly<Record<AuxiliaryStage, number>>>;
}) {
  const counts = { ...options.maxRequestsPerExecution, proposer: options.auxiliaryRequests?.proposer ?? 0, judge: options.auxiliaryRequests?.judge ?? 0 };
  if (!Object.values(counts).every(count)) throw new Error("Experiment request limits must be nonnegative safe integers");
  const maxCostUsd = options.maxCostUsd;
  const ceiling = nativeUsdUnits(maxCostUsd, false);
  let plannedRequests = 0, worstCase = 0n, reserved = 0n, measured = 0n, measuredRequests = 0;
  const settled = new Set<string>();
  let plan: TrialBudgetPlan | undefined;
  const state: EnvelopeState = {
    workspace: realpathSync(options.workspace), agentId: options.agentId, id: `experiment_budget_${randomUUID()}`,
    admitted: false, stopped: false, allowedBounds: new Set(), scopes: new Map(), counts,
    reserve(scope, budget, headerJson, dispatch, now, headerId, sessionId) {
      if (!state.admitted || state.stopped || scope.closed) throw new Error("Experiment budget scope is closed");
      if (scope.requests >= counts[scope.stage]) throw new Error(`Experiment ${scope.stage} request limit exhausted`);
      const bound = nativeUsdReservation(budget, headerJson, dispatch, now);
      if (!state.allowedBounds.has(bound.usdBoundDigest)) throw new Error("Request does not use an admitted experiment USD bound");
      const amount = nativeUsdUnits(bound.reservedCostUsd);
      if (reserved + amount > worstCase || reserved + amount > ceiling) throw new Error("Native requests exceed the whole experiment envelope");
      // No credit from estimates or missing outcomes. Consumption remains conservative if the surrounding ledger transaction fails.
      scope.requests++; scope.reserved += amount; reserved += amount;
      scope.headers.push({ id: headerId, sessionId });
      return bound;
    },
    async trial<T>(stamp: TrialRunInput["stamp"], run: () => Promise<T>): Promise<T> {
      if (active.getStore()) throw new Error("Nested trial envelopes are not supported");
      const ref = stamp.caseExecution;
      const arm = plan?.arms.find(arm => arm.trialId === ref.trialId && arm.configDigest === ref.configDigest);
      if (!state.admitted || state.stopped || !arm || stamp.agentId !== state.agentId || !plan?.caseIds.includes(ref.caseId)) {
        throw new Error("Trial does not belong to the admitted experiment plan");
      }
      const key = `${ref.trialId}:${ref.caseId}`;
      if (state.scopes.has(key)) throw new Error("Experiment trial scope was already started");
      const scope: Scope = { stage: arm.side, key, requests: 0, reserved: 0n, closed: false, headers: [], cost: null, settled: false, evidenceClosed: false };
      state.scopes.set(key, scope);
      try { return await active.run({ envelope: state, scope }, run); }
      finally { scope.closed = true; }
    }
  };
  const settleScope = (scope: Scope): void => {
    scope.closed = true; scope.settled = true;
    if (scope.headers.length === 0) return;
    const rows = readBudgetEvents(state.workspace);
    const ids = new Set(scope.headers.map(header => header.id));
    const selected = rows.filter(row => ids.has(row.id) || ids.has(String(budgetMeta(row).headerEventId)));
    let subtotal = 0n, complete = 0;
    const costs: ExperimentCostStage[] = [];
    for (const sessionId of new Set(scope.headers.map(header => header.sessionId))) {
      const closed = rows.some(row => row.session_id === sessionId && row.event_type === "session/close");
      const projection = projectNativeCost(selected, sessionId);
      costs.push({ stage: sessionId, role: scope.stage === "baseline" || scope.stage === "candidate" ? "executor" : scope.stage,
        state: closed ? "settled" : "unknown", cost: projection });
      if (projection.status === "invalid") { state.stopped = true; throw new Error("Experiment settlement evidence is invalid"); }
      if (!closed) continue;
      for (const request of projection.requests) {
        if (request.costBasis !== "provider-reported" || request.reportedCostUsd === null) continue;
        subtotal += nativeUsdUnits(request.reportedCostUsd); complete++;
      }
    }
    scope.evidenceClosed = costs.length > 0 && costs.every(cost => cost.state === "settled");
    scope.cost = summarizeExperimentRoleCosts(costs).total.cost;
    if (subtotal > scope.reserved) { state.stopped = true; throw new Error("Measured native spend exceeds its experiment request reservations"); }
    measured += subtotal; measuredRequests += complete;
  };
  const hook = {
    admit(input: TrialBudgetPlan): void {
      if (state.admitted || plan !== undefined) throw new Error("An experiment envelope admits exactly one plan");
      if (input.arms.length !== 2 || input.arms[0]?.side !== "baseline" || input.arms[1]?.side !== "candidate"
        || new Set(input.arms.map(arm => arm.trialId)).size !== 2 || input.arms.some(arm => !arm.trialId || !arm.configDigest)
        || input.caseIds.length === 0 || new Set(input.caseIds).size !== input.caseIds.length || input.executions !== input.caseIds.length * 2) {
        throw new Error("Experiment budget requires the complete baseline and candidate trial plan");
      }
      plannedRequests = input.caseIds.length * (counts.baseline + counts.candidate) + counts.proposer + counts.judge;
      if (!count(plannedRequests)) throw new Error("Experiment request plan overflow");
      const policy = budgetForAgent(loadVerifiedBudgetsConfig(state.workspace), state.agentId);
      if (!policy) throw new Error("Experiment requires a signed native budget for its agent");
      const bounds = policy.nativeUsdBounds?.filter(bound => Date.parse(bound.expiresAt) > Date.now()) ?? [];
      if (plannedRequests > 0 && bounds.length === 0) throw new Error("Experiment requires a known signed USD request bound");
      const maximum = bounds.reduce((max, bound) => { const units = nativeUsdUnits(bound.maxCostUsd); return units > max ? units : max; }, 0n);
      worstCase = BigInt(plannedRequests) * maximum;
      if (worstCase > ceiling) throw new Error("Planned baseline, candidate and auxiliary spend exceeds the whole experiment envelope");
      state.allowedBounds = new Set(bounds.map(bound => sha256Hex(canonicalize(bound))));
      plan = structuredClone(input); state.admitted = true;
    },
    settle(execution: CaseExecutionRecord): void {
      const key = `${execution.trialId}:${execution.caseId}`;
      const scope = state.scopes.get(key);
      if (!scope || scope.stage !== execution.side || settled.has(key)) throw new Error("Experiment settlement has no unique admitted execution");
      settled.add(key);
      if (execution.outcome === "completed" && scope.requests === 0) {
        scope.closed = true; state.stopped = true;
        throw new Error("Completed hard-budget trial has no admitted native request evidence");
      }
      settleScope(scope);
    },
    async runStage<T>(stage: AuxiliaryStage, run: () => Promise<T>): Promise<T> {
      if (stage !== "proposer" && stage !== "judge") throw new Error("Invalid experiment auxiliary stage");
      if (!state.admitted || state.stopped) throw new Error("Experiment budget is not admitted or is closed");
      const key = `auxiliary:${stage}`;
      if (active.getStore()?.scope.closed) throw new Error("Experiment budget scope is closed");
      if (active.getStore() && active.getStore()!.envelope !== state) throw new Error("Nested experiment envelopes are not supported");
      if (state.scopes.has(key)) throw new Error("Experiment auxiliary scope is closed or already started");
      const scope: Scope = { stage, key, requests: 0, reserved: 0n, closed: false, headers: [], cost: null, settled: false, evidenceClosed: false };
      state.scopes.set(key, scope);
      try { return await active.run({ envelope: state, scope }, run); }
      finally { settleScope(scope); }
    },
    snapshot() {
      const plannedStages: { key: string; stage: Side | AuxiliaryStage }[] = plan === undefined ? [] : plan.arms.flatMap(arm => plan!.caseIds.map(caseId => ({ key: `${arm.trialId}:${caseId}`, stage: arm.side })));
      plannedStages.push({ key: "auxiliary:proposer", stage: "proposer" }, { key: "auxiliary:judge", stage: "judge" });
      const stages: ExperimentCostStage[] = plannedStages.map(stage => {
        const scope = state.scopes.get(stage.key);
        return { stage: stage.key, role: stage.stage === "baseline" || stage.stage === "candidate" ? "executor" : stage.stage,
          state: scope === undefined ? "not-run" : scope.settled ? scope.evidenceClosed ? "settled" : "unknown" : "started", cost: scope?.cost ?? null };
      });
      const roleCosts = summarizeExperimentRoleCosts(stages);
      const scopesFinished = plannedStages.filter(stage => stage.stage === "baseline" || stage.stage === "candidate" || counts[stage.stage] > 0)
        .every(stage => state.scopes.get(stage.key)?.settled === true);
      return { schemaVersion: 1 as const, scope: "native-requests-in-process" as const, envelopeId: state.id,
        admitted: state.admitted, plannedRequests, maxCostUsd, worstCaseCostUsd: usd(worstCase),
        reservedCostUsd: usd(reserved), measuredCostUsd: measuredRequests > 0 ? usd(measured) : null,
        roleCosts, measuredRequests, settlementComplete: state.admitted && scopesFinished && measuredRequests > 0 && measuredRequests === [...state.scopes.values()].reduce((sum, scope) => sum + scope.requests, 0) };
    }
  };
  envelopes.set(hook, state);
  return hook;
}

/** Keep the context around the timeout race, so a noncooperative callback inherits a revoked scope after it settles. */
export async function withTrialBudget<T>(hook: TrialBudgetHook | undefined, stamp: TrialRunInput["stamp"], run: () => Promise<T>): Promise<T> {
  const state = hook === undefined ? undefined : envelopes.get(hook);
  return state === undefined ? await run() : await state.trial(stamp, run);
}

/** Called inside native admission before dispatch, also for descendant native sessions and token-only daily policy. */
export function reserveExperimentModelRequest(workspace: string, agentId: string, budget: Budget, headerJson: string,
  dispatch: NativeBudgetDispatch | undefined, now: number, headerId: string, sessionId: string) {
  const context = active.getStore();
  if (!context) return undefined;
  const { envelope, scope } = context;
  if (realpathSync(workspace) !== envelope.workspace || agentId !== envelope.agentId) throw new Error("Native request leaves its admitted experiment workspace or agent");
  return { ...envelope.reserve(scope, budget, headerJson, dispatch, now, headerId, sessionId), experimentEnvelopeId: envelope.id, experimentStage: scope.stage };
}
