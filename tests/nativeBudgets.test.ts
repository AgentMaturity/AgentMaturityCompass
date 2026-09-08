import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { openLedger } from "../src/ledger/ledger.js";
import { budgetUsageSnapshot, budgetsPath, evaluateBudgetStatus, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { measuredUsage, NATIVE_BUDGET_RESERVATION } from "../src/budgets/nativeBudgetUsage.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import { anthropicTextStream, errorResponse, okStream, stubUpstream, refusingUpstream } from "./helpers/llmStubUpstream.js";
import { ToolRegistry, defineTool } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { budgetGuard } from "../src/tools/guards/policyGuards.js";
import { toolEvidenceFor } from "../src/tools/toolEvidence.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";

let workspace: string;
const sessions: SessionService[] = [];
const credentials: CredentialsService = {
  resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
  set: async () => { throw new Error("unused"); }, unset: async () => false
};
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "amc-native-budgets-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => {
  for (const session of sessions.splice(0)) { try { session.close({ reason: "completed" }); } catch { /* fixture teardown */ } }
  rmSync(workspace, { recursive: true, force: true });
});
function session(agentId = "default", backend?: "sqlite" | "jsonl") {
  const value = new SessionService(workspace, backend ? openSessionEventStore(workspace, backend) : undefined); sessions.push(value);
  value.open({ agentId, harnessVersion: "budget-test", compositionDigest: "budget-test", policyDigest: "budget-test" });
  const prompt = value.recordSystemPrompt("Budget fixture");
  value.startTurn({ trigger: "user" }); value.recordUserMessage("Read a fixture"); value.startStep();
  return { value, spec: { providerId: "fixture", model: "fixture", params: { max_tokens: 20, stream: true }, systemPromptEventId: prompt.eventId, tools: null } };
}
function runtime(value: SessionService, upstream: ReturnType<typeof stubUpstream>, adapter: LlmAdapter = anthropicAdapter) {
  const registry = new AdapterRegistry();
  registry.register({ providerId: "fixture", models: ["fixture"], adapter, baseUrl: "https://fixture.invalid", credentialRef: null });
  return new LlmRuntime({ session: value, registry, credentials, transport: upstream.transport });
}
const response = () => okStream(anthropicTextStream({ text: ["done"], inputTokens: 10, outputTokens: 3, cacheReadTokens: 2 }));
async function drain(stream: AsyncIterable<unknown>) { for await (const _ of stream) { /* consume */ } }
function limits(edit: (config: ReturnType<typeof loadBudgetsConfig>) => void) {
  const config = loadBudgetsConfig(workspace); edit(config);
  writeFileSync(budgetsPath(workspace), YAML.stringify(config)); signBudgetsConfig(workspace);
}
function pipeline(value: SessionService, record = true) {
  let executed = 0;
  const registry = new ToolRegistry();
  registry.define(defineTool({ name: "read", actionClass: "READ_ONLY", description: "fixture read", body: () => { executed++; return { output: "read" }; } }));
  registry.define(defineTool({ name: "failed", actionClass: "WRITE_LOW", description: "fixture failure", body: () => { executed++; throw new Error("body failed"); } }));
  registry.guard("budgets", budgetGuard(workspace, value.sessionId));
  registry.guard("fixture-deny", execution => execution.arguments.deny ? "fixture denied" : undefined);
  return { registry, get executed() { return executed; }, pipeline: new ToolPipeline({ workspace, registry,
    ...(record ? { record: (execution: Parameters<typeof toolEvidenceFor>[0], outcome: Parameters<typeof toolEvidenceFor>[1]) => { for (const row of toolEvidenceFor(execution, outcome)) value.recordProjectedEvidence(row); } } : {}) }) };
}

describe("AMC-1534 native budget admissions and signed accounting", () => {
  test("the CLI toolset binds its session after construction and resolves a changed writer for each dispatch", async () => {
    writeRuntimeFirewallPolicy({ workspace, mode: "observe" });
    mkdirSync(join(workspace, "workspace")); writeFileSync(join(workspace, "workspace", "read.txt"), "late bound");
    let bound: SessionService | undefined;
    const current = () => { if (!bound) throw new Error("workspace tools have no native session writer"); return bound; };
    // Same lazy getter and recorder seam used by the production CLI for fresh,
    // resumed and forked sessions. Construction must not resolve this getter.
    const tools = agentToolset({ workspace, agentId: "default", get sessionId() { return current().sessionId; },
      recorder: { recordProjectedEvidence: row => current().recordProjectedEvidence(row) } });
    try {
      const first = session(); bound = first.value;
      const input = { name: "fs.read", agentId: "default", arguments: { path: "workspace/read.txt" }, requestedMode: "EXECUTE" as const };
      expect((await tools.pipeline.execute(input)).ok).toBe(true);
      const second = session(); bound = second.value;
      expect((await tools.pipeline.execute(input)).ok).toBe(true);
      const ledger = openLedger(workspace);
      try {
        const admitted = ledger.getAllEvents().map(row => JSON.parse(row.meta_json) as Record<string, unknown>)
          .filter(meta => meta.auditType === NATIVE_BUDGET_RESERVATION);
        expect(admitted.map(meta => meta.nativeSessionId)).toEqual([first.value.sessionId, second.value.sessionId]);
      } finally { ledger.close(); }
      expect(budgetUsageSnapshot(workspace, "default").daily.toolExecutes.READ_ONLY).toBe(2);
      expect(budgetUsageSnapshot(workspace, "default").daily.toolPending.READ_ONLY).toBe(0);
    } finally { tools.close(); }
  });

  test("reads a live JSONL native session read-only and reconciles its SQLite budget journal", async () => {
    const { value, spec } = session("default", "jsonl"); const upstream = stubUpstream([response]);
    await drain(runtime(value, upstream).stream(spec));
    const usage = budgetUsageSnapshot(workspace, "default");
    expect(usage.daily.llmRequests).toBe(1); expect(usage.daily.llmTokens).toBe(15);
    expect(usage.daily.llmPendingRequests).toBe(0);
    expect(JSON.parse(readFileSync(join(workspace, ".amc", "session-store.json"), "utf8")).backend).toBe("jsonl");
  });

  test("counts native requests once, attributes the signed session owner, includes cache tokens and distinguishes preparations", async () => {
    const { value, spec } = session("root-agent"); const upstream = stubUpstream([response]); const llm = runtime(value, upstream);
    await drain(llm.stream(spec)); await drain(llm.stream(spec)); llm.prepare(spec);
    const used = budgetUsageSnapshot(workspace, "root-agent");
    expect(used.daily.llmRequests).toBe(2); expect(used.daily.llmPreparedRequests).toBe(3);
    expect(used.daily.llmTokens).toBe(30); expect(used.daily.llmTokenUsageComplete).toBe(true);
    expect(used.daily.llmCostUsd).toBe(0); expect(used.daily.llmCostUsageComplete).toBe(false);
    expect(used.daily.unknownLlmCostRequests).toBe(2); expect(used.daily.llmPendingRequests).toBe(0);
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
  });

  test("blocks the next provider dispatch at the request limit before transport", async () => {
    limits(config => { config.budgets.perAgent.default!.daily.maxLlmRequests = 1; });
    const { value, spec } = session(); const upstream = stubUpstream([response]); const llm = runtime(value, upstream);
    await drain(llm.stream(spec)); await expect(drain(llm.stream(spec))).rejects.toThrow("request budget exhausted");
    expect(upstream.sent).toHaveLength(1);
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(1);
  });

  test("blocks the next provider dispatch at the known token threshold and leaves unpriced cost explicit", async () => {
    limits(config => { config.budgets.perAgent.default!.daily.maxLlmTokens = 15; });
    const { value, spec } = session(); const upstream = stubUpstream([response]); const llm = runtime(value, upstream);
    await drain(llm.stream(spec)); await expect(drain(llm.stream(spec))).rejects.toThrow("token budget exhausted");
    expect(upstream.sent).toHaveLength(1);
    expect(budgetUsageSnapshot(workspace, "default").daily.llmCostUsageComplete).toBe(false);
  });

  test("keeps unknown transport usage unknown and prevents a later spend", async () => {
    const { value, spec } = session(); const upstream = refusingUpstream(new Error("socket failed")); const llm = runtime(value, upstream);
    await expect(drain(llm.stream(spec))).rejects.toThrow();
    const usage = budgetUsageSnapshot(workspace, "default");
    expect(usage.daily.llmRequests).toBe(1); expect(usage.daily.llmTokens).toBe(0);
    expect(usage.daily.llmTokenUsageComplete).toBe(false); expect(usage.daily.unknownLlmTokenRequests).toBe(1);
    await expect(drain(llm.stream(spec))).rejects.toThrow("token usage is unknown");
    expect(upstream.sent).toHaveLength(1);
    const failed = value.readEvents().find(row => row.event_type === "request/failure")!;
    expect(JSON.parse(failed.meta_json).usage).toMatchObject({ reported: false, complete: false });
  });

  test.each([401, 403, 429])("protocol refusal %s consumes a request but does not invent token usage or prevent a bounded retry", async status => {
    const { value, spec } = session(); const upstream = stubUpstream([() => errorResponse(status, { error: { message: "provider refused" } }), response]);
    const llm = runtime(value, upstream);
    await expect(drain(llm.stream(spec))).rejects.toThrow();
    await drain(llm.stream(spec));
    const usage = budgetUsageSnapshot(workspace, "default");
    expect(upstream.sent).toHaveLength(2); expect(usage.daily.llmRequests).toBe(2);
    expect(usage.daily.unknownLlmTokenRequests).toBe(1); expect(usage.daily.blockingUnknownLlmTokenRequests).toBe(0);
    expect(usage.daily.llmTokenUsageComplete).toBe(false);
  });

  test("retains partial usage on a failed stream, and requires an explicitly signed uncertainty waiver to continue", async () => {
    const { value, spec } = session(); const upstream = stubUpstream([response]);
    const adapter: LlmAdapter = { ...anthropicAdapter, decode: async function* () {
      yield { type: "usage", usage: { inputTokens: 2, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 5, reasoningTokens: 2 } };
      yield { type: "finish", reason: { kind: "error", failure: { message: "stream failed", code: "TRANSPORT" } } };
    } };
    const llm = runtime(value, upstream, adapter);
    await expect(drain(llm.stream(spec))).rejects.toThrow("stream failed");
    const failed = value.readEvents().find(row => row.event_type === "request/failure")!;
    expect(JSON.parse(failed.meta_json).usage).toMatchObject({ reported: true, complete: false, inputTokens: 2, outputTokens: 3 });
    expect(budgetUsageSnapshot(workspace, "default").daily.llmTokens).toBe(14);
    await expect(drain(llm.stream(spec))).rejects.toThrow("amc budgets sign");
    expect(upstream.sent).toHaveLength(1);
    limits(config => { config.budgets.perAgent.default!.unknownTokenUsage = "ALLOW_WITH_WARNING"; });
    await drain(runtime(value, upstream).stream(spec));
    expect(upstream.sent).toHaveLength(2);
    expect(evaluateBudgetStatus(workspace, "default").nativeAdmissionPolicy).toMatchObject({ unknownTokenUsage: "ALLOW_WITH_WARNING", costLimit: "known-subtotal-threshold" });
    expect(budgetUsageSnapshot(workspace, "default").daily.llmTokenUsageComplete).toBe(false);
  });

  test("a cancellation before dispatch consumes no model request admission", async () => {
    const { value, spec } = session(); const upstream = stubUpstream([response]); const llm = runtime(value, upstream);
    const abort = new AbortController(); abort.abort();
    await expect(drain(llm.stream({ ...spec, signal: abort.signal }))).rejects.toThrow("cancelled before budget admission");
    expect(upstream.sent).toHaveLength(0);
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
    await drain(llm.stream(spec)); expect(upstream.sent).toHaveLength(1);
  });

  test("deleting a signed reservation breaks the chain and refuses the next transport", async () => {
    const { value, spec } = session(); const upstream = stubUpstream([response]); const llm = runtime(value, upstream);
    await drain(llm.stream(spec));
    const ledger = openLedger(workspace);
    try {
      const reservation = ledger.getAllEvents().find(row => JSON.parse(row.meta_json).auditType === NATIVE_BUDGET_RESERVATION)!;
      // Deliberate on-disk tampering in this disposable fixture. No re-signing
      // or header mutation: every surviving individual signature still verifies.
      ledger.db.exec("DROP TRIGGER no_delete_evidence");
      ledger.db.prepare("DELETE FROM evidence_events WHERE id = ?").run(reservation.id);
    } finally { ledger.close(); }
    expect(() => budgetUsageSnapshot(workspace, "default")).toThrow("chain is incomplete");
    await expect(drain(llm.stream(spec))).rejects.toThrow("chain is incomplete");
    expect(upstream.sent).toHaveLength(1);
  });

  test("reserves the final slot before overlapping independent session dispatches", async () => {
    limits(config => { config.budgets.perAgent.default!.daily.maxLlmRequests = 1; });
    const first = session(); const second = session(); let sent = 0; let release: (() => void) | undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const registry = new AdapterRegistry();
    registry.register({ providerId: "fixture", models: ["fixture"], adapter: anthropicAdapter, baseUrl: "https://fixture.invalid", credentialRef: null });
    const slow = new LlmRuntime({ session: first.value, registry, credentials, transport: async () => { sent++; await pending; return response(); } });
    const firstRun = drain(slow.stream(first.spec));
    const fast = runtime(second.value, { sent: [], transport: async () => { sent++; return response(); } });
    await expect(drain(fast.stream(second.spec))).rejects.toThrow("request budget exhausted");
    expect(sent).toBe(1); release!(); await firstRun;
  });

  test("counts one executed audit per call, separates denials and failures, and blocks at the exact class cap", async () => {
    limits(config => { config.budgets.perAgent.default!.daily.maxToolExecutes.READ_ONLY = 1; });
    const { value } = session(); const tools = pipeline(value);
    const input = { name: "read", agentId: "default", arguments: {}, requestedMode: "EXECUTE" as const };
    expect((await tools.pipeline.execute(input)).ok).toBe(true);
    expect((await tools.pipeline.execute(input)).denied?.guardLabel).toBe("budgets");
    expect((await tools.pipeline.execute({ ...input, name: "failed" })).denied).toBeNull();
    expect((await tools.pipeline.execute({ ...input, name: "failed", arguments: { deny: true } })).denied?.guardLabel).toBe("fixture-deny");
    const used = budgetUsageSnapshot(workspace, "default");
    expect(used.daily.toolExecutes.READ_ONLY).toBe(1); expect(used.daily.toolExecutes.WRITE_LOW).toBe(1);
    expect(used.daily.toolDenied.READ_ONLY).toBe(1); expect(used.daily.toolDenied.WRITE_LOW).toBe(1);
    expect(used.daily.toolPending.READ_ONLY).toBe(0); expect(used.daily.toolPending.WRITE_LOW).toBe(0);
    expect(tools.executed).toBe(2);
  });

  test("missing final recording retains a pending reservation instead of freeing the final tool slot", async () => {
    limits(config => { config.budgets.perAgent.default!.daily.maxToolExecutes.READ_ONLY = 1; });
    const { value } = session(); const tools = pipeline(value, false);
    const input = { name: "read", agentId: "default", arguments: {}, requestedMode: "EXECUTE" as const };
    expect((await tools.pipeline.execute(input)).ok).toBe(true);
    expect((await tools.pipeline.execute(input)).denied?.guardLabel).toBe("budgets");
    const usage = budgetUsageSnapshot(workspace, "default");
    expect(usage.daily.toolExecutes.READ_ONLY).toBe(0); expect(usage.daily.toolPending.READ_ONLY).toBe(1);
    expect(tools.executed).toBe(1);
    const ledger = openLedger(workspace);
    try {
      const reservation = ledger.getAllEvents().find(row => JSON.parse(row.meta_json).auditType === NATIVE_BUDGET_RESERVATION)!;
      expect(ledger.getSessionsBetween(0, Date.now()).find(row => row.session_id === reservation.session_id)?.session_seal_sig).toBeTruthy();
    } finally { ledger.close(); }
  });

  test.each([{ actionClass: "WRITE_LOW" }, { effectiveMode: "SIMULATE" }, { callId: "different-call" }, { agentId: "different-agent" }])(
    "a post-admission execution mutation cannot settle another reservation: %j", async mutation => {
      const { value } = session(); const tools = pipeline(value);
      // JavaScript plugin code can mutate a TypeScript-readonly execution.
      // Its resulting signed disposition must not free the original admission.
      tools.registry.guard("hostile-mutation", execution => { Object.assign(execution, mutation); return undefined; });
      await tools.pipeline.execute({ name: "read", agentId: "default", arguments: {}, requestedMode: "EXECUTE" });
      expect(() => budgetUsageSnapshot(workspace, "default")).toThrow("outcome differs from its signed reservation");
    });

  test("a retained journal seal detects deletion of the final reservation with no successor", async () => {
    const { value } = session(); const tools = pipeline(value, false);
    await tools.pipeline.execute({ name: "read", agentId: "default", arguments: {}, requestedMode: "EXECUTE" });
    const ledger = openLedger(workspace);
    try {
      const tail = ledger.getAllEvents().at(-1)!;
      expect(JSON.parse(tail.meta_json).auditType).toBe(NATIVE_BUDGET_RESERVATION);
      ledger.db.exec("DROP TRIGGER no_delete_evidence");
      ledger.db.prepare("DELETE FROM evidence_events WHERE id = ?").run(tail.id);
    } finally { ledger.close(); }
    expect(() => budgetUsageSnapshot(workspace, "default")).toThrow("session seal");
  });

  test("legacy accounting uses signed canonical payload even when the mutable display payload changes", () => {
    const ledger = openLedger(workspace);
    try {
      ledger.startSession({ sessionId: "legacy-inline", runtime: "amc", binaryPath: "fixture", binarySha256: "a".repeat(64) });
      const eventId = ledger.appendEvidence({ sessionId: "legacy-inline", runtime: "amc", eventType: "tool_action", inline: true,
        payload: JSON.stringify({ actionClass: "READ_ONLY", effectiveMode: "EXECUTE" }), meta: { agentId: "default" } });
      ledger.sealSession("legacy-inline");
      const changed = ledger.db.prepare("UPDATE evidence_events SET payload_inline = ? WHERE id = ?")
        .run(JSON.stringify({ actionClass: "WRITE_LOW", effectiveMode: "SIMULATE" }), eventId);
      expect(changed.changes).toBe(1);
      expect(ledger.getAllEvents().find(row => row.id === eventId)?.payload_inline).toContain("SIMULATE");
    } finally { ledger.close(); }
    const usage = budgetUsageSnapshot(workspace, "default");
    expect(usage.daily.toolExecutes.READ_ONLY).toBe(1); expect(usage.daily.toolExecutes.WRITE_LOW).toBe(0);
  });

  test("a valid legacy empty-session seal does not block budget reads", () => {
    const ledger = openLedger(workspace);
    try {
      ledger.startSession({ sessionId: "legacy-empty", runtime: "amc", binaryPath: "fixture", binarySha256: "a".repeat(64) });
      ledger.sealSession("legacy-empty");
    } finally { ledger.close(); }
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
  });

  test("uses canonical legacy totals once and retains partial/unknown native usage", () => {
    expect(measuredUsage({ total_tokens: 20, input_tokens: 12, inputTokens: 12, output_tokens: 8, outputTokens: 8 }, false).tokens).toBe(20);
    expect(measuredUsage({ inputTokens: 12, input_tokens: 12, outputTokens: 8, output_tokens: 8 }, false).tokens).toBe(20);
    expect(measuredUsage({ reported: true, complete: false, inputTokens: 2, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 5, reasoningTokens: 2 }, true)).toMatchObject({ tokens: 14, tokensKnown: false });
    expect(measuredUsage({ inputTokens: 0, outputTokens: 0 }, true).tokensKnown).toBe(false);
    expect(measuredUsage({ reported: true, complete: true, inputTokens: 0, outputTokens: 0 }, true).tokensKnown).toBe(true);
  });

  test("refuses to sign invalid edited limits without rewriting config or replacing the valid signature", () => {
    const signature = readFileSync(`${budgetsPath(workspace)}.sig`);
    const bytes = "budgets: invalid\n"; writeFileSync(budgetsPath(workspace), bytes);
    expect(() => signBudgetsConfig(workspace)).toThrow();
    expect(readFileSync(budgetsPath(workspace), "utf8")).toBe(bytes);
    expect(readFileSync(`${budgetsPath(workspace)}.sig`).equals(signature)).toBe(true);
  });

  test("outer admission rollback removes a successful nested signed append and its sealed audit session", () => {
    const ledger = openLedger(workspace);
    try {
      const before = ledger.getAllEvents().length;
      expect(() => ledger.db.transaction(() => {
        ledger.startSession({ sessionId: "rolled-back-reservation", runtime: "amc", binaryPath: "budget-test", binarySha256: "a".repeat(64) });
        ledger.appendEvidence({ sessionId: "rolled-back-reservation", runtime: "amc", eventType: "audit", payload: "reservation", meta: { auditType: NATIVE_BUDGET_RESERVATION } });
        ledger.sealSession("rolled-back-reservation");
        throw new Error("deliberate outer rollback");
      }).immediate()).toThrow("deliberate outer rollback");
      expect(ledger.getAllEvents()).toHaveLength(before);
      expect(ledger.getSessionsBetween(0, Date.now()).some(row => row.session_id === "rolled-back-reservation")).toBe(false);
      expect(ledger.db.inTransaction).toBe(false);
    } finally { ledger.close(); }
  });
});
