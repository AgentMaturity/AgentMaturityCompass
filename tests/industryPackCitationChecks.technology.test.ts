import { describe, expect, it } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { CITATION_CHECK_FILES, citationCheckProblems, packCitations, type CitationCheck } from "../src/domains/packs/citationChecks.js";

const packs = listIndustryPacks();
const technologyPacks = packs.filter((p) => p.stationId === "technology");
const rows = CITATION_CHECK_FILES.technology as CitationCheck[];
const technologyOnly = Object.fromEntries(Object.keys(CITATION_CHECK_FILES).map((k) => [k, k === "technology" ? rows : []]));

describe("technology station citation check records", () => {
  it("are well formed, match a pack citation and question in the registry, and none is marked wrong", () => {
    expect(citationCheckProblems(packs, technologyOnly)).toEqual([]);
    const questionIds = new Set(technologyPacks.flatMap((p) => p.questions.map((q) => `${p.id}/${q.id}`)));
    for (const r of rows) expect(r.questionId === "pack" || questionIds.has(`${r.packId}/${r.questionId}`)).toBe(true);
  });

  it("cover every citation in the station, one record each", () => {
    const want = technologyPacks.flatMap((p) => packCitations(p).map((c) => `${c.packId}|${c.questionId}|${c.citation}`)).sort();
    expect(rows.map((r) => `${r.packId}|${r.questionId}|${r.citation}`).sort()).toEqual(want);
  });

  it("never mark a citation verified or corrected without an https source, and name the hosts tried when unverifiable", () => {
    for (const r of rows) {
      if (r.verdict === "verified" || r.verdict === "corrected") expect(r.sourceUrl ?? "").toMatch(/^https:\/\//);
      if (r.verdict === "unverifiable") expect(r.note, `${r.packId}/${r.questionId}`).toMatch(/\b[a-z0-9.-]+\.(org|gov|com|int|ch|eu|net)\b|names no/i);
      if (r.verdict === "superseded") expect(r.note.trim()).not.toBe("");
    }
  });

  it("never marks a question citation verified when the note says the instrument's text was not read", () => {
    for (const r of rows) {
      if (r.questionId !== "pack" && r.verdict === "verified") expect(r.note, `${r.packId}/${r.questionId}/${r.citation}`).not.toMatch(/not read|not opened/i);
    }
  });

  it("never says a pack is verified, approved or legally reviewed", () => {
    for (const r of rows) expect(r.note).not.toMatch(/\b(pack is verified|approved|legally reviewed|compliant)\b/i);
  });
});

describe("technology station clauses the review corrected", () => {
  const pack = (id: string) => technologyPacks.find((p) => p.id === id)!;
  const question = (packId: string, id: string) => pack(packId).questions.find((q) => q.id === id)!;
  const text = (packId: string, id: string) => JSON.stringify(question(packId, id));

  it("cites the provisions that set each duty", () => {
    expect(question("os-sustainable-outcomes", "TECH-OS-10").regulatoryRef).toBe("EU DORA (EU) 2022/2554 Art. 26");
    expect(question("networked-ecosystems", "TECH-NE-5").regulatoryRef).toMatch(/^European Interoperability Framework, COM\(2017\) 134/);
    expect(question("cognition-to-intelligence", "TECH-CI-5").regulatoryRef).toBe("GDPR Art. 5(1)(c), (e); GDPR Art. 17");
    expect(question("partnerships-prosperity", "TECH-PP-9").regulatoryRef).toMatch(/WIPO Copyright Treaty Art\. 11$/);
    expect(pack("networked-ecosystems").regulatoryBasis).toContain("OpenID Connect Core 1.0 / OAuth 2.0 (RFC 6749)");
    expect(pack("partnerships-prosperity").regulatoryBasis).toContain("EU Data Act 2023/2854 (Ch. II, IV, VII)");
  });

  it("does not credit a source with a duty or a scope it does not have", () => {
    expect(text("cognition-to-intelligence", "TECH-CI-11")).toMatch(/Article 22\(2\)\(a\), \(c\)/);
    expect(question("cognition-to-intelligence", "TECH-CI-1").text).toMatch(/as the way it meets that duty/);
    expect(text("os-sustainable-outcomes", "TECH-OS-7")).not.toMatch(/testing per Art\. 21\(2\)\(i\)/);
    expect(text("os-sustainable-outcomes", "TECH-OS-10")).not.toMatch(/Council|9\(4\)/);
    expect(text("os-sustainable-outcomes", "TECH-OS-15")).not.toMatch(/Council/);
    expect(text("infotainment", "TECH-INF-4")).not.toMatch(/upload filter/i);
    expect(text("partnerships-prosperity", "TECH-PP-1")).not.toMatch(/TRIPS-compliant/);
    expect(text("partnerships-prosperity", "TECH-PP-6")).not.toMatch(/Articles 2 and 4 reasonable measures/);
    expect(text("partnerships-prosperity", "TECH-PP-7")).toMatch(/count of countries/);
    expect(pack("cognition-to-intelligence").euAIActClassification).not.toMatch(/provides or integrates a GPAI model/);
    expect(pack("partnerships-prosperity").euAIActClassification).toMatch(/third-party conformity assessment/);
  });

  it("keeps compliance claims, unnamed documents and draft standards out of the station's own text", () => {
    for (const p of technologyPacks) {
      expect(p.certificationPath, p.id).not.toMatch(/complian/i);
      expect(p.regulatoryBasis.join("; "), p.id).not.toMatch(/OAuth 2\.1|FRAND Licensing Guidelines|WTO IP Framework|Partnership Framework|EIF v2/);
    }
    expect(JSON.stringify(technologyPacks)).not.toMatch(/10 June 2026/);
  });

  it("keeps no unconfirmed ISO edition year, ISO sub-clause or unread criterion number in the station's own text", () => {
    for (const p of technologyPacks) {
      const own = JSON.stringify([p.regulatoryBasis, p.complianceFrameworks, p.certificationPath, p.questions]);
      expect(own, p.id).not.toMatch(/\bISO(\/IEC)? [0-9-]+:(19|20)\d\d\b/);
      expect(own, p.id).not.toMatch(/ISO(\/IEC)? [0-9-]+(:\d{4})? §\d/);
      expect(own, p.id).not.toMatch(/CC6|ITIL v4|§5\.2\.7|IEEE 7001:2021|UNESCO[^"]*\(2021\)/);
    }
  });
});
