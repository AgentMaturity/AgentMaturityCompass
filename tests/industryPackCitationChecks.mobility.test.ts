import { describe, expect, it } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { CITATION_CHECK_FILES, citationCheckProblems, packCitations, type CitationCheck } from "../src/domains/packs/citationChecks.js";

const packs = listIndustryPacks();
const mobilityPacks = packs.filter((p) => p.stationId === "mobility");
const rows = CITATION_CHECK_FILES.mobility as CitationCheck[];
const mobilityOnly = Object.fromEntries(Object.keys(CITATION_CHECK_FILES).map((k) => [k, k === "mobility" ? rows : []]));

describe("mobility station citation check records", () => {
  it("are well formed, match a pack citation and question in the registry, and none is marked wrong", () => {
    expect(citationCheckProblems(packs, mobilityOnly)).toEqual([]);
    const questionIds = new Set(mobilityPacks.flatMap((p) => p.questions.map((q) => `${p.id}/${q.id}`)));
    for (const r of rows) expect(r.questionId === "pack" || questionIds.has(`${r.packId}/${r.questionId}`)).toBe(true);
  });

  it("cover every citation in the station, one record each", () => {
    const want = mobilityPacks.flatMap((p) => packCitations(p).map((c) => `${c.packId}|${c.questionId}|${c.citation}`)).sort();
    expect(rows.map((r) => `${r.packId}|${r.questionId}|${r.citation}`).sort()).toEqual(want);
  });

  it("never mark a citation verified or corrected without an https source, and name the hosts tried when unverifiable", () => {
    for (const r of rows) {
      if (r.verdict === "verified" || r.verdict === "corrected") expect(r.sourceUrl ?? "").toMatch(/^https:\/\//);
      if (r.verdict === "unverifiable") expect(r.note, `${r.packId}/${r.questionId}`).toMatch(/\b[a-z0-9.-]+\.(org|gov|com|int|ch|eu|net)\b|names no/i);
      if (r.verdict === "superseded") expect(r.note.trim()).not.toBe("");
    }
  });
});

describe("mobility station citation check wording", () => {
  it("never says a pack is verified, approved or legally reviewed", () => {
    for (const r of rows) expect(r.note).not.toMatch(/\b(pack is verified|approved|legally reviewed|compliant)\b/i);
  });
});

describe("mobility station clauses the review corrected", () => {
  const question = (packId: string, id: string) => mobilityPacks.find((p) => p.id === packId)!.questions.find((q) => q.id === id)!;
  const text = (packId: string, id: string) => JSON.stringify(question(packId, id));

  it("cites the sections that set each duty", () => {
    expect(question("sustainable-ports", "MOB-SP-11").regulatoryRef).toBe("ISPS Code Part A §9.4");
    expect(question("sustainable-ports", "MOB-SP-14").regulatoryRef).toBe("C-TPAT MSC §3");
    expect(question("sustainable-ports", "MOB-SP-9").regulatoryRef).toBe("IMO MSC-FAL.1/Circ.3/Rev.4");
    expect(question("privacy-security-mobility", "MOB-PS-12").regulatoryRef).not.toMatch(/7\.3\.3/);
    expect(question("virtual-infrastructure", "MOB-VI-7").regulatoryRef).toBe("EU AI Act Art. 13");
  });

  it("never marks a question citation verified when the note says the instrument's text was not read", () => {
    for (const r of rows) {
      if (r.questionId !== "pack" && r.verdict === "verified") expect(r.note, `${r.packId}/${r.questionId}/${r.citation}`).not.toMatch(/not read/i);
    }
  });

  it("does not claim a date or duty the source does not set", () => {
    expect(text("sustainable-ports", "MOB-SP-10")).not.toMatch(/ECAs from 1 March 2026/);
    expect(text("sustainable-ports", "MOB-SP-7")).not.toMatch(/publish port-service charges/);
    expect(text("sustainable-ports", "MOB-SP-7")).toMatch(/fall under Art\. 12\(1\)[\s\S]*formal complaint and request \(Art\. 12\(3\)\)/);
    expect(text("privacy-security-mobility", "MOB-PS-3")).not.toMatch(/also after reset|including after reset/);
    expect(text("sustainable-real-estate", "MOB-RE-2")).not.toMatch(/all six environmental objectives/);
  });

  it("keeps no ISO edition year that could not be confirmed in the station's own text", () => {
    for (const p of mobilityPacks) {
      const own = JSON.stringify([p.regulatoryBasis, p.complianceFrameworks, p.certificationPath, p.questions]);
      expect(own).not.toMatch(/\bISO(\/IEC|\/SAE)? [0-9-]+:20\d\d\b/);
    }
  });
});
