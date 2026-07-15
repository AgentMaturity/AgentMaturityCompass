import { describe, expect, test } from "vitest";
import type { LetterGrade, UnifiedRunResult } from "../src/unified/unifiedRun.js";
import {
  buildAgentFixPlan,
  verifyAgentFixPlan,
  renderAgentFixPlanMarkdown,
  renderAgentFixPlanText,
} from "../src/mechanic/agentFixPlan.js";

const NOW = 1_700_000_000_000;

function result(): UnifiedRunResult {
  return {
    agentId: "demo-agent",
    ts: NOW,
    modules: [
      { name: "Score", icon: "①", grade: "A" as LetterGrade, score: 93, summary: "strong", issues: [] },
      { name: "Enforce", icon: "③", grade: "F" as LetterGrade, score: 0, summary: "No policy enforcement configured", issues: ["No policy.yaml — enforcement rules not defined"] },
      { name: "Watch", icon: "⑤", grade: "D" as LetterGrade, score: 25, summary: "Minimal observability", issues: ["No alerting configured"] },
      { name: "Fleet", icon: "⑥", grade: "F" as LetterGrade, score: 0, summary: "single agent", issues: [], skipped: true, skipReason: "single agent — fleet not configured" },
    ],
    overallGrade: "C" as LetterGrade,
    overallScore: 55,
    surfaceCoverage: { evaluated: 3, total: 4, pending: ["Fleet"], failed: [] },
    topFixes: [],
  };
}

describe("agent fix plan", () => {
  test("builds a deterministic, verifiable signed plan", () => {
    const a = buildAgentFixPlan({ result: result(), agentId: "demo-agent", now: NOW });
    const b = buildAgentFixPlan({ result: result(), agentId: "demo-agent", now: NOW });
    expect(a.receiptHash).toBe(b.receiptHash);
    expect(a.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyAgentFixPlan(a)).toBe(true);
    expect(a.generatedAt).toBe(new Date(NOW).toISOString());
    expect(a.before.overallGrade).toBe("C");
  });

  test("detects tampering", () => {
    const plan = buildAgentFixPlan({ result: result(), agentId: "demo-agent", now: NOW });
    const tampered = { ...plan, before: { ...plan.before, overallScore: 99 } };
    expect(verifyAgentFixPlan(tampered)).toBe(false);
  });

  test("emits a fix step for every weak surface, skips strong ones", () => {
    const plan = buildAgentFixPlan({ result: result(), agentId: "demo-agent", now: NOW });
    const surfaces = plan.steps.map((s) => s.surface);
    expect(surfaces).toContain("Enforce");
    expect(surfaces).toContain("Watch");
    expect(surfaces).toContain("Fleet"); // skipped -> weak
    expect(surfaces).not.toContain("Score"); // grade A -> not weak
    expect(plan.stepCount).toBe(3);
    for (const step of plan.steps) {
      expect(step.applyCommand.startsWith("amc ")).toBe(true);
      expect(step.problem.length).toBeGreaterThan(0);
    }
  });

  test("generates concrete starter artifacts where one applies", () => {
    const plan = buildAgentFixPlan({ result: result(), agentId: "demo-agent", now: NOW });
    const enforce = plan.steps.find((s) => s.surface === "Enforce");
    const watch = plan.steps.find((s) => s.surface === "Watch");
    const fleet = plan.steps.find((s) => s.surface === "Fleet");
    expect(enforce?.artifact?.filename).toBe("guardrails.yaml");
    expect(enforce?.artifact?.content).toContain("guardrails:");
    expect(enforce?.autoApplicable).toBe(true);
    expect(watch?.artifact?.filename).toBe("metrics.yaml");
    expect(fleet?.artifact).toBeNull(); // no starter artifact for fleet
    expect(enforce?.applyCommand).toContain("demo-agent");
  });

  test("renders markdown and terminal summaries", () => {
    const plan = buildAgentFixPlan({ result: result(), agentId: "demo-agent", now: NOW });
    const md = renderAgentFixPlanMarkdown(plan);
    expect(md).toContain("# AMC Fix Plan — demo-agent");
    expect(md).toContain("Receipt: `sha256:");
    expect(md).toContain("```yaml");
    const text = renderAgentFixPlanText(plan);
    expect(text).toContain("Fix plan for demo-agent");
    expect(text).toContain("apply: amc");
  });

  test("clean agent yields an empty plan", () => {
    const strong = result();
    strong.modules = strong.modules.map((m) => ({ ...m, grade: "A" as LetterGrade, score: 95, skipped: false, issues: [] }));
    const plan = buildAgentFixPlan({ result: strong, agentId: "demo-agent", now: NOW });
    expect(plan.stepCount).toBe(0);
    expect(verifyAgentFixPlan(plan)).toBe(true);
  });
});
