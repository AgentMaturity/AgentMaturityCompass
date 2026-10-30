import { createHash } from "node:crypto";
import { zstdCompressSync, constants } from "node:zlib";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseDetectedDshSessionV4, dshSessionTracesV4 } from "../src/importers/dshSessionImportV4.js";
import { parseDetectedDshSession } from "../src/importers/dshSessionImport.js";
import { runNeutralImport, validateNeutralImport } from "../src/importers/neutralImporter.js";

const fixture = readFileSync(new URL("./fixtures/dsh-v4/session.jsonl", import.meta.url), "utf8");
const sourceRows = () => fixture.trim().split("\n").map(line => JSON.parse(line) as Record<string, any>);
function preview(rows: unknown[], assertion: (plan: ReturnType<typeof validateNeutralImport>, input: { workspace: string; inputPath: string }) => void) {
  const root = mkdtempSync(join(tmpdir(), "amc-dsh-v4-"));
  const input = { workspace: join(root, "workspace"), inputPath: join(root, "session.jsonl") };
  mkdirSync(input.workspace);
  writeFileSync(input.inputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  try { assertion(validateNeutralImport(input), input); } finally { rmSync(root, { recursive: true, force: true }); }
}
describe("WP26 explicit DSH v4 mapping", () => {
  test("imports native tool roles, inherited cuts and child lineage with unchanged trust", () => {
    preview(sourceRows(), (plan, input) => {
      expect(plan.status).toBe("ready");
      expect(plan.candidates[0]?.sourceFormat).toMatchObject({ name: "dsh-session", version: 4, sourceRevision: "22ddee3792402c3e70ec5f86a63c3e3e895a2f60", inheritedEventCount: 2, sourceTrust: "SELF_REPORTED", evaluationStatus: "NOT_EVALUATED" });
      expect(plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED" });
      expect(plan.normalization?.recordMapping?.counts).toMatchObject({ unlinkedTraces: 0 });
      const result = runNeutralImport({ ...input, mode: "dry-run" });
      expect(result.applied).toBe(false);
      expect(plan.warnings.join(" ")).toContain("child");
    });
  });
  test("keeps source failure/cancellation, missing results, shadowed surface and raw source references", () => {
    const rows = sourceRows();
    rows.push({ type: "tool/call", seq: rows.length - 1, time: 40, data: { turn: 3, step: 1, callId: "unfinished", name: "read", arguments: "{}" } });
    const parsed = parseDetectedDshSessionV4(rows.map(row => JSON.stringify(row)).join("\n"))!;
    const traces = dshSessionTracesV4(parsed, { agentId: "default", source: "fixture" });
    expect(traces.map(trace => trace.metadata.entryId)).toEqual([7, 10, 11]);
    expect(traces[0]).toMatchObject({ agentType: "dsh-tool", error: true, timestamp: 17, durationMs: null,
      metadata: { toolCallId: "call-1", callEventSeq: 6, parentSession: "parent", sourceTrust: "SELF_REPORTED", evaluationStatus: "NOT_EVALUATED", onCurrentSurface: true } });
    expect(traces[1]).toMatchObject({ error: true, metadata: { cancelled: true, sourceReason: { reason: { kind: "parent" } } } });
    expect(traces[2]).toMatchObject({ output: null, metadata: { outcome: "unknown", missingResult: true } });
    expect(traces[2]).not.toHaveProperty("error");
    expect(parsed.format.childSessionIds).toEqual(["child"]);
  });
  test("imports checksummed compressed v4 with original-byte digest and refuses corruption and historical compression", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-dsh-v4-zstd-"));
    const workspace = join(root, "workspace"), inputPath = join(root, "session.jsonl.zstd"); mkdirSync(workspace);
    const frame = (text: string) => zstdCompressSync(text, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
    const lines = fixture.trimEnd().split("\n"), raw = Buffer.concat([frame(lines[0]! + "\n"), frame(lines.slice(1).join("\n") + "\n")]);
    try {
      writeFileSync(inputPath, raw);
      const plan = validateNeutralImport({ workspace, inputPath });
      expect(plan.status).toBe("ready");
      expect(plan.candidates[0]).toMatchObject({ digest: createHash("sha256").update(raw).digest("hex"), bytes: raw.length, sourceFormat: { version: 4 } });
      expect(plan.normalization?.recordMapping?.counts.unlinkedTraces).toBe(0);
      expect(runNeutralImport({ workspace, inputPath, mode: "import", retainOriginals: false }).originals?.[0]?.mediaType).toBe("application/zstd");
      const bad = Buffer.from(raw); bad[bad.length - 1]! ^= 1; writeFileSync(inputPath, bad);
      const refused = validateNeutralImport({ workspace, inputPath });
      expect(refused.status).toBe("unsupported"); expect(refused.unsupported[0]?.reason).toContain("checksum");
      writeFileSync(inputPath, Buffer.concat([frame(lines[0]!.replace('"version":4', '"version":2') + "\n"), frame(lines.slice(1).join("\n") + "\n")]));
      expect(validateNeutralImport({ workspace, inputPath }).unsupported[0]?.reason).toContain("explicitly supported DSH v4");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  test("never reinterprets v4 through the pinned v2 decoder", () => {
    expect(() => parseDetectedDshSession(fixture)).toThrow(/DSH session format v4 is not supported/);
    const rows = sourceRows(); rows[0]!.version = 5;
    preview(rows, plan => { expect(plan.status).toBe("unsupported"); expect(plan.unsupported[0]?.reason).toContain("v5"); });
  });
  test("refuses historical tool wrappers under a v4 header", () => {
    const rows = sourceRows(); rows[8]!.data.message.role = "user";
    preview(rows, plan => { expect(plan.status).toBe("unsupported"); expect(plan.unsupported[0]?.reason).toContain("tool-role"); });
  });
  test("retains unknown ignorable events with explicit loss and refuses unknown required ones", () => {
    const rows = sourceRows(); rows.push({ type: "future/opaque", seq: rows.length - 1, time: 30, data: {}, ignorable: true });
    preview(rows, plan => { expect(plan.status).toBe("ready"); expect(plan.warnings.join(" ")).toContain("unknown ignorable"); });
    delete rows.at(-1)!.ignorable;
    preview(rows, plan => { expect(plan.status).toBe("unsupported"); expect(plan.unsupported[0]?.reason).toContain("unknown required"); });
  });
  test("validates surface node references and requires complete replacement provenance", () => {
    const rows = sourceRows(); rows.push({ type: "user/message", seq: rows.length - 1, time: 30, data: { id: "replacement", role: "user", source: { kind: "dsh-compaction" }, content: [] }, surfaceOp: { op: "replace", startSeq: 5, endSeq: 7 }, sourceEventSeqs: [[5, 7]] });
    preview(rows, plan => { expect(plan.status).toBe("ready"); });
    rows.at(-1)!.sourceEventSeqs = [7, 5];
    preview(rows, plan => { expect(plan.status).toBe("ready"); });
    rows.at(-1)!.sourceEventSeqs = [5];
    preview(rows, plan => { expect(plan.status).toBe("unsupported"); expect(plan.unsupported[0]?.reason).toContain("replacement"); });
  });
  test("refuses missing/negative identities on attempt, system and developer events", () => {
    for (const type of ["assistant/attempt", "system/message", "developer/message"]) {
      const rows = sourceRows();
      const data = type === "assistant/attempt" ? { stream: [] } : { message: { id: "m", role: type.split("/")[0], source: { kind: "dsh-test" }, content: [] } };
      rows.push({ type, seq: rows.length - 1, time: 30, data, ...(type === "assistant/attempt" ? {} : { surfaceOp: "append" }) });
      preview(rows, plan => { expect(plan.status).toBe("unsupported"); expect(plan.unsupported[0]?.reason).toContain("identity"); });
    }
  });
  test("retains tool-result surface repairs without manufacturing a second execution", () => {
    const rows = sourceRows();
    rows.push({ ...structuredClone(rows[8]), seq: rows.length - 1, time: 40, sourceEventSeqs: [7], surfaceOp: { op: "replace", startSeq: 7, endSeq: 7 } });
    preview(rows, plan => { expect(plan.status).toBe("ready"); expect(plan.normalization?.counts.normalizedTraces).toBe(2); });
    const parsed = parseDetectedDshSessionV4(rows.map(row => JSON.stringify(row)).join("\n"))!;
    expect(dshSessionTracesV4(parsed, { agentId: "default", source: "fixture" })[0]?.metadata.onCurrentSurface).toBe(false);
    expect(parsed.format.surfaceEventSeqs).toEqual([5, 11]);
  });
  test("refuses contradictory seed markers, malformed sequence and tool error metadata", () => {
    for (const mutate of [
      (rows: Record<string, any>[]) => { rows[0]!.isSeeded = false; },
      (rows: Record<string, any>[]) => { rows[4]!.seq = 99; },
      (rows: Record<string, any>[]) => { rows[8]!.data.message.isError = false; }
    ]) { const rows = sourceRows(); mutate(rows); preview(rows, plan => { expect(plan.status).toBe("unsupported"); }); }
  });
});
