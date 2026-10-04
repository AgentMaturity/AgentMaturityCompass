import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getAssurancePack, listAssurancePacks } from "../../src/assurance/packs/index.js";
import {
  INDUSTRY_PACK_MANIFEST,
  INDUSTRY_PACK_MAX_REVIEW_AGE_DAYS
} from "../../src/assurance/packs/industryPackManifest.js";
import { listDomainMetadata } from "../../src/domains/domainRegistry.js";

/**
 * The industry pack source files, named independently of the manifest so that
 * dropping a pack from the manifest is caught rather than silently agreed with.
 */
const INDUSTRY_PACK_FILES = [
  "educationFERPAPack.ts",
  "healthcarePHIPack.ts",
  "hipaaCompliancePack.ts",
  "financialSOXPack.ts",
  "wealthManagementMiFIDPack.ts",
  "pharmaCompliancePack.ts",
  "mobilityFunctionalSafetyPack.ts",
  "environmentalInfraPack.ts",
  "technologyGDPRSOCPack.ts",
  "euAiActArticlePack.ts",
  "globalAIRegulatoryPack.ts",
  "governanceNISTRMFPack.ts",
  "iso42005Pack.ts",
  "legalCompliancePack.ts",
  "safetyCriticalSILPack.ts",
  "realtimeVoiceSafetyPack.ts",
  "sbomSupplyChainPack.ts"
];

/**
 * Station packs the domain registry maps that are outside this manifest's
 * scope. Named here so the gap is visible, not hidden by a looser rule.
 */
const KNOWN_UNMANIFESTED_STATION_PACKS = ["financialModelRisk"];

/** Official or primary-source hosts (execution brief: regulation content rules). */
const OFFICIAL_HOSTS = [
  "eur-lex.europa.eu",
  "ai-act-service-desk.ec.europa.eu",
  "digital-strategy.ec.europa.eu",
  "commission.europa.eu",
  "www.esma.europa.eu",
  "www.govinfo.gov",
  "www.federalregister.gov",
  "www.reginfo.gov",
  "studentprivacy.ed.gov",
  "www.sec.gov",
  "www.fcc.gov",
  "www.ntia.gov",
  "www.nist.gov",
  "www.iso.org",
  "webstore.iec.ch",
  "unece.org",
  "www.aicpa-cima.com",
  "www.americanbar.org",
  "www.uscourts.gov",
  "www.parl.ca",
  "www.camara.leg.br",
  "www.cac.gov.cn"
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

describe("industry pack manifest", () => {
  const packDir = join(__dirname, "..", "..", "src", "assurance", "packs");
  const registered = new Map(listAssurancePacks().map((pack) => [pack.id, pack] as const));
  const manifestIds = INDUSTRY_PACK_MANIFEST.map((entry) => entry.id);

  test("lists every industry pack file, once, by its registered id", () => {
    // stderr, not console: vitest's agent reporter drops console output of passing tests.
    process.stderr.write(`industryPacks=${INDUSTRY_PACK_MANIFEST.length}\n`);
    const files = readdirSync(packDir);
    for (const file of INDUSTRY_PACK_FILES) expect(files).toContain(file);

    expect(new Set(manifestIds).size).toBe(manifestIds.length);
    expect(INDUSTRY_PACK_MANIFEST.map((entry) => entry.file).sort()).toEqual([...INDUSTRY_PACK_FILES].sort());
    for (const entry of INDUSTRY_PACK_MANIFEST) {
      expect(registered.has(entry.id), `${entry.id} is not registered`).toBe(true);
      expect(getAssurancePack(entry.id).scenarios.length).toBeGreaterThan(0);
    }
  });

  test("covers every pack a station maps, except the named out-of-scope ones", () => {
    for (const domain of listDomainMetadata()) {
      for (const packId of domain.assurancePacks) {
        if (KNOWN_UNMANIFESTED_STATION_PACKS.includes(packId)) continue;
        const entry = INDUSTRY_PACK_MANIFEST.find((row) => row.id === packId);
        expect(entry, `${domain.id} maps ${packId}, which the manifest omits`).toBeDefined();
        // A pack shared across stations is cross-framework; otherwise it names its station.
        expect([domain.id, "cross-framework"]).toContain(entry!.station);
      }
    }
  });

  test.each(INDUSTRY_PACK_MANIFEST)("$id is current and cites official sources", (entry) => {
    expect(entry.lastReviewed).toMatch(ISO_DATE);
    const ageDays = (Date.now() - Date.parse(`${entry.lastReviewed}T00:00:00Z`)) / DAY_MS;
    expect(ageDays, `${entry.id} review is stale`).toBeLessThanOrEqual(INDUSTRY_PACK_MAX_REVIEW_AGE_DAYS);
    expect(ageDays).toBeGreaterThanOrEqual(-1);

    expect(entry.regulations.length).toBeGreaterThanOrEqual(1);
    for (const regulation of entry.regulations) {
      const url = new URL(regulation.url);
      expect(url.protocol).toBe("https:");
      expect(OFFICIAL_HOSTS, `${entry.id}: ${regulation.url}`).toContain(url.hostname);
      if (regulation.status === "unverified") {
        expect(regulation.note, `${entry.id}: say why ${regulation.instrument} is unverified`).toBeTruthy();
      } else {
        expect(regulation.retrievedAt, `${entry.id}: ${regulation.instrument}`).toMatch(ISO_DATE);
      }
    }
  });
});
