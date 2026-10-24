import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { addPublicKeyToHistory, getSigningKey, getPublicKeyHistory, getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { buildRetentionProofIndex, writeRetentionSegment, verifyRetentionSegment, appendPrunedRow, verifyPrunedRows } from "../../src/ops/retention/retentionArchive.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { EvidenceEvent } from "../../src/types.js";

const io = vi.hoisted(() => ({ read: null as ((path: string, bytes: unknown) => unknown) | null }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readFileSync: ((...args: Parameters<typeof actual.readFileSync>) => {
    const bytes = actual.readFileSync(...args); return io.read?.(String(args[0]), bytes) ?? bytes;
  }) as typeof actual.readFileSync };
});
const PASS = "owned-retention-proof-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  io.read = null;
  for (const f of roots.splice(0)) {
    closeSqlitePool(`ledger:${resolve(f.workspace)}:${join(f.workspace, ".amc/evidence.sqlite")}`);
    lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-retention-proof-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const ledger = openLedger(workspace); let row!: EvidenceEvent;
  try {
    ledger.startSession({ sessionId: "owned-proof", runtime: "unknown", binaryPath: "owned", binarySha256: "owned" });
    ledger.appendEvidence({ sessionId: "owned-proof", id: "owned-proof-event", runtime: "unknown", eventType: "stdout", inline: true,
      payload: "owned original evidence", meta: { original: true } }); ledger.sealSession("owned-proof");
    row = ledger.getAllEvents().find(event => event.id === "owned-proof-event")!;
  } finally { ledger.close(); }
  const segment = writeRetentionSegment({ workspace, segmentId: "seg_owned", startTs: row.ts, endTs: row.ts,
    eventLines: [JSON.stringify(row)], firstEventHash: row.event_hash, lastEventHash: row.event_hash,
    prevSegmentLastEventHash: null, prunePolicy: { archivePayloadsAfterDays: 7, prunePayloadsAfterDays: 14 } });
  return { root, workspace, row, segment, publicKey: getSigningPublicKeyPem(workspace, "artifact-seal") };
}
function verifies(f: ReturnType<typeof fixture>) { return verifyRetentionSegment({ workspace: f.workspace, ...f.segment }); }

describe("retention proofs retain the exact admitted buffers and artifact purpose", () => {
  test("a later gzip read cannot substitute a different archived row after its original bytes were authenticated", () => {
    const f = fixture(), original = readFileSync(f.segment.segmentPath), originalRow = JSON.parse(gunzipSync(original).toString("utf8"));
    const replacement = gzipSync(Buffer.from(JSON.stringify({ ...originalRow, meta_json: JSON.stringify({ untrustedReplacement: true }) }) + "\n"));
    let reads = 0;
    io.read = (path, bytes) => path === f.segment.segmentPath && ++reads > 1 ? replacement : bytes;
    const proof = buildRetentionProofIndex(f.workspace); expect(proof.ok).toBe(true);
    expect(proof.archivedEvents.get(f.row.id)?.event).toEqual(f.row); expect(reads).toBe(1);
    io.read = null; expect(verifies(f).ok).toBe(true);
  });

  test("manifest parsing and digest admission cannot use two different read results", () => {
    const f = fixture(), manifest = readFileSync(f.segment.manifestPath), alternate = Buffer.from(JSON.stringify({ ...f.segment.manifest, segmentId: "seg_untrusted" }, null, 2));
    let reads = 0;
    // listRetentionSegments performs an untrusted discovery parse. The following verifier must hash its own buffer.
    io.read = (path, bytes) => path === f.segment.manifestPath && ++reads === 2
      ? (typeof bytes === "string" ? alternate.toString("utf8") : alternate) : bytes;
    const proof = buildRetentionProofIndex(f.workspace); expect(proof.ok).toBe(false);
    expect(proof.archivedEvents.has(f.row.id)).toBe(false); expect(proof.errors.join("\n")).toContain("manifest digest mismatch");
    io.read = null; expect(readFileSync(f.segment.manifestPath)).toEqual(manifest); expect(verifies(f).ok).toBe(true);
  });

  test("the cumulative prune parser and signature use one captured log read", () => {
    const f = fixture(); appendPrunedRow(f.workspace, "owned-only-prefix-row", sha256Hex("owned prefix"));
    const path = join(f.workspace, ".amc", "blobs", "pruned.jsonl"); let reads = 0;
    io.read = (file, bytes) => file === path && ++reads > 1 ? Buffer.from("owned inconsistent later read\n") : bytes;
    const proof = verifyPrunedRows(f.workspace); expect(proof.ok).toBe(true); expect(proof.rows).toHaveLength(1); expect(reads).toBe(1);
    io.read = null; expect(verifyPrunedRows(f.workspace).ok).toBe(true);
  });

  test.each(["config-signature", "revocation-list"] as const)("a real distinct %s key cannot authorize a raw retention manifest through broad auditor history", purpose => {
    const f = fixture(), original = readFileSync(f.segment.sigPath);
    rotatePurposeKeys({ workspace: f.workspace, purposes: [purpose], passphrase: PASS });
    const key = getSigningPublicKeyPem(f.workspace, purpose);
    expect(getPublicKeyHistory(f.workspace, "auditor")).toContain(key); expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(key);
    const signature = sign(null, Buffer.from(sha256Hex(readFileSync(f.segment.manifestPath)), "hex"), getSigningKey(f.workspace, purpose)).toString("base64");
    const sidecar = JSON.parse(original.toString("utf8")); sidecar.signature = signature;
    try { writeFileSync(f.segment.sigPath, JSON.stringify(sidecar, null, 2)); expect(verifies(f).ok).toBe(false); }
    finally { writeFileSync(f.segment.sigPath, original); }
    expect(verifies(f).ok).toBe(true);
  });

  test("an authenticated explicit owner import remains an unbound historical artifact authority", () => {
    const f = fixture(), original = readFileSync(f.segment.sigPath), pair = generateKeyPairSync("ed25519");
    const pem = pair.publicKey.export({ type: "spki", format: "pem" }).toString(), sidecar = JSON.parse(original.toString("utf8"));
    sidecar.signature = sign(null, Buffer.from(sha256Hex(readFileSync(f.segment.manifestPath)), "hex"), pair.privateKey).toString("base64");
    writeFileSync(f.segment.sigPath, JSON.stringify(sidecar, null, 2)); expect(verifies(f).ok).toBe(false);
    addPublicKeyToHistory(f.workspace, "auditor", pem, "imported"); expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pem);
    lockVault(f.workspace); expect(verifies(f).ok).toBe(true);
  });

  test.each(["corrupt", "missing"] as const)("full default keyset completeness still refuses an auditor alias that is %s", changed => {
    const f = fixture(), path = join(f.workspace, ".amc", "keys", "auditor_ed25519.pub"), bytes = readFileSync(path);
    expect(verifies(f).ok).toBe(true);
    try { if (changed === "missing") rmSync(path); else writeFileSync(path, "owned invalid alias\n"); expect(verifies(f).ok).toBe(false); }
    finally { writeFileSync(path, bytes); }
    expect(verifies(f).ok).toBe(true);
  });
});
