/** The terminal side of `amc connect`'s watch offer (connectWatch.ts): sign-in status, prompts, and the observe install. */
import inquirer from "inquirer";
import { installHookIntegration } from "../adapters/hookIntegration.js";
import { CODEX_NEXT_STEPS } from "../adapters/hookProviders/codex.js";
import { inspectSignIn } from "../setup/agentSignIn.js";
import { confirmRememberedUnlock } from "../vault/operatorContext.js";
import { unlockVaultInteractive, vaultStatusNow } from "../vault/vaultCli.js";
import { requireStudioBridgeBase } from "./studioBridge.js";
import type { WatchOfferDeps } from "./connectWatch.js";

/**
 * The install takes the steps `amc connect hooks install --mode observe` takes: this workspace's own Bridge (refused when
 * no Studio runs here), the D4 question when the vault was opened from the remembered store, then the vault unlock.
 */
async function installObserveHook(workspace: string, provider: "claude-code" | "codex", agentId: string): Promise<string[]> {
  const bridgeBase = requireStudioBridgeBase(workspace, undefined);
  await confirmRememberedUnlock(workspace, "connect hooks install");
  if (!vaultStatusNow(workspace).unlocked) await unlockVaultInteractive(workspace);
  const result = installHookIntegration({ workspace, provider, mode: "observe", agentId, bridgeBase });
  return [
    result.changed ? "AMC hook installed" : "AMC hook already installed",
    ...result.files.map((file) => `  ${file.action.padEnd(12)} ${file.path}`),
    "Boundary: observation only; the agent's own allow and deny decisions are unchanged.",
    ...(provider === "codex" ? ["Next (in Codex, not in AMC):", ...CODEX_NEXT_STEPS.map((step, index) => `  ${index + 1}. ${step}`)] : []),
    `Check it: amc connect hooks status --provider ${provider}`
  ];
}

export function connectWatchDeps(workspace: string, log: (line: string) => void = console.log): WatchOfferDeps {
  return {
    signIn: () => inspectSignIn(),
    choose: async (message, choices) => {
      try {
        return (await inquirer.prompt<{ picked: string }>([{ type: "select", name: "picked", message, choices: [...choices] }])).picked;
      } catch {
        return null; // Ctrl-C
      }
    },
    confirm: async (message) => {
      try {
        return (await inquirer.prompt<{ ok: boolean }>([{ type: "confirm", name: "ok", message, default: true }])).ok;
      } catch {
        return false;
      }
    },
    install: (provider, agentId) => installObserveHook(workspace, provider, agentId),
    log
  };
}
