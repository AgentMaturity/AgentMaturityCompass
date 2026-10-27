import { sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { canonicalMetadataForHash, openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../../src/ops/policy.js";
import { runRetention, runRetentionAsync, verifyRetention } from "../../src/ops/retention/retentionEngine.js";
import { appendPrunedRow, readPrunedRows, verifyPrunedRows, writeRetentionSegment } from "../../src/ops/retention/retentionArchive.js";
import { loadBlobPlaintext } from "../../src/storage/blobs/blobStore.js";
import { decodeBlobV1, decryptBlobV1, encodeBlobV1, encryptBlobV1 } from "../../src/storage/blobs/blobEncryptor.js";
import { readBlobKeyMaterial } from "../../src/storage/blobs/blobKeys.js";
import { lockVault } from "../../src/vault/vault.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { closeGuardDb } from "../../src/enforce/evidenceEmitter.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { EvidenceEvent } from "../../src/types.js";

const io = vi.hoisted(() => ({ afterLstat: null as ((path: string) => void) | null, beforeUnlink: null as ((path: string) => void) | null }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, unlinkSync: ((path: Parameters<typeof actual.unlinkSync>[0]) => {
    io.beforeUnlink?.(String(path)); return actual.unlinkSync(path);
  }) as typeof actual.unlinkSync, lstatSync: ((...args: Parameters<typeof actual.lstatSync>) => {
    const stat = actual.lstatSync(...args); io.afterLstat?.(String(args[0])); return stat;
  }) as typeof actual.lstatSync };
});
const PASS = "owned-contained-retention-passphrase", DAY = 86_400_000;
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  io.afterLstat = null; io.beforeUnlink = null; vi.restoreAllMocks(); closeGuardDb();
  for (const f of roots.splice(0)) {
    closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc/evidence.sqlite")}`);
    lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
function fixture(legacyId?: string, plaintext = Buffer.from("owned genuine retained object")) {
  const root = mkdtempSync(join(tmpdir(), "amc-retention-contained-")), workspace = join(root, "workspace");
  roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const policy = loadOpsPolicy(workspace); policy.opsPolicy.maintenance.autoVacuumOnRetention = false;
  writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy)); signOpsPolicy(workspace);
  const ledger = openLedger(workspace), ts = Date.now() - 20 * DAY; let original!: EvidenceEvent;
  try {
    ledger.startSession({ sessionId: "managed", runtime: "unknown", binaryPath: "owned", binarySha256: "owned" });
    if (legacyId === undefined) {
      ledger.appendEvidenceDetailed({ id: "managed-target", ts, sessionId: "managed", runtime: "unknown", eventType: "stdout",
        payload: plaintext, payloadExt: "txt", inline: false, meta: {} });
      original = ledger.getAllEvents().find(row => row.id === "managed-target")!;
    } else {
      // This is an explicitly controlled legacy-reference fixture, not a claim about an executed old migration.
      // The actual current canonical row and seal signatures are genuine. No protected row is rewritten.
      ledger.appendEvidence({ id: "managed-seed", sessionId: "managed", runtime: "unknown", eventType: "stdout", payload: "owned seed", inline: true });
      const seed = ledger.getAllEvents().find(row => row.id === "managed-seed")!, relativePath = `.amc/blobs/${legacyId}.blob`;
      const target = join(workspace, relativePath); expect(target.startsWith(root + sep)).toBe(true);
      mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, plaintext);
      original = { ...seed, id: "managed-target", ts, payload_path: relativePath, payload_inline: null, payload_sha256: sha256Hex(plaintext),
        canonical_payload_path: relativePath, canonical_payload_inline: null, blob_ref: legacyId, prev_event_hash: seed.event_hash };
      const metadata = canonicalMetadataForHash({ id: original.id, ts, sessionId: original.session_id, runtime: original.runtime,
        eventType: original.event_type, payloadPath: relativePath, payloadInline: null, metaJson: original.meta_json });
      original.event_hash = sha256Hex(`${original.prev_event_hash}${metadata}${original.payload_sha256}`);
      original.writer_sig = sign(null, Buffer.from(original.event_hash, "hex"), getSigningKey(workspace, "ledger-row")).toString("base64");
      const columns = Object.keys(original);
      ledger.db.prepare(`INSERT INTO evidence_events (${columns.join(",")}) VALUES (${columns.map(name => `@${name}`).join(",")})`).run(original);
    }
    ledger.sealSession("managed");
  } finally { ledger.close(); }
  const segment = writeRetentionSegment({ workspace, segmentId: "seg_managed_existing", startTs: original.ts, endTs: original.ts,
    eventLines: [JSON.stringify(original)], firstEventHash: original.event_hash, lastEventHash: original.event_hash, prevSegmentLastEventHash: null,
    prunePolicy: { archivePayloadsAfterDays: 7, prunePayloadsAfterDays: 14 } });
  const selected = openLedger(workspace);
  try {
    selected.markEventsArchived([original.id], "seg_managed_existing", sha256Hex(readFileSync(segment.manifestPath)));
    selected.pruneEventPayloadColumns([original.id], Date.now());
  } finally { selected.close(); }
  const file = join(workspace, original.canonical_payload_path!), stored = readFileSync(file);
  expect(verify(null, Buffer.from(original.event_hash, "hex"), getSigningPublicKeyPem(workspace, "ledger-row"),
    Buffer.from(original.writer_sig, "base64"))).toBe(true);
  return { root, workspace, original, plaintext, file, stored, blobId: original.blob_ref!, provider: loadKeyProvider(workspace, "file") };
}
type Fixture = ReturnType<typeof fixture>;
function row(f: Fixture) {
  const ledger = openLedger(f.workspace);
  try { return ledger.getAllEvents().find(item => item.id === f.original.id)!; } finally { ledger.close(); }
}
function hasSkippedAudit(f: Fixture) {
  const ledger = openLedger(f.workspace);
  try { return ledger.getAllEvents().some(event => JSON.parse(event.meta_json).auditType === "RETENTION_BLOB_DELETE_SKIPPED"); }
  finally { ledger.close(); }
}
function optionalBytes(path: string): Buffer | null { return existsSync(path) ? readFileSync(path) : null; }
function prunePair(f: Fixture) {
  return ["pruned.jsonl", "pruned.jsonl.sig"].map(name => optionalBytes(join(f.workspace, ".amc", "blobs", name)));
}
function outside(f: Fixture) {
  const dir = join(f.workspace, ".amc", "blobs"), sibling = join(f.root, "outside-managed-blobs");
  renameSync(dir, sibling); symlinkSync(sibling, dir, process.platform === "win32" ? "junction" : "dir");
  const snapshot = readdirSync(sibling).sort().map(name => ({ name, bytes: readFileSync(join(sibling, name)) }));
  return { sibling, snapshot, object: join(sibling, `${f.blobId}.blob`), stored: f.stored, restore() { rmSync(dir); renameSync(sibling, dir); } };
}
function expectOutsideUnchanged(moved: ReturnType<typeof outside>) {
  expect(existsSync(moved.object)).toBe(true); expect(readFileSync(moved.object)).toEqual(moved.stored);
  expect(readdirSync(moved.sibling).sort().map(name => ({ name, bytes: readFileSync(join(moved.sibling, name)) }))).toEqual(moved.snapshot);
}
async function positive(f: Fixture) {
  const storedSha = sha256Hex(f.stored), result = await runRetentionAsync({ workspace: f.workspace, dryRun: false });
  expect(result.prunedBlobCount).toBe(1); expect(existsSync(f.file)).toBe(false);
  expect(readPrunedRows(f.workspace).at(-1)).toMatchObject({ blobId: f.blobId, sha256: storedSha });
  expect(verifyPrunedRows(f.workspace).ok).toBe(true); expect((await verifyRetention(f.workspace)).ok).toBe(true);
  expect((await verifyLedgerIntegrity(f.workspace)).ok).toBe(true);
  return result;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(f: Fixture) {
  const entered = deferred(), release = deferred(), actual = f.provider.sign.bind(f.provider);
  vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
    const signature = await actual(ref, bytes); entered.resolve(); await release.promise; return signature;
  });
  return { entered, release };
}
async function atPause(p: ReturnType<typeof pause>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([p.entered.promise, pending.then(() => { throw new Error("retention finished before its real Sign"); }, error => { throw error; }),
      new Promise<never>((_done, reject) => { timer = setTimeout(() => reject(new Error("retention did not enter its real Sign")), 5_000); })]);
  } finally { clearTimeout(timer); }
}

describe("retention managed blob containment", () => {
  test.each(["sync", "async"] as const)("an outside sibling behind a lasting managed ancestor symlink is refused by the actual %s producer", async driver => {
    const f = fixture(), before = row(f); expect(loadBlobPlaintext(f.workspace, f.original.canonical_payload_path!).bytes).toEqual(f.plaintext);
    expect((await verifyRetention(f.workspace)).ok).toBe(true);
    const moved = outside(f), spy = vi.spyOn(f.provider, "sign");
    try {
      const error = await Promise.resolve().then(() => driver === "sync"
        ? runRetention({ workspace: f.workspace, dryRun: false }) : runRetentionAsync({ workspace: f.workspace, dryRun: false })).then(() => null, cause => cause);
      expectOutsideUnchanged(moved); expect(row(f)).toEqual(before); expect(error).toBeInstanceOf(Error);
      expect(spy).not.toHaveBeenCalled(); expect(String(error.message)).toMatch(/symlink/);
    } finally { moved.restore(); }
    await positive(f);
  });

  test("a directory swapped outside during the real prune Sign is refused before the prepared blob can be unlinked", async () => {
    const f = fixture(), before = row(f), pair = prunePair(f), p = pause(f), pending = runRetentionAsync({ workspace: f.workspace, dryRun: false });
    const outcome = pending.then(() => null, error => error); let moved: ReturnType<typeof outside> | undefined;
    try {
      await atPause(p, pending); moved = outside(f); p.release.resolve(); const error = await outcome;
      expectOutsideUnchanged(moved); expect(row(f)).toEqual(before); expect(error).toMatchObject({ code: "RETENTION_PARTIAL", phase: "blob-publish" });
      expect(prunePair(f)).toEqual(pair);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); moved?.restore(); }
    await positive(f);
  });

  test("the last contained gate refuses a real ancestor swap after the final exact target and prefix byte checks", async () => {
    const f = fixture(); appendPrunedRow(f.workspace, "owned-retained-predecessor", sha256Hex("owned previous object"));
    const before = row(f), sigPath = join(f.workspace, ".amc", "blobs", "pruned.jsonl.sig"), actual = f.provider.sign.bind(f.provider);
    let stats = 0, moved: ReturnType<typeof outside> | undefined;
    vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
      const signature = await actual(ref, bytes);
      io.afterLstat = target => {
        if (target !== sigPath || ++stats !== 2) return;
        io.afterLstat = null; moved = outside(f);
      };
      return signature;
    });
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      const error = await outcome; expect(stats).toBe(2); expect(moved).toBeDefined(); expectOutsideUnchanged(moved!);
      expect(row(f)).toEqual(before); expect(error).toMatchObject({ code: "RETENTION_PARTIAL", phase: "blob-publish" });
      expect(readPrunedRows(f.workspace)).toHaveLength(1);
    } finally { io.afterLstat = null; await Promise.allSettled([pending]); moved?.restore(); }
    await positive(f);
  });

  test.each(["legacy-object_1", "nested/Legacy-object_2", "zero-byte_3"] as const)("a safe exact nonmodern legacy target %s keeps its real raw bytes and prune identity", async id => {
    const f = fixture(id, id === "zero-byte_3" ? Buffer.alloc(0) : Buffer.from("owned raw legacy bytes"));
    expect((await verifyRetention(f.workspace)).ok).toBe(true); await positive(f);
    expect(readPrunedRows(f.workspace).at(-1)?.blobId).toBe(id);
  });

  test.each(["../../../outside/target", "nested/../legacy-normalized-target"] as const)("an actual selected interior dot-dot locator %s cannot normalize into a deletion target", async id => {
    const f = fixture(id), before = row(f), spy = vi.spyOn(f.provider, "sign");
    expect(f.file).toBe(id.startsWith("../../../") ? join(f.root, "outside", "target.blob")
      : join(f.workspace, ".amc", "blobs", "legacy-normalized-target.blob")); expect(readFileSync(f.file)).toEqual(f.stored);
    const error = await runRetentionAsync({ workspace: f.workspace, dryRun: false }).then(() => null, cause => cause);
    expect(existsSync(f.file)).toBe(true); expect(readFileSync(f.file)).toEqual(f.stored); expect(row(f)).toEqual(before); expect(prunePair(f)).toEqual([null, null]);
    expect(error).toBeInstanceOf(Error); expect(error.message).toMatch(/unsafe path/); expect(spy).not.toHaveBeenCalled();
    await positive(fixture("safe-restored-target"));
  });

  test("a genuine same-size re-encryption during initial capture is refused before provider work", async () => {
    const f = fixture(), before = row(f), envelope = decodeBlobV1(f.stored, f.blobId), key = readBlobKeyMaterial(f.workspace, envelope.keyVersion);
    const alternate = encodeBlobV1(encryptBlobV1({ blobId: f.blobId, keyVersion: envelope.keyVersion, key, plaintext: f.plaintext }));
    expect(alternate.length).toBe(f.stored.length); expect(alternate).not.toEqual(f.stored);
    expect(decryptBlobV1({ blobId: f.blobId, key, envelope: decodeBlobV1(alternate, f.blobId) })).toEqual(f.plaintext);
    let stats = 0; const spy = vi.spyOn(f.provider, "sign");
    io.afterLstat = target => {
      if (target !== f.file || ++stats !== 2) return;
      io.afterLstat = null; writeFileSync(f.file, alternate); utimesSync(f.file, new Date(0), new Date(0));
    };
    try {
      const error = await runRetentionAsync({ workspace: f.workspace, dryRun: false }).then(() => null, cause => cause);
      expect(stats).toBe(2); expect(spy).not.toHaveBeenCalled(); expect(error).toBeInstanceOf(Error);
      expect(readFileSync(f.file)).toEqual(alternate); expect(row(f)).toEqual(before); expect(prunePair(f)).toEqual([null, null]);
    } finally { io.afterLstat = null; writeFileSync(f.file, f.stored); }
    await positive(f);
  });

  test("a safely already-missing target keeps the existing skip outcome without signing a fictitious removal", async () => {
    const f = fixture(), before = row(f); rmSync(f.file); const spy = vi.spyOn(f.provider, "sign");
    const result = await runRetentionAsync({ workspace: f.workspace, dryRun: false });
    expect(result.prunedBlobCount).toBe(0); expect(row(f)).toEqual(before); expect(prunePair(f)).toEqual([null, null]); expect(spy).not.toHaveBeenCalled();
    expect(hasSkippedAudit(f)).toBe(false);
    writeFileSync(f.file, f.stored); await positive(f);
  });

  test("a target removed during Sign remains a real skipped result rather than a recorded physical removal", async () => {
    const f = fixture(), before = row(f), p = pause(f), pending = runRetentionAsync({ workspace: f.workspace, dryRun: false });
    try {
      await atPause(p, pending); rmSync(f.file); p.release.resolve(); const result = await pending;
      expect(result.prunedBlobCount).toBe(0); expect(row(f)).toEqual(before); expect(prunePair(f)).toEqual([null, null]);
      expect(hasSkippedAudit(f)).toBe(true);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); writeFileSync(f.file, f.stored); }
    await positive(f);
  });

  test("a safely missing name after final byte CAS keeps the existing skipped result without a fictitious unlink", async () => {
    const f = fixture(); appendPrunedRow(f.workspace, "owned-retained-predecessor", sha256Hex("owned previous object"));
    const before = row(f), pair = prunePair(f), sigPath = join(f.workspace, ".amc", "blobs", "pruned.jsonl.sig"), actual = f.provider.sign.bind(f.provider);
    let stats = 0;
    vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
      const signature = await actual(ref, bytes);
      io.afterLstat = target => {
        if (target !== sigPath || ++stats !== 2) return;
        io.afterLstat = null; rmSync(f.file);
      };
      return signature;
    });
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false });
    try {
      const result = await pending; expect(stats).toBe(2); expect(result.prunedBlobCount).toBe(0);
      expect(row(f)).toEqual(before); expect(prunePair(f)).toEqual(pair); expect(readPrunedRows(f.workspace)).toHaveLength(1);
      expect(hasSkippedAudit(f)).toBe(true);
    } finally { io.afterLstat = null; await Promise.allSettled([pending]); writeFileSync(f.file, f.stored); }
    await positive(f);
  });

  test("a genuine final native unlink failure never records a physical removal or new prune row", async () => {
    const f = fixture(), before = row(f), saved = join(f.root, "saved-genuine-managed-object"); let blocked = false;
    io.beforeUnlink = target => {
      if (target !== f.file) return;
      io.beforeUnlink = null; renameSync(f.file, saved); mkdirSync(f.file); blocked = true;
    };
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      const error = await outcome; expect(blocked).toBe(true);
      expect(error).toMatchObject({ code: "RETENTION_PARTIAL", phase: "blob-publish", progress: { removedBlobIds: [] } });
      expect(error).toHaveProperty("cause.code", expect.any(String)); expect(readFileSync(saved)).toEqual(f.stored);
      expect(row(f)).toEqual(before); expect(prunePair(f)).toEqual([null, null]);
    } finally {
      io.beforeUnlink = null; await Promise.allSettled([pending]);
      if (blocked) { rmSync(f.file, { recursive: true }); renameSync(saved, f.file); }
    }
    await positive(f);
  });

  test("a valid tighter current writer-size policy is not retroactively applied to the captured stored object", async () => {
    const f = fixture(undefined, Buffer.alloc(32768, 97)), policy = loadOpsPolicy(f.workspace);
    expect(f.stored.length).toBeGreaterThan(16384); policy.opsPolicy.retention.maxBlobBytes = 16384;
    writeFileSync(opsPolicyPath(f.workspace), YAML.stringify(policy)); signOpsPolicy(f.workspace);
    await positive(f);
  });
});

