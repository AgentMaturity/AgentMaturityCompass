/**
 * Assemble's question bank, spec helpers and readiness items (P1-60 slice A; design §9.2, §10.2). Understand carries the
 * Aspire answers Assemble depends on (`riskTier`, `stations`) as `carried` answers; a carried answer that no longer
 * equals Aspire's re-asks every question that depends on it. The item builders are pure: they read the newest Assemble
 * revision, the chain and the live facts, never a file, and nothing here computes a maturity level. The producers live in
 * src/a4/stages/assemble.ts (Understand, Explain, Propose, the apply effect) and src/a4/assembleBuild.ts (Build, Review).
 */
import { A4_STEPS } from "../../contracts/v1/a4Project.js";
import { MAX_PLAN_NODES, parseWorkflowPlan, planAgentCount, type WorkflowNode } from "../../workflow/workflowPlan.js";
import type { A4ReadinessItem, A4ReadinessQuery, A4ReadinessState } from "../a4Readiness.js";
import type { A4Producer } from "../a4RouterStages.js";
import { a4AnswerSchema, flatSlots, type A4Answer, type A4Question, type A4Step } from "../a4Schema.js";
import { INTEGRATION_PATHS, integrationClaimFor } from "../assemblePaths.js";
import { answersDigestOf, answerValues, aspireSpecOf, dependencyDigest, listValue, textValue, understandingCurrent } from "./aspire.js";

const question = (id: string, prompt: string, kind: A4Question["kind"], required: boolean, dependsOn: string[] = []): A4Question =>
  ({ id, stage: "assemble", prompt, dependsOn, required, kind });

/** Aspire answers Assemble carries (Understand records them `source: "carried"`); they are changed only at Aspire. */
export const CARRIED = ["riskTier", "stations"] as const;
export const AUTONOMY = ["advise", "act_with_approval"] as const;
export const NATIVE_PROVIDERS = ["stub", "openai", "openai-responses", "anthropic", "deepseek", "gemini", "gemini-audio", "ollama"] as const;
/** A validation check id as Studio's native task start takes it (src/studio/nativeTaskValidation.ts). */
const CHECK_ID = /^[a-zA-Z0-9_-]{1,64}$/;

/** The Assemble question bank (design §10.2 Ask). */
export const QUESTIONS: A4Question[] = [
  question("riskTier", "Risk tier, carried from Aspire (change it there: reopen Aspire).", "fact", false),
  question("stations", "Stations, carried from Aspire (change them there: reopen Aspire).", "fact", false),
  question("capabilities", "What must the agent be able to do? One capability per line.", "list", true, ["stations"]),
  question("autonomy", "Autonomy: advise (no tools; it only answers) or act_with_approval (the signed workspace tools; consequential calls need an approval)?",
    "choice", true, ["riskTier"]),
  question("tools", "Which signed workspace tools should it use? One tools.yaml tool name per line; leave empty for the whole signed scope.", "list", false, ["autonomy"]),
  question("connectors", "Which reviewed MCP connectors does it need? One per line; leave empty for none.", "list", false),
  question("providers", `Model provider for build sessions: stub (offline, no key) or provider:model, the provider one of ${NATIVE_PROVIDERS.join(", ")}.`,
    "text", true),
  question("existingSystems", "Which existing systems will it touch? One per line.", "list", false),
  question("budget", "Budget for build sessions, in your words (AMC enforces its own per-turn limits regardless).", "text", false),
  question("path", `Engineering path: ${INTEGRATION_PATHS.join(", ")}.`, "choice", true),
  question("validation", "Validation checks to run in the build session: check ids from the operator's validation config, one per line; leave empty for none.",
    "list", false, ["autonomy"]),
  question("workflow", "Optional: a declared workflow of delegated tasks, as JSON: {kind: \"agent\", id, runAs, goal, scope?}, {kind: \"parallel\", id, children} or {kind: \"pipeline\", id, stages}, at most 64 nodes. Leave empty for none.",
    "text", false, ["autonomy"])
];

export const ASSEMBLE_SPEC_SCHEMA = "amc.a4-assemble-spec/v1";
/** The existing native-task strings (src/console/assets/nativeTasksView.js:94). */
export const ASSEMBLE_CLAIM_BOUNDARY = "Admission is not task completion; a recorded vote does not mean the action has run";
/** What a stub-provider build session says about the agent (design §10.1, §10.2): the completion gate binds it through the review spec. */
export const STUB_WORDING = "tool pipeline observed on a stub model; agent behaviour not evaluated";
export const APPLY_EFFECT_ID = "a4.assemble.apply";
/** The EVIDENCE_REF purpose of an outcome_unknown resolution request (src/a4/assembleResolve.ts). */
export const RESOLUTION_PURPOSE = "outcome_unknown_resolution";
/** The seam the native task lane owns before composition.compositionDigest and composition.policyDigest can be recomputed per session. */
export const COMPOSITION_SEAM_KEY = "NATIVE_TASK_COMPOSITION_DIGESTS";
/**
 * The seam before Assemble's completion can advance the lifecycle development → testing (design §7 item 9, §10.2): the
 * A4 lifecycle wrapper (a4Lifecycle.advance, planned in P1-62's a4Lifecycle.ts, whose issue bridges only →staging and
 * →production). Until it lands, nothing in A4 advances an agent past its recorded stage, and readiness says so.
 */
export const LIFECYCLE_SEAM_KEY = "A4_LIFECYCLE_WRAPPER";
/** The workspace preset Build signs for the agent (src/presets/agentPresets.ts, `.amc/agents.yaml`). */
export const presetIdOf = (agentId: string): string => `a4-${agentId}`;

const load = () => import("../stages/assemble.js");
/** Assemble's producers; the router records their outputs instead of the no-producer path (src/a4/a4RouterStages.ts). */
export const PRODUCERS: readonly A4Producer[] = (["understand", "explain", "propose", "build", "review"] as const)
  .map((step) => ({ id: `assemble.${step}`, step, run: async (ctx) => (await load()).produceAssemble(step, ctx) }));

/** The newest Assemble revision's spec and answers. */
export function assembleSpecOf(state: Pick<A4ReadinessState, "revisions">): { spec: Record<string, unknown>; answers: A4Answer[]; revisionNo: number | null } {
  const revision = state.revisions.filter((row) => row.stage === "assemble").at(-1);
  const spec = revision ? JSON.parse(revision.spec_json) as Record<string, unknown> : {};
  const answers = Array.isArray(spec.answers) ? spec.answers.flatMap((answer) => {
    const parsed = a4AnswerSchema.safeParse(answer);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  return { spec, answers, revisionNo: revision?.revision_no ?? null };
}

/** The Aspire answers Assemble carries, as the newest Aspire revision records them (absent ones are left out). */
export function carriedValues(state: Pick<A4ReadinessState, "revisions">): Map<string, unknown> {
  const values = answerValues(aspireSpecOf(state).answers);
  return new Map(CARRIED.filter((id) => values.has(id)).map((id) => [id, values.get(id)]));
}

/** `stub`, or `provider:model` for a model-requiring provider; null when it names no native provider. */
export function parseProvider(value: unknown): { provider: (typeof NATIVE_PROVIDERS)[number]; model: string | null } | null {
  const text = textValue(value);
  if (text === null) return null;
  const at = text.indexOf(":");
  const provider = (at < 0 ? text : text.slice(0, at)).trim();
  const model = at < 0 ? null : text.slice(at + 1).trim() || null;
  if (!(NATIVE_PROVIDERS as readonly string[]).includes(provider) || (provider === "stub" && model !== null) || (provider !== "stub" && model === null)) return null;
  if (model !== null && (model.length > 200 || /[\x00-\x1f\x7f]/.test(model))) return null;
  return { provider: provider as (typeof NATIVE_PROVIDERS)[number], model };
}

/**
 * Whether `raw` holds at most MAX_PLAN_NODES nodes, counted iteratively and refused at the cap: parseWorkflowPlan recurses
 * over the whole input before it counts, and readiness parses this answer on every read, so a deeply nested answer must
 * never reach it (a stack overflow there would fail every read of the project).
 */
function withinNodeCap(raw: unknown): boolean {
  const pending: unknown[] = [raw];
  for (let nodes = 0; pending.length > 0; nodes += 1) {
    if (nodes >= MAX_PLAN_NODES) return false;
    const node = pending.pop();
    if (node === null || typeof node !== "object" || Array.isArray(node)) continue;
    for (const key of ["children", "stages"]) {
      const children = (node as Record<string, unknown>)[key];
      if (!Array.isArray(children)) continue;
      if (children.length > MAX_PLAN_NODES) return false;
      pending.push(...children);
    }
  }
  return true;
}

/**
 * The declared workflow (design §10.2, the `workflow` executor), refused as data before anything could spawn: JSON runs
 * nothing, the node cap is checked before any recursion (withinNodeCap), and parseWorkflowPlan checks node kinds, unique
 * ids and scopes. A workflow delegates through the signed workspace tools, so it needs autonomy act_with_approval. null
 * when none is declared.
 */
export function workflowPlanOf(value: unknown, autonomy: unknown): { plan: WorkflowNode; agents: number } | { error: string } | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return { error: "the workflow is not JSON" };
    }
  }
  if (!withinNodeCap(raw)) return { error: `a workflow plan may contain at most ${MAX_PLAN_NODES} nodes` };
  const parsed = parseWorkflowPlan(raw);
  if (!parsed.ok) return { error: parsed.reason };
  if (textValue(autonomy) !== "act_with_approval") return { error: "a workflow delegates with the signed workspace tools: choose autonomy act_with_approval" };
  return { plan: parsed.plan, agents: planAgentCount(parsed.plan) };
}

/**
 * Required questions with no answer, answered ones whose dependencies changed since, answers that are not one of their
 * question's values, and carried answers that are missing or no longer Aspire's (fail closed: re-carry at Understand).
 */
export function answerGaps(answers: readonly A4Answer[], carried: ReadonlyMap<string, unknown>): { missing: string[]; stale: string[]; invalid: string[]; carried: string[] } {
  const values = answerValues(answers);
  const workflow = workflowPlanOf(values.get("workflow"), values.get("autonomy"));
  const checks = listValue(values.get("validation"));
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const missing = QUESTIONS.filter((entry) => entry.required && listValue(values.get(entry.id)).length === 0).map((entry) => entry.id);
  const stale = QUESTIONS.filter((entry) => byId.has(entry.id) && entry.dependsOn.length > 0
    && byId.get(entry.id)!.dependencyDigest !== dependencyDigest(entry.dependsOn, values)).map((entry) => entry.id);
  const choice = (id: string, allowed: readonly string[]): boolean => textValue(values.get(id)) !== null && !allowed.includes(textValue(values.get(id))!);
  const invalid = [
    ...(choice("autonomy", AUTONOMY) ? ["autonomy"] : []),
    ...(choice("path", INTEGRATION_PATHS) ? ["path"] : []),
    ...(textValue(values.get("providers")) !== null && parseProvider(values.get("providers")) === null ? ["providers"] : []),
    // Validation runs as public checks in the session, which needs the signed workspace tools; Studio takes 1 to 8 distinct check ids.
    ...(checks.length > 0 && (textValue(values.get("autonomy")) !== "act_with_approval" || checks.length > 8 || new Set(checks).size !== checks.length
      || !checks.every((id) => CHECK_ID.test(id))) ? ["validation"] : []),
    ...(workflow !== null && "error" in workflow ? ["workflow"] : [])
  ];
  const carriedGaps = CARRIED.flatMap((id) => !carried.has(id) ? [] : !byId.has(id) ? [`CARRIED_MISSING:${id}`]
    : JSON.stringify(values.get(id) ?? null) !== JSON.stringify(carried.get(id) ?? null) ? [`CARRIED_STALE:${id}`] : []);
  return { missing, stale, invalid, carried: carriedGaps };
}

/** Whether `spec` is the plan Propose built for exactly these answers. */
export const proposedFor = (spec: Record<string, unknown>, answers: readonly A4Answer[]): boolean =>
  spec.schema === ASSEMBLE_SPEC_SCHEMA && spec.answersDigest === answersDigestOf(answers);

type Fields = Partial<Omit<A4ReadinessItem, "id" | "status">>;
const item = (id: string, status: A4ReadinessItem["status"], fields: Fields = {}): A4ReadinessItem => ({
  id, status, kind: null, reasonCodes: [], section: "implementation", evidence: [], claim: null, report: null, acknowledged: null,
  nextAction: null, mandatory: true, bound: false, ...fields
} as A4ReadinessItem);
const waiting = (id: string, codes: string[], fields: Fields = {}): A4ReadinessItem => item(id, "WAITING", { kind: "evidence_missing", reasonCodes: codes, ...fields });

/** Whether the project has reached `step` at Assemble (any later stage counts; Aspire has not). */
function reached(state: A4ReadinessState, step: A4Step): boolean {
  if (state.project.stage !== "assemble") return state.project.stage !== "aspire";
  return A4_STEPS.indexOf(state.project.step) >= A4_STEPS.indexOf(step);
}

/**
 * The baseline Propose recorded is the agent's ACTIVE signed Enforce manifest, and it is what the proposal revision bound
 * (`enforce.resourcesSha256` at that transition): pending drift is reviewed in Enforce first, never applied unseen by
 * Assemble's completion effect.
 */
function baselineItem(state: A4ReadinessState, spec: Record<string, unknown>): A4ReadinessItem {
  const baseline = (spec.baseline ?? null) as { state?: unknown; resourcesSha256?: unknown; nextAction?: { label?: unknown; command?: unknown } | null } | null;
  if (baseline === null) return waiting("baseline_manifest", ["PRODUCED_AT_PROPOSE"]);
  const proposal = [...state.revisions].reverse().find((row) => {
    if (row.stage !== "assemble") return false;
    const rowSpec = JSON.parse(row.spec_json) as Record<string, unknown>;
    return rowSpec.schema === ASSEMBLE_SPEC_SCHEMA && rowSpec.build === undefined;
  });
  const bound = proposal === undefined ? undefined : flatSlots(JSON.parse(proposal.resource_digests_json))["enforce.resourcesSha256"];
  if (baseline.state === "ACTIVE" && typeof baseline.resourcesSha256 === "string" && bound === baseline.resourcesSha256) return item("baseline_manifest", "READY");
  const next = baseline.nextAction ?? null;
  return item("baseline_manifest", "BLOCKED", { kind: "scope_changed",
    reasonCodes: [baseline.state === "ACTIVE" ? "BASELINE_MOVED_AT_PROPOSE" : `BASELINE_${String(baseline.state)}`],
    nextAction: { label: `${typeof next?.label === "string" ? next.label : "Review the agent's Enforce resources"}, then propose again`,
      ...(typeof next?.command === "string" ? { command: next.command } : {}) } });
}

/**
 * The outcome_unknown lockout (design §10.2 Explain): an open one blocks the agent's journaled calls and this stage. Each
 * open execution is named, with the resolution this project requested for it (`RESOLUTION_REQUESTED:<execution>:<engine
 * request>:<request digest>:<engine status>`, the digest an approver binds to from the card; a DENIED, EXPIRED or
 * CANCELLED request is requested again). A resolution the journal settled under this project's request that the project
 * never recorded (`RESOLUTION_UNRECORDED:<execution>:<engine request>`) keeps the item BLOCKED until it is recorded.
 */
function lockoutItem(state: A4ReadinessState, query: A4ReadinessQuery): A4ReadinessItem {
  const open = query.live.blockingExecutions;
  const unrecorded = query.live.unrecordedResolutions;
  if (open === null || unrecorded === null) return item("no_open_outcome_unknown", "NOT_EVALUATED", { kind: "source_unavailable", reasonCodes: ["ACTION_JOURNAL_UNREADABLE"] });
  const unrecordedCodes = unrecorded.map((id) => `RESOLUTION_UNRECORDED:${id}`);
  if (open.length === 0 && unrecorded.length === 0) return item("no_open_outcome_unknown", "READY");
  if (open.length === 0) {
    return item("no_open_outcome_unknown", "BLOCKED", { kind: "outcome_unknown", reasonCodes: ["RESOLUTION_UNRECORDED", ...unrecordedCodes],
      nextAction: { label: "The journal settled a resolution this project requested, but the project has no record of it: record the resolution (self-reported)" } });
  }
  const requested = open.slice(0, 16).flatMap((id) => {
    const link = [...state.chain].reverse().find((candidate) => candidate.kind === "EVIDENCE_REF" && candidate.body.purpose === RESOLUTION_PURPOSE
      && candidate.body.executionId === id);
    const status = link === undefined ? null : query.live.engineRequests?.[String(link.body.refId)] ?? "UNREAD";
    return link === undefined ? [] : [`RESOLUTION_REQUESTED:${id}:${String(link.body.refId)}:${String(link.body.sha256)}:${status}`];
  });
  return item("no_open_outcome_unknown", "BLOCKED", { kind: "outcome_unknown", reasonCodes: ["OUTCOME_UNKNOWN_OPEN", ...open.slice(0, 16).map((id) => `EXECUTION:${id}`), ...requested,
    ...unrecordedCodes],
    nextAction: { label: "Request a resolution on the outcome_unknown card; a second person approves it, then it is recorded (self-reported)" } });
}

/**
 * Review's integrity record: AMC's verifyAgentRun over each build session, a self-check under this workspace's keys. A
 * session with no head event to bind a report to was not verified: NOT_EVALUATED, never a digest made up for it.
 */
function integrityItem(review: Record<string, unknown>): A4ReadinessItem[] {
  const sessions = Array.isArray(review.sessions) ? review.sessions as Array<{ integrity?: { integrityOk?: unknown; anchored?: unknown; report?: unknown;
    notEvaluated?: unknown }; stub?: unknown }> : [];
  if (sessions.length === 0) return [];
  const unverified = sessions.flatMap((session) => typeof session.integrity?.notEvaluated === "string" ? [session.integrity.notEvaluated] : []);
  if (unverified.length > 0) {
    return [item("build_sessions_integrity", "NOT_EVALUATED", { section: "integrity", kind: "not_evaluated", reasonCodes: [...new Set(unverified)],
      nextAction: { label: "A build session recorded no head event, so verifyAgentRun has nothing to bind to; request changes and build again" } })];
  }
  const ok = sessions.every((session) => session.integrity?.integrityOk === true);
  const anchored = sessions.every((session) => session.integrity?.anchored === true);
  const stub = sessions.some((session) => session.stub === true);
  return [item("build_sessions_integrity", ok ? "READY" : "BLOCKED", { section: "integrity", report: (sessions[0]?.integrity?.report ?? null) as A4ReadinessItem["report"],
    reasonCodes: [`VERIFICATION:${anchored ? "externally-anchored" : "workspace-key-consistency"}`, ...(anchored ? [] : ["SELF_CHECK", "UNANCHORED"]),
      ...(ok ? [] : ["RUN_INTEGRITY_FAILED"]), ...(stub ? ["STUB_PROVIDER", "AGENT_BEHAVIOUR_NOT_EVALUATED"] : [])],
    nextAction: stub ? { label: STUB_WORDING } : null })];
}

/**
 * Build and Review's items: mandatory once the step that produces them is due, named by that step before. A build or
 * review record counts only on the plan it was made for (`proposed`): an answer change carries the spec forward, and its
 * old records read as not produced. The Enforce manifest is applied by the completion effect (a4.assemble.apply): until
 * then the built changes are pending, which is READY to complete; it is BLOCKED once the reviewed resources drifted or
 * Enforce refuses them.
 */
function buildItems(state: A4ReadinessState, query: A4ReadinessQuery, spec: Record<string, unknown>, revisionNo: number | null, native: boolean,
  proposed: boolean): A4ReadinessItem[] {
  const due = reached(state, "direction_approved");
  const reviewedDue = reached(state, "built");
  const build = (proposed ? spec.build ?? null : null) as { preset?: { sha256?: unknown } | null; validation?: { configSha256?: unknown } | null } | null;
  const review = (proposed ? spec.review ?? null : null) as Record<string, unknown> | null;
  const checkIds = listValue((spec.validationPlan as { checkIds?: unknown } | undefined)?.checkIds);
  const items: A4ReadinessItem[] = [];
  if (native) {
    items.push(build === null ? waiting("preset_signed", ["PRODUCED_AT_BUILD"], { mandatory: due })
      : typeof build.preset?.sha256 === "string" ? item("preset_signed", "READY") : item("preset_signed", "BLOCKED", { reasonCodes: ["PRESET_NOT_WRITTEN"] }));
  }
  items.push(checkIds.length === 0 ? item("validation_pinned", "READY", { reasonCodes: ["NO_CHECKS_SELECTED"], mandatory: false })
    : build === null ? waiting("validation_pinned", ["PRODUCED_AT_BUILD"], { mandatory: due })
      : typeof build.validation?.configSha256 === "string" && build.validation.configSha256 === (spec.validationPlan as { configSha256?: unknown }).configSha256
        ? item("validation_pinned", "READY") : item("validation_pinned", "BLOCKED", { kind: "evidence_untrusted", reasonCodes: ["VALIDATION_NOT_PINNED"] }));
  if (review === null) {
    items.push(waiting("manifest_active", ["PRODUCED_AT_REVIEW"], { mandatory: reviewedDue }));
    return items;
  }
  const enforce = (review.enforce ?? {}) as { state?: unknown; decision?: unknown; pending?: unknown };
  // Only this cycle's completion gate counts: a TUNE or REOPEN leaves the earlier cycle's effect rows on the chain.
  const completionGateId = [...state.chain].reverse().find((link) => link.kind === "GATE_REQUESTED" && link.body.stage === "assemble"
    && link.body.gate === "completion" && link.revisionNo === revisionNo)?.body.gateId;
  const onGate = (effectId: unknown): boolean => completionGateId !== undefined && state.chain.some((link) => link.kind === "EFFECT_STARTED"
    && link.body.effectId === effectId && link.body.gateId === completionGateId);
  const applied = state.chain.some((link) => link.kind === "EFFECT_FINISHED" && link.body.effect === APPLY_EFFECT_ID && onGate(link.body.effectId));
  items.push(revisionNo === state.project.revision_no && query.live.driftedSlots?.includes("enforce.resourcesSha256") === true
    ? item("manifest_active", "BLOCKED", { kind: "scope_changed", reasonCodes: ["MANIFEST_DRIFTED", "RESOURCE_DRIFTED"],
      nextAction: { label: "The agent's resources changed since Review; review again (request changes on the completion gate)" } })
    : enforce.state === "BLOCKED" || enforce.decision === "block"
      ? item("manifest_active", "BLOCKED", { kind: "evidence_untrusted", reasonCodes: ["ENFORCE_BLOCKED", `ENFORCE_STATE:${String(enforce.state)}`] })
      : item("manifest_active", "READY", { reasonCodes: applied ? ["APPLIED"] : ["APPLIED_AT_COMPLETION", `PENDING_CHANGES:${Number(enforce.pending) || 0}`] }));
  items.push(...integrityItem(review));
  // The completion effect's engine request opened on this cycle's completion gate: the card decides it bound to this digest.
  const opened = completionGateId === undefined ? undefined : [...state.chain].reverse().find((link) => link.kind === "EFFECT_GATE_OPENED"
    && link.body.effect === APPLY_EFFECT_ID && link.body.gateId === completionGateId);
  const requestStatus = opened === undefined ? null : query.live.engineRequests?.[String(opened.body.approvalRequestId)] ?? "UNREAD";
  items.push(opened === undefined || typeof opened.body.requestDigestSha256 !== "string"
    ? item("effect_gate", "WAITING", { kind: "review_pending", mandatory: false, reasonCodes: ["EFFECT_GATE_NOT_OPEN"],
      nextAction: { label: "Once the completion gate has its quorum, an owner opens the effect gate (a4.assemble.apply); a second, separately decided request" } })
    : item("effect_gate", "READY", { section: "governance", mandatory: false,
      reasonCodes: ["EFFECT_GATE_OPENED", `APPROVAL_REQUEST:${String(opened.body.approvalRequestId)}:${opened.body.requestDigestSha256}`, `GATE:${String(opened.body.gateId)}`,
        `APPROVAL_STATUS:${requestStatus}`] }));
  // Design §10.2 binds every build session's compositionDigest and policyDigest: no recomputer can read them per session
  // yet (the native task view exposes neither), so the two slots stay unbound and the gap is listed, never hidden. Each
  // session's effective-policy receipts are bound through the reviewed spec instead.
  items.push(item("composition_bound", "NOT_EVALUATED", { kind: "not_evaluated", mandatory: false,
    reasonCodes: ["COMPOSITION_SLOTS_UNBOUND", `KEY:${COMPOSITION_SEAM_KEY}`],
    nextAction: { label: "composition.compositionDigest and composition.policyDigest are not recomputed; the reviewed effective-policy receipts are bound through the review" } }));
  // The stage Review read from lifecycle/state.json (not_evaluated when absent or unreadable), never a literal.
  const lifecycle = (review.lifecycle ?? {}) as { stage?: unknown; reason?: unknown; unitTestsPassing?: unknown };
  const stage = typeof lifecycle.stage === "string" ? lifecycle.stage : "not_evaluated";
  items.push(item("lifecycle_bridge", "NOT_EVALUATED", { kind: "not_evaluated", mandatory: false,
    reasonCodes: [`LIFECYCLE_STAGE:${stage}`, ...(typeof lifecycle.reason === "string" ? [lifecycle.reason] : []),
      `UNIT_TESTS_PASSING:${typeof lifecycle.unitTestsPassing === "string" ? lifecycle.unitTestsPassing : "not_evaluated"}`, `KEY:${LIFECYCLE_SEAM_KEY}`],
    nextAction: { label: `Lifecycle stage ${stage}, as Review read it. Assemble's development → testing bridge is not built (${LIFECYCLE_SEAM_KEY}): nothing in A4 advances it yet` } }));
  return items;
}

/** Assemble's readiness items (design §10.2); `sod` and the two gates are the governance items every stage carries. */
export function assembleItems(state: A4ReadinessState, query: A4ReadinessQuery): A4ReadinessItem[] {
  const { spec, answers, revisionNo } = assembleSpecOf(state);
  const values = answerValues(answers);
  const gaps = answerGaps(answers, carriedValues(state));
  const proposed = proposedFor(spec, answers);
  const tools = textValue(values.get("autonomy")) === "act_with_approval";
  const claim = integrationClaimFor(textValue(values.get("path")));
  const facts = ((spec.understanding as { facts?: unknown } | undefined)?.facts ?? null) as {
    toolset?: { ready?: unknown; blockers?: unknown }; native?: { scope?: { ready?: unknown; message?: unknown } } | null } | null;
  const unsupported = proposed && Array.isArray(spec.unsupported) ? spec.unsupported as Array<{ id?: unknown; key?: unknown }> : [];
  const blockers = listValue(facts?.toolset?.blockers);
  const workflow = workflowPlanOf(values.get("workflow"), values.get("autonomy"));
  return [
    gaps.missing.length + gaps.stale.length + gaps.invalid.length + gaps.carried.length === 0 ? item("ask_complete", "READY", { section: "recommendation" })
      : waiting("ask_complete", [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`),
        ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`), ...gaps.carried], { section: "recommendation",
        nextAction: { label: gaps.carried.length > 0 ? "Run Understand to carry the Aspire answers again"
          : workflow !== null && "error" in workflow ? `The workflow was refused: ${workflow.error.slice(0, 300)}` : "Answer or confirm the listed questions" } }),
    !reached(state, "understood") ? waiting("understanding_confirmed", ["UNDERSTANDING_NOT_CONFIRMED"], { section: "recommendation" })
      : state.project.stage === "assemble" && !understandingCurrent(spec, answers)
        ? waiting("understanding_confirmed", ["UNDERSTANDING_STALE"], { section: "recommendation", nextAction: { label: "Answers changed: run Understand again, then confirm it" } })
        : item("understanding_confirmed", "READY", { section: "recommendation" }),
    proposed ? item("plan_proposed", "READY", { section: "recommendation" })
      : waiting("plan_proposed", [spec.schema === ASSEMBLE_SPEC_SCHEMA ? "PLAN_STALE" : "NOT_PROPOSED"], { section: "recommendation", nextAction: { label: "Propose the plan" } }),
    proposed ? baselineItem(state, spec) : waiting("baseline_manifest", ["PRODUCED_AT_PROPOSE"]),
    claim === null ? waiting("path_supported", ["ANSWER_MISSING:path"], { section: "recommendation" })
      : claim.supported === "supported" ? item("path_supported", "READY", { section: "recommendation", reasonCodes: [`BOUNDARY:${claim.enforcementBoundary}`] })
        : waiting("path_supported", ["UNSUPPORTED_INTEGRATION", `PATH:${claim.path}`, `STATUS:${claim.supported}`, `KEY:${claim.reason ?? "none"}`],
          { kind: "unsupported_integration", section: "recommendation",
            nextAction: { label: `${claim.path} is ${claim.supported} (${claim.reason ?? "no reason recorded"}): an owner records it out of scope with a reason (Acknowledge), or choose another path` } }),
    !proposed ? waiting("unsupported_acknowledged", ["PRODUCED_AT_PROPOSE"])
      : unsupported.length === 0 ? item("unsupported_acknowledged", "READY")
        : waiting("unsupported_acknowledged", ["UNSUPPORTED_INTEGRATION", ...unsupported.slice(0, 16).map((entry) => `UNSUPPORTED:${String(entry.id)}:${String(entry.key)}`)],
          { kind: "unsupported_integration", nextAction: { label: "Each unsupported item stays listed: an owner records them out of scope with a reason (Acknowledge)" } }),
    !tools ? item("toolset_ready", "READY", { reasonCodes: ["NO_TOOLS_REQUESTED"], mandatory: false })
      : facts?.toolset === undefined ? waiting("toolset_ready", ["PRODUCED_AT_UNDERSTAND"])
        : facts.toolset.ready === true ? item("toolset_ready", "READY")
          : waiting("toolset_ready", ["TOOLSET_NOT_READY", `BLOCKERS:${blockers.length}`], { nextAction: blockers[0] === undefined ? null : { label: blockers[0] } }),
    !tools ? item("signed_configs_trusted", "READY", { reasonCodes: ["NO_TOOLS_REQUESTED"], mandatory: false })
      : facts?.native?.scope === undefined ? waiting("signed_configs_trusted", ["PRODUCED_AT_UNDERSTAND"])
        : facts.native.scope.ready === true ? item("signed_configs_trusted", "READY")
          : item("signed_configs_trusted", "BLOCKED", { kind: "evidence_untrusted", reasonCodes: ["CONFIG_UNTRUSTED"],
            nextAction: typeof facts.native.scope.message === "string" ? { label: facts.native.scope.message.slice(0, 300) } : null }),
    lockoutItem(state, query),
    ...buildItems(state, query, spec, revisionNo, claim?.path === "native", proposed)
  ];
}
