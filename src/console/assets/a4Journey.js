// The agent project drawn as a route (studio-ui lane, slice a4): the four stages, the eight steps of the viewed stage,
// and an approval's people as initials with their state. Pure drawing of what the project, readiness and the gate records
// already say: it decides nothing, and every state here comes from the same data the "What to do now" panel reads.
// Also the Build page's start form asked one question at a time (bindQuestions): the same form, fields and names.
import { STAGE_PLAIN, STAGE_SHORT, STEP_PLAIN, STEP_SHORT, say } from "./a4Plain.js";
import { esc } from "./a4Html.js";
import { moreInfo, personChip, routeTrack } from "./pageKit.js";

const STAGES = ["aspire", "assemble", "adapt", "activate"];
const STEPS = ["asked", "understood", "explained", "proposed", "direction_approved", "built", "reviewed", "completion_approved"];
const list = (value) => (Array.isArray(value) ? value : []);
const title = (stage) => (typeof stage === "string" && stage ? stage[0].toUpperCase() + stage.slice(1) : "");

/**
 * The state of the waypoint the person stands on, from the panel's own next move: stopped while the project is on hold,
 * turned down or blocked; waiting while someone else has to act; otherwise it is theirs to do.
 */
export function moveState(project, move, blocked = false) {
  if (project?.hold || blocked) return "stop";
  // A move with no action for this person (stop: nobody else can approve yet) waits for someone to act; so does a move
  // that only offers the page's link to share, or one nextMove marks as someone else's turn (waits).
  if (move?.stop || move?.waits || move?.act?.copy) return "wait";
  return "now";
}

/** Whether this Studio cannot make the release (Activate's deployment.same_host): the release, not a step, is stopped. */
export const releaseBlocked = (readiness) => list(readiness?.items).some((item) => item.id === "deployment.same_host" && item.status === "BLOCKED");

/**
 * The state of the project's own stage, the same on Home, the Build page's list and a project page viewing another stage:
 * stopped while on hold or while this Studio cannot make the release; waiting at an approval step unless the one person
 * on a practice project approves it alone (Aspire, and Assemble's first approval: docs/A4_FORGE.md); otherwise now.
 * `readiness` is the project's head-stage readiness (null when it was not read: then only the hold and the step count).
 * @param {any} project
 * @param {any} [readiness]
 */
export function projectState(project, readiness = null) {
  if (project?.hold || readiness?.status === "ON_HOLD" || releaseBlocked(readiness)) return "stop";
  // Something else blocks the stage (files changed, a denied plan): the project's people fix it on the page first.
  if (readiness?.status === "BLOCKED") return "now";
  if (!["proposed", "reviewed"].includes(project?.step)) return "now";
  // An approval nobody has asked for yet is the owner's to ask for.
  const gates = readiness?.gates;
  if (gates && typeof gates === "object" && gates[project.step === "proposed" ? "direction" : "completion"] == null) return "now";
  const alone = (project?.practiceActive === true || readiness?.selfApprovalAllowed === true)
    && (project?.stage === "aspire" || (project?.stage === "assemble" && project?.step === "proposed"));
  return alone ? "now" : "wait";
}

/** The four stages; each waypoint opens that stage of the project. The viewed stage is marked and named in its hint. */
export function stageRoute(project, stage, current = "now") {
  const at = STAGES.indexOf(project?.stage);
  const id = encodeURIComponent(project?.projectId ?? "");
  return routeTrack(STAGES.map((name, index) => ({ label: STAGE_SHORT[name], href: `./a4Project?project=${id}&stage=${name}`,
    hint: `${STAGE_PLAIN[name]} (${title(name)})${name === stage && name !== project?.stage ? ", you are viewing it" : ""}`, viewed: name === stage,
    state: at < 0 ? "todo" : index < at ? "done" : index > at ? "todo" : current })), { label: "The four stages", className: "a4-stages" });
}

/**
 * The eight steps of the viewed stage. At the project's own stage: earlier steps done, the current one in `current`. A
 * stage the project has passed is all done; one it has not reached, or any stage of a retired project, is not started.
 * `stopAt` names a later step that is stopped instead (Activate's Build, the release this Studio cannot make): the current
 * step is then drawn as not started, never as refused itself.
 * @param {any} project
 * @param {string} stage
 * @param {string} [current]
 * @param {string | null} [stopAt]
 */
export function stepRoute(project, stage, current = "now", stopAt = null) {
  const stageAt = STAGES.indexOf(stage), projectAt = STAGES.indexOf(project?.stage);
  const at = stage === project?.stage ? STEPS.indexOf(project.step) : -1;
  const stopIndex = stopAt ? STEPS.indexOf(stopAt) : -1;
  const stopLater = at >= 0 && stopIndex > at;
  return routeTrack(STEPS.map((step, index) => ({ label: STEP_SHORT[step], hint: STEP_PLAIN[step],
    state: stage !== project?.stage ? (projectAt > stageAt ? "done" : "todo")
      : at < 0 ? "todo" : index < at ? "done" : stopLater && index === stopIndex ? "stop" : index > at || stopLater ? "todo" : current })),
  { label: `The steps of ${STAGE_PLAIN[stage] ?? title(stage)}`, className: "a4-steps-route" });
}

/**
 * Understand and Explain are steps 2 and 3: past them (a plan to review, a build, an approval) or at a stage that is not
 * the project's own, what they show folds, unchanged, under one closed summary, so the plan and its approval stay in sight.
 */
export function laterFold(ctx, summary, html) {
  const early = ctx.stage === ctx.project.stage && ["asked", "understood", "explained"].includes(ctx.project.step);
  return early || !html ? html : moreInfo(summary, html).replace('<details class="more-info"', `<details class="more-info" data-a4-open="later:${esc(summary)}"`);
}

/**
 * An approval as people: who decided and how (from the gate's own decisions; one that no longer counts says so), the
 * approvals still missing as unnamed places (readiness gives a count, not names), and, unless the one person may approve
 * alone, who the gate keeps from approving. `names` maps a principal key to a user name.
 */
export function approvalPeople(gate, readiness, names = new Map(), myName = null) {
  if (!gate || typeof gate !== "object") return "";
  const stale = new Set(list(readiness?.staleApprovals).filter((row) => list(row.reasonCodes).includes("GATE_STALE")).map((row) => row.decisionId));
  const decided = list(gate.decisions).map((decision) => {
    const approved = String(decision.decision).startsWith("APPROVE");
    const words = stale.has(decision.decisionId) ? "no longer counts" : decision.selfApproved ? "self-approved" : say("decision", decision.decision);
    return personChip(decision.username, stale.has(decision.decisionId) ? "todo" : approved ? "done" : "stop", words);
  });
  const required = Number.isSafeInteger(gate.required) ? gate.required : Number(gate.request?.requiredApprovals) || 0;
  const approvals = Number.isSafeInteger(gate.approvals) ? gate.approvals : 0;
  const open = gate.status === "PENDING" ? Math.max(required - approvals, 0) : 0;
  // Alone on a practice project the one person fills the place themselves (Studio records it as self-approved).
  const selfPlace = readiness?.selfApprovalAllowed === true && required <= 1 && open > 0 && typeof myName === "string";
  const places = selfPlace ? [personChip(myName, "wait", "you approve alone, self-approved")] : Array.from({ length: open }, () => `<li class="a4-person is-wait"><span class="a4-avatar" aria-hidden="true">?</span>`
    + `<span class="a4-person-words"><strong>An approver</strong><small>not decided yet</small></span></li>`);
  const selfOpen = readiness?.selfApprovalAllowed === true;
  const decidedNames = new Set(list(gate.decisions).map((decision) => decision.username));
  const kept = gate.status === "PENDING" && !selfOpen ? list(gate.excludedKeys).map((key) => names.get(key) ?? key).filter((name) => !decidedNames.has(name))
    .map((name) => personChip(name, "todo", "cannot approve this one")) : [];
  const rows = [...decided, ...places, ...kept];
  return rows.length ? `<ul class="a4-people-row" aria-label="Who approves">${rows.join("")}</ul>
    <p class="a4-count">${esc(approvals)} of ${esc(required)} approvals</p>` : "";
}

/**
 * The Build page's start form, one question at a time: each `fieldset[data-a4-q]` in turn with Back and Next, the last
 * with the form's own submit. Every field stays in the one form, so what Start sends is unchanged; a field the form's
 * check focuses, or Enter on an earlier question, brings its question back into view. Station cards narrow the pack list.
 * `submitAnywhere` (an Industry Pack's questions) keeps the form's own submit in sight and lets it send at any question.
 */
export function bindQuestions(form, { submitAnywhere = false } = {}) {
  const questions = [...form.querySelectorAll("fieldset[data-a4-q]")];
  if (questions.length < 2) return;
  const nav = form.ownerDocument.createElement("div");
  nav.className = "row wrap a4-q-nav";
  nav.innerHTML = '<button type="button" class="secondary" data-a4-q-back>Back</button><button type="button" class="a4-q-next" data-a4-q-next>Next</button>'
    + '<span class="muted a4-q-count" aria-live="polite"></span>';
  // The form's own submit button joins Back on the last question's row (still inside the one form, so Start sends the same).
  const submit = form.querySelector('button[type="submit"]');
  const submitRow = submit?.closest(".row") ?? null;
  form.insertBefore(nav, submitRow);
  if (submit) nav.insertBefore(submit, nav.querySelector(".a4-q-count"));
  if (submitAnywhere) nav.querySelector("[data-a4-q-next]").className = "secondary a4-q-next";
  // With Score always in reach, the form's other buttons (Clear answers) join the same row.
  if (submitAnywhere) for (const extra of submitRow?.querySelectorAll("button") ?? []) nav.insertBefore(extra, nav.querySelector(".a4-q-count"));
  if (submitRow && submitRow.children.length === 0) submitRow.hidden = true;
  let at = 0;
  const show = (index, focus = true) => {
    at = Math.max(0, Math.min(index, questions.length - 1));
    questions.forEach((question, i) => { question.hidden = i !== at; });
    const last = at === questions.length - 1;
    nav.querySelector("[data-a4-q-back]").hidden = at === 0;
    nav.querySelector("[data-a4-q-next]").hidden = last;
    if (submit && !submitAnywhere) submit.hidden = !last;
    nav.querySelector(".a4-q-count").textContent = `Question ${at + 1} of ${questions.length}`;
    if (focus) questions[at].querySelector("input:not([type=hidden]):not([disabled]), select")?.focus({ preventScroll: true });
  };
  nav.addEventListener("click", (event) => {
    if (event.target.closest("[data-a4-q-back]")) show(at - 1);
    if (event.target.closest("[data-a4-q-next]")) show(at + 1);
  });
  // Enter on an earlier question goes on to the next one instead of starting the project.
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && at < questions.length - 1 && event.target.matches("input:not([type=radio]):not([type=checkbox])")) { event.preventDefault(); show(at + 1); }
  });
  if (!submitAnywhere) form.addEventListener("submit", (event) => { if (at < questions.length - 1) { event.preventDefault(); event.stopImmediatePropagation(); show(at + 1); } }, true);
  form.addEventListener("focusin", (event) => {
    const holder = event.target.closest?.("fieldset[data-a4-q]");
    if (holder && holder.hidden) show(questions.indexOf(holder), false);
  });
  // A station card narrows the pack list to that station; "No industry" clears the choice.
  const select = form.querySelector('select[name="pack"]');
  form.addEventListener("change", (event) => {
    if (event.target.name !== "a4Station" || !select) return;
    const station = event.target.value;
    for (const group of select.querySelectorAll("optgroup")) group.hidden = Boolean(station) && group.label.toLowerCase() !== station;
    select.closest("label").hidden = !station;
    if (!station) select.value = "";
    else if (!select.selectedOptions[0] || select.selectedOptions[0].parentElement?.hidden || !select.value) select.value = select.querySelector(`optgroup:not([hidden]) option`)?.value ?? "";
  });
  const chosen = select?.selectedOptions[0]?.parentElement?.label?.toLowerCase();
  const card = chosen ? [...form.querySelectorAll('input[name="a4Station"]')].find((radio) => radio.value === chosen) : null;
  if (card) { card.checked = true; card.dispatchEvent(new Event("change", { bubbles: true })); }
  else if (select) select.closest("label").hidden = true;
  show(0, false);
}
