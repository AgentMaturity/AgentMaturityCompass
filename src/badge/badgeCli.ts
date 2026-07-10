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

import { getPublicMethodologyReference, type PublicMethodologyReference } from "../methodology/publicMethodology.js";
import { formatMaturityOrdinal } from "../score/maturityTaxonomy.js";

export interface BadgeOptions {
  level: number; // 0-5
  label?: string; // custom label, default "AMC"
  format?: "markdown" | "html" | "url"; // output format
  methodology?: PublicMethodologyReference;
}

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

export function badgeMethodologyMetadata(opts: BadgeOptions = { level: 0 }): PublicMethodologyReference {
  return opts.methodology ?? getPublicMethodologyReference();
}

export function badgeSourceReviewNotice(methodology: PublicMethodologyReference = getPublicMethodologyReference()): string {
  return `Source-review claims are methodology-bound by ${methodology.version}; metadata-only LangSmith, fact-checking/factuality-review, Google ADK, LM Evaluation Harness, OpenAI Simple Evals, Digital materials, ChemGraph, OpenAI Evals, and PocketFlow signals require amc_methodology_assurance proof, no LangSmith adapter/importer/parity claim, no subsystem/importer/parity claim, no SDK/importer/parity claim, no PocketFlow subsystem/SDK/importer/parity claim, no connector claim, no framework-compatibility claim, and no registry-mirror claim. AMC maturity badges and source-review notices prove evidence/methodology boundaries only; a badge does not prove domain correctness. Answer-level correctness must carry correctnessProofStatus=proven plus an amcproof ref, otherwise it remains correctnessProofStatus=unsupported.`;


}

/**
 * Generate a shields.io badge URL for the given maturity level.
 */
export function badgeUrl(opts: BadgeOptions): string {
  const label = opts.label ?? "AMC";
  const levelLabel = formatMaturityOrdinal(opts.level, " ");
  const color = LEVEL_COLORS[opts.level] ?? "lightgrey";
  const methodology = badgeMethodologyMetadata(opts);
  const params = new URLSearchParams({
    amc_methodology: methodology.version,
    amc_methodology_hash: methodology.hash,
    amc_methodology_assurance: methodology.versioningAssuranceHash
  });
  return `https://img.shields.io/badge/${encodeShield(label)}-${encodeShield(levelLabel)}-${color}?${params.toString()}`;
}

/**
 * Generate badge in the requested format.
 */
export function generateBadge(opts: BadgeOptions): string {
  const url = badgeUrl(opts);
  const format = opts.format ?? "markdown";
  const levelLabel = formatMaturityOrdinal(opts.level, " ");
  const label = opts.label ?? "AMC";
  const methodology = badgeMethodologyMetadata(opts);
  const title = `${methodology.id} ${methodology.version} ${methodology.hash}`;

  switch (format) {
    case "html":
      return `<img src="${url}" alt="${label} ${levelLabel}" title="${title}" />`;
    case "url":
      return url;
    case "markdown":
    default:
      return `![${label} ${levelLabel}](${url} "${title}")`;
  }
}

/**
 * Format badge output for CLI display.
 */
export function formatBadgeOutput(opts: BadgeOptions): string {
  const lines: string[] = [];
  const levelLabel = formatMaturityOrdinal(opts.level, " ");
  const methodology = badgeMethodologyMetadata(opts);

  lines.push(`Agent Maturity: ${levelLabel}`);
  lines.push(`Methodology: ${methodology.id} ${methodology.version}`);
  lines.push(`Methodology Hash: ${methodology.hash}`);
  lines.push(`Methodology Assurance Hash: ${methodology.versioningAssuranceHash}`);
  lines.push(`Source Review Notice: ${badgeSourceReviewNotice(methodology)}`);
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
