/**
 * P1-34 governance files and the currency report: the tracked re-verify checklist (15 facts from the strategy), the F5
 * confirmations, and GOV_REVERIFY_OPEN for reviewed content citing an instrument tied to an open item.
 */
import { describe, expect, it } from "vitest";
import { catalogCurrencyFindings, readGovernance, reverifyChecklistSchema, reverifyOpenItems, type ReverifyItem } from "../../../src/catalog/governance/index.js";
import { defaultCatalogRoot, loadCatalog } from "../../../src/catalog/loader.js";
import type { ControlRecord } from "../../../src/catalog/types.js";
import { REGULATORY_REGISTER } from "../../../src/compliance/regulatory/index.js";
import { authority, keyA, keyB, operatorHome, reviewedControl, sign } from "./reviewers.js";

const catalog = loadCatalog();
const governance = readGovernance(defaultCatalogRoot());
const wealth = catalog.controls.get("L1-WLT-US-01")!; // cites Regulation E (S5 us-reg-e)
const HOME = operatorHome();


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
    const reviewed = new Map(catalog.controls).set(wealth.id, reviewedControl(wealth));
    const auth = authority(HOME, [], { reverify: governance.reverify });
    const errors = catalogCurrencyFindings({ ...catalog, controls: reviewed }, auth).filter((f) => f.severity === "error");
    expect(errors.map((f) => [f.code, f.controlId])).toEqual([["GOV_REVERIFY_OPEN", wealth.id]]);
    expect(catalogCurrencyFindings(catalog, auth).filter((f) => f.severity === "error")).toEqual([]);
  });

  it("lapsed reviewed content is an error, a review falling due is a warning, and so are register status reviews", () => {
    const control = reviewedControl(catalog.controls.get("L0-ADV-01")!);
    const cat = { ...catalog, controls: new Map(catalog.controls).set(control.id, control) };
    const pair = (decidedAt: string) => [sign(control, keyA, "fixture-reviewer-a", { decidedAt }), sign(control, keyB, "fixture-reviewer-b", { decidedAt })];
    const lapsed = catalogCurrencyFindings(cat, authority(HOME, pair("2026-06-01"), { now: new Date("2027-01-15T00:00:00Z") }));
    expect(lapsed.filter((f) => f.severity === "error").map((f) => [f.code, f.controlId])).toEqual([["GOV_REVIEW_OVERDUE", control.id]]);
    expect(lapsed.some((f) => f.code === "GOV_REGISTER_STATUS_REVIEW" && f.severity === "warning")).toBe(true);
    const soon = catalogCurrencyFindings(cat, authority(HOME, pair("2026-10-15"), { now: new Date("2027-01-01T00:00:00Z") }));
    expect(soon.filter((f) => f.controlId === control.id).map((f) => [f.code, f.severity, f.message])).toEqual([["GOV_REVIEW_DUE_SOON", "warning", "review due 2027-01-13"]]);
  });

  it("an approved review the YAML declares without a verified record is never hidden: an error when it claims reviewed support, else a warning", () => {
    const declared = { ...catalog.controls.get("L0-ADV-01")!, review: { status: "approved" as const, expert: "x", credential: "x", reviewedAt: "2026-10-01", nextReview: null } };
    const run = (control: ControlRecord) => catalogCurrencyFindings({ ...catalog, controls: new Map([[control.id, control]]) }, authority(HOME, []))
      .filter((f) => f.controlId === control.id).map((f) => [f.code, f.severity]);
    expect(run(declared)).toEqual([["GOV_REVIEW_UNVERIFIED", "warning"]]);
    expect(run({ ...declared, support: "reviewed" })).toEqual([["GOV_REVIEW_UNVERIFIED", "error"], ["GOV_REVIEW_UNVERIFIED", "warning"]]);
    expect(run(catalog.controls.get("L0-ADV-01")!)).toEqual([]);
  });
});
