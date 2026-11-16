import { describe, expect, it } from "vitest";
import { listIndustryPacks, getIndustryPack } from "../src/domains/industryPacks.js";
import {
  CITATION_CHECK_FILES, CITATION_CHECK_MAX_AGE_DAYS, citationCheckLine, citationCheckProblems, citationCheckSummary, packCitations, type CitationCheck,
} from "../src/domains/packs/citationChecks.js";

const packs = listIndustryPacks();
const empty = Object.fromEntries(Object.keys(CITATION_CHECK_FILES).map((k) => [k, []]));
const pack = getIndustryPack("networked-ecosystems");
const row = (over: Partial<CitationCheck> = {}): CitationCheck => ({
  packId: pack.id, questionId: "pack", citation: pack.regulatoryBasis[0]!, instrument: "x", clause: "whole instrument",
  verdict: "verified", was: null, now: null, sourceTitle: "Official text", sourceUrl: "https://publications.europa.eu/x",
  checkedOn: "2026-11-16", checkedBy: "ai-agent", note: "", ...over,
});
const withRow = (r: unknown) => ({ ...empty, technology: [r] });

describe("Industry Pack citation check records", () => {
  it("every committed record is well formed, current, in the right station file, and none is marked wrong", () => {
    expect(citationCheckProblems(packs)).toEqual([]);
  });

  it("lists each regulatoryBasis entry, the EU AI Act classification and each regulatoryRef part as one citation", () => {
    const cites = packCitations(pack);
    expect(cites.filter((c) => c.questionId === "pack").map((c) => c.citation)).toEqual([...pack.regulatoryBasis, pack.euAIActClassification]);
    expect(cites.filter((c) => c.questionId === "TECH-NE-8").map((c) => c.citation)).toEqual(["EU DMA Art. 6(5), 6(12)", "EU Data Act Art. 9"]);
  });

  it("fails CI on a wrong verdict, a stale record, a verified record without an https source and a duplicate", () => {
    expect(citationCheckProblems(packs, withRow(row({ verdict: "wrong" }))).join()).toMatch(/marked wrong/);
    expect(citationCheckProblems(packs, withRow(row({ citation: "No such law Art. 1" }))).join()).toMatch(/stale record/);
    expect(citationCheckProblems(packs, withRow(row({ sourceUrl: null }))).join()).toMatch(/needs an https sourceUrl/);
    expect(citationCheckProblems(packs, { ...empty, technology: [row(), row()] }).join()).toMatch(/duplicate/);
    expect(citationCheckProblems(packs, { ...empty, health: [row()] }).join()).toMatch(/belongs in technology\.json/);
    expect(citationCheckProblems(packs, withRow({ ...row(), extra: 1 })).join()).toMatch(/row 0/);
    expect(citationCheckProblems(packs, withRow(row()))).toEqual([]);
  });

  it("defaults to not checked and expires a check after the maximum age", () => {
    const fresh = citationCheckSummary(pack, new Date("2026-11-17"));
    const tne8 = fresh.citations.filter((c) => c.questionId === "TECH-NE-8");
    expect(tne8.map((c) => c.state)).toEqual(["checked", "checked"]);
    expect(fresh.citations.find((c) => c.questionId === "TECH-NE-1")!.state).toBe("not-checked");
    expect(fresh.checked).toBe(2);
    const later = new Date(Date.parse("2026-11-16") + (CITATION_CHECK_MAX_AGE_DAYS + 2) * 86_400_000);
    const old = citationCheckSummary(pack, later);
    expect(old.checked).toBe(0);
    expect(old.counts.expired).toBe(2);
  });

  it("describe says how many citations are checked and that an AI agent's check is not an expert review", () => {
    const line = citationCheckLine(citationCheckSummary(pack, new Date("2026-11-17")));
    expect(line).toMatch(/^2 of \d+ citations checked; 2 of them by an AI agent, not an expert review$/);
    expect(line).not.toMatch(/verified|approved|compliant/i);
  });

  it("describe uses the singular for one and the plural for several", () => {
    const counts = { checked: 0, "not-checked": 0, expired: 0, wrong: 0, unverifiable: 0, superseded: 0 };
    const line = (n: number) => citationCheckLine({ total: 10, checked: 0, checkedByAiAgent: 0, counts: { ...counts, unverifiable: n, expired: n, superseded: n } });
    expect(line(1)).toBe("0 of 10 citations checked; 1 check expired; 1 source could not be opened; 1 instrument replaced");
    expect(line(9)).toBe("0 of 10 citations checked; 9 checks expired; 9 sources could not be opened; 9 instruments replaced");
  });
});
