/**
 * Adapt, contextualization (P1-61 slice A, the plan; design §10.3). Understand carries Aspire's markets and stations,
 * builds the DeploymentProfile from the answers and compiles the plan (src/a4/adaptPolicy.ts); Explain renders it at
 * three levels under the catalog's own experimental notice (D-08); Propose freezes the profile, the plan, the operating
 * scope and the declared data handling; Build signs the plan (CONTROL_PLAN); Review records the conformance statement's
 * signed control results (src/a4/a4Conformance.ts). Completion of a regulated project runs a4.adapt.activate_plan, whose
 * executor activateControlPlan consumes the plan review's grant itself; a non-regulated project completes with the plan
 * signed and not activated, and an owner may still open that effect. Slice B adds the operating-profile dry run and the
 * prompt pack at Understand, the memory policy and the context plugin at Build (the probe that checks the plugin in an
 * in-process frame is src/a4/adaptContextPlugin.ts), and their re-checks at Review. Everything A4 writes here is self_reported.
 */
import { existsSync, lstatSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { dirname, relative, sep } from "node:path";
import { loadCatalog } from "../../catalog/loader.js";
import { activeControlPlanHead, loadActiveCompiledPolicy } from "../../catalog/compiler/activate.js";
import { renderPlanDiffMarkdown } from "../../catalog/compiler/diff.js";
import { CONTROL_PLAN_REVIEW_TOOL, planReviewIntent } from "../../catalog/compiler/sign.js";
import { latestEnforceResourceManifestPath, verifyEnforceResourceManifest, writeEnforceResourceManifest } from "../../enforce/resourceManifest.js";
import { artifactSigPath } from "../../lifecycle/artifactSignature.js";
import { CLOCK_REVIEW_STATUS } from "../../incidents/regulatoryClocks.js";
import { openLedger } from "../../ledger/ledger.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { pathExists, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import type { A4EffectDef } from "../a4Effects.js";
import { explain, type A4ExplainFact, type A4ExplainLevel } from "../a4Explain.js";
import { driftedSlots, RESOURCE_SLOTS, signedA4Floor } from "../a4Gates.js";
import { isRegulated } from "../a4Readiness.js";
import type { A4ProducerContext, A4ProducerResult } from "../a4RouterStages.js";
import { flatSlots, gatePolicyOf, type A4Answer, type A4StageRegistry } from "../a4Schema.js";
import { assertNoSecrets } from "../a4Router.js";
import { A4StoreError } from "../a4Store.js";
import { errorCodeOf } from "../aspireUnderstand.js";
import { conformanceStatement, recordControlResults } from "../a4Conformance.js";
import { checkMemoryPolicy, MEMORY_ENFORCEMENT_NOTE, memoryPolicyDraft, memoryPolicyFields, memoryPolicySha256, writeMemoryPolicy } from "../adaptMemoryPolicy.js";
import {
  contextItems, contextPluginDraft, contextPluginSha256, PROBE_LIMITATION, PROBE_PURPOSE, probeFrameStatus, promptPackSha256, promptPackStatus, readContextPlugin,
  writeContextPlugin
} from "../adaptContextPlugin.js";
import {
  operatingProfileActivationSha256, operatingProfileSha256, permissionItems, permissionsDryRun, permissionsOf, profileGeneratedAt, profileStation
} from "../adaptPermissions.js";
import {
  activateBoundPlan, activationExecutionId, activationWeakenings, boundPlanOf, openPlanReview, proposalDiff, shippedLockDigest, signAdaptPlan, understandAdapt
} from "../adaptPolicy.js";
import {
  ACTIVATE_PLAN_EFFECT_ID, ADAPT_CLAIM_BOUNDARY, acknowledgementOf, ADAPT_SPEC_SCHEMA, CARRIED, CATALOG_EXPERIMENTAL_NOTICE, NATIVE_LEASE_KEY, adaptItems, adaptSpecOf, answerGaps,
  buildOf, carriedValues, currentPlan, factAnswer, factList, ownerOutOfScope, proposedFor, proposedPlan, understandingOf, type AdaptBuild
} from "../spec/adapt.js";
import { answersDigestOf, answerValues, dependencyDigest, listValue, textValue, understandingCurrent } from "../spec/aspire.js";

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const relPath = (workspace: string, path: string): string => relative(workspace, path).split(sep).join("/");
/** The largest proposal Propose records: Build's record (signature, memory policy, context record, signed diff) must still fit the router's 256 KiB. */
const SPEC_ROOM_FOR_BUILD = 240 * 1024; // ponytail: Build's record is ~3 KiB plus the signed plan diff; Build checks the exact record before it writes
const tooLargeForBuild = (spec: Record<string, unknown>): boolean => canonicalize(spec).length + canonicalize(spec.diff ?? null).length > SPEC_ROOM_FOR_BUILD;
/** Build keeps the bytes it replaces (memory policy, context plugin, the Enforce manifest and its signature) to put them back. */
const MAX_KEPT_BYTES = 4 * 1024 * 1024;

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
  RESOURCE_SLOTS["context.memoryPolicySha256"] = memoryPolicySha256;
  RESOURCE_SLOTS["context.contextPluginSha256"] = contextPluginSha256;
  RESOURCE_SLOTS["context.promptPackSha256"] = promptPackSha256;
  RESOURCE_SLOTS["operatingProfile.sha256"] = operatingProfileSha256;
  RESOURCE_SLOTS["operatingProfile.activationSha256"] = operatingProfileActivationSha256;
  registry.items.push(contextItems, permissionItems);
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
  const facts = { ...understandAdapt({ workspace: ctx.workspace, projectId: project.project_id, workspaceId: project.workspace_id, agentId: project.agent_id,
    answers: merged, now: ctx.now }),
  // The station's operating profile, dry-run against the current verified configs (A4's own proposal file; nothing under .amc/).
  permissions: permissionsDryRun({ workspace: ctx.workspace, agentId: project.agent_id, station: profileStation(merged), generatedAt: profileGeneratedAt(ctx.state) }),
  promptPack: promptPackStatus(ctx.workspace, project.agent_id) };
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
      output("signed configs and the active compiled plan", { configs: facts.configs, activePlan: facts.activePlan }, "implementation"),
      output("the station operating profile's dry run: widenings activateOperatingProfile({ allowWidening: false }) refuses", facts.permissions, "implementation"),
      output("the agent's existing prompt pack (a signed Score resource; the runtime does not load it)", facts.promptPack, "implementation")
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
  const memory = memoryPolicyFields(answerValues(answers)).fields;
  const permissions = understandingCurrent(spec, answers) ? permissionsOf(spec) : null;
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
    { id: "memory", sources: ["src/a4/adaptMemoryPolicy.ts", "ReasoningMemoryItem (src/learning/reasoningMemory.ts)"], dataStatus: null,
      novice: `The agent may remember items classed ${memory.privacyClass} for up to ${memory.expiresAfterDays} days, reviewed after ${memory.reviewAfterDays}, `
        + `read by ${memory.allowedConsumers.join(", ")}. AMC records this policy but does not enforce it yet.`,
      practitioner: `Build writes <agent>/memory/policy.json: retentionTag ${memory.retentionTag}, consumers ${memory.allowedConsumers.join(", ")}`
        + ` (${Object.entries(memory.sources).map(([field, from]) => `${field} ${from}`).join(", ")}). Enforcement ${MEMORY_ENFORCEMENT_NOTE}.`,
      expert: `amc.a4-memory-policy/v1 ${canonicalize(memory)}; enforcement: advisory (no reader of the file in src/learning).` },
    { id: "permissions", sources: ["buildOperatingProfile", "activateOperatingProfile({ dryRun: true })", "src/a4/adaptPermissions.ts"], dataStatus: null,
      novice: permissions === null ? "Understand compares your station's recommended settings with the settings the workspace enforces today, without writing or signing anything."
        : permissions.error !== null ? `AMC could not compare the station's recommended settings with the workspace's (${permissions.error}).`
          : permissions.widenings.length === 0 ? `The ${String(permissions.station)} station's recommended settings would not loosen anything the workspace enforces today.`
            : `Applying the ${String(permissions.station)} station's recommended settings would loosen ${permissions.widenings.length} setting(s) the workspace enforces today, `
              + "so AMC refuses them unless a project owner accepts exactly that list. AMC never applies them for you.",
      practitioner: permissions === null || permissions.error !== null ? `No comparison (${permissions?.error ?? "not run"}).`
        : `The ${String(permissions.station)} station's profile, built in memory (no file, no signature): ${permissions.widenings.length} widening(s)`
          + `${permissions.widenings.length === 0 ? "" : `: ${permissions.widenings.slice(0, 5).join("; ")}`}. A4 never passes allowWidening and never signs or activates a profile: `
          + "an owner emits, reviews and signs it (amc domain apply --sign-profile), then activates it (--activate-profile).",
      expert: permissions === null ? "permissionsDryRun not run." : `planActivationWidenings(workspace, buildOperatingProfile(...), agentId) on profile sha256 ${permissions.profileSha256 ?? "none"}: `
        + `widenings sha256 ${permissions.wideningsSha256 ?? "none"}; configs ${permissions.configs.map((entry) => `${entry.config}=${entry.sha256 ?? "stamped at write"}`).join(", ") || "none"}; `
        + `error ${permissions.error ?? "none"}. Not built yet: the effect a4.adapt.activate_profile, per-agent gatePolicy.json and lease caps, the prompt-pack build (A4_PROFILE_EFFECT).` },
    { id: "context", sources: ["src/a4/adaptContextPlugin.ts", "extraContextPlugins (src/prompt/agentPromptProfile.ts)", "P2-37"], dataStatus: null,
      novice: "Build turns your answers about audiences, markets, sector, languages, accessibility and data into a labelled note the agent reads as context. "
        + "Today only an in-process run reads it: Studio native tasks and a deployed agent do not, and AMC says so.",
      practitioner: "Build writes <agent>/a4/context-plugin.json (order 160, attributed to this project's revision). The probe runs one in-process turn on the stub provider "
        + `and records that session as a self-reported ref (A4 ran it, so it is never observed); the frame is the session's signed user/message row holding the `
        + `plugin's text, which AMC checks at the probe and again at Review (${PROBE_LIMITATION}). The turn makes no tool call, so the runtime writes no `
        + "effective-policy receipt for it. Delivery to a model is not evaluated on the stub provider; delivery to native tasks and to a deployed agent is not evaluated (P2-37).",
      expert: "ContextPlugin { name: \"a4:context\", order: 160 } through runComposedTurn({ promptProfile: { extraContextPlugins } }) (never contextPlugins, which drops AGENTS.md); "
        + "no tools and no bindToolSession, so nothing A4 authors enters the session; the ref is its session/open row (claimKind self_reported, method null); "
        + "the user/message snapshot row must carry the frame's exact text." },
    { id: "enforcement-none", sources: ["design §10.3", "P2-01", "P2-02", "P3-23"], dataStatus: null,
      novice: "Some of what you declared is recorded but not enforced by AMC yet: where data may go, how long it is kept, what the agent may remember, and which incident reporting deadlines apply.",
      practitioner: `Data handling (classes, residency, retention, processors) is declared, not enforced (P2-01, P2-02). The memory policy is advisory until the writeback reads it. ${clocks.length} reporting clock(s) are candidates an operator classifies; AMC decides none (P3-23).`,
      expert: `enforcement: none for data handling; advisory for the memory policy; clocks: ${clocks.map((clock) => clock.clockId).join(", ") || "none"}, each NEEDS_CLASSIFICATION; ${CLOCK_REVIEW_STATUS}.` }
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
  const next = { ...carried, answers, schema: ADAPT_SPEC_SCHEMA, answersDigest: answersDigestOf(answers), profile: facts.profile, plan, diff,
    operatingScope: { stations: fact("stations"), jurisdictions: fact("jurisdictions"), audiences: listValue(values.get("audiences")),
      languages: listValue(values.get("languages")), dataClasses: fact("dataClasses"), activities: fact("useCases"), excludedUses: listValue(values.get("excludedUses")),
      deploymentNeeds: textValue(values.get("deploymentNeeds")) },
    dataHandling: { dataClasses: fact("dataClasses"), residency: textValue(values.get("dataResidency")), retention: textValue(values.get("dataRetention")),
      processors: listValue(values.get("processors")), enforcement: "none", keys: ["P2-01", "P2-02"] },
    claimBoundary: ADAPT_CLAIM_BOUNDARY };
  // Build would otherwise be refused only by the router's size check (its record joins this specification).
  if (tooLargeForBuild(next)) throw fail(413, "INPUT_TOO_LARGE", "The proposal leaves Build no room under the 256 KiB specification limit; shorten the answers.");
  return {
    outputs: [{ output: "plan", label: "adapt propose: the compiled plan and the operating scope (AMC's draft from your answers; experimental catalog, D-08)",
      lane: "recommendation", method: null, body: { planDigest: plan.digest, status: plan.status, diff: diff === null ? null : renderPlanDiffMarkdown(diff) } }],
    spec: next
  };
}

/** The proposal at the head, or 409: Build and Review work only on the plan the direction gate approved. */
function proposalOf(ctx: A4ProducerContext) {
  const { spec, answers } = adaptSpecOf(ctx.state);
  const plan = proposedPlan(spec);
  if (!proposedFor(spec, answers) || plan === null) throw fail(409, "A4_NOT_READY", "No plan is proposed for the current answers.", { reasonCodes: ["NOT_PROPOSED"] });
  return { spec, plan };
}

/**
 * The agent's Enforce resources against its signed manifest (none yet: Build writes the first). A manifest that does not
 * verify, or any difference outside the resource kinds in `allowed`, is 409 ENFORCE_DRIFTED: Build never re-baselines
 * drift it did not write (a resource tampered with before Propose would read ACTIVE, and the known-good rollback
 * snapshot would be replaced). Codes and kinds only, never a path.
 * ponytail: `allowed` is per kind (the agent's memory directory), so another file written under memory/ between this
 * check and the snapshot would be re-baselined too; compare the directory digest Build expects if that matters.
 */
function assertEnforceCurrent(workspace: string, agentId: string, allowed: ReadonlySet<string> = new Set()): void {
  if (!pathExists(latestEnforceResourceManifestPath(workspace, agentId))) return;
  let verified: ReturnType<typeof verifyEnforceResourceManifest>;
  try {
    verified = verifyEnforceResourceManifest({ workspace, agentId });
  } catch (error) {
    throw fail(409, "ENFORCE_DRIFTED", "The agent's signed Enforce manifest could not be verified; review it in Enforce before building.",
      { reasonCodes: [errorCodeOf(error, "MANIFEST_UNREADABLE")] });
  }
  const moved = [...verified.diff.added, ...verified.diff.removed, ...verified.diff.changed].filter((entry) => !allowed.has(entry.kind));
  if (!verified.signature.valid || moved.length > 0) {
    throw fail(409, "ENFORCE_DRIFTED", "The agent's resources differ from its signed Enforce manifest: review the drift in Enforce and re-baseline it there, then build again.",
      { reasonCodes: [...(verified.signature.valid ? [] : ["MANIFEST_SIGNATURE_INVALID"]), ...[...new Set(moved.map((entry) => `DRIFTED:${entry.kind}`))].slice(0, 16)] });
  }
}

/** The Enforce manifest after Build's writes (the agent stays ACTIVE, not DRIFTED), or the refusal's code; never a path in an error. */
function enforceSnapshot(workspace: string, agentId: string): NonNullable<AdaptBuild["manifest"]> {
  try {
    const written = writeEnforceResourceManifest({ workspace, agentId });
    // The writer publishes a manifest it could not sign (its signing errors are swallowed); Enforce's loader refuses it.
    return written.manifestSigPath === null || written.snapshotSigPath === null ? { error: "MANIFEST_UNSIGNED" }
      : { manifestId: written.manifest.manifestId, path: relPath(workspace, written.manifestPath) };
  } catch (error) {
    return { error: errorCodeOf(error, "ENFORCE_MANIFEST_REFUSED") };
  }
}

/**
 * The bytes now at `paths` (each a regular file or absent; anything else refuses Build before it writes, 409
 * RESOURCE_UNREADABLE) and the parent directories that do not exist yet, and the function that puts them back: a file
 * that was absent is removed and a directory Build created is removed once empty. Restoring is best effort, as Enforce's
 * own publication rollback is: a file it cannot put back reads as drift (Enforce DRIFTED, RESOURCE_DRIFTED), never as Build's.
 */
function keptBytes(paths: readonly string[]): () => void {
  const kept = paths.map((path) => {
    let stat: ReturnType<typeof lstatSync> | null = null;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw fail(409, "RESOURCE_UNREADABLE", "A file Build replaces could not be read; nothing was written.");
    }
    if (stat !== null && (!stat.isFile() || stat.size > MAX_KEPT_BYTES)) {
      throw fail(409, "RESOURCE_UNREADABLE", "A file Build replaces is not a regular file of a bounded size; nothing was written.");
    }
    return { path, bytes: stat === null ? null : readFileSync(path) };
  });
  const created = [...new Set(paths.map((path) => dirname(path)))].filter((dir) => !existsSync(dir)).sort((a, b) => b.length - a.length);
  return () => {
    for (const { path, bytes } of kept) {
      try {
        if (bytes === null) rmSync(path, { force: true });
        else writeFileAtomic(path, bytes, 0o644);
      } catch {
        // Left as it is: the bound slots and Enforce read it as drift.
      }
    }
    for (const dir of created) {
      try {
        rmdirSync(dir);
      } catch {
        // Not empty, or gone: kept.
      }
    }
  };
}

/**
 * Build: the proposed plan signed (CONTROL_PLAN, a local audit trail under this workspace's keys; its review is filed at
 * the effect gate), then the memory policy written under the agent's memory resource, the attributed context plugin
 * beside the agent's files, and the Enforce manifest re-written.
 * Build is an owner's (it signs workspace artifacts: roleRefusals and the A4 access policy). Every refusal (agent mode,
 * invalid memory answers, Enforce drift, a weakening, the signing key, the spill cap, and the router's own size and
 * secret checks of the produced specification, run here on the record Build will make) comes before the writes; the
 * Enforce manifest is re-written only when the writes moved nothing but the agent's memory directory. A write that
 * fails puts back the bytes Build replaced, and so does the router (`rollback`) when it then refuses the step (a moved
 * head, the transition): no write stays behind that no revision records.
 */
function build(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, plan } = proposalOf(ctx);
  const { workspace } = ctx;
  const project = ctx.state.project;
  if (tooLargeForBuild(spec)) throw fail(413, "INPUT_TOO_LARGE", "The proposal leaves Build no room under the 256 KiB specification limit; propose it again with shorter answers.");
  assertOwnerMode(workspace, "snapshot");
  const answers = adaptSpecOf(ctx.state).answers;
  const values = answerValues(answers);
  const invalid = memoryPolicyFields(values).invalid;
  if (invalid.length > 0) throw fail(409, "A4_NOT_READY", "The memory answers are not values the policy accepts.", { reasonCodes: invalid.map((id) => `ANSWER_INVALID:${id}`) });
  assertEnforceCurrent(workspace, project.agent_id);
  const signed = signAdaptPlan(workspace, ctx.state, plan);
  const source = `a4:${project.project_id}@r${project.revision_no}`;
  const memory = memoryPolicyDraft({ workspace, agentId: project.agent_id, source, values });
  const context = contextPluginDraft({ workspace, agentId: project.agent_id, projectId: project.project_id, revisionNo: project.revision_no,
    answers, clocks: understandingOf(spec)?.facts.clocks ?? [] });
  const manifestPath = latestEnforceResourceManifestPath(workspace, project.agent_id);
  const record = (manifest: NonNullable<AdaptBuild["manifest"]>): AdaptBuild => ({ ...signed,
    memoryPolicy: { path: relPath(workspace, memory.path), sha256: memory.sha256, policy: memory.policy }, context: context.record, manifest });
  // The router checks the produced specification (256 KiB, credentials) only after Build returns: the same check, first.
  assertNoSecrets({ ...spec, build: record({ manifestId: `enforce-resources-${"0".repeat(16)}`, path: relPath(workspace, manifestPath) }) }, "The produced specification");
  const restore = keptBytes([memory.path, context.path, manifestPath, artifactSigPath(manifestPath)]);
  let manifest: NonNullable<AdaptBuild["manifest"]>;
  try {
    writeMemoryPolicy(memory);
    writeContextPlugin(context);
    assertEnforceCurrent(workspace, project.agent_id, new Set(["memory"]));
    manifest = enforceSnapshot(workspace, project.agent_id);
  } catch (error) {
    restore();
    throw error;
  }
  const built = record(manifest);
  return {
    rollback: restore,
    outputs: [
      { output: "build", label: "adapt build: the compiled plan signed (CONTROL_PLAN; checked against this workspace's own keys, a local audit trail)",
        lane: "implementation", method: null, body: { planDigest: signed.planDigest, compiledAt: signed.compiledAt, previousPlanDigest: signed.previousPlanDigest,
          diff: signed.diff === null ? null : renderPlanDiffMarkdown(signed.diff) } },
      { output: "build", label: `adapt build: the memory policy written (${MEMORY_ENFORCEMENT_NOTE}) and the Enforce manifest re-written`,
        lane: "implementation", method: null, body: { memoryPolicy: built.memoryPolicy, manifest } },
      { output: "build", label: "adapt build: the attributed A4 context plugin (order 160; delivered only to an in-process run; native tasks and a deployed agent do not load it, P2-37)",
        lane: "implementation", method: null, body: context.record }
    ],
    spec: { ...spec, build: built }
  };
}

/** The slots Build's writes moved (and its revision bound as written): Review refuses when any moved since. */
const BUILT_SLOTS = ["context.memoryPolicySha256", "context.contextPluginSha256", "enforce.resourcesSha256"] as const;

/**
 * 409 RESOURCE_DRIFTED before Review records anything when the memory policy, the context plugin or the agent's Enforce
 * resources differ from what the head revision (Build's, or an earlier Review's that checked it) bound: Review's own
 * revision would otherwise bind the changed bytes into the completion gate.
 */
function assertBuiltCurrent(ctx: A4ProducerContext): void {
  const head = ctx.state.revisions.find((row) => row.revision_no === ctx.state.project.revision_no);
  const bound = head === undefined ? {} : flatSlots(JSON.parse(head.resource_digests_json));
  const drifted = driftedSlots(ctx.workspace, Object.fromEntries(BUILT_SLOTS.map((slot) => [slot, bound[slot] ?? null])), ctx.state.project.agent_id);
  if (drifted.length > 0) {
    throw fail(409, "RESOURCE_DRIFTED", `What Build wrote moved since (${drifted.join(", ")}); build again.`, { slots: drifted, reasonCodes: ["RESOURCE_DRIFTED"] });
  }
}

/** Review's re-check of the probe's frame row (probeFrameStatus) against the plugin Build wrote; a code when it cannot be read. */
function recheckFrame(ctx: A4ProducerContext, probe: Record<string, unknown>, fileSha256: string): string {
  let text: string;
  try {
    text = readContextPlugin(ctx.workspace, ctx.state.project.agent_id, fileSha256).text;
  } catch (error) {
    return errorCodeOf(error, "CONTEXT_PLUGIN_UNREADABLE");
  }
  let ledger: ReturnType<typeof openLedger> | null = null;
  try {
    ledger = openLedger(ctx.workspace, { readonly: true });
    return probeFrameStatus(ledger, probe, text);
  } catch (error) {
    return errorCodeOf(error, "FRAME_ROW_UNREADABLE");
  } finally {
    ledger?.close();
  }
}

/**
 * Review (an owner's: it signs the control results with the workspace auditor key): the active compiled plan's head
 * against the proposal, the plan diff, the conformance statement's control results (evaluated, written signed and read
 * back), and the re-checks of what Build wrote and of the probe's frame row. Nothing here is observed, so `reviewed`
 * carries the explicit not_evaluated output.
 */
function review(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, plan } = proposalOf(ctx);
  if (buildOf(spec) === null) throw fail(409, "A4_NOT_READY", "Nothing was built for this plan.", { reasonCodes: ["PRODUCED_AT_BUILD"] });
  const project = ctx.state.project;
  assertBuiltCurrent(ctx);
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
  // What activateControlPlan would refuse against the active plan now (readiness's plan_activated reads it); an unreadable journal is a code.
  try {
    head = { ...head, weakensActive: activationWeakenings(ctx.workspace, plan).slice(0, 32) };
  } catch (error) {
    head = { ...head, weakensActive: { error: errorCodeOf(error, "COMPILED_POLICY_UNREADABLE") } };
  }
  const diff = (spec.diff ?? null) as Parameters<typeof renderPlanDiffMarkdown>[0];
  const written = buildOf(spec)?.memoryPolicy;
  const memoryPolicy = written === undefined ? { parses: false, sameBytes: false, reason: "MEMORY_POLICY_NOT_BUILT" }
    : checkMemoryPolicy(ctx.workspace, project.agent_id, written.sha256);
  const context = buildOf(spec)?.context;
  const probeLink = context === undefined ? undefined : [...ctx.state.chain].reverse().find((link) => link.kind === "EVIDENCE_REF" && link.body.purpose === PROBE_PURPOSE
    && link.body.contextPluginSha256 === context.sha256 && link.body.contextPluginFileSha256 === context.fileSha256);
  const probe = probeLink === undefined || context === undefined ? { status: "not_run", reason: context === undefined ? "CONTEXT_PLUGIN_NOT_BUILT" : "CONTEXT_PROBE_NOT_RUN" }
    : { status: "recorded", refEventId: probeLink.body.refId, sessionId: probeLink.body.sessionId, inFrame: probeLink.body.inFrame, turnStatus: probeLink.body.turnStatus,
      snapshotEventId: probeLink.body.snapshotEventId, frame: recheckFrame(ctx, probeLink.body, context.fileSha256), claimKind: "self_reported",
      effectivePolicyReceipt: "none: the turn made no governed tool call", modelDelivery: "not_evaluated", nativeDelivery: "not_evaluated", limitation: PROBE_LIMITATION };
  const promptPack = promptPackStatus(ctx.workspace, project.agent_id);
  return {
    outputs: [
      { output: "review", label: "adapt review: the conformance statement (amc.a4-conformance-statement/v1; signed CONTROL_RESULT set; counts, never a percentage)",
        lane: "recommendation", method: null, body: { statement, resultsPath: conformance.resultsPath, verified: conformance.verified } },
      { output: "review", label: "adapt review: the active compiled plan's head against the proposal", lane: "implementation", method: null, body: head },
      { output: "review", label: "adapt review: the plan diff against this project's previous proposal", lane: "recommendation", method: null, body: renderPlanDiffMarkdown(diff) },
      { output: "review", label: `adapt review: the memory policy re-read (${MEMORY_ENFORCEMENT_NOTE})`, lane: "implementation", method: null, body: memoryPolicy },
      { output: "review", label: "adapt review: the context probe's frame row re-checked (stub provider; A4 ran the turn, so its ref is self_reported; no effective-policy receipt)",
        lane: "implementation", method: null, body: probe },
      { output: "review", label: "adapt review: the agent's prompt pack re-verified under this workspace's keys (integrity of bytes; the runtime does not load it)",
        lane: "implementation", method: null, body: promptPack }
    ],
    // Nothing in Adapt is observed: the probe's ref is self_reported (A4 ran the turn) and no runtime receipt exists for it.
    notEvaluated: ["NO_OBSERVED_REF", probeLink === undefined ? "CONTEXT_PROBE_NOT_RUN" : "PROBE_SELF_REPORTED"],
    spec: { ...spec, review: { conformance, statement, head, memoryPolicy, probe, promptPack, claimBoundary: ADAPT_CLAIM_BOUNDARY } }
  };
}
