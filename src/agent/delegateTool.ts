import { randomUUID } from "node:crypto";
import { defineTool } from "../tools/toolRegistry.js";
import { spawnSubagent, type DelegationRecorder, type SubagentRunner } from "./subagentSpawn.js";
import { DEFAULT_MAX_DELEGATION_DEPTH, type DelegationIdentity } from "./delegationIdentity.js";
import type { ToolDefinition, ToolExecution } from "../tools/toolTypes.js";

/**
 * `ctx.subagents`, in AMC's idiom (P6.1a).
 *
 * WHY THIS IS A TOOL AND NOT A CONTEXT PROPERTY. There is no `ctx` object in the
 * agent loop, and there cannot be one at that layer: only `src/kernel/**` may
 * import Cordis, enforced by `scripts/architecture-boundaries-check.mjs`. What
 * AMC has instead is `ToolExecution` — ids, strings and frozen arguments, with no
 * service handles — and one established way to give a tool body a service:
 * closure capture at registration. `agentToolset` already binds its registry,
 * pipeline and ledger that way. So delegation arrives as a tool the parent's
 * toolset closes over, which is the same capability under AMC's constraints.
 *
 * WHY DEPTH COMES FROM AN IDENTITY, NOT FROM `agentId`. Every run in a chain
 * shares `governedAs` by design, so `agentId` cannot say how deep this one is.
 * The capability therefore carries the CALLER's `DelegationIdentity`, and a child
 * that can itself delegate is given a toolset carrying its own. Without that,
 * `delegateTo` would always be handed the root and `maxDepth` would be a field
 * nothing enforces — the exact shape `src/score/orchestrationDAG.ts` already
 * penalises in other people's systems.
 *
 * WHY THE TWO ACCOUNTS ARE NEVER CONCATENATED. On success the tool returns the
 * child's OWN words and nothing else; on refusal it returns the runtime's account
 * and nothing else. The runtime's account of a SUCCESSFUL delegation is not
 * withheld — it is in the `agent_delegation_completed` row, which is where it
 * belongs. Mixing the two into one string would put a runtime summary in front of
 * the model as though the child had written it.
 *
 * `additionalContext` on `ToolCallOutcome` would let the child's words arrive as
 * their own durable inbox row instead. `pipelineToolSeam` does not plumb it
 * today, so this returns through the tool result; the separation above holds
 * either way.
 */

/** What `agentToolset` needs to offer delegation. Absent means an agent that cannot delegate. */
export interface SubagentCapability {
  /** The CALLER's identity. Depth is read from here, never from `agentId`. */
  readonly identity: DelegationIdentity;
  /** Executes a child. `createDriverRunner` builds the real one. */
  readonly runner: SubagentRunner;
  /** Where the delegation rows are written: the CALLER's session. */
  readonly session: DelegationRecorder;
  readonly maxDepth?: number;
  /** Injected so a test can pin the child's session id. */
  readonly mintSessionId?: () => string;
}

const DELEGATE_PARAMETERS = Object.freeze({
  type: "object",
  properties: {
    runAs: {
      type: "string",
      description: "a short name for the delegate, used only to label its evidence"
    },
    goal: {
      type: "string",
      description: "what the delegate should do, in full — it sees none of this conversation"
    }
  },
  required: ["runAs", "goal"]
});

interface DelegateArgs {
  readonly runAs: string;
  readonly goal: string;
}

/**
 * Read the model's arguments without trusting their shape.
 *
 * A model that sends the wrong shape gets a refusal it can act on, not a crash
 * and not a delegation with an empty goal — a child asked to do nothing still
 * costs a turn and still writes a delegation to the log.
 */
function readArgs(raw: unknown): { ok: true; args: DelegateArgs } | { ok: false; detail: string } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, detail: "arguments must be an object with runAs and goal" };
  }
  const record = raw as Record<string, unknown>;
  const runAs = typeof record["runAs"] === "string" ? record["runAs"].trim() : "";
  const goal = typeof record["goal"] === "string" ? record["goal"].trim() : "";
  if (runAs.length === 0) {
    return { ok: false, detail: "runAs must be a non-empty string" };
  }
  if (goal.length === 0) {
    return { ok: false, detail: "goal must be a non-empty string; a delegate sees none of this conversation" };
  }
  return { ok: true, args: { runAs, goal } };
}

/**
 * Build the `delegate` tool for one caller.
 *
 * `drain` stays inside the body: the child is spawned, run and settled before
 * this returns. `whenIdle()` is per-driver and nothing links a child's lifetime
 * to its parent's, so handing back a live child would let one outlive the run
 * that authorised it with no lifecycle evidence saying so.
 */
export function delegateTool(capability: SubagentCapability): ToolDefinition {
  const maxDepth = capability.maxDepth ?? DEFAULT_MAX_DELEGATION_DEPTH;
  const mintSessionId = capability.mintSessionId ?? (() => `child-${randomUUID().slice(0, 12)}`);

  return defineTool({
    name: "delegate",
    actionClass: "READ_ONLY",
    description:
      "Hand a self-contained task to a delegate agent and wait for its answer. The delegate shares "
      + "this run's budget and permissions, starts with no memory of this conversation, and its work "
      + "is recorded against this run.",
    parameters: DELEGATE_PARAMETERS,
    body: async (execution: ToolExecution) => {
      const parsed = readArgs(execution.arguments);
      if (!parsed.ok) {
        return { output: `[amc] delegation refused: ${parsed.detail}` };
      }

      const outcome = await spawnSubagent({
        workspace: execution.workspace,
        parent: capability.identity,
        request: { runAs: parsed.args.runAs, goal: parsed.args.goal },
        session: capability.session,
        runner: capability.runner,
        mintSessionId,
        maxDepth
      });

      if (!outcome.ok) {
        // The runtime's account, alone. Nothing the child said is mixed in,
        // because on this path the child said nothing.
        return { output: `[amc] delegation refused: ${outcome.reason}` };
      }

      // The child's own words, alone. The runtime's account of this delegation
      // is in the `agent_delegation_completed` row, not in front of the model.
      return { output: outcome.childText };
    }
  });
}
