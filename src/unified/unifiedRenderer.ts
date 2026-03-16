/**
 * Unified Run Renderer — formats the unified run result as terminal output.
 */

import type { UnifiedRunResult, LetterGrade, ModuleResult } from "./unifiedRun.js";

/* ── Color helpers (ANSI) ───────────────────────────────────── */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[38;2;74;239;121m";
const RED = "\x1b[38;2;248;113;113m";
const AMBER = "\x1b[38;2;245;158;11m";
const CYAN = "\x1b[38;2;103;232;249m";
const WHITE = "\x1b[38;2;244;244;245m";
const GRAY = "\x1b[38;2;120;120;130m";

function gradeColor(grade: LetterGrade): string {
  if (grade.startsWith("A")) return GREEN;
  if (grade.startsWith("B")) return CYAN;
  if (grade.startsWith("C")) return AMBER;
  return RED;
}

function pad(s: string, len: number): string {
  // Strip ANSI for length calc
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = len - stripped.length;
  return diff > 0 ? s + " ".repeat(diff) : s;
}

function dots(label: string, totalWidth: number): string {
  const stripped = label.replace(/\x1b\[[0-9;]*m/g, "");
  const dotsNeeded = Math.max(2, totalWidth - stripped.length);
  return `${DIM}${"·".repeat(dotsNeeded)}${RESET}`;
}

/* ── Main renderer ──────────────────────────────────────────── */

export function renderUnifiedResult(result: UnifiedRunResult, opts?: { ci?: boolean }): string {
  const lines: string[] = [];
  const W = 56; // content width

  // Header
  lines.push("");
  lines.push(`  ${DIM}╭${"─".repeat(W)}╮${RESET}`);
  lines.push(`  ${DIM}│${RESET}  ${BOLD}${WHITE}AMC Full Assessment${RESET} ${DIM}—${RESET} ${WHITE}${result.agentId}${RESET}${" ".repeat(Math.max(0, W - 26 - result.agentId.length))}${DIM}│${RESET}`);
  lines.push(`  ${DIM}╰${"─".repeat(W)}╯${RESET}`);
  lines.push("");

  // Module rows
  for (const mod of result.modules) {
    const nameLabel = `  ${mod.icon} ${BOLD}${WHITE}${mod.name}${RESET}`;
    const gradeLabel = mod.skipped
      ? `${DIM}—   (${mod.skipReason})${RESET}`
      : `${gradeColor(mod.grade)}${BOLD}${mod.grade}${RESET}`;

    const dotsFill = dots(`  ${mod.icon} ${mod.name} `, 32);
    lines.push(`  ${mod.icon} ${WHITE}${mod.name}${RESET} ${dotsFill} ${gradeLabel}`);
    lines.push(`    ${DIM}${mod.summary}${RESET}`);

    // Show issues (max 2 per module)
    for (const issue of mod.issues.slice(0, 2)) {
      const icon = mod.grade === "F" || mod.grade.startsWith("D") ? "🔴" : "🟡";
      lines.push(`    ${icon} ${issue}`);
    }
    if (mod.issues.length > 2) {
      lines.push(`    ${DIM}+${mod.issues.length - 2} more${RESET}`);
    }
    lines.push("");
  }

  // Overall grade
  lines.push(`  ${"─".repeat(W)}`);
  const overallColor = gradeColor(result.overallGrade);
  lines.push(`  ${BOLD}${WHITE}Overall Grade:${RESET}  ${overallColor}${BOLD}${result.overallGrade}${RESET}  ${DIM}(${result.overallScore}/100)${RESET}`);
  lines.push(`  ${"─".repeat(W)}`);
  lines.push("");

  // Top fixes
  if (result.topFixes.length > 0) {
    lines.push(`  ${BOLD}${WHITE}Top fixes${RESET} ${DIM}(biggest grade impact):${RESET}`);
    for (let i = 0; i < result.topFixes.length; i++) {
      const fix = result.topFixes[i]!;
      lines.push(`  ${WHITE}${i + 1}.${RESET} ${fix.action}`);
      lines.push(`     ${DIM}${fix.impact}${RESET}`);
      if (fix.command) {
        lines.push(`     ${GREEN}${fix.command}${RESET}`);
      }
    }
    lines.push("");
  }

  // Footer actions
  lines.push(`  ${DIM}CI gate:${RESET}    ${WHITE}amc run --fail-below B${RESET}`);
  lines.push(`  ${DIM}Badge:${RESET}      ${WHITE}amc badge --style full${RESET}`);
  lines.push(`  ${DIM}Fix mode:${RESET}   ${WHITE}amc run --fix${RESET}`);
  lines.push("");

  return lines.join("\n");
}

/* ── CI-friendly output (GitHub Actions annotations) ────────── */

export function renderCIAnnotations(result: UnifiedRunResult): string {
  const lines: string[] = [];

  for (const mod of result.modules) {
    if (mod.skipped) continue;
    for (const issue of mod.issues) {
      if (mod.grade === "F" || mod.grade.startsWith("D")) {
        lines.push(`::error title=AMC ${mod.name}::${issue}`);
      } else if (mod.grade.startsWith("C")) {
        lines.push(`::warning title=AMC ${mod.name}::${issue}`);
      }
    }
  }

  lines.push(`::notice title=AMC Overall Grade::${result.overallGrade} (${result.overallScore}/100)`);
  return lines.join("\n");
}
