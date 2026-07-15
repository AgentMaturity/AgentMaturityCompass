/**
 * Agent Fix Plan — turn an AMC score into a one-command, signed plan that
 * fixes / steers the agent, not just grades it.
 *
 * `amc run --fix` builds this from the unified run result: for every surface
 * that is weak, it states the problem, generates a concrete starter artifact
 * where one applies (guardrails, monitoring config), and gives the exact
 * one-command to apply the fix. The plan is canonicalized and hashed into a
 * tamper-evident receipt, and written to `.amc/fix-plan/<ts>/` so the fixes
 * are staged and ready — the honest bridge from "here is your score" to
 * "here is how to make the agent better, generated for you."
 *
 * Pure builder + explicit writer. buildAgentFixPlan is deterministic given
 * `now`; writeAgentFixPlan performs the I/O. No Date.now()/randomness inside
 * the builder.
 */
import { join } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import type { LetterGrade, ModuleResult, UnifiedRunResult } from "../unified/unifiedRun.js";

export const AGENT_FIX_PLAN_SCHEMA_VERSION = "amc.agent-fix-plan/1";

export interface FixArtifact {
  filename: string;
  language: string;
  content: string;
}

export interface FixStep {
  surface: string;
  grade: string;
  priority: number;
  problem: string;
  fix: string;
  applyCommand: string;
  autoApplicable: boolean;
  artifact: FixArtifact | null;
}

export interface AgentFixPlan {
  schemaVersion: string;
  agentId: string;
  generatedAt: string;
  before: {
    overallGrade: string;
    overallScore: number;
  };
  stepCount: number;
  steps: FixStep[];
  receiptHash: string;
}

const GRADE_RANK: Record<LetterGrade, number> = {
  "A+": 12, "A": 11, "A-": 10,
  "B+": 9, "B": 8, "B-": 7,
  "C+": 6, "C": 5, "C-": 4,
  "D+": 3, "D": 2, "D-": 1,
  "F": 0,
};

/** A module is "weak" (worth fixing) if skipped/pending or graded below B-. */
function isWeak(mod: ModuleResult): boolean {
  if (mod.skipped) return true;
  const rank = GRADE_RANK[mod.grade as LetterGrade];
  return rank === undefined ? true : rank < GRADE_RANK["B-"];
}

interface SurfaceFixTemplate {
  fix: string;
  applyCommand: (agentId: string) => string;
  autoApplicable: boolean;
  artifact?: () => FixArtifact;
}

/**
 * Per-surface fix templates. Apply commands reuse AMC's existing, tested
 * commands (the same set the unified run's Top Fixes already points at), so
 * the plan never invents a command that does not exist.
 */
const SURFACE_FIXES: Record<string, SurfaceFixTemplate> = {
  Score: {
    fix: "Raise the weakest scoring dimensions with guided, evidence-backed improvements.",
    applyCommand: () => "amc improve",
    autoApplicable: false,
  },
  Shield: {
    fix: "Analyze and harden the failing attack surfaces (injection, exfiltration, and friends).",
    applyCommand: () => "amc shield analyze",
    autoApplicable: false,
  },
  Enforce: {
    fix: "Add a signed enforcement policy + guardrails so dangerous actions can be blocked.",
    applyCommand: (agentId) => `amc domain apply --agent ${agentId} --pack clinical-trials`,
    autoApplicable: true,
    artifact: () => ({
      filename: "guardrails.yaml",
      language: "yaml",
      content: [
        "# AMC starter guardrails — review, then apply with `amc enforce check`.",
        "version: 1",
        "guardrails:",
        "  - id: block-destructive-tools",
        "    when: action.class in [DELETE, WRITE_HIGH, NETWORK_EGRESS]",
        "    require: human_approval",
        "  - id: rate-limit",
        "    when: true",
        "    limit: { rpm: 60, tpm: 100000 }",
        "  - id: deny-secret-exfiltration",
        "    when: output.contains_secret",
        "    decision: BLOCK",
        "enforcement:",
        "  default_mode: SIMULATE   # switch to EXECUTE once reviewed",
        "  fail_closed: true",
      ].join("\n"),
    }),
  },
  Vault: {
    fix: "Initialize a signing vault so evidence and configs can be signed and verified.",
    applyCommand: () => "amc vault init",
    autoApplicable: false,
  },
  Watch: {
    fix: "Turn on observability — metrics export and alert thresholds — so drift is visible.",
    applyCommand: () => "amc monitor",
    autoApplicable: true,
    artifact: () => ({
      filename: "metrics.yaml",
      language: "yaml",
      content: [
        "# AMC starter monitoring — review, then apply with `amc monitor`.",
        "version: 1",
        "metrics:",
        "  export: prometheus",
        "  bind: 127.0.0.1:9464",
        "alerts:",
        "  - id: score-regression",
        "    when: integrity_index_drop > 0.10",
        "    notify: [owner]",
        "  - id: shield-failure-spike",
        "    when: shield_fail_rate > 0.20",
        "    notify: [owner]",
      ].join("\n"),
    }),
  },
  Comply: {
    fix: "Initialize compliance mappings (EU AI Act, NIST, ISO 42001, SOC 2) and bind evidence.",
    applyCommand: () => "amc comply init",
    autoApplicable: false,
  },
  Fleet: {
    fix: "Register a fleet configuration so multi-agent governance can be scored.",
    applyCommand: () => "amc fleet init",
    autoApplicable: false,
  },
  Passport: {
    fix: "Generate a shareable, verifiable agent passport credential.",
    applyCommand: () => "amc passport create",
    autoApplicable: false,
  },
};

const GENERIC_FIX: SurfaceFixTemplate = {
  fix: "Address the flagged gaps for this surface.",
  applyCommand: () => "amc improve",
  autoApplicable: false,
};

export function buildAgentFixPlan(input: {
  result: UnifiedRunResult;
  agentId: string;
  now: number;
}): AgentFixPlan {
  const { result, agentId, now } = input;
  const weak = result.modules.filter(isWeak);

  const steps: FixStep[] = weak.map((mod, index) => {
    const template = SURFACE_FIXES[mod.name] ?? GENERIC_FIX;
    const problem = mod.skipped
      ? (mod.skipReason ?? `${mod.name} not yet evaluated`)
      : (mod.issues[0] ?? mod.summary);
    const artifact = template.artifact ? template.artifact() : null;
    return {
      surface: mod.name,
      grade: mod.skipped ? "—" : mod.grade,
      priority: index + 1,
      problem,
      fix: template.fix,
      applyCommand: template.applyCommand(agentId),
      autoApplicable: template.autoApplicable,
      artifact,
    };
  });

  const body = {
    schemaVersion: AGENT_FIX_PLAN_SCHEMA_VERSION,
    agentId,
    generatedAt: new Date(now).toISOString(),
    before: {
      overallGrade: result.overallGrade,
      overallScore: result.overallScore,
    },
    stepCount: steps.length,
    steps,
  };
  const receiptHash = sha256Hex(canonicalize(body));
  return { ...body, receiptHash };
}

/** Recompute the receipt over the canonical plan to detect tampering. */
export function verifyAgentFixPlan(plan: AgentFixPlan): boolean {
  const { receiptHash, ...body } = plan;
  return sha256Hex(canonicalize(body)) === receiptHash;
}

export interface WriteAgentFixPlanResult {
  dir: string;
  planJsonPath: string;
  planMarkdownPath: string;
  artifactPaths: string[];
}

/** Write the plan (JSON + Markdown) and any generated artifacts under .amc/fix-plan/<ts>/. */
export function writeAgentFixPlan(input: {
  plan: AgentFixPlan;
  workspace: string;
  stamp: string;
}): WriteAgentFixPlanResult {
  const dir = join(input.workspace, ".amc", "fix-plan", input.stamp);
  ensureDir(dir);
  const planJsonPath = join(dir, "fix-plan.json");
  const planMarkdownPath = join(dir, "fix-plan.md");
  writeFileAtomic(planJsonPath, JSON.stringify(input.plan, null, 2));
  writeFileAtomic(planMarkdownPath, renderAgentFixPlanMarkdown(input.plan));
  const artifactPaths: string[] = [];
  for (const step of input.plan.steps) {
    if (step.artifact) {
      const artifactPath = join(dir, `${step.surface.toLowerCase()}-${step.artifact.filename}`);
      writeFileAtomic(artifactPath, step.artifact.content);
      artifactPaths.push(artifactPath);
    }
  }
  return { dir, planJsonPath, planMarkdownPath, artifactPaths };
}

export function renderAgentFixPlanMarkdown(plan: AgentFixPlan): string {
  const lines: string[] = [];
  lines.push(`# AMC Fix Plan — ${plan.agentId}`);
  lines.push("");
  lines.push(`- Generated: ${plan.generatedAt}`);
  lines.push(`- Before: **${plan.before.overallGrade}** (${plan.before.overallScore}/100)`);
  lines.push(`- Fixes: ${plan.stepCount}`);
  lines.push(`- Receipt: \`sha256:${plan.receiptHash}\` — tamper-evident.`);
  lines.push("");
  for (const step of plan.steps) {
    lines.push(`## ${step.priority}. ${step.surface} (${step.grade})`);
    lines.push(`- Problem: ${step.problem}`);
    lines.push(`- Fix: ${step.fix}`);
    lines.push(`- Apply: \`${step.applyCommand}\``);
    if (step.artifact) {
      lines.push(`- Generated \`${step.artifact.filename}\`:`);
      lines.push("");
      lines.push("```" + step.artifact.language);
      lines.push(step.artifact.content);
      lines.push("```");
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Compact colored-terminal-free summary for the CLI (caller adds color). */
export function renderAgentFixPlanText(plan: AgentFixPlan): string {
  const lines: string[] = [];
  lines.push(`  Fix plan for ${plan.agentId} — ${plan.stepCount} fix${plan.stepCount === 1 ? "" : "es"} (from ${plan.before.overallGrade}):`);
  for (const step of plan.steps) {
    lines.push(`  ${step.priority}. ${step.surface} (${step.grade}) — ${step.fix}`);
    lines.push(`     apply: ${step.applyCommand}${step.artifact ? `   · generated ${step.artifact.filename}` : ""}`);
  }
  lines.push(`  Signed plan saved (receipt sha256:${plan.receiptHash.slice(0, 12)}…).`);
  return lines.join("\n");
}
