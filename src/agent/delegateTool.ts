import { randomUUID } from "node:crypto";
import { defineTool } from "../tools/toolRegistry.js";
import { spawnSubagent, type DelegationRecorder, type SubagentHandle, type SubagentRequest, type SubagentRunner } from "./subagentSpawn.js";
import { DEFAULT_MAX_DELEGATION_DEPTH, type DelegationIdentity } from "./delegationIdentity.js";
import type { ToolDefinition, ToolExecution } from "../tools/toolTypes.js";
import type { ActionClass } from "../types.js";
import { applyAgentDefinition, describeAgentDefinitions, resolveAgentDefinition, type AgentDefinition } from "./agentDefinitions.js";
import type { OpenDelegates } from "./delegateContinuations.js";

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
  /** Operator-selected root-wide child cap; never read from model arguments. */
  readonly maxActiveChildren?: number;
  /**
   * The action classes a delegate may invoke. Set by whoever composes the
   * toolset, never by the model.
   *
   * A model that could name its own scope could name `WRITE_HIGH`, which is not
   * a delegation control at all -- it is a request form. The model says what the
   * work is; the operator says what the work is allowed to touch. `readArgs`
   * therefore reads only `runAs` and `goal`, and nothing merges anything from
   * `execution.arguments` into this.
   */
  readonly delegationScope?: readonly ActionClass[];
  /** Operator-selected child lifetime limits; never read from model arguments. */
  readonly stopConditions?: readonly string[];
  /** Injected so a test can pin the child's session id. */
  readonly mintSessionId?: () => string;
  /**
   * The lease of the run that holds this capability (P2-25), handed to each child's runner as the parent lease its own
   * delegated lease extends. Set by whoever composes the toolset, never by the model. Absent at the root.
   */
  readonly parentLeaseToken?: string;
  /**
   * Operator-admitted agent definitions (SH-ORCH-01). The model may NAME one; the
   * narrowing it applies comes from the file the operator reviewed, never from
   * the call. Absent or empty, `agent` is refused with that fact.
   */
  readonly definitions?: ReadonlyMap<string, AgentDefinition>;
  /**
   * Whether this caller's delegates can be kept open for `delegate_continue` (SH-ORCH-05). Set by whoever composes
   * the toolset, never by the model: only in-process driver runners continue a child, and a foreign runner answers once.
   */
  readonly continuable?: boolean;
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
    },
    agent: {
      type: "string",
      description: "optional: the name of an operator-defined agent role; it only narrows what the delegate may do"
    }
  },
  required: ["runAs", "goal"]
});

/** Offered only where a kept-open delegate can be continued, so a foreign run's schema is unchanged. */
const KEEP_OPEN_PARAMETERS = Object.freeze({ ...DELEGATE_PARAMETERS, properties: { ...DELEGATE_PARAMETERS.properties,
  keepOpen: { type: "boolean", description: "optional: keep the delegate after its answer, to send it more work with delegate_continue under the same runAs; it holds a delegation slot until released or this run ends" } } });

interface DelegateArgs {
  readonly runAs: string;
  readonly goal: string;
  readonly agent?: string;
  readonly keepOpen?: boolean;
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
  const agent = record["agent"];
  if (agent !== undefined && (typeof agent !== "string" || agent.trim().length === 0)) {
    return { ok: false, detail: "agent, when given, must name a defined agent" };
  }
  const keepOpen = record["keepOpen"];
  if (keepOpen !== undefined && typeof keepOpen !== "boolean") return { ok: false, detail: "keepOpen, when given, must be true or false" };
  return { ok: true, args: { runAs, goal, ...(agent === undefined ? {} : { agent: agent.trim() }), ...(keepOpen === true ? { keepOpen } : {}) } };
}

/**
 * Build the `delegate` tool for one caller.
 *
 * By default `drain` stays inside the body: the child is spawned, run and
 * settled before this returns. `whenIdle()` is per-driver and nothing else
 * links a child's lifetime to its parent's, so a live child handed back without
 * an owner could outlive the run that authorised it with no lifecycle evidence
 * saying so. `keepOpen` (SH-ORCH-05) is the one exception, and it has an owner:
 * the caller's own open set, which its toolset releases at shutdown before the
 * caller's session is sealed, so the deferred `delegation-completed` always
 * lands. It is offered only when the composer says the runner can continue a
 * child and the operator's signed policy offers `delegate_continue`.
 */
export function delegateTool(capability: SubagentCapability, open?: OpenDelegates): ToolDefinition {
  const maxDepth = capability.maxDepth ?? DEFAULT_MAX_DELEGATION_DEPTH;
  const maxActiveChildren = capability.maxActiveChildren;
  const mintSessionId = capability.mintSessionId ?? (() => `child-${randomUUID().slice(0, 12)}`);
  const stopConditions = capability.stopConditions === undefined
    ? undefined : Object.freeze([...capability.stopConditions]);
  const keeps = capability.continuable === true ? open : undefined;
  const refuse = (detail: string): { ok: false; output: string } => ({ ok: false, output: `[amc] delegation refused: ${detail}` });

  return defineTool({
    name: "delegate",
    actionClass: "READ_ONLY",
    description:
      "Hand a self-contained task to a delegate agent and wait for its answer. The delegate shares "
      + "this run's budget and permissions, starts with no memory of this conversation, and its work "
      + "is recorded against this run."
      + (keeps === undefined ? "" : " With keepOpen it stays available to delegate_continue until released or this run ends.")
      + describeAgentDefinitions(capability.definitions ?? new Map()),
    parameters: keeps === undefined ? DELEGATE_PARAMETERS : KEEP_OPEN_PARAMETERS,
    body: async (execution: ToolExecution) => {
      const parsed = readArgs(execution.arguments);
      if (!parsed.ok) return refuse(parsed.detail);
      const { runAs } = parsed.args;
      const keepOpen = parsed.args.keepOpen === true;
      if (keepOpen && (keeps === undefined || !keeps.offered())) {
        return refuse("keepOpen needs delegate_continue, which this run does not offer: an in-process delegate and a signed tools policy that lists delegate_continue");
      }
      // Claimed before the first await, so two parallel calls cannot both keep one name.
      if (keepOpen && !keeps!.reserve(runAs)) {
        return refuse(`a delegate named ${JSON.stringify(runAs)} is already kept open; continue it with delegate_continue, release it, or choose another runAs`);
      }
      let kept: SubagentHandle | undefined;
      try {
        let request: SubagentRequest = {
          runAs,
          goal: parsed.args.goal,
          // From the capability, never from `parsed.args`.
          ...(capability.delegationScope === undefined
            ? {}
            : { delegationScope: capability.delegationScope }),
          ...(stopConditions === undefined ? {} : { stopConditions }),
          ...(keepOpen ? { continuable: true } : {})
        };
        if (parsed.args.agent !== undefined) {
          // Resolved against the operator's catalog and applied BEFORE the spawn, so the packet signs the narrowed request.
          const resolved = resolveAgentDefinition(capability.definitions, parsed.args.agent);
          if (!resolved.ok) return refuse(resolved.reason);
          const applied = applyAgentDefinition(request, resolved.definition);
          if (!applied.ok) return refuse(applied.reason);
          request = applied.request;
        }

        const outcome = await spawnSubagent({
          workspace: execution.workspace,
          parent: capability.identity,
          request,
          ...(capability.definitions === undefined ? {} : { definitions: capability.definitions }),
          session: capability.session,
          runner: capability.runner,
          mintSessionId,
          ...(capability.parentLeaseToken === undefined ? {} : { parentLeaseToken: capability.parentLeaseToken }),
          maxDepth,
          ...(maxActiveChildren === undefined ? {} : { maxActiveChildren }),
          ...(execution.signal === undefined ? {} : { signal: execution.signal })
        });

        if (!outcome.ok) {
          // The runtime's account, alone. Nothing the child said is mixed in,
          // because on this path the child said nothing.
          return refuse(outcome.reason);
        }
        // Present only for a kept-open child that is still live; one that settled at its ceiling frees the name.
        kept = outcome.handle;

        // The child's own words, alone. The runtime's account of this delegation
        // is in the `agent_delegation_completed` row, not in front of the model.
        return { ok: true, output: outcome.childText };
      } finally {
        if (keepOpen) keeps!.settle(runAs, kept);
      }
    }
  });
}
