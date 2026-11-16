import { describe, expect, it } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { CITATION_CHECK_FILES, citationCheckProblems, packCitations, type CitationCheck } from "../src/domains/packs/citationChecks.js";

const packs = listIndustryPacks();
const educationPacks = packs.filter((p) => p.stationId === "education");
const rows = CITATION_CHECK_FILES.education as CitationCheck[];
const educationOnly = Object.fromEntries(Object.keys(CITATION_CHECK_FILES).map((k) => [k, k === "education" ? rows : []]));

describe("education station citation check records", () => {
  it("are well formed, match a pack citation and question in the registry, and none is marked wrong", () => {
    expect(citationCheckProblems(packs, educationOnly)).toEqual([]);
    const questionIds = new Set(educationPacks.flatMap((p) => p.questions.map((q) => `${p.id}/${q.id}`)));
    for (const r of rows) expect(r.questionId === "pack" || questionIds.has(`${r.packId}/${r.questionId}`)).toBe(true);
  });

  it("cover every citation in the station, one record each", () => {
    const want = educationPacks.flatMap((p) => packCitations(p).map((c) => `${c.packId}|${c.questionId}|${c.citation}`)).sort();
    expect(rows.map((r) => `${r.packId}|${r.questionId}|${r.citation}`).sort()).toEqual(want);
  });

  it("never mark a citation verified or corrected without an https source, and name the hosts tried when unverifiable", () => {
    for (const r of rows) {
      if (r.verdict === "verified" || r.verdict === "corrected") expect(r.sourceUrl ?? "").toMatch(/^https:\/\//);
      if (r.verdict === "unverifiable") expect(r.note, `${r.packId}/${r.questionId}`).toMatch(/\b[a-z0-9.-]+\.(org|gov|com|int|ch|eu)\b|names no/i);
      if (r.verdict === "superseded") expect(r.note.trim()).not.toBe("");
    }
  });
});

describe("education station citation check wording", () => {
  it("never says a pack is verified, approved or legally reviewed", () => {
    for (const r of rows) expect(r.note).not.toMatch(/\b(pack is verified|approved|legally reviewed|compliant)\b/i);
  });
});
