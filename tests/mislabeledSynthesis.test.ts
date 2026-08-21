import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectEvidence } from "../src/score/evidenceCollector.js";
import { PolicyPackRegistry } from "../src/watch/policyPacks.js";

/**
 * G1-44..G1-50: a cluster where the maths was honest but the label was not —
 * "ML-powered" regex, vendor-branded receipts that contact no vendor, a dollar
 * figure derived from a maturity level, self-reported inputs stamped OBSERVED,
 * and a policy pack reporting applied: true while enforcing nothing.
 */
describe("capabilities are labelled as what they are", () => {
  it("no longer claims ML where there is none", () => {
    const gen = readFileSync(
      new URL("../src/shield/dynamicAttackGenerator.ts", import.meta.url),
      "utf8"
    );
    const prof = readFileSync(
      new URL("../src/watch/behavioralProfiler.ts", import.meta.url),
      "utf8"
    );
    expect(gen).not.toContain("ML-powered attack synthesis");
    expect(gen).toMatch(/There is no model and no\s+\*\s+learned component/);
    expect(prof).not.toContain("ML-Powered Behavioral Profiling");
    expect(prof).toContain("classical statistics");
  });

  it("vendor-named drift modules state that no vendor is contacted", () => {
    const source = readFileSync(
      new URL("../src/watch/agentReadingTestLiveDrift.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("NO VENDOR API IS CONTACTED");
  });

  it("business KPIs no longer invent a dollar figure", () => {
    const source = readFileSync(
      new URL("../src/cli-business-commands.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toContain("`$${Math.round(riskReductionPct * 1000)}k`");
    expect(source).toContain("not measured business outcomes");
  });

  it("caller-supplied outputs are self-reported, not observed", () => {
    const result = collectEvidence({ "AMC-1.1": { some: "output" } });
    // OBSERVED is reserved for evidence AMC captured itself.
    expect(result.artifacts[0]?.kind).toBe("self_reported");
    expect(result.artifacts[0]?.trust).toBe(0.4);
  });

  it("null outputs still carry no trust", () => {
    const result = collectEvidence({ "AMC-1.1": null });
    expect(result.artifacts[0]?.trust).toBe(0);
  });

  it("resolving a policy pack does not report it as applied", () => {
    const manager = new PolicyPackRegistry();
    const packs = manager.listPolicyPacks();
    if (packs.length > 0) {
      const result = manager.applyPolicyPack("agent-1", packs[0]!.packId);
      expect(result.applied).toBe(false);
      expect(result.resolved).toBe(true);
      expect(result.modulesEnabled.length).toBeGreaterThan(0);
    }
    // An unknown pack resolves to nothing.
    const missing = manager.applyPolicyPack("agent-1", "no-such-pack");
    expect(missing.applied).toBe(false);
    expect(missing.modulesEnabled).toEqual([]);
  });
});
