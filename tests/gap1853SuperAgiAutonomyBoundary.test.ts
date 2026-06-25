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

const DOC = "docs/source-reviews/GAP-1853-superagi-autonomy-boundaries.md";
const REPO = "https://github.com/TransformerOptimus/SuperAGI";
const README = "https://raw.githubusercontent.com/TransformerOptimus/SuperAGI/main/README.MD";
const RELEASE = "https://github.com/TransformerOptimus/SuperAGI/releases/tag/v0.0.14";
const TITLE = "SuperAGI";
const IDENTIFIER = "superagi_autonomy_boundary";
const IMPLEMENTATION_FILES = [
  "src/runtime/autonomyBoundary.ts",
  "src/runtime/index.ts",
  "src/lifecycle/artifactSignature.ts"
];

const sourceCitations: RuntimeAutonomyBoundarySourceCitation[] = [
  {
    sourceId: "github-transformeroptimus-superagi",
    title: TITLE,
    url: REPO,
    retrievedAt: "2026-06-25T09:30:00.000Z"
  },
  {
    sourceId: "github-transformeroptimus-superagi-readme",
    title: "SuperAGI README",
    url: README,
    retrievedAt: "2026-06-25T09:30:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1853-autonomy-boundary-"));
  roots.push(dir);
  return dir;
}

function createRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "runtime-autonomy-boundary-1",
    agentId: "autonomous-agent",
    source: "fleet",
    stage: "plan.created",
    episodeId: "episode-autonomy-boundary-1",
    lifecycleRunId: "lifecycle-autonomy-boundary-1"
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1853 SuperAGI autonomy boundary gates", () => {
  it("documents the live SuperAGI source review and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1853");
    expect(doc).toContain("Autonomy boundary gates");
    expect(doc).toContain(REPO);
    expect(doc).toContain(README);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("open source autonomous AI agent framework");
    expect(doc).toContain("build, manage and run useful Autonomous AI Agents");
    expect(doc).toContain("Action Console");
    expect(doc).toContain("Toolkits allow SuperAGI Agents to interact with external systems");
    expect(doc).toContain("Policy decision, risk tier, requested authority, and block or approval receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No SuperAGI adapter");
  });

  it("blocks plan steps that request authority above the approved boundary", () => {
    const ws = workspace();
    createRun(ws);
    const policy = defaultRuntimeAutonomyBoundaryPolicy({
      policyId: "policy-autonomy-boundary",
      limits: [
        { riskTier: "low", maxAuthority: "write_low", approvalRequired: false },
        { riskTier: "medium", maxAuthority: "write_low", approvalRequired: false },
        { riskTier: "high", maxAuthority: "write_high", approvalRequired: true },
        { riskTier: "critical", maxAuthority: "read", approvalRequired: true }
      ]
    });

    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "autonomous-agent",
      runId: "runtime-autonomy-boundary-1",
      source: "fleet",
      policy,
      sourceCitations,
      planStep: {
        planId: "plan-autonomous-outreach",
        stepId: "step-send-external-email",
        description: "Send an external email using a marketplace toolkit.",
        riskTier: "high",
        requestedAuthority: "external_side_effect",
        evidenceRefs: ["plan-step-receipt", "toolkit-scope-receipt"]
      }
    });

    expect(decision.action).toBe("block");
    expect(decision.riskTier).toBe("high");
    expect(decision.requestedAuthority).toBe("external_side_effect");
    expect(decision.approvedAuthority).toBe("write_high");
    expect(decision.reasons).toEqual(expect.arrayContaining([
      "Requested authority external_side_effect exceeds approved authority write_high.",
      "Risk tier high requires approval receipt."
    ]));
    expect(decision.links.receiptId).toMatch(/^abrec_/);
    expect(decision.links.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(decision.eventPath).toBeTruthy();
    expect(decision.signaturePath).toBeTruthy();
    expect(verifyRuntimeAutonomyBoundaryDecision(decision).valid).toBe(true);
    expect(verifyArtifactFileSignature({ workspace: ws, path: decision.eventPath! }).valid).toBe(true);

    const events = listRuntimeRunEvents({ workspace: ws, runId: "runtime-autonomy-boundary-1", agentId: "autonomous-agent" });
    expect(events.some((event) => event.type === "policy.decision" && event.links.policyDecisionId === decision.decisionId)).toBe(true);

    const audit = renderRuntimeAutonomyBoundaryAuditExport(decision);
    expect(audit).toContain("AMC Runtime Autonomy Boundary Decision");
    expect(audit).toContain("BLOCKED");
    expect(audit).toContain("risk tier: high");
    expect(audit).toContain("requested authority: external_side_effect");
  });

  it("approves above-default authority only when an approval receipt grants that authority", () => {
    const ws = workspace();
    createRun(ws);
    const policy = defaultRuntimeAutonomyBoundaryPolicy({ policyId: "policy-autonomy-boundary" });

    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "autonomous-agent",
      runId: "runtime-autonomy-boundary-1",
      source: "studio",
      policy,
      sourceCitations,
      planStep: {
        planId: "plan-autonomous-research",
        stepId: "step-write-github-issue",
        description: "Create an external GitHub issue from an agent run.",
        riskTier: "high",
        requestedAuthority: "external_side_effect",
        evidenceRefs: ["plan-step-receipt"]
      },
      approval: {
        receiptId: "approval-human-operator-1",
        approvedAuthority: "external_side_effect",
        reviewerId: "ops-lead",
        evidenceRefs: ["ticket-123", "approval-transcript-1"]
      }
    });

    expect(decision.action).toBe("approve");
    expect(decision.approvalReceiptId).toBe("approval-human-operator-1");
    expect(decision.approvedAuthority).toBe("external_side_effect");
    expect(decision.reasons).toEqual(["Requested authority is within approved autonomy boundary."]);
    expect(verifyRuntimeAutonomyBoundaryDecision(decision).valid).toBe(true);
  });

  it("fails closed when repository metadata replaces autonomy-boundary evidence", () => {
    const ws = workspace();
    createRun(ws);
    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "autonomous-agent",
      runId: "runtime-autonomy-boundary-1",
      source: "api",
      policy: defaultRuntimeAutonomyBoundaryPolicy({ policyId: "policy-autonomy-boundary" }),
      sourceCitations,
      planStep: {
        planId: "metadata-only-plan",
        stepId: "metadata-only-step",
        description: "Repository metadata claims an autonomous-agent framework.",
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

  it("does not add SuperAGI-specific identifiers to generic runtime or signing implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("TransformerOptimus");
    expect(combined).not.toContain("SuperAGI");
    expect(combined).not.toContain("v0.0.14");
    expect(combined).not.toContain("autonomous AI agent framework");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
