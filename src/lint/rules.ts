/**
 * Lint rule definitions for AMC agent configuration files.
 *
 * Each rule checks a specific aspect of an agent configuration
 * and returns diagnostics (errors/warnings) with file:line references.
 *
 * Individual rules are in src/lint/rules/*.ts.
 */

export type LintSeverity = "error" | "warning" | "info";

export interface LintDiagnostic {
  ruleId: string;
  severity: LintSeverity;
  message: string;
  file: string;
  line: number;
  column: number;
  fix?: LintFix;
}

export interface LintFix {
  description: string;
  replacements: Array<{
    file: string;
    offset: number;
    length: number;
    text: string;
  }>;
}

export interface LintRuleContext {
  file: string;
  content: string;
  lines: string[];
  parsed: Record<string, unknown>;
}

export interface LintRule {
  id: string;
  description: string;
  severity: LintSeverity;
  check(ctx: LintRuleContext): readonly LintDiagnostic[];
}

// ---------------------------------------------------------------------------
// Built-in rules (imported from individual files)
// ---------------------------------------------------------------------------

import { ruleRequireAgentId } from "./rules/requireAgentId.js";
import { ruleRequireRole } from "./rules/requireRole.js";
import { ruleRequireDomain } from "./rules/requireDomain.js";
import { ruleValidRiskTier } from "./rules/validRiskTier.js";
import { ruleNoHardcodedSecrets } from "./rules/noHardcodedSecrets.js";
import { ruleRequireStakeholders } from "./rules/requireStakeholders.js";
import { ruleRequirePrimaryTasks } from "./rules/requirePrimaryTasks.js";
import { ruleNoDuplicateKeys } from "./rules/noDuplicateKeys.js";
import { ruleRequireTrustBoundary } from "./rules/requireTrustBoundary.js";

const BUILT_IN_RULES: readonly LintRule[] = [
  ruleRequireAgentId,
  ruleRequireRole,
  ruleRequireDomain,
  ruleValidRiskTier,
  ruleNoHardcodedSecrets,
  ruleRequireStakeholders,
  ruleRequirePrimaryTasks,
  ruleNoDuplicateKeys,
  ruleRequireTrustBoundary,
];

export function listLintRules(): readonly LintRule[] {
  return BUILT_IN_RULES;
}

export function getLintRule(id: string): LintRule | undefined {
  return BUILT_IN_RULES.find((r) => r.id === id);
}

export function runLintRules(ctx: LintRuleContext, ruleIds?: string[]): readonly LintDiagnostic[] {
  const rules = ruleIds
    ? BUILT_IN_RULES.filter((r) => ruleIds.includes(r.id))
    : BUILT_IN_RULES;
  return rules.flatMap((r) => r.check(ctx));
}
