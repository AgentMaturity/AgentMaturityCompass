/** P2-26 slice D: retention can never be set or run below an applicable regime's minimum. */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import YAML from "yaml";
import type { RequirementDecision } from "../../src/catalog/compiler/types.js";
import { defaultOpsPolicy, initOpsPolicy, opsPolicyPath, signOpsPolicy } from "../../src/ops/policy.js";
import {
  RegimeRetentionRefused, effectiveRetention, regimeRetentionRules, retentionFloorViolations, type RegimeRetentionRule
} from "../../src/ops/retention/regimeRetention.js";
import { runRetention } from "../../src/ops/retention/retentionEngine.js";
import { maintenanceRotateLogsCli } from "../../src/ops/maintenance/maintenanceCli.js";
import { rotateLogs } from "../../src/ops/maintenance/logRotation.js";
import { initWorkspace } from "../../src/workspace.js";

const plan = vi.hoisted(() => ({ requirements: null as RequirementDecision[] | null }));
vi.mock("../../src/catalog/compiler/activate.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/catalog/compiler/activate.js")>();
  return { ...original, activeControlPlan: (workspace: string) => plan.requirements === null ? original.activeControlPlan(workspace) : { requirements: plan.requirements } };
});
vi.setConfig({ testTimeout: 60_000 });

const requirement = (over: Partial<RequirementDecision>): RequirementDecision => ({ controlId: "L0-LOG-03", controlVersion: "0.1.0", controlDigest: "d",
  layer: 0, applicability: "applicable", reasons: [], missingFacts: [], exclusion: null, citationsInScope: [], mandatory: true, support: "experimental",
  pulledInBy: ["layer0"], ...over } as RequirementDecision);
const AI_ACT = [requirement({ citationsInScope: ["eu-ai-act-art-26-6"] })];
const CERT_IN = [requirement({ pulledInBy: ["layer0", "jurisdiction:IN"] })];
const worm: RegimeRetentionRule = { regimeId: "worm-fixture", registerRef: null, minimumDays: 10, maximumDays: null, appliesTo: "receipts",
  wormRequired: true, residency: null, verified: false, basis: "fixture" };

let root: string;
let workspace: string;
beforeEach(() => {
  plan.requirements = null;
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p226-retention-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  if (!existsSync(opsPolicyPath(workspace))) initOpsPolicy(workspace);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("regime floors", () => {
  test("a 6-month AI Act rule with the default 14-day pruning: applying the policy is refused, naming the regime", () => {
    plan.requirements = AI_ACT;
    expect(() => signOpsPolicy(workspace)).toThrow(RegimeRetentionRefused);
    expect(() => signOpsPolicy(workspace)).toThrow(/eu-ai-act-art-26-6-deployer-logs/);
  });

  test("the same floor refuses the retention executor; a compliant policy is accepted and runs", () => {
    plan.requirements = AI_ACT;
    expect(() => runRetention({ workspace, dryRun: false })).toThrow(/eu-ai-act-art-26-6-deployer-logs/);
    const policy = defaultOpsPolicy();
    policy.opsPolicy.retention.prunePayloadsAfterDays = 200;
    policy.opsPolicy.maintenance.rotateLogsDays = 200;
    writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
    expect(() => signOpsPolicy(workspace)).not.toThrow();
    expect(() => runRetention({ workspace, dryRun: false })).not.toThrow();
  });

  test("a CERT-In rule: the effective minimum is 180 days, kept in India", () => {
    const rules = regimeRetentionRules(CERT_IN);
    expect(rules).toEqual([expect.objectContaining({ regimeId: "in-cert-in-logs-180d", residency: "IN", verified: false })]);
    expect(effectiveRetention(rules).minimums.logs).toEqual({ days: 180, regimeIds: ["in-cert-in-logs-180d"] });
    expect(effectiveRetention(regimeRetentionRules([...AI_ACT, ...CERT_IN])).minimums.logs).toEqual({ days: 183, regimeIds: ["eu-ai-act-art-26-6-deployer-logs"] });
  });

  test("a WORM rule without a configured target leaves its control not_evaluated", () => {
    expect(effectiveRetention([worm]).controls).toEqual([expect.objectContaining({ regimeId: "worm-fixture", status: "not_evaluated" })]);
    expect(effectiveRetention([worm], true).controls).toEqual([expect.objectContaining({ status: "enforced_at_retention" })]);
  });

  test("conflicting maximums are listed for a reviewer, not resolved", () => {
    const cap: RegimeRetentionRule = { ...worm, regimeId: "cap-fixture", minimumDays: 1, maximumDays: 5, wormRequired: false };
    expect(effectiveRetention([worm, cap]).conflicts).toEqual([{ appliesTo: "receipts", maximum: { regimeId: "cap-fixture", days: 5 }, minimum: { regimeId: "worm-fixture", days: 10 } }]);
  });

  test("no applicable regime: defaults unchanged and accepted", () => {
    expect(regimeRetentionRules(null)).toEqual([]);
    expect(regimeRetentionRules([requirement({ applicability: "not_applicable", citationsInScope: ["eu-ai-act-art-26-6"] })])).toEqual([]);
    expect(retentionFloorViolations(defaultOpsPolicy(), [])).toEqual([]);
    expect(() => signOpsPolicy(workspace)).not.toThrow();
  });

  test("maintenance log rotation is a deleting knob: a rotateLogsDays below the floor is refused at apply and in the CLI", () => {
    plan.requirements = AI_ACT;
    const policy = defaultOpsPolicy();
    policy.opsPolicy.retention.prunePayloadsAfterDays = 200;
    policy.opsPolicy.retention.keepArchiveSegmentsDays = 3650;
    policy.opsPolicy.maintenance.rotateLogsDays = 30;
    writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
    expect(() => signOpsPolicy(workspace)).toThrow(/maintenance\.rotateLogsDays 30 days undercuts/);
    plan.requirements = null;
    signOpsPolicy(workspace); // signed before the plan applied; the floor still refuses the deletion
    plan.requirements = AI_ACT;
    expect(() => maintenanceRotateLogsCli(workspace)).toThrow(/eu-ai-act-art-26-6-deployer-logs/);
  });

  test("log rotation never deletes a log younger than the floor, even an oversized one; older ones still rotate", () => {
    plan.requirements = AI_ACT;
    const logDir = join(workspace, ".amc", "studio", "logs");
    mkdirSync(logDir, { recursive: true });
    const young = join(logDir, "young-large.log"), old = join(logDir, "old.log");
    writeFileSync(young, Buffer.alloc(2 * 1024 * 1024));
    writeFileSync(old, "x");
    const longAgo = (Date.now() - 400 * 86_400_000) / 1000;
    utimesSync(old, longAgo, longAgo);
    expect(() => rotateLogs({ workspace, logDir, maxDays: 30, maxFileMb: 1 })).toThrow(RegimeRetentionRefused);
    const result = rotateLogs({ workspace, logDir, maxDays: 200, maxFileMb: 1 });
    expect(result.removed).toEqual([old]);
    expect(existsSync(young)).toBe(true);
  });
});
