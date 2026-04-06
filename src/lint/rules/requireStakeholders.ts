import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

export const ruleRequireStakeholders: LintRule = {
  id: "require-stakeholders",
  description: "Agent configuration should list stakeholders for governance clarity",
  severity: "warning",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    const val = ctx.parsed["stakeholders"];
    if (!val || (Array.isArray(val) && val.length === 0)) {
      return [{
        ruleId: this.id,
        severity: this.severity,
        message: "Missing stakeholders — declare who is affected by this agent's actions",
        file: ctx.file,
        line: 1,
        column: 1,
      }];
    }
    return [];
  },
};
