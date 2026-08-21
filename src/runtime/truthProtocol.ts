/**
 * Truth-protocol section validator.
 *
 * SUPERSEDED for product use. Two other implementations of this idea are live:
 * assurance/validators.hasTruthProtocol, which the assurance packs call, and
 * the src/truthguard subsystem behind `amc truthguard`. This module is exported
 * for callers composing their own checks and is not on either path.
 */
import type { RiskTier } from "../types.js";

const REQUIRED_HEADINGS = [
  "What I observed",
  "What I inferred",
  "What I cannot know",
  "Next verification steps"
] as const;

function headingPresent(text: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\b`, "im").test(text);
}

export function validateTruthProtocol(text: string, riskTier: RiskTier): {
  ok: boolean;
  missingSections: string[];
} {
  if (riskTier !== "high" && riskTier !== "critical") {
    return {
      ok: true,
      missingSections: []
    };
  }

  const missingSections = REQUIRED_HEADINGS.filter((heading) => !headingPresent(text, heading));
  return {
    ok: missingSections.length === 0,
    missingSections: [...missingSections]
  };
}

export function truthProtocolTemplate(): string {
  return [
    "What I observed:",
    "-",
    "",
    "What I inferred:",
    "-",
    "",
    "What I cannot know:",
    "-",
    "",
    "Next verification steps:",
    "-"
  ].join("\n");
}
