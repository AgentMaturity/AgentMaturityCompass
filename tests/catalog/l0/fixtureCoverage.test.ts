import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allFixtures, EXECUTED_HARNESSES, harnessOf, layer0 } from "./harness.js";

/**
 * Every mandatory Layer 0 control carries a positive fixture and negative fixtures of the five evidence classes, and
 * every fixture is run: by evaluateControl ("evidence") or by the executed harness its setup names (P1-14).
 */
const REQUIRED_NEGATIVE = ["stale", "replayed", "contradictory", "cross_tenant", "empty"] as const;

describe("Layer 0 fixture coverage (P1-14)", () => {
  const fixtures = allFixtures();

  it("gives every mandatory control a positive fixture and stale, replayed, contradictory, cross_tenant and empty negatives", () => {
    for (const c of layer0.filter((x) => x.mandatory)) {
      const own = fixtures.filter((f) => f.control.id === c.id);
      expect(own.some((f) => f.envelope.polarity === "positive"), `${c.id} positive`).toBe(true);
      for (const evidenceClass of REQUIRED_NEGATIVE) {
        expect(own.some((f) => f.envelope.polarity === "negative" && f.envelope.evidenceClass === evidenceClass), `${c.id} ${evidenceClass}`).toBe(true);
      }
      expect(own.some((f) => f.envelope.evidenceClass === "violation"), `${c.id} violation case`).toBe(true);
    }
  });

  it("states a non-passing result for every negative fixture", () => {
    for (const f of fixtures.filter((x) => x.envelope.polarity === "negative")) {
      expect(["deny", "fail", "not_evaluated"], f.ref).toContain(f.envelope.expected.result);
    }
  });

  it("runs every fixture: evidence fixtures through evaluateControl, every other one in the harness file that names it", () => {
    for (const f of fixtures) {
      const harness = harnessOf(f);
      if (harness === "evidence") continue;
      const file = EXECUTED_HARNESSES[harness];
      expect(file, `${f.ref} names unknown harness ${harness}`).toBeTruthy();
      const path = join(process.cwd(), "tests/catalog/l0", file!);
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path, "utf8"), `${file} runs ${harness} fixtures`).toContain(`fixturesFor("${harness}"`);
    }
  });

  it("gives every executed harness at least one positive fixture", () => {
    for (const harness of Object.keys(EXECUTED_HARNESSES)) {
      const own = fixtures.filter((f) => harnessOf(f) === harness);
      expect(own.length, harness).toBeGreaterThan(0);
      expect(own.some((f) => f.envelope.polarity === "positive"), `${harness} positive`).toBe(true);
    }
  });
});
