// A4 Studio renderers (P1-58, design §11). Pure: data in, HTML out. Every server string goes through esc(). Each section
// says what it means in plain words (a4Plain.js); status codes, reason codes and claim kinds stay as Studio returned them,
// unchanged, under "Show the record" in that section.
import { renderEvidenceRefList } from "./components/evidenceRefList.js";
import { renderPromptDiffViewer } from "./components/promptDiffViewer.js";
import { QUESTION_LABELS, questionDisplay } from "./a4Questions.js";
import { exclusionLine, PRACTICE_CHOICE } from "./a4Who.js";
import { cardLabel, codes, esc, isObject, list, shown, stageTitle, time } from "./a4Html.js";
import { STAGE_PLAIN, STEP_PLAIN, code, itemLine, itemTitle, record, say, sayCode, when } from "./a4Plain.js";
import { renderOutline } from "./a4Outline.js";
export { clashingChanges, jsonDiff, mergeOnTop, presenceRows, renderConflict, renderPresence, validateA4Poll } from "./a4Sync.js";

export { esc, STAGE_PLAIN, STEP_PLAIN };

export const STAGES = ["aspire", "assemble", "adapt", "activate"];
const STEPS = ["asked", "understood", "explained", "proposed", "direction_approved", "built", "reviewed", "completion_approved"];
export const STEP_TITLES = { asked: "Ask", understood: "Understand", explained: "Explain", proposed: "Propose",
  direction_approved: "Direction approved", built: "Build", reviewed: "Review", completion_approved: "Completion approved" };
/** What a project at each part needs next, in one sentence (Home's "Continue" card). */
export const STEP_NEXT = { asked: "Next: answer the questions, then let AMC say back what it understood.",
  understood: "Next: let AMC explain the choices it will make.", explained: "Next: let AMC draft the plan, then review it.",
  proposed: "Next: a second person approves the plan before anything is built.", direction_approved: "Next: build it.",
  built: "Next: review what was built.", reviewed: "Next: a second person gives the final approval for this step.",
  completion_approved: "This step is approved. Next: move on to the next step." };
const LANES = [["recommendation", "Recommendation"], ["implementation", "Implementation"], ["observed", "Observed"],
  ["verified", "Independently reviewed"]];
const LEVELS = ["novice", "practitioner", "expert"];

/** Truth copy, verbatim from design §11. */
export const TRUTH = {
  vote: "A recorded vote does not mean the action has run",
  admission: "Admission is not task completion",
  selfApproved: "Approved by the author; not an independent review",
  experimental: "Experimental regulatory content, drafted by AI; no qualified expert has reviewed it yet",
  recorded: "Recorded: what the operator stated. Checked: what AMC's own probe found",
  signatures: "A signature shows who wrote this and that it is unchanged, not that it is true",
  twoUsers: "Two local users are not evidence of two people"
};
// LIVE-UX-04: the notice says how to turn the preview back on (D-20 as amended 2026-11-14: on unless AMC_A4_PREVIEW=0).
const PREVIEW_NOTICE = "This Studio was started with `AMC_A4_PREVIEW=0`, which turns agent projects off. In the workspace folder, stop "
  + "Studio with `amc down`, then start it without that setting (macOS/Linux: `AMC_A4_PREVIEW=1 amc up`; PowerShell: "
  + "`$env:AMC_A4_PREVIEW=\"1\"; amc up`). A running Studio keeps the environment it started with.";
/** PREVIEW_NOTICE with each `command` in <code>. */
export const previewNoticeHtml = () => esc(PREVIEW_NOTICE).replace(/`([^`]+)`/g, "<code>$1</code>");
export const COMMENT_MAX_BYTES = 8 * 1024;
// Understand, Explain, Build, Review and comments go to the project's encrypted blob store (P1-57 writeStageOutput, the
// comment path); a proposal's spec and the answers are written as they are into the a4_revisions record.
const RETAINED = "Pasted text is retained until the project's blob key is destroyed.";
const IN_RECORD = "This is stored as written in the project's record, not in its encrypted blob store, so destroying the project's blob key does not erase it. Do not paste personal data or secrets here.";


/**
 * A disabled button names Studio's reason codes; Studio re-checks every action, so this is a convenience only. `held`
 * builds the one other kind of disabled state: a page-side hold whose note says why (for example, the gate changed).
 */
let notNow = null; // while collectNotNow renders: the actions that cannot be taken now, each with its reason in words
export function actionButton(label, action, allowed, attributes = "") {
  const ok = allowed?.allowed === true;
  const why = allowed?.reasonCodes?.length ? reasonsText(allowed.reasonCodes) : allowed?.note ?? "Not available at this point.";
  const button = `<button type="button" data-a4-action="${esc(action)}" ${attributes}${ok ? "" : ` disabled title="${esc(why)}"`}>${esc(label)}</button>`;
  if (ok || notNow === null) return button;
  // A button on one row (an answer, an item) keeps its place and says why beside it; any other moves to the card's More list.
  if (/data-(question|item|attempt|row)=/.test(attributes)) return `${button} <small class="muted">${esc(why)}</small>`;
  const named = /aria-label="([^"]*)"/.exec(attributes)?.[1];
  notNow.push(`<li>${button}${named ? ` <span class="muted">${named}:</span>` : ""} <span class="muted">${esc(why)}</span></li>`);
  return "";
}
/** Renders `render()`, collecting each action it cannot offer now (actionButton): returns the HTML and the list of those actions. */
function collectNotNow(render) {
  const outer = notNow;
  notNow = [];
  try {
    const html = render();
    return { html, rows: notNow };
  } finally {
    notNow = outer;
  }
}
const notNowList = (rows) => (rows.length ? `<p class="muted">Not open now, and why:</p><ul class="a4-rows a4-not-now">${rows.join("")}</ul>` : "");

/**
 * What each reason code a disabled action can carry (readiness.allowed and this page's own holds) asks the user to do, in
 * plain words. A lowercase code is a readiness item's id. The code itself follows in parentheses.
 */
const REASON_TEXT = {
  A4_STEP_ORDER: "Not yet: finish the earlier steps of this stage first.",
  A4_GATE_OPEN: "An approval request is already open for this step; approvers decide it in the Approvals card.",
  A4_GATE_DENIED: "This revision was denied: save an answer under Ask to start a new revision.",
  SOD_VIOLATION: "You cannot approve this yourself (separation of duties): another approver must. You may still deny it.",
  PRINCIPAL_NOT_MEMBER: "You are not a member of this project with this role yet: a project owner adds you on the Members card (adding a member cancels an open approval request, which is then asked again).",
  PRINCIPAL_ROLE_INSUFFICIENT: "Your workspace role does not allow this action: a workspace owner can change your roles.",
  PRINCIPAL_UNRESOLVED: "This step issues a lease in your name, so it needs a local user account: sign in as one.",
  ADMIN_TOKEN_REFUSED: "Sign in as a user: the admin token cannot act on agent projects.",
  A4_INTEGRITY_FAILED: "The project's record failed its integrity check: see the Integrity panel.",
  RETIRED: "This project is retired.",
  READ_ONLY_MODE: "Studio is running read-only.",
  FREEZE_ACTIVE: "The workspace is frozen: nothing can change until the freeze is lifted.",
  ON_HOLD: "The project is on hold: an owner resumes it.",
  NOT_ON_HOLD: "The project is not on hold.",
  GATE_NOT_OPEN: "There is no open approval request to decide.",
  GATE_PENDING: "Waiting for approvers: the approval request has not reached its quorum yet.",
  GATE_ROLE_NOT_ALLOWED: "This approval request does not accept decisions from your role.",
  GATE_EXPIRING: "This approval request is about to expire: request it again.",
  A4_DUPLICATE_DECISION: "You have already decided this approval request.",
  IDENTITY_CHECK_LIMITED: "A regulated project takes decisions only from local user accounts, not host sessions.",
  "resources.current": "The agent's resources changed since this revision was recorded: save an answer under Ask to record a new revision.",
  plan_unresolved: "Some requirements of the plan depend on facts that are still unknown: answer them under Ask, or an owner acknowledges them (a regulated project cannot)."
};
export function reasonText(code) {
  return REASON_TEXT[code] ?? (/^[a-z]/.test(String(code)) ? "A requirement under Missing requirements needs attention first."
    : "Studio does not allow this action right now: see Missing requirements.");
}
export const reasonsText = (codes) => `${[...new Set(codes.map(reasonText))].join(" ")} (${codes.join(", ")})`;

export const held = (note) => ({ allowed: false, reasonCodes: [], note });
export const GATE_CHANGED = "The gate changed while you were on this page";
export const ACTIVATE_COMPLETE = "Activate's release and deployment approval are completed on the Release card, which shows each lease token once";


export function holdBanner(project) {
  return project?.hold ? `<div class="card banner a4-hold">On hold${project.holdReason ? `: ${esc(project.holdReason)}` : ""}</div>` : "";
}

/** A practice project says so on every page, and says when a second person ended it (Studio's `practiceActive`). */
export function practiceBanner(project) {
  if (project?.practice !== true) return "";
  return project.practiceActive === true
    ? `<div class="card banner a4-practice"><strong>Practice project.</strong> You may approve your own work here. Each approval you give yourself
      is recorded and shown as self-approved. Do not use a practice project for real work.</div>`
    : `<div class="card banner a4-practice"><strong>This was a practice project.</strong> More than one person can sign in to this workspace now,
      so nobody approves their own work here any more, and the project follows the rules its risk level calls for.</div>`;
}

/**
 * The start form's "Who approves?" choice (A4-05). Every Industry Pack is high risk or above, so a project started from
 * a pack is regulated: a second person approves each step. A practice project is offered when Studio says one person
 * alone may open one (`start` is GET /options' workspace.start); otherwise its reason is shown.
 */
export function approverChoiceHtml(start) {
  if (!isObject(start)) return "";
  const practice = start.practiceAvailable === true;
  return `<fieldset class="a4-approvers"><legend>Who approves each step?</legend>
    <label><input type="radio" name="practice" value="" checked /> A second person (needed for real work)</label>
    <p class="muted">Every Industry Pack is high risk or above, so a project started from a pack is governed as regulated: someone other than
      you approves each step, and nobody approves their own work. Add that person with Add a person, or on the project's Members card.</p>
    <label><input type="radio" name="practice" value="yes"${practice ? "" : " disabled"} /> Just me, as practice (for learning AMC alone)</label>
    <p class="muted">${practice ? PRACTICE_CHOICE : esc(start.practiceRefusal ?? "A practice project is not offered here.")}</p>
    </fieldset>`;
}

export function stageBanner(stage) {
  if (stage === "adapt") return `<div class="card banner">${TRUTH.experimental}</div>`;
  if (stage === "activate") return `<div class="card banner">${TRUTH.recorded}</div>`;
  return "";
}

/** Studio's role check refuses a create from anyone without OPERATOR or OWNER (accessPolicy), and A4 refuses it in a read-only workspace. */
export const CREATE_NEEDS = "Starting an agent project needs a workspace OPERATOR or OWNER role in a workspace that is not read-only";

/**
 * The start form: a name, the industry and one button; every other field under "More options". On Home (`home`) the form
 * has no disclosure around it and asks for the plainest explanation level.
 */
export function renderCreateForm(open, industryHtml = "", { home = false, start = null } = {}) {
  const form = `<form id="${home ? "a4HomeForm" : "a4CreateForm"}" class="a4-form" novalidate>
      ${industryHtml}
      ${approverChoiceHtml(start)}
      <label>Project name <input name="name" required maxlength="200" placeholder="For example: Invoice triage helper" aria-describedby="${home ? "a4HomeNameHint" : "a4NameHint"}" /></label>
      <p class="muted" id="${home ? "a4HomeNameHint" : "a4NameHint"}">A short name your team will recognise. It is stored in the project's record.</p>
      ${home ? '<input type="hidden" name="expertise" value="novice" />' : `<details class="a4-more"><summary>More options</summary>
      <label>Existing agent id (optional) <input name="agentId" maxlength="128" pattern="[a-z0-9][a-z0-9_\\-]{0,127}" placeholder="Leave empty to create a new agent"
        aria-describedby="a4AgentHint" /></label>
      <p class="muted" id="a4AgentHint">Only if this agent already exists in AMC: its id, in lowercase letters, digits, _ and -, for example invoice-helper.
        Leave it empty and AMC creates a new agent for the project.</p>
      <label>How much detail do you want in explanations? <select name="expertise">${LEVELS.map((level) => `<option value="${level}">${stageTitle(level)}</option>`).join("")}</select></label>
      <p><button type="button" class="secondary" data-a4-example-project>Use an example</button></p>
      <p class="muted">Use an example fills a sample project, marked (sample) in its name, so the records show it is sample data.</p></details>`}
      <p class="a4-form-error status-bad" role="alert" hidden></p>
      <div class="row wrap"><button type="submit" class="a4-primary">${home ? "Start building" : "Start an agent project"}</button></div>
    </form>`;
  return home ? form : `<section class="card" id="a4Create"${open ? "" : " hidden"}><h3>Start an agent project</h3>${form}</section>`;
}

export function renderProjectList(projects) {
  if (projects.length === 0) return "";
  return `<section class="card"><h3>Your agent projects</h3>${list(projects.map((project) => `<li>
    <a href="./a4Project?project=${encodeURIComponent(project.projectId)}"><strong>${esc(project.name)}</strong></a>
    <span class="chip" title="${esc(stageTitle(project.stage))}">${esc(STAGE_PLAIN[project.stage] ?? stageTitle(project.stage))}</span>
    <span class="chip" title="${esc(STEP_TITLES[project.step] ?? project.step)}">${esc(STEP_PLAIN[project.step] ?? project.step)}</span>
    ${project.readiness ? `<span>${sayCode("readinessStatus", project.readiness.status)}</span>` : ""}
    <span class="muted">agent <code>${esc(project.agentId)}</code> · r${esc(project.revisionNo)}</span>${holdBanner(project)}</li>`),
  "No agent projects yet.")}</section>`;
}

/** The page keeps the stage it opened on (a4.js); when the project is at another stage, it says so. */
export function movedNote(project, stage) {
  return stage === project.stage ? "" : `<p>The project is now at ${esc(say("stageState", project.stage))} ${code(stageTitle(project.stage))},
    ${esc(say("step", project.step))} ${code(STEP_TITLES[project.step] ?? project.step)}; this page shows ${esc(say("stage", stage))} ${code(stageTitle(stage))}.
    Open a stage above to work there.</p>`;
}

export function stageLinks(project, stage) {
  const id = encodeURIComponent(project.projectId);
  return `<div class="row wrap">${STAGES.map((name) => `<a class="button secondary" href="./a4Project?project=${id}&stage=${name}"${
    name === stage ? ' aria-current="page"' : ""}>${esc(STAGE_PLAIN[name])} ${code(stageTitle(name))}</a>`).join("")}</div>`;
}

/** The eight steps, in the shape renderHandholdingSteps takes. */
export function stepRows(project, stage) {
  const current = stage === project.stage ? STEPS.indexOf(project.step) : -1;
  return STEPS.map((step, index) => ({ title: `${STEP_PLAIN[step]} (${STEP_TITLES[step]})`,
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
  if (ctx.project.stage !== ctx.stage || (from !== null && !from.includes(ctx.project.step))) return refuse(offer, "A4_STEP_ORDER");
  return (route === "propose" && offer?.allowed === true && askHold(ctx)) || offer;
}
/**
 * The questions ask_complete lists (P1-59 askGapCodes): unanswered, stale (an answer they depend on changed since) and
 * invalid ones. Studio refuses Propose while any is listed (409 A4_NOT_READY).
 */
function askGaps(readiness) {
  const codes = (readiness?.items ?? []).find((item) => item.id === "ask_complete")?.reasonCodes ?? [];
  const of = (prefix) => codes.filter((code) => String(code).startsWith(prefix)).map((code) => String(code).slice(prefix.length));
  return { missing: of("ANSWER_MISSING:"), stale: of("ANSWER_STALE:"), invalid: of("ANSWER_INVALID:") };
}
const STALE_FIRST = "Confirm the answers marked \"needs confirming\" under Ask first";
function askHold(ctx) {
  const { missing, stale, invalid } = askGaps(ctx.readiness);
  const parts = [stale.length ? `confirm or change ${stale.join(", ")} (an answer they depend on changed)` : "",
    missing.length ? `answer ${missing.join(", ")}` : "", invalid.length ? `correct ${invalid.join(", ")}` : ""].filter(Boolean);
  return parts.length ? held(`Under Ask, ${parts.join("; ")} before proposing.`) : null;
}
/** Studio's content cap on Understand, Explain, Build and Review (P1-57, src/a4/a4RouterStages.ts). */
const CONTENT_MAX = 65_536;

const NO_REFLECTION = "No statement recorded from this page yet";
export const RECORDED_CURRENT = "Studio holds AMC's understanding of your current answers (shown on this page). If it is right, confirm it; if not, change your answers and run Understand again.";
export const NO_PRODUCER = "No producer is registered for this stage yet, so Studio records what you write here as your own self-reported statement, not as AMC's.";
// Studio's receipt stays readable but folded under "Show the record", below the plain summary (A4-13).
const studioJson = (value) => record(`<pre class="scroll">${esc(JSON.stringify(value ?? null, null, 2))}</pre>`, "studio");
/**
 * What the member sent and Studio's receipt for it, verbatim: with no producer registered, nothing here is AMC's. With
 * nothing sent (a stage whose producer ran), the receipt is the step's output, never labelled as the member's statement.
 */
const recorded = (what, entry) => `<p class="muted">Studio recorded ${entry.text ? what : "this step's output"} as self-reported${Number.isSafeInteger(entry.headSeq)
  ? ` at seq ${esc(entry.headSeq)}` : ""}. ${entry.text ? `What you sent:</p><p>${esc(entry.text)}</p>` : "You sent no statement.</p>"}${studioJson(entry.data)}`;

/**
 * Whether a statement this page recorded (Understand's or Explain's; `headSeq` is the head Studio answered) still binds the
 * project after a load moved it from `before` to `after`: kept at the same stage while no revision was recorded since, or
 * while the only revision recorded is the statement's own (Understand records one: the head has not passed the statement).
 */
export const statementHolds = (statement, before, after) => statement != null && after.stage === before.stage
  && (after.revisionNo === before.revisionNo || (Number.isSafeInteger(statement.headSeq) && after.headSeq <= statement.headSeq));

/** Understand's recorded statement; Confirm and Correct stay disabled until one is shown here. */
function reflectionHtml(reflection, understand, recordedCurrent = false) {
  const bound = Number.isSafeInteger(reflection?.headSeq);
  // After a reload the page has no statement of its own, but Studio's recorded understanding was made for the current answers
  // (a4Start.understandingIsCurrent): Yes binds the head shown, and Studio refuses it if the project moved or the answers changed.
  const offer = bound || (!reflection && recordedCurrent) ? understand
    : held(reflection ? "Studio did not say which head this statement was recorded at" : NO_REFLECTION);
  return `${reflection ? `${recorded("your statement", reflection)}<p class="muted">Yes and Correct bind this head: if the project
    changes first, Studio refuses them and you run Understand again.</p>` : recordedCurrent ? `<p class="muted">${RECORDED_CURRENT}</p>`
    : `<p class="muted">${NO_REFLECTION}. Run Understand to record your statement before you confirm it.</p>`}
    <div class="row wrap">${actionButton("Yes, that's it", "confirm", offer)} ${actionButton("Correct this", "correct", offer)}</div>
    <p class="muted">Correct this sends nothing: change your answers or your statement, then run Understand again.</p>`;
}

export const ANSWER_CHANGED = "An answer you are editing was changed and saved since you began (by another member, or by you in another tab); discard your edits to see the saved answer";
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
    const shownDisplay = questionDisplay(question, question.example);
    // Adapt's fact questions take catalog terms: name them, so nobody has to guess (an unknown term is refused).
    const termsHelp = !Array.isArray(question.terms) ? "" : question.terms.length
      ? ` Choose from: ${question.terms.join(", ")}. Or write unknown.` : " The catalog lists no terms for this yet, so leave it empty.";
    const display = { ...shownDisplay, help: `${shownDisplay.help}${termsHelp}`.trim() };
    const helpId = `a4q-${esc(question.id)}-help`;
    return `<label><span class="a4-q-label">${esc(display.label)}</span>${question.required ? " (required)" : " (optional)"}${json ? " (JSON)" : ""}
      ${display.help ? `<small class="a4-q-help muted" id="${helpId}">${esc(display.help)}</small>` : ""}
      <textarea name="${esc(question.id)}" rows="2"${display.help ? ` aria-describedby="${helpId}"` : ""}${json ? " data-json" : ""}${display.example ? ` placeholder="${esc(display.example)}"` : ""}>${esc(answerText(answers, question.id))}</textarea></label>`;
  };
  const answerRow = (answer) => `<li><span title="${esc(answer.questionId)}">${esc(QUESTION_LABELS[answer.questionId]?.[0] ?? answer.questionId)}</span>
    <small class="muted" title="${esc(answer.source)}">${esc(say("answerSource", answer.source))}</small>: ${esc(shown(answer.value))}${
    answer.source === "user" ? "" : ` ${actionButton("Confirm", "confirm-answer", ask, `data-question="${esc(answer.questionId)}"`)}`}</li>`;
  const notMine = answers.filter((answer) => answer.source !== "user").length;
  const change = questions.filter((question) => answered.has(question.id));
  // An answer goes stale when one it depends on changes (Understand carrying a value from an earlier stage, too). Saving
  // the same value again is what confirms it: Studio records it on a new revision with the new dependency digest.
  const stale = askGaps(ctx.readiness).stale.filter((id) => answered.has(id));
  const prompt = (id) => QUESTION_LABELS[id]?.[0] ?? questions.find((question) => question.id === id)?.prompt ?? id;
  const staleBanner = stale.length ? `<div class="card banner"><p>${stale.length} answer(s) need confirming because an answer they depend on
    changed. Confirming records a new revision and returns this stage to Ask, so Understand runs again before you confirm it.</p>
    <ul class="a4-rows">${stale.map((id) => `<li>${esc(prompt(id))} <code>${esc(id)}</code>: ${esc(answerText(answers, id))}
      ${actionButton("Still correct — confirm", "confirm-answer", ask, `data-question="${esc(id)}"`)}</li>`).join("")}</ul>
    <p class="muted">Or change them under "Change my answers".</p></div>` : "";
  const confirmOffer = stale.length && understand?.allowed === true ? held(`${STALE_FIRST}: confirming them restarts this stage at Ask.`) : understand;
  return `${staleBanner}<h4>Ask</h4>
    ${answers.length ? `<details data-a4-open="answers"><summary>${answers.length} answered (${notMine} carried or inferred);
      ${open.length} still need an answer</summary>${list(answers.map(answerRow), "")}</details>` : ""}
    <form class="a4-form" data-a4-answers>${open.map(field).join("")}${change.length
      ? `<details data-a4-open="change-answers"><summary>Change my answers</summary>${change.map(field).join("")}</details>` : ""}
      ${answerDrift ? `<p class="status-bad">${ANSWER_CHANGED}.</p>` : ""}
      <p class="muted">${RESTARTS} ${IN_RECORD}</p>
      ${ctx.exampleOffered && open.length ? `<p class="muted">Not sure what to write? Each empty field shows an example. Use an example fills the empty
        fields with sample answers marked (sample), which you can change before saving.</p>` : ""}
      <div class="row wrap">${actionButton("Save answers", "answers", answerDrift ? held(ANSWER_CHANGED) : ask)}${ctx.exampleOffered && open.length
        ? ' <button type="button" class="secondary" data-a4-action="use-example">Use an example</button>' : ""}${answerDrift
        ? ` <button type="button" class="secondary" data-a4-action="discard-answers">Discard my answer edits</button>` : ""}</div></form>
    <h4>Understand</h4>
    <label>What this stage should achieve, in your words <textarea name="understanding" rows="3" maxlength="${CONTENT_MAX}"></textarea></label>
    <p class="muted">${NO_PRODUCER} ${RETAINED}</p>
    <div class="row wrap">${actionButton("Run Understand", "understand", understand)}</div>
    ${reflectionHtml(reflection, confirmOffer, ctx.understandingCurrent === true && ctx.project.stage === ctx.stage && ctx.project.step === "asked")}
    <h4>Explain</h4>
    <label>Your explanation <textarea name="explanation" rows="3" maxlength="${CONTENT_MAX}"></textarea></label>
    <p class="muted">${NO_PRODUCER} ${RETAINED}</p>
    <div class="row wrap"><select name="level" aria-label="Explanation level">${LEVELS.map((level) => `<option value="${level}">${stageTitle(level)}</option>`).join("")}</select>
      ${actionButton("Explain at this level", "explain", stepOffer(allowed.explain, ctx, "explain"))}</div>
    ${explanation ? recorded(`your explanation at the ${esc(explanation.level)} level`, explanation) : ""}`;
}

/** The part of a revision's spec a member edits: Studio carries `answers` itself and refuses a proposal naming them. */
export const editableSpec = (spec) => Object.fromEntries(Object.entries(isObject(spec) ? spec : {}).filter(([key]) => key !== "answers"));

/**
 * The top-level parts of `spec` that differ from `base`: what Propose sends. Studio builds the rest from the answers, and
 * an Adapt specification with its compiled plan is larger than the 256 KiB a request may carry, so echoing the whole
 * specification back failed every Adapt Propose.
 */
export const changedParts = (spec, base) => Object.fromEntries(Object.entries(isObject(spec) ? spec : {})
  .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(isObject(base) ? base[key] : undefined)));

export function renderSpecEditor(ctx) {
  const { revision, allowed, project, stage } = ctx;
  const outline = renderOutline(stage, ctx.stageRevision);
  if (stage !== project.stage) {
    // Another stage's view: the head revision belongs to the project's current stage, so it is shown, never proposed here.
    return `${outline}${record(`<p class="muted">${esc(stageTitle(stage))} is not this project's current stage (${esc(stageTitle(project.stage))}).
      ${revision ? `This is r${esc(revision.revisionNo)}${revision.stage ? `, a ${esc(stageTitle(revision.stage))} specification` : ""}, shown read-only.` : "No specification yet."}
      Propose from the ${esc(stageTitle(project.stage))} view.</p>${revision ? `<pre class="scroll">${esc(JSON.stringify(revision.spec ?? {}, null, 2))}</pre>` : ""}`, "spec")}`;
  }
  // After a reopen the stage has its own, older revision; the editor still starts from the head revision.
  const seeded = revision && revision.stage !== stage ? ` ${ctx.stageRevision ? `The newest ${esc(stageTitle(stage))} specification is
    r${esc(ctx.stageRevision.revisionNo)};` : `No ${esc(stageTitle(stage))} specification yet:`} the editor starts from the head revision
    r${esc(revision.revisionNo)}, ${revision.stage ? `the ${esc(stageTitle(revision.stage))} specification` : "whose stage Studio did not name"}.` : "";
  // P1-57 takes a proposal only at step `explained`; a re-proposal from `proposed` is not routed yet, so the way to a new
  // revision from there is Save answers (NOTES).
  const proposable = project.step === "explained";
  return `${outline}<p class="muted">${proposable ? "Propose drafts this plan from your answers. Someone who reads JSON can also edit the record below before proposing."
    : "To change this plan, change an answer under Ask and press Save answers: AMC records a new version and you run the steps again from there."}</p>
    ${record(`<p class="muted">${proposable ? "Editing after Propose creates a new revision"
    : `Studio takes a proposal only at step <code>explained</code>; this project is at <code>${esc(project.step)}</code>`}${revision
    ? ` (current r${esc(revision.revisionNo)}, spec <code>${esc(revision.specDigest)}</code>)` : ""}.${seeded}${proposable ? ""
    : " To change the specification from here, save an answer under Ask: that starts this stage's loop again at a new revision."} ${IN_RECORD}</p>
    <textarea name="spec" rows="14" spellcheck="false" aria-label="Specification (JSON)">${esc(JSON.stringify(editableSpec(revision?.spec), null, 2))}</textarea>
    <p class="muted">Answers are not edited here: they are recorded through Save answers.</p>`, "spec")}
    <div class="row wrap">${actionButton("Propose this specification", "propose", stepOffer(allowed.propose, ctx, "propose"))}${ctx.specDraft
      ? ` <button type="button" class="secondary" data-a4-action="reload">Discard my edits</button>` : ""}</div>`;
}

export function renderBuildCard(ctx) {
  return `<p class="muted">${TRUTH.admission}. With no producer registered for this stage, what you write here is recorded
    as a self-reported implementation output. ${RETAINED}</p><textarea name="content" rows="4" maxlength="${CONTENT_MAX}" aria-label="Build note"></textarea>
    <div class="row wrap">${actionButton("Build", "build", stepOffer(ctx.allowed.build, ctx, "build"))}</div>`;
}

export function renderReviewCard(ctx) {
  return `<p class="muted">Human findings are recorded as self-reported; AMC's own checks appear in the Integrity panel. ${RETAINED}</p>
    <textarea name="content" rows="4" maxlength="${CONTENT_MAX}" aria-label="Review findings"></textarea><div class="row wrap">${actionButton("Review", "review",
      stepOffer(ctx.allowed.review, ctx, "review"))}</div>`;
}

/**
 * One thread per stage-qualified card id (`aspire:specification`), the key a4.js posts and presence uses. Studio names a
 * comment's author by principal key only; a current member's key is shown as their username.
 * A comment whose signed body says it came through MCP (`via: "mcp"`) carries a VIA MCP pill.
 */
function renderComments(cardId, comments, members = []) {
  const names = new Map(members.map((member) => [member.principalKey, member.username]));
  const rows = comments.filter((comment) => comment.cardId === cardId).map((comment) => `<li>
    <span class="pill" title="SELF_REPORTED">self-reported</span>${comment.via === "mcp" ? ' <span class="pill" title="sent through MCP, a tool connection">VIA MCP</span>' : ""} <strong>${esc(names.get(comment.authorKey) ?? comment.authorKey)}</strong>
    <span class="muted">${when(comment.ts)}</span><div>${typeof comment.body === "string" ? esc(comment.body)
      : `<span class="muted">Text not returned by Studio</span> ${codes(comment.reasonCode ? [comment.reasonCode] : [])}`}</div></li>`);
  return `<details class="a4-comments" data-a4-open="discussion"${rows.length ? " open data-a4-default-open" : ""}><summary>Discussion (${rows.length})</summary>${list(rows, "No comments yet.")}
    <textarea name="comment" rows="2" maxlength="${COMMENT_MAX_BYTES}" aria-label="Comment on ${esc(cardLabel(cardId))}"></textarea>
    <button type="button" data-a4-action="comment" aria-label="Post a comment on ${esc(cardLabel(cardId))}">Comment</button>
    <p class="muted">Discussion, never evidence; up to 8 KiB. ${RETAINED}</p></details>`;
}

export function renderCard(card, ctx, comments) {
  let body;
  try {
    const { html, rows } = collectNotNow(() => card.render(ctx));
    body = `${html}${rows.length ? `<details class="a4-more-actions" data-a4-open="not-now"><summary>More (${rows.length} not open now)</summary>${notNowList(rows)}</details>` : ""}`;
  } catch (error) { body = `<p class="status-bad">This card could not render: ${esc(error?.message ?? error)}</p>`; }
  return `<section class="card a4-card" data-card="${esc(card.id)}"><h4>${esc(card.title)}</h4>${body}${renderComments(`${ctx.stage}:${card.id}`, comments, ctx.project.members)}</section>`;
}

/** The plan's part names a change path starts with, in words (spec.review.enforce.added reads "review"). */
const SPEC_PARTS = { answers: "the answers", brief: "the brief", build: "what was built", review: "the review", plan: "the plan",
  understanding: "what AMC understood", explanation: "the explanation", graph: "how the agent is put together" };
export function renderDifferences(diff, project) {
  if (project.revisionNo < 2) return `<p class="muted">This is the first version, so there is nothing to compare yet.</p>`;
  const changed = Array.isArray(diff?.changed) ? diff.changed : [];
  const parts = [...new Set(changed.map((row) => String(row?.path ?? "").split(".")[1]).filter(Boolean))].map((part) => SPEC_PARTS[part] ?? part);
  return `<p>${changed.length ? `${changed.length} change(s) from version ${esc(diff.from ?? project.revisionNo - 1)} to version ${esc(diff.to ?? project.revisionNo)}, in ${esc(parts.join(", "))}.`
    : "Nothing in the plan changed from the version before."}</p>${record(renderPromptDiffViewer(isObject(diff) ? { status: "ok", ...diff } : null), "diff")}`;
}

function nextActionHtml(next) {
  if (!isObject(next)) return "";
  const route = typeof next.route === "string" && /^\.?\/(?!\/)[\w\-./?=&%]*$/.test(next.route) ? next.route : null;
  // A member is added on this page's Members card; the CLI form (`amc a4 members`, with its session token file) is for the terminal.
  const members = typeof next.command === "string" && next.command.startsWith("amc a4 members ");
  return ` ${route ? `<a class="button secondary" href="${esc(route)}">${esc(next.label)}</a>` : `<strong>${esc(next.label)}</strong>`}${members
    ? " <span class=\"muted\">(on the Members card below)</span>" : typeof next.command === "string" ? ` <code>${esc(next.command)}</code> <button type="button"
      class="secondary" data-a4-copy="${esc(next.command)}" aria-label="Copy the command ${esc(next.command)}">Copy</button>` : ""}`;
}

/** The items Studio's acknowledgeItem accepts (ACKNOWLEDGEABLE_ITEMS, src/a4/a4Readiness.ts); any other is 400 INPUT_INVALID. */
const ACKNOWLEDGEABLE = new Set(["lineage.independent_approvals", "sod.self_provisioned", "regulatory_sources_status", "deployment.amc_check",
  "plan_unresolved", "path_supported", "unsupported_acknowledged", "context_probe_unavailable", "plan_activated"]);
/**
 * acknowledgeable (src/a4/a4Readiness.ts) as the item shows it at `stage`, the stage readiness was read for: plan_activated only
 * when deferred and mandatory (from Review on), plan_unresolved never when regulated, Activate's regulatory_sources_status
 * (D-21) only once mandatory (from Review on; Adapt's own is unchanged) and deployment.amc_check only once mandatory and
 * naming a receipt. Anything else is refused (409 A4_NOT_ACKNOWLEDGEABLE), so no button offers it.
 */
const acknowledgeable = (item, stage) => ACKNOWLEDGEABLE.has(item.id) && !item.reasonCodes.includes("REGULATED_READY_PLAN_ONLY")
  && (item.id !== "plan_activated" || (item.mandatory === true && item.reasonCodes.includes("PLAN_ACTIVATION_DEFERRED")))
  && (item.id !== "regulatory_sources_status" || stage !== "activate" || item.mandatory === true)
  && (item.id !== "deployment.amc_check" || (item.mandatory === true && item.reasonCodes.some((code) => code.startsWith("RECEIPT:"))));

/** A failed or lost effect's retry (readiness names the attempt and the route); disabled, with Studio's reasons, for anyone but an owner. */
function retryButton(item, allowed) {
  const attempt = item.id === "effects.failed" ? item.reasonCodes.find((code) => /^ATTEMPT:a4e_[0-9a-f]{32}$/.test(code)) : undefined;
  const route = /\/stages\/([a-z]+)\/effects\/([a-z0-9_.-]{1,128})\/retry$/.exec(item.nextAction?.route ?? "");
  return attempt && route ? ` ${actionButton("Retry", "retry-effect", allowed.retryEffect,
    `data-attempt="${esc(attempt.slice("ATTEMPT:".length))}" data-effect-stage="${esc(route[1])}" data-effect="${esc(route[2])}"`)}` : "";
}

/** An item as recorded: its id, status, kind, reason codes, acknowledgement and command, as Studio returned them. */
function itemRecord(item, nameFor) {
  const ack = item.acknowledged;
  return `<li><code>${esc(item.id)}</code> <code>${esc(item.status)}</code>${item.kind ? ` <span class="chip">${esc(item.kind)}</span>` : ""}
    ${codes(item.reasonCodes)}${ack ? `<div class="muted">Acknowledged by ${nameFor(ack.by)} until ${time(ack.expiresTs)}: ${esc(ack.reason)};
      still ${esc(item.status)}</div>` : ""}${typeof item.nextAction?.command === "string" ? ` <code>${esc(item.nextAction.command)}</code>` : ""}</li>`;
}

/** An item in words, with the way on: its next action, Retry for a failed effect, and Acknowledge where Studio takes one. */
function itemRow(item, allowed, stage, nameFor) {
  const ack = item.acknowledged;
  return `<li>${itemLine(item, false)}${ack ? `<div class="muted">${nameFor(ack.by)} acknowledged this until ${when(ack.expiresTs)}: ${esc(ack.reason)}.
      It is still ${esc(say("itemStatus", item.status))}.</div>` : ""}${nextActionHtml(item.nextAction)}${retryButton(item, allowed)}${
    !ack && item.status === "WAITING" && acknowledgeable(item, stage) && allowed.acknowledge?.allowed === true
      ? ` ${actionButton("Acknowledge", "acknowledge", allowed.acknowledge, `data-item="${esc(item.id)}"`)}` : ""}</li>`;
}

/** What this step still needs, in words; `nameFor(key)` names a principal key as HTML (nameOf). The items as recorded stay under "Show the record". */
export function renderMissing(readiness, stage, nameFor = esc) {
  const open = readiness.items.filter((item) => !["READY", "COMPLETE"].includes(item.status));
  const group = (mandatory, row) => list(open.filter((item) => item.mandatory === mandatory).map(row), "Nothing.");
  return `<p>This step is ${sayCode("readinessStatus", readiness.status)}.${nextActionHtml(readiness.nextAction)}</p>
    <h5>Needed before you go on</h5>${group(true, (item) => itemRow(item, readiness.allowed, stage, nameFor))}
    <h5>Good to have</h5>${group(false, (item) => itemRow(item, readiness.allowed, stage, nameFor))}
    ${record(`<p>Readiness <code>${esc(readiness.status)}</code></p><h4>Mandatory</h4>${group(true, (item) => itemRecord(item, nameFor))}
      <h4>Advisory</h4>${group(false, (item) => itemRecord(item, nameFor))}`, "missing")}`;
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
  const plainLane = ([lane]) => {
    const items = readiness.items.filter((item) => item.section === lane);
    const done = items.filter((item) => ["READY", "COMPLETE"].includes(item.status));
    const kept = refs.filter((ref) => ref.lane === lane);
    if (!items.length && !kept.length) return "";
    return `<h5>${esc(say("lane", lane))}</h5>${items.filter((item) => !done.includes(item)).map((item) => itemLine(item)).join("")}${done.length
      ? `<p class="muted">Done: ${esc(done.map((item) => itemTitle(item.id)).join("; "))}.</p>` : ""}${kept.length
      ? `<p class="muted">${kept.length} record(s) kept: ${esc([...new Set(kept.map((ref) => say("refKind", ref.refKind)))].join(", "))}.</p>` : ""}`;
  };
  const valid = readiness.integrity.valid === true;
  return `<section class="card a4-lanes"><h4>What is recorded so far</h4>
    <p class="muted">What AMC has recorded at this stage for version ${esc(revisionNo)}, and its own check of the project's record.</p>
    ${LANES.map(plainLane).join("") || "<p class=\"muted\">Nothing recorded yet.</p>"}
    <h5>${esc(say("lane", "integrity"))}</h5><p>${valid ? "AMC checked the project's record and found no problem."
      : "AMC checked the project's record and found a problem: open the record below and ask whoever runs this AMC to look at it."}
      This is about the record's bytes, not about the agent. ${TRUTH.signatures}.</p>
    ${record(`<p class="muted">Readiness items for this stage and the evidence refs Studio lists for r${esc(revisionNo)}, as recorded.</p>
    <div class="a4-lane-grid">${lanes}</div><section class="card a4-integrity"><h4>Integrity</h4>
    <p class="muted">Integrity of bytes; not evidence about the agent. ${TRUTH.signatures}.</p>
    <p><code>valid: ${esc(readiness.integrity.valid)}</code> ${codes(readiness.integrity.reasonCodes)}</p>${checks.join("")}</section>`, "lanes")}</section>`;
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
const POLICY_ELSEWHERE = "A gate-policy change is open. This page does not show the proposed policy, so it cannot be decided here";
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
/** A decision in words: who, what, when (the reader's time), and whether it still counts. */
function decisionWords(decision, reasonCodes = []) {
  return `<li>${esc(decision.username)} ${esc(say("decision", decision.decision))} on ${when(decision.ts)}${decision.selfApproved
    ? `. ${TRUTH.selfApproved}` : ""}${reasonCodes.includes("GATE_STALE") ? ". It no longer counts: something it covered changed since" : ""}.</li>`;
}

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
export function approveOffer(decide, gate, readiness, me, effect = false) {
  const key = typeof me?.userId === "string" ? `${readiness.identityCheck === "session_record" ? "WORKSPACE_ROUTER" : "LOCAL_USER"}:${me.userId}` : null;
  // An effect's request never takes self-approval (src/a4/a4Effects.ts effectApprovalOf: selfApprovalAllowed false).
  if (key === null || (readiness.selfApprovalAllowed === true && !effect) || !Array.isArray(gate?.excludedKeys) || !gate.excludedKeys.includes(key)) return decide;
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
    && acknowledgeable(item, ctx.stage)).map((item) => item.id);
  return unacknowledged.length ? refuse(offer, ...unacknowledged) : offer;
}

/** A principal key as the members and candidates Studio listed name it; a key no one carries is shown as it is. */
export function nameOf(ctx, key) {
  const known = [...(ctx.project?.members ?? []), ...(Array.isArray(ctx.members?.candidates) ? ctx.members.candidates : [])]
    .find((row) => row.principalKey === key);
  return known ? `${esc(known.username)}` : `<code>${esc(key)}</code>`;
}

/**
 * What consuming the approved gate does: the direction approval moves the stage on to Build, the completion approval
 * completes the stage.
 */
export const completeLabel = (met, stage) => (met?.gate === "direction" ? "Use the direction approval and continue to Build"
  : `Complete ${stageTitle(stage)}`);
/**
 * Assemble's completion runs a required effect: it is consumed only once an owner opened the effect gate and project
 * approvers approved its request (409 EFFECT_GATE_NOT_OPEN / EFFECT_QUORUM_INSUFFICIENT otherwise); its effect_gate item
 * says which (EFFECT_GATE_NOT_OPEN, or APPROVAL_STATUS: other than QUORUM_MET). Adapt's plan review is optional.
 */
export function effectHold(met, readiness) {
  if (met?.gate !== "completion") return null;
  const effect = readiness.items.find((item) => item.id === "effect_gate");
  if (!effect) return null;
  if (effect.reasonCodes.includes("EFFECT_GATE_NOT_OPEN")) return held("An owner first opens the effect gate on the stage's effect card; project approvers then approve it there.");
  const status = effect.reasonCodes.find((code) => String(code).startsWith("APPROVAL_STATUS:"))?.slice("APPROVAL_STATUS:".length);
  if (status === undefined || status === "QUORUM_MET") return null;
  return held(["EXPIRED", "DENIED", "CANCELLED"].includes(status)
    ? `The effect gate's request is ${status}: an owner re-opens the effect gate on the stage's effect card, and project approvers approve the new request.`
    : `Project approvers approve the effect gate's request on the stage's effect card first (now ${status}).`);
}

export function renderApprovalsBar(ctx) {
  const { readiness, gates, stage, allowed, gateChange, specDraft } = ctx;
  const { shown, open, met, earlier, policy } = currentGates(gates, stage, readiness);
  const gate = open ?? met;
  const staleCodes = new Map(readiness.staleApprovals.map((row) => [row.decisionId, Array.isArray(row.reasonCodes) ? row.reasonCodes : []]));
  const shownIds = new Set(shown.flatMap((row) => row.decisions.map((decision) => decision.decisionId)));
  const pinned = (offer) => (gateChange ? held(GATE_CHANGED) : gate && !boundReview(gateReview(gate, readiness)) ? held(UNBOUND)
    : gate && gate.revisionNo !== ctx.revision?.revisionNo ? held(OTHER_REVISION) : gate && specDraft ? held(specDraftNote(gate.revisionNo)) : offer);
  // Readiness's status verbatim in the record; only the decisions readiness.staleApprovals lists carry codes (decisionRow).
  const gateBlock = (row) => `<p><code>${esc(row.gate)}</code> gate r${esc(row.revisionNo)} · <code>${esc(row.status)}</code> ·
      ${esc(row.approvals)} of ${esc(row.required)} required approvals</p>
      ${Array.isArray(row.excludedKeys) && row.excludedKeys.length ? exclusionLine(readiness, row, row.excludedKeys.map((key) => nameOf(ctx, key))) : ""}
      ${list(row.decisions.map((decision) => decisionRow(decision, staleCodes.get(decision.decisionId))), "No decisions yet.")}`;
  // In words: each gate, how many approvals it has, and who decided; who may approve is said only while it waits for approvals.
  const gateWords = (row) => `<p><strong>${esc(capital(say("gate", row.gate)))}</strong> for version ${esc(row.revisionNo)}: ${sayCode("gateStatus", row.status)}.
      ${esc(row.approvals)} of ${esc(row.required)} approvals.</p>
      ${row.status === "PENDING" && Array.isArray(row.excludedKeys) && row.excludedKeys.length ? exclusionLine(readiness, row, row.excludedKeys.map((key) => nameOf(ctx, key))) : ""}
      ${row.decisions.length ? list(row.decisions.map((decision) => decisionWords(decision, staleCodes.get(decision.decisionId))), "") : "<p class=\"muted\">Nobody has decided yet.</p>"}`;
  const earlierRows = earlier.map((old) => `<li><code>${esc(old.gate)}</code> gate bound to r${esc(old.revisionNo)} · <code>${esc(old.status)}</code>
    ${list(old.decisions.map((decision) => decisionRow(decision)), "No decisions.")}</li>`);
  const otherStale = readiness.staleApprovals.filter((row) => !shownIds.has(row.decisionId))
    .map((row) => `<li>${strikeIfStale(`<code>${esc(row.decisionId)}</code>`, staleCodes.get(row.decisionId))} ${codes(row.reasonCodes)}</li>`);
  // Only what a person can do now is a button; the rest is listed under More with the reason in words (actionButton).
  const { html: buttons, rows: waiting } = collectNotNow(() => [
    actionButton("Approve", "approve", open ? pinned(approveOffer(allowed.decide, open, readiness, ctx.me)) : null),
    actionButton("Request changes", "request-changes", open ? pinned(allowed.requestChanges) : null),
    actionButton("Request direction approval", "request-direction", requestOffer(ctx, "direction")),
    actionButton("Request completion approval", "request-completion", requestOffer(ctx, "completion")),
    actionButton(completeLabel(met, stage), "complete", stage === "activate" && met ? held(ACTIVATE_COMPLETE)
      : met ? effectHold(met, readiness) ?? pinned(allowed.progress) : null)].join(" "));
  const { html: more, rows: moreNotNow } = collectNotNow(() => [actionButton("Hold", "hold", allowed.hold),
    actionButton("Deny", "deny", open ? pinned(allowed.decide) : null), allowed.resume ? actionButton("Resume", "resume", allowed.resume) : ""].join(" "));
  return `<section class="card a4-approvals"><h4>Approvals</h4>${gateChange ? gateChangeBanner(gateChange) : ""}
    ${shown.length ? `${shown.map(gateWords).join("")}<p class="muted">An approval holds while the plan and the agent's files stay as they were. ${TRUTH.vote}.</p>`
      : `<p class="muted">Nobody has asked for an approval at this stage yet.</p>`}
    ${policy.length ? `<p class="muted">${POLICY_ELSEWHERE}.</p>` : ""}
    <label>Your reason (needed to approve, turn down, ask for changes, hold, resume or acknowledge) <input name="reason" required maxlength="2000" /></label>
    ${buttons.trim() ? `<div class="row wrap">${buttons}</div>` : "<p class=\"muted\">There is nothing to decide here right now.</p>"}
    <details data-a4-open="more"><summary>More</summary>${more.trim() ? `<div class="row wrap">${more}</div>` : ""}${notNowList([...waiting, ...moreNotNow])}</details>
    ${record(`${shown.map(gateBlock).join("")}${policy.length ? `<p class="muted">${POLICY_ELSEWHERE}: ${policy.map((row) => `<code>${esc(row.gateId)}</code> <code>${esc(row.quorum.status)}</code>`).join(", ")}.</p>` : ""}
      ${earlierRows.length ? `<h5>Earlier gates</h5>${list(earlierRows, "")}` : ""}${otherStale.length ? `<h5>Stale decisions</h5>${list(otherStale, "")}` : ""}`, "approvals")}</section>`;
}

export function renderMembers(ctx) {
  const { project, members, readiness } = ctx;
  const roles = ["builder", "reviewer", "approver", "viewer", "owner"];
  // Studio lists every eligible principal; one already on the project is not offered again.
  const memberKeys = new Set(project.members.map((member) => member.principalKey));
  const candidates = (Array.isArray(members?.candidates) ? members.candidates : []).filter((candidate) => !memberKeys.has(candidate.principalKey));
  const { open, met } = currentGates(ctx.gates, ctx.stage, readiness);
  const live = open ?? met;
  return `<section class="card a4-members"><h4>Members</h4>
    ${list(project.members.map((member) => `<li>${esc(member.username)}: ${esc(member.roles.map((role) => say("projectRole", role)).join(", "))}
      <span class="muted">(signs in with ${esc(say("authSource", member.authSource))})</span></li>`), "No members.")}
    ${readiness.identityCheck === "session_record" ? `<p>Roles here come from the host's session records, so AMC does not check them live.</p>` : ""}
    ${record(`${list(project.members.map((member) => `<li>${esc(member.username)} <code>${esc(member.authSource)}</code> ${codes(member.roles)}</li>`), "No members.")}
      ${readiness.identityCheck === "session_record" ? `<p><code>IDENTITY_CHECK_LIMITED</code> Host-mode roles come from session records, not a live check.</p>` : ""}`, "members")}
    ${members?.candidatesLimited === true ? `<p class="muted">Host mode: candidates come from tracked session records, so this list may be incomplete.</p>` : ""}
    ${members?.error ? `<p class="status-bad">${esc(members.error)}</p>` : ""}
    ${candidates.length ? `<h4>Candidates</h4>${live ? `<p class="status-bad">Adding a member records a new project transition: the open
      ${esc(live.gate)} approval request (r${esc(live.revisionNo)}) is superseded and its approvals stop counting, so it must be requested again.</p>` : ""}
      ${list(candidates.map((candidate) => `<li data-principal="${esc(candidate.principalKey)}">
      ${esc(candidate.username)} <select name="role" aria-label="Project role for ${esc(candidate.username)}">${roles.map((role) => `<option value="${role}">${esc(say("projectRole", role))}</option>`).join("")}</select>
      ${actionButton("Add", "add-member", ctx.allowed.addMember, `data-row="member" aria-label="Add ${esc(candidate.username)} to the project"`)}</li>`), "")}` : ""}
    ${Array.isArray(ctx.me?.roles) && ctx.me.roles.includes("OWNER") ? `<div class="a4-invite" data-card="members"><h4>Invite someone new</h4>
      <p class="muted">AMC creates their account with a first password, shows it to you once, and adds them here as an approver.</p>
      <label>Their user name <input name="inviteUsername" autocomplete="off" maxlength="64" /></label>
      <label><input type="checkbox" name="inviteAuditor" /> They may also audit</label>
      <p class="muted">Fit it to your rules (Adapt) needs two people besides the one who asks, each an auditor or a workspace owner.</p>
      ${actionButton("Invite", "invite-member", ctx.allowed.addMember)}</div>` : ""}
    <p class="muted">${TRUTH.twoUsers}.</p></section>`;
}
