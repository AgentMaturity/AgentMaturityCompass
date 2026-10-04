// Regenerates the split-equality snapshots (apply/split/*.json) for the wealth station only.
// Every non-wealth entry must be byte-identical to the committed snapshot, or nothing is written.
// Run from the repo root: npx tsx <this file>
import { readFileSync, writeFileSync } from "node:fs";
import { INDUSTRY_PACKS } from "../../../../../src/domains/industryPacks.js";
import { getAllDeepIndustryQuestions, getDeepIndustryPackStats } from "../../../../../src/domains/deepIndustryPacks.js";

const STATION = "wealth";
const dir = new URL("../split/", import.meta.url);
const sortKeys = (_k: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;
const canonical = (value: unknown) => JSON.stringify(value, sortKeys, 2) + "\n";
const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const fail = (msg: string): never => { throw new Error(msg); };

// industry-packs.json: object keyed by pack id.
const oldPacks = read("industry-packs.json") as Record<string, { stationId: string }>;
const newPacks = JSON.parse(canonical(INDUSTRY_PACKS)) as Record<string, { stationId: string }>;
if (!same(Object.keys(oldPacks), Object.keys(newPacks))) fail("pack id set changed");
const packs = Object.fromEntries(Object.keys(oldPacks).map((id) => {
  if (oldPacks[id]!.stationId === STATION) return [id, newPacks[id]];
  if (!same(oldPacks[id], newPacks[id])) fail(`non-${STATION} pack ${id} changed`);
  return [id, oldPacks[id]];
}));

// deep-industry-questions.json: array; the station's questions form one contiguous block.
type Deep = { station: string };
const oldDeep = read("deep-industry-questions.json") as Deep[];
const newDeep = JSON.parse(canonical(getAllDeepIndustryQuestions())) as Deep[];
const others = (rows: Deep[]) => rows.filter((q) => q.station !== STATION);
if (!same(others(oldDeep), others(newDeep))) fail(`non-${STATION} deep questions changed`);
const first = oldDeep.findIndex((q) => q.station === STATION);
const count = oldDeep.filter((q) => q.station === STATION).length;
if (oldDeep.slice(first, first + count).some((q) => q.station !== STATION)) fail("station block not contiguous");
const deep = [...oldDeep.slice(0, first), ...newDeep.filter((q) => q.station === STATION), ...oldDeep.slice(first + count)];
if (!same(deep, newDeep)) fail("spliced deep list differs from the registry order");

// deep-industry-pack-stats.json: object keyed by industry.
const oldStats = read("deep-industry-pack-stats.json") as Record<string, { station: string }>;
const newStats = JSON.parse(canonical(getDeepIndustryPackStats())) as Record<string, { station: string }>;
for (const [k, v] of Object.entries(oldStats)) if (v.station !== STATION && !same(v, newStats[k])) fail(`non-${STATION} stats ${k} changed`);

writeFileSync(new URL("industry-packs.json", dir), canonical(packs));
writeFileSync(new URL("deep-industry-questions.json", dir), canonical(deep));
writeFileSync(new URL("deep-industry-pack-stats.json", dir), canonical(newStats));
process.stdout.write(`wealth packs ${Object.values(packs).filter((p) => p.stationId === STATION).length}, wealth deep ${count} -> ${newDeep.filter((q) => q.station === STATION).length}\n`);
