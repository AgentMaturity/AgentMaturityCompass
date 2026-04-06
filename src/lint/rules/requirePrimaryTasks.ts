import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

export const ruleRequirePrimaryTasks: LintRule = {
  id: "require-primary-tasks",
  description: "Agent configuration should list primary tasks",
  severity: "warning",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    const val = ctx.parsed["primaryTasks"] ?? ctx.parsed["primary_tasks"];
    if (!val || (Array.isArray(val) && val.length === 0)) {
      return [{
        ruleId: this.id,
        severity: this.severity,
        message: "Missing primaryTasks — declare what this agent is designed to do",
        file: ctx.file,
        line: 1,
        column: 1,
      }];
    }
    return [];
  },
};
