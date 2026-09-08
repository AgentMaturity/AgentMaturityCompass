import Database from "better-sqlite3";
import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { canonicalMetadataForHash } from "../src/ledger/eventHash.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function legacySnapshot(versions: number[]): { workspace: string; path: string } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-legacy-reader-"));
  roots.push(workspace);
  const keys = join(workspace, ".amc", "keys");
  mkdirSync(keys, { recursive: true });
  const monitor = generateKeyPairSync("ed25519");
  const auditor = generateKeyPairSync("ed25519");
  writeFileSync(join(keys, "monitor_ed25519.pub"), monitor.publicKey.export({ format: "pem", type: "spki" }));
  writeFileSync(join(keys, "auditor_ed25519.pub"), auditor.publicKey.export({ format: "pem", type: "spki" }));
  const path = join(workspace, ".amc", "evidence.sqlite");
  const db = new Database(path);
  // The original v1 tables, before assurance (v3), outcomes (v4), and the
  // canonical payload/retention columns (v5) existed.
  db.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_ts INTEGER NOT NULL);
    CREATE TABLE evidence_events (
      id TEXT PRIMARY KEY, ts INTEGER, session_id TEXT, runtime TEXT, event_type TEXT,
      payload_path TEXT, payload_inline TEXT, payload_sha256 TEXT, meta_json TEXT,
      prev_event_hash TEXT, event_hash TEXT, writer_sig TEXT
    );
    CREATE TABLE sessions (
      session_id TEXT PRIMARY KEY, started_ts INTEGER, ended_ts INTEGER, runtime TEXT,
      binary_path TEXT, binary_sha256 TEXT, session_final_event_hash TEXT, session_seal_sig TEXT
    );
    CREATE TABLE runs (run_id TEXT PRIMARY KEY, ts INTEGER, report_json_sha256 TEXT, run_seal_sig TEXT);
  `);
  for (const version of versions) db.prepare("INSERT INTO schema_migrations VALUES (?, 1)").run(version);
  const payload = "signed before optional tables existed";
  const payloadHash = sha256Hex(payload);
  const canonical = canonicalMetadataForHash({
    id: "old-event", ts: 1, sessionId: "old-session", runtime: "unknown", eventType: "stdout",
    payloadPath: null, payloadInline: payload, metaJson: "{}"
  });
  const hash = sha256Hex(`GENESIS${canonical}${payloadHash}`);
  const signature = sign(null, Buffer.from(hash, "hex"), monitor.privateKey).toString("base64");
  db.prepare("INSERT INTO evidence_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("old-event", 1, "old-session", "unknown", "stdout", null, payload, payloadHash, "{}", "GENESIS", hash, signature);
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("old-session", 1, 2, "unknown", "legacy-binary", "old-hash", hash, signature);
  db.close();
  return { workspace, path };
}

describe("read-only verification of legacy ledger schemas", () => {
  test.each([{ versions: [1] }, { versions: [1, 2] }])("verifies signed schema prefix $versions without adding later tables", ({ versions }) => {
    const { workspace, path } = legacySnapshot(versions);
    const before = readFileSync(path);
    const result = verifyLedgerIntegrity(workspace);
    expect(result.ok, result.errors.join("; ")).toBe(true);
    expect(readFileSync(path)).toEqual(before);
    expect(existsSync(join(workspace, ".amc", "vault.amcvault"))).toBe(false);
    const ledger = openLedger(workspace, { readonly: true });
    try {
      expect(ledger.getAllEvents()).toHaveLength(1);
      expect(ledger.getAllAssuranceRuns()).toEqual([]);
      expect(ledger.getAllOutcomeEvents()).toEqual([]);
      expect(ledger.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('assurance_runs', 'outcome_events')").all()).toEqual([]);
    } finally { ledger.close(); }
  });

  test("reads existing optional-table records even with older migration metadata", () => {
    const { workspace, path } = legacySnapshot([1, 2]);
    const db = new Database(path);
    db.exec("CREATE TABLE assurance_runs (assurance_run_id TEXT, ts INTEGER); INSERT INTO assurance_runs VALUES ('backported-record', 1)");
    db.close();
    const ledger = openLedger(workspace, { readonly: true });
    try {
      expect(ledger.getAllAssuranceRuns()).toEqual([{ assurance_run_id: "backported-record", ts: 1 }]);
      expect(ledger.getAllOutcomeEvents()).toEqual([]);
    } finally { ledger.close(); }
  });

  test("does not infer an empty history when schema migration metadata is absent", () => {
    const { workspace, path } = legacySnapshot([1, 2]);
    const db = new Database(path);
    db.exec("DROP TABLE schema_migrations");
    db.close();
    const before = readFileSync(path);
    const ledger = openLedger(workspace, { readonly: true });
    try {
      expect(() => ledger.getAllAssuranceRuns()).toThrow();
      expect(() => ledger.getAllOutcomeEvents()).toThrow();
    } finally { ledger.close(); }
    expect(readFileSync(path)).toEqual(before);
  });

  test.each([
    { versions: [1, 2, 3], table: "assurance_runs" },
    { versions: [1, 2, 3, 4], table: "outcome_events" },
    { versions: Array.from({ length: 11 }, (_, index) => index + 1), table: "assurance_runs" },
    { versions: Array.from({ length: 11 }, (_, index) => index + 1), table: "outcome_events" },
    { versions: [], table: "assurance_runs" },
    { versions: [], table: "outcome_events" },
    { versions: [1, 3], table: "outcome_events" }
  ])("rejects absent $table for unknown, gapped or already-introduced schemas $versions", ({ versions, table }) => {
    const { workspace, path } = legacySnapshot(versions);
    const before = readFileSync(path);
    const ledger = openLedger(workspace, { readonly: true });
    try {
      expect(() => table === "assurance_runs" ? ledger.getAllAssuranceRuns() : ledger.getAllOutcomeEvents()).toThrow();
    } finally { ledger.close(); }
    expect(readFileSync(path)).toEqual(before);
  });
});
