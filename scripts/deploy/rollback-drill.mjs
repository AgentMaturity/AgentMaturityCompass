#!/usr/bin/env node
// Container-level rollback drill (root ruling 2026-10-03: the tested rollback until
// a cluster is available). Runs image A on a fresh workspace volume, proves a
// governed turn, replaces it with image B on the same volume, proves again, rolls
// back to A by its sha256 image id and proves a third time. Writes a JSON receipt.
//
//   node scripts/deploy/rollback-drill.mjs --image-a amc-studio:s1-a --image-b amc-studio:s1-b \
//     --secrets-dir <dir with amc_vault_passphrase, amc_owner_username, amc_owner_password> \
//     --out receipt.json [--port 3212] [--ready-timeout-ms 180000]
//
// Exit 0: drill passed. Exit 1: a step failed (the drill fails closed; later
// steps are skipped). Exit 2: usage error or "docker daemon unavailable".
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { governedTurnProbe } from "./governed-turn-probe.mjs";

export const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
export const STEP_IDS = ["deploy-a", "probe-a", "upgrade-b", "probe-b", "rollback-a", "probe-after-rollback"];

export class DrillUnavailable extends Error {}

/** Default docker runner: synchronous CLI call returning {status, stdout, stderr}. */
export function dockerCli(args) {
  const run = spawnSync("docker", args, { encoding: "utf8" });
  return { status: run.status ?? 1, stdout: run.stdout ?? "", stderr: run.stderr ?? String(run.error?.message ?? "") };
}

function inspectId(docker, ref) {
  const run = docker(["image", "inspect", "--format", "{{.Id}}", ref]);
  const id = run.stdout.trim();
  if (run.status !== 0) throw new Error(`docker image inspect ${ref} failed: ${run.stderr.trim()}`);
  if (!IMAGE_ID.test(id)) throw new Error(`image ${ref} resolved to "${id}", not a sha256 image id`);
  return id;
}

/**
 * Run the drill with an injected docker runner and probe so it can be tested
 * without a daemon. probe(): Promise<{status: "verified"|"failed", ...}>.
 */
export async function runRollbackDrill({ imageA, imageB, secretsDir, port = 3212, docker = dockerCli, probe, sourceCommit = null }) {
  if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) throw new DrillUnavailable("docker daemon unavailable");
  const images = { a: { ref: imageA, id: inspectId(docker, imageA) }, b: { ref: imageB, id: inspectId(docker, imageB) } };
  const suffix = randomBytes(4).toString("hex");
  const container = `amc-rollback-drill-${suffix}`;
  const volume = `amc-rollback-drill-${suffix}`;
  const steps = STEP_IDS.map((id) => ({ id, status: "skipped" }));
  const receipt = {
    kind: "amc.rollback-drill/1", sourceCommit, startedAt: new Date().toISOString(),
    environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
    images, container, volume, steps, status: "failed",
    notExercised: ["Kubernetes/Helm rollback (helm rollback, kubectl rollout undo): container-level drill only"]
  };
  const start = (id) => {
    docker(["rm", "-f", container]);
    const run = docker(["run", "-d", "--name", container, "-p", `127.0.0.1:${port}:3212`,
      "-v", `${volume}:/data/amc`, "-v", `${resolve(secretsDir)}:/run/secrets:ro`,
      "-e", "AMC_BIND=0.0.0.0", "-e", "AMC_BOOTSTRAP=1",
      // Studio admits native requests only from the bind host or these origins; the probe calls 127.0.0.1:<port>.
      "-e", `AMC_CORS_ALLOWED_ORIGINS=http://127.0.0.1:${port}`,
      "-e", "AMC_ALLOWED_CIDRS=127.0.0.1/32,::1/128,172.16.0.0/12,10.0.0.0/8,192.168.0.0/16",
      "-e", "AMC_VAULT_PASSPHRASE_FILE=/run/secrets/amc_vault_passphrase",
      "-e", "AMC_BOOTSTRAP_OWNER_USERNAME_FILE=/run/secrets/amc_owner_username",
      "-e", "AMC_BOOTSTRAP_OWNER_PASSWORD_FILE=/run/secrets/amc_owner_password",
      "--read-only", "--tmpfs", "/tmp", "--tmpfs", "/home/amc:uid=10001,gid=10001,mode=0700", id]);
    if (run.status !== 0) throw new Error(`docker run ${id} failed: ${run.stderr.trim()}`);
    const running = docker(["inspect", "--format", "{{.Image}}", container]).stdout.trim();
    if (running !== id) throw new Error(`container runs ${running || "nothing"}, expected ${id}`);
    return { imageId: id };
  };
  const plan = [
    () => start(images.a.id), probe,
    () => start(images.b.id), probe,
    () => start(images.a.id), probe
  ];
  try {
    for (const [index, action] of plan.entries()) {
      try {
        const detail = await action();
        const failed = detail?.status !== undefined && detail.status !== "verified";
        steps[index] = { id: STEP_IDS[index], status: failed ? "failed" : "passed",
          ...(detail?.imageId ? { imageId: detail.imageId } : {}),
          ...(detail?.status ? { probe: { status: detail.status, failedStep: detail.failedStep ?? null, verification: detail.verification ?? null } } : {}) };
      } catch (error) {
        steps[index] = { id: STEP_IDS[index], status: "failed", detail: error.message };
      }
      if (steps[index].status !== "passed") break;
    }
  } finally {
    docker(["rm", "-f", container]);
    docker(["volume", "rm", "-f", volume]);
    receipt.finishedAt = new Date().toISOString();
  }
  receipt.status = steps.every((s) => s.status === "passed") ? "passed" : "failed";
  return receipt;
}

function parseArgs(argv) {
  const known = ["image-a", "image-b", "secrets-dir", "out", "port", "ready-timeout-ms"];
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!known.includes(key) || argv[i + 1] === undefined) throw new Error(`unknown or incomplete option ${argv[i]}`);
    args[key] = argv[i + 1];
  }
  for (const key of ["image-a", "image-b", "secrets-dir", "out"]) if (!args[key]) throw new Error(`--${key} is required`);
  return args;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`rollback-drill: ${error.message}`);
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const port = Number(args.port ?? 3212);
  const secret = (name) => readFileSync(resolve(args["secrets-dir"], name), "utf8").replace(/\r?\n$/, "");
  const probe = () => governedTurnProbe({ baseUrl: `http://127.0.0.1:${port}`, username: secret("amc_owner_username"),
    password: secret("amc_owner_password"), readyTimeoutMs: Number(args["ready-timeout-ms"] ?? 180_000) });
  let sourceCommit = null;
  try { sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { /* not a checkout */ }
  try {
    const receipt = await runRollbackDrill({ imageA: args["image-a"], imageB: args["image-b"], secretsDir: args["secrets-dir"], port, probe, sourceCommit });
    writeFileSync(args.out, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`rollback-drill: ${receipt.status} ${receipt.steps.map((s) => `${s.id}=${s.status}`).join(",")}`);
    process.exit(receipt.status === "passed" ? 0 : 1);
  } catch (error) {
    console.error(`rollback-drill: ${error.message}`);
    process.exit(error instanceof DrillUnavailable ? 2 : 1);
  }
}
