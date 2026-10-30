/**
 * amcconfig.yaml Loader
 *
 * Discovers, loads, validates, and resolves amcconfig.yaml files.
 * Supports explicit path, workspace-relative, and cwd-relative discovery.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join, dirname } from "node:path";
import YAML from "yaml";
import { resolveConfigOverlays, type ConfigOverlayOptions, type ConfigProvenance } from "./configOverlays.js";
import {
  defaultDeclarativeConfig,
  type AMCDeclarativeConfig,
  type AMCAgent,
  type AMCAssurancePackRef,
} from "./amcConfigSchema.js";

// ---------------------------------------------------------------------------
// Discovery — find amcconfig.yaml
// ---------------------------------------------------------------------------

/** Candidate filenames in priority order */
const CONFIG_FILENAMES = [
  "amcconfig.yaml",
  "amcconfig.yml",
  ".amcconfig.yaml",
  ".amcconfig.yml",
  "amc.config.yaml",
  "amc.config.yml",
];

/**
 * Search for an amcconfig.yaml file in the given directory and its .amc/ subdirectory.
 * Returns the resolved absolute path, or null if not found.
 */
export function discoverConfigFile(searchDir: string): string | null {
  const dirs = [searchDir, join(searchDir, ".amc")];

  for (const dir of dirs) {
    for (const filename of CONFIG_FILENAMES) {
      // .amc/amc.config.yaml is the separate workspace runtime policy, not an evaluation overlay.
      if (dir !== searchDir && filename === "amc.config.yaml") continue;
      const candidate = resolve(dir, filename);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Loading — parse + validate
// ---------------------------------------------------------------------------

export interface LoadConfigResult {
  config: AMCDeclarativeConfig;
  configPath: string;
  warnings: string[];
  provenance: ConfigProvenance;
}

/**
 * Load and validate an amcconfig.yaml file.
 *
 * @param explicitPath - Explicit path to config file (highest priority)
 * @param workspace - Workspace directory for discovery (default: cwd)
 * @throws Error if file not found or validation fails
 */
export function loadDeclarativeConfig(
  explicitPath?: string,
  workspace?: string,
  options: ConfigOverlayOptions = {},
): LoadConfigResult {
  const ws = resolve(workspace ?? process.cwd());
  const warnings: string[] = [];
  const files: Array<{ layer: "workspace" | "user" | "explicit"; path: string }> = [];
  const discovered = discoverConfigFile(ws);
  if (discovered) files.push({ layer: "workspace", path: discovered });
  const user = options.userConfig === false ? null
    : typeof options.userConfig === "string" ? resolve(ws, options.userConfig) : join(homedir(), ".amc", "amcconfig.yaml");
  if (user && (typeof options.userConfig === "string" || existsSync(user))) files.push({ layer: "user", path: user });
  if (explicitPath !== undefined) files.push({ layer: "explicit", path: resolve(ws, explicitPath) });
  for (const file of files) {
    if (!existsSync(file.path)) throw new Error(`Config file not found: ${file.path}`);
  }
  const configPath = files[files.length - 1]?.path;
  if (!configPath) {
    throw new Error(`No amcconfig.yaml found in ${ws} or ${join(ws, ".amc")}.\nCreate one with: amc config init\nOr specify a path with: --config <path>`);
  }
  let resolved: ReturnType<typeof resolveConfigOverlays>;
  try {
    resolved = resolveConfigOverlays(ws, files, options.overrides);
  } catch (error) {
    throw new Error(`Invalid amcconfig.yaml (${configPath}): ${error instanceof Error ? error.message : String(error)}`);
  }
  const { config, provenance } = resolved;

  // Post-validation warnings
  if (config.agents.length === 0) {
    warnings.push("No agents defined — nothing to evaluate.");
  }

  // Check provider references
  const providerIds = new Set(config.providers?.map((p) => p.id) ?? []);
  for (const agent of config.agents) {
    if (agent.provider && !providerIds.has(agent.provider)) {
      warnings.push(
        `Agent "${agent.id}" references provider "${agent.provider}" which is not defined in providers[].`
      );
    }
  }

  // Check assurance pack validity
  if (config.assurance?.packs) {
    for (const packRef of config.assurance.packs) {
      const packId = typeof packRef === "string" ? packRef : packRef.id;
      // We can't import the pack registry here without circular deps,
      // so we just warn about suspicious IDs
      if (packId.includes(" ") || packId.length > 80) {
        warnings.push(`Suspicious assurance pack ID: "${packId}"`);
      }
    }
  }

  return { config, configPath, warnings, provenance };
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/**
 * Merge environment variables: config.env → agent.env → process.env
 */
export function resolveAgentEnv(
  config: AMCDeclarativeConfig,
  agent: AMCAgent,
): Record<string, string> {
  return {
    ...(config.env ?? {}),
    ...(agent.env ?? {}),
  };
}

/**
 * Resolve the list of assurance pack IDs to run for a given config.
 */
export function resolveAssurancePackIds(config: AMCDeclarativeConfig): string[] {
  const assurance = config.assurance;
  if (!assurance) return [];

  if (assurance.runAll) {
    // Return sentinel — the runner will expand to all packs
    return ["__ALL__"];
  }

  if (!assurance.packs || assurance.packs.length === 0) {
    return [];
  }

  return assurance.packs.map((ref) =>
    typeof ref === "string" ? ref : ref.id
  );
}

/**
 * Check whether a config passes its own thresholds given a report.
 * Returns { passed: boolean, failures: string[] }.
 */
export function checkThresholds(
  config: AMCDeclarativeConfig,
  report: {
    integrityIndex: number;
    layerScores: Array<{ layerName: string; avgFinalLevel: number }>;
    trustLabel: string;
  },
): { passed: boolean; failures: string[] } {
  const thresholds = config.thresholds;
  if (!thresholds) return { passed: true, failures: [] };

  const failures: string[] = [];

  if (report.integrityIndex < thresholds.minIntegrityIndex) {
    failures.push(
      `IntegrityIndex ${report.integrityIndex.toFixed(3)} < threshold ${thresholds.minIntegrityIndex}`
    );
  }

  // Check per-layer thresholds
  if (thresholds.layers) {
    for (const [layerName, minLevel] of Object.entries(thresholds.layers)) {
      const layer = report.layerScores.find((l) => l.layerName === layerName);
      if (layer && layer.avgFinalLevel < minLevel) {
        failures.push(
          `Layer "${layerName}" level ${layer.avgFinalLevel.toFixed(2)} < threshold ${minLevel}`
        );
      }
    }
  }

  if (thresholds.denyIfLowTrust && report.trustLabel.includes("LOW")) {
    failures.push(`Trust label is "${report.trustLabel}" — denyIfLowTrust is enabled`);
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Pretty-print config summary for terminal output.
 */
export function summarizeConfig(result: LoadConfigResult): string {
  const { config, configPath } = result;
  const lines: string[] = [
    `Config: ${configPath}`,
    `Version: ${config.version}`,
    config.description ? `Description: ${config.description}` : "",
    `Agents: ${config.agents.map((a) => a.id).join(", ")}`,
    `Providers: ${config.providers?.map((p) => p.id).join(", ") ?? "none"}`,
    `Thresholds: integrity≥${config.thresholds?.minIntegrityIndex ?? "none"}, overall≥${config.thresholds?.minOverallLevel ?? "none"}`,
    `Assurance: ${config.assurance?.runAll ? "ALL packs" : (config.assurance?.packs?.length ?? 0) + " packs"}`,
    `Diagnostic window: ${config.diagnostic?.window ?? "30d"}`,
    `Output: ${config.output?.formats?.join(", ") ?? "terminal"}`,
    `CI: failOnThreshold=${config.ci?.failOnThresholdViolation ?? true}`,
  ];

  return lines.filter(Boolean).join("\n");
}
