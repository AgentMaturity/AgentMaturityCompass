/**
 * Legacy diagnostic harness compatibility utilities; not governed native execution.
 * Canonical CLI detection and launching live in src/adapters/adapterDetection.ts
 * and src/adapters/adapterRunner.ts. The interactive diagnostic fallback remains
 * a legacy claim collection path, not an execution approval or maturity receipt.
 */
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { z } from "zod";
import type { AMCConfig, RuntimeName } from "../types.js";
import { stripAmcSecrets } from "../utils/providerKeys.js";
import { detectAdapter } from "../adapters/adapterDetection.js";
import type { AdapterDefinition } from "../adapters/adapterTypes.js";
import { claudeCliAdapter } from "../adapters/builtins/claudeCli.js";
import { geminiCliAdapter } from "../adapters/builtins/geminiCli.js";
import { openclawCliAdapter } from "../adapters/builtins/openclawCli.js";

const legacyAdapters: Partial<Record<RuntimeName, AdapterDefinition>> = {
  claude: claudeCliAdapter,
  gemini: geminiCliAdapter,
  openclaw: openclawCliAdapter
};

export interface RuntimeCapabilities {
  supportsVersion: boolean;
  supportsHelp: boolean;
  knownFlags: string[];
  rawHelp: string;
}

export interface RuntimeIntegration {
  name: RuntimeName;
  installHint: string;
  detect(config: AMCConfig): {
    available: boolean;
    command: string;
    resolvedPath: string | null;
    capabilities: RuntimeCapabilities;
    error?: string;
  };
}

/** @deprecated Compatibility projection; use src/adapters/adapterDetection.ts directly. */
export function detectLegacyRuntime(definition: AdapterDefinition, command: string): ReturnType<RuntimeIntegration["detect"]> {
  const detection = detectAdapter({
    ...definition,
    detection: {
      ...definition.detection,
      commandCandidates: command === definition.commandTemplate.executable ? definition.detection.commandCandidates : [command]
    }
  });
  const selectedCommand = detection.command ?? command;
  return {
    available: detection.installed,
    command: selectedCommand,
    resolvedPath: detection.installed ? resolveCommand(selectedCommand) : null,
    capabilities: detection.installed ? discoverCapabilities(selectedCommand) : {
      supportsHelp: false, supportsVersion: false, knownFlags: [], rawHelp: ""
    },
    ...(!detection.installed ? { error: "command not found" } : {})
  };
}

export interface HarnessOptions<T> {
  config: AMCConfig;
  schema: z.ZodSchema<T>;
  maxRetries?: number;
}

export interface HarnessResult<T> {
  value: T;
  attempts: number;
  /** True when a human pasted the JSON after the runtime failed; the value is not runtime output. */
  usedFallback: boolean;
}

export function discoverCapabilities(command: string): RuntimeCapabilities {
  const help = spawnSync(command, ["--help"], { encoding: "utf8" });
  const raw = `${help.stdout ?? ""}\n${help.stderr ?? ""}`.trim();
  const flags = new Set<string>();
  const flagRegex = /--[a-zA-Z0-9-]+/g;
  for (const match of raw.matchAll(flagRegex)) {
    flags.add(match[0]);
  }

  return {
    supportsVersion: raw.includes("--version") || raw.includes("-v"),
    supportsHelp: help.status === 0 || raw.length > 0,
    knownFlags: [...flags],
    rawHelp: raw
  };
}

export function resolveCommand(command: string): string | null {
  const out = spawnSync("which", [command], { encoding: "utf8" });
  if (out.status === 0) {
    return (out.stdout ?? "").trim() || null;
  }
  return null;
}

function buildArgsTemplate(argsTemplate: string[], prompt: string): { args: string[]; sendViaStdin: boolean } {
  if (argsTemplate.length === 0) {
    return { args: [], sendViaStdin: true };
  }

  let sendViaStdin = true;
  const args = argsTemplate.map((part) => {
    if (part.includes("{{prompt}}")) {
      sendViaStdin = false;
      return part.replaceAll("{{prompt}}", prompt);
    }
    return part;
  });

  return { args, sendViaStdin };
}

export async function runHarnessWithRetries<T>(
  runtimeName: RuntimeName,
  prompt: string,
  opts: HarnessOptions<T>
): Promise<HarnessResult<T>> {
  const maxRetries = opts.maxRetries ?? 2;
  const runtimeKey =
    runtimeName === "unknown" || runtimeName === "gateway" || runtimeName === "any" || runtimeName === "sandbox" || runtimeName === "amc" || runtimeName === "pi"
      ? "mock"
      : runtimeName;
  const runtimeConfig = opts.config.runtimes[runtimeKey];
  const definition = legacyAdapters[runtimeKey];
  const command = definition && runtimeConfig.command === definition.commandTemplate.executable
    ? detectAdapter(definition).command ?? runtimeConfig.command
    : runtimeConfig.command;

  let currentPrompt = prompt;
  let attempts = 0;

  for (; attempts <= maxRetries; attempts += 1) {
    const { args, sendViaStdin } = buildArgsTemplate(runtimeConfig.argsTemplate, currentPrompt);
    const result = await spawnCollect(command, args, sendViaStdin ? `${currentPrompt}\n` : null);
    const parsed = safeExtractJson(result.stdout || result.stderr || "");

    if (parsed.success) {
      const validated = opts.schema.safeParse(parsed.value);
      if (validated.success) {
        return { value: validated.data, attempts: attempts + 1, usedFallback: false };
      }
    }

    currentPrompt = `${prompt}\n\nReturn ONLY valid JSON that matches the schema. No markdown, no extra text.`;
  }

  // The human paste fallback needs a person at a terminal. On a pipe or protocol stream it would block or eat frames.
  if (!input.isTTY) {
    throw new Error(`Harness output for ${runtimeName} was not valid JSON after ${attempts} attempts and stdin is not a terminal; refusing the interactive fallback.`);
  }
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const raw = await rl.question(`Harness output for ${runtimeName} was invalid JSON. Paste valid JSON now: `);
      const parsed = safeExtractJson(raw);
      if (!parsed.success) {
        output.write("Could not parse JSON. Try again.\n");
        continue;
      }
      const validated = opts.schema.safeParse(parsed.value);
      if (!validated.success) {
        output.write(`JSON does not match schema: ${validated.error.message}\n`);
        continue;
      }
      return { value: validated.data, attempts: attempts + 1, usedFallback: true };
    }
  } finally {
    rl.close();
  }
}

export function spawnCollect(command: string, args: string[], stdinPayload: string | null): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      // The runtime under diagnosis may use its own provider key; it never gets AMC's secrets (WP36).
      env: stripAmcSecrets(process.env),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}` });
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    if (stdinPayload !== null) {
      child.stdin.write(stdinPayload);
      child.stdin.end();
    }
  });
}

function safeExtractJson(raw: string): { success: true; value: unknown } | { success: false } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { success: false };
  }

  try {
    return { success: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return { success: true, value: JSON.parse(slice) as unknown };
      } catch {
        return { success: false };
      }
    }
    return { success: false };
  }
}
