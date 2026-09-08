import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * AMC-1510 — the private workspace packages reach the kernel through ONE
 * module, src/kernel/amcRuntime.ts, and the build bundles that module's
 * closure into dist. A second import site would either fail in the published
 * tarball (the packages are not there) or, if bundled separately, create a
 * second Cordis instance and split the composed tree.
 */
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? tsFiles(full) : full.endsWith(".ts") ? [full] : [];
  });
}

describe("kernel runtime barrel", () => {
  test("amcRuntime.ts is the only kernel module that imports @amc packages at runtime", () => {
    const offenders = tsFiles(join(process.cwd(), "src", "kernel"))
      .filter((file) => !file.endsWith("amcRuntime.ts"))
      .filter((file) => /^import (?!type )[^;]*from "@amc\//m.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(process.cwd().length + 1));
    expect(offenders).toEqual([]);
  });

  test("the build bundles the barrel's closure into dist", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string>; devDependencies: Record<string, string>; files: string[] };
    expect(pkg.scripts.build).toContain("node scripts/bundle-kernel.mjs");
    expect(pkg.devDependencies.esbuild).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.files).toContain("THIRD_PARTY_NOTICES");
    expect(pkg.scripts["check:packed-install"]).toBe("node scripts/packed-install-check.mjs");
  });
});
