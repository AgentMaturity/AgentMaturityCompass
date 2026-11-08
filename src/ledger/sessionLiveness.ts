/**
 * Liveness of legacy (non-agent) ledger sessions (LIVE-INTEGRITY-01, D-INT-1).
 *
 * A legacy session is sealed when its writer finishes: the gateway when it closes, a bridge request when it returns,
 * a tool run when it settles. Until then its end and both seal columns are null, and those columns are not signed, so
 * a workspace writer can NULL them on a closed session. Nothing in the row proves a session is live. The only evidence
 * a writer without the monitor key cannot forge is a signed event, so the rule is: an unended, unsealed legacy session
 * is live iff its last signed event (its recorded start when it has none) is no older than the window and not in the
 * future. Any other unended or unsealed legacy session is a missing seal. The rule does not depend on the runtime: an
 * in-flight bridge request or a running tool is live while it writes. The gateway heartbeats (gatewaySession.ts) so its
 * idle session stays live.
 */

/** How long an unsealed legacy session may go without a signed event before it reads as a missing seal. */
export const GATEWAY_SESSION_STALE_AFTER_MS = 15 * 60_000;
/** The gateway appends a heartbeat when its session's last signed event is at least this old. */
export const GATEWAY_HEARTBEAT_AFTER_MS = 5 * 60_000;
/** How often the gateway checks whether it needs a heartbeat, and sweeps for interrupted sessions. */
export const GATEWAY_HEARTBEAT_CHECK_MS = 60_000;
/** A gateway session silent this long cannot belong to a live gateway, whose tail never ages past ~6 min. */
export const GATEWAY_RECOVER_AFTER_MS = GATEWAY_HEARTBEAT_AFTER_MS + 3 * GATEWAY_HEARTBEAT_CHECK_MS;

/** The `meta.stage` of the gateway's idle heartbeat row (gatewaySession.ts). */
export const HEARTBEAT_STAGE = "heartbeat";
/** The `meta.stage` of the signed row that seals an interrupted session (interruptedSessions.ts). */
export const INTERRUPTED_SEALED_STAGE = "interrupted-sealed";

/** An open legacy session as a verdict names it: observed facts only. */
export interface LiveLegacySession { readonly sessionId: string; readonly runtime: string; readonly lastSignedTs: number }

/** Pure. True iff the session is unended with both seal columns null and `0 <= now - (lastSignedTs ?? started_ts) <= staleAfterMs`. */
export function isLiveLegacySession(
  session: { ended_ts: number | null; session_final_event_hash: string | null; session_seal_sig: string | null; started_ts: number },
  lastSignedTs: number | null,
  now: number,
  staleAfterMs: number
): boolean {
  if (session.ended_ts !== null || session.session_final_event_hash !== null || session.session_seal_sig !== null) return false;
  const age = now - (lastSignedTs ?? session.started_ts);
  return age >= 0 && age <= staleAfterMs;
}

/** The one wording every surface uses for open sessions (`amc verify`, `verify all`, the Vault surface, bundles, restore). */
export function describeOpenSessions(sessions: readonly LiveLegacySession[], now: number): string {
  const listed = sessions.map((session) => {
    const minutes = Math.max(0, Math.floor((now - session.lastSignedTs) / 60_000));
    return `${session.sessionId} (${session.runtime}; last signed activity ${minutes} min ago)`;
  });
  return `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"} open: ${listed.join(", ")}. `
    + "An open session is the running writer's own; nothing is claimed about how it ends.";
}

/** True for the gateway's own liveness rows (a heartbeat, or the marker that sealed an interrupted session): never scored. */
export function isLivenessRow(event: { event_type: string; meta_json: string }): boolean {
  if (event.event_type !== "gateway") return false;
  try {
    const stage = (JSON.parse(event.meta_json) as { stage?: unknown }).stage;
    return stage === HEARTBEAT_STAGE || stage === INTERRUPTED_SEALED_STAGE;
  } catch {
    return false;
  }
}
