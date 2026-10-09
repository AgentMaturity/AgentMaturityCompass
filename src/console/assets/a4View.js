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
const RETAINED = "Pasted text is retained until the project's blob key is destroyed.";

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

export function renderCreateForm(open) {
  return `<details class="card" id="a4Create"${open ? " open" : ""}><summary>Start an agent project</summary>
    <form id="a4CreateForm" class="a4-form">
      <label>Project name <input name="name" required maxlength="200" /></label>
      <label>Existing agent id (optional) <input name="agentId" maxlength="200" /></label>
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

const NO_REFLECTION = "No reflection shown yet";
const studioJson = (value) => `<pre class="scroll">${esc(JSON.stringify(value ?? null, null, 2))}</pre>`;

/** Understand's reflection as Studio returned it; Confirm and Correct stay disabled until one is shown here. */
function reflectionHtml(reflection, allowed) {
  const bound = Number.isSafeInteger(reflection?.headSeq);
  const offer = bound ? allowed.understand : held(reflection ? "Studio did not say which head this reflection belongs to" : NO_REFLECTION);
  return `${reflection ? `<p class="muted">What AMC understood, as Studio returned it${bound ? ` (head ${esc(reflection.headSeq)})` : ""}.
    Yes and Correct bind this head: if the project changes first, Studio refuses them and you run Understand again.</p>
    ${studioJson(reflection.data)}` : `<p class="muted">${NO_REFLECTION}. Run Understand to see what AMC
    understood before you confirm it.</p>`}
    <div class="row wrap">${actionButton("Yes, that's it", "confirm", offer)}</div>
    <label>Correct this <textarea name="corrections" rows="2"></textarea></label>${actionButton("Correct this", "correct", offer)}`;
}

export function renderConversation(ctx) {
  const { questions, answers, allowed, reflection, explanation } = ctx;
  const answered = new Map(answers.map((answer) => [answer.questionId, answer]));
  const carried = answers.filter((answer) => answer.source === "carried");
  const open = questions.filter((question) => !answered.has(question.id)).length;
  const fields = questions.map((question) => `<label>${esc(question.prompt)}${question.required ? " (required)" : ""}
    <textarea name="${esc(question.id)}" rows="2">${esc(answered.has(question.id) ? shown(answered.get(question.id).value) : "")}</textarea></label>`);
  return `<h4>Ask</h4>
    ${carried.length ? `<details><summary>${carried.length} answers carried; ${open} still need an answer</summary>${list(carried
      .map((answer) => `<li><code>${esc(answer.questionId)}</code>: ${esc(shown(answer.value))}</li>`), "")}</details>` : ""}
    ${questions.length ? `<form class="a4-form">${fields.join("")}${actionButton("Save answers", "answers", allowed.ask)}</form>`
      : `<p class="muted">No questions are registered for this stage yet.</p>`}
    <h4>Understand</h4>
    <div class="row wrap">${actionButton("Run Understand", "understand", allowed.understand)}</div>
    ${reflectionHtml(reflection, allowed)}
    <h4>Explain</h4>
    <div class="row wrap"><select name="level">${LEVELS.map((level) => `<option value="${level}">${stageTitle(level)}</option>`).join("")}</select>
      ${actionButton("Explain at this level", "explain", allowed.explain)}</div>
    ${explanation ? `<p class="muted">Explanation at the ${esc(explanation.level)} level, as Studio returned it.</p>${studioJson(explanation.data)}` : ""}`;
}

export function renderSpecEditor(ctx) {
  const { revision, allowed, project, stage } = ctx;
  if (stage !== project.stage) {
    // Another stage's view: the head revision belongs to the project's current stage, so it is shown, never proposed here.
    return `<p class="muted">${esc(stageTitle(stage))} is not this project's current stage (${esc(stageTitle(project.stage))}).
      ${revision ? `This is r${esc(revision.revisionNo)}${revision.stage ? `, a ${esc(stageTitle(revision.stage))} specification` : ""}, shown read-only.` : "No specification yet."}
      Propose from the ${esc(stageTitle(project.stage))} view.</p>${revision ? studioJson(revision.spec ?? {}) : ""}`;
  }
  return `<p class="muted">Editing after Propose creates a new revision${revision ? ` (current r${esc(revision.revisionNo)},
    spec <code>${esc(revision.specDigest)}</code>)` : ""}. ${RETAINED}</p>
    <textarea name="spec" rows="14" spellcheck="false">${esc(JSON.stringify(revision?.spec ?? {}, null, 2))}</textarea>
    <div class="row wrap">${actionButton("Propose this specification", "propose", allowed.propose)}</div>`;
}

export function renderBuildCard(ctx) {
  return `<p class="muted">${TRUTH.admission}. With no producer registered for this stage, what you write here is recorded
    as a self-reported implementation output.</p><textarea name="content" rows="4"></textarea>
    <div class="row wrap">${actionButton("Build", "build", ctx.allowed.build)}</div>`;
}

export function renderReviewCard(ctx) {
  return `<p class="muted">Human findings are recorded as self-reported; AMC's own checks appear in the Integrity panel.</p>
    <textarea name="content" rows="4"></textarea><div class="row wrap">${actionButton("Review", "review", ctx.allowed.review)}</div>`;
}

/** One thread per stage-qualified card id (`aspire:specification`), the key a4.js posts and presence uses. */
export function renderComments(cardId, comments) {
  const rows = comments.filter((comment) => comment.cardId === cardId).map((comment) => `<li>
    <span class="pill">SELF_REPORTED</span> <strong>${esc(comment.authorUsername ?? comment.authorKey)}</strong>
    <span class="muted">${time(comment.ts)}</span><div>${typeof comment.body === "string" ? esc(comment.body)
      : `<span class="muted">Text not returned by Studio</span> ${codes(comment.reasonCodes)}`}</div></li>`);
  return `<details class="a4-comments"${rows.length ? " open" : ""}><summary>Discussion (${rows.length})</summary>${list(rows, "No comments yet.")}
    <textarea name="comment" rows="2" maxlength="${COMMENT_MAX_BYTES}"></textarea>
    <button type="button" data-a4-action="comment">Comment</button>
    <p class="muted">Discussion, never evidence; up to 8 KiB. ${RETAINED}</p></details>`;
}

export function renderCard(card, ctx, comments) {
  let body;
  try { body = card.render(ctx); }
  catch (error) { body = `<p class="status-bad">This card could not render: ${esc(error?.message ?? error)}</p>`; }
  return `<section class="card a4-card" data-card="${esc(card.id)}"><h4>${esc(card.title)}</h4>${body}${renderComments(`${ctx.stage}:${card.id}`, comments)}</section>`;
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

function itemRow(item, allowed) {
  const ack = item.acknowledged;
  return `<li><code>${esc(item.id)}</code> <code>${esc(item.status)}</code>${item.kind ? ` <span class="chip">${esc(item.kind)}</span>` : ""}
    ${codes(item.reasonCodes)}${ack ? `<div class="muted">Acknowledged by ${esc(ack.by)} until ${time(ack.expiresTs)}: ${esc(ack.reason)};
      still ${esc(item.status)}</div>` : ""}${nextActionHtml(item.nextAction)}${
    !ack && item.status === "WAITING" && allowed.acknowledge?.allowed === true
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

/** Four lane columns and, beside them, the Integrity panel: AMC's own checks, no claim badge, report verbatim. */
export function renderLanes(readiness) {
  const lanes = LANES.map(([lane, title]) => `<section class="card a4-lane"><h4>${title}</h4>${list(readiness.items
    .filter((item) => item.section === lane).map(laneItem), "Nothing recorded.")}</section>`).join("");
  const checks = readiness.items.filter((item) => item.section === "integrity").map((item) => `<details><summary><code>${esc(item.id)}</code>
    <code>${esc(item.status)}</code> ${codes(item.reasonCodes)}</summary><pre class="scroll">${esc(JSON.stringify(item.report, null, 2))}</pre></details>`);
  return `<div class="a4-lanes"><div class="a4-lane-grid">${lanes}</div><section class="card a4-integrity"><h4>Integrity</h4>
    <p class="muted">Integrity of bytes; not evidence about the agent. ${TRUTH.signatures}.</p>
    <p><code>valid: ${esc(readiness.integrity.valid)}</code> ${codes(readiness.integrity.reasonCodes)}</p>${checks.join("")}</section></div>`;
}

const STAGE_GATES = new Set(["direction", "completion"]);
const isLive = (gate) => !gate.supersededBy && (gate.quorum?.status === "PENDING" || gate.quorum?.status === "QUORUM_MET");

/**
 * The open, met and superseded direction/completion gates of one stage; a4.js reads the same selection when it posts a
 * decision. `policy` gates (opened at the project's stage) are never among them: this page does not show the proposed
 * gate policy, so it lists the live ones only to say they are decided elsewhere.
 */
export function currentGates(gates, stage) {
  const own = gates.filter((gate) => gate.stage === stage && STAGE_GATES.has(gate.gate));
  const live = own.filter((gate) => !gate.supersededBy);
  return { open: live.filter((gate) => gate.quorum?.status === "PENDING").at(-1) ?? null,
    met: live.filter((gate) => gate.quorum?.status === "QUORUM_MET").at(-1) ?? null,
    stale: own.filter((gate) => gate.supersededBy), policy: gates.filter((gate) => gate.gate === "policy" && isLive(gate)) };
}

/**
 * The gate's open seq (the GATE_REQUESTED seq P1-57's decide path compares `expectedGateSeq` with), read only from
 * `requestedSeq`: a generic `seq` could be a decided or superseding seq. null when Studio did not publish it.
 */
export function gateSeq(gateView) {
  const value = gateView?.requestedSeq;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** What a decision binds: the gate and readiness the approvals bar showed. a4.js pins the first one it renders. */
export const gateReview = (gate, readiness) => (gate ? { gateId: gate.gateId, bindingDigest: gate.bindingDigest,
  revisionNo: gate.revisionNo, readinessBindingDigest: readiness.bindingDigest } : null);
export const sameReview = (a, b) => a !== null && b !== null && a.gateId === b.gateId && a.bindingDigest === b.bindingDigest
  && a.readinessBindingDigest === b.readinessBindingDigest;

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

export function renderApprovalsBar(ctx) {
  const { readiness, gates, stage, allowed, gateChange } = ctx;
  const { open, met, stale, policy } = currentGates(gates, stage);
  const gate = open ?? met;
  const staleCodes = new Map(readiness.staleApprovals.map((row) => [row.decisionId, Array.isArray(row.reasonCodes) ? row.reasonCodes : []]));
  const shownIds = new Set(gate?.decisions.map((decision) => decision.decisionId) ?? []);
  const pinned = (offer) => (gateChange ? held(GATE_CHANGED) : offer);
  const history = stale.flatMap((old) => old.decisions.map((decision) => `<li><s>${esc(decision.username)} <code>${esc(decision.decision)}</code></s>
    bound to r${esc(old.revisionNo)}</li>`));
  const otherStale = readiness.staleApprovals.filter((row) => !shownIds.has(row.decisionId))
    .map((row) => `<li>${strikeIfStale(`<code>${esc(row.decisionId)}</code>`, staleCodes.get(row.decisionId))} ${codes(row.reasonCodes)}</li>`);
  return `<section class="card a4-approvals"><h4>Approvals</h4>${gateChange ? gateChangeBanner(gateChange) : ""}
    ${gate ? `<p><code>${esc(gate.gate)}</code> gate r${esc(gate.revisionNo)} · <code>${esc(gate.quorum.status)}</code> ·
      ${esc(gate.quorum.approvals)} of ${esc(gate.quorum.required)} required approvals</p>
      <p class="muted">Valid while the specification and resources are unchanged. ${TRUTH.vote}.</p>
      ${gate.excludedKeys.length ? `<p>Excluded from deciding (separation of duties): ${codes(gate.excludedKeys)}</p>` : ""}
      ${list(gate.decisions.map((decision) => decisionRow(decision, staleCodes.get(decision.decisionId))), "No decisions yet.")}`
      : `<p class="muted">No open gate for this stage.</p>`}
    ${policy.length ? `<p class="muted">${POLICY_ELSEWHERE}: ${policy.map((row) => `<code>${esc(row.gateId)}</code> <code>${esc(row.quorum.status)}</code>`).join(", ")}.</p>` : ""}
    ${history.length || otherStale.length ? `<details data-a4-open="stale-decisions"><summary>Stale decisions</summary>${list([...history, ...otherStale], "")}</details>` : ""}
    <label>Reason <input name="reason" maxlength="2000" /></label>
    <div class="row wrap">
      ${actionButton("Approve", "approve", open ? pinned(allowed.decide) : null)}
      ${actionButton("Request changes", "request-changes", open ? pinned(allowed.requestChanges) : null)}
      ${actionButton("Hold", "hold", allowed.hold)}
      ${actionButton("Request direction approval", "request-direction", allowed.requestGate)}
      ${actionButton("Request completion approval", "request-completion", allowed.requestGate)}
      ${actionButton("Complete stage", "complete", stage === "activate" ? held(ACTIVATE_COMPLETE) : met ? pinned(allowed.progress) : null)}
    </div>
    <details><summary>More</summary><div class="row wrap">${actionButton("Deny", "deny", open ? pinned(allowed.decide) : null)}
      ${allowed.resume ? actionButton("Resume", "resume", allowed.resume) : ""}</div></details></section>`;
}

export function renderMembers(ctx) {
  const { project, members, readiness } = ctx;
  const roles = ["builder", "reviewer", "approver", "viewer", "owner"];
  const candidates = Array.isArray(members?.candidates) ? members.candidates : [];
  return `<section class="card"><h4>Members</h4>
    ${list(project.members.map((member) => `<li>${esc(member.username)} <code>${esc(member.authSource)}</code> ${codes(member.roles)}</li>`), "No members.")}
    ${readiness.identityCheck === "session_record" ? `<p><code>IDENTITY_CHECK_LIMITED</code> Host-mode roles come from session records, not a live check.</p>` : ""}
    ${members?.limited === true ? `<p class="muted">Host mode: candidates come from tracked session records, so this list may be incomplete.</p>` : ""}
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

export function renderConflict(conflict) {
  return `<section class="card a4-conflict"><h4>The specification changed while you were editing</h4>
    <p>The head is r${esc(conflict.headRevisionNo)}; you started from r${esc(conflict.baseRevisionNo)}. Changes on the head:</p>
    ${conflict.theirs.length ? renderPromptDiffViewer({ status: "ok", changes: conflict.theirs }) : `<p class="muted">No specification changes on the head.</p>`}
    <p>Your changes:</p>${renderPromptDiffViewer({ status: "ok", changes: conflict.mine })}
    <div class="row wrap"><button type="button" data-a4-action="apply-on-top">Apply my changes on top</button>
      <button type="button" class="secondary" data-a4-action="reload">Reload</button></div></section>`;
}

/** Structural JSON diff: one row per differing leaf; arrays compare whole. */
export function jsonDiff(before, after, path = []) {
  if (isObject(before) && isObject(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => jsonDiff(before[key], after[key], [...path, key]));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, before, after }];
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Applies jsonDiff rows onto another spec ("apply my changes on top"); a missing `after` deletes the key. */
export function applyChanges(base, changes) {
  let out = structuredClone(isObject(base) ? base : {});
  for (const { path, after } of changes) {
    if (path.some((key) => UNSAFE_KEYS.has(key))) throw new Error("The specification uses a reserved key name.");
    if (path.length === 0) { out = structuredClone(after); continue; }
    let node = out;
    for (const key of path.slice(0, -1)) { if (!isObject(node[key])) node[key] = {}; node = node[key]; }
    if (after === undefined) delete node[path.at(-1)];
    else node[path.at(-1)] = structuredClone(after);
  }
  return out;
}

// P1-52: validateNativeTaskPoll (nativeTasks.js) is exported, but it validates the native-task view (task, truncated,
// event kinds), not A4's { events, nextCursor, firstCursor, droppedEvents, head, presence }. This copy keeps its refusals:
// a malformed or oversized page, a cursor or event order that moves backwards, and a head that regresses or does not
// name this project (a missing projectId counts as a mismatch).
const POLL_EVENT_BYTES = 2 * 1024 * 1024;
export function validateA4Poll(value, current, cursor) {
  const int = (number) => Number.isSafeInteger(number) && number >= 0;
  if (!isObject(value) || !Array.isArray(value.events) || !Array.isArray(value.presence) || !int(value.nextCursor)
    || !int(value.firstCursor) || !int(value.droppedEvents) || !isObject(value.head) || !int(value.head.headSeq)
    || value.events.length > 512 || value.presence.length > 256
    || new TextEncoder().encode(JSON.stringify(value.events)).byteLength > POLL_EVENT_BYTES) {
    throw new Error("Studio returned an unsupported A4 update. No updates were applied.");
  }
  if (value.head.projectId !== current.projectId || value.head.headSeq < current.headSeq) {
    throw new Error("The project head moved backwards or changed identity. No updates were applied; reload the page.");
  }
  if (value.nextCursor < cursor || value.firstCursor > value.nextCursor + 1) {
    throw new Error("The event cursor moved backwards. No updates were applied; reload the page.");
  }
  let previous = 0;
  for (const event of value.events) {
    if (!isObject(event) || !int(event.cursor) || event.cursor <= previous || event.cursor < value.firstCursor || event.cursor > value.nextCursor) {
      throw new Error("Studio returned out-of-order A4 updates. No updates were applied.");
    }
    previous = event.cursor;
  }
  return { head: value.head, nextCursor: value.nextCursor, events: value.events.filter((event) => event.cursor > cursor),
    presence: value.presence.filter((row) => isObject(row) && typeof row.username === "string")
      .map((row) => ({ username: row.username, card: row.card ?? row.cardId ?? "" })) };
}
