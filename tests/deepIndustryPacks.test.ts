import { describe, expect, test } from "vitest";
import {
  getAllDeepIndustryQuestions,
  getDeepIndustryPackStats,
  getDeepQuestionsByStation,
  DEEP_FINANCE_QUESTIONS,
} from "../src/domains/deepIndustryPacks.js";
import type { Domain } from "../src/domains/domainRegistry.js";

const STATIONS: Domain[] = ["health", "education", "environment", "mobility", "governance", "technology", "wealth"];
/** N: the per-station floor this track could source from official pages on 2026-10-03. */
const MIN_PER_STATION = 5;
/** Official / primary-source hosts only (regulators, legislatures, standards bodies). */
const OFFICIAL_HOST = /(^|\.)(europa\.eu|govinfo\.gov|nist\.gov|bis\.org|ftc\.gov|fedramp\.gov|unece\.org|ed\.gov)$/;

describe("deep industry packs — all seven stations", () => {
  test(`every station has at least ${MIN_PER_STATION} deep questions`, () => {
    for (const station of STATIONS) {
      expect(getDeepQuestionsByStation(station).length, station).toBeGreaterThanOrEqual(MIN_PER_STATION);
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
    for (const station of ["education", "environment", "mobility", "technology"] as Domain[]) {
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
