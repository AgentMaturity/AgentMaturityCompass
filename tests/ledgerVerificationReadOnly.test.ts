import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { ensureSigningKeys } from "../src/crypto/keys.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { SqliteSessionEventStore } from "../src/persistence/sqliteSessionEventStore.js";
import { jsonlEventsPath } from "../src/persistence/jsonl/jsonlEventLog.js";
import { sha256Hex } from "../src/utils/hash.js";
import { decryptVaultPayload, encryptVaultPayload } from "../src/vault/vaultCrypto.js";
import { lockVault, vaultPaths } from "../src/vault/vault.js";

const roots: string[] = [];
function temporaryWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-readonly-verification-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    lockVault(root);
    rmSync(root, { recursive: true, force: true });
  }
});

function evidenceDiskState(workspace: string): Record<string, { sha256: string; mtimeMs: number; mode: number }> {
  const root = join(workspace, ".amc");
  return Object.fromEntries(readdirSync(root, { recursive: true }).map(String).sort().flatMap((relative) => {
    const path = join(root, relative);
    const stat = statSync(path);
    // SQLite can coordinate a live WAL through sidecars while reading.
    if (!stat.isFile() || /evidence\.sqlite-(wal|shm)$/.test(relative)) return [];
    return [[relative, { sha256: sha256Hex(readFileSync(path)), mtimeMs: stat.mtimeMs, mode: stat.mode }]];
  }));
}

function coldVerify(workspace: string, phrase: string | undefined) {
  const moduleUrl = pathToFileURL(resolve("src/ledger/ledger.ts")).href;
  const env = { ...process.env };
  if (phrase === undefined) delete env.AMC_VAULT_PASSPHRASE;
  else env.AMC_VAULT_PASSPHRASE = phrase;
  const result = spawnSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `import { verifyLedgerIntegrity } from ${JSON.stringify(moduleUrl)};
     const result = verifyLedgerIntegrity(process.argv[1]);
     console.log(JSON.stringify(result)); process.exit(result.ok ? 0 : 1);`,
    workspace
  ], { env, encoding: "utf8", timeout: 30_000 });
  expect(result.error, result.stderr).toBeUndefined();
  return { status: result.status, verdict: JSON.parse(result.stdout) as ReturnType<typeof verifyLedgerIntegrity> };
}

function encryptedWorkspace(): { workspace: string; phrase: string } {
  const workspace = temporaryWorkspace();
  const phrase = process.env.AMC_VAULT_PASSPHRASE ?? "amc-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "encrypted-proof", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
    const eventId = ledger.appendEvidence({ sessionId: "encrypted-proof", runtime: "unknown", eventType: "stdout", payload: "authenticated encrypted event", inline: false });
    expect(ledger.getAllEvents().find((event) => event.id === eventId)?.payload_path).toBeTruthy();
    ledger.sealSession("encrypted-proof");
  } finally {
    ledger.close();
    lockVault(workspace);
  }
  return { workspace, phrase };
}

test.each(["current", "legacy"] as const)("cold-process %s vault verification reads encrypted evidence without trust mutations", (format) => {
  const { workspace, phrase } = encryptedWorkspace();
  if (format === "legacy") {
    const path = vaultPaths(workspace).vaultFile;
    const payload = JSON.parse(decryptVaultPayload(JSON.parse(readFileSync(path, "utf8")), phrase).toString("utf8"));
    delete payload.leasePrivateKeyPem;
    delete payload.sessionPrivateKeyPem;
    writeFileSync(path, JSON.stringify(encryptVaultPayload(Buffer.from(JSON.stringify(payload)), phrase)));
  }
  const before = evidenceDiskState(workspace);
  const result = coldVerify(workspace, phrase);
  expect(result.verdict.errors).toEqual([]);
  expect(result.status).toBe(0);
  expect(evidenceDiskState(workspace)).toEqual(before);
});

test.each(["missing-passphrase", "wrong-passphrase", "missing-vault", "corrupt-vault"] as const)(
  "cold-process encrypted evidence fails closed for %s without modifying disk",
  (failure) => {
    const { workspace, phrase } = encryptedWorkspace();
    const path = vaultPaths(workspace).vaultFile;
    if (failure === "missing-vault") rmSync(path);
    if (failure === "corrupt-vault") writeFileSync(path, "corrupt vault");
    const before = evidenceDiskState(workspace);
    const result = coldVerify(workspace, failure === "missing-passphrase" ? undefined : failure === "wrong-passphrase" ? "wrong-readonly-passphrase" : phrase);
    expect(result.status).toBe(1);
    expect(result.verdict.ok).toBe(false);
    expect(result.verdict.chain.errors.join(" ")).toMatch(/payload authentication failed/);
    expect(evidenceDiskState(workspace)).toEqual(before);
  }
);

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
