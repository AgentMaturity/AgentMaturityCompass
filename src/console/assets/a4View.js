// A4 Studio renderers (P1-58, design §11). Pure: data in, HTML out. Every server string goes through esc(); status
// codes, reason codes and claim kinds are printed as Studio returned them, and the page adds no status word of its own.
import { renderEvidenceRefList } from "./components/evidenceRefList.js";
import { renderPromptDiffViewer } from "./components/promptDiffViewer.js";

export const STAGES = ["aspire", "assemble", "adapt", "activate"];
export const STEPS = ["asked", "understood", "explained", "proposed", "direction_approved", "built", "reviewed", "completion_approved"];
const STEP_TITLES = { asked: "Ask", understood: "Understand", explained: "Explain", proposed: "Propose",
  direction_approved: "Direction approved", built: "Build", reviewed: "Review", completion_approved: "Completion approved" };
const LANES = [["recommendation", "Recommendation"], ["implementation", "Implementation"], ["observed", "Observed"],
  ["verified", "Independently reviewed"]];
const LEVELS = ["novice", "practitioner", "expert"];

/** Truth copy, verbatim from design §11. */
export const TRUTH = {
  vote: "A recorded vote does not mean the action has run",
  admission: "Admission is not task completion",
  selfApproved: "Approved by the author; not an independent review",
  experimental: "Experimental regulatory content; expert review pending (D-08)",
  recorded: "Recorded: what the operator stated. Checked: what AMC's own probe found",
  signatures: "Signatures prove who wrote this and that it is unchanged, not that it is true",
  twoUsers: "Two local users are not evidence of two people"
};
export const PREVIEW_NOTICE = "A4 preview is not enabled in this workspace";
export const COMMENT_MAX_BYTES = 8 * 1024;
// Understand, Explain, Build, Review and comments go to the project's encrypted blob store (P1-57 writeStageOutput, the
// comment path); a proposal's spec and the answers are written as they are into the a4_revisions record.
const RETAINED = "Pasted text is retained until the project's blob key is destroyed.";
const IN_RECORD = "This is stored as written in the project's record, not in its encrypted blob store, so destroying the project's blob key does not erase it. Do not paste personal data or secrets here.";

export function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const stageTitle = (stage) => (typeof stage === "string" && stage ? stage[0].toUpperCase() + stage.slice(1) : "");
const time = (ts) => (Number.isSafeInteger(ts) ? `${new Date(ts).toISOString().slice(0, 19).replace("T", " ")} UTC` : "");
const codes = (list) => (Array.isArray(list) ? list.map((code) => `<code>${esc(code)}</code>`).join(" ") : "");
const shown = (value) => (typeof value === "string" ? value : JSON.stringify(value));
const list = (rows, empty) => (rows.length ? `<ul class="a4-rows">${rows.join("")}</ul>` : `<p class="muted">${empty}</p>`);

/**
 * A disabled button names Studio's reason codes; Studio re-checks every action, so this is a convenience only. `held`
 * builds the one other kind of disabled state: a page-side hold whose note says why (for example, the gate changed).
 */
export function actionButton(label, action, allowed, attributes = "") {
  const ok = allowed?.allowed === true;
  const why = allowed?.reasonCodes?.length ? allowed.reasonCodes.join(", ") : allowed?.note ?? "Studio did not offer this action";
  return `<button type="button" data-a4-action="${esc(action)}" ${attributes}${ok ? "" : ` disabled title="${esc(why)}"`}>${esc(label)}</button>`;
}

export const held = (note) => ({ allowed: false, reasonCodes: [], note });
export const GATE_CHANGED = "The gate changed while you were on this page";
export const ACTIVATE_COMPLETE = "Activate completion is handled by the release card";

export const cardLabel = (card) => {
  const [stage, id] = String(card ?? "").split(":");
  return id ? `${stageTitle(stage)} › ${id}` : String(card ?? "");
};

export function holdBanner(project) {
  return project?.hold ? `<div class="card banner a4-hold">On hold${project.holdReason ? `: ${esc(project.holdReason)}` : ""}</div>` : "";
}

export function stageBanner(stage) {
  if (stage === "adapt") return `<div class="card banner">${TRUTH.experimental}</div>`;
  if (stage === "activate") return `<div class="card banner">${TRUTH.recorded}</div>`;
  return "";
}

/** Studio's role check refuses a create from anyone without OPERATOR or OWNER (accessPolicy), and A4 refuses it in a read-only workspace. */
export const CREATE_NEEDS = "Starting an agent project needs a workspace OPERATOR or OWNER role in a workspace that is not read-only";

export function renderCreateForm(open) {
  return `<details class="card" id="a4Create"${open ? " open" : ""}><summary>Start an agent project</summary>
    <form id="a4CreateForm" class="a4-form">
      <label>Project name <input name="name" required maxlength="200" /></label>
      <label>Existing agent id (optional) <input name="agentId" maxlength="128" pattern="[a-z0-9][a-z0-9_\\-]{0,127}"
        title="Lowercase letters, digits, _ and -, starting with a letter or digit" /></label>
      <label>Your expertise <select name="expertise">${LEVELS.map((level) => `<option value="${level}">${stageTitle(level)}</option>`).join("")}</select></label>
      <button type="submit">Start an agent project</button>
    </form></details>`;
}

export function renderProjectList(projects) {
  return `<section class="card"><h3>Agent projects</h3>${list(projects.map((project) => `<li>
    <a href="./a4Project?project=${encodeURIComponent(project.projectId)}"><strong>${esc(project.name)}</strong></a>
    <span class="chip">${esc(stageTitle(project.stage))}</span> <span class="chip">${esc(STEP_TITLES[project.step] ?? project.step)}</span>
    ${project.readiness ? `<code>${esc(project.readiness.status)}</code>` : ""}
    <span class="muted">agent <code>${esc(project.agentId)}</code> · r${esc(project.revisionNo)}</span>${holdBanner(project)}</li>`),
  "No agent projects yet.")}</section>`;
}

/** The page keeps the stage it opened on (a4.js); when the project is at another stage, it says so. */
export function movedNote(project, stage) {
  return stage === project.stage ? "" : `<p>The project is at ${esc(stageTitle(project.stage))} · ${esc(STEP_TITLES[project.step] ?? project.step)};
    this page shows ${esc(stageTitle(stage))}. Open a stage above to work there.</p>`;
}

export function stageLinks(project, stage) {
  const id = encodeURIComponent(project.projectId);
  return `<div class="row wrap">${STAGES.map((name) => `<a class="button secondary" href="./a4Project?project=${id}&stage=${name}"${
    name === stage ? ' aria-current="page"' : ""}>${stageTitle(name)}</a>`).join("")}</div>`;
}

/** The stage rail, in the shape renderPlanTimeline takes. Positions only: Studio's stage and step are the facts. */
export function railPlan(project) {
  const current = STAGES.indexOf(project.stage);
  return { phases: STAGES.map((stage, index) => ({ phaseId: stageTitle(stage), actions: [],
    goal: current < 0 ? project.stage : index < current ? "earlier stage" : index > current ? "later stage"
      : `current · ${STEP_TITLES[project.step] ?? project.step}` })) };
}

/** The eight steps, in the shape renderHandholdingSteps takes. */
export function stepRows(project, stage) {
  const current = stage === project.stage ? STEPS.indexOf(project.step) : -1;
  return STEPS.map((step, index) => ({ title: STEP_TITLES[step],
    body: current < 0 ? "" : index === current ? "current step" : index < current ? "earlier step" : "" }));
}

/**
 * The step each step route starts from, at the project's current stage only: P1-57's STEP_ROUTES
 * (src/a4/a4RouterStages.ts) and requestGate (src/a4/a4Gates.ts); `null` takes any step. readiness.allowed carries no
 * step order, so a route Studio would refuse with 409 A4_STEP_ORDER is held with that code.
 */
const STEP_FROM = { answers: null, understand: ["asked"], explain: ["understood"], propose: ["explained"], build: ["direction_approved"],
  review: ["built"], "request-direction": ["proposed"], "request-completion": ["reviewed"] };
/** `offer` held, with `codes` added to Studio's reason codes. */
const refuse = (offer, ...codes) => ({ allowed: false, reasonCodes: [...new Set([...(offer?.reasonCodes ?? []), ...codes])] });
export function stepOffer(offer, ctx, route) {
  const from = STEP_FROM[route];
  if (ctx.project.stage === ctx.stage && (from === null || from.includes(ctx.project.step))) return offer;
  return refuse(offer, "A4_STEP_ORDER");
}
/** Studio's content cap on Understand, Explain, Build and Review (P1-57, src/a4/a4RouterStages.ts). */
const CONTENT_MAX = 65_536;

const NO_REFLECTION = "No statement recorded from this page yet";
export const NO_PRODUCER = "No producer is registered for this stage yet, so Studio records what you write here as your own self-reported statement, not as AMC's.";
const studioJson = (value) => `<pre class="scroll">${esc(JSON.stringify(value ?? null, null, 2))}</pre>`;
/**
 * What the member sent and Studio's receipt for it, verbatim: with no producer registered, nothing here is AMC's. With
 * nothing sent (a stage whose producer ran), the receipt is the step's output, never labelled as the member's statement.
 */
const recorded = (what, entry) => `<p class="muted">Studio recorded ${entry.text ? what : "this step's output"} as self-reported${Number.isSafeInteger(entry.headSeq)
  ? ` at seq ${esc(entry.headSeq)}` : ""}. ${entry.text ? `What you sent:</p><p>${esc(entry.text)}</p>` : "You sent no statement.</p>"}${studioJson(entry.data)}`;

/** Understand's recorded statement; Confirm and Correct stay disabled until one is shown here. */
function reflectionHtml(reflection, understand) {
  const bound = Number.isSafeInteger(reflection?.headSeq);
  const offer = bound ? understand : held(reflection ? "Studio did not say which head this statement was recorded at" : NO_REFLECTION);
  return `${reflection ? `${recorded("your statement", reflection)}<p class="muted">Yes and Correct bind this head: if the project
    changes first, Studio refuses them and you run Understand again.</p>` : `<p class="muted">${NO_REFLECTION}. Run Understand to
    record your statement before you confirm it.</p>`}
    <div class="row wrap">${actionButton("Yes, that's it", "confirm", offer)} ${actionButton("Correct this", "correct", offer)}</div>
    <p class="muted">Correct this sends nothing: change your answers or your statement, then run Understand again.</p>`;
}

export const ANSWER_CHANGED = "Another member changed an answer you are editing since you began; discard your edits to see theirs";
/** An answer as its field shows it ("" when unanswered); a4.js compares it to see another member's change. */
export function answerText(answers, questionId) {
  const answer = answers.find((row) => row.questionId === questionId);
  return answer === undefined ? "" : shown(answer.value);
}

/**
 * While a stage's question bank is empty Studio takes any question id (P1-57 stageStep), so Ask offers this one free-text
 * answer. Saving any answer records a new revision and returns the stage to `asked`: until Studio accepts a re-proposal
 * from `proposed`, it is the only way on after Request changes or a Deny.
 */
const NOTES = { id: "notes", prompt: "Notes for this stage (no questions are registered for it yet)" };
const RESTARTS = "Saving answers records a new revision, which supersedes the current revision's gates, and returns this stage to Ask; Understand, Explain and Propose then run again.";

/**
 * Ask: unanswered questions are open fields. Answers so far are listed read-only and collapsed, carried and inferred
 * ones with Confirm (records that value, unchanged, as the user's); "Change my answers" holds their fields. Save sends
 * only the fields the user changed, and a non-text answer is edited as JSON and sent parsed (a4.js).
 */
export function renderConversation(ctx) {
  const { answers, allowed, reflection, explanation, answerDrift } = ctx;
  const questions = ctx.questions.length ? ctx.questions : [NOTES];
  const ask = stepOffer(allowed.ask, ctx, "answers");
  const understand = stepOffer(allowed.understand, ctx, "understand");
  const answered = new Map(answers.map((answer) => [answer.questionId, answer]));
  const open = questions.filter((question) => !answered.has(question.id));
  const field = (question) => {
    const answer = answered.get(question.id);
    const json = answer !== undefined && typeof answer.value !== "string";
    return `<label>${esc(question.prompt)}${question.required ? " (required)" : ""}${json ? " (JSON)" : ""}
      <textarea name="${esc(question.id)}" rows="2"${json ? " data-json" : ""}>${esc(answerText(answers, question.id))}</textarea></label>`;
  };
  const answerRow = (answer) => `<li><code>${esc(answer.questionId)}</code> <code>${esc(answer.source)}</code>: ${esc(shown(answer.value))}${
    answer.source === "user" ? "" : ` ${actionButton("Confirm", "confirm-answer", ask, `data-question="${esc(answer.questionId)}"`)}`}</li>`;
  const notMine = answers.filter((answer) => answer.source !== "user").length;
  const change = questions.filter((question) => answered.has(question.id));
  return `<h4>Ask</h4>
    ${answers.length ? `<details data-a4-open="answers"><summary>${answers.length} answered (${notMine} carried or inferred);
      ${open.length} still need an answer</summary>${list(answers.map(answerRow), "")}</details>` : ""}
    <form class="a4-form" data-a4-answers>${open.map(field).join("")}${change.length
      ? `<details data-a4-open="change-answers"><summary>Change my answers</summary>${change.map(field).join("")}</details>` : ""}
      ${answerDrift ? `<p class="status-bad">${ANSWER_CHANGED}.</p>` : ""}
      <p class="muted">${RESTARTS} ${IN_RECORD}</p>
      <div class="row wrap">${actionButton("Save answers", "answers", answerDrift ? held(ANSWER_CHANGED) : ask)}${answerDrift
        ? ` <button type="button" class="secondary" data-a4-action="discard-answers">Discard my answer edits</button>` : ""}</div></form>
    <h4>Understand</h4>
    <label>What this stage should achieve, in your words <textarea name="understanding" rows="3" maxlength="${CONTENT_MAX}"></textarea></label>
    <p class="muted">${NO_PRODUCER} ${RETAINED}</p>
    <div class="row wrap">${actionButton("Run Understand", "understand", understand)}</div>
    ${reflectionHtml(reflection, understand)}
    <h4>Explain</h4>
    <label>Your explanation <textarea name="explanation" rows="3" maxlength="${CONTENT_MAX}"></textarea></label>
    <p class="muted">${NO_PRODUCER} ${RETAINED}</p>
    <div class="row wrap"><select name="level">${LEVELS.map((level) => `<option value="${level}">${stageTitle(level)}</option>`).join("")}</select>
      ${actionButton("Explain at this level", "explain", stepOffer(allowed.explain, ctx, "explain"))}</div>
    ${explanation ? recorded(`your explanation at the ${esc(explanation.level)} level`, explanation) : ""}`;
}

/** The part of a revision's spec a member edits: Studio carries `answers` itself and refuses a proposal naming them. */
export const editableSpec = (spec) => Object.fromEntries(Object.entries(isObject(spec) ? spec : {}).filter(([key]) => key !== "answers"));

export function renderSpecEditor(ctx) {
  const { revision, allowed, project, stage } = ctx;
  if (stage !== project.stage) {
    // Another stage's view: the head revision belongs to the project's current stage, so it is shown, never proposed here.
    return `<p class="muted">${esc(stageTitle(stage))} is not this project's current stage (${esc(stageTitle(project.stage))}).
      ${revision ? `This is r${esc(revision.revisionNo)}${revision.stage ? `, a ${esc(stageTitle(revision.stage))} specification` : ""}, shown read-only.` : "No specification yet."}
      Propose from the ${esc(stageTitle(project.stage))} view.</p>${revision ? studioJson(revision.spec ?? {}) : ""}`;
  }
  // After a reopen the stage has its own, older revision; the editor still starts from the head revision.
  const seeded = revision && revision.stage !== stage ? ` ${ctx.stageRevision ? `The newest ${esc(stageTitle(stage))} specification is
    r${esc(ctx.stageRevision.revisionNo)};` : `No ${esc(stageTitle(stage))} specification yet:`} the editor starts from the head revision
    r${esc(revision.revisionNo)}, ${revision.stage ? `the ${esc(stageTitle(revision.stage))} specification` : "whose stage Studio did not name"}.` : "";
  // P1-57 takes a proposal only at step `explained`; a re-proposal from `proposed` is not routed yet, so the way to a new
  // revision from there is Save answers (NOTES).
  const proposable = project.step === "explained";
  return `<p class="muted">${proposable ? "Editing after Propose creates a new revision"
    : `Studio takes a proposal only at step <code>explained</code>; this project is at <code>${esc(project.step)}</code>`}${revision
    ? ` (current r${esc(revision.revisionNo)}, spec <code>${esc(revision.specDigest)}</code>)` : ""}.${seeded}${proposable ? ""
    : " To change the specification from here, save an answer under Ask: that starts this stage's loop again at a new revision."} ${IN_RECORD}</p>
    <textarea name="spec" rows="14" spellcheck="false">${esc(JSON.stringify(editableSpec(revision?.spec), null, 2))}</textarea>
    <p class="muted">Answers are not edited here: they are recorded through Save answers.</p>
    <div class="row wrap">${actionButton("Propose this specification", "propose", stepOffer(allowed.propose, ctx, "propose"))}${ctx.specDraft
      ? ` <button type="button" class="secondary" data-a4-action="reload">Discard my edits</button>` : ""}</div>`;
}

export function renderBuildCard(ctx) {
  return `<p class="muted">${TRUTH.admission}. With no producer registered for this stage, what you write here is recorded
    as a self-reported implementation output. ${RETAINED}</p><textarea name="content" rows="4" maxlength="${CONTENT_MAX}"></textarea>
    <div class="row wrap">${actionButton("Build", "build", stepOffer(ctx.allowed.build, ctx, "build"))}</div>`;
}

export function renderReviewCard(ctx) {
  return `<p class="muted">Human findings are recorded as self-reported; AMC's own checks appear in the Integrity panel. ${RETAINED}</p>
    <textarea name="content" rows="4" maxlength="${CONTENT_MAX}"></textarea><div class="row wrap">${actionButton("Review", "review",
      stepOffer(ctx.allowed.review, ctx, "review"))}</div>`;
}

/**
 * One thread per stage-qualified card id (`aspire:specification`), the key a4.js posts and presence uses. Studio names a
 * comment's author by principal key only; a current member's key is shown as their username.
 */
export function renderComments(cardId, comments, members = []) {
  const names = new Map(members.map((member) => [member.principalKey, member.username]));
  const rows = comments.filter((comment) => comment.cardId === cardId).map((comment) => `<li>
    <span class="pill">SELF_REPORTED</span> <strong>${esc(names.get(comment.authorKey) ?? comment.authorKey)}</strong>
    <span class="muted">${time(comment.ts)}</span><div>${typeof comment.body === "string" ? esc(comment.body)
      : `<span class="muted">Text not returned by Studio</span> ${codes(comment.reasonCode ? [comment.reasonCode] : [])}`}</div></li>`);
  return `<details class="a4-comments" data-a4-open="discussion"${rows.length ? " open data-a4-default-open" : ""}><summary>Discussion (${rows.length})</summary>${list(rows, "No comments yet.")}
    <textarea name="comment" rows="2" maxlength="${COMMENT_MAX_BYTES}"></textarea>
    <button type="button" data-a4-action="comment">Comment</button>
    <p class="muted">Discussion, never evidence; up to 8 KiB. ${RETAINED}</p></details>`;
}

export function renderCard(card, ctx, comments) {
  let body;
  try { body = card.render(ctx); }
  catch (error) { body = `<p class="status-bad">This card could not render: ${esc(error?.message ?? error)}</p>`; }
  return `<section class="card a4-card" data-card="${esc(card.id)}"><h4>${esc(card.title)}</h4>${body}${renderComments(`${ctx.stage}:${card.id}`, comments, ctx.project.members)}</section>`;
}

export function renderDifferences(diff, project) {
  if (project.revisionNo < 2) return `<p class="muted">No earlier revision to compare.</p>`;
  return renderPromptDiffViewer(isObject(diff) ? { status: "ok", ...diff } : null);
}

function nextActionHtml(next) {
  if (!isObject(next)) return "";
  const route = typeof next.route === "string" && /^\.?\/(?!\/)[\w\-./?=&%]*$/.test(next.route) ? next.route : null;
  return ` ${route ? `<a class="button secondary" href="${esc(route)}">${esc(next.label)}</a>` : `<strong>${esc(next.label)}</strong>`}${
    typeof next.command === "string" ? ` <code>${esc(next.command)}</code> <button type="button" class="secondary" data-a4-copy="${esc(next.command)}">Copy</button>` : ""}`;
}

/** The items Studio's acknowledgeItem accepts (ACKNOWLEDGEABLE_ITEMS, src/a4/a4Readiness.ts); any other is 400 INPUT_INVALID. */
const ACKNOWLEDGEABLE = new Set(["lineage.independent_approvals", "sod.self_provisioned", "regulatory_sources_status", "deployment.amc_check",
  "plan_unresolved"]);

/** A failed or lost effect's retry (readiness names the attempt and the route); disabled, with Studio's reasons, for anyone but an owner. */
function retryButton(item, allowed) {
  const attempt = item.id === "effects.failed" ? item.reasonCodes.find((code) => /^ATTEMPT:a4e_[0-9a-f]{32}$/.test(code)) : undefined;
  const route = /\/stages\/([a-z]+)\/effects\/([a-z0-9_.-]{1,128})\/retry$/.exec(item.nextAction?.route ?? "");
  return attempt && route ? ` ${actionButton("Retry", "retry-effect", allowed.retryEffect,
    `data-attempt="${esc(attempt.slice("ATTEMPT:".length))}" data-effect-stage="${esc(route[1])}" data-effect="${esc(route[2])}"`)}` : "";
}

function itemRow(item, allowed) {
  const ack = item.acknowledged;
  return `<li><code>${esc(item.id)}</code> <code>${esc(item.status)}</code>${item.kind ? ` <span class="chip">${esc(item.kind)}</span>` : ""}
    ${codes(item.reasonCodes)}${ack ? `<div class="muted">Acknowledged by ${esc(ack.by)} until ${time(ack.expiresTs)}: ${esc(ack.reason)};
      still ${esc(item.status)}</div>` : ""}${nextActionHtml(item.nextAction)}${retryButton(item, allowed)}${
    !ack && item.status === "WAITING" && ACKNOWLEDGEABLE.has(item.id) && allowed.acknowledge?.allowed === true
      ? ` ${actionButton("Acknowledge", "acknowledge", allowed.acknowledge, `data-item="${esc(item.id)}"`)}` : ""}</li>`;
}

export function renderMissing(readiness) {
  const open = readiness.items.filter((item) => !["READY", "COMPLETE"].includes(item.status));
  const group = (mandatory) => list(open.filter((item) => item.mandatory === mandatory).map((item) => itemRow(item, readiness.allowed)), "None.");
  return `<p>Readiness <code>${esc(readiness.status)}</code>${nextActionHtml(readiness.nextAction)}</p>
    <h4>Mandatory</h4>${group(true)}<h4>Advisory</h4>${group(false)}`;
}

function laneItem(item) {
  return `<li><code>${esc(item.id)}</code> <code>${esc(item.status)}</code>${item.claim ? ` <code>${esc(item.claim.claimKind)}</code>` : ""}
    ${codes(item.reasonCodes)}<div>${renderEvidenceRefList(item.evidence.map((ref) => `${ref.refKind}:${ref.refId} ${ref.status} ${ref.claimKind}`))}</div></li>`;
}

/** An evidence ref as GET …/evidence returns it; Studio derives its lane, claim kind and trust tier. */
const refRow = (ref) => `<li><code>${esc(ref.refKind)}:${esc(ref.refId)}</code> <code>${esc(ref.status)}</code> <code>${esc(ref.claimKind)}</code>${
  ref.trustTier ? ` <code>${esc(ref.trustTier)}</code>` : ""} ${codes(ref.reasonCodes)}</li>`;

/**
 * Four lane columns, each with readiness's items and the revision's evidence refs in that lane (the Understand, Explain,
 * Build and Review outputs among them), and beside them the Integrity panel: AMC's own checks, no claim badge, verbatim.
 */
export function renderLanes(readiness, refs, revisionNo) {
  const lanes = LANES.map(([lane, title]) => `<section class="card a4-lane"><h4>${title}</h4>${list([
    ...readiness.items.filter((item) => item.section === lane).map(laneItem), ...refs.filter((ref) => ref.lane === lane).map(refRow)],
  "Nothing recorded.")}</section>`).join("");
  const checks = readiness.items.filter((item) => item.section === "integrity").map((item) => `<details data-a4-open="integrity:${esc(item.id)}"><summary><code>${esc(item.id)}</code>
    <code>${esc(item.status)}</code> ${codes(item.reasonCodes)}</summary><pre class="scroll">${esc(JSON.stringify(item.report, null, 2))}</pre></details>`);
  return `<p class="muted">Readiness items for this stage and the evidence refs Studio lists for r${esc(revisionNo)}, as recorded.</p>
    <div class="a4-lanes"><div class="a4-lane-grid">${lanes}</div><section class="card a4-integrity"><h4>Integrity</h4>
    <p class="muted">Integrity of bytes; not evidence about the agent. ${TRUTH.signatures}.</p>
    <p><code>valid: ${esc(readiness.integrity.valid)}</code> ${codes(readiness.integrity.reasonCodes)}</p>${checks.join("")}</section></div>`;
}

const STAGE_GATES = new Set(["direction", "completion"]);
const isLive = (gate) => !gate.supersededBy && (gate.quorum?.status === "PENDING" || gate.quorum?.status === "QUORUM_MET");

/**
 * The viewed stage's direction and completion gates as Studio's one evaluator states them (`readiness.gates`: a gate whose
 * bound items moved reads STALE there, not in /gates), each joined by gateId with its /gates record for the binding
 * digest, decisions and exclusions. `open` and `met` are the ones readiness reads PENDING and QUORUM_MET; a4.js reads the
 * same selection when it posts a decision. `earlier` are the stage's other direction/completion gates, with the status
 * /gates gives them. `policy` gates (opened at the project's stage) are never among them: this page does not show the
 * proposed gate policy, so it lists the live ones only to say they are decided elsewhere.
 */
export function currentGates(gates, stage, readiness) {
  const shown = ["direction", "completion"].map((kind) => readiness?.gates?.[kind]).filter((gateView) => isObject(gateView) && typeof gateView.gateId === "string")
    .map((gateView) => ({ decisions: [], excludedKeys: [], ...gates.find((gate) => gate.gateId === gateView.gateId), ...gateView }));
  return { shown, open: shown.filter((gate) => gate.status === "PENDING").at(-1) ?? null,
    met: shown.filter((gate) => gate.status === "QUORUM_MET").at(-1) ?? null,
    earlier: gates.filter((gate) => gate.stage === stage && STAGE_GATES.has(gate.gate) && !shown.some((row) => row.gateId === gate.gateId)),
    policy: gates.filter((gate) => gate.gate === "policy" && isLive(gate)) };
}

/**
 * The gate's open seq (the GATE_REQUESTED seq P1-57's decide path compares `expectedGateSeq` with), read only from
 * `requestedSeq`: a generic `seq` could be a decided or superseding seq. null when Studio did not publish it, or
 * published a seq the head has not reached (P1-57 writes Number.MAX_SAFE_INTEGER when the request link is missing).
 */
export function gateSeq(gateView, headSeq) {
  const value = gateView?.requestedSeq;
  return Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(headSeq) && value <= headSeq ? value : null;
}

/** What a decision binds: the gate and readiness the approvals bar showed. a4.js pins the first bound one it renders. */
export const gateReview = (gate, readiness) => (gate ? { gateId: gate.gateId, bindingDigest: gate.bindingDigest,
  revisionNo: gate.revisionNo, readinessBindingDigest: readiness.bindingDigest } : null);
const HEX64 = /^[0-9a-f]{64}$/;
/** A review a decision can bind: Studio published both digests. A missing one never reads as bound. */
export const boundReview = (review) => review != null && HEX64.test(String(review.bindingDigest)) && HEX64.test(String(review.readinessBindingDigest));
export const sameReview = (a, b) => boundReview(a) && boundReview(b) && a.gateId === b.gateId && a.bindingDigest === b.bindingDigest
  && a.readinessBindingDigest === b.readinessBindingDigest;
export const UNBOUND = "Studio did not publish the gate or readiness digest";
export const OTHER_REVISION = "The specification shown is not the revision this gate binds; reload the page";
export const specDraftNote = (revisionNo) => `Your unsaved specification edits are shown instead of r${revisionNo}; propose or discard them before deciding`;

/**
 * True when one load's separate reads describe one revision: the specification card's revision and every live gate the
 * page could bind (from /gates and from readiness) belong to the project's head revision. A new revision supersedes
 * every earlier gate, so a consistent Studio always passes; a write landing between the reads fails it.
 */
export function oneRevision(project, revision, gates, readiness) {
  const at = project.revisionNo;
  const liveView = (gateView) => isObject(gateView) && (gateView.status === "PENDING" || gateView.status === "QUORUM_MET");
  return (revision === null || revision.revisionNo === at) && gates.every((gate) => !isLive(gate) || gate.revisionNo === at)
    && Object.values(readiness.gates ?? {}).every((gateView) => !liveView(gateView) || gateView.revisionNo === at);
}

/**
 * A decision readiness.staleApprovals lists shows Studio's reason codes as received. Only GATE_STALE, the reason Studio
 * gives for a decision its quorum excludes, is struck through; a RESOURCE_DRIFTED decision still counts until it goes stale.
 */
const strikeIfStale = (html, reasonCodes) => (reasonCodes.includes("GATE_STALE") ? `<s>${html}</s>` : html);
function decisionRow(decision, reasonCodes = []) {
  return `<li>${strikeIfStale(`${esc(decision.username)} <code>${esc(decision.decision)}</code>`, reasonCodes)} ${codes(reasonCodes)}
    <span class="muted">${time(decision.ts)}</span>${decision.selfApproved ? ` <span class="muted">${TRUTH.selfApproved}</span>` : ""}</li>`;
}
export const POLICY_ELSEWHERE = "A gate-policy change is open. This page does not show the proposed policy, so it cannot be decided here";

function gateChangeBanner({ from, to }) {
  const what = from.gateId === to.gateId && from.bindingDigest === to.bindingDigest
    ? `The readiness this gate binds changed while you were on this page (r${esc(to.revisionNo)}).`
    : `The gate changed from r${esc(from.revisionNo)} to r${esc(to.revisionNo)} while you were on this page.`;
  return `<div class="banner a4-conflict"><p>${what} Approve, Deny, Request changes and Complete stay disabled until you
    show the current gate and review it.</p><button type="button" data-a4-action="show-gate">Show r${esc(to.revisionNo)}</button></div>`;
}

/**
 * readiness.allowed.decide covers approve and deny alike and leaves out the gate's separation-of-duties exclusions (an
 * excluded member may still deny); Studio refuses that member's approval with 400 SOD_VIOLATION unless readiness says
 * self-approval is open. Approve is held with that code from the gate's own excludedKeys, under the key Studio derives:
 * a WORKSPACE_ROUTER principal is checked from session records, a LOCAL_USER one from users.yaml.
 */
export function approveOffer(decide, gate, readiness, me) {
  const key = typeof me?.userId === "string" ? `${readiness.identityCheck === "session_record" ? "WORKSPACE_ROUTER" : "LOCAL_USER"}:${me.userId}` : null;
  if (key === null || readiness.selfApprovalAllowed === true || !Array.isArray(gate?.excludedKeys) || !gate.excludedKeys.includes(key)) return decide;
  return refuse(decide, "SOD_VIOLATION");
}

/**
 * readiness.allowed.requestGate leaves out the kind's own gate: requestGate (src/a4/a4Gates.ts) refuses a second request
 * while it reads PENDING or QUORUM_MET (409 A4_GATE_OPEN) and after a Deny of the current revision (409 A4_GATE_DENIED).
 * A STALE, CHANGES_REQUESTED or EXPIRED gate is replaced, so those stay offered. It also leaves out the mandatory items
 * still WAITING for an owner's acknowledgement: progress refuses until they are acknowledged, and the ACKNOWLEDGED
 * transition supersedes the gate (A4_SUPERSEDING_KINDS, src/a4/a4Schema.ts), so a gate requested first loses its
 * approvals. The request is held, naming those items, until the owner acknowledges them under Missing requirements.
 */
function requestOffer(ctx, kind) {
  let offer = stepOffer(ctx.allowed.requestGate, ctx, `request-${kind}`);
  const gate = ctx.readiness.gates?.[kind];
  if (gate?.status === "PENDING" || gate?.status === "QUORUM_MET") offer = refuse(offer, "A4_GATE_OPEN");
  else if (gate?.status === "DENIED" && gate.revisionNo === ctx.project.revisionNo) offer = refuse(offer, "A4_GATE_DENIED");
  const unacknowledged = ctx.readiness.items.filter((item) => item.mandatory && item.status === "WAITING" && item.acknowledged === null
    && ACKNOWLEDGEABLE.has(item.id)).map((item) => item.id);
  return unacknowledged.length ? refuse(offer, ...unacknowledged) : offer;
}

export function renderApprovalsBar(ctx) {
  const { readiness, gates, stage, allowed, gateChange, specDraft } = ctx;
  const { shown, open, met, earlier, policy } = currentGates(gates, stage, readiness);
  const gate = open ?? met;
  const staleCodes = new Map(readiness.staleApprovals.map((row) => [row.decisionId, Array.isArray(row.reasonCodes) ? row.reasonCodes : []]));
  const shownIds = new Set(shown.flatMap((row) => row.decisions.map((decision) => decision.decisionId)));
  const pinned = (offer) => (gateChange ? held(GATE_CHANGED) : gate && !boundReview(gateReview(gate, readiness)) ? held(UNBOUND)
    : gate && gate.revisionNo !== ctx.revision?.revisionNo ? held(OTHER_REVISION) : gate && specDraft ? held(specDraftNote(gate.revisionNo)) : offer);
  // Readiness's status verbatim; only the decisions readiness.staleApprovals lists carry codes (decisionRow).
  const gateBlock = (row) => `<p><code>${esc(row.gate)}</code> gate r${esc(row.revisionNo)} · <code>${esc(row.status)}</code> ·
      ${esc(row.approvals)} of ${esc(row.required)} required approvals</p>
      ${Array.isArray(row.excludedKeys) && row.excludedKeys.length ? `<p>Cannot approve (separation of duties); may still deny: ${codes(row.excludedKeys)}</p>` : ""}
      ${list(row.decisions.map((decision) => decisionRow(decision, staleCodes.get(decision.decisionId))), "No decisions yet.")}`;
  const earlierRows = earlier.map((old) => `<li><code>${esc(old.gate)}</code> gate bound to r${esc(old.revisionNo)} · <code>${esc(old.status)}</code>
    ${list(old.decisions.map((decision) => decisionRow(decision)), "No decisions.")}</li>`);
  const otherStale = readiness.staleApprovals.filter((row) => !shownIds.has(row.decisionId))
    .map((row) => `<li>${strikeIfStale(`<code>${esc(row.decisionId)}</code>`, staleCodes.get(row.decisionId))} ${codes(row.reasonCodes)}</li>`);
  return `<section class="card a4-approvals"><h4>Approvals</h4>${gateChange ? gateChangeBanner(gateChange) : ""}
    ${shown.length ? `${shown.map(gateBlock).join("")}<p class="muted">Valid while the specification and resources are unchanged. ${TRUTH.vote}.</p>`
      : `<p class="muted">No direction or completion gate has been requested at this stage.</p>`}
    ${policy.length ? `<p class="muted">${POLICY_ELSEWHERE}: ${policy.map((row) => `<code>${esc(row.gateId)}</code> <code>${esc(row.quorum.status)}</code>`).join(", ")}.</p>` : ""}
    ${earlierRows.length ? `<details data-a4-open="earlier-gates"><summary>Earlier gates</summary>${list(earlierRows, "")}</details>` : ""}
    ${otherStale.length ? `<details data-a4-open="stale-decisions"><summary>Stale decisions</summary>${list(otherStale, "")}</details>` : ""}
    <label>Reason (required to decide, hold, resume or acknowledge) <input name="reason" required maxlength="2000" /></label>
    <div class="row wrap">
      ${actionButton("Approve", "approve", open ? pinned(approveOffer(allowed.decide, open, readiness, ctx.me)) : null)}
      ${actionButton("Request changes", "request-changes", open ? pinned(allowed.requestChanges) : null)}
      ${actionButton("Hold", "hold", allowed.hold)}
      ${actionButton("Request direction approval", "request-direction", requestOffer(ctx, "direction"))}
      ${actionButton("Request completion approval", "request-completion", requestOffer(ctx, "completion"))}
      ${actionButton("Complete stage", "complete", stage === "activate" && met?.gate === "completion" ? held(ACTIVATE_COMPLETE) : met ? pinned(allowed.progress) : null)}
    </div>
    <details data-a4-open="more"><summary>More</summary><div class="row wrap">${actionButton("Deny", "deny", open ? pinned(allowed.decide) : null)}
      ${allowed.resume ? actionButton("Resume", "resume", allowed.resume) : ""}</div></details></section>`;
}

export function renderMembers(ctx) {
  const { project, members, readiness } = ctx;
  const roles = ["builder", "reviewer", "approver", "viewer", "owner"];
  const candidates = Array.isArray(members?.candidates) ? members.candidates : [];
  return `<section class="card"><h4>Members</h4>
    ${list(project.members.map((member) => `<li>${esc(member.username)} <code>${esc(member.authSource)}</code> ${codes(member.roles)}</li>`), "No members.")}
    ${readiness.identityCheck === "session_record" ? `<p><code>IDENTITY_CHECK_LIMITED</code> Host-mode roles come from session records, not a live check.</p>` : ""}
    ${members?.candidatesLimited === true ? `<p class="muted">Host mode: candidates come from tracked session records, so this list may be incomplete.</p>` : ""}
    ${members?.error ? `<p class="status-bad">${esc(members.error)}</p>` : ""}
    ${candidates.length ? `<h4>Candidates</h4>${list(candidates.map((candidate) => `<li data-principal="${esc(candidate.principalKey)}">
      ${esc(candidate.username)} <select name="role">${roles.map((role) => `<option>${role}</option>`).join("")}</select>
      ${actionButton("Add", "add-member", ctx.allowed.addMember)}</li>`), "")}` : ""}
    <p class="muted">${TRUTH.twoUsers}.</p></section>`;
}

export function renderPresence(presence, error) {
  const chips = presence.map((row) => `<span class="chip">${esc(row.username)} is on ${esc(cardLabel(row.card))}</span>`).join(" ");
  return `${chips || `<span class="muted">No presence reported.</span>`}${error ? ` <span class="muted">Presence: ${esc(error)}</span>` : ""}
    <p class="muted">Presence is held in memory for 30 seconds; it is not durable and not evidence.</p>`;
}

/**
 * "Apply my changes on top" only while the head takes a proposal (`conflict.proposable`, step `explained`; a4.js). Paths
 * both sides changed (`conflict.clashes`, found when the member applies) are listed and need "Apply mine over theirs".
 */
export function renderConflict(conflict) {
  const same = conflict.headRevisionNo === conflict.baseRevisionNo;
  const clashes = conflict.clashes ?? [];
  // What Studio returned, verbatim: the page does not know which transitions moved the head.
  return `<section class="card a4-conflict"><h4>${same ? "Studio refused your proposal" : "The specification changed while you were editing"}</h4>
    ${same ? `<p>Studio answered <code>${esc(conflict.code)}</code>. The head is at seq ${esc(conflict.headSeq)} (still
      r${esc(conflict.headRevisionNo)}; now <code>${esc(conflict.headStage)}</code> <code>${esc(conflict.headStep)}</code>). Review
      the page below before you act.</p>` : `<p>The head is r${esc(conflict.headRevisionNo)}; you started from
      r${esc(conflict.baseRevisionNo)}. Changes on the head:</p>
    ${conflict.theirs.length ? renderPromptDiffViewer({ status: "ok", changes: conflict.theirs }) : `<p class="muted">No specification changes on the head.</p>`}`}
    ${conflict.proposable ? "" : `<p>Studio takes a proposal only at step <code>explained</code> of the project's current stage; the head is at
      <code>${esc(conflict.headStage)}</code> <code>${esc(conflict.headStep)}</code>, so your changes cannot be applied on top of it.
      Reload shows the head and discards your edits.</p>`}
    <p>Your changes when Studio refused them${conflict.proposable ? " (Apply my changes on top uses the editor as it is now)" : ""}:</p>
    ${renderPromptDiffViewer({ status: "ok", changes: conflict.mine })}
    ${clashes.length ? `<p class="status-bad">You and r${esc(conflict.headRevisionNo)} both changed ${codes(clashes.map((row) => JSON.stringify(row.path)))}.
      Nothing was sent. "Apply mine over theirs" puts your editor's value there in place of r${esc(conflict.headRevisionNo)}'s; or
      edit those paths and apply again, or Reload to start from r${esc(conflict.headRevisionNo)}.</p>` : ""}
    <div class="row wrap">${!conflict.proposable ? "" : clashes.length
      ? `<button type="button" data-a4-action="apply-on-top" data-a4-confirm="${esc(conflict.clashKey)}">Apply mine over theirs</button> `
      : `<button type="button" data-a4-action="apply-on-top">Apply my changes on top</button> `}<button
      type="button" class="secondary" data-a4-action="reload">Reload</button></div></section>`;
}

/** Structural JSON diff: one row per differing leaf; arrays compare whole. */
export function jsonDiff(before, after, path = []) {
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => jsonDiff(before[key], after[key], [...path, key]));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, before, after }];
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Applies jsonDiff rows onto another spec ("apply my changes on top"); a missing `after` deletes the key. A row reaching
 * through a value that is not an object there is refused, never replaced by {} (mergeOnTop avoids it).
 */
export function applyChanges(base, changes) {
  let out = structuredClone(isObject(base) ? base : {});
  for (const { path, after } of changes) {
    if (path.some((key) => UNSAFE_KEYS.has(key))) throw new Error("The specification uses a reserved key name.");
    if (path.length === 0) { out = structuredClone(after); continue; }
    let node = out;
    for (const key of path.slice(0, -1)) {
      if (!isObject(node[key])) throw new Error(`The head no longer has an object at ${JSON.stringify(path)}. Nothing was sent.`);
      node = node[key];
    }
    if (after === undefined) delete node[path.at(-1)];
    else node[path.at(-1)] = structuredClone(after);
  }
  return out;
}

const within = (path, prefix) => prefix.length <= path.length && prefix.every((key, index) => key === path[index]);

/**
 * The head's changes (`theirs`) that collide with the draft's (`mine`), both diffed from the revision the draft was
 * edited from: the same path, or one inside the other, unless both wrote the same value at the same path.
 */
export function clashingChanges(theirs, mine) {
  return theirs.filter((row) => mine.some((own) => (within(own.path, row.path) || within(row.path, own.path))
    && !(own.path.length === row.path.length && JSON.stringify(own.after) === JSON.stringify(row.after))));
}

/**
 * The draft on top of the head, once the member has seen and confirmed `clashes`: the draft's rows win, and where the
 * draft changed something inside a path the head replaced, the draft's whole value at the head's path is written.
 */
export function mergeOnTop(headSpec, mine, draft, clashes) {
  const outer = clashes.filter((row) => mine.some((own) => own.path.length > row.path.length && within(own.path, row.path)));
  const at = (path) => path.reduce((node, key) => (isObject(node) ? node[key] : undefined), draft);
  return applyChanges(headSpec, [...mine.filter((own) => !outer.some((row) => within(own.path, row.path))),
    ...outer.map((row) => ({ path: row.path, after: at(row.path) }))]);
}

// P1-52: validateNativeTaskPoll (nativeTasks.js) is exported, but it validates the native-task view (task, truncated,
// event kinds), not A4's { events, nextCursor, firstCursor, droppedEvents, head, presence }. This copy keeps its refusals:
// a malformed or oversized page, a cursor or event order that moves backwards, and a head that regresses or names
// another project. P1-57's head names no projectId (the request path names the project), so only a present, different
// one is refused.
const POLL_EVENT_BYTES = 2 * 1024 * 1024;

/** Presence rows as Studio returned them (the poll's or the heartbeat's), keeping only well-formed ones. */
export const presenceRows = (rows) => (Array.isArray(rows) ? rows.slice(0, 256) : []).filter((row) => isObject(row) && typeof row.username === "string")
  .map((row) => ({ username: row.username, card: typeof row.card === "string" ? row.card : "" }));

export function validateA4Poll(value, current, cursor) {
  const int = (number) => Number.isSafeInteger(number) && number >= 0;
  if (!isObject(value) || !Array.isArray(value.events) || !Array.isArray(value.presence) || !int(value.nextCursor)
    || !int(value.firstCursor) || !int(value.droppedEvents) || !isObject(value.head) || !int(value.head.headSeq)
    || value.events.length > 512 || value.presence.length > 256
    || new TextEncoder().encode(JSON.stringify(value.events)).byteLength > POLL_EVENT_BYTES) {
    throw new Error("Studio returned an unsupported A4 update. No updates were applied.");
  }
  if ((value.head.projectId !== undefined && value.head.projectId !== current.projectId) || value.head.headSeq < current.headSeq) {
    throw new Error("The project head moved backwards or changed identity. No updates were applied; reload the page.");
  }
  if (value.nextCursor < cursor || value.firstCursor > value.nextCursor + 1) {
    throw new Error("The event cursor moved backwards. No updates were applied; reload the page.");
  }
  let previous = -1; // a project's CREATED transition is seq 0
  for (const event of value.events) {
    if (!isObject(event) || !int(event.cursor) || event.cursor <= previous || event.cursor < value.firstCursor || event.cursor > value.nextCursor) {
      throw new Error("Studio returned out-of-order A4 updates. No updates were applied.");
    }
    previous = event.cursor;
  }
  // The cursor is the next seq to read, so an event at the cursor is new.
  return { head: value.head, nextCursor: value.nextCursor, events: value.events.filter((event) => event.cursor >= cursor),
    presence: presenceRows(value.presence) };
}
