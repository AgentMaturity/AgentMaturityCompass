import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import {
  buildControlCrosswalkReceipt,
  verifyControlCrosswalkReceipt,
} from "../src/compliance/controlCrosswalk.js";
import {
  buildGovernanceExceptionLifecycleReceipt,
  renderGovernanceExceptionLifecycleAuditExport,
  verifyGovernanceExceptionLifecycleReceipt,
  type GovernanceExceptionLifecycleEvidenceLink,
  type GovernanceExceptionLifecycleSourceCitation,
} from "../src/compliance/exceptionLifecycle.js";

const DOC = "docs/source-reviews/GAP-1071-bigid-exception-lifecycle.md";
const HOME = "https://bigid.com";
const AI = "https://bigid.com/ai/";
const COMPLIANCE = "https://bigid.com/bigid-compliance/";
const SECURITY = "https://bigid.com/bigid-security/";
const PRIVACY_OPS = "https://bigid.com/privacy-ops/";
const DATA_CLASSIFICATION = "https://bigid.com/data-classification/";
const SECRETS_SECURITY = "https://bigid.com/secrets-security/";
const OPERATIONALIZE_PRIVACY = "https://bigid.com/operationalize-privacy/";
const PI_PII_INVENTORY = "https://bigid.com/privacy/pi-pii-inventory/";
const US_PRIVACY_REGULATIONS = "https://bigid.com/compliance/compare-us-privacy-regulations/";
const TITLE = "BigID: Enterprise Data Security Platform for DSPM &amp; AI";
const DESCRIPTION = "BigID delivers enterprise data security, DSPM, and AI governance to discover, classify, and protect sensitive data across cloud, on-prem, and AI systems. Trusted by Fortune 500.";
const IDENTIFIER = "bigid_exception_lifecycle";

const implementationFiles = [
  "src/compliance/exceptionLifecycle.ts",
  "src/compliance/controlCrosswalk.ts",
  "src/compliance/providerRisk.ts",
  "src/enforce/policyFirewall.ts",
  "src/incidents/incidentTypes.ts",
  "docs/COMPLIANCE_FRAMEWORKS.md",
];

const sourceCitations: GovernanceExceptionLifecycleSourceCitation[] = [
  {
    sourceId: "bigid-data-security-ai-governance",
    title: TITLE,
    url: HOME,
    retrievedAt: "2026-06-25T06:48:33.000+05:30",
  },
  {
    sourceId: "gdpr-art5-storage-limitation-accountability",
    title: "Regulation (EU) 2016/679 Article 5 principles",
    url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
    retrievedAt: "2026-06-25T06:48:33.000+05:30",
  },
];

function signedEvidence(id: string, seed: string): GovernanceExceptionLifecycleEvidenceLink {
  return {
    eventId: id,
    eventHash: seed.repeat(64).slice(0, 64),
    eventType: "audit",
    signedEvidenceRef: `ledger-${id}`,
  };
}

function selectedMappings() {
  const ids = [
    "nist_govern",
    "gdpr_art5_storage_limitation",
    "gdpr_art5_integrity_confidentiality",
    "gdpr_art5_accountability",
    "soc2_confidentiality",
    "euai_art10_data_governance",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

describe("GAP-1071 BigID exception-lifecycle boundary", () => {
  it("documents live BigID source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1071");
    expect(doc).toContain("Exception and waiver lifecycle");
    expect(doc).toContain(HOME);
    expect(doc).toContain(AI);
    expect(doc).toContain(COMPLIANCE);
    expect(doc).toContain(SECURITY);
    expect(doc).toContain(PRIVACY_OPS);
    expect(doc).toContain(DATA_CLASSIFICATION);
    expect(doc).toContain(SECRETS_SECURITY);
    expect(doc).toContain(OPERATIONALIZE_PRIVACY);
    expect(doc).toContain(PI_PII_INVENTORY);
    expect(doc).toContain(US_PRIVACY_REGULATIONS);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("OpenAI crawler allow rules");
    expect(doc).toContain("Data Classification | BigID");
    expect(doc).toContain("Secrets Security | BigID");
    expect(doc).toContain("Operationalize Privacy | BigID");
    expect(doc).toContain("exception request");
    expect(doc).toContain("approver");
    expect(doc).toContain("expiry");
    expect(doc).toContain("compensating control");
    expect(doc).toContain("renewal outcome");
    expect(doc).toContain("metadata-only BigID evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic governance exception lifecycle receipt for a source-cited data governance waiver", () => {
    const receipt = buildGovernanceExceptionLifecycleReceipt({
      receiptId: "gap1071-bigid-exception-lifecycle",
      generatedAt: "2026-06-25T06:49:00.000+05:30",
      sourceCitations,
      exceptions: [
        {
          exceptionId: "exc-data-retention-ai-scan-001",
          policyId: "policy-sensitive-data-ai-retention",
          controlId: "gdpr_art5_storage_limitation",
          owner: "privacy-owner@example.com",
          requesterId: "requester-data-governance-owner",
          requestReason: "Temporary waiver while sensitive-data classification rollout completes.",
          requestedAt: "2026-06-25T06:49:10.000+05:30",
          requestSignedEvidenceRef: "ledger-exc-data-retention-request",
          requestSignatureSha256: "a".repeat(64),
          approverId: "approver-privacy-governance",
          approvalDecision: "approved",
          approvedAt: "2026-06-25T06:50:00.000+05:30",
          approvalSignedEvidenceRef: "ledger-exc-data-retention-approval",
          approvalSignatureSha256: "b".repeat(64),
          expiresAt: "2026-07-25T06:50:00.000+05:30",
          expiryCheckedAt: "2026-06-25T06:50:30.000+05:30",
          expirySignedEvidenceRef: "ledger-exc-data-retention-expiry-check",
          expirySignatureSha256: "c".repeat(64),
          compensatingControls: [
            {
              controlId: "comp-control-ai-data-access-review",
              owner: "security-owner@example.com",
              description: "Weekly data-access review remains active until the classifier rollout is complete.",
              dueAt: "2026-07-01T00:00:00.000+05:30",
              signedEvidenceRef: "ledger-comp-control-ai-data-access-review",
              signatureSha256: "d".repeat(64),
            },
          ],
          renewalDecision: {
            decision: "not_requested",
            decidedAt: "2026-06-25T06:51:00.000+05:30",
            approverId: "approver-privacy-governance",
            reason: "No renewal requested; exception expires after the rollout window.",
            signedEvidenceRef: "ledger-exc-data-retention-renewal",
            signatureSha256: "e".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-bigid-exception-request", "f"),
            signedEvidence("ev-bigid-exception-approval", "1"),
            signedEvidence("ev-bigid-exception-renewal", "2"),
          ],
          sourceCitationIds: [
            "bigid-data-security-ai-governance",
            "gdpr-art5-storage-limitation-accountability",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      exceptionId: "exc-data-retention-ai-scan-001",
      owner: "privacy-owner@example.com",
      approverId: "approver-privacy-governance",
      approvalDecision: "approved",
      renewalOutcome: "not_requested",
      compensatingControlIds: ["comp-control-ai-data-access-review"],
    });
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyGovernanceExceptionLifecycleReceipt(receipt).valid).toBe(true);

    const markdown = renderGovernanceExceptionLifecycleAuditExport(receipt);
    expect(markdown).toContain("# AMC Governance Exception Lifecycle Audit Export");
    expect(markdown).toContain("privacy-owner@example.com");
    expect(markdown).toContain("approver-privacy-governance");
    expect(markdown).toContain("comp-control-ai-data-access-review");
    expect(markdown).toContain("not_requested");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("keeps signed exception lifecycle evidence compatible with the generic control crosswalk", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1071-bigid-control-crosswalk",
      generatedAt: "2026-06-25T06:52:00.000+05:30",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: {
        nist_govern: "grc-owner@example.com",
        gdpr_art5_storage_limitation: "privacy-owner@example.com",
        gdpr_art5_integrity_confidentiality: "security-owner@example.com",
        gdpr_art5_accountability: "privacy-owner@example.com",
        soc2_confidentiality: "security-owner@example.com",
        euai_art10_data_governance: "ai-governance-owner@example.com",
      },
      evidenceByMappingId: {
        nist_govern: [{ eventId: "ev-nist-govern-bigid", eventHash: "3".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-nist-govern-bigid" }],
        gdpr_art5_storage_limitation: [{ eventId: "ev-gdpr-storage-bigid", eventHash: "4".repeat(64), evidenceType: "review", signedEvidenceRef: "ledger-gdpr-storage-bigid" }],
        gdpr_art5_integrity_confidentiality: [{ eventId: "ev-gdpr-integrity-bigid", eventHash: "5".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-gdpr-integrity-bigid" }],
        gdpr_art5_accountability: [{ eventId: "ev-gdpr-accountability-bigid", eventHash: "6".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-gdpr-accountability-bigid" }],
        soc2_confidentiality: [{ eventId: "ev-soc2-confidentiality-bigid", eventHash: "7".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-soc2-confidentiality-bigid" }],
        euai_art10_data_governance: [{ eventId: "ev-euai-art10-bigid", eventHash: "9".repeat(64), evidenceType: "review", signedEvidenceRef: "ledger-euai-art10-bigid" }],
      },
      exceptions: [
        {
          mappingId: "gdpr_art5_storage_limitation",
          exceptionId: "exc-data-retention-ai-scan-001",
          state: "approved",
          owner: "privacy-owner@example.com",
          reason: "Signed lifecycle receipt exists for the temporary data-retention waiver.",
          signedEvidenceRef: "ledger-exc-data-retention-ai-scan-001",
          signatureSha256: "8".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows.every((row) => row.sourceCitationIds.includes("bigid-data-security-ai-governance"))).toBe(true);
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "gdpr_art5_storage_limitation")?.exceptionState).toBe("approved");
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);
  });

  it("fails closed when BigID metadata replaces signed exception lifecycle evidence", () => {
    const receipt = buildGovernanceExceptionLifecycleReceipt({
      receiptId: "gap1071-metadata-only-exception-lifecycle",
      generatedAt: "2026-06-25T06:53:00.000+05:30",
      sourceCitations: [sourceCitations[0]],
      exceptions: [
        {
          exceptionId: "metadata-only-bigid-exception",
          policyId: "",
          controlId: "gdpr_art5_storage_limitation",
          owner: "",
          requesterId: "",
          requestReason: "Website metadata only.",
          requestedAt: "",
          requestSignedEvidenceRef: "",
          requestSignatureSha256: "",
          approverId: "",
          approvalDecision: "approved",
          approvedAt: "",
          approvalSignedEvidenceRef: "",
          approvalSignatureSha256: "",
          expiresAt: "",
          expiryCheckedAt: "",
          expirySignedEvidenceRef: "",
          expirySignatureSha256: "",
          compensatingControls: [],
          renewalDecision: {
            decision: "renewed",
            decidedAt: "",
            approverId: "",
            reason: "",
            signedEvidenceRef: "",
            signatureSha256: "",
          },
          evidenceRefs: [],
          sourceCitationIds: ["bigid-data-security-ai-governance"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-bigid-exception:policyId:missing",
      "metadata-only-bigid-exception:owner:missing",
      "metadata-only-bigid-exception:request:missing",
      "metadata-only-bigid-exception:approval:missing",
      "metadata-only-bigid-exception:expiry:missing",
      "metadata-only-bigid-exception:compensatingControl:missing",
      "metadata-only-bigid-exception:renewalDecision:missing",
      "metadata-only-bigid-exception:evidenceChain:missing",
    ]));
    expect(verifyGovernanceExceptionLifecycleReceipt(receipt).valid).toBe(false);
  });

  it("does not add BigID source identifiers to generic compliance, enforce, or incident implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("bigid.com");
      expect(source).not.toContain("BigID");
      expect(source).not.toContain("COMP-127");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
