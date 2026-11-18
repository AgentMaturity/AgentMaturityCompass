// The A4 console's one table of plain words: every stage, step, status, decision, role, sign-in kind and item a person
// can meet on the agent project pages, with the code beside it in small print. tests/a4/plainWords.test.ts reads the
// enums from src/contracts/v1/a4*.ts and src/a4/a4Schema.ts and fails when a value has no words here.
// Helpers for the rest of the page live here too: "Show the record" (the raw record, unchanged), times in the reader's
// own time with UTC in the title, and long hashes shortened with the whole value in the title.
import { esc } from "./a4Html.js";

export const STAGE_PLAIN = { aspire: "Say what it is for", assemble: "Build it", adapt: "Fit it to your rules", activate: "Release it" };
/** The same four stages in at most two words, for the waypoints of a route. */
export const STAGE_SHORT = { aspire: "Describe it", assemble: "Build it", adapt: "Fit rules", activate: "Release it" };
export const STEP_PLAIN = { asked: "Answer the questions", understood: "Check how AMC understood you", explained: "See AMC's choices explained",
  proposed: "Review the plan", direction_approved: "Get approval to build", built: "Build", reviewed: "Review the result",
  completion_approved: "Get final approval" };

/** Each kind of code a person can meet, in plain words. */
export const PLAIN = {
  stage: STAGE_PLAIN,
  stageState: { ...STAGE_PLAIN, retired: "Retired: no longer in use" },
  step: STEP_PLAIN,
  lane: { recommendation: "What AMC recommends", implementation: "What was built", observed: "What was seen while it ran",
    verified: "What someone else checked", governance: "Rules and approvals", integrity: "AMC's own check of the record" },
  gate: { direction: "approval of the plan", completion: "final approval", policy: "change to the approval rules" },
  gateStatus: { PENDING: "waiting for approvals", QUORUM_MET: "approved, not used yet", DENIED: "turned down", EXPIRED: "expired",
    CONSUMED: "approved and used", STALE: "out of date: something it covers changed", CHANGES_REQUESTED: "changes were asked for",
    CANCELLED: "cancelled" },
  decision: { APPROVE_EXECUTE: "approved", DENY: "turned down" },
  projectRole: { owner: "owner", builder: "builder", reviewer: "reviewer", approver: "approver", viewer: "can only look" },
  workspaceRole: { OWNER: "workspace owner", OPERATOR: "operator", APPROVER: "approver", AUDITOR: "auditor", VIEWER: "can only look" },
  authSource: { LOCAL_USER: "an account in this workspace", WORKSPACE_ROUTER: "a sign-in from the host" },
  admission: { browser_csrf: "signed in from the browser", native_login_token: "signed in from the command line" },
  identityCheck: { users_yaml: "checked against this workspace's accounts", session_record: "taken from the host's session records, not checked live" },
  itemStatus: { WAITING: "waiting", READY: "done", COMPLETE: "complete", BLOCKED: "blocked", NOT_EVALUATED: "not checked" },
  readinessStatus: { READY: "ready for the next step", BLOCKED: "blocked", WAITING: "waiting", COMPLETE: "complete", ON_HOLD: "on hold" },
  blockerKind: { not_evaluated: "not checked yet", evidence_missing: "a record is missing", evidence_stale: "a record is out of date",
    evidence_contradictory: "records disagree", evidence_untrusted: "a record cannot be trusted", review_pending: "waits for a person",
    exception_expiring: "an exception is about to end", waiver_expiring: "a waiver is about to end", outcome_unknown: "the result of an action is unknown",
    source_unavailable: "a source could not be read", unsupported_integration: "not supported on this setup", scope_changed: "something changed since",
    self_approved: "approved by the author only", effect_failed: "a step that changes things failed", hold: "on hold",
    sod_violation: "the same person would approve their own work", plan_denies_native_session: "the rules block a build session" },
  refKind: { stage_output: "a step's output", ledger_event: "an event in the log", receipt: "a receipt", session: "a session", artifact: "a file",
    approval: "an approval", manifest: "a list of the agent's files", plan: "a plan", control_result: "a rule check", package: "a release package",
    deployment_receipt: "a deployment receipt", verification: "a check", rollback_receipt: "a rollback receipt", value_claim: "a value statement",
    outcome_report: "an outcome report", monitor: "a monitor", external: "an outside record" },
  answerSource: { user: "your answer", inferred: "suggested by AMC", carried: "from an earlier step" },
  claimKind: { self_reported: "what someone stated (self-reported)", synthetic_example: "from the stand-in model, not a real agent",
    observed: "seen by AMC", not_evaluated: "not checked" },
  riskTier: { low: "low", med: "medium", medium: "medium", high: "high", critical: "critical" }
};

/** `code` in plain words from `table` (a PLAIN key), or the code itself when the table has none. */
export const say = (table, code) => PLAIN[table]?.[code] ?? String(code ?? "");
/** The code in small print beside its words, for example "approved (APPROVE_EXECUTE)". */
export const code = (value) => `<small class="a4-code">(${esc(value)})</small>`;
export const sayCode = (table, value) => `${esc(say(table, value))} ${code(value)}`;

/** A stored answer that is a code (src/a4/spec/*.ts choices), in words; other answers read as written. */
const STAND_IN = "the stand-in model (canned replies; it says nothing about a real agent)";
const ANSWER_WORDS = {
  providers: { stub: STAND_IN }, path: { native: "inside AMC" }, riskTier: PLAIN.riskTier,
  autonomy: { advise: "only advise (no tools; it only answers)", act_with_approval: "act with the workspace's signed tools, with an approval for consequential calls" },
  governance: { regulated: "the stricter approval rules for regulated work", standard: "the standard approval rules" }
};
/** HTML: the answer's words with the stored value in small print when it is a known code, else the value as written. */
export const answerHtml = (questionId, value) => {
  const words = typeof value === "string" ? ANSWER_WORDS[questionId]?.[value] : undefined;
  return words === undefined ? esc(value) : words === value ? esc(words) : `${esc(words)} ${code(value)}`;
};

/** What each readiness item checks, in a few words; an id not listed reads as its own words, spaced out. */
const ITEM_TITLES = {
  ask_complete: "Every needed question has an answer", understanding_confirmed: "You confirmed what AMC understood",
  "members.present": "The project has members", "members.candidates": "People who could be added", "signing.available": "AMC can sign records",
  "signing.notary_route": "Where records are signed", "signing.notary_reachable": "The signing service answers", "store.integrity": "The project's record is intact",
  "approvals.policy_signed": "The approval rules are signed", "gate.policy_floor": "The approval rules meet the minimum", "hold.none": "The project is not on hold",
  "identity.check": "How people's sign-in is checked", "effects.failed": "No step that changes things has failed", "resources.current": "The agent's files are as recorded",
  "sod.self_provisioned": "Approvers are different people", sod: "Nobody approves their own work", "gate.direction": "Approval of the plan",
  "gate.completion": "Final approval", "gate.required_reviews": "Required reviews are done", "approvals.fresh": "Approvals are still current",
  alternatives_present: "Other ways to do it are listed", hypotheses_present: "What should improve is written down", learning_plan_present: "How it will be measured",
  quality_spec_complete: "Quality targets are set", risk_section_present: "Risks are listed", brief_valid: "The brief is complete",
  context_graph_written: "The agent's context file is written", agent_config_signed: "The agent's settings are signed", manifest_active: "The list of the agent's files is active",
  plan_proposed: "The build plan is drafted", baseline_manifest: "The starting list of the agent's files", path_supported: "The way it is built is supported",
  unsupported_acknowledged: "Unsupported parts are acknowledged", toolset_ready: "The tools it may use are ready", signed_configs_trusted: "Signed settings are trusted",
  no_open_outcome_unknown: "No action with an unknown result", preset_signed: "The agent's preset is signed", validation_pinned: "Checks for the build are chosen",
  build_sessions_integrity: "The build session's records are intact", effect_gate: "The second approval that applies the build",
  composition_bound: "How the agent is put together is checked", lifecycle_bridge: "The agent's life-cycle stage",
  profile_facts_complete: "Facts about where and how it is used", plan_compiled: "The rules that apply are worked out", plan_no_missing_facts: "No rule waits for a fact",
  plan_conflicts_resolved: "Rules that disagree are settled", plan_unresolved: "Rules that depend on unknown facts", plan_lock_drift: "The rule catalog is unchanged",
  plan_signed: "The rules are signed", conformance_statement: "Which rules are met", plan_review_opened: "The review of the rules is open",
  plan_activated: "The rules are switched on", memory_policy_present: "What it may remember", memory_policy_retention_floor: "How long it must keep records",
  configs_trusted: "Settings are trusted", clocks_classified: "Reporting deadlines are sorted", required_entries_satisfied: "Required approvals are recorded",
  regulatory_sources_status: "The rule texts' status", data_handling_declared: "How it handles data is declared", prompts_attributed: "Where its instructions come from",
  context_reaches_runtime_frame: "Its instructions reach it when it runs", model_delivery: "Its instructions reach a real model",
  "context.native_delivery": "Its instructions reach a build session", profile_no_widening: "Its permissions do not grow",
  "lineage.independent_approvals": "Approvals came from different people", release_proposed: "The release is drafted", "package.inputs": "The release package's contents",
  "package.transparency": "The release is in the public log", "deployment.same_host": "This AMC can release the agent", "deployment.topology": "The way it is deployed",
  "deployment.image_pinned": "The exact software version is pinned", "lease.scope": "The permission to deploy", "lease.principal": "Who holds the permission to deploy",
  "deployment.receipt": "The operator's deployment receipt", "deployment.amc_check": "AMC's check of the deployment", "monitoring.source": "Where monitoring comes from",
  "backup.include_paths": "Backups include the project", "lifecycle.production_controls": "Controls for live use", release_effect: "The second approval that releases it",
  rollback_effect: "The second approval that rolls it back"
};
const PREFIX_TITLES = [["hypothesis.", "Something that should improve"], ["aspire.", "A signature check"], ["adapt.plan.", "A rule setting"],
  ["adapt.", "A signature check"], ["assemble.", "A signature check"], ["activate.", "A signature check"]];
export function itemTitle(id) {
  const text = String(id ?? "");
  return ITEM_TITLES[text] ?? PREFIX_TITLES.find(([prefix]) => text.startsWith(prefix))?.[1] ?? text.replace(/[._]+/g, " ");
}

// The words src/a4/a4Words.ts gives Studio's refusals and `amc a4 readiness`, the same here (tests/a4/plainWords.test.ts compares them).
const NOT_READY_WORDS = {
  "sod.self_provisioned": "Every approver here was created in this one workspace, so AMC cannot show they are different people. A project owner "
    + "acknowledges this once, with a reason, on the Missing requirements card; it holds for 90 days.",
  sod: "Someone other than the person who wrote, built or asked for this step must approve it (separation of duties). Add a second person on the "
    + "project's Members card first.",
  ask_complete: "Some questions still need an answer, or an answer is not one AMC accepts. Answer them under Ask and press Save answers.",
  understanding_confirmed: "Run Understand, check what AMC understood from your answers, and confirm it.",
  plan_unresolved: "Some rules depend on facts that are still unknown. Answer them under Ask (on a regulated project they cannot be acknowledged instead).",
  "hold.none": "The project is on hold. A project owner resumes it.",
  "gate.direction": "This step's plan waits for approval before anything is built.",
  "gate.completion": "This step waits for the approval that completes it.",
  "resources.current": "The agent's files changed since this revision was recorded. Save an answer under Ask to record a new revision."
};
const NOBODY_ELSE = "Nobody else on this project can approve it. Invite a second person on the Members card (Invite someone new), "
  + "or add someone who can already sign in there. To learn AMC alone, start a practice project instead.";
const PRODUCED_AT = { UNDERSTAND: "Understand", PROPOSE: "Propose", BUILD: "Build", REVIEW: "Review" };
/** One readiness item in words, as src/a4/a4Words.ts notReadyWords says it; undefined when readiness has none. */
export function notReadyWords(item) {
  const codes = Array.isArray(item?.reasonCodes) ? item.reasonCodes : [];
  if (item?.id === "sod.self_provisioned" && codes.includes("NO_SECOND_APPROVER")) return NOBODY_ELSE;
  const step = codes.map((value) => value === "NOT_PROPOSED" ? "PROPOSE" : /^PRODUCED_AT_([A-Z]+)$/.exec(value)?.[1])
    .find((name) => name !== undefined && PRODUCED_AT[name] !== undefined);
  return NOT_READY_WORDS[item?.id] ?? item?.nextAction?.label
    ?? (step === undefined ? undefined : `Not made yet: AMC records it when you run ${PRODUCED_AT[step]} at this stage.`);
}

/** The raw record, unchanged, inside a closed "Show the record" (its key keeps it open across re-renders once opened). */
export const record = (inner, key = "record") => `<details class="a4-record" data-a4-open="record:${esc(key)}"><summary>Show the record</summary>${inner}</details>`;

const pad = (number) => String(number).padStart(2, "0");
/** A time in the reader's own time zone, with the UTC time in the title; "" for a missing time. */
export function when(ts) {
  const date = typeof ts === "string" ? new Date(ts) : Number.isSafeInteger(ts) ? new Date(ts) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `<time datetime="${esc(date.toISOString())}" title="${esc(`${date.toISOString().slice(0, 19).replace("T", " ")} UTC`)}">${esc(local)}</time>`;
}

/** A long hash or id shortened to its first 12 characters, the whole value in the title. */
export const short = (value) => {
  const text = String(value ?? "");
  return text.length > 16 ? `<span class="a4-hash" title="${esc(text)}">${esc(text.slice(0, 12))}…</span>` : esc(text);
};

/** One readiness item as a line of words: what it checks, its state, and what it still needs; codes stay in the record. */
export function itemLine(item, withNext = true) {
  if (!item) return "";
  const open = !["READY", "COMPLETE"].includes(item.status);
  // A caller that shows the item's next action itself (a link or a command) passes withNext false, so its label is not said twice.
  const words = open && (withNext || notReadyWords(item) !== item.nextAction?.label) ? notReadyWords(item) : undefined;
  return `<p class="a4-item"><span class="a4-state a4-state-${esc(String(item.status).toLowerCase())}">${esc(say("itemStatus", item.status))}</span>
    ${esc(itemTitle(item.id))}${words ? `: ${esc(words)}` : ""}</p>`;
}

/** An item in words, with its record (id, status, reason codes, next action and command, as Studio returned them) under "Show the record". */
export function itemWithRecord(item, id = item?.id) {
  if (!item) return "";
  const codes = (Array.isArray(item.reasonCodes) ? item.reasonCodes : []).map((value) => `<code>${esc(value)}</code>`).join(" ");
  const raw = `<p class="muted"><code>${esc(id)}</code> <code>${esc(item.status)}</code> ${codes}${item.nextAction?.label
    ? ` · ${esc(item.nextAction.label)}${item.nextAction.command ? ` <code>${esc(item.nextAction.command)}</code>` : ""}` : ""}</p>`;
  return `<div class="a4-item-row">${itemLine(item)}${record(raw, `item:${id}`)}</div>`;
}
