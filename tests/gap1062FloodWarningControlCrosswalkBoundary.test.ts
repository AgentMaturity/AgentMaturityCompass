import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";

const DOC = "docs/source-reviews/GAP-1062-flood-warning-control-crosswalk.md";
const TITLE = "A Context-Aware Flood Warning Framework Integrating Ensemble Learning and LLMs";
const OPENALEX = "https://openalex.org/W7134903684";
const OPENALEX_API = "https://api.openalex.org/works/W7134903684";
const DOI = "https://doi.org/10.3390/geohazards7010035";
const CROSSREF = "https://api.crossref.org/works/10.3390/geohazards7010035";
const MDPI = "https://www.mdpi.com/2624-795X/7/1/35";
const MDPI_PDF = "https://www.mdpi.com/2624-795X/7/1/35/pdf";
const IDENTIFIER = "flood_warning_control_crosswalk";

const implementationFiles = [
  "src/compliance/controlCrosswalk.ts",
  "src/compliance/builtInMappings.ts",
  "src/score/index.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

function selectedMappings() {
  const ids = [
    "nist_manage",
    "iso42001_clause_8_operation",
    "euai_art15_accuracy_robustness",
    "euai_art72_post_market_monitoring",
    "soc2_availability",
    "fedramp_contingency_planning",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

const sourceCitations = [
  {
    sourceId: "flood-warning-ensemble-llm-geohazards",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T05:10:00.000+05:30",
  },
  {
    sourceId: "nist-ai-rmf-1.0",
    title: "NIST AI Risk Management Framework 1.0",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    retrievedAt: "2026-06-25T05:10:00.000+05:30",
  },
  {
    sourceId: "iso-42001-family",
    title: "ISO/IEC 42001 AI management system family",
    url: "https://www.iso.org/standard/81230.html",
    retrievedAt: "2026-06-25T05:10:00.000+05:30",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T05:10:00.000+05:30",
  },
  {
    sourceId: "aicpa-soc2",
    title: "AICPA SOC 2 trust services criteria",
    url: "https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services",
    retrievedAt: "2026-06-25T05:10:00.000+05:30",
  },
  {
    sourceId: "fedramp-controls",
    title: "FedRAMP security control baselines",
    url: "https://www.fedramp.gov/baselines/",
    retrievedAt: "2026-06-25T05:10:00.000+05:30",
  },
];

function ownersByMappingId() {
  return {
    nist_manage: "grc-owner@example.com",
    iso42001_clause_8_operation: "operation-owner@example.com",
    euai_art15_accuracy_robustness: "robustness-owner@example.com",
    euai_art72_post_market_monitoring: "monitoring-owner@example.com",
    soc2_availability: "availability-owner@example.com",
    fedramp_contingency_planning: "continuity-owner@example.com",
  };
}

function evidenceByMappingId() {
  return {
    nist_manage: [
      {
        eventId: "ev-nist-manage-flood-context",
        eventHash: "a".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-nist-manage-flood-context",
      },
    ],
    iso42001_clause_8_operation: [
      {
        eventId: "ev-iso-operation-flood-context",
        eventHash: "b".repeat(64),
        evidenceType: "tool_action",
        signedEvidenceRef: "ledger-iso-operation-flood-context",
      },
    ],
    euai_art15_accuracy_robustness: [
      {
        eventId: "ev-euai-art15-flood-context",
        eventHash: "c".repeat(64),
        evidenceType: "llm_request",
        signedEvidenceRef: "ledger-euai-art15-flood-context",
      },
    ],
    euai_art72_post_market_monitoring: [
      {
        eventId: "ev-euai-art72-flood-context",
        eventHash: "d".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-euai-art72-flood-context",
      },
    ],
    soc2_availability: [
      {
        eventId: "ev-soc2-availability-flood-context",
        eventHash: "e".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-soc2-availability-flood-context",
      },
    ],
    fedramp_contingency_planning: [
      {
        eventId: "ev-fedramp-contingency-flood-context",
        eventHash: "f".repeat(64),
        evidenceType: "tool_result",
        signedEvidenceRef: "ledger-fedramp-contingency-flood-context",
      },
    ],
  };
}

describe("GAP-1062 flood-warning control-crosswalk boundary", () => {
  it("documents live OpenAlex, Crossref, DOI, and MDPI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1062");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(MDPI_PDF);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-03-11`");
    expect(doc).toContain("GeoHazards");
    expect(doc).toContain("MDPI AG");
    expect(doc).toContain("Multidisciplinary Digital Publishing Institute");
    expect(doc).toContain("journal-article");
    expect(doc).toContain("article");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("creativecommons.org/licenses/by/4.0");
    expect(doc).toContain("Adnan Ahmed Abi Sen");
    expect(doc).toContain("Islamic University of Madinah");
    expect(doc).toContain("Northern Border University");
    expect(doc).toContain("Universidad de Granada");
    expect(doc).toContain("HTTP/2 `403`");
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

  it("uses the existing generic control crosswalk for flood-warning governance context", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1062-flood-warning-control-crosswalk",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: ownersByMappingId(),
      evidenceByMappingId: evidenceByMappingId(),
      exceptions: [
        {
          mappingId: "euai_art72_post_market_monitoring",
          exceptionId: "exc-euai-art72-monitoring-window",
          state: "approved",
          owner: "monitoring-owner@example.com",
          reason: "Post-market monitoring export has a signed refresh-window exception.",
          signedEvidenceRef: "ledger-exc-euai-art72-monitoring-window",
          signatureSha256: "1".repeat(64),
        },
      ],
      generatedAt: "2026-06-25T05:11:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(6);
    expect(receipt.rows.map((row) => row.framework)).toEqual(expect.arrayContaining([
      "NIST_AI_RMF",
      "ISO_42001",
      "EU_AI_ACT",
      "SOC2",
      "FEDRAMP",
    ]));
    expect(receipt.rows.every((row) => row.frameworkClause.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.amcQuestionIds.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceTypes.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceChainHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "euai_art72_post_market_monitoring")?.exceptionState).toBe("approved");
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);

    const markdown = renderControlCrosswalkAuditExport(receipt);
    expect(markdown).toContain("# AMC Control Crosswalk Audit Export");
    expect(markdown).toContain("NIST_AI_RMF");
    expect(markdown).toContain("Clause 8 Operation");
    expect(markdown).toContain("Art. 15 Accuracy Robustness Cybersecurity");
    expect(markdown).toContain("Art. 72 Post-Market Monitoring");
    expect(markdown).toContain("availability-owner@example.com");
    expect(markdown).toContain("CP Contingency Planning");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("Exception: approved");
  });

  it("fails closed when flood-warning paper metadata replaces signed crosswalk evidence", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1062-metadata-only-crosswalk",
      mappings: selectedMappings().slice(0, 2),
      sourceCitations: [],
      ownersByMappingId: {
        nist_manage: "grc-owner@example.com",
      },
      evidenceByMappingId: {
        nist_manage: [],
      },
      exceptions: [
        {
          mappingId: "iso42001_clause_8_operation",
          exceptionId: "exc-unsigned-flood-warning",
          state: "approved",
          owner: "operation-owner@example.com",
          reason: "Unsigned exception should not pass.",
        },
      ],
      generatedAt: "2026-06-25T05:12:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "sourceCitations:missing",
      "iso42001_clause_8_operation:owner:missing",
      "nist_manage:evidenceChain:missing",
      "iso42001_clause_8_operation:evidenceChain:missing",
      "iso42001_clause_8_operation:signedException:missing",
    ]));
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(false);
  });

  it("does not add flood-warning source identifiers to generic control-crosswalk or scoring implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.3390/geohazards7010035");
      expect(source).not.toContain("W7134903684");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
