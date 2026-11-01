import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { bridgeEvidenceRedactor, BRIDGE_REDACTED_MARKER, processOutputRedactor, recordedArgv } from "../src/bridge/bridgeRedaction.js";
import { detectProtectedRequest, protectedWalk, WalkRefused, type DeclaredFields } from "../src/dataflow/detectors.js";
import { processorRegistryPath } from "../src/dataflow/processorRegistry.js";
import { createWorkspaceRedactor } from "../src/dataflow/redactingSession.js";
import { RedactionRefused } from "../src/dataflow/tokenizer.js";
import { redactBody, redactHeaders, redactRequestTarget } from "../src/gateway/redaction.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P2-02: the parse-first walker's regression corpus (tests/fixtures/dataflow/protected-walk-regressions.json). Every
 * finding of hardening rounds 1-3, the slice-2 items, the judged design's defects (a)-(h), benign and hostile rows and
 * this lane's adversarial round, each replayed through the surface it was found on. Walk rows also hold three
 * properties: the same input gives the same output and findings, walking the output again (its tokens issued) changes and
 * finds nothing, and JSON in is JSON out. Out-of-walker rows are filtered (and checked for their pointer), never skipped.
 */
type Surface = "walk" | "session" | "admission" | "gateway-body" | "gateway-header" | "gateway-target" | "toolhub" | "bridge-text"
  | "bridge-json" | "argv" | "process-output" | "out-of-walker";
interface CorpusRow {
  readonly id: string; readonly round: string; readonly finding: string; readonly surface: Surface; readonly optedIn?: boolean;
  readonly also?: readonly string[]; readonly key?: string; readonly budget?: number; readonly declared?: DeclaredFields;
  readonly coveredBy?: string; readonly reason?: string; readonly gap?: string;
  readonly input: { readonly text?: string; readonly value?: unknown; readonly key?: string; readonly contentType?: string;
    readonly declared?: DeclaredFields; readonly command?: string; readonly args?: readonly string[];
    readonly generate?: readonly (readonly [string, number])[]; readonly generateValue?: { readonly declaredRows?: number; readonly numbers?: number } };
  readonly expect: { readonly unchanged?: boolean; readonly classes?: readonly string[]; readonly absent?: readonly string[];
    readonly present?: readonly string[]; readonly opaque?: string; readonly refusal?: string; readonly withinMs?: number };
}
const corpus = JSON.parse(readFileSync(join(__dirname, "fixtures/dataflow/protected-walk-regressions.json"), "utf8")) as {
  readonly schema: string; readonly cases: readonly CorpusRow[]; readonly mutations: readonly { readonly id: string; readonly guard: string; readonly kills: readonly string[] }[];
};

// Synthetic values: test card numbers, example.com addresses, made-up keys. Spelled in parts so no scanner reads a secret here.
const VALUES: Readonly<Record<string, string>> = {
  CARD: "4111111111111111", EMAIL: "odalys.fenwick@example.com", MRN: "A1234567", PASSWORD: "hunter2-fixture",
  OPENAI: ["sk", "Fx7Kq2Lm9Pz4Rt6Vw8Yb1Nc3"].join("-"), GITHUB: ["ghp", "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb7c"].join("_")
};
const FUNCTIONS: Readonly<Record<string, (arg: string) => string>> = {
  base64: arg => Buffer.from(arg).toString("base64"),
  base64url: arg => Buffer.from(arg).toString("base64url"),
  base64json: arg => Buffer.from(arg).toString("base64").replace(/\//g, "\\/"),
  percent: arg => encodeURIComponent(arg),
  fullwidth: arg => arg.replace(/\d/g, digit => String.fromCharCode(0xff10 + Number(digit))),
  repeat: arg => { const [count, ...rest] = arg.split(":"); return rest.join(":").repeat(Number(count)); }
};
/** `{{NAME}}` and `{{fn:arg}}` filled innermost first. */
function fill(template: string): string {
  const innermost = /\{\{([A-Za-z0-9]+)(?::((?:(?!\{\{|\}\})[\s\S])*))?\}\}/;
  let text = template;
  for (let match = innermost.exec(text); match !== null; match = innermost.exec(text)) {
    const [whole, name, arg] = match;
    const value = arg === undefined ? VALUES[name!] : FUNCTIONS[name!]?.(arg);
    if (value === undefined) throw new Error(`unknown corpus placeholder ${whole}`);
    text = text.slice(0, match.index) + value + text.slice(match.index + whole.length);
  }
  return text;
}
const fillValue = (value: unknown): unknown => typeof value === "string" ? fill(value) : Array.isArray(value) ? value.map(fillValue)
  : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [fill(key), fillValue(item)])) : value;
function inputText(row: CorpusRow): string {
  if (row.input.generate !== undefined) return row.input.generate.map(([part, count]) => fill(part).repeat(count)).join("");
  return fill(row.input.text ?? "");
}
function inputValue(row: CorpusRow): unknown {
  const generated = row.input.generateValue;
  if (generated?.declaredRows !== undefined) return { rows: Array.from({ length: generated.declaredRows }, (_, index) => ({ name: `Patient ${index}`, ward: index % 9 })) };
  if (generated?.numbers !== undefined) return Array.from({ length: generated.numbers }, (_, index) => (index * 7919) % 1_000_000);
  return fillValue(row.input.value);
}

interface Outcome { readonly output: string; readonly classes: readonly string[]; readonly opaque: readonly string[] }
const token = (dataClass: string, value: string) => `[[amc:${dataClass}:${createHash("sha256").update(value).digest("hex").slice(0, 16)}]]`;
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

let optedIn: string, notOpted: string;
const dirs: string[] = [];
function workspace(opted: boolean): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-walk-corpus-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  // Opt-in is the registry file's presence; no row here reads its content.
  if (opted) { mkdirSync(join(dir, ".amc", "dataflow"), { recursive: true }); writeFileSync(processorRegistryPath(dir), "opt-in marker\n"); }
  return dir;
}
beforeAll(() => { optedIn = workspace(true); notOpted = workspace(false); });
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

function walkRow(row: CorpusRow, issued: ReadonlySet<string> = new Set()): Outcome & { readonly tokens: ReadonlySet<string> } {
  const tokens = new Set<string>(), opaque: string[] = [];
  const declared = row.declared ?? row.input.declared;
  const walk = protectedWalk({ budget: row.budget ?? 16_777_216, issued: value => issued.has(value) || tokens.has(value),
    ...(declared === undefined ? {} : { declared: { fields: declared } }),
    replace: (finding, value) => { const made = token(finding.dataClass, value); tokens.add(made); return made; },
    opaque: reason => { opaque.push(reason); return `<opaque:${reason}>`; } });
  const output = row.input.text !== undefined || row.input.generate !== undefined
    ? walk.text(inputText(row), row.key ?? row.input.key) : JSON.stringify(walk.value(inputValue(row)));
  return { output, classes: sorted(walk.findings.map(finding => finding.dataClass)), opaque, tokens };
}
const NO_CONFIG = { headerKeysDenylist: [], jsonPathsDenylist: [], textRegexDenylist: [] };
const protectedClasses = (reasons: readonly string[]) => sorted(reasons.filter(reason => reason.startsWith("protectedData:") && reason !== "protectedData:unscanned")
  .map(reason => reason.slice("protectedData:".length)));
const unscanned = (reasons: readonly string[]) => reasons.includes("protectedData:unscanned") ? ["unscanned"] : [];

function run(row: CorpusRow): Outcome {
  const opted = row.optedIn !== false;
  const ws = opted ? optedIn : notOpted;
  switch (row.surface) {
    case "walk": return walkRow(row);
    case "session": {
      const redaction = createWorkspaceRedactor(ws).redact(inputText(row), row.input.declared);
      return { output: redaction.text, classes: sorted(redaction.findings.map(finding => finding.dataClass)), opaque: [] };
    }
    case "admission": {
      const detection = detectProtectedRequest({ model: "m", system: null, params: {}, tools: [],
        messages: [{ role: "user", parts: [{ kind: "text", text: inputText(row) }] }] } as never);
      return { output: "", classes: sorted(detection.classes), opaque: [] };
    }
    case "gateway-body": case "toolhub": {
      const json = row.input.value !== undefined;
      const body = Buffer.from(json ? JSON.stringify(inputValue(row)) : inputText(row), "utf8");
      const declared = row.input.declared === undefined ? undefined : { fields: row.input.declared, at: ["result"] };
      const result = redactBody(body, json ? "application/json" : row.input.contentType, NO_CONFIG, { protectedData: opted, ...(declared === undefined ? {} : { declared }) });
      return { output: result.redactedBytes.toString("utf8"), classes: protectedClasses(result.redactionReasons), opaque: unscanned(result.redactionReasons) };
    }
    case "gateway-header": {
      const key = row.input.key!;
      const result = redactHeaders({ [key]: inputText(row) }, [], { protectedData: opted });
      return { output: result.headers[key]!, classes: protectedClasses(result.redactionReasons), opaque: unscanned(result.redactionReasons) };
    }
    case "gateway-target": {
      const target = redactRequestTarget(new URL(`http://gateway.invalid${inputText(row)}`), opted);
      return { output: target.path + target.query, classes: [], opaque: [] };
    }
    case "bridge-text": case "process-output": {
      const text = inputText(row);
      const output = row.surface === "bridge-text" ? bridgeEvidenceRedactor(ws).text(text) : String(processOutputRedactor(ws)(text));
      return { output, classes: [], opaque: output.includes(BRIDGE_REDACTED_MARKER) ? ["marker"] : [] };
    }
    case "bridge-json": return { output: JSON.stringify(bridgeEvidenceRedactor(ws).json(inputValue(row))), classes: [], opaque: [] };
    case "argv": {
      const recorded = recordedArgv(ws, row.input.command!, (row.input.args ?? []).map(fill));
      return { output: JSON.stringify([recorded.command, ...recorded.args]), classes: [], opaque: [] };
    }
    case "out-of-walker": throw new Error(`${row.id} has no walk input`);
  }
}
/** What a refused row threw, as the reason its surface names. */
function refusalOf(error: unknown): string {
  if (error instanceof WalkRefused || error instanceof RedactionRefused) return error.reason;
  if (error instanceof Error && /Protected request detection refused/.test(error.message)) return "detector_invalid";
  throw error;
}

const replayed = corpus.cases.filter(row => row.surface !== "out-of-walker");
const CLASSES_REPORTED: ReadonlySet<Surface> = new Set(["walk", "session", "admission", "gateway-body", "gateway-header", "toolhub"]);

describe("the protected-walk regression corpus", () => {
  test.each(replayed.map(row => [row.id, row] as const))("%s", (_id, row) => {
    const { expect: want } = row;
    if (want.refusal !== undefined) {
      let reason: string | undefined;
      try { run(row); } catch (error) { reason = refusalOf(error); }
      expect(reason).toBe(want.refusal);
      return;
    }
    const started = performance.now();
    const outcome = run(row);
    const elapsed = performance.now() - started;
    if (want.withinMs !== undefined) expect(elapsed).toBeLessThan(want.withinMs);
    if (want.unchanged) expect(outcome.output).toBe(row.input.value !== undefined || row.input.generateValue !== undefined ? JSON.stringify(inputValue(row)) : inputText(row));
    if (want.classes !== undefined) {
      expect(CLASSES_REPORTED.has(row.surface), `${row.surface} reports no classes`).toBe(true);
      expect(outcome.classes).toEqual([...want.classes].sort());
    }
    if (want.opaque !== undefined) {
      if (row.surface === "walk") expect(outcome.opaque).toContain(want.opaque);
      else expect(outcome.opaque.length, "the value was replaced whole").toBeGreaterThan(0);
    }
    for (const value of want.absent ?? []) expect(outcome.output).not.toContain(fill(value));
    for (const value of want.present ?? []) expect(outcome.output).toContain(fill(value));
  });

  const walkRows = replayed.filter(row => row.surface === "walk" && row.expect.refusal === undefined);
  test.each(walkRows.map(row => [row.id, row] as const))("%s: deterministic, idempotent, JSON in is JSON out", (_id, row) => {
    const first = walkRow(row), second = walkRow(row);
    expect(second.output).toBe(first.output);
    expect(second.classes).toEqual(first.classes);
    const again = protectedWalk({ budget: 16_777_216, issued: value => first.tokens.has(value),
      ...(row.declared === undefined && row.input.declared === undefined ? {} : { declared: { fields: (row.declared ?? row.input.declared)! } }),
      replace: () => "<changed>", opaque: reason => `<opaque:${reason}>` });
    const isText = row.input.text !== undefined || row.input.generate !== undefined;
    const rewalked = isText ? again.text(first.output, row.key ?? row.input.key) : JSON.stringify(again.value(JSON.parse(first.output) as unknown));
    expect(rewalked).toBe(first.output);
    expect(again.findings).toEqual([]);
    if (isText) {
      let json = true;
      try { JSON.parse(inputText(row)); } catch { json = false; }
      if (json) expect(() => JSON.parse(first.output) as unknown).not.toThrow();
    }
  });
});

describe("the corpus is complete", () => {
  const ids = corpus.cases.map(row => row.id);
  const findings = new Set(corpus.cases.flatMap(row => [row.finding, ...(row.also ?? [])]));
  test("schema, unique ids and every past finding", () => {
    expect(corpus.schema).toBe("amc.test.protected-walk-corpus/v1");
    expect(new Set(ids).size).toBe(ids.length);
    const rounds = [["r1", 10], ["r2", 15], ["r3", 13]] as const;
    for (const [round, count] of rounds) for (let index = 1; index <= count; index += 1) expect(findings, `${round}-${String(index).padStart(2, "0")}`).toContain(`${round}-${String(index).padStart(2, "0")}`);
    for (const item of ["forged-token", "duplicate-keys", "declared-numbers-keys", "raw-before-decode", "escaped-json", "password-json-escaped", "committed-equals-rendered"]) expect(findings).toContain(item);
    for (const defect of "abcdefgh") expect(findings).toContain(`defect-${defect}`);
    for (let index = 1; index <= 10; index += 1) expect(findings).toContain(`adv-${String(index).padStart(2, "0")}`);
  });
  test("out-of-walker rows are filtered with a reason and a source that exists", () => {
    for (const row of corpus.cases.filter(item => item.surface === "out-of-walker")) {
      expect(row.reason, row.id).toBeTruthy();
      expect(existsSync(join(__dirname, "..", row.coveredBy ?? "missing")), row.id).toBe(true);
    }
  });
  test("each of the 11 mutation checks names corpus rows that kill it", () => {
    expect(corpus.mutations.map(mutation => mutation.id)).toEqual(Array.from({ length: 11 }, (_, index) => `M${index + 1}`));
    for (const mutation of corpus.mutations) {
      expect(mutation.kills.length, mutation.id).toBeGreaterThan(0);
      for (const id of mutation.kills) expect(ids, `${mutation.id} names ${id}`).toContain(id);
    }
  });
});
