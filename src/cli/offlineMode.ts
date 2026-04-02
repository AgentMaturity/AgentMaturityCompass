/**
 * Offline & Lightweight Evaluation Mode — MF-08
 *
 * Enables AMC to run with zero network calls, reduced memory,
 * and in resource-constrained environments.
 */

import { z } from "zod";

export const offlineConfigSchema = z.object({
  offline: z.boolean().default(false),
  lite: z.boolean().default(false),
  maxMemoryMb: z.number().min(32).default(512),
  skipRemoteEvidence: z.boolean().default(false),
  skipPluginUpdates: z.boolean().default(true),
  bundledQuestionBank: z.boolean().default(true),
  reportFormat: z.enum(["json", "markdown", "minimal"]).default("markdown"),
});

export type OfflineConfig = z.infer<typeof offlineConfigSchema>;

export function defaultOfflineConfig(): OfflineConfig {
  return offlineConfigSchema.parse({});
}

export function offlineModeConfig(): OfflineConfig {
  return offlineConfigSchema.parse({
    offline: true,
    lite: false,
    skipRemoteEvidence: true,
    skipPluginUpdates: true,
    bundledQuestionBank: true,
  });
}

export function liteModeConfig(): OfflineConfig {
  return offlineConfigSchema.parse({
    offline: true,
    lite: true,
    maxMemoryMb: 100,
    skipRemoteEvidence: true,
    skipPluginUpdates: true,
    bundledQuestionBank: true,
    reportFormat: "minimal",
  });
}

export interface OfflineCapabilityCheck {
  canRunOffline: boolean;
  missingDependencies: string[];
  estimatedMemoryMb: number;
  questionBankAvailable: boolean;
  pluginsAvailable: boolean;
}

export function checkOfflineCapability(config: OfflineConfig): OfflineCapabilityCheck {
  const missing: string[] = [];
  const memEstimate = config.lite ? 80 : 200;

  return {
    canRunOffline: missing.length === 0,
    missingDependencies: missing,
    estimatedMemoryMb: memEstimate,
    questionBankAvailable: config.bundledQuestionBank,
    pluginsAvailable: !config.skipPluginUpdates,
  };
}

export function validateOfflineEnvironment(config: OfflineConfig): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (config.offline && !config.bundledQuestionBank) {
    errors.push("Offline mode requires bundled question bank");
  }

  if (config.lite && config.maxMemoryMb > 150) {
    warnings.push("Lite mode recommended with maxMemoryMb <= 150");
  }

  if (config.offline) {
    warnings.push("Remote evidence collection disabled in offline mode");
    warnings.push("Plugin updates disabled in offline mode");
  }

  return { valid: errors.length === 0, warnings, errors };
}
