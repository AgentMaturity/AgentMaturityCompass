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

const DOC = "docs/source-reviews/GAP-1075-artificial-authority-release-gates.md";
const OPENALEX = "https://openalex.org/W7124460067";
const OPENALEX_API = "https://api.openalex.org/works/W7124460067";
const DOI = "https://doi.org/10.3390/bioengineering13010108";
const MDPI = "https://www.mdpi.com/2306-5354/13/1/108";
const MDPI_PDF = "https://www.mdpi.com/2306-5354/13/1/108/pdf?version=1768556216";
const TITLE = "Artificial Authority: The Promise and Perils of LLM Judges in Healthcare";
const IDENTIFIER = "artificial_authority_release_gates";

const implementationFiles = [
  "src/ci/gate.ts",
  "src/integrations/ciGate.ts",
  "src/fleet/governance.ts",
  "src/api/ciRouter.ts",
  "src/index.ts",
];

const sourceCitations: ReleaseGateSourceCitation[] = [
  {
    sourceId: "openalex-artificial-authority",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T07:44:00.000+05:30",
  },
  {
    sourceId: "doi-artificial-authority",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T07:44:00.000+05:30",
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

describe("GAP-1075 Artificial Authority release-gates boundary", () => {
  it("documents OpenAlex/DOI metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1075");
    expect(doc).toContain("Deployment and release maturity gates");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(MDPI_PDF);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-16`");
    expect(doc).toContain("Bioengineering");
    expect(doc).toContain("gold");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("Mayo Clinic");
    expect(doc).toContain("Mayo Clinic in Florida");
    expect(doc).toContain("Corporate governance");
    expect(doc).toContain("Clinical governance");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `403`");
    expect(doc).toContain("Access Denied");
    expect(doc).toContain("gate config");
    expect(doc).toContain("environment");
    expect(doc).toContain("run receipt");
    expect(doc).toContain("failure reason");
    expect(doc).toContain("override status");
    expect(doc).toContain("metadata-only Artificial Authority evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("builds a generic release-gate receipt with environment, run receipt, failure reason, and override status", () => {
    const policy = {
      ...defaultGatePolicy(),
      minValueScore: 82,
      minEconomicSignificanceIndex: 75,
      denyIfValueRegression: true,
      requireExperimentPass: {
        enabled: true,
        experimentId: "release-readiness-exp-2026-06",
        minUpliftSuccessRate: 0.08,
        minUpliftValuePoints: 4,
      },
    };

    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1075-artificial-authority-release-gates",
      generatedAt: "2026-06-25T07:45:00.000+05:30",
      sourceCitations,
      gates: [
        {
          gateId: "regulated-agent-prod-release",
          agentId: "regulated-decision-support-agent",
          environment: "production",
          gateConfig: policy,
          policyPath: "agents/regulated-decision-support-agent/gatePolicy.json",
          bundlePath: "agents/regulated-decision-support-agent/bundles/latest.amcbundle",
          evaluatedAt: "2026-06-25T07:45:05.000+05:30",
          passed: false,
          failureReasons: [
            "Experiment gate enabled but experiments/report.json is missing in bundle.",
            "Value gate configured but outcomes/report.json is missing in bundle.",
          ],
          runReceiptRef: "bundle://regulated-decision-support-agent/latest/run.json",
          runReceiptHash: "a".repeat(64),
          override: {
            overrideId: "override-regulated-agent-prod-release-2026-06",
            status: "rejected",
            requesterId: "release-owner@example.com",
            approverId: "risk-owner@example.com",
            reason: "Release cannot proceed without experiment and value evidence.",
            decidedAt: "2026-06-25T07:46:00.000+05:30",
            signedEvidenceRef: "ledger-override-regulated-agent-prod-release-2026-06",
            signatureSha256: "b".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-release-gate-policy-signed", "c"),
            signedEvidence("ev-release-gate-bundle-verified", "d", "bundle_verify"),
          ],
          sourceCitationIds: ["openalex-artificial-authority", "doi-artificial-authority"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      gateId: "regulated-agent-prod-release",
      agentId: "regulated-decision-support-agent",
      environment: "production",
      passed: false,
      failureReasons: [
        "Experiment gate enabled but experiments/report.json is missing in bundle.",
        "Value gate configured but outcomes/report.json is missing in bundle.",
      ],
      runReceiptRef: "bundle://regulated-decision-support-agent/latest/run.json",
      overrideStatus: "rejected",
      overrideId: "override-regulated-agent-prod-release-2026-06",
      sourceCitationIds: ["openalex-artificial-authority", "doi-artificial-authority"],
    });
    expect(receipt.rows[0]?.gateConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    const verification = verifyReleaseGateReceipt(receipt);
    expect(verification.valid).toBe(true);
    expect(verification.reasons).toEqual([]);

    const exportText = renderReleaseGateAuditExport(receipt);
    expect(exportText).toContain("AMC Release Gate Audit Export");
    expect(exportText).toContain("production");
    expect(exportText).toContain("regulated-agent-prod-release");
    expect(exportText).toContain("override rejected");
    expect(exportText).toContain("Experiment gate enabled but experiments/report.json is missing in bundle.");
  });

  it("fails closed when metadata replaces signed release-gate proof", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1075-metadata-only-release-gates",
      generatedAt: "2026-06-25T07:47:00.000+05:30",
      sourceCitations,
      gates: [
        {
          gateId: "metadata-only-gate",
          agentId: "metadata-only-agent",
          environment: "production",
          gateConfig: defaultGatePolicy(),
          evaluatedAt: "2026-06-25T07:47:05.000+05:30",
          passed: false,
          failureReasons: [],
          runReceiptRef: "",
          runReceiptHash: "",
          override: {
            overrideId: "override-without-signature",
            status: "approved",
            requesterId: "release-owner@example.com",
            approverId: "",
            reason: "Metadata-only approval should not pass.",
            decidedAt: "2026-06-25T07:47:10.000+05:30",
          },
          evidenceRefs: [],
          sourceCitationIds: ["openalex-artificial-authority"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-gate:failureReason:missing",
      "metadata-only-gate:runReceipt:missing",
      "metadata-only-gate:evidenceChain:missing",
      "metadata-only-gate:override:missing",
    ]));
    const verification = verifyReleaseGateReceipt(receipt);
    expect(verification.valid).toBe(false);
    expect(verification.reasons).toEqual(expect.arrayContaining(receipt.failClosedReasons));
  });

  it("does not add Artificial Authority identifiers to generic release-gate implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain("10.3390/bioengineering13010108");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
