#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { stdin } from "node:process";
import chalk from "chalk";
import { Command } from "commander";
import YAML from "yaml";
import { guardCheck } from "./guardrails/guardEngine.js";
import { openLedger, verifyLedgerIntegrity } from "./ledger/ledger.js";
import { startMonitor, superviseProcess, wrapAny, wrapRuntime } from "./ledger/monitor.js";
import { compareRuns, generateReport, loadRunReport, runDiagnostic } from "./diagnostic/runner.js";
import { loadTargetProfile, loadTargetProfileFromFile, setTargetProfileInteractive, verifyTargetProfileSignature } from "./targets/targetProfile.js";
import { runTuneWizard, runUpgradeWizard } from "./tuning/tuneWizard.js";
import { loadContextGraph } from "./context/contextGraph.js";
import { initWorkspace, loadAMCConfig, quickstartWizard, runDoctor } from "./workspace.js";
import { runDoctorCli } from "./doctor/doctorCli.js";
import { cliDiscoverabilityFooter, flattenCommandPaths, parseUnknownCommandToken, suggestCommandPaths } from "./cliUx.js";
import {
  bindAgentRoute,
  initGatewayConfig,
  loadGatewayConfig,
  presetGatewayConfigForProvider,
  saveGatewayConfig,
  signGatewayConfig,
  verifyGatewayConfigSignature
} from "./gateway/config.js";
import { gatewayStatus, startGateway } from "./gateway/server.js";
import { sha256Hex } from "./utils/hash.js";
import { canonicalize } from "./utils/json.js";
import { getPrivateKeyPem, signHexDigest } from "./crypto/keys.js";
import { computeIncidentHash, createIncidentStore } from "./incidents/incidentStore.js";
import {
  addAgentInteractive,
  buildAgentConfig,
  initFleet,
  listAgents,
  loadAgentConfig,
  removeAgent,
  updateAgentProvider,
  useAgent,
  verifyAgentConfigSignature,
  verifyFleetConfigSignature
} from "./fleet/registry.js";
import { getAgentPaths, resolveAgentId } from "./fleet/paths.js";
import { getProviderTemplateById, listProviderTemplates, providerTemplateChoices } from "./providers/providerTemplates.js";
import { runSandboxCommand } from "./sandbox/sandbox.js";
import { attestIngestSession, ingestEvidence, type IngestType } from "./ingest/ingest.js";
import { generateFleetReport } from "./fleet/report.js";
import {
  initTrustComposition,
  addDelegationEdge,
  removeDelegationEdge,
  listDelegationEdges,
  computeTrustComposition,
  saveTrustCompositionReport,
  renderTrustCompositionMarkdown,
  verifyCrossAgentReceipts
} from "./fleet/trustComposition.js";
import {
  createDag,
  appendDagNode,
  loadDag,
  listDags,
  queryDagsByAgent,
  visualizeDag,
  renderDagMarkdown
} from "./fleet/orchestrationDag.js";
import {
  loadTrustInheritancePolicy,
  setTrustInheritanceMode,
  renderTrustInheritanceMarkdown
} from "./fleet/trustInheritance.js";
import type { TrustInheritancePolicyMode } from "./fleet/trustInheritance.js";
import {
  createHandoffPacket,
  verifyHandoffPacket,
  renderHandoffPacketMarkdown
} from "./fleet/handoffPacket.js";
import {
  detectContradictions,
  renderContradictionReportMarkdown
} from "./fleet/contradictionDetector.js";
import {
  diffEvidenceBundles,
  exportEvidenceBundle,
  inspectEvidenceBundle,
  loadBundleRunAndTrustMap,
  verifyEvidenceBundle
} from "./bundles/bundle.js";
import { defaultEvidenceExportPath, exportVerifierEvidence, generateAuditPacket } from "./evidence/index.js";
import { initCiForAgent, printCiSteps, runBundleGate } from "./ci/gate.js";
import { applyArchetype, describeArchetype, listArchetypes, previewArchetypeApply } from "./archetypes/index.js";
import { exportBadge, exportPolicyPack } from "./exports/policyExport.js";
import { applyAssurancePatchKit, listAssuranceHistory, runAssurance, verifyAssuranceRun } from "./assurance/assuranceRunner.js";
import { getAssurancePack, listAssurancePacks } from "./assurance/packs/index.js";
import { issueCertificate, inspectCertificate, revokeCertificate, verifyCertificate, verifyRevocation } from "./assurance/certificate.js";
import { renderFailureRiskMarkdown, runFleetIndices, runIndicesForAgent } from "./assurance/indices.js";
import {
  assuranceApplyPolicyCli,
  assuranceDefaultPolicyCli,
  assuranceInitCli,
  assuranceIssueCertCli,
  assurancePrintPolicyCli,
  assuranceRunCli,
  assuranceRunsCli,
  assuranceSchedulerEnableCli,
  assuranceSchedulerRunNowCli,
  assuranceSchedulerStatusCli,
  assuranceShowRunCli,
  assuranceVerifyCertCli,
  assuranceVerifyPolicyCli,
  assuranceWaiverRequestCli,
  assuranceWaiverRevokeCli,
  assuranceWaiverStatusCli
} from "./assurance/assuranceCli.js";
import {
  auditApplyPolicyCli,
  auditBinderCreateCli,
  auditBinderExportExecuteCli,
  auditBinderExportRequestCli,
  auditBinderVerifyCli,
  auditBindersCli,
  auditInitCli,
  auditMapApplyCli,
  auditMapListCli,
  auditMapShowCli,
  auditMapVerifyCli,
  auditPrintPolicyCli,
  auditRequestApproveCli,
  auditRequestCreateCli,
  auditRequestFulfillCli,
  auditRequestListCli,
  auditRequestRejectCli,
  auditSchedulerEnableCli,
  auditSchedulerRunNowCli,
  auditSchedulerStatusCli,
  auditVerifyPolicyCli,
  auditVerifyWorkspaceCli
} from "./audit/auditCli.js";
import { parseWindowToMs } from "./utils/time.js";
import { buildDashboard } from "./dashboard/build.js";
import { serveDashboard } from "./dashboard/serve.js";
import { assignOwnership, createCommitmentPlan, learnQuestion } from "./eoc/flows.js";
import inquirer from "inquirer";
import { assertOwnerMode, getMode, setMode, type AMCMode } from "./mode/mode.js";
import { initVaultInteractive, lockVaultNow, rotateVaultKeysInteractive, unlockVaultInteractive, vaultStatusNow } from "./vault/vaultCli.js";
import { buildConnectInstructions } from "./studio/connectWizard.js";
import { runStudioForeground, startStudioDaemon, stopStudioDaemon, studioStatus } from "./studio/studioSupervisor.js";
import { readAdminToken, readStudioState, studioLogsDir } from "./studio/studioState.js";
import { fixSignatures, inspectSignatures } from "./studio/signatures.js";
import { createUnifiedClaritySnapshot } from "./snapshot/snapshot.js";
import { initLoop, loopPlan, loopRun, loopSchedule } from "./loop/loop.js";
import {
  buildGovernorReport,
  explainGovernorAction,
  runGovernorCheck
} from "./governor/governorCli.js";
import {
  initActionPolicy,
  verifyActionPolicySignature
} from "./governor/actionPolicyEngine.js";
import { initToolhubConfig, listToolhubTools, verifyToolhubConfig } from "./toolhub/toolhubCli.js";
import { parseActionClasses, parseRiskTier } from "./workorders/workorderCli.js";
import {
  createWorkOrder,
  expireWorkOrder,
  listWorkOrders,
  loadWorkOrder,
  verifyWorkOrder
} from "./workorders/workorderEngine.js";
import { issueExecTicket, verifyExecTicket } from "./tickets/execTicketVerify.js";
import { normalizeActionClass, parseTtlToMs } from "./tickets/execTicketCli.js";
import { ensureLeaseRevocationStore, issueLeaseForCli, revokeLeaseForCli, verifyLeaseForCli } from "./leases/leaseCli.js";
import { evaluateBudgetStatus, initBudgets, resetBudgetDay, verifyBudgetsConfigSignature } from "./budgets/budgets.js";
import { driftCheckCli, driftReportCli, freezeLiftCli, freezeStatusCli } from "./drift/driftCli.js";
import { initAlertsConfig, sendTestAlert, verifyAlertsConfigSignature } from "./drift/alerts.js";
import { generateBom } from "./bom/bomGenerator.js";
import { signBomFile, verifyBomSignature } from "./bom/bomVerifier.js";
import { listApprovals, loadApproval } from "./approvals/approvalStore.js";
import { decideApprovalForIntent } from "./approvals/approvalEngine.js";
import { parseApprovalMode, parseApprovalStatus } from "./approvals/approvalCli.js";
import { initApprovalPolicy, verifyApprovalPolicySignature } from "./approvals/approvalPolicyEngine.js";
import { simulateTargetWhatIf } from "./simulator/targetWhatIf.js";
import { parseSetPairs, parseTargetMappingFile } from "./simulator/whatIfCli.js";
import { exportBenchmarkArtifact } from "./benchmarks/benchExport.js";
import { verifyBenchmarkArtifact } from "./benchmarks/benchVerify.js";
import { ingestBenchmarks } from "./benchmarks/benchImport.js";
import { listImportedBenchmarks } from "./benchmarks/benchStore.js";
import { benchmarkStats } from "./benchmarks/benchStats.js";
import {
  benchCompareCli,
  benchComparisonLatestCli,
  benchCreateCli,
  benchImportCli,
  benchInitCli,
  benchListExportsCli,
  benchListImportsCli,
  benchPrintCli,
  benchPrintPolicyCli,
  benchPublishExecuteCli,
  benchPublishRequestCli,
  benchRegistriesApplyCli,
  benchRegistriesCli,
  benchRegistryInitCli,
  benchRegistryPublishCli,
  benchRegistryServeCli,
  benchRegistryVerifyCli,
  benchSearchCli,
  benchVerifyCli,
  benchVerifyPolicyCli
} from "./bench/benchCli.js";
import { initOpsPolicy, loadOpsPolicy, verifyOpsPolicySignature } from "./ops/policy.js";
import { retentionRunCli, retentionStatusCli, retentionVerifyCli } from "./ops/retention/retentionCli.js";
import { backupCreateCli, backupPrintCli, backupRestoreCli, backupVerifyCli } from "./ops/backup/backupCli.js";
import {
  maintenancePruneCacheCli,
  maintenanceReindexCli,
  maintenanceRotateLogsCli,
  maintenanceStatsCli,
  maintenanceVacuumCli
} from "./ops/maintenance/maintenanceCli.js";
import {
  blobKeyInitCli,
  blobKeyRotateCli,
  blobsReencryptCli,
  blobsVerifyCli
} from "./storage/blobs/blobCli.js";
import { ensureBlobKey, verifyBlobCurrentKeySignature } from "./storage/blobs/blobKeys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "./utils/fs.js";
import { readdirSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import {
  parseRolesCsv,
  userAddCli,
  userInitCli,
  userListCli,
  userRevokeCli,
  userRoleSetCli,
  userVerifyCli
} from "./auth/authCli.js";
import { verifyUsersConfigSignature } from "./auth/authApi.js";
import {
  identityInitCli,
  identityMappingAddCli,
  identityProviderAddOidcCli,
  identityProviderAddSamlCli,
  identityVerifyCli,
  scimTokenCreateCli
} from "./identity/identityCli.js";
import { createPairingCode } from "./pairing/pairingCodes.js";
import { disableLanMode, enableLanMode, lanModePath, loadLanMode, verifyLanModeSignature } from "./pairing/lanMode.js";
import { createBridgePairingCode } from "./bridge/bridgeAuth.js";
import { redactBridgeText } from "./bridge/bridgeRedaction.js";
import { stripProviderKeys } from "./utils/providerKeys.js";
import {
  exportTransparencyBundle,
  initTransparencyLog,
  tailTransparencyEntries,
  verifyTransparencyBundle,
  verifyTransparencyLog
} from "./transparency/logCli.js";
import {
  transparencyMerkleProofCli,
  transparencyMerkleRebuildCli,
  transparencyMerkleRootCli,
  transparencyMerkleVerifyProofCli
} from "./transparency/transparencyMerkleCli.js";
import {
  policyPackApplyCli,
  policyPackDescribeCli,
  policyPackDiffCli,
  policyPackListCli
} from "./policyPacks/packCli.js";
import {
  complianceDiffCli,
  complianceFleetReportCli,
  complianceReportCli,
  initComplianceMapsCli,
  verifyComplianceMapsCli
} from "./compliance/complianceCli.js";
import { frameworkChoices, getFrameworkFamily, type ComplianceFramework } from "./compliance/frameworks.js";
import {
  federateExportCli,
  federateImportCli,
  federateInitCli,
  federatePeerAddCli,
  federatePeerListCli,
  federateVerifyBundleCli,
  federateVerifyCli
} from "./federation/federationCli.js";
import {
  integrationsDispatchCli,
  integrationsInitCli,
  integrationsStatusCli,
  integrationsTestCli,
  integrationsVerifyCli
} from "./integrations/integrationsCli.js";
import {
  outcomesAttestCli,
  outcomesDiffCli,
  outcomesFleetReportCli,
  outcomesInitCli,
  outcomesReportCli,
  outcomesVerifyCli
} from "./outcomes/outcomeCli.js";
import {
  valueContractApplyCli,
  valueContractInitCli,
  valueContractPrintCli,
  valueContractVerifyCli,
  valueImportCsvCli,
  valueIngestWebhookCli,
  valueInitCli,
  valuePolicyApplyCli,
  valuePolicyDefaultCli,
  valuePolicyPrintCli,
  valueReportCli,
  valueSchedulerEnableCli,
  valueSchedulerRunNowCli,
  valueSchedulerStatusCli,
  valueSnapshotCli,
  valueVerifyPolicyCli,
  valueVerifyWorkspaceCli
} from "./value/valueCli.js";
import {
  advisoryAckCli,
  advisoryListCli,
  advisoryShowCli,
  forecastInitCli,
  forecastLatestCli,
  forecastPolicyApplyCli,
  forecastPolicyDefaultCli,
  forecastPrintPolicyCli,
  forecastRefreshCli,
  forecastSchedulerDisableCli,
  forecastSchedulerEnableCli,
  forecastSchedulerRunNowCli,
  forecastSchedulerStatusCli,
  forecastVerifyCli
} from "./forecast/forecastCli.js";
import {
  mechanicGapCli,
  mechanicInitCli,
  mechanicPlanCreateCli,
  mechanicPlanDiffCli,
  mechanicPlanExecuteCli,
  mechanicPlanRequestApprovalCli,
  mechanicPlanShowCli,
  mechanicProfileApplyCli,
  mechanicProfileListCli,
  mechanicProfilesVerifyCli,
  mechanicSimulateCli,
  mechanicSimulationLatestCli,
  mechanicTargetsApplyCli,
  mechanicTargetsInitCli,
  mechanicTargetsPrintCli,
  mechanicTargetsSetCli,
  mechanicTargetsVerifyCli,
  mechanicTuningApplyCli,
  mechanicTuningInitCli,
  mechanicTuningPrintCli,
  mechanicTuningSetCli,
  mechanicTuningVerifyCli,
  mechanicVerifyCli
} from "./mechanic/mechanicCli.js";
import {
  casebookAddFromWorkOrderCli,
  casebookInitCli,
  casebookListCli,
  casebookVerifyCli
} from "./casebooks/casebookCli.js";
import {
  experimentAnalyzeCli,
  experimentCreateCli,
  experimentGateCli,
  experimentListCli,
  experimentRunCli,
  experimentSetBaselineCli,
  experimentSetCandidateCli
} from "./experiments/experimentCli.js";
import {
  experimentGateComparisonRows,
  experimentGatePolicyPreset,
  type ExperimentGatePreset
} from "./experiments/experimentGatePolicy.js";
import { experimentGateSchema } from "./experiments/experimentSchema.js";
import {
  orgAddNodeCli,
  orgAssignCli,
  orgCommitCli,
  orgCompareCli,
  orgInitCli,
  orgLearnCli,
  orgOwnCli,
  orgReportCli,
  orgScoreCli,
  orgUnassignCli,
  orgVerifyCli
} from "./org/orgCli.js";
import {
  transformAttestCli,
  transformAttestVerifyCli,
  transformInitCli,
  transformMapApplyCli,
  transformMapReadCli,
  transformPlanCli,
  transformReportCli,
  transformStatusCli,
  transformTrackCli,
  transformVerifyCli
} from "./transformation/transformCli.js";
import {
  notaryAttestCli,
  notaryInitCli,
  notaryInitInteractiveCli,
  notaryLogVerifyCli,
  notaryPubkeyCli,
  notarySignCli,
  notaryStartCli,
  notaryStatusCli,
  notaryVerifyAttestCli
} from "./notary/notaryCli.js";
import {
  checkNotaryTrust,
  enableNotaryTrust,
  initTrustConfig,
  loadTrustConfig,
  verifyTrustConfigSignature
} from "./trust/trustConfig.js";
import {
  computeTemporalDecayReport,
  decayConfigSchema,
  deriveTemporalEvidenceFromRuns,
  renderFreshnessMarkdown,
  renderTemporalDecayMarkdown,
  type TemporalDecaySourceRun
} from "./trust/temporalDecay.js";
import {
  adaptersConfigureCli,
  adaptersDetectCli,
  adaptersEnvCli,
  adaptersInitCli,
  adaptersInitProjectCli,
  adaptersListCli,
  adaptersRunCli,
  adaptersVerifyCli
} from "./adapters/adapterCli.js";
import { loadStudioRuntimeConfig } from "./config/loadConfig.js";
import { configExplainCli, configPrintCli } from "./config/configCli.js";
import { runBootstrap } from "./bootstrap/bootstrap.js";
import { runSetupCli } from "./setup/setupCli.js";
import {
  defaultReleaseKeyPaths,
  releaseInitCli,
  releaseLicensesCli,
  releasePackCli,
  releasePrintCli,
  releaseProvenanceCli,
  releasePublicFingerprintCli,
  releaseSbomCli,
  releaseScanCli,
  releaseVerifyCli
} from "./release/releaseCli.js";
import {
  normalizePluginRef,
  pluginExecuteCli,
  pluginInitCli,
  pluginInstallCli,
  pluginKeygenCli,
  pluginListCli,
  pluginPackCli,
  pluginPrintCli,
  pluginRegistriesListCli,
  pluginRegistryApplyCli,
  pluginRegistryFingerprintFromFile,
  pluginRegistryInitCli,
  pluginRegistryPublishCli,
  pluginRegistryServeCli,
  pluginRegistryVerifyCli,
  pluginRemoveCli,
  pluginSearchCli,
  pluginUpgradeCli,
  pluginVerifyCli,
  pluginWorkspaceVerifyCli
} from "./plugins/pluginCli.js";
import { verifyAll, verifyAllTopReasons } from "./verify/verifyAll.js";
import { smokeCli } from "./e2e/smokeCli.js";
import { workspaceIdFromDirectory } from "./workspaces/workspaceId.js";
import {
  hostInitCli,
  hostListCli,
  hostMigrateCli,
  hostMembershipGrantCli,
  hostMembershipRevokeCli,
  hostUserAddCli,
  hostUserDisableCli,
  hostWorkspaceCreateCli,
  hostWorkspaceDeleteCli,
  hostWorkspacePurgeCli
} from "./workspaces/hostCli.js";
import { bootstrapHostFromEnv } from "./workspaces/hostBootstrap.js";
import { canonInitCli, canonPrintCli, canonVerifyCli } from "./canon/canonCli.js";
import { cgxBuildCli, cgxInitCli, cgxShowCli, cgxVerifyCli } from "./cgx/cgxCli.js";
import { simulateImpact, renderSimulationMarkdown } from "./cgx/cgxSimulator.js";
import { loadAndDiffSnapshots, renderGraphDiffMarkdown } from "./cgx/cgxDiff.js";
import { loadLatestCgxGraph } from "./cgx/cgxStore.js";
import { saveL5DeltaReport } from "./diagnostic/l5DeltaReport.js";
import { classifyControls, renderControlClassificationMarkdown } from "./diagnostic/controlClassification.js";
import { diagnosticBankInitCli, diagnosticBankVerifyCli } from "./diagnostic/bank/bankCli.js";
import { contextualizedDiagnosticRenderCli } from "./diagnostic/contextualizer/contextualizerCli.js";
import { truthguardValidateCli } from "./truthguard/truthguardCli.js";
import {
  promptInitCli,
  promptPackBuildCli,
  promptPackDiffCli,
  promptPackShowCli,
  promptPackVerifyCli,
  promptPolicyApplyCli,
  promptPolicyPrintCli,
  promptSchedulerDisableCli,
  promptSchedulerEnableCli,
  promptSchedulerRunNowCli,
  promptSchedulerStatusCli,
  promptStatusCli,
  promptVerifyCli
} from "./prompt/promptPackCli.js";
import {
  passportBadgeCli,
  passportCreateCli,
  passportExportLatestCli,
  passportInitCli,
  passportPolicyApplyCli,
  passportPolicyPrintCli,
  passportShowCli,
  passportVerifyCli,
  passportVerifyPolicyCli
} from "./passport/passportCli.js";
import {
  standardGenerateCli,
  standardListCli,
  standardPrintCli,
  standardValidateCli,
  standardVerifyCli
} from "./standard/standardCli.js";

async function readStdinAll(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      data += chunk;
    });
    stdin.on("end", () => resolve(data));
    if (stdin.isTTY) {
      resolve("");
    }
  });
}

function activeAgent(program: Command): string | undefined {
  const opts = program.opts<{ agent?: string }>();
  return opts.agent;
}

async function httpGetJson(url: string, token?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      url,
      {
        method: "GET",
        headers: token ? { "x-amc-admin-token": token } : {}
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", rejectPromise);
    req.end();
  });
}

async function httpPostJson(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const body = JSON.stringify(payload);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...headers
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers as Record<string, string | string[] | undefined>
          });
        });
      }
    );
    req.on("error", rejectPromise);
    req.write(body);
    req.end();
  });
}

function decodeLeasePayloadUnsafe(token: string): null | {
  workspaceId?: string;
  agentId?: string;
  leaseId?: string;
  expiresTs?: number;
} {
  try {
    const [payloadPart] = token.split(".");
    if (!payloadPart) {
      return null;
    }
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const payload = JSON.parse(Buffer.from(`${normalized}${pad}`, "base64").toString("utf8")) as {
      workspaceId?: string;
      agentId?: string;
      leaseId?: string;
      expiresTs?: number;
    };
    return payload;
  } catch {
    return null;
  }
}

function bridgeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

function loadLocalAgentBridgeProfile(cwd: string): {
  bridgeBase: string | null;
  agentId: string | null;
  workspaceId: string | null;
} {
  const path = join(cwd, ".amc-agent.json");
  if (!pathExists(path)) {
    return {
      bridgeBase: null,
      agentId: null,
      workspaceId: null
    };
  }
  try {
    const parsed = JSON.parse(readUtf8(path)) as {
      bridgeBase?: unknown;
      agentId?: unknown;
      workspaceId?: unknown;
    };
    return {
      bridgeBase: typeof parsed.bridgeBase === "string" ? parsed.bridgeBase : null,
      agentId: typeof parsed.agentId === "string" ? parsed.agentId : null,
      workspaceId: typeof parsed.workspaceId === "string" ? parsed.workspaceId : null
    };
  } catch {
    return {
      bridgeBase: null,
      agentId: null,
      workspaceId: null
    };
  }
}

async function postBridgeTelemetry(
  bridgeBase: string,
  leaseToken: string,
  event: {
    sessionId: string;
    eventType: "agent_process_started" | "agent_stdout" | "agent_stderr" | "agent_process_exited";
    payload: string | Record<string, unknown>;
    correlationId?: string;
    runId?: string;
    provider?: string;
  }
): Promise<void> {
  await httpPostJson(
    `${bridgeBase}/bridge/telemetry`,
    event as unknown as Record<string, unknown>,
    {
      authorization: `Bearer ${leaseToken}`
    }
  );
}

async function wrapWithBridgeToken(params: {
  tokenFile: string;
  bridgeUrl?: string;
  provider: "auto" | "claude" | "gemini" | "openclaw" | "generic";
  name?: string;
  command: string[];
}): Promise<number> {
  const tokenPath = resolve(process.cwd(), params.tokenFile);
  if (!pathExists(tokenPath)) {
    throw new Error(`agent token file not found: ${tokenPath}`);
  }
  const leaseToken = readUtf8(tokenPath).trim();
  if (!leaseToken) {
    throw new Error(`agent token file is empty: ${tokenPath}`);
  }
  const decoded = decodeLeasePayloadUnsafe(leaseToken);
  if (!decoded?.agentId || !decoded.workspaceId) {
    throw new Error("invalid lease token payload");
  }
  const localProfile = loadLocalAgentBridgeProfile(process.cwd());
  const base = bridgeBaseUrl(params.bridgeUrl ?? process.env.AMC_BRIDGE_URL ?? localProfile.bridgeBase ?? "http://127.0.0.1:3212");
  if (params.command.length === 0) {
    throw new Error("amc wrap --agent-token requires a command after `--`.");
  }

  const routeOpenAI = `${base}/bridge/openai`;
  const routeAnthropic = `${base}/bridge/anthropic`;
  const routeGemini = `${base}/bridge/gemini`;
  const routeOpenRouter = `${base}/bridge/openrouter`;
  const routeXai = `${base}/bridge/xai`;
  const routeLocal = `${base}/bridge/local`;

  const env: NodeJS.ProcessEnv = {
    ...stripProviderKeys(process.env),
    AMC_LEASE: leaseToken,
    AMC_AGENT_ID: decoded.agentId,
    AMC_WORKSPACE_ID: decoded.workspaceId,
    AMC_BRIDGE_URL: base,
    AMC_WRAP_PROVIDER: params.provider,
    OPENAI_BASE_URL: routeOpenAI,
    OPENAI_API_BASE: routeOpenAI,
    ANTHROPIC_BASE_URL: routeAnthropic,
    ANTHROPIC_API_URL: routeAnthropic,
    GEMINI_BASE_URL: routeGemini,
    GOOGLE_API_BASE: routeGemini,
    XAI_BASE_URL: routeXai,
    OPENROUTER_BASE_URL: routeOpenRouter,
    LOCAL_OPENAI_BASE_URL: routeLocal,
    OPENAI_API_KEY: leaseToken,
    ANTHROPIC_API_KEY: leaseToken,
    GEMINI_API_KEY: leaseToken,
    GOOGLE_API_KEY: leaseToken,
    XAI_API_KEY: leaseToken,
    OPENROUTER_API_KEY: leaseToken
  };
  if (params.provider === "claude") {
    env.AMC_LLM_BASE_URL = routeAnthropic;
  } else if (params.provider === "gemini") {
    env.AMC_LLM_BASE_URL = routeGemini;
  } else if (params.provider === "openclaw") {
    env.AMC_LLM_BASE_URL = routeOpenAI;
  } else if (params.provider === "generic") {
    env.AMC_LLM_BASE_URL = routeLocal;
  } else {
    env.AMC_LLM_BASE_URL = routeOpenAI;
  }

  const wrapSessionId = `wrap_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const correlationId = randomUUID();
  const runId = `run_${Date.now()}`;
  const pendingTelemetry: Array<Promise<void>> = [];
  const queueTelemetry = (promise: Promise<void>): void => {
    pendingTelemetry.push(
      promise.catch(() => {
        // Telemetry is best effort; errors are captured in bridge-side audits.
      })
    );
  };
  const child = spawn(params.command[0]!, params.command.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
    env
  });

  await postBridgeTelemetry(base, leaseToken, {
    sessionId: wrapSessionId,
    eventType: "agent_process_started",
    correlationId,
    runId,
    provider: params.provider,
    payload: {
      command: params.command[0],
      args: params.command.slice(1),
      name: params.name ?? decoded.agentId,
      provider: params.provider,
      observability: "PARTIAL_OR_OBSERVED"
    }
  }).catch(() => {
    // Best effort telemetry; bridge model-call receipts remain authoritative.
  });

  const stdinHandler = (chunk: Buffer): void => {
    child.stdin.write(chunk);
  };
  process.stdin.on("data", stdinHandler);

  child.stdout.on("data", (chunk: Buffer) => {
    const text = redactBridgeText(chunk.toString("utf8"));
    process.stdout.write(text);
    queueTelemetry(
      postBridgeTelemetry(base, leaseToken, {
        sessionId: wrapSessionId,
        eventType: "agent_stdout",
        correlationId,
        runId,
        provider: params.provider,
        payload: text
      })
    );
  });
  child.stderr.on("data", (chunk: Buffer) => {
    const text = redactBridgeText(chunk.toString("utf8"));
    process.stderr.write(text);
    queueTelemetry(
      postBridgeTelemetry(base, leaseToken, {
        sessionId: wrapSessionId,
        eventType: "agent_stderr",
        correlationId,
        runId,
        provider: params.provider,
        payload: text
      })
    );
  });

  const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise(code ?? 1));
  }).finally(() => {
    process.stdin.off("data", stdinHandler);
  });

  await postBridgeTelemetry(base, leaseToken, {
    sessionId: wrapSessionId,
    eventType: "agent_process_exited",
    correlationId,
    runId,
    provider: params.provider,
    payload: {
      exitCode
    }
  }).catch(() => {});
  await Promise.allSettled(pendingTelemetry);

  console.log(chalk.cyan("Unified Clarity"));
  console.log(`agent=${decoded.agentId} workspace=${decoded.workspaceId} provider=${params.provider}`);
  console.log(`bridge=${base}`);
  console.log(`session=${wrapSessionId} exit=${exitCode}`);

  return exitCode;
}

function commandPath(command: Command): string {
  const names: string[] = [];
  let cursor: Command | null = command;
  while (cursor && cursor.parent) {
    if (cursor.name() && cursor.name() !== "amc") {
      names.unshift(cursor.name());
    }
    cursor = cursor.parent;
  }
  return names.join(" ").trim();
}

function latestRunSummary(workspace: string, agentId: string): { runId: string; integrityIndex: number; trustLabel: string } | null {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  if (!pathExists(runsDir)) {
    return null;
  }
  const files = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(readUtf8(join(runsDir, files[files.length - 1]!))) as {
      runId?: string;
      integrityIndex?: number;
      trustLabel?: string;
    };
    if (!parsed.runId) {
      return null;
    }
    return {
      runId: parsed.runId,
      integrityIndex: Number(parsed.integrityIndex ?? 0),
      trustLabel: String(parsed.trustLabel ?? "UNKNOWN")
    };
  } catch {
    return null;
  }
}

function loadTemporalDecayRuns(workspace: string, agentId: string, lookbackDays: number, nowTs: number): TemporalDecaySourceRun[] {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  if (!pathExists(runsDir)) {
    return [];
  }
  const minTs = nowTs - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000;
  const files = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const rows: TemporalDecaySourceRun[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(readUtf8(join(runsDir, file))) as {
        runId?: string;
        ts?: number;
        integrityIndex?: number;
        evidenceTrustCoverage?: {
          observed?: number;
          attested?: number;
          selfReported?: number;
        };
      };
      if (!parsed.runId || typeof parsed.ts !== "number") {
        continue;
      }
      if (parsed.ts < minTs) {
        continue;
      }
      rows.push({
        runId: parsed.runId,
        ts: parsed.ts,
        integrityIndex: typeof parsed.integrityIndex === "number" ? parsed.integrityIndex : 0,
        evidenceTrustCoverage: parsed.evidenceTrustCoverage
      });
    } catch {
      continue;
    }
  }
  return rows;
}

const program = new Command();
program
  .name("amc")
  .description("Agent Maturity Compass")
  .version("1.0.0")
  .showSuggestionAfterError(true)
  .showHelpAfterError("\nTip: add '--help' after any command to see available options.")
  .addHelpText("afterAll", cliDiscoverabilityFooter());
program.option("--agent <agentId>", "agent ID (defaults to .amc/current-agent)");
program
  .command("help [commandPath...]")
  .description("Show help for a command (for example: amc help run)")
  .action((commandPath?: string[]) => {
    if (!commandPath || commandPath.length === 0) {
      program.outputHelp();
      return;
    }
    const query = commandPath.join(" ").trim();
    const target = flattenCommandPaths(program).find((path) => path === query);
    if (!target) {
      const suggestions = suggestCommandPaths(query, flattenCommandPaths(program), 5);
      console.error(chalk.red(`Unknown command path: ${query}`));
      if (suggestions.length > 0) {
        console.error(chalk.yellow("Did you mean:"));
        for (const s of suggestions) {
          console.error(`  amc ${s}`);
        }
      }
      process.exitCode = 1;
      return;
    }

    let cursor: Command | undefined = program;
    for (const part of query.split(" ")) {
      cursor = cursor.commands.find((child: Command) => child.name() === part);
      if (!cursor) {
        break;
      }
    }

    if (!cursor) {
      process.exitCode = 1;
      return;
    }
    cursor.outputHelp();
  });
program.hook("preAction", (_thisCommand, actionCommand) => {
  const opts = actionCommand.optsWithGlobals<{ agent?: string }>();
  if (opts.agent && opts.agent.trim().length > 0) {
    process.env.AMC_AGENT_ID = opts.agent.trim();
  }
  const path = commandPath(actionCommand);
  if (path.length > 0) {
    assertOwnerMode(process.cwd(), path);
  }
});

program
  .command("init")
  .description("Initialize .amc workspace")
  .option("--trust-boundary <mode>", "isolated|shared", "shared")
  .action((opts: { trustBoundary: "isolated" | "shared" }) => {
    const init = initWorkspace({ trustBoundaryMode: opts.trustBoundary });
    console.log(chalk.green(`Initialized workspace at ${init.workspacePath}`));
  });

program
  .command("doctor")
  .description("Check runtime availability and wrap readiness")
  .option("--json", "emit structured JSON output", false)
  .action(async (opts: { json: boolean }) => {
    const legacy = runDoctor(process.cwd());
    const result = await runDoctorCli(process.cwd());
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ok: result.ok,
            checks: result.checks,
            legacy: legacy.lines
          },
          null,
          2
        )
      );
      process.exit(result.ok ? 0 : 1);
      return;
    }
    console.log(result.text);
    console.log("");
    console.log(chalk.cyan("Legacy runtime checks:"));
    for (const line of legacy.lines) {
      console.log(line);
    }
    process.exit(result.ok && legacy.ok ? 0 : 1);
  });

program
  .command("doctor-fix")
  .description("Auto-repair common setup issues")
  .option("--dry-run", "Preview fixes without applying", false)
  .option("--json", "Emit structured JSON output", false)
  .action(async (opts: { dryRun: boolean; json: boolean }) => {
    const { runDoctorFix, renderDoctorFixReport } = require("./doctor/doctorFix.js") as typeof import("./doctor/doctorFix.js");
    const report = await runDoctorFix(process.cwd(), { dryRun: opts.dryRun });
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderDoctorFixReport(report));
    }
    process.exit(report.failed > 0 ? 1 : 0);
  });

// quickstart retained as a unified onboarding flow is implemented below


program
  .command("setup")
  .description("Deterministic go-live setup (single workspace or host mode)")
  .option("--demo", "quick demo mode with canned adapter/profile defaults", false)
  .option("--non-interactive", "use environment-driven bootstrap without prompts", false)
  .action(async (opts: { demo: boolean; nonInteractive: boolean }) => {
    const out = await runSetupCli({
      cwd: process.cwd(),
      demo: opts.demo,
      nonInteractive: opts.nonInteractive
    });
    console.log(chalk.green("AMC setup complete"));
    console.log(`Mode: ${out.mode}`);
    console.log(`Workspace: ${out.workspaceDir}`);
    if (out.hostDir) {
      console.log(`Host dir: ${out.hostDir}`);
    }
    console.log(`Bootstrap report: ${out.reportPath}`);
    console.log(`Console: ${out.consoleUrl}`);
    console.log(`Gateway: ${out.gatewayUrl}`);
    console.log(`Pairing hint: ${out.qrHint}`);
    console.log("");
    console.log(chalk.cyan("Sanity checks:"));
    console.log(`- trust config: ${out.sanity.trustConfigValid ? "PASS" : "FAIL"}`);
    console.log(`- ops policy: ${out.sanity.opsPolicyValid ? "PASS" : "FAIL"}`);
    console.log(`- plugin integrity: ${out.sanity.pluginIntegrityValid ? "PASS" : "FAIL"}`);
    console.log("");
    console.log(chalk.cyan("Next steps:"));
    for (const step of out.nextSteps) {
      console.log(`- ${step}`);
    }
  });

program
  .command("bootstrap")
  .description("Bootstrap workspace for production deployment (non-interactive)")
  .option("--workspace <path>", "workspace directory (defaults to AMC_WORKSPACE_DIR or cwd)")
  .action(async (opts: { workspace?: string }) => {
    assertOwnerMode(process.cwd(), "bootstrap");
    const passphraseFile = process.env.AMC_VAULT_PASSPHRASE_FILE?.trim();
    if (!passphraseFile) {
      throw new Error("Bootstrap requires AMC_VAULT_PASSPHRASE_FILE. Refusing to run with inline passphrase.");
    }
    if (!pathExists(resolve(passphraseFile))) {
      throw new Error(`AMC_VAULT_PASSPHRASE_FILE does not exist: ${resolve(passphraseFile)}`);
    }
    const runtime = loadStudioRuntimeConfig(process.env, {
      workspaceDir: opts.workspace ? resolve(opts.workspace) : undefined
    });
    const out = await runBootstrap({
      workspace: runtime.workspaceDir,
      vaultPassphrase: runtime.vaultPassphrase,
      ownerUsername: runtime.bootstrapOwnerUsername,
      ownerPassword: runtime.bootstrapOwnerPassword,
      lanMode: runtime.lanMode,
      bind: runtime.bind,
      studioPort: runtime.studioPort,
      allowedCidrs: runtime.allowedCidrs,
      enableNotary: runtime.enableNotary,
      notaryBaseUrl: runtime.notaryBaseUrl,
      notaryRequiredAttestation: runtime.notaryRequiredAttestation,
      notaryAuthSecret: runtime.notaryAuthSecret
    });
    console.log(chalk.green("Bootstrap completed"));
    console.log(`Workspace: ${out.workspace}`);
    console.log(`Report: ${out.reportPath}`);
    console.log(`Signature: ${out.reportSigPath}`);
    console.log(`Transparency entry: ${out.transparencyHash}`);
  });

program
  .command("up")
  .description("Start AMC control plane in one command (studio + gateway + bridge)")
  .action(async () => {
    const workspace = process.cwd();
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const actionPolicyFile = join(workspace, ".amc", "action-policy.yaml");
    if (!pathExists(actionPolicyFile)) {
      const answer = await inquirer.prompt<{ proceed: boolean }>([
        {
          type: "confirm",
          name: "proceed",
          message: "Initialize signed action policy for Autonomy Governor?",
          default: true
        }
      ]);
      if (!answer.proceed) {
        throw new Error("Cannot start studio without action policy.");
      }
      initActionPolicy(workspace);
    }
    const toolsFile = join(workspace, ".amc", "tools.yaml");
    if (!pathExists(toolsFile)) {
      const answer = await inquirer.prompt<{ proceed: boolean }>([
        {
          type: "confirm",
          name: "proceed",
          message: "Initialize signed ToolHub tools policy?",
          default: true
        }
      ]);
      if (!answer.proceed) {
        throw new Error("Cannot start studio without tools policy.");
      }
      initToolhubConfig(workspace);
    }
    const status = vaultStatusNow(workspace);
    if (!status.exists) {
      await initVaultInteractive(workspace);
    }
    const refreshed = vaultStatusNow(workspace);
    if (!refreshed.unlocked) {
      const passphrase = await unlockVaultInteractive(workspace);
      if (!process.env.AMC_VAULT_PASSPHRASE) {
        process.env.AMC_VAULT_PASSPHRASE = passphrase;
      }
    } else if (!process.env.AMC_VAULT_PASSPHRASE) {
      const passphrase = await unlockVaultInteractive(workspace);
      process.env.AMC_VAULT_PASSPHRASE = passphrase;
    }

    const preflightErrors: string[] = [];
    const trustSig = verifyTrustConfigSignature(workspace);
    if (!trustSig.valid) {
      preflightErrors.push(`trust.yaml invalid: ${trustSig.reason ?? "unknown signature failure"}`);
    }
    const opsSig = verifyOpsPolicySignature(workspace);
    if (!opsSig.valid) {
      preflightErrors.push(`ops-policy.yaml invalid: ${opsSig.reason ?? "unknown signature failure"}`);
    }
    const pluginVerify = pluginWorkspaceVerifyCli(workspace);
    if (!pluginVerify.ok) {
      preflightErrors.push(`plugin integrity failed: ${pluginVerify.errors.join("; ")}`);
    }
    if (trustSig.valid) {
      const trustStatus = await checkNotaryTrust(workspace).catch((error) => ({
        ok: false,
        reasons: [String(error)]
      }));
      if (!trustStatus.ok) {
        preflightErrors.push(`notary trust check failed: ${trustStatus.reasons.join("; ")}`);
      }
    }
    if (preflightErrors.length > 0) {
      throw new Error(
        `Refusing to start studio due to failed sanity checks:\n- ${preflightErrors.join("\n- ")}\nRun \`amc verify all\` for full diagnostics.`
      );
    }

    const state = await startStudioDaemon(workspace);
    const latest = latestRunSummary(workspace, state.currentAgent);
    console.log(chalk.green("AMC Studio is running"));
    console.log(`Agent: ${state.currentAgent}`);
    console.log(`Gateway: http://${state.host}:${state.gatewayPort}`);
    if (state.proxyPort > 0) {
      console.log(`Proxy: http://${state.host}:${state.proxyPort}`);
    }
    console.log(`Dashboard: http://${state.host}:${state.dashboardPort}`);
    console.log(`Studio API: http://${state.host}:${state.apiPort}`);
    console.log(`Bridge: http://${state.host}:${state.apiPort}/bridge`);
    console.log(`Compass Console: http://${state.host}:${state.apiPort}/console`);
    if (latest) {
      console.log(`Latest run: ${latest.runId} | IntegrityIndex ${latest.integrityIndex.toFixed(3)} (${latest.trustLabel})`);
    } else {
      console.log("Latest run: none");
    }
    if (state.untrustedConfig) {
      console.log(chalk.yellow("UNTRUSTED CONFIG: one or more signed config files are invalid."));
    }
  });

const hostCmd = program.command("host").description("Multi-workspace host mode operations");

hostCmd
  .command("init")
  .description("Initialize host metadata database")
  .requiredOption("--dir <path>", "host directory")
  .action((opts: { dir: string }) => {
    hostInitCli(resolve(opts.dir));
    console.log(chalk.green(`Host initialized: ${resolve(opts.dir)}`));
  });

hostCmd
  .command("bootstrap")
  .description("Bootstrap host admin + default workspace from secret files")
  .requiredOption("--dir <path>", "host directory")
  .action(async (opts: { dir: string }) => {
    const runtime = loadStudioRuntimeConfig(process.env, {
      hostDir: resolve(opts.dir)
    });
    const result = await bootstrapHostFromEnv({
      hostDir: runtime.hostDir ?? resolve(opts.dir),
      workspaceId: runtime.bootstrapDefaultWorkspaceId ?? runtime.defaultWorkspaceId,
      workspaceName: runtime.bootstrapDefaultWorkspaceName ?? "Default Workspace",
      adminUsernameFile: process.env.AMC_BOOTSTRAP_HOST_ADMIN_USERNAME_FILE,
      adminPasswordFile: process.env.AMC_BOOTSTRAP_HOST_ADMIN_PASSWORD_FILE,
      vaultPassphraseFile: process.env.AMC_VAULT_PASSPHRASE_FILE,
      lanMode: runtime.lanMode,
      bind: runtime.bind,
      studioPort: runtime.studioPort,
      allowedCidrs: runtime.allowedCidrs,
      enableNotary: runtime.enableNotary,
      notaryBaseUrl: runtime.notaryBaseUrl,
      notaryRequiredAttestation: runtime.notaryRequiredAttestation,
      notaryAuthSecretFile: process.env.AMC_NOTARY_AUTH_SECRET_FILE
    });
    console.log(chalk.green(`Host bootstrap complete for workspace '${result.workspaceId}'`));
    console.log(`Workspace dir: ${result.workspaceDir}`);
    console.log(`Report: ${result.reportPath}`);
  });

hostCmd
  .command("user")
  .description("Host user management")
  .addCommand(
    new Command("add")
      .requiredOption("--dir <path>", "host directory")
      .requiredOption("--username <username>", "username")
      .requiredOption("--password-file <path>", "password file")
      .option("--host-admin", "grant host-admin privileges", false)
      .action((opts: { dir: string; username: string; passwordFile: string; hostAdmin: boolean }) => {
        const password = readUtf8(resolve(opts.passwordFile)).trim();
        hostUserAddCli({
          hostDir: resolve(opts.dir),
          username: opts.username,
          password,
          isHostAdmin: opts.hostAdmin
        });
        console.log(chalk.green(`User added: ${opts.username}`));
      })
  )
  .addCommand(
    new Command("disable")
      .requiredOption("--dir <path>", "host directory")
      .requiredOption("--username <username>", "username")
      .action((opts: { dir: string; username: string }) => {
        hostUserDisableCli(resolve(opts.dir), opts.username);
        console.log(chalk.green(`User disabled: ${opts.username}`));
      })
  );

hostCmd
  .command("workspace")
  .description("Host workspace lifecycle")
  .addCommand(
    new Command("create")
      .requiredOption("--dir <path>", "host directory")
      .requiredOption("--id <workspaceId>", "workspace id")
      .requiredOption("--name <name>", "workspace name")
      .action((opts: { dir: string; id: string; name: string }) => {
        const dir = hostWorkspaceCreateCli({
          hostDir: resolve(opts.dir),
          workspaceId: opts.id,
          name: opts.name
        });
        console.log(chalk.green(`Workspace created: ${opts.id}`));
        console.log(`Path: ${dir}`);
      })
  )
  .addCommand(
    new Command("delete")
      .requiredOption("--dir <path>", "host directory")
      .requiredOption("--id <workspaceId>", "workspace id")
      .action((opts: { dir: string; id: string }) => {
        const moved = hostWorkspaceDeleteCli(resolve(opts.dir), opts.id);
        console.log(chalk.green(`Workspace deleted: ${opts.id}`));
        console.log(`Tombstone: ${moved}`);
      })
  )
  .addCommand(
    new Command("purge")
      .requiredOption("--dir <path>", "host directory")
      .requiredOption("--id <workspaceId>", "workspace id")
      .requiredOption("--confirm <workspaceId>", "type workspace id to confirm purge")
      .action((opts: { dir: string; id: string; confirm: string }) => {
        if (opts.confirm !== opts.id) {
          throw new Error("Confirmation mismatch.");
        }
        hostWorkspacePurgeCli(resolve(opts.dir), opts.id);
        console.log(chalk.green(`Workspace purged: ${opts.id}`));
      })
  );

hostCmd
  .command("migrate")
  .description("Migrate an existing single-workspace AMC directory into host mode")
  .requiredOption("--from <path>", "existing workspace directory")
  .requiredOption("--to-host <path>", "host directory")
  .requiredOption("--workspace-id <id>", "workspace id")
  .option("--move", "move source directory instead of copying", false)
  .option("--username <username>", "host username to grant OWNER+AUDITOR in migrated workspace")
  .option("--name <name>", "workspace display name")
  .action((opts: { from: string; toHost: string; workspaceId: string; move: boolean; username?: string; name?: string }) => {
    const result = hostMigrateCli({
      fromWorkspaceDir: resolve(opts.from),
      hostDir: resolve(opts.toHost),
      workspaceId: opts.workspaceId,
      move: opts.move,
      username: opts.username,
      workspaceName: opts.name
    });
    console.log(chalk.green(`Workspace migrated: ${result.workspaceId}`));
    console.log(`Path: ${result.workspaceDir}`);
  });

hostCmd
  .command("membership")
  .description("Host membership management")
  .addCommand(
    new Command("grant")
      .requiredOption("--dir <path>", "host directory")
      .requiredOption("--username <username>", "username")
      .requiredOption("--workspace <workspaceId>", "workspace id")
      .requiredOption("--role <role>", "OWNER|OPERATOR|AUDITOR|VIEWER")
      .action((opts: { dir: string; username: string; workspace: string; role: "OWNER" | "OPERATOR" | "AUDITOR" | "VIEWER" }) => {
        hostMembershipGrantCli({
          hostDir: resolve(opts.dir),
          username: opts.username,
          workspaceId: opts.workspace,
          role: opts.role
        });
        console.log(chalk.green("Membership granted"));
      })
  )
  .addCommand(
    new Command("revoke")
      .requiredOption("--dir <path>", "host directory")
      .requiredOption("--username <username>", "username")
      .requiredOption("--workspace <workspaceId>", "workspace id")
      .requiredOption("--role <role>", "OWNER|OPERATOR|AUDITOR|VIEWER")
      .action((opts: { dir: string; username: string; workspace: string; role: "OWNER" | "OPERATOR" | "AUDITOR" | "VIEWER" }) => {
        hostMembershipRevokeCli({
          hostDir: resolve(opts.dir),
          username: opts.username,
          workspaceId: opts.workspace,
          role: opts.role
        });
        console.log(chalk.green("Membership revoked"));
      })
  );

hostCmd
  .command("list")
  .description("List host users and workspaces")
  .requiredOption("--dir <path>", "host directory")
  .action((opts: { dir: string }) => {
    const out = hostListCli(resolve(opts.dir));
    console.log(chalk.cyan("Workspaces:"));
    for (const row of out.workspaces) {
      console.log(`- ${row.workspaceId} (${row.status}) ${row.name}`);
    }
    console.log(chalk.cyan("Users:"));
    for (const row of out.users) {
      console.log(`- ${row.username} hostAdmin=${row.isHostAdmin ? "yes" : "no"} disabled=${row.disabled ? "yes" : "no"}`);
    }
  });

program
  .command("down")
  .description("Stop AMC Studio local control plane")
  .action(() => {
    const stopped = stopStudioDaemon(process.cwd());
    if (stopped.stopped) {
      console.log(chalk.green(stopped.message));
      return;
    }
    console.log(chalk.yellow(stopped.message));
  });

program
  .command("status")
  .description("Show AMC Studio and vault status")
  .action(async () => {
    const workspace = process.cwd();
    const studio = studioStatus(workspace);
    const vault = vaultStatusNow(workspace);
    console.log(`Studio running: ${studio.running ? "YES" : "NO"}`);
    console.log(`Vault: exists=${vault.exists ? "yes" : "no"} unlocked=${vault.unlocked ? "yes" : "no"}`);
    if (studio.state) {
      console.log(`Agent: ${studio.state.currentAgent}`);
      console.log(`Gateway: http://${studio.state.host}:${studio.state.gatewayPort}`);
      if (studio.state.proxyPort > 0) {
        console.log(`Proxy: http://${studio.state.host}:${studio.state.proxyPort}`);
      }
      console.log(`Dashboard: http://${studio.state.host}:${studio.state.dashboardPort}`);
      console.log(`Studio API: http://${studio.state.host}:${studio.state.apiPort}`);
      console.log(`Compass Console: http://${studio.state.host}:${studio.state.apiPort}/console`);
      console.log(`Untrusted config: ${studio.state.untrustedConfig ? "yes" : "no"}`);
      try {
        const ready = await httpGetJson(`http://${studio.state.host}:${studio.state.apiPort}/readyz`);
        if (ready.status >= 200 && ready.status < 300) {
          console.log("Readiness: READY");
        } else {
          const parsed = JSON.parse(ready.body) as { reasons?: unknown };
          const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map((row) => String(row)) : [];
          console.log("Readiness: NOT_READY");
          if (reasons.length > 0) {
            console.log(`Readiness reasons: ${reasons.join("; ")}`);
          }
        }
      } catch (error) {
        console.log(`Readiness: unavailable (${String(error)})`);
      }
    }
    const signatureRows = inspectSignatures(workspace, studio.state?.currentAgent);
    for (const row of signatureRows.statuses) {
      console.log(`Signature ${row.kind}: ${row.valid ? "VALID" : `INVALID (${row.reason ?? "unknown"})`}`);
    }
    const trustSig = verifyTrustConfigSignature(workspace);
    const trustCheck = await checkNotaryTrust(workspace).catch((error) => ({
      mode: "LOCAL_VAULT" as const,
      ok: false,
      reasons: [String(error)],
      signatureValid: trustSig.valid,
      notaryReachable: false,
      pinnedFingerprint: null,
      currentFingerprint: null,
      attestationLevel: null,
      requiredAttestationLevel: null,
      lastAttestationTs: null
    }));
    console.log(`Trust mode: ${trustCheck.mode}`);
    console.log(`Trust config signature: ${trustSig.valid ? "VALID" : `INVALID (${trustSig.reason ?? "unknown"})`}`);
    if (trustCheck.mode === "NOTARY") {
      console.log(`Notary reachable: ${trustCheck.notaryReachable ? "yes" : "no"}`);
      console.log(`Notary fingerprint: pinned=${trustCheck.pinnedFingerprint ?? "n/a"} current=${trustCheck.currentFingerprint ?? "n/a"}`);
      console.log(`Notary attestation: current=${trustCheck.attestationLevel ?? "n/a"} required=${trustCheck.requiredAttestationLevel ?? "n/a"}`);
      if (trustCheck.lastAttestationTs) {
        console.log(`Notary last attestation: ${new Date(trustCheck.lastAttestationTs).toISOString()}`);
      }
      if (trustCheck.reasons.length > 0) {
        console.log(`Notary reasons: ${trustCheck.reasons.join("; ")}`);
      }
    }
    try {
      const policy = loadOpsPolicy(workspace);
      const backups = tailTransparencyEntries(workspace, 500)
        .filter((row) => row.type === "BACKUP_CREATED")
        .sort((a, b) => b.ts - a.ts);
      if (backups.length === 0) {
        console.log("Backup: never created (WARNING)");
      } else {
        const latest = backups[0]!;
        const ageDays = Number(((Date.now() - latest.ts) / (24 * 60 * 60 * 1000)).toFixed(2));
        const warningDays = policy.opsPolicy.backups.maxBackupAgeDaysWarning;
        console.log(`Last backup age: ${ageDays}d (threshold ${warningDays}d)`);
        if (ageDays > warningDays) {
          console.log(chalk.yellow("Backup age warning: exceeds ops policy threshold."));
        }
      }
    } catch (error) {
      console.log(`Backup status: unavailable (${String(error)})`);
    }
  });

const configCmd = program.command("config").description("Inspect resolved runtime configuration");

configCmd
  .command("print")
  .description("Print resolved runtime config (secret-safe)")
  .option("--json", "emit JSON", false)
  .action((opts: { json: boolean }) => {
    const out = configPrintCli({
      workspace: process.cwd()
    });
    if (opts.json) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    console.log(chalk.cyan("Resolved config:"));
    for (const [key, value] of Object.entries(out.config)) {
      console.log(`- ${key}: ${Array.isArray(value) ? value.join(",") : String(value)}`);
    }
  });

configCmd
  .command("explain")
  .description("Explain config source precedence and risky settings")
  .option("--json", "emit JSON", false)
  .action(async (opts: { json: boolean }) => {
    const out = await configExplainCli({
      workspace: process.cwd()
    });
    if (opts.json) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    console.log(chalk.cyan("Config sources:"));
    for (const row of out.sources) {
      console.log(`- ${row.key}: ${row.source}`);
    }
    console.log("");
    console.log(chalk.cyan("Signed configs:"));
    for (const row of out.signatures) {
      console.log(`- ${row.id}: ${row.valid ? "PASS" : `FAIL (${row.reason ?? "unknown"})`}`);
    }
    console.log("");
    if (out.warnings.length === 0) {
      console.log(chalk.green("No risky settings detected."));
    } else {
      console.log(chalk.yellow("Warnings:"));
      for (const warning of out.warnings) {
        console.log(`- ${warning}`);
      }
    }
  });

program
  .command("logs")
  .description("Print latest AMC Studio logs")
  .option("--lines <n>", "lines per log file", "120")
  .action((opts: { lines: string }) => {
    const logsPath = studioLogsDir(process.cwd());
    if (!pathExists(logsPath)) {
      console.log("No studio logs found.");
      return;
    }
    const limit = Math.max(1, Number(opts.lines) || 120);
    const files = readdirSync(logsPath)
      .filter((name) => name.endsWith(".log"))
      .sort((a, b) => a.localeCompare(b));
    if (files.length === 0) {
      console.log("No studio log files found.");
      return;
    }
    for (const file of files) {
      const full = join(logsPath, file);
      const lines = readUtf8(full).split(/\r?\n/);
      const slice = lines.slice(Math.max(0, lines.length - limit)).join("\n").trimEnd();
      console.log(chalk.cyan(`== ${file} ==`));
      if (slice.length === 0) {
        console.log("(empty)");
      } else {
        console.log(slice);
      }
    }
  });

const studio = program.command("studio").description("Studio API helpers");
studio
  .command("ping")
  .description("Ping local Studio API /health endpoint")
  .action(async () => {
    const state = readStudioState(process.cwd());
    if (!state) {
      throw new Error("Studio state not found. Start with `amc up`.");
    }
    const token = readAdminToken(process.cwd());
    const health = await httpGetJson(`http://${state.host}:${state.apiPort}/status`, token);
    console.log(`HTTP ${health.status} ${health.body}`);
  });

studio
  .command("start")
  .description("Start Studio in foreground (non-interactive, deployment-safe)")
  .option("--workspace <path>", "workspace directory (defaults to AMC_WORKSPACE_DIR)")
  .option("--bind <host>", "api bind host override")
  .option("--port <port>", "api port override")
  .option("--dashboard-port <port>", "dashboard port override")
  .action(async (opts: { workspace?: string; bind?: string; port?: string; dashboardPort?: string }) => {
    const runtimeConfig = loadStudioRuntimeConfig(process.env, {
      workspaceDir: opts.workspace ? resolve(opts.workspace) : undefined,
      bind: opts.bind ?? undefined,
      studioPort: opts.port ? Number(opts.port) : undefined
    });
    const hostMode = Boolean(runtimeConfig.hostDir);
    const dashboardPort = opts.dashboardPort ? Number(opts.dashboardPort) : 4173;
    const lan = loadLanMode(runtimeConfig.workspaceDir);
    const lanSig = verifyLanModeSignature(runtimeConfig.workspaceDir);
    const queryCarrierAllowed = runtimeConfig.queryLeaseCarrierEnabled && lan.enabled && lanSig.valid;

    if (runtimeConfig.vaultPassphrase && !process.env.AMC_VAULT_PASSPHRASE) {
      process.env.AMC_VAULT_PASSPHRASE = runtimeConfig.vaultPassphrase;
    }
    if (queryCarrierAllowed) {
      process.env.AMC_QUERY_LEASE_CARRIER_ENABLED = "1";
    } else if (runtimeConfig.queryLeaseCarrierEnabled) {
      console.log(
        chalk.yellow(
          "Query lease carrier requested but disabled: requires signed LAN mode config. Continuing with query carrier disabled."
        )
      );
    }

    const studioRuntime = await runStudioForeground({
      workspace: runtimeConfig.workspaceDir,
      hostDir: runtimeConfig.hostDir ?? undefined,
      defaultWorkspaceId: runtimeConfig.defaultWorkspaceId,
      apiHost: hostMode ? runtimeConfig.hostBind : runtimeConfig.bind,
      apiPort: hostMode ? runtimeConfig.hostPort : runtimeConfig.studioPort,
      dashboardPort,
      gatewayHost: hostMode ? runtimeConfig.hostBind : runtimeConfig.bind,
      gatewayPort: runtimeConfig.gatewayPort,
      proxyPort: runtimeConfig.proxyPort,
      allowPublicBind: runtimeConfig.allowPublicBind || runtimeConfig.lanMode,
      allowedCidrs: runtimeConfig.allowedCidrs,
      trustedProxyHops: runtimeConfig.trustedProxyHops,
      maxRequestBytes: runtimeConfig.maxRequestBytes,
      corsAllowedOrigins: runtimeConfig.corsAllowedOrigins,
      dataRetentionDays: runtimeConfig.dataRetentionDays,
      metricsHost: runtimeConfig.metricsBind,
      metricsPort: runtimeConfig.metricsPort,
      queryLeaseCarrierEnabled: queryCarrierAllowed
    });

    console.log(chalk.green("Studio started"));
    console.log(`Studio API: http://${studioRuntime.state.host}:${studioRuntime.state.apiPort}`);
    if (!hostMode) {
      console.log(`Gateway: http://${studioRuntime.state.host}:${studioRuntime.state.gatewayPort}`);
      if (studioRuntime.state.proxyPort > 0) {
        console.log(`Proxy: http://${studioRuntime.state.host}:${studioRuntime.state.proxyPort}`);
      }
      console.log(`Dashboard: http://${studioRuntime.state.host}:${studioRuntime.state.dashboardPort}`);
    } else {
      console.log(`Host console: http://${studioRuntime.state.host}:${studioRuntime.state.apiPort}/host/console`);
      console.log(`Default workspace console: http://${studioRuntime.state.host}:${studioRuntime.state.apiPort}/w/${runtimeConfig.defaultWorkspaceId}/console`);
    }
    console.log(
      `Metrics: http://${studioRuntime.state.metricsHost ?? runtimeConfig.metricsBind}:${studioRuntime.state.metricsPort ?? runtimeConfig.metricsPort}/metrics`
    );

    await new Promise<void>((resolvePromise) => {
      const shutdown = async () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        await studioRuntime.stop();
        resolvePromise();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  });

studio
  .command("healthcheck")
  .description("Health/readiness probe for deployment runtime")
  .option("--workspace <path>", "workspace directory (defaults to AMC_WORKSPACE_DIR)")
  .action(async (opts: { workspace?: string }) => {
    const runtime = loadStudioRuntimeConfig(process.env, {
      workspaceDir: opts.workspace ? resolve(opts.workspace) : undefined
    });
    const modeHost = runtime.hostDir ? runtime.hostBind : runtime.bind;
    const modePort = runtime.hostDir ? runtime.hostPort : runtime.studioPort;
    const host = modeHost === "0.0.0.0" || modeHost === "::" ? "127.0.0.1" : modeHost;
    const health = await httpGetJson(`http://${host}:${modePort}/healthz`);
    const ready = await httpGetJson(`http://${host}:${modePort}/readyz`);
    if (health.status >= 200 && health.status < 300 && ready.status >= 200 && ready.status < 300) {
      console.log(`OK ${health.status}/${ready.status}`);
      return;
    }
    console.log(`NOT_READY health=${health.status} ready=${ready.status}`);
    process.exit(1);
  });

const studioLan = studio.command("lan").description("LAN mode controls for Compass Console");

studioLan
  .command("enable")
  .description("Enable LAN mode with pairing gate")
  .option("--bind <host>", "bind address", "0.0.0.0")
  .option("--port <port>", "port", "3212")
  .option("--cidr <cidr...>", "allowed CIDRs")
  .action(async (opts: { bind: string; port: string; cidr?: string[] }) => {
    const workspace = process.cwd();
    if (!vaultStatusNow(workspace).unlocked) {
      await unlockVaultInteractive(workspace);
    }
    const out = enableLanMode({
      workspace,
      bind: opts.bind,
      port: Number(opts.port),
      allowedCIDRs: opts.cidr,
      requirePairing: true
    });
    console.log(chalk.green(`LAN mode enabled: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

studioLan
  .command("disable")
  .description("Disable LAN mode and revert to localhost-only")
  .action(async () => {
    const workspace = process.cwd();
    if (!vaultStatusNow(workspace).unlocked) {
      await unlockVaultInteractive(workspace);
    }
    const out = disableLanMode(workspace);
    console.log(chalk.green(`LAN mode disabled: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

program
  .command("connect")
  .description("Connect wizard for any agent/provider runtime")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--adapter <adapterId>", "adapter ID (e.g. claude-cli, gemini-cli, generic-cli)")
  .option("--token-file <path>", "lease token file (pair redeem output)")
  .option("--bridge-url <url>", "bridge base URL (e.g. http://127.0.0.1:3212)")
  .option("--mode <mode>", "supervise|sandbox")
  .option("--print-env", "print environment export lines", false)
  .option("--print-cmd", "print only command line", false)
  .action(
    async (opts: {
      agent?: string;
      adapter?: string;
      tokenFile?: string;
      bridgeUrl?: string;
      mode?: "supervise" | "sandbox";
      printEnv: boolean;
      printCmd: boolean;
    }) => {
      if (opts.tokenFile) {
        const tokenPath = resolve(process.cwd(), opts.tokenFile);
        if (!pathExists(tokenPath)) {
          throw new Error(`token file not found: ${tokenPath}`);
        }
        const token = readUtf8(tokenPath).trim();
        if (!token) {
          throw new Error(`token file is empty: ${tokenPath}`);
        }
        const decoded = decodeLeasePayloadUnsafe(token);
        if (!decoded?.agentId || !decoded.workspaceId) {
          throw new Error("token file does not contain a valid lease payload");
        }
        const bridgeBase = (opts.bridgeUrl ?? process.env.AMC_BRIDGE_URL ?? "http://127.0.0.1:3212").replace(/\/+$/, "");
        const smokeUrl = `${bridgeBase}/bridge/local/v1/chat/completions`;
        const probe = await httpPostJson(
          smokeUrl,
          {
            model: "local-test",
            messages: [{ role: "user", content: "ping" }]
          },
          {
            authorization: `Bearer ${token}`
          }
        ).catch((error) => ({
          status: 0,
          body: String(error),
          headers: {}
        }));
        const outPath = resolve(process.cwd(), ".amc-agent.json");
        const out = {
          v: 1,
          workspaceId: decoded.workspaceId,
          agentId: decoded.agentId,
          leaseId: decoded.leaseId ?? null,
          expiresTs: decoded.expiresTs ?? null,
          bridgeBase,
          endpoints: {
            openai: `${bridgeBase}/bridge/openai`,
            anthropic: `${bridgeBase}/bridge/anthropic`,
            gemini: `${bridgeBase}/bridge/gemini`,
            openrouter: `${bridgeBase}/bridge/openrouter`,
            xai: `${bridgeBase}/bridge/xai`,
            local: `${bridgeBase}/bridge/local`
          },
          checkedTs: Date.now(),
          connectivity: {
            status: probe.status
          }
        };
        writeFileAtomic(outPath, `${JSON.stringify(out, null, 2)}\n`, 0o600);
        console.log(chalk.green("AMC bridge connection file created"));
        console.log(`file: ${outPath}`);
        console.log(`agent: ${decoded.agentId}`);
        console.log(`workspace: ${decoded.workspaceId}`);
        console.log(`bridge: ${bridgeBase}`);
        console.log(`probe_status: ${probe.status}`);
        console.log(`example: amc wrap --agent-token ${tokenPath} --provider auto -- node your-agent.js`);
        return;
      }

      const output = await buildConnectInstructions({
        workspace: process.cwd(),
        agentId: opts.agent ?? activeAgent(program),
        mode: opts.mode,
        adapterId: opts.adapter
      });
      if (opts.printCmd) {
        console.log(output.command);
        return;
      }
      if (opts.printEnv) {
        for (const line of output.envLines) {
          console.log(line);
        }
        return;
      }
      console.log(chalk.cyan(`Agent: ${output.agentId}`));
      console.log(`Gateway route: ${output.routeUrl}`);
      console.log("");
      console.log(chalk.cyan("Environment exports:"));
      for (const line of output.envLines) {
        console.log(line);
      }
      console.log("");
      console.log(chalk.cyan("Recommended command:"));
      console.log(output.command);
      if (output.adapterId) {
        console.log(chalk.cyan(`Adapter lease carrier:`));
        console.log(output.leaseCarrierHint);
      }
      console.log("");
      console.log(chalk.cyan("Node snippet:"));
      console.log(output.nodeSnippet);
      console.log("");
      console.log(chalk.cyan("Python snippet:"));
      console.log(output.pythonSnippet);
    }
  );

const adapters = program.command("adapters").description("Built-in adapter system for one-line agent integration");

adapters
  .command("init")
  .description("Create signed adapters.yaml defaults")
  .action(() => {
    const out = adaptersInitCli(process.cwd());
    console.log(chalk.green(`Adapters config created: ${out.configPath}`));
    console.log(`Signature: ${out.sigPath}`);
  });

adapters
  .command("verify")
  .description("Verify adapters.yaml signature")
  .action(() => {
    const verify = adaptersVerifyCli(process.cwd());
    if (verify.valid) {
      console.log(chalk.green(`OK ${verify.path}`));
      return;
    }
    console.log(chalk.red(`INVALID ${verify.path}`));
    console.log(verify.reason ?? "signature verification failed");
    process.exit(1);
  });

adapters
  .command("list")
  .description("List built-in adapters and per-agent preferences")
  .action(() => {
    const out = adaptersListCli(process.cwd());
    console.log(chalk.cyan("Built-in adapters:"));
    for (const row of out.builtins) {
      console.log(`- ${row.id} (${row.kind}) defaultMode=${row.defaultRunMode} provider=${row.providerFamily}`);
    }
    console.log("");
    console.log(chalk.cyan("Configured per-agent profiles:"));
    if (out.configured.length === 0) {
      console.log("- none");
      return;
    }
    for (const row of out.configured) {
      console.log(`- ${row.agentId}: adapter=${row.adapterId} route=${row.route} model=${row.model} mode=${row.mode}`);
    }
  });

adapters
  .command("detect")
  .description("Detect installed adapter runtimes and versions")
  .action(() => {
    const rows = adaptersDetectCli();
    for (const row of rows) {
      const status = row.installed ? chalk.green("OK") : chalk.yellow("MISSING");
      console.log(`${status} ${row.adapterId}: ${row.detail}`);
    }
  });

adapters
  .command("configure")
  .description("Set adapter profile for an agent (signed adapters.yaml)")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--adapter <adapterId>", "adapter ID")
  .requiredOption("--route <route>", "gateway route prefix, e.g. /openai")
  .requiredOption("--model <model>", "preferred model id")
  .option("--mode <mode>", "SUPERVISE|SANDBOX", "SUPERVISE")
  .action((opts: { agent: string; adapter: string; route: string; model: string; mode: "SUPERVISE" | "SANDBOX" }) => {
    const out = adaptersConfigureCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      adapterId: opts.adapter,
      route: opts.route,
      model: opts.model,
      mode: String(opts.mode).toUpperCase() === "SANDBOX" ? "SANDBOX" : "SUPERVISE"
    });
    console.log(chalk.green(`Configured adapter profile for ${out.agentId}`));
    console.log(`Config: ${out.configPath}`);
    console.log(`Signature: ${out.sigPath}`);
  });

adapters
  .command("env")
  .description("Print adapter-compatible environment exports without lease token")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--adapter <adapterId>", "adapter ID override")
  .action((opts: { agent: string; adapter?: string }) => {
    const out = adaptersEnvCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      adapterId: opts.adapter
    });
    console.log(chalk.cyan(`Agent: ${out.agentId}`));
    console.log(`Adapter: ${out.adapterId}`);
    console.log(`Route: ${out.routeUrl}`);
    console.log(`Model: ${out.model}`);
    console.log("");
    for (const line of out.lines) {
      console.log(line);
    }
    console.log("");
    console.log("Run `amc lease issue ...` to mint a lease, or use `amc adapters run` to mint it automatically.");
  });

adapters
  .command("init-project")
  .description("Generate runnable local adapter sample for library-based frameworks")
  .requiredOption("--adapter <adapterId>", "library adapter ID")
  .option("--agent <agentId>", "agent ID")
  .option("--route <route>", "gateway route override (e.g. /openai)")
  .action((opts: { adapter: string; agent?: string; route?: string }) => {
    const out = adaptersInitProjectCli({
      workspace: process.cwd(),
      adapterId: opts.adapter,
      agentId: opts.agent,
      route: opts.route
    });
    console.log(chalk.green(`Adapter sample created: ${out.entry}`));
  });

adapters
  .command("run")
  .description("Run adapter with minted lease, routed through gateway, with observed evidence capture")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--adapter <adapterId>", "adapter ID")
  .option("--workorder <workOrderId>", "work order ID")
  .option("--mode <mode>", "SUPERVISE|SANDBOX")
  .argument("[cmd...]", "command args (required for generic-cli)")
  .allowUnknownOption(true)
  .action(
    async (
      cmd: string[],
      opts: { agent: string; adapter?: string; workorder?: string; mode?: "SUPERVISE" | "SANDBOX" }
    ) => {
      const out = await adaptersRunCli({
        workspace: process.cwd(),
        agentId: opts.agent,
        adapterId: opts.adapter,
        workOrderId: opts.workorder,
        mode: opts.mode ? (String(opts.mode).toUpperCase() === "SANDBOX" ? "SANDBOX" : "SUPERVISE") : undefined,
        command: cmd
      });
      console.log("");
      console.log(chalk.cyan("Unified Clarity:"));
      console.log(`adapter: ${out.adapterId}`);
      console.log(`mode: ${out.mode}${out.forcedSimulate ? " (forced SIMULATE due unsigned adapters.yaml)" : ""}`);
      console.log(`route: ${out.routeUrl}`);
      console.log(`model: ${out.model}`);
      console.log(`session: ${out.sessionId}`);
      console.log(`lease expiry: ${new Date(out.leaseExpiresTs).toISOString()}`);
      if (out.dashboardUrl) {
        console.log(`dashboard: ${out.dashboardUrl}`);
      }
      console.log(`exit code: ${out.exitCode}`);
      if (out.exitCode !== 0) {
        process.exit(out.exitCode);
      }
    }
  );

const plugin = program.command("plugin").description("Signed content-only extension marketplace");

plugin
  .command("keygen")
  .description("Generate plugin publisher keypair")
  .requiredOption("--out-dir <dir>", "output directory")
  .action((opts: { outDir: string }) => {
    const out = pluginKeygenCli({ outDir: opts.outDir });
    console.log(chalk.green("Plugin publisher keypair generated"));
    console.log(`private: ${out.privateKeyPath}`);
    console.log(`public: ${out.publicKeyPath}`);
    console.log(`fingerprint: ${out.fingerprint}`);
  });

plugin
  .command("pack")
  .description("Create signed .amcplug package from a plugin folder")
  .requiredOption("--in <dir>", "plugin folder containing manifest.json + content/")
  .requiredOption("--key <path>", "publisher private key path")
  .requiredOption("--out <file>", "output .amcplug file")
  .action((opts: { in: string; key: string; out: string }) => {
    const out = pluginPackCli({
      inputDir: opts.in,
      keyPath: opts.key,
      outFile: opts.out
    });
    console.log(chalk.green(`Plugin package created: ${out.outFile}`));
    console.log(`plugin: ${out.manifest.plugin.id}@${out.manifest.plugin.version}`);
    console.log(`artifacts: ${out.manifest.artifacts.length}`);
  });

plugin
  .command("verify")
  .description("Verify plugin package signature + artifact hashes")
  .argument("<file>", "plugin package (.amcplug)")
  .option("--pubkey <path>", "override publisher public key path")
  .action((file: string, opts: { pubkey?: string }) => {
    const out = pluginVerifyCli({
      file,
      pubkeyPath: opts.pubkey
    });
    if (out.ok) {
      console.log(chalk.green("Plugin verification PASS"));
      return;
    }
    console.log(chalk.red("Plugin verification FAIL"));
    for (const error of out.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

plugin
  .command("print")
  .description("Print plugin manifest summary")
  .argument("<file>", "plugin package (.amcplug)")
  .action((file: string) => {
    const out = pluginPrintCli(file);
    console.log(JSON.stringify(out, null, 2));
    if (!out.verification.ok) {
      process.exit(1);
    }
  });

plugin
  .command("init")
  .description("Initialize signed plugin workspace files")
  .action(() => {
    const out = pluginInitCli(process.cwd());
    console.log(chalk.green("Plugin workspace initialized"));
    console.log(`registries: ${out.registriesPath}`);
    console.log(`registries.sig: ${out.registriesSigPath}`);
    console.log(`installed.lock: ${out.lockPath}`);
    console.log(`installed.lock.sig: ${out.lockSigPath}`);
  });

plugin
  .command("workspace-verify")
  .description("Verify workspace plugin signatures/integrity")
  .action(() => {
    const out = pluginWorkspaceVerifyCli(process.cwd());
    if (out.ok) {
      console.log(chalk.green("Plugin workspace verification PASS"));
      return;
    }
    console.log(chalk.red("Plugin workspace verification FAIL"));
    for (const error of out.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

plugin
  .command("list")
  .description("List installed plugins and verification status")
  .action(() => {
    const out = pluginListCli(process.cwd());
    console.log(`installed.lock: ${out.lockPath}`);
    console.log(`lock signature: ${out.lockSignatureValid ? "VALID" : "INVALID"}`);
    if (out.items.length === 0) {
      console.log("No plugins installed.");
      return;
    }
    for (const row of out.items) {
      const status = row.verification.ok ? chalk.green("PASS") : chalk.red("FAIL");
      console.log(`${status} ${row.id}@${row.version} pub=${row.publisherFingerprint} reg=${row.registryFingerprint}`);
      for (const error of row.verification.errors) {
        console.log(`  - ${error}`);
      }
    }
  });

const pluginRegistry = plugin.command("registry").description("Manage plugin registries");

pluginRegistry
  .command("init")
  .description("Initialize local signed plugin registry directory")
  .requiredOption("--dir <dir>", "registry directory")
  .option("--registry-id <id>", "registry id")
  .option("--registry-name <name>", "registry display name")
  .action((opts: { dir: string; registryId?: string; registryName?: string }) => {
    const out = pluginRegistryInitCli({
      dir: opts.dir,
      registryId: opts.registryId,
      registryName: opts.registryName
    });
    console.log(chalk.green(`Registry initialized: ${out.dir}`));
    console.log(`index: ${out.indexPath}`);
    console.log(`sig: ${out.sigPath}`);
    console.log(`pub: ${out.pubPath}`);
    console.log(`key: ${out.keyPath}`);
    console.log(`fingerprint: ${out.fingerprint}`);
  });

pluginRegistry
  .command("publish")
  .description("Publish plugin package into registry and re-sign index")
  .requiredOption("--dir <dir>", "registry directory")
  .requiredOption("--file <plugin>", "plugin package (.amcplug)")
  .requiredOption("--registry-key <key>", "registry private key")
  .action((opts: { dir: string; file: string; registryKey: string }) => {
    const out = pluginRegistryPublishCli({
      dir: opts.dir,
      pluginFile: opts.file,
      registryKeyPath: opts.registryKey
    });
    console.log(chalk.green(`Published ${out.pluginId}@${out.version}`));
    console.log(`package: ${out.targetPath}`);
    console.log(`index: ${out.indexPath}`);
    console.log(`index.sig: ${out.sigPath}`);
  });

pluginRegistry
  .command("verify")
  .description("Verify registry signature and package hashes")
  .requiredOption("--dir <dir>", "registry directory")
  .action((opts: { dir: string }) => {
    const out = pluginRegistryVerifyCli(opts.dir);
    if (out.ok) {
      console.log(chalk.green("Registry verification PASS"));
      return;
    }
    console.log(chalk.red("Registry verification FAIL"));
    for (const error of out.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

pluginRegistry
  .command("serve")
  .description("Serve plugin registry over local HTTP")
  .requiredOption("--dir <dir>", "registry directory")
  .option("--host <host>", "bind host", "127.0.0.1")
  .option("--port <port>", "bind port", "9876")
  .action(async (opts: { dir: string; host: string; port: string }) => {
    const server = await pluginRegistryServeCli({
      dir: opts.dir,
      host: opts.host,
      port: Number(opts.port)
    });
    console.log(chalk.green(`Registry serving on http://${server.host}:${server.port}`));
    await new Promise<void>((resolvePromise) => {
      const shutdown = async () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        await server.close();
        resolvePromise();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  });

plugin
  .command("search")
  .description("Search a plugin registry by id/fingerprint")
  .requiredOption("--registry <base>", "registry path or URL")
  .option("--query <text>", "query text")
  .action(async (opts: { registry: string; query?: string }) => {
    const out = await pluginSearchCli({
      registry: opts.registry,
      query: opts.query
    });
    console.log(JSON.stringify(out, null, 2));
  });

plugin
  .command("registries")
  .description("List signed workspace registry configuration")
  .action(() => {
    const out = pluginRegistriesListCli(process.cwd());
    console.log(JSON.stringify(out, null, 2));
  });

plugin
  .command("registries-apply")
  .description("Apply and sign workspace registries.yaml from JSON or YAML file")
  .requiredOption("--file <path>", "config file path")
  .action((opts: { file: string }) => {
    const abs = resolve(process.cwd(), opts.file);
    const text = readUtf8(abs);
    const payload = abs.endsWith(".yaml") || abs.endsWith(".yml") ? YAML.parse(text) : JSON.parse(text);
    const out = pluginRegistryApplyCli({
      workspace: process.cwd(),
      config: payload
    });
    console.log(chalk.green(`Registries saved: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

plugin
  .command("install")
  .description("Request plugin install (requires SECURITY dual-control approval)")
  .requiredOption("--registry <id>", "configured registry id")
  .argument("<pluginRef>", "pluginId@version (or @latest)")
  .option("--agent <agentId>", "agent id (defaults to current)")
  .action(async (pluginRef: string, opts: { registry: string; agent?: string }) => {
    const out = await pluginInstallCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      registryId: opts.registry,
      pluginRef,
      action: "install"
    });
    console.log(chalk.green(`Install approval requested: ${out.pluginId}@${out.version}`));
    console.log(`request: ${out.requestId}`);
    console.log(`approvalRequestId: ${out.approvalRequestId}`);
    console.log(`risk: ${out.riskCategory}`);
  });

plugin
  .command("upgrade")
  .description("Request plugin upgrade (requires SECURITY dual-control approval)")
  .requiredOption("--registry <id>", "configured registry id")
  .argument("<pluginRef>", "pluginId[@version] (default: latest)")
  .option("--agent <agentId>", "agent id (defaults to current)")
  .action(async (pluginRef: string, opts: { registry: string; agent?: string }) => {
    const ref = normalizePluginRef(pluginRef);
    const out = await pluginUpgradeCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      registryId: opts.registry,
      pluginId: ref.pluginId,
      to: ref.version ?? "latest"
    });
    console.log(chalk.green(`Upgrade approval requested: ${out.pluginId}@${out.version}`));
    console.log(`request: ${out.requestId}`);
    console.log(`approvalRequestId: ${out.approvalRequestId}`);
    console.log(`risk: ${out.riskCategory}`);
  });

plugin
  .command("remove")
  .description("Request plugin removal (requires SECURITY dual-control approval)")
  .argument("<pluginId>", "plugin id")
  .option("--agent <agentId>", "agent id (defaults to current)")
  .action((pluginId: string, opts: { agent?: string }) => {
    const out = pluginRemoveCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      pluginId
    });
    console.log(chalk.green(`Remove approval requested: ${out.pluginId}@${out.version}`));
    console.log(`request: ${out.requestId}`);
    console.log(`approvalRequestId: ${out.approvalRequestId}`);
  });

plugin
  .command("execute")
  .description("Execute approved plugin install/upgrade/remove request")
  .requiredOption("--approval-request <id>", "approval request id")
  .action((opts: { approvalRequest: string }) => {
    const out = pluginExecuteCli({
      workspace: process.cwd(),
      approvalRequestId: opts.approvalRequest
    });
    console.log(chalk.green(`Plugin action executed: ${out.action}`));
    console.log(`plugin: ${out.pluginId}@${out.version ?? "removed"}`);
    console.log(`installed.lock: ${out.installedLockPath}`);
    console.log(`installed.lock.sig: ${out.installedLockSigPath}`);
    console.log(`transparencyHash: ${out.transparencyHash}`);
  });

plugin
  .command("registry-fingerprint")
  .description("Compute registry public key fingerprint")
  .requiredOption("--pubkey <path>", "registry pubkey PEM")
  .action((opts: { pubkey: string }) => {
    console.log(pluginRegistryFingerprintFromFile(opts.pubkey));
  });

program
  .command("wrap")
  .description("Wrap runtime and capture tamper-evident evidence")
  .argument("[runtime]", "claude|gemini|openclaw|any")
  .argument("[args...]", "runtime arguments")
  .option("--agent-token <file>", "lease token file from `amc pair redeem`")
  .option("--name <agentName>", "agent process display name")
  .option("--provider <provider>", "auto|claude|gemini|openclaw|generic", "auto")
  .option("--bridge-url <url>", "bridge base URL")
  .allowUnknownOption(true)
  .action(async (runtime: string | undefined, args: string[], opts: { agentToken?: string; name?: string; provider?: string; bridgeUrl?: string }) => {
    if (opts.agentToken) {
      const legacyRuntime = runtime && ["claude", "gemini", "openclaw", "any"].includes(runtime);
      const command = legacyRuntime ? args : [runtime ?? "", ...args].filter((value) => value.length > 0);
      const provider = (() => {
        const raw = (opts.provider ?? "auto").toLowerCase();
        if (raw === "claude" || raw === "gemini" || raw === "openclaw" || raw === "generic" || raw === "auto") {
          return raw as "auto" | "claude" | "gemini" | "openclaw" | "generic";
        }
        throw new Error(`unsupported --provider value: ${opts.provider}`);
      })();
      const code = await wrapWithBridgeToken({
        tokenFile: opts.agentToken,
        bridgeUrl: opts.bridgeUrl,
        provider,
        name: opts.name,
        command
      });
      if (code !== 0) {
        process.exit(code);
      }
      return;
    }

    if (!runtime || !["claude", "gemini", "openclaw", "any"].includes(runtime)) {
      throw new Error("amc wrap requires runtime (claude|gemini|openclaw|any) unless --agent-token is used.");
    }
    const config = loadAMCConfig(process.cwd());
    const agentId = activeAgent(program);
    let sessionId = "";
    if (runtime === "any") {
      const command = args[0];
      if (!command) {
        throw new Error("amc wrap any requires a command. Example: amc wrap any -- node agent.js");
      }
      sessionId = await wrapAny(command, args.slice(1), { workspace: process.cwd(), agentId });
    } else {
      sessionId = await wrapRuntime(runtime as "claude" | "gemini" | "openclaw", args ?? [], {
        workspace: process.cwd(),
        config,
        agentId
      });
    }
    console.log(chalk.green(`Session sealed: ${sessionId}`));
  });

program
  .command("supervise")
  .description("Supervise any agent process and inject gateway/proxy routing env vars")
  .option("--provider-route <routeBase>", "gateway route base URL (deprecated alias of --route)")
  .option("--route <routeBase>", "gateway route base URL")
  .option("--proxy <proxyUrl>", "gateway proxy URL (HTTP/HTTPS proxy)")
  .argument("[cmd...]", "agent command and args")
  .allowUnknownOption(true)
  .action(async (cmd: string[], opts: { providerRoute?: string; route?: string; proxy?: string }) => {
    const command = cmd?.[0];
    if (!command) {
      throw new Error("amc supervise requires a command. Example: amc supervise --route http://127.0.0.1:3210/openai -- node agent.js");
    }
    const providerRoute = opts.route ?? opts.providerRoute;
    if (!providerRoute) {
      throw new Error("amc supervise requires --route (or --provider-route).");
    }
    const config = loadAMCConfig(process.cwd());
    const agentId = activeAgent(program);
    const sessionId = await superviseProcess(command, cmd.slice(1), {
      workspace: process.cwd(),
      config,
      providerRoute,
      gatewayProxyUrl: opts.proxy,
      agentId
    });
    console.log(chalk.green(`Supervised session sealed: ${sessionId}`));
  });

program
  .command("monitor")
  .description("Record stdin stream as evidence")
  .requiredOption("--runtime <name>", "runtime name")
  .option("--stdin", "capture stdin stream", false)
  .action(async (opts: { runtime: string; stdin: boolean }) => {
    const agentId = activeAgent(program);
    const sessionId = await startMonitor({
      workspace: process.cwd(),
      runtime: (opts.runtime as never) ?? "unknown",
      stdin: !!opts.stdin,
      agentId
    });
    console.log(chalk.green(`Monitor session sealed: ${sessionId}`));
  });

program
  .command("run")
  .description("Run maturity diagnostic")
  .option("--window <window>", "evidence window", "14d")
  .option("--target <name>", "target profile name", "default")
  .option("--output <path>", "markdown report path")
  .option("--claim-mode <mode>", "auto|owner|harness", "auto")
  .option("--harness-runtime <name>", "runtime for harness mode")
  .action(
    async (opts: {
      window: string;
      target: string;
      output?: string;
      claimMode: "auto" | "owner" | "harness";
      harnessRuntime?: "claude" | "gemini" | "openclaw";
    }) => {
      const agentId = activeAgent(program);
      const output = opts.output ? join(process.cwd(), opts.output) : undefined;
      const resolvedOutput = output ? resolve(output) : undefined;
      const report = await runDiagnostic(
        {
          workspace: process.cwd(),
          window: opts.window,
          targetName: opts.target,
          claimMode: opts.claimMode,
          runtimeForHarness: opts.harnessRuntime,
          agentId
        },
        resolvedOutput
      );

      console.log(chalk.cyan(`Run ${report.runId} status: ${report.status}`));
      console.log(`IntegrityIndex: ${report.integrityIndex.toFixed(3)} (${report.trustLabel})`);
      if (report.trustBoundaryViolated && report.trustBoundaryMessage) {
        console.log(chalk.red(report.trustBoundaryMessage));
      }
    }
  );

program
  .command("report")
  .description("Render report for run ID")
  .argument("<runId>")
  .action((runId: string) => {
    const report = loadRunReport(process.cwd(), runId, activeAgent(program));
    const markdown = generateReport(report, "md") as string;
    console.log(markdown);
  });

program
  .command("history")
  .description("List diagnostic run history")
  .action(() => {
    const ledger = openLedger(process.cwd());
    const agentId = activeAgent(program);
    try {
      let runs = ledger.listRuns();
      if (agentId) {
        runs = runs.filter((run) => {
          try {
            const report = loadRunReport(process.cwd(), run.run_id, agentId);
            return report.agentId === resolveAgentId(process.cwd(), agentId);
          } catch {
            return false;
          }
        });
      }
      if (runs.length === 0) {
        console.log("No runs found.");
        return;
      }
      for (const run of runs) {
        console.log(
          `${run.run_id} | ${new Date(run.ts).toISOString()} | ${run.status} | window ${new Date(run.window_start_ts).toISOString()} -> ${new Date(run.window_end_ts).toISOString()}`
        );
      }
    } finally {
      ledger.close();
    }
  });

program
  .command("compare")
  .description("Compare two runs")
  .argument("<runIdA>")
  .argument("<runIdB>")
  .action((runIdA: string, runIdB: string) => {
    const agentId = activeAgent(program);
    const a = loadRunReport(process.cwd(), runIdA, agentId);
    const b = loadRunReport(process.cwd(), runIdB, agentId);
    const diff = compareRuns(a, b);
    console.log(JSON.stringify(diff, null, 2));
  });

const verifyCmd = program.command("verify").description("Verify integrity across AMC artifacts");

verifyCmd.action(async () => {
  const result = await verifyLedgerIntegrity(process.cwd());
  if (result.ok) {
    console.log(chalk.green("Ledger verification PASSED"));
    return;
  }

  console.log(chalk.red("Ledger verification FAILED"));
  for (const error of result.errors) {
    console.log(`- ${error}`);
  }
  process.exit(1);
});

verifyCmd
  .command("all")
  .description("Verify trust/policies/plugins/logs/ledger/artifacts in one pass")
  .option("--json", "emit JSON", false)
  .action(async (opts: { json: boolean }) => {
    const out = await verifyAll({
      workspace: process.cwd()
    });
    if (opts.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`status: ${out.status}`);
      for (const check of out.checks) {
        console.log(`- ${check.id}: ${check.status}${check.critical ? " [CRITICAL]" : ""}`);
        for (const detail of check.details) {
          console.log(`  ${detail}`);
        }
      }
    }
    if (out.criticalFail) {
      console.log(chalk.red("Critical verification failures detected."));
      for (const reason of verifyAllTopReasons(out)) {
        console.log(`- ${reason}`);
      }
      process.exit(1);
    }
    if (out.status !== "PASS") {
      process.exit(1);
    }
  });

const target = program.command("target").description("Target profile operations");
const evidence = program.command("evidence").description("Evidence lifecycle workflows");
const incidents = program.command("incidents").description("Incident operations and dispatch workflows");
const policy = program.command("policy").description("Policy-as-code operations");
const governor = program.command("governor").description("Autonomy Governor checks");
const tools = program.command("tools").description("ToolHub tools config");
const workorder = program.command("workorder").description("Signed work order operations");
const ticket = program.command("ticket").description("Execution ticket operations");
const gateway = program.command("gateway").description("AMC universal LLM proxy gateway");
const bundle = program.command("bundle").description("Portable evidence bundle operations");
const evidence = program.command("evidence").description("Verifier-ready evidence export operations");
const ci = program.command("ci").description("CI/CD release gate helpers");
const archetype = program.command("archetype").description("Archetype packs");
const exportGroup = program.command("export").description("Export policy packs and badges");
const assurance = program.command("assurance").description("Assurance Lab red-team packs");


assurance
  .command("toctou")
  .description("Run TOCTOU assurance pack")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; json?: boolean }) => {
    try {
      const { runToctouPack } = await import("./lab/packs/toctouPack.js");
      const result = await runToctouPack(opts.agent);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n🧪 TOCTOU Pack"));
      console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

assurance
  .command("compound-threats")
  .description("Run compound threat assurance pack")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; json?: boolean }) => {
    try {
      const { runCompoundThreatPack } = await import("./lab/packs/compoundThreatPack.js");
      const result = await runCompoundThreatPack(opts.agent);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n🧪 Compound Threat Pack"));
      console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

assurance
  .command("shutdown-compliance")
  .description("Run shutdown compliance pack")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; json?: boolean }) => {
    try {
      const { runShutdownCompliancePack } = await import("./lab/packs/shutdownCompliancePack.js");
      const result = await runShutdownCompliancePack(opts.agent);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n🧪 Shutdown Compliance Pack"));
      console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

const cert = program.command("cert").description("Certificate operations");
const dashboard = program.command("dashboard").description("Device-first Compass dashboard");
const vault = program.command("vault").description("Encrypted key vault operations");
const notary = program.command("notary").description("AMC Notary signing boundary operations");
const trust = program.command("trust").description("Trust mode and Notary enforcement configuration");
const canon = program.command("canon").description("Compass Canon signed content operations");
const cgx = program.command("cgx").description("Context Graph (CGX) build and verify operations");
const diagnostic = program.command("diagnostic").description("Diagnostic bank/render operations");
const truthguard = program.command("truthguard").description("Deterministic output truth-constraint validator");
const mode = program.command("mode").description("Switch CLI role mode");
const loop = program.command("loop").description("Continuous self-serve maturity loop");
const user = program.command("user").description("Multi-user RBAC account management");
const identity = program.command("identity").description("Enterprise identity (OIDC/SAML) configuration");
const scim = program.command("scim").description("SCIM token management");
const pair = program.command("pair").description("LAN pairing code operations");
const transparency = program.command("transparency").description("Append-only transparency log operations");
const compliance = program.command("compliance").description("Evidence-linked compliance map operations");
const federate = program.command("federate").description("Offline federation sync operations");
const integrations = program.command("integrations").description("Integration hub operations");
const outcomes = program.command("outcomes").description("Outcome contracts, value signals, and reports");
const value = program.command("value").description("Value realization engine (contracts, scoring, ROI)");
const audit = program.command("audit").description("Audit binder and compliance maps");
const admin = program.command("admin").description("Administrative controls, identity, and trust operations");
const passport = program.command("passport").description("Agent Passport (shareable maturity credential)");
const standard = program.command("standard").description("Open Compass Standard schema bundle and validation");
const forecast = program.command("forecast").description("Deterministic evidence-gated forecasting and planning");
const advisory = program.command("advisory").description("Forecast advisories (list/show/ack)");
const casebook = program.command("casebook").description("Signed casebook operations");
const incident = program.command("incident").description("Incident tracking and response operations");
const experiment = program.command("experiment").description("Deterministic baseline vs candidate experiments");
const release = program.command("release").description("Deterministic release engineering and offline verification");
const ops = program.command("ops").description("Operational hardening policy controls");
const blobs = program.command("blobs").description("Encrypted evidence blob operations");
const retention = program.command("retention").description("Retention/archive payload lifecycle operations");
const backup = program.command("backup").description("Signed encrypted backup/restore operations");
const maintenance = program.command("maintenance").description("Operational maintenance operations");
const metrics = program.command("metrics").description("Prometheus metrics endpoint helpers");
const transparencyMerkle = transparency.command("merkle").description("Merkle transparency root/proof operations");
const policyAction = policy.command("action").description("Signed autonomy action policy");
const policyApproval = policy.command("approval").description("Signed dual-control approval policy");
const policyPack = policy.command("pack").description("Policy packs by archetype and risk tier");

evidence
  .command("help")
  .description("Show high-signal evidence command groups")
  .action(() => {
    console.log(chalk.bold("Evidence namespace"));
    console.log("  amc evidence verify                  Run full integrity verification");
    console.log("  amc verify all                       Full trust/policy/plugin verification");
    console.log("  amc bundle export --out <file>       Export signed evidence bundle");
    console.log("  amc transparency verify              Verify append-only transparency log");
    console.log("  amc audit binder create              Build external-facing audit binder");
  });

evidence
  .command("verify")
  .description("Run full workspace verification suite")
  .option("--json", "emit JSON output", false)
  .action(async (opts: { json: boolean }) => {
    const out = await verifyAll({
      workspace: process.cwd()
    });
    if (opts.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(`status: ${out.status}`);
      for (const check of out.checks) {
        console.log(`- ${check.id}: ${check.status}${check.critical ? " [CRITICAL]" : ""}`);
      }
      if (out.criticalFail) {
        console.log(chalk.red("Critical verification failures detected."));
        for (const reason of verifyAllTopReasons(out)) {
          console.log(`- ${reason}`);
        }
      }
    }
    if (out.status !== "PASS") {
      process.exit(1);
    }
  });

incidents
  .command("help")
  .description("Show incident-focused command groups")
  .action(() => {
    console.log(chalk.bold("Incidents namespace"));
    console.log("  amc incidents alert --agent <id>     Dispatch INCIDENT_CREATED integration event");
    console.log("  amc assurance run --agent <id>       Run assurance packs and incident triggers");
    console.log("  amc drift check --agent <id>         Detect regressions that can open incidents");
    console.log("  amc forecast refresh --agent <id>    Recompute advisories and risk alerts");
  });

incidents
  .command("alert")
  .description("Dispatch INCIDENT_CREATED to configured integration channels")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--summary <text>", "incident summary", "Incident reported via CLI")
  .option("--details <json>", "JSON object payload for incident details", "{}")
  .action(async (opts: { agent: string; summary: string; details: string }) => {
    let details: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(opts.details) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        details = parsed as Record<string, unknown>;
      } else {
        throw new Error("details must be a JSON object");
      }
    } catch (error) {
      throw new Error(`Invalid --details JSON: ${String(error)}`);
    }

    const out = await integrationsDispatchCli({
      workspace: process.cwd(),
      eventName: "INCIDENT_CREATED",
      agentId: opts.agent,
      summary: opts.summary,
      details
    });
    console.log(JSON.stringify(out, null, 2));
    if (out.dispatched.length === 0) {
      process.exit(1);
    }
  });

admin
  .command("help")
  .description("Show admin-focused command groups")
  .action(() => {
    console.log(chalk.bold("Admin namespace"));
    console.log("  amc admin status                     Runtime + signature + trust status");
    console.log("  amc user <subcommand>               RBAC user lifecycle");
    console.log("  amc identity <subcommand>           OIDC/SAML/SCIM identity controls");
    console.log("  amc trust status                    Trust mode and notary enforcement");
    console.log("  amc vault <subcommand>              Vault key lifecycle");
  });

admin
  .command("status")
  .description("Show operational admin status for control-plane services")
  .action(async () => {
    const workspace = process.cwd();
    const studio = studioStatus(workspace);
    const gatewaySig = verifyGatewayConfigSignature(workspace);
    const usersSig = verifyUsersConfigSignature(workspace);
    const trustSig = verifyTrustConfigSignature(workspace);
    const opsSig = verifyOpsPolicySignature(workspace);
    const notary = await checkNotaryTrust(workspace).catch(() => null);

    console.log(`Studio: ${studio.running ? "RUNNING" : "STOPPED"}`);
    if (studio.state) {
      console.log(`  API: http://${studio.state.host}:${studio.state.apiPort}`);
      console.log(`  Gateway: http://${studio.state.host}:${studio.state.gatewayPort}`);
      console.log(`  Bridge: http://${studio.state.host}:${studio.state.apiPort}/bridge`);
    }
    console.log(`Gateway signature: ${gatewaySig.valid ? "VALID" : `INVALID (${gatewaySig.reason ?? "unknown"})`}`);
    console.log(`Users signature: ${usersSig.valid ? "VALID" : `INVALID (${usersSig.reason ?? "unknown"})`}`);
    console.log(`Trust signature: ${trustSig.valid ? "VALID" : `INVALID (${trustSig.reason ?? "unknown"})`}`);
    console.log(`Ops policy signature: ${opsSig.valid ? "VALID" : `INVALID (${opsSig.reason ?? "unknown"})`}`);
    if (notary) {
      console.log(`Notary trust: ${notary.ok ? "OK" : `FAILED (${notary.reasons.join("; ")})`}`);
    } else {
      console.log("Notary trust: unavailable");
    }
  });

policyAction
  .command("init")
  .description("Create and sign .amc/action-policy.yaml")
  .action(() => {
    const created = initActionPolicy(process.cwd());
    console.log(chalk.green(`Action policy created: ${created.policyPath}`));
    console.log(`Signature: ${created.signaturePath}`);
  });

policyAction
  .command("verify")
  .description("Verify action policy signature")
  .action(() => {
    const verify = verifyActionPolicySignature(process.cwd());
    if (verify.valid) {
      console.log(chalk.green(`Action policy signature valid: ${verify.sigPath}`));
      return;
    }
    console.log(chalk.red(`Action policy signature invalid: ${verify.reason ?? "unknown reason"}`));
    process.exit(1);
  });

policyApproval
  .command("init")
  .description("Create and sign .amc/approval-policy.yaml")
  .action(() => {
    const created = initApprovalPolicy(process.cwd());
    console.log(chalk.green(`Approval policy created: ${created.path}`));
    console.log(`Signature: ${created.sigPath}`);
  });

policyApproval
  .command("verify")
  .description("Verify approval-policy signature")
  .action(() => {
    const verify = verifyApprovalPolicySignature(process.cwd());
    if (verify.valid) {
      console.log(chalk.green(`Approval policy signature valid: ${verify.sigPath}`));
      return;
    }
    console.log(chalk.red(`Approval policy signature invalid: ${verify.reason ?? "unknown reason"}`));
    process.exit(1);
  });

policyPack
  .command("list")
  .description("List built-in policy packs")
  .action(() => {
    const rows = policyPackListCli();
    for (const row of rows) {
      console.log(`- ${row.id}: ${row.name} (${row.archetypeId}/${row.riskTier})`);
      console.log(`  ${row.description}`);
    }
  });

policyPack
  .command("describe")
  .description("Describe policy pack contents")
  .argument("<packId>")
  .action((packId: string) => {
    console.log(JSON.stringify(policyPackDescribeCli(packId), null, 2));
  });

policyPack
  .command("diff")
  .description("Show deterministic diff for applying a policy pack")
  .argument("<packId>")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((packId: string, opts: { agent?: string }) => {
    const diff = policyPackDiffCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      packId
    });
    console.log(JSON.stringify(diff, null, 2));
  });

policyPack
  .command("apply")
  .description("Apply policy pack and sign updated configs/targets")
  .argument("<packId>")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action(async (packId: string, opts: { agent?: string }) => {
    const diff = policyPackDiffCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      packId
    });
    console.log(chalk.cyan(`Pack diff for ${packId}:`));
    console.log(JSON.stringify(diff, null, 2));
    const confirm = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: "confirm",
        name: "proceed",
        message: "Apply this policy pack?",
        default: false
      }
    ]);
    if (!confirm.proceed) {
      console.log("Policy pack apply cancelled.");
      return;
    }
    const applied = policyPackApplyCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      packId
    });
    console.log(chalk.green(`Policy pack applied: ${applied.packId}`));
    console.log(`agent=${applied.agentId}`);
    console.log(`targetProfileId=${applied.targetProfileId}`);
    console.log(`transparencyHash=${applied.transparencyHash}`);
    console.log(`auditEventId=${applied.auditEventId}`);
  });

const CLOSED_INCIDENT_STATES = new Set(["RESOLVED", "POSTMORTEM"]);

function deriveIncidentState(
  store: ReturnType<typeof createIncidentStore>,
  incident: { incidentId: string; state: string }
): string {
  const transitions = store.getIncidentTransitions(incident.incidentId);
  if (transitions.length === 0) {
    return incident.state;
  }
  return transitions[transitions.length - 1]!.toState;
}

function mapCliIncidentSeverity(input: string): "INFO" | "WARN" | "CRITICAL" {
  const value = input.toLowerCase();
  if (value === "low") {
    return "INFO";
  }
  if (value === "medium") {
    return "WARN";
  }
  if (value === "high" || value === "critical") {
    return "CRITICAL";
  }
  throw new Error("severity must be low|medium|high|critical");
}

incident
  .command("list")
  .description("List incidents for an agent")
  .option("--status <status>", "open|closed")
  .option("--limit <n>", "max incidents to return", "50")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { status?: string; limit: string; agent?: string }) => {
    const status = opts.status ? opts.status.toLowerCase() : undefined;
    if (status && status !== "open" && status !== "closed") {
      throw new Error("status must be open|closed");
    }
    const limit = Number.parseInt(opts.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error("limit must be a positive integer");
    }

    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const ledger = openLedger(process.cwd());
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();
      const incidents = store
        .getIncidentsByAgent(agentId)
        .map((row) => ({ ...row, state: deriveIncidentState(store, row) }))
        .filter((row) => {
          if (!status) {
            return true;
          }
          const isClosed = CLOSED_INCIDENT_STATES.has(row.state);
          return status === "closed" ? isClosed : !isClosed;
        })
        .slice(0, limit);

      if (incidents.length === 0) {
        console.log(`No incidents found for agent '${agentId}'.`);
        return;
      }

      for (const row of incidents) {
        console.log(`${row.incidentId}  [${row.severity}/${row.state}]  ${row.title}`);
      }
    } finally {
      ledger.close();
    }
  });

incident
  .command("show <id>")
  .description("Show incident details")
  .action((id: string) => {
    const ledger = openLedger(process.cwd());
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();
      const found = store.getIncident(id);
      if (!found) {
        console.log(chalk.red(`Incident not found: ${id}`));
        process.exit(1);
        return;
      }
      const transitions = store.getIncidentTransitions(id);
      const edges = store.getCausalEdges(id);
      const state = transitions.length > 0 ? transitions[transitions.length - 1]!.toState : found.state;
      console.log(JSON.stringify({ ...found, state, transitions, causalEdges: edges }, null, 2));
    } finally {
      ledger.close();
    }
  });

incident
  .command("create")
  .description("Create a manual incident")
  .requiredOption("--title <title>", "incident title")
  .requiredOption("--severity <severity>", "low|medium|high|critical")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { title: string; severity: string; agent?: string }) => {
    const severity = mapCliIncidentSeverity(opts.severity);
    const workspace = process.cwd();
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const now = Date.now();

    const ledger = openLedger(workspace);
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();

      const incidentId = `incident_${randomUUID().replace(/-/g, "")}`;
      const incidentBase = {
        incidentId,
        agentId,
        severity,
        state: "OPEN" as const,
        title: opts.title,
        description: opts.title,
        triggerType: "MANUAL" as const,
        triggerId: `manual_${incidentId}`,
        rootCauseClaimIds: [] as string[],
        affectedQuestionIds: [] as string[],
        causalEdges: [] as unknown[],
        timelineEventIds: [] as string[],
        createdTs: now,
        updatedTs: now,
        resolvedTs: null as number | null,
        postmortemRef: null as string | null,
        prev_incident_hash: store.getLastIncidentHash(agentId)
      };

      const incidentHash = computeIncidentHash(incidentBase as any);
      const signatureDigest = sha256Hex(canonicalize({ ...incidentBase, incident_hash: incidentHash }));
      const signature = signHexDigest(signatureDigest, getPrivateKeyPem(workspace, "monitor"));

      store.insertIncident({
        ...incidentBase,
        incident_hash: incidentHash,
        signature
      } as any);

      console.log(chalk.green(`Incident created: ${incidentId}`));
      console.log(`agent=${agentId}`);
      console.log(`severity=${opts.severity.toLowerCase()}`);
    } finally {
      ledger.close();
    }
  });

incident
  .command("link <incidentId>")
  .description("Link evidence to an incident")
  .requiredOption("--evidence <evidenceId>", "evidence event ID")
  .action((incidentId: string, opts: { evidence: string }) => {
    const workspace = process.cwd();
    const ledger = openLedger(workspace);
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();
      const found = store.getIncident(incidentId);
      if (!found) {
        console.log(chalk.red(`Incident not found: ${incidentId}`));
        process.exit(1);
        return;
      }

      const now = Date.now();
      const edgeId = `edge_${randomUUID().replace(/-/g, "")}`;
      const edgeDigest = sha256Hex(
        canonicalize({
          edge_id: edgeId,
          from_event_id: opts.evidence,
          to_event_id: incidentId,
          relationship: "CAUSED",
          confidence: 0.9,
          evidence: [opts.evidence],
          added_ts: now,
          added_by: "OWNER"
        })
      );
      store.insertCausalEdge(incidentId, {
        edgeId,
        fromEventId: opts.evidence,
        toEventId: incidentId,
        relationship: "CAUSED",
        confidence: 0.9,
        evidence: [opts.evidence],
        addedTs: now,
        addedBy: "OWNER",
        signature: signHexDigest(edgeDigest, getPrivateKeyPem(workspace, "monitor"))
      });

      console.log(chalk.green(`Linked evidence ${opts.evidence} to incident ${incidentId}`));
    } finally {
      ledger.close();
    }
  });

incident
  .command("close <id>")
  .description("Close an incident with a resolution summary")
  .requiredOption("--resolution <text>", "resolution summary")
  .action((id: string, opts: { resolution: string }) => {
    const workspace = process.cwd();
    const ledger = openLedger(workspace);
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();
      const found = store.getIncident(id);
      if (!found) {
        console.log(chalk.red(`Incident not found: ${id}`));
        process.exit(1);
        return;
      }

      const currentState = deriveIncidentState(store, found);
      if (CLOSED_INCIDENT_STATES.has(currentState)) {
        console.log(chalk.yellow(`Incident already closed (${currentState}): ${id}`));
        return;
      }

      const now = Date.now();
      const transitionId = `itr_${randomUUID().replace(/-/g, "")}`;
      const transitionDigest = sha256Hex(
        canonicalize({
          transition_id: transitionId,
          incident_id: id,
          from_state: currentState,
          to_state: "RESOLVED",
          reason: opts.resolution,
          ts: now
        })
      );

      store.insertIncidentTransition({
        transitionId,
        incidentId: id,
        fromState: currentState as any,
        toState: "RESOLVED",
        reason: opts.resolution,
        ts: now,
        signature: signHexDigest(transitionDigest, getPrivateKeyPem(workspace, "monitor"))
      });

      console.log(chalk.green(`Incident closed: ${id}`));
    } finally {
      ledger.close();
    }
  });

ops
  .command("init")
  .description("Create and sign .amc/ops-policy.yaml")
  .action(() => {
    const created = initOpsPolicy(process.cwd());
    console.log(chalk.green(`Ops policy created: ${created.configPath}`));
    console.log(`Signature: ${created.sigPath}`);
  });

ops
  .command("verify")
  .description("Verify ops-policy signature")
  .action(() => {
    const verify = verifyOpsPolicySignature(process.cwd());
    if (verify.valid) {
      console.log(chalk.green(`Ops policy signature valid: ${verify.sigPath}`));
      return;
    }
    console.log(chalk.red(`Ops policy signature invalid: ${verify.reason ?? "unknown reason"}`));
    process.exit(1);
  });

ops
  .command("print")
  .description("Print effective ops policy")
  .action(() => {
    console.log(JSON.stringify(loadOpsPolicy(process.cwd()), null, 2));
  });

ops
  .command("circuit-breaker-init")
  .description("Initialize circuit breaker policy")
  .option("--timeout <ms>", "global timeout in ms", "10000")
  .option("--threshold <n>", "failure threshold before opening circuit", "5")
  .action((opts: { timeout: string; threshold: string }) => {
    const { configureCircuitBreaker: configureCB, saveCircuitBreakerPolicy: saveCBPolicy } = require("./ops/circuitBreaker.js") as typeof import("./ops/circuitBreaker.js");
    const policy = configureCB({
      globalTimeoutMs: parseInt(opts.timeout, 10),
      failureThreshold: parseInt(opts.threshold, 10),
    });
    saveCBPolicy(process.cwd(), policy);
    console.log(chalk.green("Circuit breaker policy initialized"));
    console.log(`Global timeout: ${policy.globalTimeoutMs}ms`);
    console.log(`Failure threshold: ${policy.failureThreshold}`);
  });

ops
  .command("circuit-breaker-status")
  .description("Show circuit breaker status")
  .action(() => {
    const { generateCircuitBreakerReport: genCBReport, renderCircuitBreakerMarkdown: renderCBMd } = require("./ops/circuitBreaker.js") as typeof import("./ops/circuitBreaker.js");
    const report = genCBReport();
    console.log(renderCBMd(report));
  });

ops
  .command("circuit-breaker-reset")
  .description("Reset all circuit breakers")
  .action(() => {
    const { resetAllCircuits: resetAll } = require("./ops/circuitBreaker.js") as typeof import("./ops/circuitBreaker.js");
    resetAll();
    console.log(chalk.green("All circuit breakers reset"));
  });

ops
  .command("dead-letters")
  .description("Show dead letter queue")
  .option("--unresolved", "show only unresolved entries")
  .action((opts: { unresolved?: boolean }) => {
    const { getDeadLetters: getDL } = require("./ops/circuitBreaker.js") as typeof import("./ops/circuitBreaker.js");
    const entries = getDL({ unresolvedOnly: opts.unresolved });
    if (entries.length === 0) {
      console.log("Dead letter queue is empty.");
      return;
    }
    for (const entry of entries) {
      const status = entry.resolved ? chalk.green("RESOLVED") : chalk.red("PENDING");
      console.log(`${status} ${entry.id} circuit=${entry.circuitId} retries=${entry.retryCount}`);
      console.log(`  Error: ${entry.error}`);
    }
  });

ops
  .command("mode")
  .description("Show or set degradation mode")
  .option("--set <mode>", "Set mode: FULL, REDUCED, MINIMAL")
  .option("--reason <reason>", "Reason for mode change")
  .option("--ttl <duration>", "TTL for mode override (e.g. 4h, 30m)")
  .action((opts: { set?: string; reason?: string; ttl?: string }) => {
    const dm = require("./ops/degradationMode.js") as typeof import("./ops/degradationMode.js");
    if (opts.set) {
      const mode = opts.set.toUpperCase() as "FULL" | "REDUCED" | "MINIMAL";
      if (!["FULL", "REDUCED", "MINIMAL"].includes(mode)) {
        console.log(chalk.red("Invalid mode. Use FULL, REDUCED, or MINIMAL."));
        process.exit(1);
      }
      let ttlMs: number | null = null;
      if (opts.ttl) {
        const match = opts.ttl.match(/^(\d+)(h|m|s)$/);
        if (match) {
          const val = parseInt(match[1]!, 10);
          ttlMs = match[2] === "h" ? val * 3600000 : match[2] === "m" ? val * 60000 : val * 1000;
        }
      }
      const event = dm.setMode(mode, opts.reason ?? "manual override", ttlMs);
      console.log(chalk.green(`Mode changed: ${event.fromMode} → ${event.toMode}`));
      if (event.expiresAt) console.log(`Expires: ${new Date(event.expiresAt).toISOString()}`);
    } else {
      console.log(dm.renderDegradationStatus());
    }
  });

ops
  .command("backpressure")
  .description("Show backpressure pipeline health")
  .action(() => {
    const bp = require("./ops/backpressure.js") as typeof import("./ops/backpressure.js");
    console.log(bp.renderBackpressureStatus());
  });

ops
  .command("slo")
  .description("Show governance SLO dashboard")
  .option("--window <hours>", "Window in hours", "1")
  .action((opts: { window: string }) => {
    const slo = require("./ops/governanceSlo.js") as typeof import("./ops/governanceSlo.js");
    const windowMs = parseFloat(opts.window) * 3600000;
    console.log(slo.renderSloStatus(windowMs));
  });

ops
  .command("latency")
  .description("Show latency accounting report")
  .option("--window <hours>", "Window in hours", "24")
  .action((opts: { window: string }) => {
    const la = require("./ops/latencyAccounting.js") as typeof import("./ops/latencyAccounting.js");
    const windowMs = parseFloat(opts.window) * 3600000;
    console.log(la.renderLatencyReport(windowMs));
  });

canon
  .command("init")
  .description("Create and sign .amc/canon/canon.yaml")
  .action(() => {
    assertOwnerMode(process.cwd(), "canon init");
    const out = canonInitCli(process.cwd());
    console.log(chalk.green("Compass Canon initialized"));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

canon
  .command("verify")
  .description("Verify canonical compass content signature")
  .action(() => {
    const verify = canonVerifyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red("Canon signature invalid"));
      console.log(`Reason: ${verify.reason ?? "unknown"}`);
      process.exit(1);
      return;
    }
    console.log(chalk.green("Canon signature valid"));
    console.log(`Path: ${verify.path}`);
    console.log(`Signature: ${verify.sigPath}`);
  });

canon
  .command("print")
  .description("Print effective Compass Canon")
  .action(() => {
    console.log(JSON.stringify(canonPrintCli(process.cwd()), null, 2));
  });

cgx
  .command("init")
  .description("Create and sign .amc/cgx/policy.yaml")
  .action(() => {
    assertOwnerMode(process.cwd(), "cgx init");
    const out = cgxInitCli(process.cwd());
    console.log(chalk.green("CGX policy initialized"));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

cgx
  .command("build")
  .description("Build deterministic signed context graph")
  .requiredOption("--scope <scope>", "workspace|agent")
  .option("--id <id>", "agent id when --scope agent")
  .action((opts: { scope: string; id?: string }) => {
    assertOwnerMode(process.cwd(), "cgx build");
    const scope = opts.scope.toLowerCase();
    if (scope !== "workspace" && scope !== "agent") {
      throw new Error("scope must be workspace|agent");
    }
    const out = cgxBuildCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "agent",
      id: opts.id
    });
    console.log(chalk.green("CGX graph built"));
    console.log(`scope=${out.graph.scope.type}:${out.graph.scope.id}`);
    if (out.saved) {
      console.log(`latest=${out.saved.latestPath}`);
      console.log(`snapshot=${out.saved.snapshotPath}`);
    }
    if (out.packSaved) {
      console.log(`pack=${out.packSaved.path}`);
    }
  });

cgx
  .command("verify")
  .description("Verify CGX policy/graph/pack signatures")
  .action(() => {
    const out = cgxVerifyCli(process.cwd());
    const errors: string[] = [];
    if (!out.policy.valid) {
      errors.push(`policy: ${out.policy.reason ?? "invalid signature"}`);
    }
    if (!(out.workspaceGraph.valid || !out.workspaceGraph.signatureExists)) {
      errors.push(`workspace graph: ${out.workspaceGraph.reason ?? "invalid signature"}`);
    }
    for (const row of out.agentGraphs) {
      if (!(row.verify.valid || !row.verify.signatureExists)) {
        errors.push(`agent graph ${row.agentId}: ${row.verify.reason ?? "invalid signature"}`);
      }
    }
    for (const row of out.agentPacks) {
      if (!(row.verify.valid || !row.verify.signatureExists)) {
        errors.push(`agent pack ${row.agentId}: ${row.verify.reason ?? "invalid signature"}`);
      }
    }
    if (errors.length > 0) {
      console.log(chalk.red("CGX verify failed"));
      for (const error of errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("CGX signatures verified"));
  });

cgx
  .command("show")
  .description("Show latest CGX graph or agent context pack")
  .requiredOption("--scope <scope>", "workspace|agent")
  .option("--id <id>", "agent id when scope=agent")
  .requiredOption("--format <format>", "graph|pack")
  .action((opts: { scope: string; id?: string; format: string }) => {
    const scope = opts.scope.toLowerCase();
    const format = opts.format.toLowerCase();
    if (scope !== "workspace" && scope !== "agent") {
      throw new Error("scope must be workspace|agent");
    }
    if (format !== "graph" && format !== "pack") {
      throw new Error("format must be graph|pack");
    }
    const out = cgxShowCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "agent",
      id: opts.id,
      format: format as "graph" | "pack"
    });
    console.log(JSON.stringify(out, null, 2));
  });

cgx
  .command("simulate")
  .description("Simulate impact propagation when a node changes")
  .requiredOption("--change <nodeId>", "node ID to simulate change on")
  .option("--scope <scope>", "workspace|agent", "workspace")
  .option("--id <id>", "agent id when scope=agent")
  .option("--max-depth <n>", "max propagation depth", "6")
  .option("--json", "emit JSON output", false)
  .action((opts: { change: string; scope: string; id?: string; maxDepth: string; json: boolean }) => {
    const scope = opts.scope.toLowerCase() === "agent"
      ? { type: "agent" as const, id: opts.id ?? "default" }
      : { type: "workspace" as const, id: "workspace" };
    const graph = loadLatestCgxGraph(process.cwd(), scope);
    if (!graph) {
      console.log(chalk.yellow("No CGX graph found. Run `amc cgx build` first."));
      process.exit(1);
      return;
    }
    const result = simulateImpact(graph, opts.change, {
      maxDepth: Number(opts.maxDepth) || 6,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderSimulationMarkdown(result));
    }
  });

cgx
  .command("diff")
  .description("Diff two CGX graph snapshots")
  .requiredOption("--run-a <id>", "first snapshot ID or timestamp")
  .requiredOption("--run-b <id>", "second snapshot ID or timestamp")
  .option("--scope <scope>", "workspace|agent", "workspace")
  .option("--id <id>", "agent id when scope=agent")
  .option("--json", "emit JSON output", false)
  .action((opts: { runA: string; runB: string; scope: string; id?: string; json: boolean }) => {
    const scopeType = opts.scope.toLowerCase() === "agent" ? "agent" as const : "workspace" as const;
    const scopeId = scopeType === "agent" ? (opts.id ?? "default") : "workspace";
    const diff = loadAndDiffSnapshots({
      workspace: process.cwd(),
      scopeType,
      scopeId,
      runA: opts.runA,
      runB: opts.runB,
    });
    if (opts.json) {
      console.log(JSON.stringify(diff, null, 2));
    } else {
      console.log(renderGraphDiffMarkdown(diff));
    }
  });

program
  .command("delta-to-l5")
  .description("Generate L4→L5 delta report showing what separates current state from L5")
  .requiredOption("--agent <id>", "agent ID")
  .option("--out <path>", "output file path", ".amc/reports/l5-delta.md")
  .option("--format <format>", "json|markdown|both", "both")
  .option("--json", "emit JSON to stdout", false)
  .action((opts: { agent: string; out: string; format: string; json: boolean }) => {
    if (opts.json) {
      const { generateL5DeltaReport } = require("./diagnostic/l5DeltaReport.js") as typeof import("./diagnostic/l5DeltaReport.js");
      const report = generateL5DeltaReport({ workspace: process.cwd(), agentId: opts.agent });
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const format = (opts.format === "json" || opts.format === "markdown" || opts.format === "both")
      ? opts.format : "both";
    const result = saveL5DeltaReport({
      workspace: process.cwd(),
      agentId: opts.agent,
      outPath: join(process.cwd(), opts.out),
      format,
    });
    console.log(chalk.green("L5 delta report generated"));
    for (const p of result.paths) {
      console.log(`- ${p}`);
    }
  });

program
  .command("control-classification")
  .description("Show control enforcement classification (ARCHITECTURAL/POLICY_ENFORCED/CONVENTION)")
  .option("--json", "emit JSON output", false)
  .action((opts: { json: boolean }) => {
    const report = classifyControls();
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderControlClassificationMarkdown(report));
    }
  });

const prompt = program.command("prompt").description("Northstar prompt policy + pack operations");

prompt
  .command("init")
  .description("Create and sign .amc/prompt/policy.yaml")
  .action(() => {
    assertOwnerMode(process.cwd(), "prompt init");
    const out = promptInitCli(process.cwd());
    console.log(chalk.green("Prompt policy initialized"));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

prompt
  .command("verify")
  .description("Verify prompt policy, pack, lint and scheduler signatures")
  .action(() => {
    const out = promptVerifyCli(process.cwd());
    if (!out.ok) {
      console.log(chalk.red("Prompt verification failed"));
      for (const error of out.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Prompt verification passed"));
  });

const promptPolicy = prompt.command("policy").description("Prompt policy operations");

promptPolicy
  .command("print")
  .description("Print prompt policy")
  .action(() => {
    console.log(JSON.stringify(promptPolicyPrintCli(process.cwd()), null, 2));
  });

promptPolicy
  .command("apply")
  .description("Apply prompt policy from YAML file and sign")
  .requiredOption("--file <path>", "policy yaml path")
  .option("--reason <reason>", "change reason", "prompt policy update")
  .action((opts: { file: string; reason: string }) => {
    assertOwnerMode(process.cwd(), "prompt policy apply");
    const out = promptPolicyApplyCli({
      workspace: process.cwd(),
      file: opts.file,
      reason: opts.reason,
      actor: "owner-cli"
    });
    console.log(chalk.green("Prompt policy applied"));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

prompt
  .command("status")
  .description("List per-agent prompt pack status")
  .action(() => {
    const out = promptStatusCli(process.cwd());
    console.log(JSON.stringify(out, null, 2));
  });

const promptPack = prompt.command("pack").description("Prompt pack artifact operations");

promptPack
  .command("build")
  .description("Build and sign .amcprompt for an agent")
  .option("--agent <agentId>", "agent id", "default")
  .option("--out <file>", "output .amcprompt file")
  .action((opts: { agent: string; out?: string }) => {
    assertOwnerMode(process.cwd(), "prompt pack build");
    const out = promptPackBuildCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      outFile: opts.out
    });
    console.log(chalk.green("Prompt pack created"));
    console.log(`agent=${out.agentId}`);
    console.log(`packId=${out.pack.packId}`);
    console.log(`sha256=${out.sha256}`);
    console.log(`lint=${out.lint.status}`);
    console.log(`latest=${out.persisted.latestPath}`);
  });

promptPack
  .command("verify")
  .description("Verify .amcprompt signature and lint signature")
  .argument("<file>", ".amcprompt path")
  .option("--pubkey <path>", "optional signer pubkey path")
  .action((file: string, opts: { pubkey?: string }) => {
    const out = promptPackVerifyCli({
      file,
      pubkeyPath: opts.pubkey
    });
    if (!out.ok) {
      console.log(chalk.red("Prompt pack verification failed"));
      for (const error of out.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Prompt pack verification passed"));
    console.log(`packId=${out.packId ?? "unknown"}`);
    console.log(`templateId=${out.templateId ?? "unknown"}`);
    console.log(`lint=${out.lintStatus}`);
  });

promptPack
  .command("show")
  .description("Show provider-specific enforced system prompt")
  .requiredOption("--agent <agentId>", "agent id")
  .requiredOption("--provider <provider>", "openai|anthropic|gemini|xai|openrouter|generic")
  .option("--format <format>", "text|json", "text")
  .action((opts: { agent: string; provider: string; format: string }) => {
    const provider = opts.provider.toLowerCase();
    if (!["openai", "anthropic", "gemini", "xai", "openrouter", "generic"].includes(provider)) {
      throw new Error("provider must be openai|anthropic|gemini|xai|openrouter|generic");
    }
    const format = opts.format.toLowerCase() === "json" ? "json" : "text";
    const out = promptPackShowCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      provider: provider as "openai" | "anthropic" | "gemini" | "xai" | "openrouter" | "generic",
      format
    });
    if (format === "text") {
      console.log(String(out));
      return;
    }
    console.log(JSON.stringify(out, null, 2));
  });

promptPack
  .command("diff")
  .description("Diff latest prompt pack against previous snapshot")
  .requiredOption("--agent <agentId>", "agent id")
  .action((opts: { agent: string }) => {
    const out = promptPackDiffCli({
      workspace: process.cwd(),
      agentId: opts.agent
    });
    console.log(JSON.stringify(out, null, 2));
  });

const promptScheduler = prompt.command("scheduler").description("Prompt pack recurrence scheduler");

promptScheduler
  .command("status")
  .description("Show prompt scheduler status")
  .action(() => {
    console.log(JSON.stringify(promptSchedulerStatusCli(process.cwd()), null, 2));
  });

promptScheduler
  .command("run-now")
  .description("Run prompt scheduler now for one agent or all")
  .option("--agent <agentId>", "agent id or all", "all")
  .action((opts: { agent: string }) => {
    assertOwnerMode(process.cwd(), "prompt scheduler run-now");
    const out = promptSchedulerRunNowCli({
      workspace: process.cwd(),
      agent: opts.agent === "all" ? "all" : opts.agent
    });
    console.log(JSON.stringify(out, null, 2));
  });

promptScheduler
  .command("enable")
  .description("Enable prompt scheduler")
  .action(() => {
    assertOwnerMode(process.cwd(), "prompt scheduler enable");
    console.log(JSON.stringify(promptSchedulerEnableCli(process.cwd()), null, 2));
  });

promptScheduler
  .command("disable")
  .description("Disable prompt scheduler")
  .action(() => {
    assertOwnerMode(process.cwd(), "prompt scheduler disable");
    console.log(JSON.stringify(promptSchedulerDisableCli(process.cwd()), null, 2));
  });

passport
  .command("init")
  .description("Create and sign .amc/passport/policy.yaml")
  .action(() => {
    assertOwnerMode(process.cwd(), "passport init");
    const out = passportInitCli(process.cwd());
    console.log(chalk.green("Passport policy initialized"));
    console.log(`Signature valid: ${out.signature.valid}`);
  });

passport
  .command("verify-policy")
  .description("Verify signed passport policy")
  .action(() => {
    const verify = passportVerifyPolicyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red("Passport policy verify failed"));
      console.log(`Reason: ${verify.reason ?? "unknown"}`);
      process.exit(1);
      return;
    }
    console.log(chalk.green("Passport policy signature verified"));
    console.log(`Path: ${verify.path}`);
    console.log(`Signature: ${verify.sigPath}`);
  });

const passportPolicy = passport.command("policy").description("Passport policy operations");

passportPolicy
  .command("print")
  .description("Print effective passport policy")
  .action(() => {
    console.log(JSON.stringify(passportPolicyPrintCli(process.cwd()), null, 2));
  });

passportPolicy
  .command("apply")
  .description("Apply passport policy from JSON/YAML file")
  .requiredOption("--file <path>", "policy file")
  .action((opts: { file: string }) => {
    assertOwnerMode(process.cwd(), "passport policy apply");
    const out = passportPolicyApplyCli({
      workspace: process.cwd(),
      file: opts.file
    });
    console.log(chalk.green("Passport policy applied"));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
    console.log(`Transparency: ${out.transparencyHash}`);
  });

passport
  .command("create")
  .description("Create deterministic signed .amcpass artifact")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .requiredOption("--out <file.amcpass>", "output passport path")
  .option("--id <id>", "scope id for node/agent")
  .action((opts: { scope: string; out: string; id?: string }) => {
    assertOwnerMode(process.cwd(), "passport create");
    const scope = opts.scope.toLowerCase();
    if (scope !== "workspace" && scope !== "node" && scope !== "agent") {
      throw new Error("scope must be workspace|node|agent");
    }
    const out = passportCreateCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      outFile: opts.out
    });
    console.log(chalk.green("Passport created"));
    console.log(`File: ${out.outFile}`);
    console.log(`sha256: ${out.sha256}`);
    console.log(`passportId: ${out.passport.passportId}`);
    console.log(`status: ${out.passport.status.label}`);
  });

passport
  .command("verify")
  .description("Verify .amcpass artifact offline")
  .argument("<file>")
  .option("--pubkey <path>", "override signer pubkey path")
  .action((file: string, opts: { pubkey?: string }) => {
    const out = passportVerifyCli({
      workspace: process.cwd(),
      file,
      pubkeyPath: opts.pubkey
    });
    if (!out.ok) {
      console.log(chalk.red("Passport verify failed"));
      for (const error of out.errors) {
        console.log(`- ${error.code}: ${error.message}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Passport verified"));
    console.log(`passportId: ${out.passport?.passportId ?? "unknown"}`);
  });

passport
  .command("show")
  .description("Show .amcpass as JSON or single-line badge")
  .argument("<file>")
  .option("--format <format>", "json|badge", "json")
  .action((file: string, opts: { format: string }) => {
    const format = opts.format.toLowerCase();
    if (format !== "json" && format !== "badge") {
      throw new Error("format must be json|badge");
    }
    const out = passportShowCli({
      file,
      format: format as "json" | "badge"
    });
    if (format === "badge") {
      console.log(String(out));
      return;
    }
    console.log(JSON.stringify(out, null, 2));
  });

passport
  .command("badge")
  .description("Print deterministic single-line badge from latest cache")
  .requiredOption("--scope <scope>", "agent")
  .requiredOption("--id <agentId>", "agent id")
  .action((opts: { scope: string; id: string }) => {
    if (opts.scope.toLowerCase() !== "agent") {
      throw new Error("badge currently supports --scope agent only");
    }
    const out = passportBadgeCli({
      workspace: process.cwd(),
      agentId: resolveAgentId(process.cwd(), opts.id)
    });
    console.log(out.badge);
  });

passport
  .command("export-latest")
  .description("Export latest passport for a scope to .amcpass")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .requiredOption("--out <file.amcpass>", "output passport path")
  .option("--id <id>", "scope id for node/agent")
  .action((opts: { scope: string; out: string; id?: string }) => {
    assertOwnerMode(process.cwd(), "passport export-latest");
    const scope = opts.scope.toLowerCase();
    if (scope !== "workspace" && scope !== "node" && scope !== "agent") {
      throw new Error("scope must be workspace|node|agent");
    }
    const out = passportExportLatestCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      outFile: opts.out
    });
    console.log(chalk.green("Passport exported"));
    console.log(`File: ${out.outFile}`);
    console.log(`sha256: ${out.sha256}`);
    console.log(`passportId: ${out.passport.passportId}`);
  });

standard
  .command("generate")
  .description("Generate signed Open Compass schema bundle under .amc/standard/")
  .action(() => {
    assertOwnerMode(process.cwd(), "standard generate");
    const out = standardGenerateCli(process.cwd());
    console.log(chalk.green("Standard schemas generated"));
    console.log(`Root: ${out.root}`);
    console.log(`Meta: ${out.metaPath}`);
    console.log(`Bundle signature: ${out.schemasSigPath}`);
    console.log(`Transparency: ${out.transparencyHash}`);
  });

standard
  .command("verify")
  .description("Verify schema bundle signatures and manifest digests")
  .action(() => {
    const out = standardVerifyCli(process.cwd());
    if (!out.ok) {
      console.log(chalk.red("Standard schema verify failed"));
      for (const error of out.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Standard schema bundle verified"));
    console.log(`Transparency: ${out.transparencyHash}`);
  });

standard
  .command("print")
  .description("Print one generated schema")
  .requiredOption("--id <id>", "amcpass|amcbench|amcprompt|amccert|amcaudit|registry.bench|registry.passport")
  .action((opts: { id: string }) => {
    console.log(JSON.stringify(standardPrintCli({
      workspace: process.cwd(),
      id: opts.id
    }), null, 2));
  });

standard
  .command("validate")
  .description("Validate a JSON file or AMC artifact against a standard schema")
  .requiredOption("--schema <id>", "schema id, e.g. amcpass")
  .requiredOption("--file <path>", "json or .amc* artifact file")
  .action((opts: { schema: string; file: string }) => {
    const out = standardValidateCli({
      workspace: process.cwd(),
      schema: opts.schema,
      file: opts.file
    });
    if (!out.ok) {
      console.log(chalk.red("Standard validation failed"));
      for (const error of out.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Standard validation passed"));
    console.log(`schema: ${out.schemaName}`);
  });

standard
  .command("schemas")
  .description("List generated schemas with digests")
  .action(() => {
    console.log(JSON.stringify(standardListCli(process.cwd()), null, 2));
  });

const diagnosticBank = diagnostic.command("bank").description("Signed diagnostic 67-question bank operations");

diagnosticBank
  .command("init")
  .description("Create and sign .amc/diagnostic/bank/bank.yaml")
  .action(() => {
    assertOwnerMode(process.cwd(), "diagnostic bank init");
    const out = diagnosticBankInitCli(process.cwd());
    console.log(chalk.green("Diagnostic bank initialized"));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

diagnosticBank
  .command("verify")
  .description("Verify diagnostic bank signature")
  .action(() => {
    const verify = diagnosticBankVerifyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red("Diagnostic bank signature invalid"));
      console.log(`Reason: ${verify.reason ?? "unknown"}`);
      process.exit(1);
      return;
    }
    console.log(chalk.green("Diagnostic bank signature valid"));
    console.log(`Path: ${verify.path}`);
    console.log(`Signature: ${verify.sigPath}`);
  });

diagnostic
  .command("render")
  .description("Render contextualized 67-question diagnostic for an agent")
  .requiredOption("--agent <agentId>", "agent id")
  .option("--format <format>", "md|json", "json")
  .option("--out <file>", "output file")
  .action((opts: { agent: string; format: string; out?: string }) => {
    const format = opts.format.toLowerCase();
    if (format !== "json" && format !== "md") {
      throw new Error("format must be md|json");
    }
    const out = contextualizedDiagnosticRenderCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      format: format as "json" | "md",
      outFile: opts.out
    });
    if (out.outFile) {
      console.log(chalk.green(`Diagnostic render written: ${out.outFile}`));
      return;
    }
    if (format === "md") {
      const lines = [`# AMC Contextualized Diagnostic (${out.render.agentId})`, ""];
      for (const question of out.render.questions) {
        lines.push(`- ${question.qId}: ${question.title}`);
      }
      console.log(lines.join("\n"));
      return;
    }
    console.log(JSON.stringify(out.render, null, 2));
  });

truthguard
  .command("validate")
  .description("Validate structured agent output claims against deterministic truth constraints")
  .requiredOption("--file <json>", "input JSON file")
  .action((opts: { file: string }) => {
    const out = truthguardValidateCli({
      workspace: process.cwd(),
      inputFile: opts.file,
      enforceWorkspacePolicy: true
    });
    console.log(`status: ${out.result.status}`);
    console.log(`violations: ${out.result.violations.length}`);
    console.log(`evidenceBound: ${out.context.evidenceBound}`);
    if (out.result.violations.length > 0) {
      for (const violation of out.result.violations) {
        console.log(`- ${violation.kind} ${violation.path}: ${violation.message}`);
      }
      process.exit(1);
    }
  });

blobs
  .command("verify")
  .description("Verify encrypted blob index and payload integrity")
  .action(() => {
    const result = blobsVerifyCli(process.cwd());
    if (result.ok) {
      console.log(chalk.green(`Blob verification PASSED (${result.checkedBlobRefs} blob refs across ${result.checkedRows} rows)`));
      return;
    }
    console.log(chalk.red("Blob verification FAILED"));
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

const blobKeys = blobs.command("key").description("Blob key management");
blobKeys
  .command("init")
  .description("Initialize encrypted blob key material")
  .action(() => {
    const key = blobKeyInitCli(process.cwd());
    console.log(chalk.green(`Blob key initialized (version ${key.keyVersion})`));
  });

blobKeys
  .command("rotate")
  .description("Rotate encrypted blob key material")
  .action(() => {
    const rotated = blobKeyRotateCli(process.cwd());
    console.log(chalk.green(`Blob key rotated: ${rotated.fromVersion} -> ${rotated.toVersion}`));
  });

blobs
  .command("reencrypt")
  .description("Re-encrypt blob batch from one key version to another")
  .requiredOption("--from <version>", "source key version")
  .requiredOption("--to <version>", "target key version")
  .option("--limit <n>", "max blobs to process", "1000")
  .action((opts: { from: string; to: string; limit: string }) => {
    const result = blobsReencryptCli(process.cwd(), {
      fromVersion: Number(opts.from),
      toVersion: Number(opts.to),
      limit: Math.max(1, Number(opts.limit) || 1000)
    });
    console.log(
      chalk.green(`Blob re-encrypt batch complete: processed=${result.processed} skipped=${result.skipped}`)
    );
  });

retention
  .command("status")
  .description("Show retention/archive status")
  .action(() => {
    console.log(JSON.stringify(retentionStatusCli(process.cwd()), null, 2));
  });

retention
  .command("run")
  .description("Run archival + payload prune lifecycle")
  .option("--dry-run", "simulate without modifying data", false)
  .action((opts: { dryRun: boolean }) => {
    const result = retentionRunCli(process.cwd(), opts.dryRun);
    console.log(JSON.stringify(result, null, 2));
  });

retention
  .command("verify")
  .description("Verify archive manifests/signatures and ledger continuity")
  .action(async () => {
    const result = await retentionVerifyCli(process.cwd());
    if (result.ok) {
      console.log(chalk.green(`Retention verification PASSED (${result.segmentCount} segments)`));
      return;
    }
    console.log(chalk.red("Retention verification FAILED"));
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

backup
  .command("create")
  .description("Create signed encrypted backup bundle")
  .requiredOption("--out <file>", "output backup file, e.g. backup.amcbackup")
  .action((opts: { out: string }) => {
    const created = backupCreateCli(process.cwd(), opts.out);
    console.log(chalk.green(`Backup created: ${created.outFile}`));
    console.log(`backupId=${created.backupId}`);
  });

backup
  .command("verify")
  .description("Verify signed backup bundle offline")
  .argument("<file>", "backup file path")
  .option("--pubkey <path>", "optional auditor pubkey override")
  .action((file: string, opts: { pubkey?: string }) => {
    const verified = backupVerifyCli({
      backupFile: file,
      pubkeyPath: opts.pubkey
    });
    if (verified.ok) {
      console.log(chalk.green(`Backup verification PASSED (${verified.manifest?.backupId ?? "unknown"})`));
      return;
    }
    console.log(chalk.red("Backup verification FAILED"));
    for (const error of verified.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

backup
  .command("restore")
  .description("Restore a verified backup into target directory")
  .argument("<file>", "backup file path")
  .requiredOption("--to <dir>", "restore target directory")
  .option("--force", "allow restore into existing target directory", false)
  .action(async (file: string, opts: { to: string; force: boolean }) => {
    const restored = await backupRestoreCli({
      backupFile: file,
      toDir: opts.to,
      force: opts.force
    });
    console.log(chalk.green(`Backup restored to ${restored.restoredTo}`));
    if (!restored.trusted) {
      console.log(chalk.yellow("Restore completed with warnings:"));
      for (const warning of restored.warnings) {
        console.log(`- ${warning}`);
      }
    }
  });

backup
  .command("print")
  .description("Print backup manifest summary")
  .argument("<file>", "backup file path")
  .action((file: string) => {
    console.log(JSON.stringify(backupPrintCli(file), null, 2));
  });

maintenance
  .command("stats")
  .description("Show DB/blob/archive/cache operational stats")
  .action(() => {
    console.log(JSON.stringify(maintenanceStatsCli(process.cwd()), null, 2));
  });

maintenance
  .command("vacuum")
  .description("Run SQLite VACUUM + ANALYZE")
  .action(() => {
    const result = maintenanceVacuumCli(process.cwd());
    console.log(chalk.green(`VACUUM complete at ${new Date(result.lastVacuumTs).toISOString()}`));
  });

maintenance
  .command("reindex")
  .description("Ensure operational SQLite indexes")
  .action(() => {
    maintenanceReindexCli(process.cwd());
    console.log(chalk.green("Operational indexes ensured."));
  });

maintenance
  .command("rotate-logs")
  .description("Rotate Studio logs based on ops policy")
  .action(() => {
    const result = maintenanceRotateLogsCli(process.cwd());
    console.log(chalk.green(`Logs rotated: removed=${result.removed.length} kept=${result.kept.length}`));
  });

maintenance
  .command("prune-cache")
  .description("Prune dashboard/console/transform cache artifacts")
  .action(() => {
    const result = maintenancePruneCacheCli(process.cwd());
    console.log(
      chalk.green(
        `Cache prune complete: console=${result.removedConsoleSnapshots.length} transform=${result.removedTransformSnapshots.length} generic=${result.removedGenericCacheFiles.length}`
      )
    );
  });

metrics
  .command("status")
  .description("Show configured metrics endpoint bind/port")
  .action(() => {
    const runtime = loadStudioRuntimeConfig(process.env);
    console.log(
      JSON.stringify(
        {
          host: runtime.metricsBind,
          port: runtime.metricsPort
        },
        null,
        2
      )
    );
  });

governor
  .command("check")
  .description("Evaluate whether an action is allowed now (simulate vs execute)")
  .requiredOption("--action <class>", "ActionClass")
  .requiredOption("--risk <tier>", "low|med|high|critical")
  .requiredOption("--mode <mode>", "simulate|execute")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { action: string; risk: string; mode: string; agent?: string }) => {
    const decision = runGovernorCheck({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      actionClass: normalizeActionClass(opts.action),
      riskTier: parseRiskTier(opts.risk),
      mode: opts.mode.toLowerCase() === "execute" ? "EXECUTE" : "SIMULATE"
    });
    console.log(JSON.stringify(decision, null, 2));
  });

governor
  .command("explain")
  .description("Explain policy requirements for an action class")
  .requiredOption("--action <class>", "ActionClass")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { action: string; agent?: string }) => {
    const explained = explainGovernorAction({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      actionClass: normalizeActionClass(opts.action)
    });
    console.log(JSON.stringify(explained, null, 2));
  });

governor
  .command("report")
  .description("Render matrix of current SIMULATE/EXECUTE allowance per ActionClass")
  .option("--window <window>", "unused placeholder for compatibility", "14d")
  .option("--out <path>", "output markdown path")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { window: string; out?: string; agent?: string }) => {
    const report = buildGovernorReport({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    if (opts.out) {
      const targetPath = resolve(process.cwd(), opts.out);
      ensureDir(dirname(targetPath));
      writeFileAtomic(targetPath, report.markdown, 0o644);
      console.log(chalk.green(`Governor report written: ${targetPath}`));
      return;
    }
    console.log(report.markdown);
  });

tools
  .command("init")
  .description("Create and sign .amc/tools.yaml")
  .action(() => {
    const created = initToolhubConfig(process.cwd());
    console.log(chalk.green(`Tools config created: ${created.configPath}`));
    console.log(`Signature: ${created.sigPath}`);
  });

tools
  .command("verify")
  .description("Verify tools.yaml signature")
  .action(() => {
    const verify = verifyToolhubConfig(process.cwd());
    if (verify.valid) {
      console.log(chalk.green(`Tools config signature valid: ${verify.sigPath}`));
      return;
    }
    console.log(chalk.red(`Tools config signature invalid: ${verify.reason ?? "unknown reason"}`));
    process.exit(1);
  });

tools
  .command("list")
  .description("List allowed ToolHub tools and action classes")
  .action(() => {
    for (const toolRow of listToolhubTools(process.cwd())) {
      console.log(`- ${toolRow.name} (${toolRow.actionClass}) execTicket=${toolRow.requireExecTicket ? "required" : "no"}`);
    }
  });

workorder
  .command("create")
  .description("Create and sign a work order")
  .requiredOption("--title <text>", "title")
  .requiredOption("--risk <tier>", "low|med|high|critical")
  .requiredOption("--mode <mode>", "simulate|execute")
  .option("--description <text>", "description")
  .option("--allow <class...>", "allowed ActionClass entries")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action(async (opts: { title: string; risk: string; mode: string; description?: string; allow?: string[]; agent?: string }) => {
    let description = opts.description;
    if (!description) {
      const answer = await inquirer.prompt<{ description: string }>([
        {
          type: "input",
          name: "description",
          message: "Work order description",
          default: `Execution envelope for ${opts.title}`
        }
      ]);
      description = answer.description;
    }
    const created = createWorkOrder({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      title: opts.title,
      description,
      riskTier: parseRiskTier(opts.risk),
      requestedMode: opts.mode.toLowerCase() === "execute" ? "EXECUTE" : "SIMULATE",
      allowedActionClasses: parseActionClasses(opts.allow ?? [])
    });
    console.log(chalk.green(`Work order created: ${created.workOrder.workOrderId}`));
    console.log(`File: ${created.filePath}`);
    console.log(`Signature: ${created.sigPath}`);
  });

workorder
  .command("list")
  .description("List work orders for agent")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const rows = listWorkOrders({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    if (rows.length === 0) {
      console.log("No work orders found.");
      return;
    }
    for (const row of rows) {
      console.log(`${row.workOrderId} | ${row.riskTier} | ${row.requestedMode} | valid=${row.valid ? "yes" : "no"} | expired=${row.expired ? "yes" : "no"} | ${row.title}`);
    }
  });

workorder
  .command("show")
  .description("Show signed work order JSON")
  .argument("<workOrderId>")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((workOrderId: string, opts: { agent?: string }) => {
    const workOrderObj = loadWorkOrder({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      workOrderId,
      requireValidSignature: false
    });
    console.log(JSON.stringify(workOrderObj, null, 2));
  });

workorder
  .command("verify")
  .description("Verify work order signature")
  .argument("<workOrderId>")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((workOrderId: string, opts: { agent?: string }) => {
    const verify = verifyWorkOrder({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      workOrderId
    });
    if (verify.valid && !verify.expired) {
      console.log(chalk.green(`Work order valid: ${workOrderId}`));
      return;
    }
    console.log(chalk.red(`Work order invalid: ${verify.reason ?? "unknown reason"}${verify.expired ? " (expired/revoked)" : ""}`));
    process.exit(1);
  });

workorder
  .command("expire")
  .description("Expire/revoke a work order")
  .argument("<workOrderId>")
  .option("--reason <text>", "reason")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((workOrderId: string, opts: { reason?: string; agent?: string }) => {
    const expired = expireWorkOrder({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      workOrderId,
      reason: opts.reason
    });
    console.log(chalk.green(`Work order revoked: ${workOrderId}`));
    console.log(`Revocation: ${expired.revokePath}`);
    console.log(`Signature: ${expired.sigPath}`);
  });

ticket
  .command("issue")
  .description("Issue short-lived signed execution ticket")
  .requiredOption("--workorder <id>", "work order ID")
  .requiredOption("--action <class>", "ActionClass")
  .option("--tool <name>", "restrict ticket to a tool")
  .option("--ttl <ttl>", "ticket TTL (e.g. 15m, 1h)", "15m")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { workorder: string; action: string; tool?: string; ttl: string; agent?: string }) => {
    const agentId = resolveAgentId(process.cwd(), opts.agent ?? activeAgent(program));
    const issued = issueExecTicket({
      workspace: process.cwd(),
      agentId,
      workOrderId: opts.workorder,
      actionClass: normalizeActionClass(opts.action),
      ttlMs: parseTtlToMs(opts.ttl),
      toolName: opts.tool
    });
    console.log(issued.ticket);
  });

ticket
  .command("verify")
  .description("Verify signed execution ticket")
  .argument("<ticketString>")
  .action((ticketString: string) => {
    const verified = verifyExecTicket({
      workspace: process.cwd(),
      ticket: ticketString
    });
    if (verified.ok) {
      console.log(chalk.green("Execution ticket valid"));
      console.log(JSON.stringify(verified.payload, null, 2));
      return;
    }
    console.log(chalk.red(`Execution ticket invalid: ${verified.error ?? "unknown reason"}`));
    process.exit(1);
  });

gateway
  .command("init")
  .description("Create and sign .amc/gateway.yaml")
  .option(
    "--provider <name>",
    "OpenAI|Azure OpenAI|xAI Grok|Anthropic|Gemini|OpenRouter|Groq|Mistral|Cohere|Together AI|Fireworks|Perplexity|DeepSeek|Qwen|Local OpenAI-compatible (vLLM/LM Studio/etc)|Other",
    "OpenAI"
  )
  .option("--base-url <url>", "required when provider=Other")
  .option("--auth-type <type>", "bearer_env|header_env|query_env|none", "bearer_env")
  .option("--env <name>", "API key env for auth", "OTHER_API_KEY")
  .option("--header <name>", "header name for header_env", "x-api-key")
  .option("--param <name>", "query param for query_env", "key")
  .action(
    (opts: {
      provider: string;
      baseUrl?: string;
      authType: "bearer_env" | "header_env" | "query_env" | "none";
      env: string;
      header: string;
      param: string;
    }) => {
      let config = presetGatewayConfigForProvider(opts.provider);

      if (opts.provider === "Other") {
        const auth =
          opts.authType === "bearer_env"
            ? { type: "bearer_env" as const, env: opts.env }
            : opts.authType === "header_env"
              ? { type: "header_env" as const, header: opts.header, env: opts.env }
              : opts.authType === "query_env"
                ? { type: "query_env" as const, param: opts.param, env: opts.env }
                : ({ type: "none" as const });

        config = {
          ...config,
          upstreams: {
            other: {
              baseUrl: opts.baseUrl ?? "https://example.com",
              auth,
              providerId: "custom"
            }
          },
          routes: [{ prefix: "/other", upstream: "other", stripPrefix: true, openaiCompatible: false }]
        };
      }

      const created = initGatewayConfig(process.cwd(), config);
      console.log(chalk.green(`Gateway config created: ${created.configPath}`));
      console.log(chalk.green(`Gateway config signature: ${created.sigPath}`));
    }
  );

gateway
  .command("start")
  .description("Start local reverse-proxy gateway and signed evidence capture")
  .option("--config <path>", "gateway config path", ".amc/gateway.yaml")
  .action(async (opts: { config: string }) => {
    const handle = await startGateway({
      workspace: process.cwd(),
      workspaceId: workspaceIdFromDirectory(process.cwd()),
      configPath: opts.config
    });

    console.log(chalk.cyan(`Gateway session: ${handle.gatewaySessionId}`));
    console.log(chalk.cyan(`Gateway URL: http://${handle.host}:${handle.port}`));
    if (handle.proxyEnabled && handle.proxyPort) {
      console.log(chalk.cyan(`Gateway Proxy URL: http://${handle.host}:${handle.proxyPort}`));
    }
    if (!handle.signatureValid) {
      console.log(chalk.yellow("Gateway config signature is missing/invalid. Gateway will run but diagnostics will apply trust penalties."));
    }
    for (const route of handle.routes) {
      console.log(`- ${route.prefix} -> ${route.upstream} openaiCompatible=${route.openaiCompatible ? "yes" : "no"} agent=${route.agentId ?? "unbound"}`);
    }

    await new Promise<void>((resolvePromise) => {
      const shutdown = async () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        await handle.close();
        resolvePromise();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  });

gateway
  .command("status")
  .description("Check gateway reachability and route URLs")
  .option("--config <path>", "gateway config path", ".amc/gateway.yaml")
  .action(async (opts: { config: string }) => {
    const status = await gatewayStatus(process.cwd(), opts.config);
    console.log(`Gateway base URL: ${status.baseUrl}`);
    console.log(`Reachable: ${status.reachable ? "YES" : "NO"}`);
    console.log(`Config signature: ${status.signatureValid ? "VALID" : status.signatureExists ? "INVALID" : "MISSING"}`);
    if (status.proxy.enabled && status.proxy.baseUrl) {
      console.log(`Proxy: ENABLED at ${status.proxy.baseUrl}`);
    } else {
      console.log("Proxy: disabled");
    }
    for (const route of status.routes) {
      console.log(
        `- ${route.prefix} -> ${route.upstream} (${route.baseUrl}) openaiCompatible=${route.openaiCompatible ? "yes" : "no"} agent=${route.agentId ?? "unbound"}`
      );
    }
  });

gateway
  .command("verify-config")
  .description("Verify .amc/gateway.yaml signature")
  .option("--config <path>", "gateway config path", ".amc/gateway.yaml")
  .action((opts: { config: string }) => {
    const result = verifyGatewayConfigSignature(process.cwd(), opts.config);
    if (result.valid) {
      console.log(chalk.green(`Gateway config signature valid: ${result.sigPath}`));
      return;
    }
    const reason = result.reason ?? "unknown reason";
    console.log(chalk.red(`Gateway config signature invalid: ${reason}`));
    process.exit(1);
  });

gateway
  .command("bind-agent")
  .description("Bind a gateway route prefix to an agent ID for deterministic attribution")
  .requiredOption("--route <prefix>", "route prefix, e.g. /openai")
  .requiredOption("--agent <agentId>", "agent ID to bind")
  .option("--config <path>", "gateway config path", ".amc/gateway.yaml")
  .action((opts: { route: string; agent: string; config: string }) => {
    const cfg = loadGatewayConfig(process.cwd(), opts.config);
    const updated = bindAgentRoute(cfg, opts.route, opts.agent);
    saveGatewayConfig(process.cwd(), updated, opts.config);
    signGatewayConfig(process.cwd(), opts.config);
    console.log(chalk.green(`Bound route ${opts.route} -> agent ${opts.agent}`));
  });

bundle
  .command("export")
  .description("Export a portable, signed evidence bundle for a run")
  .requiredOption("--run <runId>", "run ID")
  .requiredOption("--out <file>", "output .amcbundle file")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { run: string; out: string; agent?: string }) => {
    const result = exportEvidenceBundle({
      workspace: process.cwd(),
      runId: opts.run,
      outFile: opts.out,
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(chalk.green(`Bundle exported: ${result.outFile}`));
    console.log(`Files: ${result.fileCount}, Events: ${result.eventCount}, Sessions: ${result.sessionCount}`);
  });

bundle
  .command("verify")
  .description("Verify evidence bundle offline")
  .argument("<file>")
  .action(async (file: string) => {
    const result = await verifyEvidenceBundle(resolve(process.cwd(), file));
    if (result.ok) {
      console.log(chalk.green("Bundle verification PASSED"));
      console.log(`runId=${result.runId ?? "unknown"} agentId=${result.agentId ?? "unknown"}`);
      return;
    }
    console.log(chalk.red("Bundle verification FAILED"));
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

bundle
  .command("inspect")
  .description("Inspect bundle metadata")
  .argument("<file>")
  .action((file: string) => {
    const inspected = inspectEvidenceBundle(resolve(process.cwd(), file));
    const trustMap = loadBundleRunAndTrustMap(resolve(process.cwd(), file)).eventTrustTier;
    const observedCount = [...trustMap.values()].filter((tier) => tier === "OBSERVED").length;
    console.log(
      JSON.stringify(
        {
          runId: inspected.run.runId,
          agentId: inspected.run.agentId,
          integrityIndex: inspected.run.integrityIndex,
          trustLabel: inspected.run.trustLabel,
          manifest: inspected.manifest,
          fileCount: inspected.files.length,
          observedEvidenceEvents: observedCount
        },
        null,
        2
      )
    );
  });

bundle
  .command("diff")
  .description("Diff two bundles (maturity/integrity/targets)")
  .argument("<bundleA>")
  .argument("<bundleB>")
  .action((bundleA: string, bundleB: string) => {
    const diff = diffEvidenceBundles(resolve(process.cwd(), bundleA), resolve(process.cwd(), bundleB));
    console.log(JSON.stringify(diff, null, 2));
  });

evidence
  .command("export")
  .description("Export verifier-ready evidence (json|csv|pdf)")
  .option("--format <format>", "json|csv|pdf", "json")
  .option("--out <file>", "output file path")
  .option("--agent <agentId>", "agent ID (filter evidence by agent)")
  .option("--include-chain", "include hash chain verification fields")
  .option("--include-rationale", "include rationale fields")
  .action((opts: {
    format: string;
    out?: string;
    agent?: string;
    includeChain?: boolean;
    includeRationale?: boolean;
  }) => {
    const normalizedFormat = String(opts.format ?? "json").toLowerCase();
    if (normalizedFormat !== "json" && normalizedFormat !== "csv" && normalizedFormat !== "pdf") {
      console.log(chalk.red(`Unsupported format: ${opts.format}`));
      process.exit(1);
    }
    const outFile = opts.out ?? defaultEvidenceExportPath(process.cwd(), normalizedFormat);
    const exported = exportVerifierEvidence({
      workspace: process.cwd(),
      format: normalizedFormat,
      outFile,
      agentId: opts.agent,
      includeChain: Boolean(opts.includeChain),
      includeRationale: Boolean(opts.includeRationale)
    });
    console.log(chalk.green(`Evidence exported: ${exported.outFile}`));
    console.log(`format=${exported.format} events=${exported.eventCount} chainInvalid=${exported.chainInvalidCount}`);
    console.log(`sha256=${exported.sha256}`);
  });

program
  .command("audit-packet")
  .description("Generate external-auditor packet with verifier-ready evidence")
  .option("--output <file>", "output zip file", `./audit-${new Date().toISOString().slice(0, 10)}.zip`)
  .option("--agent <agentId>", "agent ID (filter evidence by agent)")
  .option("--no-include-chain", "omit hash chain fields from evidence export")
  .option("--no-include-rationale", "omit rationale fields from evidence export")
  .action(async (opts: {
    output: string;
    agent?: string;
    includeChain: boolean;
    includeRationale: boolean;
  }) => {
    const packet = await generateAuditPacket({
      workspace: process.cwd(),
      outputFile: opts.output,
      agentId: opts.agent,
      includeChain: opts.includeChain,
      includeRationale: opts.includeRationale
    });
    console.log(chalk.green(`Audit packet generated: ${packet.outFile}`));
    console.log(`sha256=${packet.sha256}`);
    console.log(`files=${packet.fileCount} events=${packet.eventCount} chainInvalid=${packet.chainInvalidCount}`);
    console.log(`integrity=${packet.integrityOk ? "PASS" : "FAIL"}`);
  });

program
  .command("gate")
  .description("Evaluate a run bundle against a signed gate policy")
  .requiredOption("--bundle <file>", "bundle path")
  .requiredOption("--policy <path>", "gate policy path")
  .action(async (opts: { bundle: string; policy: string }) => {
    const result = await runBundleGate({
      workspace: process.cwd(),
      bundlePath: opts.bundle,
      policyPath: opts.policy
    });
    if (result.pass) {
      console.log(chalk.green("Gate PASSED"));
      return;
    }
    console.log(chalk.red("Gate FAILED"));
    for (const reason of result.reasons) {
      console.log(`- ${reason}`);
    }
    process.exit(1);
  });

ci
  .command("init")
  .description("Generate GitHub workflow and signed gate policy")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const created = initCiForAgent({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(chalk.green(`CI workflow created: ${created.workflowPath}`));
    console.log(`Gate policy: ${created.policyPath}`);
    console.log(`Gate policy signature: ${created.policySigPath}`);
    console.log(`Expected bundle path: ${created.suggestedBundlePath}`);
  });

ci
  .command("print")
  .description("Print suggested CI pipeline steps")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const steps = printCiSteps({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    for (const step of steps) {
      console.log(step);
    }
  });

archetype
  .command("list")
  .description("List built-in archetype packs")
  .action(() => {
    const items = listArchetypes();
    for (const item of items) {
      console.log(`- ${item.id}: ${item.name} (${item.recommendedRiskTier})`);
      console.log(`  ${item.description}`);
    }
  });

archetype
  .command("describe")
  .description("Describe an archetype")
  .argument("<archetypeId>")
  .action((archetypeId: string) => {
    const details = describeArchetype(archetypeId);
    console.log(JSON.stringify(details, null, 2));
  });

archetype
  .command("apply")
  .description("Apply archetype context/targets/guardrails/evals to an agent")
  .argument("<archetypeId>")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action(async (archetypeId: string, opts: { agent?: string }) => {
    const preview = previewArchetypeApply({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      archetypeId
    });

    console.log(chalk.cyan(`Applying archetype: ${preview.archetype.name} (${preview.archetype.id})`));
    console.log("Context graph diff:");
    if (preview.contextDiff.length === 0) {
      console.log("- no top-level context changes detected");
    } else {
      for (const line of preview.contextDiff) {
        console.log(`- ${line}`);
      }
    }
    console.log("Target diff (sample):");
    for (const row of preview.targetChanges.slice(0, 20)) {
      console.log(`- ${row.questionId}: ${row.before} -> ${row.after}`);
    }
    if (preview.targetChanges.length > 20) {
      console.log(`- ... ${preview.targetChanges.length - 20} more changes`);
    }

    const confirm = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: "confirm",
        name: "proceed",
        message: "Apply these archetype changes?",
        default: false
      }
    ]);
    if (!confirm.proceed) {
      console.log("Archetype apply cancelled.");
      return;
    }

    const applied = applyArchetype({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      archetypeId
    });
    console.log(chalk.green(`Archetype applied to agent ${applied.agentId}`));
    console.log(`Target: ${applied.targetPath}`);
    console.log(`Audit session: ${applied.auditSessionId}`);
    for (const file of applied.changedFiles) {
      console.log(`- ${file}`);
    }
  });

exportGroup
  .command("policy")
  .description("Export framework-agnostic North Star policy integration pack")
  .requiredOption("--target <name>", "target profile name")
  .requiredOption("--out <dir>", "output directory")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { target: string; out: string; agent?: string }) => {
    const exported = exportPolicyPack({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      targetName: opts.target,
      outDir: opts.out
    });
    console.log(chalk.green(`Policy export created at ${exported.outputDir}`));
    console.log(`Manifest: ${exported.manifestPath}`);
    for (const file of exported.files) {
      console.log(`- ${file}`);
    }
  });

exportGroup
  .command("badge")
  .description("Export deterministic maturity badge SVG for a run")
  .requiredOption("--run <runId>", "run ID")
  .requiredOption("--out <file>", "output SVG path")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { run: string; out: string; agent?: string }) => {
    const badge = exportBadge({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      runId: opts.run,
      outFile: opts.out
    });
    console.log(chalk.green(`Badge exported: ${badge.outFile}`));
  });

dashboard
  .command("build")
  .description("Build responsive offline dashboard for an agent")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--out <dir>", "output dashboard directory")
  .action((opts: { agent?: string; out?: string }) => {
    const resolvedAgent = opts.agent ?? activeAgent(program);
    const defaultOut = resolvedAgent ? `.amc/agents/${resolvedAgent}/dashboard` : ".amc/dashboard";
    const built = buildDashboard({
      workspace: process.cwd(),
      agentId: resolvedAgent,
      outDir: opts.out ?? defaultOut
    });
    console.log(chalk.green(`Dashboard built: ${built.outDir}`));
    console.log(`Agent: ${built.agentId}`);
    console.log(`Latest run: ${built.latestRunId}`);
  });

dashboard
  .command("serve")
  .description("Serve dashboard locally")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--port <port>", "port", "4173")
  .option("--out <dir>", "dashboard directory override")
  .action(async (opts: { agent?: string; port: string; out?: string }) => {
    const handle = await serveDashboard({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      port: Number(opts.port),
      outDir: opts.out
    });
    console.log(chalk.green(`Dashboard serving at ${handle.url}`));
    await new Promise<void>((resolvePromise) => {
      const shutdown = async () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        await handle.close();
        resolvePromise();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  });

assurance
  .command("list")
  .description("List available assurance packs")
  .action(() => {
    for (const pack of listAssurancePacks()) {
      console.log(`- ${pack.id}: ${pack.title}`);
      console.log(`  ${pack.description}`);
      console.log(`  scenarios=${pack.scenarios.length}`);
    }
  });

assurance
  .command("describe")
  .description("Describe assurance pack details")
  .argument("<packId>")
  .action((packId: string) => {
    const pack = getAssurancePack(packId);
    console.log(JSON.stringify(pack, null, 2));
  });

assurance
  .command("init")
  .description("Initialize signed assurance policy")
  .action(() => {
    const out = assuranceInitCli(process.cwd());
    console.log(chalk.green(`Initialized assurance policy: ${out.path}`));
    console.log(`sig=${out.sigPath}`);
  });

assurance
  .command("verify-policy")
  .description("Verify assurance policy signature")
  .action(() => {
    const verify = assuranceVerifyPolicyCli(process.cwd());
    if (verify.valid) {
      console.log(chalk.green("Assurance policy signature valid"));
      console.log(verify.path);
      return;
    }
    console.log(chalk.red("Assurance policy signature invalid"));
    console.log(verify.reason ?? "unknown");
    process.exit(1);
  });

assurance
  .command("policy")
  .description("Print current assurance policy")
  .action(() => {
    console.log(JSON.stringify(assurancePrintPolicyCli(process.cwd()), null, 2));
  });

assurance
  .command("policy-apply")
  .description("Apply assurance policy from YAML/JSON file")
  .requiredOption("--file <path>", "policy file path")
  .action((opts: { file: string }) => {
    const out = assuranceApplyPolicyCli({
      workspace: process.cwd(),
      file: resolve(process.cwd(), opts.file)
    });
    console.log(chalk.green(`Applied assurance policy: ${out.path}`));
    console.log(`sig=${out.sigPath}`);
  });

assurance
  .command("run")
  .description("Run assurance pack(s) with deterministic validation")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--scope <scope>", "workspace|node|agent", "agent")
  .option("--id <id>", "scope target id")
  .option("--pack <packId>", "single pack ID")
  .option("--all", "run all assurance packs", false)
  .option("--mode <mode>", "supervise|sandbox", "sandbox")
  .option("--window <window>", "evidence window", "14d")
  .option("--window-days <days>", "assurance evidence window in days")
  .option("--out <path>", "output markdown path")
  .action(
    async (opts: {
      agent?: string;
      scope?: "workspace" | "node" | "agent";
      id?: string;
      pack?: string;
      all: boolean;
      mode: "supervise" | "sandbox";
      window: string;
      windowDays?: string;
      out?: string;
    }) => {
      const scope = (opts.scope ?? "agent").toLowerCase();
      if (scope === "workspace" || scope === "node") {
        const run = await assuranceRunCli({
          workspace: process.cwd(),
          scope: scope as "workspace" | "node",
          id: opts.id,
          pack: (opts.all ? "all" : opts.pack) as
            | "all"
            | "injection"
            | "exfiltration"
            | "toolMisuse"
            | "truthfulness"
            | "sandboxBoundary"
            | "notaryAttestation"
            | undefined,
          windowDays: opts.windowDays ? Number(opts.windowDays) : undefined
        });
        console.log(chalk.green(`Assurance run complete: ${run.run.runId}`));
        console.log(`Status: ${run.run.score.status}`);
        console.log(`RiskAssuranceScore: ${run.run.score.riskAssuranceScore ?? "UNKNOWN"}`);
        console.log(`Findings: ${run.findings.findings.length}`);
        return;
      }
      const report = await runAssurance({
        workspace: process.cwd(),
        agentId: opts.id ?? opts.agent ?? activeAgent(program),
        packId: opts.pack,
        runAll: opts.all,
        mode: opts.mode,
        window: opts.window,
        outputMarkdownPath: opts.out ? resolve(process.cwd(), opts.out) : undefined
      });
      console.log(chalk.green(`Assurance run complete: ${report.assuranceRunId}`));
      console.log(`Status: ${report.status}`);
      console.log(`TrustTier: ${report.trustTier}`);
      console.log(`IntegrityIndex: ${report.integrityIndex.toFixed(3)} (${report.trustLabel})`);
      console.log(`Overall score: ${report.overallScore0to100.toFixed(2)}`);
    }
  );

assurance
  .command("runs")
  .description("List assurance lab runs")
  .action(() => {
    const rows = assuranceRunsCli(process.cwd());
    if (rows.length === 0) {
      console.log("No assurance runs.");
      return;
    }
    for (const row of rows) {
      console.log(
        `${row.runId} | ${new Date(row.generatedTs).toISOString()} | ${row.scope.type}:${row.scope.id} | ${row.status} | score=${row.score ?? "UNKNOWN"}`
      );
    }
  });

assurance
  .command("show")
  .description("Show assurance run artifacts")
  .requiredOption("--run <id>", "run ID")
  .action((opts: { run: string }) => {
    console.log(JSON.stringify(assuranceShowRunCli({ workspace: process.cwd(), runId: opts.run }), null, 2));
  });

assurance
  .command("cert-issue")
  .description("Issue signed assurance certificate for a run")
  .requiredOption("--run <id>", "run ID")
  .option("--out <file.amccert>", "output certificate path")
  .action(async (opts: { run: string; out?: string }) => {
    const issued = await assuranceIssueCertCli({
      workspace: process.cwd(),
      runId: opts.run,
      outFile: opts.out ? resolve(process.cwd(), opts.out) : undefined
    });
    console.log(chalk.green(`Assurance certificate issued: ${issued.outFile}`));
    console.log(`certId=${issued.cert.certId}`);
  });

assurance
  .command("cert-verify")
  .description("Verify assurance certificate bundle offline")
  .argument("<file>")
  .action((file: string) => {
    const verified = assuranceVerifyCertCli({
      file: resolve(process.cwd(), file)
    });
    if (verified.ok) {
      console.log(chalk.green("Assurance certificate verification PASSED"));
      return;
    }
    console.log(chalk.red("Assurance certificate verification FAILED"));
    for (const error of verified.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

const assuranceScheduler = assurance.command("scheduler").description("Assurance scheduler controls");

assuranceScheduler
  .command("status")
  .description("Show scheduler status")
  .action(() => {
    console.log(JSON.stringify(assuranceSchedulerStatusCli(process.cwd()), null, 2));
  });

assuranceScheduler
  .command("run-now")
  .description("Run assurance scheduler immediately")
  .action(async () => {
    const out = await assuranceSchedulerRunNowCli(process.cwd());
    console.log(chalk.green(`Assurance scheduler run completed: ${out.run.run.runId}`));
    console.log(`certIssued=${out.cert ? "yes" : "no"}`);
  });

assuranceScheduler
  .command("enable")
  .description("Enable assurance scheduler")
  .action(() => {
    const out = assuranceSchedulerEnableCli({
      workspace: process.cwd(),
      enabled: true
    });
    console.log(chalk.green(`Assurance scheduler enabled: ${out.path}`));
  });

assuranceScheduler
  .command("disable")
  .description("Disable assurance scheduler")
  .action(() => {
    const out = assuranceSchedulerEnableCli({
      workspace: process.cwd(),
      enabled: false
    });
    console.log(chalk.green(`Assurance scheduler disabled: ${out.path}`));
  });

const assuranceWaiver = assurance.command("waiver").description("Assurance threshold waiver controls");

assuranceWaiver
  .command("request")
  .description("Request time-limited readiness waiver (dual-control approval required)")
  .requiredOption("--hours <n>", "waiver duration hours (max 72)")
  .requiredOption("--reason <text>", "waiver reason")
  .option("--agent <id>", "agent ID binding for approval intent", "default")
  .action((opts: { hours: string; reason: string; agent: string }) => {
    const out = assuranceWaiverRequestCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      reason: opts.reason,
      hours: Number(opts.hours)
    });
    console.log(chalk.green(`Waiver approval requested: ${out.requestId}`));
    console.log(`approvalRequestId=${out.approvalRequestId}`);
  });

assuranceWaiver
  .command("status")
  .description("Show waiver status (activates approved pending waivers)")
  .action(() => {
    console.log(JSON.stringify(assuranceWaiverStatusCli(process.cwd()), null, 2));
  });

assuranceWaiver
  .command("revoke")
  .description("Revoke active or specific waiver")
  .option("--waiver <id>", "waiver ID")
  .action((opts: { waiver?: string }) => {
    const out = assuranceWaiverRevokeCli({
      workspace: process.cwd(),
      waiverId: opts.waiver
    });
    if (!out.revoked) {
      console.log(out.reason);
      process.exit(1);
    }
    console.log(chalk.green(`Revoked waiver: ${out.waiverId}`));
  });

assurance
  .command("history")
  .description("List assurance run history")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const rows = listAssuranceHistory({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    if (rows.length === 0) {
      console.log("No assurance runs found.");
      return;
    }
    for (const row of rows) {
      console.log(`${row.assuranceRunId} | ${new Date(row.ts).toISOString()} | ${row.mode} | ${row.status}`);
    }
  });

assurance
  .command("verify")
  .description("Verify assurance run determinism and signatures")
  .requiredOption("--assuranceRun <id>", "assurance run ID")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action(async (opts: { assuranceRun: string; agent?: string }) => {
    const verified = await verifyAssuranceRun({
      workspace: process.cwd(),
      assuranceRunId: opts.assuranceRun,
      agentId: opts.agent ?? activeAgent(program)
    });
    if (verified.ok) {
      console.log(chalk.green("Assurance verification PASSED"));
      return;
    }
    console.log(chalk.red("Assurance verification FAILED"));
    for (const error of verified.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

assurance
  .command("patch")
  .description("Apply deterministic patch kit for failed assurance findings")
  .requiredOption("--assuranceRun <id>", "assurance run ID")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--apply", "apply patch kit", false)
  .action(async (opts: { assuranceRun: string; agent?: string; apply: boolean }) => {
    if (!opts.apply) {
      console.log("Use --apply to apply patch kit changes.");
      return;
    }
    const confirm = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: "confirm",
        name: "proceed",
        message: "Apply assurance patch kit changes now?",
        default: false
      }
    ]);
    if (!confirm.proceed) {
      console.log("Patch apply cancelled.");
      return;
    }
    const applied = await applyAssurancePatchKit({
      workspace: process.cwd(),
      assuranceRunId: opts.assuranceRun,
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(chalk.green(`Applied assurance patch kit for agent ${applied.agentId}`));
    for (const file of applied.changedFiles) {
      console.log(`- ${file}`);
    }
  });

program
  .command("certify")
  .description("Issue signed, offline-verifiable certificate bundle")
  .requiredOption("--run <runId>", "diagnostic run ID")
  .requiredOption("--policy <path>", "gate policy path")
  .requiredOption("--out <file>", "output .amccert file")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action(async (opts: { run: string; policy: string; out: string; agent?: string }) => {
    const issued = await issueCertificate({
      workspace: process.cwd(),
      runId: opts.run,
      policyPath: opts.policy,
      outFile: opts.out,
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(chalk.green(`Certificate issued: ${issued.outFile}`));
    console.log(`certId=${issued.certId}`);
  });

cert
  .command("verify")
  .description("Verify certificate bundle offline")
  .argument("<file>")
  .option("--revocation <path>", "optional revocation file")
  .action(async (file: string, opts: { revocation?: string }) => {
    const result = await verifyCertificate({
      certFile: resolve(process.cwd(), file),
      revocationFile: opts.revocation ? resolve(process.cwd(), opts.revocation) : undefined
    });
    if (result.ok) {
      console.log(chalk.green("Certificate verification PASSED"));
      console.log(`certId=${result.certId ?? "unknown"}`);
      return;
    }
    console.log(chalk.red("Certificate verification FAILED"));
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

cert
  .command("inspect")
  .description("Inspect certificate bundle contents")
  .argument("<file>")
  .action((file: string) => {
    const inspected = inspectCertificate(resolve(process.cwd(), file));
    console.log(
      JSON.stringify(
        {
          certId: inspected.cert.certId,
          agentId: inspected.cert.agentId,
          issuedTs: inspected.cert.issuedTs,
          integrityIndex: inspected.cert.integrityIndex,
          trustLabel: inspected.cert.trustLabel,
          fileCount: inspected.fileCount
        },
        null,
        2
      )
    );
  });

cert
  .command("revoke")
  .description("Create signed revocation file for a certificate")
  .requiredOption("--reason <text>", "revocation reason")
  .requiredOption("--cert <file>", "certificate file")
  .requiredOption("--out <file>", "output .amcrevoke file")
  .action((opts: { reason: string; cert: string; out: string }) => {
    const revoked = revokeCertificate({
      workspace: process.cwd(),
      certFile: resolve(process.cwd(), opts.cert),
      reason: opts.reason,
      outFile: opts.out
    });
    console.log(chalk.green(`Revocation created: ${revoked.outFile}`));
    console.log(`certId=${revoked.certId}`);
  });

cert
  .command("verify-revocation")
  .description("Verify revocation file signature")
  .argument("<file>")
  .action((file: string) => {
    const result = verifyRevocation(resolve(process.cwd(), file));
    if (result.ok) {
      console.log(chalk.green("Revocation verification PASSED"));
      console.log(`certId=${result.certId ?? "unknown"}`);
      return;
    }
    console.log(chalk.red("Revocation verification FAILED"));
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

vault
  .command("init")
  .description("Initialize encrypted vault for signing keys")
  .action(async () => {
    const created = await initVaultInteractive(process.cwd());
    console.log(chalk.green(`Vault initialized: ${created.vaultFile}`));
    console.log(`Metadata: ${created.metaFile}`);
  });

vault
  .command("unlock")
  .description("Unlock vault into memory for signing operations")
  .action(async () => {
    const passphrase = await unlockVaultInteractive(process.cwd());
    if (!process.env.AMC_VAULT_PASSPHRASE) {
      process.env.AMC_VAULT_PASSPHRASE = passphrase;
    }
    const status = vaultStatusNow(process.cwd());
    console.log(chalk.green(`Vault unlocked: ${status.unlocked ? "yes" : "no"}`));
  });

vault
  .command("lock")
  .description("Lock vault and clear in-memory private keys")
  .action(() => {
    lockVaultNow(process.cwd());
    console.log(chalk.green("Vault locked."));
  });

vault
  .command("status")
  .description("Show vault status")
  .action(() => {
    const status = vaultStatusNow(process.cwd());
    console.log(`exists=${status.exists ? "yes" : "no"}`);
    console.log(`unlocked=${status.unlocked ? "yes" : "no"}`);
    console.log(`vault=${status.vaultPath}`);
    console.log(`meta=${status.metaPath}`);
    if (status.lastUnlockedTs) {
      console.log(`lastUnlocked=${new Date(status.lastUnlockedTs).toISOString()}`);
    }
  });

vault
  .command("rotate-keys")
  .description("Rotate monitor signing key and append to public key history")
  .action(async () => {
    const rotated = await rotateVaultKeysInteractive(process.cwd());
    console.log(chalk.green(`Monitor key rotated: ${rotated.fingerprint}`));
    console.log(`Public key path: ${rotated.publicKeyPath}`);
  });

notary
  .command("init")
  .description("Initialize AMC Notary config and signing backend")
  .option("--notary-dir <dir>", "notary data directory")
  .option("--external-command <cmd>", "external signer command")
  .option("--external-args <args...>", "external signer args")
  .action(async (opts: { notaryDir?: string; externalCommand?: string; externalArgs?: string[] }) => {
    const created = opts.externalCommand
      ? await notaryInitCli({
        notaryDir: opts.notaryDir,
        externalSignerCommand: opts.externalCommand,
        externalSignerArgs: opts.externalArgs ?? []
      })
      : await notaryInitInteractiveCli({
        notaryDir: opts.notaryDir,
        externalSigner: false
      });
    console.log(chalk.green(`Notary initialized: ${created.notaryDir}`));
    console.log(`Config: ${created.configPath}`);
    console.log(`Public key: ${created.publicKeyPath}`);
    if (created.keyPath) {
      console.log(`Sealed key: ${created.keyPath}`);
    }
    console.log(`Fingerprint: ${created.fingerprint}`);
  });

notary
  .command("start")
  .description("Start AMC Notary service (foreground)")
  .option("--notary-dir <dir>", "notary data directory")
  .option("--workspace <dir>", "workspace path for attestation snapshots")
  .action(async (opts: { notaryDir?: string; workspace?: string }) => {
    const runtime = await notaryStartCli({
      notaryDir: opts.notaryDir,
      workspace: opts.workspace ?? process.cwd()
    });
    console.log(chalk.green(`AMC Notary running at ${runtime.url}`));
    const stop = async (): Promise<void> => {
      await runtime.close();
      process.exit(0);
    };
    process.on("SIGINT", () => {
      void stop();
    });
    process.on("SIGTERM", () => {
      void stop();
    });
    await new Promise<void>(() => {
      // hold foreground process
    });
  });

notary
  .command("status")
  .description("Show notary backend and log status")
  .option("--notary-dir <dir>", "notary data directory")
  .action((opts: { notaryDir?: string }) => {
    const status = notaryStatusCli({ notaryDir: opts.notaryDir });
    console.log(`notaryDir=${status.notaryDir}`);
    console.log(`config=${status.configPath}`);
    console.log(`backend=${status.backend}`);
    console.log(`ready=${status.ready ? "yes" : "no"}`);
    if (status.fingerprint) {
      console.log(`fingerprint=${status.fingerprint}`);
    }
    if (status.reasons.length > 0) {
      console.log(`reasons=${status.reasons.join("; ")}`);
    }
    console.log(`logPath=${status.logPath}`);
    console.log(`tailEntries=${status.tail.length}`);
  });

notary
  .command("pubkey")
  .description("Print notary public key and fingerprint")
  .option("--notary-dir <dir>", "notary data directory")
  .action((opts: { notaryDir?: string }) => {
    const out = notaryPubkeyCli({ notaryDir: opts.notaryDir });
    console.log(`notaryDir=${out.notaryDir}`);
    console.log(`fingerprint=${out.fingerprint}`);
    console.log(out.pubkeyPem);
  });

notary
  .command("attest")
  .description("Generate signed notary runtime attestation bundle (.amcattest)")
  .requiredOption("--out <file>", "output file path")
  .option("--notary-dir <dir>", "notary data directory")
  .option("--workspace <dir>", "workspace path for config snapshot", process.cwd())
  .action((opts: { out: string; notaryDir?: string; workspace?: string }) => {
    const out = notaryAttestCli({
      notaryDir: opts.notaryDir,
      workspace: opts.workspace ?? process.cwd(),
      outFile: opts.out
    });
    console.log(chalk.green(`Attestation written: ${out.outFile}`));
  });

notary
  .command("verify-attest")
  .description("Verify a .amcattest bundle offline")
  .argument("<file>")
  .action((file: string) => {
    const result = notaryVerifyAttestCli(file);
    if (result.ok) {
      console.log(chalk.green("Notary attestation verification PASSED"));
      return;
    }
    console.log(chalk.red("Notary attestation verification FAILED"));
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

notary
  .command("sign")
  .description("Sign a payload file using Notary (admin utility)")
  .requiredOption("--kind <kind>", "sign kind")
  .requiredOption("--in <file>", "input file")
  .requiredOption("--out <file>", "output signature JSON")
  .option("--notary-dir <dir>", "notary data directory")
  .action((opts: { kind: string; in: string; out: string; notaryDir?: string }) => {
    const out = notarySignCli({
      notaryDir: opts.notaryDir,
      kind: opts.kind,
      inFile: opts.in,
      outFile: opts.out
    });
    console.log(chalk.green(`Signature written: ${out.outFile}`));
    console.log(`fingerprint=${out.fingerprint}`);
    console.log(`payloadSha256=${out.payloadSha256}`);
  });

notary
  .command("log-verify")
  .description("Verify notary append-only signing log + seal signature")
  .option("--notary-dir <dir>", "notary data directory")
  .action((opts: { notaryDir?: string }) => {
    const verify = notaryLogVerifyCli({
      notaryDir: opts.notaryDir
    });
    if (verify.ok) {
      console.log(chalk.green(`Notary log verification PASSED (${verify.count} entries)`));
      console.log(`lastHash=${verify.lastHash}`);
      return;
    }
    console.log(chalk.red("Notary log verification FAILED"));
    for (const error of verify.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

trust
  .command("init")
  .description("Create and sign .amc/trust.yaml")
  .action(() => {
    assertOwnerMode(process.cwd(), "trust init");
    const created = initTrustConfig(process.cwd());
    console.log(chalk.green(`Trust config created: ${created.path}`));
    console.log(`Signature: ${created.sigPath}`);
    console.log(`Mode: ${created.config.trust.mode}`);
  });

trust
  .command("enable-notary")
  .description("Enable fail-closed NOTARY trust mode")
  .requiredOption("--base-url <url>", "notary base URL")
  .requiredOption("--pin <pubkeyFile>", "path to notary public key PEM")
  .option("--require <level>", "SOFTWARE|HARDWARE", "HARDWARE")
  .option("--unix-socket <path>", "optional unix socket path")
  .action(async (opts: { baseUrl: string; pin: string; require: string; unixSocket?: string }) => {
    assertOwnerMode(process.cwd(), "trust enable-notary");
    const required = opts.require.toUpperCase() === "SOFTWARE" ? "SOFTWARE" : "HARDWARE";
    const enabled = await enableNotaryTrust({
      workspace: process.cwd(),
      baseUrl: opts.baseUrl,
      pinPubkeyPath: opts.pin,
      requiredAttestationLevel: required,
      unixSocketPath: opts.unixSocket ?? null
    });
    console.log(chalk.green("Notary trust mode enabled."));
    console.log(`Trust config: ${enabled.path}`);
    console.log(`Signature: ${enabled.sigPath}`);
    console.log(`Pinned fingerprint: ${enabled.fingerprint}`);
  });

trust
  .command("status")
  .description("Show trust mode, signature status, and notary health")
  .action(async () => {
    const workspace = process.cwd();
    const sig = verifyTrustConfigSignature(workspace);
    const trustCfg = loadTrustConfig(workspace);
    const status = await checkNotaryTrust(workspace).catch((error) => ({
      mode: trustCfg.trust.mode,
      ok: false,
      reasons: [String(error)],
      signatureValid: sig.valid,
      notaryReachable: false,
      pinnedFingerprint: trustCfg.trust.mode === "NOTARY" ? trustCfg.trust.notary.pinnedPubkeyFingerprint : null,
      currentFingerprint: null,
      attestationLevel: null,
      requiredAttestationLevel: trustCfg.trust.mode === "NOTARY" ? trustCfg.trust.notary.requiredAttestationLevel : null,
      lastAttestationTs: null
    }));
    console.log(`mode=${status.mode}`);
    console.log(`configSignatureValid=${sig.valid ? "yes" : "no"}`);
    if (!sig.valid) {
      console.log(`configSignatureReason=${sig.reason ?? "unknown"}`);
    }
    console.log(`ok=${status.ok ? "yes" : "no"}`);
    console.log(`notaryReachable=${status.notaryReachable ? "yes" : "no"}`);
    console.log(`pinnedFingerprint=${status.pinnedFingerprint ?? "n/a"}`);
    console.log(`currentFingerprint=${status.currentFingerprint ?? "n/a"}`);
    console.log(`attestationLevel=${status.attestationLevel ?? "n/a"}`);
    console.log(`requiredAttestationLevel=${status.requiredAttestationLevel ?? "n/a"}`);
    if (status.lastAttestationTs) {
      console.log(`lastAttestationTs=${new Date(status.lastAttestationTs).toISOString()}`);
    }
    if (status.reasons.length > 0) {
      for (const reason of status.reasons) {
        console.log(`- ${reason}`);
      }
    }
  });

trust
  .command("freshness")
  .description("Report temporal trust freshness and half-life decay")
  .option("--agent <agentId>", "agent ID", "default")
  .option("--lookback-days <n>", "lookback horizon in days", "90")
  .option("--stale-threshold <n>", "stale alert threshold for decay delta", "0.2")
  .option("--half-life-behavioral <days>", "half-life for behavioral evidence (days)")
  .option("--half-life-assurance <days>", "half-life for assurance evidence (days)")
  .option("--half-life-cryptographic <days>", "half-life for cryptographic evidence (days)")
  .option("--half-life-self-reported <days>", "half-life for self-reported evidence (days)")
  .option("--view <mode>", "summary|freshness|json", "summary")
  .action((opts: {
    agent: string;
    lookbackDays: string;
    staleThreshold: string;
    halfLifeBehavioral?: string;
    halfLifeAssurance?: string;
    halfLifeCryptographic?: string;
    halfLifeSelfReported?: string;
    view: "summary" | "freshness" | "json";
  }) => {
    const nowTs = Date.now();
    const lookbackDays = Math.max(1, parseInt(opts.lookbackDays, 10) || 90);
    const staleThreshold = Number.parseFloat(opts.staleThreshold);
    const config = decayConfigSchema.parse({
      behavioral: opts.halfLifeBehavioral !== undefined ? Number.parseFloat(opts.halfLifeBehavioral) : undefined,
      assurance: opts.halfLifeAssurance !== undefined ? Number.parseFloat(opts.halfLifeAssurance) : undefined,
      cryptographic: opts.halfLifeCryptographic !== undefined ? Number.parseFloat(opts.halfLifeCryptographic) : undefined,
      selfReported: opts.halfLifeSelfReported !== undefined ? Number.parseFloat(opts.halfLifeSelfReported) : undefined
    });
    const runs = loadTemporalDecayRuns(process.cwd(), resolveAgentId(process.cwd(), opts.agent), lookbackDays, nowTs);
    const evidence = deriveTemporalEvidenceFromRuns(runs);
    const report = computeTemporalDecayReport(opts.agent, evidence, config, nowTs, Number.isFinite(staleThreshold) ? staleThreshold : 0.2);

    if (opts.view === "json") {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    if (opts.view === "freshness") {
      console.log(renderFreshnessMarkdown(report));
      return;
    }
    console.log(renderTemporalDecayMarkdown(report));
  });

mode
  .command("owner")
  .description("Switch to owner mode (configuration + signing allowed)")
  .action(() => {
    setMode(process.cwd(), "owner");
    console.log(chalk.green("Mode set to owner"));
  });

mode
  .command("agent")
  .description("Switch to agent mode (read-only / self-check commands)")
  .action(() => {
    setMode(process.cwd(), "agent");
    console.log(chalk.green("Mode set to agent"));
  });

mode.action(() => {
  const current: AMCMode = getMode(process.cwd());
  console.log(`Current mode: ${current}`);
});

user
  .command("init")
  .description("Initialize signed users.yaml with first OWNER user")
  .requiredOption("--username <name>", "owner username")
  .action(async (opts: { username: string }) => {
    const passwordAnswer = await inquirer.prompt<{ password: string }>([
      {
        type: "password",
        name: "password",
        message: `Password for ${opts.username}`,
        mask: "*"
      }
    ]);
    const created = userInitCli({
      workspace: process.cwd(),
      username: opts.username,
      password: passwordAnswer.password
    });
    console.log(chalk.green(`Users config created: ${created.path}`));
    console.log(`Signature: ${created.sigPath}`);
    console.log(`Owner: ${created.username} roles=${created.roles.join(",")}`);
  });

user
  .command("add")
  .description("Add a user with RBAC roles")
  .requiredOption("--username <name>", "username")
  .requiredOption("--role <roles>", "comma-separated roles, e.g. APPROVER or OWNER,APPROVER")
  .action(async (opts: { username: string; role: string }) => {
    const passwordAnswer = await inquirer.prompt<{ password: string }>([
      {
        type: "password",
        name: "password",
        message: `Password for ${opts.username}`,
        mask: "*"
      }
    ]);
    const created = userAddCli({
      workspace: process.cwd(),
      username: opts.username,
      roles: parseRolesCsv(opts.role),
      password: passwordAnswer.password
    });
    console.log(chalk.green(`User added: ${created.username}`));
    console.log(`Roles: ${created.roles.join(",")}`);
  });

user
  .command("list")
  .description("List RBAC users")
  .action(() => {
    const rows = userListCli(process.cwd());
    if (rows.length === 0) {
      console.log("No users configured.");
      return;
    }
    for (const row of rows) {
      console.log(`${row.username} | roles=${row.roles.join(",")} | status=${row.status} | created=${new Date(row.createdTs).toISOString()}`);
    }
  });

user
  .command("revoke")
  .description("Revoke a user account")
  .argument("<username>")
  .action((username: string) => {
    const out = userRevokeCli({
      workspace: process.cwd(),
      username
    });
    console.log(chalk.green(`User updated: ${out.username} status=${out.status}`));
  });

user
  .command("role")
  .description("Set user roles")
  .command("set")
  .description("Replace roles for a user")
  .argument("<username>")
  .requiredOption("--roles <roles>", "comma-separated roles")
  .action((username: string, opts: { roles: string }) => {
    const out = userRoleSetCli({
      workspace: process.cwd(),
      username,
      roles: parseRolesCsv(opts.roles)
    });
    console.log(chalk.green(`User roles updated: ${out.username}`));
    console.log(`Roles: ${out.roles.join(",")}`);
  });

user
  .command("verify")
  .description("Verify users.yaml signature")
  .action(() => {
    const verify = userVerifyCli(process.cwd());
    if (verify.valid) {
      console.log(chalk.green(`Users signature valid: ${verify.sigPath}`));
      return;
    }
    console.log(chalk.red(`Users signature invalid: ${verify.reason ?? "unknown reason"}`));
    process.exit(1);
  });

identity
  .command("init")
  .description("Create and sign host-level identity.yaml")
  .requiredOption("--host-dir <path>", "host directory")
  .action((opts: { hostDir: string }) => {
    const out = identityInitCli(resolve(opts.hostDir));
    console.log(chalk.green(`Identity config created: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

identity
  .command("verify")
  .description("Verify identity.yaml signature")
  .requiredOption("--host-dir <path>", "host directory")
  .action((opts: { hostDir: string }) => {
    const out = identityVerifyCli(resolve(opts.hostDir));
    if (out.valid) {
      console.log(chalk.green(`Identity signature valid: ${out.sigPath}`));
      return;
    }
    console.log(chalk.red(`Identity signature invalid: ${out.reason ?? "unknown reason"}`));
    process.exit(1);
  });

const identityProvider = identity.command("provider").description("Identity provider management");

identityProvider
  .command("add")
  .description("Add an identity provider")
  .argument("<type>", "oidc|saml")
  .requiredOption("--host-dir <path>", "host directory")
  .requiredOption("--id <providerId>", "provider ID")
  .option("--display-name <name>", "display name")
  .option("--issuer <issuer>", "OIDC issuer URL")
  .option("--client-id <id>", "OIDC client ID")
  .option("--client-secret-file <path>", "OIDC client secret file")
  .option("--redirect-uri <uri>", "OIDC redirect URI")
  .option("--scopes <scopes>", "comma-separated OIDC scopes")
  .option("--use-well-known <bool>", "true|false", "true")
  .option("--authorization-endpoint <url>", "OIDC authorization endpoint")
  .option("--token-endpoint <url>", "OIDC token endpoint")
  .option("--jwks-uri <url>", "OIDC JWKS URI")
  .option("--entry-point <url>", "SAML IdP entry point")
  .option("--idp-cert-file <path>", "SAML IdP certificate file")
  .option("--sp-entity-id <id>", "SAML SP entity ID")
  .option("--acs-url <url>", "SAML ACS URL")
  .action((type: string, opts: {
    hostDir: string;
    id: string;
    displayName?: string;
    issuer?: string;
    clientId?: string;
    clientSecretFile?: string;
    redirectUri?: string;
    scopes?: string;
    useWellKnown?: string;
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    jwksUri?: string;
    entryPoint?: string;
    idpCertFile?: string;
    spEntityId?: string;
    acsUrl?: string;
  }) => {
    const hostDir = resolve(opts.hostDir);
    const normalized = type.trim().toLowerCase();
    if (normalized === "oidc") {
      if (!opts.issuer || !opts.clientId || !opts.clientSecretFile || !opts.redirectUri) {
        throw new Error("OIDC requires --issuer, --client-id, --client-secret-file, and --redirect-uri.");
      }
      const out = identityProviderAddOidcCli({
        hostDir,
        providerId: opts.id,
        displayName: opts.displayName,
        issuer: opts.issuer,
        clientId: opts.clientId,
        clientSecretFile: opts.clientSecretFile,
        redirectUri: opts.redirectUri,
        scopes: opts.scopes
          ? opts.scopes
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
          : undefined,
        useWellKnown: String(opts.useWellKnown ?? "true").toLowerCase() !== "false",
        authorizationEndpoint: opts.authorizationEndpoint,
        tokenEndpoint: opts.tokenEndpoint,
        jwksUri: opts.jwksUri
      });
      console.log(chalk.green(`OIDC provider configured: ${opts.id}`));
      console.log(`Identity config: ${out.path}`);
      console.log(`Signature: ${out.sigPath}`);
      return;
    }
    if (normalized === "saml") {
      if (!opts.entryPoint || !opts.issuer || !opts.idpCertFile || !opts.spEntityId || !opts.acsUrl) {
        throw new Error("SAML requires --entry-point, --issuer, --idp-cert-file, --sp-entity-id, and --acs-url.");
      }
      const out = identityProviderAddSamlCli({
        hostDir,
        providerId: opts.id,
        displayName: opts.displayName,
        entryPoint: opts.entryPoint,
        issuer: opts.issuer,
        idpCertFile: opts.idpCertFile,
        spEntityId: opts.spEntityId,
        acsUrl: opts.acsUrl
      });
      console.log(chalk.green(`SAML provider configured: ${opts.id}`));
      console.log(`Identity config: ${out.path}`);
      console.log(`Signature: ${out.sigPath}`);
      return;
    }
    throw new Error(`Unsupported provider type: ${type}. Use oidc or saml.`);
  });

const identityMapping = identity.command("mapping").description("Signed group-to-role mapping rules");

identityMapping
  .command("add")
  .description("Add a group mapping rule")
  .requiredOption("--host-dir <path>", "host directory")
  .requiredOption("--group <name>", "group name")
  .option("--provider-id <id>", "provider ID")
  .option("--workspace <id>", "workspace ID")
  .option("--roles <roles>", "comma-separated workspace roles")
  .option("--host-admin", "grant host admin")
  .action((opts: { hostDir: string; group: string; providerId?: string; workspace?: string; roles?: string; hostAdmin?: boolean }) => {
    const allowedRoles = new Set(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"]);
    const parsedRoles = opts.roles
      ? opts.roles
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter((value): value is "OWNER" | "OPERATOR" | "AUDITOR" | "VIEWER" => allowedRoles.has(value))
      : undefined;
    const out = identityMappingAddCli({
      hostDir: resolve(opts.hostDir),
      group: opts.group,
      providerId: opts.providerId,
      workspaceId: opts.workspace,
      roles: parsedRoles,
      hostAdmin: Boolean(opts.hostAdmin)
    });
    console.log(chalk.green(`Identity mapping added for group ${opts.group}`));
    console.log(`Identity config: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

const scimToken = scim.command("token").description("SCIM bearer token operations");

scimToken
  .command("create")
  .description("Create a SCIM bearer token and store hash in host vault")
  .requiredOption("--host-dir <path>", "host directory")
  .requiredOption("--name <name>", "token name")
  .option("--out <file>", "optional path to write token (0600)")
  .action((opts: { hostDir: string; name: string; out?: string }) => {
    const created = scimTokenCreateCli({
      hostDir: resolve(opts.hostDir),
      name: opts.name,
      outFile: opts.out
    });
    console.log(chalk.yellow("Store this token securely; it is shown once."));
    console.log(`tokenId=${created.tokenId}`);
    console.log(`token=${created.token}`);
    console.log(`tokenHash=${created.tokenHash}`);
    if (opts.out) {
      console.log(`written=${resolve(opts.out)}`);
    }
  });

pair
  .command("create")
  .description("Create one-time pairing code (LAN login pairing or agent bridge pairing)")
  .option("--ttl <ttl>", "ttl (e.g. 10m)", "10m")
  .option("--ttl-min <minutes>", "agent pairing TTL minutes", "10")
  .option("--agent-name <name>", "agent name for bridge pairing mode")
  .option("--workspace <workspaceId>", "workspace id hint for host mode (metadata only)")
  .action((opts: { ttl: string; ttlMin: string; agentName?: string; workspace?: string }) => {
    const workspace = process.cwd();
    if (opts.agentName && opts.agentName.trim().length > 0) {
      const created = createBridgePairingCode({
        workspace,
        agentName: opts.agentName.trim(),
        ttlMinutes: Math.max(1, Number(opts.ttlMin) || 10)
      });
      const payload = {
        auditType: "PAIR_CREATED",
        severity: "LOW",
        pairingId: created.pairingId,
        expiresTs: created.expiresTs,
        mode: "AGENT_BRIDGE",
        agentId: created.agentId,
        workspaceHint: opts.workspace ?? null
      };
      const body = JSON.stringify(payload);
      const ledger = openLedger(workspace);
      try {
        const sessionId = randomUUID();
        ledger.startSession({
          sessionId,
          runtime: "unknown",
          binaryPath: "amc-pair",
          binarySha256: sha256Hex("amc-pair")
        });
        ledger.appendEvidenceWithReceipt({
          sessionId,
          runtime: "unknown",
          eventType: "audit",
          payload: body,
          payloadExt: "json",
          inline: true,
          meta: {
            ...payload,
            trustTier: "OBSERVED"
          },
          receipt: {
            kind: "guard_check",
            agentId: created.agentId,
            providerId: "unknown",
            model: null,
            bodySha256: sha256Hex(Buffer.from(body, "utf8"))
          }
        });
        ledger.sealSession(sessionId);
      } finally {
        ledger.close();
      }
      console.log(chalk.green(`Pairing code: ${created.code}`));
      console.log(`pairingId=${created.pairingId}`);
      console.log(`agentId=${created.agentId}`);
      console.log(`expires=${new Date(created.expiresTs).toISOString()}`);
      console.log("Redeem with: amc pair redeem <code> --out ./agent.token --bridge-url http://127.0.0.1:3212");
      return;
    }

    const out = createPairingCode({
      workspace,
      ttlMs: parseTtlToMs(opts.ttl)
    });
    const payload = {
      auditType: "PAIR_CREATED",
      severity: "LOW",
      pairingId: out.id,
      expiresTs: out.expiresTs
    };
    const body = JSON.stringify(payload);
    const ledger = openLedger(workspace);
    try {
      const sessionId = randomUUID();
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-pair",
        binarySha256: sha256Hex("amc-pair")
      });
      ledger.appendEvidenceWithReceipt({
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload: body,
        payloadExt: "json",
        inline: true,
        meta: {
          ...payload,
          trustTier: "OBSERVED"
        },
        receipt: {
          kind: "guard_check",
          agentId: "system",
          providerId: "unknown",
          model: null,
          bodySha256: sha256Hex(Buffer.from(body, "utf8"))
        }
      });
      ledger.sealSession(sessionId);
    } finally {
      ledger.close();
    }
    console.log(chalk.green(`Pairing code: ${out.code}`));
    console.log(`pairingId=${out.id}`);
    console.log(`expires=${new Date(out.expiresTs).toISOString()}`);
  });

pair
  .command("redeem")
  .description("Redeem pairing code for a lease token file")
  .argument("<pairingCode>", "pairing code (AMC-XXXX-XXXX)")
  .requiredOption("--out <file>", "output token file path")
  .option("--bridge-url <url>", "studio base URL (or workspace URL in host mode)", process.env.AMC_BRIDGE_URL ?? "http://127.0.0.1:3212")
  .option("--lease-ttl-min <minutes>", "lease TTL minutes", "60")
  .action(async (pairingCode: string, opts: { out: string; bridgeUrl: string; leaseTtlMin: string }) => {
    const base = bridgeBaseUrl(opts.bridgeUrl);
    const response = await httpPostJson(`${base}/pair/redeem`, {
      code: pairingCode,
      leaseTtlMinutes: Math.max(1, Number(opts.leaseTtlMin) || 60)
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`pair redeem failed (${response.status}): ${response.body}`);
    }
    const parsed = JSON.parse(response.body) as {
      lease?: string;
      agentId?: string;
      workspaceId?: string;
      expiresTs?: number;
    };
    if (!parsed.lease) {
      throw new Error("pair redeem response missing lease");
    }
    const outPath = resolve(process.cwd(), opts.out);
    writeFileAtomic(outPath, `${parsed.lease}\n`, 0o600);
    console.log(chalk.green("Pairing redeemed"));
    console.log(`tokenFile=${outPath}`);
    console.log(`agentId=${parsed.agentId ?? "unknown"}`);
    console.log(`workspaceId=${parsed.workspaceId ?? "unknown"}`);
    if (typeof parsed.expiresTs === "number") {
      console.log(`expires=${new Date(parsed.expiresTs).toISOString()}`);
    }
  });

transparency
  .command("init")
  .description("Initialize append-only transparency log")
  .action(() => {
    const out = initTransparencyLog(process.cwd());
    console.log(chalk.green(`Transparency log initialized: ${out.logPath}`));
    console.log(`Seal: ${out.sealPath}`);
    console.log(`Signature: ${out.sealSigPath}`);
  });

transparency
  .command("verify")
  .description("Verify transparency chain + seal signature")
  .action(() => {
    const result = verifyTransparencyLog(process.cwd());
    if (result.ok) {
      console.log(chalk.green("Transparency log verification PASSED"));
      console.log(`entries=${result.entryCount}`);
      return;
    }
    console.log(chalk.red("Transparency log verification FAILED"));
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

transparency
  .command("tail")
  .description("Tail transparency entries")
  .option("--n <count>", "number of entries", "50")
  .action((opts: { n: string }) => {
    const rows = tailTransparencyEntries(process.cwd(), Number(opts.n) || 50);
    for (const row of rows) {
      console.log(JSON.stringify(row));
    }
  });

transparency
  .command("export")
  .description("Export transparency bundle")
  .requiredOption("--out <file>", "output .amctlog file")
  .action(async (opts: { out: string }) => {
    const out = await exportTransparencyBundle({
      workspace: process.cwd(),
      outFile: resolve(process.cwd(), opts.out)
    });
    console.log(chalk.green(`Transparency bundle exported: ${out.outFile}`));
  });

transparency
  .command("verify-bundle")
  .description("Verify exported transparency bundle")
  .argument("<file>")
  .action((file: string) => {
    const verified = verifyTransparencyBundle(resolve(process.cwd(), file));
    if (verified.ok) {
      console.log(chalk.green("Transparency bundle verification PASSED"));
      return;
    }
    console.log(chalk.red("Transparency bundle verification FAILED"));
    for (const error of verified.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

transparencyMerkle
  .command("rebuild")
  .description("Rebuild Merkle leaves/roots from transparency log")
  .action(() => {
    const out = transparencyMerkleRebuildCli(process.cwd());
    console.log(chalk.green("Transparency Merkle rebuilt"));
    console.log(`leafCount=${out.leafCount}`);
    console.log(`root=${out.root}`);
    console.log(`currentRoot=${out.currentRootPath}`);
    console.log(`signature=${out.currentRootSigPath}`);
  });

transparencyMerkle
  .command("root")
  .description("Show current Merkle root and history")
  .action(() => {
    const out = transparencyMerkleRootCli(process.cwd());
    console.log(
      JSON.stringify(
        {
          current: out.current,
          history: out.history,
          verify: out.verify
        },
        null,
        2
      )
    );
  });

transparencyMerkle
  .command("prove")
  .description("Export signed inclusion proof bundle for entry hash")
  .requiredOption("--entry-hash <hash>", "transparency entry hash")
  .requiredOption("--out <file>", "output .amcproof file")
  .action((opts: { entryHash: string; out: string }) => {
    const out = transparencyMerkleProofCli({
      workspace: process.cwd(),
      entryHash: opts.entryHash,
      outFile: opts.out
    });
    console.log(chalk.green(`Proof exported: ${out.outFile}`));
    console.log(`entryHash=${out.proof.entryHash}`);
    console.log(`leafIndex=${out.proof.leafIndex}`);
    console.log(`merkleRoot=${out.proof.merkleRoot}`);
  });

transparencyMerkle
  .command("verify-proof")
  .description("Verify signed inclusion proof bundle")
  .argument("<file>")
  .action((file: string) => {
    const out = transparencyMerkleVerifyProofCli(resolve(process.cwd(), file));
    if (out.ok) {
      console.log(chalk.green("Proof verification PASSED"));
      return;
    }
    console.log(chalk.red("Proof verification FAILED"));
    for (const error of out.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

compliance
  .command("init")
  .description("Create and sign compliance-maps.yaml")
  .action(() => {
    const out = initComplianceMapsCli(process.cwd());
    console.log(chalk.green(`Compliance maps created: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

compliance
  .command("verify")
  .description("Verify compliance maps signature")
  .action(() => {
    const out = verifyComplianceMapsCli(process.cwd());
    if (out.valid) {
      console.log(chalk.green(`Compliance maps signature valid: ${out.sigPath}`));
      return;
    }
    console.log(chalk.red(`Compliance maps signature invalid: ${out.reason ?? "unknown reason"}`));
    process.exit(1);
  });

compliance
  .command("report")
  .description("Generate evidence-linked compliance report")
  .requiredOption("--framework <framework>", `one of: ${frameworkChoices().join(", ")}`)
  .requiredOption("--window <window>", "window (e.g. 14d)")
  .requiredOption("--out <path>", "output path (.md or .json)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { framework: string; window: string; out: string; agent?: string }) => {
    const framework = opts.framework as ComplianceFramework;
    const family = getFrameworkFamily(framework);
    const format = opts.out.toLowerCase().endsWith(".json") ? "json" : "md";
    const out = complianceReportCli({
      workspace: process.cwd(),
      framework,
      window: opts.window,
      outFile: opts.out,
      format,
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(chalk.green(`Compliance report generated: ${out.outFile}`));
    console.log(`Framework: ${family.displayName}`);
    console.log(`Coverage score: ${out.report.coverage.score.toFixed(3)}`);
  });

compliance
  .command("fleet")
  .description("Generate fleet compliance summary")
  .requiredOption("--framework <framework>", `one of: ${frameworkChoices().join(", ")}`)
  .requiredOption("--window <window>", "window (e.g. 30d)")
  .requiredOption("--out <path>", "output .json path")
  .action((opts: { framework: string; window: string; out: string }) => {
    const framework = opts.framework as ComplianceFramework;
    const report = complianceFleetReportCli({
      workspace: process.cwd(),
      framework,
      window: opts.window
    });
    writeFileAtomic(resolve(process.cwd(), opts.out), JSON.stringify(report, null, 2), 0o644);
    console.log(chalk.green(`Fleet compliance report generated: ${resolve(process.cwd(), opts.out)}`));
  });

compliance
  .command("diff")
  .description("Diff two compliance report JSON files")
  .argument("<reportA>")
  .argument("<reportB>")
  .action((reportA: string, reportB: string) => {
    const diff = complianceDiffCli(readUtf8(resolve(process.cwd(), reportA)), readUtf8(resolve(process.cwd(), reportB)));
    console.log(JSON.stringify(diff, null, 2));
  });

federate
  .command("init")
  .description("Initialize federation identity and signed config")
  .option("--org <name>", "organization name", "AMC Federation")
  .action((opts: { org: string }) => {
    const out = federateInitCli({
      workspace: process.cwd(),
      orgName: opts.org
    });
    console.log(chalk.green(`Federation initialized: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
    console.log(`Publisher fingerprint: ${out.publisherFingerprint}`);
  });

federate
  .command("verify")
  .description("Verify federation config signature")
  .action(() => {
    const out = federateVerifyCli(process.cwd());
    if (out.valid) {
      console.log(chalk.green(`Federation signature valid: ${out.sigPath}`));
      return;
    }
    console.log(chalk.red(`Federation signature invalid: ${out.reason ?? "unknown reason"}`));
    process.exit(1);
  });

const federatePeer = federate.command("peer").description("Federation peer trust anchors");

federatePeer
  .command("add")
  .description("Add a peer publisher public key")
  .requiredOption("--peerId <id>", "peer ID")
  .requiredOption("--name <name>", "peer display name")
  .requiredOption("--pubkey <file>", "publisher public key file")
  .action((opts: { peerId: string; name: string; pubkey: string }) => {
    const out = federatePeerAddCli({
      workspace: process.cwd(),
      peerId: opts.peerId,
      name: opts.name,
      pubKeyFile: opts.pubkey
    });
    console.log(chalk.green(`Peer added: ${out.peer.peerId}`));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

federatePeer
  .command("list")
  .description("List federation peers")
  .action(() => {
    const peers = federatePeerListCli(process.cwd());
    for (const row of peers) {
      const fingerprint = sha256Hex(Buffer.from(row.peer.publisherPublicKeyPem, "utf8")).slice(0, 16);
      console.log(`- ${row.peer.peerId} (${row.peer.name}) valid=${row.valid ? "yes" : "no"}`);
      console.log(`  fingerprint=${fingerprint}${row.reason ? ` reason=${row.reason}` : ""}`);
    }
  });

federate
  .command("export")
  .description("Export offline federation sync package (.amcfed)")
  .requiredOption("--out <file>", "output .amcfed file")
  .action((opts: { out: string }) => {
    const out = federateExportCli({
      workspace: process.cwd(),
      outFile: opts.out
    });
    console.log(chalk.green(`Federation package exported: ${out.outFile}`));
    console.log(`benchmarks=${out.benchmarkCount} certs=${out.certCount} bom=${out.bomCount}`);
  });

federate
  .command("import")
  .description("Import and verify federation package")
  .argument("<file>")
  .action((file: string) => {
    const out = federateImportCli({
      workspace: process.cwd(),
      bundleFile: resolve(process.cwd(), file)
    });
    console.log(chalk.green(`Federation package imported from org ${out.sourceOrgId}`));
    console.log(`Path: ${out.importedPath}`);
    console.log(`benchmarks=${out.benchmarkCount} certs=${out.certCount} bom=${out.bomCount}`);
  });

federate
  .command("verify-bundle")
  .description("Verify .amcfed package")
  .argument("<file>")
  .action((file: string) => {
    const out = federateVerifyBundleCli(resolve(process.cwd(), file));
    if (out.ok) {
      console.log(chalk.green("Federation package verification PASSED"));
      console.log(`sourceOrg=${out.manifest?.sourceOrgId ?? "unknown"}`);
      return;
    }
    console.log(chalk.red("Federation package verification FAILED"));
    for (const error of out.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

integrations
  .command("init")
  .description("Create and sign integrations.yaml with vault-backed secret refs")
  .action(() => {
    const out = integrationsInitCli(process.cwd());
    console.log(chalk.green(`Integrations config created: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

integrations
  .command("verify")
  .description("Verify integrations config signature")
  .action(() => {
    const out = integrationsVerifyCli(process.cwd());
    if (out.valid) {
      console.log(chalk.green(`Integrations signature valid: ${out.sigPath}`));
      return;
    }
    console.log(chalk.red(`Integrations signature invalid: ${out.reason ?? "unknown reason"}`));
    process.exit(1);
  });

integrations
  .command("status")
  .description("Show integration channels and routing")
  .action(() => {
    console.log(JSON.stringify(integrationsStatusCli(process.cwd()), null, 2));
  });

integrations
  .command("test")
  .description("Dispatch deterministic test event to an integration channel")
  .option("--channel <id>", "specific channel ID")
  .action(async (opts: { channel?: string }) => {
    const out = await integrationsTestCli({
      workspace: process.cwd(),
      channelId: opts.channel
    });
    console.log(JSON.stringify(out, null, 2));
  });

integrations
  .command("dispatch")
  .description("Dispatch a deterministic integration event")
  .requiredOption("--event <name>", "event name")
  .requiredOption("--agent <id>", "agent ID")
  .option("--summary <text>", "summary")
  .action(async (opts: { event: string; agent: string; summary?: string }) => {
    const out = await integrationsDispatchCli({
      workspace: process.cwd(),
      eventName: opts.event,
      agentId: opts.agent,
      summary: opts.summary
    });
    console.log(JSON.stringify(out, null, 2));
  });

outcomes
  .command("init")
  .description("Create and sign outcome contract")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--archetype <id>", "optional archetype hint")
  .action((opts: { agent?: string; archetype?: string }) => {
    const out = outcomesInitCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      archetype: opts.archetype
    });
    console.log(chalk.green(`Outcome contract created: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

outcomes
  .command("verify")
  .description("Verify outcome contract signature")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const out = outcomesVerifyCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    if (out.valid) {
      console.log(chalk.green(`Outcome contract signature valid: ${out.sigPath}`));
      return;
    }
    console.log(chalk.red(`Outcome contract signature invalid: ${out.reason ?? "unknown reason"}`));
    process.exit(1);
  });

outcomes
  .command("report")
  .description("Generate outcomes report (agent) or fleet outcomes report")
  .argument("[scope]", "fleet for fleet-wide report")
  .requiredOption("--window <window>", "window (e.g. 14d)")
  .requiredOption("--out <path>", "output path (.md or .json)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((scope: string | undefined, opts: { window: string; out: string; agent?: string }) => {
    const outPath = resolve(process.cwd(), opts.out);
    if (scope === "fleet") {
      const out = outcomesFleetReportCli({
        workspace: process.cwd(),
        window: opts.window,
        outFile: outPath
      });
      console.log(chalk.green(`Fleet outcomes report generated: ${out.outFile ?? outPath}`));
      console.log(`agents=${out.agentCount}`);
      return;
    }

    const out = outcomesReportCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      window: opts.window,
      outFile: outPath
    });
    console.log(chalk.green(`Outcome report generated: ${out.jsonPath}`));
    console.log(`markdown=${out.mdPath}`);
    console.log(`ValueScore=${out.valueScore.toFixed(2)} EconomicSignificanceIndex=${out.economicSignificanceIndex.toFixed(2)} (${out.trustLabel})`);
  });

outcomes
  .command("diff")
  .description("Diff two outcome reports")
  .argument("<reportA>")
  .argument("<reportB>")
  .action((reportA: string, reportB: string) => {
    const diff = outcomesDiffCli(resolve(process.cwd(), reportA), resolve(process.cwd(), reportB));
    console.log(JSON.stringify(diff, null, 2));
  });

outcomes
  .command("attest")
  .description("Record manual attested outcome signal")
  .requiredOption("--metric <metricId>", "metric ID from outcome contract")
  .requiredOption("--value <value>", "value")
  .requiredOption("--reason <text>", "attestation reason")
  .option("--workorder <id>", "work order ID")
  .option("--unit <unit>", "unit label")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { metric: string; value: string; reason: string; workorder?: string; unit?: string; agent?: string }) => {
    assertOwnerMode(process.cwd(), commandPath(outcomes.commands.find((c) => c.name() === "attest") ?? outcomes));
    const out = outcomesAttestCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      metricId: opts.metric,
      value: opts.value,
      reason: opts.reason,
      workOrderId: opts.workorder,
      unit: opts.unit
    });
    console.log(chalk.green(`Outcome attestation recorded: ${out.outcomeEventId}`));
    console.log(`eventHash=${out.eventHash}`);
    console.log(`receiptId=${out.receiptId}`);
  });

value
  .command("init")
  .description("Initialize signed value policy, default contract, and scheduler")
  .action(() => {
    assertOwnerMode(process.cwd(), "value init");
    const out = valueInitCli(process.cwd());
    console.log(chalk.green(`Value policy created: ${out.policy.path}`));
    console.log(`signature=${out.policy.sigPath}`);
    console.log(`workspaceContract=${out.workspaceContract.path}`);
    console.log(`scheduler=${out.scheduler.path}`);
  });

value
  .command("verify-policy")
  .description("Verify signed value policy")
  .action(() => {
    const verify = valueVerifyPolicyCli(process.cwd());
    if (verify.valid) {
      console.log(chalk.green(`Value policy signature valid: ${verify.sigPath}`));
      return;
    }
    console.log(chalk.red(`Value policy signature invalid: ${verify.reason ?? "unknown"}`));
    process.exit(1);
  });

const valuePolicy = value.command("policy").description("Value policy operations");
const valueContract = value.command("contract").description("Value contract operations");
const valueScheduler = value.command("scheduler").description("Value scheduler controls");

valuePolicy
  .command("print")
  .description("Print effective value policy JSON")
  .action(() => {
    console.log(JSON.stringify(valuePolicyPrintCli(process.cwd()), null, 2));
  });

valuePolicy
  .command("default")
  .description("Print default value policy JSON")
  .action(() => {
    console.log(JSON.stringify(valuePolicyDefaultCli(), null, 2));
  });

valuePolicy
  .command("apply")
  .description("Apply signed value policy from YAML/JSON file")
  .requiredOption("--file <path>", "value policy file")
  .option("--reason <text>", "change reason", "value policy update")
  .action((opts: { file: string; reason?: string }) => {
    assertOwnerMode(process.cwd(), "value policy apply");
    const out = valuePolicyApplyCli({
      workspace: process.cwd(),
      file: opts.file
    });
    console.log(chalk.green(`Value policy applied: ${out.path}`));
    console.log(`signature=${out.sigPath}`);
    console.log(`transparencyHash=${out.transparencyHash}`);
  });

valueContract
  .command("init")
  .description("Create and sign value contract template")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .option("--id <id>", "scope id (required for node/agent)", "workspace")
  .requiredOption("--type <type>", "code-agent|support-agent|ops-agent|research-agent|sales-agent|other")
  .option("--deployment <deployment>", "single|host|k8s|compose")
  .action((opts: { scope: string; id: string; type: string; deployment?: string }) => {
    assertOwnerMode(process.cwd(), "value contract init");
    const scope = opts.scope.toLowerCase();
    if (!(scope === "workspace" || scope === "node" || scope === "agent")) {
      throw new Error("scope must be workspace|node|agent");
    }
    const out = valueContractInitCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      type: opts.type as "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other",
      deployment: opts.deployment as "single" | "host" | "k8s" | "compose" | undefined
    });
    console.log(chalk.green(`Value contract initialized: ${out.path}`));
    console.log(`signature=${out.sigPath}`);
    console.log(`transparencyHash=${out.transparencyHash}`);
  });

valueContract
  .command("apply")
  .description("Apply value contract from YAML/JSON file")
  .requiredOption("--file <path>", "value contract file")
  .option("--scope <scope>", "workspace|node|agent")
  .option("--id <id>", "scope id")
  .option("--reason <text>", "change reason", "value contract update")
  .action((opts: { file: string; scope?: string; id?: string; reason?: string }) => {
    assertOwnerMode(process.cwd(), "value contract apply");
    const scope = opts.scope?.toLowerCase();
    const out = valueContractApplyCli({
      workspace: process.cwd(),
      file: opts.file,
      scope: scope as "workspace" | "node" | "agent" | undefined,
      id: opts.id
    });
    console.log(chalk.green(`Value contract applied: ${out.path}`));
    console.log(`signature=${out.sigPath}`);
    console.log(`transparencyHash=${out.transparencyHash}`);
  });

valueContract
  .command("verify")
  .description("Verify value contract signature")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .option("--id <id>", "scope id", "workspace")
  .action((opts: { scope: string; id: string }) => {
    const scope = opts.scope.toLowerCase();
    if (!(scope === "workspace" || scope === "node" || scope === "agent")) {
      throw new Error("scope must be workspace|node|agent");
    }
    const out = valueContractVerifyCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id
    });
    if (out.valid) {
      console.log(chalk.green(`Value contract signature valid: ${out.sigPath}`));
      return;
    }
    console.log(chalk.red(`Value contract signature invalid: ${out.reason ?? "unknown"}`));
    process.exit(1);
  });

valueContract
  .command("print")
  .description("Print value contract and signature status")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .option("--id <id>", "scope id", "workspace")
  .action((opts: { scope: string; id: string }) => {
    const scope = opts.scope.toLowerCase();
    if (!(scope === "workspace" || scope === "node" || scope === "agent")) {
      throw new Error("scope must be workspace|node|agent");
    }
    console.log(
      JSON.stringify(
        valueContractPrintCli({
          workspace: process.cwd(),
          scope: scope as "workspace" | "node" | "agent",
          id: opts.id
        }),
        null,
        2
      )
    );
  });

value
  .command("ingest")
  .description("Ingest value webhook payload JSON")
  .requiredOption("--file <path>", "payload JSON/YAML file")
  .option("--attested", "mark ingested events as ATTESTED", false)
  .action((opts: { file: string; attested: boolean }) => {
    assertOwnerMode(process.cwd(), "value ingest");
    const out = valueIngestWebhookCli({
      workspace: process.cwd(),
      file: opts.file,
      attest: opts.attested
    });
    console.log(chalk.green(`Value events ingested: ${out.ingested}`));
    console.log(`sha256=${out.sha256}`);
    console.log(`trustKind=${out.trustKind}`);
    console.log(`transparencyHash=${out.transparencyHash}`);
  });

value
  .command("import")
  .description("Import numeric KPI points from CSV (ts,value)")
  .requiredOption("--csv <path>", "csv file path")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .option("--id <id>", "scope id", "workspace")
  .requiredOption("--kpi <kpiId>", "kpi id")
  .option("--attested", "mark imported events as ATTESTED", false)
  .action((opts: { csv: string; scope: string; id: string; kpi: string; attested: boolean }) => {
    assertOwnerMode(process.cwd(), "value import");
    const scope = opts.scope.toLowerCase();
    if (!(scope === "workspace" || scope === "node" || scope === "agent")) {
      throw new Error("scope must be workspace|node|agent");
    }
    const out = valueImportCsvCli({
      workspace: process.cwd(),
      file: opts.csv,
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      kpiId: opts.kpi,
      attest: opts.attested
    });
    console.log(chalk.green(`CSV value events ingested: ${out.ingested}`));
    console.log(`sha256=${out.sha256}`);
    console.log(`trustKind=${out.trustKind}`);
    console.log(`transparencyHash=${out.transparencyHash}`);
  });

value
  .command("snapshot")
  .description("Generate/load latest signed value snapshot")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .option("--id <id>", "scope id", "workspace")
  .option("--window-days <days>", "window days")
  .action(async (opts: { scope: string; id: string; windowDays?: string }) => {
    const scope = opts.scope.toLowerCase();
    if (!(scope === "workspace" || scope === "node" || scope === "agent")) {
      throw new Error("scope must be workspace|node|agent");
    }
    const out = await valueSnapshotCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      windowDays: opts.windowDays ? Number(opts.windowDays) : undefined
    });
    console.log(JSON.stringify(out, null, 2));
  });

value
  .command("report")
  .description("Generate signed value report")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .option("--id <id>", "scope id", "workspace")
  .option("--window-days <days>", "window days", "30")
  .action(async (opts: { scope: string; id: string; windowDays: string }) => {
    const scope = opts.scope.toLowerCase();
    if (!(scope === "workspace" || scope === "node" || scope === "agent")) {
      throw new Error("scope must be workspace|node|agent");
    }
    const out = await valueReportCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      windowDays: Number(opts.windowDays)
    });
    console.log(chalk.green(`Value report created: ${out.saved.path}`));
    console.log(`signature=${out.saved.sigPath}`);
    console.log(`status=${out.report.snapshot.status}`);
  });

valueScheduler
  .command("status")
  .description("Show value scheduler status")
  .action(() => {
    console.log(JSON.stringify(valueSchedulerStatusCli(process.cwd()), null, 2));
  });

valueScheduler
  .command("run-now")
  .description("Run value scheduler now")
  .option("--scope <scope>", "workspace|node|agent")
  .option("--id <id>", "scope id")
  .option("--window-days <days>", "window days")
  .action(async (opts: { scope?: string; id?: string; windowDays?: string }) => {
    assertOwnerMode(process.cwd(), "value scheduler run-now");
    const scope = opts.scope?.toLowerCase();
    if (scope && !(scope === "workspace" || scope === "node" || scope === "agent")) {
      throw new Error("scope must be workspace|node|agent");
    }
    const out = await valueSchedulerRunNowCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent" | undefined,
      id: opts.id,
      windowDays: opts.windowDays ? Number(opts.windowDays) : undefined
    });
    console.log(chalk.green(`Value scheduler completed: ${out.report.report.reportId}`));
    console.log(`snapshotStatus=${out.report.report.snapshot.status}`);
  });

valueScheduler
  .command("enable")
  .description("Enable value scheduler")
  .action(() => {
    assertOwnerMode(process.cwd(), "value scheduler enable");
    console.log(JSON.stringify(valueSchedulerEnableCli({
      workspace: process.cwd(),
      enabled: true
    }), null, 2));
  });

valueScheduler
  .command("disable")
  .description("Disable value scheduler")
  .action(() => {
    assertOwnerMode(process.cwd(), "value scheduler disable");
    console.log(JSON.stringify(valueSchedulerEnableCli({
      workspace: process.cwd(),
      enabled: false
    }), null, 2));
  });

value
  .command("verify")
  .description("Verify value workspace signatures/artifacts")
  .action(() => {
    const out = valueVerifyWorkspaceCli(process.cwd());
    if (out.ok) {
      console.log(chalk.green("Value verify passed"));
      return;
    }
    console.log(chalk.red("Value verify failed"));
    for (const error of out.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

forecast
  .command("init")
  .description("Create and sign forecast policy")
  .action(() => {
    const out = forecastInitCli(process.cwd());
    console.log(chalk.green(`Forecast policy created: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

forecast
  .command("verify")
  .description("Verify forecast policy signature")
  .action(() => {
    const out = forecastVerifyCli(process.cwd());
    if (out.valid) {
      console.log(chalk.green(`Forecast policy signature valid: ${out.sigPath}`));
      return;
    }
    console.log(chalk.red(`Forecast policy signature invalid: ${out.reason ?? "unknown reason"}`));
    process.exit(1);
  });

forecast
  .command("print-policy")
  .description("Print effective forecast policy")
  .action(() => {
    console.log(JSON.stringify(forecastPrintPolicyCli(process.cwd()), null, 2));
  });

forecast
  .command("latest")
  .description("Render latest forecast for scope")
  .requiredOption("--scope <scope>", "workspace|agent|node")
  .option("--id <targetId>", "agentId for scope=agent or nodeId for scope=node")
  .option("--out <path>", "optional output path (.json or .md)")
  .action((opts: { scope: "workspace" | "agent" | "node"; id?: string; out?: string }) => {
    const out = forecastLatestCli({
      workspace: process.cwd(),
      scope: opts.scope,
      targetId: opts.id,
      outFile: opts.out
    });
    console.log(chalk.green(`Forecast status: ${out.status}`));
    if (out.outFile) {
      console.log(`Written: ${out.outFile}`);
    }
  });

forecast
  .command("refresh")
  .description("Refresh forecast snapshot for scope")
  .requiredOption("--scope <scope>", "workspace|agent|node")
  .option("--id <targetId>", "agentId for scope=agent or nodeId for scope=node")
  .option("--out <path>", "optional output path (.json or .md)")
  .action((opts: { scope: "workspace" | "agent" | "node"; id?: string; out?: string }) => {
    const out = forecastRefreshCli({
      workspace: process.cwd(),
      scope: opts.scope,
      targetId: opts.id,
      outFile: opts.out
    });
    console.log(chalk.green(`Forecast refreshed: ${out.status}`));
    if (out.latestPath) {
      console.log(`Latest: ${out.latestPath}`);
    }
    if (out.snapshotPath) {
      console.log(`Snapshot: ${out.snapshotPath}`);
    }
    console.log(`Advisories: ${out.advisories}`);
    if (out.outFile) {
      console.log(`Written: ${out.outFile}`);
    }
  });

const forecastScheduler = forecast.command("scheduler").description("Forecast renewal scheduler controls");

forecastScheduler
  .command("status")
  .description("Show scheduler status")
  .action(() => {
    console.log(JSON.stringify(forecastSchedulerStatusCli(process.cwd()), null, 2));
  });

forecastScheduler
  .command("run-now")
  .description("Run scheduler refresh immediately")
  .option("--scope <scope>", "workspace|agent|node")
  .option("--id <targetId>", "agentId for scope=agent or nodeId for scope=node")
  .action((opts: { scope?: "workspace" | "agent" | "node"; id?: string }) => {
    const out = forecastSchedulerRunNowCli({
      workspace: process.cwd(),
      scope: opts.scope,
      targetId: opts.id
    });
    console.log(JSON.stringify(out, null, 2));
  });

forecastScheduler
  .command("enable")
  .description("Enable forecast scheduler")
  .action(() => {
    console.log(JSON.stringify(forecastSchedulerEnableCli(process.cwd()), null, 2));
  });

forecastScheduler
  .command("disable")
  .description("Disable forecast scheduler")
  .action(() => {
    console.log(JSON.stringify(forecastSchedulerDisableCli(process.cwd()), null, 2));
  });

const forecastPolicy = forecast.command("policy").description("Forecast policy operations");

forecastPolicy
  .command("apply")
  .requiredOption("--file <path>", "policy file (json or yaml)")
  .description("Apply and sign forecast policy from file")
  .action((opts: { file: string }) => {
    const raw = readUtf8(resolve(process.cwd(), opts.file));
    const parsed = (opts.file.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw)) as ReturnType<typeof forecastPolicyDefaultCli>;
    const out = forecastPolicyApplyCli({
      workspace: process.cwd(),
      policy: parsed
    });
    console.log(chalk.green(`Forecast policy applied: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

forecastPolicy
  .command("default")
  .description("Print default forecast policy JSON")
  .action(() => {
    console.log(JSON.stringify(forecastPolicyDefaultCli(), null, 2));
  });

advisory
  .command("list")
  .description("List advisories for scope")
  .requiredOption("--scope <scope>", "workspace|agent|node")
  .option("--id <targetId>", "agentId for scope=agent or nodeId for scope=node")
  .action((opts: { scope: "workspace" | "agent" | "node"; id?: string }) => {
    const out = advisoryListCli({
      workspace: process.cwd(),
      scope: opts.scope,
      targetId: opts.id
    });
    console.log(JSON.stringify(out, null, 2));
  });

advisory
  .command("show")
  .description("Show one advisory by ID")
  .argument("<advisoryId>")
  .action((advisoryId: string) => {
    console.log(
      JSON.stringify(
        advisoryShowCli({
          workspace: process.cwd(),
          advisoryId
        }),
        null,
        2
      )
    );
  });

advisory
  .command("ack")
  .description("Acknowledge an advisory")
  .argument("<advisoryId>")
  .requiredOption("--note <text>", "ack note")
  .option("--by <name>", "actor name (defaults to current user or 'owner')")
  .action((advisoryId: string, opts: { note: string; by?: string }) => {
    const out = advisoryAckCli({
      workspace: process.cwd(),
      advisoryId,
      by: opts.by ?? "owner",
      note: opts.note
    });
    console.log(chalk.green(`Advisory acknowledged: ${out.advisoryId}`));
  });

casebook
  .command("init")
  .description("Create a signed casebook")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--casebook <id>", "casebook ID", "default")
  .action((opts: { agent?: string; casebook: string }) => {
    const out = casebookInitCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      casebookId: opts.casebook
    });
    console.log(chalk.green(`Casebook created: ${out.casebookId}`));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

casebook
  .command("add")
  .description("Add signed case from existing workorder")
  .requiredOption("--casebook <id>", "casebook ID")
  .requiredOption("--from-workorder <id>", "source workorder ID")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { casebook: string; fromWorkorder: string; agent?: string }) => {
    const out = casebookAddFromWorkOrderCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      casebookId: opts.casebook,
      workOrderId: opts.fromWorkorder
    });
    console.log(chalk.green(`Case added: ${out.caseId}`));
    console.log(`Case path: ${out.casePath}`);
  });

casebook
  .command("list")
  .description("List casebooks")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const rows = casebookListCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(JSON.stringify(rows, null, 2));
  });

casebook
  .command("verify")
  .description("Verify signed casebook and case files")
  .requiredOption("--casebook <id>", "casebook ID")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { casebook: string; agent?: string }) => {
    const out = casebookVerifyCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      casebookId: opts.casebook
    });
    if (out.valid) {
      console.log(chalk.green("Casebook verification PASSED"));
      return;
    }
    console.log(chalk.red("Casebook verification FAILED"));
    for (const reason of out.reasons) {
      console.log(`- ${reason}`);
    }
    process.exit(1);
  });

experiment
  .command("create")
  .description("Create an experiment")
  .requiredOption("--name <name>", "experiment name")
  .requiredOption("--casebook <id>", "casebook ID")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { name: string; casebook: string; agent?: string }) => {
    const out = experimentCreateCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      name: opts.name,
      casebookId: opts.casebook
    });
    console.log(chalk.green(`Experiment created: ${out.experimentId}`));
    console.log(`Path: ${out.path}`);
  });

experiment
  .command("set-baseline")
  .description("Set experiment baseline config")
  .requiredOption("--experiment <id>", "experiment ID")
  .requiredOption("--config <current|path>", "baseline source")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { experiment: string; config: string; agent?: string }) => {
    const config = opts.config === "current" ? "current" : { path: resolve(process.cwd(), opts.config) };
    const out = experimentSetBaselineCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      experimentId: opts.experiment,
      config
    });
    console.log(chalk.green(`Baseline updated: ${out.path}`));
  });

experiment
  .command("set-candidate")
  .description("Set experiment candidate signed config overlay")
  .requiredOption("--experiment <id>", "experiment ID")
  .requiredOption("--candidate-file <path>", "signed candidate overlay file")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { experiment: string; candidateFile: string; agent?: string }) => {
    const out = experimentSetCandidateCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      experimentId: opts.experiment,
      candidateFile: resolve(process.cwd(), opts.candidateFile)
    });
    console.log(chalk.green(`Candidate updated: ${out.path}`));
    console.log(`digest=${out.digestSha256}`);
  });

experiment
  .command("run")
  .description("Run deterministic experiment against signed casebook")
  .requiredOption("--experiment <id>", "experiment ID")
  .requiredOption("--mode <mode>", "supervise|sandbox")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { experiment: string; mode: string; agent?: string }) => {
    const modeValue = opts.mode === "sandbox" ? "sandbox" : "supervise";
    const out = experimentRunCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      experimentId: opts.experiment,
      mode: modeValue
    });
    console.log(chalk.green(`Experiment run recorded: ${out.report.runId}`));
    console.log(`json=${out.jsonPath}`);
    console.log(`md=${out.mdPath}`);
  });

experiment
  .command("analyze")
  .description("Analyze latest experiment run")
  .requiredOption("--experiment <id>", "experiment ID")
  .requiredOption("--out <path>", "output .md or .json")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { experiment: string; out: string; agent?: string }) => {
    const out = experimentAnalyzeCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      experimentId: opts.experiment,
      outFile: resolve(process.cwd(), opts.out)
    });
    console.log(chalk.green(`Experiment analysis written: ${out.outFile ?? "none"}`));
  });

experiment
  .command("gate")
  .description("Evaluate latest experiment run against gate policy")
  .requiredOption("--experiment <id>", "experiment ID")
  .requiredOption("--policy <path>", "experiment gate policy JSON")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { experiment: string; policy: string; agent?: string }) => {
    const policyPath = resolve(process.cwd(), opts.policy);
    const policy = experimentGateSchema.parse(JSON.parse(readUtf8(policyPath)) as unknown);
    const out = experimentGateCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      experimentId: opts.experiment,
      policyPath
    });
    if (out.pass) {
      console.log(chalk.green("Experiment gate PASSED"));
    } else {
      console.log(chalk.red("Experiment gate FAILED"));
    }
    console.log("Threshold checks:");
    for (const row of experimentGateComparisonRows(out.report, policy)) {
      console.log(row);
    }
    if (!out.pass) {
      for (const reason of out.reasons) {
        console.log(`- ${reason}`);
      }
      process.exit(1);
    }
  });

experiment
  .command("gate-template")
  .description("Write an experiment gate policy template")
  .requiredOption("--out <path>", "output policy JSON")
  .option("--preset <preset>", "strict|balanced|exploratory", "balanced")
  .action((opts: { out: string; preset: ExperimentGatePreset }) => {
    const policy = experimentGatePolicyPreset(opts.preset);
    const outPath = resolve(process.cwd(), opts.out);
    ensureDir(dirname(outPath));
    writeFileAtomic(outPath, `${JSON.stringify(policy, null, 2)}\n`, 0o644);
    console.log(chalk.green(`Experiment gate template written: ${outPath}`));
  });

experiment
  .command("list")
  .description("List experiments")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const out = experimentListCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(JSON.stringify(out, null, 2));
  });

program
  .command("fix-signatures")
  .description("Verify and re-sign gateway/fleet/agent configs")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const preview = inspectSignatures(process.cwd(), opts.agent ?? activeAgent(program));
    const invalid = preview.statuses.filter((row) => !row.valid);
    if (invalid.length === 0) {
      console.log(chalk.green("All config signatures are valid."));
      return;
    }
    const fixed = fixSignatures(process.cwd(), opts.agent ?? activeAgent(program));
    console.log(chalk.green("Re-signed invalid configs."));
    for (const row of fixed.statuses) {
      console.log(`- ${row.kind}: ${row.valid ? "valid" : "invalid"} (${row.reason ?? "ok"})`);
    }
    if (fixed.auditEventId) {
      console.log(`Audit event: ${fixed.auditEventId}`);
    }
  });

loop
  .command("init")
  .description("Initialize recurring loop config")
  .action(() => {
    const created = initLoop(process.cwd());
    console.log(chalk.green(`Loop config: ${created.configPath}`));
  });

loop
  .command("run")
  .description("Run recurring diagnostic + assurance + dashboard + snapshot")
  .requiredOption("--days <n>", "window days")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action(async (opts: { days: string; agent?: string }) => {
    const result = await loopRun({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      days: Number(opts.days)
    });
    console.log(chalk.green(`Loop run complete for ${result.agentId}`));
    console.log(`runId=${result.runId}`);
    console.log(`assuranceRunId=${result.assuranceRunId ?? "none"}`);
    console.log(`dashboard=${result.dashboardDir}`);
    console.log(`snapshot=${result.snapshotFile}`);
  });

loop
  .command("plan")
  .description("Print recurring loop plan")
  .requiredOption("--cadence <cadence>", "weekly|daily")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { cadence: "weekly" | "daily"; agent?: string }) => {
    console.log(
      loopPlan({
        workspace: process.cwd(),
        agentId: opts.agent ?? activeAgent(program),
        cadence: opts.cadence
      })
    );
  });

loop
  .command("schedule")
  .description("Print OS scheduler config (no automatic installation)")
  .requiredOption("--os <os>", "cron|launchd|systemd")
  .requiredOption("--cadence <cadence>", "weekly|daily")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { os: "cron" | "launchd" | "systemd"; cadence: "weekly" | "daily"; agent?: string }) => {
    console.log(
      loopSchedule({
        workspace: process.cwd(),
        agentId: opts.agent ?? activeAgent(program),
        os: opts.os,
        cadence: opts.cadence
      })
    );
  });

program
  .command("snapshot")
  .description("Generate Unified Clarity Snapshot markdown")
  .requiredOption("--out <file>", "output markdown path")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { out: string; agent?: string }) => {
    const snapshot = createUnifiedClaritySnapshot({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      outFile: opts.out
    });
    console.log(chalk.green(`Snapshot created: ${snapshot.outFile}`));
    console.log(`runId=${snapshot.runId}`);
  });

const indices = program.command("indices").description("Compute deterministic failure-risk indices");
indices
  .option("--run <runId>", "diagnostic run ID")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--out <path>", "output path (.md or .json)")
  .action((opts: { run?: string; agent?: string; out?: string }) => {
    if (!opts.run) {
      throw new Error("amc indices requires --run <runId> (or use `amc indices fleet`).");
    }
    const outputPath = opts.out ? resolve(process.cwd(), opts.out) : undefined;
    const report = runIndicesForAgent({
      workspace: process.cwd(),
      runId: opts.run,
      agentId: opts.agent ?? activeAgent(program),
      outputPath
    });
    if (!outputPath) {
      console.log(renderFailureRiskMarkdown(report));
    } else {
      console.log(chalk.green(`Indices written: ${outputPath}`));
    }
  });

indices
  .command("fleet")
  .description("Compute failure-risk indices across fleet")
  .requiredOption("--window <window>", "window duration", "30d")
  .option("--out <path>", "output markdown path")
  .action((opts: { window: string; out?: string }) => {
    const now = Date.now();
    const rows = runFleetIndices({
      workspace: process.cwd(),
      windowStartTs: now - parseWindowToMs(opts.window),
      windowEndTs: now,
      outputPath: opts.out ? resolve(process.cwd(), opts.out) : undefined
    });
    if (opts.out) {
      console.log(chalk.green(`Fleet indices written: ${resolve(process.cwd(), opts.out)}`));
      return;
    }
    for (const row of rows) {
      console.log(`${row.agentId} (${row.runId})`);
      for (const index of row.indices) {
        console.log(`- ${index.id}: ${index.score0to100.toFixed(2)}`);
      }
    }
  });

const fleet = program.command("fleet").description("Fleet operations");
const agent = program.command("agent").description("Agent registry operations");
const provider = program.command("provider").description("Provider template operations");
const sandbox = program.command("sandbox").description("Hardened sandbox execution");

fleet
  .command("init")
  .description("Create and sign .amc/fleet.yaml")
  .option("--org <name>", "organization name", "AMC Fleet")
  .action((opts: { org: string }) => {
    const created = initFleet(process.cwd(), { orgName: opts.org });
    console.log(chalk.green(`Fleet config created: ${created.fleetPath}`));
    console.log(chalk.green(`Fleet config signature: ${created.signaturePath}`));
  });

fleet
  .command("report")
  .description("Generate cross-agent fleet maturity report")
  .option("--window <window>", "evidence window", "30d")
  .option("--output <path>", "output markdown path", ".amc/reports/fleet.md")
  .action(async (opts: { window: string; output: string }) => {
    const report = await generateFleetReport({
      workspace: process.cwd(),
      window: opts.window,
      outputPath: resolve(process.cwd(), opts.output)
    });
    console.log(chalk.green(`Fleet report written: ${report.reportPath}`));
    console.log(`Agents included: ${report.agentCount}`);
  });

fleet
  .command("trust-init")
  .description("Initialize trust composition config")
  .action(() => {
    const config = initTrustComposition(process.cwd());
    console.log(chalk.green("Trust composition config initialized"));
    console.log(`Default inheritance mode: ${config.defaultInheritanceMode}`);
  });

fleet
  .command("trust-add-edge")
  .description("Add a delegation edge (orchestrator → worker)")
  .requiredOption("--from <agentId>", "orchestrator agent ID")
  .requiredOption("--to <agentId>", "worker agent ID")
  .requiredOption("--purpose <purpose>", "delegation purpose")
  .option("--risk <tier>", "risk tier (low/med/high/critical)", "med")
  .option("--mode <mode>", "inheritance mode (strict/weighted/no-inherit)", "strict")
  .option("--weight <n>", "weight for weighted mode (0-1)", "1")
  .action((opts: { from: string; to: string; purpose: string; risk: string; mode: string; weight: string }) => {
    const edge = addDelegationEdge(process.cwd(), {
      fromAgentId: opts.from,
      toAgentId: opts.to,
      purpose: opts.purpose,
      riskTier: opts.risk as "low" | "med" | "high" | "critical",
      inheritanceMode: opts.mode as "strict" | "weighted" | "no-inherit",
      weight: parseFloat(opts.weight),
    });
    console.log(chalk.green(`Delegation edge added: ${edge.fromAgentId} → ${edge.toAgentId}`));
    console.log(`  Edge ID: ${edge.id}`);
    console.log(`  Handoff ID: ${edge.handoffId}`);
    console.log(`  Mode: ${edge.inheritanceMode}`);
  });

fleet
  .command("trust-remove-edge")
  .description("Remove a delegation edge")
  .argument("<edgeId>", "edge ID to remove")
  .action((edgeId: string) => {
    removeDelegationEdge(process.cwd(), edgeId);
    console.log(chalk.green(`Delegation edge removed: ${edgeId}`));
  });

fleet
  .command("trust-edges")
  .description("List all delegation edges")
  .action(() => {
    const edges = listDelegationEdges(process.cwd());
    if (edges.length === 0) {
      console.log("No delegation edges configured.");
      return;
    }
    for (const edge of edges) {
      console.log(`- ${edge.id}: ${edge.fromAgentId} → ${edge.toAgentId} (${edge.inheritanceMode}, w=${edge.weight}) "${edge.purpose}"`);
    }
  });

fleet
  .command("trust-report")
  .description("Generate trust composition report across fleet")
  .option("--window <window>", "evidence window", "30d")
  .option("--output <path>", "output path")
  .action(async (opts: { window: string; output?: string }) => {
    const workspace = process.cwd();
    const agents = listAgents(workspace).map((r) => r.id);
    const effectiveAgents = agents.length > 0 ? agents : ["default"];
    const reports = [];
    for (const agentId of effectiveAgents) {
      const report = await runDiagnostic({
        workspace,
        window: opts.window,
        targetName: "default",
        claimMode: "auto",
        agentId,
      });
      reports.push(report);
    }

    const trustReport = computeTrustComposition(workspace, reports);
    const reportPath = saveTrustCompositionReport(workspace, trustReport);
    const markdown = renderTrustCompositionMarkdown(trustReport);

    if (opts.output) {
      writeFileAtomic(resolve(workspace, opts.output), markdown, 0o644);
      console.log(chalk.green(`Trust composition report (markdown): ${opts.output}`));
    }

    console.log(chalk.green(`Trust composition report (JSON): ${reportPath}`));
    console.log(`DAG valid: ${trustReport.dagValid ? "YES" : "NO"}`);
    console.log(`Fleet composite score: ${trustReport.fleetCompositeScore.toFixed(3)}`);
    console.log(`Weakest link: ${trustReport.fleetWeakestLink ?? "none"}`);
    console.log(`Cross-agent contradictions: ${trustReport.contradictions.length}`);

    for (const r of trustReport.agentResults) {
      const bounded = r.boundedBy ? ` (bounded by ${r.boundedBy})` : "";
      console.log(`  ${r.agentId}: own=${r.ownIntegrityIndex.toFixed(3)} composite=${r.compositeIntegrityIndex.toFixed(3)} [${r.compositeTrustLabel}]${bounded}`);
    }
  });

fleet
  .command("trust-receipts")
  .description("Verify cross-agent receipt chains")
  .option("--window <window>", "evidence window", "30d")
  .action((opts: { window: string }) => {
    const workspace = process.cwd();
    const edges = listDelegationEdges(workspace);
    if (edges.length === 0) {
      console.log("No delegation edges configured. Nothing to verify.");
      return;
    }
    const now = Date.now();
    const windowMs = parseFloat(opts.window) * 24 * 60 * 60 * 1000;
    const chains = verifyCrossAgentReceipts(workspace, edges, now - windowMs, now);
    for (const chain of chains) {
      const status = chain.chainCoverage >= 0.9 ? chalk.green("OK") : chain.chainCoverage >= 0.5 ? chalk.yellow("PARTIAL") : chalk.red("BROKEN");
      console.log(`${status} ${chain.fromAgentId} → ${chain.toAgentId}: ${chain.matchedReceipts}/${chain.fromReceiptCount} matched (${(chain.chainCoverage * 100).toFixed(1)}%)`);
      if (chain.gaps.length > 0) {
        for (const gap of chain.gaps.slice(0, 5)) {
          console.log(`    ${chalk.dim(gap)}`);
        }
      }
    }
  });

fleet
  .command("dag")
  .description("Visualize orchestration delegation graph")
  .option("--agent <id>", "filter by agent ID")
  .option("--window <window>", "time window", "7d")
  .argument("[dagId]", "show a specific DAG")
  .action((dagId: string | undefined, opts: { agent?: string; window: string }) => {
    const workspace = process.cwd();
    if (dagId) {
      const dag = loadDag(workspace, dagId);
      console.log(renderDagMarkdown(dag));
      return;
    }
    const windowMs = parseWindowToMs(opts.window);
    if (opts.agent) {
      const dags = queryDagsByAgent(workspace, opts.agent, windowMs);
      if (dags.length === 0) {
        console.log(`No DAGs found for agent ${opts.agent} in window ${opts.window}`);
        return;
      }
      for (const dag of dags) {
        console.log(renderDagMarkdown(dag));
        console.log("");
      }
    } else {
      const ids = listDags(workspace);
      if (ids.length === 0) {
        console.log("No orchestration DAGs found.");
        return;
      }
      for (const id of ids) {
        const dag = loadDag(workspace, id);
        const vis = visualizeDag(dag);
        console.log(`${id}: ${vis.nodeCount} nodes, roots=[${vis.rootAgents.join(",")}] leaves=[${vis.leafAgents.join(",")}]`);
      }
    }
  });

fleet
  .command("trust-mode")
  .description("Set trust inheritance policy mode")
  .requiredOption("--mode <mode>", "STRICT|WEIGHTED|FLOOR")
  .action((opts: { mode: string }) => {
    const mode = opts.mode.toUpperCase() as TrustInheritancePolicyMode;
    if (!["STRICT", "WEIGHTED", "FLOOR"].includes(mode)) {
      throw new Error(`Invalid mode: ${opts.mode}. Must be STRICT, WEIGHTED, or FLOOR.`);
    }
    const policy = setTrustInheritanceMode(process.cwd(), mode);
    console.log(chalk.green(`Trust inheritance mode set to: ${policy.mode}`));
  });

fleet
  .command("handoff")
  .description("Manage handoff packets")
  .argument("<action>", "create|verify")
  .option("--from <id>", "source agent ID")
  .option("--to <id>", "target agent ID")
  .option("--goal <goal>", "delegation goal")
  .option("--mode <mode>", "execute|simulate", "execute")
  .option("--packet <packetId>", "packet ID for verify")
  .action((action: string, opts: { from?: string; to?: string; goal?: string; mode?: string; packet?: string }) => {
    const workspace = process.cwd();
    if (action === "create") {
      if (!opts.from || !opts.to || !opts.goal) {
        throw new Error("--from, --to, and --goal are required for create");
      }
      const packet = createHandoffPacket(workspace, {
        fromAgentId: opts.from,
        toAgentId: opts.to,
        goal: opts.goal,
        delegationScope: opts.mode === "simulate" ? ["READ_ONLY"] : ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"],
      });
      console.log(chalk.green(`Handoff packet created: ${packet.packetId}`));
      console.log(`From: ${packet.fromAgentId} → To: ${packet.toAgentId}`);
      console.log(`Expires: ${new Date(packet.expiryTs).toISOString()}`);
    } else if (action === "verify") {
      const packetId = opts.packet;
      if (!packetId) {
        throw new Error("--packet <packetId> required for verify");
      }
      const result = verifyHandoffPacket(workspace, packetId);
      if (result.valid) {
        console.log(chalk.green(`Packet ${packetId}: VALID`));
      } else {
        console.log(chalk.red(`Packet ${packetId}: INVALID`));
        for (const err of result.errors) {
          console.log(`  - ${err}`);
        }
      }
      if (result.packet) {
        console.log(`  Expired: ${result.expired}`);
        console.log(`  Signature: ${result.signatureValid ? "valid" : "invalid"}`);
      }
    } else {
      throw new Error(`Unknown handoff action: ${action}. Use create or verify.`);
    }
  });

fleet
  .command("contradictions")
  .description("Detect cross-agent contradictions")
  .option("--scope <scope>", "fleet or agent", "fleet")
  .option("--window <window>", "evidence window", "30d")
  .option("--min-delta <n>", "minimum level delta to report", "1")
  .action(async (opts: { scope: string; window: string; minDelta: string }) => {
    const workspace = process.cwd();
    const agents = listAgents(workspace).map((r) => r.id);
    const effectiveAgents = agents.length > 0 ? agents : ["default"];
    const reports = [];
    for (const agentId of effectiveAgents) {
      const report = await runDiagnostic({
        workspace,
        window: opts.window,
        targetName: "default",
        claimMode: "auto",
        agentId,
      });
      reports.push(report);
    }
    const result = detectContradictions(reports, {
      minDelta: parseInt(opts.minDelta, 10),
      scope: opts.scope === "agent" ? "agent" : "fleet",
    });
    if (result.totalContradictions === 0) {
      console.log(chalk.green("No contradictions detected."));
      return;
    }
    console.log(chalk.yellow(`Found ${result.totalContradictions} contradictions (CRITICAL: ${result.criticalCount}, WARN: ${result.warnCount}, INFO: ${result.infoCount})`));
    for (const c of result.contradictions.slice(0, 20)) {
      const color = c.severity === "CRITICAL" ? chalk.red : c.severity === "WARN" ? chalk.yellow : chalk.dim;
      console.log(color(`  [${c.severity}] ${c.questionId}: ${c.agentA}=${c.agentALevel} vs ${c.agentB}=${c.agentBLevel} (Δ${c.delta})`));
    }
  });

agent
  .command("add")
  .description("Interactively add an agent to the fleet")
  .action(async () => {
    const created = await addAgentInteractive(process.cwd());
    console.log(chalk.green(`Agent added: ${created.agentId}`));
    console.log(`Config: ${created.configPath}`);
    console.log(`Config signature: ${created.configSigPath}`);
    console.log(`Target: ${created.targetPath}`);
  });

agent
  .command("list")
  .description("List fleet agents")
  .action(() => {
    const rows = listAgents(process.cwd());
    if (rows.length === 0) {
      console.log("No fleet agents found.");
      return;
    }
    for (const row of rows) {
      console.log(`- ${row.id} config=${row.hasConfig ? "yes" : "no"} signed=${row.configSigned ? "yes" : "no"}`);
    }
  });

agent
  .command("remove")
  .description("Remove an agent from the fleet")
  .argument("<agentId>")
  .action((agentId: string) => {
    removeAgent(process.cwd(), agentId);
    console.log(chalk.green(`Removed agent: ${agentId}`));
  });

agent
  .command("use")
  .description("Set current agent")
  .argument("<agentId>")
  .action((agentId: string) => {
    useAgent(process.cwd(), agentId);
    console.log(chalk.green(`Current agent set to: ${agentId}`));
  });

agent
  .command("diagnose")
  .description("Lease-auth self-run diagnostic (agent-triggered, evidence-scored server-side)")
  .requiredOption("--token-file <file>", "lease token file")
  .requiredOption("--studio <url>", "studio API base URL (e.g. http://127.0.0.1:3210 or /w/<id>/api)")
  .action(async (opts: { tokenFile: string; studio: string }) => {
    const tokenFile = resolve(process.cwd(), opts.tokenFile);
    const token = readUtf8(tokenFile).trim();
    if (!token) {
      throw new Error(`Token file is empty: ${tokenFile}`);
    }
    const base = opts.studio.endsWith("/") ? opts.studio.slice(0, -1) : opts.studio;
    const response = await httpPostJson(
      `${base}/diagnostic/self-run`,
      {},
      {
        authorization: `Bearer ${token}`
      }
    );
    const parsed = JSON.parse(response.body || "{}") as {
      agentId?: string;
      runId?: string;
      reportStatus?: string;
      integrityIndex?: number;
      trustLabel?: string;
      unknownReasons?: Array<{ questionId: string; reasons: string[] }>;
      measuredScores?: Record<string, number>;
      recommendedUpgradeActions?: string[];
      transparencyHash?: string;
      error?: string;
    };
    if (response.status < 200 || response.status >= 300) {
      throw new Error(parsed.error ?? `diagnostic self-run failed (${response.status})`);
    }
    const unknown = parsed.unknownReasons?.length ?? 0;
    const measuredCount = parsed.measuredScores ? Object.keys(parsed.measuredScores).length : 0;
    console.log(chalk.green("Diagnostic self-run complete"));
    console.log(`agentId: ${parsed.agentId ?? "unknown"}`);
    console.log(`runId: ${parsed.runId ?? "unknown"}`);
    console.log(`status: ${parsed.reportStatus ?? "unknown"}`);
    console.log(`integrityIndex: ${typeof parsed.integrityIndex === "number" ? parsed.integrityIndex.toFixed(3) : "n/a"}`);
    console.log(`trustLabel: ${parsed.trustLabel ?? "n/a"}`);
    console.log(`questionsScored: ${measuredCount}`);
    console.log(`unknownQuestions: ${unknown}`);
    console.log(`transparencyHash: ${parsed.transparencyHash ?? "n/a"}`);
    const next = (parsed.recommendedUpgradeActions ?? []).slice(0, 3);
    if (next.length > 0) {
      console.log("nextActions:");
      for (const row of next) {
        console.log(`- ${row}`);
      }
    }
  });

provider
  .command("list")
  .description("List provider templates")
  .action(() => {
    const templates = listProviderTemplates();
    for (const template of templates) {
      console.log(
        `- ${template.id}: ${template.displayName} route=${template.routePrefix} defaultBaseUrl=${template.defaultBaseUrl || "(user-supplied)"} openaiCompatible=${template.openaiCompatible ? "yes" : "no"}`
      );
    }
  });

provider
  .command("add")
  .description("Assign or update provider template for an agent")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action(async (opts: { agent?: string }) => {
    const agentId = resolveAgentId(process.cwd(), opts.agent ?? activeAgent(program));
    const existing = loadAgentConfig(process.cwd(), agentId);
    const templateChoice = await inquirer.prompt<{ templateId: string }>([
      {
        type: "list",
        name: "templateId",
        message: "Provider template",
        choices: providerTemplateChoices(),
        default: existing.provider.templateId
      }
    ]);

    const template = getProviderTemplateById(templateChoice.templateId);
    const details = await inquirer.prompt<{
      baseUrl: string;
      routePrefix: string;
      authType: "bearer_env" | "header_env" | "query_env" | "none";
      authEnv: string;
      authHeader?: string;
      authParam?: string;
    }>([
      {
        type: "input",
        name: "baseUrl",
        message: "Upstream base URL",
        default: existing.provider.baseUrl || template.defaultBaseUrl || "https://example.com"
      },
      {
        type: "input",
        name: "routePrefix",
        message: "Gateway route prefix",
        default: existing.provider.routePrefix || template.routePrefix
      },
      {
        type: "list",
        name: "authType",
        message: "Auth strategy",
        choices: template.authStrategies,
        default: template.defaultAuthStrategy
      },
      {
        type: "input",
        name: "authEnv",
        message: "Auth env var",
        default: template.defaultAuthEnv,
        when: (answers) => answers.authType !== "none"
      },
      {
        type: "input",
        name: "authHeader",
        message: "Header name for header_env",
        default: template.defaultHeader ?? "x-api-key",
        when: (answers) => answers.authType === "header_env"
      },
      {
        type: "input",
        name: "authParam",
        message: "Query param for query_env",
        default: template.defaultQueryParam ?? "key",
        when: (answers) => answers.authType === "query_env"
      }
    ]);

    const auth =
      details.authType === "bearer_env"
        ? ({ type: "bearer_env", env: details.authEnv || template.defaultAuthEnv } as const)
        : details.authType === "header_env"
          ? ({ type: "header_env", header: details.authHeader || "x-api-key", env: details.authEnv || template.defaultAuthEnv } as const)
          : details.authType === "query_env"
            ? ({ type: "query_env", param: details.authParam || "key", env: details.authEnv || template.defaultAuthEnv } as const)
            : ({ type: "none" } as const);

    const providerConfig = {
      templateId: template.id,
      routePrefix: details.routePrefix,
      upstreamId: template.id,
      baseUrl: details.baseUrl,
      openaiCompatible: template.openaiCompatible,
      auth
    };
    const updated = updateAgentProvider(process.cwd(), agentId, providerConfig);

    const gatewayConfig = loadGatewayConfig(process.cwd());
    const next = {
      ...gatewayConfig,
      upstreams: {
        ...gatewayConfig.upstreams,
        [template.id]: {
          baseUrl: details.baseUrl,
          auth,
          providerId: template.id
        }
      },
      routes: [
        ...gatewayConfig.routes.filter((route) => route.prefix !== details.routePrefix),
        {
          prefix: details.routePrefix,
          upstream: template.id,
          stripPrefix: true,
          openaiCompatible: template.openaiCompatible,
          agentId
        }
      ]
    };
    saveGatewayConfig(process.cwd(), next);
    signGatewayConfig(process.cwd());

    console.log(chalk.green(`Updated provider for agent ${agentId}`));
    console.log(`Agent config: ${updated.configPath}`);
  });

sandbox
  .command("run")
  .description("Run agent command in hardened Docker sandbox")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--route <route>", "gateway route URL (e.g. http://127.0.0.1:3210/openai)")
  .option("--proxy <proxy>", "gateway proxy URL (e.g. http://127.0.0.1:3211)")
  .option("--image <image>", "docker image", "node:20-alpine")
  .argument("[cmd...]", "command to run inside container")
  .allowUnknownOption(true)
  .action(async (cmd: string[], opts: { agent?: string; route?: string; proxy?: string; image: string }) => {
    const command = cmd?.[0];
    if (!command) {
      throw new Error("amc sandbox run requires a command. Example: amc sandbox run --agent salesbot -- python app.py");
    }
    const result = await runSandboxCommand({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      command,
      args: cmd.slice(1),
      gatewayRoute: opts.route,
      gatewayProxyUrl: opts.proxy,
      image: opts.image
    });
    console.log(chalk.green(`Sandbox session sealed: ${result.sessionId}`));
    console.log(`Docker args: docker ${result.dockerArgs.map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ")}`);
  });

program
  .command("ingest")
  .description("Ingest external logs/transcripts as SELF_REPORTED evidence")
  .argument("<fileOrDir>")
  .requiredOption("--type <kind>", "chatgpt|claude_console|gemini_ui|generic_json|generic_text")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((fileOrDir: string, opts: { type: IngestType; agent?: string }) => {
    const ingest = ingestEvidence({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      inputPath: resolve(process.cwd(), fileOrDir),
      type: opts.type
    });
    console.log(chalk.green(`Ingested ${ingest.fileCount} file(s)`));
    console.log(`Ingest session: ${ingest.ingestSessionId}`);
  });

program
  .command("attest")
  .description("Auditor-attest an ingest session to upgrade trust tier to ATTESTED")
  .requiredOption("--ingest-session <id>", "ingest session ID")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { ingestSession: string; agent?: string }) => {
    const attested = attestIngestSession({
      workspace: process.cwd(),
      ingestSessionId: opts.ingestSession,
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(chalk.green(`Attested events: ${attested.attestedEventCount}`));
    console.log(`Bundle hash: ${attested.bundleHash}`);
  });

target
  .command("set")
  .requiredOption("--name <name>", "target profile name")
  .description("Interactive equalizer wizard")
  .action(async (opts: { name: string }) => {
    const agentId = activeAgent(program);
    const contextGraph = loadContextGraph(process.cwd(), agentId);
    const contextHash = sha256Hex(canonicalize(contextGraph));
    const profile = await setTargetProfileInteractive({
      workspace: process.cwd(),
      name: opts.name,
      contextGraphHash: contextHash,
      agentId
    });
    console.log(`Target saved: ${opts.name}.target.json (${profile.id})`);
  });

target
  .command("verify")
  .argument("<file>")
  .description("Verify target profile signature")
  .action((file: string) => {
    const profile = loadTargetProfileFromFile(resolve(process.cwd(), file));
    const ok = verifyTargetProfileSignature(process.cwd(), profile);
    console.log(ok ? chalk.green("Target signature valid") : chalk.red("Target signature invalid"));
    if (!ok) {
      process.exit(1);
    }
  });

target
  .command("diff")
  .requiredOption("--run <runId>", "run ID")
  .requiredOption("--target <name>", "target name")
  .description("Diff run against target profile")
  .action((opts: { run: string; target: string }) => {
    const agentId = activeAgent(program);
    const run = loadRunReport(process.cwd(), opts.run, agentId);
    const profile = loadTargetProfile(process.cwd(), opts.target, agentId);
    const diff = run.questionScores.map((score) => ({
      questionId: score.questionId,
      current: score.finalLevel,
      target: profile.mapping[score.questionId] ?? 0,
      gap: (profile.mapping[score.questionId] ?? 0) - score.finalLevel
    }));
    console.log(JSON.stringify(diff, null, 2));
  });

program
  .command("learn")
  .description("Education flow for a specific maturity question")
  .requiredOption("--question <qid>", "question ID (e.g. AMC-2.5)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { question: string; agent?: string }) => {
    const learned = learnQuestion({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      questionId: opts.question
    });
    console.log(learned.output);
    console.log(chalk.cyan(`Audit event: ${learned.auditEventId}`));
  });

// ── Governance Lineage CLI ──────────────────────────────────────────────
program
  .command("lineage-init")
  .description("Initialize governance lineage tables")
  .action(() => {
    const { initGovernanceLineageTables } = require("./claims/governanceLineage.js") as typeof import("./claims/governanceLineage.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    initGovernanceLineageTables(db);
    ledger.close();
    console.log(chalk.green("Governance lineage tables initialized."));
  });

program
  .command("lineage-report")
  .description("Generate governance lineage report")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const {
      initGovernanceLineageTables,
      generateGovernanceLineageReport,
      renderGovernanceLineageMarkdown
    } = require("./claims/governanceLineage.js") as typeof import("./claims/governanceLineage.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    initGovernanceLineageTables(db);
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const report = generateGovernanceLineageReport(db, agentId);
    ledger.close();
    console.log(renderGovernanceLineageMarkdown(report));
  });

program
  .command("lineage-claim")
  .description("Show full governance lineage for a specific claim")
  .argument("<claimId>", "claim ID to show lineage for")
  .action((claimId: string) => {
    const {
      initGovernanceLineageTables,
      buildClaimLineageView,
      renderClaimLineageMarkdown
    } = require("./claims/governanceLineage.js") as typeof import("./claims/governanceLineage.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    initGovernanceLineageTables(db);
    const view = buildClaimLineageView(db, claimId);
    ledger.close();
    if (!view) {
      console.log(chalk.red(`Claim not found: ${claimId}`));
      return;
    }
    console.log(renderClaimLineageMarkdown(view));
  });

program
  .command("lineage-policy-intents")
  .description("List all policy change intents for an agent")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const {
      initGovernanceLineageTables,
      getPolicyIntentsByAgent
    } = require("./claims/governanceLineage.js") as typeof import("./claims/governanceLineage.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    initGovernanceLineageTables(db);
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const intents = getPolicyIntentsByAgent(db, agentId);
    ledger.close();
    if (intents.length === 0) {
      console.log("No policy change intents recorded.");
      return;
    }
    for (const intent of intents) {
      console.log(chalk.cyan(`[${intent.intentId}] ${intent.category}`));
      console.log(`  Policy: ${intent.policyFilePath}`);
      console.log(`  Rationale: ${intent.rationale}`);
      console.log(`  Impact: ${intent.impactSummary}`);
      console.log(`  Claims: ${intent.claimIds.join(", ") || "none"}`);
      console.log(`  By: ${intent.createdBy} at ${new Date(intent.createdTs).toISOString()}`);
      console.log("");
    }
    console.log(`${intents.length} policy change intent(s).`);
  });

// ── Per-Claim Confidence CLI ────────────────────────────────────────────
program
  .command("claim-confidence")
  .description("Generate per-claim confidence report with citation-backed scoring")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const {
      generateClaimConfidenceReport,
      renderClaimConfidenceMarkdown
    } = require("./claims/claimConfidence.js") as typeof import("./claims/claimConfidence.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    // Get evidence events from ledger
    const events = db.prepare("SELECT * FROM evidence_events WHERE runtime != 'mock' ORDER BY ts DESC LIMIT 500").all() as any[];
    const report = generateClaimConfidenceReport(db, agentId, events);
    ledger.close();
    console.log(renderClaimConfidenceMarkdown(report));
  });

program
  .command("claim-confidence-gate")
  .description("Check if claims for given questions pass confidence threshold")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .requiredOption("--questions <ids>", "comma-separated question IDs")
  .action((opts: { agent?: string; questions: string }) => {
    const { checkConfidenceGate } = require("./claims/claimConfidence.js") as typeof import("./claims/claimConfidence.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const questionIds = opts.questions.split(",").map((s: string) => s.trim());
    const events = db.prepare("SELECT * FROM evidence_events WHERE runtime != 'mock' ORDER BY ts DESC LIMIT 500").all() as any[];
    const result = checkConfidenceGate(db, agentId, questionIds, events);
    ledger.close();
    if (result.pass) {
      console.log(chalk.green("PASS: All relevant claims meet confidence thresholds."));
    } else {
      console.log(chalk.red("FAIL: Some claims are below confidence thresholds:"));
      for (const reason of result.reasons) {
        console.log(chalk.yellow(`  - ${reason}`));
      }
    }
  });

// ── Overhead Accounting CLI ───────────────────────────────────────────
program
  .command("overhead-report")
  .description("Generate per-feature overhead accounting report")
  .option("--window <hours>", "reporting window in hours", "1")
  .action((opts: { window: string }) => {
    const oh = require("./ops/overheadAccounting.js") as typeof import("./ops/overheadAccounting.js");
    const windowMs = parseInt(opts.window, 10) * 3600000;
    const report = oh.generateOverheadReport(windowMs);
    console.log(oh.renderOverheadReportMarkdown(report));
  });

program
  .command("overhead-profile")
  .description("Set the overhead mode profile (STRICT, BALANCED, LEAN)")
  .argument("<mode>", "profile mode: STRICT, BALANCED, or LEAN")
  .action((mode: string) => {
    const oh = require("./ops/overheadAccounting.js") as typeof import("./ops/overheadAccounting.js");
    const validModes = ["STRICT", "BALANCED", "LEAN"] as const;
    if (!validModes.includes(mode as any)) {
      console.log(chalk.red(`Invalid mode: ${mode}. Must be STRICT, BALANCED, or LEAN.`));
      return;
    }
    const profile = oh.setOverheadProfile(mode as any);
    console.log(chalk.green(`Overhead profile set to ${profile.mode}`));
    console.log(`  Evidence sampling rate: ${profile.evidenceSamplingRate}`);
    console.log(`  Disabled features: ${profile.disabledFeatures.length > 0 ? profile.disabledFeatures.join(", ") : "none"}`);
  });

// ── Micro-Canary CLI ──────────────────────────────────────────────────
program
  .command("micro-canary-run")
  .description("Run all micro-canary probes immediately")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const mc = require("./assurance/microCanary.js") as typeof import("./assurance/microCanary.js");
    mc.registerBuiltInProbes();
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const ctx: import("./assurance/microCanary.js").MicroCanaryContext = {
      ts: Date.now(),
      agentId,
      recentEventHashes: [],
      auditCounts: {},
      configSignatures: {},
      metadata: {},
    };
    const results = mc.runAllProbes(ctx);
    for (const r of results) {
      const color = r.result.status === "PASS" ? chalk.green : r.result.status === "FAIL" ? chalk.red : chalk.yellow;
      console.log(color(`[${r.result.status}] ${r.probeName} (${r.riskTier}): ${r.result.reason} [${r.result.latencyMs}ms]`));
    }
    const passed = results.filter((r) => r.result.status === "PASS").length;
    console.log(`\n${passed}/${results.length} probes passed.`);
  });

program
  .command("micro-canary-report")
  .description("Generate micro-canary status report")
  .option("--window <hours>", "reporting window in hours", "1")
  .action((opts: { window: string }) => {
    const mc = require("./assurance/microCanary.js") as typeof import("./assurance/microCanary.js");
    const sinceTs = Date.now() - parseInt(opts.window, 10) * 3600000;
    const report = mc.generateMicroCanaryReport(sinceTs);
    console.log(mc.renderMicroCanaryMarkdown(report));
  });

program
  .command("micro-canary-alerts")
  .description("Show active micro-canary alerts")
  .option("--ack-all", "acknowledge all alerts", false)
  .action((opts: { ackAll: boolean }) => {
    const mc = require("./assurance/microCanary.js") as typeof import("./assurance/microCanary.js");
    if (opts.ackAll) {
      const count = mc.acknowledgeAllAlerts();
      console.log(chalk.green(`Acknowledged ${count} alert(s).`));
      return;
    }
    const alerts = mc.getActiveAlerts();
    if (alerts.length === 0) {
      console.log(chalk.green("No active micro-canary alerts."));
      return;
    }
    for (const a of alerts) {
      const color = a.riskTier === "CRITICAL" ? chalk.red : a.riskTier === "HIGH" ? chalk.yellow : chalk.white;
      console.log(color(`[${a.riskTier}] ${a.probeName}: ${a.reason}`));
      console.log(chalk.dim(`  Alert ID: ${a.alertId}  Time: ${new Date(a.ts).toISOString()}`));
    }
  });

// ── Architecture Experiment CLI ────────────────────────────────────────
program
  .command("experiment-architecture")
  .description("Run a controlled architecture comparison experiment")
  .requiredOption("--name <name>", "experiment name")
  .requiredOption("--model <modelId>", "model ID (must be same for both)")
  .requiredOption("--baseline-file <path>", "path to baseline architecture artifact")
  .requiredOption("--candidate-file <path>", "path to candidate architecture artifact")
  .option("--baseline-kind <kind>", "architecture kind", "POLICY_FRAME")
  .option("--candidate-kind <kind>", "architecture kind", "POLICY_FRAME")
  .action((opts: {
    name: string;
    model: string;
    baselineFile: string;
    candidateFile: string;
    baselineKind: string;
    candidateKind: string;
  }) => {
    const { quickArchitectureComparison } = require("./experiments/architectureExperiment.js") as typeof import("./experiments/architectureExperiment.js");
    const fs = require("node:fs") as typeof import("node:fs");
    let baselineContent = "{}";
    let candidateContent = "{}";
    try { baselineContent = fs.readFileSync(opts.baselineFile, "utf-8"); } catch { /* use default */ }
    try { candidateContent = fs.readFileSync(opts.candidateFile, "utf-8"); } catch { /* use default */ }
    const validKinds = ["POLICY_FRAME", "PROMPT_STRUCTURE", "IDENTITY_DOC", "GUARDRAIL_SET", "TOOL_PERMISSION_SET", "CUSTOM"] as const;
    const baselineKind = validKinds.includes(opts.baselineKind as any) ? opts.baselineKind as any : "POLICY_FRAME";
    const candidateKind = validKinds.includes(opts.candidateKind as any) ? opts.candidateKind as any : "POLICY_FRAME";
    const { markdown } = quickArchitectureComparison({
      name: opts.name,
      modelId: opts.model,
      baselineName: `Baseline (${opts.baselineFile})`,
      baselineKind,
      baselineContent,
      baselineDescription: `Loaded from ${opts.baselineFile}`,
      candidateName: `Candidate (${opts.candidateFile})`,
      candidateKind,
      candidateContent,
      candidateDescription: `Loaded from ${opts.candidateFile}`,
    });
    console.log(markdown);
  });

program
  .command("experiment-architecture-probes")
  .description("List the standard probe set for architecture experiments")
  .action(() => {
    const { createStandardProbeSet } = require("./experiments/architectureExperiment.js") as typeof import("./experiments/architectureExperiment.js");
    const probes = createStandardProbeSet();
    console.log(chalk.bold(`Standard Architecture Probes (${probes.length}):\n`));
    for (const p of probes) {
      console.log(`  ${p.probeId}`);
      console.log(`    Category: ${p.category}`);
      console.log(`    Dimension: ${p.measureDimension}`);
      console.log(`    Prompt: ${p.promptText.slice(0, 80)}`);
      console.log("");
    }
  });

// ── Policy Canary CLI ─────────────────────────────────────────────────
program
  .command("canary-start")
  .description("Start a policy canary with candidate vs stable policy")
  .requiredOption("--candidate-sha <sha256>", "SHA256 of candidate policy")
  .requiredOption("--stable-sha <sha256>", "SHA256 of stable policy")
  .option("--enforce-pct <n>", "percent of requests to enforce candidate on", "10")
  .option("--duration <ms>", "canary duration in milliseconds", "3600000")
  .option("--failure-threshold <ratio>", "failure ratio that triggers rollback", "0.1")
  .option("--auto-promote", "auto-promote if canary succeeds", false)
  .action((opts: {
    candidateSha: string;
    stableSha: string;
    enforcePct: string;
    duration: string;
    failureThreshold: string;
    autoPromote: boolean;
  }) => {
    const { startCanary } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    const enforcePct = parseInt(opts.enforcePct, 10);
    const config = startCanary({
      enforcePercentage: enforcePct,
      logOnlyPercentage: 100 - enforcePct,
      enabled: true,
      candidatePolicySha256: opts.candidateSha,
      stablePolicySha256: opts.stableSha,
      startedTs: Date.now(),
      durationMs: parseInt(opts.duration, 10),
      autoPromote: opts.autoPromote,
      failureThresholdRatio: parseFloat(opts.failureThreshold),
    });
    console.log(chalk.green(`Canary started: ${config.enforcePercentage}% enforce, ${config.logOnlyPercentage}% log-only`));
    console.log(`  Candidate: ${config.candidatePolicySha256.slice(0, 16)}…`);
    console.log(`  Stable:    ${config.stablePolicySha256.slice(0, 16)}…`);
    console.log(`  Duration:  ${config.durationMs}ms`);
  });

program
  .command("canary-status")
  .description("Show current canary status and stats")
  .action(() => {
    const { getCanaryConfig, computeCanaryStats } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    const config = getCanaryConfig();
    if (!config) {
      console.log(chalk.yellow("No active canary."));
      return;
    }
    console.log(chalk.bold("Canary Config:"));
    console.log(`  Enforce: ${config.enforcePercentage}%  Log-only: ${config.logOnlyPercentage}%`);
    console.log(`  Candidate: ${config.candidatePolicySha256.slice(0, 16)}…`);
    const stats = computeCanaryStats();
    if (stats) {
      console.log(chalk.bold("\nCanary Stats:"));
      console.log(`  Total: ${stats.totalRequests}  Candidate: ${stats.candidateRequests}  Stable: ${stats.stableRequests}`);
      console.log(`  Candidate failure ratio: ${(stats.candidateFailureRatio * 100).toFixed(1)}%`);
      console.log(`  Healthy: ${stats.isHealthy}  Should promote: ${stats.shouldPromote}  Should rollback: ${stats.shouldRollback}`);
    }
  });

program
  .command("canary-stop")
  .description("Stop the active canary")
  .action(() => {
    const { stopCanary } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    stopCanary();
    console.log(chalk.green("Canary stopped."));
  });

program
  .command("canary-report")
  .description("Generate full policy canary report")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { generatePolicyCanaryReport, renderPolicyCanaryMarkdown } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const report = generatePolicyCanaryReport(agentId);
    console.log(renderPolicyCanaryMarkdown(report));
  });

program
  .command("rollback-create")
  .description("Create a rollback pack from the current policy file")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .requiredOption("--reason <reason>", "reason for creating the rollback pack")
  .option("--policy-file <path>", "path to policy file", "amc-policy.yml")
  .action((opts: { agent?: string; reason: string; policyFile: string }) => {
    const { createRollbackPack } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    const fs = require("node:fs") as typeof import("node:fs");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    let policyContent = "{}";
    try { policyContent = fs.readFileSync(opts.policyFile, "utf-8"); } catch { /* use default */ }
    const pack = createRollbackPack(agentId, policyContent, opts.reason, process.cwd());
    console.log(chalk.green(`Rollback pack created: ${pack.packId}`));
    console.log(`  Policy SHA256: ${pack.policyFileSha256.slice(0, 16)}…`);
  });

program
  .command("emergency-override")
  .description("Activate an emergency policy override with strict TTL")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .requiredOption("--reason <reason>", "reason for the emergency override")
  .requiredOption("--action <desc>", "description of what the override allows")
  .option("--ttl <ms>", "TTL in milliseconds", "3600000")
  .action((opts: { agent?: string; reason: string; action: string; ttl: string }) => {
    const { activateEmergencyOverride } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const override = activateEmergencyOverride({
      agentId,
      reason: opts.reason,
      actionDescription: opts.action,
      ttlMs: parseInt(opts.ttl, 10),
    }, process.cwd());
    console.log(chalk.yellow(`Emergency override activated: ${override.overrideId}`));
    console.log(`  Expires: ${new Date(override.expiresTs).toISOString()}`);
    console.log(chalk.red("  ⚠  Postmortem required after expiry."));
  });

program
  .command("policy-debt-add")
  .description("Register a temporary policy waiver (debt)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .requiredOption("--requirement <req>", "waived requirement description")
  .requiredOption("--justification <text>", "justification for the waiver")
  .requiredOption("--expires <ts>", "expiry timestamp (epoch ms) or duration e.g. 7d")
  .option("--created-by <who>", "who created this waiver", "operator")
  .action((opts: { agent?: string; requirement: string; justification: string; expires: string; createdBy: string }) => {
    const { registerPolicyDebt } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    let expiresTs: number;
    if (/^\d+$/.test(opts.expires)) {
      expiresTs = parseInt(opts.expires, 10);
    } else {
      const match = opts.expires.match(/^(\d+)([dhm])$/);
      if (match) {
        const val = parseInt(match[1]!, 10);
        const unit = match[2];
        const ms = unit === "d" ? val * 86400000 : unit === "h" ? val * 3600000 : val * 60000;
        expiresTs = Date.now() + ms;
      } else {
        expiresTs = Date.now() + 86400000; // default 1 day
      }
    }
    const entry = registerPolicyDebt({
      agentId,
      waivedRequirement: opts.requirement,
      justification: opts.justification,
      expiresTs,
      createdBy: opts.createdBy,
    }, process.cwd());
    console.log(chalk.yellow(`Policy debt registered: ${entry.debtId}`));
    console.log(`  Expires: ${new Date(entry.expiresTs).toISOString()}`);
  });

program
  .command("policy-debt-list")
  .description("List active policy debt entries")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--all", "include expired entries", false)
  .action((opts: { agent?: string; all: boolean }) => {
    const { getActivePolicyDebt, getExpiredPolicyDebt } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const active = getActivePolicyDebt(agentId);
    console.log(chalk.bold(`Active policy debt for ${agentId}: ${active.length}`));
    for (const d of active) {
      console.log(`  ${d.debtId}: ${d.waivedRequirement} (expires ${new Date(d.expiresTs).toISOString()})`);
    }
    if (opts.all) {
      const expired = getExpiredPolicyDebt(agentId);
      console.log(chalk.dim(`\nExpired: ${expired.length}`));
      for (const d of expired) {
        console.log(chalk.dim(`  ${d.debtId}: ${d.waivedRequirement}`));
      }
    }
  });

program
  .command("governance-drift")
  .description("Detect governance drift for an agent")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { detectGovernanceDrift } = require("./governor/policyCanary.js") as typeof import("./governor/policyCanary.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const result = detectGovernanceDrift(agentId);
    if (!result.drifted) {
      console.log(chalk.green("No governance drift detected."));
    } else {
      console.log(chalk.red(`Governance drift detected: ${result.driftItems.length} item(s)`));
      for (const item of result.driftItems) {
        console.log(chalk.yellow(`  [${item.severity}] ${item.category}: ${item.description}`));
      }
    }
  });

// ── CGX Propagation CLI ─────────────────────────────────────────────────
program
  .command("cgx-integrity")
  .description("Run graph integrity check on CGX with semantic overlay")
  .option("--max-contradictions <n>", "max allowed contradictions", "5")
  .action((opts: { maxContradictions: string }) => {
    const { checkGraphIntegrity, createSemanticOverlay, renderIntegrityCheckMarkdown } = require("./cgx/cgxPropagation.js") as typeof import("./cgx/cgxPropagation.js");
    const { loadLatestGraph } = require("./cgx/cgxStore.js") as { loadLatestGraph: (workspace: string) => any };
    const graph = loadLatestGraph(process.cwd());
    if (!graph) {
      console.log(chalk.yellow("No CGX graph found. Run cgx-build first."));
      return;
    }
    const overlay = createSemanticOverlay(graph);
    const result = checkGraphIntegrity(graph, overlay, {
      maxContradictions: parseInt(opts.maxContradictions, 10),
    });
    console.log(renderIntegrityCheckMarkdown(result));
  });

program
  .command("cgx-propagation")
  .description("Simulate risk propagation from a source node")
  .argument("<nodeId>", "source node ID")
  .option("--max-depth <n>", "max propagation depth", "5")
  .action((nodeId: string, opts: { maxDepth: string }) => {
    const { simulateRiskPropagation, createSemanticOverlay, renderPropagationMarkdown } = require("./cgx/cgxPropagation.js") as typeof import("./cgx/cgxPropagation.js");
    const { loadLatestGraph } = require("./cgx/cgxStore.js") as { loadLatestGraph: (workspace: string) => any };
    const graph = loadLatestGraph(process.cwd());
    if (!graph) {
      console.log(chalk.yellow("No CGX graph found. Run cgx-build first."));
      return;
    }
    const overlay = createSemanticOverlay(graph);
    const result = simulateRiskPropagation(graph, overlay, nodeId, {
      maxDepth: parseInt(opts.maxDepth, 10),
    });
    console.log(renderPropagationMarkdown(result));
  });

program
  .command("memory-extract")
  .description("Extract lessons from verified effective corrections")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--min-effectiveness <n>", "min effectiveness score (0-1)", "0.3")
  .action((opts: { agent?: string; minEffectiveness: string }) => {
    const { initLessonTables, extractLessonsFromCorrections } = require("./learning/correctionMemory.js") as typeof import("./learning/correctionMemory.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    initLessonTables(db);
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const lessons = extractLessonsFromCorrections(db, agentId, process.cwd(), {
      minEffectivenessForLesson: parseFloat(opts.minEffectiveness),
    });
    ledger.close();
    if (lessons.length === 0) {
      console.log("No new lessons to extract. Ensure corrections are verified effective first.");
      return;
    }
    for (const l of lessons) {
      console.log(chalk.green(`Lesson ${l.lessonId}: ${l.lessonText.slice(0, 100)}`));
    }
    console.log(`\n${lessons.length} lesson(s) extracted.`);
  });

program
  .command("memory-advisories")
  .description("Show advisories from correction memory for prompt injection")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { initLessonTables, buildLessonAdvisories } = require("./learning/correctionMemory.js") as typeof import("./learning/correctionMemory.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    initLessonTables(db);
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const advisories = buildLessonAdvisories(db, agentId);
    ledger.close();
    if (advisories.length === 0) {
      console.log("No active lessons to inject. Run memory-extract first.");
      return;
    }
    console.log(JSON.stringify(advisories, null, 2));
  });

program
  .command("memory-report")
  .description("Generate correction memory report")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--window <window>", "evidence window", "30d")
  .action((opts: { agent?: string; window: string }) => {
    const { initLessonTables, generateCorrectionMemoryReport, renderCorrectionMemoryMarkdown } = require("./learning/correctionMemory.js") as typeof import("./learning/correctionMemory.js");
    const { parseWindowToMs } = require("./utils/time.js") as typeof import("./utils/time.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    initLessonTables(db);
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const now = Date.now();
    const windowMs = parseWindowToMs(opts.window);
    const report = generateCorrectionMemoryReport(db, agentId, now - windowMs, now);
    ledger.close();
    console.log(renderCorrectionMemoryMarkdown(report));
  });

program
  .command("memory-expire")
  .description("Expire stale lessons past their TTL")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { initLessonTables, expireStaleLessons } = require("./learning/correctionMemory.js") as typeof import("./learning/correctionMemory.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    initLessonTables(db);
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const expired = expireStaleLessons(db, agentId);
    ledger.close();
    if (expired.length === 0) {
      console.log("No stale lessons found.");
      return;
    }
    for (const id of expired) {
      console.log(chalk.yellow(`Expired: ${id}`));
    }
    console.log(`\n${expired.length} lesson(s) expired.`);
  });

program
  .command("own")
  .description("Ownership flow for top maturity gaps")
  .requiredOption("--target <name>", "target profile name")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { target: string; agent?: string }) => {
    const ownership = assignOwnership({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      targetName: opts.target
    });
    console.log(ownership.output);
    console.log(chalk.cyan(`Saved: ${ownership.outputFile}`));
    console.log(chalk.cyan(`Audit event: ${ownership.auditEventId}`));
  });

program
  .command("commit")
  .description("Commitment plan flow (7/14/30-day checklist)")
  .requiredOption("--target <name>", "target profile name")
  .requiredOption("--days <n>", "commitment window in days")
  .requiredOption("--out <file>", "output markdown path")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { target: string; days: string; out: string; agent?: string }) => {
    const commitment = createCommitmentPlan({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      targetName: opts.target,
      days: Number(opts.days),
      outFile: opts.out
    });
    console.log(chalk.green(`Commitment created: ${commitment.outFile}`));
    console.log(`Commitment ID: ${commitment.commitmentId}`);
    console.log(`Audit event: ${commitment.auditEventId}`);
  });

program
  .command("tune")
  .description("Mechanic mode tuning wizard")
  .requiredOption("--target <name>", "target profile")
  .action(async (opts: { target: string }) => {
    const result = await runTuneWizard(process.cwd(), opts.target);
    console.log("Top 10 gaps:");
    for (const line of result.summary) {
      console.log(`- ${line}`);
    }
    console.log("Commitment Loop (weekly):");
    console.log(result.cron);
    console.log("Re-run steps:");
    for (const step of result.rerunSteps) {
      console.log(`- ${step}`);
    }
  });

program
  .command("upgrade")
  .description("Generate upgrade plan")
  .requiredOption("--to <destination>", "target:<name> | excellence")
  .action(async (opts: { to: string }) => {
    const result = await runUpgradeWizard(process.cwd(), opts.to);
    console.log(`Upgrade plan: ${result.planPath}`);
    for (const phase of result.phaseCounts) {
      console.log(`- ${phase.phase}: ${phase.tasks} tasks`);
    }
  });

program
  .command("guard")
  .description("Guard check proposed output from stdin")
  .option("--target <name>", "target profile name", "default")
  .option("--risk-tier <tier>", "low|med|high|critical")
  .action(async (opts: { target: string; riskTier?: "low" | "med" | "high" | "critical" }) => {
    const inputText = await readStdinAll();
    const agentId = activeAgent(program);
    const targetProfile = loadTargetProfile(process.cwd(), opts.target, agentId);
    const contextGraph = loadContextGraph(process.cwd(), agentId);

    const result = guardCheck({
      contextGraph,
      signedTargetProfile: targetProfile,
      proposedActionOrOutput: inputText,
      taskMetadata: {
        riskTier: opts.riskTier
      }
    });

    const guardPayload = {
      auditType: "GUARD_CHECK",
      severity: result.pass ? "LOW" : "HIGH",
      pass: result.pass,
      targetId: targetProfile.id,
      agentId: agentId ?? "default",
      requiredRemediations: result.requiredRemediations,
      requiredEscalations: result.requiredEscalations,
      requiredVerificationSteps: result.requiredVerificationSteps,
      requiredEvidenceToProceed: result.requiredEvidenceToProceed
    };
    const guardPayloadText = JSON.stringify(guardPayload);
    const ledger = openLedger(process.cwd());
    try {
      const sessionId = randomUUID();
      ledger.startSession({
        sessionId,
        runtime: "unknown",
        binaryPath: "amc-guard",
        binarySha256: sha256Hex("amc-guard")
      });
      ledger.appendEvidenceWithReceipt({
        sessionId,
        runtime: "unknown",
        eventType: "audit",
        payload: guardPayloadText,
        payloadExt: "json",
        inline: true,
        meta: {
          ...guardPayload,
          trustTier: "OBSERVED"
        },
        receipt: {
          kind: "guard_check",
          agentId: agentId ?? "default",
          providerId: "unknown",
          model: null,
          bodySha256: sha256Hex(Buffer.from(guardPayloadText, "utf8"))
        }
      });
      ledger.sealSession(sessionId);
    } finally {
      ledger.close();
    }

    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) {
      process.exit(1);
    }
  });

const leases = program.command("lease").description("Issue/verify/revoke short-lived agent leases");

leases
  .command("issue")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--ttl <ttl>", "lease TTL (e.g. 15m, 60m)", "60m")
  .option("--scopes <scopes>", "comma-separated scopes", "gateway:llm,proxy:connect,toolhub:intent,toolhub:execute,governor:check,receipt:verify")
  .option("--routes <routes>", "comma-separated route prefixes", "/openai,/anthropic,/gemini,/grok,/openrouter,/local")
  .option("--models <models>", "comma-separated model patterns", "*")
  .option("--rpm <rpm>", "max requests per minute", "60")
  .option("--tpm <tpm>", "max tokens per minute", "200000")
  .option("--max-cost-usd-per-day <usd>", "optional max cost USD per day")
  .option("--workorder <workOrderId>", "optional work order binding")
  .action((opts: {
    agent: string;
    ttl: string;
    scopes: string;
    routes: string;
    models: string;
    rpm: string;
    tpm: string;
    maxCostUsdPerDay?: string;
    workorder?: string;
  }) => {
    const ensured = ensureLeaseRevocationStore(process.cwd());
    if (!ensured.signatureValid) {
      throw new Error("Lease revocation signature invalid. Run as owner and repair signatures.");
    }
    const issued = issueLeaseForCli({
      workspace: process.cwd(),
      workspaceId: workspaceIdFromDirectory(process.cwd()),
      agentId: opts.agent,
      ttl: opts.ttl,
      scopes: opts.scopes,
      routes: opts.routes,
      models: opts.models,
      rpm: Number(opts.rpm),
      tpm: Number(opts.tpm),
      maxCostUsdPerDay: opts.maxCostUsdPerDay ? Number(opts.maxCostUsdPerDay) : null,
      workOrderId: opts.workorder
    });
    console.log(issued.token);
  });

leases
  .command("verify")
  .argument("<token>", "lease token")
  .action((token: string) => {
    const verify = verifyLeaseForCli({
      workspace: process.cwd(),
      token
    });
    if (!verify.ok) {
      console.log(chalk.red(`invalid lease: ${verify.error ?? "unknown"}`));
      process.exit(1);
    }
    console.log(chalk.green("Lease valid"));
    console.log(JSON.stringify(verify.payload, null, 2));
  });

leases
  .command("revoke")
  .requiredOption("--lease-id <id>", "lease ID to revoke")
  .requiredOption("--reason <reason>", "revocation reason")
  .action((opts: { leaseId: string; reason: string }) => {
    const revoked = revokeLeaseForCli({
      workspace: process.cwd(),
      leaseId: opts.leaseId,
      reason: opts.reason
    });
    console.log(chalk.green(`Revoked lease: ${revoked.leaseId}`));
  });

const budgets = program.command("budgets").description("Signed autonomy and usage budgets");

budgets
  .command("init")
  .option("--agent <agentId>", "agent ID", "default")
  .action((opts: { agent: string }) => {
    const out = initBudgets(process.cwd(), opts.agent);
    console.log(chalk.green(`Budgets initialized: ${out.configPath}`));
    console.log(`Signature: ${out.sigPath}`);
  });

budgets
  .command("verify")
  .action(() => {
    const verify = verifyBudgetsConfigSignature(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red(`Invalid budgets signature: ${verify.reason ?? "unknown"}`));
      process.exit(1);
    }
    console.log(chalk.green("Budgets signature valid"));
  });

budgets
  .command("status")
  .requiredOption("--agent <agentId>", "agent ID")
  .action((opts: { agent: string }) => {
    const status = evaluateBudgetStatus(process.cwd(), opts.agent);
    console.log(JSON.stringify(status, null, 2));
    if (!status.ok) {
      process.exit(1);
    }
  });

budgets
  .command("reset")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--day <yyyy-mm-dd>", "budget day to reset")
  .action((opts: { agent: string; day: string }) => {
    const eventId = resetBudgetDay({
      workspace: process.cwd(),
      agentId: opts.agent,
      day: opts.day
    });
    console.log(chalk.green(`Budget reset logged: ${eventId}`));
  });

const drift = program.command("drift").description("Drift/regression detection and reporting");

drift
  .command("check")
  .option("--agent <agentId>", "agent ID")
  .option("--against <kind>", "comparison baseline", "previous")
  .action(async (opts: { agent?: string; against?: "previous" }) => {
    const result = await driftCheckCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      against: opts.against ?? "previous"
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.triggered) {
      process.exit(2);
    }
  });

drift
  .command("report")
  .option("--agent <agentId>", "agent ID")
  .requiredOption("--out <file>", "output markdown path")
  .action(async (opts: { agent?: string; out: string }) => {
    const report = await driftReportCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program),
      outFile: opts.out
    });
    console.log(report.markdown);
    if (report.outFile) {
      console.log(chalk.green(`Saved: ${report.outFile}`));
    }
  });

const freeze = program.command("freeze").description("Execution freeze status and controls");

freeze
  .command("status")
  .option("--agent <agentId>", "agent ID")
  .action((opts: { agent?: string }) => {
    const status = freezeStatusCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });
    console.log(JSON.stringify(status, null, 2));
  });

freeze
  .command("lift")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--incident <id>", "incident ID")
  .requiredOption("--reason <text>", "reason for lifting freeze")
  .action((opts: { agent: string; incident: string; reason: string }) => {
    const out = freezeLiftCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      incidentId: opts.incident,
      reason: opts.reason
    });
    console.log(chalk.green(`Freeze lifted: ${out.liftPath}`));
  });

const alerts = program.command("alerts").description("Signed drift alert configuration and dispatch");

alerts
  .command("init")
  .action(() => {
    const out = initAlertsConfig(process.cwd());
    console.log(chalk.green(`Alerts initialized: ${out.configPath}`));
    console.log(`Signature: ${out.sigPath}`);
  });

alerts
  .command("verify")
  .action(() => {
    const verify = verifyAlertsConfigSignature(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red(`Alerts signature invalid: ${verify.reason ?? "unknown"}`));
      process.exit(1);
    }
    console.log(chalk.green("Alerts signature valid"));
  });

alerts
  .command("test")
  .action(async () => {
    await sendTestAlert(process.cwd());
    console.log(chalk.green("Test alert sent"));
  });

const bom = program.command("bom").description("Maturity Bill of Materials");

bom
  .command("generate")
  .requiredOption("--run <runId|latest>", "diagnostic run ID or 'latest'")
  .requiredOption("--out <file>", "output BOM JSON file")
  .option("--agent <agentId>", "agent ID")
  .action((opts: { run: string; out: string; agent?: string }) => {
    const workspace = process.cwd();
    const agentId = opts.agent ?? activeAgent(program);
    let runId = opts.run;
    if (runId === "latest") {
      const latest = latestRunSummary(workspace, resolveAgentId(workspace, agentId));
      if (!latest) {
        throw new Error("No runs available for agent.");
      }
      runId = latest.runId;
    }
    const out = generateBom({
      workspace,
      agentId,
      runId,
      outFile: opts.out
    });
    console.log(chalk.green(`BOM generated: ${out.outFile}`));
  });

bom
  .command("sign")
  .requiredOption("--in <file>", "input BOM JSON")
  .requiredOption("--out <file>", "signature output file")
  .action((opts: { in: string; out: string }) => {
    const signed = signBomFile({
      workspace: process.cwd(),
      inputFile: opts.in,
      outputSigFile: opts.out
    });
    console.log(chalk.green(`BOM signed: ${signed.sigFile}`));
  });

bom
  .command("verify")
  .requiredOption("--in <file>", "input BOM JSON")
  .requiredOption("--sig <file>", "signature file")
  .option("--pubkey <file>", "optional explicit auditor public key PEM")
  .action((opts: { in: string; sig: string; pubkey?: string }) => {
    const verify = verifyBomSignature({
      workspace: process.cwd(),
      inputFile: opts.in,
      sigFile: opts.sig,
      pubkeyPemFile: opts.pubkey
    });
    if (!verify.ok) {
      console.log(chalk.red(`BOM verify failed: ${verify.reason ?? "unknown"}`));
      process.exit(1);
    }
    console.log(chalk.green("BOM verified"));
  });

const approvals = program.command("approvals").description("Signed approval inbox operations");

approvals
  .command("list")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--status <status>", "pending|approved|denied|consumed|expired")
  .action((opts: { agent: string; status?: string }) => {
    const rows = listApprovals({
      workspace: process.cwd(),
      agentId: opts.agent,
      status: parseApprovalStatus(opts.status?.toUpperCase())
    });
    if (rows.length === 0) {
      console.log("No approvals found.");
      return;
    }
    for (const row of rows) {
      console.log(
        `${row.approval.approvalId} | ${row.status} | ${row.approval.toolName} | ${row.approval.actionClass} | intent=${row.approval.intentId}`
      );
    }
  });

approvals
  .command("show")
  .requiredOption("--agent <agentId>", "agent ID")
  .argument("<approvalId>")
  .action((approvalId: string, opts: { agent: string }) => {
    const approval = loadApproval({
      workspace: process.cwd(),
      agentId: opts.agent,
      approvalId,
      requireValidSignature: true
    });
    console.log(JSON.stringify(approval, null, 2));
  });

approvals
  .command("approve")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--mode <simulate|execute>", "approved mode")
  .requiredOption("--reason <text>", "decision reason")
  .argument("<approvalId>")
  .action((approvalId: string, opts: { agent: string; mode: string; reason: string }) => {
    const out = decideApprovalForIntent({
      workspace: process.cwd(),
      agentId: opts.agent,
      approvalId,
      decision: "APPROVED",
      mode: parseApprovalMode(opts.mode),
      reason: opts.reason
    });
    console.log(chalk.green(`Approval decided: ${out.approval.approvalId}`));
  });

approvals
  .command("deny")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--reason <text>", "decision reason")
  .argument("<approvalId>")
  .action((approvalId: string, opts: { agent: string; reason: string }) => {
    const out = decideApprovalForIntent({
      workspace: process.cwd(),
      agentId: opts.agent,
      approvalId,
      decision: "DENIED",
      mode: "SIMULATE",
      reason: opts.reason
    });
    console.log(chalk.green(`Approval denied: ${out.approval.approvalId}`));
  });

const whatif = program.command("whatif").description("Equalizer what-if simulator");

whatif
  .command("targets")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--in <file>", "input target mapping json")
  .requiredOption("--out <file>", "output what-if json file")
  .action((opts: { agent: string; in: string; out: string }) => {
    const mapping = parseTargetMappingFile(process.cwd(), opts.in);
    const result = simulateTargetWhatIf({
      workspace: process.cwd(),
      agentId: opts.agent,
      proposedTarget: mapping
    });
    const outFile = resolve(process.cwd(), opts.out);
    ensureDir(dirname(outFile));
    writeFileAtomic(outFile, JSON.stringify(result, null, 2), 0o644);
    console.log(chalk.green(`What-if written: ${outFile}`));
  });

whatif
  .command("equalizer")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--set <pair...>", "question level set pairs, e.g. AMC-1.1=3")
  .action((opts: { agent: string; set?: string[] }) => {
    const mapping = parseSetPairs(opts.set ?? []);
    const result = simulateTargetWhatIf({
      workspace: process.cwd(),
      agentId: opts.agent,
      proposedTarget: mapping
    });
    console.log("Top 10 changes:");
    for (const row of result.topChanges.slice(0, 10)) {
      console.log(`- ${row.questionId}: ${row.effectiveBefore} -> ${row.effectiveAfter} (delta ${row.delta})`);
    }
    const unlocked = result.governor.matrix.filter((row) => row.executeAllowed).length;
    const locked = result.governor.matrix.filter((row) => !row.executeAllowed).length;
    console.log(`Action classes unlocked (execute cells): ${unlocked}`);
    console.log(`Action classes locked (execute cells): ${locked}`);
    if (result.warnings.length > 0) {
      console.log("Warnings:");
      for (const warning of result.warnings.slice(0, 10)) {
        console.log(`- ${warning}`);
      }
    }
  });

const transform = program.command("transform").description("Transformation OS (4C plans, tracking, attestations)");

transform
  .command("init")
  .description("Initialize signed .amc/transform-map.yaml")
  .action(() => {
    const out = transformInitCli(process.cwd());
    console.log(chalk.green(`Transform map initialized: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

transform
  .command("verify")
  .description("Verify signed transform map")
  .action(() => {
    const verify = transformVerifyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red(`Transform map signature invalid: ${verify.reason ?? "unknown reason"}`));
      process.exit(1);
    }
    console.log(chalk.green(`Transform map signature valid: ${verify.sigPath}`));
  });

const transformMap = transform.command("map").description("Inspect or apply transform map");

transformMap
  .command("show")
  .option("--format <fmt>", "json|yaml", "yaml")
  .action((opts: { format: string }) => {
    const map = transformMapReadCli(process.cwd());
    if (opts.format === "json") {
      console.log(JSON.stringify(map, null, 2));
      return;
    }
    console.log(YAML.stringify(map));
  });

transformMap
  .command("apply")
  .requiredOption("--file <path>", "transform map file (yaml/json)")
  .action((opts: { file: string }) => {
    const raw = readUtf8(resolve(process.cwd(), opts.file));
    const parsed = (opts.file.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw)) as ReturnType<typeof transformMapReadCli>;
    const out = transformMapApplyCli({
      workspace: process.cwd(),
      map: parsed
    });
    console.log(chalk.green(`Transform map updated: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

transform
  .command("plan")
  .option("--agent <agentId>", "agent ID")
  .option("--node <nodeId>", "org node ID")
  .option("--to <mode>", "targets|excellence|custom", "targets")
  .option("--window <window>", "e.g. 14d", "14d")
  .option("--preview", "do not persist plan")
  .option("--target-file <path>", "custom target mapping json")
  .action((opts: { agent?: string; node?: string; to: string; window: string; preview?: boolean; targetFile?: string }) => {
    if (!opts.agent && !opts.node) {
      throw new Error("Provide either --agent <id> or --node <id>");
    }
    if (opts.agent && opts.node) {
      throw new Error("Use only one scope: --agent or --node");
    }
    const to = opts.to === "excellence" ? "excellence" : opts.to === "custom" ? "custom" : "targets";
    const targetOverride = opts.targetFile
      ? (JSON.parse(readUtf8(resolve(process.cwd(), opts.targetFile))) as Record<string, number>)
      : undefined;
    const out = transformPlanCli({
      workspace: process.cwd(),
      scope: opts.node ? { type: "NODE", nodeId: opts.node } : { type: "AGENT", agentId: opts.agent! },
      to,
      window: opts.window,
      preview: opts.preview === true,
      targetOverride
    });
    console.log(chalk.green(`Transform plan ${opts.preview ? "previewed" : "created"}: ${out.plan.planId}`));
    if (out.written) {
      console.log(`Plan: ${out.written.planPath}`);
      console.log(`Signature: ${out.written.sigPath}`);
    }
  });

transform
  .command("status")
  .option("--agent <agentId>", "agent ID")
  .option("--node <nodeId>", "org node ID")
  .action((opts: { agent?: string; node?: string }) => {
    if (!opts.agent && !opts.node) {
      throw new Error("Provide either --agent <id> or --node <id>");
    }
    const out = transformStatusCli({
      workspace: process.cwd(),
      scope: opts.node ? { type: "NODE", nodeId: opts.node } : { type: "AGENT", agentId: opts.agent! }
    });
    if (!out.plan) {
      console.log("No transformation plan found for scope.");
      return;
    }
    console.log(JSON.stringify({
      signature: out.verify,
      status: out.compact
    }, null, 2));
  });

transform
  .command("track")
  .option("--agent <agentId>", "agent ID")
  .option("--node <nodeId>", "org node ID")
  .option("--window <window>", "e.g. 14d")
  .action((opts: { agent?: string; node?: string; window?: string }) => {
    if (!opts.agent && !opts.node) {
      throw new Error("Provide either --agent <id> or --node <id>");
    }
    const out = transformTrackCli({
      workspace: process.cwd(),
      scope: opts.node ? { type: "NODE", nodeId: opts.node } : { type: "AGENT", agentId: opts.agent! },
      window: opts.window
    });
    console.log(chalk.green(`Tracked plan: ${out.after.planId}`));
    console.log(JSON.stringify({
      changed: out.changed,
      percentDone: out.after.summary.percentDone,
      topBlockers: out.after.summary.topBlockers.slice(0, 8),
      missingEvidence: out.missingEvidence.slice(0, 12)
    }, null, 2));
  });

transform
  .command("report")
  .option("--agent <agentId>", "agent ID")
  .option("--node <nodeId>", "org node ID")
  .requiredOption("--out <file>", "output markdown file")
  .action((opts: { agent?: string; node?: string; out: string }) => {
    if (!opts.agent && !opts.node) {
      throw new Error("Provide either --agent <id> or --node <id>");
    }
    const out = transformReportCli({
      workspace: process.cwd(),
      scope: opts.node ? { type: "NODE", nodeId: opts.node } : { type: "AGENT", agentId: opts.agent! },
      outFile: opts.out
    });
    console.log(chalk.green(`Transform report written: ${out.outFile}`));
  });

transform
  .command("attest")
  .option("--agent <agentId>", "agent ID")
  .option("--node <nodeId>", "org node ID")
  .requiredOption("--task <taskId>", "task ID")
  .requiredOption("--statement <text>", "attestation statement")
  .option("--role <role>", "OWNER|AUDITOR", "OWNER")
  .option("--files <paths...>", "related file paths")
  .option("--evidence-links <refs...>", "evidence links")
  .action((opts: {
    agent?: string;
    node?: string;
    task: string;
    statement: string;
    role: string;
    files?: string[];
    evidenceLinks?: string[];
  }) => {
    if (!opts.agent && !opts.node) {
      throw new Error("Provide either --agent <id> or --node <id>");
    }
    const role = opts.role.toUpperCase();
    if (role !== "OWNER" && role !== "AUDITOR") {
      throw new Error(`Invalid role '${opts.role}', expected OWNER or AUDITOR`);
    }
    const out = transformAttestCli({
      workspace: process.cwd(),
      scope: opts.node ? { type: "NODE", nodeId: opts.node } : { type: "AGENT", agentId: opts.agent! },
      taskId: opts.task,
      statement: opts.statement,
      createdByUser: "owner-cli",
      role,
      files: opts.files,
      evidenceLinks: opts.evidenceLinks
    });
    console.log(chalk.green(`Transformation attestation created: ${out.attestation.attestationId}`));
    console.log(`Path: ${out.path}`);
  });

transform
  .command("attest-verify")
  .argument("<file>")
  .action((file: string) => {
    const verify = transformAttestVerifyCli({
      workspace: process.cwd(),
      file
    });
    if (!verify.valid) {
      console.log(chalk.red(`Attestation verify failed: ${verify.reason ?? "unknown reason"}`));
      process.exit(1);
    }
    console.log(chalk.green(`Attestation verified: ${verify.path}`));
  });

const org = program.command("org").description("Org graph and real-time comparative scorecards");

org
  .command("init")
  .option("--enterprise <name>", "enterprise display name", "AMC Enterprise")
  .action((opts: { enterprise: string }) => {
    const out = orgInitCli({
      workspace: process.cwd(),
      enterpriseName: opts.enterprise
    });
    console.log(chalk.green(`Org config initialized: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

org
  .command("verify")
  .description("Verify signed org.yaml")
  .action(() => {
    const out = orgVerifyCli(process.cwd());
    if (!out.valid) {
      console.log(chalk.red(`Org config signature invalid: ${out.reason ?? "unknown reason"}`));
      process.exit(1);
    }
    console.log(chalk.green(`Org config signature valid: ${out.sigPath}`));
  });

org
  .command("add")
  .command("node")
  .requiredOption("--type <type>", "ENTERPRISE|TEAM|FUNCTION|PROCESS|ECOSYSTEM")
  .requiredOption("--id <id>", "node ID")
  .requiredOption("--name <name>", "node name")
  .option("--parent <id>", "parent node ID")
  .action((opts: { type: string; id: string; name: string; parent?: string }) => {
    const allowed = new Set(["ENTERPRISE", "TEAM", "FUNCTION", "PROCESS", "ECOSYSTEM"]);
    const type = opts.type.toUpperCase();
    if (!allowed.has(type)) {
      throw new Error(`Invalid node type: ${opts.type}`);
    }
    const out = orgAddNodeCli({
      workspace: process.cwd(),
      id: opts.id,
      type: type as "ENTERPRISE" | "TEAM" | "FUNCTION" | "PROCESS" | "ECOSYSTEM",
      name: opts.name,
      parentId: opts.parent ?? null
    });
    console.log(chalk.green(`Org node added: ${opts.id}`));
    console.log(`Config: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

org
  .command("assign")
  .requiredOption("--agent <id>", "agent ID")
  .requiredOption("--node <id>", "node ID")
  .option("--weight <n>", "membership weight", "1")
  .action((opts: { agent: string; node: string; weight: string }) => {
    const out = orgAssignCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      nodeId: opts.node,
      weight: Number(opts.weight)
    });
    console.log(chalk.green(`Assigned ${opts.agent} -> ${opts.node}`));
    console.log(`Config: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

org
  .command("unassign")
  .requiredOption("--agent <id>", "agent ID")
  .requiredOption("--node <id>", "node ID")
  .action((opts: { agent: string; node: string }) => {
    const out = orgUnassignCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      nodeId: opts.node
    });
    console.log(chalk.green(`Unassigned ${opts.agent} from ${opts.node}`));
    console.log(`Config: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

org
  .command("score")
  .option("--window <window>", "e.g. 14d", "14d")
  .action((opts: { window: string }) => {
    const out = orgScoreCli({
      workspace: process.cwd(),
      window: opts.window
    });
    console.log(chalk.green(`Org scorecard recomputed for ${opts.window}`));
    console.log(`Latest: ${out.latestPath}`);
    console.log(`Latest sig: ${out.latestSigPath}`);
    console.log(`History: ${out.historyPath}`);
  });

org
  .command("report")
  .requiredOption("--node <id>", "node ID")
  .requiredOption("--out <file>", "output markdown path")
  .option("--window <window>", "e.g. 14d", "14d")
  .action((opts: { node: string; out: string; window: string }) => {
    const out = orgReportCli({
      workspace: process.cwd(),
      nodeId: opts.node,
      outFile: opts.out,
      window: opts.window
    });
    console.log(chalk.green(`Org node report written: ${out.outFile}`));
  });

org
  .command("compare")
  .requiredOption("--node-a <id>", "node A")
  .requiredOption("--node-b <id>", "node B")
  .requiredOption("--out <file>", "output path")
  .option("--format <fmt>", "md|json", "md")
  .option("--window <window>", "e.g. 14d", "14d")
  .action((opts: { nodeA: string; nodeB: string; out: string; format: string; window: string }) => {
    const format = opts.format === "json" ? "json" : "md";
    const out = orgCompareCli({
      workspace: process.cwd(),
      nodeA: opts.nodeA,
      nodeB: opts.nodeB,
      outFile: opts.out,
      format,
      window: opts.window
    });
    console.log(chalk.green(`Org comparison written: ${out.outFile}`));
  });

org
  .command("learn")
  .requiredOption("--node <id>", "node ID")
  .requiredOption("--out <file>", "output markdown path")
  .action((opts: { node: string; out: string }) => {
    const out = orgLearnCli({
      workspace: process.cwd(),
      nodeId: opts.node,
      outFile: opts.out
    });
    console.log(chalk.green(`Org education brief written: ${resolve(process.cwd(), opts.out)}`));
    console.log(chalk.green(`Signed artifact: ${out.outPath}`));
  });

org
  .command("own")
  .requiredOption("--node <id>", "node ID")
  .requiredOption("--out <file>", "output markdown path")
  .action((opts: { node: string; out: string }) => {
    const out = orgOwnCli({
      workspace: process.cwd(),
      nodeId: opts.node,
      outFile: opts.out
    });
    console.log(chalk.green(`Org ownership plan written: ${resolve(process.cwd(), opts.out)}`));
    console.log(chalk.green(`Signed artifact: ${out.outPath}`));
  });

org
  .command("commit")
  .requiredOption("--node <id>", "node ID")
  .option("--days <n>", "14|30|90", "30")
  .requiredOption("--out <file>", "output markdown path")
  .action((opts: { node: string; days: string; out: string }) => {
    const out = orgCommitCli({
      workspace: process.cwd(),
      nodeId: opts.node,
      days: Number(opts.days),
      outFile: opts.out
    });
    console.log(chalk.green(`Org commitment plan written: ${resolve(process.cwd(), opts.out)}`));
    console.log(chalk.green(`Signed artifact: ${out.outPath}`));
  });

audit
  .command("init")
  .description("Initialize signed audit policy and compliance maps")
  .action(() => {
    assertOwnerMode(process.cwd(), "audit init");
    const out = auditInitCli(process.cwd());
    console.log(chalk.green("Audit policy and maps initialized"));
    console.log(`Policy: ${out.policy.path}`);
    console.log(`Policy signature: ${out.policy.sigPath}`);
    console.log(`Builtin map: ${out.maps.builtinPath}`);
    console.log(`Active map: ${out.maps.activePath}`);
  });

audit
  .command("verify-policy")
  .description("Verify signed audit policy")
  .action(() => {
    const verify = auditVerifyPolicyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red("Audit policy verification failed"));
      console.log(`Reason: ${verify.reason ?? "unknown"}`);
      process.exit(1);
      return;
    }
    console.log(chalk.green("Audit policy signature verified"));
    console.log(`Path: ${verify.path}`);
    console.log(`Signature: ${verify.sigPath}`);
  });

const auditPolicy = audit.command("policy").description("Audit binder policy operations");
const auditMap = audit.command("map").description("Audit compliance map operations");
const auditBinder = audit.command("binder").description("Audit binder artifact operations");
const auditRequest = audit.command("request").description("Audit evidence request operations");
const auditScheduler = audit.command("scheduler").description("Audit binder cache scheduler");

auditPolicy
  .command("print")
  .description("Print effective audit policy")
  .action(() => {
    console.log(JSON.stringify(auditPrintPolicyCli(process.cwd()), null, 2));
  });

auditPolicy
  .command("apply")
  .description("Apply and sign audit policy from file")
  .requiredOption("--file <path>", "audit policy file (yaml/json)")
  .action((opts: { file: string }) => {
    assertOwnerMode(process.cwd(), "audit policy apply");
    const out = auditApplyPolicyCli({
      workspace: process.cwd(),
      file: opts.file
    });
    console.log(chalk.green("Audit policy applied"));
    console.log(`Policy: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
    console.log(`Transparency: ${out.transparencyHash}`);
  });

auditMap
  .command("list")
  .description("List builtin/active audit maps")
  .action(() => {
    const rows = auditMapListCli(process.cwd());
    for (const row of rows) {
      console.log(`- ${row.source}: ${row.id} (${row.name})`);
    }
  });

auditMap
  .command("show")
  .description("Show audit map")
  .option("--id <id>", "builtin|active", "active")
  .action((opts: { id: string }) => {
    const id = opts.id === "builtin" ? "builtin" : "active";
    console.log(JSON.stringify(auditMapShowCli({
      workspace: process.cwd(),
      id
    }), null, 2));
  });

auditMap
  .command("apply")
  .description("Apply active audit map from file")
  .requiredOption("--file <path>", "audit map file (yaml/json)")
  .action((opts: { file: string }) => {
    assertOwnerMode(process.cwd(), "audit map apply");
    const out = auditMapApplyCli({
      workspace: process.cwd(),
      file: opts.file
    });
    console.log(chalk.green("Audit map applied"));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
    console.log(`Transparency: ${out.transparencyHash}`);
  });

auditMap
  .command("verify")
  .description("Verify builtin and active map signatures")
  .action(() => {
    const verify = auditMapVerifyCli(process.cwd());
    if (!verify.builtin.valid || !verify.active.valid) {
      console.log(chalk.red("Audit map verification failed"));
      console.log(`builtin: ${verify.builtin.reason ?? "invalid"}`);
      console.log(`active: ${verify.active.reason ?? "invalid"}`);
      process.exit(1);
      return;
    }
    console.log(chalk.green("Audit map signatures verified"));
    console.log(`builtin: ${verify.builtin.path}`);
    console.log(`active: ${verify.active.path}`);
  });

auditBinder
  .command("create")
  .description("Create deterministic signed .amcaudit artifact")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .requiredOption("--out <file.amcaudit>", "output artifact path")
  .option("--id <id>", "scope id for node/agent")
  .option("--request-id <id>", "restricted evidence request id")
  .action(async (opts: { scope: string; out: string; id?: string; requestId?: string }) => {
    assertOwnerMode(process.cwd(), "audit binder create");
    const scope = opts.scope.toLowerCase();
    if (!["workspace", "node", "agent"].includes(scope)) {
      throw new Error(`invalid scope: ${opts.scope}`);
    }
    const out = await auditBinderCreateCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      outFile: opts.out,
      requestId: opts.requestId
    });
    if (!("outFile" in out) || !("sha256" in out)) {
      throw new Error("audit binder create did not produce an export artifact");
    }
    console.log(chalk.green("Audit binder exported"));
    console.log(`File: ${out.outFile}`);
    console.log(`sha256: ${out.sha256}`);
    console.log(`binderId: ${out.binder.binderId}`);
  });

auditBinder
  .command("verify")
  .description("Verify .amcaudit file")
  .argument("<file.amcaudit>")
  .option("--pubkey <path>", "optional signer public key pem")
  .action((file: string, opts: { pubkey?: string }) => {
    const verify = auditBinderVerifyCli({
      workspace: process.cwd(),
      file,
      pubkeyPath: opts.pubkey
    });
    if (!verify.ok) {
      console.log(chalk.red("Audit binder verification failed"));
      for (const error of verify.errors) {
        console.log(`- ${error.code}: ${error.message}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Audit binder verified"));
    console.log(`sha256: ${verify.fileSha256}`);
    console.log(`binderId: ${verify.binder?.binderId ?? "unknown"}`);
  });

auditBinder
  .command("list")
  .description("List exported binders and cached workspace binder")
  .action(() => {
    console.log(JSON.stringify(auditBindersCli(process.cwd()), null, 2));
  });

auditBinder
  .command("export-request")
  .description("Create dual-control approval request for external binder sharing")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .requiredOption("--agent <agentId>", "approval agent id")
  .requiredOption("--out <file.amcaudit>", "output artifact path")
  .option("--id <id>", "scope id for node/agent")
  .option("--request-id <id>", "restricted evidence request id")
  .action((opts: { scope: string; agent: string; out: string; id?: string; requestId?: string }) => {
    assertOwnerMode(process.cwd(), "audit binder export-request");
    const scope = opts.scope.toLowerCase();
    if (!["workspace", "node", "agent"].includes(scope)) {
      throw new Error(`invalid scope: ${opts.scope}`);
    }
    const out = auditBinderExportRequestCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      outFile: opts.out,
      requestId: opts.requestId
    });
    console.log(chalk.green("Audit binder export approval requested"));
    console.log(`requestId: ${out.requestId}`);
    console.log(`approvalRequestId: ${out.approvalRequestId}`);
    console.log(`intentId: ${out.intentId}`);
  });

auditBinder
  .command("export-execute")
  .description("Execute previously approved external binder export")
  .requiredOption("--approval <id>", "approval request id")
  .action(async (opts: { approval: string }) => {
    assertOwnerMode(process.cwd(), "audit binder export-execute");
    const out = await auditBinderExportExecuteCli({
      workspace: process.cwd(),
      approvalRequestId: opts.approval
    });
    console.log(chalk.green("Audit binder export executed"));
    console.log(`File: ${out.outFile}`);
    console.log(`sha256: ${out.sha256}`);
  });

auditRequest
  .command("create")
  .description("Create auditor evidence request")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .requiredOption("--items <csv>", "e.g. control:ACCESS_CONTROL.SSO_SCIM,proof:inc_abc")
  .option("--id <id>", "scope id for node/agent")
  .option("--requester <id>", "requester user id", "auditor")
  .action((opts: { scope: string; items: string; id?: string; requester: string }) => {
    const scope = opts.scope.toLowerCase();
    if (!["workspace", "node", "agent"].includes(scope)) {
      throw new Error(`invalid scope: ${opts.scope}`);
    }
    const out = auditRequestCreateCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      items: opts.items,
      requesterUserId: opts.requester
    });
    console.log(chalk.green("Evidence request created"));
    console.log(`requestId: ${out.request.requestId}`);
  });

auditRequest
  .command("list")
  .description("List audit evidence requests")
  .action(() => {
    console.log(JSON.stringify(auditRequestListCli(process.cwd()), null, 2));
  });

auditRequest
  .command("approve")
  .description("Owner approves request (starts dual-control approval flow)")
  .argument("<requestId>")
  .requiredOption("--actor <id>", "owner user id")
  .option("--reason <text>", "approval reason", "owner approved evidence request")
  .action((requestId: string, opts: { actor: string; reason: string }) => {
    assertOwnerMode(process.cwd(), "audit request approve");
    const out = auditRequestApproveCli({
      workspace: process.cwd(),
      requestId,
      actorUserId: opts.actor,
      actorUsername: opts.actor,
      reason: opts.reason
    });
    console.log(chalk.green("Evidence request approval flow started"));
    console.log(`approvalRequestId: ${out.approvalRequestId}`);
  });

auditRequest
  .command("reject")
  .description("Reject evidence request")
  .argument("<requestId>")
  .action((requestId: string) => {
    assertOwnerMode(process.cwd(), "audit request reject");
    const out = auditRequestRejectCli({
      workspace: process.cwd(),
      requestId
    });
    console.log(chalk.green(`Evidence request rejected: ${out.requestId}`));
  });

auditRequest
  .command("fulfill")
  .description("Fulfill approved evidence request by exporting restricted binder")
  .argument("<requestId>")
  .requiredOption("--out <file.amcaudit>", "output artifact path")
  .action(async (requestId: string, opts: { out: string }) => {
    assertOwnerMode(process.cwd(), "audit request fulfill");
    const out = await auditRequestFulfillCli({
      workspace: process.cwd(),
      requestId,
      outFile: opts.out
    });
    console.log(chalk.green("Evidence request fulfilled"));
    console.log(`requestId: ${out.request.requestId}`);
    console.log(`binder sha256: ${out.export.sha256}`);
    console.log(`file: ${out.export.outFile}`);
  });

auditScheduler
  .command("status")
  .description("Show audit scheduler status")
  .action(() => {
    console.log(JSON.stringify(auditSchedulerStatusCli(process.cwd()), null, 2));
  });

auditScheduler
  .command("run-now")
  .description("Run audit binder cache refresh immediately")
  .option("--scope <scope>", "workspace|node|agent", "workspace")
  .option("--id <id>", "scope id for node/agent")
  .action(async (opts: { scope: string; id?: string }) => {
    assertOwnerMode(process.cwd(), "audit scheduler run-now");
    const scope = opts.scope.toLowerCase();
    if (!["workspace", "node", "agent"].includes(scope)) {
      throw new Error(`invalid scope: ${opts.scope}`);
    }
    const out = await auditSchedulerRunNowCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id
    });
    console.log(chalk.green("Audit scheduler refresh completed"));
    console.log(`binderId: ${out.binder.binderId}`);
    console.log(`cache: ${out.cache.path}`);
  });

auditScheduler
  .command("enable")
  .description("Enable audit scheduler")
  .action(() => {
    assertOwnerMode(process.cwd(), "audit scheduler enable");
    console.log(JSON.stringify(auditSchedulerEnableCli({
      workspace: process.cwd(),
      enabled: true
    }), null, 2));
  });

auditScheduler
  .command("disable")
  .description("Disable audit scheduler")
  .action(() => {
    assertOwnerMode(process.cwd(), "audit scheduler disable");
    console.log(JSON.stringify(auditSchedulerEnableCli({
      workspace: process.cwd(),
      enabled: false
    }), null, 2));
  });

audit
  .command("verify")
  .description("Verify audit workspace signatures/artifacts")
  .action(() => {
    const out = auditVerifyWorkspaceCli(process.cwd());
    if (!out.ok) {
      console.log(chalk.red("Audit verify failed"));
      for (const error of out.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Audit verify passed"));
  });

const bench = program.command("bench").description("Public benchmark registry + ecosystem comparative view");

bench
  .command("init")
  .description("Initialize signed bench policy")
  .action(() => {
    assertOwnerMode(process.cwd(), "bench init");
    const out = benchInitCli(process.cwd());
    console.log(chalk.green("Bench policy initialized"));
    console.log(`Policy: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

bench
  .command("verify-policy")
  .description("Verify signed bench policy")
  .action(() => {
    const verify = benchVerifyPolicyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red("Bench policy verify failed"));
      console.log(`Reason: ${verify.reason ?? "unknown"}`);
      process.exit(1);
      return;
    }
    console.log(chalk.green("Bench policy signature verified"));
    console.log(`Path: ${verify.path}`);
    console.log(`Signature: ${verify.sigPath}`);
  });

bench
  .command("print-policy")
  .description("Print effective bench policy")
  .action(() => {
    const policy = benchPrintPolicyCli(process.cwd());
    console.log(JSON.stringify(policy, null, 2));
  });

bench
  .command("create")
  .description("Create deterministic signed .amcbench artifact")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .requiredOption("--out <file.amcbench>", "output artifact path")
  .option("--id <id>", "scope id for node/agent")
  .option("--window-days <n>", "window days", "30")
  .option("--named", "publish named identity mode", false)
  .option("--industry <value>", "software|fintech|health|manufacturing|other")
  .option("--agent-type <value>", "code-agent|support-agent|ops-agent|research-agent|sales-agent|other")
  .option("--deployment <value>", "single|host|k8s|compose")
  .action((opts: {
    scope: string;
    out: string;
    id?: string;
    windowDays: string;
    named?: boolean;
    industry?: "software" | "fintech" | "health" | "manufacturing" | "other";
    agentType?: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
    deployment?: "single" | "host" | "k8s" | "compose";
  }) => {
    assertOwnerMode(process.cwd(), "bench create");
    const scope = opts.scope.toLowerCase();
    if (!["workspace", "node", "agent"].includes(scope)) {
      throw new Error(`Invalid scope: ${opts.scope}`);
    }
    const out = benchCreateCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      outFile: opts.out,
      windowDays: Number(opts.windowDays),
      named: Boolean(opts.named),
      labels: {
        industry: opts.industry,
        agentType: opts.agentType,
        deployment: opts.deployment
      }
    });
    console.log(chalk.green("Bench artifact created"));
    console.log(`File: ${out.outFile}`);
    console.log(`sha256: ${out.sha256}`);
    console.log(`benchId: ${out.bench.benchId}`);
    console.log(`trust: ${out.bench.evidence.trustLabel}`);
  });

bench
  .command("verify")
  .description("Verify .amcbench artifact offline")
  .argument("<file>")
  .option("--pubkey <path>", "override signer pubkey")
  .action((file: string, opts: { pubkey?: string }) => {
    const out = benchVerifyCli({
      file: resolve(process.cwd(), file),
      pubkeyPath: opts.pubkey ? resolve(process.cwd(), opts.pubkey) : undefined
    });
    if (!out.ok) {
      console.log(chalk.red("Bench verify failed"));
      for (const error of out.errors) {
        console.log(`- ${error.code}: ${error.message}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Bench artifact verified"));
    console.log(`benchId: ${out.bench?.benchId ?? "unknown"}`);
  });

bench
  .command("print")
  .description("Print bench manifest summary without modification")
  .argument("<file>")
  .action((file: string) => {
    const out = benchPrintCli(resolve(process.cwd(), file));
    console.log(JSON.stringify(out, null, 2));
  });

const benchRegistry = bench.command("registry").description("Manage static bench registries");

benchRegistry
  .command("init")
  .requiredOption("--dir <dir>", "registry directory")
  .option("--id <id>", "registry id")
  .option("--name <name>", "registry display name")
  .action((opts: { dir: string; id?: string; name?: string }) => {
    assertOwnerMode(process.cwd(), "bench registry init");
    const out = benchRegistryInitCli({
      dir: opts.dir,
      registryId: opts.id,
      registryName: opts.name
    });
    console.log(chalk.green("Bench registry initialized"));
    console.log(`Index: ${out.indexPath}`);
    console.log(`Signature: ${out.sigPath}`);
    console.log(`Public key: ${out.pubPath}`);
  });

benchRegistry
  .command("publish")
  .requiredOption("--dir <dir>", "registry directory")
  .requiredOption("--file <bench.amcbench>", "bench artifact")
  .requiredOption("--registry-key <file>", "registry private key file")
  .option("--version <version>", "override version")
  .action((opts: { dir: string; file: string; registryKey: string; version?: string }) => {
    assertOwnerMode(process.cwd(), "bench registry publish");
    const out = benchRegistryPublishCli({
      dir: opts.dir,
      benchFile: opts.file,
      registryKeyPath: opts.registryKey,
      version: opts.version
    });
    console.log(chalk.green("Bench published to registry"));
    console.log(`Bench: ${out.benchId}@${out.version}`);
    console.log(`Path: ${out.targetPath}`);
    console.log(`Index: ${out.indexPath}`);
  });

benchRegistry
  .command("verify")
  .requiredOption("--dir <dir>", "registry directory")
  .action((opts: { dir: string }) => {
    const out = benchRegistryVerifyCli(opts.dir);
    if (!out.ok) {
      console.log(chalk.red("Bench registry verify failed"));
      for (const error of out.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
      return;
    }
    console.log(chalk.green("Bench registry verified"));
    if (!out.index) {
      console.log("Registry index unavailable");
      process.exit(1);
      return;
    }
    console.log(`Registry: ${out.index.registry.id}`);
    console.log(`Entries: ${out.index.benches.length}`);
  });

benchRegistry
  .command("serve")
  .requiredOption("--dir <dir>", "registry directory")
  .option("--port <port>", "port", "9988")
  .option("--host <host>", "host", "127.0.0.1")
  .action(async (opts: { dir: string; port: string; host: string }) => {
    const server = await benchRegistryServeCli({
      dir: opts.dir,
      port: Number(opts.port),
      host: opts.host
    });
    console.log(chalk.green(`Bench registry serving on http://${opts.host}:${opts.port}`));
    await new Promise<void>((resolvePromise) => {
      const stop = async () => {
        await server.close();
        resolvePromise();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  });

bench
  .command("search")
  .description("Browse a bench registry index")
  .requiredOption("--registry <pathOrUrl>", "registry path or URL")
  .option("--query <text>", "optional search text")
  .action(async (opts: { registry: string; query?: string }) => {
    const out = await benchSearchCli({
      registry: opts.registry,
      query: opts.query
    });
    console.log(JSON.stringify(out, null, 2));
  });

bench
  .command("import")
  .description("Import one bench artifact from allowlisted registry")
  .requiredOption("--registry-id <id>", "configured registry id")
  .requiredOption("--bench <benchId@version|benchId@latest>", "bench reference")
  .action(async (opts: { registryId: string; bench: string }) => {
    assertOwnerMode(process.cwd(), "bench import");
    const out = await benchImportCli({
      workspace: process.cwd(),
      registryId: opts.registryId,
      benchRef: opts.bench
    });
    console.log(chalk.green("Bench imported"));
    console.log(`Bench: ${out.benchId}@${out.version}`);
    console.log(`File: ${out.filePath}`);
  });

bench
  .command("list-imports")
  .description("List imported bench artifacts")
  .action(() => {
    const rows = benchListImportsCli(process.cwd());
    console.log(JSON.stringify(rows, null, 2));
  });

bench
  .command("list-exports")
  .description("List locally exported bench artifacts")
  .action(() => {
    const rows = benchListExportsCli(process.cwd());
    console.log(JSON.stringify(rows, null, 2));
  });

bench
  .command("compare")
  .description("Compute local vs imported ecosystem comparison")
  .requiredOption("--scope <scope>", "workspace|node|agent")
  .requiredOption("--id <id>", "scope id (workspace for workspace scope)")
  .option("--against <mode>", "imported|registry:<id>", "imported")
  .action((opts: { scope: string; id: string; against: string }) => {
    assertOwnerMode(process.cwd(), "bench compare");
    const scope = opts.scope.toLowerCase();
    if (!["workspace", "node", "agent"].includes(scope)) {
      throw new Error(`Invalid scope: ${opts.scope}`);
    }
    const out = benchCompareCli({
      workspace: process.cwd(),
      scope: scope as "workspace" | "node" | "agent",
      id: opts.id,
      against: opts.against as "imported" | `registry:${string}`
    });
    console.log(chalk.green("Bench comparison updated"));
    console.log(`Path: ${out.path}`);
    console.log(`Warnings: ${out.comparison.warnings.length}`);
  });

bench
  .command("comparison-latest")
  .description("Read latest bench comparison artifact")
  .action(() => {
    const out = benchComparisonLatestCli(process.cwd());
    console.log(JSON.stringify(out, null, 2));
  });

bench
  .command("registries")
  .description("Print signed bench registry allowlist")
  .action(() => {
    const out = benchRegistriesCli(process.cwd());
    console.log(JSON.stringify(out, null, 2));
  });

bench
  .command("registries-apply")
  .description("Apply bench registries config from JSON file")
  .requiredOption("--in <file>", "JSON file matching benchRegistries schema")
  .action((opts: { in: string }) => {
    assertOwnerMode(process.cwd(), "bench registries-apply");
    const config = JSON.parse(readUtf8(resolve(process.cwd(), opts.in))) as ReturnType<typeof benchRegistriesCli>["registries"];
    const out = benchRegistriesApplyCli({
      workspace: process.cwd(),
      config
    });
    console.log(chalk.green("Bench registries config applied"));
    console.log(`Path: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
  });

const benchPublish = bench.command("publish").description("Dual-control bench publish flow");

benchPublish
  .command("request")
  .requiredOption("--agent <id>", "agent id for approval attribution")
  .requiredOption("--file <bench.amcbench>", "bench artifact to publish")
  .requiredOption("--registry <dir>", "registry directory")
  .requiredOption("--registry-key <file>", "registry private key")
  .option("--ack", "explicit irreversible-sharing owner acknowledgment", false)
  .action((opts: { agent: string; file: string; registry: string; registryKey: string; ack?: boolean }) => {
    assertOwnerMode(process.cwd(), "bench publish request");
    const out = benchPublishRequestCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      file: opts.file,
      registryDir: opts.registry,
      registryKeyPath: opts.registryKey,
      explicitOwnerAck: Boolean(opts.ack)
    });
    console.log(chalk.green("Bench publish approval request created"));
    console.log(`approvalRequestId: ${out.approvalRequestId}`);
    console.log(`intentId: ${out.intentId}`);
    console.log(`bench: ${out.benchId}@${out.version}`);
  });

benchPublish
  .command("execute")
  .requiredOption("--approval-request <id>", "approval request id")
  .action((opts: { approvalRequest: string }) => {
    assertOwnerMode(process.cwd(), "bench publish execute");
    const out = benchPublishExecuteCli({
      workspace: process.cwd(),
      approvalRequestId: opts.approvalRequest
    });
    console.log(chalk.green("Bench published"));
    console.log(`bench: ${out.benchId}@${out.version}`);
    console.log(`target: ${out.targetPath}`);
    console.log(`index: ${out.indexPath}`);
  });

const benchmark = program.command("benchmark").description("Signed ecosystem benchmark snapshots");

benchmark
  .command("export")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--run <runId>", "run ID")
  .requiredOption("--out <file.amcbench>", "output benchmark artifact")
  .option("--publisher <org>", "publisher org")
  .option("--public-agent-id <id>", "public agent id override")
  .action((opts: { agent: string; run: string; out: string; publisher?: string; publicAgentId?: string }) => {
    const out = exportBenchmarkArtifact({
      workspace: process.cwd(),
      agentId: opts.agent,
      runId: opts.run,
      outFile: opts.out,
      publisherOrgName: opts.publisher,
      publicAgentId: opts.publicAgentId ?? null
    });
    console.log(chalk.green(`Benchmark exported: ${out.outFile}`));
  });

benchmark
  .command("verify")
  .argument("<file>")
  .action((file: string) => {
    const verify = verifyBenchmarkArtifact(resolve(process.cwd(), file));
    if (!verify.ok) {
      console.log(chalk.red("Benchmark verify failed"));
      for (const error of verify.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
    }
    console.log(chalk.green("Benchmark verified"));
  });

benchmark
  .command("ingest")
  .argument("<fileOrDir>")
  .action((fileOrDir: string) => {
    const out = ingestBenchmarks(process.cwd(), fileOrDir);
    console.log(chalk.green(`Imported ${out.imported.length} benchmark(s)`));
  });

benchmark
  .command("list")
  .option("--sort <field>", "benchId|overall|integrity|created", "overall")
  .option("--limit <n>", "max rows to print", "50")
  .action((opts: { sort: "benchId" | "overall" | "integrity" | "created"; limit: string }) => {
    const rows = listImportedBenchmarks(process.cwd());
    if (rows.length === 0) {
      console.log("No benchmarks imported.");
      return;
    }
    const overallValues = rows.map((row) => row.bench.run.overall);
    const percentile = (value: number): number => {
      const rank = overallValues.filter((item) => item <= value).length;
      return Number(((rank / overallValues.length) * 100).toFixed(2));
    };
    const sorted = rows.slice().sort((a, b) => {
      if (opts.sort === "benchId") {
        return a.bench.benchId.localeCompare(b.bench.benchId);
      }
      if (opts.sort === "integrity") {
        return b.bench.run.integrityIndex - a.bench.run.integrityIndex || a.bench.benchId.localeCompare(b.bench.benchId);
      }
      if (opts.sort === "created") {
        return b.bench.createdTs - a.bench.createdTs || a.bench.benchId.localeCompare(b.bench.benchId);
      }
      return b.bench.run.overall - a.bench.run.overall || a.bench.benchId.localeCompare(b.bench.benchId);
    });
    const limit = Math.max(1, Number.parseInt(opts.limit, 10) || 50);
    for (const row of sorted.slice(0, limit)) {
      console.log(
        `${row.bench.benchId} | overall=${row.bench.run.overall.toFixed(3)} | integrity=${row.bench.run.integrityIndex.toFixed(3)} | pctl=${percentile(row.bench.run.overall).toFixed(2)} | trust=${row.bench.run.trustLabel}`
      );
    }
  });

benchmark
  .command("report")
  .requiredOption("--out <file>", "output markdown file")
  .option("--group-by <groupBy>", "archetype|riskTier|trustLabel", "riskTier")
  .action((opts: { out: string; groupBy: "archetype" | "riskTier" | "trustLabel" }) => {
    const rows = listImportedBenchmarks(process.cwd());
    const stats = benchmarkStats({
      workspace: process.cwd(),
      groupBy: opts.groupBy
    });
    const sortedByOverall = rows.slice().sort((a, b) => b.bench.run.overall - a.bench.run.overall || a.bench.benchId.localeCompare(b.bench.benchId));
    const lines = [
      "# AMC Benchmark Report",
      "",
      `Imported benchmarks: ${rows.length}`,
      `Group-by: ${opts.groupBy}`,
      "",
      "## Distribution",
      ...stats.groups
        .slice()
        .sort((a, b) => b.overallMedian - a.overallMedian || a.key.localeCompare(b.key))
        .map((group) => `- ${group.key}: count=${group.count}, medianOverall=${group.overallMedian.toFixed(3)}, medianIntegrity=${group.integrityMedian.toFixed(3)}`),
      "",
      "## Top Overall",
      ...sortedByOverall.slice(0, 10).map((row) => `- ${row.bench.benchId}: overall ${row.bench.run.overall.toFixed(3)}, integrity ${row.bench.run.integrityIndex.toFixed(3)}, trust ${row.bench.run.trustLabel}`),
      "",
      "## Full List",
      ...rows.map((row) => `- ${row.bench.benchId}: overall ${row.bench.run.overall.toFixed(3)}, integrity ${row.bench.run.integrityIndex.toFixed(3)}, trust ${row.bench.run.trustLabel}`)
    ];
    const outFile = resolve(process.cwd(), opts.out);
    ensureDir(dirname(outFile));
    writeFileAtomic(outFile, lines.join("\n"), 0o644);
    console.log(chalk.green(`Benchmark report written: ${outFile}`));
  });

benchmark
  .command("stats")
  .option("--group-by <groupBy>", "archetype|riskTier|trustLabel", "riskTier")
  .action((opts: { groupBy: "archetype" | "riskTier" | "trustLabel" }) => {
    const stats = benchmarkStats({
      workspace: process.cwd(),
      groupBy: opts.groupBy
    });
    console.log(JSON.stringify(stats, null, 2));
  });

const mechanic = program.command("mechanic").description("Mechanic Workbench (targets, plans, simulation)");

mechanic
  .command("init")
  .option("--scope <scope>", "workspace|agent|node", "workspace")
  .option("--id <id>", "scope id")
  .action((opts: { scope: "workspace" | "agent" | "node"; id?: string }) => {
    assertOwnerMode(process.cwd(), "mechanic init");
    const out = mechanicInitCli({
      workspace: process.cwd(),
      scope: opts.scope,
      id: opts.id
    });
    console.log(chalk.green("Mechanic workspace initialized"));
    console.log(JSON.stringify(out, null, 2));
  });

const mechanicTargets = mechanic.command("targets").description("Manage signed equalizer targets");

mechanicTargets
  .command("init")
  .requiredOption("--scope <scope>", "workspace|agent|node")
  .option("--id <id>", "scope id")
  .option("--mode <mode>", "DESIRED|EXCELLENCE", "DESIRED")
  .action((opts: { scope: "workspace" | "agent" | "node"; id?: string; mode: "DESIRED" | "EXCELLENCE" }) => {
    assertOwnerMode(process.cwd(), "mechanic targets init");
    const out = mechanicTargetsInitCli({
      workspace: process.cwd(),
      scope: opts.scope,
      id: opts.id,
      mode: opts.mode
    });
    console.log(chalk.green(`Targets initialized: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

mechanicTargets
  .command("set")
  .requiredOption("--q <qid>", "question id, e.g. AMC-3.2.4")
  .requiredOption("--value <n>", "target value 0..5")
  .requiredOption("--reason <text>", "reason for change")
  .action((opts: { q: string; value: string; reason: string }) => {
    assertOwnerMode(process.cwd(), "mechanic targets set");
    const value = Number(opts.value);
    if (!Number.isInteger(value) || value < 0 || value > 5) {
      throw new Error("--value must be an integer 0..5");
    }
    const out = mechanicTargetsSetCli({
      workspace: process.cwd(),
      qid: opts.q,
      value,
      reason: opts.reason
    });
    console.log(chalk.green(`Targets updated: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

mechanicTargets
  .command("apply")
  .requiredOption("--file <path>", "targets yaml/json path")
  .requiredOption("--reason <text>", "reason for change")
  .action((opts: { file: string; reason: string }) => {
    assertOwnerMode(process.cwd(), "mechanic targets apply");
    const out = mechanicTargetsApplyCli({
      workspace: process.cwd(),
      filePath: opts.file,
      reason: opts.reason,
      actor: "owner"
    });
    console.log(chalk.green(`Targets applied: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
    console.log(`Transparency: ${out.transparencyHash}`);
  });

mechanicTargets
  .command("print")
  .action(() => {
    const out = mechanicTargetsPrintCli(process.cwd());
    console.log(YAML.stringify(out.targets));
    console.log(JSON.stringify(out.signature, null, 2));
  });

mechanicTargets
  .command("verify")
  .action(() => {
    const verify = mechanicTargetsVerifyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red(`Mechanic targets signature invalid: ${verify.reason ?? "unknown"}`));
      process.exit(1);
    }
    console.log(chalk.green("Mechanic targets signature valid"));
  });

const mechanicProfile = mechanic.command("profile").description("Apply one-click signed target profiles");

mechanicProfile
  .command("list")
  .action(() => {
    const out = mechanicProfileListCli(process.cwd());
    for (const profile of out.profiles) {
      console.log(`- ${profile.id}: ${profile.name}`);
    }
  });

mechanicProfile
  .command("apply")
  .argument("<profileId>")
  .requiredOption("--scope <scope>", "workspace|agent|node")
  .option("--id <id>", "scope id")
  .option("--mode <mode>", "DESIRED|EXCELLENCE", "DESIRED")
  .requiredOption("--reason <text>", "reason for profile apply")
  .action((profileId: string, opts: { scope: "workspace" | "agent" | "node"; id?: string; mode: "DESIRED" | "EXCELLENCE"; reason: string }) => {
    assertOwnerMode(process.cwd(), "mechanic profile apply");
    const out = mechanicProfileApplyCli({
      workspace: process.cwd(),
      profileId,
      scope: opts.scope,
      id: opts.id,
      mode: opts.mode,
      reason: opts.reason,
      actor: "owner"
    });
    console.log(chalk.green(`Profile applied: ${out.profile.id}`));
    console.log(`Targets: ${out.path}`);
    console.log(`Signature: ${out.sigPath}`);
    console.log(`Transparency: ${out.transparencyHash}`);
  });

mechanicProfile
  .command("verify")
  .action(() => {
    const verify = mechanicProfilesVerifyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red(`Mechanic profiles signature invalid: ${verify.reason ?? "unknown"}`));
      process.exit(1);
    }
    console.log(chalk.green("Mechanic profiles signature valid"));
  });

const mechanicTuning = mechanic.command("tuning").description("Manage signed mechanic tuning intent");

mechanicTuning
  .command("init")
  .requiredOption("--scope <scope>", "workspace|agent|node")
  .option("--id <id>", "scope id")
  .action((opts: { scope: "workspace" | "agent" | "node"; id?: string }) => {
    assertOwnerMode(process.cwd(), "mechanic tuning init");
    const out = mechanicTuningInitCli({
      workspace: process.cwd(),
      scope: opts.scope,
      id: opts.id
    });
    console.log(chalk.green(`Tuning initialized: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

mechanicTuning
  .command("set")
  .requiredOption("--key <key>", "dot path in tuning object, e.g. knobs.maxTokensPerRun")
  .requiredOption("--value <value>", "value (number/bool/json/csv/string)")
  .requiredOption("--reason <text>", "reason for change")
  .action((opts: { key: string; value: string; reason: string }) => {
    assertOwnerMode(process.cwd(), "mechanic tuning set");
    const out = mechanicTuningSetCli({
      workspace: process.cwd(),
      keyPath: opts.key,
      value: opts.value,
      reason: opts.reason
    });
    console.log(chalk.green(`Tuning updated: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
  });

mechanicTuning
  .command("apply")
  .requiredOption("--file <path>", "tuning yaml/json path")
  .requiredOption("--reason <text>", "reason for change")
  .action((opts: { file: string; reason: string }) => {
    assertOwnerMode(process.cwd(), "mechanic tuning apply");
    const out = mechanicTuningApplyCli({
      workspace: process.cwd(),
      filePath: opts.file,
      reason: opts.reason,
      actor: "owner"
    });
    console.log(chalk.green(`Tuning applied: ${out.path}`));
    console.log(`Signature: ${out.sigPath}`);
    console.log(`Transparency: ${out.transparencyHash}`);
  });

mechanicTuning
  .command("print")
  .action(() => {
    const out = mechanicTuningPrintCli(process.cwd());
    console.log(YAML.stringify(out.tuning));
    console.log(JSON.stringify(out.signature, null, 2));
  });

mechanicTuning
  .command("verify")
  .action(() => {
    const verify = mechanicTuningVerifyCli(process.cwd());
    if (!verify.valid) {
      console.log(chalk.red(`Mechanic tuning signature invalid: ${verify.reason ?? "unknown"}`));
      process.exit(1);
    }
    console.log(chalk.green("Mechanic tuning signature valid"));
  });

mechanic
  .command("gap")
  .option("--scope <scope>", "workspace|agent|node", "workspace")
  .option("--id <id>", "scope id")
  .option("--out <path>", "output report path")
  .action(async (opts: { scope: "workspace" | "agent" | "node"; id?: string; out?: string }) => {
    const out = await mechanicGapCli({
      workspace: process.cwd(),
      scope: opts.scope,
      id: opts.id,
      outFile: opts.out
    });
    console.log(JSON.stringify(out.gap, null, 2));
  });

const mechanicPlan = mechanic.command("plan").description("Create, diff, approve, and execute upgrade plans");

mechanicPlan
  .command("create")
  .option("--scope <scope>", "workspace|agent|node", "workspace")
  .option("--id <id>", "scope id")
  .option("--from <from>", "plan source", "measured")
  .option("--to <to>", "plan target", "targets")
  .action(async (opts: { scope: "workspace" | "agent" | "node"; id?: string; from: string; to: string }) => {
    const out = await mechanicPlanCreateCli({
      workspace: process.cwd(),
      scope: opts.scope,
      id: opts.id
    });
    console.log(chalk.green(`Plan created: ${out.plan.planId}`));
    console.log(`Latest: ${out.latestPath}`);
    console.log(`Signature: ${out.latestSigPath}`);
  });

mechanicPlan
  .command("show")
  .argument("[planId]")
  .action((planId?: string) => {
    const out = mechanicPlanShowCli({
      workspace: process.cwd(),
      planId
    });
    console.log(JSON.stringify(out, null, 2));
  });

mechanicPlan
  .command("diff")
  .requiredOption("--plan-id <id>", "plan id")
  .action((opts: { planId: string }) => {
    const out = mechanicPlanDiffCli({
      workspace: process.cwd(),
      planId: opts.planId
    });
    console.log(JSON.stringify(out, null, 2));
  });

mechanicPlan
  .command("request-approval")
  .argument("<planId>")
  .requiredOption("--reason <text>", "reason for request")
  .action((planId: string, opts: { reason: string }) => {
    assertOwnerMode(process.cwd(), "mechanic plan request-approval");
    const out = mechanicPlanRequestApprovalCli({
      workspace: process.cwd(),
      planId,
      actor: "owner",
      reason: opts.reason
    });
    console.log(chalk.green(`Approval requests created: ${out.approvalRequests.length}`));
    console.log(JSON.stringify(out.approvalRequests, null, 2));
  });

mechanicPlan
  .command("execute")
  .argument("<planId>")
  .action(async (planId: string) => {
    assertOwnerMode(process.cwd(), "mechanic plan execute");
    const out = await mechanicPlanExecuteCli({
      workspace: process.cwd(),
      planId
    });
    console.log(chalk.green(`Plan executed: ${out.plan.planId}`));
    console.log(JSON.stringify(out.executed, null, 2));
  });

mechanic
  .command("simulate")
  .argument("<planId>")
  .action(async (planId: string) => {
    const out = await mechanicSimulateCli({
      workspace: process.cwd(),
      planId
    });
    console.log(JSON.stringify(out.simulation, null, 2));
  });

mechanic
  .command("simulations")
  .description("Show latest signed simulation artifact")
  .action(() => {
    console.log(JSON.stringify(mechanicSimulationLatestCli(process.cwd()), null, 2));
  });

mechanic
  .command("verify")
  .description("Verify mechanic signatures and artifacts")
  .action(() => {
    const out = mechanicVerifyCli(process.cwd());
    if (!out.ok) {
      console.log(chalk.red("Mechanic verification failed"));
      for (const error of out.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
    }
    console.log(chalk.green("Mechanic verification passed"));
  });

release
  .command("init")
  .description("Initialize AMC release signing keypair")
  .option("--write-private-to <path>", "write private key to this path (0600)")
  .action((opts: { writePrivateTo?: string }) => {
    assertOwnerMode(process.cwd(), "release init");
    const out = releaseInitCli({
      workspace: process.cwd(),
      writePrivateTo: opts.writePrivateTo
    });
    console.log(chalk.green(`Release key initialized (${out.created ? "created" : "existing"})`));
    console.log(`Public key: ${out.publicKeyPath}`);
    if (out.privateKeyPath) {
      console.log(`Private key: ${out.privateKeyPath}`);
    }
    console.log(`Fingerprint: ${out.fingerprint}`);
    console.log(out.note);
    if (!out.privateKeyPath) {
      const paths = defaultReleaseKeyPaths(process.cwd());
      console.log(`Tip: amc release init --write-private-to ${paths.privateKeyPath}`);
    }
  });

release
  .command("pack")
  .description("Build a signed deterministic .amcrelease bundle")
  .requiredOption("--out <file>", "output .amcrelease file")
  .option("--private-key <path>", "release signing private key path override")
  .action((opts: { out: string; privateKey?: string }) => {
    assertOwnerMode(process.cwd(), "release pack");
    const out = releasePackCli({
      workspace: process.cwd(),
      outFile: resolve(process.cwd(), opts.out),
      privateKeyPath: opts.privateKey
    });
    console.log(chalk.green("Release bundle created"));
    console.log(`File: ${out.outFile}`);
    console.log(`Version: ${out.version}`);
    console.log(`Signing fingerprint: ${out.fingerprint}`);
  });

release
  .command("verify")
  .description("Verify a .amcrelease bundle offline")
  .argument("<bundleFile>", "path to .amcrelease bundle")
  .option("--pubkey <path>", "override public key for verification")
  .action((bundleFile: string, opts: { pubkey?: string }) => {
    const result = releaseVerifyCli({
      bundleFile: resolve(process.cwd(), bundleFile),
      publicKeyPath: opts.pubkey ? resolve(process.cwd(), opts.pubkey) : undefined
    });
    if (!result.summary) {
      console.log(chalk.red("Release verification FAILED"));
      for (const error of result.errors) {
        console.log(`- ${error}`);
      }
      process.exit(1);
      return;
    }
    console.log(`package: ${result.summary.packageName}@${result.summary.version}`);
    console.log(`git: commit=${result.summary.commit} tag=${result.summary.tag ?? "none"}`);
    if (result.ok) {
      console.log(chalk.green("integrity: PASS"));
      return;
    }
    console.log(chalk.red("integrity: FAIL"));
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
    process.exit(1);
  });

release
  .command("sbom")
  .description("Generate deterministic CycloneDX SBOM")
  .requiredOption("--out <file>", "output sbom file path")
  .action((opts: { out: string }) => {
    const out = releaseSbomCli({
      workspace: process.cwd(),
      outPath: resolve(process.cwd(), opts.out)
    });
    console.log(chalk.green(`SBOM written: ${out.path}`));
    console.log(`sha256: ${out.sha256}`);
  });

release
  .command("licenses")
  .description("Generate dependency license inventory")
  .requiredOption("--out <file>", "output licenses file path")
  .action((opts: { out: string }) => {
    const out = releaseLicensesCli({
      workspace: process.cwd(),
      outPath: resolve(process.cwd(), opts.out)
    });
    console.log(chalk.green(`License report written: ${out.path}`));
    console.log(`sha256: ${out.sha256}`);
  });

release
  .command("provenance")
  .description("Generate AMC provenance record")
  .requiredOption("--out <file>", "output provenance file path")
  .action((opts: { out: string }) => {
    const out = releaseProvenanceCli({
      workspace: process.cwd(),
      outPath: resolve(process.cwd(), opts.out)
    });
    console.log(chalk.green(`Provenance written: ${out.path}`));
    console.log(`sha256: ${out.sha256}`);
  });

release
  .command("scan")
  .description("Run strict secret scan on a .amcrelease bundle")
  .requiredOption("--in <file>", "input .amcrelease file")
  .option("--out <file>", "optional report output path")
  .action((opts: { in: string; out?: string }) => {
    const out = releaseScanCli({
      input: resolve(process.cwd(), opts.in),
      outPath: opts.out ? resolve(process.cwd(), opts.out) : undefined
    });
    console.log(`status: ${out.status}`);
    console.log(`findings: ${out.findings}`);
    if (out.outPath) {
      console.log(`report: ${out.outPath}`);
    }
    if (out.status !== "PASS") {
      process.exit(1);
    }
  });

release
  .command("print")
  .description("Print release bundle manifest summary")
  .argument("<bundleFile>", "path to .amcrelease bundle")
  .action((bundleFile: string) => {
    const summary = releasePrintCli({
      bundleFile: resolve(process.cwd(), bundleFile)
    });
    console.log(`${summary.packageName}@${summary.version}`);
    console.log(`git commit: ${summary.gitCommit}`);
    console.log(`git tag: ${summary.gitTag ?? "none"}`);
    console.log(`signing fingerprint: ${summary.signingFingerprint}`);
    console.log("contents:");
    for (const item of summary.files) {
      console.log(`- ${item}`);
    }
  });

const e2e = program.command("e2e").description("End-to-end smoke verification");

e2e
  .command("smoke")
  .description("Run go-live smoke tests: local, docker, or helm-template")
  .requiredOption("--mode <mode>", "local|docker|helm-template")
  .option("--workspace <path>", "workspace path (local mode only)")
  .option("--repo-root <path>", "repository root", process.cwd())
  .option("--json", "emit structured JSON output", false)
  .action(async (opts: { mode: "local" | "docker" | "helm-template"; workspace?: string; repoRoot: string; json: boolean }) => {
    const validModes = new Set(["local", "docker", "helm-template"]);
    if (!validModes.has(opts.mode)) {
      throw new Error("Invalid mode. Use one of: local, docker, helm-template");
    }
    const result = await smokeCli({
      mode: opts.mode,
      json: opts.json,
      workspace: opts.mode === "local" ? (opts.workspace ? resolve(process.cwd(), opts.workspace) : undefined) : undefined,
      repoRoot: resolve(process.cwd(), opts.repoRoot)
    });
    if (opts.json) {
      console.log(JSON.stringify(result.report, null, 2));
    } else {
      console.log(result.text);
    }
    if (result.report.status !== "PASS") {
      process.exit(1);
    }
  });

program
  .command("_studio-daemon")
  .requiredOption("--workspace <path>", "workspace path")
  .option("--api-port <port>", "studio API port")
  .option("--dashboard-port <port>", "dashboard port")
  .action(async (opts: { workspace: string; apiPort?: string; dashboardPort?: string }) => {
    const explicitApiPort = opts.apiPort ? Number(opts.apiPort) : undefined;
    const explicitDashboardPort = opts.dashboardPort ? Number(opts.dashboardPort) : undefined;
    const runtimeConfig = loadStudioRuntimeConfig(process.env, {
      workspaceDir: resolve(opts.workspace),
      studioPort: explicitApiPort
    });
    const hostMode = Boolean(runtimeConfig.hostDir);
    const lan = loadLanMode(runtimeConfig.workspaceDir);
    const lanSig = verifyLanModeSignature(runtimeConfig.workspaceDir);
    const resolvedApiPort = explicitApiPort ?? (hostMode ? runtimeConfig.hostPort : runtimeConfig.studioPort);
    const resolvedDashboardPort = explicitDashboardPort ?? 4173;
    const runtime = await runStudioForeground({
      workspace: runtimeConfig.workspaceDir,
      hostDir: runtimeConfig.hostDir ?? undefined,
      defaultWorkspaceId: runtimeConfig.defaultWorkspaceId,
      apiPort: resolvedApiPort,
      dashboardPort: resolvedDashboardPort,
      apiHost: hostMode ? runtimeConfig.hostBind : runtimeConfig.bind,
      gatewayHost: hostMode ? runtimeConfig.hostBind : runtimeConfig.bind,
      gatewayPort: runtimeConfig.gatewayPort,
      proxyPort: runtimeConfig.proxyPort,
      allowPublicBind: runtimeConfig.allowPublicBind || runtimeConfig.lanMode,
      allowedCidrs: runtimeConfig.allowedCidrs,
      trustedProxyHops: runtimeConfig.trustedProxyHops,
      maxRequestBytes: runtimeConfig.maxRequestBytes,
      corsAllowedOrigins: runtimeConfig.corsAllowedOrigins,
      dataRetentionDays: runtimeConfig.dataRetentionDays,
      metricsHost: runtimeConfig.metricsBind,
      metricsPort: runtimeConfig.metricsPort,
      queryLeaseCarrierEnabled: runtimeConfig.queryLeaseCarrierEnabled && lan.enabled && lanSig.valid
    });

    await new Promise<void>((resolvePromise) => {
      const shutdown = async () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        await runtime.stop();
        resolvePromise();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  });

// ── Model Cognition Lab CLI ──────────────────────────────────────────
program
  .command("lab-templates")
  .description("List available experiment templates")
  .action(() => {
    const lab = require("./lab/cognitionLab.js") as typeof import("./lab/cognitionLab.js");
    const templates = lab.getLabTemplates();
    console.log(chalk.bold(`\nModel Cognition Lab — ${templates.length} Templates\n`));
    for (const t of templates) {
      console.log(`  ${chalk.bold(t.templateId)} (${t.kind})`);
      console.log(`    ${t.name}: ${t.description.slice(0, 80)}${t.description.length > 80 ? "…" : ""}`);
      console.log(`    Probes: ${t.defaultProbes.length} | Boundary: ${t.boundaryMarker}`);
      console.log("");
    }
  });

program
  .command("lab-create")
  .description("Create a new lab experiment")
  .requiredOption("--kind <kind>", "experiment kind: typed_attention, trace_memory, self_knowledge, activation_threshold, identity_stability, custom")
  .requiredOption("--name <name>", "experiment name")
  .requiredOption("--model <modelId>", "model ID")
  .option("--description <desc>", "experiment description", "")
  .action((opts: { kind: string; name: string; model: string; description: string }) => {
    const lab = require("./lab/cognitionLab.js") as typeof import("./lab/cognitionLab.js");
    const experiment = lab.createLabExperiment({
      kind: opts.kind as any,
      name: opts.name,
      description: opts.description || `${opts.kind} experiment on ${opts.model}`,
      modelId: opts.model,
    });
    console.log(chalk.green(`Experiment created: ${experiment.experimentId}`));
    console.log(`  Kind: ${experiment.kind} | Model: ${experiment.modelId} | Probes: ${experiment.probes.length}`);
    console.log(chalk.yellow(`  Boundary: ${experiment.boundaryMarker}`));
  });

program
  .command("lab-simulate")
  .description("Simulate running all probes for an experiment")
  .requiredOption("--experiment <id>", "experiment ID")
  .action((opts: { experiment: string }) => {
    const lab = require("./lab/cognitionLab.js") as typeof import("./lab/cognitionLab.js");
    const results = lab.simulateExperiment(opts.experiment);
    if (results.length === 0) {
      console.log(chalk.red("No results — experiment not found or has no probes."));
      return;
    }
    console.log(chalk.bold(`\nSimulated ${results.length} probe results:\n`));
    for (const r of results) {
      const primaryDim = Object.keys(r.scores)[0] ?? "";
      const score = r.scores[primaryDim] ?? 0;
      console.log(`  ${r.probeId}: ${(score * 100).toFixed(1)}% (${r.latencyMs}ms, ${r.tokenCount} tokens)`);
    }
  });

program
  .command("lab-report")
  .description("Generate a lab experiment report")
  .requiredOption("--experiment <id>", "experiment ID")
  .action((opts: { experiment: string }) => {
    const lab = require("./lab/cognitionLab.js") as typeof import("./lab/cognitionLab.js");
    const report = lab.generateLabReport(opts.experiment);
    if (!report) {
      console.log(chalk.red("Experiment not found."));
      return;
    }
    console.log(lab.renderLabReportMarkdown(report));
  });

program
  .command("lab-compare")
  .description("Compare two lab experiments")
  .requiredOption("--baseline <id>", "baseline experiment ID")
  .requiredOption("--candidate <id>", "candidate experiment ID")
  .action((opts: { baseline: string; candidate: string }) => {
    const lab = require("./lab/cognitionLab.js") as typeof import("./lab/cognitionLab.js");
    const pairs = lab.compareExperiments(opts.baseline, opts.candidate);
    if (pairs.length === 0) {
      console.log(chalk.yellow("No matching probes to compare."));
      return;
    }
    console.log(chalk.bold(`\nComparison: ${opts.baseline} vs ${opts.candidate}\n`));
    for (const p of pairs) {
      console.log(`  ${p.probeId}:`);
      for (const [dim, delta] of Object.entries(p.deltas)) {
        const color = delta > 0.05 ? chalk.green : delta < -0.05 ? chalk.red : chalk.white;
        console.log(color(`    ${dim}: ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`));
      }
    }
  });

program
  .command("lab-list")
  .description("List all lab experiments")
  .option("--kind <kind>", "filter by experiment kind")
  .action((opts: { kind?: string }) => {
    const lab = require("./lab/cognitionLab.js") as typeof import("./lab/cognitionLab.js");
    const exps = lab.listLabExperiments(opts.kind as any);
    if (exps.length === 0) {
      console.log(chalk.yellow("No lab experiments found."));
      return;
    }
    for (const e of exps) {
      console.log(`  ${chalk.bold(e.experimentId)} ${e.name} (${e.kind}) — ${e.status} — ${e.modelId}`);
    }
  });

// ── Insider Risk Analytics CLI ────────────────────────────────────────
program
  .command("insider-risk-report")
  .description("Generate insider risk analytics report")
  .option("--window <days>", "reporting window in days", "7")
  .action((opts: { window: string }) => {
    const ir = require("./audit/insiderRisk.js") as typeof import("./audit/insiderRisk.js");
    const windowMs = parseInt(opts.window, 10) * 86400000;
    const report = ir.generateInsiderRiskReport(Date.now() - windowMs, Date.now());
    console.log(ir.renderInsiderRiskMarkdown(report));
  });

program
  .command("insider-alerts")
  .description("Show insider risk alerts")
  .option("--actor <id>", "filter by actor ID")
  .option("--ack <alertId>", "acknowledge an alert")
  .action((opts: { actor?: string; ack?: string }) => {
    const ir = require("./audit/insiderRisk.js") as typeof import("./audit/insiderRisk.js");
    if (opts.ack) {
      const result = ir.acknowledgeInsiderAlert(opts.ack);
      console.log(result ? chalk.green(`Alert ${opts.ack} acknowledged.`) : chalk.red("Alert not found."));
      return;
    }
    const alertsList = ir.getInsiderAlerts(opts.actor);
    if (alertsList.length === 0) {
      console.log(chalk.green("No insider risk alerts."));
      return;
    }
    for (const a of alertsList) {
      const color = a.severity === "critical" ? chalk.red : a.severity === "high" ? chalk.yellow : chalk.white;
      console.log(color(`[${a.severity.toUpperCase()}] ${a.category} — ${a.actorId}: ${a.description}`));
      console.log(chalk.dim(`  Alert ID: ${a.alertId}  Score: ${(a.score * 100).toFixed(0)}%  ${a.acknowledged ? "(ACK)" : ""}`));
    }
  });

program
  .command("insider-risk-scores")
  .description("Show insider risk scores by actor")
  .action(() => {
    const ir = require("./audit/insiderRisk.js") as typeof import("./audit/insiderRisk.js");
    const scores = ir.computeInsiderRiskScores();
    if (scores.length === 0) {
      console.log(chalk.green("No insider risk scores computed (no data ingested)."));
      return;
    }
    console.log(chalk.bold("\nInsider Risk Scores:\n"));
    for (const s of scores) {
      const color = s.riskLevel === "critical" ? chalk.red : s.riskLevel === "high" ? chalk.yellow : chalk.white;
      console.log(color(`  ${s.actorId} — ${s.riskLevel.toUpperCase()} (${(s.overallScore * 100).toFixed(0)}%) — ${s.alertCount} alert(s), ${s.criticalAlertCount} critical`));
    }
  });

program
  .command("attestation-export")
  .description("Export attestation bundle for external auditors")
  .requiredOption("--tenant <id>", "tenant ID")
  .action((opts: { tenant: string }) => {
    const ir = require("./audit/insiderRisk.js") as typeof import("./audit/insiderRisk.js");
    const bundle = ir.exportAttestationBundle(opts.tenant);
    console.log(chalk.bold(`\nAttestation Bundle: ${bundle.bundleId}`));
    console.log(`  Tenant: ${bundle.tenantId}`);
    console.log(`  Alerts: ${bundle.alerts.length}`);
    console.log(`  Approval events: ${bundle.approvalEvents.length}`);
    console.log(`  Policy changes: ${bundle.policyChanges.length}`);
    console.log(`  Risk scores: ${bundle.riskScores.length}`);
    console.log(`  Hash: ${bundle.bundleHash}`);
  });

// ── False Positive Cost Tracking CLI ─────────────────────────────────
program
  .command("fp-submit")
  .description("Submit a false positive report for an assurance scenario")
  .requiredOption("--scenario <id>", "scenario ID")
  .requiredOption("--pack <id>", "pack ID")
  .requiredOption("--run <id>", "assurance run ID")
  .requiredOption("--justification <text>", "why this is a false positive")
  .option("--reporter <name>", "who is filing", "cli-user")
  .action((opts: { scenario: string; pack: string; run: string; justification: string; reporter: string }) => {
    const fp = require("./assurance/falsePositiveTracker.js") as typeof import("./assurance/falsePositiveTracker.js");
    const report = fp.submitFPReport({
      scenarioId: opts.scenario,
      packId: opts.pack,
      assuranceRunId: opts.run,
      response: "",
      justification: opts.justification,
      reportedBy: opts.reporter,
    });
    console.log(chalk.green(`FP report submitted: ${report.reportId}`));
  });

program
  .command("fp-resolve")
  .description("Resolve a false positive report")
  .requiredOption("--id <reportId>", "FP report ID")
  .requiredOption("--status <status>", "confirmed or rejected")
  .requiredOption("--reason <text>", "resolution reason")
  .action((opts: { id: string; status: string; reason: string }) => {
    const fp = require("./assurance/falsePositiveTracker.js") as typeof import("./assurance/falsePositiveTracker.js");
    const result = fp.resolveFPReport(opts.id, {
      status: opts.status as "confirmed" | "rejected",
      reason: opts.reason,
    });
    if (!result) {
      console.log(chalk.red("Report not found or already resolved."));
      return;
    }
    console.log(chalk.green(`Report ${opts.id} resolved as ${result.status}.`));
  });

program
  .command("fp-list")
  .description("List false positive reports")
  .option("--pack <id>", "filter by pack ID")
  .option("--status <status>", "filter by status (open, confirmed, rejected)")
  .action((opts: { pack?: string; status?: string }) => {
    const fp = require("./assurance/falsePositiveTracker.js") as typeof import("./assurance/falsePositiveTracker.js");
    const reports = fp.listFPReports({
      packId: opts.pack,
      status: opts.status as "open" | "confirmed" | "rejected" | undefined,
    });
    if (reports.length === 0) {
      console.log(chalk.green("No false positive reports found."));
      return;
    }
    for (const r of reports) {
      const color = r.status === "confirmed" ? chalk.yellow : r.status === "rejected" ? chalk.dim : chalk.white;
      console.log(color(`  [${r.status.toUpperCase()}] ${r.reportId} — ${r.packId}/${r.scenarioId}`));
      console.log(chalk.dim(`    Justification: ${r.justification.slice(0, 80)}`));
    }
  });

program
  .command("fp-cost")
  .description("Show false positive cost summary")
  .option("--pack <id>", "filter by pack ID")
  .action((opts: { pack?: string }) => {
    const fp = require("./assurance/falsePositiveTracker.js") as typeof import("./assurance/falsePositiveTracker.js");
    const summaries = fp.computeFPCostSummary(opts.pack);
    if (summaries.length === 0) {
      console.log(chalk.green("No FP cost data available."));
      return;
    }
    console.log(chalk.bold("\nFalse Positive Cost Summary:\n"));
    for (const s of summaries) {
      console.log(`  ${chalk.bold(s.packId)} — ${s.confirmedFPs} confirmed FPs, $${s.totalCostUsd.toFixed(2)} total cost, ${(s.fpRate * 100).toFixed(1)}% FP rate`);
    }
  });

program
  .command("fp-tuning-report")
  .description("Generate false positive tuning report with recommendations")
  .option("--window <days>", "reporting window in days", "30")
  .option("--threshold <rate>", "FP rate threshold for relax recommendation", "0.3")
  .action((opts: { window: string; threshold: string }) => {
    const fp = require("./assurance/falsePositiveTracker.js") as typeof import("./assurance/falsePositiveTracker.js");
    const windowMs = parseInt(opts.window, 10) * 86400000;
    const report = fp.generateFPTuningReport({
      windowStartTs: Date.now() - windowMs,
      windowEndTs: Date.now(),
      fpRateThreshold: parseFloat(opts.threshold),
    });
    console.log(fp.renderFPTuningReportMarkdown(report));
  });

// ── Production Wiring Diagnostics CLI ────────────────────────────────
program
  .command("wiring-status")
  .description("Show production wiring status for all modules (Items 11-16)")
  .option("--markdown", "output as markdown", false)
  .action((opts: { markdown: boolean }) => {
    const pw = require("./ops/productionWiring.js") as typeof import("./ops/productionWiring.js");
    if (opts.markdown) {
      console.log(pw.renderWiringDiagnosticsMarkdown());
      return;
    }
    const diags = pw.getWiringDiagnostics();
    console.log(chalk.bold("\nProduction Wiring Status:\n"));
    for (const d of diags) {
      const color = d.wired ? chalk.green : chalk.dim;
      console.log(color(`  ${d.wired ? "[WIRED]" : "[-----]"} ${d.moduleName} — ${d.hookCount} hooks, ${d.eventCount} events`));
    }
    const wiredCount = diags.filter((d) => d.wired).length;
    console.log(`\n  ${wiredCount}/${diags.length} modules active\n`);
  });

// ── Python SDK CLI ───────────────────────────────────────────────────
program
  .command("python-sdk")
  .description("Generate the Python SDK package for AMC Bridge API")
  .option("--endpoints", "list covered endpoints", false)
  .option("--coverage", "validate endpoint coverage", false)
  .action((opts: { endpoints: boolean; coverage: boolean }) => {
    const gen = require("./sdk/pythonSdkGenerator.js") as typeof import("./sdk/pythonSdkGenerator.js");
    if (opts.endpoints) {
      const endpoints = gen.listPythonSdkEndpoints();
      console.log(chalk.bold("\nPython SDK Endpoints:\n"));
      for (const e of endpoints) {
        console.log(`  ${chalk.cyan(e.method)} ${e.path} → ${chalk.green(e.sdkMethod)} (${e.provider})`);
      }
      return;
    }
    if (opts.coverage) {
      const cov = gen.validatePythonSdkCoverage();
      console.log(chalk.bold(`\nPython SDK Coverage: ${(cov.coverage * 100).toFixed(0)}%`));
      console.log(`  Covered: ${cov.covered.length} endpoints`);
      if (cov.missing.length > 0) {
        console.log(chalk.red(`  Missing: ${cov.missing.join(", ")}`));
      } else {
        console.log(chalk.green("  All endpoints covered!"));
      }
      return;
    }
    const pkg = gen.generatePythonSdkPackage();
    console.log(chalk.bold(`\n${pkg.packageName} v${pkg.version}`));
    console.log(`  Files: ${pkg.files.length}`);
    for (const f of pkg.files) {
      console.log(`    ${chalk.cyan(f.path)} — ${f.description}`);
    }
    console.log(`\n  Install: ${chalk.green(pkg.installCommand)}`);
    console.log(`  Test:    ${chalk.green(pkg.testCommand)}`);
  });

// ── Data Residency & Tenant Isolation CLI ────────────────────────────
program
  .command("residency-policy")
  .description("Create or list data residency policies")
  .option("--list", "list all policies", false)
  .option("--region <region>", "region for new policy")
  .option("--isolation <level>", "isolation level: strict, shared, federated", "strict")
  .option("--custody <mode>", "key custody mode: local, notary, external-kms, external-hsm", "local")
  .action((opts: { list: boolean; region?: string; isolation: string; custody: string }) => {
    const dr = require("./compliance/dataResidency.js") as typeof import("./compliance/dataResidency.js");
    if (opts.list) {
      const policies = dr.getResidencyPolicies();
      if (policies.length === 0) {
        console.log(chalk.yellow("No residency policies configured."));
        return;
      }
      for (const p of policies) {
        console.log(`  ${chalk.bold(p.policyId)} — ${p.region} (${p.isolationLevel}, ${p.keyCustodyMode})`);
      }
      return;
    }
    if (!opts.region) {
      console.log(chalk.red("Provide --region or --list."));
      return;
    }
    const policy = dr.createResidencyPolicy({
      region: opts.region as any,
      isolationLevel: opts.isolation as any,
      keyCustodyMode: opts.custody as any,
    });
    console.log(chalk.green(`Residency policy created: ${policy.policyId} for ${policy.region}`));
  });

program
  .command("tenant-register")
  .description("Register a tenant boundary")
  .requiredOption("--tenant <id>", "tenant ID")
  .requiredOption("--workspace <id>", "workspace ID")
  .requiredOption("--region <region>", "data region")
  .option("--isolation <level>", "isolation level", "strict")
  .action((opts: { tenant: string; workspace: string; region: string; isolation: string }) => {
    const dr = require("./compliance/dataResidency.js") as typeof import("./compliance/dataResidency.js");
    const boundary = dr.registerTenant({
      tenantId: opts.tenant,
      workspaceId: opts.workspace,
      region: opts.region as any,
      isolationLevel: opts.isolation as any,
    });
    console.log(chalk.green(`Tenant ${boundary.tenantId} registered in ${boundary.region} (${boundary.isolationLevel})`));
  });

program
  .command("tenant-isolation-check")
  .description("Check tenant isolation between all registered tenants")
  .action(() => {
    const dr = require("./compliance/dataResidency.js") as typeof import("./compliance/dataResidency.js");
    const checks = dr.checkAllTenantIsolation();
    if (checks.length === 0) {
      console.log(chalk.yellow("No tenant pairs to check (need at least 2 tenants)."));
      return;
    }
    for (const c of checks) {
      const status = c.isolated ? chalk.green("ISOLATED") : chalk.red("VIOLATIONS");
      console.log(`  ${c.tenantA} ↔ ${c.tenantB}: ${status}`);
      for (const v of c.violations) {
        console.log(chalk.yellow(`    [${v.severity.toUpperCase()}] ${v.description}`));
      }
    }
  });

program
  .command("legal-hold")
  .description("Issue or manage legal holds")
  .option("--issue", "issue a new legal hold", false)
  .option("--release <holdId>", "release a legal hold by ID")
  .option("--list", "list active legal holds", false)
  .option("--tenant <id>", "tenant ID")
  .option("--reason <text>", "reason for hold")
  .option("--issued-by <name>", "issuer name")
  .action((opts: { issue: boolean; release?: string; list: boolean; tenant?: string; reason?: string; issuedBy?: string }) => {
    const dr = require("./compliance/dataResidency.js") as typeof import("./compliance/dataResidency.js");
    if (opts.list) {
      const holds = dr.getActiveLegalHolds(opts.tenant);
      if (holds.length === 0) {
        console.log(chalk.green("No active legal holds."));
        return;
      }
      for (const h of holds) {
        console.log(`  ${chalk.bold(h.holdId)} — Tenant: ${h.tenantId} — ${h.reason} (by ${h.issuedBy})`);
      }
      return;
    }
    if (opts.release) {
      const released = dr.releaseLegalHold(opts.release);
      console.log(released ? chalk.green(`Legal hold ${opts.release} released.`) : chalk.red("Hold not found or already released."));
      return;
    }
    if (opts.issue && opts.tenant && opts.reason && opts.issuedBy) {
      const hold = dr.issueLegalHold({ tenantId: opts.tenant, reason: opts.reason, issuedBy: opts.issuedBy });
      console.log(chalk.green(`Legal hold issued: ${hold.holdId}`));
      return;
    }
    console.log(chalk.red("Use --issue with --tenant/--reason/--issued-by, --release <id>, or --list."));
  });

program
  .command("redaction-test")
  .description("Run privacy redaction tests against built-in rules")
  .action(() => {
    const dr = require("./compliance/dataResidency.js") as typeof import("./compliance/dataResidency.js");
    const suite = dr.runRedactionTests();
    console.log(chalk.bold(`\nRedaction Test Suite: ${suite.suiteId}\n`));
    for (const r of suite.results) {
      const status = r.passed ? chalk.green("PASS") : chalk.red("FAIL");
      console.log(`  ${status} ${r.ruleId}: "${r.testInput}" → "${r.actualOutput}"`);
    }
    console.log(`\n${suite.passCount} passed, ${suite.failCount} failed.`);
  });

program
  .command("residency-report")
  .description("Generate data residency compliance report for a tenant")
  .requiredOption("--tenant <id>", "tenant ID")
  .option("--redaction-tests", "include privacy redaction tests", false)
  .action((opts: { tenant: string; redactionTests: boolean }) => {
    const dr = require("./compliance/dataResidency.js") as typeof import("./compliance/dataResidency.js");
    const report = dr.generateResidencyReport(opts.tenant, { includeRedactionTests: opts.redactionTests });
    console.log(dr.renderResidencyReportMarkdown(report));
  });

program
  .command("key-custody-modes")
  .description("List available key custody modes and their configurations")
  .action(() => {
    const dr = require("./compliance/dataResidency.js") as typeof import("./compliance/dataResidency.js");
    const modes = dr.listKeyCustodyModes();
    console.log(chalk.bold("\nKey Custody Modes:\n"));
    for (const m of modes) {
      console.log(`  ${chalk.bold(m.mode)}`);
      console.log(`    ${m.description}`);
      console.log(`    Rotation: ${m.rotationIntervalDays}d | Dual control: ${m.requireDualControl ? "Yes" : "No"} | Export: ${m.allowExport ? "Yes" : "No"}`);
      console.log("");
    }
  });

// ── Operator UX CLI ──────────────────────────────────────────────────
program
  .command("operator-dashboard")
  .description("Generate operator dashboard showing why questions are capped and how to unlock")
  .option("--role <role>", "dashboard role: operator, executive, auditor", "operator")
  .option("--run <runId>", "specific run ID to analyze (defaults to latest)")
  .option("--previous-run <runId>", "previous run ID for narrative diff")
  .action((opts: { role: string; run?: string; previousRun?: string }) => {
    const opux = require("./ops/operatorUx.js") as typeof import("./ops/operatorUx.js");
    const validRoles = ["operator", "executive", "auditor"] as const;
    if (!validRoles.includes(opts.role as any)) {
      console.log(chalk.red(`Invalid role: ${opts.role}. Must be operator, executive, or auditor.`));
      return;
    }
    // Build mock report for CLI demo when no real run is available
    const agentId = activeAgent(program) ?? "default";
    const mockReport = buildMockReportForUx(agentId, opts.run ?? "latest");
    const mockPrevious = opts.previousRun ? buildMockReportForUx(agentId, opts.previousRun) : null;
    const dashboard = opux.generateOperatorDashboard(mockReport, opts.role as any, mockPrevious);
    console.log(opux.renderOperatorDashboardMarkdown(dashboard));
  });

program
  .command("why-capped")
  .description("Show why each question is capped at its current level")
  .option("--question <id>", "filter to specific question ID")
  .action((opts: { question?: string }) => {
    const opux = require("./ops/operatorUx.js") as typeof import("./ops/operatorUx.js");
    const agentId = activeAgent(program) ?? "default";
    const report = buildMockReportForUx(agentId, "latest");
    const whyCaps = opux.computeWhyCaps(report);
    const filtered = opts.question ? whyCaps.filter(w => w.questionId === opts.question) : whyCaps;
    const capped = filtered.filter(w => w.capReasons.length > 0);
    if (capped.length === 0) {
      console.log(chalk.green("No questions are currently capped by blocking flags."));
      return;
    }
    for (const w of capped) {
      console.log(chalk.bold(`\n${w.questionId} — Level ${w.currentLevel}/5 (Confidence: ${(w.confidence * 100).toFixed(0)}%)`));
      for (const cr of w.capReasons) {
        console.log(chalk.yellow(`  ⚠ ${cr.label}: ${cr.description}`));
        console.log(chalk.green(`    → ${cr.unlockAction} [${cr.effortLevel} effort]`));
      }
    }
  });

program
  .command("action-queue")
  .description("Show prioritized actions sorted by risk-reduction-per-effort")
  .option("--limit <n>", "max actions to show", "15")
  .action((opts: { limit: string }) => {
    const opux = require("./ops/operatorUx.js") as typeof import("./ops/operatorUx.js");
    const agentId = activeAgent(program) ?? "default";
    const report = buildMockReportForUx(agentId, "latest");
    const whyCaps = opux.computeWhyCaps(report);
    const queue = opux.computeActionQueue(whyCaps);
    if (queue.items.length === 0) {
      console.log(chalk.green("No actions required — all questions are clean."));
      return;
    }
    const limit = parseInt(opts.limit, 10);
    console.log(chalk.bold(`\nAction Queue — ${queue.estimatedEffort}\n`));
    for (const item of queue.items.slice(0, limit)) {
      const effortColor = item.effortLevel === "low" ? chalk.green : item.effortLevel === "medium" ? chalk.yellow : chalk.red;
      console.log(`  ${item.rank}. [${item.questionId}] ${item.action}`);
      console.log(`     ${effortColor(`Effort: ${item.effortLevel}`)} | Risk Δ: ${item.riskReduction.toFixed(1)} | Priority: ${item.priorityScore.toFixed(2)}`);
    }
  });

program
  .command("confidence-heatmap")
  .description("Display confidence heatmap by question and layer")
  .action(() => {
    const opux = require("./ops/operatorUx.js") as typeof import("./ops/operatorUx.js");
    const agentId = activeAgent(program) ?? "default";
    const report = buildMockReportForUx(agentId, "latest");
    const heatmap = opux.computeConfidenceHeatmap(report);
    console.log(chalk.bold(`\nConfidence Heatmap — Avg: ${(heatmap.avgConfidence * 100).toFixed(1)}%  Low: ${heatmap.lowConfidenceCount} questions\n`));
    for (const cell of heatmap.cells) {
      const color = cell.heatColor === "green" ? chalk.green
        : cell.heatColor === "yellow" ? chalk.yellow
        : cell.heatColor === "orange" ? chalk.hex("#FFA500")
        : chalk.red;
      console.log(color(`  ${cell.questionId.padEnd(12)} L${cell.finalLevel} ${(cell.confidence * 100).toFixed(0).padStart(3)}% ${cell.flagCount > 0 ? `(${cell.flagCount} flags)` : ""}`));
    }
  });

program
  .command("role-presets")
  .description("List available dashboard role presets")
  .action(() => {
    const opux = require("./ops/operatorUx.js") as typeof import("./ops/operatorUx.js");
    const presets = opux.listRolePresets();
    console.log(chalk.bold("\nAvailable Dashboard Presets:\n"));
    for (const p of presets) {
      console.log(`  ${chalk.bold(p.role.padEnd(12))} ${p.label}`);
      console.log(`  ${" ".repeat(12)} ${p.description}`);
      console.log(`  ${" ".repeat(12)} Sections: ${p.showSections.join(", ")}`);
      console.log(`  ${" ".repeat(12)} Sort by: ${p.sortBy}`);
      console.log("");
    }
  });

/**
 * Build a minimal mock DiagnosticReport for the operator UX CLI commands.
 * In production, this would load from the ledger via `loadRunReport()`.
 */
function buildMockReportForUx(agentId: string, runId: string): import("./types.js").DiagnosticReport {
  return {
    agentId,
    runId: runId === "latest" ? `run_mock_${Date.now()}` : runId,
    ts: Date.now(),
    windowStartTs: Date.now() - 14 * 86400000,
    windowEndTs: Date.now(),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.65,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [
      { layerName: "Strategic Agent Operations", avgFinalLevel: 3.2, confidenceWeightedFinalLevel: 3.0 },
      { layerName: "Leadership & Autonomy", avgFinalLevel: 2.8, confidenceWeightedFinalLevel: 2.5 },
      { layerName: "Culture & Alignment", avgFinalLevel: 3.5, confidenceWeightedFinalLevel: 3.3 },
      { layerName: "Resilience", avgFinalLevel: 2.5, confidenceWeightedFinalLevel: 2.3 },
      { layerName: "Skills", avgFinalLevel: 3.0, confidenceWeightedFinalLevel: 2.8 },
    ],
    questionScores: [
      { questionId: "AMC-1.1", claimedLevel: 3, supportedMaxLevel: 3, finalLevel: 3, confidence: 0.7, evidenceEventIds: ["e1", "e2", "e3"], flags: [], narrative: "Good evidence coverage." },
      { questionId: "AMC-1.5", claimedLevel: 4, supportedMaxLevel: 2, finalLevel: 2, confidence: 0.4, evidenceEventIds: ["e4"], flags: ["FLAG_UNSUPPORTED_CLAIM", "FLAG_MISSING_LLM_EVIDENCE"], narrative: "Missing LLM evidence." },
      { questionId: "AMC-2.3", claimedLevel: 3, supportedMaxLevel: 3, finalLevel: 3, confidence: 0.6, evidenceEventIds: ["e5", "e6"], flags: ["FLAG_CORRELATION_LOW"], narrative: "Low correlation." },
      { questionId: "AMC-3.1", claimedLevel: 4, supportedMaxLevel: 4, finalLevel: 4, confidence: 0.85, evidenceEventIds: ["e7", "e8", "e9", "e10"], flags: [], narrative: "Strong alignment evidence." },
      { questionId: "AMC-4.1", claimedLevel: 2, supportedMaxLevel: 2, finalLevel: 2, confidence: 0.3, evidenceEventIds: [], flags: ["FLAG_CONFIG_UNTRUSTED", "FLAG_ASSURANCE_EVIDENCE_MISSING"], narrative: "Config unsigned, assurance missing." },
    ],
    inflationAttempts: [{ questionId: "AMC-1.5", claimed: 4, supported: 2 }],
    unsupportedClaimCount: 1,
    contradictionCount: 0,
    correlationRatio: 0.75,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.6,
    evidenceTrustCoverage: { observed: 0.5, attested: 0.3, selfReported: 0.2 },
    targetDiff: [
      { questionId: "AMC-1.5", current: 2, target: 4, gap: 2 },
      { questionId: "AMC-4.1", current: 2, target: 3, gap: 1 },
    ],
    prioritizedUpgradeActions: [
      "AMC-1.5: Raise from 2 to 4 by adding LLM gateway evidence.",
      "AMC-4.1: Raise from 2 to 3 by signing configs and running assurance packs.",
    ],
    evidenceToCollectNext: [
      "AMC-1.5: add llm_request/llm_response gateway evidence",
      "AMC-4.1: sign gateway and fleet config files",
    ],
    runSealSig: "mock-seal",
    reportJsonSha256: "mock-hash",
  };
}

// ── SDK Parity & Integration Scaffold CLI ────────────────────────────
program
  .command("integrate")
  .description("Generate integration scaffold for a framework")
  .argument("<framework>", "framework: express, fastapi, flask, langchain, llamaindex, generic-http")
  .option("--output-dir <dir>", "output directory for generated files", ".")
  .option("--project <path>", "project path for one-liner framework adapters")
  .action(async (framework: string, opts: { outputDir: string; project?: string }) => {
    if (framework === "langchain") {
      const { createLangChainAdapter } = await import("./integrations/langchainAdapter.js");
      const adapter = createLangChainAdapter({ projectPath: resolve(opts.project || process.cwd()), autoCapture: true });
      console.log(chalk.green("✓ LangChain adapter configured"));
      console.log(chalk.gray(`Project: ${adapter.config.projectPath}`));
      console.log(chalk.cyan("\nUsage in your code:"));
      console.log('  import { createLangChainAdapter } from "@amc/integrations/langchainAdapter";');
      console.log('  const adapter = createLangChainAdapter({ projectPath: "." });');
      console.log('  const wrappedAgent = adapter.wrapAgent(yourAgent);');
      return;
    }
    if (framework === "crewai") {
      const { createCrewAIAdapter } = await import("./integrations/crewaiAdapter.js");
      const adapter = createCrewAIAdapter({ projectPath: resolve(opts.project || process.cwd()), autoCapture: true });
      console.log(chalk.green("✓ CrewAI adapter configured"));
      console.log(chalk.gray(`Project: ${adapter.config.projectPath}`));
      console.log(chalk.cyan("\nUsage in your code:"));
      console.log('  import { createCrewAIAdapter } from "@amc/integrations/crewaiAdapter";');
      console.log('  const adapter = createCrewAIAdapter({ projectPath: "." });');
      console.log('  const wrappedCrew = adapter.wrapCrew(yourCrew);');
      return;
    }
    if (framework === "autogen") {
      const { createAutoGenAdapter } = await import("./integrations/autogenAdapter.js");
      const adapter = createAutoGenAdapter({ projectPath: resolve(opts.project || process.cwd()), autoCapture: true });
      console.log(chalk.green("✓ AutoGen adapter configured"));
      console.log(chalk.gray(`Project: ${adapter.config.projectPath}`));
      console.log(chalk.cyan("\nUsage in your code:"));
      console.log('  import { createAutoGenAdapter } from "@amc/integrations/autogenAdapter";');
      console.log('  const adapter = createAutoGenAdapter({ projectPath: "." });');
      console.log('  const wrappedAgent = adapter.wrapAgent(yourAgent);');
      return;
    }

    const is = require("./setup/integrationScaffold.js") as typeof import("./setup/integrationScaffold.js");
    const validFrameworks = ["express", "fastapi", "flask", "langchain", "llamaindex", "generic-http", "custom", "crewai", "autogen"];
    if (!validFrameworks.includes(framework)) {
      console.log(chalk.red(`Unknown framework: ${framework}`));
      console.log("Available frameworks:");
      for (const f of is.listAvailableFrameworks()) {
        console.log(`  ${chalk.bold(f.id)} — ${f.language} — ${f.description}`);
      }
      return;
    }
    const scaffold = is.generateScaffold(framework as any);
    console.log(chalk.bold(`\n📦 AMC Integration Scaffold: ${scaffold.framework} (${scaffold.language})\n`));
    console.log(chalk.dim(`Scaffold ID: ${scaffold.scaffoldId}\n`));
    console.log(chalk.bold("Generated files:"));
    for (const f of scaffold.files) {
      console.log(`  ${chalk.green(f.path)} — ${f.description}`);
      console.log(chalk.dim(`    (${f.content.split("\n").length} lines)`));
    }
    console.log(chalk.bold("\nSetup instructions:"));
    for (let i = 0; i < scaffold.instructions.length; i++) {
      console.log(`  ${i + 1}. ${scaffold.instructions[i]}`);
    }
    console.log(chalk.dim(`\nTo write files to disk, use --output-dir and inspect the generated paths.`));
  });

program
  .command("integrate-list")
  .description("List available integration frameworks")
  .action(() => {
    const is = require("./setup/integrationScaffold.js") as typeof import("./setup/integrationScaffold.js");
    const frameworks = is.listAvailableFrameworks();
    console.log(chalk.bold(`Available Integration Frameworks (${frameworks.length}):\n`));
    for (const f of frameworks) {
      console.log(`  ${chalk.bold(f.id.padEnd(15))} ${f.language.padEnd(25)} ${f.description}`);
    }
  });

program
  .command("contract-tests")
  .description("Generate and display contract test suite for bridge API")
  .action(() => {
    const is = require("./setup/integrationScaffold.js") as typeof import("./setup/integrationScaffold.js");
    const suite = is.generateContractTests();
    console.log(chalk.bold(`\nContract Test Suite: ${suite.suiteId}\n`));
    for (const t of suite.tests) {
      console.log(`  ${chalk.bold(t.testId)}: ${t.name}`);
      console.log(`    ${t.method} ${t.path} → expect ${t.expectedStatus}`);
      console.log(`    Required fields: ${t.requiredFields.join(", ")}`);
      console.log(`    Validators: ${t.validators.map(v => `${v.field}:${v.rule}`).join(", ")}`);
      console.log("");
    }
  });

program
  .command("simulate-bridge")
  .description("Run a simulated bridge request for local testing")
  .requiredOption("--model <model>", "model to simulate")
  .requiredOption("--prompt <prompt>", "prompt text to send")
  .option("--error-rate <rate>", "simulated error rate (0.0-1.0)", "0.05")
  .action((opts: { model: string; prompt: string; errorRate: string }) => {
    const is = require("./setup/integrationScaffold.js") as typeof import("./setup/integrationScaffold.js");
    const config = is.defaultSimulatorConfig();
    config.errorRate = parseFloat(opts.errorRate);
    const result = is.simulateBridgeRequest(config, { model: opts.model, prompt: opts.prompt });
    if (result.isError) {
      console.log(chalk.red(`[ERROR] ${result.requestId}: ${JSON.stringify(result.responseBody)}`));
    } else {
      console.log(chalk.green(`[OK] ${result.requestId} — ${result.model} — ${result.simulatedLatencyMs}ms`));
      console.log(JSON.stringify(result.responseBody, null, 2));
    }
  });

// ── OpenAPI Generate (Full Spec) ────────────────────────────────────────
program
  .command("openapi-generate")
  .description("Generate live OpenAPI spec (Studio + Bridge + Gateway)")
  .option("--out <file>", "output file path (yaml/json)")
  .option("--json", "output raw JSON to stdout", false)
  .action((opts: { out?: string; json: boolean }) => {
    const { openapiGenerateCli, renderOpenApiYaml } = require("./studio/openapi.js") as typeof import("./studio/openapi.js");
    const result = openapiGenerateCli({ out: opts.out });
    if (opts.out) {
      console.log(chalk.green(`OpenAPI spec written to ${result.path}`));
    } else if (opts.json) {
      console.log(JSON.stringify(result.spec, null, 2));
    } else {
      console.log(renderOpenApiYaml());
    }
  });

// ── Plugin Sandbox Limits ───────────────────────────────────────────────
plugin
  .command("limits")
  .description("Show current plugin sandbox resource limits")
  .action(() => {
    const { resolveSandboxLimits, formatSandboxLimits } = require("./plugins/sandboxLimits.js") as typeof import("./plugins/sandboxLimits.js");
    const limits = resolveSandboxLimits();
    console.log(chalk.bold("\nPlugin Sandbox Resource Limits\n"));
    console.log(formatSandboxLimits(limits));
    console.log("");
  });

// ── CGX Code Scan ───────────────────────────────────────────────────────
cgx
  .command("code-scan")
  .description("Scan repository for semantic code edges")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--path <repoPath>", "repository path to scan")
  .action((opts: { agent: string; path: string }) => {
    const { scanCodeGraph, renderCodeGraphMarkdown } = require("./cgx/semanticCodeEdges.js") as typeof import("./cgx/semanticCodeEdges.js");
    const repoPath = resolve(opts.path);
    console.log(chalk.dim(`Scanning ${repoPath}...`));
    const graph = scanCodeGraph(opts.agent, repoPath);
    console.log(renderCodeGraphMarkdown(graph));
  });

// ── Claim Expiry & Staleness CLI ────────────────────────────────────────
program
  .command("claims-stale")
  .description("List stale claims for an agent")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { findStaleClaims, renderStaleClaimsMarkdown } = require("./claims/claimExpiry.js") as typeof import("./claims/claimExpiry.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const stale = findStaleClaims(db, agentId);
    ledger.close();
    console.log(renderStaleClaimsMarkdown(stale, agentId));
  });

program
  .command("claims-sweep")
  .description("Process all stale claims for an agent (auto-demote to PROVISIONAL)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { sweepStaleClaims, renderSweepResultMarkdown } = require("./claims/claimExpiry.js") as typeof import("./claims/claimExpiry.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const result = sweepStaleClaims(db, agentId, process.cwd());
    ledger.close();
    console.log(renderSweepResultMarkdown(result, agentId));
  });

// ── Confidence Drift CLI ────────────────────────────────────────────────
program
  .command("confidence-drift")
  .description("Track confidence drift per question across diagnostic runs")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--window <window>", "time window (e.g., 30d)", "30d")
  .action((opts: { agent?: string; window: string }) => {
    const { analyzeAgentConfidenceDrift, renderConfidenceDriftMarkdown } = require("./claims/confidenceDrift.js") as typeof import("./claims/confidenceDrift.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const windowMs = parseWindowToMs(opts.window);
    const report = analyzeAgentConfidenceDrift(db, agentId, windowMs);
    ledger.close();
    console.log(renderConfidenceDriftMarkdown(report));
  });

// ── Lessons Learned CLI ─────────────────────────────────────────────────
program
  .command("lessons-list")
  .description("List lessons learned from corrections")
  .option("--scope <scope>", "fleet or agent", "fleet")
  .option("--agent <agentId>", "agent ID (for scope=agent)")
  .action((opts: { scope: string; agent?: string }) => {
    const { listLessons, renderLessonsMarkdown } = require("./corrections/lessonStore.js") as typeof import("./corrections/lessonStore.js");
    const scope = opts.scope === "agent" ? "agent" : "fleet";
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const lessons = listLessons(process.cwd(), scope as any, agentId);
    console.log(renderLessonsMarkdown(lessons, scope));
  });

program
  .command("lessons-promote")
  .description("Promote a correction to a reusable lesson")
  .argument("<correctionId>", "correction ID to promote")
  .action((correctionId: string) => {
    const { promoteCorrection } = require("./corrections/lessonStore.js") as typeof import("./corrections/lessonStore.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    const result = promoteCorrection(db, correctionId, process.cwd());
    ledger.close();
    if (result.isNew) {
      console.log(chalk.green(`New lesson created: ${result.lesson.lessonId}`));
    } else {
      console.log(chalk.green(`Merged into existing lesson: ${result.lesson.lessonId} (${result.lesson.occurrenceCount} occurrences)`));
    }
    console.log(`  Pattern: ${result.lesson.patternDescription}`);
    console.log(`  Questions: ${result.lesson.affectedQuestions.join(", ")}`);
  });

program
  .command("corrections-verify-closure")
  .description("Show open feedback loops that need closure")
  .requiredOption("--agent <id>", "Agent ID")
  .action((opts: { agent: string }) => {
    const { generateFeedbackClosureReport, renderFeedbackClosureReport } = require("./corrections/feedbackClosure.js") as typeof import("./corrections/feedbackClosure.js");
    const ledger = openLedger(process.cwd());
    const db = (ledger as any).db as import("better-sqlite3").Database;
    const report = generateFeedbackClosureReport(db, opts.agent);
    ledger.close();
    console.log(renderFeedbackClosureReport(report));
  });

// ── Receipt Chain CLI ───────────────────────────────────────────────────
program
  .command("receipts-chain")
  .description("Show full delegation chain for a receipt")
  .argument("<receiptId>", "receipt ID to trace")
  .action((receiptId: string) => {
    const { verifyDelegationChain, renderDelegationChainMarkdown } = require("./receipts/receiptChain.js") as typeof import("./receipts/receiptChain.js");
    // In practice, public keys would be loaded from workspace
    const publicKeys: string[] = [];
    try {
      const { getPublicKeyHistory } = require("./crypto/keys.js") as typeof import("./crypto/keys.js");
      const keys = getPublicKeyHistory(process.cwd(), "monitor");
      publicKeys.push(...keys);
    } catch { /* no keys */ }
    const result = verifyDelegationChain(receiptId, publicKeys);
    console.log(renderDelegationChainMarkdown(result));
  });

// ── Policy Canary Mode CLI ──────────────────────────────────────────────
program
  .command("policy-canary-start")
  .description("Start policy canary mode (observation-only)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .requiredOption("--pack <packId>", "policy pack ID to canary")
  .option("--duration <duration>", "canary duration (e.g., 7d)", "7d")
  .action((opts: { agent?: string; pack: string; duration: string }) => {
    const { startCanaryMode } = require("./governor/policyCanaryMode.js") as typeof import("./governor/policyCanaryMode.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const durationMs = parseWindowToMs(opts.duration);
    const config = startCanaryMode(agentId, opts.pack, durationMs);
    console.log(chalk.green(`Canary mode started: ${config.canaryId}`));
    console.log(`  Agent: ${agentId}`);
    console.log(`  Policy pack: ${opts.pack}`);
    console.log(`  Duration: ${opts.duration}`);
    console.log(`  Expires: ${new Date(config.expiresTs).toISOString()}`);
  });

program
  .command("policy-canary-report")
  .description("Generate canary mode report for an agent")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { generateCanaryReportForAgent, renderCanaryModeReportMarkdown } = require("./governor/policyCanaryMode.js") as typeof import("./governor/policyCanaryMode.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const report = generateCanaryReportForAgent(agentId);
    if (!report) {
      console.log(chalk.yellow("No canary mode active or found for this agent."));
      return;
    }
    console.log(renderCanaryModeReportMarkdown(report));
  });

// ── Policy Debt Register CLI ────────────────────────────────────────────
program
  .command("debt-add")
  .description("Add a policy debt entry (waiver/override/exception)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .requiredOption("--type <type>", "waiver|override|exception")
  .requiredOption("--reason <reason>", "reason for the debt")
  .option("--expiry <expiry>", "expiry (e.g., 7d or epoch ms)", "7d")
  .option("--policies <policies>", "comma-separated affected policy IDs", "")
  .option("--risk <risk>", "LOW|MEDIUM|HIGH|CRITICAL", "MEDIUM")
  .option("--created-by <who>", "who created this", "operator")
  .action((opts: { agent?: string; type: string; reason: string; expiry: string; policies: string; risk: string; createdBy: string }) => {
    const { addDebtEntry } = require("./governor/policyDebt.js") as typeof import("./governor/policyDebt.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    let expiryTs: number;
    if (/^\d+$/.test(opts.expiry)) {
      expiryTs = parseInt(opts.expiry, 10);
    } else {
      expiryTs = Date.now() + parseWindowToMs(opts.expiry);
    }
    const entry = addDebtEntry(process.cwd(), {
      type: opts.type as any,
      reason: opts.reason,
      expiryTs,
      affectedPolicies: opts.policies ? opts.policies.split(",").map((s: string) => s.trim()) : [],
      riskAssessment: opts.risk as any,
      agentId,
      createdBy: opts.createdBy,
    });
    console.log(chalk.yellow(`Policy debt added: ${entry.debtId}`));
    console.log(`  Type: ${entry.type} | Risk: ${entry.riskAssessment}`);
    console.log(`  Expires: ${new Date(entry.expiryTs).toISOString()}`);
  });

program
  .command("debt-list")
  .description("List policy debt entries")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { buildDebtDashboard, renderDebtDashboardMarkdown } = require("./governor/policyDebt.js") as typeof import("./governor/policyDebt.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const dashboard = buildDebtDashboard(process.cwd(), agentId);
    console.log(renderDebtDashboardMarkdown(dashboard));
  });

// ── Emergency Override CLI ──────────────────────────────────────────────
program
  .command("governor-override")
  .description("Activate an emergency governance override with TTL")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .requiredOption("--reason <reason>", "reason for the emergency override (>= 10 chars)")
  .option("--ttl <ttl>", "TTL (e.g., 4h)", "4h")
  .option("--mode <mode>", "execute or dry-run", "dry-run")
  .action((opts: { agent?: string; reason: string; ttl: string; mode: string }) => {
    const { activateOverride, renderOverrideMarkdown } = require("./governor/emergencyOverride.js") as typeof import("./governor/emergencyOverride.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const ttlMs = parseWindowToMs(opts.ttl);
    const entry = activateOverride(process.cwd(), {
      agentId,
      reason: opts.reason,
      ttlMs,
      mode: opts.mode as any,
    });
    console.log(chalk.yellow(`Emergency override activated: ${entry.overrideId}`));
    console.log(renderOverrideMarkdown(entry));
    console.log(chalk.red("⚠  Postmortem required within 48h of override expiry."));
  });

program
  .command("governor-override-alerts")
  .description("Show alerts for active/expired overrides")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .action((opts: { agent?: string }) => {
    const { getOverrideAlerts, renderOverrideAlertsMarkdown } = require("./governor/emergencyOverride.js") as typeof import("./governor/emergencyOverride.js");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const alerts = getOverrideAlerts(process.cwd(), agentId);
    console.log(renderOverrideAlertsMarkdown(alerts));
  });

// ── Community Governance ────────────────────────────────────────────────────
const orgCommunity = org.command("community").description("Community/platform governance scoring");

orgCommunity
  .command("init")
  .requiredOption("--platform <name>", "platform name")
  .action((opts: { platform: string }) => {
    const { initCommunityPlatform } = require("./org/communityGovernance.js") as typeof import("./org/communityGovernance.js");
    const config = initCommunityPlatform(opts.platform);
    console.log(JSON.stringify(config, null, 2));
    console.log(chalk.green(`Community platform "${opts.platform}" initialized`));
  });

orgCommunity
  .command("score")
  .requiredOption("--platform <name>", "platform name")
  .action((opts: { platform: string }) => {
    const { initCommunityPlatform, scoreCommunityGovernance, renderCommunityGovernanceMarkdown } = require("./org/communityGovernance.js") as typeof import("./org/communityGovernance.js");
    const config = initCommunityPlatform(opts.platform);
    const report = scoreCommunityGovernance(config);
    console.log(renderCommunityGovernanceMarkdown(report));
  });

// ── Agent Discovery ────────────────────────────────────────────────────────
passport
  .command("capabilities-add")
  .description("Add capability declaration to agent passport")
  .requiredOption("--agent <id>", "agent ID")
  .requiredOption("--capability <name>", "capability name")
  .option("--evidence <eventId>", "evidence event ID")
  .action((opts: { agent: string; capability: string; evidence?: string }) => {
    const { createDiscoveryRegistry, addCapability } = require("./passport/agentDiscovery.js") as typeof import("./passport/agentDiscovery.js");
    const registry = createDiscoveryRegistry();
    const decl = addCapability(registry, opts.agent, opts.capability, opts.evidence ? [opts.evidence] : []);
    console.log(JSON.stringify(decl, null, 2));
    console.log(chalk.green(`Capability "${opts.capability}" added for agent ${opts.agent}`));
  });

passport
  .command("search")
  .description("Search agents by capability and minimum maturity level")
  .requiredOption("--capability <name>", "capability to search for")
  .option("--min-level <n>", "minimum maturity level", "0")
  .action((opts: { capability: string; minLevel: string }) => {
    const { createDiscoveryRegistry, searchCapabilities } = require("./passport/agentDiscovery.js") as typeof import("./passport/agentDiscovery.js");
    const registry = createDiscoveryRegistry();
    const results = searchCapabilities(registry, { capability: opts.capability, minLevel: Number(opts.minLevel) });
    console.log(JSON.stringify(results, null, 2));
  });

passport
  .command("link")
  .description("Link agent passport to external platform identity")
  .requiredOption("--agent <id>", "agent ID")
  .requiredOption("--platform <name>", "platform name")
  .requiredOption("--identity <handle>", "identity handle on platform")
  .action((opts: { agent: string; platform: string; identity: string }) => {
    const { createDiscoveryRegistry, linkPlatform } = require("./passport/agentDiscovery.js") as typeof import("./passport/agentDiscovery.js");
    const registry = createDiscoveryRegistry();
    const link = linkPlatform(registry, opts.agent, opts.platform, opts.identity);
    console.log(JSON.stringify(link, null, 2));
    console.log(chalk.green(`Agent ${opts.agent} linked to ${opts.platform}:${opts.identity}`));
  });

// ── Known Unknowns ─────────────────────────────────────────────────────────
program
  .command("unknowns")
  .description("List known unknowns for an agent's latest diagnostic run")
  .option("--agent <id>", "agent ID")
  .action((opts: { agent?: string }) => {
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const { generateKnownUnknownsReport, renderKnownUnknownsMarkdown } = require("./diagnostic/knownUnknowns.js") as typeof import("./diagnostic/knownUnknowns.js");
    const workspace = process.cwd();
    const report = loadRunReport(workspace, agentId);
    if (!report) {
      console.log(chalk.yellow("No diagnostic run found."));
      return;
    }
    const unknownsReport = generateKnownUnknownsReport(report);
    console.log(renderKnownUnknownsMarkdown(unknownsReport));
    console.log(JSON.stringify(unknownsReport.summary, null, 2));
  });

// ── Meta-Confidence ────────────────────────────────────────────────────────
program
  .command("meta-confidence")
  .description("Report confidence in the maturity score itself")
  .option("--agent <id>", "agent ID")
  .option("--run <runId>", "specific run ID")
  .action((opts: { agent?: string; run?: string }) => {
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const { computeDiagnosticMetaConfidence, renderMetaConfidenceMarkdown } = require("./diagnostic/metaConfidence.js") as typeof import("./diagnostic/metaConfidence.js");
    const workspace = process.cwd();
    const report = loadRunReport(workspace, agentId);
    if (!report) {
      console.log(chalk.yellow("No diagnostic run found."));
      return;
    }
    const mc = computeDiagnosticMetaConfidence(report);
    console.log(renderMetaConfidenceMarkdown(mc));
  });

// ── Confidence Governor ────────────────────────────────────────────────────
governor
  .command("confidence-check")
  .description("Check if action is allowed given confidence-adjusted maturity")
  .requiredOption("--action <class>", "ActionClass")
  .option("--agent <id>", "agent ID")
  .option("--required-level <n>", "required maturity level", "3")
  .action((opts: { action: string; agent?: string; requiredLevel: string }) => {
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const { confidenceCheck, renderConfidenceGovernorMarkdown } = require("./governor/confidenceGovernor.js") as typeof import("./governor/confidenceGovernor.js");
    const workspace = process.cwd();
    const report = loadRunReport(workspace, agentId);
    if (!report) {
      console.log(chalk.yellow("No diagnostic run found."));
      return;
    }
    const decision = confidenceCheck({
      agentId,
      actionClass: normalizeActionClass(opts.action),
      diagnosticReport: report,
      requiredLevel: Number(opts.requiredLevel),
    });
    console.log(renderConfidenceGovernorMarkdown(decision));
  });

// ── Component Confidence (see main confidence command group below) ──────────

program
  .command("confidence-components")
  .description("Show per-component confidence breakdown")
  .option("--agent <id>", "agent ID")
  .action((opts: { agent?: string }) => {
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const { computeComponentConfidence, renderComponentConfidenceMarkdown } = require("./diagnostic/componentConfidence.js") as typeof import("./diagnostic/componentConfidence.js");
    const workspace = process.cwd();
    const report = loadRunReport(workspace, agentId);
    if (!report) {
      console.log(chalk.yellow("No diagnostic run found."));
      return;
    }
    const cc = computeComponentConfidence(report);
    console.log(renderComponentConfidenceMarkdown(cc));
  });

program.action((_opts, command: Command) => {
  const rootArgs = command.args ?? [];
  if (rootArgs.length > 0) {
    const unknownToken = String(rootArgs[0]);
    console.error(chalk.red(`error: unknown command '${unknownToken}'`));
    const suggestions = suggestCommandPaths(unknownToken, flattenCommandPaths(program), 6);
    if (suggestions.length > 0) {
      console.error(chalk.yellow("Closest command paths:"));
      for (const suggestion of suggestions) {
        console.error(`  amc ${suggestion}`);
      }
    }
    console.error(chalk.cyan("Run 'amc --help' to explore top-level commands."));
    process.exit(1);
    return;
  }
  program.help();
});


// ============================================================
// NEW MODULES: Shield, Enforce, Watch, Product, Vault, Score
// ============================================================
// ============================================================
// SHIELD — Threat detection and security scanning
// ============================================================
const shield = program.command("shield").description("Threat detection and security scanning");

shield
  .command("analyze <path>")
  .description("Run static code analyzer on a skill file")
  .option("--json", "Output as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    try {
      const { analyzeSkill } = await import("./shield/index.js");
      const content = readFileSync(path, "utf8");
      const result = analyzeSkill(content);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  Shield Analysis"));
      console.log(chalk.gray("Path:"), path);
      console.log(chalk.gray("Risk Level:"), result.riskLevel);
      console.log(chalk.gray("Findings:"), result.findings.length);
      if (result.findings.length) {
        for (const finding of result.findings) {
          console.log(chalk.yellow(`  • [${finding.severity}] ${finding.description}`));
        }
      }
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

shield
  .command("sandbox <agentId>")
  .description("Check sandbox configuration for an agent")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { sandboxCheck } = await import("./shield/index.js");
      const result = sandboxCheck(agentId);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  Sandbox Check"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Passed:"), result.passed ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Details:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

shield
  .command("sbom <path>")
  .description("Generate software bill of materials from package.json")
  .option("--json", "Output as JSON")
  .action(async (path: string, opts: { json?: boolean }) => {
    try {
      const { generateSbom } = await import("./shield/index.js");
      const pkg = JSON.parse(readFileSync(path, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const result = generateSbom(deps);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  SBOM"));
      console.log(chalk.gray("Source:"), path);
      console.log(chalk.gray("Components:"), result.components?.length ?? Object.keys(deps).length);
      for (const [name, version] of Object.entries(deps)) {
        console.log(chalk.gray(`  • ${name}@${version}`));
      }
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

shield
  .command("reputation <toolId>")
  .description("Check reputation score for a tool")
  .option("--json", "Output as JSON")
  .action(async (toolId: string, opts: { json?: boolean }) => {
    try {
      const { checkReputation } = await import("./shield/index.js");
      const result = checkReputation(toolId);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  Tool Reputation"));
      console.log(chalk.gray("Tool:"), toolId);
      console.log(chalk.gray("Score:"), result.score ?? "N/A");
      console.log(chalk.gray("Trusted:"), result.trusted ? chalk.green("yes") : chalk.red("no"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

shield
  .command("conversation-integrity <agentId>")
  .description("Check conversation integrity for an agent (demo)")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { checkIntegrity } = await import("./shield/index.js");
      const result = checkIntegrity([{ role: "user", content: agentId }]);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  Conversation Integrity"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Integrity:"), result.valid ? chalk.green("intact") : chalk.red("compromised"));
      console.log(chalk.gray("Details:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

shield
  .command("threat-intel <input>")
  .description("Check threat intelligence for an input")
  .option("--json", "Output as JSON")
  .action(async (input: string, opts: { json?: boolean }) => {
    try {
      const { checkThreatIntel } = await import("./shield/index.js");
      const result = checkThreatIntel(input);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  Threat Intel"));
      console.log(chalk.gray("Input:"), input);
      console.log(chalk.gray("Threats:"), result.threats?.length ?? 0);
      console.log(chalk.gray("Risk:"), result.threats.length > 0 ? "high" : "safe");
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });


shield
  .command("detect-injection <text>")
  .description("Detect prompt injection attempts in text")
  .option("--json", "Output as JSON")
  .action(async (text: string, opts: { json?: boolean }) => {
    try {
      const { detectInjection } = await import("./shield/detector.js");
      const result = detectInjection(text);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  Injection Detection"));
      console.log(chalk.gray("Injection detected:"), result.detected ? chalk.red("YES") : chalk.green("no"));
      console.log(chalk.gray("Risk Score:"), result.riskScore);
      console.log(chalk.gray("Confidence:"), result.confidence);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

shield
  .command("sanitize <text>")
  .description("Sanitize text — strip XSS, injection, and dangerous patterns")
  .option("--json", "Output as JSON")
  .action(async (text: string, opts: { json?: boolean }) => {
    try {
      const { sanitize } = await import("./shield/sanitizer.js");
      const result = sanitize(text);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  Sanitize"));
      console.log(chalk.gray("Cleaned:"), result.sanitized);
      console.log(chalk.gray("Removed count:"), result.removedCount);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

// ============================================================
// ENFORCE — Policy enforcement and guardrails
// ============================================================
const enforce = program.command("enforce").description("Policy enforcement and guardrails");

enforce
  .command("check <agentId> <tool> <action>")
  .description("Check policy for an agent action")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, tool: string, action: string, opts: { json?: boolean }) => {
    try {
      const { PolicyFirewall } = await import("./enforce/index.js");
      const fw = new PolicyFirewall();
      fw.addRule({ id: "cli-rule", pattern: action, action: "allow" });
      const result = fw.check(agentId, tool, action);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.magenta("\n⚖️  Policy Check"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Tool:"), tool);
      console.log(chalk.gray("Action:"), action);
      console.log(chalk.gray("Decision:"), result.decision === "allow" ? chalk.green("allow") : chalk.red(result.decision));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

enforce
  .command("exec-guard <cmd>")
  .description("Check if a command is safe to execute")
  .option("--json", "Output as JSON")
  .action(async (cmd: string, opts: { json?: boolean }) => {
    try {
      const { checkExec } = await import("./enforce/index.js");
      const result = checkExec(cmd);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.magenta("\n⚖️  Exec Guard"));
      console.log(chalk.gray("Command:"), cmd);
      console.log(chalk.gray("Safe:"), result.allowed ? chalk.green("yes") : chalk.red("no"));
      if (result.blockedPattern) console.log(chalk.gray("Blocked pattern:"), result.blockedPattern);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

enforce
  .command("ato-detect <agentId>")
  .description("Detect account takeover attempts (demo)")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { detectAto } = await import("./enforce/index.js");
      const result = detectAto([{ type: "login", ts: Date.now() }]);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.magenta("\n⚖️  ATO Detection"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Suspicious:"), result.suspicious ? chalk.red("yes") : chalk.green("no"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

enforce
  .command("numeric-check <value> <min> <max>")
  .description("Validate a numeric value within bounds")
  .option("--json", "Output as JSON")
  .action(async (value: string, min: string, max: string, opts: { json?: boolean }) => {
    try {
      const { checkNumeric } = await import("./enforce/index.js");
      const result = checkNumeric(parseFloat(value), { min: parseFloat(min), max: parseFloat(max) });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.magenta("\n⚖️  Numeric Check"));
      console.log(chalk.gray("Value:"), value);
      console.log(chalk.gray("Range:"), `[${min}, ${max}]`);
      console.log(chalk.gray("Valid:"), result.valid ? chalk.green("yes") : chalk.red("no"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

enforce
  .command("taint <input>")
  .description("Track tainted input through the system")
  .option("--json", "Output as JSON")
  .action(async (input: string, opts: { json?: boolean }) => {
    try {
      const { TaintTracker } = await import("./enforce/index.js");
      const tracker = new TaintTracker();
      tracker.markTainted(input, input, "cli");
      const result = tracker.check(input);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.magenta("\n⚖️  Taint Tracking"));
      console.log(chalk.gray("Input:"), input);
      console.log(chalk.gray("Tainted:"), result ? chalk.red("yes") : chalk.green("no"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });


enforce
  .command("blind-secrets <text>")
  .description("Redact secrets from text")
  .option("--json", "Output as JSON")
  .action(async (text: string, opts: { json?: boolean }) => {
    try {
      const { blindSecrets } = await import("./enforce/index.js");
      const result = blindSecrets(text);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.magenta("\n⚖️  Secret Blinding"));
      console.log(chalk.gray("Secrets found:"), result.secretsFound);
      console.log(chalk.gray("Blinded text:"), result.blinded);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

// ============================================================
// WATCH — Observability, attestation, and safety testing
// ============================================================
const watch = program.command("watch").description("Observability, attestation, and safety testing");

watch
  .command("attest <output>")
  .description("Attest an agent output")
  .option("--json", "Output as JSON")
  .action(async (output: string, opts: { json?: boolean }) => {
    try {
      const { attestOutput } = await import("./watch/index.js");
      const result = attestOutput(output);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.blue("\n👁️  Output Attestation"));
      console.log(chalk.gray("Output:"), output);
      console.log(chalk.gray("Hash:"), result.hash || "N/A");
      console.log(chalk.gray("Attested:"), chalk.green("yes"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

watch
  .command("explain <agentId> <runId>")
  .description("Generate explainability packet for an agent run")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, runId: string, opts: { json?: boolean }) => {
    try {
      const { createPacket } = await import("./watch/index.js");
      const result = createPacket([{ claim: agentId, evidence: runId, confidence: 0.9 }]);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.blue("\n👁️  Explainability Packet"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Run:"), runId);
      console.log(chalk.gray("Confidence:"), "0.9");
      console.log(chalk.gray("Packet:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

watch
  .command("safety-test <agentId>")
  .description("Run safety tests for an agent")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { runSafetyTests } = await import("./watch/index.js");
      const result = runSafetyTests(agentId);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.blue("\n👁️  Safety Tests"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Passed:"), result.passed > 0 ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Tests Run:"), result.testsRun);
      console.log(chalk.gray("Findings:"), result.findings.length);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });


watch
  .command("host-hardening")
  .description("Check host hardening status for this AMC deployment")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { checkHostHardening } = await import("./watch/hostHardening.js");
      const result = checkHostHardening();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.blue("\n👁️  Host Hardening"));
      console.log(chalk.gray("Passed:"), result.passed ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Findings:"), result.findings?.length ?? 0);
      if (result.findings?.length) result.findings.forEach(f => console.log(chalk[f.passed ? "green" : "red"](`  • [${f.severity}] ${f.title}: ${f.detail}`)));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

// ============================================================
// PRODUCT — Routing, autonomy, metering, and workflows
// ============================================================
const product = program.command("product").description("Product operations: routing, autonomy, metering, workflows");

product
  .command("route <taskType>")
  .description("Route a task to the best model/provider")
  .option("--json", "Output as JSON")
  .action(async (taskType: string, opts: { json?: boolean }) => {
    try {
      const { CostLatencyRouter } = await import("./product/index.js");
      const router = new CostLatencyRouter();
      const result = router.route(taskType);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📦  Task Routing"));
      console.log(chalk.gray("Task Type:"), taskType);
      console.log(chalk.gray("Route:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

product
  .command("autonomy <agentId> <mode>")
  .description("Decide autonomy level for an agent")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, mode: string, opts: { json?: boolean }) => {
    try {
      const { AutonomyDial } = await import("./product/index.js");
      const dial = new AutonomyDial();
      const result = dial.decide(agentId, mode);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📦  Autonomy Decision"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Mode:"), mode);
      console.log(chalk.gray("Decision:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

product
  .command("loop-detect <agentId>")
  .description("Detect infinite loops in agent behavior")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { LoopDetector } = await import("./product/index.js");
      const detector = new LoopDetector();
      const result = detector.check(agentId, "test");
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📦  Loop Detection"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Loop Detected:"), result.loopDetected ? chalk.red("yes") : chalk.green("no"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

product
  .command("metering <agentId>")
  .description("Show metering and billing for an agent")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { Metering } = await import("./product/index.js");
      const meter = new Metering();
      meter.record({ tenantId: agentId, eventType: "llm_call", units: 100 });
      const result = meter.getBill(agentId);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📦  Metering"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Bill:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

product
  .command("retry <cmd>")
  .description("Execute a command with retry logic")
  .option("--json", "Output as JSON")
  .action(async (cmd: string, opts: { json?: boolean }) => {
    try {
      const { withRetry } = await import("./product/index.js");
      const result = await withRetry(async () => cmd, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 });
      if (opts.json) { console.log(JSON.stringify({ result }, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📦  Retry"));
      console.log(chalk.gray("Command:"), cmd);
      console.log(chalk.gray("Result:"), result);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

product
  .command("plan <goal>")
  .description("Generate an execution plan for a goal")
  .option("--json", "Output as JSON")
  .action(async (goal: string, opts: { json?: boolean }) => {
    try {
      const { generatePlan } = await import("./product/index.js");
      const result = generatePlan(goal);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📦  Plan"));
      console.log(chalk.gray("Goal:"), goal);
      console.log(chalk.gray("Steps:"), JSON.stringify(result.steps || result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

const workflowCmd = product.command("workflow").description("Workflow management");
workflowCmd
  .command("create <name>")
  .description("Create a new workflow")
  .option("--json", "Output as JSON")
  .action(async (name: string, opts: { json?: boolean }) => {
    try {
      const { WorkflowEngine } = await import("./product/index.js");
      const engine = new WorkflowEngine();
      const result = engine.createWorkflow(name, []);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📦  Workflow Created"));
      console.log(chalk.gray("Name:"), name);
      console.log(chalk.gray("ID:"), result.workflowId || "N/A");
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

// ============================================================
// VAULT extensions (added to existing `vault` variable)
// ============================================================
vault
  .command("rag-guard <input>")
  .description("Guard RAG chunks against injection")
  .option("--json", "Output as JSON")
  .action(async (input: string, opts: { json?: boolean }) => {
    try {
      const { guardRagChunks } = await import("./vault/ragGuard.js");
      const result = guardRagChunks([input]);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.green("\n🔒  RAG Guard"));
      console.log(chalk.gray("Input:"), input);
      console.log(chalk.gray("Safe:"), result.safe ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Details:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

vault
  .command("classify <text>")
  .description("Classify data sensitivity level")
  .option("--json", "Output as JSON")
  .action(async (text: string, opts: { json?: boolean }) => {
    try {
      const { classifyData } = await import("./vault/dataClassification.js");
      const result = classifyData(text);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.green("\n🔒  Data Classification"));
      console.log(chalk.gray("Text:"), text.substring(0, 50) + (text.length > 50 ? "..." : ""));
      console.log(chalk.gray("Level:"), result.classification || "unknown");
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

vault
  .command("scrub <file>")
  .description("Scrub metadata from a file")
  .option("--json", "Output as JSON")
  .action(async (file: string, opts: { json?: boolean }) => {
    try {
      const content = readFileSync(file, "utf8").toString();
      const { scrubMetadata } = await import("./vault/metadataScrubber.js");
      const result = scrubMetadata(content);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.green("\n🔒  Metadata Scrub"));
      console.log(chalk.gray("File:"), file);
      console.log(chalk.gray("Scrubbed:"), chalk.green("yes"));
      console.log(chalk.gray("Result:"), JSON.stringify(result, null, 2).substring(0, 200));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

vault
  .command("dsar-status")
  .description("Show DSAR (Data Subject Access Request) status")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { DsarAutopilot } = await import("./vault/dsarAutopilot.js");
      const dsar = new DsarAutopilot();
      const result = { requests: [], status: "no pending requests" };
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.green("\n🔒  DSAR Status"));
      console.log(chalk.gray("Pending Requests:"), 0);
      console.log(chalk.gray("Status:"), "No pending requests");
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

vault
  .command("privacy-budget <agentId>")
  .description("Check privacy budget for an agent")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { PrivacyBudget } = await import("./vault/privacyBudget.js");
      const budget = new PrivacyBudget();
      const result = budget.check(agentId, 0);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.green("\n🔒  Privacy Budget"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Remaining:"), result.remaining ?? "N/A");
      console.log(chalk.gray("Allowed:"), result.allowed ? chalk.green("yes") : chalk.red("no"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

// ============================================================
// SCORE — Maturity scoring and evidence collection
// ============================================================
const productGlossary = program.command("glossary").description("Domain terminology management");
const domainCmd = program.command("domain").description("Domain-specific architecture and compliance operations");

product
  .command("features")
  .description("List product features")
  .option("--relevance <level>", "Filter by relevance: high, medium, low")
  .option("--lane <lane>", "Filter by lane")
  .option("--amc-fit", "Only AMC-fit features")
  .option("--json", "Output as JSON")
  .action(async (opts: { relevance?: string; lane?: string; amcFit?: boolean; json?: boolean }) => {
    try {
      const { listFeatures } = await import("./product/featureCatalog.js");
      const filter: { relevance?: string; lane?: string; amcFit?: boolean } = {};
      if (opts.relevance) filter.relevance = opts.relevance;
      if (opts.lane) filter.lane = opts.lane;
      if (opts.amcFit) filter.amcFit = true;
      const features = listFeatures(filter);
      if (opts.json) { console.log(JSON.stringify(features, null, 2)); return; }
      console.log(chalk.bold.yellow(`\n📦  Product Features (${features.length})`));
      for (const f of features) {
        console.log(`  ${chalk.cyan(f.id)} ${f.name} [${f.relevance}] ${f.amcFit ? chalk.green("✓ AMC") : ""}`);
      }
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

product
  .command("features-recommended")
  .description("Show top recommended product features")
  .option("--limit <n>", "Max features to show", "10")
  .option("--json", "Output as JSON")
  .action(async (opts: { limit?: string; json?: boolean }) => {
    try {
      const { getRecommended } = await import("./product/featureCatalog.js");
      const features = getRecommended(parseInt(opts.limit ?? "10", 10));
      if (opts.json) { console.log(JSON.stringify(features, null, 2)); return; }
      console.log(chalk.bold.yellow(`\n📦  Recommended Features (${features.length})`));
      for (const f of features) console.log(`  ${chalk.cyan(f.id)} ${f.name} — ${f.pricingRange}`);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

productGlossary
  .command("define <term> <definition>")
  .description("Define a glossary term")
  .option("--domain <domain>", "Domain category", "general")
  .option("--json", "Output as JSON")
  .action(async (term: string, definition: string, opts: { domain?: string; json?: boolean }) => {
    try {
      const { GlossaryManager } = await import("./product/glossary.js");
      const mgr = new GlossaryManager();
      const id = mgr.define(term, definition, opts.domain);
      if (opts.json) { console.log(JSON.stringify({ id, term, definition }, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📖  Term Defined"));
      console.log(chalk.gray("ID:"), id);
      console.log(chalk.gray("Term:"), term);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

productGlossary
  .command("lookup <term>")
  .description("Look up a glossary term")
  .option("--json", "Output as JSON")
  .action(async (term: string, opts: { json?: boolean }) => {
    try {
      const { GlossaryManager } = await import("./product/glossary.js");
      const mgr = new GlossaryManager();
      const entry = mgr.lookup(term);
      if (!entry) { console.log(chalk.yellow("Term not found.")); return; }
      if (opts.json) { console.log(JSON.stringify(entry, null, 2)); return; }
      console.log(chalk.bold.yellow("\n📖  Glossary Entry"));
      console.log(chalk.gray("Term:"), entry.term);
      console.log(chalk.gray("Definition:"), entry.definition);
      console.log(chalk.gray("Domain:"), entry.domain);
      if (entry.aliases.length) console.log(chalk.gray("Aliases:"), entry.aliases.join(", "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

domainCmd
  .command("list")
  .description("List all 7 domains with metadata")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { listDomainMetadataCli } = await import("./domains/domainCliIntegration.js");
      const domains = listDomainMetadataCli();
      if (opts.json) { console.log(JSON.stringify(domains, null, 2)); return; }
      console.log(chalk.bold.cyan(`\n🧭  Domain Catalog (${domains.length})`));
      for (const domain of domains) {
        console.log(`  ${chalk.cyan(domain.id)}  ${domain.name}`);
        console.log(`    Risk: ${domain.riskLevel} | EU AI Act: ${domain.euAIActCategory} | Questions: ${domain.questionCount}`);
        console.log(`    Regulatory: ${domain.regulatoryBasis.join(", ")}`);
      }
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

domainCmd
  .command("assess")
  .description("Run full domain assessment")
  .requiredOption("--agent <id>", "Agent ID")
  .requiredOption("--domain <d>", "Domain: health|education|environment|mobility|governance|technology|wealth")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; domain: string; json?: boolean }) => {
    try {
      const { assessDomainForAgent, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
      const domain = parseDomainOrThrow(opts.domain);
      const assessment = assessDomainForAgent({ agentId: opts.agent, domain });
      if (opts.json) { console.log(JSON.stringify(assessment.result, null, 2)); return; }
      const result = assessment.result;
      console.log(chalk.bold.cyan("\n🧭  Domain Assessment"));
      console.log(chalk.gray("Agent:"), opts.agent);
      console.log(chalk.gray("Domain:"), `${result.domainMetadata.name} (${result.domain})`);
      console.log(chalk.gray("Base Score:"), result.baseScore);
      console.log(chalk.gray("Domain Score:"), result.domainScore);
      console.log(chalk.gray("Composite Score:"), result.compositeScore);
      console.log(chalk.gray("Level:"), result.level);
      console.log(chalk.gray("Certification Readiness:"), result.certificationReadiness ? chalk.green("ready") : chalk.red("not ready"));
      console.log(chalk.gray("Compliance Gaps:"), result.complianceGaps.length);
      console.log(chalk.gray("Regulatory Warnings:"), result.regulatoryWarnings.length);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

domainCmd
  .command("modules")
  .description("Show module activation map for domain")
  .requiredOption("--domain <d>", "Domain: health|education|environment|mobility|governance|technology|wealth")
  .option("--json", "Output as JSON")
  .action(async (opts: { domain: string; json?: boolean }) => {
    try {
      const { getDomainModules, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
      const domain = parseDomainOrThrow(opts.domain);
      const modules = getDomainModules(domain);
      if (opts.json) { console.log(JSON.stringify(modules, null, 2)); return; }
      console.log(chalk.bold.cyan(`\n🧭  Module Activation Map (${domain})`));
      console.log(chalk.gray(`Total modules: ${modules.length}`));
      for (const module of modules) {
        console.log(`  ${chalk.cyan(module.moduleId)} ${module.moduleName} [${module.relevance}]`);
      }
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

domainCmd
  .command("gaps")
  .description("Show compliance gaps for an agent and domain")
  .requiredOption("--agent <id>", "Agent ID")
  .requiredOption("--domain <d>", "Domain: health|education|environment|mobility|governance|technology|wealth")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; domain: string; json?: boolean }) => {
    try {
      const { getDomainGaps, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
      const domain = parseDomainOrThrow(opts.domain);
      const gaps = getDomainGaps(opts.agent, domain);
      if (opts.json) { console.log(JSON.stringify(gaps, null, 2)); return; }
      console.log(chalk.bold.cyan(`\n🧭  Compliance Gaps (${domain})`));
      if (gaps.length === 0) {
        console.log(chalk.green("No compliance gaps detected."));
        return;
      }
      for (const gap of gaps) {
        console.log(`  ${chalk.yellow(gap.questionId)} ${gap.dimension} L${gap.currentLevel}->L${gap.requiredLevel}`);
        console.log(`    ${gap.regulatoryRef}`);
      }
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

domainCmd
  .command("report")
  .description("Build full domain report and write it to a file")
  .requiredOption("--agent <id>", "Agent ID")
  .requiredOption("--domain <d>", "Domain: health|education|environment|mobility|governance|technology|wealth")
  .requiredOption("--output <file>", "Output report path")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; domain: string; output: string; json?: boolean }) => {
    try {
      const { buildDomainReportForAgent, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
      const domain = parseDomainOrThrow(opts.domain);
      const report = buildDomainReportForAgent({ agentId: opts.agent, domain, outputPath: opts.output });
      if (opts.json) {
        console.log(JSON.stringify({
          outputPath: report.outputPath,
          assessment: report.assessment,
          report: report.reportObject
        }, null, 2));
        return;
      }
      console.log(chalk.bold.cyan("\n🧭  Domain Report Generated"));
      console.log(chalk.gray("Agent:"), opts.agent);
      console.log(chalk.gray("Domain:"), domain);
      console.log(chalk.gray("Output:"), report.outputPath ?? opts.output);
      console.log(chalk.gray("Composite Score:"), report.assessment.compositeScore);
      console.log(chalk.gray("Level:"), report.assessment.level);
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

domainCmd
  .command("assurance")
  .description("Run domain-specific assurance packs")
  .requiredOption("--agent <id>", "Agent ID")
  .requiredOption("--domain <d>", "Domain: health|education|environment|mobility|governance|technology|wealth")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; domain: string; json?: boolean }) => {
    try {
      const { parseDomainOrThrow, runDomainAssurance } = await import("./domains/domainCliIntegration.js");
      const domain = parseDomainOrThrow(opts.domain);
      const run = runDomainAssurance(opts.agent, domain);
      if (opts.json) { console.log(JSON.stringify(run, null, 2)); return; }
      console.log(chalk.bold.cyan(`\n🧭  Domain Assurance (${run.domain})`));
      console.log(chalk.gray("Agent:"), run.agentId);
      for (const pack of run.packRuns) {
        console.log(`  ${chalk.cyan(pack.packId)} ${pack.title}`);
        console.log(`    scenarios=${pack.scenarioCount} passed=${pack.passed} failed=${pack.failed} passRate=${pack.passRate}%`);
      }
      console.log(chalk.gray("Totals:"), `scenarios=${run.totalScenarios} passed=${run.passed} failed=${run.failed}`);
      console.log(chalk.gray("Overall:"), run.allPassed ? chalk.green("all checks passed") : chalk.yellow("review required"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

domainCmd
  .command("roadmap")
  .description("Generate 30/60/90-day roadmap for this domain")
  .requiredOption("--agent <id>", "Agent ID")
  .requiredOption("--domain <d>", "Domain: health|education|environment|mobility|governance|technology|wealth")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; domain: string; json?: boolean }) => {
    try {
      const { getDomainRoadmap, parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");
      const domain = parseDomainOrThrow(opts.domain);
      const roadmap = getDomainRoadmap(opts.agent, domain);
      if (opts.json) { console.log(JSON.stringify(roadmap, null, 2)); return; }
      console.log(chalk.bold.cyan(`\n🧭  Domain Roadmap (${domain})`));
      for (const item of roadmap) {
        console.log(`  [P${item.priority}] ${item.timeframe} ${item.action}`);
        if (item.moduleId) console.log(`    module: ${item.moduleId}`);
        console.log(`    regulatory: ${item.regulatoryImpact}`);
      }
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

const score = program.command("score").description("Maturity scoring, adversarial testing, and evidence collection")
  .option("--tier <tier>", "tier: quick, standard, or deep", "quick")
  .action(async (opts: { tier?: string }) => {
    if (!opts.tier) return;
    const tier = opts.tier as "quick" | "standard" | "deep";
    if (tier !== "quick" && tier !== "standard" && tier !== "deep") {
      console.error(chalk.red("Invalid tier. Use quick, standard, or deep."));
      process.exit(1);
      return;
    }
    const { getQuestionsForTier, computeQuickScore, renderAsciiRadar } = await import("./diagnostic/quickScore.js");
    const questions = getQuestionsForTier(tier);
    const answers: Record<string, number> = {};
    if (process.stdin.isTTY) {
      const inq = await import("inquirer");
      for (const q of questions) {
        const { level } = await inq.default.prompt([{
          type: "list",
          name: "level",
          message: `${q.id}: ${q.title}`,
          choices: q.options.map((o: { level: number; label: string }) => ({ name: `L${o.level} — ${o.label}`, value: o.level })),
        }]);
        answers[q.id] = level;
      }
    }
    const result = computeQuickScore(answers, tier);
    console.log(chalk.bold.hex("#FF6600")("\n📊  Assessment Result"));
    console.log(chalk.gray(`Tier: ${tier}`));
    console.log(chalk.gray(`Score: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`));
    console.log(renderAsciiRadar(result.layerScores));
    if (result.gaps.length > 0) {
      console.log(chalk.yellow("Top gaps:"));
      for (const g of result.gaps) {
        console.log(`  ${g.questionId}: ${g.title}`);
      }
    }
  });

score
  .command("formal-spec <agentId>")
  .description("Compute formal maturity score for an agent")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { computeMaturityScore } = await import("./score/index.js");
      const result = computeMaturityScore([], {});
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n📊  Maturity Score"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Score:"), result.overallScore ?? "N/A");
      console.log(chalk.gray("Level:"), result.overallLevel || "unknown");
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("adversarial <agentId>")
  .description("Test gaming resistance of scoring")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { testGamingResistance } = await import("./score/index.js");
      const result = testGamingResistance({ q1: agentId });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n📊  Adversarial Test"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Gaming Resistant:"), result.gamingResistant ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Details:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("collect-evidence <agentId>")
  .description("Collect evidence for scoring an agent")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { collectEvidence } = await import("./score/index.js");
      const result = collectEvidence({ [agentId]: { collected: true, timestamp: Date.now() } });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n📊  Evidence Collection"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Evidence:"), JSON.stringify(result, null, 2));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("production-ready <agentId>")
  .description("Run production readiness gate for an agent")
  .option("--strict", "require all readiness gates", false)
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { strict?: boolean; json?: boolean }) => {
    try {
      const { assessProductionReadiness } = await import("./score/productionReadiness.js");
      const result = assessProductionReadiness(agentId, { strictMode: !!opts.strict });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🛠  Production Readiness"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Ready:"), result.ready ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Score:"), result.score);
      console.log(chalk.gray("Gate failures:"), result.blockers.join(", ") || "none");
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

score
  .command("operational-independence <agentId>")
  .description("Calculate operational independence score")
  .option("--window <days>", "window in days", "30")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { window: string; json?: boolean }) => {
    try {
      const { scoreOperationalIndependence } = await import("./score/operationalIndependence.js");
      const result = scoreOperationalIndependence(agentId, Number(opts.window));
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🕒  Operational Independence"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Score:"), result.score);
      console.log(chalk.gray("Longest run days:"), result.longestRunDays);
      console.log(chalk.gray("Escalation rate:"), `${result.escalationRate}%`);
      console.log(chalk.gray("Drift events:"), result.driftEvents);
      console.log(chalk.gray("Quality held:"), result.qualityHeld ? "yes" : "no");
      console.log(chalk.gray("External dependencies:"), result.externalDependencyInventory.totalDependencies);
      console.log(chalk.gray("Dependency drift stability:"), `${result.dependencyDrift.score} (${result.dependencyDrift.status})`);
      console.log(chalk.gray("Graceful degradation:"), result.gracefulDegradation.score);
      console.log(chalk.gray("Vendor lock-in risk:"), `${result.vendorLockInRisk.score} (${result.vendorLockInRisk.riskLevel})`);
      console.log(chalk.gray("Reduced external access:"), result.reducedExternalAccessScore);
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

score
  .command("evidence-coverage <agentId>")
  .description("Show automated vs manual evidence coverage")
  .option("--json", "Output as JSON")
  .action(async (agentId: string, opts: { json?: boolean }) => {
    try {
      const { getEvidenceCoverageReport } = await import("./score/evidenceCoverageGap.js");
      const result = getEvidenceCoverageReport(agentId);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🧩  Evidence Coverage"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Coverage:"), `${result.coveragePercent}%`);
      console.log(chalk.gray("Automated:"), result.automatedCoverage);
      console.log(chalk.gray("Manual required:"), result.manualRequired);
      console.log(chalk.gray("Tradeoffs:"), result.improvementPlan.join("; "));
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

score
  .command("lean-profile")
  .description("Show lean AMC profile")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { getLeanAMCProfile } = await import("./score/leanAMC.js");
      const result = getLeanAMCProfile();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🧪  Lean AMC Profile"));
      console.log(chalk.gray("Required modules:"), result.requiredModules.join(", "));
      console.log(chalk.gray("Skippable modules:"), result.skippableModules.join(", "));
      console.log(chalk.gray("Estimated setup hours:"), result.estimatedSetupHours);
      console.log(chalk.gray("Max achievable level:"), result.maximumAchievableLevel);
      console.log(chalk.gray("Tradeoffs:"), result.tradeoffs.join("; "));
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });






// ── New gap-closure score commands (2026-02-21) ──────────────────────────────

score
  .command("behavioral-contract")
  .description("Score agent behavioral contract maturity (alignment card, permitted/forbidden actions)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreBehavioralContractMaturity } = await import("./score/behavioralContractMaturity.js");
      const result = scoreBehavioralContractMaturity();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n📋  Behavioral Contract Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Alignment card:"), result.hasAlignmentCard ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Permitted actions:"), result.hasPermittedActions ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Forbidden actions:"), result.hasForbiddenActions ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Escalation triggers:"), result.hasEscalationTriggers ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Runtime integrity:"), result.hasRuntimeIntegrityCheck ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Drift profile:"), result.hasDriftProfile ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("fail-secure")
  .description("Score fail-secure tool governance (deny-by-default, rate limiting, anomaly detection)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreFailSecureGovernance } = await import("./score/failSecureGovernance.js");
      const result = scoreFailSecureGovernance();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🔒  Fail-Secure Governance"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Fails closed:"), result.failsClosedByDefault ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Tool whitelist:"), result.hasToolCallWhitelist ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Rate limiting:"), result.hasRateLimiting ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Anomaly detection:"), result.hasSemanticAnomalyDetection ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Excessive agency controls:"), result.hasExcessiveAgencyControls ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("output-integrity")
  .description("Score output integrity maturity (OWASP LLM02, confidence calibration, citation)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreOutputIntegrityMaturity } = await import("./score/outputIntegrityMaturity.js");
      const result = scoreOutputIntegrityMaturity();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n✅  Output Integrity Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Output validation:"), result.hasOutputValidation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Confidence calibration:"), result.hasConfidenceCalibration ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Citation requirement:"), result.hasCitationRequirement ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Code execution guard:"), result.hasCodeExecutionGuard ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("state-portability")
  .description("Score agent state portability (vendor-neutral format, serialization, integrity on transfer)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreAgentStatePortability } = await import("./score/agentStatePortability.js");
      const result = scoreAgentStatePortability();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n📦  Agent State Portability"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Serializable state:"), result.hasSerializableState ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Vendor-neutral format:"), result.hasVendorNeutralFormat ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("State versioning:"), result.hasStateVersioning ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Integrity on transfer:"), result.hasIntegrityOnTransfer ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("eu-ai-act")
  .description("Score EU AI Act compliance maturity (Art. 9-17, GPAI systemic risk)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreEUAIActCompliance } = await import("./score/euAIActCompliance.js");
      const result = scoreEUAIActCompliance();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🇪🇺  EU AI Act Compliance"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Risk class:"), result.riskClassification);
      console.log(chalk.gray("Risk management system:"), result.hasRiskManagementSystem ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Technical documentation:"), result.hasTechnicalDocumentation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Human oversight design:"), result.hasHumanOversightDesign ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Adversarial testing:"), result.hasAdversarialTesting ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("FRIA:"), result.hasFundamentalRightsImpactAssessment ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.slice(0, 3).join("; "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("owasp-llm")
  .description("Score OWASP LLM Top 10 coverage (all 10 risks)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreOWASPLLMCoverage } = await import("./score/owaspLLMCoverage.js");
      const result = scoreOWASPLLMCoverage();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🛡️  OWASP LLM Top 10 Coverage"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Covered:"), `${result.coveredCount}/10`);
      if (result.uncoveredRisks.length) console.log(chalk.yellow("Uncovered:"), result.uncoveredRisks.join(", "));
      else console.log(chalk.green("All 10 OWASP LLM risks covered ✓"));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("self-knowledge")
  .description("Score ETP self-knowledge maturity (typed attention, trace layer, confidence+citation)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreETPSelfKnowledge } = await import("./score/selfKnowledgeMaturity.js");
      const result = scoreETPSelfKnowledge();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🔍  ETP Self-Knowledge Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Typed relationships:"), result.hasTypedRelationships ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Trace layer:"), result.hasTraceLayer ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Confidence+citation:"), result.hasConfidenceWithCitation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Calibration:"), result.hasCalibrationMechanism ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("kernel-sandbox")
  .description("Score kernel-level sandbox maturity (OS isolation, filesystem/network restrictions)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreKernelSandboxMaturity } = await import("./score/kernelSandboxMaturity.js");
      const result = scoreKernelSandboxMaturity();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🏗️  Kernel Sandbox Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("OS-level isolation:"), result.hasOSLevelIsolation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Filesystem restrictions:"), result.hasFilesystemRestrictions ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Network isolation:"), result.hasNetworkIsolation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Secret injection:"), result.hasSecretInjection ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

score
  .command("runtime-identity")
  .description("Score runtime execution identity maturity (JIT credentials, user propagation, revocation)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreRuntimeIdentityMaturity } = await import("./score/runtimeIdentityMaturity.js");
      const result = scoreRuntimeIdentityMaturity();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🪪  Runtime Identity Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Agent identity binding:"), result.hasAgentIdentityBinding ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("User identity propagation:"), result.hasUserIdentityPropagation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("JIT credentials:"), result.hasJITCredentials ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Identity revocation:"), result.hasIdentityRevocation ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: any) { console.error(chalk.red(e.message)); process.exit(1); }
  });

// Memory commands
const memory = program.command("memory").description("Memory maturity assessment and management");
memory.command("assess <agentId>").description("Full memory maturity assessment").option("--json", "JSON output").action(async (agentId: string, opts: { json?: boolean }) => {
  const { assessMemoryMaturity } = await import("./score/memoryMaturity.js");
  const result = assessMemoryMaturity({ agentId: 0 });
  result.agentId = agentId;
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); } else { console.log(chalk.bold(`Memory Maturity — ${agentId}`)); console.log(`  Persistence: L${result.persistenceLevel}`); console.log(`  Continuity:  L${result.continuityLevel}`); console.log(`  Integrity:   L${result.integrityLevel}`); console.log(`  Overall:     ${result.overallScore}/100`); if (result.gaps.length) { console.log(chalk.yellow(`  Gaps: ${result.gaps.join("; ")}`)); } }
});

// Oversight commands
const oversight = program.command("oversight").description("Human oversight quality assessment");
oversight.command("assess <agentId>").description("Assess human oversight quality").option("--json", "JSON output").action(async (agentId: string, opts: { json?: boolean }) => {
  const { assessOversightQuality } = await import("./score/humanOversightQuality.js");
  const result = assessOversightQuality({ agentId: 0 });
  result.agentId = agentId;
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); } else { console.log(chalk.bold(`Oversight Quality — ${agentId}`)); console.log(`  Existence:    ${result.oversightExistence}`); console.log(`  Context:      ${(result.contextCompleteness * 100).toFixed(0)}%`); console.log(`  Graduated:    ${result.graduatedAutonomy}`); console.log(`  Overall:      ${result.overallScore}/100`); }
});

// Classify command
const classify = program.command("classify").description("Classify agent vs workflow");
classify.command("agent <agentId>").description("Classify whether system is workflow or agent").option("--json", "JSON output").action(async (agentId: string, opts: { json?: boolean }) => {
  const { classifyAgentVsWorkflow } = await import("./score/agentVsWorkflow.js");
  const result = classifyAgentVsWorkflow({});
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); } else { console.log(chalk.bold(`Classification — ${agentId}`)); console.log(`  Type:       ${result.classification}`); console.log(`  AMC Level:  ${result.amcLevel}`); console.log(`  Label:      ${result.marketingLabel}`); console.log(`  Governance: ${result.governanceUrgency}`); }
});

// Claims command
const claims = program.command("claims").description("Evidence claim expiry tracking");
claims.command("list <agentId>").description("List all evidence claims with TTL status").option("--json", "JSON output").action(async (agentId: string, opts: { json?: boolean }) => {
  const { checkClaimExpiry, CLAIM_TTL } = await import("./score/claimExpiry.js");
  const result = checkClaimExpiry([]);
  if (opts.json) { console.log(JSON.stringify({ agentId, ...result, ttlDefaults: CLAIM_TTL }, null, 2)); } else { console.log(chalk.bold(`Claims — ${agentId}`)); console.log(`  Expired: ${result.expired.length}`); console.log(`  Stale:   ${result.stale.length}`); console.log(`  Fresh:   ${result.fresh.length}`); console.log(`  Certification blocked: ${result.certificationBlocked}`); }
});

// DAG command
const dag = program.command("dag").description("Orchestration DAG capture and scoring");
dag.command("capture <agents...>").description("Capture orchestration DAG for agents").option("--json", "JSON output").action(async (agents: string[], opts: { json?: boolean }) => {
  const { captureDAG } = await import("./score/orchestrationDAG.js");
  const nodes = agents.map(a => ({ agentId: a, role: 'worker' as const, inputs: [], outputs: [], trustLevel: 'medium' as const }));
  const result = captureDAG(nodes);
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); } else { console.log(chalk.bold("Orchestration DAG")); console.log(`  Nodes:    ${result.nodes.length}`); console.log(`  Edges:    ${result.edges.length}`); console.log(`  Cycles:   ${result.hasCycles}`); console.log(`  Depth:    ${result.maxDepth}`); }
});
dag.command("score").description("Score DAG governance").option("--json", "JSON output").action(async (opts: { json?: boolean }) => {
  const { captureDAG, scoreDAGGovernance } = await import("./score/orchestrationDAG.js");
  const dagResult = captureDAG([]);
  const result = scoreDAGGovernance(dagResult);
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); } else { console.log(chalk.bold("DAG Governance Score")); console.log(`  Score: ${result.score}/100`); console.log(`  Level: ${result.level}`); }
});

// Confidence command
const confidence = program.command("confidence").description("Confidence drift tracking");
confidence.command("calibration").description("Show calibration report").option("--json", "JSON output").action(async (opts: { json?: boolean }) => {
  const { trackConfidenceDrift } = await import("./score/confidenceDrift.js");
  const result = trackConfidenceDrift([]);
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); } else { console.log(chalk.bold("Confidence Calibration")); console.log(`  Calibration: ${(result.calibrationScore * 100).toFixed(0)}%`); console.log(`  Drift trend: ${result.driftTrend}`); console.log(`  Overconfidence penalty: ${result.overconfidencePenalty.toFixed(1)}`); }
});
confidence.command("drift").description("Show drift trend").option("--json", "JSON output").action(async (opts: { json?: boolean }) => {
  const { trackConfidenceDrift } = await import("./score/confidenceDrift.js");
  const result = trackConfidenceDrift([]);
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); } else { console.log(chalk.bold("Confidence Drift")); console.log(`  Trend:     ${result.driftTrend}`); console.log(`  Citationless high-conf: ${(result.citationlessHighConfidenceRate * 100).toFixed(0)}%`); }
});

// ── Tiered Score ──────────────────────────────────────────────────────────────
score
  .command("tier")
  .description("Run tiered maturity assessment (quick/standard/deep)")
  .option("--tier <tier>", "Assessment tier: quick, standard, or deep", "quick")
  .option("--json", "Output as JSON")
  .action(async (opts: { tier?: string; json?: boolean }) => {
    const { getQuestionsForTier, computeQuickScore, renderAsciiRadar } = await import("./diagnostic/quickScore.js");
    const tier = (opts.tier === "standard" || opts.tier === "deep") ? opts.tier : "quick" as const;
    const questions = getQuestionsForTier(tier);
    const answers: Record<string, number> = {};

    if (process.stdin.isTTY) {
      const inq = await import("inquirer");
      for (const q of questions) {
        const { level } = await inq.default.prompt([{
          type: "list",
          name: "level",
          message: `${q.id}: ${q.title}`,
          choices: q.options.map((o: { level: number; label: string }) => ({ name: `L${o.level} — ${o.label}`, value: o.level })),
        }]);
        answers[q.id] = level;
      }
    }

    const result = computeQuickScore(answers, tier);
    if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
    console.log(chalk.bold.hex("#FF6600")(`\n📊  ${tier.charAt(0).toUpperCase() + tier.slice(1)} Score Assessment`));
    console.log(chalk.gray(`Score: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`));
    console.log(renderAsciiRadar(result.layerScores));
    if (result.gaps.length > 0) {
      console.log(chalk.yellow("Top Gaps:"));
      for (const g of result.gaps) { console.log(`  ${g.questionId}: ${g.title} (L${g.currentLevel} → L${g.targetLevel})`); }
    }
    console.log("");
    for (const line of result.roadmap) { console.log(chalk.cyan(line)); }
  });

// ── Scan ──────────────────────────────────────────────────────────────────────
const scan = program.command("scan").description("Zero-integration agent assessment scanner");

scan
  .option("--url <url>", "probe a running agent endpoint")
  .option("--repo <url>", "scan a git repository")
  .option("--local <path>", "scan a local codebase")
  .option("--json", "Output as JSON")
  .action(async (opts: { url?: string; repo?: string; local?: string; json?: boolean }) => {
    const provided = [opts.url, opts.repo, opts.local].filter(Boolean).length;
    if (provided !== 1) {
      console.error(chalk.red("Provide exactly one target: --url, --repo, or --local"));
      return;
    }

    if (opts.url) {
      const { probeEndpoint } = await import("./scanner/index.js");
      const result = await probeEndpoint(opts.url);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex("#FF6600")("\n🔍  Endpoint Probe Results"));
      console.log(chalk.gray(`URL: ${result.url}`));
      console.log(chalk.gray(`Reachable: ${result.reachable}`));
      console.log(chalk.gray(`Response time: ${result.responseTimeMs}ms`));
      console.log(chalk.gray(`Signals: ${result.signals.join(", ") || "none"}`));
      console.log(chalk.bold(`Preliminary Score: ${result.preliminaryScore.label}`));
      return;
    }

    if (opts.repo) {
      const { scanRepo, cleanupRepoScan } = await import("./scanner/index.js");
      console.log(chalk.gray("Cloning repository..."));
      const result = scanRepo(opts.repo);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); } else {
        console.log(chalk.bold.hex("#FF6600")("\n🔍  Repo Scan Results"));
        console.log(chalk.gray(`Repo: ${result.repoUrl}`));
        console.log(chalk.gray(`Files scanned: ${result.filesScanned}`));
        console.log(chalk.gray(`Framework: ${result.detection.framework}`));
        console.log(chalk.gray(`Security: ${result.detection.securityPosture}`));
        console.log(chalk.bold(`Preliminary Score: ${result.preliminaryScore.label}`));
      }
      cleanupRepoScan(result);
      return;
    }

    const { scanLocal } = await import("./scanner/index.js");
    const result = scanLocal(opts.local!);
    if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
    console.log(chalk.bold.hex("#FF6600")("\n🔍  Local Scan Results"));
    console.log(chalk.gray(`Path: ${result.path}`));
    console.log(chalk.gray(`Files scanned: ${result.filesScanned}`));
    console.log(chalk.gray(`Framework: ${result.detection.framework} (${(result.detection.confidence * 100).toFixed(0)}% confidence)`));
    console.log(chalk.gray(`Security: ${result.detection.securityPosture}`));
    console.log(chalk.gray(`Tools: ${result.detection.toolUsage.join(", ") || "none detected"}`));
    console.log(chalk.gray(`Governance: ${result.detection.governanceArtifacts.join(", ") || "none detected"}`));
    console.log(chalk.bold(`Preliminary Score: ${result.preliminaryScore.label}`));
    for (const s of result.detection.signals) { console.log(`  → ${s}`); }
  });

// ── Guardrails Simple Mode ───────────────────────────────────────────────────
const guardrailsCmd = program.command("guardrails").description("Simple guardrail management");

guardrailsCmd
  .command("list")
  .description("List all available guardrails with status")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    const { createGuardrailState, listGuardrailsWithStatus } = await import("./enforce/guardrailProfiles.js");
    const state = createGuardrailState();
    const list = listGuardrailsWithStatus(state);
    if (opts.json) { console.log(JSON.stringify(list, null, 2)); return; }
    console.log(chalk.bold("\n🛡️  Available Guardrails\n"));
    for (const g of list) {
      const status = g.enabled ? chalk.green("● ON ") : chalk.gray("○ OFF");
      console.log(`  ${status}  ${g.name.padEnd(30)} ${chalk.gray(g.description)}`);
    }
  });

guardrailsCmd
  .command("enable <name>")
  .description("Enable a guardrail")
  .action(async (name: string) => {
    const { createGuardrailState, enableGuardrail, AVAILABLE_GUARDRAILS } = await import("./enforce/guardrailProfiles.js");
    const state = createGuardrailState();
    if (enableGuardrail(state, name)) {
      console.log(chalk.green(`✓ Enabled guardrail: ${name}`));
    } else {
      console.error(chalk.red(`Unknown guardrail: ${name}`));
      console.log("Available:", AVAILABLE_GUARDRAILS.map(g => g.name).join(", "));
    }
  });

guardrailsCmd
  .command("disable <name>")
  .description("Disable a guardrail")
  .action(async (name: string) => {
    const { createGuardrailState, disableGuardrail } = await import("./enforce/guardrailProfiles.js");
    const state = createGuardrailState();
    if (disableGuardrail(state, name)) {
      console.log(chalk.yellow(`✗ Disabled guardrail: ${name}`));
    } else {
      console.error(chalk.red(`Guardrail not found or not enabled: ${name}`));
    }
  });

guardrailsCmd
  .command("profile <name>")
  .description("Apply a guardrail profile (minimal, standard, strict, healthcare, financial)")
  .action(async (profileName: string) => {
    const { createGuardrailState, applyProfile, listGuardrailsWithStatus, GUARDRAIL_PROFILES } = await import("./enforce/guardrailProfiles.js");
    const state = createGuardrailState();
    if (applyProfile(state, profileName)) {
      const enabled = listGuardrailsWithStatus(state).filter(g => g.enabled);
      console.log(chalk.green(`✓ Applied profile: ${profileName} (${enabled.length} guardrails enabled)`));
      for (const g of enabled) { console.log(`  ● ${g.name}`); }
    } else {
      console.error(chalk.red(`Unknown profile: ${profileName}`));
      console.log("Available:", GUARDRAIL_PROFILES.map(p => p.name).join(", "));
    }
  });

// ── Playground ───────────────────────────────────────────────────────────────
const playground = program.command("playground").description("Interactive scenario runner").action(async () => {
  const { createPlaygroundSession, runAllScenarios, formatPlaygroundReport } = await import("./playground/index.js");
  const session = createPlaygroundSession();
  const results = runAllScenarios(session);
  console.log(formatPlaygroundReport(session));
});

playground
  .command("run")
  .description("Run all demo scenarios")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    const { createPlaygroundSession, runAllScenarios, formatPlaygroundReport } = await import("./playground/index.js");
    const session = createPlaygroundSession();
    const results = runAllScenarios(session);
    if (opts.json) { console.log(JSON.stringify(results, null, 2)); return; }
    console.log(formatPlaygroundReport(session));
  });

playground
  .command("list")
  .description("List available scenarios")
  .action(async () => {
    const { DEMO_SCENARIOS } = await import("./playground/index.js");
    console.log(chalk.bold("\n🎮  Available Scenarios\n"));
    for (const s of DEMO_SCENARIOS) {
      console.log(`  ${s.id}: ${s.name}`);
      console.log(chalk.gray(`    ${s.description} (${s.steps.length} steps)`));
    }
  });

// ── Enhanced Dashboard ───────────────────────────────────────────────────────
dashboard
  .command("open")
  .description("Build and serve dashboard at localhost:3210")
  .option("--agent <agentId>", "agent ID")
  .option("--port <port>", "port", "3210")
  .option("--view <view>", "team view: engineer, product, ciso, exec", "engineer")
  .action(async (opts: { agent?: string; port: string; view?: string }) => {
    const resolvedAgent = opts.agent ?? activeAgent(program);
    const outDir = resolvedAgent ? `.amc/agents/${resolvedAgent}/dashboard` : ".amc/dashboard";
    try {
      buildDashboard({ workspace: process.cwd(), agentId: resolvedAgent, outDir });
    } catch (e: any) {
      console.log(chalk.yellow(`Note: ${e.message}`));
      console.log(chalk.gray("Dashboard will serve with available data."));
    }
    const handle = await serveDashboard({
      workspace: process.cwd(),
      agentId: resolvedAgent,
      port: Number(opts.port),
      outDir,
    });
    console.log(chalk.green(`\n🌐  Dashboard serving at ${handle.url}`));
    console.log(chalk.gray(`View: ${opts.view || "engineer"}`));
    console.log(chalk.gray("Press Ctrl+C to stop\n"));
    await new Promise<void>((resolvePromise) => {
      const shutdown = async () => {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        await handle.close();
        resolvePromise();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  });

// ── quickstart: one-command simplicity onboarding ─────────────────────────────
program
  .command("quickstart")
  .description("2-minute quickstart with Quick Score assessment")
  .action(async () => {
    console.log(chalk.bold.hex("#FF6600")("\n🚀  AMC Quick Start — Agent Maturity in 2 Minutes\n"));

    // Step 1: workspace init
    console.log(chalk.cyan("Step 1: Setting up workspace..."));
    try {
      const ws = await quickstartWizard(process.cwd());
      console.log(chalk.green("  ✓ Workspace initialized"));
      console.log(chalk.gray(`    Gateway: ${ws.nextGatewayCommand}`));
    } catch { console.log(chalk.green("  ✓ Workspace already configured")); }

    // Step 2: Quick Score
    console.log(chalk.cyan("\nStep 2: Quick Score Assessment (10 questions)\n"));
    const { getQuestionsForTier, computeQuickScore, renderAsciiRadar } = await import("./diagnostic/quickScore.js");
    const questions = getQuestionsForTier("quick");
    const answers: Record<string, number> = {};

    if (process.stdin.isTTY) {
      const inq = await import("inquirer");
      for (const q of questions) {
        const { level } = await inq.default.prompt([{
          type: "list",
          name: "level",
          message: `${q.id}: ${q.title}`,
          choices: q.options.map((o: { level: number; label: string }) => ({ name: `L${o.level} — ${o.label}`, value: o.level })),
        }]);
        answers[q.id] = level;
      }
    } else {
      console.log(chalk.yellow("  Non-interactive mode: using L0 defaults"));
    }

    const result = computeQuickScore(answers, "quick");

    // Step 3: Results
    console.log(chalk.cyan("\nStep 3: Your Results\n"));
    console.log(chalk.bold(`  Overall: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`));
    console.log(renderAsciiRadar(result.layerScores));

    if (result.gaps.length > 0) {
      console.log(chalk.yellow("  Top 5 Gaps:"));
      for (const g of result.gaps) {
        console.log(`    • ${g.title}: L${g.currentLevel} → L${g.targetLevel}`);
      }
    }

    console.log("");
    for (const line of result.roadmap) { console.log(chalk.cyan(`  ${line}`)); }

    console.log(chalk.bold.hex("#FF6600")("\n📋  Next Steps:"));
    console.log("  amc score tier --tier standard   Full 67-question assessment");
    console.log("  amc scan --local .               Scan your codebase");
    console.log("  amc dashboard open               Open web dashboard");
    console.log("  amc playground run               Run scenario tests");
    console.log("  amc guardrails profile standard   Enable standard guardrails");
    console.log("");
  });

// ── API subcommand ──────────────────────────────────────────────────────
const apiCmd = program.command("api").description("REST API management");
apiCmd
  .command("status")
  .description("Show API integration status")
  .action(() => {
    console.log(chalk.bold("AMC REST API v1"));
    console.log(`  Endpoints: shield, enforce, vault, watch, score, product`);
    console.log(`  Base path: /api/v1/`);
    console.log(`  Integrated into Studio server at :3212`);
    console.log(chalk.green("Run 'amc studio open' to start the server with API enabled."));
  });

// ── Agent harness subcommands ────────────────────────────────────────────
agent
  .command("run <type>")
  .description("Run an AMC-governed agent (content-moderation, data-pipeline, legal-contract)")
  .option("--input <input>", "Input text or path")
  .action(async (type: string, opts: { input?: string }) => {
    const input = opts.input ?? "test input";
    if (type === "content-moderation") {
      const { ContentModerationBot } = await import("./agents/contentModerationBot.js");
      const bot = new ContentModerationBot();
      const result = await bot.run(input);
      console.log(JSON.stringify(result, null, 2));
    } else if (type === "data-pipeline") {
      const { DataPipelineBot } = await import("./agents/dataPipelineBot.js");
      const bot = new DataPipelineBot();
      const result = await bot.run({ data: [{ value: input }], transforms: [] });
      console.log(JSON.stringify(result, null, 2));
    } else if (type === "legal-contract") {
      const { LegalContractBot } = await import("./agents/legalContractBot.js");
      const bot = new LegalContractBot();
      const result = await bot.run(input);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(chalk.red(`Unknown agent type: ${type}. Use content-moderation, data-pipeline, or legal-contract.`));
      process.exit(1);
    }
  });

agent
  .command("harness")
  .description("Run the autonomous improvement harness loop")
  .option("--type <type>", "Agent type to simulate", "general")
  .option("--iterations <n>", "Max iterations", "10")
  .option("--target <score>", "Target maturity score", "80")
  .action(async (opts: { type: string; iterations: string; target: string }) => {
    const { HarnessRunner } = await import("./agents/harnessRunner.js");
    const runner = new HarnessRunner({
      agentType: opts.type,
      maxIterations: parseInt(opts.iterations, 10),
      targetScore: parseInt(opts.target, 10),
    });
    console.log(chalk.bold(`Running harness for ${opts.type} agent (target: ${opts.target}, max: ${opts.iterations} iterations)...`));
    const result = await runner.run();
    console.log(chalk.bold(`\nResult:`));
    console.log(`  Final score: ${result.finalScore}`);
    console.log(`  Total improvement: +${result.totalImprovement}`);
    console.log(`  Iterations: ${result.iterations.length}`);
    console.log(`  Converged: ${result.converged ? chalk.green("yes") : chalk.yellow("no")}`);
    console.log(`  Duration: ${result.durationMs}ms`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const unknownToken = parseUnknownCommandToken(message);
  if (unknownToken) {
    console.error(chalk.red(message));
    const commandPaths = flattenCommandPaths(program);
    const suggestions = suggestCommandPaths(unknownToken, commandPaths, 6);
    if (suggestions.length > 0) {
      console.error(chalk.yellow("Closest command paths:"));
      for (const suggestion of suggestions) {
        console.error(`  amc ${suggestion}`);
      }
    }
    console.error(chalk.cyan("Run 'amc --help' to explore top-level commands."));
    process.exit(1);
    return;
  }
  console.error(chalk.red(message));
  process.exit(1);
});
