import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import {
  calculateTrustGapRoi,
  renderTrustGapRoiMarkdown
} from "../src/business/roiCalculator.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-business-roi-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("business trust-gap ROI calculator", () => {
  test("calculates first-year ROI from maturity-linked expected annual loss reduction", () => {
    const result = calculateTrustGapRoi({
      agentId: "buyer-risk-agent",
      currentMaturityLevel: 2,
      targetMaturityLevel: 3,
      baselineAnnualIncidentFrequency: 5,
      averageIncidentCost: 20_000,
      annualControlCost: 15_000,
      implementationCost: 5_000,
      currency: "USD",
      generatedAt: "2026-06-16T00:00:00.000Z"
    });

    expect(result.current.residualExpectedAnnualLoss).toBe(62_000);
    expect(result.target.residualExpectedAnnualLoss).toBe(38_000);
    expect(result.trustGap.expectedAnnualLossDelta).toBe(24_000);
    expect(result.costs.totalFirstYearCost).toBe(20_000);
    expect(result.firstYear.netBenefit).toBe(4_000);
    expect(result.firstYear.roiPct).toBe(20);
    expect(result.firstYear.paybackMonths).toBeCloseTo(6.67);
    expect(result.model.sources.map((source) => source.title)).toContain("NIST SP 800-30 Rev. 1");
  });

  test("renders a cost-of-trust-gap markdown document", () => {
    const result = calculateTrustGapRoi({
      agentId: "claims-agent",
      currentMaturityLevel: 1,
      targetMaturityLevel: 3,
      baselineAnnualIncidentFrequency: 4,
      averageIncidentCost: 50_000,
      annualControlCost: 25_000,
      implementationCost: 10_000,
      generatedAt: "2026-06-16T00:00:00.000Z"
    });

    const markdown = renderTrustGapRoiMarkdown(result);

    expect(markdown).toContain("# Cost of Trust Gap ROI");
    expect(markdown).toContain("claims-agent");
    expect(markdown).toContain("Expected annual loss delta");
    expect(markdown).toContain("First-year ROI");
    expect(markdown).toContain("Planning estimate");
  });

  test("built CLI writes a markdown ROI report", () => {
    const root = tempRoot();
    const outPath = join(root, "trust-gap-roi.md");
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "business",
      "roi",
      "--agent",
      "buyer-risk-agent",
      "--current-maturity",
      "2",
      "--target-maturity",
      "3",
      "--baseline-frequency",
      "5",
      "--incident-cost",
      "20000",
      "--annual-control-cost",
      "15000",
      "--implementation-cost",
      "5000",
      "--out",
      outPath
    ], {
      cwd: root,
      encoding: "utf8"
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("Business ROI report saved");
    expect(result.stdout).toContain("First-year ROI: 20.0%");
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, "utf8")).toContain("Cost of Trust Gap ROI");
  });

  test("public docs and audit expose the business ROI calculator", () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

    expect(read("src/cli-business-commands.ts")).toContain('.command("roi")');
    expect(read("README.md")).toContain("amc business roi --current-maturity 2 --target-maturity 3");
    expect(read("docs/QUICKSTART.md")).toContain("Calculate cost-of-trust-gap ROI");
    expect(read("docs/GETTING_STARTED.md")).toContain("Estimate first-year ROI from a maturity improvement");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("ROI calculator — ✅ Resolved 2026-06-16");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).not.toContain("No ROI calculator or \"cost of a trust gap\" document.");
  });
});
