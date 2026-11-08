/**
 * SH-PROVIDERS-02: reasoning controls mapped per native provider, refused where the wire is not decoded.
 *
 * Mutation checks: remove the Anthropic `tools !== "none"` refusal → (2) fails; remove the budget bound → (2) fails;
 * let the default branch pass `reasoning_effort` through for openai → (5) fails; drop Gemini's both-given refusal → (3) fails;
 * drop the Anthropic effort vocabulary check → (2) fails on "HIGH"; send adaptive for a budget → (2) fails.
 */
import { describe, expect, test } from "vitest";
import { nativeRouteFor, paramsFor } from "../src/cli-agent-options.js";
import { reasoningParamsFor } from "../src/llm/reasoningParams.js";
import { geminiParams } from "../src/llm/providers/geminiContract.js";
import { assertRequestCapabilities, ANTHROPIC_CAPABILITIES, LlmCapabilityError } from "../src/llm/adapter/providerCapabilities.js";
import { parseRequestHeaderMeta } from "../src/session/requestHeaderMeta.js";
import { drain, runtimeHarness } from "./helpers/fixtureProviderHarness.js";
import { anthropicTextStream } from "./helpers/llmStubUpstream.js";

const ctx = { maxTokens: 4096, tools: "none" };

describe("SH-PROVIDERS-02 reasoning params", () => {
  test("(1) nothing asked gives nothing, for every provider", () => {
    for (const id of ["anthropic", "openai", "gemini", "ollama", "deepseek", "groq", "stub"]) expect(reasoningParamsFor(id, {}, ctx)).toEqual({});
  });

  test("(2) Anthropic: adaptive or a bounded manual budget, tools-free; effort verbatim; disabled is explicit", () => {
    expect(reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "2048" }, ctx)).toEqual({ thinking: { type: "enabled", budget_tokens: 2048 } });
    expect(reasoningParamsFor("anthropic", { thinking: "disabled" }, ctx)).toEqual({ thinking: { type: "disabled" } });
    // Opus fix: Claude 4.7 and later reject manual thinking with a 400, so enabled without a budget is adaptive thinking,
    // and --reasoning-effort is output_config.effort (the old assertions refused both, calling effort no Anthropic option).
    expect(reasoningParamsFor("anthropic", { thinking: "enabled" }, ctx)).toEqual({ thinking: { type: "adaptive" } });
    expect(reasoningParamsFor("anthropic", { thinking: "enabled", reasoningEffort: "max" }, ctx)).toEqual({ thinking: { type: "adaptive" }, output_config: { effort: "max" } });
    expect(reasoningParamsFor("anthropic", { thinkingBudget: "2048", reasoningEffort: "low" }, ctx)).toEqual({ thinking: { type: "enabled", budget_tokens: 2048 }, output_config: { effort: "low" } });
    // Effort alone asks for no thinking block, so it is admitted beside tools; thinking is not.
    expect(reasoningParamsFor("anthropic", { reasoningEffort: "xhigh" }, { maxTokens: 4096, tools: "workspace" })).toEqual({ output_config: { effort: "xhigh" } });
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled" }, { maxTokens: 4096, tools: "workspace" })).toThrow(/only with --tools none/);
    expect(() => reasoningParamsFor("anthropic", { reasoningEffort: "HIGH" }, ctx)).toThrow(/low, medium, high, xhigh, max/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "disabled", thinkingBudget: "2048" }, ctx)).toThrow(/takes no --thinking-budget/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "512" }, ctx)).toThrow(/at least 1024/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "4096" }, ctx)).toThrow(/below --max-tokens/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "2048" }, { maxTokens: 4096, tools: "workspace" })).toThrow(/only with --tools none/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "2048" }, { maxTokens: 4096 })).toThrow(/only with --tools none/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "maybe" }, ctx)).toThrow(/enabled or disabled/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "12abc" }, ctx)).toThrow(/non-negative integer/);
    // paramsFor keeps the Anthropic default shape and merges the mapping; admission needs thinking output for adaptive.
    expect(paramsFor("anthropic", 4096, { thinking: "enabled", thinkingBudget: "2048", tools: "none" }))
      .toEqual({ max_tokens: 4096, stream: true, thinking: { type: "enabled", budget_tokens: 2048 } });
    const adaptive = paramsFor("anthropic", 4096, { thinking: "enabled", reasoningEffort: "medium", tools: "none" });
    expect(adaptive).toEqual({ max_tokens: 4096, stream: true, thinking: { type: "adaptive" }, output_config: { effort: "medium" } });
    expect(() => assertRequestCapabilities(ANTHROPIC_CAPABILITIES, { model: "m", system: null, tools: null, params: adaptive,
      messages: [{ role: "user", parts: [{ kind: "text", text: "q" }] }] })).not.toThrow();
  });

  test("(2b) a recorded thinking block is refused at prepare on a later Anthropic turn, before spend (thinking-replay unsupported)", () => {
    expect(() => assertRequestCapabilities(ANTHROPIC_CAPABILITIES, { model: "m", system: null, tools: null, params: { thinking: { type: "enabled", budget_tokens: 2048 } },
      messages: [{ role: "user", parts: [{ kind: "text", text: "q" }] }, { role: "assistant", parts: [{ kind: "thinking", text: "..." }] },
        { role: "user", parts: [{ kind: "text", text: "again" }] }] })).toThrow(LlmCapabilityError);
  });

  test("(2c) the Anthropic mapping reaches the wire and the signed header unchanged", async () => {
    const sse = anthropicTextStream({ text: ["hi"], inputTokens: 10, outputTokens: 3 }).map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join("");
    const h = await runtimeHarness({ responses: [sse], model: "claude-x",
      params: paramsFor("anthropic", 4096, { thinking: "enabled", reasoningEffort: "high", tools: "none" }),
      route: (origin) => nativeRouteFor("anthropic", { baseUrl: origin, credential: "AMC_PI_FIXTURE_KEY" }, "claude-x") });
    const call = h.runtime.prepare(h.spec());
    await drain(call.stream());
    h.finishStep(call);
    const header = h.session.readEvents().find((e) => e.event_type === "request/header")!;
    h.close();
    const body = JSON.parse(h.received[0]!.body.toString("utf8")) as Record<string, unknown>;
    expect(body).toMatchObject({ thinking: { type: "adaptive" }, output_config: { effort: "high" }, max_tokens: 4096 });
    expect(parseRequestHeaderMeta(header.meta_json)!.params).toMatchObject({ thinking: { type: "adaptive" }, output_config: { effort: "high" } });
  });

  test("(3) Gemini: includeThoughts, thinkingBudget or thinkingLevel verbatim, validated by the contract", () => {
    expect(paramsFor("gemini", 64, { thinking: "enabled", thinkingBudget: "1024" }))
      .toEqual({ generationConfig: { maxOutputTokens: 64, thinkingConfig: { includeThoughts: true, thinkingBudget: 1024 } } });
    expect(paramsFor("gemini", 64, { reasoningEffort: "HIGH" })).toEqual({ generationConfig: { maxOutputTokens: 64, thinkingConfig: { thinkingLevel: "HIGH" } } });
    expect(paramsFor("gemini", 64, { thinking: "disabled" })).toEqual({ generationConfig: { maxOutputTokens: 64, thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } } });
    expect(() => paramsFor("gemini", 64, { reasoningEffort: "high" })).toThrow(/MINIMAL, LOW, MEDIUM, HIGH/);
    expect(() => paramsFor("gemini", 64, { thinkingBudget: "10", reasoningEffort: "LOW" })).toThrow(/not both/);
    expect(() => paramsFor("gemini", 64, { thinking: "disabled", thinkingBudget: "10" })).toThrow(/conflicts/);
    expect(() => geminiParams(paramsFor("gemini", 64, { thinking: "enabled", thinkingBudget: "1024" }))).not.toThrow();
  });

  test("(4) Ollama: think boolean or an exact level, never both", () => {
    expect(paramsFor("ollama", 64, { thinking: "enabled" })).toMatchObject({ think: true });
    expect(paramsFor("ollama", 64, { thinking: "disabled" })).toMatchObject({ think: false });
    expect(paramsFor("ollama", 64, { reasoningEffort: "high" })).toMatchObject({ think: "high" });
    expect(() => paramsFor("ollama", 64, { reasoningEffort: "HIGH" })).toThrow(/low, medium, high, max/);
    expect(() => paramsFor("ollama", 64, { thinking: "enabled", reasoningEffort: "low" })).toThrow(/not both/);
    expect(() => paramsFor("ollama", 64, { thinkingBudget: "5" })).toThrow(/not an Ollama wire option/);
  });

  test("(5) DeepSeek is unchanged; OpenAI, compat, Azure and the stub are refused with the limit named (D-05)", () => {
    expect(paramsFor("deepseek", 64, { thinking: "enabled", reasoningEffort: "high" })).toMatchObject({ thinking: { type: "enabled" }, reasoning_effort: "high" });
    expect(() => paramsFor("deepseek", 64, { thinkingBudget: "5" })).toThrow(/not a DeepSeek wire option/);
    for (const id of ["openai", "openai-responses", "groq", "azure-openai", "stub"]) {
      expect(() => paramsFor(id, 64, { reasoningEffort: "high" })).toThrow(/not admitted for provider/);
      expect(() => paramsFor(id, 64, { thinking: "enabled" })).toThrow(/D-05/);
    }
  });
});
