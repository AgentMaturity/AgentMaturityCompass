import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lintPackage } from "../scripts/package-lint.mjs";

const roots: string[] = [];
function fixture(typesFirst = true, publishTypes = true) {
  const root = mkdtempSync(join(tmpdir(), "amc-package-lint-contract-"));
  roots.push(root);
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "dist/index.js"), "export const value = 1;\n");
  writeFileSync(join(root, "dist/index.d.ts"), "export declare const value: number;\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "amc-package-contract", version: "1.0.0", type: "module", license: "MIT",
    files: publishTypes ? ["dist"] : ["dist/*.js"],
    exports: { ".": typesFirst
      ? { types: "./dist/index.d.ts", import: "./dist/index.js" }
      : { import: "./dist/index.js", types: "./dist/index.d.ts" } },
    scripts: { prepack: "node -e \"require('fs').writeFileSync('lifecycle-ran','unsafe')\"" }
  }));
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("strict package lint against the published file set", () => {
  it("accepts correctly ordered exports without executing lifecycle scripts", async () => {
    const root = fixture();
    const result = await lintPackage(root);
    expect(result.messages.filter(message => message.type === "error")).toEqual([]);
    expect(existsSync(join(root, "lifecycle-ran"))).toBe(false);
  });
  it("rejects import conditions before the types condition", async () => {
    const result = await lintPackage(fixture(false));
    expect(result.messages.some(message => message.code === "EXPORTS_TYPES_SHOULD_BE_FIRST" && message.type === "error")).toBe(true);
  });
  it("rejects types that exist locally but are excluded from the package", async () => {
    const result = await lintPackage(fixture(true, false));
    expect(result.messages.some(message => message.type === "error" && message.code === "FILE_NOT_PUBLISHED")).toBe(true);
  });
});
