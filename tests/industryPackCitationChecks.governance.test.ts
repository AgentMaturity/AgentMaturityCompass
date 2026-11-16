import { describe, expect, it } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { CITATION_CHECK_FILES, citationCheckProblems, packCitations, type CitationCheck } from "../src/domains/packs/citationChecks.js";

const packs = listIndustryPacks();
const governancePacks = packs.filter((p) => p.stationId === "governance");
const rows = CITATION_CHECK_FILES.governance as CitationCheck[];
const governanceOnly = Object.fromEntries(Object.keys(CITATION_CHECK_FILES).map((k) => [k, k === "governance" ? rows : []]));

describe("governance station citation check records", () => {
  it("are well formed, match a pack citation and question in the registry, and none is marked wrong", () => {
    expect(citationCheckProblems(packs, governanceOnly)).toEqual([]);
    const questionIds = new Set(governancePacks.flatMap((p) => p.questions.map((q) => `${p.id}/${q.id}`)));
    for (const r of rows) expect(r.questionId === "pack" || questionIds.has(`${r.packId}/${r.questionId}`)).toBe(true);
  });

  it("cover every citation in the station, one record each", () => {
    const want = governancePacks.flatMap((p) => packCitations(p).map((c) => `${c.packId}|${c.questionId}|${c.citation}`)).sort();
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
      if (r.questionId !== "pack" && r.verdict === "verified") expect(r.note, `${r.packId}/${r.questionId}/${r.citation}`).not.toMatch(/not read/i);
    }
  });

  it("never says a pack is verified, approved or legally reviewed", () => {
    for (const r of rows) expect(r.note).not.toMatch(/\b(pack is verified|approved|legally reviewed|compliant)\b/i);
  });
});

describe("governance station clauses the review corrected", () => {
  const question = (packId: string, id: string) => governancePacks.find((p) => p.id === packId)!.questions.find((q) => q.id === id)!;
  const text = (packId: string, id: string) => JSON.stringify(question(packId, id));

  it("cites the provisions that set each duty", () => {
    expect(question("public-private-collaboration", "GOV-PPC-2").regulatoryRef).toBe("OECD PPP Governance Principles (OECD/LEGAL/0392) §5, §11");
    expect(question("petition-to-law", "GOV-PL-2").regulatoryRef).toMatch(/OECD\/LEGAL\/0438\) provision 8$/);
    expect(question("dance-of-democracy", "GOV-DD-2").regulatoryRef).toMatch(/Commitment 22/);
    expect(question("citizen-services", "GOV-CS-12").regulatoryRef).toBe("WCAG 2.1 SC 2.4.3, SC 2.4.7, SC 2.1.2");
    expect(question("citizen-services", "GOV-CS-10").regulatoryRef).toMatch(/^EU Single Digital Gateway Regulation Art\. 6\(1\)-\(3\)/);
  });

  it("does not credit a source with a duty or a scope it does not have", () => {
    expect(text("dance-of-democracy", "GOV-DD-3")).not.toMatch(/Article 9\(d\)/);
    expect(text("citizen-services", "GOV-CS-10")).not.toMatch(/payment where required/);
    expect(text("public-private-collaboration", "GOV-PPC-5")).not.toMatch(/multi-stakeholder partnership monitoring/);
    expect(text("petition-to-law", "GOV-PL-9")).not.toMatch(/Art\. 8 requires/);
    expect(text("dance-of-democracy", "GOV-DD-16")).toMatch(/candidates and their agents/);
    expect(text("dance-of-democracy", "GOV-DD-3")).toMatch(/not-for-profit body/);
    expect(text("dance-of-democracy", "GOV-DD-3")).not.toMatch(/micro-targeting/);
    expect(text("dance-of-democracy", "GOV-DD-5")).not.toMatch(/OSCE\/ODIHR electoral integrity standards|OSCE post-election|post_election_technology_review/);
    expect(text("dance-of-democracy", "GOV-DD-12")).not.toMatch(/OSCE\/ODIHR observation practice/);
    expect(text("dance-of-democracy", "GOV-DD-2")).toMatch(/since 1 July 2025 a code of conduct under the DSA/);
    expect(text("citizen-services", "GOV-CS-10")).toMatch(/Art\. 6\(2\)\(c\)/);
    expect(text("public-private-collaboration", "GOV-PPC-5")).not.toMatch(/6\.6\.2|partnership quality/);
    expect(text("public-private-collaboration", "GOV-PPC-2")).not.toMatch(/ppp_transparency_report|public transparency reporting/);
  });

  it("keeps compliance claims and unnamed documents out of the maturity path and the rules to check", () => {
    for (const p of governancePacks) {
      expect(p.certificationPath, p.id).not.toMatch(/complian|World Bank/i);
      expect(p.regulatoryBasis.join("; "), p.id).not.toMatch(/World Bank/);
    }
  });

  it("names documents that exist and keeps no unconfirmed ISO edition year in the station's own text", () => {
    for (const p of governancePacks) {
      const own = JSON.stringify([p.regulatoryBasis, p.complianceFrameworks, p.certificationPath, p.questions]);
      expect(own).not.toMatch(/\bISO(\/IEC)? [0-9-]+:(19|20)\d\d\b/);
      expect(own).not.toMatch(/OSCE\/ODIHR (Electoral Standards|Handbook on Electoral Technology)|UN E-Government Survey Guidelines|SDG 17 Partnership Framework/);
    }
  });
});
