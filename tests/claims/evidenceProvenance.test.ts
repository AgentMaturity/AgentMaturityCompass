import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  bundleDigest, countAttestedOnce, effectiveTrustTier, evidenceProducer, readerTrustFor, trustTierByEventId, verifyThirdPartyAttestation,
  type ThirdPartyAttestation
} from "../../src/claims/evidenceProvenance.js";
import { getPrivateKeyPem, signHexDigest } from "../../src/crypto/keys.js";
import { evaluateGate, parseEvidenceEvent } from "../../src/diagnostic/gates.js";
import type { EvidenceEvent, Gate } from "../../src/types.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { ed25519KeyId, type KeyPurpose, type TrustContext } from "../../src/trust/index.js";
import { initWorkspace } from "../../src/workspace.js";
import { operatorTrustHome, workspaceKeyPem } from "../helpers/trustContext.js";
import { context, distrustEntry, listEntry, testKey, trustList, type TestKey } from "../trust/trustFixtures.js";

/**
 * P0-18: the tier a reader uses comes from who produced the row, not from what the row says. The producer table and
 * the source-literal enumeration are pinned in tests/compliance/evidenceBinding.test.ts (P0-17 shares the table).
 */
const PAYLOAD_SHA = sha256Hex("user: hello");
const SUBJECT = { agentId: "agent-a", sessionId: "session-a" };
const BUNDLE = [{ id: "orig-1", sha256: PAYLOAD_SHA, ts: 1, ...SUBJECT }, { id: "orig-2", sha256: sha256Hex("user: bye"), ts: 2, ...SUBJECT }];
const DIGEST = bundleDigest(BUNDLE);
const ATTESTER = testKey();

function row(meta: Record<string, unknown>, payloadSha256 = PAYLOAD_SHA): { meta_json: string; payload_sha256: string; session_id: string; ts: number } {
  return { meta_json: JSON.stringify(meta), payload_sha256: payloadSha256, session_id: SUBJECT.sessionId, ts: 10 };
}

function attestation(key: TestKey = ATTESTER, digest = DIGEST, bundle: unknown[] = BUNDLE): ThirdPartyAttestation {
  return { keyId: key.keyId, sigB64: signHexDigest(digest, key.privateKeyPem), digestSha256: digest, attestedBy: "Example Audit LLP",
    bundle: bundle as ThirdPartyAttestation["bundle"] };
}

/** The attested copy of bundle entry orig-1, as attestIngestSession writes it. */
function attestedMeta(record: ThirdPartyAttestation = attestation()): Record<string, unknown> {
  return { source: "attested_ingest", trustTier: "ATTESTED", agentId: "agent-a", ingestSessionId: "session-a", originalEventId: "orig-1", attestation: record };
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
    const attested = row(attestedMeta());
    expect(effectiveTrustTier(attested, { trustList: trust })).toBe("ATTESTED");
    expect(effectiveTrustTier(attested, { trustList: null })).toBe("SELF_REPORTED");
    expect(effectiveTrustTier(attested, { trustList: context() })).toBe("SELF_REPORTED");
    expect(effectiveTrustTier(row({ trustTier: "ATTESTED" }), { trustList: trust })).toBe("SELF_REPORTED");
    expect(effectiveTrustTier(row({ trustTier: "ATTESTED", attestation: { kind: "self_attested" } }), { trustList: trust })).toBe("SELF_REPORTED");
  });

  test("the trust list is loaded only for a row that claims ATTESTED with an attestation bound to it", () => {
    const load = vi.fn(() => ({ trustList: trust }));
    expect(effectiveTrustTier(row({ trustTier: "OBSERVED" }), load)).toBe("OBSERVED");
    // Every 1.x eval import and `amc attest` row claims ATTESTED with no record; none of them may cost a trust-list read.
    expect(effectiveTrustTier(row({ source: "eval_import", trustTier: "ATTESTED" }), load)).toBe("SELF_REPORTED");
    expect(load).not.toHaveBeenCalled();
    expect(effectiveTrustTier(row(attestedMeta()), load)).toBe("ATTESTED");
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("readerTrustFor loads once per evaluation", () => {
    const home = operatorTrustHome([{ publicKeyPem: ATTESTER.publicKeyPem, purposes: ["independent-attestation"] }]);
    try {
      vi.stubEnv("AMC_HOME", home);
      const reader = readerTrustFor();
      expect(reader()).toBe(reader());
      expect(effectiveTrustTier(row(attestedMeta()), reader)).toBe("ATTESTED");
    } finally {
      vi.unstubAllEnvs();
      rmSync(home, { recursive: true, force: true });
    }
  });

  // A genuine signature copied onto another row must not make that row ATTESTED (replay).
  const replays: Array<[string, () => { meta_json: string; payload_sha256?: string }]> = [
    ["a row with another payload", () => row(attestedMeta(), sha256Hex("fabricated"))],
    ["a row claiming another original event", () => row({ ...attestedMeta(), originalEventId: "fabricated" })],
    ["an eval import row", () => row({ source: "eval_import", trustTier: "ATTESTED", attestation: attestation() })],
    ["a runtime row with no source", () => row({ trustTier: "ATTESTED", attestation: attestation() })],
    ["a row whose record lost its bundle", () => row(attestedMeta({ ...attestation(), bundle: undefined }))],
    ["a row whose bundle was extended", () => row({ ...attestedMeta({ ...attestation(), bundle: [...BUNDLE, { id: "x", sha256: sha256Hex("fabricated"), ts: 3, ...SUBJECT }] }),
      originalEventId: "x" }, sha256Hex("fabricated"))],
    ["a row without its payload hash", () => ({ meta_json: JSON.stringify(attestedMeta()), session_id: SUBJECT.sessionId })],
    // The bundle names the subject the attester signed for (agent and session); a copy for anyone else is not attested.
    ["another agent's row", () => row({ ...attestedMeta(), agentId: "agent-b" })],
    ["a row with no agent", () => row({ ...attestedMeta(), agentId: undefined })],
    ["a row in another session", () => ({ ...row(attestedMeta()), session_id: "session-b" })],
    ["a row without its session", () => ({ meta_json: JSON.stringify(attestedMeta()), payload_sha256: PAYLOAD_SHA })],
    // P0-55: the attested event's time binds too; it cannot postdate the row that copies it beyond the skew bound.
    ["a row without its time", () => ({ meta_json: JSON.stringify(attestedMeta()), payload_sha256: PAYLOAD_SHA, session_id: SUBJECT.sessionId })],
    ["a row written before the event it copies", () => ({ ...row(attestedMeta()), ts: 1 - 5 * 60_000 - 1 })]
  ];
  test.each(replays)("a copied attestation on %s reads SELF_REPORTED", (_label, make) => {
    expect(effectiveTrustTier(make(), { trustList: trust })).toBe("SELF_REPORTED");
  });

  test("an old bundle whose entries do not name the agent and session reads SELF_REPORTED (fail closed)", () => {
    const old = BUNDLE.map(({ id, sha256, ts }) => ({ id, sha256, ts }));
    const signed = attestation(ATTESTER, bundleDigest(old as never), old);
    expect(verifyThirdPartyAttestation(signed, trust).verified).toBe(true);
    expect(effectiveTrustTier(row(attestedMeta(signed)), { trustList: trust })).toBe("SELF_REPORTED");
  });

  test("the workspace's own key never reads ATTESTED, even when the operator's trust list pins it", () => {
    process.env.AMC_VAULT_PASSPHRASE = "evidence-provenance-test-passphrase";
    const workspace = mkdtempSync(join(tmpdir(), "amc-provenance-own-key-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const auditorPem = workspaceKeyPem(workspace, "auditor");
    const home = operatorTrustHome([{ publicKeyPem: auditorPem, purposes: ["independent-attestation"] }]);
    try {
      vi.stubEnv("AMC_HOME", home);
      const own = { keyId: ed25519KeyId(auditorPem)!, sigB64: signHexDigest(DIGEST, getPrivateKeyPem(workspace, "auditor")), digestSha256: DIGEST, bundle: BUNDLE };
      expect(effectiveTrustTier(row(attestedMeta(own)), readerTrustFor())).toBe("ATTESTED");
      expect(effectiveTrustTier(row(attestedMeta(own)), readerTrustFor(workspace))).toBe("SELF_REPORTED");
    } finally {
      vi.unstubAllEnvs();
      rmSync(home, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("countAttestedOnce", () => {
  const trust = trustFor(ATTESTER);
  const tierOf = (event: ReturnType<typeof row>) => effectiveTrustTier(event, { trustList: trust });
  const at = (ts: number, meta: Record<string, unknown> = attestedMeta()) => ({ ...row(meta), ts });

  test("an attested event counts once, as its earliest copy, whatever the row order; other rows pass", () => {
    const replay = at(6);
    const first = at(5);
    const observed = at(7, { trustTier: "OBSERVED" });
    const unverified = at(8, attestedMeta(attestation(testKey())));
    expect(countAttestedOnce([replay, first, observed, unverified], tierOf, { startTs: 0, endTs: 10 })).toEqual([first, observed, unverified]);
    // A row read as ATTESTED without a bound attestation (stale OBSERVED in the diagnostic) is not an attested event.
    const unbound = at(9, { ...attestedMeta(), agentId: "agent-b" });
    expect(countAttestedOnce([observed, observed, unbound, unbound], () => "ATTESTED", { startTs: 0, endTs: 10 }))
      .toEqual([observed, observed, unbound, unbound]);
  });

  test("an attested event counts once whichever bundle or key attests it", () => {
    const other = testKey();
    const both = context({ lists: [trustList([ATTESTER, other].map((key) => listEntry(key, { purposes: ["independent-attestation"] })))] });
    const tierOfBoth = (event: ReturnType<typeof row>) => effectiveTrustTier(event, { trustList: both });
    // The same key signs a later, wider bundle (the session gained an event), and a second attester signs the first one.
    const wider = [...BUNDLE, { id: "orig-3", sha256: sha256Hex("user: later"), ts: 3, ...SUBJECT }];
    const first = at(5);
    const reSigned = at(6, attestedMeta(attestation(ATTESTER, bundleDigest(wider), wider)));
    const coSigned = at(7, attestedMeta(attestation(other)));
    expect([first, reSigned, coSigned].map(tierOfBoth)).toEqual(["ATTESTED", "ATTESTED", "ATTESTED"]);
    expect(countAttestedOnce([coSigned, reSigned, first], tierOfBoth, { startTs: 0, endTs: 10 })).toEqual([first]);
  });

  test("an attested event counts only in a window that holds its attested time", () => {
    // orig-1 was attested at ts 1; a copy appended at ts 5 does not carry it into a window that starts later.
    expect(countAttestedOnce([at(5)], tierOf, { startTs: 2, endTs: 10 })).toEqual([]);
    expect(countAttestedOnce([at(5)], tierOf, { startTs: 1, endTs: 10 })).toHaveLength(1);
  });
});

describe("trustTierByEventId", () => {
  test("bundle and certificate maps use the provenance tier, never the stored one", () => {
    const rows = [
      { id: "legacy", meta_json: JSON.stringify({ source: "eval_import", trustTier: "OBSERVED" }) },
      { id: "no-tier", meta_json: JSON.stringify({ source: "eval_import" }) },
      { id: "seed", meta_json: JSON.stringify({ provenance: "dogfood", trustTier: "OBSERVED" }) },
      { id: "runtime-no-tier", meta_json: JSON.stringify({ source: "gateway" }) },
      { id: "runtime", meta_json: JSON.stringify({ source: "gateway", trustTier: "OBSERVED" }) }
    ];
    expect(Object.fromEntries(trustTierByEventId(rows))).toEqual({
      legacy: "SELF_REPORTED", "no-tier": "SELF_REPORTED", seed: "SELF_REPORTED", "runtime-no-tier": "SELF_REPORTED", runtime: "OBSERVED"
    });
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
    return { id: "ev", ts: Date.now(), session_id: SUBJECT.sessionId, runtime: "unknown", event_type: "artifact", payload_path: "agents/a/report.json",
      payload_inline: null, payload_sha256: PAYLOAD_SHA, meta_json: JSON.stringify(meta), prev_event_hash: "", event_hash: "1".repeat(64),
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
    const meta = attestedMeta();
    expect(parseEvidenceEvent(raw(meta)).trustTier).toBe("ATTESTED");
    expect(parseEvidenceEvent(raw(meta, { ts: Date.now() - 95 * 86_400_000 })).trustTier).toBe("SELF_REPORTED");
    expect(parseEvidenceEvent(raw({ ...meta, attestation: attestation(testKey()) })).trustTier).toBe("SELF_REPORTED");
  });
});
