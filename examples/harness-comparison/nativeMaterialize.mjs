#!/usr/bin/env node
// Preparation only: reads installed artifacts and writes pins; never starts AMC or a corpus trial.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { VERSION, directory, dependencyRoot, filePin, jsonFile } from "./nativeCommon.mjs";

const usage = `Usage: node examples/harness-comparison/nativeMaterialize.mjs
  --amc-root /absolute/installed/node_modules/agent-maturity-compass
  --source-url https://your-reviewed-source-repository
  --source-commit FULL_40_HEX_COMMIT --out /absolute/new-corpus-directory
  [--package-artifact /absolute/exact-built-package.tgz] [--repetitions 3]

Materializes an AMC-only offline corpus. Does not execute commands, fetch source,
call a provider, install dependencies, or infer a source/build attestation.
The source commit must come from the build receipt for this installed artifact.
`;
if (process.argv.includes("--help")) { process.stdout.write(usage); process.exit(0); }
const names = new Set(["--amc-root", "--source-url", "--source-commit", "--out", "--package-artifact", "--repetitions"]);
const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index], value = process.argv[index + 1];
  if (!names.has(name) || !value || value.startsWith("--") || name in options) throw new Error(usage);
  options[name] = value;
}
for (const name of ["--amc-root", "--source-url", "--source-commit", "--out"]) if (!options[name]) throw new Error(usage);
if (!/^[a-f0-9]{40}$/.test(options["--source-commit"]) || /^0+$/.test(options["--source-commit"])) throw new Error("Supply the actual full source revision from the artifact build receipt");
const sourceUrl = new URL(options["--source-url"]);
if (sourceUrl.protocol !== "https:" || sourceUrl.username || sourceUrl.password || sourceUrl.search || sourceUrl.hash) throw new Error("Source URL must be an HTTPS repository URL without credentials, query or fragment");
if (!["linux", "darwin"].includes(process.platform) || !["x64", "arm64"].includes(process.arch)) throw new Error("This corpus uses POSIX process-group crash semantics; Windows qualification is unavailable");
const repetitions = Number(options["--repetitions"] ?? 3);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error("Repetitions must be an integer from 1 through 100");
const root = realpathSync(resolve(options["--amc-root"])), cli = realpathSync(join(root, "dist/cli.js"));
const pkg = jsonFile(join(root, "package.json"));
if (pkg.name !== "agent-maturity-compass") throw new Error("--amc-root must name the installed AMC package");
const out = resolve(options["--out"]);
if (existsSync(out)) throw new Error("Output must be a new directory; existing evidence is never overwritten");

const files = new Map(), packageRoots = new Set(), packages = [], missingOptionalDependencies = [], resolutions = [];
const addFile = path => { const pin = filePin(path); files.set(pin.path, pin); if (files.size > 50000) throw new Error("Installed dependency closure exceeds 50,000 pinned files"); };
const visitFiles = path => {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error("Runtime package members must not be mutable symlink aliases");
  if (stat.isFile()) { addFile(path); return; }
  if (!stat.isDirectory()) throw new Error("Installed runtime includes an unsupported special file");
  for (const name of readdirSync(path).sort()) if (name !== "node_modules" && name !== ".git") visitFiles(join(path, name));
};
const visitPackage = (packageRoot, primary = false) => {
  const canonical = realpathSync(packageRoot);
  if (packageRoots.has(canonical)) return;
  packageRoots.add(canonical);
  if (packageRoots.size > 2048) throw new Error("Installed dependency closure exceeds 2,048 packages");
  const metadata = jsonFile(join(canonical, "package.json"));
  packages.push({ name: metadata.name, version: metadata.version, path: canonical });
  if (primary) { addFile(join(canonical, "package.json")); visitFiles(join(canonical, "dist")); }
  else visitFiles(canonical);
  const required = new Set(Object.keys(metadata.dependencies ?? {}));
  const optional = new Set(Object.keys(metadata.optionalDependencies ?? {}));
  for (const name of new Set([...required, ...optional, ...Object.keys(metadata.peerDependencies ?? {})])) {
    const dependency = dependencyRoot(canonical, name);
    resolutions.push({ from: canonical, name, resolved: dependency });
    if (dependency) visitPackage(dependency);
    else if (required.has(name) && !optional.has(name)) throw new Error(`Installed required dependency is missing: ${name}`);
    else missingOptionalDependencies.push({ package: metadata.name, dependency: name, kind: optional.has(name) ? "optional" : "peer" });
  }
};
visitPackage(root, true);
for (const required of ["dist/exec/runProcess.js", "dist/session/eventPayload.js", "dist/vault/vault.js", "dist/sdk/nativeAgentClient.js"]) {
  if (!files.has(realpathSync(join(root, required)))) throw new Error(`Required installed native surface is not inventoried: ${required}`);
}
const cases = jsonFile(join(directory, "nativeCases.json"));
if (!Array.isArray(cases) || cases.length < 1 || cases.length > 100 || new Set(cases.map(item => item.id)).size !== cases.length) throw new Error("Invalid native corpus case definitions");
const node = filePin(process.execPath), artifact = filePin(cli);
const archive = options["--package-artifact"] ? filePin(resolve(options["--package-artifact"])) : null;
const inventory = { schemaVersion: VERSION, cli, installedVersion: pkg.version, files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
  packages: packages.sort((a, b) => a.name.localeCompare(b.name)), missingOptionalDependencies, resolutions,
  scope: "AMC dist and package metadata plus installed declared dependency/peer/optional closure; OS libraries, kernel and hardware are not content-pinned." };
if (Buffer.byteLength(JSON.stringify(inventory, null, 2)) > 32 * 1024 * 1024) throw new Error("Installed runtime inventory exceeds 32 MiB");
mkdirSync(out, { mode: 0o700 });
const write = (name, value) => { const path = join(out, name); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 }); return filePin(path); };
const helperNames = ["nativeAdapter.mjs", "nativeOracle.mjs", "nativeCommon.mjs", "nativeNoNetwork.mjs", "nativeSdkFixture.mjs"];
const helperPins = helperNames.map(name => write(name, readFileSync(join(directory, name), "utf8")));
const inventoryPin = write("nativeInstalledInventory.json", inventory);
const inputs = [...helperPins, inventoryPin, ...(archive ? [archive] : [])];
const command = index => ({ executable: node, inputs, args: ["--import", "{{input:3}}", `{{input:${index}}}`, "{{artifact}}", "{{workspace}}", "{{fixture}}", "{{input:5}}"] });
const tasks = cases.map(item => ({ id: item.id, laneId: "native-offline", scenario: item.scenario, description: item.description,
  fixture: write(`${item.id}.json`, item), oracle: command(1) }));
const materializedAt = new Date().toISOString();
const manifest = { schemaVersion: VERSION, id: "native-amc-conformance", description: "Actual installed AMC native runtime and public SDK, with local stub transport only. No model-quality, price, competitor or superiority inference.",
  environment: { platform: process.platform, arch: process.arch, nodeVersion: process.version,
    description: "Exact materialization host OS/architecture and Node version; dependency closure content-pinned. OS libraries, kernel, CPU model and memory pressure remain environmental limitations.", variables: {} },
  concurrency: 1, repetitions, captureBytesPerStream: 1048576,
  lanes: [{ id: "native-offline", kind: "keyless-conformance", provider: null, model: null,
    settings: { transport: "installed-amc-stub", modelQualityMeasured: false, corpusVersion: VERSION, SDK: "installed-public-export", stepSettings: "case-pinned", providerPricing: "unavailable" },
    permissions: { read: ["Pinned installed runtime/dependency files", "Pinned fixture and helper files", "Disposable trial workspace"], write: ["Disposable trial workspace only"], network: [],
      sandbox: "Trusted offline fixture; isolated HOME and Node socket/fetch denial preload. No OS confinement claim; native addons and host services are outside this boundary.", enforcement: "adapter-responsibility" },
    budgets: { timeoutMs: 240000, maxTokens: null, maxCostUsd: null }, requiredSecretEnv: [] }],
  tasks, targets: [{ id: "amc-native", label: `AMC ${pkg.version} native offline conformance`,
    source: { url: sourceUrl.href, commit: options["--source-commit"], retrievedAt: materializedAt,
      auditReference: "nativeMaterialization.json records local artifact collection time and operator-declared source provenance; no source/build attestation is inferred." },
    artifact, bindings: tasks.map(task => ({ taskId: task.id, command: command(0), unavailableReason: null, supportsBoundedLiveExecution: false })) }] };
const manifestPin = write("nativeManifest.json", manifest);
write("nativeMaterialization.json", { schemaVersion: VERSION, state: "materialized-not-executed", materializedAt,
  source: manifest.targets[0].source, installedVersion: pkg.version, artifact, packageArchive: archive, inventory: inventoryPin, manifest: manifestPin,
  commands: { materializeArgv: [process.execPath, ...process.argv.slice(1)], runArgv: [node.path, cli, "bench", "harness-compare", "--manifest", manifestPin.path, "--out", join(out, "new-results"), "--allow-adapter-execution"] },
  coverage: { caseIds: tasks.map(task => task.id), missingNativeScenarios: ["injection", "redaction", "tool-error-attribution", "unsupported-capability"],
    unavailableStudies: ["Live-provider/model performance: no real provider bound", "DSH/Pi comparisons: no comparator artifact or runtime bound", "Human usability or evidence-preparation advantage: no observed human cohort"] },
  qualification: "NOT RUN: materializer and corpus require the deferred implementation-batch checks and an installed-artifact execution before acceptance." });
process.stdout.write(JSON.stringify({ state: "materialized-not-executed", manifest: manifestPin.path, cases: tasks.length, repetitions,
  plannedTrials: tasks.length * repetitions, runtimeFiles: files.size, packageCount: packages.length, sourceBuildAttestation: "not-established" }, null, 2) + "\n");
