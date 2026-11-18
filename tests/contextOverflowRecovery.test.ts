/**
 * HP-05 on the real composed loop: the real AgentDriver, AutoCompactor, session writer, request seam and (for file
 * restore) the real fs tools behind the real pipeline seam. The model is the scripted stand-in; an overflow is the
 * provider's HTTP 400 with OpenAI-style "maximum context length" wording, classified by the real response classifier.
 * A pass here says nothing about a real provider or model.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { verifyAgentRun } from "../src/agent/runReport.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { getPublicKeyPem } from "../src/crypto/keys.js";
import { pinnedTrust } from "./helpers/trustContext.js";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pipelineToolSeam } from "../src/agent/pipelineToolSeam.js";
import { describeCompactionFollowUps, FILES_RESTORED_AUDIT, OVERFLOW_DECISION_AUDIT, RESTORE_MAX_FILES } from "../src/agent/compaction/compactionFollowUp.js";
import { SUMMARY_PROMPT_VERSION, SUMMARY_SECTIONS, summaryPrompt } from "../src/agent/compaction/summaryPrompt.js";
import type { AgentToolSeam, ToolCallRequest } from "../src/agent/toolSeam.js";
import type { CompactionConfig } from "../src/agent/loopTypes.js";
import type { RunLimits } from "../src/agent/runLimits.js";
import { bodyFromChunks, type HttpTransport } from "../src/llm/adapter/transport.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { validateSurfaceCompactions } from "../src/session/surfaceCompaction.js";
import { assertAutomaticProvenance, compactionReceipt, surfaceCompactionReceiptSchema } from "../src/session/surfaceCompactionValidation.js";
import { readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import type { EvidenceEvent } from "../src/types.js";
import { loopHarness, ok, silentTransport, StubToolSeam, textStep, toolStep, type LoopHarness, type ScriptedStream } from "./helpers/agentLoopHarness.js";

const OVERFLOW = JSON.stringify({ error: { type: "invalid_request_error", message: "This model's maximum context length is 10000 tokens." } });
const compaction = (extra: Partial<CompactionConfig> = {}): CompactionConfig => ({
  contextWindowTokens: 10_000, threshold: 0.8, reserveTokens: null, keepRecentSteps: 2, pruneMinBytes: 4096, summarize: false, maxPerTurn: 3, ...extra
});
const meta = (row: EvidenceEvent): Record<string, unknown> => JSON.parse(row.meta_json) as Record<string, unknown>;
const rowsOf = (rows: readonly EvidenceEvent[], type: string): EvidenceEvent[] => rows.filter(row => row.event_type === type);
const audits = (rows: readonly EvidenceEvent[], type: string): EvidenceEvent[] => rowsOf(rows, "audit").filter(row => meta(row).auditType === type);
const turnEnds = (rows: readonly EvidenceEvent[]) => rowsOf(rows, "turn/end").map(row => readTurnEndMeta(row.meta_json)!.reason);
const text = (h: LoopHarness, row: EvidenceEvent): string => {
  const read = readEventPayload(h.dir, row);
  if (read.status !== "ok") throw new Error(`payload ${row.id} is ${read.status}`);
  return read.bytes.toString("utf8");
};

interface Run { readonly h: LoopHarness; readonly sent: string[] }
const open: LoopHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) {
    try { h.finish(); } catch { /* already closed */ }
    rmSync(h.dir, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

/** Requests whose 1-based number is in `overflowAt` get the provider's overflow refusal (or `failures`' answer); `before` runs first. */
function run(scripts: readonly ScriptedStream[], overflowAt: readonly number[], options: {
  readonly tools?: (dir: string) => AgentToolSeam; readonly compaction?: Partial<CompactionConfig>;
  readonly before?: (request: number, dir: string) => void; readonly maxStepsPerTurn?: number;
  readonly failures?: Readonly<Record<number, readonly [number, string]>>; readonly runLimits?: RunLimits;
} = {}): Run {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-overflow-fixture");
  const sent: string[] = [];
  let dir = "";
  const transport: HttpTransport = async request => {
    sent.push(Buffer.from(request.body).toString("utf8"));
    options.before?.(sent.length, dir);
    const failure = options.failures?.[sent.length] ?? (overflowAt.includes(sent.length) ? [400, OVERFLOW] as const : null);
    return failure !== null
      ? { status: failure[0], headers: { "content-type": "application/json" }, body: bodyFromChunks([failure[1]]) }
      : silentTransport(request);
  };
  // The harness builds its driver from these options; a real seam needs the workspace first, so it is built lazily.
  let real: AgentToolSeam | undefined;
  const lazy: AgentToolSeam = {
    schemas: () => real!.schemas(), executionMode: request => real!.executionMode(request), execute: request => real!.execute(request),
    asksBeforeRunning: name => real!.asksBeforeRunning?.(name) ?? false
  };
  const h = loopHarness({ scripts, transport, ...(options.tools === undefined ? { tools: new StubToolSeam({ fixture: async () => ok("B".repeat(8192)) }) }
    : { tools: lazy as unknown as StubToolSeam }), ...(options.runLimits === undefined ? {} : { runLimits: { limits: options.runLimits } }), config: { compaction: compaction(options.compaction), ...(options.maxStepsPerTurn === undefined ? {} : { maxStepsPerTurn: options.maxStepsPerTurn }) } });
  dir = h.dir;
  if (options.tools !== undefined) real = options.tools(h.dir);
  open.push(h);
  return { h, sent };
}
/** The full verifier over the finished session: signatures, chains, compaction replay and every request reconstructed. */
async function verified(h: LoopHarness): Promise<void> {
  const pem = getPublicKeyPem(h.dir, "monitor");
  h.finish();
  const report = await verifyAgentRun(h.dir, h.sessionId, pinnedTrust([{ publicKeyPem: pem, purposes: ["ledger-row"] }]));
  expect(report.ok, JSON.stringify(report)).toBe(true);
  expect(report.requests.every(request => request.status === "reconstructed")).toBe(true);
}
async function turn(h: LoopHarness, input: string): Promise<void> {
  h.driver.followup(input);
  await h.driver.whenIdle();
}

/** fs.read, fs.write and fs.edit through the real pipeline seam; `deny` is a policy guard the test can switch on. */
function realFiles(deny: { path: string | null }, calls: ToolCallRequest[]) {
  return (dir: string): AgentToolSeam => {
    const registry = new ToolRegistry();
    for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
    registry.guard("test-policy", execution => execution.name === "fs.read" && execution.arguments.path === deny.path ? "denied by the test policy" : undefined);
    const governed = pipelineToolSeam({ registry, pipeline: new ToolPipeline({ workspace: dir, registry }), agentId: "default" });
    return { ...governed, execute(request) { calls.push(request); return governed.execute(request); } };
  };
}

describe("reactive compaction after a context-window overflow (HP-05 item 1)", () => {
  it("compacts once with a signed overflow receipt, then asks once more; the retry is smaller and the record says so", async () => {
    const { h, sent } = run([toolStep("big", "fixture", '{"id":"big"}', { inputTokens: 1000 }), textStep("done", { inputTokens: 900 })], [2]);
    await turn(h, "Look at the big output.");
    expect(h.driver.status).toBe("idle");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["complete"]);
    const [failure] = rowsOf(rows, "request/failure");
    expect(rowsOf(rows, "request/failure")).toHaveLength(1);
    expect((meta(failure!).failure as { code: string }).code).toBe("CONTEXT_WINDOW_EXCEEDED");
    const compacts = rowsOf(rows, "loop/compact");
    expect(compacts).toHaveLength(1);
    const receipt = compactionReceipt(compacts[0]!);
    expect(receipt.v === 2 ? receipt.trigger : null).toEqual({ kind: "overflow", contextWindowTokens: 10_000, failureEventId: failure!.id, failureCode: "CONTEXT_WINDOW_EXCEEDED" });
    // The most recent step's output was the one pruned: an overflow keeps no recent steps.
    const original = rowsOf(rows, "tool/result")[0]!;
    expect(receipt.sources.map(source => source.originEventId)).toEqual([original.id]);
    expect(text(h, original)).toBe("B".repeat(8192)); // nothing removed from the signed record
    const [decision] = audits(rows, OVERFLOW_DECISION_AUDIT);
    expect(meta(decision!)).toMatchObject({ decision: "retry", failureEventId: failure!.id, compactionEventIds: [compacts[0]!.id] });
    const order = [failure!, compacts[0]!, decision!, rowsOf(rows, "request/header")[2]!].map(row => rows.indexOf(row));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(rowsOf(rows, "request/header")).toHaveLength(3);
    expect(sent[2]!.length).toBeLessThan(sent[1]!.length);
    validateSurfaceCompactions(h.dir, rows);
    expect(describeCompactionFollowUps(h.dir, rows)).toEqual([
      "Turn 1: 1 automatic compaction change(s), 1 because a request was too large for the window. The original messages stay in the log.",
      "Turn 1: a request was too large for the model's context window. AMC compacted the context and asked once more."
    ]);
    await verified(h);
  });

  it("MUTATION: a second overflow in the same turn stays terminal, with exactly one compaction and one retry", async () => {
    const { h } = run([toolStep("big", "fixture", '{"id":"big"}', { inputTokens: 1000 }), textStep("never")], [2, 3]);
    await turn(h, "Look at the big output.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["error"]);
    expect(rowsOf(rows, "request/header")).toHaveLength(3);
    expect(rowsOf(rows, "request/failure")).toHaveLength(2);
    expect(rowsOf(rows, "loop/compact")).toHaveLength(1);
    expect(audits(rows, OVERFLOW_DECISION_AUDIT).map(row => meta(row).decision)).toEqual(["retry"]);
  });

  it("MUTATION: with nothing to compact there is no receipt, no retry, and the turn ends with the provider's error", async () => {
    const { h } = run([textStep("never")], [1]);
    await turn(h, "Hello.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["error"]);
    expect(rowsOf(rows, "request/header")).toHaveLength(1);
    expect(rowsOf(rows, "loop/compact")).toHaveLength(0);
    expect(audits(rows, OVERFLOW_DECISION_AUDIT).map(row => meta(row).decision)).toEqual(["end"]);
    expect(describeCompactionFollowUps(h.dir, rows)).toEqual([
      "Turn 1: a request was too large for the model's context window, and compaction found nothing it could remove, so the turn ends."
    ]);
  });

  it.each([[400, OVERFLOW, "the summary request itself overflows"], [401, "{}", "the summary request is refused"]] as const)(
    "MUTATION: when the summary answers HTTP %i the turn ends with the original overflow, without a retry", async (status, body) => {
      // Turn 1 completes. In turn 2 (request 2) nothing can be pruned, so the summary step runs and its request (3) fails.
      const { h } = run([textStep("A".repeat(3000), { inputTokens: 100 })], [2], { compaction: { summarize: true }, failures: { 3: [status, body] } });
      await turn(h, "First question.");
      await turn(h, "Second question.");
      const rows = h.events();
      expect(turnEnds(rows)).toEqual(["complete", "error"]);
      expect(rowsOf(rows, "request/header")).toHaveLength(3);
      expect(audits(rows, OVERFLOW_DECISION_AUDIT).map(row => meta(row).decision)).toEqual(["end"]);
      const failures = rowsOf(rows, "request/failure").map(row => (meta(row).failure as { code: string }).code);
      expect(failures[0]).toBe("CONTEXT_WINDOW_EXCEEDED");
      // The turn's own failure is the overflow, not the summary's.
      expect(rowsOf(rows, "loop/compact").every(row => compactionReceipt(row).mode === "drop")).toBe(true);
    });

  it("MUTATION: under a token limit the overflowed step's unknown usage stops the run first; nothing is compacted or retried", async () => {
    const { h } = run([toolStep("big", "fixture", '{"id":"big"}', { inputTokens: 1000 }), textStep("never")], [2], { runLimits: { maxTotalTokens: 1_000_000 } });
    await turn(h, "Look at the big output.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["error"]);
    expect(rowsOf(rows, "request/header")).toHaveLength(2);
    expect(rowsOf(rows, "loop/compact")).toHaveLength(0);
    expect(audits(rows, OVERFLOW_DECISION_AUDIT)).toHaveLength(0);
  });

  it("MUTATION: a signed budget that refuses the summary request ends the turn with the overflow, without a retry", async () => {
    // Turn 1 uses one request; the overflowed request is the second; the per-minute limit of 2 refuses the summary (third).
    const { h } = run([textStep("A".repeat(3000), { inputTokens: 100 })], [2], { compaction: { summarize: true } });
    const budget = loadBudgetsConfig(h.dir);
    budget.budgets.perAgent.default!.unknownTokenUsage = "ALLOW_WITH_WARNING";
    budget.budgets.perAgent.default!.perMinute.maxLlmRequests = 2;
    writeFileSync(budgetsPath(h.dir), YAML.stringify(budget));
    signBudgetsConfig(h.dir);
    await turn(h, "First question.");
    await turn(h, "Second question.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["complete", "error"]);
    expect(rowsOf(rows, "request/failure").map(row => (meta(row).failure as { code: string }).code)).toEqual(["CONTEXT_WINDOW_EXCEEDED", "AMC_NATIVE_BUDGET_REFUSED"]);
    expect(audits(rows, OVERFLOW_DECISION_AUDIT).map(row => [meta(row).decision, meta(row).reason])).toEqual([["end", expect.stringContaining("summary request was refused")]]);
    expect(rowsOf(rows, "loop/compact").every(row => compactionReceipt(row).mode === "drop")).toBe(true);
  });

  it("MUTATION: a run with no step left after the summary does not retry", async () => {
    const { h } = run([toolStep("big", "fixture", '{"id":"big"}', { inputTokens: 1000 }), textStep("never")], [2], { maxStepsPerTurn: 2 });
    await turn(h, "Look at the big output.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["error"]);
    expect(rowsOf(rows, "request/header")).toHaveLength(2);
    expect(audits(rows, OVERFLOW_DECISION_AUDIT).map(row => meta(row).decision)).toEqual(["end"]);
  });

  it("refuses, on replay, an overflow receipt that cites a failure that was not an overflow", () => {
    const receipt = surfaceCompactionReceiptSchema.parse({ v: 2, mode: "drop", reason: "x", basis: { sessionId: "s", eventId: "e", eventHash: "a".repeat(64), seq: 1 },
      sources: [{ originEventId: "o", sourceEventId: "o", sourceEventHash: "a".repeat(64), payloadSha256: "b".repeat(64), bytes: 10 }],
      replacedBytes: 10, replacementBytes: 0, savedBytes: 10, measurement: "payload-bytes-not-tokens",
      trigger: { kind: "overflow", contextWindowTokens: 100, failureEventId: "f", failureCode: "CONTEXT_WINDOW_EXCEEDED" } });
    const failure = (code: string) => new Map([["f", { id: "f", event_type: "request/failure", session_id: "s",
      meta_json: JSON.stringify({ failure: { code } }) } as EvidenceEvent]]);
    expect(() => assertAutomaticProvenance(receipt, failure("CONTEXT_WINDOW_EXCEEDED"), "s")).not.toThrow();
    expect(() => assertAutomaticProvenance(receipt, failure("INVALID_REQUEST"), "s")).toThrow(/context-window failure/);
    expect(() => assertAutomaticProvenance(receipt, failure("CONTEXT_WINDOW_EXCEEDED"), "other")).toThrow(/context-window failure/);
  });
});

describe("summary prompt: fixed sections and merging the previous summary (HP-05 items 2, 3)", () => {
  it("asks for every section, and asks to merge only when a previous summary is there", () => {
    const fresh = summaryPrompt(2), merging = summaryPrompt(2, true);
    expect(SUMMARY_PROMPT_VERSION).toBe(2);
    for (const section of SUMMARY_SECTIONS) expect(fresh).toContain(section);
    expect(fresh).toMatch(/Objective and constraints[\s\S]*Decisions[\s\S]*Work state[\s\S]*file[\s\S]*Checked[\s\S]*not verified[\s\S]*Open problems[\s\S]*Next step/);
    expect(fresh).not.toContain("previous summary");
    expect(merging).toContain("keep every detail of it that is still true, drop what later work made stale");
    expect(merging).toContain("do not restate it from scratch");
  });

  it("on the real loop, a second summary sees the first, is told to merge it, and its receipt names it", async () => {
    const { h, sent } = run([textStep("A".repeat(3000), { inputTokens: 100 }), textStep("B".repeat(3000), { inputTokens: 8500 }),
      textStep("summary one", { inputTokens: 50 }), textStep("C".repeat(3000), { inputTokens: 8500 }), textStep("summary two", { inputTokens: 50 })],
    [], { compaction: { summarize: true, keepRecentSteps: 1 } });
    await turn(h, "First.");
    await turn(h, "Second.");
    await turn(h, "Third.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["complete", "complete", "complete"]);
    const summaries = rowsOf(rows, "loop/compact").filter(row => compactionReceipt(row).mode === "summarize");
    expect(summaries).toHaveLength(2);
    const [first, second] = summaries.map(row => compactionReceipt(row));
    expect(first!.v === 2 ? first!.summarizer : null).toMatchObject({ promptVersion: 2 });
    expect(first!.v === 2 ? first!.summarizer?.mergedPreviousSummaryEventId : "x").toBeUndefined();
    expect(second!.v === 2 ? second!.summarizer?.mergedPreviousSummaryEventId : null).toBe(summaries[0]!.id);
    // The second summary request (request 5) carried the first summary and the merge instruction.
    expect(sent[4]).toContain("summary one");
    expect(sent[4]).toContain("do not restate it from scratch");
    expect(sent[2]).not.toContain("do not restate it from scratch");
    validateSurfaceCompactions(h.dir, rows);
    expect(describeCompactionFollowUps(h.dir, rows)[1]).toContain("the new summary merged the previous one");
  });
});

describe("files read again after compaction (HP-05 item 4)", () => {
  const scripts = [toolStep("r1", "fs.read", '{"path":"big.txt"}', { inputTokens: 100 }), toolStep("r2", "fs.read", '{"path":"small.txt"}', { inputTokens: 100 }),
    toolStep("e1", "fs.edit", '{"path":"small.txt","find":"NEW","replace":"EDITED","replaceAll":true}', { inputTokens: 100 }), textStep("done", { inputTokens: 100 })];
  const setUp = (dir: string): void => { writeFileSync(join(dir, "big.txt"), "x".repeat(9000)); writeFileSync(join(dir, "small.txt"), "OLD ".repeat(500)); };
  // Request 3 overflows; just before it, small.txt changes on disk.
  const before = (request: number, dir: string): void => {
    if (request === 1) setUp(dir);
    if (request === 3) writeFileSync(join(dir, "small.txt"), "NEW ".repeat(500));
  };

  it("re-reads the newest files through the real read path, marks a changed one, and keeps read-before-edit truthful", async () => {
    const calls: ToolCallRequest[] = [];
    const { h, sent } = run(scripts, [3], { tools: realFiles({ path: null }, calls), compaction: { pruneMinBytes: 1000 }, before });
    await turn(h, "Read both files, then edit the small one.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["complete"]);
    const [restored] = audits(rows, FILES_RESTORED_AUDIT);
    const files = (JSON.parse(text(h, restored!)) as { files: { path: string; changedSinceLastRead: boolean | null; bytes: number }[] }).files;
    expect(files.map(file => [file.path, file.changedSinceLastRead])).toEqual([["small.txt", true], ["big.txt", null]]);
    expect(meta(restored!)).not.toHaveProperty("files.0"); // counts only in the plain meta
    expect(JSON.stringify(meta(restored!))).not.toContain("small.txt");
    expect(calls.filter(call => call.callId.startsWith("amc-restore-")).map(call => JSON.parse(call.rawArguments).path)).toEqual(["small.txt", "big.txt"]);
    // The retry carries the CURRENT content, as tool context, and is still smaller than the request that overflowed.
    expect(sent[3]).toContain("file read again after compaction: small.txt");
    expect(sent[3]).toContain("NEW NEW");
    expect(sent[3]).toContain("context supplied by a tool");
    expect(sent[3]!.length).toBeLessThan(sent[2]!.length);
    // The edit after the retry passes read-before-edit because the restore read was a real read of the new bytes.
    expect(readFileSync(join(h.dir, "small.txt"), "utf8")).toContain("EDITED");
    expect(files.length).toBeLessThanOrEqual(RESTORE_MAX_FILES);
    expect(describeCompactionFollowUps(h.dir, rows)).toContain(
      "Turn 1: after compaction, AMC read 2 file(s) into context again: small.txt (changed since the agent last read it), big.txt.");
    await verified(h);
  });

  it("MUTATION: marks an unchanged file as unchanged, and does not restore a file a second time at a later compaction", async () => {
    const calls: ToolCallRequest[] = [];
    // Turn 2 reads pad.txt (deleted before its overflow, so its restore fails and the next candidate is tried) and other.txt.
    const { h } = run([...scripts.slice(0, 2), textStep("done one", { inputTokens: 100 }), toolStep("r3", "fs.read", '{"path":"pad.txt"}', { inputTokens: 100 }),
      toolStep("r4", "fs.read", '{"path":"other.txt"}', { inputTokens: 100 }), textStep("done two", { inputTokens: 100 })], [3, 7],
    { tools: realFiles({ path: null }, calls), compaction: { pruneMinBytes: 1000 },
      before: (request, dir) => {
        if (request === 1) { setUp(dir); writeFileSync(join(dir, "pad.txt"), "p".repeat(9000)); writeFileSync(join(dir, "other.txt"), "y".repeat(1000)); }
        if (request === 7) rmSync(join(dir, "pad.txt"));
      } });
    await turn(h, "Read both files.");
    await turn(h, "Now read two more.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["complete", "complete"]);
    const restores = audits(rows, FILES_RESTORED_AUDIT).map(row => (JSON.parse(text(h, row)) as { files: { path: string; changedSinceLastRead: boolean | null }[] }).files
      .map(file => [file.path, file.changedSinceLastRead]));
    expect(restores).toEqual([[["small.txt", false], ["big.txt", null]], [["other.txt", false]]]);
    // In turn 2 the restore tried other.txt and the deleted pad.txt, never the files turn 1 already restored.
    expect(calls.filter(call => call.callId.startsWith("amc-restore-2-")).map(call => JSON.parse(call.rawArguments).path)).toEqual(["other.txt", "pad.txt"]);
    await verified(h);
  });

  it("MUTATION: never restores a path the current policy denies", async () => {
    const calls: ToolCallRequest[] = [];
    const deny = { path: null as string | null };
    const { h, sent } = run(scripts.slice(0, 2).concat([textStep("done")]), [3], { tools: realFiles(deny, calls), compaction: { pruneMinBytes: 1000 },
      before: (request, dir) => { before(request, dir); if (request === 3) deny.path = "small.txt"; } });
    await turn(h, "Read both files.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["complete"]);
    const files = (JSON.parse(text(h, audits(rows, FILES_RESTORED_AUDIT)[0]!)) as { files: { path: string }[] }).files;
    expect(files.map(file => file.path)).toEqual(["big.txt"]);
    expect(sent[3]).not.toContain("NEW NEW");
    expect(calls.some(call => call.callId.startsWith("amc-restore-") && JSON.parse(call.rawArguments).path === "small.txt")).toBe(true);
  });

  it("does not restore through a seam that would ask a person first", async () => {
    const calls: ToolCallRequest[] = [];
    const asking = (dir: string): AgentToolSeam => ({ ...realFiles({ path: null }, calls)(dir), asksBeforeRunning: () => true });
    const { h } = run(scripts.slice(0, 2).concat([textStep("done")]), [3], { tools: asking, compaction: { pruneMinBytes: 1000 }, before });
    await turn(h, "Read both files.");
    const rows = h.events();
    expect(turnEnds(rows)).toEqual(["complete"]);
    expect(audits(rows, FILES_RESTORED_AUDIT)).toHaveLength(0);
    expect(calls.some(call => call.callId.startsWith("amc-restore-"))).toBe(false);
  });
});
