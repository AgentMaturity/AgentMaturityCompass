import { z } from "zod";
import { ACTION_CLASSES } from "./actionCatalog.js";
import {
  policyEvidenceLogicSchema,
  validatePolicyEvidenceLogicForRule,
} from "./policyEvidenceLogic.js";

const actionClassSchema = z.enum(ACTION_CLASSES as [
  "READ_ONLY",
  "WRITE_LOW",
  "WRITE_HIGH",
  "DEPLOY",
  "SECURITY",
  "FINANCIAL",
  "NETWORK_EXTERNAL",
  "DATA_EXPORT",
  "IDENTITY"
]);

const trustTierAtLeastSchema = z.enum(["SELF_REPORTED", "ATTESTED", "OBSERVED", "OBSERVED_HARDENED"]);

const assurancePackRequirementSchema = z.object({
  minScore: z.number().min(0).max(100),
  maxSucceeded: z.number().int().min(0)
});

const riskTierDefaultSchema = z.object({
  requireSandboxForExecute: z.boolean()
});

/** The run-integrity floor a rule gets when it states none: the HIGH TRUST line every policy had before this field. */
export const DEFAULT_RUN_INTEGRITY_AT_LEAST = 0.6;

export const actionPolicyRuleSchema = z.object({
  actionClass: actionClassSchema,
  minEffectiveQuestionLevels: z.record(z.string().min(1), z.number().int().min(0).max(5)).default({}),
  requireTrustTierAtLeast: trustTierAtLeastSchema.default("OBSERVED"),
  /**
   * Minimum integrity index of the agent's latest sealed, ledger-anchored run. Absent means DEFAULT_RUN_INTEGRITY_AT_LEAST.
   * Below 0.6 is an owner waiver: every decision made under it says so (condition `run-integrity`, reason `RUN INTEGRITY WAIVED:`).
   * It never waives a refused, unanchored, verification-failed run, nor findings against the agent.
   */
  requireRunIntegrityAtLeast: z.number().min(0).max(1).optional(),
  requireAssurancePacks: z.record(z.string().min(1), assurancePackRequirementSchema).default({}),
  evidenceLogic: policyEvidenceLogicSchema.optional(),
  allowExecute: z.boolean().default(false),
  requireExecTicket: z.boolean().default(false)
}).superRefine((rule, context) => {
  if (!rule.evidenceLogic) return;
  try {
    validatePolicyEvidenceLogicForRule(rule.evidenceLogic, rule);
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["evidenceLogic"],
      message: error instanceof Error ? error.message : "Invalid Action Policy evidence logic.",
    });
  }
});

export const actionPolicySchema = z.object({
  version: z.literal(1),
  defaultMode: z.enum(["DENY", "ALLOW"]).default("DENY"),
  riskTierDefaults: z.object({
    low: riskTierDefaultSchema,
    medium: riskTierDefaultSchema,
    high: riskTierDefaultSchema,
    critical: riskTierDefaultSchema
  }),
  actions: z.array(actionPolicyRuleSchema)
});

export type ActionPolicy = z.infer<typeof actionPolicySchema>;
export type ActionPolicyRule = z.infer<typeof actionPolicyRuleSchema>;
export type TrustTierAtLeast = z.infer<typeof trustTierAtLeastSchema>;

/** The rule's effective run-integrity threshold. */
export function runIntegrityAtLeast(rule: Pick<ActionPolicyRule, "requireRunIntegrityAtLeast">): number {
  return rule.requireRunIntegrityAtLeast ?? DEFAULT_RUN_INTEGRITY_AT_LEAST;
}
