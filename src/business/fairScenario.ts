import { dirname, isAbsolute, join } from "node:path";

import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import {
  DEFAULT_RISK_CURRENCY,
  formatRiskCurrency,
  maturityRiskMultiplier
} from "./riskQuantification.js";

export type FairScenarioFormat = "markdown" | "json";
export type FairScenarioRiskAppetiteStatus = "BELOW" | "ABOVE_MEDIAN" | "ABOVE_P90";

export interface FairScenarioRange {
  min: number;
  mostLikely: number;
  max: number;
}

export interface FairScenarioInput {
  scenarioId: string;
  agentId: string;
  maturityLevel: number;
  annualEventFrequency: FairScenarioRange;
  lossMagnitude: FairScenarioRange;
  riskAppetite?: number;
  currency?: string;
  iterations?: number;
  seed?: number;
  generatedAt?: string;
}

export interface FairScenarioAnalysis {
  schemaVersion: 1;
  scenarioId: string;
  agentId: string;
  generatedAt: string;
  currency: string;
  iterations: number;
  seed: number;
  model: {
    name: string;
    formula: string;
    caveat: string;
    sources: Array<{ title: string; url: string; note: string }>;
  };
  maturity: {
    level: number;
    riskMultiplier: number;
  };
  calibration: {
    annualEventFrequency: FairScenarioRange;
    lossMagnitude: FairScenarioRange;
  };
  lossDistribution: {
    mean: number;
    p10: number;
    p50: number;
    p90: number;
    p95: number;
    min: number;
    max: number;
  };
  riskAppetite: {
    annualLossLimit: number;
    status: FairScenarioRiskAppetiteStatus;
    p50Delta: number;
    p90Delta: number;
  } | null;
  assumptions: string[];
  limitations: string[];
  recommendations: string[];
}

export interface FairScenarioArtifact {
  path: string;
  format: FairScenarioFormat;
  result: FairScenarioAnalysis;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function assertMaturity(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw new Error("maturityLevel must be a finite number between 0 and 5.");
  }
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite number greater than or equal to 0.`);
  }
}

function assertRange(range: FairScenarioRange, field: string): void {
  assertFiniteNonNegative(range.min, `${field}.min`);
  assertFiniteNonNegative(range.mostLikely, `${field}.mostLikely`);
  assertFiniteNonNegative(range.max, `${field}.max`);
  if (range.min > range.mostLikely || range.mostLikely > range.max) {
    throw new Error(`${field} must satisfy min <= mostLikely <= max.`);
  }
}

function assertIterations(value: number): void {
  if (!Number.isInteger(value) || value < 100 || value > 100_000) {
    throw new Error("iterations must be an integer between 100 and 100000.");
  }
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sampleTriangular(range: FairScenarioRange, random: number): number {
  if (range.min === range.max) {
    return range.min;
  }
  const span = range.max - range.min;
  const modeDistance = range.mostLikely - range.min;
  const c = modeDistance / span;
  if (random < c) {
    return range.min + Math.sqrt(random * span * modeDistance);
  }
  return range.max - Math.sqrt((1 - random) * span * (range.max - range.mostLikely));
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const rank = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower] ?? 0;
  }
  const weight = rank - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

function classifyAppetite(p50: number, p90: number, appetite: number): FairScenarioRiskAppetiteStatus {
  if (p90 > appetite) return "ABOVE_P90";
  if (p50 > appetite) return "ABOVE_MEDIAN";
  return "BELOW";
}

function normalizeSeed(value: number | undefined): number {
  if (value === undefined) return 42;
  if (!Number.isInteger(value)) {
    throw new Error("seed must be an integer.");
  }
  return value;
}

export function buildFairScenarioAnalysis(input: FairScenarioInput): FairScenarioAnalysis {
  assertNonEmpty(input.scenarioId, "scenarioId");
  assertNonEmpty(input.agentId, "agentId");
  assertMaturity(input.maturityLevel);
  assertRange(input.annualEventFrequency, "annualEventFrequency");
  assertRange(input.lossMagnitude, "lossMagnitude");
  if (input.riskAppetite !== undefined) {
    assertFiniteNonNegative(input.riskAppetite, "riskAppetite");
  }

  const iterations = input.iterations ?? 10_000;
  assertIterations(iterations);
  const seed = normalizeSeed(input.seed);
  const currency = input.currency ?? DEFAULT_RISK_CURRENCY;
  const multiplier = maturityRiskMultiplier(input.maturityLevel);
  const rng = createSeededRng(seed);
  const losses: number[] = [];

  for (let index = 0; index < iterations; index += 1) {
    const frequency = sampleTriangular(input.annualEventFrequency, rng());
    const magnitude = sampleTriangular(input.lossMagnitude, rng());
    losses.push(frequency * multiplier * magnitude);
  }

  losses.sort((a, b) => a - b);
  const mean = losses.reduce((sum, value) => sum + value, 0) / losses.length;
  const p50 = percentile(losses, 50);
  const p90 = percentile(losses, 90);
  const riskAppetite = input.riskAppetite === undefined
    ? null
    : {
        annualLossLimit: round2(input.riskAppetite),
        status: classifyAppetite(p50, p90, input.riskAppetite),
        p50Delta: round2(p50 - input.riskAppetite),
        p90Delta: round2(p90 - input.riskAppetite)
      };

  const recommendations: string[] = [];
  if (riskAppetite?.status === "ABOVE_P90") {
    recommendations.push("P90 scenario loss exceeds risk appetite; reduce exposure, add controls, or lower autonomy before acceptance.");
  } else if (riskAppetite?.status === "ABOVE_MEDIAN") {
    recommendations.push("Median scenario loss exceeds risk appetite; calibrate scenario factors and define a mitigation plan.");
  }
  if (input.maturityLevel < 3) {
    recommendations.push("Scenario is below L3; prioritize evidence-backed controls before using this agent in high-impact workflows.");
  }
  recommendations.push("Replace min/most-likely/max estimates with observed incident, audit, claims, and finance data when available.");

  return {
    schemaVersion: 1,
    scenarioId: input.scenarioId,
    agentId: input.agentId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    currency,
    iterations,
    seed,
    model: {
      name: "AMC FAIR-style scenario loss distribution",
      formula: "annualLoss = sampledAnnualEventFrequency * maturityRiskMultiplier * sampledLossMagnitude",
      caveat: "Planning estimate for scenario analysis; not an Open FAIR certification, actuarial model, insurance model, or accounting valuation.",
      sources: [
        {
          title: "FAIR Institute - What is FAIR?",
          url: "https://www.fairinstitute.org/what-is-fair",
          note: "Frames cyber and operational risk quantification in financial terms and highlights standard taxonomy, data-collection criteria, measurement scales, and scenario analysis."
        },
        {
          title: "NIST SP 800-30 Rev. 1",
          url: "https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-30r1.pdf",
          note: "Grounds risk analysis in likelihood and adverse impact."
        }
      ]
    },
    maturity: {
      level: round4(input.maturityLevel),
      riskMultiplier: round4(multiplier)
    },
    calibration: {
      annualEventFrequency: { ...input.annualEventFrequency },
      lossMagnitude: { ...input.lossMagnitude }
    },
    lossDistribution: {
      mean: round2(mean),
      p10: round2(percentile(losses, 10)),
      p50: round2(p50),
      p90: round2(p90),
      p95: round2(percentile(losses, 95)),
      min: round2(losses[0] ?? 0),
      max: round2(losses[losses.length - 1] ?? 0)
    },
    riskAppetite,
    assumptions: [
      "Annual event frequency and loss magnitude are sampled with triangular distributions from min/most-likely/max estimates.",
      "AMC maturity adjusts event frequency through the same maturity risk multiplier used by deterministic business risk outputs.",
      "The random generator is deterministic for a fixed seed so reviewers can reproduce the distribution."
    ],
    limitations: [
      "This is not an Open FAIR certification or a complete Open FAIR analysis engine.",
      "Scenario factors are only as reliable as the calibration data provided.",
      "Use this for risk-register planning and sensitivity analysis, not financial reporting."
    ],
    recommendations
  };
}

export function renderFairScenarioMarkdown(result: FairScenarioAnalysis): string {
  const lines = [
    "# FAIR-Style Scenario Loss Distribution",
    "",
    `- Scenario: \`${result.scenarioId}\``,
    `- Agent: \`${result.agentId}\``,
    `- Generated: ${result.generatedAt}`,
    `- Iterations: ${result.iterations.toLocaleString("en-US")}`,
    `- Seed: ${result.seed}`,
    `- Currency: ${result.currency}`,
    "",
    "## Calibration",
    "",
    `- Annual event frequency: min ${result.calibration.annualEventFrequency.min}, most likely ${result.calibration.annualEventFrequency.mostLikely}, max ${result.calibration.annualEventFrequency.max}`,
    `- Loss magnitude: min ${formatRiskCurrency(result.calibration.lossMagnitude.min, result.currency)}, most likely ${formatRiskCurrency(result.calibration.lossMagnitude.mostLikely, result.currency)}, max ${formatRiskCurrency(result.calibration.lossMagnitude.max, result.currency)}`,
    `- Maturity: L${result.maturity.level.toFixed(2)} (risk multiplier ${result.maturity.riskMultiplier.toFixed(4)})`,
    "",
    "## Loss Distribution",
    "",
    `- Mean: ${formatRiskCurrency(result.lossDistribution.mean, result.currency)}`,
    `- P10: ${formatRiskCurrency(result.lossDistribution.p10, result.currency)}`,
    `- P50: ${formatRiskCurrency(result.lossDistribution.p50, result.currency)}`,
    `- P90: ${formatRiskCurrency(result.lossDistribution.p90, result.currency)}`,
    `- P95: ${formatRiskCurrency(result.lossDistribution.p95, result.currency)}`,
    ""
  ];

  if (result.riskAppetite) {
    lines.push(
      "## Risk Appetite",
      "",
      `- Limit: ${formatRiskCurrency(result.riskAppetite.annualLossLimit, result.currency)}`,
      `- Status: ${result.riskAppetite.status}`,
      `- P50 delta: ${formatRiskCurrency(result.riskAppetite.p50Delta, result.currency)}`,
      `- P90 delta: ${formatRiskCurrency(result.riskAppetite.p90Delta, result.currency)}`,
      ""
    );
  }

  lines.push(
    "## Assumptions",
    "",
    ...result.assumptions.map((assumption) => `- ${assumption}`),
    "",
    "## Limitations",
    "",
    ...result.limitations.map((limitation) => `- ${limitation}`),
    "",
    "## Recommendations",
    "",
    ...result.recommendations.map((recommendation) => `- ${recommendation}`),
    ""
  );

  return lines.join("\n");
}

export function inferFairScenarioFormat(outputPath: string | undefined, requestedFormat: string | undefined): FairScenarioFormat {
  if (requestedFormat === "json" || requestedFormat === "markdown") {
    return requestedFormat;
  }
  if (outputPath?.toLowerCase().endsWith(".json")) {
    return "json";
  }
  return "markdown";
}

export function writeFairScenarioReport(params: {
  workspace: string;
  result: FairScenarioAnalysis;
  outputPath: string;
  format: FairScenarioFormat;
}): FairScenarioArtifact {
  const fullPath = isAbsolute(params.outputPath)
    ? params.outputPath
    : join(params.workspace, params.outputPath);
  ensureDir(dirname(fullPath));
  const body = params.format === "json"
    ? `${JSON.stringify(params.result, null, 2)}\n`
    : renderFairScenarioMarkdown(params.result);
  writeFileAtomic(fullPath, body);
  return {
    path: fullPath,
    format: params.format,
    result: params.result
  };
}
