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
/** Root is depth 1. Bounds apply while reading, before recursion or serialization. */
export const MAX_PLAN_DEPTH = 16;
export const MAX_PLAN_BYTES = 256 * 1024;

interface WorkflowLeaf {
  readonly id: string;
  readonly runAs: string;
  readonly goal: string;
  readonly scope?: readonly ActionClass[];
  /** An operator-defined agent role (SH-ORCH-01); resolved against the admitted catalog when the node runs. */
  readonly agent?: string;
}

/**
 * A `verify` node reviews an EARLIER leaf's output (`of`) and gates the plan on
 * its verdict: the control flow is deterministic, the judgement is a model's.
 * `of` must name a leaf in an earlier stage of an enclosing pipeline, so the
 * reviewed output exists before the verifier is admitted and a sibling cannot
 * review a sibling. On pass the reviewed output, not the verifier's text, is
 * what the next stage receives.
 */
export type WorkflowNode =
  | (WorkflowLeaf & { readonly kind: "agent" })
  | (WorkflowLeaf & { readonly kind: "verify"; readonly of: string })
  | { readonly kind: "parallel"; readonly id: string; readonly children: readonly WorkflowNode[] }
  | { readonly kind: "pipeline"; readonly id: string; readonly stages: readonly WorkflowNode[] };

export const isWorkflowLeaf = (node: WorkflowNode): node is Extract<WorkflowNode, { kind: "agent" | "verify" }> =>
  node.kind === "agent" || node.kind === "verify";

/** Every leaf id under a node; what a later `verify` may name. */
function leafIds(node: WorkflowNode): string[] {
  if (isWorkflowLeaf(node)) return [node.id];
  return (node.kind === "parallel" ? node.children : node.stages).flatMap(leafIds);
}

export type ParsedPlan =
  | { readonly ok: true; readonly plan: WorkflowNode }
  | { readonly ok: false; readonly reason: string };

/** How many delegations this plan would spawn. Knowable before any of them run. */
export function planAgentCount(node: WorkflowNode): number {
  if (isWorkflowLeaf(node)) return 1;
  const children = node.kind === "parallel" ? node.children : node.stages;
  return children.reduce((total, child) => total + planAgentCount(child), 0);
}

interface ParseBudget {
  readonly ids: Set<string>;
  nodes: number;
  bytes: number;
}

const byteRefusal = (): ParsedPlan => ({ ok: false, reason: `workflow plan exceeds its ${MAX_PLAN_BYTES} byte budget` });
const nodeRefusal = (): ParsedPlan => ({ ok: false, reason: `workflow plan exceeds the ${MAX_PLAN_NODES} nodes a single plan may contain` });

/** Conservative JSON byte budget for consumed fields; unused metadata is ignored, never serialized. */
function consumeString(budget: ParseBudget, value: string): boolean {
  if (value.length > MAX_PLAN_BYTES - budget.bytes) return false;
  budget.bytes += Buffer.byteLength(value, "utf8") + 3;
  if (budget.bytes > MAX_PLAN_BYTES) return false;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || char === '"' || char === "\\") budget.bytes += 5;
    else if (char.length === 1 && code >= 0xd800 && code <= 0xdfff) budget.bytes += 3;
    if (budget.bytes > MAX_PLAN_BYTES) return false;
  }
  return true;
}

const AGENT_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** `visible`: leaf ids of earlier stages in every enclosing pipeline — the only outputs a `verify` may review. */
function parseNode(raw: unknown, budget: ParseBudget, depth: number, visible: ReadonlySet<string>): ParsedPlan {
  if (depth > MAX_PLAN_DEPTH) return { ok: false, reason: `workflow plan exceeds depth ${MAX_PLAN_DEPTH}` };
  if (budget.nodes >= MAX_PLAN_NODES) return nodeRefusal();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "a workflow node must be an object" };
  }
  budget.nodes += 1;
  budget.bytes += 64; // Covers consumed property names, array separators and object punctuation.
  if (budget.bytes > MAX_PLAN_BYTES) return byteRefusal();
  const node = raw as Record<string, unknown>;
  const rawId = node["id"];
  if (typeof rawId === "string" && !consumeString(budget, rawId)) return byteRefusal();
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (id.length === 0) return { ok: false, reason: "every workflow node needs a non-empty id" };
  if (budget.ids.has(id)) {
    // Outputs are keyed by node id. A duplicate would silently overwrite one
    // agent's answer with another's, and the plan would still report success.
    return { ok: false, reason: `duplicate workflow node id ${JSON.stringify(id)}` };
  }
  budget.ids.add(id);

  const kind = node["kind"];
  if (typeof kind === "string" && !consumeString(budget, kind)) return byteRefusal();
  if (kind === "agent" || kind === "verify") {
    const rawRunAs = node["runAs"], rawGoal = node["goal"];
    if ((typeof rawRunAs === "string" && !consumeString(budget, rawRunAs))
      || (typeof rawGoal === "string" && !consumeString(budget, rawGoal))) return byteRefusal();
    const runAs = typeof rawRunAs === "string" ? rawRunAs.trim() : "";
    const goal = typeof rawGoal === "string" ? rawGoal.trim() : "";
    if (runAs.length === 0) return { ok: false, reason: `node ${id}: runAs must be a non-empty string` };
    if (goal.length === 0) {
      return { ok: false, reason: `node ${id}: goal must be a non-empty string; a delegate sees none of this plan` };
    }
    let scope: readonly ActionClass[] | undefined;
    if (node["scope"] !== undefined) {
      // A flat type check, never String(): String() on a nested array recurses through join with no depth cap, so one
      // deeply nested scope would throw RangeError on every read of the plan (A4 readiness, workflowTool).
      const rawScope = node["scope"];
      if (!Array.isArray(rawScope)) {
        return { ok: false, reason: `node ${id}: scope must be an array of strings` };
      }
      if (rawScope.length > MAX_PLAN_BYTES - budget.bytes) return byteRefusal();
      for (const entry of rawScope) {
        if (typeof entry !== "string") return { ok: false, reason: `node ${id}: scope must be an array of strings` };
        if (!consumeString(budget, entry)) return byteRefusal();
      }
      const parsed = parseDelegationScope(rawScope);
      if (!parsed.ok) return { ok: false, reason: `node ${id}: ${parsed.reason}` };
      scope = parsed.classes;
    }
    let agent: string | undefined;
    if (node["agent"] !== undefined) {
      const rawAgent = node["agent"];
      if (typeof rawAgent !== "string" || !consumeString(budget, rawAgent)) return { ok: false, reason: `node ${id}: agent must be a string` };
      if (!AGENT_NAME.test(rawAgent)) return { ok: false, reason: `node ${id}: agent must be a definition name (lowercase letters, digits, dashes)` };
      agent = rawAgent;
    }
    const leaf: WorkflowLeaf = { id, runAs, goal, ...(scope === undefined ? {} : { scope }), ...(agent === undefined ? {} : { agent }) };
    if (kind === "agent") return { ok: true, plan: { kind: "agent", ...leaf } };
    const rawOf = node["of"];
    if (typeof rawOf !== "string" || !consumeString(budget, rawOf)) return { ok: false, reason: `node ${id}: verify needs \`of\`, the id of the node whose output it reviews` };
    if (!visible.has(rawOf)) {
      // Forward, sibling and cross-branch references are refused as data: the reviewed output must already exist.
      return { ok: false, reason: `node ${id}: verify may only review a leaf in an earlier stage of an enclosing pipeline; ${JSON.stringify(rawOf)} is not one` };
    }
    return { ok: true, plan: { kind: "verify", ...leaf, of: rawOf } };
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
    if (raws.length > MAX_PLAN_NODES - budget.nodes) return nodeRefusal();
    const parsedChildren: WorkflowNode[] = [];
    const seen = new Set(visible);
    for (const child of raws) {
      const parsed = parseNode(child, budget, depth + 1, kind === "pipeline" ? seen : visible);
      if (!parsed.ok) return parsed;
      parsedChildren.push(parsed.plan);
      if (kind === "pipeline") for (const leaf of leafIds(parsed.plan)) seen.add(leaf);
    }
    return kind === "parallel"
      ? { ok: true, plan: { kind: "parallel", id, children: parsedChildren } }
      : { ok: true, plan: { kind: "pipeline", id, stages: parsedChildren } };
  }

  return {
    ok: false,
    reason: `node ${id}: unknown kind ${typeof kind === "string" ? JSON.stringify(kind.slice(0, 100)) : typeof kind}; expected agent, verify, parallel or pipeline`
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
  try {
    return parseNode(raw, { ids: new Set<string>(), nodes: 0, bytes: 0 }, 1, new Set());
  } catch {
    return { ok: false, reason: "workflow plan could not be read safely" };
  }
}
