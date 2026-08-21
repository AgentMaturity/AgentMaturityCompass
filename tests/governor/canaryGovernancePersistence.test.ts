import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRollbackPack,
  getRollbackPacks,
  getLatestRollbackPack,
  activateEmergencyOverride,
  getActiveOverrides,
  getOverridesMissingPostmortem,
  filePostmortem,
  detectGovernanceDrift,
  generatePolicyCanaryReport,
  resetPolicyCanaryState
} from "../../src/governor/policyCanary.js";

/**
 * createRollbackPack and activateEmergencyOverride already took a `workspace`,
 * but used it only to sign — never to persist. Reproduced against the CLI:
 *
 *   $ amc rollback-create --reason pre-deploy
 *   Rollback pack created: rbp_b1458204-5a8
 *   $ amc emergency-override --reason outage --action "allow deploy"
 *   Emergency override activated: emo_50c2416c-9fa   ⚠ Postmortem required
 *   $ amc canary-report
 *   - Rollback packs: 0     - Active overrides: 0
 *   $ amc governance-drift
 *   No governance drift detected.
 *
 * So canary-report advised creating a rollback pack that had just been
 * created, and an override requiring a postmortem disappeared from the drift
 * report that exists to chase it.
 */
describe("canary governance records survive the process", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-canary-"));
    resetPolicyCanaryState();
  });
  afterEach(() => {
    resetPolicyCanaryState();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps a rollback pack visible to a later invocation", () => {
    const pack = createRollbackPack("default", "policy: {}", "pre-deploy", workspace);
    resetPolicyCanaryState();
    expect(getRollbackPacks("default", workspace).map((p) => p.packId)).toContain(pack.packId);
    expect(getLatestRollbackPack("default", workspace)?.packId).toBe(pack.packId);
  });

  it("counts persisted packs and overrides in the canary report", () => {
    createRollbackPack("default", "policy: {}", "pre-deploy", workspace);
    activateEmergencyOverride(
      { agentId: "default", reason: "outage", actionDescription: "allow deploy", ttlMs: 60_000 },
      workspace
    );
    resetPolicyCanaryState();
    const report = generatePolicyCanaryReport("default", workspace);
    expect(report.rollbackPacks).toBe(1);
    expect(report.activeOverrides).toBe(1);
  });

  it("still chases a postmortem for an override that outlived its process", () => {
    const override = activateEmergencyOverride(
      // Already expired, so a postmortem is owed immediately.
      { agentId: "default", reason: "outage", actionDescription: "allow deploy", ttlMs: -1 },
      workspace
    );
    resetPolicyCanaryState();
    expect(getOverridesMissingPostmortem("default", workspace).map((o) => o.overrideId)).toContain(
      override.overrideId
    );
    const drift = detectGovernanceDrift("default", workspace);
    expect(drift.driftItems.some((d) => d.category === "OVERRIDE_HYGIENE")).toBe(true);
  });

  it("records a filed postmortem so the drift clears", () => {
    const override = activateEmergencyOverride(
      { agentId: "default", reason: "outage", actionDescription: "allow deploy", ttlMs: -1 },
      workspace
    );
    resetPolicyCanaryState();
    expect(filePostmortem(override.overrideId, "artifact-1", workspace)).toBe(true);
    resetPolicyCanaryState();
    expect(getOverridesMissingPostmortem("default", workspace)).toHaveLength(0);
  });

  it("still works without a workspace, for library callers", () => {
    const pack = createRollbackPack("default", "policy: {}", "reason");
    expect(getRollbackPacks("default").map((p) => p.packId)).toContain(pack.packId);
  });
});
