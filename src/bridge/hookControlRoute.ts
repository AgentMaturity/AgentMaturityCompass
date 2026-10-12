import { evaluateProviderHookControl, type ProviderHookControlResult } from "./hookControl.js";
import { isPiSessionStart, registerPiSession, type PiSessionRegistrationResult } from "./piSessionRegistry.js";
import { registerClaudeCodeSession, type ClaudeCodeRegistrationResult } from "./claudeCodeSessionRegistry.js";
import { recordClaudeCodePostExecution, recordClaudeCodeStop, type HookObservationResult } from "./claudeCodeObservations.js";
import { admitClaudeCodePrompt } from "./hookAdmission.js";
import { assertUnambiguousJson } from "./hookProviders.js";

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
 * The Bridge's hook control route: a Pi `session_start` registration; Claude Code's SessionStart registration,
 * UserPromptSubmit admission, Stop and post-tool records; otherwise one provider tool request.
 */
export function handleHookControlRequest(input: Input):
  ProviderHookControlResult | PiSessionRegistrationResult | ClaudeCodeRegistrationResult | HookObservationResult {
  if (input.provider === "pi" && isPiSessionStart(input.rawInput)) return registerPiSession(input);
  // A repeated key could be read one way by AMC and another by whoever sent it: refused for every Claude Code body.
  if (input.provider === "claude-code") assertUnambiguousJson(input.rawInput);
  const event = eventName(input.rawInput);
  const claudeSession = input.provider === "claude-code" && typeof event === "string" && Object.hasOwn(CLAUDE_SESSION_EVENTS, event)
    ? CLAUDE_SESSION_EVENTS[event] : undefined;
  return claudeSession ? claudeSession(input) : evaluateProviderHookControl(input);
}
