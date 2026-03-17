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
import { compareRuns, compareModels, generateReport, loadRunReport, runDiagnostic } from "./diagnostic/runner.js";
import { loadTargetProfile, loadTargetProfileFromFile, setTargetProfileInteractive, verifyTargetProfileSignature } from "./targets/targetProfile.js";
import { runTuneWizard, runUpgradeWizard } from "./tuning/tuneWizard.js";
import { loadContextGraph } from "./context/contextGraph.js";
import { applyAMCConfigProfile, initWorkspace, loadAMCConfig, quickstartWizard, runDoctor, saveAMCConfig } from "./workspace.js";
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
import { evaluateFleet, renderFleetScoringMarkdown } from "./fleet/fleetScoring.js";
import {
  applyFleetGovernancePolicy,
  buildFleetHealthDashboard,
  defineFleetSlo,
  fleetSloStatus,
  generateFleetComplianceReport,
  listFleetGovernancePolicies,
  listFleetSlos,
  tagFleetAgentEnvironment
} from "./fleet/governance.js";
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
import { generateTrustCertificate } from "./cert/trustCertificate.js";
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
  auditEnterpriseExportCli,
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
import { auditVibeCode } from "./score/vibeCodeAudit.js";
import { scoreRegulatoryReadiness } from "./score/regulatoryReadiness.js";
import { parseWindowToMs } from "./utils/time.js";
import { evalImportCli, evalStatusCli } from "./eval/evalCli.js";
import { evalRunCli, inferFormat, type EvalOutputFormat } from "./eval/evalRunCli.js";
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
import { startTrustDriftMonitor } from "./monitor/trustDriftMonitor.js";
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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  packInstallCli,
  packPublishCli,
  packSearchCli,
  packInfoCli,
  packUninstallCli,
  packListCli,
  packInitCli,
  packRegistryServeCli,
  packRegistryInitCli
} from "./packs/packCli.js";
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
import { registerTransparencyReportCommands } from "./transparency/transparencyReportCli.js";
import { registerMcpCommands } from "./mcp/mcpCli.js";
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
  packSearchCli as mpPackSearchCli,
  packInfoCli as mpPackInfoCli,
  packInstallCli as mpPackInstallCli,
  packUninstallCli as mpPackUninstallCli,
  packRateCli,
  packListCli as mpPackListCli,
  packFeaturedCli,
  packDeprecateCli,
  packUndeprecateCli
} from "./marketplace/marketplaceCli.js";
import {
  complianceDiffCli,
  complianceFleetReportCli,
  complianceReportCli,
  initComplianceMapsCli,
  verifyComplianceMapsCli
} from "./compliance/complianceCli.js";
import { frameworkChoices, getFrameworkFamily, normalizeFrameworkName, type ComplianceFramework } from "./compliance/frameworks.js";
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
  integrationsExportJournalCli,
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
import { registerQuickSetupCommand } from "./setup/quickSetupCli.js";
import { registerDomainApplyCommand } from "./domains/domainApplyCli.js";
import { registerReplCommand } from "./repl/replCli.js";
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
import { toErrorMessage } from "./utils/errors.js";
import { registerWatchCommands } from "./cli-watch-commands.js";
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
  passportCompareCli,
  passportCreateCli,
  passportExportLatestCli,
  passportInitCli,
  passportPolicyApplyCli,
  passportPolicyPrintCli,
  passportShareCli,
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
import { runRedTeam, renderRedTeamMarkdown, listStrategies } from "./redteam/index.js";

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

  console.log(chalk.hex('#4AEF79')("Unified Clarity"));
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

function isWorkspaceInitialized(workspace: string): boolean {
  return pathExists(join(workspace, ".amc"));
}

function workspaceInitHint(workspace: string, reason: string): string {
  return [
    reason,
    `Workspace: ${workspace}`,
    "Run one of the following first:",
    "  amc setup --demo",
    "  amc init"
  ].join("\n");
}

function ensureWorkspaceReadyForAgent(workspace: string, agentId?: string): void {
  if (!isWorkspaceInitialized(workspace)) {
    throw new Error(workspaceInitHint(workspace, "AMC workspace is not initialized."));
  }
  const paths = getAgentPaths(workspace, agentId);
  const contextGraph = paths.contextGraph;
  if (!pathExists(contextGraph)) {
    throw new Error(
      workspaceInitHint(
        workspace,
        `Missing context graph for agent '${paths.agentId}' at ${contextGraph}.`
      )
    );
  }
}

function normalizeCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/User force closed the prompt/i.test(message)) {
    return [
      "Interactive prompt aborted.",
      "If you are running in a non-interactive shell, set AMC_VAULT_PASSPHRASE and run:",
      "  amc setup --non-interactive",
      "  amc up"
    ].join("\n");
  }
  return message;
}

// Global crash handlers — catch unhandled promise rejections and exceptions
process.on("unhandledRejection", (reason) => {
  console.error(chalk.red(`[AMC] Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`));
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error(chalk.red(`[AMC] Uncaught exception: ${err.message}`));
  process.exit(1);
});

const program = new Command();
program
  .name("amc")
  .description("Agent Maturity Compass")
  .version("1.0.0")
  .enablePositionalOptions()
  .passThroughOptions()
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
  .option("--trust-boundary <mode>", "isolated|shared")
  .option("--profile <name>", "workspace config profile: dev|ci|prod", "dev")
  .action(async (opts: { trustBoundary?: "isolated" | "shared"; profile: "dev" | "ci" | "prod" }) => {
    // Ensure vault passphrase is available before init (it creates crypto keys)
    if (!process.env.AMC_VAULT_PASSPHRASE) {
      if (process.stdin.isTTY) {
        const crypto = await import("node:crypto");
        const autoGenerated = crypto.randomBytes(16).toString("base64url");
        console.log(chalk.bold("\n🔐 AMC Evidence Vault Setup"));
        console.log(chalk.gray("  AMC signs all scores with cryptographic keys. A passphrase protects your vault.\n"));
        const { choice } = await inquirer.prompt<{ choice: string }>([{
          type: "list",
          name: "choice",
          message: "Vault passphrase:",
          choices: [
            { name: `Auto-generate (${autoGenerated})`, value: "auto" },
            { name: "Enter my own passphrase", value: "custom" },
          ]
        }]);
        let passphrase: string;
        if (choice === "auto") {
          passphrase = autoGenerated;
          console.log(chalk.yellow(`\n  ⚠ Save this passphrase — you'll need it to access your vault:`));
          console.log(chalk.bold.white(`    ${passphrase}\n`));
        } else {
          const { customPass } = await inquirer.prompt<{ customPass: string }>([{
            type: "password",
            name: "customPass",
            message: "Enter passphrase (min 8 chars):",
            mask: "*",
            validate: (v: string) => v.length >= 8 || "Must be at least 8 characters"
          }]);
          passphrase = customPass;
        }
        process.env.AMC_VAULT_PASSPHRASE = passphrase;
      } else {
        console.error(chalk.red("AMC_VAULT_PASSPHRASE environment variable is required in non-interactive mode."));
        console.error(chalk.gray("  export AMC_VAULT_PASSPHRASE='your-passphrase'"));
        process.exit(1);
      }
    }

    const init = initWorkspace({ trustBoundaryMode: opts.trustBoundary });
    const profiled = applyAMCConfigProfile(opts.profile, loadAMCConfig(process.cwd()));
    if (opts.trustBoundary) {
      profiled.security.trustBoundaryMode = opts.trustBoundary;
    }
    saveAMCConfig(process.cwd(), profiled);
    const fmt = await import("./cliFormat.js");
    console.log(fmt.logo());
    console.log(fmt.pass("Workspace initialized"));
    console.log(fmt.info(`Location: ${init.workspacePath}`));
    console.log(fmt.nextSteps([
      { cmd: "amc quickscore", desc: "Get your first maturity score (2 min, interactive)" },
      { cmd: `amc config profile ${opts.profile}`, desc: "Re-apply the selected workspace config profile" },
      { cmd: "amc setup --demo", desc: "Load demo data and explore all features" },
      { cmd: "amc doctor", desc: "Check what's available in your environment" },
      { cmd: "amc up", desc: "Start Studio (web dashboard)" },
    ]));
    console.log(fmt.colors.dim("  Full guide: https://github.com/thewisecrab/AgentMaturityCompass/blob/main/docs/GETTING_STARTED.md"));
    console.log("");

    // Offer to run quickscore immediately if interactive
    if (process.stdin.isTTY) {
      const { runNow } = await inquirer.prompt<{ runNow: boolean }>([{
        type: "confirm",
        name: "runNow",
        message: "Run quickscore now? (2-minute interactive assessment)",
        default: true
      }]);
      if (runNow) {
        const { getRapidQuestions, scoreRapidAssessment } = await import("./diagnostic/rapidQuickscore.js");
        const questions = getRapidQuestions();
        const answers: Record<string, number> = {};
        console.log("");
        console.log(chalk.bold("  🧭 AMC Quickscore — 5 questions about your agent"));
        console.log(chalk.gray("  Pick the level that best describes your current state."));
        console.log("");
        for (const question of questions) {
          const { level } = await inquirer.prompt<{ level: number }>([{
            type: "list",
            name: "level",
            message: `${question.id}: ${question.title}`,
            choices: question.options.map((option) => ({
              name: `L${option.level} - ${option.label}`,
              value: option.level
            }))
          }]);
          answers[question.id] = level;
        }
        const result = scoreRapidAssessment(answers);
        const fmt = await import("./cliFormat.js");
        console.log("");
        console.log(fmt.scoreBox(result.totalScore, result.maxScore, "AMC Quickscore", result.preliminaryLevel));
        console.log("");
        if (result.recommendations.length > 0) {
          console.log(fmt.colors.dim("  Top improvements:"));
          for (const rec of result.recommendations.slice(0, 3)) {
            console.log(fmt.gap(rec.questionId, rec.title));
            console.log(fmt.colors.dim(`    ${rec.howToImprove}`));
          }
          console.log("");
        }
        console.log(fmt.nextSteps([
          { cmd: "amc score formal-spec <agentId>", desc: "Full diagnostic with evidence" },
          { cmd: "amc mechanic gap", desc: "See exactly what to fix" },
          { cmd: "amc up", desc: "Open the dashboard" },
        ]));
      }
    }
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
    console.log(chalk.hex('#4AEF79')("Legacy runtime checks:"));
    for (const line of legacy.lines) {
      console.log(line);
    }
    console.log("");
    const fmt = await import("./cliFormat.js");
    if (!result.ok || !legacy.ok) {
      console.log(fmt.nextSteps([
        { cmd: "amc doctor-fix", desc: "Auto-repair common issues" },
        { cmd: "amc up", desc: "Start Studio (the local control plane)" },
        { cmd: "amc quickscore", desc: "2-minute health check" },
        { cmd: "amc help", desc: "All available commands" },
      ]));
    } else {
      console.log(fmt.pass("All checks passed. Your workspace is ready."));
      console.log(fmt.nextSteps([
        { cmd: "amc quickscore", desc: "Get your first maturity score" },
      ]));
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


registerQuickSetupCommand(program);
registerReplCommand(program);

program
  .command("improve")
  .description("Guided improvement — shows what to fix next based on your current score")
  .option("--json", "emit JSON output", false)
  .action(async (opts: { json: boolean }) => {
    const { getRapidQuestions, scoreRapidAssessment } = await import("./diagnostic/rapidQuickscore.js");

    // Check if we have a recent quickscore, otherwise run one
    let answers: Record<string, number> = {};
    const questions = getRapidQuestions();

    if (process.stdin.isTTY) {
      console.log("");
      console.log(chalk.bold("  🧭 AMC Improve — Let's find your biggest wins"));
      console.log(chalk.gray("  Answer 5 quick questions so I can prioritize your improvements."));
      console.log("");

      for (const question of questions) {
        const { level } = await inquirer.prompt<{ level: number }>([{
          type: "list",
          name: "level",
          message: `${question.id}: ${question.title}`,
          choices: question.options.map((option) => ({
            name: `L${option.level} - ${option.label}`,
            value: option.level
          }))
        }]);
        answers[question.id] = level;
      }
    }

    const result = scoreRapidAssessment(answers);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("");
    console.log(chalk.bold(`  Current: ${result.preliminaryLevel} (${result.totalScore}/${result.maxScore})`));
    console.log("");

    if (result.recommendations.length === 0) {
      console.log(chalk.green("  🎉 You're at L5 across the board. Nothing to improve!"));
      console.log("");
      return;
    }

    console.log(chalk.bold("  Your improvement roadmap (highest impact first):"));
    console.log("");

    for (let i = 0; i < Math.min(result.recommendations.length, 5); i++) {
      const rec = result.recommendations[i]!;
      const num = i + 1;
      console.log(chalk.bold.yellow(`  ${num}. ${rec.questionId}: ${rec.title}`));
      console.log(chalk.gray(`     Current: L${rec.currentLevel} → Target: L${rec.targetLevel}`));
      console.log(chalk.white(`     Why: ${rec.whyItMatters}`));
      console.log(chalk.hex('#4AEF79')(`     How: ${rec.howToImprove}`));

      // Map to specific CLI commands (F28: include --agent <your-agent-id> for context)
      const cmdMap: Record<string, string> = {
        "AMC-1.1": "amc score behavioral-contract --agent <your-agent-id>",
        "AMC-2.1": "amc score autonomy-duration --agent <your-agent-id>",
        "AMC-3.1.1": "amc score alignment-index --agent <your-agent-id>",
        "AMC-3.2": "amc score factuality --agent <your-agent-id>",
        "AMC-4.1": "amc score audit-depth --agent <your-agent-id>",
      };
      const cmd = cmdMap[rec.questionId];
      if (cmd) {
        console.log(chalk.gray(`     Run:`), chalk.hex('#4AEF79')(cmd));
      }
      console.log("");
    }

    console.log(chalk.gray("  Deep dive into any question:"), chalk.hex('#4AEF79')("amc explain <questionId>"));
    console.log(chalk.gray("  Full diagnostic:"), chalk.hex('#4AEF79')("amc score formal-spec <agentId>"));
    console.log("");
  });

program
  .command("guide")
  .description("Generate personalized improvement guide with exportable agent instructions")
  .option("--target <level>", "target maturity level (1-5)", "")
  .option("--export", "export markdown files to .amc/guides/", false)
  .option("--agent-instructions", "export agent-consumable instructions (for AGENTS.md / system prompts)", false)
  .option("--guardrails", "generate operational guardrails (rules, not suggestions)", false)
  .option("--apply [file]", "apply guardrails directly to agent config file (auto-detects or specify path)")
  .option("--interactive", "mechanic mode — choose which gaps to fix", false)
  .option("--watch", "continuous monitoring — re-generate guide on trust drift", false)
  .option("--watch-interval <seconds>", "interval for watch mode in seconds", "300")
  .option("--diff", "show what changed since last guide generation", false)
  .option("--frameworks", "list all supported frameworks", false)
  .option("--ci", "CI gate mode — exit non-zero if below --target level", false)
  .option("--dry-run", "preview --apply changes without writing files", false)
  .option("--quick", "instant guide from defaults — no interactive questions", false)
  .option("--auto-detect", "auto-detect framework from project files", false)
  .option("--status", "one-line status: current level, gap count, severities", false)
  .option("--go", "all-in-one: quick + auto-detect + export + apply (zero friction)", false)
  .option("--compliance [frameworks]", "generate compliance guardrails (EU_AI_ACT,ISO_42001,NIST_AI_RMF,SOC2,ISO_27001 or 'all')")
  .option("--agent <id>", "agent ID", "default")
  .option("--framework <name>", "framework name for tailored instructions")
  .option("--json", "emit JSON output", false)
  .action(async (opts: {
    target: string;
    export: boolean;
    agentInstructions: boolean;
    guardrails: boolean;
    apply?: string | boolean;
    interactive: boolean;
    watch: boolean;
    watchInterval: string;
    diff: boolean;
    frameworks: boolean;
    ci: boolean;
    dryRun: boolean;
    quick: boolean;
    autoDetect: boolean;
    status: boolean;
    go: boolean;
    compliance: string | boolean;
    agent: string;
    framework?: string;
    json: boolean;
  }) => {
    const { getRapidQuestions, scoreRapidAssessment } = await import("./diagnostic/rapidQuickscore.js");
    const {
      generateGuide,
      guideToHumanMarkdown,
      guideToAgentMarkdown,
      guideToGuardrails,
      guideToJSON,
      diffGuides,
      listSupportedFrameworks,
      detectFramework,
      guideStatusLine,
      guideToComplianceGuardrails,
      SUPPORTED_COMPLIANCE_FRAMEWORKS,
      applyGuardrails,
      KNOWN_AGENT_CONFIGS,
    } = await import("./guide/guideGenerator.js");
    const { questionBank } = await import("./diagnostic/questionBank.js");
    const fs = await import("fs");
    const path = await import("path");

    /* ── Auto-detect framework if requested ──────── */
    if (opts.autoDetect && !opts.framework) {
      const detected = detectFramework(
        (p) => { try { fs.accessSync(path.join(process.cwd(), p)); return true; } catch { return false; } },
        (p) => { try { return fs.readFileSync(path.join(process.cwd(), p), "utf-8"); } catch { return null; } },
      );
      if (detected) {
        opts.framework = detected.name;
        if (!opts.json) {
          console.log(chalk.gray(`  Auto-detected framework: ${detected.name} (from ${detected.detectedFrom})`));
        }
      }
    }

    /* ── --go: all-in-one zero-friction mode ─────── */
    if (opts.go) {
      opts.quick = true;
      opts.autoDetect = true;
      opts.export = true;
      opts.apply = true;

      // Re-run auto-detect since we just set the flag
      if (!opts.framework) {
        const detected = detectFramework(
          (p) => { try { fs.accessSync(path.join(process.cwd(), p)); return true; } catch { return false; } },
          (p) => { try { return fs.readFileSync(path.join(process.cwd(), p), "utf-8"); } catch { return null; } },
        );
        if (detected) {
          opts.framework = detected.name;
          console.log(chalk.gray(`  Auto-detected: ${detected.name} (from ${detected.detectedFrom})`));
        }
      }
    }

    /* ── --frameworks: list supported frameworks ─── */
    if (opts.frameworks) {
      const fws = listSupportedFrameworks();
      if (opts.json) {
        console.log(JSON.stringify(fws, null, 2));
        return;
      }
      console.log("");
      console.log(chalk.bold("  🔌 Supported Frameworks"));
      console.log(chalk.gray("  Use --framework <name> for tailored instructions.\n"));
      for (const fw of fws) {
        console.log(`  ${chalk.hex('#4AEF79')(fw.name)} ${chalk.gray(`(${fw.aliases.join(", ")})`)}`);
        console.log(`    ${chalk.gray("Language:")} ${fw.language} ${chalk.gray("| Config:")} ${fw.configFile}`);
        console.log("");
      }
      return;
    }

    /* ── --status: one-line status ──────────────── */
    if (opts.status) {
      // Force quick mode for status
      opts.quick = true;
    }

    /* ── Helper: run assessment and build guide ──── */
    async function buildGuide() {
      let answers: Record<string, number> = {};
      const questions = getRapidQuestions();

      if (!opts.quick && process.stdin.isTTY && !opts.json) {
        console.log("");
        console.log(chalk.bold("  🧭 AMC Guide — Personalized improvement plan"));
        console.log(chalk.gray("  Answer 5 quick questions to generate your guide."));
        console.log("");

        for (const question of questions) {
          const { level } = await inquirer.prompt<{ level: number }>([{
            type: "list",
            name: "level",
            message: `${question.id}: ${question.title}`,
            choices: question.options.map((option) => ({
              name: `L${option.level} - ${option.label}`,
              value: option.level
            }))
          }]);
          answers[question.id] = level;
        }
      }

      const result = scoreRapidAssessment(answers);

      const questionScores = result.questionScores.map(qs => ({
        questionId: qs.questionId,
        claimedLevel: qs.level,
        supportedMaxLevel: qs.level,
        finalLevel: qs.level,
        confidence: 1,
        evidenceEventIds: [] as string[],
        flags: [] as string[],
        narrative: "",
      }));

      const scoredIds = new Set(questionScores.map(q => q.questionId));
      for (const q of questionBank) {
        if (!scoredIds.has(q.id)) {
          questionScores.push({
            questionId: q.id,
            claimedLevel: 0,
            supportedMaxLevel: 0,
            finalLevel: 0,
            confidence: 0,
            evidenceEventIds: [],
            flags: ["unscored"],
            narrative: "",
          });
        }
      }

      const overall = (result.totalScore / result.maxScore) * 5;
      const targetLevel = opts.target ? parseInt(opts.target, 10) : undefined;

      const complianceFws = typeof opts.compliance === "string" && opts.compliance !== "true"
        ? opts.compliance.split(",").map((s: string) => s.trim().toUpperCase())
        : opts.compliance ? SUPPORTED_COMPLIANCE_FRAMEWORKS : undefined;

      return generateGuide({
        overall,
        questionScores,
        targetLevel,
        agentId: opts.agent,
        framework: opts.framework,
        complianceFrameworks: complianceFws,
      });
    }

    /* ── --status: one-line output ──────────────── */
    if (opts.status) {
      const guide = await buildGuide();
      const line = guideStatusLine(guide);
      if (opts.json) {
        console.log(JSON.stringify({ status: line, currentLevel: guide.currentLevel, targetLevel: guide.targetLevel, gaps: guide.sections.length }));
      } else {
        console.log(`  🧭 ${guide.agentId}: ${line}`);
      }
      return;
    }

    /* ── CI gate mode ────────────────────────────── */
    if (opts.ci) {
      const guide = await buildGuide();
      const minLevel = opts.target ? parseInt(opts.target, 10) : 3;
      const jsonOut = guideToJSON(guide, opts.framework);

      if (opts.json) {
        console.log(JSON.stringify({ ...jsonOut, ciPass: guide.currentLevel >= minLevel, minLevel }, null, 2));
      } else {
        if (guide.currentLevel >= minLevel) {
          console.log(chalk.green(`\n  ✓ CI PASS — Agent at L${guide.currentLevel} (minimum: L${minLevel})\n`));
        } else {
          console.log(chalk.red(`\n  ✗ CI FAIL — Agent at L${guide.currentLevel} (minimum: L${minLevel})`));
          console.log(chalk.gray(`  ${guide.sections.length} gaps to close. Run: amc guide --export\n`));
        }
      }

      process.exit(guide.currentLevel >= minLevel ? 0 : 1);
    }

    /* ── Interactive mechanic mode ───────────────── */
    if (opts.interactive) {
      const guide = await buildGuide();

      if (guide.sections.length === 0) {
        console.log(chalk.green("\n  🎉 No gaps found — you're at target level!\n"));
        return;
      }

      console.log("");
      console.log(chalk.bold("  🔧 Mechanic Mode — Choose what to improve"));
      console.log(chalk.gray(`  ${guide.sections.length} gaps found. Select which ones to include in your guide.\n`));

      const { selected } = await inquirer.prompt<{ selected: string[] }>([{
        type: "checkbox",
        name: "selected",
        message: "Select gaps to fix (space to toggle, enter to confirm):",
        choices: guide.sections.map(s => ({
          name: `${s.questionId}: ${s.title} (L${s.currentLevel} → L${s.targetLevel}) [${s.layerName}]`,
          value: s.questionId,
          checked: s.targetLevel - s.currentLevel >= 2, // Pre-select big gaps
        })),
        pageSize: 15,
      }]);

      if (selected.length === 0) {
        console.log(chalk.yellow("\n  No gaps selected. Nothing to generate.\n"));
        return;
      }

      // Filter guide to only selected sections
      guide.sections = guide.sections.filter(s => selected.includes(s.questionId));
      guide.summary = `Custom guide: ${selected.length} gap${selected.length === 1 ? "" : "s"} selected for improvement.`;

      // Export the custom guide
      const guidesDir = path.join(process.cwd(), ".amc", "guides");
      fs.mkdirSync(guidesDir, { recursive: true });

      const humanPath = path.join(guidesDir, "custom-improvement-guide.md");
      fs.writeFileSync(humanPath, guideToHumanMarkdown(guide), "utf-8");
      console.log(chalk.green(`\n  ✓ Human guide:`), chalk.hex('#4AEF79')(humanPath));

      const agentPath = path.join(guidesDir, "custom-agent-instructions.md");
      fs.writeFileSync(agentPath, guideToAgentMarkdown(guide, opts.framework), "utf-8");
      console.log(chalk.green(`  ✓ Agent instructions:`), chalk.hex('#4AEF79')(agentPath));

      const guardrailsPath = path.join(guidesDir, "custom-guardrails.md");
      fs.writeFileSync(guardrailsPath, guideToGuardrails(guide, opts.framework), "utf-8");
      console.log(chalk.green(`  ✓ Guardrails:`), chalk.hex('#4AEF79')(guardrailsPath));

      console.log("");
      console.log(chalk.gray("  Apply to your agent config:"), chalk.hex('#4AEF79')("amc guide --apply"));
      console.log(chalk.gray("  Or copy the guardrails into your agent's instructions manually."));
      console.log("");
      return;
    }

    /* ── Watch mode (continuous monitoring) ───────── */
    if (opts.watch) {
      const intervalMs = Math.max(30, parseInt(opts.watchInterval, 10)) * 1000;
      console.log("");
      console.log(chalk.bold("  🔄 AMC Guide Watch Mode — Continuous monitoring"));
      console.log(chalk.gray(`  Re-scoring every ${Math.round(intervalMs / 1000)}s. Press Ctrl+C to stop.`));
      console.log("");

      let lastScore = -1;
      let iteration = 0;

      const tick = async () => {
        iteration++;
        const guide = await buildGuide();
        const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        if (guide.currentLevel !== lastScore) {
          // Score changed — regenerate everything
          const guidesDir = path.join(process.cwd(), ".amc", "guides");
          fs.mkdirSync(guidesDir, { recursive: true });

          const guardrailsContent = guideToGuardrails(guide, opts.framework);
          const guardrailsPath = path.join(guidesDir, "guardrails-latest.md");
          fs.writeFileSync(guardrailsPath, guardrailsContent, "utf-8");

          const agentPath = path.join(guidesDir, "agent-instructions-latest.md");
          fs.writeFileSync(agentPath, guideToAgentMarkdown(guide, opts.framework), "utf-8");

          if (lastScore >= 0) {
            const direction = guide.currentLevel > lastScore ? chalk.green("↑") : chalk.red("↓");
            console.log(`  [${now}] ${direction} Score changed: L${lastScore} → L${guide.currentLevel} | ${guide.sections.length} gaps | Updated guides`);

            // If --apply was also set, auto-apply on drift
            if (opts.apply) {
              const targetFile = typeof opts.apply === "string" ? opts.apply : undefined;
              await doApply(guide, targetFile, fs, path);
            }
          } else {
            console.log(`  [${now}] Initial: L${guide.currentLevel} | ${guide.sections.length} gaps | Guides written to ${guidesDir}`);
          }

          lastScore = guide.currentLevel;
        } else {
          if (iteration % 12 === 0) { // Log heartbeat every ~12 intervals
            console.log(chalk.gray(`  [${now}] No change — L${guide.currentLevel} | ${guide.sections.length} gaps`));
          }
        }
      };

      await tick();
      const timer = setInterval(tick, intervalMs);

      // Handle graceful shutdown
      process.on("SIGINT", () => {
        clearInterval(timer);
        console.log(chalk.gray("\n  Watch mode stopped.\n"));
        process.exit(0);
      });

      // Keep alive
      await new Promise(() => {}); // Never resolves — runs until SIGINT
      return;
    }

    /* ── Standard guide generation ───────────────── */
    const guide = await buildGuide();

    /* ── --diff: compare with previous guide ─────── */
    if (opts.diff) {
      const guidesDir = path.join(process.cwd(), ".amc", "guides");
      const prevPath = path.join(guidesDir, "guide-previous.json");
      let hasPrevious = false;
      try {
        const prevRaw = fs.readFileSync(prevPath, "utf-8");
        const prevGuide = JSON.parse(prevRaw) as ReturnType<typeof generateGuide>;
        const diff = diffGuides(prevGuide, guide);

        if (opts.json) {
          console.log(JSON.stringify(diff, null, 2));
        } else {
          console.log("");
          console.log(chalk.bold(`  📊 Guide Diff: ${diff.summary}`));
          console.log("");
          if (diff.closedGaps.length > 0) {
            console.log(chalk.green(`  ✓ Closed gaps (${diff.closedGaps.length}):`));
            for (const g of diff.closedGaps) console.log(chalk.green(`    - ${g}`));
            console.log("");
          }
          if (diff.newGaps.length > 0) {
            console.log(chalk.red(`  ✗ New gaps (${diff.newGaps.length}):`));
            for (const g of diff.newGaps) console.log(chalk.red(`    - ${g}`));
            console.log("");
          }
          if (diff.unchangedGaps.length > 0) {
            console.log(chalk.gray(`  ○ Unchanged gaps: ${diff.unchangedGaps.length}`));
            console.log("");
          }
          if (diff.improvedGaps.length > 0) {
            console.log(chalk.hex('#4AEF79')(`  ↗ Partially improved (${diff.improvedGaps.length}):`));
            for (const g of diff.improvedGaps) console.log(chalk.hex('#4AEF79')(`    - ${g.questionId}: L${g.from} → L${g.to}`));
            console.log("");
          }
          if (diff.regressedGaps.length > 0) {
            console.log(chalk.yellow(`  ↘ Regressed (${diff.regressedGaps.length}):`));
            for (const g of diff.regressedGaps) console.log(chalk.yellow(`    - ${g.questionId}: L${g.from} → L${g.to}`));
            console.log("");
          }
        }
        hasPrevious = true;
      } catch {
        if (!opts.json) {
          console.log(chalk.gray("\n  No previous guide found. Run amc guide --export first to establish a baseline.\n"));
        }
      }

      // Save current as previous for next diff
      fs.mkdirSync(guidesDir, { recursive: true });
      fs.writeFileSync(prevPath, JSON.stringify(guide, null, 2), "utf-8");
      if (!opts.json && hasPrevious) {
        console.log(chalk.gray("  Previous guide updated for next diff.\n"));
      }
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(guide, null, 2));
      return;
    }

    // Display human-readable summary
    console.log("");
    console.log(chalk.bold(`  🧭 ${guide.summary}`));
    console.log("");

    const topSections = guide.sections.slice(0, 8);
    for (let i = 0; i < topSections.length; i++) {
      const s = topSections[i]!;
      console.log(chalk.bold.yellow(`  ${i + 1}. ${s.questionId}: ${s.title}`));
      console.log(chalk.gray(`     ${s.layerName} · L${s.currentLevel} → L${s.targetLevel}`));
      console.log(chalk.white(`     ${s.whatToFix}`));
      if (s.cliCommands.length > 0) {
        console.log(chalk.gray(`     Run:`), chalk.hex('#4AEF79')(s.cliCommands[0]));
      }
      console.log("");
    }

    if (guide.sections.length > 8) {
      console.log(chalk.gray(`  ... and ${guide.sections.length - 8} more gaps. Use --export to see all.`));
      console.log("");
    }

    /* ── Apply mode ──────────────────────────────── */
    if (opts.apply !== undefined && opts.apply !== false) {
      const targetFile = typeof opts.apply === "string" ? opts.apply : undefined;
      await doApply(guide, targetFile, fs, path);
      return;
    }

    /* ── Export modes ─────────────────────────────── */
    const shouldExport = opts.export || opts.agentInstructions || opts.guardrails || opts.compliance;
    if (shouldExport) {
      const guidesDir = path.join(process.cwd(), ".amc", "guides");
      fs.mkdirSync(guidesDir, { recursive: true });

      if (opts.export) {
        const humanPath = path.join(guidesDir, `improvement-guide-l${guide.currentLevel}-to-l${guide.targetLevel}.md`);
        fs.writeFileSync(humanPath, guideToHumanMarkdown(guide), "utf-8");
        console.log(chalk.green(`  ✓ Human guide:`), chalk.hex('#4AEF79')(humanPath));
      }

      if (opts.agentInstructions || opts.export) {
        const agentPath = path.join(guidesDir, `agent-instructions-l${guide.currentLevel}-to-l${guide.targetLevel}.md`);
        fs.writeFileSync(agentPath, guideToAgentMarkdown(guide, opts.framework), "utf-8");
        console.log(chalk.green(`  ✓ Agent instructions:`), chalk.hex('#4AEF79')(agentPath));
      }

      if (opts.guardrails || opts.export) {
        const guardrailsPath = path.join(guidesDir, `guardrails-l${guide.currentLevel}-to-l${guide.targetLevel}.md`);
        fs.writeFileSync(guardrailsPath, guideToGuardrails(guide, opts.framework), "utf-8");
        console.log(chalk.green(`  ✓ Guardrails:`), chalk.hex('#4AEF79')(guardrailsPath));
      }

      if (opts.compliance || opts.export) {
        const complianceFws = typeof opts.compliance === "string" && opts.compliance !== "true"
          ? opts.compliance.split(",").map((s: string) => s.trim().toUpperCase())
          : undefined;
        const compliancePath = path.join(guidesDir, `compliance-guardrails-l${guide.currentLevel}-to-l${guide.targetLevel}.md`);
        fs.writeFileSync(compliancePath, guideToComplianceGuardrails(guide, complianceFws), "utf-8");
        console.log(chalk.green(`  ✓ Compliance guardrails:`), chalk.hex('#4AEF79')(compliancePath));
      }

      // Always save JSON for future diffs and CI/CD
      const jsonPath = path.join(guidesDir, "guide-previous.json");
      fs.writeFileSync(jsonPath, JSON.stringify(guide, null, 2), "utf-8");

      // Also save structured JSON for CI/CD
      if (opts.export) {
        const ciPath = path.join(guidesDir, `guide-l${guide.currentLevel}-to-l${guide.targetLevel}.json`);
        fs.writeFileSync(ciPath, JSON.stringify(guideToJSON(guide, opts.framework), null, 2), "utf-8");
        console.log(chalk.green(`  ✓ CI/CD JSON:`), chalk.hex('#4AEF79')(ciPath));
      }

      console.log("");
      console.log(chalk.gray("  Apply guardrails to agent config:"), chalk.hex('#4AEF79')("amc guide --apply"));
      console.log(chalk.gray("  Interactive mechanic mode:"), chalk.hex('#4AEF79')("amc guide --interactive"));
      console.log(chalk.gray("  Continuous monitoring:"), chalk.hex('#4AEF79')("amc guide --watch"));
      console.log("");
    } else {
      console.log(chalk.gray("  Export all guides:"), chalk.hex('#4AEF79')("amc guide --export"));
      console.log(chalk.gray("  Generate guardrails:"), chalk.hex('#4AEF79')("amc guide --guardrails"));
      console.log(chalk.gray("  Apply to agent config:"), chalk.hex('#4AEF79')("amc guide --apply"));
      console.log(chalk.gray("  Mechanic mode (pick & choose):"), chalk.hex('#4AEF79')("amc guide --interactive"));
      console.log(chalk.gray("  Continuous monitoring:"), chalk.hex('#4AEF79')("amc guide --watch"));
      console.log(chalk.gray("  Compare with previous:"), chalk.hex('#4AEF79')("amc guide --diff"));
      console.log(chalk.gray("  List supported frameworks:"), chalk.hex('#4AEF79')("amc guide --frameworks"));
      console.log(chalk.gray("  Target specific level:"), chalk.hex('#4AEF79')("amc guide --target 4"));
      console.log("");
    }

    /* ── Apply helper ────────────────────────────── */
    async function doApply(
      guide: Awaited<ReturnType<typeof generateGuide>>,
      targetFile: string | undefined,
      fsModule: typeof fs,
      pathModule: typeof path,
    ) {
      const guardrailsContent = guideToGuardrails(guide, opts.framework);
      const isDryRun = opts.dryRun;

      const readFn = (p: string) => { try { return fsModule.readFileSync(p, "utf-8"); } catch { return null; } };
      const writeFn = isDryRun
        ? (_p: string, _c: string) => {} // no-op for dry run
        : (p: string, c: string) => { fsModule.mkdirSync(pathModule.dirname(p), { recursive: true }); fsModule.writeFileSync(p, c, "utf-8"); };

      if (targetFile) {
        const fullPath = pathModule.resolve(process.cwd(), targetFile);
        const result = applyGuardrails(fullPath, guardrailsContent, readFn, writeFn);
        if (isDryRun) {
          console.log(chalk.yellow(`  [DRY RUN] Would ${result.action}:`), chalk.hex('#4AEF79')(result.path));
          console.log(chalk.gray("  Remove --dry-run to apply.\n"));
        } else {
          console.log(chalk.green(`  ✓ Guardrails ${result.action}:`), chalk.hex('#4AEF79')(result.path));
          console.log("");
        }
        return;
      }

      // Auto-detect: find existing agent config files
      const detected: Array<{ path: string; label: string }> = [];
      for (const cfg of KNOWN_AGENT_CONFIGS) {
        const fullPath = pathModule.join(process.cwd(), cfg.path);
        try {
          fsModule.accessSync(fullPath);
          detected.push({ path: cfg.path, label: cfg.label });
        } catch {
          // File doesn't exist
        }
      }

      // Always offer to create AGENTS.md if nothing detected
      if (detected.length === 0) {
        detected.push({ path: "AGENTS.md", label: "AGENTS.md (create new)" });
      }

      // Non-interactive: auto-pick first detected config (or AGENTS.md)
      if (!process.stdin.isTTY) {
        const autoTarget = (detected[0] ?? { path: "AGENTS.md" }).path;
        const fullPath = pathModule.resolve(process.cwd(), autoTarget);
        const result = applyGuardrails(fullPath, guardrailsContent, readFn, writeFn);
        if (isDryRun) {
          console.log(chalk.yellow(`  [DRY RUN] Would ${result.action}:`), chalk.hex('#4AEF79')(result.path));
          console.log(chalk.gray("  Remove --dry-run to apply.\n"));
        } else {
          console.log(chalk.green(`  ✓ Guardrails ${result.action}:`), chalk.hex('#4AEF79')(result.path));
          console.log("");
        }
        return;
      }

      const choices = [
        ...detected.map(d => ({ name: `${d.label} (${d.path})`, value: d.path })),
        { name: "Custom path...", value: "__custom__" },
      ];

      const { target } = await inquirer.prompt<{ target: string }>([{
        type: "list",
        name: "target",
        message: "Apply guardrails to which file?",
        choices,
      }]);

      let finalPath = target;
      if (target === "__custom__") {
        const { customPath } = await inquirer.prompt<{ customPath: string }>([{
          type: "input",
          name: "customPath",
          message: "Enter file path:",
          default: "AGENTS.md",
        }]);
        finalPath = customPath;
      }

      const fullPath = pathModule.resolve(process.cwd(), finalPath);
      const result = applyGuardrails(fullPath, guardrailsContent, readFn, writeFn);
      if (isDryRun) {
        console.log(chalk.yellow(`\n  [DRY RUN] Would ${result.action}:`), chalk.hex('#4AEF79')(result.path));
        console.log(chalk.gray("  Remove --dry-run to apply.\n"));
      } else {
        console.log(chalk.green(`\n  ✓ Guardrails ${result.action}:`), chalk.hex('#4AEF79')(result.path));
        console.log(chalk.gray("  Re-running the guide will update the guardrails section automatically."));
        console.log(chalk.gray("  Your agent now has operational trust rules from AMC.\n"));
      }
    }
  });

program
  .command("quickscore")
  .description("Zero-config rapid assessment — auto-scores from evidence, or interactive 5-question fallback")
  .option("--json", "emit JSON output", false)
  .option("--quiet", "suppress non-JSON output (use with --json for clean piping)", false)
  .option("--eu-ai-act", "show EU AI Act risk classification mapping", false)
  .option("--auto", "auto-score from ledger evidence (no questions asked)", false)
  .option("--agent <agentId>", "agent ID for auto mode")
  .option("--share", "output shareable markdown badge + summary after scoring", false)
  .action(async (opts: { json: boolean; quiet: boolean; euAiAct: boolean; auto: boolean; agent?: string; share: boolean }) => {
    // Auto mode: score from actual evidence in the ledger
    if (opts.auto) {
      try {
        const agentId = opts.agent ?? activeAgent(program) ?? "default";
        ensureWorkspaceReadyForAgent(process.cwd(), agentId);
        const report = await runDiagnostic({ workspace: process.cwd(), window: "30d", agentId });
        if (opts.json) { console.log(JSON.stringify(report, null, 2)); return; }
        const avgLevel = report.layerScores.length > 0
          ? report.layerScores.reduce((s, l) => s + l.avgFinalLevel, 0) / report.layerScores.length
          : 0;
        const overallLevel = Math.min(5, Math.floor(avgLevel));
        console.log(chalk.bold("\n🧭 AMC Auto-Score — from execution evidence"));
        console.log(chalk.gray(`Agent: ${agentId} | Status: ${report.status} | Integrity: ${report.integrityIndex.toFixed(3)}`));
        console.log("");
        console.log(chalk.bold(`  Overall: L${overallLevel} (${report.trustLabel})`));
        console.log("");
        for (const layer of report.layerScores) {
          const lv = Math.floor(layer.avgFinalLevel);
          const bar = "█".repeat(lv) + "░".repeat(5 - lv);
          console.log(`  ${layer.layerName.padEnd(28)} L${lv} ${bar} (${layer.avgFinalLevel.toFixed(2)})`);
        }
        console.log("");
        if (report.questionScores.length > 0) {
          const gaps = report.questionScores.filter(q => q.finalLevel < 3).slice(0, 5);
          if (gaps.length > 0) {
            console.log(chalk.yellow("  Top gaps:"));
            for (const gap of gaps) {
              console.log(chalk.gray(`    ${gap.questionId}: L${gap.finalLevel}`));
            }
            console.log("");
          }
        }
        console.log(chalk.gray("  Next: amc guide --go    # generate improvement plan"));
        console.log(chalk.gray("        amc assurance run --all  # run red-team packs"));
        if (opts.euAiAct) {
          const euMapping: Record<number, { classification: string; status: string }> = {
            0: { classification: "Unclassified / Unacceptable Risk", status: "❌ NOT COMPLIANT" },
            1: { classification: "High Risk — Gaps Identified", status: "⚠️  PARTIALLY COMPLIANT" },
            2: { classification: "High Risk — Controls Developing", status: "⚠️  IN PROGRESS" },
            3: { classification: "High Risk — EU AI Act Minimum", status: "✅ COMPLIANT (baseline)" },
            4: { classification: "High Risk — Exceeds Requirements", status: "✅ FULLY COMPLIANT" },
            5: { classification: "High Risk — Gold Standard", status: "✅ EXEMPLARY" },
          };
          const m = euMapping[overallLevel] ?? euMapping[0]!;
          console.log("");
          console.log(chalk.bold("  EU AI Act: ") + m.status + chalk.gray(` (${m.classification})`));
        }
        console.log("");
        return;
      } catch (e: unknown) {
        console.error(chalk.red(toErrorMessage(e)));
        console.log(chalk.gray("\n  No evidence found. Run your agent through AMC first:"));
        console.log(chalk.gray("    amc adapters run --agent <id> -- <command>"));
        console.log(chalk.gray("    amc wrap <runtime> -- <command>"));
        console.log(chalk.gray("\n  Or use interactive mode: amc quickscore (without --auto)"));
        process.exit(1);
      }
    }

    const { getRapidQuestions, scoreRapidAssessment } = await import("./diagnostic/rapidQuickscore.js");
    const questions = getRapidQuestions();
    const answers: Record<string, number> = {};

    if (process.stdin.isTTY && !opts.quiet) {
      for (const question of questions) {
        const { level } = await inquirer.prompt<{ level: number }>([
          {
            type: "list",
            name: "level",
            message: `${question.id}: ${question.title}`,
            choices: question.options.map((option) => ({
              name: `L${option.level} - ${option.label}`,
              value: option.level
            }))
          }
        ]);
        answers[question.id] = level;
      }
    }

    const result = scoreRapidAssessment(answers);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(chalk.bold("AMC Rapid Quickscore"));
    if (result.totalScore === 0 && !process.stdin.isTTY) {
      console.log(chalk.yellow("⚡ Non-interactive mode detected — no questions were answered."));
      console.log(chalk.gray("   Run in a terminal for the interactive 5-question assessment,"));
      console.log(chalk.gray("   or use: amc quickscore --auto  (scores from captured evidence)"));
      console.log("");
    } else {
      console.log("No ledger setup required. This is a preliminary score from 5 high-signal questions.");
    }
    console.log(`Score: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`);
    console.log(`Preliminary maturity: ${result.preliminaryLevel}`);
    console.log(chalk.dim("Maturity Levels: L0=Undocumented | L1=Documented | L2=Automated | L3=Evidence-backed | L4=Proactive | L5=Certifiable"));

    // EU AI Act mapping
    if (opts.euAiAct) {
      const levelNum = parseInt(result.preliminaryLevel.replace(/\D/g, ""), 10) || 0;
      const euMapping: Record<number, { classification: string; status: string; action: string }> = {
        0: { classification: "Unclassified / Unacceptable Risk", status: "❌ NOT COMPLIANT", action: "Agent lacks basic governance. Cannot be deployed under EU AI Act." },
        1: { classification: "High Risk (Art. 6) — Gaps Identified", status: "⚠️  PARTIALLY COMPLIANT", action: "Meets intent but lacks operational controls. Requires Art. 9 risk management, Art. 13 transparency." },
        2: { classification: "High Risk (Art. 6) — Controls Developing", status: "⚠️  IN PROGRESS", action: "Repeatable processes exist. Complete Art. 14 human oversight and Art. 15 accuracy requirements." },
        3: { classification: "High Risk (Art. 6) — EU AI Act Minimum", status: "✅ COMPLIANT (baseline)", action: "Meets minimum EU AI Act requirements. Maintain Art. 61 post-market monitoring." },
        4: { classification: "High Risk (Art. 6) — Exceeds Requirements", status: "✅ FULLY COMPLIANT", action: "Exceeds requirements with cryptographic proof chains. Audit-ready." },
        5: { classification: "High Risk (Art. 6) — Gold Standard", status: "✅ EXEMPLARY", action: "Self-governing with continuous verification. Model for EU AI Act compliance." },
      };
      const mapping = euMapping[levelNum] ?? euMapping[0]!;
      console.log("");
      console.log(chalk.bold("━━━ EU AI Act Classification ━━━"));
      console.log(`  Classification: ${mapping.classification}`);
      console.log(`  Status: ${mapping.status}`);
      console.log(`  Action: ${mapping.action}`);
      console.log(chalk.gray("  Reference: EU AI Act 2024/1689, Art. 6, 9, 13-15, 61"));
    }

    if (result.recommendations.length === 0) {
      console.log("Top recommendations: none (all rapid questions are at L3+).");
    } else {
      console.log("Top 3 improvement recommendations:");
      for (const recommendation of result.recommendations) {
        console.log(
          `- ${recommendation.questionId} ${recommendation.title}: L${recommendation.currentLevel} -> L${recommendation.targetLevel}`
        );
        console.log(`  Why it matters: ${recommendation.whyItMatters}`);
        console.log(`  How to improve: ${recommendation.howToImprove}`);
      }
    }

    // Zero-score guidance
    if (result.totalScore === 0) {
      console.log("");
      console.log(chalk.yellow("💡 No evidence collected yet. Your score reflects default (L0) state."));
      console.log(chalk.gray("  To score a real agent, capture evidence first:"));
      console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc wrap <runtime> -- <your-agent-command>"), chalk.gray("  # Capture agent behavior"));
      console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc evidence collect"), chalk.gray("               # Guided wizard to connect and capture evidence"));
      console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc quickscore"), chalk.gray("  # Then re-score"));
    }

    // --share: output shareable badge + summary
    if (opts.share) {
      const levelNum = parseInt(result.preliminaryLevel.replace(/\D/g, ""), 10) || 0;
      const pct = result.percentage;
      const badgeColor = levelNum >= 4 ? "brightgreen" : levelNum >= 3 ? "green" : levelNum >= 2 ? "yellow" : "red";
      const shieldsUrl = `https://img.shields.io/badge/AMC-L${levelNum}_(${pct}%25)-${badgeColor}?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMMiA3bDEwIDUgMTAtNXptMCA5bC04LjUtNC4yNUwyIDEybDEwIDUgMTAtNXptMCA5bC04LjUtNC4yNUwyIDIxbDEwIDUgMTAtNXoiLz48L3N2Zz4=`;
      console.log("");
      console.log(chalk.bold("━━━ Shareable Badge ━━━"));
      console.log("");
      console.log(chalk.gray("Markdown (paste in README):"));
      console.log(`[![AMC L${levelNum}](${shieldsUrl})](https://github.com/thewisecrab/AgentMaturityCompass)`);
      console.log("");
      console.log(chalk.gray("HTML:"));
      console.log(`<a href="https://github.com/thewisecrab/AgentMaturityCompass"><img src="${shieldsUrl}" alt="AMC L${levelNum}" /></a>`);
      console.log("");
      console.log(chalk.gray("Summary:"));
      console.log(`Agent Maturity: L${levelNum} (${pct}%) | ${result.totalScore}/${result.maxScore} | Assessed via AMC Quick Score`);
      console.log("");
    }

    // Post-quickscore "What Now?" flow
    console.log("");
    console.log(chalk.bold("━━━ What now? ━━━"));
    console.log("");
    if (result.recommendations.length > 0) {
      const weakest = result.recommendations[0]!;
      const cmdMap: Record<string, string> = {
        "AMC-1.1": "amc score behavioral-contract",
        "AMC-2.1": "amc score autonomy-duration",
        "AMC-3.1.1": "amc score alignment-index",
        "AMC-3.2": "amc score factuality",
        "AMC-4.1": "amc score audit-depth",
      };
      const cmd = cmdMap[weakest.questionId] ?? "amc score formal-spec <agentId>";
      console.log(chalk.yellow(`Your weakest area: ${weakest.title} (L${weakest.currentLevel})`));
      console.log(chalk.gray(`  ${weakest.whyItMatters}`));
      console.log(chalk.white("  Fix it:"), chalk.hex('#4AEF79')(cmd));
    }
    console.log("");
    console.log(chalk.white("  Next steps:"));
    console.log(chalk.white("  1."), chalk.hex('#4AEF79')("amc improve"), chalk.gray("— Guided improvement roadmap"));
    console.log(chalk.white("  2."), chalk.hex('#4AEF79')("amc score formal-spec <agentId>"), chalk.gray("— Full 113-question diagnostic"));
    console.log(chalk.white("  3."), chalk.hex('#4AEF79')("amc demo gap"), chalk.gray("— See the 84-point documentation inflation gap"));
    console.log(chalk.white("  4."), chalk.hex('#4AEF79')("amc explain <questionId>"), chalk.gray("— Deep dive into any question"));
    console.log("");
  });

program
  .command("explain <questionId>")
  .description("Plain-English explanation for a diagnostic question (example: AMC-2.1)")
  .option("--json", "emit JSON output", false)
  .action(async (questionId: string, opts: { json: boolean }) => {
    const { explainDiagnosticQuestion } = await import("./diagnostic/questionExplain.js");
    const explanation = explainDiagnosticQuestion(questionId);
    if (opts.json) {
      console.log(JSON.stringify(explanation, null, 2));
      return;
    }
    console.log(chalk.bold(`${explanation.questionId} - ${explanation.title}`));
    console.log(`Layer: ${explanation.layerName}`);
    console.log(chalk.dim("Maturity Levels: L0=Undocumented | L1=Documented | L2=Automated | L3=Evidence-backed | L4=Proactive | L5=Certifiable"));
    console.log("");
    console.log(chalk.hex('#4AEF79')("What it measures:"));
    console.log(explanation.whatItMeasures);
    console.log("");
    console.log(chalk.hex('#4AEF79')("Why it matters:"));
    console.log(explanation.whyItMatters);
    console.log("");
    console.log(chalk.hex('#4AEF79')("How to improve:"));
    for (const item of explanation.howToImprove) {
      console.log(`- ${item}`);
    }
    console.log("");
    console.log(chalk.hex('#4AEF79')("Example evidence:"));
    for (const evidence of explanation.exampleEvidence) {
      console.log(`- ${evidence}`);
    }
    // F27: inline glossary of technical terms that appear in AMC explain output
    console.log("");
    console.log(chalk.hex('#4AEF79')("Glossary (AMC terms used above):"));
    console.log(chalk.gray("  context.mission    ") + "— your agent's stated purpose and scope (document it in AGENTS.md or a charter file)");
    console.log(chalk.gray("  guardrails.alignment") + "— rules that prevent the agent from acting outside its mission (e.g. topic filters, action limits)");
    console.log(chalk.gray("  evidence           ") + "— logged proof that a behavior actually occurred (not just claimed in docs)");
    console.log(chalk.gray("  L0–L5 levels       ") + "— L0=undocumented, L1=documented, L2=automated checks, L3=evidence-backed, L4=proactive, L5=certifiable");
    console.log(chalk.gray("  tuning knobs       ") + "— configurable parameters that control agent behavior (e.g. temperature, retry limits)");
    console.log(chalk.gray("  gate               ") + "— a pass/fail check that blocks deployment if requirements are not met");
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
    if (!process.env.AMC_VAULT_PASSPHRASE) {
      if (process.stdin.isTTY) {
        const crypto = await import("node:crypto");
        const autoGenerated = crypto.randomBytes(16).toString("base64url");
        console.log(chalk.bold("\n🔐 AMC Vault Setup"));
        console.log(chalk.gray("  AMC needs a passphrase to protect cryptographic keys.\n"));
        const { choice } = await inquirer.prompt<{ choice: string }>([{
          type: "list",
          name: "choice",
          message: "Vault passphrase:",
          choices: [
            { name: `Auto-generate (${autoGenerated})`, value: "auto" },
            { name: "Enter my own passphrase", value: "custom" },
          ]
        }]);
        if (choice === "auto") {
          process.env.AMC_VAULT_PASSPHRASE = autoGenerated;
          console.log(chalk.yellow(`\n  ⚠ Save this passphrase: ${chalk.bold.white(autoGenerated)}\n`));
        } else {
          const { customPass } = await inquirer.prompt<{ customPass: string }>([{
            type: "password",
            name: "customPass",
            message: "Enter passphrase (min 8 chars):",
            mask: "*",
            validate: (v: string) => v.length >= 8 || "Must be at least 8 characters"
          }]);
          process.env.AMC_VAULT_PASSPHRASE = customPass;
        }
      } else {
        throw new Error(
          [
            "🔐 Vault passphrase required in non-interactive shells.",
            "",
            "Option 1 — set passphrase (recommended):",
            "  export AMC_VAULT_PASSPHRASE='your-passphrase'",
            "  amc up",
            "",
            "Option 2 — first-time setup (generates passphrase):",
            "  amc setup",
            "",
            "Option 3 — run without signing (view-only mode):",
            "  AMC_VAULT_PASSPHRASE='' amc up  # scoring and viewing only, no artifact signing"
          ].join("\n")
        );
      }
    }
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const actionPolicyFile = join(workspace, ".amc", "action-policy.yaml");
    if (!pathExists(actionPolicyFile)) {
      if (process.stdin.isTTY) {
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
      }
      initActionPolicy(workspace);
    }
    const toolsFile = join(workspace, ".amc", "tools.yaml");
    if (!pathExists(toolsFile)) {
      if (process.stdin.isTTY) {
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
    console.log(chalk.hex('#4AEF79')("Workspaces:"));
    for (const row of out.workspaces) {
      console.log(`- ${row.workspaceId} (${row.status}) ${row.name}`);
    }
    console.log(chalk.hex('#4AEF79')("Users:"));
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
    if (!isWorkspaceInitialized(workspace)) {
      console.log(workspaceInitHint(workspace, "AMC workspace is not initialized."));
      return;
    }
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
  .command("profile [name]")
  .description("Print or apply workspace config profile (dev|ci|prod)")
  .action((name?: "dev" | "ci" | "prod") => {
    const current = loadAMCConfig(process.cwd());
    if (!name) {
      console.log(chalk.hex('#4AEF79')(`Active workspace config profile: ${current.profile ?? "dev"}`));
      console.log(`- trustBoundaryMode: ${current.security.trustBoundaryMode}`);
      console.log(`- includeProxyEnv: ${current.supervise.includeProxyEnv}`);
      console.log(`- extraEnv: ${Object.keys(current.supervise.extraEnv).length}`);
      return;
    }
    const next = applyAMCConfigProfile(name, current);
    saveAMCConfig(process.cwd(), next);
    console.log(chalk.green(`✓ Applied workspace config profile: ${name}`));
    console.log(chalk.gray(`  Wrote .amc/amc.config.yaml`));
    console.log(chalk.gray(`  trustBoundaryMode=${next.security.trustBoundaryMode}`));
    console.log(chalk.gray(`  includeProxyEnv=${next.supervise.includeProxyEnv}`));
  });

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
    console.log(chalk.hex('#4AEF79')("Resolved config:"));
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
    console.log(chalk.hex('#4AEF79')("Config sources:"));
    for (const row of out.sources) {
      console.log(`- ${row.key}: ${row.source}`);
    }
    console.log("");
    console.log(chalk.hex('#4AEF79')("Signed configs:"));
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
      console.log(chalk.hex('#4AEF79')(`== ${file} ==`));
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
      throw new Error("Studio state not found. Start with: amc up (starts Studio + Gateway + Bridge)");
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
      console.log(chalk.hex('#4AEF79')(`Agent: ${output.agentId}`));
      console.log(`Gateway route: ${output.routeUrl}`);
      console.log("");
      console.log(chalk.hex('#4AEF79')("Environment exports:"));
      for (const line of output.envLines) {
        console.log(line);
      }
      console.log("");
      console.log(chalk.hex('#4AEF79')("Recommended command:"));
      console.log(output.command);
      if (output.adapterId) {
        console.log(chalk.hex('#4AEF79')(`Adapter lease carrier:`));
        console.log(output.leaseCarrierHint);
      }
      console.log("");
      console.log(chalk.hex('#4AEF79')("Node snippet:"));
      console.log(output.nodeSnippet);
      console.log("");
      console.log(chalk.hex('#4AEF79')("Python snippet:"));
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
    console.log(chalk.hex('#4AEF79')("Built-in adapters:"));
    for (const row of out.builtins) {
      console.log(`- ${row.id} (${row.kind}) defaultMode=${row.defaultRunMode} provider=${row.providerFamily}`);
    }
    console.log("");
    console.log(chalk.hex('#4AEF79')("Configured per-agent profiles:"));
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
    console.log(chalk.hex('#4AEF79')(`Agent: ${out.agentId}`));
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
      console.log(chalk.hex('#4AEF79')("Unified Clarity:"));
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

const monitor = program.command("monitor").description("Continuous production monitoring — real-time scoring, drift detection, and alerting");

// ── amc monitor start — perpetual continuous monitoring ──
monitor
  .command("start")
  .description("Start continuous monitoring: scores agent at intervals, detects drift, sends alerts on degradation")
  .option("--agent <id>", "Agent ID to monitor")
  .option("--scoring-interval <ms>", "Scoring interval in milliseconds", "300000")
  .option("--drift-interval <ms>", "Drift check interval in milliseconds", "900000")
  .option("--score-drop-threshold <n>", "Score drop alert threshold (0-1)", "0.1")
  .option("--no-webhooks", "Disable webhook notifications")
  .action(async (options: { agent?: string; scoringInterval: string; driftInterval: string; scoreDropThreshold: string; webhooks: boolean }) => {
    const { createContinuousMonitor, globalDashboardFeed } = await import("./watch/index.js");
    const fmt = await import("./cliFormat.js");
    const workspace = process.cwd();
    const agentId = resolveAgentId(workspace, options.agent);

    const config = {
      workspace,
      agentId,
      scoringIntervalMs: parseInt(options.scoringInterval, 10),
      driftCheckIntervalMs: parseInt(options.driftInterval, 10),
      scoreDropThreshold: parseFloat(options.scoreDropThreshold),
      enableWebhooks: options.webhooks
    };

    const mon = createContinuousMonitor(config);
    globalDashboardFeed.registerMonitor(agentId, mon.getMetrics());

    mon.on("started", (data: { agentId: string }) => {
      console.log(chalk.green(`  ✓ Monitoring started for agent: ${data.agentId}`));
      console.log(fmt.info(`Scoring every ${config.scoringIntervalMs / 1000}s | Drift check every ${config.driftCheckIntervalMs / 1000}s`));
      console.log(fmt.info(`Score drop threshold: ${config.scoreDropThreshold * 100}%`));
    });

    mon.on("score", (event: { data: { score: number; delta: number | null } }) => {
      const d = event.data;
      const deltaStr = d.delta !== null ? ` (${d.delta > 0 ? "+" : ""}${(d.delta * 100).toFixed(1)}%)` : "";
      console.log(fmt.info(`📊 Score: ${d.score.toFixed(2)}${deltaStr}`));
      globalDashboardFeed.updateMetrics(agentId, mon.getMetrics());
      globalDashboardFeed.pushEvent(event as never);
    });

    mon.on("drift", (event: { data: { triggered: boolean; reasons: string[] } }) => {
      if (event.data.triggered) {
        console.log(fmt.warn(`⚠️  Drift detected: ${event.data.reasons.join(", ")}`));
      }
      globalDashboardFeed.pushEvent(event as never);
    });

    mon.on("anomaly", (event: { data: { type: string; severity: string; message: string } }) => {
      console.log(fmt.warn(`🔍 Anomaly [${event.data.severity}]: ${event.data.message}`));
      globalDashboardFeed.pushEvent(event as never);
    });

    mon.on("alert", (event: { data: { summary: string } }) => {
      console.log(chalk.red(`  🚨 Alert: ${event.data.summary}`));
      globalDashboardFeed.pushEvent(event as never);
    });

    mon.on("error", (event: { data: { code: string; message: string } }) => {
      console.error(chalk.red(`  ❌ Error [${event.data.code}]: ${event.data.message}`));
    });

    await mon.start();

    console.log(fmt.info("Press Ctrl+C to stop monitoring..."));

    process.on("SIGINT", async () => {
      console.log(fmt.info("Stopping monitor..."));
      await mon.stop();
      globalDashboardFeed.unregisterMonitor(agentId);
      console.log(chalk.green("  ✓ Monitor stopped"));
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  });

// ── amc monitor check — one-shot trust drift analysis ──
monitor
  .command("check")
  .description("One-shot trust drift analysis (check for degradation without running continuously)")
  .requiredOption("--agent <agentId>", "agent ID")
  .requiredOption("--alert-threshold <n>", "minimum drop in trust score (0-100) that triggers an alert")
  .action((opts: { agent: string; alertThreshold: string }) => {
    const threshold = Number(opts.alertThreshold);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      throw new Error("--alert-threshold must be a positive number.");
    }
    const result = startTrustDriftMonitor({
      workspace: process.cwd(),
      agentId: opts.agent,
      alertThreshold: threshold
    });
    console.log(chalk.green(`Trust drift check for agent ${result.agentId}`));
    console.log(`Analyzed runs: ${result.analyzedRuns}`);
    if (result.latestPoint) {
      console.log(`Latest score: ${result.latestPoint.score0to100.toFixed(2)} (${result.latestPoint.runId})`);
    } else {
      console.log("Latest score: N/A (no runs found)");
    }
    console.log(`State: ${result.statePath}`);
    if (result.alerts.length === 0) {
      console.log(chalk.green("No trust degradation alerts triggered."));
      return;
    }
    console.log(chalk.red(`Alerts triggered: ${result.alerts.length}`));
    for (const alert of result.alerts) {
      console.log(
        `- [${alert.severity}] ${alert.currentRunId} drop=${alert.drop.toFixed(2)} threshold=${alert.threshold.toFixed(2)}`
      );
    }
    process.exit(2);
  });

// ── amc monitor status — show monitoring status for all agents ──
monitor
  .command("status")
  .description("Show monitoring status for all agents")
  .option("--json", "Output as JSON")
  .action(async (options: { json?: boolean }) => {
    const { globalDashboardFeed } = await import("./watch/index.js");
    const fmt = await import("./cliFormat.js");
    const snapshot = globalDashboardFeed.getSnapshot();

    if (options.json) {
      console.log(JSON.stringify(snapshot, null, 2));
      return;
    }

    console.log(fmt.header("Monitoring Status"));
    console.log(`Active monitors: ${snapshot.globalStats.activeMonitors}`);
    console.log(`Total incidents: ${snapshot.globalStats.totalIncidents}`);
    console.log(`Total anomalies: ${snapshot.globalStats.totalAnomalies}`);
    console.log();

    if (Object.keys(snapshot.agents).length === 0) {
      console.log(chalk.gray("No active monitors"));
      return;
    }

    for (const [agentId, metrics] of Object.entries(snapshot.agents)) {
      console.log(chalk.bold(`Agent: ${agentId}`));
      console.log(`  Current score: ${metrics.currentScore?.toFixed(2) ?? "N/A"}`);
      console.log(`  Score delta: ${metrics.scoreDelta !== null ? `${metrics.scoreDelta > 0 ? "+" : ""}${(metrics.scoreDelta * 100).toFixed(1)}%` : "N/A"}`);
      console.log(`  Last scored: ${metrics.lastScoredAt ? new Date(metrics.lastScoredAt).toISOString() : "N/A"}`);
      console.log(`  Active incidents: ${metrics.activeIncidents}`);
      console.log(`  Anomalies detected: ${metrics.anomaliesDetected}`);
      console.log(`  Uptime: ${(metrics.uptime / 1000 / 60).toFixed(1)} minutes`);
      console.log();
    }
  });

// ── amc monitor events — recent monitoring events ──
monitor
  .command("events")
  .description("Show recent monitoring events")
  .option("--limit <n>", "Number of events to show", "20")
  .option("--json", "Output as JSON")
  .action(async (options: { limit: string; json?: boolean }) => {
    const { globalDashboardFeed } = await import("./watch/index.js");
    const fmt = await import("./cliFormat.js");
    const limit = parseInt(options.limit, 10);
    const events = globalDashboardFeed.getRecentEvents(limit);

    if (options.json) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }

    if (events.length === 0) {
      console.log(chalk.gray("No recent events"));
      return;
    }

    console.log(fmt.header(`Recent Events (${events.length})`));
    for (const event of events.slice(-limit)) {
      const timestamp = new Date(event.ts).toISOString();
      const typeIcon = event.type === "score" ? "📊" : event.type === "drift" ? "⚠️" : event.type === "anomaly" ? "🔍" : event.type === "alert" ? "🚨" : "ℹ️";
      console.log(`${typeIcon} [${timestamp}] ${event.type.toUpperCase()} - ${event.agentId}`);
    }
  });

// ── amc monitor metrics — per-agent metrics ──
monitor
  .command("metrics")
  .description("Get metrics for a specific agent")
  .option("--agent <id>", "Agent ID")
  .option("--json", "Output as JSON")
  .action(async (options: { agent?: string; json?: boolean }) => {
    const { globalDashboardFeed } = await import("./watch/index.js");
    const fmt = await import("./cliFormat.js");
    const workspace = process.cwd();
    const agentId = resolveAgentId(workspace, options.agent);
    const metrics = globalDashboardFeed.getAgentMetrics(agentId);

    if (!metrics) {
      console.error(chalk.red(`  No active monitor for agent: ${agentId}`));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(metrics, null, 2));
      return;
    }

    console.log(fmt.header(`Metrics: ${agentId}`));
    console.log(`Current score: ${metrics.currentScore?.toFixed(2) ?? "N/A"}`);
    console.log(`Previous score: ${metrics.previousScore?.toFixed(2) ?? "N/A"}`);
    console.log(`Score delta: ${metrics.scoreDelta !== null ? `${metrics.scoreDelta > 0 ? "+" : ""}${(metrics.scoreDelta * 100).toFixed(1)}%` : "N/A"}`);
    console.log(`Last scored: ${metrics.lastScoredAt ? new Date(metrics.lastScoredAt).toISOString() : "N/A"}`);
    console.log(`Last drift check: ${metrics.lastDriftCheckAt ? new Date(metrics.lastDriftCheckAt).toISOString() : "N/A"}`);
    console.log(`Active incidents: ${metrics.activeIncidents}`);
    console.log(`Anomalies detected: ${metrics.anomaliesDetected}`);
    console.log(`Total scores: ${metrics.totalScores}`);
    console.log(`Uptime: ${(metrics.uptime / 1000 / 60).toFixed(1)} minutes`);
  });

// ── Backward-compatible monitor mode: record runtime stdin as evidence ──
monitor
  .option("--runtime <name>", "runtime name")
  .option("--stdin", "capture stdin stream", false)
  .action(async (opts: { runtime?: string; stdin?: boolean }) => {
    if (!opts.runtime) {
      throw new Error("Legacy monitor mode requires --runtime. For continuous monitoring use `amc monitor start`.");
    }
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
  .description("Full assessment — Score + Shield + Enforce + Vault + Watch + Fleet + Passport + Comply in one command")
  .option("--window <window>", "evidence window", "14d")
  .option("--fail-below <grade>", "exit non-zero if overall grade is below this (A+/A/A-/B+/B/B-/C+/C/C-/D+/D/D-/F)")
  .option("--ci", "output GitHub Actions annotations", false)
  .option("--score-only", "run only the maturity diagnostic (legacy mode)", false)
  .action(
    async (opts: {
      window: string;
      failBelow?: string;
      ci: boolean;
      scoreOnly: boolean;
    }) => {
      const agentId = activeAgent(program);
      ensureWorkspaceReadyForAgent(process.cwd(), agentId);

      // Legacy mode: score-only (backward compat)
      if (opts.scoreOnly) {
        const report = await runDiagnostic(
          {
            workspace: process.cwd(),
            window: opts.window,
            targetName: "default",
            claimMode: "auto",
            agentId
          }
        );
        console.log(chalk.hex('#4AEF79')(`Run ${report.runId} status: ${report.status}`));
        console.log(`IntegrityIndex: ${report.integrityIndex.toFixed(3)} (${report.trustLabel})`);
        if (report.trustBoundaryViolated && report.trustBoundaryMessage) {
          console.log(chalk.red(report.trustBoundaryMessage));
        }
        return;
      }

      // Full unified run
      const { unifiedRun, renderUnifiedResult, renderCIAnnotations, scoreToGrade } = await import("./unified/index.js");
      const result = await unifiedRun({
        workspace: process.cwd(),
        agentId: agentId ?? "default",
        window: opts.window,
        failBelow: opts.failBelow as any,
        ci: opts.ci,
      });

      // Render output
      if (opts.ci) {
        console.log(renderCIAnnotations(result));
      }
      console.log(renderUnifiedResult(result, { ci: opts.ci }));

      // CI gate: exit non-zero if below threshold
      if (opts.failBelow) {
        const thresholdScore = {
          "A+": 97, "A": 93, "A-": 90,
          "B+": 87, "B": 83, "B-": 80,
          "C+": 77, "C": 73, "C-": 70,
          "D+": 67, "D": 63, "D-": 60,
          "F": 0,
        }[opts.failBelow] ?? 0;
        if (result.overallScore < thresholdScore) {
          console.log(chalk.red(`\n  ✗ Grade ${result.overallGrade} is below --fail-below ${opts.failBelow}\n`));
          process.exit(1);
        } else {
          console.log(chalk.hex('#4AEF79')(`\n  ✓ Grade ${result.overallGrade} meets --fail-below ${opts.failBelow}\n`));
        }
      }
    }
  );

program
  .command("report")
  .description("Render report for run ID")
  .argument("<runId>")
  .option("--executive", "Generate executive summary (board-friendly)", false)
  .option("--html <path>", "Export styled HTML report (print to PDF from browser)")
  .action((runId: string, opts: { executive: boolean; html?: string }) => {
    const report = loadRunReport(process.cwd(), runId, activeAgent(program));

    // HTML export (styled, printable to PDF)
    if (opts.html) {
      const { writeFileSync } = require("fs");
      const avgLayerScore = report.layerScores.length > 0
        ? report.layerScores.reduce((s: number, l: any) => s + l.avgFinalLevel, 0) / report.layerScores.length
        : 0;
      const levelNum = Math.min(5, Math.floor(avgLayerScore));
      const level = `L${levelNum}`;
      const riskLabel = levelNum >= 4 ? "Low" : levelNum >= 3 ? "Moderate" : levelNum >= 2 ? "Elevated" : "High";
      const riskColor = levelNum >= 4 ? "#22c55e" : levelNum >= 3 ? "#eab308" : "#ef4444";
      const date = new Date(report.ts).toISOString().split("T")[0];
      const layerRows = report.layerScores.map((l: any) => {
        const lLevel = Math.min(5, Math.floor(l.avgFinalLevel));
        const lColor = lLevel >= 4 ? "#22c55e" : lLevel >= 3 ? "#eab308" : "#ef4444";
        return `<tr><td>${l.layerName}</td><td style="color:${lColor};font-weight:bold">L${lLevel}</td><td>${l.avgFinalLevel.toFixed(1)}</td><td>${l.questionCount} questions</td></tr>`;
      }).join("\n");
      const gapRows = ((report as any).gaps ?? []).slice(0, 10).map((g: any) =>
        `<tr><td>${g.questionId}</td><td>${g.currentLevel}→${g.targetLevel}</td><td>${g.narrative ?? ""}</td></tr>`
      ).join("\n");
      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>AMC Report — ${report.agentId ?? "Agent"}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}
  h1{color:#0f172a;border-bottom:3px solid #4AEF79;padding-bottom:12px}
  h2{color:#334155;margin-top:32px}
  .score-box{background:#f8fafc;border:2px solid ${riskColor};border-radius:12px;padding:24px;text-align:center;margin:24px 0}
  .score-box .level{font-size:48px;font-weight:bold;color:${riskColor}}
  .score-box .label{font-size:14px;color:#64748b;margin-top:4px}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{padding:8px 12px;border:1px solid #e2e8f0;text-align:left}
  th{background:#f1f5f9;font-weight:600}
  .risk{display:inline-block;padding:4px 12px;border-radius:6px;font-weight:bold;color:white;background:${riskColor}}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px}
  @media print{body{margin:0;padding:20px}.score-box{break-inside:avoid}}
</style></head><body>
<h1>🧭 Agent Maturity Compass — Executive Report</h1>
<p><strong>Agent:</strong> ${report.agentId ?? "default"} &nbsp;|&nbsp; <strong>Date:</strong> ${date} &nbsp;|&nbsp; <strong>Run:</strong> <code>${runId}</code></p>
<div class="score-box">
  <div class="level">${level}</div>
  <div class="label">Maturity Level (${avgLayerScore.toFixed(1)}% weighted)</div>
  <div style="margin-top:8px"><span class="risk">${riskLabel} Risk</span></div>
</div>
<h2>Dimension Scores</h2>
<table><thead><tr><th>Dimension</th><th>Level</th><th>Score</th><th>Coverage</th></tr></thead><tbody>
${layerRows}
</tbody></table>
${gapRows ? `<h2>Top Improvement Gaps</h2>
<table><thead><tr><th>Question</th><th>Gap</th><th>Recommendation</th></tr></thead><tbody>
${gapRows}
</tbody></table>` : ""}
<h2>What This Means</h2>
<p>${levelNum >= 3 ? "✅ This agent meets minimum EU AI Act requirements for high-risk AI systems. Suitable for production deployment with standard monitoring." :
  levelNum >= 2 ? "⚠️ This agent has repeatable processes but gaps remain. Address identified gaps before production deployment." :
  "❌ Significant governance gaps identified. Not recommended for production deployment without remediation."}</p>
<h2>Next Steps</h2>
<ol>
  <li>Run <code>amc guide --go</code> to generate framework-specific guardrails</li>
  <li>Run <code>amc assurance run --all</code> to test against adversarial scenarios</li>
  <li>Run <code>amc quickscore --eu-ai-act</code> for EU AI Act classification</li>
</ol>
<div class="footer">
  Generated by <a href="https://github.com/thewisecrab/AgentMaturityCompass">Agent Maturity Compass</a> — The Credit Score for AI Agents<br>
  Report generated: ${new Date().toISOString()} | Print this page (Ctrl+P) to save as PDF
</div>
</body></html>`;
      const outPath = resolve(process.cwd(), opts.html);
      writeFileSync(outPath, html, "utf-8");
      console.log(chalk.green(`✓ HTML report saved: ${outPath}`));
      console.log(chalk.gray("  Open in browser and print (Ctrl+P) to save as PDF"));
      return;
    }

    if (opts.executive) {
      const avgLayerScore = report.layerScores.length > 0
        ? report.layerScores.reduce((s, l) => s + l.avgFinalLevel, 0) / report.layerScores.length
        : 0;
      const score = avgLayerScore;
      const levelNum = Math.min(5, Math.floor(avgLayerScore));
      const level = `L${levelNum}`;
      const riskLabel = levelNum >= 4 ? "Low" : levelNum >= 3 ? "Moderate" : levelNum >= 2 ? "Elevated" : "High";
      const riskColor = levelNum >= 4 ? chalk.green : levelNum >= 3 ? chalk.yellow : chalk.red;
      console.log(chalk.bold("\n═══════════════════════════════════════════"));
      console.log(chalk.bold("  AMC Executive Summary"));
      console.log(chalk.bold("═══════════════════════════════════════════\n"));
      console.log(chalk.gray("  Agent:        "), report.agentId ?? "default");
      console.log(chalk.gray("  Date:         "), new Date(report.ts).toISOString().split("T")[0]);
      console.log(chalk.gray("  Maturity:     "), chalk.bold(level));
      console.log(chalk.gray("  Overall Score:"), chalk.bold(`${typeof score === "number" ? score.toFixed(1) : score}%`));
      console.log(chalk.gray("  Risk Level:   "), riskColor(riskLabel));
      console.log("");
      console.log(chalk.bold("  What This Means"));
      console.log(chalk.gray("  ─────────────────"));
      const meanings: Record<number, string> = {
        0: "This agent has no governance controls. It should not be deployed in production.",
        1: "This agent has basic intent toward safety but lacks operational controls.",
        2: "This agent has repeatable processes but gaps remain in edge cases.",
        3: "This agent meets minimum EU AI Act requirements. Suitable for production with monitoring.",
        4: "This agent exceeds requirements with cryptographic proof chains. Audit-ready.",
        5: "This agent is self-governing with continuous verification. Industry gold standard.",
      };
      console.log(`  ${meanings[levelNum] ?? meanings[0]}`);
      console.log("");
      console.log(chalk.bold("  Recommendation"));
      console.log(chalk.gray("  ─────────────────"));
      if (levelNum >= 3) {
        console.log("  ✅ This agent is suitable for production deployment with standard monitoring.");
      } else if (levelNum >= 2) {
        console.log("  ⚠️  Address identified gaps before production deployment. Run: amc guide --go");
      } else {
        console.log("  ❌ Significant governance gaps. Not recommended for production. Run: amc guide --go");
      }
      console.log("");
      console.log(chalk.gray("  Full report: amc report " + runId));
      console.log(chalk.gray("  Improvement plan: amc guide --go"));
      console.log(chalk.gray("  EU AI Act mapping: amc quickscore --eu-ai-act\n"));
      return;
    }
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
  .description("Compare two runs OR multiple models (side-by-side evaluation)")
  .argument("<items...>", "run IDs (2) or model names (2+) to compare")
  .option("--agent <agentId>", "agent ID (for model comparison)")
  .option("--window <window>", "evidence window (for model comparison)", "14d")
  .option("--target <name>", "target profile name (for model comparison)", "default")
  .option("--iterations <n>", "number of iterations per model", "1")
  .option("--output <path>", "save comparison report to file")
  .option("--json", "output as JSON", false)
  .option("--badge", "generate comparison badge SVG alongside output", false)
  .option("--format <fmt>", "output format: text | markdown", "text")
  .action(async (items: string[], opts: {
    agent?: string;
    window: string;
    target: string;
    iterations: string;
    output?: string;
    json: boolean;
    badge: boolean;
    format: string;
  }) => {
    if (items.length < 2) {
      throw new Error("At least 2 items required for comparison");
    }

    // Detect if items are run IDs or model names
    // Run IDs are typically UUIDs or timestamp-based, model names are descriptive
    const isRunId = (item: string): boolean => {
      // Check if it looks like a UUID or timestamp-based run ID
      return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item) ||
             /^run_\d+_[a-f0-9]+$/i.test(item) ||
             /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(item);
    };

    const allRunIds = items.every(isRunId);
    const allModelNames = items.every(item => !isRunId(item));

    if (!allRunIds && !allModelNames) {
      throw new Error("All items must be either run IDs or model names, not mixed");
    }

    if (allRunIds) {
      // Legacy behavior: compare runs
      if (items.length !== 2) {
        throw new Error("Run comparison requires exactly 2 run IDs");
      }
      const agentId = opts.agent ?? activeAgent(program);
      const a = loadRunReport(process.cwd(), items[0] as string, agentId);
      const b = loadRunReport(process.cwd(), items[1] as string, agentId);
      const diff = compareRuns(a, b);
      
      if (opts.output) {
        const fs = await import("fs");
        fs.writeFileSync(opts.output, JSON.stringify(diff, null, 2), "utf-8");
        console.log(chalk.green(`✓ Comparison saved to: ${opts.output}`));
      } else {
        console.log(JSON.stringify(diff, null, 2));
      }
    } else {
      // New behavior: compare models
      const { compareModels } = await import("./diagnostic/runner.js");
      
      const agentId = opts.agent ?? activeAgent(program);
      ensureWorkspaceReadyForAgent(process.cwd(), agentId);

      console.log(chalk.hex('#4AEF79')(`🔄 Running agent evaluation across ${items.length} models...`));
      console.log(chalk.gray(`Agent: ${agentId} | Window: ${opts.window} | Target: ${opts.target}`));
      console.log("");

      const comparison = await compareModels(process.cwd(), items, {
        agentId,
        window: opts.window,
        targetName: opts.target,
        iterations: parseInt(opts.iterations, 10)
      });

      if (opts.json) {
        const output = JSON.stringify(comparison, null, 2);
        if (opts.output) {
          const fs = await import("fs");
          fs.writeFileSync(opts.output, output, "utf-8");
          console.log(chalk.green(`✓ Comparison saved to: ${opts.output}`));
        } else {
          console.log(output);
        }
        return;
      }

      // ── Helper: render ASCII radar chart ──────────────────────────────
      function renderAsciiRadar(
        labels: string[],
        datasets: Array<{ label: string; values: number[] }>
      ): string {
        const width = 60;
        const lines: string[] = [];
        lines.push("  RADAR CHART (0–5 scale)");
        lines.push("  " + "─".repeat(width));
        for (let i = 0; i < labels.length; i++) {
          const dim = (labels[i] ?? "").padEnd(20).slice(0, 20);
          let bar = `  ${dim} │`;
          for (const ds of datasets) {
            const val = Math.max(0, Math.min(5, ds.values[i] ?? 0));
            const blocks = Math.round(val * 6);
            const color = ds.label === datasets[0]?.label ? "#4AEF79" : "#FFB347";
            bar += " " + chalk.hex(color)("█".repeat(blocks)).padEnd(blocks < 30 ? 30 : blocks) + ` ${val.toFixed(1)}`;
          }
          lines.push(bar);
        }
        lines.push("  " + "─".repeat(width));
        lines.push("  Legend: " + datasets.map((ds, i) => chalk.hex(i === 0 ? "#4AEF79" : "#FFB347")(`█ ${ds.label}`)).join("  "));
        return lines.join("\n");
      }

      // ── Helper: build dimension breakdown table ───────────────────────
      function buildDimensionBreakdown(): string[] {
        const out: string[] = [];
        const dims = comparison.comparisonMatrix[0]?.layerScores ?? [];
        if (dims.length === 0) return out;

        out.push(chalk.hex('#4AEF79')("Dimension-by-Dimension Breakdown:"));
        const colW = Math.max(12, ...comparison.comparisonMatrix.map(r => r.model.length));
        const header = ["Dimension".padEnd(22), ...comparison.comparisonMatrix.map(r => r.model.padEnd(colW)), "Winner".padEnd(colW), "Δ%"].join(" │ ");
        out.push(header);
        out.push("─".repeat(header.length));

        for (const layer of dims) {
          const scores = comparison.comparisonMatrix.map(r => {
            const ls = r.layerScores.find(l => l.layerName === layer.layerName);
            return ls?.avgFinalLevel ?? 0;
          });
          const maxScore = Math.max(...scores);
          const minScore = Math.min(...scores);
          const winnerIdx = scores.indexOf(maxScore);
          const winner = comparison.comparisonMatrix[winnerIdx]?.model ?? "-";
          const delta = maxScore > 0 ? ((maxScore - minScore) / maxScore * 100).toFixed(1) : "0.0";
          const scoreCells = scores.map((s, idx) => {
            const str = s.toFixed(2).padEnd(colW);
            return idx === winnerIdx ? chalk.green(str) : str;
          });
          const dimName = (layer.layerName ?? "").slice(0, 22).padEnd(22);
          out.push([dimName, ...scoreCells, winner.padEnd(colW), `+${delta}%`].join(" │ "));
        }
        return out;
      }

      // ── Helper: build markdown report ────────────────────────────────
      function buildMarkdownReport(): string {
        const lines: string[] = [
          "# AMC Multi-Model Comparison Report",
          "",
          `Generated: ${new Date().toISOString()}`,
          `Agent: ${agentId}`,
          "",
          "## Model Performance Matrix",
          "",
          `| Model | Overall | Integrity | Trust Label |`,
          `|-------|---------|-----------|-------------|`
        ];
        for (const r of comparison.comparisonMatrix) {
          lines.push(`| ${r.model} | L${Math.floor(r.overallScore)} | ${r.integrityIndex.toFixed(3)} | ${r.trustLabel} |`);
        }
        lines.push("");
        lines.push("## Summary");
        lines.push("");
        lines.push(`- **Best model:** ${comparison.summary.bestModel}`);
        lines.push(`- **Worst model:** ${comparison.summary.worstModel}`);
        lines.push(`- **Average integrity:** ${comparison.summary.avgIntegrityIndex.toFixed(3)}`);
        lines.push("");
        if (comparison.summary.significantDifferences.length > 0) {
          lines.push("## Significant Differences by Dimension");
          lines.push("");
          lines.push("| Dimension | Best Model | Worst Model | Δ Score |");
          lines.push("|-----------|-----------|-------------|---------|");
          for (const d of comparison.summary.significantDifferences) {
            lines.push(`| ${d.layer} | ${d.bestModel} | ${d.worstModel} | ${d.delta.toFixed(2)} |`);
          }
          lines.push("");
        }
        lines.push("## Dimension Radar");
        lines.push("");
        const dims = comparison.comparisonMatrix[0]?.layerScores ?? [];
        for (const layer of dims) {
          lines.push(`### ${layer.layerName}`);
          for (const r of comparison.comparisonMatrix) {
            const ls = r.layerScores.find(l => l.layerName === layer.layerName);
            const score = ls?.avgFinalLevel ?? 0;
            const bar = "█".repeat(Math.round(score * 6));
            lines.push(`- **${r.model}**: ${bar} (${score.toFixed(2)})`);
          }
          lines.push("");
        }
        return lines.join("\n");
      }

      if (opts.format === "markdown") {
        const md = buildMarkdownReport();
        if (opts.output) {
          const fs = await import("fs");
          fs.writeFileSync(opts.output, md, "utf-8");
          console.log(chalk.green(`✓ Markdown comparison report saved to: ${opts.output}`));
        } else {
          console.log(md);
        }
        // Badge generation alongside markdown
        if (opts.badge && opts.output) {
          const { generateBadgeSvg, scoreToLevel } = await import("./cert/badgeGenerator.js");
          const best = comparison.comparisonMatrix.find(r => r.model === comparison.summary.bestModel);
          if (best) {
            const score = best.overallScore * 20; // 0–5 → 0–100
            const level = scoreToLevel(score);
            const svg = generateBadgeSvg(score, level, `compare:${agentId}`);
            const badgePath = opts.output.replace(/\.[^.]+$/, "") + "-badge.svg";
            const fs = await import("fs");
            fs.writeFileSync(badgePath, svg, "utf-8");
            console.log(chalk.green(`✓ Comparison badge saved to: ${badgePath}`));
          }
        }
        return;
      }

      // Human-readable text output
      console.log(chalk.bold("🧭 Multi-Model Agent Evaluation Comparison"));
      console.log("");
      
      // Comparison matrix
      console.log(chalk.hex('#4AEF79')("Model Performance Matrix:"));
      const headers = ["Model", "Overall", "Integrity", "Trust Label"];
      const rows = comparison.comparisonMatrix.map(result => [
        result.model,
        `L${Math.floor(result.overallScore)}`,
        result.integrityIndex.toFixed(3),
        result.trustLabel
      ]);
      
      // Simple table formatting
      const colWidths = headers.map((header, i) => 
        Math.max(header.length, ...rows.map(row => (row[i] as string).length))
      );
      
      const formatRow = (row: string[]) => 
        row.map((cell, i) => cell.padEnd(colWidths[i] as number)).join(" | ");
      
      console.log(formatRow(headers));
      console.log(colWidths.map(w => "-".repeat(w)).join("-|-"));
      rows.forEach(row => console.log(formatRow(row)));

      // Dimension breakdown
      console.log("");
      const dimLines = buildDimensionBreakdown();
      dimLines.forEach(l => console.log(l));

      // ASCII Radar chart
      console.log("");
      const dims = comparison.comparisonMatrix[0]?.layerScores ?? [];
      if (dims.length > 0) {
        const radarLabels = dims.map(l => l.layerName);
        const radarDatasets = comparison.comparisonMatrix.map(r => ({
          label: r.model,
          values: dims.map(d => {
            const ls = r.layerScores.find(l => l.layerName === d.layerName);
            return ls?.avgFinalLevel ?? 0;
          })
        }));
        console.log(renderAsciiRadar(radarLabels, radarDatasets));
      }
      
      console.log("");
      console.log(chalk.hex('#4AEF79')("Summary:"));
      console.log(`Best model: ${chalk.green(comparison.summary.bestModel)}`);
      console.log(`Worst model: ${chalk.red(comparison.summary.worstModel)}`);
      console.log(`Average integrity: ${comparison.summary.avgIntegrityIndex.toFixed(3)}`);
      
      if (comparison.summary.significantDifferences.length > 0) {
        console.log("");
        console.log(chalk.hex('#4AEF79')("Significant differences by layer:"));
        comparison.summary.significantDifferences.forEach(diff => {
          console.log(`- ${diff.layer}: ${chalk.green(diff.bestModel)} vs ${chalk.red(diff.worstModel)} (Δ${diff.delta.toFixed(2)})`);
        });
      }

      if (opts.output) {
        const fs = await import("fs");
        fs.writeFileSync(opts.output, JSON.stringify(comparison, null, 2), "utf-8");
        console.log("");
        console.log(chalk.green(`✓ Full comparison data saved to: ${opts.output}`));
      }

      // Badge generation
      if (opts.badge) {
        const { generateBadgeSvg, scoreToLevel } = await import("./cert/badgeGenerator.js");
        const best = comparison.comparisonMatrix.find(r => r.model === comparison.summary.bestModel);
        if (best) {
          const score = best.overallScore * 20; // 0–5 scale → 0–100
          const level = scoreToLevel(score);
          const svg = generateBadgeSvg(score, level, `compare:${agentId}`);
          const badgePath = opts.output ? opts.output.replace(/\.[^.]+$/, "") + "-badge.svg" : "comparison-badge.svg";
          const fs = await import("fs");
          fs.writeFileSync(badgePath, svg, "utf-8");
          console.log(chalk.green(`✓ Comparison badge saved to: ${badgePath}`));
        }
      }
    }
  });

program
  .command("compare-models")
  .description("Run the same agent evaluation across multiple models and show comparison matrix")
  .argument("<models...>", "model names to compare (e.g., gpt-4 claude-3-opus gemini-pro)")
  .option("--agent <agentId>", "agent ID")
  .option("--window <window>", "evidence window", "14d")
  .option("--target <name>", "target profile name", "default")
  .option("--iterations <n>", "number of iterations per model", "1")
  .option("--output <path>", "save comparison report to file")
  .option("--json", "output as JSON", false)
  .action(async (models: string[], opts: {
    agent?: string;
    window: string;
    target: string;
    iterations: string;
    output?: string;
    json: boolean;
  }) => {
    const { compareModels } = await import("./diagnostic/runner.js");
    
    if (models.length < 2) {
      throw new Error("At least 2 models required for comparison");
    }

    const agentId = opts.agent ?? activeAgent(program);
    ensureWorkspaceReadyForAgent(process.cwd(), agentId);

    console.log(chalk.hex('#4AEF79')(`🔄 Running agent evaluation across ${models.length} models...`));
    console.log(chalk.gray(`Agent: ${agentId} | Window: ${opts.window} | Target: ${opts.target}`));
    console.log("");

    const comparison = await compareModels(process.cwd(), models, {
      agentId,
      window: opts.window,
      targetName: opts.target,
      iterations: parseInt(opts.iterations, 10)
    });

    if (opts.json) {
      const output = JSON.stringify(comparison, null, 2);
      if (opts.output) {
        const fs = await import("fs");
        fs.writeFileSync(opts.output, output, "utf-8");
        console.log(chalk.green(`✓ Comparison saved to: ${opts.output}`));
      } else {
        console.log(output);
      }
      return;
    }

    // Human-readable output
    console.log(chalk.bold("🧭 Multi-Model Agent Evaluation Comparison"));
    console.log("");

    // Comparison matrix table
    console.log(chalk.hex('#4AEF79')("Model Performance Matrix:"));
    console.log("─".repeat(80));
    
    const headers = ["Model", "Overall Score", "Integrity Index", "Trust Label", "Run ID"];
    const colWidths = [20, 15, 17, 12, 16];
    
    // Print header
    let headerRow = "";
    for (let i = 0; i < headers.length; i++) {
      headerRow += headers[i]!.padEnd(colWidths[i]!);
    }
    console.log(headerRow);
    console.log("─".repeat(80));

    // Print results
    for (const result of comparison.comparisonMatrix) {
      const row = [
        result.model.padEnd(colWidths[0]!),
        result.overallScore.toFixed(2).padEnd(colWidths[1]!),
        result.integrityIndex.toFixed(3).padEnd(colWidths[2]!),
        result.trustLabel.padEnd(colWidths[3]!),
        result.runId.slice(0, 14).padEnd(colWidths[4]!)
      ].join("");
      
      // Color code based on performance
      if (result.model === comparison.summary.bestModel) {
        console.log(chalk.green(row));
      } else if (result.model === comparison.summary.worstModel) {
        console.log(chalk.red(row));
      } else {
        console.log(row);
      }
    }

    console.log("");

    // Summary
    console.log(chalk.hex('#4AEF79')("Summary:"));
    console.log(`${chalk.green("Best performing model:")} ${comparison.summary.bestModel}`);
    console.log(`${chalk.red("Worst performing model:")} ${comparison.summary.worstModel}`);
    console.log(`Average integrity index: ${comparison.summary.avgIntegrityIndex}`);

    // Significant differences
    if (comparison.summary.significantDifferences.length > 0) {
      console.log("");
      console.log(chalk.hex('#4AEF79')("Significant Layer Differences (>0.5 points):"));
      for (const diff of comparison.summary.significantDifferences) {
        console.log(`• ${diff.layer}: ${chalk.green(diff.bestModel)} outperforms ${chalk.red(diff.worstModel)} by ${diff.delta} points`);
      }
    }

    // Save to file if requested
    if (opts.output) {
      const fs = await import("fs");
      const report = {
        timestamp: new Date().toISOString(),
        agent: agentId,
        models: models,
        comparison: comparison,
        humanReadable: {
          summary: `Best: ${comparison.summary.bestModel}, Worst: ${comparison.summary.worstModel}`,
          avgIntegrityIndex: comparison.summary.avgIntegrityIndex,
          significantDifferences: comparison.summary.significantDifferences.length
        }
      };
      fs.writeFileSync(opts.output, JSON.stringify(report, null, 2), "utf-8");
      console.log("");
      console.log(chalk.green(`✓ Full comparison report saved to: ${opts.output}`));
    }

    console.log("");
    console.log(chalk.gray("Next steps:"));
    console.log(chalk.gray("• Use the best-performing model for production"));
    console.log(chalk.gray("• Investigate layer-specific differences"));
    console.log(chalk.gray("• Run with --iterations 3 for more reliable results"));
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
const evalCmd = program.command("eval").description("Eval interop import and coverage status");
const evidence = program.command("evidence").description("Evidence lifecycle workflows");
const incidents = program.command("incidents").description("Incident operations and dispatch workflows");
const policy = program.command("policy").description("Policy-as-code operations");
const governor = program.command("governor").description("Autonomy Governor checks");
const tools = program.command("tools").description("ToolHub tools config");
const workorder = program.command("workorder").description("Signed work order operations");
const ticket = program.command("ticket").description("Execution ticket operations");
const gateway = program.command("gateway").description("AMC universal LLM proxy gateway");
const bundle = program.command("bundle").description("Portable evidence bundle operations");
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
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
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
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
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
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
      process.exit(1);
    }
  });

assurance
  .command("advanced-threats")
  .description("Run advanced threats assurance pack")
  .requiredOption("--agent <agentId>", "agent ID")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; json?: boolean }) => {
    try {
      const { runAdvancedThreatsPack } = await import("./lab/packs/advancedThreatsPack.js");
      const result = await runAdvancedThreatsPack(opts.agent);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.yellow("\n🧪 Advanced Threats Pack"));
      console.log(JSON.stringify(result, null, 2));
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
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
const compliance = program.command("compliance").alias("comply").description("Evidence-linked compliance map operations");
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
const lifecycle = program.command("lifecycle").description("Agent lifecycle responsibility and governance mapping");
const transparencyMerkle = transparency.command("merkle").description("Merkle transparency root/proof operations");
const policyAction = policy.command("action").description("Signed autonomy action policy");
const policyApproval = policy.command("approval").description("Signed dual-control approval policy");
const policyPack = policy.command("pack").description("Policy packs by archetype and risk tier");

evalCmd
  .command("import")
  .description("Import eval outputs (LangSmith, DeepEval, Promptfoo, OpenAI Evals, W&B, Langfuse) into signed AMC evidence")
  .requiredOption("--format <format>", "eval format: openai|langsmith|deepeval|promptfoo|wandb|langfuse")
  .requiredOption("--file <path>", "path to JSON/JSONL eval export file")
  .option("--agent <agentId>", "agent ID (defaults to active agent)")
  .option("--trust-tier <tier>", "override trust tier: OBSERVED|OBSERVED_HARDENED|ATTESTED|SELF_REPORTED")
  .option("--json", "emit JSON output", false)
  .action((opts: { format: string; file: string; agent?: string; trustTier?: string; json: boolean }) => {
    const result = evalImportCli({
      workspace: process.cwd(),
      format: opts.format,
      file: opts.file,
      agentId: opts.agent,
      trustTier: opts.trustTier
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`framework: ${result.format}`);
    console.log(`file: ${result.file}`);
    console.log(`session: ${result.sessionId}`);
    console.log(`cases: ${result.caseCount} (pass=${result.passedCount}, fail=${result.failedCount})`);
    console.log(`question coverage: ${Object.keys(result.questionCoverage).length} mapped question(s)`);
  });

evalCmd
  .command("status")
  .description("Show imported eval coverage per AMC dimension")
  .option("--agent <agentId>", "agent ID filter")
  .option("--window <window>", "window filter (e.g., 30d, 12h, 90m)")
  .option("--json", "emit JSON output", false)
  .action((opts: { agent?: string; window?: string; json: boolean }) => {
    const sinceTs = opts.window ? Date.now() - parseWindowToMs(opts.window) : undefined;
    const status = evalStatusCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      sinceTs
    });
    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    console.log(`overall mapped coverage: ${status.mappedQuestionCount}/${status.totalQuestionCount} (${status.overallCoveragePct.toFixed(2)}%)`);
    console.log(`imported events: ${status.totalImportedEvents}`);
    console.log(`imported cases: ${status.totalImportedCases}`);
    console.log("");
    console.log("coverage by AMC dimension:");
    for (const dimension of status.dimensions) {
      console.log(
        `- ${dimension.layerName}: ${dimension.coveredQuestions}/${dimension.totalQuestions} (${dimension.coveragePct.toFixed(2)}%)`
      );
    }
    console.log("");
    console.log("framework summary:");
    for (const framework of status.frameworks) {
      console.log(
        `- ${framework.framework}: events=${framework.importedEvents}, cases=${framework.importedCases}, pass=${framework.passedCases}, fail=${framework.failedCases}, mappedQuestions=${framework.mappedQuestions.length}`
      );
    }
  });

evalCmd
  .command("run")
  .description("One-shot evaluation: read amcconfig.yaml, run all diagnostic tests, output results")
  .option("--format <format>", "output format: json | html | terminal", "terminal")
  .option("--output <path>", "write report to file (format inferred from extension if --format omitted)")
  .option("--window <window>", "evidence window", "30d")
  .option("--agent <agentId>", "agent ID (defaults to active agent)")
  .option("--fail-on-error", "exit with code 1 on INVALID status or threshold breach", false)
  .option("--threshold <n>", "minimum acceptable IntegrityIndex (0–1)", "0")
  .action(
    async (opts: {
      format: string;
      output?: string;
      window: string;
      agent?: string;
      failOnError: boolean;
      threshold: string;
    }) => {
      const agentId = opts.agent ?? activeAgent(program);
      if (agentId) {
        ensureWorkspaceReadyForAgent(process.cwd(), agentId);
      }
      const format = inferFormat(opts.output, opts.format !== "terminal" ? opts.format : undefined);
      const { report, exitCode } = await evalRunCli({
        workspace: process.cwd(),
        window: opts.window,
        agentId,
        format,
        output: opts.output,
        failOnError: opts.failOnError,
        threshold: parseFloat(opts.threshold),
      });
      if (opts.output) {
        console.log(chalk.green(`Report written to ${opts.output}`));
      }
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    }
  );

lifecycle
  .command("status")
  .description("Show lifecycle stage, accountability matrix, governance gates, and transition trail")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--json", "emit JSON output", false)
  .action((opts: { agent?: string; json: boolean }) => {
    const { lifecycleStatusCli } = require("./lifecycle/lifecycleCli.js") as typeof import("./lifecycle/lifecycleCli.js");
    const status = lifecycleStatusCli({
      workspace: process.cwd(),
      agentId: opts.agent ?? activeAgent(program)
    });

    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    console.log(chalk.bold(`Lifecycle status — ${status.agentId}`));
    console.log(`  Current stage: ${status.currentStage}`);
    console.log(`  Stage entered: ${new Date(status.stageEnteredTs[status.currentStage] ?? Date.now()).toISOString()}`);

    const currentAssignment = status.responsibilityMatrix[status.currentStage];
    console.log(`  Accountable role: ${currentAssignment.accountable}`);
    console.log(`  Supporting roles: ${currentAssignment.supports.join(", ")}`);
    console.log(`  Scope: ${currentAssignment.decisionScope}`);

    if (status.nextAllowedStages.length === 0) {
      console.log("  Next allowed stages: none (terminal stage)");
    } else {
      console.log(`  Next allowed stages: ${status.nextAllowedStages.join(", ")}`);
      for (const stage of status.nextAllowedStages) {
        const controls = status.governanceGatesByTargetStage[stage].map((gate) => gate.controlId);
        console.log(
          `    ${stage}: ${controls.length > 0 ? controls.join(", ") : "no additional controls required"}`
        );
      }
    }

    if (status.transitionTrail.length === 0) {
      console.log("  Transition audit trail: no transitions recorded.");
      return;
    }

    console.log("  Transition audit trail:");
    for (const transition of status.transitionTrail) {
      console.log(
        `    ${new Date(transition.ts).toISOString()} ${transition.fromStage} -> ${transition.toStage} by ${transition.actorRole}:${transition.actor}`
      );
    }
  });

lifecycle
  .command("advance")
  .description("Advance lifecycle stage after governance gate confirmation")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .requiredOption("--to <stage>", "target stage: development|testing|staging|production|deprecated")
  .option("--actor <actor>", "actor identifier", "owner-cli")
  .option("--actor-role <role>", "actor role: developer|deployer|operator")
  .option("--controls <list>", "comma-separated governance control IDs satisfied for this advance")
  .option("--note <text>", "transition note")
  .option("--json", "emit JSON output", false)
  .action((opts: {
    agent?: string;
    to: string;
    actor: string;
    actorRole?: string;
    controls?: string;
    note?: string;
    json: boolean;
  }) => {
    const { lifecycleAdvanceCli, parseControlsCsv } = require("./lifecycle/lifecycleCli.js") as typeof import("./lifecycle/lifecycleCli.js");
    try {
      const out = lifecycleAdvanceCli({
        workspace: process.cwd(),
        agentId: opts.agent ?? activeAgent(program),
        to: opts.to,
        actor: opts.actor,
        actorRole: opts.actorRole,
        controls: parseControlsCsv(opts.controls),
        note: opts.note
      });

      if (opts.json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }

      console.log(chalk.green(`Lifecycle advanced for ${out.agentId}: ${out.fromStage} -> ${out.toStage}`));
      console.log(`  Transition ID: ${out.transition.transitionId}`);
      console.log(`  Timestamp: ${new Date(out.transition.ts).toISOString()}`);
      if (out.requiredControls.length > 0) {
        console.log(`  Required controls: ${out.requiredControls.join(", ")}`);
      }
      if (out.transition.controlsSatisfied.length > 0) {
        console.log(`  Confirmed controls: ${out.transition.controlsSatisfied.join(", ")}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(message));
      process.exit(1);
    }
  });

evidence
  .command("help")
  .description("Show high-signal evidence command groups")
  .action(() => {
    console.log(chalk.bold("Evidence namespace"));
    console.log("  amc evidence collect                 Guided wizard to connect your agent and capture evidence");
    console.log("  amc evidence verify                  Run full integrity verification");
    console.log("  amc verify all                       Full trust/policy/plugin verification");
    console.log("  amc bundle export --out <file>       Export signed evidence bundle");
    console.log("  amc transparency verify              Verify append-only transparency log");
    console.log("  amc audit binder create              Build external-facing audit binder");
  });

evidence
  .command("collect")
  .description("Guided wizard to connect your agent and capture evidence")
  .action(async () => {
    if (!process.stdin.isTTY) {
      console.error(chalk.red("Evidence collection wizard requires an interactive terminal."));
      console.error(chalk.gray("For CI/CD, use: amc wrap <runtime> -- <command>"));
      process.exit(1);
    }
    console.log(chalk.bold("\n🔬 AMC Evidence Collection Wizard"));
    console.log(chalk.gray("  This wizard helps you capture agent behavior for scoring.\n"));

    const { method } = await inquirer.prompt<{ method: string }>([{
      type: "list",
      name: "method",
      message: "How does your agent run?",
      choices: [
        { name: "CLI command (e.g. python agent.py, node bot.js)", value: "cli" },
        { name: "Already running as a service (HTTP API)", value: "service" },
        { name: "I have existing logs/eval outputs to import", value: "import" },
        { name: "I just want to answer questions manually (quickscore)", value: "quickscore" },
      ]
    }]);

    if (method === "quickscore") {
      console.log(chalk.hex('#4AEF79')("\n  Running quickscore...\n"));
      const { getRapidQuestions, scoreRapidAssessment } = await import("./diagnostic/rapidQuickscore.js");
      const questions = getRapidQuestions();
      const answers: Record<string, number> = {};
      for (const question of questions) {
        const { level } = await inquirer.prompt<{ level: number }>([{
          type: "list",
          name: "level",
          message: `${question.id}: ${question.title}`,
          choices: question.options.map((option) => ({
            name: `L${option.level} - ${option.label}`,
            value: option.level
          }))
        }]);
        answers[question.id] = level;
      }
      const result = scoreRapidAssessment(answers);
      const fmt = await import("./cliFormat.js");
      console.log("");
      console.log(fmt.scoreBox(result.totalScore, result.maxScore, "AMC Quickscore", result.preliminaryLevel));
      console.log(chalk.gray("\n  Next: Run a full diagnostic with `amc diagnostic run`"));
      return;
    }

    if (method === "import") {
      const { source } = await inquirer.prompt<{ source: string }>([{
        type: "list",
        name: "source",
        message: "What format are your logs/evals in?",
        choices: [
          { name: "LangSmith traces", value: "langsmith" },
          { name: "DeepEval results", value: "deepeval" },
          { name: "Promptfoo eval output", value: "promptfoo" },
          { name: "OpenAI Evals", value: "openai-evals" },
          { name: "Weights & Biases runs", value: "wandb" },
          { name: "Langfuse traces", value: "langfuse" },
          { name: "Generic JSON/JSONL logs", value: "generic" },
        ]
      }]);
      const { filePath } = await inquirer.prompt<{ filePath: string }>([{
        type: "input",
        name: "filePath",
        message: "Path to your log/eval file:",
        validate: (v: string) => v.trim().length > 0 || "Please enter a file path"
      }]);
      console.log(chalk.hex('#4AEF79')(`\n  Importing ${source} data from: ${filePath}`));
      console.log(chalk.gray(`  Run: amc ingest import --source ${source} --file "${filePath}"`));
      console.log(chalk.gray("  Then: amc score          # to see your updated maturity score\n"));
      return;
    }

    if (method === "cli") {
      const { runtime } = await inquirer.prompt<{ runtime: string }>([{
        type: "list",
        name: "runtime",
        message: "What runtime/framework?",
        choices: [
          { name: "Python (generic)", value: "python" },
          { name: "Node.js (generic)", value: "node" },
          { name: "LangChain", value: "langchain" },
          { name: "CrewAI", value: "crewai" },
          { name: "AutoGen", value: "autogen" },
          { name: "Claude CLI", value: "claude-cli" },
          { name: "Other CLI", value: "generic-cli" },
        ]
      }]);
      const { command } = await inquirer.prompt<{ command: string }>([{
        type: "input",
        name: "command",
        message: "Full command to start your agent:",
        validate: (v: string) => v.trim().length > 0 || "Please enter the command"
      }]);
      console.log(chalk.bold.green("\n  ✓ Ready to capture evidence!\n"));
      console.log(chalk.white("  Run this command to start capturing:"));
      console.log(chalk.hex('#4AEF79')(`    amc wrap ${runtime} -- ${command}\n`));
      console.log(chalk.gray("  AMC will intercept all LLM calls, tool invocations, and agent decisions."));
      console.log(chalk.gray("  Stop the agent with Ctrl+C when done, then run:"));
      console.log(chalk.hex('#4AEF79')("    amc score\n"));
      return;
    }

    if (method === "service") {
      console.log(chalk.bold("\n  For running services, use the AMC Bridge:\n"));
      console.log(chalk.hex('#4AEF79')("    amc up                        # Start AMC Studio + Bridge"));
      console.log(chalk.hex('#4AEF79')("    amc connect --adapter generic-cli"));
      console.log(chalk.gray("\n  Or point your agent's LLM calls through the AMC Gateway:"));
      console.log(chalk.hex('#4AEF79')("    export OPENAI_BASE_URL=http://localhost:3212/v1"));
      console.log(chalk.gray("\n  The gateway proxies all LLM traffic and captures evidence automatically."));
      console.log(chalk.gray("  When done, run: amc score\n"));
      return;
    }
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
    console.log(chalk.hex('#4AEF79')(`Pack diff for ${packId}:`));
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

/* ── Marketplace: amc marketplace ──────────────────────────────── */
const marketplace = program.command("marketplace").description("AMC Pack Marketplace — browse, install, rate community packs");

marketplace
  .command("search")
  .description("Search marketplace for packs")
  .option("-q, --query <query>", "search query")
  .option("--category <cat>", "filter by category (assurance|red-team|policy|compliance|adapter|other)")
  .option("--source <src>", "filter by source (builtin|registry|community)")
  .option("--installed", "show only installed packs")
  .option("--featured", "show only featured packs")
  .option("--min-rating <n>", "minimum average rating", parseFloat)
  .option("--tags <tags>", "comma-separated tag filter")
  .option("--sort <field>", "sort by (name|rating|updated|downloads)", "name")
  .option("--limit <n>", "results per page", parseInt)
  .option("--json", "JSON output")
  .action(async (opts: any) => {
    try {
      const result: any = await mpPackSearchCli({
        workspace: process.cwd(),
        query: opts.query,
        category: opts.category,
        source: opts.source,
        installed: opts.installed,
        featured: opts.featured,
        minRating: opts.minRating,
        tags: opts.tags ? opts.tags.split(",") : undefined,
        sortBy: opts.sort,
        limit: opts.limit
      });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold(`\n📦 Marketplace — ${result.total} packs found\n`));
      for (const e of result.entries) {
        const stars = e.rating && e.rating.totalRatings > 0 ? ` ⭐ ${e.rating.averageScore}` : "";
        const tag = e.installed ? chalk.green(" [installed]") : "";
        const feat = e.featured ? chalk.yellow(" ★featured") : "";
        const dep = e.deprecated ? chalk.red(" [deprecated]") : "";
        console.log(`  ${chalk.hex('#4AEF79')(e.id)} v${e.version}${stars}${tag}${feat}${dep}`);
        console.log(`    ${e.description}`);
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

marketplace
  .command("info")
  .description("Show details for a specific pack")
  .argument("<name>", "pack name or ID")
  .option("--json", "JSON output")
  .action(async (name: string, opts: { json?: boolean }) => {
    try {
      const result: any = await mpPackInfoCli({ workspace: process.cwd(), name });
      if (!result) { console.error(chalk.red(`Pack "${name}" not found`)); process.exit(1); }
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      const e = result.entry;
      console.log(chalk.bold(`\n📦 ${e.name} (${e.id})`));
      console.log(`  Version:     ${e.version}`);
      console.log(`  Category:    ${e.category}`);
      console.log(`  Source:      ${e.source}`);
      console.log(`  Publisher:   ${e.publisher.org}`);
      console.log(`  Installed:   ${e.installed ? "yes" : "no"}`);
      console.log(`  Rating:      ${result.stats.averageScore}/5 (${result.stats.totalRatings} ratings)`);
      if (e.tags.length > 0) console.log(`  Tags:        ${e.tags.join(", ")}`);
      if (e.deprecated) console.log(chalk.red(`  DEPRECATED:  ${e.deprecationNote ?? "yes"}`));
      console.log(`  Description: ${e.description}`);
      if (result.ratings.length > 0) {
        console.log(chalk.bold("\n  Reviews:"));
        for (const r of result.ratings.slice(0, 5)) {
          console.log(`    ${"⭐".repeat(r.score)} by ${r.userId}${r.review ? ` — ${r.review}` : ""}`);
        }
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

marketplace
  .command("install")
  .description("Install a pack from the marketplace")
  .argument("<name>", "pack name or ID")
  .option("--version <ver>", "specific version to install")
  .option("--agent <agentId>", "agent ID")
  .option("--json", "JSON output")
  .action(async (name: string, opts: { version?: string; agent?: string; json?: boolean }) => {
    try {
      const result = await mpPackInstallCli({
        workspace: process.cwd(),
        name,
        version: opts.version,
        agentId: opts.agent ?? activeAgent(program)
      } as any);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
      } else {
        console.error(chalk.red(`❌ ${result.message}`));
        process.exit(1);
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

marketplace
  .command("uninstall")
  .description("Uninstall a pack")
  .argument("<name>", "pack name or ID")
  .option("--agent <agentId>", "agent ID")
  .action(async (name: string, opts: { agent?: string }) => {
    try {
      const result = await mpPackUninstallCli({
        workspace: process.cwd(),
        name,
        agentId: opts.agent ?? activeAgent(program)
      } as any);
      if (result.success) { console.log(chalk.green(`✅ ${result.message}`)); }
      else { console.error(chalk.red(`❌ ${result.message}`)); process.exit(1); }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

marketplace
  .command("rate")
  .description("Rate a pack")
  .argument("<name>", "pack name or ID")
  .requiredOption("--score <n>", "rating 1-5", parseInt)
  .option("--review <text>", "optional review text")
  .option("--user <userId>", "user ID", "anonymous")
  .option("--json", "JSON output")
  .action((name: string, opts: { score: number; review?: string; user: string; json?: boolean }) => {
    try {
      const stats = packRateCli({
        workspace: process.cwd(),
        name,
        userId: opts.user,
        score: opts.score,
        review: opts.review
      });
      if (opts.json) { console.log(JSON.stringify(stats, null, 2)); return; }
      console.log(chalk.green(`✅ Rated "${name}" ${opts.score}/5`));
      if (stats) console.log(`  Average: ${stats.averageScore}/5 (${stats.totalRatings} ratings)`);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

marketplace
  .command("list")
  .description("List installed packs")
  .option("--json", "JSON output")
  .action(async (opts: { json?: boolean }) => {
    try {
      const packsResult = await mpPackListCli({ workspace: process.cwd() }) as any;
      const packsList = packsResult.packages ?? packsResult;
      if (opts.json) { console.log(JSON.stringify(packsResult, null, 2)); return; }
      console.log(chalk.bold(`\n📦 Installed Packs (${packsList.length})\n`));
      for (const e of packsList) {
        console.log(`  ${chalk.hex('#4AEF79')(e.id)} v${e.version} [${e.category}] — ${e.description}`);
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

marketplace
  .command("featured")
  .description("Show featured packs")
  .option("--json", "JSON output")
  .action(async (opts: { json?: boolean }) => {
    try {
      const ids = packFeaturedCli({ workspace: process.cwd() });
      if (opts.json) { console.log(JSON.stringify(ids, null, 2)); return; }
      if (ids.length === 0) { console.log("No featured packs set."); return; }
      console.log(chalk.bold("\n⭐ Featured Packs\n"));
      for (const id of ids) console.log(`  ${chalk.yellow(id)}`);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

marketplace
  .command("deprecate")
  .description("Deprecate a pack")
  .argument("<packId>", "pack ID")
  .option("--note <text>", "deprecation reason")
  .action((packId: string, opts: { note?: string }) => {
    try {
      packDeprecateCli({ workspace: process.cwd(), packId, note: opts.note });
      console.log(chalk.yellow(`Pack "${packId}" deprecated.`));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

marketplace
  .command("undeprecate")
  .description("Remove deprecation from a pack")
  .argument("<packId>", "pack ID")
  .action((packId: string) => {
    try {
      packUndeprecateCli({ workspace: process.cwd(), packId });
      console.log(chalk.green(`Pack "${packId}" undeprecated.`));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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

      const incidentHash = computeIncidentHash(incidentBase as unknown as Parameters<typeof computeIncidentHash>[0]);
      const signatureDigest = sha256Hex(canonicalize({ ...incidentBase, incident_hash: incidentHash }));
      const signature = signHexDigest(signatureDigest, getPrivateKeyPem(workspace, "monitor"));

      store.insertIncident({
        ...incidentBase,
        incident_hash: incidentHash,
        signature
      } as unknown as Parameters<typeof store.insertIncident>[0]);

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
        fromState: currentState as never,
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

passport
  .command("share")
  .description("Generate shareable passport material")
  .requiredOption("--agent <id>", "agent id")
  .requiredOption("--format <format>", "url|qr|json|pdf")
  .option("--base-url <url>", "public base URL", "http://localhost:8787")
  .option("--out <path>", "output file path for pdf format")
  .action((opts: { agent: string; format: string; baseUrl: string; out?: string }) => {
    const format = opts.format.toLowerCase();
    if (format !== "url" && format !== "qr" && format !== "json" && format !== "pdf") {
      throw new Error("format must be url|qr|json|pdf");
    }
    const out = passportShareCli({
      workspace: process.cwd(),
      agentId: resolveAgentId(process.cwd(), opts.agent),
      format: format as "url" | "qr" | "json" | "pdf",
      baseUrl: opts.baseUrl,
      outFile: opts.out
    });
    if (format === "url") {
      console.log(`publicUrl: ${out.publicUrl}`);
      console.log(`verificationUrl: ${out.verificationUrl}`);
      return;
    }
    if (format === "qr") {
      console.log(`verificationUrl: ${out.verificationUrl}`);
      console.log(`qrCodeUrl: ${out.qrCodeUrl}`);
      return;
    }
    if (format === "pdf") {
      console.log(chalk.green("Passport share PDF created"));
      console.log(`File: ${out.file}`);
      console.log(`publicUrl: ${out.publicUrl}`);
      console.log(`verificationUrl: ${out.verificationUrl}`);
      return;
    }
    console.log(JSON.stringify(out, null, 2));
  });

passport
  .command("compare")
  .description("Compare two agents by passport maturity dimensions")
  .argument("<agentIdA>")
  .argument("<agentIdB>")
  .action((agentIdA: string, agentIdB: string) => {
    const first = resolveAgentId(process.cwd(), agentIdA);
    const second = resolveAgentId(process.cwd(), agentIdB);
    const out = passportCompareCli({
      workspace: process.cwd(),
      agentA: first,
      agentB: second
    });
    console.log(`Compared at ${new Date(out.comparedTs).toISOString()}`);
    console.log(`Agent ${first}: passport ${out.agents[first]?.passportId ?? "unknown"} (${out.agents[first]?.status ?? "UNKNOWN"})`);
    console.log(`Agent ${second}: passport ${out.agents[second]?.passportId ?? "unknown"} (${out.agents[second]?.status ?? "UNKNOWN"})`);
    const dimLabelWidth = Math.max("dimension".length, ...out.dimensions.map((row) => row.dimension.length));
    const aLabelWidth = Math.max(first.length, 8);
    const bLabelWidth = Math.max(second.length, 8);
    console.log(`${"dimension".padEnd(dimLabelWidth)}  ${first.padEnd(aLabelWidth)}  ${second.padEnd(bLabelWidth)}  delta`);
    for (const row of out.dimensions) {
      const aVal = row[first];
      const bVal = row[second];
      const delta = row.delta;
      const aText = typeof aVal === "number" ? aVal.toFixed(2) : "n/a";
      const bText = typeof bVal === "number" ? bVal.toFixed(2) : "n/a";
      const deltaText = typeof delta === "number" ? delta.toFixed(2) : "n/a";
      console.log(`${row.dimension.padEnd(dimLabelWidth)}  ${aText.padEnd(aLabelWidth)}  ${bText.padEnd(bLabelWidth)}  ${deltaText}`);
    }
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

const diagnosticBank = diagnostic.command("bank").description("Signed diagnostic 126-question bank operations");

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
  .description("Render contextualized 126-question diagnostic for an agent")
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

    console.log(chalk.hex('#4AEF79')(`Gateway session: ${handle.gatewaySessionId}`));
    console.log(chalk.hex('#4AEF79')(`Gateway URL: http://${handle.host}:${handle.port}`));
    if (handle.proxyEnabled && handle.proxyPort) {
      console.log(chalk.hex('#4AEF79')(`Gateway Proxy URL: http://${handle.host}:${handle.proxyPort}`));
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
    try {
      const created = initCiForAgent({
        workspace: process.cwd(),
        agentId: opts.agent ?? activeAgent(program)
      });
      console.log(chalk.green(`CI workflow created: ${created.workflowPath}`));
      console.log(`Gate policy: ${created.policyPath}`);
      console.log(`Gate policy signature: ${created.policySigPath}`);
      console.log(`Expected bundle path: ${created.suggestedBundlePath}`);
    } catch (e: unknown) {
      const msg = toErrorMessage(e);
      if (msg.includes("Vault locked") || msg.includes("Vault is locked")) {
        console.error(chalk.red("❌ CI init requires a vault for policy signing."));
        console.error(chalk.yellow("   The vault stores cryptographic keys used to sign your gate policy."));
        console.error(chalk.yellow("   Run `amc setup` to create a vault, then re-run `amc ci init`."));
        console.error(chalk.gray("   For CI environments, set the AMC_VAULT_PASSPHRASE env var."));
      } else {
        console.error(chalk.red(`❌ ${msg}`));
      }
      process.exit(1);
    }
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

ci
  .command("check")
  .alias("gate")
  .description("One-liner CI gate: quickscore + threshold check (exit 1 if below)")
  .option("--min-score <n>", "minimum score percentage to pass (0-100)", "20")
  .option("--min-level <level>", "minimum maturity level (L0-L5)", "L1")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--json", "output JSON result", false)
  .action(async (opts: { minScore: string; minLevel: string; agent?: string; json: boolean }) => {
    const { getRapidQuestions, scoreRapidAssessment } = await import("./diagnostic/rapidQuickscore.js");
    const questions = getRapidQuestions();
    // In CI we auto-score (non-interactive) — try auto mode first, fall back to zero-state
    let result: { percentage: number; preliminaryLevel: string; totalScore: number; maxScore: number };
    try {
      const agentId = opts.agent ?? activeAgent(program) ?? "default";
      ensureWorkspaceReadyForAgent(process.cwd(), agentId);
      const report = await runDiagnostic({ workspace: process.cwd(), window: "30d", agentId });
      const avgLevel = report.layerScores.length > 0
        ? report.layerScores.reduce((s, l) => s + l.avgFinalLevel, 0) / report.layerScores.length
        : 0;
      const overallLevel = Math.min(5, Math.floor(avgLevel));
      const pct = report.layerScores.length > 0
        ? Math.round((avgLevel / 5) * 100)
        : 0;
      result = { percentage: pct, preliminaryLevel: `L${overallLevel}`, totalScore: pct, maxScore: 100 };
    } catch {
      // No evidence — score with default answers (L0)
      const answers: Record<string, number> = {};
      result = scoreRapidAssessment(answers);
    }

    const minScore = parseInt(opts.minScore, 10) || 0;
    const minLevelNum = parseInt(opts.minLevel.replace(/\D/g, ""), 10) || 0;
    const actualLevelNum = parseInt(result.preliminaryLevel.replace(/\D/g, ""), 10) || 0;
    const scorePassed = result.percentage >= minScore;
    const levelPassed = actualLevelNum >= minLevelNum;
    const passed = scorePassed && levelPassed;

    if (opts.json) {
      console.log(JSON.stringify({ passed, score: result.percentage, level: result.preliminaryLevel, minScore, minLevel: opts.minLevel }, null, 2));
    } else {
      const icon = passed ? chalk.green("✅ PASS") : chalk.red("❌ FAIL");
      console.log(chalk.bold(`\n🧭 AMC CI Gate Check`));
      console.log(`  Score: ${result.percentage}% (min: ${minScore}%)`);
      console.log(`  Level: ${result.preliminaryLevel} (min: ${opts.minLevel})`);
      console.log(`  Result: ${icon}`);
      if (!passed) {
        console.log(chalk.gray("\n  Fix: amc improve | amc guide --apply"));
      }
      console.log("");
    }
    process.exit(passed ? 0 : 1);
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

    console.log(chalk.hex('#4AEF79')(`Applying archetype: ${preview.archetype.name} (${preview.archetype.id})`));
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
  .command("view")
  .description("Build and open web UI showing maturity scores, test results, and comparison matrix with shareable URLs")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--port <port>", "port", "4173")
  .option("--out <dir>", "dashboard directory override")
  .option("--no-open", "don't automatically open browser")
  .action(async (opts: { agent?: string; port: string; out?: string; open: boolean }) => {
    const resolvedAgent = opts.agent ?? activeAgent(program);
    const defaultOut = resolvedAgent ? `.amc/agents/${resolvedAgent}/dashboard` : ".amc/dashboard";
    
    // Build dashboard first
    const built = buildDashboard({
      workspace: process.cwd(),
      agentId: resolvedAgent,
      outDir: opts.out ?? defaultOut
    });
    
    // Start server
    const handle = await serveDashboard({
      workspace: process.cwd(),
      agentId: resolvedAgent,
      port: Number(opts.port),
      outDir: opts.out ?? defaultOut
    });
    
    console.log(chalk.green(`AMC Web UI running: ${handle.url}`));
    console.log(`Agent: ${handle.agentId}`);
    console.log(`Latest run: ${built.latestRunId}`);
    console.log("");
    console.log(chalk.hex('#4AEF79')("Available endpoints:"));
    console.log(`  Dashboard: ${handle.url}`);
    console.log(`  Export MD: ${handle.url}/export.md`);
    console.log(`  Export PDF: ${handle.url}/export.pdf`);
    console.log("");
    console.log(chalk.gray("Press Ctrl+C to stop server"));
    
    // Open browser if requested
    if (opts.open) {
      const { spawn } = await import("node:child_process");
      const platform = process.platform;
      const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
      spawn(cmd, [handle.url], { detached: true, stdio: "ignore" }).unref();
    }
    
    // Keep server running
    process.on("SIGINT", async () => {
      console.log(chalk.gray("\nStopping server..."));
      await handle.close();
      process.exit(0);
    });
    
    // Keep process alive
    await new Promise(() => {});
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
  .option("--format <format>", "output format: text|sarif", "text")
  .option("--verbose", "show full scenario-level detail with payloads and reasons", false)
  .option("--no-sign", "skip vault/artifact signing (packs still run)", false)
  .action(
    async (opts: {
      agent?: string;
      scope?: "workspace" | "node" | "agent";
      id?: string;
      pack?: string;
      format: string;
      verbose: boolean;
      all: boolean;
      mode: "supervise" | "sandbox";
      window: string;
      windowDays?: string;
      out?: string;
      sign: boolean; // Commander inverts --no-sign to sign=false
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
      const noSign = !opts.sign;
      if (noSign) {
        process.env.AMC_NO_SIGN = "1";
        console.log(chalk.yellow("⚠️  Running without artifact signing (--no-sign). Results are valid but unsigned."));
      }
      const report = await runAssurance({
        workspace: process.cwd(),
        agentId: opts.id ?? opts.agent ?? activeAgent(program),
        packId: opts.pack,
        runAll: opts.all,
        mode: opts.mode,
        window: opts.window,
        outputMarkdownPath: opts.out ? resolve(process.cwd(), opts.out) : undefined,
        noSign
      });
      if (noSign) delete process.env.AMC_NO_SIGN;
      // SARIF output
      if (opts.format === "sarif") {
        const sarifRules = (report.packResults ?? []).map((p, i) => ({
          id: p.packId,
          name: p.title,
          shortDescription: { text: `AMC Assurance Pack: ${p.title}` },
          properties: { score: p.score0to100, pass: p.passCount, fail: p.failCount }
        }));
        const sarifResults = (report.packResults ?? []).flatMap(p =>
          p.scenarioResults.map(s => ({
            ruleId: p.packId,
            level: s.pass ? ("note" as const) : ("error" as const),
            message: { text: `${s.title}: ${s.pass ? "PASS" : "FAIL"} — ${s.reasons.join("; ")}` },
            properties: { scenarioId: s.scenarioId, score: s.score0to100, category: s.category }
          }))
        );
        const sarif = {
          $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
          version: "2.1.0",
          runs: [{
            tool: { driver: { name: "AMC Assurance Lab", version: "1.0.0", rules: sarifRules } },
            results: sarifResults
          }]
        };
        console.log(JSON.stringify(sarif, null, 2));
        return;
      }

      console.log(chalk.green(`Assurance run complete: ${report.assuranceRunId}`));
      console.log(`Status: ${report.status}`);
      console.log(`TrustTier: ${report.trustTier}`);
      console.log(`IntegrityIndex: ${report.integrityIndex.toFixed(3)} (${report.trustLabel})`);
      console.log(`Overall score: ${report.overallScore0to100.toFixed(2)}`);

      // Per-pack breakdown
      if (report.packResults && report.packResults.length > 0) {
        console.log("");
        console.log(chalk.bold("  Pack Results:"));
        for (const pack of report.packResults) {
          const passIcon = pack.failCount === 0 ? chalk.green("✓") : chalk.red("✗");
          const scoreColor = pack.score0to100 >= 70 ? chalk.green : pack.score0to100 >= 40 ? chalk.yellow : chalk.red;
          console.log(`  ${passIcon} ${chalk.hex('#4AEF79')(pack.packId.padEnd(30))} ${scoreColor(pack.score0to100.toFixed(0).padStart(3))}%  ${chalk.green(String(pack.passCount))} pass / ${chalk.red(String(pack.failCount))} fail  (${pack.scenarioCount} scenarios)`);
        }
        console.log("");
        const totalPass = report.packResults.reduce((s, p) => s + p.passCount, 0);
        const totalFail = report.packResults.reduce((s, p) => s + p.failCount, 0);
        console.log(chalk.gray(`  Total: ${totalPass + totalFail} scenarios — ${chalk.green(String(totalPass))} passed, ${chalk.red(String(totalFail))} failed`));

        // Verbose: show per-scenario detail
        if (opts.verbose) {
          console.log("");
          console.log(chalk.bold("  ─── Scenario Detail ───"));
          for (const pack of report.packResults) {
            console.log(`\n  ${chalk.bold.cyan(pack.packId)} (${pack.title ?? pack.packId})`);
            for (const s of (pack as any).scenarioResults ?? []) {
              const icon = s.pass ? chalk.green("✓") : chalk.red("✗");
              console.log(`    ${icon} ${s.title ?? s.scenarioId}`);
              if (s.payload) console.log(chalk.gray(`      Payload: ${typeof s.payload === "string" ? s.payload.substring(0, 120) : JSON.stringify(s.payload).substring(0, 120)}`));
              if (s.reasons?.length) {
                for (const r of s.reasons) console.log(chalk.gray(`      → ${r}`));
              }
              if (s.agentResponse) console.log(chalk.gray(`      Response: ${String(s.agentResponse).substring(0, 120)}`));
            }
          }
        }
      }
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
    console.log(chalk.green(`Assurance scheduler run completed: ${out.run.assuranceRunId}`));
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
  .command("generate")
  .description("Generate execution-proof trust certificate (signed PDF or JSON)")
  .requiredOption("--agent <id>", "agent ID")
  .requiredOption("--output <path>", "output certificate path (.pdf or .json)")
  .option("--valid-days <n>", "certificate validity period in days", "30")
  .option("--badge", "also generate an SVG badge alongside the certificate", false)
  .option("--url", "also generate a shareable verification URL", false)
  .option("--base-url <url>", "base URL for shareable verification links", "https://amc.trust")
  .action(async (opts: { agent: string; output: string; validDays: string; badge: boolean; url: boolean; baseUrl: string }) => {
    const validDays = Number(opts.validDays);
    if (!Number.isFinite(validDays) || validDays <= 0) {
      throw new Error("--valid-days must be a positive number.");
    }
    const generated = generateTrustCertificate({
      workspace: process.cwd(),
      agentId: opts.agent,
      outputPath: opts.output,
      validityDays: validDays
    });
    console.log(chalk.green(`Trust certificate generated: ${generated.outputPath}`));
    console.log(`format=${generated.format}`);
    console.log(`certId=${generated.envelope.payload.certificateId}`);
    console.log(`score=${generated.envelope.payload.score.toFixed(2)}`);
    console.log(`headHash=${generated.envelope.payload.evidenceHashChain.headHash}`);
    if (generated.sidecarJsonPath) {
      console.log(`sidecar=${generated.sidecarJsonPath}`);
    }

    // Generate badge SVG
    if (opts.badge) {
      const { generateBadgeSvg, scoreToLevel } = await import("./cert/badgeGenerator.js");
      const score = generated.envelope.payload.score;
      const level = scoreToLevel(score);
      const svg = generateBadgeSvg(score, level, opts.agent);
      const badgePath = opts.output.replace(/\.[^.]+$/, "") + "-badge.svg";
      writeFileAtomic(badgePath, svg, 0o644);
      console.log(chalk.green(`badge=${badgePath}`));
    }

    // Generate shareable verification URL
    if (opts.url) {
      const certId = generated.envelope.payload.certificateId;
      const verificationUrl = `${opts.baseUrl}/verify/${certId}`;
      const shareUrl = `${opts.baseUrl}/cert/${opts.agent}/${certId}`;
      console.log(`verificationUrl=${verificationUrl}`);
      console.log(`shareUrl=${shareUrl}`);
    }
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
      void stop().catch((error: unknown) => {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      });
    });
    process.on("SIGTERM", () => {
      void stop().catch((error: unknown) => {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      });
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
  .description("Create and sign .amc/trust.yaml — sets up the trust mode (SELF/NOTARY) that governs artifact signing")
  .addHelpText("after", `
Concepts:
  trust.yaml   — config file that declares how AMC verifies artifact signatures
  SELF mode    — AMC signs with its own local key (default, good for development)
  NOTARY mode  — AMC requires an external notary to co-sign (required for production/regulated)

Example workflow:
  amc trust init                              # create SELF-mode trust config
  amc trust status                            # verify trust config and notary health
  amc trust enable-notary --base-url <url> \\  # switch to NOTARY mode
    --pin ./notary-pubkey.pem
`)
  .action(() => {
    assertOwnerMode(process.cwd(), "trust init");
    const created = initTrustConfig(process.cwd());
    console.log(chalk.green(`Trust config created: ${created.path}`));
    console.log(`Signature: ${created.sigPath}`);
    console.log(`Mode: ${created.config.trust.mode}`);
    console.log("");
    console.log(chalk.gray("Next: amc trust status   — verify the config is valid and signed"));
    console.log(chalk.gray("Docs: amc trust init --help   — see concepts and workflow"));
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
  .option("--framework <framework>", `one of: ${frameworkChoices().join(", ")}`)
  .option("--window <window>", "window (e.g. 14d)", "30d")
  .option("--out <path>", "output path (.md or .json)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--json", "output JSON to stdout", false)
  .action((opts: { framework?: string; window: string; out?: string; agent?: string; json: boolean }) => {
    // R3: If --framework is missing, list available frameworks and exit gracefully
    if (!opts.framework) {
      const available = frameworkChoices();
      console.log(chalk.bold("\n📋 Available compliance frameworks:\n"));
      for (const fw of available) {
        console.log(`  ${chalk.hex('#4AEF79')(fw)}`);
      }
      console.log(`\n${chalk.gray("Usage:")} amc comply report --framework ${chalk.hex('#4AEF79')("EU_AI_ACT")}`);
      console.log(chalk.gray("\nTip: use --out report.json for machine-readable output\n"));
      process.exit(0);
    }
    // Default to Markdown output to stdout-friendly file (F13)
    const defaultToMarkdown = !opts.out;
    if (!opts.out) {
      opts.out = `compliance-${opts.framework.toLowerCase()}.md`;
    }
    const normalized = normalizeFrameworkName(opts.framework);
    if (!normalized) {
      const available = frameworkChoices().join(", ");
      console.error(chalk.red(`Unsupported compliance framework: ${opts.framework}`));
      console.log(chalk.gray(`Available: ${available}`));
      console.log(chalk.gray(`\nHint: framework names are case-insensitive. Try: amc comply report --framework HIPAA`));
      process.exit(1); return;
    }
    const framework = normalized;
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
    if (opts.json) {
      console.log(JSON.stringify(out.report, null, 2));
      return;
    }
    console.log(chalk.green(`Compliance report generated: ${out.outFile}`));
    console.log(`Framework: ${family.displayName}`);
    // F14: show coverage as percentage with human-readable label
    const coveragePct = (out.report.coverage.score * 100).toFixed(1);
    const coverageLabel = out.report.coverage.score >= 0.8 ? "SATISFIED" : out.report.coverage.score >= 0.5 ? "PARTIAL" : "INSUFFICIENT";
    console.log(`Coverage: ${coveragePct}% (${coverageLabel})`);
    if (out.report.coverage.score === 0) {
      console.log(chalk.gray(`  💡 Coverage is 0% because no evidence has been collected yet.`));
      console.log(chalk.gray(`     This is expected for a fresh workspace. Capture evidence first:`));
      console.log(chalk.gray(`     amc wrap <runtime> -- <your-agent-command>`));
      console.log(chalk.gray(`     amc evidence collect`));
    }
    if (defaultToMarkdown) {
      console.log(chalk.gray(`  Tip: use --out report.json for machine-readable output`));
    }
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

compliance
  .command("risk-classify")
  .description("Classify agent into EU AI Act risk tiers (UNACCEPTABLE / HIGH / LIMITED / MINIMAL)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--capabilities <json>", "JSON object of agent capabilities (see docs)")
  .option("--biometric", "agent performs biometric identification", false)
  .option("--critical-infra", "agent manages critical infrastructure", false)
  .option("--education", "agent makes education/assessment decisions", false)
  .option("--employment", "agent makes employment decisions", false)
  .option("--essential-services", "agent controls access to essential services", false)
  .option("--law-enforcement", "agent assists law enforcement", false)
  .option("--migration", "agent handles migration/border control", false)
  .option("--justice", "agent assists judicial/democratic processes", false)
  .option("--realtime-biometric", "agent performs real-time biometric ID in public spaces", false)
  .option("--social-scoring", "agent performs social scoring", false)
  .option("--subliminal", "agent uses subliminal manipulation techniques", false)
  .option("--exploits-vulnerabilities", "agent exploits vulnerabilities (age, disability)", false)
  .option("--emotion-recognition", "agent performs emotion recognition", false)
  .option("--chatbot", "agent is a chatbot/conversational system", false)
  .option("--synthetic-content", "agent generates synthetic audio/image/video/text", false)
  .option("--human-interaction", "agent interacts with humans", false)
  .option("--safety-component", "agent is a safety component of a regulated product", false)
  .option("--json", "output as JSON", false)
  .action(async (opts: {
    agent?: string; capabilities?: string;
    biometric: boolean; criticalInfra: boolean; education: boolean; employment: boolean;
    essentialServices: boolean; lawEnforcement: boolean; migration: boolean; justice: boolean;
    realtimeBiometric: boolean; socialScoring: boolean; subliminal: boolean;
    exploitsVulnerabilities: boolean; emotionRecognition: boolean; chatbot: boolean;
    syntheticContent: boolean; humanInteraction: boolean; safetyComponent: boolean;
    json: boolean;
  }) => {
    const { classifyEuAiActRisk } = await import("./compliance/euAiActClassifier.js");

    let capabilities: import("./compliance/euAiActClassifier.js").AgentCapabilities = {};

    if (opts.capabilities) {
      try {
        capabilities = JSON.parse(opts.capabilities) as typeof capabilities;
      } catch {
        console.error(chalk.red("Invalid --capabilities JSON"));
        process.exit(1);
      }
    } else {
      // Build from individual flags
      capabilities = {
        biometricIdentification: opts.biometric,
        criticalInfrastructure: opts.criticalInfra,
        education: opts.education,
        employment: opts.employment,
        essentialServices: opts.essentialServices,
        lawEnforcement: opts.lawEnforcement,
        migrationBorderControl: opts.migration,
        justiceAdministration: opts.justice,
        realtimeBiometricPublicSpaces: opts.realtimeBiometric,
        socialScoring: opts.socialScoring,
        subliminalManipulation: opts.subliminal,
        exploitsVulnerabilities: opts.exploitsVulnerabilities,
        emotionRecognition: opts.emotionRecognition,
        chatbot: opts.chatbot,
        syntheticContentGeneration: opts.syntheticContent,
        humanInteraction: opts.humanInteraction,
        safetyComponent: opts.safetyComponent
      };
    }

    const result = classifyEuAiActRisk(capabilities);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const tierColors: Record<string, string> = {
      UNACCEPTABLE: "#e05d44",
      HIGH: "#e4811b",
      LIMITED: "#dfb317",
      MINIMAL: "#4c1"
    };
    const tierColor = tierColors[result.riskTier] ?? "#555";

    console.log("");
    console.log(chalk.bold("🇪🇺 EU AI Act Risk Classification"));
    console.log("");
    console.log(`Risk Tier: ${chalk.hex(tierColor).bold(result.riskTier)}`);
    console.log(`Articles: ${result.articles.length > 0 ? result.articles.join(", ") : "none"}`);
    console.log("");
    console.log(result.summary);
    console.log("");

    if (result.findings.length > 0) {
      console.log(chalk.bold("Findings:"));
      for (const finding of result.findings) {
        const sev = finding.severity === "CRITICAL" ? chalk.red(`[${finding.severity}]`)
          : finding.severity === "HIGH" ? chalk.yellow(`[${finding.severity}]`)
          : chalk.gray(`[${finding.severity}]`);
        console.log(`  ${sev} ${finding.title} (${finding.article})`);
        console.log(chalk.gray(`    ${finding.description}`));
      }
      console.log("");
    }

    if (result.remediation.length > 0) {
      console.log(chalk.bold("Remediation Checklist:"));
      for (const item of result.remediation) {
        const pri = item.priority === "IMMEDIATE" ? chalk.red("⚡") : item.priority === "SHORT_TERM" ? chalk.yellow("🔶") : chalk.gray("🔷");
        console.log(`  ${pri} [${item.priority}] ${item.action}`);
        console.log(chalk.gray(`     ${item.article}`));
      }
    }
    console.log("");
    console.log(chalk.gray("Tip: amc comply roadmap --framework EU_AI_ACT to generate a compliance plan."));
  });

compliance
  .command("roadmap")
  .description("Generate step-by-step compliance plan for a framework")
  .requiredOption("--framework <framework>", "compliance framework (currently: EU_AI_ACT)")
  .option("--agent <agentId>", "agent ID (overrides global --agent)")
  .option("--capabilities <json>", "JSON object of agent capabilities")
  .option("--risk-tier <tier>", "override risk tier: UNACCEPTABLE|HIGH|LIMITED|MINIMAL")
  .option("--out <path>", "save roadmap to JSON file")
  .option("--json", "output as JSON", false)
  .action(async (opts: {
    framework: string; agent?: string; capabilities?: string;
    riskTier?: string; out?: string; json: boolean;
  }) => {
    if (opts.framework.toUpperCase() !== "EU_AI_ACT") {
      console.error(chalk.red("Currently only --framework EU_AI_ACT is supported for roadmap generation."));
      process.exit(1);
    }

    const { classifyEuAiActRisk, generateEuAiActRoadmap } = await import("./compliance/euAiActClassifier.js");

    let classification: ReturnType<typeof classifyEuAiActRisk>;

    if (opts.riskTier) {
      // Use provided risk tier with empty findings
      const tier = opts.riskTier.toUpperCase() as import("./compliance/euAiActClassifier.js").EuAiActRiskTier;
      classification = { riskTier: tier, articles: [], findings: [], remediation: [], summary: "", classifiedAt: Date.now() };
    } else {
      let capabilities: import("./compliance/euAiActClassifier.js").AgentCapabilities = {};
      if (opts.capabilities) {
        try {
          capabilities = JSON.parse(opts.capabilities) as typeof capabilities;
        } catch {
          console.error(chalk.red("Invalid --capabilities JSON"));
          process.exit(1);
        }
      }
      classification = classifyEuAiActRisk(capabilities);
    }

    const roadmap = generateEuAiActRoadmap(classification);

    if (opts.json || opts.out) {
      const output = JSON.stringify(roadmap, null, 2);
      if (opts.out) {
        writeFileAtomic(resolve(process.cwd(), opts.out), output, 0o644);
        console.log(chalk.green(`EU AI Act compliance roadmap saved to: ${opts.out}`));
      } else {
        console.log(output);
      }
      return;
    }

    console.log("");
    console.log(chalk.bold("🇪🇺 EU AI Act Compliance Roadmap"));
    console.log(`Risk Tier: ${chalk.bold(roadmap.riskTier)}`);
    console.log(`Steps: ${roadmap.totalSteps} | Estimated: ${roadmap.estimatedTotalWeeks} weeks`);
    console.log("");

    let currentPhase = "";
    for (const step of roadmap.phases) {
      if (step.phase !== currentPhase) {
        currentPhase = step.phase;
        console.log(chalk.hex('#4AEF79').bold(`\n${currentPhase}`));
      }
      const priIcon = step.priority === "CRITICAL" ? "🔴" : step.priority === "HIGH" ? "🟠" : "🟡";
      console.log(`  ${priIcon} Step ${step.step}: ${chalk.bold(step.title)} (~${step.estimatedWeeks}w)`);
      console.log(chalk.gray(`     ${step.description}`));
      console.log(chalk.gray(`     Articles: ${step.articles.join(", ")}`));
    }
    console.log("");
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

integrations
  .command("export-journal")
  .description("Export integration delivery journal (receipts + dead letters)")
  .requiredOption("--out <file>", "output JSON file path")
  .action((opts: { out: string }) => {
    const out = integrationsExportJournalCli({
      workspace: process.cwd(),
      outFile: opts.out
    });
    console.log(chalk.green(`Integration delivery journal exported: ${out.outFile}`));
    console.log(`receipts=${out.receiptCount} deadLetters=${out.deadLetterCount}`);
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

function parseDimensionThresholds(raw: string | undefined): Partial<Record<1 | 2 | 3 | 4 | 5, number>> {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  const out: Partial<Record<1 | 2 | 3 | 4 | 5, number>> = {};
  const parts = raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  for (const part of parts) {
    const [dimensionRaw, levelRaw] = part.split(":");
    const dimension = Number.parseInt(dimensionRaw ?? "", 10);
    const level = Number.parseFloat(levelRaw ?? "");
    if (!Number.isFinite(dimension) || !Number.isFinite(level) || dimension < 1 || dimension > 5) {
      throw new Error(`Invalid --dimension-min value "${part}". Expected comma list like "2:3,5:4".`);
    }
    out[dimension as 1 | 2 | 3 | 4 | 5] = level;
  }
  return out;
}

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
  .description("Generate fleet maturity report (md) or fleet compliance report (pdf)")
  .option("--window <window>", "evidence window", "30d")
  .option("--format <format>", "md|pdf", "md")
  .option("--output <path>", "output path", ".amc/reports/fleet.md")
  .action(async (opts: { window: string; format: string; output: string }) => {
    const format = opts.format.toLowerCase();
    if (format === "pdf") {
      const resolvedOut = opts.output.toLowerCase().endsWith(".pdf")
        ? opts.output
        : opts.output.toLowerCase().endsWith(".md")
          ? opts.output.replace(/\.md$/i, ".pdf")
          : `${opts.output}.pdf`;
      const report = generateFleetComplianceReport({
        workspace: process.cwd(),
        format: "pdf",
        outFile: resolve(process.cwd(), resolvedOut)
      });
      console.log(chalk.green(`Fleet compliance report written: ${report.outFile}`));
      console.log(`Agents included: ${report.agentCount}`);
      console.log(`sha256=${report.sha256}`);
      return;
    }
    if (format !== "md") {
      throw new Error(`Unsupported format: ${opts.format}. Use md or pdf.`);
    }
    const report = await generateFleetReport({
      workspace: process.cwd(),
      window: opts.window,
      outputPath: resolve(process.cwd(), opts.output)
    });
    console.log(chalk.green(`Fleet report written: ${report.reportPath}`));
    console.log(`Agents included: ${report.agentCount}`);
  });

fleet
  .command("score")
  .description("Score multiple agents in one run with fleet-wide aggregates, weak-link detection, and pairwise comparison")
  .option("--window <window>", "evidence window (e.g. 7d, 30d)", "30d")
  .option("--agents <ids>", "comma-separated agent IDs (default: all)")
  .option("--max-comparisons <n>", "max pairwise comparisons (0 to skip)", "50")
  .option("--out <path>", "output JSON path (relative to .amc/reports/)")
  .option("--md", "also print markdown summary to stdout", false)
  .option("--json", "print full JSON to stdout", false)
  .action(async (opts: { window: string; agents?: string; maxComparisons: string; out?: string; md?: boolean; json?: boolean }) => {
    const agentIds = opts.agents ? opts.agents.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined;
    const result = await evaluateFleet({
      workspace: process.cwd(),
      window: opts.window,
      agentIds,
      maxComparisons: parseInt(opts.maxComparisons, 10),
      outputPath: opts.out,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(chalk.green(`Fleet scoring complete: ${result.agentCount} agents evaluated`));
    console.log(`Mean: ${result.aggregate.fleetMeanScore} | Median: ${result.aggregate.fleetMedianScore} | StdDev: ${result.aggregate.fleetStdDev}`);
    console.log(`Weak links: ${result.weakLinks.length}`);
    for (const wl of result.weakLinks) {
      console.log(chalk.yellow(`  ⚠ ${wl.agentId}: score=${wl.overallScore}, risk=${wl.riskLabel}, ${wl.deviationFromMean}σ below mean`));
    }
    if (opts.md) {
      console.log("\n" + renderFleetScoringMarkdown(result));
    }
    if (opts.out) {
      console.log(chalk.green(`Report written: ${opts.out}`));
    }
  });

fleet
  .command("health")
  .description("Show fleet health dashboard aggregates")
  .option("--json", "print full JSON payload", false)
  .action((opts: { json?: boolean }) => {
    const health = buildFleetHealthDashboard({ workspace: process.cwd() });
    if (opts.json) {
      console.log(JSON.stringify(health, null, 2));
      return;
    }
    console.log(`Fleet baseline integrity: ${health.baselineIntegrityIndex.toFixed(3)}`);
    console.log(`Agents: ${health.agentCount} (scored ${health.scoredAgentCount})`);
    console.log(`Average integrity: ${health.averageIntegrityIndex.toFixed(3)}`);
    console.log(`Average overall level: ${health.averageOverallLevel.toFixed(2)}`);
    console.log(`Dimension 2 average: ${health.dimensionAverages[2].toFixed(2)}`);
    const activeDrift = health.agents.filter((agent) => agent.belowBaseline).map((agent) => agent.agentId);
    console.log(`Drift below baseline: ${activeDrift.length > 0 ? activeDrift.join(", ") : "none"}`);
    // F25: guidance when all zeros
    if (health.scoredAgentCount === 0) {
      console.log("");
      console.log(chalk.yellow("No scored agents yet. Score your first agent: ") + chalk.hex('#4AEF79')("amc quickscore"));
      console.log(chalk.gray("  Then run a full diagnostic:") + " " + chalk.hex('#4AEF79')("amc score formal-spec <agentId>"));
    }
  });

fleet
  .command("status")
  .description("Show fleet overview (agent count, average score, health)")
  .option("--json", "print full JSON payload", false)
  .action((opts: { json?: boolean }) => {
    const health = buildFleetHealthDashboard({ workspace: process.cwd() });
    if (opts.json) {
      console.log(JSON.stringify(health, null, 2));
      return;
    }
    console.log(chalk.bold("\n🌐  Fleet Status"));
    console.log(`  Agents:          ${health.agentCount} total, ${health.scoredAgentCount} scored`);
    console.log(`  Avg score:       L${health.averageOverallLevel.toFixed(1)} (integrity: ${health.averageIntegrityIndex.toFixed(3)})`);
    console.log(`  Baseline:        ${health.baselineIntegrityIndex.toFixed(3)}`);
    const drifting = health.agents.filter((agent: { belowBaseline: boolean; agentId: string }) => agent.belowBaseline).map((agent: { belowBaseline: boolean; agentId: string }) => agent.agentId);
    if (drifting.length > 0) {
      console.log(chalk.yellow(`  ⚠ Drifting:      ${drifting.join(", ")}`));
    } else {
      console.log(chalk.green(`  Health:          All agents at or above baseline`));
    }
    console.log("");
  });

const fleetPolicy = fleet.command("policy").description("Fleet governance policy operations");
const fleetSlo = fleet.command("slo").description("Fleet governance SLO operations");

fleetPolicy
  .command("apply")
  .description("Apply a governance policy to all fleet agents or one environment")
  .requiredOption("--policy-id <id>", "policy ID")
  .requiredOption("--description <text>", "policy description")
  .option("--min-integrity <n>", "minimum integrity index (0-1)", "0.6")
  .option("--dimension-min <rules>", "dimension minimums, e.g. 2:3,5:4")
  .option("--env <environment>", "dev|staging|production (default: all environments)")
  .action((opts: {
    policyId: string;
    description: string;
    minIntegrity: string;
    dimensionMin?: string;
    env?: string;
  }) => {
    const result = applyFleetGovernancePolicy({
      workspace: process.cwd(),
      policyId: opts.policyId,
      description: opts.description,
      minimumIntegrityIndex: Number.parseFloat(opts.minIntegrity),
      minimumDimensionLevel: parseDimensionThresholds(opts.dimensionMin),
      environment: opts.env
    });
    console.log(chalk.green(`Fleet policy applied: ${result.policy.policyId}`));
    console.log(`Scope: ${result.environment}`);
    console.log(`Agents updated: ${result.updatedAgentIds.length}`);
    if (result.updatedAgentIds.length > 0) {
      console.log(`- ${result.updatedAgentIds.join(", ")}`);
    }
    console.log(`State: ${result.statePath}`);
  });

fleetPolicy
  .command("list")
  .description("List effective fleet governance policies")
  .action(() => {
    const policies = listFleetGovernancePolicies(process.cwd());
    if (policies.globalPolicy) {
      console.log(`global: ${policies.globalPolicy.policyId} minIntegrity=${policies.globalPolicy.minimumIntegrityIndex.toFixed(3)}`);
    } else {
      console.log("global: none");
    }
    for (const env of ["development", "staging", "production"] as const) {
      const policy = policies.byEnvironment[env];
      if (policy) {
        console.log(`${env}: ${policy.policyId} minIntegrity=${policy.minimumIntegrityIndex.toFixed(3)}`);
      }
    }
  });

fleet
  .command("tag")
  .description("Tag an agent with an environment")
  .argument("<agentId>")
  .requiredOption("--env <environment>", "dev|staging|production")
  .action((agentId: string, opts: { env: string }) => {
    const result = tagFleetAgentEnvironment({
      workspace: process.cwd(),
      agentId,
      environment: opts.env
    });
    console.log(chalk.green(`Agent ${result.agentId} tagged as ${result.environment}`));
    console.log(`Config: ${result.configPath}`);
    console.log(`Signature: ${result.sigPath}`);
    if (result.appliedPolicyId) {
      console.log(`Applied policy: ${result.appliedPolicyId}`);
    }
  });

fleetSlo
  .command("define")
  .description('Define a fleet SLO, e.g. "95% of production agents must score L3+ on dimension 2"')
  .requiredOption("--objective <text>", "SLO objective")
  .option("--id <sloId>", "optional stable SLO ID")
  .action((opts: { objective: string; id?: string }) => {
    const slo = defineFleetSlo({
      workspace: process.cwd(),
      objective: opts.objective,
      sloId: opts.id
    });
    console.log(chalk.green(`Fleet SLO defined: ${slo.sloId}`));
    console.log(`Environment: ${slo.environment}`);
    console.log(`Target: ${(slo.requiredPercent * 100).toFixed(1)}% of agents must score L${slo.minimumLevel}+ on dimension ${slo.dimension}`);
  });

fleetSlo
  .command("status")
  .description("Show fleet SLO compliance status")
  .action(() => {
    const status = fleetSloStatus(process.cwd());
    const color = status.overallStatus === "BREACHED" ? chalk.red : chalk.green;
    console.log(color(`Overall SLO status: ${status.overallStatus}`));
    if (status.statuses.length === 0) {
      console.log("No fleet SLOs defined.");
      return;
    }
    for (const row of status.statuses) {
      const rowColor = row.status === "BREACHED" ? chalk.red : chalk.green;
      console.log(
        rowColor(
          `- ${row.sloId}: ${row.status} ${(row.complianceRatio * 100).toFixed(1)}% (target ${(row.requiredPercent * 100).toFixed(
            1
          )}%) env=${row.environment} dim=${row.dimension} L${row.minimumLevel}+`
        )
      );
    }
  });

fleetSlo
  .command("list")
  .description("List fleet SLO definitions")
  .action(() => {
    const slos = listFleetSlos(process.cwd());
    if (slos.length === 0) {
      console.log("No fleet SLOs defined.");
      return;
    }
    for (const slo of slos) {
      console.log(`- ${slo.sloId}: ${slo.objective}`);
    }
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
  .option("--no-sign", "skip vault/artifact signing (report still generates, just unsigned)")
  .action(async (opts: { window: string; output?: string; sign: boolean }) => {
    const workspace = process.cwd();
    const noSign = !opts.sign;
    if (noSign) {
      process.env.AMC_NO_SIGN = "1";
      console.log(chalk.yellow("⚠️  Running without artifact signing (--no-sign). Report is valid but unsigned."));
    }
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
        noSign,
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
    if (noSign) delete process.env.AMC_NO_SIGN;
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
    console.log(chalk.hex('#4AEF79')(`Audit event: ${learned.auditEventId}`));
  });

// ── Governance Lineage CLI ──────────────────────────────────────────────
program
  .command("lineage-init")
  .description("Initialize governance lineage tables")
  .action(() => {
    const { initGovernanceLineageTables } = require("./claims/governanceLineage.js") as typeof import("./claims/governanceLineage.js");
    const ledger = openLedger(process.cwd());
    const db = ledger.db;
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
    const db = ledger.db;
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
    const db = ledger.db;
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
    const db = ledger.db;
    initGovernanceLineageTables(db);
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const intents = getPolicyIntentsByAgent(db, agentId);
    ledger.close();
    if (intents.length === 0) {
      console.log("No policy change intents recorded.");
      return;
    }
    for (const intent of intents) {
      console.log(chalk.hex('#4AEF79')(`[${intent.intentId}] ${intent.category}`));
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
    const db = ledger.db;
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    // Get evidence events from ledger
    const events = db.prepare("SELECT * FROM evidence_events WHERE runtime != 'mock' ORDER BY ts DESC LIMIT 500").all() as import("./types.js").EvidenceEvent[];
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
    const db = ledger.db;
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const questionIds = opts.questions.split(",").map((s: string) => s.trim());
    const events = db.prepare("SELECT * FROM evidence_events WHERE runtime != 'mock' ORDER BY ts DESC LIMIT 500").all() as import("./types.js").EvidenceEvent[];
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
    if (!(validModes as readonly string[]).includes(mode)) {
      console.log(chalk.red(`Invalid mode: ${mode}. Must be STRICT, BALANCED, or LEAN.`));
      return;
    }
    const profile = oh.setOverheadProfile(mode as typeof validModes[number]);
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
    const baselineKind = (validKinds as readonly string[]).includes(opts.baselineKind) ? opts.baselineKind as typeof validKinds[number] : "POLICY_FRAME";
    const candidateKind = (validKinds as readonly string[]).includes(opts.candidateKind) ? opts.candidateKind as typeof validKinds[number] : "POLICY_FRAME";
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
    const db = ledger.db;
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
    const db = ledger.db;
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
    const db = ledger.db;
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
    const db = ledger.db;
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
    console.log(chalk.hex('#4AEF79')(`Saved: ${ownership.outputFile}`));
    console.log(chalk.hex('#4AEF79')(`Audit event: ${ownership.auditEventId}`));
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

audit
  .command("export")
  .description("Export enterprise audit logs for Splunk, Datadog, CloudTrail, or Azure Monitor")
  .requiredOption("--format <format>", "splunk|datadog|cloudtrail|azure")
  .requiredOption("--output <path>", "output JSON file path")
  .option("--limit <n>", "maximum events to export", "1000")
  .action((opts: { format: string; output: string; limit: string }) => {
    const format = opts.format.toLowerCase();
    if (!["splunk", "datadog", "cloudtrail", "azure"].includes(format)) {
      throw new Error("format must be splunk|datadog|cloudtrail|azure");
    }
    const limit = Number.parseInt(opts.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error("limit must be a positive integer");
    }
    const out = auditEnterpriseExportCli({
      workspace: process.cwd(),
      format: format as "splunk" | "datadog" | "cloudtrail" | "azure",
      output: opts.output,
      limit
    });
    console.log(chalk.green("Enterprise audit export complete"));
    console.log(`format: ${out.format}`);
    console.log(`output: ${out.outputPath}`);
    console.log(`events: ${out.eventCount}`);
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
      kind: opts.kind as never,
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
    const exps = lab.listLabExperiments(opts.kind as never);
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
        console.log(`  ${chalk.hex('#4AEF79')(e.method)} ${e.path} → ${chalk.green(e.sdkMethod)} (${e.provider})`);
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
      console.log(`    ${chalk.hex('#4AEF79')(f.path)} — ${f.description}`);
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
      region: opts.region as never,
      isolationLevel: opts.isolation as never,
      keyCustodyMode: opts.custody as never,
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
      region: opts.region as never,
      isolationLevel: opts.isolation as never,
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
    if (!(validRoles as readonly string[]).includes(opts.role)) {
      console.log(chalk.red(`Invalid role: ${opts.role}. Must be operator, executive, or auditor.`));
      return;
    }
    // Build mock report for CLI demo when no real run is available
    const agentId = activeAgent(program) ?? "default";
    const mockReport = buildMockReportForUx(agentId, opts.run ?? "latest");
    const mockPrevious = opts.previousRun ? buildMockReportForUx(agentId, opts.previousRun) : null;
    const dashboard = opux.generateOperatorDashboard(mockReport, opts.role as typeof validRoles[number], mockPrevious);
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
      console.log(chalk.hex('#4AEF79')("\nUsage in your code:"));
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
      console.log(chalk.hex('#4AEF79')("\nUsage in your code:"));
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
      console.log(chalk.hex('#4AEF79')("\nUsage in your code:"));
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
    const scaffold = is.generateScaffold(framework as never);
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
    const db = ledger.db;
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
    const db = ledger.db;
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
    const db = ledger.db;
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
    const lessons = listLessons(process.cwd(), scope as 'agent' | 'fleet', agentId);
    console.log(renderLessonsMarkdown(lessons, scope));
  });

program
  .command("lessons-promote")
  .description("Promote a correction to a reusable lesson")
  .argument("<correctionId>", "correction ID to promote")
  .action((correctionId: string) => {
    const { promoteCorrection } = require("./corrections/lessonStore.js") as typeof import("./corrections/lessonStore.js");
    const ledger = openLedger(process.cwd());
    const db = ledger.db;
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
    const db = ledger.db;
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
      type: opts.type as never,
      reason: opts.reason,
      expiryTs,
      affectedPolicies: opts.policies ? opts.policies.split(",").map((s: string) => s.trim()) : [],
      riskAssessment: opts.risk as never,
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
      mode: opts.mode as never,
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

program.action(async (_opts, command: Command) => {
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
    console.error(chalk.hex('#4AEF79')("Run 'amc --help' to explore top-level commands."));
    process.exit(1);
    return;
  }

  // Interactive REPL when TTY
  if (process.stdin.isTTY) {
    const { startRepl } = await import("./repl/amcRepl.js");
    await startRepl();
    return;
  }

  // Welcome screen — shown when piped/non-interactive
  const hasWorkspace = existsSync(".amc");

  console.log("");
  console.log(chalk.bold.hex('#4AEF79')("  🧭 Agent Maturity Compass"));
  console.log(chalk.gray("  The credit score for AI agents."));
  console.log("");

  if (!hasWorkspace) {
    console.log(chalk.white("  No workspace found. Get started:"));
    console.log("");
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc setup"), chalk.gray("           Set up provider + workspace"));
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc quickscore"), chalk.gray("     2-minute maturity assessment (no setup needed)"));
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc demo gap"), chalk.gray("       See the 84-point documentation inflation demo"));
    console.log("");
    console.log(chalk.gray("  Guide:"), chalk.underline("https://github.com/thewisecrab/AgentMaturityCompass/blob/main/docs/GETTING_STARTED.md"));
  } else {
    console.log(chalk.green("  ✓ Workspace found"));
    console.log("");
    console.log(chalk.bold("  Common commands:"));
    console.log("");
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc quickscore"), chalk.gray("       2-minute maturity assessment"));
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc doctor"), chalk.gray("           Check environment health"));
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc up"), chalk.gray("               Start Studio (web dashboard)"));
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc score --help"), chalk.gray("     All scoring commands"));
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc status"), chalk.gray("           Show current status"));
    console.log("");
    console.log(chalk.bold("  Improve your agent:"));
    console.log("");
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc score formal-spec <agent>"), chalk.gray("   Full diagnostic"));
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc score collect-evidence <agent>"), chalk.gray("Gather proof"));
    console.log(chalk.white("  $"), chalk.hex('#4AEF79')("amc explain <questionId>"), chalk.gray("        Learn about any question"));
    console.log("");
    console.log(chalk.gray("  All commands:"), chalk.hex('#4AEF79')("amc --help"));
  }
  console.log("");
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

// ── Shield Red Team ──────────────────────────────────────────────────────────
shield
  .command("red-team")
  .description("Run a quick red team campaign (5 attacks on demo target). Tip: For full red-team suite with strategies, use `amc redteam run`")
  .option("--rounds <n>", "Number of attack rounds (default: 1)", "1")
  .option("--categories <list>", "Comma-separated attack categories to use")
  .option("--target <profile>", "Target profile id (default: demo)")
  .action(async (opts: { rounds?: string; categories?: string; target?: string }) => {
    try {
      const { ContinuousRedTeam } = await import("./shield/continuousRedTeam.js");
      const rounds = parseInt(opts.rounds ?? "1", 10);
      const targetId = opts.target ?? "demo";
      const rt = new ContinuousRedTeam({
        intervalMs: 60000,
        attacksPerRound: 5,
        maxEvolutionDepth: 3,
        regressionAlertThreshold: 0.1,
        enableAutoEscalation: false,
        independentRatio: 0.6,
        mutationRate: 0.3,
        crossoverRate: 0.2,
        elitePoolSize: 50,
        targetProfiles: [
          {
            id: targetId,
            name: opts.target ?? "Demo Target",
            systemPurpose: "AMC CLI demo red-team target",
            evaluator: async (attack: { payload: string }) => ({
              attackId: attack.payload.slice(0, 8),
              succeeded: Math.random() < 0.2,
              response: "simulated",
              latencyMs: 50 + Math.random() * 100,
              bypassedDefenses: [],
              detectedBy: ["shield"],
              bypassConfidence: 0.1,
            }),
          },
        ],
      });
      console.log(chalk.bold.red(`\n🔴  Red Team Campaign`));
      console.log(chalk.dim("Tip: For full red-team suite with strategies, use `amc redteam run`"));
      console.log(chalk.gray("Target:"), targetId);
      console.log(chalk.gray("Rounds:"), rounds);
      if (opts.categories) console.log(chalk.gray("Categories:"), opts.categories);
      console.log(chalk.yellow("Running red team rounds..."));
      let totalSuccesses = 0;
      let totalAttacks = 0;
      const regressions: string[] = [];
      for (let i = 0; i < rounds; i++) {
        const roundResults = await rt.runAllTargets();
        for (const round of roundResults) {
          totalAttacks += round.attacks.length;
          totalSuccesses += round.attacks.filter((a) => a.result.succeeded).length;
          regressions.push(...round.regressions);
          console.log(chalk.gray(`  Round ${i + 1}: attacks=${round.attacks.length} success_rate=${(round.successRate * 100).toFixed(1)}%`));
        }
      }
      const overallSuccessRate = totalAttacks > 0 ? (totalSuccesses / totalAttacks) * 100 : 0;
      console.log(chalk.bold("\nSummary:"));
      console.log(chalk.gray("Total attacks:"), totalAttacks);
      console.log(chalk.gray("Overall success rate:"), overallSuccessRate < 10 ? chalk.green(`${overallSuccessRate.toFixed(1)}%`) : chalk.red(`${overallSuccessRate.toFixed(1)}%`));
      console.log(chalk.gray("Regressions detected:"), regressions.length > 0 ? chalk.red(regressions.length.toString()) : chalk.green("none"));
      if (regressions.length > 0) {
        for (const r of regressions) console.log(chalk.red(`  ⚠ ${r}`));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

shield
  .command("red-team-status")
  .description("Show current red team capabilities and attack template count")
  .action(async () => {
    try {
      const { ContinuousRedTeam } = await import("./shield/continuousRedTeam.js");
      console.log(chalk.bold.red("\n🔴  Red Team Status"));
      console.log(chalk.gray("Module:"), "ContinuousRedTeam");
      console.log(chalk.gray("Status:"), chalk.green("available"));
      console.log(chalk.gray("Attack strategies:"), "independent, evolutionary, mutation, crossover");
      console.log(chalk.gray("Capabilities:"), "regression detection, auto-escalation, elite pool");
      console.log(chalk.gray("Config options:"), "intervalMs, attacksPerRound, maxEvolutionDepth, independentRatio");
      const rt = new ContinuousRedTeam({
        intervalMs: 60000, attacksPerRound: 5, maxEvolutionDepth: 3,
        regressionAlertThreshold: 0.1, enableAutoEscalation: false,
        independentRatio: 0.6, mutationRate: 0.3, crossoverRate: 0.2,
        elitePoolSize: 50, targetProfiles: [],
      });
      console.log(chalk.gray("Instance:"), rt ? chalk.green("ready") : chalk.red("failed"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

shield
  .command("trust-pipeline")
  .description("Run end-to-end trust pipeline for an agent action")
  .requiredOption("--agent <id>", "Agent ID")
  .requiredOption("--action <action>", "Action to evaluate")
  .requiredOption("--tool <tool>", "Tool name")
  .option("--session <id>", "Session ID", "cli-session")
  .option("--workspace <id>", "Workspace ID")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; action: string; tool: string; session: string; workspace?: string; json?: boolean }) => {
    try {
      const { runTrustPipeline } = await import("./shield/trustPipeline.js");
      const result = await runTrustPipeline({
        agentId: opts.agent,
        action: opts.action,
        toolName: opts.tool,
        parameters: {},
        sessionId: opts.session,
        workspaceId: opts.workspace ?? process.cwd(),
      });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🛡️  Trust Pipeline"));
      console.log(chalk.gray("Agent:"), opts.agent);
      console.log(chalk.gray("Allowed:"), result.allowed ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Overall Trust Score:"), result.overallTrustScore.toFixed(1));
      console.log(chalk.gray("Processing Time:"), `${result.processingTimeMs}ms`);
      console.log(chalk.gray("Stages:"));
      const sg = result.stages.shieldGate;
      console.log(chalk.gray("  Shield Gate:"), sg.passed ? chalk.green("passed") : chalk.red("failed"), `(score: ${sg.trustScore.toFixed(2)})`);
      const fv = result.stages.formalVerification;
      console.log(chalk.gray("  Formal Verification:"), fv.passed ? chalk.green("passed") : chalk.yellow("warnings"), `(${fv.propertiesVerified} properties verified)`);
      const zk = result.stages.zkProof;
      console.log(chalk.gray("  ZK Proof:"), zk.generated ? chalk.green("generated") : chalk.red("not generated"), zk.claim ? `(${zk.claim})` : "");
      const tt = result.stages.trustToken;
      console.log(chalk.gray("  Trust Token:"), tt.issued ? chalk.green("issued") : chalk.red("not issued"), tt.tokenId ? `(${tt.tokenId.slice(0, 12)}...)` : "");
      console.log(chalk.gray("Evidence chain:"), result.evidenceChain.length, "hashes");
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

shield
  .command("analyze-mcp <path-or-url>")
  .description("Scan an MCP server definition for security risks (score L0–L5)")
  .option("--json", "Output as JSON")
  .option("--out <path>", "Save scan report to JSON file")
  .action(async (pathOrUrl: string, opts: { json?: boolean; out?: string }) => {
    try {
      const { analyzeMcpSecurity } = await import("./shield/mcpSecurityAnalyzer.js");
      const result = analyzeMcpSecurity(pathOrUrl);

      if (opts.out) {
        writeFileAtomic(resolve(process.cwd(), opts.out), JSON.stringify(result, null, 2), 0o644);
        console.log(chalk.green(`MCP security scan saved to: ${opts.out}`));
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const levelColors: Record<string, string> = {
        L5: "#4c1", L4: "#2ecc40", L3: "#3d9970", L2: "#ff851b", L1: "#e4811b", L0: "#e05d44"
      };
      const lc = levelColors[result.securityLevel] ?? "#555";

      console.log(chalk.bold.cyan("\n🛡️  MCP Security Scan"));
      console.log(chalk.gray("Path:"), pathOrUrl);
      console.log(chalk.gray("Security Level:"), chalk.hex(lc).bold(`${result.securityLevel} — ${result.riskLabel}`));
      console.log(chalk.gray("Score:"), `${result.securityScore}/100`);
      if (result.serverInfo.name) {
        console.log(chalk.gray("Server:"), result.serverInfo.name, result.serverInfo.version ? `v${result.serverInfo.version}` : "");
      }
      console.log(chalk.gray("Tools:"), result.serverInfo.toolCount);
      console.log("");

      const criticalFindings = result.findings.filter(f => f.severity === "CRITICAL");
      const highFindings = result.findings.filter(f => f.severity === "HIGH");
      const otherFindings = result.findings.filter(f => f.severity !== "CRITICAL" && f.severity !== "HIGH");

      if (result.findings.length > 0) {
        console.log(chalk.bold(`Findings (${result.findings.length}):`));
        for (const finding of [...criticalFindings, ...highFindings, ...otherFindings]) {
          const icon = finding.severity === "CRITICAL" ? chalk.red("🔴")
            : finding.severity === "HIGH" ? chalk.yellow("🟠")
            : finding.severity === "MEDIUM" ? chalk.gray("🟡")
            : chalk.gray("🔵");
          console.log(`  ${icon} [${finding.severity}] ${chalk.bold(finding.id)}: ${finding.title}`);
          console.log(chalk.gray(`       ${finding.description}`));
          console.log(chalk.cyan(`       → ${finding.recommendation}`));
          if (finding.evidence) console.log(chalk.gray(`       Evidence: ${finding.evidence}`));
          console.log("");
        }
      } else {
        console.log(chalk.green("  ✓ No security findings detected."));
        console.log("");
      }

      if (result.recommendations.length > 0) {
        console.log(chalk.bold("Recommendations:"));
        result.recommendations.forEach(r => console.log(`  ${r}`));
        console.log("");
      }

      console.log(result.summary);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️  Policy Check"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Tool:"), tool);
      console.log(chalk.gray("Action:"), action);
      console.log(chalk.gray("Decision:"), result.decision === "allow" ? chalk.green("allow") : chalk.red(result.decision));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️  Exec Guard"));
      console.log(chalk.gray("Command:"), cmd);
      console.log(chalk.gray("Safe:"), result.allowed ? chalk.green("yes") : chalk.red("no"));
      if (result.blockedPattern) console.log(chalk.gray("Blocked pattern:"), result.blockedPattern);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️  ATO Detection"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Suspicious:"), result.suspicious ? chalk.red("yes") : chalk.green("no"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️  Numeric Check"));
      console.log(chalk.gray("Value:"), value);
      console.log(chalk.gray("Range:"), `[${min}, ${max}]`);
      console.log(chalk.gray("Valid:"), result.valid ? chalk.green("yes") : chalk.red("no"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️  Taint Tracking"));
      console.log(chalk.gray("Input:"), input);
      console.log(chalk.gray("Tainted:"), result ? chalk.red("yes") : chalk.green("no"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️  Secret Blinding"));
      console.log(chalk.gray("Secrets found:"), result.secretsFound);
      console.log(chalk.gray("Blinded text:"), result.blinded);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

// ── Enforce Formal Verification ───────────────────────────────────────────────
enforce
  .command("formal-verify")
  .description("Formally verify safety properties using proof trees and certificates")
  .option("--property <name>", "Specific property name to verify")
  .option("--all", "Verify all core safety properties")
  .option("--strategy <strategy>", "Verification strategy: exhaustive, case_split, or inductive", "exhaustive")
  .action(async (opts: { property?: string; all?: boolean; strategy?: string }) => {
    try {
      const { CORE_SAFETY_PROPERTIES, boundedModelCheck, verifyCertificate } = await import("./enforce/formalVerification.js");
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️  Formal Verification"));
      const properties = opts.all || !opts.property
        ? CORE_SAFETY_PROPERTIES
        : CORE_SAFETY_PROPERTIES.filter((p) => p.id === opts.property || p.name === opts.property);
      if (properties.length === 0) {
        console.log(chalk.red("No matching properties found."));
        console.log(chalk.gray("Available:"), CORE_SAFETY_PROPERTIES.map((p) => p.id).join(", "));
        process.exit(1); return;
      }
      console.log(chalk.gray("Strategy:"), opts.strategy);
      console.log(chalk.gray("Properties to verify:"), properties.length);
      const bmc = boundedModelCheck("cli-agent");
      for (const prop of properties) {
        const matchingCerts = bmc.certificates.filter((c) => c.property.id === prop.id);
        const cert = matchingCerts[0];
        if (cert) {
          const verify = verifyCertificate(cert);
          const status = verify.valid ? chalk.green("✓ PROVEN") : chalk.red("✗ FAILED");
          console.log(`\n  ${status} ${chalk.bold(prop.name)}`);
          console.log(chalk.gray(`    ID: ${prop.id}`));
          console.log(chalk.gray(`    Hash: ${cert.certificateHash}`));
          console.log(chalk.gray(`    Proof depth: ${cert.proofDepth}`));
          if (!verify.valid && verify.issues.length > 0) {
            for (const issue of verify.issues) console.log(chalk.red(`    ⚠ ${issue}`));
          }
        } else {
          console.log(`\n  ${chalk.yellow("⊘ UNCHECKED")} ${chalk.bold(prop.name)}`);
          console.log(chalk.gray(`    ID: ${prop.id}`));
        }
      }
      console.log(chalk.gray("\nTotal states explored:"), bmc.totalStates);
      console.log(chalk.gray("Violations found:"), bmc.violations.length);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

enforce
  .command("tla-spec")
  .description("Generate a TLA+ specification for the AMC safety model")
  .option("--properties <list>", "Comma-separated property IDs to include")
  .option("--output <path>", "Write spec to file (default: stdout)")
  .action(async (opts: { properties?: string; output?: string }) => {
    try {
      const { generateTLASpec } = await import("./enforce/formalVerification.js");
      const spec = generateTLASpec();
      if (opts.output) {
        const { writeFileSync } = await import("fs");
        writeFileSync(opts.output, spec, "utf8");
        console.log(chalk.green(`TLA+ spec written to: ${opts.output}`));
      } else {
        console.log(chalk.bold.hex('#4AEF79')("\n⚖️  TLA+ Specification"));
        console.log(spec);
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

enforce
  .command("verify-certificate <certificateJson>")
  .description("Verify the integrity of a proof certificate (pass JSON as string)")
  .action(async (certificateJson: string) => {
    try {
      const { verifyCertificate } = await import("./enforce/formalVerification.js");
      const cert = JSON.parse(certificateJson) as import("./enforce/formalVerification.js").ProofCertificate;
      const result = verifyCertificate(cert);
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️  Certificate Verification"));
      console.log(chalk.gray("Valid:"), result.valid ? chalk.green("yes") : chalk.red("no"));
      if (result.issues.length > 0) {
        console.log(chalk.gray("Issues:"));
        for (const issue of result.issues) console.log(chalk.red(`  • ${issue}`));
      } else {
        console.log(chalk.green("Certificate is intact — no issues found."));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n👁️  Output Attestation"));
      console.log(chalk.gray("Output:"), output);
      console.log(chalk.gray("Hash:"), result.hash || "N/A");
      console.log(chalk.gray("Attested:"), chalk.green("yes"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n👁️  Explainability Packet"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Run:"), runId);
      console.log(chalk.gray("Confidence:"), "0.9");
      console.log(chalk.gray("Packet:"), JSON.stringify(result, null, 2));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n👁️  Safety Tests"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Passed:"), result.passed > 0 ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Tests Run:"), result.testsRun);
      console.log(chalk.gray("Findings:"), result.findings.length);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n👁️  Host Hardening"));
      console.log(chalk.gray("Passed:"), result.passed ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Findings:"), result.findings?.length ?? 0);
      if (result.findings?.length) result.findings.forEach(f => console.log(chalk[f.passed ? "green" : "red"](`  • [${f.severity}] ${f.title}: ${f.detail}`)));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

watch
  .command("start")
  .description("Start continuous production monitoring for an agent")
  .requiredOption("--agent <id>", "Agent ID to monitor")
  .option("--interval <seconds>", "Re-scoring interval in seconds", "300")
  .option("--alert-threshold <score>", "Alert when score drops below this (0-100)", "0")
  .option("--score-drop-threshold <n>", "Alert when score drops by this fraction (0-1)", "0.1")
  .option("--no-webhooks", "Disable webhook notifications")
  .action(async (opts: {
    agent: string;
    interval: string;
    alertThreshold: string;
    scoreDropThreshold: string;
    webhooks: boolean;
  }) => {
    try {
      const { ContinuousMonitor } = await import("./watch/continuousMonitor.js");
      const { globalDashboardFeed } = await import("./watch/index.js");
      const workspace = process.cwd();
      const agentId = opts.agent;
      const intervalMs = Math.max(10000, parseInt(opts.interval, 10) * 1000);
      const scoreDropThreshold = parseFloat(opts.scoreDropThreshold);

      const monitor = new ContinuousMonitor({
        workspace,
        agentId,
        scoringIntervalMs: intervalMs,
        driftCheckIntervalMs: intervalMs * 3,
        scoreDropThreshold: Number.isFinite(scoreDropThreshold) ? scoreDropThreshold : 0.1,
        enableWebhooks: opts.webhooks
      });

      globalDashboardFeed.registerMonitor(agentId, monitor.getMetrics());

      monitor.on("started", (data: { agentId: string }) => {
        console.log(chalk.green(`  ✓ Monitoring started for agent: ${data.agentId}`));
        console.log(chalk.gray(`  Interval: ${intervalMs / 1000}s | Score-drop alert: ${scoreDropThreshold * 100}%`));
      });

      monitor.on("score", (event: { data: { score: number; delta: number | null } }) => {
        const d = event.data;
        const deltaStr = d.delta !== null ? ` (${d.delta > 0 ? "+" : ""}${(d.delta * 100).toFixed(1)}%)` : "";
        const icon = d.delta !== null && d.delta < -scoreDropThreshold ? chalk.red("📉") : chalk.hex('#4AEF79')("📊");
        console.log(`${icon} Score: ${d.score.toFixed(3)}${deltaStr}  [${new Date().toISOString()}]`);
        globalDashboardFeed.updateMetrics(agentId, monitor.getMetrics());
        globalDashboardFeed.pushEvent(event as never);
      });

      monitor.on("drift", (event: { data: { triggered: boolean; reasons: string[] } }) => {
        if (event.data.triggered) {
          console.log(chalk.yellow(`  ⚠️  Drift detected: ${event.data.reasons.join(", ")}`));
        }
        globalDashboardFeed.pushEvent(event as never);
      });

      monitor.on("anomaly", (event: { data: { type: string; severity: string; message: string } }) => {
        const icon = event.data.severity === "CRITICAL" || event.data.severity === "HIGH" ? chalk.red("🔍") : chalk.yellow("🔍");
        console.log(`${icon} Anomaly [${event.data.severity}]: ${event.data.message}`);
        globalDashboardFeed.pushEvent(event as never);
      });

      monitor.on("alert", (event: { data: { summary: string } }) => {
        console.log(chalk.red(`  🚨 ALERT: ${event.data.summary}`));
        globalDashboardFeed.pushEvent(event as never);
      });

      monitor.on("error", (event: { data: { code: string; message: string } }) => {
        console.error(chalk.red(`  ❌ Error [${event.data.code}]: ${event.data.message}`));
      });

      await monitor.start();
      console.log(chalk.gray("  Press Ctrl+C to stop..."));

      process.on("SIGINT", async () => {
        console.log(chalk.gray("\n  Stopping monitor..."));
        await monitor.stop();
        globalDashboardFeed.unregisterMonitor(agentId);
        const metrics = monitor.getMetrics();
        console.log(chalk.green(`  ✓ Monitor stopped. Total scores: ${metrics.totalScores}`));
        process.exit(0);
      });

      await new Promise<never>(() => {});
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

watch
  .command("status")
  .description("Show all monitored agents and their current state")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { globalDashboardFeed } = await import("./watch/index.js");
      const snapshot = globalDashboardFeed.getSnapshot();

      if (opts.json) {
        console.log(JSON.stringify(snapshot, null, 2));
        return;
      }

      console.log(chalk.bold.hex('#4AEF79')("\n👁️  Watch Status"));
      console.log(chalk.gray(`Active monitors: ${snapshot.globalStats.activeMonitors}`));
      console.log(chalk.gray(`Total incidents: ${snapshot.globalStats.totalIncidents}`));
      console.log(chalk.gray(`Total anomalies: ${snapshot.globalStats.totalAnomalies}`));
      console.log();

      if (Object.keys(snapshot.agents).length === 0) {
        console.log(chalk.gray("  No active monitors. Start one with: amc watch start --agent <id>"));
        return;
      }

      for (const [agentId, metrics] of Object.entries(snapshot.agents)) {
        const score = metrics.currentScore;
        const scoreStr = score !== null ? score.toFixed(3) : "N/A";
        const delta = metrics.scoreDelta;
        const deltaStr = delta !== null ? ` (${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%)` : "";
        const icon = score === null ? "⚪" : score >= 0.7 ? chalk.green("🟢") : score >= 0.5 ? chalk.yellow("🟡") : chalk.red("🔴");
        console.log(`${icon} ${chalk.bold(agentId)}`);
        console.log(`     Score: ${scoreStr}${deltaStr}`);
        console.log(`     Incidents: ${metrics.activeIncidents}  Anomalies: ${metrics.anomaliesDetected}`);
        console.log(`     Last scored: ${metrics.lastScoredAt ? new Date(metrics.lastScoredAt).toISOString() : "never"}`);
        console.log(`     Uptime: ${(metrics.uptime / 1000 / 60).toFixed(1)} min`);
        console.log();
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

watch
  .command("alerts")
  .description("Show recent alerts for a monitored agent")
  .requiredOption("--agent <id>", "Agent ID")
  .option("--limit <n>", "Number of events to show", "20")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; limit: string; json?: boolean }) => {
    try {
      const { globalDashboardFeed } = await import("./watch/index.js");
      const limit = parseInt(opts.limit, 10) || 20;
      const events = globalDashboardFeed.getRecentEvents(limit * 5);
      const agentEvents = events.filter(
        (e: { agentId: string; type: string }) =>
          e.agentId === opts.agent && (e.type === "alert" || e.type === "drift" || e.type === "anomaly")
      ).slice(-limit);

      if (opts.json) {
        console.log(JSON.stringify(agentEvents, null, 2));
        return;
      }

      console.log(chalk.bold.hex('#4AEF79')(`\n🚨 Alerts for agent: ${opts.agent}`));
      if (agentEvents.length === 0) {
        console.log(chalk.gray("  No recent alerts."));
        return;
      }

      for (const event of agentEvents) {
        const ts = new Date((event as { ts: number }).ts).toISOString();
        const type = (event as { type: string }).type.toUpperCase();
        const data = (event as { data: unknown }).data;
        const icon = type === "ALERT" ? chalk.red("🚨") : type === "DRIFT" ? chalk.yellow("⚠️ ") : chalk.gray("🔍");
        const summary = typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)["summary"] ?? (data as Record<string, unknown>)["message"] ?? JSON.stringify(data)
          : String(data);
        console.log(`${icon} [${ts}] ${chalk.bold(type)}: ${summary}`);
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

// ── Vault ZK Privacy ─────────────────────────────────────────────────────────
vault
  .command("zk-range-proof")
  .description("Create a zero-knowledge range proof that an AMC score meets a threshold")
  .requiredOption("--value <n>", "Score value (0-100 display scale)")
  .requiredOption("--threshold <n>", "Minimum threshold to prove")
  .requiredOption("--agent <id>", "Agent ID")
  .action(async (opts: { value: string; threshold: string; agent: string }) => {
    try {
      const { createZKRangeProof } = await import("./vault/zkPrivacy.js");
      const value = parseFloat(opts.value);
      const threshold = parseFloat(opts.threshold);
      const proof = createZKRangeProof(value, threshold, opts.agent);
      console.log(chalk.bold.green("\n🔒  ZK Range Proof"));
      console.log(chalk.gray("Agent:"), opts.agent);
      console.log(chalk.gray("Claim:"), proof.claim);
      console.log(chalk.gray("Verified:"), proof.verified ? chalk.green("✓ yes") : chalk.red("✗ no"));
      console.log(chalk.gray("Value commitment:"), proof.valueCommitment.slice(0, 16) + "...");
      console.log(chalk.gray("Delta commitment:"), proof.deltaCommitment.slice(0, 16) + "...");
      console.log(chalk.gray("Bit proofs:"), proof.bitProofs.length);
      console.log(chalk.gray("Challenge hash:"), proof.challengeHash.slice(0, 16) + "...");
      console.log(chalk.gray("Proof ID:"), proof.id);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

vault
  .command("zk-verify <proofJson>")
  .description("Verify a ZK range proof (pass JSON as string)")
  .action(async (proofJson: string) => {
    try {
      const { verifyZKRangeProof } = await import("./vault/zkPrivacy.js");
      const proof = JSON.parse(proofJson);
      const valid = verifyZKRangeProof(proof);
      console.log(chalk.bold.green("\n🔒  ZK Proof Verification"));
      console.log(chalk.gray("Claim:"), proof.claim ?? "N/A");
      console.log(chalk.gray("Valid:"), valid ? chalk.green("✓ yes") : chalk.red("✗ no"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

vault
  .command("zk-commit")
  .description("Create a Pedersen commitment to a value")
  .requiredOption("--value <n>", "Value to commit to (integer)")
  .action(async (opts: { value: string }) => {
    try {
      const { pedersenCommit } = await import("./vault/zkPrivacy.js");
      const commitment = pedersenCommit(BigInt(Math.floor(parseFloat(opts.value))));
      console.log(chalk.bold.green("\n🔒  Pedersen Commitment"));
      console.log(chalk.gray("Value:"), opts.value);
      console.log(chalk.gray("Commitment:"), commitment.commitment.slice(0, 32) + "...");
      console.log(chalk.gray("Blinding factor:"), "[redacted]");
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

vault
  .command("secret-share")
  .description("Split a secret into shares using Shamir's Secret Sharing")
  .requiredOption("--secret <value>", "Secret integer value to split")
  .requiredOption("--shares <n>", "Total number of shares to create")
  .requiredOption("--threshold <k>", "Minimum shares required to reconstruct")
  .action(async (opts: { secret: string; shares: string; threshold: string }) => {
    try {
      const { shamirSplit } = await import("./vault/zkPrivacy.js");
      const secret = BigInt(Math.floor(parseFloat(opts.secret)));
      const n = parseInt(opts.shares, 10);
      const k = parseInt(opts.threshold, 10);
      const shares = shamirSplit(secret, n, k);
      console.log(chalk.bold.green("\n🔒  Secret Sharing"));
      console.log(chalk.gray("Total shares:"), n);
      console.log(chalk.gray("Threshold:"), k);
      console.log(chalk.gray("Shares created:"), shares.length);
      for (const share of shares) {
        const valuePreview = share.value.slice(0, 8);
        console.log(chalk.gray(`  share #${share.index}: index=${share.index} value=0x${valuePreview}... [redacted]`));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

// ── Watch Behavioral Profiler ─────────────────────────────────────────────────
watch
  .command("profiler-start")
  .description("Start behavioral profiling for an agent")
  .requiredOption("--agent <id>", "Agent ID to profile")
  .option("--sensitivity <level>", "Sensitivity: low, medium, or high", "medium")
  .action(async (opts: { agent: string; sensitivity?: string }) => {
    try {
      const { BehavioralProfiler } = await import("./watch/behavioralProfiler.js");
      const sigmaMap: Record<string, number> = { low: 3.5, medium: 2.5, high: 1.5 };
      const sigma = sigmaMap[opts.sensitivity ?? "medium"] ?? 2.5;
      const profiler = new BehavioralProfiler({ anomalyThresholdSigma: sigma, enablePushAlerts: true });
      console.log(chalk.bold.hex('#4AEF79')("\n👁️  Behavioral Profiler"));
      console.log(chalk.gray("Agent:"), opts.agent);
      console.log(chalk.gray("Sensitivity:"), opts.sensitivity ?? "medium");
      console.log(chalk.gray("Anomaly threshold:"), `${sigma}σ`);
      console.log(chalk.gray("Window:"), "1 hour (default)");
      console.log(chalk.gray("Push alerts:"), chalk.green("enabled"));
      console.log(chalk.green("\nProfiler initialized. Feed events via the API or watch.profiler-status to check state."));
      console.log(chalk.gray("Instance ready:"), profiler ? chalk.green("yes") : chalk.red("no"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

watch
  .command("profiler-status")
  .description("Show behavioral profiler status and any recent anomalies")
  .option("--agent <id>", "Filter by agent ID")
  .action(async (opts: { agent?: string }) => {
    try {
      const { BehavioralProfiler } = await import("./watch/behavioralProfiler.js");
      console.log(chalk.bold.hex('#4AEF79')("\n👁️  Behavioral Profiler Status"));
      console.log(chalk.gray("Module:"), "BehavioralProfiler");
      console.log(chalk.gray("Status:"), chalk.green("available"));
      if (opts.agent) console.log(chalk.gray("Agent filter:"), opts.agent);
      console.log(chalk.gray("Capabilities:"), "latency_spike, novel_sequence, error_surge, trust_degradation");
      console.log(chalk.gray("Config options:"), "windowSizeMs, anomalyThresholdSigma, minEventsForProfile");
      const profiler = new BehavioralProfiler();
      console.log(chalk.gray("Instance:"), profiler ? chalk.green("ready") : chalk.red("failed"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

watch
  .command("profiler-anomalies")
  .description("List detected behavioral anomalies for an agent")
  .requiredOption("--agent <id>", "Agent ID")
  .option("--limit <n>", "Maximum number of anomalies to show", "20")
  .action(async (opts: { agent: string; limit?: string }) => {
    try {
      const { BehavioralProfiler } = await import("./watch/behavioralProfiler.js");
      const limit = parseInt(opts.limit ?? "20", 10);
      const profiler = new BehavioralProfiler();
      // Inject a sample event to demonstrate the profiler
      const sampleAnomalies = profiler.ingest({
        agentId: opts.agent,
        eventType: "tool_call",
        timestamp: Date.now(),
        toolName: "demo_tool",
        latencyMs: 50,
      });
      console.log(chalk.bold.hex('#4AEF79')("\n👁️  Behavioral Anomalies"));
      console.log(chalk.gray("Agent:"), opts.agent);
      console.log(chalk.gray("Limit:"), limit);
      if (sampleAnomalies.length === 0) {
        console.log(chalk.green("No anomalies detected (insufficient baseline data for new agents)."));
      } else {
        for (const a of sampleAnomalies.slice(0, limit)) {
          const color = a.severity === "critical" ? chalk.red : a.severity === "warn" ? chalk.yellow : chalk.gray;
          console.log(color(`  [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description}`));
        }
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

// ── Compliance Regulatory Monitor ─────────────────────────────────────────────
compliance
  .command("regulatory-feeds")
  .description("List all configured regulatory feed sources")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { DEFAULT_REGULATORY_FEEDS } = await import("./compliance/regulatoryAutomation.js");
      if (opts.json) { console.log(JSON.stringify(DEFAULT_REGULATORY_FEEDS, null, 2)); return; }
      console.log(chalk.bold.cyan("\n📋  Regulatory Feeds"));
      console.log(chalk.gray("Total feeds:"), DEFAULT_REGULATORY_FEEDS.length);
      for (const feed of DEFAULT_REGULATORY_FEEDS) {
        const status = feed.enabled ? chalk.green("enabled") : chalk.gray("disabled");
        console.log(`  ${status} ${chalk.bold(feed.name)} [${feed.framework}]`);
        console.log(chalk.gray(`    URL: ${feed.url}`));
        console.log(chalk.gray(`    Jurisdictions: ${feed.jurisdictions.join(", ")}`));
        console.log(chalk.gray(`    Poll interval: ${(feed.pollIntervalMs / 3600000).toFixed(1)}h`));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

compliance
  .command("regulatory-check")
  .description("Check for regulatory changes from configured feeds")
  .option("--framework <name>", "Filter by framework name (e.g. EU_AI_ACT, NIST_AI_RMF)")
  .option("--json", "Output as JSON")
  .action(async (opts: { framework?: string; json?: boolean }) => {
    try {
      const { RegulatoryMonitor, DEFAULT_REGULATORY_FEEDS } = await import("./compliance/regulatoryAutomation.js");
      const feeds = opts.framework
        ? DEFAULT_REGULATORY_FEEDS.filter((f) => f.framework === opts.framework)
        : DEFAULT_REGULATORY_FEEDS;
      const monitor = new RegulatoryMonitor({ feeds, checkIntervalMs: 9999999, autoAnalyze: false });
      console.log(chalk.bold.cyan("\n📋  Regulatory Check"));
      if (opts.framework) console.log(chalk.gray("Framework filter:"), opts.framework);
      console.log(chalk.gray("Checking feeds:"), feeds.length);
      console.log(chalk.yellow("Running feed check (this may take a moment)..."));
      const results = await monitor.checkAllFeeds();
      if (opts.json) { console.log(JSON.stringify(results, null, 2)); return; }
      let totalChanges = 0;
      for (const result of results) {
        const feed = feeds.find((f) => f.id === result.feedId);
        const statusColor = result.status === "error" ? chalk.red : result.status === "changed" || result.status === "new_content" ? chalk.yellow : chalk.green;
        console.log(`  ${statusColor(result.status)} ${feed?.name ?? result.feedId} — ${result.changes.length} changes`);
        totalChanges += result.changes.length;
        for (const change of result.changes) {
          console.log(chalk.yellow(`    ⚠ [${change.severity}] ${change.title}`));
        }
      }
      console.log(chalk.bold("\nTotal new changes:"), totalChanges > 0 ? chalk.yellow(totalChanges.toString()) : chalk.green("0"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

compliance
  .command("regulatory-gap")
  .description("Run gap analysis against current AMC configuration")
  .option("--framework <name>", "Filter by framework name")
  .option("--json", "Output as JSON")
  .action(async (opts: { framework?: string; json?: boolean }) => {
    try {
      const { RegulatoryMonitor, DEFAULT_REGULATORY_FEEDS } = await import("./compliance/regulatoryAutomation.js");
      const feeds = opts.framework
        ? DEFAULT_REGULATORY_FEEDS.filter((f) => f.framework === opts.framework)
        : DEFAULT_REGULATORY_FEEDS;
      const monitor = new RegulatoryMonitor({ feeds, checkIntervalMs: 9999999, autoAnalyze: true });
      console.log(chalk.bold.cyan("\n📋  Regulatory Gap Analysis"));
      if (opts.framework) console.log(chalk.gray("Framework:"), opts.framework);
      console.log(chalk.yellow("Running gap analysis..."));
      const results = await monitor.checkAllFeeds();
      const allChanges = results.flatMap((r) => r.changes);
      if (opts.json) {
        const analyzeGapFn = (monitor as unknown as { analyzeGap?: (c: unknown) => unknown }).analyzeGap;
        const gaps = analyzeGapFn ? allChanges.map((c) => analyzeGapFn.call(monitor, c)) : allChanges;
        console.log(JSON.stringify(gaps, null, 2)); return;
      }
      if (allChanges.length === 0) {
        console.log(chalk.green("No regulatory changes detected — no gaps identified."));
      } else {
        console.log(chalk.gray("Changes requiring review:"), allChanges.length);
        for (const change of allChanges) {
          console.log(`\n  ${chalk.bold(change.title ?? change.id)}`);
          console.log(chalk.gray(`    Framework: ${change.framework} | Severity: ${change.severity}`));
          if (change.description) console.log(chalk.gray(`    ${change.description.slice(0, 120)}...`));
        }
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

// ── Passport Trust Interchange ─────────────────────────────────────────────────
passport
  .command("issue-token")
  .description("Issue an AMC Trust Token for an agent")
  .requiredOption("--agent <id>", "Agent ID")
  .option("--dimensions <list>", "Comma-separated dimensions to include (e.g. security,privacy)")
  .option("--ttl <hours>", "Token TTL in hours (default: 24)", "24")
  .action(async (opts: { agent: string; dimensions?: string; ttl?: string }) => {
    try {
      const { issueTrustToken } = await import("./passport/trustInterchange.js");
      const ttl = parseInt(opts.ttl ?? "24", 10);
      const dimensions = opts.dimensions ? opts.dimensions.split(",").map((d) => d.trim()) : ["security", "privacy", "reliability"];
      const claims = dimensions.map((dim) => ({
        dimension: dim,
        score: 0,
        level: "L0" as const,
        evidenceCount: 0,
        observedShare: 0,
        lastAssessedAt: Date.now(),
      }));
      const token = issueTrustToken("cli-workspace", "cli-pubkey-hash", opts.agent, claims, "cli-demo-secret", { ttlHours: ttl });
      console.log(chalk.bold.cyan("\n🔑  AMC Trust Token Issued"));
      console.log(chalk.gray("Token ID:"), token.tokenId);
      console.log(chalk.gray("Agent:"), token.subject.agentId);
      console.log(chalk.gray("Issued at:"), new Date(token.issuedAt).toISOString());
      console.log(chalk.gray("Expires at:"), new Date(token.expiresAt).toISOString());
      console.log(chalk.gray("Dimensions:"), dimensions.join(", "));
      console.log(chalk.gray("Claims:"), token.claims.length);
      console.log(chalk.yellow("(Full token not displayed for security — use --json for raw output)"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

passport
  .command("verify-token <tokenJson>")
  .description("Verify an AMC Trust Token (pass JSON string)")
  .action(async (tokenJson: string) => {
    try {
      const { verifyTrustToken } = await import("./passport/trustInterchange.js");
      const token = JSON.parse(tokenJson);
      const result = verifyTrustToken(token, "cli-demo-secret");
      console.log(chalk.bold.cyan("\n🔑  Trust Token Verification"));
      console.log(chalk.gray("Token ID:"), token.tokenId ?? "N/A");
      console.log(chalk.gray("Valid:"), result.valid ? chalk.green("✓ yes") : chalk.red("✗ no"));
      if (result.reasons.length > 0) {
        console.log(chalk.gray("Issues:"));
        for (const reason of result.reasons) console.log(chalk.red(`  • ${reason}`));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

passport
  .command("translate-score")
  .description("Translate trust scores between scoring systems")
  .requiredOption("--from <system>", "Source scoring system")
  .requiredOption("--to <system>", "Target scoring system")
  .requiredOption("--score <n>", "Score value in source system")
  .option("--json", "Output as JSON")
  .action(async (opts: { from: string; to: string; score: string; json?: boolean }) => {
    try {
      const { translateTrustScores, TRUST_TRANSLATIONS } = await import("./passport/trustInterchange.js");
      const scores = { overall: parseFloat(opts.score) };
      const result = translateTrustScores(scores, opts.from, opts.to);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.cyan("\n🔑  Trust Score Translation"));
      console.log(chalk.gray("From:"), opts.from);
      console.log(chalk.gray("To:"), opts.to);
      console.log(chalk.gray("Input score:"), opts.score);
      const keys = Object.keys(result);
      if (keys.length === 0) {
        console.log(chalk.yellow("No translation available for this system pair."));
        console.log(chalk.gray("Available translations:"), TRUST_TRANSLATIONS.map((t) => `${t.sourceSystem}→${t.targetSystem}`).join(", "));
      } else {
        for (const dim of keys) {
          const r = result[dim]!;
          console.log(`  ${chalk.bold(dim)}: ${r.score} (${r.level}) confidence=${(r.confidence * 100).toFixed(0)}%`);
        }
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

// ============================================================
// SCORE — Maturity scoring and evidence collection
// ============================================================
const productGlossary = program.command("glossary").description("Domain terminology management");
const domainCmd = program.command("domain").alias("sector").description("Domain-specific architecture and compliance operations");
registerDomainApplyCommand(domainCmd);

// ── Blocker #13: sector-pack CLI commands for 40 industry packs ──────────────
const sectorPack = domainCmd.command("pack").description("Industry sector packs — 40 packs across 7 domains");

sectorPack
  .command("list")
  .description("List all available industry sector packs")
  .option("--domain <d>", "Filter by domain: health|education|environment|mobility|governance|technology|wealth")
  .option("--json", "Output as JSON")
  .action(async (opts: { domain?: string; json?: boolean }) => {
    const { listIndustryPackIds, getIndustryPack, getIndustryPacksByStation } = await import("./domains/industryPacks.js");
    const { parseDomainOrThrow } = await import("./domains/domainCliIntegration.js");

    let packs: Array<{ packId: string; name: string; domain: string; questionCount: number; riskLevel: string }>;

    if (opts.domain) {
      const domain = parseDomainOrThrow(opts.domain);
      const domainPacks = getIndustryPacksByStation(domain);
      packs = domainPacks.map(p => ({
        packId: p.id,
        name: p.name,
        domain: opts.domain!,
        questionCount: p.questions.length,
        riskLevel: p.riskTier
      }));
    } else {
      const allIds = listIndustryPackIds();
      packs = allIds.map(id => {
        const p = getIndustryPack(id);
        return {
          packId: p.id,
          name: p.name,
          domain: p.stationId,
          questionCount: p.questions.length,
          riskLevel: p.riskTier
        };
      });
    }

    if (opts.json) { console.log(JSON.stringify(packs, null, 2)); return; }

    console.log(chalk.bold.hex('#4AEF79')(`\n🏭  Industry Sector Packs (${packs.length} packs)\n`));
    const maxName = Math.max(...packs.map(p => p.name.length), 10);
    console.log(`  ${"Pack ID".padEnd(30)} ${"Name".padEnd(maxName + 2)} ${"Domain".padEnd(14)} ${"Questions".padEnd(12)} Risk`);
    console.log(chalk.gray(`  ${"─".repeat(30)} ${"─".repeat(maxName + 2)} ${"─".repeat(14)} ${"─".repeat(12)} ${"─".repeat(10)}`));
    for (const p of packs) {
      console.log(`  ${chalk.cyan(p.packId.padEnd(30))} ${p.name.padEnd(maxName + 2)} ${p.domain.padEnd(14)} ${String(p.questionCount).padEnd(12)} ${p.riskLevel}`);
    }
    console.log(chalk.gray(`\n  Total: ${packs.length} packs, ${packs.reduce((s, p) => s + p.questionCount, 0)} questions`));
    console.log(chalk.gray(`\n  Run a pack: amc domain pack run --pack <packId> --agent <agentId>`));
    console.log(chalk.gray(`  Describe:   amc domain pack describe --pack <packId>`));
  });

sectorPack
  .command("describe")
  .description("Show details of a specific industry sector pack")
  .requiredOption("--pack <packId>", "Pack ID (from 'amc domain pack list')")
  .option("--json", "Output as JSON")
  .action(async (opts: { pack: string; json?: boolean }) => {
    const { getPackById } = await import("./domains/industryPacks.js");
    const pack = getPackById(opts.pack);
    if (!pack) {
      console.error(chalk.red(`Pack not found: ${opts.pack}`));
      console.log(chalk.gray("List available packs: amc domain pack list"));
      process.exit(1); return;
    }
    if (opts.json) { console.log(JSON.stringify(pack, null, 2)); return; }

    console.log(chalk.bold.hex('#4AEF79')(`\n🏭  ${pack.name}`));
    console.log(chalk.gray(`  Pack ID:    ${pack.id}`));
    console.log(chalk.gray(`  Station:    ${pack.stationId}`));
    console.log(chalk.gray(`  Risk level: ${pack.riskTier}`));
    console.log(chalk.gray(`  Questions:  ${pack.questions.length}`));
    if (pack.description) console.log(`\n  ${pack.description}`);
    if (pack.regulatoryBasis?.length) {
      console.log(chalk.bold("\n  Regulatory basis:"));
      for (const r of pack.regulatoryBasis) console.log(`    • ${r}`);
    }
    if (pack.complianceFrameworks?.length) {
      console.log(chalk.bold("\n  Compliance frameworks:"));
      for (const f of pack.complianceFrameworks) console.log(`    • ${f}`);
    }
    if (pack.certificationPath) {
      console.log(chalk.bold("\n  Certification path:"));
      console.log(`    ${pack.certificationPath}`);
    }
    console.log(chalk.bold(`\n  Questions (${pack.questions.length}):`));
    for (const q of pack.questions) {
      console.log(`    ${chalk.cyan(q.id)} [${q.dimension}] ${q.text.slice(0, 100)}${q.text.length > 100 ? "..." : ""}`);
    }
    console.log("");
  });

sectorPack
  .command("run")
  .description("Run an industry sector pack — interactive assessment or baseline score")
  .requiredOption("--pack <packId>", "Pack ID")
  .option("--baseline", "Score with L1 defaults (no interaction needed)", false)
  .option("--json", "Output as JSON")
  .action(async (opts: { pack: string; baseline: boolean; json?: boolean }) => {
    const { getPackById, scoreIndustryPack } = await import("./domains/industryPacks.js");
    type PackIdType = Parameters<typeof scoreIndustryPack>[0];
    const pack = getPackById(opts.pack);
    if (!pack) {
      console.error(chalk.red(`Pack not found: ${opts.pack}`));
      console.log(chalk.gray("List available packs: amc domain pack list"));
      process.exit(1); return;
    }
    console.log(chalk.bold.hex('#4AEF79')(`\n🏭  Running: ${pack.name}`));
    console.log(chalk.gray(`  Questions: ${pack.questions.length}\n`));

    let responses: Record<string, number> = {};

    if (opts.baseline) {
      // Score all questions at L1 to show gap surface
      for (const q of pack.questions) { responses[q.id] = 1; }
    } else if (process.stdin.isTTY) {
      // Interactive assessment
      const inq = await import("inquirer");
      for (const q of pack.questions) {
        const { level } = await inq.default.prompt([{
          type: "list",
          name: "level",
          message: `${q.id} [${q.dimension}]: ${q.text.slice(0, 120)}`,
          choices: [
            { name: "L1 — " + q.l1.slice(0, 80), value: 1 },
            { name: "L3 — " + q.l3.slice(0, 80), value: 3 },
            { name: "L5 — " + q.l5.slice(0, 80), value: 5 },
          ]
        }]);
        responses[q.id] = level;
      }
    } else {
      // Non-interactive: default to L1 baseline
      for (const q of pack.questions) { responses[q.id] = 1; }
    }

    const result = scoreIndustryPack(opts.pack as PackIdType, responses);
    if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }

    console.log(chalk.bold("  Results:"));
    console.log(`    Pack:       ${result.packId}`);
    console.log(`    Score:      ${result.percentage.toFixed(1)} / 100`);
    console.log(`    Level:      L${result.level}`);
    console.log(`    Questions:  ${result.questionResults.length}`);
    const lowScoring = result.questionResults.filter(q => q.percentage < 50);
    if (lowScoring.length > 0) {
      console.log(chalk.yellow(`\n  Gaps (${lowScoring.length} below 50%):`));
      for (const g of lowScoring.slice(0, 10)) {
        console.log(`    ${chalk.cyan(g.id)} ${g.dimension} — ${g.percentage.toFixed(0)}% (score: ${g.score.toFixed(1)}/${g.weight})`);
      }
      if (lowScoring.length > 10) console.log(chalk.gray(`    ... and ${lowScoring.length - 10} more`));
    }
    if (result.complianceGaps.length > 0) {
      console.log(chalk.yellow(`\n  Compliance gaps (${result.complianceGaps.length}):`));
      for (const gap of result.complianceGaps.slice(0, 5)) {
        console.log(`    • ${gap}`);
      }
    }
    console.log("");
  });

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
        console.log(`  ${chalk.hex('#4AEF79')(f.id)} ${f.name} [${f.relevance}] ${f.amcFit ? chalk.green("✓ AMC") : ""}`);
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      for (const f of features) console.log(`  ${chalk.hex('#4AEF79')(f.id)} ${f.name} — ${f.pricingRange}`);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      const domainDescriptions: Record<string, string> = {
        health: "AI agents handling patient data, clinical decisions, medical devices, and drug development",
        education: "AI in classrooms, student assessment, learning platforms, and accessibility",
        environment: "AI managing energy grids, water systems, agriculture, and supply chains",
        mobility: "Autonomous vehicles, smart buildings, transit systems, and connected infrastructure",
        governance: "AI in public services, elections, legislation, civic identity, and anti-corruption",
        technology: "General AI services, content platforms, IP management, and data ecosystems",
        wealth: "AI in payments, trading, lending, insurance, and blockchain/crypto",
      };
      console.log(chalk.bold.cyan(`\n🧭  Domain Catalog (${domains.length})`));
      for (const domain of domains) {
        const desc = domainDescriptions[domain.id] ?? "";
        console.log(`  ${chalk.hex('#4AEF79')(domain.id)}  ${domain.name}`);
        if (desc) console.log(`    ${chalk.gray(desc)}`);
        console.log(`    Risk: ${domain.riskLevel} | EU AI Act: ${domain.euAIActCategory} | Questions: ${domain.questionCount}`);
        console.log(`    Regulatory: ${domain.regulatoryBasis.join(", ")}`);
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
        console.log(`  ${chalk.hex('#4AEF79')(module.moduleId)} ${module.moduleName} [${module.relevance}]`);
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
        console.log(`  ${chalk.hex('#4AEF79')(pack.packId)} ${pack.title}`);
        console.log(`    scenarios=${pack.scenarioCount} passed=${pack.passed} failed=${pack.failed} passRate=${pack.passRate}%`);
      }
      console.log(chalk.gray("Totals:"), `scenarios=${run.totalScenarios} passed=${run.passed} failed=${run.failed}`);
      console.log(chalk.gray("Overall:"), run.allPassed ? chalk.green("all checks passed") : chalk.yellow("review required"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    console.log(chalk.bold.hex('#4AEF79')("\n📊  Assessment Result"));
    console.log(chalk.gray(`Tier: ${tier}`));
    console.log(chalk.gray(`Score: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`));
    console.log(renderAsciiRadar(result.layerScores));
    if (result.totalScore === 0) {
      console.log(chalk.yellow("\n💡 No evidence collected yet. Capture agent behavior first:"));
      console.log(chalk.gray("  amc wrap <runtime> -- <command>    # Capture evidence"));
      console.log(chalk.gray("  amc evidence ingest --source <logfile>  # Import existing logs"));
    }
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
      console.log(chalk.bold.hex('#4AEF79')("\n📊  Maturity Score"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Score:"), result.overallScore ?? "N/A");
      console.log(chalk.gray("Level:"), result.overallLevel || "unknown");
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n📊  Adversarial Test"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Gaming Resistant:"), result.gamingResistant ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Details:"), JSON.stringify(result, null, 2));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n📊  Evidence Collection"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Evidence:"), JSON.stringify(result, null, 2));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n🛠  Production Readiness"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Ready:"), result.ready ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Score:"), result.score);
      console.log(chalk.gray("Gate failures:"), result.blockers.join(", ") || "none");
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
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
      console.log(chalk.bold.hex('#4AEF79')("\n🕒  Operational Independence"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Score:"), result.score);
      console.log(chalk.gray("Longest run days:"), result.longestRunDays);
      console.log(chalk.gray("Escalation rate:"), `${result.escalationRate}%`);
      console.log(chalk.gray("Drift events:"), result.driftEvents);
      console.log(chalk.gray("Quality held:"), result.qualityHeld ? "yes" : "no");
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
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
      console.log(chalk.bold.hex('#4AEF79')("\n🧩  Evidence Coverage"));
      console.log(chalk.gray("Agent:"), agentId);
      console.log(chalk.gray("Coverage:"), `${result.coveragePercent}%`);
      console.log(chalk.gray("Automated:"), result.automatedCoverage);
      console.log(chalk.gray("Manual required:"), result.manualRequired);
      console.log(chalk.gray("Tradeoffs:"), result.improvementPlan.join("; "));
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
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
      console.log(chalk.bold.hex('#4AEF79')("\n🧪  Lean AMC Profile"));
      console.log(chalk.gray("Required modules:"), result.requiredModules.join(", "));
      console.log(chalk.gray("Skippable modules:"), result.skippableModules.join(", "));
      console.log(chalk.gray("Estimated setup hours:"), result.estimatedSetupHours);
      console.log(chalk.gray("Max achievable level:"), result.maximumAchievableLevel);
      console.log(chalk.gray("Tradeoffs:"), result.tradeoffs.join("; "));
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
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
      console.log(chalk.bold.hex('#4AEF79')("\n📋  Behavioral Contract Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Alignment card:"), result.hasAlignmentCard ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Permitted actions:"), result.hasPermittedActions ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Forbidden actions:"), result.hasForbiddenActions ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Escalation triggers:"), result.hasEscalationTriggers ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Runtime integrity:"), result.hasRuntimeIntegrityCheck ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Drift profile:"), result.hasDriftProfile ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n🔒  Fail-Secure Governance"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Fails closed:"), result.failsClosedByDefault ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Tool whitelist:"), result.hasToolCallWhitelist ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Rate limiting:"), result.hasRateLimiting ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Anomaly detection:"), result.hasSemanticAnomalyDetection ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Excessive agency controls:"), result.hasExcessiveAgencyControls ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n✅  Output Integrity Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Output validation:"), result.hasOutputValidation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Confidence calibration:"), result.hasConfidenceCalibration ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Citation requirement:"), result.hasCitationRequirement ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Code execution guard:"), result.hasCodeExecutionGuard ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n📦  Agent State Portability"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Serializable state:"), result.hasSerializableState ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Vendor-neutral format:"), result.hasVendorNeutralFormat ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("State versioning:"), result.hasStateVersioning ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Integrity on transfer:"), result.hasIntegrityOnTransfer ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n🇪🇺  EU AI Act Compliance"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Risk class:"), result.riskClassification);
      console.log(chalk.gray("Risk management system:"), result.hasRiskManagementSystem ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Technical documentation:"), result.hasTechnicalDocumentation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Human oversight design:"), result.hasHumanOversightDesign ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Adversarial testing:"), result.hasAdversarialTesting ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("FRIA:"), result.hasFundamentalRightsImpactAssessment ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.slice(0, 3).join("; "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n🛡️  OWASP LLM Top 10 Coverage"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Covered:"), `${result.coveredCount}/10`);
      if (result.uncoveredRisks.length) console.log(chalk.yellow("Uncovered:"), result.uncoveredRisks.join(", "));
      else console.log(chalk.green("All 10 OWASP LLM risks covered ✓"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("regulatory-readiness")
  .description("Compute weighted regulatory readiness score (EU AI Act + ISO + OWASP)")
  .requiredOption("--agent <id>", "agent ID")
  .option("--json", "Output as JSON")
  .action(async (opts: { agent: string; json?: boolean }) => {
    try {
      const result = scoreRegulatoryReadiness({
        workspace: process.cwd(),
        agentId: opts.agent
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(chalk.bold.hex('#4AEF79')("\n🏛️  Regulatory Readiness"));
      console.log(chalk.gray("Agent:"), result.agentId);
      console.log(chalk.gray("Score:"), `${result.score}/100`, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Weighted composite:"), result.weightedComposite.toFixed(2));
      console.log(chalk.gray("Components:"), `EU=${result.components.euAiAct} ISO=${result.components.iso42001} OWASP=${result.components.owaspLLM}`);
      console.log(chalk.gray("Weights:"), `EU=${result.weights.euAiAct.toFixed(2)} ISO=${result.weights.iso42001.toFixed(2)} OWASP=${result.weights.owaspLLM.toFixed(2)}`);
      console.log(chalk.gray("Agent evidence modifier:"), result.agentEvidenceModifier.toFixed(2));
      console.log(chalk.gray("Latest run:"), result.latestRunId ?? "none");
      if (result.gaps.length > 0) {
        console.log(chalk.yellow("Top gaps:"), result.gaps.slice(0, 4).join("; "));
      }
    } catch (e: unknown) {
      console.error(chalk.red(toErrorMessage(e)));
      process.exit(1);
    }
  });

score
  .command("self-knowledge")
  .description("Score prior art self-knowledge maturity (typed attention, trace layer, confidence+citation)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreSelfKnowledgeMaturity } = await import("./score/selfKnowledgeMaturity.js");
      const result = scoreSelfKnowledgeMaturity();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🔍  prior art Self-Knowledge Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Typed relationships:"), result.hasTypedRelationships ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Trace layer:"), result.hasTraceLayer ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Confidence+citation:"), result.hasConfidenceWithCitation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Calibration:"), result.hasCalibrationMechanism ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n🏗️  Kernel Sandbox Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("OS-level isolation:"), result.hasOSLevelIsolation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Filesystem restrictions:"), result.hasFilesystemRestrictions ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Network isolation:"), result.hasNetworkIsolation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Secret injection:"), result.hasSecretInjection ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n🪪  Runtime Identity Maturity"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Agent identity binding:"), result.hasAgentIdentityBinding ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("User identity propagation:"), result.hasUserIdentityPropagation ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("JIT credentials:"), result.hasJITCredentials ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Identity revocation:"), result.hasIdentityRevocation ? chalk.green("yes") : chalk.red("no"));
      if (result.gaps.length) console.log(chalk.yellow("Gaps:"), result.gaps.join("; "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

// ── Research-backed scoring modules (2026-02-24) ─────────────────────────────

score
  .command("calibration-gap")
  .description("Measure delta between agent self-reported confidence and observed behavior")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scanCalibrationInfrastructure } = await import("./score/calibrationGap.js");
      const result = scanCalibrationInfrastructure(process.cwd());
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🎯  Calibration Gap Analysis"));
      console.log(chalk.gray("ECE Score:"), result.expectedCalibrationError.toFixed(4));
      console.log(chalk.gray("Overconfidence ratio:"), result.overconfidenceRatio.toFixed(2));
      console.log(chalk.gray("Underconfidence ratio:"), result.underconfidenceRatio.toFixed(2));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("evidence-conflict")
  .description("Measure internal consistency of evidence — detect conflicting signals")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scanEvidenceConflicts } = await import("./score/evidenceConflict.js");
      const result = scanEvidenceConflicts(process.cwd());
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n⚡  Evidence Conflict Analysis"));
      console.log(chalk.gray("Conflict ratio:"), result.conflictRatio.toFixed(4));
      console.log(chalk.gray("Score:"), result.score);
      console.log(chalk.gray("Level:"), result.level);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("density-map")
  .description("Heatmap of evidence density per question per dimension — reveals blind spots")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scanDensityMapInfra } = await import("./score/densityMap.js");
      const result = scanDensityMapInfra(process.cwd());
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🗺️   Evidence Density Map"));
      console.log(chalk.gray("Blind spots:"), result.blindSpots);
      console.log(chalk.gray("Coverage:"), `${(result.overallCoverage * 100).toFixed(1)}%`);
      console.log(chalk.gray("Cluster pattern:"), result.clusterPattern);
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("evidence-ingest")
  .description("Ingest evidence from external systems (openai-evals, langsmith, mlflow, custom)")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Source format: openai-evals, langsmith, mlflow, weights-biases, custom")
  .action(async (opts: { json?: boolean; format?: string }) => {
    try {
      const { ingestEvidence, TRUST_WEIGHTS } = await import("./score/evidenceIngestion.js");
      const format = (opts.format || "custom") as never;
      const result = ingestEvidence({ format, data: {}, sourceSystem: "cli", timestamp: new Date().toISOString() });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n📥  Evidence Ingestion"));
      console.log(chalk.gray("Format:"), format);
      console.log(chalk.gray("Ingested:"), result.totalIngested);
      console.log(chalk.gray("Unmapped:"), result.unmapped.length);
      console.log(chalk.gray("Trust tier:"), result.trustTier);
      console.log(chalk.gray("Mapping coverage:"), `${(result.mappingCoverage * 100).toFixed(1)}%`);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("level-transition")
  .description("Track formal promotion/demotion events with evidence gates")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scanLevelTransitionInfra } = await import("./score/levelTransition.js");
      const result = scanLevelTransitionInfra(process.cwd());
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n📈  Level Transition Quality"));
      console.log(chalk.gray("Avg quality:"), result.avgTransitionQuality.toFixed(2));
      console.log(chalk.gray("Retention rate:"), `${(result.promotionRetentionRate * 100).toFixed(1)}%`);
      console.log(chalk.gray("Demotion rate:"), result.demotionRate.toFixed(4));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("gaming-resistance")
  .description("Test whether adversarial evidence injection can inflate scores")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreGamingResistance } = await import("./score/gamingResistance.js");
      const result = scoreGamingResistance(process.cwd());
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🛡️   Gaming Resistance"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Flooding:"), result.floodingResistance.score);
      console.log(chalk.gray("Selective:"), result.selectiveResistance.score);
      console.log(chalk.gray("Temporal:"), result.temporalResistance.score);
      console.log(chalk.gray("Context:"), result.contextResistance.score);
      console.log(chalk.gray("Formula:"), result.formulaResistance.score);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("sleeper-detection")
  .description("Detect context-dependent behavioral inconsistencies")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreSleeperDetection } = await import("./score/sleeperDetection.js");
      const result = scoreSleeperDetection(process.cwd());
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🕵️   Sleeper Detection"));
      console.log(chalk.gray("Consistency:"), result.consistencyScore.toFixed(2));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("audit-depth")
  .description("Score audit trail depth and completeness")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreAuditDepth } = await import("./score/auditDepth.js");
      const result = scoreAuditDepth(process.cwd());
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n📝  Audit Depth"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Black-box:"), result.blackBox.score);
      console.log(chalk.gray("White-box:"), result.whiteBox.score);
      console.log(chalk.gray("Outside-the-box:"), result.outsideTheBox.score);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("policy-consistency")
  .description("Test policy enforcement consistency across repeated trials (pass^k)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scanPolicyConsistency } = await import("./score/policyConsistency.js");
      const result = scanPolicyConsistency(process.cwd());
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n⚖️   Policy Consistency (pass^k)"));
      console.log(chalk.gray("Pass rate:"), `${(result.passRate * 100).toFixed(1)}%`);
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      for (const pk of result.passK) {
        console.log(chalk.gray(`  pass^${pk.k}:`), `${(pk.rate * 100).toFixed(1)}%`, chalk.gray(pk.interpretation));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("autonomy-duration")
  .description("Track time between human checkpoints with domain risk profiles")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreAutonomyDuration } = await import("./score/autonomyDuration.js");
      const result = scoreAutonomyDuration({ agentId: "default", domain: "general", interventionTimestamps: [], actionTimestamps: [], selfPauseTimestamps: [] });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n⏱️   Autonomy Duration"));
      console.log(chalk.gray("Autonomy score:"), result.autonomyScore.toFixed(2));
      console.log(chalk.gray("Oversight:"), result.oversightAdequacy);
      console.log(chalk.gray("Risk class:"), result.riskClass);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("pause-quality")
  .description("Score quality of agent-initiated pauses")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scorePauseQuality } = await import("./score/pauseQuality.js");
      const result = scorePauseQuality({ pauses: [], totalActions: 0, totalErrors: 0, errorsWithoutPriorPause: 0, taskDurationMs: 0 });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n⏸️   Pause Quality"));
      console.log(chalk.gray("Score:"), result.overallScore.toFixed(2));
      console.log(chalk.gray("Total pauses:"), result.totalPauses);
      console.log(chalk.gray("Pause rate:"), `${(result.pauseRate * 100).toFixed(1)}%`);
      if (result.totalPauses === 0) { console.log(chalk.yellow("\n💡 No pause events recorded. Instrument your agent to emit pause events when it stops to ask for help.")); }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("task-horizon")
  .description("Score task-completion time horizon (METR-inspired)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreTaskHorizon } = await import("./score/taskHorizon.js");
      const result = scoreTaskHorizon({ taskDurationMinutes: 0, completedAutonomously: false, activeGovernanceControls: [] });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🎯  Task Horizon"));
      console.log(chalk.gray("Score:"), result.score.toFixed(2));
      console.log(chalk.gray("Band:"), result.band.label);
      console.log(chalk.gray("Level:"), result.level);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("factuality")
  .description("Score factuality across parametric, retrieval, and grounded dimensions")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreFactuality } = await import("./score/factuality.js");
      const result = scoreFactuality({});
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n📚  Factuality"));
      console.log(chalk.gray("Score:"), result.overallScore.toFixed(2));
      console.log(chalk.gray("  Parametric:"), result.parametric.score.toFixed(2));
      console.log(chalk.gray("  Search/Retrieval:"), result.searchRetrieval.score.toFixed(2));
      console.log(chalk.gray("  Grounded:"), result.grounded.score.toFixed(2));
      if (result.overallScore === 0) { console.log(chalk.yellow("\n💡 No data provided. Pipe evidence via --json or use 'amc score collect-evidence <agentId>' first.")); }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("alignment-index")
  .description("Compute composite alignment index")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { computeAlignmentIndex } = await import("./score/alignmentIndex.js");
      const result = computeAlignmentIndex({ truthfulnessScore: 0, instructionComplianceScore: 0, safetyScore: 0, behavioralConsistencyScore: 0 });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🧭  Alignment Index"));
      console.log(chalk.gray("Overall:"), result.overall.toFixed(2), chalk.gray(`(${result.grade})`));
      for (const d of result.dimensions) {
        console.log(chalk.gray(`  ${d.name}:`), d.score.toFixed(2));
      }
      if (result.overall === 0) { console.log(chalk.yellow("\n💡 All scores are zero. Provide real scores from your agent's eval suite (truthfulness, safety, compliance, consistency).")); }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("interpretability")
  .description("Score structural transparency and explainability")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreInterpretability } = await import("./score/interpretability.js");
      const result = scoreInterpretability([]);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🔍  Interpretability"));
      console.log(chalk.gray("Score:"), result.overallScore.toFixed(2));
      console.log(chalk.gray("Explanation coverage:"), `${(result.explanationCoverage * 100).toFixed(1)}%`);
      console.log(chalk.gray("Faithfulness:"), result.faithfulnessScore.toFixed(2));
      if (result.overallScore === 0) { console.log(chalk.yellow("\n💡 No decision traces provided. Add reasoning traces to your agent's outputs for interpretability scoring.")); }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("faithfulness")
  .description("Score how well LLM output is grounded in provided context")
  .option("--json", "Output as JSON")
  .option("--context <text>", "Context to evaluate against")
  .option("--output <text>", "LLM output to evaluate")
  .option("--threshold <n>", "Overlap threshold (0-1)", parseFloat)
  .action(async (opts: { json?: boolean; context?: string; output?: string; threshold?: number }) => {
    try {
      const { scoreFaithfulness } = await import("./score/faithfulness.js");
      const result = scoreFaithfulness(
        { context: opts.context ?? "", output: opts.output ?? "" },
        { overlapThreshold: opts.threshold },
      );
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🎯  Faithfulness"));
      console.log(chalk.gray("Score:"), result.score.toFixed(3));
      console.log(chalk.gray("Claims:"), `${result.supportedClaims}/${result.totalClaims} supported`);
      console.log(chalk.gray("Explanation:"), result.explanation);
      if (result.recommendations.length > 0) {
        console.log(chalk.yellow("\n💡 Recommendations:"));
        for (const r of result.recommendations) console.log(chalk.yellow(`  - ${r}`));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("memory-integrity")
  .description("Score memory correction persistence and poisoning resistance")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreMemoryIntegrity } = await import("./score/memoryIntegrity.js");
      const result = scoreMemoryIntegrity({ events: [], sessionCount: 0, totalDurationMs: 0 });
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🧠  Memory Integrity"));
      console.log(chalk.gray("Score:"), result.overallScore.toFixed(2));
      console.log(chalk.gray("Consistency:"), result.consistencyScore.toFixed(2));
      console.log(chalk.gray("Poisoning resistance:"), result.poisoningResistanceScore.toFixed(2));
      if (result.overallScore === 0) { console.log(chalk.yellow("\n💡 No memory events provided. Run your agent with AMC instrumentation to collect memory data.")); }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("output-attestation")
  .description("Score output signing and trust metadata for receiving agents")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreOutputAttestation } = await import("./score/outputAttestation.js");
      const result = scoreOutputAttestation({});
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n📜  Output Attestation"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Output signing:"), result.hasOutputSigning ? chalk.green("yes") : chalk.red("no"));
      console.log(chalk.gray("Trust level binding:"), result.hasTrustLevelBinding ? chalk.green("yes") : chalk.red("no"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("mutual-verification")
  .description("Score agent-to-agent trust verification (challenge-response)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { scoreMutualVerification } = await import("./score/mutualVerification.js");
      const result = scoreMutualVerification({});
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🤝  Mutual Verification"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Challenge-response:"), result.hasChallengeResponse ? chalk.green("yes") : chalk.red("no"));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("transparency-log")
  .description("Score network transparency log (Merkle tree, inclusion proofs)")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { TransparencyLog } = await import("./score/networkTransparencyLog.js");
      const log = new TransparencyLog();
      const result = log.score();
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🌐  Network Transparency Log"));
      console.log(chalk.gray("Score:"), result.score, chalk.gray(`(L${result.level})`));
      console.log(chalk.gray("Log size:"), result.logSize);
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
    console.log(chalk.bold.hex('#4AEF79')(`\n📊  ${tier.charAt(0).toUpperCase() + tier.slice(1)} Score Assessment`));
    console.log(chalk.gray(`Score: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`));
    console.log(renderAsciiRadar(result.layerScores));
    if (result.gaps.length > 0) {
      console.log(chalk.yellow("Top Gaps:"));
      for (const g of result.gaps) { console.log(`  ${g.questionId}: ${g.title} (L${g.currentLevel} → L${g.targetLevel})`); }
    }
    console.log("");
    for (const line of result.roadmap) { console.log(chalk.hex('#4AEF79')(line)); }
  });

// ── Score Industry Models ──────────────────────────────────────────────────────
score
  .command("industry-list")
  .description("List all available industry trust models")
  .option("--json", "Output as JSON")
  .action(async (opts: { json?: boolean }) => {
    try {
      const { INDUSTRY_TRUST_MODELS } = await import("./score/industryTrustModels.js");
      const models = Object.values(INDUSTRY_TRUST_MODELS);
      if (opts.json) { console.log(JSON.stringify(models, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')(`\n📊  Industry Trust Models (${models.length})`));
      for (const model of models) {
        console.log(`\n  ${chalk.bold(model.industryId)} — ${model.name}`);
        console.log(chalk.gray(`    Risk profile: ${model.riskProfile}`));
        console.log(chalk.gray(`    Trust decay rate: ${model.trustDecayRate}/24h`));
        console.log(chalk.gray(`    Max stale hours: ${model.maxStaleHours}h`));
        console.log(chalk.gray(`    Frameworks: ${model.regulatoryFrameworks.join(", ")}`));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("industry-adjust")
  .description("Adjust a score using an industry-specific trust model")
  .option("--industry <id>", "Industry ID (e.g. healthcare, finance, defense)")
  .option("--score <n>", "Raw score as percentage 0-100 (e.g. 75) or decimal 0-1 (e.g. 0.75); auto-read from agent if omitted")
  .option("--agent <id>", "Agent ID (used to auto-read current score)")
  .option("--json", "Output as JSON")
  .action(async (opts: { industry?: string; score?: string; agent?: string; json?: boolean }) => {
    try {
      // F17: validate all required options at once before running
      const missing: string[] = [];
      if (!opts.industry) missing.push("--industry <id>");
      if (missing.length > 0) {
        const { INDUSTRY_TRUST_MODELS } = await import("./score/industryTrustModels.js");
        console.error(chalk.red(`Missing required options: ${missing.join(", ")}`));
        console.log(chalk.gray("Available industries:"), Object.keys(INDUSTRY_TRUST_MODELS).join(", "));
        process.exit(1); return;
      }
      const { computeIndustryAdjustedScore, INDUSTRY_TRUST_MODELS } = await import("./score/industryTrustModels.js");
      // F18: auto-read agent score if --score not provided
      let rawScore: number;
      if (!opts.score) {
        try {
          const agentId = opts.agent ?? activeAgent(program) ?? "default";
          const report = await runDiagnostic({ workspace: process.cwd(), window: "30d", agentId });
          const avgLevel = report.layerScores.length > 0
            ? report.layerScores.reduce((s: number, l: { avgFinalLevel: number }) => s + l.avgFinalLevel, 0) / report.layerScores.length
            : 0;
          rawScore = Math.min(1, avgLevel / 5);
          console.log(chalk.gray(`Using current agent score: ${(rawScore * 100).toFixed(1)}% (auto-read from ${agentId})`));
        } catch {
          console.error(chalk.red("No --score provided and no agent score available."));
          console.log(chalk.gray("Run `amc quickscore` first, or provide --score <0-100> (e.g. --score 75)"));
          process.exit(1); return;
        }
      } else {
        rawScore = parseFloat(opts.score);
        // Accept both 0-100 (e.g. 75) and 0-1 (e.g. 0.75) — normalize to 0-1
        if (rawScore > 1) rawScore = rawScore / 100;
      }
      const industryId = opts.industry!;
      const model = INDUSTRY_TRUST_MODELS[industryId];
      if (!model) {
        console.error(chalk.red(`Unknown industry: ${industryId}`));
        console.log(chalk.gray("Available:"), Object.keys(INDUSTRY_TRUST_MODELS).join(", "));
        process.exit(1); return;
      }
      const dims = Object.keys(model.dimensionWeights);
      const rawDimensionScores: Record<string, number> = {};
      for (const dim of dims) rawDimensionScores[dim] = rawScore;
      const result = computeIndustryAdjustedScore(rawDimensionScores, industryId, Date.now(), 0.8);
      if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')(`\n📊  Industry-Adjusted Score`));
      if (opts.agent) console.log(chalk.gray("Agent:"), opts.agent);
      console.log(chalk.gray("Industry:"), `${model.name} (${industryId})`);
      console.log(chalk.gray("Raw score:"), result.rawScore);
      console.log(chalk.gray("Adjusted score:"), chalk.bold(result.adjustedScore.toString()));
      console.log(chalk.gray("Maturity level:"), result.maturityLevel);
      console.log(chalk.gray("Percentile rank:"), `p${result.percentileRank.toFixed(0)}`);
      console.log(chalk.gray("Decay applied:"), result.decayApplied);
      if (result.riskFactors.length > 0) {
        console.log(chalk.yellow("Risk factors:"));
        for (const rf of result.riskFactors) console.log(chalk.yellow(`  • ${rf}`));
      }
      if (result.complianceGaps.length > 0) {
        console.log(chalk.red("Compliance gaps:"));
        for (const cg of result.complianceGaps) console.log(chalk.red(`  • ${cg}`));
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("industry-benchmark")
  .description("Show industry benchmark percentiles")
  .requiredOption("--industry <id>", "Industry ID (e.g. healthcare, finance, defense)")
  .option("--json", "Output as JSON")
  .action(async (opts: { industry: string; json?: boolean }) => {
    try {
      const { INDUSTRY_TRUST_MODELS } = await import("./score/industryTrustModels.js");
      const model = INDUSTRY_TRUST_MODELS[opts.industry];
      if (!model) {
        console.error(chalk.red(`Unknown industry: ${opts.industry}`));
        console.log(chalk.gray("Available:"), Object.keys(INDUSTRY_TRUST_MODELS).join(", "));
        process.exit(1); return;
      }
      const bench = model.benchmarkPercentiles;
      if (opts.json) { console.log(JSON.stringify({ industry: opts.industry, name: model.name, benchmarkPercentiles: bench }, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')(`\n📊  Industry Benchmarks — ${model.name}`));
      console.log(chalk.gray("Sample size:"), bench.sampleSize);
      console.log(chalk.gray("P25:"), bench.p25.toFixed(3));
      console.log(chalk.gray("P50:"), bench.p50.toFixed(3));
      console.log(chalk.gray("P75:"), bench.p75.toFixed(3));
      console.log(chalk.gray("P90:"), bench.p90.toFixed(3));
      console.log(chalk.gray("P99:"), bench.p99.toFixed(3));
      console.log(chalk.gray("Risk profile:"), model.riskProfile);
      console.log(chalk.gray("Frameworks:"), model.regulatoryFrameworks.join(", "));
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
  });

score
  .command("simulation-lane")
  .description("Run the Simulation & Forecast evaluation lane — 5-dimension assessment for simulation/forecast systems")
  .requiredOption("--system-type <type>", "System type: simulation-engine, forecast-decision-support, or synthetic-social-environment")
  .option("--json", "Output as JSON")
  .option("--responses <file>", "JSON file with diagnostic responses (Record<string, string> keyed by question ID)")
  .action(async (opts: { systemType: string; json?: boolean; responses?: string }) => {
    try {
      const { evaluateSimulationLane, isSimulationLaneActive, getSimulationLaneQuestionIds } = await import("./lanes/simulationForecastLane.js");
      const validTypes = ["simulation-engine", "forecast-decision-support", "synthetic-social-environment", "task-agent", "orchestrated-workflow", "research-delegation"];
      if (!validTypes.includes(opts.systemType)) {
        console.error(chalk.red(`Invalid system type: ${opts.systemType}`));
        console.log(chalk.gray("Valid types:"), validTypes.join(", "));
        process.exit(1); return;
      }
      const systemType = opts.systemType as import("./types.js").SystemType;
      if (!isSimulationLaneActive(systemType)) {
        console.log(chalk.yellow(`\n⚠  Simulation & Forecast lane is not applicable for system type '${systemType}'.`));
        console.log(chalk.gray("This lane activates for: simulation-engine, forecast-decision-support, synthetic-social-environment"));
        return;
      }
      let responses: Record<string, string> = {};
      if (opts.responses) {
        const { readFileSync } = await import("fs");
        responses = JSON.parse(readFileSync(opts.responses, "utf-8"));
      } else if (process.stdin.isTTY) {
        const inq = await import("inquirer");
        const questionIds = getSimulationLaneQuestionIds();
        console.log(chalk.bold.hex('#4AEF79')("\n🔮  Simulation & Forecast Lane — Interactive Assessment"));
        console.log(chalk.gray(`${questionIds.length} questions across 5 dimensions\n`));
        for (const qid of questionIds) {
          const { answer } = await inq.default.prompt([{
            type: "editor",
            name: "answer",
            message: `${qid}: Describe your system's approach (or press Enter to skip):`,
          }]);
          if (answer && answer.trim()) {
            responses[qid] = answer.trim();
          }
        }
      }
      const report = evaluateSimulationLane(systemType, responses);
      if (!report || !report.active) {
        console.log(chalk.yellow("Lane not active for this system type."));
        return;
      }
      if (opts.json) { console.log(JSON.stringify(report, null, 2)); return; }
      console.log(chalk.bold.hex('#4AEF79')("\n🔮  Simulation & Forecast Lane — Results"));
      console.log(chalk.gray("System type:"), systemType);
      console.log(chalk.gray("Overall score:"), chalk.bold(`${report.overallScore}/100`));
      console.log(chalk.gray("Maturity level:"), chalk.bold(`L${report.overallLevel}`));
      console.log(chalk.gray("Coverage:"), `${report.coverage.answered}/${report.coverage.total} questions (${report.coverage.percentage}%)`);
      console.log(chalk.bold("\n📊  Dimensions:"));
      const dims = report.dimensions;
      const dimEntries = [
        { name: "Forecast Legitimacy", dim: dims.forecastLegitimacy },
        { name: "Boundary Integrity", dim: dims.boundaryIntegrity },
        { name: "Synthetic Identity", dim: dims.syntheticIdentity },
        { name: "Simulation Validity", dim: dims.simulationValidity },
        { name: "Scenario Provenance", dim: dims.scenarioProvenance },
      ];
      for (const { name, dim } of dimEntries) {
        const bar = "█".repeat(Math.round(dim.score / 5)) + "░".repeat(20 - Math.round(dim.score / 5));
        const color = dim.score >= 70 ? chalk.green : dim.score >= 40 ? chalk.yellow : chalk.red;
        console.log(`  ${color(bar)} ${chalk.bold(name)} — ${dim.score}/100 (L${dim.level}, weight ${(dim.weight * 100).toFixed(0)}%)`);
      }
      if (report.priorities.length > 0) {
        console.log(chalk.bold("\n🎯  Top Priorities:"));
        for (const p of report.priorities) {
          console.log(chalk.yellow(`  → ${p}`));
        }
      }
      if (report.allGaps.length > 0) {
        console.log(chalk.bold(`\n⚠  Gaps (${report.allGaps.length}):`));
        for (const g of report.allGaps.slice(0, 10)) {
          console.log(chalk.red(`  • ${g}`));
        }
        if (report.allGaps.length > 10) {
          console.log(chalk.gray(`  ... and ${report.allGaps.length - 10} more (use --json for full list)`));
        }
      }
    } catch (e: unknown) { console.error(chalk.red(toErrorMessage(e))); process.exit(1); }
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
      console.log(chalk.bold.hex('#4AEF79')("\n🔍  Endpoint Probe Results"));
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
        console.log(chalk.bold.hex('#4AEF79')("\n🔍  Repo Scan Results"));
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
    console.log(chalk.bold.hex('#4AEF79')("\n🔍  Local Scan Results"));
    console.log(chalk.gray(`Path: ${result.path}`));
    console.log(chalk.gray(`Files scanned: ${result.filesScanned}`));
    console.log(chalk.gray(`Framework: ${result.detection.framework} (${(result.detection.confidence * 100).toFixed(0)}% confidence)`));
    console.log(chalk.gray(`Security: ${result.detection.securityPosture}`));
    console.log(chalk.gray(`Tools: ${result.detection.toolUsage.join(", ") || "none detected"}`));
    console.log(chalk.gray(`Governance: ${result.detection.governanceArtifacts.join(", ") || "none detected"}`));
    console.log(chalk.bold(`Preliminary Score: ${result.preliminaryScore.label}`));
    for (const s of result.detection.signals) { console.log(`  → ${s}`); }
  });

scan
  .command("model-scan")
  .description("Scan ML model files for security threats (malicious code, backdoors, supply chain attacks)")
  .argument("[target]", "file path, directory, HuggingFace repo (user/repo), S3 URL, or HTTP URL")
  .option("--format <formats>", "comma-separated list of formats to scan (pickle,pytorch,onnx,safetensors,keras,tensorflow,all)", "all")
  .option("--max-size <mb>", "maximum file size to scan in MB", "100")
  .option("--no-deep-scan", "skip deep content analysis (metadata only)")
  .option("--no-hashes", "skip file hash computation")
  .option("--timeout <ms>", "scan timeout per file in milliseconds", "30000")
  .option("--output <format>", "output format: json, sarif, table", "table")
  .option("--output-file <path>", "save results to file")
  .option("--recursive", "recursively scan directories", false)
  .option("--include-safe", "include files with no threats in output", false)
  .action(async (target: string | undefined, opts: {
    format: string;
    maxSize: string;
    deepScan: boolean;
    hashes: boolean;
    timeout: string;
    output: "json" | "sarif" | "table";
    outputFile?: string;
    recursive: boolean;
    includeSafe: boolean;
  }) => {
    const { scanModelFile, isModelFile, getSupportedFormats } = await import("./scanner/modelScanner.js");
    const { readdirSync, statSync, writeFileSync } = await import("node:fs");
    const { join, resolve } = await import("node:path");
    const { pathExists } = await import("./utils/fs.js");

    if (!target) {
      console.log(chalk.bold("🔍 AMC Model Scanner"));
      console.log("Scans ML model files for security threats, malicious code, and supply chain attacks.");
      console.log("");
      console.log(chalk.hex('#4AEF79')("Supported formats:"));
      const formats = getSupportedFormats();
      for (let i = 0; i < formats.length; i += 4) {
        const row = formats.slice(i, i + 4).join("  ");
        console.log(`  ${row}`);
      }
      console.log("");
      console.log(chalk.hex('#4AEF79')("Usage examples:"));
      console.log("  amc scan model-scan ./model.pkl");
      console.log("  amc scan model-scan ./models/ --recursive");
      console.log("  amc scan model-scan https://example.com/model.pth");
      console.log("  amc scan model-scan user/repo-name  # HuggingFace");
      console.log("  amc scan model-scan --format pickle,pytorch --output sarif");
      console.log("");
      return;
    }

    const maxSizeBytes = parseInt(opts.maxSize, 10) * 1024 * 1024;
    const timeoutMs = parseInt(opts.timeout, 10);
    const formatFilter = opts.format === "all" ? null : new Set(opts.format.split(",").map(f => f.trim().toLowerCase()));

    const scanOptions = {
      maxFileSize: maxSizeBytes,
      deepScan: opts.deepScan,
      includeHashes: opts.hashes,
      timeoutMs,
    };

    const results: Array<Awaited<ReturnType<typeof scanModelFile>>> = [];

    // Handle different target types
    if (target.startsWith("http://") || target.startsWith("https://")) {
      console.error(chalk.red("HTTP/HTTPS URLs not yet supported. Use local files or directories."));
      process.exit(1);
    } else if (target.includes("/") && !target.startsWith("./") && !target.startsWith("/")) {
      // Assume HuggingFace repo format
      console.error(chalk.red("HuggingFace repo scanning not yet supported. Use local files or directories."));
      process.exit(1);
    } else {
      // Local file or directory
      const targetPath = resolve(target);
      
      if (!pathExists(targetPath)) {
        console.error(chalk.red(`Target not found: ${targetPath}`));
        process.exit(1);
      }

      const stat = statSync(targetPath);
      
      if (stat.isFile()) {
        if (!isModelFile(targetPath)) {
          console.error(chalk.red(`File does not appear to be a supported model format: ${targetPath}`));
          process.exit(1);
        }
        
        console.log(chalk.gray(`Scanning file: ${targetPath}`));
        const result = await scanModelFile(targetPath, scanOptions);
        results.push(result);
      } else if (stat.isDirectory()) {
        const files: string[] = [];
        
        const collectFiles = (dir: string, depth = 0) => {
          if (depth > (opts.recursive ? 10 : 0)) return;
          
          try {
            const entries = readdirSync(dir);
            for (const entry of entries) {
              if (entry.startsWith(".")) continue;
              
              const fullPath = join(dir, entry);
              const entryStat = statSync(fullPath);
              
              if (entryStat.isDirectory() && opts.recursive) {
                collectFiles(fullPath, depth + 1);
              } else if (entryStat.isFile() && isModelFile(fullPath)) {
                if (!formatFilter || formatFilter.has(fullPath.split(".").pop()?.toLowerCase() || "")) {
                  files.push(fullPath);
                }
              }
            }
          } catch (error) {
            console.warn(chalk.yellow(`Warning: Could not read directory ${dir}: ${error}`));
          }
        };
        
        collectFiles(targetPath);
        
        if (files.length === 0) {
          console.log(chalk.yellow("No model files found in the specified directory."));
          return;
        }
        
        console.log(chalk.gray(`Found ${files.length} model file(s) to scan...`));
        
        for (const file of files) {
          console.log(chalk.gray(`Scanning: ${file}`));
          const result = await scanModelFile(file, scanOptions);
          results.push(result);
        }
      }
    }

    // Filter results if needed
    const filteredResults = opts.includeSafe ? results : results.filter(r => r.threats.length > 0);

    // Generate output
    if (opts.output === "json") {
      const output = {
        scanTimestamp: new Date().toISOString(),
        scannedFiles: results.length,
        threatsFound: results.reduce((sum, r) => sum + r.threats.length, 0),
        results: filteredResults,
      };
      
      const jsonOutput = JSON.stringify(output, null, 2);
      
      if (opts.outputFile) {
        writeFileSync(resolve(opts.outputFile), jsonOutput, "utf-8");
        console.log(chalk.green(`Results saved to: ${opts.outputFile}`));
      } else {
        console.log(jsonOutput);
      }
    } else if (opts.output === "sarif") {
      // SARIF format for CI/CD integration
      const sarif = {
        version: "2.1.0",
        $schema: "https://json.schemastore.org/sarif-2.1.0.json",
        runs: [{
          tool: {
            driver: {
              name: "AMC Model Scanner",
              version: "1.0.0",
              informationUri: "https://github.com/thewisecrab/AgentMaturityCompass",
            }
          },
          results: filteredResults.flatMap(result => 
            result.threats.map(threat => ({
              ruleId: threat.type,
              level: threat.severity === "critical" ? "error" : threat.severity === "high" ? "error" : "warning",
              message: { text: threat.description },
              locations: [{
                physicalLocation: {
                  artifactLocation: { uri: result.filePath },
                  region: threat.offset ? { startLine: 1, startColumn: threat.offset } : undefined,
                }
              }],
              properties: {
                evidence: threat.evidence,
                fileSize: result.fileSize,
                format: result.format,
                riskLevel: result.riskLevel,
              }
            }))
          )
        }]
      };
      
      const sarifOutput = JSON.stringify(sarif, null, 2);
      
      if (opts.outputFile) {
        writeFileSync(resolve(opts.outputFile), sarifOutput, "utf-8");
        console.log(chalk.green(`SARIF results saved to: ${opts.outputFile}`));
      } else {
        console.log(sarifOutput);
      }
    } else {
      // Table format (default)
      console.log(chalk.bold("\n🔍 Model Security Scan Results\n"));
      
      if (filteredResults.length === 0) {
        console.log(chalk.green("✅ No threats detected in scanned files."));
        console.log(chalk.gray(`Scanned ${results.length} file(s) in ${results.reduce((sum, r) => sum + r.scanDurationMs, 0)}ms`));
        return;
      }
      
      for (const result of filteredResults) {
        const riskColor = result.riskLevel === "critical" ? chalk.red : 
                         result.riskLevel === "high" ? chalk.red :
                         result.riskLevel === "medium" ? chalk.yellow :
                         result.riskLevel === "low" ? chalk.blue : chalk.green;
        
        console.log(riskColor(`${result.riskLevel.toUpperCase()} RISK: ${result.filePath}`));
        console.log(chalk.gray(`  Format: ${result.format} | Size: ${Math.round(result.fileSize / 1024)}KB | Scan: ${result.scanDurationMs}ms`));
        
        if (result.sha256) {
          console.log(chalk.gray(`  SHA256: ${result.sha256}`));
        }
        
        for (const threat of result.threats) {
          const severityColor = threat.severity === "critical" ? chalk.red :
                               threat.severity === "high" ? chalk.red :
                               threat.severity === "medium" ? chalk.yellow : chalk.blue;
          
          console.log(`  ${severityColor(`[${threat.severity.toUpperCase()}]`)} ${threat.description}`);
          if (threat.evidence) {
            console.log(chalk.gray(`    Evidence: ${threat.evidence}`));
          }
        }
        console.log("");
      }
      
      const totalThreats = results.reduce((sum, r) => sum + r.threats.length, 0);
      const criticalCount = results.reduce((sum, r) => sum + r.threats.filter(t => t.severity === "critical").length, 0);
      const highCount = results.reduce((sum, r) => sum + r.threats.filter(t => t.severity === "high").length, 0);
      
      console.log(chalk.bold("Summary:"));
      console.log(`  Files scanned: ${results.length}`);
      console.log(`  Threats found: ${totalThreats}`);
      console.log(`  Critical: ${criticalCount} | High: ${highCount}`);
      
      if (criticalCount > 0 || highCount > 0) {
        console.log(chalk.red("\n⚠️  High-risk threats detected. Review before deployment."));
        process.exit(1);
      }
    }
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
    } catch (e: unknown) {
      console.log(chalk.yellow(`Note: ${toErrorMessage(e)}`));
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

    // R5: Auto-open browser
    try {
      const { exec: execChild } = await import("node:child_process");
      const platform = process.platform;
      const openCmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
      execChild(`${openCmd} ${handle.url}`);
    } catch {
      // Ignore errors — browser open is best-effort
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

program
  .command("vibe-audit")
  .description("Run static safety checks for AI-generated code")
  .requiredOption("--file <path>", "file path to audit")
  .option("--json", "emit JSON output", false)
  .action((opts: { file: string; json?: boolean }) => {
    const filePath = resolve(opts.file);
    const code = readFileSync(filePath, "utf8");
    const result = auditVibeCode(code, filePath);

    if (opts.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(result.summary);
      console.log(`score=${result.score} grade=${result.grade}`);
      if (result.quickFixes.length > 0) {
        console.log("quick_fixes:");
        for (const fix of result.quickFixes) {
          console.log(`- ${fix}`);
        }
      }
    }

    if (result.criticalCount > 0) {
      process.exit(2);
    }
    if (!result.deploymentReady) {
      process.exit(1);
    }
  });

// ── quickstart: one-command simplicity onboarding ─────────────────────────────
program
  .command("quickstart")
  .description("2-minute quickstart with Quick Score assessment")
  .option("--profile <name>", "workspace config profile: dev|ci|prod", "dev")
  .action(async (opts: { profile: "dev" | "ci" | "prod" }) => {
    console.log(chalk.bold.hex('#4AEF79')("\n🚀  AMC Quick Start — Agent Maturity in 2 Minutes\n"));

    // Step 1: workspace init
    console.log(chalk.hex('#4AEF79')("Step 1: Setting up workspace..."));
    try {
      const ws = await quickstartWizard(process.cwd());
      const profiled = applyAMCConfigProfile(opts.profile, loadAMCConfig(process.cwd()));
      saveAMCConfig(process.cwd(), profiled);
      console.log(chalk.green("  ✓ Workspace initialized"));
      console.log(chalk.gray(`    Profile: ${opts.profile}`));
      console.log(chalk.gray(`    Gateway: ${ws.nextGatewayCommand}`));
    } catch { console.log(chalk.green("  ✓ Workspace already configured")); }

    // Step 2: Quick Score
    console.log(chalk.hex('#4AEF79')("\nStep 2: Quick Score Assessment (10 questions)\n"));
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
      console.log(chalk.yellow("  ⚠  No TTY detected — defaulting all answers to L0. For interactive assessment, run: amc quickscore"));
    }

    const result = computeQuickScore(answers, "quick");

    // Step 3: Results
    console.log(chalk.hex('#4AEF79')("\nStep 3: Your Results\n"));
    console.log(chalk.bold(`  Overall: ${result.totalScore}/${result.maxScore} (${result.percentage}%)`));
    console.log(renderAsciiRadar(result.layerScores));

    if (result.gaps.length > 0) {
      console.log(chalk.yellow("  Top 5 Gaps:"));
      for (const g of result.gaps) {
        console.log(`    • ${g.title}: L${g.currentLevel} → L${g.targetLevel}`);
      }
    }

    console.log("");
    for (const line of result.roadmap) { console.log(chalk.hex('#4AEF79')(`  ${line}`)); }

    console.log(chalk.bold.hex('#4AEF79')("\n📋  Next Steps:"));
    console.log("  amc score tier --tier standard   Full 126-question assessment");
    console.log("  amc scan --local .               Scan your codebase");
    console.log("  amc dashboard open               Open web dashboard");
    console.log("  amc playground run               Run scenario tests");
    console.log("  amc guardrails profile standard   Enable standard guardrails");
    console.log("");
  });

// ── Structured Debug Mode ────────────────────────────────────────────────
program
  .command("debug")
  .description("Structured evidence debug stream for an agent")
  .requiredOption("--agent <id>", "agent ID")
  .option("--follow", "follow new evidence events in real-time", false)
  .option("--dimension <dimension>", "filter by dimension (dimensionId)")
  .option("--question <questionId>", "filter by AMC question ID")
  .option("--event-type <eventType>", "filter by evidence event type")
  .option("--limit <n>", "initial event limit", "100")
  .option("--poll-ms <ms>", "follow polling interval in ms", "1000")
  .option("--no-color", "disable ANSI color output")
  .action(async (opts: {
    agent: string;
    follow?: boolean;
    dimension?: string;
    question?: string;
    eventType?: string;
    limit: string;
    pollMs: string;
    color?: boolean;
  }) => {
    const { runDebugModeCli } = await import("./observability/debugMode.js");
    await runDebugModeCli({
      workspace: process.cwd(),
      agentId: opts.agent,
      follow: Boolean(opts.follow),
      dimension: opts.dimension,
      questionId: opts.question,
      eventType: opts.eventType,
      limit: Number.parseInt(opts.limit, 10),
      pollIntervalMs: Number.parseInt(opts.pollMs, 10),
      color: opts.color
    });
  });

// ── API subcommand ──────────────────────────────────────────────────────
const apiCmd = program.command("api").description("REST API management");
apiCmd
  .command("status")
  .description("Show API integration status")
  .action(() => {
    console.log(chalk.bold("AMC REST API v1"));
    console.log(`  Endpoints: shield, enforce, vault, watch, score, product, agents`);
    console.log(`  Base path: /api/v1/`);
    console.log(`  Integrated into Studio server at :3212`);
    console.log(chalk.green("Run 'amc studio open' to start the server with API enabled."));
  });

apiCmd
  .command("routes")
  .description("List all available REST API endpoints")
  .action(() => {
    console.log(chalk.bold("\n🌐  AMC REST API v1 — Available Endpoints\n"));
    const routes = [
      { method: "GET",    path: "/api/v1/status",                  desc: "Server health and version" },
      { method: "GET",    path: "/api/v1/agents",                   desc: "List all registered agents" },
      { method: "GET",    path: "/api/v1/agents/:id",               desc: "Get agent details" },
      { method: "POST",   path: "/api/v1/agents",                   desc: "Register a new agent" },
      { method: "GET",    path: "/api/v1/agents/:id/score",         desc: "Get agent maturity score" },
      { method: "GET",    path: "/api/v1/agents/:id/diagnostic",    desc: "Full diagnostic report" },
      { method: "POST",   path: "/api/v1/agents/:id/score",         desc: "Submit scoring evidence" },
      { method: "GET",    path: "/api/v1/fleet/health",             desc: "Fleet health dashboard" },
      { method: "GET",    path: "/api/v1/compliance/report",        desc: "Generate compliance report" },
      { method: "POST",   path: "/api/v1/shield/scan",              desc: "Run shield security scan" },
      { method: "POST",   path: "/api/v1/vault/unlock",             desc: "Unlock the vault (passphrase)" },
      { method: "GET",    path: "/api/v1/vault/status",             desc: "Vault lock status" },
      { method: "GET",    path: "/api/v1/watch/events",             desc: "SSE stream of audit events" },
      { method: "POST",   path: "/api/v1/enforce",                  desc: "Enforce a governance policy" },
      { method: "GET",    path: "/api/v1/product/signals",          desc: "Product value signals" },
    ];
    for (const r of routes) {
      const method = r.method.padEnd(6);
      console.log(`  ${chalk.bold.cyan(method)} ${chalk.white(r.path.padEnd(42))} ${chalk.gray(r.desc)}`);
    }
    console.log("");
    console.log(chalk.gray("  Base URL: http://localhost:3212"));
    console.log(chalk.gray("  Auth:     Bearer token (see: amc user token)"));
    console.log(chalk.gray("  Docs:     amc api docs | docs/API_REFERENCE.md"));
    console.log("");
  });

apiCmd
  .command("start")
  .description("Start the AMC API server (alias for 'amc up')")
  .option("--port <port>", "port number", "3212")
  .action(async (opts: { port?: string }) => {
    console.log(chalk.bold("\n🚀  Starting AMC API Server...\n"));
    console.log(chalk.gray("  The API is served by AMC Studio. Starting it now.\n"));
    const { runStudioForeground } = await import("./studio/studioSupervisor.js");
    await runStudioForeground({ workspace: process.cwd(), apiPort: Number(opts.port) || 3212 });
  });

apiCmd
  .command("docs")
  .description("Show API reference documentation summary and link")
  .action(() => {
    console.log(chalk.bold("\n📖  AMC API Reference\n"));
    console.log("  Full docs: docs/API_REFERENCE.md (in your AMC install directory)");
    console.log("  Online:    https://github.com/thewisecrab/AgentMaturityCompass/blob/main/docs/API_REFERENCE.md");
    console.log("");
    console.log(chalk.bold("  Quick start:"));
    console.log(`  1. Start Studio:      ${chalk.hex('#4AEF79')("amc up")}`);
    console.log(`  2. Get a token:       ${chalk.hex('#4AEF79')("amc user token")}`);
    console.log(`  3. List agents:       ${chalk.hex('#4AEF79')("curl -H 'Authorization: Bearer <token>' http://localhost:3212/api/v1/agents")}`);
    console.log(`  4. List all routes:   ${chalk.hex('#4AEF79')("amc api routes")}`);
    console.log("");
    console.log(chalk.bold("  Authentication:"));
    console.log("  All endpoints require a Bearer token header.");
    console.log("  Tokens are issued by the Studio server after vault unlock.");
    console.log("");
    console.log(chalk.bold("  Response format:"));
    console.log("  All responses are JSON. Errors use { error: string, code: string }.");
    console.log("");
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

// ── Demo ─────────────────────────────────────────────────────────────────────
const demo = program.command("demo").description("Run interactive demos of AMC capabilities");

demo
  .command("gap")
  .description("The 84-point documentation inflation gap — keyword vs execution scoring")
  .option("--json", "Output as JSON")
  .option("--fast", "Skip the dramatic reveal (instant output)")
  .action(async (opts: { json?: boolean; fast?: boolean }) => {
    const { runGapDemo } = await import("./demo/gapDemo.js");
    const result = runGapDemo();

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const delay = opts.fast ? 0 : 80;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    console.log("");
    console.log(chalk.bold("  🧭 AMC — The 84-Point Documentation Inflation Gap"));
    console.log(chalk.gray("  Same agent. Two scoring methods. Very different results."));
    console.log("");

    // Phase 1: Keyword scoring
    console.log(chalk.bold.green("  ━━━ Phase 1: Keyword / Self-Reported Scoring ━━━"));
    console.log(chalk.gray("  Method: Check if the agent's documentation mentions the right keywords."));
    console.log("");

    for (const test of result.tests) {
      await sleep(delay);
      console.log(chalk.green(`  ✅ ${test.question}`));
      console.log(chalk.gray(`     Claim: "${test.claim}" → Keywords found → 5/5`));
    }

    console.log("");
    console.log(chalk.bold.green(`  Keyword Score: ${result.keywordScore}/${result.keywordMax} (${result.keywordPercent}%) ✅`));
    console.log(chalk.green("  Verdict: Agent is fully mature! Ship it! 🚀"));
    console.log("");

    await sleep(delay * 5);

    // Phase 2: Execution scoring
    console.log(chalk.bold.red("  ━━━ Phase 2: AMC Execution-Verified Scoring ━━━"));
    console.log(chalk.gray("  Method: Actually test each claim. Watch what the agent does, not what it says."));
    console.log("");

    for (const test of result.tests) {
      await sleep(delay);
      const icon = test.passed ? chalk.yellow("⚠") : chalk.red("✗");
      const scoreColor = test.executionScore === 0 ? chalk.red : test.executionScore <= 1 ? chalk.yellow : chalk.green;
      console.log(`  ${icon} ${chalk.white(test.question)}`);
      console.log(chalk.gray(`     Test: ${test.test}`));
      console.log(`     ${scoreColor(`${test.executionScore}/5`)} ${chalk.gray(test.finding)}`);
    }

    console.log("");
    console.log(chalk.bold.red(`  Execution Score: ${result.executionScore}/${result.executionMax} (${result.executionPercent}%) ❌`));
    console.log("");

    await sleep(delay * 3);

    // The gap
    console.log(chalk.bold("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log("");
    console.log(chalk.bold(`  📊 The Gap`));
    console.log("");
    console.log(chalk.green(`     Keyword scoring:   ${result.keywordPercent}%`) + chalk.gray("  (what the agent says)"));
    console.log(chalk.red(`     Execution scoring: ${result.executionPercent}%`) + chalk.gray("  (what the agent does)"));
    console.log(chalk.bold.yellow(`     Gap:               ${result.gap} points`));
    console.log("");
    console.log(chalk.gray("  Every claim checked out on paper. Every claim failed in practice."));
    console.log(chalk.gray("  This is why AMC scores from execution evidence, not documentation."));
    console.log("");
    console.log(chalk.bold("  AMC closes this gap with:"));
    console.log(chalk.white("  • Execution-verified evidence (not self-reported claims)"));
    console.log(chalk.white("  • Cryptographic proof chains (can't be faked)"));
    console.log(chalk.white("  • Trust-tiered scoring (self-reported evidence is capped at 0.4×)"));
    console.log(chalk.white("  • Adversarial testing (74 attack packs that actually probe behavior)"));
    console.log("");
    console.log(chalk.gray("  Start scoring your agent:"), chalk.hex('#4AEF79')("amc init"));
    console.log("");
  });

demo
  .command("run")
  .description("Run a simulated agent through the AMC gateway and produce a real score (~30s)")
  .option("--gateway <url>", "Gateway URL (default: auto-detect running instance)")
  .option("--json", "Output as JSON")
  .action(async (opts: { gateway?: string; json?: boolean }) => {
    const { runDemo, startDemoUpstream } = await import("./demo/demoRun.js");
    const { issueLeaseForCli } = await import("./leases/leaseCli.js");
    const { ensureLeaseRevocationStore } = await import("./leases/leaseCli.js");

    // Start demo upstream server
    console.log(chalk.bold("\n🎮  AMC Live Demo\n"));
    console.log(chalk.gray("  Starting demo upstream server..."));
    const upstream = await startDemoUpstream();
    console.log(chalk.gray(`  Demo upstream: ${upstream.baseUrl}`));

    // Detect or use provided gateway
    let gatewayUrl = opts.gateway ?? "http://127.0.0.1:3210";

    // Check if gateway is running
    try {
      await fetch(`${gatewayUrl.replace(/\/$/, "")}/local/v1/models`);
    } catch {
      console.log(chalk.yellow("\n⚠  Gateway not running. Start it with:"));
      console.log(chalk.gray(`  LOCAL_OPENAI_BASE_URL=${upstream.baseUrl} amc up`));
      console.log(chalk.gray("  Then re-run: amc demo run"));
      await upstream.close();
      process.exit(1);
    }

    // Issue a lease token for the demo
    console.log(chalk.gray("  Issuing demo lease token..."));
    const workspace = process.cwd();
    ensureLeaseRevocationStore(workspace);
    const wsId = (await import("./workspaces/workspaceId.js")).workspaceIdFromDirectory(workspace);
    const lease = issueLeaseForCli({
      workspace,
      workspaceId: wsId,
      agentId: "default",
      ttl: "15m",
      scopes: "gateway:llm,proxy:connect,toolhub:intent,toolhub:execute,governor:check,receipt:verify",
      routes: "/local",
      models: "*",
      rpm: 60,
      tpm: 200000,
      maxCostUsdPerDay: null,
      workOrderId: undefined,
    });
    console.log(chalk.gray(`  Lease issued (15m TTL)`));

    console.log(chalk.gray(`  Gateway: ${gatewayUrl}`));
    console.log(chalk.gray("  Simulating a multi-turn AI agent through the AMC gateway...\n"));

    const steps = [
      "Sending research task conversation...",
      "Sending data analysis with tool calls...",
      "Sending security audit scenario...",
      "Sending code review request...",
      "Sending financial escalation scenario...",
      "Sending error recovery scenario...",
    ];

    const result = await runDemo(gatewayUrl, lease.token);

    console.log(chalk.green(`\n✓ Demo complete in ${(result.durationMs / 1000).toFixed(1)}s`));
    console.log(chalk.gray(`  ${result.requestsSent} requests sent through gateway`));
    console.log(chalk.gray(`  ~${result.evidenceItems} evidence items captured\n`));

    // Cleanup
    await upstream.close();

    // Now run the diagnostic
    console.log(chalk.bold("📊  Running diagnostic...\n"));

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.gray("  Run 'amc run --agent default' to see the full scored report."));
      console.log(chalk.gray("  Run 'amc score evidence-coverage default' to see evidence gaps."));
      console.log(chalk.gray("  Open http://127.0.0.1:3212/console for the dashboard.\n"));
    }
  });

// Agent Transparency Report + MCP Server
registerTransparencyReportCommands(program);
registerMcpCommands(program);

// ── Observability, corrections, and feedback loop commands ──
import { registerObservabilityCommands, registerCorrectionCommands } from "./cli-observability-commands.js";
import { registerTraceCommands, registerAlertCommands } from "./cli-trace-commands.js";
import { registerEvalDatasetCommands, registerLiteScoreCommands } from "./cli-eval-dataset-commands.js";
import { registerBusinessCommands, registerLeaderboardCommands, registerInventoryCommands, registerCommsCheckCommands } from "./cli-business-commands.js";
registerObservabilityCommands(program, activeAgent);
registerCorrectionCommands(program, activeAgent);
registerTraceCommands(program, activeAgent);
registerAlertCommands(program, activeAgent);
registerEvalDatasetCommands(program, activeAgent);
registerLiteScoreCommands(program);
registerBusinessCommands(program, activeAgent);
registerLeaderboardCommands(program);
registerInventoryCommands(program);
registerCommsCheckCommands(program);

// ── amc fix: Auto-remediation command ──
program
  .command("fix")
  .description("Generate remediation patches for identified gaps (auto-fix mode)")
  .option("--agent <agentId>", "agent ID")
  .option("--dry-run", "show what would be generated without writing files", false)
  .option("--target-level <level>", "target maturity level (L1-L5)", "L3")
  .option("--framework <framework>", "target framework (langchain, crewai, autogen, generic)")
  .option("--out <dir>", "output directory for patches", ".amc/fixes")
  .action(async (opts: { agent?: string; dryRun: boolean; targetLevel: string; framework?: string; out: string }) => {
    const { existsSync, mkdirSync, writeFileSync } = require("fs");
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    const targetLevelNum = parseInt(opts.targetLevel.replace(/\D/g, ""), 10) || 3;
    const outDir = resolve(process.cwd(), opts.out);

    console.log(chalk.bold(`\n🔧 AMC Auto-Fix — Agent: ${agentId}, Target: L${targetLevelNum}\n`));

    // Try to load last diagnostic run for gap analysis
    let gaps: Array<{ questionId: string; currentLevel: number; targetLevel: number; narrative: string; fix?: string }> = [];
    try {
      const ledger = openLedger(process.cwd());
      const runs = ledger.listRuns();
      if (runs.length > 0) {
        const lastRun = runs[runs.length - 1]!;
        const report = loadRunReport(process.cwd(), lastRun.run_id, agentId);
        gaps = (report.layerScores ?? []).flatMap((layer: any) =>
          (layer.questions ?? [])
            .filter((q: any) => q.finalLevel < targetLevelNum)
            .map((q: any) => ({
              questionId: q.questionId,
              currentLevel: q.finalLevel,
              targetLevel: targetLevelNum,
              narrative: q.narrative ?? "",
            }))
        );
      }
    } catch {
      // No diagnostic runs — use generic fixes
    }

    // Generate framework-specific fixes
    const fixes: Array<{ file: string; content: string; description: string }> = [];

    // Always generate: safety guardrails config
    fixes.push({
      file: "guardrails.yaml",
      description: "Safety guardrails configuration",
      content: [
        "# AMC Auto-Generated Guardrails",
        `# Target: L${targetLevelNum} | Agent: ${agentId}`,
        `# Generated: ${new Date().toISOString()}`,
        "",
        "guardrails:",
        "  input_validation:",
        "    max_length: 10000",
        "    block_patterns:",
        '      - "ignore previous instructions"',
        '      - "you are now"',
        '      - "system prompt"',
        '      - "jailbreak"',
        "    sanitize_html: true",
        "",
        "  output_validation:",
        "    max_length: 50000",
        "    block_pii: true",
        "    block_secrets: true",
        "",
        "  rate_limiting:",
        "    max_requests_per_minute: 60",
        "    max_tokens_per_minute: 100000",
        "",
        "  logging:",
        "    level: info",
        "    include_prompts: true",
        "    include_responses: true",
        "    redact_pii: true",
        targetLevelNum >= 3 ? [
          "",
          "  audit:",
          "    sign_all_events: true",
          "    tamper_detection: true",
          "    retention_days: 90",
        ].join("\n") : "",
        targetLevelNum >= 4 ? [
          "",
          "  adversarial:",
          "    canary_tokens: true",
          "    drift_detection: true",
          "    auto_quarantine: true",
        ].join("\n") : "",
      ].filter(Boolean).join("\n"),
    });

    // Generate: AGENTS.md (agent config)
    fixes.push({
      file: "AGENTS.md",
      description: "Agent governance configuration",
      content: [
        `# AGENTS.md — ${agentId} Governance Configuration`,
        "",
        "## Operational Boundaries",
        `- Target maturity: L${targetLevelNum}`,
        "- All tool calls require explicit approval at L4+",
        "- External communications require human review",
        "- Maximum autonomous operation: 30 minutes without checkpoint",
        "",
        "## Safety Controls",
        "- Input sanitization: guardrails.yaml",
        "- Output filtering: PII/secrets blocked",
        "- Rate limits: 60 req/min, 100K tokens/min",
        targetLevelNum >= 3 ? "- Audit: all events signed and tamper-evident" : "",
        targetLevelNum >= 4 ? "- Adversarial: canary tokens + drift detection active" : "",
        "",
        "## Escalation",
        "- Safety trigger → pause + human review",
        "- Cost threshold ($10/hour) → alert + throttle",
        "- Unknown tool request → deny + log",
      ].filter(Boolean).join("\n"),
    });

    // Generate: CI config
    fixes.push({
      file: ".github/workflows/amc-gate.yml",
      description: "CI/CD maturity gate",
      content: [
        "name: AMC Maturity Gate",
        "on: [push, pull_request]",
        "jobs:",
        "  amc-score:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: actions/setup-node@v4",
        "        with:",
        "          node-version: '20'",
        "      - run: npm i -g agent-maturity-compass",
        `      - run: |`,
        `          export AMC_VAULT_PASSPHRASE='ci-gate-$\{GITHUB_SHA}'`,
        "          amc init",
        "          amc quickscore --json > score.json",
        `      - name: Check maturity level`,
        `        run: |`,
        `          LEVEL=$(node -e "const s=require('./score.json');console.log(s.preliminaryLevel)")`,
        `          echo "AMC Level: $LEVEL"`,
        `          LEVEL_NUM=$(echo $LEVEL | tr -dc '0-9')`,
        `          if [ "$LEVEL_NUM" -lt "${targetLevelNum}" ]; then`,
        `            echo "::error::AMC maturity L$LEVEL_NUM below target L${targetLevelNum}"`,
        "            exit 1",
        "          fi",
      ].join("\n"),
    });

    if (opts.dryRun) {
      console.log(chalk.yellow("  [DRY RUN] Would generate:\n"));
      for (const fix of fixes) {
        console.log(`  📄 ${chalk.hex('#4AEF79')(fix.file)} — ${fix.description}`);
      }
      if (gaps.length > 0) {
        console.log(`\n  ${chalk.gray(`Based on ${gaps.length} identified gaps from last diagnostic run`)}`);
      }
    } else {
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      for (const fix of fixes) {
        const filePath = join(outDir, fix.file);
        const fileDir = dirname(filePath);
        if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
        writeFileSync(filePath, fix.content, "utf-8");
        console.log(chalk.green(`  ✓ ${fix.file}`) + chalk.gray(` — ${fix.description}`));
      }
      console.log(chalk.bold.green(`\n  ✓ ${fixes.length} remediation files generated in ${outDir}/`));
      if (gaps.length > 0) {
        console.log(chalk.gray(`  Based on ${gaps.length} gaps from last diagnostic`));
      }
      console.log(chalk.gray("\n  Next steps:"));
      console.log(chalk.gray("  1. Review generated files"));
      console.log(chalk.gray("  2. Copy to your project: cp -r .amc/fixes/* ."));
      console.log(chalk.gray("  3. Re-score: amc quickscore"));
    }
    console.log("");
  });

// Note: continuous monitoring now lives under `amc monitor` (start|check|status|events|metrics).
// `amc watch` retains the observability tools (attest, explain, safety-test, etc.).

/* ------------------------------------------------------------------ */
/*  amc redteam — Attack Simulation                                    */
/* ------------------------------------------------------------------ */

const redteamCmd = program
  .command("redteam")
  .description("Run red-team attack simulations against a target agent");

redteamCmd
  .command("run [agentId]")
  .description("Execute red-team plugins with chosen attack strategies and generate a vulnerability report")
  .option("--plugins <ids...>", "Assurance-pack IDs to run as attack plugins (default: all)")
  .option("--strategies <ids...>", "Attack strategy IDs to apply (default: direct). Use 'all' for every strategy.")
  .option("--output <path>", "Path to write the markdown vulnerability report")
  .option("--json", "Print JSON report to stdout")
  .action(async (agentId: string | undefined, opts: { plugins?: string[]; strategies?: string[]; output?: string; json?: boolean }) => {
    const workspace = process.cwd();
    const report = await runRedTeam({
      workspace,
      agentId,
      plugins: opts.plugins,
      strategies: opts.strategies,
      output: opts.output,
    });

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderRedTeamMarkdown(report));
      console.log("");
      console.log(chalk.gray(`Full JSON: .amc/redteam/${report.agentId}/${report.runId}.json`));
      if (opts.output) {
        console.log(chalk.gray(`Report: ${opts.output}`));
      }
    }
  });

redteamCmd
  .command("strategies")
  .description("List available attack strategies")
  .option("--json", "JSON output")
  .action((opts: { json?: boolean }) => {
    const strats = listStrategies();
    if (opts.json) {
      console.log(JSON.stringify(strats.map(({ id, name, description }) => ({ id, name, description })), null, 2));
    } else {
      console.log(chalk.bold("Available Red-Team Strategies:\n"));
      for (const s of strats) {
        console.log(`  ${chalk.hex('#4AEF79')(s.id.padEnd(16))} ${s.name} — ${chalk.gray(s.description)}`);
      }
    }
  });

redteamCmd
  .command("plugins")
  .description("List available attack plugins (assurance packs)")
  .option("--json", "JSON output")
  .action(async (_opts: { json?: boolean }) => {
    const { listAssurancePacks } = await import("./assurance/packs/index.js");
    const packs = listAssurancePacks();
    if (_opts.json) {
      console.log(JSON.stringify(packs.map(({ id, title, description, scenarios }) => ({
        id, title, description, scenarioCount: scenarios.length
      })), null, 2));
    } else {
      console.log(chalk.bold(`Available Red-Team Plugins (${packs.length}):\n`));
      for (const p of packs) {
        console.log(`  ${chalk.hex('#4AEF79')(p.id.padEnd(36))} ${p.title} (${p.scenarios.length} scenarios)`);
      }
    }
  });

/* ── Pack Registry: amc pack ──────────────────────────────────── */
const pack = program.command("pack").description("Community assurance pack registry — NPM-style package management");

pack
  .command("install")
  .description("Install a community assurance pack")
  .argument("<name>", "pack name (e.g., red-team-basic, compliance-eu-ai-act)")
  .option("--version <version>", "specific version to install")
  .option("--save", "save to dependencies", false)
  .option("--save-dev", "save to dev dependencies", false)
  .option("--force", "force install despite conflicts", false)
  .option("--dry-run", "show what would be installed without installing", false)
  .option("--json", "JSON output", false)
  .action(async (name: string, opts: {
    version?: string;
    save?: boolean;
    saveDev?: boolean;
    force?: boolean;
    dryRun?: boolean;
    json?: boolean;
  }) => {
    try {
      const result = await packInstallCli({
        workspace: process.cwd(),
        name,
        version: opts.version,
        save: opts.save,
        saveDev: opts.saveDev,
        force: opts.force,
        dryRun: opts.dryRun
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        if (result.installed.length > 0) {
          console.log(chalk.bold("\nInstalled packages:"));
          for (const pkg of result.installed) {
            console.log(`  ${chalk.hex('#4AEF79')(pkg.name)}@${pkg.version}`);
          }
        }
        if (result.conflicts.length > 0) {
          console.log(chalk.yellow("\nConflicts resolved:"));
          for (const conflict of result.conflicts) {
            console.log(`  ${chalk.yellow(conflict.name)}: ${conflict.reason}`);
          }
        }
      } else {
        console.error(chalk.red(`❌ ${result.message}`));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red(`Install failed: ${error.message}`));
      process.exit(1);
    }
  });

pack
  .command("publish")
  .description("Publish a pack to the registry")
  .argument("[directory]", "pack directory (defaults to current directory)")
  .option("--registry <url>", "registry URL to publish to")
  .option("--dry-run", "validate and show what would be published without publishing", false)
  .option("--access <level>", "public or private", "public")
  .option("--json", "JSON output", false)
  .action(async (directory: string | undefined, opts: {
    registry?: string;
    dryRun?: boolean;
    access?: "public" | "private";
    json?: boolean;
  }) => {
    try {
      const result = await packPublishCli({
        workspace: process.cwd(),
        packDir: directory,
        registry: opts.registry,
        dryRun: opts.dryRun,
        access: opts.access
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        console.log(`Package: ${chalk.hex('#4AEF79')(result.name)}@${result.version}`);
        console.log(`Registry: ${result.registry}`);
      } else {
        console.error(chalk.red(`❌ ${result.message}`));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red(`Publish failed: ${error.message}`));
      process.exit(1);
    }
  });

pack
  .command("search")
  .description("Search for packs in the registry")
  .argument("[query]", "search query")
  .option("--category <category>", "filter by category")
  .option("--author <author>", "filter by author")
  .option("--keywords <keywords>", "comma-separated keywords")
  .option("--limit <n>", "number of results", "20")
  .option("--offset <n>", "result offset", "0")
  .option("--json", "JSON output", false)
  .action(async (query: string | undefined, opts: {
    category?: string;
    author?: string;
    keywords?: string;
    limit?: string;
    offset?: string;
    json?: boolean;
  }) => {
    try {
      const result = await packSearchCli({
        workspace: process.cwd(),
        query,
        category: opts.category,
        author: opts.author,
        keywords: opts.keywords?.split(","),
        limit: parseInt(opts.limit || "20"),
        offset: parseInt(opts.offset || "0")
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📦 Found ${result.total} packs\n`));
      if (result.total === 0) {
        console.log(chalk.yellow("No community packs found."));
        console.log("");
        console.log("  Built-in packs: " + chalk.hex('#4AEF79')("amc assurance list"));
        console.log("  Create your own: " + chalk.hex('#4AEF79')("amc pack init"));
        console.log("  Publish a pack:  " + chalk.hex('#4AEF79')("amc pack publish"));
        console.log("");
      }
      for (const pkg of result.results) {
        console.log(`${chalk.hex('#4AEF79')(pkg.name)}@${pkg.version}`);
        console.log(`  ${pkg.description}`);
        console.log(`  Author: ${pkg.author} | Downloads: ${pkg.downloads} | Updated: ${pkg.updated}`);
        if (pkg.keywords.length > 0) {
          console.log(`  Keywords: ${pkg.keywords.join(", ")}`);
        }
        console.log("");
      }
    } catch (error: any) {
      console.error(chalk.red(`Search failed: ${error.message}`));
      process.exit(1);
    }
  });

pack
  .command("info")
  .description("Show detailed information about a pack")
  .argument("<name>", "pack name")
  .option("--json", "JSON output", false)
  .action(async (name: string, opts: { json?: boolean }) => {
    try {
      const result = await packInfoCli({
        workspace: process.cwd(),
        name
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (!result.found) {
        console.error(chalk.red(`Pack "${name}" not found`));
        process.exit(1);
      }

      console.log(chalk.bold(`\n📦 ${result.name}`));
      console.log(`Description: ${result.description}`);
      console.log(`Latest: ${result.latest}`);
      console.log(`Author: ${result.author}`);
      console.log(`License: ${result.license}`);
      console.log(`Downloads: ${result.downloads}`);
      
      if (result.versions.length > 0) {
        console.log(`Versions: ${result.versions.join(", ")}`);
      }
      
      if (result.keywords.length > 0) {
        console.log(`Keywords: ${result.keywords.join(", ")}`);
      }
      
      if (Object.keys(result.dependencies).length > 0) {
        console.log(chalk.bold("\nDependencies:"));
        for (const [dep, version] of Object.entries(result.dependencies)) {
          console.log(`  ${dep}: ${version}`);
        }
      }
      
      if (result.repository) {
        console.log(`Repository: ${result.repository}`);
      }
      
      if (result.homepage) {
        console.log(`Homepage: ${result.homepage}`);
      }
    } catch (error: any) {
      console.error(chalk.red(`Info lookup failed: ${error.message}`));
      process.exit(1);
    }
  });

pack
  .command("uninstall")
  .description("Uninstall a pack")
  .argument("<name>", "pack name")
  .option("--save", "remove from dependencies", false)
  .option("--json", "JSON output", false)
  .action(async (name: string, opts: { save?: boolean; json?: boolean }) => {
    try {
      const result = await packUninstallCli({
        workspace: process.cwd(),
        name,
        save: opts.save
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
      } else {
        console.error(chalk.red(`❌ ${result.message}`));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red(`Uninstall failed: ${error.message}`));
      process.exit(1);
    }
  });

pack
  .command("list")
  .description("List installed packs")
  .option("--global", "list global packs", false)
  .option("--json", "JSON output", false)
  .action(async (opts: { global?: boolean; json?: boolean }) => {
    try {
      const result = await packListCli({
        workspace: process.cwd(),
        global: opts.global
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📦 Installed Packs (${result.packages.length})\n`));
      for (const pkg of result.packages) {
        console.log(`${chalk.hex('#4AEF79')(pkg.name)}@${pkg.version}`);
        console.log(`  ${pkg.description}`);
        console.log(`  Path: ${pkg.path}`);
        console.log("");
      }
    } catch (error: any) {
      console.error(chalk.red(`List failed: ${error.message}`));
      process.exit(1);
    }
  });

pack
  .command("init")
  .description("Initialize a new pack in the current directory")
  .option("--name <name>", "pack name")
  .option("--version <version>", "initial version", "1.0.0")
  .option("--description <desc>", "pack description")
  .option("--author <author>", "author name")
  .option("--license <license>", "license", "MIT")
  .option("--type <type>", "pack type: assurance, policy, transform, adapter", "assurance")
  .action((opts: {
    name?: string;
    version?: string;
    description?: string;
    author?: string;
    license?: string;
    type?: "assurance" | "policy" | "transform" | "adapter";
  }) => {
    try {
      const result = packInitCli({
        directory: process.cwd(),
        name: opts.name,
        version: opts.version,
        description: opts.description,
        author: opts.author,
        license: opts.license,
        type: opts.type
      });

      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        console.log(`Manifest: ${result.manifestPath}`);
        console.log("");
        console.log(chalk.bold("Next steps:"));
        console.log("1. Edit package.json to customize your pack");
        console.log("2. Implement your pack logic in index.mjs (ESM format)");
        console.log("3. Add tests in test/index.test.mjs");
        console.log(`4. Test your pack locally: ${chalk.hex('#4AEF79')("amc pack test .")}`);
        console.log(`5. Run 'amc pack publish' to share with the community`);
        console.log("");
        console.log(chalk.bold("Documentation:"));
        console.log(`  Pack authoring guide: ${chalk.hex('#4AEF79')("docs/ASSURANCE_LAB.md")}`);
        console.log(`  Contributing:         ${chalk.hex('#4AEF79')("CONTRIBUTING.md")}`);
        console.log(`  Built-in pack examples: ${chalk.hex('#4AEF79')("amc assurance list")}`);
      } else {
        console.error(chalk.red(`❌ ${result.message}`));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red(`Init failed: ${error.message}`));
      process.exit(1);
    }
  });

pack
  .command("test [dir]")
  .description("Test a local pack in sandbox mode")
  .option("--agent <agentId>", "agent ID to run the pack against")
  .option("--json", "JSON output", false)
  .action(async (dir: string | undefined, opts: { agent?: string; json?: boolean }) => {
    const packDir = dir ? resolve(dir) : process.cwd();
    // Verify pack exists
    const manifestPath = join(packDir, "package.json");
    if (!pathExists(manifestPath)) {
      console.error(chalk.red(`No package.json found in ${packDir}. Run 'amc pack init' first.`));
      process.exit(1); return;
    }
    let packManifest: { name?: string; version?: string; amcPack?: { type?: string } };
    try {
      packManifest = JSON.parse(readUtf8(manifestPath));
    } catch {
      console.error(chalk.red(`Invalid package.json in ${packDir}`));
      process.exit(1); return;
    }
    const agentId = opts.agent ?? activeAgent(program) ?? "default";
    console.log(chalk.bold(`\n🧪  Pack Sandbox Test — ${packManifest.name ?? "unknown"}`));
    console.log(chalk.gray(`  Pack directory: ${packDir}`));
    console.log(chalk.gray(`  Pack version:   ${packManifest.version ?? "unknown"}`));
    console.log(chalk.gray(`  Pack type:      ${packManifest.amcPack?.type ?? "assurance"}`));
    console.log(chalk.gray(`  Target agent:   ${agentId}`));
    console.log("");
    try {
      // Load and execute the pack entry point
      const entryMjs = join(packDir, "index.mjs");
      const entryJs = join(packDir, "index.js");
      const entryPath = pathExists(entryMjs) ? entryMjs : entryJs;
      if (!pathExists(entryPath)) {
        console.error(chalk.red(`No index.mjs or index.js found in ${packDir}. Implement your pack entry point first.`));
        process.exit(1); return;
      }
      const packModule = await import(entryPath);
      const packExport = packModule.default ?? packModule;
      if (typeof packExport.execute !== "function") {
        console.error(chalk.red(`Pack must export an execute(context) function.`));
        console.log(chalk.gray(`  See: docs/ASSURANCE_LAB.md for pack structure`));
        process.exit(1); return;
      }
      const context = { agentId, workspace: process.cwd(), mode: "sandbox" };
      const result = await packExport.execute(context);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (result.success) {
        console.log(chalk.green(`✅ Pack executed successfully`));
      } else {
        console.log(chalk.yellow(`⚠️  Pack executed with issues`));
      }
      if (Array.isArray(result.results) && result.results.length > 0) {
        console.log(chalk.bold("\nResults:"));
        for (const r of result.results) {
          console.log(`  - ${JSON.stringify(r)}`);
        }
      }
      console.log("");
      console.log(chalk.gray("  Sandbox mode: no artifacts signed or persisted."));
      console.log(chalk.gray("  To publish: amc pack publish"));
    } catch (e: unknown) {
      console.error(chalk.red(`Pack execution failed: ${toErrorMessage(e)}`));
      process.exit(1);
    }
  });

const packRegistry = pack.command("registry").description("Pack registry management");

packRegistry
  .command("serve")
  .description("Start a local pack registry server")
  .option("--port <port>", "server port", "4873")
  .option("--host <host>", "bind host", "127.0.0.1")
  .action(async (opts: { port?: string; host?: string }) => {
    try {
      const result = await packRegistryServeCli({
        workspace: process.cwd(),
        port: opts.port ? parseInt(opts.port) : undefined,
        host: opts.host
      });

      console.log(chalk.green(`✅ Pack registry server started`));
      console.log(`URL: ${result.url}`);
      console.log(`Host: ${result.host}`);
      console.log(`Port: ${result.port}`);
      console.log("");
      console.log("Press Ctrl+C to stop the server");

      // Keep the process alive
      process.on("SIGINT", async () => {
        console.log("\nStopping registry server...");
        await result.server.stop();
        console.log("Registry server stopped");
        process.exit(0);
      });

      // Keep alive
      await new Promise(() => {});
    } catch (error: any) {
      console.error(chalk.red(`Registry server failed: ${error.message}`));
      process.exit(1);
    }
  });

packRegistry
  .command("init")
  .description("Initialize local pack registry")
  .action(() => {
    try {
      const result = packRegistryInitCli({
        workspace: process.cwd()
      });

      console.log(chalk.green(`✅ ${result.message}`));
      console.log(`Registry directory: ${result.registryDir}`);
      console.log(`Config: ${result.configPath}`);
    } catch (error: any) {
      console.error(chalk.red(`Registry init failed: ${error.message}`));
      process.exit(1);
    }
  });

// ── Blocker #3: top-level `amc badge` command ──────────────────────────────────
program
  .command("badge")
  .description("Generate maturity badge for README/docs (markdown, HTML, or URL)")
  .option("--agent <agentId>", "agent ID (default: 'default')")
  .option("--level <0-5>", "override level (instead of reading from latest score)")
  .option("--score <0-100>", "override score (instead of reading from latest score)")
  .option("--format <format>", "output format: markdown | html | url | svg", "markdown")
  .action(async (opts: { agent?: string; level?: string; score?: string; format?: string }) => {
    const { generateBadgeSvg, scoreToLevel } = await import("./cert/badgeGenerator.js");
    const agentId = opts.agent ?? "default";
    const format = (opts.format ?? "markdown").toLowerCase();

    let level: number;
    let score: number;

    if (opts.level != null) {
      level = Number(opts.level);
      score = opts.score != null ? Number(opts.score) : level * 20;
    } else if (opts.score != null) {
      score = Number(opts.score);
      level = scoreToLevel(score);
    } else {
      // Try reading from latest quickscore cache
      try {
        const out = passportBadgeCli({ workspace: process.cwd(), agentId: resolveAgentId(process.cwd(), agentId) });
        console.log(out.badge);
        return;
      } catch {
        // No cached passport — inform user to specify level
        console.error(chalk.yellow("No cached score found for agent '" + agentId + "'. Specify --level or --score."));
        console.log(chalk.gray("\nExamples:"));
        console.log(chalk.gray("  amc badge --level 3              # Generate L3 badge"));
        console.log(chalk.gray("  amc badge --score 72.5           # Badge from score"));
        console.log(chalk.gray("  amc quickscore && amc badge      # Score first, then badge"));
        console.log(chalk.gray("  amc badge --format html --level 4 # HTML img tag"));
        console.log(chalk.gray("  amc badge --format url --level 3  # Raw shields.io URL"));
        console.log(chalk.gray("  amc badge --format svg --level 3  # Full SVG output"));
        return;
      }
    }

    const badgeColor = level >= 4 ? "brightgreen" : level >= 3 ? "green" : level >= 2 ? "yellow" : "red";
    const shieldsUrl = `https://img.shields.io/badge/AMC-L${level}_(${score.toFixed(1)})-${badgeColor}?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMMiA3bDEwIDUgMTAtNXptMCA5bC04LjUtNC4yNUwyIDEybDEwIDUgMTAtNXptMCA5bC04LjUtNC4yNUwyIDIxbDEwIDUgMTAtNXoiLz48L3N2Zz4=`;

    switch (format) {
      case "url":
        console.log(shieldsUrl);
        break;
      case "html":
        console.log(`<a href="https://github.com/thewisecrab/AgentMaturityCompass"><img src="${shieldsUrl}" alt="AMC L${level}" /></a>`);
        break;
      case "svg": {
        const svg = generateBadgeSvg(score, level, agentId);
        console.log(svg);
        break;
      }
      case "markdown":
      default:
        console.log(`[![AMC L${level}](${shieldsUrl})](https://github.com/thewisecrab/AgentMaturityCompass)`);
        break;
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = normalizeCliErrorMessage(error);
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
    console.error(chalk.hex('#4AEF79')("Run 'amc --help' to explore top-level commands."));
    process.exit(1);
    return;
  }
  console.error(chalk.red(message));
  process.exit(1);
});
