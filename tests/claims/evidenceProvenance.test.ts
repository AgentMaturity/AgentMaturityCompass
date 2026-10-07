import { rmSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  effectiveTrustTier, evidenceProducer, verifyThirdPartyAttestation, type ThirdPartyAttestation
} from "../../src/claims/evidenceProvenance.js";
import { signHexDigest } from "../../src/crypto/keys.js";
import { evaluateGate, parseEvidenceEvent } from "../../src/diagnostic/gates.js";
import type { EvidenceEvent, Gate } from "../../src/types.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { KeyPurpose, TrustContext } from "../../src/trust/index.js";
import { operatorTrustHome } from "../helpers/trustContext.js";
import { context, distrustEntry, listEntry, testKey, trustList, type TestKey } from "../trust/trustFixtures.js";

/**
 * P0-18: the tier a reader uses comes from who produced the row, not from what the row says. The producer table and
 * the source-literal enumeration are pinned in tests/compliance/evidenceBinding.test.ts (P0-17 shares the table).
 */
const DIGEST = sha256Hex("ingest bundle");
const ATTESTER = testKey();

function row(meta: Record<string, unknown>): { meta_json: string } {
  return { meta_json: JSON.stringify(meta) };
}

function attestation(key: TestKey = ATTESTER, digest = DIGEST): ThirdPartyAttestation {
  return { keyId: key.keyId, sigB64: signHexDigest(digest, key.privateKeyPem), digestSha256: digest, attestedBy: "Example Audit LLP" };
}

function trustFor(key: TestKey, purposes: KeyPurpose[] = ["independent-attestation"], overrides: Parameters<typeof listEntry>[1] = {}): TrustContext {
  return context({ lists: [trustList([listEntry(key, { purposes, ...overrides })])] });
}

describe("effectiveTrustTier", () => {
  const trust = trustFor(ATTESTER);

  test("a legacy eval-import row stored as ATTESTED reads SELF_REPORTED", () => {
    expect(effectiveTrustTier(row({ source: "eval_import", trustTier: "ATTESTED" }), { trustList: trust })).toBe("SELF_REPORTED");
  });

  test.each(["eval_import", "import", "attested_ingest", "manual", "operator", "webhook", "feedback.ingest"])(
    "%s evidence never reads OBSERVED", (source) => {
      expect(effectiveTrustTier(row({ source, trustTier: "OBSERVED" }), { trustList: trust })).toBe("SELF_REPORTED");
      expect(effectiveTrustTier(row({ source, trustTier: "OBSERVED_HARDENED" }), { trustList: trust })).toBe("SELF_REPORTED");
    });

  test("a missing or unknown tier reads SELF_REPORTED", () => {
    expect(effectiveTrustTier(row({ source: "gateway" }), { trustList: trust })).toBe("SELF_REPORTED");
    expect(effectiveTrustTier(row({ trustTier: "observed" }), { trustList: trust })).toBe("SELF_REPORTED");
    expect(effectiveTrustTier({ meta_json: "{not json" }, { trustList: trust })).toBe("SELF_REPORTED");
  });

  test("AMC runtime evidence keeps its declared tier", () => {
    expect(effectiveTrustTier(row({ source: "gateway", trustTier: "OBSERVED" }), { trustList: trust })).toBe("OBSERVED");
    expect(effectiveTrustTier(row({ trustTier: "OBSERVED_HARDENED" }), { trustList: trust })).toBe("OBSERVED_HARDENED");
    expect(effectiveTrustTier(row({ trustTier: "SELF_REPORTED" }), { trustList: trust })).toBe("SELF_REPORTED");
  });

  test.each([{ provenance: "dogfood", trustTier: "OBSERVED" }, { claimKind: "synthetic_example", trustTier: "SELF_REPORTED" },
    { source: "dogfood-maturity", trustTier: "OBSERVED" }])("synthetic rows are excluded: %j", (meta) => {
    expect(evidenceProducer(row(meta))).toBe("synthetic");
    expect(effectiveTrustTier(row(meta), { trustList: trust })).toBeNull();
  });

  test("ATTESTED needs a third-party attestation that verifies against the trust list now", () => {
    const attested = row({ source: "attested_ingest", trustTier: "ATTESTED", attestation: attestation() });
    expect(effectiveTrustTier(attested, { trustList: trust })).toBe("ATTESTED");
    expect(effectiveTrustTier(attested, { trustList: null })).toBe("SELF_REPORTED");
    expect(effectiveTrustTier(attested, { trustList: context() })).toBe("SELF_REPORTED");
    expect(effectiveTrustTier(row({ trustTier: "ATTESTED" }), { trustList: trust })).toBe("SELF_REPORTED");
    expect(effectiveTrustTier(row({ trustTier: "ATTESTED", attestation: { kind: "self_attested" } }), { trustList: trust })).toBe("SELF_REPORTED");
  });

  test("the trust list is loaded only for a row that claims ATTESTED", () => {
    const load = vi.fn(() => trust);
    expect(effectiveTrustTier(row({ trustTier: "OBSERVED" }), { trustList: load })).toBe("OBSERVED");
    expect(load).not.toHaveBeenCalled();
    expect(effectiveTrustTier(row({ trustTier: "ATTESTED", attestation: attestation() }), { trustList: load })).toBe("ATTESTED");
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("verifyThirdPartyAttestation", () => {
  test("a pinned independent-attestation key with a valid signature verifies", () => {
    expect(verifyThirdPartyAttestation(attestation(), trustFor(ATTESTER))).toEqual({ verified: true, reason: expect.stringContaining(ATTESTER.keyId) });
  });

  const refusals: Array<[string, () => { attestation: unknown; trust: TrustContext | null; own?: string[] }, RegExp]> = [
    ["no trust list", () => ({ attestation: attestation(), trust: null }), /no trust list/],
    ["an unpinned key", () => ({ attestation: attestation(), trust: context() }), /not pinned/],
    ["a key pinned for another purpose", () => ({ attestation: attestation(), trust: trustFor(ATTESTER, ["artifact-seal"]) }), /wrong-purpose|not pinned/],
    ["a revoked key", () => ({ attestation: attestation(),
      trust: trustFor(ATTESTER, ["independent-attestation"], { revokedAt: "2026-05-01T00:00:00.000Z", revocationReason: "key-compromise" }) }), /revoked/],
    ["an expired key", () => ({ attestation: attestation(),
      trust: trustFor(ATTESTER, ["independent-attestation"], { validTo: "2026-06-01T00:00:00.000Z" }) }), /expired/],
    ["a distrusted key", () => ({ attestation: attestation(),
      trust: { ...trustFor(ATTESTER), distrust: [distrustEntry(ATTESTER.keyId)] } }), /distrusted/],
    ["a forged signature", () => ({ attestation: { ...attestation(), sigB64: attestation(testKey()).sigB64 }, trust: trustFor(ATTESTER) }), /signature/],
    ["a signature over another digest", () => ({ attestation: { ...attestation(ATTESTER, sha256Hex("other")), digestSha256: DIGEST },
      trust: trustFor(ATTESTER) }), /signature/],
    ["the operator's own key", () => ({ attestation: attestation(), trust: trustFor(ATTESTER), own: [ATTESTER.keyId] }), /operator's own/],
    ["a malformed record", () => ({ attestation: { keyId: ATTESTER.keyId }, trust: trustFor(ATTESTER) }), /malformed/]
  ];
  test.each(refusals)("%s is refused with a reason", (_label, make, reason) => {
    const { attestation: candidate, trust, own } = make();
    const verdict = verifyThirdPartyAttestation(candidate, trust, own);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toMatch(reason);
  });
});

describe("diagnostic readers", () => {
  const homes: string[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true });
  });

  function raw(meta: Record<string, unknown>, fields: Partial<EvidenceEvent> = {}): EvidenceEvent {
    return { id: "ev", ts: Date.now(), session_id: "s1", runtime: "unknown", event_type: "artifact", payload_path: "agents/a/report.json",
      payload_inline: null, payload_sha256: "0".repeat(64), meta_json: JSON.stringify(meta), prev_event_hash: "", event_hash: "1".repeat(64),
      writer_sig: "", ...fields } as EvidenceEvent;
  }

  test("a gate never counts synthetic evidence, at any tier", () => {
    const gate: Gate = { level: 2, requiredEvidenceTypes: ["artifact"], minEvents: 1, minSessions: 1, minDistinctDays: 1,
      acceptedTrustTiers: ["OBSERVED", "SELF_REPORTED"], mustInclude: { artifactPatterns: ["report\\.json"] }, mustNotInclude: {} };
    expect(evaluateGate(gate, [parseEvidenceEvent(raw({ trustTier: "OBSERVED" }))]).pass).toBe(true);
    expect(evaluateGate(gate, [parseEvidenceEvent(raw({ trustTier: "SELF_REPORTED", claimKind: "synthetic_example" }))]).pass).toBe(false);
    expect(evaluateGate(gate, [parseEvidenceEvent(raw({ trustTier: "OBSERVED", provenance: "dogfood" }))]).pass).toBe(false);
  });

  test("a verified ATTESTED row reads ATTESTED from the operator's trust list, and degrades when stale", () => {
    const home = operatorTrustHome([{ publicKeyPem: ATTESTER.publicKeyPem, purposes: ["independent-attestation"] }]);
    homes.push(home);
    vi.stubEnv("AMC_HOME", home);
    const meta = { source: "attested_ingest", trustTier: "ATTESTED", attestation: attestation() };
    expect(parseEvidenceEvent(raw(meta)).trustTier).toBe("ATTESTED");
    expect(parseEvidenceEvent(raw(meta, { ts: Date.now() - 95 * 86_400_000 })).trustTier).toBe("SELF_REPORTED");
    expect(parseEvidenceEvent(raw({ ...meta, attestation: attestation(testKey()) })).trustTier).toBe("SELF_REPORTED");
  });
});
