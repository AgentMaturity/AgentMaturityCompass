import type { SessionEventHistory } from "./sessionEventHistory.js";
import type { EvidenceEvent } from "../types.js";
import { readTurnEndMeta } from "./turnLifecycleMeta.js";

export type ContinuationControlRefusal = "CONFIGURATION_MISMATCH" | "UNSUPPORTED_FORMAT" | "STOP_CONTROL" | "DELEGATED_SESSION" | "UNRESOLVED_CHILD";
export class SessionContinuationControlRefused extends Error {
  constructor(readonly code: ContinuationControlRefusal, message: string) {
    super(message); this.name = "SessionContinuationControlRefused";
  }
}
function refuse(code: ContinuationControlRefusal, message: string): never {
  throw new SessionContinuationControlRefused(code, message);
}

/** Called only on authenticated original rows, before recovery or a writer claim. */
export function assertSessionContinuationConfiguration(rows: readonly Readonly<EvidenceEvent>[], expected: {
  readonly compositionDigest?: string; readonly policyDigest?: string;
  /** The digest in its form before UX-02 (skill contexts counted), for the skills the session's first turn loaded. */
  readonly legacyCompositionDigest?: (openingSkills: readonly string[]) => string;
}): void {
  const opening = rows[0]?.event_type === "session/open" ? JSON.parse(rows[0].meta_json) as Record<string, unknown> : null;
  if (!opening || typeof opening.compositionDigest !== "string" || typeof opening.policyDigest !== "string") {
    refuse("UNSUPPORTED_FORMAT", "The signed session does not contain a supported native configuration.");
  }
  // A session a skill turn opened before UX-02 signed a digest that counts that skill: the same settings, recomputed in
  // that form with the skills its signed first-turn context record names, must match it exactly.
  const skills = expected.legacyCompositionDigest === undefined ? [] : openingSkillContexts(rows);
  const legacy = skills.length > 0 && expected.legacyCompositionDigest!(skills) === opening.compositionDigest;
  if ((expected.compositionDigest !== undefined && opening.compositionDigest !== expected.compositionDigest && !legacy)
    || (expected.policyDigest !== undefined && opening.policyDigest !== expected.policyDigest)) {
    refuse("CONFIGURATION_MISMATCH", "Resume requires the original execution settings and signed policy. Restore them or deliberately start a separate task; this session cannot silently adopt changed controls.");
  }
}

/** The `skill:` context ids the session's first signed context record names (its opening turn), in order. */
function openingSkillContexts(rows: readonly Readonly<EvidenceEvent>[]): string[] {
  for (const row of rows) {
    const meta = JSON.parse(row.meta_json) as { phase?: unknown; sources?: unknown };
    if (meta.phase !== "context" || !Array.isArray(meta.sources)) continue;
    return meta.sources.flatMap((source: { kind?: unknown; id?: unknown }) =>
      source?.kind === "context" && typeof source.id === "string" && source.id.startsWith("skill:") ? [source.id] : []);
  }
  return [];
}

/**
 * Native approval factories can be rebound under the original configuration.
 * An arbitrary callback, delegated grant or parent AbortSignal cannot be rebuilt
 * from an agent name. These refusals are backend-independent, not permissions.
 * The caller must authenticate the FULL store, including parent/child evidence.
 */
export function assertSessionContinuationControls(history: Pick<SessionEventHistory, "events" | "sessions">, sessionId: string): void {
  for (const row of history.events) {
    const value = JSON.parse(row.meta_json) as Record<string, unknown>;
    if (row.session_id === sessionId) {
      const ending = row.event_type === "turn/end" ? readTurnEndMeta(row.meta_json) : null;
      if (row.event_type === "turn/end" && !ending) refuse("UNSUPPORTED_FORMAT", "The recorded turn ending cannot be safely reconstructed.");
      const cause = row.event_type === "loop/cancel" ? value.cause as { kind?: unknown } | null : ending?.cancelCause;
      if (cause?.kind === "parent" || cause?.kind === "hook") {
        refuse("STOP_CONTROL", "A parent or policy control stopped this session. Resume cannot discard that control; continue through its original controlling workflow.");
      }
      if (typeof value.childSessionId === "string") {
        const child = history.sessions.find(record => record.session_id === value.childSessionId);
        if (!child || child.ended_ts === null) {
          refuse("UNRESOLVED_CHILD", "A child session has not reached an authenticated closed state. Resolve it through the parent workflow before resuming.");
        }
      }
    } else if (value.childSessionId === sessionId) {
      refuse("DELEGATED_SESSION", "A delegated session must retain its parent controller. Standalone resume cannot replace that controller.");
    }
  }
}
