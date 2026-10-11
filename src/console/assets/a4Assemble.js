// Assemble's Studio cards (P1-60, design §10.2, §13): the path table with each path's IntegrationClaim, the plan (with the workflow executor),
// the build log, an external path's scaffold, connect and import, the outcome_unknown card, the completion effect and the review tables,
// read from the newest Assemble revision and the readiness Studio returns. Renderers are pure: every server string goes through esc(),
// statuses and reason codes are printed as Studio returned them, and no card names a maturity level. The build log reads the owner's
// session through Studio's native task route with its cursor contract (validateNativeTaskPoll); turns, cancel and resume stay on the
// native task page. A connect lease token is shown from the one response that carried it and is kept nowhere else.
import { apiNativeRequest } from "./api.js";
import { registerStageAction, registerStageCard } from "./a4Cards.js";
import * as view from "./a4View.js";
import { validateNativeTaskPoll } from "./nativeTasks.js";

const { esc } = view;
/** The build log per task as last read: the view, the committed cursor, the newest events (at most LOG_LIMIT), the error. */
const logs = new Map();
const LOG_LIMIT = 200;
/** The connect response this page received (its lease token is delivered once); cleared by "Hide the token". */
let delivered = null;
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

/** The declared workflow (design §10.2, C6): every reason it does not run, the compiled plan's denial with its controls, and its nodes. */
function renderWorkflow(task) {
  const denial = isObject(task.compiledPolicy) ? task.compiledPolicy : null;
  return `<h4>Workflow executor</h4><p class="muted">A declared workflow runs only through the agent's workflow tool, each helper through
    spawnSubagent (depth limit, signed handoff packet, declared scope, a started/completed pair). AMC never starts helper agents on its own,
    so this workflow is listed, not run: ${codes(task.blockers)}</p>
    ${denial ? `<p class="muted">Denied by the active compiled plan (revision <code>${esc(denial.revision)}</code>): ${esc(denial.denial)}.
      Controls compiled at the tool pipeline: ${codes(denial.controlIds) || "none"}</p>` : ""}
    <details><summary>${esc(task.agents)} delegated task(s) in <code>${esc(task.plan?.id)}</code></summary><pre>${esc(JSON.stringify(task.plan ?? null, null, 2))}</pre></details>`;
}

function renderPlan(ctx) {
  const spec = specOf(ctx);
  if (!proposed(spec)) return `<p class="muted">${NOT_PROPOSED}</p>`;
  const tasks = list(spec.plan).map((task) => [`<code>${esc(task.id)}</code>`, esc(task.title), `<code>${esc(task.executor)}</code>`,
    task.supported ? "yes" : `no (<code>${esc(task.key)}</code>)`, task.command ? `<code>${esc(task.command)}</code>` : esc(task.acceptance)]);
  const node = list(spec.graph?.nodes).find((entry) => entry.nodeId === "agent");
  const workflow = list(spec.plan).find((task) => task?.executor === "workflow");
  return `<p class="muted">${esc(spec.claimBoundary ?? "")}</p>
    ${table(["Task", "What", "Executor", "Supported", "Acceptance or command"], tasks, "No tasks.")}
    <p class="muted">A human task is a command for you to run; AMC never runs it.</p>${workflow ? renderWorkflow(workflow) : ""}
    <h4>Unsupported items (listed with their key, never hidden)</h4>
    ${table(["Item", "What", "Key"], list(spec.unsupported).map((entry) => [`<code>${esc(entry.id)}</code>`, esc(entry.what), `<code>${esc(entry.key)}</code>`]), "None.")}
    <p><strong>Agent permissions in the typed graph:</strong> ${codes(node?.permissions)}</p>
    ${spec.session ? `<p><strong>Build session:</strong> <code>${esc(spec.session.provider)}</code>${spec.session.model ? ` <code>${esc(spec.session.model)}</code>` : ""}
      tools <code>${esc(spec.session.tools)}</code>, at most ${esc(spec.session.maxSteps)} steps per turn</p>` : ""}
    <p><strong>Baseline Enforce manifest:</strong> <code>${esc(spec.baseline?.state)}</code> <code>${esc(spec.baseline?.manifestId ?? "none")}</code></p>
    ${["plan_proposed", "baseline_manifest", "toolset_ready", "signed_configs_trusted"].map((id) => status(ctx, id)).join("")}`;
}

/** One session's build log, read by its owner from cursor 0 onward; only committed events Studio authenticated are shown. */
function renderLog(ctx, session) {
  const log = logs.get(session.taskId);
  const owner = ctx.me?.username === session.ownerUsername ? { allowed: true } : view.held("Only the session's owner reads its log");
  const events = list(log?.events).map((event) => `<li><code>${esc(event.cursor)}</code> <strong>${esc(event.kind)}</strong>${event.status
    ? ` <code>${esc(event.status)}</code>` : ""}<pre>${esc(event.text)}</pre></li>`).join("");
  return `<details data-a4-open="log-${esc(session.taskId)}"${log ? " open data-a4-default-open" : ""}><summary>Build log of <code>${esc(session.taskId)}</code></summary>
    ${log?.error ? `<p class="status-bad">${esc(log.error)}</p>` : ""}${log?.truncated ? "<p class=\"muted\">Studio's retention dropped earlier events; this log shows what Studio still holds.</p>" : ""}
    ${log?.task ? `<p class="muted">State <code>${esc(log.task.state)}</code> · history <code>${esc(log.task.history?.status)}</code> · read to cursor ${esc(log.cursor)}</p>` : ""}
    ${events ? `<ol class="a4-rows">${events}</ol>` : ""}
    ${view.actionButton(log ? "Load newer events" : "Load the build log", "load-log", owner, `data-task="${esc(session.taskId)}" data-agent="${esc(session.start?.agentId ?? ctx.project.agentId)}"`)}</details>`;
}

/** Reads the log from its committed cursor: the whole page is validated before anything is kept (the native task page's contract). */
async function loadLog(taskId, agentId) {
  const log = logs.get(taskId) ?? { task: null, cursor: 0, events: [], truncated: false, error: null };
  try {
    const raw = await apiNativeRequest(`/api/v1/native-tasks/${encodeURIComponent(taskId)}?agentId=${encodeURIComponent(agentId)}&cursor=${log.cursor}`);
    const value = validateNativeTaskPoll(raw, log.task ?? { taskId, agentId, revision: 0 }, log.cursor);
    const authenticated = value.task.history.status === "authenticated";
    logs.set(taskId, { task: value.task, cursor: authenticated ? Math.max(log.cursor, value.task.nextCursor) : log.cursor,
      events: [...log.events, ...value.events].slice(-LOG_LIMIT), truncated: log.truncated || value.truncated,
      error: authenticated ? null : value.task.history.message });
  } catch (error) {
    logs.set(taskId, { ...log, error: error?.message ?? String(error) });
  }
}

/** An external path's build (src/a4/assembleConnect.ts): scaffold, connect and import, after Build and before Review; an owner's actions. */
function renderExternal(ctx, spec) {
  if (!proposed(spec) || spec.path === "native" || !isObject(spec.claim)) return "";
  const offer = ctx.project.stage === "assemble" && ctx.project.step === "built" ? ctx.allowed.build : view.held("After Build and before Review");
  const scaffoldable = list(spec.plan).some((task) => task?.id === "scaffold");
  return `<h4>External path: <code>${esc(spec.path)}</code></h4>
    ${scaffoldable ? `<label>Scaffold directory (inside the workspace, outside .amc/, not existing yet) <input name="scaffold-directory" maxlength="200"></label>
    <div class="row wrap">${view.actionButton("Write the scaffold, contract tests and policy pack", "scaffold", offer)}</div>` : ""}
    <label>Connect mode <select name="connect-mode"><option value="supervise">supervise</option><option value="sandbox">sandbox</option></select></label>
    <label>Adapter (optional) <input name="connect-adapter" maxlength="64"></label>
    <div class="row wrap">${view.actionButton("Get connect instructions", "connect", offer)}</div>
    ${renderDelivered()}
    <label>Traces to import (a workspace file or directory) <input name="import-path" maxlength="512"></label>
    <div class="row wrap">${view.actionButton("Import (originals retained; self-reported)", "import-traces", offer)}</div>`;
}

/** The connect response this page received: the lease token once, with the instructions; Studio stored only its leaseId. */
function renderDelivered() {
  if (delivered === null) return "";
  if (delivered.alreadyDelivered) return "<p class=\"muted\">That connect request was already answered: its lease token was delivered then and is not shown again. Request new instructions for a new lease.</p>";
  return `<div class="card"><p><strong>${esc(delivered.tokenNotice)}</strong></p><p class="muted">Lease <code>${esc(delivered.leaseId)}</code> · route
    <code>${esc(delivered.routeUrl)}</code> · mode <code>${esc(delivered.mode)}</code></p><pre class="scroll">${esc(list(delivered.envLines).join("\n"))}</pre>
    <p>Run: <code>${esc(delivered.command)}</code></p>${delivered.hookInstallCommand ? `<p>Hooks: <code>${esc(delivered.hookInstallCommand)}</code></p>` : ""}
    <div class="row wrap">${view.actionButton("Hide the token", "hide-lease", { allowed: true })}</div></div>`;
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
    ${list(build?.sessions).map((session) => renderLog(ctx, session)).join("")}
    ${renderExternal(ctx, spec)}
    ${["preset_signed", "validation_pinned"].map((id) => status(ctx, id)).join("")}
    <label>Build note <textarea name="content" rows="3" maxlength="65536"></textarea></label>
    <div class="row wrap">${view.actionButton("Build", "build", view.stepOffer(ctx.allowed.build, ctx, "build"))}</div>`;
}

function renderReview(ctx) {
  const review = isObject(specOf(ctx).review) ? specOf(ctx).review : null;
  const sessions = list(review?.sessions).map((session) => [`<code>${esc(session.sessionId)}</code>`, `<code>${esc(session.provider)}</code>${session.stub ? " (stub: synthetic)" : ""}`,
    `<code>${esc(session.validation?.status)}</code> ${esc(session.validation?.passed)} passed, ${esc(session.validation?.failed)} failed`,
    `<code>${esc(session.coverage?.status)}</code>`, `<code>${esc(session.integrity?.notEvaluated ?? (session.integrity?.integrityOk ? "integrity ok" : "integrity failed"))}</code>`,
    `<code>${esc(session.effectivePolicy?.status)}</code> ${codes(session.effectivePolicy?.downgrades)}`]);
  const phases = list(review?.sessions).flatMap((session) => list(session.phases).map((phase) => [`<code>${esc(session.sessionId)}</code>`, esc(phase.phase),
    `<code>${esc(phase.status)}</code>`, esc(phase.source)]));
  return `<p class="muted">Review reads each build session through its owner and refuses while one runs or has failed. AMC's verifyAgentRun
    is an integrity self-check under this workspace's keys (the Integrity panel), never a claim about the agent.</p>
    ${review?.wording ? `<p><strong>${esc(review.wording)}</strong></p>` : ""}
    ${table(["Session", "Provider", "Validation", "Action evidence", "Integrity", "Effective policy (downgrades)"], sessions, "Not reviewed yet.")}
    ${phases.length ? `<h4>Execution phases</h4><p class="muted">${esc(view.TRUTH.admission)}. The prompt each session ran is not compared with the approved plan
      (<code>${esc(list(review?.sessions)[0]?.promptBinding)}</code>).</p>${table(["Session", "Phase", "Status", "Source"], phases, "")}` : ""}
    ${isObject(review?.external) ? `<p class="muted">External path recorded at this revision: ${esc(review.external.scaffold)} scaffold(s),
      ${esc(review.external.connect)} connect(s), ${esc(review.external.import)} import(s) (self-reported).</p>` : ""}
    ${review ? `<p class="muted">Enforce: <code>${esc(review.enforce?.state)}</code> decision <code>${esc(review.enforce?.decision)}</code>,
      ${esc(review.enforce?.pending)} pending change(s), applied by the completion effect.</p>
      <h4>Capabilities</h4>${table(["Capability", "Status", "Why"], list(review.capabilities).map((row) => [esc(row.capability), `<code>${esc(row.status)}</code>`,
        esc(row.reason)]), "None.")}
      <h4>Limitations</h4>${bullets(review.limitations)}
      <p class="muted">Lifecycle: stays at <code>${esc(review.lifecycle?.stage)}</code>; unit_tests_passing <code>${esc(review.lifecycle?.unitTestsPassing)}</code></p>` : ""}
    ${["manifest_active", "build_sessions_integrity", "lifecycle_bridge", "composition_bound"].map((id) => status(ctx, id)).join("")}
    <label>Findings <textarea name="content" rows="3" maxlength="65536"></textarea></label>
    <div class="row wrap">${view.actionButton("Review", "review", view.stepOffer(ctx.allowed.review, ctx, "review"))}</div>`;
}

const decideButtons = (ctx, approvalRequestId, digest) => `${view.actionButton("Approve", "decide-engine", ctx.allowed.requestChanges,
  `data-approval="${esc(approvalRequestId)}" data-digest="${esc(digest)}" data-verb="approve"`)} ${view.actionButton("Deny", "decide-engine",
  ctx.allowed.requestChanges, `data-approval="${esc(approvalRequestId)}" data-digest="${esc(digest)}" data-verb="deny"`)}`;

/** Engine statuses a resolution request can still be decided or recorded in; any other one is requested again. */
const LIVE_REQUEST = new Set(["PENDING", "QUORUM_MET", "CONSUMED"]);
const requestForm = (ctx, id) => `<label>What happened <select name="effect-${esc(id)}"><option value="applied">applied</option>
    <option value="not_applied">not_applied</option></select></label><label>External reference (optional) <input name="ref-${esc(id)}" maxlength="512"></label>
  <label>Your note <textarea name="note-${esc(id)}" rows="2" maxlength="4000"></textarea></label>
  <div class="row wrap">${view.actionButton("Request resolution", "request-resolution", ctx.allowed.review, `data-execution="${esc(id)}"`)}</div>`;

/**
 * One card per open outcome_unknown execution: request a resolution, a second person decides it, then it is recorded. A
 * request the engine DENIED, EXPIRED or CANCELLED (or whose record does not verify) is requested again from the same card.
 */
function renderOutcomeUnknown(ctx) {
  const item = itemOf(ctx, "no_open_outcome_unknown");
  const open = coded(item, "EXECUTION").map(([id]) => id);
  const requested = new Map(coded(item, "RESOLUTION_REQUESTED").map(([id, approval, digest, state]) => [id, { approval, digest, state }]));
  const rows = open.map((id) => {
    const asked = requested.get(id);
    const live = asked && LIVE_REQUEST.has(asked.state);
    return `<li data-execution="${esc(id)}"><p><code>${esc(id)}</code></p>${live ? `<p class="muted">Resolution requested: engine request <code>${esc(asked.approval)}</code>
      (<code>${esc(asked.state)}</code>). Another project approver or owner decides it here, bound to its digest; then the requester or an owner records it.</p>
      <div class="row wrap">${asked.state === "CONSUMED" ? "" : decideButtons(ctx, asked.approval, asked.digest)} ${view.actionButton("Record the resolution",
        "resolve-outcome", ctx.allowed.review, `data-execution="${esc(id)}"`)}</div>`
      : `${asked ? `<p class="muted">The last request <code>${esc(asked.approval)}</code> is <code>${esc(asked.state)}</code>: request a resolution again.</p>` : ""}${requestForm(ctx, id)}`}</li>`;
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
  const [[requestState] = []] = coded(item, "APPROVAL_STATUS");
  const completion = ctx.readiness?.gates?.completion;
  const openable = completion?.status === "QUORUM_MET" ? ctx.allowed.openEffect : view.held("The completion gate has no quorum yet");
  return `<p class="muted">Completing Assemble applies the reviewed Enforce resources as the agent's active manifest (signed receipt). It is a
    second, separately decided request: an owner opens it, project approvers decide it (two distinct people when regulated), then the owner completes
    the stage. A failed apply leaves the gate consumed and offers one owner retry.</p>${status(ctx, "effect_gate")}
    <div class="row wrap">${view.actionButton(request ? "Re-open the effect gate" : "Open the effect gate", "open-effect", openable,
      `data-gate="${esc(completion?.gateId ?? "")}"`)}</div>
    ${request ? `<p class="muted">Engine request <code>${esc(request[0])}</code> (<code>${esc(requestState ?? "unknown")}</code>)</p>${requestState === "PENDING" || requestState === "QUORUM_MET"
      ? `<label>Decision reason <textarea name="engine-reason" rows="2" maxlength="1000"></textarea></label>
      <div class="row wrap">${decideButtons(ctx, request[0], request[1])}</div>` : ""}` : ""}
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
  registerStageAction("assemble", "load-log", ({ button }) => ({ local: true, pending: loadLog(button.dataset.task, button.dataset.agent) }));
  registerStageAction("assemble", "scaffold", ({ value, headBinding, projectPath }) => {
    const directory = value("scaffold-directory");
    if (!directory) throw new Error("Name the scaffold directory first. Nothing was sent.");
    return { label: "Write the scaffold", path: projectPath("/stages/assemble/scaffold"), body: { directory, ...headBinding() } };
  });
  registerStageAction("assemble", "connect", ({ value, headBinding, projectPath }) => ({ label: "Get connect instructions", path: projectPath("/stages/assemble/connect"),
    body: { mode: value("connect-mode") || "supervise", adapterId: value("connect-adapter") || null, ...headBinding() },
    got: (data) => { delivered = isObject(data?.connect) ? data.connect : data?.reasonCode === "TOKEN_ALREADY_DELIVERED" ? { alreadyDelivered: true } : null; } }));
  registerStageAction("assemble", "hide-lease", () => {
    delivered = null;
    return { local: true };
  });
  registerStageAction("assemble", "import-traces", ({ value, headBinding, projectPath }) => {
    const inputPath = value("import-path");
    if (!inputPath) throw new Error("Name the workspace file or directory to import first. Nothing was sent.");
    return { label: "Import traces", path: projectPath("/stages/assemble/import"), body: { inputPath, ...headBinding() } };
  });
  // The exact start Build journaled: Studio's native task route answers the recorded task for a repeat, and starts it when it never did.
  registerStageAction("assemble", "start-session", ({ button }) => ({ label: "Start the build session", path: "/api/v1/native-tasks",
    body: JSON.parse(button.dataset.start) }));
}
