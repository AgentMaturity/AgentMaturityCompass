import type { AMCConfig } from "../types.js";
import { openclawCliAdapter } from "../adapters/builtins/openclawCli.js";
import { detectLegacyRuntime, type RuntimeIntegration } from "./common.js";

/** @deprecated Legacy diagnostic wrapper; use src/adapters/builtins/openclawCli.ts and adapterDetection.ts. */
export const openclawCliRuntime: RuntimeIntegration = {
  name: "openclaw",
  installHint: "Install OpenClaw CLI and ensure `openclaw` is available in PATH.",
  detect(config: AMCConfig) {
    const command = config.runtimes.openclaw.command;
    return detectLegacyRuntime(openclawCliAdapter, command);
  }
};
