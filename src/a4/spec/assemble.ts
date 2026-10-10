/**
 * Assemble's question bank, spec helpers and readiness items (P1-60 slice A; design §9.2, §10.2). Understand carries the
 * Aspire answers Assemble depends on (`riskTier`, `stations`) as `carried` answers; a carried answer that no longer
 * equals Aspire's re-asks every question that depends on it. The item builders are pure: they read the newest Assemble
 * revision, the chain and the live facts, never a file, and nothing here computes a maturity level. The producers live in
 * src/a4/stages/assemble.ts (Understand, Explain, Propose, the apply effect) and src/a4/assembleBuild.ts (Build, Review).
 */
import { A4_STEPS } from "../../contracts/v1/a4Project.js";
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
    "list", false, ["autonomy"])
];

export const ASSEMBLE_SPEC_SCHEMA = "amc.a4-assemble-spec/v1";
/** The existing native-task strings (src/console/assets/nativeTasksView.js:94). */
export const ASSEMBLE_CLAIM_BOUNDARY = "Admission is not task completion; a recorded vote does not mean the action has run";
/** What a stub-provider build session says about the agent (design §10.1, §10.2): the completion gate binds it through the review spec. */
export const STUB_WORDING = "tool pipeline observed on a stub model; agent behaviour not evaluated";
export const APPLY_EFFECT_ID = "a4.assemble.apply";
/** The EVIDENCE_REF purpose of an outcome_unknown resolution request (src/a4/assembleResolve.ts). */
export const RESOLUTION_PURPOSE = "outcome_unknown_resolution";
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
 * Required questions with no answer, answered ones whose dependencies changed since, answers that are not one of their
 * question's values, and carried answers that are missing or no longer Aspire's (fail closed: re-carry at Understand).
 */
export function answerGaps(answers: readonly A4Answer[], carried: ReadonlyMap<string, unknown>): { missing: string[]; stale: string[]; invalid: string[]; carried: string[] } {
  const values = answerValues(answers);
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const missing = QUESTIONS.filter((entry) => entry.required && listValue(values.get(entry.id)).length === 0).map((entry) => entry.id);
  const stale = QUESTIONS.filter((entry) => byId.has(entry.id) && entry.dependsOn.length > 0
    && byId.get(entry.id)!.dependencyDigest !== dependencyDigest(entry.dependsOn, values)).map((entry) => entry.id);
  const choice = (id: string, allowed: readonly string[]): boolean => textValue(values.get(id)) !== null && !allowed.includes(textValue(values.get(id))!);
  const invalid = [
    ...(choice("autonomy", AUTONOMY) ? ["autonomy"] : []),
    ...(choice("path", INTEGRATION_PATHS) ? ["path"] : []),
    ...(textValue(values.get("providers")) !== null && parseProvider(values.get("providers")) === null ? ["providers"] : []),
    // Validation runs as public checks in the session, which needs the signed workspace tools.
    ...(listValue(values.get("validation")).length > 0 && textValue(values.get("autonomy")) !== "act_with_approval" ? ["validation"] : [])
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
 * request>:<request digest>`, the digest an approver binds to from the card).
 */
function lockoutItem(state: A4ReadinessState, query: A4ReadinessQuery): A4ReadinessItem {
  const open = query.live.blockingExecutions;
  if (open === null) return item("no_open_outcome_unknown", "NOT_EVALUATED", { kind: "source_unavailable", reasonCodes: ["ACTION_JOURNAL_UNREADABLE"] });
  if (open.length === 0) return item("no_open_outcome_unknown", "READY");
  const requested = open.slice(0, 16).flatMap((id) => {
    const link = [...state.chain].reverse().find((candidate) => candidate.kind === "EVIDENCE_REF" && candidate.body.purpose === RESOLUTION_PURPOSE
      && candidate.body.executionId === id);
    return link === undefined ? [] : [`RESOLUTION_REQUESTED:${id}:${String(link.body.refId)}:${String(link.body.sha256)}`];
  });
  return item("no_open_outcome_unknown", "BLOCKED", { kind: "outcome_unknown", reasonCodes: ["OUTCOME_UNKNOWN_OPEN", ...open.slice(0, 16).map((id) => `EXECUTION:${id}`), ...requested],
    nextAction: { label: "Request a resolution on the outcome_unknown card; a second person approves it, then it is recorded (self-reported)" } });
}

/** Review's integrity record: AMC's verifyAgentRun over each build session, a self-check under this workspace's keys. */
function integrityItem(review: Record<string, unknown>): A4ReadinessItem[] {
  const sessions = Array.isArray(review.sessions) ? review.sessions as Array<{ integrity?: { integrityOk?: unknown; anchored?: unknown; report?: unknown };
    stub?: unknown }> : [];
  if (sessions.length === 0) return [];
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
  const applied = state.chain.some((link) => link.kind === "EFFECT_FINISHED" && link.body.effect === APPLY_EFFECT_ID);
  items.push(revisionNo === state.project.revision_no && query.live.driftedSlots?.includes("enforce.resourcesSha256") === true
    ? item("manifest_active", "BLOCKED", { kind: "scope_changed", reasonCodes: ["MANIFEST_DRIFTED", "RESOURCE_DRIFTED"],
      nextAction: { label: "The agent's resources changed since Review; review again (request changes on the completion gate)" } })
    : enforce.state === "BLOCKED" || enforce.decision === "block"
      ? item("manifest_active", "BLOCKED", { kind: "evidence_untrusted", reasonCodes: ["ENFORCE_BLOCKED", `ENFORCE_STATE:${String(enforce.state)}`] })
      : item("manifest_active", "READY", { reasonCodes: applied ? ["APPLIED"] : ["APPLIED_AT_COMPLETION", `PENDING_CHANGES:${Number(enforce.pending) || 0}`] }));
  items.push(...integrityItem(review));
  // The completion effect's engine request, once an owner opened it: the card decides it bound to this digest.
  const opened = [...state.chain].reverse().find((link) => link.kind === "EFFECT_GATE_OPENED" && link.body.effect === APPLY_EFFECT_ID);
  items.push(opened === undefined || typeof opened.body.requestDigestSha256 !== "string"
    ? item("effect_gate", "WAITING", { kind: "review_pending", mandatory: false, reasonCodes: ["EFFECT_GATE_NOT_OPEN"],
      nextAction: { label: "Once the completion gate has its quorum, an owner opens the effect gate (a4.assemble.apply); a second, separately decided request" } })
    : item("effect_gate", "READY", { section: "governance", mandatory: false,
      reasonCodes: ["EFFECT_GATE_OPENED", `APPROVAL_REQUEST:${String(opened.body.approvalRequestId)}:${opened.body.requestDigestSha256}`, `GATE:${String(opened.body.gateId)}`] }));
  const lifecycle = (review.lifecycle ?? {}) as { unitTestsPassing?: unknown };
  items.push(item("lifecycle_bridge", "NOT_EVALUATED", { kind: "not_evaluated", mandatory: false,
    reasonCodes: [`UNIT_TESTS_PASSING:${typeof lifecycle.unitTestsPassing === "string" ? lifecycle.unitTestsPassing : "not_evaluated"}`],
    nextAction: { label: "The agent stays at lifecycle stage development: Assemble advances no lifecycle stage (the A4 bridge is Activate's, P1-62)" } }));
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
  return [
    gaps.missing.length + gaps.stale.length + gaps.invalid.length + gaps.carried.length === 0 ? item("ask_complete", "READY", { section: "recommendation" })
      : waiting("ask_complete", [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`),
        ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`), ...gaps.carried], { section: "recommendation",
        nextAction: { label: gaps.carried.length > 0 ? "Run Understand to carry the Aspire answers again" : "Answer or confirm the listed questions" } }),
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
