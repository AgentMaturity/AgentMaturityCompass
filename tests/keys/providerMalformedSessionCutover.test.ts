import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import { verifyHexDigestAny } from "../../src/crypto/keys.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const roots: string[] = [], PASS = process.env.AMC_VAULT_PASSPHRASE!;
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });
function state(root: string) {
  return [keysetPaths(root).keyset, keysetPaths(root).pending, join(root, ".amc/keys/ledger-row-provider.pub"),
    join(root, ".amc/keys/delegations/ledger-row.json"), join(root, ".amc/transparency/log.jsonl")]
    .map(path => existsSync(path) ? sha256Hex(readFileSync(path)) : null);
}

describe("first provider binding refuses malformed actual SQL session seal states", () => {
  it.each(["signature-without-hash", "hash-without-signature", "sealed-without-ended-time"] as const)("%s refuses before provider requests and preserves a fresh repaired default bind", async malformed => {
    const root = mkdtempSync(join(tmpdir(), "amc-malformed-seal-cutover-")); roots.push(root);
    initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
    const trust = workspaceKeyTrust(root), ledger = openLedger(root), id = "owned-malformed-seal";
    let original: ReturnType<typeof ledger.getAllSessions>[number] | undefined, mutated = false;
    try {
      ledger.startSession({ sessionId: id, runtime: "unknown", binaryPath: "owned-malformed-seal", binarySha256: "a".repeat(64) });
      ledger.appendEvidence({ sessionId: id, runtime: "unknown", eventType: "audit", payload: "owned sealed record", inline: true });
      ledger.sealSession(id); original = ledger.getAllSessions().find(value => value.session_id === id)!;
      expect(verifyLedgerIntegrity(root, { trust }).ok).toBe(true);
      expect(verifyHexDigestAny(original.session_final_event_hash!, original.session_seal_sig!, [getSigningPublicKeyPem(root, "ledger-row")])).toBe(true);
      const ref = AWS_ARN("owned-malformed-seal-" + malformed), fake = awsFake({ [ref]: fakeKey("p256") }), provider = awsKmsProvider(fake.call);
      const configPath = join(root, ".amc/amc.config.yaml"), config = YAML.parse(readFileSync(configPath, "utf8"));
      config.keys = { refs: { "ledger-row": { provider: "aws-kms", id: ref } } }; writeFileSync(configPath, YAML.stringify(config)); signAmcConfig(root);
      // Manufacture malformed records only in this owned database; production consistency and immutability stay intact.
      ledger.db.exec("DROP TRIGGER protect_sessions_sealed_immutable");
      ledger.db.exec("DROP TRIGGER protect_sessions_seal_consistency");
      mutated = true;
      if (malformed === "signature-without-hash") ledger.db.prepare("UPDATE sessions SET session_final_event_hash = NULL WHERE session_id = ?").run(id);
      else if (malformed === "hash-without-signature") ledger.db.prepare("UPDATE sessions SET session_seal_sig = NULL WHERE session_id = ?").run(id);
      else ledger.db.prepare("UPDATE sessions SET ended_ts = NULL WHERE session_id = ?").run(id);
      if (malformed !== "sealed-without-ended-time") expect(verifyLedgerIntegrity(root, { trust }).ok).toBe(false);
      else expect(ledger.getAllSessions().find(value => value.session_id === id)!.ended_ts).toBeNull();
      const before = state(root), requests = fake.requests.length;
      await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider })).rejects.toMatchObject({ code: "KEY_DELEGATION_INVALID" });
      expect(fake.requests).toHaveLength(requests); expect(state(root)).toEqual(before);
      ledger.db.prepare("UPDATE sessions SET ended_ts = ?, session_final_event_hash = ?, session_seal_sig = ? WHERE session_id = ?")
        .run(original.ended_ts, original.session_final_event_hash, original.session_seal_sig, id);
      expect(verifyLedgerIntegrity(root, { trust }).ok).toBe(true);
      await expect(bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider })).resolves.toMatchObject({ purpose: "ledger-row" });
    } finally {
      try {
        if (mutated && original) ledger.db.prepare("UPDATE sessions SET ended_ts = ?, session_final_event_hash = ?, session_seal_sig = ? WHERE session_id = ?")
          .run(original.ended_ts, original.session_final_event_hash, original.session_seal_sig, id);
      } finally { ledger.close(); }
    }
  });
});
