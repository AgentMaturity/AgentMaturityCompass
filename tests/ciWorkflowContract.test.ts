import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import YAML from "yaml";

type Step = { name?: string; run?: string; uses?: string; if?: string; "continue-on-error"?: boolean | string;
  env?: Record<string, string>; with?: Record<string, unknown> };
type Job = { if?: string; "runs-on"?: string; "timeout-minutes"?: number; "continue-on-error"?: boolean | string;
  permissions?: Record<string, string>; env?: Record<string, string>; steps: Step[] };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

const root = process.cwd();
const workflowText = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts as Record<string, string>;
const parse = () => YAML.parse(workflowText) as Workflow;
const required = (step: Step | undefined) => Boolean(step
  && (step["continue-on-error"] === undefined || step["continue-on-error"] === false)
  && (!step.if || step.if === "always()" || step.if === "${{ always() }}"));
const commandStep = (job: Job | undefined, command: string) => job?.steps.find(step => {
  const literal = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)\\s*${literal}(?:\\s|$)`).test(step.run ?? "");
});
const uploadStep = (job: Job, path: string) => job.steps.find(step => step.uses?.startsWith("actions/upload-artifact@")
  && String(step.with?.path ?? "").split(/\r?\n/).includes(path));

/** Parse the actual CI workflow; missing or conditional mandatory checks cannot satisfy the contract. */
function ciWorkflowFailures(workflow: Workflow): string[] {
  const failures: string[] = [];
  if (!Object.prototype.hasOwnProperty.call(workflow.on, "workflow_dispatch")) failures.push("CI has no manual dispatch trigger");
  for (const id of ["build-test", "release-gate", "e2e-playwright"]) {
    const job = workflow.jobs[id];
    if (!job) failures.push(`Missing ${id} job`);
    else if (job["continue-on-error"] !== undefined && job["continue-on-error"] !== false) failures.push(`${id} can ignore failures`);
  }
  const build = workflow.jobs["build-test"];
  if (build) {
    for (const command of ["npm run lint", "npm run typecheck:tests", "npm run check:freeze",
      "npm run check:duplicates", "npm run check:dead-code"]) {
      if (!required(commandStep(build, command))) failures.push(`build-test does not require ${command}`);
    }
    // The instrumented suite runs the same Vitest tests as npm test; performance files run separately without coverage.
    const coverage = commandStep(build, "npm run test:coverage");
    if (!required(commandStep(build, "npm test")) && !(required(coverage)
      && scripts.test === "vitest run" && scripts["test:coverage"] === "vitest run --coverage"
      && required(commandStep(build, "npx vitest run tests/performance --no-file-parallelism")))) {
      failures.push("build-test does not require the full test suite");
    }
    const clean = commandStep(build, "git status --porcelain=v1 --untracked-files=all");
    if (!required(clean) || !/\bexit 1\b/.test(clean?.run ?? "")) failures.push("build-test has no failing clean-tree check");
    if (!required(commandStep(build, "npm run check:no-fabrication"))
      && !(required(commandStep(build, "npm run lint")) && scripts.lint.includes("node scripts/check-no-fabrication.mjs"))) {
      failures.push("build-test does not require the fabrication guard");
    }
  }
  for (const id of ["release-gate", "e2e-playwright"]) {
    const job = workflow.jobs[id];
    if (!job) continue;
    if (!job.steps.some(step => step.uses?.startsWith("actions/setup-node@") && step.with?.["node-version"] === "24")) {
      failures.push(`${id} does not use Node 24`);
    }
    if (!required(commandStep(job, "pnpm install --frozen-lockfile"))) failures.push(`${id} does not require frozen installation`);
    if (job.permissions?.contents !== "read" || Object.values(job.permissions).some(value => value !== "read")) {
      failures.push(`${id} permissions are not read-only`);
    }
  }
  const gate = workflow.jobs["release-gate"];
  if (gate) {
    if (gate["runs-on"] !== "macos-latest") failures.push("release-gate does not execute the full native corpus on Darwin");
    if (gate.if !== "github.event_name != 'pull_request'") failures.push("release-gate is not restricted to non-PR events");
    if (gate["timeout-minutes"] !== 120) failures.push("release-gate does not have its 120-minute budget");
    const run = commandStep(gate, "npm run release:gate -- --json --out tmp/release-gate/ci.json");
    if (!required(run)) failures.push("release-gate does not require the actual full gate and receipt");
    if ((run?.env?.AMC_RELEASE_GATE_LIVE_URL ?? gate.env?.AMC_RELEASE_GATE_LIVE_URL) !== "${{ vars.AMC_RELEASE_GATE_LIVE_URL }}") {
      failures.push("release-gate does not use the repository live-health variable");
    }
    const upload = uploadStep(gate, "tmp/release-gate/");
    if (!upload || !["always()", "${{ always() }}"].includes(upload.if ?? "")) failures.push("release-gate does not always retain its reports");
    if (!uploadStep(gate, "coverage/coverage-summary.json")) failures.push("release-gate does not retain measured coverage");
  }
  const playwright = workflow.jobs["e2e-playwright"];
  if (playwright) {
    if (!required(commandStep(playwright, "npx playwright install --with-deps chromium"))) failures.push("Playwright does not require Chromium and its dependencies");
    const run = commandStep(playwright, "npm run test:e2e");
    if (!required(run) || !run?.run?.includes("--reporter=line,html")) failures.push("Playwright does not require the full suite with an HTML report");
    const upload = uploadStep(playwright, "playwright-report/");
    if (!upload || !["failure()", "${{ failure() }}"].includes(upload.if ?? "")) failures.push("Playwright does not retain failure reports");
  }
  return failures;
}

describe("CI workflow contract (P0-33)", () => {
  test("requires full tests, lint, guards, release qualification and Playwright in the actual workflow", () => {
    expect(ciWorkflowFailures(parse())).toEqual([]);
    expect(scripts.lint).toMatch(/^oxlint\s+--type-aware\s+--deny-warnings\b/);
    expect(scripts.lint).toContain("node scripts/lint-contract.mjs");
  });

  test("removing the Lint step fails the contract", () => {
    const workflow = parse();
    workflow.jobs["build-test"]!.steps = workflow.jobs["build-test"]!.steps.filter(step => step.name !== "Lint");
    expect(ciWorkflowFailures(workflow)).toContain("build-test does not require npm run lint");
  });

  test("removing the release-gate job fails the contract", () => {
    const workflow = parse();
    delete workflow.jobs["release-gate"];
    expect(ciWorkflowFailures(workflow)).toContain("Missing release-gate job");
  });

  test("ignoring source-quality or browser failures cannot qualify CI", () => {
    const workflow = parse();
    commandStep(workflow.jobs["build-test"], "npm run check:duplicates")!["continue-on-error"] = true;
    workflow.jobs["e2e-playwright"]!["continue-on-error"] = true;
    workflow.jobs["release-gate"]!["runs-on"] = "ubuntu-latest";
    const upload = uploadStep(workflow.jobs["release-gate"]!, "tmp/release-gate/")!;
    upload.with!.path = "tmp/release-gate/";
    expect(ciWorkflowFailures(workflow)).toContain("build-test does not require npm run check:duplicates");
    expect(ciWorkflowFailures(workflow)).toContain("e2e-playwright can ignore failures");
    expect(ciWorkflowFailures(workflow)).toContain("release-gate does not execute the full native corpus on Darwin");
    expect(ciWorkflowFailures(workflow)).toContain("release-gate does not retain measured coverage");
  });
});
