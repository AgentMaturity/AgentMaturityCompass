import { describe, expect, test } from "vitest";
import { computeVCI, generateValueCoherenceReport } from "../src/values/valueCoherence.js";
import type { RevealedPreference } from "../src/values/valueTypes.js";

function preference(preferenceId: string, impliedValue: string): RevealedPreference {
  return { preferenceId, agentId: "agent", context: "task", chosenOption: impliedValue,
    alternatives: [], impliedValue, evidenceRef: "trace", ts: Date.now() - 100, signature: "signature" };
}

describe("AXE-27 unavailable value coherence", () => {
  test.each([{ rows: [] }, { rows: [preference("a", "safety")] }])("fewer than two preferences have no rank correlation", ({ rows }) => {
    expect(computeVCI(rows)).toBeNull();
  });

  test("a single distinct dimension cannot establish rank correlation", () => {
    expect(computeVCI([preference("a", "safety"), preference("b", "safety")])).toBeNull();
  });

  test("an empty signed report explicitly retains the missing measurement", () => {
    expect(generateValueCoherenceReport("agent", [])).toMatchObject({ vci: null, outcome: "not_evaluated", sampleSize: 0 });
  });

  test("measured inverse rankings remain measured zero rather than missing", () => {
    expect(generateValueCoherenceReport("agent", [preference("a", "safety"), preference("b", "speed")])).toMatchObject({
      vci: 0, outcome: "measured", sampleSize: 2,
    });
  });
});
