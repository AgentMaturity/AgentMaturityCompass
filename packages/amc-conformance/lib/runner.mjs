/**
 * Runs one conformance class against any implementation, started as a subprocess from a command template, and returns
 * a conformance-results v1 record (spec/schemas/v1/conformance-results.schema.json). Node built-ins only.
 *
 * The template is split on whitespace and run without a shell; each `{name}` is replaced after the split, so a path
 * with spaces stays one argument. A token that is exactly `{verifierArgs}` expands to several arguments.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { release, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { CLASS_RULES } from "./classes.mjs";

/** MAJOR and MINOR follow the spec's; a new normative case needs a new MINOR, a correction a PATCH. */
export const SUITE_VERSION = "1.0.0";
export const SPEC_VERSION = "1.0";
export const CLASSES = Object.keys(CLASS_RULES);
export const DEFAULT_TIMEOUT_MS = 30_000;

export class UsageError extends Error {}

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

/** Every file under `path` (or `path` itself), sorted. */
function filesUnder(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).sort().flatMap(name => filesUnder(join(path, name)));
}

/**
 * sha256 over `<sha256 of file>  <path from root>\n` for the manifest and every input file its cases read, sorted by
 * path: two runs name the same digest only when they judged the same bytes.
 */
function fixtureSetDigest(root, paths) {
  const lines = [...new Set(paths.flatMap(filesUnder))]
    .map(file => ({ file: relative(root, file).split(sep).join("/"), digest: sha256(readFileSync(file)) }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map(({ file, digest }) => `${digest}  ${file}\n`);
  return sha256(lines.join(""));
}

export function loadManifest(root, cls) {
  if (!CLASSES.includes(cls)) throw new UsageError(`--class must be one of ${CLASSES.join(", ")}`);
  const path = join(root, "spec/conformance/v1", `${cls}.json`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new UsageError(`cannot read ${path} (set --root to a checkout of the spec): ${cause.message}`);
  }
  if (manifest.suite !== SUITE_VERSION || manifest.class !== cls || !Array.isArray(manifest.cases)) {
    throw new UsageError(`${path} is not a suite ${SUITE_VERSION} manifest for class ${cls}`);
  }
  const ids = manifest.cases.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new UsageError(`${path} repeats a case id`);
  return { path, manifest };
}

/** argv for one case: placeholders are replaced per token; an unknown one is a usage error, never left in place. */
export function expandTemplate(template, values) {
  const tokens = template.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new UsageError("--impl is empty");
  return tokens.flatMap(token => {
    if (token === "{verifierArgs}" && Array.isArray(values.verifierArgs)) return values.verifierArgs;
    return [token.replace(/\{([A-Za-z]+)\}/g, (_, name) => {
      const value = values[name];
      if (typeof value !== "string") throw new UsageError(`--impl uses {${name}}, which this class does not provide`);
      return value;
    })];
  });
}

/** `*` matches any run of characters; everything else is literal. */
const globMatcher = glob => new RegExp(`^${glob.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

function invoke(argv, timeoutMs) {
  const started = process.hrtime.bigint();
  const run = spawnSync(argv[0], argv.slice(1), {
    encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"]
  });
  return { ...run, stdout: run.stdout ?? "", stderr: run.stderr ?? "", durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n) };
}

function runCase(cls, item, options, schemas) {
  const rules = CLASS_RULES[cls];
  const at = path => resolve(options.root, path);
  const outDir = mkdtempSync(join(tmpdir(), "amc-conformance-"));
  try {
    const argv = expandTemplate(options.impl, rules.placeholders(item, at, outDir));
    const run = invoke(argv, options.timeoutMs);
    const base = { id: item.id, normative: item.normative === true, durationMs: run.durationMs };
    if (run.error?.code === "ETIMEDOUT") return { ...base, outcome: "error", diff: { error: `timed out after ${options.timeoutMs} ms` } };
    if (run.error) return { ...base, outcome: "error", diff: { error: run.error.message } };
    if (run.signal) return { ...base, outcome: "error", diff: { error: `killed by ${run.signal}` } };
    const { outcome, diff } = rules.judge(item, at, run, schemas, outDir);
    return { ...base, outcome, diff };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

/**
 * Conformant only when the class has normative cases and every one of them passed: a skipped, failed or errored
 * normative case, or a run filtered by --cases, is never conformant.
 */
export function summarize(cases) {
  const normative = cases.filter(item => item.normative);
  const normativePassed = normative.filter(item => item.outcome === "pass").length;
  return { summary: { normativePassed, normativeTotal: normative.length }, conformant: normative.length > 0 && normativePassed === normative.length };
}

/**
 * @param {{ root: string; cls: string; impl: string; cases?: string; timeoutMs?: number;
 *   implementation: { name: string; version: string; vendor: string | null; repository: string | null; language: string | null } }} options
 */
export function runSuite(options) {
  const root = resolve(options.root);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new UsageError("--timeout must be a positive number of milliseconds");
  const { path, manifest } = loadManifest(root, options.cls);
  const rules = CLASS_RULES[options.cls];
  const at = path => resolve(root, path);
  const schemaCache = new Map();
  const schemas = name => {
    if (!schemaCache.has(name)) schemaCache.set(name, JSON.parse(readFileSync(join(root, "spec/schemas/v1", `${name}.schema.json`), "utf8")));
    return schemaCache.get(name);
  };
  const selected = options.cases ? globMatcher(options.cases) : null;
  // The template is checked once up front, so a bad --impl is a usage error rather than every case erroring.
  const first = manifest.cases.find(item => !item.pending);
  if (first) expandTemplate(options.impl, rules.placeholders(first, at, tmpdir()));
  const cases = manifest.cases.map(item => {
    const normative = item.normative === true;
    if (item.pending) return { id: item.id, normative, outcome: "skipped", durationMs: 0, diff: { skipped: item.pending } };
    if (selected && !selected.test(item.id)) return { id: item.id, normative, outcome: "skipped", durationMs: 0, diff: { skipped: "not selected by --cases" } };
    return runCase(options.cls, item, { root, impl: options.impl, timeoutMs }, schemas);
  });
  const inputs = manifest.cases.filter(item => !item.pending).flatMap(item => rules.inputs(item, at));
  return {
    suiteVersion: SUITE_VERSION,
    specVersion: SPEC_VERSION,
    class: options.cls,
    fixtureSetDigest: fixtureSetDigest(root, [path, ...inputs]),
    implementation: options.implementation,
    environment: { os: `${process.platform} ${release()}`, runtime: `node ${process.version}` },
    runAt: new Date().toISOString(),
    cases,
    ...summarize(cases)
  };
}
