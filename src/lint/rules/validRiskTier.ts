import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

const VALID_RISK_TIERS = ["low", "med", "high", "critical"] as const;

export const ruleValidRiskTier: LintRule = {
  id: "valid-risk-tier",
  description: "riskTier must be one of: low, med, high, critical",
  severity: "error",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    const val = ctx.parsed["riskTier"] ?? ctx.parsed["risk_tier"];
    if (val !== undefined && typeof val === "string" && !VALID_RISK_TIERS.includes(val as typeof VALID_RISK_TIERS[number])) {
      const lineIdx = ctx.lines.findIndex((l) => /risk.?tier/i.test(l));
      return [{
        ruleId: this.id,
        severity: this.severity,
        message: `Invalid riskTier "${val}" — must be one of: ${VALID_RISK_TIERS.join(", ")}`,
        file: ctx.file,
        line: lineIdx >= 0 ? lineIdx + 1 : 1,
        column: 1,
        fix: {
          description: `Set riskTier to "med"`,
          replacements: lineIdx >= 0 ? [{
            file: ctx.file,
            offset: ctx.lines.slice(0, lineIdx).join("\n").length + 1,
            length: ctx.lines[lineIdx]!.length,
            text: ctx.lines[lineIdx]!.replace(val, "med"),
          }] : [],
        },
      }];
    }
    return [];
  },
};
