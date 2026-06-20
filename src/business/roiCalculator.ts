import { dirname, join } from "node:path";

import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import {
  DEFAULT_AVERAGE_INCIDENT_COST,
  DEFAULT_BASELINE_ANNUAL_INCIDENT_FREQUENCY,
  DEFAULT_RISK_CURRENCY,
  formatRiskCurrency,
  quantifyMaturityRisk,
  type RiskQuantificationResult
} from "./riskQuantification.js";

export type TrustGapRoiFormat = "markdown" | "json";

export interface TrustGapRoiInput {
  agentId: string;
  currentMaturityLevel: number;
  targetMaturityLevel: number;
  baselineAnnualIncidentFrequency?: number;
  averageIncidentCost?: number;
  annualControlCost?: number;
  implementationCost?: number;
  riskAppetite?: number;
  currency?: string;
  generatedAt?: string;
}

export interface TrustGapRoiResult {
  schemaVersion: 1;
  agentId: string;
  generatedAt: string;
  currency: string;
  model: {
    name: string;
    formula: string;
    caveat: string;
    sources: RiskQuantificationResult["model"]["sources"];
  };
  inputs: {
    currentMaturityLevel: number;
    targetMaturityLevel: number;
    baselineAnnualIncidentFrequency: number;
    averageIncidentCost: number;
    riskAppetite: number | null;
  };
  current: {
    maturityLevel: number;
    residualExpectedAnnualLoss: number;
    residualAnnualIncidentFrequency: number;
  };
  target: {
    maturityLevel: number;
    residualExpectedAnnualLoss: number;
    residualAnnualIncidentFrequency: number;
  };
  trustGap: {
    expectedAnnualLossDelta: number;
    incidentFrequencyDelta: number;
    riskReductionPctFromCurrent: number;
  };
  costs: {
    annualControlCost: number;
    implementationCost: number;
    totalFirstYearCost: number;
  };
  firstYear: {
    grossBenefit: number;
    netBenefit: number;
    roiPct: number | null;
    benefitCostRatio: number | null;
    paybackMonths: number | null;
  };
  confidence: "LOW" | "MEDIUM";
  assumptions: string[];
  recommendations: string[];
}

export interface TrustGapRoiArtifact {
  path: string;
  format: TrustGapRoiFormat;
  result: TrustGapRoiResult;
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite number greater than or equal to 0.`);
  }
}

function assertMaturity(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw new Error(`${field} must be a finite number between 0 and 5.`);
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

export function calculateTrustGapRoi(input: TrustGapRoiInput): TrustGapRoiResult {
  assertMaturity(input.currentMaturityLevel, "currentMaturityLevel");
  assertMaturity(input.targetMaturityLevel, "targetMaturityLevel");
  if (input.targetMaturityLevel < input.currentMaturityLevel) {
    throw new Error("targetMaturityLevel must be greater than or equal to currentMaturityLevel.");
  }

  const baselineAnnualIncidentFrequency =
    input.baselineAnnualIncidentFrequency ?? DEFAULT_BASELINE_ANNUAL_INCIDENT_FREQUENCY;
  const averageIncidentCost = input.averageIncidentCost ?? DEFAULT_AVERAGE_INCIDENT_COST;
  const annualControlCost = input.annualControlCost ?? 0;
  const implementationCost = input.implementationCost ?? 0;
  const currency = input.currency ?? DEFAULT_RISK_CURRENCY;
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  assertFiniteNonNegative(baselineAnnualIncidentFrequency, "baselineAnnualIncidentFrequency");
  assertFiniteNonNegative(averageIncidentCost, "averageIncidentCost");
  assertFiniteNonNegative(annualControlCost, "annualControlCost");
  assertFiniteNonNegative(implementationCost, "implementationCost");
  if (input.riskAppetite !== undefined) {
    assertFiniteNonNegative(input.riskAppetite, "riskAppetite");
  }

  const shared = {
    agentId: input.agentId,
    baselineAnnualIncidentFrequency,
    averageIncidentCost,
    riskAppetite: input.riskAppetite,
    currency,
    generatedAt
  };
  const currentRisk = quantifyMaturityRisk({
    ...shared,
    maturityLevel: input.currentMaturityLevel,
    maturitySource: "override"
  });
  const targetRisk = quantifyMaturityRisk({
    ...shared,
    maturityLevel: input.targetMaturityLevel,
    maturitySource: "override"
  });

  const expectedAnnualLossDelta =
    currentRisk.residual.expectedAnnualLoss - targetRisk.residual.expectedAnnualLoss;
  const incidentFrequencyDelta =
    currentRisk.residual.annualIncidentFrequency - targetRisk.residual.annualIncidentFrequency;
  const grossBenefit = Math.max(0, expectedAnnualLossDelta);
  const totalFirstYearCost = annualControlCost + implementationCost;
  const netBenefit = grossBenefit - totalFirstYearCost;
  const netRecurringBenefit = grossBenefit - annualControlCost;
  const roiPct = totalFirstYearCost > 0 ? (netBenefit / totalFirstYearCost) * 100 : null;
  const benefitCostRatio = totalFirstYearCost > 0 ? grossBenefit / totalFirstYearCost : null;
  const paybackMonths = implementationCost === 0
    ? 0
    : netRecurringBenefit > 0
      ? implementationCost / (netRecurringBenefit / 12)
      : null;

  const assumptions = [
    "ROI uses maturity-linked expected annual loss reduction minus implementation and annual control costs.",
    "Expected annual loss is a planning estimate based on incident frequency multiplied by average incident cost.",
    "Planning estimate only; do not use as an accounting valuation, insurance model, or revenue guarantee."
  ];
  if (input.baselineAnnualIncidentFrequency === undefined) {
    assumptions.push(`Default baseline frequency ${DEFAULT_BASELINE_ANNUAL_INCIDENT_FREQUENCY}/year was used.`);
  }
  if (input.averageIncidentCost === undefined) {
    assumptions.push(`Default average incident cost ${DEFAULT_AVERAGE_INCIDENT_COST} was used.`);
  }

  const recommendations: string[] = [];
  if (grossBenefit === 0) {
    recommendations.push("No positive expected annual loss reduction was found; verify maturity targets and input assumptions.");
  }
  if (roiPct !== null && roiPct < 0) {
    recommendations.push("First-year ROI is negative under current assumptions; reduce implementation cost, phase controls, or validate a higher exposure baseline.");
  }
  if (targetRisk.riskAppetite?.status === "ABOVE") {
    recommendations.push("Target maturity still leaves residual expected annual loss above risk appetite; add compensating controls or reduce exposure.");
  }
  if (input.baselineAnnualIncidentFrequency === undefined || input.averageIncidentCost === undefined) {
    recommendations.push("Replace defaults with organization-specific incident frequency and cost data before buyer or board use.");
  }

  return {
    schemaVersion: 1,
    agentId: input.agentId,
    generatedAt,
    currency,
    model: {
      name: "AMC cost-of-trust-gap ROI model",
      formula: "firstYearRoi = (currentResidualEAL - targetResidualEAL - annualControlCost - implementationCost) / (annualControlCost + implementationCost)",
      caveat: "Planning estimate for buyer/business-case discussion; calibrate before financial reporting.",
      sources: currentRisk.model.sources
    },
    inputs: {
      currentMaturityLevel: round4(input.currentMaturityLevel),
      targetMaturityLevel: round4(input.targetMaturityLevel),
      baselineAnnualIncidentFrequency,
      averageIncidentCost,
      riskAppetite: input.riskAppetite ?? null
    },
    current: {
      maturityLevel: round4(input.currentMaturityLevel),
      residualExpectedAnnualLoss: currentRisk.residual.expectedAnnualLoss,
      residualAnnualIncidentFrequency: currentRisk.residual.annualIncidentFrequency
    },
    target: {
      maturityLevel: round4(input.targetMaturityLevel),
      residualExpectedAnnualLoss: targetRisk.residual.expectedAnnualLoss,
      residualAnnualIncidentFrequency: targetRisk.residual.annualIncidentFrequency
    },
    trustGap: {
      expectedAnnualLossDelta: round2(expectedAnnualLossDelta),
      incidentFrequencyDelta: round4(incidentFrequencyDelta),
      riskReductionPctFromCurrent: currentRisk.residual.expectedAnnualLoss === 0
        ? 0
        : round2((expectedAnnualLossDelta / currentRisk.residual.expectedAnnualLoss) * 100)
    },
    costs: {
      annualControlCost: round2(annualControlCost),
      implementationCost: round2(implementationCost),
      totalFirstYearCost: round2(totalFirstYearCost)
    },
    firstYear: {
      grossBenefit: round2(grossBenefit),
      netBenefit: round2(netBenefit),
      roiPct: roiPct === null ? null : round2(roiPct),
      benefitCostRatio: benefitCostRatio === null ? null : round2(benefitCostRatio),
      paybackMonths: paybackMonths === null ? null : round2(paybackMonths)
    },
    confidence: input.baselineAnnualIncidentFrequency !== undefined && input.averageIncidentCost !== undefined
      ? "MEDIUM"
      : "LOW",
    assumptions,
    recommendations
  };
}

function fmtPct(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}%`;
}

function fmtMonths(value: number | null): string {
  return value === null ? "not reached" : `${value.toFixed(1)} months`;
}

export function renderTrustGapRoiMarkdown(result: TrustGapRoiResult): string {
  const lines: string[] = [
    "# Cost of Trust Gap ROI",
    "",
    `- Agent: \`${result.agentId}\``,
    `- Generated: ${result.generatedAt}`,
    `- Currency: ${result.currency}`,
    `- Confidence: ${result.confidence}`,
    "",
    "## Maturity Scenario",
    "",
    `| Scenario | Maturity | Residual expected annual loss | Residual incidents/year |`,
    `| --- | ---: | ---: | ---: |`,
    `| Current | L${result.current.maturityLevel} | ${formatRiskCurrency(result.current.residualExpectedAnnualLoss, result.currency)} | ${result.current.residualAnnualIncidentFrequency.toFixed(2)} |`,
    `| Target | L${result.target.maturityLevel} | ${formatRiskCurrency(result.target.residualExpectedAnnualLoss, result.currency)} | ${result.target.residualAnnualIncidentFrequency.toFixed(2)} |`,
    "",
    "## Trust Gap",
    "",
    `- Expected annual loss delta: ${formatRiskCurrency(result.trustGap.expectedAnnualLossDelta, result.currency)}/year`,
    `- Incident frequency delta: ${result.trustGap.incidentFrequencyDelta.toFixed(2)} incidents/year`,
    `- Risk reduction from current residual loss: ${result.trustGap.riskReductionPctFromCurrent.toFixed(1)}%`,
    "",
    "## First-Year ROI",
    "",
    `- Gross benefit: ${formatRiskCurrency(result.firstYear.grossBenefit, result.currency)}`,
    `- Implementation cost: ${formatRiskCurrency(result.costs.implementationCost, result.currency)}`,
    `- Annual control cost: ${formatRiskCurrency(result.costs.annualControlCost, result.currency)}`,
    `- Total first-year cost: ${formatRiskCurrency(result.costs.totalFirstYearCost, result.currency)}`,
    `- Net first-year benefit: ${formatRiskCurrency(result.firstYear.netBenefit, result.currency)}`,
    `- First-year ROI: ${fmtPct(result.firstYear.roiPct)}`,
    `- Benefit/cost ratio: ${result.firstYear.benefitCostRatio === null ? "n/a" : result.firstYear.benefitCostRatio.toFixed(2)}`,
    `- Payback: ${fmtMonths(result.firstYear.paybackMonths)}`,
    "",
    "## Assumptions",
    "",
    ...result.assumptions.map((assumption) => `- ${assumption}`),
    "",
    "## Recommendations",
    "",
    ...(result.recommendations.length > 0 ? result.recommendations.map((recommendation) => `- ${recommendation}`) : ["- No immediate ROI warnings under the provided assumptions."]),
    "",
    "## Sources Checked",
    "",
    ...result.model.sources.map((source) => `- ${source.title}: ${source.url} — ${source.note}`),
    "",
    `Planning estimate: ${result.model.caveat}`,
    ""
  ];
  return lines.join("\n");
}

export function inferTrustGapRoiFormat(outputPath: string | undefined, requested?: string): TrustGapRoiFormat {
  const normalized = requested?.trim().toLowerCase();
  if (normalized) {
    if (normalized !== "markdown" && normalized !== "json") {
      throw new Error("--format must be markdown or json.");
    }
    return normalized;
  }
  return outputPath?.toLowerCase().endsWith(".json") ? "json" : "markdown";
}

export function defaultTrustGapRoiPath(workspace: string, format: TrustGapRoiFormat): string {
  return join(workspace, ".amc", "reports", `business-trust-gap-roi.${format === "json" ? "json" : "md"}`);
}

export function writeTrustGapRoiReport(params: {
  workspace: string;
  result: TrustGapRoiResult;
  outputPath?: string;
  format?: TrustGapRoiFormat;
}): TrustGapRoiArtifact {
  const format = params.format ?? inferTrustGapRoiFormat(params.outputPath);
  const outputPath = params.outputPath ?? defaultTrustGapRoiPath(params.workspace, format);
  ensureDir(dirname(outputPath));
  const body = format === "json"
    ? `${JSON.stringify(params.result, null, 2)}\n`
    : renderTrustGapRoiMarkdown(params.result);
  writeFileAtomic(outputPath, body, 0o644);
  return { path: outputPath, format, result: params.result };
}
