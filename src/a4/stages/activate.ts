/**
 * Activate, commercialization (P1-62 slice A; design §10.4). Understand carries Adapt's deployment needs and reads what
 * a release would stand on (lifecycle stage and controls, the deploy base files, image identity, where this Studio is
 * hosted, freeze, signing routes, the DEPLOY approval rule, earlier releases); Explain renders it at three levels;
 * Propose freezes the release draft (the eight-surface table, package, lease, update, monitoring, rollback and value
 * plans) and copies the package inputs into the content-addressed store. Build is the release effect
 * (src/a4/a4Package.ts, POST …/releases); the deployment approval's effect mints the production lease. Everything A4
 * writes here is self_reported; nothing here deploys, holds a credential or reads one.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { approvalRuleForAction, loadVerifiedApprovalPolicy } from "../../approvals/approvalPolicyEngine.js";
import { signingRoute } from "../../crypto/signing/signer.js";
import { activeFreezeStatus } from "../../drift/freezeEngine.js";
import { loadOpsPolicy, verifyOpsPolicySignature } from "../../ops/policy.js";
import { requiredControlsForStage } from "../../lifecycle/lifecycle.js";
import { sha256Hex } from "../../utils/hash.js";
import type { A4ExplainFact, A4ExplainLevel } from "../a4Explain.js";
import { RESOURCE_SLOTS, signedA4Floor } from "../a4Gates.js";
import { hostingNow, statusText } from "../a4Deploy.js";
import { bridgeControls, lifecycleNow } from "../a4Lifecycle.js";
import { monitorRecord } from "../a4Monitor.js";
import { AMC_ROOT, captureInputs, enforceSnapshot, PRODUCTION_LEASE_EFFECT, RELEASE_EFFECT, writeReleaseRecord } from "../a4Package.js";
import { isRegulated } from "../a4Readiness.js";
import { recordReviewResults } from "../a4Value.js";
import type { A4ProducerContext, A4ProducerResult } from "../a4RouterStages.js";
import type { A4Answer, A4StageRegistry } from "../a4Schema.js";
import { errorCodeOf } from "../aspireUnderstand.js";
import {
  ACTIVATE_CLAIM_BOUNDARY, ACTIVATE_SPEC_SCHEMA, activateItems, activateSpecOf, answerGaps, CAPTURED_SLOTS, CARRIED, carriedValues, currentRelease, cycleLinks,
  IDENTITY_NOT_EVALUATED, IMAGE_TAG_ONLY_REASON, leasePlans, PRODUCTION_LEASE_EFFECT_ID, productionReleaseOf, QUESTIONS, RELEASE_EFFECT_ID, TOPOLOGY_QUALIFICATION,
  understandingOf, type LeasePlan
} from "../spec/activate.js";
import { updatePolicyOf } from "../a4UpdatePolicy.js";
import { answersDigestOf, answerValues, askGapCodes, listValue, mergeCarried, textValue } from "../spec/aspire.js";
import { assertUnderstood, explanationResult, fail } from "./common.js";

/** Readiness items and the two effects: the release (direction gate) and the production lease (completion gate). */
export function register(registry: A4StageRegistry): void {
  registry.items.push(activateItems);
  registry.registerEffect(RELEASE_EFFECT);
  registry.registerEffect(PRODUCTION_LEASE_EFFECT);
}

/** The router's entry (src/a4/spec/activate.ts PRODUCERS). */
export async function produceActivate(step: "understand" | "explain" | "propose" | "review", ctx: A4ProducerContext): Promise<A4ProducerResult> {
  return { understand, explain: explainStep, propose, review }[step](ctx);
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
    image: { digest: null, reason: `${IMAGE_TAG_ONLY_REASON} (IMAGE_TAG_ONLY)` },
    hosting: hostingNow(),
    // D-03 (C): every topology stays documented; neither target A4 prepares is qualified in CI (Helm locally only).
    topology: target === "helm" || target === "compose" ? { status: TOPOLOGY_QUALIFICATION[target].reasonCode, key: "D-03" } : { status: null, key: null },
    freeze: freeze === null ? null : { active: freeze.active, incidentIds: freeze.incidentIds },
    signing: { A4_RECORD: orNull(() => signingRoute(workspace, "A4_RECORD")), A4_PACKAGE: orNull(() => signingRoute(workspace, "A4_PACKAGE")) },
    deployRule: rule === null ? null : { requiredApprovals: rule.requiredApprovals, requireDistinctUsers: rule.requireDistinctUsers, rolesAllowed: rule.rolesAllowed },
    previousReleases: state.chain.filter((link) => link.kind === "RELEASE").map((link) => ({ releaseId: link.body.releaseId, packageDigest: link.body.packageDigest, revisionNo: link.revisionNo })),
    backup: backupCoverage(workspace),
    notEvaluated: { lastBackup: "the age of the last backup is not read here (verifyBackup needs the backup file)",
      value: "the value report runs once, at Review (createValueReport appends value events on every call); one value claim per value-contract KPI" }
  };
}

/** Understand: the carried Adapt answers and the facts a release stands on; nothing proposes until a person confirms it. */
function understand(ctx: A4ProducerContext): A4ProducerResult {
  const { spec, answers } = activateSpecOf(ctx.state);
  const carried = carriedValues(ctx.state);
  // An answer given before a carried question had any value here (digested as null then) is stamped against the value carried now.
  const merged = mergeCarried(QUESTIONS, answers, CARRIED, carried, ctx.state.project.revision_no + 1);
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
    { id: "leases", sources: ["issueLeaseForPrincipal", "P1-78", "design §10.4 Build"], dataStatus: null,
      novice: "AMC gives the operator a short-lived staging key when the release is built, and the production key only when the deployment is approved. Each key is shown once "
        + "and names the owner who released or approved it. When the active plan requires a named person for every tool call, that owner must be signed in as a local user of this workspace.",
      practitioner: "Staging lease: WRITE_LOW at most, the staging routes, 24 hours, minted inside the consumed release effect. Production lease: the answered scopes, routes and caps, "
        + "minted by the deployment approval. Tokens are answered once and never stored; a DENY of the deployment approval revokes the staging lease. Each lease names the owner "
        + "who ran its effect when they are an active users.yaml user. Under a plan whose identity-binding requires a principal (L0-IDN-01), every tool call under a lease naming "
        + "no one is refused, so the effect refuses anyone else, a workspace-router session included, with PRINCIPAL_UNRESOLVED before anything is minted (readiness item lease.principal).",
      expert: "issueLeaseForPrincipal({ workspaceId, agentId, workOrderId: releaseId, executeActionClasses ⊆ {READ_ONLY, WRITE_LOW}, ttlMs ≤ 24 h, principalKey: the effect's caller }); "
        + "resolveLeasePrincipal runs in the pre-flight beside the lease and revocation-list key reads, and again at mint; a4_requests keeps the attempt id only; a replay answers "
        + "token: null, TOKEN_ALREADY_DELIVERED once that attempt finished, its failure code otherwise." },
    { id: "lifecycle", sources: ["LIFECYCLE_BRIDGE", "requiredControlsForStage"], dataStatus: null,
      novice: `The agent's lifecycle stage is ${String(lifecycle.currentStage ?? "unknown")}. AMC only moves it when A4 evidence backs each control; otherwise the control stays not evaluated.`,
      practitioner: `Production requires ${Array.isArray(lifecycle.requiredForProduction) ? lifecycle.requiredForProduction.join(", ") : "(unread)"}. rollback_plan_validated and `
        + "operator_handoff_acknowledged stay not evaluated until P2-40 (AMC's check reaches reachability only); monitoring_slo_enabled stays not evaluated "
        + "while the SLO report is process-wide (it labels no agent).",
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
  return explanationResult("activate", spec, activateFacts(spec, answers), level);
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
  const codes = askGapCodes(answerGaps(answers, carriedValues(state)));
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
  const kpis = listValue(values.get("businessOutcomes"));
  const proposal = {
    deploymentTarget: { kind: textValue(values.get("target")), sameHost: true, destinationRef: textValue(values.get("destinationRef")), hostHint: textValue(values.get("hostHint")),
      imageDigest: null, imagePin: "tag (IMAGE_TAG_ONLY: the bootstrap report records no image digest)" },
    leases: { staging: leaseView(plans.staging), production: leaseView(plans.production) },
    updatePolicy: updatePolicyOf(answers),
    ownership: { releaseOwner: textValue(values.get("releaseOwner")), onCall: textValue(values.get("onCall")), claimKind: "self_reported" },
    access: { roles: listValue(values.get("accessRoles")), networks: listValue(values.get("accessNetworks")) },
    surfaces: { score: "context graph digest bound by the revision", shield: "no assurance run is linked to a release yet (P0-19)", enforce: "the Enforce snapshot the bound resources digest names",
      vault: "the A4_PACKAGE signing route", watch: "the deployment receipt (self_reported) once recorded; runtime runs only when a lease-bound session observes one",
      comply: "Adapt's compiled plan and conformance statement", fleet: "agent config and typed graph digests", passport: "not evaluated until P0-55 (signature verified; statements not evaluated)" },
    packagePlan: { inputs: [...Object.values(CAPTURED_SLOTS), "resources/ (Enforce snapshot)", "plan/compiled-plan.json", "conformance/adapt.json", "update-policy.yaml", "deploy/ (the prepared overlay and plan)", "leases.json"],
      effect: RELEASE_EFFECT_ID },
    monitoringPlan: { expectations: textValue(values.get("monitoringExpectations")), slos: ["readyz", "ledger_verify", "outcome_unknown_open", "backup_age", "gateway_failures"],
      alerts: ["pod not ready", "ledger verify failure", "open outcome_unknown", "stale backup", "gateway failures", "/readyz"].map((rule) => ({ rule, status: "proposal" })),
      killSwitch: "not available in this release (P2-26)" },
    // The release running in production now (as it stands at Propose; the release record fixes it when the package is built).
    rollbackPlan: { releaseId: productionReleaseOf(state.chain), acceptance: textValue(values.get("rollbackAcceptance")),
      steps: ["a high or critical risk tier: an incident freeze first, and the project holds", "an owner previews the rollback and opens its DEPLOY engine request (a4.activate.rollback)",
        "restoreEnforceResourceSnapshot to the snapshot of the release running in production when this one is built, confirmed by its exact manifest id", "revoke this release's leases",
        target(values) === "helm" ? "helm rollback <release> <rev> --wait" : "re-pin that release's overlay and docker compose up -d (never down -v)",
        "the operator records the rollback row; deployed_release_id moves then"], lifecycle: "never moved backwards" },
    valueReportingPlan: { kpis: kpis.map((kpi) => ({ kpi, evidenceSource: null, method: "not_yet_decided" })), sustainability: listValue(values.get("sustainabilityObjectives")),
      social: listValue(values.get("socialObjectives")), claimKind: "self_reported", note: "one amc.a4-value-claim/v1 per value-contract KPI per release, recorded at Review" },
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

const LIMITATIONS = [
  `AMC's check of the destination establishes reachability only: ${IDENTITY_NOT_EVALUATED}; runtime behaviour there is not evaluated.`,
  `The image is pinned by tag (IMAGE_TAG_ONLY): ${IMAGE_TAG_ONLY_REASON}.`,
  "D-03 keeps Helm, Compose, Railway and Vercel documented, and A4 v1 prepares Compose and Helm only (D-18). Neither is qualified in CI: Helm passed its qualification checks locally only, and Railway and Vercel stay unqualified.",
  "rollback_plan_validated and operator_handoff_acknowledged stay not evaluated until AMC's check can pass (P2-40), so the lifecycle stays at staging.",
  "The update policy is signed and not enforced (P2-34); the kill switch is not available in this release (P2-26).",
  "The SLO source is in-memory and unsigned: the monitor record carries it self_reported with evidence incomplete.",
  "Independently reviewed value needs an admitted external record naming the KPI and its window (P2-24, P3-21)."
];

/**
 * Review (design §10.4 Review, §14.4, §15): results are reviewed, never approved. Records the monitor record of this
 * release (signed under a4-releases/, a self_reported `monitor` ref beside the step), the deployment rows in two columns
 * and the lifecycle bridge as it stands; then, once the step committed (never on a replay or a refusal), the value report
 * runs once and the value claims and the monitor's ledger-backed sources are recorded (src/a4/a4Value.ts). Nothing at
 * the destination is observed, so `reviewed` records not_evaluated with the reason.
 */
function review(ctx: A4ProducerContext): A4ProducerResult {
  const { workspace, state } = ctx;
  const { project_id: projectId, agent_id: agentId } = state.project;
  const release = currentRelease(state.chain);
  const releaseId = typeof release?.body.releaseId === "string" ? release.body.releaseId : null;
  if (releaseId === null) throw fail(409, "A4_NOT_READY", "This Activate cycle has no release to review.", { reasonCodes: ["NO_RELEASE"] });
  let regulated = true;
  try {
    regulated = isRegulated(state, signedA4Floor(workspace));
  } catch {
    // An unverified approval policy reads regulated (fail closed).
  }
  const monitor = monitorRecord(workspace, state, releaseId, ctx.now, regulated);
  // Named by a fresh id: harmless when the step is then refused (nothing names it), as receipts are.
  const file = writeReleaseRecord(workspace, projectId, "monitors", releaseId, `a4mon_${randomBytes(16).toString("hex")}`, monitor.doc, "a4-stage-output");
  const of = (kind: string) => cycleLinks(state.chain, kind).filter((link) => link.body.releaseId === releaseId);
  const checks = of("VERIFICATION");
  const deployments = of("DEPLOYMENT").map((link) => {
    const check = checks.filter((entry) => entry.body.receiptId === link.body.deploymentId).at(-1);
    const amc = typeof check?.body.amcCheckStatus === "string" ? check.body.amcCheckStatus : "not_evaluated";
    return { deploymentId: link.body.deploymentId, kind: link.body.deploymentKind, environment: link.body.environment, target: link.body.target,
      recordedStatus: link.body.recordedStatus, amcCheckStatus: amc, statusText: statusText(String(link.body.recordedStatus), amc, (check?.body.reasonCodes as string[] | undefined) ?? []) };
  });
  const lifecycle = bridgeControls(state, "production", releaseId);
  return {
    outputs: [{ output: "review", label: "activate review: the deployment rows in two columns, the production bridge as it stands and the remaining limitations",
      lane: "implementation", method: null, body: { releaseId, deployments, lifecycle, limitations: LIMITATIONS, claimBoundary: ACTIVATE_CLAIM_BOUNDARY } }],
    refs: [{ refKind: "monitor", refId: file.path, sha256: file.sha256, note: monitor.note,
      label: `monitor record of ${releaseId}: one envelope per source, ${String(monitor.note.nonNullSources)} with a value (self_reported)` }],
    notEvaluated: ["DEPLOYMENT_IDENTITY_NOT_EVALUATED", "KEY:P2-40"],
    response: { monitor: { refId: file.path, nonNullSources: monitor.note.nonNullSources, sources: monitor.doc.sources } },
    afterCommit: () => recordReviewResults({ workspace, projectId, agentId, releaseId, revisionNo: state.project.revision_no, regulated, now: ctx.now,
      ledgerRefs: monitor.ledgerRefs })
  };
}
