import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";

function getQuestion(qid: string) {
  const question = questionBank.find((row) => row.id === qid);
  expect(question).toBeDefined();
  return question!;
}

describe("memory integrity diagnostic gates", () => {
  test("adds AMC-MEM-3.x questions to the bank", () => {
    const ids = new Set(questionBank.map((row) => row.id));
    expect(ids.has("AMC-MEM-3.1")).toBe(true);
    expect(ids.has("AMC-MEM-3.2")).toBe(true);
    expect(ids.has("AMC-MEM-3.3")).toBe(true);
    expect(ids.has("AMC-MEM-3.4")).toBe(true);
  });

  test("new memory questions are in Resilience with full option and gate stacks", () => {
    for (const qid of ["AMC-MEM-3.1", "AMC-MEM-3.2", "AMC-MEM-3.3", "AMC-MEM-3.4"]) {
      const question = getQuestion(qid);
      expect(question.layerName).toBe("Resilience");
      expect(question.options).toHaveLength(6);
      expect(question.gates).toHaveLength(6);
    }
  });

  test("AMC-MEM-2.1 integrity claim requires observed memory chain evidence at higher levels", () => {
    const question = getQuestion("AMC-MEM-2.1");
    const gate4 = question.gates[4];
    const gate5 = question.gates[5];
    expect(gate4.requiredTrustTier).toBe("OBSERVED");
    expect(gate4.mustInclude.auditTypes).toContain("MEMORY_CHAIN_VERIFIED");
    expect(gate4.mustNotInclude.auditTypes).toContain("MEMORY_INTEGRITY_BYPASS");
    expect(gate5.requiredTrustTier).toBe("OBSERVED");
    expect(gate5.mustInclude.artifactPatterns).toContain("memory-chain-proof");
  });

  test("AMC-MEM-3.1 restart persistence gate tracks restart survival metrics", () => {
    const question = getQuestion("AMC-MEM-3.1");
    const gate3 = question.gates[3];
    const gate5 = question.gates[5];
    expect(gate3.mustInclude.metricKeys).toContain("memory_restart_survival_rate");
    expect(gate3.mustInclude.auditTypes).toContain("MEMORY_RESTART_VERIFIED");
    expect(gate5.mustInclude.artifactPatterns).toContain("memory-restart-report");
  });

  test("AMC-MEM-3.2 hash-chain gate requires chain validity metrics", () => {
    const question = getQuestion("AMC-MEM-3.2");
    const gate3 = question.gates[3];
    const gate4 = question.gates[4];
    expect(gate3.mustInclude.metricKeys).toContain("memory_hash_chain_valid_ratio");
    expect(gate3.mustInclude.auditTypes).toContain("MEMORY_CHAIN_VERIFIED");
    expect(gate4.mustInclude.metricKeys).toContain("memory_chain_break_rate");
  });

  test("AMC-MEM-3.3 poisoning gate requires detector quality metrics and fail-closed signals", () => {
    const question = getQuestion("AMC-MEM-3.3");
    const gate4 = question.gates[4];
    const gate5 = question.gates[5];
    expect(gate4.mustInclude.metricKeys).toContain("memory_poisoning_precision");
    expect(gate4.mustInclude.metricKeys).toContain("memory_poisoning_recall");
    expect(gate4.mustNotInclude.auditTypes).toContain("MEMORY_POISONING_UNDETECTED");
    expect(gate5.mustInclude.artifactPatterns).toContain("memory-poisoning-report");
  });

  test("AMC-MEM-3.4 continuity gate requires semantic drift metrics", () => {
    const question = getQuestion("AMC-MEM-3.4");
    const gate5 = question.gates[5];
    expect(gate5.mustInclude.metricKeys).toContain("memory_continuity_score");
    expect(gate5.mustInclude.metricKeys).toContain("memory_semantic_drift_rate");
    expect(gate5.mustInclude.artifactPatterns).toContain("memory-continuity-report");
  });
});
