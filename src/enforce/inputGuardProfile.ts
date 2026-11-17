/**
 * Switching the untrusted-input guard (src/enforce/untrustedInputGuard.ts) on, to log-only or off: a signed revision of
 * the guardrail control state, the same authority as any other guardrail profile change, plus an audit row. A command
 * run by an agent (an agent marker in its environment, or a workspace in agent mode) cannot change it.
 */
import { appendOpsAuditEvent } from "../ops/audit.js";
import { getMode } from "../mode/mode.js";
import { agentMarker } from "../vault/operatorContext.js";
import type { GuardrailControlSource, GuardrailControlState } from "./guardrailControlState.js";

export const INPUT_GUARD_PROFILE = "untrusted-input-guard";
export type InputGuardMode = "off" | "enforce" | "log_only";

/** The one sentence the guard may claim (shield-enforce report, section 4.3); help and docs repeat it. */
export const INPUT_GUARD_CLAIM = "In Claude Code and Gemini CLI sessions that AMC's hooks govern, AMC asks for approval before (or blocks) "
  + "consequential calls made after untrusted input. It does not stop prompt injection, and a call made through a tool AMC cannot see is outside this.";

/** `--mode` as a person types it: enforce (the default), log-only or off. */
export function inputGuardModeArg(raw: string | undefined): InputGuardMode {
  const mode = (raw ?? "enforce").trim().toLowerCase().replace("-", "_");
  if (mode === "enforce" || mode === "log_only" || mode === "off") return mode;
  throw new Error(`Unknown mode "${raw}". Use one of: enforce, log-only, off.`);
}

class InputGuardAuthorityError extends Error {
  readonly code = "AUTHORIZATION" as const;
}

/** Refuse a change from a command an agent runs: the guard limits agents, so an agent session never switches it. */
export function assertInputGuardAuthority(workspace: string, source: GuardrailControlSource, env: NodeJS.ProcessEnv = process.env): void {
  if (source !== "cli") return;
  const marker = agentMarker(env);
  if (marker === null && getMode(workspace) !== "agent") return;
  throw new InputGuardAuthorityError(`An agent session cannot change the untrusted-input guard (${marker === null
    ? "this workspace is in agent mode" : `this shell carries the agent marker ${marker}`}). A person changes it from their own terminal.`);
}

/** The next revision with the guard in `mode`; everything else in the state stays as it was. */
export function inputGuardState(current: GuardrailControlState, mode: InputGuardMode, source: GuardrailControlSource, actor: string): GuardrailControlState {
  const { untrustedInputGuard: _previous, ...rest } = current;
  return { ...rest, ...(mode === "off" ? {} : { untrustedInputGuard: mode }), revision: current.revision + 1,
    updatedAt: new Date().toISOString(), updatedBy: { source, actor: actor.trim() || "local-user" } };
}

/** The audit row for a committed change. A failure to write it is reported, never hidden; the signed revision stands. */
export function auditInputGuardChange(workspace: string, from: InputGuardMode, state: GuardrailControlState): void {
  const to = state.untrustedInputGuard ?? "off";
  try {
    appendOpsAuditEvent({ workspace, auditType: "UNTRUSTED_INPUT_GUARD_CHANGED", severity: to === "off" ? "HIGH" : "MEDIUM",
      payload: { from, to, revision: state.revision, source: state.updatedBy.source, actor: state.updatedBy.actor } });
  } catch (error) {
    process.emitWarning(`The untrusted-input guard change is signed (revision ${state.revision}), but its audit row could not be written: `
      + (error instanceof Error ? error.message : String(error)));
  }
}
