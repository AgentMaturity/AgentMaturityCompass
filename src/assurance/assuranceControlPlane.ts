import { randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createApprovalForIntent, consumeApprovedExecution, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { listApprovalDecisions } from "../approvals/approvalChainStore.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { defaultAssurancePolicy, assurancePolicySchema } from "./assurancePolicySchema.js";
import {
  activeAssuranceWaiver,
  assurancePolicyPath,
  assuranceWaiversDir,
  initAssurancePolicy,
  latestAssuranceWaiver,
  listAssuranceWaivers,
  loadAssurancePolicy,
  saveAssurancePolicy,
  saveAssuranceWaiver,
  verifyAssurancePolicySignature
} from "./assurancePolicyStore.js";
import { issueAssuranceCertificate, inspectAssuranceCertificate } from "./assuranceCertificates.js";
import { latestAssuranceCertificateSummary } from "./assuranceStore.js";
import {
  assuranceSchedulerRunNow,
  assuranceSchedulerSetEnabled,
  assuranceSchedulerStatus
} from "./assuranceScheduler.js";
import { assuranceWaiverSchema } from "./assuranceSchema.js";
import { loadAssuranceReport, latestAssuranceReports, listAssuranceHistory, runAssurance } from "./assuranceRunner.js";
import { listAssurancePacks } from "./packs/index.js";

const pendingWaiverSchema = z.object({
  v: z.literal(1),
  requestId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  reason: z.string().min(1),
  hours: z.number().int().min(1).max(72),
  policySha256: z.string().length(64),
  lastCertSha256: z.string().length(64),
  createdTs: z.number().int()
});

function pendingWaiversDir(workspace: string): string {
  return join(assuranceWaiversDir(workspace), "pending");
}

function pendingWaiverPath(workspace: string, approvalRequestId: string): string {
  return join(pendingWaiversDir(workspace), `${approvalRequestId}.json`);
}

function savePendingWaiver(workspace: string, pending: z.infer<typeof pendingWaiverSchema>): string {
  ensureDir(pendingWaiversDir(workspace));
  const path = pendingWaiverPath(workspace, pending.approvalRequestId);
  writeFileAtomic(path, JSON.stringify(pendingWaiverSchema.parse(pending), null, 2), 0o600);
  return path;
}

function loadPendingWaiver(workspace: string, approvalRequestId: string): z.infer<typeof pendingWaiverSchema> {
  const path = pendingWaiverPath(workspace, approvalRequestId);
  if (!pathExists(path)) {
    throw new Error(`pending waiver not found: ${approvalRequestId}`);
  }
  return pendingWaiverSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

function removePendingWaiver(workspace: string, approvalRequestId: string): void {
  const path = pendingWaiverPath(workspace, approvalRequestId);
  if (pathExists(path)) {
    rmSync(path, { force: true });
  }
}

function listPendingWaivers(workspace: string): z.infer<typeof pendingWaiverSchema>[] {
  const dir = pendingWaiversDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a))
    .map((name) => pendingWaiverSchema.parse(JSON.parse(readUtf8(join(dir, name))) as unknown));
}

function activateApprovedWaiver(workspace: string, pending: z.infer<typeof pendingWaiverSchema>, nowTs = Date.now()): AssuranceWaiver | null {
  const approval = verifyApprovalForExecution({
    workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    expectedIntentId: pending.intentId,
    expectedToolName: "assurance.waiver",
    expectedActionClass: "SECURITY"
  });
  if (!approval.ok) {
    return null;
  }

  const decisions = listApprovalDecisions({
    workspace,
    agentId: pending.agentId,
    approvalRequestId: pending.approvalRequestId
  }).filter((row) => row.decision === "APPROVE_EXECUTE" || row.decision === "APPROVE_SIMULATE");

  const ownerDecision = decisions.find((row) => row.roles.includes("OWNER"));
  const auditorDecision = decisions.find((row) => row.roles.includes("AUDITOR"));
  if (!ownerDecision || !auditorDecision) {
    return null;
  }

  const waiver = assuranceWaiverSchema.parse({
    v: 1,
    waiverId: `wvr_${randomUUID().replace(/-/g, "")}`,
    createdTs: nowTs,
    expiresTs: nowTs + pending.hours * 60 * 60 * 1000,
    reason: pending.reason,
    scope: {
      type: "WORKSPACE",
      id: "workspace"
    },
    allowReadyDespiteAssuranceFail: true,
    approvedBy: [
      {
        userIdHash: sha256Hex(ownerDecision.userId).slice(0, 16),
        role: "OWNER",
        approvalEventHash: sha256Hex(ownerDecision.approvalDecisionId)
      },
      {
        userIdHash: sha256Hex(auditorDecision.userId).slice(0, 16),
        role: "AUDITOR",
        approvalEventHash: sha256Hex(auditorDecision.approvalDecisionId)
      }
    ],
    bindings: {
      lastCertSha256: pending.lastCertSha256,
      policySha256: pending.policySha256
    }
  });

  saveAssuranceWaiver(workspace, waiver);
  consumeApprovedExecution({
    workspace,
    approvalId: pending.approvalRequestId,
    expectedAgentId: pending.agentId,
    executionId: pending.requestId
  });
  removePendingWaiver(workspace, pending.approvalRequestId);
  appendTransparencyEntry({
    workspace,
    type: "ASSURANCE_WAIVER_ACTIVE",
    agentId: "workspace",
    artifact: {
      kind: "approval",
      sha256: sha256Hex(Buffer.from(JSON.stringify(waiver), "utf8")),
      id: waiver.waiverId
    }
  });
  return waiver;
}

function maybeActivatePendingWaivers(workspace: string): AssuranceWaiver[] {
  const activated: AssuranceWaiver[] = [];
  for (const pending of listPendingWaivers(workspace)) {
    const waiver = activateApprovedWaiver(workspace, pending);
    if (waiver) {
      activated.push(waiver);
    }
  }
  return activated;
}

export function assuranceInitForApi(workspace: string) {
  return initAssurancePolicy(workspace);
}

export function assurancePolicyForApi(workspace: string) {
  return {
    policy: loadAssurancePolicy(workspace),
    signature: verifyAssurancePolicySignature(workspace)
  };
}

export function assurancePolicyApplyForApi(params: {
  workspace: string;
  policy: unknown;
}) {
  const parsed = assurancePolicySchema.parse(params.policy);
  const saved = saveAssurancePolicy(params.workspace, parsed);
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ASSURANCE_POLICY_APPLIED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(JSON.stringify(parsed), "utf8")),
      id: "assurance-policy"
    }
  });
  return saved;
}

function runScopeId(scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId?: string): string {
  if (scopeType === "WORKSPACE") {
    return "workspace";
  }
  return scopeId ?? "default";
}

function runStatusFromReport(report: {
  status: "VALID" | "INVALID" | "UNSIGNED";
  overallScore0to100: number;
}, minRiskAssuranceScore: number): "PASS" | "FAIL" | "ERROR" {
  if (report.status !== "VALID") {
    return "ERROR";
  }
  return report.overallScore0to100 >= minRiskAssuranceScore ? "PASS" : "FAIL";
}

function findingCountsFromReport(report: { packResults: Array<{ scenarioResults: Array<{ pass: boolean }> }> }) {
  const failedCount = report.packResults.reduce(
    (sum, pack) => sum + pack.scenarioResults.filter((scenario) => !scenario.pass).length,
    0
  );
  return {
    critical: 0,
    high: failedCount,
    medium: 0,
    low: 0,
    info: 0
  };
}

function legacyProjectionForReport(params: {
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
  minRiskAssuranceScore: number;
}, report: Awaited<ReturnType<typeof runAssurance>>) {
  const status = runStatusFromReport(report, params.minRiskAssuranceScore);
  const findingCounts = findingCountsFromReport(report);
  return {
    runId: report.assuranceRunId,
    generatedTs: report.ts,
    scope: {
      type: params.scopeType,
      id: runScopeId(params.scopeType, params.scopeId)
    },
    score: {
      status,
      pass: status === "PASS",
      riskAssuranceScore: report.overallScore0to100,
      findingCounts
    },
    selectedPacks: report.packResults.map((pack) => pack.packId),
    evidenceGates: {
      integrityIndex: report.integrityIndex,
      correlationRatio: 1,
      observedShare: 1
    }
  };
}

function findingsProjectionForReport(report: Awaited<ReturnType<typeof runAssurance>>) {
  return {
    v: 1,
    runId: report.assuranceRunId,
    generatedTs: report.ts,
    findings: report.packResults.flatMap((pack) =>
      pack.scenarioResults
        .filter((scenario) => !scenario.pass)
        .map((scenario) => ({
          findingId: `${pack.packId}:${scenario.scenarioId}`,
          scenarioId: scenario.scenarioId,
          category: scenario.category,
          severity: "HIGH",
          descriptionTemplateId: `${pack.packId.toUpperCase()}_${scenario.scenarioId}`,
          evidenceRefs: {
            runId: report.assuranceRunId,
            eventHashes: scenario.evidenceEventIds.slice(0, 8),
            receiptIds: scenario.correlatedRequestIds.slice(0, 8)
          },
          remediationHints: scenario.reasons
        }))
    )
  };
}

function traceProjectionForReport(report: Awaited<ReturnType<typeof runAssurance>>) {
  return {
    v: 1,
    runId: report.assuranceRunId,
    generatedTs: report.ts,
    refs: report.packResults.flatMap((pack) =>
      pack.scenarioResults.map((scenario) => ({
        scenarioId: scenario.scenarioId,
        requestId: scenario.correlatedRequestIds[0] ?? `${pack.packId}:${scenario.scenarioId}`,
        runId: report.assuranceRunId,
        evidenceEventIds: scenario.evidenceEventIds.slice(0, 8)
      }))
    )
  };
}

function resolvePackId(pack: string): "all" | string {
  if (pack === "all") {
    return "all";
  }
  const available = new Set(listAssurancePacks().map((row) => row.id));
  if (!available.has(pack)) {
    throw new Error(`unknown assurance pack: ${pack}`);
  }
  return pack;
}

export async function assuranceRunForApi(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
  pack?: "all" | string;
  windowDays?: number;
}) {
  const policy = loadAssurancePolicy(params.workspace);
  const selected = resolvePackId(params.pack ?? "all");
  const report = await runAssurance({
    workspace: params.workspace,
    agentId: params.scopeType === "AGENT" ? params.scopeId : undefined,
    packId: selected === "all" ? undefined : selected,
    runAll: selected === "all",
    mode: "sandbox",
    window: `${Math.max(1, Math.trunc(params.windowDays ?? 30))}d`
  });
  return {
    run: legacyProjectionForReport({
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      minRiskAssuranceScore: policy.assurancePolicy.thresholds.minRiskAssuranceScore
    }, report),
    report,
    findings: findingsProjectionForReport(report),
    traceRefs: traceProjectionForReport(report),
    saved: null,
    transparency: null
  };
}

export function assuranceRunsForApi(workspace: string) {
  const policy = loadAssurancePolicy(workspace);
  const runs: Array<{
    runId: string;
    generatedTs: number;
    scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string };
    status: "PASS" | "FAIL" | "ERROR";
    pass: boolean;
    score: number;
    findingCounts: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    };
  }> = [];
  for (const row of listAssuranceHistory({ workspace })) {
    try {
      const report = loadAssuranceReport({
        workspace,
        assuranceRunId: row.assuranceRunId
      });
      const run = legacyProjectionForReport({
        scopeType: "AGENT",
        scopeId: report.agentId,
        minRiskAssuranceScore: policy.assurancePolicy.thresholds.minRiskAssuranceScore
      }, report);
      runs.push({
        runId: run.runId,
        generatedTs: run.generatedTs,
        scope: run.scope,
        status: run.score.status,
        pass: run.score.pass,
        score: run.score.riskAssuranceScore,
        findingCounts: run.score.findingCounts
      });
    } catch {
      // Keep listing resilient when a report file was pruned or corrupted.
    }
  }
  return runs;
}

export function assuranceRunDetailForApi(params: {
  workspace: string;
  runId: string;
}) {
  try {
    const policy = loadAssurancePolicy(params.workspace);
    const report = loadAssuranceReport({
      workspace: params.workspace,
      assuranceRunId: params.runId
    });
    return {
      run: legacyProjectionForReport({
        scopeType: "AGENT",
        scopeId: report.agentId,
        minRiskAssuranceScore: policy.assurancePolicy.thresholds.minRiskAssuranceScore
      }, report),
      report,
      findings: findingsProjectionForReport(report),
      traceRefs: traceProjectionForReport(report)
    };
  } catch {
    return {
      run: null,
      report: null,
      findings: null,
      traceRefs: null
    };
  }
}

export async function assuranceCertIssueForApi(params: {
  workspace: string;
  runId: string;
  outFile?: string;
}) {
  return issueAssuranceCertificate(params);
}

export function assuranceCertLatestForApi(workspace: string) {
  const latest = latestAssuranceCertificateSummary(workspace);
  return {
    latest,
    waiver: activeAssuranceWaiver(workspace)
  };
}

export function assuranceCertVerifyForApi(params: {
  file: string;
}) {
  return inspectAssuranceCertificate(params.file);
}

export function assuranceReadinessGate(workspace: string): {
  ok: boolean;
  reasons: string[];
  warnings: string[];
  latestRunId: string | null;
  latestStatus: "PASS" | "FAIL" | "ERROR" | null;
  waiver: AssuranceWaiver | null;
} {
  maybeActivatePendingWaivers(workspace);
  const reasons: string[] = [];
  const warnings: string[] = [];

  const sig = verifyAssurancePolicySignature(workspace);
  if (!sig.valid) {
    return {
      ok: false,
      reasons: [`ASSURANCE_POLICY_UNTRUSTED:${sig.reason ?? "unknown"}`],
      warnings,
      latestRunId: null,
      latestStatus: null,
      waiver: null
    };
  }

  const policy = loadAssurancePolicy(workspace);
  const latest = latestAssuranceReports({
    workspace,
    windowStartTs: 0,
    windowEndTs: Date.now()
  })[0] ?? null;
  const waiver = activeAssuranceWaiver(workspace);
  const latestStatus = latest
    ? runStatusFromReport(latest, policy.assurancePolicy.thresholds.minRiskAssuranceScore)
    : null;

  if (policy.assurancePolicy.thresholds.failClosedIfBelowThresholds) {
    const blocked = latest !== null && (
      latest.status !== "VALID"
      || latest.integrityIndex < policy.assurancePolicy.gates.minIntegrityIndex
      || latest.overallScore0to100 < policy.assurancePolicy.thresholds.minRiskAssuranceScore
    );
    if (blocked && !waiver) {
      reasons.push("ASSURANCE_THRESHOLD_BREACH");
    }
    if (blocked && waiver) {
      warnings.push(`ASSURANCE_WAIVER_ACTIVE:${waiver.waiverId}`);
    }
    if (!latest) {
      warnings.push("ASSURANCE_BASELINE_MISSING");
    }
  }

  const latestCert = latestAssuranceCertificateSummary(workspace);
  if (latestCert && !latestCert.verify.ok) {
    reasons.push("ASSURANCE_CERT_INVALID");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
    latestRunId: latest?.assuranceRunId ?? null,
    latestStatus,
    waiver
  };
}

export function assuranceWaiverRequestForApi(params: {
  workspace: string;
  agentId: string;
  reason: string;
  hours: number;
}) {
  const policySig = verifyAssurancePolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`assurance policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const hours = Math.max(1, Math.min(72, Math.trunc(params.hours)));
  const requestId = `wvrreq_${randomUUID().replace(/-/g, "")}`;
  const intentId = `assurance-waiver-${requestId}`;
  const policySha = sha256Hex(Buffer.from(readUtf8(assurancePolicyPath(params.workspace)), "utf8"));
  const latestCert = latestAssuranceCertificateSummary(params.workspace);
  const lastCertSha256 = latestCert?.sha256 ?? "0".repeat(64);

  const approval = createApprovalForIntent({
    workspace: params.workspace,
    agentId: params.agentId,
    intentId,
    toolName: "assurance.waiver",
    actionClass: "SECURITY",
    requestedMode: "EXECUTE",
    effectiveMode: "EXECUTE",
    riskTier: "high",
    intentPayload: {
      requestId,
      hours,
      reason: params.reason,
      policySha256: policySha,
      lastCertSha256
    },
    leaseConstraints: {
      scopes: [],
      routeAllowlist: [],
      modelAllowlist: []
    }
  });

  savePendingWaiver(
    params.workspace,
    pendingWaiverSchema.parse({
      v: 1,
      requestId,
      approvalRequestId: approval.approval.approvalRequestId,
      intentId,
      agentId: params.agentId,
      reason: params.reason,
      hours,
      policySha256: policySha,
      lastCertSha256,
      createdTs: Date.now()
    })
  );

  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ASSURANCE_WAIVER_REQUESTED",
    agentId: params.agentId,
    artifact: {
      kind: "approval",
      sha256: sha256Hex(Buffer.from(`${requestId}:${hours}`, "utf8")),
      id: requestId
    }
  });

  return {
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId,
    hours
  };
}

export function assuranceWaiverStatusForApi(workspace: string) {
  const activated = maybeActivatePendingWaivers(workspace);
  const active = activeAssuranceWaiver(workspace);
  return {
    active,
    latest: latestAssuranceWaiver(workspace),
    waivers: listAssuranceWaivers(workspace),
    pending: listPendingWaivers(workspace),
    activated
  };
}

export function assuranceWaiverRevokeForApi(params: {
  workspace: string;
  waiverId?: string;
}) {
  const waivers = listAssuranceWaivers(params.workspace);
  const waiver = params.waiverId
    ? waivers.find((row) => row.waiverId === params.waiverId) ?? null
    : activeAssuranceWaiver(params.workspace);
  if (!waiver) {
    return {
      revoked: false,
      reason: "waiver not found"
    };
  }
  const path = join(assuranceWaiversDir(params.workspace), `waiver_${waiver.createdTs}.json`);
  if (pathExists(path)) {
    rmSync(path, { force: true });
  }
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "ASSURANCE_WAIVER_REVOKED",
    agentId: "workspace",
    artifact: {
      kind: "approval",
      sha256: sha256Hex(Buffer.from(waiver.waiverId, "utf8")),
      id: waiver.waiverId
    }
  });
  return {
    revoked: true,
    waiverId: waiver.waiverId
  };
}

export function assuranceSchedulerStatusForApi(workspace: string) {
  return assuranceSchedulerStatus(workspace);
}

export async function assuranceSchedulerRunNowForApi(params: {
  workspace: string;
}) {
  return assuranceSchedulerRunNow({
    workspace: params.workspace,
    scopeType: "WORKSPACE",
    selectedPack: "all"
  });
}

export function assuranceSchedulerEnableForApi(params: {
  workspace: string;
  enabled: boolean;
}) {
  return assuranceSchedulerSetEnabled(params);
}

export function assuranceDefaultPolicyForApi() {
  return defaultAssurancePolicy();
}

type AssuranceWaiver = z.infer<typeof assuranceWaiverSchema>;
