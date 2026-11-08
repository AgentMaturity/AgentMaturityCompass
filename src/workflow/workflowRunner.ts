import { randomUUID } from "node:crypto";
import { spawnSubagent, type DelegationRecorder, type SubagentRequest, type SubagentRunner } from "../agent/subagentSpawn.js";
import { isWorkflowLeaf, parseWorkflowPlan, planAgentCount, type WorkflowNode } from "./workflowPlan.js";
import { readVerdict, verdictInstruction } from "./workflowVerdict.js";
import { agentDefinitionsDigest, applyAgentDefinition, resolveAgentDefinition, type AgentDefinition } from "../agent/agentDefinitions.js";
import type { DelegationIdentity } from "../agent/delegationIdentity.js";
import type { ActionClass } from "../types.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { workflowProgress, type WorkflowNodeProgress } from "./workflowProgress.js";
import { intersectDelegationScopes } from "../agent/delegationScope.js";

export interface WorkflowRunInit {
  readonly workspace: string;
  readonly plan: WorkflowNode;
  readonly parent: DelegationIdentity;
  readonly session: DelegationRecorder;
  readonly runner: SubagentRunner;
  readonly mintSessionId: () => string;
  /** Reuse this identity only to resume this exact plan in its original owned session. */
  readonly runId?: string;
  /** With `runId`: refuse (before any dispatch) unless that run's creation checkpoint is in the session; never start a new run under it. */
  readonly resumeOnly?: boolean;
  readonly maxParallelAgents?: number;
  readonly maxDepth?: number;
  readonly maxActiveChildren?: number;
  readonly signal?: AbortSignal;
  readonly cancelGraceMs?: number;
  readonly parentLeaseToken?: string;
  /** Operator capability restrictions, intersected with each node's request. */
  readonly delegationScope?: readonly ActionClass[];
  readonly stopConditions?: readonly string[];
  /** Operator-admitted agent definitions; a node's `agent` resolves here, and their digest fences a resume. */
  readonly definitions?: ReadonlyMap<string, AgentDefinition>;
}
export interface WorkflowFailure {
  readonly nodeId: string;
  readonly reason: string;
  /** The node's effect is unknown (an interrupted or unconfirmed dispatch): set from its status, never read from reason text. */
  readonly unknown?: true;
}
export interface WorkflowRunResult {
  readonly runId: string;
  readonly ok: boolean;
  readonly outputs: ReadonlyMap<string, string>;
  readonly failures: readonly WorkflowFailure[];
  readonly cancelled: boolean;
  /** New dispatch attempts only; verified reused results do not spend another invocation. */
  readonly agentsRun: number;
}
interface RunState {
  readonly outputs: Map<string, string>;
  readonly failures: WorkflowFailure[];
  readonly progress: ReturnType<typeof workflowProgress>;
  readonly acquire: () => Promise<void>;
  readonly release: () => void;
  readonly block: (reason: string, unknown: boolean) => void;
  readonly blocked: () => Stop | undefined;
  agentsRun: number;
  stopped?: Stop;
}
type NodeOutcome = { readonly ok: true; readonly text: string } | { readonly ok: false };
/** Why later nodes stop, and whether that cause left an effect unknown. */
interface Stop { readonly reason: string; readonly unknown: boolean }
const activeSessions = new Map<string, { runs: Set<string>; live: number; waiting: Array<() => void>; blocked?: Stop }>();

function fail(state: RunState, nodeId: string, reason: string, unknown = false): NodeOutcome {
  state.failures.push({ nodeId, reason, ...(unknown ? { unknown: true as const } : {}) });
  return { ok: false };
}

type Leaf = Extract<WorkflowNode, { kind: "agent" | "verify" }>;

async function runAgent(node: Leaf, carried: string | null, init: WorkflowRunInit, state: RunState): Promise<NodeOutcome> {
  // A verify node's input is the reviewed output, so the checkpoint's input digest covers what was judged.
  const input = node.kind === "verify" ? state.outputs.get(node.of) ?? null : carried;
  if (node.kind === "verify" && input === null) return fail(state, node.id, `node ${node.of} produced no output to review`);
  const nonce = randomUUID();
  const inputDigest = sha256Hex(canonicalize({ input }));
  let prior = state.progress.nodes.get(node.id);
  if (prior !== undefined) {
    if (prior.inputDigest !== inputDigest) return fail(state, node.id, "workflow dependency inputs differ from the committed checkpoint");
    if (prior.status === "succeeded") {
      state.outputs.set(node.id, prior.output!);
      return { ok: true, text: prior.output! };
    }
    if (prior.status === "running") {
      prior = { ...prior, status: "TOOL_OUTCOME_UNKNOWN", reason: "TOOL_OUTCOME_UNKNOWN: interrupted delegation requires explicit operator reconciliation before retry" };
      state.progress.record(node.id, prior);
    }
    if (prior.status !== "waiting") return fail(state, node.id, prior.reason ?? prior.status, prior.status === "TOOL_OUTCOME_UNKNOWN");
  }
  const checkpoint: WorkflowNodeProgress = prior ?? { status: "waiting", inputDigest,
    operationKey: state.progress.operationKey(node.id), childSessionId: init.mintSessionId() };
  if (prior === undefined) state.progress.record(node.id, checkpoint, canonicalize({ input }));
  await state.acquire();
  let dispatched = false;
  try {
    if (init.signal?.aborted) return fail(state, node.id, "workflow cancelled before dispatch");
    if (state.stopped !== undefined) return fail(state, node.id, state.stopped.reason, state.stopped.unknown);
    const blocked = state.blocked();
    if (blocked !== undefined) return fail(state, node.id, blocked.reason, blocked.unknown);
    const scope = intersectDelegationScopes(init.delegationScope, node.scope);
    if (scope !== undefined && scope.length === 0) return fail(state, node.id, "workflow node scope has no operator-permitted action class");
    let request: SubagentRequest = { runAs: node.runAs,
      goal: node.kind === "verify" ? `${node.goal}\n\n${verdictInstruction(nonce)}\n\nOutput under review (node ${node.of}):\n${input}`
        : input === null ? node.goal : `${node.goal}\n\nInput from the previous step:\n${input}`,
      ...(scope === undefined ? {} : { delegationScope: scope }),
      ...(init.stopConditions === undefined ? {} : { stopConditions: init.stopConditions }) };
    if (node.agent !== undefined) {
      // Resolved against the operator's catalog and applied before the spawn, as the delegate tool does.
      const resolved = resolveAgentDefinition(init.definitions, node.agent);
      if (!resolved.ok) return fail(state, node.id, resolved.reason);
      const applied = applyAgentDefinition(request, resolved.definition);
      if (!applied.ok) return fail(state, node.id, applied.reason);
      request = applied.request;
    }
    state.progress.record(node.id, { ...checkpoint, status: "running" }, canonicalize({ input }));
    state.progress.assertDispatchFence();
    dispatched = true;
    state.agentsRun++;
    let runnerSettled = true;
    let runnerThrew = false;
    let runnerSignal = init.signal;
    const runner: SubagentRunner = Object.assign(async (context: Parameters<SubagentRunner>[0]) => {
      runnerSettled = false;
      runnerSignal = context.signal;
      try { return await init.runner(context); }
      catch (error) { runnerThrew = true; throw error; }
      finally { runnerSettled = true; }
    }, init.runner.hookControl === undefined ? {} : { hookControl: init.runner.hookControl });
    const outcome = await spawnSubagent({
      workspace: init.workspace, parent: init.parent, request,
      ...(init.definitions === undefined ? {} : { definitions: init.definitions }),
      session: init.session, runner, mintSessionId: () => checkpoint.childSessionId,
      ...(init.parentLeaseToken === undefined ? {} : { parentLeaseToken: init.parentLeaseToken }),
      ...(init.maxDepth === undefined ? {} : { maxDepth: init.maxDepth }),
      ...(init.maxActiveChildren === undefined ? {} : { maxActiveChildren: init.maxActiveChildren }),
      ...(init.signal === undefined ? {} : { signal: init.signal }),
      ...(init.cancelGraceMs === undefined ? {} : { cancelGraceMs: init.cancelGraceMs })
    });
    if (!outcome.ok) {
      // A settled negative report is a failed node. Throws/cancellation/abandonment cannot prove its outcome.
      const unknown = outcome.packetId !== null && (runnerThrew || runnerSignal?.aborted === true || !runnerSettled);
      const reason = unknown ? `TOOL_OUTCOME_UNKNOWN: ${outcome.reason}; explicit operator reconciliation required before retry` : outcome.reason;
      if (!runnerSettled) state.block(reason, unknown);
      state.progress.record(node.id, { ...checkpoint, status: unknown ? "TOOL_OUTCOME_UNKNOWN" : "failed", reason }, "", outcome.packetId ?? undefined);
      return fail(state, node.id, reason, unknown);
    }
    let output = outcome.childText;
    if (node.kind === "verify") {
      // Judged BEFORE the final checkpoint, so the log never says "succeeded" for a node the run reports as failed.
      const verdict = readVerdict(outcome.childText, nonce);
      if (verdict !== "pass") {
        // The RUNTIME's account only: the verifier's words stay in its child session (named here), never in a plaintext
        // progress row, and never where the workflow tool reads failure reasons for its effect classification.
        const reason = `verify ${verdict === "fail" ? "verdict: fail" : `verdict ${verdict}`} (the verifier's text is in child session ${checkpoint.childSessionId}, not in this row)`;
        state.progress.record(node.id, { ...checkpoint, status: "failed", reason }, "", outcome.packetId);
        return fail(state, node.id, reason);
      }
      output = input!; // The reviewed output carries forward; the verifier's own text is in its child session.
    }
    state.progress.record(node.id, { ...checkpoint, status: "succeeded", output }, canonicalize(output), outcome.packetId);
    state.outputs.set(node.id, output);
    return { ok: true, text: output };
  } catch (error) {
    // A failed result commit leaves the durable dispatch intact. Never publish its uncommitted answer.
    state.stopped = { reason: `${dispatched ? "TOOL_OUTCOME_UNKNOWN: " : ""}${error instanceof Error ? error.message : String(error)}`, unknown: dispatched };
    return fail(state, node.id, state.stopped.reason, state.stopped.unknown);
  } finally { state.release(); }
}

async function runNode(node: WorkflowNode, input: string | null, init: WorkflowRunInit, state: RunState): Promise<NodeOutcome> {
  if (init.signal?.aborted) return fail(state, node.id, "workflow cancelled before admission");
  if (state.stopped !== undefined) return fail(state, node.id, state.stopped.reason, state.stopped.unknown);
  if (isWorkflowLeaf(node)) {
    try { return await runAgent(node, input, init, state); }
    catch (error) {
      // Thrown before runAgent's own dispatch guard: nothing was dispatched, so nothing is unknown.
      state.stopped = { reason: error instanceof Error ? error.message : String(error), unknown: false };
      return fail(state, node.id, state.stopped.reason);
    }
  }
  if (node.kind === "parallel") {
    // Only leaf agents reserve slots, so nested composites cannot deadlock on their own children.
    const settled = await Promise.all(node.children.map(child => runNode(child, input, init, state)));
    const answers = settled.filter((one): one is { ok: true; text: string } => one.ok);
    if (answers.length !== settled.length) return { ok: false };
    return { ok: true, text: answers.map(one => one.text).join("\n\n") };
  }
  let carried = input;
  for (const stage of node.stages) {
    const outcome = await runNode(stage, carried, init, state);
    if (!outcome.ok) return { ok: false };
    carried = outcome.text;
  }
  return { ok: true, text: carried ?? "" };
}

/** The plan scheduler's bound under a root-wide active-child cap: 1 through 8 (a cap of 0 still refuses every child at the spawn). */
export function parallelWithin(maxActiveChildren: number): number {
  return Math.max(1, Math.min(8, maxActiveChildren));
}

export async function runWorkflowPlan(init: WorkflowRunInit): Promise<WorkflowRunResult> {
  const runId = init.runId ?? randomUUID();
  const outputs = new Map<string, string>();
  const failures: WorkflowFailure[] = [];
  const refused = (reason: string, unknown = false): WorkflowRunResult => ({ runId, ok: false, outputs,
    failures: [{ nodeId: init.plan?.id ?? "workflow", reason, ...(unknown ? { unknown: true as const } : {}) }],
    cancelled: init.signal?.aborted === true, agentsRun: 0 });
  const parsed = parseWorkflowPlan(init.plan);
  if (!parsed.ok) return refused(parsed.reason);
  // Caller-owned arrays/identity cannot change between the checkpoint and an awaited admission.
  init = { ...init, plan: JSON.parse(canonicalize(parsed.plan)) as WorkflowNode, parent: { ...init.parent },
    ...(init.delegationScope === undefined ? {} : { delegationScope: [...init.delegationScope] }),
    ...(init.stopConditions === undefined ? {} : { stopConditions: [...init.stopConditions] }) };
  const maxParallel = init.maxParallelAgents ?? 8;
  if (!Number.isSafeInteger(maxParallel) || maxParallel < 1 || maxParallel > 8) return refused("maxParallelAgents must be an integer from 1 through 8");
  if (typeof runId !== "string" || !runId.trim() || runId !== runId.trim() || Buffer.byteLength(runId) > 256 || /[\x00-\x1f\x7f]/.test(runId)) {
    return refused("workflow runId must be an exact nonempty identity of at most 256 bytes");
  }
  let sessionKey: string | undefined;
  try {
    const progress = workflowProgress({ ...init, runId, controls: {
      maxDepth: init.maxDepth ?? null, delegationScope: init.delegationScope ?? null,
      ...(init.maxActiveChildren === undefined ? {} : { maxActiveChildren: init.maxActiveChildren }),
      stopConditions: init.stopConditions ?? null, hookControl: init.runner.hookControl ?? null,
      agentDefinitions: init.definitions === undefined ? null : agentDefinitionsDigest(init.definitions)
    } });
    sessionKey = progress.sessionKey;
    const admission = activeSessions.get(sessionKey) ?? { runs: new Set<string>(), live: 0, waiting: [], blocked: undefined as Stop | undefined };
    if (admission.runs.has(runId)) { sessionKey = undefined; return refused("workflow run is already active in this owning session"); }
    if (progress.unresolvedRuns.some(id => id !== runId && !admission.runs.has(id))) {
      sessionKey = undefined;
      return refused("TOOL_OUTCOME_UNKNOWN: an unresolved workflow in this session requires operator reconciliation; a new runId cannot retry it", true);
    }
    admission.runs.add(runId);
    activeSessions.set(sessionKey, admission);
    let live = 0;
    const waiting: Array<() => void> = [];
    const state: RunState = { outputs, failures, agentsRun: 0, progress,
      block: (reason, unknown) => { admission.blocked = { reason, unknown }; }, blocked: () => admission.blocked,
      acquire: async () => {
        if (live >= maxParallel) await new Promise<void>(resolve => waiting.push(resolve));
        else live++;
        if (admission.live >= 8) await new Promise<void>(resolve => admission.waiting.push(resolve));
        else admission.live++;
      },
      release: () => {
        const globalNext = admission.waiting.shift(); if (globalNext) globalNext(); else admission.live--;
        const next = waiting.shift(); if (next) next(); else live--;
      } };
    const outcome = await runNode(init.plan, null, init, state);
    const cancelled = init.signal?.aborted === true;
    return { runId, ok: outcome.ok && !cancelled, outputs, failures, cancelled, agentsRun: state.agentsRun };
  } catch (error) { return refused(error instanceof Error ? error.message : String(error)); }
  finally {
    if (sessionKey !== undefined) {
      const admission = activeSessions.get(sessionKey)!;
      admission.runs.delete(runId);
      if (admission.runs.size === 0 && admission.blocked === undefined) activeSessions.delete(sessionKey);
    }
  }
}

export { planAgentCount };
