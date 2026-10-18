#!/usr/bin/env node
// One command per pilot lane:
//   node examples/harness-comparison/pilot/run.mjs --lane scripted|live|local --config <operator.json> --out <new directory> [--repetitions N] [--no-run]
// It writes pinned fixtures, the adapter configuration and the comparison manifest under <out>/inputs, runs
// `amc bench harness-compare` into <out>/run (TMPDIR under the container runtime's mountable root) and analyzes the
// report into <out>/analysis. A live lane needs Sid's credential in the variable the config names, and runs with --live.
// --tasks a,b and --targets x,y narrow a debugging run; a pilot run uses neither.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirSha256, fileSha256 } from "./pins.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), VERSION = "2026-09-08";
const TARGETS = ["amc-native", "pi-contained", "pi-contained-amc", "pi-contained-tuned", "pi-contained-amc-tuned"];
const LAYOUT = "Task files are under ./workspace/ relative to your working directory; every path below is relative to ./workspace/.";
const SCENARIOS = { "reg-embedded-instruction": "injection", "fin-reconcile-readonly": "injection", "reg-missing-consent": "refusal", "reg-consent-revoked": "refusal",
  "fin-cross-tenant": "refusal", "fin-receipt-lost": "crash-recovery", "fin-error-before-commit": "tool-error-attribution" };
const ADAPTER_MODULES = ["adapter.mjs", "amcSetup.mjs", "container.mjs", "container/entry.mjs", "gateway.mjs", "pins.mjs", "scripted.mjs", "solutions.mjs", "../codingCommon.mjs"];
const ORACLE_MODULES = ["oracle.mjs", "oracles/common.mjs", "oracles/coding.mjs", "oracles/codingProbe.mjs", "oracles/regulated.mjs", "oracles/finops.mjs"];
const pin = (path) => ({ path, sha256: fileSha256(path) });
const option = (argv, name, fallback = null) => { const at = argv.indexOf(name); return at < 0 ? fallback : argv[at + 1]; };

/** The 20 fixtures: 17 committed pilot tasks and the 3 existing coding tasks with the pilot's layout note. */
function writeFixtures(dir) {
  mkdirSync(dir);
  const existing = JSON.parse(readFileSync(join(HERE, "..", "codingCases.json"), "utf8"))
    .map((row) => ({ ...row, domain: "coding", prompt: `${LAYOUT} ${row.prompt}`, legacyOracle: true }));
  const pilot = readdirSync(join(HERE, "tasks")).sort().map((name) => JSON.parse(readFileSync(join(HERE, "tasks", name), "utf8")));
  return [...existing, ...pilot].map((fixture) => {
    const path = join(dir, `${fixture.id}.json`);
    writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, { flag: "wx" });
    return { fixture, pin: pin(path) };
  });
}

function lane(kind, operator) {
  const limits = operator.budgets;
  const base = { permissions: { read: ["trial workspace"], write: ["trial workspace/workspace"], network: [], sandbox: "Pi targets: Docker container (see PLAN.md); amc-native: P1-05 OS shell confinement on the host",
    enforcement: "adapter-responsibility" }, requiredSecretEnv: [] };
  const settings = { maxRequests: limits.maxRequests, maxOutputTokens: limits.maxOutputTokens, contextWindow: limits.contextWindow };
  if (kind === "scripted") return { ...base, id: "scripted", kind: "keyless-conformance", provider: null, model: null, settings: { ...settings, scripted: true },
    budgets: { timeoutMs: limits.timeoutMs, maxTokens: null, maxCostUsd: null } };
  if (kind === "live") {
    const live = operator.live, origin = new URL(live.chatUrl).origin;
    return { ...base, id: "live", kind: "live-provider", provider: live.provider, model: live.model, settings: { ...settings, temperature: limits.temperature },
      permissions: { ...base.permissions, network: [origin] }, budgets: { timeoutMs: limits.timeoutMs, maxTokens: live.maxTokens, maxCostUsd: live.maxCostUsd },
      requiredSecretEnv: [live.apiKeyEnv] };
  }
  const local = operator.local;
  return { ...base, id: "local", kind: "local-provider", provider: local.provider, model: local.model,
    settings: { ...settings, temperature: limits.temperature, baseURL: local.baseURL, modelKind: "local-inference", modelIdentity: local.modelIdentity },
    permissions: { ...base.permissions, network: [local.baseURL] }, budgets: { timeoutMs: limits.timeoutMs, maxTokens: local.maxTokens, maxCostUsd: null } };
}

export function materialize({ laneKind, operator, inputs, repetitions, taskIds = null, targetIds = null }) {
  mkdirSync(inputs, { recursive: true });
  const node = realpathSync(process.execPath), piPackage = join(operator.pi.prefix, "node_modules", "@earendil-works", "pi-coding-agent");
  const amcRoot = realpathSync(operator.amc.root), finance = join(amcRoot, "examples", "lighthouse-finance", "service");
  const faultsDir = join(amcRoot, "spec", "fixtures", "v1", "lighthouse-finance", "faults"), seed = join(amcRoot, "spec", "fixtures", "v1", "lighthouse-finance", "seed.json");
  const faults = ["drop_response_after_commit.json", "error_before_commit.json"];
  const pins = [
    { role: "pi-package", kind: "file", path: join(piPackage, "package.json") }, { role: "pi-bundle", kind: "dir", path: join(piPackage, "dist", "bundle") },
    { role: "amc-cli", kind: "file", path: join(amcRoot, "dist", "cli.js") }, { role: "amc-pi-extension", kind: "file", path: join(amcRoot, "dist", "adapters", "pi", "amcPiExtension.js") },
    { role: "finance-service", kind: "dir", path: finance }, { role: "finance-seed", kind: "file", path: seed },
    ...faults.map((name) => ({ role: "finance-fault-plan", kind: "file", path: join(faultsDir, name) }))
  ].map((row) => ({ ...row, sha256: row.kind === "dir" ? dirSha256(row.path) : fileSha256(row.path) }));
  const configPath = join(inputs, "pilot-config.json");
  writeFileSync(configPath, `${JSON.stringify({ schemaVersion: "p1-47-pilot-config/1", pins,
    pi: { prefix: realpathSync(operator.pi.prefix), cli: join(realpathSync(piPackage), "dist", "bundle", "cli.js"), version: JSON.parse(readFileSync(join(piPackage, "package.json"), "utf8")).version },
    amc: { root: amcRoot, cli: join(amcRoot, "dist", "cli.js") }, docker: operator.docker,
    finance: { server: join(finance, "server.mjs"), seed, faultsDir, faults }, live: operator.live ?? null }, null, 2)}\n`, { flag: "wx" });
  const fixtures = writeFixtures(join(inputs, "fixtures")).filter(({ fixture }) => !taskIds || taskIds.includes(fixture.id));
  const adapterInputs = [pin(configPath), ...ADAPTER_MODULES.map((name) => pin(join(HERE, name)))];
  const pilotOracle = ORACLE_MODULES.map((name) => pin(join(HERE, name))), legacyOracle = [pin(join(HERE, "..", "codingOracle.mjs"))];
  const laneRow = lane(laneKind, operator), commit = spawnSync("git", ["-C", amcRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const manifest = {
    schemaVersion: VERSION, id: `p1-47-pilot-${laneKind}`, description: `P1-47 benchmark pilot, ${laneKind} lane${laneKind === "scripted" ? ": scripted endpoint, debugging only, never a result" : ""}.`,
    environment: { platform: process.platform, arch: process.arch, nodeVersion: process.version, description: "Exactly this runtime, local macOS arm64 with a colima Docker VM, not CI.", variables: {} },
    concurrency: 1, repetitions, captureBytesPerStream: 1_048_576, lanes: [laneRow],
    tasks: fixtures.map(({ fixture, pin: fixturePin }) => ({ id: fixture.id, laneId: laneRow.id, scenario: SCENARIOS[fixture.id] ?? "success", description: fixture.description,
      fixture: fixturePin, oracle: fixture.legacyOracle ? { executable: pin(node), inputs: legacyOracle, args: ["{{input:0}}", "{{workspace}}/workspace", "{{fixture}}"] }
        : { executable: pin(node), inputs: pilotOracle, args: ["{{input:0}}", "{{workspace}}", "{{fixture}}"] } })),
    targets: TARGETS.filter((id) => !targetIds || targetIds.includes(id)).map((id) => ({ id, label: id,
      source: id === "amc-native" ? { url: "https://github.com/AgentMaturity/AgentMaturityCompass", commit, retrievedAt: new Date().toISOString(), auditReference: `Local build of ${commit}; dist/cli.js pinned.` }
        : { url: "https://github.com/earendil-works/pi", commit: operator.pi.sourceCommit, retrievedAt: operator.pi.retrievedAt, auditReference: operator.pi.auditReference },
      artifact: id === "amc-native" ? pin(join(amcRoot, "dist", "cli.js")) : pin(join(piPackage, "package.json")),
      bindings: fixtures.map(({ fixture }) => ({ taskId: fixture.id, command: { executable: pin(node), inputs: adapterInputs,
        args: ["{{input:1}}", "{{input:0}}", id, "{{workspace}}", "{{fixture}}", "{{context}}"] }, unavailableReason: null, supportsBoundedLiveExecution: true })) }))
  };
  writeFileSync(join(inputs, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { manifestPath: join(inputs, "manifest.json"), amcRoot };
}

function main(argv) {
  const laneKind = option(argv, "--lane"), out = option(argv, "--out"), configPath = option(argv, "--config");
  if (!["scripted", "live", "local"].includes(laneKind) || !out || !configPath) throw new Error("usage: run.mjs --lane scripted|live|local --config <operator.json> --out <new directory> [--repetitions N] [--no-run]");
  const operator = JSON.parse(readFileSync(configPath, "utf8")), root = resolve(out);
  // With a credential present, refuse to spend on placeholders or without Sid's dated published rate (cost would stay unknown).
  const live = operator.live;
  if (laneKind === "live" && process.env[live?.apiKeyEnv ?? ""] && (/REPLACE|\.invalid\b/.test(JSON.stringify(live)) || !(live.pricing?.inputPerMillionUsd > 0 && live.pricing?.outputPerMillionUsd > 0
    && /^https:/.test(live.pricing.sourceUrl ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(live.pricing.asOf ?? "")))) throw new Error("The live lane needs a real endpoint, model and a dated published rate before any spend.");
  mkdirSync(dirname(root), { recursive: true }); mkdirSync(root);
  const list = (name) => option(argv, name)?.split(",") ?? null;
  const { manifestPath, amcRoot } = materialize({ laneKind, operator, inputs: join(root, "inputs"), repetitions: Number(option(argv, "--repetitions", "3")),
    taskIds: list("--tasks"), targetIds: list("--targets") });
  if (argv.includes("--no-run")) return;
  mkdirSync(join(root, "work"));
  const run = spawnSync(process.execPath, [join(amcRoot, "dist", "cli.js"), "bench", "harness-compare", "--manifest", manifestPath, "--out", join(root, "run"),
    "--allow-adapter-execution", ...(laneKind === "live" ? ["--live"] : [])], { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, TMPDIR: join(root, "work") } });
  process.stderr.write(`harness-compare exited ${run.status} (non-zero whenever any trial is not an executed pass)\n`);
  const analysis = spawnSync(process.execPath, [join(HERE, "analyze.mjs"), "--reports", join(root, "run"), "--out", join(root, "analysis")], { stdio: "inherit" });
  if (analysis.status !== 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
