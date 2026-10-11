/**
 * The A4 release routes (P1-62 slice A; design §12.1, §14). POST …/releases (owner) consumes the release approval
 * (Activate's direction gate) and runs the opened a4.activate.release effect inside the request: the response carries
 * the staging lease token once, and the request's replay row keeps the projection only (token: null,
 * TOKEN_ALREADY_DELIVERED). GET …/releases and …/releases/:rid read the release records (chain-named a4_releases rows)
 * with their A4_RECORD envelope checked now, the leases' live status and the eight-surface table. Deployment plans,
 * receipts, the owner-only verify and rollback land with slice B.
 */
import { z } from "zod";
import { apiSuccess } from "../api/apiHelpers.js";
import { loadA4State } from "./a4Gates.js";
import { releaseViews } from "./a4Package.js";
// Function declarations only: a4Router.ts imports this module, so nothing here may read its bindings at load time.
import { a4Fail, assertQuery, assertVisible, readJson, unboundClaim, type A4Route } from "./a4Router.js";
import { completeAndRun } from "./a4RouterStages.js";

const releaseSchema = z.strictObject({ gateId: z.string().regex(/^a4gate_[0-9a-f]{32}$/), expectedHeadSeq: z.number().int().min(0),
  clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, "clientRequestId: 8 to 128 letters, digits, _ or -") });

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
  if (route.method !== "GET") return false;
  const releaseId = /^\/releases\/(a4r_[0-9a-f]{32})$/.exec(tail)?.[1];
  if (tail !== "/releases" && releaseId === undefined) return false;
  assertQuery(route.params, []);
  const state = loadA4State(store, projectId, Date.now());
  assertVisible(route, state.members);
  const views = releaseViews(store, projectId, state.chain);
  if (releaseId === undefined) {
    apiSuccess(route.res, { projectId, releases: views.map((view) => ({ releaseId: view.releaseId, revisionNo: view.revisionNo, version: view.version,
      packageDigest: view.packageDigest, target: (view.deploymentTarget as { kind: string }).kind, previousReleaseId: view.previousReleaseId, baseReleaseId: view.baseReleaseId,
      leases: view.leases, envelopeValid: view.envelopeValid, createdAt: view.createdAt })), claim: unboundClaim(projectId, "releases", false) });
    return true;
  }
  const view = views.find((candidate) => candidate.releaseId === releaseId);
  if (view === undefined) throw a4Fail(404, "A4_RELEASE_NOT_FOUND", `no release ${releaseId} on this project`);
  apiSuccess(route.res, view);
  return true;
}
