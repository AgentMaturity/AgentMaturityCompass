// A4 Studio page module (P1-58, design §11). a4.html and a4Project.html mount it from their own <script type="module">,
// and home.html loads it for the "Start an agent project" card; app.js is byte-pinned and never learns about these pages.
// Every call goes through apiNativeRequest. Studio re-checks every action: a disabled button is a convenience only.
import { apiGet, apiNativeRequest, logout, onClaims, whoami } from "./api.js";
import { installClaimStrip } from "./components/claimBadge.js";
import { topbarHtml } from "./shell.js";
import { renderHandholdingSteps } from "./components/handholdingSteps.js";
import { stageAction, stageCards } from "./a4Cards.js";
import * as view from "./a4View.js";
import * as start from "./a4Start.js";
import * as packs from "./a4Pack.js";
import { approvalWaiting, canCreate } from "./a4Who.js";
import { register as registerAspire } from "./a4Aspire.js";
import { register as registerAssemble } from "./a4Assemble.js";
import { register as registerAdapt } from "./a4Adapt.js";
import { register as registerActivate } from "./a4Activate.js";
import { API, claimSink, errorText, guarded, listOf, me, notice, one, params, previewOptions, root, send, setClaimSink, setMe, setShowClaims,
  showClaims, showError, storePack, storedPack, tell, uuid } from "./a4Send.js";
import { bindCreateForm, renderListPage } from "./a4ListPage.js";

const page = document.body.dataset.page;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
for (const register of [registerAspire, registerAssemble, registerAdapt, registerActivate]) register();

/** The head a transition response names (its seq, or a head it returns); null when Studio named none. */
const headSeqOf = (data) => [data?.seq, data?.headSeq, data?.head?.headSeq, data?.project?.headSeq].find(Number.isSafeInteger) ?? null;

/**
 * Home's first card (a4Start.homeCardHtml): build an agent, or continue the latest project. It is filled only when the
 * preview answers and this person may create projects; the demo workspace gets a short note instead. The nav link is
 * shown by default and hidden here when Studio reports the preview off.
 */
async function showHomeEntry() {
  const card = document.getElementById("a4HomeCard");
  try {
    // Studio refuses every A4 route to the local demo session (DEMO_REFUSED, 403), so Home does not ask on each load.
    const who = await whoami();
    if (who?.userId === "local-demo") {
      if (card) { card.innerHTML = start.homeCardHtml({ demo: true }); card.hidden = false; }
      return;
    }
    const options = await previewOptions();
    if (!options) {
      document.getElementById("a4NavLink")?.setAttribute("hidden", "");
      return;
    }
    setMe(who);
    const projects = listOf(await apiNativeRequest(`${API}/projects`), "projects");
    if (!card || (projects.length === 0 && !canCreate(who, options))) return;
    const catalog = projects.length === 0 ? listOf(await apiGet("/industry-packs/list").catch(() => null), "packs") : [];
    const waiting = await approvalWaiting(projects, who, apiNativeRequest, API);
    card.innerHTML = start.homeCardHtml({ projects, waiting, industryHtml: packs.packSelectHtml(catalog, null), start: options.workspace?.start ?? null });
    card.hidden = false;
    bindCreateForm(card.querySelector("#a4HomeForm"));
  } catch {
    // Signed out, unreachable or refused: the card stays absent, which is the preview gate's closed state.
  }
}

function mountProject(projectId, options) {
  const projectPath = (sub) => `${API}/projects/${encodeURIComponent(projectId)}${sub}`;
  const state = { project: null, readiness: null, gates: [], revision: null, stageRevision: null, comments: [], members: null, diff: null, refs: [], options };
  let stage = null, activeCard = params.get("card") || "specification", cursor = 0, timer = null;
  const invited = []; // what each Add a person answered on this page (first passwords included), never stored
  let loading = null, loadAgain = false;
  let presence = [], presenceError = "", conflict = null, specBase = null;
  // The gate and readiness digest the approvals bar first showed. Polls re-render the bar, so a decision binds these,
  // never whatever the newest poll loaded; a change disables deciding until the user shows the new gate.
  let reviewed = null;
  // This page's last Understand and Explain responses: P1-57 publishes no read route for them yet, so they are shown
  // only to the member who ran them, until the page reloads or the project's stage or revision changes (loadOnce).
  let reflection = null, explanation = null;
  const drafts = new Map();
  // ?pack= starts Aspire from an Industry Pack: its suggestions fill empty answers once, on the page only (a4Pack.js).
  // The pack chosen at the start stays with the project in this browser (A4-09), not only in the address.
  const startPackId = packs.packIdOf(params.get("pack")) ?? packs.packIdOf(storedPack(projectId));
  if (packs.packIdOf(params.get("pack"))) storePack(projectId, packs.packIdOf(params.get("pack")));
  let startPack = null, packFilled = null, packFilledAt = null;
  // Save answers binds the head the first answer edit began on, and each edited answer remembers Studio's value then:
  // a poll that shows another member's change to one of them holds Save instead of overwriting it.
  let answerBase = null;
  const answerStarts = new Map();

  const stagePath = (sub) => projectPath(`/stages/${stage}/${sub}`);
  // The editor's base: the spec without the answers Studio carries, so the merge and the proposal never name them.
  const specBaseNow = () => ({ revisionNo: state.project.revisionNo, headSeq: state.project.headSeq, spec: view.editableSpec(state.revision?.spec) });
  const headBinding = () => ({ expectedHeadSeq: state.project.headSeq, clientRequestId: uuid() });
  // ?card= is user-editable: only a card registered for the viewed stage is sent, so Studio never refuses every heartbeat and poll.
  const presenceCard = () => `${stage}:${stageCards(stage).some((card) => card.id === activeCard) ? activeCard : "specification"}`;
  // Every <details> the page renders carries data-a4-open; a re-render keeps the open/closed state the user chose by
  // this key, and every other section follows its rendered default (a thread opens when its first comment arrives).
  const toggled = new Map();
  const detailsKey = (details) => `${details.closest("[data-card]")?.dataset.card ?? "page"}:${details.dataset.a4Open}`;
  // A candidate's role select is kept per principal, so a poll's re-render never resets it to the first role.
  const draftKey = (field) => {
    if (!field.name) return null;
    const principal = field.closest("[data-principal]")?.dataset.principal;
    return principal !== undefined ? `member:${principal}:${field.name}` : `${field.closest("[data-card]")?.dataset.card ?? "page"}:${field.name}`;
  };
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
    const { open, met } = view.currentGates(state.gates, stage, state.readiness);
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
        setClaimSink(null);
      }
    })();
    return loading;
  }

  async function loadOnce() {
    // The reads are separate requests: a write landing between them (a new revision and its gate) would show one
    // revision's gate under another revision's specification. Read again until they agree, three times at most; a view
    // that still disagrees is shown, but its gate is never pinned and deciding stays disabled (pinnable, the bar).
    for (let attempt = 1; ; attempt += 1) {
      setClaimSink([]);
      const read = await readProject();
      if (view.oneRevision(read.project, read.revision, read.gates, read.readiness) || attempt === 3) {
        // A statement binds the head it was recorded at: once a later revision or another stage supersedes it, Confirm could
        // only be refused. The revision Understand itself records keeps it (view.statementHolds).
        if (state.project) {
          if (!view.statementHolds(reflection, state.project, read.project)) reflection = null;
          if (!view.statementHolds(explanation, state.project, read.project)) explanation = null;
        }
        Object.assign(state, read);
        stage = read.stage;
        break;
      }
    }
    // Everything up to the head is rendered now, so a poll reports only what comes after it.
    cursor = Math.max(cursor, state.project.headSeq + 1);
    const shown = shownReview();
    if (reviewed === null && pinnable(shown)) reviewed = shown;
    render();
    void startFromPack();
    showClaims(claimSink); // a failed load leaves the previous load's labels beside the previous load's content
  }

  async function readProject() {
    const project = one(await apiNativeRequest(projectPath("")), "project");
    // The page keeps the stage it opened on: following the head would put one stage's drafts, answers and statements
    // under the next one. The header says when the project is at another stage (movedNote).
    const viewStage = stage ?? (view.STAGES.includes(params.get("stage")) ? params.get("stage")
      : view.STAGES.includes(project.stage) ? project.stage : "activate");
    const [readiness, gates, revision, comments, members, diff, revisions, refs] = await Promise.all([
      apiNativeRequest(projectPath(`/readiness?stage=${viewStage}`)).then((data) => one(data, "readiness")),
      apiNativeRequest(projectPath("/gates")).then((data) => listOf(data, "gates")),
      // The resolved view (P2-42): Adapt's derived parts put back and checked by Studio; the stored form binds them by sha256.
      project.revisionNo > 0 ? apiNativeRequest(projectPath(`/revisions/${project.revisionNo}/resolved`)).then((data) => one(data, "revision")) : null,
      apiNativeRequest(projectPath("/comments")).then((data) => listOf(data, "comments")),
      apiNativeRequest(projectPath("/members")).catch((error) => ({ error: errorText(error) })),
      project.revisionNo > 1
        ? apiNativeRequest(projectPath(`/revisions/diff?from=${project.revisionNo - 1}&to=${project.revisionNo}`)).catch((error) => ({ error: errorText(error) }))
        : null,
      apiNativeRequest(projectPath("/revisions")).then((data) => listOf(data, "revisions")),
      apiNativeRequest(projectPath(`/evidence?revision=${project.revisionNo}`)).then((data) => listOf(data, "refs"))
    ]);
    // A revision past the head read above landed between the reads; the next load shows it.
    const atStage = revisions.filter((row) => row.stage === viewStage && Number.isSafeInteger(row.revisionNo) && row.revisionNo <= project.revisionNo)
      .map((row) => row.revisionNo);
    const stageNo = atStage.length > 0 ? Math.max(...atStage) : null;
    const stageRevision = stageNo === null ? null : stageNo === revision?.revisionNo ? revision
      : one(await apiNativeRequest(projectPath(`/revisions/${stageNo}/resolved`)), "revision");
    // Whether Studio's recorded understanding was made for the answers shown: after a reload Confirm binds the head shown then.
    const understandingCurrent = await start.understandingIsCurrent(stageRevision?.spec).catch(() => false);
    return { project, readiness, gates, revision, stageRevision, comments, members, diff, refs, stage: viewStage, understandingCurrent };
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
      questions: listOf(state.options?.questions?.[stage], "questions").map((question) => ({ ...question, example: start.placeholderOf(stage, question.id),
        ...(stage === "adapt" && Array.isArray(state.options?.catalogTerms?.[question.id]) ? { terms: state.options.catalogTerms[question.id] } : {}) })),
      answers: shownAnswers(), understandingCurrent: state.understandingCurrent, exampleOffered: start.FILLABLE.has(stage) && stage === state.project.stage };
    root.innerHTML = `${view.holdBanner(project)}${view.practiceBanner(project)}${start.renderStartHere(ctx)}${startPack && stage === "aspire" ? packs.packPanelHtml(startPack, state.project.revisionNo === packFilledAt ? packFilled ?? 0 : 0) : ""}${view.stageBanner(stage)}${conflict ? view.renderConflict(conflict) : ""}
      <section class="card"><h3 class="a4-project-name">${view.esc(project.name)}</h3><p class="muted">Agent <code>${view.esc(project.agentId)}</code> ·
        <span title="revision ${view.esc(project.revisionNo)}, head ${view.esc(project.headSeq)}">version ${view.esc(project.revisionNo)}</span></p>${view.stageLinks(project, stage)}${view.movedNote(project, stage)}
        <p class="muted">${view.esc(readiness.claimBoundary)}</p></section>
      <details class="card" data-a4-open="steps"><summary>The eight steps of a stage</summary><div id="a4Steps"></div></details>
      <div class="a4-cards">${stageCards(stage).map((card) => view.renderCard(card, ctx, state.comments)).join("")}</div>
      <section class="card"><h4>Differences</h4>${state.diff?.error ? `<p class="status-bad">${view.esc(state.diff.error)}</p>`
        : view.renderDifferences(state.diff, project)}</section>
      <section class="card" id="a4Missing" tabindex="-1"><h4>Missing requirements</h4>${view.renderMissing(readiness, stage, (key) => view.nameOf(ctx, key))}</section>
      ${view.renderLanes(readiness, state.refs, project.revisionNo)}${view.renderApprovalsBar(ctx)}${view.renderMembers(ctx)}
      <section class="card"><h4>Here now</h4><div id="a4Presence"></div></section>`;
    renderHandholdingSteps(root.querySelector("#a4Steps"), view.stepRows(project, stage));
    renderPresenceChips();
    foldAway();
    for (const details of root.querySelectorAll("details[data-a4-open]")) {
      if (toggled.has(detailsKey(details))) details.open = toggled.get(detailsKey(details));
    }
    for (const [key, field] of fields()) {
      if (drafts.has(key)) field.value = drafts.get(key);
      if (key === focused) { field.focus(); if (caret && typeof field.setSelectionRange === "function") field.setSelectionRange(...caret); }
    }
  }

  /**
   * One thing at a time: the section the next action lives in stays on the page, with the approvals bar; every other
   * section of the stage moves, unchanged, under one closed "Everything else" (What to do now opens it when it points there).
   */
  function foldAway() {
    const go = root.querySelector(".a4-start [data-a4-go]");
    let target = null;
    try { target = go ? root.querySelector(go.dataset.a4Go) : null; } catch { target = null; }
    const sections = [...root.querySelectorAll(":scope > .a4-cards > .a4-card, :scope > .a4-cards ~ :is(section, details, .a4-lanes)")];
    // A step that needs a second section too (acknowledging an item listed under Missing requirements) names it in data-a4-also.
    const also = go?.dataset.a4Also ?? null;
    // Never folded (A4-08): the members, the answers while the step asks for them, the specification while it is under
    // review, and the build card (its Native Tasks link) from Build to Review.
    const step = state.project.stage === stage ? state.project.step : null;
    const keep = [".a4-members", ...(step === "asked" ? ['[data-card="conversation"]'] : []),
      ...(["proposed", "reviewed"].includes(step) ? ['[data-card="specification"]'] : []),
      ...(["direction_approved", "built"].includes(step) ? ['[data-card="build"]'] : [])].join(", ");
    const rest = sections.filter((section) => !section.contains(target) && !section.matches(".a4-approvals") && !section.matches(keep)
      && !(also && section.matches(also)));
    if (rest.length === 0) return;
    const more = document.createElement("details");
    more.className = "card a4-more";
    more.dataset.a4Open = "more";
    more.innerHTML = `<summary>Everything else in this stage (${rest.length} sections: later steps, records and requirements)</summary>
      <p class="muted">Nothing here is needed for the step above. It is all still recorded and readable.</p>`;
    root.append(more);
    more.append(...rest);
  }

  function renderPresenceChips() {
    const target = root.querySelector("#a4Presence");
    if (target) target.innerHTML = view.renderPresence(presence, presenceError);
  }

  /** Binds the gate the user reviewed; the open seq is readiness's `requestedSeq` for that gate (currentGates). */
  function decisionBinding() {
    const { open } = view.currentGates(state.gates, stage, state.readiness);
    const seq = open ? view.gateSeq(open, state.project.headSeq) : null;
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
    const changed = view.changedParts(spec, base.spec);
    return { label: "Propose this specification", path: stagePath("propose"), spec, base, clears: ["specification:spec"],
      got: () => { specBase = null; },
      // P1-57 takes no parent for a first revision (a null is refused).
      body: { spec: changed, ...(base.revisionNo > 0 ? { parentRevisionNo: base.revisionNo } : {}), expectedHeadSeq: base.headSeq, clientRequestId: uuid() } };
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
    // A reload drops this page's statement; Studio's recorded understanding of the current answers is then confirmed at the
    // head shown (Studio refuses it if the project moved since, or if the understanding is not of the current answers).
    if (!reflection && state.understandingCurrent === true && state.project.stage === stage && state.project.step === "asked") return headBinding();
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
    // Understand, Explain, Build and Review send the text only when written: a stage with producers (Aspire) runs AMC's
    // step and records it as a note beside it; Studio refuses an empty one where no producer is registered (400 INPUT_INVALID).
    const note = (field) => (value(field) ? { content: value(field) } : {});
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
        // Only the fields the user changed: an untouched carried answer is never re-sent as the user's own statement. A field
        // the user emptied clears its answer (sent as null, which Studio records as no answer).
        const edited = [...scope.querySelectorAll("form[data-a4-answers] textarea[name]")]
          .filter((field) => field.value.trim() !== field.defaultValue.trim());
        if (edited.length === 0) throw new Error("No answer was changed. Nothing was sent.");
        return { ...post("Save answers", stagePath("answers"), { expectedHeadSeq: answerBase ?? state.project.headSeq, clientRequestId: uuid(),
          answers: edited.map((field) => ({ questionId: field.name, value: field.value.trim() ? answerValue(field) : null })) }, [], () => dropAnswerDrafts(card)), answers: true };
      }
      case "confirm-answer": {
        const answer = shownAnswers().find((row) => row.questionId === button.dataset.question);
        if (!answer) throw new Error("That answer is no longer shown. Nothing was sent.");
        return post("Confirm answer", stagePath("answers"), { ...headBinding(), answers: [{ questionId: answer.questionId, value: answer.value }] });
      }
      // Where a stage has no producer, Understand and Explain record the member's own text (P1-57's no-producer path).
      case "understand": {
        const sent = note("understanding");
        return post("Run Understand", stagePath("understand"), { ...sent, ...headBinding() }, [`${card}:understanding`],
          (data) => { reflection = { data, text: sent.content ?? "", headSeq: headSeqOf(data) }; });
      }
      case "confirm": return post("Confirm understanding", stagePath("confirm-understanding"), { confirmed: true, ...reflectionBinding() });
      case "explain": {
        const level = value("level");
        const sent = note("explanation");
        return post("Explain", stagePath("explain"), { ...sent, level, ...headBinding() }, [`${card}:explanation`],
          (data) => { explanation = { level, text: sent.content ?? "", data, headSeq: headSeqOf(data) }; });
      }
      case "propose": return proposeAction(scope);
      case "build": return post("Build", stagePath("build"), { ...note("content"), ...headBinding() }, [`${card}:content`]);
      case "review": return post("Review", stagePath("review"), { ...note("content"), ...headBinding() }, [`${card}:content`]);
      case "request-direction": return post("Request direction approval", stagePath("gates/direction/request"), headBinding(), [], repin);
      case "request-completion": return post("Request completion approval", stagePath("gates/completion/request"), headBinding(), [], repin);
      case "approve": return decide("approve", "Approve", (binding) => binding);
      case "deny": return decide("deny", "Deny", (binding) => binding);
      // P1-57's request-changes body is { reason, expectedGateSeq, clientRequestId, findings } and takes neither digest;
      // the pinned review is still checked here (decisionBinding) before anything is sent.
      case "request-changes": return decide("request-changes", "Request changes",
        ({ expectedGateSeq, clientRequestId }) => ({ findings: [], expectedGateSeq, clientRequestId }));
      case "complete": {
        const { met } = view.currentGates(state.gates, stage, state.readiness);
        if (!met) throw new Error("No approved gate is shown for this stage. Refresh before completing it.");
        // Both Activate gates run an inline effect whose lease token is answered once (the release's staging lease, the
        // deployment approval's production lease; design §10.4); this generic action would drop it.
        if (stage === "activate") throw new Error(`${view.ACTIVATE_COMPLETE}. Nothing was sent.`);
        return post(view.completeLabel(met, stage), stagePath("complete"), { gateId: reviewedFor(met).gateId, ...headBinding() });
      }
      case "hold": return post("Hold", projectPath("/hold"), { reason: reason(), ...headBinding() }, REASON);
      case "resume": return post("Resume", projectPath("/resume"), { reason: reason(), ...headBinding() }, REASON);
      // The item was listed by the viewed stage's readiness, which offers Acknowledge only at the project's current stage;
      // sending that stage binds it, so a project that moved on since is refused (409 A4_STEP_ORDER), never acknowledged elsewhere.
      case "acknowledge": return post("Acknowledge", projectPath("/acknowledge"), { itemId: button.dataset.item, stage, reason: reason(), ...headBinding() }, REASON);
      // The attempt readiness named (owner only); the effect's own stage, which may not be the one viewed.
      case "retry-effect": return post("Retry effect", projectPath(`/stages/${encodeURIComponent(button.dataset.effectStage)}/effects/${
        encodeURIComponent(button.dataset.effect)}/retry`), { attemptId: button.dataset.attempt, ...headBinding() });
      case "add-member": {
        const row = button.closest("[data-principal]");
        // `projectRoles`: Studio refuses any body naming `roles` as an identity claim.
        // The add is a project transition: it supersedes an open gate, whose approvals then stop counting (docs/A4_FORGE.md).
        const { open, met } = view.currentGates(state.gates, stage, state.readiness);
        const live = open ?? met;
        return post("Add member", projectPath("/members"), { principalKey: row.dataset.principal,
          projectRoles: [row.querySelector('[name="role"]').value], ...headBinding() }, [`member:${row.dataset.principal}:role`],
          () => { if (live) tell(`Member added. The open ${live.gate} approval request was superseded by the add: request it again.`); });
      }
      case "invite-member": {
        const username = value("inviteUsername");
        if (!username) throw new Error("Write their user name first. Nothing was sent.");
        const auditor = scope.querySelector('[name="inviteAuditor"]')?.checked === true;
        // Each person added stays listed with their first password until the page is left, so adding a second keeps the first's.
        const link = `${location.origin}${location.pathname}?project=${encodeURIComponent(projectId)}&stage=${encodeURIComponent(stage)}`;
        return post("Invite", projectPath("/members/invite"), { username, workspaceRoles: auditor ? ["APPROVER", "AUDITOR"] : ["APPROVER"], ...headBinding() }, [`${scope.dataset?.card ?? "page"}:inviteUsername`],
          (data) => { invited.push(start.invitedText(data)); tell(`${invited.join(" ")} ${start.approverHowTo(link)}`); });
      }
      case "comment": {
        const body = value("comment");
        if (!body) throw new Error("Write a comment first.");
        if (new TextEncoder().encode(body).byteLength > view.COMMENT_MAX_BYTES) throw new Error("Comments are limited to 8 KiB. Nothing was sent.");
        // Card ids repeat across stages, so the thread key is stage-qualified, as presence is. Studio records the
        // revision and stage from the head.
        return post("Comment", projectPath("/comments"), { cardId: `${stage}:${card}`, body, clientRequestId: uuid() }, [`${card}:comment`]);
      }
      default: {
        // A stage lane's own action (registerStageAction): only this project's routes or a native task route, or a local
        // one (`local: true`, e.g. a read the card shows) that sends nothing here and re-renders once its `pending` settles.
        const custom = stageAction(stage, name)?.({ button, value, headBinding, uuid, projectPath, projectId, me });
        if (!custom) throw new Error(`Unknown A4 action ${name}.`);
        if (custom.local === true) return custom;
        if (typeof custom.path !== "string" || !(custom.path.startsWith(`${projectPath("")}/`) || /^\/api\/v1\/native-tasks(?:\/|$)/.test(custom.path))) {
          throw new Error(`The ${name} action names a route outside this project. Nothing was sent.`);
        }
        return post(custom.label, custom.path, custom.body, custom.clears ?? [], typeof custom.got === "function" ? custom.got : undefined);
      }
    }
  }

  async function openConflict(action, error) {
    const head = one(await apiNativeRequest(projectPath("")), "project");
    // P1-57 takes a proposal only at step `explained` (409 A4_STEP_ORDER otherwise, before it compares the parent), so
    // once another member has proposed, the card offers Reload only. Nothing is re-sent unseen: a head that moved without
    // a new revision still shows the card, with Studio's code and the head it read, and the member applies on top.
    const proposable = head.stage === stage && head.step === "explained";
    const headRevision = head.revisionNo > 0 ? one(await apiNativeRequest(projectPath(`/revisions/${head.revisionNo}`)), "revision") : null;
    const headSpec = view.editableSpec(headRevision?.spec);
    conflict = { code: error.code, baseRevisionNo: action.base.revisionNo, baseSpec: action.base.spec, headRevisionNo: head.revisionNo, headSeq: head.headSeq, headSpec,
      headStage: head.stage, headStep: head.step, proposable, mineSpec: action.spec,
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
    // Build and Review run AMC's producers before Studio answers; the page says it is waiting, then reloads (action.after).
    tell(`${action.label}: waiting for Studio…`);
    try {
      data = await send(action);
    } catch (error) {
      if (error?.status === 409 && (error.code === "A4_STALE_HEAD" || error.code === "A4_STEP_ORDER") && action.spec) return openConflict(action, error);
      if (error?.status === 409) await load().catch(showError);
      // Another write moved the head while the member typed: never re-sent unseen (a new revision would supersede gates and
      // decisions they have not seen). Save binds the head shown now, once they press it again.
      if (error?.status === 409 && error.code === "A4_STALE_HEAD" && action.answers) {
        answerBase = state.project.headSeq;
        throw new Error(`The project moved since you began (r${state.project.revisionNo}, step ${state.project.step}). Nothing was saved; review it and press Save answers again.`);
      }
      throw error;
    }
    const refreshing = `${action.label}: recorded; refreshing…`;
    tell(refreshing);
    await action.after(data);
    if (notice?.textContent === refreshing) tell(""); // a `got` that told the user something keeps its message
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
    if (name === "use-example") return useExample();
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
      // The draft and the head are both diffed against the base the draft was written from (specBase, kept until it is
      // proposed or discarded), never a refused apply's base: that head's own edits would otherwise be reverted on top of
      // the next one. Paths both changed are listed first and written only once the member confirms that exact list.
      const draft = drafts.get("specification:spec");
      const draftSpec = draft === undefined ? conflict.mineSpec : parseSpec(draft);
      const from = specBase?.spec ?? conflict.baseSpec;
      const mine = view.jsonDiff(from, draftSpec);
      const clashes = view.clashingChanges(view.jsonDiff(from, conflict.headSpec), mine);
      const clashKey = JSON.stringify(clashes.map((row) => row.path));
      if (clashes.length > 0 && button.dataset.a4Confirm !== clashKey) {
        conflict = { ...conflict, clashes, clashKey };
        render();
        return tell("Your changes and the head's collide; the conflict card lists where. Nothing was sent.");
      }
      const merged = view.mergeOnTop(conflict.headSpec, mine, draftSpec, clashes);
      const base = { revisionNo: conflict.headRevisionNo, headSeq: conflict.headSeq, spec: conflict.headSpec };
      conflict = null;
      return run(specAction(merged, base));
    }
    const action = actionFor(name, button);
    if (action.local === true) {
      await action.pending;
      return render();
    }
    return run(action);
  }

  /**
   * The start panel's primary action: it moves to the page control it names and, for a step button, presses it, so the
   * step runs through the same handler, bindings and checks as the button itself. A disabled control says why instead.
   */
  function goTo(go) {
    const target = root.querySelector(go.dataset.a4Go);
    if (!target) return tell("That control is not on this page yet. Reload the page.");
    // Open every fold around the target, "Everything else" included, so the step never points at a hidden field (A4-08).
    for (let fold = target.closest("details"); fold; fold = fold.parentElement?.closest("details")) fold.open = true;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    if (target.disabled) {
      target.focus();
      return tell(target.title || "That action is not available yet.");
    }
    target.focus({ preventScroll: true });
    if (go.hasAttribute("data-a4-press") && target.matches("button[data-a4-action]")) target.click();
    else if (target.matches("a[href]")) target.click(); // a link the step needs (the build session on Native Tasks) is followed
  }

  /** Fills each empty answer field that `values` has text for; returns how many it filled. */
  function fillEmptyAnswers(values) {
    let filled = 0;
    for (const field of root.querySelectorAll("form[data-a4-answers] textarea[name]")) {
      if (field.value.trim() || typeof values[field.name] !== "string" || !values[field.name]) continue;
      field.value = values[field.name];
      field.dispatchEvent(new Event("input", { bubbles: true }));
      filled += 1;
    }
    return filled;
  }

  /** Once per page load, on the project's own Aspire Ask step: the pack named in ?pack= suggests its answers. */
  async function startFromPack() {
    if (!startPackId || packFilled !== null || stage !== "aspire" || state.project?.stage !== "aspire" || state.project?.step !== "asked") return;
    packFilled = 0;
    try {
      startPack = one(await apiGet(`/industry-packs/${encodeURIComponent(startPackId)}`), "pack");
    } catch {
      return tell("That Industry Pack could not be loaded, so nothing was filled in. The project itself is fine: answer the questions under Ask.");
    }
    render();
    packFilled = fillEmptyAnswers(packs.packAnswers(startPack));
    packFilledAt = state.project.revisionNo; // Save answers records a new revision; the panel then stops saying "not saved yet"
    render();
  }

  /** Fills each empty answer with this stage's example, marked "(sample)" where it is free text (a4Start.EXAMPLES). */
  function useExample() {
    const filled = fillEmptyAnswers(start.exampleFor(stage, stage === "aspire" && startPackId ? packs.PACK_FIELDS : []));
    tell(filled ? `Filled ${filled} empty answer(s) with sample text, marked (sample). Check them, change what you like, then press Save answers.`
      : "Every answer that has an example is already filled. Nothing was changed.");
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
    const go = event.target.closest?.("[data-a4-go]");
    if (go) return goTo(go);
    if (event.target.closest?.("[data-a4-copy-link]")) {
      const status = root.querySelector("[data-a4-copy-status]");
      const say = (text) => { if (status) status.textContent = text; };
      void navigator.clipboard?.writeText(location.href).then(() => say("Copied. Send it to the person who approves."),
        () => say(`Copy unavailable. The link is ${location.href}`)) ?? say(`Copy unavailable. The link is ${location.href}`);
      return;
    }
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

/** The console's top bar on the A4 pages too (C-15): workspace, the guide, Records, a task and, signed in, Sign out. */
function addTopbar(who) {
  const main = document.querySelector("main");
  if (!main || main.querySelector(".topbar")) return;
  const bar = Object.assign(document.createElement("section"), { className: "topbar" });
  const prefix = location.pathname.match(/^\/w\/([^/]+)\//)?.[1];
  bar.innerHTML = topbarHtml({ workspace: prefix ? decodeURIComponent(prefix) : "local", demoMode: prefix === "demo", me: who });
  main.insertBefore(bar, main.firstChild);
  bar.querySelector("#signOutBtn")?.addEventListener("click", () => void logout().then(() => location.assign("./login"), showError));
}

async function main() {
  if (page === "home") return showHomeEntry();
  // A loading skeleton until the first render (motion.css animates [aria-busy]); every render replaces it.
  root.setAttribute("aria-busy", "true");
  root.innerHTML = '<section class="card skeleton" aria-label="Loading"><p class="muted">Loading…</p></section>';
  setMe(await whoami().catch(() => null));
  addTopbar(me);
  if (!me) {
    root.removeAttribute("aria-busy");
    const next = `${page}${location.search}`;
    root.innerHTML = `<section class="card a4-start"><h2>Sign in to build an agent</h2><p>Agent projects belong to a workspace, so sign in first.
      You come back to this page afterwards.</p><p><a class="button" href="./login?next=${encodeURIComponent(next)}">Sign in</a></p></section>`;
    return;
  }
  // The demo session is refused every A4 route (DEMO_REFUSED): say why and how to start a workspace of your own instead.
  if (me.userId === "local-demo") {
    root.innerHTML = start.demoHtml();
    return;
  }
  const options = await previewOptions();
  if (!options) {
    root.innerHTML = start.previewOffHtml();
    return;
  }
  document.getElementById("a4NavLink")?.removeAttribute("hidden");
  // The strip prints claimLabel verbatim. A bare envelope (a readiness item's `claim`) carries no server label, so it
  // stays off the strip rather than being shown with a result word the page would have to supply.
  let deliver = null;
  const strip = installClaimStrip(page, (listener) => { deliver = listener; });
  onClaims((claims) => claimSink?.push(...claims.filter((claim) => typeof claim?.claimLabel === "string")));
  setShowClaims((claims) => {
    strip?.reset();
    if (claims.length > 0) deliver?.(claims);
  });
  if (page === "a4") return renderListPage(options);
  const projectId = params.get("project");
  if (!projectId) {
    root.innerHTML = `<section class="card"><p>Choose a project from <a href="./a4">agent projects</a>.</p></section>`;
    return;
  }
  return mountProject(projectId, options);
}

// The first render (or a failure) ends the loading state; a failed load says so and offers Retry (brief item 7).
main().catch((error) => {
  if (root && root.querySelector(".skeleton")) {
    root.innerHTML = `<section class="card"><h3>This page did not load</h3><p>${start.errorHtml(error)}</p>
      <p><button type="button" data-a4-reload>Retry</button></p></section>`;
    root.querySelector("[data-a4-reload]")?.addEventListener("click", () => location.reload());
  }
  showError(error);
}).finally(() => root?.removeAttribute("aria-busy"));
