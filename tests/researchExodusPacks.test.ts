import { describe, expect, it } from "vitest";
import { getAssurancePack, listAssurancePacks } from "../src/assurance/packs/index.js";
import type { AssurancePromptContext } from "../src/assurance/validators.js";

const context: AssurancePromptContext = {
  agentId: "agent-safety-research",
  agentName: "AI Safety Research Agent",
  role: "safety-researcher",
  domain: "ai-safety",
  primaryTasks: [
    "evaluate AI safety properties",
    "assess alignment behaviors",
    "test capability thresholds",
    "assess organizational safety culture",
  ],
  stakeholders: ["safety board", "regulators", "researchers", "operators"],
  riskTier: "high",
};

// All 9 new research gap packs
const NEW_PACKS = [
  { id: "replicationResistance", title: "Replication Resistance", minScenarios: 5 },
  { id: "dynamicTrustAuthorization", title: "Dynamic Trust Authorization", minScenarios: 4 },
  { id: "temporalConsistency", title: "Temporal Consistency", minScenarios: 4 },
  { id: "evalAwareBehavior", title: "Eval-Aware Behavior", minScenarios: 4 },
  { id: "capabilityElicitation", title: "Capability Elicitation", minScenarios: 4 },
  { id: "rspCompliance", title: "RSP Compliance", minScenarios: 4 },
  { id: "redTeamCoverage", title: "Red Team Coverage", minScenarios: 4 },
  { id: "mechanisticTransparency", title: "Mechanistic Transparency", minScenarios: 4 },
  { id: "benchmarkTracking", title: "Safety-Critical Benchmark Tracking", minScenarios: 5 },
];

// 10 deepened packs (researcher exodus + content provenance)
const DEEPENED_PACKS = [
  { id: "cbrnCapability", title: "CBRN Capability Assessment", minScenarios: 7 },
  { id: "safetyCulture", title: "Safety Culture Assessment", minScenarios: 8 },
  { id: "whistleblowerProtection", title: "Whistleblower Protection Assessment", minScenarios: 8 },
  { id: "militaryDualUse", title: "Military & Dual-Use AI Governance", minScenarios: 8 },
  { id: "aiTrustExploitation", title: "AI-to-AI Trust Exploitation", minScenarios: 8 },
  { id: "modelTheftExfil", title: "Model Theft & Weight Exfiltration", minScenarios: 8 },
  { id: "emergentCapability", title: "Emergent Capability Assessment", minScenarios: 8 },
  { id: "contentProvenance", title: "Content Provenance & Output Signing", minScenarios: 8 },
  { id: "alignmentFaking", title: "Alignment Faking", minScenarios: 4 },
  { id: "sandbagging", title: "Sandbagging", minScenarios: 4 },
];

const ALL_PACKS = [...NEW_PACKS, ...DEEPENED_PACKS];

describe("research exodus packs — registration", () => {
  it("all 9 new packs are registered in the pack registry", () => {
    const ids = listAssurancePacks().map((pack) => pack.id);
    for (const pack of NEW_PACKS) {
      expect(ids, `Expected pack ${pack.id} to be registered`).toContain(pack.id);
    }
  });

  it("all 10 deepened packs are registered in the pack registry", () => {
    const ids = listAssurancePacks().map((pack) => pack.id);
    for (const pack of DEEPENED_PACKS) {
      expect(ids, `Expected pack ${pack.id} to be registered`).toContain(pack.id);
    }
  });
});

describe("research exodus packs — scenario coverage", () => {
  for (const packDef of ALL_PACKS) {
    describe(packDef.id, () => {
      it(`has at least ${packDef.minScenarios} scenarios`, () => {
        const pack = getAssurancePack(packDef.id);
        expect(pack.scenarios.length).toBeGreaterThanOrEqual(packDef.minScenarios);
      });

      it("all scenarios have required fields", () => {
        const pack = getAssurancePack(packDef.id);
        for (const scenario of pack.scenarios) {
          expect(scenario.id, `Scenario missing id in pack ${packDef.id}`).toBeTruthy();
          expect(scenario.title, `Scenario ${scenario.id} missing title`).toBeTruthy();
          expect(scenario.category, `Scenario ${scenario.id} missing category`).toBeTruthy();
          expect(scenario.riskTier, `Scenario ${scenario.id} missing riskTier`).toBeTruthy();
          expect(
            typeof scenario.buildPrompt,
            `Scenario ${scenario.id} buildPrompt not a function`
          ).toBe("function");
          expect(
            typeof scenario.validate,
            `Scenario ${scenario.id} validate not a function`
          ).toBe("function");
        }
      });

      it("buildPrompt produces non-empty output", () => {
        const pack = getAssurancePack(packDef.id);
        for (const scenario of pack.scenarios) {
          const prompt = scenario.buildPrompt(context);
          expect(
            prompt.length,
            `Scenario ${scenario.id} buildPrompt returned short output`
          ).toBeGreaterThan(50);
        }
      });

      it("validate function returns a ValidationResult", () => {
        const pack = getAssurancePack(packDef.id);
        for (const scenario of pack.scenarios) {
          const result = scenario.validate("This is a test response about safety, protection, and refusing harmful requests.");
          expect(result).toHaveProperty("pass");
          expect(result).toHaveProperty("reasons");
          expect(result).toHaveProperty("auditTypes");
          expect(typeof result.pass).toBe("boolean");
          expect(Array.isArray(result.reasons)).toBe(true);
          expect(Array.isArray(result.auditTypes)).toBe(true);
        }
      });

      it("has non-empty description", () => {
        const pack = getAssurancePack(packDef.id);
        expect(pack.description).toBeTruthy();
        expect(pack.description.length).toBeGreaterThan(50);
      });

      it("has non-empty title", () => {
        const pack = getAssurancePack(packDef.id);
        expect(pack.title).toBeTruthy();
      });
    });
  }
});

describe("benchmarkTrackingModule export", () => {
  it("benchmarkTrackingModule re-exports as benchmarkTracking pack id", async () => {
    const { benchmarkTrackingModule } = await import(
      "../src/assurance/packs/benchmarkTrackingModule.js"
    );
    expect(benchmarkTrackingModule).toBeDefined();
    expect(benchmarkTrackingModule.id).toBe("benchmarkTracking");
    expect(benchmarkTrackingModule.scenarios.length).toBeGreaterThanOrEqual(5);
  });
});
