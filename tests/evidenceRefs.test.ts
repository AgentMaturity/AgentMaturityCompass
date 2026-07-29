import { describe, expect, test } from "vitest";
import {
  hasNonBlankEvidenceRef,
  normalizeEvidenceRefs,
} from "../src/watch/evidenceRefs.js";

describe("hasNonBlankEvidenceRef", () => {
  test("rejects missing, empty, and whitespace-only references", () => {
    expect(hasNonBlankEvidenceRef(undefined)).toBe(false);
    expect(hasNonBlankEvidenceRef(null)).toBe(false);
    expect(hasNonBlankEvidenceRef([])).toBe(false);
    expect(hasNonBlankEvidenceRef(["", "  ", "\t"])).toBe(false);
  });

  test("ignores non-string entries in mixed runtime input", () => {
    expect(hasNonBlankEvidenceRef([" ", null, 42, {}, false])).toBe(false);
    expect(hasNonBlankEvidenceRef([null, 42, " evidence:valid "])).toBe(true);
  });

  test("accepts valid evidence references", () => {
    expect(hasNonBlankEvidenceRef(["evidence:trace-1"])).toBe(true);
    expect(hasNonBlankEvidenceRef(["", "signed:ledger-1"])).toBe(true);
  });
});

describe("normalizeEvidenceRefs", () => {
  test("rejects null, non-array, and mixed non-string runtime values", () => {
    expect(normalizeEvidenceRefs(null)).toEqual([]);
    expect(normalizeEvidenceRefs("evidence:scalar-not-an-array")).toEqual([]);
    expect(normalizeEvidenceRefs({ evidence: "not-an-array" })).toEqual([]);
    expect(normalizeEvidenceRefs([null, 42, {}, false, "", "   "])).toEqual([]);
  });

  test("deduplicates valid strings without trimming or rewriting them", () => {
    expect(normalizeEvidenceRefs([
      " evidence:kept-verbatim ",
      "",
      " evidence:kept-verbatim ",
      "evidence:second",
    ])).toEqual([
      " evidence:kept-verbatim ",
      "evidence:second",
    ]);
  });
});
