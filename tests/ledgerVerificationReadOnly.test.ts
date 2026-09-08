import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { ensureSigningKeys } from "../src/crypto/keys.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { SqliteSessionEventStore } from "../src/persistence/sqliteSessionEventStore.js";
import { jsonlEventsPath } from "../src/persistence/jsonl/jsonlEventLog.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];
function temporaryWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-readonly-verification-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("public-only ledger verification preserves the supplied trust anchors without creating a vault", async () => {
  const source = temporaryWorkspace();
  initWorkspace({ workspacePath: source, trustBoundaryMode: "isolated" });
  const ledger = openLedger(source);
  const snapshot = temporaryWorkspace();
  mkdirSync(join(snapshot, ".amc"));
  cpSync(join(source, ".amc", "keys"), join(snapshot, ".amc", "keys"), { recursive: true });
  try {
    ledger.startSession({ sessionId: "public-proof", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
    ledger.appendEvidence({ sessionId: "public-proof", runtime: "unknown", eventType: "stdout", payload: "real signed event", inline: true });
    ledger.sealSession("public-proof");
    await ledger.db.backup(join(snapshot, ".amc", "evidence.sqlite"));
  } finally {
    ledger.close();
  }
  const keysDir = join(snapshot, ".amc", "keys");
  const keyBytes = () => Object.fromEntries(readdirSync(keysDir).sort().map((file) => [file, sha256Hex(readFileSync(join(keysDir, file)))]));
  const before = keyBytes();
  const result = verifyLedgerIntegrity(snapshot);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  expect(keyBytes()).toEqual(before);
  expect(existsSync(join(snapshot, ".amc", "vault.amcvault"))).toBe(false);
  expect(existsSync(join(snapshot, ".amc", "vault.amcvault.meta.json"))).toBe(false);
  const store = new SqliteSessionEventStore(snapshot, { readOnly: true });
  try {
    expect(store.readAllEvents().length).toBeGreaterThan(0);
    expect(keyBytes()).toEqual(before);
    expect(existsSync(join(snapshot, ".amc", "vault.amcvault"))).toBe(false);
  } finally {
    store.close();
  }
});

test("JSONL-only verification checks signed rows without creating a SQLite ledger", () => {
  const workspace = temporaryWorkspace();
  ensureSigningKeys(workspace);
  const store = openSessionEventStore(workspace, "jsonl");
  try {
    store.startSession({ sessionId: "jsonl-only", runtime: "amc", binaryPath: "test", binarySha256: "fixture" });
    store.appendSessionEvent({ sessionId: "jsonl-only", runtime: "amc", eventType: "user/message", meta: {}, payload: "signed local event" });
    store.sealSession("jsonl-only");
  } finally {
    store.close();
  }
  const sqlite = join(workspace, ".amc", "evidence.sqlite");
  expect(existsSync(sqlite)).toBe(false);
  expect(verifyLedgerIntegrity(workspace).chain.errors).toEqual([]);
  expect(existsSync(sqlite)).toBe(false);
  const events = jsonlEventsPath(workspace);
  const rows = readFileSync(events, "utf8").trim().split("\n");
  const row = JSON.parse(rows[0]!);
  row.payload_inline = "modified after signing";
  rows[0] = JSON.stringify(row);
  writeFileSync(events, rows.join("\n") + "\n");
  expect(verifyLedgerIntegrity(workspace).chain.ok).toBe(false);
  expect(existsSync(sqlite)).toBe(false);
});

test("a JSONL backend marker without its event log is not verified evidence", () => {
  const workspace = temporaryWorkspace();
  ensureSigningKeys(workspace);
  openSessionEventStore(workspace, "jsonl").close();
  rmSync(jsonlEventsPath(workspace));
  expect(existsSync(jsonlEventsPath(workspace))).toBe(false);
  const result = verifyLedgerIntegrity(workspace);
  expect(result.ok).toBe(false);
  expect(result.chain.errors.join(" ")).toMatch(/event log is missing/);
  expect(existsSync(join(workspace, ".amc", "evidence.sqlite"))).toBe(false);
});

test("verification cannot initialize a missing ledger into an apparently valid empty workspace", () => {
  const empty = temporaryWorkspace();
  const result = verifyLedgerIntegrity(empty);
  expect(result.ok).toBe(false);
  expect(result.chain.errors.join(" ")).toMatch(/ledger is missing/);
  expect(readdirSync(empty)).toEqual([]);
});
