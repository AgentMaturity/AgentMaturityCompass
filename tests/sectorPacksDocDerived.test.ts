import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { listIndustryPacks, getStationSummary } from "../src/domains/industryPacks.js";
import type { Domain } from "../src/domains/domainRegistry.js";

describe("docs/SECTOR_PACKS.md derived counts", () => {
  const doc = readFileSync(join(process.cwd(), "docs", "SECTOR_PACKS.md"), "utf8");
  const packs = listIndustryPacks();
  const sectorQuestions = packs.reduce((n, p) => n + p.questions.length, 0);

  test("states the base question count once, equal to questionBank.length, with its derivation command", () => {
    expect(doc).toContain(`${questionBank.length}-question base AMC rubric`);
    expect(doc).toContain("questionBank.length");
    expect(doc).not.toMatch(/\b138\b/);
  });

  test("sector totals are not restated, station headings match the registry, and the composite formula matches the engine", () => {
    expect(doc).toContain("## The 7 Stations\n");
    // Totals are reported by the registry, not restated; per-station headings must match the registry.
    expect(doc).not.toMatch(new RegExp(`\\b${packs.length} (sector )?packs\\b`, "i"));
    expect(doc).not.toMatch(new RegExp(`\\b(${sectorQuestions}|390) questions\\b`, "i"));
    const headings = [...doc.matchAll(/^### \S+ (\w+) \((\d+) packs\)$/gm)];
    expect(headings.length).toBe(7);
    for (const [, name, count] of headings) {
      expect(Number(count), name).toBe(getStationSummary(name!.toLowerCase() as Domain).packCount);
    }
    // The getStationSummary example names its fields without restating counts that change with the registry.
    expect(doc).toContain('// { stationId: "governance", packCount, totalQuestions, frameworks: [...] }');
    expect(doc).not.toMatch(/totalQuestions: \d+/);
    expect(doc).not.toContain("× 0.5");
    expect(doc).toContain("Composite Score = round(base_score × 0.6 + domain_score × 0.4)");
  });
});
