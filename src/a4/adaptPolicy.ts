/**
 * Adapt's compiled applicability (P1-61 slice A; design §10.3): facts → DeploymentProfile → compilePlan → diff → sign →
 * engine review → activation at completion. Every fact is the member's assertion (`provenance: asserted`, source
 * `a4:<projectId>@r<n>`, the revision the answer was recorded at); an empty or "unknown" answer is null, never a guess.
 * Applicability comes from compilePlan directly (never generateComplianceReport, which carries no plan). The plan is
 * signed with signPlan (CONTROL_PLAN under this workspace's keys: a local audit trail, not portable trust), its review is
 * the engine request signPlan files when an owner opens the effect gate, and activateControlPlan consumes that grant
 * itself. Every catalog record is experimental (D-08); nothing here says a requirement is met.
 */
import { activateControlPlan, activeControlPlan, loadActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../catalog/compiler/compile.js";
import { diffPlans } from "../catalog/compiler/diff.js";
import { evaluatePredicate } from "../catalog/compiler/evaluatePredicate.js";
import { planWeakenings, signPlan } from "../catalog/compiler/sign.js";
import type { CompiledPlan, DeploymentProfile, PlanDiff, SignedPlan } from "../catalog/compiler/types.js";
import { digestOf } from "../catalog/digest.js";
import { loadCatalog, type LoadedCatalog } from "../catalog/loader.js";
import { buildCatalogLock } from "../catalog/lockfile.js";
import { loadApprovalConsumed } from "../approvals/approvalChainStore.js";
import type { ApprovalRequestInput } from "../approvals/approvalEngine.js";
import { loadVerifiedApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { getRegisterEntriesForStation } from "../compliance/regulatory/index.js";
import type { Station } from "../domains/stations.js";
import { inspectRuntimeFirewallPolicy } from "../runtime/firewall.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { pathExists } from "../utils/fs.js";
import { clockCandidates } from "./adaptClocks.js";
import type { A4GateRow, A4ReadinessState } from "./a4Readiness.js";
import type { A4Answer } from "./a4Schema.js";
import { A4StoreError } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import {
  ADAPT_SPEC_SCHEMA, ACTIVATE_PLAN_EFFECT_ID, CATALOG_EXPERIMENTAL_NOTICE, FACTS, buildOf, factAnswer, factList, factTerm, proposedPlan, type AdaptBuild,
  type AdaptFact
} from "./spec/adapt.js";

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const hexOf = (digest: string): string => digest.replace(/^sha256:/, "");

let shippedLock: string | undefined;
/**
 * digestOf the lock of the catalog this AMC ships (`plan.lockDigest`), the digest an active plan's lockfile is checked
 * against. ponytail: memoized per process; the shipped catalog changes only with an AMC upgrade, which restarts Studio.
 */
export function shippedLockDigest(): string {
  if (shippedLock !== undefined) return shippedLock;
  try {
    shippedLock = digestOf(buildCatalogLock(loadCatalog()));
  } catch {
    throw fail(409, "RESOURCE_UNREADABLE", "plan.lockDigest: the shipped catalog did not load cleanly");
  }
  return shippedLock;
}

/** The raw DeploymentProfile of these answers (parseDeploymentProfile checks it strictly). One profile id per project. */
export function profileFromAnswers(input: { projectId: string; workspaceId: string; agentId: string; answers: readonly A4Answer[] }): unknown {
  const fact = (name: AdaptFact) => {
    const answer = factAnswer(input.answers, name);
    const value = FACTS[name] === "list" ? factList(answer?.value) : factTerm(answer?.value);
    return { value, provenance: "asserted", source: `a4:${input.projectId}${answer === undefined ? "" : `@r${answer.answeredAtRevision}`}`, reviewedBy: null };
  };
  return {
    profileVersion: 1, profileId: `a4-${input.projectId}`,
    deployment: { tenantId: input.workspaceId, workspaceId: input.workspaceId, deploymentId: input.projectId, agentIds: [input.agentId] },
    ...Object.fromEntries((Object.keys(FACTS) as AdaptFact[]).map((name) => [name, fact(name)])),
    euRoleRecord: null, art63Record: null, operatingProfile: null, exceptions: []
  };
}

/** One reader's answer, or the error's code: a fact that cannot be read is recorded as such, never as "fine". */
function attempt<T>(read: () => T): T | { error: string } {
  try {
    return read();
  } catch (error) {
    return { error: errorCodeOf(error, "UNREADABLE") };
  }
}

/** A signed config's state: valid, missing (no file) or invalid (present and not verifying). A code only, never a path. */
function configStates(workspace: string): Record<string, { state: "valid" | "missing" | "invalid"; reason: string | null }> {
  const fileState = (read: () => { valid: boolean; path: string }) => {
    const result = attempt(read);
    return "error" in result ? { state: "invalid" as const, reason: result.error }
      : { state: result.valid ? "valid" as const : pathExists(result.path) ? "invalid" as const : "missing" as const, reason: null };
  };
  const approval = attempt(() => loadVerifiedApprovalPolicy(workspace).verdict);
  const firewall = attempt(() => inspectRuntimeFirewallPolicy(workspace).integrity);
  return {
    tools: fileState(() => verifyToolsConfigSignature(workspace)),
    approvalPolicy: typeof approval === "string" ? { state: approval === "unsigned" ? "invalid" : approval, reason: null } : { state: "invalid", reason: approval.error },
    budgets: fileState(() => verifyBudgetsConfigSignature(workspace)),
    firewall: typeof firewall === "string" ? { state: firewall === "trusted" ? "valid" : firewall === "uninitialized" ? "missing" : "invalid", reason: null }
      : { state: "invalid", reason: firewall.error }
  };
}

/**
 * What activateControlPlan would refuse for `plan` now: planWeakenings against the journal's active plan, as it runs it
 * (with no active plan, a reviewer-exception waiver still counts). A workspace has one active plan for every agent, so a
 * plan compiled for another agent drops that agent's budgets and is refused until per-agent plans exist. Throws when the
 * journal does not verify (activation would refuse too).
 */
export const activationWeakenings = (workspace: string, plan: CompiledPlan): string[] => planWeakenings(activeControlPlan(workspace), plan);

/** Per requirement: the catalog's own status of the record (verbatim) and each citation's appliesWhen, three-valued. */
function whyView(plan: CompiledPlan, profile: DeploymentProfile, catalog: LoadedCatalog) {
  return plan.requirements.map((row) => {
    const record = catalog.controls.get(row.controlId);
    return { controlId: row.controlId, version: row.controlVersion, applicability: row.applicability, mandatory: row.mandatory, support: row.support,
      reviewStatus: record?.review.status ?? "unknown", missingFacts: row.missingFacts, pulledInBy: row.pulledInBy,
      citations: (record?.citations ?? []).map((citation) => {
        const decided = citation.appliesWhen === null ? null : evaluatePredicate(citation.appliesWhen, profile);
        return { key: citation.key, instrument: citation.instrument, clause: citation.clause, jurisdiction: citation.jurisdiction, statusType: citation.statusType,
          retrieval: citation.retrieval.state, legalReview: citation.legalReview === null ? "none" : "recorded", appliesWhen: decided?.value ?? "true",
          missingFacts: decided?.missingFacts ?? [], inScope: row.citationsInScope.includes(citation.key) };
      }) };
  });
}

/**
 * Understand's facts (design §10.3): the profile and the compiled plan (or the compile refusal's code), the why-view, the
 * register entries of the stations with `verified` as recorded, the reporting-clock candidates, the signed configs'
 * states and the active compiled plan's head. The missing facts become the follow-up questions.
 */
export function understandAdapt(input: { workspace: string; projectId: string; workspaceId: string; agentId: string; answers: readonly A4Answer[]; now: number }) {
  const raw = profileFromAnswers(input);
  let profile: DeploymentProfile | null = null;
  let plan: CompiledPlan | null = null;
  let compileError: { code: string; message: string } | null = null;
  let catalog: LoadedCatalog | null = null;
  try {
    profile = parseDeploymentProfile(raw);
    catalog = loadCatalog();
    plan = compilePlan({ profile, catalog, asOf: new Date(input.now).toISOString() });
  } catch (error) {
    compileError = { code: errorCodeOf(error, "COMPILE_FAILED"), message: (error instanceof Error ? error.message : String(error)).slice(0, 500) };
  }
  const stations = (factList(factAnswer(input.answers, "stations")?.value) ?? []) as Station[];
  const jurisdictions = factList(factAnswer(input.answers, "jurisdictions")?.value);
  const register = [...new Map(stations.flatMap((station) => getRegisterEntriesForStation(station)).map((entry) => [entry.id, {
    id: entry.id, instrument: entry.instrument, jurisdiction: entry.jurisdiction, status: entry.status, bindingForce: entry.bindingForce, verified: entry.verified,
    openQuestions: entry.openQuestions.length }])).values()];
  const active = attempt(() => loadActiveCompiledPolicy(input.workspace));
  const weakens = plan === null ? [] : attempt(() => activationWeakenings(input.workspace, plan!).slice(0, 32));
  const requirements = plan !== null && profile !== null && catalog !== null ? whyView(plan, profile, catalog) : [];
  return {
    notice: CATALOG_EXPERIMENTAL_NOTICE, profile, plan, compileError,
    // A requirement's missing facts, and those that leave a citation's scope unknown: each names the question that resolves it.
    followUps: [...new Set(requirements.flatMap((row) => [...row.missingFacts, ...row.citations.flatMap((citation) => citation.missingFacts)]))].sort(),
    requirements,
    register, clocks: clockCandidates(stations, jurisdictions), configs: configStates(input.workspace),
    activePlan: active === null ? null : "error" in active ? active : { revision: active.revision, planDigest: active.planDigest, lockDigest: active.lockDigest,
      policyDigest: active.runtimePolicy.policyDigest, entrySha256: active.entrySha256 },
    // What activation would refuse against the active plan now (a list, or the journal's error code); Review checks it again.
    activationWeakenings: weakens
  };
}

/** The previous plan this project proposed (newest first, another digest), for the plan diff Propose shows; null when none. */
export function previousProposal(state: A4ReadinessState, planDigest: string): CompiledPlan | null {
  for (const row of [...state.revisions].reverse()) {
    const plan = row.stage === "adapt" ? proposedPlan(JSON.parse(row.spec_json) as Record<string, unknown>) : null;
    if (plan !== null && plan.digest !== planDigest) return plan;
  }
  return null;
}

/** The plan diff against that proposal (diffPlans); null when there is no previous one. */
export const proposalDiff = (state: A4ReadinessState, plan: CompiledPlan): PlanDiff | null => {
  const previous = previousProposal(state, plan.digest);
  return previous === null ? null : diffPlans(previous, plan);
};

/**
 * The signed plan this project put in force (an activation this project's effect finished, `activate-<digest32>`), other
 * than `planDigest`: the baseline signPlan lists weakenings against. A plan another project or the CLI activated is
 * checked by activateControlPlan itself, against the journal head, at activation.
 */
export function inForcePlan(state: A4ReadinessState, planDigest: string): SignedPlan | null {
  // The attempt's own execution id (EFFECT_STARTED's, copied onto EFFECT_FINISHED), never the consumed record's, which
  // is absent when that record could not be read after a successful activation (fail closed: the baseline stays).
  const activated = new Set(state.chain.filter((link) => link.kind === "EFFECT_FINISHED" && link.body.effect === ACTIVATE_PLAN_EFFECT_ID)
    .map((link) => String(link.body.executionId ?? "")));
  for (const row of [...state.revisions].reverse()) {
    if (row.stage !== "adapt") continue;
    const spec = JSON.parse(row.spec_json) as Record<string, unknown>;
    const plan = proposedPlan(spec);
    const build = buildOf(spec);
    if (plan === null || build === null || plan.digest === planDigest || !activated.has(`activate-${hexOf(plan.digest).slice(0, 32)}`)) continue;
    return { plan, compiledAt: build.compiledAt, diff: null, signature: build.signature as SignedPlan["signature"], review: { status: "pending", approvalRequestId: null } };
  }
  return null;
}

/**
 * Build: signs the proposed plan (CONTROL_PLAN, no engine request yet: its review is filed when an owner opens the effect
 * gate, so its minutes-long TTL runs then). A weakening against the plan this project put in force is refused
 * (POLICY_WIDENING_REFUSED, `scope_changed`); nothing here accepts one.
 */
export function signAdaptPlan(workspace: string, state: A4ReadinessState, plan: CompiledPlan): AdaptBuild {
  const previous = inForcePlan(state, plan.digest);
  const weaker = planWeakenings(previous?.plan ?? null, plan);
  if (weaker.length > 0) {
    throw fail(409, "POLICY_WIDENING_REFUSED", "The plan weakens the plan this project put in force; change the answers.",
      { reasonCodes: ["POLICY_WIDENING_REFUSED"], weakenings: weaker.slice(0, 32) });
  }
  try {
    const { signed } = signPlan({ workspace, plan, previous, allowWeakening: false });
    return { planDigest: plan.digest, signature: signed.signature, compiledAt: signed.compiledAt, previousPlanDigest: previous?.plan.digest ?? null, diff: signed.diff };
  } catch (error) {
    throw fail(409, errorCodeOf(error, "PLAN_SIGNING_FAILED"), "The plan could not be signed (the signing key, owner mode or the previous plan's signature).");
  }
}

/** The plan and its signature a gate's revision binds, its digest recomputed; 409 PLAN_NOT_BOUND otherwise. */
export function boundPlanOf(state: A4ReadinessState, gate: Pick<A4GateRow, "revision_no">): { plan: CompiledPlan; build: AdaptBuild } {
  const row = state.revisions.find((candidate) => candidate.revision_no === gate.revision_no);
  const spec = row?.stage === "adapt" ? JSON.parse(row.spec_json) as Record<string, unknown> : {};
  const plan = proposedPlan(spec);
  const build = buildOf(spec);
  if (spec.schema !== ADAPT_SPEC_SCHEMA || plan === null || build === null) throw fail(409, "PLAN_NOT_BOUND", "The gate's revision carries no signed Adapt plan.");
  const { digest, ...body } = plan;
  if (digestOf(body) !== digest) throw fail(409, "PLAN_NOT_BOUND", "The bound plan does not match its digest.");
  return { plan, build };
}

/** `activateControlPlan` consumes the review grant under this execution id (src/catalog/compiler/activate.ts). */
export const activationExecutionId = (plan: Pick<CompiledPlan, "digest">): string => `activate-${hexOf(plan.digest).slice(0, 32)}`;

/**
 * The effect gate's engine request (design §6.1): signPlan files the plan review (planReviewIntent, SECURITY, riskTier
 * high) under the project's agent, with `quorumFloor` (two distinct keys when regulated). Returns its id. A plan that
 * activateControlPlan is certain to refuse never gets a review: a blocked plan (409 PLAN_BLOCKED) or one weaker than the
 * active plan (409 PLAN_WEAKENS_ACTIVE_PLAN, read from the journal now), so no gate is consumed for an activation that fails.
 */
export function openPlanReview(input: { workspace: string; state: A4ReadinessState; gate: A4GateRow; quorumFloor: ApprovalRequestInput["quorumFloor"] }): string {
  const { plan } = boundPlanOf(input.state, input.gate);
  if (plan.status !== "ready") throw fail(409, "PLAN_BLOCKED", "Only a ready plan can be activated; resolve every mandatory requirement first.", { reasonCodes: ["PLAN_BLOCKED"] });
  let weakens: string[];
  try {
    weakens = activationWeakenings(input.workspace, plan);
  } catch (error) {
    throw fail(409, errorCodeOf(error, "COMPILED_POLICY_UNREADABLE"), "The active compiled plan does not verify, so activation would be refused; restore it first.");
  }
  if (weakens.length > 0) {
    throw fail(409, "PLAN_WEAKENS_ACTIVE_PLAN", "Activation would weaken the active plan (a workspace has one active plan for every agent); it would be refused.",
      { reasonCodes: ["PLAN_WEAKENS_ACTIVE_PLAN"], weakenings: weakens.slice(0, 32) });
  }
  const previous = inForcePlan(input.state, plan.digest);
  let id: string | null;
  try {
    id = signPlan({ workspace: input.workspace, plan, previous, allowWeakening: false, reviewAgentId: input.state.project.agent_id, quorumFloor: input.quorumFloor })
      .signed.review.approvalRequestId;
  } catch (error) {
    throw fail(409, errorCodeOf(error, "PLAN_REVIEW_REFUSED"), "The plan review could not be filed (a weakening, owner mode, the signing key or the approval policy).");
  }
  if (id === null) throw fail(409, "PLAN_REVIEW_REFUSED", "signPlan filed no review request.");
  return id;
}

/** activateControlPlan's refusals as codes (its messages name files and digests). */
function activationCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return /weakens/.test(text) ? "PLAN_WEAKENS_ACTIVE_PLAN" : /already used/.test(text) ? "GRANT_ALREADY_USED"
    : /lockfile|catalog differs/.test(text) ? "PLAN_LOCK_DRIFT" : /blocked/.test(text) ? "PLAN_BLOCKED"
      : /does not authorize/.test(text) ? "PLAN_REVIEW_NOT_APPROVED" : errorCodeOf(error, "PLAN_ACTIVATION_FAILED");
}

/**
 * The effect's executor: activateControlPlan with the bound signed plan and the effect gate's approved review. It
 * verifies the review for exactly this plan and consumes the grant itself (`activate-<digest32>`), so the runner never
 * consumes it; the consumed record's execution id is returned for EFFECT_FINISHED. A refusal before activation is a code.
 */
export function activateBoundPlan(input: { workspace: string; state: A4ReadinessState; gate: A4GateRow; approvalRequestId: string }): { consumedExecutionId?: string } {
  const agentId = input.state.project.agent_id;
  try {
    const { plan, build } = boundPlanOf(input.state, input.gate);
    activateControlPlan({ workspace: input.workspace, signed: { plan, signature: build.signature as SignedPlan["signature"], compiledAt: build.compiledAt },
      approvalRequestId: input.approvalRequestId, reviewAgentId: agentId });
  } catch (error) {
    throw new Error(error instanceof A4StoreError ? error.code : activationCode(error));
  }
  // The plan is active now: an unreadable consumed record is reported as absent, never as a failed activation.
  try {
    const consumed = loadApprovalConsumed({ workspace: input.workspace, agentId, approvalRequestId: input.approvalRequestId });
    return typeof consumed?.executionId === "string" ? { consumedExecutionId: consumed.executionId } : {};
  } catch {
    return {};
  }
}
