import { describe, expect, test } from "vitest";
import { getDomainPackQuestions } from "../src/score/domainPacks.js";
import { assessDomain, parseAnnexIIIPoints } from "../src/domains/domainAssessmentEngine.js";
import { buildDomainReport, renderDomainReportMarkdown } from "../src/domains/domainReportBuilder.js";
import { getIndustryPacksByStation } from "../src/domains/industryPacks.js";
import { DOMAIN_REGISTRY, type Domain } from "../src/domains/domainRegistry.js";
import type { Level0to5, Likert1to5 } from "../src/score/units.js";

const DOMAINS = Object.keys(DOMAIN_REGISTRY) as Domain[];
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);

/** Base answers are diagnostic levels 0-5 and domain answers Likert 1-5 (P0-21 units). */
function uniform(domain: Domain, base: Level0to5, domainValue: Likert1to5, overrides: Record<string, Likert1to5> = {}) {
  const baseScores: Record<string, Level0to5> = {};
  for (let i = 1; i <= 42; i += 1) baseScores[`AMC-${i}`] = base;
  const domainQuestionScores: Record<string, Likert1to5> = {};
  for (const q of getDomainPackQuestions(domain)) domainQuestionScores[q.id] = domainValue;
  return assessDomain({ agentId: "agent-s4", domain, baseScores, domainQuestionScores: { ...domainQuestionScores, ...overrides } });
}

describe("domain assessment — EU AI Act classification", () => {
  test("carries the station category and every station pack's Annex III classification", () => {
    for (const domain of DOMAINS) {
      const result = uniform(domain, 4, 4);
      const packs = getIndustryPacksByStation(domain);
      expect(result.euAIActClassification.domainCategory).toBe(DOMAIN_REGISTRY[domain].euAIActCategory);
      expect(result.euAIActClassification.packs.map((p) => p.packId)).toEqual(packs.map((p) => p.id));
      for (const [i, p] of result.euAIActClassification.packs.entries()) {
        expect(p.classification).toBe(packs[i]!.euAIActClassification);
        // Every pack names an Annex III point, a GPAI route, or says why it is outside Annex III (Art. 6(1)/Annex I, not listed).
        const outsideAnnexIII = /Not listed in Annex III|Art\. 6\(1\)/.test(p.classification);
        expect(p.annexIIIPoints.length > 0 || p.generalPurpose || outsideAnnexIII, `${p.packId}: ${p.classification}`).toBe(true);
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

  test("a PROHIBITED qualifier or a cited Art. 5(1) prohibition is flagged separately from the Annex III point", () => {
    expect(parseAnnexIIIPoints("Annex III §8 — Administration of justice and democratic processes (PROHIBITED if manipulation of voting behavior)"))
      .toEqual({ points: [8], generalPurpose: false, prohibitedFlag: true });
    expect(parseAnnexIIIPoints("Annex III §8(b) — systems intended to influence an election; Art. 5(1)(a) prohibits manipulative or deceptive techniques"))
      .toEqual({ points: [8], generalPurpose: false, prohibitedFlag: true });
    expect(parseAnnexIIIPoints("Not listed in Annex III; otherwise Art. 4 (AI literacy), Art. 5 (prohibited practices) and Art. 50 (transparency) apply").prohibitedFlag)
      .toBe(false);
  });

  test("scope-note parentheticals and negations do not invent points; lower-case general-purpose AI is a GPAI route", () => {
    expect(parseAnnexIIIPoints("Not listed in Annex III (§8 covers judicial authorities and election influence, not legislative drafting); Art. 50 transparency applies"))
      .toEqual({ points: [], generalPurpose: false, prohibitedFlag: false });
    expect(parseAnnexIIIPoints("Not listed in Annex III unless used to evaluate the creditworthiness of natural persons (Annex III §5(b))").points).toEqual([5]);
    expect(parseAnnexIIIPoints("Chapter V obligations for general-purpose AI models (Art. 53; Art. 51 classification with systemic risk)").generalPurpose).toBe(true);
  });

  test("governance exposes dance-of-democracy under Annex III point 8 with its PROHIBITED flag", () => {
    const packs = uniform("governance", 4, 4).euAIActClassification.packs;
    const pack = packs.find((p) => p.packId === "dance-of-democracy");
    expect(pack?.annexIIIPoints).toEqual([8]);
    expect(pack?.prohibitedFlag).toBe(true);
    expect(packs.filter((p) => p.prohibitedFlag).map((p) => p.packId)).toContain("dance-of-democracy");
  });
});

function governance(base: Level0to5, domainValue: Likert1to5) {
  return uniform("governance", base, domainValue);
}

describe("domain report — EU AI Act classification", () => {
  test("renders the station category and each pack's Annex III classification", () => {
    const result = governance(4, 4);
    const md = renderDomainReportMarkdown(result, undefined, NOW);
    expect(md).toContain("## EU AI Act Classification");
    const flagged = result.euAIActClassification.packs.filter((p) => p.prohibitedFlag).map((p) => p.packId);
    expect(flagged).toContain("dance-of-democracy");
    expect(md).toContain(`- Art. 5 prohibition flagged (check the use against Art. 5): ${flagged.join(", ")}`);
    expect(md).toContain("- Station category: high-risk");
    for (const p of result.euAIActClassification.packs) {
      expect(md).toContain(`| ${p.packId} | ${p.classification} | ${p.annexIIIPoints.join(", ") || "-"} | ${p.generalPurpose ? "yes" : "no"} |`);
    }
  });

  test("prints no certification verdict: the scores are self-reported (P0-21)", () => {
    for (const md of [renderDomainReportMarkdown(governance(4, 4), undefined, NOW), renderDomainReportMarkdown(governance(2, 1), undefined, NOW)]) {
      expect(md).not.toMatch(/certif|Threshold Met|Blocking Critical Gaps/i);
      expect(md).toContain("**Claim:** Self-reported");
    }
  });

  test("report object carries the classification block and is deterministic for a given now", () => {
    const result = governance(4, 4);
    const a = buildDomainReport(result, undefined, NOW);
    const b = buildDomainReport(result, undefined, NOW);
    expect(a).toEqual(b);
    expect(a.generatedAt).toBe(new Date(NOW).toISOString());
    expect(a.markdown).toContain(`Generated: ${new Date(NOW).toISOString()}`);
    expect(a.euAIActClassification).toEqual(result.euAIActClassification);
    expect(a).not.toHaveProperty("certification");
  });
});
