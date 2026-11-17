// A4 Studio first-run guidance: the "start here" panel (what a project is, the four stages, what the current step needs
// and one primary action), who must approve a gate, errors in sentences, the preview-off and demo pages, and example
// answers. Pure: data in, HTML or plain values out; every server string goes through esc(). Studio re-checks every
// action, so the primary action only points at the page's own buttons and never decides anything itself.
import { QUESTION_LABELS } from "./a4Questions.js";
import { SELF_APPROVE, decidedByMe, selfApproves, selfCountsOnce } from "./a4Who.js";
import { itemTitle } from "./a4Plain.js";
import { actionButton, reasonsText, STAGES, STAGE_PLAIN, STEP_NEXT, STEP_PLAIN, STEP_TITLES, TRUTH, esc, previewNoticeHtml, renderCreateForm } from "./a4View.js";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const title = (stage) => (typeof stage === "string" && stage ? stage[0].toUpperCase() + stage.slice(1) : "");
const STEPS = ["asked", "understood", "explained", "proposed", "direction_approved", "built", "reviewed", "completion_approved"];

const WHAT_IS_A_PROJECT = "An agent project takes one agent from a brief to a recorded deployment in four stages. "
  + "Each stage asks you questions, AMC drafts from your answers, and a second person approves before the project moves on.";
/** How far one person gets (docs/A4_FORGE.md, "How many people a walk needs"): the default policy's first three gates take one approval. */
export const PRACTICE_IS = "A practice project lets you try A4 Forge alone. Each stage asks you questions, AMC drafts from your answers, and you "
  + "approve your own steps; each such approval is recorded as self-approved. Alone you can get as far as building the agent in step 2, Build it "
  + "(Assemble): its final approval and every step after it need two people other than you, and the guide asks for them when they are needed.";
const SOD = "The person who wrote, built or requested a stage cannot approve it (separation of duties)";
const NOT_INDEPENDENT = "A second approver in the same workspace meets separation of duties; it is not an independent review";

/** The workspace role a new approver needs for a gate that takes `rolesAllowed` (OWNER is never handed out here). */
function roleFor(rolesAllowed) {
  const roles = list(rolesAllowed).filter((role) => role !== "OWNER");
  return roles.includes("APPROVER") ? "APPROVER" : roles[0] ?? "APPROVER";
}
const addUserCommand = (role = "APPROVER") => `amc user add --username <name> --role ${role}`;
const code = (text) => `<code>${esc(text)}</code>`;

/** The four stages as a stepper: earlier stages done, the project's stage current, the viewed one marked. */
function renderStepper(project, stage) {
  const at = STAGES.indexOf(project.stage);
  const id = encodeURIComponent(project.projectId ?? "");
  return `<ol class="a4-stepper" aria-label="Stages">${STAGES.map((name, index) => {
    const state = at < 0 ? "" : index < at ? "done" : index === at ? "current" : "later";
    const words = state === "done" ? "done" : state === "current" ? "current stage" : state === "later" ? "later" : "";
    return `<li class="a4-stepper-${state}"${name === project.stage ? ' aria-current="step"' : ""}><a href="./a4Project?project=${id}&stage=${name}"${
      name === stage ? ' data-viewing="true"' : ""}><strong>${index + 1}. ${esc(STAGE_PLAIN[name])}</strong> <small class="muted">${title(name)}</small>
      <span class="a4-stepper-state">${esc(words)}${name === stage && name !== project.stage ? " · you are viewing it" : ""}</span></a></li>`;
  }).join("")}</ol>`;
}

const itemOf = (readiness, id) => list(readiness?.items).find((item) => item.id === id) ?? null;
const codesOf = (readiness, id) => list(itemOf(readiness, id)?.reasonCodes);
const prefixed = (codes, prefix) => codes.filter((value) => String(value).startsWith(prefix)).map((value) => String(value).slice(prefix.length));
/** Items an owner acknowledges before asking for approval (they hold progress, and an acknowledgement supersedes a gate). */
const toAcknowledge = (readiness) => list(readiness?.items).filter((item) => item.mandatory && item.status === "WAITING"
  && item.acknowledged === null && list(readiness?.allowed?.requestGate?.reasonCodes).includes(item.id));

/**
 * What the viewed stage needs now and the one action that does it: `{ now, why?, act? }`. `act.press` names a page button
 * (data-a4-action) the primary action presses; `act.focus` a field it moves to; `act.href` a link. Pure, so it is tested.
 */
export function nextMove(ctx) {
  const move = rawMove(ctx);
  // A step this person's roles cannot take (an approver at Build, say) is not offered as their next action.
  const key = PRESS_ALLOWED[move.act?.press];
  const codes = key ? list(ctx.allowed?.[key]?.reasonCodes) : [];
  if (codes.includes("PRINCIPAL_ROLE_INSUFFICIENT") || codes.includes("PRINCIPAL_NOT_MEMBER")) {
    return { now: `${move.now} A project owner or builder takes this step; nothing is needed from you now.` };
  }
  // A requirement still holds the step (a lowercase code is a readiness item): that requirement comes first.
  const holding = codes.map((value) => itemOf(ctx.readiness, value)).find((entry) => entry && entry.status !== "READY" && entry.status !== "COMPLETE");
  if (holding) {
    return { now: `First: ${holding.nextAction?.label ?? `${holding.id} is not ready yet`}. Then ${move.act.label[0].toLowerCase()}${move.act.label.slice(1)}.`,
      act: ITEM_ACTIONS[holding.id] ? { label: ITEM_ACTIONS[holding.id][0], press: ITEM_ACTIONS[holding.id][1] } : { label: "Show what is missing", focus: "#a4Missing" } };
  }
  return move;
}
/** Requirements a stage card's own button settles. */
const ITEM_ACTIONS = { context_reaches_runtime_frame: ["Run the context probe", "probe"] };
/** The readiness.allowed entry each pressed step needs. */
const PRESS_ALLOWED = { understand: "understand", confirm: "understand", explain: "explain", propose: "propose", build: "build", review: "review",
  complete: "progress", "request-direction": "requestGate", "request-completion": "requestGate", "open-effect": "openEffect", "open-release": "openEffect", release: "release" };

function rawMove(ctx) {
  const { project, readiness, stage } = ctx;
  if (project.stage === "retired") return { now: "This project is retired. Its records stay readable." };
  if (stage !== project.stage) {
    return { now: `You are viewing ${title(stage)}. The project is at ${title(project.stage)}, step ${STEP_TITLES[project.step] ?? project.step}.`,
      act: { label: `Go to ${title(project.stage)}`, href: `./a4Project?project=${encodeURIComponent(project.projectId)}&stage=${project.stage}` } };
  }
  if (project.hold) return { now: "The project is on hold, so nothing can change until a project owner resumes it (Approvals card, More, Resume, with a reason).",
    act: { label: "Write a reason to resume", focus: '.a4-approvals [name="reason"]' } };
  const sameHost = itemOf(readiness, "deployment.same_host");
  if (sameHost?.status === "BLOCKED") return { now: sameHost.nextAction?.label ?? "This Studio cannot deploy this release.", stop: true };
  // Files AMC recorded changed underneath (another AMC process rewrote one): a new revision records them again. At Ask the
  // answers the step asks for are that revision, so the step itself is the way on.
  const blocked = list(readiness?.items).find((item) => item.mandatory && item.status === "BLOCKED" && !["gate.direction", "gate.completion"].includes(item.id)
    && !(item.id === "resources.current" && project.step === "asked"));
  if (blocked?.id === "resources.current") return { now: "Some of the agent's files changed after this step was recorded (listed under Missing requirements). "
    + "To go on, change any answer under Ask and press Save answers: AMC records a new revision with the files as they are now, and you run the steps again from there.",
  act: { label: "Change an answer", focus: "form[data-a4-answers] textarea" } };
  if (blocked) return { now: `Something blocks this stage: ${blocked.nextAction?.label ?? blocked.id}.`, why: `Item ${blocked.id}; see Missing requirements.`,
    act: { label: "Show what is missing", focus: "#a4Missing" } };
  const step = project.step;
  if (step === "asked") return askMove(ctx);
  if (step === "understood") return { now: "Explain: AMC explains the choices it will make, at the level you pick.", act: { label: "Explain", press: "explain" } };
  if (step === "explained") return { now: "Propose: AMC drafts this stage's specification from your answers. You review it before anyone approves it.",
    act: { label: "Propose", press: "propose" } };
  if (step === "proposed") return gateMove(ctx, "direction");
  if (step === "direction_approved") {
    if (stage === "activate") return { now: "Activate's build is the release: the Release card builds it once the release approval is in.", act: { label: "Open the Release card", focus: '[data-card="release"]' } };
    // Assemble's Build starts a session: while storage admission holds every new session (Studio's residencyHeld) it is refused, so the hold comes first.
    const held = stage === "assemble" && typeof project.residencyHeld === "string" ? `First: ${HOLD_WORDS} Until then Studio refuses Build and writes nothing. ` : "";
    return { now: `${held}Build: AMC writes what the approved direction describes. Every file it writes is recorded with its digest.`, act: { label: "Build", press: "build" } };
  }
  if (step === "built") {
    if (stage === "assemble" && list(ctx.allowed?.review?.reasonCodes).some((value) => SESSION_CODES.includes(value))) return sessionMove(ctx);
    return { now: "Review: AMC checks what was built; you can add your own findings.", act: { label: "Review", press: "review" } };
  }
  if (step === "reviewed") return gateMove(ctx, "completion");
  const nextStage = STAGES[STAGES.indexOf(stage) + 1];
  return nextStage ? { now: `${title(stage)} is complete.`, act: { label: `Go to ${title(nextStage)}`, href: `./a4Project?project=${encodeURIComponent(project.projectId)}&stage=${nextStage}` } }
    : { now: `${title(stage)} is complete.` };
}

/**
 * Activate once its plan is approved: the release is a second request (release_effect, read from the engine request's
 * status), opened by a project owner, approved by the project's approvers on the Release card, then released by an owner.
 */
function releaseMove(ctx) {
  const codes = codesOf(ctx.readiness, "release_effect");
  const status = prefixed(codes, "APPROVAL_STATUS:")[0];
  const card = '[data-card="release"]';
  const owner = ctx.allowed?.openEffect?.allowed === true;
  if (codes.includes("EFFECT_GATE_NOT_OPEN") || (status && ["DENIED", "EXPIRED", "CANCELLED"].includes(status))) {
    const again = status ? `The release request was not approved (${status}), so a new one is needed. ` : "";
    return owner ? { now: `${again}The plan is approved. Releasing it is a second request: open the release request on the Release card, then the project's approvers approve it there.`,
      act: { label: "Open the release request", press: "open-release" } }
      : { now: `${again}The plan is approved. A project owner opens the release request next; the project's approvers then approve it on the Release card.`, why: WAITING_HOW, act: COPY_LINK };
  }
  if (status === "PENDING") {
    const requestId = String(prefixed(codes, "APPROVAL_REQUEST:")[0] ?? "").split(":")[0];
    const excluded = typeof ctx.me?.userId === "string" && list(liveGate(ctx, "direction")?.excludedKeys).some((key) => String(key).endsWith(`:${ctx.me.userId}`));
    if (requestId && decidedByMe(ctx.me?.username, requestId)) return { now: "You have decided the release request. Waiting for the other approvers on the Release card.", why: WAITING_HOW, act: COPY_LINK };
    if (!excluded && ctx.allowed?.requestChanges?.allowed === true) return { now: "The release request waits for your approval: the approval of the plan does not count for it. "
      + "Write a reason on the Release card, then press Approve there.", act: { label: "Write your reason", focus: `${card} [name="release-reason"]` } };
    return { now: "Waiting for the project's approvers to approve the release request on the Release card. The approvals of the plan do not count for it.", why: WAITING_HOW, act: COPY_LINK };
  }
  if (status === "QUORUM_MET") {
    return ctx.allowed?.release?.allowed === true ? { now: "The release request is approved. Release it on the Release card: AMC builds the signed package and shows the staging lease token once.",
      act: { label: "Release", press: "release" } } : { now: "The release request is approved. A project owner releases it next on the Release card." };
  }
  return { now: "Approved. Activate's release and deployment approval are completed on the Release card.", act: { label: "Open the Release card", focus: card } };
}

/**
 * Assemble between Build and Review. Studio reads the build session for the page (allowed.review carries BUILD_SESSION_OPEN,
 * BUILD_RUNNING or SESSION_OWNER_REQUIRED while Review would refuse): the one action opens that session on Native Tasks, whose
 * "Back to the agent project" returns here.
 */
function sessionMove(ctx) {
  const codes = list(ctx.allowed?.review?.reasonCodes);
  const session = list(ctx.stageRevision?.spec?.build?.sessions)[0];
  const href = session ? `./native-tasks?agent=${encodeURIComponent(session.start?.agentId ?? ctx.project.agentId)}&task=${encodeURIComponent(session.taskId)}`
    + `&project=${encodeURIComponent(ctx.project.projectId)}` : "./native-tasks";
  // Only the session's owner can read it, so this page cannot tell whether it started: say what is true either way.
  if (codes.includes("SESSION_OWNER_REQUIRED")) return { now: `${session?.ownerUsername ? `${session.ownerUsername} pressed Build, and only they` : "Only the person who pressed Build"} `
    + "can see its build session. If it did not start, they press Build again; if it ran, they close it and run Review." };
  if (codes.includes("BUILD_RUNNING")) return { now: "The build session is still running. Open it, wait until it stops, then press Close and verify there.", act: { label: "Open the build session", href } };
  // The session never started (BUILD_RETRYABLE): Build runs again from here, under the same checks as the first Build.
  const again = codes.includes("BUILD_RETRYABLE") ? { label: "Build again", press: "build" } : undefined;
  if (codes.includes("NATIVE_RESIDENCY_REFUSED")) return { now: `The build session did not start. ${HOLD_WORDS} After that, press Build again.`, act: again };
  if (again) return { now: "The build session did not start, so the agent was not built. Press Build again: it runs the same checks and starts a new build session.", act: again };
  // Studio's words when a residency check refused the session's request (the project read's buildRefusal), then the way on.
  const refused = typeof ctx.project.buildRefusal === "string" ? ctx.project.buildRefusal : null;
  if (codes.includes("BUILD_FAILED") && refused) return { now: `The build session stopped. ${refused} Once an owner has signed the changed registry, open the build `
    + "session on Native Tasks: press Release for later if it is offered, then Resume session and send a follow-up.", act: { label: "Open the build session", href } };
  if (codes.includes("BUILD_FAILED")) return { now: "The build session did not finish. Open it on Native Tasks: press Release for later if it is offered, then Resume session. "
    + "Then send a follow-up, or press Close and verify and come back for Review.", act: { label: "Open the build session", href } };
  return { now: "Close the build session: it opens on Native Tasks. Press Close and verify there, then Back to the agent project. Review comes next.",
    act: { label: "Close the build session", href } };
}
/** Storage admission's hold and the commands that end it (src/residency/admissionWords.ts). */
const HOLD_WORDS = "AMC holds every new session in this workspace until a signed destination registry matches its active compiled plan. "
  + "An owner runs amc residency status in the workspace folder to see what is missing, then amc residency init --file <registry.yaml>.";
/** Review's refusals that come from the build session itself (assembleBuild.reviewRefusals). */
const SESSION_CODES = ["BUILD_SESSION_OPEN", "BUILD_RUNNING", "BUILD_FAILED", "BUILD_RETRYABLE", "NATIVE_RESIDENCY_REFUSED", "SESSION_OWNER_REQUIRED"];

function askMove(ctx) {
  const codes = codesOf(ctx.readiness, "ask_complete");
  const stale = prefixed(codes, "ANSWER_STALE:");
  if (stale.length) return { now: "Some answers need confirming because an answer they depend on changed. Confirm each one that is still correct.",
    act: { label: "Confirm the first answer", focus: `[data-a4-action="confirm-answer"][data-question="${esc(stale[0])}"]` } };
  if (prefixed(codes, "CARRIED_MISSING:").length) return { now: "Run Understand first: it brings in your answers from the earlier stages, then you answer the new questions.",
    act: { label: "Run Understand", press: "understand" } };
  // An answer AMC does not accept is named, with what it takes, instead of being counted with the empty ones.
  const invalid = prefixed(codes, "ANSWER_INVALID:").find((id) => list(ctx.questions).some((question) => question.id === id));
  if (invalid) {
    const question = list(ctx.questions).find((entry) => entry.id === invalid);
    const label = QUESTION_LABELS[invalid]?.[0] ?? question.prompt ?? invalid;
    return { now: `AMC does not accept your answer to "${label}". ${question.prompt ?? ""}${Array.isArray(question.terms) && question.terms.length
      ? ` It takes: ${question.terms.join(", ")}.` : ""} Change it under "Change my answers", or empty the field to clear it, then press Save answers.`,
    act: { label: "Change that answer", focus: `form[data-a4-answers] [name="${esc(invalid)}"]` } };
  }
  const missing = prefixed(codes, "ANSWER_MISSING:");
  const fillable = missing.find((id) => list(ctx.questions).some((question) => question.id === id && id !== "expertise"));
  if (fillable) return { now: `Answer the questions marked (required) under Ask, then press Save answers. ${missing.length} still need an answer.`,
    act: { label: "Answer the first question", focus: `form[data-a4-answers] [name="${esc(fillable)}"]` } };
  if (ctx.reflection || ctx.understandingCurrent) return { now: "Check what AMC understood from your answers. If it is right, confirm it; if not, change your answers.",
    act: { label: "Yes, that's it", press: "confirm" } };
  return { now: "Run Understand: AMC reads your answers and says back what it understood.", act: { label: "Run Understand", press: "understand" } };
}

/** What the panel's Add a person answered, in words: the first password once and what did not finish (approverHowTo follows once). */
export function invitedText(data) {
  const name = typeof data?.user?.username === "string" ? data.user.username : "The person";
  const added = data?.memberAdded === false ? `${name}'s account is ready, but adding them to this project did not finish: add them on the Members card. `
    : `${name} is now an approver on this project. `;
  const password = typeof data?.firstPassword === "string" ? `Their first password, shown only this once: ${data.firstPassword}. Write it down now and give it to them yourself. `
    : `${name} already had an account and keeps its password; if they no longer have it, a workspace owner sets a new one with amc user password ${name} in the workspace folder. `;
  return `${added}${password}`;
}

/** How the person who has to act reaches the decision, and the one action for whoever waits: copy this page's link. */
const WAITING_HOW = "They sign in on their own device, or in a private window on this one, then open this page's link: the approval waits for them there.";
/** After a person is added: how they approve, with the link that opens this project at its stage. */
export const approverHowTo = (url) => `To approve, they sign in on their own device, or in a private window on this one (a new private window, so you stay signed in here), `
  + `with their user name and password, then open ${url}. The approval waits for them at the top of that page.`;
const COPY_LINK = { label: "Copy link to this page", copy: true };

/** What acknowledging an item accepts, in a sentence (the item id stays beside it). */
const ACK_PLAIN = { "sod.self_provisioned": "every user here was created in this one workspace, so AMC cannot show that two approvers are two different people. Acknowledging says you accept that" };

/** The viewed stage's `kind` gate as readiness states it, joined with its /gates record (exclusions, request, decisions). */
function liveGate(ctx, kind) {
  const view = ctx.readiness?.gates?.[kind];
  return isObject(view) ? { ...list(ctx.gates).find((row) => row.gateId === view.gateId), ...view } : null;
}

function gateMove(ctx, kind) {
  const { readiness, stage, me } = ctx;
  const gate = liveGate(ctx, kind);
  const status = gate?.status;
  if (status === "QUORUM_MET") {
    if (kind === "direction" && stage !== "activate") return { now: "The direction is approved. Use the approval to move on to Build.", act: { label: "Continue to Build", press: "complete" } };
    if (stage === "activate") return kind === "direction" ? releaseMove(ctx) : { now: "Approved. Activate's release and deployment approval are completed on the Release card.",
      act: { label: "Open the Release card", focus: '[data-card="release"]' } };
    // The second request completing applies: Assemble's resources (effect_gate), or a regulated Adapt plan's activation
    // (plan_review_opened, required while progress waits for plan_activated); a non-regulated Adapt completes without it.
    const adapt = stage === "adapt";
    const effect = codesOf(readiness, adapt ? "plan_review_opened" : "effect_gate");
    const what = adapt ? "activates the plan" : "applies what was built";
    const cardName = adapt ? "Plan activation card" : "Completion effect card";
    const cardSel = adapt ? '[data-card="activation"]' : '[data-card="effect"]';
    const needed = !adapt || list(ctx.allowed?.progress?.reasonCodes).includes("plan_activated") || codesOf(readiness, "plan_activated").includes("ACTIVATED_AT_COMPLETION");
    if (needed && effect.includes("EFFECT_GATE_NOT_OPEN")) return { effect: true, now: `Approved. Completing ${title(stage)} ${what}, which is a second request: `
      + `a project owner opens it, then two approvers approve it on the ${cardName}.`, act: { label: adapt ? "Open the plan review" : "Ask for the second approval that applies the build", press: "open-effect" } };
    const effectStatus = prefixed(effect, "APPROVAL_STATUS:")[0];
    if (needed && effectStatus && effectStatus !== "QUORUM_MET" && effectStatus !== "CONSUMED") {
      // Whoever the completion gate excludes (its requester, authors, builders) is excluded from the effect's request too.
      const excludedHere = typeof me?.userId === "string" && list(liveGate(ctx, "completion")?.excludedKeys).some((key) => String(key).endsWith(`:${me.userId}`));
      // Readiness names no engine decisions; this tab remembers its own (a4Who.decidedByMe), as the card's buttons do.
      const requestId = String(prefixed(effect, "APPROVAL_REQUEST:")[0] ?? "").split(":")[0];
      if (requestId && decidedByMe(me?.username, requestId)) return { effect: true, now: `You have decided the second request, which ${what}. `
        + `Waiting for the other approvers on the ${cardName} (now ${effectStatus}).`, why: WAITING_HOW, act: COPY_LINK };
      if (!excludedHere && ctx.allowed?.requestChanges?.allowed === true) return { effect: true, now: `Your approval is needed on a second request, which ${what}: `
        + `the approval of the completion above does not count for it. Write a reason on the ${cardName}, then press Approve there. If you have approved it already, nothing more is needed from you.`,
      act: { label: "Write your reason", focus: `${cardSel} [name="engine-reason"]` } };
      return { effect: true, now: `Waiting for the project's approvers to approve the second request, which ${what}, on the ${cardName} (now ${effectStatus}). The approvals of the completion above do not count for it.`,
        why: WAITING_HOW, act: COPY_LINK };
    }
    return { now: `Approved. Complete ${title(stage)} to move the project on.`, act: { label: `Complete ${title(stage)}`, press: "complete" } };
  }
  if (status === "PENDING") {
    const sod = codesOf(readiness, "sod");
    if (sod.includes("QUORUM_UNREACHABLE")) {
      const auditor = codesOf(readiness, "gate.required_reviews").some((value) => String(value).includes("AUDITOR"));
      return peopleMove(ctx, { required: Number(prefixed(sod, "REQUIRED:")[0] ?? gate.required), eligible: Number(prefixed(sod, "ELIGIBLE:")[0] ?? 0),
        roleVote: auditor ? "AUDITOR" : null, open: true });
    }
    const excluded = typeof me?.userId === "string" && list(gate.excludedKeys).some((key) => String(key).endsWith(`:${me.userId}`));
    // Alone on a practice project the excluded author may approve: Studio records it as self-approved (A4 single-user rule).
    if (excluded && selfApproves(readiness, gate.required) && ctx.allowed?.decide?.allowed === true) {
      return { now: `${SELF_APPROVE} Write a reason in the Approvals card, then press Approve.`, act: { label: "Write your reason", focus: '.a4-approvals [name="reason"]' } };
    }
    if (excluded) return { now: `Waiting for ${gate.required > 1 ? "the other approvers" : "a second person"} to approve: ${gate.approvals ?? 0} of ${gate.required ?? "?"} approvals so far. ${SOD}, so someone else decides.`,
      why: WAITING_HOW, act: COPY_LINK };
    const refusals = list(ctx.allowed?.decide?.reasonCodes);
    if (refusals.includes("A4_DUPLICATE_DECISION")) return { now: `You have decided this one. Waiting for the other approvers: ${gate.approvals ?? 0} of ${gate.required ?? "?"} approvals so far.`,
      why: WAITING_HOW, act: COPY_LINK };
    if (refusals.includes("GATE_ROLE_NOT_ALLOWED")) {
      const roles = list(gate.request?.rolesAllowed);
      return { now: `Your workspace role cannot decide this approval: it takes ${roles.join(" or ") || "another role"}. A workspace owner can give you the role in the workspace folder with amc user role set ${me?.username ?? "<username>"} --roles <your roles>,${roleFor(roles)}.` };
    }
    // Someone who cannot approve reads why here, not only in a disabled button's tooltip (A4-07).
    if (ctx.allowed?.decide && ctx.allowed.decide.allowed !== true && refusals.length) {
      return { now: `You cannot approve this one yet. ${reasonsText(refusals)}`, act: { label: "Go to the Members card", focus: ".a4-members" } };
    }
    return { now: "Review the specification on this page, write a reason in the Approvals card, then Approve or Request changes.",
      act: { label: "Write your reason", focus: '.a4-approvals [name="reason"]' } };
  }
  if (status === "DENIED") return { now: "This revision was denied. Change an answer under Ask and save it to start a new revision.", act: { label: "Change an answer", focus: "form[data-a4-answers] textarea" } };
  // Before asking: an approval the project's people cannot reach is said first, with the form that adds them (Studio's nextGate preview).
  const next = readiness?.nextGate;
  if (next && next.gate === kind && Number.isSafeInteger(next.eligible) && next.eligible < next.required) return peopleMove(ctx, { ...next, open: false });
  // Alone, an acknowledgement only meets a second refusal: the words match amc a4 readiness and Studio's refusal (a4Words).
  if (codesOf(readiness, "sod.self_provisioned").includes("NO_SECOND_APPROVER") && list(readiness?.allowed?.requestGate?.reasonCodes).includes("sod.self_provisioned")) {
    return { now: "Nobody else on this project can approve it. Invite a second person on the Members card (Invite someone new), or add someone who can "
      + "already sign in there. To learn AMC alone, start a practice project instead.", act: { label: "Invite someone", focus: ".a4-invite input" } };
  }
  const ack = toAcknowledge(readiness);
  if (ack.length) return { now: `Before asking for approval, a project owner acknowledges ${ack.map((item) => `"${itemTitle(item.id)}"`).join(", ")}: ${ACK_PLAIN[ack[0].id] ?? ack[0].nextAction?.label ?? "see Missing requirements"}.`,
    why: "Write a short reason in the Approvals card, then press Acknowledge beside the item under What this step still needs (shown below). Acknowledging after the request would cancel it.",
    act: { label: "Write the reason", focus: '.a4-approvals [name="reason"]' }, also: "#a4Missing" };
  if (codesOf(readiness, "members.candidates").includes("NO_SECOND_APPROVER")) {
    const candidates = list(ctx.members?.candidates).filter((row) => !list(ctx.project.members).some((member) => member.principalKey === row.principalKey));
    return candidates.length
      ? { now: `Add a second person before asking for approval. ${SOD}. Pick a person on the Members card, choose the approver role and press Add.`,
        act: { label: "Choose an approver", focus: "li[data-principal] select" } }
      : { now: `Add a second person before asking for approval. ${SOD}, and you are the only person here. In the workspace folder run ${addUserCommand()}, then reload and add them on the Members card.`, stop: true };
  }
  // Never offer a request whose approval would then be held (A4-04): a missing second member or an unresolved plan
  // comes first, because fixing it afterwards cancels the approvals already given.
  const sodHeld = codesOf(readiness, "sod").some((value) => ["SOD_VIOLATION", "QUORUM_UNREACHABLE"].includes(String(value)));
  const later = [sodHeld ? itemOf(readiness, "sod") : null, itemOf(readiness, "plan_unresolved")]
    .find((entry) => entry && entry.mandatory && entry.status !== "READY" && entry.status !== "COMPLETE" && entry.acknowledged == null);
  // A regulated plan settles every requirement from facts: the guide names the facts still unknown and goes to the first one.
  const facts = later?.id === "plan_unresolved" ? prefixed(codesOf(readiness, "plan_no_missing_facts"), "ANSWER_NEEDED:") : [];
  if (facts.length) {
    return { now: `Before asking for approval: the rules this plan checks depend on facts nobody has given yet: ${facts.map((id) => `"${QUESTION_LABELS[id]?.[0] ?? id}"`).join(", ")}. `
      + "Answer them under Ask, choosing from the terms each question lists, and press Save answers. AMC then runs Understand, Explain and Propose again with you.",
    why: "A regulated project's plan must settle every requirement before it is approved; an unknown fact leaves the requirements it decides unresolved.",
    act: { label: "Answer the missing facts", focus: `form[data-a4-answers] [name="${esc(facts[0])}"]` } };
  }
  if (later) {
    return { now: `Before asking for approval: ${later.nextAction?.label ?? reasonsText([later.id])}`,
      why: "Do this first. Fixing it after the approval would cancel the approvals already given.",
      act: later.id === "sod" ? { label: "Go to the Members card", focus: ".a4-members" } : { label: "Show what is missing", focus: "#a4Missing" } };
  }
  // A step a card's own button takes (the context probe) that completing would still wait for is done before the request:
  // it records a transition, which would cancel approvals already given.
  const cardStep = list(ctx.allowed?.progress?.reasonCodes).find((value) => ITEM_ACTIONS[value] && itemOf(readiness, value)?.status !== "READY");
  if (cardStep) return { now: `Before asking for approval: ${itemOf(readiness, cardStep)?.nextAction?.label ?? cardStep}.`,
    why: "Do this first. Doing it after the approval would cancel the approvals already given.", act: { label: ITEM_ACTIONS[cardStep][0], press: ITEM_ACTIONS[cardStep][1] } };
  return { now: `Ask for approval: request the ${kind} approval. ${kind === "direction" ? "Approvers check the proposed specification." : "Approvers check what was built and reviewed."}`,
    act: { label: `Request ${kind} approval`, press: `request-${kind}` } };
}

/**
 * An approval the project's people cannot reach: how many it needs, who may not count, the role one of them needs, and the
 * Add a person form right in the panel (`people`), set so the people added can decide every later step of a walk too.
 * Alone with self-approval, adding anyone ends it, so every approval then comes from the people added.
 */
function peopleMove(ctx, { required, eligible, roleVote, open }) {
  const solo = ctx.readiness?.selfApprovalAllowed === true;
  const more = Math.max(solo ? required : required - eligible, 1);
  const owner = Array.isArray(ctx.me?.roles) && ctx.me.roles.includes("OWNER");
  const now = `This approval needs ${required} ${required === 1 ? "person" : "different people"} other than whoever wrote, built or asked for this step`
    + `${roleVote ? `, and one of them must hold the ${roleVote} role` : ""}. ${eligible > 0 && !solo ? `Only ${eligible} can approve it now. ` : "Nobody else here can approve it yet. "}`
    + `${owner ? `Add ${more} ${more === 1 ? "person" : "people"} below.` : "Ask a workspace owner to add them."} `
    + `${required < 2 ? "Later steps need two such people, so you can add both now." : "The same people can approve every later step too."}`;
  const why = [solo ? "Adding a person ends self-approval on this workspace for good, so from then on others approve your steps." : "",
    open ? "Adding a person cancels this request: ask for the approval again once they are added." : ""].filter(Boolean).join(" ");
  return owner ? { now, ...(why ? { why } : {}), people: true, act: { label: "Add a person", focus: '.a4-start [name="inviteUsername"]' } } : { now, ...(why ? { why } : {}) };
}

/** The Add a person form inside the panel: the invite route creates the account (or finds it) and adds them as an approver. */
function peopleFormHtml(ctx) {
  return `<div class="a4-invite a4-people" data-card="people"><label>Their user name <input name="inviteUsername" autocomplete="off" maxlength="64" /></label>
    <label><input type="checkbox" name="inviteAuditor" checked /> They may also audit (step 3, Fit it to your rules, needs two people who may audit)</label>
    <p class="muted">AMC creates their account with a first password, shows it to you once here, and adds them to this project as an approver. With both
      roles ticked, the same two people can approve every later step. ${NOT_INDEPENDENT}.</p>
    ${actionButton("Add this person", "invite-member", ctx.allowed?.addMember)}</div>`;
}

/** The primary action: one button (or link) per screen; a4.js moves to or presses the page control it names. */
function primary(act, also) {
  if (!act) return "";
  if (act.copy) return `<button type="button" class="a4-primary" data-a4-copy-link>${esc(act.label)}</button> <span class="muted" role="status" data-a4-copy-status></span>`;
  if (act.href) return `<a class="button a4-primary" href="${esc(act.href)}">${esc(act.label)}</a>`;
  const target = act.press ? `[data-a4-action="${esc(act.press)}"]` : act.focus;
  return `<button type="button" class="a4-primary" data-a4-go="${esc(target)}"${act.press ? " data-a4-press" : ""}${also ? ` data-a4-also="${esc(also)}"` : ""}>${esc(act.label)}</button>`;
}

/** Who must approve the live gate of the viewed stage, why, and how to add a person; "" when no gate is live. */
export function renderWhoApproves(ctx, gate, formShown = false) {
  if (!isObject(gate)) return "";
  const request = isObject(gate.request) ? gate.request : {};
  const required = Number.isSafeInteger(gate.required) ? gate.required : request.requiredApprovals;
  const roles = list(request.rolesAllowed);
  const names = new Map([...list(ctx.project?.members), ...list(ctx.members?.candidates)].map((row) => [row.principalKey, row.username]));
  const excluded = list(gate.excludedKeys).map((key) => names.get(key) ?? key);
  const approved = list(gate.decisions).filter((decision) => String(decision.decision).startsWith("APPROVE")).map((decision) => decision.username);
  const auditor = codesOf(ctx.readiness, "gate.required_reviews").some((value) => String(value).includes("AUDITOR"));
  const short = prefixed(codesOf(ctx.readiness, "sod"), "ELIGIBLE:")[0];
  const role = auditor ? "APPROVER,AUDITOR" : roleFor(roles);
  // Alone, one self-approval meets a one-approval gate; a gate that needs more says what the person's own approval does instead.
  const who = selfApproves(ctx.readiness, required) ? `${esc(SELF_APPROVE)} Self-approval counts once.` : ctx.readiness?.selfApprovalAllowed === true
    ? esc(selfCountsOnce(required)) : `${SOD}${excluded.length ? `: ${excluded.map(esc).join(", ")} cannot approve this one` : ""}.`;
  return `<div class="a4-who"><p><strong>Who must approve:</strong> ${esc(required ?? "?")} ${required === 1 ? "person" : "different people"} with the workspace role
    ${roles.length ? roles.map(code).join(" or ") : "that the approval policy names"}${auditor ? ", one of them holding AUDITOR" : ""}, who are members of this project
    (workspace owners count). ${who}</p>
    <p>Approved so far: ${approved.length ? approved.map(esc).join(", ") : "nobody yet"}.${short !== undefined && !formShown ? ` Studio counts ${esc(short)} person(s) who could still approve.` : ""}</p>
    ${formShown ? "" : `<p class="muted">Need another person? In the workspace folder run ${code(addUserCommand(role))} (or give an existing user the role with
    ${code(`amc user role set <username> --roles <their current roles>,${role}`)}), then add them on the Members card with the approver role. Adding a member cancels the open
    request, so request it again afterwards. ${NOT_INDEPENDENT}.</p>`}</div>`;
}

/** The "start here" panel at the top of a project page. */
export function renderStartHere(ctx) {
  const { project, stage } = ctx;
  const move = nextMove(ctx);
  const at = STEPS.indexOf(project.step);
  const kind = project.step === "reviewed" ? "completion" : project.step === "proposed" ? "direction" : null;
  const gate = stage === project.stage && kind ? liveGate(ctx, kind) : null;
  const live = gate && (gate.status === "PENDING" || gate.status === "QUORUM_MET") ? gate : null;
  return `<section class="card a4-start" aria-labelledby="a4StartTitle"><h3 id="a4StartTitle">What to do now</h3>
    <p class="muted">${esc(project.practiceActive === true ? PRACTICE_IS : WHAT_IS_A_PROJECT)}</p>${renderStepper(project, stage)}
    ${stage === project.stage && at >= 0 ? `<p>${esc(STAGE_PLAIN[stage] ?? title(stage))}: part ${at + 1} of ${STEPS.length}, ${esc(STEP_PLAIN[project.step] ?? project.step)}
      <small class="muted">(${esc(title(stage))}, ${esc(STEP_TITLES[project.step] ?? project.step)})</small>.</p>` : ""}
    <p class="a4-now"><strong>${esc(move.now)}</strong></p>${move.why ? `<p class="muted">${esc(move.why)}</p>` : ""}
    ${live && !move.effect ? renderWhoApproves(ctx, live, move.people === true) : ""}
    <div class="row wrap">${primary(move.act, move.also)}</div>${move.people ? peopleFormHtml(ctx) : ""}
    <p class="muted">${esc(TRUTH.signatures)}. Every A4 record is self-reported; nothing here says the agent is safe, correct or lawful.</p></section>`;
}

/** The four stages as a horizontal stepper in human words, the A4 name small beneath each. */
function introStepperHtml() {
  return `<ol class="a4-stepper a4-stepper-intro" aria-label="The four steps">${STAGES.map((name, index) =>
    `<li><strong>${index + 1}. ${esc(STAGE_PLAIN[name])}</strong><small class="muted">${esc(title(name))}</small></li>`).join("")}</ol>`;
}

/**
 * The list page's introduction: a short heading, one sentence, the stepper, and the approver notice. The terminal commands
 * sit under "Use the terminal instead"; an OWNER (`canAdd`) gets an inline form that adds a person through Studio.
 */
export function renderIntro({ creating = true, canAdd = false } = {}) {
  return `<section class="card a4-start a4-intro"><h2>Build an agent</h2>
    <p class="first-use-lead">Say what the agent is for and AMC drafts it with you in four steps. A second person approves each step before it moves on.</p>
    ${introStepperHtml()}
    <div class="a4-approver-note"><p><strong>A second person has to approve each step.</strong> Add them now or later.</p>
      <div class="row wrap">${canAdd ? '<button type="button" class="secondary" data-a4-add-person aria-expanded="false" aria-controls="a4AddPerson">Add a person</button>' : ""}
        <a class="button secondary" href="./users">Open Users</a>
        ${creating ? "" : '<button type="button" class="secondary" data-a4-show-create>Start another project</button>'}</div>
      ${canAdd ? `<form id="a4AddPerson" class="a4-form a4-add-person" hidden novalidate>
        <label>Their user name <input name="username" autocomplete="off" required maxlength="64" /></label>
        <p class="muted">AMC makes a first password for them and shows it here once. Give it to them yourself.</p>
        <label>What they may do <select name="roles"><option value="APPROVER">Approve steps (APPROVER)</option>
          <option value="APPROVER,AUDITOR">Approve steps and audit (APPROVER, AUDITOR)</option></select></label>
        <p class="muted">Fit it to your rules (Adapt) needs two people besides the one who asks, each an auditor or a workspace owner, so give the audit role to at least two people.</p>
        <p class="a4-form-error status-bad" role="alert" hidden></p>
        <p class="muted" role="status" data-a4-add-status></p>
        <button type="submit" class="secondary">Add this person</button></form>` : ""}
      <details class="a4-terminal"><summary>Use the terminal instead</summary>
        <p class="muted">In the workspace folder run ${code(addUserCommand())}. Later steps need two approvers, and Fit it to your rules (Adapt)
        needs two besides the one who asks who hold AUDITOR or OWNER (${code("--role APPROVER,AUDITOR")}).</p></details>
      <p class="muted">${esc(SOD)}. ${esc(NOT_INDEPENDENT)}.</p></div></section>`;
}

/** What the Add a person form shows after Studio answers: the first password (once) and the notes, in words. */
export function addedPersonHtml(data) {
  const user = isObject(data?.user) ? data.user : {};
  const password = typeof data?.firstPassword === "string" ? data.firstPassword : null;
  return `<p>${password ? `Added ${esc(user.username)}. Their first password, shown only this once: ${code(password)}` : `${esc(user.username)} already had an account, `
    + "so no new password was made and AMC cannot show the old one."}</p>${password ? "" : `<p>If they no longer have their password, a workspace owner sets a new one in the
    workspace folder with ${code(`amc user password ${user.username ?? "<name>"}`)} and gives it to them. Then add them to a project on its Members card.</p>`}
    ${list(data?.notes).filter((note) => password || !String(note).includes("already had an account")).map((note) => `<p class="muted">${esc(note)}</p>`).join("")}`;
}

/** The page shown while the preview is off: what A4 is and the exact way to turn it on (the gate itself stays). */
export function previewOffHtml() {
  return `<section class="card a4-start"><h3>Agent projects are turned off in this workspace</h3><p>${esc(WHAT_IS_A_PROJECT)}</p>
    <p>A4 Forge is a preview. It is on by default, and the workspace owner can turn it off.</p><p>${previewNoticeHtml()}</p></section>`;
}

/** The demo workspace is view-only: projects need your own workspace. */
export function demoHtml() {
  return `<section class="card a4-start"><h3>Agent projects need your own workspace</h3><p>${esc(WHAT_IS_A_PROJECT)}</p>
    <p>This is the view-only demo, so it cannot hold agent projects. To start one, use a workspace of your own: in an empty folder run
    ${code("amc init")}, then ${code("amc user init")} to create your sign-in, then ${code("amc up")}, and sign in.</p></section>`;
}

/** An error as a sentence, the next step, and its code for the small print. */
const ERROR_TEXT = {
  INPUT_TOO_LARGE: ["What this step sends is larger than Studio accepts, so nothing was saved.",
    "Shorten the longest answers and try again. If it keeps happening, it is a limit in AMC itself: report it with this page's address."],
  A4_STALE_HEAD: ["Someone changed the project while you were working, so nothing was saved.", "The page has reloaded: check it, then try again."],
  A4_STEP_ORDER: ["That step is not next yet.", "Follow What to do now at the top of the page."],
  A4_NOT_READY: [null, "See Missing requirements on this page."],
  SOD_VIOLATION: ["You cannot approve your own work (separation of duties).", "Ask another approver to decide it."],
  PRINCIPAL_ROLE_INSUFFICIENT: ["Your workspace role cannot decide this.", "A workspace owner can add the role with amc user role set <username> --roles <roles>."],
  A4_NOT_A_MEMBER: ["You are not an approver on this project.", "A project owner adds you on the Members card with the approver role."],
  DEMO_REFUSED: ["The demo workspace cannot hold agent projects.", "Use your own workspace: amc init, amc user init, then amc up."],
  A4_AUTH_REQUIRED: ["Your sign-in has ended.", "Sign in again, then retry."],
  NATIVE_CSRF_REQUIRED: ["Studio needs a fresh page before it accepts changes.", "Reload the page and try again."],
  A4_ON_HOLD: ["The project is on hold.", "A project owner resumes it under Approvals, More."],
  FREEZE_ACTIVE: ["An incident freeze is active for this agent, so nothing can change.", "The freeze must be lifted first."],
  A4_PREVIEW_DISABLED: ["A4 is a preview and is turned off in this Studio.", "Stop Studio with amc down and start it again without AMC_A4_PREVIEW=0 (for example AMC_A4_PREVIEW=1 amc up)."],
  // Studio's message names the hold and the commands that end it.
  NATIVE_RESIDENCY_REFUSED: [null, null]
};
export function explainError(error) {
  const raw = String(error?.message ?? error ?? "Something went wrong.");
  const errorCode = typeof error?.code === "string" && !["HTTP_ERROR", "INVALID_RESPONSE"].includes(error.code) ? error.code : null;
  const message = errorCode && raw.startsWith(`${errorCode}: `) ? raw.slice(errorCode.length + 2) : raw;
  const [sentence, next] = ERROR_TEXT[errorCode] ?? [null, errorCode ? "If it happens again, reload the page and check the project." : null];
  // A residency refusal's fixed reason and detail codes (never raw error text) go beside Studio's code.
  const fixed = [error?.data?.detail?.reason, error?.data?.detail?.detail].filter((value, at, all) => typeof value === "string" && all.indexOf(value) === at);
  return { sentence: sentence ?? message, detail: sentence && message !== sentence ? message : null, next, code: errorCode && [errorCode, ...fixed].join(" ") };
}
export function errorHtml(error) {
  const { sentence, detail, next, code: errorCode } = explainError(error);
  return `<span class="status-bad">${esc(sentence)}</span>${next ? ` ${esc(next)}` : ""}${detail || errorCode
    ? ` <small class="muted">${detail ? esc(detail) : ""}${errorCode ? ` <code>${esc(errorCode)}</code>` : ""}</small>` : ""}`;
}

/**
 * Example answers, shown as placeholders on every stage (never recorded) and, for Aspire, Assemble and Adapt, filled by
 * "Use an example". Filled text is marked "(sample)" so what gets recorded says so; a choice or a validated list (risk
 * tier, stations, autonomy, provider, path, governance, languages) takes a plain value and the free text beside it carries the mark.
 */
const SAMPLE_MARK = "(sample)";
const S = (text) => `${SAMPLE_MARK} ${text}`;
export const EXAMPLES = {
  aspire: { agent: S("Invoice helper: sorts incoming supplier invoices and flags odd ones"), problem: S("The finance team sorts supplier invoices by hand every week."),
    audience: `${S("Accounts payable clerks")}\n${S("Finance manager")}`, currentWorkflow: S("Clerks read each invoice PDF and type it into the ledger."),
    goals: `${S("Sort invoices by supplier and due date")}\n${S("Flag duplicates")}`, successMetrics: S("Share of invoices sorted without a correction"),
    constraints: S("Read-only access to the ledger"), forbiddenActions: `${S("Never pay an invoice")}\n${S("Never change supplier bank details")}`,
    riskTier: "low", stations: "wealth", governance: "standard" },
  assemble: { capabilities: `${S("Read supplier invoice PDFs")}\n${S("Sort invoices by supplier and due date")}`, autonomy: "advise", providers: "stub", path: "native",
    budget: S("Small: a few build sessions") },
  adapt: { audiences: S("Accounts payable clerks"), languages: "English", preferences: S("Short, plain answers"), excludedUses: S("Paying or approving invoices") },
  activate: { target: "compose", destinationRef: "amc.example.internal:443", leaseScopes: "gateway:llm", stagingRoutes: "/openai", productionRoutes: "/openai",
    modelAllowlist: "gpt-4o-mini", budgetRequestsPerMinute: "30", budgetTokensPerMinute: "20000" }
};
/**
 * The example "Use an example" fills at `stage`, less the fields an Industry Pack suggests (`skip`): an example never
 * replaces what a pack filled, the risk level least of all, even when it is pressed before the pack's answers arrive.
 */
export function exampleFor(stage, skip = []) {
  return Object.fromEntries(Object.entries(EXAMPLES[stage] ?? {}).filter(([questionId]) => !skip.includes(questionId)));
}
/** Stages whose example fills the form; Activate's required answers are all validated values, so it shows placeholders only. */
export const FILLABLE = new Set(["aspire", "assemble", "adapt"]);
export const placeholderOf = (stage, questionId) => {
  const value = EXAMPLES[stage]?.[questionId];
  return typeof value === "string" ? `For example: ${value.replaceAll(`${SAMPLE_MARK} `, "").split("\n").join("; ")}` : "";
};
export const SAMPLE_PROJECT = { name: S("Invoice triage helper"), expertise: "novice" };

/**
 * The digest Understand records for the answers it read (src/a4/spec/aspire.ts answersDigestOf: sha256 of the canonical JSON
 * of [questionId, value] pairs sorted by id). When it matches, the understanding on the page is for the current answers.
 */
const sortDeep = (value) => (Array.isArray(value) ? value.map(sortDeep) : isObject(value)
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])])) : value);
export async function answersDigest(answers) {
  const pairs = [...list(answers)].sort((a, b) => String(a.questionId).localeCompare(String(b.questionId))).map((answer) => [answer.questionId, answer.value ?? null]);
  const bytes = new TextEncoder().encode(JSON.stringify(sortDeep(pairs)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function understandingIsCurrent(spec) {
  const recorded = isObject(spec) && isObject(spec.understanding) ? spec.understanding.answersDigest : null;
  return typeof recorded === "string" && recorded === await answersDigest(spec.answers);
}

/**
 * Home's "Next:" line for an Activate project whose plan is approved: who acts on the release request (release_effect),
 * from that project's readiness; null otherwise (STEP_NEXT then names the part).
 */
export function releaseNext(project, readiness) {
  if (project?.stage !== "activate" || project.step !== "proposed" || readiness?.gates?.direction?.status !== "QUORUM_MET") return null;
  const codes = codesOf(readiness, "release_effect");
  const status = prefixed(codes, "APPROVAL_STATUS:")[0];
  if (codes.includes("EFFECT_GATE_NOT_OPEN") || ["DENIED", "EXPIRED", "CANCELLED"].includes(status)) return "Next: the plan is approved; a project owner opens the release request on the Release card.";
  if (status === "PENDING") return "Next: the project's approvers approve the release request on the Release card.";
  if (status === "QUORUM_MET") return "Next: the release request is approved; a project owner releases it on the Release card.";
  return null;
}

/** The project Home continues: the most recently changed one that is not retired, else null. */
export function latestProject(projects) {
  const open = list(projects).filter((project) => isObject(project) && project.stage !== "retired");
  return open.sort((a, b) => String(b.updatedTs ?? "").localeCompare(String(a.updatedTs ?? "")))[0] ?? null;
}

/**
 * Home's first card. With no project: "Build an agent for your industry", one sentence, the industry list, a name and one
 * button. With projects: "Continue <name>", what it needs now in one sentence, one button, and "Start another" as a link.
 * In the demo workspace, which cannot hold projects, it says where building works instead.
 */
export function homeCardHtml({ projects = [], waiting = null, industryHtml = "", demo = false, start = null, latestReadiness = null } = {}) {
  const lead = "Pick your industry, answer plain questions, and AMC drafts the agent with you. A second person approves each step before it moves on.";
  if (demo) {
    return `<h2 id="a4HomeTitle">Build an agent for your industry</h2><p class="first-use-lead">${esc(lead)}</p>
      <p>This demo workspace is view-only, so it cannot hold agent projects. <a href="./a4">See how building works</a></p>`;
  }
  if (isObject(waiting?.project)) {
    const { project: row, kind } = waiting;
    return `<h2 id="a4HomeTitle">An approval waits for you</h2>
      <p class="first-use-lead">${esc(row.name)}: ${esc(STAGE_PLAIN[row.stage] ?? title(row.stage))} (${esc(title(row.stage))}) ${kind === "effect"
        ? `needs your approval on a second request, which ${row.stage === "adapt" ? "activates the plan" : "applies what was built"}`
        : kind === "release" ? "needs your approval on its release request, a second request on the approved plan that releases it" : `asks for its ${esc(kind)} approval`}. Open it, read what it asks for, then approve it or request changes.</p>
      <div class="row wrap a4-home-actions"><a class="button" href="./a4Project?project=${encodeURIComponent(row.projectId ?? "")}&stage=${encodeURIComponent(row.stage ?? "")}">Open the approval</a></div>`;
  }
  const project = latestProject(projects);
  if (project) {
    const at = STAGES.indexOf(project.stage);
    const where = at >= 0 ? `Step ${at + 1} of 4: ${STAGE_PLAIN[project.stage]} (${title(project.stage)}). Part: ${STEP_PLAIN[project.step] ?? project.step}.` : "";
    return `<h2 id="a4HomeTitle">Continue ${esc(project.name)}</h2>
      <p class="first-use-lead">${esc(project.hold ? "This project is on hold until a project owner resumes it." : releaseNext(project, latestReadiness)
        ?? STEP_NEXT[project.step] ?? "Open it to see what it needs next.")}</p>
      ${where ? `<p class="muted">${esc(where)}</p>` : ""}
      <div class="row wrap a4-home-actions"><a class="button" href="./a4Project?project=${encodeURIComponent(project.projectId ?? "")}">Continue</a>
      <a href="./a4?new=1">Start another</a></div>`;
  }
  return `<h2 id="a4HomeTitle">Build an agent for your industry</h2><p class="first-use-lead">${esc(lead)}</p>
    ${renderCreateForm(true, industryHtml, { home: true, start })}
    <p class="muted">A4 Forge preview. ${esc(TRUTH.signatures)}; nothing here says the agent is safe, correct or lawful.</p>`;
}
