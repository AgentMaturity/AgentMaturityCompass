// Regenerates the split-equality snapshots after education-station content changes, refusing
// to write when any non-education entry would change. Usage: npx tsx <this> packs|deep
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { INDUSTRY_PACKS } from "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-3/src/domains/industryPacks.ts";
import { getAllDeepIndustryQuestions, getDeepIndustryPackStats } from "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-3/src/domains/deepIndustryPacks.ts";

const DIR = "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-3/AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/split/";
const sortKeys = (_k: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;
const canonical = (value: unknown) => JSON.stringify(value, sortKeys, 2) + "\n";
const isEdu = (entry: any) => entry?.stationId === "education" || entry?.station === "education";

function check(name: string, value: unknown): void {
  const byId = (v: any) => (Array.isArray(v) ? Object.fromEntries(v.map((e: any) => [e.id, e])) : v);
  const before = byId(JSON.parse(readFileSync(DIR + name, "utf8")));
  const after = byId(JSON.parse(canonical(value)));
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  let changed = 0;
  for (const key of keys) {
    if (isDeepStrictEqual(before[key], after[key])) continue;
    if (!isEdu(before[key] ?? after[key])) throw new Error(`${name}: non-education entry ${key} would change`);
    changed++;
  }
  writeFileSync(DIR + name, canonical(value));
  process.stdout.write(`${name}: ${changed} education entries changed, others identical\n`);
}

if (process.argv[2] === "packs") check("industry-packs.json", INDUSTRY_PACKS);
if (process.argv[2] === "deep") {
  check("deep-industry-questions.json", getAllDeepIndustryQuestions());
  check("deep-industry-pack-stats.json", getDeepIndustryPackStats());
}
