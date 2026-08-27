import { defineTool } from "../tools/toolRegistry.js";
import { MAX_PLAN_NODES, parseWorkflowPlan } from "./workflowPlan.js";
import { runWorkflowPlan } from "./workflowRunner.js";
import type { SubagentCapability } from "../agent/delegateTool.js";
import type { ToolDefinition, ToolExecution } from "../tools/toolTypes.js";

/**
 * `workflow` — run a declared plan of delegations (plan P6.1c).
 *
 * GRANTED TWICE, like `delegate`, and more load-bearing here. One call can spawn
 * up to {@link MAX_PLAN_NODES} delegations, so the INTEGRATOR composes the
 * capability into a toolset and the OPERATOR permits the tool in a signed
 * allowlist. Either party alone is not enough: a library switch should not be
 * able to turn on something that spends an operator's budget on a fan-out of
 * agents they did not start.
 *
 * WHY IT IS A PLAN AND NOT A SCRIPT. See ./workflowPlan.ts — a worker thread is
 * not a security boundary in Node and AMC cannot confine one, so a model-written
 * script would recreate the defect `d80cc212` fixed. A plan is JSON, and JSON
 * runs nothing.
 *
 * WHAT COMES BACK. `delegate` returns the child's words alone, because there is
 * exactly one child and anything else would put a runtime summary in front of
 * the model as though the child had written it. A workflow has many children, so
 * the answers are returned keyed by NODE ID — the model's own labels, from the
 * plan it authored, which is returning the shape it asked for rather than adding
 * framing. Failures live in their own field beside them, never concatenated into
 * the answers: the two are structurally separate and stay that way.
 *
 * Partial results are reported rather than discarded. A `parallel` whose third
 * child failed still did the first two, and that work was already paid for.
 */

const WORKFLOW_PARAMETERS = Object.freeze({
  type: "object",
  properties: {
    plan: {
      type: "object",
      description:
        "A workflow plan. One of: {kind:'agent', id, runAs, goal, scope?} to delegate one task; "
        + "{kind:'parallel', id, children:[...]} to run nodes concurrently and wait for all; "
        + "{kind:'pipeline', id, stages:[...]} to run nodes in order, each receiving the previous "
        + "answer. Every id must be unique — answers come back keyed by it. A delegate sees none "
        + `of this conversation, so each goal must stand alone. At most ${MAX_PLAN_NODES} nodes.`
    }
  },
  required: ["plan"]
});

/** Build the `workflow` tool for one caller. */
export function workflowTool(capability: SubagentCapability): ToolDefinition {
  return defineTool({
    name: "workflow",
    actionClass: "READ_ONLY",
    description:
      "Run a declared plan of delegated tasks — in parallel, in a pipeline, or nested. Each "
      + "delegate shares this run's budget and permissions, starts with no memory of this "
      + "conversation, and its work is recorded against this run. Answers come back keyed by the "
      + "node ids you chose.",
    parameters: WORKFLOW_PARAMETERS,
    body: async (execution: ToolExecution) => {
      const args = execution.arguments;
      const raw = args !== null && typeof args === "object"
        ? (args as Record<string, unknown>)["plan"]
        : undefined;

      // Refused as DATA, before a single delegation is authorised. That is the
      // only moment at which nothing has been spent.
      const parsed = parseWorkflowPlan(raw);
      if (!parsed.ok) {
        return { output: `[amc] workflow refused: ${parsed.reason}` };
      }

      const result = await runWorkflowPlan({
        workspace: execution.workspace,
        plan: parsed.plan,
        parent: capability.identity,
        session: capability.session,
        runner: capability.runner,
        mintSessionId: capability.mintSessionId ?? (() => `child-${crypto.randomUUID().slice(0, 12)}`),
        ...(capability.maxDepth === undefined ? {} : { maxDepth: capability.maxDepth }),
        ...(execution.signal === undefined ? {} : { signal: execution.signal })
      });

      return {
        output: JSON.stringify({
          outputs: Object.fromEntries(result.outputs),
          failed: result.failures,
          cancelled: result.cancelled,
          agentsRun: result.agentsRun
        })
      };
    }
  });
}
