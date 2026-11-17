import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { budgetsPath, budgetUsageSnapshot, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { nativeUnknownUsageNotice, reserveNativeToolBudget } from "../src/budgets/nativeBudgetAdmission.js";
import { NATIVE_BUDGET_RESERVATION } from "../src/budgets/nativeBudgetUsage.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import { openLedger } from "../src/ledger/ledger.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { SessionService } from "../src/session/sessionService.js";
import type { ToolExecution } from "../src/tools/toolTypes.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";
import { anthropicTextStream, okStream, refusingUpstream, stubUpstream } from "./helpers/llmStubUpstream.js";

let workspace: string;
const sessions: SessionService[] = [];
const credentials: CredentialsService = {
  resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
  set: async () => { throw new Error("unused"); }, unset: async () => false
};
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "amc-budget-minute-caps-"));
  initWorkspaceWithoutActionPolicy({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => {
  for (const session of sessions.splice(0)) { try { session.close({ reason: "completed" }); } catch { /* fixture teardown */ } }
  rmSync(workspace, { recursive: true, force: true });
});
function session(agentId = "default") {
  const value = new SessionService(workspace); sessions.push(value);
  value.open({ agentId, harnessVersion: "budget-test", compositionDigest: "budget-test", policyDigest: "budget-test" });
  const prompt = value.recordSystemPrompt("Budget fixture");
  value.startTurn({ trigger: "user" }); value.recordUserMessage("Read a fixture"); value.startStep();
  return { value, spec: { providerId: "fixture", model: "fixture", params: { max_tokens: 20, stream: true }, systemPromptEventId: prompt.eventId, tools: null } };
}
function runtime(value: SessionService, upstream: ReturnType<typeof stubUpstream>) {
  const registry = new AdapterRegistry();
  registry.register({ providerId: "fixture", models: ["fixture"], adapter: anthropicAdapter, baseUrl: "https://fixture.invalid", credentialRef: null });
  return new LlmRuntime({ session: value, registry, credentials, transport: upstream.transport });
}
const response = () => okStream(anthropicTextStream({ text: ["done"], inputTokens: 10, outputTokens: 3, cacheReadTokens: 2 }));
async function drain(stream: AsyncIterable<unknown>) { for await (const _ of stream) { /* consume */ } }
function limits(edit: (config: ReturnType<typeof loadBudgetsConfig>) => void) {
  const config = loadBudgetsConfig(workspace); edit(config);
  writeFileSync(budgetsPath(workspace), YAML.stringify(config)); signBudgetsConfig(workspace);
}
function execution(agentId: string, extra: Partial<ToolExecution> = {}): ToolExecution {
  return { token: `tok-${Math.random()}`, callId: "call-1", rootCallId: "call-1", name: "fs.read", agentId, workspace, actionClass: "READ_ONLY",
    requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: {}, parentToken: null, ...extra } as ToolExecution;
}
const reservations = () => {
  const ledger = openLedger(workspace);
  try { return ledger.getAllEvents().filter(row => JSON.parse(row.meta_json).auditType === NATIVE_BUDGET_RESERVATION).length; }
  finally { ledger.close(); }
};

describe("native budget admission: per-minute caps and identity", () => {
  test("the per-minute request cap refuses the next dispatch and says the wait is the current minute", async () => {
    limits(config => { config.budgets.perAgent.default!.perMinute.maxLlmRequests = 1; });
    const { value, spec } = session(); const upstream = stubUpstream([response, response]); const llm = runtime(value, upstream);
    await drain(llm.stream(spec));
    const refused = drain(llm.stream(spec));
    await expect(refused).rejects.toThrow("native model request budget exhausted: 1 of 1 requests used in the last minute for agent default");
    await expect(refused).rejects.toThrow("refused until the current minute passes");
    await expect(refused).rejects.toThrow("edit budgets.perAgent.default in .amc/budgets.yaml and run amc budgets sign");
    expect(upstream.sent).toHaveLength(1);
  });

  test("the per-minute token cap refuses the next dispatch once the minute's counted tokens reach it", async () => {
    limits(config => { config.budgets.perAgent.default!.perMinute.maxLlmTokens = 15; config.budgets.perAgent.default!.daily.maxLlmTokens = 1_000_000; });
    const { value, spec } = session(); const upstream = stubUpstream([response, response]); const llm = runtime(value, upstream);
    await drain(llm.stream(spec));
    expect(budgetUsageSnapshot(workspace, "default").minute.llmTokens).toBe(15);
    await expect(drain(llm.stream(spec))).rejects.toThrow("native model token budget exhausted: 15 of 15 tokens counted in the last minute for agent default; new model requests are refused until the current minute passes");
    expect(upstream.sent).toHaveLength(1);
  });

  test("a tool call cannot move its spend to another agent than the native session's owner", () => {
    const { value } = session("owner");
    expect(reserveNativeToolBudget(execution("intruder"), value.sessionId)).toBe("native budget identity differs from the session owner");
    expect(reservations()).toBe(0);
    expect(reserveNativeToolBudget(execution("owner"), value.sessionId)).toBeUndefined();
    expect(reservations()).toBe(1);
  });

  test("a tool call that does not execute, or was cancelled, reserves nothing", () => {
    const { value } = session();
    const aborted = new AbortController(); aborted.abort();
    expect(reserveNativeToolBudget(execution("default", { effectiveMode: "SIMULATE" } as Partial<ToolExecution>), value.sessionId)).toBeUndefined();
    expect(reserveNativeToolBudget(execution("default", { signal: aborted.signal } as Partial<ToolExecution>), value.sessionId)).toBe("native tool cancelled before budget admission");
    expect(reservations()).toBe(0);
  });

  test("the unknown-usage notice gives no verdict when the budget evidence does not verify", async () => {
    const { value, spec } = session(); const llm = runtime(value, refusingUpstream(new Error("socket failed")));
    await expect(drain(llm.stream({ ...spec, params: { stream: true } }))).rejects.toThrow();
    expect(nativeUnknownUsageNotice(workspace, "default")).toMatch(/^1 earlier model request\(s\) for agent default/);
    const ledger = openLedger(workspace);
    try {
      const reservation = ledger.getAllEvents().find(row => JSON.parse(row.meta_json).auditType === NATIVE_BUDGET_RESERVATION)!;
      // Deliberate tampering in this disposable fixture: the budget chain no longer verifies.
      ledger.db.exec("DROP TRIGGER no_delete_evidence");
      ledger.db.prepare("DELETE FROM evidence_events WHERE id = ?").run(reservation.id);
    } finally { ledger.close(); }
    expect(() => budgetUsageSnapshot(workspace, "default")).toThrow("chain is incomplete");
    expect(nativeUnknownUsageNotice(workspace, "default")).toBeNull();
  });
});
