/**
 * Security review (P2-26 x P2-23): a kill seen at intent time must not skip lifecycle admission. If the kill is released
 * before the authorization stage, a suspended agent's unbound call is still denied.
 */
import "../../src/lifecycle/reassessment.js";
import { afterEach, expect, test, vi } from "vitest";
import type { CompiledPlan } from "../../src/catalog/compiler/types.js";
import { lifecycleView, suspendAgent } from "../../src/lifecycle/governanceLifecycle.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../src/tools/toolRegistry.js";
import { cleanupGovernanceFixtures, governanceFixture } from "../governor/governanceFixture.js";
import { activate, AGENT, ownerActor, planView } from "../lifecycle/lifecycleFixture.js";

// The kill is seen once (the intent check) and released before the authorization stage reads it again.
const kill = vi.hoisted(() => ({ remaining: 0 }));
vi.mock("../../src/runtime/killSwitch.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/runtime/killSwitch.js")>();
  return { ...original, killSwitchDenial: (...args: Parameters<typeof original.killSwitchDenial>) =>
    kill.remaining-- > 0 ? "kill_switch_active: kill_fixture (agent:default, stop_all)" : original.killSwitchDenial(...args) };
});
// The plan transitions read: a monthly review duty on mandatory L0-CHG-01, so a review can be overdue.
const active = vi.hoisted(() => ({ plan: null as unknown }));
vi.mock("../../src/catalog/compiler/activate.js", async (original) => ({
  ...(await original<typeof import("../../src/catalog/compiler/activate.js")>()), activeControlPlan: () => active.plan
}));
vi.setConfig({ testTimeout: 60_000 });
afterEach(() => {
  vi.useRealTimers();
  active.plan = null;
  cleanupGovernanceFixtures();
});

test("a suspended agent's unbound call is denied even when the kill it saw is released before authorization", async () => {
  const { workspace } = governanceFixture();
  await activate(workspace, ownerActor(workspace));
  suspendAgent(workspace, { agentId: AGENT, reason: "incident" });
  const effects: string[] = [];
  const registry = new ToolRegistry();
  registry.define(defineTool({ name: "fixture.write", description: "fixture", actionClass: "WRITE_LOW", body: () => { effects.push("write"); return { ok: true, output: "written" }; } }));
  kill.remaining = 1;
  const outcome = await new ToolPipeline({ registry, workspace }).execute({ name: "fixture.write", agentId: AGENT, arguments: {}, requestedMode: "EXECUTE" });
  expect(outcome.denied).not.toBeNull();
  expect(effects).toEqual([]);
});

test("a kill seen at intent is the one reason reported, and lifecycle admission still runs (an overdue review suspends)", async () => {
  const { workspace } = governanceFixture();
  const duty = { controlId: "L0-CHG-01", duty: "review", ownerRole: "owner", cadence: "monthly", evidenceOfPerformance: "record" };
  active.plan = { digest: `sha256:${"7".repeat(64)}`, requirements: planView().plan.requirements,
    evidencePlan: { tests: [], evidenceRequests: [], releaseGates: [], manualDuties: [duty] } } as unknown as CompiledPlan;
  await activate(workspace, ownerActor(workspace));
  expect(lifecycleView(workspace, AGENT).state).toBe("active");
  const registry = new ToolRegistry();
  registry.define(defineTool({ name: "fixture.write", description: "fixture", actionClass: "WRITE_LOW", body: () => ({ ok: true, output: "written" }) }));
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 31 * 86_400_000 });
  kill.remaining = 2;
  const outcome = await new ToolPipeline({ registry, workspace }).execute({ name: "fixture.write", agentId: AGENT, arguments: {}, requestedMode: "EXECUTE" });
  expect(outcome.denied?.reason).toContain("kill_switch_active");
  expect(outcome.denied?.reason).not.toContain("agent_not_active");
  expect(lifecycleView(workspace, AGENT)).toMatchObject({ state: "suspended", reason: "review_expired" });
});
