import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  formatRiskCurrency,
  maturityRiskMultiplier,
  quantifyMaturityRisk
} from "../src/business/riskQuantification.js";

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("business risk quantification", () => {
  test("maps maturity level to residual incident frequency and expected annual loss", () => {
    const result = quantifyMaturityRisk({
      agentId: "risk-register-agent",
      maturityLevel: 3,
      maturitySource: "override",
      baselineAnnualIncidentFrequency: 5,
      averageIncidentCost: 20_000,
      riskAppetite: 50_000,
      currency: "USD",
      generatedAt: "2026-06-16T00:00:00.000Z"
    });

    expect(result.baseline).toEqual({
      annualIncidentFrequency: 5,
      expectedAnnualLoss: 100_000
    });
    expect(result.residual).toMatchObject({
      maturityRiskMultiplier: 0.38,
      annualIncidentFrequency: 1.9,
      expectedAnnualLoss: 38_000,
      expectedAnnualLossReduction: 62_000,
      reductionPct: 62
    });
    expect(result.riskAppetite).toMatchObject({
      annualLossLimit: 50_000,
      status: "BELOW",
      delta: -12_000
    });
    expect(result.confidence).toBe("MEDIUM");
    expect(result.model.sources.map((source) => source.title)).toContain("NIST SP 800-30 Rev. 1");
  });

  test("interpolates fractional maturity levels", () => {
    expect(maturityRiskMultiplier(2.5)).toBeCloseTo(0.5);
    expect(maturityRiskMultiplier(4.5)).toBeCloseTo(0.15);
  });

  test("marks defaults and emits calibration recommendations", () => {
    const result = quantifyMaturityRisk({
      agentId: "default-risk-agent",
      maturityLevel: 1,
      maturitySource: "override",
      generatedAt: "2026-06-16T00:00:00.000Z"
    });

    expect(result.inputs.defaulted).toEqual({
      baselineAnnualIncidentFrequency: true,
      averageIncidentCost: true,
      currency: true
    });
    expect(result.confidence).toBe("LOW");
    expect(result.assumptions.join("\n")).toContain("Default baseline frequency 4/year was used.");
    expect(result.recommendations.join("\n")).toContain("Replace defaults with organization-specific incident frequency and cost data.");
  });

  test("rejects impossible maturity and loss inputs", () => {
    expect(() => quantifyMaturityRisk({
      agentId: "bad",
      maturityLevel: 6,
      maturitySource: "override"
    })).toThrow("maturityLevel must be a finite number between 0 and 5.");

    expect(() => quantifyMaturityRisk({
      agentId: "bad",
      maturityLevel: 3,
      maturitySource: "override",
      averageIncidentCost: -1
    })).toThrow("averageIncidentCost must be a finite number greater than or equal to 0.");
  });

  test("formats currency with a fallback for unknown codes", () => {
    expect(formatRiskCurrency(123456.7, "USD")).toBe("$123,457");
    expect(formatRiskCurrency(123456.7, "XXX")).toContain("123,457");
  });

  test("public command and docs expose business risk quantification", () => {
    const source = readProjectFile("src/cli-business-commands.ts");
    const inventory = readProjectFile("docs/CLI_COMMAND_INVENTORY.md");
    const apiReference = readProjectFile("docs/API_REFERENCE.md");
    const quickstart = readProjectFile("docs/QUICKSTART.md");
    const gettingStarted = readProjectFile("docs/GETTING_STARTED.md");
    const audit = readProjectFile("docs/AUDIT_50_AGENTS_BATCH5.md");

    expect(source).toContain('.command("risk")');
    expect(source).toContain("Quantify maturity-linked incident frequency and expected annual loss");
    expect(inventory).toContain("| `amc business risk` |");
    expect(apiReference).toContain("#### `amc business risk`");
    expect(quickstart).toContain("amc business risk --maturity 3 --baseline-frequency 4 --incident-cost 50000 --json");
    expect(gettingStarted).toContain("amc business risk --maturity 3 --baseline-frequency 4 --incident-cost 50000 --risk-appetite 75000");
    expect(audit).toContain("Financial risk quantification — ✅ Resolved 2026-06-16");
    expect(audit).not.toContain("No \"expected annual loss\" or \"risk in dollar terms\" output.");
  });
});
