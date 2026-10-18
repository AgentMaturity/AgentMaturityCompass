/**
 * P1-34 currency: monthly where the law moves, quarterly elsewhere, never later than the cited S5 register entry's own
 * next review, counted from a verified review's date (never the YAML's). Through effectiveSupport, an overdue, future or
 * unschedulable review never lets support stand; it only ever lowers it. In memory only: the YAML, the control digest
 * and stored results are untouched, and int's catalog behaviour is unchanged.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compilePlan, parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { digestOf } from "../../../src/catalog/digest.js";
import { evaluateControl } from "../../../src/catalog/evidence/evaluate.js";
import { nextReviewDue } from "../../../src/catalog/governance/currency.js";
import { effectiveSupport } from "../../../src/catalog/governance/support.js";
import { defaultCatalogRoot, loadCatalog } from "../../../src/catalog/loader.js";
import { buildCatalogLock } from "../../../src/catalog/lockfile.js";
import type { Citation, ControlRecord } from "../../../src/catalog/types.js";
import { validateCatalog } from "../../../src/catalog/validate.js";
import { REGULATORY_REGISTER, type RegulatoryRegister } from "../../../src/compliance/regulatory/index.js";
import { vi } from "vitest";
import { NOW, authority, keyA, keyB, operatorHome, reviewedControl, sign } from "./reviewers.js";

const catalog = loadCatalog();
const base = catalog.controls.get("L0-ADV-01")!;
const HOME = operatorHome();

const cite = (jurisdiction: string, registerId: string | null, statusType: Citation["statusType"] = "binding-now"): Citation => ({
  key: `c-${registerId ?? jurisdiction}`, registerId, instrument: "fixture instrument", clause: "1", edition: "2026", jurisdiction, statusType,
  superseded: null, effectiveDate: null, complianceDueDate: null, dateNote: "fixture", url: "https://example.org/fixture",
  retrieval: { state: "unverified", reason: "fixture" }, appliesWhen: null, legalReview: null, note: null
});
const citing = (citations: Citation[]): ControlRecord => ({ ...base, citations });
const due = (c: ControlRecord, register: RegulatoryRegister = REGULATORY_REGISTER) => nextReviewDue(c, register, "2026-10-10");

describe("nextReviewDue cadence (P1-34 step 5)", () => {
  it("a US state citation is monthly", () => {
    expect(due(citing([cite("US-CO", null)]))).toEqual({ status: "resolved", nextReviewDue: "2026-11-09", cadenceDays: 30 });
  });

  it("EU guidance (an EU register entry with voluntary binding force) is monthly", () => {
    expect(due(citing([cite("EU", "eu-gpai-code-of-practice")]))).toMatchObject({ cadenceDays: 30, nextReviewDue: "2026-11-09" });
  });

  it("an unregistered EU citation cannot prove it is not guidance, so it is monthly", () => {
    expect(due(citing([cite("EU", null)]))).toMatchObject({ cadenceDays: 30 });
  });

  it("an Indian draft is monthly; a binding Indian instrument is not", () => {
    expect(due(citing([cite("IN", null, "draft")]))).toMatchObject({ cadenceDays: 30 });
    expect(due(citing([cite("IN", null)]))).toMatchObject({ cadenceDays: 90 });
  });

  it("a binding EU regulation is quarterly, never later than the register entry's own next review", () => {
    // eu-ai-act was last reviewed 2026-10-03 under a 90-day window: its own next review is 2027-01-01.
    expect(due(citing([cite("EU", "eu-ai-act")]))).toEqual({ status: "resolved", nextReviewDue: "2027-01-01", cadenceDays: 90 });
    expect(due(citing([]))).toEqual({ status: "resolved", nextReviewDue: "2027-01-08", cadenceDays: 90 });
  });

  it("a shorter register window shortens the cadence", () => {
    const register: RegulatoryRegister = { ...REGULATORY_REGISTER, policy: { ...REGULATORY_REGISTER.policy, reviewWindowDays: 20 } };
    expect(due(citing([]), register)).toMatchObject({ cadenceDays: 20, nextReviewDue: "2026-10-30" });
  });

  it("an invalid review date, an unusable window or an unknown register entry is unresolved, never a default", () => {
    expect(nextReviewDue(base, REGULATORY_REGISTER, "2026-02-30")).toEqual({ status: "unresolved", reason: "GOV_REVIEW_DATE_INVALID" });
    expect(due(citing([cite("EU", "no-such-entry")]))).toEqual({ status: "unresolved", reason: "GOV_REGISTER_ENTRY_UNRESOLVED" });
    expect(due(base, { ...REGULATORY_REGISTER, policy: { ...REGULATORY_REGISTER.policy, reviewWindowDays: 0 } })).toEqual({ status: "unresolved", reason: "GOV_REVIEW_POLICY_INVALID" });
  });
});

describe("currency through effectiveSupport: only ever stricter (P1-34 step 7)", () => {
  const control = reviewedControl(base);
  const pair = (c: ControlRecord, decidedAt: string) => [sign(c, keyA, "fixture-reviewer-a", { decidedAt }), sign(c, keyB, "fixture-reviewer-b", { decidedAt })];

  it("counts from the verified review date, not the YAML's review fields", () => {
    const yamlSaysRecent = { ...control, review: { ...control.review, reviewedAt: "2026-10-17", nextReview: "2027-12-31" } };
    expect(effectiveSupport(yamlSaysRecent, authority(HOME, pair(yamlSaysRecent, "2026-06-01"))).rejected.map((r) => r.reason))
      .toEqual(["GOV_REVIEW_OVERDUE", "GOV_REVIEW_OVERDUE"]);
    expect(effectiveSupport(yamlSaysRecent, authority(HOME, pair(yamlSaysRecent, "2026-10-15"))).promotion?.nextReviewDue).toBe("2027-01-13");
  });

  it("a lapsed, future-dated or unschedulable review never lets support stand", () => {
    const unschedulable = reviewedControl({ ...base, citations: [cite("EU", "no-such-entry")] });
    const cases: Array<[ControlRecord, string, string]> = [
      [control, "2026-06-01", "GOV_REVIEW_OVERDUE"], [control, "2026-10-19", "GOV_REVIEW_IN_FUTURE"],
      [unschedulable, "2026-10-15", "GOV_REGISTER_ENTRY_UNRESOLVED"]
    ];
    for (const [c, decidedAt, reason] of cases) {
      const result = effectiveSupport(c, authority(HOME, pair(c, decidedAt)));
      expect(result, reason).toMatchObject({ support: "experimental", promotion: null });
      expect(result.rejected.map((r) => r.reason), reason).toEqual([reason, reason]);
    }
  });

  it("never returns support stronger than the declaration, for every level and record set", () => {
    const rank = { retired: 0, experimental: 1, reviewed: 2, qualified: 3 } as const;
    for (const support of ["retired", "experimental", "reviewed", "qualified"] as const) {
      const c = { ...control, support };
      for (const records of [[], pair(c, "2026-10-15"), pair(c, "2026-06-01")]) {
        const result = effectiveSupport(c, authority(HOME, records));
        expect(rank[result.support], `${support}`).toBeLessThanOrEqual(rank[support]);
        if (result.promotion === null && support !== "retired") expect(result.support).toBe("experimental");
      }
    }
  });
});

describe("overdue content compiles as experimental, in memory only (P1-34 step 7)", () => {
  const profile = parseDeploymentProfile((catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown }).profile);
  const control = reviewedControl(base);
  const pair = (decidedAt: string) => [sign(control, keyA, "fixture-reviewer-a", { decidedAt }), sign(control, keyB, "fixture-reviewer-b", { decidedAt })];
  const cat = { ...catalog, controls: new Map([...catalog.controls, [control.id, control]]) };
  const promotionsOf = (records: unknown[]) => {
    const promotion = effectiveSupport(control, authority(HOME, records)).promotion;
    return promotion ? { [control.id]: promotion } : {};
  };
  const compile = (asOf: string, promotions?: ReturnType<typeof promotionsOf>) => compilePlan({ profile, catalog: cat, asOf, ...(promotions ? { promotions } : {}) });
  const row = (records?: unknown[]) => compile("2026-10-18T12:00:00Z", records ? promotionsOf(records) : undefined).requirements.find((r) => r.controlId === control.id)!;

  it("downgrades the plan requirement, leaves the record, its YAML bytes, its digest and a stored result unchanged", () => {
    const yamlPath = join(defaultCatalogRoot(), catalog.controlFiles.get(control.id)!);
    const yaml = readFileSync(yamlPath);
    const before = digestOf(control);
    const ectx = { subject: { tenantId: null, workspaceId: "fixture", deploymentId: null, agentId: null, subjectId: null },
      window: { start: "2026-11-01T00:00:00Z", end: "2026-11-30T00:00:00Z" }, plan: null, invalidations: [], reviews: [], producers: catalog.producers };
    const stored = evaluateControl(control, [], ectx);
    const dir = mkdtempSync(join(tmpdir(), "amc-gov-result-"));
    try {
      writeFileSync(join(dir, "result.json"), JSON.stringify(stored));
      const overdue = row(pair("2026-06-01"));
      expect(overdue.support).toBe("experimental");
      expect(overdue.reasons.some((r) => r.startsWith("GOV_REVIEW_UNVERIFIED"))).toBe(true);
      expect(cat.controls.get(control.id)?.support).toBe("reviewed");
      expect(digestOf(cat.controls.get(control.id))).toBe(before);
      expect(compilePlan({ profile, catalog: cat, asOf: "2026-10-18T12:00:00Z" }).lock.controls.find((c) => c.id === control.id)?.digest).toBe(before);
      expect(readFileSync(yamlPath).equals(yaml)).toBe(true);
      expect(readFileSync(join(dir, "result.json"), "utf8")).toBe(JSON.stringify(stored));
      const again = evaluateControl(cat.controls.get(control.id)!, [], ectx);
      expect([again.controlDigest, again.digest]).toEqual([stored.controlDigest, stored.digest]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is pure: promotions decided outside it are an input bound into the digest, judged at asOf, never at the clock or trust state", () => {
    const promotions = promotionsOf(pair("2026-10-15"));
    const first = compile("2026-10-18T12:00:00Z", promotions);
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));
    try {
      expect(compile("2026-10-18T12:00:00Z", promotions).digest).toBe(first.digest);
    } finally {
      vi.setSystemTime(NOW);
    }
    expect(first.promotions).toEqual(promotions);
    expect(compile("2026-10-18T12:00:00Z").digest).not.toBe(first.digest);
    const at = (plan: ReturnType<typeof compile>) => plan.requirements.find((r) => r.controlId === control.id)!;
    expect(at(compile("2027-02-01T00:00:00Z", promotions))).toMatchObject({ support: "experimental" });
    expect(at(compile("2027-02-01T00:00:00Z", promotions)).reasons.join()).toMatch(/GOV_REVIEW_OVERDUE/);
    const edited = { ...control, statement: `${control.statement} (edited after the review)` };
    const changed = compilePlan({ profile, catalog: { ...catalog, controls: new Map([...catalog.controls, [control.id, edited]]) }, asOf: "2026-10-18T12:00:00Z", promotions });
    expect(changed.requirements.find((r) => r.controlId === control.id)!.reasons.join()).toMatch(/GOV_REVIEW_SUBJECT_CHANGED/);
  });

  it("only promotions effectiveSupport minted count; empty, hand-built and not-yet-reviewed ones are demoted; record digests are bound", () => {
    const records = pair("2026-10-15");
    const promotions = promotionsOf(records);
    const minted = promotions[control.id]!;
    expect(minted.recordDigests).toEqual(records.map((r) => digestOf(r)));
    const plan = compile("2026-10-18T12:00:00Z", promotions);
    expect(plan.promotions?.[control.id]?.recordDigests).toEqual(minted.recordDigests);
    const at = (asOf: string, p: Record<string, typeof minted>) => compile(asOf, p).requirements.find((r) => r.controlId === control.id)!;
    expect(at("2026-10-18T12:00:00Z", promotions).support).toBe("reviewed");
    const handBuilt = at("2026-10-18T12:00:00Z", { [control.id]: { ...minted } });
    expect([handBuilt.support, handBuilt.reasons.join()]).toEqual(["experimental", expect.stringMatching(/GOV_REVIEW_PROMOTION_UNVERIFIED/)]);
    const empty = at("2026-10-18T12:00:00Z", { [control.id]: { ...minted, reviewers: [], recordIds: [], recordDigests: [] } });
    expect([empty.support, empty.reasons.join()]).toEqual(["experimental", expect.stringMatching(/GOV_REVIEW_PROMOTION_EMPTY/)]);
    const early = at("2026-10-14T00:00:00Z", promotions); // the records say 2026-10-15
    expect([early.support, early.reasons.join()]).toEqual(["experimental", expect.stringMatching(/GOV_REVIEW_IN_FUTURE/)]);
    expect(Object.isFrozen(minted) && Object.isFrozen(minted.recordDigests)).toBe(true);
    // Only promotions supportStanding accepted are bound into the plan: not refused ones, not ones for unknown controls.
    const mixed = compile("2026-10-18T12:00:00Z", { [control.id]: minted, "L9-FAKE-01": minted, "L0-ADV-02": { ...minted } });
    expect(Object.keys(mixed.promotions ?? {})).toEqual([control.id]);
    expect(compile("2026-10-18T12:00:00Z", { [control.id]: { ...minted }, "L9-FAKE-01": minted }).promotions).toBeUndefined();
  });

  it("without promotions every row is experimental; a current verified quorum keeps reviewed", () => {
    expect(row()).toMatchObject({ support: "experimental" });
    expect(row().reasons.some((r) => r.startsWith("GOV_REVIEW_UNVERIFIED"))).toBe(true);
    expect(row(pair("2026-10-15"))).toMatchObject({ support: "reviewed" });
    expect(compilePlan({ profile, catalog, asOf: "2026-10-18T12:00:00Z" }).requirements.every((r) => r.support === "experimental")).toBe(true);
  });
});

describe("int's catalog behaviour is unchanged by the governance files and hooks (P1-34 regression)", () => {
  // int's tree is today's catalog without the P1-34 files; under int's code the same comparison gave identical load
  // issues, warnings and plans (one-off check recorded with the commit).
  const dir = mkdtempSync(join(tmpdir(), "amc-gov-int-tree-"));
  const intRoot = join(dir, "catalog");
  cpSync(defaultCatalogRoot(), intRoot, { recursive: true, filter: (src) => !/[/\\](CHANGELOG\.md|governance)$/.test(src) });
  const intTree = loadCatalog({ root: intRoot });
  rmSync(dir, { recursive: true, force: true });
  const asOf = new Date("2026-12-01T00:00:00Z");
  const strip = (issues: Array<{ code: string; file: string; controlId: string | null; path: string; message: string }>) =>
    issues.map((i) => [i.code, i.file, i.controlId, i.path, i.message].join(" | "));

  it("P1-18's missing-register-entry warnings and the load issues are the same as on int's tree", () => {
    const now = validateCatalog(catalog, { asOf });
    const then = validateCatalog(intTree, { asOf });
    expect(strip(now.warnings)).toEqual(strip(then.warnings));
    expect(now.warnings.length).toBeGreaterThan(0);
    expect(new Set(now.warnings.map((w) => w.code))).toEqual(new Set(["CAT_NO_REGISTER_ENTRY"]));
    expect([now.errors, catalog.issues, intTree.issues]).toEqual([[], [], []]);
  });

  it("P1-14's experimental labels: every plan row carries its record's experimental support, no governance reason, and the same plan", () => {
    const profiles = [...catalog.fixtures.values()].map((f) => (f.envelope?.setup as { profile?: unknown } | undefined)?.profile).filter(Boolean).slice(0, 6);
    expect(profiles.length).toBeGreaterThan(0);
    for (const raw of profiles) {
      const p = parseDeploymentProfile(raw);
      const plan = compilePlan({ profile: p, catalog, asOf: asOf.toISOString() });
      expect(plan.requirements.every((r) => r.support === "experimental" && catalog.controls.get(r.controlId)?.support === "experimental")).toBe(true);
      expect(plan.requirements.flatMap((r) => r.reasons).filter((r) => r.includes("GOV_"))).toEqual([]);
      expect(plan.lock.catalog).toEqual(buildCatalogLock(intTree).catalog);
      expect(plan.digest).toBe(compilePlan({ profile: p, catalog: intTree, asOf: asOf.toISOString() }).digest);
    }
  });
});
