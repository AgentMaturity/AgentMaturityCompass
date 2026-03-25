import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

export const ruleRequireAgentId: LintRule = {
  id: "require-agent-id",
  description: "Agent configuration must include a non-empty agentId",
  severity: "error",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    const val = ctx.parsed["agentId"] ?? ctx.parsed["agent_id"];
    if (typeof val !== "string" || val.trim().length === 0) {
      const lineIdx = ctx.lines.findIndex((l) => /agent.?id/i.test(l));
      return [{
        ruleId: this.id,
        severity: this.severity,
        message: "Missing or empty agentId field",
        file: ctx.file,
        line: lineIdx >= 0 ? lineIdx + 1 : 1,
        column: 1,
      }];
    }
    return [];
  },
};
