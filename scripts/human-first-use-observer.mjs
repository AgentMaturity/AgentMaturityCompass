#!/usr/bin/env node
// Guided operator declarations. All journal, schema and recording admission stays in capture/intake.
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMON_PROTOCOL, COMMON_TASK } from "./human-first-use-intake.mjs";
import {
  LIMITS, CaptureError, prepareDraft, readCaptureJson, createCapture,
  loadCapture, captureStatus, projectSession, declareRecordNow, appendCapture, finalizeCapture
} from "./human-first-use-capture.mjs";

const BOUNDARY = "Operator declarations only: preparation is not participation; hashes bind bytes, not humans. Export is not task success, study qualification or issue Done.";
const HELP = `Guided local observer (no recording, harness/model execution, network or uploads).
  node scripts/human-first-use-observer.mjs prepare --store /private/new-journal [--input /private/reviewed-preparation.json]
  node scripts/human-first-use-observer.mjs observe --store /private/journal [--session SESSION_ID]
  node scripts/human-first-use-observer.mjs status --store /private/journal
  node scripts/human-first-use-observer.mjs export --store /private/journal [--evidence-root /private/recordings] [--out /private/new-export]
  node scripts/human-first-use-observer.mjs protocol
Use absolute local paths and existing private parents. New outputs must not exist.
Preparation reviews the entire frozen roster before create; --input is not auto-approval.
Observation saves only a separately reviewed event; every save uses its displayed head.
Export asks for the exact reviewed head and explicit confirmation of both paths.
Interactive commands require a terminal; piped input is refused. No default yes answers.
At any prompt: :help explains, :pause / :quit exits safely. EOF / Ctrl-C never closes a window.
Partial unsaved input is shown only in this PRIVATE terminal, not journaled or auto-retried.
Non-close events require observed UTC time or explicit record-now (operator-declared-now).
Close requires explicit observed UTC close and at/after-close attestation; no clock shortcut.
Exit 0: completed command or safe pause; 2: unready declaration or blocked export;
1: refusal, conflict or I/O failure. None is a passing-test or human-study claim.
Corrections stay in the reviewed low-level CLI: docs/HUMAN_FIRST_USE_CAPTURE.md.
Guide: docs/HUMAN_FIRST_USE_OBSERVER.md
`;

export class ObserverPause extends Error {
  constructor(reason = "pause") { super(reason); this.name = "ObserverPause"; }
}
class ObserverError extends Error {
  constructor(code, message) { super(message); this.name = "ObserverError"; this.code = code; }
}
class Unready extends ObserverError {
  constructor(field) { super("unready", `${field} is unknown. The unchanged core cannot represent this required declaration; nothing is substituted.`); }
}
const json = value => JSON.stringify(value, null, 2);
// Render private inputs as data, never terminal escape sequences (including C1/bidi controls).
const safe = value => String(value).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
  character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);

/**
 * @typedef {Object} TerminalPromptDependencies
 * @property {NodeJS.ReadableStream & { isTTY?: boolean }} [input]
 * @property {NodeJS.WritableStream & { isTTY?: boolean }} [output]
 * @property {{ on: (event: "SIGINT", listener: () => void) => unknown, removeListener: (event: "SIGINT", listener: () => void) => unknown }} [signals]
 */

/**
 * Created only for an explicit interactive invocation. No history or queued pasted approvals.
 * @param {TerminalPromptDependencies} [options]
 */
export function createTerminalPrompt({ input = process.stdin, output = process.stdout, signals = process } = {}) {
  const terminal = createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY), historySize: 0 });
  let pending = null, stopped = null;
  const settle = value => { const request = pending; pending = null; request?.resolve(value); };
  const stop = reason => { stopped ??= reason; settle(null); terminal.close(); };
  const interrupt = () => stop("cancelled");
  terminal.on("line", line => settle(line));
  terminal.on("close", () => { stopped ??= "eof"; settle(null); });
  terminal.on("SIGINT", interrupt);
  signals.on("SIGINT", interrupt);
  return {
    prompt(question) {
      if (stopped) return Promise.resolve(null);
      if (pending) return Promise.reject(new ObserverError("prompt", "Only one observer prompt may be active."));
      return new Promise(resolveAnswer => {
        pending = { resolve: resolveAnswer };
        output.write(`${safe(question.label)}${question.choices ? ` [${question.choices.join(" / ")}]` : ""}\n> `);
      });
    },
    isCancelled: () => stopped !== null,
    close() { signals.removeListener("SIGINT", interrupt); stop("finished"); }
  };
}

function active(ctx) { if (ctx.isCancelled()) throw new ObserverPause("cancelled or EOF"); }
async function ask(ctx, id, label, choices) {
  for (;;) {
    active(ctx);
    const answer = await ctx.prompt({ id, label, ...(choices ? { choices } : {}) });
    active(ctx);
    if (answer === null || answer === undefined) throw new ObserverPause("EOF");
    if (typeof answer !== "string") throw new ObserverError("prompt", "Prompt must supply text or EOF, never a truthy declaration.");
    const value = answer.trim(), command = value.toLowerCase();
    if ([":pause", ":quit", ":cancel"].includes(command)) throw new ObserverPause(command);
    if ([":help", "?"].includes(command)) { ctx.say(HELP); continue; }
    if (!value) { ctx.say("Empty is not yes, no, zero or an observation. Enter an explicit answer, :help or :pause."); continue; }
    if (choices && !choices.includes(command)) { ctx.say(`Choose exactly: ${choices.join(", ")}. No default was selected.`); continue; }
    return choices ? command : value;
  }
}
async function text(ctx, id, label) {
  const value = await ask(ctx, id, `${label} (unknown means unready; :pause exits)`);
  if (["unknown", "unsure", "not-known"].includes(value.toLowerCase())) throw new Unready(id);
  return value;
}
async function optionalText(ctx, id, label) {
  const value = await ask(ctx, id, `${label}; type none or unknown explicitly for null`);
  return ["none", "unknown"].includes(value.toLowerCase()) ? null : value;
}
async function declaration(ctx, id, label) {
  const value = await ask(ctx, id, label, ["yes", "no", "unknown"]);
  if (value === "unknown") throw new Unready(id);
  return value === "yes";
}
function showPending(ctx) {
  if (!ctx.pending) return;
  ctx.say(ctx.writeAttempted
    ? "UNCONFIRMED write candidate; it may have persisted or a competing writer may have saved it. Review retained revisions before re-entry. No automatic retry."
    : "UNSAVED input (private; may be incomplete). It has not been appended or created:");
  ctx.say(json(ctx.pending));
}
function clearPending(ctx) { ctx.pending = null; ctx.writeAttempted = false; }
function explain(ctx, error) {
  const known = error instanceof CaptureError || error instanceof ObserverError;
  ctx.error(`Refused [${known ? error.code : "local-io"}]: ${known ? error.message : "Local I/O failed. Check private paths and permissions; private parse excerpts are suppressed."}`);
  ctx.say("Preserve prior/partial files. Review status and docs/HUMAN_FIRST_USE_CAPTURE.md; do not delete a tail, replace a roster or repeat an uncertain write.");
}
function printProtocol(ctx) {
  ctx.say("Common first task (unchanged intake export):"); ctx.say(COMMON_TASK);
  ctx.say(json(COMMON_PROTOCOL));
  ctx.say("Judge a participant-observed model answer with concrete test inputs and expected outcomes for all three requirements, not a help screen, install, stub or verifier exit.");
  ctx.say("Keep the declared assistance/window rules; first task, recovery and voluntary return are separate. Participant and consent procedures: docs/HUMAN_FIRST_USE_STUDY.md.");
}

async function studyFields(ctx, input) {
  input.studyId = await text(ctx, "studyId", "Study ID (lowercase letters/digits, - or _)");
  input.preparedAt = await text(ctx, "preparedAt", "Explicit preregistration UTC time, YYYY-MM-DDTHH:mm:ss.sssZ (not inferred from this computer)");
  // Re-entry explicitly replaces this unsaved block, including a malformed file value.
  input.operator = {};
  input.operator.id = await text(ctx, "operator.id", "Preparing operator pseudonym, o-...");
  input.operator.statement = await text(ctx, "operator.statement", "Sanitized preparation statement, not an observation or consent attestation");
  input.protocol = { ...COMMON_PROTOCOL }; input.task = COMMON_TASK;
  input.observationWindowRule = await text(ctx, "observationWindowRule", "Preregister the end rule covering first task, recovery and optional return");
  input.assistancePolicy = await text(ctx, "assistancePolicy", "Preregister the common assistance policy and how gaps will be retained");
}
async function planFields(ctx, plan, index) {
  const prefix = `plannedSessions.${index}`;
  ctx.say(`Planned session ${index + 1}: this is intent, never evidence that anyone participated.`);
  plan.sessionId = await text(ctx, `${prefix}.sessionId`, "Unique session ID (lowercase letters/digits, - or _)");
  plan.participation = await ask(ctx, `${prefix}.participation`, "Explicit planned participation class (neither choice attests presence)", ["human-declared", "automated-fixture"]);
  plan.participantId = await text(ctx, `${prefix}.participantId`, "Participant pseudonym p-... (no name/email)");
  plan.observerId = await text(ctx, `${prefix}.observerId`, "Assigned observer pseudonym o-...");
  const h = plan.harness = {};
  h.name = await ask(ctx, `${prefix}.harness.name`, "Planned harness (this interface does not execute it)", ["amc", "dsh", "pi"]);
  h.version = await text(ctx, `${prefix}.harness.version`, "Exact harness version from retained provenance");
  const pins = await ask(ctx, `${prefix}.harness.pins`, "Which actual identity pins can you explicitly supply? No example/default pins are used", ["source", "artifact", "both", "unknown"]);
  if (pins === "unknown") throw new Unready(`${prefix}.harness identity`);
  h.sourceCommit = pins === "artifact" ? null : await text(ctx, `${prefix}.harness.sourceCommit`, "Actual full lowercase 40-hex source commit");
  h.artifactSha256 = pins === "source" ? null : await text(ctx, `${prefix}.harness.artifactSha256`, "Actual lowercase 64-hex installed artifact SHA-256");
  const e = plan.environment = {};
  e.machineClass = await text(ctx, `${prefix}.environment.machineClass`, "Declared study-machine class ID (not detected capture host)");
  e.os = await ask(ctx, `${prefix}.environment.os`, "Study-machine operating system", ["darwin", "linux", "win32"]);
  e.osVersion = await text(ctx, `${prefix}.environment.osVersion`, "Exact study-machine OS version");
  e.arch = await text(ctx, `${prefix}.environment.arch`, "Declared architecture ID, such as arm64 or x64");
  e.nodeVersion = await text(ctx, `${prefix}.environment.nodeVersion`, "Exact study Node version, major.minor.patch");
  e.installState = await ask(ctx, `${prefix}.environment.installState`, "Starting install state; unknown stays unknown", ["clean", "preinstalled", "unknown"]);
  const m = plan.model = {};
  m.kind = await ask(ctx, `${prefix}.model.kind`, "Planned model mode, not actual use", ["live-provider", "local-provider", "keyless-demo"]);
  if (m.kind === "keyless-demo") {
    ctx.say("Keyless-demo explicitly means no model identity/settings or required credential, and cannot complete the common real-model task.");
    Object.assign(m, { provider: null, id: null, revision: null, settingsSha256: null, credentialState: "not-required" });
  } else {
    m.provider = await text(ctx, `${prefix}.model.provider`, "Exact planned provider identity, never a credential");
    m.id = await text(ctx, `${prefix}.model.id`, "Exact planned model ID");
    m.revision = await text(ctx, `${prefix}.model.revision`, "Exact planned model revision/reference");
    m.settingsSha256 = await text(ctx, `${prefix}.model.settingsSha256`, "Actual SHA-256 of retained sanitized generation settings (no secrets)");
    m.credentialState = await ask(ctx, `${prefix}.model.credentialState`, "Starting credential state only; do not paste credential values", ["configured", "not-required", "missing", "unknown"]);
  }
}

async function guidedPrepare(ctx, flags) {
  printProtocol(ctx);
  const input = flags["--input"] ? await readCaptureJson(flags["--input"]) : {};
  ctx.pending = { store: flags["--store"], preparation: input };
  if (!flags["--input"]) {
    await studyFields(ctx, input);
    let count;
    for (;;) {
      const answer = await text(ctx, "session-count", `Total planned sessions across ALL participants/harnesses (1 through ${LIMITS.sessions}); no successful subset`);
      count = Number(answer);
      if (/^[0-9]+$/.test(answer) && Number.isSafeInteger(count) && count >= 1 && count <= LIMITS.sessions) break;
      ctx.say("Enter a whole planned roster size within the core's limit; zero/blank is not a roster.");
    }
    input.plannedSessions = [];
    for (let index = 0; index < count; index += 1) {
      const plan = {}; input.plannedSessions.push(plan); await planFields(ctx, plan, index);
    }
  }
  for (;;) {
    // The core alone owns validation. Its result is never a declaration of consent or outcomes.
    let valid = false;
    try { prepareDraft(input); valid = true; } catch (error) { explain(ctx, error); }
    ctx.say("FULL PLANNED POPULATION / metadata review (private). Creation freezes every entry and identity:");
    ctx.say(json(ctx.pending));
    ctx.say("Unknown install/credential states stay declared unknown. Missing/unknown starting credentials with later used=true can block intake; do not rewrite them to force admission.");
    const action = await ask(ctx, "prepare.review", "Review every row, pins, window rule and assistance policy before choosing create", valid
      ? ["create", "edit-study", "edit-session", "pause"] : ["edit-study", "edit-session", "pause"]);
    if (action === "pause") throw new ObserverPause();
    if (action === "edit-study") {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new ObserverError("preparation", "Use an object in a new reviewed preparation file; original input remains unchanged.");
      await studyFields(ctx, input); continue;
    }
    if (action === "edit-session") {
      if (!Array.isArray(input?.plannedSessions) || !input.plannedSessions.length || input.plannedSessions.length > LIMITS.sessions) {
        throw new ObserverError("preparation", "Review the full roster in the preparation file, or restart the wizard; no partial roster is created.");
      }
      const choices = input.plannedSessions.map((_plan, index) => String(index + 1));
      const index = Number(await ask(ctx, "prepare.edit-session", "Which displayed roster row will you explicitly re-enter?", choices)) - 1;
      const plan = {}; input.plannedSessions[index] = plan; await planFields(ctx, plan, index); continue;
    }
    active(ctx); ctx.writeAttempted = true;
    const state = await createCapture(input, flags["--store"], ctx.now());
    clearPending(ctx);
    ctx.say(`Preparation saved; no observations created. Journal: ${flags["--store"]}`);
    printStatus(ctx, state);
    return 0;
  }
}

const EVENT_LABELS = Object.freeze({
  start: "Observed start of this planned window, before the first setup action",
  "submitted-action": "One intentionally submitted operation (not keystrokes or internal automation)",
  assistance: "Observed assistance, including unsolicited help",
  "setup-failure": "Observed setup failure; retain even if the task later succeeds",
  refusal: "Observed refusal and whether its message actually named an actionable fix",
  "useful-result": "First useful real-model result under the common task criteria",
  "first-task-ended": "First attempt failed or incomplete, without a useful result",
  interruption: "Observed interruption for the separate recovery exercise",
  resume: "Explicit disposition of the recorded interruption",
  "recovery-decision": "Recovery not attempted or not observed (no interruption recorded)",
  "second-task": "Separate voluntary return decision; no follow-up is not-observed",
  close: "Explicitly close the full window and attest coverage at/after close"
});

/** UI projection only, after core replay. These suggestions never authorize an append. */
export function sessionView(state, sessionId) {
  const plan = state.draft.plannedSessions.find(row => row.sessionId === sessionId);
  if (!plan) throw new ObserverError("unplanned-session", "Choose an existing roster session ID; preparation cannot be replaced or extended.");
  const events = state.sessions.get(sessionId);
  const projection = projectSession(plan, events, state.draft.preparedAt);
  const interruption = events.find(event => event.type === "interruption");
  const disposition = events.find(event => ["resume", "recovery-decision"].includes(event.type));
  const returned = events.find(event => event.type === "second-task");
  const recovery = disposition?.data.outcome ?? (interruption ? "awaiting-resume" : "not-recorded");
  const secondTask = returned?.data.outcome ?? "not-recorded";
  const next = [];
  if (projection.status === "unobserved") next.push("start");
  else if (projection.status === "open") {
    next.push("submitted-action", "assistance", "setup-failure", "refusal");
    if (projection.outcome === null) next.push("useful-result", "first-task-ended");
    else if (recovery === "not-recorded") next.push("interruption", "recovery-decision");
    else if (recovery === "awaiting-resume") next.push("resume");
    else if (secondTask === "not-recorded") next.push("second-task");
    else next.push("close");
  }
  return { plan, events, projection, recovery, secondTask, next, lastAt: events.at(-1)?.at ?? state.draft.preparedAt };
}

function printStatus(ctx, state, report = captureStatus(state)) {
  ctx.say(`Study ${report.studyId}; revision ${report.revision}; reviewed head ${report.headSha256}`);
  ctx.say(`FULL ROSTER: ${report.plannedSessionCount} planned sessions. Counts below are retained entries, not proof of complete observation.`);
  for (const row of report.sessions) {
    const view = sessionView(state, row.sessionId);
    ctx.say(`${row.sessionId} | ${row.harness} | ${row.participantId} | ${row.participation} | ${row.status}`);
    ctx.say(`  First task: ${row.firstTaskOutcome ?? "NOT RECORDED"}; recovery: ${view.recovery}; voluntary return: ${view.secondTask}; retained events: ${row.activeEventCount}`);
    ctx.say(`  Coverage gaps: ${row.observationGaps === null ? "not yet declared (not zero)" : row.observationGaps.length ? row.observationGaps.join(", ") : "none declared"}; correction revisions: ${row.correctionRevisions.join(", ") || "none"}`);
    if (view.projection.status === "unobserved") ctx.say("  Missing: start, first-task outcome, recovery disposition, return disposition and close declarations.");
    else if (view.projection.status === "open") ctx.say(`  Still open. Next event categories: ${view.next.join(", ")}. Pause is always safe; it does not close the window.`);
    for (const blocker of row.blockers) ctx.say(`  BLOCKED ${blocker.path} [${blocker.code}]: ${blocker.message}`);
    if (row.recordingCheck) ctx.say(`  Recording-byte check: ${row.recordingCheck.status}`);
  }
  ctx.say(report.reportType ? `Export result: ${report.exportStatus}` : "Recording bytes have NOT been checked by status; export delegates verification to the core.");
  ctx.say(BOUNDARY);
}

async function closeFields(ctx, data) {
  ctx.say("Close is a declaration about the entire window, not just this terminal invocation. Unknown coverage is never counted as none.");
  const coverage = data.completeness = {};
  for (const [key, label] of Object.entries({ actions: "submitted actions", assistance: "assistance", setupFailures: "setup failures", refusals: "refusals" })) {
    const value = await ask(ctx, `close.completeness.${key}`, `Is the retained list of ${label} complete across the window? complete with no events explicitly declares none`, ["complete", "partial", "unknown"]);
    coverage[key] = value === "complete";
    if (!coverage[key]) ctx.say(`${key}: partial/unknown coverage is encoded as false by the core, yielding null measurements, never zero or an empty list. Setup/refusal gaps block export; action gaps block completed first-task records.`);
  }
  data.modelUsed = await declaration(ctx, "close.modelUsed", "Was the planned real model actually used? Planned identity does not establish use");
  const observer = data.observer = {};
  for (const [key, label] of Object.entries({
    humanPresent: "Was a human actually present?",
    independent: "Was the observer independent under the study procedure?",
    consentRecorded: "Was the required participation/recording consent recorded separately?",
    firstUse: "Was this a first use of this harness for this participant?"
  })) observer[key] = await declaration(ctx, `close.observer.${key}`, `${label} No answer is inferred from the roster`);
  observer.statement = await text(ctx, "close.observer.statement", "Sanitized observer statement covering the entire closed window");
  observer.recordedAt = await text(ctx, "close.observer.recordedAt", "Explicit observed UTC attestation time at/after close, YYYY-MM-DDTHH:mm:ss.sssZ; no now shortcut or invented future time");
  data.recordingPath = await optionalText(ctx, "close.recordingPath", "Retained recording's local relative path beneath the later evidence root; none/unknown blocks export");
  data.windowRuleSatisfied = await declaration(ctx, "close.windowRuleSatisfied", "Was the preregistered observation-window end rule actually satisfied?");
  data.windowRuleDeviation = data.windowRuleSatisfied ? null : await text(ctx, "close.windowRuleDeviation", "Describe the actual window-rule deviation; it remains an export blocker");
}

async function eventFields(ctx, event) {
  const d = event.data;
  switch (event.type) {
    case "start": break;
    case "submitted-action": d.description = await text(ctx, "action.description", "Describe ONE actually submitted operation, sanitized of secrets"); break;
    case "assistance": d.detail = await text(ctx, "assistance.detail", "Describe the actual assistance, without private identities or secrets"); break;
    case "setup-failure":
      d.code = await text(ctx, "setup-failure.code", "Observed setup failure code (lowercase ID)");
      d.detail = await text(ctx, "setup-failure.detail", "Describe the observed setup failure"); break;
    case "refusal": {
      d.code = await text(ctx, "refusal.code", "Observed refusal code (lowercase ID)");
      const fix = await ask(ctx, "refusal.namedFix", "Did the actual refusal message name an actionable fix? Unknown is distinct from no", ["yes", "no", "unknown"]);
      d.namedFix = fix === "unknown" ? null : fix === "yes"; break;
    }
    case "useful-result":
      ctx.say("An install/help screen/stub is not a useful real-model result. Later modelUsed=false or unknown action coverage will block this completed record.");
      d.judgement = await text(ctx, "useful-result.judgement", "Record the actual participant-observed judgement: concrete inputs/expected outcomes for all three common-task requirements"); break;
    case "first-task-ended":
      d.outcome = await ask(ctx, "first-task-ended.outcome", "Observed first-task disposition without a useful result", ["failed", "incomplete"]);
      d.reason = await text(ctx, "first-task-ended.reason", "Why did this first attempt end without a useful result?"); break;
    case "interruption": d.reason = await text(ctx, "interruption.reason", "Describe the actual interruption in the separate recovery exercise"); break;
    case "resume":
    case "recovery-decision": {
      const resume = event.type === "resume";
      d.outcome = await ask(ctx, `${event.type}.outcome`, resume ? "Observed recovery disposition; process exit is not successful resume" : "Explicit recovery disposition without a recorded interruption",
        resume ? ["succeeded", "failed", "not-attempted", "not-observed"] : ["not-attempted", "not-observed"]);
      d.reason = d.outcome === "succeeded"
        ? await optionalText(ctx, `${event.type}.reason`, "Optional actual recovery explanation")
        : await text(ctx, `${event.type}.reason`, "Explain the failed, unattempted or unobserved recovery"); break;
    }
    case "second-task":
      ctx.say('The separate optional task is: "Add an acceptance test for an empty JSONL file." No follow-up observation means not-observed, not did-not-return.');
      d.outcome = await ask(ctx, "second-task.outcome", "Actual voluntary return disposition; do not infer it from recovery", ["returned", "did-not-return", "not-observed"]);
      d.reason = d.outcome === "returned"
        ? await optionalText(ctx, "second-task.reason", "Optional actual voluntary-return explanation")
        : await text(ctx, "second-task.reason", "Explain the observed non-return or missing observation"); break;
    case "close": await closeFields(ctx, d); break;
    default: throw new ObserverError("event", "Choose a documented next event category.");
  }
}

async function collectEvent(ctx, state, sessionId, type) {
  let event = { type, at: null, timing: null, data: {} };
  ctx.pending = { store: ctx.store, expectedHead: state.headSha256, sessionId, event };
  if (type === "close") {
    // Explicit close time first; the subsequent observer declaration must cover it.
    event.at = await text(ctx, "close.at", "Actual observed UTC close time, YYYY-MM-DDTHH:mm:ss.sssZ; never record-now or an automatic future time");
    event.timing = "explicit-observed";
  }
  await eventFields(ctx, event);
  if (type !== "close") {
    const mode = await ask(ctx, "event.timing", "Use an explicit observed UTC timestamp, or deliberately declare this event observed now (not independent timing)?", ["explicit-observed", "record-now"]);
    if (mode === "record-now") {
      event = declareRecordNow(event, ctx.now()); ctx.pending.event = event;
      ctx.say(`Explicit record-now declaration: ${event.at}, labelled ${event.timing}. This is not automatic observation.`);
    } else {
      event.at = await text(ctx, "event.at", "Actual observed UTC event time, YYYY-MM-DDTHH:mm:ss.sssZ");
      event.timing = "explicit-observed";
    }
  }
  return event;
}

async function reconcile(ctx, state, candidate) {
  ctx.say("CONFLICT / uncertain write: the candidate is not confirmed saved by this command. It will not be retried, merged, or appended twice automatically.");
  showPending(ctx);
  const action = await ask(ctx, "conflict.review", "Review/reconcile the retained current journal against this candidate before any later manual re-entry", ["review", "pause"]);
  if (action === "review") {
    const latest = await loadCapture(ctx.store);
    printStatus(ctx, latest);
    ctx.say(`Candidate expected head: ${state.headSha256}. Current head: ${latest.headSha256}.`);
    if (candidate?.sessionId) {
      ctx.say("PRIVATE current effective events for the selected session; compare before deciding whether anything is actually unsaved:");
      ctx.say(json(latest.sessions.get(candidate.sessionId)));
    }
    ctx.say("Review the retained revision files as well, including corrections. This command stops here; it never replays the candidate.");
  }
  return 1;
}

async function guidedObserve(ctx, flags) {
  ctx.store = flags["--store"];
  let state = await loadCapture(ctx.store);
  printStatus(ctx, state);
  const id = flags["--session"] ?? await ask(ctx, "observe.session", "Select an existing planned session ID", state.draft.plannedSessions.map(plan => plan.sessionId));
  let view = sessionView(state, id);
  ctx.say("Selected frozen plan (private; no presence/use is inferred):"); ctx.say(json(view.plan));
  printProtocol(ctx);
  ctx.say(`Window rule: ${state.draft.observationWindowRule}\nAssistance policy: ${state.draft.assistancePolicy}`);
  for (;;) {
    active(ctx);
    // Reload before proposing the next event, but hold this head fixed through review/save.
    state = await loadCapture(ctx.store); view = sessionView(state, id);
    ctx.say(`${id}: ${view.projection.status}; first task ${view.projection.outcome ?? "NOT RECORDED"}; recovery ${view.recovery}; voluntary return ${view.secondTask}.`);
    ctx.say(`Head for the next reviewed append: ${state.headSha256}; last declared time: ${view.lastAt}`);
    if (!view.next.length) {
      ctx.say("This window is closed; no new normal event is permitted. Review status/export or the existing low-level correction guide.");
      printStatus(ctx, state); return 0;
    }
    for (const type of view.next) ctx.say(`  ${type}: ${EVENT_LABELS[type]}`);
    const type = await ask(ctx, "observe.next", "Choose what you actually observed, status/history, or pause", [...view.next, "status", "history", "pause"]);
    if (type === "pause") throw new ObserverPause();
    if (type === "status") { printStatus(ctx, state); continue; }
    if (type === "history") { ctx.say("PRIVATE effective event sequence; retained revision files also preserve corrections:"); ctx.say(json(view.events)); continue; }
    for (;;) {
      const event = await collectEvent(ctx, state, id, type);
      let projection;
      try { projection = projectSession(view.plan, [...view.events, event], state.draft.preparedAt); }
      catch (error) { explain(ctx, error); }
      ctx.say("REVIEW proposed event and expected head (private; not yet saved):"); ctx.say(json(ctx.pending));
      if (projection?.blockers.length) {
        ctx.say("This declaration can be retained but is UNREADY for export. Saving it never cures these blockers:");
        for (const item of projection.blockers) ctx.say(`${item.path} [${item.code}]: ${item.message}`);
      }
      const action = await ask(ctx, "event.review", projection ? "Explicitly confirm this observed event, re-enter it, discard only this unsaved input, or pause" : "Core refused this candidate; re-enter it, discard only unsaved input, or pause",
        projection ? ["save", "edit", "discard", "pause"] : ["edit", "discard", "pause"]);
      if (action === "pause") throw new ObserverPause();
      if (action === "edit") { clearPending(ctx); continue; }
      if (action === "discard") { clearPending(ctx); ctx.say("Unsaved input discarded. No retained event was removed."); break; }
      active(ctx); ctx.writeAttempted = true;
      try {
        const saved = await appendCapture(ctx.store, state.headSha256, "event", { sessionId: id, event }, ctx.now());
        clearPending(ctx);
        ctx.say(`Saved ${type} for ${id}; revision ${saved.revision}; head ${saved.headSha256}. No other observation was inferred.`);
      } catch (error) {
        explain(ctx, error);
        // Even I/O failures can leave a partial/complete next revision: never blindly retry.
        return await reconcile(ctx, state, { sessionId: id, event });
      }
      break;
    }
  }
}

async function guidedExport(ctx, flags) {
  ctx.store = flags["--store"];
  const state = await loadCapture(ctx.store);
  printStatus(ctx, state);
  ctx.say("Export admission and actual recording-byte verification are delegated to finalizeCapture. Missing/open/blocked sessions prevent a subset study from being written.");
  ctx.pending = { store: ctx.store, expectedHead: state.headSha256, evidenceRoot: null, outputPath: null };
  ctx.pending.evidenceRoot = flags["--evidence-root"] ?? await text(ctx, "export.evidence-root", "Explicit absolute private evidence-root directory containing retained recordings");
  ctx.pending.outputPath = flags["--out"] ?? await text(ctx, "export.out", "Explicit absolute NEW export directory outside both journal and evidence root, with an existing private parent");
  ctx.say("REVIEW export paths and full-roster head:"); ctx.say(json(ctx.pending));
  const head = await text(ctx, "export.head", "Paste the exact displayed head SHA-256 after reviewing ALL planned sessions (no inferred/latest-head substitution)");
  if (head !== state.headSha256) throw new ObserverError("review-head", "The entered head does not match the displayed review. Run status/review again; no export was attempted.");
  const answer = await ask(ctx, "export.review", "Confirm these paths and reviewed head. A blocked report still creates a new private export directory", ["export", "pause"]);
  if (answer === "pause") throw new ObserverPause();
  active(ctx); ctx.writeAttempted = true;
  let report;
  try {
    report = await finalizeCapture(ctx.store, head, ctx.pending.evidenceRoot, ctx.pending.outputPath, ctx.now());
  } catch (error) {
    if (error instanceof CaptureError && error.code === "revision-conflict") {
      explain(ctx, error); return await reconcile(ctx, state, null);
    }
    throw error;
  }
  const destination = ctx.pending.outputPath; clearPending(ctx);
  printStatus(ctx, state, report);
  for (const item of report.studyErrors) ctx.say(`STUDY BLOCKED ${item.path} [${item.code}]: ${item.message}`);
  ctx.say(`Report and retained journal archive: ${destination}`);
  ctx.say(report.studyWritten
    ? "COMPLETE ROSTER EXPORTED: study.json was written. Failed/incomplete tasks and supported unknowns remain. This is not authenticated human participation, task success, matched-cohort acceptance or issue completion."
    : "BLOCKED EXPORT: report.json and journal history were written, but NO study.json or successful subset. Resolve missing evidence with the study owner; never replace the frozen population.");
  ctx.say(report.boundary);
  return report.studyWritten ? 0 : 2;
}

function parseArguments(args) {
  const specs = {
    prepare: { required: ["--store"], optional: ["--input"] },
    observe: { required: ["--store"], optional: ["--session"] },
    status: { required: ["--store"], optional: [] },
    export: { required: ["--store"], optional: ["--evidence-root", "--out"] },
    protocol: { required: [], optional: [] }
  };
  const command = args[0];
  if (!Object.hasOwn(specs, command)) throw new ObserverError("arguments", "Choose a documented command; use --help for exact flags.");
  const spec = specs[command], flags = Object.create(null);
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (![...spec.required, ...spec.optional].includes(key) || Object.hasOwn(flags, key)
      || typeof value !== "string" || !value.trim() || value.startsWith("--")) {
      throw new ObserverError("arguments", "Unknown/duplicate flag or missing value. Use --help; each documented flag may appear once.");
    }
    flags[key] = value;
  }
  if (!spec.required.every(key => Object.hasOwn(flags, key))) throw new ObserverError("arguments", "Required flags are missing. Use --help for the exact command interface.");
  return { command, flags };
}

/** Import-safe CLI. Tests inject prompt({id,label,choices}), output/error and now; storage stays real. */
export async function runCli(args = process.argv.slice(2), io = {}) {
  let terminal;
  const ctx = {
    say: message => (io.output ?? (text => process.stdout.write(text)))(`${safe(message)}\n`),
    error: message => (io.error ?? (text => process.stderr.write(text)))(`${safe(message)}\n`),
    prompt: io.prompt, now: io.now ?? (() => new Date().toISOString()),
    isCancelled: io.isCancelled ?? (() => false), pending: null, writeAttempted: false, store: null
  };
  try {
    if (args.length === 1 && ["--help", "help"].includes(args[0])) { ctx.say(HELP); return 0; }
    const { command, flags } = parseArguments(args);
    if (command === "protocol") { printProtocol(ctx); return 0; }
    if (command === "status") { printStatus(ctx, await loadCapture(flags["--store"])); return 0; }
    if (ctx.prompt === undefined) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new ObserverError("terminal-required", "Interactive preparation/observation/export requires a terminal, not piped answers. Use status or --help; do not collect observations unattended.");
      terminal = createTerminalPrompt(); ctx.prompt = terminal.prompt; ctx.isCancelled = terminal.isCancelled;
    }
    if (typeof ctx.prompt !== "function") throw new ObserverError("prompt", "An explicit interactive prompt function is required.");
    ctx.say("PRIVATE TERMINAL: prompts/reviews may show pseudonyms and narratives. Do not paste secrets, names, contact details or transcripts; no secret detection is provided.");
    ctx.say(BOUNDARY);
    if (command === "prepare") return await guidedPrepare(ctx, flags);
    if (command === "observe") return await guidedObserve(ctx, flags);
    return await guidedExport(ctx, flags);
  } catch (error) {
    if (error instanceof ObserverPause || error?.name === "AbortError") {
      ctx.say("Paused/cancelled. No automatic observation or close was added. Completed writes remain; partial input is not resumed automatically.");
      showPending(ctx); return ctx.writeAttempted ? 1 : 0;
    }
    explain(ctx, error); showPending(ctx);
    return error instanceof Unready ? 2 : 1;
  } finally { terminal?.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
