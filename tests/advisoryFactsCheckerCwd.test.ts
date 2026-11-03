import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const script = resolve(__dirname, "../qualification/2026-10-29-P0-36/check-advisory-facts.mjs");
const run = (cwd: string) => {
  const r = spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

describe("P0-36 check-advisory-facts.mjs", () => {
  // Pathspecs resolve from the repository root, so a shallow clone fails the same checks from either directory.
  test("reports the same result from its own directory as from the repository root", () => {
    const fromRoot = run(resolve(__dirname, ".."));
    expect(fromRoot.stdout).toMatch(/^advisory facts: \d+\/\d+ hold at /);
    expect(run(dirname(script))).toEqual(fromRoot);
    expect(run(join(__dirname, "a4"))).toEqual(fromRoot);
  }, 60_000);
});
