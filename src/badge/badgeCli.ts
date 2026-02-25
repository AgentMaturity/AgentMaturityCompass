/**
 * AMC Badge Generator
 * 
 * `amc badge --agent <id> --run <runId>`
 * 
 * Generates a markdown badge showing the agent's maturity level.
 * Output: ![AMC L3](https://img.shields.io/badge/AMC-L3%20Defined-blue)
 * 
 * Users paste into their README to show their agent's maturity level.
 */

export interface BadgeOptions {
  level: number; // 0-5
  label?: string; // custom label, default "AMC"
  format?: "markdown" | "html" | "url"; // output format
}

const LEVEL_LABELS: Record<number, string> = {
  0: "L0 Initial",
  1: "L1 Aware",
  2: "L2 Managed",
  3: "L3 Defined",
  4: "L4 Measured",
  5: "L5 Optimized",
};

const LEVEL_COLORS: Record<number, string> = {
  0: "lightgrey",
  1: "yellow",
  2: "orange",
  3: "blue",
  4: "green",
  5: "brightgreen",
};

function encodeShield(text: string): string {
  return encodeURIComponent(text).replace(/-/g, "--").replace(/_/g, "__");
}

/**
 * Generate a shields.io badge URL for the given maturity level.
 */
export function badgeUrl(opts: BadgeOptions): string {
  const label = opts.label ?? "AMC";
  const levelLabel = LEVEL_LABELS[opts.level] ?? `L${opts.level}`;
  const color = LEVEL_COLORS[opts.level] ?? "lightgrey";
  return `https://img.shields.io/badge/${encodeShield(label)}-${encodeShield(levelLabel)}-${color}`;
}

/**
 * Generate badge in the requested format.
 */
export function generateBadge(opts: BadgeOptions): string {
  const url = badgeUrl(opts);
  const format = opts.format ?? "markdown";
  const levelLabel = LEVEL_LABELS[opts.level] ?? `L${opts.level}`;
  const label = opts.label ?? "AMC";

  switch (format) {
    case "html":
      return `<img src="${url}" alt="${label} ${levelLabel}" />`;
    case "url":
      return url;
    case "markdown":
    default:
      return `![${label} ${levelLabel}](${url})`;
  }
}

/**
 * Format badge output for CLI display.
 */
export function formatBadgeOutput(opts: BadgeOptions): string {
  const lines: string[] = [];
  const levelLabel = LEVEL_LABELS[opts.level] ?? `L${opts.level}`;

  lines.push(`Agent Maturity: ${levelLabel}`);
  lines.push("");
  lines.push("Markdown (paste in README):");
  lines.push(`  ${generateBadge({ ...opts, format: "markdown" })}`);
  lines.push("");
  lines.push("HTML:");
  lines.push(`  ${generateBadge({ ...opts, format: "html" })}`);
  lines.push("");
  lines.push("URL:");
  lines.push(`  ${generateBadge({ ...opts, format: "url" })}`);

  return lines.join("\n");
}
