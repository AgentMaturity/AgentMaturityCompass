import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getPublicKeyHistory,
  verifyHexDigestAny,
  verifyKeyHistoryChain
} from "../../src/crypto/keys.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P2.0's stated verification: an attacker-appended pubkey in key history must
 * fail verification.
 *
 * The key history is the trust root. `verifyHexDigestAny` accepts a signature
 * from ANY key in the history, so an attacker who can append one becomes a
 * permanently trusted signer for that workspace — every artifact signed after
 * that point verifies, and nothing downstream can tell.
 */
describe("key history forgery", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-keyhist-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  });
  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  const historyFile = (): string => join(workspace, ".amc", "keys", "auditor_history.json");

  const forge = (digestHex: string): { pem: string; signature: string } => {
    const pair = generateKeyPairSync("ed25519");
    return {
      pem: pair.publicKey.export({ format: "pem", type: "spki" }).toString(),
      signature: cryptoSign(null, Buffer.from(digestHex, "hex"), pair.privateKey).toString("base64")
    };
  };

  it("rejects a pubkey appended without chain fields", () => {
    const digest = "a".repeat(64);
    const { pem, signature } = forge(digest);
    const before = JSON.parse(readFileSync(historyFile(), "utf8")) as unknown[];

    // The attacker has workspace write access and appends their key, omitting
    // the chain fields entirely.
    writeFileSync(
      historyFile(),
      JSON.stringify([...before, { publicKeyPem: pem, addedTs: Date.now(), source: "attacker" }], null, 2)
    );

    const chain = verifyKeyHistoryChain(workspace, "auditor");
    expect(chain.ok, "an unchained appended entry must break the chain").toBe(false);

    const trusted = getPublicKeyHistory(workspace, "auditor");
    expect(
      verifyHexDigestAny(digest, signature, trusted),
      "an attacker-appended key must not become a trusted signer"
    ).toBe(false);
  });

  it("rejects an appended entry with a fabricated chain hash", () => {
    const { pem } = forge("b".repeat(64));
    const before = JSON.parse(readFileSync(historyFile(), "utf8")) as unknown[];
    writeFileSync(
      historyFile(),
      JSON.stringify(
        [
          ...before,
          {
            publicKeyPem: pem,
            addedTs: Date.now(),
            source: "attacker",
            prevHash: "GENESIS",
            entryHash: "c".repeat(64)
          }
        ],
        null,
        2
      )
    );
    expect(verifyKeyHistoryChain(workspace, "auditor").ok).toBe(false);
  });

  it("accepts the workspace's own untampered history", () => {
    expect(verifyKeyHistoryChain(workspace, "auditor").ok).toBe(true);
  });
});
