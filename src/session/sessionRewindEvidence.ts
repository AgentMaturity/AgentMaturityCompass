/**
 * HP-06: what a rewind leaves in the signed record, and how it is read back.
 *
 * - The fork that continues a rewound session (`--fork-from <session>`, the composed path, so the child's identity is
 *   the run's own) forks at the rewind's turn when the parent has not moved since the rewind, refuses a parent with a
 *   live writer, and records NATIVE_FORK_AFTER_REWIND as its first row after session/open, citing the rewind.
 * - The run verifier checks both sides: a rewind (finished or not) cites checkpoint rows of that session after its turn
 *   and their signed commitments, and each restored file was measured at the commitment's salted digest; a fork's
 *   citation names an existing finished rewind of its parent at its own fork turn.
 * - `amc session show` says it in words, including a rewind that was started and did not finish.
 */
import { openLedger } from "../ledger/ledger.js";
import { FILE_CHECKPOINT_AUDIT } from "../tools/builtin/fileCheckpoint.js";
import { PLAN_READY_AUDIT } from "../tools/builtin/planExitTool.js";
import type { EvidenceEvent } from "../types.js";
import { escapeTerminalControls } from "../utils/terminalEscape.js";
import { readEventPayload } from "./eventPayload.js";
import { metaOf, REWIND_FINISHED_AUDIT, REWIND_INTENDED_AUDIT } from "./sessionRewind.js";
import { assertSessionOwnerAvailable, readSessionWriter } from "./sessionOwnership.js";
import { extractEnvelope } from "./sessionTypes.js";
import type { SessionService } from "./sessionService.js";
import { extractSpillRef } from "./spill/spillTypes.js";

export const FORK_AFTER_REWIND_AUDIT = "NATIVE_FORK_AFTER_REWIND";

interface OpsRow { readonly row: EvidenceEvent; readonly meta: Record<string, unknown>; readonly payload: Record<string, unknown> | null }
interface RewindFileEntry { readonly checkpointEventId: string | null; readonly commitmentEventId: string | null; readonly action: string }
interface Outcome { readonly status: string; readonly restoredDigest: string | null }

/**
 * The signed operations-audit rewind rows of this workspace, told apart by their plain meta. A rewind row whose payload
 * cannot be read keeps `payload: null`, so readers report it instead of passing over it.
 */
function rewindRows(workspace: string): OpsRow[] {
  let ledger: ReturnType<typeof openLedger>;
  try { ledger = openLedger(workspace, { readonly: true }); } catch { return []; } // no operations ledger: no rewind was ever recorded
  try {
    return ledger.getAllEvents().filter((row) => row.event_type === "audit").flatMap((row) => {
      const meta = metaOf(row);
      if (meta.source !== "ops" || (meta.auditType !== REWIND_INTENDED_AUDIT && meta.auditType !== REWIND_FINISHED_AUDIT)) return [];
      const read = readEventPayload(workspace, row);
      let payload: Record<string, unknown> | null = null;
      try { if (read.status === "ok") payload = JSON.parse(read.bytes.toString("utf8")) as Record<string, unknown>; } catch { payload = null; }
      return [{ row, meta, payload }];
    });
  } finally { ledger.close(); }
}
const UNREADABLE = "a rewind record of this session could not be read, so it was not checked";

export interface ForkRewind { readonly toTurn: number; readonly finished: EvidenceEvent; readonly parentSessionId: string; readonly notPutBack: number }

/**
 * The finished rewind a fork of `parentSessionId` continues from: the newest one recorded against the parent's current
 * head. Null when there is none (the fork then takes the latest sealed turn, as before). Refuses a live parent writer.
 */
export function rewindForFork(workspace: string, parentSessionId: string, parentRows: readonly EvidenceEvent[]): ForkRewind | null {
  const head = parentRows.at(-1);
  if (head === undefined) return null;
  const mine = rewindRows(workspace).filter((entry) => entry.meta.auditType === REWIND_FINISHED_AUDIT && entry.meta.subjectId === parentSessionId);
  if (mine.some((entry) => entry.payload === null)) throw new Error(`${UNREADABLE}; the fork was not created. Unlock the vault (amc vault unlock) and try again.`);
  const finished = mine.filter((entry) => entry.payload!.parentHeadEventHash === head.event_hash).at(-1);
  if (finished === undefined) return null;
  if (readSessionWriter(head)?.state === "active") assertSessionOwnerAvailable(head);
  const failed = (Array.isArray(finished.payload!.outcomes) ? finished.payload!.outcomes as Outcome[] : []).filter((outcome) => outcome.status === "failed").length;
  return { toTurn: Number(finished.payload!.toTurn), finished: finished.row, parentSessionId, notPutBack: Number(finished.payload!.conflicts ?? 0) + failed };
}

/** The child's first row after session/open: which rewind it continues from, and how many files it did not put back. No paths. */
export function recordForkAfterRewind(service: Pick<SessionService, "recordProjectedEvidence">, rewind: ForkRewind): void {
  const meta = { auditType: FORK_AFTER_REWIND_AUDIT, v: 1, parentSessionId: rewind.parentSessionId, toTurn: rewind.toTurn,
    rewindEventId: rewind.finished.id, rewindEventHash: rewind.finished.event_hash, notPutBack: rewind.notPutBack };
  service.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(meta), meta });
}

/** Each cited checkpoint, its commitment and (when given) each measured outcome. Outcomes are absent for an unfinished rewind. */
function checkFiles(sessionRows: readonly EvidenceEvent[], toTurn: number, files: readonly RewindFileEntry[], outcomes: readonly Outcome[] | null): string[] {
  const errors: string[] = [];
  if (outcomes !== null && files.length !== outcomes.length) return ["a rewind's finished record does not list one outcome per planned file"];
  files.forEach((file, index) => {
    const outcome = outcomes?.[index] ?? null;
    const checkpoint = sessionRows.find((row) => row.id === file.checkpointEventId && row.event_type === "audit");
    const meta = checkpoint === undefined ? null : metaOf(checkpoint);
    const turnOk = checkpoint !== undefined && (extractEnvelope(checkpoint.meta_json)?.turn ?? 0) > toTurn;
    if (file.action === "remove" || (file.action === "already" && file.commitmentEventId === null)) {
      // A removal stands on the signed record that the file did not exist before the session created it.
      if (!turnOk || meta?.auditType !== FILE_CHECKPOINT_AUDIT || meta.status !== "absent") {
        errors.push(`a rewind removed a file citing ${String(file.checkpointEventId)}, which does not record that file as created after turn ${toTurn}`);
        return;
      }
      if (outcome !== null && (outcome.status === "removed" || outcome.status === "already") && outcome.restoredDigest !== null) errors.push(`a removed file is still there (file ${index + 1})`);
      return;
    }
    if (!turnOk || meta?.auditType !== FILE_CHECKPOINT_AUDIT || meta.status !== "stored") {
      errors.push(`a rewind cites checkpoint row ${String(file.checkpointEventId)}, which is not a kept pre-image of this session after turn ${toTurn}`);
      return;
    }
    const commitment = sessionRows.find((row) => row.id === file.commitmentEventId && row.event_type === "tool/spill-commitment");
    const ref = commitment === undefined ? null : extractSpillRef(commitment.meta_json);
    if (commitment === undefined || metaOf(commitment).subject !== "file/checkpoint" || ref?.locator !== meta.locator) {
      errors.push(`a rewind's kept copy for checkpoint ${checkpoint!.id} is not the one that checkpoint names`);
      return;
    }
    if (outcome !== null && ["restored", "recreated", "already"].includes(outcome.status) && outcome.restoredDigest !== ref?.contentSha256) {
      errors.push(`a restored file's measured content does not match its kept copy (file ${index + 1})`);
    }
  });
  return errors;
}

/** The intended rows of this session with no finished row citing them: a rewind that was started and did not finish. */
function unfinished(ops: readonly OpsRow[], sessionId: string): OpsRow[] {
  const cited = new Set(ops.filter((entry) => entry.meta.auditType === REWIND_FINISHED_AUDIT).map((entry) => entry.payload?.intendedEventId));
  return ops.filter((entry) => entry.meta.auditType === REWIND_INTENDED_AUDIT && entry.meta.subjectId === sessionId && !cited.has(entry.row.id));
}

/** The newest started-but-unfinished rewind of this session, for a re-run to cite; null when there is none. */
export function unfinishedRewindOf(workspace: string, sessionId: string): string | null {
  return unfinished(rewindRows(workspace), sessionId).at(-1)?.row.id ?? null;
}

/** Errors in the rewind rows that concern this session, as the run verifier reports them. Empty when there are none. */
export function rewindVerificationErrors(workspace: string, sessionId: string, sessionRows: readonly EvidenceEvent[]): string[] {
  const forkRows = sessionRows.filter((row) => row.event_type === "audit" && metaOf(row).auditType === FORK_AFTER_REWIND_AUDIT);
  const ops = rewindRows(workspace);
  const errors: string[] = [];
  if (ops.some((entry) => entry.meta.subjectId === sessionId && entry.payload === null)) errors.push(UNREADABLE);
  for (const finished of ops.filter((entry) => entry.meta.auditType === REWIND_FINISHED_AUDIT && entry.meta.subjectId === sessionId && entry.payload !== null)) {
    const intended = ops.find((entry) => entry.row.id === finished.payload!.intendedEventId && entry.row.event_hash === finished.payload!.intendedEventHash
      && entry.meta.auditType === REWIND_INTENDED_AUDIT && entry.meta.subjectId === sessionId);
    if (intended?.payload == null) { errors.push(`rewind ${finished.row.id} cites no readable recorded intention`); continue; }
    const files = Array.isArray(intended.payload.files) ? intended.payload.files as RewindFileEntry[] : [];
    const outcomes = Array.isArray(finished.payload!.outcomes) ? finished.payload!.outcomes as Outcome[] : [];
    errors.push(...checkFiles(sessionRows, Number(intended.payload.toTurn), files, outcomes));
  }
  for (const intended of unfinished(ops, sessionId)) {
    if (intended.payload === null) continue;
    errors.push(...checkFiles(sessionRows, Number(intended.payload.toTurn), Array.isArray(intended.payload.files) ? intended.payload.files as RewindFileEntry[] : [], null));
  }
  for (const row of forkRows) {
    const meta = metaOf(row);
    const open = sessionRows[0] === undefined ? null : metaOf(sessionRows[0]) as { parentSession?: { sessionId?: unknown; forkTurn?: unknown } };
    const cited = ops.find((entry) => entry.row.id === meta.rewindEventId && entry.row.event_hash === meta.rewindEventHash);
    if (sessionRows.indexOf(row) !== 1) errors.push("a fork's rewind citation is not its first row after session/open");
    if (cited?.payload == null || cited.meta.auditType !== REWIND_FINISHED_AUDIT || cited.meta.subjectId !== meta.parentSessionId
      || Number(cited.payload.toTurn) !== meta.toTurn || open?.parentSession?.sessionId !== meta.parentSessionId || open?.parentSession?.forkTurn !== meta.toTurn) {
      errors.push(`fork row ${row.id} cites a rewind that does not exist or does not match this session's parent and fork turn`);
    }
  }
  return errors;
}

const NOT_KEPT_WORDS: Readonly<Record<string, string>> = { "too-large": "too large", "session-limit": "past the session's limit",
  "not-stored": "no encryption key or not saved", "protected-data-mode": "protected-data mode was on" };

/** How a finished rewind went, from its own two records. */
function rewindSummary(finished: OpsRow, intended: OpsRow | undefined): string {
  const outcomes = (Array.isArray(finished.payload?.outcomes) ? finished.payload!.outcomes : []) as Outcome[];
  const count = (status: string) => outcomes.filter((outcome) => outcome.status === status).length;
  const skipped = Number(intended?.payload?.conflicts ?? 0);
  return `${count("restored") + count("recreated")} put back, ${count("removed")} created file(s) removed, ${count("already")} already back, `
    + `${count("failed")} failed, ${skipped} not put back because of a conflict`;
}

/**
 * Plain lines for `amc session show`: per turn, the files whose earlier content was not kept and a plan handed over with
 * plan_exit; the rewinds of this session; and the rewind a fork continues from.
 */
export function describeSessionRewinds(workspace: string, sessionId: string, sessionRows: readonly EvidenceEvent[]): string[] {
  const lines: string[] = [];
  const notKept = new Map<string, number>();
  for (const row of sessionRows) {
    const meta = metaOf(row), turn = extractEnvelope(row.meta_json)?.turn ?? 0;
    if (row.event_type !== "audit") continue;
    const notKeptWhy = typeof meta.reason === "string" && meta.reason in NOT_KEPT_WORDS ? meta.reason : meta.status;
    if (meta.auditType === FILE_CHECKPOINT_AUDIT && typeof notKeptWhy === "string" && notKeptWhy in NOT_KEPT_WORDS) {
      const key = `${turn}\0${NOT_KEPT_WORDS[notKeptWhy]}`; notKept.set(key, (notKept.get(key) ?? 0) + 1);
    }
    if (meta.auditType === PLAN_READY_AUDIT) lines.push(`Turn ${turn}: the agent handed over a plan for review (plan_exit), and AMC ended the turn there. Plan mode stays on until you turn it off.`);
  }
  for (const [key, count] of notKept) {
    const [turn, why] = key.split("\0");
    lines.push(`Turn ${turn}: the earlier content of ${count} file(s) was not kept (${why}); a rewind cannot put those files back.`);
  }
  const ops = rewindRows(workspace);
  for (const finished of ops.filter((entry) => entry.meta.auditType === REWIND_FINISHED_AUDIT && entry.meta.subjectId === sessionId)) {
    if (finished.payload === null) { lines.push(`A rewind of this session (record ${finished.row.id}) could not be read; unlock the vault to see it.`); continue; }
    const intended = ops.find((entry) => entry.row.id === finished.payload!.intendedEventId);
    const by = (intended?.payload?.by ?? {}) as { user?: unknown; host?: unknown };
    lines.push(`Files rewound to turn ${String(finished.payload.toTurn)} on ${new Date(finished.row.ts).toISOString()} by ${String(by.user)} on ${String(by.host)} `
      + `(at a terminal, no sign-in): ${rewindSummary(finished, intended)}. `
      + `This session's rows are unchanged; continue from that turn with amc agent-loop chat --fork-from ${sessionId}.`);
  }
  for (const intended of unfinished(ops, sessionId)) {
    const files = Array.isArray(intended.payload?.files) ? intended.payload!.files as RewindFileEntry[] : [];
    const paths = files.map((file) => {
      const row = sessionRows.find((entry) => entry.id === file.checkpointEventId);
      const read = row === undefined ? null : readEventPayload(workspace, row);
      try { return read?.status === "ok" ? String((JSON.parse(read.bytes.toString("utf8")) as { path?: unknown }).path) : "(path unreadable)"; } catch { return "(path unreadable)"; }
    });
    lines.push(`A rewind to turn ${String(intended.payload?.toTurn)} was started on ${new Date(intended.row.ts).toISOString()} and did not finish (record ${intended.row.id}). `
      + `It listed ${files.length} file(s): ${paths.join(", ") || "none"}. Run amc session rewind ${sessionId} --to-turn ${String(intended.payload?.toTurn)} again to finish it; files already back are counted as done.`);
  }
  for (const row of sessionRows.filter((entry) => entry.event_type === "audit" && metaOf(entry).auditType === FORK_AFTER_REWIND_AUDIT)) {
    const meta = metaOf(row);
    const finished = ops.find((entry) => entry.row.id === meta.rewindEventId);
    const intended = finished?.payload == null ? undefined : ops.find((entry) => entry.row.id === finished.payload!.intendedEventId);
    const notBack = Number(meta.notPutBack ?? 0);
    lines.push(`This session continues session ${String(meta.parentSessionId)} from turn ${String(meta.toTurn)}, after that session's files were rewound `
      + `(record ${String(meta.rewindEventId)}${finished === undefined ? ", not found" : `: ${rewindSummary(finished, intended)}`}).`
      + (notBack > 0 ? ` ${notBack} file(s) were not put back, so the folder is not entirely as it was at turn ${String(meta.toTurn)}.` : ""));
  }
  return lines.map(escapeTerminalControls);
}
