/**
 * Opt-in Anonymous Telemetry
 * 
 * `amc telemetry on/off/status`
 * 
 * When enabled, sends ONLY:
 * - OS name + arch
 * - Node.js version
 * - AMC version
 * - Command used (e.g. "run", "quickscore", "doctor")
 * - Score level (L0-L5) — NOT the actual scores or evidence
 * - Adapter name (e.g. "claude", "openai") — NOT API keys
 * 
 * NEVER sends: agent data, scores, evidence, API keys, file paths,
 * workspace contents, user identity, or any PII.
 * 
 * Default: OFF. Must be explicitly enabled.
 * Config stored in: ~/.amc/telemetry.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir, platform, arch } from "os";
import { versions } from "process";
import { randomUUID } from "crypto";

const TELEMETRY_DIR = join(homedir(), ".amc");
const TELEMETRY_FILE = join(TELEMETRY_DIR, "telemetry.json");

export interface TelemetryConfig {
  enabled: boolean;
  installId: string; // anonymous install ID, no PII
  enabledAt?: string;
  disabledAt?: string;
}

export interface TelemetryEvent {
  installId: string;
  amcVersion: string;
  nodeVersion: string;
  os: string;
  arch: string;
  command: string;
  scoreLevel?: string; // "L0" - "L5"
  adapterName?: string;
  timestamp: string;
}

/** Collected fields shown to user on `amc telemetry status` */
export const COLLECTED_FIELDS = [
  "OS name + architecture (e.g. darwin/arm64)",
  "Node.js version (e.g. 20.11.0)",
  "AMC version (e.g. 1.5.0)",
  "Command used (e.g. run, quickscore, doctor)",
  "Score level if applicable (L0-L5, NOT actual scores)",
  "Adapter name if applicable (e.g. claude, openai)",
  "Anonymous install ID (random UUID, no PII)",
  "Timestamp",
] as const;

export const NEVER_COLLECTED = [
  "Agent data or configuration",
  "Actual maturity scores or evidence",
  "API keys or credentials",
  "File paths or workspace contents",
  "User identity or PII",
  "IP addresses (not logged server-side)",
] as const;

function loadConfig(): TelemetryConfig {
  if (!existsSync(TELEMETRY_FILE)) {
    return { enabled: false, installId: randomUUID() };
  }
  try {
    return JSON.parse(readFileSync(TELEMETRY_FILE, "utf8"));
  } catch {
    return { enabled: false, installId: randomUUID() };
  }
}

function saveConfig(config: TelemetryConfig): void {
  mkdirSync(TELEMETRY_DIR, { recursive: true });
  writeFileSync(TELEMETRY_FILE, JSON.stringify(config, null, 2) + "\n");
}

export function telemetryOn(): TelemetryConfig {
  const config = loadConfig();
  config.enabled = true;
  config.enabledAt = new Date().toISOString();
  delete config.disabledAt;
  saveConfig(config);
  return config;
}

export function telemetryOff(): TelemetryConfig {
  const config = loadConfig();
  config.enabled = false;
  config.disabledAt = new Date().toISOString();
  saveConfig(config);
  return config;
}

export function telemetryStatus(): { config: TelemetryConfig; collectedFields: readonly string[]; neverCollected: readonly string[] } {
  return {
    config: loadConfig(),
    collectedFields: COLLECTED_FIELDS,
    neverCollected: NEVER_COLLECTED,
  };
}

export function isEnabled(): boolean {
  return loadConfig().enabled;
}

/**
 * Build a telemetry event. Does NOT send it — caller decides transport.
 * This separation ensures testability and transparency.
 */
export function buildEvent(opts: {
  amcVersion: string;
  command: string;
  scoreLevel?: string;
  adapterName?: string;
}): TelemetryEvent | null {
  const config = loadConfig();
  if (!config.enabled) return null;

  return {
    installId: config.installId,
    amcVersion: opts.amcVersion,
    nodeVersion: versions.node ?? "unknown",
    os: `${platform()}/${arch()}`,
    arch: arch(),
    command: opts.command,
    scoreLevel: opts.scoreLevel,
    adapterName: opts.adapterName,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format telemetry status for CLI output.
 */
export function formatStatus(): string {
  const { config, collectedFields, neverCollected } = telemetryStatus();
  const lines: string[] = [];

  lines.push(`Telemetry: ${config.enabled ? "ON ✓" : "OFF"}`);
  lines.push(`Install ID: ${config.installId}`);
  if (config.enabledAt) lines.push(`Enabled at: ${config.enabledAt}`);
  if (config.disabledAt) lines.push(`Disabled at: ${config.disabledAt}`);
  lines.push("");
  lines.push("What we collect (when enabled):");
  for (const field of collectedFields) {
    lines.push(`  ✓ ${field}`);
  }
  lines.push("");
  lines.push("What we NEVER collect:");
  for (const field of neverCollected) {
    lines.push(`  ✗ ${field}`);
  }

  return lines.join("\n");
}
