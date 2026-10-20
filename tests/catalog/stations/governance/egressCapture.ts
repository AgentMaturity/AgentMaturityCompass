import { z } from "zod";
import { bindingSchema, contextFor, endpoint, identifier, invalidInput, outcome, sameBinding, utcTime } from "./protocol.js";

const canarySchema = z.object({ context: contextFor("L1-GOV-03"), at: utcTime, captureAvailable: z.boolean(), canaries: z.array(identifier).min(1),
  endpoints: z.array(z.object({ url: endpoint, noTraining: z.object({ binding: bindingSchema, contractId: identifier, startsAt: utcTime, endsAt: utcTime }).strict() }).strict()).min(1),
  requests: z.array(z.object({ binding: bindingSchema, endpoint, purpose: z.enum(["inference", "training", "telemetry"]), body: z.string() }).strict()).min(1) }).strict();

/** In-memory capture of an atomic synthetic batch; it does not send network requests or attest vendor training use. */
export function runCanaryOracle(input: unknown) {
  const parsed = canarySchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const value = parsed.data;
  if (!value.captureAvailable) return outcome("not_evaluated", "egress_capture_unavailable");
  if (value.requests.some(request => !sameBinding(value.context, request.binding))
    || value.endpoints.some(row => !sameBinding(value.context, row.noTraining.binding))) return outcome("deny", "binding_mismatch");
  if (!value.canaries.every(canary => value.requests.some(request => request.body.includes(canary)))) return outcome("not_evaluated", "canary_not_observed");
  const now = Date.parse(value.at);
  for (const request of value.requests) {
    const allowed = value.endpoints.filter(row => row.url === request.endpoint);
    if (request.purpose !== "inference" || allowed.length !== 1
      || !(Date.parse(allowed[0]!.noTraining.startsAt) <= now && now < Date.parse(allowed[0]!.noTraining.endsAt))) {
      return outcome("deny", "canary_egress_refused");
    }
  }
  return outcome("allow", "canary_inference_only", [], value.requests.map(({ endpoint, purpose, body }) => ({ endpoint, purpose, body })));
}

const cuiSchema = z.object({ context: contextFor("L1-GOV-06"), captureAvailable: z.boolean(),
  document: z.object({ binding: bindingSchema, resourceId: identifier, store: z.enum(["cui", "public"]), marking: z.enum(["CUI", "none"]), body: identifier }).strict(),
  boundary: z.object({ binding: bindingSchema, boundaryId: identifier, endpoints: z.array(endpoint).min(1) }).strict().nullable(),
  requests: z.array(z.object({ binding: bindingSchema, resourceId: identifier, endpoint }).strict()).min(1) }).strict();

/** The source-store classification survives an absent marking; all refused batch bytes remain uncaptured. */
export function runCuiOracle(input: unknown) {
  const parsed = cuiSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const value = parsed.data;
  if (!value.captureAvailable) return outcome("not_evaluated", "egress_capture_unavailable");
  if (!value.boundary) return outcome("not_evaluated", "cui_boundary_unavailable");
  if (!sameBinding(value.context, value.document.binding) || !sameBinding(value.context, value.boundary.binding)
    || value.requests.some(request => !sameBinding(value.context, request.binding))) return outcome("deny", "binding_mismatch");
  if (value.document.store !== "cui" && value.document.marking !== "CUI") return outcome("not_evaluated", "cui_context_missing");
  if (value.requests.some(request => request.resourceId !== value.document.resourceId || !value.boundary!.endpoints.includes(request.endpoint))) {
    return outcome("deny", "cui_egress_refused");
  }
  return outcome("allow", "cui_boundary_preserved", [], value.requests.map(request => ({ endpoint: request.endpoint, purpose: "inference", body: value.document.body })));
}
