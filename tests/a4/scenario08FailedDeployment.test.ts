/**
 * P2-35 · design §17 "Failed deployment". Reason codes: DEPLOYMENT_UNCHECKED, RECEIPT_NOT_SUCCEEDED, READYZ_FAILED,
 * REDIRECT_REFUSED, DESTINATION_MISMATCH, DEPLOYMENT_IDENTITY_NOT_EVALUATED. An operator's failed receipt is recorded
 * signed and self_reported, moves no deployed release, and keeps readiness WAITING. AMC's own check failing (a 503, a
 * 3xx) is recorded beside a receipt that may still read "succeeded" and BLOCKS `deployment.amc_check`, so the
 * deployment approval cannot open. A receipt naming a destination other than the release's is refused when recorded.
 * A check that passes reachability is never a release-identifying `passed`: identity stays not evaluated (P2-40).
 *
 * The reachability probe is the real `probeDestination` with its HTTP fetch replaced (no socket opens); the release
 * destination is a public IPv4 literal so the egress check needs no DNS.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { probeDestination, verifyDeployment } from "../../src/a4/a4DeployVerify.js";
import { openA4Store } from "../../src/a4/a4Store.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { refusal, requestId } from "./a4Harness.js";
import { ACTIVATE_ANSWERS, Journey } from "./a4Journey.js";

vi.mock("../../src/catalog/admission/gate.js", async (original) => (await import("./thinCatalog.js")).thinCatalog(original));
vi.setConfig({ testTimeout: 300_000 });
afterEach(() => cleanupGovernanceFixtures());

const HOST = "8.8.8.8:443";
type Fetch = Parameters<typeof probeDestination>[3];
const answer = (status: number, body: unknown) => ({ status, body: Buffer.from(JSON.stringify(body)) });
const READY = answer(200, { status: "READY", reasons: [], checks: {}, ts: 1 });
const HEALTHY = answer(200, { status: "ok", version: "1.2.0", uptime: 5, dbStatus: "ok" });
/** A destination that answers `readyz` and `healthz` as given; nothing leaves the process. */
const destination = (readyz: Awaited<ReturnType<NonNullable<Fetch>>>, healthz = HEALTHY): NonNullable<Fetch> =>
  async (_host, _port, _address, path) => path === "/readyz" ? readyz : healthz;

async function released() {
  const j = await Journey.start();
  await j.toActivate();
  const release = await j.release({ ...ACTIVATE_ANSWERS, destinationRef: HOST });
  return { j, release, receipt: { packageDigest: release.packageDigest, leaseIds: [release.staging.leaseId] } };
}

async function verify(j: Journey, releaseId: string, fetch: NonNullable<Fetch>) {
  const store = openA4Store(j.t.workspace);
  try {
    await j.p.sync();
    return await verifyDeployment(store, j.p.projectId, releaseId, { ...j.call(j.t.alice, requestId()),
      body: { environment: "staging", expectedHeadSeq: j.p.head, clientRequestId: requestId() } }, (workspace, ref, egress) => probeDestination(workspace, ref, egress, fetch));
  } finally {
    store.close();
    await j.p.sync();
  }
}

describe("scenario: failed deployment", () => {
  test("a failed receipt is recorded, moves nothing, and leaves the check unevaluated; a 503 then blocks the approval", async () => {
    const { j, release, receipt } = await released();
    // A receipt for another package is refused.
    expect(refusal(await j.deploy(release.releaseId, { ...receipt, packageDigest: "f".repeat(64) }, { destinationRef: HOST }))).toEqual([409, "PACKAGE_DIGEST_MISMATCH"]);
    const failed = await j.deploy(release.releaseId, receipt, { destinationRef: HOST, operatorStated: { status: "failed" } });
    expect(failed.status).toBe(201);
    expect(failed.body.data).toMatchObject({ kind: "DEPLOYMENT", statusText: "recorded: failed; AMC check: not evaluated" });
    expect((await j.p.get(j.t.alice)).body.data).toMatchObject({ deployedReleaseId: null });
    expect((await j.item("deployment.receipt"))?.reasonCodes).toEqual(expect.arrayContaining(["RECEIPT_NOT_SUCCEEDED", "RECORDED_STATUS:failed"]));
    expect((await j.item("deployment.amc_check"))?.reasonCodes).toEqual(expect.arrayContaining(["DEPLOYMENT_UNCHECKED", "CHECK:none"]));

    const checked = await verify(j, release.releaseId, destination(answer(503, { status: "NOT_READY", reasons: ["db"], checks: {}, ts: 1 })));
    expect(checked).toMatchObject({ amcCheckStatus: "failed", statusText: "recorded: failed; AMC check: failed (READYZ_FAILED)" });
    expect(await j.item("deployment.amc_check")).toMatchObject({ status: "BLOCKED" });
    expect(refusal(await j.p.post(j.t.alice, "/stages/activate/gates/completion/request"))).toEqual([409, "A4_NOT_READY"]);
  });

  test("operator succeeded, AMC failed is representable: a 3xx is refused and blocks; a receipt for another host is refused", async () => {
    const { j, release, receipt } = await released();
    expect((await j.deploy(release.releaseId, receipt, { destinationRef: HOST })).status).toBe(201);
    let probed = 0;
    const redirect: NonNullable<Fetch> = async () => { probed += 1; return { error: "REDIRECT_REFUSED" }; };
    const checked = await verify(j, release.releaseId, redirect);
    expect(probed).toBeGreaterThan(0);
    expect(checked).toMatchObject({ amcCheckStatus: "failed", statusText: "recorded: succeeded; AMC check: failed (REDIRECT_REFUSED)" });
    const blocked = await j.item("deployment.amc_check");
    expect(blocked?.status).toBe("BLOCKED");
    expect(blocked?.reasonCodes).toContain("REDIRECT_REFUSED");

    // A receipt naming a host other than the one the release was packaged for is refused at record time, so no check can
    // ever probe it (verify re-checks the pair and fails DESTINATION_MISMATCH unprobed).
    expect(refusal(await j.deploy(release.releaseId, receipt, { destinationRef: "203.0.113.9:443" }))).toEqual([409, "DESTINATION_MISMATCH"]);
  });

  test("a reachable destination is never a release-identifying pass: identity checks stay not evaluated", async () => {
    const { j, release, receipt } = await released();
    expect((await j.deploy(release.releaseId, receipt, { destinationRef: HOST })).status).toBe(201);
    const checked = await verify(j, release.releaseId, destination(READY));
    expect(checked.amcCheckStatus).toBe("reachable");
    expect(checked.statusText).toBe("recorded: succeeded; AMC check: reachable, release identity not evaluated at the destination (P2-40)");
    const store = openA4Store(j.t.workspace);
    try {
      const row = store.ledger.db.prepare("SELECT * FROM a4_deployments WHERE project_id = ? AND kind = 'verify' ORDER BY rowid DESC LIMIT 1")
        .get(j.p.projectId) as Record<string, unknown>;
      expect(row.amc_check_status).toBe("reachable");
      expect(row.amc_check_status).not.toBe("passed");
      expect(JSON.stringify(row)).toContain("DEPLOYMENT_IDENTITY_NOT_EVALUATED");
    } finally {
      store.close();
    }
    expect((await j.item("deployment.amc_check"))?.status).not.toBe("BLOCKED");
  });
});
