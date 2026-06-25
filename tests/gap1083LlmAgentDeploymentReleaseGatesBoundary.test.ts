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

const DOC = "docs/source-reviews/GAP-1083-llm-agent-deployment-release-gates.md";
const OPENALEX = "https://openalex.org/W7128522356";
const OPENALEX_API = "https://api.openalex.org/works/W7128522356";
const DOI = "https://doi.org/10.1016/j.ins.2026.123231";
const CROSSREF = "https://api.crossref.org/works/10.1016%2Fj.ins.2026.123231";
const ELSEVIER = "https://linkinghub.elsevier.com/retrieve/pii/S0020025526001623";
const TITLE = "Bridging AI and software security: A comparative vulnerability assessment of LLM agent deployment paradigms";
const IDENTIFIER = "llm_agent_deployment_release_gates";

const implementationFiles = [
  "src/ci/gate.ts",
  "src/integrations/ciGate.ts",
  "src/fleet/governance.ts",
  "src/api/ciRouter.ts",
  "src/index.ts",
];

const sourceCitations: ReleaseGateSourceCitation[] = [
  {
    sourceId: "openalex-llm-agent-deployment-security",
    title: TITLE,
    url: OPENALEX,
    retrievedAt: "2026-06-25T08:33:00.000+05:30",
  },
  {
    sourceId: "doi-llm-agent-deployment-security",
    title: TITLE,
    url: DOI,
    retrievedAt: "2026-06-25T08:33:00.000+05:30",
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

describe("GAP-1083 LLM agent deployment release-gates boundary", () => {
  it("documents live OpenAlex, Crossref, DOI, and Elsevier metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1083");
    expect(doc).toContain("Deployment and release maturity gates");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ELSEVIER);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-02-11`");
    expect(doc).toContain("issued/print date `2026-06`");
    expect(doc).toContain("Information Sciences");
    expect(doc).toContain("Elsevier BV");
    expect(doc).toContain("ISSN `0020-0255`");
    expect(doc).toContain("closed");
    expect(doc).toContain("Tarek Gasmi");
    expect(doc).toContain("Manouba University");
    expect(doc).toContain("Ramzi Guesmi");
    expect(doc).toContain("Software deployment");
    expect(doc).toContain("Computer security");
    expect(doc).toContain("Vulnerability assessment");
    expect(doc).toContain("Software security assurance");
    expect(doc).toContain("HTTP/2 `302`");
    expect(doc).toContain("HTTP/2 `200`");
    expect(doc).toContain("Redirecting");
    expect(doc).toContain("gate config");
    expect(doc).toContain("environment");
    expect(doc).toContain("run receipt");
    expect(doc).toContain("failure reason");
    expect(doc).toContain("override status");
    expect(doc).toContain("metadata-only LLM-agent-deployment evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing release-gate receipt for source-cited agent-deployment security decisions", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1083-llm-agent-deployment-release-gates",
      generatedAt: "2026-06-25T08:34:00.000+05:30",
      sourceCitations,
      gates: [
        {
          gateId: "llm-agent-prod-security-release",
          agentId: "production-llm-agent",
          environment: "production",
          gateConfig: {
            ...defaultGatePolicy(),
            minOverall: 4,
            minValueScore: 80,
            denyIfValueRegression: true,
            maxCostIncreaseRatio: 1.15,
          },
          policyPath: "agents/production-llm-agent/gatePolicy.json",
          bundlePath: "agents/production-llm-agent/bundles/latest.amcbundle",
          evaluatedAt: "2026-06-25T08:34:10.000+05:30",
          passed: false,
          failureReasons: [
            "Shield vulnerability assessment evidence is missing from the deployment bundle.",
            "Watch production observability receipt is missing from the deployment bundle.",
            "Comply release control mapping is missing owner-approved exception evidence.",
          ],
          runReceiptRef: "bundle://production-llm-agent/latest/run.json",
          runReceiptHash: "a".repeat(64),
          override: {
            overrideId: "override-llm-agent-prod-security-release-2026-06",
            status: "rejected",
            requesterId: "release-owner@example.com",
            approverId: "security-owner@example.com",
            reason: "Production deployment cannot proceed without signed security, observability, and compliance release evidence.",
            decidedAt: "2026-06-25T08:35:00.000+05:30",
            signedEvidenceRef: "ledger-override-llm-agent-prod-security-release-2026-06",
            signatureSha256: "b".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-llm-agent-prod-gate-policy-signed", "c"),
            signedEvidence("ev-llm-agent-prod-bundle-verified", "d", "bundle_verify"),
            signedEvidence("ev-llm-agent-prod-security-review", "e", "shield_review"),
          ],
          sourceCitationIds: ["openalex-llm-agent-deployment-security", "doi-llm-agent-deployment-security"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      gateId: "llm-agent-prod-security-release",
      agentId: "production-llm-agent",
      environment: "production",
      passed: false,
      overrideStatus: "rejected",
      runReceiptRef: "bundle://production-llm-agent/latest/run.json",
      sourceCitationIds: ["openalex-llm-agent-deployment-security", "doi-llm-agent-deployment-security"],
    });
    expect(receipt.rows[0]?.gateConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(true);

    const exportText = renderReleaseGateAuditExport(receipt);
    expect(exportText).toContain("AMC Release Gate Audit Export");
    expect(exportText).toContain("llm-agent-prod-security-release");
    expect(exportText).toContain("override rejected");
    expect(exportText).toContain("Shield vulnerability assessment evidence is missing from the deployment bundle.");
    expect(exportText).toContain("Comply release control mapping is missing owner-approved exception evidence.");
  });

  it("fails closed when paper metadata replaces signed release-gate proof", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1083-metadata-only-release-gates",
      generatedAt: "2026-06-25T08:36:00.000+05:30",
      sourceCitations,
      gates: [
        {
          gateId: "metadata-only-agent-deployment-gate",
          agentId: "metadata-only-deployment-agent",
          environment: "production",
          gateConfig: defaultGatePolicy(),
          evaluatedAt: "2026-06-25T08:36:10.000+05:30",
          passed: false,
          failureReasons: [],
          runReceiptRef: "",
          runReceiptHash: "",
          override: {
            overrideId: "override-without-agent-deployment-proof",
            status: "approved",
            requesterId: "release-owner@example.com",
            approverId: "",
            reason: "Paper metadata alone should not approve an agent deployment.",
            decidedAt: "2026-06-25T08:36:30.000+05:30",
          },
          evidenceRefs: [],
          sourceCitationIds: ["openalex-llm-agent-deployment-security"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-agent-deployment-gate:failureReason:missing",
      "metadata-only-agent-deployment-gate:runReceipt:missing",
      "metadata-only-agent-deployment-gate:evidenceChain:missing",
      "metadata-only-agent-deployment-gate:override:missing",
    ]));
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(false);
  });

  it("does not add paper-specific identifiers to generic release-gate implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain("10.1016/j.ins.2026.123231");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
