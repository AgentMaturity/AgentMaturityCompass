/**
 * P1-34: effectiveSupport is the only function that raises a control's support. A spy on it shows that compilePlan, the
 * OSCAL export and the currency report take support from its results, and a source scan pins every other read of a
 * control's review status, reviewer, approval or support fields to a reviewed allowlist.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/catalog/governance/support.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/catalog/governance/support.js")>();
  return { ...actual, effectiveSupport: vi.fn(actual.effectiveSupport) };
});

import { compilePlan, parseDeploymentProfile } from "../../../src/catalog/compiler/compile.js";
import { catalogCurrencyFindings } from "../../../src/catalog/governance/index.js";
import { effectiveSupport, shownLegalReview, shownReviewStatus, type SupportResult } from "../../../src/catalog/governance/support.js";
import { loadCatalog, type LoadedCatalog } from "../../../src/catalog/loader.js";
import type { ControlRecord } from "../../../src/catalog/types.js";
import { toOscalCatalog } from "../../../src/exports/oscal/oscalCatalog.js";
import { author, AUTHOR, authority, keyA, keyB, keypair, operatorHome, reviewedControl, sign } from "./reviewers.js";

const spy = vi.mocked(effectiveSupport);
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
/** Every effectiveSupport result for `id` since the spy was reset. */
const resultsFor = (id: string): SupportResult[] => spy.mock.calls.flatMap((call, i) =>
  ((call[0] as ControlRecord).id === id && spy.mock.results[i]?.type === "return" ? [spy.mock.results[i]!.value as SupportResult] : []));

beforeEach(() => { spy.mockClear(); });

describe("effectiveSupport is the single source of a control's support (P1-34)", () => {
  it("compilePlan: a row is reviewed only where effectiveSupport returned a promotion for it", () => {
    const plan = compilePlan({ profile, catalog: withControl, asOf: "2026-10-18T12:00:00Z", reviewAuthority: authority(HOME, genuine) });
    const promoted = plan.requirements.filter((r) => stronger(r.support));
    expect(promoted.map((r) => r.controlId)).toEqual([control.id]);
    for (const row of promoted) expect(resultsFor(row.controlId).some((r) => r.support === row.support && r.promotion !== null)).toBe(true);
    for (const records of fakes) {
      spy.mockClear();
      const fake = compilePlan({ profile, catalog: withControl, asOf: "2026-10-18T12:00:00Z", reviewAuthority: authority(HOME, records) });
      expect(fake.requirements.filter((r) => stronger(r.support))).toEqual([]);
      expect(resultsFor(control.id).every((r) => r.support === "experimental" && r.promotion === null)).toBe(true);
      expect(resultsFor(control.id).length).toBeGreaterThan(0);
    }
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

  it("no other source reads a control's review status, reviewer, approval or support fields outside the reviewed allowlist", () => {
    // file -> [number of reads, why each is allowed]. A new read anywhere changes a count and fails here: route it through
    // effectiveSupport (or shownReviewStatus) instead, or add it with its reason.
    const allowed: Record<string, [number, string]> = {
      "src/catalog/governance/support.ts": [4, "the single function, shownReviewStatus and shownLegalReview"],
      "src/catalog/governance/index.ts": [4, "the report compares the declaration with effectiveSupport's result"],
      "src/catalog/governance/changelogGuard.ts": [2, "declared reviewed content needs review ids: stricter only"],
      "src/catalog/compiler/compile.ts": [2, "writes effectiveSupport's result into each row"],
      "src/catalog/compiler/applicability.ts": [2, "the row's initial value, replaced by compile; retired never promotes"],
      "src/catalog/compiler/activate.ts": [1, "shownReviewStatus over the plan row's compiled support"],
      "src/catalog/schema.ts": [9, "P1-09 support gate: refuses incomplete declarations, never raises"],
      "src/catalog/validate.ts": [5, "refuses an approved review citing an unreviewed register entry; stricter citation severity"],
      "src/catalog/types.ts": [1, "the type"],
      "src/a4/a4Conformance.ts": [1, "a stored conformance row, copied from the plan row"],
      "src/a4/adaptPolicy.ts": [1, "the key of the shownLegalReview result"],
      "src/exports/oscal/oscalCatalog.ts": [1, "reviewedAt as the metadata last-modified date, not a status"],
      "src/diagnostic/questionBank.ts": [1, "an unrelated tuning-knob name"]
    };
    const pattern = /\breview\.(status|expert|credential|reviewedAt|nextReview)\b|provenance\.approvedBy\b|\b(record|control|r|c|rec)\??\.support\b|\blegalReview\b/g;
    const root = join(__dirname, "..", "..", "..");
    const found: Record<string, number> = {};
    for (const file of globSync("src/**/*.ts", { cwd: root })) {
      const reads = readFileSync(join(root, file), "utf8").match(pattern)?.length ?? 0;
      if (reads > 0) found[file.split("\\").join("/")] = reads;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(allowed).map(([file, [count]]) => [file, count])));
  });
});
