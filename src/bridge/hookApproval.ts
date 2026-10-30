/** Hook retries use the native signed approval engine. A provider-local answer carries no authority. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApprovalForIntent, createApprovalForIntentAsync, consumeApprovedExecution, captureApprovedExecutionConsumptionEntry, verifyApprovalForExecution, type ApprovalRequestInput } from "../approvals/approvalEngine.js";
import { listApprovalRequests } from "../approvals/approvalChainStore.js";
import { approvalPolicyPath } from "../approvals/approvalPolicyEngine.js";
import { getAgentPaths } from "../fleet/paths.js";
import { withControlFileLock, withControlFileLockAsync } from "../lifecycle/controlFileLock.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { AuthorizationTarget, HookLease } from "./hookAuthorization.js";
import type { NormalizedProviderToolRequest } from "./hookControlPolicy.js";

type HookApprovalGrant = Parameters<typeof verifyApprovalForExecution>[0];
export type HookApprovalPhase = "pending" | "blocked" | "replay";
export interface HookApprovalResolution {
  phase: HookApprovalPhase | null;
  reason: string;
  grants: HookApprovalGrant[];
  expiresTs?: number;
}

export function hookApprovalAttemptSuffix(phase: HookApprovalPhase, rawInputSha256: string): string {
  return `_approval_${phase}_${rawInputSha256.slice(0, 16)}`;
}

type HookApprovalInput = {
  workspace: string; agentId: string; request: NormalizedProviderToolRequest;
  targets: readonly AuthorizationTarget[]; lease?: HookLease;
};

function hookApprovalIntent(input: HookApprovalInput) {
  return {
    schema: "amc-hook-approval/v1", provider: input.request.provider, actionId: input.request.actionId,
    // Transport envelopes get a new nonce on retry; the provider's exact payload remains the question.
    payloadSha256: input.request.call?.payloadSha256 ?? input.request.rawInputSha256,
    targetsSha256: sha256Hex(canonicalize(input.request.canonicalRequests)),
    approvalPolicySha256: sha256Hex(readFileSync(approvalPolicyPath(input.workspace))),
    lease: input.lease ?? null,
  };
}
export function hookApprovalIntentHash(input: HookApprovalInput): string {
  return sha256Hex(canonicalize(hookApprovalIntent(input)));
}

function* approvalResolution(input: HookApprovalInput): Generator<ApprovalRequestInput, HookApprovalResolution, ReturnType<typeof createApprovalForIntent>> {
  try {
    if (input.targets.length === 0) throw new Error("no approval targets");
    const { workspace, agentId, request } = input;
    const intentPayload = hookApprovalIntent(input);
    const expectedIntentHash = sha256Hex(canonicalize(intentPayload));
    const grants: HookApprovalGrant[] = [];
    for (const [index, target] of input.targets.entries()) {
      const expectedIntentId = `hook-${sha256Hex(canonicalize({ provider: request.provider, actionId: request.actionId, index }))}`;
      // ponytail: scan the existing signed inbox; index it only if hook approval volume warrants it.
      const found = listApprovalRequests({ workspace, agentId }).filter(row => row.intentId === expectedIntentId);
      if (found.length > 1) throw new Error("ambiguous hook approval");
      const selected = found[0] ?? (yield {
        workspace, agentId, intentId: expectedIntentId, ...target, requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
        riskTier: target.actionClass === "READ_ONLY" ? "low" : target.actionClass === "WRITE_LOW" ? "medium"
          : target.actionClass === "WRITE_HIGH" || target.actionClass === "NETWORK_EXTERNAL" ? "high" : "critical",
        intentPayload, ...(input.lease?.principal ? { initiator: input.lease.principal.userId } : {}),
      }).request;
      grants.push({ workspace, approvalId: selected.approvalRequestId, expectedAgentId: agentId,
        expectedIntentId, expectedIntentHash, expectedToolName: target.toolName, expectedActionClass: target.actionClass });
    }
    const checks = grants.map(grant => verifyApprovalForExecution(grant));
    const blocked = checks.find(check => !check.ok && check.status !== "PENDING");
    if (blocked) return { phase: blocked.status === "CONSUMED" ? "replay" : "blocked",
      reason: `AMC signed approval denied: ${blocked.status ?? "invalid binding or unavailable engine"}.`, grants };
    if (checks.some(check => check.approval === null || check.approval.expiresTs <= Date.now())) {
      return { phase: "blocked", reason: "AMC signed approval expired.", grants };
    }
    if (checks.some(check => !check.ok)) return { phase: "pending", grants,
      reason: `AMC approval pending: ${grants.map(grant => grant.approvalId).join(", ")}. Approve through amc approvals; retry this exact provider call.` };
    return { phase: null, reason: "AMC signed approval verified for this exact hook call.", grants,
      expiresTs: Math.min(...checks.map(check => check.approval!.expiresTs)) };
  } catch {
    return { phase: "blocked", reason: "AMC approval engine unavailable; hook call denied.", grants: [] };
  }
}

function approvalLock(input: HookApprovalInput) {
  return { root: join(getAgentPaths(input.workspace, input.agentId).rootDir, "approvals"),
    name: `hook-${sha256Hex(`${input.request.provider}:${input.request.actionId}`)}` };
}
const unavailable = (): HookApprovalResolution => ({ phase: "blocked", reason: "AMC approval engine unavailable; hook call denied.", grants: [] });

function prepareHookApproval(input: HookApprovalInput): HookApprovalResolution {
  try {
    return withControlFileLock({ ...approvalLock(input), operation: () => {
      const flow = approvalResolution(input);
      let step = flow.next();
      while (!step.done) step = flow.next(createApprovalForIntent(step.value));
      return step.value;
    } });
  } catch { return unavailable(); }
}

async function prepareHookApprovalAsync(input: HookApprovalInput): Promise<HookApprovalResolution> {
  try {
    return await withControlFileLockAsync({ ...approvalLock(input), operation: async () => {
      const flow = approvalResolution(input);
      let step = flow.next();
      while (!step.done) {
        const created = await createApprovalForIntentAsync(step.value);
        created.assertCurrent();
        step = flow.next(created.result);
      }
      return step.value;
    } });
  } catch { return unavailable(); }
}

/** Verify again at consumption; an exclusive engine publication permits only one execution. */
function consumeHookApprovals(grants: readonly HookApprovalGrant[], executionId: string, assertCurrent: () => void): string | null {
  try {
    if (grants.length === 0) return "AMC signed approval missing; hook call denied.";
    for (const grant of grants) {
      assertCurrent();
      const checked = verifyApprovalForExecution(grant);
      if (!checked.ok || !checked.approval || checked.approval.expiresTs <= Date.now()) {
        return "AMC signed approval changed, expired or was consumed; hook call denied.";
      }
      const consumed = consumeApprovedExecution({ workspace: grant.workspace, approvalId: grant.approvalId,
        expectedAgentId: grant.expectedAgentId, executionId });
      if (!consumed.consumed || consumed.replay) return "AMC signed approval already consumed; hook replay denied.";
    }
    return null;
  } catch {
    return "AMC approval consumption unavailable or hook context invalid; hook call denied.";
  }
}

/** Maintained provider-backed publisher, with the same exact-call verifier at every publication boundary. */
async function consumeHookApprovalsAsync(grants: readonly HookApprovalGrant[], executionId: string, assertCurrent: () => void): Promise<string | null> {
  try {
    if (grants.length === 0) return "AMC signed approval missing; hook call denied.";
    for (const grant of grants) {
      const checked = verifyApprovalForExecution(grant);
      if (!checked.ok || !checked.approval || checked.approval.expiresTs <= Date.now()) return "AMC signed approval changed, expired or was consumed; hook call denied.";
      assertCurrent();
      const publisher = captureApprovedExecutionConsumptionEntry(grant.workspace);
      const selected = publisher.selectGrant({ ...grant, executionId }, { beforePublish: assertCurrent });
      const consumed = await selected.consume();
      if (!consumed.consumed || consumed.replay) return "AMC signed approval already consumed; hook replay denied.";
    }
    return null;
  } catch { return "AMC approval consumption unavailable or hook context invalid; hook call denied."; }
}

export type HookApprovalOperation =
  | { kind: "prepare"; input: HookApprovalInput }
  | { kind: "consume"; grants: readonly HookApprovalGrant[]; executionId: string; assertCurrent: () => void };
export type HookApprovalOperationResult = HookApprovalResolution | string | null;

export function runHookControl<T>(flow: Generator<HookApprovalOperation, T, HookApprovalOperationResult>): T {
  try {
    let step = flow.next();
    while (!step.done) {
      const op = step.value;
      step = flow.next(op.kind === "prepare" ? prepareHookApproval(op.input) : consumeHookApprovals(op.grants, op.executionId, op.assertCurrent));
    }
    return step.value;
  } finally { flow.return(undefined as never); }
}

export async function runHookControlAsync<T>(flow: Generator<HookApprovalOperation, T, HookApprovalOperationResult>): Promise<T> {
  try {
    let step = flow.next();
    while (!step.done) {
      const op = step.value;
      step = flow.next(op.kind === "prepare" ? await prepareHookApprovalAsync(op.input)
        : await consumeHookApprovalsAsync(op.grants, op.executionId, op.assertCurrent));
    }
    return step.value;
  } finally { flow.return(undefined as never); }
}
