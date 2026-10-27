// Proposed supporting default compatibility whole file; no provider binding or artifact authority is constructed.
import { sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initBlobKey } from "../../src/storage/blobs/blobKeys.js";
import { storeEncryptedBlob, loadBlobPlaintext, verifyBlobIndexChain } from "../../src/storage/blobs/blobStore.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { loadTrustContext } from "../../src/trust/trustContext.js";
import * as blobState from "../../src/keys/blobIndexState.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => { vi.restoreAllMocks(); for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-blob-default-wire-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", "owned-blob-wire-passphrase"); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initBlobKey(workspace); return workspace;
}
test("default blob index retains independent literal v1 bytes, raw32 Ed signature, payload and modes", () => {
  const workspace = fixture(), privateKey = getSigningKey(workspace, "artifact-seal"), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
  const payload = Buffer.from("owned default blob bytes"), out = storeEncryptedBlob(workspace, payload);
  const rowBody = { v: 1, ts: now, blobId: out.blobId, keyVersion: out.keyVersion, path: out.path, payloadSha256: sha256Hex(payload), encryptedBytes: out.encryptedBytes, prev: "" };
  const hash = sha256Hex(canonicalize(rowBody)), row = { ...rowBody, hash }, signature = sign(null, Buffer.from(hash, "hex"), privateKey).toString("base64");
  expect(readFileSync(join(workspace, ".amc/blobs/index.jsonl"))).toEqual(Buffer.from(JSON.stringify(row) + "\n"));
  expect(readFileSync(join(workspace, ".amc/blobs/index.jsonl.sig"))).toEqual(Buffer.from(JSON.stringify({ v: 1, ts: now, lastHash: hash, signature, signer: "auditor" }, null, 2)));
  expect(statSync(join(workspace, ".amc/blobs/index.jsonl.sig")).mode & 0o777).toBe(0o644); expect(statSync(join(workspace, out.path)).mode & 0o777).toBe(0o600);
  expect(loadBlobPlaintext(workspace, out.path).bytes).toEqual(payload); expect(verifyBlobIndexChain(workspace)).toMatchObject({ ok: true, rows: 1 });
});
test("retained unbound no-sign blob branch uses keyVersion0 and recoverable owned random material without a certificate", () => {
  const workspace = fixture(); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(workspace); vi.stubEnv("AMC_NO_SIGN", "1");
  const payload = Buffer.from("owned unvaulted blob"), out = storeEncryptedBlob(workspace, payload), row = JSON.parse(readFileSync(join(workspace, ".amc/blobs/index.jsonl"), "utf8"));
  expect(out.keyVersion).toBe(0); expect(row).toMatchObject({ v: 1, keyVersion: 0 }); expect(row.authoritySha256).toBeUndefined();
  expect(loadBlobPlaintext(workspace, out.path).bytes).toEqual(payload); expect(statSync(join(workspace, ".amc/blobs/unvaulted.key")).mode & 0o777).toBe(0o600);
  expect(verifyBlobIndexChain(workspace).ok).toBe(false); // ephemeral head is not the committed auditor: no fake signature qualification
});


test("unbound intrinsic blob verification does not newly load an unrelated malformed operator trust list", () => {
  const workspace = fixture(); storeEncryptedBlob(workspace, Buffer.from("ordinary intrinsic legacy blob"));
  const trustDir = join(process.env.AMC_HOME!, "trust"); mkdirSync(trustDir, { recursive: true }); writeFileSync(join(trustDir, "amc-trust-list.json"), "not json");
  expect(() => loadTrustContext()).toThrow();
  expect(verifyBlobIndexChain(workspace)).toMatchObject({ ok: true, rows: 1 }); // intrinsic integrity only; no external anchoring claim
});


test("the default writer does not auto-unlock again inside the new publication lock after a real late lock", () => {
  const workspace = fixture(), before = readdirSync(join(workspace, ".amc/blobs")), original = blobState.withBlobIndexLock;
  const spy = vi.spyOn(blobState, "withBlobIndexLock").mockImplementation((root, operation) => { spy.mockRestore(); lockVault(root); return original(root, operation); });
  try { expect(() => storeEncryptedBlob(workspace, Buffer.from("must not publish after lock"))).toThrow("vault was locked before blob publication");
    expect(readdirSync(join(workspace, ".amc/blobs"))).toEqual(before); // passphrase deliberately remains present: implicit unlock would otherwise succeed
  } finally { spy.mockRestore(); unlockVault(workspace, "owned-blob-wire-passphrase"); }
  storeEncryptedBlob(workspace, Buffer.from("restored default writer")); expect(verifyBlobIndexChain(workspace)).toMatchObject({ ok: true, rows: 1 });
});
