import { describe, expect, test } from "vitest";
import { getDeepQuestionsByStation } from "../src/domains/deepIndustryPacks.js";
import { getIndustryPacksByStation } from "../src/domains/industryPacks.js";
import { PACK_QUESTION_FLOOR, resolveRegulatoryRefParts } from "../src/domains/packs/regulatorySchema.js";

/**
 * Health station, round-2 content (AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/
 * round2/content/health/questions.json + review.json, applied 2026-10-04).
 */
const packs = getIndustryPacksByStation("health");
const questions = packs.flatMap((pack) => pack.questions);
const ids = new Set(questions.map((q) => q.id));
const fieldsOf = (q: (typeof questions)[number]) => [q.text, q.regulatoryRef, q.l1, q.l3, q.l5].join("\n");

describe("health station round-2 content", () => {
  test("merged and dropped questions are gone, added ones are present, every pack holds the floor", () => {
    const merged = ["HLT-DHR-13", "HLT-DHR-14", "HLT-DHR-18", "HLT-PL-15", "HLT-PP-7", "HLT-PP-11", "HLT-LT-12", "HLT-DD-15", "HLT-DD-16", "HLT-SM-11"];
    const dropped = ["HLT-WM-17", "HLT-PL-17"];
    const added = ["HLT-DHR-19", "HLT-DHR-20", "HLT-DHR-21", "HLT-DHR-22", "HLT-WM-18", "HLT-PL-18", "HLT-PP-18", "HLT-PP-19", "HLT-DD-17", "HLT-DD-18"];
    expect([...merged, ...dropped].filter((id) => ids.has(id))).toEqual([]);
    expect(added.filter((id) => !ids.has(id))).toEqual([]);
    expect(packs).toHaveLength(9);
    expect(questions).toHaveLength(149);
    for (const pack of packs) expect(pack.questions.length, pack.id).toBeGreaterThanOrEqual(PACK_QUESTION_FLOOR);
  });

  test("no question cites a superseded edition or a clause of unread paywalled text", () => {
    const stale = [/E6\(R2\)/, /ISO 27799:2016/, /CONSORT 2010/, /21 CFR §820\.(30|70)/, /§4006/];
    const unreadPins = [/IEC 62366-1[^;?]*§/, /USP <797>[^;?]*§/, /81001-5-1:2021/, /SaMD[^;?]*\((2017|2019)\)/, /Guidance, Dec 2022/];
    for (const q of questions) {
      for (const re of [...stale, ...unreadPins]) expect(fieldsOf(q), `${q.id} ${re}`).not.toMatch(re);
    }
  });

  test("CMS-0057-F question asks only what the rule requires", () => {
    const sm18 = questions.find((q) => q.id === "HLT-SM-18")!;
    expect(sm18.regulatoryRef).toBe("CMS-0057-F (89 FR 8758)");
    expect(fieldsOf(sm18)).not.toMatch(/licensed clinician/);
  });

  test("question refs never resolve to a repealed instrument", () => {
    const repealed = questions.flatMap((q) =>
      resolveRegulatoryRefParts(q.regulatoryRef).filter((p) => p.instrument?.status === "repealed").map((p) => `${q.id}: ${p.part}`)
    );
    expect(repealed).toEqual([]);
  });

  test("round-2 deep questions continue the health numbering at 51 with dated official sources", () => {
    const deep = getDeepQuestionsByStation("health");
    const added = deep.filter((q) => /^healthcare-deep-\d+$/.test(q.id));
    expect(added.map((q) => q.id).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `healthcare-deep-${51 + i}`));
    for (const q of added) {
      expect(q.source.retrievedAt, q.id).toBe("2026-10-04");
      expect(new URL(q.source.url).hostname, q.id).toMatch(/(^|\.)(govinfo\.gov|europa\.eu)$/);
      expect(JSON.stringify(q), q.id).not.toMatch(/licensed clinician|packLinks/);
    }
  });

  test("wellness regulatory basis names the insurance point of Annex III, matching its classification", () => {
    const wellness = packs.find((p) => p.id === "wellness-management")!;
    expect(wellness.regulatoryBasis).toContain("EU AI Act Annex III §5(c)");
    expect(wellness.regulatoryBasis).not.toContain("EU AI Act Annex III §5(b)");
  });
});
