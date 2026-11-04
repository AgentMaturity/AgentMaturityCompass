import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compilePlan, parseDeploymentProfile } from "../src/catalog/compiler/compile.js";
import type { LoadedCatalog } from "../src/catalog/loader.js";
import { controlRecordSchema } from "../src/catalog/schema.js";
import type { ControlRecord } from "../src/catalog/types.js";
import { validateCatalog } from "../src/catalog/validate.js";
import { allFixtures, catalog, EXECUTED_HARNESSES, harnessOf } from "./catalog/l0/harness.js";

/**
 * The Wealth overlay v0.1 (P1-18): US finance-operations controls in catalog/layers/l1-wealth-us/, experimental and
 * unreviewed, citing catalog/registers/us.json entries, with fixtures for every control and executed tests where a
 * producer exists on int. The credit-decision controls stay out of the finance-operations profile.
 */
const SPEC: Record<string, string> = {
  "L1-WLT-US-01": "wealth.us.delegation", "L1-WLT-US-02": "wealth.us.approval-binding", "L1-WLT-US-03": "wealth.us.ambiguous-payment",
  "L1-WLT-US-04": "wealth.us.sar-no-tipping-off", "L1-WLT-US-05": "wealth.us.sar-workflow", "L1-WLT-US-06": "wealth.us.activity-monitoring",
  "L1-WLT-US-07": "wealth.us.inventory-mfa", "L1-WLT-US-08": "wealth.us.npi-extraction", "L1-WLT-US-09": "wealth.us.vendor-oversight",
  "L1-WLT-US-10": "wealth.us.model-inventory", "L1-WLT-US-11": "wealth.us.incident-notices", "L1-WLT-US-12": "wealth.us.kill-switch",
  "L1-WLT-US-13": "wealth.us.credit-reasons", "L1-WLT-US-14": "wealth.us.credit-factor-flip", "L1-WLT-US-15": "wealth.us.credit-name-zip"
};
const CREDIT = ["L1-WLT-US-13", "L1-WLT-US-14", "L1-WLT-US-15"];
const SIGNATURE = ["L1-WLT-US-02", "L1-WLT-US-03", "L1-WLT-US-04", "L1-WLT-US-12"];
const EXECUTED = ["L1-WLT-US-01", "L1-WLT-US-02", "L1-WLT-US-05", "L1-WLT-US-06", "L1-WLT-US-07", "L1-WLT-US-11"];
const pack = catalog.packs.get("amc.l1.wealth.us")?.manifest;
const wealth = Object.keys(SPEC).map((id) => catalog.controls.get(id)).filter((c): c is ControlRecord => c !== undefined);
// Other station overlays append US entries; this page documents the Wealth references.
const entries = new Map((catalog.registers?.get("us")?.entries ?? []).filter((e) => e.stations.includes("wealth")).map((e) => [e.id, e]));
const text = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const CLAIM = /\b(reviewed|approved|certified|compliant)\b/i;
const unclaimed = (s: string) => s.replace(/not\s+independently\s+reviewed/gi, "").replace(/\b(reviewedAt|reviewedBy|approvedBy|legalReview)\b/g, "");

function profile(useCases: string[] | null) {
  const base = JSON.parse(text("tests/fixtures/catalog/compiler/finance-ops-us.profile.json")) as Record<string, unknown>;
  return parseDeploymentProfile({ ...base, useCases: { value: useCases, provenance: "asserted", source: "test", reviewedBy: null } });
}
const decisions = (useCases: string[] | null) =>
  new Map(compilePlan({ profile: profile(useCases), catalog, asOf: "2026-10-12T00:00:00Z" }).requirements.map((r) => [r.controlId, r]));

describe("Wealth overlay v0.1 (P1-18)", () => {
  it("holds the 12 wave-1 and 3 credit controls, each experimental, mandatory, Wealth-only and unreviewed", () => {
    expect(pack).toMatchObject({ layer: 1, stations: ["wealth"], jurisdictions: ["US"], support: "experimental" });
    expect([...(pack?.controls ?? [])].sort()).toEqual(Object.keys(SPEC).sort());
    expect(wealth).toHaveLength(15);
    expect(validateCatalog(catalog).errors.filter((e) => e.controlId?.startsWith("L1-WLT-US") || e.file.includes("l1-wealth-us"))).toEqual([]);
    for (const c of wealth) {
      expect(controlRecordSchema.safeParse(c).success, c.id).toBe(true);
      expect(text(join("catalog", catalog.controlFiles.get(c.id) ?? "")), `${c.id} names its plan slug`).toContain(SPEC[c.id]);
      expect([c.support, c.layer, c.mandatory, c.stations], c.id).toEqual(["experimental", 1, true, ["wealth"]]);
      expect(c.review, c.id).toEqual({ status: "pending", expert: null, credential: null, reviewedAt: null, nextReview: null });
      expect(c.provenance, c.id).toMatchObject({ draftedBy: "ai", approvedBy: null });
    }
  });

  it("cites only register entries, restating each one, with no legal review recorded", () => {
    for (const c of wealth) {
      for (const x of c.citations) {
        const e = entries.get(x.key);
        expect(e, `${c.id} ${x.key} resolves in catalog/registers/us.json`).toBeDefined();
        expect([x.registerId, x.url, x.statusType, x.jurisdiction], `${c.id} ${x.key}`).toEqual([e!.s5RegisterId, e!.citation.url, e!.citation.statusType, e!.citation.jurisdiction]);
        expect(x.retrieval.state, `${c.id} ${x.key}`).toBe(e!.citation.contentHash ? "verified" : "unverified");
        expect(x.legalReview, `${c.id} ${x.key}`).toBeNull();
        expect(x.appliesWhen, `${c.id} ${x.key}: scoped`).not.toBeNull();
      }
    }
  });

  it("gives every control a positive and a negative fixture and declares the four signature tests", () => {
    for (const c of wealth) {
      expect(c.tests.some((t) => t.fixtures.positive.length > 0), c.id).toBe(true);
      expect(c.tests.some((t) => t.fixtures.negative.length > 0), c.id).toBe(true);
      for (const t of c.tests) expect([t.passCriteria.length > 0, t.oracle.observes.length > 0, t.attempts >= 1], t.id).toEqual([true, true, true]);
    }
    for (const id of SIGNATURE) expect(catalog.controls.get(id)?.tests.some((t) => t.passCriteria.startsWith("Signature test")), id).toBe(true);
    expect(catalog.controls.get("L1-WLT-US-04")?.tests[0]).toMatchObject({ type: "executed_adversarial", attempts: 25 });
  });

  it("keeps the credit-decision controls out of the finance-operations profile and applies the other twelve", () => {
    const ops = decisions(["reconciliation", "payment_proposal"]);
    for (const id of Object.keys(SPEC)) {
      expect(ops.get(id)?.applicability, id).toBe(CREDIT.includes(id) ? "not_applicable" : "applicable");
      expect(ops.get(id)?.pulledInBy, id).toEqual(expect.arrayContaining(["station:wealth", "jurisdiction:US"]));
    }
    const credit = decisions(["credit_decision"]);
    for (const id of CREDIT) expect(credit.get(id)?.applicability, id).toBe("applicable");
    for (const id of CREDIT) expect(decisions(null).get(id)?.applicability, `${id}: unknown use cases leave it unresolved`).toBe("unresolved");
  });

  it("never reports an approved review for a control citing an entry that awaits a legal reviewer", () => {
    const control = catalog.controls.get("L1-WLT-US-05")!;
    expect(control.citations.every((x) => entries.get(x.key)?.citation.legalReviewer === null)).toBe(true);
    const approved: ControlRecord = { ...control, review: { status: "approved", expert: "fixture", credential: "fixture", reviewedAt: "2026-10-12", nextReview: "2027-10-12" } };
    const tampered: LoadedCatalog = { ...catalog, controls: new Map(catalog.controls).set(control.id, approved) };
    const errors = validateCatalog(tampered, { asOf: new Date("2026-10-12T00:00:00Z") }).errors.filter((e) => e.controlId === control.id);
    expect(errors.map((e) => e.code)).toContain("CAT_SUPPORT_GATE");
    expect(errors.find((e) => e.code === "CAT_SUPPORT_GATE")?.message).toMatch(/awaits a legal reviewer/);
    const moved: ControlRecord = { ...control, citations: control.citations.map((x, i) => (i === 0 ? { ...x, url: "https://www.ecfr.gov/current/title-31" } : x)) };
    const drift = validateCatalog({ ...catalog, controls: new Map(catalog.controls).set(control.id, moved) }, { asOf: new Date("2026-10-12T00:00:00Z") });
    expect(drift.errors.map((e) => e.code)).toContain("CAT_CITATION_REGISTER_MISMATCH");
  });

  it("runs an executed test for each control whose producer exists on int, and says so in docs/catalog/WEALTH_US.md", () => {
    const executed = [...new Set(allFixtures().filter((f) => f.control.id.startsWith("L1-WLT-US") && harnessOf(f) in EXECUTED_HARNESSES).map((f) => f.control.id))].sort();
    expect(executed).toEqual(EXECUTED);
    const page = text("docs/catalog/WEALTH_US.md");
    for (const c of wealth) {
      const row = page.split("\n").find((l) => l.startsWith(`| ${c.id} |`));
      expect(row, `${c.id} has a row`).toBeDefined();
      expect(row!.includes(`| ${SPEC[c.id]} |`), c.id).toBe(true);
      expect(/\| yes[^|]*\|/.test(row!), `${c.id} executed column`).toBe(EXECUTED.includes(c.id));
    }
    for (const id of entries.keys()) expect(page, `${id} is listed as awaiting a legal reviewer`).toContain(`\`${id}\``);
    expect(CLAIM.exec(unclaimed(page))?.[0]).toBeUndefined();
    for (const c of wealth) expect(CLAIM.exec(unclaimed(text(join("catalog", catalog.controlFiles.get(c.id)!))))?.[0], c.id).toBeUndefined();
  });

  it("points the ambiguous-payment test at P1-19 corpus cases that exist", () => {
    const cases = new Set((JSON.parse(text("spec/fixtures/v1/lighthouse-finance/cases.json")) as { cases: Array<{ id: string }> }).cases.map((c) => c.id));
    const named = [...(catalog.controls.get("L1-WLT-US-03")?.tests[0]?.passCriteria ?? "").matchAll(/\bF\d{2}\b/g)].map((m) => m[0]);
    expect(named.length).toBeGreaterThan(0);
    for (const id of named) expect(cases.has(id), id).toBe(true);
  });
});
