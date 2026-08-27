import { spawnSubagent } from "../agent/subagentSpawn.js";
import { planAgentCount, type WorkflowNode } from "./workflowPlan.js";
import type {
  DelegationRecorder,
  SubagentRunner
} from "../agent/subagentSpawn.js";
import type { DelegationIdentity } from "../agent/delegationIdentity.js";

/**
 * Execute a declared workflow plan (plan P6.1c).
 *
 * THE PROPERTY THAT MATTERS MOST. Every `agent` node runs through
 * `spawnSubagent` — the same chokepoint a `delegate` tool call uses. So each one
 * gets the depth refusal, an Ed25519 handoff packet minted and re-verified
 * before it runs, its declared scope narrowing the child's registry, and a
 * started/completed pair in the parent's signed log. A workflow that spawned
 * agents any other way would be a side channel around every governance
 * guarantee P6.1a and P6.1b built, and would be the most valuable thing in the
 * codebase to attack.
 *
 * It also means a workflow inherits the ceiling: children cannot themselves
 * delegate, so a plan is one generation wide however deeply its nodes nest.
 *
 * WHAT `parallel` AND `pipeline` MEAN HERE, stated because the words are used
 * differently elsewhere:
 *
 *   - `parallel` runs its children concurrently and waits for all of them. A
 *     failing child does NOT cancel its siblings: they do not depend on it, and
 *     stopping them would discard work already paid for. Every failure is
 *     reported.
 *   - `pipeline` runs its stages in order, and each stage receives the previous
 *     stage's answer appended to its goal. A failing stage STOPS the pipeline,
 *     because the stages after it were written expecting an input that does not
 *     exist.
 *
 * There is no `map`-over-items form and no cross-item streaming. Those need a
 * plan that can compute, and computation is exactly what a declared plan gives
 * up in exchange for having no execution surface.
 */

export interface WorkflowRunInit {
  readonly workspace: string;
  readonly plan: WorkflowNode;
  readonly parent: DelegationIdentity;
  readonly session: DelegationRecorder;
  readonly runner: SubagentRunner;
  readonly mintSessionId: () => string;
  readonly maxDepth?: number;
  readonly signal?: AbortSignal;
  readonly cancelGraceMs?: number;
}

export interface WorkflowFailure {
  readonly nodeId: string;
  readonly reason: string;
}

export interface WorkflowRunResult {
  readonly ok: boolean;
  /** Each agent node's answer, by node id. Absent for nodes that did not report. */
  readonly outputs: ReadonlyMap<string, string>;
  readonly failures: readonly WorkflowFailure[];
  /** True when the parent gave up part-way. */
  readonly cancelled: boolean;
  /** How many agent nodes were ATTEMPTED. Below `planAgentCount` when the plan stopped early. */
  readonly agentsRun: number;
}

interface RunState {
  readonly outputs: Map<string, string>;
  readonly failures: WorkflowFailure[];
  agentsRun: number;
}

/** One agent node's answer, or the reason there is none. */
type NodeOutcome = { readonly ok: true; readonly text: string } | { readonly ok: false };

async function runNode(
  node: WorkflowNode,
  input: string | null,
  init: WorkflowRunInit,
  state: RunState
): Promise<NodeOutcome> {
  // NO ABORT CHECK HERE, and that is deliberate. One was written and deleted
  // after measuring: `spawnSubagent` refuses an already-aborted delegation
  // before it authorises anything, and settles one aborted mid-flight as
  // `cancelled` rather than reported — so an agent node returns `ok: false`
  // either way, a pipeline stops at it either way, and a parallel's children are
  // all mapped before any of them can abort. Removing the check changed no test
  // and no outcome.
  //
  // Keeping it would put a second place where cancellation is decided, which is
  // exactly what the chokepoint design exists to avoid: two answers that can
  // drift. Cancellation is decided in `spawnSubagent`, once.
  if (node.kind === "agent") {
    state.agentsRun += 1;
    const outcome = await spawnSubagent({
      workspace: init.workspace,
      parent: init.parent,
      request: {
        runAs: node.runAs,
        // The previous stage's answer, when there was one. A delegate sees none
        // of the plan and none of the parent's conversation, so anything it
        // needs has to arrive in its goal.
        goal: input === null ? node.goal : `${node.goal}\n\nInput from the previous step:\n${input}`,
        ...(node.scope === undefined ? {} : { delegationScope: node.scope })
      },
      session: init.session,
      runner: init.runner,
      mintSessionId: init.mintSessionId,
      ...(init.maxDepth === undefined ? {} : { maxDepth: init.maxDepth }),
      ...(init.signal === undefined ? {} : { signal: init.signal }),
      ...(init.cancelGraceMs === undefined ? {} : { cancelGraceMs: init.cancelGraceMs })
    });

    if (!outcome.ok) {
      state.failures.push({ nodeId: node.id, reason: outcome.reason });
      return { ok: false };
    }
    state.outputs.set(node.id, outcome.childText);
    return { ok: true, text: outcome.childText };
  }

  if (node.kind === "parallel") {
    // Every child gets the SAME input: siblings are alternatives or facets of
    // one question, not a chain.
    const settled = await Promise.all(
      node.children.map((child) => runNode(child, input, init, state))
    );
    const answers = settled.filter((one): one is { ok: true; text: string } => one.ok);
    if (answers.length !== settled.length) return { ok: false };
    // A composite's own answer is its children's, joined. Nothing summarises
    // them: a summary would be a claim no agent made.
    return { ok: true, text: answers.map((one) => one.text).join("\n\n") };
  }

  let carried = input;
  for (const stage of node.stages) {
    const outcome = await runNode(stage, carried, init, state);
    if (!outcome.ok) return { ok: false };
    carried = outcome.text;
  }
  return { ok: true, text: carried ?? "" };
}

export async function runWorkflowPlan(init: WorkflowRunInit): Promise<WorkflowRunResult> {
  const state: RunState = { outputs: new Map<string, string>(), failures: [], agentsRun: 0 };
  const outcome = await runNode(init.plan, null, init, state);
  const cancelled = init.signal?.aborted === true;

  return {
    // `outcome.ok` alone, for the same measured reason as the missing abort
    // check above: a cancelled agent node already settles `ok: false` through
    // `spawnSubagent`, so `&& !cancelled` never changed an answer. `cancelled`
    // is still reported, because a caller needs to tell "this plan failed" from
    // "this plan was given up on".
    ok: outcome.ok,
    outputs: state.outputs,
    failures: state.failures,
    cancelled,
    agentsRun: state.agentsRun
  };
}

/** Re-exported so a caller can bound a plan before running it. */
export { planAgentCount };
