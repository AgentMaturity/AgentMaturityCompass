import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import {
  captureAssurancePolicy, captureAssuranceScheduler, saveAssuranceSchedulerStateAsync,
  loadAssuranceSchedulerState,
  saveAssuranceSchedulerState,
  verifyAssuranceSchedulerSignature
} from "./assurancePolicyStore.js";
import { issueAssuranceCertificate } from "./assuranceCertificates.js";
import { runAssurance } from "./assuranceRunner.js";
import type { AssuranceSchedulerState } from "./assuranceSchema.js";
import { includes } from "../utils/typeGuards.js";
import { assertOrgPairsCurrent, captureOrgPairsAuthority, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { assertPolicySignerCurrent, describePolicySigner } from "../crypto/signing/signer.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";

class AssuranceSchedulerPublicationError extends Error {
  readonly code = "ASSURANCE_SCHEDULER_INCOMPLETE";
  constructor(readonly completedStages: readonly string[], readonly attemptedStage: string, readonly runId: string | null, readonly certificateFailure: unknown, cause: unknown) {
    super("assurance scheduler did not complete; earlier run/certificate/state effects may remain", { cause }); this.name = "AssuranceSchedulerPublicationError";
  }
}
function failureDetails(cause: unknown) {
  if (!(cause instanceof Error)) return { message: String(cause) };
  const detail = cause as Error & { code?: unknown; publishedPaths?: unknown; attemptedPath?: unknown; publication?: unknown; transparency?: unknown };
  return { message: cause.message, code: detail.code, publishedPaths: detail.publishedPaths, attemptedPath: detail.attemptedPath, publication: detail.publication, transparency: detail.transparency };
}
function schedulerAttempt(workspace: string, options: OrgPairsOptions) {
  const actor = options.beforePublish; actor?.();
  const selected = captureAssuranceScheduler(workspace), policyInput = captureAssurancePolicy(workspace);
  if (!policyInput.signature.valid) throw new Error(`assurance policy signature invalid: ${policyInput.signature.reason ?? "unknown"}`);
  const fixed = captureOrgPairsAuthority(workspace, actor), log = captureWorkspaceLogAuthority(workspace), certSigner = describePolicySigner(workspace, "CERT");
  const certPurpose = certSigner.mode === "VAULT" ? captureRunHashAuthority(workspace, false) : () => {};
  const assertPolicyCurrent = () => {
    assertOrgPairsCurrent(policyInput.snapshot);
    const body = orgPairBytes(policyInput.snapshot, policyInput.path), signature = orgPairBytes(policyInput.snapshot, `${policyInput.path}.sig`);
    if (body === null || signature === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature).valid)
      throw new Error("assurance policy signature invalid: captured policy is no longer admitted");
  };
  const external = () => { actor?.(); assertPolicyCurrent(); fixed(); log.assertCurrent(); assertPolicySignerCurrent(workspace, certSigner); certPurpose(); };
  const preparing = () => { external(); options.assertInputsCurrent?.(); assertOrgPairsCurrent(selected.snapshot); };
  preparing(); return { selected, policyInput, external, preparing };
}


/** Negative-only classification of actual checked signer refusals; native causes stay attached. */
function knownSigningRefusal(error: unknown, seen = new Set<unknown>()): boolean {
  if (seen.has(error)) return false; seen.add(error);
  if (error instanceof KeyProviderError || error instanceof KeyRevokedError) return true;
  if (!(error instanceof Error)) return false;
  if (/^(notary |policy sign|no-sign mode does not authorize policy signing|original BUNDLE )/i.test(error.message)) return true;
  return error.cause !== undefined && knownSigningRefusal(error.cause, seen);
}

function nextRunTs(nowTs: number, defaultRunHours: number): number {
  const hours = Math.max(1, defaultRunHours);
  return nowTs + hours * 60 * 60 * 1000;
}

function toSchedulerCertStatus(params: {
  reportStatus: "VALID" | "INVALID" | "UNSIGNED";
  overallScore0to100: number;
  minRiskAssuranceScore: number;
}): AssuranceSchedulerState["lastCertStatus"] {
  if (params.reportStatus !== "VALID") {
    return "FAIL";
  }
  return params.overallScore0to100 >= params.minRiskAssuranceScore ? "PASS" : "FAIL";
}

export function assuranceSchedulerStatus(workspace: string) {
  return {
    state: loadAssuranceSchedulerState(workspace),
    signature: verifyAssuranceSchedulerSignature(workspace)
  };
}

export function assuranceSchedulerSetEnabled(params: {
  workspace: string;
  enabled: boolean;
}) {
  const current = loadAssuranceSchedulerState(params.workspace);
  const next = {
    ...current,
    enabled: params.enabled
  };
  const saved = saveAssuranceSchedulerState(params.workspace, next);
  return {
    state: next,
    ...saved
  };
}

export async function assuranceSchedulerSetEnabledAsync(params: { workspace: string; enabled: boolean }, options: OrgPairsOptions = {}) {
  params = { ...params }; options = { ...options }; const actor = options.beforePublish; actor?.(); const selected = captureAssuranceScheduler(params.workspace);
  const saved = await saveAssuranceSchedulerStateAsync(params.workspace, { ...selected.state, enabled: params.enabled },
    { beforePublish: actor, assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(selected.snapshot); } }, selected.snapshot);
  saved.assertCurrent(); return { state: { ...selected.state, enabled: params.enabled }, path: saved.path, sigPath: saved.sigPath };
}

export async function assuranceSchedulerRunNow(input: {
  workspace: string; scopeType?: "WORKSPACE" | "NODE" | "AGENT"; scopeId?: string; selectedPack?: "all" | string;
}, options: OrgPairsOptions = {}) {
  const params = { ...input }; options = { ...options };
  const attempt = schedulerAttempt(params.workspace, options), { selected: current, policyInput } = attempt;
  const policy = policyInput.parsePolicy()!, selected = params.selectedPack ?? "all", completed: string[] = [];
  let stage = "run", report: Awaited<ReturnType<typeof runAssurance>> | null = null, certificateFailure: unknown = null;
  let cert: Awaited<ReturnType<typeof issueAssuranceCertificate>> | null = null;
  try {
    attempt.preparing();
    report = await runAssurance({ workspace: params.workspace, agentId: params.scopeType === "AGENT" ? params.scopeId : undefined,
      packId: selected === "all" ? undefined : selected, runAll: selected === "all", mode: "sandbox",
      window: `${Math.max(1, policy.assurancePolicy.cadence.defaultRunHours)}h` }, { beforePublish: attempt.preparing });
    completed.push("run"); stage = "certificate"; attempt.preparing();
    try { cert = await issueAssuranceCertificate({ workspace: params.workspace, runId: report.assuranceRunId }, { beforePublish: attempt.preparing }); completed.push("certificate"); }
    catch (cause) { certificateFailure = cause; attempt.preparing(); if (knownSigningRefusal(cause)) throw cause; } // Checked refusals remain refusals; ordinary certificate/native failures stay optional.
    stage = "scheduler-state"; attempt.preparing();
    const nowTs = Date.now(), next = { enabled: current.state.enabled, lastRunTs: nowTs,
      nextRunTs: nextRunTs(nowTs, policy.assurancePolicy.cadence.defaultRunHours), lastOutcome: { status: "OK" as const, reason: "" },
      lastCertStatus: toSchedulerCertStatus({ reportStatus: report.status, overallScore0to100: report.overallScore0to100,
        minRiskAssuranceScore: policy.assurancePolicy.thresholds.minRiskAssuranceScore }) };
    const saved = await saveAssuranceSchedulerStateAsync(params.workspace, next,
      { beforePublish: attempt.external, assertInputsCurrent: attempt.preparing }, current.snapshot);
    completed.push("scheduler-state"); stage = "return"; saved.assertCurrent();
    return { run: report, cert, scheduler: next, certificateFailure: certificateFailure === null ? null : failureDetails(certificateFailure) };
  } catch (cause) { throw new AssuranceSchedulerPublicationError(Object.freeze([...completed]), stage, report?.assuranceRunId ?? null, certificateFailure, cause); }
}

export async function assuranceSchedulerTick(input: { workspace: string; workspaceReady: boolean; eventType?: string }, options: OrgPairsOptions = {}): Promise<
  | { ran: false; reason: "disabled" | "workspace_not_ready" | "policy_untrusted" | "not_due" }
  | { ran: true; runId: string; certIssued: boolean; certificateFailure: ReturnType<typeof failureDetails> | null }
> {
  const params = { ...input }; options = { ...options }; const actor = options.beforePublish; actor?.();
  const current = captureAssuranceScheduler(params.workspace), state = current.state;
  if (!state.enabled) return { ran: false, reason: "disabled" };
  const save = async (next: AssuranceSchedulerState, policyCurrent?: () => void) => {
    const saved = await saveAssuranceSchedulerStateAsync(params.workspace, next,
      { beforePublish: () => { actor?.(); policyCurrent?.(); }, assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(current.snapshot); } }, current.snapshot);
    saved.assertCurrent();
  };
  if (!params.workspaceReady) { await save({ ...state, lastOutcome: { status: "SKIPPED", reason: "workspace not ready" } }); return { ran: false, reason: "workspace_not_ready" }; }
  const policyInput = captureAssurancePolicy(params.workspace), policyCurrent = () => assertOrgPairsCurrent(policyInput.snapshot);
  if (!policyInput.signature.valid) {
    await save({ ...state, lastOutcome: { status: "ERROR", reason: `assurance policy invalid: ${policyInput.signature.reason ?? "unknown"}` } }, policyCurrent);
    return { ran: false, reason: "policy_untrusted" };
  }
  const policy = policyInput.parsePolicy()!, nowTs = Date.now();
  const eventTriggered = Boolean(params.eventType && includes(policy.assurancePolicy.cadence.runAfterEvents, params.eventType)), due = !state.nextRunTs || state.nextRunTs <= nowTs;
  if (!eventTriggered && !due) return { ran: false, reason: "not_due" };
  // Retain the actual tick decision state through child preparation; own final state publication drops this old-target gate.
  const beforePublish = () => { actor?.(); policyCurrent(); };
  assertOrgPairsCurrent(current.snapshot);
  const result = await assuranceSchedulerRunNow({ workspace: params.workspace, scopeType: "WORKSPACE", selectedPack: "all" },
    { beforePublish, assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(current.snapshot); } });
  return { ran: true, runId: result.run.assuranceRunId, certIssued: Boolean(result.cert), certificateFailure: result.certificateFailure };
}
