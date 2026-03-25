import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

export const ruleNoDuplicateKeys: LintRule = {
  id: "no-duplicate-keys",
  description: "YAML files should not contain duplicate top-level keys",
  severity: "error",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    const seen = new Map<string, number>();
    const diagnostics: LintDiagnostic[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      const match = /^([a-zA-Z_][a-zA-Z0-9_]*):\s/.exec(ctx.lines[i]!);
      if (match?.[1]) {
        const key = match[1];
        if (seen.has(key)) {
          diagnostics.push({
            ruleId: this.id,
            severity: this.severity,
            message: `Duplicate key "${key}" (first seen at line ${seen.get(key)!})`,
            file: ctx.file,
            line: i + 1,
            column: 1,
          });
        } else {
          seen.set(key, i + 1);
        }
      }
    }
    return diagnostics;
  },
};
