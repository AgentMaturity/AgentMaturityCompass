import { describe, expect, test } from "vitest";
import { DOUBLES, outcomeOf, runConformance } from "./runConformance.js";

const producer = (mode: string) => `${process.execPath} ${DOUBLES}/producerDouble.mjs ${mode} {scenario} {outDir}`;
const adapter = (mode: string) => `${process.execPath} ${DOUBLES}/adapterDouble.mjs ${mode} {hookPayload} {policy}`;

describe("producer class (P1-32)", () => {
  test("records that parse, chain and say enforcement none as an importer pass every normative case", () => {
    const { status, results } = runConformance("producer", producer("honest"));
    expect(results?.cases.filter(item => item.normative && item.outcome !== "pass")).toEqual([]);
    // The signature case is informative and skipped until P1-30's key-id rule; it does not block conformance.
    expect(outcomeOf(results, "PRD-005")).toBe("skipped");
    expect(results?.conformant).toBe(true);
    expect(status).toBe(0);
  });

  test("an importer emitting enforcement: enforced fails PRD-004; the same records with none pass", () => {
    const { results } = runConformance("producer", producer("claims-enforced"));
    expect(results?.cases.find(item => item.id === "PRD-004")).toMatchObject({ outcome: "fail", diff: { receipt: 0, enforcement: { expected: "none" } } });
    expect(results?.conformant).toBe(false);
    expect(outcomeOf(runConformance("producer", producer("honest")).results, "PRD-004")).toBe("pass");
  });

  test("events that do not chain by hash fail PRD-002", () => {
    const { results } = runConformance("producer", producer("broken-chain"));
    expect(outcomeOf(results, "PRD-002")).toBe("fail");
    expect(results?.conformant).toBe(false);
  });
});

describe("adapter class (P1-32)", () => {
  test("decisions follow the policy and receipts name the hook as the enforcement boundary", () => {
    const { status, results } = runConformance("adapter", adapter("honest"));
    expect(results?.cases.map(item => [item.id, item.outcome])).toEqual([["ADP-001", "pass"], ["ADP-002", "pass"], ["ADP-003", "pass"], ["ADP-004", "pass"]]);
    expect(status).toBe(0);
  });

  test("observation-only mode that claims enforcement fails ADP-004", () => {
    const { results } = runConformance("adapter", adapter("observer-claims-enforced"));
    expect(results?.cases.find(item => item.id === "ADP-004")).toMatchObject({ outcome: "fail", diff: { enforcement: { expected: "no enforcement claim in observation-only mode" } } });
    expect(results?.conformant).toBe(false);
  });
});

describe("compiler class (P1-32)", () => {
  test("is informative until P1-10: every case is skipped and the run is never conformant", () => {
    const { status, results } = runConformance("compiler", `${process.execPath} -e 0 {profile} {catalogLock} {outDir}`);
    expect(results?.cases.every(item => !item.normative && item.outcome === "skipped")).toBe(true);
    expect(results).toMatchObject({ conformant: false, summary: { normativePassed: 0, normativeTotal: 0 } });
    expect(status).toBe(1);
  });
});
