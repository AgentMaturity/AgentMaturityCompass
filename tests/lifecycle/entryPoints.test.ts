/**
 * P2-23 security review: lifecycle enforcement is read from the workspace's active plan, never from a caller's context,
 * so the entry points that bind without a compiled-policy context (ToolHub's journaled dispatch, provider hooks) hold a
 * suspended agent too. The active plan is a typed stand-in carrying L0-CHG-01 (the module mock below); an unverifiable
 * plan is the real reader failing (checkpoint root inside the workspace).
 */
// First: activate.js and the lifecycle modules form an import cycle, so the lifecycle module must load the mocked plan reader.
import "../../src/lifecycle/reassessment.js";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { bindAuthorization } from "../../src/actions/authorize.js";
import { defaultApprovalPolicy, initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { defaultActionPolicy, initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import { evaluateProviderHookControl } from "../../src/bridge/hookControl.js";
import { handleHookControlRequest } from "../../src/bridge/hookControlRoute.js";
import { installHookIntegration } from "../../src/adapters/hookIntegration.js";
import { migrateLegacyAgents, suspendAgent } from "../../src/lifecycle/governanceLifecycle.js";
import { lifecycleAdmission } from "../../src/lifecycle/reassessment.js";
import { ToolhubJournal } from "../../src/toolhub/toolhubJournal.js";
import { defaultToolsConfig } from "../../src/toolhub/toolsSchema.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanupGovernanceFixtures, governanceFixture, REFUND } from "../governor/governanceFixture.js";
import { controlledWorkspace, fakePiPackage, piEnvelope, removeFixtureWorkspaces } from "../helpers/piHookFixtures.js";

const active = vi.hoisted(() => ({ plan: null as unknown }));
vi.mock("../../src/catalog/compiler/activate.js", async (original) => {
  const real = await original<typeof import("../../src/catalog/compiler/activate.js")>();
  return { ...real, activeControlPlan: (workspace: string) => active.plan === "real" ? real.activeControlPlan(workspace) : active.plan };
});

const enforcingPlan = { digest: `sha256:${"5".repeat(64)}`, evidencePlan: { tests: [], evidenceRequests: [], manualDuties: [], releaseGates: [] },
  requirements: [{ controlId: "L0-CHG-01", applicability: "applicable", mandatory: true }] };

afterEach(() => {
  active.plan = null;
  cleanupGovernanceFixtures();
  removeFixtureWorkspaces();
});

function suspended(workspace: string, agentId: string): void {
  migrateLegacyAgents(workspace, [agentId]);
  suspendAgent(workspace, { agentId, reason: "incident" });
}

describe("lifecycle enforcement comes from the workspace, at every entry point (P2-23)", () => {
  test("ToolHub's journaled dispatch denies a suspended migrated agent, and runs nothing", async () => {
    const f = governanceFixture();
    active.plan = enforcingPlan;
    suspended(f.workspace, "default");
    const run = vi.fn(async () => ({ ok: true }));
    const hub = new ToolhubJournal(f.workspace);
    try {
      const outcome = await hub.dispatch({ workspace: f.workspace, intentId: "intent-p223", agentId: "default", toolName: REFUND, actionClass: "FINANCIAL",
        args: { amount: "80.00", currency: "USD", recipient: "acme-001", resourceId: "invoice-001" }, requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
        tool: { name: REFUND, actionClass: "FINANCIAL" } as never, approvalId: null, argumentCarrierSupported: false, recheckTicket: () => true,
        recordAction: () => undefined, recordResult: () => undefined, closeEvidence: () => undefined, run });
      expect(outcome).toMatchObject({ state: "denied", reasonCode: "authorization_denied:agent_not_active" });
      expect(run).not.toHaveBeenCalled();
    } finally {
      hub.close();
    }
  });

  test("a provider hook decision (Pi write, signed WRITE_HIGH) for a suspended migrated agent is denied with the lifecycle reason", () => {
    const agentId = "pi-controlled";
    const lease = { leaseId: "lease_pi_fixture", expiresTs: Date.now() + 3_600_000 };
    const workspace = controlledWorkspace(agentId);
    const policy = defaultActionPolicy();
    for (const rule of policy.actions) Object.assign(rule, { minEffectiveQuestionLevels: {}, requireTrustTierAtLeast: "OBSERVED", requireAssurancePacks: {},
      allowExecute: true, requireExecTicket: false });
    for (const tier of Object.values(policy.riskTierDefaults)) tier.requireSandboxForExecute = false;
    initActionPolicy(workspace, policy);
    // fs.write signed as WRITE_HIGH (above the Pi mapping's WRITE_LOW floor), so the decision is consequential.
    const tools = defaultToolsConfig();
    tools.tools.allowedTools.find((tool) => tool.name === "fs.write")!.actionClass = "WRITE_HIGH";
    initToolsConfig(workspace, tools);
    const approvals = defaultApprovalPolicy();
    approvals.approvalPolicy.actionClasses.WRITE_HIGH = { requiredApprovals: 0, rolesAllowed: ["APPROVER", "OWNER"], requireDistinctUsers: false, ttlMinutes: 15 };
    initApprovalPolicy(workspace, approvals);
    installHookIntegration({ workspace, provider: "pi", agentId, mode: "control", piPackageDir: fakePiPackage("1.0.4") });
    handleHookControlRequest({ workspace, authenticatedAgentId: agentId, provider: "pi", lease, rawInput: JSON.stringify({ hook_event_name: "session_start",
      pi: { version: "1.0.4", mode: "print", sessionId: "pi-session", extensionSha256: sha256Hex(readFileSync(resolve("dist", "adapters", "pi", "amcPiExtension.js"))) } }) });
    const bash = (id: string) => evaluateProviderHookControl({ workspace, authenticatedAgentId: agentId, provider: "pi", lease,
      rawInput: piEnvelope("write", { path: join(workspace, "workspace", "output", `${id}.txt`), content: "x" }, { toolCallId: id }) });
    active.plan = enforcingPlan;
    const before = bash("before");
    suspended(workspace, agentId);
    const after = bash("after");
    expect(after.decision).toBe("deny");
    expect(after.reason).toContain("(agent_not_active)");
    expect(after.reason).toContain(`agent ${agentId} is suspended (incident)`);
    // The same call before the suspension was allowed and bound: the denial is the lifecycle's alone.
    expect(before).toMatchObject({ decision: "allow" });
  });

  test("no compiled-policy context is needed: bindAuthorization alone denies", () => {
    const f = governanceFixture();
    active.plan = enforcingPlan;
    suspended(f.workspace, "default");
    const execution = { workspace: f.workspace, token: "t", callId: "c", rootCallId: "c", parentToken: null, name: REFUND, agentId: "default",
      actionClass: "FINANCIAL" as const, arguments: { amount: "80.00", currency: "USD", recipient: "acme-001", resourceId: "invoice-001" },
      requestedMode: "EXECUTE" as const, effectiveMode: "EXECUTE" as const };
    expect(bindAuthorization(execution, {})).toMatchObject({ ok: false, failures: ["agent_not_active"] });
    expect(lifecycleAdmission(f.workspace, "default")).toMatchObject({ ok: false });
    active.plan = null;
    expect(lifecycleAdmission(f.workspace, "default")).toMatchObject({ ok: true, warning: "agent default is suspended (incident)" });
  });

  test("an active plan that cannot be verified denies a held agent (fail closed); an active agent is not affected", () => {
    const f = governanceFixture();
    suspended(f.workspace, "default");
    active.plan = "real";
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(f.workspace, "checkpoints-inside"));
    expect(lifecycleAdmission(f.workspace, "default")).toMatchObject({ ok: false, reason: expect.stringContaining("cannot be verified, so lifecycle admission fails closed") });
    expect(lifecycleAdmission(f.workspace, "never-governed")).toEqual({ ok: true, warning: null });
  });
});
