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

const DOC = "docs/source-reviews/GAP-1103-psychometrics-release-gates.md";
const OPENALEX = "https://openalex.org/W4387963810";
const OPENALEX_API = "https://api.openalex.org/works/W4387963810";
const DOI = "https://doi.org/10.1145/3769688";
const CROSSREF = "https://api.crossref.org/works/10.1145/3769688";
const ACM = "https://dl.acm.org/doi/10.1145/3769688";
const TITLE = "Evaluating General-Purpose AI with Psychometrics";
const IDENTIFIER = "psychometrics_release_gates";

const implementationFiles = [
  "src/ci/gate.ts",
  "src/integrations/ciGate.ts",
  "src/fleet/governance.ts",
  "src/api/ciRouter.ts",
  "src/index.ts",
];

const sourceCitations: ReleaseGateSourceCitation[] = [
  {
    sourceId: "openalex-psychometrics-gpai-evaluation",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T17:35:00.000Z",
  },
  {
    sourceId: "crossref-psychometrics-gpai-evaluation",
    title: TITLE,
    url: CROSSREF,
    retrievedAt: "2026-06-25T17:35:00.000Z",
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

describe("GAP-1103 psychometrics release-gates boundary", () => {
  it("documents live OpenAlex, DOI, ACM, and Crossref metadata with required sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1103");
    expect(doc).toContain("Deployment and release maturity gates");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ACM);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-04-14`");
    expect(doc).toContain("OpenAlex type `preprint`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("published date `2026-04-24`");
    expect(doc).toContain("Communications of the ACM");
    expect(doc).toContain("Association for Computing Machinery");
    expect(doc).toContain("license `cc-by`");
    expect(doc).toContain("license `https://creativecommons.org/licenses/by/4.0/`");
    expect(doc).toContain("authors count `8`");
    expect(doc).toContain("reference count `45`");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Psychometrics");
    expect(doc).toContain("Construct validity");
    expect(doc).toContain("Reliability");
    expect(doc).toContain("Data science");
    expect(doc).toContain("DOI returned HTTP/2 `302`");
    expect(doc).toContain("ACM DOI page returned HTTP/2 `403`");
    expect(doc).toContain("cf-mitigated: challenge");
    expect(doc).toContain("OpenAlex API first 200 KB SHA-256 `fee64943cad87a9daa3430a6076362143e6c98977557e2dc791fbc15498f3672`");
    expect(doc).toContain("Crossref API first 200 KB SHA-256 `2f3ea8166af22158ad3cf3e9bd21a1a89faa8ff0789a77c79f2864cf415643d8`");
    expect(doc).toContain("ACM DOI page first 200 KB SHA-256 `ad5bff46ca2cb0151b6e3745817d9df7659e9879c3c0aeb793287d3c06534721`");
    expect(doc).toContain("gate config");
    expect(doc).toContain("environment");
    expect(doc).toContain("run receipt");
    expect(doc).toContain("failure reason");
    expect(doc).toContain("override status");
    expect(doc).toContain("score");
    expect(doc).toContain("security");
    expect(doc).toContain("compliance");
    expect(doc).toContain("cost");
    expect(doc).toContain("observability");
    expect(doc).toContain("metadata-only psychometrics evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing release-gate receipt to block GPAI rollout without construct-validity proof", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1103-psychometrics-release-gates",
      generatedAt: "2026-06-25T17:36:00.000Z",
      sourceCitations,
      gates: [
        {
          gateId: "gpai-psychometric-validity-release",
          agentId: "general-purpose-ai-assistant",
          environment: "production",
          gateConfig: {
            ...defaultGatePolicy(),
            minOverall: 4.2,
            minValueScore: 90,
            denyIfValueRegression: true,
            maxCostIncreaseRatio: 1.08,
          },
          policyPath: "agents/general-purpose-ai-assistant/gatePolicy.json",
          bundlePath: "agents/general-purpose-ai-assistant/bundles/latest.amcbundle",
          evaluatedAt: "2026-06-25T17:36:30.000Z",
          passed: false,
          failureReasons: [
            "Score construct-validity evidence is missing from the release bundle.",
            "Comply owner-approved exception is missing for psychometric construct changes.",
          ],
          runReceiptRef: "bundle://general-purpose-ai-assistant/latest/run.json",
          runReceiptHash: "a".repeat(64),
          override: {
            overrideId: "override-gpai-psychometric-validity-release-2026-06",
            status: "rejected",
            requesterId: "release-owner@example.com",
            approverId: "evaluation-owner@example.com",
            reason: "Production rollout blocked until construct validity and exception evidence are signed.",
            decidedAt: "2026-06-25T17:37:00.000Z",
            signedEvidenceRef: "ledger-override-gpai-psychometric-validity-release-2026-06",
            signatureSha256: "b".repeat(64),
          },
          controlEvidence: [
            {
              control: "score",
              passed: false,
              evidenceRef: "ledger-score-construct-validity-gap",
              reason: "Construct-validity evidence missing from the signed evaluation bundle.",
            },
            {
              control: "security",
              passed: true,
              evidenceRef: "ledger-security-release-control-gpai",
              reason: "Security release controls are signed for the target environment.",
            },
            {
              control: "compliance",
              passed: false,
              evidenceRef: "ledger-compliance-psychometric-exception-gap",
              reason: "Owner-approved exception evidence missing for evaluation construct changes.",
            },
            {
              control: "cost",
              passed: true,
              evidenceRef: "ledger-cost-release-control-gpai",
              reason: "Cost increase ratio remains under the production threshold.",
            },
            {
              control: "observability",
              passed: true,
              evidenceRef: "ledger-observability-release-control-gpai",
              reason: "Production drift and reliability monitors are signed for rollout.",
            },
          ],
          evidenceRefs: [
            signedEvidence("ev-gpai-gate-policy-signed", "c"),
            signedEvidence("ev-gpai-bundle-verified", "d", "bundle_verify"),
            signedEvidence("ev-gpai-construct-map-reviewed", "e", "score_construct_review"),
          ],
          sourceCitationIds: [
            "openalex-psychometrics-gpai-evaluation",
            "crossref-psychometrics-gpai-evaluation",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      gateId: "gpai-psychometric-validity-release",
      agentId: "general-purpose-ai-assistant",
      environment: "production",
      passed: false,
      overrideStatus: "rejected",
      runReceiptRef: "bundle://general-purpose-ai-assistant/latest/run.json",
      controlStatus: "failed",
      sourceCitationIds: [
        "openalex-psychometrics-gpai-evaluation",
        "crossref-psychometrics-gpai-evaluation",
      ],
    });
    expect(receipt.rows[0]?.controlEvidence).toHaveLength(5);
    expect(receipt.rows[0]?.gateConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(true);

    const exportText = renderReleaseGateAuditExport(receipt);
    expect(exportText).toContain("AMC Release Gate Audit Export");
    expect(exportText).toContain("gpai-psychometric-validity-release");
    expect(exportText).toContain("override rejected");
    expect(exportText).toContain("score | failed");
    expect(exportText).toContain("compliance | failed");
    expect(exportText).toContain("Construct-validity evidence missing from the signed evaluation bundle.");
  });

  it("fails closed when paper metadata replaces signed release-gate proof", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1103-metadata-only-release-gates",
      generatedAt: "2026-06-25T17:38:00.000Z",
      sourceCitations: [],
      gates: [
        {
          gateId: "metadata-only-psychometrics-release",
          agentId: "metadata-only-gpai",
          environment: "production",
          gateConfig: defaultGatePolicy(),
          evaluatedAt: "2026-06-25T17:38:30.000Z",
          passed: true,
          failureReasons: [],
          runReceiptRef: "",
          runReceiptHash: "",
          override: {
            overrideId: "override-without-psychometric-proof",
            status: "approved",
            requesterId: "release-owner@example.com",
            approverId: "",
            reason: "Paper metadata alone should not approve GPAI rollout.",
            decidedAt: "2026-06-25T17:39:00.000Z",
          },
          controlEvidence: [
            {
              control: "score",
              passed: true,
              evidenceRef: "ledger-score-metadata-only",
              reason: "Psychometrics metadata only.",
            },
            {
              control: "security",
              passed: false,
              evidenceRef: "",
              reason: "",
            },
          ],
          evidenceRefs: [],
          sourceCitationIds: ["missing-source"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "sourceCitations:missing",
      "metadata-only-psychometrics-release:sourceCitation:unknown",
      "metadata-only-psychometrics-release:runReceipt:missing",
      "metadata-only-psychometrics-release:evidenceChain:missing",
      "metadata-only-psychometrics-release:override:missing",
      "metadata-only-psychometrics-release:controlEvidence:security:evidenceRef:missing",
      "metadata-only-psychometrics-release:controlEvidence:security:reason:missing",
      "metadata-only-psychometrics-release:controlEvidence:security:failed",
      "metadata-only-psychometrics-release:controlEvidence:compliance:missing",
      "metadata-only-psychometrics-release:controlEvidence:cost:missing",
      "metadata-only-psychometrics-release:controlEvidence:observability:missing",
    ]));
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(false);
  });

  it("does not add psychometrics identifiers to generic release-gate implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("W4387963810");
      expect(source).not.toContain("10.1145/3769688");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
