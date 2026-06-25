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

const DOC = "docs/source-reviews/GAP-1065-monitaur-exception-lifecycle.md";
const HOME = "https://www.monitaur.ai";
const PLATFORM = "https://www.monitaur.ai/platform";
const SOLUTIONS = "https://www.monitaur.ai/solutions";
const AI_GOVERNANCE = "https://www.monitaur.ai/ai-governance";
const SECURITY = "https://www.monitaur.ai/security";
const TITLE = "AI Governance software that goes beyond good intentions | Monitaur";
const PLATFORM_TITLE = "AI governance software platform";
const SECURITY_TITLE = "Security";
const IDENTIFIER = "monitaur_exception_lifecycle";

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
    sourceId: "monitaur-ai-governance-platform",
    title: TITLE,
    url: HOME,
    retrievedAt: "2026-06-25T05:41:50.000+05:30",
  },
  {
    sourceId: "eu-ai-act-art14-human-oversight",
    title: "Regulation (EU) 2024/1689 Article 14 human oversight",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    retrievedAt: "2026-06-25T05:41:50.000+05:30",
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
    "iso42001_clause_8_operation",
    "euai_art14_human_oversight",
    "gdpr_art5_accountability",
    "soc2_security",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

describe("GAP-1065 Monitaur exception-lifecycle boundary", () => {
  it("documents live Monitaur source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1065");
    expect(doc).toContain("Exception and waiver lifecycle");
    expect(doc).toContain(HOME);
    expect(doc).toContain(PLATFORM);
    expect(doc).toContain(SOLUTIONS);
    expect(doc).toContain(AI_GOVERNANCE);
    expect(doc).toContain(SECURITY);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PLATFORM_TITLE);
    expect(doc).toContain(SECURITY_TITLE);
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("Keeping AI honest is a full-time job");
    expect(doc).toContain("governance");
    expect(doc).toContain("risk");
    expect(doc).toContain("compliance");
    expect(doc).toContain("audit");
    expect(doc).toContain("monitoring");
    expect(doc).toContain("controls");
    expect(doc).toContain("documentation");
    expect(doc).toContain("inventory");
    expect(doc).toContain("collaboration");
    expect(doc).toContain("vendor governance");
    expect(doc).toContain("model lifecycle");
    expect(doc).toContain("responsible AI");
    expect(doc).toContain("exception request");
    expect(doc).toContain("approver");
    expect(doc).toContain("expiry");
    expect(doc).toContain("compensating control");
    expect(doc).toContain("renewal outcome");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic governance exception lifecycle receipt with signed request, approval, expiry, compensating control, renewal, owner, and evidence chain", () => {
    const receipt = buildGovernanceExceptionLifecycleReceipt({
      receiptId: "gap1065-monitaur-exception-lifecycle",
      generatedAt: "2026-06-25T05:42:00.000+05:30",
      sourceCitations,
      exceptions: [
        {
          exceptionId: "exc-policy-window-grc-001",
          policyId: "policy-high-risk-review-window",
          controlId: "euai_art14_human_oversight",
          owner: "grc-owner@example.com",
          requesterId: "requester-policy-owner",
          requestReason: "Temporary review-window extension while new reviewer rota is deployed.",
          requestedAt: "2026-06-25T05:42:10.000+05:30",
          requestSignedEvidenceRef: "ledger-exc-policy-window-request",
          requestSignatureSha256: "a".repeat(64),
          approverId: "approver-independent-grc",
          approvalDecision: "approved",
          approvedAt: "2026-06-25T05:43:00.000+05:30",
          approvalSignedEvidenceRef: "ledger-exc-policy-window-approval",
          approvalSignatureSha256: "b".repeat(64),
          expiresAt: "2026-07-25T05:43:00.000+05:30",
          expiryCheckedAt: "2026-06-25T05:43:30.000+05:30",
          expirySignedEvidenceRef: "ledger-exc-policy-window-expiry-check",
          expirySignatureSha256: "c".repeat(64),
          compensatingControls: [
            {
              controlId: "comp-control-manual-second-review",
              owner: "security-owner@example.com",
              description: "Manual second review remains mandatory while the rota migration is active.",
              dueAt: "2026-07-01T00:00:00.000+05:30",
              signedEvidenceRef: "ledger-comp-control-manual-second-review",
              signatureSha256: "d".repeat(64),
            },
          ],
          renewalDecision: {
            decision: "not_requested",
            decidedAt: "2026-06-25T05:44:00.000+05:30",
            approverId: "approver-independent-grc",
            reason: "No renewal requested; exception expires automatically.",
            signedEvidenceRef: "ledger-exc-policy-window-renewal",
            signatureSha256: "e".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-exception-request", "f"),
            signedEvidence("ev-exception-approval", "1"),
            signedEvidence("ev-exception-renewal", "2"),
          ],
          sourceCitationIds: [
            "monitaur-ai-governance-platform",
            "eu-ai-act-art14-human-oversight",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      exceptionId: "exc-policy-window-grc-001",
      owner: "grc-owner@example.com",
      approverId: "approver-independent-grc",
      approvalDecision: "approved",
      renewalOutcome: "not_requested",
      compensatingControlIds: ["comp-control-manual-second-review"],
    });
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyGovernanceExceptionLifecycleReceipt(receipt).valid).toBe(true);

    const markdown = renderGovernanceExceptionLifecycleAuditExport(receipt);
    expect(markdown).toContain("# AMC Governance Exception Lifecycle Audit Export");
    expect(markdown).toContain("grc-owner@example.com");
    expect(markdown).toContain("approver-independent-grc");
    expect(markdown).toContain("comp-control-manual-second-review");
    expect(markdown).toContain("not_requested");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("keeps source-cited signed control-crosswalk exception rows compatible with lifecycle proof", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1065-monitaur-control-crosswalk",
      generatedAt: "2026-06-25T05:45:00.000+05:30",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: {
        nist_govern: "grc-owner@example.com",
        iso42001_clause_8_operation: "operation-owner@example.com",
        euai_art14_human_oversight: "oversight-owner@example.com",
        gdpr_art5_accountability: "privacy-owner@example.com",
        soc2_security: "security-owner@example.com",
      },
      evidenceByMappingId: {
        nist_govern: [{ eventId: "ev-nist-govern-monitaur", eventHash: "3".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-nist-govern-monitaur" }],
        iso42001_clause_8_operation: [{ eventId: "ev-iso-operation-monitaur", eventHash: "4".repeat(64), evidenceType: "review", signedEvidenceRef: "ledger-iso-operation-monitaur" }],
        euai_art14_human_oversight: [{ eventId: "ev-euai-art14-monitaur", eventHash: "5".repeat(64), evidenceType: "review", signedEvidenceRef: "ledger-euai-art14-monitaur" }],
        gdpr_art5_accountability: [{ eventId: "ev-gdpr-accountability-monitaur", eventHash: "6".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-gdpr-accountability-monitaur" }],
        soc2_security: [{ eventId: "ev-soc2-security-monitaur", eventHash: "7".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-soc2-security-monitaur" }],
      },
      exceptions: [
        {
          mappingId: "euai_art14_human_oversight",
          exceptionId: "exc-policy-window-grc-001",
          state: "approved",
          owner: "oversight-owner@example.com",
          reason: "Signed lifecycle exception receipt exists for the temporary review-window waiver.",
          signedEvidenceRef: "ledger-exc-policy-window-grc-001",
          signatureSha256: "8".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows.every((row) => row.sourceCitationIds.includes("monitaur-ai-governance-platform"))).toBe(true);
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "euai_art14_human_oversight")?.exceptionState).toBe("approved");
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);
  });

  it("fails closed when Monitaur metadata replaces signed exception lifecycle evidence", () => {
    const receipt = buildGovernanceExceptionLifecycleReceipt({
      receiptId: "gap1065-metadata-only-exception-lifecycle",
      generatedAt: "2026-06-25T05:46:00.000+05:30",
      sourceCitations: [sourceCitations[0]],
      exceptions: [
        {
          exceptionId: "metadata-only-exception",
          policyId: "",
          controlId: "euai_art14_human_oversight",
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
          sourceCitationIds: ["monitaur-ai-governance-platform"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-exception:policyId:missing",
      "metadata-only-exception:owner:missing",
      "metadata-only-exception:request:missing",
      "metadata-only-exception:approval:missing",
      "metadata-only-exception:expiry:missing",
      "metadata-only-exception:compensatingControl:missing",
      "metadata-only-exception:renewalDecision:missing",
      "metadata-only-exception:evidenceChain:missing",
    ]));
    expect(verifyGovernanceExceptionLifecycleReceipt(receipt).valid).toBe(false);
  });

  it("does not add Monitaur source identifiers to generic compliance, enforce, or incident implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("monitaur.ai");
      expect(source).not.toContain("Monitaur");
      expect(source).not.toContain("COMP-120");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
