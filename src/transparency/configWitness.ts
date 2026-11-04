/**
 * Configuration witnesses for `amc verify all`. A signed file and its .sig can both be deleted, so their absence cannot
 * show a part was never set up. When the passport policy, the prompt scheduler state or the forecast scheduler state is
 * saved, one witness of its type is written to two records: an audit row in the evidence ledger (hash-chained, signed by
 * the monitor key that ledger-trust-root checks against the pinned fingerprint) and then an entry in the hash-chained,
 * sealed transparency log. Verify all reads such a part as NOT_CONFIGURED only when both verified records hold no witness
 * of it, fails it when either does and the files are gone, and fails the transparency log when the ledger holds a witness
 * the log lacks (the log was restored to an older copy). The ledger row comes first, so an interrupted pair reads as a
 * rollback until the next save completes it. A rollback of the whole workspace (ledger and log together) is not
 * detectable here: that needs an anchor outside the workspace (the public transparency anchor or high-water marks).
 * Prompt pack builds write a per-agent PROMPT_PACK_CREATED ledger row (witnessInLedger) before their own log entry, and the
 * A4 store writes the per-project A4_PROJECT_CREATED pair (witnessRecords with the project id as subject) after a new
 * project's CREATED ledger rows commit, and again on a replay of that create, so an interrupted pair is completed.
 *
 * Every explicit writer of the three files witnesses, sync and async, SDK exports included. Deliberately unwitnessed:
 * - the default passport policy an async reader creates lazily (loadPassportPolicyAttemptAsync): it is only the default
 *   and the next read recreates it; every explicit init witnesses it afterwards;
 * - passportPolicyApplyAttemptForApiAsync, which Studio holds the transparency state fixed around: its PASSPORT_POLICY_APPLIED
 *   log entry and Studio's PASSPORT_POLICY_APPLIED ledger audit row are its witnesses.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntry, transparencyLogPath, verifiedTransparencyLog } from "./logChain.js";
import type { TransparencyArtifactKind } from "./logSchema.js";

export const PASSPORT_POLICY_CONFIGURED = "PASSPORT_POLICY_CONFIGURED";
export const PROMPT_SCHEDULER_CONFIGURED = "PROMPT_SCHEDULER_CONFIGURED";
export const FORECAST_SCHEDULER_CONFIGURED = "FORECAST_SCHEDULER_CONFIGURED";
/** A prompt pack build: the build appends this log entry itself; its ledger row (per agent) comes from witnessInLedger. */
export const PROMPT_PACK_CREATED = "PROMPT_PACK_CREATED";
/** An A4 project's creation (preview only), per project: a project either record shows was created must still be in the ledger. */
export const A4_PROJECT_CREATED = "A4_PROJECT_CREATED";
/** Types that show the passport policy was configured: the witness, or an applied policy (logged, and audited by Studio). */
export const PASSPORT_POLICY_WITNESSES = [PASSPORT_POLICY_CONFIGURED, "PASSPORT_POLICY_APPLIED"] as const;
/** One group per part: when the ledger holds a type of a group, verify all requires the log to hold a type of it too. */
export const WITNESS_GROUPS: readonly (readonly string[])[] = [PASSPORT_POLICY_WITNESSES, [PROMPT_SCHEDULER_CONFIGURED], [FORECAST_SCHEDULER_CONFIGURED], [PROMPT_PACK_CREATED],
  [A4_PROJECT_CREATED]];

/** Whether the ledger holds a `type` audit row for `agentId` (and `subjectId`, or none). A forged row would fail ledger verification. */
function ledgerHolds(workspace: string, type: string, agentId: string, subjectId?: string): boolean {
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return false;
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return ledger.db.prepare(`SELECT 1 FROM evidence_events WHERE event_type = 'audit' AND json_valid(meta_json)
      AND json_extract(meta_json, '$.auditType') = ? AND json_extract(meta_json, '$.agentId') = ?
      AND json_extract(meta_json, '$.subjectId') IS ? LIMIT 1`).get(type, agentId, subjectId ?? null) !== undefined;
  } finally {
    ledger.close();
  }
}

/** Writes the ledger witness (an ops audit row) of `type` for `agentId` (and `subjectId`) unless the ledger already holds one. */
export function witnessInLedger(workspace: string, type: string, agentId: string, payload: Record<string, unknown>, subjectId?: string): void {
  if (!ledgerHolds(workspace, type, agentId, subjectId)) appendOpsAuditEvent({ workspace, auditType: type, agentId, subjectId, payload });
}

/**
 * Witnesses the saved file at `path` (its current bytes unless given), as the workspace's: see witnessRecords. Called after
 * the save, outside any flow that holds the transparency state fixed (a default passport policy that an async reader creates
 * lazily is not witnessed: it is a default, recreated on the next load).
 */
export function witnessConfiguration(workspace: string, type: string, path: string, bytes?: Uint8Array): void {
  const id = relative(resolve(workspace), resolve(path)).split(sep).join("/"), sha256 = sha256Hex(Buffer.from(bytes ?? readFileSync(path)));
  witnessRecords(workspace, type, "workspace", { kind: "policy", id, sha256 }, { path: id, sha256 });
}

/**
 * Writes the `type` witness of `agentId` to both records, each decided on its own: the ledger row whenever the ledger lacks
 * one, then the log entry whenever the verified log (its parsed entries, read only) lacks one of this type and agent; neither
 * suppresses the other, so a rollback of either record is repaired on the next witness. With `bySubject` the witness is per
 * artifact id instead (an A4 project): the ledger row's meta subjectId and the log entry's artifact id name it.
 */
function witnessRecords(workspace: string, type: string, agentId: string, artifact: { kind: TransparencyArtifactKind; id: string; sha256: string },
  payload: Record<string, unknown>, bySubject = false): void {
  const subjectId = bySubject ? artifact.id : undefined;
  witnessInLedger(workspace, type, agentId, payload, subjectId);
  // ponytail: one read-only verification of the log per witness (the schedulers save often); index it if the log grows large.
  const log = existsSync(transparencyLogPath(workspace)) ? verifiedTransparencyLog(workspace, { readOnly: true }) : null;
  if (log?.ok === true && log.entries.some((entry) => entry.type === type && entry.agentId === agentId && (subjectId === undefined || entry.artifact.id === subjectId))) return;
  appendTransparencyEntry({ workspace, type, agentId, artifact });
}

/** The A4_PROJECT_CREATED pair of a created or replayed project (preview only), per project; idempotent, so a replay completes it. */
export function witnessA4Project(workspace: string, agentId: unknown, projectId: unknown, sha256: unknown): void {
  if (typeof agentId !== "string" || typeof projectId !== "string" || typeof sha256 !== "string") return;
  witnessRecords(workspace, A4_PROJECT_CREATED, agentId, { kind: "a4-project", id: projectId, sha256 }, { projectId, sha256 }, true);
}
