import { describe, it, expect } from "vitest";
import {
  evaluateAutotuneClassification,
  buildConfusionMatrix,
  computeClassMetrics,
  bootstrapMacroF1CI,
  LABELED_CORPUS,
} from "../src/steer/research/eval_autotune_classification.js";

describe("eval_autotune_classification", () => {
  it("builds a confusion matrix with correct dimensions", () => {
    const confusion = buildConfusionMatrix(LABELED_CORPUS);
    expect(confusion.labels).toHaveLength(5);
    for (const actual of confusion.labels) {
      for (const predicted of confusion.labels) {
        expect(typeof confusion.matrix[actual][predicted]).toBe("number");
      }
    }
  });

  it("matrix row sums match actual class counts", () => {
    const confusion = buildConfusionMatrix(LABELED_CORPUS);
    for (const label of confusion.labels) {
      const rowSum = confusion.labels.reduce(
        (sum, pred) => sum + confusion.matrix[label][pred],
        0,
      );
      const expectedCount = LABELED_CORPUS.filter(
        (s) => s.expected === label,
      ).length;
      expect(rowSum).toBe(expectedCount);
    }
  });

  it("computes per-class precision, recall, F1 in [0,1]", () => {
    const confusion = buildConfusionMatrix(LABELED_CORPUS);
    const metrics = computeClassMetrics(confusion);
    expect(metrics).toHaveLength(5);
    for (const m of metrics) {
      expect(m.precision).toBeGreaterThanOrEqual(0);
      expect(m.precision).toBeLessThanOrEqual(1);
      expect(m.recall).toBeGreaterThanOrEqual(0);
      expect(m.recall).toBeLessThanOrEqual(1);
      expect(m.f1).toBeGreaterThanOrEqual(0);
      expect(m.f1).toBeLessThanOrEqual(1);
    }
  });

  it("bootstrap CI returns valid 95% interval", () => {
    const ci = bootstrapMacroF1CI(LABELED_CORPUS.slice(0, 30), undefined, 200, 42);
    expect(ci[0]).toBeLessThanOrEqual(ci[1]);
    expect(ci[0]).toBeGreaterThanOrEqual(0);
    expect(ci[1]).toBeLessThanOrEqual(1);
  });

  it("full evaluation returns all fields", () => {
    const result = evaluateAutotuneClassification();
    expect(result.totalSamples).toBe(75);
    expect(result.macroF1).toBeGreaterThanOrEqual(0);
    expect(result.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.perClass).toHaveLength(5);
    expect(result.macroF1CI[0]).toBeLessThanOrEqual(result.macroF1CI[1]);
  });

  it("achieves reasonable macro-F1 (> 0.4) on built-in corpus", () => {
    const result = evaluateAutotuneClassification();
    expect(result.macroF1).toBeGreaterThan(0.4);
  });
});
