import { join } from "node:path";
import { pathExists } from "../utils/fs.js";
import { createLocalVaultPassphrase, loadLocalVaultPassphrase, localVaultPassphrasePath } from "../vault/localPassphrase.js";
import { rememberedUnlockLocation } from "../vault/passphraseStore.js";

export interface InstantVaultMode {
  noSign: boolean;
  createdLocalPassphrase: boolean;
  localPassphrasePath: string | null;
  reason: string | null;
}

/**
 * How bare `amc`, `amc run` and `amc init` sign their first score: with the operator's AMC_VAULT_PASSPHRASE or the
 * passphrase the gated remembered-store path unlocked with (LIVE-VAULT-02: an unlock from anywhere else is not operator
 * intent), else `.amc/local-vault-passphrase` for a non-agent process, else a new local vault, else unsigned.
 */
export function ensureInstantVaultMode(workspace: string): InstantVaultMode {
  if ((process.env.AMC_VAULT_PASSPHRASE ?? "").length > 0 || rememberedUnlockLocation(workspace) !== null) {
    return { noSign: false, createdLocalPassphrase: false, localPassphrasePath: null, reason: null };
  }

  const local = loadLocalVaultPassphrase(workspace);
  if (local.loaded) {
    return { noSign: false, createdLocalPassphrase: false, localPassphrasePath: localVaultPassphrasePath(workspace), reason: null };
  }
  if (local.reason !== undefined) {
    const where = local.reason === "agent-mode" ? "in agent mode" : `under the agent marker ${local.marker ?? "(unknown)"}`;
    return {
      noSign: true,
      createdLocalPassphrase: false,
      localPassphrasePath: null,
      reason: `.amc/local-vault-passphrase is not read ${where}; generated an unsigned full score.`
    };
  }

  const existingVault = join(workspace, ".amc", "vault.amcvault");
  if (pathExists(existingVault)) {
    return {
      noSign: true,
      createdLocalPassphrase: false,
      localPassphrasePath: null,
      reason: "Existing vault is locked and no passphrase is available; generated an unsigned full score."
    };
  }

  return {
    noSign: false,
    createdLocalPassphrase: true,
    localPassphrasePath: createLocalVaultPassphrase(workspace, "amc-local-"),
    reason: null
  };
}
