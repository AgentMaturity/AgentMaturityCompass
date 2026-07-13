import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { pluginManifestSchema } from "../../src/plugins/pluginManifestSchema.js";
import { assertSafePluginArchiveMember } from "../../src/plugins/pluginPackage.js";
import {
  installedPluginsLockSchema,
  pluginRegistryIndexSchema,
} from "../../src/plugins/pluginRegistrySchema.js";
import {
  pluginInstallFolder,
  pluginsInstalledDir,
} from "../../src/plugins/pluginStore.js";

const roots: string[] = [];

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-plugin-identifiers-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function manifest(pluginId: string, version: string) {
  return {
    v: 1,
    plugin: {
      id: pluginId,
      name: "Fixture",
      version,
      description: "fixture",
      publisher: {
        org: "Fixture",
        contact: "security@example.com",
        website: "https://example.com",
        pubkeyFingerprint: "a".repeat(64),
      },
      compatibility: {
        amcMinVersion: "1.1.1",
        nodeMinVersion: "20.0.0",
        schemaVersions: {
          policyPacks: 1,
          assurancePacks: 1,
          complianceMaps: 1,
          adapters: 1,
          outcomes: 1,
          casebooks: 1,
          transform: 1,
        },
      },
      risk: { category: "LOW", notes: "fixture", touches: ["learn"] },
    },
    artifacts: [],
    generatedTs: 1,
    signing: { algorithm: "ed25519", pubkeyFingerprint: "a".repeat(64) },
  };
}

describe("plugin identifier containment", () => {
  test.each([
    "../outside",
    "amc-plugin/../../outside",
    "/absolute/path",
    "C:\\absolute\\path",
    "amc-plugin\\..\\outside",
  ])("rejects unsafe archive member %s before extraction", (member) => {
    expect(() => assertSafePluginArchiveMember(member)).toThrow(/archive|path|unsafe|escape/i);
  });

  test("accepts normalized plugin archive members", () => {
    expect(assertSafePluginArchiveMember("amc-plugin/content/learn/readme.md")).toBe(
      "amc-plugin/content/learn/readme.md",
    );
  });

  test.each([
    ["../escape", "1.0.0"],
    ["../../outside", "1.0.0"],
    ["/absolute", "1.0.0"],
    ["valid.plugin", "../outside"],
    ["valid.plugin", "1.0.0/../../outside"],
    ["valid\\plugin", "1.0.0"],
  ])("rejects unsafe manifest id/version %s@%s", (pluginId, version) => {
    expect(pluginManifestSchema.safeParse(manifest(pluginId, version)).success).toBe(false);
  });

  test("rejects unsafe identifiers in signed registry and installed-lock data", () => {
    const registry = {
      v: 1,
      registry: {
        id: "registry",
        name: "Registry",
        issuerFingerprint: "b".repeat(64),
        updatedTs: 1,
      },
      plugins: [
        {
          id: "../escape",
          versions: [
            {
              version: "1.0.0",
              sha256: "c".repeat(64),
              url: "packages/plugin.amcplug",
              publisherFingerprint: "d".repeat(64),
              riskCategory: "LOW",
            },
          ],
        },
      ],
    };
    expect(pluginRegistryIndexSchema.safeParse(registry).success).toBe(false);

    const lock = {
      v: 1,
      updatedTs: 1,
      installed: [
        {
          id: "safe.plugin",
          version: "../../escape",
          sha256: "e".repeat(64),
          registryFingerprint: "f".repeat(64),
          publisherFingerprint: "a".repeat(64),
          installedTs: 1,
        },
      ],
      policySnapshot: {
        actionPolicySha256: "1".repeat(64),
        toolsSha256: "2".repeat(64),
        budgetsSha256: "3".repeat(64),
        approvalPolicySha256: "4".repeat(64),
        opsPolicySha256: "5".repeat(64),
        registriesSha256: "6".repeat(64),
      },
    };
    expect(installedPluginsLockSchema.safeParse(lock).success).toBe(false);
  });

  test("rejects manifest artifact paths that can escape the extracted plugin root", () => {
    const unsafe = manifest("safe.plugin", "1.0.0");
    unsafe.artifacts = [
      {
        path: "../../host-secret",
        sha256: "a".repeat(64),
        bytes: 1,
        kind: "learn_md",
      },
    ];
    expect(pluginManifestSchema.safeParse(unsafe).success).toBe(false);
  });

  test("path helpers reject traversal and keep valid installs under the installed root", () => {
    const root = workspace();
    expect(() => pluginInstallFolder(root, "../escape", "1.0.0")).toThrow(/plugin|identifier|version|unsafe/i);
    expect(() => pluginInstallFolder(root, "safe.plugin", "../../escape")).toThrow(/plugin|identifier|version|unsafe/i);

    const installedRoot = resolve(pluginsInstalledDir(root));
    const valid = resolve(pluginInstallFolder(root, "amc.plugin.example", "1.2.3-beta.1"));
    expect(valid.startsWith(`${installedRoot}${sep}`)).toBe(true);
  });
});
