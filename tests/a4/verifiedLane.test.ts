/**
 * P2-35 negative fixtures for the verified lane (design §4.2; a4Evidence `resolveRefs`): an `independently_reviewed`
 * ref stays `verified` only while an admitted external record reviews its exact bytes under a key the operator's trust
 * list admits now. A forged (unpinned) issuer, the workspace's own key, a rotated-out (expired or revoked) key, an
 * expired or inactive attestation and a record about other bytes each fall to self_reported with the named code.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { resolveRefs, type A4ExternalRecord } from "../../src/a4/a4Evidence.js";
import type { A4EvidenceRefRow } from "../../src/a4/a4Schema.js";
import { getPublicKeyPem } from "../../src/crypto/keys.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import type { TrustContext } from "../../src/trust/trustContext.js";
import { cleanupGovernanceFixtures, governanceFixture } from "../governor/governanceFixture.js";

afterEach(() => cleanupGovernanceFixtures());

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const iso = (offsetDays: number) => new Date(NOW + offsetDays * 86_400_000).toISOString();
const pem = () => generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
const REVIEWER = pem();
const SUBJECT = "a".repeat(64);

function context(entry: Record<string, unknown> | null): TrustContext {
  const entries = entry === null ? [] : [{ keyId: signingKeyId(REVIEWER)!, publicKeyPem: REVIEWER, purposes: ["independent-attestation"],
    validFrom: iso(-30), validTo: null, ...entry }];
  return { mode: "pinned", asOf: new Date(NOW), lists: [{ listId: "p235-reviewers", entries }] as never, explicitPins: [], distrust: [],
    allowUnpinned: false, allowUnanchored: false };
}
const ref = { project_id: "a4p_fixture", seq: 7, ref_kind: "external", ref_id: "review:fixture-1", sha256: SUBJECT, label: "independent review",
  lane: "verified", claim_kind: "independently_reviewed", method: "expert_review", trust_tier: null } as unknown as A4EvidenceRefRow;
const record = (over: Partial<A4ExternalRecord> = {}): A4ExternalRecord => ({ refKind: "external", refId: "review:fixture-1", subjectSha256: SUBJECT,
  publicKeyPem: REVIEWER, signedAt: iso(-1), status: "active", expiresAt: iso(30), ...over });

function resolve(trust: TrustContext, found: A4ExternalRecord | null) {
  const { ledger } = governanceFixture();
  const [resolved] = resolveRefs(ledger, [ref], trust, NOW, () => found);
  return resolved!;
}

describe("verified-lane refs are re-admitted at every read", () => {
  test("an admitted reviewer's active record over these bytes keeps the ref verified", () => {
    expect(resolve(context({}), record())).toMatchObject({ lane: "verified", claimKind: "independently_reviewed", status: "resolved", downgrade: null });
  });

  test.each([
    ["no record behind the ref", context({}), null, "ISSUER_NOT_PINNED"],
    ["a forged issuer: a key no trust list pins", context({}), record({ publicKeyPem: pem() }), "ISSUER_NOT_PINNED"],
    ["no trust list at all", context(null), record(), "ISSUER_NOT_PINNED"],
    ["a rotated-out key: its entry expired", context({ validTo: iso(-1) }), record(), "KEY_ROTATED_OUT"],
    ["a rotated-out key: its entry revoked", context({ revokedAt: iso(-2), revocationReason: "superseded" }), record(), "KEY_ROTATED_OUT"],
    ["a key-compromise revocation, whatever the time", context({ revokedAt: iso(5), revocationReason: "key-compromise" }), record(), "KEY_ROTATED_OUT"],
    ["an expired attestation", context({}), record({ expiresAt: iso(-1) }), "ATTESTATION_EXPIRED"],
    ["an attestation with no expiry", context({}), record({ expiresAt: null }), "ATTESTATION_EXPIRED"],
    ["an inactive attestation", context({}), record({ status: "withdrawn" }), "ATTESTATION_EXPIRED"],
    ["a record about other bytes", context({}), record({ subjectSha256: "b".repeat(64) }), "REF_SUBJECT_MISMATCH"],
    ["a key pinned for another purpose", context({ purposes: ["artifact-seal"] }), record(), "ISSUER_NOT_PINNED"]
  ])("%s falls to self_reported (%s)", (_name, trust, found, code) => {
    const resolved = resolve(trust as TrustContext, found as A4ExternalRecord | null);
    expect(resolved).toMatchObject({ lane: "implementation", claimKind: "self_reported", downgrade: { from: "verified", reason: code } });
    expect(resolved.reasonCodes).toContain(code);
  });

  test("the workspace's own auditor key never counts as independent, even when a list pins it", () => {
    const { workspace, ledger } = governanceFixture();
    const own = getPublicKeyPem(workspace, "auditor");
    const trust = { ...context(null), lists: [{ listId: "p235-self", entries: [{ keyId: signingKeyId(own)!, publicKeyPem: own,
      purposes: ["independent-attestation"], validFrom: iso(-30), validTo: null }] }] } as unknown as TrustContext;
    const [resolved] = resolveRefs(ledger, [ref], trust, NOW, () => record({ publicKeyPem: own }));
    expect(resolved).toMatchObject({ lane: "implementation", downgrade: { reason: "ISSUER_NOT_PINNED" } });
  });
});
