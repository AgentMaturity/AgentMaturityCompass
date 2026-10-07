import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ed25519KeyId, signTrustList, type DistrustEntry, type KeyPurpose, type TrustContext } from "../../src/trust/index.js";

/**
 * Verifier trust for tests (P0-09). Verifiers no longer trust the keys an artifact carries, so a test states which
 * keys the verifier operator pinned. The keys are recorded by the test that created them, as an operator records a
 * fingerprint at vault creation; a test never pins a key it read from an artifact it is about to verify.
 */
export interface TestPin { publicKeyPem: string; purposes: readonly KeyPurpose[] }

export function pinnedTrust(pins: readonly TestPin[], overrides: Partial<TrustContext> = {}): TrustContext {
  return {
    mode: "pinned", asOf: new Date(), lists: [], distrust: [], allowUnpinned: false, allowUnanchored: false,
    explicitPins: pins.map((pin, index) => {
      const keyId = ed25519KeyId(pin.publicKeyPem);
      if (keyId === null) throw new Error("test pin is not an Ed25519 public key");
      return { keyId, purposes: pin.purposes, origin: `test pin ${index}` };
    }),
    ...overrides
  };
}

export function workspaceKeyPem(workspace: string, role: "auditor" | "monitor"): string {
  return readFileSync(join(workspace, ".amc", "keys", `${role}_ed25519.pub`), "utf8");
}

/** Pins a workspace's current auditor and monitor keys, as its operator recorded them when the vault was created. */
export function workspaceKeyTrust(workspace: string, overrides: Partial<TrustContext> = {}): TrustContext {
  return pinnedTrust([
    { publicKeyPem: workspaceKeyPem(workspace, "auditor"), purposes: ["artifact-seal", "revocation-list", "config-signature"] },
    { publicKeyPem: workspaceKeyPem(workspace, "monitor"), purposes: ["ledger-row"] }
  ], overrides);
}

/** A trust list that pins an auditor key and lets its signed key history admit older auditor keys (AMC-1525). */
export function keyHistoryTrust(auditorPem: string, monitorPem: string): TrustContext {
  const keyId = ed25519KeyId(auditorPem)!;
  return {
    ...pinnedTrust([{ publicKeyPem: monitorPem, purposes: ["ledger-row"] }]),
    lists: [{
      type: "amc.trust-list", version: 1, listId: "test-history", sequence: 1,
      issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
      entries: [{
        keyId, algorithm: "ed25519", publicKeyPem: auditorPem, purposes: ["artifact-seal"], subject: "test auditor",
        validFrom: "2026-01-01T00:00:00.000Z", validTo: null, allowKeyHistory: true, source: "operator"
      }],
      distrust: []
    }]
  };
}

/**
 * An operator's AMC home with a signed trust list that pins these keys and distrusts those entries, for API routes and
 * workspace-self checks that read the AMC home (P0-09). The caller owns and removes the returned directory.
 */
export function operatorTrustHome(pins: readonly TestPin[], distrust: readonly DistrustEntry[] = []): string {
  const home = mkdtempSync(join(tmpdir(), "amc-operator-home-"));
  const root = generateKeyPairSync("ed25519");
  const rootPem = root.publicKey.export({ format: "pem", type: "spki" }).toString();
  const now = Date.now();
  const signed = signTrustList({
    type: "amc.trust-list", version: 1, listId: "test-operator", sequence: 1,
    issuedAt: new Date(now - 3_600_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(),
    entries: pins.map(pin => ({
      keyId: ed25519KeyId(pin.publicKeyPem)!, algorithm: "ed25519" as const, publicKeyPem: pin.publicKeyPem, purposes: [...pin.purposes],
      subject: "test operator pin", validFrom: new Date(now - 3_600_000).toISOString(), validTo: null, source: "operator"
    })),
    distrust: [...distrust]
  }, root.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
  mkdirSync(join(home, "trust"), { recursive: true, mode: 0o700 });
  writeFileSync(join(home, "trust", "amc-trust-list.json"), JSON.stringify(signed), { mode: 0o600 });
  writeFileSync(join(home, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [ed25519KeyId(rootPem)] }), { mode: 0o600 });
  return home;
}
