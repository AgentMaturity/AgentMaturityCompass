/** Synthetic tool outcomes isolate repair-owned inbox lifetime; no shell or provider is executed. */
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { AgentDriver } from "../src/agent/agentDriver.js";
import { readAgentRunSummary } from "../src/agent/runReport.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import type { AgentToolSeam, ToolCallOutcome, ToolCallRequest } from "../src/agent/toolSeam.js";
import type { StreamChunk } from "../src/llm/streamChunk.js";
import { loopHarness, textStep, toolStep, StubToolSeam, LOOP_MODEL, LOOP_PROVIDER,
  type LoopHarness, type ScriptedStream } from "./helpers/agentLoopHarness.js";

const opened: LoopHarness[] = [];
afterEach(() => {
  for (const f of opened.splice(0)) {
    try { f.finish(); }
    finally { f.session.disposeWithoutClosing(); rmSync(f.dir, { recursive: true, force: true }); }
  }
  vi.unstubAllEnvs();
});
function fixture(scripts: ScriptedStream[], read?: (request: ToolCallRequest) => Promise<ToolCallOutcome>) {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-native-repair-context-fixture");
  const f = loopHarness({ scripts }); opened.push(f);
  writeFileSync(join(f.dir, "calculation.txt"), "broken\n");
  const stub = new StubToolSeam({
    bash: async () => ({ outcome: "ERROR", content: "Public check failed.", exitCode: 1, timedOut: false, denied: false }),
    "fs.read": read ?? (async () => ({ outcome: "OK", content: "broken", exitCode: 0, timedOut: false, denied: false }))
  });
  const tools: AgentToolSeam = { supportsEffectGuard: true, schemas: () => stub.schemas(),
    executionMode: request => stub.executionMode(request), execute: request => stub.execute(request) };
  return { f, tools };
}
function driver(input: ReturnType<typeof fixture>, maxStepsPerTurn: number, timeoutMs = 10_000) {
  return new AgentDriver({ session: input.f.session, llm: input.f.llm,
    systemPromptEventId: input.f.systemPromptEventId,
    route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } }, tools: input.tools,
    validation: { configSha256: "a".repeat(64),
      checks: [{ id: "public", title: "Public check", command: "synthetic-public-check", timeoutMs: 5_000 }],
      repair: { maxRounds: 1, maxRequests: 4, maxTokens: 100_000, timeoutMs, allowedEditPaths: ["calculation.txt"] } },
    config: { maxStepsPerTurn, toolAbandonGraceMs: 100 } });
}

test("a repair truncation notice cannot spill into a fresh turn after the step budget ends", async () => {
  const truncated: StreamChunk[] = toolStep("truncated-repair-read", "fs.read", JSON.stringify({ path: "calculation.txt" }))
    .map(chunk => chunk.type === "finish" ? { ...chunk, reason: { kind: "max_tokens" } } : chunk);
  const input = fixture([textStep("Initial completion."), truncated, textStep("Must not get another repair budget.")]);
  const d = driver(input, 2);
  d.followup("Complete, then use only the bounded repair policy."); await d.whenIdle();
  const summary = readAgentRunSummary(input.f.dir, input.f.sessionId, d.status);
  expect(summary.requests).toBe(2);
  expect(input.f.events().filter(row => row.event_type === "turn/start")).toHaveLength(1);
  expect(d.inbox.hasPending).toBe(false);
});

test("tool context returned after repair abort cannot restart the stopped driver", async () => {
  const lateContext = "Late tool context must not receive a fresh repair budget.";
  let returnedAfterAbort = false;
  const input = fixture([textStep("Initial completion."),
    toolStep("late-context-read", "fs.read", JSON.stringify({ path: "calculation.txt" })),
    textStep("Must not resume late context.")], request => new Promise(resolve => {
    request.signal.addEventListener("abort", () => {
      setTimeout(() => {
        returnedAfterAbort = request.signal.aborted;
        resolve({ outcome: "OK", content: "Read finished after cancellation.", exitCode: 0,
          timedOut: false, denied: false, additionalContext: [lateContext] });
      }, 1);
    }, { once: true });
  }));
  const d = driver(input, 4, 1_000);
  d.followup("Stop repair at its lifetime bound."); await d.whenIdle();
  const summary = readAgentRunSummary(input.f.dir, input.f.sessionId, d.status);
  expect(returnedAfterAbort).toBe(true);
  const toolInsertions = input.f.events().filter(row => {
    if (row.event_type !== "loop/inbox") return false;
    const meta = JSON.parse(row.meta_json);
    return meta.op === "insert" && meta.origin === "tool";
  });
  for (const row of toolInsertions) {
    const payload = readEventPayload(input.f.dir, row);
    expect(payload.status).toBe("ok");
    if (payload.status === "ok") expect(payload.bytes.toString("utf8")).not.toContain(lateContext);
  }
  expect(summary.requests).toBe(2);
  expect(input.f.events().filter(row => row.event_type === "turn/start")).toHaveLength(1);
  expect(d.inbox.hasPending).toBe(false);
});
