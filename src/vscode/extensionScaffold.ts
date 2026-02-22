import { buildInlineScoreAnnotations, deriveQuestionScoresFromMatches } from "./inlineScore.js";
import { scanCodeForAmcPatterns, summarizeQuestionRisk } from "./patternScanner.js";
import { suggestQuickFixes } from "./quickFixes.js";
import type { InlineScoreAnnotation, PatternMatch, QuickFixSuggestion } from "./types.js";

export interface VscodeScaffoldAnalysis {
  matches: PatternMatch[];
  inlineScoreAnnotations: InlineScoreAnnotation[];
  questionScores: Record<string, number>;
  questionRiskTotals: Record<string, number>;
  quickFixes: QuickFixSuggestion[];
}

export interface VscodeScaffoldHooks {
  publishInlineScoreAnnotations: (annotations: InlineScoreAnnotation[]) => void;
  publishPatternMatches: (matches: PatternMatch[]) => void;
  publishQuickFixes: (fixes: QuickFixSuggestion[]) => void;
}

export interface VscodeScaffoldInstance {
  commandIds: {
    refresh: string;
    applyFix: string;
  };
  analyzeDocument: (source: string, baselineScoreByQuestion?: Record<string, number>) => VscodeScaffoldAnalysis;
  onDocumentChanged: (source: string, hooks: VscodeScaffoldHooks) => VscodeScaffoldAnalysis;
}

export function analyzeSourceForAmcVscode(
  source: string,
  baselineScoreByQuestion: Record<string, number> = {}
): VscodeScaffoldAnalysis {
  const matches = scanCodeForAmcPatterns(source);
  const inlineScoreAnnotations = buildInlineScoreAnnotations(matches, baselineScoreByQuestion);
  const questionScores = deriveQuestionScoresFromMatches(matches, baselineScoreByQuestion);
  const questionRiskTotals = summarizeQuestionRisk(matches);
  const quickFixes = suggestQuickFixes(matches);
  return {
    matches,
    inlineScoreAnnotations,
    questionScores,
    questionRiskTotals,
    quickFixes
  };
}

export function createVscodeExtensionScaffold(): VscodeScaffoldInstance {
  return {
    commandIds: {
      refresh: "amc.score.refresh",
      applyFix: "amc.quickfix.apply"
    },
    analyzeDocument: (source: string, baselineScoreByQuestion: Record<string, number> = {}) =>
      analyzeSourceForAmcVscode(source, baselineScoreByQuestion),
    onDocumentChanged: (source: string, hooks: VscodeScaffoldHooks) => {
      const analysis = analyzeSourceForAmcVscode(source);
      hooks.publishPatternMatches(analysis.matches);
      hooks.publishInlineScoreAnnotations(analysis.inlineScoreAnnotations);
      hooks.publishQuickFixes(analysis.quickFixes);
      return analysis;
    }
  };
}

