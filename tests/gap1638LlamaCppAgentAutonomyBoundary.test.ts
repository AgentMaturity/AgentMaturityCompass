import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultRuntimeAutonomyBoundaryPolicy,
  evaluateRuntimeAutonomyBoundary,
  verifyRuntimeAutonomyBoundaryDecision,
  type RuntimeAutonomyBoundarySourceCitation
} from "../src/runtime/autonomyBoundary.js";
import { createRuntimeRun, listRuntimeRunEvents } from "../src/runtime/runManager.js";

const DOC = "docs/source-reviews/GAP-1638-llama-cpp-agent-autonomy-boundary.md";
const REPO = "https://github.com/Maximilian-Winter/llama-cpp-agent";
const API = "https://api.github.com/repos/Maximilian-Winter/llama-cpp-agent";
const README = "https://raw.githubusercontent.com/Maximilian-Winter/llama-cpp-agent/master/ReadMe.md";
const MAIN_README = "https://raw.githubusercontent.com/Maximilian-Winter/llama-cpp-agent/main/README.md";
const CONTENTS = "https://api.github.com/repos/Maximilian-Winter/llama-cpp-agent/contents?ref=master";
const RELEASE = "https://github.com/Maximilian-Winter/llama-cpp-agent/releases/tag/0.2.35";
const IMPLEMENTATION_FILES = [
  "src/runtime/autonomyBoundary.ts",
  "src/runtime/index.ts",
  "src/toolhub/blastRadiusConsent.ts"
];

const sourceCitations: RuntimeAutonomyBoundarySourceCitation[] = [
  {
    sourceId: "github-maximilian-winter-llama-cpp-agent",
    title: "Maximilian-Winter/llama-cpp-agent",
    url: REPO,
    retrievedAt: "2026-06-25T15:00:00.000Z"
  },
  {
    sourceId: "github-maximilian-winter-llama-cpp-agent-readme",
    title: "llama-cpp-agent ReadMe",
    url: README,
    retrievedAt: "2026-06-25T15:00:00.000Z"
  }
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1638-llama-cpp-agent-"));
  roots.push(dir);
  return dir;
}

function createRun(ws: string): void {
  createRuntimeRun({
    workspace: ws,
    runId: "llama-cpp-agent-autonomy-boundary-1",
    agentId: "function-calling-agent",
    source: "fleet",
    stage: "plan.created",
    episodeId: "episode-llama-cpp-agent-1",
    lifecycleRunId: "lifecycle-llama-cpp-agent-1"
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("GAP-1638 llama-cpp-agent runtime autonomy boundary", () => {
  it("documents live llama-cpp-agent metadata and no-bloat autonomy-boundary relevance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1638");
    expect(doc).toContain("runtime-autonomy-boundaries");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(MAIN_README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("default_branch `master`");
    expect(doc).toContain("ReadMe.md");
    expect(doc).toContain("Not Longer Maintained");
    expect(doc).toContain("function-calling");
    expect(doc).toContain("parallel-function-call");
    expect(doc).toContain("guided sampling");
    expect(doc).toContain("structured function calls");
    expect(doc).toContain("structured output");
    expect(doc).toContain("Policy decision, risk tier, requested authority, and block or approval receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No llama-cpp-agent adapter");
  });

  it("blocks function-calling plan steps above the approved runtime authority", () => {
    const ws = workspace();
    createRun(ws);

    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "function-calling-agent",
      runId: "llama-cpp-agent-autonomy-boundary-1",
      episodeId: "episode-llama-cpp-agent-1",
      lifecycleRunId: "lifecycle-llama-cpp-agent-1",
      source: "fleet",
      policy: defaultRuntimeAutonomyBoundaryPolicy({ policyId: "policy-llama-cpp-agent-autonomy-boundary" }),
      sourceCitations,
      planStep: {
        planId: "plan-parallel-function-calls",
        stepId: "step-run-provider-tool-call",
        description: "Execute a structured function call through a local model agent.",
        riskTier: "high",
        requestedAuthority: "external_side_effect",
        evidenceRefs: ["plan-step-receipt", "function-schema-signature", "tool-contract-signature"]
      }
    });

    expect(decision.action).toBe("block");
    expect(decision.surfaceBinding).toEqual(["Enforce", "Shield", "Vault", "Fleet", "Watch", "Studio"]);
    expect(decision.reasons).toEqual(expect.arrayContaining([
      "Requested authority external_side_effect exceeds approved authority write_high.",
      "Risk tier high requires approval receipt."
    ]));
    expect(verifyRuntimeAutonomyBoundaryDecision(decision)).toEqual({ valid: true, failClosedReasons: [] });

    const events = listRuntimeRunEvents({ workspace: ws, runId: "llama-cpp-agent-autonomy-boundary-1", agentId: "function-calling-agent" });
    expect(events.some((event) => event.type === "policy.decision" && event.links.policyDecisionId === decision.decisionId)).toBe(true);
  });

  it("approves function-calling side effects only when approval grants that authority", () => {
    const ws = workspace();
    createRun(ws);

    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "function-calling-agent",
      runId: "llama-cpp-agent-autonomy-boundary-1",
      source: "studio",
      policy: defaultRuntimeAutonomyBoundaryPolicy({ policyId: "policy-llama-cpp-agent-autonomy-boundary" }),
      sourceCitations,
      planStep: {
        planId: "plan-parallel-function-calls",
        stepId: "step-create-support-ticket",
        description: "Create an external support ticket from structured function-call output.",
        riskTier: "high",
        requestedAuthority: "external_side_effect",
        evidenceRefs: ["plan-step-receipt", "function-call-audit"]
      },
      approval: {
        receiptId: "approval-llama-cpp-agent-tool-boundary-1",
        approvedAuthority: "external_side_effect",
        reviewerId: "ops-lead",
        evidenceRefs: ["approval-ticket-789", "operator-transcript"]
      }
    });

    expect(decision.action).toBe("approve");
    expect(decision.approvalReceiptId).toBe("approval-llama-cpp-agent-tool-boundary-1");
    expect(decision.approvedAuthority).toBe("external_side_effect");
    expect(verifyRuntimeAutonomyBoundaryDecision(decision).valid).toBe(true);
  });

  it("fails closed when llama-cpp-agent metadata replaces autonomy-boundary evidence", () => {
    const ws = workspace();
    createRun(ws);
    const decision = evaluateRuntimeAutonomyBoundary({
      workspace: ws,
      agentId: "function-calling-agent",
      runId: "llama-cpp-agent-autonomy-boundary-1",
      source: "api",
      policy: defaultRuntimeAutonomyBoundaryPolicy({ policyId: "policy-llama-cpp-agent-autonomy-boundary" }),
      sourceCitations,
      planStep: {
        planId: "metadata-only-llama-cpp-agent-plan",
        stepId: "metadata-only-llama-cpp-agent-step",
        description: "Repository metadata claims function calling and structured output.",
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

  it("does not add llama-cpp-agent identifiers to generic runtime or ToolHub implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("Maximilian-Winter");
    expect(combined).not.toContain("llama-cpp-agent");
    expect(combined).not.toContain("parallel-function-call");
    expect(combined).not.toContain("FunctionCallingAgent");
  });
});
