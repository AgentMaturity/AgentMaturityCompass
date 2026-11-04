import { describe, expect, test } from "vitest";
import { loadCatalog } from "../../src/catalog/loader.js";
import { parsePredicate, validatePredicate } from "../../src/catalog/predicate.js";
import type { Predicate } from "../../src/catalog/types.js";

const vocabulary = loadCatalog().vocabulary!;

describe("declarative catalog predicates", () => {
  test("accepts all seven operators without evaluating data", () => {
    for (const value of [
      { always: true }, { all: [{ always: true }] }, { any: [{ always: true }] },
      { not: { always: true } }, { fact: "jurisdictions", includesAny: ["US"] },
      { fact: "jurisdictions", includesAll: ["US"] }, { fact: "primaryStation", equals: "wealth" }
    ]) {
      expect(validatePredicate(parsePredicate(value), vocabulary)).toEqual([]);
    }
    expect(() => parsePredicate({ fact: "jurisdictions", eval: "process.exit(1)" })).toThrow("invalid predicate");
  });

  test("refuses unknown vocabulary and the wrong operator for a fact", () => {
    expect(validatePredicate({ fact: "jurisdictions", includesAny: ["MARS"] }, vocabulary))
      .toEqual([expect.objectContaining({ code: "CAT_VOCAB" })]);
    expect(validatePredicate({ fact: "primaryStation", includesAny: ["wealth"] }, vocabulary))
      .toEqual([expect.objectContaining({ code: "CAT_SCHEMA" })]);
    expect(validatePredicate({ fact: "jurisdictions", equals: "US" }, vocabulary))
      .toEqual([expect.objectContaining({ code: "CAT_SCHEMA" })]);
  });

  test("accepts eight levels and refuses the ninth", () => {
    let predicate: Predicate = { always: true };
    for (let depth = 1; depth < 8; depth++) predicate = { not: predicate };
    expect(parsePredicate(predicate)).toEqual(predicate);
    expect(validatePredicate(predicate, vocabulary)).toEqual([]);
    const tooDeep = { not: predicate };
    expect(() => parsePredicate(tooDeep)).toThrow("deeper than 8 levels");
    expect(validatePredicate(tooDeep, vocabulary)).toEqual([expect.objectContaining({ code: "CAT_SCHEMA" })]);
  });

  test("counts the root toward the 64-node limit", () => {
    const leaves = Array.from({ length: 63 }, (): Predicate => ({ always: true }));
    expect(parsePredicate({ all: leaves })).toEqual({ all: leaves });
    expect(validatePredicate({ all: leaves }, vocabulary)).toEqual([]);
    const oversized = { all: [...leaves, { always: true } as const] };
    expect(() => parsePredicate(oversized)).toThrow("more than 64 nodes");
    expect(validatePredicate(oversized, vocabulary)).toEqual([expect.objectContaining({ code: "CAT_SCHEMA" })]);
  });
});
