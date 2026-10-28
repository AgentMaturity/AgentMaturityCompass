/**
 * P1-34: effectiveSupport is the only function that raises a control's support. A spy on it shows that compilePlan, the
 * OSCAL export and the currency report take support from its results, and a source scan pins every other read of a
 * control's review status, reviewer, approval or support fields to a reviewed allowlist.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

vi.mock("../../../src/catalog/governance/support.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/catalog/governance/support.js")>();
  return { ...actual, effectiveSupport: vi.fn(actual.effectiveSupport), supportStanding: vi.fn(actual.supportStanding) };
});

import { compilePlan, parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { catalogCurrencyFindings } from "../../../src/catalog/governance/index.js";
import type { RequirementDecision } from "../../../src/catalog/compiler/types.js";
import { effectiveSupport, shownLegalReview, shownReviewStatus, supportStanding, type ShownLegalReview, type SupportResult } from "../../../src/catalog/governance/support.js";
import { loadCatalog, type LoadedCatalog } from "../../../src/catalog/loader.js";
import type { ControlRecord, SupportLevel } from "../../../src/catalog/types.js";
import { toOscalCatalog } from "../../../src/exports/oscal/oscalCatalog.js";
import { author, AUTHOR, authority, keyA, keyB, keypair, operatorHome, reviewedControl, sign } from "./reviewers.js";

const spy = vi.mocked(effectiveSupport);
const standing = vi.mocked(supportStanding);
const catalog = loadCatalog();
const control = reviewedControl(catalog.controls.get("L0-ADV-01")!);
const withControl: LoadedCatalog = { ...catalog, controls: new Map([...catalog.controls, [control.id, control]]) };
const profile = parseDeploymentProfile((catalog.fixtures.get("L0-IDN-01/positive/lease-and-principal.json")?.envelope?.setup as { profile: unknown }).profile);
const HOME = operatorHome();
const genuine = [sign(control, keyA, "fixture-reviewer-a"), sign(control, keyB, "fixture-reviewer-b")];
const fakes: unknown[][] = [
  [genuine[0], sign(control, keypair(), "fixture-reviewer-b")],
  [genuine[0], sign(control, author, AUTHOR)],
  [genuine[0], { ...genuine[1], notes: "forged" }],
  [genuine[0], sign({ ...control, statement: "older" }, keyB, "fixture-reviewer-b")]
];
const stronger = (s: string) => s === "reviewed" || s === "qualified";
/** Every result `fn` returned for `id` since the spies were reset. */
const resultsFor = (id: string, fn: typeof spy | typeof standing = spy): SupportResult[] => fn.mock.calls.flatMap((call, i) =>
  ((call[0] as ControlRecord).id === id && fn.mock.results[i]?.type === "return" ? [fn.mock.results[i]!.value as SupportResult] : []));
/** The promotions effectiveSupport decides for `records`, as a caller passes them to compilePlan. */
const promotionsOf = (records: unknown[]) => {
  const promotion = effectiveSupport(control, authority(HOME, records)).promotion;
  return promotion ? { [control.id]: promotion } : {};
};

beforeEach(() => { spy.mockClear(); standing.mockClear(); });

describe("effectiveSupport is the single source of a control's support (P1-34)", () => {
  it("compilePlan: a row is reviewed only where supportStanding let a promotion from effectiveSupport stand", () => {
    const promotions = promotionsOf(genuine);
    expect(resultsFor(control.id).map((r) => r.promotion)).toEqual([promotions[control.id]]);
    const plan = compilePlan({ profile, catalog: withControl, asOf: "2026-10-18T12:00:00Z", promotions });
    const promoted = plan.requirements.filter((r) => stronger(r.support));
    expect(promoted.map((r) => r.controlId)).toEqual([control.id]);
    for (const row of promoted) expect(resultsFor(row.controlId, standing).some((r) => r.support === row.support && r.promotion === promotions[control.id])).toBe(true);
    expect(plan.promotions).toEqual(promotions);
    for (const records of fakes) {
      spy.mockClear();
      standing.mockClear();
      const fake = compilePlan({ profile, catalog: withControl, asOf: "2026-10-18T12:00:00Z", promotions: promotionsOf(records) });
      expect(fake.requirements.filter((r) => stronger(r.support))).toEqual([]);
      expect(resultsFor(control.id).every((r) => r.support === "experimental" && r.promotion === null)).toBe(true);
      expect(resultsFor(control.id, standing).every((r) => r.support === "experimental")).toBe(true);
    }
  });

  it("the OSCAL export never shows an approval, approver or legal review that did not stand", () => {
    const base = catalog.controls.get("L1-WLT-US-01")!;
    const claimed = reviewedControl(base, { citations: base.citations.map((c) => ({ ...c, legalReview: { reviewer: "fixture-legal", credential: "x", date: "2026-10-01" } })) });
    const doc = JSON.stringify(toOscalCatalog({ ...catalog, controls: new Map([...catalog.controls, [claimed.id, claimed]]) }).document);
    expect(doc).not.toContain('\\"approved\\"');
    expect(doc).not.toContain("fixture-approver");
    expect(doc).not.toContain("fixture-expert");
    expect(doc).not.toContain("fixture credential");
    expect(doc).not.toContain('\\"reviewedAt\\":\\"2026-10-15\\"');
    expect(doc).not.toContain('\\"recorded\\"');
    expect(doc).toContain('\\"legalReview\\":\\"unverified\\"');
    expect(doc).toContain('\\"status\\":\\"pending\\"');
  });

  it("the OSCAL export and the currency report read support through it; without authority nothing is reviewed", () => {
    const oscal = JSON.stringify(toOscalCatalog(withControl).document);
    expect(resultsFor(control.id)).toEqual([expect.objectContaining({ support: "experimental", promotion: null })]);
    expect(oscal).not.toContain('"value":"reviewed"');
    spy.mockClear();
    const findings = catalogCurrencyFindings(withControl, authority(HOME, fakes[2]!));
    expect(spy.mock.calls.length).toBe([...withControl.controls.values()].filter((c) => c.support !== "retired").length);
    expect(findings.filter((f) => f.controlId === control.id).map((f) => [f.code, f.severity])).toEqual([["GOV_REVIEW_UNVERIFIED", "error"], ["GOV_REVIEW_UNVERIFIED", "warning"]]);
  });

  it("a view shows an approved review only where effectiveSupport let the support stand", () => {
    expect(shownReviewStatus(control, "experimental")).toBe("pending");
    expect(shownReviewStatus(control, "reviewed")).toBe("approved");
    expect(shownReviewStatus({ ...control, review: { ...control.review, status: "rejected" } }, "experimental")).toBe("rejected");
    const cited = catalog.controls.get("L1-WLT-US-01")!.citations[0]!;
    expect([shownLegalReview(cited, "experimental"), shownLegalReview({ ...cited, legalReview: { reviewer: "x", credential: "x", date: "2026-10-01" } }, "experimental"),
      shownLegalReview({ ...cited, legalReview: { reviewer: "x", credential: "x", date: "2026-10-01" } }, "reviewed")]).toEqual(["none", "unverified", "recorded"]);
  });

  it("A4's sealed conformance rows are unchanged for the shipped catalog: shown status and support equal the record's", () => {
    // StoredControl {support, reviewStatus} goes into sealed A4 conformance runs; before P1-34 they were record.support and
    // record.review.status. Any control listed here would change a sealed statement on recompute.
    const profiles = [...catalog.fixtures.values()].map((f) => (f.envelope?.setup as { profile?: unknown } | undefined)?.profile).filter(Boolean).slice(0, 6);
    expect(profiles.length).toBe(6);
    const differ: string[] = [];
    for (const raw of profiles) {
      for (const row of compilePlan({ profile: parseDeploymentProfile(raw), catalog, asOf: "2026-10-18T12:00:00Z" }).requirements) {
        const record = catalog.controls.get(row.controlId)!;
        if (shownReviewStatus(record, row.support) !== record.review.status || row.support !== record.support) differ.push(row.controlId);
      }
    }
    expect([...new Set(differ)]).toEqual([]);
    expect(catalog.controls.size).toBeGreaterThan(0);
  });

  it("row support stays a required SupportLevel, and a citation's legal review shows only none, recorded or unverified", () => {
    expectTypeOf<RequirementDecision["support"]>().toEqualTypeOf<SupportLevel>();
    expectTypeOf<ShownLegalReview>().toEqualTypeOf<"none" | "recorded" | "unverified">();
    expectTypeOf(shownLegalReview).returns.toEqualTypeOf<ShownLegalReview>();
  });

  it("no other source reads a control's review, provenance, support or legal review outside the reviewed allowlist", () => {
    // Every source under src/catalog or importing from a catalog/ path: file -> [reads, why each is allowed]. Whole-object
    // reads (r.review, control.provenance) and whole-object spreads (...c, ...record) count too. A new read changes a count
    // and fails here: route it through effectiveSupport, supportStanding or a shown* helper instead, or add it with its reason.
    const allowed: Record<string, [number, string]> = {
      "src/catalog/governance/support.ts": [11, "supportStanding, effectiveSupport and the shown* helpers"],
      "src/catalog/governance/index.ts": [5, "the report compares the declaration with effectiveSupport's result; the declared support that sets GOV_CITATION_DUE_PASSED severity"],
      "src/catalog/governance/changelogGuard.ts": [2, "declared reviewed content needs review ids: stricter only"],
      "src/catalog/compiler/compile.ts": [2, "writes supportStanding's verdict into each row"],
      "src/catalog/compiler/applicability.ts": [2, "the row's initial value, replaced by compile; retired never promotes"],
      "src/catalog/schema.ts": [11, "P1-09 support gate: refuses incomplete declarations, never raises"],
      "src/catalog/validate.ts": [5, "refuses an approved review citing an unreviewed register entry; stricter citation severity"],
      "src/catalog/types.ts": [1, "the type"],
      "src/a4/a4Conformance.ts": [2, "the stored conformance row (StoredControl), copied from the plan row"],
      "src/a4/adaptPolicy.ts": [1, "the key of the shownLegalReview result"],
      "src/exports/oscal/oscalCatalog.ts": [5, "the citation spread with legalReview replaced by shownLegalReview; metadata last-modified dates"],
      "src/policy/effectivePolicyReceipt.ts": [1, "ActiveControl.review, which activation sets through shownReviewStatus"],
      "src/operator/reviewPacket.ts": [1, "prints the conformance statement's per-control review, copied from the signed plan row (P2-22)"],
      "src/lifecycle/governanceLifecycle.ts": [2, "spreads of a lifecycle transition record (ledger meta and the transition view), not a catalog control (P2-23)"],
      "src/cli.ts": [2, "a marketplace rating's review text, not a catalog record"],
      "src/catalog/admission/index.ts": [2, "the admission report row's own computed support (r.support), not a control record (P1-33)"],
      "src/catalog/admission/report.ts": [1, "the admission report's own support field in its verdict digest (P1-33)"],
      "src/assurance/executed/routes.ts": [1, "refuses retired controls when compiling an optional synthetic route; never raises support or admits a result (P2-27)"],
      "src/assurance/executed/compiledExecution.ts": [1, "refuses a retired control before any target resolution or fixture execution; never raises support or admits a result (P2-27)"]
    };
    const pattern = /\breview\.(status|expert|credential|reviewedAt|nextReview)\b|provenance\.approvedBy\b|\b(record|control|r|c|rec)\??\.(review|provenance|support)\b|\blegalReview\b|\.\.\.(c|citation|cite|record|control|r)\b(?!\.)/g;
    const root = join(__dirname, "..", "..", "..");
    const found: Record<string, number> = {};
    for (const file of globSync("src/**/*.ts", { cwd: root })) {
      const text = readFileSync(join(root, file), "utf8");
      const path = file.split("\\").join("/");
      if (!path.startsWith("src/catalog/") && !/from "[^"]*catalog\//.test(text)) continue;
      const reads = text.match(pattern)?.length ?? 0;
      if (reads > 0) found[path] = reads;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(allowed).map(([file, [count]]) => [file, count])));
  });
});
