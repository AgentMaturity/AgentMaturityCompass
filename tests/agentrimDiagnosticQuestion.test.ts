import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";

describe("AgenTRIM diagnostic question", () => {
  test("adds per-step least-privilege tool-access diagnostics", () => {
    const question = questionBank.find((row) => row.id === "AMC-5.29");

    expect(question).toBeDefined();
    expect(question?.layerName).toBe("Skills");
    expect(question?.title).toBe("Per-Step Tool Least-Privilege");
    expect(question?.promptTemplate).toContain("per-step least-privilege tool access");
    expect(question?.promptTemplate).toContain("status-aware validation");
    expect(question?.evidenceGateHints).toContain("tool-interface reconstruction");
    expect(question?.upgradeHints).toContain("AgenTRIM");
    expect(question?.tuningKnobs).toContain("guardrails.toolAdaptiveFiltering");
  });

  test("requires observed per-step tool receipts and status-aware validation at higher levels", () => {
    const question = questionBank.find((row) => row.id === "AMC-5.29");
    expect(question).toBeDefined();

    const level3 = question!.gates[3]!;
    const level4 = question!.gates[4]!;
    const level5 = question!.gates[5]!;

    expect(level3.requiredEvidenceTypes).toEqual(expect.arrayContaining(["tool_action", "tool_result"]));
    expect(level3.mustInclude.auditTypes).toContain("PER_STEP_TOOL_SCOPE_CHECK");
    expect(level3.mustInclude.metricKeys).toContain("per_step_least_privilege_rate");
    expect(level3.mustInclude.metaKeys).toEqual(expect.arrayContaining(["toolId", "planStepId", "permissionScope"]));

    expect(level4.requiredTrustTier).toBe("OBSERVED");
    expect(level4.mustInclude.auditTypes).toEqual(
      expect.arrayContaining(["TOOL_SCOPE_FILTERED", "STATUS_AWARE_TOOL_VALIDATION"])
    );
    expect(level4.mustInclude.metricKeys).toContain("excess_tool_permission_block_rate");

    expect(level5.requiredTrustTier).toBe("OBSERVED");
    expect(level5.mustInclude.metricKeys).toEqual(
      expect.arrayContaining(["per_step_least_privilege_rate", "tool_misuse_attack_block_rate"])
    );
    expect(level5.mustInclude.artifactPatterns).toContain("agentrim-tool-interface-reconstruction");
  });
});
