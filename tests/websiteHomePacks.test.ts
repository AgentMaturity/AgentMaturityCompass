import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderWebsitePacks } from "../scripts/gen-website-packs.mjs";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");
/** The `RISK_TIER = { ... }` object literal in a script, parsed as JSON once its keys are quoted. */
const riskTierOf = (path: string): Record<string, string> => {
  const literal = read(path).match(/RISK_TIER = (\{[^}]*\})/)?.[1];
  expect(literal, path).toBeDefined();
  return JSON.parse(literal!.replace(/'/g, '"').replace(/([{,]\s*)([a-z][\w-]*)\s*:/g, '$1"$2":'));
};

describe("the home page's industry picker", () => {
  test("website/industry-packs.json is exactly what the pack registry renders (npm run gen-website-packs)", () => {
    expect(read("website/industry-packs.json")).toBe(renderWebsitePacks());
  });

  test("without the pack list, the picker's chips are links to every industry page, named and ordered as the registry", () => {
    const data = JSON.parse(read("website/industry-packs.json")) as { stations: Array<{ id: string; name: string }> };
    const chips = [...read("website/index.html").matchAll(/<a class="chip" href="station-([a-z]+)\.html">([^<]+)<\/a>/g)].map((m) => ({ id: m[1], name: m[2] }));
    expect(chips).toEqual(data.stations.map(({ id, name }) => ({ id, name })));
  });

  test("the picker maps a pack's risk tier the same way the console does when a project starts from that pack", () => {
    const site = riskTierOf("website/home.js");
    expect(site).toEqual(riskTierOf("src/console/assets/a4Pack.js"));
    const data = JSON.parse(read("website/industry-packs.json")) as { stations: Array<{ packs: Array<{ riskTier: string }> }> };
    for (const pack of data.stations.flatMap((station) => station.packs)) expect(site, pack.riskTier).toHaveProperty([pack.riskTier]);
  });
});
