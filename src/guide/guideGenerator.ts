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
import { builtInComplianceMappings } from "../compliance/builtInMappings.js";
import type { ComplianceMapping } from "../compliance/mappingSchema.js";

/* ── Framework-specific hints ──────────────────────── */

interface FrameworkHint {
  name: string;
  aliases: string[];
  language: string;
  configFile: string;
  evidenceSetup: string;
  guardrailSnippet: string;
  monitorSnippet: string;
}

const FRAMEWORK_HINTS: Record<string, FrameworkHint> = {
  langchain: {
    name: "LangChain",
    aliases: ["langchain", "lc"],
    language: "python",
    configFile: "langchain.config.py or agent.py",
    evidenceSetup: `# LangChain: Enable AMC evidence collection
from langchain.callbacks import AMCCallbackHandler
handler = AMCCallbackHandler(workspace=".amc")
chain = LLMChain(llm=llm, callbacks=[handler])`,
    guardrailSnippet: `# LangChain: Add guardrails from AMC guide
from langchain.tools import StructuredTool
# AMC will observe tool usage, error handling, and output quality
# Ensure your chain logs reasoning steps and escalates on uncertainty`,
    monitorSnippet: `# LangChain: Continuous monitoring
# Set OPENAI_BASE_URL=http://localhost:4200/v1 to route through AMC gateway
# AMC captures every LLM call with Ed25519 signatures`,
  },
  crewai: {
    name: "CrewAI",
    aliases: ["crewai", "crew"],
    language: "python",
    configFile: "crew.py or agents.yaml",
    evidenceSetup: `# CrewAI: Enable AMC evidence collection
# Set the base URL to route through AMC gateway
import os
os.environ["OPENAI_BASE_URL"] = "http://localhost:4200/v1"`,
    guardrailSnippet: `# CrewAI: Add guardrails
# In your Agent definition, add:
agent = Agent(
    role="...",
    goal="...",
    backstory="...",
    verbose=True,  # AMC needs execution logs
    allow_delegation=False,  # Explicit delegation control
)`,
    monitorSnippet: `# CrewAI: AMC monitors all crew interactions
# Each agent's decisions are captured in the evidence ledger`,
  },
  autogen: {
    name: "AutoGen",
    aliases: ["autogen", "ag2", "autogen2"],
    language: "python",
    configFile: "OAI_CONFIG_LIST or autogen config",
    evidenceSetup: `# AutoGen: Route through AMC gateway
OAI_CONFIG_LIST = [{
    "model": "gpt-4",
    "base_url": "http://localhost:4200/v1",
    "api_key": "your-key"
}]`,
    guardrailSnippet: `# AutoGen: Add guardrails
# Enable logging for AMC evidence capture
import autogen
autogen.runtime_logging.start(logger_type="file")`,
    monitorSnippet: `# AutoGen: AMC captures multi-agent conversations
# Each agent turn is a separate evidence event`,
  },
  openai: {
    name: "OpenAI Agents SDK",
    aliases: ["openai", "openai-agents", "swarm"],
    language: "python",
    configFile: "agent.py or swarm config",
    evidenceSetup: `# OpenAI Agents SDK: Route through AMC gateway
from openai import OpenAI
client = OpenAI(base_url="http://localhost:4200/v1")`,
    guardrailSnippet: `# OpenAI: Add guardrails via function definitions
# AMC observes tool calls, function outputs, and error handling`,
    monitorSnippet: `# OpenAI: AMC captures all completions and tool calls`,
  },
  llamaindex: {
    name: "LlamaIndex",
    aliases: ["llamaindex", "llama-index", "llama"],
    language: "python",
    configFile: "settings.py or llama config",
    evidenceSetup: `# LlamaIndex: Route through AMC gateway
from llama_index.llms.openai import OpenAI
llm = OpenAI(api_base="http://localhost:4200/v1")`,
    guardrailSnippet: `# LlamaIndex: AMC observes query engine behavior
# Ensure your index logs retrieval steps and source citations`,
    monitorSnippet: `# LlamaIndex: AMC captures retrieval + generation pipeline`,
  },
  semantickernel: {
    name: "Semantic Kernel",
    aliases: ["semantic-kernel", "sk", "semantickernel"],
    language: "csharp",
    configFile: "Program.cs or kernel config",
    evidenceSetup: `// Semantic Kernel: Route through AMC gateway
var builder = Kernel.CreateBuilder();
builder.AddOpenAIChatCompletion("gpt-4", new Uri("http://localhost:4200/v1"), "your-key");`,
    guardrailSnippet: `// Semantic Kernel: Add guardrails via filters
// AMC observes function calls, planning steps, and error handling
kernel.FunctionInvocationFilters.Add(new AMCFilter());`,
    monitorSnippet: `// Semantic Kernel: AMC captures all kernel function invocations`,
  },
  claudecode: {
    name: "Claude Code",
    aliases: ["claude-code", "claude", "claudecode"],
    language: "markdown",
    configFile: "CLAUDE.md or AGENTS.md",
    evidenceSetup: `# Claude Code: Add to CLAUDE.md
# AMC guardrails are applied via amc guide --apply CLAUDE.md
# Claude Code reads this file automatically on every session`,
    guardrailSnippet: `# Claude Code reads CLAUDE.md as system instructions
# AMC guardrails become Claude Code's operating rules automatically`,
    monitorSnippet: `# Claude Code: Use amc guide --watch --apply CLAUDE.md
# Guardrails auto-update when your trust score changes`,
  },
  gemini: {
    name: "Gemini",
    aliases: ["gemini", "gemini-cli"],
    language: "markdown",
    configFile: ".gemini/style.md",
    evidenceSetup: `# Gemini CLI: Add to .gemini/style.md
# AMC guardrails are applied via amc guide --apply .gemini/style.md`,
    guardrailSnippet: `# Gemini reads .gemini/style.md as behavioral instructions
# AMC guardrails become Gemini's operating rules`,
    monitorSnippet: `# Gemini: Use amc guide --watch --apply .gemini/style.md`,
  },
  cursor: {
    name: "Cursor",
    aliases: ["cursor"],
    language: "markdown",
    configFile: ".cursorrules or .cursor/rules",
    evidenceSetup: `# Cursor: Add to .cursorrules
# AMC guardrails are applied via amc guide --apply .cursorrules`,
    guardrailSnippet: `# Cursor reads .cursorrules as system instructions
# AMC guardrails become Cursor's operating rules automatically`,
    monitorSnippet: `# Cursor: Use amc guide --watch --apply .cursorrules`,
  },
  kiro: {
    name: "Kiro",
    aliases: ["kiro"],
    language: "markdown",
    configFile: ".kiro/steering/guide.md",
    evidenceSetup: `# Kiro: Add to .kiro/steering/guide.md
# AMC guardrails are applied via amc guide --apply .kiro/steering/guide.md`,
    guardrailSnippet: `# Kiro reads steering files as behavioral instructions
# AMC guardrails become Kiro's operating rules`,
    monitorSnippet: `# Kiro: Use amc guide --watch --apply .kiro/steering/guide.md`,
  },
};

function resolveFramework(name?: string): FrameworkHint | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().replace(/[\s_-]+/g, "");
  for (const [, hint] of Object.entries(FRAMEWORK_HINTS)) {
    if (hint.aliases.some(a => a.replace(/[\s_-]+/g, "") === lower)) return hint;
  }
  return undefined;
}

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
  /** Compliance frameworks to include (e.g. ["EU_AI_ACT", "ISO_42001"]) */
  complianceFrameworks?: string[];
}

export interface ComplianceGap {
  framework: string;
  category: string;
  description: string;
  mappingId: string;
  requiredPacks: string[];
  requiredEvidenceTypes: string[];
}

export interface GuideSection {
  questionId: string;
  title: string;
  layerName: LayerName;
  currentLevel: number;
  targetLevel: number;
  severity: "critical" | "high" | "medium";
  whatToFix: string;
  howToFix: string[];
  evidenceNeeded: string[];
  cliCommands: string[];
  agentInstruction: string;
  complianceGaps: ComplianceGap[];
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

function complianceMappingsForQuestion(questionId: string, frameworks?: string[]): ComplianceGap[] {
  const gaps: ComplianceGap[] = [];
  for (const m of builtInComplianceMappings) {
    if (frameworks && frameworks.length > 0 && !frameworks.includes(m.framework)) continue;
    if (!m.related.questions.includes(questionId as any)) continue;
    gaps.push({
      framework: m.framework,
      category: m.category,
      description: m.description,
      mappingId: m.id,
      requiredPacks: m.related.packs,
      requiredEvidenceTypes: m.evidenceRequirements
        .filter(e => e.type === "requires_evidence_event")
        .flatMap(e => (e as any).eventTypes ?? []),
    });
  }
  return gaps;
}

const COMPLIANCE_FRAMEWORK_LABELS: Record<string, string> = {
  EU_AI_ACT: "EU AI Act (Regulation 2024/1689)",
  ISO_42001: "ISO/IEC 42001:2023 (AI Management System)",
  NIST_AI_RMF: "NIST AI Risk Management Framework 1.0",
  SOC2: "SOC 2 Type II (Trust Service Criteria)",
  ISO_27001: "ISO/IEC 27001:2022 (Information Security)",
};

export const SUPPORTED_COMPLIANCE_FRAMEWORKS = Object.keys(COMPLIANCE_FRAMEWORK_LABELS);

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
    "Evaluation & Growth": "evaluation",
  };
  const scope = layerScopeMap[q.layerName];
  if (scope && targetLevel >= 3) {
    cmds.push(`amc assurance run --scope ${scope}`);
  }

  // Over-compliance questions get specific pack
  if (q.id.startsWith("AMC-OC")) {
    cmds.push("amc assurance run --pack overCompliance,falsePremise,misleadingContext");
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

  // What AMC is evaluating (from the prompt template)
  if (q.promptTemplate) {
    const cleanPrompt = q.promptTemplate.replace(/\{\{[^}]+\}\}/g, "[your context]");
    parts.push(`> *AMC evaluates:* ${cleanPrompt}`);
    parts.push("");
  }

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

    // Per-question verification command
    parts.push("### Verify this question");
    parts.push(`\`\`\`bash`);
    parts.push(`amc explain ${q.id}`);
    parts.push(`amc score formal-spec --question ${q.id}`);
    parts.push(`\`\`\``);
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

    const gap = targetLevel - qs.finalLevel;
    const severity: "critical" | "high" | "medium" = gap >= 3 ? "critical" : gap >= 2 ? "high" : "medium";

    gaps.push({
      questionId: qs.questionId,
      title: q.title,
      layerName: q.layerName as LayerName,
      currentLevel: qs.finalLevel,
      targetLevel,
      severity,
      whatToFix: currentOption
        ? `Currently at "${currentOption.label}". Need "${targetOption?.label ?? `L${targetLevel}`}".`
        : `Currently at L${qs.finalLevel}. Need L${targetLevel}.`,
      howToFix: [q.upgradeHints, q.evidenceGateHints].filter(Boolean),
      evidenceNeeded: targetOption?.typicalEvidence ?? [],
      cliCommands: cliCommandsForGap(q, qs.finalLevel, targetLevel),
      agentInstruction: generateAgentInstruction(q, qs.finalLevel, targetLevel),
      complianceGaps: complianceMappingsForQuestion(qs.questionId, input.complianceFrameworks),
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

  // Getting started preamble for first-time users
  if (guide.currentLevel <= 1) {
    lines.push("## 🚀 First Time? Start Here");
    lines.push("");
    lines.push("This guide is personalized to your agent's actual scores. Here's how to use it:");
    lines.push("");
    lines.push("1. Read the **Priority Fixes** below — they're sorted by impact (biggest wins first)");
    lines.push("2. Run the **CLI commands** shown in each section — they do the heavy lifting");
    lines.push("3. After fixing, run `amc quickscore` to see your new score");
    lines.push("4. Run `amc guide --diff` to see what improved");
    lines.push("");
    lines.push("Most agents jump a full level just by running `amc evidence collect`. Start there.");
    lines.push("");
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
  const fw = resolveFramework(framework);

  lines.push("# AMC Trust Improvement Instructions");
  lines.push("");
  lines.push("> These instructions were generated by AMC (Agent Maturity Compass) based on");
  lines.push(`> your actual execution scores. Follow them to improve from L${guide.currentLevel} to L${guide.targetLevel}.`);
  lines.push(`> Generated: ${new Date(guide.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
  lines.push("");

  if (fw) {
    lines.push(`**Framework:** ${fw.name} | **Language:** ${fw.language} | **Config:** ${fw.configFile}`);
    lines.push("");
  } else if (framework) {
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

  // Framework-specific setup instructions
  if (fw) {
    lines.push("## Setup: Connect to AMC");
    lines.push("");
    lines.push("```" + fw.language);
    lines.push(fw.evidenceSetup);
    lines.push("```");
    lines.push("");
  }

  lines.push("## Required Behavioral Changes");
  lines.push("");
  lines.push("Implement these changes in order of priority. Each section describes what");
  lines.push("behavior AMC expects to observe in your execution logs.");
  lines.push("");

  for (const s of guide.sections) {
    lines.push(s.agentInstruction);
  }

  // Framework-specific monitoring
  if (fw) {
    lines.push("---");
    lines.push("");
    lines.push("## Framework-Specific Notes");
    lines.push("");
    lines.push("```" + fw.language);
    lines.push(fw.monitorSnippet);
    lines.push("```");
    lines.push("");
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

/* ── Guardrails generator ──────────────────────────── */

/**
 * Generates an operational guardrails document from the guide.
 * This is not suggestions — it's rules the agent must follow.
 * Designed to be appended to AGENTS.md, system prompts, or .cursorrules.
 */
export function guideToGuardrails(guide: Guide, framework?: string): string {
  const lines: string[] = [];

  lines.push("# AMC Trust Guardrails");
  lines.push("");
  lines.push("<!-- Generated by AMC (Agent Maturity Compass) -->");
  lines.push(`<!-- Target: L${guide.targetLevel} | Generated: ${new Date(guide.generatedAt).toISOString().split("T")[0]} -->`);
  lines.push("<!-- These are operational rules, not suggestions. Violating them lowers your trust score. -->");
  lines.push("");

  if (framework) {
    const fw = resolveFramework(framework);
    lines.push(`**Framework:** ${fw?.name ?? framework}`);
    lines.push("");
  }

  // Quick Start — top 3 most critical rules for immediate impact
  if (guide.sections.length > 0) {
    const top3 = guide.sections.slice(0, 3);
    lines.push("## ⚡ Quick Start (Top 3 Priorities)");
    lines.push("");
    for (let i = 0; i < top3.length; i++) {
      const s = top3[i]!;
      const q = questionBank.find(bq => bq.id === s.questionId);
      if (!q) continue;
      const hint = q.upgradeHints.split(".")[0] ?? q.upgradeHints;
      lines.push(`${i + 1}. **${s.questionId}** (${s.layerName}): ${hint}.`);
    }
    lines.push("");
    if (top3[0]?.cliCommands[0]) {
      lines.push(`Start here: \`${top3[0].cliCommands[0]}\``);
      lines.push("");
    }
  }

  // Group sections by layer
  const byLayer = new Map<string, GuideSection[]>();
  for (const s of guide.sections) {
    const existing = byLayer.get(s.layerName) ?? [];
    existing.push(s);
    byLayer.set(s.layerName, existing);
  }

  lines.push("## Non-Negotiable Rules");
  lines.push("");
  lines.push("These rules are derived from your weakest scores. Follow them in every interaction.");
  lines.push("");

  let ruleNum = 1;
  for (const [layer, sections] of byLayer) {
    lines.push(`### ${layer}`);
    lines.push("");

    for (const s of sections) {
      const q = questionBank.find(bq => bq.id === s.questionId);
      if (!q) continue;

      const targetOption = q.options.find(o => o.level === s.targetLevel);
      const signals = targetOption?.observableSignals ?? [];

      if (signals.length > 0) {
        for (const signal of signals) {
          const sev = s.severity === "critical" ? "🔴" : s.severity === "high" ? "🟡" : "🔵";
          lines.push(`${ruleNum}. ${sev} **${s.questionId}**: ${signal}`);
          ruleNum++;
        }
      } else {
        const sev = s.severity === "critical" ? "🔴" : s.severity === "high" ? "🟡" : "🔵";
        lines.push(`${ruleNum}. ${sev} **${s.questionId}**: ${q.upgradeHints}`);
        ruleNum++;
      }
    }
    lines.push("");
  }

  // Prohibited behaviors
  const prohibitions: string[] = [];
  for (const s of guide.sections) {
    const q = questionBank.find(bq => bq.id === s.questionId);
    if (!q) continue;
    const targetGate = q.gates.find(g => g.level === s.targetLevel);
    if (targetGate?.mustNotInclude?.auditTypes?.length) {
      for (const t of targetGate.mustNotInclude.auditTypes) {
        if (!prohibitions.includes(t)) prohibitions.push(t);
      }
    }
  }

  if (prohibitions.length > 0) {
    lines.push("## Prohibited Behaviors");
    lines.push("");
    lines.push("Any of these will cap your trust score regardless of other improvements:");
    lines.push("");
    const PROHIBITION_LABELS: Record<string, string> = {
      "POLICY_VIOLATION_CRITICAL": "Do not violate critical policies (data access, scope boundaries)",
      "TRUST_BOUNDARY_VIOLATED": "Do not cross trust boundaries without explicit authorization",
      "LEDGER_TAMPER": "Do not modify or tamper with evidence ledger entries",
      "UNSAFE_PROVIDER_ROUTE": "Do not route requests through unverified providers",
      "UNSIGNED_GATEWAY_CONFIG": "Do not accept unsigned gateway configurations",
      "MISSING_LLM_EVIDENCE": "Do not make claims without supporting LLM evidence",
      "TRUTH_PROTOCOL_MISSING": "Do not skip truth protocol verification steps",
    };
    for (const p of prohibitions) {
      lines.push(`- ❌ ${PROHIBITION_LABELS[p] ?? p}`);
    }
    lines.push("");
  }

  // Evidence requirements summary
  lines.push("## Evidence Requirements");
  lines.push("");
  lines.push(`To reach L${guide.targetLevel}, AMC must observe these in your execution logs:`);
  lines.push("");

  const allEvidenceTypes = new Set<string>();
  let maxEvents = 0;
  let maxSessions = 0;
  for (const s of guide.sections) {
    const q = questionBank.find(bq => bq.id === s.questionId);
    if (!q) continue;
    const gate = q.gates.find(g => g.level === s.targetLevel);
    if (gate) {
      for (const t of gate.requiredEvidenceTypes) allEvidenceTypes.add(t);
      if (gate.minEvents > maxEvents) maxEvents = gate.minEvents;
      if (gate.minSessions > maxSessions) maxSessions = gate.minSessions;
    }
  }

  if (allEvidenceTypes.size > 0) {
    lines.push(`- Evidence types: ${[...allEvidenceTypes].join(", ")}`);
  }
  if (maxEvents > 0) {
    lines.push(`- Minimum events per question: ${maxEvents}`);
  }
  if (maxSessions > 0) {
    lines.push(`- Minimum sessions: ${maxSessions}`);
  }
  lines.push("");

  lines.push("## Verification");
  lines.push("");
  lines.push("Your human operator will verify compliance by running:");
  lines.push("");
  lines.push("```");
  lines.push("amc quickscore");
  lines.push("amc guide");
  lines.push("```");
  lines.push("");
  lines.push("Scores are computed from execution evidence, not self-reported claims.");
  lines.push("You cannot improve your score by claiming compliance — only by demonstrating it.");

  return lines.join("\n");
}

/* ── Compliance guardrails generator ────────────────── */

export function guideToComplianceGuardrails(guide: Guide, frameworks?: string[]): string {
  const lines: string[] = [];
  const targetFrameworks = frameworks && frameworks.length > 0
    ? frameworks
    : SUPPORTED_COMPLIANCE_FRAMEWORKS;

  lines.push("# AMC Compliance Guardrails");
  lines.push("");
  lines.push("<!-- Generated by AMC (Agent Maturity Compass) -->");
  lines.push(`<!-- Target: L${guide.targetLevel} | Frameworks: ${targetFrameworks.join(", ")} -->`);
  lines.push("<!-- These rules map your maturity gaps to regulatory obligations. -->");
  lines.push("");

  // Collect all compliance gaps across all sections
  const gapsByFramework = new Map<string, Array<{ section: GuideSection; gap: ComplianceGap }>>();
  for (const s of guide.sections) {
    for (const cg of s.complianceGaps) {
      if (!targetFrameworks.includes(cg.framework)) continue;
      const existing = gapsByFramework.get(cg.framework) ?? [];
      existing.push({ section: s, gap: cg });
      gapsByFramework.set(cg.framework, existing);
    }
  }

  if (gapsByFramework.size === 0) {
    lines.push("✅ No compliance gaps found for the selected frameworks at your current maturity level.");
    lines.push("");
    lines.push("This means either:");
    lines.push("- Your agent already satisfies the mapped obligations");
    lines.push("- The gaps in your score don't map to the selected regulatory frameworks");
    lines.push("");
    lines.push("Run `amc compliance report --framework EU_AI_ACT` for a full compliance assessment.");
    return lines.join("\n");
  }

  // Summary
  const totalGaps = [...gapsByFramework.values()].reduce((sum, arr) => sum + arr.length, 0);
  lines.push(`**${totalGaps} compliance obligation${totalGaps === 1 ? "" : "s"} at risk** across ${gapsByFramework.size} framework${gapsByFramework.size === 1 ? "" : "s"}:`);
  lines.push("");
  for (const [fw, gaps] of gapsByFramework) {
    const label = COMPLIANCE_FRAMEWORK_LABELS[fw] ?? fw;
    const criticals = gaps.filter(g => g.section.severity === "critical").length;
    const highs = gaps.filter(g => g.section.severity === "high").length;
    const parts = [`${gaps.length} obligation${gaps.length === 1 ? "" : "s"}`];
    if (criticals > 0) parts.push(`${criticals} critical`);
    if (highs > 0) parts.push(`${highs} high`);
    lines.push(`- **${label}**: ${parts.join(", ")}`);
  }
  lines.push("");

  // Per-framework sections
  for (const [fw, gaps] of gapsByFramework) {
    const label = COMPLIANCE_FRAMEWORK_LABELS[fw] ?? fw;
    lines.push(`## ${label}`);
    lines.push("");

    // Group by category
    const byCategory = new Map<string, typeof gaps>();
    for (const g of gaps) {
      const existing = byCategory.get(g.gap.category) ?? [];
      existing.push(g);
      byCategory.set(g.gap.category, existing);
    }

    for (const [category, catGaps] of byCategory) {
      lines.push(`### ${category}`);
      lines.push("");

      for (const { section, gap } of catGaps) {
        const sev = section.severity === "critical" ? "🔴" : section.severity === "high" ? "🟡" : "🔵";
        lines.push(`${sev} **${section.questionId}** — ${gap.description}`);
        lines.push("");
        lines.push(`- Current: L${section.currentLevel} → Required: L${section.targetLevel}`);
        if (gap.requiredPacks.length > 0) {
          lines.push(`- Required assurance packs: ${gap.requiredPacks.map(p => `\`${p}\``).join(", ")}`);
        }
        if (gap.requiredEvidenceTypes.length > 0) {
          lines.push(`- Required evidence: ${gap.requiredEvidenceTypes.join(", ")}`);
        }
        lines.push(`- Verify: \`amc compliance report --framework ${fw}\``);
        lines.push("");
      }
    }
  }

  // Compliance-specific agent rules
  lines.push("## Compliance Rules for Your Agent");
  lines.push("");
  lines.push("Follow these rules to satisfy the regulatory obligations above:");
  lines.push("");

  let ruleNum = 1;
  const seenRules = new Set<string>();
  for (const [fw, gaps] of gapsByFramework) {
    for (const { section, gap } of gaps) {
      const q = questionBank.find(bq => bq.id === section.questionId);
      if (!q) continue;
      const targetOption = q.options.find(o => o.level === section.targetLevel);
      const signals = targetOption?.observableSignals ?? [];
      for (const signal of signals) {
        const ruleKey = `${section.questionId}:${signal}`;
        if (seenRules.has(ruleKey)) continue;
        seenRules.add(ruleKey);
        const sev = section.severity === "critical" ? "🔴" : section.severity === "high" ? "🟡" : "🔵";
        lines.push(`${ruleNum}. ${sev} ${signal} *(${fw}: ${gap.category})*`);
        ruleNum++;
      }
    }
  }
  lines.push("");

  // Verification
  lines.push("## Verification Commands");
  lines.push("");
  lines.push("```bash");
  for (const fw of targetFrameworks) {
    if (gapsByFramework.has(fw)) {
      lines.push(`amc compliance report --framework ${fw}`);
    }
  }
  lines.push("amc guide --diff");
  lines.push("amc quickscore");
  lines.push("```");

  return lines.join("\n");
}

/* ── Apply targets ─────────────────────────────────── */

export interface ApplyTarget {
  /** File path to write/append to */
  path: string;
  /** What kind of file (agents-md, cursorrules, system-prompt, custom) */
  kind: "agents-md" | "cursorrules" | "system-prompt" | "custom";
  /** Whether to append or overwrite the guardrails section */
  mode: "append" | "replace";
}

/** Well-known agent config file locations */
export const KNOWN_AGENT_CONFIGS: Array<{ path: string; kind: ApplyTarget["kind"]; label: string }> = [
  { path: "AGENTS.md", kind: "agents-md", label: "AGENTS.md (Claude Code, Codex, generic)" },
  { path: "CLAUDE.md", kind: "agents-md", label: "CLAUDE.md (Claude Code)" },
  { path: ".cursorrules", kind: "cursorrules", label: ".cursorrules (Cursor)" },
  { path: ".cursor/rules", kind: "cursorrules", label: ".cursor/rules (Cursor v2)" },
  { path: ".github/copilot-instructions.md", kind: "agents-md", label: "Copilot Instructions (GitHub)" },
  { path: ".clinerules", kind: "agents-md", label: ".clinerules (Cline)" },
  { path: ".windsurfrules", kind: "agents-md", label: ".windsurfrules (Windsurf)" },
  { path: ".kiro/steering/guide.md", kind: "agents-md", label: ".kiro/steering (Kiro)" },
  { path: ".aider.conf.yml", kind: "custom", label: ".aider.conf.yml (Aider)" },
  { path: ".amazonq/rules", kind: "agents-md", label: ".amazonq/rules (Amazon Q)" },
  { path: ".gemini/style.md", kind: "agents-md", label: ".gemini/style.md (Gemini CLI)" },
  { path: ".openhands/instructions.md", kind: "agents-md", label: ".openhands/instructions.md (OpenHands)" },
  { path: ".devin/guidelines.md", kind: "agents-md", label: ".devin/guidelines.md (Devin)" },
  { path: ".roo/rules.md", kind: "agents-md", label: ".roo/rules.md (Roo Code)" },
  { path: "CONVENTIONS.md", kind: "agents-md", label: "CONVENTIONS.md (generic)" },
];

const GUARDRAILS_START = "<!-- AMC-GUARDRAILS-START -->";
const GUARDRAILS_END = "<!-- AMC-GUARDRAILS-END -->";

/**
 * Apply guardrails to a target file. If the file already has AMC guardrails,
 * replaces them. Otherwise appends.
 */
export function applyGuardrails(
  filePath: string,
  guardrailsContent: string,
  readFile: (p: string) => string | null,
  writeFile: (p: string, content: string) => void,
): { action: "created" | "updated" | "appended"; path: string } {
  const wrapped = `${GUARDRAILS_START}\n${guardrailsContent}\n${GUARDRAILS_END}`;
  const existing = readFile(filePath);

  if (existing === null) {
    // File doesn't exist — create it
    writeFile(filePath, wrapped + "\n");
    return { action: "created", path: filePath };
  }

  if (existing.includes(GUARDRAILS_START) && existing.includes(GUARDRAILS_END)) {
    // Replace existing guardrails section
    const startIdx = existing.indexOf(GUARDRAILS_START);
    const endIdx = existing.indexOf(GUARDRAILS_END) + GUARDRAILS_END.length;
    const updated = existing.slice(0, startIdx) + wrapped + existing.slice(endIdx);
    writeFile(filePath, updated);
    return { action: "updated", path: filePath };
  }

  // Append to existing file
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  writeFile(filePath, existing + separator + wrapped + "\n");
  return { action: "appended", path: filePath };
}

/* ── JSON Schema export (for CI/CD) ────────────────── */

export interface GuideJSON {
  version: "1.0";
  agentId: string;
  currentLevel: number;
  targetLevel: number;
  generatedAt: string;
  gapCount: number;
  passingCount: number;
  totalQuestions: number;
  framework?: string;
  gaps: Array<{
    questionId: string;
    title: string;
    layer: string;
    currentLevel: number;
    targetLevel: number;
    cliCommands: string[];
    evidenceTypes: string[];
  }>;
  prohibitedBehaviors: string[];
  supportedFrameworks: string[];
}

export function guideToJSON(guide: Guide, framework?: string): GuideJSON {
  const prohibitions: string[] = [];
  for (const s of guide.sections) {
    const q = questionBank.find(bq => bq.id === s.questionId);
    if (!q) continue;
    const targetGate = q.gates.find(g => g.level === s.targetLevel);
    if (targetGate?.mustNotInclude?.auditTypes?.length) {
      for (const t of targetGate.mustNotInclude.auditTypes) {
        if (!prohibitions.includes(t)) prohibitions.push(t);
      }
    }
  }

  return {
    version: "1.0",
    agentId: guide.agentId,
    currentLevel: guide.currentLevel,
    targetLevel: guide.targetLevel,
    generatedAt: guide.generatedAt,
    gapCount: guide.sections.length,
    passingCount: guide.sections.length > 0
      ? Math.max(0, questionBank.length - guide.sections.length)
      : questionBank.length,
    totalQuestions: questionBank.length,
    framework: framework ?? undefined,
    gaps: guide.sections.map(s => ({
      questionId: s.questionId,
      title: s.title,
      layer: s.layerName,
      currentLevel: s.currentLevel,
      targetLevel: s.targetLevel,
      cliCommands: s.cliCommands,
      evidenceTypes: s.evidenceNeeded,
    })),
    prohibitedBehaviors: prohibitions,
    supportedFrameworks: Object.keys(FRAMEWORK_HINTS),
  };
}

/* ── Guide diff ────────────────────────────────────── */

export interface GuideDiff {
  previousLevel: number;
  currentLevel: number;
  targetLevel: number;
  newGaps: string[];
  closedGaps: string[];
  unchangedGaps: string[];
  improvedGaps: Array<{ questionId: string; from: number; to: number }>;
  regressedGaps: Array<{ questionId: string; from: number; to: number }>;
  levelChange: "improved" | "regressed" | "unchanged";
  summary: string;
}

export function diffGuides(previous: Guide, current: Guide): GuideDiff {
  const prevMap = new Map(previous.sections.map(s => [s.questionId, s]));
  const currMap = new Map(current.sections.map(s => [s.questionId, s]));
  const prevIds = new Set(prevMap.keys());
  const currIds = new Set(currMap.keys());

  const newGaps = [...currIds].filter(id => !prevIds.has(id));
  const closedGaps = [...prevIds].filter(id => !currIds.has(id));
  const unchangedGaps: string[] = [];
  const improvedGaps: Array<{ questionId: string; from: number; to: number }> = [];
  const regressedGaps: Array<{ questionId: string; from: number; to: number }> = [];

  // Track per-question level changes for gaps that exist in both
  for (const id of currIds) {
    if (!prevIds.has(id)) continue;
    const prev = prevMap.get(id)!;
    const curr = currMap.get(id)!;
    if (curr.currentLevel > prev.currentLevel) {
      improvedGaps.push({ questionId: id, from: prev.currentLevel, to: curr.currentLevel });
    } else if (curr.currentLevel < prev.currentLevel) {
      regressedGaps.push({ questionId: id, from: prev.currentLevel, to: curr.currentLevel });
    } else {
      unchangedGaps.push(id);
    }
  }

  const levelChange = current.currentLevel > previous.currentLevel
    ? "improved"
    : current.currentLevel < previous.currentLevel
      ? "regressed"
      : "unchanged";

  const parts: string[] = [];
  if (levelChange === "improved") {
    parts.push(`Improved from L${previous.currentLevel} to L${current.currentLevel}.`);
  } else if (levelChange === "regressed") {
    parts.push(`Regressed from L${previous.currentLevel} to L${current.currentLevel}.`);
  } else {
    parts.push(`Level unchanged at L${current.currentLevel}.`);
  }
  if (closedGaps.length > 0) parts.push(`${closedGaps.length} gap${closedGaps.length === 1 ? "" : "s"} closed.`);
  if (newGaps.length > 0) parts.push(`${newGaps.length} new gap${newGaps.length === 1 ? "" : "s"} appeared.`);
  if (improvedGaps.length > 0) parts.push(`${improvedGaps.length} gap${improvedGaps.length === 1 ? "" : "s"} partially improved.`);
  if (regressedGaps.length > 0) parts.push(`${regressedGaps.length} gap${regressedGaps.length === 1 ? "" : "s"} regressed.`);

  return {
    previousLevel: previous.currentLevel,
    currentLevel: current.currentLevel,
    targetLevel: current.targetLevel,
    newGaps,
    closedGaps,
    unchangedGaps,
    improvedGaps,
    regressedGaps,
    levelChange,
    summary: parts.join(" "),
  };
}

/* ── List supported frameworks ─────────────────────── */

export function listSupportedFrameworks(): Array<{ name: string; aliases: string[]; language: string; configFile: string }> {
  return Object.values(FRAMEWORK_HINTS).map(fw => ({
    name: fw.name,
    aliases: fw.aliases,
    language: fw.language,
    configFile: fw.configFile,
  }));
}

/* ── One-liner status ──────────────────────────────── */

export function guideStatusLine(guide: Guide): string {
  const criticals = guide.sections.filter(s => s.severity === "critical").length;
  const highs = guide.sections.filter(s => s.severity === "high").length;
  const mediums = guide.sections.filter(s => s.severity === "medium").length;

  const parts = [`L${guide.currentLevel} → L${guide.targetLevel}`];
  if (guide.sections.length === 0) {
    parts.push("✓ all clear");
  } else {
    parts.push(`${guide.sections.length} gaps`);
    const sevParts: string[] = [];
    if (criticals > 0) sevParts.push(`${criticals} critical`);
    if (highs > 0) sevParts.push(`${highs} high`);
    if (mediums > 0) sevParts.push(`${mediums} medium`);
    parts.push(`(${sevParts.join(", ")})`);
  }
  return parts.join(" | ");
}

/* ── Auto-detect framework from project files ──────── */

export interface DetectedFramework {
  name: string;
  confidence: "high" | "medium" | "low";
  detectedFrom: string;
}

/**
 * Detect the agent framework from project files.
 * Pass a function that checks if a file exists and optionally reads its content.
 */
export function detectFramework(
  fileExists: (path: string) => boolean,
  readFile?: (path: string) => string | null,
): DetectedFramework | null {
  // Check for framework-specific config files first (high confidence)
  if (fileExists("CLAUDE.md") || fileExists("AGENTS.md")) {
    return { name: "claudecode", confidence: "high", detectedFrom: "CLAUDE.md or AGENTS.md" };
  }
  if (fileExists(".cursorrules") || fileExists(".cursor/rules")) {
    return { name: "cursor", confidence: "high", detectedFrom: ".cursorrules" };
  }
  if (fileExists(".kiro/steering/guide.md")) {
    return { name: "kiro", confidence: "high", detectedFrom: ".kiro/steering/" };
  }
  if (fileExists(".gemini/style.md")) {
    return { name: "gemini", confidence: "high", detectedFrom: ".gemini/style.md" };
  }

  // Check package.json for Python/JS dependencies (medium confidence)
  if (readFile) {
    const pyproject = readFile("pyproject.toml");
    if (pyproject) {
      if (pyproject.includes("langchain")) return { name: "langchain", confidence: "high", detectedFrom: "pyproject.toml" };
      if (pyproject.includes("crewai")) return { name: "crewai", confidence: "high", detectedFrom: "pyproject.toml" };
      if (pyproject.includes("autogen") || pyproject.includes("ag2")) return { name: "autogen", confidence: "high", detectedFrom: "pyproject.toml" };
      if (pyproject.includes("llama-index") || pyproject.includes("llama_index")) return { name: "llamaindex", confidence: "high", detectedFrom: "pyproject.toml" };
      if (pyproject.includes("openai")) return { name: "openai", confidence: "medium", detectedFrom: "pyproject.toml" };
    }

    const requirements = readFile("requirements.txt");
    if (requirements) {
      if (requirements.includes("langchain")) return { name: "langchain", confidence: "high", detectedFrom: "requirements.txt" };
      if (requirements.includes("crewai")) return { name: "crewai", confidence: "high", detectedFrom: "requirements.txt" };
      if (requirements.includes("autogen") || requirements.includes("ag2")) return { name: "autogen", confidence: "high", detectedFrom: "requirements.txt" };
      if (requirements.includes("llama-index") || requirements.includes("llama_index")) return { name: "llamaindex", confidence: "high", detectedFrom: "requirements.txt" };
    }

    const packageJson = readFile("package.json");
    if (packageJson) {
      if (packageJson.includes("langchain")) return { name: "langchain", confidence: "medium", detectedFrom: "package.json" };
      if (packageJson.includes("@langchain")) return { name: "langchain", confidence: "high", detectedFrom: "package.json" };
    }

    const csproj = readFile("*.csproj");
    if (csproj && csproj.includes("Microsoft.SemanticKernel")) {
      return { name: "semantickernel", confidence: "high", detectedFrom: "*.csproj" };
    }
  }

  return null;
}

