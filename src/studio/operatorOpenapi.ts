/**
 * OpenAPI for /api/v1/operator (P2-22): plan diff and signed activation, the blocker inbox, review packets and opt-in
 * review timing. Role classes: src/api/accessPolicy.ts.
 */
import type { OpenApiOperation } from "./openapiTypes.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" };
const integer = { type: "integer", minimum: 0 };
const planDigest = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const opaque = { type: "string", pattern: "^[A-Za-z0-9._:-]{1,128}$" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const json = (description: string, schema: Record<string, unknown>) => ({ description, content: { "application/json": { schema } } });
const query = (name: string, schema: Record<string, unknown>, required = false) => ({ name, in: "query", required, schema });

function operation(summary: string, response: Record<string, unknown>, options: { body?: string; status?: string; parameters?: Array<Record<string, unknown>> } = {}): OpenApiOperation {
  return {
    summary, tags: ["Studio", "Operator"], security: [{ adminToken: [] }, { sessionCookie: [] }], parameters: options.parameters ?? [],
    ...(options.body ? { requestBody: { required: true, content: { "application/json": { schema: ref(options.body) } } } } : {}),
    responses: {
      [options.status ?? "200"]: response,
      "400": json("Invalid body or query.", ref("OperatorError")),
      "401": json("No authenticated session.", ref("OperatorError")),
      "403": json("Role class refused, agent or lease credentials, APPROVAL_REQUIRED, PLAN_REVIEW_NOT_APPROVED or APPROVAL_NOT_BOUND.", ref("OperatorError")),
      "404": json("Unknown plan, packet, review session or route.", ref("OperatorError")),
      "409": json("PLAN_UNSIGNED, RESULTS_NOT_RECORDED, REVIEW_TIMING_DISABLED, an activateControlPlan refusal code or PACKET_KEY_MATERIAL.", ref("OperatorError")),
      "423": json("VAULT_LOCKED: unlock the vault first.", ref("OperatorError"))
    }
  };
}
const data = (description: string) => json(description, ref("OperatorResponse"));

export function operatorEndpoints(): Record<string, Record<string, OpenApiOperation>> {
  const p = "/api/v1/operator";
  return {
    [`${p}/plans`]: { get: operation("Signed compiled plans (A4 Adapt builds and the active plan) with their sources' status", data("Plans; a failed source is `unavailable`.")) },
    [`${p}/plans/diff`]: { get: operation("Diff two signed plans; every reason comes from the compiler", data("diffPlans output and its Markdown."),
      { parameters: [query("from", planDigest, true), query("to", planDigest, true)] }) },
    [`${p}/plans/activate`]: { post: operation("Activate a signed plan with a review approved for exactly that plan (OWNER, vault unlocked)",
      data("The new journal revision and the counted approvers."), { body: "OperatorActivate" }) },
    [`${p}/inbox`]: { get: operation("Blocker inbox: never all clear by default; a failed source adds source_unavailable", data("Items ordered mandatory, due time, age.")) },
    [`${p}/review-packets`]: { post: operation("Build a signed review packet (AUDITOR or OWNER, vault unlocked; free)", data("Packet id, file digests, build-time verifier dimensions."),
      { body: "OperatorReviewPacket", status: "201" }) },
    [`${p}/review-packets/{packetId}/download`]: { get: operation("Download a review packet zip (AUDITOR or OWNER)",
      { description: "The packet zip.", content: { "application/zip": { schema: { type: "string", format: "binary" } } } },
      { parameters: [{ name: "packetId", in: "path", required: true, schema: { type: "string", pattern: "^rp_[0-9a-f]{24}$" } }] }) },
    [`${p}/review-timing/status`]: { get: operation("Whether review timing is on, and the notice a reviewer accepts", data("enabled and notice.")) },
    [`${p}/review-timing/events`]: { post: operation("Record one review-timing event under the caller's pseudonym (409 while timing is off)", data("Session id and event id."),
      { body: "OperatorReviewTimingEvent", status: "201" }) },
    [`${p}/review-timing/export`]: { get: operation("Review timing as CSV (OWNER)",
      { description: "sessionId, reviewerPseudonym, packetId, itemId, decision, startedAt, completedAt, activeSeconds", content: { "text/csv": { schema: string } } },
      { parameters: [query("from", string), query("to", string)] }) }
  };
}

export function operatorSchemas(): Record<string, unknown> {
  return {
    OperatorError: { type: "object", required: ["ok", "error", "code"], properties: { ok: { type: "boolean", enum: [false] }, error: string, code: string } },
    OperatorResponse: { type: "object", required: ["ok", "data"], properties: { ok: { type: "boolean", enum: [true] }, data: { type: "object" } } },
    OperatorActivate: object({ planDigest, approvalId: { type: "string", minLength: 1, maxLength: 200 } }, ["planDigest"]),
    OperatorReviewPacket: object({
      planDigest, agentIds: { type: "array", maxItems: 64, items: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$" } },
      window: object({ fromTs: integer, toTs: integer }),
      formats: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: ["json", "oscal", "pdf"] } }
    }, ["planDigest", "window", "formats"]),
    OperatorReviewTimingEvent: { oneOf: [
      object({ event: { type: "string", enum: ["review_session_started"] }, noticeAccepted: { type: "boolean", enum: [true] }, packetId: opaque }),
      object({ event: { type: "string", enum: ["review_item_opened"] }, sessionId: opaque, itemId: opaque }),
      object({ event: { type: "string", enum: ["review_item_decided"] }, sessionId: opaque, itemId: opaque,
        decision: { type: "string", enum: ["confirmed", "disputed", "needs_more"] }, activeSeconds: { type: "integer", minimum: 0, maximum: 86400 } }),
      object({ event: { type: "string", enum: ["review_session_completed"] }, sessionId: opaque, activeSeconds: { type: "integer", minimum: 0, maximum: 86400 } })
    ] }
  };
}
