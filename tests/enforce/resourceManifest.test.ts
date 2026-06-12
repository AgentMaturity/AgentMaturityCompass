import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildEnforceResourceManifest,
  diffEnforceResourceManifests,
  applyEnforceResourceLifecycle,
  enforceResourceLifecycleContract,
  evaluateEnforceResourceLifecycle,
  inspectEnforceResource,
  listEnforceResourceHistory,
  listEnforceResources,
  loadEnforceResourceManifest,
  proposeEnforceResourceLifecycle,
  restoreEnforceResourceSnapshot,
  validateEnforceResourceLifecycle,
  verifyEnforceResourceManifest,
  writeEnforceResourceManifest
} from "../../src/enforce/resourceManifest.js";
import { verifyArtifactFileSignature } from "../../src/lifecycle/artifactSignature.js";

function withWorkspace(fn: (workspace: string) => void): void {
  const workspace = mkdtempSync(join(tmpdir(), "amc-enforce-resource-"));
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

describe("enforce resource manifest", () => {
  test("snapshots existing agent resources deterministically", () => {
    withWorkspace((workspace) => {
      const amc = join(workspace, ".amc");
      mkdirSync(amc, { recursive: true });
      writeFileSync(join(amc, "agent.config.yaml"), "id: default\nprovider: demo\n", { encoding: "utf8", flag: "w" });
      writeFileSync(join(amc, "guardrails.yaml"), "rules:\n  - allow\n", { encoding: "utf8", flag: "w" });

      const manifest = buildEnforceResourceManifest({
        workspace,
        agentId: "default",
        createdAt: new Date("2026-05-22T00:00:00Z")
      });

      expect(manifest.manifestId).toMatch(/^enforce-resources-/);
      expect(manifest.resourceCount).toBe(2);
      expect(manifest.resources.map((resource) => resource.path)).toEqual([
        ".amc/agent.config.yaml",
        ".amc/guardrails.yaml"
      ]);
      expect(manifest.resources.every((resource) => resource.digest)).toBe(true);
    });
  });

  test("writes latest and snapshot manifests", () => {
    withWorkspace((workspace) => {
      mkdirSync(join(workspace, ".amc"), { recursive: true });
      writeFileSync(join(workspace, ".amc", "prompt-addendum.md"), "Use approved tools only.\n", { encoding: "utf8", flag: "w" });

      const result = writeEnforceResourceManifest({ workspace, agentId: "default" });

      expect(existsSync(result.manifestPath)).toBe(true);
      expect(existsSync(result.snapshotPath)).toBe(true);
      expect(existsSync(result.snapshotBundlePath)).toBe(true);
      expect(result.manifestSigPath ? existsSync(result.manifestSigPath) : false).toBe(true);
      expect(result.snapshotSigPath ? existsSync(result.snapshotSigPath) : false).toBe(true);
      expect(existsSync(join(result.snapshotBundlePath, "files", ".amc", "prompt-addendum.md"))).toBe(true);
      const parsed = loadEnforceResourceManifest(result.manifestPath);
      expect(parsed.manifestId).toBe(result.manifest.manifestId);
      expect(JSON.parse(readFileSync(result.snapshotPath, "utf8")).manifestId).toBe(result.manifest.manifestId);
    });
  });

  test("lists and inspects resources from a manifest", () => {
    withWorkspace((workspace) => {
      mkdirSync(join(workspace, ".amc"), { recursive: true });
      writeFileSync(join(workspace, ".amc", "gatePolicy.json"), "{\"mode\":\"dry-run\"}\n", { encoding: "utf8", flag: "w" });
      writeEnforceResourceManifest({ workspace, agentId: "default" });

      const resources = listEnforceResources({ workspace, agentId: "default" });
      expect(resources.map((resource) => resource.id)).toEqual(["policy:.amc/gatePolicy.json"]);

      const inspected = inspectEnforceResource({ workspace, agentId: "default", selector: ".amc/gatePolicy.json" });
      expect(inspected.kind).toBe("policy");
      expect(inspected.path).toBe(".amc/gatePolicy.json");
    });
  });

  test("verify and diff detect resource changes", () => {
    withWorkspace((workspace) => {
      mkdirSync(join(workspace, ".amc"), { recursive: true });
      const guardrails = join(workspace, ".amc", "guardrails.yaml");
      writeFileSync(guardrails, "rules:\n  - allow\n", { encoding: "utf8", flag: "w" });
      const before = writeEnforceResourceManifest({ workspace, agentId: "default" });

      const initial = verifyEnforceResourceManifest({ workspace, agentId: "default" });
      expect(initial.valid).toBe(true);
      expect(initial.signature.valid).toBe(true);

      writeFileSync(guardrails, "rules:\n  - allow\n  - block-secret\n", { encoding: "utf8", flag: "w" });
      const verification = verifyEnforceResourceManifest({ workspace, agentId: "default" });
      expect(verification.valid).toBe(false);
      expect(verification.diff.changed.map((entry) => entry.id)).toEqual(["guardrail:.amc/guardrails.yaml"]);

      const after = buildEnforceResourceManifest({ workspace, agentId: "default" });
      const diff = diffEnforceResourceManifests(before.manifest, after);
      expect(diff.changed).toHaveLength(1);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });
  });

  test("restores mutable resources from a snapshot only when apply is set", () => {
    withWorkspace((workspace) => {
      mkdirSync(join(workspace, ".amc"), { recursive: true });
      const guardrails = join(workspace, ".amc", "guardrails.yaml");
      writeFileSync(guardrails, "rules:\n  - allow\n", { encoding: "utf8", flag: "w" });
      writeEnforceResourceManifest({ workspace, agentId: "default" });

      writeFileSync(guardrails, "rules:\n  - allow\n  - block-secret\n", { encoding: "utf8", flag: "w" });
      const dryRun = restoreEnforceResourceSnapshot({
        workspace,
        agentId: "default",
        resource: "guardrail:.amc/guardrails.yaml"
      });
      expect(dryRun.apply).toBe(false);
      expect(dryRun.entries).toEqual([
        expect.objectContaining({ id: "guardrail:.amc/guardrails.yaml", status: "would-restore" })
      ]);
      expect(readFileSync(guardrails, "utf8")).toContain("block-secret");

      const applied = restoreEnforceResourceSnapshot({
        workspace,
        agentId: "default",
        resource: "guardrail:.amc/guardrails.yaml",
        apply: true
      });
      expect(applied.entries).toEqual([
        expect.objectContaining({ id: "guardrail:.amc/guardrails.yaml", status: "restored" })
      ]);
      expect(applied.receiptPath ? existsSync(applied.receiptPath) : false).toBe(true);
      expect(applied.receiptSigPath ? existsSync(applied.receiptSigPath) : false).toBe(true);
      expect(applied.receiptPath ? verifyArtifactFileSignature({ workspace, path: applied.receiptPath }).valid : false).toBe(true);
      expect(readFileSync(guardrails, "utf8")).toBe("rules:\n  - allow\n");
      expect(verifyEnforceResourceManifest({ workspace, agentId: "default" }).valid).toBe(true);
    });
  });

  test("validates, proposes, evaluates, and applies resource lifecycle changes with signed receipts", () => {
    withWorkspace((workspace) => {
      mkdirSync(join(workspace, ".amc"), { recursive: true });
      const guardrails = join(workspace, ".amc", "guardrails.yaml");
      writeFileSync(guardrails, "rules:\n  - allow\n", { encoding: "utf8", flag: "w" });
      writeEnforceResourceManifest({ workspace, agentId: "default" });

      const initialValidation = validateEnforceResourceLifecycle({ workspace, agentId: "default" });
      expect(initialValidation.status).toBe("valid");
      expect(initialValidation.canApply).toBe(true);
      expect(initialValidation.gates.map((gate) => gate.id)).toContain("manifest-signature-valid");

      writeFileSync(guardrails, "rules:\n  - allow\n  - block-secret\n", { encoding: "utf8", flag: "w" });
      const proposal = proposeEnforceResourceLifecycle({ workspace, agentId: "default" });
      expect(proposal.dryRun).toBe(true);
      expect(proposal.diff.changed.map((entry) => entry.id)).toEqual(["guardrail:.amc/guardrails.yaml"]);
      expect(proposal.validation.status).toBe("requires-review");

      const evaluation = evaluateEnforceResourceLifecycle({ workspace, agentId: "default" });
      expect(evaluation.decision).toBe("review");
      expect(evaluation.canApply).toBe(true);

      const dryRun = applyEnforceResourceLifecycle({ workspace, agentId: "default", dryRun: true });
      expect(dryRun.applied).toBe(false);
      expect(dryRun.receiptPath).toBeNull();

      const applied = applyEnforceResourceLifecycle({ workspace, agentId: "default", dryRun: false });
      expect(applied.applied).toBe(true);
      expect(applied.acceptedManifest?.manifest.resourceCount).toBe(1);
      expect(applied.receiptPath ? existsSync(applied.receiptPath) : false).toBe(true);
      expect(applied.receiptSigPath ? existsSync(applied.receiptSigPath) : false).toBe(true);
      expect(applied.receiptPath ? verifyArtifactFileSignature({ workspace, path: applied.receiptPath }).valid : false).toBe(true);
      expect(verifyEnforceResourceManifest({ workspace, agentId: "default" }).valid).toBe(true);

      const history = listEnforceResourceHistory({ workspace, agentId: "default" });
      expect(history.some((entry) => entry.kind === "apply-receipt" && entry.signatureValid)).toBe(true);
      expect(history.some((entry) => entry.kind === "snapshot")).toBe(true);
    });
  });

  test("exposes the AMC-native resource lifecycle contract", () => {
    const contract = enforceResourceLifecycleContract();
    expect(contract.surface).toBe("Enforce");
    expect(contract.verbs).toEqual([
      "list",
      "get",
      "snapshot",
      "diff",
      "validate",
      "propose",
      "evaluate",
      "apply",
      "restore",
      "rollback",
      "history",
      "contract"
    ]);
    expect(contract.resourceKinds).toContain("prompt");
    expect(contract.resourceKinds).toContain("tool");
    expect(contract.resourceKinds).toContain("policy");
    expect(contract.gates).toContain("immutable-resources-protected");
  });
});
