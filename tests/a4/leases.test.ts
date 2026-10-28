/**
 * P2-35 lease fixtures (design §10.4, §18 "Leases are split"): the release effect mints only a narrowed staging lease
 * (WRITE_LOW at most, the staging routes, ≤ 24 h, workOrderId = releaseId) and no production lease; a DENY of the
 * deployment approval revokes the staging lease; the production lease is minted by the deployment approval's effect;
 * each token is answered once (a replay answers token: null) and no token is persisted in a4_requests.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { openA4Store } from "../../src/a4/a4Store.js";
import { revokedLeaseIdSet } from "../../src/leases/leaseStore.js";
import { verifyLeaseToken } from "../../src/leases/leaseVerifier.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { a4, requestId } from "./a4Harness.js";
import { Journey } from "./a4Journey.js";

vi.mock("../../src/catalog/admission/gate.js", async (original) => (await import("./thinCatalog.js")).thinCatalog(original));
vi.setConfig({ testTimeout: 300_000 });
afterEach(() => cleanupGovernanceFixtures());

type Payload = { leaseId: string; workOrderId: string; executeActionClasses: string[]; routeAllowlist: string[]; scopes: string[]; issuedTs: number; expiresTs: number };
const payloadOf = (token: string): Payload => JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as Payload;
const WRITE_LOW_OR_BELOW = ["READ_ONLY", "WRITE_LOW"];

async function journeyAtRelease() {
  const j = await Journey.start();
  await j.toActivate();
  return j;
}
function lease(j: Journey, agentId: string) {
  return (token: string, routePath?: string) => verifyLeaseToken({ workspace: j.t.workspace, token, expectedAgentId: agentId, revokedLeaseIds: revokedLeaseIdSet(j.t.workspace),
    maxLifetimeMs: 90 * 86_400_000, ...(routePath ? { routePath } : {}) } as never);
}
function persistedResponses(workspace: string): string[] {
  const store = openA4Store(workspace);
  try {
    return (store.ledger.db.prepare("SELECT response_json FROM a4_requests").all() as Array<{ response_json: string | null }>).map((row) => row.response_json ?? "");
  } finally {
    store.close();
  }
}

describe("A4 leases", () => {
  test("the release mints one narrowed staging lease and no production lease; its token is answered once and never stored", async () => {
    const j = await journeyAtRelease();
    const rel = await j.release();
    expect(rel.reply.body.data!.production).toBeUndefined();
    const staging = payloadOf(rel.staging.token);
    expect(staging).toMatchObject({ leaseId: rel.staging.leaseId, workOrderId: rel.releaseId, routeAllowlist: ["/v1/chat"], scopes: ["gateway:llm"] });
    expect(staging.executeActionClasses.every((cls) => WRITE_LOW_OR_BELOW.includes(cls))).toBe(true);
    expect(staging.expiresTs - staging.issuedTs).toBeLessThanOrEqual(24 * 3_600_000);
    const agentId = (await j.p.get(j.t.alice)).body.data!.agentId as string;
    const check = lease(j, agentId);
    expect(check(rel.staging.token, "/v1/chat")).toMatchObject({ ok: true });
    expect(check(rel.staging.token, "/v1/admin")).toMatchObject({ ok: false });

    // The token is in no recorded response; a replay of the request answers token: null.
    expect(persistedResponses(j.t.workspace).filter((json) => json.includes(rel.staging.token) || /eyJ[A-Za-z0-9_-]{16,}\./.test(json))).toEqual([]);
    const transitions = await j.transitions();
    expect(JSON.stringify(transitions)).not.toContain(rel.staging.token);
  });

  test("a DENY of the deployment approval revokes the staging lease", async () => {
    const j = await journeyAtRelease();
    const rel = await j.release();
    const agentId = (await j.p.get(j.t.alice)).body.data!.agentId as string;
    const check = lease(j, agentId);
    expect((await j.deploy(rel.releaseId, { packageDigest: rel.packageDigest, leaseIds: [rel.staging.leaseId] })).status).toBe(201);
    await j.verify(rel.releaseId);
    await j.reviewActivate();
    const denied = await j.p.openGate(j.t.alice, "activate", "completion");
    const deny = await j.p.decide(j.t.bob, denied, "deny");
    expect(deny.status).toBe(201);
    expect(check(rel.staging.token)).toMatchObject({ ok: false, error: "lease revoked" });
    // The denied revision takes no new deployment approval.
    expect((await j.p.post(j.t.alice, "/stages/activate/gates/completion/request")).body.code).toBe("A4_GATE_DENIED");
  });

  test("the deployment approval's effect mints the production lease, answered once", async () => {
    const j = await journeyAtRelease();
    const rel = await j.release();
    const agentId = (await j.p.get(j.t.alice)).body.data!.agentId as string;
    const check = lease(j, agentId);
    expect((await j.deploy(rel.releaseId, { packageDigest: rel.packageDigest, leaseIds: [rel.staging.leaseId] })).status).toBe(201);
    await j.verify(rel.releaseId);
    await j.reviewActivate();
    const approval = await j.approve("activate", "completion");
    const id = requestId();
    const path = `${j.p.path}/stages/activate/complete`;
    await j.p.sync();
    const first = await a4(j.t.workspace, j.t.alice, "POST", path, { gateId: approval.gateId, expectedHeadSeq: j.p.head, clientRequestId: id });
    expect(first.status).toBe(200);
    const production = first.body.data!.production as { leaseId: string; token: string; scope: string };
    expect(production.scope).toBe("production");
    expect(payloadOf(production.token)).toMatchObject({ leaseId: production.leaseId, routeAllowlist: ["/v1/chat"] });
    expect(check(production.token, "/v1/chat")).toMatchObject({ ok: true });
    const replay = await a4(j.t.workspace, j.t.alice, "POST", path, { gateId: approval.gateId, expectedHeadSeq: j.p.head, clientRequestId: id });
    expect(replay.body.data).toMatchObject({ replay: true });
    expect(JSON.stringify(replay.body)).not.toContain(production.token);
    expect(persistedResponses(j.t.workspace).some((json) => json.includes(production.token))).toBe(false);

    // A DENY after the approval was consumed is refused and revokes nothing.
    const late = await j.p.decide(j.t.bob, approval, "deny");
    expect(late.body.code).toBe("A4_GATE_STALE");
    expect(check(production.token, "/v1/chat")).toMatchObject({ ok: true });

    // Review's monitor ref is the operator's self-reported record, never the observed lane.
    const monitors = (await j.transitions()).filter((link) => link.kind === "EVIDENCE_REF" && link.body.refKind === "monitor");
    expect(monitors.length).toBeGreaterThan(0);
    for (const monitor of monitors) expect(monitor.body.lane).not.toBe("observed");
  });
});
