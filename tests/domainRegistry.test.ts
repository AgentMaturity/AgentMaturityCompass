import { describe, expect, test } from "vitest";
import { listAssurancePacks } from "../src/assurance/packs/index.js";
import { INDUSTRY_PACK_MANIFEST } from "../src/assurance/packs/industryPackManifest.js";
import {
  DOMAIN_REGISTRY,
  INDUSTRY_ASSURANCE_PACK_IDS,
  INDUSTRY_ASSURANCE_PACK_STATIONS,
  getIndustryAssurancePacksForStation,
  listDomainIds,
  listIndustryAssurancePackStations,
  listUnmappedIndustryAssurancePacks
} from "../src/domains/domainRegistry.js";

/** The 17 industry packs the evidence planner measured at 8f57ce63 (9 of them reachable only by id). */
const PLANNER_MEASURED_INDUSTRY_PACKS = [
  "educationFERPA",
  "healthcarePHI",
  "hipaaCompliance",
  "financialSOX",
  "wealthManagementMiFID",
  "pharmaCompliance",
  "mobilityFunctionalSafety",
  "environmentalInfra",
  "technologyGDPRSOC",
  "euAiActArticle",
  "globalAIRegulatory",
  "governanceNISTRMF",
  "iso42005ImpactAssessment",
  "legalCompliance",
  "safetyCriticalSIL",
  "realtime-voice-safety",
  "sbom-supply-chain"
];

describe("industry assurance pack to station registry", () => {
  test("every industry assurance pack id is a registered assurance pack", () => {
    const registered = new Set(listAssurancePacks().map((pack) => pack.id));
    for (const packId of INDUSTRY_ASSURANCE_PACK_IDS) {
      expect(registered.has(packId), `${packId} is not a registered assurance pack`).toBe(true);
    }
  });

  test("the planner's 17 industry packs are all tracked by the registry", () => {
    for (const packId of PLANNER_MEASURED_INDUSTRY_PACKS) {
      expect(INDUSTRY_ASSURANCE_PACK_IDS as readonly string[]).toContain(packId);
    }
  });

  test("every industry assurance pack maps to at least one station (unmappedIndustryPacks=0)", () => {
    const unmapped = listUnmappedIndustryAssurancePacks();
    console.log(`unmappedIndustryPacks=${unmapped.length}${unmapped.length > 0 ? ` (${unmapped.join(", ")})` : ""}`);
    expect(unmapped).toEqual([]);
    for (const packId of INDUSTRY_ASSURANCE_PACK_IDS) {
      expect(listIndustryAssurancePackStations(packId).length, packId).toBeGreaterThan(0);
    }
  });

  test("the industry pack manifest labels each pack with a mapped station, or cross-framework only for two or more", () => {
    for (const entry of INDUSTRY_PACK_MANIFEST) {
      const stations = listIndustryAssurancePackStations(entry.id);
      if (entry.station === "cross-framework") expect(stations.length, entry.id).toBeGreaterThanOrEqual(2);
      else expect(stations, entry.id).toContain(entry.station);
    }
  });

  test("every mapping names known stations with a one-line rationale and a source", () => {
    const stations = new Set<string>(listDomainIds());
    for (const packId of INDUSTRY_ASSURANCE_PACK_IDS) {
      const mapping = INDUSTRY_ASSURANCE_PACK_STATIONS[packId];
      expect(mapping.stations.length, packId).toBeGreaterThan(0);
      for (const station of mapping.stations) {
        expect(stations.has(station), `${packId} -> ${station}`).toBe(true);
      }
      expect(mapping.rationale.trim().length, `${packId} rationale`).toBeGreaterThan(20);
      expect(mapping.rationale.includes("\n"), `${packId} rationale must be one line`).toBe(false);
      expect(mapping.source.trim().length, `${packId} source`).toBeGreaterThan(10);
      expect(/read 2026-10-03|unverified/.test(mapping.source), `${packId} source must say what was read or that it is unverified`).toBe(true);
    }
  });

  test("the map agrees with each station's own assurancePacks list", () => {
    for (const domain of listDomainIds()) {
      for (const packId of DOMAIN_REGISTRY[domain].assurancePacks) {
        expect(INDUSTRY_ASSURANCE_PACK_IDS as readonly string[], `${domain}.assurancePacks has ${packId}`).toContain(packId);
        expect(listIndustryAssurancePackStations(packId), `${packId} must include ${domain}`).toContain(domain);
      }
    }
  });

  test("previously unreachable packs are now reachable through their stations", () => {
    const health = getIndustryAssurancePacksForStation("health").map((entry) => entry.packId);
    expect(health).toEqual(expect.arrayContaining(["hipaaCompliance", "pharmaCompliance", "euAiActArticle"]));
    const wealth = getIndustryAssurancePacksForStation("wealth").map((entry) => entry.packId);
    expect(wealth).toEqual(expect.arrayContaining(["financialSOX", "legalCompliance", "iso42005ImpactAssessment", "realtime-voice-safety"]));
    const technology = getIndustryAssurancePacksForStation("technology").map((entry) => entry.packId);
    expect(technology).toEqual(expect.arrayContaining(["globalAIRegulatory", "sbom-supply-chain", "realtime-voice-safety"]));
    expect(listIndustryAssurancePackStations("euAiActArticle")).not.toContain("technology");
  });
});
