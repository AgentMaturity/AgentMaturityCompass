/**
 * P0-55 case 15 (fourth pass, b04e00fc), reconciled with the 2026-10-31 security review of create-claim: verify-claim
 * never evaluates a claim and refuses caller-supplied secrets and keys; create-claim never signs with AMC_TRUST_SECRET
 * and states only the agent's trusted score.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { handleScoreRoute } from "../../src/api/scoreRouter.js";
import { createAgentClaim } from "../../src/score/crossAgentTrust.js";
import { initWorkspace } from "../../src/workspace.js";
import { postRoute } from "./route.js";

let root: string;
let workspace: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "amc-p055-claim-"));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterAll(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

const claim = createAgentClaim("default", "pk-hash", "ws-1", "amc-trust-default", { audience: "agent-b", amcScore: 100, amcLevel: "L5" } as never);
const verify = (body: Record<string, unknown>) => postRoute(handleScoreRoute, "/api/v1/score/trust/verify-claim", body, workspace);
const create = (body: Record<string, unknown>) => postRoute(handleScoreRoute, "/api/v1/score/trust/create-claim", body, workspace);

test("a claim signed under amc-trust-default with policy {} is not_evaluated, untrusted, no scopes", async () => {
  const out = await verify({ claim, policy: {} });
  expect(out.status).toBe(200);
  expect(out.body.data).toMatchObject({ status: "not_evaluated", trusted: false, trustLevel: "untrusted", grantedScopes: [] });
});

test.each(["sharedSecret", "publicKeyPem"])("verify-claim refuses a body carrying %s (400)", async (field) => {
  const out = await verify({ claim, policy: {}, [field]: "amc-trust-default" });
  expect(out.status).toBe(400);
  expect(out.body.error).toContain(`request field "${field}" is refused`);
});

test("create-claim with no body secret is 400 even when AMC_TRUST_SECRET is set (never signed under the server secret)", async () => {
  vi.stubEnv("AMC_TRUST_SECRET", "operator-secret");
  try {
    const out = await create({ agentId: "default", publicKeyHash: "pk-hash", issuingWorkspace: "ws-1", audience: "agent-b" });
    expect(out.status).toBe(400);
    expect(out.body.error).toMatch(/^sharedSecret is required/);
  } finally { vi.stubEnv("AMC_TRUST_SECRET", undefined); }
});

test("create-claim with a body secret but no trusted run is 409 NO_TRUSTED_RUN; a body amcScore chooses nothing", async () => {
  const out = await create({ agentId: "default", publicKeyHash: "pk-hash", issuingWorkspace: "ws-1", audience: "agent-b", sharedSecret: "s", amcScore: 100 });
  expect(out.status).toBe(409);
  expect(out.body.error).toMatch(/^NO_TRUSTED_RUN/);
});
