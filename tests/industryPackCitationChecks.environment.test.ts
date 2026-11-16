import { describe, expect, it } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { CITATION_CHECK_FILES, citationCheckProblems, packCitations, type CitationCheck } from "../src/domains/packs/citationChecks.js";

const packs = listIndustryPacks();
const environmentPacks = packs.filter((p) => p.stationId === "environment");
const rows = CITATION_CHECK_FILES.environment as CitationCheck[];
const environmentOnly = Object.fromEntries(Object.keys(CITATION_CHECK_FILES).map((k) => [k, k === "environment" ? rows : []]));

describe("environment station citation check records", () => {
  it("are well formed, match a pack citation and question in the registry, and none is marked wrong", () => {
    expect(citationCheckProblems(packs, environmentOnly)).toEqual([]);
    const questionIds = new Set(environmentPacks.flatMap((p) => p.questions.map((q) => `${p.id}/${q.id}`)));
    for (const r of rows) expect(r.questionId === "pack" || questionIds.has(`${r.packId}/${r.questionId}`)).toBe(true);
  });

  it("cover every citation in the station, one record each", () => {
    const want = environmentPacks.flatMap((p) => packCitations(p).map((c) => `${c.packId}|${c.questionId}|${c.citation}`)).sort();
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

describe("environment station citation check wording", () => {
  it("never says a pack is verified, approved or legally reviewed", () => {
    for (const r of rows) expect(r.note).not.toMatch(/\b(pack is verified|approved|legally reviewed|compliant)\b/i);
  });
});

describe("environment station dates and duties the review corrected", () => {
  const question = (packId: string, id: string) => environmentPacks.find((p) => p.id === packId)!.questions.find((q) => q.id === id)!;
  const text = (packId: string, id: string) => JSON.stringify(question(packId, id));

  it("states the FDA traceability enforcement date with the law that sets it", () => {
    expect(text("farm-to-fork", "ENV-FF-18")).toMatch(/will not enforce before 20 Jul 2028, as directed by Pub\. L\. 119-37 Sec\. 780/);
    expect(text("farm-to-fork", "ENV-FF-18")).toMatch(/the 20 Jul 2028 enforcement date is tracked/);
  });

  it("limits the EUDR micro and small date to operators established by 31 Dec 2024", () => {
    expect(text("farm-to-fork", "ENV-FF-3")).toMatch(/micro and small operators established by 31 Dec 2024/);
    expect(rows.find((r) => r.questionId === "ENV-FF-3")!.verdict).toBe("corrected");
  });

  it("does not credit the Cancun safeguards with FPIC", () => {
    const q = question("source-to-sustenance", "ENV-SS-4") as unknown as Record<string, unknown>;
    const cancun = Object.values(q).filter((v): v is string => typeof v === "string" && /Cancun/.test(v));
    expect(cancun.length).toBeGreaterThan(0);
    for (const value of cancun) expect(value).not.toMatch(/FPIC|including free, prior and informed consent/);
  });
});
