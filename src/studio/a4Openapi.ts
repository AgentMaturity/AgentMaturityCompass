/**
 * OpenAPI for /api/v1/a4 (P1-57; design §12.1), on the native task pattern. Every route is a preview route: without
 * AMC_A4_PREVIEW=1 it answers 404 A4_PREVIEW_DISABLED. Response bodies name their published contract
 * (spec/schemas/v1/a4-*.schema.json); result routes gain ClaimResult through withClaimResponses.
 */
import type { OpenApiOperation } from "./openapiTypes.js";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" };
const integer = { type: "integer", minimum: 0 };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
const stage = { type: "string", enum: ["aspire", "assemble", "adapt", "activate"] };
const requestId = { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$", description: "Owner-scoped idempotency key; a retry with the same key and body answers the recorded result." };
const reason = { type: "string", minLength: 1, maxLength: 2000 };
const content = { type: "string", minLength: 1, maxLength: 65536, description: "Human-authored text; stored encrypted in the project's blob store, never inline." };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: "object", additionalProperties: false, required, properties });
const control = (properties: Record<string, unknown> = {}, required = Object.keys(properties)) =>
  object({ ...properties, expectedHeadSeq: integer, clientRequestId: requestId }, [...required, "expectedHeadSeq", "clientRequestId"]);
const json = (description: string, schema: Record<string, unknown>) => ({ description, content: { "application/json": { schema } } });
const path = (name: string, schema: Record<string, unknown> = string) => ({ name, in: "path", required: true, schema });
const query = (name: string, schema: Record<string, unknown>, description: string) => ({ name, in: "query", required: false, schema, description });
const mutationHeaders = [
  { name: "x-amc-native-intent", in: "header", required: true, schema: { type: "string", enum: ["task-workspace-v1"] },
    description: "Explicit native mutation intent." },
  { name: "x-amc-native-csrf", in: "header", required: false, schema: string,
    description: "Required with a human session cookie; obtain from /api/v1/studio/whoami. Never use in a URL." },
  { name: "Origin", in: "header", required: false, schema: string, description: "Required for cookie mutations; must match a configured browser origin and the request Host." }
];
const project = path("projectId", { type: "string", pattern: "^a4p_[0-9a-f]{32}$" });

function operation(summary: string, response: string, options: { write?: boolean; body?: string; status?: string; parameters?: Array<Record<string, unknown>> } = {}): OpenApiOperation {
  const status = options.status ?? "200";
  return {
    summary, tags: ["Studio", "A4 Forge"], security: [{ adminToken: [] }, { sessionCookie: [] }],
    parameters: [...(options.parameters ?? []), ...(options.write ? mutationHeaders : [])],
    ...(options.body ? { requestBody: { required: true, content: { "application/json": { schema: ref(options.body) } } } } : {}),
    responses: {
      [status]: json(options.write ? "Recorded transition (or the recorded result of a retried request ID)." : "Current A4 state; no-store.", ref(response)),
      "400": json("Invalid body or query, an identity or trust field in the body, SOD_VIOLATION or HYPOTHESIS_SOURCE_MISMATCH.", ref("A4Error")),
      "401": json("No authenticated Studio session (A4 routes are served only through native Studio admission).", ref("A4Error")),
      "403": json("DEMO_REFUSED, ADMIN_TOKEN_REFUSED (the admin token reads only), NATIVE_READ_ONLY, role class or project membership refused.", ref("A4Error")),
      "404": json("A4_PREVIEW_DISABLED without AMC_A4_PREVIEW=1, or an unknown project, gate or route.", ref("A4Error")),
      "409": json("A4_STALE_HEAD (with head and diff), A4_GATE_STALE, A4_NOT_READY naming the items, RESOURCE_DRIFTED, REQUEST_CONFLICT or an integrity failure.", ref("A4Error")),
      "423": json("A4_VAULT_LOCKED: unlock the vault to record this.", ref("A4Error")),
      "500": json("The outcome is uncertain; reload the project before retrying.", ref("A4Error"))
    }
  };
}

const read = (summary: string, parameters: Array<Record<string, unknown>> = []) => operation(summary, "A4Response", { parameters: [project, ...parameters] });
const write = (summary: string, body: string, parameters: Array<Record<string, unknown>> = [], status = "200") =>
  operation(summary, "A4MutationResponse", { write: true, body, status, parameters: [project, ...parameters] });

export function a4Endpoints(): Record<string, Record<string, OpenApiOperation>> {
  const p = "/api/v1/a4/projects/{projectId}";
  const stagePath = path("stage", stage);
  const paths: Record<string, Record<string, OpenApiOperation>> = {
    "/api/v1/a4/options": { get: operation("A4 vocabularies, limits, question banks and this workspace's signing route", "A4Response") },
    "/api/v1/a4/inbox": { get: operation("This principal's non-READY mandatory readiness items across the projects it reads", "A4Response") },
    "/api/v1/a4/projects": {
      get: operation("Projects this principal reads (members; workspace OWNER and AUDITOR read all)", "A4Response"),
      post: operation("Create a project (human session with OPERATOR or OWNER; an existing agent needs OWNER)", "A4MutationResponse",
        { write: true, body: "A4CreateProject", status: "201" })
    },
    [p]: { get: read("Project head, members, current revision summary, gates and readiness (amc.a4-project/v1)") },
    [`${p}/readiness`]: { get: read("The one readiness evaluation for this principal (amc.a4-readiness/v1)", [query("stage", stage, "Defaults to the head stage.")]) },
    [`${p}/events`]: { get: read("Poll: events folded from the chain, the head and presence", [
      query("cursor", integer, "The next seq to read (0 for all)."), query("card", string, "Only events on this card.")]) },
    [`${p}/revisions`]: { get: read("Revision summaries") },
    [`${p}/revisions/diff`]: { get: read("Changed specification and resource slots between two revisions", [
      query("from", integer, "Revision number."), query("to", integer, "Revision number.")]) },
    [`${p}/revisions/{revisionNo}`]: { get: read("One revision (amc.a4-revision/v1)", [path("revisionNo", integer)]) },
    [`${p}/transitions`]: { get: read("Transitions (amc.a4-transition/v1), at most 512 per page", [query("cursor", integer, "The first seq to return.")]) },
    [`${p}/gates`]: { get: read("Gates with their decisions and quorum (amc.a4-gate/v1)") },
    [`${p}/members`]: { get: read("Members; owners also see who can be added"), post: write("Add, change or remove a member (owner)", "A4Members") },
    [`${p}/comments`]: { get: read("Comments (bodies read from the encrypted blob store; VAULT_LOCKED when it is locked)", [query("card", string, "Only this card.")]),
      post: write("Comment (project members, read roles suffice)", "A4Comment", [], "201") },
    [`${p}/presence`]: { post: write("Show presence on a card for 30 s (never journaled)", "A4Presence") },
    [`${p}/evidence`]: { get: read("Evidence refs of a revision, resolved now (tier recomputed, lane re-derived)", [query("revision", integer, "Defaults to the head revision.")]),
      post: write("Attach an evidence ref (builder or owner; self_reported unless a runtime-written ledger row earns observed)", "A4Evidence", [], "201") },
    [`${p}/value`]: { get: read("Value view: not evaluated until Activate's producer (P1-62)") },
    [`${p}/monitor`]: { get: read("Monitor view: not evaluated until Activate's producer (P1-62)") },
    [`${p}/conformance`]: { get: read("Conformance statement: not evaluated until Adapt's producer (P1-61)", [query("stage", stage, "Stage.")]) },
    [`${p}/verify`]: { get: read("verifyA4Chain over this project under the server operator's trust list (no query parameters)") },
    [`${p}/gate-policy`]: { post: write("Open a policy gate with a proposed gate policy, or apply a decided one (owner)", "A4GatePolicyChange") },
    [`${p}/acknowledge`]: { post: write("Owner acknowledgement of a WAITING item (stays WAITING, OWNER_ACKNOWLEDGED, 90 days)", "A4Acknowledge") },
    [`${p}/stages/{stage}/gates/{gate}/request`]: { post: write("Open the stage's direction or completion gate", "A4Control",
      [stagePath, path("gate", { type: "string", enum: ["direction", "completion"] })], "201") },
    [`${p}/gates/{gateId}/request-changes`]: { post: write("Request changes (APPROVER, AUDITOR or OWNER); supersedes the gate", "A4RequestChanges",
      [path("gateId", { type: "string", pattern: "^a4gate_[0-9a-f]{32}$" })]) },
    [`${p}/stages/{stage}/complete`]: { post: write("Consume the stage's approved gate once (adapt and activate: owner); an effect gate opened on it runs its effect and the response names the attempt", "A4Complete", [stagePath]) },
    [`${p}/hypotheses/{hypothesisId}/observe`]: { post: write("Observe a PMF hypothesis with a runtime-written row inside its window", "A4Observe",
      [path("hypothesisId")], "201") }
  };
  for (const verdict of ["approve", "deny"]) {
    paths[`${p}/gates/{gateId}/${verdict}`] = { post: write(`${verdict === "approve" ? "Approve" : "Deny"} a gate (bound to its request digest and seq; separation of duties refused at write)`,
      "A4Decide", [path("gateId", { type: "string", pattern: "^a4gate_[0-9a-f]{32}$" })], "201") };
  }
  for (const [action, summary] of [["open", "Open or re-open the effect gate (owner)"], ["retry", "Retry a failed effect under the liveness rule (owner)"]] as const) {
    paths[`${p}/stages/{stage}/effects/{effectId}/${action}`] = { post: write(summary, action === "open" ? "A4EffectOpen" : "A4EffectRetry",
      [stagePath, path("effectId")], "201") };
  }
  for (const [action, body, summary] of [
    ["answers", "A4Answers", "Record answers (a new revision; the step returns to asked)"],
    ["understand", "A4StageContent", "Record what was understood (no producer registered: human-authored stage output)"],
    ["confirm-understanding", "A4ConfirmUnderstanding", "Confirm the understanding (step understood)"],
    ["explain", "A4Explain", "Record the explanation at a level (step explained)"],
    ["propose", "A4Propose", "Freeze the proposed specification as a revision (step proposed)"],
    ["build", "A4StageContent", "Record the build (no producer registered: a self_reported implementation ref; step built)"],
    ["review", "A4StageContent", "Record the review (observed checks not evaluated without a producer; step reviewed)"]
  ] as const) {
    paths[`${p}/stages/{stage}/${action}`] = { post: write(summary, body, [stagePath], "201") };
  }
  for (const [action, body, summary] of [["hold", "A4Reason", "Hold the project (owner)"], ["resume", "A4Reason", "Resume once any freeze is lifted (owner)"],
    ["reopen", "A4Reopen", "Move back to an earlier stage (owner)"], ["tune", "A4Tune", "Tune a deployed project (owner; stage derived)"],
    ["retire", "A4Retire", "Retire the project (owner, or the creator of a never-proposed draft)"]] as const) {
    paths[`${p}/${action}`] = { post: write(summary, body) };
  }
  return paths;
}

export function a4Schemas(): Record<string, unknown> {
  const data = { type: "object", description: "The A4 record; result routes carry `claim` (one claim per result) and the wrapper repeats its claim fields." };
  return {
    A4Error: { type: "object", required: ["ok", "error", "code"], properties: { ok: { type: "boolean", enum: [false] }, error: string, code: string,
      detail: {}, head: { type: "object" }, diff: string } },
    A4Response: object({ ok: { type: "boolean", enum: [true] }, data }),
    A4MutationResponse: object({ ok: { type: "boolean", enum: [true] }, data: object({ projectId: string, seq: integer, kind: string, bodyDigest: digest,
      replay: { type: "boolean" }, attemptId: string, agentId: string }, ["projectId", "seq", "kind", "bodyDigest", "replay"]) }),
    A4CreateProject: object({ clientRequestId: requestId, name: { type: "string", minLength: 1, maxLength: 200 },
      agentId: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,127}$" }, archetype: { type: "string", minLength: 1, maxLength: 128 },
      expertise: { type: "string", enum: ["novice", "practitioner", "expert"] } }, ["clientRequestId", "name", "expertise"]),
    A4Control: control(),
    A4Reason: control({ reason }),
    A4Reopen: control({ reason, toStage: stage }),
    A4Tune: control({ reason, capabilityChange: { type: "boolean" }, mechanicPlanId: string }, ["reason", "capabilityChange"]),
    A4Retire: control({ reason, acceptanceNote: reason }, ["reason"]),
    A4Acknowledge: control({ reason, itemId: string, stage }, ["reason", "itemId"]),
    A4Members: control({ event: { type: "string", enum: ["added", "roles_changed", "removed"] }, principalKey: string,
      projectRoles: { type: "array", items: { type: "string", enum: ["owner", "builder", "reviewer", "approver", "viewer"] } } }, ["principalKey"]),
    A4Comment: object({ body: { type: "string", minLength: 1, maxLength: 16384 }, cardId: string, inReplyTo: string, clientRequestId: requestId },
      ["body", "cardId", "clientRequestId"]),
    A4Presence: object({ card: string }),
    A4Evidence: control({ refKind: string, refId: string, sha256: digest, label: string }),
    A4GatePolicyChange: { oneOf: [control({ proposedGatePolicy: { type: "object", description: "amc.a4-gate-policy/v1" } }), control({ gateId: string })] },
    A4Answers: control({ answers: { type: "array", minItems: 1, maxItems: 200, items: object({ questionId: string, value: {} }) } }),
    A4StageContent: control({ content }),
    A4ConfirmUnderstanding: control({ confirmed: { type: "boolean", enum: [true] } }),
    A4Explain: control({ content, level: { type: "string", enum: ["novice", "practitioner", "expert"] } }),
    A4Propose: control({ spec: { type: "object", description: "The specification; answers are carried by the server." }, parentRevisionNo: integer }, ["spec"]),
    A4Decide: object({ reason, expectedRequestDigestSha256: digest, expectedReadinessBindingDigest: digest, expectedGateSeq: integer, clientRequestId: requestId },
      ["reason", "expectedRequestDigestSha256", "expectedGateSeq", "clientRequestId"]),
    A4RequestChanges: object({ reason, expectedGateSeq: integer, clientRequestId: requestId, findings: { type: "array", items: object({
      severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] }, message: string }) } }, ["reason", "expectedGateSeq", "clientRequestId"]),
    A4Complete: control({ gateId: string }),
    A4EffectOpen: control({ gateId: string }),
    A4EffectRetry: control({ attemptId: string }),
    A4Observe: control({ verdict: { type: "string", enum: ["observed", "refuted"] }, evidenceRef: object({ refId: string, sha256: digest }) })
  };
}
