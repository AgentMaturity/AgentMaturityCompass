import { sign, verify } from "node:crypto";
import { statSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { assertKeysetComplete, commitKeyset } from "../../src/keys/keyset.js";
import { verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { RECEIPT_AUTHORITY_CURRENT, RECEIPT_CHILD_FILE, parseReceiptAuthority, receiptAuthoritySigningBytes } from "../../src/keys/receiptAuthority.js";
import { receiptLedgerProblems } from "../../src/keys/receiptSqlAuthority.js";
import { parseReceipt, mintReceipt, verifyReceipt } from "../../src/receipts/receipt.js";
import { mintDelegatedReceipt, parseReceiptTransport } from "../../src/receipts/receiptTransport.js";
import { getReceiptChildKey, lockVault, unlockVault } from "../../src/vault/vault.js";
import { encryptVaultPayload } from "../../src/vault/vaultCrypto.js";
import { loadTrustContext } from "../../src/trust/trustContext.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { publicPem } from "./providerFakes.js";
import { RECEIPT_OWNER_PASS, cleanupReceiptAuthorityFixtures, makeReceiptAuthorityFixture } from "../helpers/receiptAuthorityFixture.js";
const PASS = RECEIPT_OWNER_PASS;
afterEach(() => { vi.restoreAllMocks(); cleanupReceiptAuthorityFixtures(); vi.unstubAllEnvs(); });
function publicErrors(f: ReturnType<typeof makeReceiptAuthorityFixture>, trust = f.trust()) { const ledger = openLedger(f.workspace, { readonly: true }); try { return receiptLedgerProblems(ledger, trust); } finally { ledger.close(); } }

test("default real Ledger receipt remains the exact two-segment Ed25519 UTF-8 wire", () => {
  const f = makeReceiptAuthorityFixture(false), out = f.evidence(), payload = parseReceipt(out.receipt).payload;
  const literal = { v: 1, kind: "guard_check", receipt_id: out.receiptId, ts: out.ts, agentId: "default", providerId: "owned", model: null,
    event_hash: out.eventHash, body_sha256: sha256Hex("owned receipt payload"), session_id: payload.session_id };
  const bytes = Buffer.from(canonicalize(literal), "utf8"), signature = sign(null, bytes, f.legacyPrivate);
  expect(out.receipt).toBe(`${bytes.toString("base64url")}.${signature.toString("base64url")}`);
  expect(out.receipt.split(".")).toHaveLength(2); expect(out.receiptSha256).toBe(sha256Hex(out.receipt));
  expect(verifyReceipt(out.receipt, getPurposeKeyHistory(f.workspace, "receipt")).ok).toBe(true);
  expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(true);
});
test("real internal receipt owner commits a distinct sealed child but normal binding remains disabled", async () => {
  const f = makeReceiptAuthorityFixture(), before = f.state();
  await expect(bindPurposeProviderKey(f.workspace, "receipt", { passphrase: PASS, provider: f.provider })).rejects.toThrow("cannot be bound");
  expect(f.fake.requests).toHaveLength(0); expect(f.state()).toEqual(before);
  const result = await f.own(), bytes = f.read(RECEIPT_AUTHORITY_CURRENT), cert = parseReceiptAuthority(bytes), keys = assertKeysetComplete(f.workspace)!;
  expect(keys.providers?.receipt?.receiptAuthoritySha256).toBe(sha256Hex(bytes)); expect(result.authoritySha256).toBe(sha256Hex(bytes));
  expect(statSync(f.target(RECEIPT_CHILD_FILE)).mode & 0o777).toBe(0o600); expect(f.read(RECEIPT_CHILD_FILE).toString()).not.toContain("PRIVATE KEY");
  expect(Object.values(keys.keys)).not.toContain(result.childKeyId); expect(Object.values(keys.providers ?? {}).map(value => value?.keyId)).not.toContain(result.childKeyId);
  expect(getPurposeKeyHistory(f.workspace, "receipt")).not.toContain(cert.authority.childPublicKeyPem);
  expect(verify("sha256", receiptAuthoritySigningBytes(cert.authority), { key: publicPem(f.a), dsaEncoding: "ieee-p1363" }, Buffer.from(cert.signature, "base64"))).toBe(true);
  await expect(bindPurposeProviderKey(f.workspace, "receipt", { passphrase: PASS, provider: f.provider })).rejects.toThrow("cannot be bound");
});
test("actual bound SQL evidence and outcome use local token crypto with zero per-row provider requests", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const requests = f.fake.requests.length;
  const a = f.evidence(), b = f.outcome(); expect(f.fake.requests).toHaveLength(requests);
  for (const receipt of [a.receipt, b.receipt]) {
    const parsed = parseReceiptTransport(receipt), digest = sha256Hex(f.read(RECEIPT_AUTHORITY_CURRENT));
    expect(verify(null, Buffer.concat([Buffer.from("AMC_LEDGER_RECEIPT_V1\0", "ascii"), Buffer.from(digest, "hex"), parsed.payloadBytes]), parsed.signed.authority.childPublicKeyPem, parsed.signature)).toBe(true);
    expect(verifyWithKey(parsed.payloadBytes, parsed.signed.authority.childPublicKeyPem, parsed.signature)).toBe(false);
    expect(verifyReceipt(receipt, [publicPem(f.a)]).ok).toBe(true); expect(verifyReceipt(receipt, [parsed.signed.authority.childPublicKeyPem]).ok).toBe(false);
  }
  expect(publicErrors(f)).toEqual([]); expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.errors).toEqual([]);
  expect(publicErrors(f, loadTrustContext()).length).toBeGreaterThan(0);
});
test("zero-row receipt boundary requires the independent issuer pin before any token exists", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own();
  expect(publicErrors(f, loadTrustContext())).toHaveLength(1); expect(publicErrors(f)).toEqual([]);
  const noReceipt = { ...f.trust(), explicitPins: f.trust().explicitPins.filter(pin => !pin.purposes.includes("receipt")) };
  expect(publicErrors(f, noReceipt)).toHaveLength(1); expect(publicErrors(f)).toEqual([]);
});
test.each(["distrust", "revoked"] as const)("actual zero-row child %s is negative-only, never a required flat child pin", async kind => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const cert = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT)), id = cert.authority.childKeyId;
  const context = f.trust();
  if (kind === "distrust") context.distrust = [{ keyId: id, distrustedFrom: null, reason: "key-compromise", note: "owned child negative", source: "fixture operator" }];
  else context.lists = [{ type: "amc.trust-list", version: 1, listId: "owned-receipt-child-negative", sequence: 1, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: "2099-01-01T00:00:00.000Z",
    entries: [{ keyId: id, algorithm: "ed25519", publicKeyPem: cert.authority.childPublicKeyPem, purposes: ["receipt"], subject: "owned negative child", source: "operator", validFrom: "2026-01-01T00:00:00.000Z", validTo: null, revokedAt: new Date(Date.now() - 500).toISOString(), revocationReason: "key-compromise" }], distrust: [] }];
  // Contexts are already verified caller inputs here. A separately signed/list-verified fixture is in the owner file.
  expect(publicErrors(f, context)).toHaveLength(1); expect(publicErrors(f)).toEqual([]);
});
test.each(["before", "end"] as const)("live-valid receipt issuer never mints an invalid claimed timestamp at %s of half-open window", async where => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const cert = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT)), before = f.withLedger(ledger => ledger.getAllEvents().length);
  const ts = where === "before" ? Date.parse(cert.authority.notBefore) - 1 : Date.parse(cert.authority.notAfter);
  expect(() => f.evidence({ ts })).toThrow("window"); expect(f.withLedger(ledger => ledger.getAllEvents().length)).toBe(before);
  f.evidence(); expect(publicErrors(f)).toEqual([]);
});
test.each(["locked", "no-sign", "expired"] as const)("actual local %s gate refuses SQL receipt insertion and restores", async state => {
  const f = makeReceiptAuthorityFixture(); await f.own({ hours: 1 / 60 }); const before = f.state(), count = f.fake.requests.length;
  if (state === "locked") { vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); }
  else if (state === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
  else vi.spyOn(Date, "now").mockReturnValue(Date.parse(parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT)).authority.notAfter));
  const validClaim = Date.parse(parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT)).authority.notBefore);
  try { expect(() => f.evidence(state === "expired" ? { ts: validClaim } : {})).toThrow(); expect(f.state()).toEqual(before); expect(f.fake.requests).toHaveLength(count); }
  finally { vi.restoreAllMocks(); vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  f.evidence(); expect(publicErrors(f)).toEqual([]);
});
function replaceToken(f: ReturnType<typeof makeReceiptAuthorityFixture>, id: string, replacement: string, body: () => void) {
  const ledger = openLedger(f.workspace), original = ledger.getEventById(id)!;
  const trigger = ledger.db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='protect_evidence_immutable'").get() as { sql: string };
  const meta = JSON.parse(original.meta_json) as Record<string, unknown>; meta.receipt = replacement; meta.receipt_sha256 = sha256Hex(replacement);
  try { ledger.db.exec("DROP TRIGGER protect_evidence_immutable"); ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(JSON.stringify(meta), id); body(); }
  finally { ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(original.meta_json, id); ledger.db.exec(trigger.sql); ledger.close(); }
}
test("raw-valid legacy proof stripping cannot bypass a real signed receipt row marker", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const out = f.evidence(), parsed = parseReceipt(out.receipt).payload;
  const legacy = mintReceipt({ kind: parsed.kind, receiptId: parsed.receipt_id, ts: parsed.ts, agentId: parsed.agentId, providerId: parsed.providerId, model: parsed.model,
    eventHash: parsed.event_hash, bodySha256: parsed.body_sha256, sessionId: parsed.session_id, privateKeyPem: f.legacyPrivate }).receipt;
  expect(verifyReceipt(legacy, getPurposeKeyHistory(f.workspace, "receipt")).ok).toBe(true); expect(publicErrors(f)).toEqual([]);
  replaceToken(f, out.id, legacy, () => { expect(publicErrors(f)).toHaveLength(1); expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(false); });
  expect(publicErrors(f)).toEqual([]);
});
test("another genuine epoch proof cannot replace a historical row token even when token crypto and row hash remain valid", async () => {
  const f = makeReceiptAuthorityFixture(); const first = await f.own(), out = f.evidence(), payload = parseReceipt(out.receipt).payload;
  await f.own({ now: new Date(first.notBefore) }); const cert = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT));
  const replacement = mintDelegatedReceipt({ kind: payload.kind, receiptId: payload.receipt_id, ts: payload.ts, agentId: payload.agentId, providerId: payload.providerId, model: payload.model,
    eventHash: payload.event_hash, bodySha256: payload.body_sha256, sessionId: payload.session_id }, cert, publicPem(f.a), getReceiptChildKey(f.workspace)).receipt;
  expect(verifyReceipt(replacement, [publicPem(f.a)]).ok).toBe(true);
  replaceToken(f, out.id, replacement, () => expect(publicErrors(f)).toHaveLength(1)); expect(publicErrors(f)).toEqual([]);
});
test("real scheduled issuer change preserves old token crypto and exact receipt history across a zero-row epoch", async () => {
  const f = makeReceiptAuthorityFixture(); const a = await f.own(), one = f.evidence(); f.configure(f.nextId);
  const b = await f.own(); expect(b.issuerKeyId).not.toBe(a.issuerKeyId); expect(b.childKeyId).not.toBe(a.childKeyId);
  expect(publicErrors(f)).toEqual([]); expect(getPurposeKeyHistory(f.workspace, "receipt")).toContain(publicPem(f.a)); expect(getPurposeKeyHistory(f.workspace, "receipt")).toContain(publicPem(f.b));
  const noB = { ...f.trust(), explicitPins: f.trust().explicitPins.filter(pin => pin.keyId !== b.issuerKeyId) }; expect(publicErrors(f, noB)).toHaveLength(1);
  expect(verifyReceipt(one.receipt, [publicPem(f.a)]).ok).toBe(true); const two = f.outcome(); expect(verifyReceipt(two.receipt, [publicPem(f.b)]).ok).toBe(true); expect(publicErrors(f)).toEqual([]);
});
test("unrelated real keyset commit carries receipt archive/child/history pins without a new provider request", async () => {
  const f = makeReceiptAuthorityFixture(); const first = await f.own(), before = assertKeysetComplete(f.workspace)!, count = f.fake.requests.length;
  const next = commitKeyset(f.workspace, { expectedGeneration: before.generation, keys: before.keys, writes: [], providers: before.providers });
  for (const [rel, digest] of Object.entries(before.files).filter(([rel]) => rel.includes("receipt"))) expect(next.files[rel]).toBe(digest);
  expect(next.providers?.receipt?.receiptAuthoritySha256).toBe(first.authoritySha256); f.evidence(); expect(f.fake.requests).toHaveLength(count); expect(publicErrors(f)).toEqual([]);
});
test("nested actual SQL savepoint rollback retains caller ownership and does not commit a failed receipt row", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own();
  f.withLedger(ledger => {
    const before = ledger.getAllEvents().length, sessionId = "owned-savepoint"; ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "owned", binarySha256: sha256Hex("owned") });
    ledger.db.exec("CREATE TEMP TABLE receipt_outer(value TEXT); CREATE TEMP TRIGGER owned_receipt_abort AFTER INSERT ON main.evidence_events BEGIN SELECT RAISE(ABORT, 'owned receipt SQL refusal'); END; BEGIN IMMEDIATE; INSERT INTO receipt_outer VALUES ('before');");
    try {
      expect(() => ledger.appendEvidenceWithReceipt({ sessionId, runtime: "unknown", eventType: "audit", inline: true, payload: "will roll back", meta: { trustTier: "OBSERVED" }, receipt: { kind: "guard_check", agentId: "default", providerId: "owned", model: null, bodySha256: sha256Hex("will roll back") } })).toThrow("owned receipt SQL refusal");
      expect(ledger.db.inTransaction).toBe(true); expect(ledger.db.prepare("SELECT * FROM receipt_outer").all()).toEqual([{ value: "before" }]); expect(ledger.getAllEvents()).toHaveLength(before);
    } finally { if (ledger.db.inTransaction) ledger.db.exec("ROLLBACK"); ledger.db.exec("DROP TRIGGER owned_receipt_abort"); }
    const out = ledger.appendEvidenceWithReceipt({ sessionId, runtime: "unknown", eventType: "audit", inline: true, payload: "fresh", meta: { trustTier: "OBSERVED" }, receipt: { kind: "guard_check", agentId: "default", providerId: "owned", model: null, bodySha256: sha256Hex("fresh") } });
    expect(verifyReceipt(out.receipt, [publicPem(f.a)]).ok).toBe(true); ledger.sealSession(sessionId);
  }); expect(publicErrors(f)).toEqual([]);
});

test("actual committed sealed-child opener refuses a different Ed private key before returning signing capability", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const certificate = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT)), original = f.read(RECEIPT_CHILD_FILE);
  const wrong = Buffer.from(canonicalize({ type: "amc.receipt-child", version: 1, workspaceId: certificate.authority.workspaceId,
    epoch: certificate.authority.epoch, authoritySha256: sha256Hex(f.read(RECEIPT_AUTHORITY_CURRENT)), privateKeyPem: f.b.privateKey.export({ format: "pem", type: "pkcs8" }).toString() }));
  const sealed = JSON.stringify(encryptVaultPayload(wrong, PASS), null, 2), before = assertKeysetComplete(f.workspace)!;
  // Actual owner keyset publication of an owned damaged secret, after a genuine receipt owner commit; no forged binding.
  commitKeyset(f.workspace, { expectedGeneration: before.generation, keys: before.keys, providers: before.providers,
    writes: [{ path: f.target(RECEIPT_CHILD_FILE), bytes: sealed, mode: 0o600 }] });
  try { expect(() => getReceiptChildKey(f.workspace)).toThrow("sealed receipt child cannot be opened"); }
  finally { const current = assertKeysetComplete(f.workspace)!; commitKeyset(f.workspace, { expectedGeneration: current.generation, keys: current.keys, providers: current.providers,
    writes: [{ path: f.target(RECEIPT_CHILD_FILE), bytes: original, mode: 0o600 }] }); }
  f.evidence(); expect(publicErrors(f)).toEqual([]);
});

test("actual bound receipt public reader refuses a missing outcome table at empty and populated epochs and restores", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own();
  expect(f.withLedger(ledger => ledger.getAllEvents())).toEqual([]);
  expect(f.withLedger(ledger => ledger.getAllOutcomeEvents())).toEqual([]);
  const checkMissingTable = () => f.withLedger(ledger => {
    const rows = ledger.db.prepare("SELECT * FROM outcome_events ORDER BY rowid").all();
    expect(receiptLedgerProblems(ledger, f.trust())).toEqual([]);
    ledger.db.exec("ALTER TABLE outcome_events RENAME TO owned_preserved_receipt_outcomes");
    try {
      expect(ledger.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='outcome_events'").get()).toBeUndefined();
      expect(ledger.db.prepare("SELECT * FROM owned_preserved_receipt_outcomes ORDER BY rowid").all()).toEqual(rows);
      // Bound admission must not reinterpret missing current schema as an empty legacy outcome prefix.
      expect(receiptLedgerProblems(ledger, f.trust())).toHaveLength(1);
    } finally { ledger.db.exec("ALTER TABLE owned_preserved_receipt_outcomes RENAME TO outcome_events"); }
    expect(ledger.db.prepare("SELECT * FROM outcome_events ORDER BY rowid").all()).toEqual(rows);
    expect(receiptLedgerProblems(ledger, f.trust())).toEqual([]);
  });
  checkMissingTable(); // Actual committed zero-row epoch, before any token exists.
  const evidence = f.evidence(), outcome = f.outcome();
  expect(verifyReceipt(evidence.receipt, [publicPem(f.a)]).ok).toBe(true);
  expect(verifyReceipt(outcome.receipt, [publicPem(f.a)]).ok).toBe(true);
  checkMissingTable(); // The same fault also preserves and refuses actual receipt-bearing rows.
  f.evidence(); f.outcome();
  expect(publicErrors(f)).toEqual([]);
  expect(verifyLedgerIntegrity(f.workspace, { trust: f.trust() }).chain.ok).toBe(true);
});
