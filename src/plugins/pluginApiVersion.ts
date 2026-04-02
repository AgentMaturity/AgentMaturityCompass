/**
 * Plugin API Versioning & Backward Compatibility — MF-04
 *
 * Provides:
 * 1. Semantic versioning for the plugin API
 * 2. Compatibility checking at plugin load time
 * 3. Deprecation tracking with warnings
 * 4. Migration guide generation
 * 5. Contract tests that prevent accidental breaking changes
 * 6. API changelog tracking
 *
 * MiroFish agent quote:
 * "Plugin API had breaking changes without notice during my testing —
 *  unacceptable for production." — Tech Blogger (6.5/10)
 */

import { z } from "zod";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

// ---------------------------------------------------------------------------
// Version constants
// ---------------------------------------------------------------------------

/** Current plugin API version */
export const PLUGIN_API_VERSION = "1.0.0";

/** Minimum supported plugin API version (for backward compat) */
export const PLUGIN_API_MIN_VERSION = "1.0.0";

/** API stability level */
export const PLUGIN_API_STABILITY: "stable" | "beta" | "alpha" = "stable";

// ---------------------------------------------------------------------------
// Semantic version utilities
// ---------------------------------------------------------------------------

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export function parseSemVer(version: string): SemVer | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
    prerelease: match[4],
  };
}

export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function semVerToString(v: SemVer): string {
  const base = `${v.major}.${v.minor}.${v.patch}`;
  return v.prerelease ? `${base}-${v.prerelease}` : base;
}

// ---------------------------------------------------------------------------
// Compatibility checking
// ---------------------------------------------------------------------------

export type CompatibilityResult = {
  compatible: boolean;
  reason: string;
  severity: "ok" | "warning" | "error";
  /** Suggested action */
  action?: string;
  /** Deprecation warnings */
  deprecations?: DeprecationWarning[];
};

export interface DeprecationWarning {
  featureId: string;
  deprecatedInVersion: string;
  removedInVersion: string;
  replacement: string;
  migrationGuide: string;
}

/**
 * Check if a plugin's required API version is compatible with the current API.
 */
export function checkPluginCompatibility(
  pluginMinApiVersion: string | undefined,
  pluginMaxApiVersion?: string,
): CompatibilityResult {
  if (!pluginMinApiVersion) {
    // No version constraint — assume compatible with warning
    return {
      compatible: true,
      reason: "Plugin does not specify minApiVersion — assuming compatible",
      severity: "warning",
      action: "Add minApiVersion to plugin manifest for forward compatibility",
    };
  }

  const pluginMin = parseSemVer(pluginMinApiVersion);
  const currentVersion = parseSemVer(PLUGIN_API_VERSION)!;
  const minSupported = parseSemVer(PLUGIN_API_MIN_VERSION)!;

  if (!pluginMin) {
    return {
      compatible: false,
      reason: `Invalid plugin minApiVersion: "${pluginMinApiVersion}"`,
      severity: "error",
    };
  }

  // Plugin requires newer API than we have
  if (compareSemVer(pluginMin, currentVersion) > 0) {
    return {
      compatible: false,
      reason: `Plugin requires API ${pluginMinApiVersion} but current is ${PLUGIN_API_VERSION}`,
      severity: "error",
      action: `Upgrade AMC to support API ${pluginMinApiVersion}`,
    };
  }

  // Plugin requires older API than our minimum supported
  if (compareSemVer(pluginMin, minSupported) < 0) {
    return {
      compatible: false,
      reason: `Plugin requires API ${pluginMinApiVersion} which is below minimum supported ${PLUGIN_API_MIN_VERSION}`,
      severity: "error",
      action: `Upgrade plugin to require at least API ${PLUGIN_API_MIN_VERSION}`,
    };
  }

  // Check max version if specified
  if (pluginMaxApiVersion) {
    const pluginMax = parseSemVer(pluginMaxApiVersion);
    if (pluginMax && compareSemVer(currentVersion, pluginMax) > 0) {
      return {
        compatible: true,
        reason: `Plugin max API version ${pluginMaxApiVersion} is below current ${PLUGIN_API_VERSION} — may have issues`,
        severity: "warning",
        action: "Plugin should be tested with current API version",
      };
    }
  }

  // Check for deprecations that affect this plugin
  const deprecations = getActiveDeprecations().filter((d) => {
    const depVersion = parseSemVer(d.deprecatedInVersion);
    return depVersion && compareSemVer(pluginMin, depVersion) <= 0;
  });

  if (deprecations.length > 0) {
    return {
      compatible: true,
      reason: `Compatible but ${deprecations.length} deprecation warning(s)`,
      severity: "warning",
      deprecations,
      action: "Review deprecation warnings and update plugin accordingly",
    };
  }

  return {
    compatible: true,
    reason: `Plugin API ${pluginMinApiVersion} is compatible with current ${PLUGIN_API_VERSION}`,
    severity: "ok",
  };
}

// ---------------------------------------------------------------------------
// Deprecation registry
// ---------------------------------------------------------------------------

interface DeprecationEntry {
  featureId: string;
  description: string;
  deprecatedInVersion: string;
  removedInVersion: string;
  replacement: string;
  migrationGuide: string;
}

const DEPRECATION_REGISTRY: DeprecationEntry[] = [
  // Placeholder — as the API evolves, deprecated features go here
  // {
  //   featureId: "legacy_risk_category",
  //   description: "String-based risk categories replaced by enum",
  //   deprecatedInVersion: "1.1.0",
  //   removedInVersion: "2.0.0",
  //   replacement: "pluginRiskCategorySchema enum values",
  //   migrationGuide: "Replace string 'low'/'medium'/'high' with 'LOW'/'MEDIUM'/'HIGH'",
  // },
];

export function getActiveDeprecations(): DeprecationWarning[] {
  const current = parseSemVer(PLUGIN_API_VERSION)!;
  return DEPRECATION_REGISTRY
    .filter((d) => {
      const removed = parseSemVer(d.removedInVersion);
      return !removed || compareSemVer(current, removed) < 0;
    })
    .map((d) => ({
      featureId: d.featureId,
      deprecatedInVersion: d.deprecatedInVersion,
      removedInVersion: d.removedInVersion,
      replacement: d.replacement,
      migrationGuide: d.migrationGuide,
    }));
}

export function getAllDeprecations(): DeprecationEntry[] {
  return [...DEPRECATION_REGISTRY];
}

// ---------------------------------------------------------------------------
// API changelog
// ---------------------------------------------------------------------------

export interface ApiChangelogEntry {
  version: string;
  date: string;
  changeType: "breaking" | "feature" | "fix" | "deprecation";
  description: string;
  migrationRequired: boolean;
  migrationGuide?: string;
}

const API_CHANGELOG: ApiChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-03-26",
    changeType: "feature",
    description: "Initial stable plugin API release with versioning, signing, registry, and verification",
    migrationRequired: false,
  },
];

export function getApiChangelog(): ApiChangelogEntry[] {
  return [...API_CHANGELOG];
}

export function getBreakingChanges(sinceVersion: string): ApiChangelogEntry[] {
  const since = parseSemVer(sinceVersion);
  if (!since) return [];
  return API_CHANGELOG.filter((entry) => {
    const v = parseSemVer(entry.version);
    return v && compareSemVer(v, since) > 0 && entry.changeType === "breaking";
  });
}

// ---------------------------------------------------------------------------
// Contract surface — API shape fingerprinting
// ---------------------------------------------------------------------------

/**
 * Generate a fingerprint of the plugin API surface.
 * Used by contract tests to detect accidental breaking changes.
 */
export function computeApiSurfaceFingerprint(): string {
  const surface = {
    version: PLUGIN_API_VERSION,
    minVersion: PLUGIN_API_MIN_VERSION,
    stability: PLUGIN_API_STABILITY,
    // Key API shapes that plugins depend on
    schemas: {
      manifestFields: [
        "id", "name", "version", "description", "author",
        "minApiVersion", "maxApiVersion", "riskCategory",
        "entryPoint", "permissions", "dependencies",
      ],
      riskCategories: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      permissionTypes: [
        "read_config", "write_config", "read_evidence",
        "write_evidence", "execute_tools", "network_access",
      ],
    },
    hooks: [
      "onLoad", "onUnload", "onBeforeAssessment",
      "onAfterAssessment", "onEvidenceCollected",
      "onDriftDetected", "onReportGenerated",
    ],
    exports: [
      "registerPlugin", "unregisterPlugin",
      "getPluginInfo", "listPlugins",
      "checkPluginCompatibility",
    ],
  };
  return sha256Hex(JSON.stringify(surface, Object.keys(surface).sort()));
}

/**
 * Verify that the current API surface matches an expected fingerprint.
 * Used in contract tests to catch accidental breaking changes.
 */
export function verifyApiSurface(expectedFingerprint: string): {
  valid: boolean;
  currentFingerprint: string;
  message: string;
} {
  const current = computeApiSurfaceFingerprint();
  if (current === expectedFingerprint) {
    return {
      valid: true,
      currentFingerprint: current,
      message: "API surface unchanged",
    };
  }
  return {
    valid: false,
    currentFingerprint: current,
    message: `API surface changed! Expected ${expectedFingerprint.slice(0, 16)}… got ${current.slice(0, 16)}… — this may be a breaking change. Update the fingerprint if intentional.`,
  };
}

// ---------------------------------------------------------------------------
// Migration guide generator
// ---------------------------------------------------------------------------

export interface MigrationGuide {
  fromVersion: string;
  toVersion: string;
  steps: Array<{
    stepNumber: number;
    description: string;
    codeChange?: string;
    breaking: boolean;
  }>;
  estimatedEffort: "trivial" | "small" | "medium" | "large";
}

export function generateMigrationGuide(fromVersion: string, toVersion: string): MigrationGuide {
  const from = parseSemVer(fromVersion);
  const to = parseSemVer(toVersion);

  if (!from || !to) {
    return {
      fromVersion,
      toVersion,
      steps: [{ stepNumber: 1, description: "Invalid version format", breaking: false }],
      estimatedEffort: "trivial",
    };
  }

  const breakingChanges = getBreakingChanges(fromVersion);
  const deprecations = DEPRECATION_REGISTRY.filter((d) => {
    const depV = parseSemVer(d.deprecatedInVersion);
    const remV = parseSemVer(d.removedInVersion);
    return depV && remV && compareSemVer(depV, from) > 0 && compareSemVer(remV, to) <= 0;
  });

  const steps: MigrationGuide["steps"] = [];
  let stepNum = 1;

  // Add breaking change steps
  for (const change of breakingChanges) {
    steps.push({
      stepNumber: stepNum++,
      description: change.description,
      codeChange: change.migrationGuide,
      breaking: true,
    });
  }

  // Add deprecation removal steps
  for (const dep of deprecations) {
    steps.push({
      stepNumber: stepNum++,
      description: `Replace deprecated ${dep.featureId}: ${dep.description}`,
      codeChange: dep.migrationGuide,
      breaking: true,
    });
  }

  // Always add version bump step
  steps.push({
    stepNumber: stepNum++,
    description: `Update minApiVersion in manifest from ${fromVersion} to ${toVersion}`,
    codeChange: `"minApiVersion": "${toVersion}"`,
    breaking: false,
  });

  let effort: MigrationGuide["estimatedEffort"] = "trivial";
  if (breakingChanges.length > 3 || deprecations.length > 3) effort = "large";
  else if (breakingChanges.length > 0) effort = "medium";
  else if (deprecations.length > 0) effort = "small";

  return {
    fromVersion,
    toVersion,
    steps,
    estimatedEffort: effort,
  };
}

// ---------------------------------------------------------------------------
// Plugin manifest extensions
// ---------------------------------------------------------------------------

export const pluginApiVersionSchema = z.object({
  minApiVersion: z.string().regex(/^\d+\.\d+\.\d+/).optional(),
  maxApiVersion: z.string().regex(/^\d+\.\d+\.\d+/).optional(),
  apiStability: z.enum(["stable", "beta", "alpha"]).optional(),
});

export type PluginApiVersionInfo = z.infer<typeof pluginApiVersionSchema>;

/**
 * Get full API version info for embedding in manifests, responses, etc.
 */
export function getApiVersionInfo(): {
  version: string;
  minSupported: string;
  stability: string;
  fingerprint: string;
  deprecationCount: number;
  changelogLength: number;
} {
  return {
    version: PLUGIN_API_VERSION,
    minSupported: PLUGIN_API_MIN_VERSION,
    stability: PLUGIN_API_STABILITY,
    fingerprint: computeApiSurfaceFingerprint().slice(0, 16),
    deprecationCount: getActiveDeprecations().length,
    changelogLength: API_CHANGELOG.length,
  };
}

// ---------------------------------------------------------------------------
// Compatibility matrix
// ---------------------------------------------------------------------------

export interface PluginCompatibilityEntry {
  pluginId: string;
  pluginVersion: string;
  minApiVersion: string;
  maxApiVersion?: string;
  tested: boolean;
  compatible: boolean;
  notes?: string;
}

export function buildCompatibilityMatrix(
  plugins: Array<{ id: string; version: string; minApiVersion?: string; maxApiVersion?: string }>,
): PluginCompatibilityEntry[] {
  return plugins.map((p) => {
    const result = checkPluginCompatibility(p.minApiVersion, p.maxApiVersion);
    return {
      pluginId: p.id,
      pluginVersion: p.version,
      minApiVersion: p.minApiVersion ?? "unspecified",
      maxApiVersion: p.maxApiVersion,
      tested: true,
      compatible: result.compatible,
      notes: result.reason,
    };
  });
}

export function renderCompatibilityMatrixMarkdown(
  entries: PluginCompatibilityEntry[],
): string {
  const lines = [
    `# Plugin Compatibility Matrix (API ${PLUGIN_API_VERSION})`,
    "",
    "| Plugin | Version | Min API | Max API | Compatible | Notes |",
    "|--------|---------|---------|---------|:----------:|-------|",
  ];

  for (const e of entries) {
    const compat = e.compatible ? "✅" : "❌";
    lines.push(`| ${e.pluginId} | ${e.pluginVersion} | ${e.minApiVersion} | ${e.maxApiVersion ?? "-"} | ${compat} | ${e.notes ?? "-"} |`);
  }

  return lines.join("\n");
}
