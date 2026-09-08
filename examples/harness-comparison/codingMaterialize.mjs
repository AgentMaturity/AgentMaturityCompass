#!/usr/bin/env node
// Preparation only. It pins real installed CLI closures and neutral tasks; it
// neither installs a harness nor launches an inference server or comparison.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dependencyRoot, filePin } from "./nativeCommon.mjs";
import { VERSION, loopbackOrigin, readJson } from "./codingCommon.mjs";

const usage = "Usage: node examples/harness-comparison/codingMaterialize.mjs --config /absolute/reviewed-coding-config.json --out /absolute/new-directory\nSee codingREADME.md for the explicit installed-artifact and model identity contract.\n";
if (process.argv.includes("--help")) { process.stdout.write(usage); process.exit(0); }
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--config" || args[2] !== "--out") throw new Error(usage);
const configPath = realpathSync(resolve(args[1])), config = readJson(configPath), out = resolve(args[3]);
const exactKeys = (value, allowed) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error("Configuration contains an unsupported field; credentials and arbitrary environment values must not be copied into comparison inputs");
};
exactKeys(config, ["baseURL", "model", "modelIdentity", "repetitions", "timeoutMs", "maxTokens", "maxOutputTokens", "maxRequests", "contextWindow", "temperature", "targets"]);
exactKeys(config.modelIdentity, ["runtimeSha256", "weightsSha256", "auditReference"]);
if (existsSync(out)) throw new Error("Output directory must be new; retained evidence is never overwritten");
if (!["darwin", "linux"].includes(process.platform)) throw new Error("This coding corpus currently supports POSIX process-group cleanup only");
if (!Array.isArray(config.targets) || config.targets.length !== 3 || new Set(config.targets.map(target => target.id)).size !== 3 || config.targets.some(target => !["amc", "dsh", "pi"].includes(target.id))) throw new Error("Bind exactly one actual installed AMC, DSH and Pi target");
const number = (name, min, max) => {
  const value = config[name]; if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`); return value;
};
const repetitions = number("repetitions", 1, 100), timeoutMs = number("timeoutMs", 10000, 3600000);
const maxTokens = number("maxTokens", 1, 100000000), maxOutputTokens = number("maxOutputTokens", 1, maxTokens);
const maxRequests = number("maxRequests", 1, 100), contextWindow = number("contextWindow", 1024, 1000000);
if (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) throw new Error("Specify a common temperature from zero through two");
if (typeof config.model !== "string" || !config.model.trim() || config.model.length > 256) throw new Error("Specify the actual local model identifier");
const baseURL = loopbackOrigin(config.baseURL), hash = /^[a-f0-9]{64}$/;
if (!config.modelIdentity || !hash.test(config.modelIdentity.runtimeSha256) || !Array.isArray(config.modelIdentity.weightsSha256) || !config.modelIdentity.weightsSha256.length || config.modelIdentity.weightsSha256.some(value => !hash.test(value)) || typeof config.modelIdentity.auditReference !== "string" || !config.modelIdentity.auditReference.trim()) throw new Error("Declare reviewed runtime/weights hashes and their preparation receipt; serving identity is not inferred from an endpoint");
const node = filePin(process.execPath), directory = dirname(fileURLToPath(import.meta.url));
const packages = { amc: "agent-maturity-compass", dsh: "@deepseek-ai/dsh", pi: "@earendil-works/pi-coding-agent" };
const inventories = config.targets.map(target => {
  exactKeys(target, ["id", "root", "cli", "source"]);
  exactKeys(target.source, ["url", "commit", "auditReference"]);
  const root = realpathSync(resolve(target.root)), metadata = readJson(join(root, "package.json"));
  if (metadata.name !== packages[target.id]) throw new Error(`Unexpected installed package for ${target.id}`);
  const cli = realpathSync(resolve(root, target.cli));
  if (relative(root, cli).startsWith("..") || !lstatSync(cli).isFile()) throw new Error("CLI must be a regular member of its installed package");
  if (!/^[a-f0-9]{40}$/.test(target.source?.commit) || /^0+$/.test(target.source.commit)) throw new Error("Each target requires its actual source revision");
  const url = new URL(target.source.url);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Source URL must be a credential-free HTTPS repository URL");
  if (typeof target.source.auditReference !== "string" || !target.source.auditReference.trim()) throw new Error("Each target requires an artifact build receipt reference");
  const files = new Map(), visited = new Set(), resolutions = [], missingOptional = [];
  const walk = path => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("Package members must not be mutable symlink aliases");
    if (stat.isFile()) { const pin = filePin(path); files.set(pin.path, pin); if (files.size > 50000) throw new Error("Installed closure exceeds 50,000 files"); return; }
    if (!stat.isDirectory()) throw new Error("Installed package contains an unsupported special file");
    for (const name of readdirSync(path).sort()) if (!["node_modules", ".git"].includes(name)) walk(join(path, name));
  };
  const visit = packageRoot => {
    const canonical = realpathSync(packageRoot); if (visited.has(canonical)) return; visited.add(canonical);
    if (visited.size > 2048) throw new Error("Installed closure exceeds 2,048 packages");
    const pkg = readJson(join(canonical, "package.json")); walk(canonical);
    const required = new Set(Object.keys(pkg.dependencies ?? {})), optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
    for (const name of new Set([...required, ...optional, ...Object.keys(pkg.peerDependencies ?? {})])) {
      const resolved = dependencyRoot(canonical, name); resolutions.push({ from: canonical, name, resolved });
      if (resolved) visit(resolved);
      else if (required.has(name) && !optional.has(name)) throw new Error(`Missing installed dependency ${name}`);
      else missingOptional.push({ from: pkg.name, name });
    }
  };
  visit(root);
  return { target, inventory: { schemaVersion: VERSION, targetId: target.id, root, cli, version: metadata.version,
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), resolutions, missingOptional,
    scope: "Installed package and declared transitive dependency/optional/peer closure; OS libraries and actual model-serving identity are not attested." } };
});
const cases = readJson(join(directory, "codingCases.json"));
if (!Array.isArray(cases) || cases.length !== 3 || new Set(cases.map(task => task.id)).size !== 3) throw new Error("Expected the three neutral coding tasks");
mkdirSync(out, { mode: 0o700 });
const write = (name, value) => {
  const path = join(out, name); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" }); return filePin(path);
};
const helpers = ["codingAdapter.mjs", "codingOracle.mjs", "codingCommon.mjs", "codingGateway.mjs", "nativeCommon.mjs"];
const helperPins = helpers.map(name => write(name, readFileSync(join(directory, name), "utf8")));
const configPin = write("reviewed-config.json", config);
const oracle = { executable: node, inputs: [helperPins[1]], args: ["{{input:0}}", "{{workspace}}", "{{fixture}}"] };
const tasks = cases.map(task => ({ id: task.id, laneId: "local-coding", scenario: "success", description: task.description, fixture: write(`${task.id}.json`, task), oracle }));
const targets = inventories.map(({ target, inventory }) => {
  const inventoryPin = write(`${target.id}-installed-inventory.json`, inventory);
  const inputs = [...helperPins, inventoryPin, configPin];
  return { id: target.id, label: `${packages[target.id]} ${inventory.version}`, source: { ...target.source, retrievedAt: new Date().toISOString() },
    artifact: filePin(inventory.cli), bindings: tasks.map(task => ({ taskId: task.id, unavailableReason: null, supportsBoundedLiveExecution: true,
      command: { executable: node, inputs, args: ["{{input:0}}", "{{artifact}}", "{{workspace}}", "{{fixture}}", "{{context}}", "{{input:5}}"] } })) };
});
const manifest = { schemaVersion: VERSION, id: "native-three-harness-local-coding", description: "Matched three-task coding study using actual standalone AMC, DSH and Pi CLIs and an independent file-output oracle. No superiority, broad benchmark or serving-identity attestation is inferred.",
  environment: { platform: process.platform, arch: process.arch, nodeVersion: process.version, description: "Same materialization host and Node executable. Per-trial private HOME. Installed closures pinned. OS libraries, model serving and hardware state require separate receipts.", variables: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` } },
  concurrency: 1, repetitions, captureBytesPerStream: 1048576,
  lanes: [{ id: "local-coding", kind: "local-provider", provider: "local-openai-compatible", model: config.model,
    settings: { baseURL, modelKind: "local-inference", modelIdentity: { runtimeSha256: config.modelIdentity.runtimeSha256, weightsSha256: config.modelIdentity.weightsSha256 }, modelAuditReference: config.modelIdentity.auditReference, temperature: config.temperature, maxOutputTokens, maxRequests, contextWindow,
      streamPolicy: "bounded buffered forwarding with usage requested", resourceLimits: "serial requests; deadline and output/request caps; observed total tokens checked after each response", tools: "workspace read/write/edit/search; per-target actual tool schemas retained by request hashes",
      endpointIdentity: "operator-declared; successful HTTP alone does not attest local weights or distinguish a scripted backend" },
    permissions: { read: ["Pinned runtime, fixture and helpers", "Disposable trial repository"], write: ["Disposable trial repository and private harness state"], network: [baseURL], sandbox: "Trusted coding fixtures and adapter-owned loopback forwarder; no OS confinement claim. Model-generated code is evaluated in a bounded import-free VM child. Other direct harness traffic is not machine-wide blocked.", enforcement: "adapter-responsibility" },
    budgets: { timeoutMs, maxTokens, maxCostUsd: null }, requiredSecretEnv: [] }], tasks, targets };
const manifestPin = write("codingManifest.json", manifest);
write("codingMaterialization.json", { schemaVersion: VERSION, state: "materialized-not-executed", manifest: manifestPin, config: configPin,
  trials: tasks.length * targets.length * repetitions, qualification: "Not run. These three pure-JavaScript repair tasks are not a representative coding benchmark or evidence of superiority. Runtime/weights hashes are operator declarations until separately tied to the serving process.",
  runArgv: [node.path, inventories.find(row => row.target.id === "amc").inventory.cli, "bench", "harness-compare", "--manifest", manifestPin.path, "--out", join(out, "new-results"), "--allow-adapter-execution"] });
process.stdout.write(JSON.stringify({ state: "materialized-not-executed", manifest: manifestPin.path, targets: targets.length, tasks: tasks.length, plannedTrials: tasks.length * targets.length * repetitions }) + "\n");
