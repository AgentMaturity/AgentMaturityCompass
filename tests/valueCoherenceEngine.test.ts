import { describe, expect, test, vi } from "vitest";
import {
  computeVCI,
  computeValueDrift,
  computeValueDriftAnalytics,
  detectInversions,
  generateValueCoherenceReport,
  parseWindowString
} from "../src/values/valueCoherence.js";
import type { RevealedPreference } from "../src/values/valueTypes.js";

function pref(input: Partial<RevealedPreference> & Pick<RevealedPreference, "preferenceId" | "impliedValue" | "ts">): RevealedPreference {
  return {
    preferenceId: input.preferenceId,
    agentId: input.agentId ?? "agent-1",
    context: input.context ?? "incident-response",
    chosenOption: input.chosenOption ?? `choose-${input.impliedValue}`,
    alternatives: input.alternatives ?? ["speed", "safety"],
    impliedValue: input.impliedValue,
    evidenceRef: input.evidenceRef ?? "run#1",
    ts: input.ts,
    signature: input.signature ?? "sig"
  };
}

describe("value coherence engine", () => {
  test("computeVCI ignores malformed/unknown dimensions and clamps result", () => {
    const rows: RevealedPreference[] = [
      pref({ preferenceId: "a", impliedValue: "safety", ts: 1, alternatives: ["speed"] }),
      pref({ preferenceId: "b", impliedValue: "speed", ts: 2, alternatives: ["safety"] }),
      pref({ preferenceId: "c", impliedValue: "unknown_dimension", ts: 3 }),
      pref({ preferenceId: "d", impliedValue: "privacy", ts: Number.NaN })
    ];

    const out = computeVCI(rows);
    expect(out).toBeGreaterThanOrEqual(0);
    expect(out).toBeLessThanOrEqual(1);
  });

  test("detectInversions is deterministic and context-aware", () => {
    const t0 = Date.UTC(2026, 1, 1, 10, 0, 0);
    const rows: RevealedPreference[] = [
      pref({ preferenceId: "p1", impliedValue: "safety", alternatives: ["speed"], context: "incident", chosenOption: "block", ts: t0 }),
      pref({ preferenceId: "p2", impliedValue: "speed", alternatives: ["safety"], context: "incident", chosenOption: "bypass", ts: t0 + 5_000 }),
      // same value swap but different context should not trigger
      pref({ preferenceId: "p3", impliedValue: "speed", alternatives: ["safety"], context: "marketing", chosenOption: "fast", ts: t0 + 10_000 })
    ];

    const a = detectInversions(rows);
    const b = detectInversions(rows);

    expect(a.length).toBe(1);
    expect(a[0]?.severity).toBe("CRITICAL");
    expect(a[0]?.inversionId).toBe(b[0]?.inversionId);
    expect(a[0]?.detectedTs).toBe(t0 + 5_000);
  });

  test("computeValueDrift surfaces top shift and sorting", () => {
    const base = Date.UTC(2026, 1, 2, 0, 0, 0);
    const rows: RevealedPreference[] = [
      pref({ preferenceId: "a", impliedValue: "safety", alternatives: ["speed"], ts: base + 1 }),
      pref({ preferenceId: "b", impliedValue: "safety", alternatives: ["speed"], ts: base + 2 }),
      pref({ preferenceId: "c", impliedValue: "speed", alternatives: ["safety"], ts: base + 3 }),
      pref({ preferenceId: "d", impliedValue: "speed", alternatives: ["safety"], ts: base + 4 })
    ];

    const drift = computeValueDrift(rows, 7 * 24 * 3600_000);
    expect(drift.length).toBeGreaterThan(0);
    expect(drift[0]!.delta).toBeGreaterThanOrEqual(drift.at(-1)!.delta);
    expect(drift.some((row) => row.trend === "SHIFTING" || row.trend === "DRIFTING")).toBe(true);

    const analytics = computeValueDriftAnalytics(drift);
    expect(analytics.maxDelta).toBeGreaterThanOrEqual(analytics.meanDelta);
    expect(analytics.stableCount + analytics.driftingCount + analytics.shiftingCount).toBe(drift.length);
  });

  test("detectInversions short-circuits safely on very large datasets", () => {
    const t0 = Date.UTC(2026, 1, 1, 0, 0, 0);
    const rows: RevealedPreference[] = [];
    for (let idx = 0; idx < 250; idx += 1) {
      rows.push(
        pref({
          preferenceId: `p-${idx}`,
          impliedValue: idx % 2 === 0 ? "safety" : "speed",
          alternatives: idx % 2 === 0 ? ["speed"] : ["safety"],
          context: "incident response",
          chosenOption: idx % 2 === 0 ? `safe-${idx}` : `fast-${idx}`,
          ts: t0 + idx
        })
      );
    }

    const out = detectInversions(rows);
    expect(Array.isArray(out)).toBe(true);
  });

  test("generateValueCoherenceReport signs deterministic payload fields", () => {
    const now = Date.UTC(2026, 1, 10, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const rows: RevealedPreference[] = [
      pref({ preferenceId: "x1", impliedValue: "safety", alternatives: ["speed"], ts: now - 1_000 }),
      pref({ preferenceId: "x2", impliedValue: "speed", alternatives: ["safety"], ts: now - 500 })
    ];

    const r1 = generateValueCoherenceReport("agent-1", rows, 24 * 3600_000);
    const r2 = generateValueCoherenceReport("agent-1", rows, 24 * 3600_000);

    expect(r1.signature).toBe(r2.signature);
    expect(r1.preferenceCount).toBe(2);
    expect(r1.vci).toBeGreaterThanOrEqual(0);
    expect(r1.vci).toBeLessThanOrEqual(1);

    vi.useRealTimers();
  });

  test("parseWindowString parses units with sane default", () => {
    expect(parseWindowString("14d")).toBe(14 * 24 * 3600_000);
    expect(parseWindowString("6h")).toBe(6 * 3600_000);
    expect(parseWindowString("30m")).toBe(30 * 60_000);
    expect(parseWindowString("oops")).toBe(14 * 24 * 3600_000);
  });
});
