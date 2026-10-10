// Assemble's Studio cards (P1-60 slice A, design §10.2, §13): the path table with each path's IntegrationClaim, the plan,
// the build log, the outcome_unknown card, the completion effect and the review tables, read from the newest Assemble
// revision and the readiness Studio returns. Pure renderers: every server string goes through esc(), statuses and
// reason codes are printed as Studio returned them, and no card names a maturity level. The build session's own turns,
// cancel and resume stay on Studio's native task page (its cursor contract), under the session's owner.
import { registerStageAction, registerStageCard } from "./a4Cards.js";
import * as view from "./a4View.js";

const { esc } = view;
const SPEC = "amc.a4-assemble-spec/v1";
const PRODUCED = "Assemble's producers run here: Studio records AMC's output (self-reported; synthetic_example for what a stub-provider session says about the agent) and, beside it, what you write as your own statement.";
const NOT_PROPOSED = "No plan yet: Propose builds it from your answers.";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const specOf = (ctx) => (isObject(ctx.stageRevision?.spec) ? ctx.stageRevision.spec : {});
const proposed = (spec) => spec.schema === SPEC;
const itemOf = (ctx, id) => list(ctx.readiness?.items).find((item) => item.id === id) ?? null;
const codes = (values) => list(values).map((code) => `<code>${esc(code)}</code>`).join(" ");
const status = (ctx, id) => {
  const item = itemOf(ctx, id);
  return item ? `<p class="muted"><code>${esc(id)}</code> <code>${esc(item.status)}</code> ${codes(item.reasonCodes)}${item.nextAction?.label
    ? ` · ${esc(item.nextAction.label)}${item.nextAction.command ? ` <code>${esc(item.nextAction.command)}</code>` : ""}` : ""}</p>` : "";
};
const bullets = (values, empty = "None") => (list(values).length ? `<ul class="a4-rows">${list(values).map((value) => `<li>${esc(value)}</li>`).join("")}</ul>`
  : `<p class="muted">${esc(empty)}</p>`);
const table = (head, rows, empty) => (rows.length ? `<div class="scroll"><table><thead><tr>${head.map((cell) => `<th>${esc(cell)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">${esc(empty)}</p>`);
/** The parts of a reason code `PREFIX:a:b:c` after its prefix, for each code with that prefix. */
const coded = (item, prefix) => list(item?.reasonCodes).filter((code) => String(code).startsWith(`${prefix}:`)).map((code) => String(code).slice(prefix.length + 1).split(":"));

function renderConversation(ctx) {
  const facts = specOf(ctx).understanding?.facts;
  const summary = isObject(facts) ? `<h4>What AMC read for this build</h4>
    <p class="muted">Tool pipeline ready: <code>${esc(facts.toolset?.ready ?? facts.toolset?.error ?? "unknown")}</code> · doctor
      <code>${esc(facts.doctor?.ok ? "ok" : "needs attention")}</code> ${codes(facts.doctor?.attention)} · outcome_unknown open:
      <code>${esc(facts.outcomeUnknown?.error ?? facts.outcomeUnknown ?? "unknown")}</code> · Enforce <code>${esc(facts.baseline?.error ?? facts.baseline)}</code>
      · compiled plan <code>${esc(facts.compiledPolicy?.error ?? facts.compiledPolicy)}</code> · platform <code>${esc(facts.platform)}</code></p>
    ${facts.native ? `<p class="muted">Per turn ${esc(facts.native.limits?.maxSteps)} steps and ${esc(facts.native.limits?.maxTokens)} tokens; at most
      ${esc(facts.native.limits?.maxActive)} active sessions across Studio. Providers: ${list(facts.native.providers).map((provider) =>
        `<code>${esc(provider.id)}</code>${provider.configured ? "" : " (credential not configured)"}`).join(" ")}</p>`
      : "<p class=\"muted\">Studio's native task service was not readable: run Understand from Studio.</p>"}` : "";
  return `${view.renderConversation(ctx).replaceAll(view.NO_PRODUCER, PRODUCED)}
    <p class="muted">Understand carries <code>riskTier</code> and <code>stations</code> from Aspire; change them there (reopen Aspire).</p>${summary}
    ${["ask_complete", "understanding_confirmed"].map((id) => status(ctx, id)).join("")}`;
}

/** The IntegrationClaim path table (design §13), the chosen path's claim and what it does not cover. */
function renderPaths(ctx) {
  const spec = specOf(ctx);
  const rows = list(spec.understanding?.facts?.paths).map((path) => [`<code>${esc(path.path)}</code>`, `<code>${esc(path.enforcementBoundary)}</code>`,
    esc(path.evidenceTier), `<code>${esc(path.supported)}</code>`, esc(path.reason ?? "")]);
  const claim = isObject(spec.claim) ? spec.claim : null;
  return `<p class="muted">What AMC can enforce and evidence on each way of building the agent. A claim is about AMC's integration path,
    never about the agent; "enforced" outside the native pipeline needs a conformance receipt for the pinned version, and none exists yet.</p>
    ${table(["Path", "Enforcement boundary", "Evidence", "Status", "Reason"], rows, "Run Understand to list the paths.")}
    ${claim ? `<h4>Chosen: <code>${esc(claim.path)}</code></h4><p>Not covered:</p>${bullets(claim.notCovered)}` : ""}
    ${status(ctx, "path_supported")}${status(ctx, "unsupported_acknowledged")}`;
}

function renderPlan(ctx) {
  const spec = specOf(ctx);
  if (!proposed(spec)) return `<p class="muted">${NOT_PROPOSED}</p>`;
  const tasks = list(spec.plan).map((task) => [`<code>${esc(task.id)}</code>`, esc(task.title), `<code>${esc(task.executor)}</code>`,
    task.supported ? "yes" : `no (<code>${esc(task.key)}</code>)`, task.command ? `<code>${esc(task.command)}</code>` : esc(task.acceptance)]);
  const node = list(spec.graph?.nodes).find((entry) => entry.nodeId === "agent");
  return `<p class="muted">${esc(spec.claimBoundary ?? "")}</p>
    ${table(["Task", "What", "Executor", "Supported", "Acceptance or command"], tasks, "No tasks.")}
    <p class="muted">A human task is a command for you to run; AMC never runs it.</p>
    <h4>Unsupported items (listed with their key, never hidden)</h4>
    ${table(["Item", "What", "Key"], list(spec.unsupported).map((entry) => [`<code>${esc(entry.id)}</code>`, esc(entry.what), `<code>${esc(entry.key)}</code>`]), "None.")}
    <p><strong>Agent permissions in the typed graph:</strong> ${codes(node?.permissions)}</p>
    ${spec.session ? `<p><strong>Build session:</strong> <code>${esc(spec.session.provider)}</code>${spec.session.model ? ` <code>${esc(spec.session.model)}</code>` : ""}
      tools <code>${esc(spec.session.tools)}</code>, at most ${esc(spec.session.maxSteps)} steps per turn</p>` : ""}
    <p><strong>Baseline Enforce manifest:</strong> <code>${esc(spec.baseline?.state)}</code> <code>${esc(spec.baseline?.manifestId ?? "none")}</code></p>
    ${["plan_proposed", "baseline_manifest", "toolset_ready", "signed_configs_trusted"].map((id) => status(ctx, id)).join("")}`;
}

function renderBuild(ctx) {
  const spec = specOf(ctx);
  const build = isObject(spec.build) ? spec.build : null;
  // Only the owner's session starts the same task again (the task id is the owner's principal and the recorded request id).
  const sessions = list(build?.sessions).map((session) => [`<code>${esc(session.taskId)}</code>`, esc(session.ownerUsername), `<code>${esc(session.start?.provider)}</code>`,
    ctx.me?.username === session.ownerUsername && isObject(session.start)
      ? view.actionButton("Start it again", "start-session", ctx.allowed.build, `data-start="${esc(JSON.stringify(session.start))}"`) : ""]);
  return `<p class="muted">${esc(view.TRUTH.admission)}. Build, an owner's action, checks the signing key, the agent's signed Enforce
    baseline and the native session's admission first, then writes the revised typed graph and signs the agent's preset into
    <code>.amc/agents.yaml</code>, and journals one native build session in this revision; Studio starts it once the step is recorded,
    on its own native task service. Run further turns, cancel or resume it on the <a href="./native-tasks">native tasks</a> page as
    its owner; other members watch. "Start it again" repeats the recorded start (the same task), only for a session that never started.</p>
    ${build ? `<p class="muted">Enforce preview against the baseline: ${esc(build.preview?.added)} added, ${esc(build.preview?.changed)} changed,
      ${esc(build.preview?.removed)} removed (<code>${esc(build.preview?.validation)}</code>)</p>` : ""}
    ${table(["Session", "Owner", "Provider", ""], sessions, "No build session yet.")}
    ${["preset_signed", "validation_pinned"].map((id) => status(ctx, id)).join("")}
    <label>Build note <textarea name="content" rows="3" maxlength="65536"></textarea></label>
    <div class="row wrap">${view.actionButton("Build", "build", view.stepOffer(ctx.allowed.build, ctx, "build"))}</div>`;
}

function renderReview(ctx) {
  const review = isObject(specOf(ctx).review) ? specOf(ctx).review : null;
  const sessions = list(review?.sessions).map((session) => [`<code>${esc(session.sessionId)}</code>`, `<code>${esc(session.provider)}</code>${session.stub ? " (stub: synthetic)" : ""}`,
    `<code>${esc(session.validation?.status)}</code> ${esc(session.validation?.passed)} passed, ${esc(session.validation?.failed)} failed`,
    `<code>${esc(session.coverage?.status)}</code>`, `<code>${esc(session.integrity?.integrityOk ? "integrity ok" : "integrity failed")}</code>`]);
  return `<p class="muted">Review reads each build session through its owner and refuses while one runs or has failed. AMC's verifyAgentRun
    is an integrity self-check under this workspace's keys (the Integrity panel), never a claim about the agent.</p>
    ${review?.wording ? `<p><strong>${esc(review.wording)}</strong></p>` : ""}
    ${table(["Session", "Provider", "Validation", "Action evidence", "Integrity"], sessions, "Not reviewed yet.")}
    ${review ? `<p class="muted">Enforce: <code>${esc(review.enforce?.state)}</code> decision <code>${esc(review.enforce?.decision)}</code>,
      ${esc(review.enforce?.pending)} pending change(s), applied by the completion effect.</p>
      <h4>Capabilities</h4>${table(["Capability", "Status", "Why"], list(review.capabilities).map((row) => [esc(row.capability), `<code>${esc(row.status)}</code>`,
        esc(row.reason)]), "None.")}
      <h4>Limitations</h4>${bullets(review.limitations)}
      <p class="muted">Lifecycle: stays at <code>${esc(review.lifecycle?.stage)}</code>; unit_tests_passing <code>${esc(review.lifecycle?.unitTestsPassing)}</code></p>` : ""}
    ${["manifest_active", "build_sessions_integrity", "lifecycle_bridge"].map((id) => status(ctx, id)).join("")}
    <label>Findings <textarea name="content" rows="3" maxlength="65536"></textarea></label>
    <div class="row wrap">${view.actionButton("Review", "review", view.stepOffer(ctx.allowed.review, ctx, "review"))}</div>`;
}

const decideButtons = (ctx, approvalRequestId, digest) => `${view.actionButton("Approve", "decide-engine", ctx.allowed.requestChanges,
  `data-approval="${esc(approvalRequestId)}" data-digest="${esc(digest)}" data-verb="approve"`)} ${view.actionButton("Deny", "decide-engine",
  ctx.allowed.requestChanges, `data-approval="${esc(approvalRequestId)}" data-digest="${esc(digest)}" data-verb="deny"`)}`;

/** One card per open outcome_unknown execution: request a resolution, a second person decides it, then it is recorded. */
function renderOutcomeUnknown(ctx) {
  const item = itemOf(ctx, "no_open_outcome_unknown");
  const open = coded(item, "EXECUTION").map(([id]) => id);
  const requested = new Map(coded(item, "RESOLUTION_REQUESTED").map(([id, approval, digest]) => [id, { approval, digest }]));
  const rows = open.map((id) => {
    const asked = requested.get(id);
    return `<li data-execution="${esc(id)}"><p><code>${esc(id)}</code></p>${asked ? `<p class="muted">Resolution requested: engine request <code>${esc(asked.approval)}</code>.
      Another member decides it here, bound to its digest; then the requester or an owner records it.</p>
      <div class="row wrap">${decideButtons(ctx, asked.approval, asked.digest)} ${view.actionButton("Record the resolution", "resolve-outcome", ctx.allowed.review,
        `data-execution="${esc(id)}"`)}</div>` : `<label>What happened <select name="effect-${esc(id)}"><option value="applied">applied</option>
        <option value="not_applied">not_applied</option></select></label><label>External reference (optional) <input name="ref-${esc(id)}" maxlength="512"></label>
      <label>Your note <textarea name="note-${esc(id)}" rows="2" maxlength="4000"></textarea></label>
      <div class="row wrap">${view.actionButton("Request resolution", "request-resolution", ctx.allowed.review, `data-execution="${esc(id)}"`)}</div>`}</li>`;
  });
  return `<p class="muted">A cancelled or failed action leaves its outcome unknown, and the agent's journaled actions stay blocked until a person
    states what happened and someone else approves that statement (dual control per the approval policy). The statement is recorded as
    self-reported: AMC did not observe it.</p>${status(ctx, "no_open_outcome_unknown")}
    ${rows.length ? `<label>Decision reason <textarea name="engine-reason" rows="2" maxlength="1000"></textarea></label><ul class="a4-rows">${rows.join("")}</ul>` : ""}`;
}

/** The completion effect a4.assemble.apply: the owner opens it once the completion gate has its quorum; approvers decide it here. */
function renderEffect(ctx) {
  const item = itemOf(ctx, "effect_gate");
  const [request] = coded(item, "APPROVAL_REQUEST");
  const completion = ctx.readiness?.gates?.completion;
  const openable = completion?.status === "QUORUM_MET" ? ctx.allowed.openEffect : view.held("The completion gate has no quorum yet");
  return `<p class="muted">Completing Assemble applies the reviewed Enforce resources as the agent's active manifest (signed receipt). It is a
    second, separately decided request: an owner opens it, project approvers decide it (two distinct people when regulated), then the owner completes
    the stage. A failed apply leaves the gate consumed and offers one owner retry.</p>${status(ctx, "effect_gate")}
    <div class="row wrap">${view.actionButton(request ? "Re-open the effect gate" : "Open the effect gate", "open-effect", openable,
      `data-gate="${esc(completion?.gateId ?? "")}"`)}</div>
    ${request ? `<p class="muted">Engine request <code>${esc(request[0])}</code></p><label>Decision reason <textarea name="engine-reason" rows="2" maxlength="1000"></textarea></label>
      <div class="row wrap">${decideButtons(ctx, request[0], request[1])}</div>` : ""}
    ${status(ctx, "effects.failed")}`;
}

const reasonOf = (value) => {
  const text = value("engine-reason");
  if (!text) throw new Error("Write a decision reason first. Nothing was sent.");
  return text;
};

export function register() {
  registerStageCard("assemble", "conversation", renderConversation, "Conversation");
  registerStageCard("assemble", "paths", renderPaths, "Integration paths");
  registerStageCard("assemble", "plan", renderPlan, "Plan");
  registerStageCard("assemble", "build", renderBuild, "Build");
  registerStageCard("assemble", "review", renderReview, "Review");
  registerStageCard("assemble", "outcome-unknown", renderOutcomeUnknown, "Outcome unknown");
  registerStageCard("assemble", "effect", renderEffect, "Completion effect");
  registerStageAction("assemble", "request-resolution", ({ button, value, headBinding, projectPath }) => {
    const id = button.dataset.execution;
    const note = value(`note-${id}`);
    if (!note) throw new Error("Write what happened in the note first. Nothing was sent.");
    return { label: "Request resolution", path: projectPath(`/outcome-unknown/${encodeURIComponent(id)}/request`),
      body: { effect: value(`effect-${id}`) || "applied", externalRef: value(`ref-${id}`) || null, note, ...headBinding() } };
  });
  registerStageAction("assemble", "resolve-outcome", ({ button, headBinding, projectPath }) => ({ label: "Record the resolution",
    path: projectPath(`/outcome-unknown/${encodeURIComponent(button.dataset.execution)}/resolve`), body: headBinding() }));
  registerStageAction("assemble", "decide-engine", ({ button, value, projectPath }) => ({ label: button.dataset.verb === "deny" ? "Deny" : "Approve",
    path: projectPath(`/approvals/${encodeURIComponent(button.dataset.approval)}/${button.dataset.verb === "deny" ? "deny" : "approve"}`),
    body: { reason: reasonOf(value), expectedRequestDigestSha256: button.dataset.digest } }));
  registerStageAction("assemble", "open-effect", ({ button, headBinding, projectPath }) => {
    if (!button.dataset.gate) throw new Error("No approved completion gate is shown. Refresh first. Nothing was sent.");
    return { label: "Open the effect gate", path: projectPath("/stages/assemble/effects/a4.assemble.apply/open"), body: { gateId: button.dataset.gate, ...headBinding() } };
  });
  // The exact start Build journaled: Studio's native task route answers the recorded task for a repeat, and starts it when it never did.
  registerStageAction("assemble", "start-session", ({ button }) => ({ label: "Start the build session", path: "/api/v1/native-tasks",
    body: JSON.parse(button.dataset.start) }));
}
