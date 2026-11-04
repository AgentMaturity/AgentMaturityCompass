import { join } from "node:path";
import type { LocalPurpose } from "./vaultPayload.js";

export function vaultPaths(workspace: string): {
  vaultFile: string;
  metaFile: string;
  previousVaultFile: string;
  keysDir: string;
  monitorPublic: string;
  auditorPublic: string;
  leasePublic: string;
  sessionPublic: string;
  monitorHistory: string;
  auditorHistory: string;
  leaseHistory: string;
  sessionHistory: string;
  legacyMonitorPrivate: string;
  legacyAuditorPrivate: string;
} {
  const amcDir = join(workspace, ".amc");
  const keysDir = join(amcDir, "keys");
  return {
    vaultFile: join(amcDir, "vault.amcvault"),
    metaFile: join(amcDir, "vault.amcvault.meta.json"),
    previousVaultFile: join(amcDir, "previous-vault.amcvault"),
    keysDir,
    monitorPublic: join(keysDir, "monitor_ed25519.pub"),
    auditorPublic: join(keysDir, "auditor_ed25519.pub"),
    leasePublic: join(keysDir, "lease_ed25519.pub"),
    sessionPublic: join(keysDir, "session_ed25519.pub"),
    monitorHistory: join(keysDir, "monitor_history.json"),
    auditorHistory: join(keysDir, "auditor_history.json"),
    leaseHistory: join(keysDir, "lease_history.json"),
    sessionHistory: join(keysDir, "session_history.json"),
    legacyMonitorPrivate: join(keysDir, "monitor_ed25519"),
    legacyAuditorPrivate: join(keysDir, "auditor_ed25519")
  };
}

/** P1-08 purpose files: `<purpose>.pub` and `<purpose>_history.json` (for lease and session, the role history). */
export function purposeKeyPaths(workspace: string, purpose: LocalPurpose): { publicFile: string; historyFile: string } {
  const keysDir = vaultPaths(workspace).keysDir;
  return { publicFile: join(keysDir, `${purpose}.pub`), historyFile: join(keysDir, `${purpose}_history.json`) };
}
