import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ActiveCompiledPolicy } from "../../src/catalog/compiler/activate.js";
import { approvalGateFor, type AgentLoopCliIo } from "../../src/cli-agent-options.js";
import { AGENT, cleanupGovernanceFixtures, CONTROL, governanceFixture, issueRefundException, planWithControl } from "../governor/governanceFixture.js";

/** Only which plan is active is substituted; the exception, its signature and approval are real (P2-24). */
const active = vi.hoisted(() => ({ plan: null as ActiveCompiledPolicy | null | Error }));
vi.mock("../../src/catalog/compiler/activate.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/catalog/compiler/activate.js")>(),
  loadActiveCompiledPolicy: () => { if (active.plan instanceof Error) throw active.plan; return active.plan; }
}));

afterEach(() => { active.plan = null; cleanupGovernanceFixtures(); });

function io() {
  const errors: string[] = [];
  let failed = false;
  const value: AgentLoopCliIo = { log: () => undefined, error: (line) => errors.push(line), fail: () => { failed = true; } };
  return { value, errors, failed: () => failed };
}

function regulatedPlan(): ActiveCompiledPolicy {
  const plan = planWithControl();
  return { ...plan, runtimePolicy: { ...plan.runtimePolicy, approvals: { FINANCIAL: { requiredApprovals: 2, requireDistinctUsers: true,
    rolesAllowed: ["OWNER", "AUDITOR"], ttlMinutes: 10, controlIds: [CONTROL] } } } } as ActiveCompiledPolicy;
}

function unsignedNote(workspace: string): string {
  const path = join(workspace, "adr5-note.json");
  writeFileSync(path, JSON.stringify({ exceptionId: "ADR-5-demo", reason: "demo run", approvedBy: "a person",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), actionClasses: ["FINANCIAL"] }));
  return path;
}

describe("P2-24 regulated profiles refuse unsigned approval exception notes", () => {
  test("outside a regulated profile the ADR-5 note keeps working", () => {
    const f = governanceFixture();
    const out = io();
    const gate = approvalGateFor(out.value, { approveTools: "FINANCIAL", approvalException: unsignedNote(f.workspace) }, { workspace: f.workspace, agentId: AGENT });
    expect(out.failed()).toBe(false);
    expect(gate?.answerers.map((answerer) => answerer.name)).toEqual([expect.stringMatching(/^adr5-exception:ADR-5-demo/)]);
  });

  test("in a regulated profile the unsigned note is refused and a signed exception for the approval control is accepted", async () => {
    const f = governanceFixture();
    const exception = await issueRefundException(f.workspace);
    active.plan = regulatedPlan();
    const refused = io();
    expect(approvalGateFor(refused.value, { approveTools: "FINANCIAL", approvalException: unsignedNote(f.workspace) },
      { workspace: f.workspace, agentId: AGENT })).toBeNull();
    expect(refused.failed()).toBe(true);
    expect(refused.errors.join("\n")).toContain("refuses the unsigned ADR-5 note");
    const accepted = io();
    const gate = approvalGateFor(accepted.value, { approveTools: "FINANCIAL", approvalException: exception.exceptionId }, { workspace: f.workspace, agentId: AGENT });
    expect(accepted.failed()).toBe(false);
    expect(gate?.answerers.map((answerer) => answerer.name)).toEqual([expect.stringContaining(`scoped-exception:${exception.exceptionId}`)]);
  });

  test("a plan that cannot be verified counts as regulated with no approval control, so no exception relaxes it", async () => {
    const f = governanceFixture();
    const exception = await issueRefundException(f.workspace);
    active.plan = new Error("journal integrity failure");
    const out = io();
    expect(approvalGateFor(out.value, { approveTools: "FINANCIAL", approvalException: exception.exceptionId }, { workspace: f.workspace, agentId: AGENT })).toBeNull();
    expect(out.errors.join("\n")).toContain("not the approval control");
  });
});
