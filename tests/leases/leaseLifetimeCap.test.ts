import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { decideApprovalForIntent } from "../../src/approvals/approvalEngine.js";
import { activateControlPlan } from "../../src/catalog/compiler/activate.js";
import { compilePlan, parseDeploymentProfile } from "../../src/catalog/compiler/compile.js";
import { signPlan } from "../../src/catalog/compiler/sign.js";
import { verifyBridgeLease } from "../../src/bridge/bridgeAuth.js";
import { issueLeaseToken } from "../../src/leases/leaseSigner.js";
import type { RegulatedLeaseProfile } from "../../src/leases/regulatedProfile.js";
import { authenticateStudioAgent } from "../../src/studio/agentCredentialAuth.js";
import { catalog } from "../catalog/l0/harness.js";
import { newWorkspace } from "../catalog/l0/workspaces.js";

/**
 * P2-25 security review: the plan's lease lifetime cap applies on every verification path, not only the authorization
 * stage. verifyLeaseToken reads the cap itself when its caller passes none, and an unverifiable plan refuses every
 * lease. Two sibling paths are exercised: Studio agent authentication and the bridge.
 */
const HOUR = 3_600_000;
// The plan's cap. No shipped catalog control sets toolPipeline.maxLeaseTtlMinutes yet, so the profile is overridden.
const cap = vi.hoisted(() => ({ profile: null as RegulatedLeaseProfile | null }));
vi.mock("../../src/leases/regulatedProfile.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/leases/regulatedProfile.js")>();
  return { ...actual, regulatedLeaseProfile: (workspace: string) => cap.profile ?? actual.regulatedLeaseProfile(workspace) };
});

let workspace = "";
beforeEach(() => {
  cap.profile = null;
  workspace = newWorkspace("amc-lease-cap-");
});

const lease = (ttlMs: number) => issueLeaseToken({ workspace, agentId: "default", ttlMs, scopes: ["toolhub:intent", "gateway:llm"],
  routeAllowlist: ["/"], modelAllowlist: ["*"], maxTokensPerMinute: 10, maxRequestsPerMinute: 10, maxCostUsdPerDay: null }).token;
const studio = (token: string) => authenticateStudioAgent({ workspace, headers: { "x-amc-lease": token }, rawHeaders: ["x-amc-lease", token],
  url: new URL("http://127.0.0.1/toolhub/intent"), allowQueryCarrier: false });
const bridge = (token: string) => verifyBridgeLease({ workspace, headers: { "x-amc-lease": token },
  requestUrl: new URL("http://127.0.0.1/openai/v1/chat/completions"), routePath: "/openai", requiredScope: "gateway:llm" });

describe("the plan's lease lifetime cap on sibling verification paths", () => {
  it("refuses a lease longer than the cap in Studio agent auth and the bridge, and admits one within it", () => {
    const long = lease(HOUR), short = lease(HOUR / 4);
    expect(studio(long)).not.toBeNull();
    expect(bridge(long).ok).toBe(true);
    cap.profile = { regulated: true, maxLeaseTtlMs: HOUR / 2, verified: true };
    expect(studio(long), "Studio agent auth").toBeNull();
    expect(bridge(long), "bridge").toMatchObject({ ok: false });
    expect(studio(short)).not.toBeNull();
    expect(bridge(short).ok).toBe(true);
  });

  it("refuses every lease on both paths once the active plan's journal no longer verifies", () => {
    initApprovalPolicy(workspace);
    const token = lease(HOUR / 4);
    const profile = (catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown }).profile;
    const plan = compilePlan({ profile: parseDeploymentProfile(profile), catalog, asOf: new Date().toISOString() });
    const { signed } = signPlan({ workspace, plan, previous: null, reviewAgentId: "default" });
    const approvalId = signed.review.approvalRequestId!;
    for (const userId of ["owner-1", "owner-2"]) {
      decideApprovalForIntent({ workspace, agentId: "default", approvalId, decision: "APPROVED", mode: "EXECUTE", reason: "lease cap fixture plan review",
        userId, username: userId, userRoles: ["OWNER"] });
    }
    activateControlPlan({ workspace, signed, approvalRequestId: approvalId, reviewAgentId: "default" });
    expect(studio(token)).not.toBeNull();
    expect(bridge(token).ok).toBe(true);
    const heads = join(workspace, ".amc", "control-plan", "heads");
    for (const entry of readdirSync(heads, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())) {
      writeFileSync(join(entry.parentPath, entry.name), "{\"tampered\":true}\n");
    }
    expect(studio(token), "Studio agent auth").toBeNull();
    expect(bridge(token), "bridge").toMatchObject({ ok: false, error: expect.stringMatching(/cannot be verified/) });
  });
});
