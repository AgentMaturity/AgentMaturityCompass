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

const DOC = "docs/source-reviews/GAP-1097-agile-v-exception-lifecycle.md";
const REPO = "https://github.com/Agile-V/agile_v_skills";
const README = "https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/LICENSE";
const PACKAGE = "https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/package.json";
const CLAUDE = "https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/CLAUDE.md";
const V16_NOTES = "https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/V1.6_RELEASE_NOTES.md";
const TITLE = "Agile V Agent Skills Library";
const DESCRIPTION = "Verifiable AI-Augmented Engineering Framework";
const IDENTIFIER = "agile_v_exception_lifecycle";

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
    sourceId: "agile-v-skills-traceability",
    title: TITLE,
    url: REPO,
    retrievedAt: "2026-06-25T17:52:00.000Z",
  },
  {
    sourceId: "iso27001-security-controls",
    title: "ISO/IEC 27001 security control context",
    url: "https://www.iso.org/standard/27001",
    retrievedAt: "2026-06-25T17:52:00.000Z",
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
    "gdpr_art5_accountability",
    "soc2_security",
    "euai_art14_human_oversight",
  ];
  return ids.map((id) => {
    const mapping = builtInComplianceMappings.find((row) => row.id === id);
    if (!mapping) throw new Error(`missing mapping ${id}`);
    return mapping;
  });
}

describe("GAP-1097 Agile-V exception-lifecycle boundary", () => {
  it("documents live Agile-V source metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1097");
    expect(doc).toContain("Exception and waiver lifecycle");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PACKAGE);
    expect(doc).toContain(CLAUDE);
    expect(doc).toContain(V16_NOTES);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("commit `63d3c40037bcf06b3da65eb854e7c531328128ed`");
    expect(doc).toContain("verification reason `unsigned`");
    expect(doc).toContain("license `CC-BY-SA-4.0`");
    expect(doc).toContain("primary language `JavaScript`");
    expect(doc).toContain("stars `47`");
    expect(doc).toContain("forks `9`");
    expect(doc).toContain("open issues `1`");
    expect(doc).toContain("latest release API returned `404`");
    expect(doc).toContain("latest tag `v3.3.4`");
    expect(doc).toContain("package name `agile-v-skills`");
    expect(doc).toContain("package version `3.3.4`");
    expect(doc).toContain("traceability");
    expect(doc).toContain("iso-27001");
    expect(doc).toContain("quality-assurance");
    expect(doc).toContain("red-team");
    expect(doc).toContain("README.md first 200 KB SHA-256 `e6a5ca51f5dfd7664ca0d5770890a370893d3b4a9e6a75cd2cb165daf047ffbe`");
    expect(doc).toContain("LICENSE first 200 KB SHA-256 `23ee78c8bae49cf08ea2f0c84945c66b987ebe4520881fb51b3dad4fb43d07c2`");
    expect(doc).toContain("package.json first 200 KB SHA-256 `c5e2b4847781b5db8a9dc1cc62262bb94836ac2b59abc9be6fb867cd4fbf0a41`");
    expect(doc).toContain("CLAUDE.md first 200 KB SHA-256 `06c0d80aeecbaacf0ea6900a25aa5282df157df7af6a8fb56b1da8d0e7429e3d`");
    expect(doc).toContain("V1.6_RELEASE_NOTES.md first 200 KB SHA-256 `3186fb0c40224826cbc32edab660bdd5603505242b6dc40cbb967a6a4e1d8f48`");
    expect(doc).toContain("exception request");
    expect(doc).toContain("approver");
    expect(doc).toContain("expiry");
    expect(doc).toContain("compensating control");
    expect(doc).toContain("renewal outcome");
    expect(doc).toContain("metadata-only Agile-V evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic governance exception lifecycle receipt for a source-cited traceability waiver", () => {
    const receipt = buildGovernanceExceptionLifecycleReceipt({
      receiptId: "gap1097-agile-v-exception-lifecycle",
      generatedAt: "2026-06-25T17:52:30.000Z",
      sourceCitations,
      exceptions: [
        {
          exceptionId: "exc-traceability-rollout-001",
          policyId: "policy-agent-traceability",
          controlId: "iso42001_clause_8_operation",
          owner: "quality-owner@example.com",
          requesterId: "requester-engineering-owner",
          requestReason: "Temporary waiver while traceability tooling migrates to signed artifact links.",
          requestedAt: "2026-06-25T17:52:40.000Z",
          requestSignedEvidenceRef: "ledger-exc-traceability-request",
          requestSignatureSha256: "a".repeat(64),
          approverId: "approver-independent-quality",
          approvalDecision: "approved",
          approvedAt: "2026-06-25T17:53:00.000Z",
          approvalSignedEvidenceRef: "ledger-exc-traceability-approval",
          approvalSignatureSha256: "b".repeat(64),
          expiresAt: "2026-07-25T17:53:00.000Z",
          expiryCheckedAt: "2026-06-25T17:53:30.000Z",
          expirySignedEvidenceRef: "ledger-exc-traceability-expiry-check",
          expirySignatureSha256: "c".repeat(64),
          compensatingControls: [
            {
              controlId: "comp-control-manual-req-art-tc-review",
              owner: "qa-owner@example.com",
              description: "Manual REQ-to-ART-to-TC review remains mandatory until signed traceability links are complete.",
              dueAt: "2026-07-05T00:00:00.000Z",
              signedEvidenceRef: "ledger-comp-control-manual-req-art-tc-review",
              signatureSha256: "d".repeat(64),
            },
          ],
          renewalDecision: {
            decision: "not_requested",
            decidedAt: "2026-06-25T17:54:00.000Z",
            approverId: "approver-independent-quality",
            reason: "No renewal requested; waiver expires after migration window.",
            signedEvidenceRef: "ledger-exc-traceability-renewal",
            signatureSha256: "e".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-agile-v-exception-request", "f"),
            signedEvidence("ev-agile-v-exception-approval", "1"),
            signedEvidence("ev-agile-v-exception-renewal", "2"),
          ],
          sourceCitationIds: [
            "agile-v-skills-traceability",
            "iso27001-security-controls",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      exceptionId: "exc-traceability-rollout-001",
      owner: "quality-owner@example.com",
      approverId: "approver-independent-quality",
      approvalDecision: "approved",
      renewalOutcome: "not_requested",
      compensatingControlIds: ["comp-control-manual-req-art-tc-review"],
    });
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyGovernanceExceptionLifecycleReceipt(receipt).valid).toBe(true);

    const markdown = renderGovernanceExceptionLifecycleAuditExport(receipt);
    expect(markdown).toContain("# AMC Governance Exception Lifecycle Audit Export");
    expect(markdown).toContain("quality-owner@example.com");
    expect(markdown).toContain("approver-independent-quality");
    expect(markdown).toContain("comp-control-manual-req-art-tc-review");
    expect(markdown).toContain("not_requested");
    expect(markdown).toContain("Evidence chain");
    expect(markdown).toContain("VALID");
  });

  it("keeps signed exception lifecycle evidence compatible with the generic control crosswalk", () => {
    const receipt = buildControlCrosswalkReceipt({
      receiptId: "gap1097-agile-v-control-crosswalk",
      generatedAt: "2026-06-25T17:55:00.000Z",
      mappings: selectedMappings(),
      sourceCitations,
      ownersByMappingId: {
        nist_govern: "grc-owner@example.com",
        iso42001_clause_8_operation: "quality-owner@example.com",
        gdpr_art5_accountability: "privacy-owner@example.com",
        soc2_security: "security-owner@example.com",
        euai_art14_human_oversight: "oversight-owner@example.com",
      },
      evidenceByMappingId: {
        nist_govern: [{ eventId: "ev-nist-govern-agile-v", eventHash: "3".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-nist-govern-agile-v" }],
        iso42001_clause_8_operation: [{ eventId: "ev-iso-operation-agile-v", eventHash: "4".repeat(64), evidenceType: "review", signedEvidenceRef: "ledger-iso-operation-agile-v" }],
        gdpr_art5_accountability: [{ eventId: "ev-gdpr-accountability-agile-v", eventHash: "5".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-gdpr-accountability-agile-v" }],
        soc2_security: [{ eventId: "ev-soc2-security-agile-v", eventHash: "6".repeat(64), evidenceType: "audit", signedEvidenceRef: "ledger-soc2-security-agile-v" }],
        euai_art14_human_oversight: [{ eventId: "ev-euai-art14-agile-v", eventHash: "7".repeat(64), evidenceType: "review", signedEvidenceRef: "ledger-euai-art14-agile-v" }],
      },
      exceptions: [
        {
          mappingId: "iso42001_clause_8_operation",
          exceptionId: "exc-traceability-rollout-001",
          state: "approved",
          owner: "quality-owner@example.com",
          reason: "Signed lifecycle exception receipt exists for the temporary traceability waiver.",
          signedEvidenceRef: "ledger-exc-traceability-rollout-001",
          signatureSha256: "8".repeat(64),
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows.every((row) => row.sourceCitationIds.includes("agile-v-skills-traceability"))).toBe(true);
    expect(receipt.rows.every((row) => row.owner.includes("@"))).toBe(true);
    expect(receipt.rows.find((row) => row.mappingId === "iso42001_clause_8_operation")?.exceptionState).toBe("approved");
    expect(verifyControlCrosswalkReceipt(receipt).valid).toBe(true);
  });

  it("fails closed when Agile-V metadata replaces signed exception lifecycle evidence", () => {
    const receipt = buildGovernanceExceptionLifecycleReceipt({
      receiptId: "gap1097-metadata-only-exception-lifecycle",
      generatedAt: "2026-06-25T17:56:00.000Z",
      sourceCitations: [sourceCitations[0]],
      exceptions: [
        {
          exceptionId: "metadata-only-agile-v-exception",
          policyId: "",
          controlId: "iso42001_clause_8_operation",
          owner: "",
          requesterId: "",
          requestReason: "Repository metadata only.",
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
          sourceCitationIds: ["agile-v-skills-traceability"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-agile-v-exception:policyId:missing",
      "metadata-only-agile-v-exception:owner:missing",
      "metadata-only-agile-v-exception:request:missing",
      "metadata-only-agile-v-exception:approval:missing",
      "metadata-only-agile-v-exception:expiry:missing",
      "metadata-only-agile-v-exception:compensatingControl:missing",
      "metadata-only-agile-v-exception:renewalDecision:missing",
      "metadata-only-agile-v-exception:evidenceChain:missing",
    ]));
    expect(verifyGovernanceExceptionLifecycleReceipt(receipt).valid).toBe(false);
  });

  it("does not add Agile-V source identifiers to generic compliance, enforce, or incident implementation files", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Agile-V/agile_v_skills");
      expect(source).not.toContain("agile_v_skills");
      expect(source).not.toContain("Agile V");
      expect(source).not.toContain("63d3c40037bcf06b3da65eb854e7c531328128ed");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
