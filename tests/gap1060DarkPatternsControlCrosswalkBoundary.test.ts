import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  renderControlCrosswalkAuditExport,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";

const DOC = "docs/source-reviews/GAP-1060-dark-patterns-control-crosswalk.md";
const TITLE = "The Siren Song of LLMs: How Users Perceive and Respond to Dark Patterns in Large Language Models";
const OPENALEX = "https://openalex.org/W4415250053";
const OPENALEX_API = "https://api.openalex.org/works/W4415250053";
const DOI = "https://doi.org/10.1145/3772318.3791149";
const CROSSREF = "https://api.crossref.org/works/10.1145/3772318.3791149";
const ACM = "https://dl.acm.org/doi/10.1145/3772318.3791149";
const IDENTIFIER = "dark_patterns_control_crosswalk";

const implementationFiles = [
  "src/compliance/controlCrosswalk.ts",
  "src/compliance/builtInMappings.ts",
  "src/score/index.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

function selectedMappings() {
  const ids = [
    "nist_govern",
    "euai_art13_transparency",
    "euai_art14_human_oversight",
    "gdpr_art5_lawfulness_fairness_transparency",
    "soc2_privacy",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

const sourceCitations = [
  {
    sourceId: "dark-patterns-llm-chi-2026",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T04:50:00.000+05:30",
  },
  {
    sourceId: "eu-ai-act-2024-1689",
    title: "Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T04:50:00.000+05:30",
  },
  {
    sourceId: "nist-ai-rmf-1.0",
    title: "NIST AI Risk Management Framework 1.0",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    retrievedAt: "2026-06-25T04:50:00.000+05:30",
  },
  {
    sourceId: "gdpr-2016-679",
    title: "Regulation (EU) 2016/679",
    url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
    retrievedAt: "2026-06-25T04:50:00.000+05:30",
  },
];

function ownersByMappingId() {
  return {
    nist_govern: "grc-owner@example.com",
    euai_art13_transparency: "transparency-owner@example.com",
    euai_art14_human_oversight: "oversight-owner@example.com",
    gdpr_art5_lawfulness_fairness_transparency: "privacy-owner@example.com",
    soc2_privacy: "soc2-owner@example.com",
  };
}

function evidenceByMappingId() {
  return {
    nist_govern: [
      {
        eventId: "ev-nist-govern-dark-patterns",
        eventHash: "a".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-nist-govern-dark-patterns",
      },
    ],
    euai_art13_transparency: [
      {
        eventId: "ev-euai-art13-transparency-dark-patterns",
        eventHash: "b".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-euai-art13-transparency-dark-patterns",
      },
    ],
    euai_art14_human_oversight: [
      {
        eventId: "ev-euai-art14-human-oversight-dark-patterns",
        eventHash: "c".repeat(64),
        evidenceType: "review",
        signedEvidenceRef: "ledger-euai-art14-human-oversight-dark-patterns",
      },
    ],
    gdpr_art5_lawfulness_fairness_transparency: [
      {
        eventId: "ev-gdpr-art5-fairness-dark-patterns",
        eventHash: "d".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-gdpr-art5-fairness-dark-patterns",
      },
    ],
    soc2_privacy: [
      {
        eventId: "ev-soc2-privacy-dark-patterns",
        eventHash: "e".repeat(64),
        evidenceType: "audit",
        signedEvidenceRef: "ledger-soc2-privacy-dark-patterns",
      },
    ],
  };
}

describe("GAP-1060 dark-patterns control-crosswalk boundary", () => {
  it("documents live OpenAlex, Crossref, DOI, and ACM metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1060");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ACM);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-04-13`");
    expect(doc).toContain("Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems");
    expect(doc).toContain("ACM");
    expect(doc).toContain("proceedings-article");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("Yike Shi");
    expect(doc).toContain("Carnegie Mellon University");
    expect(doc).toContain("New York University Shanghai");
    expect(doc).toContain("Cloudflare");
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

  it("uses the existing generic control crosswalk for dark-patterns governance controls", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1060-dark-patterns-control-crosswalk",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: ownersByMappingId(),
      evidenceByMappingId: evidenceByMappingId(),
      exceptions: [
        {
          mappingId: "euai_art13_transparency",
          exceptionId: "exc-euai-art13-label-refresh",
          state: "approved",
          owner: "transparency-owner@example.com",
          reason: "Transparency label refresh has a signed remediation plan.",
          signedEvidenceRef: "ledger-exc-euai-art13-label-refresh",
          signatureSha256: "f".repeat(64),
        },
      ],
      generatedAt: "2026-06-25T04:51:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(5);
    expect(receipt.rows.map((row) => row.framework)).toEqual(expect.arrayContaining([
      "NIST_AI_RMF",
      "EU_AI_ACT",
      "GDPR",
      "SOC2",
    ]));
    expect(receipt.rows.every((row) => row.frameworkClause.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.amcQuestionIds.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceTypes.length > 0)).toBe(true);
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.every((row) => row.evidenceChainHash.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "euai_art13_transparency")?.exceptionState).toBe("approved");
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);

    const markdown = renderControlCrosswalkAuditExport(receipt);
    expect(markdown).toContain("# AMC Control Crosswalk Audit Export");
    expect(markdown).toContain("Art. 13 Transparency");
    expect(markdown).toContain("Art. 14 Human Oversight");
    expect(markdown).toContain("Art. 5 Lawfulness Fairness Transparency");
    expect(markdown).toContain("soc2-owner@example.com");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("Exception: approved");
  });

  it("fails closed when dark-patterns metadata replaces signed crosswalk evidence", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1060-metadata-only-crosswalk",
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
          mappingId: "euai_art13_transparency",
          exceptionId: "exc-unsigned-dark-patterns",
          state: "approved",
          owner: "transparency-owner@example.com",
          reason: "Unsigned exception should not pass.",
        },
      ],
      generatedAt: "2026-06-25T04:52:00.000+05:30",
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "sourceCitations:missing",
      "euai_art13_transparency:owner:missing",
      "nist_govern:evidenceChain:missing",
      "euai_art13_transparency:evidenceChain:missing",
      "euai_art13_transparency:signedException:missing",
    ]));
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(false);
  });

  it("does not add dark-patterns source identifiers to generic control-crosswalk or scoring implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.1145/3772318.3791149");
      expect(source).not.toContain("W4415250053");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
