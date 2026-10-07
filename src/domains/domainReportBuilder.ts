import type { ComplianceGap, DomainAssessmentResult, DomainRoadmapItem } from "./domainAssessmentEngine.js";

export interface ExecutiveSummary {
  domain: string;
  level: DomainAssessmentResult["level"];
  certificationReadiness: boolean;
  baseScore: number;
  domainScore: number;
  compositeScore: number;
}

export interface ModuleActivationRow {
  moduleId: string;
  moduleName: string;
  relevance: "critical" | "high" | "medium" | "low";
  status: "active" | "inactive" | "partial";
  activationReason: string;
}

export interface ComplianceGapGroup {
  regulation: string;
  gaps: ComplianceGap[];
}

export interface DomainReport {
  generatedAt: string;
  executiveSummary: ExecutiveSummary;
  moduleActivationTable: ModuleActivationRow[];
  complianceGapAnalysis: ComplianceGapGroup[];
  roadmap: DomainRoadmapItem[];
  regulatoryWarnings: string[];
  markdown: string;
}

function groupGapsByRegulation(gaps: ComplianceGap[]): ComplianceGapGroup[] {
  const grouped = new Map<string, ComplianceGap[]>();
  for (const gap of gaps) {
    const existing = grouped.get(gap.regulatoryRef) ?? [];
    existing.push(gap);
    grouped.set(gap.regulatoryRef, existing);
  }
  return [...grouped.entries()]
    .map(([regulation, groupedGaps]) => ({
      regulation,
      gaps: groupedGaps.sort((a, b) => a.questionId.localeCompare(b.questionId))
    }))
    .sort((a, b) => a.regulation.localeCompare(b.regulation));
}

function moduleRows(result: DomainAssessmentResult): ModuleActivationRow[] {
  return result.activeModules.map((module) => ({
    moduleId: module.moduleId,
    moduleName: module.moduleName,
    relevance: module.relevance,
    status: module.currentStatus,
    activationReason: module.activationReason
  }));
}

function renderExecutiveSummary(summary: ExecutiveSummary): string {
  return [
    "## Executive Summary",
    `- Domain: ${summary.domain}`,
    `- Level: ${summary.level}`,
    `- Base Score: ${summary.baseScore}`,
    `- Domain Score: ${summary.domainScore}`,
    `- Composite Score: ${summary.compositeScore}`,
    ""
  ].join("\n");
}

function renderModuleActivationTable(rows: ModuleActivationRow[]): string {
  const lines = [
    "## Module Activation Table",
    "| Module ID | Module Name | Relevance | Status | Activation Reason |",
    "|---|---|---|---|---|"
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.moduleId} | ${row.moduleName} | ${row.relevance} | ${row.status} | ${row.activationReason.replace(/\|/g, "\\|")} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

function renderComplianceGaps(groups: ComplianceGapGroup[]): string {
  const lines: string[] = ["## Compliance Gap Analysis"];

  if (groups.length === 0) {
    lines.push("No compliance gaps identified for the current evidence set.", "");
    return lines.join("\n");
  }

  for (const group of groups) {
    lines.push(`### ${group.regulation}`);
    lines.push("| Question | Dimension | Current | Required | Remediation |", "|---|---|---|---|---|");
    for (const gap of group.gaps) {
      lines.push(
        `| ${gap.questionId} | ${gap.dimension} | L${gap.currentLevel} | L${gap.requiredLevel} | ${gap.remediation.replace(/\|/g, "\\|")} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderRoadmap(roadmap: DomainRoadmapItem[]): string {
  const lines: string[] = [
    "## 30/60/90-Day Roadmap",
    "| Priority | Timeframe | Action | Module | Regulatory Impact |",
    "|---|---|---|---|---|"
  ];

  for (const item of roadmap) {
    lines.push(
      `| ${item.priority} | ${item.timeframe} | ${item.action.replace(/\|/g, "\\|")} | ${item.moduleId ?? "-"} | ${item.regulatoryImpact.replace(/\|/g, "\\|")} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

function renderRegulatoryWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return ["## Regulatory Warnings", "None.", ""].join("\n");
  }

  return [
    "## Regulatory Warnings",
    ...warnings.map((warning) => `- ${warning}`),
    ""
  ].join("\n");
}

export function renderDomainReportMarkdown(result: DomainAssessmentResult): string {
  const summary: ExecutiveSummary = {
    domain: result.domainMetadata.name,
    level: result.level,
    certificationReadiness: result.certificationReadiness,
    baseScore: result.baseScore,
    domainScore: result.domainScore,
    compositeScore: result.compositeScore
  };

  const sections = [
    `# AMC Domain Report: ${result.domainMetadata.name}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    renderExecutiveSummary(summary),
    renderModuleActivationTable(moduleRows(result)),
    renderComplianceGaps(groupGapsByRegulation(result.complianceGaps)),
    renderRoadmap(result.roadmap),
    renderRegulatoryWarnings(result.regulatoryWarnings)
  ];

  return sections.join("\n");
}

/** The report for an assessment AMC could not evaluate: the reasons, no scores and no gap verdict. */
export function renderNotEvaluatedDomainReport(domainName: string, reasons: readonly string[]): string {
  return [
    `# AMC Domain Report: ${domainName}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Result: Not evaluated",
    ...reasons.map((reason) => `- ${reason}`),
    "",
    "Next step: run `amc quickscore` to evaluate the base part from observed evidence.",
    ""
  ].join("\n");
}

export function buildDomainReport(result: DomainAssessmentResult): DomainReport {
  return {
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      domain: result.domainMetadata.name,
      level: result.level,
      certificationReadiness: result.certificationReadiness,
      baseScore: result.baseScore,
      domainScore: result.domainScore,
      compositeScore: result.compositeScore
    },
    moduleActivationTable: moduleRows(result),
    complianceGapAnalysis: groupGapsByRegulation(result.complianceGaps),
    roadmap: [...result.roadmap],
    regulatoryWarnings: [...result.regulatoryWarnings],
    markdown: renderDomainReportMarkdown(result)
  };
}
