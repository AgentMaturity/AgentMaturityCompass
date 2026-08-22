import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBlobKeyMaterial, ensureBlobKey, blobsRoot } from "../../src/storage/blobs/blobKeys.js";

/**
 * Blobs written without a vault were encrypted with a constant that ships in
 * the public source: `amc-no-sign-fallback-key-32bytes!`. Anyone holding a
 * workspace could decrypt every evidence payload with a string from GitHub.
 *
 * It mattered because blob files travel — exportEvidenceBundle copies
 * .amc/blobs/* into the portable .amcbundle, the artifact the product tells an
 * operator to hand to a third party — and because no-sign is not always a
 * choice: a vault that fails to unlock switches the mode on by itself, so
 * losing a passphrase silently started producing evidence anyone could read.
 */
describe("blob keys without a vault", () => {
  let workspace: string;
  const previous = process.env["AMC_NO_SIGN"];

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-blobkey-"));
    process.env["AMC_NO_SIGN"] = "1";
  });
  afterEach(() => {
    if (previous === undefined) delete process.env["AMC_NO_SIGN"];
    else process.env["AMC_NO_SIGN"] = previous;
    rmSync(workspace, { recursive: true, force: true });
  });

  const LEGACY = Buffer.from("amc-no-sign-fallback-key-32bytes!", "utf8").subarray(0, 32);

  it("never uses the published constant for a new workspace", () => {
    const key = readBlobKeyMaterial(workspace, 0);
    expect(key.length).toBe(32);
    expect(key.equals(LEGACY), "a key printed in the source is not a key").toBe(false);
  });

  it("generates a different key per workspace", () => {
    const other = mkdtempSync(join(tmpdir(), "amc-blobkey-b-"));
    try {
      const a = readBlobKeyMaterial(workspace, 0);
      const b = readBlobKeyMaterial(other, 0);
      // A shared key means one compromised workspace reads every other.
      expect(a.equals(b)).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("is stable across calls, so blobs stay readable", () => {
    const first = readBlobKeyMaterial(workspace, 0);
    const second = readBlobKeyMaterial(workspace, 0);
    expect(first.equals(second)).toBe(true);
  });

  it("stores the key 0600 — it is the only thing protecting these blobs", () => {
    readBlobKeyMaterial(workspace, 0);
    const path = join(blobsRoot(workspace), "unvaulted.key");
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("marks unvaulted blobs with a distinct key version", () => {
    // An auditor must be able to tell these were written without vault
    // protection; a weaker guarantee stated is not the same as one disguised.
    expect(ensureBlobKey(workspace).keyVersion).toBe(0);
  });

  it("still reads blobs written with the old constant", () => {
    // Backward compatibility: existing workspaces must not lose their evidence.
    // No-sign mode used to stamp keyVersion 1 and encrypt with the constant.
    const key = readBlobKeyMaterial(workspace, 1);
    expect(key.equals(LEGACY), "old no-sign blobs must stay readable").toBe(true);
  });
});

describe("blob round trip without a vault", () => {
  let workspace: string;
  const previous = process.env["AMC_NO_SIGN"];

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-blobrt-"));
    process.env["AMC_NO_SIGN"] = "1";
  });
  afterEach(() => {
    if (previous === undefined) delete process.env["AMC_NO_SIGN"];
    else process.env["AMC_NO_SIGN"] = previous;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("stores and reads back a blob, and the ciphertext resists the old constant", async () => {
    const { storeEncryptedBlob, loadBlobPlaintext } = await import("../../src/storage/blobs/blobStore.js");
    const { decryptBlobV1, decodeBlobV1 } = await import("../../src/storage/blobs/blobEncryptor.js");
    const secret = Buffer.from("board minutes: the incident was disclosed late", "utf8");

    const stored = storeEncryptedBlob(workspace, secret);
    expect(loadBlobPlaintext(workspace, stored.path).bytes.equals(secret)).toBe(true);

    // The point of the fix: someone holding the workspace and the published
    // source cannot open it with the constant that used to be the key.
    const envelope = decodeBlobV1(readFileSync(join(workspace, stored.path)));
    const blobId = stored.blobId;

    // Positive control: with the workspace's real key the same call succeeds,
    // so the failure below is about the key and not about a malformed call.
    expect(
      decryptBlobV1({ blobId, envelope, key: readBlobKeyMaterial(workspace, envelope.keyVersion) }).equals(secret)
    ).toBe(true);

    expect(() =>
      decryptBlobV1({
        blobId,
        envelope,
        key: Buffer.from("amc-no-sign-fallback-key-32bytes!", "utf8").subarray(0, 32)
      })
    ).toThrow();
  });

  it("refuses to rotate a key it cannot seal", async () => {
    const { rotateBlobKey } = await import("../../src/storage/blobs/blobKeys.js");
    // A rotation here would mint a version whose reads resolve to the legacy
    // constant — every later blob would be unrecoverable.
    expect(() => rotateBlobKey(workspace)).toThrow(/without a vault/);
  });
});
