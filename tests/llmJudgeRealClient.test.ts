import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LLMJudgeEngine } from "../src/eval/llmJudgeEngine.js";

/**
 * G1-12: callJudgeModel returned a hardcoded {score: 0.8, "Mock judge response
 * for testing"}, so every judge score the product produced was fabricated —
 * while a complete OpenAI/Anthropic client sat unused in llmApiIntegration.
 */
describe("LLM judge uses a real client", () => {
  const source = readFileSync(new URL("../src/eval/llmJudgeEngine.ts", import.meta.url), "utf8");

  it("no longer returns a hardcoded mock score", () => {
    expect(source).not.toContain("Mock judge response for testing");
    expect(source).not.toMatch(/score:\s*0\.8,\s*\n\s*explanation/);
  });

  it("delegates to the real production judge client", () => {
    expect(source).toContain("ProductionLLMJudgeEngine");
    expect(source).toContain("productionEngine.callJudgeModel(prompt)");
  });

  it("reports a real cache hit rate rather than a hardcoded zero", () => {
    expect(source).not.toContain("hitRate: 0 // Would track this");
    expect(source).toContain("this.cacheHits / this.cacheLookups");
  });

  it("tracks hits and lookups so the rate is meaningful", async () => {
    class StubJudge extends LLMJudgeEngine {
      protected async callJudgeModel(): Promise<string> {
        return JSON.stringify({ score: 0.5, explanation: "stub" });
      }
    }
    const engine = new StubJudge({ enableCache: true } as never);
    expect(engine.getCacheStats().hitRate).toBe(0);
  });
});
