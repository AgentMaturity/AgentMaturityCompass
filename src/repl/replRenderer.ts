/**
 * Rich terminal output for the REPL.
 * Uses chalk (already a dep) for colors and formatting.
 */

import chalk from "chalk";
import type { ReplContext } from "./replContext.js";
import { getSuggestions } from "./replParser.js";

const COMPASS = "🧭";
const ACCENT = chalk.hex("#6366f1");
const DIM = chalk.gray;
const GREEN = chalk.green;
const RED = chalk.red;
const AMBER = chalk.yellow;
const BOLD = chalk.bold;

export function renderBanner(ctx: ReplContext): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  ${COMPASS} ${BOLD("AMC")} ${DIM("— Agent Maturity Compass")}`);
  lines.push(`  ${DIM("The credit score for AI agents")}`);
  lines.push("");

  // Agent status line
  const parts: string[] = [`Agent: ${ACCENT(ctx.agentId)}`];
  if (ctx.score !== null) {
    const sc = ctx.score >= 3 ? GREEN : ctx.score >= 1.5 ? AMBER : RED;
    parts.push(`Score: ${sc(`${ctx.score.toFixed(1)}/5`)}`);
  }
  if (ctx.trustLabel) {
    parts.push(trustBadge(ctx.trustLabel));
  }
  if (ctx.gaps !== null) {
    const gc = ctx.gaps > 0 ? RED : GREEN;
    parts.push(`Gaps: ${gc(String(ctx.gaps))}`);
  }
  lines.push(`  ${parts.join("  ")}`);
  lines.push("");
  lines.push(`  ${DIM("Type naturally or use AMC commands. 'help' for guidance, 'exit' to quit.")}`);
  lines.push("");
  return lines.join("\n");
}

function trustBadge(label: string): string {
  switch (label) {
    case "CERTIFIED": return chalk.bgGreen.black(` ${label} `);
    case "AUTONOMOUS": return chalk.bgCyan.black(` ${label} `);
    case "HIGH TRUST": return chalk.bgBlue.white(` ${label} `);
    case "TRUSTED": return chalk.bgYellow.black(` ${label} `);
    case "BASIC": return chalk.bgWhite.black(` ${label} `);
    default: return chalk.bgRed.white(` ${label} `);
  }
}

export function renderHelp(ctx: ReplContext): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(BOLD("  Available commands:"));
  lines.push("");

  const cmds: Array<[string, string]> = [
    ["score my agent", "Run quickscore assessment (2 min)"],
    ["what are my gaps?", "Show evidence gaps and weak dimensions"],
    ["improve / guide", "Generate improvement plan"],
    ["apply guide", "Auto-apply improvements to agent config"],
    ["run tests", "List and run assurance packs"],
    ["explain AMC-1.1", "Explain a specific question"],
    ["am I HIPAA ready?", "Assess domain compliance (health/education/etc.)"],
    ["guardrails", "List and toggle runtime guardrails"],
    ["report", "Generate markdown report"],
    ["history", "Show score trend over time"],
    ["compare", "Compare two scoring runs"],
    ["doctor", "System health check"],
    ["dashboard", "Open web dashboard"],
    ["clear", "Clear terminal"],
    ["exit", "Exit REPL"],
  ];

  for (const [cmd, desc] of cmds) {
    lines.push(`  ${ACCENT(cmd.padEnd(24))} ${DIM(desc)}`);
  }

  lines.push("");
  lines.push(DIM("  You can also type any AMC command directly (e.g., 'assurance run sycophancy')"));
  lines.push(DIM("  Press Tab for completions, ↑/↓ for history"));
  lines.push("");
  return lines.join("\n");
}

export function renderSuggestions(ctx: ReplContext): string {
  const sugs = getSuggestions(ctx.score, ctx.gaps, 0);
  if (!sugs.length) return "";
  return DIM(`  💡 Try: ${sugs.map(s => ACCENT(s)).join(DIM(" · "))}`);
}

export function renderCommandEcho(description: string, natural: boolean): string {
  if (natural) {
    return `  ${DIM("→")} ${description}`;
  }
  return "";
}

export function renderStatusBar(ctx: ReplContext): string {
  const parts: string[] = [DIM(ctx.agentId)];
  if (ctx.trustLabel) parts.push(trustBadge(ctx.trustLabel));
  if (ctx.score !== null) parts.push(DIM(`${ctx.score.toFixed(1)}/5`));
  if (ctx.gaps !== null && ctx.gaps > 0) parts.push(RED(`${ctx.gaps} gaps`));
  if (ctx.commandCount > 0) parts.push(DIM(`${ctx.commandCount} cmds`));
  return `  ${parts.join(DIM(" │ "))}`;
}

export function renderError(message: string): string {
  return `  ${RED("✗")} ${message}`;
}

export function renderWelcomeBack(ctx: ReplContext): string {
  if (ctx.commandCount === 0) return "";
  const elapsed = Math.round((Date.now() - ctx.sessionStart) / 1000 / 60);
  if (elapsed < 1) return "";
  return DIM(`  Session: ${elapsed}m, ${ctx.commandCount} commands`);
}
