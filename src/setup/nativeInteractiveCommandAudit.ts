import { randomUUID } from "node:crypto";
import { appendHumanActionEventAsync } from "../auth/humanLog.js";
import { NATIVE_INTERACTIVE_COMMANDS } from "./nativeInteractiveCommands.js";

const MUTATING_COMMANDS = new Set(["compact", "fork", "load", "unload"]);

/** Operational command history only; never appends to the selected native session. */
export async function runNativeInteractiveCommand<T>(input: {
  workspace: string; command: string; sessionId: string | null;
}, run: () => Promise<T>): Promise<T> {
  const { workspace, command, sessionId } = input;
  if (!NATIVE_INTERACTIVE_COMMANDS.some(item => item.name === command)) {
    throw new Error("Expected a canonical native chat command; no handler was dispatched.");
  }
  if (!MUTATING_COMMANDS.has(command)) return run();
  const invocationId = `nativecmd_${randomUUID()}`;
  const publish = (phase: "started" | "settled" | "refused") => appendHumanActionEventAsync({
    workspace, type: "NATIVE_COMMAND", payload: {
      auditType: "NATIVE_COMMAND", invocationId, command, sessionId, phase,
      // Settled describes the handler boundary, including a cancelled prompt.
      // Model task success and evidence verification require their own results.
      completionBoundary: "handler-return-only"
    }
  });
  await publish("started");
  let result: T;
  try { result = await run(); }
  catch (error) {
    try { await publish("refused"); }
    catch (auditError) {
      throw new AggregateError([error, auditError], "The native command handler and its refusal audit failed; inspect recorded command history before retrying.");
    }
    throw error;
  }
  await publish("settled");
  return result;
}
