import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { generateCycloneDxSbom } from "../src/release/releaseSbom.js";

/**
 * AMC-1510 — the SBOM covers the artifact that ships, not just the lockfile.
 * The kernel's private closure is bundled into dist/kernel/amcRuntime.js and
 * appears in no consumer lockfile; scripts/bundle-kernel.mjs writes a manifest
 * of what it inlined, and the SBOM must list every entry of it.
 */
const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function workspace(withManifest: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-sbom-bundle-"));
  roots.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "amc-sbom-fixture", version: "1.0.0" }));
  writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
  if (withManifest) {
    mkdirSync(join(dir, "dist", "kernel"), { recursive: true });
    writeFileSync(join(dir, "dist", "kernel", "amcRuntime.bundle.json"), JSON.stringify({
      schemaVersion: "2026-09-08",
      entry: "dist/kernel/amcRuntime.js",
      packages: [
        { name: "@amc/core", version: "0.1.0", license: "MIT", from: "packages/amc-core" },
        { name: "js-yaml", version: "4.1.0", license: "MIT", from: "node_modules/js-yaml" }
      ]
    }));
  }
  return dir;
}

type Component = { name: string; version: string; licenses: Array<{ license: { id: string } }>; properties?: Array<{ name: string; value: string }> };

describe("kernel bundle in the SBOM", () => {
  test("every package inlined into the runtime bundle is a component, marked as bundled", () => {
    const sbom = generateCycloneDxSbom(workspace(true));
    const components = sbom.components as Component[];
    const core = components.find((c) => c.name === "@amc/core")!;
    expect(core.version).toBe("0.1.0");
    expect(core.licenses[0]!.license.id).toBe("MIT");
    expect(core.properties).toEqual([{ name: "amc:bundled-into", value: "dist/kernel/amcRuntime.js" }]);
    expect(components.some((c) => c.name === "js-yaml" && c.version === "4.1.0")).toBe(true);
  });

  test("no manifest, no invented components", () => {
    const sbom = generateCycloneDxSbom(workspace(false));
    expect((sbom.components as Component[]).some((c) => c.name.startsWith("@amc/"))).toBe(false);
  });
});
