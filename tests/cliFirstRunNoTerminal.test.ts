import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

// The built CLI with no terminal (stdin is not a TTY under spawnSync), in one fresh folder walked in order.
const dir = mkdtempSync(join(tmpdir(), "amc-no-terminal-"));
const home = mkdtempSync(join(tmpdir(), "amc-no-terminal-home-")); // outside the folder, which AMC governs
afterAll(() => { for (const path of [dir, home]) rmSync(path, { recursive: true, force: true }); });
const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", HOME: home };
delete env.AMC_VAULT_PASSPHRASE;
delete env.AMC_VAULT_PASSPHRASE_FILE;
delete env.AMC_NO_SIGN;
const amc = (...args: string[]) => spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args],
  { cwd: dir, env, encoding: "utf8", timeout: 180_000 });

describe("amc without a terminal", () => {
  // L-03: bare amc wrote about 70 files into a new folder with nobody asked.
  test("bare amc sets up a new folder only with --yes", () => {
    const refused = amc();
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("To go ahead without a terminal, run: amc --yes");
    expect(existsSync(join(dir, ".amc"))).toBe(false);
    const done = amc("--yes", "--no-menu");
    expect(done.status, done.stderr).toBe(0);
    expect(existsSync(join(dir, ".amc"))).toBe(true);
    // CLI-20: gaps read as question titles, and the report command is named.
    expect(done.stdout).toContain("Agent Charter & Scope: L0 (AMC-1.1)");
    expect(done.stdout).toContain("amc report latest");
  }, 240_000);

  // CLI-17: an unknown agent was scored with exit 0 and got a folder made for it.
  test("an agent nobody added is refused, and no folder is made for it", () => {
    for (const args of [["--agent", "ghost"], ["score", "formal-spec", "ghost"]]) {
      const result = amc(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("There is no agent named 'ghost' in this folder.");
    }
    expect(existsSync(join(dir, ".amc", "agents", "ghost"))).toBe(false);
  }, 120_000);

  // CLI-18: guide --go wrote a 76 KB AGENTS.md into the project with nobody asked.
  test("guide --go makes no new AGENTS.md unless it is named", () => {
    const result = amc("guide", "--go");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("amc guide --go --apply AGENTS.md");
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  }, 120_000);

  // CLI-21: after a score, the doctor still offered "your first full maturity score".
  test("doctor's next step after a score is scoring again", () => {
    const result = amc("doctor");
    expect(result.stdout).toContain("Score again and see what changed");
    expect(result.stdout).not.toContain("first full maturity score");
  }, 120_000);
});
