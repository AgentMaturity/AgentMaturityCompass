/** Actual journal read/coverage admission and selected preimage; no verifier/admission mocks. */
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { uncommittedReceiptToken } from "../helpers/uncommittedReceiptToken.js";
import { readReceiptAuthorityState } from "../../src/keys/receiptAuthorityState.js";
import { workspaceIdFromDirectory } from "../../src/workspaces/workspaceId.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { verifyChainIn } from "../../src/actions/actionJournal.js";
import { actionEvidenceCoverage } from "../../src/actions/actionEvidenceCoverage.js";
import { parseReceipt, verifyReceipt } from "../../src/receipts/receipt.js";
import { parseReceiptAuthority, RECEIPT_AUTHORITY_CURRENT } from "../../src/keys/receiptAuthority.js";
import { getPurposeKeyHistory, getSigningKey } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { getPublicKeyHistory, getPublicKeyPem } from "../../src/crypto/keys.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { signTrustList, verifySignedTrustList } from "../../src/trust/trustList.js";
import { writeRetentionSegment, buildRetentionProofIndex } from "../../src/ops/retention/retentionArchive.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { Ledger } from "../../src/ledger/ledger.js";
import type { EvidenceEvent } from "../../src/types.js";
import { JOURNAL_PASS, actionReceiptFixture, cleanupActionReceiptFixtures } from "../helpers/actionJournalReceiptFixture.js";
afterEach(() => { try { vi.restoreAllMocks(); cleanupActionReceiptFixtures(); } finally { vi.unstubAllEnvs(); } });
function edit(ledger: Ledger, change: () => void): void {
  const trigger = ledger.db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='protect_evidence_immutable'").get() as { sql: string };
  ledger.db.exec("DROP TRIGGER protect_evidence_immutable"); try { change(); } finally { ledger.db.exec(trigger.sql); }
}
function first(ledger: Ledger, executionId: string): EvidenceEvent {
  return ledger.db.prepare("SELECT e.* FROM action_transitions t JOIN evidence_events e ON e.id=t.evidence_event_id WHERE t.execution_id=? AND t.seq=0").get(executionId) as EvidenceEvent;
}
function replaceToken(ledger: Ledger, event: EvidenceEvent, token: string): void {
  const meta = { ...JSON.parse(event.meta_json), receipt: token, receipt_sha256: sha256Hex(token) };
  edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(JSON.stringify(meta), event.id));
}
function rawToken(token: string, privateKey: string): string {
  const payload = Buffer.from(canonicalize(parseReceipt(token).payload)); return `${payload.toString("base64url")}.${sign(null, payload, privateKey).toString("base64url")}`;
}

test("actual journal and coverage need independent receipt issuer admission, not its monitor fingerprint", async () => {
  const f = actionReceiptFixture(); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", sha256Hex(getPublicKeyPem(f.workspace, "monitor")));
  await f.own(); const { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a);
  const trusted = f.trust(), absent = { ...trusted, explicitPins: trusted.explicitPins.filter(pin => !pin.purposes.includes("receipt")) };
  expect(verifyChainIn(ledger, a.id, { trust: trusted }).ok).toBe(true);
  expect(actionEvidenceCoverage(f.workspace, f.sessionId, { trust: trusted })).toMatchObject({ status: "evaluated", calls: 1, linked: 1 });
  for (const trust of [absent, undefined]) {
    const chain = verifyChainIn(ledger, a.id, trust === undefined ? {} : { trust });
    expect(chain.ok).toBe(false); expect(chain.errors.join("; ")).toContain("receipt authority invalid");
    expect(actionEvidenceCoverage(f.workspace, f.sessionId, trust === undefined ? {} : { trust }).status).toBe("not_evaluated");
  }
  expect(verifyChainIn(ledger, a.id, { trust: trusted }).ok).toBe(true);
});
test("actual zero-row receipt epoch is admitted before any execution exists", async () => {
  const f = actionReceiptFixture(); await f.own();
  f.reader(ledger => {
    const trusted = f.trust(), absent = { ...trusted, explicitPins: trusted.explicitPins.filter(pin => !pin.purposes.includes("receipt")) };
    expect(verifyChainIn(ledger, "no-action-yet", { trust: trusted })).toMatchObject({ ok: true, receipts: [] });
    const refused = verifyChainIn(ledger, "no-action-yet", { trust: absent }); expect(refused.ok).toBe(false); expect(refused.errors.join("; ")).toContain("receipt authority invalid");
  }); // An empty admitted inventory is not a receipt-chain success claim.
});
test.each(["token", "writer"] as const)("real raw-valid wrong-purpose %s cannot use broad monitor role membership", kind => {
  const f = actionReceiptFixture(false);
  rotatePurposeKeys({ workspace: f.workspace, purposes: [kind === "token" ? "ledger-row" : "receipt"], reason: "purpose-split", passphrase: JOURNAL_PASS });
  const privateKey = getSigningKey(f.workspace, kind === "token" ? "ledger-row" : "receipt");
  const { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a); const event = first(ledger, a.id);
  const meta = JSON.parse(event.meta_json), oldSignature = event.writer_sig;
  if (kind === "token") {
    const replacement = rawToken(meta.receipt, privateKey), [payload, signature] = replacement.split(".");
    expect(getPublicKeyHistory(f.workspace, "monitor").some(key => verify(null, Buffer.from(payload!, "base64url"), key, Buffer.from(signature!, "base64url")))).toBe(true);
    expect(getPurposeKeyHistory(f.workspace, "receipt").some(key => verify(null, Buffer.from(payload!, "base64url"), key, Buffer.from(signature!, "base64url")))).toBe(false);
    replaceToken(ledger, event, replacement);
  } else {
    const replacement = sign(null, Buffer.from(event.event_hash, "hex"), privateKey).toString("base64");
    expect(getPublicKeyHistory(f.workspace, "monitor").some(key => verify(null, Buffer.from(event.event_hash, "hex"), key, Buffer.from(replacement, "base64")))).toBe(true);
    expect(getPurposeKeyHistory(f.workspace, "ledger-row").some(key => verify(null, Buffer.from(event.event_hash, "hex"), key, Buffer.from(replacement, "base64")))).toBe(false);
    edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET writer_sig=? WHERE id=?").run(replacement, event.id));
  }
  expect(verifyChainIn(ledger, a.id).ok).toBe(false);
  edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET meta_json=?,writer_sig=? WHERE id=?").run(event.meta_json, oldSignature, event.id));
  expect(verifyChainIn(ledger, a.id).ok).toBe(true);
});
test("selected unbound ACTION_STATE actual hash rejects changed metadata even with raw-valid stored signatures", () => {
  const f = actionReceiptFixture(false), { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a); const event = first(ledger, a.id);
  expect(verifyChainIn(ledger, a.id).ok).toBe(true);
  edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(event.meta_json), unrelatedSignedMember: "owned changed preimage" }), event.id));
  const refused = verifyChainIn(ledger, a.id); expect(refused.ok).toBe(false); expect(refused.errors.join("; ")).toContain("evidence row hash does not verify");
  edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(event.meta_json, event.id)); expect(verifyChainIn(ledger, a.id).ok).toBe(true);
});
test.each([false, true])("actual signed retention archive and payload pruning preserve journal original inline preimage, bound=%s", async bound => {
  const f = actionReceiptFixture(bound); if (bound) await f.own(); const { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a);
  const events = ledger.db.prepare("SELECT e.* FROM action_transitions t JOIN evidence_events e ON e.id=t.evidence_event_id WHERE t.execution_id=? ORDER BY t.seq").all(a.id) as EvidenceEvent[];
  const segmentId = `owned-action-${a.id}`, segment = writeRetentionSegment({ workspace: f.workspace, segmentId, startTs: events[0]!.ts, endTs: events.at(-1)!.ts,
    eventLines: events.map(event => JSON.stringify(event)), firstEventHash: events[0]!.event_hash, lastEventHash: events.at(-1)!.event_hash, prevSegmentLastEventHash: null,
    prunePolicy: { archivePayloadsAfterDays: 1, prunePayloadsAfterDays: 2 } });
  ledger.markEventsArchived(events.map(event => event.id), segmentId, sha256Hex(readFileSync(segment.manifestPath)));
  ledger.pruneEventPayloadColumns(events.map(event => event.id), Date.now());
  expect(buildRetentionProofIndex(f.workspace).ok).toBe(true);
  expect(first(ledger, a.id).payload_inline).toBeNull(); expect(first(ledger, a.id).canonical_payload_inline).toBe(events[0]!.payload_inline);
  expect(verifyChainIn(ledger, a.id, bound ? { trust: f.trust() } : {}).ok).toBe(true);
});
test("known canonical ACTION_STATE bytes reconstruct a legacy missing inline without skipping signed-hash verification", () => {
  const f = actionReceiptFixture(false), { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a); const event = first(ledger, a.id);
  // Owned legacy-shaped row, not a claim that current retention clears immutable canonical columns.
  edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET payload_inline=NULL,canonical_payload_inline=NULL WHERE id=?").run(event.id));
  expect(verifyChainIn(ledger, a.id).ok).toBe(true);
  edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(event.meta_json), alteredOriginalMember: true }), event.id));
  const refused = verifyChainIn(ledger, a.id); expect(refused.ok).toBe(false); expect(refused.errors.join("; ")).toContain("evidence row hash does not verify");
  edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET payload_inline=?,canonical_payload_inline=?,meta_json=? WHERE id=?").run(event.payload_inline, event.canonical_payload_inline, event.meta_json, event.id));
  expect(verifyChainIn(ledger, a.id).ok).toBe(true);
});
test("raw-valid legacy proof stripping is refused by actual journal epoch/row admission", async () => {
  const f = actionReceiptFixture(); await f.own(); const { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a); const event = first(ledger, a.id);
  const token = JSON.parse(event.meta_json).receipt, replacement = rawToken(token, f.legacyPrivate);
  expect(parseReceipt(replacement).payload).toEqual(parseReceipt(token).payload); replaceToken(ledger, event, replacement);
  const refused = verifyChainIn(ledger, a.id, { trust: f.trust() }); expect(refused.ok).toBe(false); expect(refused.errors.join("; ")).toContain("receipt authority invalid");
  edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(event.meta_json, event.id)); expect(verifyChainIn(ledger, a.id, { trust: f.trust() }).ok).toBe(true);
});
test("real issuer rebind retains old and new journal tokens and locked public verification", async () => {
  const f = actionReceiptFixture(); await f.own(); const firstOpen = f.open(), a = f.action(); f.finish(firstOpen.journal, a);
  f.configure(f.nextId); await f.own(); const nextOpen = f.open(), b = f.action(); f.finish(nextOpen.journal, b);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
  try { f.reader(ledger => { expect(verifyChainIn(ledger, a.id, { trust: f.trust() }).ok).toBe(true); expect(verifyChainIn(ledger, b.id, { trust: f.trust() }).ok).toBe(true); }); }
  finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", JOURNAL_PASS); unlockVault(f.workspace, JOURNAL_PASS); }
});
test("genuine signed child distrust preserves journal refusal after real owner renewal", async () => {
  const f = actionReceiptFixture(); await f.own(); const { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a);
  const cert = parseReceiptAuthority(readFileSync(join(f.workspace, RECEIPT_AUTHORITY_CURRENT))), root = generateKeyPairSync("ed25519"), now = new Date();
  const rootPem = root.publicKey.export({ format: "pem", type: "spki" }).toString();
  const signed = signTrustList({ type: "amc.trust-list", version: 1, listId: "owned-action-child-negative", sequence: 1,
    issuedAt: new Date(now.getTime() - 1000).toISOString(), expiresAt: "2099-01-01T00:00:00.000Z", entries: [],
    distrust: [{ keyId: cert.authority.childKeyId, distrustedFrom: null, reason: "key-compromise", note: "owned negative child", source: "owned operator" }] }, root.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
  const list = verifySignedTrustList(signed, { pinnedRootKeyIds: [signingKeyId(rootPem)!], now });
  const baseTrust = f.trust(), trust = { ...baseTrust, lists: [list], distrust: [...baseTrust.distrust, ...list.distrust] }; expect(verifyChainIn(ledger, a.id, { trust }).ok).toBe(false);
  await f.own(); const fresh = f.open(), b = f.action(); f.finish(fresh.journal, b);
  expect(verifyChainIn(ledger, a.id, { trust }).ok).toBe(false); expect(verifyChainIn(ledger, b.id, { trust }).ok).toBe(false);
  expect(verifyChainIn(ledger, a.id, { trust: f.trust() }).ok).toBe(true); // no negative-policy bypass; independent clean-policy control
});

test("actual default journal rejects a genuine uncommitted receipt child proof without changing original signed row bindings", () => {
  const f = actionReceiptFixture(false), { journal, ledger } = f.open(), a = f.action(); f.finish(journal, a);
  const event = first(ledger, a.id), originalToken = JSON.parse(event.meta_json).receipt as string;
  const made = uncommittedReceiptToken(originalToken, f.legacyPrivate, workspaceIdFromDirectory(f.workspace));
  expect(readReceiptAuthorityState(f.workspace)).toBeNull(); expect(verifyChainIn(ledger, a.id).ok).toBe(true);
  expect(verify(null, made.certificateSigningBytes, made.issuer, Buffer.from(made.signed.signature, "base64"))).toBe(true);
  expect(verify(null, made.childSigningBytes, made.childPem, made.childSignature)).toBe(true);
  expect(verifyReceipt(made.receipt, getPurposeKeyHistory(f.workspace, "receipt")).ok).toBe(true);
  expect(parseReceipt(made.receipt).payload).toEqual(parseReceipt(originalToken).payload);
  replaceToken(ledger, event, made.receipt);
  try {
    const changed = first(ledger, a.id); expect(changed.event_hash).toBe(event.event_hash); expect(changed.writer_sig).toBe(event.writer_sig);
    const originalMeta = JSON.parse(event.meta_json), changedMeta = JSON.parse(changed.meta_json);
    delete originalMeta.receipt; delete originalMeta.receipt_sha256; delete changedMeta.receipt; delete changedMeta.receipt_sha256;
    expect(changedMeta).toEqual(originalMeta);
    const refused = verifyChainIn(ledger, a.id); expect(refused.ok).toBe(false); expect(refused.errors.join("; ")).toContain("receipt authority invalid");
  } finally { edit(ledger, () => ledger.db.prepare("UPDATE evidence_events SET meta_json=? WHERE id=?").run(event.meta_json, event.id)); }
  expect(verifyChainIn(ledger, a.id).ok).toBe(true); f.finish(journal, f.action()); expect(f.fake.requests).toHaveLength(0);
});
