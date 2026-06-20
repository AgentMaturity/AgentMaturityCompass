import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEMO_SCENARIOS } from "../src/playground/index.js";

function extractJsLiteral<T>(html: string, name: string, nextMarker: string): T {
  const match = html.match(new RegExp(`const ${name} = ([\\s\\S]*?);\\n\\n${nextMarker}`));
  if (!match) throw new Error(`Could not find ${name}`);
  return Function(`"use strict"; return (${match[1]});`)() as T;
}

describe("playground scenarios", () => {
  test("cover real-world alignment, supply-chain, healthcare, and finance cases", () => {
    const html = readFileSync(join(process.cwd(), "website", "playground.html"), "utf8");
    const scenarios = extractJsLiteral<Array<{ id: string; cat: string; checks: string[] }>>(
      html,
      "SCENARIOS",
      "const CHECK_DESCRIPTIONS"
    );
    const checkDescriptions = extractJsLiteral<Record<string, string>>(
      html,
      "CHECK_DESCRIPTIONS",
      "const scenarioResults"
    );

    expect(scenarios.length).toBeGreaterThanOrEqual(30);

    const requiredCategories = ["Alignment", "Supply Chain & Logistics", "Healthcare", "Finance"];
    for (const category of requiredCategories) {
      const categoryScenarios = scenarios.filter((scenario) => scenario.cat === category);
      expect(categoryScenarios.length, category).toBeGreaterThanOrEqual(3);
    }

    const requiredIds = [
      "align-1",
      "align-2",
      "align-3",
      "scm-1",
      "scm-2",
      "scm-3",
      "hlt-1",
      "hlt-2",
      "hlt-3",
      "fin-1",
      "fin-2",
      "fin-3"
    ];
    expect(scenarios.map((scenario) => scenario.id)).toEqual(expect.arrayContaining(requiredIds));

    const usedChecks = new Set(scenarios.flatMap((scenario) => scenario.checks));
    for (const check of usedChecks) {
      expect(checkDescriptions[check], check).toBeTruthy();
    }

    for (const id of requiredIds) {
      expect(html).toContain(`'${id}':`);
    }
  });

  test("CLI playground includes expanded real-world demo scenarios", () => {
    expect(DEMO_SCENARIOS.length).toBeGreaterThanOrEqual(15);

    const requiredCliIds = [
      "alignment-deceptive-audit",
      "alignment-reward-gaming",
      "alignment-goal-misgeneralization",
      "supply-chain-supplier-risk",
      "supply-chain-carrier-exception",
      "supply-chain-cold-chain",
      "healthcare-phi-export",
      "healthcare-clinician-review",
      "healthcare-emergency-escalation",
      "finance-guaranteed-trade",
      "finance-aml-structuring",
      "finance-wire-approval"
    ];

    expect(DEMO_SCENARIOS.map((scenario) => scenario.id)).toEqual(expect.arrayContaining(requiredCliIds));

    for (const scenario of DEMO_SCENARIOS) {
      expect(scenario.steps.length, scenario.id).toBeGreaterThanOrEqual(2);
      expect(scenario.expectedOutcomes.length, scenario.id).toBeGreaterThanOrEqual(2);
    }
  });
});
