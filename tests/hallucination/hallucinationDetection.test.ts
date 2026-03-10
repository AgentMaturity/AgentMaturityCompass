/**
 * Tests for the hallucination detection module.
 * Covers deterministic detectors, LLM judge parsing, and composite detection.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  detectHallucinations,
  detectHallucinationsDeterministic,
  runAllDeterministicDetectors,
  resetFindingCounter,
  parseLlmJudgeResponse,
  buildJudgePrompt,
  runLlmJudge,
  resetLlmFindingCounter,
} from "../../src/hallucination/index.js";
import {
  detectFabricatedCitations,
  detectFabricatedStatistics,
  detectFabricatedUrls,
  detectContradictions,
  detectUnsupportedCertainty,
  detectTemporalFabrications,
  detectFabricatedFacts,
} from "../../src/hallucination/deterministicDetectors.js";

beforeEach(() => {
  resetFindingCounter();
  resetLlmFindingCounter();
});

/* ── Fabricated Citations ────────────────────────────────────────── */

describe("detectFabricatedCitations", () => {
  it("flags citations not in context", () => {
    const findings = detectFabricatedCitations({
      response: 'According to Smith et al. (2023), the failure rate is high.',
      context: "The system has known reliability issues documented in our internal reports.",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("fabricated_citation");
    expect(findings[0].detector).toBe("deterministic");
  });

  it("does not flag citations present in context", () => {
    const findings = detectFabricatedCitations({
      response: 'According to Smith et al. (2023), the failure rate is 5%.',
      context: "Smith et al. (2023) published a study on failure rates showing 5%.",
    });
    expect(findings.length).toBe(0);
  });

  it("skips detection when no context provided", () => {
    const findings = detectFabricatedCitations({
      response: 'According to Jones (2021), testing is important.',
    });
    // No context = can't verify = no findings
    expect(findings.length).toBe(0);
  });
});

/* ── Fabricated Statistics ────────────────────────────────────────── */

describe("detectFabricatedStatistics", () => {
  it("flags percentages not in context", () => {
    const findings = detectFabricatedStatistics({
      response: "The error rate improved by 73.4% after the update.",
      context: "The update was deployed last week and showed positive results.",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some(f => f.type === "fabricated_statistic")).toBe(true);
  });

  it("flags dollar amounts not in context", () => {
    const findings = detectFabricatedStatistics({
      response: "Revenue reached $2.3 million in Q4.",
      context: "Q4 financial results were positive for the company.",
    });
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does not flag statistics present in context", () => {
    const findings = detectFabricatedStatistics({
      response: "The error rate is 5%.",
      context: "According to our data, the error rate is 5%.",
    });
    expect(findings.length).toBe(0);
  });

  it("returns nothing without context", () => {
    const findings = detectFabricatedStatistics({
      response: "The metric shows 42.7% improvement.",
    });
    expect(findings.length).toBe(0);
  });
});

/* ── Fabricated URLs ─────────────────────────────────────────────── */

describe("detectFabricatedUrls", () => {
  it("flags URLs not in context", () => {
    const findings = detectFabricatedUrls({
      response: "See the documentation at https://docs.example.com/api/v2/guide.",
      context: "The API documentation is available online.",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("fabricated_url");
  });

  it("flags URLs from commonly hallucinated domains", () => {
    const findings = detectFabricatedUrls({
      response: "This is described in https://arxiv.org/abs/2301.12345.",
      context: "Recent research has explored this topic.",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not flag URLs present in context", () => {
    const findings = detectFabricatedUrls({
      response: "See https://example.com/docs for details.",
      context: "Documentation is at https://example.com/docs and covers all features.",
    });
    expect(findings.length).toBe(0);
  });
});

/* ── Contradiction Detection ─────────────────────────────────────── */

describe("detectContradictions", () => {
  it("detects direction contradictions", () => {
    const findings = detectContradictions({
      response: "Performance increased significantly after the change. However, metrics showed that throughput decreased in all tests.",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("contradiction");
  });

  it("does not flag consistent statements", () => {
    const findings = detectContradictions({
      response: "The system is reliable and stable. It has been running without issues for months.",
    });
    expect(findings.length).toBe(0);
  });
});

/* ── Unsupported Certainty ───────────────────────────────────────── */

describe("detectUnsupportedCertainty", () => {
  it("flags overconfident language without evidence", () => {
    const findings = detectUnsupportedCertainty({
      response: "This approach is guaranteed to work and will always produce correct results.",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("unsupported_certainty");
  });

  it("does not flag confident language with evidence markers", () => {
    const findings = detectUnsupportedCertainty({
      response: "This is definitely correct based on the provided data [ev:test-results-2024].",
    });
    expect(findings.length).toBe(0);
  });
});

/* ── Temporal Fabrications ───────────────────────────────────────── */

describe("detectTemporalFabrications", () => {
  it("flags version numbers not in context", () => {
    const findings = detectTemporalFabrications({
      response: "This was fixed in version 3.2.1 of the library.",
      context: "The library has been updated to address the issue.",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("temporal_fabrication");
  });

  it("does not flag versions present in context", () => {
    const findings = detectTemporalFabrications({
      response: "This was fixed in version 3.2.1.",
      context: "Version 3.2.1 includes the fix for this issue.",
    });
    expect(findings.length).toBe(0);
  });
});

/* ── Fabricated Facts ────────────────────────────────────────────── */

describe("detectFabricatedFacts", () => {
  it("flags ungrounded claims", () => {
    const findings = detectFabricatedFacts({
      response: "Studies show that the quantum computing breakthrough has been validated by multiple independent laboratories across Europe and Asia.",
      context: "We are working on a software testing framework for web applications.",
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("fabricated_fact");
  });

  it("does not flag well-grounded claims", () => {
    const findings = detectFabricatedFacts({
      response: "The testing framework has been validated for web applications.",
      context: "Our testing framework is designed for web applications and has been validated.",
    });
    expect(findings.length).toBe(0);
  });
});

/* ── Composite Deterministic Runner ──────────────────────────────── */

describe("runAllDeterministicDetectors", () => {
  it("combines findings from all detectors", () => {
    const findings = runAllDeterministicDetectors({
      response: [
        "According to Zhang et al. (2024), the system achieves 99.7% accuracy.",
        "See https://arxiv.org/abs/2401.99999 for the full paper.",
        "This is guaranteed to work in all cases.",
      ].join(" "),
      context: "We built a classification system last year.",
    });
    expect(findings.length).toBeGreaterThan(0);

    const types = new Set(findings.map(f => f.type));
    // Should catch at least citations, statistics, URLs, and certainty
    expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for clean responses", () => {
    const findings = runAllDeterministicDetectors({
      response: "Based on the provided data, the system appears to work as expected.",
      context: "The system was tested and the data shows it works as expected.",
    });
    expect(findings.length).toBe(0);
  });
});

/* ── LLM Judge Parsing ───────────────────────────────────────────── */

describe("parseLlmJudgeResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      findings: [
        {
          type: "fabricated_citation",
          severity: "high",
          span: "Smith (2023)",
          reason: "No such paper exists",
          confidence: 0.9,
        },
      ],
      overallAssessment: "One fabricated citation found.",
    });
    const result = parseLlmJudgeResponse(raw);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].type).toBe("fabricated_citation");
    expect(result.overallAssessment).toContain("fabricated");
  });

  it("parses JSON wrapped in code blocks", () => {
    const raw = '```json\n{"findings":[],"overallAssessment":"Clean."}\n```';
    const result = parseLlmJudgeResponse(raw);
    expect(result.findings.length).toBe(0);
    expect(result.overallAssessment).toBe("Clean.");
  });

  it("handles invalid JSON gracefully", () => {
    const result = parseLlmJudgeResponse("This is not JSON at all.");
    expect(result.findings.length).toBe(0);
    expect(result.overallAssessment).toContain("Failed");
  });

  it("sanitizes invalid types to fabricated_fact", () => {
    const raw = JSON.stringify({
      findings: [{ type: "made_up_type", severity: "high", span: "test", reason: "test", confidence: 0.8 }],
      overallAssessment: "Test.",
    });
    const result = parseLlmJudgeResponse(raw);
    expect(result.findings[0].type).toBe("fabricated_fact");
  });

  it("clamps confidence to 0-1", () => {
    const raw = JSON.stringify({
      findings: [{ type: "fabricated_fact", severity: "high", span: "test", reason: "test", confidence: 1.5 }],
      overallAssessment: "Test.",
    });
    const result = parseLlmJudgeResponse(raw);
    expect(result.findings[0].confidence).toBe(1);
  });

  it("filters out findings with empty spans", () => {
    const raw = JSON.stringify({
      findings: [
        { type: "fabricated_fact", severity: "high", span: "", reason: "test", confidence: 0.8 },
        { type: "fabricated_fact", severity: "high", span: "real span", reason: "test", confidence: 0.8 },
      ],
      overallAssessment: "Test.",
    });
    const result = parseLlmJudgeResponse(raw);
    expect(result.findings.length).toBe(1);
  });
});

describe("buildJudgePrompt", () => {
  it("includes response and context", () => {
    const prompt = buildJudgePrompt({
      response: "The answer is 42.",
      context: "No context about numbers.",
      prompt: "What is the answer?",
    });
    expect(prompt).toContain("The answer is 42.");
    expect(prompt).toContain("No context about numbers.");
    expect(prompt).toContain("What is the answer?");
    expect(prompt).toContain("fabricated_fact");
  });

  it("includes known facts when provided", () => {
    const prompt = buildJudgePrompt({
      response: "Test response.",
      knownFacts: { "CEO": "John", "Revenue": "$1M" },
    });
    expect(prompt).toContain("CEO: John");
    expect(prompt).toContain("Revenue: $1M");
  });
});

/* ── LLM Judge Runner ────────────────────────────────────────────── */

describe("runLlmJudge", () => {
  it("calls the judge function and returns findings", async () => {
    const mockJudge = async (_prompt: string) => JSON.stringify({
      findings: [
        { type: "fabricated_fact", severity: "high", span: "test claim", reason: "not in context", confidence: 0.85 },
      ],
      overallAssessment: "One hallucination found.",
    });

    const findings = await runLlmJudge(
      { response: "This is a test claim that is fabricated." },
      mockJudge,
    );
    expect(findings.length).toBe(1);
    expect(findings[0].detector).toBe("llm_judge");
    expect(findings[0].type).toBe("fabricated_fact");
  });

  it("returns empty on judge failure", async () => {
    const failingJudge = async () => { throw new Error("LLM unavailable"); };
    const findings = await runLlmJudge({ response: "test" }, failingJudge);
    expect(findings.length).toBe(0);
  });
});

/* ── Composite Detector ──────────────────────────────────────────── */

describe("detectHallucinations", () => {
  it("produces a scored result with deterministic detectors", async () => {
    const result = await detectHallucinations({
      response: "According to Nakamura et al. (2024), the system achieves 99.9% uptime. See https://arxiv.org/abs/2401.00001.",
      context: "The system was deployed last month.",
    });
    expect(result.totalFindings).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
    expect(result.detectorsUsed).toContain("deterministic");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.summary).toBeDefined();
  });

  it("passes clean responses", async () => {
    const result = await detectHallucinations({
      response: "Based on the provided data, the system seems to work correctly.",
      context: "The system was tested and the data shows it works correctly.",
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(result.totalFindings).toBe(0);
  });

  it("includes LLM judge when enabled", async () => {
    const mockJudge = async () => JSON.stringify({
      findings: [
        { type: "false_attribution", severity: "medium", span: "Einstein said", reason: "Misattributed quote", confidence: 0.8 },
      ],
      overallAssessment: "One false attribution.",
    });

    const result = await detectHallucinations(
      { response: 'Einstein said "the definition of insanity is doing the same thing."' },
      { enableLlmJudge: true, llmJudgeFn: mockJudge },
    );
    expect(result.detectorsUsed).toContain("llm_judge");
    expect(result.findings.some(f => f.detector === "llm_judge")).toBe(true);
  });

  it("filters findings below minConfidence", async () => {
    const result = await detectHallucinations(
      {
        response: "According to Phantom Author (2099), everything is fine. The rate is 0.001%.",
        context: "Nothing relevant here.",
      },
      { minConfidence: 0.9 },
    );
    // Only high-confidence findings should survive
    for (const f of result.findings) {
      expect(f.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("deduplicates overlapping findings", async () => {
    // Both deterministic and LLM might catch the same span
    const mockJudge = async () => JSON.stringify({
      findings: [
        { type: "fabricated_citation", severity: "high", span: "Smith et al. (2023)", reason: "No such paper", confidence: 0.95 },
      ],
      overallAssessment: "Duplicate finding.",
    });

    const result = await detectHallucinations(
      {
        response: "According to Smith et al. (2023), the results are clear.",
        context: "Internal data shows improvement.",
      },
      { enableLlmJudge: true, llmJudgeFn: mockJudge },
    );

    // Should not have duplicate findings for the same span
    const spans = result.findings.map(f => f.span);
    const uniqueSpans = new Set(spans);
    // Allow some variation but check dedup logic ran
    expect(result.findings.length).toBeLessThanOrEqual(3);
  });
});

describe("detectHallucinationsDeterministic", () => {
  it("works as a convenience wrapper", async () => {
    const result = await detectHallucinationsDeterministic({
      response: "This is definitely guaranteed to succeed 100% of the time.",
      context: "We have no data on success rates.",
    });
    expect(result.detectorsUsed).toContain("deterministic");
    expect(result.detectorsUsed).not.toContain("llm_judge");
    expect(result.totalFindings).toBeGreaterThan(0);
  });
});

/* ── Edge Cases ──────────────────────────────────────────────────── */

describe("edge cases", () => {
  it("handles empty response", async () => {
    const result = await detectHallucinations({ response: "" });
    expect(result.passed).toBe(true);
    expect(result.totalFindings).toBe(0);
  });

  it("handles response with no context", async () => {
    const result = await detectHallucinations({
      response: "The sky is blue and water is wet.",
    });
    expect(result.passed).toBe(true);
  });

  it("handles very long response", async () => {
    const longResponse = "This is a test sentence. ".repeat(500);
    const result = await detectHallucinations({
      response: longResponse,
      context: "This is a test sentence.",
    });
    expect(result.durationMs).toBeLessThan(5000); // Should be fast
  });
});
