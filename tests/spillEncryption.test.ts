import {
  chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readSync,
  renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, writeSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault, setVaultSecret } from "../src/vault/vault.js";
import { blobCurrentKeyPath, blobCurrentKeySigPath, initBlobKey, rotateBlobKey, signBlobCurrentKey } from "../src/storage/blobs/blobKeys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { opsPolicyPath, opsPolicySigPath } from "../src/ops/policy.js";
import {
  inspectSpillObject, readSpilled, removeSpillObject, restoreSpillObject,
  SessionSpillStore, spillRoot, type SpillObject
} from "../src/session/spill/spillStore.js";
import { decryptSpillBytes, SpillKeyUnavailableError, validateSpillEnvelope } from "../src/session/spill/spillEncryption.js";
import { formatSpillLocator, isSpillRef, parseSpillLocator, type SpillRef, type SpillRefV2 } from "../src/session/spill/spillTypes.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, writeSync: vi.fn(actual.writeSync), readSync: vi.fn(actual.readSync) };
});
const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
const PASS = "temporary-spill-encryption-fixture";

function refFor(object: SpillObject): SpillRefV2 {
  return {
    v: 2, format: object.format, keyVersion: object.keyVersion,
    encodedBytes: object.encodedBytes, encodedSha256: object.encodedSha256,
    locator: object.locator, contentSha256: object.sha256, bytes: object.bytes,
    previewBytes: 16, maxInlineBytes: 128, retrievalHint: "retrieve signed evidence", unretrievable: null
  };
}

describe("retained spill encryption and publication", () => {
  let workspace: string;
  let store: SessionSpillStore;
  let priorPass: string | undefined;
  let priorNoSign: string | undefined;

  beforeEach(() => {
    vi.mocked(writeSync).mockImplementation(realFs.writeSync);
    vi.mocked(readSync).mockImplementation(realFs.readSync);
    priorPass = process.env.AMC_VAULT_PASSPHRASE;
    priorNoSign = process.env.AMC_NO_SIGN;
    process.env.AMC_VAULT_PASSPHRASE = PASS;
    delete process.env.AMC_NO_SIGN;
    workspace = mkdtempSync(join(tmpdir(), "amc-spill-encryption-"));
    // These are temporary test-owned keys. The storage implementation never
    // provisions, repairs, rotates, unlocks or persists a production key.
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    initBlobKey(workspace);
    store = new SessionSpillStore(workspace, "session-a");
  });

  afterEach(() => {
    vi.mocked(writeSync).mockImplementation(realFs.writeSync);
    vi.mocked(readSync).mockImplementation(realFs.readSync);
    lockVault(workspace);
    rmSync(workspace, { recursive: true, force: true });
    if (priorPass === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = priorPass;
    if (priorNoSign === undefined) delete process.env.AMC_NO_SIGN;
    else process.env.AMC_NO_SIGN = priorNoSign;
  });

  it("prepares only in memory and publishes encrypted bytes from the input snapshot", () => {
    const plaintext = Buffer.from("private retained tool result ".repeat(30));
    const expected = Buffer.from(plaintext);
    const prepared = store.prepare("../tool-call", plaintext);
    expect(existsSync(spillRoot(workspace))).toBe(false);
    expect(existsSync(prepared.object.path)).toBe(false);
    expect(Object.isFrozen(prepared.object)).toBe(true);
    expect(parseSpillLocator(prepared.object.locator)?.version).toBe(2);
    plaintext.fill(0);
    const object = prepared.persist();
    const encoded = readFileSync(object.path);
    expect(encoded.includes(expected)).toBe(false);
    expect(encoded.subarray(0, 11).toString("ascii")).toBe("AMC_BLOB_V1");
    expect(sha256Hex(encoded)).toBe(object.encodedSha256);
    expect(statSync(dirname(object.path)).mode & 0o777).toBe(0o700);
    expect(statSync(object.path).mode & 0o777).toBe(0o600);
    expect(readSpilled(workspace, refFor(object))).toEqual({ status: "ok", bytes: expected, detail: null });
    expect(() => prepared.persist()).toThrow("already attempted");
    expect(readFileSync(object.path)).toEqual(encoded);
  });

  it("requires a completed commitment callback before any publication", () => {
    const legacyCall = store.write.bind(store) as (name: string, bytes: Buffer) => SpillObject;
    expect(() => legacyCall("call", Buffer.from("payload"))).toThrow("signed commitment callback");
    expect(() => store.write("call", Buffer.from("payload"), () => { throw new Error("signature unavailable"); })).toThrow("signature unavailable");
    expect(existsSync(spillRoot(workspace))).toBe(false);
    const object = store.write("call", Buffer.from("payload"), (pending) => {
      expect(existsSync(pending.path)).toBe(false);
      expect(existsSync(spillRoot(workspace))).toBe(false);
      expect(pending.encodedSha256).toHaveLength(64);
    });
    expect(readSpilled(workspace, refFor(object)).status).toBe("ok");
  });

  it("refuses asynchronous commitment callbacks without writing", () => {
    expect(() => store.write("call", Buffer.from("payload"), async () => undefined)).toThrow("synchronously");
    expect(existsSync(spillRoot(workspace))).toBe(false);
  });

  it("finishes short writes instead of publishing a truncated object", () => {
    const prepared = store.prepare("short-write", Buffer.from("payload ".repeat(60)));
    let writes = 0;
    vi.mocked(writeSync).mockImplementation(((fd: number, bytes: Uint8Array, offset: number, length: number, position: number) => {
      writes += 1;
      return realFs.writeSync(fd, bytes, offset, Math.max(1, Math.floor(length / 2)), position);
    }) as typeof writeSync);
    const object = prepared.persist();
    expect(writes).toBeGreaterThan(1);
    expect(readSpilled(workspace, refFor(object)).status).toBe("ok");
  });

  it("removes its partial file when a write makes no progress", () => {
    const prepared = store.prepare("failed-write", Buffer.from("payload"));
    vi.mocked(writeSync).mockImplementation((() => 0) as typeof writeSync);
    expect(() => prepared.persist()).toThrow("no progress");
    expect(existsSync(prepared.object.path)).toBe(false);
  });

  it("does not overwrite a name planted after preparation", () => {
    const prepared = store.prepare("collision", Buffer.from("payload"));
    mkdirSync(dirname(prepared.object.path), { recursive: true, mode: 0o700 });
    writeFileSync(prepared.object.path, "existing owner data", { mode: 0o600 });
    expect(() => prepared.persist()).toThrow();
    expect(readFileSync(prepared.object.path, "utf8")).toBe("existing owner data");
  });

  it("refuses no-sign mode without creating an unvaulted spill key", () => {
    process.env.AMC_NO_SIGN = "1";
    expect(() => store.prepare("call", Buffer.from("payload"))).toThrow(SpillKeyUnavailableError);
    expect(existsSync(join(workspace, ".amc", "blobs", "unvaulted.key"))).toBe(false);
    expect(existsSync(spillRoot(workspace))).toBe(false);
  });

  it.each(["metadata", "signature"])("does not repair missing current key %s", (which) => {
    const path = which === "metadata" ? blobCurrentKeyPath(workspace) : blobCurrentKeySigPath(workspace);
    unlinkSync(path);
    expect(() => store.prepare("call", Buffer.from("payload"))).toThrow(SpillKeyUnavailableError);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(spillRoot(workspace))).toBe(false);
  });

  it("rejects tampered current metadata instead of selecting its unverified version", () => {
    const path = blobCurrentKeyPath(workspace);
    const metadata = JSON.parse(readFileSync(path, "utf8"));
    metadata.keyVersion = 2;
    writeFileSync(path, JSON.stringify(metadata));
    expect(() => store.prepare("call", Buffer.from("payload"))).toThrow("signature verification failed");
    expect(existsSync(spillRoot(workspace))).toBe(false);
  });

  it("refuses unsigned or tampered operations policy before trusting its size limit", () => {
    const path = opsPolicyPath(workspace);
    const original = readFileSync(path, "utf8");
    const signaturePath = opsPolicySigPath(workspace);
    const signature = readFileSync(signaturePath);
    unlinkSync(signaturePath);
    expect(() => store.prepare("unsigned-policy", Buffer.from("payload"))).toThrow();
    expect(existsSync(spillRoot(workspace))).toBe(false);
    writeFileSync(signaturePath, signature);
    // A still-valid YAML edit must fail on authentication, not schema shape.
    writeFileSync(path, original.replace(/maxBlobBytes: \d+/, "maxBlobBytes: 10485761"));
    expect(readFileSync(path, "utf8")).not.toBe(original);
    expect(() => store.prepare("tampered-policy", Buffer.from("payload"))).toThrow("policy signature verification failed");
    expect(existsSync(spillRoot(workspace))).toBe(false);
  });

  it.each([0, 0x100000000])("refuses signed unsupported key version %s before encoding", (version) => {
    const path = blobCurrentKeyPath(workspace);
    const metadata = JSON.parse(readFileSync(path, "utf8"));
    metadata.keyVersion = version;
    writeFileSync(path, JSON.stringify(metadata));
    signBlobCurrentKey(workspace);
    expect(() => store.prepare("call", Buffer.from("payload"))).toThrow("positive uint32");
    expect(existsSync(spillRoot(workspace))).toBe(false);
  });

  it("distinguishes unavailable key material from missing or corrupt evidence", () => {
    const object = store.prepare("call", Buffer.from("payload")).persist();
    const ref = refFor(object);
    const encoded = readFileSync(object.path);
    setVaultSecret(workspace, `vault.secrets.blobKeys.${object.keyVersion}`, "");
    expect(readSpilled(workspace, ref).status).toBe("key-unavailable");
    expect(readFileSync(object.path)).toEqual(encoded);
    expect(inspectSpillObject(workspace, ref).status).toBe("ok");
  });

  it("uses read-only vault access when supplied, then refuses after credentials disappear", () => {
    const object = store.prepare("call", Buffer.from("payload")).persist();
    const ref = refFor(object);
    lockVault(workspace);
    expect(readSpilled(workspace, ref).status).toBe("ok");
    delete process.env.AMC_VAULT_PASSPHRASE;
    expect(readSpilled(workspace, ref).status).toBe("key-unavailable");
    expect(() => store.prepare("later", Buffer.from("payload"))).toThrow(SpillKeyUnavailableError);
    process.env.AMC_NO_SIGN = "1";
    expect(readSpilled(workspace, ref).status).toBe("key-unavailable");
    expect(inspectSpillObject(workspace, ref).status).toBe("ok");
  });

  it("reads historical keys after rotation even when current metadata disappears", () => {
    const object = store.prepare("old", Buffer.from("historical payload")).persist();
    rotateBlobKey(workspace);
    expect(readSpilled(workspace, refFor(object)).status).toBe("ok");
    unlinkSync(blobCurrentKeyPath(workspace));
    expect(readSpilled(workspace, refFor(object)).status).toBe("ok");
  });

  it("rejects changed ciphertext and donor objects without plaintext downgrade", () => {
    const first = store.prepare("first", Buffer.from("first payload")).persist();
    const second = store.prepare("second", Buffer.from("other payload")).persist();
    writeFileSync(first.path, readFileSync(second.path));
    expect(readSpilled(workspace, refFor(first)).status).toBe("tampered");
    expect(inspectSpillObject(workspace, refFor(first)).status).toBe("tampered");
    writeFileSync(first.path, "first payload");
    expect(readSpilled(workspace, refFor(first)).status).toBe("tampered");
  });

  it("checks the authentication tag even when a supplied envelope digest matches", () => {
    const object = store.prepare("tag", Buffer.from("payload")).persist();
    const encoded = readFileSync(object.path);
    encoded[encoded.length - 1] = encoded[encoded.length - 1]! ^ 1;
    const forged = { ...refFor(object), encodedSha256: sha256Hex(encoded) };
    // This deliberately supplies new metadata directly to the low-level reader;
    // the separate evidence tests must refuse a forged signed reference first.
    expect(() => validateSpillEnvelope(forged, encoded)).not.toThrow();
    expect(() => decryptSpillBytes(workspace, forged, encoded)).toThrow();
    writeFileSync(object.path, encoded);
    expect(readSpilled(workspace, forged).status).toBe("tampered");
  });

  it("rejects malformed framing and cross-session AAD even with a matching encoded digest", () => {
    const object = store.prepare("frame", Buffer.from("payload")).persist();
    const encoded = readFileSync(object.path);
    const changedLocator = object.locator.replace(store.sessionHash, sha256Hex("another-session"));
    expect(() => validateSpillEnvelope({ ...refFor(object), locator: changedLocator }, encoded)).toThrow("metadata");
    encoded[0] = encoded[0]! ^ 1;
    expect(() => validateSpillEnvelope({ ...refFor(object), encodedSha256: sha256Hex(encoded) }, encoded)).toThrow("magic");
  });

  it("returns no bytes after a regular object is replaced during its descriptor read", () => {
    const object = store.prepare("replace", Buffer.from("payload")).persist();
    let swapped = false;
    vi.mocked(readSync).mockImplementation(((fd: number, bytes: Uint8Array, offset: number, length: number, position: number) => {
      const count = realFs.readSync(fd, bytes, offset, length, position);
      if (!swapped) {
        swapped = true;
        renameSync(object.path, `${object.path}.old`);
        writeFileSync(object.path, "replacement", { mode: 0o600 });
      }
      return count;
    }) as typeof readSync);
    const result = readSpilled(workspace, refFor(object));
    expect(result.status).toBe("tampered");
    expect(result.bytes).toBeNull();
  });

  it("refuses symbolic and hard linked objects for reading and erasure", () => {
    const object = store.prepare("links", Buffer.from("payload")).persist();
    const alias = join(workspace, "linked-object");
    linkSync(object.path, alias);
    expect(readSpilled(workspace, refFor(object)).status).toBe("tampered");
    expect(() => removeSpillObject(workspace, refFor(object))).toThrow("hard links");
    unlinkSync(alias);
    renameSync(object.path, alias);
    symlinkSync(alias, object.path);
    expect(readSpilled(workspace, refFor(object)).status).toBe("tampered");
    expect(() => removeSpillObject(workspace, refFor(object))).toThrow();
    expect(readFileSync(alias).length).toBe(object.encodedBytes);
  });

  it("refuses a linked parent and an exposed private directory", () => {
    const prepared = store.prepare("ancestor", Buffer.from("payload"));
    const elsewhere = join(workspace, "elsewhere");
    mkdirSync(elsewhere, { mode: 0o700 });
    symlinkSync(elsewhere, spillRoot(workspace));
    expect(() => prepared.persist()).toThrow("unsafe file type");
    expect(realFs.readdirSync(elsewhere)).toEqual([]);
    unlinkSync(spillRoot(workspace));
    mkdirSync(spillRoot(workspace), { mode: 0o700 });
    chmodSync(spillRoot(workspace), 0o755);
    expect(() => store.prepare("exposed", Buffer.from("payload")).persist()).toThrow("permissions");
  });

  it("restores authenticated ciphertext without keys and never overwrites it", () => {
    const object = store.prepare("export", Buffer.from("payload")).persist();
    const ref = refFor(object);
    const inspected = inspectSpillObject(workspace, ref);
    expect(inspected.status).toBe("ok");
    if (inspected.status !== "ok") throw new Error("expected ciphertext fixture");
    const destination = join(workspace, "destination");
    mkdirSync(destination, { mode: 0o700 });
    restoreSpillObject(destination, ref, inspected.encoded);
    expect(inspectSpillObject(destination, ref).status).toBe("ok");
    expect(readSpilled(destination, ref).status).toBe("key-unavailable");
    expect(() => restoreSpillObject(destination, ref, inspected.encoded)).toThrow();
    expect(removeSpillObject(destination, ref)).toBe("removed");
    expect(readSpilled(destination, ref).status).toBe("missing");
    expect(removeSpillObject(destination, ref)).toBe("missing");
  });

  it("reads v1 plaintext only by an explicit legacy reference and excludes it from transport", () => {
    const objectName = `${"a".repeat(32)}-legacy`;
    const locator = formatSpillLocator({ sessionHash: store.sessionHash, objectName });
    const bytes = Buffer.from("historical plaintext");
    const path = join(spillRoot(workspace), `session-${store.sessionHash}`, objectName);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, bytes, { mode: 0o600 });
    const ref: SpillRef = {
      v: 1, locator, contentSha256: sha256Hex(bytes), bytes: bytes.length,
      previewBytes: 4, maxInlineBytes: 8, retrievalHint: "legacy", unretrievable: null
    };
    expect(readSpilled(workspace, ref)).toEqual({ status: "ok", bytes, detail: null });
    expect(inspectSpillObject(workspace, ref).status).toBe("legacy-plaintext");
    expect(() => restoreSpillObject(workspace, ref, bytes)).toThrow("encrypted");
    expect(parseSpillLocator(locator)?.version).toBe(1);
    expect(parseSpillLocator(locator.replace(":v1:", ":v3:"))).toBeNull();
    expect(parseSpillLocator(`${locator}\n`)).toBeNull();
    expect(readSpilled(workspace, { ...ref, locator: locator.replace(":v1:", ":v2:") }).status).toBe("invalid-locator");
  });

  it("preserves both v2 unavailable forms and refuses unsupported reference versions", () => {
    const object = store.prepare("unavailable", Buffer.from("payload")).object;
    const failed = { ...refFor(object), locator: null, unretrievable: "publication failed" };
    expect(isSpillRef(failed)).toBe(true);
    expect(isSpillRef({ ...failed, keyVersion: null, encodedBytes: null, encodedSha256: null })).toBe(true);
    expect(isSpillRef({ ...failed, keyVersion: null })).toBe(false);
    expect(isSpillRef({ ...failed, v: 3 })).toBe(false);
    expect(readSpilled(workspace, failed).status).toBe("unretrievable");
  });
});
