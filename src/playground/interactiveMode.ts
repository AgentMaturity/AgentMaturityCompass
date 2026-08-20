import type { Scenario, ScenarioResult } from "./scenarioRunner.js";
import { DEMO_SCENARIOS, runScenarioOffline } from "./scenarioRunner.js";

export interface PlaygroundSession {
  scenarios: Scenario[];
  results: ScenarioResult[];
}

export function createPlaygroundSession(customScenarios?: Scenario[]): PlaygroundSession {
  return {
    scenarios: customScenarios ?? DEMO_SCENARIOS,
    results: [],
  };
}

export function runAllScenarios(session: PlaygroundSession): ScenarioResult[] {
  session.results = session.scenarios.map(s => runScenarioOffline(s));
  return session.results;
}

export function formatPlaygroundReport(session: PlaygroundSession): string {
  const lines: string[] = [
    "",
    "🎮  AMC Playground — Scenario Results",
    "═══════════════════════════════════════",
    "",
  ];
  for (const result of session.results) {
    const icon = result.passed ? "✅" : "❌";
    const scenario = session.scenarios.find(s => s.id === result.scenarioId);
    lines.push(`${icon}  ${scenario?.name ?? result.scenarioId}`);
    lines.push(`   ${scenario?.description ?? ""}`);
    for (const step of result.steps) {
      const mark = step.pending ? "•" : step.passed ? "✓" : "✗";
      lines.push(`   ${mark} Step ${step.stepId}: ${step.explanation}`);
    }
    lines.push("");
  }
  // Scenarios that were never executed are reported separately: counting them
  // as passes would claim a result that was never measured.
  const pending = session.results.filter(r => r.pending).length;
  const executed = session.results.filter(r => !r.pending);
  const passed = executed.filter(r => r.passed).length;
  lines.push(
    pending > 0
      ? `Summary: ${passed}/${executed.length} scenarios passed, ${pending} not executed (run with a live agent)`
      : `Summary: ${passed}/${executed.length} scenarios passed`
  );
  lines.push("");
  return lines.join("\n");
}
