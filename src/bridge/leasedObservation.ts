/**
 * The one gate every leased observation write passes that is not already a recordHookAudit (session hooks of Claude Code
 * and Codex, OTLP export requests): the workspace's hook audit latch first, then the shared intake caps of tool
 * observations (hookIntake.ts OBSERVATION_LIMITS, one count per record), then the write. Over a cap the request is
 * refused (429) and nothing of it is stored but the signed intake summary; while latched it is refused (503). A writer
 * failure for a session with a verified registration trips the latch, exactly as recordHookAudit's does; input never does.
 */
import { admitObservation, type ObservedProvider } from "./claudeCodeObservations.js";
import { guardHookAudit, writerFault } from "./hookAuditLatch.js";
import { HookControlError } from "./hookProviders.js";

export interface LeasedObservationScope {
  workspace: string;
  agentId: string;
  leaseId: string | undefined;
  /** The provider's own session id ("unknown" when it names none: then it shares the unregistered cap). */
  sessionId: string;
  provider: ObservedProvider;
  /** Records in this request; each one counts against the caps. */
  count?: number;
  now?: number;
}

export function recordLeasedObservation<T>(scope: LeasedObservationScope, what: string, write: () => T): T {
  const now = scope.now ?? Date.now();
  return guardHookAudit(scope.workspace, (message) => new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, message), () => {
    const { registered } = admitObservation({ ...scope, now });
    try {
      return write();
    } catch (error) {
      throw error instanceof HookControlError ? error : writerFault(error, registered, what);
    }
  });
}
