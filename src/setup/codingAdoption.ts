/**
 * UX-01: `amc init --coding` in a folder bare `amc` already set up. The menu's workspace only simulates edits and
 * commands, and `init --coding` refused any folder with an `.amc` (it was written for a new folder: it replaces
 * users.yaml, tools.yaml and the policies). Here it moves that workspace to the same coding setup in place: the keys,
 * the vault's key ids, the evidence and the history stay. The writing, its signed records and the recovery of an
 * interrupted move are in ./codingMove.ts.
 *
 * The coding setup itself is `init --coding`'s, unchanged: its signed Action Policy runs an edit or a command only after
 * the person approves that one call. This adds no other way for an action to run. It refuses, changing nothing, when:
 * - AMC recognises an agent: an agent marker, agent mode, or no terminal (interactiveOperator). A program running as the
 *   same user that hides those and drives a terminal is not recognised (operatorContext.ts says so); every secret below
 *   is typed at the terminal, never read from the environment or a *_FILE variable, so such a program must type them;
 * - AMC_NO_SIGN=1 (the move is a signed record);
 * - the workspace has accounts, or an approval policy, tools, action-policy or config files that differ from what the
 *   menu wrote, or this computer did not create its keys (a clone or a copy);
 * - the person does not type the confirmation phrase, or the vault passphrase does not open the vault.
 * A vault whose passphrase AMC generated (the menu's `.amc/local-vault-passphrase`) gets a passphrase the person types,
 * as `init --coding` requires, through `amc vault passphrase`'s own change (same keys).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { userInfo } from "node:os";
import inquirer from "inquirer";
import YAML from "yaml";
import { approvalPolicyPath, defaultApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { approvalPolicySchema } from "../approvals/approvalPolicySchema.js";
import { usersConfigPath } from "../auth/authApi.js";
import { passwordPolicyProblem } from "../auth/passwordHash.js";
import { actionPolicyPath, defaultActionPolicy, loadActionPolicy } from "../governor/actionPolicyStore.js";
import { actionPolicySchema } from "../governor/actionPolicySchema.js";
import { keysetAnchoring } from "../keys/keyset.js";
import { toolsConfigPath } from "../toolhub/toolhubValidators.js";
import { defaultToolsConfig, toolsConfigSchema } from "../toolhub/toolsSchema.js";
import { canonicalize } from "../utils/json.js";
import { localVaultPassphrasePath } from "../vault/localPassphrase.js";
import { interactiveOperator, operatorRefusalText } from "../vault/operatorContext.js";
import { vaultOpensWith } from "../vault/vault.js";
import { loadAMCConfig } from "../workspace.js";

/** What the person types to say yes: shown on screen; anything else, an empty line or the end of input is a no. */
export const CODING_MOVE_PHRASE = "move this folder";

/** What the coding setup allows and what it does not, in the words shown before the confirmation. */
function codingSetupSummary(webHosts: readonly string[]): string[] {
  return [
    "An agent here reads files, and edits files or runs commands only after you see each one and say yes.",
    "  Each action and your answer are signed and recorded. The file tools never open .env or key files and never open",
    "  AMC's own files; a command you approve can read anything your account can. Commands have no network and write",
    `  only in this folder.${webHosts.length > 0 ? ` The web tools may reach only: ${webHosts.join(", ")}.` : ""} You are the one who approves.`
  ];
}

const sameAs = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);

/** True when the file is missing or reads as `expected`; a file that cannot be read is named, never dumped. */
function asWritten(path: string, parse: (value: unknown) => unknown, expected: unknown, name: string, blockers: string[]): void {
  if (!existsSync(path)) return;
  try {
    if (!sameAs(parse(YAML.parse(readFileSync(path, "utf8"))), expected)) blockers.push(`${name} was changed (.amc/${path.split("/").at(-1)})`);
  } catch {
    blockers.push(`${name} cannot be read (.amc/${path.split("/").at(-1)})`);
  }
}

/** Each file the move would replace that is not as the menu wrote it, in words; empty when the move may go ahead. */
export function codingAdoptionBlockers(workspace: string): string[] {
  if (!existsSync(join(workspace, ".amc", "amc.config.yaml"))) return ["its .amc folder is not a complete AMC workspace"];
  // As for .amc/local-vault-passphrase: only a workspace whose keys this computer created, never a clone or a copy.
  if (keysetAnchoring(workspace).state !== "committed") return ["this computer did not create its keys (a copy or a clone)"];
  const blockers: string[] = [];
  if (existsSync(usersConfigPath(workspace))) blockers.push("it already has accounts (.amc/users.yaml)");
  // `amc up` writes the default approval policy.
  asWritten(approvalPolicyPath(workspace), (v) => approvalPolicySchema.parse(v), defaultApprovalPolicy(), "its approval policy", blockers);
  asWritten(toolsConfigPath(workspace), (v) => toolsConfigSchema.parse(v), defaultToolsConfig(), "its tool list", blockers);
  asWritten(actionPolicyPath(workspace), (v) => actionPolicySchema.parse(v), defaultActionPolicy(), "its Action Policy", blockers);
  try { if (loadAMCConfig(workspace).profile !== "dev") blockers.push("its settings use another profile (.amc/amc.config.yaml)"); }
  catch { blockers.push("its settings cannot be read (.amc/amc.config.yaml)"); }
  return blockers;
}

/** The coding setup is here: an owner account and file edits that run on a person's approval. */
export function hasCodingSetup(workspace: string): boolean {
  try {
    return existsSync(usersConfigPath(workspace))
      && loadActionPolicy(workspace).actions.find((rule) => rule.actionClass === "WRITE_LOW")?.executeOnApproval === true;
  } catch {
    return false;
  }
}

/** Only a person moves a workspace to the coding setup, as far as AMC can recognise one (see the header). */
export function assertPersonAdopts(workspace: string, env: NodeJS.ProcessEnv = process.env, stdin: { isTTY?: boolean } = process.stdin): void {
  if (env.AMC_NO_SIGN === "1") {
    throw new Error("The coding setup is written as signed records, and AMC_NO_SIGN=1 turns signing off. Unset it and run this again. Nothing was changed.");
  }
  const person = interactiveOperator({ workspace, env, stdin });
  if (!person.ok) {
    throw new Error(`Moving this folder to the coding setup needs you at your own terminal, and ${operatorRefusalText(person)}. Nothing was changed.`);
  }
}

export interface CodingAdoptionIo {
  readonly log: (line: string) => void;
  /** The line typed after `prompt`; null at the end of input. */
  readonly line: (prompt: string) => Promise<string | null>;
  readonly secret: (message: string) => Promise<string>;
  /** A new secret typed twice; null when the two entries differ. `problem` refuses one at the prompt. */
  readonly newSecret: (message: string, problem: (value: string) => string | null) => Promise<string | null>;
}

/** One line from `input`, or null when it ends first (Ctrl-D). Real readline: no prompt library decides the answer. */
export function readTypedLine(prompt: string, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = createInterface({ input, output, terminal: false });
    let answered = false;
    output.write(prompt);
    reader.once("line", (text) => { answered = true; reader.close(); resolve(text); });
    reader.once("close", () => { if (!answered) resolve(null); });
  });
}

const password = async (message: string, problem?: (value: string) => string | null): Promise<string> =>
  (await inquirer.prompt<{ value: string }>([{ type: "password", name: "value", message, mask: "*",
    ...(problem === undefined ? {} : { validate: (v: string) => problem(v) ?? true }) }])).value;

export const terminalAdoptionIo: CodingAdoptionIo = {
  log: (line) => console.log(line),
  line: (prompt) => readTypedLine(prompt),
  secret: (message) => password(message),
  newSecret: async (message, problem) => {
    const first = await password(message, problem);
    return first === await password(`${message} (again)`) ? first : null;
  }
};

const stopped = (error: unknown): never => {
  if (error instanceof Error && error.name === "ExitPromptError") throw new Error("Stopped at the prompt. Nothing was changed.");
  throw error;
};

export interface CodingAdoption {
  readonly passphrase: { readonly current: string; readonly next: string | null };
  readonly owner: { readonly username: string; readonly password: string };
  /** Which operating-system account typed the answers at a terminal. */
  readonly osAccount: string;
}

/** The passphrase that opens the vault now. The menu's generated one is read from its file: the person never saw it. */
async function currentPassphrase(workspace: string, io: CodingAdoptionIo): Promise<string> {
  const generated = localVaultPassphrasePath(workspace);
  // ponytail: the residual. A same-user program can read this file too; only a passphrase the person chose closes that.
  const current = existsSync(generated) ? readFileSync(generated, "utf8").trim() : await io.secret("This folder's vault passphrase");
  if (!vaultOpensWith(workspace, current)) throw new Error("That passphrase does not open this folder's vault. Nothing was changed.");
  return current;
}

/** The owner's Studio login, typed at the terminal; never from AMC_BOOTSTRAP_OWNER_* or their _FILE variants. */
async function typedOwner(io: CodingAdoptionIo): Promise<CodingAdoption["owner"]> {
  const fallback = userInfo().username;
  const username = ((await io.line(`Owner username (Enter for ${fallback}): `)) ?? "").trim() || fallback;
  const chosen = await io.newSecret(`Studio password for ${username}`, (v) => passwordPolicyProblem(v, username));
  if (chosen === null) throw new Error("Studio password: the two entries differ. Nothing was changed.");
  const refused = passwordPolicyProblem(chosen, username);
  if (refused !== null) throw new Error(`The owner's Studio password is refused: ${refused}. Nothing was changed.`);
  return { username, password: chosen };
}

/**
 * The checks, the words, the typed confirmation and every secret, typed. Returns null when the person did not type the
 * phrase. Writes nothing.
 */
export async function prepareCodingAdoption(workspace: string, webHosts: readonly string[], io: CodingAdoptionIo): Promise<CodingAdoption | null> {
  const blockers = codingAdoptionBlockers(workspace);
  if (blockers.length > 0) {
    throw new Error(`This folder cannot move to the coding setup in place: ${blockers.join("; ")}. Nothing was changed. `
      + "Use a new folder for the coding setup, or keep this one as it is.");
  }
  io.log("The coding setup keeps this folder's records, keys and history.");
  for (const line of codingSetupSummary(webHosts)) io.log(line);
  const typed = await io.line(`To move this folder to the coding setup, type "${CODING_MOVE_PHRASE}" and press Enter (anything else stops): `);
  if (typed?.trim() !== CODING_MOVE_PHRASE) {
    io.log("Nothing was changed.");
    return null;
  }
  try {
    const current = await currentPassphrase(workspace, io);
    let next: string | null = null;
    if (existsSync(localVaultPassphrasePath(workspace))) {
      io.log("Choose a vault passphrase. You type it to start a chat here.");
      next = await io.newSecret("New vault passphrase", (v) => v.length >= 8 ? null : "At least 8 characters");
      if (next === null) throw new Error("New vault passphrase: the two entries differ. Nothing was changed.");
    }
    return { passphrase: { current, next }, owner: await typedOwner(io), osAccount: userInfo().username };
  } catch (error) { return stopped(error); }
}
