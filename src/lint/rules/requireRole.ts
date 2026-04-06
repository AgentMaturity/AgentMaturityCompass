import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

export const ruleRequireRole: LintRule = {
  id: "require-role",
  description: "Agent configuration should include a role field",
  severity: "warning",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    if (!ctx.parsed["role"] || (typeof ctx.parsed["role"] === "string" && ctx.parsed["role"].trim().length === 0)) {
      const lineIdx = ctx.lines.findIndex((l) => /^role:/i.test(l.trim()));
      return [{
        ruleId: this.id,
        severity: this.severity,
        message: "Missing or empty role field — agents should declare their intended role",
        file: ctx.file,
        line: lineIdx >= 0 ? lineIdx + 1 : 1,
        column: 1,
      }];
    }
    return [];
  },
};
