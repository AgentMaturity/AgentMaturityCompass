import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getStationSummary, listIndustryPacks } from "../src/domains/industryPacks.js";
import { PACK_QUESTION_FLOOR, validatePackRegulatoryCurrency } from "../src/domains/packs/regulatorySchema.js";

const packs = listIndustryPacks();
const STATIONS = ["environment", "health", "wealth", "education", "mobility", "technology", "governance"] as const;
const total = packs.reduce((sum, pack) => sum + pack.questions.length, 0);
const sorted = packs.map((pack) => pack.questions.length).sort((a, b) => a - b);
const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;

describe("industry pack question-depth floor", () => {
  test("measures the registry", () => {
    // stdout directly so the measurement prints under reporters that silence passing tests' console output.
    process.stdout.write(`packs=${packs.length} questions=${total} median=${median} min=${sorted[0]} max=${sorted[sorted.length - 1]} floor=${PACK_QUESTION_FLOOR}\n`);
    expect(packs).toHaveLength(41);
  });

  test("the floor is the measured median of 15 and no pack falls below it", () => {
    expect(PACK_QUESTION_FLOOR).toBe(15);
    const thin = packs.filter((pack) => pack.questions.length < 15).map((p) => `${p.id}: ${p.questions.length} < 15`);
    expect(thin).toEqual([]);
  });

  test("the validator rejects a thin pack", () => {
    const pack = packs.find((p) => p.id === "farm-to-fork")!;
    const errors = validatePackRegulatoryCurrency({ ...pack, questions: pack.questions.slice(0, 3) }, new Date("2026-10-03T00:00:00Z"));
    expect(errors.join("\n")).toMatch(/3 questions is below the floor of 15/);
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
