import { describe, expect, it } from "vitest";
import {
  createProofDelegatedMonitor,
  defaultIsPresent,
  numericAwareIsPresent
} from "../src/watch/proofDelegatedMonitor.js";
import type { LiveDriftSampleRow } from "../src/watch/liveDriftAlerts.js";

/**
 * The two behavioural forks the collapse deliberately CARRIED (ADR-0025).
 *
 * The five converted monitors are pinned by characterization hashes over their
 * whole result, and those caught the mutations that matter to the receipt —
 * unsorting `unique`, swapping the signed refs. But they did NOT catch changing
 * `round` from 4dp to 6dp, or discarding the `isPresent` variant, because every
 * fixture has complete evidence: coverage is exactly 1, and `round(1)` is 1 at
 * any precision, while the two presence checks only diverge on `NaN`.
 *
 * A carried parameter no test can distinguish is indistinguishable from a dead
 * one. These are the cases that tell them apart.
 */
interface Row extends LiveDriftSampleRow {
  readonly a?: unknown;
  readonly b?: unknown;
  readonly c?: unknown;
}

const row = (over: Partial<Row> = {}): Row => ({
  traceId: "t1",
  scenarioId: "s1",
  timestamp: "2026-08-20T10:00:00.000Z",
  score0to1: 1,
  behaviorSignature: "sig",
  evidenceRefs: ["ref"],
  signedEvidenceRefs: ["signed"],
  ...over
});

const monitor = (over: Partial<Parameters<typeof createProofDelegatedMonitor<Row, { p?: unknown }>>[0]> = {}) =>
  createProofDelegatedMonitor<Row, { p?: unknown }>({
    incompleteSubject: "Test-style live drift",
    summaryLabel: "test evidence coverage",
    coverageMetricId: "testEvidenceCoverage0to1",
    requiredProofFields: ["p"],
    requiredRowFields: ["a", "b"],
    rowPayload: (r) => ({ traceId: r.traceId }),
    rowDescriptor: () => ({}),
    alertRefs: () => ["alert-ref"],
    signedRefs: () => ["signed-ref"],
    enrichedSourceRefs: () => ["src"],
    delegatedSourceRefs: () => ["delegated"],
    ...over
  });

const windows = (rows: Row[]) => ({
  agentId: "default",
  sourceProof: { p: undefined },
  baselineWindow: { windowId: "b", startedAt: rows[0]!.timestamp, endedAt: rows[0]!.timestamp, rows },
  liveWindow: { windowId: "l", startedAt: rows[0]!.timestamp, endedAt: rows[0]!.timestamp, rows },
  now: new Date("2026-08-20T12:00:00.000Z")
});

describe("the presence check is a real fork, not a dead parameter", () => {
  it("disagrees on NaN, which is the only case that separates the two", () => {
    // The four monitors that omit the number branch count NaN as present; the
    // reflexionAgent variant does not. Every other value type agrees, which is
    // why no existing fixture could tell them apart.
    expect(defaultIsPresent(Number.NaN), "loose: NaN is 'present'").toBe(true);
    expect(numericAwareIsPresent(Number.NaN), "strict: NaN is not").toBe(false);

    for (const value of [0, 1, -1, true, false, "x", ["y"]]) {
      expect(defaultIsPresent(value), `agree on ${String(value)}`)
        .toBe(numericAwareIsPresent(value));
    }
  });

  it("changes measured coverage, so discarding the fork moves a receipt", () => {
    // The mutation that mattered: `const isPresent = defaultIsPresent` ignores
    // the spec's choice. With a NaN proof field the two produce different
    // coverage, so the receipt hash moves.
    const rows = [row({ a: Number.NaN, b: "present" })];
    const loose = monitor()(windows(rows));
    const strict = monitor({ isPresent: numericAwareIsPresent })(windows(rows));

    expect(loose.coverage0to1).not.toBe(strict.coverage0to1);
    expect(strict.missingReasons, "the strict variant reports the NaN field").toContain("t1.a");
    expect(loose.missingReasons, "the loose one does not").not.toContain("t1.a");
  });
});

describe("coverage rounding is observable", () => {
  it("cuts coverage at four decimal places, not six", () => {
    // Every converted fixture has COMPLETE evidence, so coverage is exactly 1
    // and `round(1)` is 1 at any precision — which is why the characterization
    // hashes could not catch a 4dp -> 6dp change. Incomplete evidence makes it
    // observable.
    //
    // One row, mirrored into both windows, so nine checks run: 1 proof field
    // (missing) + 2 x (2 row fields, one present) + 2 x (2 ref checks, both
    // present) = 6 of 9 = 0.6666... A 6dp round would give 0.666667.
    const result = monitor()(windows([row({ a: "present" })]));

    expect(result.coverage0to1).toBe(0.6667);
    expect(result.receipt.summary).toContain("test evidence coverage=0.6667");
  });
});

describe("the factory reproduces the shape its callers depend on", () => {
  it("appends evidence refs to the hashed payload and sorts them", () => {
    // `canonicalize` maps arrays without sorting, so ref order reaches the row
    // proof hash. Sorting here is what makes two runs with the same refs in a
    // different order produce the same receipt.
    const a = monitor()(windows([row({ a: "x", b: "y", evidenceRefs: ["z", "a"] })]));
    const b = monitor()(windows([row({ a: "x", b: "y", evidenceRefs: ["a", "z"] })]));

    expect(a.rowProofs[0]?.["rowProofHash"]).toBe(b.rowProofs[0]?.["rowProofHash"]);
    expect(a.rowProofs[0]?.["evidenceRefs"]).toEqual(["a", "z"]);
  });

  it("fails closed and names what is missing", () => {
    const result = monitor()(windows([row()]));

    expect(result.receipt.failClosed).toBe(true);
    expect(result.missingReasons).toContain("p");
    expect(result.receipt.summary).toContain("test evidence coverage=");
  });
});
