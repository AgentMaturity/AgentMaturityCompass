import { join } from "node:path";
import inquirer from "inquirer";
import YAML from "yaml";
import { loadContextGraph } from "../context/contextGraph.js";
import { openLedger } from "../ledger/ledger.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { loadTargetProfile } from "../targets/targetProfile.js";
import { generateUpgradePlan } from "./upgradeEngine.js";
import type { DiagnosticReport } from "../types.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";

function latestRunId(workspace: string, agentId?: string): string {
  const ledger = openLedger(workspace);
  try {
    const runs = ledger.listRuns();
    const resolvedAgent = resolveAgentId(workspace, agentId);
    const withAgent = runs.filter((run) => {
      try {
        const report = loadRunReport(workspace, run.run_id, resolvedAgent);
        return report.agentId === resolvedAgent;
      } catch {
        return false;
      }
    });
    const valid = withAgent.find((run) => run.status === "VALID") ?? withAgent[0];
    if (!valid) {
      throw new Error("No runs found. Execute `amc run` first.");
    }
    return valid.run_id;
  } finally {
    ledger.close();
  }
}

function loadLatestRun(workspace: string, agentId?: string): DiagnosticReport {
  const runId = latestRunId(workspace, agentId);
  return loadRunReport(workspace, runId, agentId);
}

function readYamlOrEmpty(file: string): Record<string, unknown> {
  if (!pathExists(file)) {
    return {};
  }
  return (YAML.parse(readUtf8(file)) as Record<string, unknown> | null) ?? {};
}

function applyGuardrailPatch(guardrailsPath: string, questionId: string, action: string): void {
  const doc = readYamlOrEmpty(guardrailsPath);
  const tuning = (doc.tuning as Record<string, unknown> | undefined) ?? {};
  const perQuestion = (tuning.perQuestion as Record<string, string[]> | undefined) ?? {};
  const list = perQuestion[questionId] ?? [];
  if (!list.includes(action)) {
    list.push(action);
  }
  perQuestion[questionId] = list;
  tuning.perQuestion = perQuestion;
  doc.tuning = tuning;
  writeFileAtomic(guardrailsPath, YAML.stringify(doc), 0o644);
}

function applyEvalPatch(evalHarnessPath: string, questionId: string): void {
  const doc = readYamlOrEmpty(evalHarnessPath);
  const suites = Array.isArray(doc.suites) ? (doc.suites as Array<Record<string, unknown>>) : [];
  const suiteName = `tuning-${questionId.toLowerCase()}`;
  if (!suites.some((suite) => suite.name === suiteName)) {
    suites.push({
      name: suiteName,
      checks: ["gate_requirements", "evidence_coverage", "no_critical_audits"]
    });
  }
  doc.suites = suites;
  writeFileAtomic(evalHarnessPath, YAML.stringify(doc), 0o644);
}

function applyPromptPatch(promptFile: string, questionId: string, note: string): void {
  const existing = pathExists(promptFile) ? readUtf8(promptFile) : "# AMC Prompt Addendum\n";
  const marker = `## Tune ${questionId}`;
  if (existing.includes(marker)) {
    return;
  }

  const appended = `${existing.trim()}\n\n${marker}\n- ${note}\n`;
  writeFileAtomic(promptFile, appended, 0o644);
}

function applyContextPatch(contextFile: string, questionId: string): void {
  if (!pathExists(contextFile)) {
    return;
  }
  const parsed = JSON.parse(readUtf8(contextFile)) as Record<string, unknown>;
  const entities = Array.isArray(parsed.entities) ? (parsed.entities as Array<Record<string, unknown>>) : [];
  const id = `tune-${questionId}`;
  if (!entities.some((entity) => entity.id === id)) {
    entities.push({
      id,
      type: "Constraint",
      label: `Tuning requirement for ${questionId}`,
      details: "Added by amc tune wizard"
    });
  }
  parsed.entities = entities;
  writeFileAtomic(contextFile, JSON.stringify(parsed, null, 2), 0o644);
}

export async function runTuneWizard(workspace: string, targetName: string): Promise<{
  summary: string[];
  cron: string;
  rerunSteps: string[];
}> {
  return runTuneWizardForAgent(workspace, targetName);
}

export async function runTuneWizardForAgent(
  workspace: string,
  targetName: string,
  agentId?: string
): Promise<{
  summary: string[];
  cron: string;
  rerunSteps: string[];
}> {
  const resolvedAgent = resolveAgentId(workspace, agentId);
  const paths = getAgentPaths(workspace, resolvedAgent);
  const target = loadTargetProfile(workspace, targetName, resolvedAgent);
  const run = loadLatestRun(workspace, resolvedAgent);

  const gaps = run.questionScores
    .map((score) => ({
      questionId: score.questionId,
      current: score.finalLevel,
      target: target.mapping[score.questionId] ?? 0,
      supported: score.supportedMaxLevel,
      claimed: score.claimedLevel,
      flags: score.flags,
      gap: (target.mapping[score.questionId] ?? 0) - score.finalLevel
    }))
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 10);

  const summary = gaps.map(
    (gap, index) =>
      `${index + 1}. ${gap.questionId} gap=${gap.gap} (current ${gap.current} -> target ${gap.target}); cap reason: supported=${gap.supported}, flags=${gap.flags.join(",") || "none"}`
  );

  const guardrailsPath = paths.guardrails;
  const evalHarnessPath = paths.evalHarness;
  const promptPath = paths.promptAddendum;
  const contextPath = paths.contextGraph;

  for (const gap of gaps) {
    const choice = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message: `${gap.questionId}: choose tuning action`,
        choices: [
          { name: "A) Enable/strengthen guardrails", value: "A" },
          { name: "B) Add verification steps & eval coverage", value: "B" },
          { name: "C) Improve observability/logging", value: "C" },
          { name: "D) Strengthen compliance/permission checks", value: "D" },
          { name: "E) Improve prompting standards", value: "E" },
          { name: "F) Clarify context graph nodes", value: "F" },
          { name: "Skip this gap", value: "S" }
        ],
        default: "A"
      }
    ]);

    if (choice.action === "A") {
      applyGuardrailPatch(guardrailsPath, gap.questionId, "guardrails_hardened");
    }
    if (choice.action === "B") {
      applyEvalPatch(evalHarnessPath, gap.questionId);
    }
    if (choice.action === "C") {
      applyGuardrailPatch(guardrailsPath, gap.questionId, "observability_boost");
      applyEvalPatch(evalHarnessPath, gap.questionId);
    }
    if (choice.action === "D") {
      applyGuardrailPatch(guardrailsPath, gap.questionId, "compliance_permissions_enforced");
    }
    if (choice.action === "E") {
      applyPromptPatch(promptPath, gap.questionId, "Use stricter evidence-linked structure for this question area.");
    }
    if (choice.action === "F") {
      applyContextPatch(contextPath, gap.questionId);
    }
  }

  const cron = `0 9 * * 1 cd <workspace> && amc --agent ${resolvedAgent} verify && amc --agent ${resolvedAgent} run --window 14d --target default --output ${paths.reportsDir}/latest.md`;

  return {
    summary,
    cron,
    rerunSteps: [
      `amc --agent ${resolvedAgent} verify`,
      `amc --agent ${resolvedAgent} wrap <runtime> -- <args...>`,
      `amc --agent ${resolvedAgent} run --window 14d --target default`
    ]
  };
}

export async function runUpgradeWizard(workspace: string, destination: string): Promise<{
  planPath: string;
  phaseCounts: Array<{ phase: string; tasks: number }>;
}> {
  return runUpgradeWizardForAgent(workspace, destination);
}

export async function runUpgradeWizardForAgent(
  workspace: string,
  destination: string,
  agentId?: string
): Promise<{
  planPath: string;
  phaseCounts: Array<{ phase: string; tasks: number }>;
}> {
  const resolvedAgent = resolveAgentId(workspace, agentId);
  const paths = getAgentPaths(workspace, resolvedAgent);
  const run = loadLatestRun(workspace, resolvedAgent);
  const contextGraph = loadContextGraph(workspace, resolvedAgent);

  const plan =
    destination.startsWith("target:")
      ? generateUpgradePlan(
          run,
          { type: "target", profile: loadTargetProfile(workspace, destination.slice("target:".length), resolvedAgent) },
          contextGraph
        )
      : generateUpgradePlan(run, { type: "excellence" }, contextGraph);

  const planPath = join(paths.reportsDir, `upgrade-${Date.now()}.md`);
  ensureDir(paths.reportsDir);

  const lines: string[] = [];
  lines.push(`# Upgrade Plan (${plan.mode})`);
  lines.push("");
  for (const phase of plan.phases) {
    lines.push(`## ${phase.phase}`);
    for (const task of phase.tasks) {
      lines.push(`- ${task.questionId}: current ${task.current}, target ${task.target}, gap ${task.gap}`);
      lines.push(`  - Why: ${task.reason}`);
      // A task whose next level AMC cannot evaluate carries only its reason (P1-07).
      if (task.implementation.length > 0) lines.push(`  - Implement: ${task.implementation.join(" | ")}`);
      if (task.acceptanceCriteria.length > 0) lines.push(`  - Accept: ${task.acceptanceCriteria.join(" | ")}`);
      if (task.requiredEvidence.length > 0) lines.push(`  - Evidence: ${task.requiredEvidence.join(" | ")}`);
    }
    lines.push("");
  }

  lines.push("## Owner Tasks");
  for (const task of plan.ownerTasks) {
    lines.push(`- ${task}`);
  }
  lines.push("");
  lines.push("## Agent Tasks");
  for (const task of plan.agentTasks) {
    lines.push(`- ${task}`);
  }

  writeFileAtomic(planPath, lines.join("\n"), 0o644);

  return {
    planPath,
    phaseCounts: plan.phases.map((phase) => ({ phase: phase.phase, tasks: phase.tasks.length }))
  };
}
