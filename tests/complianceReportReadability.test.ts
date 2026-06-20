import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { complianceReportToMarkdown } from "../src/compliance/complianceReport.js";
import type { ComplianceReportJson } from "../src/compliance/mappingSchema.js";

const longHash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

function fixtureReport(): ComplianceReportJson {
  return {
    reportId: "report-1",
    ts: Date.now(),
    workspace: "/tmp/amc",
    framework: "EU_AI_ACT",
    agentId: "default",
    windowStartTs: 1_700_000_000_000,
    windowEndTs: 1_700_086_400_000,
    configTrusted: false,
    configReason: "compliance maps missing",
    trustTierCoverage: {
      observed: 1,
      attested: 0,
      selfReported: 0
    },
    coverage: {
      satisfied: 0,
      partial: 1,
      missing: 0,
      unknown: 0,
      score: 0.458
    },
    categories: [{
      id: "eu-ai-act-art-9",
      framework: "EU_AI_ACT",
      category: "Art. 9 Risk Management",
      description: "Risk management lifecycle controls.",
      status: "PARTIAL",
      reasons: ["Compliance maps signature invalid; green status is downgraded to PARTIAL."],
      evidenceRefs: [{
        eventId: "event-123",
        eventType: "audit",
        eventHash: longHash
      }],
      neededToSatisfy: ["Initialize and verify compliance maps."]
    }],
    nonClaims: ["This is not legal advice."]
  };
}

describe("compliance report readability", () => {
  test("truncates evidence hashes and prints config remediation guidance", () => {
    const markdown = complianceReportToMarkdown(fixtureReport());

    expect(markdown).toContain("- Config trusted: NO (compliance maps missing)");
    expect(markdown).toContain("Fix: `amc compliance init` then `amc compliance verify`.");
    expect(markdown).toContain("- event-123 (audit) evidence ref `abcdef123456...7890`");
    expect(markdown).toContain("Full hashes remain available in JSON reports: `amc compliance report --json`.");
    expect(markdown).toContain("## Status and Evidence Drilldown");
    expect(markdown).toContain("SATISFIED: mapped evidence is present and compliance maps are trusted.");
    expect(markdown).toContain("PARTIAL: some evidence exists, maps are untrusted, or one or more controls need more proof.");
    expect(markdown).toContain("Hash drill-down:");
    expect(markdown).toContain("JSON path: `categories[].evidenceRefs[] | eventId == \"event-123\"`");
    expect(markdown).toContain("## Legal Review Appendix");
    expect(markdown).toContain("Export packet:");
    expect(markdown).toContain("Framework-specific legal-review notes:");
    expect(markdown).toContain("EU AI Act legal review:");
    expect(markdown).toContain("provider/deployer role");
    expect(markdown).toContain("FRIA");
    expect(markdown).toContain("post-market monitoring");
    expect(markdown).toContain("This appendix is not legal advice.");
    expect(markdown).not.toContain(`hash=${longHash}`);
  });

  test("keeps the UX audit aligned with current compliance report readability", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R10 — compliance reports shorten evidence refs and show config fixes");
    expect(audit).toContain("Full hashes remain available in JSON reports");
    expect(audit).toContain("R23 — compliance reports explain status and hash drill-down");
    expect(audit).toContain("R27 — export-ready compliance legal-review appendix is included");
    expect(audit).not.toContain("still contains dense hash IDs");
    expect(audit).not.toContain("No guidance on how to fix this");
    expect(audit).not.toContain("Improve compliance-map status docs and hash drill-down links");
    expect(audit).not.toContain("Add export-ready compliance appendix with framework-specific legal-review notes");
  });
});
