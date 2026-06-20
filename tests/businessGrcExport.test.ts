import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildGrcTreatmentPlanExport,
  parseRiskHeatmapPortfolioJson,
  renderGrcTreatmentPlanCsv,
  renderGrcTreatmentPlanMarkdown
} from "../src/business/grcExport.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-grc-export-"));
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
        owner: "Support Ops",
        maturityLevel: 4,
        baselineAnnualIncidentFrequency: 3,
        averageIncidentCost: 25_000,
        riskAppetite: 30_000
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

describe("business GRC treatment-plan export", () => {
  test("builds GRC-ready treatment rows from portfolio risk quantification", () => {
    const input = parseRiskHeatmapPortfolioJson(portfolioJson(), {
      generatedAt: "2026-06-16T00:00:00.000Z",
      title: "Quarterly AI Risk Register"
    });
    const grc = buildGrcTreatmentPlanExport(input, {
      treatmentDueDays: 45
    });

    expect(grc.summary).toMatchObject({
      agentCount: 3,
      openTreatmentCount: 3,
      aboveRiskAppetiteCount: 1,
      lowConfidenceCount: 1,
      highestSeverity: "HIGH"
    });
    expect(grc.model.externalReferences.map((source) => source.title)).toEqual(
      expect.arrayContaining(["ISO 31000:2018", "FAIR Institute - What is FAIR?"])
    );

    const claimsRow = grc.rows.find((row) => row.agentId === "claims-triage-agent");
    expect(claimsRow).toMatchObject({
      riskId: "AMC-RISK-001-CLAIMS-TRIAGE-AGENT",
      controlOwner: "Risk Ops",
      riskAppetiteStatus: "ABOVE",
      treatmentStrategy: "MITIGATE",
      treatmentDueDate: "2026-07-31",
      iso31000TreatmentContext: "Risk treatment",
      fairLossEventFrequencyPerYear: 4.96,
      fairLossMagnitude: 75_000,
      annualizedLossExposure: 372_000
    });
    expect(claimsRow?.recommendedActions.join("\n")).toContain("above risk appetite");
    expect(claimsRow?.acceptanceCriteria.join("\n")).toContain("Residual expected annual loss at or below USD 120,000");

    const markdown = renderGrcTreatmentPlanMarkdown(grc);
    expect(markdown).toContain("# Quarterly AI Risk Register");
    expect(markdown).toContain("## GRC Treatment Plan");
    expect(markdown).toContain("FAIR-style fields");
    expect(markdown).toContain("claims-triage-agent");

    const csv = renderGrcTreatmentPlanCsv(grc);
    expect(csv.split("\n")[0]).toContain("risk_id,agent_id,business_unit,control_owner");
    expect(csv).toContain("AMC-RISK-001-CLAIMS-TRIAGE-AGENT,claims-triage-agent,Claims,Risk Ops");
    expect(csv).toContain("MITIGATE");
  });

  test("built CLI writes a CSV GRC treatment-plan export from a portfolio file", () => {
    const root = tempRoot();
    const portfolioPath = join(root, "risk-portfolio.json");
    const outPath = join(root, "grc-treatment-plan.csv");
    writeFileSync(portfolioPath, portfolioJson(), "utf8");

    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "business",
      "grc-export",
      "--portfolio",
      portfolioPath,
      "--out",
      outPath,
      "--format",
      "csv",
      "--title",
      "Quarterly AI Risk Register"
    ], {
      cwd: root,
      encoding: "utf8"
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("GRC treatment-plan export saved");
    expect(result.stdout).toContain("Agents: 3");
    expect(result.stdout).toContain("Open treatments: 3");
    expect(existsSync(outPath)).toBe(true);

    const body = readFileSync(outPath, "utf8");
    expect(body).toContain("risk_id,agent_id,business_unit,control_owner");
    expect(body).toContain("AMC-RISK-001-CLAIMS-TRIAGE-AGENT");
  });

  test("public docs and audit expose the GRC treatment-plan workflow", () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

    expect(read("src/cli-business-commands.ts")).toContain('.command("grc-export")');
    expect(read("docs/CLI_COMMAND_INVENTORY.md")).toContain("| `amc business grc-export` |");
    expect(read("docs/API_REFERENCE.md")).toContain("#### `amc business grc-export`");
    expect(read("README.md")).toContain("amc business grc-export --portfolio risk-portfolio.json --out grc-treatment-plan.csv");
    expect(read("docs/GETTING_STARTED.md")).toContain("Export a GRC treatment-plan register");
    expect(read("docs/QUICKSTART.md")).toContain("Export a GRC treatment plan");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("GRC treatment-plan export — ✅ Resolved 2026-06-16");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("GRC exports are resolved; native GRC sync and certified Open FAIR remain");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("ISO 31000:2018");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("FAIR Institute");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).not.toContain("No output format compatible with GRC tools");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).not.toContain("GRC exports and full FAIR/ISO 31000 workflows remain");
  });
});
