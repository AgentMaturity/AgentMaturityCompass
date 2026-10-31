import type { AMCConfig } from "../types.js";
import { geminiCliAdapter } from "../adapters/builtins/geminiCli.js";
import { detectLegacyRuntime, type RuntimeIntegration } from "./common.js";

/** @deprecated Legacy diagnostic wrapper; use src/adapters/builtins/geminiCli.ts and adapterDetection.ts. */
export const geminiCliRuntime: RuntimeIntegration = {
  name: "gemini",
  installHint: "Install Gemini CLI and ensure `gemini` is available in PATH.",
  detect(config: AMCConfig) {
    const command = config.runtimes.gemini.command;
    return detectLegacyRuntime(geminiCliAdapter, command);
  }
};
