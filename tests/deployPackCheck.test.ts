import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deployPackCheck, TOOLS } from "../scripts/deploy/deploy-pack-check.mjs";
import { checkProbes, checkSingleWriter } from "../scripts/deploy/validate-assets.mjs";
import { rollbackHazards } from "../scripts/deploy/rollback-check.mjs";
import { root } from "./helpers/deployPackFixtures.js";

// PATH holds only node's directory, so helm and kubeconform are absent and the run stays offline
// (kubeconform fetches schemas over the network); the deploy-pack workflow runs them with --require-tools.
const offlineEnv = { ...process.env, PATH: dirname(process.execPath) };
const run = (args: string[]) => spawnSync(process.execPath, ["scripts/deploy/deploy-pack-check.mjs", ...args], { cwd: root, encoding: "utf8", env: offlineEnv });

describe("deploy-pack-check", () => {
  it("passes offline and names every tool it could not run", () => {
    const result = run(["--json"]);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe("passed");
    expect(result.status).toBe(0);
    expect(report.errors).toEqual([]);
    for (const tool of report.skipped) expect(tool).toEqual({ id: expect.stringMatching(/^(helm|kubeconform)$/), reason: "binary absent" });
    const skippedIds = report.skipped.map((tool: { id: string }) => tool.id);
    expect(report.ran).toContain("static");
    for (const id of TOOLS) expect(skippedIds.includes(id) || report.ran.some((step: string) => step.startsWith(id))).toBe(true);
  });

  it("--require-tools fails when a tool is absent (injected), passes the skip list through", () => {
    const none = deployPackCheck(root, { requireTools: true, present: () => false });
    expect(none.status).toBe("failed");
    expect(none.skipped).toEqual([{ id: "helm", reason: "binary absent" }, { id: "kubeconform", reason: "binary absent" }]);
    expect(none.errors).toEqual(["helm: required by --require-tools but binary absent", "kubeconform: required by --require-tools but binary absent"]);
    expect(deployPackCheck(root, { present: () => false }).status).toBe("passed");
  });

  it("rejects unknown options with exit 2", () => {
    expect(run(["--bogus"]).status).toBe(2);
  });

  it("every deploy-pack CLI still runs when started through a symlink (Kubernetes mounts ConfigMap files as symlinks)", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-deploy-cli-"));
    try {
      for (const script of ["scripts/deploy/deploy-pack-check.mjs", "scripts/deploy/rollback-drill.mjs", "scripts/deploy/rollback-check.mjs",
        "scripts/deploy/validate-assets.mjs", "scripts/deploy/governed-turn-probe.mjs", "scripts/deploy-verify.mjs", "scripts/credentials-presence-check.mjs"]) {
        const link = join(dir, basename(script));
        symlinkSync(resolve(root, script), link);
        const result = spawnSync(process.execPath, [link, "--bogus"], { cwd: dir, encoding: "utf8", env: offlineEnv });
        // A main guard that compares the unresolved argv[1] skips main(): no output and exit 0, a silent pass.
        expect(`${result.stdout}${result.stderr}`.trim(), script).not.toBe("");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("deployment pack: probes and rollout safety", () => {
  it("probes target AMC health endpoints that exist in the server source", () => {
    const result = checkProbes(root);
    expect(result.errors).toEqual([]);
    expect(new Set(result.probes.map((probe: { path: string }) => probe.path))).toEqual(new Set(["/healthz", "/readyz"]));
    for (const source of ["deploy/helm/amc/templates/deployment.yaml", "deploy/k8s/deployment.yaml"]) {
      const kinds = result.probes.filter((p: { file: string; container: string }) => p.file === source && p.container === "amc-studio").map((p: { kind: string }) => p.kind);
      expect(kinds.sort()).toEqual(["livenessProbe", "readinessProbe", "startupProbe"]);
    }
  });

  it("keeps the single-writer workspace to one pod with a Recreate rollout", () => {
    expect(checkSingleWriter(root)).toEqual([]);
  });

  it("rollback hazards: flags selector change, PVC shrink and PVC removal; passes identical renders", () => {
    const deployment = (app: string) => ({ kind: "Deployment", metadata: { name: "amc" }, spec: { selector: { matchLabels: { app } } } });
    const pvc = (size: string, modes = ["ReadWriteOnce"]) => ({
      kind: "PersistentVolumeClaim", metadata: { name: "amc" }, spec: { accessModes: modes, resources: { requests: { storage: size } } }
    });
    expect(rollbackHazards([deployment("a"), pvc("10Gi")], [deployment("a"), pvc("10Gi")])).toEqual([]);
    expect(rollbackHazards([deployment("a")], [deployment("b")])[0]).toMatch(/selector/);
    expect(rollbackHazards([pvc("20Gi")], [pvc("10Gi")])[0]).toMatch(/shrink/);
    expect(rollbackHazards([pvc("10Gi")], [pvc("10Gi", ["ReadWriteMany"])])[0]).toMatch(/accessModes/);
    expect(rollbackHazards([pvc("10Gi")], [])[0]).toMatch(/removed/);
    expect(rollbackHazards([{ kind: "Secret", metadata: { name: "amc-bootstrap" } }], [])[0]).toMatch(/resource-policy=keep/);
  });

  it("rollback-check renders HEAD and the working tree and finds no rollback hazard", () => {
    const result = spawnSync(process.execPath, ["scripts/deploy/rollback-check.mjs", "--from", "HEAD"], { cwd: root, encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("hazards: 0");
  });
});
