import { describe, expect, it } from "vitest";
import { checkRegulatoryCurrency } from "../scripts/check-regulatory-currency.mjs";
import { INDUSTRY_PACK_MANIFEST } from "../src/assurance/packs/industryPackManifest.js";
import { INDUSTRY_PACKS } from "../src/domains/industryPacks.js";
import { REGULATORY_REGISTER, getRegisterEntry, isOfficialSourceUrl } from "../src/compliance/regulatory/index.js";

const entries = REGULATORY_REGISTER.entries;
const ids = new Set(entries.map((e) => e.id));
const keyDate = (entryId: string, dateId: string) => getRegisterEntry(entryId)?.keyDates.find((k) => k.id === dateId);

describe("register entries carry per-date provenance", () => {
  it("every keyDate cites an official url and a retrievedAt", () => {
    for (const e of entries) {
      for (const k of e.keyDates) {
        expect(isOfficialSourceUrl(k.url), `${e.id}.${k.id} url ${k.url}`).toBe(true);
        expect(k.retrievedAt, `${e.id}.${k.id}`).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    }
  });

  it("supersedes and supersededBy name register entries, and the link is reciprocal", () => {
    for (const e of entries) {
      for (const target of e.supersedes ?? []) {
        expect(ids.has(target), `${e.id} supersedes ${target}`).toBe(true);
        expect(getRegisterEntry(target)?.supersededBy, `${target}.supersededBy`).toBe(e.id);
      }
      if (e.supersededBy !== undefined) {
        expect(getRegisterEntry(e.supersededBy)?.supersedes ?? [], `${e.supersededBy}.supersedes`).toContain(e.id);
      }
    }
  });

  it("affectedPacks without a prefix are real industry or assurance-manifest pack ids", () => {
    const known = new Set<string>([...Object.keys(INDUSTRY_PACKS), ...INDUSTRY_PACK_MANIFEST.map((m) => m.id)]);
    for (const e of entries) {
      for (const pack of (e.affectedPacks ?? []).filter((p) => !p.includes(":"))) {
        expect(known.has(pack), `${e.id} affectedPacks ${pack}`).toBe(true);
      }
    }
  });
});

describe("root ruling: CN, BR, IN and JP entries assert nothing as verified", () => {
  it("every CN, BR, IN and JP entry is unverified and has no verified obligation", () => {
    const ruled = ["CN", "BR", "IN", "JP"];
    const scoped = entries.filter((e) => ruled.includes(e.jurisdiction));
    expect(new Set(scoped.map((e) => e.jurisdiction))).toEqual(new Set(ruled));
    expect(scoped.length).toBeGreaterThan(0);
    for (const e of scoped) {
      expect(e.verified, e.id).toBe(false);
      expect(e.agentObligations.filter((o) => o.verified), e.id).toEqual([]);
    }
  });
});

describe("round-2 refuter fixes are applied", () => {
  it("EHDS entered into force 2025-03-25 (OJ Art. 105 + Cellar)", () => {
    expect(keyDate("eu-ehds", "entryIntoForce")).toMatchObject({ date: "2025-03-25", verified: true });
  });

  it("the contested Machinery Regulation application date stays unverified", () => {
    expect(keyDate("eu-machinery", "application")?.verified).toBe(false);
  });

  it("CMS-0057-F decision-timeframe duties carry the 2026-01-01 day, not a bare year", () => {
    expect(keyDate("us-cms-0057-f", "2026-impacted-payers-must-giv")?.date).toBe("2026-01-01");
  });

  it("retrieval observations are flagged so the calendar can skip them", () => {
    const observed = entries.flatMap((e) => e.keyDates.filter((k) => k.observation).map((k) => e.id));
    expect(observed.sort()).toEqual(["us-eeoc-ai-ta", "us-fda-ai-dsf-draft", "us-qmsr"]);
  });

  it("the withdrawn AI Liability Directive proposal is not presented as in force", () => {
    expect(getRegisterEntry("eu-ai-liability-directive")).toMatchObject({ status: "superseded", taskStatus: "withdrawn" });
  });

  it("keeps the S5-verified facts the EU batch had dropped", () => {
    const refs = (id: string) => getRegisterEntry(id)?.agentObligations.filter((o) => o.verified).map((o) => o.ref);
    expect(refs("eu-ai-act")).toEqual(expect.arrayContaining(["Art. 111(3)", "Art. 111(4)"]));
    expect(refs("eu-mdr-ivdr")).toContain("AI Act Art. 6(1) link");
    expect(keyDate("eu-mdr-ivdr", "mdrApplication")).toMatchObject({ date: "2021-05-26", verified: true });
  });

  it("rejects aiverifyfoundation.sg as a source host", () => {
    expect(REGULATORY_REGISTER.policy.officialHosts).not.toContain("aiverifyfoundation.sg");
  });
});

describe("currency script guards the merged register", () => {
  it("fails on a duplicated entry id", () => {
    const copy = structuredClone(REGULATORY_REGISTER);
    copy.entries.push(structuredClone(copy.entries[0]!));
    expect(checkRegulatoryCurrency(copy, { asOf: "2026-10-04" }).errors).toContain(`duplicate entry id ${copy.entries[0]!.id}`);
  });
});
