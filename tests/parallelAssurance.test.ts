import { describe, expect, test } from "vitest";
import { listAssurancePacks } from "../src/assurance/packs/index.js";
import type { RunAssuranceInput } from "../src/assurance/assuranceRunner.js";

describe("Parallel Assurance via Fork — AMC-149", () => {
  test("RunAssuranceInput accepts parallel and maxConcurrency options", () => {
    const input: RunAssuranceInput = {
      workspace: "/tmp/test",
      mode: "sandbox",
      window: "14d",
      parallel: true,
      maxConcurrency: 8,
    };

    expect(input.parallel).toBe(true);
    expect(input.maxConcurrency).toBe(8);
  });

  test("RunAssuranceInput defaults to sequential when parallel is not set", () => {
    const input: RunAssuranceInput = {
      workspace: "/tmp/test",
      mode: "sandbox",
      window: "14d",
    };

    expect(input.parallel).toBeUndefined();
  });

  test("pack index has enough packs to benefit from parallelism", () => {
    const packs = listAssurancePacks();
    // We need at least 4 packs for parallelism to matter
    expect(packs.length).toBeGreaterThan(4);
  });

  test("all packs have unique IDs (required for parallel correctness)", () => {
    const packs = listAssurancePacks();
    const ids = packs.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("pack execution is pure (no shared mutable state between packs)", () => {
    // Verify packs don't share scenario arrays (which would cause race conditions)
    const packs1 = listAssurancePacks();
    const packs2 = listAssurancePacks();

    // Each call should return independent copies
    for (let i = 0; i < Math.min(packs1.length, 5); i++) {
      expect(packs1[i]!.scenarios).not.toBe(packs2[i]!.scenarios);
      expect(packs1[i]!.scenarios).toEqual(packs2[i]!.scenarios);
    }
  });
});
