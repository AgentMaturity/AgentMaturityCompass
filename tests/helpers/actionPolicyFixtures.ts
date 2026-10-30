/**
 * Action Policy fixtures (AXR-02). `amc init` signs the default Action Policy, and native tool calls now meet it as
 * ToolHub does: with no observed diagnostic run every EXECUTE is downgraded to SIMULATE. A test about something else
 * that needs native calls to EXECUTE signs a policy that allows them and installs the observed high-trust run the
 * governor reads, the same state tests/helpers/piHookFixtures.ts gives the hook plane.
 */
import { readFileSync, rmSync } from "node:fs";
import { questionBank } from "../../src/diagnostic/questionBank.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { actionPolicyPath, actionPolicySigPath, defaultActionPolicy, initActionPolicy } from "../../src/governor/actionPolicyEngine.js";
import type { DiagnosticReport } from "../../src/types.js";
import { writeAnchoredRun } from "./sealedRun.js";

/** `report` sealed and ledger-anchored as the runner publishes it; the governor reads only such runs. */
export function writeSealedRun(workspace: string, report: DiagnosticReport, opts: { anchor?: boolean } = {}): DiagnosticReport {
  const file = writeAnchoredRun(workspace, getAgentPaths(workspace, report.agentId).runsDir, report, opts);
  return JSON.parse(readFileSync(file, "utf8")) as DiagnosticReport;
}

/** An observed, high-trust diagnostic run for `agentId`, so the governor's evidence and trust conditions can pass. */
export function installObservedRun(workspace: string, agentId: string): DiagnosticReport {
  return writeSealedRun(workspace, observedRunReport(agentId));
}

/** The unsealed body of the observed high-trust run `installObservedRun` seals. */
export function observedRunReport(agentId: string): DiagnosticReport {
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId, runId: "run_action_policy_fixture", ts: now, windowStartTs: now - 60_000, windowEndTs: now, status: "VALID",
    verificationPassed: true, trustBoundaryViolated: false, trustBoundaryMessage: null, integrityIndex: 0.95,
    trustLabel: "HIGH TRUST", targetProfileId: null, layerScores: [],
    questionScores: questionBank.map((question) => ({
      questionId: question.id, claimedLevel: 5, supportedMaxLevel: 5, finalLevel: 5, confidence: 0.95,
      evidenceEventIds: ["ev_action_policy_fixture"], flags: [], narrative: "Action Policy fixture",
    })),
    inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: 1, invalidReceiptsCount: 0,
    correlationWarnings: [], evidenceCoverage: 1, evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [], runSealSig: "", reportJsonSha256: "",
  };
  return report;
}

/** Sign an Action Policy that lets `agentId` EXECUTE every class without evidence gates, tickets or sandbox attestation. */
export function permitAgentActions(workspace: string, agentId: string): void {
  installObservedRun(workspace, agentId);
  signPermissiveActionPolicy(workspace);
}

/** The signed policy `permitAgentActions` installs, without the run: only a trusted run can then lift EXECUTE. */
export function signPermissiveActionPolicy(workspace: string): void {
  const policy = defaultActionPolicy();
  for (const rule of policy.actions) {
    rule.minEffectiveQuestionLevels = {};
    rule.requireTrustTierAtLeast = "OBSERVED";
    rule.requireAssurancePacks = {};
    rule.allowExecute = true;
    rule.requireExecTicket = false;
  }
  for (const tier of Object.values(policy.riskTierDefaults)) tier.requireSandboxForExecute = false;
  initActionPolicy(workspace, policy);
}

/** Remove the Action Policy and its signature: the "not configured" state. */
export function removeActionPolicy(workspace: string): void {
  rmSync(actionPolicyPath(workspace), { force: true });
  rmSync(actionPolicySigPath(workspace), { force: true });
}
