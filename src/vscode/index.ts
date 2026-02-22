export type {
  PatternSeverity,
  AmcPatternRule,
  PatternMatch,
  InlineScoreAnnotation,
  QuickFixSuggestion
} from "./types.js";
export { AMC_PATTERN_RULES, QUICK_FIX_LIBRARY } from "./patternCatalog.js";
export { scanCodeForAmcPatterns, summarizeQuestionRisk } from "./patternScanner.js";
export { deriveQuestionScoresFromMatches, buildInlineScoreAnnotations } from "./inlineScore.js";
export { suggestQuickFixes } from "./quickFixes.js";
export type {
  VscodeScaffoldAnalysis,
  VscodeScaffoldHooks,
  VscodeScaffoldInstance
} from "./extensionScaffold.js";
export { analyzeSourceForAmcVscode, createVscodeExtensionScaffold } from "./extensionScaffold.js";

