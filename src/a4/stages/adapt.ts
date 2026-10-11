/**
 * Adapt, contextualization (P1-61 slice A, the plan; design §10.3). Understand carries Aspire's markets and stations,
 * builds the DeploymentProfile from the answers and compiles the plan (src/a4/adaptPolicy.ts); Explain renders it at
 * three levels under the catalog's own experimental notice (D-08); Propose freezes the profile, the plan, the operating
 * scope and the declared data handling; Build signs the plan (CONTROL_PLAN); Review records the conformance statement's
 * signed control results (src/a4/a4Conformance.ts). Completion of a regulated project runs a4.adapt.activate_plan, whose
 * executor activateControlPlan consumes the plan review's grant itself; a non-regulated project completes with the plan
 * signed and not activated, and an owner may still open that effect. Everything A4 writes here is self_reported.
 */
import { loadCatalog } from "../../catalog/loader.js";
import { activeControlPlanHead, loadActiveCompiledPolicy } from "../../catalog/compiler/activate.js";
import { renderPlanDiffMarkdown } from "../../catalog/compiler/diff.js";
import { CONTROL_PLAN_REVIEW_TOOL, planReviewIntent } from "../../catalog/compiler/sign.js";
import { CLOCK_REVIEW_STATUS } from "../../incidents/regulatoryClocks.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import type { A4EffectDef } from "../a4Effects.js";
import { explain, type A4ExplainFact, type A4ExplainLevel } from "../a4Explain.js";
import { RESOURCE_SLOTS, signedA4Floor } from "../a4Gates.js";
import { isRegulated } from "../a4Readiness.js";
import type { A4ProducerContext, A4ProducerResult } from "../a4RouterStages.js";
import { gatePolicyOf, type A4Answer, type A4StageRegistry } from "../a4Schema.js";
import { A4StoreError } from "../a4Store.js";
import { errorCodeOf } from "../aspireUnderstand.js";
import { conformanceStatement, recordControlResults } from "../a4Conformance.js";
import {
  activateBoundPlan, activationExecutionId, boundPlanOf, openPlanReview, proposalDiff, shippedLockDigest, signAdaptPlan, understandAdapt
} from "../adaptPolicy.js";
import {
  ACTIVATE_PLAN_EFFECT_ID, ADAPT_CLAIM_BOUNDARY, acknowledgementOf, ADAPT_SPEC_SCHEMA, CARRIED, CATALOG_EXPERIMENTAL_NOTICE, NATIVE_LEASE_KEY, adaptItems, adaptSpecOf, answerGaps,
  buildOf, carriedValues, currentPlan, factAnswer, factList, ownerOutOfScope, proposedFor, proposedPlan, understandingOf
} from "../spec/adapt.js";
import { answersDigestOf, answerValues, dependencyDigest, listValue, textValue, understandingCurrent } from "../spec/aspire.js";

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);

/**
 * Readiness items, the plan slots and the activation effect. `plan.journalEntrySha256` is the active compiled-plan
 * journal's head (any activation, here or elsewhere, moves it: RESOURCE_DRIFTED on an open gate, and a head Adapt
 * revision recorded under an active plan is regulated); `plan.lockDigest` is the shipped catalog's lock.
 */
export function register(registry: A4StageRegistry): void {
  registry.items.push(adaptItems);
  RESOURCE_SLOTS["plan.journalEntrySha256"] = (workspace) => {
    try {
      return activeControlPlanHead(workspace);
    } catch {
      throw fail(409, "RESOURCE_UNREADABLE", "plan.journalEntrySha256: the compiled-plan journal does not verify");
    }
  };
  RESOURCE_SLOTS["plan.lockDigest"] = () => shippedLockDigest();
  registry.registerEffect(ACTIVATE_PLAN_EFFECT);
}

/**
 * a4.adapt.activate_plan (design §6.1 table): the plan review filed by signPlan when an owner opens the effect gate,
 * decided from the A4 card on the strict bound path; `complete` verifies it, re-checks membership and A4's SoD (the
 * `complete` caller and the build principals excluded) and never consumes it: activateControlPlan does, under
 * `activate-<digest32>`, and EFFECT_FINISHED records that execution id. Not retryable: a failure re-opens the effect
 * gate. Optional: only a regulated project's readiness requires it (`plan_activated`).
 */
const ACTIVATE_PLAN_EFFECT: A4EffectDef = {
  id: ACTIVATE_PLAN_EFFECT_ID, toolName: CONTROL_PLAN_REVIEW_TOOL, actionClass: "SECURITY", consumes: "executor", optional: true, completes: "adapt.completion",
  executionId: (state, gate) => activationExecutionId(boundPlanOf(state, gate).plan),
  intent: (state, gate) => planReviewIntent(boundPlanOf(state, gate).plan).intentPayload,
  openRequest: ({ workspace, state, gate, quorumFloor }) => openPlanReview({ workspace, state, gate, quorumFloor }),
  run: async ({ workspace, state, gate, approvalRequestId }) => activateBoundPlan({ workspace, state, gate, approvalRequestId })
};

/** The router's entry (src/a4/spec/adapt.ts PRODUCERS). */
export async function produceAdapt(step: "understand" | "explain" | "propose" | "build" | "review", ctx: A4ProducerContext): Promise<A4ProducerResult> {
  if (step === "understand") return understand(ctx);
  if (step === "explain") return explainStep(ctx);
  if (step === "propose") return propose(ctx);
  if (step === "build") return build(ctx);
  return review(ctx);
}

/** Explain and Propose build on Understand's facts: 409 UNDERSTANDING_STALE unless Understand ran on these answers. */
function assertUnderstood(spec: Record<string, unknown>, answers: readonly A4Answer[]): void {
  if (!understandingCurrent(spec, answers)) {
    throw fail(409, "A4_NOT_READY", "Understand has not run on the current answers; run Understand again, then confirm it.", { reasonCodes: ["UNDERSTANDING_STALE"] });
  }
}

/** Understand: the carried Aspire answers, the profile, the compiled plan and the facts around it; nothing proposes until a person confirms it. */
function understand(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, answers } = adaptSpecOf(ctx.state);
  const carried = carriedValues(ctx.state);
  const project = ctx.state.project;
  const revisionNo = project.revision_no + 1;
  const kept = answers.filter((answer) => !(CARRIED as readonly string[]).includes(answer.questionId));
  const values = answerValues(kept);
  for (const [id, value] of carried) values.set(id, value);
  const carriedAnswers: A4Answer[] = [...carried].map(([questionId, value]) => ({ questionId, value, source: "carried", answeredAtRevision: revisionNo,
    dependencyDigest: dependencyDigest([], values) }));
  const merged = [...kept, ...carriedAnswers].sort((a, b) => a.questionId.localeCompare(b.questionId));
  const facts = understandAdapt({ workspace: ctx.workspace, projectId: project.project_id, workspaceId: project.workspace_id, agentId: project.agent_id,
    answers: merged, now: ctx.now });
  const understanding = { answersDigest: answersDigestOf(merged), carried: [...carried.keys()], facts };
  const plan = facts.plan;
  const output = (label: string, body: unknown, lane: "implementation" | "recommendation" = "recommendation") =>
    ({ output: "understanding", label: `adapt understand: ${label}`, lane, method: null, body });
  return {
    outputs: [
      output("the deployment profile built from your answers (every fact asserted; unknown is null)", facts.profile ?? { error: facts.compileError }),
      output("the compiled plan: applicability per requirement with reasons and missing facts (experimental catalog, D-08)",
        plan === null ? { error: facts.compileError } : { digest: plan.digest, status: plan.status, requirements: facts.requirements, conflicts: plan.conflicts,
          unsupported: plan.unsupported, followUps: facts.followUps, notice: facts.notice }),
      output("register entries of the stations, with verified as recorded", facts.register),
      output("reporting-clock candidates (each needs classification)", { reviewStatus: CLOCK_REVIEW_STATUS, clocks: facts.clocks }),
      output("signed configs and the active compiled plan", { configs: facts.configs, activePlan: facts.activePlan }, "implementation")
    ],
    spec: { ...spec, answers: merged, understanding },
    response: { understanding: { answersDigest: understanding.answersDigest, carried: understanding.carried, planDigest: plan?.digest ?? null,
      planStatus: plan?.status ?? null, compileError: facts.compileError, followUps: facts.followUps } }
  };
}

/** Adapt's explanation facts (design §10.3 Explain): stored once, rendered at three levels; the source status quotes the catalog. */
export function adaptFacts(spec: Record<string, unknown>, answers: readonly A4Answer[], chain: Parameters<typeof gatePolicyOf>[0], regulated: boolean): A4ExplainFact[] {
  const facts = understandingOf(spec)?.facts;
  const plan = currentPlan(spec, answers);
  const requirements = plan?.requirements ?? [];
  const count = (state: string): number => requirements.filter((row) => row.applicability === state).length;
  const followUps = [...(facts?.followUps ?? [])];
  const reviews = gatePolicyOf(chain).gates["adapt.completion"].requiredReviews;
  const register = (Array.isArray(facts?.register) ? facts.register : []) as Array<{ id: string; verified: boolean }>;
  const clocks = facts?.clocks ?? [];
  const jurisdictions = factList(factAnswer(answers, "jurisdictions")?.value);
  return [
    { id: "applicability", sources: ["compilePlan", "evaluatePredicate", "catalog/"], dataStatus: "experimental",
      novice: plan === null ? "AMC could not work out yet which requirements apply: the answers did not compile into a plan."
        : `From your answers, ${count("applicable")} catalog requirement(s) apply, ${count("not_applicable")} do not, and ${count("unresolved")} cannot be decided until some answers are known.`,
      practitioner: plan === null ? `Compile refused: ${facts?.compileError?.code ?? "not compiled"}.`
        : requirements.map((row) => `${row.controlId} ${row.applicability}${row.missingFacts.length > 0 ? ` (missing ${row.missingFacts.join(", ")})` : ""}; pulled in by ${row.pulledInBy.join(", ")}`).join(". "),
      expert: plan === null ? "parseDeploymentProfile/compilePlan threw." : `compilePlan({ profile, catalog: loadCatalog(), asOf }) → ${plan.digest}, status ${plan.status}; `
        + requirements.map((row) => `${row.controlId}@${row.controlVersion}: ${row.reasons.join("; ")}`).join(" | ") },
    { id: "sources", sources: ["catalog/README.md", "src/compliance/regulatory"], dataStatus: "experimental",
      novice: `The catalog says: "${CATALOG_EXPERIMENTAL_NOTICE}" (D-08)`,
      practitioner: `The catalog says: "${CATALOG_EXPERIMENTAL_NOTICE}" (D-08) Records: ${requirements.map((row) => `${row.controlId} support ${row.support}`).join(", ") || "none"}. `
        + `Register entries for the stations: ${register.length}, verified: ${register.filter((entry) => entry.verified).length}.`,
      expert: `D-08. ${requirements.map((row) => `${row.controlId}.support=${row.support}`).join(", ")}; register ${register.map((entry) => `${entry.id}.verified=${String(entry.verified)}`).join(", ") || "none"}.` },
    { id: "missing-facts", sources: ["RequirementDecision.missingFacts"], dataStatus: null,
      novice: followUps.length === 0 ? "No answer is missing for the requirements the catalog holds." : `Answering ${followUps.join(", ")} lets AMC decide the requirements left open.`,
      practitioner: followUps.length === 0 ? "No missing facts." : `Missing facts: ${followUps.join(", ")}. Each is answered by the question of the same name; an unknown fact stays null.`,
      expert: `followUps = unique(plan.requirements[].missingFacts) = [${followUps.join(", ")}]; jurisdictions = ${JSON.stringify(jurisdictions)} (the answer, else the carried markets).` },
    { id: "required-reviews", sources: ["the in-force A4 gate policy (adapt.completion)"], dataStatus: null,
      novice: reviews.length === 0 ? "No extra review is required at completion." : `Completion also needs: ${reviews.map((entry) => entry.label).join("; ")}. A role's approval is an acknowledgement, not an expert review.`,
      practitioner: reviews.map((entry) => `${entry.kind}${entry.role === undefined ? "" : ` (${entry.role})`}: ${entry.label}`).join("; ") || "none",
      expert: `gatePolicyOf(chain).gates["adapt.completion"].requiredReviews = ${canonicalize(reviews)}` },
    { id: "activation", sources: ["activateControlPlan", "compiledPolicyGuard", NATIVE_LEASE_KEY], dataStatus: null,
      novice: regulated ? "Because this project is regulated, completing Adapt switches the plan on for the whole workspace, after a second, separate approval."
        : "The plan is signed but not switched on by default. Switching it on is a separate owner step and affects every agent in the workspace.",
      practitioner: `${regulated ? "Regulated: completion runs" : "Not regulated: completion leaves the plan signed, not activated; an owner may open"} ${ACTIVATE_PLAN_EFFECT_ID}. `
        + "Under an active plan with L0-IDN-01 every native tool call needs a verified lease: Studio native tasks with workspace tools started after activation get one (P1-67); tasks started before it, CLI agent sessions and delegated children do not and are denied.",
      expert: "signPlan({ reviewAgentId, quorumFloor }) files the SECURITY review when the effect gate opens; activateControlPlan verifies it and consumes it as activate-<digest32>; compiledPolicyGuard denies any session whose pinned head differs from the journal's." },
    { id: "enforcement-none", sources: ["design §10.3", "P2-01", "P2-02", "P3-23"], dataStatus: null,
      novice: "Some of what you declared is recorded but not enforced by AMC yet: where data may go, how long it is kept, and which incident reporting deadlines apply.",
      practitioner: `Data handling (classes, residency, retention, processors) is declared, not enforced (P2-01, P2-02). ${clocks.length} reporting clock(s) are candidates an operator classifies; AMC decides none (P3-23).`,
      expert: `enforcement: none for data handling; clocks: ${clocks.map((clock) => clock.clockId).join(", ") || "none"}, each NEEDS_CLASSIFICATION; ${CLOCK_REVIEW_STATUS}.` }
  ];
}

/** Explain: the facts once, rendered at the member's level; all three renderings are kept. */
function explainStep(ctx: A4ProducerContext): A4ProducerResult {
  const level: A4ExplainLevel = ctx.level ?? "practitioner";
  const { spec, answers } = adaptSpecOf(ctx.state);
  assertUnderstood(spec, answers);
  const facts = adaptFacts(spec, answers, ctx.state.chain, regulatedNow(ctx));
  const items = explain(facts, level);
  return { outputs: [{ output: "explanation", label: `adapt explain at the ${level} level`, lane: "recommendation", method: null, body: { level, items } }],
    spec: { ...spec, explanation: { level, facts } }, response: { explanation: { level, items } } };
}

/** Readiness's own rule (isRegulated) on the producer's rows and the signed floor; an unverified policy reads regulated (fail closed). */
function regulatedNow(ctx: A4ProducerContext): boolean {
  try {
    return isRegulated(ctx.state, signedA4Floor(ctx.workspace));
  } catch {
    return true;
  }
}

/**
 * Propose: the profile, the plan and the scope from the answers and Understand's facts (no part is edited by hand; change
 * the answers instead), the diff against this project's previous proposal, the operating scope and the declared data
 * handling (not enforced: P2-01, P2-02).
 */
function propose(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, answers } = adaptSpecOf(ctx.state);
  const gaps = answerGaps(answers, carriedValues(ctx.state));
  const codes = [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`), ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`),
    ...gaps.carried];
  if (codes.length > 0) throw fail(409, "A4_NOT_READY", "Answer or confirm the listed questions before proposing.", { reasonCodes: codes });
  assertUnderstood(spec, answers);
  for (const key of Object.keys(ctx.spec ?? {})) {
    if (canonicalize(ctx.spec![key] ?? null) !== canonicalize(spec[key] ?? null)) throw fail(400, "INPUT_INVALID", `${key} is built from your answers; change the answers instead.`);
  }
  const facts = understandingOf(spec)!.facts;
  const plan = facts.plan;
  if (plan === null) throw fail(409, "A4_NOT_READY", "The answers did not compile into a plan; change them and run Understand again.",
    { reasonCodes: ["PLAN_MISSING", `COMPILE_ERROR:${facts.compileError?.code ?? "UNKNOWN"}`] });
  const values = answerValues(answers);
  const fact = (name: Parameters<typeof factAnswer>[1]) => factList(factAnswer(answers, name)?.value);
  const diff = proposalDiff(ctx.state, plan);
  const { build: _build, review: _review, ...carried } = spec;
  return {
    outputs: [{ output: "plan", label: "adapt propose: the compiled plan and the operating scope (AMC's draft from your answers; experimental catalog, D-08)",
      lane: "recommendation", method: null, body: { planDigest: plan.digest, status: plan.status, diff: diff === null ? null : renderPlanDiffMarkdown(diff) } }],
    spec: { ...carried, answers, schema: ADAPT_SPEC_SCHEMA, answersDigest: answersDigestOf(answers), profile: facts.profile, plan, diff,
      operatingScope: { stations: fact("stations"), jurisdictions: fact("jurisdictions"), audiences: listValue(values.get("audiences")),
        languages: listValue(values.get("languages")), dataClasses: fact("dataClasses"), activities: fact("useCases"), excludedUses: listValue(values.get("excludedUses")),
        deploymentNeeds: textValue(values.get("deploymentNeeds")) },
      dataHandling: { dataClasses: fact("dataClasses"), residency: textValue(values.get("dataResidency")), retention: textValue(values.get("dataRetention")),
        processors: listValue(values.get("processors")), enforcement: "none", keys: ["P2-01", "P2-02"] },
      claimBoundary: ADAPT_CLAIM_BOUNDARY }
  };
}

/** The proposal at the head, or 409: Build and Review work only on the plan the direction gate approved. */
function proposalOf(ctx: A4ProducerContext) {
  const { spec, answers } = adaptSpecOf(ctx.state);
  const plan = proposedPlan(spec);
  if (!proposedFor(spec, answers) || plan === null) throw fail(409, "A4_NOT_READY", "No plan is proposed for the current answers.", { reasonCodes: ["NOT_PROPOSED"] });
  return { spec, plan };
}

/** Build: the proposed plan signed (CONTROL_PLAN, a local audit trail under this workspace's keys); its review is filed at the effect gate. */
function build(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, plan } = proposalOf(ctx);
  const signed = signAdaptPlan(ctx.workspace, ctx.state, plan);
  return {
    outputs: [{ output: "build", label: "adapt build: the compiled plan signed (CONTROL_PLAN; checked against this workspace's own keys, a local audit trail)",
      lane: "implementation", method: null, body: { planDigest: signed.planDigest, compiledAt: signed.compiledAt, previousPlanDigest: signed.previousPlanDigest,
        diff: signed.diff === null ? null : renderPlanDiffMarkdown(signed.diff) } }],
    spec: { ...spec, build: signed }
  };
}

/**
 * Review: the active compiled plan's head against the proposal, the plan diff, and the conformance statement's control
 * results (evaluated, written signed and read back verified). The context probe that observes the runtime frame is slice
 * B's, so `reviewed` carries the explicit not_evaluated output.
 */
function review(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, plan } = proposalOf(ctx);
  if (buildOf(spec) === null) throw fail(409, "A4_NOT_READY", "Nothing was built for this plan.", { reasonCodes: ["PRODUCED_AT_BUILD"] });
  const project = ctx.state.project;
  const created = ctx.state.chain.find((link) => link.kind === "CREATED")?.body.ts;
  const conformance = recordControlResults({ workspace: ctx.workspace, projectId: project.project_id, workspaceId: project.workspace_id, agentId: project.agent_id,
    plan, catalog: loadCatalog(), windowStartTs: typeof created === "number" ? created : project.created_ts, now: ctx.now });
  // As of this review: an owner's out_of_scope recorded later on the reviewed revision is read live by readiness and the cards.
  const reviewed = ctx.state.revisions.find((row) => row.revision_no === project.revision_no);
  const rule = gatePolicyOf(ctx.state.chain).gates["adapt.completion"];
  const statement = conformanceStatement({ stage: "adapt", revisionDigest: reviewed?.spec_digest ?? sha256Hex(canonicalize(spec)), stored: conformance,
    evaluatedAt: new Date(ctx.now).toISOString(), ownerOutOfScope: ownerOutOfScope(ctx.state, plan, ctx.now),
    unsupported: plan.unsupported.map((row) => `${row.controlId}: ${row.reason}`), missingFacts: [...(understandingOf(spec)?.facts.followUps ?? [])],
    expertReview: { required: rule.requiredReviews.some((entry) => entry.kind === "review_record"),
      records: ctx.state.refs.filter((ref) => ref.revisionNo === project.revision_no && ref.lane === "verified").map((ref) => `${ref.refKind}:${ref.refId}`),
      acknowledgement: acknowledgementOf(ctx.state, "regulatory_sources_status", ctx.now) },
    claimBoundary: ADAPT_CLAIM_BOUNDARY, now: ctx.now });
  let head: Record<string, unknown>;
  try {
    const active = loadActiveCompiledPolicy(ctx.workspace);
    head = active === null ? { activePlan: null, sameAsProposal: false, samePolicy: false }
      : { activePlan: { revision: active.revision, planDigest: active.planDigest, lockDigest: active.lockDigest, entrySha256: active.entrySha256 },
        sameAsProposal: active.planDigest === plan.digest, samePolicy: active.runtimePolicy.policyDigest === plan.runtimePolicy.policyDigest };
  } catch (error) {
    head = { activePlan: { error: errorCodeOf(error, "COMPILED_POLICY_UNREADABLE") }, sameAsProposal: false, samePolicy: false };
  }
  const diff = (spec.diff ?? null) as Parameters<typeof renderPlanDiffMarkdown>[0];
  return {
    outputs: [
      { output: "review", label: "adapt review: the conformance statement (amc.a4-conformance-statement/v1; signed CONTROL_RESULT set; counts, never a percentage)",
        lane: "recommendation", method: null, body: { statement, resultsPath: conformance.resultsPath, verified: conformance.verified } },
      { output: "review", label: "adapt review: the active compiled plan's head against the proposal", lane: "implementation", method: null, body: head },
      { output: "review", label: "adapt review: the plan diff against this project's previous proposal", lane: "recommendation", method: null, body: renderPlanDiffMarkdown(diff) }
    ],
    notEvaluated: ["NO_OBSERVED_REF", "CONTEXT_PROBE_NOT_RUN"],
    spec: { ...spec, review: { conformance, statement, head, claimBoundary: ADAPT_CLAIM_BOUNDARY } }
  };
}
