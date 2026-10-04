import { readFileSync, writeFileSync } from "node:fs";
import { resolveRegulatoryRefParts, toRegulatoryReference, validatePackRegulatoryCurrency } from "/Users/sid/AgentMaturityCompass/.claude/worktrees/wf_b05b1ca6-169-4/src/domains/packs/regulatorySchema.js";

const packs = JSON.parse(readFileSync(process.argv[2], "utf8"));
const status: Record<string, number> = {};
let resolved = 0, unresolved = 0;
const perQuestion: Record<string, unknown> = {};
const unresolvedParts: string[] = [];
for (const pack of Object.values(packs) as any[]) {
  for (const q of pack.questions) {
    const parts = resolveRegulatoryRefParts(q.regulatoryRef);
    perQuestion[q.id] = parts.map(({ part, instrument }) => ({ ...toRegulatoryReference(part), verified: !!instrument && instrument.status !== "unverified" }));
    for (const { part, instrument } of parts) {
      const s = instrument ? instrument.status : "unverified";
      status[s] = (status[s] ?? 0) + 1;
      if (instrument) resolved++; else { unresolved++; unresolvedParts.push(`${q.id}: ${part}`); }
    }
  }
}
const errors = (Object.values(packs) as any[]).flatMap((p) => validatePackRegulatoryCurrency(p, new Date("2026-10-04T00:00:00Z")));
writeFileSync(process.argv[3], JSON.stringify({ resolved, unresolved, status, unresolvedParts, errors, perQuestion }, null, 1));
console.log(JSON.stringify({ resolved, unresolved, status, errors }));
console.log(unresolvedParts.join("\n"));
