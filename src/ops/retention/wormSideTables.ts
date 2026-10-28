/**
 * The ledger side-table segment a WORM export carries beside its retention segments (P2-36): every `a4_*` and
 * `action_*` row (LEDGER_SIDE_TABLES), column-exact as the SQLite ledger holds them, read in one snapshot. Retention
 * segments carry ledger rows only, so without this a WORM restore would hold A4's audit rows and none of the state they
 * attest. Its manifest names each table's row count and sha256 and the ledger head the snapshot was taken at; the
 * export's signed index names both objects by sha256, so the index signature covers them.
 *
 * The bytes are deterministic (no clock; the retain-until is part of them), so a re-export with unchanged rows uploads
 * nothing, and changed rows or a later retention make new objects rather than touching locked ones.
 * ponytail: each export stores a full snapshot; diff against the previous one if side tables grow large.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";
import { openLedger } from "../../ledger/ledger.js";
import { LEDGER_SIDE_TABLES } from "../../persistence/postgres/postgresLedgerSideTables.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

const cell = z.union([z.string(), z.number(), z.null()]);
const snapshotSchema = z.strictObject({
  v: z.literal(1), type: z.literal("amc.ledger-side-tables"), retainUntil: z.string().min(1), ledgerHeadEventHash: z.string().nullable(),
  tables: z.record(z.string(), z.array(z.record(z.string(), cell)))
});
const manifestSchema = z.strictObject({
  v: z.literal(1), type: z.literal("amc.ledger-side-tables-manifest"), snapshotSha256: z.string().length(64), retainUntil: z.string().min(1),
  ledgerHeadEventHash: z.string().nullable(), tables: z.record(z.string(), z.strictObject({ rows: z.number().int().min(0), sha256: z.string().length(64) }))
});

const tableDigest = (rows: unknown[]): string => sha256Hex(canonicalize(rows));

/**
 * The snapshot (gzip of canonical JSON) and its manifest, read from the workspace ledger in one read transaction.
 * `retainFor` maps the newest ledger row's ts (0 when empty) to the retain-until the objects get.
 */
export function sideTableSegment(workspace: string, retainFor: (headTs: number) => Date): { data: Buffer; manifest: Buffer; retainUntil: Date } {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const read = ledger.db.transaction(() => ({
      head: ledger.db.prepare("SELECT event_hash, ts FROM evidence_events ORDER BY rowid DESC LIMIT 1").get() as { event_hash: string; ts: number } | undefined,
      tables: Object.fromEntries(LEDGER_SIDE_TABLES.map((table) => [table.name,
        ledger.db.prepare(`SELECT ${Object.keys(table.columns).join(", ")} FROM ${table.name} ORDER BY rowid ASC`).all() as Record<string, string | number | null>[]]))
    }))();
    const retainUntil = retainFor(read.head?.ts ?? 0);
    const head = read.head?.event_hash ?? null;
    const snapshot = { v: 1 as const, type: "amc.ledger-side-tables" as const, retainUntil: retainUntil.toISOString(), ledgerHeadEventHash: head, tables: read.tables };
    const data = gzipSync(Buffer.from(canonicalize(snapshot), "utf8"));
    const manifest = { v: 1, type: "amc.ledger-side-tables-manifest", snapshotSha256: sha256Hex(data), retainUntil: snapshot.retainUntil,
      ledgerHeadEventHash: head, tables: Object.fromEntries(Object.entries(read.tables).map(([name, rows]) => [name, { rows: rows.length, sha256: tableDigest(rows) }])) };
    return { data, manifest: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"), retainUntil };
  } finally {
    ledger.close();
  }
}

/** Offline checks of a downloaded side-table segment: manifest shape, snapshot sha256, every declared table present and hashing as stated. */
export function verifySideTableSegment(data: Buffer, manifestBytes: Buffer, errors: string[]): void {
  try {
    const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    if (manifest.snapshotSha256 !== sha256Hex(data)) { errors.push("side tables: snapshot sha256 does not match its manifest"); return; }
    const snapshot = snapshotSchema.parse(JSON.parse(gunzipSync(data, { maxOutputLength: 256 * 1024 * 1024 }).toString("utf8")));
    if (snapshot.retainUntil !== manifest.retainUntil || snapshot.ledgerHeadEventHash !== manifest.ledgerHeadEventHash) {
      errors.push("side tables: snapshot and manifest name different retention or ledger heads");
    }
    for (const table of LEDGER_SIDE_TABLES) {
      const rows = snapshot.tables[table.name];
      const stated = manifest.tables[table.name];
      if (rows === undefined || stated === undefined) { errors.push(`side tables: ${table.name} is missing`); continue; }
      if (rows.length !== stated.rows || tableDigest(rows) !== stated.sha256) errors.push(`side tables: ${table.name} rows do not match the manifest`);
    }
  } catch {
    errors.push("side tables: unreadable");
  }
}
