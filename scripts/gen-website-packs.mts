// Generates website/industry-packs.json (what the home page's "start from your industry" picker shows) and the seven
// website/station-<id>.html pages, from the pack registry. The website never carries pack facts by hand.
//
// Usage: npx tsx scripts/gen-website-packs.mts [--check]
//   --check  exit 1 when a file differs from a fresh render (drift), 0 when all are equal
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMAIN_REGISTRY, type Domain } from "../src/domains/domainRegistry.js";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { renderStationPage, type WebsiteStation } from "./website-station-pages.mjs";

const WEBSITE = resolve(fileURLToPath(new URL("..", import.meta.url)), "website");

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

/** Every generated file under website/, keyed by its name there. */
export function renderWebsiteFiles(): Map<string, string> {
  const json = renderWebsitePacks();
  const stations = (JSON.parse(json) as { stations: WebsiteStation[] }).stations;
  const files = new Map([["industry-packs.json", json]]);
  for (const station of stations.filter((s) => s.packs.length > 0)) {
    files.set(`station-${station.id}.html`, renderStationPage(station, stations));
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const stale: string[] = [];
  for (const [name, fresh] of renderWebsiteFiles()) {
    const path = resolve(WEBSITE, name);
    if (!check) writeFileSync(path, fresh);
    else if (!existsSync(path) || readFileSync(path, "utf8") !== fresh) stale.push(`website/${name}`);
  }
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.join(", ")}. Regenerate: npm run gen-website-packs`);
    process.exit(1);
  }
  console.log(check ? "website/industry-packs.json and the station pages match the pack registry" : `wrote ${WEBSITE}/industry-packs.json and the station pages`);
}
