#!/usr/bin/env node
// Render two revisions of the deployment pack and diff them for changes that a
// `helm rollback` / `kubectl rollout undo` cannot cross safely.
//
//   node scripts/deploy/rollback-check.mjs [--from <git-rev>] [--to <git-rev>|WORKTREE]
//
// Defaults: --from HEAD, --to WORKTREE. Raw manifests (deploy/k8s via its
// kustomization resource list) are always rendered. The Helm chart is rendered
// only when a helm binary is already on PATH; otherwise the output says so.
// Exit 0: no hazard. Exit 1: hazard found. Exit 2: usage or render error.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { helmAvailable, helmRender, readYamlDocs } from "./validate-assets.mjs";

const UNITS = { Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
const bytes = (quantity) => {
  const match = /^(\d+(?:\.\d+)?)([KMGT]i?)?$/.exec(String(quantity ?? ""));
  return match ? Number(match[1]) * (UNITS[match[2]] ?? 1) : NaN;
};
const id = (doc) => `${doc.kind}/${doc.metadata?.name}`;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Changes between two rendered revisions that break or lose data on rollback/upgrade. */
export function rollbackHazards(fromDocs, toDocs) {
  const hazards = [];
  const to = new Map(toDocs.map((doc) => [id(doc), doc]));
  for (const before of fromDocs) {
    const after = to.get(id(before));
    if (before.kind === "PersistentVolumeClaim" && !after) {
      hazards.push(`${id(before)} removed: Helm deletes it on upgrade and the workspace data with it`);
      continue;
    }
    if (before.kind === "Secret" && !after) {
      hazards.push(`${id(before)} removed: Helm deletes it on upgrade unless annotated helm.sh/resource-policy=keep`);
      continue;
    }
    if (!after) continue;
    if (before.kind === "Deployment" && !same(before.spec?.selector, after.spec?.selector)) {
      hazards.push(`${id(before)} spec.selector changed: immutable, the upgrade and the rollback across it both fail`);
    }
    if (before.kind === "PersistentVolumeClaim") {
      for (const field of ["accessModes", "storageClassName", "volumeName"]) {
        if (!same(before.spec?.[field], after.spec?.[field])) hazards.push(`${id(before)} spec.${field} changed: immutable on a bound claim`);
      }
      const [was, now] = [before, after].map((doc) => bytes(doc.spec?.resources?.requests?.storage));
      if (now < was) hazards.push(`${id(before)} storage would shrink ${was} -> ${now} bytes: Kubernetes refuses a claim shrink`);
    }
  }
  return hazards;
}

export function diffSummary(fromDocs, toDocs) {
  const from = new Map(fromDocs.map((doc) => [id(doc), doc]));
  const to = new Map(toDocs.map((doc) => [id(doc), doc]));
  return {
    added: [...to.keys()].filter((key) => !from.has(key)),
    removed: [...from.keys()].filter((key) => !to.has(key)),
    changed: [...to.keys()].filter((key) => from.has(key) && !same(from.get(key), to.get(key)))
  };
}

function renderKustomize(dir) {
  const kustomization = YAML.parse(readFileSync(join(dir, "deploy/k8s/kustomization.yaml"), "utf8"));
  return kustomization.resources.flatMap((file) => readYamlDocs(join(dir, "deploy/k8s", file)));
}

/** Materialise the deployment pack of a git revision (or use the working tree). */
function checkout(root, rev, scratch) {
  if (rev === "WORKTREE") return root;
  const dir = mkdtempSync(join(scratch, "rev-"));
  const tar = execFileSync("git", ["archive", "--format=tar", rev, "deploy/helm/amc", "deploy/k8s"], { cwd: root, maxBuffer: 64 * 2 ** 20 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  return dir;
}

function parseArgs(argv) {
  const args = { from: "HEAD", to: "WORKTREE" };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!["from", "to"].includes(key) || !argv[i + 1]) throw new Error(`usage: rollback-check.mjs [--from <rev>] [--to <rev>|WORKTREE] (got ${argv[i]})`);
    args[key] = argv[i + 1];
  }
  return args;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const scratch = mkdtempSync(join(tmpdir(), "amc-rollback-check-"));
  let hazards = [];
  try {
    const { from, to } = parseArgs(process.argv.slice(2));
    const dirs = { from: checkout(root, from, scratch), to: checkout(root, to, scratch) };
    console.log(`rollback-check: from ${from} to ${to}`);
    const sets = [["k8s (kustomization resources)", (dir) => renderKustomize(dir)]];
    if (helmAvailable()) sets.push(["helm template (chart defaults)", (dir) => helmRender(join(dir, "deploy/helm/amc"))]);
    else console.log("helm: not on PATH; chart revisions NOT rendered (raw manifests only)");
    for (const [label, render] of sets) {
      const [fromDocs, toDocs] = [render(dirs.from), render(dirs.to)];
      const diff = diffSummary(fromDocs, toDocs);
      console.log(`${label}: ${fromDocs.length} -> ${toDocs.length} objects; added [${diff.added}] removed [${diff.removed}] changed [${diff.changed}]`);
      const found = rollbackHazards(fromDocs, toDocs).concat(rollbackHazards(toDocs, fromDocs).map((h) => `on rollback: ${h}`));
      hazards = hazards.concat(found.map((hazard) => `${label}: ${hazard}`));
    }
  } catch (error) {
    console.error(`rollback-check: ${error.message}`);
    rmSync(scratch, { recursive: true, force: true });
    process.exit(2);
  }
  rmSync(scratch, { recursive: true, force: true });
  for (const hazard of hazards) console.log(`HAZARD ${hazard}`);
  console.log(`hazards: ${hazards.length}`);
  process.exit(hazards.length === 0 ? 0 : 1);
}
