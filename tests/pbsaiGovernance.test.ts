import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { generateFrameworkReport, listSupportedFrameworks } from "../src/score/crossFrameworkMapping.js";

describe("PBSAI governance mapping", () => {
  test("registers PBSAI as a twelve-domain framework", () => {
    const frameworks = listSupportedFrameworks();
    const pbsai = frameworks.find((entry) => entry.framework === "PBSAI");

    expect(pbsai).toBeDefined();
    expect(pbsai?.controlCount).toBe(12);
    expect(pbsai?.description).toContain("twelve-domain");
  });

  test("generates PBSAI report with context-envelope artifacts", () => {
    const report = generateFrameworkReport("PBSAI", {
      passedQIDs: ["AMC-3.6.1", "AMC-2.7", "AMC-2.5"],
      activeModules: ["outputAttestation", "watch", "supplyChain"],
    });

    expect(report.framework).toBe("PBSAI");
    expect(report.coveredControls).toContain("PBSAI-ARCHITECTURE");
    expect(report.coveredControls).toContain("PBSAI-INCIDENT-RESPONSE");
    expect(report.coveredControls).toContain("PBSAI-SUPPLY-CHAIN");
    expect(report.auditArtifacts).toEqual(
      expect.arrayContaining(["PBSAI_Context_Envelope.json", "PBSAI_Output_Contracts.json"])
    );
  });

  test("adds diagnostic question for structured context envelopes", () => {
    const question = questionBank.find((row) => row.id === "AMC-3.6.1");

    expect(question).toBeDefined();
    expect(question?.title).toBe("Structured Context Envelopes");
    expect(question?.promptTemplate).toContain("structured context envelope");
    expect(question?.evidenceGateHints).toContain("output contract schema");
    expect(question?.tuningKnobs).toContain("context.envelopeSchema");
  });
});
