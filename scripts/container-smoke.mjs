#!/usr/bin/env node
/** Linux Docker acceptance for already-built local images; never builds or publishes. */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyPackedRun } from "./packed-evidence-verification.mjs";

const args = process.argv.slice(2);
const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const studioImage = value("--studio-image"); const runnerImage = value("--runner-image");
if (!studioImage && !runnerImage) throw new Error("Specify --studio-image and/or --runner-image with locally built image tags");
const receiptPath = resolve(value("--out") ?? "tmp/container-smoke.json");
const id = `amc-smoke-${randomUUID()}`;
const dir = mkdtempSync(join(tmpdir(), "amc-container-secrets-"));
const containers = []; const volumes = []; const secrets = [];
const receipt = { schemaVersion: "2026-09-08", startedAt: new Date().toISOString(), targetPlatform: "linux", hostPlatform: process.platform, dockerEngine: null, studioImage, runnerImage, checks: [], ok: false };
function docker(command, { checked = true, timeout = 120000 } = {}) {
  const result = spawnSync("docker", command, { encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  const out = { ok: result.status === 0 && !result.error, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  if (checked && !out.ok) throw new Error(`docker ${command[0]} failed: ${out.stderr.slice(-1500) || result.error?.message || "nonzero exit"}`);
  return out;
}
function check(name, passed, detail = {}) {
  receipt.checks.push({ name, passed, ...detail });
  console.log(`${passed ? "ok  " : "FAIL"} ${name}`);
  if (!passed) throw new Error(name);
}
function secret(name, content) {
  const path = join(dir, name); writeFileSync(path, content, { mode: 0o644 }); secrets.push(content);
  return ["--mount", `type=bind,src=${path},dst=/run/secrets/${name},readonly`];
}
function volume(name) { const v = `${id}-${name}`; docker(["volume", "create", v]); volumes.push(v); return v; }
const sandbox = ["--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--tmpfs", "/tmp", "--tmpfs", "/home/amc:uid=10001,gid=10001,mode=0700"];
const cliWithSecret = ["sh", "-c", 'export AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")"; exec amc "$@"', "sh"];
function qualifyRun(label, invoke) {
  const result = invoke(["agent-loop", "run", "--provider", "stub", "--json", "say hello"]);
  const summary = JSON.parse(result.stdout);
  check(`${label}: keyless turn and cold signed verification`, verifyPackedRun({ summary, runCommand: (_label, args) => invoke(args) }));
  return summary;
}
const installedCheck = `
const fs=require('node:fs'); const {createRequire}=require('node:module');
const root='/opt/amc/node_modules/agent-maturity-compass'; const r=createRequire(root+'/package.json');
if(process.getuid()!==10001)throw Error('runtime is not UID 10001');
for(const p of ['src','vendor','packages'])if(fs.existsSync(root+'/'+p))throw Error('source/private workspace shipped');
try{r.resolve('@amc/core');throw Error('private workspace resolved')}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
new (r('better-sqlite3'))(':memory:').close();
const manifest=JSON.parse(fs.readFileSync(root+'/dist/kernel/amcRuntime.bundle.json','utf8'));
const notices=fs.readFileSync(root+'/dist/kernel/amcRuntime.js.NOTICES.md','utf8');
if(!manifest.packages.length || !manifest.packages.every(p=>notices.includes('## '+p.name+'@'+p.version)))throw Error('bundle notices incomplete');
console.log(JSON.stringify({uid:process.getuid(),bundledPackages:manifest.packages.length,version:r("./package.json").version}));`;
async function studio() {
  const name = `${id}-studio`; const data = volume("studio-data");
  const mounts = [...secret("vault", randomUUID() + randomUUID()), ...secret("owner-user", "container-owner"), ...secret("owner-pass", randomUUID() + randomUUID())];
  containers.push(name);
  docker(["run", "-d", "--name", name, "-p", "127.0.0.1::3212", ...sandbox, "--mount", `type=volume,src=${data},dst=/data/amc`, ...mounts,
    "-e", "AMC_BOOTSTRAP=1", "-e", "AMC_BIND=0.0.0.0", "-e", "AMC_LAN_MODE=true", "-e", "AMC_ENABLE_NOTARY=0",
    "-e", "AMC_ALLOWED_CIDRS=127.0.0.1/32,::1/128,172.16.0.0/12,10.0.0.0/8,192.168.0.0/16",
    "-e", "AMC_VAULT_PASSPHRASE_FILE=/run/secrets/vault", "-e", "AMC_BOOTSTRAP_OWNER_USERNAME_FILE=/run/secrets/owner-user",
    "-e", "AMC_BOOTSTRAP_OWNER_PASSWORD_FILE=/run/secrets/owner-pass", studioImage]);
  async function ready() {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      if (docker(["exec", name, "amc", "studio", "healthcheck"], { checked: false, timeout: 15000 }).ok) return;
      const state = docker(["inspect", "--format", "{{.State.Running}}", name]).stdout.trim();
      if (state !== "true") throw new Error("Studio exited before readiness");
      await new Promise((done) => setTimeout(done, 1000));
    }
    throw new Error("Studio readiness timed out");
  }
  const auth = `
const fs=require('node:fs');
(async()=>{const base='http://127.0.0.1:3212';const token=fs.readFileSync('/data/amc/.amc/studio/admin.token','utf8').trim();
const unauth=await fetch(base+'/agents',{signal:AbortSignal.timeout(5000)});
const auth=await fetch(base+'/agents',{headers:{'x-amc-admin-token':token},signal:AbortSignal.timeout(5000)});
if(unauth.status!==401||auth.status!==200)throw Error('authorization verdict '+unauth.status+'/'+auth.status);
console.log(JSON.stringify({unauthenticated:unauth.status,authenticated:auth.status}));})().catch(e=>{console.error(e.message);process.exit(1)});`;
  await ready(); check("studio: default entrypoint reaches readiness", true);
  const state = JSON.parse(docker(["inspect", name]).stdout)[0];
  const port = state.NetworkSettings.Ports["3212/tcp"][0].HostPort;
  for (const route of ["/healthz", "/readyz", "/console"]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(5000) });
    check(`studio: published port ${route}`, response.ok);
    await response.body?.cancel();
  }
  docker(["exec", name, "node", "-e", installedCheck]); check("studio: non-root installed artifact, SQLite and bundle notices", true);
  docker(["exec", name, "node", "-e", auth]); check("studio: anonymous refusal and authenticated access", true);
  const invoke = (args) => docker(["exec", "-w", "/data/amc", name, ...cliWithSecret, ...args]);
  const summary = qualifyRun("studio", invoke);
  docker(["restart", name]); await ready();
  docker(["exec", name, "node", "-e", auth]);
  check("studio: restart preserves signed session and authenticated access", verifyPackedRun({ summary, runCommand: (_label, args) => invoke(args) }));
}
function runner() {
  const data = volume("runner-data");
  const mount = secret("runner-vault", randomUUID() + randomUUID());
  const base = ["run", "--rm", ...sandbox, "--mount", `type=volume,src=${data},dst=/workspace`, ...mount,
    "-e", "AMC_VAULT_PASSPHRASE_FILE=/run/secrets/runner-vault"];
  const installed = JSON.parse(docker([...base, "--entrypoint", "node", runnerImage, "-e", installedCheck]).stdout);
  check("runner: non-root installed artifact, SQLite and bundle notices", true, installed);
  const version = docker([...base, runnerImage, "--version"]).stdout.trim();
  const help = docker([...base, runnerImage, "--help"]).stdout;
  check("runner: default CLI entrypoint", version === installed.version && help.includes("Usage: amc") && help.includes("amc evidence verify") && help.includes("amc --help --all"));
  for (const utility of ["python", "git", "jq"]) docker([...base, "--entrypoint", utility, runnerImage, "--version"]);
  check("runner: Python, Git and jq available", true);
  const invoke = (args) => docker([...base, "--entrypoint", "sh", runnerImage, ...cliWithSecret.slice(1), ...args]);
  invoke(["init", "--trust-boundary", "isolated"]);
  qualifyRun("runner across separate containers", invoke);
}
try {
  const info = JSON.parse(docker(["info", "--format", "{{json .}}"], { timeout: 15000 }).stdout);
  receipt.dockerEngine = { os: info.OSType, architecture: info.Architecture, serverVersion: info.ServerVersion };
  check("Docker daemon is Linux", info.OSType === "linux", { architecture: info.Architecture, serverVersion: info.ServerVersion });
  for (const image of [studioImage, runnerImage].filter(Boolean)) {
    const details = JSON.parse(docker(["image", "inspect", image]).stdout)[0];
    receipt.checks.push({ name: `image ${image}`, passed: true, id: details.Id, architecture: details.Architecture, os: details.Os });
  }
  if (studioImage) await studio();
  if (runnerImage) runner();
  receipt.ok = true;
} catch (error) {
  receipt.error = secrets.reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), String(error.message ?? error)); console.error(receipt.error);
} finally {
  for (const name of containers) {
    const output = docker(["logs", name], { checked: false });
    const logs = output.stdout + output.stderr;
    const leaked = secrets.some((value) => logs.includes(value));
    receipt.checks.push({ name: `${name}: runtime secret values absent from logs`, passed: output.ok && !leaked });
    if (!output.ok || leaked) receipt.ok = false;
    docker(["rm", "-f", name], { checked: false });
  }
  for (const name of volumes) docker(["volume", "rm", name], { checked: false });
  rmSync(dir, { recursive: true, force: true });
  receipt.finishedAt = new Date().toISOString();
  mkdirSync(join(receiptPath, ".."), { recursive: true });
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
}
process.exitCode = receipt.ok ? 0 : 1;
