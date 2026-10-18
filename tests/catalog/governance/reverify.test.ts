/**
 * P1-34 governance files and the currency report: the tracked re-verify checklist (15 facts from the strategy), the F5
 * confirmations, and GOV_REVERIFY_OPEN for reviewed content citing an instrument tied to an open item.
 */
import { describe, expect, it } from "vitest";
import { catalogCurrencyFindings, readGovernance, reverifyChecklistSchema, reverifyOpenItems, type ReverifyItem } from "../../../src/catalog/governance/index.js";
import { defaultCatalogRoot, loadCatalog } from "../../../src/catalog/loader.js";
import type { ControlRecord } from "../../../src/catalog/types.js";
import { REGULATORY_REGISTER } from "../../../src/compliance/regulatory/index.js";

const catalog = loadCatalog();
const governance = readGovernance(defaultCatalogRoot());
const wealth = catalog.controls.get("L1-WLT-US-01")!; // cites Regulation E (S5 us-reg-e)

const asReviewed = (r: ControlRecord): ControlRecord => ({ ...r, support: "reviewed",
  review: { status: "approved", expert: "fixture-expert", credential: "fixture credential", reviewedAt: "2026-10-15", nextReview: "2026-11-01" } });

describe("governance files (P1-34 steps 9-10)", () => {
  it("loads cleanly; the re-verify checklist holds the 15 seeded facts, all open; no F5 verdict is confirmed yet", () => {
    expect(governance.issues).toEqual([]);
    expect(governance.reverify).toHaveLength(15);
    expect(governance.reverify.every((i) => i.status === "open" && i.reviewRecordId === null && i.checkedAt === null)).toBe(true);
    expect(new Set(governance.reverify.map((i) => i.id)).size).toBe(15);
    expect(governance.f5Confirmations).toEqual([]);
  });

  it("a confirmed or changed item names its check date and review record; ids are unique", () => {
    const item = { ...governance.reverify[0]!, status: "confirmed" as const };
    const parse = (items: unknown[]) => reverifyChecklistSchema.safeParse({ checklistVersion: 1, items }).success;
    expect(parse([item])).toBe(false);
    expect(parse([{ ...item, checkedAt: "2026-10-18", reviewRecordId: "rr-fixture" }])).toBe(true);
    expect(parse([governance.reverify[0], governance.reverify[0]])).toBe(false);
  });

  it("every register id an item affects exists in the S5 register", () => {
    const ids = new Set(REGULATORY_REGISTER.entries.map((e) => e.id));
    const named = governance.reverify.flatMap((i) => i.affects).filter((a) => /^[a-z]{2,4}-[a-z0-9-]+$/.test(a));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((a) => !ids.has(a))).toEqual([]);
  });
});

describe("GOV_REVERIFY_OPEN (P1-34 step 10)", () => {
  it("matches a citation's register id or instrument exactly", () => {
    const items: ReverifyItem[] = [{ id: "fixture", fact: "f", sourceToCheck: "s", owner: null, status: "open", checkedAt: null, reviewRecordId: null, affects: ["us-reg-e"] }];
    expect(reverifyOpenItems(wealth, items).map((m) => m.itemId)).toEqual(["fixture"]);
    expect(reverifyOpenItems(wealth, [{ ...items[0]!, affects: ["US-REG-E"] }])).toEqual([]);
    expect(reverifyOpenItems(wealth, [{ ...items[0]!, status: "confirmed", checkedAt: "2026-10-18", reviewRecordId: "rr-fixture" }])).toEqual([]);
  });

  it("a reviewed control citing an instrument tied to an open item is an error; experimental content is not", () => {
    const reviewed = new Map(catalog.controls).set(wealth.id, asReviewed(wealth));
    const errors = catalogCurrencyFindings({ ...catalog, controls: reviewed }, REGULATORY_REGISTER, governance.reverify, "2026-10-18")
      .filter((f) => f.severity === "error");
    expect(errors.map((f) => [f.code, f.controlId])).toEqual([["GOV_REVIEW_UNVERIFIED", wealth.id], ["GOV_REVERIFY_OPEN", wealth.id]]);
    expect(catalogCurrencyFindings(catalog, REGULATORY_REGISTER, governance.reverify, "2026-10-18").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("overdue reviewed content is an error, overdue experimental content cannot exist, and register status reviews are warnings", () => {
    const control = { ...asReviewed(catalog.controls.get("L0-ADV-01")!), review: { status: "approved" as const, expert: "x", credential: "x", reviewedAt: "2026-06-01", nextReview: "2026-07-01" } };
    const findings = catalogCurrencyFindings({ ...catalog, controls: new Map(catalog.controls).set(control.id, control) }, REGULATORY_REGISTER, [], "2027-01-15");
    expect(findings.filter((f) => f.severity === "error").map((f) => [f.code, f.controlId])).toEqual([["GOV_REVIEW_OVERDUE", control.id]]);
    expect(findings.some((f) => f.code === "GOV_REGISTER_STATUS_REVIEW" && f.severity === "warning")).toBe(true);
  });

  it("a stale recorded review is never hidden: an error for reviewed content, a warning for experimental content", () => {
    const stale = { ...catalog.controls.get("L0-ADV-01")!, review: { status: "approved" as const, expert: "x", credential: "x", reviewedAt: "2027-03-01", nextReview: null } };
    const run = (control: ControlRecord) => catalogCurrencyFindings({ ...catalog, controls: new Map([[control.id, control]]) }, REGULATORY_REGISTER, [], "2026-12-01")
      .filter((f) => f.controlId === control.id).map((f) => [f.code, f.severity]);
    expect(run(stale)).toEqual([["GOV_REVIEW_STALE", "warning"]]);
    expect(run({ ...stale, support: "reviewed" })).toEqual([["GOV_REVIEW_STALE", "error"]]);
    expect(run(catalog.controls.get("L0-ADV-01")!)).toEqual([]);
  });
});
