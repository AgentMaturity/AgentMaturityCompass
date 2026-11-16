// Watch numbers from observed traffic: tool-call denial and error rates, refusal rate, tokens per task, and "observed
// change" notes through the existing change-point code. Rows are written to a real ledger in a temp workspace.
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { matchApiRoute } from "../src/api/index.js";
import { handleRuntimeRoute } from "../src/api/runtimeRouter.js";
import { openLedger } from "../src/ledger/ledger.js";
import { observedChangeNotes } from "../src/watch/observedChange.js";
import { observedRates, readObservedRows, type ObservedRow } from "../src/watch/observedTraffic.js";
import { initWorkspace } from "../src/workspace.js";
// @ts-expect-error plain browser module without types
import { toolRatesHtml } from "../src/console/assets/runtimeRates.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const NOW = Date.now();

function workspaceWithRows(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-observed-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "agent-a", trustBoundaryMode: "isolated", witnessing: false });
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "observed-fixture", runtime: "unknown", binaryPath: "fixture", binarySha256: "0".repeat(64) });
    const add = (eventType: "llm_response" | "audit" | "tool_result", meta: Record<string, unknown>) => ledger.appendEvidence({
      sessionId: "observed-fixture", runtime: "unknown", eventType, inline: true, payload: "fixture", meta, ts: NOW - 60_000 });
    add("llm_response", { agentId: "agent-a", statusCode: 200, model: "example-model", usage: { input_tokens: 100, output_tokens: 20 }, stopReason: "end_turn", run_id: "r1" });
    add("llm_response", { agentId: "agent-a", statusCode: 200, model: "example-model", usage: { input_tokens: 50, output_tokens: 10 }, stopReason: "refusal", run_id: "r1" });
    add("llm_response", { agentId: "agent-a", statusCode: 200, model: "example-model", usage: { total_tokens: 40 }, run_id: "r2" });
    add("llm_response", { agentId: "agent-a", statusCode: 500, model: "example-model" });
    add("audit", { agentId: "agent-a", controlSchemaVersion: 2, decision: "allow" });
    add("audit", { agentId: "agent-a", controlSchemaVersion: 2, decision: "deny" });
    add("audit", { agentId: "agent-a", approvalControlSchemaVersion: 1, decision: "ask" });
    add("audit", { agentId: "agent-a", decision: "deny" }); // not a control decision row
    add("tool_result", { agentId: "agent-a", postExecutionSchemaVersion: 1, reported: { outcome: "failed" } });
    add("tool_result", { agentId: "agent-a", postExecutionSchemaVersion: 1, reported: { outcome: "completed" } });
    add("tool_result", { agentId: "agent-a", codexObservationSchemaVersion: 1 });
    add("tool_result", { agentId: "agent-b", postExecutionSchemaVersion: 1, reported: { outcome: "failed" } });
  } finally {
    ledger.close();
  }
  return workspace;
}

describe("observed traffic numbers", () => {
  test("rates come from the recorded rows of one agent; unknowns stay unknown", () => {
    const workspace = workspaceWithRows();
    const { rows } = readObservedRows(workspace, { agentId: "agent-a", sinceTs: NOW - 3_600_000, untilTs: NOW });
    expect(observedRates(rows)).toEqual({
      toolDecisions: { total: 3, denied: 1, asked: 1, denialRate: 0.3333 },
      toolOutcomes: { total: 3, failed: 1, outcomeUnknown: 1, errorRate: 0.5 },
      modelReplies: { total: 3, refusals: 1, refusalUnknown: 1, refusalRate: 0.5, tasks: 2, tokensPerTask: 110 }
    });
  });

  test("a workspace with no ledger reads as no rows", () => {
    const empty = mkdtempSync(join(tmpdir(), "amc-observed-empty-"));
    roots.push(empty);
    expect(readObservedRows(empty, { agentId: "agent-a", sinceTs: 0, untilTs: NOW }).rows).toEqual([]);
  });

  test("the Runtime route is read-only, under the runtime routes' authority, and returns counts and rates only", async () => {
    const workspace = workspaceWithRows();
    expect(matchApiRoute("/api/v1/runtime/tool-rates")).toMatchObject({ id: "runtime", auth: "protected" });
    const call = async (method: string, url: string) => {
      const req = Readable.from([]) as unknown as IncomingMessage;
      req.method = method; req.url = url;
      const state = { status: 200, body: "" };
      const res = { setHeader: () => undefined, writeHead: (status: number) => { state.status = status; },
        end: (chunk?: string) => { state.body += chunk ?? ""; } } as unknown as ServerResponse;
      await handleRuntimeRoute(new URL(url, "http://x").pathname, method, req, res, workspace);
      return state;
    };
    const ledgerBefore = readFileSync(join(workspace, ".amc", "evidence.sqlite"));
    const ok = await call("GET", "/api/v1/runtime/tool-rates?agentId=agent-a&window=1h");
    expect(ok.status).toBe(200);
    const data = (JSON.parse(ok.body) as { data: Record<string, unknown> }).data;
    expect(Object.keys(data).sort()).toEqual(["agentId", "modelReplies", "rowsRead", "sinceTs", "toolDecisions", "toolOutcomes", "truncated", "untilTs"]);
    expect(data.toolDecisions).toEqual({ total: 3, denied: 1, asked: 1, denialRate: 0.3333 });
    expect(JSON.stringify(data)).not.toContain("example-model");
    expect(readFileSync(join(workspace, ".amc", "evidence.sqlite")).equals(ledgerBefore)).toBe(true);
    expect((await call("POST", "/api/v1/runtime/tool-rates")).status).toBe(404);
    expect((await call("GET", "/api/v1/runtime/tool-rates?window=nonsense")).status).toBe(400);
  });
});

describe("observed change notes", () => {
  const since = 0, until = 24 * 3_600_000;
  const row = (index: number, overrides: Partial<ObservedRow>): ObservedRow => ({ id: `ev-${index}`, ts: index * 60_000, kind: "tool-outcome",
    task: "t", model: null, tokens: null, refusal: null, denied: false, asked: false, failed: false, ...overrides });

  test("a rise in the tool-error rate is a note with numbers and rows, and no cause or verdict", () => {
    const rows: ObservedRow[] = [];
    for (let hour = 0; hour < 24; hour += 1) for (let n = 0; n < 4; n += 1) {
      rows.push(row(hour * 60 + n, { failed: hour >= 16 && n < 3 }));
    }
    const notes = observedChangeNotes(rows, { sinceTs: since, untilTs: until });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ metric: "tool-error rate", before: "0.0%", after: "75.0%", rows: { count: 32, firstId: "ev-960", lastId: "ev-1383" } });
    expect(notes[0]!.text).toMatch(/^Observed change: tool-error rate went from 0\.0% to 75\.0% from .* not why\.$/);
    expect(notes[0]!.text).not.toMatch(/\b(safe|unsafe|degraded|broken|because|caused)\b/i);
  });

  test("a switch in the model named in most replies is a note; steady numbers give none", () => {
    const rows = Array.from({ length: 48 }, (_, index) => row(index * 30, { kind: "model-reply", task: `t${index}`, model: index < 24 ? "model-x" : "model-y", refusal: false, tokens: 10 }));
    const notes = observedChangeNotes(rows, { sinceTs: since, untilTs: until });
    expect(notes.map((note) => [note.metric, note.before, note.after])).toEqual([["response model", "model-x", "model-y"]]);
    expect(observedChangeNotes(rows.map((item) => ({ ...item, model: "model-x" })), { sinceTs: since, untilTs: until })).toEqual([]);
  });
});

describe("tokens per task across bucket edges", () => {
  test("a task whose replies straddle two buckets is counted once, so steady tasks give no note", () => {
    const hour = 3_600_000, rows: ObservedRow[] = [];
    // Each task has four 30-token replies two minutes apart; from task 12 on they start one minute before a bucket edge.
    for (let task = 1; task < 24; task += 1) for (let n = 0; n < 4; n += 1) {
      rows.push({ id: `ev-${task}-${n}`, ts: task * hour + (task < 12 ? 600_000 : -60_000) + n * 120_000, kind: "model-reply", task: `task-${task}`, model: "m",
        tokens: 30, refusal: false, denied: false, asked: false, failed: null });
    }
    expect(observedChangeNotes(rows, { sinceTs: 0, untilTs: 24 * hour })).toEqual([]);
  });
});

describe("Runtime page card", () => {
  test("every value is escaped and missing numbers read as not recorded", () => {
    const html = toolRatesHtml({ rowsRead: "<img src=x onerror=alert(1)>", toolDecisions: { total: 4, denied: 1, denialRate: 0.25, asked: "<b>" },
      toolOutcomes: { total: 2, failed: 0, errorRate: null, outcomeUnknown: 0 }, modelReplies: { total: 0, refusals: 0, refusalRate: null } }) as string;
    expect(html).not.toMatch(/<img|<b>|onerror/);
    expect(html).toContain("1 of 4 (25.0%)");
    expect(html).toContain("0 of 2 (not recorded)");
    expect(toolRatesHtml(null)).toContain("No tool-call numbers yet.");
  });
});
