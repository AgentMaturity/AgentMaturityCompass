import { QUICK_FIX_LIBRARY } from "./patternCatalog.js";
import type { PatternMatch, QuickFixSuggestion } from "./types.js";

export function suggestQuickFixes(matches: PatternMatch[]): QuickFixSuggestion[] {
  const seen = new Set<string>();
  const fixes: QuickFixSuggestion[] = [];
  for (const match of matches) {
    const fix = QUICK_FIX_LIBRARY[match.quickFixId];
    if (!fix || seen.has(fix.id)) {
      continue;
    }
    seen.add(fix.id);
    fixes.push(fix);
  }
  return fixes;
}

