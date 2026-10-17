import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog/loader.js";
import { isPartialDate, registerFileSchema, statusReviewDue, validateJurisdictionProfiles, validateRegister, type RegisterEntry } from "../src/catalog/register.js";
import { zodToCatalogIssues } from "../src/catalog/schema.js";
import { CITATION_STATUS_TYPES } from "../src/compliance/citations/citationRecord.js";
import { getRegisterEntry, isOfficialSourceUrl } from "../src/compliance/regulatory/index.js";

/**
 * The US register as law-as-data entries (P1-18): every strategy row is encoded clause by clause, every entry is
 * sourced, dated only where a source states the date, unreviewed, and tied to its S5 register entry. Negative fixtures
 * under tests/fixtures/register/ each break one rule.
 */
const catalog = loadCatalog();
const raw = JSON.parse(readFileSync(join(process.cwd(), "catalog/registers/us.json"), "utf8")) as Record<string, unknown>;
const us = catalog.registers?.get("us");
const entries: RegisterEntry[] = us?.entries ?? [];
const ALL = ["education", "environment", "health", "wealth", "technology", "mobility", "governance"];
/** The strategy's US register rows and their stations (P1-18 step 3). */
const ROWS: Record<string, string[]> = {
  "Reg E, 12 CFR 1005.2": ["wealth", "technology"],
  "GLBA Safeguards Rule, 16 CFR 314.4": ["wealth", "technology"],
  "BSA SAR rule, 31 CFR 1020.320": ["wealth"],
  "NYDFS Part 500 and its AI letter": ["wealth", "technology"],
  "SR 26-2": ["wealth"],
  "SR 23-4 and its replacement proposal": ["wealth", "technology"],
  "HIPAA Privacy, Security and Breach Notification Rules": ["health", "technology"],
  "ACA §1557, 45 CFR 92.210": ["health"],
  "CMS-0057-F": ["health", "wealth"],
  "California AB 3030 and SB 1120; Texas TRAIGA": ["health"],
  "Colorado SB 26-189; California CCPA rules on automated decisions": ALL
};
/** Rows beyond the strategy's eleven: Reg B supports the Wealth overlay's credit-decision controls. */
const ADDED_ROWS: Record<string, string[]> = { "ECOA Regulation B, 12 CFR 1002.9": ["wealth"] };
const REVERIFY_ROWS = ["Reg E, 12 CFR 1005.2", "SR 26-2", "SR 23-4 and its replacement proposal", "Colorado SB 26-189; California CCPA rules on automated decisions"];
const sorted = (xs: readonly string[]) => [...xs].sort();

/** Codes for one entry checked inside the US register file: the shape first, then the cross rules. */
function codesOf(entry: unknown): string[] {
  const parsed = registerFileSchema.safeParse({ ...raw, entries: [entry] });
  if (!parsed.success) return zodToCatalogIssues(parsed.error, "fixture", null).map((i) => i.code);
  return validateRegister(parsed.data, { file: "fixture", asOf: "2026-10-12", vocabulary: catalog.vocabulary }).map((i) => i.code);
}

describe("catalog/registers/us.json encodes the US register (P1-18)", () => {
  it("loads and validates with no issue", () => {
    expect(catalog.issues.filter((i) => i.file.startsWith("registers/") || i.file.startsWith("jurisdictions/"))).toEqual([]);
    expect(us).toBeDefined();
    expect(validateRegister(us!, { file: "registers/us.json", asOf: "2026-10-12", vocabulary: catalog.vocabulary })).toEqual([]);
  });

  it("has at least one entry per row with exactly the row's stations, unique ids and no unlisted row", () => {
    for (const [row, stations] of Object.entries({ ...ROWS, ...ADDED_ROWS })) {
      const own = entries.filter((e) => e.row === row);
      expect(own.length, row).toBeGreaterThan(0);
      for (const e of own) expect(sorted(e.stations), e.id).toEqual(sorted(stations));
    }
    for (const e of entries) expect(Object.keys({ ...ROWS, ...ADDED_ROWS }), e.id).toContain(e.row);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });

  it("dates are real, ordered and explained when null; statusType is one of the seven", () => {
    for (const { id, citation: c, dateNotes } of entries) {
      for (const d of [c.effectiveDate, c.complianceDueDate]) if (d !== null) expect(isPartialDate(d), `${id} ${d}`).toBe(true);
      if (c.effectiveDate && c.complianceDueDate) expect(c.effectiveDate <= c.complianceDueDate, id).toBe(true);
      if (c.effectiveDate === null || c.complianceDueDate === null) expect(dateNotes, id).toBeTruthy();
      expect(CITATION_STATUS_TYPES as readonly string[], id).toContain(c.statusType);
    }
  });

  it("is official exactly when the url host is on S5's officialHosts, and names no legal reviewer yet (D-08 open)", () => {
    for (const e of entries) {
      expect(e.sourceKind, e.id).toBe(isOfficialSourceUrl(e.citation.url) ? "official" : "secondary");
      expect(e.citation.legalReviewer, `${e.id}: nothing is reviewed before D-08`).toBeNull();
    }
  });

  it("resolves every s5RegisterId to an S5 entry whose stations include the entry's", () => {
    for (const e of entries) {
      const s5 = getRegisterEntry(e.s5RegisterId);
      expect(s5, e.id).toBeDefined();
      for (const station of e.stations) expect(s5!.stations, `${e.id} -> ${e.s5RegisterId}`).toContain(station);
    }
  });

  it("flags rows 1, 5, 6 and 11 for re-verification and every state entry as litigation-exposed (EO 14365)", () => {
    for (const e of entries.filter((x) => REVERIFY_ROWS.includes(x.row))) expect(e.flags.reverify, e.id).toBeTruthy();
    expect(us?.policy.litigationRules).toEqual([expect.objectContaining({ jurisdictionPrefix: "US-", s5RegisterId: "us-eo-14365" })]);
    for (const e of entries.filter((x) => x.citation.jurisdiction.startsWith("US-"))) expect(e.flags.litigationExposed, e.id).toBe(true);
    expect(entries.find((e) => e.id === "us-reg-e-1005-2-m")?.flags.applicationUncertain).toBeTruthy();
    for (const id of ["us-tprm-proposal-2026", "us-hipaa-security-nprm-2025"]) {
      expect(entries.find((e) => e.id === id)?.flags.pending, id).toBe(true);
      expect(entries.find((e) => e.id === id)?.citation.statusType, id).toBe("draft");
    }
  });

  it("reports the Colorado and CCPA entries 'status review due' on 2027-01-02, and nothing today", () => {
    const due = statusReviewDue(entries, "2027-01-02");
    const dueIds = due.map((d) => d.id);
    const row11 = entries.filter((e) => e.row.startsWith("Colorado") && e.citation.complianceDueDate === "2027-01-01");
    expect(row11.some((e) => e.citation.jurisdiction === "US-CO") && row11.some((e) => e.citation.jurisdiction === "US-CA")).toBe(true);
    for (const e of row11) expect(dueIds, e.id).toContain(e.id);
    for (const d of due) expect(d.reason).toMatch(/^status review due/);
    expect(statusReviewDue(entries, "2026-10-12")).toEqual([]);
  });

  it("records a content hash only for bytes a receipt in the repository hashed", () => {
    const receipts = readFileSync(join(process.cwd(), "qualification/2026-10-07-P1-17/sources.md"), "utf8");
    const hashed = entries.filter((e) => e.citation.contentHash !== null);
    expect(hashed.map((e) => e.id).sort()).toEqual(["us-bsa-1020-320-b-3", "us-bsa-1020-320-d", "us-bsa-1020-320-e", "us-glba-314-4-j", "us-nydfs-500-17-a"]);
    for (const e of hashed) {
      expect(receipts, e.id).toContain(e.citation.contentHash!.slice("sha256:".length));
      expect(receipts, e.id).toContain(e.citation.url);
    }
    for (const e of entries.filter((x) => x.citation.contentHash === null)) expect(e.sourceNote?.length ?? 0, `${e.id}: unverified with a reason`).toBeGreaterThan(40);
  });
});

describe("register negative fixtures each fail on their own rule", () => {
  const EXPECTED: Record<string, string> = {
    "reviewed-secondary-host.json": "CAT_REGISTER_HOST",
    "invalid-effective-date.json": "CAT_SCHEMA",
    "empty-stations.json": "CAT_SCHEMA",
    "status-compliant.json": "CAT_SCHEMA",
    "retrieved-without-hash-or-note.json": "CAT_REGISTER_SOURCE",
    "us-ca-without-litigation-flag.json": "CAT_REGISTER_LITIGATION"
  };
  const dir = join(process.cwd(), "tests/fixtures/register");
  it("has exactly the spec's six fixtures", () => expect(readdirSync(dir).sort()).toEqual(Object.keys(EXPECTED).sort()));
  for (const [file, code] of Object.entries(EXPECTED)) {
    it(`${file} fails with ${code}`, () => {
      expect(codesOf(JSON.parse(readFileSync(join(dir, file), "utf8")))).toEqual([code]);
    });
  }
});

describe("catalog/jurisdictions/us/profiles.json", () => {
  const profiles = catalog.jurisdictionProfiles?.get("us") ?? [];
  const STATES = ["us-co", "us-ca", "us-tx", "us-nyc", "us-il", "us-ny"];

  it("holds the federal profile and six state profiles, and validates", () => {
    expect(profiles.map((p) => p.id).sort()).toEqual(["us-federal", ...STATES].sort());
    expect(validateJurisdictionProfiles(profiles, us ? [us] : [], "jurisdictions/us/profiles.json")).toEqual([]);
  });

  it("puts rows 1 to 3 and 5 to 9 (and the Reg B row) in us-federal, with the instruments other issues own", () => {
    const federal = profiles.find((p) => p.id === "us-federal")!;
    const federalRows = new Set(federal.registerEntryIds.map((id) => entries.find((e) => e.id === id)?.row));
    const rows = Object.keys(ROWS);
    expect(federalRows).toEqual(new Set([...rows.slice(0, 3), ...rows.slice(4, 9), ...Object.keys(ADDED_ROWS)]));
    expect(federal.litigationExposed).toBe(false);
    expect(federal.otherInstruments.map((x) => x.ownerKey)).toEqual(["P3-14", "P3-14", "P3-14"]);
  });

  it("marks every state profile litigation-exposed and lists each state entry under its state", () => {
    for (const id of STATES) expect(profiles.find((p) => p.id === id)?.litigationExposed, id).toBe(true);
    for (const e of entries.filter((x) => x.citation.jurisdiction.startsWith("US-"))) {
      const profile = profiles.find((p) => p.id === e.citation.jurisdiction.toLowerCase());
      expect(profile?.registerEntryIds, e.id).toContain(e.id);
    }
    const others = profiles.flatMap((p) => p.otherInstruments);
    expect(others.map((x) => x.name)).toEqual(expect.arrayContaining(["Colorado Regulation 10-1-1", "California SB 243", "NYC Local Law 144",
      "Illinois HB 3773", "Illinois HB 1806", "NYDFS Circular Letter 7", "New York LOADinG Act", "California AB 302"]));
  });
});
