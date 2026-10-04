// Measures the wealth station packs. Run from the repo root: npx tsx <this file>
import { listIndustryPacks } from "../../../../../src/domains/industryPacks.js";
import { resolveRegulatoryRefParts, validatePackRegulatoryCurrency, PACK_QUESTION_FLOOR } from "../../../../../src/domains/packs/regulatorySchema.js";

const out: Record<string, unknown> = {};
for (const pack of listIndustryPacks().filter((p) => p.stationId === "wealth")) {
  const qs = pack.questions;
  const dims: Record<string, number> = {};
  const hist: Record<string, number> = {};
  for (const q of qs) {
    dims[q.dimension] = (dims[q.dimension] ?? 0) + 1;
    hist[q.weight] = (hist[q.weight] ?? 0) + 1;
  }
  const parts = qs.flatMap((q) => resolveRegulatoryRefParts(q.regulatoryRef));
  const weights = qs.map((q) => q.weight);
  out[pack.id] = {
    riskTier: pack.riskTier,
    questions: qs.length,
    floor: PACK_QUESTION_FLOOR,
    meetsFloor: qs.length >= PACK_QUESTION_FLOOR,
    weightTotal: weights.reduce((a, b) => a + b, 0),
    weightMin: Math.min(...weights),
    weightMax: Math.max(...weights),
    weightHistogram: hist,
    dimensions: dims,
    dimensionCount: Object.keys(dims).length,
    largestDimensionShare: Math.round((Math.max(...Object.values(dims)) / qs.length) * 1000) / 1000,
    refParts: parts.length,
    refPartsByStatus: parts.reduce<Record<string, number>>((acc, p) => {
      const k = p.instrument?.status ?? "unresolved";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    validatorErrors: validatePackRegulatoryCurrency(pack, new Date("2026-10-04T00:00:00Z")),
    ids: qs.map((q) => q.id),
  };
}
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
