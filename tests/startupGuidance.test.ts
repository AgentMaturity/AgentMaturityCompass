import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildStartupGuidancePlan,
  renderStartupGuidancePlan,
  startupSampleAnswers
} from "../src/startup/startupGuidance.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-startup-guidance-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("startup guidance", () => {
  test("builds role-aware startup blockers with framework detection and sample answers", () => {
    const root = tempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({
      dependencies: {
        langchain: "^0.3.0"
      }
    }), "utf8");

    const plan = buildStartupGuidancePlan({
      workspace: root,
      role: "founder",
      env: {}
    });

    expect(plan.role).toBe("founder");
    expect(plan.roleGoal).toContain("pilot");
    expect(plan.detectedFramework).toBe("LangChain");
    expect(plan.issues.map((issue) => issue.id)).toEqual([
      "workspace_missing",
      "sample_answers_missing",
      "measured_score_missing",
      "vault_env_missing"
    ]);
    expect(Object.keys(plan.sampleAnswers)).toHaveLength(Object.keys(startupSampleAnswers()).length);
    expect(plan.externalBasis[0]?.title).toBe("The Twelve-Factor App: Config");

    const rendered = renderStartupGuidancePlan(plan, { onlyBroken: true });
    expect(rendered).toContain("What Is Blocking You");
    expect(rendered).toContain("amc init --minimal");
    expect(rendered).toContain("amc quickscore --answers amc-startup-answers.json --json");
  });

  test("built CLI writes sample answers and prints startup plan JSON", () => {
    const root = tempRoot();
    const answersPath = join(root, "answers.json");
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "quickstart",
      "--startup-plan",
      "--role",
      "developer",
      "--answers-out",
      answersPath,
      "--json"
    ], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, AMC_VAULT_PASSPHRASE: "" }
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(existsSync(answersPath)).toBe(true);
    const stdout = JSON.parse(result.stdout) as {
      role: string;
      commands: { whatIsBroken: string };
      wroteSampleAnswers: string;
    };
    expect(stdout.role).toBe("developer");
    expect(stdout.commands.whatIsBroken).toBe("amc quickstart --what-broken");
    expect(stdout.wroteSampleAnswers).toBe(answersPath);
    expect(Object.keys(JSON.parse(readFileSync(answersPath, "utf8")))).toHaveLength(10);
  });

  test("built CLI prints only blockers for what-broken mode", () => {
    const root = tempRoot();
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "quickstart",
      "--what-broken"
    ], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, AMC_VAULT_PASSPHRASE: "" }
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("# AMC Startup Check");
    expect(result.stdout).toContain("What Is Blocking You");
    expect(result.stdout).toContain("workspace is not initialized");
    expect(result.stdout).not.toContain("Quick Score Assessment");
  });

  test("public docs and audit expose startup guidance", () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

    expect(read("README.md")).toContain("amc quickstart --startup-plan --answers-out amc-startup-answers.json");
    expect(read("docs/QUICKSTART.md")).toContain("amc quickstart --what-broken");
    expect(read("docs/GETTING_STARTED.md")).toContain("amc quickstart --startup-plan --role cto");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("Startup guidance and what-broken mode — ✅ Resolved 2026-06-16");
  });
});
