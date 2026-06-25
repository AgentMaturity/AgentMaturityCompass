import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReleaseGateReceipt,
  defaultGatePolicy,
  renderReleaseGateAuditExport,
  verifyReleaseGateReceipt,
  type ReleaseGateControlEvidence,
  type ReleaseGateEvidenceLink,
  type ReleaseGateSourceCitation
} from "../src/index.js";

const DOC = "docs/source-reviews/GAP-4748-plano-deployment-release-gates.md";
const GITHUB_REPO = "https://github.com/katanemo/plano";
const GITHUB_REPO_API = "https://api.github.com/repos/katanemo/plano";
const GITHUB_LANGUAGES_API = "https://api.github.com/repos/katanemo/plano/languages";
const GITHUB_LICENSE_API = "https://api.github.com/repos/katanemo/plano/license";
const README_RAW = "https://raw.githubusercontent.com/katanemo/plano/main/README.md";
const IDENTIFIER = "llmops-release-gates";
const IMPLEMENTATION_FILES = [
  "src/ci/gate.ts",
  "src/fleet/governance.ts",
  "src/index.ts"
];

const sourceCitations: ReleaseGateSourceCitation[] = [
  {
    sourceId: "github-repo",
    title: "katanemo/plano GitHub repository metadata",
    url: GITHUB_REPO_API,
    retrievedAt: "2026-06-25T12:15:00.000Z"
  },
  {
    sourceId: "readme",
    title: "Plano README",
    url: README_RAW,
    retrievedAt: "2026-06-25T12:15:00.000Z"
  }
];

function signedEvidence(id: string, seed: string, eventType = "release_gate"): ReleaseGateEvidenceLink {
  return {
    eventId: id,
    eventHash: seed.repeat(64).slice(0, 64),
    eventType,
    signedEvidenceRef: `ledger-${id}`
  };
}

function controlEvidence(overrides: Partial<ReleaseGateControlEvidence>[] = []): ReleaseGateControlEvidence[] {
  const base: ReleaseGateControlEvidence[] = [
    {
      control: "score",
      passed: true,
      evidenceRef: "ledger-score-release-control",
      reason: "Score and integrity gates passed for the target environment."
    },
    {
      control: "security",
      passed: true,
      evidenceRef: "ledger-security-release-control",
      reason: "Shield release security review passed."
    },
    {
      control: "compliance",
      passed: true,
      evidenceRef: "ledger-compliance-release-control",
      reason: "Comply release control mapping is owner approved."
    },
    {
      control: "cost",
      passed: true,
      evidenceRef: "ledger-cost-release-control",
      reason: "Cost budget and experiment cost ratio gates passed."
    },
    {
      control: "observability",
      passed: true,
      evidenceRef: "ledger-observability-release-control",
      reason: "Watch observability and alert coverage gates passed."
    }
  ];

  return base.map((row) => ({
    ...row,
    ...overrides.find((override) => override.control === row.control)
  }));
}

describe("GAP-4748 Plano deployment release maturity gates boundary", () => {
  it("documents live Plano metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4748");
    expect(doc).toContain("katanemo/plano");
    expect(doc).toContain(GITHUB_REPO);
    expect(doc).toContain(GITHUB_REPO_API);
    expect(doc).toContain(GITHUB_LANGUAGES_API);
    expect(doc).toContain(GITHUB_LICENSE_API);
    expect(doc).toContain(README_RAW);
    expect(doc).toContain("AI-native proxy");
    expect(doc).toContain("data plane");
    expect(doc).toContain("orchestration");
    expect(doc).toContain("guardrail");
    expect(doc).toContain("observability");
    expect(doc).toContain("smart LLM routing");
    expect(doc).toContain("Rust");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Gate config, environment, run receipt, failure reason, and override status");
    expect(doc).toContain("score, security, compliance, cost, and observability");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Plano adapter");
  });

  it("blocks rollout when any required release control fails but evidence is complete", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "plano-release-gate-blocked",
      generatedAt: "2026-06-25T12:16:00.000Z",
      sourceCitations,
      gates: [
        {
          gateId: "agent-prod-llmops-release",
          agentId: "production-routing-agent",
          environment: "production",
          gateConfig: {
            ...defaultGatePolicy(),
            minOverall: 4,
            minValueScore: 85,
            denyIfValueRegression: true,
            maxCostIncreaseRatio: 1.1
          },
          policyPath: "agents/production-routing-agent/gatePolicy.json",
          bundlePath: "agents/production-routing-agent/bundles/latest.amcbundle",
          evaluatedAt: "2026-06-25T12:16:10.000Z",
          passed: false,
          failureReasons: [
            "Shield release security review failed for external tool routing.",
            "Watch production observability receipt is missing live alert coverage."
          ],
          runReceiptRef: "bundle://production-routing-agent/latest/run.json",
          runReceiptHash: "a".repeat(64),
          override: {
            overrideId: "override-production-routing-agent-2026-06",
            status: "rejected",
            requesterId: "release-owner@example.com",
            approverId: "security-owner@example.com",
            reason: "Production rollout cannot proceed until security and observability controls pass.",
            decidedAt: "2026-06-25T12:17:00.000Z",
            signedEvidenceRef: "ledger-override-production-routing-agent-2026-06",
            signatureSha256: "b".repeat(64)
          },
          controlEvidence: controlEvidence([
            {
              control: "security",
              passed: false,
              evidenceRef: "ledger-security-release-control-failed",
              reason: "External tool routing security review failed."
            },
            {
              control: "observability",
              passed: false,
              evidenceRef: "ledger-observability-release-control-failed",
              reason: "Missing production alert coverage."
            }
          ]),
          evidenceRefs: [
            signedEvidence("ev-plano-gate-policy-signed", "c"),
            signedEvidence("ev-plano-bundle-verified", "d", "bundle_verify"),
            signedEvidence("ev-plano-security-release-control", "e", "shield_release"),
            signedEvidence("ev-plano-observability-release-control", "f", "watch_release")
          ],
          sourceCitationIds: ["github-repo", "readme"]
        }
      ]
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0]).toMatchObject({
      gateId: "agent-prod-llmops-release",
      agentId: "production-routing-agent",
      environment: "production",
      passed: false,
      overrideStatus: "rejected",
      controlStatus: "failed"
    });
    expect(receipt.rows[0]!.controlEvidence.map((row) => row.control)).toEqual([
      "score",
      "security",
      "compliance",
      "cost",
      "observability"
    ]);
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(true);

    const exportText = renderReleaseGateAuditExport(receipt);
    expect(exportText).toContain("agent-prod-llmops-release");
    expect(exportText).toContain("override rejected");
    expect(exportText).toContain("control failed");
    expect(exportText).toContain("Shield release security review failed");
    expect(exportText).toContain("Watch production observability receipt is missing");
  });

  it("passes rollout only when all required release controls pass with evidence", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "plano-release-gate-pass",
      generatedAt: "2026-06-25T12:18:00.000Z",
      sourceCitations,
      gates: [
        {
          gateId: "agent-staging-llmops-release",
          agentId: "staging-routing-agent",
          environment: "staging",
          gateConfig: defaultGatePolicy(),
          evaluatedAt: "2026-06-25T12:18:10.000Z",
          passed: true,
          failureReasons: [],
          runReceiptRef: "bundle://staging-routing-agent/latest/run.json",
          runReceiptHash: "1".repeat(64),
          controlEvidence: controlEvidence(),
          evidenceRefs: [
            signedEvidence("ev-plano-staging-gate-policy-signed", "2"),
            signedEvidence("ev-plano-staging-bundle-verified", "3", "bundle_verify"),
            signedEvidence("ev-plano-staging-all-controls", "4", "release_controls")
          ],
          sourceCitationIds: ["github-repo", "readme"]
        }
      ]
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.rows[0]).toMatchObject({
      passed: true,
      controlStatus: "passed"
    });
    expect(receipt.rows[0]!.controlEvidence.every((row) => row.passed)).toBe(true);
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(true);
  });

  it("fails closed when metadata replaces gate config, control evidence, run receipt, failure reason, or override proof", () => {
    const receipt = buildReleaseGateReceipt({
      receiptId: "metadata-only-plano-release-gates",
      generatedAt: "2026-06-25T12:19:00.000Z",
      sourceCitations,
      gates: [
        {
          gateId: "metadata-only-plano-release-gate",
          agentId: "metadata-only-routing-agent",
          environment: "production",
          gateConfig: defaultGatePolicy(),
          evaluatedAt: "2026-06-25T12:19:10.000Z",
          passed: true,
          failureReasons: [],
          runReceiptRef: "",
          runReceiptHash: "",
          override: {
            overrideId: "override-without-plano-release-proof",
            status: "approved",
            requesterId: "release-owner@example.com",
            approverId: "",
            reason: "Repository metadata alone must not approve a rollout.",
            decidedAt: "2026-06-25T12:19:30.000Z"
          },
          controlEvidence: [
            {
              control: "score",
              passed: true,
              evidenceRef: "",
              reason: "metadata-only score claim"
            }
          ],
          evidenceRefs: [],
          sourceCitationIds: ["github-repo"]
        }
      ]
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "metadata-only-plano-release-gate:runReceipt:missing",
      "metadata-only-plano-release-gate:evidenceChain:missing",
      "metadata-only-plano-release-gate:override:missing",
      "metadata-only-plano-release-gate:controlEvidence:security:missing",
      "metadata-only-plano-release-gate:controlEvidence:compliance:missing",
      "metadata-only-plano-release-gate:controlEvidence:cost:missing",
      "metadata-only-plano-release-gate:controlEvidence:observability:missing",
      "metadata-only-plano-release-gate:controlEvidence:score:evidenceRef:missing"
    ]));
    expect(verifyReleaseGateReceipt(receipt).valid).toBe(false);
  });

  it("does not add Plano-specific identifiers to generic release-gate implementation modules", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => existsSync(file) ? readFileSync(file, "utf8") : "").join("\n");
    expect(combined).not.toContain("katanemo/plano");
    expect(combined).not.toContain("Plano");
    expect(combined).not.toContain("planoai");
    expect(combined).not.toContain("agentic apps");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
