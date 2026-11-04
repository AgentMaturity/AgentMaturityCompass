import { COMPOSITION_FAILED } from "../agent/nativeAgentComposition.js";
import type { SessionService } from "../session/sessionService.js";

export interface ComposedSessionEnd {
  /** The driver drained and did not enter `failed`. */
  readonly stopped: boolean;
  readonly resourcesConfirmed: boolean;
  readonly keepOpen: boolean;
  readonly composed: boolean;
  readonly hostShutdown: boolean;
  readonly schedulePass: boolean;
}

/** Seal, hand over or drop a composed turn's session writer once its driver and resources have settled. */
export function sealComposedSession(session: SessionService, end: ComposedSessionEnd): void {
  try {
    if (!end.stopped) session.disposeWithoutClosing();
    else if (end.keepOpen) {
      // Unknown cleanup must refuse ownership handover.
      if (!end.resourcesConfirmed) throw new Error("Cannot hand over a session whose resource cleanup is unknown.");
      // Hand-over point: the turn is sealed, the session is not. A later
      // process resumes it through sessionResume.ts, which re-verifies first.
      session.releaseWithoutClosing();
    } else {
      session.close({ reason: !end.composed ? COMPOSITION_FAILED : !end.resourcesConfirmed ? "resource_outcome_unknown"
        : end.hostShutdown ? "shutdown" : "completed" });
    }
  } catch (error) {
    // A driver that entered `failed` left an open turn only recovery may
    // close, and the spine refuses a close over it. Swallowed HERE and only
    // here: the status the caller returns already reports it, and throwing from
    // its finally would replace the real failure with this one.
    try { session.disposeWithoutClosing(); } catch { /* Preserve unsealed evidence after a refused close. */ }
    // A schedule owner cannot report released/closed on a refused seal.
    if (end.schedulePass) throw error;
  }
}
