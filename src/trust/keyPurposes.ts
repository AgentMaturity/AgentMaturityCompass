export const KEY_PURPOSES = ["ledger-row", "receipt", "artifact-seal", "revocation-list",
  "config-signature", "lease", "session", "release", "notary", "evidence-authority",
  "independent-attestation", "trust-list-root"] as const;
export type KeyPurpose = (typeof KEY_PURPOSES)[number];
/** What today's vault roles sign; P1-08 gives each purpose its own key. */
export const ROLE_PURPOSES = {
  monitor: ["ledger-row", "receipt"],
  auditor: ["artifact-seal", "revocation-list", "config-signature"],
  lease: ["lease"], session: ["session"]
} as const satisfies Record<string, readonly KeyPurpose[]>;
