/**
 * Quickscore Share — Generate shareable summary
 * 
 * `amc quickscore --share`
 * 
 * Generates a shareable markdown snippet or URL of the score summary.
 * NOT the full evidence — just headline score, dimensions, and level.
 */

import type { RapidQuickscoreResult } from "./rapidQuickscore.js";
import { generateBadge } from "../badge/badgeCli.js";

export interface ShareableScoreSummary {
  markdown: string;
  plainText: string;
  badge: string;
}

/**
 * Generate a shareable summary from a quickscore result.
 */
export function generateShareableSummary(result: RapidQuickscoreResult, agentName?: string): ShareableScoreSummary {
  const name = agentName ?? "My Agent";
  const badge = generateBadge({ level: levelNumber(result.preliminaryLevel) });

  const dimensionLines = result.questionScores.map(
    (q) => `| ${q.layerName} | ${q.title} | L${q.level} |`
  );

  const markdown = [
    `## ${name} — AMC Maturity Score`,
    "",
    badge,
    "",
    `**Overall: ${result.preliminaryLevel}** (${result.percentage}% — ${result.totalScore}/${result.maxScore})`,
    "",
    "| Dimension | Question | Level |",
    "|-----------|----------|-------|",
    ...dimensionLines,
    "",
    `*Scored with [Agent Maturity Compass](https://github.com/AgentMaturity/AgentMaturityCompass) — ${new Date().toISOString().split("T")[0]}*`,
  ].join("\n");

  const plainText = [
    `${name} — AMC Maturity: ${result.preliminaryLevel} (${result.percentage}%)`,
    ...result.questionScores.map((q) => `  ${q.layerName}: L${q.level}`),
    `Scored with AMC (github.com/AgentMaturity/AgentMaturityCompass)`,
  ].join("\n");

  return { markdown, plainText, badge };
}

function levelNumber(level: string): number {
  const match = level.match(/L(\d)/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}

/**
 * Format the post-quickscore improvement flow.
 * Shows: "Your agent scored L2. Here's what L3 requires:"
 * followed by top 3 actionable improvements.
 */
export function formatPostQuickscoreFlow(result: RapidQuickscoreResult): string {
  const lines: string[] = [];
  const currentLevel = result.preliminaryLevel;
  const nextLevel = nextLevelLabel(currentLevel);

  lines.push(`Your agent scored ${currentLevel}.`);

  if (result.recommendations.length === 0) {
    lines.push("No immediate improvements needed — you're at the top tier.");
    return lines.join("\n");
  }

  lines.push(`Here's what ${nextLevel} requires:`);
  lines.push("");

  for (let i = 0; i < result.recommendations.length; i++) {
    const rec = result.recommendations[i]!;
    lines.push(`${i + 1}. **${rec.title}** (currently L${rec.currentLevel} → target L${rec.targetLevel})`);
    lines.push(`   Why: ${rec.whyItMatters}`);
    lines.push(`   How: ${rec.howToImprove}`);
    lines.push("");
  }

  lines.push(`Run \`amc quickscore --share\` to generate a shareable summary.`);

  return lines.join("\n");
}

function nextLevelLabel(current: string): string {
  const map: Record<string, string> = {
    "L1": "L2",
    "L2": "L3",
    "L3": "L4",
    "L4": "L5",
    "L5": "L5",
  };
  return map[current] ?? "L3";
}
