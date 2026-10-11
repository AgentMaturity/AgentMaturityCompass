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
const content = { type: "string", minLength: 1, maxLength: 65536,
  description: "Human-authored text; stored encrypted in the project's blob store, never inline. Required while the stage has no producer; beside a producer it is the member's own statement." };
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
    description: "Required with a human session cookie; obtain nativeCsrfToken from GET /auth/me. Never use in a URL." },
  { name: "Origin", in: "header", required: false, schema: string, description: "Required for cookie mutations; must match a configured browser origin and the request Host." }
];
const project = path("projectId", { type: "string", pattern: "^a4p_[0-9a-f]{32}$" });
const releasePath = path("releaseId", { type: "string", pattern: "^a4r_[0-9a-f]{32}$" });

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
      post: operation("Create a project (human session with OPERATOR or OWNER; an agent whose config, context graph or target profile exists needs OWNER)", "A4MutationResponse",
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
    // Presence answers { presence: [{ username, card }] }, not a transition.
    [`${p}/presence`]: { post: operation("Show presence on a card for 30 s (never journaled)", "A4Response", { write: true, body: "A4Presence", parameters: [project] }) },
    [`${p}/evidence`]: { get: read("Evidence refs of a revision, resolved now (tier recomputed, lane re-derived)", [query("revision", integer, "Defaults to the head revision.")]),
      post: write("Attach an evidence ref (builder or owner; self_reported unless a runtime-written ledger row earns observed)", "A4Evidence", [], "201") },
    [`${p}/value`]: { get: read("The current release's value claims (amc.a4-value-claim/v1, one per value-contract KPI, recorded once per Activate Review) in four lanes never merged: recommended, implemented, observed (re-resolved now; null while a ref dangles) and independently reviewed (not_evaluated without an admitted record naming the KPI); the members' other objectives, the ROI worksheet (not evaluated) and the hypotheses predicted vs observed vs verdict. Reads only: never runs the value report or appends a value event") },
    [`${p}/monitor`]: { get: read("The current release's newest monitor record (Activate Review; lane implementation, self_reported): one claim envelope per source, every field { value, source, trustTier, window }, a missing source source_unavailable with value null; read only while its signed file resolves") },
    [`${p}/conformance`]: { get: read("The stage's conformance statement (amc.a4-conformance-statement/v1): Adapt's from its Review's signed control results, checked again now (a results file edited, deleted or no longer verifying reads not_evaluated with its reason), with the owner's out-of-scope settlements, the sources acknowledgement and the deferred-activation acknowledgement on that Adapt revision as readiness counts them (once its completion gate is consumed, the ones in force then); every other stage carries no plan and says not_evaluated", [query("stage", stage, "Defaults to the head stage.")]) },
    [`${p}/verify`]: { get: read("verifyA4Chain over this project under the server operator's trust list (no query parameters)") },
    [`${p}/gate-policy`]: { post: write("Open a policy gate with a proposed gate policy, or apply a decided one (owner)", "A4GatePolicyChange") },
    [`${p}/acknowledge`]: { post: write("Owner acknowledgement of a WAITING item (stays WAITING, OWNER_ACKNOWLEDGED, 90 days)", "A4Acknowledge") },
    [`${p}/stages/{stage}/gates/{gate}/request`]: { post: write("Open the stage's direction or completion gate", "A4Control",
      [stagePath, path("gate", { type: "string", enum: ["direction", "completion"] })], "201") },
    [`${p}/gates/{gateId}/request-changes`]: { post: write("Request changes (APPROVER, AUDITOR or OWNER); supersedes the gate", "A4RequestChanges",
      [path("gateId", { type: "string", pattern: "^a4gate_[0-9a-f]{32}$" })]) },
    [`${p}/stages/{stage}/complete`]: { post: write("Consume the stage's approved gate once (adapt and activate: owner); an effect gate opened on it, or an effect that runs on the gate's own quorum (Aspire completion: a4.aspire.apply_contracts; Activate completion: a4.activate.production_lease), runs its effect and the response names the attempt; an inline effect (the release, the production lease) runs before the response, which carries its lease token once (a replay answers token: null, TOKEN_ALREADY_DELIVERED once the attempt finished, or the attempt's failure code) or its failure code", "A4Complete", [stagePath]) },
    [`${p}/releases`]: { get: read("This project's release records (amc.a4-release/v1 summaries) with the leases' live status"),
      post: write("Release (owner): consume the release approval (Activate's direction gate) and run the opened a4.activate.release effect inline: a signed package from content-addressed inputs and the staging lease (WRITE_LOW at most, the staging routes, 24 h), whose token this response carries once; a replay answers token: null, TOKEN_ALREADY_DELIVERED once the attempt finished, or the attempt's failure code", "A4Complete") },
    [`${p}/releases/{releaseId}`]: { get: read("One release record (amc.a4-release/v1): its A4_RECORD envelope checked now, the leases' live status, the package's file list (when the manifest still hashes to the package digest), the eight-surface table with a reason for each surface not evaluated, the prepared deployment plan and update policy with their signatures checked now, the receipts in two columns (recorded by the operator; checked by AMC), the rollbacks, the lifecycle bridge outcomes and the production bridge rows as they stand now",
      [releasePath]) },
    [`${p}/releases/{releaseId}/deployments`]: {
      get: read("The release's deploy and rollback receipts in two columns: recordedStatus as the operator stated it, amcCheckStatus from AMC's newest check of that receipt; never merged", [releasePath]),
      post: write("Record the operator's deployment receipt (owner, owner mode; amc.a4-deployment-receipt/v1, signed a4-deployment-receipt, self_reported). Refused DEPLOYMENT_NOT_SAME_HOST unless this Studio runs under the target (v1 same-host restart, D-18; P2-40), PACKAGE_DIGEST_MISMATCH, LEASE_NOT_OF_RELEASE, TARGET_MISMATCH, RELEASE_ROLLED_BACK (a deploy row for a rolled-back release). A rollback row is recordable on a held or frozen project. No lease is issued and no runtime run is created; a succeeded production deploy, or a succeeded rollback row, moves deployedReleaseId",
        "A4Deployment", [releasePath], "201") },
    [`${p}/releases/{releaseId}/verify`]: { post: write("AMC's own check of the newest receipt's destinationRef (owner, owner mode, token-less): resolveAndCheck with a pinned connection, TLS to the system CA set, no redirects, 5 s, 256 KiB. reachable at best in v1 (image, package and plan-head checks not_evaluated until P2-40); failed on DESTINATION_MISMATCH, READYZ_FAILED, REDIRECT_REFUSED or TLS_REFUSED; 409 VERIFY_EGRESS_REFUSED for a non-public destination, with nothing recorded. recordedStatus is never touched",
      "A4Verify", [releasePath], "201") },
    [`${p}/releases/{releaseId}/rollback/preview`]: { post: write("Preview a rollback (owner, owner mode) and open its effect gate a4.activate.rollback: a DEPLOY engine request binding the preview, decided separately under A4's separation of duties",
      "A4RollbackPreview", [releasePath], "201") },
    [`${p}/releases/{releaseId}/rollback`]: { post: write("Roll back (owner, owner mode) with the exact release and Enforce manifest the preview bound, journaled as an effect (EFFECT_STARTED first, pinned to expectedHeadSeq; 409 EFFECT_RUNNING while another attempt runs): the grant consumed, a freeze first for a high or critical risk tier, the Enforce restore, every lease of the release revoked (read again at execution), the prepared commands, a signed a4-rollback-receipt, then ROLLBACK with EFFECT_FINISHED; a failed step is EFFECT_FAILED with its code and a replay answers the attempt's outcome; the lifecycle is never moved backwards and deployedReleaseId moves when the operator records the rollback row",
      "A4Rollback", [releasePath], "201") },
    [`${p}/hypotheses/{hypothesisId}/observe`]: { post: write("Observe a PMF hypothesis, once the project has left Aspire, with a runtime-written row inside its window", "A4Observe",
      [path("hypothesisId")], "201") },
    [`${p}/outcome-unknown/{executionId}/request`]: { post: write("Request a resolution of an outcome_unknown execution blocking the project's agent: the operator's statement as an amc.action.resolve engine request (self_reported)",
      "A4OutcomeRequest", [path("executionId")], "201") },
    [`${p}/outcome-unknown/{executionId}/resolve`]: { post: write("Record the approved resolution (resolveManually) once A4's dual control holds (bound approvals from project approvers or owners other than the operator, Assemble's builders and its build sessions' owners; two live-checked keys when regulated; else 409 RESOLUTION_QUORUM_INSUFFICIENT); its ACTION_STATE row is a ledger_event ref, self_reported, never observed",
      "A4Control", [path("executionId")], "201") },
    [`${p}/stages/assemble/scaffold`]: { post: write("External path, after Build (owner, owner mode): the path's scaffold, contract tests and policy pack into a new workspace directory outside .amc/, written after a manifest ref (self_reported) binding every file's sha256 is recorded",
      "A4AssembleScaffold", [], "201") },
    [`${p}/stages/assemble/connect`]: { post: write("External path, after Build (owner, owner mode): connect instructions with a lease whose token is in this response once and never stored; the record keeps the leaseId (a replay answers token: null)",
      "A4AssembleConnect", [], "201") },
    [`${p}/stages/assemble/import`]: { post: write("External path, after Build (owner, owner mode): the neutral importer over a workspace file or directory, originals retained; its manifest is a self_reported ref, and a refused record rolls the import back",
      "A4AssembleImport", [], "201") },
    [`${p}/stages/adapt/probe`]: { post: write("Adapt context probe, after Build (owner, owner mode): one in-process turn on the stub provider with the A4 context plugin, into which A4 writes nothing; the session's session/open row becomes a self_reported ledger_event ref (A4 ran the turn: never observed) beside whether the plugin's exact text is in the session's signed user/message row; the turn makes no tool call, so the runtime writes no effective-policy receipt; delivery to a model and to native tasks is not evaluated",
      "A4Control", [], "201") }
  };
  for (const verdict of ["approve", "deny"]) {
    paths[`${p}/approvals/{approvalRequestId}/${verdict}`] = { post: operation(`${verdict === "approve" ? "Approve" : "Deny"} an engine request this project named (an effect gate it opened, an outcome_unknown resolution it requested), as a live project approver or owner, bound to the request digest`,
      "A4Response", { write: true, body: "A4EngineDecision", status: "201", parameters: [project, path("approvalRequestId", { type: "string", pattern: "^apprreq_[a-f0-9]{32}$" })] }) };
  }
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
    ["understand", "A4StageContent", "Run Understand: the stage's producer, or the human-authored statement while it has none"],
    ["confirm-understanding", "A4ConfirmUnderstanding", "Confirm the understanding (step understood)"],
    ["explain", "A4Explain", "Explain at a level (step explained): the stage's producer, or the human-authored text while it has none"],
    ["propose", "A4Propose", "Freeze the proposed specification as a revision (step proposed)"],
    ["build", "A4StageContent", "Build (step built): the stage's producer (aspire, assemble and adapt: owner, owner mode; assemble's native build session starts after the step is recorded and the response names it), or a self_reported human-authored implementation ref while it has none"],
    ["review", "A4StageContent", "Review (step reviewed): the stage's producer checks (adapt: owner, owner mode, since it signs the control results), or human findings; not_evaluated without an observed ref"]
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
    A4StageContent: control({ content }, []),
    A4ConfirmUnderstanding: control({ confirmed: { type: "boolean", enum: [true] } }),
    A4Explain: control({ content, level: { type: "string", enum: ["novice", "practitioner", "expert"] } }, ["level"]),
    A4Propose: control({ spec: { type: "object", description: "The specification; answers are carried by the server." }, parentRevisionNo: integer }, ["spec"]),
    A4Decide: object({ reason, expectedRequestDigestSha256: digest, expectedReadinessBindingDigest: digest, expectedGateSeq: integer, clientRequestId: requestId },
      ["reason", "expectedRequestDigestSha256", "expectedGateSeq", "clientRequestId"]),
    A4RequestChanges: object({ reason, expectedGateSeq: integer, clientRequestId: requestId, findings: { type: "array", items: object({
      severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] }, message: string }) } }, ["reason", "expectedGateSeq", "clientRequestId"]),
    A4Complete: control({ gateId: string }),
    A4EffectOpen: control({ gateId: string }),
    A4EffectRetry: control({ attemptId: string }),
    A4Observe: control({ verdict: { type: "string", enum: ["observed", "refuted"] }, evidenceRef: object({ refId: string, sha256: digest }) }),
    A4OutcomeRequest: control({ effect: { type: "string", enum: ["applied", "not_applied"] }, externalRef: { type: ["string", "null"], maxLength: 512 },
      note: { type: "string", minLength: 1, maxLength: 4000, description: "Scanned for secrets, then sealed in the project's encrypted blob store; the engine request and the action journal carry only a reference naming the sealed blob and the note's sha256." } }),
    A4AssembleScaffold: control({ directory: { type: "string", minLength: 1, maxLength: 200, description: "Workspace-relative; plain names without a leading dot; no symbolic link or file on the way (400 PATH_NOT_PLAIN), so never under .amc/; must not exist yet." } }),
    A4AssembleConnect: control({ mode: { type: "string", enum: ["supervise", "sandbox"] }, adapterId: { type: ["string", "null"], pattern: "^[a-z0-9][a-z0-9._-]{0,63}$" } }, ["mode"]),
    A4AssembleImport: control({ inputPath: { type: "string", minLength: 1, maxLength: 512, description: "A workspace file or directory: plain names without a leading dot, no symbolic link on the way or at the end (400 PATH_NOT_PLAIN), so never under .amc/. A source already imported is 409 IMPORT_EXISTS (an existing import is never rewritten or rolled back)." } }),
    A4EngineDecision: object({ reason: { type: "string", minLength: 1, maxLength: 1000 }, expectedRequestDigestSha256: digest }),
    A4Deployment: control({ kind: { type: "string", enum: ["deploy", "rollback"] }, environment: { type: "string", enum: ["staging", "production"] },
      target: { type: "string", enum: ["compose", "helm"] }, packageDigest: { ...digest, type: ["string", "null"] },
      imageDigest: { type: ["string", "null"], pattern: "^sha256:[0-9a-f]{64}$" }, overlayDigest: digest, restartedAt: { type: "string", format: "date-time", description: "Operator-stated; recorded as a claim beside the server time." },
      helmRevision: { type: ["integer", "null"], minimum: 1, description: "The helm history revision for a Helm target; null for Compose." },
      leaseIds: { type: "array", maxItems: 4, items: { type: "string", pattern: "^lease_[0-9a-f]{32}$" } }, destinationRef: { type: "string", description: "host[:port]; never a URL or credentials." },
      operatorStated: object({ status: { type: "string", enum: ["succeeded", "failed", "partial"] } }) }),
    A4Verify: control({ environment: { type: "string", enum: ["staging", "production"] } }),
    A4RollbackPreview: control({ environment: { type: "string", enum: ["staging", "production"] } }),
    A4Rollback: control({ environment: { type: "string", enum: ["staging", "production"] }, reason,
      toReleaseId: { type: ["string", "null"], pattern: "^a4r_[0-9a-f]{32}$" }, confirmManifestId: { type: ["string", "null"], pattern: "^enforce-resources-[0-9a-f]{16}$" } })
  };
}
