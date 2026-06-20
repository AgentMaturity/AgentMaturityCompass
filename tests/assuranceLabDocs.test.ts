import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("Assurance Lab pack authoring docs", () => {
  test("documents index.mjs as the scaffolded community pack entry point", () => {
    const guide = readFileSync(join(process.cwd(), "docs", "ASSURANCE_LAB.md"), "utf8");

    expect(guide).toContain('package.json` with `"main": "index.mjs"`');
    expect(guide).toContain("creates an ESM entry point at `index.mjs`");
    expect(guide).toContain("New packs should use `index.mjs`");
    expect(guide).toContain("Legacy `index.js` packs remain supported");
  });
});
