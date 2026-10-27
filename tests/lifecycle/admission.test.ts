// First: activate.js and the lifecycle modules form an import cycle, so the lifecycle module must load the mocked plan reader.
import "../../src/lifecycle/reassessment.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openActionJournal, type ActionJournal } from "../../src/actions/actionJournal.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { LIFECYCLE_AUDIT, lifecycleEvents, suspendAgent } from "../../src/lifecycle/governanceLifecycle.js";
import { compiledPolicyFacts } from "../../src/tools/guards/compiledPolicyGuard.js";
import { toolEvidenceFor } from "../../src/tools/toolEvidence.js";
import { ToolPipeline } from "../../src/tools/toolPipeline.js";
import { defineTool } from "../../src/tools/toolRegistry.js";
import { cleanupGovernanceFixtures, governanceFixture, REFUND } from "../governor/governanceFixture.js";
import { activate, AGENT, compiledPlan, ownerActor } from "./lifecycleFixture.js";

// Lifecycle enforcement is read from the workspace's active plan: a typed stand-in carrying L0-CHG-01, or none (advisory).
const active = vi.hoisted(() => ({ plan: null as unknown }));
vi.mock("../../src/catalog/compiler/activate.js", async (original) => ({
  ...(await original<typeof import("../../src/catalog/compiler/activate.js")>()), activeControlPlan: () => active.plan
}));

const READ = "fixture.read";
const journals: ActionJournal[] = [];
afterEach(() => {
  active.plan = null;
  for (const journal of journals.splice(0)) journal.close();
  cleanupGovernanceFixtures();
});

/** The P2-24 fixture behind a journaled pipeline (receipts per state), plus one READ_ONLY tool the plan shows. */
async function admissionFixture(options: { lifecycleControl: boolean; suspend: boolean }) {
  const base = compiledPlan({ lifecycleControl: options.lifecycleControl });
  const plan = { ...base, runtimePolicy: { ...base.runtimePolicy, toolPipeline: { ...base.runtimePolicy.toolPipeline,
    visibleTools: [...base.runtimePolicy.toolPipeline.visibleTools, READ] } } };
  const f = governanceFixture(plan);
  active.plan = options.lifecycleControl ? { digest: `sha256:${"5".repeat(64)}`, requirements: [{ controlId: "L0-CHG-01", applicability: "applicable", mandatory: true }],
    evidencePlan: { tests: [], evidenceRequests: [], manualDuties: [], releaseGates: [] } } : null;
  f.registry.define(defineTool({ name: READ, description: "Reads nothing; records the call in memory", actionClass: "READ_ONLY",
    body: (execution) => { f.bodies.push(execution); return { output: "read", effect: "not_applied" }; } }));
  await activate(f.workspace, ownerActor(f.workspace));
  if (options.suspend) suspendAgent(f.workspace, { agentId: AGENT, reason: "manual", actor: ownerActor(f.workspace, "second-owner") });
  const journal = openActionJournal(f.workspace);
  journals.push(journal);
  const pipeline = new ToolPipeline({ registry: f.registry, workspace: f.workspace, journal: () => journal,
    authorizationContext: () => ({ sessionId: f.sessionId, compiledPolicy: compiledPolicyFacts(plan) }),
    record: (execution, outcome) => {
      for (const row of toolEvidenceFor(execution, outcome)) f.ledger.appendEvidence({ sessionId: f.sessionId, runtime: "unknown", eventType: row.eventType,
        inline: true, payload: row.payload, payloadExt: "json", meta: row.meta });
    } });
  const call = (name: string) => pipeline.execute({ name, agentId: AGENT, requestedMode: "EXECUTE",
    arguments: { amount: "80.00", currency: "USD", recipient: "acme-001", resourceId: "invoice-001" } });
  return { ...f, call };
}

function warnings(workspace: string) {
  const ledger = openLedger(workspace);
  try {
    return lifecycleEvents(ledger.db, LIFECYCLE_AUDIT.warning, AGENT);
  } finally {
    ledger.close();
  }
}

describe("lifecycle admission at the authorization stage (P2-23)", () => {
  test("an active, approved agent's consequential call runs (baseline)", async () => {
    const f = await admissionFixture({ lifecycleControl: true, suspend: false });
    const outcome = await f.call(REFUND);
    expect(outcome.denied).toBeNull();
    expect(outcome.action?.state).toBe("completed");
  });

  test("a suspended agent's consequential call is denied with the reason, and the denial is a journal receipt", async () => {
    const f = await admissionFixture({ lifecycleControl: true, suspend: true });
    const outcome = await f.call(REFUND);
    expect(outcome.denied).toMatchObject({ stage: "authorization" });
    expect(outcome.denied?.reason).toContain("agent default is suspended (manual)");
    expect(outcome.action).toMatchObject({ state: "denied", evidenceComplete: true });
    expect(f.bodies).toHaveLength(0);
    const row = f.ledger.db.prepare("SELECT state, last_receipt_digest FROM action_executions WHERE execution_id = ?").get(outcome.action!.executionId) as
      { state: string; last_receipt_digest: string };
    expect(row.state).toBe("denied");
    expect(row.last_receipt_digest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a suspension after the record bound (here, from inside a guard) is caught by the recheck before the body", async () => {
    const f = await admissionFixture({ lifecycleControl: true, suspend: false });
    const actor = ownerActor(f.workspace, "second-owner");
    f.registry.guard("suspends-midway", () => { suspendAgent(f.workspace, { agentId: AGENT, reason: "manual", actor }); return undefined; });
    const outcome = await f.call(REFUND);
    expect(outcome.denied?.reason).toContain("agent_not_active");
    expect(f.bodies).toHaveLength(0);
  });

  test("an allowlisted read still runs for a suspended agent", async () => {
    const f = await admissionFixture({ lifecycleControl: true, suspend: true });
    const outcome = await f.call(READ);
    expect(outcome.denied).toBeNull();
    expect(f.bodies.map((execution) => execution.name)).toEqual([READ]);
  });

  test("an advisory plan (no lifecycle control) lets the call run and writes a warning row", async () => {
    const f = await admissionFixture({ lifecycleControl: false, suspend: true });
    const outcome = await f.call(REFUND);
    expect(outcome.denied).toBeNull();
    expect(f.bodies.map((execution) => execution.name)).toEqual([REFUND]);
    expect(warnings(f.workspace).map((row) => row.meta.problem)).toEqual(["agent default is suspended (manual)"]);
  });
});
