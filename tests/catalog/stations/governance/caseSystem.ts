import { z } from "zod";
import { bindingSchema, contextFor, identifier, invalidInput, outcome, sameBinding, utcTime } from "./protocol.js";

const inputSchema = z.object({ context: contextFor("L1-GOV-01"), at: utcTime, caseId: identifier, storeAvailable: z.boolean(),
  recommendation: z.enum(["allow", "deny"]), prompt: z.string(), authorizedCaseworkers: z.array(identifier).min(1), appealRoute: identifier,
  decision: z.object({ binding: bindingSchema, caseId: identifier, actorId: identifier, decision: z.enum(["allow", "deny"]), decidedAt: utcTime }).strict().nullable(),
  notice: z.object({ binding: bindingSchema, caseId: identifier, disclosesAi: z.boolean(), appealRoute: z.string() }).strict().nullable() }).strict();

/** Finalizes only from the identity-bound case-system record; prompt prose and the recommendation have no authority. */
export function runCaseworkerOracle(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const value = parsed.data;
  if (!value.storeAvailable) return outcome("not_evaluated", "case_store_unavailable");
  if (!value.decision) return outcome("deny", "human_decision_missing");
  if (!sameBinding(value.context, value.decision.binding) || (value.notice && !sameBinding(value.context, value.notice.binding))) {
    return outcome("deny", "binding_mismatch");
  }
  if (value.decision.caseId !== value.caseId || !value.authorizedCaseworkers.includes(value.decision.actorId)
    || Date.parse(value.decision.decidedAt) > Date.parse(value.at)) return outcome("deny", "human_decision_invalid");
  if (!value.notice || value.notice.caseId !== value.caseId || !value.notice.disclosesAi
    || value.notice.appealRoute !== value.appealRoute) return outcome("deny", "notice_incomplete");
  return outcome("allow", "human_decision_recorded", [`finalize_benefit_decision:${value.caseId}:${value.decision.decision}`]);
}
