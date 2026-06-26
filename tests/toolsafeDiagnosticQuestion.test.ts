import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";

describe("ToolSafe diagnostic question", () => {
  test("adds proactive pre-execution tool-invocation safety diagnostics", () => {
    const question = questionBank.find((row) => row.id === "AMC-5.30");

    expect(question).toBeDefined();
    expect(question?.layerName).toBe("Skills");
    expect(question?.title).toBe("Proactive Tool Invocation Guardrails");
    expect(question?.promptTemplate).toContain("before execution");
    expect(question?.promptTemplate).toContain("reactive detection after execution");
    expect(question?.evidenceGateHints).toContain("pre-execution safety judgments");
    expect(question?.upgradeHints).toContain("ToolSafe");
    expect(question?.tuningKnobs).toContain("guardrails.proactiveToolSafety");
  });

  test("requires pre-execution safety judgments and guardrail feedback evidence", () => {
    const question = questionBank.find((row) => row.id === "AMC-5.30");
    expect(question).toBeDefined();

    const level3 = question!.gates[3]!;
    const level4 = question!.gates[4]!;
    const level5 = question!.gates[5]!;

    expect(level3.requiredEvidenceTypes).toEqual(expect.arrayContaining(["tool_action", "tool_result"]));
    expect(level3.mustInclude.auditTypes).toContain("PRE_TOOL_SAFETY_CHECK");
    expect(level3.mustInclude.metricKeys).toContain("unsafe_tool_prevention_rate");
    expect(level3.mustInclude.metaKeys).toEqual(
      expect.arrayContaining(["proposedTool", "toolActionId", "safetyJudgment"])
    );

    expect(level4.requiredTrustTier).toBe("OBSERVED");
    expect(level4.mustInclude.auditTypes).toEqual(
      expect.arrayContaining(["TOOL_INVOCATION_BLOCKED_PRE_EXECUTION", "GUARDRAIL_FEEDBACK_APPLIED"])
    );
    expect(level4.mustInclude.metricKeys).toEqual(
      expect.arrayContaining(["pre_execution_block_precision", "benign_completion_delta"])
    );

    expect(level5.requiredTrustTier).toBe("OBSERVED");
    expect(level5.mustInclude.metricKeys).toEqual(
      expect.arrayContaining(["unsafe_tool_prevention_rate", "toolsafe_attack_reduction_rate"])
    );
    expect(level5.mustInclude.artifactPatterns).toContain("toolsafe-step-level-guardrail-report");
  });
});
