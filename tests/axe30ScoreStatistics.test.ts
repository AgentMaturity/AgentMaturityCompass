import { expect, it } from "vitest";
import { stabilizeScores } from "../src/score/antiGaming.js";
import { computeInheritedTrust } from "../src/fleet/trustInheritance.js";

it("AXE-30 preserves trimmed population variance with a confidence-weighted normal interval", () => {
  const result = stabilizeScores([1, 2, 4], [1, 1, 4]);
  expect(result.stabilizedScore).toBe(3.1667);
  expect(result.variance).toBe(1.555556);
  expect(result.confidenceInterval).toEqual({ lower: 1.7553, upper: 4.578 });
});


it("AXE-30 trust inheritance retains evidence-weighted harmonic rather than arithmetic averaging", () => {
  const result = computeInheritedTrust(
    { agentId: "orchestrator", integrityIndex: 1, confidence: 1, evidenceQuality: 1 },
    [{ agentId: "worker", integrityIndex: 0.25, confidence: 1, evidenceQuality: 0.5 }],
    { mode: "WEIGHTED", weightDecayFactor: 1, minimumFloor: 0 },
  );
  expect(result.compositeTrust).toBe(0.5);
  expect(result.workerTrusts).toEqual([{ agentId: "worker", trust: 0.25, weight: 0.5 }]);
});
