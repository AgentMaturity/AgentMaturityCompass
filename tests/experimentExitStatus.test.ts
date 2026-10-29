import { describe, expect, test } from "vitest";
import { experimentReportExitCode } from "../src/experiments/experimentCli.js";
import type { CasebookRunCaseResult } from "../src/types.js";

function result(overrides: Partial<CasebookRunCaseResult> = {}): CasebookRunCaseResult {
  return {
    caseId: "case_1", title: "exit taxonomy", baselineSuccess: true, candidateSuccess: true,
    baselineValuePoints: 0, candidateValuePoints: 0, baselineCost: null, candidateCost: null, reasons: [],
    baselineStatus: "passed", candidateStatus: "passed", paired: true, ...overrides
  };
}

describe("experiment report exit taxonomy", () => {
  test.each([
    { name: "all candidate cases passed", cases: [result()], code: 0 },
    { name: "candidate passes despite baseline failure", cases: [result({ baselineSuccess: false, baselineStatus: "failed" })], code: 0 },
    { name: "legacy all-pass booleans remain readable", cases: [result({ baselineStatus: undefined, candidateStatus: undefined, paired: undefined })], code: 0 },
    { name: "qualified candidate failure", cases: [result({ candidateStatus: "failed", candidateSuccess: false })], code: 1 },
    { name: "legacy candidate failure", cases: [result({ candidateStatus: undefined, candidateSuccess: false })], code: 1 },
    { name: "unavailable false is not a failure", cases: [result({ candidateStatus: "unavailable", candidateSuccess: false })], code: 3 },
    { name: "unavailable overrides a contradictory success", cases: [result({ candidateStatus: "unavailable" })], code: 3 },
    { name: "baseline unavailable", cases: [result({ baselineStatus: "unavailable" })], code: 3 },
    { name: "unpaired result", cases: [result({ paired: false })], code: 3 },
    { name: "missing candidate success", cases: [result({ candidateSuccess: undefined as unknown as boolean })], code: 3 },
    { name: "missing baseline success", cases: [result({ baselineSuccess: undefined as unknown as boolean })], code: 3 },
    { name: "empty report", cases: [], code: 3 },
    { name: "failure wins over unavailable", cases: [result({ candidateStatus: "unavailable", candidateSuccess: false }), result({ candidateStatus: "failed", candidateSuccess: false })], code: 1 }
  ])("$name", ({ cases, code }) => {
    expect(experimentReportExitCode({ cases })).toBe(code);
  });
});
