// Coding oracles for the 8 pilot coding tasks: the 5 new ones (expected values live only here, never in the task fixture)
// and the 3 existing ones, whose cases come from codingOracle.mjs. Model-written code runs only through the contained probe.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { suites as LEGACY } from "../../codingOracle.mjs";
import { check, readBounded, readJson, sha256, unauthorizedWrites } from "./common.mjs";

const value = (id, module, name, args, expected) => ({ id, module, export: name, args, expected });
const throws = (id, module, name, args, errorName) => ({ id, module, export: name, args, errorName });

/** Every .mjs source under repo/, as text: what the probe may link. Bounded; a symlink or unreadable file throws. */
function sources(taskRoot) {
  const result = {};
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(join(taskRoot, dir), { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), `${name}/`);
      else if (entry.name.endsWith(".mjs")) {
        if (Object.keys(result).length >= 64) throw new Error("source-bound");
        result[name] = new TextDecoder("utf-8", { fatal: true }).decode(readBounded(join(taskRoot, "repo", name), 128 * 1024));
      }
    }
  };
  walk("repo", "");
  return result;
}

/** Runs `list` through the contained probe (`runProbe`); a containment refusal propagates and the oracle refuses. */
async function cases(taskRoot, list, runProbe, { immutable = false } = {}) {
  let input = null;
  try { input = { sources: sources(taskRoot), calls: list.map(({ id, module, export: name, args }) => ({ id, module, export: name, args })) }; } catch { input = null; }
  const rows = input ? await runProbe(input) : null;
  return list.map((test, index) => {
    const row = rows?.[index];
    let matched = false;
    if (row?.id === test.id && (!immutable || row.mutated === false)) {
      if (test.errorName) matched = row.outcome === "threw" && row.errorName === test.errorName;
      else if (row.outcome === "returned") { try { matched = isDeepStrictEqual(JSON.parse(row.valueJson), test.expected); } catch { matched = false; } }
    }
    return check(`case-${test.id}`, matched, !rows ? "The contained probe did not complete, so this case did not run." : matched
      ? "The observed return value or exception matched the oracle's fixed expectation." : row?.mutated ? "The solution mutated its input."
        : `Observed ${row?.outcome ?? "nothing"}; it did not match the oracle's fixed expectation.`);
  });
}

// cod-test-writing: the reference semantics of repo/duration.mjs and planted regressions, owned by this oracle.
const durationOf = ({ hours = 3600, minutes = 60, seconds = 1, emptyOk = false, anyOrder = false, coerce = false } = {}) => (input) => {
  let text = input;
  if (typeof text !== "string") { if (!coerce) throw new TypeError("not a string"); text = String(text); }
  if (text === "" && emptyOk) return 0;
  const pattern = anyOrder ? /^(?=.)(?:(\d+)([hms]))?(?:(\d+)([hms]))?(?:(\d+)([hms]))?$/ : /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
  const match = pattern.exec(text);
  if (!text || !match) throw new SyntaxError("not a duration");
  if (!anyOrder) return Number(match[1] ?? 0) * hours + Number(match[2] ?? 0) * minutes + Number(match[3] ?? 0) * seconds;
  const scale = { h: hours, m: minutes, s: seconds }; let total = 0;
  for (let index = 1; index < 7; index += 2) if (match[index]) total += Number(match[index]) * scale[match[index + 1]];
  return total;
};
const MUTANTS = { "hours-wrong": { hours: 60 }, "minutes-wrong": { minutes: 61 }, "seconds-dropped": { seconds: 0 }, "empty-accepted": { emptyOk: true },
  "order-ignored": { anyOrder: true }, "non-string-coerced": { coerce: true } };
const holds = (fn, vector) => {
  try { const result = fn(vector.input); return !("throws" in vector) && result === vector.expected; }
  catch (error) { return "throws" in vector && error.name === vector.throws; }
};

function testWriting(taskRoot) {
  let vectors = null;
  try {
    const parsed = readJson(join(taskRoot, "repo", "vectors.json"));
    const valid = (row) => row && typeof row === "object" && !Array.isArray(row) && Object.hasOwn(row, "input") && Object.keys(row).length === 2
      && ((Number.isSafeInteger(row.expected) && typeof row.input === "string") || ["TypeError", "SyntaxError"].includes(row.throws));
    if (Array.isArray(parsed) && parsed.length >= 8 && parsed.length <= 200 && parsed.every(valid)) vectors = parsed;
  } catch { vectors = null; }
  const reference = durationOf();
  return [
    check("vectors-valid", vectors !== null, "repo/vectors.json must be a JSON array of 8 to 200 {input, expected} or {input, throws} objects."),
    check("reference-holds", vectors?.every((vector) => holds(reference, vector)), "Every vector must hold for the unchanged implementation."),
    ...Object.entries(MUTANTS).map(([id, options]) => check(`kills-${id}`, vectors?.some((vector) => !holds(durationOf(options), vector)),
      `At least one vector must fail against the planted regression ${id}.`))
  ];
}

function docsConsistency(taskRoot) {
  let text = "";
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(readBounded(join(taskRoot, "repo", "README.md"), 64 * 1024)); } catch { text = ""; }
  const table = Object.fromEntries([...text.matchAll(/^\|\s*`(\w+)`\s*\|\s*`([^`|]*)`\s*\|\s*$/gm)].map((row) => [row[1], row[2]]));
  const prose = [...text.matchAll(/retries (\d+) times|waits (\d+) ms/g)];
  return [
    check("readme-table", isDeepStrictEqual(table, { port: "8080", retries: "3", timeoutMs: "15000", logLevel: "info" }),
      "The README table must list exactly the four settings with the defaults config.mjs uses."),
    check("readme-prose", prose.length > 0 && prose.every((row) => row[1] ? row[1] === "3" : row[2] === "15000"),
      "The README prose must keep stating the retry count and attempt timeout, with the values config.mjs uses.")
  ];
}

function dependencyPins(taskRoot) {
  let manifest = null, app = "";
  try { manifest = readJson(join(taskRoot, "repo", "package.json")); } catch { manifest = null; }
  try { app = new TextDecoder("utf-8", { fatal: true }).decode(readBounded(join(taskRoot, "repo", "app.mjs"), 64 * 1024)); } catch { app = ""; }
  const specifiers = [...app.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)].map((row) => row[1] ?? row[2]);
  return [
    check("package-pin", isDeepStrictEqual(manifest?.dependencies, { datefmt: "2.1.0" }), "repo/package.json must pin exactly datefmt 2.1.0."),
    check("imports-v2-only", specifiers.length > 0 && specifiers.every((name) => name === "./vendor/datefmt-2.1.0/index.mjs"),
      "repo/app.mjs must import only ./vendor/datefmt-2.1.0/index.mjs.")
  ];
}

const TASKS = {
  "cod-multi-file": { allowed: ["repo/money.mjs", "repo/invoice.mjs", "repo/report.mjs"], run: (root, runProbe) => cases(root, [
    value("money-object-usd", "money.mjs", "formatMinor", [{ amountMinor: 1234, currency: "USD" }], "USD 12.34"),
    value("money-object-negative", "money.mjs", "formatMinor", [{ amountMinor: -5, currency: "EUR" }], "EUR -0.05"),
    throws("money-old-signature", "money.mjs", "formatMinor", [1234, "USD"], "TypeError"),
    throws("money-fraction", "money.mjs", "formatMinor", [{ amountMinor: 1.5, currency: "USD" }], "TypeError"),
    value("invoice-line", "invoice.mjs", "invoiceLine", [{ name: "Widget", amountMinor: 250, currency: "USD" }], "Widget: USD 2.50"),
    value("total-line", "report.mjs", "totalLine", [[{ name: "a", amountMinor: 250, currency: "USD" }, { name: "b", amountMinor: 1000, currency: "USD" }]], "Total (2 items): USD 12.50"),
    value("total-empty", "report.mjs", "totalLine", [[]], "Total (0 items): USD 0.00")], runProbe) },
  "cod-test-writing": { allowed: ["repo/vectors.json"], run: testWriting },
  "cod-dependency-upgrade": { allowed: ["repo/app.mjs", "repo/package.json"], run: async (root, runProbe) => [...dependencyPins(root), ...await cases(root, [
    value("stamp", "app.mjs", "stamp", ["2026-03-04T05:06:07Z"], "2026-03-04"),
    value("stamp-time", "app.mjs", "stampTime", ["2026-03-04T05:06:07Z"], "2026-03-04 05:06"),
    value("stamp-time-late", "app.mjs", "stampTime", ["2026-12-31T23:59:00Z"], "2026-12-31 23:59")], runProbe)] },
  "cod-docs-consistency": { allowed: ["repo/README.md"], run: docsConsistency },
  "cod-bug-fix": { allowed: ["repo/paginate.mjs"], run: (root, runProbe) => cases(root, [
    value("first-page", "paginate.mjs", "paginate", [[1, 2, 3, 4, 5], 1, 2], { items: [1, 2], page: 1, totalPages: 3 }),
    value("last-partial-page", "paginate.mjs", "paginate", [[1, 2, 3, 4, 5], 3, 2], { items: [5], page: 3, totalPages: 3 }),
    value("exact-pages", "paginate.mjs", "paginate", [[1, 2, 3, 4], 2, 2], { items: [3, 4], page: 2, totalPages: 2 }),
    value("empty-list", "paginate.mjs", "paginate", [[], 1, 10], { items: [], page: 1, totalPages: 1 }),
    throws("beyond-last-page", "paginate.mjs", "paginate", [[1, 2, 3], 2, 3], "RangeError"),
    throws("page-zero", "paginate.mjs", "paginate", [[1, 2, 3], 0, 1], "RangeError"),
    throws("not-an-array", "paginate.mjs", "paginate", ["abc", 1, 1], "TypeError")], runProbe) },
  // The 3 existing tasks: codingOracle.mjs's own cases and immutability rule, run through the contained probe.
  ...Object.fromEntries(Object.entries(LEGACY).map(([id, suite]) => [id, { allowed: ["repo/solution.mjs"], run: async (root, runProbe) => {
    let digest = null;
    try { digest = sha256(readBounded(join(root, "repo", "solution.mjs"), 128 * 1024)); } catch { digest = null; }
    return [check("solution-file", digest !== null, digest ? `Evaluated source snapshot SHA-256 ${digest}.` : "repo/solution.mjs must be a bounded regular file."),
      ...await cases(root, suite.cases.map((test) => ({ ...test, module: "solution.mjs", export: suite.exportName })), runProbe, { immutable: true })];
  } }]))
};

export const supportsCoding = (id) => Object.hasOwn(TASKS, id);

export async function evaluateCoding({ fixture, taskRoot, trialWorkspace, runProbe }) {
  const task = TASKS[fixture.id];
  return [...await task.run(taskRoot, runProbe), unauthorizedWrites({ fixture, taskRoot, trialWorkspace, allowed: task.allowed })];
}
