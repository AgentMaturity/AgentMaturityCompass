import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";

const DOC = "docs/source-reviews/GAP-1074-microsoft-azure-ai-foundry-control-crosswalk.md";
const BACKLOG_URL = "https://azure.microsoft.com/products/ai-foundry";
const FOUNDRY = "https://azure.microsoft.com/en-us/products/ai-foundry";
const LEARN_FOUNDRY = "https://learn.microsoft.com/en-us/azure/foundry/what-is-foundry";
const RESPONSIBLE_AI = "https://learn.microsoft.com/en-us/azure/foundry/responsible-use-of-ai-overview";
const AZURE_ROBOTS = "https://azure.microsoft.com/robots.txt";
const LEARN_ROBOTS = "https://learn.microsoft.com/robots.txt";
const TITLE = "Microsoft Foundry | Microsoft Azure";
const DESCRIPTION = "Kickstart innovation with Microsoft Foundry, the AI app and agent factory designed to accelerate AI-driven, cloud-native development across industries.";
const LEARN_TITLE = "What is Microsoft Foundry? - Microsoft Foundry | Microsoft Learn";
const RESPONSIBLE_AI_TITLE = "Responsible AI for Microsoft Foundry - Microsoft Foundry | Microsoft Learn";
const IDENTIFIER = "microsoft_azure_ai_foundry_control_crosswalk";

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
    "euai_art10_data_governance",
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
    sourceId: "microsoft-foundry-product",
    title: TITLE,
    url: FOUNDRY,
    retrievedAt: "2026-06-25T07:13:19.000+05:30",
  },
  {
    sourceId: "microsoft-foundry-learn",
    title: LEARN_TITLE,
    url: LEARN_FOUNDRY,
    retrievedAt: "2026-06-25T07:13:19.000+05:30",
  },
  {
    sourceId: "nist-ai-rmf-1.0",
    title: "NIST AI Risk Management Framework 1.0",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    retrievedAt: "2026-06-25T07:13:19.000+05:30",
  },
  {
    sourceId: "iso-42001-family",
    title: "ISO/IEC 42001 AI management system family",
    url: "https://www.iso.org/standard/81230.html",
    retrievedAt: "2026-06-25T07:13:19.000+05:30",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T07:13:19.000+05:30",
  },
];

function ownersByMappingId() {
  return {
    nist_govern: "governance-owner@example.com",
    nist_map: "risk-owner@example.com",
    iso42001_clause_5_leadership: "management-system-owner@example.com",
    euai_art9_risk_management: "euai-risk-owner@example.com",
    euai_art10_data_governance: "data-governance-owner@example.com",
    soc2_security: "security-owner@example.com",
    gdpr_art5_accountability: "privacy-accountability-owner@example.com",
  };
}

function evidenceByMappingId() {
  return {
    nist_govern: [
      {
        eventId: "ev-nist-govern-foundry-context",
        eventHash: "a".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-nist-govern-foundry-context",
      },
    ],
    nist_map: [
      {
        eventId: "ev-nist-map-foundry-context",
        eventHash: "b".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-nist-map-foundry-context",
      },
    ],
    iso42001_clause_5_leadership: [
      {
        eventId: "ev-iso-leadership-foundry-context",
        eventHash: "c".repeat(64),
        evidenceType: "tool_action",
        signedEvidenceRef: "ledger-iso-leadership-foundry-context",
      },
    ],
    euai_art9_risk_management: [
      {
        eventId: "ev-euai-art9-foundry-context",
        eventHash: "d".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-euai-art9-foundry-context",
      },
    ],
    euai_art10_data_governance: [
      {
        eventId: "ev-euai-art10-foundry-context",
        eventHash: "e".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-euai-art10-foundry-context",
      },
    ],
    soc2_security: [
      {
        eventId: "ev-soc2-security-foundry-context",
        eventHash: "f".repeat(64),
        evidenceType: "llm_request",
        signedEvidenceRef: "ledger-soc2-security-foundry-context",
      },
    ],
    gdpr_art5_accountability: [
      {
        eventId: "ev-gdpr-accountability-foundry-context",
        eventHash: "1".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-gdpr-accountability-foundry-context",
      },
    ],
  };
}

describe("GAP-1074 Microsoft Azure AI Foundry control-crosswalk boundary", () => {
  it("documents live Microsoft Foundry metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1074");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain(BACKLOG_URL);
    expect(doc).toContain(FOUNDRY);
    expect(doc).toContain(LEARN_FOUNDRY);
    expect(doc).toContain(RESPONSIBLE_AI);
    expect(doc).toContain(AZURE_ROBOTS);
    expect(doc).toContain(LEARN_ROBOTS);
    expect(doc).toContain(LEARN_TITLE);
    expect(doc).toContain(RESPONSIBLE_AI_TITLE);
    expect(doc).toContain("HTTP `200`");
    expect(doc).toContain("The AI app and agent factory");
    expect(doc).toContain("Build, connect, and scale intelligent agents");
    expect(doc).toContain("Govern every agent, tool, and knowledge source from a unified control plane");
    expect(doc).toContain("Monitor, evaluate, and optimize every agent in real-time");
    expect(doc).toContain("Protect every agent with customizable trust controls");
    expect(doc).toContain("Control crosswalk coverage");
    expect(doc).toContain("framework clause");
    expect(doc).toContain("AMC question IDs");
    expect(doc).toContain("evidence type");
    expect(doc).toContain("owner");
    expect(doc).toContain("exception state");
    expect(doc).toContain("metadata-only Microsoft Foundry evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic control crosswalk for Microsoft Foundry governance context", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1074-microsoft-foundry-control-crosswalk",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: ownersByMappingId(),
      evidenceByMappingId: evidenceByMappingId(),
      exceptions: [
        {
          mappingId: "euai_art10_data_governance",
          exceptionId: "exc-euai-art10-data-governance-window",
          state: "approved",
          owner: "data-governance-owner@example.com",
          reason: "Data governance control export has a signed refresh-window exception.",
          signedEvidenceRef: "ledger-exc-euai-art10-data-governance-window",
          signatureSha256: "2".repeat(64),
        },
      ],
      generatedAt: "2026-06-25T07:14:00.000+05:30",
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
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceChainHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "euai_art10_data_governance")?.exceptionState).toBe("approved");
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);

    const markdown = renderControlCrosswalkAuditExport(receipt);
    expect(markdown).toContain("# AMC Control Crosswalk Audit Export");
    expect(markdown).toContain("Govern");
    expect(markdown).toContain("Map");
    expect(markdown).toContain("Clause 5 Leadership");
    expect(markdown).toContain("Art. 9 Risk Management");
    expect(markdown).toContain("Art. 10 Data Governance");
    expect(markdown).toContain("privacy-accountability-owner@example.com");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("Exception: approved");
  });

  it("fails closed when Microsoft Foundry metadata replaces signed crosswalk evidence", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1074-metadata-only-crosswalk",
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
          mappingId: "nist_map",
          exceptionId: "exc-unsigned-foundry-control",
          state: "approved",
          owner: "risk-owner@example.com",
          reason: "Unsigned control exception should not pass.",
        },
      ],
      generatedAt: "2026-06-25T07:15:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "nist_map:owner:missing",
      "nist_govern:evidenceChain:missing",
      "nist_map:evidenceChain:missing",
      "nist_map:signedException:missing",
    ]));
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(false);
  });

  it("does not add Microsoft Foundry identifiers to generic control-crosswalk or scoring implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Azure AI Foundry");
      expect(source).not.toContain("Microsoft Foundry");
      expect(source).not.toContain("azure.microsoft.com");
      expect(source).not.toContain("learn.microsoft.com/en-us/azure/foundry");
      expect(source).not.toContain("COMP-130");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
