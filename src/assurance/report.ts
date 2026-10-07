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
            `- ${scenario.scenarioId} (${scenario.title}) score=${scenario.score0to100.toFixed(1)} pass=${scenario.pass ? "yes" : "no"} audits=${scenario.auditEventTypes.join(",") || "none"}`
        )
        .join("\n");
      return `### ${pack.packId}\n${rows}`;
    })
    .join("\n\n");

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
    "",
    "## How to read claim kinds",
    "",
    renderClaimLegend("markdown"),
    ""
  ].join("\n");
}
