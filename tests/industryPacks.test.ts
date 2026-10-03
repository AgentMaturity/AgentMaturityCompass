import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  INDUSTRY_PACKS,
  getIndustryPack,
  getStationSummary,
  listIndustryPacks,
  scoreIndustryPack,
} from "../src/domains/industryPacks.js";
import { PACK_QUESTION_FLOOR } from "../src/domains/industryPackRegulatorySchema.js";

const packs = listIndustryPacks();
const STATIONS = ["environment", "health", "wealth", "education", "mobility", "technology", "governance"] as const;
const total = packs.reduce((sum, pack) => sum + pack.questions.length, 0);
const sorted = packs.map((pack) => pack.questions.length).sort((a, b) => a - b);
const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;

describe("industry pack registry", () => {
  test("measures the registry", () => {
    // Written to stdout directly so the measurement prints even under reporters that silence passing tests' console output.
    process.stdout.write(`packs=${packs.length} questions=${total} median=${median} min=${sorted[0]} max=${sorted[sorted.length - 1]} floor=${PACK_QUESTION_FLOOR}\n`);
    expect(packs).toHaveLength(41);
    expect(Object.keys(INDUSTRY_PACKS)).toHaveLength(41);
    expect(sorted[0]).toBeGreaterThanOrEqual(PACK_QUESTION_FLOOR);
  });

  test("question ids are unique and every question is complete", () => {
    const ids = packs.flatMap((pack) => pack.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of packs.flatMap((pack) => pack.questions)) {
      expect(q.weight, q.id).toBeGreaterThan(0);
      for (const field of [q.dimension, q.text, q.regulatoryRef, q.l1, q.l3, q.l5]) expect(field.trim(), q.id).not.toBe("");
    }
  });

  test("public functions keep their signatures", () => {
    expect(getIndustryPack.length).toBe(1);
    expect(scoreIndustryPack.length).toBe(2);
    const pack = getIndustryPack("freight-3pl-warehouse");
    const mature = scoreIndustryPack(pack.id, Object.fromEntries(pack.questions.map((q) => [q.id, 5])));
    expect(mature.percentage).toBe(100);
    expect(mature.questionResults).toHaveLength(pack.questions.length);
  });

  test("docs/DOMAIN_PACKS.md sector-pack counts match the registry", () => {
    const doc = readFileSync(join(process.cwd(), "docs", "DOMAIN_PACKS.md"), "utf8");
    for (const station of STATIONS) {
      const summary = getStationSummary(station);
      expect(doc, station).toContain(`| \`${station}\` | ${summary.packCount} | ${summary.totalQuestions} |`);
    }
    expect(doc).toContain(`| **Total** | **${packs.length}** | **${total}** |`);
  });
});
