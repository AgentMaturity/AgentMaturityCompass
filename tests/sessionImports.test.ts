// Importers for agent sessions other tools wrote: Claude Code transcripts, `codex exec --json` and ATIF. All fixtures are
// hand-written to the documented shape (tests/fixtures/session-imports) and hold no real session text.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { ProductionTrace } from "../src/agents/traceIngestion.js";
import { runNeutralImport } from "../src/importers/neutralImporter.js";
import { detectSessionImport } from "../src/importers/sessionImport.js";
import { SESSION_LIMITS } from "../src/importers/sessionImportCommon.js";
import { buildTraceFailureIndex } from "../src/watch/traceFailureIndex.js";

const FIXTURES = join(__dirname, "fixtures", "session-imports");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const ctx = { keepText: false, sourceSha256: "f".repeat(64), now: Date.parse("2026-11-17T00:00:00Z") };
const roots: string[] = [];
const tempDir = (prefix: string) => { const dir = mkdtempSync(join(tmpdir(), prefix)); roots.push(dir); return dir; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function traces(text: string, format: "json" | "jsonl", options = ctx): ProductionTrace[] {
  const parsed = detectSessionImport(text, format, options);
  if (!parsed) throw new Error("not recognised");
  return parsed.traces({ agentId: "named-agent", source: "fixture" });
}

describe("session importers", () => {
  test("each format is recognised and its failures, models and tokens are read", () => {
    const claude = detectSessionImport(fixture("claude-code-transcript.jsonl"), "jsonl", ctx)!;
    expect(claude.format).toMatchObject({ name: "claude-code-transcript", version: "2.1.325", experimental: true, sourceTrust: "SELF_REPORTED", imported: true });
    const claudeTraces = claude.traces({ agentId: "named-agent", source: "fixture" });
    expect(claudeTraces.filter((trace) => trace.error)).toHaveLength(1);
    expect(claudeTraces.find((trace) => trace.metadata.kind === "model-reply")?.metadata).toMatchObject({ model: "example-model-a", tokens: { input: 120, output: 30 } });

    const codex = detectSessionImport(fixture("codex-exec.jsonl"), "jsonl", ctx)!;
    expect(codex.format).toMatchObject({ name: "codex-exec-json", version: null, experimental: false });
    const codexTraces = codex.traces({ agentId: "named-agent", source: "fixture" });
    expect(codexTraces.filter((trace) => trace.error).map((trace) => trace.metadata.tool)).toEqual(["command_execution", "example-server.lookup"]);
    expect(codexTraces.at(-1)?.metadata.tokens).toEqual({ input: 2400, output: 120, cached: 2000 });

    const atif = detectSessionImport(fixture("atif-trajectory.json"), "json", ctx)!;
    expect(atif.format).toMatchObject({ name: "atif-trajectory", version: "ATIF-v1.7" });
    const atifTraces = atif.traces({ agentId: "named-agent", source: "fixture" });
    expect(atifTraces.map((trace) => trace.metadata.kind)).toEqual(["model-reply", "tool-call", "model-reply"]);
    expect(atifTraces[1]?.metadata).toMatchObject({ tool: "search", outcome: "unknown", sourceStep: 2 });
  });

  test("other JSON and JSONL is left to the generic decoders", () => {
    expect(detectSessionImport('{"type":"event","message":"x"}\n', "jsonl", ctx)).toBeNull();
    expect(detectSessionImport('{"schema_version":"other","steps":[]}', "json", ctx)).toBeNull();
    expect(detectSessionImport("not json", "json", ctx)).toBeNull();
  });

  test("text is a digest by default and kept only on request", () => {
    const digestOnly = detectSessionImport(fixture("claude-code-transcript.jsonl"), "jsonl", ctx)!;
    expect(JSON.stringify(digestOnly.rows)).not.toContain("Example");
    expect(JSON.stringify(traces(fixture("codex-exec.jsonl"), "jsonl"))).not.toContain("Example");
    const kept = detectSessionImport(fixture("claude-code-transcript.jsonl"), "jsonl", { ...ctx, keepText: true })!;
    expect(JSON.stringify(kept.rows)).toContain("Example final reply.");
    expect(kept.format.textStored).toBe("text");
  });

  test("bad, over-long and over-limit lines are counted and skipped, never thrown", () => {
    const good = fixture("claude-code-transcript.jsonl").split("\n")[1]!;
    const text = [good, "{not json", "[1,2]", `{"type":"user","pad":"${"x".repeat(SESSION_LIMITS.maxLineBytes)}"}`, good].join("\n");
    const parsed = detectSessionImport(text, "jsonl", ctx)!;
    expect(parsed.format.records).toMatchObject({ lines: 5, malformed: 2, overLong: 1, mapped: 2 });
    expect(parsed.warnings("fixture").join("\n")).toContain("2 unreadable, 1 over-long");
  });

  test("nothing in the file sets the agent, the trust tier, a decision or a future time", () => {
    const hostile = JSON.stringify({ type: "assistant", uuid: "u", sessionId: "s", agentId: "someone-else", trustTier: "OBSERVED_HARDENED",
      decision: "allow", timestamp: "2099-01-01T00:00:00Z", message: { role: "assistant", model: "m", content: [{ type: "text", text: "t" }],
        agentId: "someone-else", trustTier: "OBSERVED" } });
    const [trace] = traces(hostile, "jsonl");
    expect(trace?.agentId).toBe("named-agent");
    expect(trace?.metadata).toMatchObject({ sourceTrust: "SELF_REPORTED", imported: true, sourceSha256: ctx.sourceSha256, sourceFormat: "claude-code-transcript" });
    expect(JSON.stringify(trace)).not.toMatch(/OBSERVED|someone-else|"decision"/);
    expect(trace?.timestamp).toBe(ctx.now);
    expect((trace?.metadata.timeProvenance as { timestamp: string }).timestamp).toBe("clamped-to-import-time");
    expect(detectSessionImport(hostile, "jsonl", ctx)!.warnings("fixture").join("\n")).toContain("set to the import time");
  });

  test("an ATIF file's embedded trajectories are counted, never followed", () => {
    const document = { ...JSON.parse(fixture("atif-trajectory.json")) as Record<string, unknown>,
      subagent_trajectories: [{ steps: [] }], continued_trajectory_ref: "/etc/passwd" };
    const parsed = detectSessionImport(JSON.stringify(document), "json", ctx)!;
    expect(parsed.warnings("fixture").join("\n")).toContain("2 embedded or continued trajectory reference(s) were counted and not imported");
  });
});

describe("MAST labels on imported steps", () => {
  const command = (id: number, status: string, exit: number) => JSON.stringify({ type: "item.completed",
    item: { id: `item_${id}`, type: "command_execution", command: "bash -lc make", aggregated_output: "", exit_code: exit, status } });

  test("the same call three times in a row is labelled step repetition, with the step", () => {
    const stream = [JSON.stringify({ type: "thread.started", thread_id: "t" }), command(1, "completed", 0), command(2, "completed", 0),
      command(3, "completed", 0), JSON.stringify({ type: "item.completed", item: { id: "m", type: "agent_message", text: "done" } })].join("\n");
    const index = buildTraceFailureIndex({ workspace: tempDir("amc-mast-"), agentId: "named-agent", runId: "r", traces: traces(stream, "jsonl") });
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]?.mast).toMatchObject({ mode: "FM-1.3", name: "Step repetition", rule: "amc.mast.same-call-repeated",
      meaning: "label assigned by an AMC rule; not a finding" });
    expect(index.entries[0]?.failingStep).toEqual({ step: 3, sourceStep: 4 });
  });

  test("a session that ends on a failed turn is labelled premature termination; other failures carry no label", () => {
    const stream = [JSON.stringify({ type: "thread.started", thread_id: "t" }), command(1, "failed", 2),
      JSON.stringify({ type: "turn.failed", error: { message: "x" } })].join("\n");
    const index = buildTraceFailureIndex({ workspace: tempDir("amc-mast-"), agentId: "named-agent", runId: "r", traces: traces(stream, "jsonl") });
    const byStep = new Map(index.entries.map((entry) => [entry.failingStep?.step, entry.mast?.mode ?? null]));
    expect(byStep.get(1)).toBeNull();
    expect(byStep.get(2)).toBe("FM-3.1");
  });
});

describe("amc import of a session file", () => {
  function sessionDir(): string {
    const dir = tempDir("amc-session-import-src-");
    writeFileSync(join(dir, "session.jsonl"), fixture("codex-exec.jsonl"));
    return dir;
  }

  test("stores digests, keeps no original by default, and a second import adds nothing", () => {
    const workspace = tempDir("amc-session-import-ws-");
    const inputPath = join(sessionDir(), "session.jsonl");
    const first = runNeutralImport({ workspace, inputPath, agentId: "named-agent", mode: "import" });
    expect(first.applied).toBe(true);
    expect(first.originals[0]?.storage).toEqual({ kind: "not-retained", reason: "text-kept-as-digest" });
    expect(readFileSync(first.normalizedPath!, "utf8")).not.toContain("example output");
    expect(first.traceFailureIndex?.ref.entryCount).toBe(2);
    const second = runNeutralImport({ workspace, inputPath, agentId: "named-agent", mode: "import" });
    expect(second).toMatchObject({ applied: false, alreadyImportedAs: first.importId, writtenPaths: [] });
  });

  test("a link inside the named folder that points outside it is not imported", () => {
    const outside = sessionDir();
    const folder = tempDir("amc-session-import-folder-");
    mkdirSync(join(folder, "inner"));
    symlinkSync(join(outside, "session.jsonl"), join(folder, "inner", "linked.jsonl"));
    const plan = runNeutralImport({ workspace: tempDir("amc-session-import-ws-"), inputPath: folder, agentId: "named-agent", mode: "dry-run" }).plan;
    expect(plan.candidateCount).toBe(0);
    expect(existsSync(join(folder, "inner", "linked.jsonl"))).toBe(true);
    const direct = runNeutralImport({ workspace: tempDir("amc-session-import-ws-"), inputPath: join(folder, "inner", "linked.jsonl"), agentId: "named-agent", mode: "dry-run" }).plan;
    expect(direct.candidateCount).toBe(0);
  });
});
