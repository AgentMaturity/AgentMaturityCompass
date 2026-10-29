/**
 * Legacy diagnostic registry compatibility projection, not native runtime governance.
 * Canonical CLI definitions and install state come from src/adapters/registry.ts
 * and src/adapters/adapterDetection.ts; launching belongs to adapterRunner.ts.
 */
import type { AMCConfig, RuntimeName } from "../types.js";
import { claudeCliRuntime } from "./claudeCliRuntime.js";
import { geminiCliRuntime } from "./geminiCliRuntime.js";
import { mockRuntime } from "./mockRuntime.js";
import { openclawCliRuntime } from "./openclawCliRuntime.js";
import type { RuntimeIntegration } from "./common.js";

/** @deprecated Use src/adapters/registry.ts; retained for legacy diagnostic callers. */
export const runtimeIntegrations: RuntimeIntegration[] = [
  claudeCliRuntime,
  geminiCliRuntime,
  openclawCliRuntime,
  mockRuntime
];

/** @deprecated Use src/adapters/registry.ts; retained for legacy diagnostic callers. */
export function getRuntimeIntegration(name: RuntimeName): RuntimeIntegration {
  const found = runtimeIntegrations.find((runtime) => runtime.name === name);
  if (!found) {
    throw new Error(`Unsupported runtime: ${name}`);
  }
  return found;
}

/** @deprecated Legacy summary of canonical adapter detection; use src/adapters/adapterDetection.ts. */
export function detectAllRuntimes(config: AMCConfig): Array<{
  name: RuntimeName;
  available: boolean;
  command: string;
  resolvedPath: string | null;
  error?: string;
  installHint: string;
}> {
  return runtimeIntegrations
    .filter((runtime) => runtime.name !== "mock")
    .map((runtime) => {
      const detection = runtime.detect(config);
      return {
        name: runtime.name,
        available: detection.available,
        command: detection.command,
        resolvedPath: detection.resolvedPath,
        error: detection.error,
        installHint: runtime.installHint
      };
    });
}
