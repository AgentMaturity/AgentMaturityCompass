import type { HarnessComparisonReport, HarnessComparisonTrial } from "./harnessComparison.js";
import { COMPARISON_SCENARIOS } from "./harnessComparisonSchema.js";

function distribution(values: readonly number[]): { samples: number; mean: number | null; median: number | null; p95: number | null } {
  const sorted = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    samples: sorted.length,
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    median: sorted.length ? (sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2) : null,
    p95: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1]! : null
  };
}

function observed(rows: readonly HarnessComparisonTrial[], pick: (row: HarnessComparisonTrial) => number | undefined) {
  const values = rows.map(pick).filter((value): value is number => value !== undefined);
  return { ...distribution(values), unknown: rows.length - values.length };
}

export function summarizeHarnessComparison(report: HarnessComparisonReport) {
  return {
    schemaVersion: report.schemaVersion, comparisonId: report.comparisonId,
    evidenceClass: "automated-command-and-oracle-observations" as const,
    ranking: null, superiorityFactor: null,
    groups: report.manifest.targets.flatMap(target => report.manifest.lanes.map(lane => {
      const rows = report.trials.filter(row => row.targetId === target.id && row.laneId === lane.id);
      const determinate = rows.filter(row => row.status === "executed");
      const passing = determinate.filter(row => row.verdict === "pass").length;
      const fp = rows.flatMap(row => row.oracle?.falsePositives ? [row.oracle.falsePositives] : []);
      const fpEligible = fp.reduce((sum, observation) => sum + observation.eligible, 0);
      return {
        targetId: target.id, laneId: lane.id, laneKind: lane.kind,
        requestedTrials: rows.length,
        commandsExecuted: rows.filter(row => row.process !== null).length,
        determinate: determinate.length, passed: passing,
        failed: determinate.filter(row => row.verdict === "fail").length,
        unavailable: rows.filter(row => row.status === "unavailable").length,
        inconclusive: rows.filter(row => row.status === "inconclusive").length,
        observedTaskOutcomes: {
          passed: rows.filter(row => row.observedOutcome === "pass").length,
          failed: rows.filter(row => row.observedOutcome === "fail").length,
          unknown: rows.filter(row => row.observedOutcome !== "pass" && row.observedOutcome !== "fail").length
        },
        reportedModelCalls: {
          called: rows.filter(row => row.modelCalled === true).length,
          notCalled: rows.filter(row => row.modelCalled === false).length,
          unknown: rows.filter(row => typeof row.modelCalled !== "boolean").length,
          source: "adapter-observation" as const
        },
        budgetUnknown: rows.filter(row => row.budgetStatus === "unknown").length,
        // Denominator is always visible. Unavailable trials are never failures
        // or passes, and a contract pass rate is not a human usability rating.
        oraclePassRate: determinate.length ? passing / determinate.length : null,
        latencyMsIncludingFailedAndInconclusiveExecutions: observed(rows, row => row.process?.durationMs),
        inputTokens: observed(rows, row => row.observations?.usage?.inputTokens),
        outputTokens: observed(rows, row => row.observations?.usage?.outputTokens),
        cacheReadTokens: observed(rows, row => row.observations?.usage?.cacheReadTokens ?? undefined),
        cacheWriteTokens: observed(rows, row => row.observations?.usage?.cacheWriteTokens ?? undefined),
        costUsd: observed(rows, row => row.observations?.cost?.amountUsd),
        costSources: [...new Set(rows.flatMap(row => row.observations?.cost ? [JSON.stringify({
          source: row.observations.cost.source, sourceUrl: row.observations.cost.sourceUrl, asOf: row.observations.cost.asOf
        })] : []))].map(value => JSON.parse(value) as { source: string; sourceUrl: string; asOf: string }),
        usageSources: [...new Set(rows.flatMap(row => row.observations?.usage ? [row.observations.usage.source] : []))],
        humanInterventions: observed(rows, row => row.observations?.interventions?.kind === "observed-human" ? row.observations.interventions.count : undefined),
        automatedFixtureInterventions: observed(rows, row => row.observations?.interventions?.kind === "automated-fixture" ? row.observations.interventions.count : undefined),
        humanEvidencePreparationActions: observed(rows, row => row.observations?.evidencePreparationActions?.kind === "observed-human" ? row.observations.evidencePreparationActions.count : undefined),
        automatedEvidencePreparationActions: observed(rows, row => row.observations?.evidencePreparationActions?.kind === "automated-fixture" ? row.observations.evidencePreparationActions.count : undefined),
        falsePositives: { recordedTrials: fp.length, unknownTrials: rows.length - fp.length,
          count: fp.length ? fp.reduce((sum, observation) => sum + observation.count, 0) : null,
          eligible: fp.length ? fpEligible : null,
          rate: fpEligible ? fp.reduce((sum, observation) => sum + observation.count, 0) / fpEligible : null },
        scenarios: [...new Set(rows.map(row => row.scenario))].map(scenario => ({ scenario,
          executed: rows.filter(row => row.scenario === scenario && row.process !== null).length,
          determinate: rows.filter(row => row.scenario === scenario && row.status === "executed").length })),
        missingConformanceScenarios: lane.kind === "keyless-conformance" ? COMPARISON_SCENARIOS.filter(scenario => !rows.some(row => row.scenario === scenario && row.status === "executed")) : []
      };
    }))
  };
}

const cell = (value: string): string => value.replace(/[|\r\n]/g, " ");
const number = (value: number | null): string => value === null ? "N/A" : value.toFixed(2);

export function renderHarnessComparisonReport(report: HarnessComparisonReport): string {
  const summary = summarizeHarnessComparison(report);
  return [
    `# Harness comparison: ${cell(report.comparisonId)}`,
    "",
    "These are automated execution and independent-oracle records. There is no inferred ranking, maturity score, human usability rating or superiority factor.",
    "",
    `Manifest SHA-256: \`${report.manifestSha256}\`. Started ${report.startedAt}; finished ${report.finishedAt}.`,
    "",
    "| Target | Lane | Requested | Ran | Determinate | Qualified pass | Qualified fail | Unavailable | Inconclusive | Command wall median ms | Timing samples |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...summary.groups.map(group => `| ${cell(group.targetId)} | ${cell(group.laneId)} (${group.laneKind}) | ${group.requestedTrials} | ${group.commandsExecuted} | ${group.determinate} | ${group.passed} | ${group.failed} | ${group.unavailable} | ${group.inconclusive} | ${number(group.latencyMsIncludingFailedAndInconclusiveExecutions.median)} | ${group.latencyMsIncludingFailedAndInconclusiveExecutions.samples} |`),
    "",
    "Timing includes failed/inconclusive executions and adapter startup/cleanup wait. Missing timings, usage, cache, costs and interventions remain unknown; `summary.json` includes each metric's actual sample count and missing count. Cost observations retain their source URL/date. Human actions and automated fixture actions are separate.",
    "",
    "## Observed task outcomes before qualification",
    "",
    "These independent oracle outcomes passed the input-integrity checks. They do not imply verified budgets or successful cleanup. A local model call is an attributed adapter observation, not model-identity or quality attestation; missing token usage keeps the qualification above inconclusive.",
    "",
    "| Target | Lane | Task pass | Task fail | Outcome unknown | Model called (reported) | Model call unknown | Budget unknown |",
    "|---|---|---:|---:|---:|---:|---:|---:|",
    ...summary.groups.map(group => `| ${cell(group.targetId)} | ${cell(group.laneId)} | ${group.observedTaskOutcomes.passed} | ${group.observedTaskOutcomes.failed} | ${group.observedTaskOutcomes.unknown} | ${group.reportedModelCalls.called} | ${group.reportedModelCalls.unknown} | ${group.budgetUnknown} |`),
    "",
    "## Repeat",
    "",
    "Invoke `runHarnessComparison` with the original manifest path recorded in `report.json`, a new output directory and the recorded execution opt-ins. The redacted manifest copy is for inspection; it is not a replacement for the original pinned input. Verify the same original manifest digest and exact platform/runtime before comparing a repeat.",
    "",
    `Registered CLI repeat argv (replace the output placeholder): \`${JSON.stringify(report.repeat.argv).replace(/`/g, "\\u0060")}\`.`,
    "",
    "## Limits",
    "",
    ...report.limitations.map(limitation => `- ${limitation}`),
    "",
    "## Unavailable and inconclusive trials",
    "",
    ...report.trials.filter(trial => trial.status !== "executed").map(trial => `- ${cell(trial.id)}: ${trial.status}; ${cell(trial.reason ?? "No determinate oracle outcome.")}`),
    ""
  ].join("\n");
}
