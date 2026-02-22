import { AMC_PATTERN_RULES } from "./patternCatalog.js";
import type { PatternMatch } from "./types.js";

function isFetchWithoutTimeout(line: string): boolean {
  if (!/\bfetch\s*\(/.test(line)) {
    return false;
  }
  return !/(AbortSignal|signal\s*:|timeout\s*:)/.test(line);
}

export function scanCodeForAmcPatterns(source: string): PatternMatch[] {
  const lines = source.split(/\r?\n/);
  const matches: PatternMatch[] = [];

  lines.forEach((line, index) => {
    for (const rule of AMC_PATTERN_RULES) {
      if (rule.id === "fetch-without-timeout" && !isFetchWithoutTimeout(line)) {
        continue;
      }
      const regexMatch = rule.regex.exec(line);
      if (!regexMatch) {
        continue;
      }
      matches.push({
        ruleId: rule.id,
        questionId: rule.questionId,
        title: rule.title,
        message: rule.message,
        severity: rule.severity,
        line: index + 1,
        column: (regexMatch.index ?? 0) + 1,
        snippet: line.trim(),
        scoreImpact: rule.scoreImpact,
        quickFixId: rule.quickFixId
      });
    }
  });

  return matches.sort((a, b) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
}

export function summarizeQuestionRisk(matches: PatternMatch[]): Record<string, number> {
  return matches.reduce<Record<string, number>>((acc, match) => {
    acc[match.questionId] = (acc[match.questionId] ?? 0) + Math.abs(match.scoreImpact);
    return acc;
  }, {});
}

