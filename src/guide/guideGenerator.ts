/**
 * Guide Generator — produces personalized improvement guides from AMC scores.
 *
 * Two output modes:
 *   1. Human-readable CLI output (colored, formatted)
 *   2. Exportable Markdown files agents can consume (AGENTS.md, system prompts, etc.)
 *
 * Guides are personalized: they only include instructions for gaps the agent actually has.
 */

import type { LayerName, DiagnosticQuestion, QuestionScore } from "../types.js";
import { questionBank } from "../diagnostic/questionBank.js";

/* ── Types ─────────────────────────────────────────── */

export interface GuideInput {
  /** Current overall score (0-5) */
  overall: number;
  /** Per-question scores from the latest run */
  questionScores: QuestionScore[];
  /** Target level to reach (default: current + 1, capped at 5) */
  targetLevel?: number;
  /** Agent ID */
  agentId?: string;
  /** Framework name (e.g. "langchain", "crewai") */
  framework?: string;
}

export interface GuideSection {
  questionId: string;
  title: string;
  layerName: LayerName;
  currentLevel: number;
  targetLevel: number;
  whatToFix: string;
  howToFix: string[];
  evidenceNeeded: string[];
  cliCommands: string[];
  agentInstruction: string;
}

export interface Guide {
  agentId: string;
  currentLevel: number;
  targetLevel: number;
  generatedAt: string;
  sections: GuideSection[];
  summary: string;
}

/* ── Level helpers ─────────────────────────────────── */

const LEVEL_NAMES: Record<number, string> = {
  0: "L0 — Running with Scissors",
  1: "L1 — Minimal",
  2: "L2 — Developing",
  3: "L3 — Moderate",
  4: "L4 — High Trust",
  5: "L5 — Self-Governing",
};

function currentLevelFromScore(overall: number): number {
  return Math.floor(Math.max(0, Math.min(5, overall)));
}

/* ── CLI command mapping ───────────────────────────── */

function cliCommandsForGap(q: DiagnosticQuestion, currentLevel: number, targetLevel: number): string[] {
  const cmds: string[] = [];

  // Evidence collection is always step 1 if below L2
  if (currentLevel < 2) {
    cmds.push("amc evidence collect");
  }

  // Assurance packs based on layer
  const layerScopeMap: Record<string, string> = {
    "Strategic Agent Operations": "strategic",
    "Leadership & Autonomy": "autonomy",
    "Culture & Alignment": "alignment",
    "Resilience": "resilience",
    "Skills": "skills",
  };
  const scope = layerScopeMap[q.layerName];
  if (scope && targetLevel >= 3) {
    cmds.push(`amc assurance run --scope ${scope}`);
  }

  // Specific commands based on tuning knobs
  for (const knob of q.tuningKnobs) {
    if (knob.includes("guardrails")) cmds.push("amc doctor");
    if (knob.includes("evalHarness")) cmds.push("amc score formal-spec");
    if (knob.includes("evidence")) cmds.push("amc evidence collect --sign");
  }

  // L4+ needs sealed runs
  if (targetLevel >= 4) {
    cmds.push("amc assurance run --scope all --seal");
  }

  // L5 needs the loop
  if (targetLevel >= 5) {
    cmds.push("amc loop start --auto-remediate");
  }

  // Deduplicate
  return [...new Set(cmds)];
}

/* ── Agent instruction generator ───────────────────── */

function generateAgentInstruction(q: DiagnosticQuestion, currentLevel: number, targetLevel: number): string {
  const targetOption = q.options.find(o => o.level === targetLevel);
  const signals = targetOption?.observableSignals ?? [];

  const parts: string[] = [];
  parts.push(`## ${q.id}: ${q.title}`);
  parts.push("");
  parts.push(`**Current:** L${currentLevel} | **Target:** L${targetLevel}`);
  parts.push("");

  // What the agent should do
  parts.push("### What you must do");
  if (signals.length > 0) {
    for (const s of signals) {
      parts.push(`- ${s}`);
    }
  } else {
    parts.push(`- ${q.upgradeHints}`);
  }
  parts.push("");

  // Evidence the agent needs to produce
  const targetGate = q.gates.find(g => g.level === targetLevel);
  if (targetGate) {
    parts.push("### Evidence you must produce");
    if (targetGate.requiredEvidenceTypes.length > 0) {
      parts.push(`- Evidence types needed: ${targetGate.requiredEvidenceTypes.join(", ")}`);
    }
    if (targetGate.minEvents > 0) {
      parts.push(`- Minimum ${targetGate.minEvents} evidence events across ${targetGate.minSessions} sessions`);
    }
    if (targetGate.mustInclude?.auditTypes?.length) {
      parts.push(`- Must include audit types: ${targetGate.mustInclude.auditTypes.join(", ")}`);
    }
    if (targetGate.mustNotInclude?.auditTypes?.length) {
      parts.push(`- Must NOT have: ${targetGate.mustNotInclude.auditTypes.join(", ")}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

/* ── Main generator ────────────────────────────────── */

export function generateGuide(input: GuideInput): Guide {
  const currentLevel = currentLevelFromScore(input.overall);
  const targetLevel = Math.min(5, input.targetLevel ?? currentLevel + 1);
  const agentId = input.agentId ?? "default";

  // Find questions where the agent is below target
  const gaps: GuideSection[] = [];

  for (const qs of input.questionScores) {
    if (qs.finalLevel >= targetLevel) continue;

    const q = questionBank.find(bq => bq.id === qs.questionId);
    if (!q) continue;

    const targetOption = q.options.find(o => o.level === targetLevel);
    const currentOption = q.options.find(o => o.level === qs.finalLevel);

    gaps.push({
      questionId: qs.questionId,
      title: q.title,
      layerName: q.layerName as LayerName,
      currentLevel: qs.finalLevel,
      targetLevel,
      whatToFix: currentOption
        ? `Currently at "${currentOption.label}". Need "${targetOption?.label ?? `L${targetLevel}`}".`
        : `Currently at L${qs.finalLevel}. Need L${targetLevel}.`,
      howToFix: [q.upgradeHints, q.evidenceGateHints].filter(Boolean),
      evidenceNeeded: targetOption?.typicalEvidence ?? [],
      cliCommands: cliCommandsForGap(q, qs.finalLevel, targetLevel),
      agentInstruction: generateAgentInstruction(q, qs.finalLevel, targetLevel),
    });
  }

  // Sort by impact: biggest gap first, then by layer priority
  const LAYER_PRIORITY: Record<string, number> = {
    "Culture & Alignment": 1,
    "Resilience": 2,
    "Strategic Agent Operations": 3,
    "Skills": 4,
    "Leadership & Autonomy": 5,
  };
  gaps.sort((a, b) => {
    const gapDiff = (b.targetLevel - b.currentLevel) - (a.targetLevel - a.currentLevel);
    if (gapDiff !== 0) return gapDiff;
    return (LAYER_PRIORITY[a.layerName] ?? 99) - (LAYER_PRIORITY[b.layerName] ?? 99);
  });

  const gapCount = gaps.length;
  const totalQuestions = input.questionScores.length;
  const passingCount = totalQuestions - gapCount;

  const summary = gapCount === 0
    ? `Agent "${agentId}" meets all requirements for ${LEVEL_NAMES[targetLevel] ?? `L${targetLevel}`}. No gaps found.`
    : `Agent "${agentId}" has ${gapCount} gap${gapCount === 1 ? "" : "s"} to close for ${LEVEL_NAMES[targetLevel] ?? `L${targetLevel}`}. ${passingCount}/${totalQuestions} questions already at target.`;

  return {
    agentId,
    currentLevel,
    targetLevel,
    generatedAt: new Date().toISOString(),
    sections: gaps,
    summary,
  };
}

/* ── Markdown export ───────────────────────────────── */

export function guideToHumanMarkdown(guide: Guide): string {
  const lines: string[] = [];

  lines.push(`# AMC Improvement Guide`);
  lines.push("");
  lines.push(`**Agent:** ${guide.agentId} | **Current:** L${guide.currentLevel} | **Target:** L${guide.targetLevel}`);
  lines.push(`**Generated:** ${new Date(guide.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
  lines.push("");
  lines.push(`> ${guide.summary}`);
  lines.push("");

  if (guide.sections.length === 0) {
    lines.push("🎉 Nothing to fix — you're at target level!");
    return lines.join("\n");
  }

  lines.push("## Priority Fixes (highest impact first)");
  lines.push("");

  for (let i = 0; i < guide.sections.length; i++) {
    const s = guide.sections[i]!;
    lines.push(`### ${i + 1}. ${s.questionId}: ${s.title}`);
    lines.push("");
    lines.push(`**Layer:** ${s.layerName} | **Current:** L${s.currentLevel} → **Target:** L${s.targetLevel}`);
    lines.push("");
    lines.push(`**What's wrong:** ${s.whatToFix}`);
    lines.push("");

    if (s.howToFix.length > 0) {
      lines.push("**How to fix:**");
      for (const h of s.howToFix) {
        lines.push(`- ${h}`);
      }
      lines.push("");
    }

    if (s.evidenceNeeded.length > 0) {
      lines.push("**Evidence needed:**");
      for (const e of s.evidenceNeeded) {
        lines.push(`- ${e}`);
      }
      lines.push("");
    }

    if (s.cliCommands.length > 0) {
      lines.push("**Run:**");
      lines.push("```bash");
      for (const c of s.cliCommands) {
        lines.push(c);
      }
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function guideToAgentMarkdown(guide: Guide, framework?: string): string {
  const lines: string[] = [];

  lines.push("# AMC Trust Improvement Instructions");
  lines.push("");
  lines.push("> These instructions were generated by AMC (Agent Maturity Compass) based on");
  lines.push(`> your actual execution scores. Follow them to improve from L${guide.currentLevel} to L${guide.targetLevel}.`);
  lines.push(`> Generated: ${new Date(guide.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
  lines.push("");

  if (framework) {
    lines.push(`**Framework:** ${framework}`);
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  lines.push(guide.summary);
  lines.push("");

  if (guide.sections.length === 0) {
    lines.push("No improvements needed. You meet all requirements for the target level.");
    return lines.join("\n");
  }

  lines.push("## Required Behavioral Changes");
  lines.push("");
  lines.push("Implement these changes in order of priority. Each section describes what");
  lines.push("behavior AMC expects to observe in your execution logs.");
  lines.push("");

  for (const s of guide.sections) {
    lines.push(s.agentInstruction);
  }

  lines.push("---");
  lines.push("");
  lines.push("## How to Verify");
  lines.push("");
  lines.push("After implementing these changes, verify your improvement:");
  lines.push("");
  lines.push("```bash");
  lines.push("# Collect fresh evidence");
  lines.push("amc evidence collect");
  lines.push("");
  lines.push("# Re-score");
  lines.push("amc quickscore");
  lines.push("");
  lines.push("# See updated guide");
  lines.push("amc guide");
  lines.push("```");
  lines.push("");
  lines.push("AMC scores from execution evidence, not claims. The behaviors above must be");
  lines.push("observable in your execution logs to count toward your score.");

  return lines.join("\n");
}
