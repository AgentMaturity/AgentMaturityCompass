import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { afterAll, describe, it, expect } from "vitest";
import { evaluateCIGate, generateGitHubAction, generateGitLabCI, generateConnectorConfig, setupIntegration } from "../../src/integrations/ciGate.js";
import { amcVersion } from "../../src/version.js";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

/** Runs generated CI shell in a fresh consumer repository, `amc` on PATH being this checkout's built CLI (dist/). */
function runner() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-ci-gate-")));
  roots.push(root);
  const [repo, home, bin] = ["repo", "home", "bin"].map((dir) => join(root, dir));
  for (const dir of [repo, home, bin]) mkdirSync(dir);
  writeFileSync(join(bin, "amc"), `#!/bin/sh\nexec "${process.execPath}" "${resolve("dist/cli.js")}" "$@"\n`, { mode: 0o755 });
  const [output, env, summary] = ["output", "env", "summary"].map((file) => join(root, file));
  writeFileSync(env, "");
  const keyValues = (text: string) => Object.fromEntries(text.split("\n").filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  return {
    repo,
    run(script: string) {
      writeFileSync(output, "");
      writeFileSync(summary, "");
      const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
        cwd: repo, encoding: "utf8", timeout: 120_000,
        env: { PATH: [bin, dirname(process.execPath), "/usr/bin", "/bin"].join(delimiter), HOME: home,
          GITHUB_OUTPUT: output, GITHUB_ENV: env, GITHUB_STEP_SUMMARY: summary, ...keyValues(readFileSync(env, "utf8")) }
      });
      return { status: result.status, stdout: result.stdout, stderr: result.stderr,
        outputs: keyValues(readFileSync(output, "utf8")), summary: readFileSync(summary, "utf8") };
    }
  };
}
const githubStep = (yaml: string, name: string) => {
  const steps = (YAML.parse(yaml) as { jobs: { "amc-gate": { steps: Array<{ name: string; run?: string }> } } }).jobs["amc-gate"].steps;
  const run = steps.find((step) => step.name === name)?.run;
  if (!run) throw new Error(`no step ${name}`);
  return run;
};

describe("CI Gate", () => {
  it("passes when score meets threshold", () => {
    const result = evaluateCIGate(
      { workspace: "/tmp", minScore: 60 },
      { overallScore: 75, criticalCount: 0, warnings: [], dimensions: { observability: 80, reliability: 70 } },
    );
    expect(result.passed).toBe(true);
    expect(result.summary).toContain("PASSED");
  });

  it("fails when score below threshold", () => {
    const result = evaluateCIGate(
      { workspace: "/tmp", minScore: 80 },
      { overallScore: 55, criticalCount: 0, warnings: ["Low observability"], dimensions: { observability: 40 } },
    );
    expect(result.passed).toBe(false);
    expect(result.summary).toContain("FAILED");
  });

  it("fails on critical violations even with good score", () => {
    const result = evaluateCIGate(
      { workspace: "/tmp", minScore: 60, failOnCritical: true },
      { overallScore: 90, criticalCount: 2, warnings: [], dimensions: {} },
    );
    expect(result.passed).toBe(false);
    expect(result.criticalViolations).toBe(2);
  });

  it("generates GitHub annotations", () => {
    const result = evaluateCIGate(
      { workspace: "/tmp", minScore: 60 },
      { overallScore: 50, criticalCount: 1, warnings: ["Test warning"], dimensions: {} },
    );
    expect(result.annotations).toBeDefined();
    expect(result.annotations!.length).toBeGreaterThan(0);
  });
});

describe("setup for notification targets writes no file that nothing reads", () => {
  it("slack and webhook name the signed integrations.yaml steps and write nothing", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-setup-notify-")));
    roots.push(dir);
    for (const type of ["slack", "webhook"] as const) {
      const result = setupIntegration(dir, type, { outputDir: dir });
      expect(result.files).toEqual([]);
      expect(result.instructions).toContain("amc integrations init");
      expect(result.instructions).toContain("amc integrations sign");
      expect(result.instructions).toContain(type === "slack" ? "slack_webhook" : "HMAC signature");
    }
    expect(readdirSync(dir)).toEqual([]);
  });

  it("refuses targets AMC has no channel for, and unknown types", () => {
    expect(() => setupIntegration("/nonexistent", "discord")).toThrow(/no Discord channel/);
    expect(() => setupIntegration("/nonexistent", "pagerduty")).toThrow(/no PagerDuty channel/);
    expect(() => setupIntegration("/nonexistent", "bogus" as never)).toThrow(/^unknown integration type: bogus;/);
  });
});

describe("GitHub Action Generator", () => {
  it("generates valid YAML with default config", () => {
    const yaml = generateGitHubAction({});
    expect(yaml).toContain("name: AMC Trust Gate");
    expect(yaml).toContain("actions/checkout@v4");
    expect(yaml).toContain("60"); // default threshold
  });

  it("respects custom min score", () => {
    const yaml = generateGitHubAction({ minScore: 80 });
    expect(yaml).toContain("80");
  });

  it("includes agent ID when specified", () => {
    const yaml = generateGitHubAction({ agentId: "my-agent" });
    expect(yaml).toContain("--agent my-agent");
  });
});

describe("GitLab CI Generator", () => {
  it("generates valid config", () => {
    const yaml = generateGitLabCI({});
    expect(yaml).toContain("amc-gate");
  });
});

describe("generated CI templates: real flags and package, no evidence yet is never a score", { timeout: 120_000 }, () => {
  it("install the checksum-verified release tarball and use only real commands", () => {
    for (const yaml of [generateGitHubAction({}), generateGitLabCI({})]) {
      expect(yaml).toContain(`VERSION="${amcVersion}"`);
      expect(yaml).toContain("agent-maturity-compass-${VERSION}.tgz");
      expect(yaml).toContain("sha256sum -c -");
      expect(yaml).toContain("amc init --minimal --profile ci");
      expect(yaml).not.toMatch(/@amc\/cli|--non-interactive|amc run --auto|integrityIndex/);
    }
  });

  it("GitHub: a fresh repository initializes unattended and reports no evidence yet; a threshold then fails with that reason", () => {
    const yaml = generateGitHubAction({ minScore: 60, agentId: "default" });
    const ci = runner();
    const init = ci.run(githubStep(yaml, "Initialize AMC workspace"));
    expect(init.status, init.stderr).toBe(0);
    expect(existsSync(join(ci.repo, ".amc"))).toBe(true);
    const gate = ci.run(githubStep(yaml, "Run AMC assessment"));
    expect(gate.status).toBe(1);
    expect(gate.outputs).toEqual({ evidence: "none" });
    expect(gate.summary).toContain("AMC: no evidence yet");
    expect(gate.summary).toContain("no measured score to compare with the 60% threshold");
    expect(gate.summary).not.toMatch(/Trust Score|\b0%/);
    const open = ci.run(githubStep(generateGitHubAction({ minScore: 0, agentId: "default" }), "Run AMC assessment"));
    expect(open.status, open.stderr).toBe(0);
    expect(open.outputs).toEqual({ evidence: "none" });
  });

  it("GitLab: the init and assessment script lines report no evidence yet the same way", () => {
    const script = (YAML.parse(generateGitLabCI({ minScore: 60 })) as { "amc-gate": { script: string[] } })["amc-gate"].script;
    const ci = runner();
    const result = ci.run(script.filter((line) => !/curl|sha256sum|npm i/.test(line)).join("\n"));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("AMC: no evidence yet");
    expect(result.stdout).toContain("no measured score to compare with the 60% threshold");
    expect(existsSync(join(ci.repo, "amc-report.json"))).toBe(true);
  });
});

describe("Connector Config Generator", () => {
  it("generates Langfuse config", () => {
    const config = generateConnectorConfig("langfuse");
    expect(config.envVars).toHaveProperty("AMC_LANGFUSE_PUBLIC_KEY");
    expect(config.configYaml).toContain("langfuse");
    expect(config.instructions).toContain("cloud.langfuse.com");
  });

  it("generates Helicone config", () => {
    const config = generateConnectorConfig("helicone");
    expect(config.envVars).toHaveProperty("AMC_HELICONE_API_KEY");
    expect(config.configYaml).toContain("helicone");
  });

  it("generates Datadog config", () => {
    const config = generateConnectorConfig("datadog");
    expect(config.envVars).toHaveProperty("AMC_DD_API_KEY");
  });
});
