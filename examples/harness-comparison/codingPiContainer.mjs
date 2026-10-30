// Runs the coding adapter's Pi binding only inside the pilot's container (pilot/container.mjs): read-only root, every
// capability dropped, no-new-privileges, non-root, pids and memory limits, a private tmpfs HOME, the trial workspace
// bind-mounted at its host path, Pi's npm prefix read-only, and an internal network whose only peer is a relay to the
// trial's model gateway. Without a reachable container runtime it refuses (ContainmentUnavailableError) and never
// starts Pi on the host. Containment is the container runtime's, not an AMC claim.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { sep } from "node:path";
import { ENTRY, runAgent, startNetwork } from "./pilot/container.mjs";
import { ContainmentUnavailableError } from "./pilot/oracles/containedProbe.mjs";

const PINNED_IMAGE = /^(sha256:[a-f0-9]{64}|[^\s@]+@sha256:[a-f0-9]{64})$/;

/** Same result shape as codingCommon's invoke, plus the container's limits and mounts. */
export async function runPiContained({ containment, cli, workspace, args, prompt, env, gatewayPort, models, settings, timeoutMs }) {
  if (!containment || typeof containment.cli !== "string" || typeof containment.host !== "string" || !PINNED_IMAGE.test(containment.image ?? "")
    || typeof containment.hostGateway !== "string" || typeof containment.mountableRoot !== "string") {
    throw new ContainmentUnavailableError("no pinned container runtime configuration");
  }
  const docker = { ...containment, env: { HOME: homedir(), PATH: "/usr/bin:/bin", DOCKER_HOST: containment.host } };
  const reachable = spawnSync(docker.cli, ["version", "--format", "{{.Server.Version}}"], { env: docker.env, encoding: "utf8", timeout: 60_000 });
  if (reachable.error || reachable.status !== 0) throw new ContainmentUnavailableError("the container runtime is not reachable");
  if (!`${workspace}${sep}`.startsWith(`${containment.mountableRoot}${sep}`)) throw new ContainmentUnavailableError("the trial workspace is outside the container runtime's mountable root");
  const marker = `${sep}node_modules${sep}`;
  if (!cli.includes(marker)) throw new ContainmentUnavailableError("the Pi CLI is not inside an npm prefix that can be mounted read-only");
  const prefix = cli.slice(0, cli.lastIndexOf(marker));
  let network;
  try { network = await startNetwork(docker, [gatewayPort]); }
  catch (error) { throw new ContainmentUnavailableError(`the container network could not start: ${error instanceof Error ? error.message : "unknown"}`); }
  try {
    return await runAgent(docker, { network: network.network, workdir: workspace, timeoutMs,
      mounts: [{ src: workspace }, { src: prefix, readonly: true }, { src: ENTRY, dst: "/pilot/entry.mjs", readonly: true }],
      env: { HOME: "/home/pilot", PI_CODING_AGENT_DIR: "/home/pilot/.pi-agent", PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", LANG: "C", NO_COLOR: "1", CI: "1", ...env },
      args: ["/pilot/entry.mjs", JSON.stringify({ relay: network.relay, ports: [gatewayPort], piCli: cli, args: [...args, prompt], models, settings })] });
  } finally { network.close(); }
}
