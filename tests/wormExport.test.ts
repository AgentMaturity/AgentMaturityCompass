/**
 * P2-09b WORM export with a fake target: refusals for unlocked, short-retention and governance-mode targets; offline
 * verification against a trust list; tamper and unpinned-key failures; idempotent re-export.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openLedger } from "../src/ledger/ledger.js";
import { writeRetentionSegment } from "../src/ops/retention/retentionArchive.js";
import { exportRetentionSegments, verifyWormExport, WormExportRefusedError } from "../src/ops/retention/wormExport.js";
import { filesystemTestTarget, s3ObjectLockTarget, type S3Call } from "../src/ops/retention/wormTargets.js";
import { signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { operatorTrustHome, workspaceKeyPem } from "./helpers/trustContext.js";

const DAY = 86_400_000;
const roots: string[] = [];
let workspace: string;
let bucket: string;
let home: string;

function segmentFrom(ws: string, segmentId: string, prev: string | null): string {
  const ledger = openLedger(ws);
  try {
    ledger.startSession({ sessionId: segmentId, runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
    for (let i = 0; i < 3; i += 1) ledger.appendEvidence({ sessionId: segmentId, runtime: "unknown", eventType: "stdout", payload: `${segmentId} ${i}`, inline: true });
    const rows = ledger.getAllEvents().filter((row) => row.session_id === segmentId);
    writeRetentionSegment({ workspace: ws, segmentId, startTs: rows[0]!.ts, endTs: rows.at(-1)!.ts, eventLines: rows.map((row) => JSON.stringify(row)),
      firstEventHash: rows[0]!.event_hash, lastEventHash: rows.at(-1)!.event_hash, prevSegmentLastEventHash: prev,
      prunePolicy: { prunePayloadsAfterDays: 30, archivePayloadsAfterDays: 7 } });
    return rows.at(-1)!.event_hash;
  } finally {
    ledger.close();
  }
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "amc-worm-"));
  roots.push(root);
  workspace = join(root, "ws");
  bucket = join(root, "bucket");
  mkdirSync(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  segmentFrom(workspace, "seg_a", segmentFrom(workspace, "seg_0", null));
  home = operatorTrustHome([{ publicKeyPem: workspaceKeyPem(workspace, "auditor"), purposes: ["artifact-seal"] }]);
  roots.push(home);
  vi.stubEnv("AMC_HOME", home);
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) { lockVault(join(root, "ws")); rmSync(root, { recursive: true, force: true }); }
});

const retainUntil = (segment: { endTs: number }) => new Date(segment.endTs + 7 * DAY);
const trustList = () => join(home, "trust", "amc-trust-list.json");

describe("WORM export (P2-09b)", () => {
  it("refuses a target without object lock before uploading anything", async () => {
    const target = filesystemTestTarget(bucket, { lock: false });
    await expect(exportRetentionSegments({ workspace, target, retainUntil })).rejects.toThrow(/no object lock/);
    expect(target.puts).toEqual([]);
  });

  it("refuses when the target holds an object for less time than requested", async () => {
    const target = filesystemTestTarget(bucket, { clampRetainUntil: new Date(Date.now() + DAY) });
    await expect(exportRetentionSegments({ workspace, target, retainUntil })).rejects.toThrow(WormExportRefusedError);
  });

  it("refuses when HEAD reports governance mode", async () => {
    const target = filesystemTestTarget(bucket, { mode: "GOVERNANCE" });
    await expect(exportRetentionSegments({ workspace, target, retainUntil })).rejects.toThrow(/GOVERNANCE retention mode, not COMPLIANCE/);
  });

  it("exports, verifies offline against the trust list, and re-exports without new uploads", async () => {
    const target = filesystemTestTarget(bucket);
    const receipt = await exportRetentionSegments({ workspace, target, retainUntil });
    expect(receipt.segments).toBe(2);
    expect(receipt.uploaded).toHaveLength(7);
    const offline = { indexFile: join(bucket, receipt.indexKey), objectsDir: bucket, trustList: trustList() };
    expect(verifyWormExport(offline)).toEqual({ ok: true, errors: [] });

    const again = await exportRetentionSegments({ workspace, target, retainUntil });
    expect(again.uploaded).toEqual([]);
    expect(again.indexSha256).toBe(receipt.indexSha256);
    expect(target.puts).toHaveLength(7);
  });

  it("fails offline verification when one segment byte flips", async () => {
    const receipt = await exportRetentionSegments({ workspace, target: filesystemTestTarget(bucket), retainUntil });
    const copy = join(roots[0]!, "copy");
    cpSync(bucket, copy, { recursive: true });
    const index = JSON.parse(readFileSync(join(copy, receipt.indexKey), "utf8"));
    const segmentKey = index.index.segments[0].segment as string;
    const bytes = readFileSync(join(copy, segmentKey));
    bytes[bytes.length - 5]! ^= 1;
    writeFileSync(join(copy, segmentKey), bytes);
    const verdict = verifyWormExport({ indexFile: join(copy, receipt.indexKey), objectsDir: copy, trustList: trustList() });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toContain(`object sha256 mismatch: ${segmentKey}`);
  });

  it("fails offline verification when the index is signed by a key the trust list does not pin", async () => {
    const receipt = await exportRetentionSegments({ workspace, target: filesystemTestTarget(bucket), retainUntil });
    const stranger = generateKeyPairSync("ed25519");
    const signed = JSON.parse(readFileSync(join(bucket, receipt.indexKey), "utf8"));
    signed.index.signerPublicKeyPem = stranger.publicKey.export({ format: "pem", type: "spki" }).toString();
    signed.digestSha256 = sha256Hex(canonicalize(signed.index));
    signed.signature = signHexDigest(signed.digestSha256, stranger.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
    const forged = join(roots[0]!, "forged-index.json");
    writeFileSync(forged, JSON.stringify(signed));
    const verdict = verifyWormExport({ indexFile: forged, objectsDir: bucket, trustList: trustList() });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toContain("index signature does not verify under a key the trust list pins for artifact-seal");
  });

  it("drives S3 Object Lock with compliance mode, a SHA-256 checksum and no overwrite", async () => {
    const objects = new Map<string, { mode: string; until: Date; checksum: string }>();
    const calls: Array<[string, Record<string, unknown>]> = [];
    const call: S3Call = async (operation, input) => {
      calls.push([operation, input]);
      if (operation === "GetObjectLockConfiguration") return { ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" } };
      if (operation === "PutObject") {
        objects.set(String(input.Key), { mode: String(input.ObjectLockMode), until: input.ObjectLockRetainUntilDate as Date, checksum: String(input.ChecksumSHA256) });
        return { VersionId: "v1", ETag: "\"e\"" };
      }
      const found = objects.get(String(input.Key));
      if (!found) throw Object.assign(new Error("not found"), { name: "NotFound" });
      return { ObjectLockMode: found.mode, ObjectLockRetainUntilDate: found.until, VersionId: "v1", ...(input.ChecksumMode === "ENABLED" ? { ChecksumSHA256: found.checksum } : {}) };
    };
    const receipt = await exportRetentionSegments({ workspace, target: s3ObjectLockTarget({ bucket: "amc-worm", prefix: "ws/", call }), retainUntil });
    const puts = calls.filter(([operation]) => operation === "PutObject").map(([, input]) => input);
    expect(puts).toHaveLength(7);
    expect(puts.every((input) => input.Bucket === "amc-worm" && String(input.Key).startsWith("ws/objects/") && input.ObjectLockMode === "COMPLIANCE"
      && input.IfNoneMatch === "*" && typeof input.ChecksumSHA256 === "string")).toBe(true);
    expect(receipt.uploaded).toHaveLength(7);
    expect(calls.filter(([operation]) => operation === "HeadObject").every(([, input]) => input.ChecksumMode === "ENABLED")).toBe(true);
    expect(existsSync(receipt.localIndexPath)).toBe(true);
    await expect(exportRetentionSegments({ workspace, target: s3ObjectLockTarget({ bucket: "amc-worm", call: async () => ({}) }), retainUntil }))
      .rejects.toThrow(/no object lock/);
  });

  it("refuses an object already present under our key whose content, lock or version is not ours (pre-planted object)", async () => {
    type Stored = { body: Buffer; mode: string; until: Date; version: string };
    const objects = new Map<string, Stored>();
    const call: S3Call = async (operation, input) => {
      if (operation === "GetObjectLockConfiguration") return { ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" } };
      if (operation === "PutObject") {
        objects.set(String(input.Key), { body: input.Body as Buffer, mode: String(input.ObjectLockMode), until: input.ObjectLockRetainUntilDate as Date, version: `v${objects.size + 1}` });
        return { VersionId: `v${objects.size}`, ETag: "\"e\"" };
      }
      const found = objects.get(String(input.Key));
      if (!found) throw Object.assign(new Error("not found"), { name: "NotFound" });
      return { ObjectLockMode: found.mode, ObjectLockRetainUntilDate: found.until, VersionId: found.version,
        ...(input.ChecksumMode === "ENABLED" ? { ChecksumSHA256: Buffer.from(sha256Hex(found.body), "hex").toString("base64") } : {}) };
    };
    // Plant attacker bytes, under a sufficient lock, at the key our first segment will use.
    const { listRetentionSegments } = await import("../src/ops/retention/retentionArchive.js");
    const first = readFileSync(listRetentionSegments(workspace)[0]!.segmentPath);
    objects.set(`objects/${sha256Hex(first)}`, { body: Buffer.from("planted"), mode: "COMPLIANCE", until: new Date(Date.now() + 3650 * DAY), version: "planted" });
    await expect(exportRetentionSegments({ workspace, target: s3ObjectLockTarget({ bucket: "b", call }), retainUntil }))
      .rejects.toThrow(/content does not match/);
    // A genuine re-export whose recorded version id differs from the one the bucket reports is refused too.
    objects.clear();
    await exportRetentionSegments({ workspace, target: s3ObjectLockTarget({ bucket: "b", call }), retainUntil });
    const [key, stored] = [...objects.entries()][0]!;
    objects.set(key, { ...stored, version: "replaced" });
    await expect(exportRetentionSegments({ workspace, target: s3ObjectLockTarget({ bucket: "b", call }), retainUntil }))
      .rejects.toThrow(/version replaced, not the recorded/);
  });
});
