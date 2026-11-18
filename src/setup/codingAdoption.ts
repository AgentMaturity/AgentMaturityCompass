/**
 * UX-01: `amc init --coding` in a folder bare `amc` already set up. The menu's workspace only simulates edits and
 * commands, and `init --coding` refused any folder with an `.amc` (it was written for a new folder: it replaces
 * users.yaml, tools.yaml and the policies). Here it moves that workspace to the same coding setup in place: the keys,
 * the vault's key ids, the evidence and the history stay.
 *
 * The coding setup itself is `init --coding`'s, unchanged: its signed Action Policy runs an edit or a command only after
 * the person approves that one call. This adds no other way for an action to run. It refuses, changing nothing, when:
 * - the process is not a person at a terminal (an agent marker, agent mode, or no terminal: interactiveOperator);
 * - the workspace has accounts, an approval policy, or tools, action-policy or config files that differ from what the
 *   menu wrote (moving them to the coding setup would replace someone's choices);
 * - the person does not say yes.
 * A vault whose passphrase AMC generated (the menu's `.amc/local-vault-passphrase`) gets a passphrase the person types,
 * as `init --coding` requires, through `amc vault passphrase`'s own change (same keys). An existing firewall policy is
 * kept. The move is written to the signed evidence as WORKSPACE_CODING_SETUP_ADOPTED.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import inquirer from "inquirer";
import YAML from "yaml";
import { approvalPolicyPath } from "../approvals/approvalPolicyEngine.js";
import { usersConfigPath } from "../auth/authApi.js";
import { actionPolicyPath, defaultActionPolicy } from "../governor/actionPolicyStore.js";
import { actionPolicySchema } from "../governor/actionPolicySchema.js";
import { keysetAnchoring } from "../keys/keyset.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { loadRuntimeFirewallPolicy } from "../runtime/firewall.js";
import { toolsConfigPath } from "../toolhub/toolhubValidators.js";
import { defaultToolsConfig, toolsConfigSchema } from "../toolhub/toolsSchema.js";
import { canonicalize } from "../utils/json.js";
import { changeVaultPassphrase } from "../vault/vaultCli.js";
import { loadLocalVaultPassphrase, localVaultPassphrasePath } from "../vault/localPassphrase.js";
import { interactiveOperator, operatorRefusalText } from "../vault/operatorContext.js";
import { loadAMCConfig } from "../workspace.js";

/** What the coding setup allows and what it does not, in the words the menu and `init --coding` show before asking. */
const CODING_SETUP_SUMMARY: readonly string[] = [
  "An agent here reads files, and edits files or runs commands only after you see each one and say yes.",
  "  Each action and your answer are signed and recorded. Commands have no network and write only in this folder.",
  "  AMC's own files and files that usually hold secrets (.env, keys) stay closed to it. You are the one who approves."
];

const sameAs = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
const parsedYaml = (path: string): unknown => YAML.parse(readFileSync(path, "utf8"));

/** Each file the move would replace that is not as the menu wrote it, in words; empty when the move may go ahead. */
export function codingAdoptionBlockers(workspace: string): string[] {
  if (!existsSync(join(workspace, ".amc", "amc.config.yaml"))) return ["its .amc folder is not a complete AMC workspace"];
  const blockers: string[] = [];
  if (existsSync(usersConfigPath(workspace))) blockers.push("it already has accounts (.amc/users.yaml)");
  if (existsSync(approvalPolicyPath(workspace))) blockers.push("it already has an approval policy (.amc/approval-policy.yaml)");
  const tools = toolsConfigPath(workspace);
  if (existsSync(tools) && !sameAs(toolsConfigSchema.parse(parsedYaml(tools)), defaultToolsConfig())) blockers.push("its tool list was changed (.amc/tools.yaml)");
  const action = actionPolicyPath(workspace);
  if (existsSync(action) && !sameAs(actionPolicySchema.parse(parsedYaml(action)), defaultActionPolicy())) blockers.push("its Action Policy was changed (.amc/action-policy.yaml)");
  if (loadAMCConfig(workspace).profile !== "dev") blockers.push("its settings use another profile (.amc/amc.config.yaml)");
  return blockers;
}

/** Only a person moves a workspace to the coding setup: never an agent, never without a terminal. */
export function assertPersonAdopts(workspace: string, env: NodeJS.ProcessEnv = process.env, stdin: { isTTY?: boolean } = process.stdin): void {
  const person = interactiveOperator({ workspace, env, stdin });
  if (!person.ok) {
    throw new Error(`Moving this folder to the coding setup needs you at your own terminal, and ${operatorRefusalText(person)}. Nothing was changed.`);
  }
}

export interface CodingAdoptionIo {
  readonly log: (line: string) => void;
  readonly confirm: (message: string) => Promise<boolean>;
  /** A new secret typed twice; null when the two entries differ. */
  readonly newSecret: (message: string) => Promise<string | null>;
  readonly secret: (message: string) => Promise<string>;
}

const terminalAdoptionIo: CodingAdoptionIo = {
  log: (line) => console.log(line),
  confirm: async (message) => (await inquirer.prompt<{ yes: boolean }>([{ type: "confirm", name: "yes", message, default: false }])).yes,
  secret: async (message) => (await inquirer.prompt<{ value: string }>([{ type: "password", name: "value", message, mask: "*" }])).value,
  newSecret: async (message) => {
    const ask = async (prompt: string): Promise<string> => (await inquirer.prompt<{ value: string }>([{ type: "password", name: "value", message: prompt, mask: "*",
      validate: (v: string) => v.length >= 8 ? true : "At least 8 characters" }])).value;
    const first = await ask(message);
    return first === await ask(`${message} (again)`) ? first : null;
  }
};

/**
 * Asks, then sets the vault passphrase for the move: the current one (environment, the menu's file for a person, or
 * typed), and a new one the person types when AMC generated the current one. Returns the new one, or null when the
 * person's own passphrase stays. Nothing is written here.
 */
async function adoptionPassphrases(workspace: string, io: CodingAdoptionIo): Promise<{ current: string; next: string | null }> {
  const generated = existsSync(localVaultPassphrasePath(workspace));
  if (!process.env.AMC_VAULT_PASSPHRASE) loadLocalVaultPassphrase(workspace);
  const current = process.env.AMC_VAULT_PASSPHRASE || await io.secret("Vault passphrase");
  if (!generated) return { current, next: null };
  io.log("Choose a vault passphrase. You type it to start a chat here.");
  const next = await io.newSecret("New vault passphrase");
  if (next === null) throw new Error("New vault passphrase: the two entries differ; nothing was changed.");
  return { current, next };
}

export interface CodingAdoption {
  readonly passphrase: { readonly current: string; readonly next: string | null };
  /** A firewall policy the workspace already had: kept as it is, never replaced by the coding setup's warn mode. */
  readonly keepFirewall: boolean;
}

/**
 * The person's gate, the checks and the yes, then the passphrase answers. Returns null when the person said no.
 * Writes nothing: the caller collects the owner's login next and then calls completeCodingAdoption.
 */
export async function prepareCodingAdoption(workspace: string, io: CodingAdoptionIo = terminalAdoptionIo): Promise<CodingAdoption | null> {
  assertPersonAdopts(workspace);
  const blockers = codingAdoptionBlockers(workspace);
  if (blockers.length > 0) {
    throw new Error(`This folder cannot move to the coding setup in place: ${blockers.join("; ")}. Nothing was changed. `
      + "Use a new folder for the coding setup, or keep this one as it is.");
  }
  io.log("The coding setup keeps this folder's records, keys and history.");
  for (const line of CODING_SETUP_SUMMARY) io.log(line);
  if (!(await io.confirm("Move this folder to the coding setup?"))) {
    io.log("Nothing was changed.");
    return null;
  }
  return { passphrase: await adoptionPassphrases(workspace, io), keepFirewall: loadRuntimeFirewallPolicy(workspace) !== null };
}

/** The new passphrase sealed (same keys), then the audit row once the starter profile is in place. */
export function sealAdoptionPassphrase(workspace: string, adoption: CodingAdoption): void {
  const { current, next } = adoption.passphrase;
  if (next !== null) changeVaultPassphrase(workspace, current, next);
  process.env.AMC_VAULT_PASSPHRASE = next ?? current;
}

export function recordCodingAdoption(workspace: string, owner: string, adoption: CodingAdoption): void {
  appendOpsAuditEvent({ workspace, auditType: "WORKSPACE_CODING_SETUP_ADOPTED", severity: "HIGH", payload: {
    owner, passphraseChanged: adoption.passphrase.next !== null, keysetGeneration: keysetAnchoring(workspace).generation,
    firewallKept: adoption.keepFirewall,
    summary: "File edits and commands run after the owner approves each call (executeOnApproval for WRITE_LOW and WRITE_HIGH)."
  } });
}
