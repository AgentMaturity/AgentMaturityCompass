/**
 * HP-04: whether a turn that ran actions able to change files was checked afterwards.
 *
 * The status is computed from the turn's own signed rows (tool calls and results, approval rows and the
 * `native-validation` check rows) and written as one signed `native-turn-verification` row immediately before
 * `turn/end`, so the turn's seal covers it. A turn opened by a build that writes these rows says so on its `turn/start`
 * row (`verifyOnStop`, the run's check setting); `agent-loop verify` then requires exactly one status row in that
 * position and recomputes it over every row of the turn.
 *
 * Every doubt reads as "changed, not checked":
 * - a change is any tool call whose result is not DENIED (refused before the body ran), except the tools in
 *   READ_ONLY_TOOLS. A tool error still counts: no field in the result says that nothing was written.
 * - a call id that repeats in the turn, a result with no open call of that id, a tool row from another turn inside
 *   this turn's window, and a call with no result all count as changes after any check.
 * - a check counts from its first `check-start` row (when the command actually begins), and only when it began after
 *   the last change. Only harness-run checks count (operator `--validate` or the workspace's signed checks): their
 *   command and exit code are in signed meta. A check the model ran by itself is not counted.
 * - background work (a job, terminal or child agent) still running at the end of the turn means no pass.
 */
import type { SessionEventRef } from "../session/sessionApiTypes.js";
import type { SessionService } from "../session/sessionService.js";
import type { EvidenceEvent } from "../types.js";
import { escapeTerminalControls } from "../utils/terminalEscape.js";

type TurnVerificationStatus = "no-changes" | "changed-and-checked-pass" | "changed-and-checked-fail" | "changed-unchecked";
/**
 * The run's check setting, also written on each `turn/start`. on: checks after edits run; off: the operator turned them
 * off; validate: `--validate` checks run instead; config-unverified: the check list's signature does not verify;
 * child-*: a delegated child, which never runs checks itself (its parent does, or does not).
 */
export type VerifyOnStopSetting = "on" | "off" | "no-checks" | "validate" | "config-unverified" | "child-parent-checks" | "child-no-parent-checks";
export interface TurnVerification {
  readonly status: TurnVerificationStatus;
  /** Actions that can change files (never a count of files). */
  readonly changes: number;
  readonly lastChangeEventId: string | null;
  /** The `finished` row of the check run that decides the status, if any. */
  readonly checkEventId: string | null;
  readonly reason: string | null;
}
export interface TurnCheckRow extends TurnVerification {
  readonly turn: number;
  readonly verifyOnStop: VerifyOnStopSetting;
  readonly eventId: string;
}
/** What the live writer knows that the rows alone do not; both can only weaken the status. */
export interface TurnCheckContext {
  readonly setting: VerifyOnStopSetting;
  readonly backgroundWork: boolean;
  /** Finishing the turn's check bookkeeping threw (the turn ends `error`). */
  readonly finishErrored: boolean;
}

const TURN_VERIFICATION_KIND = "native-turn-verification";
/** The closed set of reason codes; a stored row with any other value reads as "unknown-reason" (and fails verify). */
const REASON_CODES: ReadonlySet<string> = new Set(["no-check", "check-before-last-change", "nonzero-exit", "check-cancelled", "check-timed-out",
  "check-approval-not-given", "check-refused-before-run", "check-unavailable", "background-work-running", "checked-by-parent",
  "checks-config-unverified", "write-did-not-complete", "check-errored", "unknown-reason"]);
/** Reasons for which the harness may run the checks at the end of the turn. */
export const CHECKABLE_REASONS: ReadonlySet<string> = new Set(["no-check", "check-before-last-change"]);
const STATUSES: ReadonlySet<string> = new Set(["no-changes", "changed-and-checked-pass", "changed-and-checked-fail", "changed-unchecked"]);
const SETTINGS: ReadonlySet<string> = new Set(["on", "off", "no-checks", "validate", "config-unverified", "child-parent-checks", "child-no-parent-checks"]);
/** Built-in tools that can neither write a file nor start a process. Everything else may change files. */
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(["fs.read", "glob", "grep", "ls", "plan", "todo", "tool_search", "web_fetch",
  "web_search", "ask_user", "session.spill_read", "skill.load", "get_goal", "job_list", "job_output", "terminal_list", "terminal_read", "echo"]);
/** File tools whose error, as the only kind of change in a turn, is not worth asking a person to approve a check for. */
const WRITE_TOOLS: ReadonlySet<string> = new Set(["fs.write", "fs.edit", "apply_patch"]);
const NO_CONTEXT: TurnCheckContext = { setting: "no-checks", backgroundWork: false, finishErrored: false };

function metaOf(row: EvidenceEvent): Record<string, unknown> {
  try { const meta: unknown = JSON.parse(row.meta_json); return meta !== null && typeof meta === "object" ? meta as Record<string, unknown> : {}; }
  catch { return {}; }
}

/** The turn's window: from its `turn/start` (when present) up to, not including, its `turn/end`. */
function turnWindow(rows: readonly EvidenceEvent[], turn: number): readonly EvidenceEvent[] {
  let from = 0;
  rows.forEach((row, at) => { if (row.event_type === "turn/start" && metaOf(row).turn === turn) from = at; });
  const end = rows.findIndex((row, at) => at > from && row.event_type === "turn/end" && metaOf(row).turn === turn);
  return rows.slice(from, end < 0 ? rows.length : end);
}

interface CheckRun { start: number; status: unknown; eventId: string; checks: readonly Record<string, unknown>[] }

/** Why a finished check run did not reach pass or fail, as a closed code. */
function unavailableReason(run: CheckRun, approvalFor: (callId: unknown) => "allowed" | "not-given" | "none"): string {
  const check = run.checks.find(item => item.status !== "passed" && item.status !== "failed") ?? {};
  if (check.timedOut === true || check.reason === "deadline-exceeded") return "check-timed-out";
  if (check.reason === "cancelled") return "check-cancelled";
  if (check.reason === "execution-denied") return approvalFor(check.callId) === "not-given" ? "check-approval-not-given" : "check-refused-before-run";
  return "check-unavailable";
}

/** One turn's status from its rows. */
export function computeTurnVerification(allRows: readonly EvidenceEvent[], turn: number, context: TurnCheckContext = NO_CONTEXT): TurnVerification {
  const rows = turnWindow(allRows, turn);
  // Keyed by the model's call id, the only id both rows carry; any ambiguity in it counts as a change nothing checked.
  const open = new Map<string, { readonly eventId: string; readonly name: string }>();
  const seen = new Set<string>();
  const approvalByCall = new Map<string, string>(), answerByApproval = new Map<string, unknown>();
  const runs: CheckRun[] = [];
  let changes = 0, erroredWrites = 0, lastChangeAt = -1, lastChangeEventId: string | null = null, runStart: number | null = null;
  rows.forEach((row, at) => {
    const meta = metaOf(row);
    const tool = row.event_type === "tool/call" || row.event_type === "tool/result";
    const unclear = (): void => { changes++; lastChangeAt = Infinity; lastChangeEventId = row.id; };
    if (meta.turn !== turn) { if (tool) unclear(); return; }
    if (row.event_type === "tool/call") {
      const id = meta.toolCallId;
      if (typeof id !== "string" || seen.has(id)) { unclear(); return; }
      seen.add(id);
      open.set(id, { eventId: row.id, name: String(meta.toolName) });
    } else if (row.event_type === "tool/result") {
      const call = typeof meta.toolCallId === "string" ? open.get(meta.toolCallId) : undefined;
      if (call === undefined) { unclear(); return; }
      open.delete(meta.toolCallId as string);
      if (READ_ONLY_TOOLS.has(call.name) || meta.denied === true || meta.outcome === "DENIED") return;
      changes++; lastChangeAt = Math.max(lastChangeAt, at); lastChangeEventId = row.id;
      if (WRITE_TOOLS.has(call.name) && meta.outcome === "ERROR") erroredWrites++;
    } else if (row.event_type === "approval/request" && typeof meta.toolCallId === "string") approvalByCall.set(meta.toolCallId, String(meta.approvalId));
    else if (row.event_type === "approval/answer") answerByApproval.set(String(meta.approvalId), meta.answer);
    else if (row.event_type === "audit" && meta.kind === "native-validation") {
      if (meta.phase === "requested") runStart = null;
      // A check run starts when its first command starts, not when the run was armed at turn start (review H1).
      else if (meta.phase === "check-start" && runStart === null) runStart = at;
      else if (meta.phase === "finished") {
        runs.push({ start: runStart ?? -1, status: meta.status, eventId: row.id,
          checks: Array.isArray(meta.checks) ? (meta.checks as unknown[]).filter((item): item is Record<string, unknown> => item !== null && typeof item === "object") : [] });
        runStart = null;
      }
    }
  });
  // A change with no recorded result may still be running or may have landed: nothing checked it afterwards.
  for (const call of open.values()) if (!READ_ONLY_TOOLS.has(call.name)) { changes++; lastChangeAt = Infinity; lastChangeEventId = call.eventId; }
  const unchecked = (reason: string, checkEventId: string | null = null): TurnVerification =>
    ({ status: "changed-unchecked", changes, lastChangeEventId, checkEventId, reason });
  if (context.finishErrored) return unchecked("check-errored");
  if (changes === 0 && !context.backgroundWork) return { status: "no-changes", changes, lastChangeEventId, checkEventId: null, reason: null };
  const after = runs.filter(run => run.start >= 0 && run.start > lastChangeAt).at(-1);
  if (after?.status === "failed") return { status: "changed-and-checked-fail", changes, lastChangeEventId, checkEventId: after.eventId, reason: "nonzero-exit" };
  if (context.backgroundWork) return unchecked("background-work-running", after?.eventId ?? null);
  if (after?.status === "passed") return { status: "changed-and-checked-pass", changes, lastChangeEventId, checkEventId: after.eventId, reason: null };
  if (after !== undefined) {
    const approvalFor = (callId: unknown): "allowed" | "not-given" | "none" => {
      const approval = typeof callId === "string" ? approvalByCall.get(callId) : undefined;
      return approval === undefined ? "none" : answerByApproval.get(approval) === "allow" ? "allowed" : "not-given";
    };
    return unchecked(unavailableReason(after, approvalFor), after.eventId);
  }
  if (context.setting === "child-parent-checks") return unchecked("checked-by-parent");
  if (context.setting === "config-unverified") return unchecked("checks-config-unverified");
  if (erroredWrites === changes) return unchecked("write-did-not-complete");
  return unchecked(runs.length > 0 ? "check-before-last-change" : "no-check");
}

/** Written once per turn, immediately before `turn/end`, so the turn's seal covers it. */
export function recordTurnVerification(session: SessionService, turn: number, context: TurnCheckContext): SessionEventRef {
  const verification = computeTurnVerification(session.readEvents(), turn, context);
  return session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: { kind: TURN_VERIFICATION_KIND, version: 1, turn, ...verification,
    verifyOnStop: context.setting, backgroundWork: context.backgroundWork } });
}

/** One row's fields, or null when malformed. Also admits the rows a child run's JSON summary carries to chat. */
export function turnCheckFrom(value: unknown, eventId: unknown): TurnCheckRow | null {
  const meta = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!Number.isSafeInteger(meta.turn) || !STATUSES.has(String(meta.status)) || !SETTINGS.has(String(meta.verifyOnStop))
    || !Number.isSafeInteger(meta.changes) || typeof eventId !== "string") return null;
  const text = (field: unknown): string | null => typeof field === "string" ? field : null;
  return { turn: meta.turn as number, status: meta.status as TurnVerificationStatus, changes: meta.changes as number, verifyOnStop: meta.verifyOnStop as VerifyOnStopSetting,
    lastChangeEventId: text(meta.lastChangeEventId), checkEventId: text(meta.checkEventId),
    reason: meta.reason === null || meta.reason === undefined ? null : REASON_CODES.has(String(meta.reason)) ? String(meta.reason) : "unknown-reason", eventId };
}

const isStatusRow = (row: EvidenceEvent): boolean => row.event_type === "audit" && metaOf(row).kind === TURN_VERIFICATION_KIND;

/** The recorded rows, as written. Malformed rows are left out here and caught by {@link turnVerificationErrors}. */
export function projectTurnChecks(rows: readonly EvidenceEvent[]): TurnCheckRow[] {
  return rows.flatMap(row => {
    const parsed = isStatusRow(row) ? turnCheckFrom(metaOf(row), row.id) : null;
    return parsed === null ? [] : [parsed];
  });
}

/** The check setting a `turn/start` row carries, or null for a turn opened by an older build (which is not checked). */
export const turnStartSetting = (row: EvidenceEvent): VerifyOnStopSetting | null => {
  const value = metaOf(row).verifyOnStop;
  return row.event_type === "turn/start" && SETTINGS.has(String(value)) ? value as VerifyOnStopSetting : null;
};

/**
 * For every finished turn whose `turn/start` carries a check setting: exactly one status row, immediately before
 * `turn/end`, naming this turn and the same setting, and equal to the status recomputed over the whole turn. A status
 * row anywhere else is an error too. Turns closed by crash repair (`interrupted`) may lack the row.
 */
export function turnVerificationErrors(rows: readonly EvidenceEvent[]): string[] {
  const errors: string[] = [];
  const placed = new Set<number>();
  rows.forEach((row, start) => {
    const setting = turnStartSetting(row);
    if (setting === null) return;
    const turn = metaOf(row).turn as number;
    const end = rows.findIndex((candidate, at) => at > start && candidate.event_type === "turn/end" && metaOf(candidate).turn === turn);
    if (end < 0) return; // still open
    const inside = rows.slice(start + 1, end).flatMap((candidate, offset) => isStatusRow(candidate) ? [start + 1 + offset] : []);
    inside.forEach(at => placed.add(at));
    const ending = metaOf(rows[end]!).reason;
    if (inside.length === 0 && ending === "interrupted") return;
    if (inside.length !== 1) { errors.push(`Turn ${turn} has ${inside.length} check-status records; it needs exactly one`); return; }
    const at = inside[0]!;
    const recorded = turnCheckFrom(metaOf(rows[at]!), rows[at]!.id);
    if (at !== end - 1) { errors.push(`Turn ${turn}'s check-status record is not the last row before the turn ends (${rows[at]!.id})`); return; }
    if (recorded === null || recorded.turn !== turn) { errors.push(`Turn ${turn}'s check-status record is malformed or names another turn (${rows[at]!.id})`); return; }
    if (recorded.verifyOnStop !== setting) { errors.push(`Turn ${turn}'s check-status record claims checks were "${recorded.verifyOnStop}"; the turn was opened with "${setting}"`); return; }
    if (recorded.reason === "check-errored" && ending !== "error") { errors.push(`Turn ${turn}'s check-status record says checking errored, but the turn did not end in an error`); return; }
    const actual = computeTurnVerification(rows.slice(start, at), turn,
      { setting, backgroundWork: metaOf(rows[at]!).backgroundWork === true, finishErrored: recorded.reason === "check-errored" });
    if ((["status", "changes", "lastChangeEventId", "checkEventId", "reason"] as const).some(key => actual[key] !== recorded[key])) {
      errors.push(`Turn ${turn}'s recorded check status (${recorded.status}) does not match its recorded actions (${actual.status}) (${rows[at]!.id})`);
    }
  });
  rows.forEach((row, at) => {
    if (isStatusRow(row) && !placed.has(at)) errors.push(`A check-status record is outside any turn opened with a check setting (${row.id})`);
  });
  return errors;
}

const REASONS: Readonly<Record<string, string>> = {
  "check-before-last-change": "a check ran before the last of them, not after",
  "check-approval-not-given": "the check needed an approval nobody gave",
  "check-refused-before-run": "the check was refused before it ran, by a rule or because an earlier action is not settled",
  "check-timed-out": "the check ran out of time",
  "check-cancelled": "the check was cancelled",
  "background-work-running": "background work (a job, a terminal or a child agent) was still running, so a check cannot show the result",
  "checked-by-parent": "this is a delegated agent; its parent's turn runs the checks after it",
  "checks-config-unverified": "the check list in .amc/tools.yaml is not signed or was changed after signing, so no check ran",
  "write-did-not-complete": "the only changes were writes that ended in an error, so no check was run",
  "check-errored": "recording this turn's checks failed",
  "unknown-reason": "the record names a reason this version does not know"
};
/** One plain line for a person, e.g. "Turn 3 ran 2 actions that can change files; no check ran afterwards." Escaped for a terminal. */
export function describeTurnCheck(row: TurnCheckRow): string { return escapeTerminalControls(turnCheckWords(row)); }
function turnCheckWords(row: TurnCheckRow): string {
  const actions = `Turn ${row.turn} ran ${row.changes} action${row.changes === 1 ? "" : "s"} that can change files`;
  const off = row.verifyOnStop === "off" ? " Checks after edits were turned off for this run." : "";
  if (row.status === "no-changes") return `Turn ${row.turn} ran no action that can change files.`;
  if (row.status === "changed-and-checked-pass") return `${actions}; the configured check ran afterwards and passed.`;
  if (row.status === "changed-and-checked-fail") return `${actions}; the configured check ran afterwards and FAILED. Do not read the reply above as "done".`;
  const why = row.reason === null || row.reason === "no-check" ? "" : ` (${REASONS[row.reason] ?? "the check did not finish"})`;
  return `${actions}; no check ran afterwards${why}. Nothing in this record shows the result works.${off}`;
}
export const needsCheckWarning = (row: TurnCheckRow): boolean => row.status === "changed-unchecked" || row.status === "changed-and-checked-fail";
