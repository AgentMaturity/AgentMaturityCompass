import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fleet-overview-"));
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
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("fleet overview executive summary", () => {
  test("prints one-shot executive summary and next actions for an unscored fleet", () => {
    const dir = workspace();

    const result = runCli(dir, ["fleet", "overview"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Fleet Executive Overview");
    expect(result.stdout).toContain("Verdict: Needs baseline score");
    expect(result.stdout).toContain("Coverage: 0/1 agents scored (0.0%)");
    expect(result.stdout).toContain("Weakest agents: none scored");
    expect(result.stdout).toContain("Next actions:");
    expect(result.stdout).toContain("amc fleet score --all --stream");
    expect(result.stdout).toContain("amc dashboard open");
  });

  test("supports JSON output for dashboard and ops automation", () => {
    const dir = workspace();

    const result = runCli(dir, ["fleet", "overview", "--json"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      verdict: string;
      coverage: { agentCount: number; scoredAgentCount: number; percent: number };
      nextActions: string[];
    };
    expect(payload.verdict).toBe("Needs baseline score");
    expect(payload.coverage).toEqual({ agentCount: 1, scoredAgentCount: 0, percent: 0 });
    expect(payload.nextActions).toContain("Score the fleet: amc fleet score --all --stream");
  });

  test("keeps the UX audit aligned with fleet overview behavior", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R18 — fleet overview gives executives a one-shot summary");
    expect(audit).toContain("`amc fleet overview` prints verdict, coverage, drift, weakest agents, and next actions");
    expect(audit).not.toContain("Add `amc fleet overview` as one-shot exec summary");
  });
});
