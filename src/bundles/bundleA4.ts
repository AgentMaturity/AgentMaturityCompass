/**
 * The `.amcbundle` A4 slice and the `amc.a4-record/v1` export (P1-63; design §14.5). Both carry an A4 project exactly as
 * the ledger stored it: every side-table row, each transition's audit row and every row a `ledger_event` ref names, so a
 * verifier recomputes every `body_digest`, `binding_digest` and `request_digest` from the exported bytes without a key.
 * Public keys travel only to locate a signer; a verifier admits them from its own pinned trust list. `synthetic_example`
 * refs are exported, retained and labelled (`containsSyntheticExamples`); `assertNotExample` never runs on an export.
 */
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { A4_RECORD_TABLES, type A4RecordV1 } from "../contracts/v1/a4Record.js";
import { verifyKeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { hasTable, runMigrations } from "../ledger/ledgerSchema.js";
import { A4_MIGRATION_SQL } from "../ledger/ledgerSchemaA4.js";
import type { EvidenceEvent } from "../types.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";

type Row = Record<string, string | number | null>;
type Tables = A4RecordV1["tables"];
export type A4RecordKeys = A4RecordV1["publicKeys"];
/** What `exportEvidenceBundle` lists in its signed manifest for the slice: each project's head as exported. */
export interface A4BundleSlice {
  schema: "amc.a4-bundle-slice/v1";
  projects: Array<{ projectId: string; headSeq: number; headDigest: string }>;
  containsSyntheticExamples: boolean;
}

const COLUMN = /^[a-z][a-z0-9_]*$/;
const marks = (count: number): string => Array.from({ length: count }, () => "?").join(",");

/** Inserts rows as given; a column name outside [a-z0-9_] is refused, never interpolated. */
function insertRows(db: Database.Database, table: string, rows: readonly Row[], verb = "INSERT"): number {
  let inserted = 0;
  for (const row of rows) {
    const columns = Object.keys(row);
    if (!columns.every((column) => COLUMN.test(column))) throw new Error(`invalid column in ${table}`);
    inserted += db.prepare(`${verb} INTO ${table} (${columns.join(", ")}) VALUES (${marks(columns.length)})`).run(...columns.map((column) => row[column])).changes;
  }
  return inserted;
}

// ponytail: one IN (...) list per query; SQLite allows 32766 parameters, far beyond a project's rows. Chunk if exports grow past it.
function projectRows(db: Database.Database, projectIds: readonly string[]): Tables {
  return Object.fromEntries(A4_RECORD_TABLES.map((table) => [table,
    db.prepare(`SELECT * FROM ${table} WHERE project_id IN (${marks(projectIds.length)}) ORDER BY rowid`).all(...projectIds) as Row[]])) as Tables;
}

/** Each transition's audit row and each row a `ledger_event` ref names. */
const namedEventIds = (tables: Tables): string[] => [...new Set([...tables.a4_transitions.map((row) => String(row.evidence_event_id)),
  ...tables.a4_evidence_refs.filter((row) => row.ref_kind === "ledger_event").map((row) => String(row.ref_id))])];
const syntheticIn = (tables: Tables): boolean => tables.a4_evidence_refs.some((row) => row.claim_kind === "synthetic_example");

/** One project as stored, for a verifier without SQLite. Reads only; signs nothing. */
export function readA4Record(db: Database.Database, projectId: string, keys: A4RecordKeys): A4RecordV1 {
  const tables = projectRows(db, [projectId]);
  const ids = namedEventIds(tables);
  const events = ids.length === 0 ? [] : db.prepare(`SELECT * FROM evidence_events WHERE id IN (${marks(ids.length)}) ORDER BY rowid`).all(...ids) as Row[];
  const sessionIds = [...new Set(events.map((row) => String(row.session_id)))];
  const sessions = sessionIds.length === 0 ? [] : db.prepare(`SELECT * FROM sessions WHERE session_id IN (${marks(sessionIds.length)}) ORDER BY started_ts, session_id`)
    .all(...sessionIds) as Row[];
  return { schema: "amc.a4-record/v1", projectId, containsSyntheticExamples: syntheticIn(tables), tables, evidence: { events, sessions }, publicKeys: keys };
}

/**
 * The ledger rows after the bundle's prefix up to the last row the slice names, plus the rest of their sessions, appended
 * to `out`: the bundle's ledger stays one unbroken prefix that verifyLedgerIntegrity checks whole.
 */
function extendPrefix(source: Database.Database, out: Database.Database, copied: readonly EvidenceEvent[], ids: readonly string[]): {
  events: EvidenceEvent[]; blobPaths: string[]; sessions: number;
} {
  const last = copied.at(-1);
  const from = last ? (source.prepare("SELECT rowid FROM evidence_events WHERE id = ?").get(last.id) as { rowid: number } | undefined)?.rowid ?? 0 : 0;
  const needed = ids.length === 0 ? 0
    : (source.prepare(`SELECT MAX(rowid) AS m FROM evidence_events WHERE id IN (${marks(ids.length)})`).get(...ids) as { m: number | null }).m ?? 0;
  if (needed <= from) return { events: [], blobPaths: [], sessions: 0 };
  // Whole sessions, as copyEvidenceSlice keeps them: a session cut mid-way would fail its seal.
  const to = Math.max(needed, (source.prepare(`SELECT MAX(rowid) AS m FROM evidence_events WHERE session_id IN
    (SELECT session_id FROM evidence_events WHERE rowid > ? AND rowid <= ?)`).get(from, needed) as { m: number | null }).m ?? 0);
  const rows = source.prepare("SELECT * FROM evidence_events WHERE rowid > ? AND rowid <= ? ORDER BY rowid").all(from, to) as Row[];
  const columnsOf = (table: string): Set<string> => new Set((out.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
  const keep = (columns: Set<string>, row: Row): Row => Object.fromEntries(Object.entries(row).filter(([column]) => columns.has(column)));
  const eventColumns = columnsOf("evidence_events");
  const sessionColumns = columnsOf("sessions");
  const sessionIds = [...new Set(rows.map((row) => String(row.session_id)))];
  const sessions = source.prepare(`SELECT * FROM sessions WHERE session_id IN (${marks(sessionIds.length)})`).all(...sessionIds) as Row[];
  const inserted = out.transaction(() => {
    insertRows(out, "evidence_events", rows.map((row) => keep(eventColumns, row)));
    return insertRows(out, "sessions", sessions.map((row) => keep(sessionColumns, row)), "INSERT OR IGNORE");
  })();
  return { events: rows as unknown as EvidenceEvent[], blobPaths: rows.map((row) => String(row.payload_path ?? "")).filter((path) => path.length > 0),
    sessions: inserted };
}

/**
 * The A4 slice of a run bundle (the one hook in `exportEvidenceBundle`): every A4 project of the bundle's agent, its rows
 * as stored and the ledger rows they name. Returns the evidence slice extended by those rows, and the manifest member
 * that lists the slice (empty when the agent has no A4 project, so such bundles are byte-for-byte unchanged).
 */
export function copyA4Slice<T extends { events: EvidenceEvent[]; blobPaths: string[]; eventCount: number; sessionCount: number }>(input: {
  sourceDbPath: string; outputDbPath: string; agentId: string; slice: T;
}): T & { a4Manifest: { a4?: A4BundleSlice } } {
  const source = new Database(input.sourceDbPath, { readonly: true });
  try {
    const projects = hasTable(source, "a4_projects")
      ? source.prepare("SELECT project_id, head_seq, head_digest FROM a4_projects WHERE agent_id = ? ORDER BY created_ts, project_id")
        .all(input.agentId) as Array<{ project_id: string; head_seq: number; head_digest: string }> : [];
    if (projects.length === 0) return { ...input.slice, a4Manifest: {} };
    const tables = projectRows(source, projects.map((project) => project.project_id));
    const out = new Database(input.outputDbPath);
    try {
      const extra = extendPrefix(source, out, input.slice.events, namedEventIds(tables));
      out.exec(A4_MIGRATION_SQL);
      out.transaction(() => A4_RECORD_TABLES.forEach((table) => insertRows(out, table, tables[table])))();
      return {
        ...input.slice,
        events: [...input.slice.events, ...extra.events],
        blobPaths: [...new Set([...input.slice.blobPaths, ...extra.blobPaths])],
        eventCount: input.slice.eventCount + extra.events.length,
        sessionCount: input.slice.sessionCount + extra.sessions,
        a4Manifest: { a4: { schema: "amc.a4-bundle-slice/v1", containsSyntheticExamples: syntheticIn(tables),
          projects: projects.map((project) => ({ projectId: project.project_id, headSeq: project.head_seq, headDigest: project.head_digest })) } }
      };
    } finally {
      out.close();
    }
  } finally {
    source.close();
  }
}

/** The carried role keys where the ledger verifiers look. A history that does not authenticate under its role key is refused. */
function writeKeys(workspace: string, keys: A4RecordKeys): void {
  const dir = join(workspace, ".amc", "keys");
  ensureDir(dir);
  for (const role of ["monitor", "auditor"] as const) {
    const { publicKeyPem, history } = keys[role];
    writeFileAtomic(join(dir, `${role}_ed25519.pub`), publicKeyPem, 0o644);
    if (history === null) continue;
    const checked = verifyKeyHistoryEnvelope(history, role, publicKeyPem);
    if (!checked.valid) throw new Error(`A4_RECORD_KEYS_INVALID: the ${role} key history does not authenticate under the ${role} key (${checked.reason ?? "invalid"})`);
    writeFileAtomic(join(dir, `${role}_history.json`), JSON.stringify(checked.envelope, null, 2), 0o644);
  }
}

/**
 * A temporary workspace whose fresh ledger holds exactly the record's rows, with its carried keys, for verifyA4Chain.
 * The schema comes from the migrations alone: no vault, no signing key and no foreign-key enforcement, so a record
 * missing its head or a gate still loads and fails verification instead.
 */
export function materializeA4Record(record: A4RecordV1): { workspace: string; cleanup: () => void } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-a4-record-"));
  const cleanup = (): void => rmSync(workspace, { recursive: true, force: true });
  try {
    writeKeys(workspace, record.publicKeys);
    const db = new Database(join(workspace, ".amc", "evidence.sqlite"));
    try {
      runMigrations(db);
      db.transaction(() => {
        insertRows(db, "evidence_events", record.evidence.events);
        insertRows(db, "sessions", record.evidence.sessions);
        for (const table of A4_RECORD_TABLES) insertRows(db, table, record.tables[table]);
      })();
    } finally {
      db.close();
    }
    return { workspace, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
