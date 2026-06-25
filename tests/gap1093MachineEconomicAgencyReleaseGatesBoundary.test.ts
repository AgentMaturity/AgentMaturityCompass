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

const DOC = "docs/source-reviews/GAP-1093-machine-economic-agency-release-gates.md";
const OPENALEX = "https://openalex.org/W7160770892";
const OPENALEX_API = "https://api.openalex.org/works/W7160770892";
const DOI = "https://doi.org/10.5281/zenodo.20102985";
const ZENODO_DOI = "https://zenodo.org/doi/10.5281/zenodo.20102985";
const ZENODO_RECORD = "https://zenodo.org/records/20102985";
const ZENODO_API = "https://zenodo.org/api/records/20102985";
const CROSSREF = "https://api.crossref.org/works/10.5281/zenodo.20102985";
const TITLE = "Machine Economic Agency: Risk-First Longitudinal Evaluation of Financial LLM Agents";
const IDENTIFIER = "machine_economic_agency_release_gates";

const implementationFiles = [
  "src/ci/gate.ts",
  "src/integrations/ciGate.ts",
  "src/fleet/governance.ts",
  "src/api/ciRouter.ts",
  "src/index.ts",
];

const sourceCitations: ReleaseGateSourceCitation[] = [
  {
    sourceId: "openalex-machine-economic-agency",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T17:30:00.000Z",
  },
  {
    sourceId: "zenodo-machine-economic-agency",
    title: TITLE,
    url: ZENODO_RECORD,
    retrievedAt: "2026-06-25T17:30:00.000Z",
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

describe("GAP-1093 Machine Economic Agency release-gates boundary", () => {
  it("documents live OpenAlex, DOI, Zenodo, and Crossref boundary metadata with required sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1093");
    expect(doc).toContain("Deployment and release maturity gates");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO_DOI);
    expect(doc).toContain(ZENODO_RECORD);
    expect(doc).toContain(ZENODO_API);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-05-10`");
    expect(doc).toContain("type `preprint`");
    expect(doc).toContain("Zenodo (CERN European Organization for Nuclear Research)");
    expect(doc).toContain("license `cc-by`");
    expect(doc).toContain("Zenodo record `20102985`");
    expect(doc).toContain("concept DOI `10.5281/zenodo.20102984`");
    expect(doc).toContain("DOI `10.5281/zenodo.20102985`");
    expect(doc).toContain("resource type `Preprint`");
    expect(doc).toContain("files count `1`");
    expect(doc).toContain("license `cc-by-4.0`");
    expect(doc).toContain("authors count `1`");
    expect(doc).toContain("Mian Zhang");
    expect(doc).toContain("Audit");
    expect(doc).toContain("Financial Audit");
    expect(doc).toContain("Finance");
    expect(doc).toContain("Financial market");
    expect(doc).toContain("Financial risk");
    expect(doc).toContain("Program evaluation");
    expect(doc).toContain("Risk Governance");
    expect(doc).toContain("Agent Evaluation");
    expect(doc).toContain("Paper Trading");
    expect(doc).toContain("Auditability");
    expect(doc).toContain("Backtest Integrity");
    expect(doc).toContain("Longitudinal Evaluation");
    expect(doc).toContain("DOI returned HTTP/2 `302`");
    expect(doc).toContain("Zenodo DOI page returned HTTP/1.1 `302`");
    expect(doc).toContain("Zenodo record returned HTTP/1.1 `200`");
    expect(doc).toContain("Crossref returned HTTP/2 `404`");
    expect(doc).toContain("OpenAlex API first 200 KB SHA-256 `4c8437088a93b41a9771d4858aa55b61d63a70ccb6a3034f2e029d209338b0d1`");
    expect(doc).toContain("Zenodo API first 200 KB SHA-256 `b180469cce92df5785307dfe74849f33d4d3ad918bb37543c64e77c21cbc2ed1`");
    expect(doc).toContain("Zenodo record first 200 KB SHA-256 `6395f27d74aa760811bd2c2c2ba650aa7c0ba27cab8433256e918e653204e9c8`");
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
    expect(doc).toContain("metadata-only Machine Economic Agency evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing release-gate receipt to block financial-agent rollout with complete control evidence", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1093-machine-economic-agency-release-gates",
      generatedAt: "2026-06-25T17:31:00.000Z",
      sourceCitations,
      gates: [
        {
          gateId: "financial-agent-risk-first-release",
          agentId: "financial-llm-agent",
          environment: "production",
          gateConfig: {
            ...defaultGatePolicy(),
            minOverall: 4,
            minValueScore: 85,
            denyIfValueRegression: true,
            maxCostIncreaseRatio: 1.1,
          },
          policyPath: "agents/financial-llm-agent/gatePolicy.json",
          bundlePath: "agents/financial-llm-agent/bundles/latest.amcbundle",
          evaluatedAt: "2026-06-25T17:31:30.000Z",
          passed: false,
          failureReasons: [
            "Shield market-abuse scenario evidence is missing from the release bundle.",
            "Watch longitudinal risk drift receipt is missing for the production environment.",
          ],
          runReceiptRef: "bundle://financial-llm-agent/latest/run.json",
          runReceiptHash: "a".repeat(64),
          override: {
            overrideId: "override-financial-agent-risk-first-release-2026-06",
            status: "rejected",
            requesterId: "release-owner@example.com",
            approverId: "risk-owner@example.com",
            reason: "Production rollout blocked until security and observability gates have signed evidence.",
            decidedAt: "2026-06-25T17:32:00.000Z",
            signedEvidenceRef: "ledger-override-financial-agent-risk-first-release-2026-06",
            signatureSha256: "b".repeat(64),
          },
          controlEvidence: [
            {
              control: "score",
              passed: true,
              evidenceRef: "ledger-score-release-control-financial-agent",
              reason: "Maturity and value gates met current production thresholds.",
            },
            {
              control: "security",
              passed: false,
              evidenceRef: "ledger-security-release-control-financial-agent",
              reason: "Market-abuse scenario evidence missing from the signed bundle.",
            },
            {
              control: "compliance",
              passed: true,
              evidenceRef: "ledger-compliance-release-control-financial-agent",
              reason: "Comply owner approved the financial-agent release control mapping.",
            },
            {
              control: "cost",
              passed: true,
              evidenceRef: "ledger-cost-release-control-financial-agent",
              reason: "Cost increase ratio remains under the production threshold.",
            },
            {
              control: "observability",
              passed: false,
              evidenceRef: "ledger-observability-release-control-financial-agent",
              reason: "Longitudinal risk drift receipt missing for the production environment.",
            },
          ],
          evidenceRefs: [
            signedEvidence("ev-financial-agent-gate-policy-signed", "c"),
            signedEvidence("ev-financial-agent-bundle-verified", "d", "bundle_verify"),
            signedEvidence("ev-financial-agent-release-control-map", "e", "comply_release_control"),
          ],
          sourceCitationIds: [
            "openalex-machine-economic-agency",
            "zenodo-machine-economic-agency",
          ],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      gateId: "financial-agent-risk-first-release",
      agentId: "financial-llm-agent",
      environment: "production",
      passed: false,
      overrideStatus: "rejected",
      runReceiptRef: "bundle://financial-llm-agent/latest/run.json",
      controlStatus: "failed",
      sourceCitationIds: ["openalex-machine-economic-agency", "zenodo-machine-economic-agency"],
    });
    expect(receipt.rows[0]?.controlEvidence).toHaveLength(5);
    expect(receipt.rows[0]?.gateConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(true);

    const exportText = renderReleaseGateAuditExport(receipt);
    expect(exportText).toContain("AMC Release Gate Audit Export");
    expect(exportText).toContain("financial-agent-risk-first-release");
    expect(exportText).toContain("override rejected");
    expect(exportText).toContain("security | failed");
    expect(exportText).toContain("observability | failed");
    expect(exportText).toContain("Market-abuse scenario evidence missing from the signed bundle.");
  });

  it("fails closed when paper metadata replaces signed release-gate proof", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1093-metadata-only-release-gates",
      generatedAt: "2026-06-25T17:33:00.000Z",
      sourceCitations: [],
      gates: [
        {
          gateId: "metadata-only-financial-agent-release",
          agentId: "metadata-only-financial-agent",
          environment: "production",
          gateConfig: defaultGatePolicy(),
          evaluatedAt: "2026-06-25T17:33:30.000Z",
          passed: true,
          failureReasons: [],
          runReceiptRef: "",
          runReceiptHash: "",
          override: {
            overrideId: "override-without-release-proof",
            status: "approved",
            requesterId: "release-owner@example.com",
            approverId: "",
            reason: "Paper metadata alone should not approve financial-agent rollout.",
            decidedAt: "2026-06-25T17:34:00.000Z",
          },
          controlEvidence: [
            {
              control: "score",
              passed: true,
              evidenceRef: "ledger-score-only",
              reason: "Score metadata only.",
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
      "metadata-only-financial-agent-release:sourceCitation:unknown",
      "metadata-only-financial-agent-release:runReceipt:missing",
      "metadata-only-financial-agent-release:evidenceChain:missing",
      "metadata-only-financial-agent-release:override:missing",
      "metadata-only-financial-agent-release:controlEvidence:security:evidenceRef:missing",
      "metadata-only-financial-agent-release:controlEvidence:security:reason:missing",
      "metadata-only-financial-agent-release:controlEvidence:security:failed",
      "metadata-only-financial-agent-release:controlEvidence:compliance:missing",
      "metadata-only-financial-agent-release:controlEvidence:cost:missing",
      "metadata-only-financial-agent-release:controlEvidence:observability:missing",
    ]));
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(false);
  });

  it("does not add Machine Economic Agency identifiers to generic release-gate implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("W7160770892");
      expect(source).not.toContain("10.5281/zenodo.20102985");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
