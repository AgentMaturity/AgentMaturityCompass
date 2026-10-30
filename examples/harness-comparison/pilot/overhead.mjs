#!/usr/bin/env node
// Scripted overhead micro-benchmark (PLAN.md): a fixed benign sequence of `read` calls replayed through contained Pi
// without AMC and with AMC's Pi extension (tuned setup), driven by a scripted model. It measures added latency only:
//   node examples/harness-comparison/pilot/overhead.mjs --config <operator.json> --out <new directory> [--sessions 5] [--calls 200]
// Per call: the round trip at the model boundary (tool call sent -> next model request). Per Bridge request: its time.
// Decision latency: P1-22's method, the extension's tool_call handler to its result, in process on the host.
// The allow variant's workspace carries P1-22's conformance fixture run (synthetic, HIGH TRUST) only so that AMC lets
// the reads execute; that run is a latency-measurement fixture in a disposable workspace, never a result or a claim.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, loadavg } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { amcEnvironment, prepareAmcForPi, startBridge } from "./amcSetup.mjs";
import { ENTRY, runAgent, startNetwork } from "./container.mjs";

const AGENT = "default";
const quantiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b), at = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : null;
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null };
};
const round = (value) => value === null ? null : Number(value.toFixed(2));
const rounded = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "n" ? value : round(value)]));

/** A scripted model that issues `calls` reads of one file, one per turn, timing each round trip. */
const REFUSAL = /\b(denied|blocked|not allowed|requires? (?:an? )?approval|AMC control unavailable|exec ticket)\b/i;
function scriptedReader(calls, path) {
  const samples = [], refused = []; let sentAt = null;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (sentAt !== null) { samples.push(performance.now() - sentAt); sentAt = null; }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const last = (body.messages ?? []).at(-1);
      if (last?.role === "tool") refused.push(REFUSAL.test(typeof last.content === "string" ? last.content : JSON.stringify(last.content)));
      const done = (body.messages ?? []).filter((message) => message.role === "assistant" && message.tool_calls?.length).length;
      const frame = (delta, finish) => `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: "scripted", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      const call = done < calls;
      const text = (call ? frame({ role: "assistant", tool_calls: [{ index: 0, id: `read_${done}`, type: "function", function: { name: "read", arguments: JSON.stringify({ path }) } }] }, null) + frame({}, "tool_calls")
        : frame({ role: "assistant", content: "done" }, null) + frame({}, "stop"))
        + `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: "scripted", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`;
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(text, () => { if (call) sentAt = performance.now(); });
    });
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({ server, port: server.address().port, samples, refused })));
}

/** P1-22's conformance fixture run (tests/helpers/piHookFixtures.ts), written through AMC's own paths. Synthetic. */
async function fixtureRun(dist, workspace) {
  const { getAgentPaths } = await import(pathToFileURL(join(dist, "fleet", "paths.js")).href);
  const { questionBank } = await import(pathToFileURL(join(dist, "diagnostic", "questionBank.js")).href);
  const now = Date.now(), paths = getAgentPaths(workspace, AGENT);
  mkdirSync(paths.runsDir, { recursive: true });
  writeFileSync(join(paths.runsDir, "run_pilot_latency_fixture.json"), JSON.stringify({ agentId: AGENT, runId: "run_pilot_latency_fixture", ts: now,
    windowStartTs: now - 60_000, windowEndTs: now, status: "VALID", verificationPassed: true, trustBoundaryViolated: false, trustBoundaryMessage: null,
    integrityIndex: 0.95, trustLabel: "HIGH TRUST", targetProfileId: null, layerScores: [],
    questionScores: questionBank.map((question) => ({ questionId: question.id, claimedLevel: 5, supportedMaxLevel: 5, finalLevel: 5, confidence: 0.95,
      evidenceEventIds: ["ev_pilot_latency_fixture"], flags: [], narrative: "P1-47 latency-measurement fixture; synthetic; never a result" })),
    inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: 1, invalidReceiptsCount: 0, correlationWarnings: [], evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 }, targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [],
    runSealSig: "fixture", reportJsonSha256: "fixture" }, null, 2));
}

async function session(operator, config, variant, calls) {
  const root = mkdtempSync(join(config.work, `${variant}-`)), workspace = realpathSync(root), control = mkdtempSync(join(config.work, "control-"));
  mkdirSync(join(workspace, "workspace")); writeFileSync(join(workspace, "workspace", "public.txt"), "public fixture for the overhead replay\n");
  const env = { HOME: control, PATH: `${resolve(process.execPath, "..")}:/usr/bin:/bin`, LANG: "C" };
  const model = await scriptedReader(calls, "workspace/public.txt"), ports = [model.port], bridgeTimes = [], cleanups = [];
  const mounts = [{ src: workspace }, { src: operator.pi.prefix, readonly: true }, { src: ENTRY, dst: "/pilot/entry.mjs", readonly: true }];
  try {
    if (variant !== "pi-contained") {
      const bridgePort = await new Promise((done) => { const probe = createServer(); probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => done(port)); }); });
      const amcEnv = amcEnvironment(env); process.env.AMC_VAULT_PASSPHRASE = amcEnv.env.AMC_VAULT_PASSPHRASE;
      await prepareAmcForPi({ amc: config.amc, workspace, env: amcEnv.env, control, piBin: join(operator.pi.prefix, "node_modules", ".bin"), bridgePort, tuned: true, rpm: 100_000 });
      if (variant === "pi-contained-amc-tuned-allow") await fixtureRun(join(config.amc.root, "dist"), workspace);
      const bridge = await startBridge({ amc: config.amc, workspace, port: bridgePort }); cleanups.push(() => bridge.close());
      bridge.server.prependListener("request", (req, res) => {
        const started = performance.now(), route = (req.url ?? "").split("?")[0];
        res.once("finish", () => bridgeTimes.push({ route, ms: performance.now() - started }));
      });
      ports.push(bridgePort);
      mounts.push({ src: join(workspace, ".amc"), readonly: true }, { src: join(workspace, ".pi"), readonly: true }, { src: join(config.amc.root, "dist"), readonly: true });
    }
    const network = await startNetwork(config.docker, ports); cleanups.push(network.close);
    const piCli = join(operator.pi.prefix, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
    const result = await runAgent(config.docker, { network: network.network, mounts, workdir: workspace, timeoutMs: 3_600_000,
      env: { HOME: "/home/pilot", PI_CODING_AGENT_DIR: "/home/pilot/.pi-agent", PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" },
      args: ["/pilot/entry.mjs", JSON.stringify({ relay: network.relay, ports, piCli, args: ["--approve", "--offline", "--no-session", "--provider", "pilot", "--model", "scripted",
        "--tools", "read", "-p", "Replay the scripted reads."], models: { providers: { pilot: { baseUrl: `http://127.0.0.1:${model.port}/v1`, api: "openai-completions", apiKey: "scripted",
        models: [{ id: "scripted" }] } } }, settings: { defaultProvider: "pilot", defaultModel: "scripted", enableInstallTelemetry: false, compaction: { enabled: false }, retry: { enabled: false } } })] });
    return { variant, exitCode: result.exitCode, timedOut: result.timedOut, roundTripsMs: model.samples, bridgeTimes,
      stderrTail: result.stderr.slice(-400), toolResults: model.refused.length, refusedResults: model.refused.filter(Boolean).length };
  } finally {
    for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch { /* reported by the counts */ } }
    model.server.close(); rmSync(root, { recursive: true, force: true }); rmSync(control, { recursive: true, force: true });
  }
}

/** P1-22's decision-latency method on the allow path: the extension's tool_call handler to its result, through the loopback Bridge. */
async function handlerLatency(operator, config, calls) {
  const workspace = realpathSync(mkdtempSync(join(config.work, "handler-"))), control = mkdtempSync(join(config.work, "control-"));
  mkdirSync(join(workspace, "workspace")); writeFileSync(join(workspace, "workspace", "public.txt"), "public fixture\n");
  const env = { HOME: control, PATH: `${resolve(process.execPath, "..")}:/usr/bin:/bin`, LANG: "C" };
  const port = await new Promise((done) => { const probe = createServer(); probe.listen(0, "127.0.0.1", () => { const { port: free } = probe.address(); probe.close(() => done(free)); }); });
  const amcEnv = amcEnvironment(env); process.env.AMC_VAULT_PASSPHRASE = amcEnv.env.AMC_VAULT_PASSPHRASE;
  await prepareAmcForPi({ amc: config.amc, workspace, env: amcEnv.env, control, piBin: join(operator.pi.prefix, "node_modules", ".bin"), bridgePort: port, tuned: true, rpm: 100_000 });
  await fixtureRun(join(config.amc.root, "dist"), workspace);
  const bridge = await startBridge({ amc: config.amc, workspace, port });
  try {
    const { createAmcPiExtension } = await import(pathToFileURL(join(config.amc.root, "dist", "adapters", "pi", "amcPiExtension.js")).href);
    const version = JSON.parse(readFileSync(join(operator.pi.prefix, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"), "utf8")).version;
    const handlers = new Map();
    await createAmcPiExtension({ workspace, mode: "control", piVersion: version, modulePath: join(config.amc.root, "dist", "adapters", "pi", "amcPiExtension.js") })({
      on: (name, handler) => handlers.set(name, handler), getAllTools: () => [{ name: "read", sourceInfo: { source: "builtin", path: "builtin:read" } }] });
    const ctx = { mode: "print", hasUI: false, cwd: workspace, sessionManager: { getSessionId: () => "pilot-latency" }, ui: { notify: () => undefined } };
    const samples = []; let allowed = 0;
    for (let index = 0; index < calls; index += 1) {
      const started = performance.now();
      const result = await handlers.get("tool_call")({ toolName: "read", toolCallId: `lat_${index}`, input: { path: "workspace/public.txt" } }, ctx);
      samples.push(performance.now() - started); if (result === undefined) allowed += 1;
    }
    return { calls, allowed, ...rounded(quantiles(samples)) };
  } finally { await bridge.close(); rmSync(workspace, { recursive: true, force: true }); rmSync(control, { recursive: true, force: true }); }
}

async function main(argv) {
  const at = (name, fallback = null) => { const index = argv.indexOf(name); return index < 0 ? fallback : argv[index + 1]; };
  const operator = JSON.parse(readFileSync(at("--config"), "utf8")), out = resolve(at("--out") ?? "");
  if (!at("--out") || !out.startsWith(`${operator.docker.mountableRoot}/`)) throw new Error("usage: overhead.mjs --config <operator.json> --out <new directory under the mountable root>");
  mkdirSync(out); mkdirSync(join(out, "work"));
  const amcRoot = realpathSync(operator.amc.root);
  const config = { work: realpathSync(join(out, "work")), amc: { root: amcRoot, cli: join(amcRoot, "dist", "cli.js") },
    docker: { ...operator.docker, env: { HOME: homedir(), PATH: "/usr/bin:/bin", DOCKER_HOST: operator.docker.host } } };
  const sessions = Number(at("--sessions", "5")), calls = Number(at("--calls", "200"));
  const variants = ["pi-contained", "pi-contained-amc-tuned-allow", "pi-contained-amc-tuned-deny"], runs = [];
  const startedAt = new Date().toISOString(), loadBefore = loadavg();
  for (let index = 0; index < sessions; index += 1) for (const variant of variants) {
    runs.push(await session(operator, config, variant, calls));
    process.stderr.write(`session ${index + 1}/${sessions} ${variant}: ${runs.at(-1).roundTripsMs.length} calls, exit ${runs.at(-1).exitCode}\n`);
  }
  const byVariant = Object.fromEntries(variants.map((variant) => {
    const rows = runs.filter((row) => row.variant === variant), trips = rows.flatMap((row) => row.roundTripsMs), bridge = rows.flatMap((row) => row.bridgeTimes);
    const routes = Object.fromEntries([...new Set(bridge.map((row) => row.route))].map((route) => [route, rounded(quantiles(bridge.filter((row) => row.route === route).map((row) => row.ms)))]));
    return [variant, { sessions: rows.length, exits: rows.map((row) => row.exitCode), toolResults: rows.reduce((sum, row) => sum + row.toolResults, 0),
      refusedResults: rows.reduce((sum, row) => sum + row.refusedResults, 0), roundTripMs: rounded(quantiles(trips)), bridgeRoutesMs: routes }];
  }));
  const base = byVariant["pi-contained"].roundTripMs;
  const added = (variant) => { const row = byVariant[variant].roundTripMs; return { p50: round(row.p50 - base.p50), p95: round(row.p95 - base.p95),
    medianRatio: round((row.p50 - base.p50) / base.p50) }; };
  const record = { schemaVersion: "p1-47-overhead/1", label: "scripted; measures added latency only; never a result", environment: "local macOS arm64, colima Docker VM, not CI; host load not controlled",
    startedAt, finishedAt: new Date().toISOString(), loadAverage1m5m15m: { before: loadBefore, after: loadavg() }, sessions, callsPerSession: calls, variants: byVariant,
    addedRoundTripVsBaseMs: { "pi-contained-amc-tuned-allow": added("pi-contained-amc-tuned-allow"), "pi-contained-amc-tuned-deny": added("pi-contained-amc-tuned-deny") },
    decisionLatencyHostInProcessMs: await handlerLatency(operator, config, Math.max(1000, calls)),
    notes: ["Added round trip = the AMC variant's quantile minus the baseline's quantile, not a quantile of paired differences.",
      "The allow variant's AMC workspace carries P1-22's synthetic conformance fixture run so reads execute; it is a latency fixture, never a trust claim.",
      "The deny variant has no run: AMC marks the configuration untrusted and denies every call, as the pilot's AMC setups do on a fresh workspace."] };
  writeFileSync(join(out, "overhead.json"), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  rmSync(join(out, "work"), { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ addedRoundTripVsBaseMs: record.addedRoundTripVsBaseMs, decisionLatency: record.decisionLatencyHostInProcessMs })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1; });
}
