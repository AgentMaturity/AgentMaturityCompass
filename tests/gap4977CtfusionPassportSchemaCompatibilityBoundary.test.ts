import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURRENT_PASSPORT_SCHEMA_VERSION,
  PASSPORT_SCHEMA_COMPATIBILITY_VERSION,
  PASSPORT_SCHEMA_ID,
  buildPassportSchemaCompatibilityReport,
  verifyPassportSchemaCompatibilityReport,
  type PassportSchemaCompatibilitySourceCitation
} from "../src/passport/passportSchemaCompatibility.js";

const DOC = "docs/source-reviews/GAP-4977-ctfusion-passport-schema-compatibility.md";
const PASSPORT_DOC = "docs/AGENT_PASSPORT.md";
const STANDARD_DOC = "docs/OPEN_STANDARD.md";
const OPENALEX = "https://openalex.org/W7161035179";
const OPENALEX_API = "https://api.openalex.org/works/W7161035179";
const DOI = "https://doi.org/10.48550/arxiv.2605.11504";
const ARXIV = "https://arxiv.org/abs/2605.11504";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2605.11504";
const IDENTIFIER = "std-passport-schema";
const IMPLEMENTATION_FILES = [
  "src/passport/passportSchemaCompatibility.ts",
  "src/passport/passportSchema.ts",
  "src/standard/standardGenerator.ts",
  "src/index.ts"
];

const sourceCitations: PassportSchemaCompatibilitySourceCitation[] = [
  {
    sourceId: "openalex",
    title: "OpenAlex CTFusion work metadata",
    url: OPENALEX_API,
    retrievedAt: "2026-06-25T12:55:00.000Z"
  },
  {
    sourceId: "arxiv",
    title: "arXiv CTFusion abstract metadata",
    url: ARXIV,
    retrievedAt: "2026-06-25T12:55:00.000Z"
  }
];

function validPassport(passportId: string) {
  return {
    v: 1,
    passportId,
    generatedTs: Date.UTC(2026, 5, 25, 12, 55, 0),
    scope: {
      type: "AGENT",
      idHash: "a".repeat(64)
    },
    trust: {
      integrityIndex: 0.94,
      correlationRatio: 0.91,
      trustLabel: "HIGH",
      evidenceCoverage: {
        observedShare: 0.82,
        attestedShare: 0.15,
        selfReportedShare: 0.03
      },
      notary: {
        enabled: false
      }
    },
    status: {
      label: "VERIFIED",
      reasons: ["FIXTURE_VERIFIED"]
    },
    maturity: {
      status: "OK",
      overall: 4.1,
      byFiveLayers: {
        strategicOps: 4,
        leadership: 4,
        culture: 4,
        resilience: 4,
        skills: 4.5
      },
      unknownQuestionsCount: 0
    },
    strategyFailureRisks: {
      ecosystemFocusRisk: 20,
      clarityPathRisk: 18,
      economicSignificanceRisk: 16,
      riskAssuranceRisk: 14,
      digitalDualityRisk: 12
    },
    valueDimensions: {
      emotionalValue: 70,
      functionalValue: 82,
      economicValue: 78,
      brandValue: 75,
      lifetimeValue: 80,
      valueScore: 77
    },
    checkpoints: {
      cgxPackSha256: "b".repeat(64),
      lastAssuranceCert: {
        status: "PASS",
        sha256: "c".repeat(64),
        issuedTs: Date.UTC(2026, 5, 25, 12, 40, 0),
        riskAssuranceScore: 91
      },
      lastBench: {
        sha256: "d".repeat(64),
        generatedTs: Date.UTC(2026, 5, 25, 12, 41, 0)
      },
      lastAuditBinder: {
        sha256: "e".repeat(64),
        generatedTs: Date.UTC(2026, 5, 25, 12, 42, 0)
      },
      lastValueSnapshot: {
        sha256: "f".repeat(64),
        generatedTs: Date.UTC(2026, 5, 25, 12, 43, 0)
      }
    },
    governanceSummary: {
      promptEnforcement: "ON",
      truthguard: "ENFORCE",
      providerAllowlist: "PASS",
      modelAllowlist: "PASS",
      toolAllowlist: "PASS",
      approvals: "PASS",
      leases: "PASS",
      pluginsIntegrity: "PASS"
    },
    bindings: {
      passportPolicySha256: "1".repeat(64),
      canonSha256: "2".repeat(64),
      bankSha256: "3".repeat(64),
      trustMode: "LOCAL_VAULT"
    },
    proofBindings: {
      transparencyRootSha256: "4".repeat(64),
      merkleRootSha256: "5".repeat(64),
      includedEventProofIds: ["event-proof-1"],
      calculationManifestSha256: "6".repeat(64)
    }
  };
}

describe("GAP-4977 CTFusion Passport schema compatibility boundary", () => {
  it("documents live CTFusion paper metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4977");
    expect(doc).toContain("CTFusion: A CTF-based Benchmark for LLM Agent Evaluation");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain("Dongjun Lee");
    expect(doc).toContain("Ga-eun Bae");
    expect(doc).toContain("Insu Yun");
    expect(doc).toContain("Live CTFs");
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("Schema version, fixture corpus, import/export result, and compatibility matrix");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No CTFusion adapter");
  });

  it("updates Passport and Open Standard docs with the compatibility report contract", () => {
    const passportDoc = readFileSync(PASSPORT_DOC, "utf8");
    const standardDoc = readFileSync(STANDARD_DOC, "utf8");

    expect(passportDoc).toContain(PASSPORT_SCHEMA_COMPATIBILITY_VERSION);
    expect(passportDoc).toContain("passport schema compatibility report");
    expect(standardDoc).toContain(PASSPORT_SCHEMA_COMPATIBILITY_VERSION);
    expect(standardDoc).toContain("fixture corpus");
    expect(standardDoc).toContain("compatibility matrix");
  });

  it("builds a versioned compatibility report with import, export, and round-trip coverage", () => {
    const report = buildPassportSchemaCompatibilityReport({
      generatedAt: "2026-06-25T12:56:00.000Z",
      fixtureCorpusId: "amc-passport-schema-compatibility-fixtures-v1",
      sourceCitations,
      fixtures: [
        {
          fixtureId: "amc-current-export",
          partnerSystem: "amc-open-standard",
          schemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
          direction: "export",
          payload: validPassport("pass_export_fixture_001"),
          evidenceRefs: ["schema:amcpass", "export:fixture:001"]
        },
        {
          fixtureId: "amc-current-import",
          partnerSystem: "amc-open-standard",
          schemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
          direction: "import",
          payload: validPassport("pass_current_import_001"),
          evidenceRefs: ["schema:amcpass", "import:fixture:amc"]
        },
        {
          fixtureId: "amc-current-round-trip",
          partnerSystem: "amc-open-standard",
          schemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
          direction: "round_trip",
          payload: validPassport("pass_current_round_001"),
          evidenceRefs: ["schema:amcpass", "round-trip:fixture:amc"]
        },
        {
          fixtureId: "partner-import-extra-fields",
          partnerSystem: "partner-ci",
          schemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
          direction: "import",
          payload: {
            ...validPassport("pass_import_fixture_001"),
            partnerMetadata: {
              system: "partner-ci",
              retainedByPartner: true
            }
          },
          evidenceRefs: ["schema:amcpass", "import:fixture:001"]
        },
        {
          fixtureId: "partner-round-trip",
          partnerSystem: "partner-ci",
          schemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
          direction: "round_trip",
          payload: validPassport("pass_round_trip_001"),
          evidenceRefs: ["schema:amcpass", "round-trip:fixture:001"]
        },
        {
          fixtureId: "partner-export",
          partnerSystem: "partner-ci",
          schemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
          direction: "export",
          payload: validPassport("pass_partner_export_001"),
          evidenceRefs: ["schema:amcpass", "export:fixture:partner"]
        }
      ]
    });

    expect(report.reportVersion).toBe(PASSPORT_SCHEMA_COMPATIBILITY_VERSION);
    expect(report.schemaId).toBe(PASSPORT_SCHEMA_ID);
    expect(report.currentSchemaVersion).toBe(CURRENT_PASSPORT_SCHEMA_VERSION);
    expect(report.importExportResults).toHaveLength(6);
    expect(report.importExportResults.every((row) => row.status === "compatible")).toBe(true);

    const partnerRow = report.compatibilityMatrix.find((row) => row.partnerSystem === "partner-ci");
    expect(partnerRow).toMatchObject({
      schemaId: PASSPORT_SCHEMA_ID,
      schemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
      importCompatible: true,
      exportCompatible: true,
      roundTripCompatible: true,
      status: "compatible"
    });
    expect(verifyPassportSchemaCompatibilityReport(report)).toEqual({ status: "pass", reasons: [] });
  });

  it("fails closed when paper metadata replaces fixture corpus, import/export results, or matrix proof", () => {
    const metadataOnly = {
      reportVersion: PASSPORT_SCHEMA_COMPATIBILITY_VERSION,
      schemaId: PASSPORT_SCHEMA_ID,
      currentSchemaVersion: CURRENT_PASSPORT_SCHEMA_VERSION,
      generatedAt: "2026-06-25T12:57:00.000Z",
      fixtureCorpusId: "CTFusion title and DOI only",
      sourceCitations,
      importExportResults: [],
      compatibilityMatrix: [],
      reportHash: ""
    };

    expect(verifyPassportSchemaCompatibilityReport(metadataOnly).status).toBe("fail_closed");
    expect(verifyPassportSchemaCompatibilityReport(metadataOnly).reasons).toEqual(expect.arrayContaining([
      "importExportResults:missing",
      "compatibilityMatrix:missing",
      "compatibilityMatrix:full-coverage-missing",
      "reportHash:missing"
    ]));
  });

  it("does not add CTFusion-specific identifiers to generic Passport compatibility implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => existsSync(file) ? readFileSync(file, "utf8") : "").join("\n");
    expect(combined).not.toContain("CTFusion");
    expect(combined).not.toContain("2605.11504");
    expect(combined).not.toContain("Live CTF");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
