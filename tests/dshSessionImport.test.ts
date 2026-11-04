import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { dshSessionWarnings, parseDetectedDshSession } from "../src/importers/dshSessionImport.js";
import { runNeutralImport, validateNeutralImport } from "../src/importers/neutralImporter.js";
import { SourceFormatError } from "../src/importers/sourceFormatError.js";

// Synthetic physical records, not recordings from DSH or proof of an upload.
// Header/event shapes follow c389f96b; both c389 and strategy 5bad use these
// physical header fields. The pinned v2 decoder refuses v4; the neutral importer dispatches v4 separately.
const REVISION = "c389f96bf3a9b6807cb71ed6bdad5849be0df6d8";
const header = { type: "session", version: 2, id: "synthetic-dsh-v2", createdAt: 1000, isSeeded: false, delegationDepth: 0 };
const completed = [
  { type: "turn/start", seq: 0, time: 1001, data: { turn: 0 } },
  { type: "turn/end", seq: 1, time: 1002, data: { turn: 0, reason: { kind: "completed" } } }
];
const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join("\n") + "\n";

function withSource(text: string, body: (input: { workspace: string; inputPath: string; agentId: string }) => void): void {
  const root = mkdtempSync(join(tmpdir(), "amc-p124-dsh-"));
  chmodSync(root, 0o700);
  const workspace = join(root, "workspace"), inputPath = join(root, "session.jsonl");
  mkdirSync(workspace, { mode: 0o700 });
  writeFileSync(inputPath, text, { mode: 0o600 });
  try {
    body({ workspace, inputPath, agentId: "default" });
    // These tests only preview or refuse before import application. They do
    // not initialize a vault, ledger, child, service or SQLite connection.
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
  } catch (error) {
    console.error(`P124 retained owned DSH fixture: ${root}`);
    throw error;
  }
  rmSync(root, { recursive: true });
}

function formatError(text: string): SourceFormatError {
  let caught: unknown;
  try { parseDetectedDshSession(text); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(SourceFormatError);
  if (!(caught instanceof SourceFormatError)) throw new Error("Expected the explicit DSH source-format refusal");
  return caught;
}

function previewRefusal(text: string, message: string): void {
  withSource(text, input => {
    const plan = validateNeutralImport(input);
    expect(plan.status).toBe("unsupported");
    expect(plan.candidates).toEqual([]);
    expect(plan.unsupported).toHaveLength(1);
    // This exact public-plan assertion is sensitive to removal of the
    // SourceFormatError catch branch, rather than only testing the parser.
    expect(plan.unsupported[0]?.reason).toBe(message);
    expect(plan.unsupported[0]?.reason).not.toContain("Could not parse");
    expect(JSON.stringify(plan)).not.toContain("synthetic-private");
    expect(plan.normalization?.nextActions.some(action => action.argv.includes("--expected-digest"))).toBe(false);
    expect(() => runNeutralImport({ ...input, mode: "import" })).toThrow(/Unsupported import/);
  });
}

describe("P1-24 explicit DSH session contracts", () => {
  test("parses a synthetic v2 physical session and previews source-reported output without writes", () => {
    const text = jsonl([header, ...completed]), parsed = parseDetectedDshSession(text);
    expect(parsed?.header).toEqual(header);
    expect(parsed?.rows).toHaveLength(3);
    expect(parsed?.format).toMatchObject({ name: "dsh-session", version: 2, mappingVersion: 1, sessionId: "synthetic-dsh-v2", sourceRevision: REVISION, eventCount: 2, inheritedEventCount: 0, unknownIgnorableEvents: 0, sourceTrust: "SELF_REPORTED", evaluationStatus: "NOT_EVALUATED" });
    withSource(text, input => {
      const result = runNeutralImport({ ...input, mode: "dry-run" });
      expect(result.applied).toBe(false);
      expect(result.plan.candidates).toHaveLength(1);
      expect(result.plan.candidates[0]).toMatchObject({ category: "event-log", format: "jsonl", digest: createHash("sha256").update(readFileSync(input.inputPath)).digest("hex"), sourceFormat: { name: "dsh-session", version: 2, sourceRevision: REVISION } });
      expect(result.plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED", counts: { normalizedTraces: 1 } });
      expect(result.plan.normalization?.recordMapping?.sources[0]).toMatchObject({ format: "dsh-session", version: 2, sourceRevision: REVISION, recordCount: 3 });
    });
  });

  test.each([0, 1, 3, 5])("refuses DSH v%i with its typed, pinned public plan message and no generic fallback", version => {
    const text = jsonl([{ ...header, version }, ...completed]);
    const message = `DSH session format v${version} is not supported; AMC imports DSH v2 (revision c389f96b). No migration is attempted.`;
    expect(formatError(text)).toMatchObject({ code: "DSH_SESSION_VERSION_UNSUPPORTED", format: "dsh-session", detectedVersion: version, supported: "dsh-session v2", sourceRevision: REVISION, message });
    previewRefusal(text, message);
  });

  test.each([undefined, "synthetic-private-version", { private: "synthetic-private-version" }])("refuses a missing or invalid DSH version without rendering source values (%j)", version => {
    const text = jsonl([{ ...header, version }, ...completed]);
    const message = "DSH session format with a missing or invalid version is not supported; AMC imports DSH v2 (revision c389f96b). No migration is attempted.";
    expect(formatError(text)).toMatchObject({ code: "DSH_SESSION_VERSION_UNSUPPORTED", detectedVersion: null, sourceRevision: REVISION, message });
    previewRefusal(text, message);
  });

  test("refuses an invalid v2 physical header instead of reclassifying it as Pi or generic events", () => {
    const badHeader = { type: "session", version: 2, id: header.id, createdAt: 1000, isSeeded: false };
    const text = jsonl([badHeader, ...completed]);
    const message = "DSH session import refused: invalid or unsupported v2 physical header.";
    expect(formatError(text)).toMatchObject({ code: "DSH_SESSION_REFUSED", detectedVersion: 2, message });
    previewRefusal(text, message);
  });

  test("recognizes a torn DSH-only header marker and refuses without echoing its private suffix", () => {
    const text = '{"type":"session","version":2,"isSeeded":false,"private":"synthetic-private-tail"\n';
    const message = "DSH session import refused: malformed DSH header; no generic fallback.";
    expect(formatError(text)).toMatchObject({ code: "DSH_SESSION_REFUSED", detectedVersion: null, message });
    previewRefusal(text, message);
  });

  test("refuses a malformed event line rather than silently repairing a torn tail", () => {
    const text = `${JSON.stringify(header)}\n{"type":"turn/start",\n`;
    const message = "DSH session import refused: malformed JSON at line 2; torn tails are not silently repaired.";
    expect(formatError(text)).toMatchObject({ code: "DSH_SESSION_REFUSED", message });
    previewRefusal(text, message);
  });

  test("refuses unknown required events rather than silently losing them", () => {
    const text = jsonl([header, { type: "synthetic/future-required", seq: 0, time: 1001, data: {} }]);
    const message = "DSH session import refused: unknown required event at seq 0; upgrade the importer rather than skipping it.";
    expect(formatError(text)).toMatchObject({ code: "DSH_SESSION_REFUSED", message });
    previewRefusal(text, message);
  });

  test("retains an explicitly ignorable unknown event with a visible count and interpretation loss", () => {
    const text = jsonl([header, { type: "synthetic/future-ignorable", seq: 0, time: 1001, data: { note: "synthetic metadata" }, ignorable: true }]);
    const parsed = parseDetectedDshSession(text);
    expect(parsed?.events).toHaveLength(1);
    expect(parsed?.format.unknownIgnorableEvents).toBe(1);
    withSource(text, input => {
      const plan = validateNeutralImport(input);
      expect(plan.status).toBe("ready");
      expect(plan.warnings).toContain("1 unknown ignorable events are retained without interpretation.");
      expect(plan.normalization?.recordMapping?.counts).toMatchObject({ records: 2, mapped: 0, retainedOnly: 2 });
      expect(plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED" });
    });
  });

  test.each([0, 2])("reports exactly %i source-reported delivery-accepted markers without treating zero as deployment proof", count => {
    const deliveries = Array.from({ length: count }, (_, index) => ({ type: "session-log-deepseek/delivery-accepted", seq: index + 1, time: 1002 + index, data: { sessionId: header.id, sessionFormatVersion: 2, throughSeq: 0 } }));
    const text = jsonl([header, { type: "session/title", seq: 0, time: 1001, data: { title: "synthetic marker input" } }, ...deliveries]), parsed = parseDetectedDshSession(text);
    expect(parsed?.events.filter(event => event.type === "session-log-deepseek/delivery-accepted")).toHaveLength(count);
    if (!parsed) throw new Error("Expected synthetic DSH marker session");
    const warnings = dshSessionWarnings(parsed).filter(message => message.includes("delivery-accepted event(s)"));
    const expected = count === 0 ? [] : ["2 session-log-deepseek/delivery-accepted event(s): this DSH log reports that DeepSeek accepted uploaded session-log data. A deployment that must keep session logs local did not, for this session (source-reported)."];
    expect(warnings).toEqual(expected);
    withSource(text, input => {
      const plan = validateNeutralImport(input);
      expect(plan.status).toBe("ready");
      expect(plan.warnings.filter(message => message.includes("delivery-accepted event(s)"))).toEqual(expected);
      expect(plan.normalization?.counts.normalizedTraces).toBe(0);
      expect(plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED" });
    });
  });
});
