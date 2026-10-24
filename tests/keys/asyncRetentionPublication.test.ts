import { sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger, verifyLedgerIntegrity, canonicalMetadataForHash } from "../../src/ledger/ledger.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../../src/ops/policy.js";
import { runRetention, verifyRetention } from "../../src/ops/retention/retentionEngine.js";
import * as retention from "../../src/ops/retention/retentionEngine.js";
import { appendPrunedRow, listRetentionSegments, readPrunedRows, verifyPrunedRows } from "../../src/ops/retention/retentionArchive.js";
import * as archive from "../../src/ops/retention/retentionArchive.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import type { EvidenceEvent } from "../../src/types.js";
import { setMode } from "../../src/mode/mode.js";
import { initUsersConfig, addUser, createSession, revokeSessionByToken, setUserRolesAsync, usersConfigPath } from "../../src/auth/authApi.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { issueScopedLegalHold, releaseScopedLegalHold, readLegalHoldRegistry, holdVerdict } from "../../src/residency/legalHoldRegistry.js";
import { emitGuardEvent, readGuardEvents, closeGuardDb } from "../../src/enforce/evidenceEmitter.js";
import { ownedAsyncWorkspaceLogNotary } from "../helpers/ownedAsyncWorkspaceLogNotary.js";
import { verifySignatureEnvelope } from "../../src/crypto/signing/signatureEnvelope.js";
import { readTransparencyEntries, transparencySealPath } from "../../src/transparency/logChain.js";
import { merkleCurrentRootPath } from "../../src/transparency/merklePaths.js";
import { readMerklePendingMarker, TransparencyMerkleLagError } from "../../src/transparency/merkleIndexState.js";

const io = vi.hoisted(() => ({ beforeRename: null as ((target: string) => void) | null, afterRename: null as ((target: string) => void) | null }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: ((from: Parameters<typeof actual.renameSync>[0], to: Parameters<typeof actual.renameSync>[1]) => {
    io.beforeRename?.(String(to)); const result = actual.renameSync(from, to); io.afterRename?.(String(to)); return result;
  }) as typeof actual.renameSync };
});

const PASS = "owned-retention-publication-passphrase", DAY = 86_400_000;
function runRetentionAsync(input: Parameters<typeof runRetention>[0]): Promise<ReturnType<typeof runRetention>> {
  const actual = Reflect.get(retention, "runRetentionAsync") as ((params: Parameters<typeof runRetention>[0]) => Promise<ReturnType<typeof runRetention>>) | undefined;
  return typeof actual === "function" ? actual(input) : Promise.reject(new Error("the maintained asynchronous retention producer must exist"));
}
const roots: Array<{ root: string; workspace: string }> = [];
const servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  closeGuardDb();
  io.beforeRename = null;
  io.afterRename = null;
  vi.restoreAllMocks();
  for (const f of roots.splice(0)) {
    closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc/evidence.sqlite")}`);
    lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-retention-")), workspace = join(root, "workspace");
  roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const policy = loadOpsPolicy(workspace); policy.opsPolicy.maintenance.autoVacuumOnRetention = false;
  writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy)); signOpsPolicy(workspace);
  const ts = Date.now() - 20 * DAY, ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "retention-owned", runtime: "unknown", binaryPath: "owned", binarySha256: "owned" });
    ledger.appendEvidenceDetailed({ id: "retention-owned-event", ts, sessionId: "retention-owned", runtime: "unknown",
      eventType: "stdout", payload: "owned retained plaintext", payloadExt: "txt", inline: false, meta: { fixture: true } });
    ledger.sealSession("retention-owned");
  } finally { ledger.close(); }
  const provider = loadKeyProvider(workspace, "file"), privateKey = getSigningKey(workspace, "artifact-seal");
  return { root, workspace, provider, privateKey, publicKey: getSigningPublicKeyPem(workspace, "artifact-seal") };
}
function rows(f: ReturnType<typeof fixture>): EvidenceEvent[] {
  const ledger = openLedger(f.workspace); try { return ledger.getAllEvents(); } finally { ledger.close(); }
}
function selected(f: ReturnType<typeof fixture>) { return rows(f).find(row => row.id === "retention-owned-event")!; }
function source(f: ReturnType<typeof fixture>) { return join(f.workspace, selected(f).canonical_payload_path!); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(f: ReturnType<typeof fixture>, ordinal = 1) {
  const entered = deferred(), release = deferred(), original = f.provider.sign.bind(f.provider); let count = 0;
  const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => {
    const signature = await original(ref, bytes);
    if (ref.id === "artifact-seal" && ++count === ordinal) { entered.resolve(); await release.promise; }
    return signature;
  });
  return { entered, release, spy };
}
async function atPause(p: ReturnType<typeof pause>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([p.entered.promise, pending.then(() => { throw new Error("retention completed before its actual Sign"); }, error => { throw error; }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("retention did not enter its actual Sign")), 5_000); })]);
  } finally { clearTimeout(timer); }
}
async function positive(f: ReturnType<typeof fixture>) {
  const result = await runRetentionAsync({ workspace: f.workspace, dryRun: false });
  expect(result.archivedEventCount).toBeGreaterThan(0); expect(result.prunedEventCount).toBeGreaterThan(0);
  expect((await verifyRetention(f.workspace)).ok).toBe(true);
  expect((await verifyLedgerIntegrity(f.workspace)).ok).toBe(true);
  return result;
}
function noEffects(f: ReturnType<typeof fixture>, before: EvidenceEvent) {
  expect(selected(f)).toEqual(before); expect(existsSync(source(f))).toBe(true);
  expect(listRetentionSegments(f.workspace)).toEqual([]); expect(readPrunedRows(f.workspace)).toEqual([]);
}
function existingArchive(f: ReturnType<typeof fixture>, future = false) {
  const row = selected(f), at = future ? Date.now() + DAY : row.ts;
  const segment = archive.writeRetentionSegment({ workspace: f.workspace, segmentId: future ? "seg_future" : "seg_existing",
    startTs: at, endTs: at, eventLines: [JSON.stringify(row)], firstEventHash: row.event_hash, lastEventHash: row.event_hash,
    prevSegmentLastEventHash: null, prunePolicy: { archivePayloadsAfterDays: 7, prunePayloadsAfterDays: 14 } });
  if (!future) {
    const ledger = openLedger(f.workspace);
    try { ledger.markEventsArchived([row.id], "seg_existing", sha256Hex(readFileSync(segment.manifestPath))); } finally { ledger.close(); }
  }
  return segment;
}
async function studio(f: ReturnType<typeof fixture>) {
  initUsersConfig({ workspace: f.workspace, username: "retention-owner", password: "owned-owner-password" });
  const user = addUser({ workspace: f.workspace, username: "retention-operator", roles: ["OPERATOR"], password: "owned-operator-password" });
  const session = createSession({ workspace: f.workspace, user });
  const server = await startStudioApiServer({ workspace: f.workspace, host: "127.0.0.1", port: 0, token: "owned-retention-admin" }); servers.push(server);
  const post = (admin = false) => fetch(server.url + "/ops/retention/run", { method: "POST", headers: { "content-type": "application/json",
    ...(admin ? { "x-amc-admin-token": "owned-retention-admin" } : { cookie: `amc_session=${encodeURIComponent(session.token)}` }) }, body: JSON.stringify({ dryRun: false }) });
  return { post, session };
}

describe("retention async staged raw artifact publication", () => {
  test("signs the actual raw32 manifest and cumulative prefix while preserving the legacy four-field signature", async () => {
    const f = fixture(), originalRow = selected(f), stored = readFileSync(source(f)), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const spy = vi.spyOn(f.provider, "sign"), result = await positive(f);
    const manifest = readFileSync(result.manifestPath!), sigPath = `${result.segmentPath}.manifest.sig`;
    const expectedManifest = { v: 1, segmentId: result.segmentId, createdTs: now, startTs: originalRow.ts, endTs: originalRow.ts, eventCount: 1,
      firstEventHash: originalRow.event_hash, lastEventHash: originalRow.event_hash, prevSegmentLastEventHash: null,
      segmentFileSha256: sha256Hex(gzipSync(Buffer.from(JSON.stringify(originalRow) + "\n"))),
      prunePolicy: { prunePayloadsAfterDays: 14, archivePayloadsAfterDays: 7 } };
    expect(manifest.toString("utf8")).toBe(JSON.stringify(expectedManifest, null, 2));
    const sidecar = JSON.parse(readFileSync(sigPath, "utf8")) as { digestSha256: string; signature: string; signedTs: number; signer: string };
    expect(Object.keys(sidecar)).toEqual(["digestSha256", "signature", "signedTs", "signer"]);
    expect(sidecar.digestSha256).toBe(sha256Hex(manifest)); expect(sidecar.signer).toBe("auditor");
    expect(sidecar.signature).toBe(sign(null, Buffer.from(sidecar.digestSha256, "hex"), f.privateKey).toString("base64"));
    expect(readFileSync(sigPath, "utf8")).toBe(JSON.stringify({ digestSha256: sha256Hex(manifest), signature: sidecar.signature, signedTs: now, signer: "auditor" }, null, 2));
    expect(verify(null, Buffer.from(sidecar.digestSha256, "hex"), f.publicKey, Buffer.from(sidecar.signature, "base64"))).toBe(true);
    expect(spy.mock.calls.filter(([ref]) => ref.id === "artifact-seal").map(([, bytes]) => Buffer.from(bytes)))
      .toContainEqual(Buffer.from(sidecar.digestSha256, "hex"));
    expect(verifyPrunedRows(f.workspace).ok).toBe(true); expect(result.prunedBlobCount).toBe(1);
    const fields = { v: 1, ts: now, blobId: originalRow.blob_ref, sha256: sha256Hex(stored), prev: "" };
    const row = { ...fields, hash: sha256Hex(canonicalize(fields)) }, prefix = JSON.stringify(row) + "\n", digest = sha256Hex(prefix);
    expect(readFileSync(join(f.workspace, ".amc", "blobs", "pruned.jsonl"), "utf8")).toBe(prefix);
    expect(readFileSync(join(f.workspace, ".amc", "blobs", "pruned.jsonl.sig"), "utf8")).toBe(JSON.stringify({ v: 1, ts: now,
      lastHash: row.hash, digestSha256: digest, signature: sign(null, Buffer.from(digest, "hex"), f.privateKey).toString("base64"), signer: "auditor" }, null, 2));
  });

  test("first real Sign failure leaves all selected bytes, rows and archive targets intact", async () => {
    const f = fixture(), before = selected(f), original = f.provider.sign.bind(f.provider);
    vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
      const signature = Buffer.from(await original(ref, bytes)); signature[0] = signature[0]! ^ 1; return signature;
    });
    await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    noEffects(f, before); await positive(f);
  });

  test("optional guard deletion waits for the applicable actual archive Sign rather than committing on its refusal", async () => {
    const f = fixture(), policy = loadOpsPolicy(f.workspace); policy.opsPolicy.retention.pruneGuardEventsAfterDays = 14;
    writeFileSync(opsPolicyPath(f.workspace), YAML.stringify(policy)); signOpsPolicy(f.workspace);
    const old = Date.now() - 20 * DAY;
    try {
      vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(old);
      emitGuardEvent({ workspace: f.workspace, agentId: "default", moduleCode: "P208_RETENTION", decision: "allow", reason: "owned old guard row", severity: "low" });
    } finally { vi.useRealTimers(); }
    const guardRows = () => readGuardEvents(undefined, undefined, f.workspace).filter(row => row.module_code === "P208_RETENTION");
    const guards = guardRows(); expect(guards).toHaveLength(1);
    const before = selected(f), actual = f.provider.sign.bind(f.provider);
    vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => { const signature = Buffer.from(await actual(ref, bytes)); signature[0] = signature[0]! ^ 1; return signature; });
    await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    noEffects(f, before); expect(guardRows()).toEqual(guards);
    expect((await positive(f)).prunedGuardEventCount).toBe(1); expect(guardRows()).toEqual([]);
  });

  test("refuses changed original generation after a real Sign without publishing the segment", async () => {
    const f = fixture(), before = selected(f), p = pause(f);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS });
      p.release.resolve(); expect(await outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); noEffects(f, before);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
    await positive(f);
  });

  test("refuses a real lock after Sign and preserves the source before any archive write", async () => {
    const f = fixture(), before = selected(f), p = pause(f);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
      p.release.resolve(); expect(await outcome).toMatchObject({ message: expect.stringMatching(/Vault locked/i) }); noEffects(f, before);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("the producer gate refuses a lock during real sidecar serialization after the checked signer returns", async () => {
    const f = fixture(), before = selected(f), original = JSON.stringify; let armed = true;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const value = args[0] as { digestSha256?: unknown; signature?: unknown; signer?: unknown; signedTs?: unknown } | null;
      if (armed && value?.signer === "auditor" && typeof value.digestSha256 === "string" && typeof value.signedTs === "number" && typeof value.signature === "string") {
        armed = false; vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
      }
      return original(...args);
    });
    try {
      await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toThrow(/Vault locked/i);
      expect(armed).toBe(false); noEffects(f, before);
    } finally { spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("existing owner mode is required before Describe or Sign and again after a real Sign", async () => {
    const f = fixture(), before = selected(f), describe = vi.spyOn(f.provider, "describe"), signSpy = vi.spyOn(f.provider, "sign");
    setMode(f.workspace, "agent");
    await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toThrow();
    expect(describe).not.toHaveBeenCalled(); expect(signSpy).not.toHaveBeenCalled(); noEffects(f, before);
    setMode(f.workspace, "owner"); signSpy.mockRestore(); const p = pause(f);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); setMode(f.workspace, "agent"); p.release.resolve(); expect(await outcome).toBeInstanceOf(Error); noEffects(f, before);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); setMode(f.workspace, "owner"); }
    await positive(f);
  });

  test("the original signed ops pair remains a dependency across a real Sign", async () => {
    const f = fixture(), before = selected(f), p = pause(f), bodyPath = opsPolicyPath(f.workspace), body = readFileSync(bodyPath);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); writeFileSync(bodyPath, Buffer.concat([body, Buffer.from("\n# concurrent owner policy edit\n")]));
      p.release.resolve(); expect(await outcome).toBeInstanceOf(Error); noEffects(f, before);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); writeFileSync(bodyPath, body); }
    await positive(f);
  });

  test("the async no-sign refusal is rechecked after a real unlocked Sign and before the first output", async () => {
    const f = fixture(), before = selected(f), p = pause(f), pending = runRetentionAsync({ workspace: f.workspace, dryRun: false });
    const outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); vi.stubEnv("AMC_NO_SIGN", "1"); p.release.resolve(); expect(await outcome).toMatchObject({ message: expect.stringContaining("AMC_NO_SIGN") });
      noEffects(f, before);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_NO_SIGN", "0"); }
    await positive(f);
  });

  test("requires the existing signed archive before payload prune without auto-archiving extra rows", async () => {
    const f = fixture(), policy = loadOpsPolicy(f.workspace); policy.opsPolicy.retention.archivePayloadsAfterDays = 30;
    writeFileSync(opsPolicyPath(f.workspace), YAML.stringify(policy)); signOpsPolicy(f.workspace);
    const before = selected(f), spy = vi.spyOn(f.provider, "sign"), describe = vi.spyOn(f.provider, "describe");
    await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toThrow(/archive proof/);
    expect(spy).not.toHaveBeenCalled(); expect(describe).not.toHaveBeenCalled(); noEffects(f, before);
    policy.opsPolicy.retention.archivePayloadsAfterDays = 7; writeFileSync(opsPolicyPath(f.workspace), YAML.stringify(policy)); signOpsPolicy(f.workspace);
    await positive(f);
  });

  test("refuses an unsupported lexical successor before provider work and preserves the actual predecessor", async () => {
    const f = fixture(), segment = existingArchive(f, true), before = selected(f), compressed = readFileSync(segment.segmentPath), spy = vi.spyOn(f.provider, "sign");
    await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toThrow(/lexical successor/);
    expect(spy).not.toHaveBeenCalled(); expect(selected(f)).toEqual(before); expect(readFileSync(segment.segmentPath)).toEqual(compressed);
    expect(listRetentionSegments(f.workspace)).toHaveLength(1);
    for (const path of [segment.segmentPath, segment.manifestPath, segment.sigPath]) rmSync(path);
    await positive(f);
  });

  test("retains original run authority before a payload prune that reuses a real existing archive and has no new Sign", async () => {
    const f = fixture(); existingArchive(f); const before = selected(f), original = archive.captureRetentionProofs;
    const spy = vi.spyOn(f.provider, "sign");
    const capture = vi.spyOn(archive, "captureRetentionProofs").mockImplementationOnce(workspace => {
      const proof = original(workspace); expect(proof.index.ok).toBe(true);
      rotatePurposeKeys({ workspace, purposes: ["session"], passphrase: PASS }); return proof;
    });
    try {
      await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
      expect(spy).not.toHaveBeenCalled(); expect(selected(f)).toEqual(before); expect(existsSync(source(f))).toBe(true);
    } finally { capture.mockRestore(); }
    expect((await runRetentionAsync({ workspace: f.workspace, dryRun: false })).prunedEventCount).toBe(1);
    expect((await verifyRetention(f.workspace)).ok).toBe(true);
  });

  test("retained payload bytes are checked again after real hold admission and before their SQL prune", async () => {
    const f = fixture(), file = source(f), bytes = readFileSync(file), stringify = JSON.stringify; let armed = true;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const value = args[0] as { auditType?: unknown; executor?: unknown } | null;
      if (armed && value?.auditType === "DELETION_ALLOWED" && value.executor === "retention.payload-prune") {
        armed = false; writeFileSync(file, "owned change after proof and before SQL\n");
      }
      return stringify(...args);
    });
    try {
      await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toMatchObject({ code: "RETENTION_PARTIAL", phase: "payload-prune" });
      expect(armed).toBe(false); expect(selected(f)).toMatchObject({ archived: 1, payload_pruned: 0 });
      expect(readFileSync(file, "utf8")).toBe("owned change after proof and before SQL\n"); expect(readPrunedRows(f.workspace)).toEqual([]);
    } finally { spy.mockRestore(); writeFileSync(file, bytes); }
    expect((await runRetentionAsync({ workspace: f.workspace, dryRun: false })).prunedEventCount).toBe(1); expect((await verifyRetention(f.workspace)).ok).toBe(true);
  });

  test("an already-pruned referenced object must authenticate its captured bytes before any new seal Sign", async () => {
    const f = fixture(), file = source(f), bytes = readFileSync(file); existingArchive(f);
    const ledger = openLedger(f.workspace); try { ledger.pruneEventPayloadColumns(["retention-owned-event"], Date.now()); } finally { ledger.close(); }
    const before = selected(f), spy = vi.spyOn(f.provider, "sign"); writeFileSync(file, "owned preexisting tampered bytes\n");
    try {
      await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toThrow(/selected (stored )?blob/);
      expect(spy).not.toHaveBeenCalled(); expect(selected(f)).toEqual(before); expect(readPrunedRows(f.workspace)).toEqual([]);
      expect(readFileSync(file, "utf8")).toBe("owned preexisting tampered bytes\n");
    } finally { writeFileSync(file, bytes); }
    expect((await runRetentionAsync({ workspace: f.workspace, dryRun: false })).prunedBlobCount).toBe(1); expect((await verifyRetention(f.workspace)).ok).toBe(true);
  });

  test("a later prune-seal refusal retains the already archived and pruned row but never unlinks its blob", async () => {
    const f = fixture(), file = source(f), bytes = readFileSync(file), original = f.provider.sign.bind(f.provider); let count = 0;
    vi.spyOn(f.provider, "sign").mockImplementation(async (ref, message) => {
      const signature = Buffer.from(await original(ref, message));
      if (ref.id === "artifact-seal" && ++count === 2) signature[0] = signature[0]! ^ 1;
      return signature;
    });
    await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toMatchObject({ code: "RETENTION_PARTIAL",
      phase: "blob-sign", cause: expect.objectContaining({ code: "KEY_PROVIDER_KEY_REFUSED" }),
      progress: expect.objectContaining({ archiveMarked: true, payloadPrunedIds: ["retention-owned-event"], removedBlobIds: [] }) });
    expect(selected(f)).toMatchObject({ archived: 1, payload_pruned: 1 }); expect(readFileSync(file)).toEqual(bytes);
    expect(listRetentionSegments(f.workspace)).toHaveLength(1); expect(readPrunedRows(f.workspace)).toEqual([]);
  });

  test("keeps unrelated new evidence legitimate during its actual archive Sign", async () => {
    const f = fixture(), p = pause(f);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false });
    try {
      await atPause(p, pending);
      const ledger = openLedger(f.workspace);
      try {
        expect(ledger.db.inTransaction).toBe(false);
        ledger.startSession({ sessionId: "unrelated-current", runtime: "unknown", binaryPath: "owned", binarySha256: "owned" });
        ledger.appendEvidence({ sessionId: "unrelated-current", runtime: "unknown", eventType: "stdout", inline: true, payload: "unrelated current row", meta: {} });
        ledger.sealSession("unrelated-current");
      } finally { ledger.close(); }
      p.release.resolve(); expect((await pending).prunedEventCount).toBe(1);
      expect(rows(f).find(row => row.session_id === "unrelated-current")?.payload_pruned).toBe(0);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("a real selected-row retention transition during Sign cannot be overwritten by the prepared archive", async () => {
    const f = fixture(), p = pause(f), pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); const ledger = openLedger(f.workspace);
      try { ledger.pruneEventPayloadColumns(["retention-owned-event"], Date.now()); } finally { ledger.close(); }
      const winner = selected(f); p.release.resolve(); expect(await outcome).toBeInstanceOf(Error);
      expect(selected(f)).toEqual(winner); expect(listRetentionSegments(f.workspace)).toEqual([]); expect(existsSync(source(f))).toBe(true);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
    await positive(fixture());
  });

  test("a real newly published predecessor remains the sole segment when the older prepared attempt returns", async () => {
    const f = fixture(), before = selected(f), p = pause(f), pending = runRetentionAsync({ workspace: f.workspace, dryRun: false });
    const outcome = pending.then(() => null, error => error); let winner: ReturnType<typeof existingArchive> | undefined;
    try {
      await atPause(p, pending); winner = existingArchive(f, true); const bytes = readFileSync(winner.manifestPath);
      p.release.resolve(); expect(await outcome).toBeInstanceOf(Error); expect(selected(f)).toEqual(before);
      expect(listRetentionSegments(f.workspace)).toHaveLength(1); expect(readFileSync(winner.manifestPath)).toEqual(bytes);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); if (winner) for (const path of [winner.segmentPath, winner.manifestPath, winner.sigPath]) rmSync(path); }
    await positive(f);
  });

  test("an exact destination created during Sign is preserved before any prepared archive member publishes", async () => {
    const f = fixture(), before = selected(f), stringify = JSON.stringify; let target: string | undefined;
    const capture = vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const value = args[0] as { segmentId?: unknown; startTs?: unknown; endTs?: unknown } | null;
      if (typeof value?.segmentId === "string" && typeof value.startTs === "number" && typeof value.endTs === "number")
        target = join(f.workspace, ".amc", "archive", "ledger", `segment_${value.startTs}_${value.endTs}_${value.segmentId}.jsonl.gz.manifest.json`);
      return stringify(...args);
    });
    const p = pause(f), pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); expect(target).toBeDefined(); mkdirSync(join(f.workspace, ".amc", "archive", "ledger"), { recursive: true });
      writeFileSync(target!, "owned competing target\n"); p.release.resolve(); expect(await outcome).toBeInstanceOf(Error);
      expect(readFileSync(target!, "utf8")).toBe("owned competing target\n"); expect(listRetentionSegments(f.workspace)).toEqual([]); expect(selected(f)).toEqual(before);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); capture.mockRestore(); if (target) rmSync(target, { force: true }); }
    await positive(f);
  });

  test("a newly committed reference during prune Sign retains the blob and records a real skipped outcome", async () => {
    const f = fixture(), p = pause(f, 2), file = source(f), before = readFileSync(file);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false });
    try {
      await atPause(p, pending);
      const ledger = openLedger(f.workspace);
      try {
        expect(ledger.db.inTransaction).toBe(false);
        ledger.startSession({ sessionId: "new-reference", runtime: "unknown", binaryPath: "owned", binarySha256: "owned" });
        // A second real signed row can refer to the same encrypted object. The normal writer allocates a fresh
        // blob ID, so this owned SQL competitor signs the actual shared-path preimage instead of assuming dedup.
        const original = selected(f), prev = ledger.getAllEvents().at(-1)!.event_hash, ts = Date.now();
        const row: EvidenceEvent = { ...original, id: "owned-shared-blob-reference", ts, session_id: "new-reference",
          payload_path: original.canonical_payload_path, payload_inline: null, meta_json: "{}", prev_event_hash: prev,
          archived: 0, archive_segment_id: null, archive_manifest_sha256: null, payload_pruned: 0, payload_pruned_ts: null };
        const metadata = canonicalMetadataForHash({ id: row.id, ts, sessionId: row.session_id, runtime: row.runtime,
          eventType: row.event_type, payloadPath: row.payload_path, payloadInline: row.payload_inline, metaJson: row.meta_json });
        row.event_hash = sha256Hex(`${prev}${metadata}${row.payload_sha256}`);
        row.writer_sig = sign(null, Buffer.from(row.event_hash, "hex"), getSigningKey(f.workspace, "ledger-row")).toString("base64");
        const columns = Object.keys(row);
        ledger.db.prepare(`INSERT INTO evidence_events (${columns.join(",")}) VALUES (${columns.map(name => `@${name}`).join(",")})`).run(row);
        ledger.sealSession("new-reference");
      } finally { ledger.close(); }
      expect(rows(f).filter(row => row.blob_ref === selected(f).blob_ref)).toHaveLength(2);
      p.release.resolve(); const result = await pending;
      expect(result.prunedBlobCount).toBe(0); expect(readFileSync(file)).toEqual(before); expect(readPrunedRows(f.workspace)).toEqual([]);
      expect(rows(f).some(row => JSON.parse(row.meta_json).auditType === "RETENTION_BLOB_DELETE_SKIPPED")).toBe(true);
      expect((await verifyRetention(f.workspace)).ok).toBe(true);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("a real synchronous prefix winner cannot be overwritten by an older prepared prune seal", async () => {
    const f = fixture(), p = pause(f, 2), file = source(f);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); appendPrunedRow(f.workspace, "owned-concurrent-blob", sha256Hex("owned concurrent bytes"));
      const winner = readFileSync(join(f.workspace, ".amc", "blobs", "pruned.jsonl"));
      p.release.resolve(); expect(await outcome).toMatchObject({ code: "RETENTION_PARTIAL" });
      expect(readFileSync(join(f.workspace, ".amc", "blobs", "pruned.jsonl"))).toEqual(winner); expect(existsSync(file)).toBe(true);
      expect(verifyPrunedRows(f.workspace).ok).toBe(true);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("a current still-eligible reference transition is pinned independently of the age and pruned predicates", async () => {
    const f = fixture(), file = source(f), bytes = readFileSync(file), p = pause(f, 2);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }); let originalTs: number | null = null;
    try {
      await atPause(p, pending); originalTs = selected(f).payload_pruned_ts;
      const ledger = openLedger(f.workspace);
      try { ledger.pruneEventPayloadColumns(["retention-owned-event"], Date.now() + 1); } finally { ledger.close(); }
      expect(selected(f)).toMatchObject({ payload_pruned: 1, ts: expect.any(Number) });
      p.release.resolve(); expect((await pending).prunedBlobCount).toBe(0); expect(readFileSync(file)).toEqual(bytes);
      expect(readPrunedRows(f.workspace)).toEqual([]);
    } finally {
      p.release.resolve(); await Promise.allSettled([pending]);
      if (originalTs !== null) { const ledger = openLedger(f.workspace); try { ledger.pruneEventPayloadColumns(["retention-owned-event"], originalTs); } finally { ledger.close(); } }
    }
    expect((await runRetentionAsync({ workspace: f.workspace, dryRun: false })).prunedBlobCount).toBe(1);
    expect((await verifyRetention(f.workspace)).ok).toBe(true);
  });

  test("changed stored blob bytes during its actual seal Sign are retained rather than removed under an older digest", async () => {
    const f = fixture(), file = source(f), bytes = readFileSync(file), p = pause(f, 2);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(p, pending); writeFileSync(file, "owned concurrent replacement bytes\n"); p.release.resolve();
      expect(await outcome).toMatchObject({ code: "RETENTION_PARTIAL", phase: "blob-publish" });
      expect(readFileSync(file, "utf8")).toBe("owned concurrent replacement bytes\n"); expect(readPrunedRows(f.workspace)).toEqual([]);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); writeFileSync(file, bytes); }
    expect((await runRetentionAsync({ workspace: f.workspace, dryRun: false })).prunedBlobCount).toBe(1); expect((await verifyRetention(f.workspace)).ok).toBe(true);
  });

  test("a real owner-issued hold during seal Sign refuses physical removal and remains a separate deletion admission", async () => {
    const f = fixture(), file = source(f), bytes = readFileSync(file), p = pause(f, 2);
    const pending = runRetentionAsync({ workspace: f.workspace, dryRun: false }); let holdId: string | undefined;
    try {
      await atPause(p, pending); const identity = readLegalHoldRegistry(f.workspace).identity;
      const hold = issueScopedLegalHold({ workspace: f.workspace, scope: { tenantId: identity?.tenantId ?? "owned-retention-tenant",
        workspaceIds: [], sessionIds: [], dataKinds: ["blobs"] }, reason: "owned concurrent retention hold", issuedBy: "owner" }); holdId = hold.holdId;
      expect(holdVerdict({ workspace: f.workspace, target: { kind: "blobs" } }).verdict).not.toBe("clear");
      p.release.resolve(); expect((await pending).prunedBlobCount).toBe(0); expect(readFileSync(file)).toEqual(bytes);
      expect(readPrunedRows(f.workspace)).toEqual([]); expect(rows(f).some(row => String(JSON.parse(row.meta_json).auditType).startsWith("DELETION_DENIED_"))).toBe(true);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); if (holdId) releaseScopedLegalHold(f.workspace, holdId); }
    expect((await runRetentionAsync({ workspace: f.workspace, dryRun: false })).prunedBlobCount).toBe(1); expect((await verifyRetention(f.workspace)).ok).toBe(true);
  });

  test("native seal rename failure after unlink retains the physical removal and exact partial file truth", async () => {
    const f = fixture(), file = source(f), originalBytes = readFileSync(file), sealPath = join(f.workspace, ".amc", "blobs", "pruned.jsonl.sig");
    io.beforeRename = target => { if (target === sealPath) { io.beforeRename = null; mkdirSync(sealPath); } };
    const error = await runRetentionAsync({ workspace: f.workspace, dryRun: false }).then(() => null, cause => cause);
    expect(error).toMatchObject({ code: "RETENTION_PARTIAL", phase: "blob-publish", progress: expect.objectContaining({
      removedBlobIds: [selected(f).blob_ref], publishedPaths: expect.arrayContaining([join(f.workspace, ".amc", "blobs", "pruned.jsonl")]),
      attemptedPaths: expect.arrayContaining([sealPath]) }) });
    expect(error.cause).toBeInstanceOf(Error); expect(typeof error.cause.code).toBe("string");
    expect(error.progress.publishedPaths).not.toContain(sealPath); expect(existsSync(file)).toBe(false);
    expect(readPrunedRows(f.workspace)).toHaveLength(1); expect(verifyPrunedRows(f.workspace).ok).toBe(false);
    rmSync(sealPath, { recursive: true }); rmSync(join(f.workspace, ".amc", "blobs", "pruned.jsonl")); writeFileSync(file, originalBytes);
    expect((await runRetentionAsync({ workspace: f.workspace, dryRun: false })).prunedBlobCount).toBe(1);
    expect((await verifyRetention(f.workspace)).ok).toBe(true);
  });

  test("the actual published archive postimage cannot be replaced as a new baseline before its log anchor", async () => {
    const f = fixture(), policy = loadOpsPolicy(f.workspace); policy.opsPolicy.retention.prunePayloadsAfterDays = 30;
    writeFileSync(opsPolicyPath(f.workspace), YAML.stringify(policy)); signOpsPolicy(f.workspace); let replaced = false;
    io.afterRename = target => {
      if (target.startsWith(join(f.workspace, ".amc", "archive", "ledger")) && target.endsWith(".jsonl.gz.manifest.sig")) {
        io.afterRename = null; replaced = true; writeFileSync(target.slice(0, -".manifest.sig".length), "owned concurrent archive replacement\n");
      }
    };
    const error = await runRetentionAsync({ workspace: f.workspace, dryRun: false }).then(() => null, cause => cause);
    expect(replaced).toBe(true); expect(error).toMatchObject({ code: "RETENTION_PARTIAL", phase: "archive-publish",
      cause: expect.objectContaining({ message: "the published retention archive no longer has the prepared bytes" }),
      progress: expect.objectContaining({ archiveMarked: true, payloadPrunedIds: [], removedBlobIds: [] }) });
    expect(selected(f)).toMatchObject({ archived: 1, payload_pruned: 0 });
    const log = readFileSync(join(f.workspace, ".amc", "transparency", "log.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    expect(log.some(entry => entry.type === "RETENTION_SEGMENT_CREATED")).toBe(false);
    await positive(fixture());
  });

  test("new async publication refuses no-sign while the retained sync wrapper keeps unlocked and locked legacy signing behavior", async () => {
    const f = fixture(), before = selected(f); vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(runRetentionAsync({ workspace: f.workspace, dryRun: false })).rejects.toThrow(/AMC_NO_SIGN/); noEffects(f, before);
    appendPrunedRow(f.workspace, "unlocked-no-sign", sha256Hex("unlocked")); expect(verifyPrunedRows(f.workspace).ok).toBe(true);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
    expect(() => appendPrunedRow(f.workspace, "locked-no-sign", sha256Hex("locked"))).not.toThrow();
    expect(verifyPrunedRows(f.workspace).ok).toBe(false);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  });

  test("retains the synchronous run result shape on the same actual default workspace path", () => {
    const f = fixture(), result = runRetention({ workspace: f.workspace, dryRun: false });
    expect(result).not.toBeInstanceOf(Promise); expect(result.prunedEventCount).toBe(1);
    expect(Object.keys(result)).toEqual(["dryRun", "archivedEventCount", "prunedEventCount", "prunedGuardEventCount", "prunedBlobCount",
      "prunedSpillCount", "segmentId", "segmentPath", "manifestPath", "manifestSha256", "auditEventIds", "transparencyHash"]);
  });

  test("a retained sync post-line append failure keeps its actual log phase, unknown return hash and nested native cause", async () => {
    const f = fixture(), file = source(f), sealPath = transparencySealPath(f.workspace), seal = readFileSync(sealPath);
    const before = readTransparencyEntries(f.workspace); let blocked = false, error: unknown;
    io.beforeRename = target => {
      if (target !== sealPath) return;
      io.beforeRename = null; blocked = true; rmSync(sealPath); mkdirSync(sealPath);
      writeFileSync(join(sealPath, "occupied"), "owned native rename refusal");
    };
    try {
      try { runRetention({ workspace: f.workspace, dryRun: false }); } catch (cause) { error = cause; }
      expect(blocked).toBe(true);
      expect(error).toMatchObject({ code: "RETENTION_PARTIAL", phase: "workspace-log", progress: {
        archiveMarked: true, payloadPrunedIds: ["retention-owned-event"], removedBlobIds: [selected(f).blob_ref], transparencyHash: null,
        attemptedStages: expect.arrayContaining(["workspace-log"]) } });
      expect(error).not.toHaveProperty("progress.completedStages", expect.arrayContaining(["workspace-log"]));
      expect(error).not.toHaveProperty("progress.attemptedStages", expect.arrayContaining(["workspace-merkle-rebuild"]));
      const entries = readTransparencyEntries(f.workspace), entry = entries.at(-1)!;
      expect(entries.slice(0, -1)).toEqual(before); expect(entry.type).toBe("RETENTION_SEGMENT_CREATED");
      expect(error).toHaveProperty("cause", expect.any(TransparencyMerkleLagError));
      expect(error).toHaveProperty("cause.entryHash", entry.hash); expect(error).toHaveProperty("cause.pendingRecorded", true);
      expect(error).toHaveProperty("cause.cause.code", expect.any(String));
      expect(readMerklePendingMarker(f.workspace)?.entryHash).toBe(entry.hash);
      expect(selected(f)).toMatchObject({ archived: 1, payload_pruned: 1 }); expect(existsSync(file)).toBe(false);
      expect(listRetentionSegments(f.workspace)).toHaveLength(1); expect(verifyPrunedRows(f.workspace).ok).toBe(true);
    } finally {
      io.beforeRename = null;
      if (blocked) { rmSync(sealPath, { recursive: true, force: true }); writeFileSync(sealPath, seal); }
    }
    // A new owned run proves success after removing the fault; this is not recovery of the failed run's pending anchor.
    const control = fixture(), result = runRetention({ workspace: control.workspace, dryRun: false });
    expect(result.transparencyHash).toBe(readTransparencyEntries(control.workspace).at(-1)?.hash);
    expect((await verifyRetention(control.workspace)).ok).toBe(true); expect((await verifyLedgerIntegrity(control.workspace)).ok).toBe(true);
  });

  test("a retained sync extra-rebuild failure preserves the successful append hash and completed log stage", async () => {
    const f = fixture(), file = source(f), rootPath = merkleCurrentRootPath(f.workspace), before = readTransparencyEntries(f.workspace);
    let rootWrites = 0, committedRoot: Buffer | undefined, error: unknown;
    io.beforeRename = target => {
      if (target !== rootPath || ++rootWrites !== 2) return;
      io.beforeRename = null; committedRoot = readFileSync(rootPath); rmSync(rootPath); mkdirSync(rootPath);
      writeFileSync(join(rootPath, "occupied"), "owned retained rebuild rename refusal");
    };
    try {
      try { runRetention({ workspace: f.workspace, dryRun: false }); } catch (cause) { error = cause; }
      expect(rootWrites).toBe(2); expect(committedRoot).toBeDefined();
      const entries = readTransparencyEntries(f.workspace), entry = entries.at(-1)!;
      expect(entries.slice(0, -1)).toEqual(before); expect(entry.type).toBe("RETENTION_SEGMENT_CREATED");
      expect(error).toMatchObject({ code: "RETENTION_PARTIAL", phase: "workspace-merkle-rebuild", progress: {
        archiveMarked: true, payloadPrunedIds: ["retention-owned-event"], removedBlobIds: [selected(f).blob_ref], transparencyHash: entry.hash,
        completedStages: expect.arrayContaining(["workspace-log"]), attemptedStages: expect.arrayContaining(["workspace-log", "workspace-merkle-rebuild"]) } });
      expect(error).not.toHaveProperty("progress.completedStages", expect.arrayContaining(["workspace-merkle-rebuild"]));
      expect(error).toHaveProperty("cause", expect.any(Error)); expect(error).toHaveProperty("cause.code", expect.any(String));
      expect(error).not.toHaveProperty("cause", expect.any(TransparencyMerkleLagError)); expect(readMerklePendingMarker(f.workspace)).toBeNull();
      expect(selected(f)).toMatchObject({ archived: 1, payload_pruned: 1 }); expect(existsSync(file)).toBe(false);
      expect(listRetentionSegments(f.workspace)).toHaveLength(1); expect(verifyPrunedRows(f.workspace).ok).toBe(true);
    } finally {
      io.beforeRename = null;
      if (committedRoot !== undefined) { rmSync(rootPath, { recursive: true, force: true }); writeFileSync(rootPath, committedRoot); }
    }
    const control = fixture(), result = runRetention({ workspace: control.workspace, dryRun: false });
    expect(result.transparencyHash).toBe(readTransparencyEntries(control.workspace).at(-1)?.hash);
    expect((await verifyRetention(control.workspace)).ok).toBe(true); expect((await verifyLedgerIntegrity(control.workspace)).ok).toBe(true);
  });

  test.each(["tracked token", "current roles"] as const)("actual Studio awaits Sign and rechecks its %s before retention effects", async changed => {
    const f = fixture(), api = await studio(f), before = selected(f), p = pause(f), pending = api.post();
    try {
      await atPause(p, pending); noEffects(f, before);
      if (changed === "tracked token") revokeSessionByToken({ workspace: f.workspace, token: api.session.token });
      else await setUserRolesAsync({ workspace: f.workspace, username: "retention-operator", roles: ["AGENT"] });
      p.release.resolve(); const denied = await pending; expect(denied.status).toBe(401);
      expect(await denied.text()).toContain("authenticated authority changed while signing"); noEffects(f, before);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
    const fresh = await api.post(true), body = await fresh.json(); expect(fresh.status).toBe(200); expect(body.prunedEventCount).toBe(1);
    expect((await verifyRetention(f.workspace)).ok).toBe(true);
  });

  test("actual Studio rechecks writable users state for its unchanged bootstrap-admin role", async () => {
    const f = fixture(), api = await studio(f), before = selected(f), path = usersConfigPath(f.workspace), users = readFileSync(path);
    const p = pause(f), pending = api.post(true);
    try {
      await atPause(p, pending); writeFileSync(path, Buffer.concat([users, Buffer.from("\n# owned unsigned users edit\n")]));
      p.release.resolve(); const denied = await pending; expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: "users signature invalid; write operations blocked" }); noEffects(f, before);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); writeFileSync(path, users); }
    const fresh = await api.post(true), body = await fresh.json(); expect(fresh.status).toBe(200); expect(body.prunedEventCount).toBe(1);
  });

  test("independent native NOTARY log signatures cannot replace the original file retention authority", async () => {
    const f = fixture(), notary = await ownedAsyncWorkspaceLogNotary(f.workspace, f.root), start = notary.requests.length;
    const logPath = join(f.workspace, ".amc", "transparency", "log.jsonl"); let originalLog: Buffer | undefined;
    try {
      notary.setBeforeReply(kind => {
        if (kind !== "MERKLE_ROOT") return;
        originalLog = readFileSync(logPath); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
      });
      const error = await runRetentionAsync({ workspace: f.workspace, dryRun: false }).then(() => null, cause => cause);
      expect(error).toMatchObject({ code: "RETENTION_PARTIAL", phase: "workspace-log", cause: expect.objectContaining({ message: expect.stringMatching(/Vault locked/i) }),
        progress: expect.objectContaining({ archiveMarked: true, removedBlobIds: [selected(f).blob_ref] }) });
      expect(notary.requests.slice(start).map(request => request.kind)).toEqual(["TRANSPARENCY_ROOT", "MERKLE_ROOT"]);
      expect(originalLog).toBeDefined(); expect(readFileSync(logPath)).toEqual(originalLog);
      expect(error.cause.entryHash).toBeUndefined(); expect(error.cause.pendingRecorded).toBeUndefined();
      expect(listRetentionSegments(f.workspace)).toHaveLength(1); expect(verifyPrunedRows(f.workspace).ok).toBe(true);
    } finally { notary.setBeforeReply(undefined); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); await notary.close(); }
    // A fresh owned run proves actual native success; this does not pretend to resume the first run's missing anchor.
    const control = fixture(), live = await ownedAsyncWorkspaceLogNotary(control.workspace, control.root), before = live.requests.length;
    try {
      const result = await runRetentionAsync({ workspace: control.workspace, dryRun: false }); expect(result.transparencyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(live.requests.slice(before).map(request => request.kind)).toEqual(["TRANSPARENCY_ROOT", "MERKLE_ROOT"]);
      const sidecar = JSON.parse(readFileSync(join(control.workspace, ".amc", "transparency", "log.seal.sig"), "utf8"));
      expect(sidecar.envelope.alg).toBe("ecdsa-p256-sha256");
      expect(verifySignatureEnvelope(sidecar.digestSha256, sidecar.envelope, { trustedPublicKeys: [live.publicKeyPem], requireTrustedKey: true })).toBe(true);
      expect(archive.verifyRetentionSegment({ workspace: control.workspace, ...listRetentionSegments(control.workspace)[0]! }).ok).toBe(true);
      expect(verifyPrunedRows(control.workspace).ok).toBe(true);
    } finally { await live.close(); }
  }, 30_000);
});
