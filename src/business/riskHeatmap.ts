import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  DEFAULT_RISK_CURRENCY,
  formatRiskCurrency,
  quantifyMaturityRisk,
  type MaturityRiskSource,
  type RiskQuantificationResult
} from "./riskQuantification.js";

export type RiskHeatmapFormat = "markdown" | "json";
export type RiskHeatmapSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RiskHeatmapPortfolioItemInput = {
  agentId: string;
  businessUnit?: string;
  owner?: string;
  maturityLevel: number;
  maturitySource?: MaturityRiskSource;
  baselineAnnualIncidentFrequency?: number;
  averageIncidentCost?: number;
  riskAppetite?: number;
  currency?: string;
};

export type RiskHeatmapInput = {
  generatedAt?: string;
  currency?: string;
  title?: string;
  items: RiskHeatmapPortfolioItemInput[];
};

export type RiskHeatmapBand = {
  score: 1 | 2 | 3 | 4 | 5;
  label: string;
  max: number | null;
  description: string;
};

export type RiskHeatmapAgent = {
  agentId: string;
  businessUnit: string | null;
  owner: string | null;
  cell: string;
  likelihoodBand: RiskHeatmapBand;
  impactBand: RiskHeatmapBand;
  severity: RiskHeatmapSeverity;
  severityScore: number;
  confidence: RiskQuantificationResult["confidence"];
  maturityLevel: number;
  residualAnnualIncidentFrequency: number;
  averageIncidentCost: number;
  baselineExpectedAnnualLoss: number;
  residualExpectedAnnualLoss: number;
  expectedAnnualLossReduction: number;
  riskAppetiteStatus: RiskQuantificationResult["riskAppetite"];
  recommendations: string[];
  quantification: RiskQuantificationResult;
};

export type RiskHeatmapCell = {
  key: string;
  likelihoodScore: number;
  impactScore: number;
  likelihoodLabel: string;
  impactLabel: string;
  severity: RiskHeatmapSeverity;
  agentCount: number;
  totalBaselineExpectedAnnualLoss: number;
  totalResidualExpectedAnnualLoss: number;
  totalExpectedAnnualLossReduction: number;
  agents: string[];
};

export type RiskHeatmapResult = {
  schemaVersion: 1;
  title: string;
  generatedAt: string;
  currency: string;
  model: {
    name: string;
    formula: string;
    caveat: string;
    sources: Array<{ title: string; url: string; note: string }>;
  };
  bands: {
    likelihood: RiskHeatmapBand[];
    impact: RiskHeatmapBand[];
  };
  summary: {
    agentCount: number;
    businessUnitCount: number;
    totalBaselineExpectedAnnualLoss: number;
    totalResidualExpectedAnnualLoss: number;
    totalExpectedAnnualLossReduction: number;
    reductionPct: number;
    aboveRiskAppetiteCount: number;
    lowConfidenceCount: number;
    highestSeverity: RiskHeatmapSeverity;
  };
  cells: RiskHeatmapCell[];
  agents: RiskHeatmapAgent[];
  topExposures: RiskHeatmapAgent[];
  assumptions: string[];
  nextActions: string[];
};

export type RiskHeatmapArtifact = {
  path: string;
  format: RiskHeatmapFormat;
  heatmap: RiskHeatmapResult;
};

const LIKELIHOOD_BANDS: RiskHeatmapBand[] = [
  { score: 1, label: "Very low", max: 0.25, description: "<= 0.25 residual incidents/year" },
  { score: 2, label: "Low", max: 1, description: "> 0.25 and <= 1 residual incident/year" },
  { score: 3, label: "Medium", max: 3, description: "> 1 and <= 3 residual incidents/year" },
  { score: 4, label: "High", max: 6, description: "> 3 and <= 6 residual incidents/year" },
  { score: 5, label: "Very high", max: null, description: "> 6 residual incidents/year" }
];

const IMPACT_BANDS: RiskHeatmapBand[] = [
  { score: 1, label: "Minor", max: 10_000, description: "<= 10,000 average incident cost" },
  { score: 2, label: "Moderate", max: 50_000, description: "> 10,000 and <= 50,000 average incident cost" },
  { score: 3, label: "Major", max: 250_000, description: "> 50,000 and <= 250,000 average incident cost" },
  { score: 4, label: "Severe", max: 1_000_000, description: "> 250,000 and <= 1,000,000 average incident cost" },
  { score: 5, label: "Catastrophic", max: null, description: "> 1,000,000 average incident cost" }
];

const SEVERITY_RANK: Record<RiskHeatmapSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCurrency(value: string | undefined, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`${field} must be a 3-letter ISO currency code such as USD.`);
  }
  return normalized;
}

function parseFiniteNonNegative(value: unknown, field: string, required: boolean): number | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new Error(`${field} is required.`);
    }
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be a finite number greater than or equal to 0.`);
  }
  return parsed;
}

function parseOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseMaturitySource(value: unknown, field: string): MaturityRiskSource | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === "diagnostic" || value === "override") {
    return value;
  }
  throw new Error(`${field} must be "diagnostic" or "override".`);
}

function parsePortfolioItem(value: unknown, index: number, defaultCurrency?: string): RiskHeatmapPortfolioItemInput {
  if (!isRecord(value)) {
    throw new Error(`portfolio item ${index + 1} must be an object.`);
  }

  const agentId = parseOptionalString(value.agentId, `items[${index}].agentId`)
    ?? parseOptionalString(value.id, `items[${index}].id`);
  if (!agentId) {
    throw new Error(`items[${index}].agentId is required.`);
  }

  const maturityLevel = parseFiniteNonNegative(value.maturityLevel, `items[${index}].maturityLevel`, true);
  if (maturityLevel === undefined || maturityLevel > 5) {
    throw new Error(`items[${index}].maturityLevel must be between 0 and 5.`);
  }

  return {
    agentId,
    businessUnit: parseOptionalString(value.businessUnit, `items[${index}].businessUnit`),
    owner: parseOptionalString(value.owner, `items[${index}].owner`),
    maturityLevel,
    maturitySource: parseMaturitySource(value.maturitySource, `items[${index}].maturitySource`),
    baselineAnnualIncidentFrequency: parseFiniteNonNegative(
      value.baselineAnnualIncidentFrequency ?? value.baselineFrequency,
      `items[${index}].baselineAnnualIncidentFrequency`,
      false
    ),
    averageIncidentCost: parseFiniteNonNegative(
      value.averageIncidentCost ?? value.incidentCost,
      `items[${index}].averageIncidentCost`,
      false
    ),
    riskAppetite: parseFiniteNonNegative(value.riskAppetite, `items[${index}].riskAppetite`, false),
    currency: normalizeCurrency(parseOptionalString(value.currency, `items[${index}].currency`) ?? defaultCurrency, `items[${index}].currency`)
  };
}

function extractPortfolioArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value)) {
    const candidates = [value.items, value.agents, value.portfolio];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error("portfolio JSON must be an array or an object with an items, agents, or portfolio array.");
}

export function parseRiskHeatmapPortfolioJson(source: string, defaults: { currency?: string; title?: string; generatedAt?: string } = {}): RiskHeatmapInput {
  const parsed = JSON.parse(source) as unknown;
  const root = isRecord(parsed) ? parsed : {};
  const defaultCurrency = normalizeCurrency(
    defaults.currency ?? parseOptionalString(root.currency, "currency"),
    "currency"
  );
  const generatedAt = defaults.generatedAt ?? parseOptionalString(root.generatedAt, "generatedAt");
  const title = defaults.title ?? parseOptionalString(root.title, "title");
  const items = extractPortfolioArray(parsed).map((item, index) => parsePortfolioItem(item, index, defaultCurrency));

  return {
    generatedAt,
    currency: defaultCurrency,
    title,
    items
  };
}

function bandForValue(value: number, bands: RiskHeatmapBand[]): RiskHeatmapBand {
  for (const band of bands) {
    if (band.max === null || value <= band.max) {
      return band;
    }
  }
  const fallback = bands[bands.length - 1];
  if (!fallback) {
    throw new Error("risk heatmap bands are not configured.");
  }
  return fallback;
}

function severityFor(likelihoodScore: number, impactScore: number): RiskHeatmapSeverity {
  const score = likelihoodScore * impactScore;
  if (score >= 20) return "CRITICAL";
  if (score >= 12) return "HIGH";
  if (score >= 6) return "MEDIUM";
  return "LOW";
}

function compareSeverity(a: RiskHeatmapSeverity, b: RiskHeatmapSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

function cellKey(likelihoodScore: number, impactScore: number): string {
  return `L${likelihoodScore}-I${impactScore}`;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function uniqueCount(values: Array<string | null>): number {
  return new Set(values.filter((value): value is string => Boolean(value))).size;
}

export function buildRiskHeatmap(input: RiskHeatmapInput): RiskHeatmapResult {
  if (input.items.length === 0) {
    throw new Error("risk heatmap requires at least one portfolio item.");
  }

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const firstCurrency = input.items.find((item) => item.currency)?.currency;
  const currency = normalizeCurrency(input.currency ?? firstCurrency ?? DEFAULT_RISK_CURRENCY, "currency") ?? DEFAULT_RISK_CURRENCY;

  const cells: RiskHeatmapCell[] = [];
  for (const likelihood of LIKELIHOOD_BANDS) {
    for (const impact of IMPACT_BANDS) {
      cells.push({
        key: cellKey(likelihood.score, impact.score),
        likelihoodScore: likelihood.score,
        impactScore: impact.score,
        likelihoodLabel: likelihood.label,
        impactLabel: impact.label,
        severity: severityFor(likelihood.score, impact.score),
        agentCount: 0,
        totalBaselineExpectedAnnualLoss: 0,
        totalResidualExpectedAnnualLoss: 0,
        totalExpectedAnnualLossReduction: 0,
        agents: []
      });
    }
  }
  const cellsByKey = new Map(cells.map((cell) => [cell.key, cell]));

  const agents = input.items.map((item) => {
    const itemCurrency = normalizeCurrency(item.currency ?? currency, `currency for ${item.agentId}`) ?? currency;
    if (itemCurrency !== currency) {
      throw new Error(`portfolio item ${item.agentId} uses ${itemCurrency}; all items must use ${currency} for aggregation.`);
    }

    const quantification = quantifyMaturityRisk({
      agentId: item.agentId,
      maturityLevel: item.maturityLevel,
      maturitySource: item.maturitySource ?? "override",
      baselineAnnualIncidentFrequency: item.baselineAnnualIncidentFrequency,
      averageIncidentCost: item.averageIncidentCost,
      riskAppetite: item.riskAppetite,
      currency,
      generatedAt
    });
    const likelihoodBand = bandForValue(quantification.residual.annualIncidentFrequency, LIKELIHOOD_BANDS);
    const impactBand = bandForValue(quantification.inputs.averageIncidentCost, IMPACT_BANDS);
    const key = cellKey(likelihoodBand.score, impactBand.score);
    const severity = severityFor(likelihoodBand.score, impactBand.score);
    const agent: RiskHeatmapAgent = {
      agentId: item.agentId,
      businessUnit: item.businessUnit ?? null,
      owner: item.owner ?? null,
      cell: key,
      likelihoodBand,
      impactBand,
      severity,
      severityScore: likelihoodBand.score * impactBand.score,
      confidence: quantification.confidence,
      maturityLevel: quantification.maturity.level,
      residualAnnualIncidentFrequency: quantification.residual.annualIncidentFrequency,
      averageIncidentCost: quantification.inputs.averageIncidentCost,
      baselineExpectedAnnualLoss: quantification.baseline.expectedAnnualLoss,
      residualExpectedAnnualLoss: quantification.residual.expectedAnnualLoss,
      expectedAnnualLossReduction: quantification.residual.expectedAnnualLossReduction,
      riskAppetiteStatus: quantification.riskAppetite,
      recommendations: quantification.recommendations,
      quantification
    };

    const cell = cellsByKey.get(key);
    if (!cell) {
      throw new Error(`risk heatmap cell ${key} is not configured.`);
    }
    cell.agentCount += 1;
    cell.totalBaselineExpectedAnnualLoss = roundMoney(cell.totalBaselineExpectedAnnualLoss + agent.baselineExpectedAnnualLoss);
    cell.totalResidualExpectedAnnualLoss = roundMoney(cell.totalResidualExpectedAnnualLoss + agent.residualExpectedAnnualLoss);
    cell.totalExpectedAnnualLossReduction = roundMoney(cell.totalExpectedAnnualLossReduction + agent.expectedAnnualLossReduction);
    cell.agents.push(agent.agentId);

    return agent;
  });

  const totalBaselineExpectedAnnualLoss = roundMoney(agents.reduce((sum, agent) => sum + agent.baselineExpectedAnnualLoss, 0));
  const totalResidualExpectedAnnualLoss = roundMoney(agents.reduce((sum, agent) => sum + agent.residualExpectedAnnualLoss, 0));
  const totalExpectedAnnualLossReduction = roundMoney(agents.reduce((sum, agent) => sum + agent.expectedAnnualLossReduction, 0));
  const reductionPct = totalBaselineExpectedAnnualLoss === 0
    ? 0
    : Number(((totalExpectedAnnualLossReduction / totalBaselineExpectedAnnualLoss) * 100).toFixed(2));
  const highestSeverity = agents
    .map((agent) => agent.severity)
    .sort((a, b) => compareSeverity(b, a))[0] ?? "LOW";
  const topExposures = [...agents]
    .sort((a, b) => b.residualExpectedAnnualLoss - a.residualExpectedAnnualLoss || b.severityScore - a.severityScore)
    .slice(0, 10);
  const lowConfidenceCount = agents.filter((agent) => agent.confidence === "LOW").length;
  const aboveRiskAppetiteCount = agents.filter((agent) => agent.riskAppetiteStatus?.status === "ABOVE").length;

  const nextActions: string[] = [];
  if (aboveRiskAppetiteCount > 0) {
    nextActions.push("Open treatment plans for agents above risk appetite before expanding autonomy.");
  }
  if (lowConfidenceCount > 0) {
    nextActions.push("Replace default frequency or incident-cost assumptions with observed loss data for low-confidence rows.");
  }
  if (agents.some((agent) => agent.maturityLevel < 3)) {
    nextActions.push("Raise sub-L3 agents to evidence-backed L3 before treating the residual loss estimate as board-ready.");
  }
  nextActions.push("Review the highest residual expected annual loss cells first; validate frequency and impact inputs with incident, audit, claims, and finance owners.");

  return {
    schemaVersion: 1,
    title: input.title ?? "Portfolio AI Risk Heatmap",
    generatedAt,
    currency,
    model: {
      name: "AMC portfolio maturity-linked expected annual loss heatmap",
      formula: "Each agent uses residual expected annual loss = baselineAnnualIncidentFrequency * averageIncidentCost * maturityRiskMultiplier; heatmap cells group residual likelihood by average incident impact.",
      caveat: "Planning estimate for risk registers and board packets; calibrate with observed loss data before financial reporting or insurance decisions.",
      sources: [
        {
          title: "NIST SP 800-30 Rev. 1",
          url: "https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-30r1.pdf",
          note: "Risk assessment combines likelihood of harm and degree of impact, with flexible reporting formats."
        },
        {
          title: "NIST AI RMF 1.0",
          url: "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf",
          note: "AI risk tolerance is organization- and use-case-specific and should drive prioritization."
        }
      ]
    },
    bands: {
      likelihood: LIKELIHOOD_BANDS.map((band) => ({ ...band })),
      impact: IMPACT_BANDS.map((band) => ({ ...band }))
    },
    summary: {
      agentCount: agents.length,
      businessUnitCount: uniqueCount(agents.map((agent) => agent.businessUnit)),
      totalBaselineExpectedAnnualLoss,
      totalResidualExpectedAnnualLoss,
      totalExpectedAnnualLossReduction,
      reductionPct,
      aboveRiskAppetiteCount,
      lowConfidenceCount,
      highestSeverity
    },
    cells,
    agents,
    topExposures,
    assumptions: [
      "Likelihood bands use residual annual incident frequency after AMC maturity adjustment.",
      "Impact bands use average incident cost per event; cells also show residual expected annual loss.",
      "Risk appetite status is computed per agent when an annual expected-loss threshold is supplied.",
      "Default frequency or cost assumptions lower confidence and should be replaced before formal board or GRC use."
    ],
    nextActions
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function describeBand(band: RiskHeatmapBand, currency?: string): string {
  if (currency && band.description.includes("incident cost")) {
    return band.description.replace(/\d[\d,]*/g, (match) => formatRiskCurrency(Number(match.replace(/,/g, "")), currency));
  }
  return band.description;
}

function renderCell(cell: RiskHeatmapCell, currency: string): string {
  if (cell.agentCount === 0) {
    return "-";
  }
  const agents = cell.agents.slice(0, 3).join(", ");
  const suffix = cell.agents.length > 3 ? ` +${cell.agents.length - 3}` : "";
  return `${cell.severity}; ${cell.agentCount} agent${cell.agentCount === 1 ? "" : "s"}; ${formatRiskCurrency(cell.totalResidualExpectedAnnualLoss, currency)} residual EAL; ${escapeMarkdown(agents)}${suffix}`;
}

export function renderRiskHeatmapMarkdown(heatmap: RiskHeatmapResult): string {
  const impactBands = [...heatmap.bands.impact].sort((a, b) => a.score - b.score);
  const likelihoodBands = [...heatmap.bands.likelihood].sort((a, b) => b.score - a.score);
  const cellMap = new Map(heatmap.cells.map((cell) => [cell.key, cell]));
  const lines: string[] = [
    `# ${escapeMarkdown(heatmap.title)}`,
    "",
    `Generated: ${heatmap.generatedAt}`,
    `Currency: ${heatmap.currency}`,
    "",
    "## Portfolio Summary",
    "",
    `- Agents: ${heatmap.summary.agentCount}`,
    `- Business units: ${heatmap.summary.businessUnitCount}`,
    `- Baseline expected annual loss: ${formatRiskCurrency(heatmap.summary.totalBaselineExpectedAnnualLoss, heatmap.currency)}`,
    `- Residual expected annual loss: ${formatRiskCurrency(heatmap.summary.totalResidualExpectedAnnualLoss, heatmap.currency)}`,
    `- Expected annual loss reduction: ${formatRiskCurrency(heatmap.summary.totalExpectedAnnualLossReduction, heatmap.currency)} (${heatmap.summary.reductionPct.toFixed(1)}%)`,
    `- Above risk appetite: ${heatmap.summary.aboveRiskAppetiteCount}`,
    `- Low-confidence rows: ${heatmap.summary.lowConfidenceCount}`,
    `- Highest severity: ${heatmap.summary.highestSeverity}`,
    "",
    "## Monetary Risk Heatmap",
    "",
    "| Residual likelihood \\\\ impact | " + impactBands.map((band) => `I${band.score} ${escapeMarkdown(band.label)} (${escapeMarkdown(describeBand(band, heatmap.currency))})`).join(" | ") + " |",
    "|---|" + impactBands.map(() => "---|").join("")
  ];

  for (const likelihood of likelihoodBands) {
    const row = [`L${likelihood.score} ${likelihood.label} (${likelihood.description})`];
    for (const impact of impactBands) {
      const cell = cellMap.get(cellKey(likelihood.score, impact.score));
      row.push(cell ? renderCell(cell, heatmap.currency) : "-");
    }
    lines.push(`| ${row.map(escapeMarkdown).join(" | ")} |`);
  }

  lines.push(
    "",
    "## Top Residual Exposures",
    "",
    "| Agent | Business unit | Maturity | Cell | Severity | Residual frequency | Avg incident cost | Residual EAL | Appetite | Confidence |",
    "|---|---|---:|---|---|---:|---:|---:|---|---|"
  );
  for (const agent of heatmap.topExposures) {
    const appetite = agent.riskAppetiteStatus
      ? `${agent.riskAppetiteStatus.status} (${formatRiskCurrency(agent.riskAppetiteStatus.annualLossLimit, heatmap.currency)})`
      : "Not set";
    lines.push([
      escapeMarkdown(agent.agentId),
      escapeMarkdown(agent.businessUnit ?? "-"),
      agent.maturityLevel.toFixed(2),
      agent.cell,
      agent.severity,
      agent.residualAnnualIncidentFrequency.toFixed(2),
      formatRiskCurrency(agent.averageIncidentCost, heatmap.currency),
      formatRiskCurrency(agent.residualExpectedAnnualLoss, heatmap.currency),
      escapeMarkdown(appetite),
      agent.confidence
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Assumptions",
    "",
    ...heatmap.assumptions.map((assumption) => `- ${assumption}`),
    "",
    "## Next Actions",
    "",
    ...heatmap.nextActions.map((action) => `- ${action}`),
    "",
    "## Sources Checked",
    "",
    ...heatmap.model.sources.map((source) => `- ${source.title}: ${source.url} - ${source.note}`),
    "",
    heatmap.model.caveat,
    ""
  );

  return lines.join("\n");
}

export function inferRiskHeatmapFormat(outputPath: string | undefined, explicitFormat?: string): RiskHeatmapFormat {
  if (explicitFormat !== undefined) {
    if (explicitFormat !== "markdown" && explicitFormat !== "json") {
      throw new Error("--format must be markdown or json.");
    }
    return explicitFormat;
  }
  return outputPath?.toLowerCase().endsWith(".json") ? "json" : "markdown";
}

export function defaultRiskHeatmapPath(workspace: string, format: RiskHeatmapFormat): string {
  return join(workspace, ".amc", "reports", `business-risk-heatmap.${format === "json" ? "json" : "md"}`);
}

export function writeRiskHeatmapReport(params: {
  workspace: string;
  input: RiskHeatmapInput;
  outputPath?: string;
  format?: string;
}): RiskHeatmapArtifact {
  const format = inferRiskHeatmapFormat(params.outputPath, params.format);
  const outputPath = params.outputPath ?? defaultRiskHeatmapPath(params.workspace, format);
  const heatmap = buildRiskHeatmap(params.input);
  const body = format === "json"
    ? `${JSON.stringify(heatmap, null, 2)}\n`
    : renderRiskHeatmapMarkdown(heatmap);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, body, "utf8");
  return {
    path: outputPath,
    format,
    heatmap
  };
}
