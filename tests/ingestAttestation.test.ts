import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { bundleDigest, effectiveTrustTier, readerTrustFor, type BundleEntry } from "../src/claims/evidenceProvenance.js";
import { generateComplianceReport, initComplianceMaps } from "../src/compliance/complianceEngine.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { attestIngestSession, ingestBundleHash, ingestEvidence } from "../src/ingest/ingest.js";
import { openLedger } from "../src/ledger/ledger.js";
import { ed25519KeyId, type KeyPurpose, type TrustContext } from "../src/trust/index.js";
import type { EvidenceEvent } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";
import { sha256Hex } from "../src/utils/hash.js";
import { operatorTrustHome, workspaceKeyPem } from "./helpers/trustContext.js";
import { context, distrustEntry, listEntry, testKey, trustList, type TestKey } from "./trust/trustFixtures.js";

/**
 * P0-18 step 4: `amc attest` records who vouched, but only a signature from a third-party key pinned for
 * independent-attestation makes the rows ATTESTED. The operator's own keys never do.
 */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function ingested(): { workspace: string; sessionId: string; bundleHash: string } {
  process.env.AMC_VAULT_PASSPHRASE = "ingest-attestation-test-passphrase";
  const workspace = mkdtempSync(join(tmpdir(), "amc-ingest-attest-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  writeFileSync(join(workspace, "chat.txt"), "user: hello\nassistant: hi", "utf8");
  const { ingestSessionId } = ingestEvidence({ workspace, inputPath: join(workspace, "chat.txt"), type: "generic_text" });
  return { workspace, sessionId: ingestSessionId, bundleHash: ingestBundleHash(workspace, ingestSessionId) };
}

function attestedEvents(workspace: string, sessionId: string): EvidenceEvent[] {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents().filter((event) => event.session_id === sessionId
      && (JSON.parse(event.meta_json) as Record<string, unknown>).source === "attested_ingest");
  } finally {
    ledger.close();
  }
}

function attestedRows(workspace: string, sessionId: string): Array<Record<string, unknown>> {
  return attestedEvents(workspace, sessionId).map((event) => JSON.parse(event.meta_json) as Record<string, unknown>);
}

// The real clock: attestIngestSession checks admission now, so the list must be valid around Date.now().
function pinned(key: { publicKeyPem: string; keyId: string }, overrides: Parameters<typeof listEntry>[1] = {},
  purposes: KeyPurpose[] = ["independent-attestation"]): TrustContext {
  return context({ asOf: new Date(), lists: [trustList([listEntry(key as TestKey, {
    purposes, validFrom: new Date(Date.now() - 86_400_000).toISOString(), validTo: null, ...overrides })], { expiresAt: "2099-01-01T00:00:00.000Z" })] });
}

function attest(workspace: string, sessionId: string, extra: Partial<Parameters<typeof attestIngestSession>[0]> = {}) {
  return attestIngestSession({ workspace, ingestSessionId: sessionId, attestedBy: "Example Audit LLP", statement: "export matches source", ...extra });
}

describe("ingest attestation", () => {
  test("an operator attestation without a third-party signature is SELF_REPORTED and self_attested", () => {
    const { workspace, sessionId } = ingested();
    const result = attest(workspace, sessionId, { trust: context({ asOf: new Date() }) });
    expect(result.trustTier).toBe("SELF_REPORTED");
    const rows = attestedRows(workspace, sessionId);
    expect(rows.length).toBe(2);
    for (const meta of rows) {
      expect(meta.trustTier).toBe("SELF_REPORTED");
      expect(meta.attestation).toMatchObject({ kind: "self_attested", attestedBy: "Example Audit LLP", statement: "export matches source" });
    }
  });

  test("a signature from a pinned third-party key gives ATTESTED with the attestation record", () => {
    const { workspace, sessionId, bundleHash } = ingested();
    const attester = testKey();
    const sigB64 = signHexDigest(bundleHash, attester.privateKeyPem);
    const result = attest(workspace, sessionId, { attesterSignature: { keyId: attester.keyId, sigB64 }, trust: pinned(attester) });
    expect(result).toMatchObject({ trustTier: "ATTESTED", bundleHash });
    const rows = attestedRows(workspace, sessionId);
    expect(rows.length).toBe(2);
    for (const meta of rows) {
      expect(meta.trustTier).toBe("ATTESTED");
      expect(meta.attestation).toEqual({ kind: "third_party", keyId: attester.keyId, sigB64, digestSha256: bundleHash,
        attestedBy: "Example Audit LLP", statement: "export matches source", bundle: [expect.objectContaining({ id: expect.any(String) })] });
    }
    // Readers re-verify the copy against the trust list, bound to the original event it copies.
    const [copy] = attestedEvents(workspace, sessionId).filter((event) => event.event_type === "review");
    expect(effectiveTrustTier(copy!, { trustList: pinned(attester) })).toBe("ATTESTED");
    expect(effectiveTrustTier(copy!, { trustList: pinned(attester), ownKeyIds: [attester.keyId] })).toBe("SELF_REPORTED");
  });

  test("one third-party signature attests a session once: replaying it is refused", () => {
    const { workspace, sessionId, bundleHash } = ingested();
    const attester = testKey();
    const signature = { keyId: attester.keyId, sigB64: signHexDigest(bundleHash, attester.privateKeyPem) };
    expect(attest(workspace, sessionId, { attesterSignature: signature, trust: pinned(attester) }).trustTier).toBe("ATTESTED");
    expect(() => attest(workspace, sessionId, { attesterSignature: signature, trust: pinned(attester) }))
      .toThrow(`ingest session ${sessionId} is already attested by key ${attester.keyId}`);
    expect(attestedRows(workspace, sessionId).filter((meta) => meta.trustTier === "ATTESTED").length).toBe(2);
  });

  test("a key that attested a session's events cannot attest them again under a new bundle hash", () => {
    const { workspace, sessionId, bundleHash } = ingested();
    const attester = testKey();
    const signed = (digest: string) => ({ attesterSignature: { keyId: attester.keyId, sigB64: signHexDigest(digest, attester.privateKeyPem) },
      trust: pinned(attester) });
    expect(attest(workspace, sessionId, signed(bundleHash)).trustTier).toBe("ATTESTED");
    // Evidence appended to the attested session changes the bundle hash the attester would sign next.
    const ledger = openLedger(workspace);
    try {
      ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "review", payload: "user: more", payloadExt: "txt",
        meta: { source: "generic_text", ingestSessionId: sessionId } });
    } finally {
      ledger.close();
    }
    const widened = ingestBundleHash(workspace, sessionId);
    expect(widened).not.toBe(bundleHash);
    expect(() => attest(workspace, sessionId, signed(widened))).toThrow(`ingest session ${sessionId} is already attested by key ${attester.keyId}`);
    expect(attestedRows(workspace, sessionId).filter((meta) => meta.trustTier === "ATTESTED").length).toBe(2);
  });

  const refused: Array<[string, (key: TestKey, digest: string) => { sigB64: string; trust: TrustContext }, RegExp]> = [
    ["an unpinned key", (key, digest) => ({ sigB64: signHexDigest(digest, key.privateKeyPem), trust: context({ asOf: new Date() }) }), /not pinned/],
    ["a revoked key", (key, digest) => ({ sigB64: signHexDigest(digest, key.privateKeyPem),
      trust: pinned(key, { revokedAt: new Date(Date.now() - 1_000).toISOString(), revocationReason: "key-compromise" }) }), /revoked/],
    ["an expired key", (key, digest) => ({ sigB64: signHexDigest(digest, key.privateKeyPem),
      trust: pinned(key, { validFrom: new Date(Date.now() - 2 * 86_400_000).toISOString(), validTo: new Date(Date.now() - 86_400_000).toISOString() }) }), /expired/],
    ["a distrusted key", (key, digest) => ({ sigB64: signHexDigest(digest, key.privateKeyPem),
      trust: { ...pinned(key), distrust: [distrustEntry(key.keyId)] } }), /distrusted/],
    ["a forged signature", (key, digest) => ({ sigB64: signHexDigest(digest, testKey().privateKeyPem), trust: pinned(key) }), /signature/]
  ];
  test.each(refused)("%s gives SELF_REPORTED and a stated reason", (_label, make, reason) => {
    const { workspace, sessionId, bundleHash } = ingested();
    const attester = testKey();
    const { sigB64, trust } = make(attester, bundleHash);
    const result = attest(workspace, sessionId, { attesterSignature: { keyId: attester.keyId, sigB64 }, trust });
    expect(result.trustTier).toBe("SELF_REPORTED");
    expect(result.reason).toMatch(reason);
    for (const meta of attestedRows(workspace, sessionId)) {
      expect(meta.trustTier).toBe("SELF_REPORTED");
      expect(meta.attestation).toMatchObject({ kind: "self_attested" });
    }
  });

  test("the operator's own auditor key never gives ATTESTED, even when a trust list pins it", () => {
    const { workspace, sessionId, bundleHash } = ingested();
    const auditorPem = workspaceKeyPem(workspace, "auditor");
    const keyId = ed25519KeyId(auditorPem)!;
    const sigB64 = signHexDigest(bundleHash, getPrivateKeyPem(workspace, "auditor"));
    const result = attest(workspace, sessionId, { attesterSignature: { keyId, sigB64 }, trust: pinned({ publicKeyPem: auditorPem, keyId }) });
    expect(result.trustTier).toBe("SELF_REPORTED");
    expect(result.reason).toMatch(/operator's own/);
  });
});

/**
 * P0-18 security follow-up: an ATTESTED row counts only for the subject the attester signed for, once per attested
 * event, and in the window of the attested event's own time. Copies are written through the ledger API any in-process
 * writer can use.
 */
describe("an attested event counts for its subject, once, in its own window", () => {
  const PAYLOAD = "user: hello\nassistant: hi";
  const DAY_MS = 86_400_000;
  const homes: string[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true });
  });

  /** An ingest session ATTESTED by a third-party key that the operator's AMC home pins for readers. */
  function attestedSession() {
    const { workspace, sessionId, bundleHash } = ingested();
    const attester = testKey();
    attest(workspace, sessionId, { attesterSignature: { keyId: attester.keyId, sigB64: signHexDigest(bundleHash, attester.privateKeyPem) },
      trust: pinned(attester) });
    const home = operatorTrustHome([{ publicKeyPem: attester.publicKeyPem, purposes: ["independent-attestation"] }]);
    homes.push(home);
    vi.stubEnv("AMC_HOME", home);
    const copy = attestedEvents(workspace, sessionId).find((event) => event.event_type === "review")!;
    return { workspace, sessionId, attester, copy, meta: JSON.parse(copy.meta_json) as Record<string, unknown> };
  }

  function append(workspace: string, sessionId: string, meta: Record<string, unknown>): EvidenceEvent {
    const ledger = openLedger(workspace);
    try {
      const id = ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "review", payload: PAYLOAD, payloadExt: "txt", meta });
      return ledger.getEventById(id)!;
    } finally {
      ledger.close();
    }
  }

  function compliance(workspace: string, agentId: string) {
    initComplianceMaps(workspace);
    return generateComplianceReport({ workspace, framework: "SOC2", window: "14d", agentId }).trustTierCoverage;
  }

  async function diagnostic(workspace: string, agentId: string) {
    return (await runDiagnostic({ workspace, agentId, window: "14d", claimMode: "auto" })).evidenceTrustCoverage;
  }

  test("the signed bundle names the agent and session; a copy written for another agent reads SELF_REPORTED", () => {
    const { workspace, sessionId, copy, meta } = attestedSession();
    expect(meta.attestation).toMatchObject({ bundle: [expect.objectContaining({ agentId: meta.agentId, sessionId })] });
    const forB = append(workspace, sessionId, { ...meta, agentId: "agent-b" });
    const reader = readerTrustFor(workspace);
    expect(effectiveTrustTier(forB, reader)).toBe("SELF_REPORTED");
    expect(effectiveTrustTier(copy, reader)).toBe("ATTESTED");
    expect(compliance(workspace, "agent-b").attested).toBe(0);
  });

  test("a second copy of the same attested event counts once in the compliance engine and the diagnostic", async () => {
    const { workspace, sessionId, meta } = attestedSession();
    const agentId = String(meta.agentId);
    const before = { compliance: compliance(workspace, agentId), diagnostic: await diagnostic(workspace, agentId) };
    expect(before.compliance.attested).toBeGreaterThan(0);
    expect(before.diagnostic.attested).toBeGreaterThan(0);
    const replay = append(workspace, sessionId, meta);
    expect(effectiveTrustTier(replay, readerTrustFor(workspace))).toBe("ATTESTED");
    expect(compliance(workspace, agentId)).toEqual(before.compliance);
    expect(await diagnostic(workspace, agentId)).toEqual(before.diagnostic);
  }, 120_000);

  test("a copy under a later bundle signed by the same key counts once in the compliance engine and the diagnostic", async () => {
    const { workspace, sessionId, attester, meta } = attestedSession();
    const agentId = String(meta.agentId);
    const before = { compliance: compliance(workspace, agentId), diagnostic: await diagnostic(workspace, agentId) };
    // The attester signs a wider bundle once the session gains an event; the earlier event's copy carries the new digest.
    const bundle: BundleEntry[] = [...(meta.attestation as { bundle: BundleEntry[] }).bundle,
      { id: "event-added-later", sha256: sha256Hex("user: more"), ts: Date.now(), agentId, sessionId }];
    const digestSha256 = bundleDigest(bundle);
    const reSigned = append(workspace, sessionId, { ...meta,
      attestation: { kind: "third_party", keyId: attester.keyId, sigB64: signHexDigest(digestSha256, attester.privateKeyPem), digestSha256, bundle } });
    expect(effectiveTrustTier(reSigned, readerTrustFor(workspace))).toBe("ATTESTED");
    expect(compliance(workspace, agentId)).toEqual(before.compliance);
    expect(await diagnostic(workspace, agentId)).toEqual(before.diagnostic);
  }, 120_000);

  test("a copy appended later than the attested event's time does not count in a later window", async () => {
    const { workspace, sessionId, attester, meta } = attestedSession();
    const agentId = String(meta.agentId);
    const before = { compliance: compliance(workspace, agentId), diagnostic: await diagnostic(workspace, agentId) };
    // A genuine signature over an event the attester saw 30 days ago, copied into the ledger now.
    const bundle: BundleEntry[] = [{ id: "event-30-days-ago", sha256: sha256Hex(PAYLOAD), ts: Date.now() - 30 * DAY_MS, agentId, sessionId }];
    const digestSha256 = bundleDigest(bundle);
    const late = append(workspace, sessionId, { ...meta, originalEventId: "event-30-days-ago",
      attestation: { kind: "third_party", keyId: attester.keyId, sigB64: signHexDigest(digestSha256, attester.privateKeyPem), digestSha256, bundle } });
    expect(effectiveTrustTier(late, readerTrustFor(workspace))).toBe("ATTESTED");
    expect(compliance(workspace, agentId)).toEqual(before.compliance);
    expect(await diagnostic(workspace, agentId)).toEqual(before.diagnostic);
  }, 120_000);
});
