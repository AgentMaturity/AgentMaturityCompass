import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";
import { ensureSigningKeys } from "../src/crypto/keys.js";
import { readImportOriginal, retainImportOriginal, type ImportOriginalRef } from "../src/importers/importOriginals.js";
import { loadNeutralImportManifest, rollbackNeutralImport, runNeutralImport, validateNeutralImport } from "../src/importers/neutralImporter.js";
import { verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
import { initOpsPolicy, loadOpsPolicy, opsPolicyPath, signOpsPolicy, verifyOpsPolicySignature, type OpsPolicy } from "../src/ops/policy.js";
import { listStoredBlobs, verifyBlobIndexChain, verifyBlobIndexSignature } from "../src/storage/blobs/blobStore.js";
import { closeSqlitePool } from "../src/storage/sqlitePool.js";
import { lockVault, vaultStatus } from "../src/vault/vault.js";

// These are synthetic source claims. Genuine local vault encryption/signatures
// establish byte integrity, not harness truth, independent identity or maturity.
const REVISION = "c389f96bf3a9b6807cb71ed6bdad5849be0df6d8";
const OPT_OUT_LOSS = "Original bytes not retained by operator choice; only the SHA-256 digest is kept.";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Fixture = { root: string; workspace: string; inputPath: string };

function snapshot(root: string): Array<{ path: string; kind: string; sha256?: string; bytes?: number }> {
  if (!existsSync(root)) return [];
  const rows: ReturnType<typeof snapshot> = [];
  function walk(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name), name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { rows.push({ path: name, kind: "directory" }); walk(path, name); }
      else if (entry.isFile()) { const bytes = readFileSync(path); rows.push({ path: name, kind: "file", sha256: sha(bytes), bytes: bytes.length }); }
      else throw new Error(`Unexpected nonregular owned fixture member: ${name}`);
    }
  }
  walk(root, "");
  return rows;
}

function withFixture(body: (fixture: Fixture) => void): void {
  const root = mkdtempSync(join(tmpdir(), "amc-p124-originals-"));
  chmodSync(root, 0o700);
  const workspace = join(root, "workspace"), inputPath = join(root, "source"), home = join(root, "home");
  for (const path of [workspace, inputPath, home]) mkdirSync(path, { mode: 0o700 });
  const previous = Object.fromEntries(["HOME", "AMC_HOME", "AMC_VAULT_PASSPHRASE", "AMC_NO_SIGN"].map(key => [key, process.env[key]]));
  process.env.HOME = home;
  process.env.AMC_HOME = home;
  process.env.AMC_VAULT_PASSPHRASE = randomBytes(24).toString("base64");
  delete process.env.AMC_NO_SIGN;
  const errors: unknown[] = [];
  try {
    // Avoid initWorkspace: no ledger, checkpoint loop or service is required.
    ensureSigningKeys(workspace);
    initOpsPolicy(workspace);
    expect(vaultStatus(workspace)).toMatchObject({ exists: true, unlocked: true });
    expect(verifyOpsPolicySignature(workspace).valid).toBe(true);
    body({ root, workspace, inputPath });
  } catch (error) { errors.push(error); }
  // Close only an owned pool, if a future importer path creates one. Do not
  // close framework/other-test pools or delete a root before closure succeeds.
  try { closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`); } catch (error) { errors.push(error); }
  try { lockVault(workspace); } catch (error) { errors.push(error); }
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (errors.length) {
    console.error(`P124 retained owned original-byte fixture: ${root}`);
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, "Original-byte test body or owned cleanup failed");
  }
  rmSync(root, { recursive: true });
}

function policy(workspace: string, change: (value: OpsPolicy) => void): void {
  const value = loadOpsPolicy(workspace);
  change(value);
  writeFileSync(opsPolicyPath(workspace), YAML.stringify(value), { mode: 0o600 });
  signOpsPolicy(workspace);
  expect(verifyOpsPolicySignature(workspace).valid).toBe(true);
}

function sourceFile(inputPath: string, name = "agent.json", padding = ""): Buffer {
  const raw = Buffer.from(`{ "agent": {"id":"synthetic-p124"}, "padding":${JSON.stringify(padding)} }\r\n`, "utf8");
  writeFileSync(join(inputPath, name), raw, { mode: 0o600 });
  return raw;
}

function encrypted(ref: ImportOriginalRef): Extract<ImportOriginalRef["storage"], { kind: "encrypted-blob" }> {
  expect(ref.storage.kind).toBe("encrypted-blob");
  if (ref.storage.kind !== "encrypted-blob") throw new Error("Expected a genuine retained encrypted original");
  return ref.storage;
}

describe("P1-24 encrypted exact import originals", () => {
  test("reads back exact binary bytes with independent SHA and genuine vaulted encryption", () => withFixture(({ workspace }) => {
    const raw = Buffer.concat([Buffer.from([0, 255, 239, 187, 191]), Buffer.from("synthetic original\r\nΔ\t ", "utf8")]);
    const source = { format: "dsh-session", version: 2, sourceRevision: REVISION };
    const ref = retainImportOriginal(workspace, raw, source, "application/x-ndjson");
    expect(ref).toMatchObject({ sha256: sha(raw), bytes: raw.length, mediaType: "application/x-ndjson", source });
    const storage = encrypted(ref), ciphertext = readFileSync(join(workspace, storage.path));
    expect(storage.keyVersion).toBeGreaterThan(0);
    expect(ciphertext.equals(raw)).toBe(false);
    expect(ciphertext.includes(Buffer.from("synthetic original"))).toBe(false);
    expect(statSync(join(workspace, storage.path)).mode & 0o777).toBe(0o600);
    expect(readImportOriginal(workspace, ref)).toEqual(raw);
    expect(sha(readImportOriginal(workspace, ref))).toBe(sha(raw));
    expect(verifyBlobIndexSignature(workspace).valid).toBe(true);
    expect(verifyBlobIndexChain(workspace).ok).toBe(true);
  }));

  test("refuses a valid equal-length encrypted payload whose reference SHA names different bytes", () => withFixture(({ workspace }) => {
    const first = Buffer.from("synthetic-payload-A"), second = Buffer.from("synthetic-payload-B");
    expect(first.length).toBe(second.length);
    expect(sha(first)).not.toBe(sha(second));
    const a = retainImportOriginal(workspace, first, null, "application/octet-stream");
    const b = retainImportOriginal(workspace, second, null, "application/octet-stream");
    expect(readImportOriginal(workspace, a)).toEqual(first);
    expect(readImportOriginal(workspace, b)).toEqual(second);
    const substituted: ImportOriginalRef = { ...b, sha256: a.sha256, bytes: a.bytes };
    const before = snapshot(workspace);
    // Both real AES-GCM envelopes and their own payload hashes are valid.
    // Only the post-decryption comparison against the supplied reference fails.
    expect(() => readImportOriginal(workspace, substituted)).toThrow(/IMPORT_ORIGINAL_DIGEST_MISMATCH/);
    expect(snapshot(workspace)).toEqual(before);
  }));

  test("also refuses authenticated-decryption failure without changing the altered owned blob", () => withFixture(({ workspace }) => {
    const ref = retainImportOriginal(workspace, Buffer.from("synthetic ciphertext tamper"), null, "application/octet-stream");
    const path = join(workspace, encrypted(ref).path), changed = Buffer.from(readFileSync(path));
    changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
    writeFileSync(path, changed);
    expect(() => readImportOriginal(workspace, ref)).toThrow(/IMPORT_ORIGINAL_DIGEST_MISMATCH/);
    expect(readFileSync(path)).toEqual(changed);
  }));

  test("deduplicates repeated exact bytes to one verified blob and one originals-index row", () => withFixture(({ workspace }) => {
    const raw = Buffer.from("same synthetic original\r\n");
    const first = retainImportOriginal(workspace, raw, { format: "json", version: null, sourceRevision: null }, "application/json");
    const second = retainImportOriginal(workspace, Buffer.from(raw), { format: "json", version: null, sourceRevision: null }, "application/json");
    expect(second.storage).toEqual(first.storage);
    expect(listStoredBlobs(workspace)).toHaveLength(1);
    expect(readFileSync(join(workspace, ".amc", "imports", "originals.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
    expect(readImportOriginal(workspace, second)).toEqual(raw);
    expect(verifyBlobIndexChain(workspace).rows).toBe(1);
    expect(verifyBlobIndexSignature(workspace).valid).toBe(true);
  }));

  test("refuses encryption-off retention for the whole import before any workspace write", () => withFixture(({ workspace, inputPath }) => {
    sourceFile(inputPath);
    policy(workspace, value => { value.opsPolicy.encryption.blobEncryptionEnabled = false; });
    const before = snapshot(workspace);
    expect(() => runNeutralImport({ workspace, inputPath, mode: "import" })).toThrow(/IMPORT_ORIGINAL_NOT_RETAINABLE:.*blob encryption is disabled.*retention\.maxBlobBytes.*--no-retain-original/);
    expect(snapshot(workspace)).toEqual(before);
    expect(existsSync(join(workspace, ".amc", "imports"))).toBe(false);
    expect(listStoredBlobs(workspace)).toEqual([]);
  }));

  test("preflights every candidate so an over-limit second original leaves no first blob or import", () => withFixture(({ workspace, inputPath }) => {
    const small = sourceFile(inputPath, "a-small.json");
    sourceFile(inputPath, "b-large.json", "synthetic padding".repeat(32));
    policy(workspace, value => { value.opsPolicy.retention.maxBlobBytes = small.length; });
    expect(validateNeutralImport({ workspace, inputPath }).candidateCount).toBe(2);
    const before = snapshot(workspace);
    expect(() => runNeutralImport({ workspace, inputPath, mode: "import" })).toThrow(/IMPORT_ORIGINAL_NOT_RETAINABLE:.*exceeds retention\.maxBlobBytes.*--no-retain-original/);
    expect(snapshot(workspace)).toEqual(before);
    expect(existsSync(join(workspace, ".amc", "imports"))).toBe(false);
    expect(listStoredBlobs(workspace)).toEqual([]);
  }));

  test.each(["dry-run", "validate"] as const)("%s lists retained-original writes without writing or minting a blob key", mode => withFixture(({ workspace, inputPath }) => {
    sourceFile(inputPath);
    const before = snapshot(workspace), result = runNeutralImport({ workspace, inputPath, mode });
    expect(result.applied).toBe(false);
    expect(result.plan.status).toBe("ready");
    expect(result.originals).toEqual([]);
    expect(result.writtenPaths).toEqual([]);
    expect(result.plan.wouldWrite).toContain(".amc/imports/originals.jsonl");
    expect(result.plan.wouldWrite).toContain(".amc/blobs");
    expect(snapshot(workspace)).toEqual(before);
    expect(existsSync(join(workspace, ".amc", "blob-keys"))).toBe(false);
  }));

  test("whole-import operator opt-out records non-retention and its exact loss even when retention is impossible", () => withFixture(({ workspace, inputPath }) => {
    const raw = sourceFile(inputPath);
    policy(workspace, value => { value.opsPolicy.encryption.blobEncryptionEnabled = false; value.opsPolicy.retention.maxBlobBytes = 8; });
    const result = runNeutralImport({ workspace, inputPath, mode: "import", retainOriginals: false });
    expect(result.applied).toBe(true);
    expect(result.originals).toEqual([{ sha256: sha(raw), bytes: raw.length, mediaType: "application/json", source: { format: "json", version: null, sourceRevision: null }, storage: { kind: "not-retained", reason: "operator-opt-out" } }]);
    expect(loadNeutralImportManifest({ workspace, importId: result.importId }).originals).toEqual(result.originals);
    expect(result.plan.normalization?.losses).toContain(OPT_OUT_LOSS);
    expect(result.plan.wouldWrite).not.toContain(".amc/imports/originals.jsonl");
    expect(existsSync(join(workspace, ".amc", "imports", "originals.jsonl"))).toBe(false);
    expect(listStoredBlobs(workspace)).toEqual([]);
    expect(() => readImportOriginal(workspace, result.originals[0]!)).toThrow(/Original bytes were not retained \(operator-opt-out\)/);
  }));

  test("manifest and map/2 bind originals, known DSH revision, explicit unknown Pi revision and stage losses without trust promotion", () => withFixture(({ workspace, inputPath }) => {
    const dsh = [
      { type: "session", version: 2, id: "synthetic-dsh-v2", createdAt: 1000, isSeeded: false, delegationDepth: 0 },
      { type: "turn/start", seq: 0, time: 1001, data: { turn: 0 } },
      { type: "session/title", seq: 1, time: 1002, data: { title: "synthetic", password: "synthetic-private-source-value" } },
      { type: "turn/end", seq: 2, time: 1003, data: { turn: 0, reason: { kind: "completed" } } }
    ];
    const pi = [
      { type: "session", version: 3, id: "synthetic-pi-v3", timestamp: "2026-09-08T00:00:00.000Z", cwd: "/synthetic" },
      { type: "message", id: "a", parentId: null, timestamp: "2026-09-08T00:00:01.000Z", message: { role: "assistant", content: [{ type: "text", text: "synthetic answer" }], stopReason: "stop" } }
    ];
    const raw = [Buffer.from(dsh.map(row => JSON.stringify(row)).join("\r\n") + "\r\n"), Buffer.from(pi.map(row => JSON.stringify(row)).join("\n") + "\n")];
    ["a-dsh.jsonl", "b-pi.jsonl"].forEach((name, index) => writeFileSync(join(inputPath, name), raw[index]!));
    const result = runNeutralImport({ workspace, inputPath, mode: "import" });
    const manifest = loadNeutralImportManifest({ workspace, importId: result.importId });
    expect(manifest.originals).toEqual(result.originals);
    expect(result.originals).toHaveLength(2);
    expect(result.originals.map(ref => ref.source)).toEqual([{ format: "dsh-session", version: 2, sourceRevision: REVISION }, { format: "pi-session", version: 3, sourceRevision: null }]);
    result.originals.forEach((ref, index) => { expect(ref.sha256).toBe(sha(raw[index]!)); expect(ref.bytes).toBe(raw[index]!.length); expect(readImportOriginal(workspace, ref)).toEqual(raw[index]); });
    const map = result.plan.normalization!.recordMapping!;
    expect(map.schemaVersion).toBe("amc-record-map/2");
    expect(map.sources).toEqual([
      expect.objectContaining({ path: "a-dsh.jsonl", format: "dsh-session", version: 2, sourceRevision: REVISION, originalSha256: sha(raw[0]!), digest: sha(raw[0]!) }),
      expect.objectContaining({ path: "b-pi.jsonl", format: "pi-session", version: 3, sourceRevision: null, originalSha256: sha(raw[1]!), digest: sha(raw[1]!) })
    ]);
    expect([...new Set(map.losses.map(loss => loss.stage))].sort()).toEqual(["external-evidence", "projection", "redaction"]);
    expect(result.plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED" });
    const report = JSON.parse(readFileSync(result.diagnosticReportPath!, "utf8"));
    expect(report).toMatchObject({ status: "UNSIGNED", verificationPassed: false, evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 1 }, importProvenance: { evaluationPerformed: false, sourceTrustTier: "SELF_REPORTED" }, questionScores: [], layerScores: [] });
    expect(verifyArtifactFileSignature({ workspace, path: result.normalizedPath!, artifactKind: "neutral-import-artifact", requireDomainSeparated: true }).valid).toBe(true);
    expect(readFileSync(result.normalizedPath!, "utf8")).not.toContain("synthetic-private-source-value");
    for (const path of result.externalEvidencePaths!) {
      const profile = JSON.parse(readFileSync(path, "utf8"));
      expect(profile).toMatchObject({ profile: "amc.external-evidence", version: 1, provenance: { trustTier: "SELF_REPORTED", captureMethod: "import" } });
      expect(result.originals.map(ref => ref.sha256)).toContain(profile.source.originalSha256);
      expect(profile.source).not.toHaveProperty("sourceRevision");
    }
  }));

  test("rollback removes import outputs but preserves exact original blobs and their index", () => withFixture(({ workspace, inputPath }) => {
    const raw = sourceFile(inputPath), imported = runNeutralImport({ workspace, inputPath, mode: "import" });
    const blobs = snapshot(join(workspace, ".amc", "blobs"));
    const index = readFileSync(join(workspace, ".amc", "imports", "originals.jsonl"));
    const rollback = rollbackNeutralImport({ workspace, importId: imported.importId });
    expect(rollback.removed).toContainEqual({ path: imported.normalizedPath, status: "removed" });
    expect(existsSync(imported.importManifestPath!)).toBe(false);
    expect(existsSync(rollback.receiptPath)).toBe(true);
    expect(rollback.originalsKept).toBe("Retained original bytes are kept; retention policy, not rollback, governs their deletion.");
    expect(snapshot(join(workspace, ".amc", "blobs"))).toEqual(blobs);
    expect(readFileSync(join(workspace, ".amc", "imports", "originals.jsonl"))).toEqual(index);
    expect(readImportOriginal(workspace, imported.originals[0]!)).toEqual(raw);
  }));

  test("retains a recognized session above the generic cap when the signed blob policy allows it", () => withFixture(({ workspace, inputPath }) => {
    policy(workspace, value => { value.opsPolicy.retention.maxBlobBytes = 2_000_000; });
    const raw = Buffer.from([
      JSON.stringify({ type: "session", version: 2, id: "synthetic-large-dsh", createdAt: 1000, isSeeded: false, delegationDepth: 0 }),
      JSON.stringify({ type: "session/title", seq: 0, time: 1001, data: { title: "x".repeat(1_500_050) } })
    ].join("\n") + "\n");
    writeFileSync(join(inputPath, "large.jsonl"), raw);
    expect(raw.length).toBeGreaterThan(1_500_000);
    expect(raw.length).toBeLessThan(2_000_000);
    const result = runNeutralImport({ workspace, inputPath, mode: "import" });
    expect(result.plan.candidates[0]?.sourceFormat).toMatchObject({ name: "dsh-session", version: 2 });
    expect(result.originals[0]?.sha256).toBe(sha(raw));
    expect(readImportOriginal(workspace, result.originals[0]!)).toEqual(raw);
  }));

  test("keeps the generic 1.5 MB cap even when blob retention allows a larger file", () => withFixture(({ workspace, inputPath }) => {
    policy(workspace, value => { value.opsPolicy.retention.maxBlobBytes = 2_000_000; });
    sourceFile(inputPath, "generic.json", "x".repeat(1_500_050));
    const before = snapshot(workspace), plan = validateNeutralImport({ workspace, inputPath });
    expect(plan.status).toBe("unsupported");
    expect(plan.candidates).toEqual([]);
    expect(plan.unsupported).toHaveLength(1);
    expect(plan.unsupported[0]).toMatchObject({ kind: "oversized", reason: "File is larger than 1500000 bytes; split it into smaller JSON, JSONL, or YAML artifacts." });
    expect(() => runNeutralImport({ workspace, inputPath, mode: "import" })).toThrow(/Unsupported import/);
    expect(snapshot(workspace)).toEqual(before);
  }));
});
