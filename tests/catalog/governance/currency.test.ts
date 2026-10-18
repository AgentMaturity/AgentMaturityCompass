/**
 * P1-34 currency: monthly where the law moves, quarterly elsewhere, never later than the cited S5 register entry's own
 * next review. Overdue reviewed content compiles as experimental in memory; the YAML, the control digest and stored
 * results are untouched.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compilePlan, parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { digestOf } from "../../../src/catalog/digest.js";
import { evaluateControl } from "../../../src/catalog/evidence/evaluate.js";
import { evaluateReviewCurrency, nextReviewDue } from "../../../src/catalog/governance/currency.js";
import { defaultCatalogRoot, loadCatalog } from "../../../src/catalog/loader.js";
import type { Citation, ControlRecord } from "../../../src/catalog/types.js";
import { REGULATORY_REGISTER, type RegulatoryRegister } from "../../../src/compliance/regulatory/index.js";

const catalog = loadCatalog();
const base = catalog.controls.get("L0-ADV-01")!;

const cite = (jurisdiction: string, registerId: string | null, statusType: Citation["statusType"] = "binding-now"): Citation => ({
  key: `c-${registerId ?? jurisdiction}`, registerId, instrument: "fixture instrument", clause: "1", edition: "2026", jurisdiction, statusType,
  superseded: null, effectiveDate: null, complianceDueDate: null, dateNote: "fixture", url: "https://example.org/fixture",
  retrieval: { state: "unverified", reason: "fixture" }, appliesWhen: null, legalReview: null, note: null
});

function reviewed(citations: Citation[], reviewedAt = "2026-10-10", nextReview = "2027-12-31"): ControlRecord {
  return { ...base, support: "reviewed", citations,
    review: { status: "approved", expert: "fixture-expert", credential: "fixture credential", reviewedAt, nextReview },
    provenance: { ...base.provenance, approvedBy: "fixture-approver" } };
}

describe("nextReviewDue cadence (P1-34 step 5)", () => {
  it("a US state citation is monthly", () => {
    expect(nextReviewDue(reviewed([cite("US-CO", null)]), REGULATORY_REGISTER)).toEqual({ status: "resolved", nextReviewDue: "2026-11-09", cadenceDays: 30 });
  });

  it("EU guidance (an EU register entry with voluntary binding force) is monthly", () => {
    expect(nextReviewDue(reviewed([cite("EU", "eu-gpai-code-of-practice")]), REGULATORY_REGISTER)).toMatchObject({ cadenceDays: 30, nextReviewDue: "2026-11-09" });
  });

  it("an unregistered EU citation cannot prove it is not guidance, so it is monthly", () => {
    expect(nextReviewDue(reviewed([cite("EU", null)]), REGULATORY_REGISTER)).toMatchObject({ cadenceDays: 30 });
  });

  it("an Indian draft is monthly; a binding Indian instrument is not", () => {
    expect(nextReviewDue(reviewed([cite("IN", null, "draft")]), REGULATORY_REGISTER)).toMatchObject({ cadenceDays: 30 });
    expect(nextReviewDue(reviewed([cite("IN", null)]), REGULATORY_REGISTER)).toMatchObject({ cadenceDays: 90 });
  });

  it("a binding EU regulation is quarterly, never later than the register entry's own next review", () => {
    // eu-ai-act was last reviewed 2026-10-03 under a 90-day window: its own next review is 2027-01-01.
    expect(nextReviewDue(reviewed([cite("EU", "eu-ai-act")]), REGULATORY_REGISTER)).toEqual({ status: "resolved", nextReviewDue: "2027-01-01", cadenceDays: 90 });
    expect(nextReviewDue(reviewed([]), REGULATORY_REGISTER)).toEqual({ status: "resolved", nextReviewDue: "2027-01-08", cadenceDays: 90 });
  });

  it("an earlier recorded nextReview wins; a later one never extends the deadline", () => {
    expect(nextReviewDue(reviewed([], "2026-10-10", "2026-12-01"), REGULATORY_REGISTER)).toMatchObject({ nextReviewDue: "2026-12-01" });
    expect(nextReviewDue(reviewed([], "2026-10-10", "2030-01-01"), REGULATORY_REGISTER)).toMatchObject({ nextReviewDue: "2027-01-08" });
  });

  it("a shorter register window shortens the cadence", () => {
    const register: RegulatoryRegister = { ...REGULATORY_REGISTER, policy: { ...REGULATORY_REGISTER.policy, reviewWindowDays: 20 } };
    expect(nextReviewDue(reviewed([]), register)).toMatchObject({ cadenceDays: 20, nextReviewDue: "2026-10-30" });
  });

  it("no approved, dated review, or an unknown register entry, is unresolved", () => {
    expect(nextReviewDue(base, REGULATORY_REGISTER)).toEqual({ status: "unresolved", reason: "GOV_REVIEW_MISSING" });
    expect(nextReviewDue(reviewed([cite("EU", "no-such-entry")]), REGULATORY_REGISTER)).toEqual({ status: "unresolved", reason: "GOV_REGISTER_ENTRY_UNRESOLVED" });
    expect(nextReviewDue(reviewed([], "2026-02-30"), REGULATORY_REGISTER)).toEqual({ status: "unresolved", reason: "GOV_REVIEW_MISSING" });
  });
});

describe("evaluateReviewCurrency (P1-34 step 7)", () => {
  it("current, due within 14 days (the deadline day included) and overdue", () => {
    const control = reviewed([]); // due 2027-01-08
    expect(evaluateReviewCurrency(control, REGULATORY_REGISTER, "2026-12-01")).toMatchObject({ status: "current", support: "reviewed", reasons: [] });
    expect(evaluateReviewCurrency(control, REGULATORY_REGISTER, "2026-12-25")).toMatchObject({ status: "due_soon", support: "reviewed", reasons: ["GOV_REVIEW_DUE_SOON"] });
    expect(evaluateReviewCurrency(control, REGULATORY_REGISTER, "2027-01-08")).toMatchObject({ status: "due_soon", support: "reviewed" });
    expect(evaluateReviewCurrency(control, REGULATORY_REGISTER, "2027-01-09")).toMatchObject({ status: "overdue", support: "experimental", reasons: ["GOV_REVIEW_OVERDUE"] });
  });

  it("unresolved or future-dated reviews of reviewed content fail closed to experimental", () => {
    expect(evaluateReviewCurrency(reviewed([cite("EU", "no-such-entry")]), REGULATORY_REGISTER, "2026-12-01"))
      .toMatchObject({ status: "unresolved", support: "experimental", reasons: ["GOV_REVIEW_UNRESOLVED", "GOV_REGISTER_ENTRY_UNRESOLVED"] });
    expect(evaluateReviewCurrency(reviewed([], "2026-12-20"), REGULATORY_REGISTER, "2026-12-01"))
      .toMatchObject({ status: "unresolved", support: "experimental", reasons: ["GOV_REVIEW_UNRESOLVED", "GOV_REVIEW_IN_FUTURE"] });
  });

  it("never promotes experimental and keeps retired retired", () => {
    expect(evaluateReviewCurrency(base, REGULATORY_REGISTER, "2026-12-01")).toMatchObject({ status: "unresolved", support: "experimental" });
    expect(evaluateReviewCurrency({ ...reviewed([]), support: "retired" }, REGULATORY_REGISTER, "2030-01-01")).toMatchObject({ support: "retired" });
  });

  it("refuses an evaluation date that is not a calendar date", () => {
    expect(() => evaluateReviewCurrency(base, REGULATORY_REGISTER, "2026-13-01")).toThrow(/asOf/);
  });
});

describe("overdue content compiles as experimental, in memory only (P1-34 step 7)", () => {
  const profile = parseDeploymentProfile((catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown }).profile);

  it("downgrades the plan requirement, leaves the record, its YAML bytes, its digest and a stored result unchanged", () => {
    const control = reviewed([], "2026-06-01", "2026-08-30");
    const controls = new Map(catalog.controls);
    controls.set(control.id, control);
    const cat = { ...catalog, controls };
    const yamlPath = join(defaultCatalogRoot(), catalog.controlFiles.get(control.id)!);
    const yaml = readFileSync(yamlPath);
    const before = digestOf(control);
    const ectx = { subject: { tenantId: null, workspaceId: "fixture", deploymentId: null, agentId: null, subjectId: null },
      window: { start: "2026-11-01T00:00:00Z", end: "2026-11-30T00:00:00Z" }, plan: null, invalidations: [], reviews: [], producers: catalog.producers };
    const stored = evaluateControl(control, [], ectx);
    const dir = mkdtempSync(join(tmpdir(), "amc-gov-result-"));
    try {
      writeFileSync(join(dir, "result.json"), JSON.stringify(stored));
      const plan = compilePlan({ profile, catalog: cat, asOf: "2026-12-01T00:00:00Z" });
      const row = plan.requirements.find((r) => r.controlId === control.id)!;
      expect(row.support).toBe("experimental");
      expect(row.reasons.some((r) => r.startsWith("GOV_REVIEW_OVERDUE"))).toBe(true);
      expect(cat.controls.get(control.id)?.support).toBe("reviewed");
      expect(digestOf(cat.controls.get(control.id))).toBe(before);
      expect(plan.lock.controls.find((c) => c.id === control.id)?.digest).toBe(before);
      expect(readFileSync(yamlPath).equals(yaml)).toBe(true);
      expect(readFileSync(join(dir, "result.json"), "utf8")).toBe(JSON.stringify(stored));
      const again = evaluateControl(cat.controls.get(control.id)!, [], ectx);
      expect([again.controlDigest, again.digest]).toEqual([stored.controlDigest, stored.digest]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("current reviewed content and experimental content compile unchanged", () => {
    const current = reviewed([], "2026-11-20", "2027-02-01");
    const plan = compilePlan({ profile, catalog: { ...catalog, controls: new Map([...catalog.controls, [current.id, current]]) }, asOf: "2026-12-01T00:00:00Z" });
    expect(plan.requirements.find((r) => r.controlId === current.id)?.support).toBe("reviewed");
    expect(compilePlan({ profile, catalog, asOf: "2026-12-01T00:00:00Z" }).requirements.every((r) => r.support === "experimental")).toBe(true);
  });
});
