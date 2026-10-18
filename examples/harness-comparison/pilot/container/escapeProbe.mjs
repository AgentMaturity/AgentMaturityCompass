// Runs inside the pilot's agent container with exactly the trial limits. Each attempt mirrors a row of P1-05's escape
// table, adapted to a container. It reports what it observed; the host runner checks host-side effects and decides.
// `node escapeProbe.mjs '<json>'`. Benign probes only: canary paths, a loopback service and sleeping children.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { connect } from "node:net";
import { join } from "node:path";

const config = JSON.parse(process.argv[2]);
const attempt = async (fn) => { try { return { ok: true, detail: String(await fn()).slice(0, 200) }; } catch (error) { return { ok: false, detail: String(error?.code ?? error?.message ?? error).slice(0, 200) }; } };
const tcp = (host, port) => new Promise((done, reject) => {
  const socket = connect({ host, port, timeout: 4000 });
  socket.once("connect", () => { socket.destroy(); done("connected"); });
  socket.once("timeout", () => { socket.destroy(); reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })); });
  socket.once("error", reject);
});
const http = async (url) => { const response = await fetch(url, { signal: AbortSignal.timeout(5000) }); return `${response.status} ${await response.text()}`; };
const status = Object.fromEntries(readFileSync("/proc/self/status", "utf8").split("\n").map((line) => line.split(":\t")).filter((row) => row.length === 2));

/** Starts up to `target` sleeping children; counts how many the pids limit admitted. */
async function forkLoop(target) {
  let started = 0;
  const children = [];
  for (let index = 0; index < target; index += 1) {
    const ok = await new Promise((done) => {
      const child = spawn("sleep", ["30"], { stdio: "ignore" });
      child.once("spawn", () => { children.push(child); done(true); });
      child.once("error", () => done(false));
    });
    if (!ok) break;
    started += 1;
  }
  for (const child of children) child.kill("SIGKILL");
  return started;
}

const results = {
  identity: { uid: process.getuid(), gid: process.getgid(), capEff: status.CapEff?.trim(), noNewPrivs: status.NoNewPrivs?.trim(),
    memoryMax: existsSync("/sys/fs/cgroup/memory.max") ? readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim() : null,
    pidsMax: existsSync("/sys/fs/cgroup/pids.max") ? readFileSync("/sys/fs/cgroup/pids.max", "utf8").trim() : null },
  hostHomeWrite: await attempt(() => { writeFileSync(config.hostHomeTarget, "x"); return "wrote"; }),
  symlinkWriteOutside: await attempt(() => { writeFileSync(join(config.workspace, "link-out", "escaped.txt"), "x"); return "wrote"; }),
  symlinkWriteEtc: await attempt(() => { writeFileSync(join(config.workspace, "link-etc", "amc-escape"), "x"); return "wrote"; }),
  readHostCanary: await attempt(() => readFileSync(config.hostCanary, "utf8")),
  rootFsWrite: await attempt(() => { writeFileSync("/usr/amc-escape", "x"); return "wrote"; }),
  dockerSocket: existsSync("/var/run/docker.sock"),
  workspaceWrite: await attempt(() => { writeFileSync(join(config.workspace, "inside.txt"), "inside"); return "wrote"; }),
  homeWrite: await attempt(() => { writeFileSync(join(process.env.HOME, "home.txt"), "tmpfs"); return "wrote"; }),
  directTcpExternal: await attempt(() => tcp("1.1.1.1", 443)),
  dnsExternal: await attempt(() => lookup("example.com").then((row) => row.address)),
  hostGatewayListed: await attempt(() => tcp(config.hostGateway, config.listedPort)),
  hostGatewayUnlisted: await attempt(() => tcp(config.hostGateway, config.unlistedPort)),
  relayListed: await attempt(() => http(`http://${config.relay}:${config.listedPort}/`)),
  relayUnlisted: await attempt(() => tcp(config.relay, config.unlistedPort)),
  forkLoop: { requested: config.forkTarget, started: await forkLoop(config.forkTarget) }
};
process.stdout.write(JSON.stringify(results) + "\n");
