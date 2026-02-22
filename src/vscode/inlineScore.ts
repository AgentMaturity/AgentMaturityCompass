import type { InlineScoreAnnotation, PatternMatch } from "./types.js";

function clampScore(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 5) {
    return 5;
  }
  return Number(value.toFixed(2));
}

export function deriveQuestionScoresFromMatches(
  matches: PatternMatch[],
  baselineScoreByQuestion: Record<string, number> = {}
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const match of matches) {
    const baseline = baselineScoreByQuestion[match.questionId] ?? scores[match.questionId] ?? 3;
    scores[match.questionId] = clampScore(baseline + match.scoreImpact);
  }
  return scores;
}

export function buildInlineScoreAnnotations(
  matches: PatternMatch[],
  baselineScoreByQuestion: Record<string, number> = {}
): InlineScoreAnnotation[] {
  const scores = deriveQuestionScoresFromMatches(matches, baselineScoreByQuestion);
  return matches.map<InlineScoreAnnotation>((match) => ({
    questionId: match.questionId,
    line: match.line,
    label: `${match.questionId} inline score`,
    score: scores[match.questionId] ?? 3,
    reason: match.message
  }));
}

