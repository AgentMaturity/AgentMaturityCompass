// Measures per-pack question count, weight range and dimension balance for the health station.
import { writeFileSync } from "node:fs";
import { getIndustryPacksByStation } from "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-2/src/domains/industryPacks.ts";
import { resolveRegulatoryRefParts } from "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-2/src/domains/packs/regulatorySchema.ts";
const out: Record<string, unknown> = {};
let parts = 0, resolved = 0, verified = 0;
for (const pack of getIndustryPacksByStation("health")) {
  const total = pack.questions.reduce((s, q) => s + q.weight, 0);
  const dims: Record<string, { count: number; weight: number; weightShare: number }> = {};
  for (const q of pack.questions) {
    const d = (dims[q.dimension] ??= { count: 0, weight: 0, weightShare: 0 });
    d.count++; d.weight += q.weight;
    for (const p of resolveRegulatoryRefParts(q.regulatoryRef)) {
      parts++; if (p.instrument) { resolved++; if (p.instrument.status !== "unverified") verified++; }
    }
  }
  for (const d of Object.values(dims)) d.weightShare = Math.round((d.weight / total) * 1000) / 1000;
  const largest = Object.entries(dims).sort((a, b) => b[1].weightShare - a[1].weightShare)[0]!;
  const weights = pack.questions.map((q) => q.weight);
  out[pack.id] = { riskTier: pack.riskTier, n: pack.questions.length, totalWeight: total, weightRange: [Math.min(...weights), Math.max(...weights)], dimensions: dims, largest: { dimension: largest[0], weightShare: largest[1].weightShare } };
}
out._refParts = { parts, resolved, resolvedNonUnverified: verified };
writeFileSync(process.argv[2]!, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out._refParts));
