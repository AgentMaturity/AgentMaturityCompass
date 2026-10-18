// Runs the coding probe on model-written code only inside a container: no network, read-only root, no capabilities,
// no-new-privileges, the nobody user, pids/memory/CPU limits and no host mount. The probe program travels as `-e` and
// the sources on stdin. The parent owns the wall-time limit and kills the container at it. Docker unavailable is a
// refusal (ContainmentUnavailableError); the probe never runs in process or uncontained.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export const PROBE_SOURCE = readFileSync(new URL("./codingProbe.mjs", import.meta.url), "utf8");
export const PROBE_LIMITS = ["--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65534:65534",
  "--pids-limit", "64", "--memory", "256m", "--cpus", "1"];

export class ContainmentUnavailableError extends Error {}

/** The exact docker argv: containment flags, the pinned image (by ID or digest), Node with the probe as -e. No mounts. */
export const probeCommand = (containment, name) => ["run", "--rm", "-i", "--name", name, ...PROBE_LIMITS, containment.image,
  "node", "--experimental-vm-modules", "--no-warnings", "--max-old-space-size=64", "--input-type=module", "-e", PROBE_SOURCE];

/** Probe rows, or null when the contained probe did not finish cleanly. Throws ContainmentUnavailableError when it cannot be contained. */
export function runContainedProbe(containment, input, { timeoutMs = 60_000 } = {}) {
  if (!containment?.cli || !containment.host || !/^(sha256:[a-f0-9]{64}|[^\s@]+@sha256:[a-f0-9]{64})$/.test(containment.image ?? "")) {
    return Promise.reject(new ContainmentUnavailableError("no pinned container runtime configuration"));
  }
  const env = { PATH: "/usr/bin:/bin", DOCKER_HOST: containment.host, HOME: process.env.HOME ?? "/nonexistent" };
  const name = `amcp-probe-${randomBytes(6).toString("hex")}`;
  return new Promise((done, fail) => {
    const child = spawn(containment.cli, probeCommand(containment, name), { env, stdio: ["pipe", "pipe", "ignore"] });
    const out = []; let bytes = 0, timedOut = false;
    const kill = () => { spawnSync(containment.cli, ["kill", name], { env, timeout: 30_000 }); child.kill("SIGKILL"); };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    child.stdout.on("data", (chunk) => { bytes += chunk.length; if (bytes > 256 * 1024) kill(); else out.push(chunk); });
    child.stdin.on("error", () => {});
    child.once("error", () => { clearTimeout(timer); fail(new ContainmentUnavailableError("the container runtime could not be started")); });
    child.once("close", (code) => {
      clearTimeout(timer);
      spawnSync(containment.cli, ["rm", "-f", name], { env, timeout: 30_000 });
      // docker run reports its own failures (daemon, image, runtime) as 125-127; none of them ran the probe.
      if (!timedOut && code !== null && code >= 125 && code <= 127) { fail(new ContainmentUnavailableError(`the container runtime refused the probe (status ${code})`)); return; }
      try { done(code === 0 && !timedOut ? JSON.parse(Buffer.concat(out).toString("utf8")).rows : null); } catch { done(null); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
