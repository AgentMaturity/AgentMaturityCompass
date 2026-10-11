/**
 * Adapt's question bank, spec helpers and readiness items (P1-61 slice A, the plan; design §9.2, §10.3, §7 items 9–10).
 * Understand carries Aspire's `markets` and `stations` as `carried` answers; a carried answer that no longer equals
 * Aspire's re-asks every question that depends on it, and the last compile's missing facts name the questions that
 * resolve them. The nine compiler facts are asked here; an empty or "unknown" answer stays unknown (null), never guessed.
 * The item builders are pure: they read the newest Adapt revision, the chain and the live facts, never a file, and
 * nothing here computes a maturity level. The producers live in src/a4/stages/adapt.ts; the plan work in adaptPolicy.ts.
 */
import type { CompiledPlan, PlanDiff } from "../../catalog/compiler/types.js";
import { digestOf } from "../../catalog/digest.js";
import { A4_STEPS } from "../../contracts/v1/a4Project.js";
import { STATIONS } from "../../domains/stations.js";
import {
  gateStatus, isRegulated, latestGate, LIFECYCLE_BRIDGE, pendingReviews, type A4ReadinessItem, type A4ReadinessQuery, type A4ReadinessState
} from "../a4Readiness.js";
import type { A4Producer } from "../a4RouterStages.js";
import { a4AnswerSchema, flatSlots, gatePolicyOf, type A4Answer, type A4Question, type A4Step } from "../a4Schema.js";
import { LIFECYCLE_SEAM_KEY } from "./assemble.js";
import { answersDigestOf, answerValues, aspireSpecOf, dependencyDigest, listValue, textValue, understandingCurrent } from "./aspire.js";

const question = (id: string, prompt: string, kind: A4Question["kind"], required: boolean, dependsOn: string[] = []): A4Question =>
  ({ id, stage: "adapt", prompt, dependsOn, required, kind });

/** Aspire answers Adapt carries (Understand records them `source: "carried"`); they are changed only at Aspire. */
export const CARRIED = ["markets", "stations"] as const;
/** The compiler's closed fact set (src/catalog/compiler/types.ts) and whether each takes a list or one term. */
export const FACTS = {
  stations: "list", primaryStation: "single", domains: "list", jurisdictions: "list", roles: "list", entityTypes: "list", riskClass: "single",
  useCases: "list", dataClasses: "list"
} as const;
export type AdaptFact = keyof typeof FACTS;

/** The Adapt question bank (design §10.3 Ask). Personal context waits for a blob-backed answer route (the answers route stores text inline). */
export const QUESTIONS: A4Question[] = [
  question("markets", "Markets, carried from Aspire (change them there: reopen Aspire).", "fact", false),
  question("stations", "Stations, carried from Aspire (change them there: reopen Aspire).", "fact", false),
  question("audiences", "Who will use the agent or be affected by it, by type? One audience per line.", "list", true),
  question("workflows", "Which workflows will it take part in? One per line.", "list", false),
  question("preferences", "Preferences for tone, format or behaviour, in your words.", "text", false),
  question("languages", "Which languages must it work in? One per line.", "list", true),
  question("accessibility", "Which accessibility needs must it meet? One per line; leave empty when none are stated.", "list", false),
  question("jurisdictions", "Jurisdictions it operates in, as catalog terms (for example US). One per line; leave empty to use the markets carried from Aspire, or write unknown.",
    "fact", false, ["markets"]),
  question("primaryStation", "Primary station: one of the carried stations. Leave empty when unknown.", "fact", false, ["stations"]),
  question("domains", "Sector domains, as catalog terms. One per line; leave empty when unknown.", "fact", false, ["stations"]),
  question("roles", "Your role under the regulations (provider, deployer, distributor or vendor). One per line; leave empty when unknown.", "fact", false, ["jurisdictions"]),
  question("entityTypes", "Entity types, as catalog terms (for example hipaa_covered_entity). One per line; leave empty when unknown.", "fact", false,
    ["jurisdictions", "stations"]),
  question("riskClass", "Risk class under the regulations that apply, as one catalog term. Leave empty when unknown.", "fact", false, ["jurisdictions"]),
  question("useCases", "Activities (use cases), as catalog terms. One per line; leave empty when unknown.", "fact", false, ["stations"]),
  question("excludedUses", "Uses it must never be put to. One per line.", "list", false),
  question("dataClasses", "Data classes it handles, as catalog terms. One per line; leave empty when unknown.", "fact", false),
  question("dataResidency", "Where must the data stay (residency)? In your words.", "text", false),
  question("dataRetention", "How long is data kept (retention)? In your words.", "text", false),
  question("processors", "Third parties that process the data. One per line.", "list", false),
  question("deploymentNeeds", "Deployment needs (environments, availability, integrations), in your words.", "text", false)
];

export const ADAPT_SPEC_SCHEMA = "amc.a4-adapt-spec/v1";
export const ADAPT_CLAIM_BOUNDARY = "Applicability is compiled from declared facts and an experimental catalog; an expert has not reviewed it.";
/** catalog/README.md lines 8-10, verbatim (D-08). Adapt never composes an "experimental" sentence of its own. */
export const CATALOG_EXPERIMENTAL_NOTICE = "Every record here is `experimental`: it was drafted by an agent, its citations are not yet fetched, hashed or legally reviewed, and no named expert has approved it.";
export const ACTIVATE_PLAN_EFFECT_ID = "a4.adapt.activate_plan";
/** The native task lease (P1-67): a Studio workspace-tools task started after activation runs under one; nothing else gets one. */
export const NATIVE_LEASE_KEY = "P1-67";

const load = () => import("../stages/adapt.js");
/** Adapt's producers; the router records their outputs instead of the no-producer path (src/a4/a4RouterStages.ts). */
export const PRODUCERS: readonly A4Producer[] = (["understand", "explain", "propose", "build", "review"] as const)
  .map((step) => ({ id: `adapt.${step}`, step, run: async (ctx) => (await load()).produceAdapt(step, ctx) }));

/** The newest Adapt revision's spec and answers. */
export function adaptSpecOf(state: Pick<A4ReadinessState, "revisions">): { spec: Record<string, unknown>; answers: A4Answer[]; revisionNo: number | null } {
  const revision = state.revisions.filter((row) => row.stage === "adapt").at(-1);
  const spec = revision ? JSON.parse(revision.spec_json) as Record<string, unknown> : {};
  const answers = Array.isArray(spec.answers) ? spec.answers.flatMap((answer) => {
    const parsed = a4AnswerSchema.safeParse(answer);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  return { spec, answers, revisionNo: revision?.revision_no ?? null };
}

/** The Aspire answers Adapt carries, as the newest Aspire revision records them (absent ones are left out). */
export function carriedValues(state: Pick<A4ReadinessState, "revisions">): Map<string, unknown> {
  const values = answerValues(aspireSpecOf(state).answers);
  return new Map(CARRIED.filter((id) => values.has(id)).map((id) => [id, values.get(id)]));
}

const TERM = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const MAX_TERMS = 64;
const unknown = (entry: string): boolean => entry.toLowerCase() === "unknown";
/** A list fact: its distinct terms, or null (unknown) when empty or "unknown". */
export function factList(value: unknown): string[] | null {
  const entries = listValue(value).filter((entry) => !unknown(entry));
  return entries.length === 0 ? null : [...new Set(entries)];
}
/** A one-term fact, or null (unknown). */
export function factTerm(value: unknown): string | null {
  const text = textValue(value);
  return text === null || unknown(text) ? null : text;
}
/** A fact's answer by question id; `jurisdictions` falls back to the carried markets (the same member's assertion at Aspire). */
export function factAnswer(answers: readonly A4Answer[], fact: AdaptFact): A4Answer | undefined {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  // An explicit "unknown" is an answer; only an empty one falls back.
  if (fact === "jurisdictions" && listValue(byId.get("jurisdictions")?.value).length === 0) return byId.get("markets");
  return byId.get(fact);
}

/**
 * Required questions with no answer, answered ones whose dependencies changed since, answers that are not one of their
 * question's values (a fact is catalog terms; the primary station one of the carried stations), and carried answers that
 * are missing or no longer Aspire's (fail closed: re-carry at Understand).
 */
export function answerGaps(answers: readonly A4Answer[], carried: ReadonlyMap<string, unknown>): { missing: string[]; stale: string[]; invalid: string[]; carried: string[] } {
  const values = answerValues(answers);
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const missing = QUESTIONS.filter((entry) => entry.required && listValue(values.get(entry.id)).length === 0).map((entry) => entry.id);
  const stale = QUESTIONS.filter((entry) => byId.has(entry.id) && entry.dependsOn.length > 0
    && byId.get(entry.id)!.dependencyDigest !== dependencyDigest(entry.dependsOn, values)).map((entry) => entry.id);
  const invalid = (Object.keys(FACTS) as AdaptFact[]).filter((fact) => {
    const value = factAnswer(answers, fact)?.value;
    const terms = FACTS[fact] === "list" ? factList(value) ?? [] : [factTerm(value)].filter((term): term is string => term !== null);
    if (terms.length > MAX_TERMS || terms.some((term) => !TERM.test(term))) return true;
    if (fact === "stations") return terms.some((term) => !(STATIONS as readonly string[]).includes(term));
    return fact === "primaryStation" && terms.length > 0 && !(factList(values.get("stations")) ?? []).includes(terms[0]!);
  });
  const carriedGaps = CARRIED.flatMap((id) => !carried.has(id) ? [] : !byId.has(id) ? [`CARRIED_MISSING:${id}`]
    : JSON.stringify(values.get(id) ?? null) !== JSON.stringify(carried.get(id) ?? null) ? [`CARRIED_STALE:${id}`] : []);
  return { missing, stale, invalid, carried: carriedGaps };
}

/** Whether `spec` is the proposal Propose built for exactly these answers. */
export const proposedFor = (spec: Record<string, unknown>, answers: readonly A4Answer[]): boolean =>
  spec.schema === ADAPT_SPEC_SCHEMA && spec.answersDigest === answersDigestOf(answers);

/** What Understand recorded for these answers: the compiled plan, or the compile refusal's code. */
export interface AdaptUnderstanding {
  readonly answersDigest: string;
  readonly facts: {
    readonly plan: CompiledPlan | null;
    readonly compileError: { code: string; message: string } | null;
    readonly followUps: readonly string[];
    readonly configs: Readonly<Record<string, { state: string; reason: string | null }>> | null;
    readonly clocks: ReadonlyArray<{ clockId: string; status: string; jurisdictionDeclared: string }>;
  } & Record<string, unknown>;
}
export const understandingOf = (spec: Record<string, unknown>): AdaptUnderstanding | null =>
  (spec.understanding ?? null) as AdaptUnderstanding | null;
/** The proposal's plan (Propose freezes Understand's), or null. */
export const proposedPlan = (spec: Record<string, unknown>): CompiledPlan | null => (spec.plan ?? null) as CompiledPlan | null;
/** The plan for these answers: the proposal's when it was made for them, else Understand's when that is current; null otherwise. */
export function currentPlan(spec: Record<string, unknown>, answers: readonly A4Answer[]): CompiledPlan | null {
  if (proposedFor(spec, answers)) return proposedPlan(spec);
  return understandingCurrent(spec, answers) ? understandingOf(spec)?.facts.plan ?? null : null;
}
/** Build's record of the signed plan. */
export interface AdaptBuild { readonly planDigest: string; readonly signature: unknown; readonly compiledAt: string; readonly previousPlanDigest: string | null;
  readonly diff: PlanDiff | null }
export const buildOf = (spec: Record<string, unknown>): AdaptBuild | null => {
  const build = (spec.build ?? null) as AdaptBuild | null;
  return build !== null && build.planDigest === proposedPlan(spec)?.digest ? build : null;
};

type Fields = Partial<Omit<A4ReadinessItem, "id" | "status">>;
const item = (id: string, status: A4ReadinessItem["status"], fields: Fields = {}): A4ReadinessItem => ({
  id, status, kind: null, reasonCodes: [], section: "recommendation", evidence: [], claim: null, report: null, acknowledged: null,
  nextAction: null, mandatory: true, bound: false, ...fields
} as A4ReadinessItem);
const waiting = (id: string, codes: string[], fields: Fields = {}): A4ReadinessItem => item(id, "WAITING", { kind: "evidence_missing", reasonCodes: codes, ...fields });

/** Whether the project has reached `step` at Adapt (any later stage counts; an earlier one has not). */
function reached(state: A4ReadinessState, step: A4Step): boolean {
  if (state.project.stage !== "adapt") return state.project.stage === "activate";
  return A4_STEPS.indexOf(state.project.step) >= A4_STEPS.indexOf(step);
}

/** The unexpired owner acknowledgement of `itemId` on the head revision, as the evaluator reads it; null when none. */
export function acknowledgementOf(state: A4ReadinessState, itemId: string, now: number): { by: string; ts: number; reason: string; expiresTs: number } | null {
  const link = [...state.chain].reverse().find((candidate) => candidate.kind === "ACKNOWLEDGED" && candidate.body.itemId === itemId
    && candidate.revisionNo === state.project.revision_no);
  const { actorKey, ts, reason, expiresTs } = link?.body ?? {};
  return typeof actorKey === "string" && typeof ts === "number" && typeof reason === "string" && typeof expiresTs === "number" && expiresTs > now
    ? { by: actorKey, ts, reason, expiresTs } : null;
}

/**
 * The owner-settled requirements (design §10.3 Exceptions): each mandatory requirement the plan leaves unresolved, under
 * the owner's live acknowledgement of `plan_unresolved`. They stay `unresolved` in the plan and in every count; P2-24
 * owns a true exception.
 */
export function ownerOutOfScope(state: A4ReadinessState, plan: CompiledPlan | null, now: number): Array<{ controlId: string; by: string; ts: number; reason: string }> {
  const ack = acknowledgementOf(state, "plan_unresolved", now);
  if (ack === null || plan === null) return [];
  return plan.requirements.filter((row) => row.mandatory && row.applicability === "unresolved").map((row) => ({ controlId: row.controlId, by: ack.by, ts: ack.ts, reason: ack.reason }));
}

/** One lifecycle-bridge row (design §7 item 9): the control, whether A4 evidence satisfies it, the ref and why. */
export interface BridgeRow { readonly target: "staging"; readonly controlId: string; readonly status: "satisfied" | "not_evaluated";
  readonly evidenceRef: string | null; readonly claimKind: string | null; readonly reason: string; readonly satisfiedBy: string }

/**
 * Adapt's rows of the lifecycle bridge (testing → staging), the only source of `controlsSatisfied` for that advance; P1-62's
 * wrapper reads them and the release record keeps each row's ref, claim kind and reason. `integration_tests_passing`
 * needs every Assemble build session on a non-stub provider with each pinned check passed and none failed, and the
 * executed_test ref Review recorded; `security_review_signed` a `review_record` entry of the Adapt completion rule met by
 * an admitted external record (a role vote is an acknowledgement, never a review); `deployment_plan_approved` the
 * consumed Activate direction gate.
 */
export function stagingBridge(state: A4ReadinessState): BridgeRow[] {
  const row = (controlId: string, evidenceRef: string | null, claimKind: string | null, reason: string): BridgeRow => ({ target: "staging", controlId,
    status: evidenceRef === null ? "not_evaluated" : "satisfied", evidenceRef, claimKind, reason,
    satisfiedBy: LIFECYCLE_BRIDGE.find((entry) => entry.controlId === controlId)?.satisfiedBy ?? "" });
  const assemble = state.revisions.filter((revision) => revision.stage === "assemble").at(-1);
  const sessions = assemble === undefined ? [] : ((JSON.parse(assemble.spec_json) as { review?: { sessions?: unknown } }).review?.sessions ?? []) as
    Array<{ stub?: unknown; validation?: { allPassed?: unknown; failed?: unknown } }>;
  const executed = Array.isArray(sessions) ? sessions : [];
  const passing = executed.length > 0 && executed.every((session) => session.stub === false && session.validation?.allPassed === true && session.validation.failed === 0);
  const test = passing ? state.refs.find((ref) => ref.revisionNo === assemble!.revision_no && ref.method === "executed_test" && ref.status === "resolved") : undefined;
  const rule = gatePolicyOf(state.chain).gates["adapt.completion"];
  const completion = latestGate(state, "adapt", "completion");
  const record = rule.requiredReviews.some((entry) => entry.kind === "review_record") && completion !== null
    ? state.refs.find((ref) => ref.revisionNo === completion.revision_no && ref.lane === "verified") : undefined;
  const direction = latestGate(state, "activate", "direction");
  const released = direction !== null && state.chain.some((link) => link.kind === "GATE_CONSUMED" && link.body.gateId === direction.gate_id);
  return [
    row("integration_tests_passing", test === undefined ? null : `${test.refKind}:${test.refId}`, test?.claimKind ?? null,
      test !== undefined ? "executed checks passed on a non-stub provider" : executed.some((session) => session.stub !== false) ? "stub provider"
        : executed.length === 0 ? "no executed test" : passing ? "no executed_test ref resolves" : "checks failed or pending"),
    row("security_review_signed", record === undefined ? null : `${record.refKind}:${record.refId}`, record?.claimKind ?? null,
      record !== undefined ? "admitted external review record" : "REVIEW_NOT_INDEPENDENT: no review_record entry is met by an admitted external record"),
    row("deployment_plan_approved", released ? `gate:${direction!.gate_id}` : null, released ? "self_reported" : null,
      released ? "Activate direction gate consumed" : "the Activate direction gate (release approval) is not consumed")
  ];
}

/** The plan items (design §10.3 Readiness): compile, facts, conflicts, the owner-settled unresolved set and the catalog lock. */
function planItems(state: A4ReadinessState, query: A4ReadinessQuery, spec: Record<string, unknown>, answers: readonly A4Answer[], regulated: boolean): A4ReadinessItem[] {
  const plan = currentPlan(spec, answers);
  if (plan === null) {
    const error = understandingCurrent(spec, answers) ? understandingOf(spec)?.facts.compileError ?? null : null;
    return [error === null ? waiting("plan_compiled", ["PRODUCED_AT_UNDERSTAND"], { nextAction: { label: "Run Understand to compile the plan" } })
      : item("plan_compiled", "BLOCKED", { kind: "evidence_missing", reasonCodes: ["PLAN_MISSING", `COMPILE_ERROR:${error.code}`],
        nextAction: { label: `The plan did not compile (${error.message.slice(0, 300)}); change the answers and run Understand again` } })];
  }
  const unresolved = plan.requirements.filter((row) => row.applicability === "unresolved");
  const missingFacts = [...new Set(plan.requirements.flatMap((row) => row.missingFacts))].sort();
  const mandatory = unresolved.filter((row) => row.mandatory);
  const conflicts = plan.conflicts.filter((conflict) => conflict.resolution === "unresolved");
  const settled = ownerOutOfScope(state, plan, query.now);
  const revision = state.revisions.find((row) => row.revision_no === state.project.revision_no);
  const boundLock = revision === undefined ? null : flatSlots(JSON.parse(revision.resource_digests_json))["plan.lockDigest"] ?? null;
  const lockMoved = query.live.driftedSlots?.includes("plan.lockDigest") === true || (boundLock !== null && boundLock !== digestOf(plan.lock));
  return [
    item("plan_compiled", "READY", { reasonCodes: [`PLAN_STATUS:${plan.status}`, `PLAN:${plan.digest.replace(/^sha256:/, "").slice(0, 16)}`,
      `REQUIREMENTS:${plan.requirements.length}`] }),
    missingFacts.length === 0 ? item("plan_no_missing_facts", "READY", { mandatory: false })
      : waiting("plan_no_missing_facts", ["PLAN_MISSING_FACTS", ...missingFacts.map((fact) => `ANSWER_NEEDED:${fact}`)], { mandatory: false,
        nextAction: { label: `Answer ${missingFacts.join(", ")} (or leave them unknown: the requirements they decide stay unresolved)` } }),
    conflicts.length === 0 ? item("plan_conflicts_resolved", "READY")
      : item("plan_conflicts_resolved", "BLOCKED", { kind: "evidence_contradictory", reasonCodes: ["PLAN_BLOCKED", ...conflicts.slice(0, 16).map((conflict) => `CONFLICT:${conflict.parameter}`)] }),
    mandatory.length === 0 ? item("plan_unresolved", "READY", { reasonCodes: unresolved.map((row) => `UNRESOLVED_OPTIONAL:${row.controlId}`) })
      // Never READY while one stays unresolved: an owner's out_of_scope is an acknowledgement (OWNER_ACKNOWLEDGED), not a decision.
      : waiting("plan_unresolved", ["PLAN_MISSING_FACTS", ...mandatory.slice(0, 32).map((row) => `UNRESOLVED:${row.controlId}`),
        ...(settled.length > 0 ? ["OWNER_OUT_OF_SCOPE", "KEY:P2-24"] : [])], { kind: "review_pending",
        nextAction: { label: regulated ? "A regulated project activates only a ready plan: answer the missing facts"
          : "Answer the missing facts, or an owner records the unresolved requirements out of scope with a reason (Acknowledge); they stay unresolved (a true exception is P2-24)" } }),
    lockMoved ? item("plan_lock_drift", "BLOCKED", { kind: "scope_changed", reasonCodes: ["PLAN_LOCK_DRIFT", "RESOURCE_DRIFTED"],
      nextAction: { label: "catalog lock changed: the plan was compiled against another catalog; run Understand again (reopen Adapt once past it)" } })
      : item("plan_lock_drift", "READY")
  ];
}

/**
 * The signing and activation items. Build signs the proposed plan; Review records the conformance statement. A regulated
 * project activates the plan at completion through the effect a4.adapt.activate_plan, so `plan_activated` waits until an
 * owner opens it on this cycle's completion gate (complete then runs it; consumeGate refuses a plain consumption while it
 * is open). A non-regulated project completes with the plan signed and not activated (PLAN_SIGNED_NOT_ACTIVATED); an
 * owner may still open the effect, and the lockout item says what activation does to sessions.
 */
function signingItems(state: A4ReadinessState, spec: Record<string, unknown>, answers: readonly A4Answer[], revisionNo: number | null, regulated: boolean): A4ReadinessItem[] {
  const proposed = proposedFor(spec, answers);
  const build = proposed ? buildOf(spec) : null;
  const review = (proposed && build !== null ? spec.review ?? null : null) as { conformance?: { verified?: unknown; reason?: unknown;
    counts?: Record<string, unknown> } } | null;
  const completionGateId = [...state.chain].reverse().find((link) => link.kind === "GATE_REQUESTED" && link.body.stage === "adapt"
    && link.body.gate === "completion" && link.revisionNo === revisionNo)?.body.gateId;
  const opened = completionGateId === undefined ? undefined : [...state.chain].reverse().find((link) => link.kind === "EFFECT_GATE_OPENED"
    && link.body.effect === ACTIVATE_PLAN_EFFECT_ID && link.body.gateId === completionGateId);
  // Only this cycle's activation counts: a TUNE or REOPEN leaves an earlier cycle's EFFECT_FINISHED on the chain.
  const attempts = new Set(state.chain.filter((link) => link.kind === "EFFECT_STARTED" && link.body.effect === ACTIVATE_PLAN_EFFECT_ID
    && completionGateId !== undefined && link.body.gateId === completionGateId).map((link) => link.body.effectId));
  const finished = state.chain.some((link) => link.kind === "EFFECT_FINISHED" && attempts.has(link.body.effectId));
  const conformance = review?.conformance ?? null;
  const counts = conformance?.counts ?? {};
  const plan = currentPlan(spec, answers);
  // The workspace has one active plan for every agent: activating this one replaces it, and activateControlPlan refuses
  // a plan weaker than it (Adapt never passes allowWeakening), so another profile's active plan is named up front.
  const active = understandingOf(spec)?.facts.activePlan as { planDigest?: unknown } | null | undefined;
  const replaces = typeof active?.planDigest === "string" && active.planDigest !== plan?.digest ? ["REPLACES_ACTIVE_PLAN"] : [];
  const items = [
    build !== null ? item("plan_signed", "READY", { section: "implementation", reasonCodes: ["CONTROL_PLAN_SIGNED", "WORKSPACE_KEYS_ONLY"] })
      : waiting("plan_signed", ["PRODUCED_AT_BUILD"], { section: "implementation", mandatory: reached(state, "direction_approved") }),
    conformance === null ? waiting("conformance_statement", ["PRODUCED_AT_REVIEW"], { mandatory: reached(state, "built") })
      : item("conformance_statement", "READY", { reasonCodes: ["pass", "fail", "not_evaluated", "not_applicable", "unresolved"]
        .map((key) => `${key.toUpperCase()}:${Number(counts[key]) || 0}`) }),
    opened !== undefined && typeof opened.body.requestDigestSha256 === "string"
      ? item("plan_review_quorum", "READY", { section: "governance", mandatory: false, reasonCodes: ["EFFECT_GATE_OPENED",
        `APPROVAL_REQUEST:${String(opened.body.approvalRequestId)}:${opened.body.requestDigestSha256}`, `GATE:${String(opened.body.gateId)}`] })
      : item("plan_review_quorum", "WAITING", { kind: "review_pending", section: "governance", mandatory: false, reasonCodes: ["EFFECT_GATE_NOT_OPEN"],
        nextAction: { label: `Once the completion gate has its quorum, an owner opens ${ACTIVATE_PLAN_EFFECT_ID}: a second, separately decided plan review` } }),
    finished ? item("plan_activated", "READY", { reasonCodes: ["PLAN_ACTIVATED"] })
      : regulated && plan !== null && plan.status !== "ready" ? item("plan_activated", "BLOCKED", { kind: "evidence_missing", reasonCodes: ["PLAN_BLOCKED", `PLAN_STATUS:${plan.status}`],
        nextAction: { label: "A regulated project activates its plan at completion, and only a ready plan activates: resolve every mandatory requirement" } })
      : opened !== undefined ? item("plan_activated", "READY", { reasonCodes: ["ACTIVATED_AT_COMPLETION", ...replaces] })
        : regulated ? waiting("plan_activated", ["PLAN_NOT_ACTIVATED", ...replaces], { kind: "review_pending",
          nextAction: { label: `A regulated project activates its plan at completion: once the completion gate has its quorum, an owner opens ${ACTIVATE_PLAN_EFFECT_ID}` } })
          : item("plan_activated", "READY", { reasonCodes: ["PLAN_SIGNED_NOT_ACTIVATED", ...replaces], nextAction: { label: "Plan signed, not activated (the default for a "
            + `non-regulated project). Activation is an explicit owner effect (${ACTIVATE_PLAN_EFFECT_ID} on the completion gate) and makes the workspace regulated` } })
  ];
  // AMC's own CONTROL_RESULT signature check: integrity of bytes under this workspace's keys, never a lane, never a claim.
  if (conformance !== null) {
    items.push(conformance.verified === true ? item("adapt.control_results_signature", "READY", { section: "integrity", reasonCodes: ["SELF_CHECK", "UNANCHORED"] })
      : item("adapt.control_results_signature", "NOT_EVALUATED", { section: "integrity", kind: "not_evaluated", mandatory: false,
        reasonCodes: ["CONTROL_RESULTS_NOT_VERIFIED_LOCALLY", ...(typeof conformance.reason === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(conformance.reason) ? [conformance.reason] : [])] }));
  }
  return items;
}

/**
 * The lockout (design §7 item 10, C-11): an active plan with L0-IDN-01 denies every native tool call without a verified
 * lease. Since P1-67 a Studio workspace-tools task started or resumed after activation runs under a lease Studio mints,
 * so the item is READY and names who is still denied rather than hiding them.
 */
function lockoutItem(state: A4ReadinessState, regulated: boolean): A4ReadinessItem {
  const revision = state.revisions.find((row) => row.revision_no === state.project.revision_no);
  const head = revision === undefined ? null : flatSlots(JSON.parse(revision.resource_digests_json))["plan.journalEntrySha256"] ?? null;
  const active = head !== null || state.chain.some((link) => link.kind === "EFFECT_FINISHED" && link.body.effect === ACTIVATE_PLAN_EFFECT_ID);
  if (!active && !regulated) return item("adapt.plan.nativeSessionsAllowed", "READY", { section: "governance", mandatory: false, reasonCodes: ["NO_ACTIVE_PLAN"] });
  return item("adapt.plan.nativeSessionsAllowed", "READY", { section: "governance", mandatory: false, kind: "plan_denies_native_session",
    reasonCodes: [active ? "PLAN_ACTIVE" : "PLAN_ACTIVATED_AT_COMPLETION", "PLAN_DENIES_NATIVE_SESSION", `NATIVE_TASK_LEASE:${NATIVE_LEASE_KEY}`,
      "PRE_ACTIVATION_SESSIONS_DENIED", "CLI_AGENT_SESSIONS_DENIED", "DELEGATED_CHILDREN_DENIED"],
    nextAction: { label: "Under an active plan, Studio native tasks with workspace tools started after activation run under a lease (P1-67); "
      + "tasks started before it, CLI agent sessions and delegated children carry none and are denied every call" } });
}

/** Informational items: clocks to classify, the completion rule's required reviews by kind, the sources' status, data handling. */
function contextItems(state: A4ReadinessState, query: A4ReadinessQuery, answers: readonly A4Answer[], understanding: AdaptUnderstanding | null): A4ReadinessItem[] {
  const clocks = understanding?.facts.clocks ?? [];
  const rule = gatePolicyOf(state.chain).gates["adapt.completion"];
  const gate = latestGate(state, "adapt", "completion");
  const status = gate === null ? null : gateStatus(state, gate, query.policy, query.now);
  const pending = new Set((status === null ? rule.requiredReviews : pendingReviews(state, status)).map((entry) => JSON.stringify(entry)));
  const configs = understanding?.facts.configs ?? null;
  const untrusted = configs === null ? [] : Object.entries(configs).filter(([, config]) => config.state === "invalid").map(([name]) => name);
  const values = answerValues(answers);
  return [
    configs === null ? waiting("configs_trusted", ["PRODUCED_AT_UNDERSTAND"], { section: "implementation" })
      : untrusted.length > 0 ? item("configs_trusted", "BLOCKED", { section: "implementation", kind: "evidence_untrusted", reasonCodes: ["CONFIG_UNTRUSTED", ...untrusted.map((name) => `CONFIG:${name}`)] })
        : item("configs_trusted", "READY", { section: "implementation", reasonCodes: Object.entries(configs).filter(([, config]) => config.state === "missing").map(([name]) => `MISSING:${name}`) }),
    clocks.length === 0 ? item("clocks_classified", "READY", { mandatory: false, reasonCodes: ["NO_CLOCK_CANDIDATES"] })
      : waiting("clocks_classified", ["NEEDS_CLASSIFICATION", ...clocks.slice(0, 32).map((clock) => `CLOCK:${clock.clockId}`)], { mandatory: false, kind: "review_pending",
        nextAction: { label: "Each reporting clock listed for these stations is a candidate an operator confirms; AMC decides none (overlay rules: P3-23)" } }),
    rule.requiredReviews.length === 0 ? item("required_entries_satisfied", "READY", { section: "governance", mandatory: false })
      : item("required_entries_satisfied", pending.size === 0 ? "READY" : "WAITING", { section: "governance", mandatory: false, kind: pending.size === 0 ? null : "review_pending",
        reasonCodes: rule.requiredReviews.map((entry) => `ENTRY:${entry.kind}${entry.role === undefined ? "" : `:${entry.role}`}:${pending.has(JSON.stringify(entry)) ? "pending" : "met"}`
          + (entry.kind === "role_vote" ? ":ACKNOWLEDGEMENT_NOT_REVIEW" : "")) }),
    waiting("regulatory_sources_status", ["EXPERT_REVIEW_PENDING", "KEY:D-08"], { kind: "review_pending", mandatory: false,
      nextAction: { label: CATALOG_EXPERIMENTAL_NOTICE } }),
    item("data_handling_declared", "READY", { mandatory: false, reasonCodes: [
      ...(factList(factAnswer(answers, "dataClasses")?.value) === null ? ["DATA_CLASSES_UNKNOWN"] : []),
      ...(["dataResidency", "dataRetention"].filter((id) => textValue(values.get(id)) === null).map((id) => `NOT_DECLARED:${id}`)),
      "ENFORCEMENT:none", "KEY:P2-01", "KEY:P2-02"] }),
    item("lifecycle_bridge", "NOT_EVALUATED", { kind: "not_evaluated", mandatory: false,
      reasonCodes: [...stagingBridge(state).map((row) => `BRIDGE:${row.controlId}:${row.status}`), `KEY:${LIFECYCLE_SEAM_KEY}`],
      nextAction: { label: "testing → staging advances only on the rows above with refs; the A4 lifecycle wrapper (P1-62) advances it, never Adapt" } })
  ];
}

/** Adapt's readiness items (design §10.3); `sod` and the two gates are the governance items every stage carries. */
export function adaptItems(state: A4ReadinessState, query: A4ReadinessQuery): A4ReadinessItem[] {
  const { spec, answers, revisionNo } = adaptSpecOf(state);
  const gaps = answerGaps(answers, carriedValues(state));
  const proposed = proposedFor(spec, answers);
  const understanding = understandingOf(spec);
  const regulated = isRegulated(state, query.floor);
  const unknownFacts = (Object.keys(FACTS) as AdaptFact[]).filter((fact) => {
    const value = factAnswer(answers, fact)?.value;
    return FACTS[fact] === "list" ? factList(value) === null : factTerm(value) === null;
  });
  return [
    gaps.missing.length + gaps.stale.length + gaps.invalid.length + gaps.carried.length === 0 ? item("ask_complete", "READY")
      : waiting("ask_complete", [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`),
        ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`), ...gaps.carried], { nextAction: { label: gaps.carried.length > 0
          ? "Run Understand to carry the Aspire answers again" : "Answer or confirm the listed questions" } }),
    !reached(state, "understood") ? waiting("understanding_confirmed", ["UNDERSTANDING_NOT_CONFIRMED"])
      : state.project.stage === "adapt" && !understandingCurrent(spec, answers)
        ? waiting("understanding_confirmed", ["UNDERSTANDING_STALE"], { nextAction: { label: "Answers changed: run Understand again, then confirm it" } })
        : item("understanding_confirmed", "READY"),
    unknownFacts.length === 0 ? item("profile_facts_complete", "READY", { mandatory: false })
      : waiting("profile_facts_complete", unknownFacts.map((fact) => `FACT_UNKNOWN:${fact}`), { mandatory: false,
        nextAction: { label: "Unknown facts stay unknown (null) and leave the requirements they decide unresolved" } }),
    proposed ? item("plan_proposed", "READY")
      : waiting("plan_proposed", [spec.schema === ADAPT_SPEC_SCHEMA ? "PLAN_STALE" : "NOT_PROPOSED"], { nextAction: { label: "Propose the plan" } }),
    ...planItems(state, query, spec, answers, regulated),
    ...signingItems(state, spec, answers, revisionNo, regulated),
    lockoutItem(state, regulated),
    ...contextItems(state, query, answers, understanding)
  ];
}
