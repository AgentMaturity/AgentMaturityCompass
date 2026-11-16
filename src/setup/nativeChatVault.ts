/**
 * Chat runs every turn in a child without a terminal, and the remembered vault store is for an interactive operator only
 * (src/vault/operatorContext.ts), so the child alone cannot use it. The parent, which is that operator, resolves the
 * passphrase once and hands it to its own children in their environment (never argv). The model's shell tool runs with an
 * allow-listed environment (src/utils/providerKeys.ts commandEnv), so the passphrase does not reach it.
 * A folder set up by bare `amc` has a passphrase AMC generated and kept for the operator; it is used the way bare `amc`
 * uses it before its own chat (loadLocalVaultPassphrase: never for an agent, only for a vault this machine created), so
 * the direct command and the menu's chat unlock alike and nobody is asked for a passphrase they never chose.
 */
import inquirer from "inquirer";
import { loadLocalVaultPassphrase } from "../vault/localPassphrase.js";
import { interactiveOperator } from "../vault/operatorContext.js";
import { operatorRememberedPassphrase } from "../vault/passphraseStore.js";
import { vaultExists, vaultOpensWith } from "../vault/vault.js";

export interface ChatVaultDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly vaultExists: (workspace: string) => boolean;
  /** The LIVE-VAULT-01 gate: a terminal on stdin, no agent mode, no agent marker. */
  readonly operator: (workspace: string) => boolean;
  readonly remembered: (workspace: string) => string | null;
  /** The passphrase bare `amc` generated for this folder, under loadLocalVaultPassphrase's gates; null when it does not apply. */
  readonly local: (workspace: string) => string | null;
  readonly opensWith: (workspace: string, passphrase: string) => boolean;
  /** A masked question that only accepts a passphrase that opens the vault; null when the operator cancels. */
  readonly ask: (workspace: string, opens: (passphrase: string) => boolean) => Promise<string | null>;
}

/** The passphrase chat's children need, or null when they already inherit one, there is no vault, or nobody can answer. */
export async function chatVaultPassphrase(workspace: string, deps: ChatVaultDeps = defaultChatVaultDeps()): Promise<string | null> {
  if ((deps.env.AMC_VAULT_PASSPHRASE ?? "").length > 0 || (deps.env.AMC_VAULT_PASSPHRASE_FILE ?? "").trim().length > 0) return null;
  if (!deps.vaultExists(workspace) || !deps.operator(workspace)) return null;
  const opens = (passphrase: string) => deps.opensWith(workspace, passphrase);
  const remembered = deps.remembered(workspace);
  if (remembered !== null && opens(remembered)) return remembered;
  const local = deps.local(workspace);
  if (local !== null && opens(local)) return local;
  return deps.ask(workspace, opens);
}

function defaultChatVaultDeps(): ChatVaultDeps {
  return {
    env: process.env,
    vaultExists,
    operator: (workspace) => interactiveOperator({ workspace }).ok,
    remembered: (workspace) => operatorRememberedPassphrase(workspace)?.passphrase ?? null,
    local: (workspace) => {
      // Read into a scratch environment, never this process's: only the children chat starts receive it.
      const scratch: NodeJS.ProcessEnv = { ...process.env, AMC_VAULT_PASSPHRASE: "" };
      return loadLocalVaultPassphrase(workspace, scratch).loaded ? scratch.AMC_VAULT_PASSPHRASE ?? null : null;
    },
    opensWith: vaultOpensWith,
    ask: async (_workspace, opens) => {
      try {
        const { passphrase } = await inquirer.prompt<{ passphrase: string }>([{ type: "password", name: "passphrase", mask: "*",
          message: "Vault passphrase (chat signs each turn with the vault keys):",
          validate: (value: string) => opens(value) || "That passphrase does not open this workspace's vault." }]);
        return passphrase;
      } catch {
        return null; // Ctrl-C at the question
      }
    }
  };
}
