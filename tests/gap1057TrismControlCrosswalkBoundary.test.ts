import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";

const DOC = "docs/source-reviews/GAP-1057-trism-control-crosswalk.md";
const TITLE = "TRiSM for Agentic AI: A review of Trust, Risk, and Security Management in LLM-based Agentic Multi-Agent Systems";
const OPENALEX = "https://openalex.org/W7133236347";
const OPENALEX_API = "https://api.openalex.org/works/W7133236347";
const DOI = "https://doi.org/10.1016/j.aiopen.2026.02.006";
const CROSSREF = "https://api.crossref.org/works/10.1016/j.aiopen.2026.02.006";
const PII = "https://linkinghub.elsevier.com/retrieve/pii/S2666651026000069";
const SCIENCEDIRECT = "https://www.sciencedirect.com/science/article/pii/S2666651026000064";
const IDENTIFIER = "trism_agentic_ai_control_crosswalk";

const implementationFiles = [
  "src/compliance/controlCrosswalk.ts",
  "src/compliance/builtInMappings.ts",
  "src/compliance/complianceEngine.ts",
  "src/compliance/complianceReport.ts",
];

function selectedMappings() {
  const ids = [
    "nist_govern",
    "iso42001_clause_5_leadership",
    "euai_art12_record_keeping",
    "soc2_security",
    "hipaa_technical_safeguards",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

const sourceCitations = [
  {
    sourceId: "trism-agentic-ai-review",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T04:16:00.000+05:30",
  },
  {
    sourceId: "nist-ai-rmf-1.0",
    title: "NIST AI Risk Management Framework 1.0",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    retrievedAt: "2026-06-25T04:16:00.000+05:30",
  },
  {
    sourceId: "iso-42001-family",
    title: "ISO/IEC 42001 AI management system family",
    url: "https://www.iso.org/standard/81230.html",
    retrievedAt: "2026-06-25T04:16:00.000+05:30",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T04:16:00.000+05:30",
  },
  {
    sourceId: "aicpa-soc2",
    title: "AICPA SOC 2 trust services criteria",
    url: "https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services",
    retrievedAt: "2026-06-25T04:16:00.000+05:30",
  },
  {
    sourceId: "hipaa-security-rule",
    title: "HIPAA Security Rule",
    url: "https://www.hhs.gov/hipaa/for-professionals/security/index.html",
    retrievedAt: "2026-06-25T04:16:00.000+05:30",
  },
];

function ownersByMappingId() {
  return {
    nist_govern: "grc-owner@example.com",
    iso42001_clause_5_leadership: "aims-owner@example.com",
    euai_art12_record_keeping: "ledger-owner@example.com",
    soc2_security: "security-owner@example.com",
    hipaa_technical_safeguards: "vault-owner@example.com",
  };
}

function evidenceByMappingId() {
  return {
    nist_govern: [
      {
        eventId: "ev-nist-govern-audit",
        eventHash: "a".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-nist-govern-audit",
      },
    ],
    iso42001_clause_5_leadership: [
      {
        eventId: "ev-iso-leadership-tool",
        eventHash: "b".repeat(64),
        evidenceType: "tool_action",
        signedEvidenceRef: "ledger-iso-leadership-tool",
      },
    ],
    euai_art12_record_keeping: [
      {
        eventId: "ev-euai-record-llm",
        eventHash: "c".repeat(64),
        evidenceType: "llm_request",
        signedEvidenceRef: "ledger-euai-record-llm",
      },
    ],
    soc2_security: [
      {
        eventId: "ev-soc2-security-tool",
        eventHash: "d".repeat(64),
        evidenceType: "tool_result",
        signedEvidenceRef: "ledger-soc2-security-tool",
      },
    ],
    hipaa_technical_safeguards: [
      {
        eventId: "ev-hipaa-vault-audit",
        eventHash: "e".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-hipaa-vault-audit",
      },
    ],
  };
}

describe("GAP-1057 TRiSM control-crosswalk boundary", () => {
  it("documents live TRiSM paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1057");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(PII);
    expect(doc).toContain(SCIENCEDIRECT);
    expect(doc).toContain("AI Open");
    expect(doc).toContain("Elsevier BV");
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("journal-article");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by-nc-nd");
    expect(doc).toContain("Vector Institute");
    expect(doc).toContain("Cornell University");
    expect(doc).toContain("University of Groningen");
    expect(doc).toContain("control crosswalk coverage");
    expect(doc).toContain("framework clause");
    expect(doc).toContain("AMC question IDs");
    expect(doc).toContain("evidence type");
    expect(doc).toContain("owner");
    expect(doc).toContain("exception state");
    expect(doc).toContain("signed exception");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds an auditor-ready generic control crosswalk with owners, citations, evidence chain, and signed exception state", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1057-control-crosswalk",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: ownersByMappingId(),
      evidenceByMappingId: evidenceByMappingId(),
      exceptions: [
        {
          mappingId: "euai_art12_record_keeping",
          exceptionId: "exc-euai-art12-export-delay",
          state: "approved",
          owner: "ledger-owner@example.com",
          reason: "Audit export retention extension approved by compliance owner.",
          signedEvidenceRef: "ledger-exception-euai-art12",
          signatureSha256: "f".repeat(64),
        },
      ],
      generatedAt: "2026-06-25T04:17:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(5);
    expect(receipt.rows.map((row) => row.framework)).toEqual(expect.arrayContaining([
      "NIST_AI_RMF",
      "ISO_42001",
      "EU_AI_ACT",
      "SOC2",
      "HIPAA",
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
    expect(markdown).toContain("NIST_AI_RMF");
    expect(markdown).toContain("Clause 5 Leadership");
    expect(markdown).toContain("Art. 12 Record-Keeping");
    expect(markdown).toContain("§164.312 Technical Safeguards");
    expect(markdown).toContain("ledger-owner@example.com");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("Exception: approved");
  });

  it("fails closed when paper metadata replaces citations, owners, signed exceptions, or evidence lineage", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1057-metadata-only-crosswalk",
      mappings: selectedMappings().slice(0, 2),
      sourceCitations: [],
      ownersByMappingId: {
        nist_govern: "grc-owner@example.com",
      },
      evidenceByMappingId: {
        nist_govern: [],
      },
      exceptions: [
        {
          mappingId: "iso42001_clause_5_leadership",
          exceptionId: "exc-unsigned",
          state: "approved",
          owner: "aims-owner@example.com",
          reason: "Unsigned exception should not pass.",
        },
      ],
      generatedAt: "2026-06-25T04:18:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "sourceCitations:missing",
      "iso42001_clause_5_leadership:owner:missing",
      "nist_govern:evidenceChain:missing",
      "iso42001_clause_5_leadership:evidenceChain:missing",
      "iso42001_clause_5_leadership:signedException:missing",
    ]));
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(false);
  });

  it("does not add TRiSM-specific identifiers to generic compliance implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("10.1016/j.aiopen.2026.02.006");
      expect(source).not.toContain("W7133236347");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
