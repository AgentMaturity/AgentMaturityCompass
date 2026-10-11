/**
 * The A4 release routes (P1-62; design §12.1, §14). POST …/releases (owner) consumes the release approval (Activate's
 * direction gate) and runs the opened a4.activate.release effect inside the request: the response carries the staging
 * lease token once; the request's replay row keeps the attempt id only, and a replay answers that attempt's outcome
 * (token: null, TOKEN_ALREADY_DELIVERED once it finished; its failure code otherwise).
 * GET …/releases and …/releases/:rid read the release records (chain-named a4_releases rows) with their A4_RECORD
 * envelope checked now, the leases' live status, the eight-surface table, the prepared plan, the receipts in two
 * columns and the rollbacks. Slice B (owner, owner mode): POST …/releases/:rid/deployments records the operator's
 * receipt, …/verify runs AMC's token-less check of the receipt's destination, and …/rollback/preview then …/rollback roll
 * the release back through its own effect gate. POST …/releases/:rid/transparency (owner) appends the package's
 * transparency entry when the release effect could not (idempotent; readiness blocks the deployment approval until then).
 */
import { dirname, join } from "node:path";
import { z } from "zod";
import { apiSuccess } from "../api/apiHelpers.js";
import { assertOwnerMode } from "../mode/mode.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { revokedLeaseIdSet } from "../leases/leaseStore.js";
import { readAndVerifyArtifactFileSignature } from "../lifecycle/artifactSignature.js";
import { sha256Hex } from "../utils/hash.js";
import { deploymentBodySchema, deploymentViews, PLAN_PATH, recordDeployment } from "./a4Deploy.js";
import { verifyBodySchema, verifyDeployment } from "./a4DeployVerify.js";
import { verifiedA4Digest } from "./a4Evidence.js";
import { loadA4State } from "./a4Gates.js";
import { bridgeControls } from "./a4Lifecycle.js";
import { regularBytes } from "./a4Package.js";
import type { A4ReadinessState } from "./a4Readiness.js";
import { previewRollback, rollbackPreviewSchema, rollbackRelease, rollbackReplay, rollbackSchema, rollbackViews } from "./a4Rollback.js";
import { a4PackageV1Schema, a4ReleaseV1Schema, clientRequestIdSchema, headSeqSchema } from "./a4Schema.js";
import type { A4Store } from "./a4Store.js";
import { packageEntry, releaseEntries } from "./a4Transparency.js";
import { UPDATE_POLICY_PATH, verifyUpdatePolicy } from "./a4UpdatePolicy.js";
import { ACTIVATE_CLAIM_BOUNDARY, cycleLinks, effectUnsettled, monitorResolves, rollbackRecorded } from "./spec/activate.js";
// Function declarations only: a4Router.ts imports this module, so nothing here may read its bindings at load time.
import { a4Fail, assertNoSecrets, assertQuery, assertVisible, callOf, mutationResult, precheck, priorReplay, readJson, unboundClaim, type A4Route } from "./a4Router.js";
import { completeAndRun } from "./a4RouterStages.js";

const releaseSchema = z.strictObject({ gateId: z.string().regex(/^a4gate_[0-9a-f]{32}$/), expectedHeadSeq: headSeqSchema, clientRequestId: clientRequestIdSchema });
const RELEASE_ACTION = /^\/releases\/(a4r_[0-9a-f]{32})\/(deployments|verify|rollback\/preview|rollback|transparency)$/;
// clientRequestId as on every A4 write; the append itself is idempotent (it reuses an entry), so a retry answers the same entry.
const transparencySchema = z.strictObject({ expectedHeadSeq: headSeqSchema, clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) });

/**
 * POST …/releases/:rid/transparency (owner, owner mode): the package's transparency entry, appended when the release
 * effect could not (packageEntry reuses an entry of this exact release and package, so it never appends twice), and
 * refused while that effect is still running (it appends itself). The log is the record; readiness reads it.
 */
async function appendReleaseEntry(route: A4Route, projectId: string, releaseId: string): Promise<true> {
  const { body } = await readJson(route, transparencySchema);
  assertOwnerMode(route.workspace, "a4 release");
  const state = precheck(route, projectId, "release", body.expectedHeadSeq);
  const release = state.chain.find((link) => link.kind === "RELEASE" && link.body.releaseId === releaseId);
  if (release === undefined) throw a4Fail(404, "A4_RELEASE_NOT_FOUND", `no release ${releaseId} on this project`);
  if (effectUnsettled(state.chain, (started) => started.executionId === release.body.executionId)) {
    throw a4Fail(409, "EFFECT_RUNNING", "The release effect is still running; it appends the entry itself.");
  }
  const entry = packageEntry(route.workspace, state.project.agent_id, releaseId, String(release.body.packageDigest));
  if (entry.entryId === null) {
    throw a4Fail(/vault locked/i.test(String(entry.reason)) ? 423 : 409, /vault locked/i.test(String(entry.reason)) ? "A4_VAULT_LOCKED" : "TRANSPARENCY_NOT_APPENDED", String(entry.reason));
  }
  apiSuccess(route.res, { projectId, ...entry, claim: unboundClaim(projectId, `releases:${releaseId}:transparency`, false) }, 201);
  return true;
}

/** POST …/releases/:rid/<action>: a replay answers what the request answered, before any check could refuse it. */
async function releaseAction(route: A4Route, projectId: string, releaseId: string, action: string): Promise<true> {
  const { store } = route;
  if (action === "transparency") return appendReleaseEntry(route, projectId, releaseId);
  if (action === "deployments") {
    const { body, request } = await readJson(route, deploymentBodySchema);
    const replay = priorReplay(store, request, projectId);
    if (replay) return (apiSuccess(route.res, replay), true);
    const done = recordDeployment(store, projectId, releaseId, { ...callOf(route, request), body });
    apiSuccess(route.res, mutationResult(done.result, { deploymentId: done.deploymentId, receiptPath: done.receiptPath, statusText: done.statusText }), 201);
    return true;
  }
  if (action === "verify") {
    const { body, request } = await readJson(route, verifyBodySchema);
    const replay = priorReplay(store, request, projectId);
    if (replay) return (apiSuccess(route.res, replay), true);
    const done = await verifyDeployment(store, projectId, releaseId, { ...callOf(route, request), body });
    apiSuccess(route.res, mutationResult(done.result, { checkId: done.checkId, amcCheckStatus: done.amcCheckStatus, statusText: done.statusText }), 201);
    return true;
  }
  if (action === "rollback/preview") {
    const { body, request } = await readJson(route, rollbackPreviewSchema);
    const replay = priorReplay(store, request, projectId);
    if (replay) return (apiSuccess(route.res, replay), true);
    const done = previewRollback(store, projectId, releaseId, { ...callOf(route, request), body });
    apiSuccess(route.res, mutationResult(done.result, { approvalRequestId: done.approvalRequestId, preview: done.preview }), 201);
    return true;
  }
  const { body, request } = await readJson(route, rollbackSchema);
  const replay = priorReplay(store, request, projectId);
  if (replay) return (apiSuccess(route.res, rollbackReplay(store, projectId, replay)), true);
  assertNoSecrets(body.reason, "The reason");
  const done = rollbackRelease(store, projectId, releaseId, { ...callOf(route, request), body });
  if (done.result.replay) return (apiSuccess(route.res, rollbackReplay(store, projectId, mutationResult(done.result))), true);
  // Lease ids and commands are answered here, never stored in the request's replay row (it keeps the attempt id).
  apiSuccess(route.res, mutationResult(done.result, { attemptId: done.attemptId, rollbackId: done.rollbackId, receiptPath: done.receiptPath,
    leaseIdsRevoked: done.leaseIdsRevoked, preparedCommands: done.preparedCommands, freezeIncidentId: done.frozen,
    deployedReleaseId: "moves when the operator records the rollback row" }), 201);
  return true;
}

export async function handleA4ReleaseRoute(route: A4Route, projectId: string, tail: string): Promise<boolean> {
  const { store } = route;
  if (tail === "/releases" && route.method === "POST") {
    assertQuery(route.params, []);
    const { body, request } = await readJson(route, releaseSchema);
    if (store.readHead(projectId) === null) throw a4Fail(404, "A4_PROJECT_NOT_FOUND", `no A4 project ${projectId}`);
    const requested = store.readChain(projectId).find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === body.gateId);
    if (requested?.body.stage !== "activate" || requested.body.gate !== "direction") {
      throw a4Fail(409, "A4_STEP_ORDER", "A release consumes Activate's direction gate (the release approval).");
    }
    return completeAndRun(route, projectId, "activate", body, request);
  }
  const action = RELEASE_ACTION.exec(tail);
  if (action !== null && route.method === "POST") {
    assertQuery(route.params, []);
    return releaseAction(route, projectId, action[1]!, action[2]!);
  }
  if (route.method !== "GET") return false;
  const read = /^\/releases\/(a4r_[0-9a-f]{32})(\/deployments)?$/.exec(tail);
  if (tail !== "/releases" && read === null) return false;
  assertQuery(route.params, []);
  const state = loadA4State(store, projectId, Date.now());
  assertVisible(route, state.members);
  const views = releaseViews(store, projectId, state);
  if (read === null) {
    apiSuccess(route.res, { projectId, releases: views.map((view) => ({ releaseId: view.releaseId, revisionNo: view.revisionNo, version: view.version,
      packageDigest: view.packageDigest, target: (view.deploymentTarget as { kind: string }).kind, previousReleaseId: view.previousReleaseId, baseReleaseId: view.baseReleaseId,
      leases: view.leases, envelopeValid: view.envelopeValid, createdAt: view.createdAt })), claim: unboundClaim(projectId, "releases", false) });
    return true;
  }
  const view = views.find((candidate) => candidate.releaseId === read[1]);
  if (view === undefined) throw a4Fail(404, "A4_RELEASE_NOT_FOUND", `no release ${read[1]!} on this project`);
  if (read[2] !== undefined) {
    apiSuccess(route.res, { projectId, releaseId: read[1], deployments: deploymentViews(store.snapshot(projectId).rows.a4_deployments, read[1]!),
      claimBoundary: view.boundary, claim: unboundClaim(projectId, `releases:${read[1]!}:deployments`, false) });
    return true;
  }
  apiSuccess(route.res, view);
  return true;
}

/**
 * A lease as GET shows it: `status` live (revoked, expired, active, or unknown when the revocation list does not verify),
 * `recordedStatus` as the signed record states it.
 */
function liveLease(lease: Record<string, unknown>, revoked: Set<string> | null, now: number): Record<string, unknown> {
  const status = revoked === null ? "unknown" : revoked.has(String(lease.leaseId)) ? "revoked" : Date.parse(String(lease.expiresAt)) <= now ? "expired" : "active";
  return { ...lease, recordedStatus: lease.status, status, ...(revoked === null ? { reasonCode: "LEASE_REVOCATIONS_UNVERIFIED" } : {}) };
}

/**
 * The package's file list from its manifest, read once and listed only when those bytes hash to the release record's
 * package digest; null with the reason otherwise.
 */
function packageFiles(bytes: Buffer | null, packageDigest: string): { files: unknown[] | null; reason: string | null } {
  if (bytes === null) return { files: null, reason: "MANIFEST_UNREADABLE" };
  if (sha256Hex(bytes) !== packageDigest) return { files: null, reason: "MANIFEST_DIGEST_MISMATCH" };
  // Bytes with the package digest are the manifest the release wrote (json(manifest)), so they parse.
  return { files: a4PackageV1Schema.parse(JSON.parse(bytes.toString("utf8"))).files, reason: null };
}

/**
 * The prepared plan as GET shows it: parsed only from bytes whose a4-deployment-plan signature verifies now and whose
 * sha256 the verified package manifest lists for deploy/plan.json; otherwise `plan: null` with the reason, so changed or
 * unsigned operator commands are never presented as AMC's (and bytes that do not parse are a reason, never a 500).
 */
function planView(plan: { valid: boolean; reason: string | null; artifactBytes: Buffer | null }, files: { files: unknown[] | null; reason: string | null }):
  { signatureValid: boolean; reason: string | null; plan: unknown } {
  const listed = (files.files as Array<{ path?: unknown; sha256?: unknown }> | null)?.find((file) => file.path === PLAN_PATH)?.sha256;
  const reason = !plan.valid || plan.artifactBytes === null ? `PLAN_SIGNATURE_INVALID: ${plan.reason ?? "not verified"}`
    : files.files === null ? `PLAN_NOT_IN_VERIFIED_MANIFEST: ${String(files.reason)}`
      : sha256Hex(plan.artifactBytes) !== listed ? "PLAN_DIGEST_MISMATCH: the plan is not the one the package manifest lists" : null;
  if (reason !== null) return { signatureValid: plan.valid, reason, plan: null };
  try {
    return { signatureValid: true, reason: null, plan: JSON.parse(plan.artifactBytes!.toString("utf8")) as unknown };
  } catch {
    return { signatureValid: true, reason: "PLAN_UNREADABLE: the signed plan does not parse", plan: null };
  }
}

/**
 * GET …/releases[/:rid]: each release record as stored (chain-named a4_releases rows), its envelope checked against the
 * stored bytes now, the leases with their live status (production from the deployment approval's effect), the package's
 * file list, the eight-surface table with a reason for every surface not evaluated (Watch's SLO digest from the newest
 * monitor ref that resolves) and the production bridge rows as they stand now. Integrity under this workspace's keys only.
 */
function releaseViews(store: A4Store, projectId: string, state: A4ReadinessState): Array<Record<string, unknown>> {
  const { chain } = state;
  const now = Date.now();
  let revoked: Set<string> | null;
  try {
    revoked = revokedLeaseIdSet(store.workspace);
  } catch {
    revoked = null;
  }
  const { rows } = store.snapshot(projectId);
  const entries = releaseEntries(store.workspace, chain);
  const outcomes: Array<Record<string, unknown>> = chain.filter((link) => link.kind === "EFFECT_FINISHED").map((link) => ({ effect: link.body.effect,
    ...(link.body.record as { lifecycle?: Record<string, unknown> } | undefined)?.lifecycle }));
  const fileOf = (path: string): Buffer | null => {
    try {
      return regularBytes(join(store.workspace, path), path);
    } catch {
      return null;
    }
  };
  return rows.a4_releases.map((row) => {
    const bytes = String(row.surfaces_json);
    const envelope = JSON.parse(String(row.envelope_json ?? "null")) as SignedDigest | null;
    const record = a4ReleaseV1Schema.parse({ ...JSON.parse(bytes) as Record<string, unknown>, envelope });
    const production = chain.filter((link) => link.kind === "EFFECT_FINISHED").map((link) => (link.body.record as { lease?: Record<string, unknown> } | undefined)?.lease)
      .filter((lease): lease is Record<string, unknown> => lease?.releaseId === record.releaseId && lease.scope === "production");
    // D-21 as the deployment approval's effect recorded it: the owner's acknowledgement of the pending expert review.
    const expertReview = [...chain].reverse().map((link) => link.kind === "EFFECT_FINISHED"
      ? (link.body.record as { expertReview?: Record<string, unknown> } | undefined)?.expertReview : undefined)
      .find((entry) => entry?.releaseId === record.releaseId) ?? { status: "not_recorded", reason: "the deployment approval's effect has not run" };
    const notEvaluated = (reason: string) => ({ status: "not_evaluated", reason });
    const recordedIf = (present: boolean, reason: string) => present ? { status: "recorded", reason: null } : notEvaluated(reason);
    const { surfaces } = record;
    const deployments = deploymentViews(rows.a4_deployments, record.releaseId);
    const receipt = deployments.filter((entry) => entry.kind === "deploy").at(-1);
    const lifecycle = outcomes.filter((outcome) => outcome.releaseId === record.releaseId);
    const dir = dirname(record.packagePath);
    // Review's monitor record of this release, only while its signed file still resolves to the ref's bytes.
    const monitor = cycleLinks(chain, "EVIDENCE_REF").filter((link) => link.body.refKind === "monitor" && link.body.releaseId === record.releaseId
      && monitorResolves(state, link)).at(-1);
    const plan = readAndVerifyArtifactFileSignature({ workspace: store.workspace, path: join(store.workspace, dir, PLAN_PATH), artifactKind: "a4-deployment-plan",
      maxArtifactBytes: 1024 * 1024, maxSignatureBytes: 64 * 1024 });
    const files = packageFiles(fileOf(record.packagePath), record.packageDigest);
    // The package's transparency entry as the log reads now (the release effect appends it once RELEASE committed; POST
    // …/transparency repairs a missing one), or why none: the log unreadable, or the effect's own reason.
    const entryId = entries?.[record.releaseId] ?? null;
    const recorded = [...chain].reverse().map((link) => link.kind === "EFFECT_FINISHED"
      ? (link.body.record as { transparency?: { releaseId?: unknown; reason?: unknown } } | undefined)?.transparency : undefined)
      .find((candidate) => candidate?.releaseId === record.releaseId);
    return { ...record, transparencyEntryId: entryId,
      transparency: { reason: entryId !== null ? null : entries === null ? "TRANSPARENCY_LOG_UNREADABLE"
        : recorded === undefined ? "TRANSPARENCY_PENDING: the release effect has not finished" : typeof recorded.reason === "string" ? recorded.reason : "TRANSPARENCY_NOT_APPENDED" },
      envelopeValid: envelope !== null && envelope.digestSha256 === sha256Hex(bytes)
      && verifiedA4Digest(store.workspace, envelope.digestSha256, envelope, "A4_RECORD"),
    // Checked now under this workspace's keys, or the notary its signed trust config pins (a local audit trail): the plan, the update policy, receipts, rollbacks.
    deployPlan: planView(plan, files),
    updatePolicy: verifyUpdatePolicy(store.workspace, fileOf(`${dir}/${UPDATE_POLICY_PATH}`), fileOf(`${dir}/${UPDATE_POLICY_PATH}.sig`)),
    packageFiles: files,
    deployments, rollbacks: rollbackViews(chain, record.releaseId), lifecycleBridge: lifecycle, expertReview,
    // The recorded rollback target rolled back since: the plan's rollback steps re-pin it, so the rollback preview replaces them.
    rollbackTargetRolledBack: record.rollback.releaseId !== null && rollbackRecorded(chain, record.rollback.releaseId),
    // What the bridge to production reads now (the record's own rows were fixed at release); never typed by a person.
    lifecycleProduction: bridgeControls(state, "production", record.releaseId),
    leases: [...record.leases, ...production.map((lease) => ({ ...lease, status: "active" }))].map((lease) => liveLease(lease, revoked, now)),
    surfaceTable: [
      { surface: "score", ...recordedIf(surfaces.score.contextGraphSha256 !== null, "no context graph digest was bound"), values: surfaces.score },
      { surface: "shield", ...notEvaluated("no assurance run is linked to this release yet"), values: surfaces.shield },
      { surface: "enforce", ...recordedIf(surfaces.enforce.manifestId !== null, "no Enforce snapshot"), values: surfaces.enforce },
      { surface: "vault", status: "recorded", reason: null, values: surfaces.vault },
      { surface: "watch", ...(receipt === undefined ? notEvaluated("no deployment receipt is recorded; runtime runs stay empty until a lease-bound session observes one")
        : { status: "recorded", reason: "the operator's receipt (self_reported); runtime runs stay empty until a lease-bound session observes one" }),
      values: { ...surfaces.watch, deploymentReceiptRef: receipt === undefined ? null : String(receipt.deploymentId),
        sloReportSha256: typeof monitor?.body.sloReportSha256 === "string" ? monitor.body.sloReportSha256 : null } },
      { surface: "comply", ...recordedIf(surfaces.comply.planDigest !== null, "no compiled plan was proposed at Adapt"), values: surfaces.comply },
      { surface: "fleet", ...recordedIf(surfaces.fleet.agentConfigSha256 !== null, "no agent config digest was bound"),
        values: { ...surfaces.fleet, lifecycleTransitionId: lifecycle.filter((outcome) => outcome.advanced === true).at(-1)?.transitionId ?? null } },
      { surface: "passport", ...notEvaluated("P0-55: the token-verify path does not yet refuse unsigned verdicts; signature verified, statements not evaluated"), values: surfaces.passport }
    ], boundary: ACTIVATE_CLAIM_BOUNDARY };
  });
}
