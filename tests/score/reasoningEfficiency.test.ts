import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreReasoningEfficiency } from "../../src/score/reasoningEfficiency.js";
import { markAsAmcCheckout } from "../helpers/amcCheckout.js";

describe("reasoning efficiency maturity", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "amc-reasoning-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns zero score for empty directory", () => {
    const result = scoreReasoningEfficiency(tmp);
    expect(result.score).toBe(0);
    expect(result.level).toBe(0);
    expect(result.gaps.length).toBe(7);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("detects response selection capability", () => {
    markAsAmcCheckout(tmp);
    mkdirSync(join(tmp, "src/reasoning"), { recursive: true });
    writeFileSync(join(tmp, "src/reasoning/bestOfN.ts"), "");
    const result = scoreReasoningEfficiency(tmp);
    expect(result.hasResponseSelection).toBe(true);
    // 2/7: markAsAmcCheckout plants src/ledger, which is itself listed as
    // reasoning-trace audit evidence, so this fixture genuinely meets two
    // criteria rather than one.
    expect(result.hasReasoningTraceAudit).toBe(true);
    expect(result.score).toBe(29);
  });

  it("detects reasoning budget via architecture task alignment", () => {
    markAsAmcCheckout(tmp);
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    writeFileSync(join(tmp, "src/score/architectureTaskAlignment.ts"), "");
    const result = scoreReasoningEfficiency(tmp);
    expect(result.hasReasoningBudget).toBe(true);
  });

  it("detects overthinking detection via circuit breaker", () => {
    markAsAmcCheckout(tmp);
    mkdirSync(join(tmp, "src/ops"), { recursive: true });
    writeFileSync(join(tmp, "src/ops/circuitBreaker.ts"), "");
    const result = scoreReasoningEfficiency(tmp);
    expect(result.hasOverthinkingDetection).toBe(true);
  });

  it("detects reasoning trace audit via receipts", () => {
    markAsAmcCheckout(tmp);
    mkdirSync(join(tmp, "src/receipts"), { recursive: true });
    const result = scoreReasoningEfficiency(tmp);
    expect(result.hasReasoningTraceAudit).toBe(true);
  });

  it("returns full score when all artifacts present", () => {
    markAsAmcCheckout(tmp);
    // Response selection
    mkdirSync(join(tmp, "src/reasoning"), { recursive: true });
    writeFileSync(join(tmp, "src/reasoning/bestOfN.ts"), "");
    // Reasoning budget
    mkdirSync(join(tmp, "src/score"), { recursive: true });
    writeFileSync(join(tmp, "src/score/architectureTaskAlignment.ts"), "");
    // Overthinking detection
    mkdirSync(join(tmp, "src/ops"), { recursive: true });
    writeFileSync(join(tmp, "src/ops/circuitBreaker.ts"), "");
    // Output length governance
    mkdirSync(join(tmp, "src/enforce"), { recursive: true });
    writeFileSync(join(tmp, "src/enforce/rateLimit.ts"), "");
    // Accuracy-length monitoring
    writeFileSync(join(tmp, "src/score/confidenceDrift.ts"), "");
    // Early stopping
    writeFileSync(join(tmp, "src/reasoning/earlyStopping.ts"), "");
    // Reasoning trace audit
    mkdirSync(join(tmp, "src/receipts"), { recursive: true });

    const result = scoreReasoningEfficiency(tmp);
    expect(result.score).toBe(100);
    expect(result.level).toBe(5);
    expect(result.gaps).toHaveLength(0);
  });
});
