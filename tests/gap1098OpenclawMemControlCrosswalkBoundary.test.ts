import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";

const DOC = "docs/source-reviews/GAP-1098-openclaw-mem-control-crosswalk.md";
const REPO = "https://github.com/phenomenoner/openclaw-mem";
const README = "https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/pyproject.toml";
const QUICKSTART = "https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/QUICKSTART.md";
const PRODUCT_POSITIONING = "https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/PRODUCT_POSITIONING.md";
const TITLE = "openclaw-mem";
const DESCRIPTION = "Local-first AI agent memory governance";
const IDENTIFIER = "openclaw_mem_control_crosswalk";

const implementationFiles = [
  "src/compliance/controlCrosswalk.ts",
  "src/compliance/builtInMappings.ts",
  "src/compliance/complianceEngine.ts",
  "src/compliance/complianceReport.ts",
  "src/score/index.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

function selectedMappings() {
  const ids = [
    "nist_govern",
    "iso42001_clause_8_operation",
    "euai_art12_record_keeping",
    "soc2_security",
    "gdpr_art5_accountability",
    "gdpr_art32_security_of_processing",
    "fedramp_audit_accountability",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

const sourceCitations = [
  {
    sourceId: "openclaw-mem-repo-2026-06-25",
    title: TITLE,
    url: REPO,
    retrievedAt: "2026-06-25T18:02:00.000Z",
  },
  {
    sourceId: "openclaw-mem-readme-2026-06-25",
    title: "openclaw-mem README",
    url: README,
    retrievedAt: "2026-06-25T18:02:00.000Z",
  },
  {
    sourceId: "nist-ai-rmf-1.0",
    title: "NIST AI Risk Management Framework 1.0",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    retrievedAt: "2026-06-25T18:02:00.000Z",
  },
  {
    sourceId: "iso-42001-family",
    title: "ISO/IEC 42001 AI management system family",
    url: "https://www.iso.org/standard/81230.html",
    retrievedAt: "2026-06-25T18:02:00.000Z",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T18:02:00.000Z",
  },
  {
    sourceId: "fedramp-rev5",
    title: "FedRAMP Rev. 5 baselines",
    url: "https://www.fedramp.gov/rev-5/",
    retrievedAt: "2026-06-25T18:02:00.000Z",
  },
];

function ownersByMappingId() {
  return {
    nist_govern: "governance-owner@example.com",
    iso42001_clause_8_operation: "management-system-owner@example.com",
    euai_art12_record_keeping: "record-owner@example.com",
    soc2_security: "security-owner@example.com",
    gdpr_art5_accountability: "privacy-accountability-owner@example.com",
    gdpr_art32_security_of_processing: "privacy-security-owner@example.com",
    fedramp_audit_accountability: "federal-audit-owner@example.com",
  };
}

function evidenceByMappingId() {
  return {
    nist_govern: [
      {
        eventId: "ev-nist-govern-openclaw-mem",
        eventHash: "a".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-nist-govern-openclaw-mem",
      },
    ],
    iso42001_clause_8_operation: [
      {
        eventId: "ev-iso-operation-openclaw-mem",
        eventHash: "b".repeat(64),
        evidenceType: "tool_action",
        signedEvidenceRef: "ledger-iso-operation-openclaw-mem",
      },
    ],
    euai_art12_record_keeping: [
      {
        eventId: "ev-euai-art12-openclaw-mem",
        eventHash: "c".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-euai-art12-openclaw-mem",
      },
    ],
    soc2_security: [
      {
        eventId: "ev-soc2-security-openclaw-mem",
        eventHash: "d".repeat(64),
        evidenceType: "llm_request",
        signedEvidenceRef: "ledger-soc2-security-openclaw-mem",
      },
    ],
    gdpr_art5_accountability: [
      {
        eventId: "ev-gdpr-accountability-openclaw-mem",
        eventHash: "e".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-gdpr-accountability-openclaw-mem",
      },
    ],
    gdpr_art32_security_of_processing: [
      {
        eventId: "ev-gdpr-art32-openclaw-mem",
        eventHash: "f".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-gdpr-art32-openclaw-mem",
      },
    ],
    fedramp_audit_accountability: [
      {
        eventId: "ev-fedramp-au-openclaw-mem",
        eventHash: "1".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-fedramp-au-openclaw-mem",
      },
    ],
  };
}

describe("GAP-1098 openclaw-mem control-crosswalk boundary", () => {
  it("documents live openclaw-mem source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1098");
    expect(doc).toContain("Control crosswalk coverage");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(QUICKSTART);
    expect(doc).toContain(PRODUCT_POSITIONING);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("commit `e1b305bbdb968d24823cc98a8a087b29b381f589`");
    expect(doc).toContain("verification reason `unsigned`");
    expect(doc).toContain("repository API license `MIT`");
    expect(doc).toContain("pyproject license `MIT OR Apache-2.0`");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("stars `28`");
    expect(doc).toContain("forks `4`");
    expect(doc).toContain("open issues `0`");
    expect(doc).toContain("latest release `v1.9.27`");
    expect(doc).toContain("latest tag `v1.9.30`");
    expect(doc).toContain("package name `openclaw-context-pack`");
    expect(doc).toContain("package version `1.9.30`");
    expect(doc).toContain("agent-memory");
    expect(doc).toContain("memory-governance");
    expect(doc).toContain("provenance");
    expect(doc).toContain("sqlite");
    expect(doc).toContain("README.md first 200 KB SHA-256 `32b953abb0acec04ecf73675c0309ba01ca0df5347da1c542f003c12d917f091`");
    expect(doc).toContain("LICENSE first 200 KB SHA-256 `95bb79f848383eaa9ad35129907766c491dc9230da998f4e4f75cb659ffa13a7`");
    expect(doc).toContain("pyproject.toml first 200 KB SHA-256 `00a6a603d63605f714584128117fc60a7144eca61a83455998666aadaefe43b9`");
    expect(doc).toContain("QUICKSTART.md first 200 KB SHA-256 `cc6c4bf2ad16f0d46cced63446ddb0cf6624e9226ad40df069043ab7ebc8416b`");
    expect(doc).toContain("PRODUCT_POSITIONING.md first 200 KB SHA-256 `edeedc51dadc5218ff8b7e91406bb34fe63ff6ad1b812f1e138463ff8c2e3248`");
    expect(doc).toContain("framework clause");
    expect(doc).toContain("AMC question IDs");
    expect(doc).toContain("evidence type");
    expect(doc).toContain("owner");
    expect(doc).toContain("exception state");
    expect(doc).toContain("metadata-only openclaw-mem evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing generic control crosswalk for memory-governance audit context", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1098-openclaw-mem-control-crosswalk",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: ownersByMappingId(),
      evidenceByMappingId: evidenceByMappingId(),
      exceptions: [
        {
          mappingId: "gdpr_art32_security_of_processing",
          exceptionId: "exc-memory-governance-retention-window",
          state: "approved",
          owner: "privacy-security-owner@example.com",
          reason: "Signed retention-window exception exists for a memory-governance migration.",
          signedEvidenceRef: "ledger-exc-memory-governance-retention-window",
          signatureSha256: "2".repeat(64),
        },
      ],
      generatedAt: "2026-06-25T18:03:00.000Z",
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(7);
    expect(receipt.rows.map((row) => row.framework)).toEqual(expect.arrayContaining([
      "NIST_AI_RMF",
      "ISO_42001",
      "EU_AI_ACT",
      "SOC2",
      "GDPR",
      "FEDRAMP",
    ]));
    expect(receipt.rows.every((row) => row.frameworkClause.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.amcQuestionIds.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceTypes.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.every((row) => row.sourceCitationIds.includes("openclaw-mem-repo-2026-06-25"))).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceChainHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(receipt.rows.every((row) => row.rowHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "gdpr_art32_security_of_processing")?.exceptionState).toBe("approved");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);

    const markdown = renderControlCrosswalkAuditExport(receipt);
    expect(markdown).toContain("# AMC Control Crosswalk Audit Export");
    expect(markdown).toContain("Govern");
    expect(markdown).toContain("Clause 8 Operation");
    expect(markdown).toContain("Art. 12 Record-Keeping");
    expect(markdown).toContain("Art. 32 Security of Processing");
    expect(markdown).toContain("AU Audit and Accountability");
    expect(markdown).toContain("privacy-security-owner@example.com");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("Exception: approved");
    expect(markdown).toContain("VALID");
  });

  it("fails closed when openclaw-mem metadata replaces signed crosswalk evidence", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1098-metadata-only-crosswalk",
      mappings: selectedMappings().slice(0, 3),
      sourceCitations: sourceCitations.slice(0, 1),
      ownersByMappingId: {
        nist_govern: "governance-owner@example.com",
      },
      evidenceByMappingId: {
        nist_govern: [],
      },
      exceptions: [
        {
          mappingId: "iso42001_clause_8_operation",
          exceptionId: "exc-unsigned-openclaw-mem-control",
          state: "approved",
          owner: "management-system-owner@example.com",
          reason: "Repository metadata and README claims cannot replace signed exception proof.",
        },
      ],
      generatedAt: "2026-06-25T18:04:00.000Z",
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "nist_govern:evidenceChain:missing",
      "iso42001_clause_8_operation:owner:missing",
      "iso42001_clause_8_operation:evidenceChain:missing",
      "iso42001_clause_8_operation:signedException:missing",
      "euai_art12_record_keeping:owner:missing",
      "euai_art12_record_keeping:evidenceChain:missing",
    ]));
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(false);
  });

  it("does not add openclaw-mem source identifiers to generic compliance or scoring implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("phenomenoner/openclaw-mem");
      expect(source).not.toContain("openclaw-mem");
      expect(source).not.toContain("openclaw_mem");
      expect(source).not.toContain("openclaw-context-pack");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
