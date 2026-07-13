import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { inspectUnifiedConfiguredSurfaces } from "../src/unified/unifiedSurfaceInspection.js";
import { unifiedRun } from "../src/unified/unifiedRun.js";
import { initWorkspace } from "../src/workspace.js";
import { actionPolicyPath } from "../src/governor/actionPolicyEngine.js";
import { passportExportsDir } from "../src/passport/passportStore.js";

const workspaces: string[] = [];

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-unified-surfaces-"));
  workspaces.push(root);
  process.env.AMC_VAULT_PASSPHRASE = "unified-surface-test-passphrase";
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

afterEach(() => {
  delete process.env.AMC_VAULT_PASSPHRASE;
  while (workspaces.length > 0) {
    const root = workspaces.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("unified run surface inspection", () => {
  test("does not turn legacy decoy files into completed product surfaces", async () => {
    const root = workspace();
    writeFileSync(join(root, ".amc", "policy.yaml"), "enabled: true\n");
    writeFileSync(join(root, ".amc", "policy.yaml.sig"), "fake\n");
    writeFileSync(join(root, ".amc", "monitor-config.json"), "{}\n");
    writeFileSync(join(root, ".amc", "fleet.yaml"), "agents:\n  - fake\n");
    writeFileSync(join(root, ".amc", "passports"), "legacy-decoy\n");

    const modules = await inspectUnifiedConfiguredSurfaces({ workspace: root, agentId: "default" });
    const byName = new Map(modules.map((module) => [module.name, module]));

    expect(byName.get("Enforce")?.score).toBeLessThan(100);
    expect(byName.get("Enforce")?.status).toBe("skipped");
    expect(byName.get("Watch")?.score).toBe(0);
    expect(byName.get("Watch")?.status).toBe("skipped");
    expect(byName.get("Comply")?.score).toBeLessThan(100);
    expect(byName.get("Fleet")?.score).toBeLessThan(100);
    expect(byName.get("Passport")?.score).toBeLessThan(100);
    expect(byName.get("Passport")?.status).toBe("skipped");
  });

  test("fails Enforce closed when the signed action policy is tampered", async () => {
    const root = workspace();
    writeFileSync(actionPolicyPath(root), "\n# tampered\n", { flag: "a" });

    const modules = await inspectUnifiedConfiguredSurfaces({ workspace: root, agentId: "default" });
    const enforce = modules.find((module) => module.name === "Enforce");

    expect(enforce?.status).toBe("failed");
    expect(enforce?.score).toBe(0);
    expect(enforce?.issues.join(" ")).toMatch(/signature|integrity|invalid/i);
  });

  test("verifies Vault ledger integrity instead of treating directory existence as proof", async () => {
    const root = workspace();
    const modules = await inspectUnifiedConfiguredSurfaces({ workspace: root, agentId: "default" });
    const vault = modules.find((module) => module.name === "Vault");

    expect(vault?.status).toBe("success");
    expect(vault?.score).toBeGreaterThanOrEqual(80);
    expect(vault?.summary).toMatch(/ledger.*verified|verified.*ledger/i);
  });

  test("fails Passport closed with a zero score when any portable export is invalid", async () => {
    const root = workspace();
    const exportsDir = passportExportsDir(root);
    mkdirSync(exportsDir, { recursive: true });
    writeFileSync(join(exportsDir, "tampered.amcpass"), "not a passport archive\n");

    const modules = await inspectUnifiedConfiguredSurfaces({ workspace: root, agentId: "default" });
    const passport = modules.find((module) => module.name === "Passport");

    expect(passport?.status).toBe("failed");
    expect(passport?.score).toBe(0);
    expect(passport?.issues.join(" ")).toMatch(/tampered|extract|archive|verify/i);
  });

  test("amc run consumes real subsystem inspection and ignores legacy completion decoys", async () => {
    const root = workspace();
    writeFileSync(join(root, ".amc", "policy.yaml"), "enabled: true\n");
    writeFileSync(join(root, ".amc", "metrics.yaml"), "enabled: true\n");
    writeFileSync(join(root, ".amc", "fleet.yaml"), "agents:\n  - fake\n");

    const report = await unifiedRun({
      workspace: root,
      agentId: "default",
      window: "14d",
    });
    const byName = new Map(report.modules.map((module) => [module.name, module]));

    expect(report.modules.map((module) => module.name)).toEqual([
      "Score",
      "Shield",
      "Enforce",
      "Vault",
      "Watch",
      "Comply",
      "Fleet",
      "Passport",
    ]);
    expect(byName.get("Enforce")?.summary).toMatch(/signed control configs|runtime control evidence/i);
    expect(byName.get("Fleet")?.score).toBeLessThan(100);
    expect(byName.get("Passport")?.score).toBeLessThan(100);
    expect(byName.get("Passport")?.skipped).toBe(true);
    const weights: Record<string, number> = {
      Score: 0.25,
      Shield: 0.25,
      Enforce: 0.12,
      Vault: 0.08,
      Watch: 0.10,
      Comply: 0.10,
      Fleet: 0.05,
      Passport: 0.05,
    };
    const fixedWeightScore = Math.round(report.modules.reduce(
      (sum, module) => sum + module.score * (weights[module.name] ?? 0),
      0,
    ));
    expect(report.overallScore).toBe(fixedWeightScore);
    expect(report.surfaceCoverage).toMatchObject({
      total: 8,
      evaluated: report.modules.filter((module) => !module.skipped).length,
      pending: report.modules.filter((module) => module.skipped).map((module) => module.name),
    });
    expect(report.lifecycleArtifactPath).toBeTruthy();
  });

  test("propagates a failed surface to the unified result, overall gate, and lifecycle artifact", async () => {
    const root = workspace();
    const exportsDir = passportExportsDir(root);
    mkdirSync(exportsDir, { recursive: true });
    writeFileSync(join(exportsDir, "tampered.amcpass"), "not a passport archive\n");

    const report = await unifiedRun({ workspace: root, agentId: "default", window: "14d" });
    const passport = report.modules.find((module) => module.name === "Passport");

    expect(passport).toMatchObject({ status: "failed", skipped: false, score: 0, grade: "F" });
    expect(report.surfaceCoverage.failed).toContain("Passport");
    expect(report.overallGrade).toBe("F");
    expect(report.overallScore).toBeLessThan(60);
    expect(report.lifecycleArtifactPath).toBeTruthy();
    const lifecycle = JSON.parse(readFileSync(report.lifecycleArtifactPath!, "utf8")) as {
      surfaces: { Passport: { status: string } };
    };
    expect(lifecycle.surfaces.Passport.status).toBe("degraded");
  });
});
