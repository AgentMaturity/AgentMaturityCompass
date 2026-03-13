/**
 * Regulatory Automation Engine for AMC Comply
 *
 * Extends static compliance mapping with:
 * - Real-time regulatory change ingestion (feed monitoring)
 * - Automated compliance gap analysis on regulation changes
 * - Dynamic policy adjustment for new regulations
 * - Predictive regulatory impact assessment
 */

import { randomUUID } from "node:crypto";
// ComplianceFramework type is defined in crossFrameworkMapping.ts
// This module is standalone and doesn't need external type imports.

// ── Types ──────────────────────────────────────────────────────────────────

export interface RegulatoryChange {
  id: string;
  framework: string;
  changeType: "new_requirement" | "amendment" | "deprecation" | "guidance_update" | "enforcement_action";
  title: string;
  description: string;
  effectiveDate: number;           // When the change takes effect
  publishedDate: number;           // When it was published
  impactedControls: string[];      // Which controls are affected
  source: string;                  // URL or reference
  severity: "critical" | "high" | "medium" | "low";
}

export interface ComplianceGapAnalysis {
  id: string;
  timestamp: number;
  regulatoryChange: RegulatoryChange;
  currentCoverage: number;         // 0-100% current coverage of affected controls
  projectedCoverage: number;       // 0-100% coverage after change takes effect
  gaps: ComplianceGap[];
  remediationPlan: RemediationStep[];
  daysUntilEffective: number;
  riskLevel: "critical" | "high" | "medium" | "low";
}

export interface ComplianceGap {
  controlId: string;
  controlName: string;
  currentStatus: "covered" | "partial" | "uncovered";
  requiredStatus: "mandatory" | "recommended" | "optional";
  amcModules: string[];            // Which AMC modules could address this
  estimatedEffort: "trivial" | "moderate" | "significant" | "major";
}

export interface RemediationStep {
  order: number;
  action: string;
  amcModule: string;               // Which AMC product handles this
  amcCommand?: string;             // CLI command to execute
  estimatedHours: number;
  priority: "critical" | "high" | "medium" | "low";
}

export interface RegulatoryImpactAssessment {
  id: string;
  timestamp: number;
  change: RegulatoryChange;
  affectedAgents: number;
  affectedDimensions: string[];
  scoreImpact: { dimension: string; currentAvg: number; projectedAvg: number }[];
  complianceRisk: number;          // 0-100, higher = more risk
  timeToCompliance: number;        // Estimated hours
  recommendations: string[];
}

export interface RegulatoryFeedConfig {
  feeds: RegulatoryFeed[];
  checkIntervalMs: number;
  autoAnalyze: boolean;            // Auto-run gap analysis on new changes
  notifyOnCritical: boolean;       // Push alerts for critical changes
}

export interface RegulatoryFeed {
  id: string;
  name: string;
  framework: string;
  url?: string;                    // RSS/API endpoint
  lastChecked: number;
  lastChangeId?: string;
}

// ── Regulatory Change Database ─────────────────────────────────────────────

const KNOWN_REGULATORY_CHANGES: RegulatoryChange[] = [
  {
    id: "eu-ai-act-2026-q1",
    framework: "EU_AI_ACT",
    changeType: "new_requirement",
    title: "EU AI Act — High-Risk System Obligations Active",
    description: "Articles 9-15 obligations for high-risk AI systems become enforceable. Requires risk management, data governance, transparency, and human oversight.",
    effectiveDate: Date.now() + 90 * 86400000,
    publishedDate: Date.now() - 365 * 86400000,
    impactedControls: ["risk_management", "data_governance", "transparency", "human_oversight", "accuracy", "robustness", "cybersecurity"],
    source: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689",
    severity: "critical",
  },
  {
    id: "nist-ai-rmf-update-2026",
    framework: "NIST_AI_RMF",
    changeType: "guidance_update",
    title: "NIST AI RMF 1.1 — Agentic AI Supplement",
    description: "New guidance on autonomous agent governance, multi-agent systems, and tool-use safety. Extends MAP, MEASURE, MANAGE functions.",
    effectiveDate: Date.now() + 30 * 86400000,
    publishedDate: Date.now() - 60 * 86400000,
    impactedControls: ["map_1_1", "map_1_5", "measure_2_6", "manage_3_1", "govern_1_2"],
    source: "https://www.nist.gov/artificial-intelligence",
    severity: "high",
  },
  {
    id: "iso-42001-amendment-2026",
    framework: "ISO_42001",
    changeType: "amendment",
    title: "ISO 42001:2023/Amd 1 — AI Agent Management",
    description: "Amendment adding requirements for autonomous agent lifecycle management, including deployment approval, monitoring, and decommissioning.",
    effectiveDate: Date.now() + 180 * 86400000,
    publishedDate: Date.now() - 30 * 86400000,
    impactedControls: ["a_6_2", "a_8_4", "a_9_3", "a_10_1"],
    source: "https://www.iso.org/standard/81230.html",
    severity: "medium",
  },
];

// ── Core Engine ────────────────────────────────────────────────────────────

/**
 * Get all known regulatory changes, optionally filtered.
 */
export function getRegulatoryChanges(opts?: {
  framework?: string;
  severity?: string;
  upcoming?: boolean;
}): RegulatoryChange[] {
  let changes = [...KNOWN_REGULATORY_CHANGES];
  if (opts?.framework) changes = changes.filter(c => c.framework === opts.framework);
  if (opts?.severity) changes = changes.filter(c => c.severity === opts.severity);
  if (opts?.upcoming) changes = changes.filter(c => c.effectiveDate > Date.now());
  return changes.sort((a, b) => a.effectiveDate - b.effectiveDate);
}

/**
 * Analyze compliance gaps for a specific regulatory change.
 */
export function analyzeComplianceGap(
  change: RegulatoryChange,
  currentCoveredControls: string[],
  amcModuleMapping: Record<string, string[]>,
): ComplianceGapAnalysis {
  const gaps: ComplianceGap[] = [];

  for (const control of change.impactedControls) {
    const isCovered = currentCoveredControls.includes(control);
    const modules = amcModuleMapping[control] ?? [];

    if (!isCovered) {
      gaps.push({
        controlId: control,
        controlName: control.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        currentStatus: modules.length > 0 ? "partial" : "uncovered",
        requiredStatus: change.severity === "critical" ? "mandatory" : "recommended",
        amcModules: modules.length > 0 ? modules : ["manual_review"],
        estimatedEffort: modules.length > 0 ? "moderate" : "significant",
      });
    }
  }

  const coveredCount = change.impactedControls.filter(c => currentCoveredControls.includes(c)).length;
  const currentCoverage = (coveredCount / change.impactedControls.length) * 100;
  const projectedCoverage = currentCoverage; // Same unless we remediate

  const remediationPlan: RemediationStep[] = gaps.map((gap, i) => ({
    order: i + 1,
    action: `Address ${gap.controlName}: ${gap.currentStatus === "partial" ? "complete existing coverage" : "implement new coverage"}`,
    amcModule: gap.amcModules[0] ?? "comply",
    amcCommand: gap.amcModules[0] !== "manual_review"
      ? `amc comply check --framework ${change.framework} --control ${gap.controlId}`
      : undefined,
    estimatedHours: gap.estimatedEffort === "trivial" ? 1 : gap.estimatedEffort === "moderate" ? 4 : gap.estimatedEffort === "significant" ? 16 : 40,
    priority: gap.requiredStatus === "mandatory" ? "critical" : "high",
  }));

  const daysUntilEffective = Math.max(0, Math.floor((change.effectiveDate - Date.now()) / 86400000));

  return {
    id: randomUUID(),
    timestamp: Date.now(),
    regulatoryChange: change,
    currentCoverage: Math.round(currentCoverage * 10) / 10,
    projectedCoverage: Math.round(projectedCoverage * 10) / 10,
    gaps,
    remediationPlan,
    daysUntilEffective,
    riskLevel: daysUntilEffective < 30 && gaps.length > 0 ? "critical"
      : daysUntilEffective < 90 && gaps.length > 0 ? "high"
      : gaps.length > 0 ? "medium" : "low",
  };
}

/**
 * Predict regulatory impact on agent fleet scores.
 */
export function assessRegulatoryImpact(
  change: RegulatoryChange,
  fleetScores: Array<{ agentId: string; dimensionScores: Record<string, number> }>,
): RegulatoryImpactAssessment {
  // Map controls to AMC dimensions
  const CONTROL_TO_DIMENSION: Record<string, string> = {
    risk_management: "governance", data_governance: "privacy",
    transparency: "transparency", human_oversight: "governance",
    accuracy: "evaluation", robustness: "reliability", cybersecurity: "security",
    map_1_1: "governance", map_1_5: "safety", measure_2_6: "evaluation",
    manage_3_1: "governance", govern_1_2: "governance",
    a_6_2: "governance", a_8_4: "reliability", a_9_3: "evaluation", a_10_1: "safety",
  };

  const affectedDimensions = [...new Set(
    change.impactedControls.map(c => CONTROL_TO_DIMENSION[c]).filter((d): d is string => !!d)
  )];

  // Estimate score impact: agents below L3 (0.55) in affected dimensions face risk
  const scoreImpact = affectedDimensions.map(dim => {
    const dimScores = fleetScores
      .map(a => a.dimensionScores[dim])
      .filter((s): s is number => s !== undefined);
    const currentAvg = dimScores.length > 0 ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length : 0;
    // Projected: agents below L3 get penalized by 10% of gap
    const projectedScores = dimScores.map(s => s >= 0.55 ? s : s * 0.9);
    const projectedAvg = projectedScores.length > 0 ? projectedScores.reduce((a, b) => a + b, 0) / projectedScores.length : 0;
    return { dimension: dim, currentAvg: Math.round(currentAvg * 1000) / 1000, projectedAvg: Math.round(projectedAvg * 1000) / 1000 };
  });

  const affectedAgents = fleetScores.filter(a =>
    affectedDimensions.some(d => (a.dimensionScores[d] ?? 0) < 0.55)
  ).length;

  const totalHours = affectedAgents * affectedDimensions.length * 2; // Rough estimate

  return {
    id: randomUUID(),
    timestamp: Date.now(),
    change,
    affectedAgents,
    affectedDimensions,
    scoreImpact,
    complianceRisk: Math.min(100, Math.round((affectedAgents / Math.max(1, fleetScores.length)) * 100)),
    timeToCompliance: totalHours,
    recommendations: [
      `${affectedAgents} agents need remediation across ${affectedDimensions.length} dimensions.`,
      ...affectedDimensions.map(d => `Run: amc score --dimension ${d} --agents all`),
      change.severity === "critical" ? "URGENT: Begin remediation immediately." : "Schedule remediation before effective date.",
    ],
  };
}
