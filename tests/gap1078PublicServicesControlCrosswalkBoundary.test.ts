import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";

const DOC = "docs/source-reviews/GAP-1078-public-services-control-crosswalk.md";
const OPENALEX = "https://openalex.org/W7125391529";
const OPENALEX_API = "https://api.openalex.org/works/W7125391529";
const DOI = "https://doi.org/10.1145/3772318.3790297";
const ACM = "https://dl.acm.org/doi/10.1145/3772318.3790297";
const TITLE = "The Promises and Perils of using LLMs for Effective Public Services";
const IDENTIFIER = "public_services_control_crosswalk";

const implementationFiles = [
  "src/compliance/controlCrosswalk.ts",
  "src/compliance/builtInMappings.ts",
  "src/score/index.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

function selectedMappings() {
  const ids = [
    "nist_govern",
    "nist_map",
    "iso42001_clause_5_leadership",
    "euai_art9_risk_management",
    "euai_art14_human_oversight",
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
    sourceId: "public-services-llm-paper",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T07:51:00.000+05:30",
  },
  {
    sourceId: "nist-ai-rmf-1.0",
    title: "NIST AI Risk Management Framework 1.0",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    retrievedAt: "2026-06-25T07:51:00.000+05:30",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T07:51:00.000+05:30",
  },
];

function ownersByMappingId() {
  return {
    nist_govern: "governance-owner@example.com",
    nist_map: "risk-owner@example.com",
    iso42001_clause_5_leadership: "management-system-owner@example.com",
    euai_art9_risk_management: "euai-risk-owner@example.com",
    euai_art14_human_oversight: "oversight-owner@example.com",
    soc2_security: "security-owner@example.com",
    gdpr_art5_accountability: "privacy-accountability-owner@example.com",
  };
}

function evidenceByMappingId() {
  return {
    nist_govern: [
      {
        eventId: "ev-public-services-nist-govern",
        eventHash: "a".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-public-services-nist-govern",
      },
    ],
    nist_map: [
      {
        eventId: "ev-public-services-nist-map",
        eventHash: "b".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-public-services-nist-map",
      },
    ],
    iso42001_clause_5_leadership: [
      {
        eventId: "ev-public-services-iso-leadership",
        eventHash: "c".repeat(64),
        evidenceType: "tool_action",
        signedEvidenceRef: "ledger-public-services-iso-leadership",
      },
    ],
    euai_art9_risk_management: [
      {
        eventId: "ev-public-services-euai-risk",
        eventHash: "d".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-public-services-euai-risk",
      },
    ],
    euai_art14_human_oversight: [
      {
        eventId: "ev-public-services-human-oversight",
        eventHash: "e".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-public-services-human-oversight",
      },
    ],
    soc2_security: [
      {
        eventId: "ev-public-services-soc2-security",
        eventHash: "f".repeat(64),
        evidenceType: "llm_request",
        signedEvidenceRef: "ledger-public-services-soc2-security",
      },
    ],
    gdpr_art5_accountability: [
      {
        eventId: "ev-public-services-gdpr-accountability",
        eventHash: "1".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-public-services-gdpr-accountability",
      },
    ],
  };
}

describe("GAP-1078 public-services control-crosswalk boundary", () => {
  it("documents live OpenAlex and DOI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1078");
    expect(doc).toContain("Control crosswalk coverage");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ACM);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-04-13`");
    expect(doc).toContain("article");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("University of Toronto");
    expect(doc).toContain("Georgia Institute of Technology");
    expect(doc).toContain("University of Wisconsin");
    expect(doc).toContain("Social Welfare");
    expect(doc).toContain("Government (linguistics)");
    expect(doc).toContain("public-service delivery");
    expect(doc).toContain("high-stakes decision-making");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `403`");
    expect(doc).toContain("Just a moment");
    expect(doc).toContain("framework clause");
    expect(doc).toContain("AMC question IDs");
    expect(doc).toContain("evidence type");
    expect(doc).toContain("owner");
    expect(doc).toContain("exception state");
    expect(doc).toContain("metadata-only public-services evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic control crosswalk for public-services governance context", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1078-public-services-control-crosswalk",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: ownersByMappingId(),
      evidenceByMappingId: evidenceByMappingId(),
      exceptions: [
        {
          mappingId: "euai_art14_human_oversight",
          exceptionId: "exc-public-services-human-oversight-refresh",
          state: "approved",
          owner: "oversight-owner@example.com",
          reason: "Human-oversight evidence refresh has a signed time-boxed exception.",
          signedEvidenceRef: "ledger-exc-public-services-human-oversight-refresh",
          signatureSha256: "2".repeat(64),
        },
      ],
      generatedAt: "2026-06-25T07:52:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(7);
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
    expect(receipt.rows.every((row) => row.owner.length > 0)).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "euai_art14_human_oversight")?.exceptionState).toBe("approved");
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);

    const markdown = renderControlCrosswalkAuditExport(receipt);
    expect(markdown).toContain("# AMC Control Crosswalk Audit Export");
    expect(markdown).toContain("EU_AI_ACT");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("Exception: approved");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when metadata replaces mapped controls, owners, exceptions, or signed evidence", () => {
    const [mapping] = selectedMappings();
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1078-metadata-only-control-crosswalk",
      mappings: [mapping],
      sourceCitations: [],
      ownersByMappingId: {},
      evidenceByMappingId: {},
      exceptions: [
        {
          mappingId: mapping.id,
          exceptionId: "exc-metadata-only",
          state: "approved",
          owner: "missing-signed-proof@example.com",
          reason: "Paper metadata alone should not approve a control exception.",
        },
      ],
      generatedAt: "2026-06-25T07:53:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "sourceCitations:missing",
      `${mapping.id}:owner:missing`,
      `${mapping.id}:evidenceChain:missing`,
      `${mapping.id}:signedException:missing`,
    ]));
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(false);
  });

  it("does not add public-services paper identifiers to generic compliance or score implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.1145/3772318.3790297");
      expect(source).not.toContain("W7125391529");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
