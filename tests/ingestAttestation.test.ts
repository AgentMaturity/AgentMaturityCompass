import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { attestIngestSession, ingestBundleHash, ingestEvidence } from "../src/ingest/ingest.js";
import { openLedger } from "../src/ledger/ledger.js";
import { ed25519KeyId, type KeyPurpose, type TrustContext } from "../src/trust/index.js";
import { initWorkspace } from "../src/workspace.js";
import { workspaceKeyPem } from "./helpers/trustContext.js";
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

function attestedRows(workspace: string, sessionId: string): Array<Record<string, unknown>> {
  const ledger = openLedger(workspace);
  try {
    return ledger.getAllEvents()
      .filter((event) => event.session_id === sessionId)
      .map((event) => JSON.parse(event.meta_json) as Record<string, unknown>)
      .filter((meta) => meta.source === "attested_ingest");
  } finally {
    ledger.close();
  }
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
        attestedBy: "Example Audit LLP", statement: "export matches source" });
    }
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
