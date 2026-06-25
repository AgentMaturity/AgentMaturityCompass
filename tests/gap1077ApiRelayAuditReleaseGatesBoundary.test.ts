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

const DOC = "docs/source-reviews/GAP-1077-api-relay-audit-release-gates.md";
const REPO = "https://github.com/toby-bridges/api-relay-audit";
const README = "https://raw.githubusercontent.com/toby-bridges/api-relay-audit/master/README.md";
const LICENSE = "https://raw.githubusercontent.com/toby-bridges/api-relay-audit/master/LICENSE";
const RELEASE = "https://github.com/toby-bridges/api-relay-audit/releases/tag/v2.3.0";
const TITLE = "toby-bridges/api-relay-audit";
const DESCRIPTION = "Local security audit for AI API relays and LLM proxies: detects prompt injection, model substitution, tool-call rewriting, SSE anomalies, error leakage, and Web3 wallet risks.";
const IDENTIFIER = "api_relay_audit_release_gates";

const implementationFiles = [
  "src/ci/gate.ts",
  "src/integrations/ciGate.ts",
  "src/fleet/governance.ts",
  "src/api/ciRouter.ts",
  "src/index.ts",
];

const sourceCitations: ReleaseGateSourceCitation[] = [
  {
    sourceId: "api-relay-audit-github",
    title: TITLE,
    url: REPO,
    retrievedAt: "2026-06-25T07:42:00.000+05:30",
  },
  {
    sourceId: "api-relay-audit-release-v2-3-0",
    title: "api-relay-audit v2.3.0",
    url: RELEASE,
    retrievedAt: "2026-06-25T07:42:00.000+05:30",
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

describe("GAP-1077 api-relay-audit release-gates boundary", () => {
  it("documents live GitHub metadata with required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1077");
    expect(doc).toContain("Deployment and release maturity gates");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DESCRIPTION);
    expect(doc).toContain("default branch `master`");
    expect(doc).toContain("AGPL-3.0");
    expect(doc).toContain("stargazerCount `723`");
    expect(doc).toContain("forkCount `68`");
    expect(doc).toContain("open issues `8`");
    expect(doc).toContain("latest release `v2.3.0`");
    expect(doc).toContain("default branch commit `a8db16a1d90b2e4d35a82758f6b1ac73c1c8d8b1`");
    expect(doc).toContain("signed and verified");
    expect(doc).toContain("README blob `7cb9867d44eb5b25923adee23bf57789e61845d3`");
    expect(doc).toContain("LICENSE blob `be3f7b28e564e7dd05eaf59d64adba1a4065ac0e`");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("model substitution");
    expect(doc).toContain("tool-call rewriting");
    expect(doc).toContain("SSE anomalies");
    expect(doc).toContain("gate config");
    expect(doc).toContain("environment");
    expect(doc).toContain("run receipt");
    expect(doc).toContain("failure reason");
    expect(doc).toContain("override status");
    expect(doc).toContain("metadata-only api-relay-audit evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses the existing release-gate receipt for source-cited relay audit release decisions", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1077-api-relay-audit-release-gates",
      generatedAt: "2026-06-25T07:43:00.000+05:30",
      sourceCitations,
      gates: [
        {
          gateId: "relay-audit-prod-release",
          agentId: "relay-audit-release-agent",
          environment: "production",
          gateConfig: {
            ...defaultGatePolicy(),
            minValueScore: 80,
            denyIfValueRegression: true,
          },
          policyPath: "agents/relay-audit-release-agent/gatePolicy.json",
          bundlePath: "agents/relay-audit-release-agent/bundles/latest.amcbundle",
          evaluatedAt: "2026-06-25T07:43:10.000+05:30",
          passed: false,
          failureReasons: [
            "Shield relay-integrity regression evidence missing from release bundle.",
            "Value gate configured but outcomes/report.json is missing in bundle.",
          ],
          runReceiptRef: "bundle://relay-audit-release-agent/latest/run.json",
          runReceiptHash: "a".repeat(64),
          override: {
            overrideId: "override-relay-audit-prod-release-2026-06",
            status: "rejected",
            requesterId: "release-owner@example.com",
            approverId: "security-owner@example.com",
            reason: "Relay audit release cannot proceed without signed security and value evidence.",
            decidedAt: "2026-06-25T07:44:00.000+05:30",
            signedEvidenceRef: "ledger-override-relay-audit-prod-release-2026-06",
            signatureSha256: "b".repeat(64),
          },
          evidenceRefs: [
            signedEvidence("ev-relay-audit-gate-policy-signed", "c"),
            signedEvidence("ev-relay-audit-bundle-verified", "d", "bundle_verify"),
          ],
          sourceCitationIds: ["api-relay-audit-github", "api-relay-audit-release-v2-3-0"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      gateId: "relay-audit-prod-release",
      environment: "production",
      passed: false,
      overrideStatus: "rejected",
      runReceiptRef: "bundle://relay-audit-release-agent/latest/run.json",
      sourceCitationIds: ["api-relay-audit-github", "api-relay-audit-release-v2-3-0"],
    });
    expect(receipt.rows[0]?.gateConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.evidenceChainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(true);

    const exportText = renderReleaseGateAuditExport(receipt);
    expect(exportText).toContain("AMC Release Gate Audit Export");
    expect(exportText).toContain("relay-audit-prod-release");
    expect(exportText).toContain("override rejected");
    expect(exportText).toContain("Shield relay-integrity regression evidence missing from release bundle.");
  });

  it("fails closed when repository metadata replaces signed release-gate proof", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "gap1077-metadata-only-release-gates",
      generatedAt: "2026-06-25T07:45:00.000+05:30",
      sourceCitations,
      gates: [
        {
          gateId: "metadata-only-relay-gate",
          agentId: "metadata-only-relay-agent",
          environment: "production",
          gateConfig: defaultGatePolicy(),
          evaluatedAt: "2026-06-25T07:45:10.000+05:30",
          passed: false,
          failureReasons: [],
          runReceiptRef: "",
          runReceiptHash: "",
          override: {
            overrideId: "override-without-relay-signature",
            status: "approved",
            requesterId: "release-owner@example.com",
            approverId: "",
            reason: "Repository stars and README text should not approve release.",
            decidedAt: "2026-06-25T07:45:30.000+05:30",
          },
          evidenceRefs: [],
          sourceCitationIds: ["api-relay-audit-github"],
        },
      ],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-relay-gate:failureReason:missing",
      "metadata-only-relay-gate:runReceipt:missing",
      "metadata-only-relay-gate:evidenceChain:missing",
      "metadata-only-relay-gate:override:missing",
    ]));
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(false);
  });

  it("does not add api-relay-audit identifiers to generic release-gate implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("toby-bridges/api-relay-audit");
      expect(source).not.toContain("api-relay-audit");
      expect(source).not.toContain("a8db16a1d90b2e4d35a82758f6b1ac73c1c8d8b1");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
