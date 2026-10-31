import { captureRunHashAuthority, type RunHashPublicationOptions } from "../ledger/runHashSignature.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createApprovalForIntent } from "../approvals/approvalEngine.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { defaultAssurancePolicy, assurancePolicySchema } from "./assurancePolicySchema.js";
import {
  activeAssuranceWaiver,
  assurancePolicyPath,
  initAssurancePolicy, initAssurancePolicyAsync, captureAssurancePolicy, captureAssurancePolicyInitialization, prepareAssurancePolicyAsync,
  latestAssuranceWaiver,
  listAssuranceWaivers,
  loadAssurancePolicy,
  saveAssurancePolicy,
  verifyAssurancePolicySignature
} from "./assurancePolicyStore.js";
import { issueAssuranceCertificate } from "./assuranceCertificates.js";
import { verifyAssuranceCertificateFile } from "./assuranceVerifier.js";
import type { TrustContext } from "../trust/trustContext.js";
import { inspectLatestAssuranceCertificate } from "./assuranceStore.js";
import {
  assuranceSchedulerRunNow,
  assuranceSchedulerSetEnabled, assuranceSchedulerSetEnabledAsync,
  assuranceSchedulerStatus
} from "./assuranceScheduler.js";
import { assuranceWaiverSchema } from "./assuranceSchema.js";
import { loadAssuranceReport, latestAssuranceReports, listAssuranceHistory, runAssurance } from "./assuranceRunner.js";
import { listAssurancePacks } from "./packs/index.js";
import { assuranceRunRecord, severityForScore } from "./assuranceArtifactPersistence.js";
import { captureOrgPairs, captureOrgFiles, assertOrgPairsCurrent, captureOrgPairsAuthority, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { getAuthenticatedKeyHistory } from "../crypto/keys.js";
import { canonicalize } from "../utils/json.js";
import { join } from "node:path";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { captureTransparencyAppendPublication } from "../transparency/workspacePublication.js";
import { pendingWaiverSchema, savePendingWaiver, listPendingWaivers, maybeActivatePendingWaivers, maybeActivatePendingWaiversAsync, revokeAssuranceWaiver, revokeAssuranceWaiverAsync } from "./assuranceWaiverPublication.js";


export function assuranceInitForApi(workspace: string) {
  return initAssurancePolicy(workspace);
}

export function assurancePolicyForApi(workspace: string) {
  return {
    policy: loadAssurancePolicy(workspace),
    signature: assurancePolicyPointSignature(workspace)
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

/** Studio/API view of a report, from the runner's own run record (WP37): no fabricated evidence gates or severities. */
function legacyProjectionForReport(params: {
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
  minRiskAssuranceScore: number;
}, report: Awaited<ReturnType<typeof runAssurance>>) {
  const record = assuranceRunRecord(report);
  const status: "PASS" | "FAIL" | "ERROR" | "INSUFFICIENT_EVIDENCE" = report.status !== "VALID" ? "ERROR"
    : record.score.status === "INSUFFICIENT_EVIDENCE" ? "INSUFFICIENT_EVIDENCE"
      : runStatusFromReport(report, params.minRiskAssuranceScore);
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
      findingCounts: record.score.findingCounts
    },
    selectedPacks: report.packResults.map((pack) => pack.packId),
    evidenceGates: record.evidenceGates
  };
}

function findingsProjectionForReport(report: Awaited<ReturnType<typeof runAssurance>>) {
  return {
    v: 1,
    runId: report.assuranceRunId,
    generatedTs: report.ts,
    findings: report.packResults.flatMap((pack) =>
      pack.scenarioResults
        // Same rule as the runner's record: an inconclusive row is not a finding, and severity follows its score.
        .filter((scenario) => !scenario.pass && !scenario.inconclusive)
        .map((scenario) => ({
          findingId: `${pack.packId}:${scenario.scenarioId}`,
          scenarioId: scenario.scenarioId,
          category: scenario.category,
          severity: severityForScore(scenario.score0to100),
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
}, options: RunHashPublicationOptions = {}) {
  params = { ...params }; options = { ...options }; const actor = options.beforePublish; actor?.();
  const fixed = captureRunHashAuthority(params.workspace, Boolean(options.synchronousSeal || process.env.AMC_NO_SIGN === "1"));
  const baseCurrent = () => { actor?.(); fixed(); }, initialization = captureAssurancePolicyInitialization(params.workspace, { beforePublish: baseCurrent });
  let selectedPolicy = captureAssurancePolicy(params.workspace);
  if (selectedPolicy.parsePolicy() === null) { await initialization.initialize(); selectedPolicy = captureAssurancePolicy(params.workspace); }
  const beforePublish = () => { baseCurrent(); initialization.assertCurrent(); assertOrgPairsCurrent(selectedPolicy.snapshot); };
  beforePublish(); const policy = selectedPolicy.parsePolicy()!;
  const selected = resolvePackId(params.pack ?? "all");
  const report = await runAssurance({
    workspace: params.workspace,
    agentId: params.scopeType === "AGENT" ? params.scopeId : undefined,
    packId: selected === "all" ? undefined : selected,
    runAll: selected === "all",
    mode: "sandbox",
    window: `${Math.max(1, Math.trunc(params.windowDays ?? 30))}d`
  }, { ...options, beforePublish });
  beforePublish();
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
    status: "PASS" | "FAIL" | "ERROR" | "INSUFFICIENT_EVIDENCE";
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
}, options: { beforePublish?: () => void } = {}) {
  return issueAssuranceCertificate(params, options);
}

export function assuranceCertLatestForApi(workspace: string) {
  const latest = inspectLatestAssuranceCertificate(workspace);
  return {
    latest,
    waiver: activeAssuranceWaiver(workspace)
  };
}

/** A verdict, not an inspection: the issuer and signed root need keys the server operator's trust context admits (P0-09). */
export function assuranceCertVerifyForApi(params: {
  file: string;
  trust: TrustContext;
}) {
  return verifyAssuranceCertificateFile({ file: params.file, trust: params.trust });
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

  const acquired = acquireAssurancePolicyAdmission(workspace), sig = acquired.legacy;
  if (acquired.admission === null) {
    if (acquired.failure !== null && sig.valid) throw acquired.failure.cause;
    return {
      ok: false,
      reasons: [`ASSURANCE_POLICY_UNTRUSTED:${sig.reason ?? "unknown"}`],
      warnings,
      latestRunId: null,
      latestStatus: null,
      waiver: null
    };
  }

  const policy = acquired.admission.selected.parsePolicy();
  if (policy === null) throw new Error("captured assurance policy is missing");
  const gate = readinessProjection(workspace, policy, reasons, warnings);
  acquired.admission.assertCurrent(); // Final intrinsic: no external actor follows this gate.
  return gate;
}

type AssuranceReadiness = ReturnType<typeof assuranceReadinessGate>;

function readinessProjection(workspace: string, policy: ReturnType<typeof loadAssurancePolicy>, reasons: string[] = [], warnings: string[] = []): AssuranceReadiness {
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

  const latestCert = inspectLatestAssuranceCertificate(workspace);
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

function refusedReadiness(reason: string): AssuranceReadiness {
  return { ok: false, reasons: [reason], warnings: [], latestRunId: null, latestStatus: null, waiver: null };
}

/** One actual legacy observation and one fixed same-byte admission; parsing belongs to the consumer. */
function acquireAssurancePolicyAdmission(workspace: string) {
  const legacy = verifyAssurancePolicySignature(workspace);
  if (!legacy.valid && legacy.reason !== "signature verify failed") return { legacy, admission: null, failure: null };
  const roleException = !legacy.valid;
  try {
    const captured = captureAssurancePolicy(workspace);
    if (!captured.signature.valid) throw new Error(`assurance policy signature invalid: ${captured.signature.reason ?? "unknown"}`);
    const body = orgPairBytes(captured.snapshot, captured.path);
    const sidecar = orgPairBytes(captured.snapshot, `${captured.path}.sig`);
    if (body === null || sidecar === null) throw new Error("captured assurance policy pair is incomplete");
    const historyPath = join(workspace, ".amc", "keys", "auditor_history.json");
    const history = roleException ? captureOrgFiles([historyPath]) : null;
    const historyBytes = history === null ? null : orgPairBytes(history, historyPath);
    const historyValue = historyBytes === null ? null : canonicalize(JSON.parse(historyBytes.toString("utf8")) as unknown);
    const historyCurrent = () => {
      if (history === null) return;
      assertOrgPairsCurrent(history);
      if (historyBytes !== null) {
        const admitted = getAuthenticatedKeyHistory(workspace, "auditor");
        if (admitted === null || canonicalize(admitted) !== historyValue)
          throw new Error("assurance readiness auditor history returned no matching authenticated envelope");
      }
      // True absence remains absent; a later appearance or replacement is not a fresh original.
      assertOrgPairsCurrent(history);
    };
    const assertCurrent = () => {
      assertOrgPairsCurrent(captured.snapshot);
      historyCurrent();
      const admission = verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar);
      if (!admission.valid) throw new Error(`assurance policy signature invalid: ${admission.reason ?? "unknown"}`);
      assertOrgPairsCurrent(captured.snapshot);
      if (history !== null) assertOrgPairsCurrent(history);
    };
    assertCurrent();
    return { legacy, admission: { selected: captured, assertCurrent }, failure: null };
  } catch (cause) {
    // Retain the actual observation even for legacy-valid strict failure; never reconstruct it with a second read.
    return { legacy, admission: null, failure: { cause } };
  }
}

/** A point verdict only; no parsing, initialization, exported capsule or retained presentation-object proof. */
function assurancePolicyPointSignature(workspace: string) {
  const acquired = acquireAssurancePolicyAdmission(workspace);
  if (acquired.admission !== null) return { ...acquired.legacy, valid: true, reason: null };
  if (acquired.failure !== null && acquired.legacy.valid)
    return { ...acquired.legacy, valid: false, reason: String(acquired.failure.cause) };
  return acquired.legacy;
}

/** One actual waiver batch; policy baseline starts at the old post-activation read stage. */
export async function prepareAssuranceReadinessAsync(workspace: string, beforePublish: () => void) {
  let batch: Awaited<ReturnType<typeof maybeActivatePendingWaiversAsync>> | null = null;
  let policy: ReturnType<typeof loadAssurancePolicy> | null = null;
  let untrustedReason: string | null = null, failure: { cause: unknown; reason: string } | null = null;
  const failed = (cause: unknown) => ({ cause, reason: `ASSURANCE_READY_CHECK_FAILED:${String(cause)}` });
  let assertPolicyCurrent: (() => void) | null = null;
  const caller = beforePublish;
  const actor = () => {
    assertPolicyCurrent?.();
    caller();
    assertPolicyCurrent?.();
  };
  try {
    // The intrinsic remains null through the actual activation; the old policy baseline starts afterward.
    batch = await maybeActivatePendingWaiversAsync(workspace, { beforePublish: actor });
    const acquired = acquireAssurancePolicyAdmission(workspace), legacy = acquired.legacy;
    const legacyReason = `ASSURANCE_POLICY_UNTRUSTED:${legacy.reason ?? "unknown"}`;
    if (acquired.failure !== null) {
      if (legacy.valid) throw acquired.failure.cause;
      // Failed exception admission keeps the actual original role-refusal classification and exposed cause.
      failure = { cause: acquired.failure.cause, reason: legacyReason };
    } else if (acquired.admission === null) untrustedReason = legacyReason;
    else {
      // Parsing follows genuine conjunction admission; its real YAML/schema failures keep the ordinary failed reason.
      policy = acquired.admission.selected.parsePolicy();
      if (policy === null) throw new Error("captured assurance policy is missing");
      const intrinsic = acquired.admission.assertCurrent;
      assertPolicyCurrent = () => {
        if (failure !== null) throw failure.cause;
        try { intrinsic(); }
        catch (cause) {
          failure = failed(cause);
          throw cause;
        }
      };
    }
  } catch (cause) { if (failure === null) failure = failed(cause); }
  return Object.freeze({ current(): AssuranceReadiness {
    // Failures remain private and sticky; every returned ordinary result has fresh arrays and objects.
    if (failure !== null) return refusedReadiness(failure.reason);
    if (untrustedReason !== null) return refusedReadiness(untrustedReason);
    try {
      actor();
      const gate = readinessProjection(workspace, policy!);
      batch!.assertCurrent(); // Its own pairs and latest genuine log, never the old preparation predecessor.
      assertPolicyCurrent!(); // No external actor follows this final original-policy/history/admission fence.
      return gate;
    } catch (cause) {
      if (failure === null) failure = failed(cause);
      return refusedReadiness(failure.reason);
    }
  } });
}

export function assuranceWaiverRequestForApi(params: {
  workspace: string;
  agentId: string;
  /** Who raises the approval request (P1-78): the authenticated principal, or the CLI's self-reported OS user. */
  initiator: string;
  reason: string;
  hours: number;
}) {
  const policySig = assurancePolicyPointSignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`assurance policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const hours = Math.max(1, Math.min(72, Math.trunc(params.hours)));
  const requestId = `wvrreq_${randomUUID().replace(/-/g, "")}`;
  const intentId = `assurance-waiver-${requestId}`;
  const policySha = sha256Hex(Buffer.from(readUtf8(assurancePolicyPath(params.workspace)), "utf8"));
  const latestCert = inspectLatestAssuranceCertificate(params.workspace);
  const lastCertSha256 = latestCert?.sha256 ?? "0".repeat(64);

  const approval = createApprovalForIntent({
    workspace: params.workspace,
    initiator: params.initiator,
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

export function assuranceWaiverRevokeForApi(params: { workspace: string; waiverId?: string }) {
  return revokeAssuranceWaiver(params);
}

export function assuranceSchedulerStatusForApi(workspace: string) {
  return assuranceSchedulerStatus(workspace);
}

export async function assuranceSchedulerRunNowForApi(params: {
  workspace: string;
}, options: OrgPairsOptions = {}) {
  return assuranceSchedulerRunNow({
    workspace: params.workspace,
    scopeType: "WORKSPACE",
    selectedPack: "all"
  }, options);
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

export function assuranceInitForApiAsync(workspace: string, options: OrgPairsOptions = {}) { return initAssurancePolicyAsync(workspace, options); }
export async function assurancePolicyForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  options = { ...options }; options.beforePublish?.(); const selected = captureAssurancePolicy(workspace);
  if (selected.parsePolicy() !== null) return { policy: selected.parsePolicy()!, signature: selected.signature };
  const cold = captureAssurancePolicyInitialization(workspace, { ...options, assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(selected.snapshot); } }); await cold.initialize(); cold.assertCurrent();
  const own = captureAssurancePolicy(workspace); cold.assertCurrent(); return { policy: own.parsePolicy()!, signature: own.signature };
}
class AssurancePolicyPublicationError extends Error {
  readonly code = "ASSURANCE_POLICY_INCOMPLETE";
  constructor(readonly completedStages: readonly string[], readonly attemptedStage: string, readonly transparency: unknown, cause: unknown) {
    super("assurance policy publication did not complete; pair and transparency effects may remain", { cause }); this.name = "AssurancePolicyPublicationError";
  }
}
export async function assurancePolicyApplyForApiAsync(input: { workspace: string; policy: unknown }, options: OrgPairsOptions = {}) {
  options = { ...options }; const params = { workspace: input.workspace, policy: structuredClone(input.policy) }, actor = options.beforePublish; actor?.();
  const parsed = assurancePolicySchema.parse(params.policy), original = captureOrgPairs([assurancePolicyPath(params.workspace)]);
  const fixed = captureOrgPairsAuthority(params.workspace, actor), log = captureWorkspaceLogAuthority(params.workspace), predecessor = captureTransparencyAppendPublication(params.workspace);
  const beforePublish = () => { actor?.(); fixed(); log.assertCurrent(); };
  const completed: string[] = []; let stage = "policy-pair", transparency: unknown = null;
  try {
    const prepared = await prepareAssurancePolicyAsync(params.workspace, parsed,
      { beforePublish, assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(original); predecessor.assertCurrent(); } }, original);
    const [saved] = prepared.publish(); completed.push("policy-pair"); stage = "transparency";
    const logged = await appendTransparencyEntryAttemptAsync({ workspace: params.workspace, type: "ASSURANCE_POLICY_APPLIED", agentId: "workspace",
      artifact: { kind: "policy", sha256: sha256Hex(Buffer.from(JSON.stringify(parsed), "utf8")), id: "assurance-policy" } },
      { beforeCommit: () => { prepared.assertCurrent(); predecessor.assertCurrent(); }, beforeMember: prepared.assertCurrent });
    transparency = logged.entry; completed.push("transparency"); stage = "return"; prepared.assertCurrent(); logged.assertCurrent(); return saved!;
  } catch (cause) { throw new AssurancePolicyPublicationError(Object.freeze([...completed]), stage, transparency, cause); }
}
export async function assuranceWaiverStatusForApiAsync(workspace: string, options: OrgPairsOptions = {}) {
  const attempt = await maybeActivatePendingWaiversAsync(workspace, { ...options });
  try { attempt.assertCurrent(); return { active: activeAssuranceWaiver(workspace), latest: latestAssuranceWaiver(workspace),
    waivers: listAssuranceWaivers(workspace), pending: listPendingWaivers(workspace), activated: attempt.activated, deferredTimestampCollisions: attempt.deferredTimestampCollisions }; }
  catch (cause) { throw Object.assign(new Error("waiver activation returned but status projection failed", { cause }), { activated: attempt.activated }); }
}
export function assuranceWaiverRevokeForApiAsync(params: { workspace: string; waiverId?: string }, options: OrgPairsOptions = {}) { return revokeAssuranceWaiverAsync(params, options); }
export function assuranceSchedulerEnableForApiAsync(params: { workspace: string; enabled: boolean }, options: OrgPairsOptions = {}) { return assuranceSchedulerSetEnabledAsync(params, options); }
