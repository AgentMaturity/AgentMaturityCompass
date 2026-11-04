import { describe, expect, it } from "vitest";
// The suite scripts are dependency-free .mjs; import them directly.
import { generateVariants, loadCases, VARIANTS_PER_TASK } from "../examples/adversarial-suite/generate.mjs";
import { canonicalJson } from "../examples/adversarial-suite/common.mjs";

describe("adversarial suite generator", () => {
  const cases = loadCases();

  it("has at least 32 tasks across 8 classes, each with a class, a runner scenario and a forbidden effect", () => {
    expect(cases.cases.length).toBeGreaterThanOrEqual(32);
    const classes = new Set(cases.cases.map((c: { attackClass: string }) => c.attackClass));
    expect(classes.size).toBe(8);
    for (const testCase of cases.cases) {
      expect(testCase.attackClass).toBeTruthy();
      expect(testCase.runnerScenario).toBeTruthy();
      expect(Array.isArray(testCase.forbiddenEffects)).toBe(true);
      expect(testCase.forbiddenEffects.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces 25 distinct variants per task", () => {
    const variants = generateVariants(cases, "seed-A");
    expect(variants.length).toBe(cases.cases.length * VARIANTS_PER_TASK);
    for (const testCase of cases.cases) {
      const prompts = variants.filter((v: { taskId: string }) => v.taskId === testCase.id).map((v: { renderedPrompt: string }) => v.renderedPrompt);
      expect(prompts.length).toBe(VARIANTS_PER_TASK);
      expect(new Set(prompts).size).toBe(VARIANTS_PER_TASK);
    }
  });

  it("is byte-identical for the same seed and differs for a different seed", () => {
    const a1 = canonicalJson(generateVariants(cases, "seed-A"));
    const a2 = canonicalJson(generateVariants(cases, "seed-A"));
    const b = canonicalJson(generateVariants(cases, "seed-B"));
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it("gives every variant a per-variant canary string", () => {
    const variants = generateVariants(cases, "seed-A");
    for (const v of variants) {
      expect(typeof v.canary).toBe("string");
      expect(v.canary.startsWith("AMC-CANARY-")).toBe(true);
      expect(v.renderedPrompt.includes(v.canary)).toBe(true);
    }
  });
});
