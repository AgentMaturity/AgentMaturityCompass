/**
 * Fixture reviewers for the P1-34 tests: Ed25519 keys made per run, a trust list signed by a fixture root and verified
 * as loadTrustContext verifies lists, and review records signed with those keys. Subjects are labels, not people.
 */
import { generateKeyPairSync } from "node:crypto";
import { signReviewRecord, type ReviewRecord } from "../../../src/catalog/governance/reviewRecord.js";
import { ed25519KeyId, signTrustList, verifySignedTrustList, type KeyPurpose, type SignedTrustList, type TrustContext } from "../../../src/trust/index.js";

export const NOW = new Date("2026-10-18T12:00:00Z");
export const SUBJECT = { kind: "control", id: "L1-WLT-US-01", version: "0.1.0", digest: `sha256:${"a".repeat(64)}` } as const;
export type Key = { privateKeyPem: string; publicKeyPem: string };
export const keypair = (): Key => {
  const k = generateKeyPairSync("ed25519");
  return { privateKeyPem: k.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicKeyPem: k.publicKey.export({ format: "pem", type: "spki" }).toString() };
};
export const root = keypair();
export const [keyA, keyB, keyC, keyLegal, author] = [keypair(), keypair(), keypair(), keypair(), keypair()];

type Pin = { key: Key; subject: string; purposes?: KeyPurpose[]; revoked?: boolean };

/** A trust list signed by the fixture root, pinning these keys from 2026-01-01. */
export function signedList(pins: Pin[]): SignedTrustList {
  return signTrustList({ type: "amc.trust-list", version: 1, listId: "test-reviewers", sequence: 1,
    issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", distrust: [],
    entries: pins.map((p) => ({ keyId: ed25519KeyId(p.key.publicKeyPem)!, algorithm: "ed25519" as const, publicKeyPem: p.key.publicKeyPem,
      purposes: p.purposes ?? ["catalog-review"], subject: p.subject, validFrom: "2026-01-01T00:00:00.000Z", validTo: null, source: "operator",
      ...(p.revoked ? { revokedAt: "2026-06-01T00:00:00.000Z", revocationReason: "key-compromise" as const } : {}) })) }, root.privateKeyPem);
}

/** An operator trust context whose one signed list pins these keys, verified as loadTrustContext verifies lists. */
export function trust(pins: Pin[], over: Partial<TrustContext> = {}): TrustContext {
  const list = verifySignedTrustList(signedList(pins), { pinnedRootKeyIds: [ed25519KeyId(root.publicKeyPem)!], now: NOW });
  return { mode: "pinned", asOf: NOW, lists: [list], explicitPins: [], distrust: [], allowUnpinned: false, allowUnanchored: false, ...over };
}
export const REVIEWERS = trust([{ key: keyA, subject: "fixture-reviewer-a" }, { key: keyB, subject: "fixture-reviewer-b" },
  { key: keyC, subject: "fixture-reviewer-c" }, { key: keyLegal, subject: "fixture-legal" }, { key: author, subject: "fixture-author" }]);

export function record(key: Key, userId: string, over: Partial<Omit<ReviewRecord, "signature">> = {}): ReviewRecord {
  return signReviewRecord({
    recordVersion: 1, id: `rr-${userId}`, subject: SUBJECT, role: "domain_lead",
    reviewer: { name: `Fixture ${userId}`, credential: "fixture credential", affiliation: "fixture", conflictsDeclared: "none (fixture)", identity: { userId, kind: "human" } },
    decision: "approve", scope: ["statement", "citations"], aiInputs: [], notes: "", decidedAt: "2026-10-18", nextReviewDue: "2026-11-17", ...over
  }, key);
}
