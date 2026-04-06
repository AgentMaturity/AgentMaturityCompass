import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

export const ruleRequireTrustBoundary: LintRule = {
  id: "require-trust-boundary",
  description: "Agent should declare its trust boundary mode (isolated or shared)",
  severity: "info",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    const val = ctx.parsed["trustBoundaryMode"] ?? ctx.parsed["trust_boundary_mode"];
    if (val === undefined) {
      return [{
        ruleId: this.id,
        severity: this.severity,
        message: "No trustBoundaryMode declared — consider specifying 'isolated' or 'shared'",
        file: ctx.file,
        line: 1,
        column: 1,
      }];
    }
    return [];
  },
};
