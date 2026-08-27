import { parseDelegationScope } from "../agent/delegationScope.js";
import type { ActionClass } from "../types.js";

/**
 * A workflow as DATA (plan P6.1c).
 *
 * WHY NOT A SCRIPT. The plan line reads "worker-thread scripts, model-written",
 * and that cannot be built as written. `d80cc212` established the reason: a
 * worker thread is not a security boundary in Node — it shares the process's
 * filesystem, environment and ability to spawn — and AMC cannot confine one,
 * because nothing re-execs the host under a sandbox profile and
 * `SandboxRunner.run` confines a SUBPROCESS. Code Mode's guard was asking a
 * question the architecture could not answer affirmatively, and answered it
 * wrongly on every Mac. A second model-written code-execution surface would
 * recreate exactly that defect.
 *
 * A declared plan gets the orchestration with no execution surface at all. A
 * model authors one by emitting JSON, and JSON runs nothing. What is lost is
 * arbitrary computation between steps — a script could filter, branch and
 * transform. That is a real loss and the honest trade: `parallel` and `pipeline`
 * cover the shapes worth having, and the third option (model-written scripts in
 * a sandboxed subprocess) stays open without a false claim standing in for it.
 *
 * WHAT IS NOT DECIDED HERE. Nothing about governance. Every `agent` node runs
 * through `spawnSubagent`, so it gets the depth refusal, the signed handoff
 * packet, the declared scope and the started/completed pair — exactly as a
 * `delegate` tool call does. A workflow that spawned agents any other way would
 * be a side channel around all of it, which is the one thing this must never be.
 */

/** The most nodes a single plan may contain. */
export const MAX_PLAN_NODES = 64;

export type WorkflowNode =
  | {
      readonly kind: "agent";
      readonly id: string;
      readonly runAs: string;
      readonly goal: string;
      readonly scope?: readonly ActionClass[];
    }
  | { readonly kind: "parallel"; readonly id: string; readonly children: readonly WorkflowNode[] }
  | { readonly kind: "pipeline"; readonly id: string; readonly stages: readonly WorkflowNode[] };

export type ParsedPlan =
  | { readonly ok: true; readonly plan: WorkflowNode }
  | { readonly ok: false; readonly reason: string };

function countNodes(node: WorkflowNode): number {
  if (node.kind === "agent") return 1;
  const children = node.kind === "parallel" ? node.children : node.stages;
  return 1 + children.reduce((total, child) => total + countNodes(child), 0);
}

/** How many delegations this plan would spawn. Knowable before any of them run. */
export function planAgentCount(node: WorkflowNode): number {
  if (node.kind === "agent") return 1;
  const children = node.kind === "parallel" ? node.children : node.stages;
  return children.reduce((total, child) => total + planAgentCount(child), 0);
}

function parseNode(raw: unknown, seen: Set<string>): ParsedPlan {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "a workflow node must be an object" };
  }
  const node = raw as Record<string, unknown>;
  const id = typeof node["id"] === "string" ? node["id"].trim() : "";
  if (id.length === 0) return { ok: false, reason: "every workflow node needs a non-empty id" };
  if (seen.has(id)) {
    // Outputs are keyed by node id. A duplicate would silently overwrite one
    // agent's answer with another's, and the plan would still report success.
    return { ok: false, reason: `duplicate workflow node id ${JSON.stringify(id)}` };
  }
  seen.add(id);

  const kind = node["kind"];
  if (kind === "agent") {
    const runAs = typeof node["runAs"] === "string" ? node["runAs"].trim() : "";
    const goal = typeof node["goal"] === "string" ? node["goal"].trim() : "";
    if (runAs.length === 0) return { ok: false, reason: `node ${id}: runAs must be a non-empty string` };
    if (goal.length === 0) {
      return { ok: false, reason: `node ${id}: goal must be a non-empty string; a delegate sees none of this plan` };
    }
    let scope: readonly ActionClass[] | undefined;
    if (node["scope"] !== undefined) {
      if (!Array.isArray(node["scope"])) return { ok: false, reason: `node ${id}: scope must be an array` };
      const parsed = parseDelegationScope((node["scope"] as unknown[]).map(String));
      if (!parsed.ok) return { ok: false, reason: `node ${id}: ${parsed.reason}` };
      scope = parsed.classes;
    }
    return { ok: true, plan: { kind: "agent", id, runAs, goal, ...(scope === undefined ? {} : { scope }) } };
  }

  if (kind === "parallel" || kind === "pipeline") {
    const key = kind === "parallel" ? "children" : "stages";
    const raws = node[key];
    if (!Array.isArray(raws)) return { ok: false, reason: `node ${id}: ${kind} needs an array of ${key}` };
    if (raws.length === 0) {
      // Almost always a truncated plan, and running it would report a successful
      // workflow that did nothing.
      return { ok: false, reason: `node ${id}: a ${kind} with no ${key} would run nothing and report success` };
    }
    const parsedChildren: WorkflowNode[] = [];
    for (const child of raws) {
      const parsed = parseNode(child, seen);
      if (!parsed.ok) return parsed;
      parsedChildren.push(parsed.plan);
    }
    return kind === "parallel"
      ? { ok: true, plan: { kind: "parallel", id, children: parsedChildren } }
      : { ok: true, plan: { kind: "pipeline", id, stages: parsedChildren } };
  }

  return {
    ok: false,
    reason: `node ${id}: unknown kind ${JSON.stringify(kind)}; expected agent, parallel or pipeline`
  };
}

/**
 * Read a plan, or refuse it — before a single agent is spawned.
 *
 * The node cap is the fan-out bound. A plan is authored by a model, and an
 * unbounded plan is an unbounded number of delegations, each one spending the
 * operator's budget and each one a real process or turn. Refusing it as DATA is
 * the only point at which nothing has been spent yet.
 */
export function parseWorkflowPlan(raw: unknown): ParsedPlan {
  const parsed = parseNode(raw, new Set<string>());
  if (!parsed.ok) return parsed;
  const nodes = countNodes(parsed.plan);
  if (nodes > MAX_PLAN_NODES) {
    return {
      ok: false,
      reason: `workflow plan has ${nodes} nodes, more than the ${MAX_PLAN_NODES} a single plan may contain`
    };
  }
  return parsed;
}
