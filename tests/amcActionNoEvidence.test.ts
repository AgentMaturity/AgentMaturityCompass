/**
 * The action's init, scoring, drop, gate, badge and comment steps, run as GitHub runs composite steps (bash -eo
 * pipefail, GITHUB_OUTPUT, GITHUB_ENV), against the built CLI in a fresh consumer repository. A fresh workspace has no
 * evidence yet: that is a result, never a crash and never a score. Needs dist/ (build first), git and jq.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { afterAll, describe, expect, test } from "vitest";

interface Step { name: string; run?: string; with?: { script?: string } }
type Inputs = Record<string, { default: string | number | boolean }>;
const action = YAML.parse(readFileSync("amc-action/action.yml", "utf8")) as { inputs: Inputs; runs: { steps: Step[] } };
const workflow = YAML.parse(readFileSync(".github/workflows/amc-score.yml", "utf8")) as {
  on: { workflow_call: { inputs: Inputs } }; jobs: { score: { steps: Step[] } };
};
const SURFACES = {
  action: { inputs: action.inputs, steps: action.runs.steps },
  workflow: { inputs: workflow.on.workflow_call.inputs, steps: workflow.jobs.score.steps }
};
const body = (steps: Step[], name: string, field: "run" | "script") => {
  const found = steps.find((step) => step.name === name);
  const text = field === "run" ? found?.run : found?.with?.script;
  if (typeof text !== "string") throw new Error(`no ${field} for step "${name}"`);
  return text;
};
const keyValues = (text: string) => Object.fromEntries(text.split("\n").filter((line) => line.includes("="))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const GITHUB_CONTEXT: Record<string, string> = { repository: "owner/repo", base_ref: "main" };
const NOT_EVALUATED = { statusDimensions: { result: "not_evaluated" }, layerScores: [{ layerName: "Skills", avgFinalLevel: 0 }] };
const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

/**
 * One job: a consumer checkout, the runner files, and `amc` on PATH running this checkout's built CLI, or printing
 * the JSON given to stub() with its exit status.
 */
function job(overrides: Record<string, string> = {}, surface: keyof typeof SURFACES = "action") {
  const { steps } = SURFACES[surface];
  const defaults = Object.fromEntries(Object.entries(SURFACES[surface].inputs).map(([key, input]) => [key, String(input.default)]));
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-action-job-")));
  roots.push(root);
  const [repo, home, temp, bin] = ["repo", "home", "temp", "bin"].map((dir) => join(root, dir));
  for (const dir of [repo, home, temp, bin]) mkdirSync(dir);
  const [output, env, summary, stubJson, stubStatus] = ["output", "env", "summary", "stub.json", "stub.status"].map((file) => join(root, file));
  writeFileSync(join(bin, "amc"), `#!/bin/sh\nif [ -f "${stubJson}" ]; then cat "${stubJson}"; exit "$(cat "${stubStatus}")"; fi\n`
    + `exec "${process.execPath}" "${resolve("dist/cli.js")}" "$@"\n`, { mode: 0o755 });
  writeFileSync(env, "");
  const inputs: Record<string, string> = { ...defaults, ...overrides };
  const outputs: Record<string, Record<string, string>> = {};
  const evaluate = (expression: string) => {
    for (const term of expression.split("||").map((part) => part.trim())) {
      const literal = /^'(.*)'$/.exec(term)?.[1];
      const input = /^inputs\.([\w-]+)$/.exec(term)?.[1];
      const out = /^steps\.([\w-]+)\.outputs\.(\w+)$/.exec(term);
      const github = GITHUB_CONTEXT[/^github\.(\w+)$/.exec(term)?.[1] ?? ""];
      if (literal === undefined && input === undefined && !out && github === undefined) throw new Error(`unsupported expression: ${expression}`);
      const value = literal ?? github ?? (input !== undefined ? inputs[input] : outputs[out![1]!]?.[out![2]!]);
      if (value) return value;
    }
    return "";
  };
  const substitute = (text: string) => text.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_, expression: string) => evaluate(expression));
  return {
    repo,
    stub(result: object, status = 0) {
      writeFileSync(stubJson, JSON.stringify(result));
      writeFileSync(stubStatus, String(status));
    },
    step(name: string, id?: string) {
      writeFileSync(output, "");
      writeFileSync(summary, "");
      const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", substitute(body(steps, name, "run"))], {
        cwd: repo, encoding: "utf8", timeout: 120_000,
        env: { PATH: [bin, dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter), HOME: home, RUNNER_TEMP: temp,
          GITHUB_OUTPUT: output, GITHUB_ENV: env, GITHUB_STEP_SUMMARY: summary, ...keyValues(readFileSync(env, "utf8")) }
      });
      if (id) outputs[id] = keyValues(readFileSync(output, "utf8"));
      return { status: result.status, stdout: result.stdout, stderr: result.stderr, outputs: keyValues(readFileSync(output, "utf8")),
        summary: readFileSync(summary, "utf8"), env: keyValues(readFileSync(env, "utf8")) };
    },
    /** The PR comment script under a stub github-script context; returns the comment body it would post. */
    async comment() {
      let posted = "";
      const github = { rest: { issues: {
        listComments: async () => ({ data: [] }),
        createComment: async ({ body: text }: { body: string }) => { posted = text; },
        updateComment: async ({ body: text }: { body: string }) => { posted = text; }
      } } };
      const context = { repo: { owner: "o", repo: "r" }, issue: { number: 1 } };
      const script = new (Object.getPrototypeOf(async () => {}).constructor)("require", "github", "context", substitute(body(steps, "Comment on PR", "script")));
      await script(createRequire(import.meta.url), github, context);
      return posted;
    }
  };
}

describe("AMC action: no evidence yet is a result, never a crash or a score", { timeout: 120_000 }, () => {
  test("the reusable amc-score workflow initializes unattended and reports no evidence yet, never a score", () => {
    const run = job({ "target-level": "0" }, "workflow");
    expect(run.step("Initialize AMC workspace").status).toBe(0);
    const scored = run.step("Run AMC Score", "amc");
    expect(scored.status, scored.stderr).toBe(0);
    expect(scored.outputs).toEqual({ evidence: "none" });
    expect(scored.summary).toContain("AMC: no evidence yet");
    expect(run.step("Check target level").status).toBe(0);
    const required = job({ "target-level": "2" }, "workflow");
    expect(required.step("Initialize AMC workspace").status).toBe(0);
    expect(required.step("Run AMC Score", "amc").outputs.evidence).toBe("none");
    const gate = required.step("Check target level");
    expect(gate.status).toBe(1);
    expect(gate.stdout).toContain("No evidence yet: AMC has no measured level to compare with target L2");
  });

  test("a fresh repository initializes unattended; the auto score reports no evidence yet and the gate says so", async () => {
    const run = job({ "target-level": "0", "fail-on-drop": "true" });
    const init = run.step("Initialize AMC workspace");
    expect(init.status, init.stderr).toBe(0);
    expect(existsSync(join(run.repo, ".amc"))).toBe(true);
    expect(init.env.AMC_VAULT_PASSPHRASE).toMatch(/^amc-ci-[\w-]{32}$/);
    expect(init.stdout).toContain(`::add-mask::${init.env.AMC_VAULT_PASSPHRASE}`);
    expect(init.stdout + init.stderr).not.toContain("export AMC_VAULT_PASSPHRASE");

    const scored = run.step("Run AMC evaluation", "run-amc");
    expect(scored.status, scored.stderr).toBe(0);
    expect(scored.outputs).toMatchObject({ evidence: "none" });
    expect(scored.outputs.score).toBeUndefined();
    expect(scored.outputs.level).toBeUndefined();
    expect(scored.summary).toContain("AMC: no evidence yet");
    expect(scored.summary).not.toMatch(/AMC Score|\bL0\b/);
    expect(JSON.parse(readFileSync(scored.outputs.result_path!, "utf8")).statusDimensions.result).toBe("not_evaluated");

    const drop = run.step("Score-drop detection (base branch comparison)", "drop");
    expect(drop.status, drop.stderr).toBe(0);
    expect(drop.outputs).toMatchObject({ dropped: "false", base_score: "unavailable" });
    expect(drop.summary).toContain("No evidence yet on this branch; skipping drop comparison.");
    const gate = run.step("Target-level gate", "gate");
    expect(gate.status, gate.stderr).toBe(0);
    expect(gate.outputs.passed).toBe("true");
    expect(gate.summary).toContain("no evidence yet");
    const badge = run.step("Generate badge", "badge");
    expect(badge.outputs.badge_url).toBe("https://img.shields.io/badge/AMC-no%20evidence%20yet-lightgrey");
    const comment = await run.comment();
    expect(comment).toContain("AMC: no evidence yet");
    expect(comment).not.toMatch(/AMC Score|\bL0\b/);
  });

  test("a required level with no evidence yet fails the gate with that reason, not with a level", () => {
    const run = job({ "target-level": "2" });
    expect(run.step("Initialize AMC workspace").status).toBe(0);
    expect(run.step("Run AMC evaluation", "run-amc").outputs.evidence).toBe("none");
    const gate = run.step("Target-level gate", "gate");
    expect(gate.status).toBe(1);
    expect(gate.outputs.passed).toBe("false");
    expect(gate.stdout).toContain("::error::AMC gate failed: no evidence yet: AMC has no measured level to compare with the required L2");
  });

  test("quickscore's AUTO_NO_EVIDENCE exit is reported as no evidence yet with its reason, not as a crash", () => {
    const run = job({ "agent-id": "pr-audit" });
    expect(run.step("Initialize AMC workspace").status).toBe(0);
    const scored = run.step("Run AMC evaluation", "run-amc");
    expect(scored.status, scored.stderr).toBe(0);
    expect(scored.outputs.evidence).toBe("none");
    expect(scored.summary).toContain("Missing context graph for agent 'pr-audit'");
    expect(JSON.parse(readFileSync(scored.outputs.result_path!, "utf8")).scoreStatus).toBe("AUTO_NO_EVIDENCE");
  });

  test("survey answers stay a self-reported score, and output that is not a result stays a failure", () => {
    const run = job({ "answers-file": "answers.json" });
    writeFileSync(join(run.repo, "answers.json"), JSON.stringify({ "AMC-1.1": 3, "AMC-2.1": 3, "AMC-3.1.1": 3, "AMC-4.1": 3, "AMC-5.1": 3 }));
    expect(run.step("Initialize AMC workspace").status).toBe(0);
    const scored = run.step("Run AMC evaluation", "run-amc");
    expect(scored.status, scored.stderr).toBe(0);
    expect(scored.outputs).toMatchObject({ score: "60", level: "L3", level_num: "3" });
    expect(scored.outputs.evidence).toBeUndefined();
    writeFileSync(join(run.repo, "answers.json"), "{not json");
    expect(run.step("Run AMC evaluation", "run-amc").status).not.toBe(0);
  });

  test("a result without a score or level is refused, and a base with no evidence is unavailable, never 0", () => {
    const run = job({ "fail-on-drop": "true" });
    run.stub({ ok: true });
    const refused = run.step("Run AMC evaluation", "run-amc");
    expect(refused.status).toBe(1);
    expect(refused.stdout).toContain("::error::The AMC result names no score and L0-L5 level");
    expect(refused.outputs.score).toBeUndefined();

    run.stub({ statusDimensions: { result: "pass" }, layerScores: [{ layerName: "Skills", avgFinalLevel: 1.5 }, { layerName: "Resilience", avgFinalLevel: 2.24 }] });
    expect(run.step("Run AMC evaluation", "run-amc").outputs).toMatchObject({ score: "1.87", level: "L1", level_num: "1" });
    writeFileSync(join(run.repo, "README.md"), "base\n");
    for (const args of [["init", "-q"], ["add", "README.md"], ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "base"],
      ["update-ref", "refs/remotes/origin/main", "HEAD"]]) {
      expect(spawnSync("git", args, { cwd: run.repo }).status).toBe(0);
    }
    run.stub(NOT_EVALUATED);
    const drop = run.step("Score-drop detection (base branch comparison)", "drop");
    expect(drop.status, drop.stderr).toBe(0);
    expect(drop.outputs).toMatchObject({ dropped: "false", base_score: "unavailable" });
    expect(drop.summary).toContain("Base branch could not be scored");
  });
});
