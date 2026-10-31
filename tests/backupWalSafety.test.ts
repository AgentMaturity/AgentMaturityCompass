/**
 * P2-09 WAL-safe backups: a backup taken while another process appends restores to a database that passes
 * `PRAGMA integrity_check` and chain verification, because SQLite files are captured as one consistent snapshot.
 */
import Database from "better-sqlite3";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { createBackup } from "../src/ops/backup/backupEngine.js";
import { decryptBackupPayload } from "../src/ops/backup/backupCrypto.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { extractValidatedTarGzipArchive } from "../src/security/safeTarArchive.js";
import { withoutSqliteSidecars } from "../src/ops/backup/sqliteSnapshot.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const BACKUP_PASS = "wal-safety-backup-passphrase";
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) { lockVault(join(root, "ws")); rmSync(root, { recursive: true, force: true }); }
});

const APPENDER = `
  import { openLedger } from ${JSON.stringify(pathToFileURL(resolve("src/ledger/ledger.ts")).href)};
  const [workspace, ms] = process.argv.slice(1);
  const ledger = openLedger(workspace);
  ledger.startSession({ sessionId: "concurrent", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
  const end = Date.now() + Number(ms);
  let n = 0;
  while (Date.now() < end) {
    ledger.appendEvidence({ sessionId: "concurrent", runtime: "unknown", eventType: "stdout", payload: "row " + n + " " + "x".repeat(3000), inline: true });
    if (++n === 40) console.log("ready");
  }
  ledger.close();
  console.log("done " + n);
`;

it("restores a database that passes integrity_check and chain verification after a backup during appends", async () => {
  const root = mkdtempSync(join(tmpdir(), "amc-wal-safety-"));
  roots.push(root);
  const workspace = join(root, "ws");
  mkdirSync(workspace);
  vi.stubEnv("AMC_BACKUP_PASSPHRASE", BACKUP_PASS);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });

  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", APPENDER, workspace, "6000"], { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  const exited = new Promise<number | null>((done) => child.on("exit", done));
  await new Promise<void>((ready, fail) => {
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); if (out.includes("ready")) ready(); });
    child.on("exit", () => fail(new Error(`appender exited early: ${out}`)));
  });
  const created = createBackup({ workspace, outFile: join(root, "during-appends.amcbackup") });
  expect(await exited).toBe(0);
  expect(out).toMatch(/done \d+/);

  const unpacked = join(root, "unpacked");
  mkdirSync(unpacked);
  extractValidatedTarGzipArchive({ file: created.outFile, destination: unpacked, label: "wal safety backup", limits: { maxEntries: 10_000,
    maxCompressedBytes: 512 * 1024 * 1024, maxEntryBytes: 512 * 1024 * 1024, maxTotalBytes: 1024 * 1024 * 1024, maxPathBytes: 1024 } });
  const manifest = JSON.parse(readFileSync(join(unpacked, "manifest.json"), "utf8"));
  expect(manifest.files.map((file: { path: string }) => file.path).filter((path: string) => /evidence\.sqlite-(wal|shm)$/.test(path))).toEqual([]);
  const plain = decryptBackupPayload({ encrypted: readFileSync(join(unpacked, "payload", "workspace.tar.gz.enc")), passphrase: BACKUP_PASS, envelope: manifest.payload.encryption });
  const restored = join(root, "restored");
  mkdirSync(restored);
  writeFileSync(join(root, "payload.tar.gz"), plain);
  expect(spawnSync("tar", ["-xzf", join(root, "payload.tar.gz"), "-C", restored]).status).toBe(0);

  const db = new Database(join(restored, ".amc", "evidence.sqlite"), { readonly: true });
  try {
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
    expect((db.prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE session_id = 'concurrent'").get() as { n: number }).n).toBeGreaterThanOrEqual(40);
  } finally {
    db.close();
  }
  const chain = verifyLedgerIntegrity(restored).chain.errors.filter((error) => /hash mismatch|signature invalid|payload/.test(error));
  expect(chain).toEqual([]);
}, 120_000);

it("drops only the sidecars of SQLite files that are themselves backed up", () => {
  expect(withoutSqliteSidecars([".amc/evidence.sqlite", ".amc/evidence.sqlite-wal", ".amc/evidence.sqlite-shm", ".amc/orphan.sqlite-wal", ".amc/notes-wal"]))
    .toEqual([".amc/evidence.sqlite", ".amc/orphan.sqlite-wal", ".amc/notes-wal"]);
});
