#!/usr/bin/env node
// Compose upgrade and rollback rehearsal (LIVE-DEPLOY-16). rollback-drill.mjs replaces containers with `docker run`; this
// runs the documented Compose mechanism instead: image A, then B, then A again on one compose project and its named
// volumes, each pinned through AMC_STUDIO_IMAGE (docs/deploy/reference/COMPOSE.md). Writes a JSON receipt.
//
//   node scripts/deploy/compose-rehearsal.mjs --file deploy/compose/docker-compose.yml [--file <override>] \
//     --image-a <ref> --image-b <ref> --env-file <operator .env> --project <name> --base-url http://127.0.0.1:3212 \
//     --username-file <file> --password-file <file> --out receipt.json [--ready-timeout-ms 300000] [--cleanup]
//
// Each phase runs `up -d --no-build` with AMC_STUDIO_IMAGE=<image id>, waits for READY (the image HEALTHCHECK script,
// run inside the container), mints a pairing code inside the container and runs one governed turn
// (governed-turn-probe.mjs). Like the drill, A boots once unpinned to create the workspace's monitor key, which is then
// pinned (AMC_EXPECTED_MONITOR_FINGERPRINT, trust on first use) for every probed phase. An image that refuses a ledger a
// newer image migrated (the P2-09 downgrade guard, docs/deploy/reference/ROLLBACK.md step 2) is recorded as
// `downgradeGuard`: the documented outcome, not a failure. The rehearsal ends with `down` and never `down -v`; only
// --cleanup then removes the volumes this compose project created.
//
// AMC_COMPOSE_PREFIX: optional command prefix for the compose calls when the local docker CLI has no compose plugin,
// e.g. "colima ssh -p <profile> --". The compose environment is then passed as `env K=V` arguments; plain docker calls
// (exec, inspect, logs, volume) always use the local docker CLI and its current context.
//
// Exit 0: every phase passed, or the rehearsal stopped at the downgrade guard. Exit 1: a phase failed. Exit 2: usage.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { governedTurnProbe } from "./governed-turn-probe.mjs";
import { inspectId, mintPairingCode } from "./rollback-drill.mjs";
import { STUDIO_HTTP_PROBE } from "../lib/studio-http-probe.mjs";

export const PHASES = [["deploy-a", "a"], ["upgrade-b", "b"], ["rollback-a", "a"]];
export const DOWNGRADE_GUARD = /ledger schema version \d+ is newer than this AMC[^\n]*/;
const PROBE_PASSES = new Set(["verified", "verified-prefix"]);

/** Runner: docker CLI calls, compose through AMC_COMPOSE_PREFIX when set. Returns {status, stdout, stderr}. */
export function dockerCli(args, { env = {} } = {}) {
  const prefix = args[0] === "compose" ? (process.env.AMC_COMPOSE_PREFIX ?? "").trim().split(/\s+/).filter(Boolean) : [];
  const argv = prefix.length > 0 ? [...prefix, "env", ...Object.entries(env).map(([key, value]) => `${key}=${value}`), "docker", ...args] : ["docker", ...args];
  const run = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 });
  return { status: run.status ?? 1, stdout: run.stdout ?? "", stderr: run.stderr ?? String(run.error?.message ?? "") };
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Run the rehearsal with an injected docker runner and probe, so it can be tested without a daemon.
 * probe({container, pin}): Promise<{status: "verified"|"verified-prefix"|"failed", ...}>.
 */
export async function runComposeRehearsal({ files, imageA, imageB, envFile, project, docker = dockerCli, probe, cleanup = false,
  sourceCommit = null, readyTimeoutMs = 300_000, pollMs = 2_000 }) {
  if (docker(["info", "--format", "{{.ServerVersion}}"]).status !== 0) throw new Error("docker daemon unavailable");
  const images = { a: { ref: imageA, id: inspectId(docker, imageA) }, b: { ref: imageB, id: inspectId(docker, imageB) } };
  const base = ["compose", "-p", project, "--env-file", resolve(envFile), ...files.flatMap((file) => ["-f", resolve(file)])];
  const compose = (args, env = {}) => docker([...base, ...args], { env });
  const services = compose(["config", "--services"]).stdout.split("\n").map((name) => name.trim());
  const service = services.includes("studio") ? "studio" : "amc-studio";
  const receipt = {
    kind: "amc.compose-rehearsal/1", sourceCommit, startedAt: new Date().toISOString(),
    environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
    files: files.map((file) => resolve(file)), project, service, images, monitorPin: null,
    monitorPinSource: "trust-on-first-use: read from the project's own workspace volume after A's first bootstrap",
    phases: [], downgradeGuard: null, status: "failed", cleanup: null
  };
  let pin = null;
  const up = (image) => {
    const run = compose(["up", "-d", "--no-build"], { AMC_STUDIO_IMAGE: image, AMC_EXPECTED_MONITOR_FINGERPRINT: pin ?? "" });
    if (run.status !== 0) throw new Error(`compose up (${image}) failed: ${run.stderr.trim().slice(-1500)}`);
    const container = compose(["ps", "-q", service]).stdout.trim();
    const running = docker(["inspect", "--format", "{{.Image}}", container]).stdout.trim();
    if (!container || running !== image) throw new Error(`${service} runs ${running || "nothing"}, expected ${image}`);
    return container;
  };
  /** READY via the image's own HTTP probe inside the container; a refusal is classified from the container log. */
  const ready = async (container) => {
    const started = Date.now();
    for (;;) {
      if (docker(["exec", container, "node", "-e", STUDIO_HTTP_PROBE]).status === 0) return { readyMs: Date.now() - started };
      const logs = docker(["logs", "--tail", "200", container]);
      const guard = DOWNGRADE_GUARD.exec(`${logs.stdout}\n${logs.stderr}`)?.[0] ?? null;
      if (guard) return { guard };
      if (Date.now() - started >= readyTimeoutMs) return { timedOut: true };
      await delay(pollMs);
    }
  };
  const readPin = (container) => {
    const run = docker(["exec", container, "cat", "/data/amc/.amc/keys/monitor_ed25519.pub"]);
    if (run.status !== 0 || !run.stdout.includes("BEGIN PUBLIC KEY")) throw new Error(`monitor key not readable in ${container}: ${run.stderr.trim() || "no key"}`);
    return createHash("sha256").update(run.stdout, "utf8").digest("hex");
  };
  try {
    for (const [id, which] of PHASES) {
      const phase = { id, imageId: images[which].id, status: "failed" };
      receipt.phases.push(phase);
      try {
        let container = up(images[which].id);
        let state = await ready(container);
        if (!pin && state.readyMs !== undefined) {
          receipt.monitorPin = pin = readPin(container);
          container = up(images[which].id);
          state = await ready(container);
        }
        if (state.guard) {
          Object.assign(phase, { status: "refused-by-downgrade-guard", detail: state.guard });
          receipt.downgradeGuard = { phase: id, message: state.guard };
          break;
        }
        if (state.readyMs === undefined) throw new Error(`${service} not READY within ${readyTimeoutMs} ms`);
        phase.readyMs = state.readyMs;
        const result = await probe({ container, pin });
        phase.probe = { status: result?.status ?? null, failedStep: result?.failedStep ?? null, verification: result?.verification ?? null,
          verificationScope: result?.verificationScope ?? null };
        phase.status = PROBE_PASSES.has(result?.status) ? "passed" : "failed";
      } catch (error) {
        phase.detail = error.message;
      }
      if (phase.status !== "passed") break;
    }
  } finally {
    const down = compose(["down"]);
    const removed = [];
    if (cleanup) {
      const volumes = docker(["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`]).stdout.split("\n").filter(Boolean);
      for (const volume of volumes) if (docker(["volume", "rm", volume]).status === 0) removed.push(volume);
    }
    receipt.cleanup = { down: down.status === 0, volumesRemoved: removed };
    receipt.finishedAt = new Date().toISOString();
  }
  const finished = receipt.phases.length === PHASES.length && receipt.phases.every((phase) => phase.status === "passed");
  const stoppedAtGuard = receipt.downgradeGuard !== null && receipt.phases.slice(0, -1).every((phase) => phase.status === "passed");
  receipt.status = finished || stoppedAtGuard ? "passed" : "failed";
  return receipt;
}

function parseArgs(argv) {
  const known = ["file", "image-a", "image-b", "env-file", "project", "base-url", "username-file", "password-file", "out", "ready-timeout-ms"];
  const args = { file: [], cleanup: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]?.replace(/^--/, "");
    if (key === "cleanup") { args.cleanup = true; continue; }
    if (!known.includes(key) || argv[i + 1] === undefined) throw new Error(`unknown or incomplete option ${argv[i]}`);
    if (key === "file") args.file.push(argv[i + 1]); else args[key] = argv[i + 1];
    i += 1;
  }
  if (args.file.length === 0) throw new Error("--file is required");
  for (const key of ["image-a", "image-b", "env-file", "project", "base-url", "username-file", "password-file", "out"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
}

const invokedDirectly = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`compose-rehearsal: ${error.message}`);
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const secret = (path) => readFileSync(path, "utf8").replace(/\r?\n$/, "");
  const probe = ({ container }) => governedTurnProbe({ baseUrl: args["base-url"], username: secret(args["username-file"]),
    password: secret(args["password-file"]), pairingCode: () => mintPairingCode(dockerCli, container), readyTimeoutMs: 60_000 });
  let sourceCommit = null;
  try { sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { /* not a checkout */ }
  try {
    const receipt = await runComposeRehearsal({ files: args.file, imageA: args["image-a"], imageB: args["image-b"], envFile: args["env-file"],
      project: args.project, probe, cleanup: args.cleanup, sourceCommit, readyTimeoutMs: Number(args["ready-timeout-ms"] ?? 300_000) });
    writeFileSync(args.out, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`compose-rehearsal: ${receipt.status} ${receipt.phases.map((phase) => `${phase.id}=${phase.status}`).join(",")}`);
    process.exit(receipt.status === "passed" ? 0 : 1);
  } catch (error) {
    console.error(`compose-rehearsal: ${error.message}`);
    process.exit(error.message === "docker daemon unavailable" ? 2 : 1);
  }
}
