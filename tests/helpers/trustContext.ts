import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ed25519KeyId, type KeyPurpose, type TrustContext } from "../../src/trust/index.js";

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
