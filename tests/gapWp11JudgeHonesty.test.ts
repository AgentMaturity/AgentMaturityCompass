/**
 * GAP-WP11: judge settings reach the transport and are recorded; invalid judge
 * output is an `invalid` result, never a measured zero; missing confidence stays
 * missing; failed transport attempts are counted without invented cost.
 * Fetch is synthetic; no provider or credential is used.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMJudgeEngine, type JudgeModelSettings } from "../src/eval/llmJudgeEngine.js";
import { LLMApiClient, LLMApiRequestError, ProductionLLMJudgeEngine, type LLMRequest, type LLMResponse } from "../src/eval/llmApiIntegration.js";
import { AMCJudgeTestRunner } from "../src/eval/amcJudgeIntegration.js";
import { calculateOverallScore } from "../src/eval/extendedLLMJudge.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const okResponse = (text: string): LLMResponse => ({ text, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  cost: 0, responseTimeMs: 1, requestId: "fixture", attempts: 1 });

class ScriptedJudge extends LLMJudgeEngine {
  readonly calls: Array<{ prompt: string; settings?: JudgeModelSettings }> = [];
  constructor(private readonly replies: string[], config: ConstructorParameters<typeof LLMJudgeEngine>[0] = {}) { super(config); }
  protected override async callJudgeModel(prompt: string, settings?: JudgeModelSettings): Promise<string> {
    this.calls.push({ prompt, settings });
    return this.replies.shift() ?? "";
  }
  parse(response: string) { return this.parseJudgeResponse("coherence", response); }
}

describe("judge settings are forwarded end to end and recorded", () => {
  it("the production transport receives every configured setting", async () => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-not-a-real-key");
    const transport = vi.spyOn(LLMApiClient.prototype, "request").mockResolvedValue(okResponse(JSON.stringify({ score: 0.6, explanation: "ok" })));
    const engine = new LLMJudgeEngine({ model: "gpt-4", temperature: 0.7, maxTokens: 321, enableCache: false });
    const result = await engine.evaluateMetric("coherence", { output: "fixture" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toMatchObject({ model: "gpt-4", temperature: 0.7, maxTokens: 321 } satisfies Partial<LLMRequest>);
    expect(result).toMatchObject({ status: "scored", score: 0.6, judge: { model: "gpt-4", temperature: 0.7, maxTokens: 321 } });
    expect(engine.getUsageStats()).toMatchObject({ totalRequests: 1, totalAttempts: 1, failedRequests: 0 });
  });

  it("defaults apply only to settings that were omitted", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-not-a-real-key");
    const transport = vi.spyOn(LLMApiClient.prototype, "request").mockResolvedValue(okResponse("{}"));
    const engine = new ProductionLLMJudgeEngine();
    await engine.callJudgeModel("p");
    await engine.callJudgeModel("p", { temperature: 0 });
    expect(transport.mock.calls[0]![0]).toMatchObject({ model: "claude-3-sonnet-20240229", temperature: 0.1, maxTokens: 1000 });
    expect(transport.mock.calls[1]![0]).toMatchObject({ model: "claude-3-sonnet-20240229", temperature: 0, maxTokens: 1000 });
    await expect(engine.callJudgeModel("p", { maxTokens: 0 })).rejects.toThrow(/maxTokens/);
    await expect(engine.callJudgeModel("p", { temperature: Number.NaN })).rejects.toThrow(/temperature/);
  });

  it("a different model or setting never reuses a cached judgment", async () => {
    const judge = new ScriptedJudge([JSON.stringify({ score: 0.9 })]);
    await judge.evaluateMetric("coherence", { output: "same" });
    const other = new ScriptedJudge([JSON.stringify({ score: 0.2 })], { model: "gpt-4" });
    expect((await other.evaluateMetric("coherence", { output: "same" })).score).toBe(0.2);
    expect(judge.calls[0]!.settings).toEqual({ model: "claude-3-sonnet", temperature: 0.1, maxTokens: 1000 });
  });
});

describe("invalid judge output is not a score", () => {
  const judge = new ScriptedJudge([]);
  it.each([
    ["malformed JSON", "not json"],
    ["refusal prose", "I can't evaluate this."],
    ["JSON null", "null"],
    ["missing score", JSON.stringify({ explanation: "x" })],
    ["string score", JSON.stringify({ score: "0.5" })],
    ["out-of-range score", JSON.stringify({ score: 1.5 })],
    ["negative score", JSON.stringify({ score: -0.1 })],
    ["out-of-range confidence", JSON.stringify({ score: 0.5, confidence: 2 })]
  ])("%s is invalid with no score or confidence", (_name, raw) => {
    expect(judge.parse(raw)).toMatchObject({ status: "invalid", score: null, confidence: null });
  });

  it("a genuine zero score and an explicit zero confidence stay zero; a missing confidence stays missing", () => {
    expect(judge.parse(JSON.stringify({ score: 0, confidence: 0 }))).toMatchObject({ status: "scored", score: 0, confidence: 0 });
    expect(judge.parse(JSON.stringify({ score: 0.4 }))).toMatchObject({ status: "scored", score: 0.4, confidence: null });
  });

  it("an invalid reply is not cached: the next valid reply is returned", async () => {
    const scripted = new ScriptedJudge(["garbage", JSON.stringify({ score: 0.7 })]);
    expect((await scripted.evaluateMetric("coherence", { output: "o" })).status).toBe("invalid");
    expect(await scripted.evaluateMetric("coherence", { output: "o" })).toMatchObject({ status: "scored", score: 0.7 });
    expect(scripted.calls).toHaveLength(2);
  });

  it("aggregates exclude invalid results and fail the test instead of averaging a zero", async () => {
    const invalid = new ScriptedJudge([]).parse("garbage");
    expect(calculateOverallScore([invalid])).toBeNull();
    const runner = new AMCJudgeTestRunner({ categories: [], metrics: ["fluency", "groundedness"], minScoreThreshold: 0.1 });
    const engine = (runner as unknown as { engine: { callJudgeModel(prompt: string): Promise<string> } }).engine;
    vi.spyOn(engine, "callJudgeModel").mockResolvedValueOnce("garbage").mockResolvedValueOnce(JSON.stringify({ score: 0.9 }));
    const result = await runner.evaluateTest({ testId: "t", description: "d", input: "i", output: "o" });
    // The one valid score is not averaged with a fabricated zero, and the invalid metric still fails the test.
    expect(result).toMatchObject({ passed: false, overallScore: 0.9, invalidMetrics: ["fluency"] });
  });
});

describe("transport attempts are kept for failed and retried requests (H2X-12)", () => {
  const request: LLMRequest = { model: "m", prompt: "p", temperature: 0, maxTokens: 1 };
  const client = (maxRetries: number) => new LLMApiClient({ provider: "openai", apiKey: "fixture-not-a-real-key",
    baseUrl: "https://fixture.invalid/v1", timeout: 1000, maxRetries, rateLimit: 1000 });
  const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: "a" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  const fail = () => new Response("", { status: 503, statusText: "Fixture" });

  it("a request that fails once then succeeds reports two attempts", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const responses = [fail(), ok()];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    expect((await client(1).request(request)).attempts).toBe(2);
  });

  it("an exhausted retry throws an error carrying every attempt; the judge counts it with no cost", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail()));
    const error = await client(0).request(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LLMApiRequestError);
    expect((error as LLMApiRequestError).attempts).toBe(1);

    vi.spyOn(LLMApiClient.prototype, "request").mockRejectedValue(new LLMApiRequestError("fixture", 3));
    const engine = new ProductionLLMJudgeEngine("fixture-not-a-real-key", "fixture-not-a-real-key");
    await expect(engine.callJudgeModel("p")).rejects.toThrow("fixture");
    expect(engine.getUsageStats()).toMatchObject({ totalCost: 0, totalRequests: 0, totalAttempts: 3, failedRequests: 1 });
  });
});
