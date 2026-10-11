/**
 * The A4 release routes (P1-62; design §12.1, §14). POST …/releases (owner) consumes the release approval (Activate's
 * direction gate) and runs the opened a4.activate.release effect inside the request: the response carries the staging
 * lease token once; the request's replay row keeps the attempt id only, and a replay answers that attempt's outcome
 * (token: null, TOKEN_ALREADY_DELIVERED once it finished; its failure code otherwise).
 * GET …/releases and …/releases/:rid read the release records (chain-named a4_releases rows) with their A4_RECORD
 * envelope checked now, the leases' live status, the eight-surface table, the prepared plan, the receipts in two
 * columns and the rollbacks. Slice B (owner, owner mode): POST …/releases/:rid/deployments records the operator's
 * receipt, …/verify runs AMC's token-less check of the receipt's destination, and …/rollback/preview then …/rollback roll
 * the release back through its own effect gate.
 */
import { z } from "zod";
import { apiSuccess } from "../api/apiHelpers.js";
import { deploymentBodySchema, deploymentViews, recordDeployment } from "./a4Deploy.js";
import { verifyBodySchema, verifyDeployment } from "./a4DeployVerify.js";
import { loadA4State } from "./a4Gates.js";
import { releaseViews } from "./a4Package.js";
import { previewRollback, rollbackPreviewSchema, rollbackRelease, rollbackSchema } from "./a4Rollback.js";
// Function declarations only: a4Router.ts imports this module, so nothing here may read its bindings at load time.
import { a4Fail, assertNoSecrets, assertQuery, assertVisible, callOf, mutationResult, priorReplay, readJson, unboundClaim, type A4Route } from "./a4Router.js";
import { completeAndRun } from "./a4RouterStages.js";

const releaseSchema = z.strictObject({ gateId: z.string().regex(/^a4gate_[0-9a-f]{32}$/), expectedHeadSeq: z.number().int().min(0),
  clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, "clientRequestId: 8 to 128 letters, digits, _ or -") });
const RELEASE_ACTION = /^\/releases\/(a4r_[0-9a-f]{32})\/(deployments|verify|rollback\/preview|rollback)$/;

/** POST …/releases/:rid/<action>: a replay answers what the request answered, before any check could refuse it. */
async function releaseAction(route: A4Route, projectId: string, releaseId: string, action: string): Promise<true> {
  const { store } = route;
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
  if (replay) return (apiSuccess(route.res, replay), true);
  assertNoSecrets(body.reason, "The reason");
  const done = rollbackRelease(store, projectId, releaseId, { ...callOf(route, request), body });
  // Lease ids and commands are answered here, never stored in the request's replay row.
  apiSuccess(route.res, mutationResult(done.result, { rollbackId: done.rollbackId, receiptPath: done.receiptPath, leaseIdsRevoked: done.leaseIdsRevoked,
    preparedCommands: done.preparedCommands, freezeIncidentId: done.frozen, deployedReleaseId: "moves when the operator records the rollback row" }), 201);
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
