#!/usr/bin/env node
// Prints REPO@sha256:<digest> for an image already loaded into a kind node (`kind load docker-image`), and tags it by
// that digest in the node's containerd so a chart with image.requireDigest=true can start it without a registry.
// The digest is containerd's manifest digest of the imported archive, not a registry digest (P2-06 kind runs only).
//
//   node scripts/deploy/kind-image-digest.mjs --cluster amc-ci --image amc-studio:ci
import { spawnSync } from "node:child_process";
import { isEntrypoint } from "../lib/entrypoint.mjs";

const run = (args) => spawnSync("docker", args, { encoding: "utf8" });

export function kindImageDigest({ cluster, image, docker = run }) {
  const node = `${cluster}-control-plane`;
  const name = image.includes("/") ? `docker.io/${image}` : `docker.io/library/${image}`;
  const inspect = docker(["exec", node, "crictl", "inspecti", "-o", "json", name]);
  if (inspect.status !== 0) throw new Error(`crictl inspecti ${name} on ${node} failed: ${inspect.stderr.trim()}`);
  const digest = JSON.parse(inspect.stdout).status.repoDigests.map((ref) => /@(sha256:[a-f0-9]{64})$/.exec(ref)?.[1]).find(Boolean);
  if (!digest) throw new Error(`no digest for ${name} on ${node}`);
  const repository = name.slice(0, name.lastIndexOf(":"));
  const tag = docker(["exec", node, "ctr", "-n", "k8s.io", "images", "tag", "--force", name, `${repository}@${digest}`]);
  if (tag.status !== 0) throw new Error(`ctr images tag failed: ${tag.stderr.trim()}`);
  return `${image.slice(0, image.lastIndexOf(":"))}@${digest}`;
}

if (isEntrypoint(import.meta.url)) {
  const arg = (flag) => process.argv[process.argv.indexOf(flag) + 1];
  if (!process.argv.includes("--cluster") || !process.argv.includes("--image")) {
    console.error("usage: kind-image-digest.mjs --cluster <name> --image <repo:tag>");
    process.exitCode = 2;
  } else {
    console.log(kindImageDigest({ cluster: arg("--cluster"), image: arg("--image") }));
  }
}
