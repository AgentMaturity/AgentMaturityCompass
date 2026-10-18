/**
 * P1-34 currency: monthly where the law moves, quarterly elsewhere, never later than the cited S5 register entry's own
 * next review. Overdue reviewed content compiles as experimental in memory; the YAML, the control digest and stored
 * results are untouched.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compilePlan, parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { digestOf } from "../../../src/catalog/digest.js";
import { evaluateControl } from "../../../src/catalog/evidence/evaluate.js";
import { evaluateReviewCurrency, nextReviewDue } from "../../../src/catalog/governance/currency.js";
import { effectiveSupport, type ReviewAuthority } from "../../../src/catalog/governance/support.js";
import { buildCatalogLock } from "../../../src/catalog/lockfile.js";
import { validateCatalog } from "../../../src/catalog/validate.js";
import { author, keyA, keyB, keypair, record, REVIEWERS } from "./reviewers.js";
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

  it("a missing, unparsable, future-dated or unschedulable review date is stale, never current, and fails closed", () => {
    const cases: Array<[ControlRecord, string]> = [
      [{ ...reviewed([]), review: { ...reviewed([]).review, reviewedAt: null } }, "GOV_REVIEW_MISSING"],
      [reviewed([], "2026-02-30"), "GOV_REVIEW_MISSING"],
      [reviewed([], "26-10-10"), "GOV_REVIEW_MISSING"],
      [reviewed([], "2026-10-10", "soon"), "GOV_NEXT_REVIEW_INVALID"],
      [reviewed([], "2026-12-20"), "GOV_REVIEW_IN_FUTURE"],
      [reviewed([cite("EU", "no-such-entry")]), "GOV_REGISTER_ENTRY_UNRESOLVED"]
    ];
    for (const [control, reason] of cases) {
      expect(evaluateReviewCurrency(control, REGULATORY_REGISTER, "2026-12-01"), reason)
        .toMatchObject({ status: "stale", nextReviewDue: null, support: "experimental", reasons: ["GOV_REVIEW_STALE", reason] });
    }
  });

  it("only ever makes support stricter, for every support level and currency state", () => {
    const rank = { retired: 0, experimental: 1, reviewed: 2, qualified: 3 } as const;
    const controls = [base, reviewed([]), reviewed([], "2026-06-01"), reviewed([], "2026-12-20"), reviewed([], "2026-11-25")];
    for (const control of controls) {
      for (const support of ["retired", "experimental", "reviewed", "qualified"] as const) {
        for (const asOf of ["2026-12-01", "2027-06-01"]) {
          const result = evaluateReviewCurrency({ ...control, support }, REGULATORY_REGISTER, asOf);
          expect(rank[result.support], `${support} ${control.review.reviewedAt} ${asOf}`).toBeLessThanOrEqual(rank[support]);
          if (result.status !== "current" && result.status !== "due_soon" && support !== "retired") expect(result.support).toBe("experimental");
        }
      }
    }
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

  // L0-ADV-01 lists all seven stations and is AI-drafted, so a quorum needs a wealth expert and a draft confirmation.
  const current = reviewed([], "2026-11-20", "2027-02-01");
  const subject = { kind: "control" as const, id: current.id, version: current.version, digest: digestOf(current) };
  const sign = (key: typeof keyA, userId: string) => record(key, userId, { subject, aiInputs: [{ kind: "draft", ref: `${current.id}@${current.version}`, confirmed: true }] });
  const authority = (records: unknown[]): ReviewAuthority => ({ trust: REVIEWERS, records, experts: new Map([["fixture-reviewer-a", ["wealth"]]]),
    authorsOf: () => ["fixture-author"], f5Confirmations: [] });
  const compiled = (auth?: ReviewAuthority) => compilePlan({ profile, catalog: { ...catalog, controls: new Map([...catalog.controls, [current.id, current]]) },
    asOf: "2026-12-01T00:00:00Z", ...(auth ? { reviewAuthority: auth } : {}) }).requirements.find((r) => r.controlId === current.id)!;

  it("reviewed content without verified review authority compiles as experimental: today every control does", () => {
    expect(compiled()).toMatchObject({ support: "experimental" });
    expect(compiled().reasons.some((r) => r.startsWith("GOV_REVIEW_UNVERIFIED"))).toBe(true);
    expect(compilePlan({ profile, catalog, asOf: "2026-12-01T00:00:00Z" }).requirements.every((r) => r.support === "experimental")).toBe(true);
  });

  it("a forged, unpinned or self-signed record cannot promote a control; two pinned independent reviewers can keep it", () => {
    const forged = { ...sign(keyB, "fixture-reviewer-b"), notes: "edited after signing" };
    const unpinned = sign(keypair(), "fixture-reviewer-b");
    const self = sign(author, "fixture-author");
    const claimsOther = sign(keyB, "fixture-reviewer-a");
    for (const fake of [forged, unpinned, self, claimsOther]) {
      expect(compiled(authority([sign(keyA, "fixture-reviewer-a"), fake])).support).toBe("experimental");
      expect(effectiveSupport(current, REGULATORY_REGISTER, "2026-12-01", authority([sign(keyA, "fixture-reviewer-a"), fake])).reasons)
        .toEqual(["GOV_REVIEW_UNVERIFIED", "GOV_QUORUM_TWO_HUMANS"]);
    }
    expect(compiled(authority([sign(keyA, "fixture-reviewer-a"), sign(keyB, "fixture-reviewer-b")]))).toMatchObject({ support: "reviewed" });
    expect(effectiveSupport({ ...current, support: "experimental" }, REGULATORY_REGISTER, "2026-12-01",
      authority([sign(keyA, "fixture-reviewer-a"), sign(keyB, "fixture-reviewer-b")])).support).toBe("experimental");
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
