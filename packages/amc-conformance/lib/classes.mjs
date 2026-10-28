/**
 * What each conformance class asks of an implementation (spec/conformance/v1/README.md). A judge gets the case, its
 * resolved paths and the finished process, and returns { outcome, diff }: "pass" with a null diff, or "fail" or "error"
 * saying why. Anything a judge cannot read is an error, never a pass.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { schemaError } from "./schema.mjs";

export const DIMENSIONS = ["integrity", "issuerAdmission", "scope", "freshness", "completeness", "satisfaction"];
const ENFORCEMENT_LEVELS = ["none", "advisory", "observed", "enforced"];
const DECISIONS = ["allow", "deny", "ask"];

const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const fail = diff => ({ outcome: "fail", diff });
const error = message => ({ outcome: "error", diff: { error: message } });
const PASS = { outcome: "pass", diff: null };

/** stdout as one JSON value, or an error result: non-JSON output is never judged. */
function stdoutJson(run) {
  try {
    return { value: JSON.parse(run.stdout) };
  } catch {
    return { result: error(`stdout is not JSON (exit ${run.status}): ${run.stderr.slice(0, 500)}`) };
  }
}

/** The AMC verifier CLI's flags for a fixture case (spec/fixtures/v1/README.md), for the {verifierArgs} placeholder. */
function verifierArgs(dir, params) {
  const args = ["--trust-list", join(dir, "trust-list.json")];
  const more = join(dir, "more-trust-lists");
  for (const name of existsSync(more) ? readdirSync(more).sort() : []) args.push("--trust-list", join(more, name));
  for (const root of params.trustRoots ?? []) args.push("--trust-root", root);
  if (params.rootThreshold !== undefined) args.push("--root-threshold", String(params.rootThreshold));
  if (params.asOf) args.push("--as-of", params.asOf);
  for (const [key, value] of Object.entries(params.expect ?? {})) args.push(`--expect-${key}`, value);
  for (const [id, sequence] of Object.entries(params.knownSequences ?? {})) args.push("--known-sequence", `${id}=${sequence}`);
  if (existsSync(join(dir, "evidence"))) args.push("--evidence-dir", join(dir, "evidence"));
  args.push("--json");
  return args;
}

const verifier = {
  placeholders(item, at) {
    const dir = at(item.fixture);
    return {
      artifact: join(dir, item.input.artifact), trustList: join(dir, item.input.trustList), asOf: item.input.asOf,
      params: join(dir, "params.json"), caseDir: dir, verifierArgs: verifierArgs(dir, readJson(join(dir, "params.json")))
    };
  },
  inputs: (item, at) => [at(item.fixture)],
  judge(item, at, run, schemas) {
    const { value: report, result } = stdoutJson(run);
    if (result) return result;
    const invalid = schemaError(schemas("verifier-report"), report);
    if (invalid) return fail({ report: `not a verifier-report v1: ${invalid}` });
    const expected = readJson(join(at(item.fixture), item.expect));
    const diff = {};
    for (const dimension of DIMENSIONS) {
      const actual = report[dimension]?.status ?? null;
      if (actual !== expected.dimensions[dimension]) (diff.dimensions ??= {})[dimension] = { expected: expected.dimensions[dimension], actual };
      const reported = report.reasonCodes?.[dimension] ?? [];
      const missing = (expected.reasonCodes?.[dimension] ?? []).filter(code => !reported.includes(code));
      if (missing.length > 0) (diff.reasonCodes ??= {})[dimension] = { missing, actual: reported };
    }
    if (run.status !== expected.exitCode) diff.exitCode = { expected: expected.exitCode, actual: run.status };
    return Object.keys(diff).length === 0 ? PASS : fail(diff);
  }
};

function jsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(line => line.trim() !== "").map(line => JSON.parse(line));
}

const enforcementLevel = value => (typeof value === "string" ? value : value?.level);

/** Producer checks, each over the records in outDir: events.jsonl, receipts.jsonl and producer.json. */
const PRODUCER_CHECKS = {
  contract({ events, receipts }, schemas) {
    if (events.length === 0) return fail({ events: "events.jsonl holds no record" });
    for (const [index, event] of events.entries()) {
      const invalid = schemaError(schemas("evidence-event"), event);
      if (invalid) return fail({ event: index, error: `not an evidence-event v1: ${invalid}` });
    }
    for (const [index, receipt] of receipts.entries()) {
      const invalid = schemaError(schemas("receipt"), receipt);
      if (invalid) return fail({ receipt: index, error: `not a receipt v1: ${invalid}` });
    }
    return PASS;
  },
  chain({ events }) {
    if (events.length === 0) return fail({ events: "events.jsonl holds no record" });
    if (events[0].prevEventHash !== "GENESIS") return fail({ event: 0, prevEventHash: { expected: "GENESIS", actual: events[0].prevEventHash ?? null } });
    const seen = new Set();
    for (const [index, event] of events.entries()) {
      if (index > 0 && event.prevEventHash !== events[index - 1].eventHash) {
        return fail({ event: index, prevEventHash: { expected: events[index - 1].eventHash ?? null, actual: event.prevEventHash ?? null } });
      }
      if (typeof event.eventHash !== "string" || seen.has(event.eventHash)) return fail({ event: index, eventHash: "missing or repeated" });
      seen.add(event.eventHash);
    }
    return PASS;
  },
  // L624: an importer re-states what another system did; it never enforced anything, so every record says none.
  "importer-enforcement"({ events, receipts, producer, scenario }) {
    if (producer.role !== "importer" && scenario.role !== "importer") return PASS;
    for (const [index, receipt] of receipts.entries()) {
      if (enforcementLevel(receipt.enforcement) !== "none") return fail({ receipt: index, enforcement: { expected: "none", actual: receipt.enforcement ?? null } });
    }
    for (const [index, event] of events.entries()) {
      const claimed = event.meta?.enforcement;
      if (claimed !== undefined && enforcementLevel(claimed) !== "none") return fail({ event: index, enforcement: { expected: "none", actual: claimed } });
    }
    return PASS;
  }
};

const producer = {
  placeholders: (item, at, outDir) => ({ scenario: at(item.scenario), outDir }),
  inputs: (item, at) => [at(item.scenario)],
  judge(item, at, run, schemas, outDir) {
    if (run.status !== 0) return error(`exit ${run.status}: ${run.stderr.slice(0, 500)}`);
    let records;
    try {
      records = {
        events: jsonLines(join(outDir, "events.jsonl")), receipts: jsonLines(join(outDir, "receipts.jsonl")),
        producer: existsSync(join(outDir, "producer.json")) ? readJson(join(outDir, "producer.json")) : {}, scenario: readJson(at(item.scenario))
      };
    } catch (cause) {
      return error(`records are not JSON: ${cause.message}`);
    }
    const check = PRODUCER_CHECKS[item.check];
    if (!check) return error(`unknown producer check ${item.check}`);
    return check(records, schemas);
  }
};

const adapter = {
  placeholders: (item, at) => ({ hookPayload: at(item.hookPayload), policy: at(item.policy) }),
  inputs: (item, at) => [at(item.hookPayload), at(item.policy)],
  judge(item, at, run) {
    const { value: output, result } = stdoutJson(run);
    if (result) return result;
    const diff = {};
    if (!DECISIONS.includes(output?.decision)) diff.decision = { expected: item.expect.decision, actual: output?.decision ?? null };
    else if (output.decision !== item.expect.decision) diff.decision = { expected: item.expect.decision, actual: output.decision };
    const enforcement = output?.receipt?.enforcement;
    const level = enforcement?.level;
    if (!ENFORCEMENT_LEVELS.includes(level)) {
      diff.enforcement = { error: "receipt.enforcement.level is missing or not in the vocabulary", actual: enforcement ?? null };
    } else if (item.expect.enforced) {
      const hook = readJson(at(item.hookPayload)).hook_event_name;
      // The receipt names the hook it was enforced at, so a reader knows which boundary held.
      if (level !== "enforced" || typeof enforcement.boundary !== "string" || !enforcement.boundary.includes(hook)) {
        diff.enforcement = { expected: `enforced at a boundary naming ${hook}`, actual: enforcement };
      }
    } else if (level === "enforced") {
      diff.enforcement = { expected: "no enforcement claim in observation-only mode", actual: enforcement };
    }
    return Object.keys(diff).length === 0 ? PASS : fail(diff);
  }
};

const compiler = {
  placeholders: (item, at, outDir) => ({ profile: at(item.profile), catalogLock: at(item.catalogLock), outDir }),
  inputs: () => [],
  judge: () => error("no compiler case is judged until P1-10's golden outputs exist")
};

export const CLASS_RULES = { verifier, producer, adapter, compiler };
