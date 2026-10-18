import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  getAllDeepIndustryQuestions,
  getDeepIndustryPackStats,
  getDeepQuestionsByStation,
  getDeepQuestionsForPack,
  DEEP_FINANCE_QUESTIONS,
} from "../src/domains/deepIndustryPacks.js";
import { getPackById, listIndustryPackIds } from "../src/domains/industryPacks.js";
import type { Domain } from "../src/domains/domainRegistry.js";

const STATIONS: Domain[] = ["health", "education", "environment", "mobility", "governance", "technology", "wealth"];
const HAND_WRITTEN_STATIONS: Domain[] = ["education", "environment", "mobility", "technology"];
/** Floors: >= 10 hand-written questions per new station, >= 50 per legacy station, >= 190 in total. */
const MIN_PER_STATION: Record<Domain, number> = { health: 50, wealth: 50, governance: 50, education: 10, environment: 10, mobility: 10, technology: 10 };
const MIN_TOTAL = 190;
/** Official / primary-source hosts only (regulators, legislatures, standards bodies). */
const OFFICIAL_HOST = /(^|\.)(europa\.eu|govinfo\.gov|nist\.gov|bis\.org|ftc\.gov|fedramp\.gov|unece\.org|ed\.gov)$/;

describe("deep industry packs — all seven stations", () => {
  test("every station meets its deep-question floor and the total is at least 190", () => {
    for (const station of STATIONS) {
      expect(getDeepQuestionsByStation(station).length, station).toBeGreaterThanOrEqual(MIN_PER_STATION[station]);
    }
    expect(getAllDeepIndustryQuestions().length).toBeGreaterThanOrEqual(MIN_TOTAL);
  });

  test("every deep question links to real industry packs, at least one in its own station", () => {
    const known = new Set<string>(listIndustryPackIds());
    for (const q of getAllDeepIndustryQuestions()) {
      const packIds = q.packIds ?? [];
      expect(packIds.length, `${q.id} has no packIds`).toBeGreaterThan(0);
      const unknown = packIds.filter((id) => !known.has(id));
      expect(unknown, `${q.id} links unknown pack ids`).toEqual([]);
      expect(packIds.some((id) => getPackById(id)?.stationId === q.station), `${q.id} links no pack in station ${q.station}`).toBe(true);
    }
  });

  test("getDeepQuestionsForPack returns exactly the questions that list the pack", () => {
    const forK12 = getDeepQuestionsForPack("k12-pm3");
    expect(forK12.length).toBeGreaterThan(0);
    expect(forK12.every((q) => q.packIds?.includes("k12-pm3"))).toBe(true);
    expect(forK12.map((q) => q.id)).toContain("education-deep-09");
    expect(getDeepQuestionsForPack("not-a-pack")).toEqual([]);
  });

  test("station question files are hand-written, not generated from templates", () => {
    const dir = join(process.cwd(), "src", "domains", "deep");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toContain("Array.from");
    }
  });

  test("stats list all seven stations with counts that add up", () => {
    const stats = getDeepIndustryPackStats();
    const byStation = new Map<string, number>();
    for (const entry of Object.values(stats)) {
      byStation.set(entry.station, (byStation.get(entry.station) ?? 0) + entry.questionCount);
    }
    expect([...byStation.keys()].sort()).toEqual([...STATIONS].sort());
    const total = [...byStation.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(getAllDeepIndustryQuestions().length);
    for (const station of STATIONS) {
      expect(byStation.get(station)).toBe(getDeepQuestionsByStation(station).length);
    }
  });

  test("every deep question cites a regulation with an official https source URL and retrievedAt", () => {
    for (const q of getAllDeepIndustryQuestions()) {
      expect(q.regulation.trim(), q.id).not.toBe("");
      expect(q.section.trim(), q.id).not.toBe("");
      const url = new URL(q.source.url);
      expect(url.protocol, q.id).toBe("https:");
      expect(url.hostname, q.id).toMatch(OFFICIAL_HOST);
      expect(q.source.title.trim(), q.id).not.toBe("");
      expect(q.source.retrievedAt, q.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (!q.source.verified) {
        expect(q.source.note?.trim(), `${q.id} unverified source must say why`).toBeTruthy();
      }
    }
  });

  test("ids are unique and every question keeps five maturity levels", () => {
    const all = getAllDeepIndustryQuestions();
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    for (const q of all) {
      expect(Object.keys(q.levels)).toEqual(["1", "2", "3", "4", "5"]);
      expect(STATIONS).toContain(q.station);
    }
  });

  test("hand-written station questions are distinct provisions, not one template repeated", () => {
    for (const station of HAND_WRITTEN_STATIONS) {
      const qs = getDeepQuestionsByStation(station);
      const anchors = new Set(qs.map((q) => `${q.regulation}|${q.section}`));
      expect(anchors.size, station).toBe(qs.length);
    }
  });

  test("MiFID II best execution no longer cites the deleted RTS 28 venue report", () => {
    for (const q of DEEP_FINANCE_QUESTIONS) {
      expect(q.section, q.id).not.toMatch(/RTS 28/);
    }
  });
});
