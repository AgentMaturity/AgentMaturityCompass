/**
 * One-command `amc up` / `amc start` flow helpers (AMC-1486).
 *
 * Keeps first-run and returning-run startup prompt-free: resolve the vault
 * passphrase from the environment, the remembered store, an interactive
 * prompt, or non-interactive generation — then run the first 8-surface
 * baseline when the workspace has no prior assessment.
 */
import { existsSync } from "node:fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { usersConfigPath } from "../auth/authApi.js";
import { buildDashboard } from "../dashboard/build.js";
import { agentMarker } from "../vault/operatorContext.js";
import { vaultPassphraseFromEnv } from "../vault/passphraseFile.js";
import { getRememberedVaultPassphrase, rememberEnabled, rememberedLocation, rememberedStores, rememberVaultPassphrase } from "../vault/passphraseStore.js";
import { vaultExists, vaultOpensWith } from "../vault/vault.js";
import { localVaultPassphrasePath } from "../vault/localPassphrase.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { keysetAnchoring } from "../keys/keyset.js";
import { getMode } from "../mode/mode.js";

export async function ensureUpVaultPassphrase(workspace: string, rememberRequested: boolean): Promise<void> {
  // LIVE-VAULT-03: AMC_VAULT_REMEMBER=0 turns the stores off, so nothing below reads, offers or writes one.
  const envOptOut = !rememberEnabled();
  const remember = rememberRequested && !envOptOut;
  // The one reader (AMC_VAULT_PASSPHRASE wins): a set file is used, or refused with its reason, and is never replaced by a
  // remembered, prompted or generated passphrase.
  if (!process.env.AMC_VAULT_PASSPHRASE && (process.env.AMC_VAULT_PASSPHRASE_FILE ?? "").trim()) {
    const fromFile = vaultPassphraseFromEnv(); // throws VaultPassphraseFileError when the file is refused or unreadable
    if (fromFile) process.env.AMC_VAULT_PASSPHRASE = fromFile;
    return;
  }
  if (!process.env.AMC_VAULT_PASSPHRASE && remember) {
    // LIVE-VAULT-01 (D3): an agent harness's shell never starts a Studio daemon holding the remembered passphrase.
    const marker = agentMarker();
    if (marker !== null) {
      throw new Error(`This shell carries the agent marker ${marker}, so amc up does not use a remembered vault passphrase here. `
        + "Export AMC_VAULT_PASSPHRASE deliberately, or run amc up from your own terminal.");
    }
    const remembered = getRememberedVaultPassphrase(workspace);
    // A remembered passphrase that no longer opens the vault (the vault was replaced, or a wrong one was stored) is not used.
    const stale = remembered !== null && vaultExists(workspace) && !vaultOpensWith(workspace, remembered.passphrase);
    if (stale) console.log(chalk.yellow(`The passphrase remembered in ${rememberedLocation(remembered.backend)} does not open this workspace's vault, so it is not used.`));
    if (remembered && !stale) {
      process.env.AMC_VAULT_PASSPHRASE = remembered.passphrase;
      console.log(chalk.gray(`Vault passphrase loaded from ${rememberedLocation(remembered.backend)} (run \`amc vault forget\` to remove).`));
      return;
    }
  }
  if (process.env.AMC_VAULT_PASSPHRASE) {
    return;
  }
  if (process.stdin.isTTY) {
    // A vault that exists opens only with its own passphrase: offering a new one here would fail the unlock and, once
    // remembered, replace nothing useful with a wrong entry.
    if (vaultExists(workspace)) await askExistingVaultPassphrase(workspace);
    else await askNewVaultPassphrase();
    if (remember) {
      const { rememberChoice } = await inquirer.prompt([{
        type: "confirm",
        name: "rememberChoice",
        message: "Remember this passphrase on this machine so `amc up` and other amc commands in this workspace use it without asking?",
        default: true
      }]);
      if (rememberChoice) {
        const saved = rememberVaultPassphrase(workspace, process.env.AMC_VAULT_PASSPHRASE as string);
        console.log(chalk.gray(`  Passphrase remembered in ${saved.location}. Run \`amc vault forget\` to remove it.`));
      }
    }
    return;
  }
  if ((remember || envOptOut) && vaultExists(workspace)) {
    // A new passphrase cannot open the vault that exists; remembering one would only replace the right one.
    const looked = envOptOut ? "AMC_VAULT_PASSPHRASE (remembering is disabled by AMC_VAULT_REMEMBER=0)" : `AMC_VAULT_PASSPHRASE or in ${rememberedStores()}`;
    throw new Error(`This workspace already has a vault, and no passphrase for it was found in ${looked}. `
      + "Run: export AMC_VAULT_PASSPHRASE='<the vault passphrase>', then amc up again.");
  }
  if (remember) {
    // LIVE-VAULT-03: generated only into a store that outlives this job, and never printed.
    if ((process.env.CI ?? "").length > 0 || (process.env.GITHUB_ACTIONS ?? "").length > 0) {
      throw nonInteractivePassphraseError("A CI runner's remembered store does not outlive the job, so amc up does not generate a passphrase here.");
    }
    const crypto = await import("node:crypto");
    const generated = crypto.randomBytes(16).toString("base64url");
    process.env.AMC_VAULT_PASSPHRASE = generated;
    // B1: said before storing, so a slow or failing store never leaves the operator without it.
    console.log(chalk.yellow("No vault passphrase found in a non-interactive shell; generated one for this workspace."));
    const saved = rememberVaultPassphrase(workspace, generated);
    console.log(chalk.yellow(`It is remembered in ${saved.location}. Run \`amc vault forget\` to remove it, or set AMC_VAULT_PASSPHRASE to manage it yourself.`));
    console.log(chalk.yellow("Your own terminal (same user, same AMC_HOME) unlocks from that store; export AMC_VAULT_PASSPHRASE for other hosts."));
    return;
  }
  throw nonInteractivePassphraseError();
}

async function askNewVaultPassphrase(): Promise<void> {
  const crypto = await import("node:crypto");
  const autoGenerated = crypto.randomBytes(16).toString("base64url");
  console.log(chalk.bold("\n🔐 AMC Vault Setup"));
  console.log(chalk.gray("  AMC needs a passphrase to protect cryptographic keys.\n"));
  const { choice } = await inquirer.prompt([{
    type: "select",
    name: "choice",
    message: "Vault passphrase:",
    choices: [
      { name: `Auto-generate (${autoGenerated})`, value: "auto" },
      { name: "Enter my own passphrase", value: "custom" },
    ]
  }]);
  if (choice === "auto") {
    process.env.AMC_VAULT_PASSPHRASE = autoGenerated;
    console.log(chalk.yellow(`\n  ⚠ Save this passphrase: ${chalk.bold.white(autoGenerated)}\n`));
  } else {
    const { customPass } = await inquirer.prompt([{
      type: "password",
      name: "customPass",
      message: "Enter passphrase (min 8 chars):",
      mask: "*",
      validate: (v: string) => v.length >= 8 || "Must be at least 8 characters"
    }]);
    process.env.AMC_VAULT_PASSPHRASE = customPass;
  }
}

/**
 * The passphrase of a vault that already exists, checked against the vault before it is used. The file bare `amc` kept
 * (`.amc/local-vault-passphrase`) is offered, never taken silently: a copied or cloned folder can ship one (SH-SANDBOX-07).
 */
async function askExistingVaultPassphrase(workspace: string): Promise<void> {
  console.log(chalk.bold("\n🔐 This workspace already has a vault"));
  console.log(chalk.gray("  AMC needs that vault's passphrase. A new one cannot open it.\n"));
  const file = localVaultPassphrasePath(workspace);
  // The gates loadLocalVaultPassphrase applies: never for an agent (marker or agent mode). A vault whose key set this
  // machine did not commit (a clone, a copy, or a 1.x vault) is offered with "no" as the default answer.
  const saved = agentMarker() === null && getMode(workspace) !== "agent" && pathExists(file) ? readUtf8(file).trim() : "";
  const anchored = keysetAnchoring(workspace).state === "committed";
  if (saved.length >= 8 && vaultOpensWith(workspace, saved)) {
    const { useSaved } = await inquirer.prompt([{
      type: "confirm",
      name: "useSaved",
      message: "The passphrase AMC saved in .amc/local-vault-passphrase opens this vault. Use it? (Answer no if this folder was copied or cloned from someone else.)",
      default: anchored
    }]);
    if (useSaved) {
      process.env.AMC_VAULT_PASSPHRASE = saved;
      return;
    }
  }
  const { entered } = await inquirer.prompt([{
    type: "password",
    name: "entered",
    message: "Enter the vault passphrase:",
    mask: "*",
    validate: (v: string) => vaultOpensWith(workspace, v) || "That passphrase does not open this vault."
  }]);
  process.env.AMC_VAULT_PASSPHRASE = entered;
}

function nonInteractivePassphraseError(lead?: string): Error {
  return new Error([
    ...(lead === undefined ? [] : [lead]),
    "🔐 Vault passphrase required in non-interactive shells.",
    "",
    "Option 1 — set passphrase (recommended):",
    "  export AMC_VAULT_PASSPHRASE='your-passphrase'",
    "  amc up",
    "",
    "Option 2 — first-time setup in a terminal (remembers a generated passphrase):",
    "  amc setup",
    "",
    "Option 3 — explore without signing (local demo mode):",
    "  amc up --demo",
    "  amc up --demo --dry-run"
  ].join("\n"));
}

/**
 * The Compass Console signs people in with users.yaml accounts; until the first exists, `amc up` ends by saying how to make
 * it. Without a terminal the remembered passphrase is not used (operatorContext.ts), so that shell needs the passphrase too.
 */
export function printConsoleSignInStep(workspace: string, consoleUrl: string): void {
  if (existsSync(usersConfigPath(workspace))) return;
  console.log(`\n  ${chalk.bold("Sign in to the Compass Console")} (${consoleUrl}): create your owner account once with `
    + `${chalk.bold("amc user init --username <you>")}; it asks for the password you will sign in with. Without a terminal, export `
    + "AMC_VAULT_PASSPHRASE (or set AMC_VAULT_PASSPHRASE_FILE) first, then run amc user init --username <you> --password-file <file>.");
}

export interface BaselineWorkspaceState {
  vault: { noSign: boolean; reason: string | null };
  createdWorkspace: boolean;
  createdAgentContext: boolean;
}

export async function runFirstBaselineIfNeeded(params: {
  workspace: string;
  agentId: string;
  hasLatestRun: boolean;
  baseline: boolean;
  ensureInstantWorkspace: (workspace: string, agentId: string) => BaselineWorkspaceState;
}): Promise<void> {
  if (params.hasLatestRun || !params.baseline) {
    return;
  }
  console.log(chalk.bold("\nNo prior assessment found — running the first 8-surface baseline (amc run)..."));
  try {
    const { unifiedRun, renderUnifiedResult } = await import("../unified/index.js");
    const instant = params.ensureInstantWorkspace(params.workspace, params.agentId);
    const baseline = await unifiedRun({
      workspace: params.workspace,
      agentId: params.agentId,
      window: "14d",
      ci: false,
      noSign: instant.vault.noSign,
      createdWorkspace: instant.createdWorkspace,
      createdAgentContext: instant.createdAgentContext,
      vaultReason: instant.vault.reason
    });
    console.log(renderUnifiedResult(baseline, { ci: false, firstRun: true }));
    if (baseline.diagnosticRunId) {
      // Studio built its dashboard before this first run existed; rebuild the directory it serves.
      try {
        buildDashboard({ workspace: params.workspace, agentId: params.agentId });
      } catch (error) {
        console.log(chalk.yellow(`Dashboard not refreshed: ${error instanceof Error ? error.message : String(error)}. Run \`amc dashboard build\`.`));
      }
    }
    console.log(chalk.green("\u2713 Baseline complete — your first score is saved. Follow \"What to do next\" above."));
  } catch (error) {
    console.log(chalk.yellow(`Baseline assessment could not run: ${error instanceof Error ? error.message : String(error)}. Run \`amc run\` manually.`));
  }
}
