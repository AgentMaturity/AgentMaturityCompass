#!/usr/bin/env node
// Offline validation of the static deployment pack (Helm, raw Kubernetes, Docker
// quickstart, Terraform/Pulumi examples). Needs no cluster. Uses `helm template`
// only when a helm binary is already on PATH; otherwise it says so and runs the
// static checks alone. Exits non-zero on any drift.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const SECRET_KEY = /(passphrase|password|secret|token|api[_-]?key)$/i;
const KNOWN_DEFAULTS = /change-?me|amc-test-passphrase/i;
const HELM_DEPLOYMENT = "deploy/helm/amc/templates/deployment.yaml";
const K8S_DEPLOYMENT = "deploy/k8s/deployment.yaml";
// Container name -> server source that must handle every probe path it uses.
const PROBE_SERVERS = { "amc-studio": "src/studio/studioServer.ts", "amc-notary": "src/notary/notaryServer.ts" };

const read = (root, path) => readFileSync(resolve(root, path), "utf8");

/** Parse every YAML document in a file; duplicate keys and syntax errors throw. */
export function readYamlDocs(path) {
  const docs = YAML.parseAllDocuments(readFileSync(path, "utf8"), { uniqueKeys: true });
  const errors = docs.flatMap((doc) => doc.errors.map((error) => error.message.split("\n")[0]));
  if (errors.length > 0) throw new Error(`${path}: ${errors.join("; ")}`);
  return docs.map((doc) => doc.toJS()).filter((doc) => doc !== null && doc !== undefined);
}

export function checkVersions(root) {
  const errors = [];
  const packageVersion = JSON.parse(read(root, "package.json")).version;
  const chart = YAML.parse(read(root, "deploy/helm/amc/Chart.yaml"));
  if (String(chart.appVersion) !== packageVersion) {
    errors.push(`deploy/helm/amc/Chart.yaml appVersion ${chart.appVersion} != package.json ${packageVersion}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(chart.version))) errors.push(`Chart.yaml version ${chart.version} is not semver`);
  // The quickstart installs a published GitHub release tarball, so it pins the
  // latest release recorded in the publication status, not the unreleased source version.
  const release = JSON.parse(read(root, "website/publication-status.json")).channels?.githubRelease;
  const quickstart = /^ARG AMC_VERSION=(\S+)$/m.exec(read(root, "docker/Dockerfile.quickstart"))?.[1];
  if (!release || release.status !== "live" || quickstart !== release.version) {
    errors.push(`docker/Dockerfile.quickstart AMC_VERSION ${quickstart} != published githubRelease ${release?.version} (${release?.status})`);
  }
  return { errors, packageVersion, chartVersion: String(chart.version), appVersion: String(chart.appVersion), quickstartVersion: quickstart };
}

/** Leaf values under secret-named keys are literals; refs ({name,key}) and *Name keys are not. */
export function findSecretLiteralsInValues(node, file, path = []) {
  if (Array.isArray(node)) return node.flatMap((item, index) => findSecretLiteralsInValues(item, file, [...path, String(index)]));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => findSecretLiteralsInValues(value, file, [...path, key]));
  }
  const key = path.at(-1) ?? "";
  const literal = typeof node === "string" && node.trim().length > 0;
  if (literal && SECRET_KEY.test(key)) return [`${file}: ${path.join(".")} holds a literal secret value`];
  if (literal && KNOWN_DEFAULTS.test(node)) return [`${file}: ${path.join(".")} holds a known default secret`];
  return [];
}

function k8sSecretLiterals(doc, file) {
  if (doc.kind === "Secret") return [`${file}: Secret/${doc.metadata?.name} is committed with data`];
  const containers = doc.spec?.template?.spec?.containers ?? [];
  return containers.flatMap((container) =>
    (container.env ?? [])
      .filter((entry) => SECRET_KEY.test(entry.name) && typeof entry.value === "string" && entry.value.length > 0)
      .map((entry) => `${file}: ${container.name} env ${entry.name} carries a literal value`)
  );
}

export function findSecretLiterals(root) {
  const errors = [];
  const helmDir = "deploy/helm/amc";
  const valueFiles = [`${helmDir}/values.yaml`, ...readdirSync(resolve(root, helmDir, "examples")).map((f) => `${helmDir}/examples/${f}`)];
  for (const file of valueFiles) {
    try {
      for (const doc of readYamlDocs(resolve(root, file))) errors.push(...findSecretLiteralsInValues(doc, file));
    } catch (error) {
      errors.push(`${file}: does not parse: ${error.message.split(": ").slice(1).join(": ")}`);
    }
  }
  for (const name of readdirSync(resolve(root, helmDir, "templates"))) {
    const file = `${helmDir}/templates/${name}`;
    const text = read(root, file);
    if (/^kind:\s*Secret\s*$/m.test(text)) errors.push(`${file}: chart renders a Secret; bootstrap secrets must be created out of band`);
    if (KNOWN_DEFAULTS.test(text)) errors.push(`${file}: contains a known default secret`);
  }
  for (const name of readdirSync(resolve(root, "deploy/k8s")).filter((f) => f.endsWith(".yaml") && !f.endsWith(".example.yaml"))) {
    const file = `deploy/k8s/${name}`;
    for (const doc of readYamlDocs(resolve(root, file))) errors.push(...k8sSecretLiterals(doc, file));
  }
  const [example] = readYamlDocs(resolve(root, "deploy/k8s/secret.example.yaml"));
  for (const [key, value] of Object.entries(example?.stringData ?? {})) {
    if (!String(value).startsWith("REPLACE_WITH_")) errors.push(`deploy/k8s/secret.example.yaml: ${key} is not a REPLACE_WITH_ placeholder`);
  }
  for (const doc of readYamlDocs(resolve(root, "docker/docker-compose.yml"))) {
    for (const [name, service] of Object.entries(doc.services ?? {})) {
      for (const entry of service.environment ?? []) {
        const [key, value = ""] = String(entry).split("=", 2);
        if (SECRET_KEY.test(key) && value.length > 0) errors.push(`docker/docker-compose.yml: ${name} env ${key} carries a literal value`);
      }
    }
  }
  if (/^(ENV|ARG)\s+\S*(PASSPHRASE|PASSWORD|SECRET|TOKEN)/im.test(read(root, "docker/Dockerfile.quickstart"))) {
    errors.push("docker/Dockerfile.quickstart: bakes a secret-named ENV/ARG");
  }
  return errors;
}

function probesFromK8s(root) {
  const [deployment] = readYamlDocs(resolve(root, K8S_DEPLOYMENT));
  return deployment.spec.template.spec.containers.flatMap((container) =>
    ["startupProbe", "readinessProbe", "livenessProbe"]
      .filter((kind) => container[kind])
      .map((kind) => ({ file: K8S_DEPLOYMENT, container: container.name, kind, path: container[kind].httpGet?.path ?? null }))
  );
}

function probesFromHelmTemplate(root) {
  // Go templates are not YAML, so read probes per container block textually.
  const parts = read(root, HELM_DEPLOYMENT).split(/^\s+- name: (amc-[a-z-]+)\s*$/m);
  const blocks = [];
  for (let i = 1; i < parts.length; i += 2) blocks.push([parts[i], parts[i + 1]]);
  return blocks.flatMap(([container, block]) => {
    return [...block.matchAll(/^\s+(startupProbe|readinessProbe|livenessProbe):\s*\n\s+httpGet:\s*\n\s+path:\s*(\S+)/gm)].map(
      ([, kind, path]) => ({ file: HELM_DEPLOYMENT, container, kind, path })
    );
  });
}

/** Line in the server source that handles `path`, or null. */
function handlerLine(root, file, path) {
  const lines = read(root, file).split("\n");
  const index = lines.findIndex((line) => line.includes(`pathname === "${path}"`));
  return index < 0 ? null : index + 1;
}

export function checkProbes(root) {
  const errors = [];
  const probes = [...probesFromHelmTemplate(root), ...probesFromK8s(root)];
  const endpoints = [];
  for (const probe of probes) {
    const server = PROBE_SERVERS[probe.container];
    if (!probe.path) {
      errors.push(`${probe.file}: ${probe.container} ${probe.kind} is not an httpGet probe`);
      continue;
    }
    const line = server ? handlerLine(root, server, probe.path) : null;
    if (!line) errors.push(`${probe.file}: ${probe.container} ${probe.kind} ${probe.path} has no handler in ${server ?? "a known server"}`);
    else endpoints.push(`${probe.container} ${probe.kind} ${probe.path} -> ${server}:${line}`);
  }
  for (const [file, list] of [[HELM_DEPLOYMENT, probes.filter((p) => p.file === HELM_DEPLOYMENT)], [K8S_DEPLOYMENT, probes.filter((p) => p.file === K8S_DEPLOYMENT)]]) {
    const studio = list.filter((p) => p.container === "amc-studio");
    // Liveness must not depend on governance readiness, or an untrusted policy restarts the pod in a loop.
    if (studio.some((p) => p.kind === "livenessProbe" && p.path !== "/healthz")) errors.push(`${file}: Studio liveness must use /healthz`);
    if (!studio.some((p) => p.kind === "readinessProbe" && p.path === "/readyz")) errors.push(`${file}: Studio readiness must use /readyz`);
    if (!studio.some((p) => p.kind === "startupProbe")) errors.push(`${file}: Studio has no startupProbe to cover bootstrap`);
  }
  return { errors, probes, endpoints: [...new Set(endpoints)] };
}

/** The workspace (SQLite ledger + files on an RWO volume) has one writer: one pod, no rollout overlap. */
export function checkSingleWriter(root) {
  const errors = [];
  const values = YAML.parse(read(root, "deploy/helm/amc/values.yaml"));
  if (values.replicaCount !== 1) errors.push(`deploy/helm/amc/values.yaml replicaCount ${values.replicaCount} != 1`);
  const helmDeployment = read(root, HELM_DEPLOYMENT);
  if (!/^\s+strategy:\s*\n\s+type:\s*Recreate\s*$/m.test(helmDeployment)) errors.push(`${HELM_DEPLOYMENT}: rollout strategy is not Recreate`);
  if (!/fail .*replicaCount/.test(helmDeployment)) errors.push(`${HELM_DEPLOYMENT}: no render-time refusal of replicaCount > 1`);
  const [deployment] = readYamlDocs(resolve(root, K8S_DEPLOYMENT));
  if (deployment.spec.replicas !== 1) errors.push(`${K8S_DEPLOYMENT} replicas ${deployment.spec.replicas} != 1`);
  if (deployment.spec.strategy?.type !== "Recreate") errors.push(`${K8S_DEPLOYMENT}: rollout strategy is not Recreate`);
  const [hpa] = readYamlDocs(resolve(root, "deploy/k8s/hpa.yaml"));
  if (hpa.spec.maxReplicas !== 1) errors.push(`deploy/k8s/hpa.yaml maxReplicas ${hpa.spec.maxReplicas} != 1`);
  const tfDefault = /variable "replica_count"[^}]*default\s*=\s*(\d+)/s.exec(read(root, "deploy/terraform/helm-release/variables.tf"))?.[1];
  if (tfDefault !== "1") errors.push(`deploy/terraform/helm-release/variables.tf replica_count default ${tfDefault} != 1`);
  const tfExample = /^replica_count\s*=\s*(\d+)/m.exec(read(root, "deploy/terraform/helm-release/terraform.tfvars.example"))?.[1];
  if (tfExample !== undefined && tfExample !== "1") errors.push(`terraform.tfvars.example replica_count ${tfExample} != 1`);
  const pulumi = YAML.parse(read(root, "deploy/pulumi/helm-release/Pulumi.yaml"));
  if (pulumi.config?.replicaCount?.default !== 1) errors.push("deploy/pulumi/helm-release/Pulumi.yaml replicaCount default != 1");
  if (!/getNumber\("replicaCount"\) \?\? 1\b/.test(read(root, "deploy/pulumi/helm-release/index.ts"))) errors.push("deploy/pulumi/helm-release/index.ts replicaCount fallback != 1");
  return errors;
}

export function helmAvailable() {
  return spawnSync("helm", ["version", "--short"], { encoding: "utf8" }).status === 0;
}

/** Render the chart with helm; returns parsed documents or throws with helm's stderr. */
export function helmRender(chartDir, args = []) {
  const run = spawnSync("helm", ["template", "amc", chartDir, ...args], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`helm template ${args.join(" ")} failed: ${run.stderr.trim()}`);
  const docs = YAML.parseAllDocuments(run.stdout, { uniqueKeys: true });
  const errors = docs.flatMap((doc) => doc.errors.map((error) => error.message.split("\n")[0]));
  if (errors.length > 0) throw new Error(`helm template ${args.join(" ")} output does not parse: ${errors.join("; ")}`);
  return docs.map((doc) => doc.toJS()).filter(Boolean);
}

function checkHelmRender(root) {
  if (!helmAvailable()) return { errors: [], note: "helm: not on PATH; chart template rendering NOT exercised (static checks only)" };
  const errors = [];
  const chartDir = resolve(root, "deploy/helm/amc");
  const variants = [[], ...readdirSync(join(chartDir, "examples")).map((f) => ["-f", join(chartDir, "examples", f)])];
  for (const args of variants) {
    try {
      const docs = helmRender(chartDir, args);
      if (!docs.some((doc) => doc.kind === "Deployment")) errors.push(`helm template ${args.join(" ")}: no Deployment`);
      for (const doc of docs) errors.push(...k8sSecretLiterals(doc, `helm template ${args.join(" ") || "(defaults)"}`));
    } catch (error) {
      errors.push(error.message);
    }
  }
  const refused = spawnSync("helm", ["template", "amc", chartDir, "--set", "replicaCount=2"], { encoding: "utf8" });
  if (refused.status === 0) errors.push("helm template --set replicaCount=2 rendered; it must refuse");
  return { errors, note: `helm: rendered defaults + ${variants.length - 1} example values files` };
}

export function validateAssets(root) {
  const versions = checkVersions(root);
  const probes = checkProbes(root);
  const render = checkHelmRender(root);
  const errors = [...versions.errors, ...findSecretLiterals(root), ...probes.errors, ...checkSingleWriter(root), ...render.errors];
  return { ok: errors.length === 0, errors, versions, endpoints: probes.endpoints, notes: [render.note] };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  let result;
  try {
    result = validateAssets(root);
  } catch (error) {
    console.error(`validate-assets: ${error.message}`);
    process.exit(2);
  }
  const { versions } = result;
  const relation = versions.appVersion === versions.packageVersion ? "==" : "!=";
  console.log(`chart amc ${versions.chartVersion} appVersion ${versions.appVersion} ${relation} package.json ${versions.packageVersion}`);
  console.log(`quickstart AMC_VERSION ${versions.quickstartVersion} (published GitHub release pin)`);
  for (const endpoint of result.endpoints) console.log(`probe ${endpoint}`);
  for (const note of result.notes) console.log(note);
  for (const error of result.errors) console.log(`FAIL ${error}`);
  console.log(result.ok ? "validate-assets: OK" : `validate-assets: ${result.errors.length} failure(s)`);
  process.exit(result.ok ? 0 : 1);
}
