/**
 * HP-08: plan mode in native chat. `--plan` starts chat in it and `/plan` turns it on or off for the next task. While it
 * is on, each turn's run child gets `--plan`, so the run narrows its own toolset (src/agent/planMode.ts): plan mode is a
 * per-turn fact, outside the composition digest, so one chat session holds planning and executing turns. Only the
 * person at this terminal changes it; no tool the model can call reads or writes it.
 */

import { readNativeSessionEvents } from "../session/readNativeSessionEvents.js";
import { extractEnvelope } from "../session/sessionTypes.js";

/** Why this chat cannot plan, in words, or null. The same rules `agent-loop run --plan` applies. */
export function chatPlanRefusal(input: { readonly tools: string; readonly delegate: boolean; readonly validating: boolean }): string | null {
  if (input.tools !== "workspace") return "Plan mode narrows the workspace tools, and this chat has none. Start chat with --tools workspace to use it.";
  if (input.delegate) return "Plan mode cannot be used with --delegate: a child agent's tools are built after plan mode narrows the agent's own, so the limit would not reach it.";
  if (input.validating) return "Plan mode cannot be used with --validate: the checks run through the shell, which plan mode turns off, so they could only fail.";
  return null;
}

export const PLAN_MODE_ON = "Plan mode is on. From your next task, the agent can only read: anything that would change a file or run a command is refused. "
  + "When it hands you a plan (plan_exit, if your tools policy lists it), that turn ends. Type /plan again to turn plan mode off, then tell it to go ahead.";
const PLAN_MODE_OFF = "Plan mode is off. From your next task, the agent's tools are back, under the same approvals as before.";

/** The `/plan` command: the new state and what to say, or the refusal and the unchanged state. */
export function togglePlanMode(on: boolean, refusal: string | null): { readonly on: boolean; readonly message: string; readonly refused: boolean } {
  if (!on && refusal !== null) return { on, message: refusal, refused: true };
  return { on: !on, message: on ? PLAN_MODE_OFF : PLAN_MODE_ON, refused: false };
}

export const PLAN_MODE_RESTORED = "Plan mode is on: the last turn of this session ran in plan mode, so this chat continues in it. "
  + "The agent can only read. Type /plan to turn it off, or start chat with --no-plan.";

/** Whether the session's last turn ran in plan mode: its NATIVE_PLAN_MODE row names that turn. */
function lastTurnPlanned(cwd: string, sessionId: string): boolean {
  try {
    const rows = readNativeSessionEvents(cwd, sessionId);
    const last = Math.max(0, ...rows.filter((row) => row.event_type === "turn/start").map((row) => extractEnvelope(row.meta_json)?.turn ?? 0));
    return last > 0 && rows.some((row) => row.event_type === "audit" && row.meta_json.includes("NATIVE_PLAN_MODE") && extractEnvelope(row.meta_json)?.turn === last);
  } catch { return false; }
}

/**
 * Plan mode at chat start: --plan turns it on, --no-plan off; otherwise a resumed session whose last turn ran in plan mode
 * stays in it (so a resume line never silently switches to write mode). Never restored where plan mode is refused.
 */
export function initialPlanMode(cwd: string, options: { readonly plan?: boolean; readonly session?: string }, refusal: string | null): { readonly on: boolean; readonly restored: boolean } {
  if (options.plan !== undefined) return { on: options.plan, restored: false };
  const restored = options.session !== undefined && refusal === null && lastTurnPlanned(cwd, options.session);
  return { on: restored, restored };
}
