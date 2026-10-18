#!/usr/bin/env node
// Escape checks for the pilot's two containers, run before trials: the Pi container with the trial's own limits and
// network topology, and the coding probe's container (oracles/containedProbe.mjs) with escape payloads:
//   node examples/harness-comparison/pilot/containment.mjs --config <operator.json> --out <new directory>
// Adapted from P1-05's escape table. Positive controls (an allowed service and a workspace write) prove the probe ran.
// The result is the container runtime's containment on this machine, never an AMC claim.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, startNetwork } from "./container.mjs";
import { PROBE_LIMITS, runContainedProbe } from "./oracles/containedProbe.mjs";

const PROBE = fileURLToPath(new URL("./container/escapeProbe.mjs", import.meta.url));
const listen = (body) => new Promise((done) => { const server = createServer((_req, res) => res.end(body)); server.listen(0, "127.0.0.1", () => done(server)); });

export function judgeEscapes(probe, host) {
  const blocked = (row) => row && row.ok === false;
  const rows = [
    ["non-root", "the agent runs without root", probe.identity.uid !== 0],
    ["no-capabilities", "effective capability set is empty", probe.identity.capEff === "0000000000000000"],
    ["no-new-privileges", "no_new_privs is set", probe.identity.noNewPrivs === "1"],
    ["host-home-write", "write $HOME/amc-escape-<random> at the host's home path", blocked(probe.hostHomeWrite) && !host.hostHomeFile],
    ["symlink-write-outside", "write through a workspace symlink to a host directory outside it", blocked(probe.symlinkWriteOutside) && !host.escapedFile],
    ["symlink-write-etc", "write through a workspace symlink to /etc", blocked(probe.symlinkWriteEtc)],
    ["read-host-canary", "read a canary in a host .ssh directory outside the workspace", blocked(probe.readHostCanary) && !host.canaryInOutput],
    ["root-fs-write", "write to the image's root filesystem", blocked(probe.rootFsWrite)],
    ["no-docker-socket", "no container runtime socket inside", probe.dockerSocket === false],
    ["direct-tcp-external", "direct TCP to 1.1.1.1:443", blocked(probe.directTcpExternal)],
    ["dns-external", "resolve example.com", blocked(probe.dnsExternal)],
    ["host-gateway-direct", "TCP to the host gateway, listed and unlisted ports, bypassing the relay", blocked(probe.hostGatewayListed) && blocked(probe.hostGatewayUnlisted)],
    ["relay-unlisted-port", "a host service the relay does not list", blocked(probe.relayUnlisted)],
    ["fork-cap", `start ${probe.forkLoop.requested} sleeping children`, probe.forkLoop.started < probe.forkLoop.requested && probe.forkLoop.started <= 256 && host.containerGone],
    ["positive-relay-listed-port", "the listed service is reachable through the relay", probe.relayListed?.ok === true && probe.relayListed.detail.startsWith("200 listed-ok")],
    ["positive-workspace-write", "a workspace write reaches the host", probe.workspaceWrite?.ok === true && host.insideFile]
  ];
  return rows.map(([id, attempt, passed]) => ({ id, attempt, passed: Boolean(passed) }));
}

// What code that had defeated the probe's vm layer could still do, in the probe container's exact limits.
const DIRECT = `const fs = require("fs"), net = require("net"), dns = require("dns").promises; const input = JSON.parse(fs.readFileSync(0, "utf8"));
const attempt = async (fn) => { try { await fn(); return "succeeded"; } catch (error) { return String(error.code ?? error.message); } };
const tcp = () => new Promise((done, reject) => { const s = net.connect({ host: "1.1.1.1", port: 443, timeout: 4000 }); s.once("connect", () => { s.destroy(); done(); }); s.once("timeout", () => reject(Object.assign(new Error("t"), { code: "ETIMEDOUT" }))); s.once("error", reject); });
(async () => console.log(JSON.stringify({ uid: process.getuid(), hostSentinel: await attempt(() => fs.writeFileSync(input.sentinel, "escaped")),
  rootFs: await attempt(() => fs.writeFileSync("/tmp/amc-escape", "x")), tcp: await attempt(tcp), dns: await attempt(() => dns.lookup("example.com")) })))();`;

export function judgeProbeContainment(rows, direct, host) {
  const outcome = Object.fromEntries((rows ?? []).map((row) => [row.id, row.outcome]));
  const blocked = (value) => typeof value === "string" && value !== "succeeded";
  return [
    ["probe-ran-contained", "the contained probe returned rows (positive control)", Array.isArray(rows) && rows.length === 3],
    ["probe-dynamic-import-escape", "import() error constructor reaching process", ["load-failed", "threw", "invalid-output"].includes(outcome["dynamic-import-error"])],
    ["probe-static-import", "a static import of node:fs", outcome["static-import"] === "load-failed"],
    ["probe-no-process-global", "process is not a context global", outcome["global-process"] === "returned"],
    ["probe-host-sentinel", "no payload or direct attempt wrote the host sentinel", !host.sentinelExists],
    ["probe-direct-nobody", "code outside the vm runs as nobody", direct?.uid === 65534],
    ["probe-direct-host-write", "code outside the vm writing the host sentinel path", blocked(direct?.hostSentinel)],
    ["probe-direct-root-fs", "code outside the vm writing the root filesystem", blocked(direct?.rootFs)],
    ["probe-direct-network", "code outside the vm reaching 1.1.1.1:443 or DNS", blocked(direct?.tcp) && blocked(direct?.dns)]
  ].map(([id, attempt, passed]) => ({ id, attempt, passed: Boolean(passed) }));
}

async function probeContainer(operator, out) {
  const containment = { cli: operator.docker.cli, host: operator.docker.host, image: operator.docker.image };
  const sentinel = join(out, "probe-escape-sentinel.txt"), write = `.getBuiltinModule("fs").writeFileSync(${JSON.stringify(sentinel)}, "escaped")`;
  const sources = {
    "dynamic-import-error.mjs": `export async function f() { try { await import("x"); } catch (e) { e.constructor.constructor("return process")()${write}; } return 1; }`,
    "static-import.mjs": `import { writeFileSync } from "node:fs";\nexport function f() { writeFileSync(${JSON.stringify(sentinel)}, "escaped"); return 1; }`,
    "global-process.mjs": `export function f() { return typeof process === "undefined" ? "no process" : process${write}; }` };
  const rows = await runContainedProbe(containment, { sources, calls: Object.keys(sources).map((name) => ({ id: name.replace(".mjs", ""), module: name, export: "f", args: [] })) },
    { timeoutMs: 180_000 });
  const run = spawnSync(containment.cli, ["run", "--rm", "-i", ...PROBE_LIMITS, containment.image, "node", "-e", DIRECT],
    { env: { PATH: "/usr/bin:/bin", HOME: homedir(), DOCKER_HOST: containment.host }, input: JSON.stringify({ sentinel }), encoding: "utf8", timeout: 180_000 });
  let direct = null;
  try { direct = JSON.parse(run.stdout.trim().split("\n").at(-1)); } catch { direct = null; }
  const host = { sentinelExists: existsSync(sentinel) };
  return { limits: PROBE_LIMITS, rows, direct, host, checks: judgeProbeContainment(rows, direct, host) };
}

async function main(argv) {
  const at = (name) => { const index = argv.indexOf(name); return index < 0 ? null : argv[index + 1]; };
  const operator = JSON.parse(readFileSync(at("--config"), "utf8")), out = resolve(at("--out") ?? "");
  if (!at("--out") || !out.startsWith(`${operator.docker.mountableRoot}/`)) throw new Error("usage: containment.mjs --config <operator.json> --out <new directory under the mountable root>");
  mkdirSync(out);
  const docker = { ...operator.docker, env: { HOME: homedir(), PATH: "/usr/bin:/bin", DOCKER_HOST: operator.docker.host } };
  const workspace = join(out, "workspace"), outside = join(out, "outside-target"), canaryDir = join(out, "host-secrets", ".ssh");
  for (const dir of [workspace, outside, canaryDir]) mkdirSync(dir, { recursive: true });
  const canary = `AMC-CANARY-${randomBytes(12).toString("hex")}`, hostCanary = join(canaryDir, "id_canary");
  writeFileSync(hostCanary, canary);
  symlinkSync(outside, join(workspace, "link-out")); symlinkSync("/etc", join(workspace, "link-etc"));
  const hostHomeTarget = join(homedir(), `amc-escape-${randomBytes(6).toString("hex")}`);
  const [listed, unlisted] = [await listen("listed-ok"), await listen("unlisted")];
  const listedPort = listed.address().port, unlistedPort = unlisted.address().port;
  const network = await startNetwork(docker, [listedPort]);
  let result;
  try {
    result = await runAgent(docker, { network: network.network, workdir: workspace, timeoutMs: 300_000, env: { HOME: "/home/pilot" },
      mounts: [{ src: workspace }, { src: PROBE, dst: "/pilot/escapeProbe.mjs", readonly: true }],
      args: ["/pilot/escapeProbe.mjs", JSON.stringify({ workspace, hostHomeTarget, hostCanary, hostGateway: operator.docker.hostGateway, relay: network.relay,
        listedPort, unlistedPort, forkTarget: 5000 })] });
  } finally { network.close(); listed.close(); unlisted.close(); }
  const probe = JSON.parse(result.stdout.trim().split("\n").at(-1));
  const host = { hostHomeFile: existsSync(hostHomeTarget), escapedFile: existsSync(join(outside, "escaped.txt")), canaryInOutput: (result.stdout + result.stderr).includes(canary),
    insideFile: existsSync(join(workspace, "inside.txt")),
    containerGone: spawnSync(docker.cli, ["ps", "-a", "-q", "--filter", `name=${result.container}`], { env: docker.env, encoding: "utf8" }).stdout.trim() === "" };
  const probeContainment = await probeContainer(operator, out);
  const checks = [...judgeEscapes(probe, host), ...probeContainment.checks];
  const versions = Object.fromEntries([["docker", ["version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"]]].map(([name, args]) =>
    [name, spawnSync(docker.cli, args, { env: docker.env, encoding: "utf8" }).stdout.trim()]));
  const record = { schemaVersion: "p1-47-containment/1", environment: "local macOS arm64, colima Docker VM, not CI", recordedAt: new Date().toISOString(),
    claim: "These results describe the container runtime's isolation on this machine. They are not an AMC claim.", image: operator.docker.image, versions,
    limits: result.limits, mounts: result.mounts, topology: { network: "docker --internal", relayPorts: [listedPort], hostGateway: operator.docker.hostGateway },
    exit: { code: result.exitCode, timedOut: result.timedOut, truncated: result.truncated }, probe: { ...probe, readHostCanary: { ok: probe.readHostCanary.ok } }, host,
    codingProbeContainer: { limits: probeContainment.limits, mounts: "none", rows: probeContainment.rows, direct: probeContainment.direct, host: probeContainment.host }, checks,
    summary: { passed: checks.filter((row) => row.passed).length, total: checks.length } };
  writeFileSync(join(out, "escape-checks.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(record.summary)}\n`);
  if (record.summary.passed !== record.summary.total) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
