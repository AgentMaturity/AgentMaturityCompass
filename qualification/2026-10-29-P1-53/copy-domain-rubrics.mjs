// One-off P1-53 migration, run once against the pre-change build (base cafe5751f): copies the 61 rubric questions
// from dist/score/domainPacks.js into catalog/questionnaires/domain-rubrics.yaml, keeping ids, order, text,
// descriptors and weights. Kept here as provenance; after P1-53 the YAML is the only copy and this script has no input.
// Usage: node qualification/2026-10-29-P1-53/copy-domain-rubrics.mjs <repo root>
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";

const root = process.argv[2] ?? process.cwd();
const rubric = await import(pathToFileURL(join(root, "dist/score/domainPacks.js")).href);
const items = rubric.listDomainPacks().flatMap(({ pack }) => rubric.getDomainPackQuestions(pack).map((q) => ({
  id: q.id,
  station: pack,
  source: "domain_rubric",
  dimension: q.dimension,
  text: q.text,
  legacyRef: { text: q.regulatoryRef, verified: false },
  evidenceRequired: q.evidenceRequired,
  levelDescriptors: { l1: q.l1, l3: q.l3, l5: q.l5 },
  weight: q.weight,
  mapsTo: [],
  claimKind: "self_reported"
})));
const header = [
  "# Domain rubric questionnaire (P1-53): the seven station rubrics, moved here from src/score/domainPacks.ts.",
  "# Self-reported questionnaire items: answers come from producer amc.questionnaire and support L1 at most.",
  "# legacyRef is copied verbatim and is never a catalog citation (P0-24 corrects superseded instruments).",
  "# mapsTo stays empty until a named reviewer maps an item to a catalog control (P1-34).",
  ""
].join("\n");
const body = YAML.stringify({ id: "domain-rubrics", title: "Domain rubric questionnaire", items }, { lineWidth: 0 });
writeFileSync(join(root, "catalog/questionnaires/domain-rubrics.yaml"), header + body);
console.log(`wrote ${items.length} items`);
