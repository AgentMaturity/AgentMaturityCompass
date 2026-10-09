// A4 Studio page module (P1-58, design §11). a4.html and a4Project.html mount it from their own <script type="module">,
// and home.html loads it for the "Start an agent project" card; app.js is byte-pinned and never learns about these pages.
// Every call goes through apiNativeRequest. Studio re-checks every action: a disabled button is a convenience only.
import { apiNativeRequest, onClaims, whoami } from "./api.js";
import { installClaimStrip } from "./components/claimBadge.js";
import { renderHandholdingSteps } from "./components/handholdingSteps.js";
import { renderPlanTimeline } from "./components/planTimeline.js";
import { definiteNativeSubmissionRefusal } from "./nativeTaskSubmission.js";
import { stageCards } from "./a4Cards.js";
import * as view from "./a4View.js";
import { register as registerAspire } from "./a4Aspire.js";
import { register as registerAssemble } from "./a4Assemble.js";
import { register as registerAdapt } from "./a4Adapt.js";
import { register as registerActivate } from "./a4Activate.js";

const API = "/api/v1/a4";
const page = document.body.dataset.page;
const root = document.getElementById("app");
const notice = document.getElementById("a4Notice");
const params = new URLSearchParams(location.search);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const listOf = (data, key) => (Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : []);
const one = (data, key) => (isObject(data?.[key]) ? data[key] : data);
for (const register of [registerAspire, registerAssemble, registerAdapt, registerActivate]) register();

let me = null;
// The labelled claims the responses of the page load in flight carried, and the strip's "show these instead" hook: the
// strip shows a load's claims only once that load has rendered, so it never mixes a superseded load's labels in.
let claimSink = null;
let showClaims = () => {};
let pending = null; // the unconfirmed mutation; a retry repeats its clientRequestId so Studio returns the recorded result
let busy = false; // one write in flight at a time, so a double click cannot mint a second, non-deduplicable request id

/** Runs one user-started write; a click or submit while another is in flight is ignored. */
async function guarded(work) {
  if (busy) return undefined;
  busy = true;
  try {
    return await work();
  } finally {
    busy = false;
  }
}

function uuid() {
  if (typeof crypto?.randomUUID !== "function") throw new Error("Open Studio over HTTPS or localhost before changing a project.");
  return crypto.randomUUID();
}

function errorText(error) {
  const message = error?.message ?? String(error);
  // P1-57's error text already starts with its code; it is printed once.
  const code = typeof error?.code === "string" && !["HTTP_ERROR", "INVALID_RESPONSE"].includes(error.code)
    && !message.startsWith(`${error.code}:`) ? `${error.code}: ` : "";
  return `${code}${message}`;
}

function showError(error) {
  if (!notice || error?.name === "AbortError") return;
  notice.innerHTML = `<span class="status-bad">${view.esc(errorText(error))}</span>${pending ? ` Studio did not confirm "${view.esc(pending.label)}".
    Retry repeats the same request id, so Studio returns the recorded result if the first attempt was admitted. A refused
    retry does not show that the first attempt failed: reload the page and check the project, its decisions and its
    comments before doing it again. <button type="button" id="a4Retry">Retry</button>` : ""}`;
}

function tell(message) {
  if (notice) notice.textContent = message;
}

/**
 * POSTs one action. Only a definite refusal of a first attempt clears the unconfirmed action: a refused retry says
 * nothing about the first attempt (auth, rate and ownership checks run before Studio's idempotent lookup). While one
 * action is unconfirmed no other is sent, so a second lost acknowledgement can never go unreported.
 */
async function send(action, retry = false) {
  if (pending !== null && pending !== action) throw new Error("Nothing was sent.");
  try {
    const data = await apiNativeRequest(action.path, { method: "POST", body: action.body, nativeCsrfToken: me?.nativeCsrfToken ?? undefined });
    pending = null;
    tell("");
    return data;
  } catch (error) {
    const refused = (error?.code === "NATIVE_CSRF_REQUIRED" && !retry) || definiteNativeSubmissionRefusal(error, retry);
    pending = refused ? null : action;
    throw error;
  }
}

notice?.addEventListener("click", (event) => {
  if (event.target.id !== "a4Retry" || !pending) return;
  const action = pending;
  void guarded(async () => action.after?.(await send(action, true))).catch(showError);
});

/** The head a transition response names (its seq, or a head it returns); null when Studio named none. */
const headSeqOf = (data) => [data?.seq, data?.headSeq, data?.head?.headSeq, data?.project?.headSeq].find(Number.isSafeInteger) ?? null;

/**
 * The preview gate: null only for the gate's own refusal, or for a 404 that carries no code (a Studio without the A4
 * router, where the preview cannot be on). A4_ROUTE_NOT_FOUND and every other error is an error, not "not enabled".
 */
async function previewOptions() {
  try {
    return await apiNativeRequest(`${API}/options`);
  } catch (error) {
    if (error?.code === "A4_PREVIEW_DISABLED" || (error?.status === 404 && error?.code === "HTTP_ERROR")) return null;
    throw error;
  }
}

/** Home: the card and the nav link exist only when the preview answers; the card only while no project exists. */
async function showHomeEntry() {
  try {
    if (!(await previewOptions())) return;
    document.getElementById("a4NavLink")?.removeAttribute("hidden");
    const projects = listOf(await apiNativeRequest(`${API}/projects`), "projects");
    document.getElementById("a4HomeCard")?.toggleAttribute("hidden", projects.length > 0);
  } catch {
    // Signed out, unreachable or refused: the entry stays absent, which is the preview gate's closed state.
  }
}

async function renderListPage() {
  claimSink = [];
  const projects = listOf(await apiNativeRequest(`${API}/projects`), "projects");
  showClaims(claimSink);
  claimSink = null;
  root.innerHTML = `${view.renderCreateForm(params.has("new") || projects.length === 0)}${view.renderProjectList(projects)}`;
  root.querySelector("#a4CreateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void guarded(async () => {
      const form = new FormData(event.target);
      const agentId = String(form.get("agentId") ?? "").trim();
      const action = { label: "Start an agent project", path: `${API}/projects`,
        body: { clientRequestId: uuid(), name: String(form.get("name") ?? "").trim(), expertise: form.get("expertise"), ...(agentId ? { agentId } : {}) } };
      action.after = (data) => { location.href = `./a4Project?project=${encodeURIComponent(one(data, "project").projectId)}`; };
      action.after(await send(action));
    }).catch(showError);
  });
}

function mountProject(projectId, options) {
  const projectPath = (sub) => `${API}/projects/${encodeURIComponent(projectId)}${sub}`;
  const state = { project: null, readiness: null, gates: [], revision: null, stageRevision: null, comments: [], members: null, diff: null, options };
  let stage = null, activeCard = params.get("card") || "specification", cursor = 0, timer = null;
  let loading = null, loadAgain = false;
  let presence = [], presenceError = "", conflict = null, specBase = null;
  // The gate and readiness digest the approvals bar first showed. Polls re-render the bar, so a decision binds these,
  // never whatever the newest poll loaded; a change disables deciding until the user shows the new gate.
  let reviewed = null;
  // This page's last Understand and Explain responses: P1-57 publishes no read route for them yet, so they are shown
  // only to the member who ran them, until the page reloads.
  let reflection = null, explanation = null;
  const drafts = new Map();
  // Save answers binds the head the first answer edit began on, and each edited answer remembers Studio's value then:
  // a poll that shows another member's change to one of them holds Save instead of overwriting it.
  let answerBase = null;
  const answerStarts = new Map();

  const stagePath = (sub) => projectPath(`/stages/${stage}/${sub}`);
  // The editor's base: the spec without the answers Studio carries, so the merge and the proposal never name them.
  const specBaseNow = () => ({ revisionNo: state.project.revisionNo, headSeq: state.project.headSeq, spec: view.editableSpec(state.revision?.spec) });
  const headBinding = () => ({ expectedHeadSeq: state.project.headSeq, clientRequestId: uuid() });
  const presenceCard = () => `${stage}:${activeCard}`;
  // Every <details> the page renders carries data-a4-open; a re-render keeps the open/closed state the user chose by
  // this key, and every other section follows its rendered default (a thread opens when its first comment arrives).
  const toggled = new Map();
  const detailsKey = (details) => `${details.closest("[data-card]")?.dataset.card ?? "page"}:${details.dataset.a4Open}`;
  const draftKey = (field) => (field.name && !field.closest("[data-principal]")
    ? `${field.closest("[data-card]")?.dataset.card ?? "page"}:${field.name}` : null);
  // Answers come from the newest revision recorded at the viewed stage, the revision Studio's own Ask merges into: after
  // the next stage opens, or after a reopen, that is not the head revision. A stage with no revision shows none.
  const shownAnswers = () => listOf(state.stageRevision?.spec?.answers, "answers");
  const answerDrift = () => [...answerStarts].some(([id, start]) => view.answerText(shownAnswers(), id) !== start);
  const dropAnswerDrafts = (card) => {
    for (const id of answerStarts.keys()) drafts.delete(`${card}:${id}`);
    answerStarts.clear();
    answerBase = null;
  };
  const buildRunning = () => state.readiness?.items.some((item) => item.reasonCodes.includes("BUILD_RUNNING")) === true;
  const shownReview = () => {
    const { open, met } = view.currentGates(state.gates, stage);
    return view.gateReview(open ?? met, state.readiness);
  };
  /**
   * The pinned review of `gate`; refuses when Studio published no digest, when the page now shows a different gate or
   * readiness than the user reviewed, or when the specification card shows another revision than the one the gate binds.
   */
  const reviewedFor = (gate) => {
    const review = view.gateReview(gate, state.readiness);
    if (!view.boundReview(review)) throw new Error(`${view.UNBOUND}. Nothing was sent.`);
    if (!view.sameReview(reviewed, review)) throw new Error(`${view.GATE_CHANGED}. Show the current gate and review it first.`);
    if (reviewed.revisionNo !== state.revision?.revisionNo) throw new Error(`${view.OTHER_REVISION}. Nothing was sent.`);
    // The editor then shows the member's own draft, not the revision the gate binds.
    if (specBase !== null) throw new Error(`${view.specDraftNote(reviewed.revisionNo)}. Nothing was sent.`);
    return reviewed;
  };
  /** Only a bound gate whose revision the specification card shows can become the reviewed one. */
  const pinnable = (review) => view.boundReview(review) && review.revisionNo === state.revision?.revisionNo;

  /**
   * One load at a time (polls, actions and conflicts all ask for one): a load asked for while one runs makes that load
   * run once more, so every caller's await ends after a load that began after its call.
   */
  function load() {
    if (loading) {
      loadAgain = true;
      return loading;
    }
    loading = (async () => {
      try {
        do {
          loadAgain = false;
          await loadOnce();
        } while (loadAgain);
      } finally {
        loading = null;
        claimSink = null;
      }
    })();
    return loading;
  }

  async function loadOnce() {
    // The reads are separate requests: a write landing between them (a new revision and its gate) would show one
    // revision's gate under another revision's specification. Read again until they agree, three times at most; a view
    // that still disagrees is shown, but its gate is never pinned and deciding stays disabled (pinnable, the bar).
    for (let attempt = 1; ; attempt += 1) {
      claimSink = [];
      const read = await readProject();
      if (view.oneRevision(read.project, read.revision, read.gates, read.readiness) || attempt === 3) {
        Object.assign(state, read);
        stage = read.stage;
        break;
      }
    }
    const shown = shownReview();
    if (reviewed === null && pinnable(shown)) reviewed = shown;
    render();
    showClaims(claimSink); // a failed load leaves the previous load's labels beside the previous load's content
  }

  async function readProject() {
    const project = one(await apiNativeRequest(projectPath("")), "project");
    const viewStage = view.STAGES.includes(params.get("stage")) ? params.get("stage")
      : view.STAGES.includes(project.stage) ? project.stage : "activate";
    const [readiness, gates, revision, comments, members, diff, revisions] = await Promise.all([
      apiNativeRequest(projectPath(`/readiness?stage=${viewStage}`)).then((data) => one(data, "readiness")),
      apiNativeRequest(projectPath("/gates")).then((data) => listOf(data, "gates")),
      project.revisionNo > 0 ? apiNativeRequest(projectPath(`/revisions/${project.revisionNo}`)).then((data) => one(data, "revision")) : null,
      apiNativeRequest(projectPath("/comments")).then((data) => listOf(data, "comments")),
      apiNativeRequest(projectPath("/members")).catch((error) => ({ error: errorText(error) })),
      project.revisionNo > 1
        ? apiNativeRequest(projectPath(`/revisions/diff?from=${project.revisionNo - 1}&to=${project.revisionNo}`)).catch((error) => ({ error: errorText(error) }))
        : null,
      apiNativeRequest(projectPath("/revisions")).then((data) => listOf(data, "revisions"))
    ]);
    // A revision past the head read above landed between the reads; the next load shows it.
    const atStage = revisions.filter((row) => row.stage === viewStage && Number.isSafeInteger(row.revisionNo) && row.revisionNo <= project.revisionNo)
      .map((row) => row.revisionNo);
    const stageNo = atStage.length > 0 ? Math.max(...atStage) : null;
    const stageRevision = stageNo === null ? null : stageNo === revision?.revisionNo ? revision
      : one(await apiNativeRequest(projectPath(`/revisions/${stageNo}`)), "revision");
    return { project, readiness, gates, revision, stageRevision, comments, members, diff, stage: viewStage };
  }

  function render() {
    const fields = () => new Map([...root.querySelectorAll("[name]")].map((field) => [draftKey(field), field]).filter(([key]) => key));
    const focused = document.activeElement && root.contains(document.activeElement) ? draftKey(document.activeElement) : null;
    const caret = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    for (const details of root.querySelectorAll("details[data-a4-open]")) {
      if (details.open === details.hasAttribute("data-a4-default-open")) toggled.delete(detailsKey(details));
      else toggled.set(detailsKey(details), details.open);
    }
    const { project, readiness } = state;
    const shown = shownReview();
    const gateChange = view.boundReview(shown) && reviewed && !view.sameReview(reviewed, shown) ? { from: reviewed, to: shown } : null;
    const ctx = { ...state, stage, allowed: readiness.allowed, me, gateChange, reflection, explanation, answerDrift: answerDrift(), specDraft: specBase !== null,
      questions: listOf(state.options?.questions?.[stage], "questions"), answers: shownAnswers() };
    root.innerHTML = `${view.holdBanner(project)}${view.stageBanner(stage)}${conflict ? view.renderConflict(conflict) : ""}
      <section class="card"><h3>${view.esc(project.name)}</h3><p class="muted">Agent <code>${view.esc(project.agentId)}</code> ·
        r${view.esc(project.revisionNo)} · head ${view.esc(project.headSeq)}</p>${view.stageLinks(project, stage)}
        <p class="muted">${view.esc(readiness.claimBoundary)}</p></section>
      <div id="a4Rail"></div><section class="card"><h4>Steps</h4><div id="a4Steps"></div></section>
      <div class="a4-cards">${stageCards(stage).map((card) => view.renderCard(card, ctx, state.comments)).join("")}</div>
      <section class="card"><h4>Differences</h4>${state.diff?.error ? `<p class="status-bad">${view.esc(state.diff.error)}</p>`
        : view.renderDifferences(state.diff, project)}</section>
      <section class="card"><h4>Missing requirements</h4>${view.renderMissing(readiness)}</section>
      ${view.renderLanes(readiness)}${view.renderApprovalsBar(ctx)}${view.renderMembers(ctx)}
      <section class="card"><h4>Here now</h4><div id="a4Presence"></div></section>`;
    renderPlanTimeline(root.querySelector("#a4Rail"), view.railPlan(project));
    renderHandholdingSteps(root.querySelector("#a4Steps"), view.stepRows(project, stage));
    renderPresenceChips();
    for (const details of root.querySelectorAll("details[data-a4-open]")) {
      if (toggled.has(detailsKey(details))) details.open = toggled.get(detailsKey(details));
    }
    for (const [key, field] of fields()) {
      if (drafts.has(key)) field.value = drafts.get(key);
      if (key === focused) { field.focus(); if (caret && typeof field.setSelectionRange === "function") field.setSelectionRange(...caret); }
    }
  }

  function renderPresenceChips() {
    const target = root.querySelector("#a4Presence");
    if (target) target.innerHTML = view.renderPresence(presence, presenceError);
  }

  /** Binds the gate the user reviewed; the open seq comes from readiness's view of that same gate (or its record). */
  function decisionBinding() {
    const { open } = view.currentGates(state.gates, stage);
    const gateView = state.readiness.gates?.[open?.gate];
    const seq = open ? view.gateSeq(gateView?.gateId === open.gateId ? gateView : open, state.project.headSeq) : null;
    if (!open || seq === null) throw new Error("No open gate with its open sequence is shown. Refresh before deciding.");
    const pin = reviewedFor(open); // both digests checked there: a decision never goes out unbound
    return { gateId: pin.gateId, expectedGateSeq: seq, expectedRequestDigestSha256: pin.bindingDigest,
      expectedReadinessBindingDigest: pin.readinessBindingDigest, clientRequestId: uuid() };
  }

  /** A changed answer as typed; a non-text answer (data-json) goes back parsed, never as its display string. */
  function answerValue(field) {
    if (!field.hasAttribute("data-json")) return field.value.trim();
    try { return JSON.parse(field.value); } catch { throw new Error(`The answer to ${field.name} is structured: edit it as JSON. Nothing was sent.`); }
  }

  function specAction(spec, base) {
    return { label: "Propose this specification", path: stagePath("propose"), spec, base, clears: ["specification:spec"],
      got: () => { specBase = null; },
      // P1-57 takes no parent for a first revision (a null is refused).
      body: { spec, ...(base.revisionNo > 0 ? { parentRevisionNo: base.revisionNo } : {}), expectedHeadSeq: base.headSeq, clientRequestId: uuid() } };
  }

  function parseSpec(text) {
    let spec;
    try { spec = JSON.parse(text); } catch { throw new Error("The specification is not valid JSON. Nothing was sent."); }
    if (!isObject(spec)) throw new Error("The specification must be a JSON object. Nothing was sent.");
    if (Object.hasOwn(spec, "answers")) throw new Error("Answers are recorded through Save answers. Nothing was sent.");
    return spec;
  }

  function proposeAction(scope) {
    const field = scope.querySelector('[name="spec"]');
    if (!field) throw new Error("No specification is shown on this card. Nothing was sent.");
    return specAction(parseSpec(field.value), specBase ?? specBaseNow());
  }

  /** Confirm binds the head of the statement this page shows, so a newer one makes Studio answer 409. */
  function reflectionBinding() {
    if (!Number.isSafeInteger(reflection?.headSeq)) throw new Error("No reflection is shown yet. Run Understand first; nothing was sent.");
    return { expectedHeadSeq: reflection.headSeq, clientRequestId: uuid() };
  }

  /**
   * Each action: its POST path and body, the draft keys it consumed (`clears`, dropped on success) and `got(data)`, which
   * keeps what the response shows. Decisions bind the reviewed gate's open seq and both digests, never the head seq.
   */
  function actionFor(name, button) {
    const scope = button.closest("[data-card]") ?? button.closest("section") ?? root;
    const card = scope.dataset?.card ?? "page";
    const value = (field) => scope.querySelector(`[name="${field}"]`)?.value.trim() ?? "";
    const written = (field, what) => {
      const text = value(field);
      if (!text) throw new Error(`Write ${what} first. Nothing was sent.`);
      return text;
    };
    // Studio refuses an empty reason on decisions, Hold, Resume and Acknowledge.
    const reason = () => {
      const text = root.querySelector('.a4-approvals [name="reason"]')?.value.trim() ?? "";
      if (!text) throw new Error("Write a reason in the Approvals card first. Nothing was sent.");
      return text;
    };
    const post = (label, path, body, clears = [], got = undefined) => ({ label, path, body, clears, got });
    const REASON = ["page:reason"];
    const repin = () => { reviewed = null; }; // the user's own gate request: the next load pins the gate it opened
    const decide = (verb, label, extra) => {
      const why = reason();
      const { gateId, ...binding } = decisionBinding();
      return post(label, projectPath(`/gates/${encodeURIComponent(gateId)}/${verb}`), { reason: why, ...extra(binding) }, REASON);
    };
    switch (name) {
      case "answers": {
        if (answerDrift()) throw new Error(`${view.ANSWER_CHANGED}. Nothing was sent.`);
        // Only the fields the user changed: an untouched carried answer is never re-sent as the user's own statement.
        const edited = [...scope.querySelectorAll("form[data-a4-answers] textarea[name]")]
          .filter((field) => field.value.trim() && field.value.trim() !== field.defaultValue.trim());
        if (edited.length === 0) throw new Error("No answer was changed. Nothing was sent.");
        return { ...post("Save answers", stagePath("answers"), { expectedHeadSeq: answerBase ?? state.project.headSeq, clientRequestId: uuid(),
          answers: edited.map((field) => ({ questionId: field.name, value: answerValue(field) })) }, [], () => dropAnswerDrafts(card)), answers: true };
      }
      case "confirm-answer": {
        const answer = shownAnswers().find((row) => row.questionId === button.dataset.question);
        if (!answer) throw new Error("That answer is no longer shown. Nothing was sent.");
        return post("Confirm answer", stagePath("answers"), { ...headBinding(), answers: [{ questionId: answer.questionId, value: answer.value }] });
      }
      // Until a stage producer lands, Understand and Explain record the member's own text (P1-57's no-producer path).
      case "understand": {
        const content = written("understanding", "what this stage should achieve");
        return post("Run Understand", stagePath("understand"), { content, ...headBinding() }, [`${card}:understanding`],
          (data) => { reflection = { data, text: content, headSeq: headSeqOf(data) }; });
      }
      case "confirm": return post("Confirm understanding", stagePath("confirm-understanding"), { confirmed: true, ...reflectionBinding() });
      case "explain": {
        const level = value("level");
        const content = written("explanation", "your explanation");
        return post("Explain", stagePath("explain"), { content, level, ...headBinding() }, [`${card}:explanation`],
          (data) => { explanation = { level, text: content, data, headSeq: headSeqOf(data) }; });
      }
      case "propose": return proposeAction(scope);
      case "build": return post("Build", stagePath("build"), { content: written("content", "the build output"), ...headBinding() }, [`${card}:content`]);
      case "review": return post("Review", stagePath("review"), { content: written("content", "your findings"), ...headBinding() }, [`${card}:content`]);
      case "request-direction": return post("Request direction approval", stagePath("gates/direction/request"), headBinding(), [], repin);
      case "request-completion": return post("Request completion approval", stagePath("gates/completion/request"), headBinding(), [], repin);
      case "approve": return decide("approve", "Approve", (binding) => binding);
      case "deny": return decide("deny", "Deny", (binding) => binding);
      // P1-57's request-changes body is { reason, expectedGateSeq, clientRequestId, findings } and takes neither digest;
      // the pinned review is still checked here (decisionBinding) before anything is sent.
      case "request-changes": return decide("request-changes", "Request changes",
        ({ expectedGateSeq, clientRequestId }) => ({ findings: [], expectedGateSeq, clientRequestId }));
      case "complete": {
        const { met } = view.currentGates(state.gates, stage);
        if (!met) throw new Error("No approved gate is shown for this stage. Refresh before completing it.");
        // Activate's completion delivers the production lease token once (design §10.4); this generic action would drop
        // it. Its direction gate carries no token and is consumed here like any other.
        if (stage === "activate" && met.gate === "completion") throw new Error(`${view.ACTIVATE_COMPLETE}. Nothing was sent.`);
        return post("Complete stage", stagePath("complete"), { gateId: reviewedFor(met).gateId, ...headBinding() });
      }
      case "hold": return post("Hold", projectPath("/hold"), { reason: reason(), ...headBinding() }, REASON);
      case "resume": return post("Resume", projectPath("/resume"), { reason: reason(), ...headBinding() }, REASON);
      // The item was listed by the viewed stage's readiness, so it is acknowledged at that stage, not the head's.
      case "acknowledge": return post("Acknowledge", projectPath("/acknowledge"), { itemId: button.dataset.item, stage, reason: reason(), ...headBinding() }, REASON);
      case "add-member": {
        const row = button.closest("[data-principal]");
        // `projectRoles`: Studio refuses any body naming `roles` as an identity claim.
        return post("Add member", projectPath("/members"), { principalKey: row.dataset.principal,
          projectRoles: [row.querySelector('[name="role"]').value], ...headBinding() });
      }
      case "comment": {
        const body = value("comment");
        if (!body) throw new Error("Write a comment first.");
        if (new TextEncoder().encode(body).byteLength > view.COMMENT_MAX_BYTES) throw new Error("Comments are limited to 8 KiB. Nothing was sent.");
        // Card ids repeat across stages, so the thread key is stage-qualified, as presence is. Studio records the
        // revision and stage from the head.
        return post("Comment", projectPath("/comments"), { cardId: `${stage}:${card}`, body, clientRequestId: uuid() }, [`${card}:comment`]);
      }
      default: throw new Error(`Unknown A4 action ${name}.`);
    }
  }

  async function openConflict(action) {
    const head = one(await apiNativeRequest(projectPath("")), "project");
    // P1-57 takes a proposal only at step `explained` (409 A4_STEP_ORDER otherwise, before it compares the parent), so
    // once another member has proposed, the card offers Reload only.
    const proposable = head.stage === stage && head.step === "explained";
    // A comment, member or evidence transition moves the head without a new revision: re-post once on the new head.
    if (proposable && head.revisionNo === action.base.revisionNo && !action.rebased) {
      return run({ ...specAction(action.spec, { ...action.base, headSeq: head.headSeq }), rebased: true });
    }
    const headRevision = head.revisionNo > 0 ? one(await apiNativeRequest(projectPath(`/revisions/${head.revisionNo}`)), "revision") : null;
    const headSpec = view.editableSpec(headRevision?.spec);
    conflict = { baseRevisionNo: action.base.revisionNo, baseSpec: action.base.spec, headRevisionNo: head.revisionNo, headSeq: head.headSeq, headSpec,
      headStage: head.stage, headStep: head.step, proposable,
      theirs: view.jsonDiff(action.base.spec, headSpec), mine: view.jsonDiff(action.base.spec, action.spec) };
    await load();
  }

  async function run(action) {
    action.after = async (data) => {
      for (const key of action.clears ?? []) drafts.delete(key);
      action.got?.(data);
      await load();
    };
    let data;
    try {
      data = await send(action);
    } catch (error) {
      if (error?.status === 409 && (error.code === "A4_STALE_HEAD" || error.code === "A4_STEP_ORDER") && action.spec) return openConflict(action);
      if (error?.status === 409) await load().catch(showError);
      // Another write moved the head but changed none of the answers being edited: re-sent once on the new head.
      if (error?.status === 409 && error.code === "A4_STALE_HEAD" && action.answers && !action.rebased && !answerDrift()) {
        answerBase = state.project.headSeq;
        return run({ ...action, body: { ...action.body, expectedHeadSeq: answerBase, clientRequestId: uuid() }, rebased: true });
      }
      throw error;
    }
    await action.after(data);
  }

  async function act(name, button) {
    if (name === "show-gate") {
      const shown = shownReview();
      if (!pinnable(shown)) throw new Error(`${view.OTHER_REVISION}.`);
      reviewed = shown;
      return render();
    }
    if (name === "correct") {
      // A correction is new answers or a new statement, then Understand again (design §9.3); P1-57 confirms only.
      const card = button.closest("[data-card]")?.dataset.card ?? "page";
      if (reflection) drafts.set(`${card}:understanding`, reflection.text);
      reflection = null;
      render();
      root.querySelector('details[data-a4-open="change-answers"]')?.setAttribute("open", "");
      root.querySelector('[name="understanding"]')?.focus();
      return tell("Change your answers under Ask or your statement under Understand, then run Understand again. Nothing was sent.");
    }
    if (name === "discard-answers") {
      dropAnswerDrafts(button.closest("[data-card]")?.dataset.card ?? "page");
      return render();
    }
    if (name === "reload") {
      conflict = null; specBase = null; drafts.delete("specification:spec");
      return load();
    }
    if (name === "apply-on-top") {
      if (!conflict) return load();
      // The editor stays editable under the conflict card: merge what it holds now, not what it held when Studio refused.
      // The draft is diffed against the base it was written from (specBase, kept until it is proposed or discarded), never
      // a refused apply's base: that head's own edits would otherwise be reverted on top of the next one.
      const draft = drafts.get("specification:spec");
      const mine = draft === undefined ? conflict.mine : view.jsonDiff(specBase?.spec ?? conflict.baseSpec, parseSpec(draft));
      const merged = view.applyChanges(conflict.headSpec, mine);
      const base = { revisionNo: conflict.headRevisionNo, headSeq: conflict.headSeq, spec: conflict.headSpec };
      conflict = null;
      return run(specAction(merged, base));
    }
    return run(actionFor(name, button));
  }

  function focusCard(card) {
    if (card === activeCard) return;
    activeCard = card;
    const url = new URL(location.href);
    url.searchParams.set("card", card);
    history.replaceState(null, "", url);
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(() => void poll(), ms);
  }

  async function poll() {
    try {
      const asked = { projectId, headSeq: state.project.headSeq, cursor };
      const update = view.validateA4Poll(await apiNativeRequest(projectPath(`/events?cursor=${asked.cursor}&card=${encodeURIComponent(presenceCard())}`)),
        asked, asked.cursor);
      cursor = Math.max(cursor, update.nextCursor);
      presence = update.presence;
      renderPresenceChips();
      if (update.head.headSeq > state.project.headSeq || update.events.length > 0) await load();
    } catch (error) {
      showError(error);
    }
    schedule(buildRunning() ? 1000 : 4000);
  }

  async function heartbeat() {
    if (document.hidden) return;
    try {
      // The heartbeat's answer carries the presence too, so presence does not depend on the poll alone.
      const data = await apiNativeRequest(projectPath("/presence"), { method: "POST", body: { card: presenceCard() }, nativeCsrfToken: me?.nativeCsrfToken ?? undefined });
      presence = view.presenceRows(data?.presence);
      presenceError = "";
    } catch (error) {
      presenceError = errorText(error);
    }
    renderPresenceChips();
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-a4-action],[data-a4-copy]");
    if (!button || button.disabled) return;
    if (button.dataset.a4Copy) { void navigator.clipboard?.writeText(button.dataset.a4Copy).catch(showError); return; }
    const card = button.closest("[data-card]")?.dataset.card;
    if (card) focusCard(card);
    void guarded(() => act(button.dataset.a4Action, button)).catch(showError);
  });
  root.addEventListener("focusin", (event) => {
    const card = event.target.closest?.("[data-card]")?.dataset.card;
    if (card) focusCard(card);
  });
  root.addEventListener("input", (event) => {
    const key = draftKey(event.target);
    if (!key) return;
    if (event.target.closest("form[data-a4-answers]") && !answerStarts.has(event.target.name)) {
      answerBase ??= state.project.headSeq;
      answerStarts.set(event.target.name, view.answerText(shownAnswers(), event.target.name));
    }
    drafts.set(key, event.target.value);
    // The first specification edit holds deciding at once (the card now shows a draft, not the bound revision); the
    // re-render keeps the draft, the focus and the caret.
    if (key === "specification:spec" && !specBase) {
      specBase = specBaseNow();
      render();
    }
  });
  document.addEventListener("visibilitychange", () => (document.hidden ? clearTimeout(timer) : schedule(0)));

  return (async () => {
    await load();
    schedule(0);
    void heartbeat();
    setInterval(() => void heartbeat(), 10_000);
  })();
}

async function main() {
  if (page === "home") return showHomeEntry();
  const status = document.getElementById("status");
  me = await whoami();
  if (!me) {
    status.innerHTML = 'Sign in to use agent projects. <a href="./login">Login</a>';
    return;
  }
  status.textContent = `Signed in as ${me.username}`;
  const options = await previewOptions();
  if (!options) {
    root.innerHTML = `<section class="card"><p>${view.PREVIEW_NOTICE}.</p></section>`;
    return;
  }
  document.getElementById("a4NavLink")?.removeAttribute("hidden");
  // The strip prints claimLabel verbatim. A bare envelope (a readiness item's `claim`) carries no server label, so it
  // stays off the strip rather than being shown with a result word the page would have to supply.
  let deliver = null;
  const strip = installClaimStrip(page, (listener) => { deliver = listener; });
  onClaims((claims) => claimSink?.push(...claims.filter((claim) => typeof claim?.claimLabel === "string")));
  showClaims = (claims) => {
    strip?.reset();
    if (claims.length > 0) deliver?.(claims);
  };
  if (page === "a4") return renderListPage();
  const projectId = params.get("project");
  if (!projectId) {
    root.innerHTML = `<section class="card"><p>Choose a project from <a href="./a4">agent projects</a>.</p></section>`;
    return;
  }
  return mountProject(projectId, options);
}

main().catch(showError);
