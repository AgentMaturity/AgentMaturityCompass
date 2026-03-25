/**
 * Mirofish CLI output formatting — consistent with AMC cliFormat.ts patterns.
 */
import chalk from "chalk";
import type { SimulationResult, StressResult } from "./types.js";

const g = chalk.hex("#00ff41");
const amber = chalk.hex("#f59e0b");
const red = chalk.hex("#ef4444");
const dim = chalk.gray;
const muted = chalk.hex("#6b7280");

const BOX = {
  tl: "┌", tr: "┐", bl: "└", br: "┘",
  h: "─", v: "│", lj: "├", rj: "┤",
  x: "┼",
} as const;

function repeat(ch: string, n: number): string {
  return ch.repeat(Math.max(0, n));
}

function levelColor(level: number): (s: string) => string {
  if (level >= 4) return g;
  if (level >= 2.5) return amber;
  return red;
}

function bar(value: number, max: number, width: number): string {
  const filled = Math.round((value / max) * width);
  return g("█".repeat(filled)) + dim("░".repeat(width - filled));
}

/* ── Text output ──────────────────────────────────── */

export function formatSimulationText(result: SimulationResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(g("  🐟 Mirofish Simulation Results"));
  lines.push(dim(`  Scenario: ${result.scenarioName} · ${result.iterations} iterations · seed ${result.seed}`));
  lines.push("");

  // Overall score
  const oc = levelColor(result.overallMean);
  lines.push(
    `  ${chalk.white.bold("Overall Score")}  ${oc(result.overallMean.toFixed(2))} / 5.00` +
    `  ${dim(`[${result.overallCi95[0].toFixed(2)} – ${result.overallCi95[1].toFixed(2)}] 95% CI`)}`
  );
  lines.push(`  ${bar(result.overallMean, 5, 30)}`);
  lines.push("");

  // Layer scores
  lines.push(dim(`  ${repeat(BOX.h, 60)}`));
  lines.push(`  ${dim("Layer")}${" ".repeat(36)}${dim("Score")}   ${dim("95% CI")}`);
  lines.push(dim(`  ${repeat(BOX.h, 60)}`));

  for (const layer of result.layerScores) {
    const lc = levelColor(layer.meanLevel);
    const name = layer.layerName.padEnd(38);
    const score = lc(layer.meanLevel.toFixed(2).padStart(5));
    const ci = dim(`[${layer.ci95Low.toFixed(2)} – ${layer.ci95High.toFixed(2)}]`);
    lines.push(`  ${name} ${score}   ${ci}`);
  }

  lines.push(dim(`  ${repeat(BOX.h, 60)}`));
  lines.push("");

  // Governance gates
  if (result.governanceGatePassed) {
    lines.push(`  ${g("✓")} Governance gates: ${g("PASSED")}`);
  } else {
    lines.push(`  ${red("✗")} Governance gates: ${red("FAILED")}`);
    for (const failure of result.governanceFailures) {
      lines.push(`    ${red("•")} ${failure}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

/* ── Markdown output ──────────────────────────────── */

export function formatSimulationMarkdown(result: SimulationResult): string {
  const lines: string[] = [];

  lines.push(`# Mirofish Simulation: ${result.scenarioName}`);
  lines.push("");
  lines.push(`- **Iterations**: ${result.iterations}`);
  lines.push(`- **Seed**: ${result.seed}`);
  lines.push(`- **Overall Score**: ${result.overallMean.toFixed(2)} / 5.00 [${result.overallCi95[0].toFixed(2)} – ${result.overallCi95[1].toFixed(2)}] 95% CI`);
  lines.push(`- **Governance**: ${result.governanceGatePassed ? "PASSED" : "FAILED"}`);
  lines.push("");

  lines.push("## Layer Scores");
  lines.push("");
  lines.push("| Layer | Mean | Std Dev | 95% CI Low | 95% CI High | Questions |");
  lines.push("|-------|------|---------|------------|-------------|-----------|");

  for (const layer of result.layerScores) {
    lines.push(
      `| ${layer.layerName} | ${layer.meanLevel.toFixed(2)} | ${layer.stdDev.toFixed(3)} | ${layer.ci95Low.toFixed(2)} | ${layer.ci95High.toFixed(2)} | ${layer.questionCount} |`
    );
  }

  if (!result.governanceGatePassed) {
    lines.push("");
    lines.push("## Governance Failures");
    lines.push("");
    for (const f of result.governanceFailures) {
      lines.push(`- ${f}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/* ── Comparison ───────────────────────────────────── */

export function formatComparisonText(a: SimulationResult, b: SimulationResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(g("  🐟 Mirofish Comparison"));
  lines.push(dim(`  ${a.scenarioName} vs ${b.scenarioName}`));
  lines.push("");

  // Header
  const nameA = a.scenarioName.slice(0, 18).padEnd(18);
  const nameB = b.scenarioName.slice(0, 18).padEnd(18);
  lines.push(`  ${"Layer".padEnd(32)} ${dim(nameA)} ${dim(nameB)} ${dim("Δ")}`);
  lines.push(dim(`  ${repeat(BOX.h, 74)}`));

  for (const layerA of a.layerScores) {
    const layerB = b.layerScores.find((l) => l.layerName === layerA.layerName);
    if (!layerB) continue;

    const delta = layerB.meanLevel - layerA.meanLevel;
    const deltaStr = delta > 0
      ? g(`+${delta.toFixed(2)}`)
      : delta < 0
        ? red(delta.toFixed(2))
        : dim(" 0.00");

    lines.push(
      `  ${layerA.layerName.padEnd(32)} ` +
      `${levelColor(layerA.meanLevel)(layerA.meanLevel.toFixed(2).padStart(5))}${" ".repeat(13)} ` +
      `${levelColor(layerB.meanLevel)(layerB.meanLevel.toFixed(2).padStart(5))}${" ".repeat(13)} ` +
      `${deltaStr}`
    );
  }

  lines.push(dim(`  ${repeat(BOX.h, 74)}`));

  const overallDelta = b.overallMean - a.overallMean;
  const overallDeltaStr = overallDelta > 0
    ? g(`+${overallDelta.toFixed(2)}`)
    : overallDelta < 0
      ? red(overallDelta.toFixed(2))
      : dim(" 0.00");

  lines.push(
    `  ${"Overall".padEnd(32)} ` +
    `${levelColor(a.overallMean)(a.overallMean.toFixed(2).padStart(5))}${" ".repeat(13)} ` +
    `${levelColor(b.overallMean)(b.overallMean.toFixed(2).padStart(5))}${" ".repeat(13)} ` +
    `${overallDeltaStr}`
  );
  lines.push("");

  return lines.join("\n");
}

/* ── Stress test output ───────────────────────────── */

export function formatStressText(result: StressResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(g("  🐟 Mirofish Stress Test"));
  lines.push(dim(`  Scenario: ${result.scenarioName}`));
  lines.push("");

  if (result.breakingPoints.length === 0) {
    lines.push(`  ${g("✓")} No governance breaking points found within parameter range.`);
    lines.push(dim("    The scenario passes all governance gates across the full parameter sweep."));
  } else {
    lines.push(`  ${amber("Breaking Points")} (parameter values where governance gates fail):`);
    lines.push("");

    for (const bp of result.breakingPoints) {
      const dirLabel = bp.direction === "increasing" ? "↑" : "↓";
      lines.push(`  ${red("•")} ${chalk.white.bold(bp.dimension)} ${dirLabel} ${amber(bp.thresholdValue.toFixed(2))}`);
      for (const gate of bp.failedGates) {
        lines.push(`    ${dim("└")} ${dim(gate)}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

/* ── Scenario list output ─────────────────────────── */

export function formatScenarioList(
  scenarios: readonly { name: string; description: string; tags: readonly string[] }[],
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(g("  🐟 Mirofish Scenarios"));
  lines.push("");

  for (const s of scenarios) {
    lines.push(`  ${g("•")} ${chalk.white.bold(s.name)}`);
    lines.push(`    ${dim(s.description.trim().split("\n")[0]!)}`);
    if (s.tags.length > 0) {
      lines.push(`    ${muted(s.tags.map((t) => `#${t}`).join(" "))}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
