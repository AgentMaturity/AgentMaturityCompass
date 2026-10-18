import { evaluateProviderHookControl, MAX_CONTROL_HOOK_BODY_BYTES, type ProviderHookControlResult } from "./hookControl.js";
import { isPiSessionStart, registerPiSession, type PiSessionRegistrationResult } from "./piSessionRegistry.js";
import { recordPiToolResult } from "./piObservations.js";
import { registerClaudeCodeSession, type ClaudeCodeRegistrationResult } from "./claudeCodeSessionRegistry.js";
import { recordClaudeCodePostExecution, recordClaudeCodeStop, type HookObservationResult } from "./claudeCodeObservations.js";
import { admitClaudeCodePrompt } from "./hookAdmission.js";
import { guardHookAudit } from "./hookAuditLatch.js";
import { assertUnambiguousJson, HookControlError } from "./hookProviders.js";

type Input = Parameters<typeof evaluateProviderHookControl>[0];
const CLAUDE_SESSION_EVENTS: Record<string, (input: Input) => ClaudeCodeRegistrationResult | HookObservationResult> = {
  SessionStart: registerClaudeCodeSession,
  UserPromptSubmit: admitClaudeCodePrompt,
  Stop: recordClaudeCodeStop,
  PostToolUse: recordClaudeCodePostExecution,
  PostToolUseFailure: recordClaudeCodePostExecution,
};

function eventName(rawInput: string): unknown {
  try {
    return (JSON.parse(rawInput) as { hook_event_name?: unknown }).hook_event_name;
  } catch {
    return undefined;
  }
}

/**
 * The Bridge's hook control route: a Pi `session_start` registration and `tool_result` outcome; Claude Code's SessionStart registration,
 * UserPromptSubmit admission, Stop and post-tool records; otherwise one provider tool request. Every request passes the
 * workspace's hook audit latch (hookAuditLatch.ts): refused while latched, and one that fails with a 5xx latches it.
 */
export function handleHookControlRequest(input: Input):
  ProviderHookControlResult | PiSessionRegistrationResult | ClaudeCodeRegistrationResult | HookObservationResult {
  return guardHookAudit(input.workspace, (message) => new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, message), () => route(input));
}

function route(input: Input): ProviderHookControlResult | PiSessionRegistrationResult | ClaudeCodeRegistrationResult | HookObservationResult {
  // The size cap comes before any parse.
  if (Buffer.byteLength(input.rawInput, "utf8") > MAX_CONTROL_HOOK_BODY_BYTES) throw new HookControlError("HOOK_CONTROL_INPUT_TOO_LARGE", 413, "hook input is too large");
  if (input.provider === "pi" && isPiSessionStart(input.rawInput)) return registerPiSession(input);
  if (input.provider === "pi" && eventName(input.rawInput) === "tool_result") return recordPiToolResult(input);
  // A repeated key could be read one way by AMC and another by whoever sent it: refused for every Claude Code body.
  if (input.provider === "claude-code") assertUnambiguousJson(input.rawInput);
  const event = eventName(input.rawInput);
  const claudeSession = input.provider === "claude-code" && typeof event === "string" && Object.hasOwn(CLAUDE_SESSION_EVENTS, event)
    ? CLAUDE_SESSION_EVENTS[event] : undefined;
  return claudeSession ? claudeSession(input) : evaluateProviderHookControl(input);
}
