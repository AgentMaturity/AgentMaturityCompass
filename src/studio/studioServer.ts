import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { URL } from "node:url";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { CLI_BRIDGE_ROLES,
  execCliCommand as cliBridgeExec,
  execCliBatch as cliBridgeBatch,
  listCliCommands as cliBridgeList,
  validateCliExec as cliBridgeValidate,
} from "./cliBridge.js";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { listAgents } from "../fleet/registry.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { onboardingRunForApi, onboardingStatusForApi } from "./onboardingApi.js";
import { runDiagnostic, generateReport, loadRunReport } from "../diagnostic/runner.js";
import { agentRunFiles } from "../diagnostic/runReportResolution.js";
import { summarizeDiagnosticEvidenceReadiness } from "../diagnostic/evidenceReadiness.js";
import { runAutoAnswer } from "../diagnostic/autoAnswer/autoAnswerEngine.js";
import { runAssurance } from "../assurance/assuranceRunner.js";
import {
  auditBinderCreateForApi,
  auditBinderExportExecuteForApi,
  auditBinderExportForApi,
  auditBinderExportRequestForApi,
  auditBinderVerifyForApi,
  auditBindersForApi,
  auditMapApplyForApi,
  auditMapShowForApi,
  auditMapVerifyForApi,
  auditPolicyApplyForApi,
  auditPolicyForApi,
  auditReadinessGate,
  auditRequestApproveForApi,
  auditRequestCreateForApi,
  auditRequestFulfillForApi,
  auditRequestListForApi,
  auditRequestRejectForApi,
  auditSchedulerEnableForApiAsync,
  auditSchedulerRunNowForApi,
  auditSchedulerStatusForApi
} from "../audit/auditApi.js";
import { verifyAuditMapActiveSignature } from "../audit/auditMapStore.js";
import { auditBindersExportsDir, verifyAuditPolicySignature } from "../audit/auditPolicyStore.js";
import { containedPath } from "../utils/pathSafety.js";
import { auditSchedulerTick } from "../audit/auditScheduler.js";
import { emitAuditSse } from "../audit/auditSse.js";
import {
  importValueCsvForApiAsync as importValueCsvForApi,
  ingestValueWebhookForApiAsync as ingestValueWebhookForApi,
  valueContractApplyForApiAsync as valueContractApplyForApi,
  valueContractForApi,
  valueContractInitForApiAsync as valueContractInitForApi,
  valuePolicyApplyForApiAsync as valuePolicyApplyForApi,
  valuePolicyForApiAsync as valuePolicyForApi,
  valueReadinessGate,
  valueReportForApi,
  valueSchedulerRunNowForApi,
  valueSchedulerSetEnabledForApiAsync as valueSchedulerSetEnabledForApi,
  valueSchedulerStatusForApi,
  valueSnapshotLatestForApi,
  verifyValueWebhookToken, assertValueWebhookTokenCurrent
} from "../value/valueApi.js";
import { loadValuePolicyReadOnly as loadValuePolicy, verifyValuePolicySignature } from "../value/valueStore.js";
import { valueSchedulerTick } from "../value/valueScheduler.js";
import { timeCheckpointTick } from "../time/checkpoint.js";
import { emitValueSse } from "../value/valueSse.js";
import {
  assuranceCertIssueForApi,
  assuranceCertLatestForApi,
  assurancePolicyApplyForApiAsync as assurancePolicyApplyForApi,
  assurancePolicyForApiAsync as assurancePolicyForApi,
  assuranceReadinessGate,
  assuranceRunDetailForApi,
  assuranceRunForApi,
  assuranceRunsForApi,
  assuranceSchedulerEnableForApiAsync as assuranceSchedulerEnableForApi,
  assuranceSchedulerRunNowForApi,
  assuranceSchedulerStatusForApi,
  assuranceWaiverRequestForApi,
  assuranceWaiverRevokeForApiAsync as assuranceWaiverRevokeForApi,
  assuranceWaiverStatusForApiAsync as assuranceWaiverStatusForApi
} from "../assurance/assuranceControlPlane.js";
import { verifyAssurancePolicySignature } from "../assurance/assurancePolicyStore.js";
import { assuranceSchedulerTick } from "../assurance/assuranceScheduler.js";
import { emitAssuranceSse } from "../assurance/assuranceSse.js";
import { listAssurancePacks } from "../assurance/packs/index.js";
import { buildDashboard } from "../dashboard/build.js";
import { exportEvidenceBundle } from "../bundles/bundle.js";
import { exportPolicyPack } from "../exports/policyExport.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import {
  AgentTokenGrantError,
  ensureAgentToken,
  readStudioState,
  updateStudioLastLease
} from "./studioState.js";
import { agentExecuteClassCheck, scopeRefusal } from "./agentTokenScopeGuard.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { vaultStatus } from "../vault/vault.js";
import { ToolHubService } from "../toolhub/toolhubServer.js";
import { normalizeActionClass } from "../tickets/execTicketCli.js";
import type { ActionClass } from "../types.js";
import { runGovernorCheck } from "../governor/governorCli.js";
import { issueLeaseForCli } from "../leases/leaseCli.js";
import { readRevokedLeaseIds, readVerifiedLeaseRevocations, revokeLease } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { extractLeaseCarrier } from "../leases/leaseCarriers.js";
import { serveConsolePath } from "../console/consoleServer.js";
import { handleStudioApiDelegation } from "./apiDelegation.js";
import { publishConsoleSnapshotAsync, consoleSnapshotErrorStatus, CONSOLE_SNAPSHOT_UNAVAILABLE } from "./consoleSnapshot.js";
import { bindStudioResultRoute, ENTITLEMENT_NOTE, studioStoredRunReport, withClaimBody } from "./studioClaimOutput.js";
import { authenticateStudioAgent } from "./agentCredentialAuth.js";
import { respondReportSigningError } from "./reportSigningError.js";
import { allowStudioCors as allowCors } from "./studioCors.js";
import { createNativeTaskService } from "./nativeTaskService.js";
import { isNativeApprovalMutationPath, isNativeStudioPath, nativeAllowedBrowserOrigins, nativeCsrfTokenForSession } from "./nativeAdmission.js";
import { admitStudioApproval } from "./studioApprovalAdmission.js";
import { openLedger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { approvalStatusPayload } from "../approvals/approvalEngine.js";
import {
  listApprovalDecisions,
  loadApprovalRequestRecord
} from "../approvals/approvalChainStore.js";
import { parseApprovalStatus } from "../approvals/approvalCli.js";
import {
  getApprovalInboxItem,
  listApprovalInbox,
  projectApprovalInboxSummary
} from "../approvals/approvalInbox.js";
import { parseApprovalActivitySearchParams, searchApprovalActivity } from "../approvals/approvalActivity.js";
import { deliverApprovalLifecycle } from "../approvals/approvalDelivery.js";
import {
  ApprovalStudioError,
  cancelApprovalInStudio,
  decideApprovalInStudio,
  observeApprovalStatusInStudio,
  studioApprovalDecisionInputSchema,
  studioApprovalDenyInputSchema
} from "../approvals/approvalStudioService.js";
import { questionBank } from "../diagnostic/questionBank.js";
import { loadTargetProfile, saveTargetProfile } from "../targets/targetProfile.js";
import { simulateTargetWhatIf } from "../simulator/targetWhatIf.js";
import { createSignedTargetProfile } from "../targets/targetProfile.js";
import { loadContextGraph } from "../context/contextGraph.js";
import { exportBenchmarkArtifact } from "../benchmarks/benchExport.js";
import { ingestBenchmarks } from "../benchmarks/benchImport.js";
import { listImportedBenchmarks } from "../benchmarks/benchStore.js";
import { benchmarkStats } from "../benchmarks/benchStats.js";
import {
  benchCompareForApiAsync as benchCompareForApi,
  benchComparisonLatestForApi,
  benchCreateForApiAsync as benchCreateForApi,
  benchExportsForApi,
  benchImportForApi,
  benchImportsForApi,
  benchPolicyApplyForApiAsync as benchPolicyApplyForApi,
  benchPolicyForApi,
  benchPublishExecuteForApiAsync as benchPublishExecuteForApi,
  benchPublishRequestForApi,
  benchRegistriesForApiAsync as benchRegistriesForApi,
  benchRegistryApplyForApiAsync as benchRegistryApplyForApi, benchRegistryAddForApiAsync,
  benchRegistryBrowseForApi
} from "../bench/benchApi.js";
import { loadBenchPolicy, verifyBenchPolicySignature } from "../bench/benchPolicyStore.js";
import { emitBenchSse } from "../bench/benchSse.js";
import { loadBudgetsConfig, captureBudgetsPublication, BudgetsPublicationError } from "../budgets/budgets.js";
import { driftCheckForStudio } from "../drift/studioDriftCheck.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import YAML from "yaml";
import {
  addUserAsync, revokeUserAsync, setUserRolesAsync, createUsersMutationGuard, publicUsersMutationRecord, respondUsersMutationError,
  authenticateUser,
  clearSessionCookie,
  createSessionAsync,
  listUsers as listHumanUsers,
  revokeSessionByToken,
  sessionFromRequest,
  setSessionCookie,
  verifyUsersConfigSignature, verifyTrackedSessionToken
} from "../auth/authApi.js";
import { parseCookieHeader } from "../auth/sessionTokens.js";
import { enforceRoleOrAdmin, hasAnyRole, type AccessContext } from "../auth/rbac.js";
import type { UserRole } from "../auth/roles.js";
import { parseUserRoles } from "../auth/roles.js";
import { claimPairingForResponseAsync, clearPairingCookie, pairingCookieValid } from "../pairing/pairingApi.js";
import { loadLanMode, verifyLanModeSignature } from "../pairing/lanMode.js";
import { createPairingCode } from "../pairing/pairingCodes.js";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { loadGatewayConfig } from "../gateway/config.js";
import { policyPackApplyCliAsync, policyPackDescribeCli, policyPackDiffCli, policyPackListCli } from "../policyPacks/packCli.js";
import { tailTransparencyEntries, verifyTransparencyLog } from "../transparency/logCli.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import {
  currentTransparencyMerkleRoot,
  exportTransparencyProofBundle,
  listTransparencyMerkleRoots,
  verifyTransparencyMerkle
} from "../transparency/merkleIndexStore.js";
import { verifyWorkspaceProofBundle } from "../transparency/workspaceProofBundle.js";
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { writeStudioAuditEvent, writeStudioAuditEventAsync } from "./studioAudit.js";
import { captureReportSigningAuthority } from "./reportSigningAuthority.js";
import { frameworkChoices, type ComplianceFramework } from "../compliance/frameworks.js";
import { generateComplianceReport, verifyComplianceMapsSignature } from "../compliance/complianceEngine.js";
import { complianceFleetReportCli } from "../compliance/complianceCli.js";
import { federateExportCli, federateImportCli, federatePeerListCli, federateVerifyCli } from "../federation/federationCli.js";
import { integrationsStatusCli, integrationsVerifyCli } from "../integrations/integrationsCli.js";
import { verifyOpsReceiptForEvent } from "../integrations/opsReceipt.js";
import {
  dispatchIntegrationEventWithAuthority, dispatchIntegrationTestWithAuthority,
  drainDueIntegrationDeliveriesWithAuthority
} from "../integrations/integrationDispatcher.js";
import { resolveSecretRef } from "../integrations/integrationStore.js";
import {
  outcomesFleetReportCli,
  outcomesReportCliAsync,
  outcomesVerifyCli
} from "../outcomes/outcomeCli.js";
import { ingestFeedbackOutcome, ingestOutcomeWebhook, verifyHmacSignature } from "../outcomes/outcomeApi.js";
import {
  experimentAnalyzeCli,
  experimentCreateCli,
  experimentGateCli,
  experimentListCli,
  experimentOptimizeCli,
  experimentOptimizerListCli,
  experimentOptimizerShowCli,
  experimentRunCliAsync,
  experimentSetBaselineCli,
  experimentSetCandidateCli
} from "../experiments/experimentCli.js";
import {
  addOrgNodeAsync,
  assignAgentToNodeAsync,
  loadOrgConfig,
  unassignAgentFromNodeAsync,
  verifyOrgConfigSignature
} from "../org/orgStore.js";
import { compareNodeScorecards, loadLatestOrgScorecard } from "../org/orgScorecard.js";
import { computeOrgScorecard, nodeHierarchy, recomputeAndPersistOrgScorecard } from "../org/orgEngine.js";
import { renderOrgCompareMarkdown, renderOrgNodeReportMarkdown, renderOrgSystemicMarkdown } from "../org/orgReports.js";
import { generateOrgEocAsync, recomputeOrgScorecardsApiAsync } from "../org/orgApi.js";
import { prepareOrgConfigUpdateLog } from "../org/orgPublication.js";
import { listOrgRuns, loadOrgRun, orgRunRoleDefinitions, orgRunSummaryForUi, parseOrgRoleList, runOrg } from "../org/orgRun.js";
import { OrgSseHub } from "../org/orgSse.js";
import {
  applyTransformMapForApiAsync,
  attestAgentTransformTaskForApiAsync,
  attestNodeTransformTaskForApiAsync,
  createAgentTransformPlanForApiAsync,
  createNodeTransformPlanForApiAsync,
  getLatestAgentTransformPlanForApi,
  getLatestNodeTransformPlanForApi,
  getTransformMapForApi,
  trackAgentTransformPlanForApiAsync,
  trackNodeTransformPlanForApiAsync
} from "../transformation/transformApi.js";
import { renderTransformReportMarkdown } from "../transformation/transformReports.js";
import { TransformPublicationError } from "../transformation/transformPublication.js";
import { loadOpsPolicy, verifyOpsPolicySignature } from "../ops/policy.js";
import { retentionStatusCli, retentionRunStudioAsync } from "../ops/retention/retentionCli.js";
import {
  maintenancePruneCacheCli,
  maintenanceStatsCli,
  maintenanceVacuumCli
} from "../ops/maintenance/maintenanceCli.js";
import {
  recordApprovalRequestMetric,
  recordHttpRequestMetric,
  recordLeaseIssuedMetric,
  recordToolhubExecMetric,
  recordToolhubIntentMetric,
  setBlobMetrics,
  setDbSizeMetric,
  setRetentionSegmentsMetric
} from "../ops/metrics/metricsMiddleware.js";
import {
  browsePluginRegistryForWorkspace,
  executePluginRequest,
  listInstalledPlugins,
  pendingPluginRequest,
  requestPluginInstall,
  requestPluginRemove,
  verifyPluginWorkspace
} from "../plugins/pluginApi.js";
import {
  loadPluginRegistriesConfig,
  savePluginRegistriesConfig,
  verifyPluginRegistriesConfig
} from "../plugins/pluginStore.js";
import { loadInstalledPluginAssets } from "../plugins/pluginLoader.js";
import { checkNotaryTrust, fetchNotaryLogTail, loadTrustConfig, verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { loadTrustContext } from "../trust/trustContext.js";
import { requestTrustOverride } from "../trust/requestTrust.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import {
  ackAdvisoryForAuthority,
  applyForecastPolicyForApiForAuthority,
  forecastSchedulerRunNowForApiForAuthority,
  forecastSchedulerSetEnabledForApiForAuthority,
  forecastSchedulerStatusForApi,
  getForecastLatestForApi,
  getForecastPolicyForApi,
  listAdvisoriesForApi,
  refreshForecastForAuthority, refreshForecastsAfterPrimary,
  refreshAllForecastsForApi
} from "../forecast/forecastApi.js";
import { schedulerTickAsync } from "../forecast/forecastPublication.js";
import { verifyForecastPolicySignature } from "../forecast/forecastStore.js";
import { renderForecastMarkdown } from "../forecast/forecastReports.js";
import { handleBridgeRequest } from "../bridge/bridgeServer.js";
import { createBridgePairingCode, redeemBridgePairingCode } from "../bridge/bridgeAuth.js";
import { buildHealthPayload } from "../api/health.js";
import { closeScoreSessionStores } from "../api/scoreStore.js";
import { bindRequestContext, resolveRequestId } from "../api/requestContext.js";
import { canonApplyForPublicationAsync, CanonAuditIncompleteError, canonGetForApi, canonVerifyForApi } from "../canon/canonApi.js";
import { loadDiagnosticBankAttemptAsync, DiagnosticBankFollowupError } from "../diagnostic/bank/bankLoader.js";
import { verifyCanonSignature } from "../canon/canonLoader.js";
import {
  diagnosticBankApplyForApiAsync as diagnosticBankApplyForApi,
  diagnosticBankGetForApiAsync as diagnosticBankGetForApi,
  diagnosticBankVerifyForApi
} from "../diagnostic/bank/bankApi.js";
import { verifyDiagnosticBankSignature } from "../diagnostic/bank/bankLoader.js";
import {
  cgxBuildForApiAsync as cgxBuildForApi,
  cgxLatestGraphForApi,
  cgxLatestPackForApi,
  cgxPolicyApplyForApiAsync as cgxPolicyApplyForApi,
  cgxPolicyForApiAsync as cgxPolicyForApi,
  cgxVerifyForApi
} from "../cgx/cgxApi.js";
import { verifyCgxPolicySignature } from "../cgx/cgxStore.js";
import { renderContextualizedDiagnostic } from "../diagnostic/contextualizer/contextualizer.js";
import { emitCgxSse } from "../cgx/cgxSse.js";
import { validateTruthguardForWorkspace } from "../truthguard/truthguardApi.js";
import { mechanicTargetsApplyForAuthority as mechanicTargetsApplyForApi, mechanicProfileApplyForAuthority as mechanicProfileApplyForApi, mechanicTuningApplyForAuthority as mechanicTuningApplyForApi } from "../mechanic/mechanicSettingsPublication.js";
import { mechanicGapForAuthority as mechanicGapForApi, mechanicCreatePlanForAuthority as mechanicCreatePlanForApi, mechanicSimulateForAuthority as mechanicSimulateForApi } from "../mechanic/mechanicAnalysisPublication.js";
import {
  initMechanicWorkspace,
  mechanicLatestPlanForApi,
  mechanicLatestSimulationForApi,
  mechanicPlanDiffForApi,
  mechanicProfilesForApi,
  mechanicTargetsForApi,
  mechanicTuningForApi,
  verifyMechanicWorkspace
} from "../mechanic/mechanicApi.js";
import { mechanicPlanRequestApprovalForAuthority as mechanicPlanRequestApprovalForApi, mechanicPlanExecuteForAuthority as mechanicPlanExecuteForApi } from "../mechanic/mechanicExecutionPublication.js";
import { verifyMechanicTargetsSignature } from "../mechanic/targetsStore.js";
import { verifyMechanicProfilesSignature } from "../mechanic/profiles.js";
import { verifyMechanicTuningSignature } from "../mechanic/tuningStore.js";
import { emitMechanicSse } from "../mechanic/mechanicSse.js";
import {
  buildPromptPackForApiAsync as buildPromptPackForApi,
  promptDiffForApi,
  promptInitForApiAsync as promptInitForApi,
  promptPolicyApplyForApiAsync as promptPolicyApplyForApi,
  promptPolicyForApiAsync as promptPolicyForApi,
  promptSchedulerRunNowForApiAsync as promptSchedulerRunNowForApi,
  promptSchedulerSetEnabledForApiAsync as promptSchedulerSetEnabledForApi,
  promptSchedulerStatusForApi,
  promptSchedulerTickAsync as promptSchedulerTick,
  promptShowForApi,
  promptStatusForApiAsync as promptStatusForApi,
  promptVerifyForApi
} from "../prompt/promptPackApi.js";
import { verifyWorkspacePromptPack } from "../prompt/promptPackVerifier.js";
import {
  listPromptAgentsWithPacks,
  verifyPromptLintSignature
} from "../prompt/promptPackStore.js";
import {
  loadPromptPolicy,
  promptLatestPackPath,
  verifyPromptPolicySignature
} from "../prompt/promptPolicyStore.js";
import { promptPolicySchema } from "../prompt/promptPolicySchema.js";
import { emitPromptPackSse } from "../prompt/promptPackSse.js";
import {
  passportBadgeForApi,
  passportCacheLatestForApi,
  passportCreateAttemptForApiAsync,
  passportExportExecuteForApi,
  passportExportLatestForApi,
  passportExportRequestForApi,
  passportExportsForApi,
  capturePassportInitialization,
  passportPolicyApplyAttemptForApiAsync,
  passportPolicyForApi,
  passportReadinessGate,
  passportVerifyForApi
} from "../passport/passportApi.js";
import { verifyPassportPolicySignature } from "../passport/passportStore.js";
import { passportPublicationFailure } from "../passport/passportPublication.js";
import { emitPassportSse } from "../passport/passportSse.js";
import {
  standardGenerateForApiAsync as standardGenerateForApi,
  standardSchemaReadForApi,
  standardSchemasForApi,
  standardValidateForApi,
  standardVerifyForApiAsync as standardVerifyForApi
} from "../standard/standardApi.js";

interface StudioApiOptions {
  workspace: string;
  host: string;
  port: number;
  token: string;
  allowedCidrs?: string[];
  trustedProxyHops?: number;
  maxRequestBytes?: number;
  corsAllowedOrigins?: string[];
  nativeAllowedOrigins?: readonly string[];
  minFreeDiskMb?: number;
  publicConsoleBasePath?: string;
}

interface AuthContext {
  isAdmin: boolean;
  agentId: string | null;
  scopes: Set<string>;
  roles: Set<UserRole>;
  username: string | null;
  userId: string | null;
  nativeCsrfToken: string | null;
  sessionAuthSource?: "LOCAL_USER" | "WORKSPACE_ROUTER";
}

async function readBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(withClaimBody(res, status, payload)));
}

/** An Industry Packs licence request: its `licenseKey` (null when none) and whether it also names an `expiresAt`. */
async function readLicenseRequest(req: IncomingMessage, maxBytes = 1_048_576): Promise<{ licenseKey: string | null; expiresAt: boolean }> {
  const body = await readBody(req, maxBytes);
  const parsed = (body ? JSON.parse(body) : {}) as { licenseKey?: unknown; expiresAt?: unknown };
  return { licenseKey: typeof parsed.licenseKey === "string" && parsed.licenseKey.length > 0 ? parsed.licenseKey : null, expiresAt: "expiresAt" in parsed };
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return ((values[0] ?? 0) << 24) + ((values[1] ?? 0) << 16) + ((values[2] ?? 0) << 8) + (values[3] ?? 0);
}

function parseCidr(cidr: string): { base: number; mask: number } | null {
  const [ip, bitsRaw] = cidr.split("/");
  if (!ip || !bitsRaw) {
    return null;
  }
  const base = ipToInt(ip.trim());
  const bits = Number(bitsRaw);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return null;
  }
  const mask = bits === 0 ? 0 : Number((0xffffffff << (32 - bits)) >>> 0);
  return { base: Number(base >>> 0), mask };
}

function ipAllowedByCidrs(ip: string, cidrs: string[]): boolean {
  if (ip === "::1") {
    return cidrs.includes("::1/128") || cidrs.includes("::1");
  }
  const value = ipToInt(ip);
  if (value === null) {
    return false;
  }
  for (const cidr of cidrs) {
    const parsed = parseCidr(cidr);
    if (!parsed) {
      continue;
    }
    const network = parsed.base & parsed.mask;
    if ((Number(value >>> 0) & parsed.mask) === network) {
      return true;
    }
  }
  return false;
}

function extractSocketIp(remoteAddress: string | undefined): string {
  const remote = remoteAddress ?? "127.0.0.1";
  if (remote.startsWith("::ffff:")) {
    return remote.slice("::ffff:".length);
  }
  return remote;
}

function extractForwardedClientIp(req: IncomingMessage, trustedProxyHops: number): string | null {
  if (trustedProxyHops <= 0) {
    return null;
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded !== "string" || forwarded.trim().length === 0) {
    return null;
  }
  const chain = forwarded
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (chain.length === 0) {
    return null;
  }
  const index = Math.max(0, chain.length - trustedProxyHops - 1);
  return chain[index] ?? chain[0] ?? null;
}

function extractClientIp(req: IncomingMessage, trustedProxyHops: number, trustForwarded: boolean): string {
  if (trustForwarded) {
    const forwarded = extractForwardedClientIp(req, trustedProxyHops);
    if (forwarded) {
      return forwarded;
    }
  }
  return extractSocketIp(req.socket.remoteAddress);
}


function workspaceWritable(workspace: string): boolean {
  try {
    const dir = join(workspace, ".amc", "studio", "tmp");
    ensureDir(dir);
    const probe = join(dir, `readyz-${Date.now()}.probe`);
    writeFileAtomic(probe, "ok", 0o600);
    return true;
  } catch {
    return false;
  }
}

function freeDiskMb(path: string): number | null {
  try {
    const out = spawnSync("df", ["-k", path], { encoding: "utf8" });
    if (out.status !== 0) {
      return null;
    }
    const lines = (`${out.stdout ?? ""}`).split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      return null;
    }
    const cols = lines[1]!.trim().split(/\s+/);
    if (cols.length < 4) {
      return null;
    }
    const availKb = Number(cols[3]);
    if (!Number.isFinite(availKb)) {
      return null;
    }
    return Math.floor(availKb / 1024);
  } catch {
    return null;
  }
}

async function buildReadiness(options: StudioApiOptions): Promise<{
  ok: boolean;
  reasons: string[];
  checks: Record<string, unknown>;
}> {
  const reasons: string[] = [];
  const opsSig = verifyOpsPolicySignature(options.workspace);
  if (!opsSig.valid) {
    reasons.push(`OPS_POLICY_UNTRUSTED: ${opsSig.reason ?? "unknown"}`);
  }
  const forecastSig = verifyForecastPolicySignature(options.workspace);
  if (!forecastSig.valid) {
    reasons.push(`FORECAST_POLICY_UNTRUSTED: ${forecastSig.reason ?? "unknown"}`);
  }
  const benchSig = verifyBenchPolicySignature(options.workspace);
  if (!benchSig.valid) {
    reasons.push(`BENCH_POLICY_UNTRUSTED: ${benchSig.reason ?? "unknown"}`);
  }
  const auditPolicySig = verifyAuditPolicySignature(options.workspace);
  if (!auditPolicySig.valid) {
    reasons.push(`AUDIT_POLICY_UNTRUSTED: ${auditPolicySig.reason ?? "unknown"}`);
  }
  const auditMapSig = verifyAuditMapActiveSignature(options.workspace);
  if (!auditMapSig.valid) {
    reasons.push(`AUDIT_MAP_UNTRUSTED: ${auditMapSig.reason ?? "unknown"}`);
  }
  const valuePolicy = (() => {
    try {
      return loadValuePolicy(options.workspace);
    } catch {
      return null;
    }
  })();
  const valuePolicySig = verifyValuePolicySignature(options.workspace);
  if (!valuePolicySig.valid) {
    if (!valuePolicy || valuePolicy.valuePolicy.enforceSignedInputs) {
      reasons.push(`VALUE_POLICY_UNTRUSTED: ${valuePolicySig.reason ?? "unknown"}`);
    }
  }
  const passportPolicySig = verifyPassportPolicySignature(options.workspace);
  if (!passportPolicySig.valid) {
    reasons.push(`PASSPORT_POLICY_UNTRUSTED: ${passportPolicySig.reason ?? "unknown"}`);
  }
  const canonSig = verifyCanonSignature(options.workspace);
  if (!canonSig.valid) {
    reasons.push(`CANON_UNTRUSTED: ${canonSig.reason ?? "unknown"}`);
  }
  const bankSig = verifyDiagnosticBankSignature(options.workspace);
  if (!bankSig.valid) {
    reasons.push(`DIAGNOSTIC_BANK_UNTRUSTED: ${bankSig.reason ?? "unknown"}`);
  }
  const cgxSig = verifyCgxPolicySignature(options.workspace);
  if (!cgxSig.valid) {
    reasons.push(`CGX_POLICY_UNTRUSTED: ${cgxSig.reason ?? "unknown"}`);
  }
  const mechanicTargetsSig = verifyMechanicTargetsSignature(options.workspace);
  if (!mechanicTargetsSig.valid) {
    reasons.push(`MECHANIC_TARGETS_UNTRUSTED: ${mechanicTargetsSig.reason ?? "unknown"}`);
  }
  const mechanicProfilesSig = verifyMechanicProfilesSignature(options.workspace);
  if (!mechanicProfilesSig.valid) {
    reasons.push(`MECHANIC_PROFILES_UNTRUSTED: ${mechanicProfilesSig.reason ?? "unknown"}`);
  }
  const mechanicTuningSig = verifyMechanicTuningSignature(options.workspace);
  if (!mechanicTuningSig.valid) {
    reasons.push(`MECHANIC_TUNING_UNTRUSTED: ${mechanicTuningSig.reason ?? "unknown"}`);
  }
  let promptPolicyEnforced = true;
  let promptPolicyLoaded: ReturnType<typeof loadPromptPolicy> | null = null;
  try {
    promptPolicyLoaded = promptPolicySchema.parse(YAML.parse(readUtf8(join(options.workspace, ".amc", "prompt", "policy.yaml"))) as unknown);
    promptPolicyEnforced = promptPolicyLoaded.promptPolicy.enforcement.mode === "ENFORCE";
  } catch {
    promptPolicyEnforced = true;
  }
  const promptPolicySig = verifyPromptPolicySignature(options.workspace);
  if (!promptPolicySig.valid && promptPolicyEnforced) {
    reasons.push(`PROMPT_POLICY_UNTRUSTED: ${promptPolicySig.reason ?? "unknown"}`);
  }
  const promptPackErrors: string[] = [];
  const promptPackAgents = listPromptAgentsWithPacks(options.workspace);
  for (const agentId of promptPackAgents) {
    const verify = verifyWorkspacePromptPack(options.workspace, promptLatestPackPath(options.workspace, agentId));
    if (!verify.ok) {
      promptPackErrors.push(`pack(${agentId}) ${verify.errors.join("; ")}`);
    }
    const lintSig = verifyPromptLintSignature(options.workspace, agentId);
    if (!(lintSig.valid || !lintSig.signatureExists)) {
      promptPackErrors.push(`lint(${agentId}) ${lintSig.reason ?? "invalid signature"}`);
    }
    if (verify.lintStatus === "FAIL") {
      promptPackErrors.push(`lint(${agentId}) status FAIL`);
    }
  }
  if (promptPolicyEnforced && promptPackErrors.length > 0) {
    reasons.push(`PROMPT_PACK_INVALID: ${promptPackErrors.join(" | ")}`);
  }
  const writable = workspaceWritable(options.workspace);
  if (!writable) {
    reasons.push("WORKSPACE_NOT_WRITABLE");
  }
  let dbReachable = true;
  try {
    const ledger = openLedger(options.workspace);
    ledger.close();
  } catch {
    dbReachable = false;
    reasons.push("LEDGER_DB_UNREACHABLE");
  }
  const freeMb = freeDiskMb(options.workspace);
  const minFree = Math.max(1, options.minFreeDiskMb ?? 1024);
  if (freeMb === null) {
    reasons.push("DISK_SPACE_CHECK_FAILED");
  } else if (freeMb < minFree) {
    reasons.push(`DISK_SPACE_LOW:${freeMb}MB<${minFree}MB`);
  }
  const tlog = verifyTransparencyLog(options.workspace);
  if (!tlog.ok) {
    reasons.push("TRANSPARENCY_SEAL_INVALID");
  }
  const merkle = verifyTransparencyMerkle(options.workspace);
  if (!merkle.ok) {
    reasons.push("MERKLE_ROOT_INVALID");
  }
  const pluginVerify = verifyPluginWorkspace({ workspace: options.workspace });
  if (!pluginVerify.ok) {
    reasons.push("PLUGIN_INTEGRITY_BROKEN");
  }
  const assuranceGate = (() => {
    try {
      return assuranceReadinessGate(options.workspace);
    } catch (error) {
      return {
        ok: false,
        reasons: [`ASSURANCE_READY_CHECK_FAILED:${String(error)}`],
        warnings: [],
        latestRunId: null,
        latestStatus: null,
        waiver: null
      };
    }
  })();
  if (!assuranceGate.ok) {
    reasons.push(...assuranceGate.reasons);
  }
  const auditGate = (() => {
    try {
      return auditReadinessGate(options.workspace);
    } catch (error) {
      return {
        ok: false,
        reasons: [`AUDIT_READY_CHECK_FAILED:${String(error)}`],
        warnings: []
      };
    }
  })();
  if (!auditGate.ok) {
    reasons.push(...auditGate.reasons);
  }
  const valueGate = (() => {
    try {
      return valueReadinessGate(options.workspace);
    } catch (error) {
      return {
        ok: false,
        reasons: [`VALUE_READY_CHECK_FAILED:${String(error)}`],
        warnings: []
      };
    }
  })();
  if (!valueGate.ok) {
    reasons.push(...valueGate.reasons);
  }
  const passportGate = (() => {
    try {
      return passportReadinessGate(options.workspace);
    } catch (error) {
      return {
        ok: false,
        reasons: [`PASSPORT_READY_CHECK_FAILED:${String(error)}`],
        warnings: []
      };
    }
  })();
  if (!passportGate.ok) {
    reasons.push(...passportGate.reasons);
  }
  const trustSig = verifyTrustConfigSignature(options.workspace);
  if (!trustSig.valid) {
    reasons.push(`TRUST_CONFIG_UNTRUSTED:${trustSig.reason ?? "unknown"}`);
  }
  let trustCheck:
    | Awaited<ReturnType<typeof checkNotaryTrust>>
    | null = null;
  try {
    if (trustSig.valid) {
      trustCheck = await checkNotaryTrust(options.workspace);
      if (!trustCheck.ok) {
        for (const reason of trustCheck.reasons) {
          reasons.push(reason);
        }
      }
    }
  } catch (error) {
    reasons.push(`TRUST_CHECK_FAILED:${String(error)}`);
  }
  let blobEncryptionEnabled = true;
  try {
    blobEncryptionEnabled = loadOpsPolicy(options.workspace).opsPolicy.encryption.blobEncryptionEnabled;
  } catch {
    blobEncryptionEnabled = true;
  }
  const vault = vaultStatus(options.workspace);
  if (blobEncryptionEnabled && !vault.unlocked) {
    reasons.push("VAULT_LOCKED_FOR_BLOB_ENCRYPTION");
  }
  return {
    ok: reasons.length === 0,
    reasons,
    checks: {
      opsPolicySignatureValid: opsSig.valid,
      forecastPolicySignatureValid: forecastSig.valid,
      benchPolicySignatureValid: benchSig.valid,
      auditPolicySignatureValid: auditPolicySig.valid,
      auditMapSignatureValid: auditMapSig.valid,
      valuePolicySignatureValid: valuePolicySig.valid,
      passportPolicySignatureValid: passportPolicySig.valid,
      canonSignatureValid: canonSig.valid,
      diagnosticBankSignatureValid: bankSig.valid,
      cgxPolicySignatureValid: cgxSig.valid,
      mechanicTargetsSignatureValid: mechanicTargetsSig.valid,
      mechanicProfilesSignatureValid: mechanicProfilesSig.valid,
      mechanicTuningSignatureValid: mechanicTuningSig.valid,
      promptPolicyEnforcement: promptPolicyEnforced ? "ENFORCE" : "OFF",
      promptPolicySignatureValid: promptPolicySig.valid,
      promptPolicySignatureReason: promptPolicySig.reason ?? null,
      promptPackAgents,
      promptPackErrors,
      workspaceWritable: writable,
      dbReachable,
      freeDiskMb: freeMb,
      minFreeDiskMb: minFree,
      transparencyValid: tlog.ok,
      merkleValid: merkle.ok,
      pluginIntegrityValid: pluginVerify.ok,
      assurance: {
        ok: assuranceGate.ok,
        reasons: assuranceGate.reasons,
        warnings: assuranceGate.warnings,
        latestRunId: assuranceGate.latestRunId,
        latestStatus: assuranceGate.latestStatus,
        waiver: assuranceGate.waiver
      },
      audit: {
        ok: auditGate.ok,
        reasons: auditGate.reasons,
        warnings: auditGate.warnings
      },
      value: {
        ok: valueGate.ok,
        reasons: valueGate.reasons,
        warnings: valueGate.warnings
      },
      passport: {
        ok: passportGate.ok,
        reasons: passportGate.reasons,
        warnings: passportGate.warnings
      },
      trustConfigSignatureValid: trustSig.valid,
      trustMode: trustCheck?.mode ?? (() => {
        try {
          return loadTrustConfig(options.workspace).trust.mode;
        } catch {
          return "LOCAL_VAULT";
        }
      })(),
      trustOk: trustCheck?.ok ?? trustSig.valid,
      trustReasons: trustCheck?.reasons ?? [],
      blobEncryptionEnabled,
      vaultUnlocked: vault.unlocked
    }
  };
}

function normalizeMetricRoute(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  const parts = pathname.split("/").filter((part) => part.length > 0);
  const normalized = parts.map((part) => {
    if (/^[0-9a-f]{16,}$/i.test(part) || /^[0-9a-f-]{24,}$/i.test(part)) {
      return ":id";
    }
    if (/^(run|wo|intent|exec|appr|apprreq|apprdec|lease|blob|seg|bkp|att|tp|bench|cert)_/i.test(part)) {
      return ":id";
    }
    if (part.length > 48) {
      return ":id";
    }
    return part;
  });
  return `/${normalized.join("/")}`;
}

function backupStatusSummary(workspace: string): {
  lastBackupTs: number | null;
  backupAgeDays: number | null;
  warning: boolean;
  warningThresholdDays: number;
  backupEventHash: string | null;
} {
  const threshold = loadOpsPolicy(workspace).opsPolicy.backups.maxBackupAgeDaysWarning;
  const entries = tailTransparencyEntries(workspace, 500)
    .filter((row) => row.type === "BACKUP_CREATED")
    .sort((a, b) => b.ts - a.ts);
  if (entries.length === 0) {
    return {
      lastBackupTs: null,
      backupAgeDays: null,
      warning: true,
      warningThresholdDays: threshold,
      backupEventHash: null
    };
  }
  const latest = entries[0]!;
  const ageDays = Number(((Date.now() - latest.ts) / (24 * 60 * 60 * 1000)).toFixed(3));
  return {
    lastBackupTs: latest.ts,
    backupAgeDays: ageDays,
    warning: ageDays > threshold,
    warningThresholdDays: threshold,
    backupEventHash: latest.hash
  };
}

function makeRateLimiter(limit: number, intervalMs: number): (key: string) => boolean {
  const buckets = new Map<string, { count: number; resetTs: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetTs <= now) {
      buckets.set(key, {
        count: 1,
        resetTs: now + intervalMs
      });
      return true;
    }
    existing.count += 1;
    if (existing.count > limit) {
      return false;
    }
    return true;
  };
}

interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTs: number;
  retryAfterSeconds: number;
}

function makeRateLimiterDetailed(limit: number, intervalMs: number): (key: string) => RateLimitDecision {
  const buckets = new Map<string, { count: number; resetTs: number }>();
  return (key: string): RateLimitDecision => {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetTs <= now) {
      bucket = {
        count: 0,
        resetTs: now + intervalMs
      };
      buckets.set(key, bucket);
    }
    if (bucket.count >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTs: bucket.resetTs,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetTs - now) / 1000))
      };
    }
    bucket.count += 1;
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetTs: bucket.resetTs,
      retryAfterSeconds: 0
    };
  };
}

function setRateLimitHeaders(res: ServerResponse, decision: RateLimitDecision): void {
  const now = Date.now();
  const resetAfterSeconds = Math.max(0, Math.ceil((decision.resetTs - now) / 1000));
  const resetEpochSeconds = Math.max(0, Math.floor(decision.resetTs / 1000));
  res.setHeader("x-ratelimit-limit", String(decision.limit));
  res.setHeader("x-ratelimit-remaining", String(decision.remaining));
  res.setHeader("x-ratelimit-reset", String(resetEpochSeconds));
  res.setHeader("ratelimit-limit", String(decision.limit));
  res.setHeader("ratelimit-remaining", String(decision.remaining));
  res.setHeader("ratelimit-reset", String(resetAfterSeconds));
  if (!decision.allowed && decision.retryAfterSeconds > 0) {
    res.setHeader("retry-after", String(decision.retryAfterSeconds));
  }
}

function leaseQueryCarrierEnabled(workspace: string): boolean {
  try {
    return loadGatewayConfig(workspace).lease.allowQueryCarrier === true;
  } catch {
    return false;
  }
}

function requestUsesHttps(req: IncomingMessage): boolean {
  const forwarded = req.headers["x-forwarded-proto"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",", 1)[0]?.trim().toLowerCase();
  if (first === "https") {
    return true;
  }
  return (req.socket as Socket & { encrypted?: boolean }).encrypted === true;
}

function authenticate(req: IncomingMessage, workspace: string, adminToken: string): AuthContext | null {
  const suppliedAdmin = req.headers["x-amc-admin-token"];
  if (typeof suppliedAdmin === "string" && suppliedAdmin === adminToken) {
    return {
      isAdmin: true,
      agentId: null,
      scopes: new Set(["*"]),
      roles: new Set(["OWNER", "AUDITOR", "APPROVER", "OPERATOR", "VIEWER", "AGENT"]),
      username: "bootstrap-admin",
      userId: "bootstrap-admin",
      nativeCsrfToken: null
    };
  }

  const session = sessionFromRequest({
    workspace,
    req
  });
  if (session.ok && session.payload) {
    return {
      isAdmin: false,
      agentId: null,
      scopes: new Set(["console:session"]),
      roles: new Set<UserRole>(session.payload.userId === "local-demo" ? ["VIEWER"] : session.payload.roles),
      username: session.payload.username,
      userId: session.payload.userId,
      nativeCsrfToken: nativeCsrfTokenForSession(session.payload),
      sessionAuthSource: session.authSource
    };
  }

  const agent = authenticateStudioAgent({
    workspace, headers: req.headers, rawHeaders: req.rawHeaders,
    url: new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`),
    allowQueryCarrier: leaseQueryCarrierEnabled(workspace)
  });
  return agent === null ? null : {
    isAdmin: false, agentId: agent.agentId, scopes: agent.scopes,
    roles: new Set(["AGENT"]), username: agent.username,
    userId: null, nativeCsrfToken: null
  };
}

function hasScope(auth: AuthContext, scope: string): boolean {
  return auth.isAdmin || auth.scopes.has("*") || auth.scopes.has(scope);
}

function accessContext(auth: AuthContext): AccessContext {
  if (auth.isAdmin) {
    return {
      isAdminToken: true,
      principal: null
    };
  }
  if (!auth.username) {
    return {
      isAdminToken: false,
      principal: null
    };
  }
  return {
    isAdminToken: false,
    principal: {
      userId: auth.username,
      username: auth.username,
      roles: [...auth.roles]
    }
  };
}

function requireRoles(params: {
  auth: AuthContext;
  res: ServerResponse;
  roles: UserRole[];
  workspace: string;
}): boolean {
  const usersSig = verifyUsersConfigSignature(params.workspace);
  const check = enforceRoleOrAdmin({
    access: accessContext(params.auth),
    requiredAny: params.roles,
    usersConfigValid: usersSig.valid || params.auth.sessionAuthSource === "WORKSPACE_ROUTER"
  });
  if (!check.ok) {
    json(params.res, check.status, { error: check.error ?? "forbidden" });
    return false;
  }
  return true;
}

function requiresReadOnlyMode(workspace: string): boolean {
  const usersSig = verifyUsersConfigSignature(workspace);
  const trustSig = verifyTrustConfigSignature(workspace);
  return (usersSig.signatureExists && !usersSig.valid) || !trustSig.valid;
}

function hmacHeaderValue(req: IncomingMessage): string | null {
  const raw = req.headers["x-amc-signature"];
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  const alt = req.headers["x-amc-hmac-sha256"];
  if (typeof alt === "string" && alt.trim().length > 0) {
    return alt.trim();
  }
  return null;
}

function resolveWebhookSecret(workspace: string, kind: "feedback" | "outcomes"): string | null {
  const refs =
    kind === "feedback"
      ? ["vault:integrations/feedback-webhook", "vault:integrations/ops-webhook"]
      : ["vault:integrations/outcomes-webhook", "vault:integrations/ops-webhook"];
  for (const ref of refs) {
    try {
      const secret = resolveSecretRef(workspace, ref);
      if (secret && secret.length > 0) {
        return secret;
      }
    } catch {
      // ignore and try fallback ref
    }
  }
  return null;
}

function verifyLeaseForScope(params: {
  workspace: string;
  req: IncomingMessage;
  expectedAgentId: string;
  scope: "toolhub:intent" | "toolhub:execute" | "governor:check" | "receipt:verify" | "diagnostic:self-run";
  routePath?: string;
  model?: string | null;
  actionClass?: ActionClass;
}): { ok: true } | { ok: false; status: number; error: string } {
  const parsedUrl = new URL(params.req.url ?? "/", `http://${params.req.headers.host ?? "127.0.0.1"}`);
  const carrier = extractLeaseCarrier({
    headers: params.req.headers,
    url: parsedUrl,
    allowQueryCarrier: leaseQueryCarrierEnabled(params.workspace)
  });
  const leaseToken = carrier.leaseToken ?? undefined;
  if (!leaseToken) {
    return {
      ok: false,
      status: 401,
      error: "missing lease token"
    };
  }
  const revocations = readRevokedLeaseIds(params.workspace);
  if (!revocations.ok) {
    return {
      ok: false,
      status: 401,
      error: `lease revocation signature invalid: ${revocations.reason}`
    };
  }
  const revoked = revocations.ids;
  const expectedWorkspaceId = workspaceIdFromDirectory(params.workspace);
  const verification = verifyLeaseToken({
    workspace: params.workspace,
    token: leaseToken,
    expectedWorkspaceId,
    expectedAgentId: params.expectedAgentId,
    requiredScope: params.scope,
    routePath: params.routePath,
    model: params.model,
    revokedLeaseIds: revoked,
    ...(params.actionClass === undefined ? {} : { actionClass: params.actionClass })
  });
  if (!verification.ok) {
    const message = verification.error ?? "lease verification failed";
    const status = message.includes("scope denied") ||
      message.includes("route denied") ||
      message.includes("model denied") ||
      message.includes("agent mismatch") ||
      message.includes("workspace mismatch")
      ? 403
      : 401;
    return {
      ok: false,
      status,
      error: message
    };
  }
  return { ok: true };
}

interface AgentLatestRunSummary {
  runId: string;
  ts: number;
  integrityIndex: number;
  trustLabel: string;
  status: string;
}

interface AgentStatusResponse {
  agentId: string;
  latestRun: (AgentLatestRunSummary & ReturnType<typeof summarizeDiagnosticEvidenceReadiness>) | null;
}

interface OutcomeHistoryRow {
  reportId: string;
  ts: number;
  valueScore: number;
  economicSignificanceIndex: number;
  valueRegressionRisk: number;
  trustLabel: string;
  observedCoverageRatio: number;
}

function listOutcomeHistory(workspace: string, agentId: string, limit = 20): OutcomeHistoryRow[] {
  const dir = join(getAgentPaths(workspace, agentId).rootDir, "outcomes", "reports");
  if (!pathExists(dir)) {
    return [];
  }
  const rows = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        const parsed = JSON.parse(readUtf8(join(dir, name))) as Record<string, unknown>;
        return {
          reportId: String(parsed.reportId ?? name.replace(/\.json$/, "")),
          ts: Number(parsed.ts ?? 0),
          valueScore: Number(parsed.valueScore ?? 0),
          economicSignificanceIndex: Number(parsed.economicSignificanceIndex ?? 0),
          valueRegressionRisk: Number(parsed.valueRegressionRisk ?? 0),
          trustLabel: String(parsed.trustLabel ?? "UNTRUSTED CONFIG"),
          observedCoverageRatio: Number(parsed.observedCoverageRatio ?? 0)
        };
      } catch {
        return null;
      }
    })
    .filter((row): row is OutcomeHistoryRow => row !== null)
    .sort((a, b) => a.ts - b.ts);
  return rows.slice(Math.max(0, rows.length - Math.max(1, limit)));
}

function listExperimentHistory(workspace: string, agentId: string): Array<{
  experimentId: string;
  name: string;
  casebookId: string;
  latestRun: Record<string, unknown> | null;
}> {
  const root = join(getAgentPaths(workspace, agentId).rootDir, "experiments");
  if (!pathExists(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const experimentId = entry.name;
      const experimentYaml = join(root, experimentId, "experiment.yaml");
      let name = experimentId;
      let casebookId = "unknown";
      if (pathExists(experimentYaml)) {
        try {
          const parsed = parseYaml(readUtf8(experimentYaml)) as {
            experiment?: { name?: string; casebookId?: string };
          };
          name = parsed.experiment?.name ?? name;
          casebookId = parsed.experiment?.casebookId ?? casebookId;
        } catch {
          // ignore
        }
      }
      const runsDir = join(root, experimentId, "runs");
      let latestRun: Record<string, unknown> | null = null;
      if (pathExists(runsDir)) {
        const runs = readdirSync(runsDir)
          .filter((file) => file.endsWith(".json"))
          .sort((a, b) => a.localeCompare(b));
        if (runs.length > 0) {
          try {
            latestRun = JSON.parse(readUtf8(join(runsDir, runs[runs.length - 1]!))) as Record<string, unknown>;
          } catch {
            latestRun = null;
          }
        }
      }
      return {
        experimentId,
        name,
        casebookId,
        latestRun
      };
    })
    .sort((a, b) => a.experimentId.localeCompare(b.experimentId));
}

function parseComplianceFramework(raw: string | null): ComplianceFramework | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  const match = frameworkChoices().find((item) => item === normalized);
  return (match ?? null) as ComplianceFramework | null;
}

function agentLastStatus(workspace: string, agentId: string): AgentStatusResponse {
  const latest = agentRunFiles(workspace, agentId).at(-1);
  if (!latest) {
    return { agentId, latestRun: null };
  }
  const last = JSON.parse(readUtf8(latest)) as Record<string, unknown>;
  return {
    agentId,
    latestRun: {
      runId: String(last.runId ?? ""),
      ts: Number(last.ts ?? 0),
      integrityIndex: Number(last.integrityIndex ?? 0),
      trustLabel: String(last.trustLabel ?? "UNKNOWN"),
      status: String(last.status ?? "INVALID"),
      ...summarizeDiagnosticEvidenceReadiness(last as Parameters<typeof summarizeDiagnosticEvidenceReadiness>[0])
    }
  };
}


function currentSigningAuthority(req: IncomingMessage, res: ServerResponse, workspace: string, token: string,
  initial: NonNullable<ReturnType<typeof authenticate>>, requested: UserRole[]) {
  const roles = [...requested], expected = { isAdmin: initial.isAdmin, userId: initial.userId, agentId: initial.agentId };
  return () => {
    const current = authenticate(req, workspace, token);
    if (!current || current.isAdmin !== expected.isAdmin || current.userId !== expected.userId || current.agentId !== expected.agentId) {
      if (!res.headersSent) json(res, 401, { error: "authenticated authority changed while signing" });
      throw new Error("authenticated authority changed while signing");
    }
    if (!requireRoles({ auth: current, res, workspace, roles })) throw new Error("authenticated authority changed while signing");
  };
}

async function writeConsoleSnapshot(workspace: string, beforePublish: () => void) {
  const state = readStudioState(workspace);
  const agents = listAgents(workspace).map((agent) => agent.id);
  if (!agents.includes("default")) {
    agents.push("default");
  }
  const agentSummaries = agents.map((agentId) => agentLastStatus(workspace, agentId));
  const payload: Record<string, unknown> = {
    v: 1,
    ts: Date.now(),
    studio: state
      ? {
          running: true,
          host: state.host,
          apiPort: state.apiPort,
          gatewayPort: state.gatewayPort,
          proxyPort: state.proxyPort,
          currentAgent: state.currentAgent,
          untrustedConfig: state.untrustedConfig
        }
      : { running: false },
    agents: agentSummaries
  };
  return publishConsoleSnapshotAsync(workspace, payload, beforePublish);
}

function pickAgentApproval(workspace: string, approvalId: string): { agentId: string; approval: ReturnType<typeof loadApprovalRequestRecord> } | null {
  const candidates = new Set<string>(listAgents(workspace).map((agent) => agent.id));
  candidates.add("default");
  for (const agentId of candidates) {
    try {
      const approval = loadApprovalRequestRecord({
        workspace,
        agentId,
        approvalRequestId: approvalId,
        requireValidSignature: true
      });
      return {
        agentId,
        approval
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function startStudioApiServer(options: StudioApiOptions): Promise<{
  server: Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}> {
  const passportStartup = capturePassportInitialization(options.workspace);
  await promptInitForApi(options.workspace);
  await passportStartup.initialize();
  const toolhub = new ToolHubService(options.workspace);
  const nativeTaskService = createNativeTaskService({ workspace: options.workspace });
  const orgSse = new OrgSseHub();
  const allowByIp = (ip: string): boolean => {
    const cidrs = options.allowedCidrs ?? ["127.0.0.1/32", "::1/128"];
    return ipAllowedByCidrs(ip, cidrs);
  };
  const healthLimiter = makeRateLimiter(120, 60_000);
  const authLimiter = makeRateLimiter(20, 60_000);
  const writeLimiter = makeRateLimiter(180, 60_000);
  const pairRedeemLimiter = makeRateLimiter(40, 60_000);
  const apiLimiter = makeRateLimiterDetailed(240, 60_000);
  const privilegedApiLimiter = makeRateLimiterDetailed(600, 60_000);

  const emitOrgEvent = (type: Parameters<OrgSseHub["emit"]>[0]["type"], nodeIds?: string[]): void => {
    const config = (() => {
      try {
        return loadOrgConfig(options.workspace);
      } catch {
        return null;
      }
    })();
    const ids = nodeIds && nodeIds.length > 0
      ? nodeIds
      : config
        ? config.nodes.map((node) => node.id)
        : [];
    orgSse.emit({
      type,
      nodeIds: [...new Set(ids)].sort((a, b) => a.localeCompare(b)),
      ts: Date.now(),
      version: 1
    });
  };

  const orgNodeIdsForAgent = (agentId: string): string[] => {
    try {
      const config = loadOrgConfig(options.workspace);
      return config.memberships
        .filter((row) => row.agentId === agentId)
        .flatMap((row) => row.nodeIds)
        .filter((id, index, arr) => arr.indexOf(id) === index)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  };

  const recomputeOrgAndEmit = (
    type: Parameters<OrgSseHub["emit"]>[0]["type"],
    nodeIds?: string[]
  ): void => {
    try {
      recomputeAndPersistOrgScorecard({
        workspace: options.workspace,
        window: "14d"
      });
    } catch {
      // Do not fail primary workflow if org scorecard recompute fails.
    }
    emitOrgEvent(type, nodeIds);
    if (type !== "ORG_SCORECARD_UPDATED") {
      emitOrgEvent("ORG_SCORECARD_UPDATED", nodeIds);
    }
  };

  const recomputeOwnedOrgAndEmit = async (nodeIds: string[], beforePublish: () => void): Promise<void> => {
    try { await recomputeOrgScorecardsApiAsync({ workspace: options.workspace, window: "14d" }, { beforePublish }); }
    catch { /* Preserve the existing best-effort secondary recompute contract. */ }
    emitOrgEvent("ORG_SCORECARD_UPDATED", nodeIds);
  };

  const emitForecastEvents = (params: {
    agentId: string | null;
    advisories: Array<{ severity: "INFO" | "WARN" | "CRITICAL"; category: string }>;
    status: "OK" | "INSUFFICIENT_EVIDENCE";
  }): void => {
    const nodeIds = params.agentId ? orgNodeIdsForAgent(params.agentId) : undefined;
    emitOrgEvent("FORECAST_UPDATED", nodeIds);
    if (params.status === "INSUFFICIENT_EVIDENCE") {
      emitOrgEvent("ANOMALY_DETECTED", nodeIds);
    }
    if (params.advisories.some((advisory) => advisory.category === "DRIFT")) {
      emitOrgEvent("DRIFT_DETECTED", nodeIds);
    }
    if (params.advisories.length > 0) {
      emitOrgEvent("ADVISORY_CREATED", nodeIds);
    }
  };

  let shuttingDown = false;
  const integrationQueueWork = new Set<Promise<void>>();
  const drainIntegrationQueue = (): void => {
    const work = drainDueIntegrationDeliveriesWithAuthority({ workspace: options.workspace }, () => {
      if (shuttingDown) throw new Error("integration queue worker stopped");
    }).then(() => undefined, () => undefined); // Durable queue state remains available for a later tick.
    integrationQueueWork.add(work); void work.then(() => integrationQueueWork.delete(work));
  };
  drainIntegrationQueue();

  const forecastSchedulerWork = new Set<Promise<void>>();
  const schedulerTimer = setInterval(() => {
    try {
      drainIntegrationQueue();
      const readiness = buildReadiness(options);
      const forecastWork = readiness.then(async (state) => {
        const tick = await schedulerTickAsync({
          workspace: options.workspace,
          workspaceReady: state.ok
        });
        const promptTick = await promptSchedulerTick({
          workspace: options.workspace,
          workspaceReady: state.ok
        }, { beforePublish: () => { if (shuttingDown) throw new Error("prompt scheduler stopped"); } });
        const assuranceTick = await assuranceSchedulerTick({
          workspace: options.workspace,
          workspaceReady: state.ok
        }, { beforePublish: () => { if (shuttingDown) throw new Error("assurance scheduler stopped"); } });
        const auditTick = await auditSchedulerTick({
          workspace: options.workspace,
          workspaceReady: state.ok
        }, { beforePublish: () => { if (shuttingDown) throw new Error("audit scheduler stopped"); } });
        const valueTick = await valueSchedulerTick({
          workspace: options.workspace,
          workspaceReady: state.ok
        });
        if (tick.ran) {
          recomputeOrgAndEmit("FORECAST_UPDATED");
        }
        if (promptTick.ran) {
          emitPromptPackSse({
            hub: orgSse,
            type: "PROMPT_PACK_UPDATED"
          });
        }
        if (assuranceTick.ran) {
          emitAssuranceSse({
            hub: orgSse,
            type: "ASSURANCE_RUN_UPDATED"
          });
          emitOrgEvent("ASSURANCE_RUN_COMPLETED");
          emitAssuranceSse({
            hub: orgSse,
            type: "ASSURANCE_CERT_UPDATED"
          });
        }
        if (auditTick.ran) {
          emitAuditSse({
            hub: orgSse,
            type: "AUDIT_BINDER_UPDATED"
          });
        }
        if (valueTick.ran) {
          emitValueSse({
            hub: orgSse,
            type: "VALUE_UPDATED"
          });
          if (valueTick.status === "INSUFFICIENT_EVIDENCE") {
            emitValueSse({
              hub: orgSse,
              type: "VALUE_EVIDENCE_INSUFFICIENT"
            });
          }
        }
        // P1-25: a no-op unless time.tsa is configured; pending checkpoints retry on the next tick.
        if (state.ok) await timeCheckpointTick(options.workspace);
      }).catch(() => {
        // Scheduler loop is best effort; failures are surfaced via explicit endpoints and subsequent ticks.
      });
      forecastSchedulerWork.add(forecastWork); void forecastWork.then(() => forecastSchedulerWork.delete(forecastWork), () => forecastSchedulerWork.delete(forecastWork));
    } catch {
      // Scheduler is best effort; readiness and explicit refresh endpoints remain authoritative.
    }
  }, 60_000);

  let inFlightRequests = 0;
  const openSockets = new Set<Socket>();

  const server = createServer(async (req, res) => {
    if (shuttingDown) {
      res.setHeader("connection", "close");
      json(res, 503, { error: "server shutting down" });
      return;
    }

    inFlightRequests += 1;
    let requestReleased = false;
    const releaseRequest = () => {
      if (requestReleased) {
        return;
      }
      requestReleased = true;
      inFlightRequests = Math.max(0, inFlightRequests - 1);
    };
    res.once("finish", releaseRequest);
    res.once("close", releaseRequest);

    const requestStartedAt = Date.now();
    let metricRoute = "/unknown";
    const metricMethod = (req.method ?? "GET").toUpperCase();
    res.once("finish", () => {
      recordHttpRequestMetric(metricRoute, metricMethod, res.statusCode || 0, Date.now() - requestStartedAt);
    });
    try {
      if (!allowCors(req, res, options)) {
        return;
      }

      const remoteIp = extractSocketIp(req.socket.remoteAddress);
      const trustForwarded = (options.trustedProxyHops ?? 0) > 0 && allowByIp(remoteIp);
      const clientIp = extractClientIp(req, options.trustedProxyHops ?? 0, trustForwarded);
      if (!allowByIp(clientIp)) {
        json(res, 403, { error: "client IP not allowed", ip: clientIp });
        return;
      }

      const url = new URL(req.url ?? "/", `http://${options.host}:${options.port}`);
      const pathname = url.pathname;
      const method = (req.method ?? "GET").toUpperCase();
      metricRoute = normalizeMetricRoute(pathname);
      bindStudioResultRoute(res, method, pathname, options.workspace);

      if (pathname === "/auth/login") {
        if (!authLimiter(`auth:${clientIp}`)) {
          json(res, 429, { error: "too many login attempts" });
          return;
        }
      } else if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
        if (!writeLimiter(`write:${clientIp}`)) {
          json(res, 429, { error: "too many write requests" });
          return;
        }
      }

      if (pathname.startsWith("/console")) {
        if (serveConsolePath(pathname, res)) {
          return;
        }
      }

      if (pathname === "/health" || pathname === "/healthz") {
        if (!healthLimiter(`health:${clientIp}`)) {
          json(res, 429, { error: "rate limited" });
          return;
        }
        json(res, 200, buildHealthPayload(options.workspace));
        return;
      }

      // ── AMC REST API v1 ─────────────────────────────────────────────
      if (pathname.startsWith("/api/v1/")) {
        bindRequestContext(res, { requestId: resolveRequestId(req, { trustInbound: trustForwarded }), method, path: pathname, startedAt: requestStartedAt });
        const handled = await handleStudioApiDelegation({
          pathname,
          method,
          clientIp,
          workspace: options.workspace,
          token: options.token,
          req,
          res,
          authenticate,
          requireRoles: (params) => requireRoles({
            auth: params.auth as AuthContext,
            res: params.res,
            workspace: params.workspace,
            roles: params.roles as UserRole[]
          }),
          json,
          apiLimiter,
          privilegedApiLimiter,
          nativeTaskService,
          nativeExecutionAllowed: () => !requiresReadOnlyMode(options.workspace),
          nativeAllowedOrigins: isNativeStudioPath(pathname) ? nativeAllowedBrowserOrigins(options.host,
            (server.address() as { port?: number } | null)?.port ?? options.port,
            [...(options.corsAllowedOrigins ?? []), ...(options.nativeAllowedOrigins ?? [])]) : undefined,
          setRateLimitHeaders: (response, decision) => setRateLimitHeaders(response, decision)
        });
        if (handled) return;
      }

      if (pathname === "/readyz") {
        if (!healthLimiter(`ready:${clientIp}`)) {
          json(res, 429, { error: "rate limited" });
          return;
        }
        const readiness = await buildReadiness(options);
        json(res, readiness.ok ? 200 : 503, {
          status: readiness.ok ? "READY" : "NOT_READY",
          reasons: readiness.reasons,
          checks: readiness.checks,
          ts: Date.now()
        });
        return;
      }

      if (pathname === "/events/org" && req.method === "GET") {
        const auth = authenticate(req, options.workspace, options.token);
        if (!auth) {
          json(res, 401, { error: "missing or invalid token" });
          return;
        }
        if (!requireRoles({ auth, res, workspace: options.workspace, roles: ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"] })) {
          return;
        }
        orgSse.addClient(res);
        return;
      }

      if (pathname === "/console/snapshot" && req.method === "GET") {
        const auth = authenticate(req, options.workspace, options.token);
        if (!auth) {
          json(res, 401, { error: "missing or invalid token" });
          return;
        }
        if (!requireRoles({ auth, res, workspace: options.workspace, roles: ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"] })) {
          return;
        }
        try {
          const snapshot = await writeConsoleSnapshot(options.workspace, currentSigningAuthority(req, res, options.workspace, options.token, auth,
            ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"]));
          json(res, 200, { ...snapshot.payload, snapshotPath: snapshot.path, signaturePath: snapshot.sigPath });
        } catch (error) {
          if (!res.headersSent) json(res, consoleSnapshotErrorStatus(error), { error: "Console snapshot unavailable", code: CONSOLE_SNAPSHOT_UNAVAILABLE });
        }
        return;
      }

      if (pathname.startsWith("/bridge/")) {
        const state = readStudioState(options.workspace);
        const gatewayBaseUrl = state ? `http://${state.host}:${state.gatewayPort}` : null;
        const handled = await handleBridgeRequest({
          workspace: options.workspace,
          req,
          res,
          url,
          pathname,
          maxRequestBytes: options.maxRequestBytes ?? 1_048_576,
          gatewayBaseUrl
        });
        if (handled) {
          return;
        }
      }

      const lanMode = loadLanMode(options.workspace);
      const lanSig = verifyLanModeSignature(options.workspace);

      if (pathname === "/pair/create" && req.method === "POST") {
        const auth = authenticate(req, options.workspace, options.token);
        if (!auth) {
          json(res, 401, { error: "missing or invalid token" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as { ttlSeconds?: number; ttlMinutes?: number; agentName?: string; mode?: string })
          : {};
        const wantsAgentPair = typeof parsed.agentName === "string" && parsed.agentName.trim().length > 0;
        if (wantsAgentPair) {
          if (!requireRoles({ auth, res, workspace: options.workspace, roles: ["OWNER", "OPERATOR"] })) {
            return;
          }
          const ttlMinutes = Math.max(1, Math.trunc(Number(parsed.ttlMinutes ?? 10)));
          const created = createBridgePairingCode({
            workspace: options.workspace,
            agentName: parsed.agentName!,
            ttlMinutes
          });
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "PAIR_CREATED",
            severity: "LOW",
            payload: {
              pairingId: created.pairingId,
              expiresTs: created.expiresTs,
              mode: "AGENT_BRIDGE",
              agentId: created.agentId
            }
          });
          json(res, 200, {
            code: created.code,
            pairingId: created.pairingId,
            agentId: created.agentId,
            expiresTs: created.expiresTs,
            mode: "AGENT_BRIDGE"
          });
          return;
        }

        if (!requireRoles({ auth, res, workspace: options.workspace, roles: ["OWNER"] })) {
          return;
        }
        if (!lanMode.enabled || !lanMode.requirePairing || !lanSig.valid) {
          json(res, 400, { error: "pairing is not enabled" });
          return;
        }
        const ttlSeconds = Math.max(60, Number(parsed.ttlSeconds ?? 10 * 60));
        const created = createPairingCode({
          workspace: options.workspace,
          ttlMs: ttlSeconds * 1000
        });
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PAIR_CREATED",
          severity: "LOW",
          payload: {
            pairingId: created.id,
            expiresTs: created.expiresTs,
            mode: "LAN_LOGIN"
          }
        });
        json(res, 200, {
          code: created.code,
          pairingId: created.id,
          expiresTs: created.expiresTs,
          mode: "LAN_LOGIN"
        });
        return;
      }

      if (pathname === "/pair/redeem" && req.method === "POST") {
        if (!pairRedeemLimiter(`pair-redeem:${clientIp}`)) {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "PAIR_REDEEM_RATE_LIMITED",
            severity: "MEDIUM",
            payload: {
              ip: clientIp
            }
          });
          json(res, 429, { error: "pair redemption rate limited" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { code?: string; leaseTtlMinutes?: number }) : {};
        if (!parsed.code || parsed.code.trim().length === 0) {
          json(res, 400, { error: "pairing code is required" });
          return;
        }
        const redeemed = redeemBridgePairingCode({
          workspace: options.workspace,
          code: parsed.code,
          leaseTtlMinutes: parsed.leaseTtlMinutes
        });
        if (!redeemed.ok || !redeemed.lease || !redeemed.payload) {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "PAIR_REDEEM_FAILED",
            severity: "MEDIUM",
            payload: {
              reason: redeemed.error ?? "unknown"
            }
          });
          json(res, 400, { error: redeemed.error ?? "pair redemption failed" });
          return;
        }
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PAIR_REDEEMED",
          severity: "LOW",
          payload: {
            pairingId: redeemed.pairingId,
            agentId: redeemed.payload.agentId,
            leaseId: redeemed.payload.leaseId,
            expiresTs: redeemed.payload.expiresTs
          }
        });
        json(res, 200, {
          ok: true,
          pairingId: redeemed.pairingId,
          agentId: redeemed.payload.agentId,
          workspaceId: redeemed.payload.workspaceId,
          expiresTs: redeemed.payload.expiresTs,
          lease: redeemed.lease
        });
        return;
      }

      if (pathname === "/pair/claim" && req.method === "POST") {
        if (!lanMode.enabled || !lanMode.requirePairing || !lanSig.valid) {
          json(res, 400, { error: "pairing is not enabled" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { code?: string }) : {};
        if (!parsed.code || parsed.code.trim().length === 0) {
          json(res, 400, { error: "pairing code is required" });
          return;
        }
        const claimed = await claimPairingForResponseAsync({
          workspace: options.workspace,
          code: parsed.code.trim(),
          res,
          ttlSeconds: 10 * 60
        });
        if (!claimed.ok) {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "PAIR_EXPIRED",
            severity: "MEDIUM",
            payload: {
              reason: claimed.error ?? "claim failed"
            }
          });
          json(res, 400, { error: claimed.error ?? "pairing failed" });
          return;
        }
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PAIR_CLAIMED",
          severity: "LOW",
          payload: {
            pairingId: claimed.pairingId,
            expiresTs: claimed.expiresTs
          }
        });
        json(res, 200, { ok: true, expiresTs: claimed.expiresTs });
        return;
      }

      if (pathname === "/auth/login" && req.method === "POST") {
        const usersSig = verifyUsersConfigSignature(options.workspace);
        if (!usersSig.valid) {
          json(res, 403, { error: "users config signature invalid; login blocked" });
          return;
        }
        if (lanMode.enabled && lanMode.requirePairing && lanSig.valid) {
          const paired = pairingCookieValid(options.workspace, req.headers.cookie);
          if (!paired) {
            json(res, 403, { error: "pairing required before login" });
            return;
          }
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { username?: string; password?: string }) : {};
        if (!parsed.username || !parsed.password) {
          json(res, 400, { error: "username and password are required" });
          return;
        }
        const authUser = authenticateUser({
          workspace: options.workspace,
          username: parsed.username,
          password: parsed.password
        });
        if (!authUser.ok || !authUser.user) {
          await writeStudioAuditEventAsync({
            workspace: options.workspace,
            auditType: "HUMAN_LOGIN_FAILED",
            severity: "MEDIUM",
            payload: {
              username: parsed.username
            }
          });
          json(res, 401, { error: authUser.error ?? "invalid credentials" });
          return;
        }
        const session = await createSessionAsync({
          workspace: options.workspace,
          user: authUser.user
        });
        const maxAgeSec = Math.max(60, Math.floor((session.payload.expiresTs - Date.now()) / 1000));
        setSessionCookie(res, session.token, maxAgeSec, "/", requestUsesHttps(req));
        await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "HUMAN_LOGIN_SUCCESS",
          severity: "LOW",
          payload: {
            userId: authUser.user.userId,
            username: authUser.user.username,
            roles: authUser.user.roles
          }
        }, () => { if (!verifyTrackedSessionToken({ workspace: options.workspace, token: session.token }).ok) throw new Error("issued login session is no longer current"); });
        json(res, 200, {
          ok: true,
          user: {
            userId: authUser.user.userId,
            username: authUser.user.username,
            roles: authUser.user.roles
          }
        });
        return;
      }

      if (pathname === "/auth/logout" && req.method === "POST") {
        const token = parseCookieHeader(req.headers.cookie, "amc_session");
        if (token) {
          revokeSessionByToken({
            workspace: options.workspace,
            token
          });
        }
        clearSessionCookie(res, "/", requestUsesHttps(req));
        clearPairingCookie(res);
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === "/auth/me" && req.method === "GET") {
        const auth = authenticate(req, options.workspace, options.token);
        if (auth?.isAdmin) {
          json(res, 200, {
            userId: "bootstrap-admin",
            nativeCsrfToken: null,
            username: auth.username ?? "bootstrap-admin",
            roles: [...auth.roles],
            issuedTs: Date.now(),
            expiresTs: Date.now() + 8 * 60 * 60_000
          });
          return;
        }
        const session = sessionFromRequest({
          workspace: options.workspace,
          req
        });
        if (!session.ok || !session.payload) {
          json(res, 401, { error: session.error ?? "not authenticated" });
          return;
        }
        json(res, 200, {
          userId: session.payload.userId,
          nativeCsrfToken: nativeCsrfTokenForSession(session.payload),
          username: session.payload.username,
          roles: session.payload.userId === "local-demo" ? ["VIEWER"] : session.payload.roles,
          issuedTs: session.payload.issuedTs,
          expiresTs: session.payload.expiresTs
        });
        return;
      }

      if (pathname === "/feedback/ingest" && req.method === "POST") {
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const payload = body ? (JSON.parse(body) as unknown) : {};
        const payloadAgentId = (() => {
          if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).agentId === "string") {
            return resolveAgentId(options.workspace, (payload as Record<string, unknown>).agentId as string);
          }
          return null;
        })();
        const sessionAuth = authenticate(req, options.workspace, options.token);
        const canIngestAsOperator =
          sessionAuth && (sessionAuth.isAdmin || hasAnyRole([...sessionAuth.roles], ["OWNER", "OPERATOR"]));
        if (canIngestAsOperator) {
          const ingested = ingestFeedbackOutcome({
            workspace: options.workspace,
            payload,
            attestationKind: "self_attested"
          });
          json(res, 200, {
            ...ingested,
            trustTier: "SELF_REPORTED",
            auth: "session"
          });
          recomputeOrgAndEmit("OUTCOMES_UPDATED", payloadAgentId ? orgNodeIdsForAgent(payloadAgentId) : undefined);
          return;
        }
        const provided = hmacHeaderValue(req);
        const secret = resolveWebhookSecret(options.workspace, "feedback");
        if (!provided || !secret || !verifyHmacSignature(body, secret, provided)) {
          json(res, 401, { error: "invalid feedback webhook authentication" });
          return;
        }
        const ingested = ingestFeedbackOutcome({
          workspace: options.workspace,
          payload,
          attestationKind: "external_report"
        });
        json(res, 200, {
          ...ingested,
          trustTier: "SELF_REPORTED",
          auth: "webhook"
        });
        recomputeOrgAndEmit("OUTCOMES_UPDATED", payloadAgentId ? orgNodeIdsForAgent(payloadAgentId) : undefined);
        return;
      }

      if (pathname === "/outcomes/ingest" && req.method === "POST") {
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const payload = body ? (JSON.parse(body) as unknown) : {};
        const payloadAgentId = (() => {
          if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).agentId === "string") {
            return resolveAgentId(options.workspace, (payload as Record<string, unknown>).agentId as string);
          }
          return null;
        })();
        const sessionAuth = authenticate(req, options.workspace, options.token);
        const canIngestAsOperator =
          sessionAuth && (sessionAuth.isAdmin || hasAnyRole([...sessionAuth.roles], ["OWNER", "OPERATOR"]));
        if (canIngestAsOperator) {
          const ingested = ingestOutcomeWebhook({
            workspace: options.workspace,
            payload,
            attestationKind: "self_attested",
            sourceLabel: "studio.manual.outcomes.ingest"
          });
          json(res, 200, {
            ...ingested,
            trustTier: "SELF_REPORTED",
            auth: "session"
          });
          recomputeOrgAndEmit("OUTCOMES_UPDATED", payloadAgentId ? orgNodeIdsForAgent(payloadAgentId) : undefined);
          return;
        }
        const provided = hmacHeaderValue(req);
        const secret = resolveWebhookSecret(options.workspace, "outcomes");
        if (!provided || !secret || !verifyHmacSignature(body, secret, provided)) {
          json(res, 401, { error: "invalid outcomes webhook authentication" });
          return;
        }
        const ingested = ingestOutcomeWebhook({
          workspace: options.workspace,
          payload,
          attestationKind: "external_report",
          sourceLabel: "studio.webhook.outcomes.ingest"
        });
        json(res, 200, {
          ...ingested,
          trustTier: "SELF_REPORTED",
          auth: "webhook"
        });
        recomputeOrgAndEmit("OUTCOMES_UPDATED", payloadAgentId ? orgNodeIdsForAgent(payloadAgentId) : undefined);
        return;
      }

      if (pathname === "/value/ingest/webhook" && req.method === "POST") {
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as unknown) : {};
        const sessionAuth = authenticate(req, options.workspace, options.token);
        const canIngestAsOperator =
          sessionAuth && (sessionAuth.isAdmin || hasAnyRole([...sessionAuth.roles], ["OWNER", "OPERATOR"]));
        const webhookToken = req.headers["x-amc-webhook-token"];
        const providedToken = Array.isArray(webhookToken) ? webhookToken[0] : webhookToken;
        const tokenValid = verifyValueWebhookToken(options.workspace, typeof providedToken === "string" ? providedToken : null);
        if (!canIngestAsOperator && !tokenValid) {
          json(res, 401, { error: "value ingest requires OWNER/OPERATOR session or vault-backed webhook token" });
          return;
        }
        // Choose the original session or token basis once; a revoked session never falls back to the token after Sign.
        const expected = sessionAuth ? { isAdmin: sessionAuth.isAdmin, userId: sessionAuth.userId, agentId: sessionAuth.agentId } : null;
        const originalToken = typeof providedToken === "string" ? providedToken : "";
        const beforePublish = () => {
          if (canIngestAsOperator) {
            const current = authenticate(req, options.workspace, options.token);
            if (!current || !expected || current.isAdmin !== expected.isAdmin || current.userId !== expected.userId || current.agentId !== expected.agentId) {
              if (!res.headersSent) json(res, 401, { error: "value ingest session changed while signing" }); throw new Error("value ingest session changed while signing");
            }
            if (!requireRoles({ auth: current, res, workspace: options.workspace, roles: ["OWNER", "OPERATOR"] })) throw new Error("value ingest role changed while signing");
          } else {
            try { assertValueWebhookTokenCurrent(options.workspace, originalToken); }
            catch (error) { if (!res.headersSent) json(res, 401, { error: "value webhook authority changed while signing" }); throw error; }
          }
        };
        // Sender authentication never upgrades the SELF_REPORTED event trust tier.
        const out = await ingestValueWebhookForApi({ workspace: options.workspace, payload: parsed }, { beforePublish })
          .catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        emitValueSse({
          hub: orgSse,
          type: "VALUE_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      const auth = authenticate(req, options.workspace, options.token);
      if (!auth) {
        json(res, 401, { error: "missing or invalid token" });
        return;
      }
      if (isNativeApprovalMutationPath(pathname, method) && !admitStudioApproval({ req, res, actor: auth,
        allowedOrigins: nativeAllowedBrowserOrigins(options.host, (server.address() as { port?: number } | null)?.port ?? options.port,
          [...(options.corsAllowedOrigins ?? []), ...(options.nativeAllowedOrigins ?? [])]), readOnly: requiresReadOnlyMode(options.workspace) })) return;

      // Bind the authenticated request context once; each route retains its role list. P1-78: approvals record who raised them.
      const initiator = auth.userId ?? (auth.agentId ? `agent:${auth.agentId}` : "unknown");
      const requireRouteRoles = (roles: UserRole[]): boolean =>
        requireRoles({ auth, res, workspace: options.workspace, roles });
      const signingAuthority = (roles: UserRole[]) => currentSigningAuthority(req, res, options.workspace, options.token, auth, roles);
      const assurancePublication = (roles: UserRole[], readOnly = false, vault = false) => { const actor = signingAuthority(roles); return { beforePublish() { actor(); if (readOnly && requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } if (vault && !requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); } }; };
      const auditPublication = (roles: UserRole[], vault = true) => { const actor = signingAuthority(roles); return { beforePublish() { actor(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } if (vault && !requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); } }; };
      const refreshConsole = async () => {
        const recheck = signingAuthority(["OWNER"]);
        try { await writeConsoleSnapshot(options.workspace, recheck); return {}; }
        catch {
          if (res.headersSent) return null;
          try { recheck(); } catch (error) { if (res.headersSent) return null; throw error; }
          return { warning: { code: CONSOLE_SNAPSHOT_UNAVAILABLE } };
        }
      };
      const assertUsersMutationAuthorized = createUsersMutationGuard({ workspace: options.workspace, expected: auth,
        authenticate: () => authenticate(req, options.workspace, options.token), access: accessContext, readOnly: () => requiresReadOnlyMode(options.workspace) });
      const humanAuditAuthority = (requested: UserRole[], needsVault = false) => {
        const roles = [...requested], expected = { isAdmin: auth.isAdmin, userId: auth.userId, agentId: auth.agentId };
        return () => {
          const current = authenticate(req, options.workspace, options.token);
          if (!current || current.isAdmin !== expected.isAdmin || current.userId !== expected.userId || current.agentId !== expected.agentId) throw new Error("human audit actor changed");
          const check = enforceRoleOrAdmin({ access: accessContext(current), requiredAny: roles,
            usersConfigValid: verifyUsersConfigSignature(options.workspace).valid || current.sessionAuthSource === "WORKSPACE_ROUTER" });
          if (!check.ok || requiresReadOnlyMode(options.workspace) || (needsVault && !vaultStatus(options.workspace).unlocked)) throw new Error("human audit actor is no longer authorized");
        };
      };
      const requireUnlockedVaultForSigning = (): boolean => {
        if (vaultStatus(options.workspace).unlocked) return true;
        json(res, 423, { error: "vault locked; unlock required for signing" });
        return false;
      };

      const denyMechanicLeaseAccess = (): boolean => {
        if (!auth.isAdmin && auth.agentId) {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "LEASE_MECHANIC_ACCESS_DENIED",
            severity: "MEDIUM",
            agentId: auth.agentId,
            payload: {
              path: pathname,
              method
            }
          });
          json(res, 403, { error: "lease-auth cannot access mechanic APIs" });
          return true;
        }
        return false;
      };

      const denyAuditLeaseAccess = (): boolean => {
        if (!auth.isAdmin && auth.agentId) {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "LEASE_AUDIT_ACCESS_DENIED",
            severity: "HIGH",
            agentId: auth.agentId,
            payload: {
              path: pathname,
              method
            }
          });
          json(res, 403, { error: "lease-auth cannot access audit APIs" });
          return true;
        }
        return false;
      };

      const denyPassportLeaseAccess = (): boolean => {
        if (!auth.isAdmin && auth.agentId) {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "LEASE_PASSPORT_ACCESS_DENIED",
            severity: "HIGH",
            agentId: auth.agentId,
            payload: {
              path: pathname,
              method
            }
          });
          json(res, 403, { error: "lease-auth cannot access passport APIs" });
          return true;
        }
        return false;
      };

      const denyValueLeaseAccess = (): boolean => {
        if (!auth.isAdmin && auth.agentId) {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "LEASE_VALUE_ACCESS_DENIED",
            severity: "HIGH",
            agentId: auth.agentId,
            payload: {
              path: pathname,
              method
            }
          });
          json(res, 403, { error: "lease-auth cannot access value APIs" });
          return true;
        }
        return false;
      };

      if (pathname === "/status" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const vault = vaultStatus(options.workspace);
        const usersSig = verifyUsersConfigSignature(options.workspace);
        const approvalSig = verifyApprovalPolicySignature(options.workspace);
        const plugins = verifyPluginWorkspace({ workspace: options.workspace });
        const pluginRegistries = verifyPluginRegistriesConfig(options.workspace);
        const trustSig = verifyTrustConfigSignature(options.workspace);
        const assuranceSig = verifyAssurancePolicySignature(options.workspace);
        const auditPolicySig = verifyAuditPolicySignature(options.workspace);
        const auditMapSig = verifyAuditMapActiveSignature(options.workspace);
        const passportSig = verifyPassportPolicySignature(options.workspace);
        const passportGate = (() => {
          try {
            return passportReadinessGate(options.workspace);
          } catch (error) {
            return {
              ok: false,
              reasons: [`PASSPORT_READY_CHECK_FAILED:${String(error)}`],
              warnings: []
            };
          }
        })();
        const standardStatus = standardSchemasForApi(options.workspace);
        try {
          loadValuePolicy(options.workspace);
        } catch {
          // value status remains signature-invalid if policy cannot be loaded
        }
        const valueSig = verifyValuePolicySignature(options.workspace);
        const assuranceGate = (() => {
          try {
            return assuranceReadinessGate(options.workspace);
          } catch (error) {
            return {
              ok: false,
              reasons: [`ASSURANCE_READY_CHECK_FAILED:${String(error)}`],
              warnings: [],
              latestRunId: null,
              latestStatus: null,
              waiver: null
            };
          }
        })();
        const auditGate = (() => {
          try {
            return auditReadinessGate(options.workspace);
          } catch (error) {
            return {
              ok: false,
              reasons: [`AUDIT_READY_CHECK_FAILED:${String(error)}`],
              warnings: []
            };
          }
        })();
        const valueGate = (() => {
          try {
            return valueReadinessGate(options.workspace);
          } catch (error) {
            return {
              ok: false,
              reasons: [`VALUE_READY_CHECK_FAILED:${String(error)}`],
              warnings: []
            };
          }
        })();
        const assuranceCert = assuranceCertLatestForApi(options.workspace);
        const canonSig = verifyCanonSignature(options.workspace);
        const bankSig = verifyDiagnosticBankSignature(options.workspace);
        const cgxSig = verifyCgxPolicySignature(options.workspace);
        const mechanic = verifyMechanicWorkspace(options.workspace);
        const trust = await checkNotaryTrust(options.workspace).catch((error) => ({
          mode: "LOCAL_VAULT" as const,
          ok: false,
          reasons: [`TRUST_CHECK_FAILED:${String(error)}`],
          signatureValid: trustSig.valid,
          notaryReachable: false,
          pinnedFingerprint: null,
          currentFingerprint: null,
          attestationLevel: null,
          attestationBasis: null,
          requiredAttestationLevel: null,
          lastAttestationTs: null
        }));
        json(res, 200, {
          studio: readStudioState(options.workspace),
          vaultLocked: !vault.unlocked,
          usersSignatureValid: usersSig.valid,
          usersSignatureReason: usersSig.reason,
          approvalPolicySignatureValid: approvalSig.valid,
          plugins: {
            ok: plugins.ok,
            errors: plugins.errors,
            registriesSignatureValid: pluginRegistries.valid,
            registriesSignatureReason: pluginRegistries.reason
          },
          assurance: {
            policySignatureValid: assuranceSig.valid,
            policySignatureReason: assuranceSig.reason ?? null,
            readyGateOk: assuranceGate.ok,
            readyGateReasons: assuranceGate.reasons,
            readyGateWarnings: assuranceGate.warnings,
            latestRunId: assuranceGate.latestRunId,
            latestStatus: assuranceGate.latestStatus,
            waiver: assuranceGate.waiver,
            latestCertificate: assuranceCert.latest
              ? {
                  file: assuranceCert.latest.file,
                  sha256: assuranceCert.latest.sha256,
                  status: assuranceCert.latest.cert.status,
                  riskAssuranceScore: assuranceCert.latest.cert.riskAssuranceScore,
                  verifyOk: assuranceCert.latest.verify.ok
                }
              : null
          },
          audit: {
            policySignatureValid: auditPolicySig.valid,
            policySignatureReason: auditPolicySig.reason ?? null,
            mapSignatureValid: auditMapSig.valid,
            mapSignatureReason: auditMapSig.reason ?? null,
            readyGateOk: auditGate.ok,
            readyGateReasons: auditGate.reasons,
            readyGateWarnings: auditGate.warnings
          },
          value: {
            policySignatureValid: valueSig.valid,
            policySignatureReason: valueSig.reason ?? null,
            readyGateOk: valueGate.ok,
            readyGateReasons: valueGate.reasons,
            readyGateWarnings: valueGate.warnings
          },
          passport: {
            policySignatureValid: passportSig.valid,
            policySignatureReason: passportSig.reason ?? null,
            readyGateOk: passportGate.ok,
            readyGateReasons: passportGate.reasons,
            readyGateWarnings: passportGate.warnings
          },
          standard: {
            verifyOk: standardStatus.verify.ok,
            errors: standardStatus.verify.errors,
            schemaCount: standardStatus.schemas.length,
            generatedTs: standardStatus.meta?.generatedTs ?? null
          },
          canon: {
            signatureValid: canonSig.valid,
            signatureReason: canonSig.reason
          },
          diagnosticBank: {
            signatureValid: bankSig.valid,
            signatureReason: bankSig.reason
          },
          cgx: {
            policySignatureValid: cgxSig.valid,
            policySignatureReason: cgxSig.reason
          },
          mechanic: {
            ok: mechanic.ok,
            errors: mechanic.errors,
            targetsSignatureValid: mechanic.targets.valid,
            profilesSignatureValid: mechanic.profiles.valid,
            tuningSignatureValid: mechanic.tuning.valid
          },
          lanMode: {
            enabled: lanMode.enabled,
            requirePairing: lanMode.requirePairing,
            signatureValid: lanSig.valid
          },
          readOnlyMode: requiresReadOnlyMode(options.workspace),
          trust: {
            configSignatureValid: trustSig.valid,
            configSignatureReason: trustSig.reason,
            mode: trust.mode,
            ok: trust.ok,
            reasons: trust.reasons,
            notaryReachable: trust.notaryReachable,
            pinnedFingerprint: trust.pinnedFingerprint,
            currentFingerprint: trust.currentFingerprint,
            attestationLevel: trust.attestationLevel,
            attestationBasis: trust.attestationBasis,
            requiredAttestationLevel: trust.requiredAttestationLevel,
            lastAttestationTs: trust.lastAttestationTs
          }
        });
        return;
      }

      if (pathname === "/trust/status" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const sig = verifyTrustConfigSignature(options.workspace);
        const trust = await checkNotaryTrust(options.workspace).catch((error) => ({
          mode: "LOCAL_VAULT" as const,
          ok: false,
          reasons: [`TRUST_CHECK_FAILED:${String(error)}`],
          signatureValid: sig.valid,
          notaryReachable: false,
          pinnedFingerprint: null,
          currentFingerprint: null,
          attestationLevel: null,
          attestationBasis: null,
          requiredAttestationLevel: null,
          lastAttestationTs: null
        }));
        const tail = trust.mode === "NOTARY"
          ? await fetchNotaryLogTail({
              workspace: options.workspace,
              limit: 20
            })
          : {
              ok: true,
              status: 200,
              entries: [],
              error: null
            };
        json(res, 200, {
          signature: sig,
          trust,
          notaryLogTail: tail
        });
        return;
      }

      if (pathname === "/ops/retention/status" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const status = retentionStatusCli(options.workspace);
        const stats = maintenanceStatsCli(options.workspace);
        setRetentionSegmentsMetric(status.segmentCount);
        setBlobMetrics(stats.blobs.count, stats.blobs.bytes);
        setDbSizeMetric(stats.dbSizeBytes);
        json(res, 200, status);
        return;
      }

      if (pathname === "/ops/retention/run" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { dryRun?: boolean }) : {};
        const currentActor = signingAuthority(["OWNER", "OPERATOR"]), beforePublish = () => {
          currentActor(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("retention caller is read-only"); }
        };
        let result: Awaited<ReturnType<typeof retentionRunStudioAsync>>;
        try { result = await retentionRunStudioAsync(options.workspace, parsed.dryRun === true, beforePublish); beforePublish(); }
        catch (error) { if (res.headersSent) return; throw error; }
        const stats = maintenanceStatsCli(options.workspace);
        setRetentionSegmentsMetric(retentionStatusCli(options.workspace).segmentCount);
        setBlobMetrics(stats.blobs.count, stats.blobs.bytes);
        setDbSizeMetric(stats.dbSizeBytes);
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "OPS_RETENTION_RUN",
          severity: "MEDIUM",
          payload: {
            dryRun: parsed.dryRun === true,
            segmentId: result.segmentId,
            archivedEventCount: result.archivedEventCount,
            prunedEventCount: result.prunedEventCount,
            prunedBlobCount: result.prunedBlobCount,
            username: auth.username ?? null
          }
        }, humanAuditAuthority(["OWNER", "OPERATOR"]));
        json(res, 200, {
          ...result,
          studioAuditEventId: audit.eventId,
          studioAuditReceiptId: audit.receiptId
        });
        return;
      }

      if (pathname === "/ops/maintenance/stats" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const stats = maintenanceStatsCli(options.workspace);
        setRetentionSegmentsMetric(stats.archive.segmentCount);
        setBlobMetrics(stats.blobs.count, stats.blobs.bytes);
        setDbSizeMetric(stats.dbSizeBytes);
        json(res, 200, stats);
        return;
      }

      if (pathname === "/ops/maintenance/vacuum" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const result = maintenanceVacuumCli(options.workspace);
        const stats = maintenanceStatsCli(options.workspace);
        setRetentionSegmentsMetric(stats.archive.segmentCount);
        setBlobMetrics(stats.blobs.count, stats.blobs.bytes);
        setDbSizeMetric(stats.dbSizeBytes);
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "OPS_MAINTENANCE_VACUUM",
          severity: "LOW",
          payload: {
            lastVacuumTs: result.lastVacuumTs,
            username: auth.username ?? null
          }
        }, humanAuditAuthority(["OWNER", "OPERATOR"]));
        json(res, 200, {
          ...result,
          studioAuditEventId: audit.eventId,
          studioAuditReceiptId: audit.receiptId
        });
        return;
      }

      if (pathname === "/ops/maintenance/prune" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const result = maintenancePruneCacheCli(options.workspace);
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "OPS_MAINTENANCE_PRUNE",
          severity: "LOW",
          payload: {
            removedConsoleSnapshots: result.removedConsoleSnapshots.length,
            removedTransformSnapshots: result.removedTransformSnapshots.length,
            removedGenericCacheFiles: result.removedGenericCacheFiles.length,
            username: auth.username ?? null
          }
        }, humanAuditAuthority(["OWNER", "OPERATOR"]));
        json(res, 200, {
          ...result,
          studioAuditEventId: audit.eventId,
          studioAuditReceiptId: audit.receiptId
        });
        return;
      }

      if (pathname === "/ops/backup/status" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        json(res, 200, backupStatusSummary(options.workspace));
        return;
      }

      if (pathname === "/org" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const config = loadOrgConfig(options.workspace);
        json(res, 200, {
          config,
          signature: verifyOrgConfigSignature(options.workspace),
          tree: nodeHierarchy(config)
        });
        return;
      }

      if (pathname === "/org/roles" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const roles = orgRunRoleDefinitions();
        json(res, 200, { roles, total: roles.length });
        return;
      }

      if (pathname === "/org/runs" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const runs = listOrgRuns({ workspace: options.workspace, limit: 25, redacted: true });
        json(res, 200, {
          runs,
          summaries: runs.map((run) => orgRunSummaryForUi(run)),
          total: runs.length
        });
        return;
      }

      if (pathname === "/org/runs" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as {
          roles?: string[] | string;
          goal?: string;
          orgRunId?: string;
          heartbeatPolicy?: {
            intervalMinutes?: number;
            maxStaleMinutes?: number;
            plateauAfterHeartbeats?: number;
          };
        }) : {};
        const result = runOrg({
          workspace: options.workspace,
          roles: parseOrgRoleList(parsed.roles),
          goal: parsed.goal,
          orgRunId: parsed.orgRunId,
          heartbeatPolicy: parsed.heartbeatPolicy,
          source: "studio",
          command: "Studio org run"
        });
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "ORG_RUN_CREATED",
          severity: result.artifact.status === "completed" ? "LOW" : "MEDIUM",
          payload: {
            orgRunId: result.artifact.orgRunId,
            roleCount: result.artifact.summary.roleCount,
            status: result.artifact.status
          }
        }, humanAuditAuthority(["OWNER", "OPERATOR"]));
        emitOrgEvent("ORG_RUN_CREATED");
        json(res, 201, {
          ...result,
          summary: orgRunSummaryForUi(result.artifact),
          auditEventId: audit.eventId
        });
        return;
      }

      const orgRunGetMatch = pathname.match(/^\/org\/runs\/([^/]+)$/);
      if (orgRunGetMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const run = loadOrgRun({
          workspace: options.workspace,
          selector: decodeURIComponent(orgRunGetMatch[1]!),
          redacted: true
        });
        json(res, 200, { run, summary: orgRunSummaryForUi(run) });
        return;
      }

      if (pathname === "/org/scorecards/latest" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const latest = loadLatestOrgScorecard(options.workspace);
        if (!latest) {
          json(res, 404, { error: "no scorecard computed yet" });
          return;
        }
        json(res, 200, latest);
        return;
      }

      if (pathname === "/org/scorecards/recompute" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { window?: string }) : {};
        const out = await recomputeOrgScorecardsApiAsync({
          workspace: options.workspace,
          window: parsed.window ?? "14d"
        }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) });
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "ORG_SCORECARD_UPDATED",
          severity: "LOW",
          payload: {
            window: parsed.window ?? "14d",
            latestPath: out.latestPath,
            latestSigPath: out.latestSigPath
          }
        }, humanAuditAuthority(["OWNER", "OPERATOR"], true));
        emitOrgEvent("ORG_SCORECARD_UPDATED");
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/org/nodes" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as { id?: string; type?: string; name?: string; parentId?: string | null })
          : {};
        if (!parsed.id || !parsed.type || !parsed.name) {
          json(res, 400, { error: "id, type, and name are required" });
          return;
        }
        const type = String(parsed.type).toUpperCase();
        if (!["ENTERPRISE", "TEAM", "FUNCTION", "PROCESS", "ECOSYSTEM"].includes(type)) {
          json(res, 400, { error: "invalid node type" });
          return;
        }
        const orgUpdate = prepareOrgConfigUpdateLog(options.workspace, signingAuthority(["OWNER"]), humanAuditAuthority(["OWNER"], true));
        const saved = await addOrgNodeAsync({
          workspace: options.workspace,
          id: parsed.id,
          type: type as "ENTERPRISE" | "TEAM" | "FUNCTION" | "PROCESS" | "ECOSYSTEM",
          name: parsed.name,
          parentId: parsed.parentId ?? null
        }, { beforePublish: orgUpdate.assertCurrent });
        const orgLog = orgUpdate.published(saved.path, saved.config);
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "ORG_NODE_ADDED",
          severity: "LOW",
          payload: {
            nodeId: parsed.id,
            nodeType: type
          }
        }, humanAuditAuthority(["OWNER"], true));
        await orgLog.append(`node_${parsed.id}`, audit.eventId);
        await recomputeOwnedOrgAndEmit([parsed.id], orgLog.beforeRecompute);
        json(res, 200, {
          path: saved.path,
          sigPath: saved.sigPath,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/org/assign" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; nodeId?: string; weight?: number }) : {};
        if (!parsed.agentId || !parsed.nodeId) {
          json(res, 400, { error: "agentId and nodeId are required" });
          return;
        }
        const orgUpdate = prepareOrgConfigUpdateLog(options.workspace, signingAuthority(["OWNER"]), humanAuditAuthority(["OWNER"], true));
        const saved = await assignAgentToNodeAsync({
          workspace: options.workspace,
          agentId: parsed.agentId,
          nodeId: parsed.nodeId,
          weight: parsed.weight ?? 1
        }, { beforePublish: orgUpdate.assertCurrent });
        const orgLog = orgUpdate.published(saved.path, saved.config);
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "ORG_AGENT_ASSIGNED",
          severity: "LOW",
          payload: {
            agentId: parsed.agentId,
            nodeId: parsed.nodeId,
            weight: parsed.weight ?? 1
          }
        }, humanAuditAuthority(["OWNER"], true));
        await orgLog.append(`assign_${parsed.agentId}_${parsed.nodeId}`, audit.eventId);
        await recomputeOwnedOrgAndEmit([parsed.nodeId], orgLog.beforeRecompute);
        json(res, 200, {
          path: saved.path,
          sigPath: saved.sigPath,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/org/unassign" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; nodeId?: string }) : {};
        if (!parsed.agentId || !parsed.nodeId) {
          json(res, 400, { error: "agentId and nodeId are required" });
          return;
        }
        const orgUpdate = prepareOrgConfigUpdateLog(options.workspace, signingAuthority(["OWNER"]), humanAuditAuthority(["OWNER"], true));
        const saved = await unassignAgentFromNodeAsync({
          workspace: options.workspace,
          agentId: parsed.agentId,
          nodeId: parsed.nodeId
        }, { beforePublish: orgUpdate.assertCurrent });
        const orgLog = orgUpdate.published(saved.path, saved.config);
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "ORG_AGENT_UNASSIGNED",
          severity: "LOW",
          payload: {
            agentId: parsed.agentId,
            nodeId: parsed.nodeId
          }
        }, humanAuditAuthority(["OWNER"], true));
        await orgLog.append(`unassign_${parsed.agentId}_${parsed.nodeId}`, audit.eventId);
        await recomputeOwnedOrgAndEmit([parsed.nodeId], orgLog.beforeRecompute);
        json(res, 200, {
          path: saved.path,
          sigPath: saved.sigPath,
          auditEventId: audit.eventId
        });
        return;
      }

      const orgNodeMatch = pathname.match(/^\/org\/nodes\/([^/]+)$/);
      if (orgNodeMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const nodeId = decodeURIComponent(orgNodeMatch[1] ?? "");
        const config = loadOrgConfig(options.workspace);
        const scorecard = computeOrgScorecard({
          workspace: options.workspace,
          window: url.searchParams.get("window") ?? "14d",
          config
        });
        const node = scorecard.nodes.find((row) => row.nodeId === nodeId);
        if (!node) {
          json(res, 404, { error: "node not found" });
          return;
        }
        json(res, 200, {
          node,
          orgNode: config.nodes.find((item) => item.id === nodeId) ?? null
        });
        return;
      }

      const orgNodeScoreMatch = pathname.match(/^\/org\/nodes\/([^/]+)\/scorecard$/);
      if (orgNodeScoreMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const nodeId = decodeURIComponent(orgNodeScoreMatch[1] ?? "");
        const scorecard = computeOrgScorecard({
          workspace: options.workspace,
          window: url.searchParams.get("window") ?? "14d"
        });
        const node = scorecard.nodes.find((row) => row.nodeId === nodeId);
        if (!node) {
          json(res, 404, { error: "node not found" });
          return;
        }
        const compareTo = url.searchParams.get("compareTo");
        if (compareTo) {
          json(res, 200, {
            node,
            comparison: compareNodeScorecards(scorecard, nodeId, compareTo)
          });
          return;
        }
        json(res, 200, {
          node,
          scorecard
        });
        return;
      }

      if (pathname === "/org/commitments/generate" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { nodeId?: string; kind?: string; days?: number }) : {};
        if (!parsed.nodeId) {
          json(res, 400, { error: "nodeId is required" });
          return;
        }
        const kind = (parsed.kind ?? "commit").toLowerCase();
        const out = await generateOrgEocAsync({ workspace: options.workspace, nodeId: parsed.nodeId,
          type: kind === "learn" ? "learn" : kind === "own" ? "own" : "commit", window: "14d",
          days: parsed.days === 14 || parsed.days === 30 || parsed.days === 90 ? parsed.days : 30 },
        { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) });
        const audit = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "ORG_COMMITMENT_GENERATED",
          severity: "LOW",
          payload: {
            nodeId: parsed.nodeId,
            kind,
            outPath: out.outPath
          }
        }, humanAuditAuthority(["OWNER", "OPERATOR"], true));
        emitOrgEvent("ORG_SCORECARD_UPDATED", [parsed.nodeId]);
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      const orgCommitmentGetMatch = pathname.match(/^\/org\/commitments\/([^/]+)\/([^/]+)$/);
      if (orgCommitmentGetMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const nodeId = decodeURIComponent(orgCommitmentGetMatch[1] ?? "");
        const commitId = decodeURIComponent(orgCommitmentGetMatch[2] ?? "");
        const path = join(options.workspace, ".amc", "org", "commitments", nodeId, `${commitId}.md`);
        if (!pathExists(path)) {
          json(res, 404, { error: "commitment not found" });
          return;
        }
        json(res, 200, {
          nodeId,
          commitId,
          path,
          content: readUtf8(path)
        });
        return;
      }

      if (pathname === "/transform/map" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, getTransformMapForApi(options.workspace));
        return;
      }

      if (pathname === "/transform/map/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { map?: unknown }) : {};
        if (!parsed.map || typeof parsed.map !== "object") {
          json(res, 400, { error: "map payload is required" });
          return;
        }
        const applied = await applyTransformMapForApiAsync({
          workspace: options.workspace,
          map: parsed.map as ReturnType<typeof getTransformMapForApi>["map"]
        }, { beforePublish: () => {
          signingAuthority(["OWNER"])();
          if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); }
          if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing");
        } });
        if (res.headersSent) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "TRANSFORM_MAP_UPDATED",
          severity: "LOW",
          payload: {
            path: applied.path,
            sigPath: applied.sigPath
          }
        });
        emitOrgEvent("TRANSFORM_PLAN_UPDATED");
        json(res, 200, {
          ...applied,
          auditEventId: audit.eventId
        });
        return;
      }

      const agentTransformMatch = pathname.match(/^\/agents\/([^/]+)\/transform\/latest$/);
      if (agentTransformMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentTransformMatch[1] ?? "default"));
        const out = getLatestAgentTransformPlanForApi({
          workspace: options.workspace,
          agentId
        });
        json(res, 200, out);
        return;
      }

      const agentTransformPlanMatch = pathname.match(/^\/agents\/([^/]+)\/transform\/plan$/);
      if (agentTransformPlanMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentTransformPlanMatch[1] ?? "default"));
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as { to?: "targets" | "excellence" | "custom"; window?: string; preview?: boolean; targetOverride?: Record<string, number> })
          : {};
        const out = await createAgentTransformPlanForApiAsync({
          workspace: options.workspace,
          agentId,
          to: parsed.to ?? "targets",
          window: parsed.window ?? "14d",
          preview: parsed.preview === true,
          targetOverride: parsed.targetOverride
        }, { beforePublish: () => {
          signingAuthority(["OWNER", "OPERATOR"])();
          if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); }
          if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing");
        } });
        if (res.headersSent) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "TRANSFORM_PLAN_CREATED",
          severity: "LOW",
          payload: {
            agentId,
            planId: out.plan.planId,
            preview: parsed.preview === true
          }
        });
        emitOrgEvent("TRANSFORM_PLAN_CREATED", orgNodeIdsForAgent(agentId));
        json(res, 200, {
          ...out,
          markdown: renderTransformReportMarkdown(out.plan),
          auditEventId: audit.eventId
        });
        return;
      }

      const agentTransformTrackMatch = pathname.match(/^\/agents\/([^/]+)\/transform\/track$/);
      if (agentTransformTrackMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentTransformTrackMatch[1] ?? "default"));
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { window?: string }) : {};
        const out = await trackAgentTransformPlanForApiAsync({
          workspace: options.workspace,
          agentId,
          window: parsed.window
        }, { beforePublish: () => {
          signingAuthority(["OWNER", "OPERATOR"])();
          if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); }
          if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing");
        } });
        if (res.headersSent) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "TRANSFORM_PLAN_UPDATED",
          severity: "LOW",
          payload: {
            agentId,
            planId: out.after.planId,
            changed: out.changed
          }
        });
        emitOrgEvent("TRANSFORM_PLAN_UPDATED", orgNodeIdsForAgent(agentId));
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      const agentTransformAttestMatch = pathname.match(/^\/agents\/([^/]+)\/transform\/attest$/);
      if (agentTransformAttestMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "AUDITOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentTransformAttestMatch[1] ?? "default"));
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { taskId?: string; statement?: string; files?: string[]; evidenceLinks?: string[] }) : {};
        if (!parsed.taskId || !parsed.statement) {
          json(res, 400, { error: "taskId and statement are required" });
          return;
        }
        const role: "OWNER" | "AUDITOR" = auth.roles.has("AUDITOR") ? "AUDITOR" : "OWNER";
        const out = await attestAgentTransformTaskForApiAsync({
          workspace: options.workspace,
          agentId,
          taskId: parsed.taskId,
          statement: parsed.statement,
          files: Array.isArray(parsed.files) ? parsed.files : [],
          evidenceLinks: Array.isArray(parsed.evidenceLinks) ? parsed.evidenceLinks : [],
          createdByUser: auth.username ?? "owner",
          role
        }, { beforePublish: () => {
          signingAuthority([role])();
          if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); }
          if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing");
        } });
        if (res.headersSent) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "TRANSFORM_TASK_ATTESTED",
          severity: "LOW",
          payload: {
            agentId,
            attestationId: out.attestation.attestationId,
            taskId: parsed.taskId,
            role
          }
        });
        emitOrgEvent("TRANSFORM_TASK_ATTESTED", orgNodeIdsForAgent(agentId));
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      const nodeTransformLatestMatch = pathname.match(/^\/org\/nodes\/([^/]+)\/transform\/latest$/);
      if (nodeTransformLatestMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const nodeId = decodeURIComponent(nodeTransformLatestMatch[1] ?? "");
        const out = getLatestNodeTransformPlanForApi({
          workspace: options.workspace,
          nodeId
        });
        json(res, 200, out);
        return;
      }

      const nodeTransformPlanMatch = pathname.match(/^\/org\/nodes\/([^/]+)\/transform\/plan$/);
      if (nodeTransformPlanMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const nodeId = decodeURIComponent(nodeTransformPlanMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as { to?: "targets" | "excellence" | "custom"; window?: string; preview?: boolean; targetOverride?: Record<string, number> })
          : {};
        const out = await createNodeTransformPlanForApiAsync({
          workspace: options.workspace,
          nodeId,
          to: parsed.to ?? "targets",
          window: parsed.window ?? "14d",
          preview: parsed.preview === true,
          targetOverride: parsed.targetOverride
        }, { beforePublish: () => {
          signingAuthority(["OWNER", "OPERATOR"])();
          if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); }
          if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing");
        } });
        if (res.headersSent) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "TRANSFORM_PLAN_CREATED",
          severity: "LOW",
          payload: {
            nodeId,
            planId: out.plan.planId,
            preview: parsed.preview === true
          }
        });
        emitOrgEvent("TRANSFORM_PLAN_CREATED", [nodeId]);
        json(res, 200, {
          ...out,
          markdown: renderTransformReportMarkdown(out.plan),
          auditEventId: audit.eventId
        });
        return;
      }

      const nodeTransformTrackMatch = pathname.match(/^\/org\/nodes\/([^/]+)\/transform\/track$/);
      if (nodeTransformTrackMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const nodeId = decodeURIComponent(nodeTransformTrackMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { window?: string }) : {};
        const out = await trackNodeTransformPlanForApiAsync({
          workspace: options.workspace,
          nodeId,
          window: parsed.window
        }, { beforePublish: () => {
          signingAuthority(["OWNER", "OPERATOR"])();
          if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); }
          if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing");
        } });
        if (res.headersSent) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "TRANSFORM_PLAN_UPDATED",
          severity: "LOW",
          payload: {
            nodeId,
            planId: out.after.planId,
            changed: out.changed
          }
        });
        emitOrgEvent("TRANSFORM_PLAN_UPDATED", [nodeId]);
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      const nodeTransformAttestMatch = pathname.match(/^\/org\/nodes\/([^/]+)\/transform\/attest$/);
      if (nodeTransformAttestMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "AUDITOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const nodeId = decodeURIComponent(nodeTransformAttestMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { taskId?: string; statement?: string; files?: string[]; evidenceLinks?: string[] }) : {};
        if (!parsed.taskId || !parsed.statement) {
          json(res, 400, { error: "taskId and statement are required" });
          return;
        }
        const role: "OWNER" | "AUDITOR" = auth.roles.has("AUDITOR") ? "AUDITOR" : "OWNER";
        const out = await attestNodeTransformTaskForApiAsync({
          workspace: options.workspace,
          nodeId,
          taskId: parsed.taskId,
          statement: parsed.statement,
          files: Array.isArray(parsed.files) ? parsed.files : [],
          evidenceLinks: Array.isArray(parsed.evidenceLinks) ? parsed.evidenceLinks : [],
          createdByUser: auth.username ?? "owner",
          role
        }, { beforePublish: () => {
          signingAuthority([role])();
          if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); }
          if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing");
        } });
        if (res.headersSent) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "TRANSFORM_TASK_ATTESTED",
          severity: "LOW",
          payload: {
            nodeId,
            attestationId: out.attestation.attestationId,
            taskId: parsed.taskId,
            role
          }
        });
        emitOrgEvent("TRANSFORM_TASK_ATTESTED", [nodeId]);
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/canon" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, canonGetForApi(options.workspace));
        return;
      }

      if (pathname === "/canon/verify" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, canonVerifyForApi(options.workspace));
        return;
      }

      if (pathname === "/canon/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { canon?: unknown }) : {};
        if (!parsed.canon || typeof parsed.canon !== "object") {
          json(res, 400, { error: "canon object is required" });
          return;
        }
        const actorCurrent = signingAuthority(["OWNER"]), beforePublish = () => { actorCurrent(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); };
        const applied = await canonApplyForPublicationAsync({
          workspace: options.workspace,
          canon: parsed.canon as ReturnType<typeof canonGetForApi>["canon"]
        }, { beforePublish }).catch(error => { if (res.headersSent) return null; throw error; }); if (applied === null) return;
        const out = applied.result;
        let audit: ReturnType<typeof writeStudioAuditEvent>;
        try { applied.assertCurrent(); audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "CANON_APPLIED",
          severity: "LOW",
          payload: {
            path: out.path,
            sigPath: out.sigPath
          }
        }); } catch (cause) { throw new CanonAuditIncompleteError(Object.freeze([out.path, out.sigPath]), cause); }
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/cgx/policy" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const out = await cgxPolicyForApi(options.workspace, { beforePublish: signingAuthority(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/cgx/policy/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { policy?: unknown }) : {};
        if (!parsed.policy || typeof parsed.policy !== "object") {
          json(res, 400, { error: "policy object is required" });
          return;
        }
        const out = await cgxPolicyApplyForApi({
          workspace: options.workspace,
          policy: parsed.policy as Awaited<ReturnType<typeof cgxPolicyForApi>>["policy"]
        }, { beforePublish: () => { signingAuthority(["OWNER"])(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } } }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "CGX_POLICY_APPLIED",
          severity: "LOW",
          payload: {
            path: out.path,
            sigPath: out.sigPath
          }
        });
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/cgx/build" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { scope?: string; targetId?: string | null }) : {};
        const scopeRaw = String(parsed.scope ?? url.searchParams.get("scope") ?? "workspace").toLowerCase();
        if (scopeRaw !== "workspace" && scopeRaw !== "agent") {
          json(res, 400, { error: "scope must be workspace|agent" });
          return;
        }
        const targetId = typeof parsed.targetId === "string" ? parsed.targetId : url.searchParams.get("targetId");
        const built = await cgxBuildForApi({
          workspace: options.workspace,
          scope: scopeRaw as "workspace" | "agent",
          targetId
        }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (built === null) return;
        emitCgxSse({
          hub: orgSse,
          type: "CGX_GRAPH_UPDATED"
        });
        if (scopeRaw === "agent") {
          emitCgxSse({
            hub: orgSse,
            type: "CGX_PACK_UPDATED"
          });
        }
        json(res, 200, built);
        return;
      }

      if (pathname === "/cgx/graph/latest" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const scopeRaw = String(url.searchParams.get("scope") ?? "workspace").toLowerCase();
        if (scopeRaw !== "workspace" && scopeRaw !== "agent") {
          json(res, 400, { error: "scope must be workspace|agent" });
          return;
        }
        const targetId = url.searchParams.get("targetId");
        json(
          res,
          200,
          cgxLatestGraphForApi({
            workspace: options.workspace,
            scope: scopeRaw as "workspace" | "agent",
            targetId
          })
        );
        return;
      }

      if (pathname === "/cgx/pack/latest" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = url.searchParams.get("agentId");
        json(
          res,
          200,
          cgxLatestPackForApi({
            workspace: options.workspace,
            agentId
          })
        );
        return;
      }

      if (pathname === "/cgx/verify" && req.method === "GET") {
        if (!requireRouteRoles(["AUDITOR", "OWNER", "OPERATOR", "VIEWER"])) {
          return;
        }
        json(res, 200, cgxVerifyForApi(options.workspace));
        return;
      }

      if (pathname === "/prompt/policy" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])) {
          return;
        }
        const out = await promptPolicyForApi(options.workspace, { beforePublish: signingAuthority(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/prompt/verify" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])) {
          return;
        }
        json(res, 200, promptVerifyForApi(options.workspace));
        return;
      }

      if (pathname === "/prompt/policy/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { policy?: unknown; reason?: unknown }) : {};
        if (!parsed.policy || typeof parsed.policy !== "object") {
          json(res, 400, { error: "policy object is required" });
          return;
        }
        const out = await promptPolicyApplyForApi({
          workspace: options.workspace,
          policy: promptPolicySchema.parse(parsed.policy),
          reason: typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason : "prompt policy update",
          actor: auth.username ?? "owner"
        }, { beforePublish: () => { signingAuthority(["OWNER"])(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("prompt signing is read-only"); } if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); } }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        emitPromptPackSse({
          hub: orgSse,
          type: "PROMPT_POLICY_UPDATED"
        });
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PROMPT_POLICY_APPLIED",
          severity: "LOW",
          payload: {
            path: out.path,
            sigPath: out.sigPath,
            reason: out.reason
          }
        });
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/prompt/status" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])) {
          return;
        }
        const agents = await promptStatusForApi(options.workspace, { beforePublish: signingAuthority(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (agents === null) return;
        json(res, 200, { agents });
        return;
      }

      if (pathname === "/prompt/pack/build" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: unknown }) : {};
        const out = await buildPromptPackForApi({
          workspace: options.workspace,
          agentId: typeof parsed.agentId === "string" ? parsed.agentId : undefined
        }, { beforePublish: () => { signingAuthority(["OWNER", "OPERATOR"])(); if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); } }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        emitPromptPackSse({
          hub: orgSse,
          type: "PROMPT_PACK_UPDATED"
        });
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PROMPT_PACK_CREATED",
          severity: "LOW",
          payload: {
            agentId: out.agentId,
            packId: out.pack.packId,
            sha256: out.sha256
          }
        });
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/prompt/pack/show" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const providerRaw = (url.searchParams.get("provider") ?? "generic").toLowerCase();
        if (!["openai", "anthropic", "gemini", "xai", "openrouter", "generic"].includes(providerRaw)) {
          json(res, 400, { error: "provider must be openai|anthropic|gemini|xai|openrouter|generic" });
          return;
        }
        const format = (url.searchParams.get("format") ?? "text").toLowerCase() === "json" ? "json" : "text";
        json(res, 200, {
          agentId,
          provider: providerRaw,
          format,
          value: promptShowForApi({
            workspace: options.workspace,
            agentId,
            provider: providerRaw as "openai" | "anthropic" | "gemini" | "xai" | "openrouter" | "generic",
            format
          })
        });
        return;
      }

      if (pathname === "/prompt/pack/diff" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        json(res, 200, promptDiffForApi({
          workspace: options.workspace,
          agentId
        }));
        return;
      }

      if (pathname === "/prompt/scheduler" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])) {
          return;
        }
        json(res, 200, promptSchedulerStatusForApi(options.workspace));
        return;
      }

      if (pathname === "/prompt/scheduler/run-now" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agent?: unknown }) : {};
        const out = await promptSchedulerRunNowForApi({
          workspace: options.workspace,
          agent: typeof parsed.agent === "string" && parsed.agent.trim().length > 0 ? parsed.agent : "all"
        }, { beforePublish: () => { signingAuthority(["OWNER", "OPERATOR"])(); if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); } }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        emitPromptPackSse({
          hub: orgSse,
          type: "PROMPT_PACK_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/prompt/scheduler/enable" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await promptSchedulerSetEnabledForApi({ workspace: options.workspace, enabled: true }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/prompt/scheduler/disable" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await promptSchedulerSetEnabledForApi({ workspace: options.workspace, enabled: false }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/forecast/policy" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, getForecastPolicyForApi(options.workspace));
        return;
      }

      if (pathname === "/forecast/policy/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { policy?: unknown }) : {};
        if (!parsed.policy || typeof parsed.policy !== "object") {
          json(res, 400, { error: "policy object is required" });
          return;
        }
        const authority = signingAuthority(["OWNER"]);
        const beforePublish = () => {
          authority();
          if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("forecast read-only gate changed while signing"); }
          if (!requireUnlockedVaultForSigning()) throw new Error("forecast vault entry gate changed while signing");
        };
        const out = await applyForecastPolicyForApiForAuthority({
          workspace: options.workspace,
          policy: parsed.policy as ReturnType<typeof getForecastPolicyForApi>["policy"]
        }, beforePublish)
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "FORECAST_POLICY_APPLIED",
          severity: "LOW",
          payload: {
            path: out.path,
            sigPath: out.sigPath
          }
        });
        emitOrgEvent("FORECAST_UPDATED");
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/forecast/latest" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const scopeRaw = (url.searchParams.get("scope") ?? "workspace").toLowerCase();
        if (scopeRaw !== "workspace" && scopeRaw !== "agent" && scopeRaw !== "node") {
          json(res, 400, { error: "scope must be workspace|agent|node" });
          return;
        }
        const targetId = url.searchParams.get("targetId");
        const forecast = getForecastLatestForApi({
          workspace: options.workspace,
          scope: scopeRaw as "workspace" | "agent" | "node",
          targetId
        });
        const format = (url.searchParams.get("format") ?? "json").toLowerCase();
        if (format === "md") {
          res.statusCode = 200;
          res.setHeader("content-type", "text/markdown; charset=utf-8");
          res.end(renderForecastMarkdown(forecast));
          return;
        }
        json(res, 200, forecast);
        return;
      }

      if (pathname === "/forecast/refresh" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { scope?: string; targetId?: string | null }) : {};
        const scopeRaw = String(parsed.scope ?? url.searchParams.get("scope") ?? "workspace").toLowerCase();
        if (scopeRaw !== "workspace" && scopeRaw !== "agent" && scopeRaw !== "node") {
          json(res, 400, { error: "scope must be workspace|agent|node" });
          return;
        }
        const targetId = typeof parsed.targetId === "string" ? parsed.targetId : url.searchParams.get("targetId");
        const authority = signingAuthority(["OWNER", "OPERATOR"]);
        const beforePublish = () => {
          authority();
          if (!requireUnlockedVaultForSigning()) throw new Error("forecast vault entry gate changed while signing");
        };
        const out = await refreshForecastForAuthority({
          workspace: options.workspace,
          scope: scopeRaw as "workspace" | "agent" | "node",
          targetId
        }, beforePublish)
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "FORECAST_CREATED",
          severity: out.forecast.status === "INSUFFICIENT_EVIDENCE" ? "MEDIUM" : "LOW",
          payload: {
            scopeType: out.forecast.scope.type,
            scopeId: out.forecast.scope.id,
            status: out.forecast.status,
            advisories: out.advisories.length
          }
        });
        emitForecastEvents({
          agentId: out.forecast.scope.type === "AGENT" ? out.forecast.scope.id : null,
          advisories: out.advisories.map((advisory) => ({
            severity: advisory.severity,
            category: advisory.category
          })),
          status: out.forecast.status
        });
        json(res, 200, {
          ...out,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/forecast/scheduler/status" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, forecastSchedulerStatusForApi(options.workspace));
        return;
      }

      if (pathname === "/forecast/scheduler/run-now" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const authority = signingAuthority(["OWNER", "OPERATOR"]);
        const beforePublish = () => {
          authority();
          if (!requireUnlockedVaultForSigning()) throw new Error("forecast vault entry gate changed while signing");
        };
        const out = await forecastSchedulerRunNowForApiForAuthority({
          workspace: options.workspace
        }, beforePublish)
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        emitOrgEvent("FORECAST_UPDATED");
        json(res, 200, out);
        return;
      }

      if (pathname === "/forecast/scheduler/enable" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await forecastSchedulerSetEnabledForApiForAuthority({
          workspace: options.workspace,
          enabled: true
        }, signingAuthority(["OWNER", "OPERATOR"]))
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        json(res, 200, out);
        return;
      }

      if (pathname === "/forecast/scheduler/disable" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await forecastSchedulerSetEnabledForApiForAuthority({
          workspace: options.workspace,
          enabled: false
        }, signingAuthority(["OWNER", "OPERATOR"]))
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/policy" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const out = await assurancePolicyForApi(options.workspace, assurancePublication(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return; json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/policy/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { policy?: unknown }) : {};
        if (!parsed.policy || typeof parsed.policy !== "object") {
          json(res, 400, { error: "policy object is required" });
          return;
        }
        const out = await assurancePolicyApplyForApi({
          workspace: options.workspace,
          policy: parsed.policy
        }, assurancePublication(["OWNER"], true, true)).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "ASSURANCE_POLICY_APPLIED",
          severity: "LOW",
          payload: {
            path: out.path,
            sigPath: out.sigPath
          }
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/run" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              scope?: unknown;
              id?: unknown;
              pack?: unknown;
              windowDays?: unknown;
            })
          : {};
        const scopeRaw = String(parsed.scope ?? "workspace").toLowerCase();
        if (scopeRaw !== "workspace" && scopeRaw !== "node" && scopeRaw !== "agent") {
          json(res, 400, { error: "scope must be workspace|node|agent" });
          return;
        }
        const packRaw = String(parsed.pack ?? "all");
        const availablePackIds = new Set(listAssurancePacks().map((pack) => pack.id));
        if (packRaw !== "all" && !availablePackIds.has(packRaw)) {
          json(res, 400, {
            error: `pack must be all or one of: ${[...availablePackIds].sort((a, b) => a.localeCompare(b)).join("|")}`
          });
          return;
        }
        const authority = captureReportSigningAuthority(options.workspace, signingAuthority(["OWNER", "OPERATOR"]));
        const out = await assuranceRunForApi({
          workspace: options.workspace,
          scopeType: scopeRaw.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT",
          scopeId: typeof parsed.id === "string" ? parsed.id : undefined,
          pack: packRaw,
          windowDays: Number.isFinite(Number(parsed.windowDays)) ? Number(parsed.windowDays) : undefined
        }, { beforePublish() { authority(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); } }).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; });
        if (out === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "ASSURANCE_RUN_COMPLETED",
          severity: out.run.score.pass ? "LOW" : "HIGH",
          payload: {
            runId: out.run.runId,
            scope: out.run.scope,
            status: out.run.score.status,
            riskAssuranceScore: out.run.score.riskAssuranceScore,
            findingCounts: out.run.score.findingCounts
          }
        });
        emitAssuranceSse({
          hub: orgSse,
          type: "ASSURANCE_RUN_UPDATED"
        });
        emitOrgEvent("ASSURANCE_RUN_COMPLETED");
        if (!out.run.score.pass) {
          emitAssuranceSse({
            hub: orgSse,
            type: "ASSURANCE_THRESHOLD_BREACH"
          });
        }
        json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/runs" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, {
          runs: assuranceRunsForApi(options.workspace)
        });
        return;
      }

      const assuranceRunMatch = pathname.match(/^\/assurance\/runs\/([^/]+)$/);
      if (assuranceRunMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const runId = decodeURIComponent(assuranceRunMatch[1] ?? "");
        const detail = assuranceRunDetailForApi({
          workspace: options.workspace,
          runId
        });
        if (!detail.run) {
          json(res, 404, { error: "run not found" });
          return;
        }
        json(res, 200, detail);
        return;
      }

      if (pathname === "/assurance/cert/issue" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { runId?: unknown; outFile?: unknown }) : {};
        if (typeof parsed.runId !== "string" || parsed.runId.length === 0) {
          json(res, 400, { error: "runId is required" });
          return;
        }
        const out = await assuranceCertIssueForApi({
          workspace: options.workspace,
          runId: parsed.runId,
          outFile: typeof parsed.outFile === "string" ? parsed.outFile : undefined
        }, assurancePublication(["OWNER", "OPERATOR"], true, true)).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "ASSURANCE_CERT_ISSUED",
          severity: out.cert.status === "PASS" ? "LOW" : "HIGH",
          payload: {
            certId: out.cert.certId,
            runId: out.cert.runId,
            status: out.cert.status,
            sha256: out.sha256
          }
        });
        emitAssuranceSse({
          hub: orgSse,
          type: "ASSURANCE_CERT_UPDATED"
        });
        if (out.cert.status !== "PASS") {
          emitAssuranceSse({
            hub: orgSse,
            type: "ASSURANCE_THRESHOLD_BREACH"
          });
        }
        json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/cert/latest" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, assuranceCertLatestForApi(options.workspace));
        return;
      }

      if (pathname === "/assurance/waiver/request" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { reason?: unknown; hours?: unknown }) : {};
        if (typeof parsed.reason !== "string" || parsed.reason.trim().length === 0) {
          json(res, 400, { error: "reason is required" });
          return;
        }
        const out = assuranceWaiverRequestForApi({
          workspace: options.workspace, initiator,
          agentId: resolveAgentId(options.workspace),
          reason: parsed.reason.trim(),
          hours: Number.isFinite(Number(parsed.hours)) ? Number(parsed.hours) : 24
        });
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "ASSURANCE_WAIVER_REQUESTED",
          severity: "HIGH",
          payload: {
            requestId: out.requestId,
            approvalRequestId: out.approvalRequestId,
            hours: out.hours
          }
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/waiver/status" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const out = await assuranceWaiverStatusForApi(options.workspace, assurancePublication(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return; json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/waiver/revoke" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { waiverId?: unknown }) : {};
        const out = await assuranceWaiverRevokeForApi({
          workspace: options.workspace,
          waiverId: typeof parsed.waiverId === "string" ? parsed.waiverId : undefined
        }, assurancePublication(["OWNER"], true)).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        if (out.revoked) {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "ASSURANCE_WAIVER_REVOKED",
            severity: "MEDIUM",
            payload: {
              waiverId: out.waiverId
            }
          });
        }
        json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/scheduler/status" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, assuranceSchedulerStatusForApi(options.workspace));
        return;
      }

      if (pathname === "/assurance/scheduler/run-now" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const out = await assuranceSchedulerRunNowForApi({
          workspace: options.workspace
        }, assurancePublication(["OWNER", "OPERATOR"], true, true)).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        emitAssuranceSse({
          hub: orgSse,
          type: "ASSURANCE_RUN_UPDATED"
        });
        emitOrgEvent("ASSURANCE_RUN_COMPLETED");
        if (out.cert) {
          emitAssuranceSse({
            hub: orgSse,
            type: "ASSURANCE_CERT_UPDATED"
          });
        }
        if (out.scheduler.lastCertStatus !== "PASS") {
          emitAssuranceSse({
            hub: orgSse,
            type: "ASSURANCE_THRESHOLD_BREACH"
          });
        }
        json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/scheduler/enable" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await assuranceSchedulerEnableForApi({
          workspace: options.workspace,
          enabled: true
        }, assurancePublication(["OWNER", "OPERATOR"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return; json(res, 200, out);
        return;
      }

      if (pathname === "/assurance/scheduler/disable" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await assuranceSchedulerEnableForApi({
          workspace: options.workspace,
          enabled: false
        }, assurancePublication(["OWNER", "OPERATOR"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return; json(res, 200, out);
        return;
      }

      if (pathname.startsWith("/audit/")) {
        const gate = auditReadinessGate(options.workspace);
        if (!gate.ok) {
          json(res, 503, {
            error: "AUDIT_ENDPOINTS_UNAVAILABLE",
            reasons: gate.reasons,
            warnings: gate.warnings
          });
          return;
        }
      }

      if (pathname === "/audit/policy" && req.method === "GET") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, auditPolicyForApi(options.workspace));
        return;
      }

      if (pathname === "/audit/policy/apply" && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { policy?: unknown }) : {};
        if (!parsed.policy) {
          json(res, 400, { error: "policy is required" });
          return;
        }
        const out = auditPolicyApplyForApi({
          workspace: options.workspace,
          policy: parsed.policy
        });
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_BINDER_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/audit/map/active" && req.method === "GET") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, auditMapShowForApi({
          workspace: options.workspace,
          id: "active"
        }));
        return;
      }

      if (pathname === "/audit/map/apply" && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { map?: unknown }) : {};
        if (!parsed.map) {
          json(res, 400, { error: "map is required" });
          return;
        }
        const out = auditMapApplyForApi({
          workspace: options.workspace,
          map: parsed.map
        });
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_BINDER_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/audit/map/verify" && req.method === "GET") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, auditMapVerifyForApi(options.workspace));
        return;
      }

      if (pathname === "/audit/binder/create" && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { scopeType?: unknown; scopeId?: unknown; requestId?: unknown }) : {};
        const out = await auditBinderCreateForApi({
          workspace: options.workspace,
          scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined,
          requestId: typeof parsed.requestId === "string" ? parsed.requestId : undefined
        }, auditPublication(["OWNER", "OPERATOR"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_BINDER_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/audit/binder/export" && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              scopeType?: unknown;
              scopeId?: unknown;
              outFile?: unknown;
              requestId?: unknown;
              externalShare?: unknown;
              approvalRequestId?: unknown;
            })
          : {};
        const externalShare = parsed.externalShare === true;
        if (typeof parsed.approvalRequestId === "string" && parsed.approvalRequestId.trim().length > 0) {
          const out = await auditBinderExportExecuteForApi({
            workspace: options.workspace,
            approvalRequestId: parsed.approvalRequestId.trim()
          }, auditPublication(["OWNER"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
          emitAuditSse({
            hub: orgSse,
            type: "AUDIT_BINDER_UPDATED"
          });
          json(res, 200, out);
          return;
        }
        if (externalShare) {
          const requested = auditBinderExportRequestForApi({
            workspace: options.workspace, initiator,
            agentId: resolveAgentId(options.workspace, auth.agentId ?? "default"),
            scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
            scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined,
            outFile: typeof parsed.outFile === "string" ? parsed.outFile : undefined,
            requestId: typeof parsed.requestId === "string" ? parsed.requestId : undefined
          });
          json(res, 202, requested);
          return;
        }
        const out = await auditBinderExportForApi({
          workspace: options.workspace,
          scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined,
          outFile: typeof parsed.outFile === "string" ? parsed.outFile : undefined,
          requestId: typeof parsed.requestId === "string" ? parsed.requestId : undefined
        }, auditPublication(["OWNER"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_BINDER_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/audit/binders" && req.method === "GET") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, auditBindersForApi(options.workspace));
        return;
      }

      const auditVerifyMatch = pathname.match(/^\/audit\/binders\/([^/]+)\/verify$/);
      if (auditVerifyMatch && req.method === "GET") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const binderId = decodeURIComponent(auditVerifyMatch[1] ?? "");
        const fileQuery = url.searchParams.get("file");
        let file = "";
        if (fileQuery) {
          // P0-20: a request names a file only inside the binder exports directory (AMC has no other directory it
          // writes binders or industry-pack audits to); anything else is refused unread.
          try {
            file = containedPath(auditBindersExportsDir(options.workspace), "the audit binder exports directory", fileQuery);
          } catch {
            json(res, 400, { error: "file must be inside the audit binder exports directory" });
            return;
          }
        } else {
          file = auditBindersForApi(options.workspace).exports.find((item) => item.binderId === binderId)?.file ?? "";
        }
        if (!file) {
          json(res, 404, { error: "binder export not found" });
          return;
        }
        // P0-09: the server operator's trust context decides, never the workspace's own keys. No public-key path is
        // taken from a request.
        const verify = auditBinderVerifyForApi({ file, workspace: options.workspace, trust: loadTrustContext() });
        json(res, verify.ok ? 200 : 422, verify);
        return;
      }

      if (pathname === "/audit/requests/create" && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["AUDITOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as { scopeType?: unknown; scopeId?: unknown; requestedItems?: unknown[]; items?: unknown[] })
          : {};
        const requestedItems = Array.isArray(parsed.requestedItems)
          ? parsed.requestedItems
          : Array.isArray(parsed.items)
            ? parsed.items
            : [];
        const out = auditRequestCreateForApi({
          workspace: options.workspace,
          scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined,
          requestedItems: requestedItems as Array<string | { kind: "ARTIFACT_HASH"; id: string; sha256: string } | { kind: "PROOF"; id: string } | { kind: "CONTROL"; controlId: string }>,
          requesterUserId: auth.username ?? auth.agentId ?? "auditor"
        });
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_EVIDENCE_REQUEST_UPDATED"
        });
        json(res, 201, out);
        return;
      }

      if (pathname === "/audit/requests" && req.method === "GET") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR"])) {
          return;
        }
        json(res, 200, {
          requests: auditRequestListForApi(options.workspace)
        });
        return;
      }

      const auditRequestApproveMatch = pathname.match(/^\/audit\/requests\/([^/]+)\/approve$/);
      if (auditRequestApproveMatch && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        const requestId = decodeURIComponent(auditRequestApproveMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { reason?: unknown; agentId?: unknown }) : {};
        const out = auditRequestApproveForApi({
          workspace: options.workspace,
          requestId,
          agentId: typeof parsed.agentId === "string" ? parsed.agentId : undefined,
          actorUserId: auth.username ?? "owner",
          actorUsername: auth.username ?? "owner",
          actorRoles: Array.from(auth.roles) as Array<"OWNER" | "AUDITOR" | "APPROVER" | "OPERATOR" | "VIEWER" | "AGENT">,
          reason: typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : "owner approved evidence request"
        });
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_EVIDENCE_REQUEST_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      const auditRequestRejectMatch = pathname.match(/^\/audit\/requests\/([^/]+)\/reject$/);
      if (auditRequestRejectMatch && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        const requestId = decodeURIComponent(auditRequestRejectMatch[1] ?? "");
        const out = auditRequestRejectForApi({
          workspace: options.workspace,
          requestId
        });
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_EVIDENCE_REQUEST_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      const auditRequestFulfillMatch = pathname.match(/^\/audit\/requests\/([^/]+)\/fulfill$/);
      if (auditRequestFulfillMatch && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const requestId = decodeURIComponent(auditRequestFulfillMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { outFile?: unknown }) : {};
        const out = await auditRequestFulfillForApi({
          workspace: options.workspace,
          requestId,
          outFile: typeof parsed.outFile === "string" ? parsed.outFile : undefined
        }, auditPublication(["OWNER", "OPERATOR"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_EVIDENCE_REQUEST_UPDATED"
        });
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_BINDER_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/audit/scheduler/status" && req.method === "GET") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])) {
          return;
        }
        json(res, 200, auditSchedulerStatusForApi(options.workspace));
        return;
      }

      if (pathname === "/audit/scheduler/run-now" && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { scopeType?: unknown; scopeId?: unknown }) : {};
        const out = await auditSchedulerRunNowForApi({
          workspace: options.workspace,
          scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined
        }, auditPublication(["OWNER", "OPERATOR"])).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        emitAuditSse({
          hub: orgSse,
          type: "AUDIT_BINDER_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/audit/scheduler/enable" && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await auditSchedulerEnableForApiAsync({ workspace: options.workspace, enabled: true }, auditPublication(["OWNER", "OPERATOR"], false)).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        json(res, 200, out);
        return;
      }

      if (pathname === "/audit/scheduler/disable" && req.method === "POST") {
        if (denyAuditLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await auditSchedulerEnableForApiAsync({ workspace: options.workspace, enabled: false }, auditPublication(["OWNER", "OPERATOR"], false)).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; }); if (out === null) return;
        json(res, 200, out);
        return;
      }

      if (pathname.startsWith("/value/")) {
        const gate = valueReadinessGate(options.workspace);
        if (!gate.ok) {
          json(res, 503, {
            error: "VALUE_ENDPOINTS_UNAVAILABLE",
            reasons: gate.reasons,
            warnings: gate.warnings
          });
          return;
        }
      }

      if (pathname === "/value/policy" && req.method === "GET") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        const out = await valuePolicyForApi(options.workspace, { beforePublish: signingAuthority(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/value/policy/apply" && req.method === "POST") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { policy?: unknown }) : {};
        if (!parsed.policy) {
          json(res, 400, { error: "policy is required" });
          return;
        }
        const out = await valuePolicyApplyForApi({
          workspace: options.workspace,
          policy: parsed.policy
        }, { beforePublish: () => { signingAuthority(["OWNER"])(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } } }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        emitValueSse({
          hub: orgSse,
          type: "VALUE_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/value/contracts" && req.method === "GET") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const scopeRaw = (url.searchParams.get("scope") ?? "workspace").toLowerCase();
        const scope = scopeRaw === "agent" || scopeRaw === "node" ? scopeRaw : "workspace";
        const scopeId = url.searchParams.get("id") ?? "workspace";
        json(
          res,
          200,
          valueContractForApi({
            workspace: options.workspace,
            scopeType: scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT",
            scopeId: scope === "workspace" ? "workspace" : scopeId
          })
        );
        return;
      }

      if (pathname === "/value/contracts/apply" && req.method === "POST") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as { contract?: unknown; scopeType?: unknown; scopeId?: unknown; type?: unknown; deployment?: unknown })
          : {};
        if (!parsed.contract && typeof parsed.type === "string") {
          const out = await valueContractInitForApi({
            workspace: options.workspace,
            scopeType:
              typeof parsed.scopeType === "string"
                ? (parsed.scopeType.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT")
                : "WORKSPACE",
            scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : "workspace",
            type: parsed.type as "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other",
            deployment: typeof parsed.deployment === "string" ? (parsed.deployment as "single" | "host" | "k8s" | "compose") : undefined
          }, { beforePublish: () => { signingAuthority(["OWNER", "OPERATOR"])(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } } }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
          emitValueSse({
            hub: orgSse,
            type: "VALUE_UPDATED"
          });
          json(res, 200, out);
          return;
        }
        if (!parsed.contract) {
          json(res, 400, { error: "contract or type is required" });
          return;
        }
        const out = await valueContractApplyForApi({
          workspace: options.workspace,
          contract: parsed.contract,
          scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined
        }, { beforePublish: () => { signingAuthority(["OWNER", "OPERATOR"])(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } } }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        emitValueSse({
          hub: orgSse,
          type: "VALUE_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/value/import/csv" && req.method === "POST") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { csv?: unknown; scopeType?: unknown; scopeId?: unknown; kpiId?: unknown; attest?: unknown }) : {};
        if (typeof parsed.csv !== "string" || typeof parsed.kpiId !== "string") {
          json(res, 400, { error: "csv and kpiId are required" });
          return;
        }
        if (parsed.attest !== undefined) {
          json(res, 400, { error: "attest was removed in 2.0.0: imported value events are SELF_REPORTED (see docs/EVIDENCE_TRUST.md)" });
          return;
        }
        const out = await importValueCsvForApi({
          workspace: options.workspace,
          scopeType:
            typeof parsed.scopeType === "string"
              ? (parsed.scopeType.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT")
              : "WORKSPACE",
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : "workspace",
          kpiId: parsed.kpiId,
          csvText: parsed.csv
        }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        emitValueSse({
          hub: orgSse,
          type: "VALUE_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/value/snapshot/latest" && req.method === "GET") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        const scopeRaw = (url.searchParams.get("scope") ?? "workspace").toLowerCase();
        const scope = scopeRaw === "agent" || scopeRaw === "node" ? scopeRaw : "workspace";
        const scopeId = url.searchParams.get("id") ?? "workspace";
        const windowDays = Number(url.searchParams.get("windowDays") ?? "");
        const out = await valueSnapshotLatestForApi({
          workspace: options.workspace,
          scopeType: scope.toUpperCase(),
          scopeId: scope === "workspace" ? "workspace" : scopeId,
          windowDays: Number.isFinite(windowDays) && windowDays > 0 ? Math.trunc(windowDays) : undefined
        }, { beforePublish: signingAuthority(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        if (out.status === "INSUFFICIENT_EVIDENCE") {
          emitValueSse({
            hub: orgSse,
            type: "VALUE_EVIDENCE_INSUFFICIENT"
          });
        }
        json(res, 200, out);
        return;
      }

      if (pathname === "/value/report" && req.method === "GET") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        const scopeRaw = (url.searchParams.get("scope") ?? "workspace").toLowerCase();
        const scope = scopeRaw === "agent" || scopeRaw === "node" ? scopeRaw : "workspace";
        const scopeId = url.searchParams.get("id") ?? "workspace";
        const windowDays = Number(url.searchParams.get("windowDays") ?? "");
        const out = await valueReportForApi({
          workspace: options.workspace,
          scopeType: scope.toUpperCase(),
          scopeId: scope === "workspace" ? "workspace" : scopeId,
          windowDays: Number.isFinite(windowDays) && windowDays > 0 ? Math.trunc(windowDays) : undefined
        }, { beforePublish: signingAuthority(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        emitValueSse({
          hub: orgSse,
          type: "VALUE_UPDATED"
        });
        if (out.snapshot.status === "INSUFFICIENT_EVIDENCE") {
          emitValueSse({
            hub: orgSse,
            type: "VALUE_EVIDENCE_INSUFFICIENT"
          });
        }
        json(res, 200, out);
        return;
      }

      if (pathname === "/value/scheduler/status" && req.method === "GET") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])) {
          return;
        }
        json(res, 200, valueSchedulerStatusForApi(options.workspace));
        return;
      }

      if (pathname === "/value/scheduler/run-now" && req.method === "POST") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { scopeType?: unknown; scopeId?: unknown; windowDays?: unknown }) : {};
        const out = await valueSchedulerRunNowForApi({
          workspace: options.workspace,
          scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined,
          windowDays: typeof parsed.windowDays === "number" ? parsed.windowDays : undefined
        }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        emitValueSse({
          hub: orgSse,
          type: "VALUE_UPDATED"
        });
        if (out.report.snapshot.status === "INSUFFICIENT_EVIDENCE") {
          emitValueSse({
            hub: orgSse,
            type: "VALUE_EVIDENCE_INSUFFICIENT"
          });
        }
        json(res, 200, out);
        return;
      }

      if (pathname === "/value/scheduler/enable" && req.method === "POST") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await valueSchedulerSetEnabledForApi({ workspace: options.workspace, enabled: true }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/value/scheduler/disable" && req.method === "POST") {
        if (denyValueLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const out = await valueSchedulerSetEnabledForApi({ workspace: options.workspace, enabled: false }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname.startsWith("/passport/")) {
        const gate = passportReadinessGate(options.workspace);
        if (!gate.ok) {
          json(res, 503, {
            error: "PASSPORT_ENDPOINTS_UNAVAILABLE",
            reasons: gate.reasons,
            warnings: gate.warnings
          });
          return;
        }
      }

      if (pathname === "/passport/policy" && req.method === "GET") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, passportPolicyForApi(options.workspace));
        return;
      }

      if (pathname === "/passport/policy/apply" && req.method === "POST") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { policy?: unknown }) : {};
        if (!parsed.policy || typeof parsed.policy !== "object") {
          json(res, 400, { error: "policy object is required" });
          return;
        }
        const passportActor = auditPublication(["OWNER"]).beforePublish;
        const passportAttempt = await passportPolicyApplyAttemptForApiAsync({
          workspace: options.workspace,
          policy: parsed.policy
        }, { beforePublish: passportActor });
        const out = passportAttempt.result;
        try { passportAttempt.assertCurrent(); passportActor();
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PASSPORT_POLICY_APPLIED",
          severity: "LOW",
          payload: {
            path: out.path,
            sigPath: out.sigPath
          }
        });
        passportAttempt.assertCurrent(); passportActor();
        emitPassportSse({
          hub: orgSse,
          type: "PASSPORT_UPDATED"
        });
        passportAttempt.assertCurrent(); passportActor();
        json(res, 200, out);
        } catch (cause) {
          throw passportPublicationFailure(options.workspace, "studio-followup", passportAttempt.publishedPaths, passportAttempt.createdDirectories, null, cause, out.transparencyHash, null, true);
        }
        return;
      }

      if (pathname === "/passport/create" && req.method === "POST") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { scopeType?: unknown; scopeId?: unknown; outFile?: unknown }) : {};
        const passportActor = auditPublication(["OWNER", "OPERATOR"]).beforePublish;
        const passportAttempt = await passportCreateAttemptForApiAsync({
          workspace: options.workspace,
          scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined,
          outFile: typeof parsed.outFile === "string" ? parsed.outFile : undefined
        }, { beforePublish: passportActor });
        const out = passportAttempt.result;
        try { passportAttempt.assertCurrent(); passportActor();
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PASSPORT_CREATED",
          severity: out.passport.status.label === "VERIFIED" ? "LOW" : "MEDIUM",
          payload: {
            passportId: out.passport.passportId,
            status: out.passport.status.label,
            sha256: out.sha256
          }
        });
        passportAttempt.assertCurrent(); passportActor();
        emitPassportSse({
          hub: orgSse,
          type: "PASSPORT_UPDATED"
        });
        passportAttempt.assertCurrent(); passportActor();
        json(res, 200, out);
        } catch (cause) {
          throw passportPublicationFailure(options.workspace, "studio-followup", passportAttempt.publishedPaths, passportAttempt.createdDirectories, null, cause, out.transparencyCreatedHash, out.transparencyExportedHash, true);
        }
        return;
      }

      if (pathname === "/passport/cache/latest" && req.method === "GET") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, passportCacheLatestForApi({
          workspace: options.workspace,
          scopeType: url.searchParams.get("scope"),
          scopeId: url.searchParams.get("id")
        }));
        return;
      }

      if (pathname === "/passport/export" && req.method === "POST") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              scopeType?: unknown;
              scopeId?: unknown;
              outFile?: unknown;
              externalShare?: unknown;
              approvalRequestId?: unknown;
            })
          : {};
        if (typeof parsed.approvalRequestId === "string" && parsed.approvalRequestId.trim().length > 0) {
          const out = passportExportExecuteForApi({
            workspace: options.workspace,
            approvalRequestId: parsed.approvalRequestId.trim()
          });
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "PASSPORT_EXPORTED",
            severity: "MEDIUM",
            payload: {
              passportId: out.passport.passportId,
              sha256: out.sha256
            }
          });
          emitPassportSse({
            hub: orgSse,
            type: "PASSPORT_UPDATED"
          });
          json(res, 200, out);
          return;
        }
        if (parsed.externalShare === true) {
          const requested = passportExportRequestForApi({
            workspace: options.workspace, initiator,
            agentId: resolveAgentId(options.workspace, auth.agentId ?? "default"),
            scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
            scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined,
            outFile: typeof parsed.outFile === "string" ? parsed.outFile : undefined
          });
          json(res, 202, requested);
          return;
        }
        const out = passportExportLatestForApi({
          workspace: options.workspace,
          scopeType: typeof parsed.scopeType === "string" ? parsed.scopeType : undefined,
          scopeId: typeof parsed.scopeId === "string" ? parsed.scopeId : undefined,
          outFile: typeof parsed.outFile === "string" ? parsed.outFile : undefined
        });
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PASSPORT_EXPORTED",
          severity: "LOW",
          payload: {
            passportId: out.passport.passportId,
            sha256: out.sha256
          }
        });
        emitPassportSse({
          hub: orgSse,
          type: "PASSPORT_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/passport/verify" && req.method === "POST") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { file?: unknown }) : {};
        if (typeof parsed.file !== "string" || parsed.file.trim().length === 0) {
          json(res, 400, { error: "file is required" });
          return;
        }
        // P0-09: the server operator's trust context decides; a request cannot add pins or allow flags.
        const refused = requestTrustOverride(parsed);
        if (refused) {
          json(res, 400, { error: refused });
          return;
        }
        const out = passportVerifyForApi({ workspace: options.workspace, file: parsed.file, trust: loadTrustContext() });
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: out.ok ? "PASSPORT_VERIFIED" : "PASSPORT_VERIFICATION_FAILED",
          severity: out.ok ? "LOW" : "MEDIUM",
          payload: {
            file: parsed.file,
            ok: out.ok,
            errors: out.errors.map((row) => row.code)
          }
        });
        json(res, out.ok ? 200 : 422, out);
        return;
      }

      if (pathname === "/passport/exports" && req.method === "GET") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, {
          exports: passportExportsForApi(options.workspace)
        });
        return;
      }

      if (pathname === "/passport/badge" && req.method === "GET") {
        if (auth.agentId) {
          const badge = passportBadgeForApi({
            workspace: options.workspace,
            agentId: auth.agentId
          });
          json(res, 200, {
            badge: badge.badge
          });
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const badge = passportBadgeForApi({
          workspace: options.workspace,
          agentId
        });
        json(res, 200, {
          badge: badge.badge
        });
        return;
      }

      if (pathname === "/standard/generate" && req.method === "POST") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const beforePublish = signingAuthority(["OWNER"]), out = await standardGenerateForApi(options.workspace, { beforePublish }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return; beforePublish();
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "STANDARD_SCHEMAS_GENERATED",
          severity: "LOW",
          payload: {
            metaPath: out.metaPath,
            schemas: out.schemaNames
          }
        });
        emitPassportSse({
          hub: orgSse,
          type: "STANDARD_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/standard/verify" && req.method === "GET") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        const beforePublish = signingAuthority(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"]), out = await standardVerifyForApi(options.workspace, { beforePublish }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return; beforePublish(); json(res, 200, out);
        return;
      }

      if (pathname === "/standard/schemas" && req.method === "GET") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, standardSchemasForApi(options.workspace));
        return;
      }

      const standardSchemaMatch = pathname.match(/^\/standard\/schemas\/([^/]+)$/);
      if (standardSchemaMatch && req.method === "GET") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        const name = decodeURIComponent(standardSchemaMatch[1] ?? "");
        json(res, 200, standardSchemaReadForApi(options.workspace, name));
        return;
      }

      if (pathname === "/standard/validate" && req.method === "POST") {
        if (denyPassportLeaseAccess()) {
          return;
        }
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { schemaId?: unknown; file?: unknown }) : {};
        if (typeof parsed.schemaId !== "string" || typeof parsed.file !== "string") {
          json(res, 400, { error: "schemaId and file are required" });
          return;
        }
        const out = standardValidateForApi({
          workspace: options.workspace,
          schemaId: parsed.schemaId,
          file: parsed.file
        });
        json(res, out.ok ? 200 : 422, out);
        return;
      }

      if (pathname === "/advisories" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const scopeRaw = url.searchParams.get("scope");
        const scope =
          scopeRaw && (scopeRaw === "workspace" || scopeRaw === "agent" || scopeRaw === "node")
            ? (scopeRaw as "workspace" | "agent" | "node")
            : undefined;
        const targetId = url.searchParams.get("targetId");
        const advisories = listAdvisoriesForApi({
          workspace: options.workspace,
          scope,
          targetId
        });
        json(res, 200, {
          advisories
        });
        return;
      }

      const advisoryAckMatch = pathname.match(/^\/advisories\/([^/]+)\/ack$/);
      if (advisoryAckMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const advisoryId = decodeURIComponent(advisoryAckMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { note?: string }) : {};
        const note = typeof parsed.note === "string" && parsed.note.trim().length > 0 ? parsed.note.trim() : "acknowledged";
        const authority = signingAuthority(["OWNER", "OPERATOR"]);
        const beforePublish = () => {
          authority();
          if (!requireUnlockedVaultForSigning()) throw new Error("forecast vault entry gate changed while signing");
        };
        const advisory = await ackAdvisoryForAuthority({
          workspace: options.workspace,
          advisoryId,
          by: auth.username ?? "operator",
          note
        }, beforePublish)
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (advisory === null) return;
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "ADVISORY_ACKNOWLEDGED",
          severity: "LOW",
          payload: {
            advisoryId: advisory.advisoryId,
            by: auth.username ?? "operator"
          }
        });
        emitOrgEvent("ADVISORY_ACKNOWLEDGED", advisory.scope.type === "AGENT" ? orgNodeIdsForAgent(advisory.scope.id) : undefined);
        json(res, 200, {
          advisory,
          auditEventId: audit.eventId
        });
        return;
      }

      if (pathname === "/agents" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agents = listAgents(options.workspace).map((agent) => {
          try {
            const token = ensureAgentToken(options.workspace, agent.id);
            return {
              ...agent,
              agentTokenPath: token.tokenPath,
              agentTokenScopes: token.scopes,
              agentTokenExecuteActionClasses: token.executeActionClasses,
              agentTokenGrantedBy: token.grantedBy
            };
          } catch (error) {
            // Fail closed: no token is minted without a valid signed grant.
            return {
              ...agent,
              agentTokenScopes: [],
              agentTokenRefusal: error instanceof Error ? error.message : String(error),
              ...(error instanceof AgentTokenGrantError ? { agentTokenRefusedBy: error.refusedBy, agentTokenWiden: error.widen } : {})
            };
          }
        });

        json(res, 200, { agents });
        return;
      }

      if (pathname === "/users" && req.method === "GET") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        const users = listHumanUsers(options.workspace).map((user) => ({
          userId: user.userId,
          username: user.username,
          roles: user.roles,
          status: user.status,
          createdTs: user.createdTs
        }));
        json(res, 200, { users });
        return;
      }

      if (pathname === "/users/add" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { username?: string; password?: string; roles?: string[] }) : {};
        if (!parsed.username || !parsed.password || !Array.isArray(parsed.roles)) {
          json(res, 400, { error: "username, password, roles are required" });
          return;
        }
        const user = await addUserAsync({
          workspace: options.workspace,
          username: parsed.username,
          password: parsed.password,
          roles: parseUserRoles(parsed.roles)
        }, { assertAuthorized: assertUsersMutationAuthorized });
        json(res, 200, {
          user: {
            userId: user.userId,
            username: user.username,
            roles: user.roles,
            status: user.status
          }
        });
        return;
      }

      if (pathname === "/users/revoke" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { username?: string }) : {};
        if (!parsed.username) {
          json(res, 400, { error: "username is required" });
          return;
        }
        const user = await revokeUserAsync({
          workspace: options.workspace,
          username: parsed.username
        }, { assertAuthorized: assertUsersMutationAuthorized });
        json(res, 200, { user: publicUsersMutationRecord(user) });
        return;
      }

      if (pathname === "/users/roles" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { username?: string; roles?: string[] }) : {};
        if (!parsed.username || !Array.isArray(parsed.roles)) {
          json(res, 400, { error: "username and roles are required" });
          return;
        }
        const user = await setUserRolesAsync({
          workspace: options.workspace,
          username: parsed.username,
          roles: parseUserRoles(parsed.roles)
        }, { assertAuthorized: assertUsersMutationAuthorized });
        json(res, 200, { user: publicUsersMutationRecord(user) });
        return;
      }

      if (pathname === "/leases/status" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        // One verified read: the count never comes from bytes other than those whose signature verified.
        const read = readVerifiedLeaseRevocations(options.workspace);
        json(res, 200, {
          revocationSignatureValid: read.ok,
          revocationSignatureReason: read.ok ? null : read.reason,
          revokedLeaseCount: read.ok ? read.store.revocations.length : null,
          updatedTs: read.ok ? read.store.updatedTs : null
        });
        return;
      }

      if (pathname === "/budgets" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const config = loadBudgetsConfig(options.workspace);
        json(res, 200, {
          agentId,
          config
        });
        return;
      }

      if (pathname === "/budgets/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const actor = signingAuthority(["OWNER"]), beforePublish = () => { actor(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } };
        const writer = captureBudgetsPublication(options.workspace, beforePublish);
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { config?: unknown }) : {};
        if (!parsed.config || typeof parsed.config !== "object") { json(res, 400, { error: "config object is required" }); return; }
        const prepared = await writer.prepareAsync(Buffer.from(YAML.stringify(parsed.config as Record<string, unknown>)));
        const saved = prepared.publish(), path = saved.configPath;
        try { prepared.assertCurrent(); writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "CONSOLE_BUDGETS_UPDATED",
          severity: "LOW",
          payload: {
            path
          }
        });
        prepared.assertCurrent(); } catch (cause) { throw new BudgetsPublicationError([path, saved.sigPath], "studio-budget-audit", cause); }
        json(res, 200, { path });
        return;
      }

      if (pathname === "/leases/issue" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              agentId?: string;
              ttl?: string;
              scopes?: string;
              routes?: string;
              models?: string;
              rpm?: number;
              tpm?: number;
              maxCostUsdPerDay?: number | null;
              workOrderId?: string;
            })
          : {};
        const agentId = resolveAgentId(options.workspace, parsed.agentId ?? "default");
        const workspaceId = workspaceIdFromDirectory(options.workspace);
        const issued = issueLeaseForCli({
          workspace: options.workspace,
          workspaceId,
          agentId,
          ttl: parsed.ttl ?? "60m",
          scopes: parsed.scopes ?? "gateway:llm,proxy:connect,toolhub:intent,toolhub:execute,governor:check,receipt:verify",
          routes: parsed.routes ?? "/openai,/anthropic,/gemini,/grok,/openrouter,/local,/azure-openai,/groq,/mistral,/cohere,/together,/fireworks,/perplexity,/deepseek,/qwen",
          models: parsed.models ?? "*",
          rpm: typeof parsed.rpm === "number" ? parsed.rpm : 60,
          tpm: typeof parsed.tpm === "number" ? parsed.tpm : 200000,
          maxCostUsdPerDay: parsed.maxCostUsdPerDay ?? null,
          workOrderId: parsed.workOrderId
        });
        const decoded = verifyLeaseToken({
          workspace: options.workspace,
          token: issued.token,
          expectedWorkspaceId: workspaceId
        });
        if (decoded.ok && decoded.payload) {
          updateStudioLastLease(options.workspace, {
            agentId: decoded.payload.agentId,
            leaseId: decoded.payload.leaseId,
            issuedTs: decoded.payload.issuedTs,
            expiresTs: decoded.payload.expiresTs
          });
        }
        json(res, 200, {
          agentId,
          lease: issued.token
        });
        return;
      }

      if (pathname === "/leases/revoke" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = JSON.parse(body || "{}") as { leaseId?: string; reason?: string };
        if (!parsed.leaseId) {
          json(res, 400, { error: "leaseId is required" });
          return;
        }
        revokeLease(options.workspace, parsed.leaseId, parsed.reason ?? "revoked by owner");
        json(res, 200, { leaseId: parsed.leaseId });
        return;
      }

      const agentStatusMatch = pathname.match(/^\/agents\/([^/]+)\/status$/);
      if (agentStatusMatch && req.method === "GET") {
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentStatusMatch[1] ?? ""));
        const canViewWorkspaceAgent = hasAnyRole(
          [...auth.roles],
          ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"],
        );
        if (!auth.isAdmin && auth.agentId !== agentId && !canViewWorkspaceAgent) {
          json(res, 403, { error: "scope does not include this agent" });
          return;
        }
        json(res, 200, agentLastStatus(options.workspace, agentId));
        return;
      }

      const agentTargetsMatch = pathname.match(/^\/agents\/([^/]+)\/targets$/);
      if (agentTargetsMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentTargetsMatch[1] ?? ""));
        const run = agentLastStatus(options.workspace, agentId).latestRun;
        const report = run?.runId ? loadRunReport(options.workspace, run.runId, agentId) : null;
        const target = (() => {
          try {
            return loadTargetProfile(options.workspace, "default", agentId);
          } catch {
            return null;
          }
        })();
        json(res, 200, {
          agentId,
          targetId: target?.id ?? null,
          questions: questionBank.map((question) => {
            const current = report?.questionScores.find((row) => row.questionId === question.id)?.finalLevel ?? 0;
            const targetLevel = target?.mapping[question.id] ?? 0;
            return {
              questionId: question.id,
              title: question.title,
              current,
              target: targetLevel,
              effective: Math.min(current, targetLevel),
              levels: question.options.map((opt) => ({
                level: opt.level,
                label: opt.label,
                meaning: opt.meaning
              }))
            };
          })
        });
        return;
      }

      const agentTargetsWhatIfMatch = pathname.match(/^\/agents\/([^/]+)\/targets\/whatif$/);
      if (agentTargetsWhatIfMatch && req.method === "POST") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentTargetsWhatIfMatch[1] ?? ""));
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { mapping?: Record<string, number> }) : {};
        const result = simulateTargetWhatIf({
          workspace: options.workspace,
          agentId,
          proposedTarget: parsed.mapping ?? {}
        });
        json(res, 200, {
          agentId,
          summary: {
            topChanges: result.topChanges,
            actionUnlocks: result.governor.matrix.filter((row) => row.executeAllowed).length,
            actionLocks: result.governor.matrix.filter((row) => !row.executeAllowed).length,
            autonomyAllowanceIndex: result.governor.autonomyAllowanceIndex,
            ciGatePass: result.ciGate.pass,
            warnings: result.warnings.slice(0, 10)
          },
          result
        });
        return;
      }

      const agentTargetsApplyMatch = pathname.match(/^\/agents\/([^/]+)\/targets\/apply$/);
      if (agentTargetsApplyMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentTargetsApplyMatch[1] ?? ""));
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { mapping?: Record<string, number>; name?: string }) : {};
        const graph = loadContextGraph(options.workspace, agentId);
        const contextGraphHash = sha256Hex(JSON.stringify(graph));
        const name = parsed.name ?? "default";
        const oldTarget = (() => {
          try {
            return loadTargetProfile(options.workspace, name, agentId);
          } catch {
            return null;
          }
        })();
        const profile = createSignedTargetProfile({
          workspace: options.workspace,
          name,
          contextGraphHash,
          mapping: parsed.mapping ?? oldTarget?.mapping ?? {}
        });
        const targetPath = saveTargetProfile(options.workspace, profile, agentId);
        const diffHash = sha256Hex(
          JSON.stringify({
            before: oldTarget?.mapping ?? {},
            after: profile.mapping
          })
        );
        const auditA = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "TARGET_PROFILE_UPDATED",
          severity: "MEDIUM",
          agentId,
          payload: {
            targetName: name,
            targetPath,
            diffHash
          }
        });
        const auditB = await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "CONSOLE_TARGET_DRAFT_APPLIED",
          severity: "LOW",
          agentId,
          payload: {
            targetName: name,
            targetPath,
            diffHash
          }
        }, humanAuditAuthority(["OWNER"]));
        try {
          buildDashboard({
            workspace: options.workspace,
            agentId,
            outDir: `.amc/agents/${agentId}/dashboard`
          });
        } catch {
          // ignore if no runs yet
        }
        json(res, 200, {
          agentId,
          targetPath,
          profileId: profile.id,
          auditEventIds: [auditA.eventId, auditB.eventId]
        });
        return;
      }

      const agentLeaseMatch = pathname.match(/^\/agents\/([^/]+)\/lease$/);
      if (agentLeaseMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(agentLeaseMatch[1] ?? ""));
        const workspaceId = workspaceIdFromDirectory(options.workspace);
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              ttl?: string;
              scopes?: string;
              routes?: string;
              models?: string;
              rpm?: number;
              tpm?: number;
              maxCostUsdPerDay?: number | null;
              workOrderId?: string;
            })
          : {};
        const issued = issueLeaseForCli({
          workspace: options.workspace,
          workspaceId,
          agentId,
          ttl: parsed.ttl ?? "60m",
          scopes: parsed.scopes ?? "gateway:llm,proxy:connect,toolhub:intent,toolhub:execute,governor:check,receipt:verify",
          routes: parsed.routes ?? "/openai,/anthropic,/gemini,/grok,/openrouter,/local,/azure-openai,/groq,/mistral,/cohere,/together,/fireworks,/perplexity,/deepseek,/qwen",
          models: parsed.models ?? "*",
          rpm: typeof parsed.rpm === "number" ? parsed.rpm : 60,
          tpm: typeof parsed.tpm === "number" ? parsed.tpm : 200000,
          maxCostUsdPerDay: parsed.maxCostUsdPerDay ?? null,
          workOrderId: parsed.workOrderId
        });
        const decoded = verifyLeaseToken({
          workspace: options.workspace,
          token: issued.token,
          expectedWorkspaceId: workspaceId
        });
        if (decoded.ok && decoded.payload) {
          updateStudioLastLease(options.workspace, {
            agentId: decoded.payload.agentId,
            leaseId: decoded.payload.leaseId,
            issuedTs: decoded.payload.issuedTs,
            expiresTs: decoded.payload.expiresTs
          });
          const routeFamily = decoded.payload.routeAllowlist[0] ?? "unknown";
          recordLeaseIssuedMetric(decoded.payload.agentId, routeFamily);
        }
        json(res, 200, { agentId, lease: issued.token });
        return;
      }

      const runMatch = pathname.match(/^\/agents\/([^/]+)\/run$/);
      if (runMatch && req.method === "POST") {
        if (!requireRouteRoles(["OPERATOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(runMatch[1] ?? ""));
        const reportAuthority = captureReportSigningAuthority(options.workspace, signingAuthority(["OPERATOR", "OWNER"]));
        const run = await runDiagnostic({
          workspace: options.workspace,
          agentId,
          window: "14d",
          targetName: "default",
          claimMode: "auto"
        }, undefined, { beforePublish: reportAuthority }).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; });
        if (run === null) return;
        const refreshedForecasts = await refreshForecastsAfterPrimary([
          { workspace: options.workspace, scope: "agent", targetId: agentId }, { workspace: options.workspace, scope: "workspace" }
        ], reportAuthority, { kind: "diagnostic-run", id: run.runId, value: run })
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (refreshedForecasts === null) return;
        const [refreshedAgentForecast] = refreshedForecasts;

        emitForecastEvents({
          agentId,
          advisories: refreshedAgentForecast.advisories.map((advisory) => ({
            severity: advisory.severity,
            category: advisory.category
          })),
          status: refreshedAgentForecast.forecast.status
        });
        recomputeOrgAndEmit("AGENT_RUN_COMPLETED", orgNodeIdsForAgent(agentId));
        json(res, 200, { runId: run.runId, status: run.status });
        return;
      }

      if (pathname === "/diagnostic/auto-answer" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? undefined);
        const reportAuthority = captureReportSigningAuthority(options.workspace, signingAuthority(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"]));
        const out = await runAutoAnswer({
          workspace: options.workspace,
          agentId,
          createPlan: false
        }, { beforePublish: reportAuthority }).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; });
        if (out === null) return;
        json(res, 200, out);
        return;
      }

      if (pathname === "/diagnostic/run" && req.method === "POST") {
        if (!requireRouteRoles(["OPERATOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? undefined);
        const reportAuthority = captureReportSigningAuthority(options.workspace, signingAuthority(["OPERATOR", "OWNER"]));
        const out = await runAutoAnswer({
          workspace: options.workspace,
          agentId,
          createPlan: true
        }, { beforePublish: reportAuthority }).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; });
        if (out === null) return;
        const refreshedForecasts = await refreshForecastsAfterPrimary([
          { workspace: options.workspace, scope: "agent", targetId: agentId }, { workspace: options.workspace, scope: "workspace" }
        ], reportAuthority, { kind: "diagnostic-auto-answer", value: out })
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (refreshedForecasts === null) return;
        const [refreshedAgentForecast] = refreshedForecasts;

        emitForecastEvents({
          agentId,
          advisories: refreshedAgentForecast.advisories.map((advisory) => ({
            severity: advisory.severity,
            category: advisory.category
          })),
          status: refreshedAgentForecast.forecast.status
        });
        recomputeOrgAndEmit("AGENT_RUN_COMPLETED", orgNodeIdsForAgent(agentId));
        json(res, 200, out);
        return;
      }

      if (pathname === "/diagnostic/bank" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const out = await diagnosticBankGetForApi(options.workspace, { beforePublish: signingAuthority(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/diagnostic/bank/verify" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, diagnosticBankVerifyForApi(options.workspace));
        return;
      }

      if (pathname === "/diagnostic/bank/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { bank?: unknown }) : {};
        if (!parsed.bank || typeof parsed.bank !== "object") {
          json(res, 400, { error: "bank object is required" });
          return;
        }
        const actorCurrent = signingAuthority(["OWNER"]), beforePublish = () => { actorCurrent(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("users signature invalid; write operations blocked"); } if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); };
        const out = await diagnosticBankApplyForApi({
          workspace: options.workspace,
          bank: parsed.bank as Awaited<ReturnType<typeof diagnosticBankGetForApi>>["bank"]
        }, { beforePublish }).catch(error => { if (res.headersSent) return null; throw error; }); if (out === null) return;
        json(res, 200, out);
        return;
      }

      if (pathname === "/diagnostic/render" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? undefined);
        const selected = await loadDiagnosticBankAttemptAsync(options.workspace, { beforePublish: signingAuthority(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; }); if (selected === null) return;
        try {
        selected.assertCurrent();
        const render = renderContextualizedDiagnostic({
          workspace: options.workspace,
          agentId, bank: selected.bank
        });
        selected.assertCurrent(); writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "DIAGNOSTIC_RENDERED",
          severity: "LOW",
          agentId,
          payload: {
            questions: render.questions.length,
            profileType: render.profile.agentType
          }
        });
        json(res, 200, render);
        } catch (cause) { if (res.headersSent) return; if (selected.completedPaths.length > 0) throw new DiagnosticBankFollowupError(selected.completedPaths, cause); throw cause; }
        return;
      }

      if (pathname === "/diagnostic/self-run" && req.method === "POST") {
        if (!auth.roles.has("AGENT") || !auth.agentId) {
          json(res, 403, { error: "lease-auth required" });
          return;
        }
        const leaseCheck = verifyLeaseForScope({
          workspace: options.workspace,
          req,
          expectedAgentId: auth.agentId,
          scope: "diagnostic:self-run"
        });
        if (!leaseCheck.ok) {
          json(res, leaseCheck.status, { error: leaseCheck.error });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { answers?: unknown }) : {};
        if (typeof parsed.answers !== "undefined") {
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "DIAGNOSTIC_SELF_RUN_ANSWERS_IGNORED",
            severity: "LOW",
            agentId: auth.agentId,
            payload: {
              note: "answers payload ignored by server"
            }
          });
        }
        const selfActorAuthority = () => {
          const current = authenticate(req, options.workspace, options.token);
          if (!current || !current.roles.has("AGENT") || current.agentId !== auth.agentId || current.userId !== auth.userId || current.isAdmin !== auth.isAdmin) {
            if (!res.headersSent) json(res, 401, { error: "authenticated authority changed while signing" }); throw new Error("authenticated authority changed while signing");
          }
          const live = verifyLeaseForScope({ workspace: options.workspace, req, expectedAgentId: auth.agentId!, scope: "diagnostic:self-run" });
          if (!live.ok) { if (!res.headersSent) json(res, live.status, { error: live.error }); throw new Error("diagnostic self-run lease changed while signing"); }
        };
        const selfForecastAuthority = captureReportSigningAuthority(options.workspace, selfActorAuthority);
        const out = await runAutoAnswer({
          workspace: options.workspace,
          agentId: auth.agentId,
          createPlan: true
        }, { beforePublish: selfForecastAuthority }).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; });
        if (out === null) return;
        const refreshedForecasts = await refreshForecastsAfterPrimary([
          { workspace: options.workspace, scope: "agent", targetId: auth.agentId }, { workspace: options.workspace, scope: "workspace" }
        ], selfForecastAuthority, { kind: "diagnostic-self-run", value: out })
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (refreshedForecasts === null) return;
        const [refreshed] = refreshedForecasts;

        emitForecastEvents({
          agentId: auth.agentId,
          advisories: refreshed.advisories.map((advisory) => ({
            severity: advisory.severity,
            category: advisory.category
          })),
          status: refreshed.forecast.status
        });
        const transparency = appendTransparencyEntry({
          workspace: options.workspace,
          type: "DIAGNOSTIC_SELF_RUN",
          agentId: auth.agentId,
          artifact: {
            kind: "policy",
            id: `diagnostic-self-run-${out.runId}`,
            sha256: sha256Hex(Buffer.from(JSON.stringify(out), "utf8"))
          }
        });
        json(res, 200, {
          ...out,
          transparencyHash: transparency.hash
        });
        return;
      }

      if (pathname === "/truthguard/validate" && req.method === "POST") {
        if (!(
          auth.roles.has("AGENT") ||
          auth.roles.has("VIEWER") ||
          auth.roles.has("OPERATOR") ||
          auth.roles.has("APPROVER") ||
          auth.roles.has("AUDITOR") ||
          auth.roles.has("OWNER")
        )) {
          json(res, 403, { error: "forbidden" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { output?: unknown }) : {};
        const validation = validateTruthguardForWorkspace({
          workspace: options.workspace,
          output: typeof parsed.output === "undefined" ? parsed : parsed.output
        });
        // P0-18: only an agent's evidence-bound output is observed; a person validating text vouches for nothing.
        const trustTier = auth.roles.has("AGENT") && validation.context.evidenceBound ? "OBSERVED" : "SELF_REPORTED";
        const audit = writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "OUTPUT_VALIDATED",
          severity: validation.result.status === "PASS" ? "LOW" : "MEDIUM",
          agentId: auth.agentId ?? undefined,
          payload: {
            status: validation.result.status,
            violations: validation.result.violations.length,
            trustTier
          }
        });
        json(res, 200, {
          ...validation,
          trustTier,
          auditEventId: audit.eventId
        });
        return;
      }

      const assuranceMatch = pathname.match(/^\/agents\/([^/]+)\/assurance$/);
      if (assuranceMatch && req.method === "POST") {
        if (!requireRouteRoles(["OPERATOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(assuranceMatch[1] ?? ""));
        const reportAuthority = captureReportSigningAuthority(options.workspace, signingAuthority(["OPERATOR", "OWNER"]));
        const assurance = await runAssurance({
          workspace: options.workspace,
          agentId,
          runAll: true,
          mode: "sandbox",
          window: "14d"
        }, { beforePublish: reportAuthority }).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; });
        if (assurance === null) return;
        const refreshedForecasts = await refreshForecastsAfterPrimary([
          { workspace: options.workspace, scope: "agent", targetId: agentId }
        ], reportAuthority, { kind: "assurance-run", id: assurance.assuranceRunId, value: assurance })
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (refreshedForecasts === null) return;
        const [refreshed] = refreshedForecasts;
        emitForecastEvents({
          agentId,
          advisories: refreshed.advisories.map((advisory) => ({
            severity: advisory.severity,
            category: advisory.category
          })),
          status: refreshed.forecast.status
        });
        recomputeOrgAndEmit("ASSURANCE_RUN_COMPLETED", orgNodeIdsForAgent(agentId));
        json(res, 200, { assuranceRunId: assurance.assuranceRunId });
        return;
      }

      const driftCheckMatch = pathname.match(/^\/agents\/([^/]+)\/drift\/check$/);
      if (driftCheckMatch && req.method === "POST") {
        if (!requireRouteRoles(["OPERATOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(driftCheckMatch[1] ?? ""));
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { against?: "previous" }) : {};
        try {
          const result = await driftCheckForStudio({ workspace: options.workspace, agentId, against: parsed.against ?? "previous",
            beforePublish: signingAuthority(["OPERATOR", "OWNER"]), recompute: type => recomputeOrgAndEmit(type, orgNodeIdsForAgent(agentId)),
            forecast: refreshed => emitForecastEvents({ agentId,
              advisories: refreshed.advisories.map(advisory => ({ severity: advisory.severity, category: advisory.category })), status: refreshed.forecast.status }) });
          json(res, 200, result);
        } catch (error) { if (res.headersSent) return; throw error; }
        return;
      }

      const dashboardMatch = pathname.match(/^\/agents\/([^/]+)\/dashboard\/build$/);
      if (dashboardMatch && req.method === "POST") {
        if (!requireRouteRoles(["OPERATOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(dashboardMatch[1] ?? ""));
        const built = buildDashboard({
          workspace: options.workspace,
          agentId,
          outDir: `.amc/agents/${agentId}/dashboard`
        });
        json(res, 200, { outDir: built.outDir });
        return;
      }

      const bundleMatch = pathname.match(/^\/agents\/([^/]+)\/export\/bundle$/);
      if (bundleMatch && req.method === "POST") {
        if (!requireRouteRoles(["OPERATOR", "OWNER", "AUDITOR"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(bundleMatch[1] ?? ""));
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { runId?: string }) : {};
        const runId = parsed.runId ?? agentLastStatus(options.workspace, agentId).latestRun?.runId;
        if (!runId || typeof runId !== "string") {
          json(res, 400, { error: "runId required" });
          return;
        }
        const out = `.amc/agents/${agentId}/bundles/${runId}.amcbundle`;
        const exported = exportEvidenceBundle({
          workspace: options.workspace,
          agentId,
          runId,
          outFile: out
        });
        json(res, 200, { outFile: exported.outFile });
        return;
      }

      const policyMatch = pathname.match(/^\/agents\/([^/]+)\/export\/policy$/);
      if (policyMatch && req.method === "POST") {
        if (!requireRouteRoles(["OPERATOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, decodeURIComponent(policyMatch[1] ?? ""));
        const outDir = `.amc/agents/${agentId}/policy-export`;
        const out = exportPolicyPack({
          workspace: options.workspace,
          agentId,
          targetName: "default",
          outDir
        });
        json(res, 200, { outDir: out.outputDir });
        return;
      }

      if (pathname === "/verify/receipt" && req.method === "POST") {
        if (!hasScope(auth, "receipt:verify")) {
          json(res, 403, scopeRefusal(options.workspace, auth, "receipt:verify"));
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = JSON.parse(body) as { receipt?: string };
        const receipt = parsed.receipt ?? "";
        const verification = verifyReceipt(receipt, getPurposeKeyHistory(options.workspace, "receipt"));
        json(res, verification.ok ? 200 : 400, verification);
        return;
      }

      const governorCheck = pathname.match(/^\/governor\/check$/);
      if (governorCheck && req.method === "POST") {
        if (!hasScope(auth, "governor:check") && !hasAnyRole([...auth.roles], ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          json(res, 403, scopeRefusal(options.workspace, auth, "governor:check"));
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = JSON.parse(body) as {
          agentId?: string;
          actionClass?: string;
          riskTier?: "low" | "med" | "high" | "critical";
          mode?: "SIMULATE" | "EXECUTE";
        };
        const agentId = resolveAgentId(options.workspace, parsed.agentId ?? auth.agentId ?? "default");
        if (!auth.isAdmin && auth.agentId !== agentId) {
          json(res, 403, { error: "scope does not include this agent" });
          return;
        }
        if (!parsed.actionClass) {
          json(res, 400, { error: "actionClass is required" });
          return;
        }
        const check = runGovernorCheck({
          workspace: options.workspace,
          agentId,
          actionClass: normalizeActionClass(parsed.actionClass),
          riskTier: parsed.riskTier ?? "med",
          mode: parsed.mode ?? "SIMULATE"
        });
        json(res, 200, check);
        return;
      }

      if (pathname === "/toolhub/tools" && req.method === "GET") {
        if (!hasScope(auth, "toolhub:intent") && !hasAnyRole([...auth.roles], ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          json(res, 403, scopeRefusal(options.workspace, auth, "toolhub:intent"));
          return;
        }
        json(res, 200, toolhub.listToolContext());
        return;
      }

      if (pathname === "/toolhub/intent" && req.method === "POST") {
        if (!hasScope(auth, "toolhub:intent") && !hasAnyRole([...auth.roles], ["OPERATOR", "OWNER", "APPROVER", "AUDITOR"])) {
          json(res, 403, scopeRefusal(options.workspace, auth, "toolhub:intent"));
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = JSON.parse(body) as {
          agentId?: string;
          workOrderId?: string;
          toolName?: string;
          args?: Record<string, unknown>;
          requestedMode?: "SIMULATE" | "EXECUTE";
        };
        const agentId = resolveAgentId(options.workspace, parsed.agentId ?? auth.agentId ?? "default");
        if (!auth.isAdmin && auth.agentId !== agentId) {
          json(res, 403, { error: "scope does not include this agent" });
          return;
        }
        if (!parsed.toolName) {
          json(res, 400, { error: "toolName is required" });
          return;
        }
        const leaseCheck = verifyLeaseForScope({
          workspace: options.workspace,
          req,
          expectedAgentId: agentId,
          scope: "toolhub:intent"
        });
        if (!leaseCheck.ok) {
          json(res, leaseCheck.status, { error: leaseCheck.error });
          return;
        }
        const response = toolhub.createIntent({
          agentId, initiator,
          workOrderId: parsed.workOrderId,
          toolName: parsed.toolName,
          args: parsed.args ?? {},
          requestedMode: parsed.requestedMode ?? "SIMULATE"
        });
        const intentRecord = toolhub.intent(response.intentId);
        const actionClass = intentRecord?.actionClass ?? "READ_ONLY";
        recordToolhubIntentMetric(agentId, actionClass, parsed.requestedMode ?? "SIMULATE");
        if (response.approvalRequired) {
          recordApprovalRequestMetric(actionClass, "med");
        }
        const approvalDelivery = response.approvalRequired && response.approvalRequestId
          ? await deliverApprovalLifecycle({
              workspace: options.workspace,
              agentId,
              approvalRequestId: response.approvalRequestId,
              trigger: "REQUEST_CREATED",
              reviewBasePath: options.publicConsoleBasePath
            })
          : undefined;
        if (response.approvalRequired && response.approvalRequestId) {
          emitOrgEvent("APPROVAL_REQUEST_CREATED", orgNodeIdsForAgent(agentId));
        }
        json(res, 200, {
          ...response,
          ...(approvalDelivery ? { approvalDelivery } : {})
        });
        return;
      }

      if (pathname === "/toolhub/execute" && req.method === "POST") {
        if (!hasScope(auth, "toolhub:execute") && !hasAnyRole([...auth.roles], ["OPERATOR", "OWNER", "APPROVER", "AUDITOR"])) {
          json(res, 403, scopeRefusal(options.workspace, auth, "toolhub:execute"));
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = JSON.parse(body) as { intentId?: string; execTicket?: string; approvalId?: string; approvalRequestId?: string };
        if (!parsed.intentId) {
          json(res, 400, { error: "intentId is required" });
          return;
        }
        const intentAgent = toolhub.intentAgentId(parsed.intentId);
        if (!intentAgent) {
          json(res, 404, { error: "intent not found" });
          return;
        }
        // Refuse before an execution can consume its intent, ticket or approval.
        if (!auth.isAdmin && auth.agentId !== null && intentAgent !== auth.agentId) {
          json(res, 403, { error: "scope does not include this agent" });
          return;
        }
        const leaseCheck = verifyLeaseForScope({
          workspace: options.workspace,
          req,
          expectedAgentId: intentAgent,
          scope: "toolhub:execute",
          actionClass: toolhub.intent(parsed.intentId)?.actionClass
        });
        if (!leaseCheck.ok) {
          json(res, leaseCheck.status, { error: leaseCheck.error });
          return;
        }
        // Refuse before the intent, ticket or approval is consumed.
        const classCheck = agentExecuteClassCheck({
          workspace: options.workspace,
          auth,
          agentId: intentAgent,
          actionClass: toolhub.intent(parsed.intentId)?.actionClass ?? null
        });
        if (!classCheck.ok) {
          json(res, 403, classCheck.body);
          return;
        }
        const response = await toolhub.executeIntent({
          intentId: parsed.intentId,
          execTicket: parsed.execTicket,
          approvalId: parsed.approvalId,
          approvalRequestId: parsed.approvalRequestId
        });
        const intentRecord = toolhub.intent(parsed.intentId);
        recordToolhubExecMetric(
          response.agentId,
          intentRecord?.request.toolName ?? "unknown",
          intentRecord?.actionClass ?? "READ_ONLY",
          response.allowed ? "ok" : "denied"
        );
        const consumedApprovalId = intentRecord?.approvalRequestId;
        const approvalDelivery = response.allowed && consumedApprovalId && getApprovalInboxItem({
          workspace: options.workspace,
          agentId: response.agentId,
          approvalRequestId: consumedApprovalId
        }).status === "CONSUMED"
          ? await deliverApprovalLifecycle({
              workspace: options.workspace,
              agentId: response.agentId,
              approvalRequestId: consumedApprovalId,
              trigger: "STATUS_CHECK",
              reviewBasePath: options.publicConsoleBasePath
            })
          : undefined;
        if (approvalDelivery) {
          emitOrgEvent("APPROVAL_CONSUMED", orgNodeIdsForAgent(response.agentId));
        }
        json(res, 200, {
          ...response,
          ...(approvalDelivery ? { approvalDelivery } : {})
        });
        return;
      }

      const toolExecutionMatch = pathname.match(/^\/toolhub\/executions\/([^/]+)$/);
      if (toolExecutionMatch && req.method === "GET") {
        if (
          !hasScope(auth, "toolhub:execute") &&
          !hasScope(auth, "toolhub:intent") &&
          !hasAnyRole([...auth.roles], ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])
        ) {
          json(res, 403, { error: "missing toolhub scope" });
          return;
        }
        const executionId = decodeURIComponent(toolExecutionMatch[1] ?? "");
        const execution = toolhub.getExecution(executionId);
        if (!execution) {
          json(res, 404, { error: "execution not found" });
          return;
        }
        if (!auth.isAdmin && auth.agentId !== execution.agentId) {
          json(res, 403, { error: "scope does not include this agent" });
          return;
        }
        json(res, 200, execution);
        return;
      }

      if (pathname === "/toolhub/pending-intents" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, {
          intents: toolhub.listPendingIntents()
        });
        return;
      }

      if (pathname === "/approvals" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const statusFilter = parseApprovalStatus(url.searchParams.get("status") ?? undefined);
        const approvals = listApprovalInbox({
          workspace: options.workspace,
          agentId,
          status: statusFilter
        })
          .map(projectApprovalInboxSummary);
        json(res, 200, {
          agentId,
          approvals
        });
        return;
      }

      if (pathname === "/approvals/requests" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        let filters: ReturnType<typeof parseApprovalActivitySearchParams>;
        try {
          filters = parseApprovalActivitySearchParams(url.searchParams);
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : "invalid approval activity filters" });
          return;
        }
        json(res, 200, searchApprovalActivity({
          workspace: options.workspace,
          agentId,
          filters
        }));
        return;
      }

      const approvalMatch = pathname.match(/^\/approvals\/([^/]+)$/);
      if (approvalMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const approvalId = decodeURIComponent(approvalMatch[1] ?? "");
        const found = pickAgentApproval(options.workspace, approvalId);
        if (!found) {
          json(res, 404, { error: "approval not found" });
          return;
        }
        const observed = await observeApprovalStatusInStudio({
          workspace: options.workspace,
          agentId: found.agentId,
          approvalRequestId: approvalId,
          reviewBasePath: options.publicConsoleBasePath
        });
        if (observed.approvalEvent) {
          emitOrgEvent(observed.approvalEvent, orgNodeIdsForAgent(found.agentId));
        }
        json(res, 200, {
          ...found.approval,
          status: observed.status.status,
          ...(observed.approvalDelivery ? { approvalDelivery: observed.approvalDelivery } : {})
        });
        return;
      }

      const approvalRequestMatch = pathname.match(/^\/approvals\/requests\/([^/]+)$/);
      if (approvalRequestMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const approvalId = decodeURIComponent(approvalRequestMatch[1] ?? "");
        const found = pickAgentApproval(options.workspace, approvalId);
        if (!found) {
          json(res, 404, { error: "approval not found" });
          return;
        }
        const observed = await observeApprovalStatusInStudio({
          workspace: options.workspace,
          agentId: found.agentId,
          approvalRequestId: approvalId,
          reviewBasePath: options.publicConsoleBasePath
        });
        if (observed.approvalEvent) {
          emitOrgEvent(observed.approvalEvent, orgNodeIdsForAgent(found.agentId));
        }
        const inbox = getApprovalInboxItem({
          workspace: options.workspace,
          agentId: found.agentId,
          approvalRequestId: approvalId
        });
        json(res, 200, {
          request: inbox.request,
          decisions: inbox.decisions,
          quorum: inbox.quorum,
          status: inbox.status,
          requestIntegrity: inbox.requestIntegrity,
          chainIntegrity: inbox.chainIntegrity,
          contextIntegrity: inbox.contextIntegrity,
          executionReady: inbox.executionReady,
          ...(observed.approvalDelivery ? { approvalDelivery: observed.approvalDelivery } : {})
        });
        return;
      }

      const approvalApproveMatch = pathname.match(/^\/approvals\/([^/]+)\/approve$/);
      const approvalRequestDecideMatch = pathname.match(/^\/approvals\/requests\/([^/]+)\/decide$/);
      if ((approvalApproveMatch || approvalRequestDecideMatch) && req.method === "POST") {
        if (!requireRouteRoles(["APPROVER", "OWNER", "AUDITOR"])) {
          return;
        }
        const approvalId = decodeURIComponent((approvalApproveMatch?.[1] ?? approvalRequestDecideMatch?.[1]) ?? "");
        const found = pickAgentApproval(options.workspace, approvalId);
        if (!found) {
          json(res, 404, { error: "approval not found" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        let input: unknown;
        try {
          input = body ? JSON.parse(body) : {};
        } catch {
          json(res, 400, { error: "invalid approval decision JSON" });
          return;
        }
        const parsedResult = studioApprovalDecisionInputSchema.safeParse(input);
        if (!parsedResult.success) {
          json(res, 400, { error: "invalid approval decision" });
          return;
        }
        let decided: Awaited<ReturnType<typeof decideApprovalInStudio>>;
        try {
          decided = await decideApprovalInStudio({
            workspace: options.workspace,
            agentId: found.agentId,
            approvalRequestId: approvalId,
            actor: {
              isAdmin: auth.isAdmin,
              username: auth.username ?? "admin-token",
              userId: auth.userId ?? "bootstrap-admin",
              roles: [...auth.roles]
            },
            input: parsedResult.data,
            requireExplicitDecision: Boolean(approvalRequestDecideMatch),
            reviewBasePath: options.publicConsoleBasePath,
            writeAudit: (entry) => writeStudioAuditEvent({ workspace: options.workspace, ...entry })
          });
        } catch (error) {
          if (error instanceof ApprovalStudioError) {
            json(res, error.statusCode, { error: error.message });
            return;
          }
          throw error;
        }
        emitOrgEvent(decided.approvalEvent, orgNodeIdsForAgent(found.agentId));
        json(res, 200, {
          approval: decided.approval,
          approvalDelivery: decided.approvalDelivery
        });
        return;
      }

      const approvalDenyMatch = pathname.match(/^\/approvals\/([^/]+)\/deny$/);
      if (approvalDenyMatch && req.method === "POST") {
        if (!requireRouteRoles(["APPROVER", "OWNER", "AUDITOR"])) {
          return;
        }
        const approvalId = decodeURIComponent(approvalDenyMatch[1] ?? "");
        const found = pickAgentApproval(options.workspace, approvalId);
        if (!found) {
          json(res, 404, { error: "approval not found" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        let input: unknown;
        try {
          input = body ? JSON.parse(body) : {};
        } catch {
          json(res, 400, { error: "invalid approval denial JSON" });
          return;
        }
        const parsedResult = studioApprovalDenyInputSchema.safeParse(input);
        if (!parsedResult.success) {
          json(res, 400, { error: "invalid approval denial" });
          return;
        }
        let denied: Awaited<ReturnType<typeof decideApprovalInStudio>>;
        try {
          denied = await decideApprovalInStudio({
            workspace: options.workspace,
            agentId: found.agentId,
            approvalRequestId: approvalId,
            actor: {
              isAdmin: auth.isAdmin,
              username: auth.username ?? "admin-token",
              userId: auth.userId ?? "bootstrap-admin",
              roles: [...auth.roles]
            },
            input: { decision: "DENY", reason: parsedResult.data.reason },
            requireExplicitDecision: true,
            reviewBasePath: options.publicConsoleBasePath,
            writeAudit: (entry) => writeStudioAuditEvent({ workspace: options.workspace, ...entry })
          });
        } catch (error) {
          if (error instanceof ApprovalStudioError) {
            json(res, error.statusCode, { error: error.message });
            return;
          }
          throw error;
        }
        emitOrgEvent(denied.approvalEvent, orgNodeIdsForAgent(found.agentId));
        json(res, 200, {
          approval: denied.approval,
          approvalDelivery: denied.approvalDelivery
        });
        return;
      }

      const approvalCancelMatch = pathname.match(/^\/approvals\/requests\/([^/]+)\/cancel$/);
      if (approvalCancelMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        const approvalId = decodeURIComponent(approvalCancelMatch[1] ?? "");
        const found = pickAgentApproval(options.workspace, approvalId);
        if (!found) {
          json(res, 404, { error: "approval not found" });
          return;
        }
        let cancelled: Awaited<ReturnType<typeof cancelApprovalInStudio>>;
        try {
          cancelled = await cancelApprovalInStudio({
            workspace: options.workspace,
            agentId: found.agentId,
            approvalRequestId: approvalId,
            reviewBasePath: options.publicConsoleBasePath
          });
        } catch (error) {
          if (error instanceof ApprovalStudioError) {
            json(res, error.statusCode, { error: error.message });
            return;
          }
          throw error;
        }
        emitOrgEvent("APPROVAL_CANCELLED", orgNodeIdsForAgent(found.agentId));
        json(res, 200, cancelled);
        return;
      }

      const agentApprovalStatusMatch = pathname.match(/^\/agent\/approvals\/([^/]+)\/status$/);
      if (agentApprovalStatusMatch && req.method === "GET") {
        const approvalId = decodeURIComponent(agentApprovalStatusMatch[1] ?? "");
        const found = pickAgentApproval(options.workspace, approvalId);
        if (!found) {
          json(res, 404, { error: "approval not found" });
          return;
        }
        const leaseCheck = verifyLeaseForScope({
          workspace: options.workspace,
          req,
          expectedAgentId: found.agentId,
          scope: "toolhub:execute"
        });
        if (!leaseCheck.ok) {
          json(res, leaseCheck.status, { error: leaseCheck.error });
          return;
        }
        const observed = await observeApprovalStatusInStudio({
          workspace: options.workspace,
          agentId: found.agentId,
          approvalRequestId: approvalId,
          reviewBasePath: options.publicConsoleBasePath
        });
        if (observed.approvalEvent) {
          emitOrgEvent(observed.approvalEvent, orgNodeIdsForAgent(found.agentId));
        }
        json(res, 200, {
          ...observed.status,
          ...(observed.approvalDelivery ? { approvalDelivery: observed.approvalDelivery } : {})
        });
        return;
      }

      if (pathname === "/mechanic/targets" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        json(res, 200, mechanicTargetsForApi(options.workspace));
        return;
      }

      if (pathname === "/mechanic/targets/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { targets?: unknown; reason?: string }) : {};
        if (!parsed.targets || typeof parsed.targets !== "object") {
          json(res, 400, { error: "targets object is required" });
          return;
        }
        const reason = typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : "";
        const out = await mechanicTargetsApplyForApi({
          workspace: options.workspace,
          targets: parsed.targets as Parameters<typeof mechanicTargetsApplyForApi>[0]["targets"],
          reason,
          actor: auth.username ?? "owner"
        }, () => { signingAuthority(["OWNER"])(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("mechanic signing is read-only"); } if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); })
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "MECHANIC_TARGETS_APPLIED",
          severity: "LOW",
          payload: {
            by: auth.username ?? "owner",
            reason,
            path: out.path
          }
        });
        emitMechanicSse({
          hub: orgSse,
          type: "MECHANIC_TARGETS_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/mechanic/profiles" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        json(res, 200, mechanicProfilesForApi(options.workspace));
        return;
      }

      if (pathname === "/mechanic/profiles/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              profileId?: string;
              mode?: "DESIRED" | "EXCELLENCE";
              scopeType?: "WORKSPACE" | "NODE" | "AGENT";
              scopeId?: string;
              reason?: string;
            })
          : {};
        if (!parsed.profileId) {
          json(res, 400, { error: "profileId is required" });
          return;
        }
        const out = await mechanicProfileApplyForApi({
          workspace: options.workspace,
          profileId: parsed.profileId,
          mode: parsed.mode === "EXCELLENCE" ? "EXCELLENCE" : "DESIRED",
          scopeType: parsed.scopeType ?? "WORKSPACE",
          scopeId: (parsed.scopeId ?? (parsed.scopeType === "WORKSPACE" ? "workspace" : "default")).trim(),
          reason: typeof parsed.reason === "string" ? parsed.reason : "apply mechanic profile",
          actor: auth.username ?? "owner"
        }, () => { signingAuthority(["OWNER"])(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("mechanic signing is read-only"); } if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); })
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "MECHANIC_PROFILE_APPLIED",
          severity: "LOW",
          payload: {
            profileId: out.profile.id,
            scopeType: out.targets.mechanicTargets.scope.type,
            scopeId: out.targets.mechanicTargets.scope.id
          }
        });
        emitMechanicSse({
          hub: orgSse,
          type: "MECHANIC_TARGETS_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/mechanic/tuning" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        json(res, 200, mechanicTuningForApi(options.workspace));
        return;
      }

      if (pathname === "/mechanic/tuning/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users signature invalid; write operations blocked" });
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { tuning?: unknown; reason?: string }) : {};
        if (!parsed.tuning || typeof parsed.tuning !== "object") {
          json(res, 400, { error: "tuning object is required" });
          return;
        }
        const reason = typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : "apply mechanic tuning";
        const out = await mechanicTuningApplyForApi({
          workspace: options.workspace,
          tuning: parsed.tuning as Parameters<typeof mechanicTuningApplyForApi>[0]["tuning"],
          reason,
          actor: auth.username ?? "owner"
        }, () => { signingAuthority(["OWNER"])(); if (requiresReadOnlyMode(options.workspace)) { if (!res.headersSent) json(res, 403, { error: "users signature invalid; write operations blocked" }); throw new Error("mechanic signing is read-only"); } if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); })
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "MECHANIC_TARGETS_APPLIED",
          severity: "LOW",
          payload: {
            by: auth.username ?? "owner",
            reason,
            path: out.path
          }
        });
        emitMechanicSse({
          hub: orgSse,
          type: "MECHANIC_TARGETS_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/mechanic/gap" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        const scopeRaw = String(url.searchParams.get("scope") ?? "workspace").toLowerCase();
        if (scopeRaw !== "workspace" && scopeRaw !== "agent" && scopeRaw !== "node") {
          json(res, 400, { error: "scope must be workspace|agent|node" });
          return;
        }
        const targetId = url.searchParams.get("targetId") ?? undefined;
        const out = await mechanicGapForApi({
          workspace: options.workspace,
          scopeType: scopeRaw.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT",
          scopeId: targetId
        }, signingAuthority(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        json(res, 200, out);
        return;
      }

      if (pathname === "/mechanic/plan/create" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { scopeType?: "WORKSPACE" | "NODE" | "AGENT"; scopeId?: string }) : {};
        const authority = signingAuthority(["OWNER", "OPERATOR"]);
        const out = await mechanicCreatePlanForApi({
          workspace: options.workspace,
          scopeType: parsed.scopeType ?? "WORKSPACE",
          scopeId: parsed.scopeId ?? (parsed.scopeType === "WORKSPACE" ? "workspace" : "default")
        }, () => { authority(); if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "MECHANIC_PLAN_CREATED",
          severity: "LOW",
          payload: {
            planId: out.plan.planId,
            scopeType: out.plan.scope.type,
            scopeId: out.plan.scope.id
          }
        }, humanAuditAuthority(["OWNER", "OPERATOR"], true));
        emitMechanicSse({
          hub: orgSse,
          type: "MECHANIC_PLAN_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/mechanic/plan/latest" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        json(res, 200, mechanicLatestPlanForApi(options.workspace));
        return;
      }

      if (pathname === "/mechanic/plan/diff" && req.method === "POST") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { planId?: string }) : {};
        if (!parsed.planId) {
          json(res, 400, { error: "planId is required" });
          return;
        }
        json(
          res,
          200,
          mechanicPlanDiffForApi({
            workspace: options.workspace,
            planId: parsed.planId
          })
        );
        return;
      }

      if (pathname === "/mechanic/plan/request-approval" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { planId?: string; reason?: string }) : {};
        if (!parsed.planId) {
          json(res, 400, { error: "planId is required" });
          return;
        }
        const authority = signingAuthority(["OWNER"]);
        const out = await mechanicPlanRequestApprovalForApi({
          workspace: options.workspace,
          planId: parsed.planId,
          actor: auth.username ?? "owner",
          reason: typeof parsed.reason === "string" && parsed.reason.trim().length > 0 ? parsed.reason.trim() : "mechanic plan execution approval"
        }, authority).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "MECHANIC_PLAN_APPROVAL_REQUESTED",
          severity: "LOW",
          payload: {
            planId: out.plan.planId,
            approvals: out.approvalRequests.length
          }
        }, humanAuditAuthority(["OWNER"]));
        emitMechanicSse({
          hub: orgSse,
          type: "MECHANIC_PLAN_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/mechanic/plan/execute" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        if (!requireUnlockedVaultForSigning()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { planId?: string }) : {};
        if (!parsed.planId) {
          json(res, 400, { error: "planId is required" });
          return;
        }
        emitMechanicSse({
          hub: orgSse,
          type: "MECHANIC_EXECUTION_STARTED"
        });
        const authority = signingAuthority(["OWNER"]);
        try {
          const out = await mechanicPlanExecuteForApi({
            workspace: options.workspace,
            planId: parsed.planId
          }, () => { authority(); if (!requireUnlockedVaultForSigning()) throw new Error("vault locked; unlock required for signing"); });
          await writeStudioAuditEventAsync({
            workspace: options.workspace,
            auditType: "MECHANIC_PLAN_EXECUTED",
            severity: "LOW",
            payload: {
              planId: out.plan.planId,
              executed: out.executed.length
            }
          }, humanAuditAuthority(["OWNER"], true));
          emitMechanicSse({
            hub: orgSse,
            type: "MECHANIC_EXECUTION_COMPLETED"
          });
          json(res, 200, out);
        } catch (error) {
          if (res.headersSent) return;
          await writeStudioAuditEventAsync({
            workspace: options.workspace,
            auditType: "MECHANIC_PLAN_EXECUTION_FAILED",
            severity: "HIGH",
            payload: {
              planId: parsed.planId,
              reason: String(error)
            }
          }, humanAuditAuthority(["OWNER"], true));
          emitMechanicSse({
            hub: orgSse,
            type: "MECHANIC_EXECUTION_FAILED"
          });
          json(res, 400, { error: String(error) });
        }
        return;
      }

      if (pathname === "/mechanic/simulate" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { planId?: string }) : {};
        const planId = parsed.planId ?? mechanicLatestPlanForApi(options.workspace).plan?.planId;
        if (!planId) {
          json(res, 400, { error: "planId is required (no latest plan found)" });
          return;
        }
        const out = await mechanicSimulateForApi({
          workspace: options.workspace,
          planId
        }, signingAuthority(["OWNER", "OPERATOR"])).catch(error => { if (res.headersSent) return null; throw error; });
        if (out === null) return;
        await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "MECHANIC_SIMULATION_CREATED",
          severity: "LOW",
          payload: {
            planId,
            simulationId: out.simulation.simulationId,
            status: out.simulation.status
          }
        }, humanAuditAuthority(["OWNER", "OPERATOR"]));
        emitMechanicSse({
          hub: orgSse,
          type: "MECHANIC_SIMULATION_UPDATED"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/mechanic/simulations/latest" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (denyMechanicLeaseAccess()) {
          return;
        }
        json(res, 200, mechanicLatestSimulationForApi(options.workspace));
        return;
      }

      const reportJsonMatch = pathname.match(/^\/runs\/([^/]+)\/report$/);
      if (reportJsonMatch && req.method === "GET") {
        const runId = decodeURIComponent(reportJsonMatch[1] ?? "");
        const report = studioStoredRunReport(res, options.workspace, runId, auth);
        json(res, report.status, report.body);
        return;
      }

      if (pathname === "/bench/policy" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        json(res, 200, benchPolicyForApi(options.workspace));
        return;
      }

      if (pathname === "/bench/policy/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { policy?: unknown }) : {};
        if (!parsed.policy || typeof parsed.policy !== "object") {
          json(res, 400, { error: "policy object required" });
          return;
        }
        const applied = await benchPolicyApplyForApi({
          workspace: options.workspace,
          policy: parsed.policy as ReturnType<typeof loadBenchPolicy>
        }, { beforePublish: signingAuthority(["OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (applied === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "BENCH_POLICY_UPDATED",
          severity: "LOW",
          payload: {
            username: auth.username ?? "owner",
            path: applied.path
          }
        });
        emitBenchSse({
          hub: orgSse,
          type: "BENCH_REGISTRY_UPDATED"
        });
        json(res, 200, applied);
        return;
      }

      if (pathname === "/bench/create" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              scope?: "workspace" | "node" | "agent";
              id?: string;
              outFile?: string;
              windowDays?: number;
              named?: boolean;
              labels?: {
                industry?: "software" | "fintech" | "health" | "manufacturing" | "other";
                agentType?: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
                deployment?: "single" | "host" | "k8s" | "compose";
              };
            })
          : {};
        const created = await benchCreateForApi({
          workspace: options.workspace,
          scope: parsed.scope ?? "workspace",
          id: parsed.id ?? (parsed.scope === "agent" ? resolveAgentId(options.workspace, "default") : "workspace"),
          outFile: parsed.outFile ?? null,
          windowDays: parsed.windowDays,
          named: parsed.named,
          labels: parsed.labels
        }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (created === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "BENCH_CREATED",
          severity: "LOW",
          agentId: parsed.scope === "agent" ? resolveAgentId(options.workspace, parsed.id ?? "default") : undefined,
          payload: {
            benchId: created.bench.benchId,
            sha256: created.sha256,
            outFile: created.outFile
          }
        });
        emitBenchSse({
          hub: orgSse,
          type: "BENCH_CREATED",
          nodeIds: parsed.scope === "agent" ? orgNodeIdsForAgent(resolveAgentId(options.workspace, parsed.id ?? "default")) : undefined
        });
        json(res, 200, created);
        return;
      }

      if (pathname === "/bench/exports" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        json(res, 200, {
          exports: benchExportsForApi(options.workspace)
        });
        return;
      }

      if (pathname === "/bench/imports" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        json(res, 200, {
          imports: benchImportsForApi(options.workspace)
        });
        return;
      }

      if (pathname === "/bench/registries" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        const out = await benchRegistriesForApi(options.workspace, { beforePublish: signingAuthority(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/bench/registry/add" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              replaceAll?: boolean;
              config?: {
                benchRegistries?: {
                  version?: number;
                  registries?: Array<{
                    id: string;
                    type: "file" | "http";
                    base: string;
                    pinnedRegistryFingerprint: string;
                    allowSignerFingerprints?: string[];
                    allowTrustLabels?: Array<"LOW" | "MEDIUM" | "HIGH">;
                    requireBenchProofs?: boolean;
                    autoUpdate?: boolean;
                  }>;
                };
              };
              id?: string;
              type?: "file" | "http";
              base?: string;
              pinnedRegistryFingerprint?: string;
              allowSignerFingerprints?: string[];
              allowTrustLabels?: Array<"LOW" | "MEDIUM" | "HIGH">;
              requireBenchProofs?: boolean;
              autoUpdate?: boolean;
            })
          : {};
        if (parsed.replaceAll && parsed.config?.benchRegistries?.registries) {
          const saved = await benchRegistryApplyForApi({
            workspace: options.workspace,
            config: {
              benchRegistries: {
                version: 1,
                registries: parsed.config.benchRegistries.registries
                  .map((row) => ({
                    id: row.id,
                    type: row.type,
                    base: row.base,
                    pinnedRegistryFingerprint: row.pinnedRegistryFingerprint,
                    allowSignerFingerprints: row.allowSignerFingerprints ?? [],
                    allowTrustLabels: row.allowTrustLabels ?? ["HIGH", "MEDIUM", "LOW"],
                    requireBenchProofs: row.requireBenchProofs ?? true,
                    autoUpdate: row.autoUpdate ?? false
                  }))
                  .sort((a, b) => a.id.localeCompare(b.id))
              }
            }
          }, { beforePublish: signingAuthority(["OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; });
          if (saved === null) return;
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "BENCH_REGISTRY_UPDATED",
            severity: "LOW",
            payload: {
              username: auth.username ?? "owner",
              replaceAll: true
            }
          });
          emitBenchSse({
            hub: orgSse,
            type: "BENCH_REGISTRY_UPDATED"
          });
          json(res, 200, saved);
          return;
        }
        if (!parsed.id || !parsed.type || !parsed.base || !parsed.pinnedRegistryFingerprint) {
          json(res, 400, { error: "id,type,base,pinnedRegistryFingerprint required" });
          return;
        }
        const saved = await benchRegistryAddForApiAsync({ workspace: options.workspace, registry: {
          id: parsed.id, type: parsed.type, base: parsed.base, pinnedRegistryFingerprint: parsed.pinnedRegistryFingerprint,
          allowSignerFingerprints: parsed.allowSignerFingerprints ?? [], allowTrustLabels: parsed.allowTrustLabels ?? ["HIGH", "MEDIUM", "LOW"],
          requireBenchProofs: parsed.requireBenchProofs ?? true, autoUpdate: parsed.autoUpdate ?? false
        } }, { beforePublish: signingAuthority(["OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (saved === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "BENCH_REGISTRY_UPDATED",
          severity: "LOW",
          payload: {
            username: auth.username ?? "owner",
            registryId: parsed.id
          }
        });
        emitBenchSse({
          hub: orgSse,
          type: "BENCH_REGISTRY_UPDATED"
        });
        json(res, 200, saved);
        return;
      }

      if (pathname === "/bench/registry/browse" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        const registryId = url.searchParams.get("registryId");
        if (!registryId) {
          json(res, 400, { error: "registryId required" });
          return;
        }
        const query = url.searchParams.get("query") ?? undefined;
        const browsed = await benchRegistryBrowseForApi({
          workspace: options.workspace,
          registryId,
          query
        }, { beforePublish: signingAuthority(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (browsed === null) return;
        json(res, 200, browsed);
        return;
      }

      if (pathname === "/bench/import" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { registryId?: string; benchRef?: string }) : {};
        if (!parsed.registryId || !parsed.benchRef) {
          json(res, 400, { error: "registryId and benchRef required" });
          return;
        }
        const initialAuthority = signingAuthority(["OWNER", "OPERATOR"]); let authorityRefused = false;
        const beforePublish = () => { try { initialAuthority(); } catch (cause) { authorityRefused = true; throw cause; } };
        try {
          const imported = await benchImportForApi({
            workspace: options.workspace,
            registryId: parsed.registryId,
            benchRef: parsed.benchRef
          }, { beforePublish });
          beforePublish();
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "BENCH_IMPORTED",
            severity: "LOW",
            payload: {
              registryId: parsed.registryId,
              benchRef: parsed.benchRef
            }
          });
          emitBenchSse({
            hub: orgSse,
            type: "BENCH_IMPORTED"
          });
          json(res, 200, imported);
        } catch (error) {
          if (res.headersSent) return;
          if (authorityRefused) throw error;
          beforePublish();
          writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "BENCH_IMPORT_FAILED",
            severity: "MEDIUM",
            payload: {
              registryId: parsed.registryId,
              benchRef: parsed.benchRef,
              reason: String(error)
            }
          });
          try {
            await dispatchIntegrationEventWithAuthority({
              workspace: options.workspace,
              eventName: "BENCH_IMPORT_FAILED",
              agentId: "workspace",
              summary: "Benchmark import failed",
              details: {
                registryId: parsed.registryId,
                benchRef: parsed.benchRef,
                reason: String(error)
              }
            }, beforePublish);
          } catch (deliveryError) {
            if (res.headersSent) return;
            if (authorityRefused) throw new Error("bench import failure delivery authority refused", { cause: new AggregateError([error, deliveryError]) });
          }
          if (res.headersSent) return;
          beforePublish(); json(res, 400, { error: String(error) });
        }
        return;
      }

      if (pathname === "/bench/compare" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              scope?: "workspace" | "node" | "agent";
              id?: string;
              against?: "imported" | `registry:${string}`;
            })
          : {};
        const compared = await benchCompareForApi({
          workspace: options.workspace,
          scope: parsed.scope ?? "workspace",
          id: parsed.id ?? (parsed.scope === "agent" ? resolveAgentId(options.workspace, "default") : "workspace"),
          against: parsed.against
        }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => { if (res.headersSent) return null; throw error; });
        if (compared === null) return;
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "BENCH_COMPARISON_CREATED",
          severity: "LOW",
          payload: {
            scope: parsed.scope ?? "workspace",
            id: parsed.id ?? "workspace",
            against: parsed.against ?? "imported"
          }
        });
        emitBenchSse({
          hub: orgSse,
          type: "BENCH_COMPARISON_UPDATED"
        });
        json(res, 200, compared);
        return;
      }

      if (pathname === "/bench/comparison/latest" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        json(res, 200, benchComparisonLatestForApi(options.workspace));
        return;
      }

      if (pathname === "/bench/publish" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (!auth.isAdmin && auth.agentId) {
          json(res, 403, { error: "lease-auth cannot access bench APIs" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as {
              file?: string;
              registryDir?: string;
              registryKeyPath?: string;
              explicitOwnerAck?: boolean;
              approvalRequestId?: string;
              execute?: boolean;
              agentId?: string;
            })
          : {};
        if (parsed.execute) {
          if (!parsed.approvalRequestId) {
            json(res, 400, { error: "approvalRequestId required when execute=true" });
            return;
          }
          const initialAuthority = signingAuthority(["OWNER"]); let authorityRefused = false;
          const beforePublish = () => { try { initialAuthority(); } catch (cause) { authorityRefused = true; throw cause; } };
          const executed = await benchPublishExecuteForApi({
            workspace: options.workspace,
            approvalRequestId: parsed.approvalRequestId
          }, { beforePublish }).catch(error => { if (res.headersSent) return null; throw error; });
          if (executed === null) return;
          beforePublish(); writeStudioAuditEvent({
            workspace: options.workspace,
            auditType: "BENCH_PUBLISHED",
            severity: "MEDIUM",
            payload: {
              approvalRequestId: parsed.approvalRequestId,
              benchId: executed.benchId,
              version: executed.version
            }
          });
          emitBenchSse({
            hub: orgSse,
            type: "BENCH_PUBLISHED"
          });
          try {
            await dispatchIntegrationEventWithAuthority({
              workspace: options.workspace,
              eventName: "BENCH_PUBLISHED",
              agentId: "workspace",
              summary: "Benchmark published",
              details: {
                benchId: executed.benchId,
                version: executed.version,
                targetPath: executed.targetPath
              }
            }, beforePublish);
          } catch (deliveryError) {
            if (res.headersSent) return;
            if (authorityRefused) throw new Error("benchmark published delivery authority refused", { cause: deliveryError });
          }
          if (res.headersSent) return;
          beforePublish(); json(res, 200, executed);
          return;
        }
        if (!parsed.file || !parsed.registryDir || !parsed.registryKeyPath) {
          json(res, 400, { error: "file, registryDir and registryKeyPath required" });
          return;
        }
        const requested = benchPublishRequestForApi({
          workspace: options.workspace, initiator,
          agentId: parsed.agentId ? resolveAgentId(options.workspace, parsed.agentId) : "default",
          file: parsed.file,
          registryDir: parsed.registryDir,
          registryKeyPath: parsed.registryKeyPath,
          explicitOwnerAck: parsed.explicitOwnerAck === true
        });
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "BENCH_PUBLISH_REQUESTED",
          severity: "LOW",
          payload: {
            approvalRequestId: requested.approvalRequestId,
            benchId: requested.benchId
          }
        });
        json(res, 200, requested);
        return;
      }

      if (pathname === "/benchmarks/ingest" && req.method === "POST") {
        if (!requireRouteRoles(["OPERATOR", "OWNER", "AUDITOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { path?: string }) : {};
        if (!parsed.path) {
          json(res, 400, { error: "path is required" });
          return;
        }
        const refusedTrust = requestTrustOverride(parsed);
        if (refusedTrust) {
          json(res, 400, { error: refusedTrust });
          return;
        }
        const imported = ingestBenchmarks(options.workspace, parsed.path, loadTrustContext());
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "BENCHMARK_INGESTED",
          severity: "LOW",
          payload: {
            count: imported.imported.length
          }
        });
        recomputeOrgAndEmit("BENCHMARK_INGESTED");
        json(res, 200, imported);
        return;
      }

      if (pathname === "/benchmarks/list" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const rows = listImportedBenchmarks(options.workspace).map((row) => row.bench);
        json(res, 200, {
          benchmarks: rows
        });
        return;
      }

      if (pathname === "/benchmarks/stats" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const groupBy = url.searchParams.get("groupBy");
        const stats = benchmarkStats({
          workspace: options.workspace,
          groupBy: groupBy === "archetype" || groupBy === "riskTier" || groupBy === "trustLabel" ? groupBy : undefined
        });
        json(res, 200, stats);
        return;
      }

      if (pathname === "/outcomes/verify" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        json(res, 200, outcomesVerifyCli({
          workspace: options.workspace,
          agentId
        }));
        return;
      }

      if (pathname === "/outcomes/report" && req.method === "GET") {
        const roles: UserRole[] = ["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"];
        if (!requireRouteRoles(roles)) return;
        const beforePublish = signingAuthority(roles);
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default"), window = url.searchParams.get("window") ?? "14d";
        const result = await outcomesReportCliAsync({ workspace: options.workspace, agentId, window }, { beforePublish })
          .catch(error => { if (res.headersSent) return null; throw error; });
        if (result) json(res, 200, { ...result, report: JSON.parse(readUtf8(result.jsonPath)) });
        return;
      }

      if (pathname === "/outcomes/history" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const limit = Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20);
        json(res, 200, {
          agentId,
          rows: listOutcomeHistory(options.workspace, agentId, limit)
        });
        return;
      }

      if (pathname === "/outcomes/fleet" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const window = url.searchParams.get("window") ?? "30d";
        const out = outcomesFleetReportCli({
          workspace: options.workspace,
          window
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/experiments/list" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const list = experimentListCli({
          workspace: options.workspace,
          agentId
        });
        json(res, 200, list);
        return;
      }

      if (pathname === "/experiments/history" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        json(res, 200, {
          agentId,
          rows: listExperimentHistory(options.workspace, agentId)
        });
        return;
      }

      if (pathname === "/experiments/optimizers" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const limit = Math.max(1, Number(url.searchParams.get("limit") ?? "10") || 10);
        json(res, 200, {
          agentId,
          rows: experimentOptimizerListCli({
            workspace: options.workspace,
            agentId,
            limit,
            redacted: true
          })
        });
        return;
      }

      if (pathname === "/experiments/optimize" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; rcaSelector?: string; rca?: string }) : {};
        const agentId = resolveAgentId(options.workspace, parsed.agentId ?? "default");
        const out = experimentOptimizeCli({
          workspace: options.workspace,
          agentId,
          rcaSelector: parsed.rcaSelector ?? parsed.rca ?? "latest"
        });
        json(res, 200, {
          ...out,
          run: experimentOptimizerShowCli({
            workspace: options.workspace,
            agentId,
            selector: out.run.optimizerRunId,
            redacted: true
          })
        });
        return;
      }

      const optimizerMatch = pathname.match(/^\/experiments\/optimizers\/([^/]+)$/);
      if (optimizerMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const selector = decodeURIComponent(optimizerMatch[1] ?? "");
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        json(res, 200, experimentOptimizerShowCli({
          workspace: options.workspace,
          agentId,
          selector,
          redacted: true
        }));
        return;
      }

      if (pathname === "/experiments/create" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; name?: string; casebookId?: string }) : {};
        if (!parsed.name || !parsed.casebookId) {
          json(res, 400, { error: "name and casebookId are required" });
          return;
        }
        const out = experimentCreateCli({
          workspace: options.workspace,
          agentId: resolveAgentId(options.workspace, parsed.agentId ?? "default"),
          name: parsed.name,
          casebookId: parsed.casebookId
        });
        json(res, 200, out);
        return;
      }

      const experimentBaselineMatch = pathname.match(/^\/experiments\/([^/]+)\/baseline$/);
      if (experimentBaselineMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const experimentId = decodeURIComponent(experimentBaselineMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; config?: string }) : {};
        const config = parsed.config ?? "current";
        const out = experimentSetBaselineCli({
          workspace: options.workspace,
          agentId: resolveAgentId(options.workspace, parsed.agentId ?? "default"),
          experimentId,
          config: config === "current" ? "current" : { path: config }
        });
        json(res, 200, out);
        return;
      }

      const experimentCandidateMatch = pathname.match(/^\/experiments\/([^/]+)\/candidate$/);
      if (experimentCandidateMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const experimentId = decodeURIComponent(experimentCandidateMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; candidateFile?: string }) : {};
        if (!parsed.candidateFile) {
          json(res, 400, { error: "candidateFile is required" });
          return;
        }
        const out = experimentSetCandidateCli({
          workspace: options.workspace,
          agentId: resolveAgentId(options.workspace, parsed.agentId ?? "default"),
          experimentId,
          candidateFile: parsed.candidateFile
        });
        json(res, 200, out);
        return;
      }

      const experimentRunMatch = pathname.match(/^\/experiments\/([^/]+)\/run$/);
      if (experimentRunMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) return;
        const experimentId = decodeURIComponent(experimentRunMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; mode?: "supervise" | "sandbox"; candidateWindow?: string; candidateAgentId?: string }) : {};
        if (typeof parsed.candidateWindow !== "string" || !parsed.candidateWindow.trim()) { json(res, 400, { error: "candidateWindow is required" }); return; }
        if (parsed.candidateAgentId !== undefined && (typeof parsed.candidateAgentId !== "string" || !parsed.candidateAgentId.trim())) { json(res, 400, { error: "candidateAgentId must be a non-empty string" }); return; }
        const out = await experimentRunCliAsync({ workspace: options.workspace, agentId: resolveAgentId(options.workspace, parsed.agentId ?? "default"),
          experimentId, mode: parsed.mode ?? "sandbox", candidateWindow: parsed.candidateWindow, candidateAgentId: parsed.candidateAgentId
        }, { beforePublish: signingAuthority(["OWNER", "OPERATOR"]) }).catch(error => {
          if (res.headersSent || respondReportSigningError(error, (status, result) => json(res, status, result))) return null; throw error;
        });
        if (out) json(res, 200, out);
        return;
      }

      const experimentAnalyzeMatch = pathname.match(/^\/experiments\/([^/]+)\/analyze$/);
      if (experimentAnalyzeMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const experimentId = decodeURIComponent(experimentAnalyzeMatch[1] ?? "");
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const out = experimentAnalyzeCli({
          workspace: options.workspace,
          agentId,
          experimentId
        });
        json(res, 200, out);
        return;
      }

      const experimentGateMatch = pathname.match(/^\/experiments\/([^/]+)\/gate$/);
      if (experimentGateMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const experimentId = decodeURIComponent(experimentGateMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; policyPath?: string }) : {};
        if (!parsed.policyPath) {
          json(res, 400, { error: "policyPath is required" });
          return;
        }
        const out = experimentGateCli({
          workspace: options.workspace,
          agentId: resolveAgentId(options.workspace, parsed.agentId ?? "default"),
          experimentId,
          policyPath: parsed.policyPath
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/compliance/verify" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, verifyComplianceMapsSignature(options.workspace));
        return;
      }

      if (pathname === "/compliance/report" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const framework = parseComplianceFramework(url.searchParams.get("framework")) ?? "SOC2";
        const window = url.searchParams.get("window") ?? "14d";
        const agentId = resolveAgentId(options.workspace, url.searchParams.get("agentId") ?? "default");
        const report = generateComplianceReport({
          workspace: options.workspace,
          framework,
          window,
          agentId
        });
        json(res, 200, report);
        return;
      }

      if (pathname === "/compliance/fleet" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const framework = parseComplianceFramework(url.searchParams.get("framework")) ?? "SOC2";
        const window = url.searchParams.get("window") ?? "30d";
        const report = complianceFleetReportCli({
          workspace: options.workspace,
          framework,
          window
        });
        json(res, 200, report);
        return;
      }

      if (pathname === "/federation/status" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, {
          federationSignature: federateVerifyCli(options.workspace),
          peers: federatePeerListCli(options.workspace)
        });
        return;
      }

      if (pathname === "/federation/export" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { out?: string }) : {};
        const out = federateExportCli({
          workspace: options.workspace,
          outFile: parsed.out ?? ".amc/federation/outbox/latest.amcfed"
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/federation/import" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { path?: string }) : {};
        if (!parsed.path) {
          json(res, 400, { error: "path is required" });
          return;
        }
        const out = federateImportCli({
          workspace: options.workspace,
          bundleFile: parsed.path
        });
        recomputeOrgAndEmit("FEDERATION_IMPORTED");
        json(res, 200, out);
        return;
      }

      if (pathname === "/integrations/status" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, {
          signature: integrationsVerifyCli(options.workspace),
          status: integrationsStatusCli(options.workspace)
        });
        return;
      }

      if (pathname === "/integrations/test" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { channelId?: string }) : {};
        const out = await dispatchIntegrationTestWithAuthority({
          workspace: options.workspace,
          channelId: parsed.channelId
        }, signingAuthority(["OWNER", "OPERATOR"])).catch(error => { if (res.headersSent) return null; throw error; });
        if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/integrations/dispatch" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER", "OPERATOR"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as { eventName?: string; agentId?: string; summary?: string; details?: Record<string, unknown> })
          : {};
        if (!parsed.eventName || !parsed.agentId) {
          json(res, 400, { error: "eventName and agentId are required" });
          return;
        }
        const out = await dispatchIntegrationEventWithAuthority({
          workspace: options.workspace,
          eventName: parsed.eventName,
          agentId: parsed.agentId,
          summary: parsed.summary ?? `AMC integration dispatch for ${parsed.eventName}`,
          details: parsed.details
        }, signingAuthority(["OWNER", "OPERATOR"])).catch(error => { if (res.headersSent) return null; throw error; });
        if (out !== null) json(res, 200, out);
        return;
      }

      if (pathname === "/integrations/verify-receipt" && req.method === "POST") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { eventId?: string }) : {};
        if (!parsed.eventId) {
          json(res, 400, { error: "eventId is required" });
          return;
        }
        json(res, 200, verifyOpsReceiptForEvent({
          workspace: options.workspace,
          eventId: parsed.eventId
        }));
        return;
      }

      if (pathname === "/transparency/tail" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const count = Math.max(1, Number(url.searchParams.get("n") ?? "100") || 100);
        json(res, 200, {
          entries: tailTransparencyEntries(options.workspace, count)
        });
        return;
      }

      if (pathname === "/transparency/verify" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, verifyTransparencyLog(options.workspace));
        return;
      }

      if (pathname === "/transparency/merkle/verify" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, verifyTransparencyMerkle(options.workspace));
        return;
      }

      if (pathname === "/transparency/merkle/root" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, {
          current: currentTransparencyMerkleRoot(options.workspace),
          history: listTransparencyMerkleRoots(options.workspace, 20)
        });
        return;
      }

      if (pathname === "/transparency/merkle/prove" && req.method === "POST") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { entryHash?: string }) : {};
        if (!parsed.entryHash) {
          json(res, 400, { error: "entryHash is required" });
          return;
        }
        const out = exportTransparencyProofBundle({
          workspace: options.workspace,
          entryHash: parsed.entryHash,
          outFile: `.amc/transparency/proofs/${parsed.entryHash}.amcproof`
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/transparency/merkle/verify-proof" && req.method === "POST") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { file?: string }) : {};
        if (!parsed.file) {
          json(res, 400, { error: "file is required" });
          return;
        }
        // P0-51: the server operator's trust context decides; a request cannot add pins or allow flags.
        const refused = requestTrustOverride(parsed);
        if (refused) {
          json(res, 400, { error: refused });
          return;
        }
        json(res, 200, verifyWorkspaceProofBundle(options.workspace, parsed.file, loadTrustContext()));
        return;
      }

      if (pathname === "/transparency/raw" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const count = Math.max(1, Number(url.searchParams.get("n") ?? "100") || 100);
        const sealPath = join(options.workspace, ".amc", "transparency", "log.seal.json");
        const sigPath = join(options.workspace, ".amc", "transparency", "log.seal.sig");
        const seal = pathExists(sealPath) ? JSON.parse(readUtf8(sealPath)) : null;
        const sig = pathExists(sigPath) ? JSON.parse(readUtf8(sigPath)) : null;
        const auditorPub = getPublicKeyHistory(options.workspace, "auditor")[0] ?? null;
        json(res, 200, {
          entries: tailTransparencyEntries(options.workspace, count),
          seal,
          sig,
          auditorPub
        });
        return;
      }

      if (pathname === "/plugins/installed" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const listed = listInstalledPlugins(options.workspace);
        const loaded = loadInstalledPluginAssets(options.workspace);
        if (!loaded.integrity.ok) {
          recomputeOrgAndEmit("PLUGIN_INTEGRITY_BROKEN");
        }
        json(res, 200, {
          ...listed,
          loader: {
            ok: loaded.ok,
            integrity: loaded.integrity,
            statuses: loaded.statuses
          }
        });
        return;
      }

      if (pathname === "/plugins/registries" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, {
          config: loadPluginRegistriesConfig(options.workspace),
          signature: verifyPluginRegistriesConfig(options.workspace)
        });
        return;
      }

      if (pathname === "/plugins/registries/apply" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users config signature invalid: read-only mode active" });
          return;
        }
        if (!vaultStatus(options.workspace).unlocked) {
          json(res, 409, { error: "vault is locked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { config?: unknown }) : {};
        if (!parsed.config || typeof parsed.config !== "object") {
          json(res, 400, { error: "config object is required" });
          return;
        }
        const saved = savePluginRegistriesConfig(options.workspace, parsed.config as Parameters<typeof savePluginRegistriesConfig>[1]);
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PLUGIN_REGISTRIES_UPDATED",
          severity: "LOW",
          payload: {
            feature: "plugins.registries",
            path: saved.path
          }
        });
        json(res, 200, {
          path: saved.path,
          sigPath: saved.sigPath
        });
        return;
      }

      if (pathname === "/plugins/registry/browse" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const registryId = url.searchParams.get("id");
        const query = url.searchParams.get("query") ?? undefined;
        if (!registryId) {
          json(res, 400, { error: "registry id is required" });
          return;
        }
        const browsed = await browsePluginRegistryForWorkspace({
          workspace: options.workspace,
          registryId,
          query
        });
        json(res, 200, browsed);
        return;
      }

      if (pathname === "/plugins/install" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users config signature invalid: read-only mode active" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; registryId?: string; pluginRef?: string }) : {};
        if (!parsed.registryId || !parsed.pluginRef) {
          json(res, 400, { error: "registryId and pluginRef are required" });
          return;
        }
        const agentId = resolveAgentId(options.workspace, parsed.agentId ?? "default");
        const requested = await requestPluginInstall({
          workspace: options.workspace, initiator,
          agentId,
          registryId: parsed.registryId,
          pluginRef: parsed.pluginRef,
          action: "install"
        });
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PLUGIN_INSTALL_REQUESTED",
          severity: "LOW",
          agentId,
          payload: {
            pluginId: requested.pluginId,
            version: requested.version,
            approvalRequestId: requested.approvalRequestId
          }
        });
        recomputeOrgAndEmit("PLUGIN_INSTALL_REQUESTED", orgNodeIdsForAgent(agentId));
        json(res, 200, requested);
        return;
      }

      if (pathname === "/plugins/upgrade" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users config signature invalid: read-only mode active" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body
          ? (JSON.parse(body) as { agentId?: string; registryId?: string; pluginId?: string; to?: string })
          : {};
        if (!parsed.registryId || !parsed.pluginId) {
          json(res, 400, { error: "registryId and pluginId are required" });
          return;
        }
        const agentId = resolveAgentId(options.workspace, parsed.agentId ?? "default");
        const requested = await requestPluginInstall({
          workspace: options.workspace, initiator,
          agentId,
          registryId: parsed.registryId,
          pluginRef: `${parsed.pluginId}@${parsed.to ?? "latest"}`,
          action: "upgrade"
        });
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PLUGIN_INSTALL_REQUESTED",
          severity: "LOW",
          agentId,
          payload: {
            action: "upgrade",
            pluginId: requested.pluginId,
            version: requested.version,
            approvalRequestId: requested.approvalRequestId
          }
        });
        recomputeOrgAndEmit("PLUGIN_INSTALL_REQUESTED", orgNodeIdsForAgent(agentId));
        json(res, 200, requested);
        return;
      }

      if (pathname === "/plugins/remove" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users config signature invalid: read-only mode active" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string; pluginId?: string }) : {};
        if (!parsed.pluginId) {
          json(res, 400, { error: "pluginId is required" });
          return;
        }
        const agentId = resolveAgentId(options.workspace, parsed.agentId ?? "default");
        const requested = requestPluginRemove({
          workspace: options.workspace, initiator,
          agentId,
          pluginId: parsed.pluginId
        });
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "PLUGIN_INSTALL_REQUESTED",
          severity: "LOW",
          agentId,
          payload: {
            action: "remove",
            pluginId: requested.pluginId,
            version: requested.version,
            approvalRequestId: requested.approvalRequestId
          }
        });
        recomputeOrgAndEmit("PLUGIN_INSTALL_REQUESTED", orgNodeIdsForAgent(agentId));
        json(res, 200, requested);
        return;
      }

      const pluginApprovalMatch = pathname.match(/^\/plugins\/approvals\/([^/]+)$/);
      if (pluginApprovalMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const approvalRequestId = decodeURIComponent(pluginApprovalMatch[1] ?? "");
        const pending = pendingPluginRequest({
          workspace: options.workspace,
          approvalRequestId
        });
        const picked = pickAgentApproval(options.workspace, approvalRequestId);
        json(res, 200, {
          pending,
          approvalRequest: picked?.approval ?? null,
          approvalDecisions: picked ? listApprovalDecisions({
            workspace: options.workspace,
            agentId: picked.agentId,
            approvalRequestId
          }) : []
        });
        return;
      }

      if (pathname === "/plugins/execute" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users config signature invalid: read-only mode active" });
          return;
        }
        if (!vaultStatus(options.workspace).unlocked) {
          json(res, 409, { error: "vault is locked" });
          return;
        }
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { approvalRequestId?: string }) : {};
        if (!parsed.approvalRequestId) {
          json(res, 400, { error: "approvalRequestId is required" });
          return;
        }
        const executed = executePluginRequest({
          workspace: options.workspace,
          approvalRequestId: parsed.approvalRequestId
        });
        const eventType =
          executed.action === "install"
            ? "PLUGIN_INSTALLED"
            : executed.action === "upgrade"
              ? "PLUGIN_UPGRADED"
              : "PLUGIN_REMOVED";
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: eventType,
          severity: "LOW",
          payload: {
            pluginId: executed.pluginId,
            version: executed.version,
            transparencyHash: executed.transparencyHash
          }
        });
        const currentAgent = resolveAgentId(options.workspace);
        recomputeOrgAndEmit(eventType, orgNodeIdsForAgent(currentAgent));
        const snapshotStatus = await refreshConsole(); if (snapshotStatus === null) return;
        json(res, 200, { ...executed, ...snapshotStatus });
        return;
      }

      if (pathname === "/policy-packs/list" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        json(res, 200, {
          packs: policyPackListCli()
        });
        return;
      }

      if (pathname === "/industry-packs/access" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const { getIndustryPackEntitlement } = await import("../domains/industryPackEntitlement.js");
        json(res, 200, {
          entitlement: getIndustryPackEntitlement(options.workspace), entitlementNote: ENTITLEMENT_NOTE
        });
        return;
      }

      if (pathname === "/industry-packs/checkout" && (req.method === "GET" || req.method === "POST")) {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const { buildIndustryPackCheckoutUrl, getIndustryPackEntitlement } = await import("../domains/industryPackEntitlement.js");
        const entitlement = getIndustryPackEntitlement(options.workspace);
        if (!entitlement.checkoutAvailable) {
          json(res, 503, { error: entitlement.message, entitlement, entitlementNote: ENTITLEMENT_NOTE });
          return;
        }
        const parsed = req.method === "POST"
          ? (JSON.parse(await readBody(req, options.maxRequestBytes ?? 1_048_576) || "{}") as {
              successUrl?: string;
              cancelUrl?: string;
              customerEmail?: string;
              clientReferenceId?: string;
            })
          : {};
        const checkoutUrl = buildIndustryPackCheckoutUrl({
          successUrl: parsed.successUrl ?? url.searchParams.get("successUrl") ?? undefined,
          cancelUrl: parsed.cancelUrl ?? url.searchParams.get("cancelUrl") ?? undefined,
          customerEmail: parsed.customerEmail ?? url.searchParams.get("email") ?? undefined,
          clientReferenceId: parsed.clientReferenceId ?? url.searchParams.get("reference") ?? undefined
        });
        json(res, 200, {
          checkoutUrl,
          entitlement, entitlementNote: ENTITLEMENT_NOTE
        });
        return;
      }

      if (pathname === "/industry-packs/activate" && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users config signature invalid: read-only mode active" });
          return;
        }
        const { licenseKey, expiresAt } = await readLicenseRequest(req, options.maxRequestBytes);
        if (!licenseKey || expiresAt) {
          json(res, 400, { error: licenseKey ? "expiresAt is not accepted: the expiry is the one the issuer signed into the licence" : "licenseKey is required" });
          return;
        }
        const { activateIndustryPackAccess } = await import("../domains/industryPackEntitlement.js");
        let entitlement: ReturnType<typeof activateIndustryPackAccess>;
        // Not configured, unpinned, expired or forged: the reason goes back to the caller, nothing is stored.
        try { entitlement = activateIndustryPackAccess({ workspace: options.workspace, licenseKey }); }
        catch (error) { json(res, 422, { error: error instanceof Error ? error.message : String(error), entitlementNote: ENTITLEMENT_NOTE }); return; }
        writeStudioAuditEvent({
          workspace: options.workspace,
          auditType: "INDUSTRY_PACKS_ACTIVATED",
          severity: "LOW",
          payload: {
            source: entitlement.source,
            planId: entitlement.planId,
            expiresAt: entitlement.expiresAt,
            subscriptionId: entitlement.subscriptionId
          }
        });
        json(res, 200, { entitlement, entitlementNote: ENTITLEMENT_NOTE });
        return;
      }

      if (pathname === "/industry-packs/license/verify" && req.method === "POST") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const { licenseKey } = await readLicenseRequest(req, options.maxRequestBytes);
        if (!licenseKey) { json(res, 400, { error: "licenseKey is required" }); return; }
        const { verifyPinnedIndustryPackLicense } = await import("../domains/industryPackEntitlement.js");
        const verification = verifyPinnedIndustryPackLicense(licenseKey, loadTrustContext());
        json(res, verification.valid ? 200 : 422, { ...verification, entitlementNote: ENTITLEMENT_NOTE });
        return;
      }

      if (pathname === "/industry-packs/list" && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const { listIndustryPacks } = await import("../domains/industryPacks.js");
        const { getIndustryPackEntitlement, toIndustryPackCatalogItem } = await import("../domains/industryPackEntitlement.js");
        const { parseStation } = await import("../domains/stations.js");
        const stationParam = url.searchParams.get("station");
        let station: string | null = null;
        try {
          station = stationParam === null ? null : parseStation(stationParam);
        } catch {
          json(res, 400, { error: `unknown station: ${stationParam}` });
          return;
        }
        const entitlement = getIndustryPackEntitlement(options.workspace);
        json(res, 200, {
          entitlement, entitlementNote: ENTITLEMENT_NOTE,
          packs: listIndustryPacks().filter((pack) => station === null || pack.stationId === station)
            .map((pack) => toIndustryPackCatalogItem(pack, entitlement))
        });
        return;
      }

      const industryPackMatch = pathname.match(/^\/industry-packs\/([^/]+)$/);
      if (industryPackMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const { getPackById } = await import("../domains/industryPacks.js");
        const { getIndustryPackEntitlement } = await import("../domains/industryPackEntitlement.js");
        const entitlement = getIndustryPackEntitlement(options.workspace);
        if (!entitlement.active) {
          json(res, 402, {
            error: "industry_packs_locked",
            message: entitlement.message,
            entitlement, entitlementNote: ENTITLEMENT_NOTE
          });
          return;
        }
        const packId = decodeURIComponent(industryPackMatch[1] ?? "");
        const pack = getPackById(packId);
        if (!pack) {
          json(res, 404, { error: "industry pack not found" });
          return;
        }
        json(res, 200, { pack, entitlement, entitlementNote: ENTITLEMENT_NOTE });
        return;
      }

      const policyPackMatch = pathname.match(/^\/policy-packs\/([^/]+)$/);
      if (policyPackMatch && req.method === "GET") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const packId = decodeURIComponent(policyPackMatch[1] ?? "");
        json(res, 200, {
          pack: policyPackDescribeCli(packId)
        });
        return;
      }

      const policyPackDiffMatch = pathname.match(/^\/policy-packs\/([^/]+)\/diff$/);
      if (policyPackDiffMatch && req.method === "POST") {
        if (!requireRouteRoles(["VIEWER", "OPERATOR", "APPROVER", "AUDITOR", "OWNER"])) {
          return;
        }
        const packId = decodeURIComponent(policyPackDiffMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string }) : {};
        const agentId = resolveAgentId(options.workspace, parsed.agentId ?? url.searchParams.get("agentId") ?? "default");
        json(res, 200, {
          packId,
          diff: policyPackDiffCli({
            workspace: options.workspace,
            agentId,
            packId
          })
        });
        return;
      }

      const policyPackApplyMatch = pathname.match(/^\/policy-packs\/([^/]+)\/apply$/);
      if (policyPackApplyMatch && req.method === "POST") {
        if (!requireRouteRoles(["OWNER"])) {
          return;
        }
        if (requiresReadOnlyMode(options.workspace)) {
          json(res, 403, { error: "users config signature invalid: read-only mode active" });
          return;
        }
        const packId = decodeURIComponent(policyPackApplyMatch[1] ?? "");
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = body ? (JSON.parse(body) as { agentId?: string }) : {};
        const owner = signingAuthority(["OWNER"]);
        const applied = await policyPackApplyCliAsync({
          workspace: options.workspace,
          agentId: resolveAgentId(options.workspace, parsed.agentId ?? "default"),
          packId
        }, { beforePublish() { owner(); if (requiresReadOnlyMode(options.workspace)) {
          if (!res.headersSent) json(res, 403, { error: "users config signature invalid: read-only mode active" });
          throw new Error("policy-pack current caller is in read-only mode");
        } } }).catch(error => { if (res.headersSent || respondReportSigningError(error, (status, body) => json(res, status, body))) return null; throw error; });
        if (applied === null) return;
        await writeStudioAuditEventAsync({
          workspace: options.workspace,
          auditType: "HUMAN_POLICY_PACK_APPLY",
          severity: "LOW",
          agentId: applied.agentId,
          payload: {
            packId: applied.packId,
            transparencyHash: applied.transparencyHash
          }
        }, humanAuditAuthority(["OWNER"]));
        recomputeOrgAndEmit("POLICY_PACK_APPLIED", orgNodeIdsForAgent(applied.agentId));
        const snapshotStatus = await refreshConsole(); if (snapshotStatus === null) return;
        json(res, 200, { applied, ...snapshotStatus });
        return;
      }

      const reportMdMatch = pathname.match(/^\/runs\/([^/]+)\/report\.md$/);
      if (reportMdMatch && req.method === "GET") {
        const runId = decodeURIComponent(reportMdMatch[1] ?? "");
        const report = loadRunReport(options.workspace, runId);
        if (!auth.isAdmin && auth.agentId && report.agentId !== auth.agentId) {
          json(res, 403, { error: "scope does not include this agent" });
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "text/markdown; charset=utf-8");
        res.end(generateReport(report, "md") as string);
        return;
      }

      if (pathname === "/onboarding/status" && req.method === "GET") {
        const result = onboardingStatusForApi({
          workspace: options.workspace,
          requestedAgentId: url.searchParams.get("agentId"),
          authAgentId: auth.agentId,
          isAdmin: auth.isAdmin
        });
        json(res, result.status, result.body);
        return;
      }

      if (pathname === "/onboarding/run" && method === "POST") {
        const result = await onboardingRunForApi({
          workspace: options.workspace,
          authAgentId: auth.agentId
        });
        json(res, result.status, result.body);
        return;
      }

      /* ════════════════════════════════════════════════
         CLI BRIDGE — exposes all CLI commands via API
         ════════════════════════════════════════════════ */
      // One handler for both, so the authorisation check has ONE home: these
      // grant the same authority and differ only in whether it is applied once
      // or in a loop. AUTHORISED, not merely authenticated -- see the header of
      // ./cliBridge.ts for why an AGENT-role principal must never reach here.
      if ((pathname === "/cli/exec" || pathname === "/cli/batch") && method === "POST") {
        if (!requireRoles({ auth, res, workspace: options.workspace, roles: [...CLI_BRIDGE_ROLES] })) return;
        const parsed = JSON.parse(await readBody(req, options.maxRequestBytes ?? 1_048_576));
        const result = pathname === "/cli/exec"
          ? await cliBridgeExec(options.workspace, parsed)
          : await cliBridgeBatch(options.workspace, parsed);
        json(res, result.ok ? 200 : 422, result);
        return;
      }

      if (pathname === "/cli/commands" && method === "GET") {
        const commands = await cliBridgeList(options.workspace);
        json(res, 200, { commands });
        return;
      }

      if (pathname === "/cli/validate" && method === "POST") {
        const body = await readBody(req, options.maxRequestBytes ?? 1_048_576);
        const parsed = JSON.parse(body);
        const err = cliBridgeValidate(parsed);
        json(res, 200, { valid: !err, error: err });
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (error) {
      if (res.headersSent) return;
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("PAYLOAD_TOO_LARGE")) {
        json(res, 413, { error: "payload too large" });
        return;
      }
      if (error instanceof SyntaxError) {
        json(res, 400, { error: "invalid JSON body" });
        return;
      }
      if (respondUsersMutationError(req, error, (status, body) => json(res, status, body))) return;
      if (error instanceof TransformPublicationError) { if (!res.headersSent) json(res, 409, { error: error.message, code: error.code, publishedPaths: error.publishedPaths, attemptedPhase: error.attemptedPhase, knownTransparencyHash: error.knownTransparencyHash }); return; }
      json(res, 500, { error: "internal server error" });
    }
  });

  server.on("connection", (socket: Socket) => {
    openSockets.add(socket);
    socket.on("close", () => {
      openSockets.delete(socket);
    });
    if (shuttingDown) {
      socket.end();
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(options.port, options.host, () => resolvePromise());
  });
  const address = server.address();
  const host = typeof address === "object" && address ? address.address : options.host;
  const port = typeof address === "object" && address ? address.port : options.port;

  return {
    server,
    host,
    port,
    url: `http://${host}:${port}`,
    close: async () => {
      shuttingDown = true; clearInterval(schedulerTimer); await Promise.allSettled([...forecastSchedulerWork, ...integrationQueueWork]);
      let nativeCleanupError: unknown;
      try { await nativeTaskService.close(); } catch (error) { nativeCleanupError = error; }
      for (const socket of openSockets) {
        socket.setKeepAlive(false);
      }
      await new Promise<void>((resolvePromise) => {
        clearInterval(schedulerTimer);
        orgSse.close();
        const forceCloseTimer = setTimeout(() => {
          for (const socket of openSockets) {
            socket.destroy();
          }
          resolvePromise();
        }, 8_000);
        server.close(() => {
          clearTimeout(forceCloseTimer);
          resolvePromise();
        });
      });
      const waitUntil = Date.now() + 2_000;
      while (inFlightRequests > 0 && Date.now() < waitUntil) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      closeScoreSessionStores(options.workspace);
      if (nativeCleanupError) throw nativeCleanupError;
    }
  };
}
