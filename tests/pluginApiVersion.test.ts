/**
 * Tests for Plugin API Versioning & Backward Compatibility — MF-04
 */

import { describe, expect, test } from "vitest";
import {
  PLUGIN_API_VERSION,
  PLUGIN_API_MIN_VERSION,
  PLUGIN_API_STABILITY,
  parseSemVer,
  compareSemVer,
  semVerToString,
  checkPluginCompatibility,
  getActiveDeprecations,
  getAllDeprecations,
  getApiChangelog,
  getBreakingChanges,
  computeApiSurfaceFingerprint,
  verifyApiSurface,
  generateMigrationGuide,
  getApiVersionInfo,
  buildCompatibilityMatrix,
  renderCompatibilityMatrixMarkdown,
  pluginApiVersionSchema,
} from "../src/plugins/pluginApiVersion.js";

// ─── Constants ──────────────────────────────────────

describe("Plugin API Version — constants", () => {
  test("API version is valid semver", () => {
    const v = parseSemVer(PLUGIN_API_VERSION);
    expect(v).not.toBeNull();
    expect(v!.major).toBeGreaterThanOrEqual(0);
  });

  test("min version is valid semver", () => {
    const v = parseSemVer(PLUGIN_API_MIN_VERSION);
    expect(v).not.toBeNull();
  });

  test("min version <= current version", () => {
    const min = parseSemVer(PLUGIN_API_MIN_VERSION)!;
    const current = parseSemVer(PLUGIN_API_VERSION)!;
    expect(compareSemVer(min, current)).toBeLessThanOrEqual(0);
  });

  test("stability is one of expected values", () => {
    expect(["stable", "beta", "alpha"]).toContain(PLUGIN_API_STABILITY);
  });
});

// ─── SemVer utilities ───────────────────────────────

describe("Plugin API Version — semver", () => {
  test("parses valid semver", () => {
    expect(parseSemVer("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemVer("0.0.1")).toEqual({ major: 0, minor: 0, patch: 1 });
    expect(parseSemVer("10.20.30")).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  test("parses semver with prerelease", () => {
    const v = parseSemVer("1.0.0-beta.1");
    expect(v).toEqual({ major: 1, minor: 0, patch: 0, prerelease: "beta.1" });
  });

  test("returns null for invalid semver", () => {
    expect(parseSemVer("not-a-version")).toBeNull();
    expect(parseSemVer("1.2")).toBeNull();
    expect(parseSemVer("")).toBeNull();
  });

  test("compares versions correctly", () => {
    const v100 = parseSemVer("1.0.0")!;
    const v110 = parseSemVer("1.1.0")!;
    const v111 = parseSemVer("1.1.1")!;
    const v200 = parseSemVer("2.0.0")!;

    expect(compareSemVer(v100, v110)).toBeLessThan(0);
    expect(compareSemVer(v110, v111)).toBeLessThan(0);
    expect(compareSemVer(v100, v200)).toBeLessThan(0);
    expect(compareSemVer(v200, v100)).toBeGreaterThan(0);
    expect(compareSemVer(v100, v100)).toBe(0);
  });

  test("semVerToString roundtrips", () => {
    expect(semVerToString({ major: 1, minor: 2, patch: 3 })).toBe("1.2.3");
    expect(semVerToString({ major: 1, minor: 0, patch: 0, prerelease: "alpha" })).toBe("1.0.0-alpha");
  });
});

// ─── Compatibility checking ─────────────────────────

describe("Plugin API Version — compatibility", () => {
  test("compatible plugin passes", () => {
    const result = checkPluginCompatibility(PLUGIN_API_VERSION);
    expect(result.compatible).toBe(true);
    expect(result.severity).toBe("ok");
  });

  test("plugin with no version gets warning", () => {
    const result = checkPluginCompatibility(undefined);
    expect(result.compatible).toBe(true);
    expect(result.severity).toBe("warning");
  });

  test("plugin requiring newer API fails", () => {
    const result = checkPluginCompatibility("99.0.0");
    expect(result.compatible).toBe(false);
    expect(result.severity).toBe("error");
  });

  test("plugin requiring older API than minimum fails", () => {
    // Only fails if min > 0.0.0
    const min = parseSemVer(PLUGIN_API_MIN_VERSION)!;
    if (min.major > 0 || min.minor > 0 || min.patch > 0) {
      const result = checkPluginCompatibility("0.0.0");
      expect(result.compatible).toBe(false);
    }
  });

  test("plugin with max version warning", () => {
    const result = checkPluginCompatibility("1.0.0", "0.9.0");
    // Current is > max, so warning
    expect(result.severity).toBe("warning");
  });

  test("invalid version string returns error", () => {
    const result = checkPluginCompatibility("not-a-version");
    expect(result.compatible).toBe(false);
    expect(result.severity).toBe("error");
  });
});

// ─── Deprecations ───────────────────────────────────

describe("Plugin API Version — deprecations", () => {
  test("active deprecations is an array", () => {
    const deps = getActiveDeprecations();
    expect(Array.isArray(deps)).toBe(true);
  });

  test("all deprecations is an array", () => {
    const deps = getAllDeprecations();
    expect(Array.isArray(deps)).toBe(true);
  });

  test("deprecation entries have required fields", () => {
    for (const dep of getAllDeprecations()) {
      expect(dep.featureId).toBeTruthy();
      expect(dep.deprecatedInVersion).toBeTruthy();
      expect(dep.removedInVersion).toBeTruthy();
      expect(dep.replacement).toBeTruthy();
    }
  });
});

// ─── Changelog ──────────────────────────────────────

describe("Plugin API Version — changelog", () => {
  test("changelog has at least one entry", () => {
    const log = getApiChangelog();
    expect(log.length).toBeGreaterThanOrEqual(1);
  });

  test("changelog entries have required fields", () => {
    for (const entry of getApiChangelog()) {
      expect(entry.version).toBeTruthy();
      expect(entry.date).toBeTruthy();
      expect(["breaking", "feature", "fix", "deprecation"]).toContain(entry.changeType);
      expect(entry.description).toBeTruthy();
      expect(typeof entry.migrationRequired).toBe("boolean");
    }
  });

  test("breaking changes filter works", () => {
    const breaking = getBreakingChanges("0.0.0");
    expect(Array.isArray(breaking)).toBe(true);
    for (const entry of breaking) {
      expect(entry.changeType).toBe("breaking");
    }
  });
});

// ─── API surface fingerprinting ─────────────────────

describe("Plugin API Version — surface fingerprint", () => {
  test("fingerprint is a hex string", () => {
    const fp = computeApiSurfaceFingerprint();
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fingerprint is deterministic", () => {
    const fp1 = computeApiSurfaceFingerprint();
    const fp2 = computeApiSurfaceFingerprint();
    expect(fp1).toBe(fp2);
  });

  test("verify surface with correct fingerprint passes", () => {
    const fp = computeApiSurfaceFingerprint();
    const result = verifyApiSurface(fp);
    expect(result.valid).toBe(true);
    expect(result.message).toBe("API surface unchanged");
  });

  test("verify surface with wrong fingerprint fails", () => {
    const result = verifyApiSurface("0000000000000000000000000000000000000000000000000000000000000000");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("API surface changed");
  });
});

// ─── Migration guide ────────────────────────────────

describe("Plugin API Version — migration guide", () => {
  test("generates guide for version upgrade", () => {
    const guide = generateMigrationGuide("1.0.0", "1.0.0");
    expect(guide.fromVersion).toBe("1.0.0");
    expect(guide.toVersion).toBe("1.0.0");
    expect(guide.steps.length).toBeGreaterThan(0);
    expect(guide.estimatedEffort).toBeTruthy();
  });

  test("guide handles invalid versions", () => {
    const guide = generateMigrationGuide("invalid", "1.0.0");
    expect(guide.steps.length).toBeGreaterThan(0);
  });

  test("effort scales with breaking changes", () => {
    // No breaking changes between same version
    const guide = generateMigrationGuide("1.0.0", "1.0.0");
    expect(guide.estimatedEffort).toBe("trivial");
  });
});

// ─── API version info ───────────────────────────────

describe("Plugin API Version — info", () => {
  test("version info contains all fields", () => {
    const info = getApiVersionInfo();
    expect(info.version).toBe(PLUGIN_API_VERSION);
    expect(info.minSupported).toBe(PLUGIN_API_MIN_VERSION);
    expect(info.stability).toBe(PLUGIN_API_STABILITY);
    expect(info.fingerprint).toBeTruthy();
    expect(typeof info.deprecationCount).toBe("number");
    expect(typeof info.changelogLength).toBe("number");
  });
});

// ─── Compatibility matrix ───────────────────────────

describe("Plugin API Version — compatibility matrix", () => {
  test("builds matrix from plugin list", () => {
    const plugins = [
      { id: "plugin-a", version: "1.0.0", minApiVersion: "1.0.0" },
      { id: "plugin-b", version: "2.0.0", minApiVersion: "1.0.0" },
      { id: "plugin-c", version: "1.0.0" }, // no version constraint
    ];

    const matrix = buildCompatibilityMatrix(plugins);
    expect(matrix).toHaveLength(3);
    expect(matrix[0]!.compatible).toBe(true);
    expect(matrix[1]!.compatible).toBe(true);
    expect(matrix[2]!.compatible).toBe(true); // no constraint = compatible
  });

  test("renders markdown table", () => {
    const plugins = [
      { id: "test-plugin", version: "1.0.0", minApiVersion: "1.0.0" },
    ];

    const matrix = buildCompatibilityMatrix(plugins);
    const md = renderCompatibilityMatrixMarkdown(matrix);
    expect(md).toContain("Plugin Compatibility Matrix");
    expect(md).toContain("test-plugin");
    expect(md).toContain("✅");
  });

  test("matrix shows incompatible plugins", () => {
    const plugins = [
      { id: "future-plugin", version: "1.0.0", minApiVersion: "99.0.0" },
    ];

    const matrix = buildCompatibilityMatrix(plugins);
    expect(matrix[0]!.compatible).toBe(false);

    const md = renderCompatibilityMatrixMarkdown(matrix);
    expect(md).toContain("❌");
  });
});

// ─── Schema validation ──────────────────────────────

describe("Plugin API Version — schema", () => {
  test("validates correct version info", () => {
    const result = pluginApiVersionSchema.parse({
      minApiVersion: "1.0.0",
      maxApiVersion: "2.0.0",
      apiStability: "stable",
    });
    expect(result.minApiVersion).toBe("1.0.0");
  });

  test("validates partial version info", () => {
    const result = pluginApiVersionSchema.parse({});
    expect(result.minApiVersion).toBeUndefined();
  });

  test("rejects invalid stability", () => {
    expect(() =>
      pluginApiVersionSchema.parse({ apiStability: "experimental" }),
    ).toThrow();
  });
});
