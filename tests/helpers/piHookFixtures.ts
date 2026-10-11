/** Workspace and request fixtures for the Pi tool_call control tests (P1-22). Same setup as tests/hookControl.test.ts. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { questionBank } from "../../src/diagnostic/questionBank.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { defaultActionPolicy, initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import type { DiagnosticReport } from "../../src/types.js";
import { initWorkspace } from "../../src/workspace.js";

const roots: string[] = [];

/** A fresh workspace with signed default policies, an observed high-trust run for `agentId`, and READ_ONLY/WRITE_LOW execution allowed. */
export function controlledWorkspace(agentId: string): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-pi-control-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "pi-control-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initApprovalPolicy(workspace);
  installObservedRun(workspace, agentId);
  const policy = defaultActionPolicy();
  for (const rule of policy.actions) {
    if (rule.actionClass !== "READ_ONLY" && rule.actionClass !== "WRITE_LOW") continue;
    rule.minEffectiveQuestionLevels = {};
    rule.requireTrustTierAtLeast = "OBSERVED";
    rule.requireAssurancePacks = {};
    rule.allowExecute = true;
    rule.requireExecTicket = false;
  }
  policy.riskTierDefaults.low.requireSandboxForExecute = false;
  policy.riskTierDefaults.medium.requireSandboxForExecute = false;
  initActionPolicy(workspace, policy);
  mkdirSync(join(workspace, "workspace"), { recursive: true });
  writeFileSync(join(workspace, "workspace", "public.txt"), "public fixture");
  return workspace;
}

export function removeFixtureWorkspaces(): void {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
}

function installObservedRun(workspace: string, agentId: string): void {
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId, runId: "run_pi_control", ts: now, windowStartTs: now - 60_000, windowEndTs: now, status: "VALID",
    verificationPassed: true, trustBoundaryViolated: false, trustBoundaryMessage: null, integrityIndex: 0.95,
    trustLabel: "HIGH TRUST", targetProfileId: null, layerScores: [],
    questionScores: questionBank.map((question) => ({
      questionId: question.id, claimedLevel: 5, supportedMaxLevel: 5, finalLevel: 5, confidence: 0.95,
      evidenceEventIds: ["ev_pi_control"], flags: [], narrative: "AMC-owned Pi hook control fixture",
    })),
    inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: 1, invalidReceiptsCount: 0,
    correlationWarnings: [], evidenceCoverage: 1, evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [], runSealSig: "fixture", reportJsonSha256: "fixture",
  };
  const paths = getAgentPaths(workspace, agentId);
  mkdirSync(paths.runsDir, { recursive: true });
  writeFileSync(join(paths.runsDir, `${report.runId}.json`), JSON.stringify(report, null, 2));
}

export interface PiEnvelopeOptions {
  version?: string;
  mode?: "tui" | "rpc" | "json" | "print";
  hasUI?: boolean;
  actionId?: string;
  parentActionId?: string | null;
}

/** The body AMC's Pi extension posts for one Pi tool_call event. */
export function piEnvelope(toolName: string, input: Record<string, unknown>, options: PiEnvelopeOptions = {}): string {
  const actionId = options.actionId ?? "pi.call-0001";
  return JSON.stringify({
    hook_event_name: "tool_call",
    tool_name: toolName,
    tool_call_id: actionId,
    tool_input: input,
    pi: {
      version: options.version ?? "1.0.4",
      mode: options.mode ?? "print",
      hasUI: options.hasUI ?? false,
      toolCallId: `toolu_${actionId}`,
      parentActionId: options.parentActionId ?? null,
    },
  });
}

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return address.port;
}
