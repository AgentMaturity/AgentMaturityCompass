/**
 * P2-23 security review: a suspended or retired agent is held for every action class at every entry point, reads
 * included; an agent not yet active (proposed) keeps its reads. ToolHub's unjournaled path (READ_ONLY) and a Pi hook
 * read decision. The active plan is a typed stand-in carrying L0-CHG-01 (module mock).
 */
// First: activate.js and the lifecycle modules form an import cycle, so the lifecycle module must load the mocked plan reader.
import "../../src/lifecycle/reassessment.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { installHookIntegration } from "../../src/adapters/hookIntegration.js";
import { evaluateProviderHookControl } from "../../src/bridge/hookControl.js";
import { handleHookControlRequest } from "../../src/bridge/hookControlRoute.js";
import { migrateLegacyAgents, suspendAgent, transitionAgent } from "../../src/lifecycle/governanceLifecycle.js";
import { ToolHubService } from "../../src/toolhub/toolhubServer.js";
import { initToolsConfig } from "../../src/toolhub/toolhubValidators.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { cleanupGovernanceFixtures } from "../governor/governanceFixture.js";
import { controlledWorkspace, fakePiPackage, piEnvelope, removeFixtureWorkspaces } from "../helpers/piHookFixtures.js";
import { ownerActor } from "./lifecycleFixture.js";

const active = vi.hoisted(() => ({ plan: null as unknown }));
vi.mock("../../src/catalog/compiler/activate.js", async (original) => ({
  ...(await original<typeof import("../../src/catalog/compiler/activate.js")>()), activeControlPlan: () => active.plan
}));
const ENFORCING = { digest: `sha256:${"5".repeat(64)}`, requirements: [{ controlId: "L0-CHG-01", applicability: "applicable", mandatory: true }],
  evidencePlan: { tests: [], evidenceRequests: [], manualDuties: [], releaseGates: [] } };

afterEach(() => {
  active.plan = null;
  cleanupGovernanceFixtures();
  removeFixtureWorkspaces();
});

type State = "suspended" | "retired" | "proposed";
const AGENT = "pi-controlled";

/** Put the agent in `state` (owner transitions from a real users.yaml login; suspension by AMC, as a kill switch would). */
function place(workspace: string, state: State): void {
  const actor = ownerActor(workspace);
  if (state === "proposed") return void transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor });
  migrateLegacyAgents(workspace, [AGENT]);
  if (state === "suspended") suspendAgent(workspace, { agentId: AGENT, reason: "incident" });
  else transitionAgent({ workspace, agentId: AGENT, to: "retired", actor, retirement: {} });
}

function workspaceWith(state: State): string {
  const workspace = controlledWorkspace(AGENT);
  initToolsConfig(workspace);
  mkdirSync(join(workspace, "workspace"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "readme.txt"), "hello");
  active.plan = ENFORCING;
  place(workspace, state);
  return workspace;
}

async function toolhubRead(workspace: string) {
  const service = new ToolHubService(workspace);
  const intent = service.createIntent({ initiator: "fixture-operator", agentId: AGENT, toolName: "fs.read", args: { path: "./workspace/readme.txt" }, requestedMode: "SIMULATE" });
  return service.executeIntent({ intentId: intent.intentId });
}

function hookRead(workspace: string) {
  const lease = { leaseId: "lease_pi_fixture", expiresTs: Date.now() + 3_600_000 };
  installHookIntegration({ workspace, provider: "pi", agentId: AGENT, mode: "control", piPackageDir: fakePiPackage("1.0.4") });
  handleHookControlRequest({ workspace, authenticatedAgentId: AGENT, provider: "pi", lease, rawInput: JSON.stringify({ hook_event_name: "session_start",
    pi: { version: "1.0.4", mode: "print", sessionId: "pi-session", extensionSha256: sha256Hex(readFileSync(resolve("dist", "adapters", "pi", "amcPiExtension.js"))) } }) });
  return evaluateProviderHookControl({ workspace, authenticatedAgentId: AGENT, provider: "pi", lease,
    rawInput: piEnvelope("read", { path: join(workspace, "workspace", "public.txt") }, { toolCallId: "read-1" }) });
}

describe("held agents are held for every action class (P2-23)", () => {
  test.each(["suspended", "retired"] as const)("ToolHub: a %s agent's READ_ONLY call is denied", async (state) => {
    const result = await toolhubRead(workspaceWith(state));
    expect(result.allowed).toBe(false);
    expect(result.result.auditType).toBe("AGENT_NOT_ACTIVE");
    expect(String(result.result.message ?? JSON.stringify(result.result))).toContain(`is ${state}`);
  });

  test("ToolHub: a proposed agent's READ_ONLY call is not held by the lifecycle", async () => {
    const result = await toolhubRead(workspaceWith("proposed"));
    expect(result.result.auditType).not.toBe("AGENT_NOT_ACTIVE");
    expect(result.allowed).toBe(true);
  });

  test.each(["suspended", "retired"] as const)("hook: a %s agent's read decision is denied", (state) => {
    const decision = hookRead(workspaceWith(state));
    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("(agent_not_active)");
    expect(decision.reason).toContain(`agent ${AGENT} is ${state}`);
  });

  test("hook: a proposed agent's read decision is allowed", () => {
    expect(hookRead(workspaceWith("proposed")).decision).toBe("allow");
  });
});
