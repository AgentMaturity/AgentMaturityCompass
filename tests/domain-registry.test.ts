import { describe, expect, test } from "vitest";
import { getAssurancePack } from "../src/assurance/packs/index.js";
import { INDUSTRY_PACK_MANIFEST } from "../src/assurance/packs/industryPackManifest.js";
import { runDomainAssurance } from "../src/domains/domainCliIntegration.js";
import { getDomainMetadata, listDomainIds, listDomainMetadata, parseDomain } from "../src/domains/domainRegistry.js";

describe("domain registry", () => {
  test("contains exactly 7 domains", () => {
    const ids = listDomainIds();
    expect(ids.length).toBe(7);
    expect(ids).toEqual([
      "health",
      "education",
      "environment",
      "mobility",
      "governance",
      "technology",
      "wealth"
    ]);
  });

  test("metadata is complete for each domain", () => {
    const domains = listDomainMetadata();
    for (const domain of domains) {
      expect(domain.name.length).toBeGreaterThan(0);
      expect(domain.description.length).toBeGreaterThan(0);
      expect(domain.regulatoryBasis.length).toBeGreaterThan(0);
      expect(domain.aliases.length).toBeGreaterThan(0);
      expect(domain.sectorTags.length).toBeGreaterThan(0);
      expect(domain.recommendedIndustryPacks.length).toBeGreaterThan(0);
      expect(domain.assurancePacks.length).toBeGreaterThan(0);
      expect(domain.primaryModules.length).toBeGreaterThan(0);
      expect(domain.questionCount).toBeGreaterThan(0);
    }
  });

  test("health and technology metadata expose expected regulatory anchors", () => {
    const health = getDomainMetadata("health");
    const technology = getDomainMetadata("technology");

    expect(health.regulatoryBasis).toContain("HIPAA");
    expect(health.questionCount).toBe(9);

    expect(technology.regulatoryBasis).toContain("GDPR");
    expect(technology.euAIActCategory).toBe("general-purpose");
    expect(technology.questionCount).toBe(6);
  });

  test("wealth absorbs financial services regulatory basis", () => {
    const wealth = getDomainMetadata("wealth");
    expect(wealth.regulatoryBasis).toContain("SR 11-7");
    expect(wealth.regulatoryBasis).toContain("MiFID II");
    expect(wealth.questionCount).toBeGreaterThan(6);
  });

  test("mobility absorbs safety-critical regulatory basis", () => {
    const mobility = getDomainMetadata("mobility");
    expect(mobility.regulatoryBasis).toContain("IEC 61508");
    expect(mobility.regulatoryBasis).toContain("ISO 26262");
    expect(mobility.questionCount).toBeGreaterThan(6);
  });

  test("supply chain and logistics aliases resolve to discoverable canonical domains", () => {
    const environment = getDomainMetadata("environment");
    const mobility = getDomainMetadata("mobility");

    expect(environment.aliases).toEqual(expect.arrayContaining(["supply-chain", "scm"]));
    expect(environment.sectorTags).toContain("supply-chain");
    expect(environment.recommendedIndustryPacks).toEqual(expect.arrayContaining(["farm-to-fork", "material-to-machines"]));
    expect(parseDomain("supply chain")).toBe("environment");
    expect(parseDomain("SCM")).toBe("environment");

    expect(mobility.aliases).toEqual(expect.arrayContaining(["logistics", "freight", "3pl", "warehouse"]));
    expect(mobility.sectorTags).toContain("carrier-management");
    expect(mobility.recommendedIndustryPacks).toContain("sustainable-ports");
    expect(parseDomain("logistics")).toBe("mobility");
    expect(parseDomain("third_party_logistics")).toBe("mobility");
  });

  // This smoke grades a built-in canned response, never an agent. It used to
  // assert that the canned text passed every pack, i.e. that synthetic text was
  // passing evidence (execution brief section 2). Industry packs now refuse it,
  // so the smoke asserts the refusal is reported as "not evaluated" and that
  // every linked pack and scenario still runs through the pipeline.
  test("built-in domain assurance smoke runs every linked pack and reports refused canned input as not evaluated", () => {
    const industryPacks = new Set(INDUSTRY_PACK_MANIFEST.map((entry) => entry.id));
    for (const domain of listDomainIds()) {
      const run = runDomainAssurance(`domain-smoke-${domain}`, domain);
      const detail = `${domain}: ${JSON.stringify(run.packRuns)}`;
      expect(run.packRuns.map((pack) => pack.packId), detail).toEqual(getDomainMetadata(domain).assurancePacks);
      for (const pack of run.packRuns) {
        expect(pack.scenarioCount, detail).toBe(getAssurancePack(pack.packId).scenarios.length);
        expect(pack.scenarioCount, detail).toBeGreaterThan(0);
        expect(pack.passed + pack.failed + pack.notEvaluated, detail).toBe(pack.scenarioCount);
        if (industryPacks.has(pack.packId)) {
          expect({ passed: pack.passed, failed: pack.failed, notEvaluated: pack.notEvaluated }, detail).toEqual({
            passed: 0,
            failed: 0,
            notEvaluated: pack.scenarioCount
          });
        }
      }
      expect(run.totalScenarios, detail).toBe(run.packRuns.reduce((n, pack) => n + pack.scenarioCount, 0));
      expect(run.passed + run.failed + run.notEvaluated, detail).toBe(run.totalScenarios);
      expect(run.notEvaluated, detail).toBeGreaterThan(0);
      expect(run.agentInvoked).toBe(false);
      expect(run.responseSource).toBe("built-in-synthetic");
      expect(run.allPassed).toBe(false);
    }
  });
});
