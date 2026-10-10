/**
 * The `amc.a4-record/v1` export and the `.amcbundle` A4 slice, which carries one such record per project (P1-63; design
 * §14.5). A record holds an A4 project exactly as the ledger stored it: every side-table row, each transition's audit row
 * and every row a `ledger_event` ref names, so a verifier recomputes every `body_digest`, `binding_digest` and
 * `request_digest` from the exported bytes without a key.
 * Public keys travel only to locate a signer; a verifier admits them from its own pinned trust list. `synthetic_example`
 * refs are exported, retained and labelled (`containsSyntheticExamples`); `assertNotExample` never runs on an export.
 */
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { a4PreviewEnabled, type A4ProjectRow } from "../a4/a4Schema.js";
import { A4StoreError, readA4Store } from "../a4/a4Store.js";
import { A4_RECORD_TABLES, a4RecordV1Schema, type A4RecordV1 } from "../contracts/v1/a4Record.js";
import { eventMeta } from "../claims/evidenceProvenance.js";
import { verifyKeyHistoryEnvelope } from "../crypto/keyHistoryEnvelope.js";
import { getAuthenticatedKeyHistory, getPublicKeyHistory, getPublicKeyPem } from "../crypto/keys.js";
import { openLedger } from "../ledger/ledger.js";
import { hasTable, runMigrations } from "../ledger/ledgerSchema.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";

type Row = Record<string, string | number | null>;
type Tables = A4RecordV1["tables"];
export type A4RecordKeys = A4RecordV1["publicKeys"];
/** `a4/index.json`, which the signed manifest lists with every other file: each project's verified head as exported. */
export interface A4BundleSlice {
  schema: "amc.a4-bundle-slice/v1";
  projects: Array<{ projectId: string; headSeq: number; headDigest: string }>;
  containsSyntheticExamples: boolean;
}

const COLUMN = /^[a-z][a-z0-9_]*$/;
const marks = (count: number): string => Array.from({ length: count }, () => "?").join(",");

/** Inserts rows as given; a column name outside [a-z0-9_] is refused, never interpolated. */
function insertRows(db: Database.Database, table: string, rows: readonly Row[]): void {
  for (const row of rows) {
    const columns = Object.keys(row);
    if (!columns.every((column) => COLUMN.test(column))) throw new Error(`invalid column in ${table}`);
    db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${marks(columns.length)})`).run(...columns.map((column) => row[column]));
  }
}

function projectRows(db: Database.Database, projectId: string): Tables {
  return Object.fromEntries(A4_RECORD_TABLES.map((table) => [table,
    db.prepare(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY rowid`).all(projectId) as Row[]])) as Tables;
}

/** Each transition's audit row and each row a `ledger_event` ref names. */
const namedEventIds = (tables: Tables): string[] => [...new Set([...tables.a4_transitions.map((row) => String(row.evidence_event_id)),
  ...tables.a4_evidence_refs.filter((row) => row.ref_kind === "ledger_event").map((row) => String(row.ref_id))])];
export const syntheticIn = (tables: Tables): boolean => tables.a4_evidence_refs.some((row) => row.claim_kind === "synthetic_example");

/** One project as stored, for a verifier without SQLite. Reads only; signs nothing. */
export function readA4Record(db: Database.Database, projectId: string, keys: A4RecordKeys): A4RecordV1 {
  const tables = projectRows(db, projectId);
  const ids = namedEventIds(tables);
  const events = ids.length === 0 ? [] : db.prepare(`SELECT * FROM evidence_events WHERE id IN (${marks(ids.length)}) ORDER BY rowid`).all(...ids) as Row[];
  const sessionIds = [...new Set(events.map((row) => String(row.session_id)))];
  const sessions = sessionIds.length === 0 ? [] : db.prepare(`SELECT * FROM sessions WHERE session_id IN (${marks(sessionIds.length)}) ORDER BY started_ts, session_id`)
    .all(...sessionIds) as Row[];
  return { schema: "amc.a4-record/v1", projectId, containsSyntheticExamples: syntheticIn(tables), tables, evidence: { events, sessions }, publicKeys: keys };
}

/** The workspace's role keys, carried to locate signers only (a verifier admits them from its own pinned trust list). */
const workspaceKeys = (workspace: string): A4RecordKeys => {
  const key = (role: "monitor" | "auditor"): A4RecordKeys["monitor"] => {
    const history = getAuthenticatedKeyHistory(workspace, role);
    return { publicKeyPem: getPublicKeyPem(workspace, role), history: history === null ? null : { ...history } };
  };
  return { monitor: key("monitor"), auditor: key("auditor") };
};

/**
 * Every project any A4 row or audit session names, not only those with a head: a deleted head row (or project) must
 * fail, never read as a smaller set. Audit sessions are `a4-<projectId>-<seq>`.
 */
export const a4ProjectIds = (db: Database.Database): string[] => (db.prepare(`SELECT project_id AS id FROM a4_projects
  UNION SELECT project_id FROM a4_transitions UNION SELECT substr(session_id, 4, 36) FROM sessions WHERE session_id GLOB 'a4-a4p_*'
  UNION SELECT substr(session_id, 4, 36) FROM evidence_events WHERE session_id GLOB 'a4-a4p_*'`).all() as Array<{ id: string }>)
  .map((row) => row.id).filter((id) => /^a4p_[0-9a-f]{32}$/.test(id)).sort();

/** The agent named by the receipt a monitor key signed for the project's seq-0 audit session; null when none verifies. */
function receiptAgent(db: Database.Database, projectId: string, monitorKeys: string[]): string | null {
  const sessionId = `a4-${projectId}-0`;
  for (const event of db.prepare("SELECT meta_json FROM evidence_events WHERE session_id = ? ORDER BY rowid").all(sessionId) as Array<{ meta_json: string }>) {
    const receipt = eventMeta(event).receipt;
    const checked = typeof receipt === "string" ? verifyReceipt(receipt, monitorKeys) : null;
    if (checked?.ok === true && checked.payload?.session_id === sessionId) return checked.payload.agentId;
  }
  return null;
}

const refused = (projectId: string, problems: string[]): A4StoreError => new A4StoreError(409, "A4_INTEGRITY_FAILED",
  `A4 project ${projectId} does not verify (${problems.slice(0, 3).join("; ")}); the bundle is not exported.`, problems);

/**
 * The A4 slice of a run bundle (the one hook in `exportEvidenceBundle`; preview only, `AMC_A4_PREVIEW=1`): each A4
 * project of the bundle's agent as an `amc.a4-record/v1` file `a4/<projectId>.json`, and `a4/index.json` naming each
 * project's head, all listed in the signed manifest with every other file. A project is the agent's by the receipt
 * signed for its seq-0 audit row, never by the head row's unsigned `agent_id`; a project no receipt attributes is
 * verified as well. Each one is verified whole (`verifyChain`) and read in one read transaction, so the listed head is
 * the verified head of exactly the rows exported. A project that does not verify, has no head, or whose head row,
 * CREATED record and receipt name different agents refuses the export (A4_INTEGRITY_FAILED). The bundle's ledger is never
 * touched, so an agent with no A4 project, or a process without the preview flag, exports byte-for-byte what it did before.
 */
export function copyA4Slice<T>(input: { workspace: string; root: string; agentId: string; slice: T }): T {
  if (!a4PreviewEnabled()) return input.slice;
  const ledger = openLedger(input.workspace, { readonly: true });
  let exported: Array<{ head: A4ProjectRow; record: A4RecordV1 }>;
  try {
    if (!hasTable(ledger.db, "a4_projects")) return input.slice;
    const store = readA4Store(ledger);
    const keys = workspaceKeys(input.workspace);
    const monitorKeys = getPublicKeyHistory(input.workspace, "monitor");
    exported = ledger.db.transaction(() => a4ProjectIds(ledger.db).flatMap((projectId) => {
      const signed = receiptAgent(ledger.db, projectId, monitorKeys);
      if (signed !== null && signed !== input.agentId) return [];
      let head: A4ProjectRow | null;
      try {
        head = store.verifyChain(projectId);
      } catch (error) {
        throw refused(projectId, error instanceof A4StoreError && Array.isArray(error.detail) ? error.detail.map(String) : [error instanceof Error ? error.message : String(error)]);
      }
      if (head === null) throw refused(projectId, ["it has no head row"]);
      const record = a4RecordV1Schema.parse(readA4Record(ledger.db, projectId, keys));
      // The CREATED body is authenticated now that its chain verified.
      const created = (JSON.parse(String(record.tables.a4_transitions.find((row) => row.seq === 0)?.body_json ?? "{}")) as { agentId?: unknown }).agentId;
      if (head.agent_id !== created || (signed ?? created) !== created) throw refused(projectId, ["the head row, the CREATED record and its signed receipt name different agents"]);
      return created === input.agentId ? [{ head, record }] : [];
    }))();
  } finally {
    ledger.close();
  }
  if (exported.length === 0) return input.slice;
  ensureDir(join(input.root, "a4"));
  for (const { record } of exported) writeFileAtomic(join(input.root, "a4", `${record.projectId}.json`), JSON.stringify(record), 0o644);
  const index: A4BundleSlice = { schema: "amc.a4-bundle-slice/v1", containsSyntheticExamples: exported.some(({ record }) => record.containsSyntheticExamples),
    projects: exported.map(({ head }) => ({ projectId: head.project_id, headSeq: head.head_seq, headDigest: head.head_digest })) };
  writeFileAtomic(join(input.root, "a4", "index.json"), JSON.stringify(index, null, 2), 0o644);
  return input.slice;
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
 * The schema comes from the migrations alone: no vault and no signing key. Foreign keys are switched off (better-sqlite3
 * enforces them by default), so a record missing its head or a gate still loads and fails verification instead.
 */
export function materializeA4Record(record: A4RecordV1): { workspace: string; cleanup: () => void } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-a4-record-"));
  const cleanup = (): void => rmSync(workspace, { recursive: true, force: true });
  try {
    writeKeys(workspace, record.publicKeys);
    const db = new Database(join(workspace, ".amc", "evidence.sqlite"));
    try {
      runMigrations(db);
      db.pragma("foreign_keys = OFF");
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
