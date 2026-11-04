/** Synthetic mathematical and deliberately untrusted metadata fixtures only.
 * These tests do not establish human labels, live calibration, approvals or
 * outcome-mutation qualification. Current admission always remains NE.
 */
import { describe, expect, it, vi } from "vitest";
import {
  wilson95,
  calculateConfusion,
  admitRegulatedJudgeResult,
  regulatedCalibrationAuthorityStatus
} from "../../../src/assurance/judges/calibration.js";
import { sha256Hex } from "../../../src/utils/hash.js";

const hash = (c: string): string => c.repeat(64);
const NOW = "2026-10-20T12:00:00.000Z";
const PAIRS = [
  ...Array.from({ length: 36 }, (_, i) => ({
    itemId: `tp-${i}`, expectedPass: true, predictedPass: true
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    itemId: `fp-${i}`, expectedPass: false, predictedPass: true
  })),
  ...Array.from({ length: 48 }, (_, i) => ({
    itemId: `tn-${i}`, expectedPass: false, predictedPass: false
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    itemId: `fn-${i}`, expectedPass: true, predictedPass: false
  }))
];

function request() {
  const statistics = calculateConfusion(PAIRS)!;
  const goldSetBytes = Buffer.from("Synthetic math dataset, not human-labelled gold.");
  return {
    scenarioId: "synthetic-math-fixture",
    now: NOW,
    goldSetBytes,
    diagnosticPairs: PAIRS.map(pair => ({ ...pair })),
    execution: {
      mode: "simulated",
      origin: "scripted",
      judgedPass: true,
      identity: {
        model: "fixture-model",
        promptSha256: hash("a"),
        rubricSha256: hash("b"),
        temperature: 0
      },
      responseModel: "fixture-model",
      evaluatedAt: NOW,
      calibrationId: "untrusted-fixture-record",
      callEvidenceSha256: null as string | null
    },
    calibration: {
      id: "untrusted-fixture-record",
      scenarioId: "synthetic-math-fixture",
      judge: {
        model: "fixture-model",
        promptSha256: hash("a"),
        rubricSha256: hash("b"),
        temperature: 0
      },
      goldSet: {
        path: "synthetic/math-only.bin",
        sha256: sha256Hex(goldSetBytes),
        items: 100,
        labelledBy: [] as string[],
        labelledAt: "2026-10-19T12:00:00.000Z"
      },
      confusion: statistics.confusion,
      falsePositiveRate: 0.2,
      falseNegativeRate: 0.1,
      interval95: {
        fpr: statistics.interval95.fpr!,
        fnr: statistics.interval95.fnr!
      },
      tolerance: {
        maxFpr: 0.2 as number | null,
        maxFnr: 0.1 as number | null
      },
      minimumGoldSetSize: 100 as number | null,
      calibratedAt: "2026-10-19T13:00:00.000Z",
      expiresAt: "2026-10-21T12:00:00.000Z"
    }
  };
}

function rejects(input: unknown, reason: string) {
  const result = admitRegulatedJudgeResult(input);
  expect(result.outcome).toBe("not_evaluated");
  expect(result.authorityStatus).toBe("unavailable");
  expect(result.reasons).toContain("CALIBRATION_AUTHORITY_UNAVAILABLE");
  expect(result.reasons).toContain(reason);
  return result;
}

describe("synthetic confusion/Wilson arithmetic", () => {
  it("derives counts, denominators and independently hardcoded Wilson bounds", () => {
    const actual = calculateConfusion(PAIRS)!;
    expect(actual.confusion).toEqual({ tp: 36, fp: 12, tn: 48, fn: 4 });
    expect(actual.items).toBe(100);
    expect(actual.falsePositiveRate).toBe(0.2);
    expect(actual.falseNegativeRate).toBe(0.1);
    // Independent Decimal arithmetic, z=1.96, not the function under test.
    expect(actual.interval95.fpr![0]).toBeCloseTo(0.11828389736858963, 12);
    expect(actual.interval95.fpr![1]).toBeCloseTo(0.3178204609181701, 12);
    expect(actual.interval95.fnr![0]).toBeCloseTo(0.03957888759557487, 12);
    expect(actual.interval95.fnr![1]).toBeCloseTo(0.230520743804739, 12);
  });

  it("retains uncertainty at zero successes and all successes", () => {
    expect(wilson95(0, 25)![0]).toBe(0);
    expect(wilson95(0, 25)![1]).toBeCloseTo(0.13319649395317874, 12);
    expect(wilson95(25, 25)![0]).toBeCloseTo(0.8668035060468213, 12);
    expect(wilson95(25, 25)![1]).toBe(1);
  });

  it.each([
    [0, 0], [1, 0], [-1, 4], [5, 4], [1.5, 4], [1, 4.5],
    [NaN, 4], [1, Infinity], ["1", 4], [true, 4],
    [1, Number.MAX_SAFE_INTEGER + 1]
  ])("refuses invalid Wilson inputs %j", (successes, total) => {
    expect(wilson95(successes, total)).toBeNull();
  });

  it("treats empty/missing reference classes as unknown, not zero risk", () => {
    expect(calculateConfusion([])).toMatchObject({
      items: 0, falsePositiveRate: null, falseNegativeRate: null
    });
    const actual = calculateConfusion([
      { itemId: "only-positive", expectedPass: true, predictedPass: true }
    ])!;
    expect(actual.falsePositiveRate).toBeNull();
    expect(actual.interval95.fpr).toBeNull();
  });

  it.each([
    { name: "null", input: null },
    { name: "object", input: {} },
    { name: "wrong boolean", input: [{ itemId: "x", expectedPass: "true", predictedPass: true }] },
    { name: "duplicate ID", input: [PAIRS[0], PAIRS[0]] },
    { name: "blank ID", input: [{ itemId: " ", expectedPass: true, predictedPass: true }] },
    { name: "extra field", input: [{ ...PAIRS[0], extra: true }] }
  ])("refuses malformed pairs: $name", ({ input }) => {
    expect(calculateConfusion(input)).toBeNull();
  });
});

describe("current regulated rejection diagnostics, not positive admission", () => {
  it("exposes honest unavailable authority with no positive capability", () => {
    expect(regulatedCalibrationAuthorityStatus()).toMatchObject({
      available: false, reason: "CALIBRATION_AUTHORITY_UNAVAILABLE"
    });
    const actual = rejects(request(), "SIMULATED_JUDGE_NOT_ADMISSIBLE");
    expect(actual.claimKind).toBe("synthetic_example");
    expect(actual.statisticsSource).toBe("unverified_diagnostic_pairs");
  });

  it("does not count self-declared live/human metadata or invoke caller authorizers", () => {
    const input = request();
    input.execution.mode = "llm";
    input.execution.origin = "live_llm";
    input.execution.callEvidenceSha256 = hash("d");
    // Deliberate untrusted declarations, not named real humans or approval.
    input.calibration.goldSet.labelledBy = ["untrusted-fixture-a", "untrusted-fixture-b"];
    rejects(input, "CALIBRATION_AUTHORITY_UNAVAILABLE");
    const callback = vi.fn(() => true);
    rejects({ ...input, authority: { verified: true, verify: callback } }, "INVALID_ADMISSION_INPUT");
    expect(callback).not.toHaveBeenCalled();
  });

  it("preserves synthetic kind even with malformed simulated pins", () => {
    const input = request();
    input.execution.identity.promptSha256 = "invalid";
    expect(rejects(input, "INVALID_ADMISSION_INPUT").claimKind).toBe("synthetic_example");
  });

  it.each(["model", "promptSha256", "rubricSha256", "temperature"] as const)(
    "diagnoses a changed %s pin", key => {
      const input = request();
      if (key === "temperature") input.execution.identity.temperature = 0.1;
      else input.execution.identity[key] = key === "model" ? "changed-model" : hash("f");
      rejects(input, "JUDGE_IDENTITY_MISMATCH");
    }
  );

  it("diagnoses returned-model and exact scenario/calibration mismatches", () => {
    const model = request();
    model.execution.responseModel = "other";
    rejects(model, "RESPONSE_MODEL_MISMATCH");
    const scenario = request();
    scenario.scenarioId = "other";
    rejects(scenario, "CALIBRATION_SCOPE_MISMATCH");
    const record = request();
    record.execution.calibrationId = "other";
    rejects(record, "CALIBRATION_SCOPE_MISMATCH");
  });

  it("diagnoses exact expiry/future/invalid times without claiming outcome qualification", () => {
    const expired = request();
    expired.calibration.expiresAt = NOW;
    rejects(expired, "CALIBRATION_EXPIRED_OR_FUTURE");
    const future = request();
    future.calibration.calibratedAt = "2026-10-21T00:00:00.000Z";
    rejects(future, "CALIBRATION_EXPIRED_OR_FUTURE");
    const call = request();
    call.execution.evaluatedAt = "2026-10-21T00:00:00.000Z";
    rejects(call, "EXECUTION_IN_FUTURE");
    const invalid = request();
    invalid.now = "2026-02-30T00:00:00.000Z";
    rejects(invalid, "INVALID_ADMISSION_INPUT");
  });

  it.each([
    {
      name: "year 9999 before expanded year 10000",
      now: "+010000-01-02T12:00:00.000Z",
      evaluatedAt: "9999-12-31T12:00:00.000Z",
      calibratedAt: "9999-12-31T00:00:00.000Z",
      expiresAt: "+010000-01-03T00:00:00.000Z",
      labelledAt: "9999-12-30T00:00:00.000Z"
    },
    {
      name: "ordinary-year labels before expanded-year calibration",
      now: "+010000-01-03T00:00:00.000Z",
      evaluatedAt: "+010000-01-02T00:00:00.000Z",
      calibratedAt: "+010000-01-01T00:00:00.000Z",
      expiresAt: "+010000-01-04T00:00:00.000Z",
      labelledAt: "9999-12-31T00:00:00.000Z"
    },
    {
      name: "negative years in chronological order",
      now: "-000001-01-03T00:00:00.000Z",
      evaluatedAt: "-000001-01-02T00:00:00.000Z",
      calibratedAt: "-000002-12-31T00:00:00.000Z",
      expiresAt: "0000-01-01T00:00:00.000Z",
      labelledAt: "-000003-01-01T00:00:00.000Z"
    }
  ])("orders valid ISO instants numerically: $name", times => {
    // Complete schema input: only temporal values change. Still synthetic/NE.
    const input = request();
    input.now = times.now;
    input.execution.evaluatedAt = times.evaluatedAt;
    input.calibration.calibratedAt = times.calibratedAt;
    input.calibration.expiresAt = times.expiresAt;
    input.calibration.goldSet.labelledAt = times.labelledAt;
    const actual = rejects(input, "CALIBRATION_AUTHORITY_UNAVAILABLE");
    expect(actual.reasons).not.toContain("INVALID_ADMISSION_INPUT");
    expect(actual.reasons).not.toContain("CALIBRATION_EXPIRED_OR_FUTURE");
    expect(actual.reasons).not.toContain("EXECUTION_IN_FUTURE");
    expect(actual.reasons).not.toContain("LABEL_TIME_AFTER_CALIBRATION");
  });

  it("detects an expanded-year execution after an ordinary-year clock", () => {
    const input = request();
    input.now = "9999-12-31T00:00:00.000Z";
    input.execution.evaluatedAt = "+010000-01-01T00:00:00.000Z";
    input.calibration.calibratedAt = "9999-12-30T00:00:00.000Z";
    input.calibration.expiresAt = "+010000-01-02T00:00:00.000Z";
    input.calibration.goldSet.labelledAt = "9999-12-29T00:00:00.000Z";
    const actual = rejects(input, "EXECUTION_IN_FUTURE");
    expect(actual.reasons).not.toContain("INVALID_ADMISSION_INPUT");
  });

  it("diagnoses missing execution/calibration/buffers and changed byte hash", () => {
    const input = request();
    rejects({ ...input, execution: null }, "JUDGE_EXECUTION_UNAVAILABLE");
    rejects({ ...input, calibration: null }, "CALIBRATION_MISSING");
    rejects({ ...input, goldSetBytes: null }, "GOLD_SET_BYTES_MISSING");
    input.calibration.goldSet.sha256 = hash("0");
    rejects(input, "GOLD_SET_DIGEST_MISMATCH");
  });

  it("does not invent expert policy, two human labels or minimum sample size", () => {
    const input = request();
    input.calibration.minimumGoldSetSize = null;
    input.calibration.tolerance = { maxFpr: null, maxFnr: null };
    const actual = rejects(input, "EXPERT_MINIMUM_NOT_RECORDED");
    expect(actual.reasons).toContain("EXPERT_TOLERANCES_NOT_RECORDED");
    expect(actual.reasons).toContain("TWO_DISTINCT_LABELLERS_NOT_DECLARED");
    const alias = request();
    alias.calibration.goldSet.labelledBy = ["Fixture A", " fixture a "];
    rejects(alias, "TWO_DISTINCT_LABELLERS_NOT_DECLARED");
    const small = request();
    small.calibration.minimumGoldSetSize = 101;
    rejects(small, "GOLD_SET_BELOW_DECLARED_MINIMUM");
  });

  it("diagnoses statistics tampering and declared tolerance exceedance", () => {
    const counts = request();
    counts.calibration.confusion.fp = 0;
    rejects(counts, "CALIBRATION_STATISTICS_MISMATCH");
    const rate = request();
    rate.calibration.falsePositiveRate = 0;
    rejects(rate, "CALIBRATION_STATISTICS_MISMATCH");
    const interval = request();
    interval.calibration.interval95.fpr = [0, 0];
    rejects(interval, "CALIBRATION_STATISTICS_MISMATCH");
    const tolerance = request();
    tolerance.calibration.tolerance.maxFnr = 0.05;
    rejects(tolerance, "CALIBRATION_OUTSIDE_DECLARED_TOLERANCE");
  });

  it("diagnoses duplicate pairs, absent classes and declared item-count drift", () => {
    const duplicate = request();
    duplicate.diagnosticPairs.push({ ...duplicate.diagnosticPairs[0]! });
    rejects(duplicate, "INVALID_DIAGNOSTIC_PAIRS");
    const absent = request();
    absent.diagnosticPairs = absent.diagnosticPairs.map(pair => ({ ...pair, expectedPass: false }));
    rejects(absent, "CALIBRATION_CLASS_DENOMINATOR_EMPTY");
    const count = request();
    count.calibration.goldSet.items = 99;
    rejects(count, "DECLARED_GOLD_ITEM_COUNT_MISMATCH");
  });

  it("rejects unsafe counts, zero minimums, NaN and extra approval flags", () => {
    const count = request();
    count.calibration.confusion.fp = -1;
    rejects(count, "INVALID_ADMISSION_INPUT");
    const minimum = request();
    minimum.calibration.minimumGoldSetSize = 0;
    rejects(minimum, "INVALID_ADMISSION_INPUT");
    const number = request();
    number.execution.identity.temperature = NaN;
    rejects(number, "INVALID_ADMISSION_INPUT");
    rejects({ ...request(), approved: true }, "INVALID_ADMISSION_INPUT");
  });

  it("rereads metadata without caching caller identity as authority", () => {
    const input = request();
    admitRegulatedJudgeResult(input);
    input.calibration.judge.model = "changed";
    rejects(input, "JUDGE_IDENTITY_MISMATCH");
  });
});
