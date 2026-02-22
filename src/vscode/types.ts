export type PatternSeverity = "info" | "warn" | "critical";

export interface AmcPatternRule {
  id: string;
  questionId: string;
  title: string;
  message: string;
  severity: PatternSeverity;
  scoreImpact: number;
  regex: RegExp;
  quickFixId: string;
}

export interface PatternMatch {
  ruleId: string;
  questionId: string;
  title: string;
  message: string;
  severity: PatternSeverity;
  line: number;
  column: number;
  snippet: string;
  scoreImpact: number;
  quickFixId: string;
}

export interface InlineScoreAnnotation {
  questionId: string;
  line: number;
  label: string;
  score: number;
  reason: string;
}

export interface QuickFixSuggestion {
  id: string;
  questionId: string;
  title: string;
  description: string;
  replacementExample: string;
}
