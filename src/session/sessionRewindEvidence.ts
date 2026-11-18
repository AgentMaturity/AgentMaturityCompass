/**
 * HP-06: what a rewind leaves in the signed record, and how it is read back.
 *
 * - The fork that continues a rewound session (`--fork-from <session>`, the composed path, so the child's identity is
 *   the run's own) forks at the rewind's turn when the parent has not moved since the rewind, refuses a parent with a
 *   live writer, and records NATIVE_FORK_AFTER_REWIND as its first row after session/open, citing the rewind.
 * - The run verifier checks both sides: a rewind cites checkpoint rows of that session after its turn, each target
 *   digest equals the cited pre-image's signed digest, and each restored file was measured at that digest; a fork's
 *   citation names an existing finished rewind of its parent at its own fork turn.
 * - `amc session show` says it in words.
 */
import { openLedger } from "../ledger/ledger.js";
import { FILE_CHECKPOINT_AUDIT } from "../tools/builtin/fileCheckpoint.js";
import type { EvidenceEvent } from "../types.js";
import { escapeTerminalControls } from "../utils/terminalEscape.js";
import { readEventPayload } from "./eventPayload.js";
import { REWIND_FINISHED_AUDIT, REWIND_INTENDED_AUDIT } from "./sessionRewind.js";
import { assertSessionOwnerAvailable, readSessionWriter } from "./sessionOwnership.js";
import { extractEnvelope } from "./sessionTypes.js";
import type { SessionService } from "./sessionService.js";
import { extractSpillRef } from "./spill/spillTypes.js";

export const FORK_AFTER_REWIND_AUDIT = "NATIVE_FORK_AFTER_REWIND";

interface OpsRow { readonly row: EvidenceEvent; readonly meta: Record<string, unknown>; readonly payload: Record<string, unknown> }
interface RewindFileEntry { readonly checkpointEventId: string | null; readonly commitmentEventId: string | null; readonly fromSha256: string | null; readonly toSha256: string | null }
interface Outcome { readonly status: string; readonly restoredSha256: string | null }

const metaOf = (row: EvidenceEvent): Record<string, unknown> => JSON.parse(row.meta_json) as Record<string, unknown>;

/** The signed operations-audit rewind rows of this workspace (payloads are inline JSON). */
function rewindRows(workspace: string): OpsRow[] {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return ledger.getAllEvents().filter((row) => row.event_type === "audit").flatMap((row) => {
      const meta = metaOf(row);
      if (meta.source !== "ops" || (meta.auditType !== REWIND_INTENDED_AUDIT && meta.auditType !== REWIND_FINISHED_AUDIT)) return [];
      const read = readEventPayload(workspace, row);
      if (read.status !== "ok") return [];
      return [{ row, meta, payload: JSON.parse(read.bytes.toString("utf8")) as Record<string, unknown> }];
    });
  } finally { ledger.close(); }
}

export interface ForkRewind { readonly toTurn: number; readonly finished: EvidenceEvent; readonly parentSessionId: string }

/**
 * The finished rewind a fork of `parentSessionId` continues from: the newest one recorded against the parent's current
 * head. Null when there is none (the fork then takes the latest sealed turn, as before). Refuses a live parent writer.
 */
export function rewindForFork(workspace: string, parentSessionId: string, parentRows: readonly EvidenceEvent[]): ForkRewind | null {
  const head = parentRows.at(-1);
  if (head === undefined) return null;
  const finished = rewindRows(workspace).filter((entry) => entry.meta.auditType === REWIND_FINISHED_AUDIT
    && entry.meta.subjectId === parentSessionId && entry.payload.parentHeadEventHash === head.event_hash).at(-1);
  if (finished === undefined) return null;
  if (readSessionWriter(head)?.state === "active") assertSessionOwnerAvailable(head);
  return { toTurn: Number(finished.payload.toTurn), finished: finished.row, parentSessionId };
}

/** The child's first row after session/open: which rewind it continues from. No paths. */
export function recordForkAfterRewind(service: Pick<SessionService, "recordProjectedEvidence">, rewind: ForkRewind): void {
  const meta = { auditType: FORK_AFTER_REWIND_AUDIT, v: 1, parentSessionId: rewind.parentSessionId, toTurn: rewind.toTurn,
    rewindEventId: rewind.finished.id, rewindEventHash: rewind.finished.event_hash };
  service.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(meta), meta });
}

function checkFiles(sessionRows: readonly EvidenceEvent[], toTurn: number, files: readonly RewindFileEntry[], outcomes: readonly Outcome[]): string[] {
  const errors: string[] = [];
  if (files.length !== outcomes.length) return ["a rewind's finished record does not list one outcome per planned file"];
  files.forEach((file, index) => {
    const outcome = outcomes[index]!;
    if (file.toSha256 !== null) {
      const checkpoint = sessionRows.find((row) => row.id === file.checkpointEventId && row.event_type === "audit");
      const meta = checkpoint === undefined ? null : metaOf(checkpoint);
      if (checkpoint === undefined || meta?.auditType !== FILE_CHECKPOINT_AUDIT || meta.status !== "stored" || (extractEnvelope(checkpoint.meta_json)?.turn ?? 0) <= toTurn) {
        errors.push(`a rewind cites checkpoint row ${String(file.checkpointEventId)}, which is not a kept pre-image of this session after turn ${toTurn}`);
        return;
      }
      const commitment = sessionRows.find((row) => row.id === file.commitmentEventId && row.event_type === "tool/spill-commitment");
      const ref = commitment === undefined ? null : extractSpillRef(commitment.meta_json);
      if (commitment === undefined || metaOf(commitment).subject !== "file/checkpoint" || ref?.locator !== meta.locator || ref?.contentSha256 !== file.toSha256) {
        errors.push(`a rewind's target digest for checkpoint ${checkpoint.id} does not match the cited pre-image`);
        return;
      }
    }
    if (outcome.status === "restored" && outcome.restoredSha256 !== file.toSha256) errors.push(`a restored file's measured digest does not match its pre-image (file ${index + 1})`);
    if (outcome.status === "removed" && (file.toSha256 !== null || outcome.restoredSha256 !== null)) errors.push(`a rewind removed a file that existed before the session changed it (file ${index + 1})`);
  });
  return errors;
}

/** Errors in the rewind rows that concern this session, as the run verifier reports them. Empty when there are none. */
export function rewindVerificationErrors(workspace: string, sessionId: string, sessionRows: readonly EvidenceEvent[]): string[] {
  const forkRows = sessionRows.filter((row) => row.event_type === "audit" && metaOf(row).auditType === FORK_AFTER_REWIND_AUDIT);
  const ops = rewindRows(workspace);
  const errors: string[] = [];
  for (const finished of ops.filter((entry) => entry.meta.auditType === REWIND_FINISHED_AUDIT && entry.meta.subjectId === sessionId)) {
    const intended = ops.find((entry) => entry.row.id === finished.payload.intendedEventId && entry.row.event_hash === finished.payload.intendedEventHash
      && entry.meta.auditType === REWIND_INTENDED_AUDIT && entry.meta.subjectId === sessionId);
    if (intended === undefined) { errors.push(`rewind ${finished.row.id} cites no recorded intention`); continue; }
    errors.push(...checkFiles(sessionRows, Number(intended.payload.toTurn), intended.payload.files as RewindFileEntry[], finished.payload.outcomes as Outcome[]));
  }
  for (const row of forkRows) {
    const meta = metaOf(row);
    const open = sessionRows[0] === undefined ? null : metaOf(sessionRows[0]) as { parentSession?: { sessionId?: unknown; forkTurn?: unknown } };
    const cited = ops.find((entry) => entry.row.id === meta.rewindEventId && entry.row.event_hash === meta.rewindEventHash);
    if (sessionRows.indexOf(row) !== 1) errors.push("a fork's rewind citation is not its first row after session/open");
    if (cited === undefined || cited.meta.auditType !== REWIND_FINISHED_AUDIT || cited.meta.subjectId !== meta.parentSessionId
      || Number(cited.payload.toTurn) !== meta.toTurn || open?.parentSession?.sessionId !== meta.parentSessionId || open?.parentSession?.forkTurn !== meta.toTurn) {
      errors.push(`fork row ${row.id} cites a rewind that does not exist or does not match this session's parent and fork turn`);
    }
  }
  return errors;
}

/** Plain lines for `amc session show`: rewinds of this session, and the rewind a fork continues from. */
export function describeSessionRewinds(workspace: string, sessionId: string, sessionRows: readonly EvidenceEvent[]): string[] {
  const ops = rewindRows(workspace);
  const lines: string[] = [];
  for (const finished of ops.filter((entry) => entry.meta.auditType === REWIND_FINISHED_AUDIT && entry.meta.subjectId === sessionId)) {
    const intended = ops.find((entry) => entry.row.id === finished.payload.intendedEventId);
    const by = (intended?.payload.by ?? {}) as { user?: unknown; host?: unknown };
    const outcomes = (finished.payload.outcomes ?? []) as Outcome[];
    const count = (status: string) => outcomes.filter((outcome) => outcome.status === status).length;
    lines.push(`Files rewound to turn ${String(finished.payload.toTurn)} on ${new Date(finished.row.ts).toISOString()} by ${String(by.user)} on ${String(by.host)} `
      + `(at a terminal, no sign-in): ${count("restored")} restored, ${count("removed")} created file(s) removed, ${count("failed")} failed. `
      + `This session's rows are unchanged; continue from that turn with amc agent-loop chat --fork-from ${sessionId}.`);
  }
  for (const row of sessionRows.filter((entry) => entry.event_type === "audit" && metaOf(entry).auditType === FORK_AFTER_REWIND_AUDIT)) {
    const meta = metaOf(row);
    lines.push(`This session continues session ${String(meta.parentSessionId)} from turn ${String(meta.toTurn)}, after that session's files were rewound (record ${String(meta.rewindEventId)}).`);
  }
  return lines.map(escapeTerminalControls);
}
