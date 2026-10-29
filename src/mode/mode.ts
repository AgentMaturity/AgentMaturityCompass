import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";

export type AMCMode = "owner" | "agent";

function modeFile(workspace: string): string {
  return join(workspace, ".amc", "mode.json");
}

/**
 * DXA-49: fails closed. Only a file that does not exist reads as owner: agent mode is opt-in, and a fresh workspace
 * (before `amc init`, which agent mode blocks) and every workspace that never entered agent mode have no file. A file
 * that exists but cannot be read, parsed or names no known mode is agent.
 *
 * mode.json is not signed. With an absent file meaning owner, anyone who can forge the file can delete it to the same
 * effect, so a signature would add no protection; raw writes under .amc are the confinement layer's boundary.
 * ponytail: deletion is the ceiling; a signed or ledger-anchored agent-mode marker is the upgrade if .amc is ever agent-writable.
 */
export function getMode(workspace: string): AMCMode {
  let raw: string;
  try {
    raw = readFileSync(modeFile(workspace), "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException | null)?.code === "ENOENT" ? "owner" : "agent";
  }
  try {
    const parsed = JSON.parse(raw) as { mode?: unknown } | null;
    return parsed?.mode === "owner" ? "owner" : "agent";
  } catch {
    return "agent";
  }
}

export function setMode(workspace: string, mode: AMCMode): void {
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(
    modeFile(workspace),
    JSON.stringify(
      {
        mode,
        updatedTs: Date.now()
      },
      null,
      2
    ),
    0o600
  );
}

/**
 * DXA-49: `amc mode owner` from agent mode needs owner proof, the vault passphrase. The caller supplies it from a prompt,
 * never from AMC_VAULT_PASSPHRASE, which an agent process may share. A wrong passphrase or a workspace without a vault refuses.
 */
export async function leaveAgentMode(workspace: string, passphrase: string): Promise<void> {
  if (getMode(workspace) === "agent") {
    // Loaded here: the vault's key modules import this module.
    const { unlockVault, vaultExists } = await import("../vault/vault.js");
    if (!vaultExists(workspace)) throw new Error("Leaving agent mode needs the vault passphrase, and this workspace has no vault.");
    if (passphrase.length === 0) throw new Error("Leaving agent mode needs the vault passphrase.");
    try {
      unlockVault(workspace, passphrase);
    } catch {
      throw new Error("Leaving agent mode refused: the vault passphrase did not unlock the vault.");
    }
  }
  setMode(workspace, "owner");
}

export function assertOwnerMode(workspace: string, commandPath: string): void {
  if (getMode(workspace) !== "agent") {
    return;
  }
  const blocked = new Set([
    "init",
    "quickstart",
    "up",
    "down",
    "fleet init",
    "agent add",
    "agent remove",
    "agent use",
    "provider add",
    "gateway init",
    "gateway bind-agent",
    "policy action init",
    "tools init",
    "workorder create",
    "workorder expire",
    "ticket issue",
    "lease issue",
    "lease revoke",
    // P1-23: clearing the hook audit latch (src/bridge/hookAuditLatch.ts).
    "connect hooks health --recover-latch",
    "target set",
    "vault init",
    "vault unlock",
    "vault lock",
    "vault rotate-keys",
    // P1-08: every state-changing key-set operation, checked again inside the function that does the work.
    "keys rotate",
    "keys revoke",
    "keys resume",
    "keys restore",
    "keys accept",
    "keys quarantine",
    "keys commit",
    "certify",
    "bundle export",
    "ci init",
    "tune",
    "upgrade",
    "archetype apply",
    "fix-signatures",
    "budgets init",
    "budgets reset",
    "domain apply --sign-profile",
    "domain apply --activate-profile",
    "catalog compile",
    "control results sign",
    "alerts init",
    "alerts test",
    "freeze lift",
    "bom sign",
    "loop init",
    "loop run",
    "loop schedule",
    "snapshot",
    "assurance patch",
    "assurance run",
    "firewall enable",
    "firewall disable",
    "firewall migrate-signature",
    "guardrails enable",
    "guardrails disable",
    "guardrails profile",
    "approvals approve",
    "approvals deny",
    "action resolve",
    // The reconcile() API (P1-04); it has no CLI path yet.
    "action reconcile",
    "whatif targets",
    "whatif equalizer",
    "benchmark ingest",
    "ops init",
    "retention run",
    "backup create",
    "backup restore",
    "maintenance vacuum",
    "maintenance reindex",
    "maintenance rotate-logs",
    "maintenance prune-cache",
    "adapters init",
    "adapters configure",
    "adapters init-project",
    "org init",
    "org add node",
    "org assign",
    "org unassign",
    "org score",
    "org learn",
    "org own",
    "org commit",
    "transform init",
    "transform map apply",
    "transform plan",
    "transform track",
    "transform attest",
    "plugin keygen",
    "plugin pack",
    "plugin init",
    "plugin registries-apply",
    "plugin install",
    "plugin upgrade",
    "plugin remove",
    "plugin execute",
    "plugin registry init",
    "plugin registry publish",
    "identity init",
    "identity provider add",
    "identity mapping add",
    "scim token create",
    // A4 Forge owner-gated leaves (P0-54; P1-57 adds acknowledge). The CLI commands land with P1-65; A4 owner actions pass these paths themselves.
    "a4 acknowledge",
    "a4 approve",
    "a4 complete",
    "a4 deny",
    "a4 deploy record",
    "a4 deploy verify",
    "a4 export",
    "a4 gate-policy",
    "a4 hold",
    "a4 members",
    "a4 release",
    "a4 reopen",
    "a4 request-changes",
    "a4 resume",
    "a4 retire",
    "a4 rollback",
    "a4 tune"
  ]);
  if (blocked.has(commandPath)) {
    throw new Error(`Command '${commandPath}' is blocked in agent mode. Switch to owner mode with: amc mode owner`);
  }
}
