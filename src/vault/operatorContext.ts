/**
 * LIVE-VAULT-01 (S3): who the remembered vault passphrase unlocks for, and the confirmation governance signing from it
 * needs. An interactive operator is a process whose stdin is a terminal, in a workspace that is not in agent mode, with
 * none of AGENT_ENV_MARKERS set. The two checks cover different harnesses: Claude Code and hooks run commands without a
 * terminal, so the terminal check stops them; Gemini CLI runs them in a pseudo-terminal, so for it the marker is the only
 * guard. stdout is not checked: `amc shell` and operators pipe it. AMC_AGENT_ID is not a marker: the global `--agent`
 * flag writes it for the operator's own commands.
 * ponytail: a harness outside the list that runs commands in a pseudo-terminal passes both checks (docs/VAULT.md says
 * so); naming it here is the upgrade.
 */
import chalk from "chalk";
import inquirer from "inquirer";
import { getMode, OWNER_ONLY_COMMAND_PATHS } from "../mode/mode.js";
import { forgetRememberedUnlock, rememberedUnlockLocation } from "./passphraseStore.js";
import { lockVault } from "./vault.js";

/**
 * Set by an AMC-launched agent (AMC_LEASE, AMC_TOKEN, AMC_EVALUATED_AGENT) or by a coding-agent harness in the commands
 * it runs: Claude Code (CLAUDECODE, CLAUDE_CODE_ENTRYPOINT), Codex (CODEX_*), Gemini CLI (GEMINI_CLI), pi (PI_CODING_AGENT).
 */
export const AGENT_ENV_MARKERS: readonly string[] = [
  "AMC_LEASE", "AMC_TOKEN", "AMC_EVALUATED_AGENT", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED", "CODEX_CI", "CODEX_THREAD_ID", "CODEX_TOOL_CALL_ID", "GEMINI_CLI", "PI_CODING_AGENT"
];

type OperatorRefusal = { ok: false; reason: "no-tty" | "agent-mode" | "agent-marker" | "declined"; marker?: string };

/** The first agent marker set to a non-empty value, else null. */
export function agentMarker(env: NodeJS.ProcessEnv = process.env): string | null {
  return AGENT_ENV_MARKERS.find((name) => (env[name] ?? "").length > 0) ?? null;
}

let declined = false;

/** The operator answered N to the governance confirmation: no remembered unlock for the rest of this process. */
export function declineRememberedStore(): void {
  declined = true;
}

export function rememberedStoreDeclined(): boolean {
  return declined;
}

/** Checked in this order: declined, agent mode, marker, terminal on stdin. */
export function interactiveOperator(input: { workspace: string; env?: NodeJS.ProcessEnv; stdin?: { isTTY?: boolean } }): { ok: true } | OperatorRefusal {
  if (declined) return { ok: false, reason: "declined" };
  if (getMode(input.workspace) === "agent") return { ok: false, reason: "agent-mode" };
  const marker = agentMarker(input.env ?? process.env);
  if (marker !== null) return { ok: false, reason: "agent-marker", marker };
  return (input.stdin ?? process.stdin).isTTY === true ? { ok: true } : { ok: false, reason: "no-tty" };
}

/** Why the gate refused, as an operator reads it. */
export function operatorRefusalText(refusal: OperatorRefusal): string {
  switch (refusal.reason) {
    case "agent-marker": return `this shell carries the agent marker ${refusal.marker ?? "(unknown)"}`;
    case "agent-mode": return "this workspace is in agent mode";
    case "declined": return "it was declined earlier in this command";
    default: return "stdin is not a terminal";
  }
}

const GOVERNANCE_PREFIXES = [
  "user", "trust", "firewall", "policy", "tools", "keys", "identity", "sso", "scim", "ops sign", "studio lan", "connect hooks install",
  "connect hooks remove", "lease issue", "gateway", "ticket issue", "workorder", "notary sign"
];

/** D4: the owner-only commands plus the signing prefixes; an entry's command part is the text before any ` --`. */
export const GOVERNANCE_SIGNING_PATHS: readonly string[] = [
  ...new Set([...OWNER_ONLY_COMMAND_PATHS, ...GOVERNANCE_PREFIXES].map((entry) => entry.split(" --")[0]!.trim()))
];

export function isGovernancePath(path: string): boolean {
  return GOVERNANCE_SIGNING_PATHS.some((entry) => path === entry || path.startsWith(`${entry} `));
}

const READS = new Set(["vault status", "vault lock", "vault forget", "user list", "user verify"]);

/**
 * D4: a governance command whose vault was opened from the remembered store (not from AMC_VAULT_PASSPHRASE or a prompt)
 * runs only after a y/N answer, default N. N locks the vault, clears the remembered-unlock mark and declines the store for
 * the rest of the process, so a command that unlocks itself when it finds the vault locked reaches its normal refusal or
 * prompt instead. Without a terminal on stdin the question cannot be asked; that counts as N.
 */
export async function confirmRememberedUnlock(workspace: string, path: string): Promise<void> {
  const location = rememberedUnlockLocation(workspace);
  if (location === null || !isGovernancePath(path) || READS.has(path)) return;
  const confirmed = process.stdin.isTTY === true && (await inquirer.prompt<{ sign: boolean }>([{
    type: "confirm", name: "sign", default: false,
    message: `Sign ${path} with the vault passphrase remembered in ${location}? (export AMC_VAULT_PASSPHRASE for this shell to skip this question)`
  }])).sign === true;
  if (confirmed) return;
  lockVault(workspace);
  forgetRememberedUnlock(workspace);
  declineRememberedStore();
  process.stderr.write(`${chalk.gray("Vault left locked.")}\n`);
}
