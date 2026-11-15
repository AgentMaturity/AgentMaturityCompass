// Generates website/industry-packs.json: what the home page's "start from your industry" picker shows, from the pack
// registry. The website never carries pack facts by hand.
//
// Usage: npx tsx scripts/gen-website-packs.mts [--check]
//   --check  exit 1 when the file differs from a fresh render (drift), 0 when it is equal
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMAIN_REGISTRY, type Domain } from "../src/domains/domainRegistry.js";
import { listIndustryPacks } from "../src/domains/industryPacks.js";

const FILE = resolve(fileURLToPath(new URL("..", import.meta.url)), "website/industry-packs.json");

/** The picker's data: every station in registry order, and each pack's own name, summary, risk tier, rules and risks. */
export function renderWebsitePacks(): string {
  const packs = listIndustryPacks();
  const stations = (Object.keys(DOMAIN_REGISTRY) as Domain[]).map((id) => ({
    id,
    name: DOMAIN_REGISTRY[id].name,
    packs: packs.filter((pack) => pack.stationId === id).map((pack) => ({
      id: pack.id,
      name: pack.name,
      summary: pack.description,
      riskTier: pack.riskTier,
      questions: pack.questions.length,
      rules: pack.regulatoryBasis,
      risks: pack.keyRisks
    }))
  }));
  return `${JSON.stringify({ packCount: packs.length, stations }, null, 1)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fresh = renderWebsitePacks();
  if (process.argv.includes("--check")) {
    if (readFileSync(FILE, "utf8") !== fresh) {
      console.error("website/industry-packs.json is out of date. Regenerate: npx tsx scripts/gen-website-packs.mts");
      process.exit(1);
    }
    console.log("website/industry-packs.json matches the pack registry");
  } else {
    writeFileSync(FILE, fresh);
    console.log(`wrote ${FILE}`);
  }
}
