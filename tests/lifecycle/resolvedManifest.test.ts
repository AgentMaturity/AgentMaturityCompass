/**
 * P2-23 security review: the session manifest is built from what the session resolved (the composed tool surface, the
 * verified signed tools config, the active plan), never from a caller's declared pins. A declared tools pin that differs
 * from the resolved config cannot stand in for it: the surface refuses to list its tools, the tools digest is null, and
 * the change suspends the agent for reassessment. The active plan is a typed stand-in carrying L0-CHG-01 (module mock).
 */
// First: activate.js and the lifecycle modules form an import cycle, so the lifecycle module must load the mocked plan reader.
import "../../src/lifecycle/reassessment.js";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openAgentSession } from "../../src/agent/agentSession.js";
import { credentialRef } from "../../src/credentials/credentialRef.js";
import { lifecycleView, requestTransitionApproval, transitionAgent } from "../../src/lifecycle/governanceLifecycle.js";
import { applyOwnerTransition, listReassessments } from "../../src/lifecycle/reassessment.js";
import { AdapterRegistry } from "../../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../../src/llm/adapter/llmRuntime.js";
import { loadVerifiedToolsConfigSnapshot } from "../../src/toolhub/toolhubValidators.js";
import { AUDITOR, cleanupGovernanceFixtures, decideBound, governanceFixture, OWNER } from "../governor/governanceFixture.js";
import { FixedCredentials, LOOP_MODEL, LOOP_PROVIDER, scriptedAdapter, silentTransport, textStep } from "../helpers/agentLoopHarness.js";
import { AGENT, ownerActor } from "./lifecycleFixture.js";

const active = vi.hoisted(() => ({ plan: null as unknown }));
vi.mock("../../src/catalog/compiler/activate.js", async (original) => ({
  ...(await original<typeof import("../../src/catalog/compiler/activate.js")>()), activeControlPlan: () => active.plan
}));

afterEach(() => {
  active.plan = null;
  cleanupGovernanceFixtures();
});

function openSession(workspace: string, expectedToolsDigest?: string) {
  const registry = new AdapterRegistry();
  registry.register({ providerId: LOOP_PROVIDER, adapter: scriptedAdapter([textStep("ok")]), baseUrl: "https://api.anthropic.invalid",
    credentialRef: credentialRef("AMC_LOOP_TEST_KEY"), models: [LOOP_MODEL] });
  return openAgentSession({ workspace, agentId: AGENT, tools: "workspace", ...(expectedToolsDigest === undefined ? {} : { expectedToolsDigest }),
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: {} },
    makeLlm: (session) => new LlmRuntime({ session, credentials: new FixedCredentials(), registry, transport: silentTransport }),
    systemPrompt: "Fixture prompt.", harnessVersion: "1.2.0", compositionDigest: "composition-a", policyDigest: "caller-declared-policy" });
}

describe("the session manifest is the resolved one (P2-23)", () => {
  test("a declared tools pin that differs from the resolved config is not the manifest: the agent is suspended for reassessment", async () => {
    const { workspace } = governanceFixture();
    active.plan = { digest: `sha256:${"5".repeat(64)}`, profile: {}, runtimePolicy: { policyDigest: `sha256:${"6".repeat(64)}` },
      requirements: [{ controlId: "L0-CHG-01", applicability: "applicable", mandatory: true }],
      evidencePlan: { tests: [], evidenceRequests: [], manualDuties: [], releaseGates: [] } };
    const actor = ownerActor(workspace);
    transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor });
    openSession(workspace).close();
    const observed = lifecycleView(workspace, AGENT).observedManifest!;
    // Resolved, not declared: the plan's policy digest, never the session's own `policyDigest` argument.
    expect(observed).toMatchObject({ policyDigest: `sha256:${"6".repeat(64)}`, compiledPlanDigest: `sha256:${"5".repeat(64)}` });
    expect(observed.toolsDigest).toMatch(/^[0-9a-f]{64}$/);
    const { approval } = await requestTransitionApproval({ workspace, agentId: AGENT, to: "approved", actor });
    decideBound(workspace, approval, [OWNER, AUDITOR]);
    applyOwnerTransition({ workspace, agentId: AGENT, to: "approved", actor, approvalId: approval.approvalRequestId });
    transitionAgent({ workspace, agentId: AGENT, to: "active", actor });

    // A pin equal to the resolved config changes nothing: the manifest is the resolved surface either way.
    openSession(workspace, loadVerifiedToolsConfigSnapshot(workspace).digestSha256!).close();
    expect(lifecycleView(workspace, AGENT).state).toBe("active");
    expect(listReassessments(workspace, AGENT)).toEqual([]);

    // A pin that differs: the surface refuses to list its tools, the tools digest is null, and the agent is suspended.
    openSession(workspace, "0".repeat(64)).close();
    expect(lifecycleView(workspace, AGENT)).toMatchObject({ state: "suspended", reason: "reassessment_required" });
    expect(lifecycleView(workspace, AGENT).observedManifest?.toolsDigest).toBeNull();
    expect(listReassessments(workspace, AGENT)).toEqual([expect.objectContaining({ trigger: "invalidated_by", changed: ["tool"], invalidatedControls: ["L0-CHG-01"] })]);
  });

  test("a workspace tools config that does not verify gives a null tools digest (unpinned, fail closed)", () => {
    const { workspace } = governanceFixture();
    const actor = ownerActor(workspace);
    transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor });
    appendFileSync(join(workspace, ".amc", "tools.yaml"), "\n# edited after signing\n");
    openSession(workspace).close();
    expect(lifecycleView(workspace, AGENT).observedManifest?.toolsDigest).toBeNull();
  });
});
