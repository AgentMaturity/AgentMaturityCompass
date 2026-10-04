// Writes the pre-split equality snapshots. Run from the repo root: npx tsx <this file>
// tests/industryPacksSplitEquality.test.ts regenerates the same JSON and compares bytes.
import { writeFileSync } from "node:fs";
import { INDUSTRY_PACKS, listIndustryPackIds } from "../../../../../src/domains/industryPacks.js";
import { getAllDeepIndustryQuestions, getDeepIndustryPackStats } from "../../../../../src/domains/deepIndustryPacks.js";

const sortKeys = (_k: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;
const dir = new URL(".", import.meta.url);
const write = (name: string, value: unknown) => writeFileSync(new URL(name, dir), JSON.stringify(value, sortKeys, 2) + "\n");

write("industry-packs.json", INDUSTRY_PACKS);
write("industry-pack-ids.json", listIndustryPackIds());
write("deep-industry-questions.json", getAllDeepIndustryQuestions());
write("deep-industry-pack-stats.json", getDeepIndustryPackStats());
