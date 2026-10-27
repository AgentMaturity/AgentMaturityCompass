/** Internal read-only compatibility check shared by actual Ledger and minimal SQL readers. */
import type Database from "better-sqlite3";
import { hasTable } from "./ledgerSchema.js";

export function hasOptionalLegacyTable(db: Database.Database, table: "assurance_runs" | "outcome_events"): boolean {
  if (hasTable(db, table)) return true;
  const introducedVersion = table === "assurance_runs" ? 3 : 4;
  // A verifier cannot migrate a snapshot. Only a known, contiguous schema
  // prefix predating this table means it never existed; a missing table in
  // a current or unknown schema must not silently become an empty history.
  if (hasTable(db, "schema_migrations")) {
    const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all() as Array<{ version: number }>;
    if (
      versions.length > 0 &&
      versions.length < introducedVersion &&
      versions.every((row, index) => row.version === index + 1)
    ) return false;
  }
  throw new Error(`Ledger table ${table} is missing from an unknown or already-migrated schema`);
}
