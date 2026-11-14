// A4 Studio first-run guidance: the "start here" panel (what a project is, the four stages, what the current step needs
// and one primary action), who must approve a gate, errors in sentences, the preview-off and demo pages, and example
// answers. Pure: data in, HTML or plain values out; every server string goes through esc(). Studio re-checks every
// action, so the primary action only points at the page's own buttons and never decides anything itself.
import { STAGES, STEP_TITLES, TRUTH, esc, previewNoticeHtml } from "./a4View.js";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const title = (stage) => (typeof stage === "string" && stage ? stage[0].toUpperCase() + stage.slice(1) : "");
const STEPS = ["asked", "understood", "explained", "proposed", "direction_approved", "built", "reviewed", "completion_approved"];

export const WHAT_IS_A_PROJECT = "An agent project takes one agent from a brief to a recorded deployment in four stages. "
  + "Each stage asks you questions, AMC drafts from your answers, and a second person approves before the project moves on.";
const STAGE_PURPOSE = { aspire: "what the agent is for", assemble: "build it", adapt: "fit it to your context and rules",
  activate: "release and deploy it" };
const SOD = "The person who wrote, built or requested a stage cannot approve it (separation of duties)";
const NOT_INDEPENDENT = "A second approver in the same workspace meets separation of duties; it is not an independent review";

/** The workspace role a new approver needs for a gate that takes `rolesAllowed` (OWNER is never handed out here). */
function roleFor(rolesAllowed) {
  const roles = list(rolesAllowed).filter((role) => role !== "OWNER");
  return roles.includes("APPROVER") ? "APPROVER" : roles[0] ?? "APPROVER";
}
export const addUserCommand = (role = "APPROVER") => `amc user add --username <name> --role ${role}`;
const code = (text) => `<code>${esc(text)}</code>`;

/** The four stages as a stepper: earlier stages done, the project's stage current, the viewed one marked. */
export function renderStepper(project, stage) {
  const at = STAGES.indexOf(project.stage);
  const id = encodeURIComponent(project.projectId ?? "");
  return `<ol class="a4-stepper" aria-label="Stages">${STAGES.map((name, index) => {
    const state = at < 0 ? "" : index < at ? "done" : index === at ? "current" : "later";
    const words = state === "done" ? "done" : state === "current" ? "current stage" : state === "later" ? "later" : "";
    return `<li class="a4-stepper-${state}"${name === project.stage ? ' aria-current="step"' : ""}><a href="./a4Project?project=${id}&stage=${name}"${
      name === stage ? ' data-viewing="true"' : ""}><strong>${index + 1}. ${title(name)}</strong> <span class="muted">${esc(STAGE_PURPOSE[name])}</span>
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
  complete: "progress", "request-direction": "requestGate", "request-completion": "requestGate", "open-effect": "openEffect" };

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
  const blocked = list(readiness?.items).find((item) => item.mandatory && item.status === "BLOCKED" && !["gate.direction", "gate.completion"].includes(item.id));
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
    return { now: "Build: AMC writes what the approved direction describes. Every file it writes is recorded with its digest.", act: { label: "Build", press: "build" } };
  }
  if (step === "built") {
    if (stage === "assemble") return { now: "Close the build session, then run Review. On the Build card choose Open on Native Tasks and press Close and verify; Review refuses while a session is open.",
      act: { label: "Review", press: "review" } };
    return { now: "Review: AMC checks what was built; you can add your own findings.", act: { label: "Review", press: "review" } };
  }
  if (step === "reviewed") return gateMove(ctx, "completion");
  const nextStage = STAGES[STAGES.indexOf(stage) + 1];
  return nextStage ? { now: `${title(stage)} is complete.`, act: { label: `Go to ${title(nextStage)}`, href: `./a4Project?project=${encodeURIComponent(project.projectId)}&stage=${nextStage}` } }
    : { now: `${title(stage)} is complete.` };
}

function askMove(ctx) {
  const codes = codesOf(ctx.readiness, "ask_complete");
  const stale = prefixed(codes, "ANSWER_STALE:");
  if (stale.length) return { now: "Some answers need confirming because an answer they depend on changed. Confirm each one that is still correct.",
    act: { label: "Confirm the first answer", focus: `[data-a4-action="confirm-answer"][data-question="${esc(stale[0])}"]` } };
  if (prefixed(codes, "CARRIED_MISSING:").length) return { now: "Run Understand first: it brings in your answers from the earlier stages, then you answer the new questions.",
    act: { label: "Run Understand", press: "understand" } };
  const missing = [...prefixed(codes, "ANSWER_MISSING:"), ...prefixed(codes, "ANSWER_INVALID:")];
  const fillable = missing.find((id) => list(ctx.questions).some((question) => question.id === id && id !== "expertise"));
  if (fillable) return { now: `Answer the questions marked (required) under Ask, then press Save answers. ${missing.length} still need an answer.`,
    act: { label: "Answer the first question", focus: `form[data-a4-answers] [name="${esc(fillable)}"]` } };
  if (ctx.reflection || ctx.understandingCurrent) return { now: "Check what AMC understood from your answers. If it is right, confirm it; if not, change your answers.",
    act: { label: "Yes, that's it", press: "confirm" } };
  return { now: "Run Understand: AMC reads your answers and says back what it understood.", act: { label: "Run Understand", press: "understand" } };
}

/** The viewed stage's `kind` gate as readiness states it, joined with its /gates record (exclusions, request, decisions). */
export function liveGate(ctx, kind) {
  const view = ctx.readiness?.gates?.[kind];
  return isObject(view) ? { ...list(ctx.gates).find((row) => row.gateId === view.gateId), ...view } : null;
}

function gateMove(ctx, kind) {
  const { readiness, stage, me } = ctx;
  const gate = liveGate(ctx, kind);
  const status = gate?.status;
  if (status === "QUORUM_MET") {
    if (kind === "direction" && stage !== "activate") return { now: "The direction is approved. Use the approval to move on to Build.", act: { label: "Continue to Build", press: "complete" } };
    if (stage === "activate") return { now: "Approved. Activate's release and deployment approval are completed on the Release card.", act: { label: "Open the Release card", focus: '[data-card="release"]' } };
    const effect = codesOf(readiness, "effect_gate");
    if (effect.includes("EFFECT_GATE_NOT_OPEN")) return { now: "Approved. Completing Assemble applies the reviewed resources, which is a second request: a project owner opens it, then two approvers approve it on the Completion effect card.",
      act: { label: "Open the effect gate", press: "open-effect" } };
    const effectStatus = prefixed(effect, "APPROVAL_STATUS:")[0];
    if (effectStatus && effectStatus !== "QUORUM_MET" && effectStatus !== "CONSUMED") return { now: `Waiting for project approvers to approve the effect request on the Completion effect card (now ${effectStatus}).`,
      act: { label: "Go to the Completion effect card", focus: '[data-card="effect"] [name="engine-reason"]' } };
    return { now: `Approved. Complete ${title(stage)} to move the project on.`, act: { label: `Complete ${title(stage)}`, press: "complete" } };
  }
  if (status === "PENDING") {
    const sod = codesOf(readiness, "sod");
    if (sod.includes("QUORUM_UNREACHABLE")) {
      const eligible = prefixed(sod, "ELIGIBLE:")[0] ?? "?", required = prefixed(sod, "REQUIRED:")[0] ?? gate.required ?? "?";
      const role = codesOf(readiness, "gate.required_reviews").some((value) => String(value).includes("AUDITOR")) ? "APPROVER,AUDITOR" : roleFor(gate.request?.rolesAllowed);
      return { now: `This approval needs ${required} people who may approve it, and only ${eligible} can. Add another person: in the workspace folder run `
        + `${addUserCommand(role)}, add them on the Members card with the approver role, then request the approval again (adding a member cancels this request).`,
      act: { label: "Go to the Members card", focus: "li[data-principal] select" } };
    }
    const excluded = typeof me?.userId === "string" && list(gate.excludedKeys).some((key) => String(key).endsWith(`:${me.userId}`));
    if (excluded) return { now: `Waiting for approvers: ${gate.approvals ?? 0} of ${gate.required ?? "?"} approvals so far. ${SOD}, so someone else decides; send them this page.` };
    const refusals = list(ctx.allowed?.decide?.reasonCodes);
    if (refusals.includes("A4_DUPLICATE_DECISION")) return { now: `You have decided this one. Waiting for the other approvers: ${gate.approvals ?? 0} of ${gate.required ?? "?"} approvals so far.` };
    if (refusals.includes("GATE_ROLE_NOT_ALLOWED")) {
      const roles = list(gate.request?.rolesAllowed);
      return { now: `Your workspace role cannot decide this approval: it takes ${roles.join(" or ") || "another role"}. A workspace owner can give you the role in the workspace folder with amc user role set ${me?.username ?? "<username>"} --roles <your roles>,${roleFor(roles)}.` };
    }
    return { now: "Review the specification and the cards above, write a reason in the Approvals card, then Approve or Request changes.",
      act: { label: "Write your reason", focus: '.a4-approvals [name="reason"]' } };
  }
  if (status === "DENIED") return { now: "This revision was denied. Change an answer under Ask and save it to start a new revision.", act: { label: "Change an answer", focus: "form[data-a4-answers] textarea" } };
  const ack = toAcknowledge(readiness);
  if (ack.length) return { now: `Before asking for approval, a project owner acknowledges ${ack.map((item) => item.id).join(", ")}: ${ack[0].nextAction?.label ?? "see Missing requirements"}.`,
    why: "Write the reason in the Approvals card, then press Acknowledge beside the item under Missing requirements. Acknowledging after the request would cancel it.",
    act: { label: "Write the reason", focus: '.a4-approvals [name="reason"]' } };
  if (codesOf(readiness, "members.candidates").includes("NO_SECOND_APPROVER")) {
    const candidates = list(ctx.members?.candidates).filter((row) => !list(ctx.project.members).some((member) => member.principalKey === row.principalKey));
    return candidates.length
      ? { now: `Add a second person before asking for approval. ${SOD}. Pick a person on the Members card, choose the approver role and press Add.`,
        act: { label: "Choose an approver", focus: "li[data-principal] select" } }
      : { now: `Add a second person before asking for approval. ${SOD}, and you are the only person here. In the workspace folder run ${addUserCommand()}, then reload and add them on the Members card.`, stop: true };
  }
  return { now: `Ask for approval: request the ${kind} approval. ${kind === "direction" ? "Approvers check the proposed specification." : "Approvers check what was built and reviewed."}`,
    act: { label: `Request ${kind} approval`, press: `request-${kind}` } };
}

/** The primary action: one button (or link) per screen; a4.js moves to or presses the page control it names. */
function primary(act) {
  if (!act) return "";
  if (act.href) return `<a class="button a4-primary" href="${esc(act.href)}">${esc(act.label)}</a>`;
  const target = act.press ? `[data-a4-action="${esc(act.press)}"]` : act.focus;
  return `<button type="button" class="a4-primary" data-a4-go="${esc(target)}"${act.press ? " data-a4-press" : ""}>${esc(act.label)}</button>`;
}

/** Who must approve the live gate of the viewed stage, why, and how to add a person; "" when no gate is live. */
export function renderWhoApproves(ctx, gate) {
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
  return `<div class="a4-who"><p><strong>Who must approve:</strong> ${esc(required ?? "?")} ${required === 1 ? "person" : "different people"} with the workspace role
    ${roles.length ? roles.map(code).join(" or ") : "that the approval policy names"}${auditor ? ", one of them holding AUDITOR" : ""}, who are members of this project
    (workspace owners count). ${SOD}${excluded.length ? `: ${excluded.map(esc).join(", ")} cannot approve this one` : ""}.</p>
    <p>Approved so far: ${approved.length ? approved.map(esc).join(", ") : "nobody yet"}.${short !== undefined ? ` Studio counts ${esc(short)} person(s) who could still approve.` : ""}</p>
    <p class="muted">Need another person? In the workspace folder run ${code(addUserCommand(role))} (or give an existing user the role with
    ${code(`amc user role set <username> --roles <their current roles>,${role}`)}), then add them on the Members card with the approver role. Adding a member cancels the open
    request, so request it again afterwards. ${NOT_INDEPENDENT}.</p></div>`;
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
    <p class="muted">${esc(WHAT_IS_A_PROJECT)}</p>${renderStepper(project, stage)}
    ${stage === project.stage && at >= 0 ? `<p>${esc(title(stage))}: step ${at + 1} of ${STEPS.length}, ${esc(STEP_TITLES[project.step] ?? project.step)}.</p>` : ""}
    <p class="a4-now"><strong>${esc(move.now)}</strong></p>${move.why ? `<p class="muted">${esc(move.why)}</p>` : ""}
    ${live ? renderWhoApproves(ctx, live) : ""}
    <div class="row wrap">${primary(move.act)}</div>
    <p class="muted">${esc(TRUTH.signatures)}. Every A4 record is self-reported; nothing here says the agent is safe, correct or lawful.</p></section>`;
}

/** The list page's introduction: what a project is, the stages, and what a newcomer needs first. */
export function renderIntro() {
  return `<section class="card a4-start"><h3>Agent projects (A4 Forge preview)</h3><p>${esc(WHAT_IS_A_PROJECT)}</p>
    <ol class="a4-stepper">${STAGES.map((name, index) => `<li><strong>${index + 1}. ${title(name)}</strong> <span class="muted">${esc(STAGE_PURPOSE[name])}</span></li>`).join("")}</ol>
    <p class="muted">You will need a second person to approve: ${esc(SOD)}. Add one in the workspace folder with ${code(addUserCommand())};
    later stages need two approvers, and Adapt needs one of them to hold AUDITOR (${code("--role APPROVER,AUDITOR")}). ${esc(NOT_INDEPENDENT)}.</p></section>`;
}

/** The page shown while the preview is off: what A4 is and the exact way to turn it on (the gate itself stays). */
export function previewOffHtml() {
  return `<section class="card a4-start"><h3>Agent projects are turned off in this workspace</h3><p>${esc(WHAT_IS_A_PROJECT)}</p>
    <p>A4 Forge is a preview, and previews are off unless the workspace owner turns them on.</p><p>${previewNoticeHtml()}</p></section>`;
}

/** The demo workspace is view-only: projects need your own workspace. */
export function demoHtml() {
  return `<section class="card a4-start"><h3>Agent projects need your own workspace</h3><p>${esc(WHAT_IS_A_PROJECT)}</p>
    <p>This is the view-only demo, so it cannot hold agent projects. To start one, use a workspace of your own: in an empty folder run
    ${code("amc init")}, then ${code("amc user init")} to create your sign-in, then ${code("AMC_A4_PREVIEW=1 amc up")}, and sign in.</p></section>`;
}

/** An error as a sentence, the next step, and its code for the small print. */
const ERROR_TEXT = {
  A4_STALE_HEAD: ["Someone changed the project while you were working, so nothing was saved.", "The page has reloaded: check it, then try again."],
  A4_STEP_ORDER: ["That step is not next yet.", "Follow What to do now at the top of the page."],
  A4_NOT_READY: [null, "See Missing requirements on this page."],
  SOD_VIOLATION: ["You cannot approve your own work (separation of duties).", "Ask another approver to decide it."],
  PRINCIPAL_ROLE_INSUFFICIENT: ["Your workspace role cannot decide this.", "A workspace owner can add the role with amc user role set <username> --roles <roles>."],
  A4_NOT_A_MEMBER: ["You are not an approver on this project.", "A project owner adds you on the Members card with the approver role."],
  DEMO_REFUSED: ["The demo workspace cannot hold agent projects.", "Use your own workspace: amc init, amc user init, then AMC_A4_PREVIEW=1 amc up."],
  A4_AUTH_REQUIRED: ["Your sign-in has ended.", "Sign in again, then retry."],
  NATIVE_CSRF_REQUIRED: ["Studio needs a fresh page before it accepts changes.", "Reload the page and try again."],
  A4_ON_HOLD: ["The project is on hold.", "A project owner resumes it under Approvals, More."],
  FREEZE_ACTIVE: ["An incident freeze is active for this agent, so nothing can change.", "The freeze must be lifted first."],
  A4_PREVIEW_DISABLED: ["A4 is a preview and is turned off in this Studio.", "Stop Studio with amc down and start it with AMC_A4_PREVIEW=1 amc up."]
};
export function explainError(error) {
  const raw = String(error?.message ?? error ?? "Something went wrong.");
  const errorCode = typeof error?.code === "string" && !["HTTP_ERROR", "INVALID_RESPONSE"].includes(error.code) ? error.code : null;
  const message = errorCode && raw.startsWith(`${errorCode}: `) ? raw.slice(errorCode.length + 2) : raw;
  const [sentence, next] = ERROR_TEXT[errorCode] ?? [null, errorCode ? "If it happens again, reload the page and check the project." : null];
  return { sentence: sentence ?? message, detail: sentence && message !== sentence ? message : null, next, code: errorCode };
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
export const SAMPLE_MARK = "(sample)";
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
