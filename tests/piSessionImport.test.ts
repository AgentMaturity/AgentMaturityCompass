import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runNeutralImport, validateNeutralImport } from "../src/importers/neutralImporter.js";

/**
 * AMC-1507 — a Pi v3 session imports with its failures and its shape intact.
 *
 * Pi (earendil-works/pi, session-format.md at b2602be7) writes one JSONL entry
 * per line: a `{"type":"session","version":3,...}` header, then tree-linked
 * entries (`id`/`parentId`). Conversation lives INSIDE `message`: a tool
 * failure is `message.isError`, a model failure is `message.stopReason:
 * "error"` (or `"aborted"`), tool/model identity is `message.toolName` /
 * `message.model`. The generic importer read only top-level keys, so all of
 * that vanished: the AMC-1506 five-row fixture produced a Watch failure index
 * with entryCount 0, every trace claimed a measured 0 ms, and parent/branch
 * ids were dropped.
 */

const roots: string[] = [];
const ISO = (n: number) => new Date(Date.UTC(2026, 8, 8, 0, 0, n)).toISOString();

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function writeSession(rows: unknown[], name = "pi-session.jsonl"): string {
  const dir = scratch("amc-pi-v3-");
  writeFileSync(join(dir, name), rows.map((row) => typeof row === "string" ? row : JSON.stringify(row)).join("\n") + "\n");
  return dir;
}

const header = (extra: Record<string, unknown> = {}) =>
  ({ type: "session", version: 3, id: "sess-1", timestamp: ISO(0), cwd: "/work", ...extra });
const user = (id: string, parentId: string | null, text: string, n: number) =>
  ({ type: "message", id, parentId, timestamp: ISO(n), message: { role: "user", content: text } });
const assistant = (id: string, parentId: string, n: number, message: Record<string, unknown>) =>
  ({ type: "message", id, parentId, timestamp: ISO(n), message: { role: "assistant", provider: "anthropic", model: "claude-x", content: [], ...message } });
const toolResult = (id: string, parentId: string, n: number, message: Record<string, unknown>) =>
  ({ type: "message", id, parentId, timestamp: ISO(n), message: { role: "toolResult", ...message } });

/** The AMC-1506 fixture: a failed tool call, then a model error. */
function failureSession(): unknown[] {
  return [
    header(),
    user("m1", null, "run the tests", 1),
    assistant("m2", "m1", 2, { stopReason: "toolUse", content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "npm test" } }] }),
    toolResult("m3", "m2", 3, { toolCallId: "call-1", toolName: "bash", isError: true, content: [{ type: "text", text: "npm ERR! 3 tests failed" }] }),
    assistant("m4", "m3", 4, { stopReason: "error", errorMessage: "rate limited" })
  ];
}

function importSession(rows: unknown[]) {
  const workspace = scratch("amc-pi-ws-");
  mkdirSync(join(workspace, ".amc"), { recursive: true });
  const inputPath = writeSession(rows);
  const result = runNeutralImport({ workspace, inputPath, agentId: "default", mode: "import" });
  const traceIndex = result.traceFailureIndex
    ? JSON.parse(readFileSync(result.traceFailureIndex.path, "utf8"))
    : null;
  const normalized = JSON.parse(readFileSync(result.normalizedPath!, "utf8"));
  return { workspace, result, traceIndex, normalized };
}

type Trace = { traceId: string; error?: boolean; errorMessage?: string; durationMs: number | null; metadata: Record<string, unknown> };
/** The traces the import derived, read back from the normalized artifact. */
function traces(normalized: any): Trace[] {
  return normalized.artifacts[0].traces as Trace[];
}

describe("AMC-1507 — Pi v3 session import", () => {
  test("nested tool and model failures reach the Watch failure index", () => {
    const { result, traceIndex } = importSession(failureSession());
    expect(result.plan.candidates[0]?.sourceFormat).toMatchObject({ name: "pi-session", version: 3 });
    expect(result.traceFailureIndex?.ref.entryCount).toBeGreaterThanOrEqual(2);
    const messages = JSON.stringify(traceIndex);
    expect(messages).toContain("npm ERR! 3 tests failed");
    expect(messages).toContain("rate limited");
  });

  test("tool-call ids, tool names, provider/model and entry/parent ids are preserved", () => {
    const { normalized } = importSession(failureSession());
    const rows = traces(normalized);
    const tool = rows.find((t) => t.metadata.role === "toolResult")!;
    expect(tool.error).toBe(true);
    expect(tool.metadata).toMatchObject({ toolCallId: "call-1", tool: "bash", entryId: "m3", parentId: "m2" });
    const model = rows.find((t) => t.metadata.entryId === "m4")!;
    expect(model.error).toBe(true);
    expect(model.errorMessage).toBe("rate limited");
    expect(model.metadata).toMatchObject({ model: "claude-x", providerId: "anthropic", stopReason: "error", parentId: "m3" });
  });

  test("missing timing is unknown, never a measured zero", () => {
    const { normalized } = importSession(failureSession());
    for (const row of traces(normalized)) {
      expect(row.durationMs).toBeNull();
    }
  });

  test("structural entries stay metadata: no trace, no invented execution", () => {
    const rows = [
      header(),
      { type: "session_info", id: "s1", parentId: null, timestamp: ISO(1), name: "my session" },
      { type: "model_change", id: "s2", parentId: "s1", timestamp: ISO(2), provider: "openai", modelId: "gpt-x" },
      { type: "thinking_level_change", id: "s3", parentId: "s2", timestamp: ISO(3), thinkingLevel: "high" },
      user("m1", "s3", "hi", 4),
      assistant("m2", "m1", 5, { stopReason: "stop", content: [{ type: "text", text: "hello" }] }),
      { type: "label", id: "s4", parentId: "m2", timestamp: ISO(6), targetId: "m2", label: "greeting" },
      { type: "compaction", id: "s5", parentId: "s4", timestamp: ISO(7), summary: "…", firstKeptEntryId: "m1", tokensBefore: 10 },
      { type: "custom", id: "s6", parentId: "s5", timestamp: ISO(8), customType: "ext", data: {} }
    ];
    const { result, normalized } = importSession(rows);
    const rowsOut = traces(normalized);
    expect(rowsOut.map((t) => t.metadata.entryId)).toEqual(["m2"]);
    expect(rowsOut[0]!.error).toBeFalsy();
    expect(result.plan.candidates[0]!.sourceFormat).toMatchObject({
      entries: { message: 2, structural: 6 }
    });
  });

  test("a discarded branch is kept as data but marked off the current path", () => {
    const rows = [
      header(),
      user("m1", null, "first", 1),
      assistant("m2", "m1", 2, { stopReason: "stop", content: [{ type: "text", text: "A" }] }),
      assistant("m3", "m2", 3, { stopReason: "error", errorMessage: "boom" }),
      // /branch back to m1: the next append hangs off m1, so m2/m3 leave the current path
      { type: "branch_summary", id: "b1", parentId: "m1", timestamp: ISO(4), fromId: "m3", summary: "abandoned attempt" },
      assistant("m4", "b1", 5, { stopReason: "stop", content: [{ type: "text", text: "B" }] })
    ];
    const { result, normalized } = importSession(rows);
    const byId = Object.fromEntries(traces(normalized).map((t) => [t.metadata.entryId as string, t]));
    expect(byId.m2!.metadata.onCurrentPath).toBe(false);
    expect(byId.m3!.metadata.onCurrentPath).toBe(false);
    expect(byId.m4!.metadata.onCurrentPath).toBe(true);
    // The failure on the abandoned branch still happened, and is still counted.
    expect(result.traceFailureIndex?.ref.entryCount).toBeGreaterThanOrEqual(1);
    expect(result.plan.candidates[0]!.sourceFormat).toMatchObject({
      branch: { leafEntryId: "m4", offPathEntries: 2, branchPoints: ["m1"] }
    });
  });

  test("a forked session keeps its parent provenance", () => {
    const rows = [header({ parentSession: "/sessions/original.jsonl" }), user("m1", null, "hi", 1),
      assistant("m2", "m1", 2, { stopReason: "stop", content: [{ type: "text", text: "yo" }] })];
    const { result, normalized } = importSession(rows);
    expect(result.plan.candidates[0]!.sourceFormat).toMatchObject({ branch: { forkedFrom: "/sessions/original.jsonl" } });
    expect(traces(normalized)[0]!.metadata.sessionParent).toBe("/sessions/original.jsonl");
  });

  test("aborted counts as a failure; length-truncated is flagged, not failed", () => {
    const rows = [header(), user("m1", null, "go", 1),
      assistant("m2", "m1", 2, { stopReason: "aborted", content: [{ type: "text", text: "partial" }] }),
      assistant("m3", "m2", 3, { stopReason: "length", content: [{ type: "text", text: "very long…" }] })];
    const { normalized } = importSession(rows);
    const byId = Object.fromEntries(traces(normalized).map((t) => [t.metadata.entryId as string, t]));
    expect(byId.m2!.error).toBe(true);
    expect(byId.m2!.metadata.stopReason).toBe("aborted");
    expect(byId.m3!.error).toBeFalsy();
    expect(byId.m3!.metadata.truncated).toBe(true);
  });

  test("malformed entries are counted and flagged, never silently dropped", () => {
    const rows = [header(), user("m1", null, "hi", 1),
      '{"type":"message","parentId":"m1","timestamp":"x","message":{"role":"assistant"}}',   // no id
      "this is not json",
      assistant("m2", "m1", 2, { stopReason: "stop", content: [{ type: "text", text: "ok" }] })];
    const { result, normalized } = importSession(rows);
    expect(result.plan.candidates[0]!.sourceFormat).toMatchObject({ malformedEntries: 2 });
    expect(result.plan.warnings.join("\n")).toMatch(/2 malformed/);
    expect(traces(normalized).map((t) => t.metadata.entryId)).toEqual(["m2"]);
  });

  test("an unsupported session version is rejected explicitly, with no generic fallback", () => {
    const workspace = scratch("amc-pi-ws-");
    for (const version of [1, 2, 4]) {
      const inputPath = writeSession([header({ version }), user("m1", null, "hi", 1)]);
      const plan = validateNeutralImport({ workspace, inputPath, agentId: "default" });
      expect(plan.status).toBe("unsupported");
      expect(plan.unsupported[0]?.reason).toMatch(new RegExp(`version ${version}`));
      expect(() => runNeutralImport({ workspace, inputPath, agentId: "default", mode: "import" })).toThrow(/Unsupported import/);
    }
  });

  test("an invalid version value produces a useful diagnostic without echoing source values", () => {
    const secret = "synthetic-version-secret-never-render";
    const workspace = scratch("amc-pi-ws-");
    for (const version of [secret, { private: secret }]) {
      const inputPath = writeSession([header({ version }), user("m1", null, "hi", 1)]);
      const plan = validateNeutralImport({ workspace, inputPath, agentId: "default" });
      expect(plan.status).toBe("unsupported");
      expect(plan.unsupported[0]?.reason).toContain("invalid version field");
      expect(JSON.stringify(plan)).not.toContain(secret);
      expect(plan.candidates).toEqual([]);
    }
  });

  test("provenance stays self-reported and redacted, with the source digest", () => {
    const rows = [header(), user("m1", null, "key sk-testsecret123456 please", 1),
      assistant("m2", "m1", 2, { stopReason: "stop", content: [{ type: "text", text: "no" }] })];
    const { result, normalized } = importSession(rows);
    const report = JSON.parse(readFileSync(result.diagnosticReportPath!, "utf8"));
    expect(report.evidenceTrustCoverage).toEqual({ observed: 0, attested: 0, selfReported: 1 });
    expect(JSON.stringify(normalized)).not.toContain("sk-testsecret123456");
    expect(result.plan.candidates[0]!.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
