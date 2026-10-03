import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getDomainPackQuestions } from "../src/score/domainPacks.js";
import { assessDomain } from "../src/domains/domainAssessmentEngine.js";
import { buildDomainReport, renderDomainReportMarkdown } from "../src/domains/domainReportBuilder.js";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { listIndustryPacks, getStationSummary } from "../src/domains/industryPacks.js";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);

function governance(base: number, domainValue: number) {
  const baseScores: Record<string, number> = {};
  for (let i = 1; i <= 42; i += 1) baseScores[`AMC-${i}`] = base;
  const domainQuestionScores: Record<string, number> = {};
  for (const q of getDomainPackQuestions("governance")) domainQuestionScores[q.id] = domainValue;
  return assessDomain({ agentId: "agent-s4", domain: "governance", baseScores, domainQuestionScores });
}

describe("domain report — EU AI Act classification and certification semantics", () => {
  test("renders the station category and each pack's Annex III classification", () => {
    const result = governance(80, 80);
    const md = renderDomainReportMarkdown(result, NOW);
    expect(md).toContain("## EU AI Act Classification");
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

describe("docs/SECTOR_PACKS.md derived counts", () => {
  const doc = readFileSync(join(process.cwd(), "docs", "SECTOR_PACKS.md"), "utf8");
  const packs = listIndustryPacks();
  const sectorQuestions = packs.reduce((n, p) => n + p.questions.length, 0);

  test("states the base question count once, equal to questionBank.length, with its derivation command", () => {
    expect(doc).toContain(`${questionBank.length}-question base AMC rubric`);
    expect(doc).toContain("questionBank.length");
    expect(doc).not.toMatch(/\b138\b/);
  });

  test("sector totals and the station example match the registry; the composite formula matches the engine", () => {
    expect(doc).toContain(`## The 7 Stations — ${packs.length} Packs, ${sectorQuestions} Questions`);
    expect(doc).toContain(`totalQuestions: ${getStationSummary("governance").totalQuestions}`);
    expect(doc).not.toContain("× 0.5");
    expect(doc).toContain("Composite Score = round(base_score × 0.6 + domain_score × 0.4)");
  });
});
