// Regenerates the split-equality snapshots for the health station only: every non-health pack,
// deep question and stats row must be byte-identical to the committed snapshot, or nothing is written.
import { readFileSync, writeFileSync } from "node:fs";
const ROOT = "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-2";
const { INDUSTRY_PACKS } = await import(`${ROOT}/src/domains/industryPacks.ts`);
const { getAllDeepIndustryQuestions, getDeepIndustryPackStats } = await import(`${ROOT}/src/domains/deepIndustryPacks.ts`);
const DIR = `${ROOT}/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/split/`;
const sortKeys = (_k: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;
const canonical = (value: unknown) => JSON.stringify(value, sortKeys, 2) + "\n";
const reparse = (value: unknown) => JSON.parse(canonical(value));
const old = (name: string) => JSON.parse(readFileSync(DIR + name, "utf8"));
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const problems: string[] = [];

const packs = reparse(INDUSTRY_PACKS) as Record<string, { stationId: string }>;
const oldPacks = old("industry-packs.json") as Record<string, { stationId: string }>;
if (!same(Object.keys(packs).sort(), Object.keys(oldPacks).sort())) problems.push("pack id set changed");
let healthPacks = 0;
for (const [id, pack] of Object.entries(packs)) {
  if (pack.stationId === "health") { healthPacks++; continue; }
  if (!same(pack, oldPacks[id])) problems.push(`non-health pack changed: ${id}`);
}

const deep = reparse(getAllDeepIndustryQuestions()) as Array<{ id: string; station: string }>;
const oldDeep = old("deep-industry-questions.json") as Array<{ id: string; station: string }>;
if (!same(deep.filter((q) => q.station !== "health"), oldDeep.filter((q) => q.station !== "health"))) problems.push("non-health deep questions changed");

const stats = reparse(getDeepIndustryPackStats()) as Record<string, { station: string }>;
const oldStats = old("deep-industry-pack-stats.json") as Record<string, { station: string }>;
for (const [k, v] of Object.entries({ ...oldStats, ...stats })) {
  if (v.station !== "health" && !same(stats[k], oldStats[k])) problems.push(`non-health deep stats changed: ${k}`);
}

if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
writeFileSync(DIR + "industry-packs.json", canonical(INDUSTRY_PACKS));
writeFileSync(DIR + "deep-industry-questions.json", canonical(getAllDeepIndustryQuestions()));
writeFileSync(DIR + "deep-industry-pack-stats.json", canonical(getDeepIndustryPackStats()));
console.log(`health packs regenerated=${healthPacks}; non-health packs, deep questions and stats unchanged`);
