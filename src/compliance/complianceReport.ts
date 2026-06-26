import { dirname, resolve } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import type { ComplianceReportJson } from "./mappingSchema.js";

function shortEvidenceHash(hash: string): string {
  if (hash.length <= 20) {
    return hash;
  }
  return `${hash.slice(0, 12)}...${hash.slice(-4)}`;
}

function frameworkLegalReviewNotes(framework: string): string[] {
  switch (framework) {
    case "EU_AI_ACT":
      return [
        "EU AI Act legal review: confirm provider/deployer role, high-risk classification, FRIA obligations, technical documentation, human oversight, post-market monitoring, and serious-incident reporting duties.",
        "Confirm whether each PARTIAL, MISSING, or UNKNOWN category maps to a legal obligation, internal policy control, or non-applicable item with counsel-approved rationale."
      ];
    case "SOC2":
      return [
        "SOC 2 legal review: confirm Trust Services Criteria scope, system boundaries, subprocessor commitments, customer commitments, and whether evidence supports the selected audit period.",
        "Confirm exceptions, compensating controls, and management assertions before sharing the report externally."
      ];
    case "ISO_42001":
      return [
        "ISO/IEC 42001 legal review: confirm AI management-system scope, role accountability, risk-treatment acceptance, supplier obligations, and audit-evidence retention requirements.",
        "Confirm unresolved controls have owners, target dates, and acceptance criteria before certification or customer use."
      ];
    case "ISO_27001":
      return [
        "ISO/IEC 27001 legal review: confirm ISMS scope, Statement of Applicability alignment, risk-treatment ownership, supplier/security commitments, and evidence retention expectations.",
        "Confirm unresolved controls are tracked through the risk treatment plan before external attestation use."
      ];
    case "NIST_AI_RMF":
      return [
        "NIST AI RMF legal review: confirm Govern, Map, Measure, and Manage evidence is appropriate for the deployment context, risk appetite, and external commitments.",
        "Confirm the report is used as risk-management support rather than as a statutory compliance claim unless counsel approves that claim."
      ];
    default:
      return [
        `${framework} legal review: confirm framework applicability, role obligations, control scope, evidence sufficiency, and external-claim language with qualified counsel.`,
        "Confirm unresolved controls have owners, target dates, and reviewer-approved remediation or non-applicability rationale."
      ];
  }
}

export function complianceReportToMarkdown(report: ComplianceReportJson): string {
  const lines: string[] = [];
  lines.push(`# AMC Compliance Report (${report.framework})`);
  lines.push("");
  lines.push(`- Agent: ${report.agentId}`);
  lines.push(`- Window: ${new Date(report.windowStartTs).toISOString()} -> ${new Date(report.windowEndTs).toISOString()}`);
  lines.push(
    `- Config trusted: ${report.configTrusted ? "YES" : "NO"}${report.configReason ? ` (${report.configReason})` : ""}` +
      (report.configTrusted ? "" : " — Fix: `amc compliance init` then `amc compliance verify`.")
  );
  lines.push(
    `- Trust coverage: OBSERVED ${(report.trustTierCoverage.observed * 100).toFixed(1)}% | ATTESTED ${(report.trustTierCoverage.attested * 100).toFixed(1)}% | SELF_REPORTED ${(report.trustTierCoverage.selfReported * 100).toFixed(1)}%`
  );
  lines.push(
    `- Coverage score: ${(report.coverage.score * 100).toFixed(1)}% (S:${report.coverage.satisfied} P:${report.coverage.partial} M:${report.coverage.missing} U:${report.coverage.unknown})`
  );
  lines.push("- Full hashes remain available in JSON reports: `amc compliance report --json`.");
  lines.push("");
  lines.push("## Status and Evidence Drilldown");
  lines.push("");
  lines.push("- SATISFIED: mapped evidence is present and compliance maps are trusted.");
  lines.push("- PARTIAL: some evidence exists, maps are untrusted, or one or more controls need more proof.");
  lines.push("- MISSING: expected mapped evidence is absent.");
  lines.push("- UNKNOWN: AMC cannot decide with the current maps and evidence window.");
  lines.push("- Hash drill-down: match the `eventId` below in the JSON report to inspect the full `eventHash` and evidence metadata.");
  lines.push("");
  lines.push("## Categories");
  lines.push("");
  for (const category of report.categories) {
    lines.push(`### ${category.category} (${category.status})`);
    lines.push("");
    lines.push(category.description);
    lines.push("");
    lines.push("Deterministic reasons:");
    for (const reason of category.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("Evidence references:");
    if (category.evidenceRefs.length === 0) {
      lines.push("- none");
    } else {
      for (const ref of category.evidenceRefs) {
        lines.push(`- ${ref.eventId} (${ref.eventType}) evidence ref \`${shortEvidenceHash(ref.eventHash)}\` — JSON path: \`categories[].evidenceRefs[] | eventId == "${ref.eventId}"\``);
      }
    }
    lines.push("What would make this SATISFIED?");
    for (const item of category.neededToSatisfy) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }
  lines.push("## Legal Review Appendix");
  lines.push("");
  lines.push("This appendix is not legal advice. It is an export-ready checklist for qualified legal, compliance, or audit reviewers.");
  lines.push("");
  lines.push("Export packet:");
  lines.push(`- Markdown report: this file, generated for framework \`${report.framework}\`.`);
  lines.push(`- JSON evidence report: \`amc compliance report --framework ${report.framework} --json --out compliance-${report.framework.toLowerCase()}.json\`.`);
  lines.push("- Evidence drill-down: use the event IDs above to recover full hashes and metadata from the JSON report.");
  lines.push("- Reviewer focus: resolve every PARTIAL, MISSING, and UNKNOWN item before using this report as customer, board, regulator, or audit evidence.");
  lines.push("");
  lines.push("Framework-specific legal-review notes:");
  for (const note of frameworkLegalReviewNotes(report.framework)) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("Reviewer sign-off prompts:");
  lines.push("- Is this framework applicable to the agent, deployment context, geography, and customer commitment?");
  lines.push("- Are all non-claims preserved in customer-facing or regulator-facing materials?");
  lines.push("- Are remediation owners and dates assigned for unresolved categories?");
  lines.push("- Are signed artifacts required before this report is used externally?");
  lines.push("");
  lines.push("## Non-Claims");
  for (const line of report.nonClaims) {
    lines.push(`- ${line}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeComplianceReport(params: {
  workspace: string;
  outFile: string;
  report: ComplianceReportJson;
  format: "md" | "json";
}): string {
  const file = resolve(params.workspace, params.outFile);
  ensureDir(dirname(file));
  if (params.format === "json") {
    writeFileAtomic(file, JSON.stringify(params.report, null, 2), 0o644);
  } else {
    writeFileAtomic(file, complianceReportToMarkdown(params.report), 0o644);
  }
  return file;
}

export function diffComplianceReports(a: ComplianceReportJson, b: ComplianceReportJson): {
  framework: string;
  coverageScoreDelta: number;
  categoryDeltas: Array<{
    id: string;
    before: string;
    after: string;
  }>;
} {
  const beforeById = new Map(a.categories.map((row) => [row.id, row]));
  const afterById = new Map(b.categories.map((row) => [row.id, row]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort((x, y) => x.localeCompare(y));
  return {
    framework: b.framework,
    coverageScoreDelta: Number((b.coverage.score - a.coverage.score).toFixed(4)),
    categoryDeltas: ids
      .map((id) => ({
        id,
        before: beforeById.get(id)?.status ?? "UNKNOWN",
        after: afterById.get(id)?.status ?? "UNKNOWN"
      }))
      .filter((row) => row.before !== row.after)
  };
}
