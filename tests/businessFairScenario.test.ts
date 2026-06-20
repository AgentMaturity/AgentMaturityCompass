import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildFairScenarioAnalysis,
  renderFairScenarioMarkdown
} from "../src/business/fairScenario.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-fair-scenario-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("business FAIR-style scenario analysis", () => {
  test("builds a deterministic loss distribution from calibrated frequency and magnitude ranges", () => {
    const input = {
      scenarioId: "claims-ai-data-leak",
      agentId: "claims-triage-agent",
      maturityLevel: 3,
      annualEventFrequency: { min: 2, mostLikely: 5, max: 9 },
      lossMagnitude: { min: 20_000, mostLikely: 75_000, max: 250_000 },
      riskAppetite: 120_000,
      iterations: 5000,
      seed: 12345,
      generatedAt: "2026-06-16T00:00:00.000Z"
    };

    const result = buildFairScenarioAnalysis(input);
    const repeated = buildFairScenarioAnalysis(input);

    expect(result).toEqual(repeated);
    expect(result.schemaVersion).toBe(1);
    expect(result.model.name).toBe("AMC FAIR-style scenario loss distribution");
    expect(result.model.sources.map((source) => source.title)).toEqual(
      expect.arrayContaining(["FAIR Institute - What is FAIR?", "NIST SP 800-30 Rev. 1"])
    );
    expect(result.calibration.annualEventFrequency).toEqual(input.annualEventFrequency);
    expect(result.calibration.lossMagnitude).toEqual(input.lossMagnitude);
    expect(result.maturity.riskMultiplier).toBe(0.38);
    expect(result.lossDistribution.p90).toBeGreaterThan(result.lossDistribution.p50);
    expect(result.lossDistribution.p50).toBeGreaterThan(result.lossDistribution.p10);
    expect(result.riskAppetite?.status).toBe("ABOVE_P90");
    expect(result.assumptions.join("\n")).toContain("triangular distributions");
    expect(result.limitations.join("\n")).toContain("not an Open FAIR certification");

    const markdown = renderFairScenarioMarkdown(result);
    expect(markdown).toContain("# FAIR-Style Scenario Loss Distribution");
    expect(markdown).toContain("claims-ai-data-leak");
    expect(markdown).toContain("P90");
    expect(markdown).toContain("not an Open FAIR certification");
  });

  test("built CLI writes a scenario report from explicit calibration ranges", () => {
    const root = tempRoot();
    const outPath = join(root, "fair-scenario.md");

    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "business",
      "fair-scenario",
      "--scenario",
      "claims-ai-data-leak",
      "--agent",
      "claims-triage-agent",
      "--maturity",
      "3",
      "--frequency-min",
      "2",
      "--frequency-most-likely",
      "5",
      "--frequency-max",
      "9",
      "--loss-min",
      "20000",
      "--loss-most-likely",
      "75000",
      "--loss-max",
      "250000",
      "--risk-appetite",
      "120000",
      "--iterations",
      "1000",
      "--seed",
      "12345",
      "--out",
      outPath
    ], {
      cwd: root,
      encoding: "utf8"
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("FAIR-style scenario report saved");
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, "utf8")).toContain("claims-ai-data-leak");
  });

  test("public docs and audit expose the scenario workflow without overclaiming Open FAIR certification", () => {
    expect(readProjectFile("src/cli-business-commands.ts")).toContain('.command("fair-scenario")');
    expect(readProjectFile("docs/CLI_COMMAND_INVENTORY.md")).toContain("| `amc business fair-scenario` |");
    expect(readProjectFile("docs/API_REFERENCE.md")).toContain("#### `amc business fair-scenario`");
    expect(readProjectFile("README.md")).toContain("amc business fair-scenario --scenario claims-ai-data-leak");
    expect(readProjectFile("docs/QUICKSTART.md")).toContain("amc business fair-scenario --scenario claims-ai-data-leak");
    expect(readProjectFile("docs/GETTING_STARTED.md")).toContain("Run a FAIR-style calibrated scenario distribution");

    const audit = readProjectFile("docs/AUDIT_50_AGENTS_BATCH5.md");
    expect(audit).toContain("FAIR-style scenario loss distribution — ✅ Resolved 2026-06-16");
    expect(audit).toContain("not a certified Open FAIR implementation");
    expect(audit).not.toContain("No Monte Carlo or calibrated loss-distribution model.");
    expect(audit).not.toContain("Calibrated FAIR/Open FAIR analysis with loss distributions and scenario factor calibration.");
  });
});
