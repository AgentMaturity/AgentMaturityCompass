import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

export type AMCMode = "owner" | "agent";

function modeFile(workspace: string): string {
  return join(workspace, ".amc", "mode.json");
}

export function getMode(workspace: string): AMCMode {
  const file = modeFile(workspace);
  if (!pathExists(file)) {
    return "owner";
  }
  try {
    const parsed = JSON.parse(readUtf8(file)) as { mode?: unknown };
    return parsed.mode === "agent" ? "agent" : "owner";
  } catch {
    return "owner";
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
    0o644
  );
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
    "target set",
    "vault init",
    "vault unlock",
    "vault lock",
    "vault rotate-keys",
    "certify",
    "bundle export",
    "ci init",
    "tune",
    "upgrade",
    "archetype apply",
    "fix-signatures",
    "budgets init",
    "budgets reset",
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
    "scim token create"
  ]);
  if (blocked.has(commandPath)) {
    throw new Error(`Command '${commandPath}' is blocked in agent mode. Switch to owner mode with: amc mode owner`);
  }
}
