/** Native generic-client compatibility only; fetch is synthetic and no provider or credential is used. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMApiClient, type LLMRequest } from "../../../src/eval/llmApiIntegration.js";

const request: LLMRequest = { model: "fixture-model", system: "fixture-system", prompt: "fixture-user",
  temperature: 0.25, maxTokens: 17, requestId: "fixture-request" };
const providers = ["openai", "anthropic"] as const;
const client = (provider: typeof providers[number]) => new LLMApiClient({ provider,
  apiKey: "fixture-not-a-real-key", baseUrl: provider === "openai" ? "https://fixture.invalid/v1" : "https://fixture.invalid",
  timeout: 1000, maxRetries: 0, rateLimit: 1000 });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("P2-27 shared provider dispatch legacy compatibility", () => {
  it.each(providers)("preserves %s wire bytes, auth headers and legacy JSON decoding", async provider => {
    const response = new Response(JSON.stringify(provider === "openai"
      ? { choices: [{ message: { content: "fixture-answer" } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }
      : { content: [{ text: "fixture-answer" }], usage: { input_tokens: 2, output_tokens: 3 } }));
    const decode = vi.spyOn(response, "json");
    const transport = vi.fn(async () => response); vi.stubGlobal("fetch", transport);
    const result = await client(provider).request(request);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(provider === "openai" ? "https://fixture.invalid/v1/chat/completions" : "https://fixture.invalid/v1/messages");
    expect(init.method).toBe("POST"); expect(init.redirect).toBe("manual"); expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toEqual(provider === "openai"
      ? { Authorization: "Bearer fixture-not-a-real-key", "Content-Type": "application/json" }
      : { "x-api-key": "fixture-not-a-real-key", "Content-Type": "application/json", "anthropic-version": "2023-06-01" });
    expect(init.body).toBe(JSON.stringify(provider === "openai"
      ? { model: request.model, messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }],
          temperature: request.temperature, max_tokens: request.maxTokens }
      : { model: request.model, messages: [{ role: "user", content: request.prompt }], system: request.system,
          temperature: request.temperature, max_tokens: request.maxTokens }));
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ text: "fixture-answer", requestId: request.requestId,
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } });
    expect(result).not.toHaveProperty("wireRequestSha256"); expect(result).not.toHaveProperty("wireResponseSha256");
    expect(result).not.toHaveProperty("responseModel");
  });

  it.each(providers)("preserves %s generic error label without reading or strict-canceling the body", async provider => {
    const response = new Response("fixture-error-body", { status: 429, statusText: "FixtureThrottle" });
    const decode = vi.spyOn(response, "json"), cancel = vi.spyOn(response.body!, "cancel");
    const transport = vi.fn(async () => response); vi.stubGlobal("fetch", transport);
    await expect(client(provider).request(request)).rejects.toThrow(
      `API request failed after 1 attempts: ${provider === "openai" ? "OpenAI" : "Anthropic"} API error: 429 FixtureThrottle`);
    expect(transport).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
  });
});
