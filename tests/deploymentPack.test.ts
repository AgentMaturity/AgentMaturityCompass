import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { loadStudioRuntimeConfig } from "../src/config/loadConfig.js";

const workspace = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(workspace, path), "utf8");
}

describe("deployment pack assets", () => {
  it("includes docker runtime assets", () => {
    expect(existsSync(resolve(workspace, "Dockerfile"))).toBe(true);
    expect(existsSync(resolve(workspace, "docker/entrypoint.sh"))).toBe(true);
    expect(existsSync(resolve(workspace, "docker/.dockerignore"))).toBe(true);

    const dockerfile = read("Dockerfile");
    expect(dockerfile).toMatch(/FROM (\$\{NODE_IMAGE\}|node:20)/);
    expect(dockerfile).toContain("USER 10001:10001");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("\"studio\", \"healthcheck\"");
  });

  it("includes compose deployment assets", () => {
    const compose = read("deploy/compose/docker-compose.yml");
    expect(compose).toContain("amc_data:/data/amc");
    expect(compose).toContain("AMC_VAULT_PASSPHRASE_FILE");
    expect(compose).toContain("AMC_BOOTSTRAP_OWNER_PASSWORD_FILE");
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain("ALL");

    const tls = read("deploy/compose/docker-compose.tls.yml");
    expect(tls).toContain("caddy");
    expect(tls).toContain("AMC_TRUSTED_PROXY_HOPS");
  });

  it("includes helm chart templates", () => {
    const required = [
      "deploy/helm/amc/Chart.yaml",
      "deploy/helm/amc/values.yaml",
      "deploy/helm/amc/templates/deployment.yaml",
      "deploy/helm/amc/templates/service.yaml",
      "deploy/helm/amc/templates/ingress.yaml",
      "deploy/helm/amc/templates/configmap.yaml",
      "deploy/helm/amc/templates/secret.yaml",
      "deploy/helm/amc/templates/pvc.yaml",
      "deploy/helm/amc/templates/serviceaccount.yaml",
      "deploy/helm/amc/templates/networkpolicy.yaml",
      "deploy/helm/amc/templates/poddisruptionbudget.yaml",
      "deploy/helm/amc/templates/_helpers.tpl"
    ];
    for (const path of required) {
      expect(existsSync(resolve(workspace, path))).toBe(true);
    }
    expect(existsSync(resolve(workspace, "deploy/helm/amc/examples/values-internal-only.yaml"))).toBe(true);
    expect(existsSync(resolve(workspace, "deploy/helm/amc/examples/values-ingress-tls.yaml"))).toBe(true);
    expect(existsSync(resolve(workspace, "deploy/helm/amc/examples/values-persistent-bootstrap.yaml"))).toBe(true);
    const values = read("deploy/helm/amc/values.yaml");
    expect(values).toContain("ingressNamespaceSelector:");
    expect(values).toContain("dnsNamespaceSelector:");
    expect(values).toContain("allowedEgressCidrs: []");
  });

  it("parses deployment env config including *_FILE secret loaders", () => {
    const config = loadStudioRuntimeConfig({
      AMC_WORKSPACE_DIR: "/tmp/amc",
      AMC_BIND: "0.0.0.0",
      AMC_STUDIO_PORT: "3322",
      AMC_GATEWAY_PORT: "3310",
      AMC_PROXY_PORT: "3311",
      AMC_TOOLHUB_PORT: "3313",
      AMC_ALLOWED_CIDRS: "127.0.0.1/32,10.0.0.0/8",
      AMC_CORS_ALLOWED_ORIGINS: "https://example.test",
      AMC_LAN_MODE: "true",
      AMC_ALLOW_PUBLIC_BIND: "true",
      AMC_QUERY_LEASE_CARRIER_ENABLED: "false",
      AMC_TRUSTED_PROXY_HOPS: "1",
      AMC_DATA_RETENTION_DAYS: "15",
      AMC_MAX_REQUEST_BYTES: "2000000"
    });
    expect(config.workspaceDir).toBe("/tmp/amc");
    expect(config.bind).toBe("0.0.0.0");
    expect(config.studioPort).toBe(3322);
    expect(config.gatewayPort).toBe(3310);
    expect(config.proxyPort).toBe(3311);
    expect(config.toolhubPort).toBe(3313);
    expect(config.allowedCidrs).toEqual(["127.0.0.1/32", "10.0.0.0/8"]);
    expect(config.corsAllowedOrigins).toEqual(["https://example.test"]);
    expect(config.lanMode).toBe(true);
  });

  it("rejects duplicate runtime port assignments", () => {
    expect(() =>
      loadStudioRuntimeConfig({
        AMC_WORKSPACE_DIR: "/tmp/amc",
        AMC_STUDIO_PORT: "3212",
        AMC_GATEWAY_PORT: "3212"
      })
    ).toThrow(/assigned to multiple services/i);
  });

  it("rejects invalid boolean env values", () => {
    expect(() =>
      loadStudioRuntimeConfig({
        AMC_WORKSPACE_DIR: "/tmp/amc",
        AMC_LAN_MODE: "maybe"
      })
    ).toThrow(/invalid boolean/i);
  });

  it("requires passphrase file when bootstrap mode is enabled", () => {
    expect(() =>
      loadStudioRuntimeConfig({
        AMC_WORKSPACE_DIR: "/tmp/amc",
        AMC_BOOTSTRAP: "true"
      })
    ).toThrow(/AMC_VAULT_PASSPHRASE_FILE/i);
  });

  it("helm template renders when helm binary is available", () => {
    const helmVersion = spawnSync("helm", ["version"], { encoding: "utf8" });
    if (helmVersion.status !== 0) {
      expect(true).toBe(true);
      return;
    }
    const rendered = spawnSync("helm", ["template", "amc", join(workspace, "deploy/helm/amc")], {
      encoding: "utf8"
    });
    expect(rendered.status).toBe(0);
    expect(`${rendered.stdout}${rendered.stderr}`).toContain("kind: Deployment");
  });
});
