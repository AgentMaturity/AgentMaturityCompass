/**
 * Plan mode (SH-LOOP-04): `amc agent-loop run --plan`.
 *
 * WHAT IT IS. A READ_ONLY action-class budget on the root toolset, built on the
 * same registry restriction a `--delegate-scope READ_ONLY` child runs under
 * (src/agent/delegationScope.ts). The restriction prunes every tool whose class
 * is not READ_ONLY from what the model is offered, so a direct call cannot
 * reach them and neither can a Code Mode program's sub-call, which resolves
 * tools through the same `registry.visible`. A deny-only registry GUARD backs
 * it for tools defined after composition (an MCP mount, a late `define`): the
 * pipeline records their refusal as TOOL_CALL_DENIED like any other guard.
 *
 * THREE READ_ONLY TOOLS ARE DENIED BY NAME. `delegate` and `workflow` start
 * children whose toolsets are built fresh, and `job_kill` ends a process. Each
 * is READ_ONLY by class because it mutates nothing in the workspace itself; in
 * plan mode they are still the model causing an effect through another seam.
 *
 * LEAVING THE MODE IS AN OPERATOR ACT. There is no tool that exits plan mode.
 * The model records its plan with the signed `plan` tool and the operator runs
 * the next turn without `--plan` (`--session <id>` continues the same session).
 * Plan mode is therefore a PER-TURN fact: it is not in the composition or policy
 * digest, so a planning turn and the executing turn that follows it share a
 * session. Every turn a plan-mode run opens (a queued follow-up included)
 * records a signed NATIVE_PLAN_MODE audit row INSIDE that turn, naming it, at its
 * first step boundary; a run that fails before its first turn records none. The
 * session's native-composition row lists the tools the model was offered.
 *
 * WHAT IT DOES NOT COVER. A tool whose reviewed class is READ_ONLY but which
 * mutates something outside the workspace (an MCP tool with a wrong review) is
 * the review's claim, not this mode's. In-process children are refused up
 * front (`--plan` with `--delegate` or `--goal-rounds` is an error), because a
 * child's toolset is built after this restriction is applied.
 */
import type { ToolRegistry } from "../tools/toolRegistry.js";
import type { ContextPlugin } from "../prompt/context/contextTypes.js";
import type { SessionService } from "../session/sessionService.js";
import { deniedToolNamesForScope } from "./delegationScope.js";
import type { LoopHooks } from "./loopTypes.js";

const PLAN_MODE_CONTEXT = "context:plan-mode";
/** After instructions (100) and mission (125), before the clock (900). */
const PLAN_MODE_CONTEXT_ORDER = 150;

/** READ_ONLY by class, denied by name: they cause effects through another seam. */
const PLAN_MODE_DENIED_TOOLS: readonly string[] = Object.freeze(["delegate", "workflow", "job_kill"]);

export const PLAN_MODE_GUARD = "plan-mode";
export const PLAN_MODE_DENIAL = "plan mode: only READ_ONLY tools run in this turn; record the plan with the plan tool and the operator executes it in a turn started without --plan";

/** Whether plan mode refuses this tool. */
export function planModeDenies(name: string, actionClass: string): boolean {
  return actionClass !== "READ_ONLY" || PLAN_MODE_DENIED_TOOLS.includes(name);
}

/**
 * Narrow a registry to plan mode. Returns the names withheld at this moment; the
 * guard covers anything defined later. Never undone within a run.
 */
export function applyPlanMode(registry: ToolRegistry): readonly string[] {
  const denied = new Set<string>(deniedToolNamesForScope(registry, ["READ_ONLY"]));
  for (const [name] of registry.visible()) if (PLAN_MODE_DENIED_TOOLS.includes(name)) denied.add(name);
  registry.restrict({ deny: denied });
  registry.guard(PLAN_MODE_GUARD, (execution) => planModeDenies(execution.name, execution.actionClass) ? PLAN_MODE_DENIAL : undefined);
  return [...denied].sort();
}

/**
 * The model-facing statement of the mode. Always registered on the native
 * profile, so the plugin list (part of the composition digest) is the same for a
 * planning turn and the executing turn that resumes it; it says nothing unless
 * plan mode is on.
 */
export function createPlanModeContextPlugin(enabled: boolean): ContextPlugin {
  return {
    name: PLAN_MODE_CONTEXT,
    order: PLAN_MODE_CONTEXT_ORDER,
    // A tool mounted after composition (an MCP server) can still be offered; the guard denies it unless it is READ_ONLY.
    collect: () => Promise.resolve(enabled
      ? "This turn runs in plan mode. Only read-only tools run: any other tool call is denied, so this turn's tools do not change "
        + "the workspace. Investigate, then record the plan with the plan tool. There is no tool that leaves plan mode: the operator "
        + "executes the plan in a later turn started without plan mode."
      : "")
  };
}

/** The signed fact that `turn` ran in plan mode. */
function recordPlanMode(session: Pick<SessionService, "recordProjectedEvidence">, options: { readonly withheldTools: readonly string[]; readonly turn: number }): void {
  session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: {
    auditType: "NATIVE_PLAN_MODE", v: 1, turn: options.turn, scope: ["READ_ONLY"], deniedByName: [...PLAN_MODE_DENIED_TOOLS],
    withheldTools: [...options.withheldTools], guard: PLAN_MODE_GUARD
  } });
}

/**
 * The root driver's pre-step in plan mode: at the first step boundary of every turn, the NATIVE_PLAN_MODE row is
 * recorded inside that turn before the step's request. A row that cannot be written stops the step (fail closed).
 */
export function planModePreStep(session: Pick<SessionService, "recordProjectedEvidence">, options: { readonly withheldTools: readonly string[] },
  inner: LoopHooks["preStep"]): LoopHooks["preStep"] {
  return (input, next) => {
    if (input.step === 1) recordPlanMode(session, { withheldTools: options.withheldTools, turn: input.turn });
    return inner(input, next);
  };
}
