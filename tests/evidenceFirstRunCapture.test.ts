import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-evidence-first-run-"));
  roots.push(dir);
  return dir;
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8"
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("first-run evidence capture", () => {
  test("advertises a one-command first-run capture path", () => {
    const result = runCli(process.cwd(), ["evidence", "collect", "--help"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("--first-run");
    expect(result.stdout).toContain("--runtime <runtime>");
    expect(result.stdout).toContain("--agent <agentId>");
    expect(result.stdout).toContain("--dry-run");
    expect(result.stdout).toContain("amc evidence collect --first-run --runtime any -- <agent command>");
  });

  test("prints a deterministic dry-run without asking users to choose a path", () => {
    const dir = workspace();

    const result = runCli(dir, [
      "evidence",
      "collect",
      "--first-run",
      "--dry-run",
      "--agent",
      "demo-agent",
      "--runtime",
      "any",
      "--",
      "node",
      "agent.js"
    ]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("First-run evidence capture");
    expect(result.stdout).toContain("No prompt choices needed");
    expect(result.stdout).toContain("amc evidence collect --first-run --agent demo-agent --runtime any -- node agent.js");
    expect(result.stdout).toContain("Next: amc quickscore --auto");
    expect(result.stdout).not.toContain("How does your agent run?");
  });

  test("fails closed in non-interactive first-run mode without an agent command", () => {
    const dir = workspace();

    const result = runCli(dir, ["evidence", "collect", "--first-run"]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain("First-run evidence capture needs an agent command");
    expect(output).toContain("amc evidence collect --first-run --runtime any -- node agent.js");
    expect(output).not.toContain("How does your agent run?");
  });

  test("captures a tiny first run without requiring a vault passphrase", () => {
    const dir = workspace();

    const result = runCli(dir, [
      "evidence",
      "collect",
      "--first-run",
      "--agent",
      "demo-agent",
      "--runtime",
      "any",
      "--",
      process.execPath,
      "-e",
      "console.log('amc first-run evidence smoke')"
    ]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Signing: UNSIGNED first-run capture");
    expect(result.stdout).toContain("amc first-run evidence smoke");
    expect(result.stdout).toContain("Session sealed:");
    expect(result.stdout).toContain("Next: amc quickscore --auto");
    expect(existsSync(join(dir, ".amc", "evidence.sqlite"))).toBe(true);
  });

  test("keeps onboarding docs and UX audit aligned with the first-run capture path", () => {
    const gettingStarted = readFileSync(resolve(process.cwd(), "docs/GETTING_STARTED.md"), "utf8");
    const startupGuidance = readFileSync(resolve(process.cwd(), "src/startup/startupGuidance.ts"), "utf8");
    const uxAudit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(gettingStarted).toContain("amc evidence collect --first-run --runtime any -- node agent.js");
    expect(gettingStarted).not.toContain("amc score collect-evidence my-agent");
    expect(startupGuidance).toContain("amc evidence collect --first-run --runtime any -- <agent command>");
    expect(uxAudit).toContain("R30 — first-run evidence capture is one command");
    expect(uxAudit).toContain("| 1 | Sarah | Junior Dev | ⭐⭐ 2/5 | ⭐⭐⭐⭐⭐ 5/5 | +3 | Quickstart and quickscore fail closed in non-TTY shells, and first evidence capture now has a one-command path |");
    expect(uxAudit).toMatch(/\*\*New average: (?:4\.[5-9]|5\.0)\/5\*\*/);
    expect(uxAudit).not.toContain("first evidence capture can still be smoother");
    expect(uxAudit).not.toContain("Sarah (⭐⭐⭐⭐) | Add a one-command evidence setup wizard");
  });
});
