import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";

const workspace = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(workspace, path), "utf8");
}

describe("cloud reference architecture documentation", () => {
  test("documents self-hosted AWS, GCP, and Azure deployment patterns with official sources", () => {
    const path = "docs/CLOUD_REFERENCE_ARCHITECTURES.md";
    expect(existsSync(resolve(workspace, path))).toBe(true);

    const doc = read(path);
    expect(doc).toContain("Self-hosted cloud boundary");
    expect(doc).toContain("AMC does not publish an AMC-operated hosted SaaS API endpoint from this repository");
    expect(doc).toContain("https://{host}/api");
    expect(doc).toContain("GET /healthz");
    expect(doc).toContain("GET /readyz");

    for (const provider of [
      "## AWS reference architecture",
      "## GCP reference architecture",
      "## Azure reference architecture"
    ]) {
      expect(doc).toContain(provider);
    }

    for (const required of [
      "AWS Fargate",
      "Application Load Balancer",
      "AWS Secrets Manager",
      "Google Cloud Run",
      "Google Kubernetes Engine",
      "Secret Manager",
      "Azure Container Apps",
      "Azure Key Vault",
      "TLS"
    ]) {
      expect(doc).toContain(required);
    }

    for (const source of [
      "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html",
      "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html",
      "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html",
      "https://cloud.google.com/run/docs/overview/what-is-cloud-run",
      "https://cloud.google.com/run/docs/configuring/services/secrets",
      "https://cloud.google.com/kubernetes-engine/docs/concepts/ingress",
      "https://learn.microsoft.com/en-us/azure/container-apps/overview",
      "https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview",
      "https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets"
    ]) {
      expect(doc).toContain(source);
    }
  });

  test("publishes an OpenAPI self-hosted server template without inventing a SaaS endpoint", () => {
    const spec = YAML.parse(read("website/openapi.yaml"));
    const serverUrls = spec.servers.map((server: any) => server.url);
    expect(serverUrls).toContain("http://localhost:3000/api");
    expect(serverUrls).toContain("https://{host}/api");

    const selfHosted = spec.servers.find((server: any) => server.url === "https://{host}/api");
    expect(selfHosted.description).toMatch(/self-hosted/i);
    expect(selfHosted.variables.host.default).toBe("amc.example.com");
    expect(selfHosted.variables.host.description).toMatch(/DNS name/i);
    expect(serverUrls.join("\n")).not.toMatch(/api\.agentmaturity\.co|api\.agentmaturity\.com/i);
  });

  test("closes the cloud-reference and OpenAPI audit gaps without overclaiming hosted SaaS", () => {
    const audit = read("docs/AUDIT_50_AGENTS_BATCH5.md");
    expect(audit).toContain("Cloud reference architectures** — ✅ Resolved 2026-06-16");
    expect(audit).toContain("OpenAPI self-hosted server template** — ✅ Resolved 2026-06-16");
    expect(audit).toContain("Pulumi Helm-release module** — ✅ Resolved 2026-06-16");
    expect(audit).toContain("AMC-operated hosted SaaS endpoint remains future work");
    expect(audit).not.toContain("No provider-specific AWS/GCP/Azure reference architectures.");
    expect(audit).not.toContain("Pulumi module remains open");
    expect(audit).not.toContain("Only documents `http://localhost:3000/api` server. No production/cloud server listed.");
    expect(audit).not.toContain("The OpenAPI spec only documents `localhost:3000/api`");
  });
});
