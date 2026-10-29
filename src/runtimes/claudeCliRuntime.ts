import type { AMCConfig } from "../types.js";
import { claudeCliAdapter } from "../adapters/builtins/claudeCli.js";
import { detectLegacyRuntime, type RuntimeIntegration } from "./common.js";

/** @deprecated Legacy diagnostic wrapper; use src/adapters/builtins/claudeCli.ts and adapterDetection.ts. */
export const claudeCliRuntime: RuntimeIntegration = {
  name: "claude",
  installHint: "Install Claude Code CLI: npm install -g @anthropic-ai/claude-code",
  detect(config: AMCConfig) {
    const command = config.runtimes.claude?.command ?? "claude";
    return detectLegacyRuntime(claudeCliAdapter, command);
  }
};
