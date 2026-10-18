// Host side of the pilot's Pi containment. Per trial: an internal Docker network whose only other member is a relay
// that forwards an explicit list of host loopback ports, and the agent container: read-only root, every capability
// dropped, no-new-privileges, non-root, pids and memory limits, a private tmpfs HOME, the trial workspace bind-mounted
// at its host path and the rest read-only. Containment here is the container runtime's, never an AMC claim.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const ENTRY = fileURLToPath(new URL("./container/entry.mjs", import.meta.url));
const RELAY = "const net=require('net');const [host,...ports]=process.argv.slice(1);let open=0;"
  + "for(const port of ports.map(Number))net.createServer(c=>{const u=net.connect(port,host);c.pipe(u).pipe(c);u.on('error',()=>c.destroy());c.on('error',()=>u.destroy());})"
  + ".listen(port,'0.0.0.0',()=>{if(++open===ports.length)console.log('relay-ready');});";
export const AGENT_LIMITS = ["--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "1000:1000", "--pids-limit", "256",
  "--memory", "1g", "--cpus", "2", "--tmpfs", "/tmp:rw,size=64m,mode=1777", "--tmpfs", "/home/pilot:rw,size=128m,uid=1000,gid=1000,mode=0700"];

function docker(config, args, timeoutMs = 300_000) {
  const result = spawnSync(config.cli, args, { env: config.env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  return { status: result.status, stdout: (result.stdout ?? "").trim(), stderr: (result.stderr ?? "").slice(0, 2000) };
}

/** Mount list: [{ src, dst, readonly }]. Each host path is mounted at the same path unless dst says otherwise. */
const mountArgs = (mounts) => mounts.flatMap(({ src, dst = src, readonly = false }) => ["--mount", `type=bind,src=${src},dst=${dst}${readonly ? ",readonly" : ""}`]);

/** Starts the network and relay; returns { network, relay, close }. Throws when either cannot be proven ready. */
export async function startNetwork(config, ports) {
  const id = randomBytes(6).toString("hex"), network = `amcp-${id}`, relay = `amcp-relay-${id}`;
  const close = () => { docker(config, ["rm", "-f", relay]); docker(config, ["network", "rm", network]); };
  const must = (label, args) => { const result = docker(config, args); if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr.trim().slice(0, 200) || `status ${result.status}`}`); };
  try {
    must("network create", ["network", "create", "--internal", network]);
    must("relay start", ["run", "-d", "--name", relay, "--network", "bridge", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--user", "1000:1000", "--pids-limit", "64", "--memory", "128m", config.image, "node", "-e", RELAY, config.hostGateway, ...ports.map(String)]);
    must("relay attach", ["network", "connect", network, relay]);
    const deadline = Date.now() + 180_000;
    while (!docker(config, ["logs", relay]).stdout.includes("relay-ready")) {
      if (Date.now() > deadline) throw new Error("relay not ready");
      await new Promise((done) => setTimeout(done, 250));
    }
    return { network, relay, close };
  } catch (error) { close(); throw error; }
}

/** Runs `node <args>` in the agent container on `network`; bounded capture; killed at the deadline. */
export function runAgent(config, { network, mounts, env, args, workdir, timeoutMs, maxBytes = 512 * 1024 }) {
  const name = `amcp-agent-${randomBytes(6).toString("hex")}`;
  const argv = ["run", "--rm", "--name", name, "--network", network, ...AGENT_LIMITS, "-w", workdir,
    ...Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]), ...mountArgs(mounts), config.image, "node", ...args];
  return new Promise((done) => {
    const child = spawn(config.cli, argv, { env: config.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", bytes = 0, truncated = false, timedOut = false;
    const kill = () => { docker(config, ["kill", name], 30_000); child.kill("SIGKILL"); };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    for (const [stream, which] of [[child.stdout, "out"], [child.stderr, "err"]]) {
      stream.setEncoding("utf8");
      stream.on("data", (text) => {
        bytes += Buffer.byteLength(text);
        if (bytes > maxBytes) { if (!truncated) { truncated = true; kill(); } return; }
        if (which === "out") stdout += text; else stderr += text;
      });
    }
    child.on("error", () => {});
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      docker(config, ["rm", "-f", name]);
      done({ exitCode, signal, stdout, stderr, truncated, timedOut, container: name,
        limits: AGENT_LIMITS, mounts: mounts.map(({ src, dst = src, readonly = false }) => ({ src, dst, readonly })) });
    });
  });
}
