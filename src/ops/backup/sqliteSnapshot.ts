/**
 * WAL-safe copies of SQLite files for backups (P2-09). A byte copy of `evidence.sqlite` and its `-wal` taken while a
 * writer appends can pair a main file and a WAL from different moments. `VACUUM INTO` writes one transactionally
 * consistent database (committed WAL frames included) from a read transaction, and needs no lock on the writer.
 *
 * better-sqlite3's `db.backup()` is the other online-backup route, but it returns a Promise and `createBackup` is
 * synchronous; ADR 018 records the choice. The snapshot has no `-wal` or `-shm`, so those sidecars are not copied.
 */
import Database from "better-sqlite3";
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

const HEADER = Buffer.from("SQLite format 3\0", "binary");
const SIDECAR = /-(wal|shm|journal)$/;

function isSqliteFile(path: string): boolean {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(HEADER.length);
    return readSync(fd, head, 0, head.length, 0) === head.length && head.equals(HEADER);
  } finally {
    closeSync(fd);
  }
}

/** `files` without the WAL, shared-memory and journal sidecars of SQLite files that are themselves in `files`. */
export function withoutSqliteSidecars(files: string[]): string[] {
  const present = new Set(files);
  return files.filter((rel) => !(SIDECAR.test(rel) && present.has(rel.replace(SIDECAR, ""))));
}

/** A consistent snapshot of every SQLite database among `files` (workspace-relative), keyed by relative path. */
export function snapshotSqliteFiles(workspace: string, files: string[], tempDir: string): Map<string, { bytes: Buffer; mode: number }> {
  const snapshots = new Map<string, { bytes: Buffer; mode: number }>();
  for (const [index, rel] of files.entries()) {
    const source = join(workspace, rel);
    if (SIDECAR.test(rel) || !isSqliteFile(source)) continue;
    const dest = join(tempDir, `snapshot-${index}.sqlite`);
    const db = new Database(source, { readonly: true, fileMustExist: true });
    try {
      db.pragma("busy_timeout = 5000");
      db.prepare("VACUUM INTO ?").run(dest);
    } finally {
      db.close();
    }
    snapshots.set(rel, { bytes: readFileSync(dest), mode: statSync(source).mode & 0o777 });
  }
  return snapshots;
}
