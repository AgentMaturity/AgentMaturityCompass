/**
 * Moving guard events out of their own database and into the evidence store.
 *
 * `.amc/guard_events.sqlite` is one of nine stores that sit outside
 * `evidence.sqlite`. Being outside it is not a filing detail: every ops engine
 * opens a workspace through `openLedger()`, so retention, vacuum, backup and
 * integrity verification all reach exactly one file. Guard events reached
 * 87,667 rows with no prune path of any kind, and nobody had to make a mistake
 * for that to happen — it followed from the second file existing.
 *
 * The migration is staged, and deliberately never one-way:
 *
 *   DUAL_WRITE (default)  every event is written to both stores. The legacy
 *                         file remains authoritative for reads, so this stage
 *                         cannot change any answer.
 *   verify parity         `compareGuardEventStores` reports whether the two
 *                         hold the same rows, by id and by content fingerprint.
 *   CUTOVER               reads and writes use the evidence store. The legacy
 *                         file is left in place, untouched and complete, so
 *                         reverting is a setting change rather than a restore.
 *
 * The stage is read from AMC_GUARD_EVENTS_STAGE. It defaults to DUAL_WRITE
 * rather than CUTOVER because a consolidation that flips on upgrade is a
 * one-way migration wearing a staged migration's clothes.
 */
import Database from "better-sqlite3";
import { openLedger } from "../../ledger/ledger.js";
import { sha256Hex } from "../../utils/hash.js";

export type ConsolidationStage = "DUAL_WRITE" | "CUTOVER";

export interface GuardEventRow {
  id: string;
  agent_id: string;
  module_code: string;
  decision: string;
  reason: string;
  severity: string;
  meta_json: string | null;
  created_at: string;
  prev_hash: string | null;
  event_hash: string | null;
}

export interface StoreComparison {
  /** True only when both stores hold the same ids with the same content. */
  identical: boolean;
  legacyRows: number;
  consolidatedRows: number;
  /** Ids present in the legacy store but not the evidence store. */
  missingFromConsolidated: string[];
  /** Ids present in the evidence store but not the legacy store. */
  missingFromLegacy: string[];
  /** Ids present in both whose contents differ. */
  divergent: string[];
}

export function currentStage(): ConsolidationStage {
  return process.env["AMC_GUARD_EVENTS_STAGE"] === "CUTOVER" ? "CUTOVER" : "DUAL_WRITE";
}

/**
 * A stable fingerprint of one row's content.
 *
 * Compares what the row says, not where it sits: rowid and insertion order
 * differ between the two stores for reasons that carry no meaning, and a parity
 * check that flagged those would report drift on every healthy workspace.
 */
export function guardEventFingerprint(row: GuardEventRow): string {
  return sha256Hex(
    [
      row.id,
      row.agent_id,
      row.module_code,
      row.decision,
      row.reason,
      row.severity,
      row.meta_json ?? "",
      row.created_at,
      row.prev_hash ?? "",
      row.event_hash ?? ""
    ].join(" ")
  );
}

const SELECT_ALL = `
  SELECT id, agent_id, module_code, decision, reason, severity, meta_json, created_at, prev_hash, event_hash
  FROM amc_guard_events
`;

function readRows(db: Database.Database): GuardEventRow[] {
  try {
    return db.prepare(SELECT_ALL).all() as GuardEventRow[];
  } catch {
    // No table yet: an empty store, not an error. A workspace that has never
    // written a guard event is in parity with one that has not either.
    return [];
  }
}

/**
 * Reports whether the two stores agree.
 *
 * This is the gate between DUAL_WRITE and CUTOVER, so it must be able to fail:
 * a comparison that cannot report a difference is not evidence that there is
 * none.
 */
export function compareGuardEventStores(params: {
  workspace: string;
  legacyDbPath: string;
}): StoreComparison {
  const legacyDb = new Database(params.legacyDbPath, { readonly: true, fileMustExist: false });
  let legacy: GuardEventRow[];
  try {
    legacy = readRows(legacyDb);
  } finally {
    legacyDb.close();
  }

  const ledger = openLedger(params.workspace);
  let consolidated: GuardEventRow[];
  try {
    consolidated = readRows(ledger.db);
  } finally {
    ledger.close();
  }

  const legacyById = new Map(legacy.map((row) => [row.id, guardEventFingerprint(row)]));
  const consolidatedById = new Map(consolidated.map((row) => [row.id, guardEventFingerprint(row)]));

  const missingFromConsolidated: string[] = [];
  const divergent: string[] = [];
  for (const [id, fingerprint] of legacyById) {
    const other = consolidatedById.get(id);
    if (other === undefined) missingFromConsolidated.push(id);
    else if (other !== fingerprint) divergent.push(id);
  }
  const missingFromLegacy = [...consolidatedById.keys()].filter((id) => !legacyById.has(id));

  return {
    identical:
      missingFromConsolidated.length === 0 && missingFromLegacy.length === 0 && divergent.length === 0,
    legacyRows: legacy.length,
    consolidatedRows: consolidated.length,
    missingFromConsolidated,
    missingFromLegacy,
    divergent
  };
}

/**
 * Copies rows the evidence store is missing.
 *
 * Needed because dual-write only covers events written after it was switched
 * on; a workspace with existing history would otherwise never reach parity and
 * could never be cut over. Copying is additive and idempotent — it inserts
 * what is absent and rewrites nothing — so running it twice is harmless and
 * running it never touches the legacy file.
 */
export function backfillGuardEvents(params: { workspace: string; legacyDbPath: string }): {
  copied: number;
} {
  const legacyDb = new Database(params.legacyDbPath, { readonly: true, fileMustExist: false });
  let legacy: GuardEventRow[];
  try {
    legacy = readRows(legacyDb);
  } finally {
    legacyDb.close();
  }
  if (legacy.length === 0) return { copied: 0 };

  const ledger = openLedger(params.workspace);
  try {
    const insert = ledger.db.prepare(`
      INSERT OR IGNORE INTO amc_guard_events
        (id, agent_id, module_code, decision, reason, severity, meta_json, created_at, prev_hash, event_hash)
      VALUES (@id, @agent_id, @module_code, @decision, @reason, @severity, @meta_json, @created_at, @prev_hash, @event_hash)
    `);
    let copied = 0;
    const tx = ledger.db.transaction((rows: GuardEventRow[]) => {
      for (const row of rows) {
        copied += insert.run(row).changes;
      }
    });
    tx(legacy);
    return { copied };
  } finally {
    ledger.close();
  }
}

/**
 * Writes one guard event into the evidence store.
 *
 * Never throws. The emitter it is called from sits on the guard decision path
 * and documents that it never throws — a consolidation that could take down
 * enforcement would be a worse failure than the duplication it removes. A write
 * that fails here leaves the legacy store authoritative, which is the state
 * this stage already assumes, and the boolean lets the caller record that the
 * two have drifted rather than assume they have not.
 */
export function writeConsolidatedGuardEvent(workspace: string, row: GuardEventRow): boolean {
  try {
    const ledger = openLedger(workspace);
    try {
      ledger.db
        .prepare(`
          INSERT OR IGNORE INTO amc_guard_events
            (id, agent_id, module_code, decision, reason, severity, meta_json, created_at, prev_hash, event_hash)
          VALUES (@id, @agent_id, @module_code, @decision, @reason, @severity, @meta_json, @created_at, @prev_hash, @event_hash)
        `)
        .run(row);
      return true;
    } finally {
      ledger.close();
    }
  } catch {
    return false;
  }
}
