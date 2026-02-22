import { describe, expect, test } from "vitest";
import { explainDiagnosticQuestion } from "../src/diagnostic/questionExplain.js";

describe("questionExplain", () => {
  test("returns structured explanation for known question", () => {
    const out = explainDiagnosticQuestion("AMC-2.1");
    expect(out.questionId).toBe("AMC-2.1");
    expect(out.title.length).toBeGreaterThan(0);
    expect(out.whatItMeasures.length).toBeGreaterThan(10);
    expect(out.whyItMatters.length).toBeGreaterThan(10);
    expect(out.howToImprove.length).toBeGreaterThan(0);
    expect(out.exampleEvidence.length).toBeGreaterThan(0);
  });

  test("accepts case-insensitive question IDs", () => {
    const upper = explainDiagnosticQuestion("AMC-4.1");
    const lower = explainDiagnosticQuestion("amc-4.1");
    expect(lower.questionId).toBe(upper.questionId);
    expect(lower.title).toBe(upper.title);
  });

  test("throws a helpful error for unknown IDs", () => {
    expect(() => explainDiagnosticQuestion("AMC-999.1")).toThrowError(/Unknown question ID/);
  });
});

