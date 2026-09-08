import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function entrypoint(args: string[], options: { bootstrap?: boolean; failBootstrap?: boolean; missingSecret?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "amc-container-entrypoint-")); dirs.push(dir);
  const fake = join(dir, "amc"); const calls = join(dir, "calls.jsonl");
  writeFileSync(fake, `#!/usr/bin/env node\nconst fs=require('node:fs');fs.appendFileSync(process.env.AMC_TEST_CALLS,JSON.stringify(process.argv.slice(2))+'\\n');if(process.argv[2]==='bootstrap'&&process.env.AMC_TEST_FAIL==='1')process.exit(17);\n`);
  chmodSync(fake, 0o755);
  const env: NodeJS.ProcessEnv = { PATH: `${dir}:${process.env.PATH}`, HOME: dir, AMC_TEST_CALLS: calls, AMC_WORKSPACE_DIR: join(dir, "workspace with spaces"), AMC_TEST_FAIL: options.failBootstrap ? "1" : "0" };
  if (options.bootstrap === false) env.AMC_BOOTSTRAP = "0";
  if (!options.missingSecret) {
    for (const key of ["AMC_VAULT_PASSPHRASE_FILE", "AMC_BOOTSTRAP_OWNER_USERNAME_FILE", "AMC_BOOTSTRAP_OWNER_PASSWORD_FILE"]) {
      const file = join(dir, key); writeFileSync(file, "runtime-secret"); env[key] = file;
    }
  }
  const result = spawnSync("bash", [resolve("docker/entrypoint.sh"), ...args], { env, encoding: "utf8" });
  return { ...result, calls: existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [], dir };
}

describe("container source build and runtime contracts", () => {
  it("builds the frozen workspace and installs its packed artifact in separate stages", () => {
    const file = read("Dockerfile");
    expect(file).toContain("pnpm install --frozen-lockfile");
    expect(file).toContain("pnpm run build");
    expect(file).toContain("npm pack --ignore-scripts");
    expect(file).toContain("npm install --omit=dev");
    expect(file).toMatch(/FROM .* AS runner/);
    expect(file).toMatch(/FROM .* AS studio/);
    expect(file).not.toMatch(/package-lock\.json|npm ci|npm link|COPY \. \./);
    for (const path of ["pnpm-lock.yaml", "pnpm-workspace.yaml", "scripts/", "vendor/", "packages/", "src/"]) expect(file).toContain(path);
    expect(file).toContain("USER 10001:10001");
    expect(file).not.toMatch(/(?:ENV|ARG)\s+AMC_.*(?:PASSPHRASE|PASSWORD|SECRET)/);
    expect(existsSync("Dockerfile.runner")).toBe(false);
    expect(existsSync("deploy/compose/Dockerfile")).toBe(false);
  });

  it("points source compose services at the canonical target and installed executable", () => {
    for (const path of ["deploy/compose/docker-compose.yml", "deploy/compose/docker-compose.tls.yml", "docker/docker-compose.yml"]) {
      const compose = YAML.parse(read(path));
      for (const service of Object.values(compose.services) as any[]) {
        if (!service.build) continue;
        expect(service.build.dockerfile).toBe("Dockerfile");
        expect(service.build.target).toBe("studio");
        expect(existsSync(resolve(path, "..", service.build.context, service.build.dockerfile))).toBe(true);
        expect(JSON.stringify(service)).not.toContain("dist/cli.js");
      }
    }
  });

  it("passes explicit CLI arguments through without initializing state", () => {
    const result = entrypoint(["notary", "start", "--notary-dir", "/custom path"], { missingSecret: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([["notary", "start", "--notary-dir", "/custom path"]]);
    expect(existsSync(join(result.dir, "workspace with spaces"))).toBe(false);
  });

  it.each([
    { command: ["session", "verify", "--json"] },
    { command: ["agent-loop", "verify", "preserved-session", "--json"] }
  ])("runs cold $command without bootstrap credentials or state initialization", ({ command }) => {
    const result = entrypoint(command, { missingSecret: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([command]);
    expect(existsSync(join(result.dir, "workspace with spaces"))).toBe(false);
  });

  it("preserves an explicit studio subcommand rather than applying the default startup", () => {
    const result = entrypoint(["studio", "--help"], { missingSecret: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([["studio", "--help"]]);
  });

  it("qualifies the exact loaded image before either publication workflow pushes it", () => {
    for (const file of [".github/workflows/docker-runner.yml", ".github/workflows/release.yml"]) {
      const workflow = YAML.parse(read(file));
      const steps = Object.values(workflow.jobs).flatMap((job: any) => job.steps ?? []) as any[];
      const buildIndex = steps.findIndex((step) => step.id === "runtime_image");
      const build = steps[buildIndex];
      expect(build.with).toMatchObject({ load: true, push: false, platforms: "linux/amd64" });
      const qualifyIndex = steps.findIndex((step) => String(step.run ?? "").includes("scripts/container-smoke.mjs"));
      expect(qualifyIndex).toBeGreaterThan(buildIndex);
      expect(Object.values(steps[qualifyIndex].env)).toContain("${{ steps.runtime_image.outputs.imageid }}");
      const pushIndex = steps.findIndex((step) => String(step.run ?? "").includes('docker push "$tag"'));
      expect(pushIndex).toBeGreaterThan(qualifyIndex);
      expect(String(steps[pushIndex].run)).toContain("docker image inspect --format '{{.Id}}'");
    }
  });

  it("bootstraps then starts the installed CLI with the exact workspace", () => {
    const result = entrypoint([]);
    expect(result.status, result.stderr).toBe(0);
    const workspace = join(result.dir, "workspace with spaces");
    expect(result.calls).toEqual([["bootstrap", "--workspace", workspace], ["studio", "start", "--workspace", workspace, "--bind", "0.0.0.0", "--port", "3212"]]);
  });

  it("does not start Studio when bootstrap fails", () => {
    const result = entrypoint([], { failBootstrap: true });
    expect(result.status).toBe(17);
    expect(result.calls).toHaveLength(1);
  });

  it("fails before bootstrap when runtime secrets are missing", () => {
    const result = entrypoint([], { missingSecret: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("AMC_VAULT_PASSPHRASE_FILE");
    expect(result.calls).toEqual([]);
  });

  it("allows an initialized workspace to start with bootstrap disabled", () => {
    const result = entrypoint([], { bootstrap: false });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].slice(0, 2)).toEqual(["studio", "start"]);
  });

  it.each(["success", "container-removal-fails", "volume-removal-fails"])("pins runtime images and continues recorded cleanup when %s", (mode) => {
    const dir = mkdtempSync(join(tmpdir(), "amc-container-cleanup-")); dirs.push(dir);
    const preload = join(dir, "synthetic-docker.mjs");
    const callsPath = join(dir, "calls.jsonl");
    const receiptPath = join(dir, "receipt.json");
    // Run the real smoke main with synthetic Docker/HTTP outcomes; no daemon or
    // image is used. Qualification passes so only cleanup can change the verdict.
    writeFileSync(preload, `
import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
const sessionId="11111111-1111-4111-8111-111111111111";
const otherSessionId="22222222-2222-4222-8222-222222222222";
const studioImage="sha256:"+"1".repeat(64),runnerImage="sha256:"+"2".repeat(64);
let killed=false;
globalThis.fetch=async()=>({ok:true,body:{cancel:async()=>{}}});
child.spawnSync=(command,args)=>{
  if(command!=="docker")throw Error("Unexpected command "+command);
  appendFileSync(process.env.AMC_TEST_CALLS,JSON.stringify(args)+"\\n");
  // The inspected tags can now point elsewhere. Only the inspected immutable
  // IDs retain the fixture's known runtime; using either original tag fails.
  if(args[0]==="run"&&args.some(arg=>arg==="review/studio:mutable"||arg==="review/runner:mutable"))return {status:125,stdout:"",stderr:"synthetic mutable tag moved after inspect"};
  if(args[0]==="rm"&&process.env.AMC_TEST_CLEANUP==="container-removal-fails")return {status:1,stdout:"",stderr:"synthetic container removal failure"};
  if(args[0]==="volume"&&args[1]==="rm"&&process.env.AMC_TEST_CLEANUP==="volume-removal-fails")return {status:1,stdout:"",stderr:"synthetic volume removal failure"};
  if(args[0]==="kill")killed=true;
  let output="",status=0;
  if(args[0]==="info")output=JSON.stringify({OSType:"linux",Architecture:"aarch64",ServerVersion:"synthetic"});
  else if(args[0]==="image")output=JSON.stringify([{Id:args[2].includes("studio")?studioImage:runnerImage,Architecture:"arm64",Os:"linux"}]);
  else if(args[0]==="inspect")output=args.includes("--format")?"true":JSON.stringify([{NetworkSettings:{Ports:{"3212/tcp":[{HostPort:"3212"}]}}}]);
  else if(args[0]==="volume"&&args[1]==="create")output=args[2];
  else if(args[0]==="run"&&args.includes("node"))output=JSON.stringify({uid:10001,bundledPackages:1,version:"1.0.0"});
  else if(args.includes("--version"))output="1.0.0";
  else if(args.includes("--help"))output="Usage: amc\\namc evidence verify\\namc --help --all";
  else if(args.includes("agent-loop")&&args[args.indexOf("agent-loop")+1]==="run")output=JSON.stringify({sessionId,driverStatus:"idle",unsignedRows:0,events:5,turns:1,requests:1,toolCalls:1,endings:[{turn:1,reason:"complete",interrupted:false}]});
  else if(args.includes("verify")){
    const interrupted=killed&&!args.includes(runnerImage);
    const errors=interrupted?["Session "+otherSessionId+" missing seal"]:[];
    status=interrupted?1:0;
    output=JSON.stringify(args.includes("agent-loop")
      ?{ok:!interrupted,sessionId,ledgerOk:!interrupted,ledgerErrors:errors,sessionChainErrors:[],unsignedRowIds:[],requests:[{status:"reconstructed",headerEventId:"header1"}]}
      :{ok:!interrupted,chain:{ok:!interrupted,errors},errors,sessions:{closed:[sessionId]}});
  }
  return {status,stdout:output,stderr:""};
};
syncBuiltinESMExports();
`);
    const result = spawnSync(process.execPath, ["--import", preload, resolve("scripts/container-smoke.mjs"),
      "--studio-image", "review/studio:mutable", "--runner-image", "review/runner:mutable", "--out", receiptPath], {
      encoding: "utf8", timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: dir, AMC_TEST_CALLS: callsPath, AMC_TEST_CLEANUP: mode }
    });
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    const calls = readFileSync(callsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
    expect(receipt).toMatchObject({ requestedStudioImage: "review/studio:mutable", requestedRunnerImage: "review/runner:mutable",
      studioImage: `sha256:${"1".repeat(64)}`, runnerImage: `sha256:${"2".repeat(64)}` });
    const runs = calls.filter((args) => args[0] === "run");
    expect(runs.length).toBeGreaterThan(6);
    for (const args of runs) {
      expect(args).not.toContain("review/studio:mutable");
      expect(args).not.toContain("review/runner:mutable");
      expect(args.some((arg) => arg === receipt.studioImage || arg === receipt.runnerImage)).toBe(true);
    }
    const coldVerifiers = runs.filter((args) => args.includes("--network") && args.includes("verify"));
    expect(coldVerifiers).toHaveLength(6);
    const studioDataMount = runs.find((args) => args.includes("-d"))!.find((arg) => arg.startsWith("type=volume,"))!;
    for (const args of coldVerifiers) {
      expect(args[args.indexOf("--network") + 1]).toBe("none");
      expect(args).toContain(receipt.studioImage);
      expect(args).toContain(studioDataMount);
      expect(args.filter((arg) => arg.startsWith("type=bind,"))).toEqual([expect.stringMatching(/dst=\/run\/secrets\/vault,readonly$/)]);
      expect(args.some((arg) => /AMC_BOOTSTRAP|owner-user|owner-pass/.test(arg))).toBe(false);
    }
    const lifecycle = calls.filter((args) => ["start", "stop", "kill"].includes(args[0]!) || coldVerifiers.includes(args))
      .map((args) => args[0] === "run" ? args.includes("agent-loop") ? "run-verify" : "ledger-verify" : args[0]);
    expect(lifecycle).toEqual(["stop", "ledger-verify", "run-verify", "start", "stop", "ledger-verify", "run-verify", "start", "kill", "ledger-verify", "run-verify"]);
    const containerRemoval = calls.findIndex((args) => args[0] === "rm");
    const volumeRemoval = calls.findIndex((args) => args[0] === "volume" && args[1] === "rm");
    expect(containerRemoval).toBeGreaterThan(-1);
    expect(volumeRemoval).toBeGreaterThan(containerRemoval);
    const secretMount = calls.flat().find((arg) => arg.startsWith("type=bind,src=") && arg.includes("dst=/run/secrets/vault"))!;
    expect(existsSync(secretMount.split("src=")[1]!.split(",dst=")[0]!)).toBe(false);
    expect(receipt.checks.find((check: { name: string }) => check.name === "studio: interrupted gateway is refused by both cold verifiers")).toMatchObject({ passed: true });
    expect(result.status, result.stderr).toBe(mode === "success" ? 0 : 1);
    expect(receipt.ok).toBe(mode === "success");
    expect(receipt.cleanupResults.map((entry: { resource: string }) => entry.resource)).toEqual(["container", "volume", "volume", "secret files"]);
    if (mode !== "success") {
      expect(receipt.cleanupResults.some((entry: { ok: boolean }) => entry.ok === false)).toBe(true);
      expect(JSON.stringify(receipt)).toContain(mode === "container-removal-fails" ? "synthetic container removal failure" : "synthetic volume removal failure");
    }
  });
});
