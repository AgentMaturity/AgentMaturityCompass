import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";

const DOC = "docs/source-reviews/GAP-1068-saidot-control-crosswalk.md";
const HOME = "https://www.saidot.ai";
const PRODUCT = "https://www.saidot.ai/product";
const AI_POLICY = "https://www.saidot.ai/ai-policy";
const EU_AI_ACT_GUIDE = "https://www.saidot.ai/introduction-to-the-eu-ai-act-practical-guide-to-governance-compliance-and-regulatory-guidelines";
const GOVERNANCE_CONTROL = "https://www.saidot.ai/insights/beyond-compliance-building-trust-through-ai-governance-and-control";
const AGENT_GOVERNANCE = "https://www.saidot.ai/insights/what-is-agent-first-ai-governance";
const AGENT_RISKS = "https://www.saidot.ai/insights/most-common-ai-agent-risks";
const TITLE = "Saidot: Govern all your AI in one connected graph.";
const DESCRIPTION = "The agent-first AI governance platform built on a knowledge graph.";
const IDENTIFIER = "saidot_control_crosswalk";

const implementationFiles = [
  "src/compliance/controlCrosswalk.ts",
  "src/compliance/builtInMappings.ts",
  "src/score/index.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

function selectedMappings() {
  const ids = [
    "nist_govern",
    "iso42001_clause_5_leadership",
    "euai_art9_risk_management",
    "euai_art12_record_keeping",
    "soc2_security",
    "gdpr_art5_accountability",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

const sourceCitations = [
  {
    sourceId: "saidot-official-site-2026-06-25",
    title: TITLE,
    url: HOME,
    retrievedAt: "2026-06-25T06:22:00.000+05:30",
  },
  {
    sourceId: "saidot-product-2026-06-25",
    title: "Saidot AI Governance Platform",
    url: PRODUCT,
    retrievedAt: "2026-06-25T06:22:00.000+05:30",
  },
  {
    sourceId: "nist-ai-rmf-1.0",
    title: "NIST AI Risk Management Framework 1.0",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    retrievedAt: "2026-06-25T06:22:00.000+05:30",
  },
  {
    sourceId: "iso-42001-family",
    title: "ISO/IEC 42001 AI management system family",
    url: "https://www.iso.org/standard/81230.html",
    retrievedAt: "2026-06-25T06:22:00.000+05:30",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T06:22:00.000+05:30",
  },
];

function ownersByMappingId() {
  return {
    nist_govern: "governance-owner@example.com",
    iso42001_clause_5_leadership: "management-system-owner@example.com",
    euai_art9_risk_management: "risk-owner@example.com",
    euai_art12_record_keeping: "record-owner@example.com",
    soc2_security: "security-owner@example.com",
    gdpr_art5_accountability: "privacy-accountability-owner@example.com",
  };
}

function evidenceByMappingId() {
  return {
    nist_govern: [
      {
        eventId: "ev-nist-govern-saidot-context",
        eventHash: "a".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-nist-govern-saidot-context",
      },
    ],
    iso42001_clause_5_leadership: [
      {
        eventId: "ev-iso-leadership-saidot-context",
        eventHash: "b".repeat(64),
        evidenceType: "tool_action",
        signedEvidenceRef: "ledger-iso-leadership-saidot-context",
      },
    ],
    euai_art9_risk_management: [
      {
        eventId: "ev-euai-art9-saidot-context",
        eventHash: "c".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-euai-art9-saidot-context",
      },
    ],
    euai_art12_record_keeping: [
      {
        eventId: "ev-euai-art12-saidot-context",
        eventHash: "d".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-euai-art12-saidot-context",
      },
    ],
    soc2_security: [
      {
        eventId: "ev-soc2-security-saidot-context",
        eventHash: "e".repeat(64),
        evidenceType: "llm_request",
        signedEvidenceRef: "ledger-soc2-security-saidot-context",
      },
    ],
    gdpr_art5_accountability: [
      {
        eventId: "ev-gdpr-accountability-saidot-context",
        eventHash: "f".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-gdpr-accountability-saidot-context",
      },
    ],
  };
}

describe("GAP-1068 Saidot control-crosswalk boundary", () => {
  it("documents live Saidot metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1068");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain(HOME);
    expect(doc).toContain(PRODUCT);
    expect(doc).toContain(AI_POLICY);
    expect(doc).toContain(EU_AI_ACT_GUIDE);
    expect(doc).toContain(GOVERNANCE_CONTROL);
    expect(doc).toContain(AGENT_GOVERNANCE);
    expect(doc).toContain(AGENT_RISKS);
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("Saidot AI Governance Platform");
    expect(doc).toContain("Saidot AI Policy");
    expect(doc).toContain("An Introduction to the EU AI Act");
    expect(doc).toContain("Beyond compliance: Building trust through AI governance and control");
    expect(doc).toContain("What is agent-first AI governance");
    expect(doc).toContain("The 14 most common AI agent risks");
    expect(doc).toContain("Control crosswalk coverage");
    expect(doc).toContain("framework clause");
    expect(doc).toContain("AMC question IDs");
    expect(doc).toContain("evidence type");
    expect(doc).toContain("owner");
    expect(doc).toContain("exception state");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic control crosswalk for Saidot governance context", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1068-saidot-control-crosswalk",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: ownersByMappingId(),
      evidenceByMappingId: evidenceByMappingId(),
      exceptions: [
        {
          mappingId: "euai_art12_record_keeping",
          exceptionId: "exc-euai-art12-export-window",
          state: "approved",
          owner: "record-owner@example.com",
          reason: "Record export refresh window has signed compensating evidence.",
          signedEvidenceRef: "ledger-exc-euai-art12-export-window",
          signatureSha256: "1".repeat(64),
        },
      ],
      generatedAt: "2026-06-25T06:23:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(6);
    expect(receipt.rows.map((row) => row.framework)).toEqual(expect.arrayContaining([
      "NIST_AI_RMF",
      "ISO_42001",
      "EU_AI_ACT",
      "SOC2",
      "GDPR",
    ]));
    expect(receipt.rows.every((row) => row.frameworkClause.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.amcQuestionIds.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceTypes.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceChainHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "euai_art12_record_keeping")?.exceptionState).toBe("approved");
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);

    const markdown = renderControlCrosswalkAuditExport(receipt);
    expect(markdown).toContain("# AMC Control Crosswalk Audit Export");
    expect(markdown).toContain("Govern");
    expect(markdown).toContain("Clause 5 Leadership");
    expect(markdown).toContain("Art. 9 Risk Management");
    expect(markdown).toContain("Art. 12 Record-Keeping");
    expect(markdown).toContain("privacy-accountability-owner@example.com");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("Exception: approved");
  });

  it("fails closed when Saidot metadata replaces signed crosswalk evidence", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1068-metadata-only-crosswalk",
      mappings: selectedMappings().slice(0, 2),
      sourceCitations: sourceCitations.slice(0, 1),
      ownersByMappingId: {
        nist_govern: "governance-owner@example.com",
      },
      evidenceByMappingId: {
        nist_govern: [],
      },
      exceptions: [
        {
          mappingId: "iso42001_clause_5_leadership",
          exceptionId: "exc-unsigned-saidot-control",
          state: "approved",
          owner: "management-system-owner@example.com",
          reason: "Unsigned control exception should not pass.",
        },
      ],
      generatedAt: "2026-06-25T06:24:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "iso42001_clause_5_leadership:owner:missing",
      "nist_govern:evidenceChain:missing",
      "iso42001_clause_5_leadership:evidenceChain:missing",
      "iso42001_clause_5_leadership:signedException:missing",
    ]));
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(false);
  });

  it("does not add Saidot source identifiers to generic control-crosswalk or scoring implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Saidot");
      expect(source).not.toContain("saidot.ai");
      expect(source).not.toContain("COMP-123");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
