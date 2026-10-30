/**
 * P2-26 x P2-23 integration: change envelopes are consulted by P2-23's reassessment trigger at session open, an
 * out-of-envelope change for a governed agent is a lifecycle reassessment that suspends it, and an agent-scoped stop_all
 * kill suspends the agent (reason "incident") without either lifting the other.
 */
// First: activate.js and the lifecycle modules form an import cycle, so the lifecycle module must load the mocked plan reader.
import "../../src/lifecycle/reassessment.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CompiledPlan } from "../../src/catalog/compiler/types.js";
import { lifecycleView } from "../../src/lifecycle/governanceLifecycle.js";
import { lifecycleAdmission, listReassessments } from "../../src/lifecycle/reassessment.js";
import type { AgentVersionManifest } from "../../src/lifecycle/versionManifest.js";
import {
  ChangeEnvelopeBlocked, activateChangeEnvelope, admitSessionAtOpen, recordEnvelopeTestResult, requestChangeEnvelope
} from "../../src/runtime/changeEnvelope.js";
import { activateKillSwitch, killSwitchDenial, releaseKillSwitch } from "../../src/runtime/killSwitch.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { defineTool, ToolRegistry } from "../../src/tools/toolRegistry.js";
import { AUDITOR, OWNER, cleanupGovernanceFixtures, decideBound, governanceFixture, loginAs, type GovernanceFixture } from "../governor/governanceFixture.js";
import { activate, AGENT, approvedMove, manifest, ownerActor, planView } from "../lifecycle/lifecycleFixture.js";

// The plan P2-23's trigger reads (L0-CHG-01 mandatory) and the "regulated" bit P2-26 reads; each test sets them.
const active = vi.hoisted(() => ({ plan: null as unknown, regulated: true }));
vi.mock("../../src/catalog/compiler/activate.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/catalog/compiler/activate.js")>();
  return { ...original, activeControlPlan: () => active.plan, loadActiveCompiledPolicy: () => active.regulated ? { fixture: true } : null };
});
vi.setConfig({ testTimeout: 60_000 });

const NEW_PROMPT = "d".repeat(64);
let f: GovernanceFixture;
const bound = manifest();
const open = (current: AgentVersionManifest) => admitSessionAtOpen({ workspace: f.workspace, agentId: AGENT, manifest: () => current });

async function promptEnvelope(tested: AgentVersionManifest = manifest({ systemPromptSha256: NEW_PROMPT })): Promise<string> {
  const { draft, approval } = await requestChangeEnvelope(f.workspace, { sessionTokenFile: loginAs(f.workspace, "fixture-envelope-requester", ["OPERATOR"]).tokenFile,
    agentId: AGENT, baseline: bound, allowed: [{ component: "prompt", rule: "digest_in_set", values: [NEW_PROMPT], requiredTests: ["prompt-regression"] }],
    validUntil: Date.now() + 86_400_000 });
  decideBound(f.workspace, approval, [OWNER, AUDITOR]);
  const envelope = await activateChangeEnvelope(f.workspace, draft.envelopeId, approval);
  await recordEnvelopeTestResult(f.workspace, { sessionTokenFile: loginAs(f.workspace, "fixture-envelope-tester", ["AUDITOR"]).tokenFile,
    envelopeId: envelope.envelopeId, testId: "prompt-regression", passed: true, manifest: tested });
  return envelope.envelopeId;
}

beforeEach(() => {
  active.plan = null;
  active.regulated = true;
  f = governanceFixture();
});
afterEach(() => cleanupGovernanceFixtures());

describe("change envelopes inside P2-23 admission", () => {
  test("a mandatory-control change the envelope covers keeps the agent active, and the reassessment cites the envelope", async () => {
    await activate(f.workspace, ownerActor(f.workspace), bound);
    const envelopeId = await promptEnvelope();
    active.plan = planView().plan as unknown as CompiledPlan;
    expect(open(manifest({ systemPromptSha256: NEW_PROMPT })).state).toBe("active");
    expect(listReassessments(f.workspace, AGENT)).toEqual([expect.objectContaining({ trigger: "invalidated_by", changed: ["prompt"], status: "passed",
      envelopeId, invalidatedControls: ["L0-CHG-01"] })]);
  });

  test("a change with a kind the envelope does not pin (deployment) is not covered, even when the envelope admits the rest", async () => {
    await activate(f.workspace, ownerActor(f.workspace), bound);
    const live = manifest({ systemPromptSha256: NEW_PROMPT, harnessVersion: "9.9.9" });
    // The envelope admits the prompt change with passing tests for exactly this manifest; it pins no deployment.
    await promptEnvelope(live);
    active.plan = planView().plan as unknown as CompiledPlan;
    expect(open(live)).toMatchObject({ state: "suspended", reason: "reassessment_required" });
    expect(listReassessments(f.workspace, AGENT)).toEqual([expect.objectContaining({ changed: ["prompt", "deployment"], status: "open", envelopeId: null })]);
  });

  test("an out-of-envelope change: P2-23 suspends, the envelope blocks the session, and one reassessment is recorded", async () => {
    await activate(f.workspace, ownerActor(f.workspace), bound);
    await promptEnvelope();
    active.plan = planView().plan as unknown as CompiledPlan;
    expect(() => open(manifest({ systemPromptSha256: "e".repeat(64) }))).toThrow(ChangeEnvelopeBlocked);
    expect(lifecycleView(f.workspace, AGENT)).toMatchObject({ state: "suspended", reason: "reassessment_required" });
    expect(listReassessments(f.workspace, AGENT)).toEqual([expect.objectContaining({ status: "open", envelopeId: null, changed: ["prompt"] })]);
  });

  test("an envelope block with no mandatory control invalidated is still a P2-23 reassessment and suspension", async () => {
    await activate(f.workspace, ownerActor(f.workspace), bound);
    const envelopeId = await promptEnvelope();
    expect(() => open(manifest({ systemPromptSha256: "e".repeat(64) }))).toThrow(ChangeEnvelopeBlocked);
    expect(lifecycleView(f.workspace, AGENT)).toMatchObject({ state: "suspended", reason: "reassessment_required" });
    const records = listReassessments(f.workspace, AGENT).filter((row) => row.envelopeId === envelopeId);
    expect(records).toEqual([expect.objectContaining({ trigger: "invalidated_by", status: "open", changed: ["prompt"] })]);
  });

  test("an unregulated warning records an open advisory reassessment and leaves the agent active", async () => {
    await activate(f.workspace, ownerActor(f.workspace), bound);
    const envelopeId = await promptEnvelope();
    active.regulated = false;
    expect(open(manifest({ systemPromptSha256: "e".repeat(64) })).state).toBe("active");
    open(manifest({ systemPromptSha256: "e".repeat(64) }));
    expect(listReassessments(f.workspace, AGENT).filter((row) => row.envelopeId === envelopeId)).toEqual([expect.objectContaining({ status: "open" })]);
  });

  test("an ungoverned agent is blocked by its envelope but not enrolled in lifecycle", async () => {
    await promptEnvelope();
    expect(() => open(manifest({ systemPromptSha256: "e".repeat(64) }))).toThrow(ChangeEnvelopeBlocked);
    expect(lifecycleView(f.workspace, AGENT).implicit).toBe(true);
  });
});

describe("kill switch and lifecycle", () => {
  const kill = (mode: "stop_all" | "stop_new_effects") => activateKillSwitch({ workspace: f.workspace, issuedBy: "owner-1", scope: { kind: "agent", id: AGENT },
    mode, reason: "incident drill", incidentId: "inc-1" });
  const lowWrite = async (): Promise<unknown> => {
    const registry = new ToolRegistry();
    registry.define(defineTool({ name: "fixture.write", description: "fixture", actionClass: "WRITE_LOW", body: () => ({ ok: true, output: "written" }) }));
    return (await new ToolPipeline({ registry, workspace: f.workspace }).execute({ name: "fixture.write", agentId: AGENT, arguments: {}, requestedMode: "EXECUTE" })).denied;
  };

  test("an agent stop_all kill suspends the agent (incident); neither the release nor a lifecycle resume lifts the other", async () => {
    const actor = ownerActor(f.workspace);
    await activate(f.workspace, actor, bound);
    const record = await kill("stop_all");
    expect(lifecycleView(f.workspace, AGENT)).toMatchObject({ state: "suspended", reason: "incident" });
    // One denial per call, naming the cause: the kill, not the suspension it carried.
    expect(await lowWrite()).toMatchObject({ stage: "authorization", reason: expect.stringContaining("kill_switch_active") });
    expect(await lowWrite()).not.toMatchObject({ reason: expect.stringContaining("agent_not_active") });

    // The kill's release does not resume the agent: that takes an OWNER's lifecycle move.
    await releaseKillSwitch({ workspace: f.workspace, releasedBy: "owner-1", killId: record.killId, incidentId: "inc-1" });
    expect(killSwitchDenial(f.workspace, { kind: "tool", agentId: AGENT, actionClass: "READ_ONLY" })).toBeNull();
    expect(lifecycleView(f.workspace, AGENT)).toMatchObject({ state: "suspended", reason: "incident" });
    expect(lifecycleAdmission(f.workspace, AGENT, { record: false, actionClass: "READ_ONLY" }).ok).toBe(false);
    expect(await lowWrite()).toMatchObject({ reason: expect.stringContaining("agent_not_active") });

    // A lifecycle resume does not lift a kill that is still active.
    const second = await kill("stop_all");
    await approvedMove(f.workspace, actor, "active", bound);
    expect(lifecycleView(f.workspace, AGENT).state).toBe("active");
    expect(killSwitchDenial(f.workspace, { kind: "tool", agentId: AGENT, actionClass: "READ_ONLY" })).toContain(second.killId);
  });

  test("a stop_new_effects kill keeps reads, so it suspends nothing; an ungoverned agent is not enrolled", async () => {
    await kill("stop_all");
    expect(lifecycleView(f.workspace, AGENT).implicit).toBe(true);
    await activate(f.workspace, ownerActor(f.workspace), bound);
    await kill("stop_new_effects");
    expect(lifecycleView(f.workspace, AGENT).state).toBe("active");
  });
});
