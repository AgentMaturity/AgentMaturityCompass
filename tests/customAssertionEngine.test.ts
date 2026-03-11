/**
 * Tests for Custom Assertion Engine (AMC-75)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CustomAssertionEngine,
  AssertionEngineError,
  AssertionThresholdError,
  type AssertionContext,
  type AssertionSet,
} from "../src/eval/customAssertionEngine.js";

describe("CustomAssertionEngine", () => {
  let engine: CustomAssertionEngine;

  beforeEach(() => {
    engine = new CustomAssertionEngine();
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe("registration", () => {
    it("registers and lists JS assertions", () => {
      engine.registerJs("tone", "(ctx) => 1.0");
      engine.registerJs("length", "(ctx) => 0.5");
      expect(engine.listRegistered()).toEqual(["tone", "length"]);
    });

    it("registers Python assertions", () => {
      engine.registerPython("sentiment", 'def grade(ctx):\n    return 1.0');
      expect(engine.listRegistered()).toEqual(["sentiment"]);
      const reg = engine.getRegistered("sentiment");
      expect(reg?.runtime).toBe("python");
    });

    it("unregisters assertions", () => {
      engine.registerJs("temp", "(ctx) => 1.0");
      expect(engine.unregister("temp")).toBe(true);
      expect(engine.listRegistered()).toEqual([]);
      expect(engine.unregister("nonexistent")).toBe(false);
    });

    it("throws on empty name", () => {
      expect(() => engine.registerJs("", "(ctx) => 1")).toThrow(AssertionEngineError);
    });

    it("throws on empty source", () => {
      expect(() => engine.registerJs("a", "")).toThrow(AssertionEngineError);
    });

    it("getRegistered returns undefined for unknown", () => {
      expect(engine.getRegistered("nope")).toBeUndefined();
    });

    it("overwrites existing registration", () => {
      engine.registerJs("x", "(ctx) => 0.0");
      engine.registerJs("x", "(ctx) => 1.0");
      expect(engine.listRegistered()).toEqual(["x"]);
      expect(engine.getRegistered("x")?.source).toBe("(ctx) => 1.0");
    });
  });

  // -----------------------------------------------------------------------
  // JS execution
  // -----------------------------------------------------------------------

  describe("JS execution", () => {
    it("runs a simple JS assertion", async () => {
      engine.registerJs("always_pass", "(ctx) => 1.0");
      const result = await engine.runOne("always_pass", { output: "hello" });
      expect(result.score).toBe(1.0);
      expect(result.passed).toBe(true);
      expect(result.name).toBe("always_pass");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("runs a JS assertion that checks output", async () => {
      engine.registerJs("has_please", '(ctx) => ctx.output.includes("please") ? 1.0 : 0.0');
      const pass = await engine.runOne("has_please", { output: "please help" });
      expect(pass.score).toBe(1.0);
      expect(pass.passed).toBe(true);

      const fail = await engine.runOne("has_please", { output: "help me" });
      expect(fail.score).toBe(0.0);
      expect(fail.passed).toBe(false);
    });

    it("clamps scores to [0, 1]", async () => {
      engine.registerJs("over", "(ctx) => 5.0");
      engine.registerJs("under", "(ctx) => -3.0");
      expect((await engine.runOne("over", { output: "" })).score).toBe(1.0);
      expect((await engine.runOne("under", { output: "" })).score).toBe(0.0);
    });

    it("handles JS errors gracefully", async () => {
      engine.registerJs("bad", "(ctx) => { throw new Error('boom'); }");
      const result = await engine.runOne("bad", { output: "" });
      expect(result.score).toBe(0);
      expect(result.error).toContain("boom");
      expect(result.passed).toBe(false);
    });

    it("handles non-numeric return", async () => {
      engine.registerJs("nan", '(ctx) => "not a number"');
      const result = await engine.runOne("nan", { output: "" });
      expect(result.score).toBe(0); // NaN → 0 via clamp
    });

    it("supports multi-line function body", async () => {
      engine.registerJs(
        "multi",
        `(ctx) => {
          const words = ctx.output.split(' ').length;
          const ratio = words / 10;
          return Math.min(1, ratio);
        }`,
      );
      const result = await engine.runOne("multi", { output: "one two three four five" });
      expect(result.score).toBe(0.5);
    });

    it("accesses input and expected fields", async () => {
      engine.registerJs("exact_match", "(ctx) => ctx.output === ctx.expected ? 1.0 : 0.0");
      const pass = await engine.runOne("exact_match", {
        output: "hello",
        input: "say hello",
        expected: "hello",
      });
      expect(pass.score).toBe(1.0);

      const fail = await engine.runOne("exact_match", {
        output: "hi",
        expected: "hello",
      });
      expect(fail.score).toBe(0.0);
    });

    it("accesses meta field", async () => {
      engine.registerJs("meta_check", "(ctx) => ctx.meta?.strict ? 1.0 : 0.0");
      const pass = await engine.runOne("meta_check", {
        output: "",
        meta: { strict: true },
      });
      expect(pass.score).toBe(1.0);
    });

    it("throws for unregistered assertion", async () => {
      await expect(engine.runOne("nope", { output: "" })).rejects.toThrow(AssertionEngineError);
    });

    it("respects custom threshold", async () => {
      engine.registerJs("half", "(ctx) => 0.7");
      const high = await engine.runOne("half", { output: "" }, 0.8);
      expect(high.passed).toBe(false);
      const low = await engine.runOne("half", { output: "" }, 0.5);
      expect(low.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Assertion Sets
  // -----------------------------------------------------------------------

  describe("assertion sets", () => {
    beforeEach(() => {
      engine.registerJs("tone", '(ctx) => ctx.output.includes("please") ? 1.0 : 0.0');
      engine.registerJs("length", "(ctx) => ctx.output.length < 100 ? 1.0 : 0.0");
      engine.registerJs("exact", "(ctx) => ctx.output === ctx.expected ? 1.0 : 0.0");
    });

    it("createSet validates all assertions exist", () => {
      expect(() =>
        engine.createSet("test", [
          { name: "tone", weight: 1 },
          { name: "missing", weight: 1 },
        ]),
      ).toThrow(/not registered/);
    });

    it("createSet rejects empty assertions", () => {
      expect(() => engine.createSet("test", [])).toThrow(/At least one/);
    });

    it("runs a weighted assertion set", async () => {
      const set = engine.createSet("quality", [
        { name: "tone", weight: 0.7, threshold: 0.5 },
        { name: "length", weight: 0.3, threshold: 0.5 },
      ]);

      const result = await engine.runSet(set, { output: "please help" });
      // tone = 1.0 (weight 0.7), length = 1.0 (weight 0.3)
      expect(result.aggregateScore).toBeCloseTo(1.0, 2);
      expect(result.allPassed).toBe(true);
      expect(result.setThresholdPassed).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.metrics).toHaveProperty("tone", 1.0);
      expect(result.metrics).toHaveProperty("length", 1.0);
    });

    it("handles partial pass in assertion set", async () => {
      const set = engine.createSet("quality", [
        { name: "tone", weight: 0.6, threshold: 0.5 },
        { name: "length", weight: 0.4, threshold: 0.5 },
      ]);

      // "help" — no "please", short enough
      const result = await engine.runSet(set, { output: "help" });
      // tone = 0 (fails), length = 1.0
      expect(result.aggregateScore).toBeCloseTo(0.4, 2);
      expect(result.allPassed).toBe(false);
      expect(result.results[0]!.passed).toBe(false);
      expect(result.results[1]!.passed).toBe(true);
    });

    it("normalises weights", async () => {
      const set = engine.createSet("test", [
        { name: "tone", weight: 2 },
        { name: "length", weight: 8 },
      ]);
      const result = await engine.runSet(set, { output: "please" });
      // tone: 1.0 * 0.2 = 0.2, length: 1.0 * 0.8 = 0.8
      expect(result.aggregateScore).toBeCloseTo(1.0, 2);
      // Check normalised weights
      expect(result.results[0]!.weight).toBeCloseTo(0.2, 2);
      expect(result.results[1]!.weight).toBeCloseTo(0.8, 2);
    });

    it("handles all-zero weights as equal", async () => {
      const set = engine.createSet("test", [
        { name: "tone", weight: 0 },
        { name: "length", weight: 0 },
      ]);
      const result = await engine.runSet(set, { output: "please" });
      expect(result.results[0]!.weight).toBeCloseTo(0.5, 2);
      expect(result.results[1]!.weight).toBeCloseTo(0.5, 2);
    });

    it("set threshold determines setThresholdPassed", async () => {
      engine.registerJs("half_score", "(ctx) => 0.4");
      const set = engine.createSet("test", [{ name: "half_score", weight: 1 }]);

      const pass = await engine.runSet(set, { output: "" }, 0.3);
      expect(pass.setThresholdPassed).toBe(true);

      const fail = await engine.runSet(set, { output: "" }, 0.5);
      expect(fail.setThresholdPassed).toBe(false);
    });

    it("assertSet throws on failure", async () => {
      engine.registerJs("always_fail", "(ctx) => 0.0");
      const set = engine.createSet("fail_set", [{ name: "always_fail", weight: 1 }]);

      await expect(engine.assertSet(set, { output: "" }, 0.5)).rejects.toThrow(
        AssertionThresholdError,
      );
    });

    it("assertSet returns result on success", async () => {
      engine.registerJs("always_pass", "(ctx) => 1.0");
      const set = engine.createSet("pass_set", [{ name: "always_pass", weight: 1 }]);

      const result = await engine.assertSet(set, { output: "" }, 0.5);
      expect(result.setThresholdPassed).toBe(true);
    });

    it("records named metrics", async () => {
      const set = engine.createSet("metrics_test", [
        { name: "tone", weight: 0.5 },
        { name: "length", weight: 0.5 },
      ]);
      const result = await engine.runSet(set, { output: "please" });
      expect(result.metrics).toEqual({ tone: 1.0, length: 1.0 });
    });

    it("tracks totalDurationMs", async () => {
      const set = engine.createSet("timing", [{ name: "tone", weight: 1 }]);
      const result = await engine.runSet(set, { output: "please" });
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // -----------------------------------------------------------------------
  // Reporting
  // -----------------------------------------------------------------------

  describe("reporting", () => {
    it("renders a markdown report", async () => {
      engine.registerJs("a", "(ctx) => 0.8");
      engine.registerJs("b", "(ctx) => 0.3");
      const set = engine.createSet("demo", [
        { name: "a", weight: 0.6, threshold: 0.5 },
        { name: "b", weight: 0.4, threshold: 0.5 },
      ]);
      const result = await engine.runSet(set, { output: "test" });
      const report = CustomAssertionEngine.renderReport(result);

      expect(report).toContain("# Assertion Set: demo");
      expect(report).toContain("Aggregate Score:");
      expect(report).toContain("| a |");
      expect(report).toContain("| b |");
      expect(report).toContain("Named Metrics");
    });

    it("report shows errors when assertions fail", async () => {
      engine.registerJs("broken", "(ctx) => { throw new Error('kaboom'); }");
      const set = engine.createSet("err_test", [{ name: "broken", weight: 1 }]);
      const result = await engine.runSet(set, { output: "" });
      const report = CustomAssertionEngine.renderReport(result);
      expect(report).toContain("Errors");
      expect(report).toContain("kaboom");
    });
  });

  // -----------------------------------------------------------------------
  // Python execution (integration — requires python3)
  // -----------------------------------------------------------------------

  describe("Python execution", () => {
    it("runs a simple Python grading function", async () => {
      engine.registerPython(
        "py_length",
        `def grade(ctx):
    return 1.0 if len(ctx["output"]) < 50 else 0.0`,
      );
      const result = await engine.runOne("py_length", { output: "short" });
      expect(result.score).toBe(1.0);
      expect(result.passed).toBe(true);
    });

    it("handles Python errors gracefully", async () => {
      engine.registerPython("py_bad", "def grade(ctx):\n    raise ValueError('oops')");
      const result = await engine.runOne("py_bad", { output: "" });
      expect(result.score).toBe(0);
      expect(result.error).toBeTruthy();
    });

    it("clamps Python scores to [0, 1]", async () => {
      engine.registerPython("py_over", "def grade(ctx):\n    return 5.0");
      const result = await engine.runOne("py_over", { output: "" });
      expect(result.score).toBe(1.0);
    });

    it("uses Python in an assertion set alongside JS", async () => {
      engine.registerJs("js_check", '(ctx) => ctx.output.includes("ok") ? 1.0 : 0.0');
      engine.registerPython(
        "py_check",
        `def grade(ctx):
    return 1.0 if "ok" in ctx["output"] else 0.0`,
      );

      const set = engine.createSet("mixed", [
        { name: "js_check", weight: 0.5 },
        { name: "py_check", weight: 0.5 },
      ]);

      const result = await engine.runSet(set, { output: "this is ok" });
      expect(result.aggregateScore).toBeCloseTo(1.0, 2);
      expect(result.allPassed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Score thresholds edge cases
  // -----------------------------------------------------------------------

  describe("threshold edge cases", () => {
    it("score exactly at threshold passes", async () => {
      engine.registerJs("exact_half", "(ctx) => 0.5");
      const result = await engine.runOne("exact_half", { output: "" }, 0.5);
      expect(result.passed).toBe(true);
    });

    it("score just below threshold fails", async () => {
      engine.registerJs("just_under", "(ctx) => 0.499");
      const result = await engine.runOne("just_under", { output: "" }, 0.5);
      expect(result.passed).toBe(false);
    });

    it("zero threshold always passes", async () => {
      engine.registerJs("zero_score", "(ctx) => 0.0");
      const result = await engine.runOne("zero_score", { output: "" }, 0);
      expect(result.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // AssertionThresholdError
  // -----------------------------------------------------------------------

  describe("AssertionThresholdError", () => {
    it("contains the full set result", async () => {
      engine.registerJs("low", "(ctx) => 0.1");
      const set = engine.createSet("err_check", [{ name: "low", weight: 1 }]);

      try {
        await engine.assertSet(set, { output: "" }, 0.8);
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AssertionThresholdError);
        const te = err as AssertionThresholdError;
        expect(te.setResult.setName).toBe("err_check");
        expect(te.setResult.aggregateScore).toBeCloseTo(0.1, 2);
        expect(te.message).toContain("err_check");
      }
    });
  });
});
