// Orchestrator for the adversarial unauthorized-effects suite.
//
//   node runSuite.mjs --seed <seed> --out <dir> [--configs a,b] [--concurrency N]
//
// It starts the observer in a SEPARATE OS process, generates the seeded
// variants, runs the full tasks x variants matrix across the requested configs
// with bounded parallelism, judges each trial with the oracle, and writes
// results.json plus meta.json (seed, wall time, versions, digests). Every
// attempt is recorded — failed and inconclusive included.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUITE_VERSION, RESULTS_SCHEMA_VERSION, canonicalJson, digestOf } from "./common.mjs";
import { generateVariants, loadCases } from "./generate.mjs";
import { judgeTrial } from "./oracle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(argv, name, fallback) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; }

async function startObserverProcess() {
  const child = spawn(process.execPath, [join(HERE, "observer.mjs")], { stdio: ["ignore", "pipe", "inherit"] });
  const origin = await new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl >= 0) { child.stdout.off("data", onData); try { resolve(JSON.parse(buf.slice(0, nl))); } catch (e) { reject(e); } }
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    setTimeout(() => reject(new Error("observer did not report its origin in time")), 10000);
  });
  return { child, ...origin };
}

async function buildEnv(observerOrigin) {
  const layout = await (await fetch(`${observerOrigin}/layout`)).json();
  const secretCanaries = {};
  for (const [name, info] of Object.entries(layout.secrets)) secretCanaries[name] = { file: info.file };
  return { sinkOrigin: observerOrigin, gatewayOrigin: observerOrigin, sentinels: layout.sentinels, markers: layout.markers, secretCanaries };
}

async function loadAdapter(config) {
  if (config === "amc-native") { const m = await import("./adapters/amcNative.mjs"); return { setup: () => m.setupAmcNative(), runTrial: m.runTrial }; }
  if (config === "uncontained-control") { const m = await import("./adapters/uncontainedControl.mjs"); return { setup: () => m.setupUncontainedControl(), runTrial: m.runTrial }; }
  if (config === "pi-amc" || config === "pi-baseline") { const m = await import("./adapters/pi.mjs"); return { setup: () => m.setupPi(config), runTrial: m.runTrial }; }
  throw new Error(`unknown config ${config}`);
}

function notRunResult(ctx, variant, reason) {
  return { trialId: `${ctx.config}:${variant.taskId}:v${variant.variantIndex}`, config: ctx.config, taskId: variant.taskId, attackClass: variant.attackClass, variantIndex: variant.variantIndex, verdict: "not-run", reason, observedEffects: [], stoppedLayer: "not-run", amcDecision: "not-run", payloadDelivered: false, positiveControl: false };
}

/** POST JSON to the separate observer process with retries. A transient socket
 * reset (undici keep-alive race) must not abort an 800-trial matrix. */
async function observerPost(origin, path, payload) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", connection: "close" }, body: JSON.stringify(payload) });
      return await res.json();
    } catch (error) { lastError = error; await new Promise((r) => setTimeout(r, 25 * (attempt + 1))); }
  }
  throw lastError;
}

async function runOne(observerOrigin, env, adapter, ctx, variant) {
  const trialId = `${ctx.config}:${variant.taskId}:v${variant.variantIndex}`;
  // One per-trial observer window; the adapter runs exactly once inside it.
  try {
    await observerPost(observerOrigin, "/control/begin", { trialId });
  } catch (error) {
    return { trialId, config: ctx.config, taskId: variant.taskId, attackClass: variant.attackClass, variantIndex: variant.variantIndex, verdict: "inconclusive", reason: `observer unavailable at begin: ${String(error).slice(0, 80)}`, observedEffects: [], stoppedLayer: "unknown", amcDecision: "error", payloadDelivered: false, positiveControl: false };
  }
  const adapterRecord = await adapter.runTrial(ctx, env, variant).catch((e) => ({ trialId, config: ctx.config, taskId: variant.taskId, attackClass: variant.attackClass, variantIndex: variant.variantIndex, amcDecision: "error", stoppedLayer: "unknown", effectorAttempted: false, detail: String(e).slice(0, 200) }));
  let observation;
  try { observation = await observerPost(observerOrigin, "/control/end", { trialId }); }
  catch (error) { observation = { positiveControl: false, healthy: false, payloadDelivered: false, effects: [] }; }
  const judgment = judgeTrial(variant, adapterRecord, observation);
  return {
    trialId, config: ctx.config, taskId: variant.taskId, attackClass: variant.attackClass, variantIndex: variant.variantIndex,
    verdict: judgment.verdict, reason: judgment.reason, observedEffects: judgment.observedEffects,
    stoppedLayer: judgment.stoppedLayer, amcDecision: adapterRecord.amcDecision, detail: adapterRecord.detail,
    payloadDelivered: observation.payloadDelivered, positiveControl: observation.positiveControl
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => { while (next < items.length) { const i = next++; results[i] = await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function main(argv) {
  const seed = arg(argv, "--seed", "amc-adversarial-2026-10-12");
  const out = arg(argv, "--out");
  const concurrency = Number(arg(argv, "--concurrency", "4"));
  // amc-native is not a default: its adapter is a draft with known defects (README).
  const configs = arg(argv, "--configs", "uncontained-control,pi-amc,pi-baseline").split(",").map((s) => s.trim()).filter(Boolean);
  if (!out) throw new Error("usage: runSuite.mjs --seed <seed> --out <dir> [--configs ...] [--concurrency N]");
  mkdirSync(out, { recursive: true });

  const cases = loadCases();
  const variants = generateVariants(cases, seed);
  const observer = await startObserverProcess();
  const env = await buildEnv(observer.origin);

  const startedAt = Date.now();
  const allResults = [];
  try {
    for (const config of configs) {
      const adapter = await loadAdapter(config);
      const ctx = await adapter.setup();
      try {
        if (ctx.available === false) {
          // A pluggable config with no installed dependency (e.g. no qualified
          // Pi): record every cell not-run, with the reason, without observer windows.
          const reason = "no qualified Pi install (set AMC_PI_CLI to a qualified `pi` binary; see docs/adapters/pi.md)";
          allResults.push(...variants.map((variant) => notRunResult(ctx, variant, reason)));
        } else {
          const configResults = await runPool(variants, concurrency, (variant) => runOne(observer.origin, env, adapter, ctx, variant));
          allResults.push(...configResults);
        }
      } finally { await ctx.close(); }
    }
  } finally {
    observer.child.kill("SIGTERM");
  }
  const wallMs = Date.now() - startedAt;

  const meta = {
    schemaVersion: RESULTS_SCHEMA_VERSION, suiteVersion: SUITE_VERSION, seed,
    startedAt: new Date(startedAt).toISOString(), wallMs, wallSeconds: Math.round(wallMs / 100) / 10,
    concurrency, configs, taskCount: cases.cases.length, variantsPerTask: 25, totalVariants: variants.length,
    trialsRun: allResults.length, casesDigest: digestOf(cases), variantsDigest: digestOf(variants),
    observerRoot: observer.root, node: process.version, platform: `${process.platform}-${process.arch}`
  };
  writeFileSync(join(out, "results.json"), `${canonicalJson({ meta, results: allResults })}\n`);
  writeFileSync(join(out, "meta.json"), `${canonicalJson(meta)}\n`);
  const byVerdict = allResults.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] ?? 0) + 1; return acc; }, {});
  process.stdout.write(`${JSON.stringify({ out, trials: allResults.length, byVerdict, wallSeconds: meta.wallSeconds })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
