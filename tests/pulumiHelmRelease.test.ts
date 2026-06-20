import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";

const workspace = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(workspace, path), "utf8");
}

describe("Pulumi Helm release example", () => {
  test("ships a Pulumi module for deploying the AMC Helm chart without secret literals", () => {
    const required = [
      "deploy/pulumi/helm-release/Pulumi.yaml",
      "deploy/pulumi/helm-release/package.json",
      "deploy/pulumi/helm-release/tsconfig.json",
      "deploy/pulumi/helm-release/index.ts",
      "deploy/pulumi/helm-release/Pulumi.dev.yaml.example",
      "deploy/pulumi/helm-release/README.md"
    ];
    for (const path of required) {
      expect(existsSync(resolve(workspace, path))).toBe(true);
    }

    const pulumiProject = YAML.parse(read("deploy/pulumi/helm-release/Pulumi.yaml"));
    expect(pulumiProject.name).toBe("amc-helm-release");
    expect(pulumiProject.runtime).toBe("nodejs");

    const pkg = JSON.parse(read("deploy/pulumi/helm-release/package.json"));
    expect(pkg.dependencies).toHaveProperty("@pulumi/pulumi");
    expect(pkg.dependencies).toHaveProperty("@pulumi/kubernetes");

    const program = read("deploy/pulumi/helm-release/index.ts");
    expect(program).toMatch(/new k8s\.helm\.v3\.Release\(\s*"amc"/);
    expect(program).toContain("chart: chartPath");
    expect(program).toContain("createNamespace: true");
    expect(program).toContain("atomic: true");
    expect(program).toContain("cleanupOnFail: true");
    expect(program).toContain("lint: true");
    expect(program).toContain("wait: true");
    expect(program).toContain("skipAwait: false");
    expect(program).toContain("bootstrapSecretName");
    expect(program).toContain("valueYamlFiles");
    expect(program).not.toContain("replace-with-long-random-passphrase");
    expect(program).not.toContain("replace-with-long-random-password");

    const readme = read("deploy/pulumi/helm-release/README.md");
    expect(readme).toContain("Pulumi Kubernetes Helm v3 Release");
    expect(readme).toContain("pulumi config set imageRepository");
    expect(readme).toContain("Do not put vault passphrases or owner passwords in Pulumi stack config");
    expect(readme).toContain("https://www.pulumi.com/registry/packages/kubernetes/api-docs/helm/v3/release/");
    expect(readme).toContain("https://www.pulumi.com/docs/iac/concepts/config/");
  });

  test("documents Pulumi deployment as resolved while preserving hosted SaaS boundaries", () => {
    const guide = read("docs/KUBERNETES_HELM_DEPLOYMENT.md");
    expect(guide).toContain("deploy/pulumi/helm-release/");
    expect(guide).toContain("Pulumi state/config is not the right place for bootstrap secret literals");

    const audit = read("docs/AUDIT_50_AGENTS_BATCH5.md");
    expect(audit).toContain("Pulumi Helm-release module** — ✅ Resolved 2026-06-16");
    expect(audit).toContain("deploy/pulumi/helm-release/");
    expect(audit).toContain("AMC-operated hosted SaaS endpoint remains future work");
    expect(audit).not.toContain("Pulumi module remains open");
    expect(audit).not.toContain("No Pulumi module.");
  });
});
