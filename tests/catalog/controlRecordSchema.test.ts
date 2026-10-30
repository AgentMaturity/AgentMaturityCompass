import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import { defaultCatalogRoot, loadCatalog } from "../../src/catalog/loader.js";
import { parsePredicate, validatePredicate } from "../../src/catalog/predicate.js";
import { controlRecordSchema, zodToCatalogIssues } from "../../src/catalog/schema.js";
import type { ControlRecord } from "../../src/catalog/types.js";
import { validateCatalog } from "../../src/catalog/validate.js";

const recordPath = fileURLToPath(new URL("../../catalog/layers/l0-baseline/controls/L0-IDN-01.yaml", import.meta.url));
const invalidDir = fileURLToPath(new URL("../fixtures/catalog/invalid/", import.meta.url));
const asOf = new Date("2026-10-15T00:00:00Z");

function record(): ControlRecord {
  return controlRecordSchema.parse(YAML.parse(readFileSync(recordPath, "utf8")) as unknown);
}

// These invented names and hashes exercise shape rules only. The shipped record stays experimental.
function syntheticReviewed(input: ControlRecord): ControlRecord {
  return {
    ...input,
    support: "reviewed",
    citations: input.citations.map((citation) => ({
      ...citation,
      retrieval: { state: "verified" as const, retrievedAt: "2026-10-01", contentSha256: "0".repeat(64) },
      legalReview: { reviewer: "synthetic-test-reviewer", credential: "fixture only", date: "2026-10-01" }
    })),
    review: { status: "approved", expert: "synthetic-test-reviewer", credential: "fixture only", reviewedAt: "2026-10-01", nextReview: "2026-11-01" },
    provenance: { ...input.provenance, draftedBy: "ai", approvedBy: "synthetic-test-reviewer" }
  };
}

const invalidRecords = [
  { name: "unknown-key.yaml", code: "CAT_SCHEMA" },
  { name: "manual-without-duty.yaml", code: "CAT_SCHEMA" },
  { name: "adversarial-10-attempts.yaml", code: "CAT_SCHEMA" },
  { name: "due-before-effective.yaml", code: "CAT_SCHEMA" },
  { name: "float-value.yaml", code: "CAT_SCHEMA" },
  { name: "reviewed-unverified-citation.yaml", code: "CAT_SUPPORT_GATE" },
  { name: "ai-drafted-reviewed-unapproved.yaml", code: "CAT_SUPPORT_GATE" },
  { name: "self-reported-only-at-L3.yaml", code: "CAT_LEVEL_CAP" },
  { name: "planned-producers-at-L3.yaml", code: "CAT_LEVEL_CAP" },
  { name: "predicate-with-code.yaml", code: "CAT_SCHEMA" },
  { name: "predicate-unknown-term.yaml", code: "CAT_VOCAB" },
  { name: "yaml-alias.yaml", code: "CAT_YAML_ALIAS" }
];

function invalidFixtureIssues(name: string) {
  const root = mkdtempSync(join(tmpdir(), "amc-catalog-schema-"));
  try {
    cpSync(defaultCatalogRoot(), root, { recursive: true });
    writeFileSync(join(root, "layers/l0-baseline/controls/L0-IDN-01.yaml"), readFileSync(join(invalidDir, name)));
    // The real loader sees aliases, the schema sees record rules, and validateCatalog sees producers/vocabulary.
    return validateCatalog(loadCatalog({ root }), { asOf }).errors;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("catalog control record schema", () => {
  it("accepts the shipped experimental example without promoting its pending review", () => {
    const parsed = record();
    expect(parsed.id).toBe("L0-IDN-01");
    expect(parsed.support).toBe("experimental");
    expect(parsed.review.status).toBe("pending");
    expect(parsed.citations.every((c) => c.legalReview === null)).toBe(true);
    // Non-empty, not exact: the shipped baseline gains fixtures as its producers land (P1-14).
    expect(parsed.tests.flatMap((t) => t.fixtures.positive)).toContain("L0-IDN-01/positive/lease-and-principal.json");
    expect(parsed.tests.flatMap((t) => t.fixtures.negative).length).toBeGreaterThan(0);
    expect(validateCatalog(loadCatalog(), { asOf }).errors).toEqual([]);
  });

  it("retains all twelve required checked-in invalid YAML fixtures", () => {
    expect(readdirSync(invalidDir).filter((name) => name.endsWith(".yaml")).sort()).toEqual(invalidRecords.map(({ name }) => name).sort());
  });

  it.each(invalidRecords)("refuses $name with $code", ({ name, code }) => {
    expect(invalidFixtureIssues(name)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code, severity: "error" })
    ]));
  });

  it("accepts a complete synthetic review shape while leaving the real example experimental", () => {
    expect(controlRecordSchema.safeParse(syntheticReviewed(record())).success).toBe(true);
    expect(record().support).toBe("experimental");
  });

  it("keeps the AI approval guard independently observable", () => {
    const input = syntheticReviewed(record());
    input.provenance.approvedBy = null;
    const parsed = controlRecordSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("unapproved AI-drafted review was accepted");
    expect(zodToCatalogIssues(parsed.error, "fixture.yaml", input.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_SUPPORT_GATE", path: "provenance.approvedBy" })
    ]));
  });

  it("rejects an unknown jurisdiction through the real cross-file vocabulary validator", () => {
    const catalog = loadCatalog();
    const input = record();
    input.applicability.predicate = { fact: "jurisdictions", includesAny: ["MARS"] };
    catalog.controls.set(input.id, input);
    expect(validateCatalog(catalog, { asOf }).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_VOCAB", path: "applicability.predicate" })
    ]));
  });

  it("rejects executable predicates without evaluating their text", () => {
    expect(() => parsePredicate({ fact: "jurisdictions", eval: "process.exit(1)" })).toThrow("invalid predicate:");
    const catalog = loadCatalog();
    expect(catalog.vocabulary).not.toBeNull();
    if (!catalog.vocabulary) throw new Error("real catalog vocabulary is missing");
    expect(validatePredicate({ fact: "jurisdictions", includesAny: ["US"] }, catalog.vocabulary)).toEqual([]);
  });

  it("caps an all-self-reported producer set at L1", () => {
    const catalog = loadCatalog();
    catalog.producers = catalog.producers.map((p) => ({ ...p, maxClaimKind: "self_reported" as const }));
    const input = record();
    catalog.controls.set(input.id, input);
    // Every other shipped control is capped by the same rewrite; only this record's issues are under test.
    const issues = () => validateCatalog(catalog, { asOf }).errors.filter((issue) => issue.controlId === input.id);
    expect(issues().map((issue) => issue.code)).toContain("CAT_LEVEL_CAP");
    input.levels = ["L1"];
    expect(issues()).toEqual([]);
  });

  it("allows planned observed producers at L2 but refuses L3", () => {
    const catalog = loadCatalog();
    catalog.producers = catalog.producers.map((p) => ({ ...p, status: "planned" as const, plannedBy: "P1-02" }));
    const input = record();
    input.levels = ["L3"];
    catalog.controls.set(input.id, input);
    const issues = () => validateCatalog(catalog, { asOf }).errors.filter((issue) => issue.controlId === input.id);
    expect(issues().map((issue) => issue.code)).toContain("CAT_LEVEL_CAP");
    input.levels = ["L2"];
    expect(issues()).toEqual([]);
  });

  it("names an unknown evidence producer instead of treating it as available", () => {
    const catalog = loadCatalog();
    const input = record();
    input.evidence[0]!.producer = "amc.qualificationMissing";
    catalog.controls.set(input.id, input);
    expect(validateCatalog(catalog, { asOf }).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CAT_PRODUCER_UNKNOWN", path: "evidence.0.producer" })
    ]));
  });
});
