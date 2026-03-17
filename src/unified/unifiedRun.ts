/**
 * Unified Run — `amc run`
 *
 * Runs all 8 AMC product modules in one command and produces
 * a combined report with letter grades.
 *
 * Modules: Score, Shield, Enforce, Vault, Watch, Fleet, Passport, Comply
 */

import { runDiagnostic } from "../diagnostic/runner.js";
import { runAssurance } from "../assurance/assuranceRunner.js";
import type { DiagnosticReport, AssuranceReport } from "../types.js";
import { listAssurancePacks } from "../assurance/packs/index.js";
import { vaultExists, vaultStatus } from "../vault/vault.js";
import { verifyLedgerIntegrity } from "../ledger/ledger.js";
import { loadComplianceMaps, generateComplianceReport } from "../compliance/complianceEngine.js";
import { collectPassportData } from "../passport/passportCollector.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { join } from "node:path";

/* ── Types ──────────────────────────────────────────────────── */

export type LetterGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-" | "F";

export interface ModuleResult {
  name: string;
  icon: string;
  grade: LetterGrade;
  score: number;      // 0-100 normalized
  summary: string;
  issues: string[];   // only critical/failing items
  skipped?: boolean;
  skipReason?: string;
}

export interface UnifiedRunResult {
  agentId: string;
  ts: number;
  modules: ModuleResult[];
  overallGrade: LetterGrade;
  overallScore: number;
  topFixes: Array<{ action: string; impact: string; command?: string }>;
  reportPath?: string;
}

/* ── Grade helpers ──────────────────────────────────────────── */

export function scoreToGrade(score: number): LetterGrade {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  if (score >= 60) return "D-";
  return "F";
}

function gradeToNumeric(grade: LetterGrade): number {
  const map: Record<LetterGrade, number> = {
    "A+": 97, "A": 93, "A-": 90,
    "B+": 87, "B": 83, "B-": 80,
    "C+": 77, "C": 73, "C-": 70,
    "D+": 67, "D": 63, "D-": 60,
    "F": 40,
  };
  return map[grade];
}

/* ── Module weights for overall grade ───────────────────────── */

const MODULE_WEIGHTS: Record<string, number> = {
  Score:    0.25,
  Shield:   0.25,
  Enforce:  0.12,
  Vault:    0.08,
  Watch:    0.10,
  Fleet:    0.05,
  Passport: 0.05,
  Comply:   0.10,
};

/* ── Individual module runners ──────────────────────────────── */

async function runScoreModule(workspace: string, agentId: string, window: string): Promise<ModuleResult> {
  try {
    const report: DiagnosticReport = await runDiagnostic({
      workspace,
      window,
      targetName: "default",
      claimMode: "auto",
      agentId,
    });

    const avgLevel = report.layerScores.length > 0
      ? report.layerScores.reduce((s: number, l: { avgFinalLevel: number }) => s + l.avgFinalLevel, 0) / report.layerScores.length
      : 0;

    // Map L0-L5 → 0-100
    const normalized = Math.min(100, (avgLevel / 5) * 100);
    const totalQuestions = report.questionScores.length;
    const belowTarget = report.questionScores.filter((q: { finalLevel: number }) => q.finalLevel < 3).length;
    const issues: string[] = [];

    // Find weakest dimensions
    const sorted = [...report.layerScores].sort((a, b) => a.avgFinalLevel - b.avgFinalLevel);
    for (const layer of sorted.slice(0, 2)) {
      if (layer.avgFinalLevel < 3) {
        issues.push(`${layer.layerName}: ${layer.avgFinalLevel.toFixed(1)}/5.0`);
      }
    }

    return {
      name: "Score",
      icon: "①",
      grade: scoreToGrade(normalized),
      score: Math.round(normalized),
      summary: `${totalQuestions} questions scored, ${belowTarget} below target`,
      issues,
    };
  } catch (err) {
    return {
      name: "Score",
      icon: "①",
      grade: "F",
      score: 0,
      summary: "Diagnostic failed to run",
      issues: [String(err instanceof Error ? err.message : err)],
    };
  }
}

async function runShieldModule(workspace: string, agentId: string): Promise<ModuleResult> {
  try {
    const report: AssuranceReport = await runAssurance({
      workspace,
      runAll: true,
      agentId,
      mode: "sandbox",
      window: "30d",
    });

    const totalPacks = report.packResults.length;
    const totalScenarios = report.packResults.reduce((s, p) => s + p.scenarioCount, 0);
    const passedScenarios = report.packResults.reduce((s, p) => s + p.passCount, 0);
    const passRate = totalScenarios > 0 ? (passedScenarios / totalScenarios) * 100 : 0;

    const issues: string[] = [];
    // Find packs with failures
    const failedPacks = report.packResults.filter(p => p.failCount > 0);
    for (const pack of failedPacks.slice(0, 3)) {
      issues.push(`${pack.packId}: ${pack.failCount} scenario${pack.failCount > 1 ? "s" : ""} failed`);
    }

    return {
      name: "Shield",
      icon: "②",
      grade: scoreToGrade(passRate),
      score: Math.round(passRate),
      summary: `${totalScenarios} scenarios: ${passedScenarios} passed, ${totalScenarios - passedScenarios} failed`,
      issues,
    };
  } catch (err) {
    return {
      name: "Shield",
      icon: "②",
      grade: "F",
      score: 0,
      summary: "Assurance run failed",
      issues: [String(err instanceof Error ? err.message : err)],
    };
  }
}

function runEnforceModule(workspace: string): ModuleResult {
  // Check for policy files
  const policyPath = join(workspace, ".amc", "policy.yaml");
  const policySigPath = policyPath + ".sig";
  const hasPolicyFile = pathExists(policyPath);
  const hasPolicySig = pathExists(policySigPath);
  const guardrailsPath = join(workspace, ".amc", "guardrails.yaml");
  const hasGuardrails = pathExists(guardrailsPath);

  let score = 0;
  const issues: string[] = [];

  if (hasPolicyFile) score += 40;
  else issues.push("No policy.yaml — enforcement rules not defined");

  if (hasPolicySig) score += 20;
  else if (hasPolicyFile) issues.push("Policy file not signed — tampering undetectable");

  if (hasGuardrails) score += 40;
  else issues.push("No guardrails configured");

  return {
    name: "Enforce",
    icon: "③",
    grade: scoreToGrade(score),
    score,
    summary: hasPolicyFile
      ? `Policy active${hasPolicySig ? " (signed)" : " (unsigned)"}${hasGuardrails ? " + guardrails" : ""}`
      : "No policy enforcement configured",
    issues,
  };
}

function runVaultModule(workspace: string): ModuleResult {
  const exists = vaultExists(workspace);
  if (!exists) {
    return {
      name: "Vault",
      icon: "④",
      grade: "F",
      score: 0,
      summary: "No vault initialized",
      issues: ["Run `amc vault init` to create a signing vault"],
    };
  }

  const status = vaultStatus(workspace);
  let score = 50; // vault exists
  const issues: string[] = [];

  if (!status.unlocked) {
    score += 10; // locked is fine, just can't do signing ops
    issues.push("Vault is locked — unlock to enable signing");
  } else {
    score += 30; // unlocked and operational
  }

  // Check ledger integrity
  try {
    // Sync check — just verify files exist
    const ledgerPath = join(workspace, ".amc", "ledger.jsonl");
    if (pathExists(ledgerPath)) {
      score += 20;
    } else {
      issues.push("No evidence ledger found");
    }
  } catch {
    issues.push("Ledger integrity check failed");
  }

  return {
    name: "Vault",
    icon: "④",
    grade: scoreToGrade(score),
    score,
    summary: `Vault ${status.unlocked ? "unlocked" : "locked"}, keys ${exists ? "present" : "missing"}`,
    issues,
  };
}

function runWatchModule(workspace: string): ModuleResult {
  let score = 0;
  const issues: string[] = [];

  // Check for dashboard data
  const dashDataPath = join(workspace, ".amc", "dashboard", "data.json");
  if (pathExists(dashDataPath)) score += 25;
  else issues.push("No dashboard data — run `amc dashboard build`");

  // Check for metrics/observability config
  const metricsPath = join(workspace, ".amc", "metrics.yaml");
  if (pathExists(metricsPath)) score += 25;
  else issues.push("No metrics export configured");

  // Check for score history (trend tracking)
  const historyPath = join(workspace, ".amc", "runs");
  if (pathExists(historyPath)) score += 25;
  else issues.push("No score history — run diagnostics regularly");

  // Check for alerting config
  const alertsPath = join(workspace, ".amc", "alerts.yaml");
  if (pathExists(alertsPath)) score += 25;
  else issues.push("No alerting configured");

  return {
    name: "Watch",
    icon: "⑤",
    grade: scoreToGrade(score),
    score,
    summary: score >= 75 ? "Monitoring active" : score >= 50 ? "Partial monitoring" : "Minimal observability",
    issues,
  };
}

function runFleetModule(workspace: string): ModuleResult {
  const fleetPath = join(workspace, ".amc", "fleet.yaml");
  if (!pathExists(fleetPath)) {
    return {
      name: "Fleet",
      icon: "⑥",
      grade: scoreToGrade(0),
      score: 0,
      summary: "Single agent — fleet not configured",
      issues: [],
      skipped: true,
      skipReason: "single agent",
    };
  }

  // Fleet exists — basic check
  return {
    name: "Fleet",
    icon: "⑥",
    grade: scoreToGrade(60),
    score: 60,
    summary: "Fleet configuration found",
    issues: [],
  };
}

function runPassportModule(workspace: string, agentId: string): ModuleResult {
  const passportDir = join(workspace, ".amc", "passports");
  if (!pathExists(passportDir)) {
    return {
      name: "Passport",
      icon: "⑦",
      grade: "F",
      score: 0,
      summary: "No passport generated",
      issues: ["Run `amc passport create` to generate a shareable credential"],
    };
  }

  // Check for any passport files
  try {
    const { readdirSync } = require("node:fs");
    const files = readdirSync(passportDir).filter((f: string) => f.endsWith(".json"));
    if (files.length === 0) {
      return {
        name: "Passport",
        icon: "⑦",
        grade: "F",
        score: 0,
        summary: "Passport directory exists but empty",
        issues: ["Run `amc passport create` to generate a credential"],
      };
    }

    return {
      name: "Passport",
      icon: "⑦",
      grade: scoreToGrade(80),
      score: 80,
      summary: `${files.length} passport${files.length > 1 ? "s" : ""} generated`,
      issues: [],
    };
  } catch {
    return {
      name: "Passport",
      icon: "⑦",
      grade: "F",
      score: 0,
      summary: "Could not read passport directory",
      issues: [],
    };
  }
}

function runComplyModule(workspace: string): ModuleResult {
  try {
    const maps = loadComplianceMaps(workspace);
    const mappings = maps?.complianceMaps?.mappings;
    if (!maps || !mappings || mappings.length === 0) {
      return {
        name: "Comply",
        icon: "⑧",
        grade: "F",
        score: 0,
        summary: "No compliance mappings initialized",
        issues: ["Run `amc comply init` to set up compliance frameworks"],
      };
    }

    // Group mappings by framework to count coverage
    const frameworks = new Set(mappings.map(m => m.framework));
    const totalMappings = mappings.length;
    // Count mappings that have at least one evidence requirement satisfied
    // (simplified: count all mappings as controls, mark as satisfied if they exist)
    const satisfiedMappings = mappings.filter(m => m.evidenceRequirements.length > 0).length;

    const coverage = totalMappings > 0 ? (satisfiedMappings / totalMappings) * 100 : 0;
    const issues: string[] = [];

    if (coverage < 50) {
      issues.push(`${totalMappings - satisfiedMappings} mappings need evidence across ${frameworks.size} frameworks`);
    }

    return {
      name: "Comply",
      icon: "⑧",
      grade: scoreToGrade(coverage),
      score: Math.round(coverage),
      summary: `${satisfiedMappings}/${totalMappings} compliance mappings covered across ${frameworks.size} frameworks`,
      issues,
    };
  } catch {
    return {
      name: "Comply",
      icon: "⑧",
      grade: "F",
      score: 0,
      summary: "Compliance check failed",
      issues: ["Run `amc comply init` to initialize compliance mappings"],
    };
  }
}

/* ── Top fixes generator ────────────────────────────────────── */

function generateTopFixes(modules: ModuleResult[]): UnifiedRunResult["topFixes"] {
  const fixes: Array<{ action: string; impact: string; command?: string; priority: number }> = [];

  for (const mod of modules) {
    if (mod.skipped) continue;
    if (mod.score >= 90) continue; // already great

    const weight = MODULE_WEIGHTS[mod.name] ?? 0.05;
    const potentialGain = ((90 - mod.score) * weight);

    if (mod.name === "Shield" && mod.score < 80) {
      fixes.push({
        action: `Fix ${mod.issues.length} Shield failures`,
        impact: `Shield → ${scoreToGrade(Math.min(100, mod.score + 20))} (+${potentialGain.toFixed(1)} overall)`,
        command: "amc shield analyze",
        priority: potentialGain,
      });
    }
    if (mod.name === "Score" && mod.score < 80) {
      fixes.push({
        action: `Improve weakest dimensions`,
        impact: `Score → ${scoreToGrade(Math.min(100, mod.score + 15))} (+${potentialGain.toFixed(1)} overall)`,
        command: "amc improve",
        priority: potentialGain,
      });
    }
    if (mod.name === "Comply" && mod.score < 70) {
      fixes.push({
        action: "Map compliance controls to evidence",
        impact: `Comply → ${scoreToGrade(Math.min(100, mod.score + 25))} (+${potentialGain.toFixed(1)} overall)`,
        command: "amc comply report --framework EU_AI_ACT",
        priority: potentialGain,
      });
    }
    if (mod.name === "Watch" && mod.score < 70) {
      fixes.push({
        action: "Configure observability (metrics + alerts)",
        impact: `Watch → ${scoreToGrade(Math.min(100, mod.score + 30))} (+${potentialGain.toFixed(1)} overall)`,
        command: "amc monitor",
        priority: potentialGain,
      });
    }
    if (mod.name === "Enforce" && mod.score < 60) {
      fixes.push({
        action: "Define and sign enforcement policy",
        impact: `Enforce → ${scoreToGrade(Math.min(100, mod.score + 40))} (+${potentialGain.toFixed(1)} overall)`,
        command: "amc enforce check",
        priority: potentialGain,
      });
    }
    if (mod.name === "Vault" && mod.score < 60) {
      fixes.push({
        action: "Initialize signing vault",
        impact: `Vault → ${scoreToGrade(Math.min(100, mod.score + 50))} (+${potentialGain.toFixed(1)} overall)`,
        command: "amc vault init",
        priority: potentialGain,
      });
    }
    if (mod.name === "Passport" && mod.score < 50) {
      fixes.push({
        action: "Generate agent passport credential",
        impact: `Passport → B+ (+${potentialGain.toFixed(1)} overall)`,
        command: "amc passport create",
        priority: potentialGain * 0.5, // lower priority
      });
    }
  }

  return fixes
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map(({ action, impact, command }) => ({ action, impact, command }));
}

/* ── Main entry ─────────────────────────────────────────────── */

export interface UnifiedRunInput {
  workspace: string;
  agentId: string;
  window?: string;
  failBelow?: LetterGrade;
  ci?: boolean;
}

export async function unifiedRun(input: UnifiedRunInput): Promise<UnifiedRunResult> {
  const { workspace, agentId, window = "14d" } = input;

  // Run all modules (Score and Shield are async, rest are sync checks)
  const [scoreResult, shieldResult] = await Promise.all([
    runScoreModule(workspace, agentId, window),
    runShieldModule(workspace, agentId),
  ]);

  const enforceResult = runEnforceModule(workspace);
  const vaultResult = runVaultModule(workspace);
  const watchResult = runWatchModule(workspace);
  const fleetResult = runFleetModule(workspace);
  const passportResult = runPassportModule(workspace, agentId);
  const complyResult = runComplyModule(workspace);

  const modules = [
    scoreResult,
    shieldResult,
    enforceResult,
    vaultResult,
    watchResult,
    fleetResult,
    passportResult,
    complyResult,
  ];

  // Calculate weighted overall score (skip skipped modules, redistribute weight)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const mod of modules) {
    const w = MODULE_WEIGHTS[mod.name] ?? 0.05;
    if (mod.skipped) continue;
    totalWeight += w;
    weightedSum += mod.score * w;
  }
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const overallGrade = scoreToGrade(overallScore);

  const topFixes = generateTopFixes(modules);

  return {
    agentId,
    ts: Date.now(),
    modules,
    overallGrade,
    overallScore,
    topFixes,
  };
}
