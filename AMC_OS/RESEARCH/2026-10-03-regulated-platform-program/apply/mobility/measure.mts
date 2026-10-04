// Measures the mobility station: per-pack counts, dimension balance, weights, ref-part statuses,
// multi-instrument refs, and the weight distribution by risk tier across all packs.
// Run from the repo root: npx tsx AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/mobility/measure.mts [out.json]
import { writeFileSync } from "node:fs";
import { INDUSTRY_PACKS } from "../../../../../src/domains/industryPacks.js";
import { PACK_QUESTION_FLOOR, resolveRegulatoryRefParts, validatePackRegulatoryCurrency } from "../../../../../src/domains/packs/regulatorySchema.js";
import { getDeepQuestionsByStation } from "../../../../../src/domains/deepIndustryPacks.js";

const tiers: Record<string, number[]> = {};
for (const p of Object.values(INDUSTRY_PACKS)) for (const q of p.questions) (tiers[p.riskTier] ??= []).push(q.weight);
const tierWeights = Object.fromEntries(
  Object.entries(tiers).map(([t, w]) => {
    const s = [...w].sort((a, b) => a - b);
    return [t, { n: s.length, min: s[0], p10: s[Math.floor(s.length * 0.1)], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] }];
  })
);

const packs = Object.values(INDUSTRY_PACKS).filter((p) => p.stationId === "mobility");
const report = packs.map((p) => {
  const dims: Record<string, number> = {};
  const wByDim: Record<string, number> = {};
  const parts: Record<string, number> = {};
  const multi: string[] = [];
  for (const q of p.questions) {
    dims[q.dimension] = (dims[q.dimension] ?? 0) + 1;
    wByDim[q.dimension] = (wByDim[q.dimension] ?? 0) + q.weight;
    const resolved = resolveRegulatoryRefParts(q.regulatoryRef);
    for (const r of resolved) {
      const s = r.instrument ? r.instrument.status : "unresolved";
      parts[s] = (parts[s] ?? 0) + 1;
    }
    const anchors = new Set(resolved.map((r) => r.instrument?.id ?? `?${r.part.split(/[ ,(§]/)[0]}:${r.part}`));
    if (anchors.size > 1) multi.push(`${q.id}: ${q.regulatoryRef}`);
  }
  const weights = p.questions.map((q) => q.weight);
  const total = weights.reduce((a, b) => a + b, 0);
  const largest = Math.max(...Object.values(wByDim));
  return {
    id: p.id,
    riskTier: p.riskTier,
    n: p.questions.length,
    floor: PACK_QUESTION_FLOOR,
    meetsFloor: p.questions.length >= PACK_QUESTION_FLOOR,
    ids: p.questions.map((q) => q.id),
    weightTotal: total,
    weightMin: Math.min(...weights),
    weightMax: Math.max(...weights),
    dimensions: dims,
    dimensionCount: Object.keys(dims).length,
    largestDimensionShareOfWeightPct: Math.round((1000 * largest) / total) / 10,
    refParts: parts,
    multiInstrumentRefs: multi,
    validatorErrors: validatePackRegulatoryCurrency(p, new Date("2026-10-04")),
  };
});

const out = { tierWeights, packs: report, deepMobility: getDeepQuestionsByStation("mobility").map((q) => q.id) };
const target = process.argv[2];
if (target) writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
else console.log(JSON.stringify(out, null, 2));
