import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `security-scan-lite.mjs --json` used to write a file literally named
 * `--json` into the repository root, because the script took argv[2] as its
 * output path with no validation. That file sat in the worktree from February
 * until August, next to four `.tmp-*.json` files from the same mistake.
 */
const scripts = [
  ["scripts/security-scan-lite.mjs", "security-scan-lite"],
  ["scripts/compat-matrix-report.mjs", "compat-matrix-report"]
] as const;

describe("scripts reject a flag given as an output path", () => {
  for (const [script, name] of scripts) {
    it(`${name} exits with usage instead of creating the file`, () => {
      const result = spawnSync(process.execPath, [script, "--json"], {
        cwd: process.cwd(),
        encoding: "utf8"
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("looks like a flag, not an output path");
      expect(existsSync(join(process.cwd(), "--json"))).toBe(false);
    });
  }

  it("documents the cause next to the rule that ignored the symptom", () => {
    // The ignore entries predate this fix: the file was made invisible rather
    // than prevented. The comment now points at the guard so the next reader
    // does not assume the rule is all there is.
    const ignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    expect(ignore).toContain("--json");
    expect(ignore).toContain("scripts/lib/outputPathArg.mjs");
  });
});
