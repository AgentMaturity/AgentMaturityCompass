import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allFixtures, catalog, controls, EXECUTED_HARNESSES, harnessOf } from "./harness.js";
import { isSeededFixtureDeclaration, partitionFixtureDeclarations } from "../executedDeclarations.js";

/**
 * Every mandatory Layer 0 control carries a positive fixture and negative fixtures of the five evidence classes, and
 * each legacy fixture names evaluateControl ("evidence") or its real harness (P1-14). Source-valid seeded declarations
 * take a separate metadata branch; their fresh effects run in tests/assurance/executed/catalogCases.test.ts.
 */
const REQUIRED_NEGATIVE = ["stale", "replayed", "contradictory", "cross_tenant", "empty"] as const;

describe("Layer 0 fixture coverage (P1-14)", () => {
  const fixtures = allFixtures();
  const partition = partitionFixtureDeclarations(catalog, fixtures);

  it("gives every mandatory control a positive fixture and stale, replayed, contradictory, cross_tenant and empty negatives", () => {
    for (const c of controls.filter((x) => x.mandatory)) {
      const own = partition.fixtures.filter((f) => f.control.id === c.id);
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

  it("routes legacy fixtures to real harnesses and validates seeded declarations separately", () => {
    for (const f of fixtures) {
      if (isSeededFixtureDeclaration(catalog, f)) continue;
      const harness = harnessOf(f);
      if (harness === "evidence") continue;
      const file = EXECUTED_HARNESSES[harness];
      expect(file, `${f.ref} names unknown harness ${harness}`).toBeTruthy();
      const path = join(process.cwd(), "tests/catalog/l0", file!);
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path, "utf8"), `${file} runs ${harness} fixtures`).toContain(`fixturesFor("${harness}"`);
    }
  });

  it("recognizes exactly 40 source-bound declarations without calling them production harness execution", () => {
    expect(new Set(partition.declarations.map(f => f.ref)).size).toBe(40);
    expect(partition.declarations.every(f => f.envelope.setup.synthetic === true && f.envelope.setup.harness === undefined)).toBe(true);
    for (const [controlId, count] of [["L1-EDU-03", 5], ["L1-ENV-04", 3], ["L1-MOB-01", 3]] as const) {
      expect(partition.declarations.filter(f => f.control.id === controlId)).toHaveLength(count);
    }
    expect(partition.fixtures.every(f => f.envelope.setup.metadataOnly !== true)).toBe(true);
  });

  it("does not turn an unknown legacy harness or a forged declaration into a skipped fixture", () => {
    const legacy = partition.fixtures[0]!;
    const unknown = { ...legacy, envelope: { ...legacy.envelope, setup: { ...legacy.envelope.setup, harness: "unknown_p227_harness" } } };
    expect(isSeededFixtureDeclaration(catalog, unknown)).toBe(false);
    expect(EXECUTED_HARNESSES[harnessOf(unknown)]).toBeUndefined();
    const declaration = partition.declarations[0]!;
    const envelope = structuredClone(declaration.envelope);
    (envelope.setup.execution as { caseId: string }).caseId = "unknown-p227-case";
    const loaded = catalog.fixtures.get(declaration.ref)!;
    const changedCatalog = { ...catalog, fixtures: new Map(catalog.fixtures) };
    changedCatalog.fixtures.set(declaration.ref, { ...loaded, envelope });
    expect(() => isSeededFixtureDeclaration(changedCatalog, { ...declaration, envelope })).toThrow("Invalid seeded fixture declaration");
    const foreignControl = controls.find(control => control.id !== declaration.control.id)!;
    const wrongControl = { ...declaration, control: foreignControl };
    expect(() => isSeededFixtureDeclaration(catalog, wrongControl)).toThrow("Fixture declaration source mismatch");
  });

  it("gives every executed harness at least one positive fixture", () => {
    for (const harness of Object.keys(EXECUTED_HARNESSES)) {
      const own = partition.fixtures.filter((f) => harnessOf(f) === harness);
      expect(own.length, harness).toBeGreaterThan(0);
      expect(own.some((f) => f.envelope.polarity === "positive"), `${harness} positive`).toBe(true);
    }
  });
});
