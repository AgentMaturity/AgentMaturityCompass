import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig, budgetUsageSnapshot } from "../src/budgets/budgets.js";
import { reserveNativeModelBudget } from "../src/budgets/nativeBudgetAdmission.js";
import { projectBudgetUsage, NATIVE_BUDGET_RESERVATION } from "../src/budgets/nativeBudgetUsage.js";
import type { EvidenceEvent } from "../src/types.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { okStream, stubUpstream } from "./helpers/llmStubUpstream.js";
import { nativeUsdUnits } from "../src/budgets/nativeUsdAmount.js";

let workspace: string;
let session: SessionService;
const endpoint = "https://api.openai.com/v1/chat/completions";
const bound = () => ({ providerId: "openai", model: "gpt-4o", encoderId: "openai-chat", encoderVersion: 3,
  endpoint, maxRequestBytes: 10000, maxOutputTokens: 20, maxCostUsd: 0.6,
  source: "auditor-attested worst-case fixture ceiling", expiresAt: new Date(Date.now() + 3600000).toISOString() });
function policy(bounds: unknown[] = [bound()], cap: number | null = 1) {
  const config = loadBudgetsConfig(workspace);
  const agent = config.budgets.perAgent.default!;
  agent.unknownTokenUsage = "ALLOW_WITH_WARNING";
  const daily = agent.daily as Record<string, unknown>;
  if (cap === null) delete daily.maxCostUsd; else daily.maxCostUsd = cap;
  Object.assign(agent, { nativeUsdBounds: bounds });
  writeFileSync(budgetsPath(workspace), YAML.stringify(config)); signBudgetsConfig(workspace);
}
function request(extra: Record<string, unknown> = {}, wireExtra: Record<string, unknown> = {}, encoderId = "openai-chat") {
  const params = { [encoderId === "openai-responses" ? "max_output_tokens" : "max_tokens"]: 20, ...extra };
  const messages = [{ role: "user", content: "hi" }];
  const body = Buffer.from(JSON.stringify({ model: "gpt-4o", [encoderId === "openai-responses" ? "input" : "messages"]: messages, stream: true, ...params, ...wireExtra }));
  const prepared = session.recordRequestHeader({ providerId: "openai", model: "gpt-4o", encoderId, encoderVersion: 3,
    params, systemPromptEventId: "prompt", toolSchema: null, projectionCutoffEventId: "message", projectionDigest: "projection",
    sourceEventIds: [], requestBytes: body });
  return { header: prepared.headerEventId, dispatch: { url: endpoint, body } };
}
const reserve = (r: ReturnType<typeof request>) => reserveNativeModelBudget(session, r.header, r.dispatch);
describe("signed native prospective USD admission", () => {
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-usd-reserve-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    session = new SessionService(workspace);
    session.open({ agentId: "default", harnessVersion: "test", compositionDigest: "test", policyDigest: "test" });
  });
  afterEach(() => { session.close({ reason: "completed" }); rmSync(workspace, { recursive: true, force: true }); });
  it("refuses indicative catalog pricing without a signed request bound", () => {
    policy([]); expect(() => reserve(request())).toThrow(/USD.*bound/i);
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
  });
  it("reserves before dispatch and prevents overlapping spend despite token uncertainty waiver", () => {
    policy(); reserve(request());
    const usage = budgetUsageSnapshot(workspace, "default");
    expect(usage.daily).toMatchObject({ llmCostUsd: 0, llmReservedCostUsd: 0.6, llmBudgetCostUsd: 0.6 });
    expect(() => reserve(request())).toThrow(/USD.*exhausted/i);
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(1);
  });
  it("admits exact remaining capacity and never rounds a small overrun down", () => {
    policy([bound()], 1.2); reserve(request()); reserve(request());
    expect(() => reserve(request())).toThrow(/USD.*exhausted/i);
    policy([bound()], 1.199999999999); expect(() => reserve(request())).toThrow(/USD.*exhausted/i);
  });
  it("does not accumulate decimal rounding credit", () => {
    policy([{ ...bound(), maxCostUsd: 0.1 }], 0.9999999999999999);
    for (let i = 0; i < 9; i++) reserve(request());
    expect(() => reserve(request())).toThrow(/USD.*exhausted/i);
  });
  it.each(["destination", "body", "expiry", "duplicate", "output", "premium", "multiple", "bytes", "provider", "model", "encoder", "version"])("refuses an uncovered %s request", kind => {
    const ceiling = bound();
    if (kind === "expiry") ceiling.expiresAt = new Date(Date.now() - 1).toISOString();
    if (kind === "bytes") ceiling.maxRequestBytes = 1;
    if (kind === "provider") ceiling.providerId = "other";
    if (kind === "model") ceiling.model = "other";
    if (kind === "encoder") ceiling.encoderId = "other";
    if (kind === "version") ceiling.encoderVersion = 99;
    policy(kind === "duplicate" ? [ceiling, ceiling] : [ceiling]);
    const r = request(kind === "output" ? { max_tokens: 21 } : kind === "premium" ? { service_tier: "priority" } : kind === "multiple" ? { n: 2 } : {});
    if (kind === "destination") r.dispatch.url = "https://untrusted.invalid/v1/chat/completions";
    if (kind === "body") r.dispatch.body = Buffer.from(JSON.stringify({ model: "gpt-4o", messages: [], max_tokens: 20 }));
    expect(() => reserve(r)).toThrow();
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
  });
  it("supports explicitly signed token-only policy with no invented USD reservation", () => {
    policy([], null); reserve(request());
    expect(budgetUsageSnapshot(workspace, "default").daily).toMatchObject({ llmRequests: 1, llmCostUsd: 0, llmReservedCostUsd: 0 });
  });
  it.each(["image", "document", "input_audio", "video"])("refuses a typed %s media block", type => {
    policy();
    expect(() => reserve(request({}, { messages: [{ role: "user", content: [{ type, source: { type: "base64", data: "YQ==" } }] }] }))).toThrow(/media/i);
  });
  it.each(["openai-chat", "openai-responses", "anthropic-messages"].flatMap(encoderId =>
    ["unknown type", "x_url", "nested source"].map(kind => ({ encoderId, kind }))
  ))("refuses $kind under a hard USD ceiling for $encoderId", ({ encoderId, kind }) => {
    policy([{ ...bound(), encoderId }]);
    const field = encoderId === "openai-responses" ? "input" : "messages";
    const type = encoderId === "openai-responses" ? "input_text" : "text";
    const part = kind === "unknown type" ? { type: "future_media", text: "hi", payload: "YQ==" }
      : kind === "x_url" ? { type, text: "hi", x_url: "https://media.invalid/asset" }
      : { type, text: "hi", metadata: { layers: [{ source: "YQ==" }] } };
    expect(() => reserve(request({}, { [field]: [{ role: "user", content: [part] }] }, encoderId))).toThrow(/media/i);
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
  });
  it.each(["x_url", "file", "profile", "source", "resource"])("refuses a nested %s suffix even with an empty value", key => {
    policy();
    expect(() => reserve(request({}, { messages: [{ role: "user", content: [{ type: "text", text: "hi", nested: [{ [key]: null }] }] }] }))).toThrow(/media/i);
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
  });
  it.each([
    ["openai-chat", "input_text"], ["openai-chat", "tool_result"],
    ["openai-responses", "text"], ["anthropic-messages", "output_text"]
  ])("refuses a %s part outside that encoder's text allowlist: %s", (encoderId, type) => {
    policy([{ ...bound(), encoderId }]);
    const field = encoderId === "openai-responses" ? "input" : "messages";
    expect(() => reserve(request({}, { [field]: [{ role: "user", content: [{ type, text: "hi", content: "hi" }] }] }, encoderId))).toThrow(/media/i);
  });
  it.each([
    ["openai-chat", { messages: [{ role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: null, tool_calls: [{ type: "function", id: "c1", function: { name: "echo", arguments: "{}" } }] }],
      tools: [{ type: "function", function: { name: "echo", parameters: { type: "object", properties: { content: { type: "string" } } } } }] }],
    ["openai-responses", { input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] },
      { role: "assistant", content: [{ type: "output_text", text: "done" }] },
      { type: "function_call", call_id: "c1", name: "echo", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "done" }] }],
    ["anthropic-messages", { system: [{ type: "text", text: "system", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "assistant", content: [{ type: "tool_use", id: "c1", name: "echo", input: { text: "hi" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: [{ type: "text", text: "done" }], cache_control: { type: "ephemeral" } }] }],
      tools: [{ name: "echo", input_schema: { type: "object", properties: { text: { type: "string" } } } }] }]
  ])("admits covered text and function structures for %s", (encoderId, wire) => {
    policy([{ ...bound(), encoderId }]); reserve(request({}, wire, encoderId));
    expect(budgetUsageSnapshot(workspace, "default").daily).toMatchObject({ llmRequests: 1, llmReservedCostUsd: 0.6 });
  });
  it.each([
    { type: "text", text: 17 },
    { text: "untyped" },
    { type: "tool_result", tool_use_id: "c1", content: [{ type: "future_media", payload: "YQ==" }] },
    { type: "tool_use", id: "c1", name: "echo", input: { nested: { type: "future_media", payload: "YQ==" } } },
    { type: "tool_result", tool_use_id: "c1", content: [{ type: "tool_use", id: "c2", name: "echo", input: {} }] },
    { type: "text", text: "hi", cache_control: { type: "future_media" } },
    { type: "text", text: "hi", cache_control: { type: "ephemeral", ttl: "1h" } }
  ])("refuses non-text or nested unknown Anthropic content %j", part => {
    policy([{ ...bound(), encoderId: "anthropic-messages" }]);
    expect(() => reserve(request({}, { messages: [{ role: "user", content: [part] }] }, "anthropic-messages"))).toThrow(/media/i);
  });
  it.each([
    { type: "future_media", content: "hi", payload: "YQ==" },
    { type: "function_call", call_id: "c1", name: "echo", arguments: "{}", content: [{ type: "future_media", text: "hi" }] },
    { type: "function_call_output", call_id: "c1", output: "done", content: [{ type: "future_media", text: "hi" }] }
  ])("refuses unknown Responses input envelopes or added media %j", item => {
    policy([{ ...bound(), encoderId: "openai-responses" }]);
    expect(() => reserve(request({}, { input: [item] }, "openai-responses"))).toThrow(/media/i);
  });
  it("refuses non-text Responses instructions", () => {
    policy([{ ...bound(), encoderId: "openai-responses" }]);
    expect(() => reserve(request({}, { instructions: { type: "future_media", text: "hi" } }, "openai-responses"))).toThrow(/media/i);
  });
  it("refuses a malformed content type instead of coercing it to text", () => {
    policy();
    expect(() => reserve(request({}, { messages: [{ role: "user", content: [{ type: ["text"], text: "hi" }] }] }))).toThrow(/media/i);
  });
  it("refuses unmodeled Anthropic tool cache settings", () => {
    policy([{ ...bound(), encoderId: "anthropic-messages" }]);
    expect(() => reserve(request({}, { tools: [{ name: "echo", input_schema: { type: "object" },
      cache_control: { type: "ephemeral", ttl: "1h" } }] }, "anthropic-messages"))).toThrow(/hosted tools/i);
  });
  it("leaves text-only validation disabled for a token-only budget", () => {
    policy([], null);
    reserve(request({}, { messages: [{ role: "user", content: [{ type: "future_media", x_url: "https://media.invalid/asset" }] }] }));
    expect(budgetUsageSnapshot(workspace, "default").daily).toMatchObject({ llmRequests: 1, llmReservedCostUsd: 0 });
  });
  it("refuses hosted tools under a standard text request ceiling", () => {
    policy(); expect(() => reserve(request({}, { tools: [{ type: "web_search" }] }))).toThrow(/hosted tools/i);
  });
  it("requires an explicit wire output limit", () => {
    policy(); expect(() => reserve(request({}, { max_tokens: undefined }))).toThrow(/output limit/i);
  });
  it("cannot use a token-only historical dispatch to bypass a newly enabled USD ceiling", () => {
    policy([], null); reserve(request()); policy();
    expect(() => reserve(request())).toThrow(/USD.*unknown/i);
  });
  it("passes the actual dispatch through the runtime and retains token-only response reservations", async () => {
    policy([{ ...bound(), encoderVersion: 4 }]);
    const prompt = session.recordSystemPrompt("USD test");
    session.startTurn({ trigger: "user" }); session.recordUserMessage("hi"); session.startStep();
    const upstream = stubUpstream([() => okStream([
      { data: JSON.stringify({ choices: [{ index: 0, delta: { content: "done" }, finish_reason: null }] }) },
      { data: JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) },
      { data: JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) }, { data: "[DONE]" }
    ])]);
    const registry = new AdapterRegistry(); registry.register({ providerId: "openai", models: ["gpt-4o"], adapter: openaiAdapter,
      baseUrl: "https://api.openai.com", credentialRef: null });
    const runtime = new LlmRuntime({ session, registry, transport: upstream.transport, credentials: {
      resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
      set: async () => {}, unset: async () => false
    } });
    const run = async () => { for await (const _ of runtime.stream({ providerId: "openai", model: "gpt-4o", params: { max_tokens: 20 },
      systemPromptEventId: prompt.eventId, tools: null })) { /* drain */ } };
    await run(); await expect(run()).rejects.toThrow(/USD.*exhausted/i);
    expect(upstream.sent).toHaveLength(1);
    expect(budgetUsageSnapshot(workspace, "default").daily).toMatchObject({ llmCostUsd: 0, llmReservedCostUsd: 0.6 });
  });
});

describe("USD reservation settlement projection", () => {
  const now = Date.now();
  function rows(values: Record<string, unknown> | null, age = 0, failed = false): EvidenceEvent[] {
    const at = now - age;
    const event = (id: string, event_type: EvidenceEvent["event_type"], meta: Record<string, unknown>, ts = at) =>
      ({ id, session_id: "native", event_type, ts, meta_json: JSON.stringify(meta) }) as EvidenceEvent;
    return [event("open", "session/open", { agentId: "default" }),
      event("header", "request/header", { providerId: "openai", requestDigest: "digest" }),
      { ...event("reservation", "audit", { auditType: NATIVE_BUDGET_RESERVATION, agentId: "default", kind: "llm", reservationKey: "llm:native:header",
        nativeSessionId: "native", headerEventId: "header", reservedCostUsd: 0.6 }), session_id: "journal" },
      ...(values === null ? [] : [event("outcome", failed ? "request/failure" : "request/response", {
        headerEventId: "header", requestDigest: "digest", providerId: "openai", outcome: failed ? "failed" : "completed", dispatchAttempted: true, usage: values }, now)])];
  }
  it("settles only a complete measured cost and keeps catalog estimates outside measured usage", () => {
    expect(projectBudgetUsage(rows({ reported: true, complete: true, inputTokens: 1, outputTokens: 1, costUsd: 0.2 }), "default", now).daily)
      .toMatchObject({ llmCostUsd: 0.2, llmReservedCostUsd: 0, llmBudgetCostUsd: 0.2 });
  });
  it.each([{}, { costUsd: 0 }, { reported: false, complete: true, costUsd: 0 }, { reported: true, complete: false, costUsd: 0.1 },
    { reported: true, complete: true, estimatedCostUsd: 0.1 }])("retains unknown or partial spend %j", usage => {
    expect(projectBudgetUsage(rows(usage), "default", now).daily).toMatchObject({ llmReservedCostUsd: 0.6, llmBudgetCostUsd: 0.6 });
  });
  it("retains pending exposure across midnight and failed streams", () => {
    expect(projectBudgetUsage(rows(null, 86400000), "default", now).daily.llmReservedCostUsd).toBe(0.6);
    expect(projectBudgetUsage(rows({ reported: true, complete: true, costUsd: 0.1 }, 0, true), "default", now).daily.llmReservedCostUsd).toBe(0.6);
  });
  it("never hides measured cost exceeding its reservation", () => {
    expect(projectBudgetUsage(rows({ reported: true, complete: false, costUsd: 0.9 }), "default", now).daily.llmBudgetCostUsd).toBe(0.9);
  });
  it("refuses a settlement from another session", () => {
    const evidence = rows({ reported: true, complete: true, costUsd: 0 }); evidence.at(-1)!.session_id = "other";
    expect(() => projectBudgetUsage(evidence, "default", now)).toThrow(/matching header|session/i);
  });
  it("refuses a settlement naming another provider", () => {
    const evidence = rows({ reported: true, complete: true, costUsd: 0 });
    evidence.at(-1)!.meta_json = evidence.at(-1)!.meta_json.replace('"providerId":"openai"', '"providerId":"other"');
    expect(() => projectBudgetUsage(evidence, "default", now)).toThrow(/matching header|provider/i);
  });
  it("retains unknown historical USD without a reservation across midnight", () => {
    const evidence = rows({ reported: true, complete: true, inputTokens: 1, outputTokens: 1 }, 86400000)
      .filter(row => row.id !== "reservation");
    expect(projectBudgetUsage(evidence, "default", now).daily.llmUnreservedCostRequests).toBe(1);
  });
  it.each([-1, NaN, Infinity])("refuses an invalid monetary amount %s", value => {
    expect(() => nativeUsdUnits(value)).toThrow("Invalid USD amount");
  });
  it.each([0, -1, "0.6"])("refuses an invalid signed reservation amount %j", reservedCostUsd => {
    const evidence = rows(null);
    const reservation = evidence.find(row => row.id === "reservation")!;
    reservation.meta_json = JSON.stringify({ ...JSON.parse(reservation.meta_json), reservedCostUsd });
    expect(() => projectBudgetUsage(evidence, "default", now)).toThrow("reservation amount is invalid");
  });
  it("rounds exposure upward and capacity downward at trillionth-dollar resolution", () => {
    expect(nativeUsdUnits(1.1e-12)).toBe(2n); expect(nativeUsdUnits(1.1e-12, false)).toBe(1n);
  });
  it.each([{ reported: false, complete: true }, { reported: true, complete: false }])("retains incomplete legacy USD exposure %j", provenance => {
    const evidence = { id: "legacy", session_id: "legacy", event_type: "llm_response", ts: now - 86400000,
      meta_json: JSON.stringify({ agentId: "default", usage: { costUsd: 0.1, ...provenance } }) } as EvidenceEvent;
    expect(projectBudgetUsage([evidence], "default", now).daily.llmUnreservedCostRequests).toBe(1);
  });
});
