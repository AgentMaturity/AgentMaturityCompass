import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import {
  generateComplianceReport,
  verifyComplianceMapsSignature,
} from "../compliance/complianceEngine.js";
import type { ComplianceFramework } from "../compliance/frameworks.js";
import { listFleetLifecycleRunArtifacts } from "../fleet/fleetLifecycle.js";
import {
  listAgents,
  verifyFleetConfigSignature,
} from "../fleet/registry.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyLedgerIntegrity } from "../ledger/ledger.js";
import { listObservabilityLaneRecords } from "../lifecycle/observabilityLane.js";
import {
  listPassportExportFiles,
  loadPassportCache,
  verifyPassportCacheSignature,
  verifyPassportPolicySignature,
} from "../passport/passportStore.js";
import { verifyPassportArtifactFile } from "../passport/passportVerifier.js";
import { projectOnboardingActivation } from "../setup/onboardingActivation.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { pathExists } from "../utils/fs.js";
import { vaultStatus } from "../vault/vault.js";

export type UnifiedSurfaceModuleStatus = "success" | "failed" | "skipped";

export interface UnifiedSurfaceModuleResult {
  name: "Enforce" | "Vault" | "Watch" | "Comply" | "Fleet" | "Passport";
  status: UnifiedSurfaceModuleStatus;
  score: number;
  grade: string;
  summary: string;
  issues: string[];
  upgradePath: string;
  evidenceRefs: string[];
}

function scoreToGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C-";
  if (score >= 50) return "D";
  return "F";
}

function result(
  input: Omit<UnifiedSurfaceModuleResult, "grade">,
): UnifiedSurfaceModuleResult {
  const score = input.status === "failed"
    ? 0
    : Math.max(0, Math.min(100, Math.round(input.score)));
  return { ...input, score, grade: scoreToGrade(score) };
}

function inspectEnforce(workspace: string, agentId: string): UnifiedSurfaceModuleResult {
  const signatures = [
    ["action policy", verifyActionPolicySignature(workspace)],
    ["approval policy", verifyApprovalPolicySignature(workspace)],
    ["ToolHub policy", verifyToolsConfigSignature(workspace)],
  ] as const;
  const invalid = signatures.filter(([, check]) => check.signatureExists && !check.valid);
  const missing = signatures.filter(([, check]) => !check.signatureExists);
  if (invalid.length > 0) {
    return result({
      name: "Enforce",
      status: "failed",
      score: 0,
      summary: "Signed enforcement configuration failed integrity verification.",
      issues: invalid.map(([label, check]) => `${label} signature invalid: ${check.reason ?? "unknown"}`),
      upgradePath: "Run `amc doctor --strict --json`, repair the signed policies, and rerun `amc run`.",
      evidenceRefs: invalid.flatMap(([, check]) => [check.path, check.sigPath]),
    });
  }

  const activation = projectOnboardingActivation({ workspace, agentId });
  if (!activation.integrity.valid) {
    return result({
      name: "Enforce",
      status: "failed",
      score: 0,
      summary: "Runtime control evidence failed closed.",
      issues: activation.integrity.reasonCodes.map((code) => `activation integrity: ${code}`),
      upgradePath: activation.nextAction?.command ?? "Run `amc doctor --strict --json`.",
      evidenceRefs: activation.milestones.flatMap((milestone) => milestone.evidence ? [milestone.evidence.eventId] : []),
    });
  }

  const milestone = (id: string) => activation.milestones.find((item) => item.id === id);
  const connected = ["READY", "COMPLETE"].includes(milestone("connected_agent")?.status ?? "WAITING");
  const observed = milestone("observed_action")?.status === "COMPLETE";
  const decision = milestone("control_decision")?.status === "COMPLETE";
  const proof = milestone("signed_proof")?.status === "COMPLETE";
  const verifiedConfigs = signatures.filter(([, check]) => check.valid).length;
  const score = verifiedConfigs * 10 + (connected ? 10 : 0) + (observed ? 20 : 0) + (decision ? 25 : 0) + (proof ? 15 : 0);
  const issues = [
    ...missing.map(([label]) => `${label} signature missing`),
    ...activation.milestones
      .filter((item) => item.status !== "COMPLETE")
      .map((item) => `${item.label}: ${item.summary}`),
  ];
  return result({
    name: "Enforce",
    status: proof && decision ? "success" : "skipped",
    score,
    summary: `${verifiedConfigs}/3 signed control configs verified; runtime activation ${activation.progress.completed}/4 (${activation.status}).`,
    issues,
    upgradePath: activation.nextAction?.command ?? "Keep control receipts current with real governed actions.",
    evidenceRefs: activation.milestones.flatMap((item) => item.evidence ? [item.evidence.eventId, item.evidence.receiptId] : []),
  });
}

async function inspectVault(workspace: string): Promise<UnifiedSurfaceModuleResult> {
  const status = vaultStatus(workspace);
  const ledgerPath = `${workspace}/.amc/evidence.sqlite`;
  const ledgerExists = pathExists(ledgerPath);
  let ledgerValid = false;
  let ledgerErrors: string[] = [];
  if (ledgerExists) {
    try {
      const verified = await verifyLedgerIntegrity(workspace);
      ledgerValid = verified.ok;
      ledgerErrors = verified.errors;
    } catch (error) {
      ledgerErrors = [String(error)];
    }
  }
  const score = (status.exists ? 25 : 0)
    + (pathExists(status.metaPath) ? 15 : 0)
    + (ledgerExists ? 15 : 0)
    + (ledgerValid ? 45 : 0);
  const issues = [
    ...(!status.exists ? ["encrypted vault is missing"] : []),
    ...(!ledgerExists ? ["evidence ledger is missing"] : []),
    ...ledgerErrors.map((error) => `ledger integrity: ${error}`),
  ];
  return result({
    name: "Vault",
    status: status.exists && ledgerValid ? "success" : "failed",
    score,
    summary: status.exists && ledgerValid
      ? `Encrypted vault present; evidence ledger verified${status.unlocked ? " with an active local session" : " while locked"}.`
      : "Vault or ledger proof is incomplete.",
    issues,
    upgradePath: "Run `amc vault status`, `amc ledger verify`, and repair every integrity error before using proof externally.",
    evidenceRefs: [status.vaultPath, status.metaPath, ledgerPath],
  });
}

function inspectWatch(workspace: string, agentId: string): UnifiedSurfaceModuleResult {
  const activation = projectOnboardingActivation({ workspace, agentId });
  if (!activation.integrity.valid) {
    return result({
      name: "Watch",
      status: "failed",
      score: 0,
      summary: "Watch withheld state because runtime evidence integrity failed.",
      issues: activation.integrity.reasonCodes.map((code) => `activation integrity: ${code}`),
      upgradePath: activation.nextAction?.command ?? "Run `amc doctor --strict --json`.",
      evidenceRefs: [],
    });
  }

  let records;
  try {
    records = listObservabilityLaneRecords({ workspace, agentId, limit: 20 });
  } catch (error) {
    return result({
      name: "Watch",
      status: "failed",
      score: 0,
      summary: "Persisted observability records could not be read safely.",
      issues: [String(error)],
      upgradePath: "Inspect and repair the signed observability lane before monitoring claims.",
      evidenceRefs: [],
    });
  }
  const observedAction = activation.milestones.find((item) => item.id === "observed_action")?.status === "COMPLETE";
  const observedSignals = records.reduce(
    (count, record) => count + record.experienceCorpus.filter((signal) => signal.trustTier === "observed").length,
    0,
  );
  const observedDecisions = records.reduce((count, record) => count + record.summary.observedDecisionCount, 0);
  const score = (observedAction ? 25 : 0)
    + (records.length > 0 ? 25 : 0)
    + (observedSignals > 0 ? 25 : 0)
    + (observedDecisions > 0 ? 25 : 0);
  return result({
    name: "Watch",
    status: records.length > 0 && (observedSignals > 0 || observedDecisions > 0) ? "success" : "skipped",
    score,
    summary: `${records.length} persisted observability record(s), ${observedSignals} observed signal(s), ${observedDecisions} observed decision(s).`,
    issues: records.length === 0
      ? ["no persisted observability-lane record exists; process-local monitor objects are not counted as proof"]
      : observedSignals === 0 && observedDecisions === 0
        ? ["records contain derived state but no observed runtime signal or decision"]
        : [],
    upgradePath: activation.nextAction?.command ?? "Run a real agent action through AMC, then rerun `amc run`.",
    evidenceRefs: records.map((record) => record.observabilityId),
  });
}

function inspectComply(workspace: string, agentId: string): UnifiedSurfaceModuleResult {
  const signature = verifyComplianceMapsSignature(workspace);
  if (!signature.valid) {
    return result({
      name: "Comply",
      status: "failed",
      score: 0,
      summary: "Compliance maps are missing or fail signature verification.",
      issues: [`compliance maps: ${signature.reason ?? "invalid"}`],
      upgradePath: "Run `amc compliance init`, verify the signed maps, then capture qualifying evidence.",
      evidenceRefs: [signature.path, signature.sigPath],
    });
  }

  const frameworks: ComplianceFramework[] = ["SOC2", "NIST_AI_RMF", "ISO_42001"];
  const reports = [];
  const issues: string[] = [];
  for (const framework of frameworks) {
    try {
      reports.push(generateComplianceReport({ workspace, agentId, window: "30d", framework }));
    } catch (error) {
      issues.push(`${framework}: ${String(error)}`);
    }
  }
  if (reports.length === 0) {
    return result({
      name: "Comply",
      status: "failed",
      score: 0,
      summary: "No evidence-backed compliance report could be generated.",
      issues,
      upgradePath: "Run `amc compliance report --framework SOC2 --window 30d` and repair the reported error.",
      evidenceRefs: [signature.path, signature.sigPath],
    });
  }
  const averageCoverage = reports.reduce((sum, report) => sum + report.coverage.score, 0) / reports.length;
  const satisfied = reports.reduce((sum, report) => sum + report.coverage.satisfied, 0);
  const partial = reports.reduce((sum, report) => sum + report.coverage.partial, 0);
  const score = averageCoverage * 100;
  return result({
    name: "Comply",
    status: satisfied + partial > 0 ? "success" : "skipped",
    score,
    summary: `${reports.length}/${frameworks.length} signed-framework reports generated; average evidence coverage ${(averageCoverage * 100).toFixed(1)}% (${satisfied} satisfied, ${partial} partial).`,
    issues: [
      ...issues,
      ...(satisfied + partial === 0 ? ["framework mappings exist, but current evidence satisfies no mapped control"] : []),
    ],
    upgradePath: "Use `amc comply report --framework <framework>` and collect the report's needed evidence; AMC does not infer legal compliance.",
    evidenceRefs: [signature.path, signature.sigPath, ...reports.map((report) => report.reportId)],
  });
}

function inspectFleet(workspace: string): UnifiedSurfaceModuleResult {
  const signature = verifyFleetConfigSignature(workspace);
  if (!signature.valid) {
    return result({
      name: "Fleet",
      status: "failed",
      score: 0,
      summary: "Fleet registry is missing or fails signature verification.",
      issues: [`fleet config: ${signature.reason ?? "invalid"}`],
      upgradePath: "Run `amc fleet init`, repair unsigned agent configs, then rerun the fleet lifecycle.",
      evidenceRefs: [signature.path, signature.sigPath],
    });
  }

  const agents = listAgents(workspace);
  const signedAgents = agents.filter((agent) => agent.hasConfig && agent.configSigned);
  let lifecycleRuns: ReturnType<typeof listFleetLifecycleRunArtifacts> = [];
  const issues: string[] = [];
  try {
    lifecycleRuns = listFleetLifecycleRunArtifacts({ workspace, limit: 20 });
  } catch (error) {
    issues.push(`fleet lifecycle artifacts: ${String(error)}`);
  }
  const score = 30
    + (agents.length > 0 && signedAgents.length === agents.length ? 20 : 0)
    + (agents.length >= 2 ? 20 : 0)
    + (lifecycleRuns.length > 0 ? 30 : 0);
  if (agents.length < 2) issues.push("fleet governance requires at least two registered agents; single-agent config is readiness only");
  if (signedAgents.length !== agents.length) issues.push(`${agents.length - signedAgents.length} agent config(s) are missing or unsigned`);
  if (lifecycleRuns.length === 0) issues.push("no fleet lifecycle run artifact exists");
  return result({
    name: "Fleet",
    status: agents.length >= 2 && signedAgents.length === agents.length ? "success" : "skipped",
    score,
    summary: `${signedAgents.length}/${agents.length} agent config(s) signed; ${lifecycleRuns.length} fleet lifecycle artifact(s).`,
    issues,
    upgradePath: "Add a second real agent with `amc agent add`, then run the fleet lifecycle and verify its child evidence.",
    evidenceRefs: [signature.path, signature.sigPath, ...agents.map((agent) => agent.id), ...lifecycleRuns.map((run) => run.fleetLifecycleRunId)],
  });
}

function inspectPassport(workspace: string, agentId: string): UnifiedSurfaceModuleResult {
  const policy = verifyPassportPolicySignature(workspace);
  const exports = listPassportExportFiles(workspace);
  const verifications = exports.map((file) => {
    try {
      return { file, verification: verifyPassportArtifactFile({ file, workspace }) };
    } catch (error) {
      return {
        file,
        verification: {
          ok: false,
          passport: null,
          fileSha256: "",
          errors: [{ code: "VERIFY_FAILED", message: String(error) }],
        },
      };
    }
  });
  const invalidExports = verifications.filter((item) => !item.verification.ok);
  const cache = loadPassportCache({ workspace, scopeType: "AGENT", scopeId: agentId });
  const cacheSignature = verifyPassportCacheSignature({ workspace, scopeType: "AGENT", scopeId: agentId });
  const policyConfigured = pathExists(policy.path) || policy.signatureExists;
  const policyInvalid = policyConfigured && !policy.valid;
  const validExports = verifications.length - invalidExports.length;
  const exportScore = exports.length > 0 ? (validExports / exports.length) * 70 : 0;
  const score = (policy.valid ? 20 : 0) + exportScore + (cache && cacheSignature.valid ? 10 : 0);
  const issues = [
    ...(policyInvalid ? [`passport policy: ${policy.reason ?? "invalid"}`] : []),
    ...(!policyConfigured ? ["passport policy has not been initialized"] : []),
    ...invalidExports.flatMap((item) => item.verification.errors.map((error) => `${item.file}: ${error.message}`)),
    ...(exports.length === 0 ? ["no portable .amcpass export exists"] : []),
  ];
  return result({
    name: "Passport",
    status: policyInvalid || invalidExports.length > 0 ? "failed" : validExports > 0 ? "success" : "skipped",
    score,
    summary: `${validExports}/${exports.length} portable passport export(s) verified${cache ? "; signed agent cache present" : ""}.`,
    issues,
    upgradePath: "Run `amc passport export --scope agent --id <agent>` and verify the resulting .amcpass artifact before sharing it.",
    evidenceRefs: [policy.path, policy.sigPath, ...exports, ...(cache ? [cache.passportId] : [])],
  });
}

export async function inspectUnifiedConfiguredSurfaces(input: {
  workspace: string;
  agentId: string;
}): Promise<UnifiedSurfaceModuleResult[]> {
  return [
    inspectEnforce(input.workspace, input.agentId),
    await inspectVault(input.workspace),
    inspectWatch(input.workspace, input.agentId),
    inspectComply(input.workspace, input.agentId),
    inspectFleet(input.workspace),
    inspectPassport(input.workspace, input.agentId),
  ];
}
