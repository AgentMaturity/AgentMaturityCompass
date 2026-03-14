/**
 * Rich terminal output for the REPL.
 * Uses chalk (already a dep) for colors and formatting.
 */

import chalk from "chalk";
import type { ReplContext } from "./replContext.js";
import { getSuggestions, findClosest } from "./replParser.js";

const ACCENT = chalk.hex("#4AEF79");
const DIM = chalk.gray;
const GREEN = chalk.green;
const RED = chalk.red;
const AMBER = chalk.yellow;
const BOLD = chalk.bold;
const CYAN = chalk.cyan;

export function renderBanner(ctx: ReplContext): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  ${BOLD("🧭 AMC")} ${DIM("— Agent Maturity Compass")}`);
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
  if (ctx.studioRunning !== null) {
    parts.push(ctx.studioRunning ? GREEN("Studio: on") : DIM("Studio: off"));
  }
  lines.push(`  ${parts.join("  ")}`);
  lines.push("");
  lines.push(`  ${DIM("Type naturally or use AMC commands. 'help' for guidance, 'exit' to quit.")}`);
  lines.push(`  ${DIM("Tab for completions, ↑/↓ for history.")}`);
  lines.push("");
  return lines.join("\n");
}

function trustBadge(label: string): string {
  switch (label) {
    case "CERTIFIED": return chalk.bgGreen.black(` L5 ${label} `);
    case "AUTONOMOUS": return chalk.bgCyan.black(` L4 ${label} `);
    case "HIGH TRUST": return chalk.bgBlue.white(` L3 ${label} `);
    case "TRUSTED": return chalk.bgYellow.black(` L2 ${label} `);
    case "BASIC": return chalk.bgWhite.black(` L1 ${label} `);
    default: return chalk.bgRed.white(` L0 ${label} `);
  }
}

export function renderHelp(ctx: ReplContext): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(BOLD("  📊 Scoring & Assessment"));
  lines.push(`    ${ACCENT("score my agent")}           ${DIM("Quick 2-minute maturity score")}`);
  lines.push(`    ${ACCENT("full score")}               ${DIM("Formal-spec with crypto evidence")}`);
  lines.push(`    ${ACCENT("what are my gaps?")}         ${DIM("Show evidence gaps")}`);
  lines.push(`    ${ACCENT("weakest")}                  ${DIM("Find weakest dimension")}`);
  lines.push("");

  lines.push(BOLD("  🔧 Improvement"));
  lines.push(`    ${ACCENT("improve")}                  ${DIM("Generate improvement guide")}`);
  lines.push(`    ${ACCENT("apply guide")}              ${DIM("Auto-apply improvements to config")}`);
  lines.push(`    ${ACCENT("explain AMC-1.1")}           ${DIM("Deep-dive into a question")}`);
  lines.push("");

  lines.push(BOLD("  🛡️ Testing & Assurance"));
  lines.push(`    ${ACCENT("run all tests")}             ${DIM("Run every assurance pack")}`);
  lines.push(`    ${ACCENT("run sycophancy")}            ${DIM("Test for sycophantic behavior")}`);
  lines.push(`    ${ACCENT("run hallucination")}         ${DIM("Test for hallucination")}`);
  lines.push(`    ${ACCENT("run toxicity")}              ${DIM("Test for toxic output")}`);
  lines.push(`    ${ACCENT("run security")}              ${DIM("Test security controls")}`);
  lines.push("");

  lines.push(BOLD("  🏭 Compliance & Domains"));
  lines.push(`    ${ACCENT("am I HIPAA ready?")}         ${DIM("Health domain (HIPAA, FDA)")}`);
  lines.push(`    ${ACCENT("check GDPR")}                ${DIM("Education domain (GDPR, FERPA)")}`);
  lines.push(`    ${ACCENT("fintech")}                   ${DIM("Wealth domain (SOX, PCI-DSS)")}`);
  lines.push(`    ${ACCENT("EU AI Act")}                 ${DIM("Technology domain")}`);
  lines.push(`    ${ACCENT("domains")}                   ${DIM("List all 7 domains + 40 packs")}`);
  lines.push(`    ${ACCENT("guardrails")}                ${DIM("Toggle runtime protections")}`);
  lines.push("");

  lines.push(BOLD("  🔄 Workflows") + " " + DIM("(multi-step)"));
  lines.push(`    ${ACCENT("onboard me")}               ${DIM("doctor → score → gaps → guide")}`);
  lines.push(`    ${ACCENT("full audit")}                ${DIM("score → gaps → all tests → report")}`);
  lines.push(`    ${ACCENT("prepare for production")}    ${DIM("score → tests → guardrails → compliance")}`);
  lines.push(`    ${ACCENT("ci check")}                  ${DIM("score → tests → CI gate")}`);
  lines.push(`    ${ACCENT("security audit")}            ${DIM("security pack → guardrails → gaps")}`);
  lines.push(`    ${ACCENT("quick check")}               ${DIM("status + evidence gaps")}`);
  lines.push("");

  lines.push(BOLD("  📋 Reports & History"));
  lines.push(`    ${ACCENT("report")}                   ${DIM("Generate markdown report")}`);
  lines.push(`    ${ACCENT("history")}                  ${DIM("Score trend over time")}`);
  lines.push(`    ${ACCENT("compare")}                  ${DIM("Diff two scoring runs")}`);
  lines.push(`    ${ACCENT("export sarif")}              ${DIM("SARIF for CI integration")}`);
  lines.push("");

  lines.push(BOLD("  ⚙️ System"));
  lines.push(`    ${ACCENT("doctor")}                   ${DIM("System health check")}`);
  lines.push(`    ${ACCENT("status")}                   ${DIM("Current agent info")}`);
  lines.push(`    ${ACCENT("dashboard")}                ${DIM("Open web UI")}`);
  lines.push(`    ${ACCENT("up / down")}                ${DIM("Start / stop Studio server")}`);
  lines.push(`    ${ACCENT("adapters")}                 ${DIM("List framework integrations")}`);
  lines.push(`    ${ACCENT("version")}                  ${DIM("Show AMC version")}`);
  lines.push(`    ${ACCENT("clear")}                    ${DIM("Clear terminal")}`);
  lines.push(`    ${ACCENT("exit")}                     ${DIM("Exit REPL")}`);
  lines.push("");

  lines.push(DIM("  Any AMC command also works directly (e.g., 'assurance run sycophancy')"));
  lines.push("");
  return lines.join("\n");
}

export function renderSuggestions(ctx: ReplContext): string {
  const sugs = getSuggestions(ctx.score, ctx.gaps, 0);
  if (!sugs.length) return "";
  return `  ${DIM("💡 Try:")} ${sugs.map(s => ACCENT(s)).join(DIM(" · "))}`;
}

export function renderCommandEcho(description: string, natural: boolean): string {
  if (natural) {
    return `  ${DIM("→")} ${description}`;
  }
  return "";
}

export function renderStatusBar(ctx: ReplContext): string {
  const parts: string[] = [];
  if (ctx.agentId) parts.push(DIM(ctx.agentId));
  if (ctx.trustLabel) parts.push(trustBadge(ctx.trustLabel));
  if (ctx.score !== null) {
    const sc = ctx.score >= 3 ? GREEN : ctx.score >= 1.5 ? AMBER : RED;
    parts.push(sc(`${ctx.score.toFixed(1)}/5`));
  }
  if (ctx.gaps !== null && ctx.gaps > 0) parts.push(RED(`${ctx.gaps} gaps`));
  if (ctx.commandCount > 0) parts.push(DIM(`${ctx.commandCount} cmds`));
  return `  ${parts.join(DIM(" │ "))}`;
}

export function renderError(message: string): string {
  return `  ${RED("✗")} ${message}`;
}

// ── WORKFLOW RENDERING ──────────────────────────────

export function renderWorkflowHeader(name: string, stepCount: number): string {
  return `  ${BOLD(ACCENT("⚡ " + name))} ${DIM(`(${stepCount} steps)`)}\n  ${DIM("─".repeat(50))}`;
}

export function renderWorkflowStep(current: number, total: number, command: string): string {
  const progress = `[${current}/${total}]`;
  return `\n  ${CYAN(progress)} ${BOLD(`amc ${command}`)}`;
}

export function renderWorkflowComplete(name: string, ctx: ReplContext): string {
  const lines: string[] = [];
  lines.push(`\n  ${DIM("─".repeat(50))}`);
  lines.push(`  ${GREEN("✓")} ${BOLD("Workflow complete:")} ${name}`);
  if (ctx.score !== null) {
    const sc = ctx.score >= 3 ? GREEN : ctx.score >= 1.5 ? AMBER : RED;
    lines.push(`  ${DIM("Score:")} ${sc(`${ctx.score.toFixed(1)}/5`)}${ctx.trustLabel ? `  ${trustBadge(ctx.trustLabel)}` : ""}${ctx.gaps !== null ? `  ${DIM("Gaps:")} ${ctx.gaps > 0 ? RED(String(ctx.gaps)) : GREEN("0")}` : ""}`);
  }
  return lines.join("\n");
}

// ── CONTEXTUAL TIPS ─────────────────────────────────

export function renderContextualTip(ctx: ReplContext, lastCommand: string): string {
  // After quickscore
  if (lastCommand.includes("quickscore") && ctx.score !== null) {
    if (ctx.score < 1.5) {
      return `  ${DIM("💡")} Score is low — try ${ACCENT("improve")} to get a step-by-step guide, or ${ACCENT("onboard me")} for the full walkthrough`;
    }
    if (ctx.gaps !== null && ctx.gaps > 0) {
      return `  ${DIM("💡")} ${ctx.gaps} evidence gaps found — try ${ACCENT("what are my gaps?")} or ${ACCENT("collect evidence")}`;
    }
    if (ctx.score >= 3.0) {
      return `  ${DIM("💡")} Score is solid — try ${ACCENT("run all tests")} or ${ACCENT("prepare for production")}`;
    }
  }

  // After evidence gaps
  if (lastCommand.includes("evidence") && ctx.gaps !== null && ctx.gaps > 0) {
    return `  ${DIM("💡")} Fix gaps with ${ACCENT("collect evidence")} or ${ACCENT("improve")}`;
  }

  // After guide
  if (lastCommand.includes("guide")) {
    return `  ${DIM("💡")} Re-score to see impact: ${ACCENT("score my agent")}`;
  }

  // After assurance
  if (lastCommand.includes("assurance")) {
    return `  ${DIM("💡")} Run specific packs: ${ACCENT("run sycophancy")}, ${ACCENT("run hallucination")}, ${ACCENT("run toxicity")}`;
  }

  // After domain assess
  if (lastCommand.includes("domain assess")) {
    return `  ${DIM("💡")} Apply domain guardrails: ${ACCENT("apply domain health")} or check other domains: ${ACCENT("domains")}`;
  }

  // After doctor
  if (lastCommand.includes("doctor")) {
    return `  ${DIM("💡")} Score your agent: ${ACCENT("score my agent")} or check studio: ${ACCENT("up")}`;
  }

  // After guardrails list
  if (lastCommand.includes("guardrails list")) {
    return `  ${DIM("💡")} Toggle: ${ACCENT("enable <id>")} or ${ACCENT("disable <id>")}`;
  }

  return "";
}

// ── SESSION SUMMARY ─────────────────────────────────

export function renderSessionSummary(ctx: ReplContext, initialScore: number | null, initialGaps: number | null): string {
  const lines: string[] = [];
  const elapsed = Math.round((Date.now() - ctx.sessionStart) / 1000 / 60);
  const timeStr = elapsed > 0 ? `${elapsed}m` : "<1m";

  lines.push("");
  lines.push(`  ${DIM("─".repeat(40))}`);
  lines.push(`  ${BOLD("Session Summary")}`);
  lines.push(`  ${DIM(`Duration: ${timeStr} · Commands: ${ctx.commandCount}`)}`);

  // Score delta
  if (ctx.score !== null && initialScore !== null && ctx.score !== initialScore) {
    const delta = ctx.score - initialScore;
    const sign = delta > 0 ? "+" : "";
    const color = delta > 0 ? GREEN : delta < 0 ? RED : DIM;
    lines.push(`  ${DIM("Score:")} ${initialScore.toFixed(1)} → ${color(`${ctx.score.toFixed(1)} (${sign}${delta.toFixed(1)})`)}`);
  } else if (ctx.score !== null) {
    const sc = ctx.score >= 3 ? GREEN : ctx.score >= 1.5 ? AMBER : RED;
    lines.push(`  ${DIM("Score:")} ${sc(`${ctx.score.toFixed(1)}/5`)}`);
  }

  // Gaps delta
  if (ctx.gaps !== null && initialGaps !== null && ctx.gaps !== initialGaps) {
    const delta = ctx.gaps - initialGaps;
    const sign = delta > 0 ? "+" : "";
    const color = delta < 0 ? GREEN : delta > 0 ? RED : DIM;
    lines.push(`  ${DIM("Gaps:")} ${initialGaps} → ${color(`${ctx.gaps} (${sign}${delta})`)}`);
  }

  lines.push(`  ${DIM("─".repeat(40))}`);
  lines.push(`  ${DIM("Goodbye.")}`);
  lines.push("");
  return lines.join("\n");
}

// ── NO WORKSPACE ────────────────────────────────────

export function renderNoWorkspace(): string {
  const lines: string[] = [];
  lines.push(`  ${AMBER("⚠")} ${BOLD("No AMC workspace found")} ${DIM("(.amc/ directory)")}`);
  lines.push(`  ${DIM("Run")} ${ACCENT("init")} ${DIM("to create one, or")} ${ACCENT("onboard me")} ${DIM("for guided setup.")}`);
  lines.push("");
  return lines.join("\n");
}

// ── DID YOU MEAN? ───────────────────────────────────

export function renderDidYouMean(input: string, completions: string[]): string {
  const closest = findClosest(input, completions, 3);
  if (!closest.length) return "";
  return `  ${DIM("Did you mean:")} ${closest.map(c => ACCENT(c)).join(DIM(", "))}${DIM("?")}`;
}

// ── TIMER ───────────────────────────────────────────

export function renderTimer(durationMs: number): string {
  const secs = (durationMs / 1000).toFixed(1);
  return `  ${DIM(`⏱ ${secs}s`)}`;
}
