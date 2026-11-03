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
 */
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { sha256Hex } from "../utils/hash.js";
import { appendTransparencyEntry, transparencyLogPath } from "./logChain.js";

export const PASSPORT_POLICY_CONFIGURED = "PASSPORT_POLICY_CONFIGURED";
export const PROMPT_SCHEDULER_CONFIGURED = "PROMPT_SCHEDULER_CONFIGURED";
export const FORECAST_SCHEDULER_CONFIGURED = "FORECAST_SCHEDULER_CONFIGURED";
/** Types that show the passport policy was configured: the witness, or an applied policy (logged, and audited by Studio). */
export const PASSPORT_POLICY_WITNESSES = [PASSPORT_POLICY_CONFIGURED, "PASSPORT_POLICY_APPLIED"] as const;
/** One group per part: when the ledger holds a type of a group, verify all requires the log to hold a type of it too. */
export const WITNESS_GROUPS: readonly (readonly string[])[] = [PASSPORT_POLICY_WITNESSES, [PROMPT_SCHEDULER_CONFIGURED], [FORECAST_SCHEDULER_CONFIGURED]];

/**
 * Witnesses the saved file at `path` (its current bytes unless given) unless the transparency log already holds a `type`
 * entry. Called after the save, outside any flow that holds the transparency state fixed (a default passport policy that
 * an async reader creates lazily is not witnessed: it is a default, recreated on the next load).
 */
export function witnessConfiguration(workspace: string, type: string, path: string, bytes?: Uint8Array): void {
  let log = "";
  try {
    log = readFileSync(transparencyLogPath(workspace), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // ponytail: one raw read of the log per save (the schedulers save often); index it if the log grows large.
  if (log.includes(`"type":"${type}"`)) return;
  const id = relative(resolve(workspace), resolve(path)).split(sep).join("/"), sha256 = sha256Hex(Buffer.from(bytes ?? readFileSync(path)));
  appendOpsAuditEvent({ workspace, auditType: type, payload: { path: id, sha256 } });
  appendTransparencyEntry({ workspace, type, agentId: "workspace", artifact: { kind: "policy", id, sha256 } });
}

/** The witness types (of WITNESS_GROUPS) the evidence ledger holds. Read it only after the ledger verified. */
export function ledgerWitnessTypes(workspace: string): Set<string> {
  const ledger = openLedger(workspace, { readonly: true }), types = WITNESS_GROUPS.flat();
  try {
    const rows = ledger.db.prepare(`SELECT DISTINCT json_extract(meta_json, '$.auditType') AS type FROM evidence_events WHERE event_type = 'audit'
      AND json_valid(meta_json) AND json_extract(meta_json, '$.auditType') IN (${types.map(() => "?").join(", ")})`).all(...types) as Array<{ type: string }>;
    return new Set(rows.map((row) => row.type));
  } finally {
    ledger.close();
  }
}
