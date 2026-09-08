import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

  test("repeated bundling preserves output, package inventory and third-party notices", () => {
    const dir = workspace(false);
    const sourceDir = join(dir, "src", "kernel");
    const outputDir = join(dir, "dist", "kernel");
    const coreDir = join(dir, "node_modules", "@amc", "core");
    // A real package can live beneath dist. Only the root wrapper should be
    // omitted from attribution; a blanket dist-prefix skip loses this one.
    const transitiveDir = join(dir, "dist", "third-party", "fixture-transitive");
    const externalDir = join(dir, "node_modules", "fixture-external");
    for (const path of [sourceDir, outputDir, coreDir, transitiveDir, externalDir]) mkdirSync(path, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "amc-sbom-fixture", version: "1.0.0", type: "module",
      dependencies: { "fixture-external": "1.0.0" }
    }));
    const wrapper = 'export { describeClosure } from "@amc/core";\n';
    writeFileSync(join(sourceDir, "amcRuntime.ts"), wrapper + 'export const fixture: string = "typed source";\n');
    // Mirrors the compiler's thin output so this fixture reproduces the old
    // input-equals-output bug before the source-entry fix.
    writeFileSync(join(outputDir, "amcRuntime.js"), wrapper + 'export const fixture = "typed source";\n');
    writeFileSync(join(coreDir, "package.json"), JSON.stringify({ name: "@amc/core", version: "0.1.0", type: "module", main: "index.js", license: "MIT" }));
    writeFileSync(join(coreDir, "index.js"), [
      'import { value } from "fixture-transitive";',
      'import { external } from "fixture-external";',
      'export function describeClosure() { return `${value}:${external}`; }'
    ].join("\n"));
    writeFileSync(join(coreDir, "LICENSE"), "Fixture core license text.\n");
    writeFileSync(join(transitiveDir, "package.json"), JSON.stringify({ name: "fixture-transitive", version: "2.0.0", type: "module", main: "index.js", license: "Apache-2.0" }));
    writeFileSync(join(transitiveDir, "index.js"), "/*! Fixture transitive legal comment. */\nexport const value = 42;\n");
    writeFileSync(join(transitiveDir, "LICENSE"), "Fixture transitive license text.\n");
    symlinkSync(transitiveDir, join(dir, "node_modules", "fixture-transitive"), "dir");
    writeFileSync(join(externalDir, "package.json"), JSON.stringify({ name: "fixture-external", version: "1.0.0", type: "module", main: "index.js", license: "MIT" }));
    writeFileSync(join(externalDir, "index.js"), 'export const external = "installed";\n');

    const output = join(outputDir, "amcRuntime.js");
    const bundle = () => {
      const result = spawnSync(process.execPath, [resolve("scripts/bundle-kernel.mjs")], { cwd: dir, encoding: "utf8", timeout: 10_000 });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const executed = spawnSync(process.execPath, ["--input-type=module", "-e", `import { describeClosure, fixture } from ${JSON.stringify(pathToFileURL(output).href)}; console.log(describeClosure(), fixture);`], { cwd: dir, encoding: "utf8", timeout: 10_000 });
      return {
        code: readFileSync(output, "utf8"),
        manifest: readFileSync(join(outputDir, "amcRuntime.bundle.json"), "utf8"),
        notices: readFileSync(`${output}.NOTICES.md`, "utf8"),
        legal: readFileSync(`${output}.LEGAL.txt`, "utf8"),
        components: generateCycloneDxSbom(dir).components,
        execution: { status: executed.status, stdout: executed.stdout.trim(), stderr: executed.stderr }
      };
    };

    const first = bundle();
    const second = bundle();
    expect(second.manifest).toBe(first.manifest);
    expect(second).toEqual(first);
    expect(second.execution.status, second.execution.stderr).toBe(0);
    expect(second.execution.stdout).toBe("42:installed typed source");
    const manifest = JSON.parse(second.manifest);
    expect(manifest.entry).toBe("dist/kernel/amcRuntime.js");
    expect(manifest.packages.map((p: { name: string }) => p.name)).toEqual(["@amc/core", "fixture-transitive"]);
    expect(second.notices).toContain("Fixture core license text.");
    expect(second.notices).toContain("Fixture transitive license text.");
    expect(second.code).toContain('from "fixture-external"');
    expect(second.legal).toContain("Fixture transitive legal comment.");
  });
});
