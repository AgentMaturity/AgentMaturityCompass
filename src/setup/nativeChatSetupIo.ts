/** The terminal side of chat's setup questions (nativeChatSetup.ts): inquirer prompts and the `amc credentials set` store. */
import inquirer from "inquirer";
import { openStore, readSecretFromStdinOrPrompt } from "../cli-credentials-commands.js";
import { credentialRef } from "../credentials/credentialRef.js";
import { inspectNativeFirstUse } from "./nativeFirstUseGuide.js";
import { workspaceModelFamilies, type ChatSetupDeps } from "./nativeChatSetup.js";

/** Ctrl-C at an inquirer question rejects; chat treats it as a cancelled question. */
async function orNull<T>(question: () => Promise<T>): Promise<T | null> {
  try { return await question(); } catch { return null; }
}

export function chatSetupDeps(io: { log: (line: string) => void }): ChatSetupDeps {
  return {
    env: process.env,
    log: io.log,
    ask: (message) => orNull(async () => (await inquirer.prompt<{ answer: string }>([{ type: "input", name: "answer", message }])).answer),
    askSecret: (ref) => orNull(() => readSecretFromStdinOrPrompt(credentialRef(ref))),
    inspect: inspectNativeFirstUse,
    storeCredential: async ({ ref, value, options }) => {
      const store = openStore({ projectDir: options.workspace, home: options.credentialsHome, file: options.credentialsFile });
      try {
        await store.set(credentialRef(ref), value);
        return store.paths.file;
      } finally {
        await store.close();
      }
    },
    modelFamilies: workspaceModelFamilies
  };
}
