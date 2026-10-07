import {
  assuranceFindingsDocSchema,
  assuranceFindingSchema,
  type AssuranceFindingsDoc,
  type AssuranceScenarioResult,
  type AssuranceFinding
} from "./assuranceSchema.js";

export function findingsFromScenarioResults(params: {
  runId: string;
  generatedTs: number;
  scenarios: AssuranceScenarioResult[];
}): AssuranceFindingsDoc {
  const findings: AssuranceFinding[] = [];
  for (const scenario of params.scenarios) {
    if (scenario.passed || scenario.inconclusive) {
      continue;
    }
    findings.push(
      assuranceFindingSchema.parse({
        findingId: `finding_${scenario.scenarioId}`,
        scenarioId: scenario.scenarioId,
        category: scenario.category,
        severity: scenario.severityOnFailure,
        descriptionTemplateId: `${scenario.scenarioId}.v1`,
        evidenceRefs: scenario.evidenceRefs,
        remediationHints: []
      })
    );
  }

  return assuranceFindingsDocSchema.parse({
    v: 1,
    runId: params.runId,
    generatedTs: params.generatedTs,
    findings
  });
}

export function findingCounts(findings: AssuranceFinding[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
} {
  const out = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };
  for (const finding of findings) {
    if (finding.severity === "CRITICAL") {
      out.critical += 1;
    } else if (finding.severity === "HIGH") {
      out.high += 1;
    } else if (finding.severity === "MEDIUM") {
      out.medium += 1;
    } else if (finding.severity === "LOW") {
      out.low += 1;
    } else {
      out.info += 1;
    }
  }
  return out;
}
