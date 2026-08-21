import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * G8-18: the fix generator emitted code importing "./enforce/governor.js" and
 * "./shield/injectionDetector.js" — modules that do not exist. A user following
 * an AMC-generated remediation would write code that fails to compile, which is
 * worse than no suggestion at all.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(repoRoot, "src/product/fixGenerator.ts"), "utf8");

describe("generated fixes reference modules that exist", () => {
  it("every declared module resolves to a real source file", () => {
    const modules = [...source.matchAll(/module:\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(modules.length).toBeGreaterThan(10);

    const missing = modules.filter(
      (m) => !existsSync(join(repoRoot, "src", `${m}.ts`))
    );
    expect(missing).toEqual([]);
  });

  it("every import path inside a template resolves", () => {
    // Templates embed literal import statements handed to the user.
    const imports = [...source.matchAll(/from "\.\/([^"]+)\.js"/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(5);

    const missing = imports.filter(
      (i) => !existsSync(join(repoRoot, "src", `${i}.ts`))
    );
    expect(missing).toEqual([]);
  });

  it("the two known phantoms are gone", () => {
    expect(source).not.toContain("enforce/governor");
    expect(source).not.toContain("shield/injectionDetector");
  });
});
