/** Internal maintained forecast drivers. No provider waits or signing occur inside a SQL transaction or publication callback. */
import { relative } from "node:path";
import { OrgPairsPublicationError, captureOrgPairsAuthority, captureOrgPairs, orgPairBytes } from "../org/preparedOrgPairs.js";
import { appendTransparencyEntryAsync, type TransparencyAppendInput } from "../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { calculateForecast, defaultForecastPolicy, listForecastScopesForWorkspace, maybeDispatchAdvisories, type ForecastCreationParams } from "./forecastEngine.js";
import { captureAdvisory, captureForecastSchedulerState, captureVerifiedForecastPolicy, forecastPolicyPath,
  captureForecastPolicyInput, prepareAdvisory, prepareForecastArtifact, prepareForecastPolicy, prepareForecastSchedulerState, verifyForecastPolicySignature } from "./forecastStore.js";
import { computeNextRefreshTs, withSchedulerOutcome } from "./renewalCadence.js";
import YAML from "yaml";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { forecastPolicySchema, type AdvisoryRecord, type ForecastPolicy, type ForecastScope } from "./forecastSchema.js";

interface Progress { completed: string[]; phase: string; entryHash: string | null; pendingRecorded: boolean | null }
export class ForecastPublicationError extends Error {
  readonly code = "FORECAST_PARTIAL";
  constructor(readonly completed: readonly string[], readonly phase: string, readonly entryHash: string | null,
    readonly pendingRecorded: boolean | null, cause: unknown, readonly primaryResult?: unknown) {
    super("forecast publication is incomplete; earlier effects remain committed", { cause }); this.name = "ForecastPublicationError";
  }
}
function failed(progress: Progress, error: unknown): never {
  const members = error instanceof OrgPairsPublicationError ? [...error.publishedPaths] : [];
  if (progress.completed.length === 0 && members.length === 0 && !(error instanceof TransparencyMerkleLagError)) throw error;
  throw new ForecastPublicationError(Object.freeze([...progress.completed, ...members]), progress.phase,
    error instanceof TransparencyMerkleLagError ? error.entryHash : progress.entryHash,
    error instanceof TransparencyMerkleLagError ? error.pendingRecorded : progress.pendingRecorded, error);
}
function progress(): Progress { return { completed: [], phase: "prepare", entryHash: null, pendingRecorded: null }; }
/** Run-level authority is distinct from an individual pair's expected postimage: later own scope/state writes may replace a prior latest. */
function captureRun(workspace: string, beforePublish: () => void) {
  const actor = beforePublish, enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
  beforePublish = () => { enabled(); actor(); enabled(); };
  beforePublish(); const fixed = captureOrgPairsAuthority(workspace);
  return { beforePublish, fixed, assertCurrent() { beforePublish(); fixed(); } };
}
type Run = ReturnType<typeof captureRun>;
async function log(workspace: string, item: Omit<TransparencyAppendInput, "workspace">, run: Run,
  assertPublished: () => void, state: Progress): Promise<void> {
  state.phase = item.type; state.entryHash = null; state.pendingRecorded = null;
  const entry = await appendTransparencyEntryAsync({ workspace, ...item }, { beforeCommit() {
    run.beforePublish(); assertPublished(); run.fixed();
  } });
  state.entryHash = entry.hash; state.completed.push(`log:${item.type}:${entry.hash}`);
}
async function create(input: ForecastCreationParams, run: Run) {
  const params = { ...input, scope: { ...input.scope } }, calculated = calculateForecast(params);
  if (params.persist === false) return { result: { forecast: calculated.forecast, advisories: calculated.advisories, latestPath: null, snapshotPath: null, snapshotSha256: null }, assertCurrent() {} };
  const state = progress();
  try {
    state.phase = "forecast-pairs";
    const original = await prepareForecastArtifact(params.workspace, params.scope, calculated.forecast, {
      beforePublish: run.beforePublish, assertInputsCurrent() { calculated.assertInputsCurrent(); run.fixed(); }
    });
    const saved = original.publish();
    state.completed.push(...[saved.latestPath, saved.latestSigPath, saved.snapshotPath, saved.snapshotSigPath].map(path => relative(params.workspace, path)));
    await log(params.workspace, { type: "FORECAST_CREATED", agentId: params.scope.type === "AGENT" ? params.scope.id : "system",
      artifact: { kind: "policy", id: `${params.scope.type}:${params.scope.id}:${calculated.forecast.generatedTs}`, sha256: saved.snapshotSha256 } }, run, original.assertCurrent, state);
    for (const advisory of calculated.advisories) {
      state.phase = "advisory-pair"; state.entryHash = null; state.pendingRecorded = null;
      const prepared = await prepareAdvisory(params.workspace, advisory, { beforePublish: run.beforePublish,
        assertInputsCurrent() { original.assertCurrent(); run.fixed(); } });
      const published = prepared.publish(); state.completed.push(relative(params.workspace, published.path), relative(params.workspace, published.sigPath));
      await log(params.workspace, { type: "ADVISORY_CREATED", agentId: advisory.scope.type === "AGENT" ? advisory.scope.id : "system",
        artifact: { kind: "policy", id: advisory.advisoryId, sha256: prepared.sha256 } }, run,
        () => { original.assertCurrent(); prepared.assertCurrent(); }, state);
    }
    state.phase = "dispatch"; state.entryHash = null; state.pendingRecorded = null; run.beforePublish(); original.assertCurrent(); run.fixed();
    maybeDispatchAdvisories({ workspace: params.workspace, advisories: calculated.advisories, policy: calculated.policy });
    return { result: { forecast: calculated.forecast, advisories: calculated.advisories, latestPath: saved.latestPath, snapshotPath: saved.snapshotPath, snapshotSha256: saved.snapshotSha256 },
      assertCurrent() { run.beforePublish(); original.assertCurrent(); run.fixed(); } };
  } catch (error) { failed(state, error); }
}
export async function createForecastAsync(input: ForecastCreationParams) {
  return createForecastForAuthority(input, () => {});
}
/** Internal Studio/mechanic handoff only; public root SDK has no positive authorization channel. */
export async function createForecastForAuthority(input: ForecastCreationParams, beforePublish: () => void) {
  const params = { ...input, scope: { ...input.scope } };
  // Compute-only callers retain the original no-sign/no-write contract.
  if (params.persist === false) { const calculated = calculateForecast(params); return { forecast: calculated.forecast, advisories: calculated.advisories, latestPath: null, snapshotPath: null, snapshotSha256: null }; }
  return (await create(params, captureRun(params.workspace, beforePublish))).result;
}
/** Internal output/Studio handoff retains the real original gate after core publication. */
export async function createForecastForPublication(input: ForecastCreationParams, beforePublish: () => void) {
  const params = { ...input, scope: { ...input.scope } }; return create(params, captureRun(params.workspace, beforePublish));
}
export async function initForecastPolicyAsync(workspace: string, options: { onlyIfMissing?: boolean } = {}) {
  const before = captureOrgPairs([forecastPolicyPath(workspace)]);
  const existing = orgPairBytes(before, forecastPolicyPath(workspace));
  if (options.onlyIfMissing && existing === null && orgPairBytes(before, `${forecastPolicyPath(workspace)}.sig`) !== null)
    throw new Error("existing forecast policy sidecar has no body; initialization will not replace it");
  if (options.onlyIfMissing && existing !== null) {
    const signature = orgPairBytes(before, `${forecastPolicyPath(workspace)}.sig`);
    if (signature === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", existing, signature).valid)
      throw new Error("existing forecast policy pair is invalid; initialization will not replace it");
    return { path: forecastPolicyPath(workspace), sigPath: `${forecastPolicyPath(workspace)}.sig`, policy: forecastPolicySchema.parse(YAML.parse(existing.toString("utf8")) as unknown) };
  }
  const policy = defaultForecastPolicy(), run = captureRun(workspace, () => {}), state = progress();
  try {
    state.phase = "policy-pair";
    const prepared = await prepareForecastPolicy(workspace, policy, { assertInputsCurrent: run.fixed }, before), saved = prepared.publish();
    state.completed.push(relative(workspace, saved.path), relative(workspace, saved.sigPath));
    await log(workspace, { type: "FORECAST_POLICY_UPDATED", agentId: "system", artifact: { kind: "policy", id: "forecast-policy",
      sha256: prepared.sha256 } }, run, prepared.assertCurrent, state);
    return { ...saved, policy };
  } catch (error) { failed(state, error); }
}
export async function applyForecastPolicyAsync(workspace: string, input: ForecastPolicy) {
  return applyForecastPolicyForAuthority(workspace, input, () => {});
}
export async function applyForecastPolicyForAuthority(workspace: string, input: ForecastPolicy, beforePublish: () => void) {
  const policy = forecastPolicySchema.parse(input), run = captureRun(workspace, beforePublish);
  const prepared = await prepareForecastPolicy(workspace, policy, { beforePublish, assertInputsCurrent: run.fixed });
  return prepared.publish();
}
export async function acknowledgeAdvisoryAsync(input: { workspace: string; advisoryId: string; by: string; note: string }) {
  return acknowledgeAdvisoryForAuthority(input, () => {});
}
export async function acknowledgeAdvisoryForAuthority(input: { workspace: string; advisoryId: string; by: string; note: string }, beforePublish: () => void) {
  const params = { ...input }, selected = captureAdvisory(params.workspace, params.advisoryId);
  if (selected === null) throw new Error(`advisory not found: ${params.advisoryId}`);
  const updated: AdvisoryRecord = { ...selected.advisory, acknowledged: { by: params.by, ts: Date.now(), note: params.note } };
  const run = captureRun(params.workspace, beforePublish), state = progress();
  try {
    state.phase = "advisory-pair";
    const prepared = await prepareAdvisory(params.workspace, updated, { beforePublish,
      assertInputsCurrent() { selected.assertCurrent(); run.fixed(); } }, selected.before), saved = prepared.publish();
    state.completed.push(relative(params.workspace, saved.path), relative(params.workspace, saved.sigPath));
    await log(params.workspace, { type: "ADVISORY_ACKNOWLEDGED", agentId: updated.scope.type === "AGENT" ? updated.scope.id : "system",
      artifact: { kind: "policy", id: updated.advisoryId, sha256: prepared.sha256 } }, run, prepared.assertCurrent, state);
    return updated;
  } catch (error) { failed(state, error); }
}
async function refreshBatch(workspace: string, scopes: readonly ForecastScope[], run: Run) {
  const results: Array<{ scope: ForecastScope; result: Awaited<ReturnType<typeof create>>["result"] }> = [];
  try { for (const scope of scopes) { run.assertCurrent(); const out = await create({ workspace, scope }, run); results.push({ scope, result: out.result }); } }
  catch (cause) { if (results.length === 0) throw cause; throw new ForecastPublicationError(Object.freeze(results.map(row => `scope:${row.scope.type}:${row.scope.id}`)), "scope-refresh", null, null, cause); }
  return results;
}
async function refreshScopes(workspace: string, scopes: readonly ForecastScope[], run: Run) {
  return (await refreshBatch(workspace, scopes, run)).map(row => ({ scope: row.scope, status: row.result.forecast.status }));
}
/** Internal multi-scope maintained caller; one original authority survives every scope Sign/log wait. */
export async function refreshForecastBatchForAuthority(workspace: string, input: readonly ForecastScope[], beforePublish: () => void) {
  const scopes = input.map(scope => ({ ...scope })); return refreshBatch(workspace, scopes, captureRun(workspace, beforePublish));
}

export async function refreshForecastsForWorkspaceAsync(input: { workspace: string; scopes?: ForecastScope[] }) {
  const workspace = input.workspace, scopes = (input.scopes ?? listForecastScopesForWorkspace(workspace)).map(scope => ({ ...scope }));
  return { generated: await refreshScopes(workspace, scopes, captureRun(workspace, () => {})) };
}
export async function schedulerSetEnabledAsync(workspace: string, enabled: boolean) {
  return schedulerSetEnabledForAuthority(workspace, enabled, () => {});
}
export async function schedulerSetEnabledForAuthority(workspace: string, enabled: boolean, beforePublish: () => void) {
  const selected = captureForecastSchedulerState(workspace), next = { ...selected.state, enabled }, run = captureRun(workspace, beforePublish);
  const prepared = await prepareForecastSchedulerState(workspace, next, { beforePublish,
    assertInputsCurrent() { selected.assertCurrent(); run.fixed(); } }, selected.before);
  return { state: next, sigPath: prepared.publish().sigPath };
}
export async function schedulerRunNowAsync(input: { workspace: string; scopes?: ForecastScope[] }) { return schedulerRunNowForAuthority(input, () => {}); }
export async function schedulerRunNowForAuthority(input: { workspace: string; scopes?: ForecastScope[] }, beforePublish: () => void, assertPreparationInputsCurrent?: () => void) {
  const workspace = input.workspace, scopes = (input.scopes ?? listForecastScopesForWorkspace(workspace)).map(scope => ({ ...scope }));
  const policy = captureVerifiedForecastPolicy(workspace), selected = captureForecastSchedulerState(workspace);
  const run = captureRun(workspace, () => { assertPreparationInputsCurrent?.(); beforePublish(); policy.assertCurrent(); selected.assertCurrent(); });
  const generated = await refreshScopes(workspace, scopes, run);
  const state = withSchedulerOutcome(selected.state, policy.policy, { status: "OK", reason: "", ts: computeNextRefreshTs(policy.policy, Date.now()) });
  try {
    const prepared = await prepareForecastSchedulerState(workspace, state, {
      beforePublish() { beforePublish(); policy.assertCurrent(); run.fixed(); },
      assertInputsCurrent() { assertPreparationInputsCurrent?.(); policy.assertCurrent(); selected.assertCurrent(); run.fixed(); } }, selected.before);
    prepared.publish(); return { generated, state };
  } catch (cause) { throw new ForecastPublicationError(Object.freeze(generated.map(row => `scope:${row.scope.type}:${row.scope.id}`)), "scheduler-state", null, null, cause); }
}
export async function schedulerTickAsync(input: { workspace: string; workspaceReady: boolean }) {
  const params = { ...input }, selected = captureForecastSchedulerState(params.workspace), state = selected.state;
  if (!state.enabled) return { ran: false, reason: "scheduler disabled", state };
  const signature = verifyForecastPolicySignature(params.workspace);
  if (!signature.valid || !params.workspaceReady) {
    const policy = captureForecastPolicyInput(params.workspace), next = withSchedulerOutcome(state, policy.policy, { status: signature.valid ? "SKIPPED" : "ERROR",
      reason: signature.valid ? "workspace not ready" : `policy signature invalid: ${signature.reason ?? "unknown"}` });
    const run = captureRun(params.workspace, () => {}), prepared = await prepareForecastSchedulerState(params.workspace, next, {
      assertInputsCurrent() { policy.assertCurrent(); selected.assertCurrent(); run.fixed(); } }, selected.before);
    prepared.publish(); return { ran: false, reason: next.lastOutcome.reason, state: next };
  }
  if (state.nextRefreshTs !== null && state.nextRefreshTs > Date.now()) return { ran: false, reason: "not due", state };
  const result = await schedulerRunNowForAuthority({ workspace: params.workspace }, () => {}, selected.assertCurrent); return { ran: true, reason: "ok", state: result.state };
}
