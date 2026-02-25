/**
 * AMC CLI Formatting — Unified output styling
 * Used by all CLI commands for consistent, world-class terminal output.
 */
import chalk from "chalk";

/* ── BRAND COLORS ────────────────────────────────── */
const g = chalk.hex("#00ff41");      // primary green
const g2 = chalk.hex("#00cc33");     // muted green
const amber = chalk.hex("#f59e0b");  // warning
const red = chalk.hex("#ef4444");    // critical
const dim = chalk.gray;              // secondary text
const muted = chalk.hex("#6b7280");  // tertiary

/* ── BOX DRAWING ─────────────────────────────────── */
const BOX = {
  tl: "┌", tr: "┐", bl: "└", br: "┘",
  h: "─", v: "│", lj: "├", rj: "┤",
  tj: "┬", bj: "┴", x: "┼",
} as const;

const HEAVY = {
  tl: "╔", tr: "╗", bl: "╚", br: "╝",
  h: "═", v: "║",
} as const;

/* ── HELPERS ─────────────────────────────────────── */
function pad(s: string, len: number, align: "left" | "right" | "center" = "left"): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = len - stripped.length;
  if (diff <= 0) return s;
  if (align === "right") return " ".repeat(diff) + s;
  if (align === "center") {
    const left = Math.floor(diff / 2);
    return " ".repeat(left) + s + " ".repeat(diff - left);
  }
  return s + " ".repeat(diff);
}

function repeat(ch: string, n: number): string {
  return ch.repeat(Math.max(0, n));
}

/* ── LOGO ────────────────────────────────────────── */
export function logo(): string {
  return [
    "",
    g("  🧭 Agent Maturity Compass"),
    dim("  The credit score for AI agents"),
    "",
  ].join("\n");
}

/* ── SECTION HEADER ──────────────────────────────── */
export function header(title: string, subtitle?: string): string {
  const w = 52;
  const lines = [
    dim(BOX.tl + repeat(BOX.h, w) + BOX.tr),
    dim(BOX.v) + "  " + g.bold(title) + " ".repeat(Math.max(0, w - title.length - 1)) + dim(BOX.v),
  ];
  if (subtitle) {
    lines.push(dim(BOX.v) + "  " + dim(subtitle) + " ".repeat(Math.max(0, w - subtitle.length - 1)) + dim(BOX.v));
  }
  lines.push(dim(BOX.bl + repeat(BOX.h, w) + BOX.br));
  return lines.join("\n");
}

/* ── SCORE BOX ───────────────────────────────────── */
export function scoreBox(score: number, max: number, label: string, level?: string): string {
  const w = 44;
  const pct = Math.round((score / max) * 100);
  const barW = 24;
  const filled = Math.round((pct / 100) * barW);
  const bar = g("█".repeat(filled)) + dim("░".repeat(barW - filled));
  const scoreStr = `${score.toFixed(1)} / ${max.toFixed(1)}`;
  const levelStr = level ? `  ${level}` : "";

  return [
    dim(HEAVY.tl + repeat(HEAVY.h, w) + HEAVY.tr),
    dim(HEAVY.v) + "  " + chalk.white.bold(label) + " ".repeat(Math.max(0, w - label.length - scoreStr.length - levelStr.length - 3)) + g.bold(scoreStr) + amber(levelStr) + " " + dim(HEAVY.v),
    dim(HEAVY.v) + "  " + bar + "  " + dim(`${pct}%`) + " ".repeat(Math.max(0, w - barW - 8)) + dim(HEAVY.v),
    dim(HEAVY.bl + repeat(HEAVY.h, w) + HEAVY.br),
  ].join("\n");
}

/* ── TABLE ───────────────────────────────────────── */
export interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

export function table(columns: TableColumn[], rows: string[][]): string {
  const sep = dim(BOX.h);
  const headerLine = columns.map(c => pad(dim(c.header), c.width, c.align || "left")).join(dim(" " + BOX.v + " "));
  const divider = columns.map(c => repeat(BOX.h, c.width)).join(dim(BOX.h + BOX.x + BOX.h));

  const dataLines = rows.map(row =>
    row.map((cell, i) => {
      const col = columns[i]!;
      return pad(cell, col.width, col.align || "left");
    }).join(dim(" " + BOX.v + " "))
  );

  return [
    dim(BOX.tl + divider + BOX.tr),
    dim(BOX.v + " ") + headerLine + dim(" " + BOX.v),
    dim(BOX.lj + divider + BOX.rj),
    ...dataLines.map(l => dim(BOX.v + " ") + l + dim(" " + BOX.v)),
    dim(BOX.bl + divider + BOX.br),
  ].join("\n");
}

/* ── DIMENSION ROW ───────────────────────────────── */
export function dimRow(name: string, score: number, max: number = 5, target?: number): string {
  const barW = 20;
  const pct = score / max;
  const filled = Math.round(pct * barW);
  const bar = g("█".repeat(filled)) + dim("░".repeat(barW - filled));
  const scoreColor = score >= 4 ? g : score >= 2.5 ? amber : red;
  const nameStr = pad(name, 24);
  const tgtStr = target != null ? dim(` (target: ${target})`) : "";
  return `  ${dim(nameStr)} ${bar} ${scoreColor(score.toFixed(1))}${tgtStr}`;
}

/* ── STATUS INDICATORS ───────────────────────────── */
export function pass(msg: string): string { return `  ${g("✓")} ${msg}`; }
export function fail(msg: string): string { return `  ${red("✗")} ${msg}`; }
export function warn(msg: string): string { return `  ${amber("⚠")} ${msg}`; }
export function info(msg: string): string { return `  ${g2("→")} ${msg}`; }

/* ── PROGRESS BAR ────────────────────────────────── */
export function progressBar(current: number, total: number, label?: string): string {
  const w = 30;
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((pct / 100) * w);
  const bar = g("█".repeat(filled)) + dim("░".repeat(w - filled));
  const labelStr = label ? `${label} ` : "";
  return `  ${labelStr}${bar} ${dim(`${pct}%`)} ${dim(`(${current}/${total})`)}`;
}

/* ── NEXT STEPS ──────────────────────────────────── */
export function nextSteps(steps: Array<{ cmd: string; desc: string }>): string {
  const lines = [
    "",
    dim("  ━━━ What's next ━━━"),
    "",
  ];
  steps.forEach((step, i) => {
    lines.push(`  ${chalk.white(`${i + 1}.`)} ${g(step.cmd)} ${dim("—")} ${dim(step.desc)}`);
  });
  lines.push("");
  return lines.join("\n");
}

/* ── EVIDENCE GAP ────────────────────────────────── */
export function gap(questionId: string, reason: string): string {
  return `  ${amber("→")} ${amber(questionId)}: ${dim(reason)}`;
}

/* ── SEPARATOR ───────────────────────────────────── */
export function separator(width: number = 52): string {
  return dim("  " + repeat("─", width));
}

/* ── TIMESTAMP ───────────────────────────────────── */
export function timestamp(): string {
  return dim(`  ${new Date().toISOString()}`);
}

/* Re-export colors for direct use */
export const colors = { g, g2, amber, red, dim, muted };
