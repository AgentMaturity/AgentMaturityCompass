import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { runNeutralImport, validateNeutralImport } from "../src/importers/neutralImporter.js";
import { sha256Hex } from "../src/utils/hash.js";

const roots: string[] = [];
const when = "2026-09-08T04:00:00.000Z";
const header = { type: "session", version: 3, id: "session", timestamp: when, cwd: "/synthetic" };
const user = { type: "message", id: "u", parentId: null, timestamp: when, message: { role: "user", content: "test" } };
const failure = { type: "message", id: "a", parentId: "u", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "synthetic provider failure" } };
function fixture(rows: unknown[]) {
  const workspace = mkdtempSync(join(tmpdir(), "amc-pi-boundaries-"));
  roots.push(workspace);
  const inputPath = join(workspace, "session.jsonl");
  writeFileSync(inputPath, rows.map((row) => JSON.stringify(row)).join("\n"));
  return { workspace, inputPath, agentId: "default" };
}
function imported(rows: unknown[]) {
  const result = runNeutralImport({ ...fixture(rows), mode: "import" });
  return {
    result,
    normalized: JSON.parse(readFileSync(result.normalizedPath!, "utf8")),
    index: JSON.parse(readFileSync(result.traceFailureIndex!.path, "utf8")),
    report: JSON.parse(readFileSync(result.diagnosticReportPath!, "utf8"))
  };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }); });

test.each([
  { entries: [{ ...failure, parentId: "a" }] },
  { entries: [{ ...failure, parentId: "b" }, { type: "custom", id: "b", parentId: "a" }] }
])("cyclic ancestry is refused within a bounded subprocess", ({ entries }) => {
  const options = fixture([header, ...entries]);
  const code = `import {parsePiSession,piSessionTraces} from ${JSON.stringify(join(process.cwd(), "src/importers/piSessionImport.ts"))};
    import {validateNeutralImport,runNeutralImport} from ${JSON.stringify(join(process.cwd(), "src/importers/neutralImporter.ts"))};
    try { const p=parsePiSession(${JSON.stringify([header, ...entries].map((row) => JSON.stringify(row)).join("\n"))});
      piSessionTraces(p.rows,p.format,{agentId:'default',source:'fixture'}); console.log('accepted');
    } catch (error) { console.log(error.message); }
    console.log(JSON.stringify(validateNeutralImport(${JSON.stringify(options)})));
    try {runNeutralImport({...${JSON.stringify(options)},mode:'import'}); console.log('accepted');} catch(error) {console.log(error.message);}`;
  const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], { encoding: "utf8", timeout: 1800 });
  expect(output).toMatch(/cyclic|cycle/i);
  expect(output).toContain('"status":"unsupported"');
  expect(output).not.toContain("accepted");
});

test("duplicate entry IDs are explicitly unsupported with no generic fallback", () => {
  const options = fixture([header, user, { ...user, message: { role: "user", content: "second identity" } }, failure]);
  const plan = validateNeutralImport(options);
  expect(plan.status).toBe("unsupported");
  expect(plan.unsupported[0]?.reason).toMatch(/duplicate/i);
  expect(() => runNeutralImport({ ...options, mode: "import" })).toThrow(/Unsupported import/);
});

test("sanitized header, entry and tool IDs preserve unique ancestry without leaking source secrets", () => {
  const first = "sk-firstentry123456";
  const second = "sk-secondentry123456";
  const callId = "sk-toolcall123456";
  const rows = [
    { ...header, id: "sk-session123456", parentSession: "/sessions/sk-parent123456.jsonl" },
    { ...user, id: first },
    { ...user, id: second, parentId: first },
    { ...failure, id: "caller", parentId: second, timestamp: when, message: { role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id: callId, name: "bash", arguments: { command: "echo safe" } }] } },
    { type: "message", id: "result", parentId: "caller", timestamp: when, message: { role: "toolResult", toolCallId: callId, isError: true, content: [{ type: "text", text: "synthetic tool failure" }] } }
  ];
  const { result, normalized, index, report } = imported(rows);
  const published = JSON.stringify({ plan: result.plan, normalized, index, report });
  for (const secret of [first, second, callId, "sk-session123456", "sk-parent123456"]) expect(published).not.toContain(secret);
  const data = normalized.artifacts[0].data;
  expect(data[1].id).not.toBe(data[2].id);
  expect(data[2].parentId).toBe(data[1].id);
  expect(data[3].parentId).toBe(data[2].id);
  expect(data[4].message.toolCallId).toBe(data[3].message.content[0].id);
  const tool = normalized.artifacts[0].traces.find((trace: any) => trace.metadata.role === "toolResult");
  expect(tool.metadata.tool).toBe("bash");
  expect(tool.metadata.toolCallId).toBe(data[4].message.toolCallId);
  expect(tool.input).toEqual({ command: "echo safe" });
  const format = result.plan.candidates[0]?.sourceFormat;
  expect(format?.name).toBe("pi-session");
  if (format?.name !== "pi-session") throw new Error("Expected the Pi parser's source format for this fixture");
  expect(format.branch.currentPathLength).toBe(4);
});

test("reserved safe-ID collisions and structural references preserve identity while malformed fields stay redacted", () => {
  const secret = "sk-branchentry123456";
  const reserved = `pi-redacted-entry-${sha256Hex(`AMC_PI_ID_V1\0entry\0${secret}`)}`;
  const { normalized, result } = imported([
    header, { ...user, id: secret }, { ...user, id: reserved, parentId: secret },
    { type: "branch_summary", id: "branch", parentId: secret, fromId: reserved, summary: "branch" },
    { type: "compaction", id: "compact", parentId: "branch", firstKeptEntryId: reserved },
    { type: "label", id: "label", parentId: "compact", targetId: secret, label: "note" },
    { ...failure, parentId: "label", timestamp: when },
    { type: "custom", id: { value: "sk-malformedsecret123456" }, parentId: "a" }
  ]);
  const rows = normalized.artifacts[0].data;
  expect(rows[1].id).not.toBe(rows[2].id);
  expect(rows[3].fromId).toBe(rows[2].id);
  expect(rows[4].firstKeptEntryId).toBe(rows[2].id);
  expect(rows[5].targetId).toBe(rows[1].id);
  expect(JSON.stringify({ normalized, plan: result.plan })).not.toContain(secret);
  expect(JSON.stringify(normalized)).not.toContain("sk-malformedsecret123456");
  const format = result.plan.candidates[0]?.sourceFormat;
  expect(format?.name).toBe("pi-session");
  if (format?.name !== "pi-session") throw new Error("Expected the Pi parser's source format for this fixture");
  expect(format.branch.branchPoints).toEqual([rows[1].id]);
});

test.each([undefined, "not-a-time", "2026-02-30T00:00:00.000Z", "2026-09-08T24:00:00.000Z", 1e100])("unknown/invalid source time %s preserves the failure without invented chronology", (timestamp) => {
  const { result, normalized, index, report } = imported([header, user, { ...failure, timestamp }]);
  expect(normalized.artifacts[0].traces[0].timestamp).toBeNull();
  expect(index.entries).toHaveLength(1);
  expect(index.entries[0].timestamp).toBeNull();
  expect(index.clusters[0].firstSeenAt).toBeNull();
  expect(index.clusters[0].lastSeenAt).toBeNull();
  expect(result.plan.warnings.join(" ")).toMatch(/time.*unknown|unknown.*time/i);
  expect(report.evidenceTrustCoverage).toEqual({ observed: 0, attested: 0, selfReported: 1 });
  expect(report.verificationPassed).toBe(false);
  expect(report.questionScores).toEqual([]);
});

test.each([0, when, Date.parse(when)])("valid source timestamp %s is retained, including an explicitly recorded epoch", (timestamp) => {
  const { normalized } = imported([header, user, { ...failure, timestamp }]);
  expect(normalized.artifacts[0].traces[0].timestamp).toBe(typeof timestamp === "string" ? Date.parse(timestamp) : timestamp);
});

test("an orphan retains its failure with incomplete ancestry and no inferred user input", () => {
  const { result, normalized } = imported([header, user, { ...failure, parentId: "missing", timestamp: when }]);
  expect(result.plan.warnings.join(" ")).toMatch(/ancestry|parent/i);
  expect(normalized.artifacts[0].traces[0].input).toBeNull();
  expect(normalized.artifacts[0].traces[0].metadata.ancestryComplete).toBe(false);
  expect(result.traceFailureIndex?.ref.entryCount).toBe(1);
});
