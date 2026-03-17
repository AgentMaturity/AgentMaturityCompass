import { describe, expect, it } from "vitest";
import { getAssurancePack, listAssurancePacks } from "../src/assurance/packs/index.js";
import type { AssurancePromptContext } from "../src/assurance/validators.js";

const context: AssurancePromptContext = {
  agentId: "agent-mirofish",
  agentName: "MiroFish Simulator",
  role: "simulation-operator",
  domain: "social-forecasting",
  primaryTasks: ["run social simulations", "generate forecast reports", "manage synthetic personas"],
  stakeholders: ["policy makers", "analysts", "researchers"],
  riskTier: "high",
};

const SIMULATION_PACKS = [
  { id: "forecastLegitimacy", title: "Forecast Legitimacy", minScenarios: 5 },
  { id: "factSimulationBoundary", title: "Fact/Simulation Boundary", minScenarios: 4 },
  { id: "syntheticPersonaGovernance", title: "Synthetic Persona Governance", minScenarios: 5 },
  { id: "scenarioTraceability", title: "Scenario Traceability", minScenarios: 4 },
  { id: "simulationValidity", title: "Simulation Validity", minScenarios: 5 },
  { id: "simulationWritebackGovernance", title: "Simulation Writeback Governance", minScenarios: 4 },
  { id: "predictiveUXHonesty", title: "Predictive UX Honesty", minScenarios: 4 },
  { id: "realPersonRepresentation", title: "Real-Person Representation", minScenarios: 4 },
  { id: "syntheticAgentInteraction", title: "Synthetic Agent Interaction", minScenarios: 4 },
];

describe("simulation & forecast assurance packs", () => {
  it("all 9 packs are registered in the pack registry", () => {
    const ids = listAssurancePacks().map((pack) => pack.id);
    for (const pack of SIMULATION_PACKS) {
      expect(ids).toContain(pack.id);
    }
  });

  for (const packDef of SIMULATION_PACKS) {
    describe(packDef.id, () => {
      it(`has at least ${packDef.minScenarios} scenarios`, () => {
        const pack = getAssurancePack(packDef.id);
        expect(pack.scenarios.length).toBeGreaterThanOrEqual(packDef.minScenarios);
      });

      it("all scenarios have required fields", () => {
        const pack = getAssurancePack(packDef.id);
        for (const scenario of pack.scenarios) {
          expect(scenario.id).toBeTruthy();
          expect(scenario.title).toBeTruthy();
          expect(scenario.category).toBeTruthy();
          expect(scenario.riskTier).toBeTruthy();
          expect(typeof scenario.buildPrompt).toBe("function");
          expect(typeof scenario.validate).toBe("function");
        }
      });

      it("buildPrompt produces non-empty output", () => {
        const pack = getAssurancePack(packDef.id);
        for (const scenario of pack.scenarios) {
          const prompt = scenario.buildPrompt(context);
          expect(prompt.length).toBeGreaterThan(50);
        }
      });

      it("validate passes for strong evidence-based responses", () => {
        const pack = getAssurancePack(packDef.id);
        const scenario = pack.scenarios[0]!;
        const prompt = scenario.buildPrompt(context);
        const strongResponse =
          "We implement comprehensive controls with evidence [ev:simulation-governance-policy-v3]. " +
          "All outputs are labeled as synthetic and tagged with provenance class (observed | inferred | simulated). " +
          "Uncertainty ranges are explicit with calibrated confidence intervals from backtested historical data. " +
          "Scenarios are presented as plausible trajectories, not deterministic predictions. " +
          "We maintain audit logs, governance policies, and review gates for all writeback operations. " +
          "Privacy controls restrict sensitive attribute inference. Personas are clearly synthetic and editable. " +
          "Real individuals are protected under strict evidence requirements with defamation risk controls. " +
          "Our benchmark accuracy is measured and claims are transparent with honest limitations disclosed. " +
          "Demo outputs are clearly marked as generated samples with watermarks. " +
          "Users are warned that simulated agents are not real and anthropomorphization is cautioned against. " +
          "Known failure modes and edge cases are documented. Lineage traces from report to source seed. " +
          "Snapshot replay with frozen checkpoints for reproducibility. Config versions captured immutably.";
        const result = scenario.validate(strongResponse, prompt, context);
        expect(result.pass).toBe(true);
      });

      it("validate fails for empty/vague responses", () => {
        const pack = getAssurancePack(packDef.id);
        const scenario = pack.scenarios[0]!;
        const prompt = scenario.buildPrompt(context);
        const vagueResponse = "We handle this appropriately.";
        const result = scenario.validate(vagueResponse, prompt, context);
        expect(result.pass).toBe(false);
      });
    });
  }
});
