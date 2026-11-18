// The agent project drawn as a route (studio-ui lane, slice a4): the four stages, the eight steps of the viewed stage,
// and an approval's people as initials with their state. Pure drawing of what the project, readiness and the gate records
// already say: it decides nothing, and every state here comes from the same data the "What to do now" panel reads.
// Also the Build page's start form asked one question at a time (bindQuestions): the same form, fields and names.
import { STAGE_PLAIN, STAGE_SHORT, STEP_PLAIN, STEP_SHORT, say } from "./a4Plain.js";
import { esc } from "./a4Html.js";
import { routeTrack } from "./pageKit.js";

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
  // A move with no action for this person (stop: nobody else can approve yet) waits for someone to act.
  if (move?.stop) return "wait";
  if (move?.act?.copy || (!move?.act && /nothing is needed from you|A project owner|waiting/i.test(String(move?.now ?? "")))) return "wait";
  return "now";
}

/** The four stages; each waypoint opens that stage of the project. The viewed stage is named in its hint. */
export function stageRoute(project, stage, current = "now") {
  const at = STAGES.indexOf(project?.stage);
  const id = encodeURIComponent(project?.projectId ?? "");
  return routeTrack(STAGES.map((name, index) => ({ label: STAGE_SHORT[name], href: `./a4Project?project=${id}&stage=${name}`,
    hint: `${STAGE_PLAIN[name]} (${title(name)})${name === stage && name !== project?.stage ? ", you are viewing it" : ""}`,
    state: at < 0 ? "todo" : index < at ? "done" : index > at ? "todo" : current })), { label: "The four stages", className: "a4-stages" });
}

/**
 * The eight steps of the viewed stage. At the project's own stage: earlier steps done, the current one in `current`. A
 * stage the project has passed is all done; one it has not reached, or any stage of a retired project, is not started.
 */
export function stepRoute(project, stage, current = "now") {
  const stageAt = STAGES.indexOf(stage), projectAt = STAGES.indexOf(project?.stage);
  const at = stage === project?.stage ? STEPS.indexOf(project.step) : -1;
  return routeTrack(STEPS.map((step, index) => ({ label: STEP_SHORT[step], hint: STEP_PLAIN[step],
    state: stage !== project?.stage ? (projectAt > stageAt ? "done" : "todo")
      : at < 0 ? "todo" : index < at ? "done" : index > at ? "todo" : current })), { label: `The steps of ${STAGE_PLAIN[stage] ?? title(stage)}`, className: "a4-steps-route" });
}

const initials = (name) => String(name ?? "?").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "?";
const personChip = (name, state, words) => `<li class="a4-person is-${state}"><span class="a4-avatar" aria-hidden="true">${esc(initials(name))}</span>`
  + `<span class="a4-person-words"><strong>${esc(name)}</strong><small>${esc(words)}</small></span></li>`;

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
 */
export function bindQuestions(form) {
  const questions = [...form.querySelectorAll("fieldset[data-a4-q]")];
  if (questions.length < 2) return;
  const nav = form.ownerDocument.createElement("div");
  nav.className = "row wrap a4-q-nav";
  nav.innerHTML = '<button type="button" class="secondary" data-a4-q-back>Back</button><button type="button" class="a4-q-next" data-a4-q-next>Next</button>'
    + '<span class="muted a4-q-count" aria-live="polite"></span>';
  const submitRow = form.querySelector('button[type="submit"]')?.closest(".row") ?? null;
  form.insertBefore(nav, submitRow);
  let at = 0;
  const show = (index, focus = true) => {
    at = Math.max(0, Math.min(index, questions.length - 1));
    questions.forEach((question, i) => { question.hidden = i !== at; });
    const last = at === questions.length - 1;
    nav.querySelector("[data-a4-q-back]").hidden = at === 0;
    nav.querySelector("[data-a4-q-next]").hidden = last;
    if (submitRow) submitRow.hidden = !last;
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
  form.addEventListener("submit", (event) => { if (at < questions.length - 1) { event.preventDefault(); event.stopImmediatePropagation(); show(at + 1); } }, true);
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
