/**
 * Activate, commercialization (P1-62 slice A; design §10.4). Understand carries Adapt's deployment needs and reads what
 * a release would stand on (lifecycle stage and controls, the deploy base files, image identity, where this Studio is
 * hosted, freeze, signing routes, the DEPLOY approval rule, earlier releases); Explain renders it at three levels;
 * Propose freezes the release draft (the eight-surface table, package, lease, update, monitoring, rollback and value
 * plans) and copies the package inputs into the content-addressed store. Build is the release effect
 * (src/a4/a4Package.ts, POST …/releases); the deployment approval's effect mints the production lease. Everything A4
 * writes here is self_reported; nothing here deploys, holds a credential or reads one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { approvalRuleForAction, loadVerifiedApprovalPolicy } from "../../approvals/approvalPolicyEngine.js";
import { signingRoute } from "../../crypto/signing/signer.js";
import { activeFreezeStatus } from "../../drift/freezeEngine.js";
import { loadOpsPolicy, verifyOpsPolicySignature } from "../../ops/policy.js";
import { requiredControlsForStage } from "../../lifecycle/lifecycle.js";
import { sha256Hex } from "../../utils/hash.js";
import { explain, type A4ExplainFact, type A4ExplainLevel } from "../a4Explain.js";
import { RESOURCE_SLOTS } from "../a4Gates.js";
import { hostingNow } from "../a4Deploy.js";
import { lifecycleNow } from "../a4Lifecycle.js";
import { AMC_ROOT, captureInputs, enforceSnapshot, PRODUCTION_LEASE_EFFECT, RELEASE_EFFECT } from "../a4Package.js";
import type { A4ProducerContext, A4ProducerResult } from "../a4RouterStages.js";
import type { A4Answer, A4StageRegistry } from "../a4Schema.js";
import { A4StoreError } from "../a4Store.js";
import { errorCodeOf } from "../aspireUnderstand.js";
import {
  ACTIVATE_CLAIM_BOUNDARY, ACTIVATE_SPEC_SCHEMA, activateItems, activateSpecOf, answerGaps, CAPTURED_SLOTS, CARRIED, carriedValues, IDENTITY_NOT_EVALUATED, leasePlans,
  PRODUCTION_LEASE_EFFECT_ID, QUESTIONS, RELEASE_EFFECT_ID, understandingOf, type LeasePlan
} from "../spec/activate.js";
import { updatePolicyOf } from "../a4UpdatePolicy.js";
import { answersDigestOf, answerValues, dependencyDigest, listValue, textValue, understandingCurrent } from "../spec/aspire.js";

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);

/** Readiness items and the two effects: the release (direction gate) and the production lease (completion gate). */
export function register(registry: A4StageRegistry): void {
  registry.items.push(activateItems);
  registry.registerEffect(RELEASE_EFFECT);
  registry.registerEffect(PRODUCTION_LEASE_EFFECT);
}

/** The router's entry (src/a4/spec/activate.ts PRODUCERS). */
export async function produceActivate(step: "understand" | "explain" | "propose", ctx: A4ProducerContext): Promise<A4ProducerResult> {
  if (step === "understand") return understand(ctx);
  if (step === "explain") return explainStep(ctx);
  return propose(ctx);
}

/** Explain and Propose build on Understand's facts: 409 UNDERSTANDING_STALE unless Understand ran on these answers. */
function assertUnderstood(spec: Record<string, unknown>, answers: readonly A4Answer[]): void {
  if (!understandingCurrent(spec, answers)) {
    throw fail(409, "A4_NOT_READY", "Understand has not run on the current answers; run Understand again, then confirm it.", { reasonCodes: ["UNDERSTANDING_STALE"] });
  }
}

const orNull = <T>(read: () => T): T | null => {
  try {
    return read();
  } catch {
    return null;
  }
};
const fileSha = (path: string): string | null => orNull(() => sha256Hex(readFileSync(path)));

/**
 * Whether backups cover the A4 artefacts (design §14.5): only the ops policy's `includePaths` are backed up, and a restore
 * without `a4-projects/` orphans every blob ref. Read from a policy whose signature verifies; anything else is unverified.
 */
function backupCoverage(workspace: string): { includePaths: string[] | null; missing: string[]; reason: string | null } {
  const signed = orNull(() => verifyOpsPolicySignature(workspace).valid) === true;
  const paths = signed ? orNull(() => loadOpsPolicy(workspace).opsPolicy.backups.includePaths) : null;
  if (paths === null) return { includePaths: null, missing: ["a4-releases/", "a4-projects/"], reason: "BACKUP_POLICY_UNVERIFIED" };
  const covered = (dir: string): boolean => paths.some((path) => [".", "./", "", dir, `${dir}/`].includes(path));
  return { includePaths: paths, missing: ["a4-releases", "a4-projects"].filter((dir) => !covered(dir)).map((dir) => `${dir}/`), reason: null };
}

/** What Understand reads (design §10.4 Understand); each unreadable source is null, never "all clear". */
function understandFacts(ctx: A4ProducerContext, target: string | null): Record<string, unknown> {
  const { workspace, state } = ctx;
  const agentId = state.project.agent_id;
  const policy = orNull(() => loadVerifiedApprovalPolicy(workspace).policy);
  const rule = policy === null ? null : approvalRuleForAction(policy, "DEPLOY");
  const freeze = orNull(() => activeFreezeStatus(workspace, agentId));
  return {
    lifecycle: { currentStage: lifecycleNow(workspace, agentId).stage, requiredForStaging: requiredControlsForStage("staging"),
      requiredForProduction: requiredControlsForStage("production"), note: "A4 advances the lifecycle only through its bridge table, never by a typed control" },
    deployBase: { compose: fileSha(join(AMC_ROOT, "deploy", "compose", "docker-compose.yml")), helm: fileSha(join(AMC_ROOT, "deploy", "helm", "amc", "values.yaml")) },
    image: { digest: null, reason: "the bootstrap report records no image digest; pinning waits for D-03 and P0-14 (IMAGE_TAG_ONLY)" },
    hosting: hostingNow(),
    topology: target === "helm" ? { status: "TOPOLOGY_UNDECIDED", key: "D-03" } : { status: null, key: null },
    freeze: freeze === null ? null : { active: freeze.active, incidentIds: freeze.incidentIds },
    signing: { A4_RECORD: orNull(() => signingRoute(workspace, "A4_RECORD")), A4_PACKAGE: orNull(() => signingRoute(workspace, "A4_PACKAGE")) },
    deployRule: rule === null ? null : { requiredApprovals: rule.requiredApprovals, requireDistinctUsers: rule.requireDistinctUsers, rolesAllowed: rule.rolesAllowed },
    previousReleases: state.chain.filter((link) => link.kind === "RELEASE").map((link) => ({ releaseId: link.body.releaseId, packageDigest: link.body.packageDigest, revisionNo: link.revisionNo })),
    backup: backupCoverage(workspace),
    notEvaluated: { lastBackup: "the age of the last backup is not read here (verifyBackup needs the backup file)", value: "value readiness lands with P1-62 slice C" }
  };
}

/** Understand: the carried Adapt answers and the facts a release stands on; nothing proposes until a person confirms it. */
function understand(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, answers } = activateSpecOf(ctx.state);
  const carried = carriedValues(ctx.state);
  const revisionNo = ctx.state.project.revision_no + 1;
  const kept = answers.filter((answer) => !(CARRIED as readonly string[]).includes(answer.questionId));
  const values = answerValues(kept);
  for (const [id, value] of carried) values.set(id, value);
  const carriedAnswers: A4Answer[] = [...carried].map(([questionId, value]) => ({ questionId, value, source: "carried", answeredAtRevision: revisionNo,
    dependencyDigest: dependencyDigest([], values) }));
  // An answer given before a carried question had any value here (digested as null then) is stamped against the value carried now.
  const previous = answerValues(answers);
  const restamp = (answer: A4Answer): A4Answer => {
    const dependsOn = QUESTIONS.find((entry) => entry.id === answer.questionId)?.dependsOn ?? [];
    const firstCarry = dependsOn.some((id) => (CARRIED as readonly string[]).includes(id) && (previous.get(id) ?? null) === null);
    return firstCarry && answer.dependencyDigest === dependencyDigest(dependsOn, previous) ? { ...answer, dependencyDigest: dependencyDigest(dependsOn, values) } : answer;
  };
  const merged = [...kept.map(restamp), ...carriedAnswers].sort((a, b) => a.questionId.localeCompare(b.questionId));
  const facts = understandFacts(ctx, textValue(answerValues(merged).get("target")));
  const understanding = { answersDigest: answersDigestOf(merged), carried: [...carried.keys()], facts };
  const output = (label: string, body: unknown, lane: "implementation" | "recommendation" = "recommendation") =>
    ({ output: "understanding", label: `activate understand: ${label}`, lane, method: null, body });
  return {
    outputs: [
      output("lifecycle stage and the controls staging and production require", facts.lifecycle, "implementation"),
      output("deploy base files, image identity, topology and where this Studio runs", { deployBase: facts.deployBase, image: facts.image, topology: facts.topology,
        hosting: facts.hosting }, "implementation"),
      output("freeze, signing routes, the DEPLOY approval rule, earlier releases and backup coverage", { freeze: facts.freeze, signing: facts.signing, deployRule: facts.deployRule,
        previousReleases: facts.previousReleases, backup: facts.backup, notEvaluated: facts.notEvaluated }, "implementation")
    ],
    spec: { ...spec, answers: merged, understanding },
    response: { understanding: { answersDigest: understanding.answersDigest, carried: understanding.carried, hosting: facts.hosting } }
  };
}

/** Activate's explanation facts (design §10.4 Explain): stored once, rendered at three levels. */
function activateFacts(spec: Record<string, unknown>, answers: readonly A4Answer[]): A4ExplainFact[] {
  const facts = understandingOf(spec)?.facts ?? {};
  const values = answerValues(answers);
  const target = textValue(values.get("target")) ?? "compose or helm";
  const hosting = (facts.hosting ?? {}) as { kind?: unknown; signal?: unknown };
  const lifecycle = (facts.lifecycle ?? {}) as { currentStage?: unknown; requiredForProduction?: unknown };
  return [
    { id: "produces", sources: ["design §10.4", "docs/DEPLOYMENT.md"], dataStatus: null,
      novice: "AMC builds a signed package of this agent, prepares the files an operator runs, and records what the operator reports. AMC never deploys anything itself.",
      practitioner: `AMC writes a signed package (amc.a4-package/v1) from content-addressed inputs and records the release; the operator runs the prepared ${target} files. `
        + "Instructions are not evidence of an executed deployment: a receipt records what the operator stated.",
      expert: "a4.activate.release (DEPLOY, consumed by A4 as step 0) → package from snapshots/<manifestId>/files and a4-projects/<id>/<rev>/<sha256>, scanExtractedReleaseForSecrets PASS, "
        + "signDigestWithPolicy(A4_PACKAGE), signArtifactFile(a4-package) on the tarball, appendTransparencyEntry(a4-package), RELEASE." },
    { id: "same-host", sources: ["D-18", "P2-40"], dataStatus: null,
      novice: "In this version, deploying means restarting the hosted AMC Studio that built this agent with a pinned image. An agent built elsewhere cannot be deployed yet.",
      practitioner: `v1 is a same-host restart: the overlay restarts this hosted Studio (found: ${String(hosting.kind ?? "not hosted")}). Receipts are recordable only for an agent built here; `
        + "installing the package into another workspace is P2-40.",
      expert: `hostingNow() = ${JSON.stringify(hosting)}; deployment.same_host is BLOCKED (DEPLOYMENT_NOT_SAME_HOST, P2-40) unless it equals the target.` },
    { id: "leases", sources: ["issueLeaseToken", "design §10.4 Build"], dataStatus: null,
      novice: "AMC gives the operator a short-lived staging key when the release is built, and the production key only when the deployment is approved. Each key is shown once.",
      practitioner: "Staging lease: WRITE_LOW at most, the staging routes, 24 hours, minted inside the consumed release effect. Production lease: the answered scopes, routes and caps, "
        + "minted by the deployment approval. Tokens are answered once and never stored; a DENY of the deployment approval revokes the staging lease.",
      expert: "issueLeaseToken({ workspaceId, agentId, workOrderId: releaseId, executeActionClasses ⊆ {READ_ONLY, WRITE_LOW}, ttlMs ≤ 24 h }); a4_requests keeps the projection; a replay answers token: null, TOKEN_ALREADY_DELIVERED." },
    { id: "lifecycle", sources: ["LIFECYCLE_BRIDGE", "requiredControlsForStage"], dataStatus: null,
      novice: `The agent's lifecycle stage is ${String(lifecycle.currentStage ?? "unknown")}. AMC only moves it when A4 evidence backs each control; otherwise the control stays not evaluated.`,
      practitioner: `Production requires ${Array.isArray(lifecycle.requiredForProduction) ? lifecycle.requiredForProduction.join(", ") : "(unread)"}. rollback_plan_validated, `
        + "operator_handoff_acknowledged and monitoring_slo_enabled stay not evaluated in v1 (AMC's check reaches reachability only).",
      expert: "a4Lifecycle.advance computes controlsSatisfied from LIFECYCLE_BRIDGE only, testing → staging after RELEASE and staging → production after the deployment approval; advanceLifecycleStage is never called backwards." },
    { id: "receipts", sources: ["design §10.4 Record deployment", "D-18 option 1"], dataStatus: null,
      novice: "Each deployment has two columns: what the operator says happened, and what AMC's own check found. They are never merged.",
      practitioner: `recorded_status comes from the operator; amc_check_status is AMC's probe of the destination, reachable at best in v1: ${IDENTITY_NOT_EVALUATED}. A failed check blocks the deployment approval.`,
      expert: "amc_check_status ∈ not_evaluated | reachable | passed | failed; passed needs a release-identifying check (P2-40); verify runs through resolveAndCheck pinned to the receipt's destinationRef." },
    { id: "operate", sources: ["design §14.4", "P2-34", "P2-26"], dataStatus: null,
      novice: "Monitoring, update rules and rollback are recorded. The update policy is written down but nothing enforces it yet, and there is no kill switch in this release.",
      practitioner: "Monitoring refs are self_reported; the update policy is signed inside the package with enforcement none (P2-34); rollback restores the Enforce snapshot and revokes leases "
        + "without moving the lifecycle backwards; the kill switch is not available in this release (P2-26).",
      expert: "monitor refs: stage_output, lane implementation, one ClaimEnvelope per source folded with envelopeForAggregate; update policy enforcement: none." }
  ];
}

/** Explain: the facts once, rendered at the member's level; all three renderings are kept. */
function explainStep(ctx: A4ProducerContext): A4ProducerResult {
  const level: A4ExplainLevel = ctx.level ?? "practitioner";
  const { spec, answers } = activateSpecOf(ctx.state);
  assertUnderstood(spec, answers);
  const facts = activateFacts(spec, answers);
  const items = explain(facts, level);
  return { outputs: [{ output: "explanation", label: `activate explain at the ${level} level`, lane: "recommendation", method: null, body: { level, items } }],
    spec: { ...spec, explanation: { level, facts } }, response: { explanation: { level, items } } };
}

const leaseView = (plan: LeasePlan) => ({ scope: plan.scope, scopes: plan.scopes, executeActionClasses: plan.executeActionClasses, routeAllowlist: plan.routeAllowlist,
  modelAllowlist: plan.modelAllowlist, ttlHours: plan.ttlMs / 3_600_000, caps: { requestsPerMinute: plan.maxRequestsPerMinute, tokensPerMinute: plan.maxTokensPerMinute,
    costUsdPerDay: plan.maxCostUsdPerDay }, token: "delivered once in the effect's response; never stored" });

/**
 * Propose: the release draft from the answers and Understand's facts (no part is edited by hand; change the answers),
 * and the package inputs copied into the content-addressed store under the revision this proposal becomes.
 */
function propose(ctx: A4ProducerContext): A4ProducerResult {
  const { workspace, state } = ctx;
  const { spec, answers } = activateSpecOf(state);
  const gaps = answerGaps(answers, carriedValues(state));
  const codes = [...gaps.missing.map((id) => `ANSWER_MISSING:${id}`), ...gaps.stale.map((id) => `ANSWER_STALE:${id}`), ...gaps.invalid.map((id) => `ANSWER_INVALID:${id}`),
    ...gaps.carried];
  if (codes.length > 0) throw fail(409, "A4_NOT_READY", "Answer or confirm the listed questions before proposing.", { reasonCodes: codes });
  assertUnderstood(spec, answers);
  for (const key of Object.keys(ctx.spec ?? {})) {
    if (JSON.stringify(ctx.spec![key] ?? null) !== JSON.stringify(spec[key] ?? null)) throw fail(400, "INPUT_INVALID", `${key} is built from your answers; change the answers instead.`);
  }
  const plans = leasePlans(answers);
  if (plans === null) throw fail(409, "A4_NOT_READY", "The lease answers do not give a lease plan.", { reasonCodes: ["LEASE_PLAN_INVALID"] });
  const values = answerValues(answers);
  const project = state.project;
  let captured: Record<string, string | null>;
  try {
    captured = captureInputs(workspace, project.project_id, project.agent_id, project.revision_no + 1);
  } catch (error) {
    // A source that is a link, not a regular file, too large or unreadable is refused, never copied or guessed.
    throw fail(409, errorCodeOf(error, "INPUT_UNREADABLE"), error instanceof Error ? error.message : String(error));
  }
  const resources = RESOURCE_SLOTS["enforce.resourcesSha256"]?.(workspace, project.agent_id) ?? null;
  const snapshot = resources === null ? { error: "ENFORCE_RESOURCES_NOT_PRODUCED" } : enforceSnapshot(workspace, project.agent_id, resources);
  const previous = state.chain.filter((link) => link.kind === "RELEASE").at(-1);
  const kpis = listValue(values.get("businessOutcomes"));
  const proposal = {
    deploymentTarget: { kind: textValue(values.get("target")), sameHost: true, destinationRef: textValue(values.get("destinationRef")), hostHint: textValue(values.get("hostHint")),
      imageDigest: null, imagePin: "tag (IMAGE_TAG_ONLY until D-03 and P0-14)" },
    leases: { staging: leaseView(plans.staging), production: leaseView(plans.production) },
    updatePolicy: updatePolicyOf(answers),
    ownership: { releaseOwner: textValue(values.get("releaseOwner")), onCall: textValue(values.get("onCall")), claimKind: "self_reported" },
    access: { roles: listValue(values.get("accessRoles")), networks: listValue(values.get("accessNetworks")) },
    surfaces: { score: "context graph digest bound by the revision", shield: "assurance runs linked at Review (P1-62 slice C)", enforce: "the Enforce snapshot the bound resources digest names",
      vault: "the A4_PACKAGE signing route", watch: "the deployment receipt (self_reported) once recorded; runtime runs only when a lease-bound session observes one",
      comply: "Adapt's compiled plan and conformance statement", fleet: "agent config and typed graph digests", passport: "not evaluated until P0-55 (signature verified; statements not evaluated)" },
    packagePlan: { inputs: [...Object.values(CAPTURED_SLOTS), "resources/ (Enforce snapshot)", "plan/compiled-plan.json", "conformance/adapt.json", "update-policy.yaml", "deploy/ (the prepared overlay and plan)", "leases.json"],
      effect: RELEASE_EFFECT_ID },
    monitoringPlan: { expectations: textValue(values.get("monitoringExpectations")), slos: ["readyz", "ledger_verify", "outcome_unknown_open", "backup_age", "gateway_failures"],
      alerts: ["pod not ready", "ledger verify failure", "open outcome_unknown", "stale backup", "gateway failures", "/readyz"].map((rule) => ({ rule, status: "proposal" })),
      killSwitch: "not available in this release (P2-26)" },
    rollbackPlan: { previousReleaseId: typeof previous?.body.releaseId === "string" ? previous.body.releaseId : null, acceptance: textValue(values.get("rollbackAcceptance")),
      steps: ["a high or critical risk tier: an incident freeze first, and the project holds", "an owner previews the rollback and opens its DEPLOY engine request (a4.activate.rollback)",
        "restoreEnforceResourceSnapshot to the previous release's snapshot, confirmed by its exact manifest id", "revoke this release's leases",
        target(values) === "helm" ? "helm rollback <release> <rev> --wait" : "re-pin the previous release's overlay and docker compose up -d (never down -v)",
        "the operator records the rollback row; deployed_release_id moves then"], lifecycle: "never moved backwards" },
    valueReportingPlan: { kpis: kpis.map((kpi) => ({ kpi, evidenceSource: null, method: "not_yet_decided" })), sustainability: listValue(values.get("sustainabilityObjectives")),
      social: listValue(values.get("socialObjectives")), claimKind: "self_reported", note: "one amc.a4-value-claim/v1 per KPI per release (P1-62 slice C)" },
    completion: { effect: PRODUCTION_LEASE_EFFECT_ID, note: "the deployment approval mints the production lease, then the lifecycle bridge moves staging → production only with every production control evidenced (P2-40 for two of them)" }
  };
  return {
    outputs: [{ output: "proposal", label: "activate propose: the release draft (eight surfaces, package, lease, update, monitoring, rollback and value plans)", lane: "recommendation",
      method: null, body: proposal }],
    spec: { ...spec, schema: ACTIVATE_SPEC_SCHEMA, answersDigest: answersDigestOf(answers), proposal, claimBoundary: ACTIVATE_CLAIM_BOUNDARY,
      inputs: { captured, enforce: "error" in snapshot ? { manifestId: null, error: snapshot.error } : { manifestId: snapshot.manifestId, error: null } } },
    response: { proposal: { target: proposal.deploymentTarget.kind, inputs: { captured, enforce: "error" in snapshot ? snapshot.error : snapshot.manifestId } } }
  };
}
const target = (values: ReadonlyMap<string, unknown>): string | null => textValue(values.get("target"));
