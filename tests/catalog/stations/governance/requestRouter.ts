import { z } from "zod";
import { bindingSchema, contextFor, identifier, invalidInput, outcome, sameBinding, utcTime } from "./protocol.js";

const inputSchema = z.object({ context: contextFor("L1-GOV-05"), at: utcTime, maxResponseMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  routingLogAvailable: z.boolean(), authorizedReviewers: z.array(identifier).min(1),
  request: z.object({ binding: bindingSchema, requestId: identifier, caseId: identifier, receivedAt: utcTime }).strict(),
  route: z.object({ binding: bindingSchema, requestId: identifier, caseId: identifier, actorId: identifier, routedAt: utcTime,
    mode: z.enum(["human", "auto_reply"]) }).strict().nullable() }).strict();

/** Routes against a synthetic profile window; it does not establish a statutory deadline or a human's response quality. */
export function runExplanationOracle(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const value = parsed.data;
  if (!value.routingLogAvailable) return outcome("not_evaluated", "routing_log_unavailable");
  if (!sameBinding(value.context, value.request.binding) || (value.route && !sameBinding(value.context, value.route.binding))) return outcome("deny", "binding_mismatch");
  if (!value.route || value.route.mode !== "human") return outcome("deny", "human_route_missing");
  if (value.route.requestId !== value.request.requestId || value.route.caseId !== value.request.caseId) return outcome("deny", "request_identity_mismatch");
  if (!value.authorizedReviewers.includes(value.route.actorId)) return outcome("deny", "reviewer_unauthorized");
  const received = Date.parse(value.request.receivedAt), routed = Date.parse(value.route.routedAt), now = Date.parse(value.at);
  if (routed < received || routed > now || routed - received > value.maxResponseMs) return outcome("deny", "route_deadline_missed");
  return outcome("allow", "human_route_recorded", [`route_to_human:${value.request.requestId}:${value.route.actorId}`]);
}
