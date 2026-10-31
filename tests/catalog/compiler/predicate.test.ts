import { describe, expect, test } from "vitest";
import { evaluatePredicate } from "../../../src/catalog/compiler/evaluatePredicate.js";
import type { FactName, Predicate } from "../../../src/catalog/types.js";
import { makeProfile } from "./helpers.js";

// This table is an independent literal Kleene oracle, not an implementation-generated expectation.
const T: Predicate = { fact: "riskClass", equals: "low" };
const F: Predicate = { fact: "riskClass", equals: "high" };
const U: Predicate = { fact: "entityTypes", includesAny: ["non_bank_financial_institution"] };

interface Cell {
  name: string;
  predicate: Predicate;
  expected: "true" | "false" | "unknown";
  missingFacts: FactName[];
}

const CELLS: Cell[] = [
  { name: "all(true,true)=true", predicate: { all: [T, T] }, expected: "true", missingFacts: [] },
  { name: "all(true,false)=false", predicate: { all: [T, F] }, expected: "false", missingFacts: [] },
  { name: "all(true,unknown)=unknown", predicate: { all: [T, U] }, expected: "unknown", missingFacts: ["entityTypes"] },
  { name: "all(false,true)=false", predicate: { all: [F, T] }, expected: "false", missingFacts: [] },
  { name: "all(false,false)=false", predicate: { all: [F, F] }, expected: "false", missingFacts: [] },
  { name: "all(false,unknown)=false", predicate: { all: [F, U] }, expected: "false", missingFacts: [] },
  { name: "all(unknown,true)=unknown", predicate: { all: [U, T] }, expected: "unknown", missingFacts: ["entityTypes"] },
  { name: "all(unknown,false)=false", predicate: { all: [U, F] }, expected: "false", missingFacts: [] },
  { name: "all(unknown,unknown)=unknown", predicate: { all: [U, U] }, expected: "unknown", missingFacts: ["entityTypes"] },
  { name: "any(true,true)=true", predicate: { any: [T, T] }, expected: "true", missingFacts: [] },
  { name: "any(true,false)=true", predicate: { any: [T, F] }, expected: "true", missingFacts: [] },
  { name: "any(true,unknown)=true", predicate: { any: [T, U] }, expected: "true", missingFacts: [] },
  { name: "any(false,true)=true", predicate: { any: [F, T] }, expected: "true", missingFacts: [] },
  { name: "any(false,false)=false", predicate: { any: [F, F] }, expected: "false", missingFacts: [] },
  { name: "any(false,unknown)=unknown", predicate: { any: [F, U] }, expected: "unknown", missingFacts: ["entityTypes"] },
  { name: "any(unknown,true)=true", predicate: { any: [U, T] }, expected: "true", missingFacts: [] },
  { name: "any(unknown,false)=unknown", predicate: { any: [U, F] }, expected: "unknown", missingFacts: ["entityTypes"] },
  { name: "any(unknown,unknown)=unknown", predicate: { any: [U, U] }, expected: "unknown", missingFacts: ["entityTypes"] },
  { name: "not(true)=false", predicate: { not: T }, expected: "false", missingFacts: [] },
  { name: "not(false)=true", predicate: { not: F }, expected: "true", missingFacts: [] },
  { name: "not(unknown)=unknown", predicate: { not: U }, expected: "unknown", missingFacts: ["entityTypes"] }
];

describe("compiler predicate Kleene truth table (synthetic profile)", () => {
  test.each(CELLS)("$name", ({ predicate, expected, missingFacts }) => {
    const profile = makeProfile({
      riskClass: { value: "low", provenance: "asserted", source: "synthetic compiler truth-table fixture", reviewedBy: null },
      entityTypes: { value: null, provenance: "asserted", source: "synthetic compiler truth-table fixture", reviewedBy: null }
    });
    const actual = evaluatePredicate(predicate, profile);
    expect(actual.value).toBe(expected);
    expect(actual.missingFacts).toEqual(missingFacts);
  });
});
