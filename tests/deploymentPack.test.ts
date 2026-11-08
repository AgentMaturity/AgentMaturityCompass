import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import * as YAML from "yaml";
import { loadStudioRuntimeConfig } from "../src/config/loadConfig.js";
import { interpolate, serviceEnv } from "./helpers/composeInterpolate.js";
import { dockerfileStudioHealthcheck } from "./helpers/deployPackFixtures.js";

const workspace = fileURLToPath(new URL("../", import.meta.url));

function read(path: string): string {
  return readFileSync(resolve(workspace, path), "utf8");
}

const COMPOSE_FILES = ["deploy/compose/docker-compose.yml", "deploy/compose/docker-compose.tls.yml",
  "deploy/compose/docker-compose.studio-api.yml", "docker/docker-compose.yml"] as const;
/** The Studio services by name: a check keyed on build.target would also catch the notary (studio target, not Studio). */
const STUDIO_SERVICES = [["deploy/compose/docker-compose.yml", "studio"], ["deploy/compose/docker-compose.tls.yml", "amc-studio"],
  ["docker/docker-compose.yml", "amc-studio"]] as const;
const HTTP_STACKS = ["deploy/compose/docker-compose.yml", "docker/docker-compose.yml"] as const;
type ComposeService = { tmpfs?: string | string[]; volumes?: (string | { target?: string })[]; ports?: string[];
  environment?: string[] | Record<string, unknown>; stop_grace_period?: string; restart?: string;
  healthcheck?: { test: string[]; interval?: string; timeout?: string; retries?: number; start_period?: string } };
const composeServices = (path: string): Record<string, ComposeService> => YAML.parse(read(path)).services;
/** Container path of a volume entry: `src:dst[:opts]` or the long form's `target`. */
const volumeTarget = (entry: string | { target?: string }) => typeof entry === "string" ? entry.split(":")[1] ?? entry : entry.target;
/** Compose/Docker duration (`30s`, `2m`, `1m30s`) in seconds. */
const seconds = (duration = "") => [...duration.matchAll(/(\d+)(h|m|s)/g)].reduce((total, [, n, unit]) => total + Number(n) * ({ h: 3600, m: 60, s: 1 } as Record<string, number>)[unit!]!, 0);

describe("compose runtime layout (LIVE-DEPLOY-01)", () => {
  it("mounts no volume beneath a tmpfs path (docker-helm 2026-11-07)", () => {
    // Docker creates the mount point of a volume nested in a tmpfs as root:root 0755, which assertOwnerOnly refuses.
    const nested: string[] = [];
    for (const file of COMPOSE_FILES) {
      for (const [name, service] of Object.entries(composeServices(file))) {
        const tmpfs = [service.tmpfs ?? []].flat().map((entry) => entry.split(":")[0]!);
        for (const target of (service.volumes ?? []).map(volumeTarget)) {
          for (const path of tmpfs) if (target === path || target?.startsWith(`${path}/`)) nested.push(`${file} ${name}: ${target} under tmpfs ${path}`);
        }
      }
    }
    expect(nested).toEqual([]);
  });

  it("persists the signed-control checkpoint root outside /data/amc", () => {
    for (const [file, name] of STUDIO_SERVICES) {
      const service = composeServices(file)[name]!;
      expect(serviceEnv(service).AMC_CONTROL_CHECKPOINT_DIR, `${file} ${name}`).toBe("/workspace/control-checkpoints");
      expect((service.volumes ?? []).map(volumeTarget), `${file} ${name}`).toContain("/workspace");
    }
    const dockerRun = /```bash\ndocker run --rm \\\n[\s\S]*?```/.exec(read("docker/README.md"))?.[0] ?? "";
    expect(dockerRun).toContain("-e AMC_CONTROL_CHECKPOINT_DIR=/workspace/control-checkpoints");
    expect(dockerRun).toContain("-v amc_control_checkpoints:/workspace");
    expect(dockerRun).toContain("-v amc_state:/home/amc/.config/amc/state");
    expect(dockerRun).not.toContain("--tmpfs /home/amc");
  });

  it("gives Studio a stop grace period and a restart policy", () => {
    // Studio drains up to 10 s before it seals its session; Docker's 10 s default can kill it first.
    for (const [file, name] of [...STUDIO_SERVICES, ["deploy/compose/docker-compose.studio-api.yml", "amc-api"]] as const) {
      expect(composeServices(file)[name]!.stop_grace_period, `${file} ${name}`).toBe("40s");
    }
    expect(composeServices("deploy/compose/docker-compose.yml").studio!.restart).toBe("unless-stopped");
  });

  it("publishes HTTP ports on loopback unless AMC_PUBLISH_ADDRESS says otherwise", () => {
    for (const file of HTTP_STACKS) {
      for (const [name, service] of Object.entries(composeServices(file))) {
        for (const port of service.ports ?? []) expect(port, `${file} ${name}`).toMatch(/^\$\{AMC_PUBLISH_ADDRESS:-127\.0\.0\.1\}:/);
      }
    }
    const studioPort = (env: Record<string, string>) => composeServices("deploy/compose/docker-compose.yml").studio!.ports!
      .map((port) => interpolate(port, env)).find((port) => port.endsWith(":3212"));
    expect(studioPort({})).toBe("127.0.0.1:3212:3212");
    expect(studioPort({ AMC_STUDIO_PORT: "47123" })).toBe("127.0.0.1:47123:3212");
    expect(studioPort({ AMC_PUBLISH_ADDRESS: "0.0.0.0" })).toBe("0.0.0.0:3212:3212");
    expect(read("deploy/compose/.env.example")).toMatch(/^AMC_PUBLISH_ADDRESS=127\.0\.0\.1$/m);
  });
});

describe("Helm chart 0.4.1 signed-control checkpoint root (LIVE-DEPLOY-15)", () => {
  it("roots signed-control checkpoints on the state claim, outside the workspace, in the chart and the raw manifests", () => {
    // Firewall, guardrail, legal-hold and compiled-control journals checkpoint under AMC_CONTROL_CHECKPOINT_DIR; its default
    // ($HOME/.amc/control-checkpoints) is on the read-only root filesystem, and the root must be outside the workspace.
    expect(read("deploy/helm/amc/templates/configmap.yaml")).toContain(
      "AMC_CONTROL_CHECKPOINT_DIR: {{ printf \"%s/control-checkpoints\" .Values.amcHomeState.mountPath | quote }}");
    expect(YAML.parse(read("deploy/helm/amc/Chart.yaml")).version).toBe("0.4.1");
    const values = YAML.parse(read("deploy/helm/amc/values.yaml"));
    const rendered = `${values.amcHomeState.mountPath}/control-checkpoints`;
    expect(rendered.startsWith(`${values.workspace.mountPath}/`)).toBe(false);
    const studio = YAML.parse(read("deploy/k8s/deployment.yaml")).spec.template.spec.containers[0];
    expect(studio.env).toContainEqual({ name: "AMC_CONTROL_CHECKPOINT_DIR", value: rendered });
    expect(studio.volumeMounts).toContainEqual({ name: "amc-home-state", mountPath: values.amcHomeState.mountPath });
  });
});

describe("container healthcheck (LIVE-DEPLOY-03, L-HC)", () => {
  it("probes Studio over HTTP with a bounded timeout in the image and every compose Studio service", () => {
    // The CLI probe loaded the whole CLI for two GETs: 42 s under load against a 10 s timeout while /readyz was READY.
    const dockerfile = read("Dockerfile");
    const { options, cmd } = dockerfileStudioHealthcheck(dockerfile);
    expect(cmd?.slice(0, 2)).toEqual(["node", "-e"]);
    const probe = cmd![2]!;
    for (const part of ["/healthz", "/readyz", "AbortSignal.timeout("]) expect(probe).toContain(part);
    expect(dockerfile).not.toContain("\"studio\", \"healthcheck\"");
    expect(options).toBe("--interval=30s --timeout=10s --start-period=120s --retries=5");
    for (const [file, name] of STUDIO_SERVICES) {
      const healthcheck = composeServices(file)[name]!.healthcheck;
      expect(healthcheck?.test.slice(0, 3), `${file} ${name}`).toEqual(["CMD", "node", "-e"]);
      expect(healthcheck?.test[3], `${file} ${name}`).toBe(probe);
      expect(seconds(healthcheck?.timeout), `${file} ${name}`).toBeLessThanOrEqual(10);
      expect(seconds(healthcheck?.start_period), `${file} ${name}`).toBeGreaterThanOrEqual(60);
    }
    // The notary is built from the studio target but runs `amc notary start`; it keeps its own probe.
    expect(composeServices("deploy/compose/docker-compose.tls.yml")["amc-notary"]!.healthcheck?.test[3]).toContain("http://127.0.0.1:4343/readyz");
  });
});

describe("deployment pack assets", () => {
  it("includes docker runtime assets", () => {
    expect(existsSync(resolve(workspace, "Dockerfile"))).toBe(true);
    expect(existsSync(resolve(workspace, "docker/entrypoint.sh"))).toBe(true);
    expect(existsSync(resolve(workspace, "docker/.dockerignore"))).toBe(true);

    const dockerfile = read("Dockerfile");
    expect(dockerfile).toMatch(/FROM (\$\{NODE_IMAGE\}|node:20)/);
    expect(dockerfile).toContain("USER 10001:10001");
    expect(dockerfile).toContain("HEALTHCHECK");
  });

  it("does not advertise unverified GHCR quickstart images as published", () => {
    const readme = read("README.md");
    const publishing = read("docs/PUBLISHING.md");
    const audit = read("docs/archive/AUDIT_50_AGENTS_BATCH5.md");

    expect(readme).not.toContain("ghcr.io/agentmaturity/amc-quickstart");
    expect(readme).toContain("docker build -t amc-quickstart");
    expect(readme).toContain("Use the local build command unless a GHCR package has been verified public.");
    expect(publishing).toContain("GHCR visibility must be verified before publishing copy-paste `docker run ghcr.io/...` commands.");
    expect(audit).toContain("GHCR quickstart image claim — ✅ Resolved 2026-06-16");
    expect(audit).not.toContain("Status unknown (image may not be published)");
    expect(audit).not.toContain("not verified as actually published");
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

  it("persists <AMC home>/state, where anti-rollback marks live, in compose and the Helm chart (P1-08 review M4)", () => {
    const statePath = "/home/amc/.config/amc/state";
    for (const file of ["docker/docker-compose.yml", "deploy/compose/docker-compose.yml", "deploy/compose/docker-compose.tls.yml", "deploy/compose/docker-compose.studio-api.yml"]) {
      expect(read(file), file).toMatch(new RegExp(`- [a-z_-]+:${statePath.replace(/\//g, "\\/")}`));
    }
    expect(read("Dockerfile")).toContain(statePath);
    const values = read("deploy/helm/amc/values.yaml");
    expect(values).toContain(`mountPath: ${statePath}`);
    expect(values).toMatch(/amcHomeState:\n  mountPath: [^\n]+\n  persistence:\n    enabled: true/);
    expect(read("deploy/helm/amc/templates/pvc-state.yaml")).toContain("name: {{ include \"amc.fullname\" . }}-state");
    const deployment = read("deploy/helm/amc/templates/deployment.yaml");
    expect(deployment).toContain("- name: amc-home-state\n              mountPath: {{ .Values.amcHomeState.mountPath }}");
    expect(deployment).toContain("claimName: {{ include \"amc.fullname\" . }}-state");
    // The raw manifests match chart 0.3.0.
    expect(read("deploy/k8s/pvc.yaml")).toContain("name: amc-home-state");
    expect(read("deploy/k8s/deployment.yaml")).toContain("- name: amc-home-state\n              mountPath: /home/amc/.config/amc/state");
    expect(read("deploy/k8s/deployment.yaml")).toContain("claimName: amc-home-state");
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

  it("documents Kubernetes, Helm, and Terraform deployment paths", () => {
    const guide = read("docs/KUBERNETES_HELM_DEPLOYMENT.md");
    expect(guide).toContain("helm upgrade --install amc deploy/helm/amc");
    expect(guide).toContain("kubectl -n amc-system create secret generic amc-bootstrap");
    expect(guide).toContain("GET /healthz");
    expect(guide).toContain("GET /readyz");
    expect(guide).toContain("deploy/terraform/helm-release/");
    expect(guide).toContain("Terraform state is not the right place for those values");
    expect(guide).toContain("Helm `install` docs");
    expect(guide).toContain("Kubernetes probe docs");

    const terraformMain = read("deploy/terraform/helm-release/main.tf");
    const terraformVersions = read("deploy/terraform/helm-release/versions.tf");
    const terraformVars = read("deploy/terraform/helm-release/variables.tf");
    const terraformReadme = read("deploy/terraform/helm-release/README.md");
    expect(terraformVersions).toContain('source  = "hashicorp/helm"');
    expect(terraformMain).toContain('resource "helm_release" "amc"');
    expect(terraformMain).toContain("create_namespace = true");
    expect(terraformMain).toContain("atomic           = true");
    expect(terraformMain).toContain("cleanup_on_fail  = true");
    expect(terraformMain).toContain("lint             = true");
    expect(terraformMain).toContain("wait             = true");
    expect(terraformVars).not.toContain("passphrase");
    expect(terraformVars).not.toContain("password");
    expect(terraformReadme).toContain("Do not put vault passphrases or owner passwords in `terraform.tfvars`");

    const audit = read("docs/archive/AUDIT_50_AGENTS_BATCH5.md");
    expect(audit).toContain("Kubernetes/Helm deployment guide** — ✅ Resolved 2026-06-16");
    expect(audit).toContain("Terraform Helm-release example exists at `deploy/terraform/helm-release/`");
    expect(audit).not.toContain("No Kubernetes Helm chart or k8s manifests.");
    expect(audit).not.toContain("No Terraform or Pulumi modules.");
    expect(audit).not.toContain("cloud native story is still pre-Kubernetes");
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

  it("prefers vault passphrase file over inherited direct env passphrase", () => {
    const tmp = mkdtempSync(join(tmpdir(), "amc-deploy-test-"));
    try {
      const passphraseFile = join(tmp, "vault.txt");
      writeFileSync(passphraseFile, "file-passphrase-123", "utf8");
      const config = loadStudioRuntimeConfig({
        AMC_WORKSPACE_DIR: "/tmp/amc",
        AMC_VAULT_PASSPHRASE: "inherited-image-default",
        AMC_VAULT_PASSPHRASE_FILE: passphraseFile
      });
      expect(config.vaultPassphrase).toBe("file-passphrase-123");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reads the dashboard port from AMC_DASHBOARD_PORT and refuses one another service uses", () => {
    expect(loadStudioRuntimeConfig({ AMC_WORKSPACE_DIR: "/tmp/amc" }).dashboardPort).toBe(4173);
    expect(loadStudioRuntimeConfig({ AMC_WORKSPACE_DIR: "/tmp/amc", AMC_DASHBOARD_PORT: "45173" }).dashboardPort).toBe(45173);
    expect(() => loadStudioRuntimeConfig({ AMC_WORKSPACE_DIR: "/tmp/amc", AMC_DASHBOARD_PORT: "3212" }))
      .toThrow(/port 3212 is assigned to multiple services \(AMC_STUDIO_PORT, AMC_DASHBOARD_PORT\)/);
    // Unset, the dashboard keeps falling back to a free port, so a service already on 4173 stays valid.
    expect(loadStudioRuntimeConfig({ AMC_WORKSPACE_DIR: "/tmp/amc", AMC_METRICS_PORT: "4173" }).metricsPort).toBe(4173);
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

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CHART = fileURLToPath(new URL("../deploy/helm/amc/", import.meta.url));
const KEYS = ["vaultPassphrase", "ownerUsername", "ownerPassword", "notaryPassphrase", "notaryAuthSecret"] as const;
type BootstrapValues = Record<(typeof KEYS)[number], string>;
const VALID_VALUES: BootstrapValues = {
  vaultPassphrase: "p014-public-fixture-vault",
  ownerUsername: "p014-public-fixture-owner",
  ownerPassword: "p014-public-fixture-password",
  notaryPassphrase: "p014-public-fixture-notary",
  notaryAuthSecret: "p014-public-fixture-notary-auth"
};
const PLACEHOLDERS = [
  ["change-me-public-fixture", "vaultPassphrase"],
  ["CHANGE-ME-public-fixture", "vaultPassphrase"],
  ["change-me-public-fixture", "ownerUsername"],
  ["CHANGE-ME-public-fixture", "ownerUsername"],
  ["change-me-public-fixture", "ownerPassword"],
  ["CHANGE-ME-public-fixture", "ownerPassword"],
  ["change-me-public-fixture", "notaryPassphrase"],
  ["CHANGE-ME-public-fixture", "notaryPassphrase"],
  ["change-me-public-fixture", "notaryAuthSecret"],
  ["CHANGE-ME-public-fixture", "notaryAuthSecret"]
] as const;

interface Manifest {
  kind?: string;
  metadata?: { name?: string; annotations?: Record<string, string> };
  type?: string;
  stringData?: Record<string, string>;
}

function render(values?: Partial<BootstrapValues>) {
  const temp = mkdtempSync(join(tmpdir(), "amc-helm-secrets-"));
  try {
    const args = ["template", "amc", CHART];
    if (values !== undefined) {
      const valuesPath = join(temp, "values.json");
      writeFileSync(valuesPath, JSON.stringify({ bootstrap: { createSecret: true, values } }), { encoding: "utf8", mode: 0o600 });
      args.push("--values", valuesPath);
    }
    // Helm must be installed; spawn errors, signals and timeouts are failures, never refusals.
    const result = spawnSync("helm", args, { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
    const details = JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr });
    expect(result.error, details).toBeUndefined();
    expect(result.signal, details).toBeNull();
    expect(typeof result.status, details).toBe("number");
    return { ...result, details };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function successfulManifests(result: ReturnType<typeof render>): Manifest[] {
  expect(result.status, result.details).toBe(0);
  const documents = YAML.parseAllDocuments(result.stdout, { uniqueKeys: true });
  expect(documents.flatMap((document) => document.errors.map((error) => error.message)), result.details).toEqual([]);
  return documents.map((document) => document.toJS() as Manifest | null | undefined)
    .filter((document): document is Manifest => document !== null && document !== undefined);
}

function expectRefusal(values: Partial<BootstrapValues>, diagnostic: string) {
  const result = render(values);
  expect(result.status, result.details).toBe(1);
  expect(result.stderr, result.details).toContain(diagnostic);
}

describe("Helm bootstrap Secret defaults and explicit values", () => {
  it("default chart renders no bootstrap Secret", () => {
    const documents = successfulManifests(render());
    expect(documents.filter((document) => document.kind === "Deployment").length).toBeGreaterThan(0);
    expect(documents.filter((document) => document.kind === "Secret")).toEqual([]);
  });

  it("explicit five-key bootstrap opt-in renders exactly the supplied Secret", () => {
    const documents = successfulManifests(render(VALID_VALUES));
    expect(documents.filter((document) => document.kind === "Deployment").length).toBeGreaterThan(0);
    const secrets = documents.filter((document) => document.kind === "Secret");
    expect(secrets).toHaveLength(1);
    const secret = secrets[0]!;
    expect(secret.metadata?.name).toBe("amc-bootstrap");
    expect(secret.type).toBe("Opaque");
    expect(secret.metadata?.annotations).toEqual({ "helm.sh/resource-policy": "keep" });
    expect(secret.stringData).toEqual(VALID_VALUES);
  });

  it.each(KEYS)("refuses missing bootstrap.values.%s", (key) => {
    const values: Partial<BootstrapValues> = { ...VALID_VALUES };
    delete values[key];
    expectRefusal(values, `bootstrap.values.${key} is required when bootstrap.createSecret=true`);
  });

  it.each(PLACEHOLDERS)("refuses %s for bootstrap.values.%s", (placeholder, key) => {
    // The chart's values.schema.json refuses a change-me value before the template's own check can run.
    expectRefusal({ ...VALID_VALUES, [key]: placeholder }, `at '/bootstrap/values/${key}': 'not' failed`);
  });
});
