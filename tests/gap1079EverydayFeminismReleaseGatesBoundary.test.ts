import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReleaseGateReceipt,
  defaultGatePolicy,
  renderReleaseGateAuditExport,
  verifyReleaseGateReceipt,
  type ReleaseGateEvidenceLink,
  type ReleaseGateSourceCitation,
} from "../src/index.js";

const DOC = "docs/source-reviews/GAP-1079-everyday-feminism-release-gates.md";
const OPENALEX = "https://openalex.org/W7131402372";
const OPENALEX_API = "https://api.openalex.org/works/W7131402372";
const DOI = "https://doi.org/10.1145/3772318.3790616";
const ACM = "https://dl.acm.org/doi/10.1145/3772318.3790616";
const TITLE = "When LLMs Enter Everyday Feminism on Chinese Social Media: Opportunities and Risks for Women's Empowerment";
const IDENTIFIER = "everyday_feminism_release_gates";

const implementationFiles = [
  "src/ci/gate.ts",
  "src/integrations/ciGate.ts",
  "src/fleet/governance.ts",
  "src/api/ciRouter.ts",
  "src/index.ts",
];

const sourceCitations: ReleaseGateSourceCitation[] = [
  {
    sourceId: "openalex-everyday-feminism",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T07:59:00.000+05:30",
  },
  {
    sourceId: "doi-everyday-feminism",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T07:59:00.000+05:30",
  },
];

function signedEvidence(id: string, seed: string, eventType = "release_gate"): ReleaseGateEvidenceLink {
  return {
    eventId: id,
    eventHash: seed.repeat(64).slice(0, 64),
    eventType,
    signedEvidenceRef: `ledger-${id}`,
  };
}

describe("GAP-1079 everyday-feminism release-gates boundary", () => {
  it("documents live OpenAlex and DOI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1079");
    expect(doc).toContain("Deployment and release maturity gates");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ACM);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-04-13`");
    expect(doc).toContain("article");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by-nc-nd");
    expect(doc).toContain("Hong Kong University of Science and Technology");
    expect(doc).toContain("Tongji University");
    expect(doc).toContain("Feminism");
    expect(doc).toContain("Gender studies");
    expect(doc).toContain("Empowerment");
    expect(doc).toContain("Everyday digital feminism");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `403`");
    expect(doc).toContain("Just a moment");
    expect(doc).toContain("gate config");
    expect(doc).toContain("environment");
    expect(doc).toContain("run receipt");
    expect(doc).toContain("failure reason");
    expect(doc).toContain("override status");
    expect(doc).toContain("metadata-only everyday-feminism evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing release-gate receipt for source-cited social-governance release decisions", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1079-everyday-feminism-release-gates",
      generatedAt: "2026-06-25T08:00:00.000+05:30",
      sourceCitations,
      gates: [
        {
          gateId: "social-governance-prod-release",
          agentId: "social-governance-release-agent",
          environment: "production",
          gateConfig: {
            ...defaultGatePolicy(),
            minValueScore: 81,
            denyIfValueRegression: true,
          },
          policyPath: "agents/social-governance-release-agent/gatePolicy.json",
          bundlePath: "agents/social-governance-release-agent/bundles/latest.amcbundle",
          evaluatedAt: "2026-06-25T08:00:10.000+05:30",
          passed: false,
          failureReasons: [
            "Shield social-impact review evidence missing from release bundle.",
            "Watch drift evidence for user-facing social context is missing from bundle.",
          ],
          runReceiptRef: "bundle://social-governance-release-agent/latest/run.json",
          runReceiptHash: "a".repeat(64),
          override: {
            overrideId: "override-social-governance-prod-release-2026-06",
            status: "rejected",
            requesterId: "release-owner@example.com",
            approverId: "governance-owner@example.com",
            reason: "Release cannot proceed without signed social-impact and drift evidence.",
            decidedAt: "2026-06-25T08:01:00.000+05:30",
            signedEvidenceRef: "ledger-override-social-governance-prod-release-2026-06",
            signatureSha256: "b".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-social-governance-gate-policy-signed", "c"),
            signedEvidence("ev-social-governance-bundle-verified", "d", "bundle_verify"),
          ],
          sourceCitationIds: ["openalex-everyday-feminism", "doi-everyday-feminism"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      gateId: "social-governance-prod-release",
      environment: "production",
      passed: false,
      overrideStatus: "rejected",
      runReceiptRef: "bundle://social-governance-release-agent/latest/run.json",
      sourceCitationIds: ["openalex-everyday-feminism", "doi-everyday-feminism"],
    });
    expect(receipt.rows[0]?.gateConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(true);

    const exportText = renderReleaseGateAuditExport(receipt);
    expect(exportText).toContain("AMC Release Gate Audit Export");
    expect(exportText).toContain("social-governance-prod-release");
    expect(exportText).toContain("override rejected");
    expect(exportText).toContain("Shield social-impact review evidence missing from release bundle.");
  });

  it("fails closed when paper metadata replaces signed release-gate proof", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1079-metadata-only-release-gates",
      generatedAt: "2026-06-25T08:02:00.000+05:30",
      sourceCitations,
      gates: [
        {
          gateId: "metadata-only-social-gate",
          agentId: "metadata-only-social-agent",
          environment: "production",
          gateConfig: defaultGatePolicy(),
          evaluatedAt: "2026-06-25T08:02:10.000+05:30",
          passed: false,
          failureReasons: [],
          runReceiptRef: "",
          runReceiptHash: "",
          override: {
            overrideId: "override-without-social-proof-signature",
            status: "approved",
            requesterId: "release-owner@example.com",
            approverId: "",
            reason: "Paper metadata alone should not approve a release.",
            decidedAt: "2026-06-25T08:02:30.000+05:30",
          },
          evidenceRefs: [],
          sourceCitationIds: ["openalex-everyday-feminism"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-social-gate:failureReason:missing",
      "metadata-only-social-gate:runReceipt:missing",
      "metadata-only-social-gate:evidenceChain:missing",
      "metadata-only-social-gate:override:missing",
    ]));
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(false);
  });

  it("does not add everyday-feminism identifiers to generic release-gate implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain("10.1145/3772318.3790616");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
