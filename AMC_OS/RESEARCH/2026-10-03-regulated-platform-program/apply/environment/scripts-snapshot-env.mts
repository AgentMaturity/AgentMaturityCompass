// Regenerates the split-equality snapshots, replacing ONLY environment-station entries
// in the committed snapshot; refuses if anything outside the environment station differs.
import { readFileSync, writeFileSync } from "node:fs";
import { INDUSTRY_PACKS, listIndustryPackIds } from "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-4/src/domains/industryPacks.js";
import { getAllDeepIndustryQuestions, getDeepIndustryPackStats } from "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-4/src/domains/deepIndustryPacks.js";

const DIR = "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-4/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/split/";
const sortKeys = (_k: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;
const canonical = (value: unknown) => JSON.stringify(value, sortKeys, 2) + "\n";
const read = (name: string) => JSON.parse(readFileSync(DIR + name, "utf8"));
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const isEnv = (v: any) => v?.stationId === "environment" || v?.station === "environment";

// industry-packs.json: object keyed by pack id
const oldPacks = read("industry-packs.json");
const newPacks = JSON.parse(canonical(INDUSTRY_PACKS));
const packKeys = new Set([...Object.keys(oldPacks), ...Object.keys(newPacks)]);
const merged: Record<string, unknown> = {};
for (const k of packKeys) {
  if (isEnv(newPacks[k]) || isEnv(oldPacks[k])) merged[k] = newPacks[k];
  else if (!same(oldPacks[k], newPacks[k])) throw new Error(`non-environment pack differs: ${k}`);
  else merged[k] = oldPacks[k];
}
if (!same(merged, newPacks)) throw new Error("merged packs do not equal the registry");

// deep questions: array; non-environment entries must be identical and in the same order
const oldDeep: any[] = read("deep-industry-questions.json");
const newDeep: any[] = JSON.parse(canonical(getAllDeepIndustryQuestions()));
const strip = (xs: any[]) => xs.filter((q) => q.station !== "environment");
if (!same(strip(oldDeep), strip(newDeep))) throw new Error("non-environment deep questions differ");

// deep stats: object; only environment station entries may differ
const oldStats = read("deep-industry-pack-stats.json");
const newStats = JSON.parse(canonical(getDeepIndustryPackStats()));
for (const k of new Set([...Object.keys(oldStats), ...Object.keys(newStats)])) {
  if (!isEnv(newStats[k]) && !isEnv(oldStats[k]) && !same(oldStats[k], newStats[k])) throw new Error(`non-environment stats differ: ${k}`);
}
if (!same(read("industry-pack-ids.json"), listIndustryPackIds())) throw new Error("pack id list differs");

writeFileSync(DIR + "industry-packs.json", canonical(INDUSTRY_PACKS));
writeFileSync(DIR + "deep-industry-questions.json", canonical(getAllDeepIndustryQuestions()));
writeFileSync(DIR + "deep-industry-pack-stats.json", canonical(getDeepIndustryPackStats()));
console.log("environment-only snapshot regenerated");
