// Writes the industry-pack registry snapshots that tests/industryPacksSplitEquality.test.ts compares bytes against.
// Run from the repo root after an intended pack or deep-question change: npx tsx scripts/snapshot-industry-packs.mts
// Tracked from the candidate's apply/split/snapshot.mts (37c1466b, P1-42); the snapshots live in tests/fixtures/industry-packs/.
import { mkdirSync, writeFileSync } from "node:fs";
import { INDUSTRY_PACKS, listIndustryPackIds } from "../src/domains/industryPacks.js";
import { getAllDeepIndustryQuestions, getDeepIndustryPackStats } from "../src/domains/deepIndustryPacks.js";

const sortKeys = (_k: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;
const dir = new URL("../tests/fixtures/industry-packs/", import.meta.url);
mkdirSync(dir, { recursive: true });
const write = (name: string, value: unknown) => writeFileSync(new URL(name, dir), JSON.stringify(value, sortKeys, 2) + "\n");

write("industry-packs.json", INDUSTRY_PACKS);
write("industry-pack-ids.json", listIndustryPackIds());
write("deep-industry-questions.json", getAllDeepIndustryQuestions());
write("deep-industry-pack-stats.json", getDeepIndustryPackStats());
