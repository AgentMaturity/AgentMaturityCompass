#!/usr/bin/env node
// P1-47 pilot target adapter, run by the comparison runner:
//   adapter.mjs <pilot-config.json> <target> <workspace> <fixture> <context>
// It seeds the task under <workspace>/workspace, starts the trial's model endpoint and fixture service, runs the target
// (Pi only inside its container; AMC native on the host under P1-05's shell confinement), then prints one receipt.
// The independent oracle judges the outcome; nothing here decides a pass.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve, sep } from "node:path";
import { captureCodingOutputSnapshot, invoke, loopbackOrigin, putJson, readJson } from "../codingCommon.mjs";
import { amcEnvironment, prepareAmcForPi, prepareAmcNative, startBridge } from "./amcSetup.mjs";
import { ENTRY, runAgent, startNetwork } from "./container.mjs";
import { startGateway } from "./gateway.mjs";
import { verifyPins } from "./pins.mjs";
import { scriptedResponder } from "./scripted.mjs";

const VERSION = "2026-09-08";
const TARGETS = new Set(["amc-native", "pi-contained", "pi-contained-amc", "pi-contained-tuned", "pi-contained-amc-tuned"]);
const TUNED_TOOLS = { coding: "read,write,edit,ls,grep,find", regulated: "read,write,edit,ls,grep,find", finops: "read,write,bash" };
const [configPath, targetId, workspaceArg, fixturePath, contextPath] = process.argv.slice(2);
const receipt = { schemaVersion: VERSION, kind: "pilot-trial", fixtureId: null, targetId, setup: [], services: {}, containment: null, scripted: null,
  execution: { started: false, exitCode: null, signal: null, truncated: false, timedOut: false }, harness: null, error: null, modelRequests: 0,
  gateway: { requests: [] }, pins: { beforeVerified: false, afterVerified: false } };
const secrets = [], cleanups = [];
const scrub = (value) => { let text = JSON.stringify(value); for (const secret of secrets) if (secret) text = text.split(secret).join("[REDACTED]"); return JSON.parse(text); };
const failed = (result) => result.exitCode !== 0 || result.signal !== null || result.truncated || result.timedOut;
const freePort = () => new Promise((done, reject) => { const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => done(port)); }); });

/** Writes the fixture's files under the task root; names stay under repo/ or task/. */
function seed(taskRoot, fixture) {
  for (const [name, content] of Object.entries(fixture.files)) {
    if (!/^(repo|task)\/[A-Za-z0-9_.\/-]+$/.test(name) || name.split("/").includes("..") || typeof content !== "string") throw new Error("Unsafe fixture member");
    mkdirSync(dirname(join(taskRoot, name)), { recursive: true, mode: 0o755 });
    writeFileSync(join(taskRoot, name), content, { flag: "wx", mode: 0o644 });
  }
}

/** The model endpoint for this lane: scripted (debugging only), local loopback, or live with the operator's dated rate. */
async function modelEndpoint(config, lane, fixture, model) {
  const bounded = { ...lane, model };
  if (lane.kind === "keyless-conformance") {
    const scripted = scriptedResponder(fixture);
    return { gateway: await startGateway({ lane: bounded, respond: scripted.respond }), scripted };
  }
  if (lane.kind === "local-provider") {
    return { gateway: await startGateway({ lane: bounded, upstream: { chatUrl: `${loopbackOrigin(lane.settings.baseURL)}/v1/chat/completions`,
      headers: { authorization: "Bearer amc-local-comparison" } } }) };
  }
  const name = lane.requiredSecretEnv[0], key = process.env[name], live = config.live;
  const url = new URL(live?.chatUrl ?? "invalid:");
  if (!key || url.protocol !== "https:" || url.username || url.password || !lane.permissions.network.includes(url.origin)) throw new Error("The live lane needs an https endpoint named in its network permissions and its credential");
  secrets.push(key);
  // Only a positive, dated, published rate becomes a cost; anything else leaves cost unknown.
  const rate = live.pricing, priced = rate?.inputPerMillionUsd > 0 && rate.outputPerMillionUsd > 0 && /^https:/.test(rate.sourceUrl ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(rate.asOf ?? "");
  return { gateway: await startGateway({ lane: bounded, upstream: { chatUrl: url.href, headers: live.authHeader === "x-api-key" ? { "x-api-key": key } : { authorization: `Bearer ${key}` } },
    ...(priced ? { pricing: rate } : {}) }) };
}

/** P1-19's provider on a loopback TCP port; its admin socket and token file stay outside the agent's reach. */
async function startFinance(config, fixture, taskRoot, env) {
  const faults = fixture.finance.faults;
  if (faults !== null && !config.finance.faults.includes(faults)) throw new Error("Unknown fault plan");
  const dir = mkdtempSync("/tmp/amcfin-"); // short: macOS limits Unix socket paths
  const child = spawn(process.execPath, [config.finance.server, "--dir", dir, "--seed", config.finance.seed,
    ...(faults ? ["--faults", join(config.finance.faultsDir, faults)] : []), "--port", "0"], { env, stdio: ["ignore", "pipe", "pipe"] });
  const exited = new Promise((done) => child.on("close", done));
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-400); });
  const ready = await new Promise((done) => {
    let text = ""; const timer = setTimeout(() => done(null), 180_000); // generous: a loaded host starts Node slowly
    child.stdout.on("data", (chunk) => { text += chunk; const line = text.split("\n")[0]; if (text.includes("\n")) { clearTimeout(timer); try { done(JSON.parse(line)); } catch { done(null); } } });
    child.on("close", () => { clearTimeout(timer); done(null); });
  });
  const stop = async () => {
    child.kill("SIGTERM"); await exited;
    const head = JSON.parse(readFileSync(join(dir, "txlog-head.json"), "utf8"));
    const kept = join(dirname(dirname(taskRoot)), ".pilot-finance");
    mkdirSync(kept, { mode: 0o700 }); copyFileSync(join(dir, "txlog.jsonl"), join(kept, "txlog.jsonl"));
    rmSync(dir, { recursive: true, force: true });
    return { logPath: join(kept, "txlog.jsonl"), headHash: head.hash, headSeq: head.seq };
  };
  if (!ready?.apiOrigin) { await stop().catch(() => {}); throw new Error(`The finance fixture did not start: ${stderr.trim() || "no readiness line"}`); }
  const tokens = JSON.parse(readFileSync(join(dir, "tokens.json"), "utf8")), client = fixture.finance.client;
  const tenantId = JSON.parse(readFileSync(config.finance.seed, "utf8")).clients.find((row) => row.clientId === client)?.tenantId;
  if (!tokens[client] || !tenantId) { await stop(); throw new Error("Unknown finance client"); }
  secrets.push(...Object.values(tokens));
  writeFileSync(join(taskRoot, "task", "finance", "connection.json"), JSON.stringify({ baseUrl: ready.apiOrigin, tenantId, client, token: tokens[client] }, null, 2) + "\n", { flag: "wx" });
  return { port: Number(new URL(ready.apiOrigin).port), stop };
}

async function runPi({ config, lane, fixture, workspace, model, gateway, finance, control, env, deadline }) {
  const amc = targetId.includes("-amc"), tuned = targetId.endsWith("-tuned");
  const ports = [gateway.port, ...(finance ? [finance.port] : [])];
  const mounts = [{ src: workspace }, { src: config.pi.prefix, readonly: true }, { src: ENTRY, dst: "/pilot/entry.mjs", readonly: true }];
  if (amc) {
    const bridgePort = await freePort(); ports.push(bridgePort);
    const amcEnv = amcEnvironment(env); secrets.push(...amcEnv.secrets); Object.assign(process.env, { AMC_VAULT_PASSPHRASE: amcEnv.env.AMC_VAULT_PASSPHRASE });
    receipt.setup.push(...await prepareAmcForPi({ amc: config.amc, workspace, env: amcEnv.env, control, piBin: join(config.pi.prefix, "node_modules", ".bin"), bridgePort, tuned }));
    const bridge = await startBridge({ amc: config.amc, workspace, port: bridgePort }); cleanups.push(() => bridge.close());
    mounts.push({ src: join(workspace, ".amc"), readonly: true }, { src: join(workspace, ".pi"), readonly: true }, { src: join(config.amc.root, "dist"), readonly: true });
  }
  const network = await startNetwork(config.docker, ports); cleanups.push(network.close);
  const models = { providers: { pilot: { baseUrl: `http://127.0.0.1:${gateway.port}/v1`, api: "openai-completions", apiKey: gateway.token, authHeader: true,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    models: [{ id: model, name: model, reasoning: false, input: ["text"], contextWindow: lane.settings.contextWindow ?? 32768, maxTokens: lane.settings.maxOutputTokens }] } } };
  const settings = { defaultProvider: "pilot", defaultModel: model, defaultThinkingLevel: "off", enableInstallTelemetry: false, compaction: { enabled: false },
    retry: { enabled: false, maxRetries: 0 } };
  const args = ["--approve", "--offline", "--no-session", "--provider", "pilot", "--model", model, ...(tuned ? ["--tools", TUNED_TOOLS[fixture.domain]] : []), "-p", prompt(fixture)];
  receipt.setup.push({ label: "pi-binding", args: args.slice(0, -1), configuration: "private tmpfs HOME; the gateway token is per trial" });
  receipt.execution.started = true;
  const result = await runAgent(config.docker, { network: network.network, mounts, workdir: workspace, timeoutMs: Math.max(1000, deadline - Date.now()),
    env: { HOME: "/home/pilot", PI_CODING_AGENT_DIR: "/home/pilot/.pi-agent", PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0", LANG: "C.UTF-8" },
    args: ["/pilot/entry.mjs", JSON.stringify({ relay: network.relay, ports, piCli: config.pi.cli, args, models, settings })] });
  receipt.containment = { image: config.docker.image, limits: result.limits, mounts: result.mounts, network: { kind: "docker --internal", relay: "explicit host port list", ports },
    claim: "Isolation is the container runtime's; it is not an AMC claim." };
  return result;
}

async function runAmcNative({ config, fixture, workspace, model, gateway, env, deadline }) {
  const amcEnv = amcEnvironment(env); secrets.push(...amcEnv.secrets);
  const native = await prepareAmcNative({ amc: config.amc, workspace, env: amcEnv.env, domain: fixture.domain });
  secrets.push(...native.secrets); receipt.setup.push(...native.setup);
  const args = ["agent-loop", "run", "--provider", "openai", "--model", model, "--base-url", gateway.origin, "--credential", "PILOT_GATEWAY_TOKEN",
    "--credentials-home", env.HOME, "--credentials-file", join(env.HOME, ".credentials.yaml"), "--tools", "workspace", ...native.preset, "--max-steps", "24", "--json"];
  receipt.setup.push({ label: "amc-native-binding", args });
  receipt.execution.started = true;
  return invoke(config.amc.cli, [...args, prompt(fixture)], { cwd: workspace, env: { ...amcEnv.env, PILOT_GATEWAY_TOKEN: gateway.token },
    timeoutMs: Math.max(1000, deadline - Date.now()) });
}

const prompt = (fixture) => fixture.prompt;
let gateway, scripted, finance, context, config, workspace;
try {
  if (process.argv.length !== 7 || !TARGETS.has(targetId)) throw new Error("Usage: adapter.mjs <config> <target> <workspace> <fixture> <context>");
  config = readJson(configPath); workspace = realpathSync(workspaceArg); context = readJson(contextPath);
  const fixture = readJson(fixturePath), lane = context.lane;
  receipt.fixtureId = fixture.id;
  receipt.kind = fixture.domain === "coding" ? "local-coding" : "pilot-trial";
  if (context.schemaVersion !== VERSION || context.target?.id !== targetId || context.task?.id !== fixture.id || !["coding", "regulated", "finops"].includes(fixture.domain)) throw new Error("Context, target and fixture disagree");
  if (basename(resolve(context.observationsPath)) !== "observations.json" || realpathSync(dirname(resolve(context.observationsPath))) !== workspace) throw new Error("Observations must stay in the comparison workspace");
  if (targetId !== "amc-native" && !(workspace + sep).startsWith(config.docker.mountableRoot + sep)) throw new Error("The trial workspace is outside the container runtime's mountable root; run with TMPDIR under it");
  verifyPins(config.pins); receipt.pins.beforeVerified = true;
  const deadline = Date.now() + lane.budgets.timeoutMs - 8000;
  const taskRoot = join(workspace, "workspace"); mkdirSync(taskRoot, { mode: 0o755 }); seed(taskRoot, fixture);
  const control = mkdtempSync(join(dirname(workspace), ".pilot-control-")), home = join(control, "home"), temp = join(control, "tmp");
  mkdirSync(home, { mode: 0o700 }); mkdirSync(temp, { mode: 0o700 });
  const env = { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, "config"), XDG_CACHE_HOME: join(home, "cache"), TMPDIR: temp,
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, LANG: "C", NO_COLOR: "1", CI: "1" };
  const model = lane.model ?? "scripted";
  ({ gateway, scripted } = await modelEndpoint(config, lane, fixture, model)); secrets.push(gateway.token);
  if (fixture.domain === "finops") finance = await startFinance(config, fixture, taskRoot, env);
  const dockerEnv = { ...config.docker, env: { HOME: home, PATH: env.PATH, DOCKER_HOST: config.docker.host } };
  const options = { config: { ...config, docker: dockerEnv }, lane, fixture, workspace, model, gateway, finance, control, env, deadline };
  const result = targetId === "amc-native" ? await runAmcNative(options) : await runPi(options);
  receipt.execution = { started: true, exitCode: result.exitCode, signal: result.signal, truncated: result.truncated, timedOut: result.timedOut };
  receipt.harness = { stdoutTail: result.stdout.slice(-6000), stderrTail: result.stderr.slice(-3000) };
  if (fixture.files["repo/solution.mjs"] !== undefined) receipt.outputSnapshot = captureCodingOutputSnapshot(taskRoot, { secrets });
  if (failed(result)) receipt.error = "The harness under test did not finish successfully; the oracle still inspects the actual outputs";
} catch (error) {
  receipt.error = error instanceof Error ? error.message.slice(0, 400) : "Pilot adapter failed";
} finally {
  for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch { receipt.error ??= "Cleanup failed"; } }
  if (finance) { try { receipt.services.finance = await finance.stop(); } catch { receipt.error ??= "The finance fixture log could not be retained"; } }
  if (gateway) {
    await gateway.close().catch(() => {});
    receipt.modelRequests = gateway.requests.filter((row) => row.forwarded).length;
    receipt.gateway = { requests: gateway.requests, boundary: "Only requests routed through this trial's endpoint are observed." };
    if (scripted) receipt.scripted = { ...scripted.record(), label: "scripted endpoint; debugging only; never a result" };
    try {
      // The harness could have written observations.json; replace it with the endpoint's own record.
      const staged = join(workspace, `.pilot-observations-${randomBytes(8).toString("hex")}.json`);
      putJson(staged, gateway.observations()); renameSync(staged, context.observationsPath);
    } catch { receipt.error ??= "Could not publish the endpoint's observations"; }
  }
  if (receipt.pins.beforeVerified) { try { verifyPins(config.pins); receipt.pins.afterVerified = true; } catch { receipt.error ??= "A pinned runtime file changed during the trial"; } }
}
process.stdout.write(JSON.stringify(scrub(receipt)) + "\n");
