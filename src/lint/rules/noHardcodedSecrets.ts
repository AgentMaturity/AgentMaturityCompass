import type { LintRule, LintDiagnostic, LintRuleContext } from "../rules.js";

export const ruleNoHardcodedSecrets: LintRule = {
  id: "no-hardcoded-secrets",
  description: "Configuration files must not contain hardcoded secrets or API keys",
  severity: "error",
  check(ctx: LintRuleContext): readonly LintDiagnostic[] {
    const secretPatterns = [
      /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}/i,
      /(?:secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
      /sk-[A-Za-z0-9]{32,}/,
      /ghp_[A-Za-z0-9]{36,}/,
    ];
    const diagnostics: LintDiagnostic[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      const line = ctx.lines[i]!;
      for (const pattern of secretPatterns) {
        if (pattern.test(line)) {
          diagnostics.push({
            ruleId: this.id,
            severity: this.severity,
            message: "Possible hardcoded secret detected — use environment variables instead",
            file: ctx.file,
            line: i + 1,
            column: 1,
          });
          break;
        }
      }
    }
    return diagnostics;
  },
};
