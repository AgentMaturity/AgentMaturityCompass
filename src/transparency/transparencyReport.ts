/**
 * AMC Agent Transparency Report
 *
 * Generates a structured, human-readable report answering:
 * "What does this AI agent do, what can it access, what decisions can it
 * make autonomously, and how trustworthy is it?"
 *
 * Think SBOM — but for agent BEHAVIOR, not software dependencies.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import { loadAgentConfig } from "../fleet/registry.js";
import type { MaturityBom } from "../bom/bomSchema.js";
import type { DiagnosticReport, LayerScore } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CertificationStatus = "certified" | "not-certified" | "pending";
export type AutonomyLevel = "supervised" | "semi-autonomous" | "autonomous";
export type RiskSeverity = "critical" | "high" | "medium";

export interface AgentTransparencyReport {
  version: "1.0";
  generatedAt: string;
  agentId: string;
  agentName: string;
  role: string;
  domain: string;

  /** Identity: who/what is this agent */
  identity: {
    framework: string;
    riskTier: string;
    maturityLevel: number;
    maturityLabel: string;
    trustScore: number;
    certificationStatus: CertificationStatus;
    lastAssessed: string;
  };

  /** Capabilities: what can this agent DO */
  capabilities: {
    tools: string[];
    autonomyLevel: AutonomyLevel;
    canTakeIrreversibleActions: boolean;
    actionClasses: string[];
    maxBudgetUsd: number | null;
  };

  /** Data Access: what data can this agent SEE/USE */
  dataAccess: {
    inputTypes: string[];
    outputTypes: string[];
    retainsPII: boolean | null;
    dataRetentionDays: number | null;
    crossesBorder: boolean | null;
  };

  /** Trust Evidence: cryptographic proof of assessment */
  trustEvidence: {
    latestRunId: string;
    reportSha256: string;
    integrityIndex: number;
    assurancePacksCovered: number;
    assurancePacksPassed: number;
    merkleRootHash: string | null;
  };

  /** Dimension Scores: L1-L5 per AMC dimension */
  dimensions: Array<{
    name: string;
    level: number;
    label: string;
    confidenceWeighted: number;
  }>;

  /** Compliance: regulatory framework gaps */
  compliance: {
    frameworks: string[];
    criticalGaps: number;
    highGaps: number;
  };

  /** Top identified risks */
  risks: Array<{
    severity: RiskSeverity;
    description: string;
    dimension: string;
  }>;

  /** Top improvement priorities */
  topPriorities: Array<{
    action: string;
    impact: string;
    command: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MATURITY_LABELS: Record<number, string> = {
  1: "L1 — Initial",
  2: "L2 — Developing",
  3: "L3 — Defined",
  4: "L4 — Managed",
  5: "L5 — Optimizing",
};

const IRREVERSIBLE_ACTION_CLASSES = new Set([
  "delete",
  "write",
  "execution",
  "network",
  "filesystem",
  "external",
]);

const AUTONOMOUS_ACTION_CLASSES = new Set([
  "filesystem",
  "network",
  "execution",
  "external",
]);

function deriveAutonomyLevel(actionClasses: string[]): AutonomyLevel {
  const cls = new Set(actionClasses.map((c) => c.toLowerCase()));
  if ([...AUTONOMOUS_ACTION_CLASSES].some((a) => cls.has(a))) {
    return "autonomous";
  }
  if (cls.size === 0 || (cls.size === 1 && cls.has("readonly"))) {
    return "supervised";
  }
  return "semi-autonomous";
}

function canTakeIrreversible(actionClasses: string[]): boolean {
  const cls = new Set(actionClasses.map((c) => c.toLowerCase()));
  return [...IRREVERSIBLE_ACTION_CLASSES].some((a) => cls.has(a));
}

function levelLabel(level: number): string {
  return MATURITY_LABELS[Math.round(level)] ?? `L${Math.round(level)}`;
}

function overallLevel(layerScores: LayerScore[]): number {
  if (layerScores.length === 0) return 1;
  const avg =
    layerScores.reduce((s, r) => s + r.avgFinalLevel, 0) / layerScores.length;
  return Math.max(1, Math.min(5, avg));
}

function trustScoreFrom(level: number): number {
  // Convert L1-L5 to 0-100
  return Math.round(((level - 1) / 4) * 100);
}

/** Returns null if no data exists OR data is unreadable. Caller treats both as "no data available". */
function loadLatestBom(
  workspace: string,
  agentId: string
): MaturityBom | null {
  try {
    const paths = getAgentPaths(workspace, agentId);
    const bomDir = join(paths.rootDir, "bom");
    if (!existsSync(bomDir)) return null;
    const files = readdirSync(bomDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    return JSON.parse(readFileSync(join(bomDir, files[0]!), "utf8")) as MaturityBom;
  } catch (err) {
    // Data unavailable — return null to indicate missing (not corrupt)
    return null;
  }
}

/** Returns null if no data exists OR data is unreadable. Caller treats both as "no data available". */
function loadLatestRun(
  workspace: string,
  agentId: string
): DiagnosticReport | null {
  try {
    const paths = getAgentPaths(workspace, agentId);
    if (!existsSync(paths.runsDir)) return null;
    const files = readdirSync(paths.runsDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    return JSON.parse(
      readFileSync(join(paths.runsDir, files[0]!), "utf8")
    ) as DiagnosticReport;
  } catch (err) {
    // Data unavailable — return null to indicate missing (not corrupt)
    return null;
  }
}

/** Returns null if no data exists OR data is unreadable. Caller treats both as "no data available". */
function loadMerkleRoot(workspace: string, agentId: string): string | null {
  try {
    const paths = getAgentPaths(workspace, agentId);
    const merkleFile = join(paths.rootDir, "merkle", "root.json");
    if (!existsSync(merkleFile)) return null;
    const data = JSON.parse(readFileSync(merkleFile, "utf8")) as {
      root?: string;
    };
    return data.root ?? null;
  } catch (err) {
    // Data unavailable — return null to indicate missing (not corrupt)
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core Generator
// ---------------------------------------------------------------------------

export function generateTransparencyReport(
  agentId: string,
  workspace: string
): AgentTransparencyReport {
  const config = loadAgentConfig(workspace, agentId);
  const bom = loadLatestBom(workspace, agentId);
  const run = loadLatestRun(workspace, agentId);
  const merkleRoot = loadMerkleRoot(workspace, agentId);
  const now = new Date().toISOString();

  // ---------- identity ----------
  const layerScores: LayerScore[] = run?.layerScores ?? (bom?.layerScores ?? []).map((ls) => ({
    layerName: ls.layerName,
    avgFinalLevel: ls.avgFinalLevel,
    confidenceWeightedFinalLevel: ls.confidenceWeightedFinalLevel,
    questionCount: 0,
    weights: [] as number[],
  } as LayerScore));

  const level = overallLevel(layerScores);
  const trustScore = trustScoreFrom(level);
  const integrityIndex = run?.integrityIndex ?? bom?.integrityIndex ?? 0;
  const certificationStatus: CertificationStatus =
    integrityIndex >= 0.9 && level >= 4
      ? "certified"
      : integrityIndex >= 0.6 || level >= 2
      ? "pending"
      : "not-certified";

  // ---------- capabilities ----------
  // Action classes come from freeze engine data embedded in BOM
  const actionClasses = bom?.activeFreezeActionClasses ?? [];
  const autonomyLevel = deriveAutonomyLevel(actionClasses);

  // ---------- dimensions ----------
  const dimensions = layerScores.map((ls) => ({
    name: ls.layerName,
    level: Math.round(ls.avgFinalLevel * 10) / 10,
    label: levelLabel(ls.avgFinalLevel),
    confidenceWeighted:
      Math.round(ls.confidenceWeightedFinalLevel * 10) / 10,
  }));

  // ---------- trust evidence ----------
  const runId = run?.runId ?? bom?.runId ?? "unknown";
  const sha256 = run?.reportJsonSha256 ?? bom?.reportSha256 ?? "";
  const assuranceScores = bom?.assurancePackScores ?? {};
  const packsCovered = Object.keys(assuranceScores).length;
  const packsPassed = Object.values(assuranceScores).filter(
    (s) => (s as number) >= 70
  ).length;

  // ---------- risks ----------
  const risks: AgentTransparencyReport["risks"] = [];
  if (run) {
    if (run.unsupportedClaimCount > 0) {
      risks.push({
        severity: run.unsupportedClaimCount > 5 ? "critical" : "high",
        description: `${run.unsupportedClaimCount} unsupported claims detected — agent asserts capabilities without evidence`,
        dimension: "Evidence & Auditability",
      });
    }
    if (run.contradictionCount > 0) {
      risks.push({
        severity: "high",
        description: `${run.contradictionCount} contradictions in evidence chain`,
        dimension: "Evidence & Auditability",
      });
    }
    if (run.trustBoundaryViolated) {
      risks.push({
        severity: "critical",
        description: run.trustBoundaryMessage ?? "Trust boundary violation detected",
        dimension: "Security & Isolation",
      });
    }
    if (integrityIndex < 0.5) {
      risks.push({
        severity: "critical",
        description: `Low integrity index (${(integrityIndex * 100).toFixed(0)}%) — evidence chain unreliable`,
        dimension: "Evidence & Auditability",
      });
    }
    if (level < 2) {
      risks.push({
        severity: "high",
        description: "Agent operating at L1 — minimal governance controls in place",
        dimension: "All Dimensions",
      });
    }
  }

  // ---------- top priorities ----------
  const topPriorities: AgentTransparencyReport["topPriorities"] = [];
  const weakDimensions = dimensions
    .filter((d) => d.level < 3)
    .sort((a, b) => a.level - b.level)
    .slice(0, 3);
  for (const dim of weakDimensions) {
    topPriorities.push({
      action: `Improve ${dim.name} from ${dim.label} to L3`,
      impact: `Raises overall trust score by ~${Math.round((3 - dim.level) * 15)} points`,
      command: `amc guide --agent ${agentId}`,
    });
  }
  if (topPriorities.length === 0) {
    topPriorities.push({
      action: "Run full assurance suite to validate scores",
      impact: "Generates cryptographic evidence chain for all dimensions",
      command: `amc assurance run --agent ${agentId}`,
    });
  }

  return {
    version: "1.0",
    generatedAt: now,
    agentId: config.id,
    agentName: config.agentName,
    role: config.role,
    domain: config.domain,

    identity: {
      framework: config.provider?.templateId ?? "unknown",
      riskTier: config.riskTier,
      maturityLevel: Math.round(level * 10) / 10,
      maturityLabel: levelLabel(level),
      trustScore,
      certificationStatus,
      lastAssessed: run
        ? new Date(run.ts).toISOString()
        : bom
        ? new Date(bom.generatedTs).toISOString()
        : "never",
    },

    capabilities: {
      tools: config.primaryTasks ?? [],
      autonomyLevel,
      canTakeIrreversibleActions: canTakeIrreversible(actionClasses),
      actionClasses,
      maxBudgetUsd: null,
    },

    dataAccess: {
      inputTypes: [],
      outputTypes: [],
      retainsPII: null,
      dataRetentionDays: null,
      crossesBorder: null,
    },

    trustEvidence: {
      latestRunId: runId,
      reportSha256: sha256,
      integrityIndex,
      assurancePacksCovered: packsCovered,
      assurancePacksPassed: packsPassed,
      merkleRootHash: merkleRoot,
    },

    dimensions,

    compliance: {
      frameworks: [],
      criticalGaps: 0,
      highGaps: 0,
    },

    risks,

    topPriorities,
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

const RISK_ICONS: Record<RiskSeverity, string> = {
  critical: "🔴",
  high: "🟡",
  medium: "🔵",
};

const AUTONOMY_ICONS: Record<AutonomyLevel, string> = {
  supervised: "👁️  Supervised",
  "semi-autonomous": "⚙️  Semi-Autonomous",
  autonomous: "🤖 Autonomous",
};

const CERT_ICONS: Record<CertificationStatus, string> = {
  certified: "✅ Certified",
  pending: "⏳ Pending",
  "not-certified": "❌ Not Certified",
};

export function renderTransparencyReportMarkdown(
  report: AgentTransparencyReport
): string {
  const lines: string[] = [];

  lines.push(`# Agent Transparency Report`);
  lines.push(`> Generated by AMC (Agent Maturity Compass) · ${report.generatedAt}`);
  lines.push("");

  // Header card
  lines.push(`## ${report.agentName}`);
  lines.push(`**Role:** ${report.role}  `);
  lines.push(`**Domain:** ${report.domain}  `);
  lines.push(`**Agent ID:** \`${report.agentId}\``);
  lines.push("");

  // Trust summary
  lines.push(`---`);
  lines.push("");
  lines.push(`## 🏆 Trust Summary`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Maturity Level | **${report.identity.maturityLabel}** |`);
  lines.push(`| Trust Score | **${report.identity.trustScore}/100** |`);
  lines.push(`| Certification | ${CERT_ICONS[report.identity.certificationStatus]} |`);
  lines.push(`| Risk Tier | ${report.identity.riskTier.toUpperCase()} |`);
  lines.push(`| Framework | ${report.identity.framework} |`);
  lines.push(`| Last Assessed | ${report.identity.lastAssessed} |`);
  lines.push("");

  // Dimensions
  lines.push(`## 📊 Dimension Scores`);
  lines.push("");
  lines.push(`| Dimension | Level | Label | Confidence-Weighted |`);
  lines.push(`|-----------|-------|-------|---------------------|`);
  for (const d of report.dimensions) {
    const bar = "█".repeat(Math.round(d.level)) + "░".repeat(5 - Math.round(d.level));
    lines.push(
      `| ${d.name} | ${d.level} | ${d.label} | ${d.confidenceWeighted} |`
    );
  }
  lines.push("");

  // Capabilities
  lines.push(`## ⚙️ Capabilities`);
  lines.push("");
  lines.push(`**Autonomy Level:** ${AUTONOMY_ICONS[report.capabilities.autonomyLevel]}`);
  lines.push(`**Can Take Irreversible Actions:** ${report.capabilities.canTakeIrreversibleActions ? "⚠️ Yes" : "✅ No"}`);
  if (report.capabilities.actionClasses.length > 0) {
    lines.push(`**Action Classes:** ${report.capabilities.actionClasses.map((c) => `\`${c}\``).join(", ")}`);
  }
  if (report.capabilities.maxBudgetUsd !== null) {
    lines.push(`**Max Budget:** $${report.capabilities.maxBudgetUsd}`);
  }
  if (report.capabilities.tools.length > 0) {
    lines.push("");
    lines.push(`**Primary Tasks:**`);
    for (const t of report.capabilities.tools) {
      lines.push(`- ${t}`);
    }
  }
  lines.push("");

  // Trust evidence
  lines.push(`## 🔐 Trust Evidence`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Run ID | \`${report.trustEvidence.latestRunId}\` |`);
  lines.push(`| Integrity Index | ${(report.trustEvidence.integrityIndex * 100).toFixed(0)}% |`);
  lines.push(`| Assurance Packs Covered | ${report.trustEvidence.assurancePacksCovered} |`);
  lines.push(`| Assurance Packs Passed | ${report.trustEvidence.assurancePacksPassed} |`);
  if (report.trustEvidence.reportSha256) {
    lines.push(`| Report SHA-256 | \`${report.trustEvidence.reportSha256.slice(0, 16)}…\` |`);
  }
  if (report.trustEvidence.merkleRootHash) {
    lines.push(`| Merkle Root | \`${report.trustEvidence.merkleRootHash.slice(0, 16)}…\` |`);
  }
  lines.push("");

  // Risks
  if (report.risks.length > 0) {
    lines.push(`## ⚠️ Identified Risks`);
    lines.push("");
    for (const risk of report.risks) {
      lines.push(
        `${RISK_ICONS[risk.severity]} **[${risk.severity.toUpperCase()}]** ${risk.description}  `
      );
      lines.push(`  *Dimension: ${risk.dimension}*`);
      lines.push("");
    }
  }

  // Top priorities
  if (report.topPriorities.length > 0) {
    lines.push(`## 🎯 Top Improvement Priorities`);
    lines.push("");
    report.topPriorities.forEach((p, i) => {
      lines.push(`**${i + 1}. ${p.action}**`);
      lines.push(`> ${p.impact}`);
      lines.push(`\`\`\`bash`);
      lines.push(p.command);
      lines.push(`\`\`\``);
      lines.push("");
    });
  }

  // Footer
  lines.push(`---`);
  lines.push(`*AMC Agent Transparency Report v${report.version} · [Agent Maturity Compass](https://AgentMaturity.github.io/AgentMaturityCompass/)*`);
  lines.push("");

  return lines.join("\n");
}

export function renderTransparencyReportJson(
  report: AgentTransparencyReport
): string {
  return JSON.stringify(report, null, 2);
}
