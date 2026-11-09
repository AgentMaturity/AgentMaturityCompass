import type { EvidenceEvent } from "../types.js";
import { ACP_MAX_TURN_UPDATE_BYTES, validateAcpCommittedTail } from "./acpCommittedUpdates.js";
import { projectSessionUpdates, type AcpProjectedUpdate } from "./acpProjection.js";
import { ACP_MAX_UPDATE_PARAMS_BYTES } from "./acpRuntimeContracts.js";

/**
 * The one way a live consumer turns a session's newly committed rows into updates (SH-UI-01).
 *
 * ACP's `session/update` stream and the CLI's `--output-format stream-json` both read the same session while its
 * driver writes it, so both must authenticate each new row (signature, hash chain, sequence envelope) before showing
 * it, refuse unsigned rows instead of quietly showing less, and bound what one frame and one turn may carry. This
 * module holds that sequence once; a consumer that skipped a step would be a second, weaker truth.
 */

/** Where a consumer's authenticated view ends: rows `[0, projected)` were seen, `projectedHash` is the last row's hash. */
export interface CommittedCursor {
  readonly projected: number;
  readonly projectedHash: string | null;
}

export const COMMITTED_CURSOR_START: CommittedCursor = Object.freeze({ projected: 0, projectedHash: null });

export interface CommittedTail {
  readonly cursor: CommittedCursor;
  /** Newly committed updates in row order, each with its signed row identity. Empty when `emit` is false. */
  readonly updates: readonly AcpProjectedUpdate[];
}

/**
 * Authenticate the rows after `cursor` and project them. Throws on a changed prefix, a broken chain, a bad signature, an
 * unsigned row or an unreadable payload; the caller must then retire its cursor as unusable rather than retry under a
 * later prompt's identity. With `emit: false` the tail is authenticated and retired without rendering (a failed prompt's
 * rows are never shown as output).
 */
export function projectCommittedTail(input: {
  readonly workspace: string;
  readonly sessionId: string;
  readonly events: readonly EvidenceEvent[];
  readonly cursor: CommittedCursor;
  readonly emit: boolean;
  readonly includeCurrentPlans?: boolean;
  readonly includeThoughts?: boolean;
}): CommittedTail {
  const head = validateAcpCommittedTail(input.workspace, input.sessionId, input.events, input.cursor.projected, input.cursor.projectedHash);
  const cursor = Object.freeze({ projected: input.events.length, projectedHash: head });
  if (!input.emit) return { cursor, updates: [] };
  const projected = projectSessionUpdates(input.workspace, input.events, input.cursor.projected,
    { includeEventIdentity: true, includeCurrentPlans: input.includeCurrentPlans === true, includeThoughts: input.includeThoughts === true });
  if (projected.unsigned > 0 || !projected.entries) throw new Error("ACP refused an unsigned committed update.");
  return { cursor, updates: projected.entries };
}

/** Per-turn output accounting: one frame over `ACP_MAX_UPDATE_PARAMS_BYTES` or a turn over `ACP_MAX_TURN_UPDATE_BYTES` throws. */
export interface UpdateBudget { bytes: number }

export function chargeUpdateBudget(budget: UpdateBudget, params: unknown): number {
  const bytes = Buffer.byteLength(JSON.stringify(params), "utf8");
  if (bytes > ACP_MAX_UPDATE_PARAMS_BYTES || budget.bytes + bytes > ACP_MAX_TURN_UPDATE_BYTES) throw new Error("ACP committed output exceeds its frame or turn bound.");
  budget.bytes += bytes;
  return bytes;
}
