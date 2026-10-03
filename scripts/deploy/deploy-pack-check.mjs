#!/usr/bin/env node
// Deployment-pack gate. Runs the offline static checks (validate-assets.mjs) and,
// when the binaries are installed, helm lint/template and kubeconform. A tool that
// is not installed is reported under `skipped` instead of being silently passed.
//
//   node scripts/deploy/deploy-pack-check.mjs [--json] [--require-tools]
//
// --json           print {status, skipped:[{id, reason}], errors, ran, ...} only
// --require-tools  a skipped tool fails the check (use in CI where helm/kubeconform are pinned)
// kubeconform runs with -strict -summary; set AMC_KUBECONFORM_SCHEMA_LOCATION to a local
// schema directory for a fully offline run (kubeconform otherwise fetches schemas).
// Exit 0: status "passed". Exit 1: status "failed". Exit 2: usage error.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { helmAvailable, validateAssets } from "./validate-assets.mjs";

export const TOOLS = ["helm", "kubeconform"];

function binaryPresent(id) {
  if (id === "helm") return helmAvailable();
  return spawnSync(id, ["-v"], { encoding: "utf8" }).status === 0;
}

function kubeconform(root, helm) {
  const args = ["-strict", "-summary", "-ignore-missing-schemas=false"];
  const location = process.env.AMC_KUBECONFORM_SCHEMA_LOCATION;
  if (location) args.push("-schema-location", location);
  const kustomization = YAML.parse(readFileSync(join(root, "deploy/k8s/kustomization.yaml"), "utf8"));
  const inputs = [kustomization.resources.map((file) => readFileSync(join(root, "deploy/k8s", file), "utf8")).join("\n---\n")];
  if (helm) {
    const render = spawnSync("helm", ["template", "amc", join(root, "deploy/helm/amc")], { encoding: "utf8" });
    if (render.status !== 0) return [`helm template for kubeconform failed: ${render.stderr.trim()}`];
    inputs.push(render.stdout);
  }
  return inputs.flatMap((input, index) => {
    const run = spawnSync("kubeconform", [...args, "-"], { input, encoding: "utf8" });
    return run.status === 0 ? [] : [`kubeconform (${index === 0 ? "deploy/k8s" : "helm template"}) failed: ${run.stdout.trim()} ${run.stderr.trim()}`];
  });
}

/** present: (id) => boolean, injectable for tests. */
export function deployPackCheck(root, { requireTools = false, present = binaryPresent } = {}) {
  const available = Object.fromEntries(TOOLS.map((id) => [id, present(id)]));
  const skipped = TOOLS.filter((id) => !available[id]).map((id) => ({ id, reason: "binary absent" }));
  const assets = validateAssets(root);
  const errors = [...assets.errors];
  const ran = ["static"];
  if (available.helm) ran.push("helm lint", "helm template");
  if (available.kubeconform) {
    errors.push(...kubeconform(root, available.helm));
    ran.push("kubeconform");
  }
  if (requireTools) for (const tool of skipped) errors.push(`${tool.id}: required by --require-tools but ${tool.reason}`);
  return { status: errors.length === 0 ? "passed" : "failed", skipped, errors, ran, versions: assets.versions, endpoints: assets.endpoints };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((arg) => !["--json", "--require-tools"].includes(arg));
  if (unknown.length > 0) {
    console.error(`deploy-pack-check: unknown option ${unknown[0]}; usage: deploy-pack-check.mjs [--json] [--require-tools]`);
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  let result;
  try {
    result = deployPackCheck(root, { requireTools: argv.includes("--require-tools") });
  } catch (error) {
    result = { status: "failed", skipped: [], errors: [`deploy-pack-check: ${error.message}`], ran: [] };
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`ran: ${result.ran.join(", ")}`);
    for (const tool of result.skipped) console.log(`skipped: ${tool.id} (${tool.reason})`);
    for (const error of result.errors) console.log(`FAIL ${error}`);
    console.log(`deploy-pack-check: ${result.status}`);
  }
  process.exit(result.status === "passed" ? 0 : 1);
}
