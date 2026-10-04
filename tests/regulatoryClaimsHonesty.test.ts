import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CONSTRUCT_VALIDITY_DATA,
  AMC_EVALUATION_DPIA,
  getDpiaAssessment
} from "../src/compliance/globalRegulatory.js";

/**
 * G1-41: globalRegulatory shipped a construct-validity report with specific
 * psychometric results — expert correlation r=0.82, test-retest r=0.91,
 * Cronbach's alpha 0.89, factor loadings, an expert panel of n=47 and
 * peerReviewStatus 'pre-print' — for a study that was never conducted. It also
 * shipped a pre-filled DPIA, a legal document about specific processing.
 */
describe("regulatory artifacts do not claim studies that never happened", () => {
  it("marks construct validity as not conducted", () => {
    expect(CONSTRUCT_VALIDITY_DATA.validated).toBe(false);
    expect(CONSTRUCT_VALIDITY_DATA.peerReviewStatus).toBe("not-conducted");
    expect(CONSTRUCT_VALIDITY_DATA.conclusion).toMatch(/NOT A RESULT/);
    expect(CONSTRUCT_VALIDITY_DATA.conclusion).toMatch(/no construct-validity study has been conducted/i);
  });

  it("no longer presents fabricated statistics as findings", () => {
    const source = readFileSync(
      new URL("../src/compliance/globalRegulatory.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("ILLUSTRATIVE TARGETS — NO STUDY HAS BEEN CONDUCTED");
    expect(source).not.toMatch(/demonstrates good construct validity with expert correlation/);
    expect(source).not.toContain('peerReviewStatus: "pre-print"');
  });

  it("says up front that no study was run in the limitations", () => {
    expect(CONSTRUCT_VALIDITY_DATA.limitations[0]).toMatch(/No study has been run/i);
  });

  it("marks the DPIA as a template rather than a completed assessment", () => {
    expect(AMC_EVALUATION_DPIA.assessmentId).toContain("template");
    const source = readFileSync(
      new URL("../src/compliance/globalRegulatory.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("TEMPLATE — NOT A COMPLETED DPIA");
    expect(source).toMatch(/no DPO or supervisory authority has reviewed them/i);
  });

  it("does not manufacture review freshness or DPO approval on the template", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
      const dpia = getDpiaAssessment();
      expect(dpia.dpoApproval).toBe(false);
      expect(dpia.lastReviewDate).toBeNull();
      expect(dpia.nextReviewDate).toBeNull();
      expect(AMC_EVALUATION_DPIA.dpoApproval).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
