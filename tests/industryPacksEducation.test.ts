import { describe, expect, test } from "vitest";
import { getIndustryPacksByStation } from "../src/domains/industryPacks.js";
import { resolveRegulatoryRefParts } from "../src/domains/packs/regulatorySchema.js";

/**
 * Education station content rules from the round-2 review
 * (AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/round2/content/education/review.json):
 * a question that cites two instruments cannot be scored when only one is met,
 * so each question cites exactly one instrument (one or more provisions of it).
 */
const EDUCATION = getIndustryPacksByStation("education");

/** Catalogued instrument id, or the part text itself when the part does not resolve. */
function instrumentsCited(regulatoryRef: string): string[] {
  return [...new Set(resolveRegulatoryRefParts(regulatoryRef).map(({ part, instrument }) => instrument?.id ?? `unresolved:${part}`))];
}

describe("education station industry packs", () => {
  test("covers the five education packs", () => {
    expect(EDUCATION.map((pack) => pack.id).sort()).toEqual(
      ["differently-abled", "higher-education", "k12-pm3", "skills-training", "specialized-education"]
    );
  });

  test.each(EDUCATION.flatMap((pack) => pack.questions.map((q) => ({ packId: pack.id, q }))))(
    "$packId/$q.id cites exactly one instrument",
    ({ q }) => {
      expect(instrumentsCited(q.regulatoryRef)).toHaveLength(1);
    }
  );

  test("regulatoryRef strings carry citations, not working notes", () => {
    for (const pack of EDUCATION) {
      for (const q of pack.questions) {
        expect(q.regulatoryRef, q.id).not.toMatch(/unconfirmed|unreachable|paywalled|not confirmed/i);
      }
    }
  });
});
