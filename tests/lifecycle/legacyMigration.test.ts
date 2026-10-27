// First: activate.js and the lifecycle modules form an import cycle, so the lifecycle module must load the mocked plan reader.
import { lifecycleAdmission } from "../../src/lifecycle/reassessment.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openLedger } from "../../src/ledger/ledger.js";
import { LIFECYCLE_AUDIT, lifecycleEvents, lifecycleView, migrateLegacyAgents } from "../../src/lifecycle/governanceLifecycle.js";
import { lifecycleAdvanceCli, lifecycleStatusCli } from "../../src/lifecycle/lifecycleCli.js";
import { cleanupGovernanceFixtures, governanceFixture } from "../governor/governanceFixture.js";
import { AGENT, approvedMove, manifest, ownerActor } from "./lifecycleFixture.js";

// Enforcement is read from the workspace's active plan: a typed stand-in carrying L0-CHG-01 when `enforcing` is set.
const active = vi.hoisted(() => ({ plan: null as unknown }));
vi.mock("../../src/catalog/compiler/activate.js", async (original) => ({
  ...(await original<typeof import("../../src/catalog/compiler/activate.js")>()), activeControlPlan: () => active.plan
}));
const ENFORCING = { digest: `sha256:${"5".repeat(64)}`, requirements: [{ controlId: "L0-CHG-01", applicability: "applicable", mandatory: true }],
  evidencePlan: { tests: [], evidenceRequests: [], manualDuties: [], releaseGates: [] } };
const admission = (workspace: string, enforcing: boolean) => {
  active.plan = enforcing ? ENFORCING : null;
  return lifecycleAdmission(workspace, AGENT);
};

afterEach(() => {
  active.plan = null;
  cleanupGovernanceFixtures();
});

describe("legacy migration (P2-23)", () => {
  test("an existing agent reads as active legacy_migration before migration, and migration records exactly that, self_reported", () => {
    const { workspace } = governanceFixture();
    expect(lifecycleView(workspace, AGENT)).toMatchObject({ implicit: true, state: "active", reason: "legacy_migration", claimKind: "self_reported" });
    expect(migrateLegacyAgents(workspace)).toEqual([AGENT]);
    expect(migrateLegacyAgents(workspace)).toEqual([]);
    expect(lifecycleView(workspace, AGENT)).toMatchObject({ implicit: false, state: "active", reason: "legacy_migration", claimKind: "self_reported", approvalId: null });
    const ledger = openLedger(workspace);
    try {
      expect(lifecycleEvents(ledger.db, LIFECYCLE_AUDIT.transition, AGENT).map((row) => row.meta))
        .toEqual([expect.objectContaining({ from: null, to: "active", reason: "legacy_migration", claimKind: "self_reported", actor: expect.objectContaining({ via: "amc" }) })]);
    } finally {
      ledger.close();
    }
  });

  test("no outage: unmigrated agents keep running; once migrated, an enforcing plan needs a bound approval before the next consequential action", async () => {
    const { workspace } = governanceFixture();
    expect(admission(workspace, false)).toEqual({ ok: true, warning: null });
    // Never migrated: not held, even under an enforcing plan (upgrading a regulated workspace stops nothing).
    expect(admission(workspace, true)).toEqual({ ok: true, warning: null });
    migrateLegacyAgents(workspace);
    expect(admission(workspace, false).ok).toBe(true);
    console.log("DBG", JSON.stringify(lifecycleView(workspace, AGENT)));
    expect(admission(workspace, true)).toMatchObject({ ok: false, reason: expect.stringContaining("active (legacy_migration) without a bound approval") });
    active.plan = ENFORCING;
    await approvedMove(workspace, ownerActor(workspace), "active", manifest());
    expect(lifecycleView(workspace, AGENT)).toMatchObject({ state: "active", reason: "approval", claimKind: "observed" });
    expect(admission(workspace, true)).toEqual({ ok: true, warning: null });
  });

  test("amc lifecycle advance still works and its records are labelled self_reported", () => {
    const { workspace } = governanceFixture();
    const advanced = lifecycleAdvanceCli({ workspace, agentId: AGENT, to: "testing", actor: "typed-name", controls: ["owner_charter_defined", "unit_tests_passing", "risk_assessment_documented"] });
    expect(advanced).toMatchObject({ fromStage: "development", toStage: "testing", claimKind: "self_reported" });
    expect(lifecycleStatusCli({ workspace, agentId: AGENT })).toMatchObject({ currentStage: "testing", claimKind: "self_reported" });
    // The stage file is not governed state: the agent's lifecycle row is untouched.
    expect(lifecycleView(workspace, AGENT).implicit).toBe(true);
  });
});
