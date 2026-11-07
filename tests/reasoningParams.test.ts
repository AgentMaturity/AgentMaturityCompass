/**
 * SH-PROVIDERS-02: reasoning controls mapped per native provider, refused where the wire is not decoded.
 *
 * Mutation checks: remove the Anthropic `tools !== "none"` refusal → (2) fails; remove the budget bound → (2) fails;
 * let the default branch pass `reasoning_effort` through for openai → (5) fails; drop Gemini's both-given refusal → (3) fails.
 */
import { describe, expect, test } from "vitest";
import { paramsFor } from "../src/cli-agent-options.js";
import { reasoningParamsFor } from "../src/llm/reasoningParams.js";
import { geminiParams } from "../src/llm/providers/geminiContract.js";
import { assertRequestCapabilities, ANTHROPIC_CAPABILITIES, LlmCapabilityError } from "../src/llm/adapter/providerCapabilities.js";

const ctx = { maxTokens: 4096, tools: "none" };

describe("SH-PROVIDERS-02 reasoning params", () => {
  test("(1) nothing asked gives nothing, for every provider", () => {
    for (const id of ["anthropic", "openai", "gemini", "ollama", "deepseek", "groq", "stub"]) expect(reasoningParamsFor(id, {}, ctx)).toEqual({});
  });

  test("(2) Anthropic: enabled needs a bounded budget and a tools-free run; disabled is explicit", () => {
    expect(reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "2048" }, ctx)).toEqual({ thinking: { type: "enabled", budget_tokens: 2048 } });
    expect(reasoningParamsFor("anthropic", { thinking: "disabled" }, ctx)).toEqual({ thinking: { type: "disabled" } });
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled" }, ctx)).toThrow(/requires --thinking-budget/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "512" }, ctx)).toThrow(/at least 1024/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "4096" }, ctx)).toThrow(/below --max-tokens/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "2048" }, { maxTokens: 4096, tools: "workspace" })).toThrow(/only with --tools none/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "2048" }, { maxTokens: 4096 })).toThrow(/only with --tools none/);
    expect(() => reasoningParamsFor("anthropic", { reasoningEffort: "high" }, ctx)).toThrow(/not an Anthropic wire option/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "maybe" }, ctx)).toThrow(/enabled or disabled/);
    expect(() => reasoningParamsFor("anthropic", { thinking: "enabled", thinkingBudget: "12abc" }, ctx)).toThrow(/non-negative integer/);
    // paramsFor keeps the Anthropic default shape and merges the mapping.
    expect(paramsFor("anthropic", 4096, { thinking: "enabled", thinkingBudget: "2048", tools: "none" }))
      .toEqual({ max_tokens: 4096, stream: true, thinking: { type: "enabled", budget_tokens: 2048 } });
  });

  test("(2b) a recorded thinking block is refused at prepare on a later Anthropic turn, before spend (thinking-replay unsupported)", () => {
    expect(() => assertRequestCapabilities(ANTHROPIC_CAPABILITIES, { model: "m", system: null, tools: null, params: { thinking: { type: "enabled", budget_tokens: 2048 } },
      messages: [{ role: "user", parts: [{ kind: "text", text: "q" }] }, { role: "assistant", parts: [{ kind: "thinking", text: "..." }] },
        { role: "user", parts: [{ kind: "text", text: "again" }] }] })).toThrow(LlmCapabilityError);
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
