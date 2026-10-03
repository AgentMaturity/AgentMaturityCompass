import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  checkProbes,
  checkSingleWriter,
  checkVersions,
  findSecretLiterals,
  findSecretLiteralsInValues,
  readYamlDocs
} from "../scripts/deploy/validate-assets.mjs";
import { rollbackHazards } from "../scripts/deploy/rollback-check.mjs";

const root = process.cwd();
const packageVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version as string;

describe("deployment assets: version consistency", () => {
  it("Helm chart appVersion equals the package.json version", () => {
    const chart = YAML.parse(readFileSync(resolve(root, "deploy/helm/amc/Chart.yaml"), "utf8"));
    expect(chart.appVersion).toBe(packageVersion);
    expect(checkVersions(root).errors).toEqual([]);
  });

  it("validate-assets exits 0 and prints the validated chart appVersion", () => {
    const run = spawnSync(process.execPath, ["scripts/deploy/validate-assets.mjs"], { cwd: root, encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`appVersion ${packageVersion} == package.json ${packageVersion}`);
  });
});

describe("deployment assets: no default or demo secret reaches a manifest", () => {
  it("finds no literal secret in Helm values, templates, k8s manifests or docker assets", () => {
    expect(findSecretLiterals(root)).toEqual([]);
  });

  it("flags a literal passphrase injected into a values default", () => {
    const values = { env: { AMC_VAULT_PASSPHRASE: "hunter2" }, bootstrap: { vaultPassphrase: "x" } };
    expect(findSecretLiteralsInValues(values, "values.yaml")).toHaveLength(2);
    // Secret references (name/key objects, *Name keys) are not literals.
    const refs = { notary: { passphraseSecret: { name: "amc-bootstrap", key: "notaryPassphrase" } }, tls: [{ secretName: "amc-tls" }] };
    expect(findSecretLiteralsInValues(refs, "values.yaml")).toEqual([]);
  });

  it("raw k8s secret example matches the secret the deployment mounts", () => {
    const [example] = readYamlDocs(resolve(root, "deploy/k8s/secret.example.yaml"));
    const [deployment] = readYamlDocs(resolve(root, "deploy/k8s/deployment.yaml"));
    const secretVolume = deployment.spec.template.spec.volumes.find((v: { secret?: unknown }) => v.secret);
    expect(secretVolume.secret.secretName).toBe(example.metadata.name);
    for (const item of secretVolume.secret.items) {
      expect(Object.keys(example.stringData)).toContain(item.key);
    }
    for (const value of Object.values(example.stringData)) {
      expect(String(value)).toMatch(/^REPLACE_WITH_/);
    }
    const kustomization = YAML.parse(readFileSync(resolve(root, "deploy/k8s/kustomization.yaml"), "utf8"));
    expect(kustomization.resources).not.toContain("secret.yaml");
    expect(kustomization.resources).not.toContain("secret.example.yaml");
  });

  it("every Helm example values file parses (no duplicate keys)", () => {
    for (const name of ["values-internal-only.yaml", "values-ingress-tls.yaml", "values-persistent-bootstrap.yaml"]) {
      expect(() => readYamlDocs(resolve(root, "deploy/helm/amc/examples", name))).not.toThrow();
    }
  });
});

describe("deployment assets: probes and rollout safety", () => {
  it("probes target AMC health endpoints that exist in the server source", () => {
    const result = checkProbes(root);
    expect(result.errors).toEqual([]);
    const paths = new Set(result.probes.map((probe: { path: string }) => probe.path));
    expect(paths).toEqual(new Set(["/healthz", "/readyz"]));
    // Helm and raw manifests both gate startup, readiness and liveness for Studio.
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
      kind: "PersistentVolumeClaim",
      metadata: { name: "amc" },
      spec: { accessModes: modes, resources: { requests: { storage: size } } }
    });
    expect(rollbackHazards([deployment("a"), pvc("10Gi")], [deployment("a"), pvc("10Gi")])).toEqual([]);
    expect(rollbackHazards([deployment("a")], [deployment("b")])[0]).toMatch(/selector/);
    expect(rollbackHazards([pvc("20Gi")], [pvc("10Gi")])[0]).toMatch(/shrink/);
    expect(rollbackHazards([pvc("10Gi")], [pvc("10Gi", ["ReadWriteMany"])])[0]).toMatch(/accessModes/);
    expect(rollbackHazards([pvc("10Gi")], [])[0]).toMatch(/removed/);
    expect(rollbackHazards([{ kind: "Secret", metadata: { name: "amc-bootstrap" } }], [])[0]).toMatch(/resource-policy=keep/);
  });

  it("rollback-check renders HEAD and the working tree and finds no rollback hazard", () => {
    const run = spawnSync(process.execPath, ["scripts/deploy/rollback-check.mjs", "--from", "HEAD"], { cwd: root, encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("hazards: 0");
  });
});
