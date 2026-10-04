import type {
  CertificationOutcome,
  ComplianceGap,
  DomainAssessmentResult,
  DomainRoadmapItem,
  EuAIActClassification
} from "./domainAssessmentEngine.js";

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
  euAIActClassification: EuAIActClassification;
  certification: CertificationOutcome;
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

function renderExecutiveSummary(summary: ExecutiveSummary, certification: CertificationOutcome): string {
  return [
    "## Executive Summary",
    `- Domain: ${summary.domain}`,
    `- Level: ${summary.level}`,
    `- Certification Readiness: ${summary.certificationReadiness ? "yes" : "no"}`,
    `- Certification Threshold: composite ${certification.comparison} ${certification.threshold} and no critical control at L1`,
    `- Threshold Met: ${certification.meetsThreshold ? "yes" : "no"} (composite ${certification.compositeScore})`,
    `- Blocking Critical Gaps: ${certification.blockingGaps.length > 0 ? certification.blockingGaps.join(", ") : "none"}`,
    `- Base Score: ${summary.baseScore}`,
    `- Domain Score: ${summary.domainScore}`,
    `- Composite Score: ${summary.compositeScore}`,
    ""
  ].join("\n");
}

function renderEuAIActClassification(classification: EuAIActClassification): string {
  const lines = [
    "## EU AI Act Classification",
    `- Station category: ${classification.domainCategory}`,
    "",
    "| Pack | Classification | Annex III Points | General Purpose AI |",
    "|---|---|---|---|"
  ];
  for (const pack of classification.packs) {
    lines.push(
      `| ${pack.packId} | ${pack.classification.replace(/\|/g, "\\|")} | ${pack.annexIIIPoints.join(", ") || "-"} | ${pack.generalPurpose ? "yes" : "no"} |`
    );
  }
  const prohibited = classification.packs.filter((pack) => pack.prohibitedFlag).map((pack) => pack.packId);
  if (prohibited.length > 0) {
    lines.push("", `- Art. 5 prohibition flagged (check the use against Art. 5): ${prohibited.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
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

function executiveSummary(result: DomainAssessmentResult): ExecutiveSummary {
  return {
    domain: result.domainMetadata.name,
    level: result.level,
    certificationReadiness: result.certificationReadiness,
    baseScore: result.baseScore,
    domainScore: result.domainScore,
    compositeScore: result.compositeScore
  };
}

/** `now` (epoch ms) makes the rendered report deterministic; it defaults to the current time. */
export function renderDomainReportMarkdown(result: DomainAssessmentResult, now: number = Date.now()): string {
  const sections = [
    `# AMC Domain Report: ${result.domainMetadata.name}`,
    `Generated: ${new Date(now).toISOString()}`,
    "",
    renderExecutiveSummary(executiveSummary(result), result.certification),
    renderEuAIActClassification(result.euAIActClassification),
    renderModuleActivationTable(moduleRows(result)),
    renderComplianceGaps(groupGapsByRegulation(result.complianceGaps)),
    renderRoadmap(result.roadmap),
    renderRegulatoryWarnings(result.regulatoryWarnings)
  ];

  return sections.join("\n");
}

export function buildDomainReport(result: DomainAssessmentResult, now: number = Date.now()): DomainReport {
  return {
    generatedAt: new Date(now).toISOString(),
    executiveSummary: executiveSummary(result),
    moduleActivationTable: moduleRows(result),
    complianceGapAnalysis: groupGapsByRegulation(result.complianceGaps),
    roadmap: [...result.roadmap],
    regulatoryWarnings: [...result.regulatoryWarnings],
    euAIActClassification: result.euAIActClassification,
    certification: result.certification,
    markdown: renderDomainReportMarkdown(result, now)
  };
}
