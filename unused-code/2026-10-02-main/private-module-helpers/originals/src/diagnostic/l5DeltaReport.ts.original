/**
 * L4→L5 Delta Report — shows exactly what separates current state from L5.
 *
 * For each diagnostic question, outputs:
 * - Current level vs target (L5)
 * - What's missing to reach L5
 * - What evidence would be needed
 * - Which controls are synthetic vs architectural
 */

import { join, dirname } from "node:path";
import { questionBank } from "./questionBank.js";
import { classifyControls, type ControlEnforcementLevel } from "./controlClassification.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { readdirSync } from "node:fs";
import type { DiagnosticReport, QuestionScore } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface L5DeltaItem {
  questionId: string;
  questionTitle: string;
  layerName: string;
  currentLevel: number;
  targetLevel: 5;
  gap: number;
  missingCapabilities: string[];
  requiredEvidence: string[];
  controlEnforcement: {
    subControlId: string;
    label: string;
    level: ControlEnforcementLevel;
  }[];
  dominantEnforcement: ControlEnforcementLevel;
  confidence: number;
  flags: string[];
}

export interface L5DeltaReport {
  agentId: string;
  generatedTs: number;
  runId: string | null;
  items: L5DeltaItem[];
  summary: {
    questionsAtL5: number;
    questionsBelow: number;
    avgGap: number;
    architecturalCount: number;
    policyEnforcedCount: number;
    conventionCount: number;
  };
}

// ---------------------------------------------------------------------------
// L5 requirements per question (what's needed beyond L4)
// ---------------------------------------------------------------------------

const L5_REQUIREMENTS: Record<string, { missing: string[]; evidence: string[] }> = {
  "q-01": {
    missing: [
      "Fully observed evidence chain with no self-reported gaps",
      "Continuous ledger integrity verification",
      "Cross-agent evidence correlation >0.95",
    ],
    evidence: [
      "10+ distinct days of observed evidence",
      "Zero ledger tampering incidents",
      "Automated integrity verification logs",
    ],
  },
  "q-02": {
    missing: [
      "All model calls routed through verified bridge",
      "Zero unsigned gateway config deployments",
      "Model allowlist enforced with notary attestation",
    ],
    evidence: [
      "Bridge routing logs covering 100% of model calls",
      "Notary attestation for gateway config",
      "Provider audit trail with cryptographic receipts",
    ],
  },
  "q-03": {
    missing: [
      "Governor action policy covers all action classes",
      "Zero policy violations in observation window",
      "Automated escalation for novel action patterns",
    ],
    evidence: [
      "Governor decision log with 100% coverage",
      "Policy violation rate = 0 over 10+ days",
      "Escalation audit trail",
    ],
  },
  "q-04": {
    missing: [
      "Budget enforcement with zero overruns",
      "Cost attribution per task/session",
      "Predictive cost alerts before threshold breach",
    ],
    evidence: [
      "Budget compliance logs over 10+ days",
      "Per-session cost breakdowns",
      "Alert trigger history",
    ],
  },
  "q-05": {
    missing: [
      "Approval workflow covers all high-risk actions",
      "Approval decisions are notarized",
      "Time-bounded approval with automatic expiry",
    ],
    evidence: [
      "Approval decision audit trail",
      "Notary attestation on approval records",
      "Expiry enforcement logs",
    ],
  },
};

function getL5Requirements(questionId: string): { missing: string[]; evidence: string[] } {
  return L5_REQUIREMENTS[questionId] ?? {
    missing: [
      "Full observability with zero self-reported evidence",
      "Continuous automated verification",
      "Notary-attested compliance records",
    ],
    evidence: [
      "10+ days of observed evidence",
      "Automated verification logs",
      "Notary attestation records",
    ],
  };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function loadLatestReport(workspace: string, agentId: string): DiagnosticReport | null {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  if (!pathExists(runsDir)) return null;

  const files = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) return null;

  try {
    return JSON.parse(readUtf8(join(runsDir, files[files.length - 1]!))) as DiagnosticReport;
  } catch {
    return null;
  }
}

export function generateL5DeltaReport(params: {
  workspace: string;
  agentId: string;
}): L5DeltaReport {
  const report = loadLatestReport(params.workspace, params.agentId);
  const bank = questionBank;
  const classification = classifyControls();
  const classificationMap = new Map(classification.questions.map((q) => [q.questionId, q]));

  const scoreMap = new Map<string, QuestionScore>();
  if (report) {
    for (const qs of report.questionScores) {
      scoreMap.set(qs.questionId, qs);
    }
  }

  const items: L5DeltaItem[] = [];
  for (const q of bank) {
    const score = scoreMap.get(q.id);
    const currentLevel = score?.finalLevel ?? 0;
    const gap = 5 - currentLevel;
    const reqs = getL5Requirements(q.id);
    const ctrl = classificationMap.get(q.id);

    items.push({
      questionId: q.id,
      questionTitle: q.title,
      layerName: q.layerName,
      currentLevel,
      targetLevel: 5,
      gap,
      missingCapabilities: gap > 0 ? reqs.missing : [],
      requiredEvidence: gap > 0 ? reqs.evidence : [],
      controlEnforcement: ctrl?.subControls.map((sc) => ({
        subControlId: sc.id,
        label: sc.label,
        level: sc.enforcementLevel,
      })) ?? [],
      dominantEnforcement: ctrl?.dominantLevel ?? "CONVENTION",
      confidence: score?.confidence ?? 0,
      flags: score?.flags ?? [],
    });
  }

  const atL5 = items.filter((i) => i.gap === 0).length;
  const below = items.filter((i) => i.gap > 0).length;
  const avgGap = items.length > 0 ? items.reduce((sum, i) => sum + i.gap, 0) / items.length : 0;

  return {
    agentId: params.agentId,
    generatedTs: Date.now(),
    runId: report?.runId ?? null,
    items,
    summary: {
      questionsAtL5: atL5,
      questionsBelow: below,
      avgGap: Number(avgGap.toFixed(2)),
      architecturalCount: items.filter((i) => i.dominantEnforcement === "ARCHITECTURAL").length,
      policyEnforcedCount: items.filter((i) => i.dominantEnforcement === "POLICY_ENFORCED").length,
      conventionCount: items.filter((i) => i.dominantEnforcement === "CONVENTION").length,
    },
  };
}

export function renderL5DeltaMarkdown(report: L5DeltaReport): string {
  const lines: string[] = [
    "# L4→L5 Delta Report",
    "",
    `Agent: ${report.agentId}`,
    `Generated: ${new Date(report.generatedTs).toISOString()}`,
    report.runId ? `Based on run: ${report.runId}` : "No diagnostic run found",
    "",
    "## Summary",
    "",
    `- Questions at L5: ${report.summary.questionsAtL5}`,
    `- Questions below L5: ${report.summary.questionsBelow}`,
    `- Average gap: ${report.summary.avgGap}`,
    `- ARCHITECTURAL controls: ${report.summary.architecturalCount}`,
    `- POLICY_ENFORCED controls: ${report.summary.policyEnforcedCount}`,
    `- CONVENTION controls: ${report.summary.conventionCount}`,
    "",
    "## Per-Question Delta",
    "",
  ];

  for (const item of report.items) {
    const status = item.gap === 0 ? "✓ AT L5" : `GAP: ${item.gap}`;
    lines.push(`### ${item.questionId}: ${item.questionTitle}`);
    lines.push("");
    lines.push(`- Layer: ${item.layerName}`);
    lines.push(`- Current: L${item.currentLevel} → Target: L5 (${status})`);
    lines.push(`- Confidence: ${(item.confidence * 100).toFixed(0)}%`);
    lines.push(`- Enforcement: ${item.dominantEnforcement}`);

    if (item.missingCapabilities.length > 0) {
      lines.push("");
      lines.push("**Missing capabilities:**");
      for (const cap of item.missingCapabilities) {
        lines.push(`- ${cap}`);
      }
    }

    if (item.requiredEvidence.length > 0) {
      lines.push("");
      lines.push("**Required evidence:**");
      for (const ev of item.requiredEvidence) {
        lines.push(`- ${ev}`);
      }
    }

    if (item.controlEnforcement.length > 0) {
      lines.push("");
      lines.push("**Control enforcement:**");
      for (const ctrl of item.controlEnforcement) {
        lines.push(`- ${ctrl.label}: ${ctrl.level}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

export function saveL5DeltaReport(params: {
  workspace: string;
  agentId: string;
  outPath: string;
  format: "json" | "markdown" | "both";
}): { paths: string[] } {
  const report = generateL5DeltaReport({
    workspace: params.workspace,
    agentId: params.agentId,
  });

  const paths: string[] = [];

  if (params.format === "json" || params.format === "both") {
    const jsonPath = params.outPath.replace(/\.md$/, ".json");
    ensureDir(dirname(jsonPath));
    writeFileAtomic(jsonPath, JSON.stringify(report, null, 2), 0o644);
    paths.push(jsonPath);
  }

  if (params.format === "markdown" || params.format === "both") {
    const mdPath = params.outPath.endsWith(".md") ? params.outPath : `${params.outPath}.md`;
    ensureDir(dirname(mdPath));
    writeFileAtomic(mdPath, renderL5DeltaMarkdown(report), 0o644);
    paths.push(mdPath);
  }

  return { paths };
}
