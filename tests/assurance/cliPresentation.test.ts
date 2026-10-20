/** Public presentation regressions only: fixtures are report DTOs, not executed or measured effects. */
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import {
  assuranceSarifEntries,
  renderAssuranceOverallScore,
  renderAssurancePackLine,
  renderAssuranceScenarioHeading,
  renderAssuranceTotalLine
} from "../../src/assurance/cliPresentation.js";
import type { AssurancePackResult, AssuranceScenarioResult } from "../../src/types.js";

function row(extra: Partial<AssuranceScenarioResult> = {}): AssuranceScenarioResult {
  return { scenarioId: "generic-pass", title: "A scenario", category: "generic", riskTier: "all",
    prompt: "fixture prompt", response: "fixture response", pass: true, score0to5: 5, score0to100: 100,
    reasons: ["fixture reason"], correlatedRequestIds: [], evidenceEventIds: [], auditEventTypes: [], ...extra };
}
const pass = row();
const fail = row({ scenarioId: "generic-fail", pass: false, score0to5: 0, score0to100: 0 });
const missing = row({ scenarioId: "synthetic-native-ne", pass: false, score0to5: 0, score0to100: 0,
  inconclusive: true, inconclusiveCause: "ungradable_evidence", gradingMethod: "executed",
  reasons: ["synthetic_fixture_only", "production_capture_and_authority_unavailable"] });
function pack(rows: AssuranceScenarioResult[], extra: Partial<AssurancePackResult> = {}): AssurancePackResult {
  return { packId: "fixture-pack", title: "Fixture pack", scenarioCount: rows.length, passCount: 0, failCount: 0,
    score0to100: 0, trustTier: "SELF_REPORTED", scenarioResults: rows, ...extra };
}
const plain = stripVTControlCharacters;

describe("assurance CLI preserves NE without changing measured generic outcomes", () => {
  it.each([false, true])("SARIF renders inconclusive=true as unscored review even when pass=%s", (passFlag) => {
    const reportPack = pack([{ ...missing, pass: passFlag }]);
    const entries = assuranceSarifEntries([reportPack]);
    expect(entries.results).toEqual([{
      ruleId: "fixture-pack", level: "none", kind: "review",
      message: { text: "A scenario: NOT EVALUATED — synthetic_fixture_only; production_capture_and_authority_unavailable" },
      properties: { scenarioId: "synthetic-native-ne", score: null, category: "generic", inconclusive: true }
    }]);
    expect(entries.rules[0]).toMatchObject({ properties: { score: null, pass: 0, fail: 0, notEvaluated: 1 } });
  });

  it("SARIF keeps the measured generic PASS/FAIL severity, numeric score, identity and reasons", () => {
    const entries = assuranceSarifEntries([pack([pass, fail], { passCount: 1, failCount: 1, score0to100: 50 })]);
    expect(entries.results).toEqual([
      { ruleId: "fixture-pack", level: "note", kind: "pass", message: { text: "A scenario: PASS — fixture reason" },
        properties: { scenarioId: "generic-pass", score: 100, category: "generic", inconclusive: false } },
      { ruleId: "fixture-pack", level: "error", kind: "fail", message: { text: "A scenario: FAIL — fixture reason" },
        properties: { scenarioId: "generic-fail", score: 0, category: "generic", inconclusive: false } }
    ]);
    expect(entries.rules[0]).toMatchObject({ id: "fixture-pack", name: "Fixture pack",
      shortDescription: { text: "AMC Assurance Pack: Fixture pack" },
      properties: { score: 50, pass: 1, fail: 1, notEvaluated: 0 } });
  });

  it("SARIF keeps mixed measured failures visible alongside separate NE rows", () => {
    const entries = assuranceSarifEntries([pack([fail, missing], { failCount: 1 })]);
    expect(entries.results.map((entry) => [entry.level, entry.message.text, entry.properties.score])).toEqual([
      ["error", "A scenario: FAIL — fixture reason", 0],
      ["none", "A scenario: NOT EVALUATED — synthetic_fixture_only; production_capture_and_authority_unavailable", null]
    ]);
    expect(entries.rules[0]?.properties).toMatchObject({ fail: 1, notEvaluated: 1, score: 0 });
  });

  it("an all-NE pack has no success check, failure cross or percentage result", () => {
    const text = plain(renderAssurancePackLine(pack([missing, missing])));
    expect(text).toContain("? fixture-pack");
    expect(text).toContain("NOT EVALUATED");
    expect(text).toContain("0 pass / 0 fail / 2 not evaluated  (2 scenarios)");
    expect(text).not.toMatch(/[✓✗%]/);
  });

  it("a zero-scenario pack is NE and cannot become a green success", () => {
    const text = plain(renderAssurancePackLine(pack([])));
    expect(text).toContain("NOT EVALUATED");
    expect(text).not.toMatch(/[✓✗%]/);
  });

  it("a mixed generic pass and NE is explicitly partial", () => {
    const text = plain(renderAssurancePackLine(pack([pass, missing], { passCount: 1, score0to100: 100 })));
    expect(text).toContain("? fixture-pack");
    expect(text).toContain("100% [PARTIAL]");
    expect(text).toContain("1 pass / 0 fail / 1 not evaluated");
    expect(text).not.toContain("✓");
  });

  it("a measured generic failure keeps its failure cross in a mixed pack", () => {
    const text = plain(renderAssurancePackLine(pack([fail, missing], { failCount: 1 })));
    expect(text).toContain("✗ fixture-pack");
    expect(text).toContain("0 pass / 1 fail / 1 not evaluated");
    expect(text).not.toContain("✓");
  });

  it.each([
    [pass, 1, 0, 100, "✓", "100"],
    [fail, 0, 1, 0, "✗", "  0"]
  ] as const)("keeps the existing fully measured generic pack display: %j", (scenario, passed, failed, score, icon, padded) => {
    expect(plain(renderAssurancePackLine(pack([scenario], { passCount: passed, failCount: failed, score0to100: score }))))
      .toBe(`  ${icon} ${"fixture-pack".padEnd(30)} ${padded}%  ${passed} pass / ${failed} fail  (1 scenarios)`);
  });

  it("verbose headings label NE explicitly and preserve generic pass/fail headings", () => {
    expect(plain(renderAssuranceScenarioHeading(missing))).toBe("    ? A scenario [NOT EVALUATED]");
    expect(plain(renderAssuranceScenarioHeading({ ...missing, pass: true }))).toBe("    ? A scenario [NOT EVALUATED]");
    expect(plain(renderAssuranceScenarioHeading(pass))).toBe("    ✓ A scenario");
    expect(plain(renderAssuranceScenarioHeading(fail))).toBe("    ✗ A scenario");
  });

  it("total inventory includes NE rows instead of reporting zero scenarios", () => {
    expect(plain(renderAssuranceTotalLine([pack([missing, missing])])))
      .toBe("  Total: 2 scenarios — 0 passed, 0 failed, 2 not evaluated");
    expect(plain(renderAssuranceTotalLine([pack([pass, fail, missing], { passCount: 1, failCount: 1 })])))
      .toBe("  Total: 3 scenarios — 1 passed, 1 failed, 1 not evaluated");
    expect(plain(renderAssuranceTotalLine([pack([pass, fail], { passCount: 1, failCount: 1 })])))
      .toBe("  Total: 2 scenarios — 1 passed, 1 failed");
  });

  it("overall display refuses a numeric result for absent measurements and preserves measured scores", () => {
    expect(renderAssuranceOverallScore({ packResults: [pack([missing])], overallScore0to100: 0,
      evidenceStatus: "INSUFFICIENT_EVIDENCE" })).toBe("NOT EVALUATED");
    expect(renderAssuranceOverallScore({ packResults: [pack([missing])], overallScore0to100: 100 })).toBe("NOT EVALUATED");
    expect(renderAssuranceOverallScore({ packResults: [], overallScore0to100: 100 })).toBe("NOT EVALUATED");
    expect(renderAssuranceOverallScore({ packResults: [pack([pass, fail])], overallScore0to100: 50,
      evidenceStatus: "MEASURED" })).toBe("50.00");
  });

  it("does not mutate any native result, evidence references, reason or score", () => {
    const input = [pack([structuredClone(pass), structuredClone(fail), structuredClone(missing)],
      { passCount: 1, failCount: 1, score0to100: 50 })];
    const before = structuredClone(input);
    assuranceSarifEntries(input);
    renderAssurancePackLine(input[0]!);
    for (const scenario of input[0]!.scenarioResults) renderAssuranceScenarioHeading(scenario);
    renderAssuranceTotalLine(input);
    renderAssuranceOverallScore({ packResults: input, overallScore0to100: 50 });
    expect(input).toEqual(before);
  });
});
