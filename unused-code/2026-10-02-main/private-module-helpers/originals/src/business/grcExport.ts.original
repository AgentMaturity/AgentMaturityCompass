import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  buildRiskHeatmap,
  type RiskHeatmapAgent,
  type RiskHeatmapInput,
  type RiskHeatmapResult,
  type RiskHeatmapSeverity
} from "./riskHeatmap.js";
import { formatRiskCurrency } from "./riskQuantification.js";

export { parseRiskHeatmapPortfolioJson } from "./riskHeatmap.js";

export type GrcTreatmentPlanFormat = "csv" | "json" | "markdown";
export type GrcTreatmentStrategy = "MITIGATE" | "MONITOR" | "ACCEPT";
export type GrcTreatmentPriority = "P1" | "P2" | "P3";
export type GrcRiskAppetiteStatus = "BELOW" | "AT" | "ABOVE" | "UNSET";

export type GrcTreatmentPlanRow = {
  riskId: string;
  agentId: string;
  businessUnit: string;
  controlOwner: string;
  maturityLevel: number;
  severity: RiskHeatmapSeverity;
  priority: GrcTreatmentPriority;
  status: "OPEN";
  riskAppetiteStatus: GrcRiskAppetiteStatus;
  riskAppetiteLimit: number | null;
  baselineExpectedAnnualLoss: number;
  residualExpectedAnnualLoss: number;
  expectedAnnualLossReduction: number;
  fairLossEventFrequencyPerYear: number;
  fairLossMagnitude: number;
  annualizedLossExposure: number;
  treatmentStrategy: GrcTreatmentStrategy;
  treatmentPlan: string;
  treatmentDueDate: string;
  iso31000TreatmentContext: "Risk treatment";
  acceptanceCriteria: string[];
  recommendedActions: string[];
  sourceEvidence: string[];
};

export type GrcTreatmentPlanExport = {
  schemaVersion: 1;
  title: string;
  generatedAt: string;
  currency: string;
  model: {
    name: string;
    formula: string;
    caveat: string;
    externalReferences: Array<{ title: string; url: string; note: string }>;
  };
  summary: {
    agentCount: number;
    openTreatmentCount: number;
    mitigateCount: number;
    monitorCount: number;
    acceptCount: number;
    aboveRiskAppetiteCount: number;
    lowConfidenceCount: number;
    highestSeverity: RiskHeatmapSeverity;
  };
  rows: GrcTreatmentPlanRow[];
  assumptions: string[];
  heatmap: RiskHeatmapResult;
};

export type GrcTreatmentPlanArtifact = {
  path: string;
  format: GrcTreatmentPlanFormat;
  export: GrcTreatmentPlanExport;
};

const EXTERNAL_REFERENCES = [
  {
    title: "ISO 31000:2018",
    url: "https://www.iso.org/standard/65694.html",
    note: "Current ISO risk-management guideline page checked on 2026-06-16; frames risk identification, analysis, evaluation, treatment, monitoring, and communication."
  },
  {
    title: "FAIR Institute - What is FAIR?",
    url: "https://www.fairinstitute.org/what-is-fair",
    note: "Checked on 2026-06-16; describes FAIR as financial quantification for cyber and operational risk."
  }
] as const;

const SEVERITY_RANK: Record<RiskHeatmapSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

function addDaysIsoDate(isoDateTime: string, days: number): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    throw new Error("generatedAt must be a valid ISO date when computing treatment due dates.");
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compactRiskId(agentId: string, index: number): string {
  const slug = agentId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "AGENT";
  return `AMC-RISK-${String(index + 1).padStart(3, "0")}-${slug}`;
}

function plainCurrency(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
}

function strategyFor(agent: RiskHeatmapAgent): GrcTreatmentStrategy {
  if (
    agent.riskAppetiteStatus?.status === "ABOVE" ||
    agent.maturityLevel < 3 ||
    SEVERITY_RANK[agent.severity] >= SEVERITY_RANK.HIGH
  ) {
    return "MITIGATE";
  }
  if (agent.riskAppetiteStatus?.status === "AT" || agent.severity === "MEDIUM" || agent.confidence === "LOW") {
    return "MONITOR";
  }
  return "ACCEPT";
}

function priorityFor(agent: RiskHeatmapAgent, strategy: GrcTreatmentStrategy): GrcTreatmentPriority {
  if (agent.riskAppetiteStatus?.status === "ABOVE" || agent.severity === "CRITICAL") {
    return "P1";
  }
  if (strategy === "MITIGATE" || agent.severity === "HIGH") {
    return "P2";
  }
  return "P3";
}

function treatmentPlanFor(agent: RiskHeatmapAgent, strategy: GrcTreatmentStrategy): string {
  if (strategy === "MITIGATE") {
    return "Reduce autonomy or exposure, add missing evidence controls, assign closure evidence, and re-score before expanding use.";
  }
  if (strategy === "MONITOR") {
    return "Monitor control effectiveness, calibrate assumptions, and review residual loss against appetite in the next governance cycle.";
  }
  return "Document risk acceptance, retain evidence, and review after material model, workflow, or exposure changes.";
}

function recommendedActionsFor(agent: RiskHeatmapAgent): string[] {
  const actions = [...agent.recommendations];
  if (agent.riskAppetiteStatus?.status === "ABOVE") {
    actions.push("Residual expected annual loss is above risk appetite; open mitigation before expanding autonomy.");
  }
  if (agent.confidence === "LOW") {
    actions.push("Calibrate FAIR-style loss event frequency and loss magnitude with incident, audit, claims, and finance data.");
  }
  if (agent.maturityLevel < 3) {
    actions.push("Raise the agent to evidence-backed L3 before accepting residual risk.");
  }
  if (SEVERITY_RANK[agent.severity] >= SEVERITY_RANK.HIGH) {
    actions.push("Validate the high-severity row with the accountable business owner and compliance lead.");
  }
  return Array.from(new Set(actions));
}

function acceptanceCriteriaFor(agent: RiskHeatmapAgent, currency: string): string[] {
  const criteria = [
    "Control owner approves residual risk or attaches closure evidence.",
    "Updated AMC score, evidence coverage, and risk inputs are retained with the register row."
  ];
  if (agent.riskAppetiteStatus) {
    criteria.unshift(`Residual expected annual loss at or below ${plainCurrency(agent.riskAppetiteStatus.annualLossLimit, currency)}.`);
  } else {
    criteria.unshift("Risk appetite threshold is defined and reviewed by the accountable owner.");
  }
  if (agent.confidence === "LOW") {
    criteria.push("Default frequency and loss-magnitude assumptions are replaced with organization-specific data.");
  }
  return criteria;
}

function appetiteStatus(agent: RiskHeatmapAgent): GrcRiskAppetiteStatus {
  return agent.riskAppetiteStatus?.status ?? "UNSET";
}

function buildRow(
  agent: RiskHeatmapAgent,
  index: number,
  heatmap: RiskHeatmapResult,
  treatmentDueDays: number
): GrcTreatmentPlanRow {
  const strategy = strategyFor(agent);
  return {
    riskId: compactRiskId(agent.agentId, index),
    agentId: agent.agentId,
    businessUnit: agent.businessUnit ?? "Unassigned",
    controlOwner: agent.owner ?? "Unassigned",
    maturityLevel: agent.maturityLevel,
    severity: agent.severity,
    priority: priorityFor(agent, strategy),
    status: "OPEN",
    riskAppetiteStatus: appetiteStatus(agent),
    riskAppetiteLimit: agent.riskAppetiteStatus?.annualLossLimit ?? null,
    baselineExpectedAnnualLoss: agent.baselineExpectedAnnualLoss,
    residualExpectedAnnualLoss: agent.residualExpectedAnnualLoss,
    expectedAnnualLossReduction: agent.expectedAnnualLossReduction,
    fairLossEventFrequencyPerYear: agent.residualAnnualIncidentFrequency,
    fairLossMagnitude: agent.averageIncidentCost,
    annualizedLossExposure: agent.residualExpectedAnnualLoss,
    treatmentStrategy: strategy,
    treatmentPlan: treatmentPlanFor(agent, strategy),
    treatmentDueDate: addDaysIsoDate(heatmap.generatedAt, treatmentDueDays),
    iso31000TreatmentContext: "Risk treatment",
    acceptanceCriteria: acceptanceCriteriaFor(agent, heatmap.currency),
    recommendedActions: recommendedActionsFor(agent),
    sourceEvidence: [
      ...heatmap.model.sources.map((source) => source.url),
      ...EXTERNAL_REFERENCES.map((source) => source.url)
    ]
  };
}

export function buildGrcTreatmentPlanExport(
  input: RiskHeatmapInput,
  options: { title?: string; treatmentDueDays?: number } = {}
): GrcTreatmentPlanExport {
  const treatmentDueDays = options.treatmentDueDays ?? 30;
  if (!Number.isInteger(treatmentDueDays) || treatmentDueDays < 1) {
    throw new Error("treatmentDueDays must be a positive integer.");
  }

  const heatmap = buildRiskHeatmap({
    ...input,
    title: options.title ?? input.title ?? "AI Agent GRC Treatment Plan"
  });
  const rows = heatmap.agents.map((agent, index) => buildRow(agent, index, heatmap, treatmentDueDays));

  return {
    schemaVersion: 1,
    title: heatmap.title,
    generatedAt: heatmap.generatedAt,
    currency: heatmap.currency,
    model: {
      name: "AMC GRC treatment-plan export",
      formula: "Rows reuse AMC portfolio expected annual loss; FAIR-style fields expose residual event frequency, loss magnitude, and annualized loss exposure for GRC import mapping.",
      caveat: "CSV, JSON, and Markdown are GRC-ready exchange formats, not certified RSA Archer, ServiceNow GRC, or Open FAIR implementations. Map columns to your system of record and calibrate losses before board or insurance use.",
      externalReferences: EXTERNAL_REFERENCES.map((source) => ({ ...source }))
    },
    summary: {
      agentCount: rows.length,
      openTreatmentCount: rows.filter((row) => row.status === "OPEN").length,
      mitigateCount: rows.filter((row) => row.treatmentStrategy === "MITIGATE").length,
      monitorCount: rows.filter((row) => row.treatmentStrategy === "MONITOR").length,
      acceptCount: rows.filter((row) => row.treatmentStrategy === "ACCEPT").length,
      aboveRiskAppetiteCount: heatmap.summary.aboveRiskAppetiteCount,
      lowConfidenceCount: heatmap.summary.lowConfidenceCount,
      highestSeverity: heatmap.summary.highestSeverity
    },
    rows,
    assumptions: [
      "Treatment rows are generated from AMC maturity-linked residual expected annual loss, not from a calibrated actuarial distribution.",
      "FAIR-style fields are included for loss-frequency and loss-magnitude mapping; AMC does not claim full Open FAIR certification.",
      "ISO 31000 alignment is limited to risk-register and treatment-plan terminology for identification, evaluation, treatment, monitoring, and reporting.",
      "CSV columns are intentionally simple so teams can map them into their GRC system of record."
    ],
    heatmap
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function joinList(values: string[]): string {
  return values.join("; ");
}

export function renderGrcTreatmentPlanMarkdown(grc: GrcTreatmentPlanExport): string {
  const lines = [
    `# ${escapeMarkdown(grc.title)}`,
    "",
    `Generated: ${grc.generatedAt}`,
    `Currency: ${grc.currency}`,
    "",
    "## Summary",
    "",
    `- Agents: ${grc.summary.agentCount}`,
    `- Open treatments: ${grc.summary.openTreatmentCount}`,
    `- Mitigate: ${grc.summary.mitigateCount}`,
    `- Monitor: ${grc.summary.monitorCount}`,
    `- Accept: ${grc.summary.acceptCount}`,
    `- Above risk appetite: ${grc.summary.aboveRiskAppetiteCount}`,
    `- Low-confidence rows: ${grc.summary.lowConfidenceCount}`,
    `- Highest severity: ${grc.summary.highestSeverity}`,
    "",
    "## GRC Treatment Plan",
    "",
    "| Risk ID | Agent | Business unit | Control owner | Maturity | Severity | Appetite | FAIR-style fields | Strategy | Due date | Acceptance criteria |",
    "|---|---|---|---|---:|---|---|---|---|---|---|"
  ];

  for (const row of grc.rows) {
    const appetite = row.riskAppetiteLimit === null
      ? row.riskAppetiteStatus
      : `${row.riskAppetiteStatus} (${formatRiskCurrency(row.riskAppetiteLimit, grc.currency)})`;
    const fairFields = [
      `frequency ${row.fairLossEventFrequencyPerYear.toFixed(2)}/year`,
      `magnitude ${formatRiskCurrency(row.fairLossMagnitude, grc.currency)}`,
      `ALE ${formatRiskCurrency(row.annualizedLossExposure, grc.currency)}`
    ].join("; ");
    lines.push([
      row.riskId,
      row.agentId,
      row.businessUnit,
      row.controlOwner,
      row.maturityLevel.toFixed(2),
      row.severity,
      appetite,
      fairFields,
      row.treatmentStrategy,
      row.treatmentDueDate,
      joinList(row.acceptanceCriteria)
    ].map(escapeMarkdown).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push(
    "",
    "## Assumptions",
    "",
    ...grc.assumptions.map((assumption) => `- ${assumption}`),
    "",
    "## Sources Checked",
    "",
    ...grc.model.externalReferences.map((source) => `- ${source.title}: ${source.url} - ${source.note}`),
    "",
    grc.model.caveat,
    ""
  );

  return lines.join("\n");
}

function csvEscape(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function renderGrcTreatmentPlanCsv(grc: GrcTreatmentPlanExport): string {
  const headers = [
    "risk_id",
    "agent_id",
    "business_unit",
    "control_owner",
    "maturity_level",
    "severity",
    "priority",
    "status",
    "risk_appetite_status",
    "risk_appetite_limit",
    "baseline_expected_annual_loss",
    "residual_expected_annual_loss",
    "expected_annual_loss_reduction",
    "fair_loss_event_frequency_per_year",
    "fair_loss_magnitude",
    "annualized_loss_exposure",
    "treatment_strategy",
    "treatment_due_date",
    "iso31000_treatment_context",
    "treatment_plan",
    "acceptance_criteria",
    "recommended_actions",
    "source_evidence"
  ];
  const rows = grc.rows.map((row) => [
    row.riskId,
    row.agentId,
    row.businessUnit,
    row.controlOwner,
    row.maturityLevel,
    row.severity,
    row.priority,
    row.status,
    row.riskAppetiteStatus,
    row.riskAppetiteLimit,
    row.baselineExpectedAnnualLoss,
    row.residualExpectedAnnualLoss,
    row.expectedAnnualLossReduction,
    row.fairLossEventFrequencyPerYear,
    row.fairLossMagnitude,
    row.annualizedLossExposure,
    row.treatmentStrategy,
    row.treatmentDueDate,
    row.iso31000TreatmentContext,
    row.treatmentPlan,
    joinList(row.acceptanceCriteria),
    joinList(row.recommendedActions),
    joinList(row.sourceEvidence)
  ]);
  return [
    headers.join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n") + "\n";
}

export function inferGrcTreatmentPlanFormat(outputPath: string | undefined, explicitFormat?: string): GrcTreatmentPlanFormat {
  if (explicitFormat !== undefined) {
    if (explicitFormat !== "csv" && explicitFormat !== "json" && explicitFormat !== "markdown") {
      throw new Error("--format must be csv, json, or markdown.");
    }
    return explicitFormat;
  }
  const lower = outputPath?.toLowerCase();
  if (lower?.endsWith(".json")) return "json";
  if (lower?.endsWith(".md") || lower?.endsWith(".markdown")) return "markdown";
  return "csv";
}

export function defaultGrcTreatmentPlanPath(workspace: string, format: GrcTreatmentPlanFormat): string {
  const extension = format === "json" ? "json" : format === "markdown" ? "md" : "csv";
  return join(workspace, ".amc", "reports", `grc-treatment-plan.${extension}`);
}

export function writeGrcTreatmentPlanExport(params: {
  workspace: string;
  input: RiskHeatmapInput;
  outputPath?: string;
  format?: string;
  title?: string;
  treatmentDueDays?: number;
}): GrcTreatmentPlanArtifact {
  const format = inferGrcTreatmentPlanFormat(params.outputPath, params.format);
  const outputPath = params.outputPath ?? defaultGrcTreatmentPlanPath(params.workspace, format);
  const grc = buildGrcTreatmentPlanExport(params.input, {
    title: params.title,
    treatmentDueDays: params.treatmentDueDays
  });
  const body = format === "json"
    ? `${JSON.stringify(grc, null, 2)}\n`
    : format === "markdown"
      ? renderGrcTreatmentPlanMarkdown(grc)
      : renderGrcTreatmentPlanCsv(grc);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, body, "utf8");
  return {
    path: outputPath,
    format,
    export: grc
  };
}
