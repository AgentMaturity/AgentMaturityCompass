import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

export const ruleRequireDomain: LintRule = {
  id: "require-domain",
  description: "Agent configuration should include a domain field",
  severity: "warning",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    if (!ctx.parsed["domain"] || (typeof ctx.parsed["domain"] === "string" && ctx.parsed["domain"].trim().length === 0)) {
      return [{
        ruleId: this.id,
        severity: this.severity,
        message: "Missing or empty domain field — agents should declare their operational domain",
        file: ctx.file,
        line: 1,
        column: 1,
      }];
    }
    return [];
  },
};
