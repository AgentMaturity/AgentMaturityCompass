import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildRiskHeatmap,
  parseRiskHeatmapPortfolioJson,
  renderRiskHeatmapMarkdown
} from "../src/business/riskHeatmap.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-risk-heatmap-"));
  roots.push(root);
  return root;
}

function portfolioJson(): string {
  return JSON.stringify({
    currency: "USD",
    items: [
      {
        agentId: "claims-triage-agent",
        businessUnit: "Claims",
        owner: "Risk Ops",
        maturityLevel: 2,
        baselineAnnualIncidentFrequency: 8,
        averageIncidentCost: 75_000,
        riskAppetite: 120_000
      },
      {
        agentId: "support-refund-agent",
        businessUnit: "Support",
        maturityLevel: 4,
        baselineAnnualIncidentFrequency: 3,
        averageIncidentCost: 25_000,
        riskAppetite: 10_000
      },
      {
        agentId: "defaulted-sales-agent",
        businessUnit: "Revenue",
        maturityLevel: 1
      }
    ]
  }, null, 2);
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("business risk heatmap", () => {
  test("builds a portfolio heatmap with monetary exposure and risk appetite status", () => {
    const input = parseRiskHeatmapPortfolioJson(portfolioJson(), {
      generatedAt: "2026-06-16T00:00:00.000Z"
    });
    const heatmap = buildRiskHeatmap(input);

    expect(heatmap.summary).toMatchObject({
      agentCount: 3,
      businessUnitCount: 3,
      totalBaselineExpectedAnnualLoss: 875_000,
      totalResidualExpectedAnnualLoss: 551_000,
      aboveRiskAppetiteCount: 2,
      lowConfidenceCount: 1,
      highestSeverity: "HIGH"
    });
    expect(heatmap.cells).toHaveLength(25);
    expect(heatmap.agents.map((agent) => agent.cell)).toEqual(["L4-I3", "L2-I2", "L4-I2"]);
    expect(heatmap.topExposures[0]?.agentId).toBe("claims-triage-agent");
    expect(heatmap.model.sources.map((source) => source.title)).toContain("NIST SP 800-30 Rev. 1");

    const markdown = renderRiskHeatmapMarkdown(heatmap);
    expect(markdown).toContain("# Portfolio AI Risk Heatmap");
    expect(markdown).toContain("## Monetary Risk Heatmap");
    expect(markdown).toContain("claims-triage-agent");
    expect(markdown).toContain("$372,000 residual EAL");
    expect(markdown).toContain("Above risk appetite: 2");
  });

  test("built CLI writes a Markdown heatmap from a portfolio file", () => {
    const root = tempRoot();
    const portfolioPath = join(root, "risk-portfolio.json");
    const outPath = join(root, "risk-heatmap.md");
    writeFileSync(portfolioPath, portfolioJson(), "utf8");

    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "business",
      "heatmap",
      "--portfolio",
      portfolioPath,
      "--out",
      outPath
    ], {
      cwd: root,
      encoding: "utf8"
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("Business risk heatmap saved");
    expect(result.stdout).toContain("Agents: 3");
    expect(existsSync(outPath)).toBe(true);

    const body = readFileSync(outPath, "utf8");
    expect(body).toContain("Portfolio Summary");
    expect(body).toContain("Monetary Risk Heatmap");
    expect(body).toContain("Sources Checked");
  });

  test("public docs and audit expose portfolio risk heatmaps", () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

    expect(read("README.md")).toContain("amc business heatmap --portfolio risk-portfolio.json --out risk-heatmap.md");
    expect(read("docs/GETTING_STARTED.md")).toContain("Build a portfolio monetary risk heatmap");
    expect(read("docs/QUICKSTART.md")).toContain("Create a portfolio risk heatmap");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("Portfolio risk heatmap — ✅ Resolved 2026-06-16");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).not.toContain("No risk heat map with business impact in monetary terms.");
  });
});
