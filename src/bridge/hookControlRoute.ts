import { evaluateProviderHookControl, type ProviderHookControlResult } from "./hookControl.js";
import { isPiSessionStart, registerPiSession, type PiSessionRegistrationResult } from "./piSessionRegistry.js";

/** The Bridge's hook control route: a Pi `session_start` registration, otherwise one provider tool request. */
export function handleHookControlRequest(input: Parameters<typeof evaluateProviderHookControl>[0]): ProviderHookControlResult | PiSessionRegistrationResult {
  return input.provider === "pi" && isPiSessionStart(input.rawInput) ? registerPiSession(input) : evaluateProviderHookControl(input);
}
