import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  MetricRegistry,
  type MetricInput,
  type MetricResult,
  type MetricTemplate,
} from "../src/agents/metricTemplates.js";
import { artifactSigPath, signArtifactFile, verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
import {
  buildEvaluatorRegistryProjection,
  evaluatorRegistryPath,
  evaluatorRegistryStatus,
  refreshEvaluatorRegistry,
  renderEvaluatorRegistryStatusText,
} from "../src/eval/evaluatorRegistryMetadata.js";

const roots: string[] = [];

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-1478-evaluator-registry-"));
  roots.push(root);
  return root;
}

function customMetric(id = "custom_runtime_metric"): MetricTemplate {
  return {
    id,
    name: "Custom Runtime Metric",
    description: "Workspace-provided runtime evaluator",
    category: "custom",
    outputType: "float",
    defaultThreshold: 0.7,
    evaluate: (_input: MetricInput): MetricResult => ({
      metricId: id,
      metricName: "Custom Runtime Metric",
      score: 1,
      passed: true,
      details: "custom result",
      category: "custom",
      outputType: "float",
    }),
  };
}

function rewriteAndSign(
  root: string,
  mutate: (value: Record<string, unknown>) => void,
  artifactKind: "evaluator-registry-manifest" | "lifecycle-artifact" = "evaluator-registry-manifest",
): void {
  const path = evaluatorRegistryPath(root);
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutate(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  signArtifactFile({ workspace: root, path, artifactKind });
}

function runCli(root: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1478 signed evaluator registry metadata", () => {
  test("projects deterministic metadata over existing AMC evaluator owners", () => {
    const first = buildEvaluatorRegistryProjection();
    const second = buildEvaluatorRegistryProjection();

    expect(first.registrySha256).toBe(second.registrySha256);
    expect(first.entries).toEqual(second.entries);
    expect(first.entryCount).toBe(first.entries.length);
    expect(first.entries.map((entry) => entry.id)).toEqual(
      [...first.entries.map((entry) => entry.id)].sort(),
    );
    expect(new Set(first.entries.map((entry) => entry.id)).size).toBe(first.entryCount);
    expect(first.entries.find((entry) => entry.id === "metric://amc/pii_leakage")).toMatchObject({
      kind: "deterministic-metric",
      surfaces: ["Score", "Shield"],
      metadataTrust: "amc-owned",
      resultEvidenceRequired: true,
    });
    expect(first.entries.find((entry) => entry.id === "judge://amc/faithfulness")).toMatchObject({
      kind: "llm-judge",
      surfaces: ["Score"],
      metadataTrust: "amc-owned",
      resultEvidenceRequired: true,
    });
    expect(first.entries.find((entry) => entry.id === "assurance://amc/evaluationReliability")).toMatchObject({
      kind: "assurance-pack",
      surfaces: ["Shield"],
      metadataTrust: "amc-owned",
      resultEvidenceRequired: true,
    });
    expect(first.trustedEntryCount).toBe(first.entryCount);
    expect(first.unverifiedEntryCount).toBe(0);
  });

  test("binds package-relative owner modules and exact loaded implementation hashes without source bodies", () => {
    const projection = buildEvaluatorRegistryProjection();
    for (const entry of projection.entries) {
      expect(entry.implementationSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.definitionSha256).toMatch(/^[a-f0-9]{64}$/);
      if (entry.ownerModule !== null) {
        expect(entry.ownerModule).toMatch(/^(src|dist)\//);
        expect(entry.ownerModule).not.toContain(process.cwd());
      }
    }
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
    expect(serialized).not.toContain("JUDGE_PROMPTS");
    expect(serialized).not.toContain("evaluate: (");
  });

  test("writes and verifies one explicit domain-separated signed snapshot", () => {
    const root = workspace();
    expect(evaluatorRegistryStatus({ workspace: root })).toMatchObject({
      status: "uninitialized",
      claimEligible: false,
      reasonCodes: ["SIGNED_REGISTRY_MISSING"],
    });
    expect(existsSync(join(root, ".amc"))).toBe(false);

    const refreshed = refreshEvaluatorRegistry({ workspace: root });
    expect(refreshed).toMatchObject({
      status: "trusted",
      claimEligible: true,
      signedSnapshot: {
        registrySha256: refreshed.current.registrySha256,
      },
      reasonCodes: [],
    });
    expect(refreshed.path).toBe("$WORKSPACE/.amc/evaluators/registry.json");
    expect(refreshed.signaturePath).toBe("$WORKSPACE/.amc/evaluators/registry.json.sig");
    expect(verifyArtifactFileSignature({
      workspace: root,
      path: evaluatorRegistryPath(root),
      artifactKind: "evaluator-registry-manifest",
      requireDomainSeparated: true,
    })).toMatchObject({ valid: true });
  });

  test("discloses runtime custom metrics but keeps the signed snapshot partial and non-claimable", () => {
    const root = workspace();
    const metricRegistry = new MetricRegistry();
    metricRegistry.registerMetric(customMetric());
    metricRegistry.registerMetric(customMetric("pii_leakage"));

    const refreshed = refreshEvaluatorRegistry({ workspace: root, metricRegistry });
    const custom = refreshed.current.entries.find((entry) => entry.id === "custom-metric://amc/custom_runtime_metric");
    expect(custom).toMatchObject({
      kind: "custom-metric",
      ownerModule: null,
      version: null,
      metadataTrust: "unverified-custom",
      resultEvidenceRequired: true,
    });
    expect(refreshed.current.entries.find((entry) => entry.id === "metric://amc/pii_leakage")).toBeUndefined();
    expect(refreshed.current.entries.find((entry) => entry.id === "custom-metric://amc/pii_leakage"))
      .toMatchObject({ metadataTrust: "unverified-custom", ownerModule: null, version: null });
    expect(refreshed).toMatchObject({
      status: "partial",
      claimEligible: false,
      current: { unverifiedEntryCount: 2 },
    });
    expect(refreshed.reasonCodes).toContain("UNVERIFIED_CUSTOM_EVALUATORS");
  });

  test("marks an otherwise valid signed snapshot stale when the loaded evaluator inventory changes", () => {
    const root = workspace();
    const signed = refreshEvaluatorRegistry({ workspace: root });
    const changed = new MetricRegistry();
    changed.registerMetric(customMetric("new_runtime_metric"));
    const status = evaluatorRegistryStatus({ workspace: root, metricRegistry: changed });

    expect(status).toMatchObject({ status: "stale", claimEligible: false });
    expect(status.current.registrySha256).not.toBe(signed.current.registrySha256);
    expect(status.signedSnapshot?.registrySha256).toBe(signed.current.registrySha256);
    expect(status.reasonCodes).toContain("CURRENT_RUNTIME_DRIFT");
  });

  test("fails closed for tamper, missing signatures, wrong kinds, and duplicate signed keys", () => {
    const cases: Array<{ name: string; mutate: (root: string) => void }> = [
      {
        name: "tampered payload",
        mutate: (root) => {
          const path = evaluatorRegistryPath(root);
          const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
          value.entryCount = 0;
          writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
        },
      },
      {
        name: "missing signature",
        mutate: (root) => unlinkSync(artifactSigPath(evaluatorRegistryPath(root))),
      },
      {
        name: "wrong artifact kind",
        mutate: (root) => rewriteAndSign(root, () => undefined, "lifecycle-artifact"),
      },
      {
        name: "duplicate signed key",
        mutate: (root) => {
          const path = evaluatorRegistryPath(root);
          const raw = readFileSync(path, "utf8").replace(
            '  "entryCount":',
            '  "entryCount": 0,\n  "entryCount":',
          );
          writeFileSync(path, raw);
          signArtifactFile({ workspace: root, path, artifactKind: "evaluator-registry-manifest" });
        },
      },
    ];

    for (const item of cases) {
      const root = workspace();
      refreshEvaluatorRegistry({ workspace: root });
      item.mutate(root);
      const status = evaluatorRegistryStatus({ workspace: root });
      expect(status, item.name).toMatchObject({ status: "invalid", claimEligible: false });
      expect(status.reasonCodes, item.name).toContain("SIGNED_REGISTRY_INVALID");
    }
  });

  test("rejects re-signed count, definition-hash, and duplicate-ID inconsistencies", () => {
    const cases: Array<{ name: string; mutate: (value: Record<string, unknown>) => void }> = [
      { name: "count mismatch", mutate: (value) => { value.entryCount = 0; } },
      {
        name: "definition hash mismatch",
        mutate: (value) => {
          const entries = value.entries as Array<Record<string, unknown>>;
          entries[0]!.definitionSha256 = "0".repeat(64);
        },
      },
      {
        name: "duplicate id",
        mutate: (value) => {
          const entries = value.entries as Array<Record<string, unknown>>;
          entries[1]!.id = entries[0]!.id;
        },
      },
    ];
    for (const item of cases) {
      const root = workspace();
      refreshEvaluatorRegistry({ workspace: root });
      rewriteAndSign(root, item.mutate);
      const status = evaluatorRegistryStatus({ workspace: root });
      expect(status, item.name).toMatchObject({ status: "invalid", claimEligible: false });
      expect(status.reasonCodes, item.name).toContain("SIGNED_REGISTRY_INVALID");
    }
  });

  test("renders one claim-bounded human projection", () => {
    const root = workspace();
    const status = refreshEvaluatorRegistry({ workspace: root });
    const text = renderEvaluatorRegistryStatusText(status);
    expect(text).toContain("Evaluator registry: TRUSTED");
    expect(text).toContain(`Current hash: ${status.current.registrySha256}`);
    expect(text).toContain("Score");
    expect(text).toContain("Shield");
    expect(text).toContain("not evaluator-result evidence");
    expect(text).not.toContain(root);
  });

  test("exposes the same source-independent projection through the built CLI", () => {
    const root = workspace();
    const refreshed = runCli(root, ["eval", "registry", "--refresh", "--json"]);
    expect(refreshed.status, refreshed.stderr).toBe(0);
    const value = JSON.parse(refreshed.stdout) as ReturnType<typeof evaluatorRegistryStatus>;
    expect(value).toMatchObject({ status: "trusted", claimEligible: true });
    expect(value.current.entries.every((entry) => entry.ownerModule === null || entry.ownerModule.startsWith("dist/"))).toBe(true);

    const shown = runCli(root, ["eval", "registry"]);
    expect(shown.status, shown.stderr).toBe(0);
    expect(shown.stdout).toContain("Evaluator registry: TRUSTED");
    expect(shown.stdout).toContain("not evaluator-result evidence");
  });

  test("documents relevance, explicit refresh, fail-closed behavior, and no-bloat closure", () => {
    for (const path of [
      "README.md",
      "docs/EVALUATOR_REGISTRY.md",
      "website/docs/cli.html",
      "docs/source-reviews/AMC-1478-signed-evaluator-registry-metadata.md",
    ]) {
      const body = readFileSync(path, "utf8");
      expect(body, path).toContain("amc eval registry");
    }
    const review = readFileSync("docs/source-reviews/AMC-1478-signed-evaluator-registry-metadata.md", "utf8");
    for (const boundary of [
      "83188b62c63e2b4ff9ada87048fd99605184ee5a",
      "Fail-closed rule",
      "No-bloat boundary",
      "not evaluator-result evidence",
    ]) expect(review).toContain(boundary);
    expect(readFileSync("docs/internal/agent-control-agentapprove-competitive-response.md", "utf8"))
      .toContain("Implemented in AMC-1478");
  });
});
