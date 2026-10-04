import { describe, expect, test } from "vitest";
import { getDomainPackQuestions } from "../src/score/domainPacks.js";
import { assessDomain, parseAnnexIIIPoints } from "../src/domains/domainAssessmentEngine.js";
import { buildDomainReport, renderDomainReportMarkdown } from "../src/domains/domainReportBuilder.js";
import { getIndustryPacksByStation } from "../src/domains/industryPacks.js";
import { DOMAIN_REGISTRY, type Domain } from "../src/domains/domainRegistry.js";

const DOMAINS = Object.keys(DOMAIN_REGISTRY) as Domain[];
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);

function uniform(domain: Domain, base: number, domainValue: number, overrides: Record<string, number> = {}) {
  const baseScores: Record<string, number> = {};
  for (let i = 1; i <= 42; i += 1) baseScores[`AMC-${i}`] = base;
  const domainQuestionScores: Record<string, number> = {};
  for (const q of getDomainPackQuestions(domain)) domainQuestionScores[q.id] = domainValue;
  return assessDomain({ agentId: "agent-s4", domain, baseScores, domainQuestionScores: { ...domainQuestionScores, ...overrides } });
}

describe("domain assessment — EU AI Act classification", () => {
  test("carries the station category and every station pack's Annex III classification", () => {
    for (const domain of DOMAINS) {
      const result = uniform(domain, 80, 80);
      const packs = getIndustryPacksByStation(domain);
      expect(result.euAIActClassification.domainCategory).toBe(DOMAIN_REGISTRY[domain].euAIActCategory);
      expect(result.euAIActClassification.packs.map((p) => p.packId)).toEqual(packs.map((p) => p.id));
      for (const [i, p] of result.euAIActClassification.packs.entries()) {
        expect(p.classification).toBe(packs[i]!.euAIActClassification);
        expect(p.annexIIIPoints.length > 0 || p.generalPurpose, `${p.packId}: ${p.classification}`).toBe(true);
      }
    }
  });

  test("parses Annex III points, including compound classifications", () => {
    expect(parseAnnexIIIPoints("Annex III §5(a) — Access to essential public services (healthcare)")).toEqual({ points: [5], generalPurpose: false, prohibitedFlag: false });
    expect(parseAnnexIIIPoints("Annex III §2 — Critical infrastructure / §4 — Employment and workers management")).toEqual({ points: [2, 4], generalPurpose: false, prohibitedFlag: false });
    expect(parseAnnexIIIPoints("Annex III §8 — Administration of justice; General Purpose AI — systemic risk")).toEqual({ points: [8], generalPurpose: true, prohibitedFlag: false });
    expect(parseAnnexIIIPoints("General Purpose AI — Art. 51 systemic risk provisions")).toEqual({ points: [], generalPurpose: true, prohibitedFlag: false });
    expect(parseAnnexIIIPoints("Annex III §9 — not a real point")).toEqual({ points: [], generalPurpose: false, prohibitedFlag: false });
    expect(parseAnnexIIIPoints("Art. 5 §2 — no annex named")).toEqual({ points: [], generalPurpose: false, prohibitedFlag: false });
  });

  test("a PROHIBITED qualifier is flagged separately from the Annex III point", () => {
    expect(parseAnnexIIIPoints("Annex III §8 — Administration of justice and democratic processes (PROHIBITED if manipulation of voting behavior)"))
      .toEqual({ points: [8], generalPurpose: false, prohibitedFlag: true });
  });

  test("governance exposes dance-of-democracy under Annex III point 8 with its PROHIBITED flag", () => {
    const packs = uniform("governance", 80, 80).euAIActClassification.packs;
    const pack = packs.find((p) => p.packId === "dance-of-democracy");
    expect(pack?.annexIIIPoints).toEqual([8]);
    expect(pack?.prohibitedFlag).toBe(true);
    expect(packs.filter((p) => p.prohibitedFlag).map((p) => p.packId)).toEqual(["dance-of-democracy"]);
  });
});

describe("domain assessment — certification threshold semantics", () => {
  test("a composite exactly at the threshold meets it (>=, inclusive)", () => {
    const result = uniform("technology", 70, 70);
    expect(result.compositeScore).toBe(70);
    expect(result.certification).toEqual({
      threshold: 70,
      comparison: ">=",
      compositeScore: 70,
      meetsThreshold: true,
      blockingGaps: [],
      ready: true,
    });
    expect(result.certificationReadiness).toBe(true);
  });

  test("one point below the threshold does not meet it", () => {
    const result = uniform("technology", 69, 69);
    expect(result.compositeScore).toBe(69);
    expect(result.certification.meetsThreshold).toBe(false);
    expect(result.certificationReadiness).toBe(false);
  });

  test("a critical control at L1 blocks readiness even above the threshold", () => {
    const result = uniform("technology", 100, 100, { "TECH-1": 1 });
    expect(result.certification.meetsThreshold).toBe(true);
    expect(result.certification.blockingGaps).toEqual(["TECH-1"]);
    expect(result.certification.ready).toBe(false);
    expect(result.certificationReadiness).toBe(false);
  });
});

function governance(base: number, domainValue: number) {
  return uniform("governance", base, domainValue);
}

describe("domain report — EU AI Act classification and certification semantics", () => {
  test("renders the station category and each pack's Annex III classification", () => {
    const result = governance(80, 80);
    const md = renderDomainReportMarkdown(result, NOW);
    expect(md).toContain("## EU AI Act Classification");
    expect(md).toContain("- PROHIBITED qualifier (check the use against Art. 5): dance-of-democracy");
    expect(md).toContain("- Station category: high-risk");
    for (const p of result.euAIActClassification.packs) {
      expect(md).toContain(`| ${p.packId} | ${p.classification} | ${p.annexIIIPoints.join(", ") || "-"} | ${p.generalPurpose ? "yes" : "no"} |`);
    }
  });

  test("states the certification rule, not just a yes/no", () => {
    const result = governance(80, 80);
    const md = renderDomainReportMarkdown(result, NOW);
    expect(md).toContain(`- Certification Threshold: composite >= ${result.certification.threshold} and no critical control at L1`);
    expect(md).toContain(`- Threshold Met: ${result.certification.meetsThreshold ? "yes" : "no"} (composite ${result.compositeScore})`);
    const low = renderDomainReportMarkdown(governance(45, 20), NOW);
    expect(low).toContain("- Threshold Met: no");
    expect(low).toMatch(/- Blocking Critical Gaps: GOV-\d+(, GOV-\d+)*/);
  });

  test("report object carries the classification and certification blocks and is deterministic for a given now", () => {
    const result = governance(80, 80);
    const a = buildDomainReport(result, NOW);
    const b = buildDomainReport(result, NOW);
    expect(a).toEqual(b);
    expect(a.generatedAt).toBe(new Date(NOW).toISOString());
    expect(a.markdown).toContain(`Generated: ${new Date(NOW).toISOString()}`);
    expect(a.euAIActClassification).toEqual(result.euAIActClassification);
    expect(a.certification).toEqual(result.certification);
  });
});
