import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
// The script is the source of truth for the documented commands; the docs
// must quote them. The executable half (`npm run check:clean-source`) proves
// they work on a fresh clone — this test only keeps the prose from drifting.
import { DOCUMENTED_SOURCE_COMMANDS } from "../scripts/clean-source-check.mjs";

const SOURCE_DOCS = ["README.md", "docs/INSTALL.md", "CONTRIBUTING.md"];

describe("AMC-1509 — documented source install matches the executable check", () => {
  test.each(SOURCE_DOCS)("%s quotes every documented command and no npm ci", (file) => {
    const text = readFileSync(file, "utf8");
    for (const command of DOCUMENTED_SOURCE_COMMANDS) {
      expect(text, `${file} must contain "${command}"`).toContain(command);
    }
    // npm cannot resolve the workspace:* protocol the vendored packages use, so
    // `npm ci` may be MENTIONED (to say why it fails) but never given as a command.
    expect(text).not.toMatch(/(^|&&\s*)npm ci\b/m);
  });

  test("the pinned package manager is what the docs tell people to use", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { packageManager: string; scripts: Record<string, string> };
    expect(pkg.packageManager).toMatch(/^pnpm@/);
    expect(pkg.scripts["check:clean-source"]).toBe("node scripts/clean-source-check.mjs");
  });
});
