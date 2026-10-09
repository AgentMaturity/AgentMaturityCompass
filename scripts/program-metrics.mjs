import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import YAML from "yaml";

export const CANONICAL_METRIC_IDS = Object.freeze([
  "critical_gaps_open", "release_cadence", "claim_kind_surfaces", "contained_shell_oses",
  "executed_catalog_controls", "false_mandatory_passes", "expert_signed_controls", "benchmark_tasks_run",
  "developer_verified_action_15m", "reviewer_reconstruction_time", "design_partners", "independent_verifiers",
  "independent_assessors", "regulator_references", "a4_bound_approval_projects"
]);
const TARGET_COLUMNS = ["oct2026", "g0", "g1", "g2", "g3", "singleMaintainer"];
const SURFACES = ["cli", "reports", "mcp", "api", "studio"];
const GAP_IDS = Array.from({ length: 26 }, (_, index) => `G${index + 1}`);
const MAX_BYTES = 32 * 1024 * 1024;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;

function localPath(value) {
  return text(value) && !/[\\\0]/.test(value) && !isAbsolute(value) && !/^[A-Za-z]:/.test(value)
    && value === posix.normalize(value) && value.split("/").every(part => part && part !== "." && part !== "..");
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value.slice(0, 10);
}
function exactSet(values, expected) {
  return values.length === expected.length && new Set(values).size === values.length && expected.every(value => values.includes(value));
}
function closingEvidence(gap) {
  const evidence = gap.closingEvidence;
  return object(evidence) && exactSet(Object.keys(evidence), ["path", "mergedSha"])
    && localPath(evidence.path) && evidence.path.startsWith("qualification/")
    && typeof evidence.mergedSha === "string" && /^[a-f0-9]{40}$/.test(evidence.mergedSha)
    && text(gap.closedBy) && date(gap.closedAt);
}
function validateGaps(input, errors) {
  if (!object(input) || input.schemaVersion !== 1 || !text(input.source) || !Array.isArray(input.gaps)) {
    errors.push("gaps: expected schemaVersion 1, source, and gaps array"); return false;
  }
  let valid = exactSet(input.gaps.map(gap => gap?.id), GAP_IDS);
  if (!valid) errors.push("gaps: expected exactly G1–G26");
  for (const gap of input.gaps) {
    if (!object(gap) || !GAP_IDS.includes(gap.id) || !text(gap.title) || !text(gap.evidence) || !text(gap.fix)
      || !Array.isArray(gap.ownerKeys) || !gap.ownerKeys.length || gap.ownerKeys.some(key => !text(key))
      || !text(gap.severity) || !["critical", "high", "medium"].includes(gap.severity.toLowerCase()) || !["open", "closed"].includes(gap.status)) {
      errors.push(`gaps: invalid registration ${gap?.id ?? "unknown"}`); valid = false; continue;
    }
    const number = Number(gap.id.slice(1));
    const expected = number <= 7 ? "critical" : number <= 17 || number >= 21 && number <= 25 ? "high" : "medium";
    if (gap.severity.toLowerCase() !== expected) { errors.push(`gaps: incorrect severity for ${gap.id}`); valid = false; }
    if (gap.status === "closed" && !closingEvidence(gap)) errors.push(`gaps: ${gap.id} is closed without qualification path, full merged SHA, closer, and date`);
  }
  return valid;
}
function validateMetrics(input, errors) {
  if (!object(input) || input.schemaVersion !== 1 || !["funded", "singleMaintainer"].includes(input.targetColumn) || !Array.isArray(input.metrics)) {
    errors.push("metrics: expected schemaVersion 1, targetColumn, and metrics array"); return [];
  }
  if (!exactSet(input.metrics.map(metric => metric?.id), CANONICAL_METRIC_IDS)) errors.push("metrics: targets must cover the exact 15 canonical metric IDs");
  if (input.nextGate !== undefined && !["g0", "g1", "g2", "g3"].includes(input.nextGate)) errors.push("metrics: nextGate must be g0, g1, g2, or g3");
  for (const metric of input.metrics) {
    if (!object(metric) || !text(metric.label) || !text(metric.owner) || !["repo", "manual"].includes(metric.kind)
      || !object(metric.targets) || !exactSet(Object.keys(metric.targets), TARGET_COLUMNS)
      || TARGET_COLUMNS.some(key => !text(metric.targets[key])) || !(metric.source === null || object(metric.source))) {
      errors.push(`metrics: invalid registration ${metric?.id ?? "unknown"}`);
    }
  }
  return input.metrics.filter(object);
}
function manualEntries(input, errors) {
  const entries = new Map();
  if (!object(input) || !Array.isArray(input.entries)) { errors.push("manual: expected entries array"); return entries; }
  for (const entry of input.entries) {
    if (!object(entry) || !CANONICAL_METRIC_IDS.includes(entry.metric) || !text(entry.source) || !date(entry.asOf) || !text(entry.recordedBy)
      || !(typeof entry.value === "number" && Number.isFinite(entry.value) || text(entry.value))) {
      errors.push(`manual: invalid value or provenance for ${entry?.metric ?? "unknown"}`); continue;
    }
    if (entries.has(entry.metric)) errors.push(`manual: duplicate metric ${entry.metric}`);
    else entries.set(entry.metric, entry);
  }
  return entries;
}
function pending(metric, reason = "source pending") {
  return { value: null, current: `not measured (${reason}: ${metric.owner ?? "owner not registered"})`,
    status: "not_measured", source: null, asOf: null };
}
function measured(value, source, asOf = null, current = String(value)) {
  return { value, current, status: "measured", source, asOf };
}
function reportNameMatches(name, path) {
  const normalized = typeof name === "string" ? name.replaceAll("\\", "/") : "";
  return normalized === path || normalized.endsWith(`/${path}`);
}
function validReport(report) {
  return object(report) && Array.isArray(report.testResults) && report.testResults.every(result => object(result) && text(result.name)
    && ["passed", "failed", "pending", "skipped", "todo"].includes(result.status)
    && (result.assertionResults === undefined || Array.isArray(result.assertionResults)
      && Array.from(result.assertionResults).every(assertion => object(assertion) && typeof assertion.status === "string")));
}
function vitestValue(metric, report, errors) {
  const surfaces = metric.source.surfaces;
  if (!object(surfaces) || !exactSet(Object.keys(surfaces), SURFACES)
    || SURFACES.some(surface => !Array.isArray(surfaces[surface]) || surfaces[surface].some(path => !localPath(path))
      || new Set(surfaces[surface]).size !== surfaces[surface].length)) {
    errors.push(`${metric.id}: invalid registered surface files`); return pending(metric);
  }
  if (!report) return pending(metric);
  if (!validReport(report)) {
    errors.push(`${metric.id}: invalid supplied Vitest report`); return pending(metric);
  }
  let passed = 0, evaluated = 0;
  const surfaceStatuses = Object.create(null);
  for (const surface of SURFACES) {
    let allPassed = true, complete = surfaces[surface].length > 0;
    for (const path of surfaces[surface]) {
      const matches = report.testResults.filter(result => reportNameMatches(result.name, path));
      if (matches.length > 1) { errors.push(`${metric.id}: duplicate results for ${path}`); return pending(metric); }
      if (matches.length === 0) { complete = false; continue; }
      const file = matches[0], assertions = file.assertionResults;
      if (file.status === "failed" || assertions?.some(assertion => assertion.status === "failed")) { allPassed = false; continue; }
      if (file.status !== "passed" || !assertions?.length || assertions.some(assertion => assertion.status !== "passed")) complete = false;
    }
    surfaceStatuses[surface] = !allPassed ? "failed" : complete ? "passed" : "not_measured";
    if (!allPassed || complete) { evaluated += 1; if (allPassed) passed += 1; }
  }
  if (evaluated === 0) return { ...pending(metric), surfaceStatuses };
  const notMeasured = SURFACES.length - evaluated;
  const asOf = Number.isFinite(report.startTime) && report.startTime >= 0 && report.startTime <= 8.64e15 ? new Date(report.startTime).toISOString() : null;
  return { ...measured(passed, `supplied Vitest JSON; ${evaluated} evaluated surfaces, ${notMeasured} not measured; registered files: ${SURFACES.flatMap(surface => surfaces[surface]).join(", ")}; date: ${asOf ?? "not supplied"}`,
    asOf, `${passed} of ${SURFACES.length}${notMeasured ? `; ${notMeasured} surfaces not measured` : ""}`),
    status: notMeasured ? "partially_measured" : "measured", surfaceStatuses };
}
function scalar(value) { return ["string", "number", "boolean"].includes(typeof value) && (typeof value !== "number" || Number.isFinite(value)); }
function matrixCombinations(matrix) {
  if (!object(matrix) || own(matrix, "include") || own(matrix, "exclude")) return null;
  const axes = Object.keys(matrix);
  let original = axes.length ? [{}] : [];
  for (const axis of axes) {
    if (!Array.isArray(matrix[axis]) || !matrix[axis].length || matrix[axis].some(value => !scalar(value) || typeof value === "string" && value.includes("${{"))) return null;
    if (original.length * matrix[axis].length > 256) return null;
    original = original.flatMap(row => matrix[axis].map(value => ({ ...row, [axis]: value })));
  }
  return original;
}
function runnerLabels(runsOn, row) {
  if (Array.isArray(runsOn)) {
    if (!runsOn.length || runsOn.some(label => !text(label))) return null;
    const labels = runsOn.map(label => {
      const expression = /^\$\{\{\s*matrix\.([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}$/.exec(label);
      return expression ? row?.[expression[1]] : label;
    });
    if (labels.some(label => !text(label) || label.includes("${{"))) return null;
    const families = new Set(labels.map(label => runnerLabels(label, row)).filter(family => family !== null));
    return families.size === 1 ? [...families][0] : null;
  }
  if (!text(runsOn)) return null;
  const expression = /^\$\{\{\s*matrix\.([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}$/.exec(runsOn);
  const label = expression ? row?.[expression[1]] : runsOn;
  if (!text(label) || label.includes("${{")) return null;
  if (/^(ubuntu|linux)/i.test(label)) return "linux";
  if (/^macos/i.test(label)) return "macos";
  if (/^windows/i.test(label)) return "windows";
  return null;
}
function ciValue(metric, workflowYaml, workflowPaths, errors) {
  const source = metric.source;
  if (!localPath(source.workflow) || !text(source.job)) { errors.push(`${metric.id}: invalid CI registration`); return pending(metric); }
  const raw = typeof workflowYaml === "string" && workflowPaths.size === 1 ? workflowYaml
    : object(workflowYaml) && own(workflowYaml, source.workflow) ? workflowYaml[source.workflow] : undefined;
  if (raw === undefined || raw === null) return pending(metric);
  if (typeof raw !== "string") { errors.push(`${metric.id}: workflow source must be YAML text`); return pending(metric); }
  let workflow;
  try {
    const document = YAML.parseDocument(raw, { uniqueKeys: true });
    if (document.errors.length) throw new Error("invalid YAML");
    workflow = document.toJS({ maxAliasCount: 50 });
  } catch { errors.push(`${metric.id}: invalid workflow YAML`); return pending(metric); }
  const job = object(workflow?.jobs) && own(workflow.jobs, source.job) ? workflow.jobs[source.job] : undefined;
  if (!object(job) || job["runs-on"] === undefined) return pending(metric);
  const rows = job.strategy?.matrix === undefined ? [{}] : matrixCombinations(job.strategy.matrix);
  if (!rows || rows.length === 0) return pending(metric);
  const labels = rows.map(row => runnerLabels(job["runs-on"], row));
  if (labels.some(label => label === null)) return pending(metric);
  const count = new Set(labels).size;
  return measured(count, `${source.workflow}#jobs.${source.job}; configured OS families only, not containment qualification; date: not supplied`,
    null, `${count} configured OS families`);
}
function jsonPointer(value, pointer) {
  if (typeof pointer !== "string" || pointer !== "" && !pointer.startsWith("/") || /~(?![01])/.test(pointer)) throw new Error("invalid JSON pointer");
  if (pointer === "") return value;
  for (const part of pointer.slice(1).split("/")) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (value === null || typeof value !== "object" || !own(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

/** Compute supplied evidence only. Closure SHA declarations do not verify merged history or receipt signatures. */
export function computeMetrics({ gaps, metrics, manual, vitestReport, workflowYaml, jsonSources = {} } = {}) {
  const errors = [], registrations = validateMetrics(metrics, errors), gapsValid = validateGaps(gaps, errors);
  const entries = manualEntries(manual, errors);
  if (vitestReport !== undefined && vitestReport !== null && !validReport(vitestReport)) {
    errors.push("vitestReport: invalid supplied report"); vitestReport = undefined;
  }
  if (!object(jsonSources)) errors.push("jsonSources: expected registered-path map");
  const workflowPaths = new Set(registrations.filter(metric => metric.source?.type === "ci-matrix").map(metric => metric.source.workflow));
  const rows = registrations.map(metric => {
    let result = pending(metric);
    const source = metric.source;
    if (metric.kind === "manual") {
      const entry = entries.get(metric.id);
      if (entry) result = measured(entry.value, `${entry.source}; recorded by ${entry.recordedBy}; as of ${entry.asOf}`, entry.asOf);
    } else if (object(source)) {
      if (source.type === "gaps") {
        if (gapsValid) {
          const open = gaps.gaps.filter(gap => gap.severity.toLowerCase() === "critical"
            && !(gap.status === "closed" && closingEvidence(gap))).map(gap => gap.id);
          result = measured(open.length, `${gaps.source}; declared closures require qualification path and merged SHA; merge/signatures not verified`,
            null, `${open.length} open (${open.join(", ") || "none"})`);
        }
      } else if (source.type === "vitest") result = vitestValue(metric, vitestReport, errors);
      else if (source.type === "ci-matrix") result = ciValue(metric, workflowYaml, workflowPaths, errors);
      else if (source.type === "json") {
        if (!localPath(source.path)) errors.push(`${metric.id}: invalid registered JSON path`);
        else {
          try {
            // Validate the pointer even when its registered source has not arrived.
            jsonPointer(undefined, source.pointer);
            if (object(jsonSources) && own(jsonSources, source.path) && jsonSources[source.path] !== undefined) {
              const value = jsonPointer(jsonSources[source.path], source.pointer);
              if (value !== undefined && value !== null) {
                if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("JSON pointer must resolve to a finite number");
                result = measured(value, `${source.path}#${source.pointer}; registered supplied JSON; date: not supplied`);
              }
            }
          } catch (error) { errors.push(`${metric.id}: ${error.message}`); }
        }
      } else errors.push(`${metric.id}: unknown source type`);
    }
    return { id: metric.id, label: metric.label, owner: metric.owner, ...result, targets: metric.targets };
  });
  return { valid: errors.length === 0, errors, targetColumn: metrics?.targetColumn ?? "funded", nextGate: metrics?.nextGate ?? "g0", rows };
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("|", "\\|").replace(/[\r\n]+/g, "<br>");
}
function markdown(result) {
  const columns = ["Metric", "Current", "Source", `Next gate target (${result.nextGate})`];
  if (result.targetColumn === "singleMaintainer") columns.push("Single maintainer target");
  const lines = [`| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`];
  for (const row of result.rows) {
    const cells = [row.label, row.current, row.source ?? `source pending: ${row.owner}`, row.targets?.[result.nextGate]];
    if (result.targetColumn === "singleMaintainer") cells.push(row.targets?.singleMaintainer);
    lines.push(`| ${cells.map(escapeCell).join(" | ")} |`);
  }
  return lines.join("\n");
}
function repoFile(root, path, optional = false) {
  if (!localPath(path)) throw new Error(`invalid repository path: ${path}`);
  let physical;
  try { physical = realpathSync(resolve(root, path)); }
  catch (error) { if (optional && error.code === "ENOENT") return undefined; throw new Error(`missing or unreadable file: ${path}`); }
  const suffix = relative(root, physical);
  if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`)) throw new Error(`source escapes repository: ${path}`);
  const stat = statSync(physical);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error(`source is not a bounded file: ${path}`);
  const bytes = readFileSync(physical);
  if (bytes.length > MAX_BYTES) throw new Error(`source exceeds byte bound: ${path}`);
  return bytes.toString("utf8");
}
function parseJson(raw, path) {
  try { return JSON.parse(raw); } catch { throw new Error(`invalid JSON: ${path}`); }
}
function options(argv) {
  const opts = { mode: "markdown", online: false, vitest: undefined };
  let selected = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--markdown", "--json", "--check"].includes(arg)) {
      if (selected) throw new Error("select one output mode");
      selected = true; opts.mode = arg.slice(2);
    } else if (arg === "--online") opts.online = true;
    else if (arg === "--vitest-json") {
      const path = argv[++index];
      if (opts.vitest !== undefined || !localPath(path)) throw new Error("--vitest-json requires one repository-relative file");
      opts.vitest = path;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}
async function main(argv) {
  const opts = options(argv), root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  const loadingErrors = [], gitOptions = { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: MAX_BYTES, stdio: ["ignore", "pipe", "pipe"] };
  let gapsRaw;
  try { gapsRaw = execFileSync("git", ["show", "HEAD:docs/program/gaps.json"], gitOptions); }
  catch {
    loadingErrors.push("gaps: committed HEAD registration unavailable; working-tree fallback cannot verify closures");
    gapsRaw = repoFile(root, "docs/program/gaps.json");
  }
  const gaps = parseJson(gapsRaw, "docs/program/gaps.json");
  const metrics = parseJson(repoFile(root, "docs/program/metrics.json"), "docs/program/metrics.json");
  const manual = parseJson(repoFile(root, "docs/program/metrics-manual.json"), "docs/program/metrics-manual.json");
  const workflowYaml = Object.create(null), jsonSources = Object.create(null);
  let vitestReport;
  if (opts.vitest) {
    const raw = repoFile(root, opts.vitest, true);
    if (raw !== undefined) vitestReport = parseJson(raw, opts.vitest);
  }
  for (const metric of Array.isArray(metrics?.metrics) ? metrics.metrics : []) {
    const source = metric?.source;
    try {
      if (source?.type === "ci-matrix" && !own(workflowYaml, source.workflow)) workflowYaml[source.workflow] = repoFile(root, source.workflow, true);
      if (source?.type === "json" && !own(jsonSources, source.path)) {
        if (!localPath(source.path)) throw new Error(`invalid repository path: ${source.path}`);
        // Local committed bytes do not depend on an untracked or deleted working-tree copy.
        let committed;
        try { committed = execFileSync("git", ["show", `HEAD:${source.path}`], gitOptions); }
        catch { committed = undefined; }
        jsonSources[source.path] = committed === undefined ? undefined : parseJson(committed, source.path);
      }
      if (source?.type === "vitest" && object(source.surfaces) && vitestReport?.testResults) {
        for (const files of Object.values(source.surfaces)) {
          if (!Array.isArray(files)) continue;
          for (const path of files) if (repoFile(root, path, true) === undefined && Array.isArray(vitestReport.testResults)) {
            vitestReport.testResults = vitestReport.testResults.filter(result => !reportNameMatches(result?.name, path));
          }
        }
      }
    } catch (error) { loadingErrors.push(error.message); }
  }
  for (const gap of Array.isArray(gaps?.gaps) ? gaps.gaps : []) {
    if (gap?.status !== "closed" || !closingEvidence(gap)) continue;
    try {
      execFileSync("git", ["cat-file", "-e", `HEAD:${gap.closingEvidence.path}`], gitOptions);
      if (/^0{40}$/.test(gap.closingEvidence.mergedSha)) throw new Error("zero SHA cannot close a gap");
      execFileSync("git", ["merge-base", "--is-ancestor", gap.closingEvidence.mergedSha, "HEAD"], gitOptions);
    } catch { loadingErrors.push(`${gap.id}: closing evidence not committed at HEAD or mergedSha not an ancestor of HEAD (shallow history cannot verify)`); }
  }
  if (opts.online) {
    try {
      const times = parseJson(execFileSync("npm", ["view", "agent-maturity-compass", "time", "--json"],
        { cwd: root, encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }), "npm publication time response");
      if (!object(times)) throw new Error("invalid npm publication time response");
      const asOf = new Date().toISOString(), cutoff = Date.parse(asOf) - 30 * 24 * 60 * 60 * 1000;
      const releases = Object.entries(times).filter(([version]) => !["created", "modified"].includes(version));
      if (!releases.length || releases.some(([, stamp]) => !date(stamp))) throw new Error("npm publication timestamps unavailable");
      const value = releases.filter(([, stamp]) => Date.parse(stamp) >= cutoff && Date.parse(stamp) <= Date.parse(asOf)).length;
      if (Array.isArray(manual?.entries)) manual.entries = manual.entries.filter(entry => entry?.metric !== "release_cadence").concat({ metric: "release_cadence", value,
        asOf, source: "npm view agent-maturity-compass time --json; published releases in trailing 30 days", recordedBy: "explicit --online query" });
    } catch { loadingErrors.push("online npm release source unavailable; no cadence value inferred"); }
  }
  const result = computeMetrics({ gaps, metrics, manual, vitestReport, workflowYaml, jsonSources });
  result.errors.push(...loadingErrors); result.valid = result.errors.length === 0;
  for (const row of result.rows) {
    const registration = metrics.metrics.find(metric => metric.id === row.id);
    if (row.status === "measured" && registration?.source?.type === "gaps") row.source = `HEAD:docs/program/gaps.json; ${row.source}`;
    if (row.status === "measured" && registration?.source?.type === "json") row.source = row.source.replace("registered supplied JSON", "committed HEAD JSON");
    if (row.status !== "not_measured" && registration?.source?.type === "vitest") row.source = `${opts.vitest}; ${row.source}`;
  }
  if (!result.valid) { for (const error of result.errors) console.error(`program-metrics: ${error}`); process.exitCode = 1; return; }
  if (opts.mode === "check") console.log("Program metric registrations are structurally valid; measurement and qualification remain separate.");
  else if (opts.mode === "json") console.log(JSON.stringify(result, null, 2));
  else console.log(markdown(result));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(`program-metrics: ${error.message}`); process.exitCode = 1; });
}
