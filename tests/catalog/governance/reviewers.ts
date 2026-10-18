/**
 * Fixture reviewers for the P1-34 tests: Ed25519 keys made per run, an operator AMC home whose signed trust list (fixture
 * root, pinned in trust-roots.json) pins them for catalog-review, review records signed over a control's current digest,
 * and the review authority effectiveSupport takes. Subjects are fixture labels, not people.
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { signReviewRecord, type ReviewRecord } from "../../../src/catalog/governance/reviewRecord.js";
import type { ReviewAuthority } from "../../../src/catalog/governance/support.js";
import { controlDigest } from "../../../src/catalog/digest.js";
import type { ControlRecord } from "../../../src/catalog/types.js";
import { REGULATORY_REGISTER } from "../../../src/compliance/regulatory/index.js";
import { ed25519KeyId, signTrustList, type DistrustEntry, type KeyPurpose } from "../../../src/trust/index.js";

export const NOW = new Date("2026-10-18T12:00:00Z");
export type Key = { privateKeyPem: string; publicKeyPem: string };
export const keypair = (): Key => {
  const k = generateKeyPairSync("ed25519");
  return { privateKeyPem: k.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicKeyPem: k.publicKey.export({ format: "pem", type: "spki" }).toString() };
};
export const root = keypair();
export const [keyA, keyB, keyC, keyLegal, author] = [keypair(), keypair(), keypair(), keypair(), keypair()];
export const AUTHOR = "Fixture Author <author@fixture.test>";

type Pin = { key: Key; subject: string; purposes?: KeyPurpose[]; revoked?: boolean; validFrom?: string };
export const PINS: Pin[] = [{ key: keyA, subject: "fixture-reviewer-a" }, { key: keyB, subject: "fixture-reviewer-b" },
  { key: keyC, subject: "fixture-reviewer-c" }, { key: keyLegal, subject: "fixture-legal" }, { key: author, subject: AUTHOR }];

const homes: string[] = [];
afterAll(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });

/** An operator AMC home: a trust list signed by the fixture root pinning `pins`, and trust-roots.json pinning the root. */
export function operatorHome(pins: Pin[] = PINS, opts: { distrust?: DistrustEntry[]; threshold?: number; tamper?: boolean } = {}): string {
  const home = mkdtempSync(join(tmpdir(), "amc-gov-home-"));
  homes.push(home);
  const signed = signTrustList({ type: "amc.trust-list", version: 1, listId: "fixture-reviewers", sequence: 1,
    issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", distrust: opts.distrust ?? [],
    entries: pins.map((p) => ({ keyId: ed25519KeyId(p.key.publicKeyPem)!, algorithm: "ed25519" as const, publicKeyPem: p.key.publicKeyPem,
      purposes: p.purposes ?? ["catalog-review"], subject: p.subject, validFrom: p.validFrom ?? "2026-01-01T00:00:00.000Z", validTo: null, source: "operator",
      ...(p.revoked ? { revokedAt: "2026-06-01T00:00:00.000Z", revocationReason: "key-compromise" as const } : {}) })) }, root.privateKeyPem);
  if (opts.tamper) signed.list.entries[0]!.subject = "someone-else";
  const roots = [ed25519KeyId(root.publicKeyPem)!, ...(opts.threshold && opts.threshold > 1 ? [ed25519KeyId(keyC.publicKeyPem)!] : [])];
  mkdirSync(join(home, "trust"), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, "trust", "amc-trust-list.json"), JSON.stringify(signed), { mode: 0o600 });
  writeFileSync(join(home, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots, threshold: opts.threshold ?? 1 }), { mode: 0o600 });
  return home;
}

/** The control declaring reviewed support, as its YAML would after a review. */
export function reviewedControl(base: ControlRecord, over: Partial<ControlRecord> = {}): ControlRecord {
  return { ...base, support: "reviewed",
    review: { status: "approved", expert: "fixture-expert", credential: "fixture credential", reviewedAt: "2026-10-15", nextReview: "2027-01-01" },
    provenance: { ...base.provenance, approvedBy: "fixture-approver" }, ...over };
}

/** A review record over `control`'s current content, signed with `key`; AI-drafted content gets its draft confirmed. */
export function sign(control: ControlRecord, key: Key, userId: string, over: Partial<Omit<ReviewRecord, "signature">> = {}): ReviewRecord {
  return signReviewRecord({
    recordVersion: 1, id: `rr-${control.id}-${userId}`, subject: { kind: "control", id: control.id, version: control.version, digest: controlDigest(control) },
    role: "domain_lead",
    reviewer: { name: `Fixture ${userId}`, credential: "fixture credential", affiliation: "fixture", conflictsDeclared: "none (fixture)", identity: { userId, kind: "human" } },
    decision: "approve", scope: ["statement", "citations"], aiInputs: [{ kind: "draft", ref: `${control.id}@${control.version}`, confirmed: true }],
    notes: "", decidedAt: "2026-10-15", nextReviewDue: "2027-01-13", ...over
  }, key);
}

export function authority(home: string, records: readonly unknown[], over: Partial<ReviewAuthority> = {}): ReviewAuthority {
  return { trust: { amcHome: home }, now: NOW, records, experts: new Map([["fixture-reviewer-a", ["wealth"]], ["fixture-legal", ["legal"]]]),
    authorsOf: () => [AUTHOR], f5Confirmations: [], reverify: [], register: REGULATORY_REGISTER, ...over };
}
