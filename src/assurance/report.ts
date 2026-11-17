import { EFFECT_RATE_CAVEAT, howGraded } from "./cliPresentation.js";
import { envelopeForAssurancePack, envelopeForAssuranceReport } from "../claims/eligibility/adapters/results.js";
import { formatClaimLabel, renderClaimLabel, renderClaimLegend } from "../claims/eligibility/render.js";
import type { AssuranceReport } from "../types.js";

/** `sealVerified` is null for a run rendered in the process that produced it, as the runner does. */
export function renderAssuranceMarkdown(report: AssuranceReport, sealVerified: boolean | null = null): string {
  const options = { sealVerified, now: report.ts };
  const packTable = [
    "| Pack | Score | Pass | Fail | TrustTier | Claim |",
    "|---|---:|---:|---:|---|---|",
    ...report.packResults.map(
      (pack) =>
        `| ${pack.packId} | ${pack.score0to100.toFixed(2)} | ${pack.passCount} | ${pack.failCount} | ${pack.trustTier} | ${envelopeForAssurancePack(report.assuranceRunId, pack, options).claimKind} |`
    )
  ].join("\n");

  const scenarioSections = report.packResults
    .map((pack) => {
      const rows = pack.scenarioResults
        .map(
          (scenario) =>
            `- ${scenario.scenarioId} (${scenario.title}) score=${scenario.score0to100.toFixed(1)} pass=${scenario.pass ? "yes" : "no"} audits=${scenario.auditEventTypes.join(",") || "none"}` +
            ` — ${howGraded(scenario)}`
        )
        .join("\n");
      return `### ${pack.packId}\n${rows}`;
    })
    .join("\n\n");

  const executedSections = report.packResults.flatMap(pack => pack.scenarioResults.flatMap(row => {
    if (!row.executed) return [];
    const packet = row.executed, diagnostics = packet.diagnostics;
    const pct = (value: number) => `${(100 * value).toFixed(2)}%`;
    const interval = diagnostics.fixtureWilson95 === null ? "" : `, 95% Wilson interval ${diagnostics.fixtureWilson95.map(pct).join(" to ")}`;
    const effects = diagnostics.result.unauthorizedEffects;
    const rate = diagnostics.fixtureAttemptRate === null ? "attack success rate on the seeded fixture: not measured"
      : `attack worked in ${Math.round(diagnostics.fixtureAttemptRate * diagnostics.conclusiveAttempts)} of ${diagnostics.conclusiveAttempts} attempts on the seeded fixture (${pct(diagnostics.fixtureAttemptRate)}${interval})`;
    return [`### ${pack.packId}/${row.scenarioId}`,
      "Native result: not evaluated · Claim: synthetic_example · Production attack success rate: not measured (only the seeded fixture below)",
      `Mode: ${packet.attempts === 1 ? "1-attempt smoke" : "25-attempt synthetic fixture"}`,
      `Local fixture outcome: ${diagnostics.localOutcome}; completed ${diagnostics.completedAttempts}/${packet.attempts}; conclusive ${diagnostics.conclusiveAttempts}/${packet.attempts}`,
      `Local unauthorized effects: ${effects}; ${rate}; graded by what changed in the fixture's systems`, ""];
  }));

  return [
    `# AMC Assurance Report (${report.assuranceRunId})`,
    "",
    formatClaimLabel(renderClaimLabel(envelopeForAssuranceReport(report, options)), "report"),
    "",
    `- Agent: ${report.agentId}`,
    `- Mode: ${report.mode}`,
    `- Status: ${report.status}`,
    `- Verification: ${report.verificationPassed ? "PASSED" : "FAILED"}`,
    `- TrustTier: ${report.trustTier}`,
    `- IntegrityIndex: ${report.integrityIndex.toFixed(3)} (${report.trustLabel})`,
    `- Overall score: ${report.overallScore0to100.toFixed(2)}`,
    "",
    "## Pack Scores",
    packTable,
    "",
    "## Scenario Results",
    scenarioSections,
    ...(report.packResults.some((pack) => pack.scenarioResults.some((row) => row.effect)) ? ["", EFFECT_RATE_CAVEAT] : []),
    "",
    ...(executedSections.length ? ["## Local fixture diagnostics", "", ...executedSections] : []),
    "## How to read claim kinds",
    "",
    renderClaimLegend("markdown"),
    ""
  ].join("\n");
}
