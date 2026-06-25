import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyArtifactFileSignature } from "../src/lifecycle/artifactSignature.js";
import {
  defaultRuntimeAutonomyBoundaryPolicy,
  evaluateRuntimeAutonomyBoundary,
  renderRuntimeAutonomyBoundaryAuditExport,
  verifyRuntimeAutonomyBoundaryDecision,
  type RuntimeAutonomyBoundarySourceCitation
} from "../src/runtime/autonomyBoundary.js";
import { createRuntimeRun, listRuntimeRunEvents } from "../src/runtime/runManager.js";

const DOC = "docs/source-reviews/GAP-1636-guidance-autonomy-boundary.md";
const REPO = "https://github.com/guidance-ai/guidance";
const API = "https://api.github.com/repos/guidance-ai/guidance";
const README = "https://raw.githubusercontent.com/guidance-ai/guidance/main/README.md";
const CONTENTS = "https://api.github.com/repos/guidance-ai/guidance/contents?ref=main";
const IMPLEMENTATION_FILES = [
  "src/runtime/autonomyBoundary.ts",
  "src/runtime/index.ts",
  "src/toolhub/blastRadiusConsent.ts"
];

const sourceCitations: RuntimeAutonomyBoundarySourceCitation[] = [
  {
    sourceId: "github-guidance-ai-guidance",
    title: "guidance-ai/guidance",
    url: REPO,
    retrievedAt: "2026-06-25T14:55:00.000Z"
  },
  {
    sourceId: "github-guidance-ai-guidance-readme",
    title: "Guidance README",
    url: README,
    retrievedAt: "2026-06-25T14:55:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1636-guidance-autonomy-"));
  roots.push(dir);
  return dir;
}

function createRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "guidance-autonomy-boundary-1",
    agentId: "constrained-tool-agent",
    source: "fleet",
    stage: "plan.created",
    episodeId: "episode-guidance-autonomy-1",
    lifecycleRunId: "lifecycle-guidance-autonomy-1"
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1636 Guidance runtime autonomy boundary", () => {
  it("documents live Guidance metadata and no-bloat autonomy-boundary relevance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1636");
    expect(doc).toContain("runtime-autonomy-boundaries");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain("Jupyter Notebook");
    expect(doc).toContain("MIT");
    expect(doc).toContain("controlling large language models");
    expect(doc).toContain("constrain generation");
    expect(doc).toContain("interleave control");
    expect(doc).toContain("tool use");
    expect(doc).toContain("Policy decision, risk tier, requested authority, and block or approval receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Guidance adapter");
  });

  it("blocks constrained tool-use plan steps above the approved authority and binds requested surfaces", () => {
    const ws = workspace();
    createRun(ws);
    const policy = defaultRuntimeAutonomyBoundaryPolicy({
      policyId: "policy-guidance-autonomy-boundary",
      limits: [
        { riskTier: "low", maxAuthority: "write_low", approvalRequired: false },
        { riskTier: "medium", maxAuthority: "write_low", approvalRequired: false },
        { riskTier: "high", maxAuthority: "write_high", approvalRequired: true },
        { riskTier: "critical", maxAuthority: "read", approvalRequired: true }
      ]
    });

    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "constrained-tool-agent",
      runId: "guidance-autonomy-boundary-1",
      episodeId: "episode-guidance-autonomy-1",
      lifecycleRunId: "lifecycle-guidance-autonomy-1",
      source: "fleet",
      policy,
      sourceCitations,
      planStep: {
        planId: "plan-constrained-data-export",
        stepId: "step-call-external-rest-tool",
        description: "Use a constrained generation program to choose and call an external REST tool.",
        riskTier: "high",
        requestedAuthority: "external_side_effect",
        evidenceRefs: ["plan-step-receipt", "tool-contract-signature", "schema-validation-receipt"]
      }
    });

    expect(decision.action).toBe("block");
    expect(decision.riskTier).toBe("high");
    expect(decision.requestedAuthority).toBe("external_side_effect");
    expect(decision.approvedAuthority).toBe("write_high");
    expect(decision.surfaceBinding).toEqual(["Enforce", "Shield", "Vault", "Fleet", "Watch", "Studio"]);
    expect(decision.reasons).toEqual(expect.arrayContaining([
      "Requested authority external_side_effect exceeds approved authority write_high.",
      "Risk tier high requires approval receipt."
    ]));
    expect(verifyRuntimeAutonomyBoundaryDecision(decision).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: decision.eventPath! }).valid).toBe(true);

    const events = listRuntimeRunEvents({ workspace: ws, runId: "guidance-autonomy-boundary-1", agentId: "constrained-tool-agent" });
    expect(events.some((event) => event.type === "policy.decision" && event.links.policyDecisionId === decision.decisionId)).toBe(true);

    const audit = renderRuntimeAutonomyBoundaryAuditExport(decision);
    expect(audit).toContain("AMC Runtime Autonomy Boundary Decision");
    expect(audit).toContain("BLOCKED");
    expect(audit).toContain("risk tier: high");
    expect(audit).toContain("requested authority: external_side_effect");
  });

  it("approves a high-authority constrained tool step only with an approval receipt", () => {
    const ws = workspace();
    createRun(ws);
    const policy = defaultRuntimeAutonomyBoundaryPolicy({ policyId: "policy-guidance-autonomy-boundary" });

    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "constrained-tool-agent",
      runId: "guidance-autonomy-boundary-1",
      source: "studio",
      policy,
      sourceCitations,
      planStep: {
        planId: "plan-constrained-remediation",
        stepId: "step-write-remediation-ticket",
        description: "Use constrained output to create an external remediation ticket.",
        riskTier: "high",
        requestedAuthority: "external_side_effect",
        evidenceRefs: ["plan-step-receipt", "operator-queue-receipt"]
      },
      approval: {
        receiptId: "approval-guidance-tool-boundary-1",
        approvedAuthority: "external_side_effect",
        reviewerId: "security-lead",
        evidenceRefs: ["ticket-456", "approval-transcript-2"]
      }
    });

    expect(decision.action).toBe("approve");
    expect(decision.approvalReceiptId).toBe("approval-guidance-tool-boundary-1");
    expect(decision.approvedAuthority).toBe("external_side_effect");
    expect(decision.reasons).toEqual(["Requested authority is within approved autonomy boundary."]);
    expect(verifyRuntimeAutonomyBoundaryDecision(decision).valid).toBe(true);
  });

  it("fails closed when Guidance repository metadata replaces autonomy-boundary evidence", () => {
    const ws = workspace();
    createRun(ws);
    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "constrained-tool-agent",
      runId: "guidance-autonomy-boundary-1",
      source: "api",
      policy: defaultRuntimeAutonomyBoundaryPolicy({ policyId: "policy-guidance-autonomy-boundary" }),
      sourceCitations,
      planStep: {
        planId: "metadata-only-guidance-plan",
        stepId: "metadata-only-guidance-step",
        description: "Repository metadata claims constrained generation and tool use.",
        riskTier: "critical",
        requestedAuthority: "admin",
        evidenceRefs: []
      }
    });

    const metadataOnly = verifyRuntimeAutonomyBoundaryDecision({
      ...decision,
      eventPath: null,
      signaturePath: null,
      links: {
        ...decision.links,
        receiptSha256: "0".repeat(64)
      }
    });

    expect(metadataOnly.valid).toBe(false);
    expect(metadataOnly.failClosedReasons).toEqual(expect.arrayContaining([
      "runtime-autonomy-boundary:event-path:missing",
      "runtime-autonomy-boundary:signature:missing",
      "runtime-autonomy-boundary:receipt-hash:mismatch",
      "runtime-autonomy-boundary:step-evidence:missing"
    ]));
  });

  it("does not add Guidance-specific identifiers to generic autonomy or ToolHub implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("guidance-ai");
    expect(combined).not.toContain("Guidance");
    expect(combined).not.toContain("constrained generation framework");
    expect(combined).not.toContain("guidance_autonomy_boundary");
  });
});
