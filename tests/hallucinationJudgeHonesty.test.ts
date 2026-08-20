import { describe, expect, it } from "vitest";
import { runLlmJudge, LlmJudgeUnavailableError } from "../src/hallucination/llmJudge.js";
import type { HallucinationDetectorInput } from "../src/hallucination/types.js";

const input: HallucinationDetectorInput = {
  response: "The capital of Australia is Sydney.",
  context: "Canberra is the capital of Australia."
} as HallucinationDetectorInput;

/**
 * G1-13: a failed judge call returned [] — indistinguishable from "no
 * hallucinations found" — so an evaluation that never ran reported clean.
 */
describe("hallucination LLM judge fails loudly", () => {
  it("throws instead of reporting a clean result when the judge cannot be reached", async () => {
    await expect(
      runLlmJudge(input, async () => {
        throw new Error("connection refused");
      })
    ).rejects.toBeInstanceOf(LlmJudgeUnavailableError);
  });

  it("still returns findings when the judge answers", async () => {
    const findings = await runLlmJudge(input, async () =>
      JSON.stringify({
        findings: [
          {
            type: "factual_error",
            severity: "high",
            span: "Sydney",
            reason: "Canberra is the capital",
            confidence: 0.9
          }
        ],
        overallAssessment: "one error"
      })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detector).toBe("llm_judge");
  });

  it("returns no findings when the judge genuinely finds none", async () => {
    const findings = await runLlmJudge(input, async () =>
      JSON.stringify({ findings: [], overallAssessment: "clean" })
    );
    expect(findings).toEqual([]);
  });
});
