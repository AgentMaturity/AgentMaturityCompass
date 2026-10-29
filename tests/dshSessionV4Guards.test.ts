import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DSH_IMPORT_LIMITS } from "../src/importers/dshSessionContract.js";
import { parseDetectedDshSessionV4, sanitizeDshSessionV4 } from "../src/importers/dshSessionImportV4.js";
import { SourceFormatError } from "../src/importers/sourceFormatError.js";
const fixture = readFileSync(new URL("./fixtures/dsh-v4/session.jsonl", import.meta.url), "utf8");
const rows = (): Record<string, any>[] => fixture.trim().split("\n").map(line => JSON.parse(line));
const parse = (values: unknown[]) => parseDetectedDshSessionV4(values.map(value => JSON.stringify(value)).join("\n"));
function refusal(values: unknown[], reason: RegExp) {
  let error: unknown; try { parse(values); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(SourceFormatError);
  expect((error as Error).message).toMatch(reason);
}
describe("DSH v4 fail-closed guards", () => {
  test("physical header", () => { const values = rows(); values[0]!.cwd = "relative"; refusal(values, /cwd must be absolute/); });
  test("dense event sequence", () => { const values = rows(); values[2]!.seq = 90; refusal(values, /noncontiguous/); });
  test("unknown required vocabulary", () => { const values = rows(); values[9]!.type = "future/required"; refusal(values, /unknown required/); });
  test("canonical source ranges", () => { const values = rows(); values[8]!.sourceEventSeqs = [[1, 2], 0]; refusal(values, /source/); });
  test("past source references", () => { const values = rows(); values[8]!.sourceEventSeqs = [7]; refusal(values, /source relationship/); });
  test("surface placement", () => { const values = rows(); delete values[8]!.surfaceOp; refusal(values, /surface operation/); });
  test("log-only surface metadata", () => { const values = rows(); values[9]!.surfaceOp = "append"; refusal(values, /log-only/); });
  test("replacement provenance", () => { const values = rows(); values[8]!.surfaceOp = { op: "replace", startSeq: 5, endSeq: 5 }; refusal(values, /replacement/); });
  test("seed agreement", () => { const values = rows(); values[0]!.isSeeded = false; refusal(values, /seeded/); });
  test("tool-role identity", () => { const values = rows(); values[8]!.data.message.toolCallId = "foreign"; refusal(values, /correlation/); });
  test("tool error metadata", () => { const values = rows(); values[8]!.data.message.isError = false; refusal(values, /error metadata/); });
  test("duplicate append settlement", () => { const values = rows(); values.push({ ...structuredClone(values[8]), seq: values.length - 1 }); refusal(values, /duplicate tool result/); });
  test("reversed call identity", () => { const values = rows(); values.push({ ...structuredClone(values[7]), seq: values.length - 1 }); refusal(values, /duplicate or reversed/); });
  test("child self relationship", () => { const values = rows(); values[9]!.data.childId = values[0]!.id; refusal(values, /own session/); });
  test("child catalog shape", () => { const values = rows(); values[9]!.data.label = 3; refusal(values, /catalog/); });
  test("duplicate live child", () => { const values = rows(); values.push({ ...structuredClone(values[9]), seq: values.length - 1 }); refusal(values, /duplicate live child/); });
  test("attempt operational identity", () => { const values = rows(); values.push({ type: "assistant/attempt", seq: values.length - 1, time: 40, data: { stream: [] } }); refusal(values, /turn\/step identity/); });
  test("old producer source refused", () => { const values = rows(); values[6]!.data.source = { kind: "plugin", plugin: "old" }; refusal(values, /producer source/); });
  test("redaction relation identity", () => {
    const parsed = parse(rows())!, safeRows = structuredClone(parsed.rows) as Record<string, any>[];
    safeRows[0]!.parentSession = "[REDACTED]"; safeRows[8]!.data.message.toolCallId = "[REDACTED]";
    const safe = sanitizeDshSessionV4(parsed, safeRows, value => ["parent", "call-1"].includes(value) ? "[REDACTED]" : value);
    expect(safe.format.parentSession).toMatch(/^dsh-v4-redacted-/);
    expect((safe.events[7]!.data as any).message.toolCallId).toBe((safe.events[6]!.data as any).callId);
    expect(() => sanitizeDshSessionV4(parsed, [], value => value)).toThrow(/row count/);
  });
  test.each(["bytes", "lineBytes", "depth", "expandedMembers", "events"] as const)("bounded %s", key => {
    const old = DSH_IMPORT_LIMITS[key];
    try { (DSH_IMPORT_LIMITS as Record<string, number>)[key] = 1; expect(() => parse(rows())).toThrow(SourceFormatError); }
    finally { (DSH_IMPORT_LIMITS as Record<string, number>)[key] = old; }
  });
});
