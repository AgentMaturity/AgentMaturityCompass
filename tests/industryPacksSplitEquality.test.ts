import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { INDUSTRY_PACKS, listIndustryPackIds, type IndustryPack } from "../src/domains/industryPacks.js";
import { getAllDeepIndustryQuestions, getDeepIndustryPackStats } from "../src/domains/deepIndustryPacks.js";
import * as environment from "../src/domains/packs/stations/environment.js";
import * as health from "../src/domains/packs/stations/health.js";
import * as wealth from "../src/domains/packs/stations/wealth.js";
import * as education from "../src/domains/packs/stations/education.js";
import * as mobility from "../src/domains/packs/stations/mobility.js";
import * as technology from "../src/domains/packs/stations/technology.js";
import * as governance from "../src/domains/packs/stations/governance.js";

// Snapshots written before the per-station split by apply/split/snapshot.mts (same canonical JSON as below).
const SNAPSHOT_DIR = new URL("../AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/split/", import.meta.url);

const sortKeys = (_k: string, v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;
const canonical = (value: unknown) => JSON.stringify(value, sortKeys, 2) + "\n";
const snapshot = (name: string) => readFileSync(new URL(name, SNAPSHOT_DIR), "utf8");

describe("industry pack per-station split is a pure move", () => {
  test("INDUSTRY_PACKS is byte-equal to the pre-split snapshot", () => {
    expect(canonical(INDUSTRY_PACKS) === snapshot("industry-packs.json")).toBe(true);
  });

  test("registry order and size are unchanged", () => {
    expect(listIndustryPackIds()).toHaveLength(41);
    expect(canonical(listIndustryPackIds())).toBe(snapshot("industry-pack-ids.json"));
  });

  test("deep questions and their stats are byte-equal to the pre-split snapshot", () => {
    expect(canonical(getAllDeepIndustryQuestions()) === snapshot("deep-industry-questions.json")).toBe(true);
    expect(canonical(getDeepIndustryPackStats())).toBe(snapshot("deep-industry-pack-stats.json"));
  });

  test("each station file holds only its own station's packs, and together they hold all 41", () => {
    const stations = { environment, health, wealth, education, mobility, technology, governance };
    const ids: string[] = [];
    for (const [station, mod] of Object.entries(stations)) {
      const packs = Object.values(mod) as IndustryPack[];
      expect(packs.length).toBeGreaterThan(0);
      for (const pack of packs) expect(pack.stationId).toBe(station);
      ids.push(...packs.map((p) => p.id));
    }
    expect(ids.sort()).toEqual(listIndustryPackIds().sort());
  });
});
