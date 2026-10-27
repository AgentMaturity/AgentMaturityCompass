import { generateKeyPairSync } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { signAmcConfig } from "../../src/workspace.js";
import { assertKeysetComplete, commitKeyset } from "../../src/keys/keyset.js";
import { lockVault, unlockVault, vaultPaths } from "../../src/vault/vault.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { keyRevocationLocation } from "../../src/keys/keyRevocations.js";
import { readAnchoredRevocationList, nextRevocationList, publishSignedRevocationList, revocationListSha256, signRevocationList } from "../../src/keys/revocationList.js";
import { logSequence } from "../../src/keys/anchorLog.js";
import { withControlFileLock } from "../../src/lifecycle/controlFileLock.js";
import { RECEIPT_AUTHORITY_CURRENT, parseReceiptAuthority } from "../../src/keys/receiptAuthority.js";
import { receiptLedgerProblems } from "../../src/keys/receiptSqlAuthority.js";
import { ReceiptAuthorityCommittedError, resumeReceiptAuthorityAnchors } from "../../src/keys/receiptOwnerAnchors.js";
import { verifyReceipt } from "../../src/receipts/receipt.js";
import { signTrustList, verifySignedTrustList } from "../../src/trust/trustList.js";
import { openLedger } from "../../src/ledger/ledger.js";
import * as contained from "../../src/utils/containedFs.js";
import type { KeyProvider } from "../../src/keys/provider.js";
import { publicPem } from "./providerFakes.js";
import type { DistrustEntry } from "../../src/trust/trustList.js";
import { RECEIPT_OWNER_PASS, cleanupReceiptAuthorityFixtures, makeReceiptAuthorityFixture } from "../helpers/receiptAuthorityFixture.js";
const builtin = vi.hoisted(() => ({ entries: [] as DistrustEntry[] }));
vi.mock("../../src/trust/builtInDistrust.js", () => ({ builtInDistrust: () => builtin.entries }));
const PASS = RECEIPT_OWNER_PASS;
afterEach(() => { builtin.entries = []; vi.restoreAllMocks(); cleanupReceiptAuthorityFixtures(); vi.unstubAllEnvs(); });
function pause(provider: KeyProvider) {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(done => { enter = done; }), wait = new Promise<void>(done => { release = done; });
  return { entered, release, provider: { ...provider, sign: async (ref, bytes) => {
    const signature = await provider.sign(ref, bytes);
    if (Buffer.from(bytes).subarray(0, 25).toString() === "AMC_RECEIPT_AUTHORITY_V1\0") { enter(); await wait; }
    return signature;
  } } satisfies KeyProvider };
}
async function reaches(gate: ReturnType<typeof pause>, operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { expect(await Promise.race([gate.entered.then(() => "entered"), operation.then(() => "returned", () => "refused"), new Promise<string>(done => { timer = setTimeout(() => done("provider-boundary-not-reached"), 5000); })])).toBe("entered"); }
  finally { clearTimeout(timer); }
}
function publicErrors(f: ReturnType<typeof makeReceiptAuthorityFixture>, trust = f.trust()) { const ledger = openLedger(f.workspace, { readonly: true }); try { return receiptLedgerProblems(ledger, trust); } finally { ledger.close(); } }

test.each(["prefix", "generation", "signed-config", "vault"] as const)("actual %s drift after checked certificate Sign refuses before replacing the captured owner generation", async change => {
  const f = makeReceiptAuthorityFixture(); if (change === "prefix") await f.own();
  const gate = pause(f.provider), pending = f.own({ provider: gate.provider });
  const outcome = pending.then(value => ({ value }), error => ({ error }));
  try {
    await reaches(gate, pending);
    if (change === "prefix") f.evidence({ text: "actual prior child wins during receipt renewal" });
    if (change === "generation") { const before = assertKeysetComplete(f.workspace)!; commitKeyset(f.workspace, { expectedGeneration: before.generation, keys: before.keys, writes: [], providers: before.providers }); }
    if (change === "signed-config") { const path = f.target(".amc/amc.config.yaml"); writeFileSync(path, readFileSync(path, "utf8") + "\n# owned signed candidate drift\n"); signAmcConfig(f.workspace); }
    if (change === "vault") { vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); }
    const expected = f.state(); gate.release(); expect(await outcome).toHaveProperty("error"); expect(f.state()).toEqual(expected);
  } finally { gate.release(); await outcome; vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  await f.own(); f.evidence(); expect(publicErrors(f)).toEqual([]);
});
test.each(["issuer", "archive"] as const)("a conflicting new immutable %s path between captured read and commit is never overwritten", async kind => {
  const f = makeReceiptAuthorityFixture(), original = contained.readContainedOrNull, conflict = Buffer.from("owned conflicting immutable path"); let path: string | null = null;
  const spy = vi.spyOn(contained, "readContainedOrNull").mockImplementation((workspace, rel, max) => {
    const bytes = original(workspace, rel, max);
    if (workspace === f.workspace && path === null && bytes === null && (kind === "issuer" ? /^\.amc\/keys\/receipt-issuers\/[0-9a-f]{64}\.pub$/ : /^\.amc\/keys\/receipt-authorities\/[0-9a-f]{64}\.json$/).test(rel)) {
      path = rel; contained.writeContained(workspace, rel, conflict, 0o644);
    }
    return bytes;
  });
  const before = f.state();
  try { await expect(f.own()).rejects.toThrow("immutable path changed"); expect(path).not.toBeNull(); expect(f.read(path!)).toEqual(conflict); expect(f.state()).toEqual(before); }
  finally { spy.mockRestore(); if (path !== null) rmSync(f.target(path)); }
  await f.own(); f.evidence(); expect(publicErrors(f)).toEqual([]);
});
test("a raw-invalid provider certificate response cannot publish a receipt child", async () => {
  const f = makeReceiptAuthorityFixture(), before = f.state();
  const bad: KeyProvider = { ...f.provider, sign: async (ref, bytes) => {
    const signature = await f.provider.sign(ref, bytes); return Buffer.from(bytes).subarray(0, 25).toString() === "AMC_RECEIPT_AUTHORITY_V1\0" ? Buffer.alloc(64) : signature;
  } };
  await expect(f.own({ provider: bad })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); expect(f.state()).toEqual(before);
  await f.own(); f.evidence(); expect(publicErrors(f)).toEqual([]);
});
test("an unavailable previous receipt issuer cannot be replaced by a new issuer or vault fallback", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own(); f.configure(f.nextId); const before = f.state();
  const refusing: KeyProvider = { ...f.provider, sign: async (ref, bytes) => { if (ref.id === f.id) throw Object.assign(new Error("owned prior unavailable"), { code: "Unavailable" }); return f.provider.sign(ref, bytes); } };
  await expect(f.own({ provider: refusing })).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" }); expect(f.state()).toEqual(before);
  await f.own(); expect(verifyReceipt(f.evidence().receipt, [publicPem(f.b)]).ok).toBe(true);
});
test("actual expired current child blocks minting but a usable owner and issuer can renew it", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own({ hours: 1 / 60 }); f.evidence();
  const old = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT)), clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(old.authority.notAfter));
  try { expect(() => f.evidence()).toThrow("window"); const next = await f.own(); expect(next.childKeyId).not.toBe(old.authority.childKeyId); f.evidence(); expect(publicErrors(f)).toEqual([]); }
  finally { clock.mockRestore(); }
});
test("real owner-signed child revocation stops minting but does not dead-end owner renewal or erase old public refusal", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own(); f.evidence(); const old = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT));
  const location = keyRevocationLocation(f.workspace), previous = readAnchoredRevocationList(location)!;
  const next = nextRevocationList(previous.list.listId, { sequence: previous.list.sequence, sha256: revocationListSha256(previous.list) }, [...previous.list.revoked, { id: old.authority.childKeyId, kind: "key", revokedAt: new Date().toISOString(), reason: "key-compromise:owned receipt child" }], 0);
  // Low-level real owner list publication; this does not claim a normal CLI child-enrollment/revocation flow.
  withControlFileLock({ root: vaultPaths(f.workspace).keysDir, name: "key-revocations", operation: () => publishSignedRevocationList(location, signRevocationList(next, getSigningKey(f.workspace, "revocation-list")), logSequence) });
  expect(() => f.evidence()).toThrow(); expect(publicErrors(f)).toHaveLength(1);
  const renewed = await f.own(); expect(renewed.childKeyId).not.toBe(old.authority.childKeyId);
  expect(verifyReceipt(f.evidence().receipt, [publicPem(f.a)]).ok).toBe(true); expect(publicErrors(f)).toHaveLength(1); // historical negative is not repaired away
});
test("an actual built-in child distrust decision stops minting but owner renewal remains possible", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const old = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT)); f.evidence();
  // Substitute only the built-in data source; production signing/admission and real owner commit run unchanged.
  builtin.entries = [{ keyId: old.authority.childKeyId, distrustedFrom: null, reason: "key-compromise", note: "owned child decision", source: "fixture built-in data" }];
  expect(() => f.evidence()).toThrow("distrusted"); expect(publicErrors(f, { ...f.trust(), distrust: builtin.entries })).toHaveLength(1);
  const next = await f.own(); expect(next.childKeyId).not.toBe(old.authority.childKeyId);
  expect(verifyReceipt(f.evidence().receipt, [publicPem(f.a)]).ok).toBe(true);
  expect(publicErrors(f, { ...f.trust(), distrust: builtin.entries })).toHaveLength(1);
});
test.each([false, true])("genuinely signed and verified child revocation applies without flat child admission, hasRow=%s", async hasRow => {
  const f = makeReceiptAuthorityFixture(); await f.own(); if (hasRow) f.evidence(); const cert = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT));
  const root = generateKeyPairSync("ed25519"), rootPem = root.publicKey.export({ format: "pem", type: "spki" }).toString(), now = new Date();
  const signed = signTrustList({ type: "amc.trust-list", version: 1, listId: "owned-real-child-negative", sequence: 1, issuedAt: new Date(now.getTime() - 1000).toISOString(), expiresAt: "2099-01-01T00:00:00.000Z",
    entries: [{ keyId: cert.authority.childKeyId, algorithm: "ed25519", publicKeyPem: cert.authority.childPublicKeyPem, purposes: ["receipt"], subject: "owned child", source: "operator", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, revokedAt: new Date(now.getTime() - 500).toISOString(), revocationReason: "key-compromise" }], distrust: [] }, root.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
  const list = verifySignedTrustList(signed, { pinnedRootKeyIds: [signingKeyId(rootPem)!], now });
  expect(publicErrors(f)).toEqual([]); expect(publicErrors(f, { ...f.trust(), lists: [list] })).toHaveLength(1); expect(publicErrors(f)).toEqual([]);
});
test("postcommit log refusal retains committed generation and native cause; actual internal recovery is idempotent", async () => {
  const f = makeReceiptAuthorityFixture(), file = loadKeyProvider(f.workspace, "file"), prior = file.sign;
  const spy = vi.spyOn(file, "sign").mockImplementation(async () => { throw new Error("owned file anchor failure"); });
  let failure: unknown;
  try { await f.own(); } catch (error) { failure = error; }
  finally { spy.mockRestore(); }
  expect(failure).toBeInstanceOf(ReceiptAuthorityCommittedError); expect(failure).toMatchObject({ committed: true, phase: "rotation-log" }); expect((failure as Error).cause).toBeDefined();
  expect(assertKeysetComplete(f.workspace)!.providers?.receipt?.receiptAuthoritySha256).toBeDefined();
  await expect(f.own()).rejects.toThrow("prior anchors are incomplete");
  await resumeReceiptAuthorityAnchors(f.workspace); const bytes = f.read(".amc/transparency/log.jsonl"); await resumeReceiptAuthorityAnchors(f.workspace); expect(f.read(".amc/transparency/log.jsonl")).toEqual(bytes);
  expect(file.sign).toBe(prior); f.evidence(); expect(publicErrors(f)).toEqual([]);
});
