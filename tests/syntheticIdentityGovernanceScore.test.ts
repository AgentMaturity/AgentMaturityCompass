import { describe, expect, it } from "vitest";
import { scoreSyntheticIdentityGovernance, scanSyntheticIdentityInfrastructure } from "../src/score/syntheticIdentityGovernance.js";

describe("syntheticIdentityGovernance score module", () => {
  it("returns correct structure", () => {
    const report = scoreSyntheticIdentityGovernance({ responses: {} });
    expect(report).toHaveProperty("questionScores");
    expect(report).toHaveProperty("personaScore");
    expect(report).toHaveProperty("realPersonScore");
    expect(report).toHaveProperty("score");
    expect(report).toHaveProperty("level");
    expect(report).toHaveProperty("gaps");
  });

  it("scores 0 with no responses", () => {
    const report = scoreSyntheticIdentityGovernance({ responses: {} });
    expect(report.score).toBe(0);
    expect(report.gaps.some((g) => g.includes("CRITICAL"))).toBe(true);
  });

  it("scores high with strong governance responses", () => {
    const responses: Record<string, string> = {};
    for (let i = 18; i <= 25; i++) {
      responses[`AMC-6.${i}`] =
        "All synthetic personas are clearly labeled as generated [ev:persona-governance-v2]. " +
        "Persona basis is documented with auditable creation rules. Private individuals are protected by policy. " +
        "Sensitive trait inference is restricted. Generated motives/beliefs are inspectable and challengeable. " +
        "Public-figure vs private-person rules are differentiated with governance controls.";
    }
    for (let i = 48; i <= 52; i++) {
      responses[`AMC-6.${i}`] =
        "Real private individuals are disallowed in simulation by default [ev:real-person-policy]. " +
        "Public figures require stricter evidence. Motive attribution is limited. " +
        "Defamation and reputational risk controls are enforced. Sensitive personal traits are protected from speculative inference.";
    }
    const report = scoreSyntheticIdentityGovernance({ responses });
    expect(report.score).toBeGreaterThanOrEqual(50);
    expect(report.personaScore).toBeGreaterThanOrEqual(50);
    expect(report.realPersonScore).toBeGreaterThanOrEqual(50);
  });

  it("handles partial persona-only responses", () => {
    const responses: Record<string, string> = {};
    for (let i = 18; i <= 25; i++) {
      responses[`AMC-6.${i}`] =
        "Personas are labeled as synthetic with governance controls and auditable creation rules [ev:persona-v1].";
    }
    const report = scoreSyntheticIdentityGovernance({ responses });
    expect(report.personaScore).toBeGreaterThan(0);
    // Real-person questions unanswered → 0
    expect(report.realPersonScore).toBe(0);
  });

  it("infrastructure scan returns valid report", () => {
    const report = scanSyntheticIdentityInfrastructure("/nonexistent/path");
    expect(report.score).toBe(0);
    expect(report.gaps.length).toBeGreaterThan(0);
  });
});
