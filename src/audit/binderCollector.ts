import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadApprovalPolicy, verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { loadAssurancePolicy, verifyAssurancePolicySignature } from "../assurance/assurancePolicyStore.js";
import { latestAssuranceCertificateSummary, latestAssuranceRun } from "../assurance/assuranceStore.js";
import { verifyAdaptersConfigSignature } from "../adapters/adapterConfigStore.js";
import { verifyBenchRegistriesSignature } from "../bench/benchPolicyStore.js";
import { verifyBridgeConfigSignature } from "../bridge/bridgeConfigStore.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import { canonPath } from "../canon/canonLoader.js";
import { cgxLatestGraphPath, cgxLatestPackPath } from "../cgx/cgxStore.js";
import { diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { loadRunReport } from "../diagnostic/runner.js";
import { resolveAgentId } from "../fleet/paths.js";
import { verifyLedgerIntegrity, openLedger } from "../ledger/ledger.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { loadMechanicTuning } from "../mechanic/tuningStore.js";
import { loadOpsPolicy, opsPolicyPath, verifyOpsPolicySignature } from "../ops/policy.js";
import { retentionStatusCli } from "../ops/retention/retentionCli.js";
import { findNodeScorecard, loadLatestOrgScorecard } from "../org/orgScorecard.js";
import { verifyPluginWorkspace } from "../plugins/pluginApi.js";
import { promptPolicyPath, verifyPromptPolicySignature } from "../prompt/promptPolicyStore.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { checkNotaryTrust, loadTrustConfig, trustConfigPath, verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { currentTransparencyMerkleRoot, verifyTransparencyMerkle } from "../transparency/merkleIndexStore.js";
import { readTransparencyEntries, transparencySealPath, verifyTransparencyLog } from "../transparency/logChain.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { parseWindowToMs } from "../utils/time.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { getWorkspaceRecord } from "../workspaces/hostDb.js";
import { verifyIdentityConfigSignature } from "../identity/identityConfig.js";
import { auditFamilyResultSchema, type AuditFamilyResult, type AuditMapFile } from "./auditMapSchema.js";
import { type AuditPolicy } from "./auditPolicySchema.js";
import { hashAuditId } from "./binderRedaction.js";
import { binderJsonSchema, type AuditBinderJson } from "./binderSchema.js";
import { type EvidenceRequest } from "./evidenceRequestSchema.js";
import { assertNotExample } from "../claims/eligibility/exampleMode.js";
import { binderConformanceRun } from "../domains/conformance/conformanceExport.js";

interface ScopeInput {
  type: "WORKSPACE" | "NODE" | "AGENT";
  id: string;
}

interface FactResult {
  status: "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";
  reason: string;
  refs: string[];
}

interface FactCatalog {
  identityYamlSignedAndValid: FactResult;
  hasSsoLoginsLast30d: FactResult;
  hasScimWritesLast30d: FactResult;
  workspaceMembershipsConfigured: FactResult;
  hasApprovalDecisionsLast30d: FactResult;
  leasesIncludeWorkspaceClaim: FactResult;
  leaseScopeDenialsTracked: FactResult;
  approvalPolicySigned: FactResult;
  opsPolicySigned: FactResult;
  policyChangesSigned: FactResult;
  changeEventsObserved: FactResult;
  transformPlansSigned: FactResult;
  releaseManifestSigned: FactResult;
  transparencySealValid: FactResult;
  merkleRootValid: FactResult;
  ledgerHashChainValid: FactResult;
  sseOrgEventsObserved: FactResult;
  trustConfigSigned: FactResult;
  toolsPolicySigned: FactResult;
  budgetsPolicySigned: FactResult;
  pluginsIntegrityValid: FactResult;
  releaseBundlesVerified: FactResult;
  backupManifestSigned: FactResult;
  registryAllowlistSigned: FactResult;
  assuranceRecentRun: FactResult;
  advisoryFlowActive: FactResult;
  freezeEventsTracked: FactResult;
  retentionStatusHealthy: FactResult;
  assurancePolicySigned: FactResult;
  assuranceCertificateFresh: FactResult;
  assuranceScoreAboveThreshold: FactResult;
  assuranceThresholdBreachAbsent: FactResult;
  promptPolicySigned: FactResult;
  truthguardValidationObserved: FactResult;
  noSecretLeakAudit: FactResult;
  blobEncryptionEnabled: FactResult;
  bridgeConfigSigned: FactResult;
  adapterConfigSigned: FactResult;
  providerAllowlistEnforced: FactResult;
  toolDenialsObserved: FactResult;
}

interface BinderCollectResult {
  binder: AuditBinderJson;
  includedEventKinds: string[];
  calculationManifest: Record<string, unknown>;
  sourceEventHashes: string[];
  conformanceRun: ReturnType<typeof binderConformanceRun>["run"];
}

function dedupeSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function truncateHash(input: string, bytes: number): string {
  return hashAuditId(input, bytes);
}

function fileSha(path: string): string {
  if (!pathExists(path)) {
    return "0".repeat(64);
  }
  return sha256Hex(readFileSync(path));
}

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function parseAuditType(meta: Record<string, unknown>, payloadInline: string | null): string | null {
  const fromMeta = typeof meta.auditType === "string" ? meta.auditType : null;
  if (fromMeta) {
    return fromMeta;
  }
  if (!payloadInline) {
    return null;
  }
  try {
    const parsed = JSON.parse(payloadInline) as Record<string, unknown>;
    return typeof parsed.auditType === "string" ? parsed.auditType : null;
  } catch {
    return null;
  }
}

function statusFromBoolean(ok: boolean, passReason: string, failReason: string, refs: string[]): FactResult {
  return {
    status: ok ? "PASS" : "FAIL",
    reason: ok ? passReason : failReason,
    refs: dedupeSorted(refs)
  };
}

function insufficient(reason: string, refs: string[] = []): FactResult {
  return {
    status: "INSUFFICIENT_EVIDENCE",
    reason,
    refs: dedupeSorted(refs)
  };
}

function trustLabelFromSignals(params: {
  integrityIndex: number;
  correlationRatio: number;
  observedShare: number;
}): "LOW" | "MEDIUM" | "HIGH" {
  if (params.integrityIndex >= 0.9 && params.correlationRatio >= 0.9 && params.observedShare >= 0.7) {
    return "HIGH";
  }
  if (params.integrityIndex >= 0.75 && params.correlationRatio >= 0.75 && params.observedShare >= 0.5) {
    return "MEDIUM";
  }
  return "LOW";
}

function mapRunTrustLabel(input: string): "LOW" | "MEDIUM" | "HIGH" {
  const text = input.toUpperCase();
  if (text.includes("HIGH")) {
    return "HIGH";
  }
  if (text.includes("LOW") || text.includes("UNRELIABLE") || text.includes("UNTRUSTED")) {
    return "LOW";
  }
  return "MEDIUM";
}

function findLatestAgentRunId(workspace: string, agentId: string): string | null {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  if (!pathExists(runsDir)) {
    return null;
  }
  const files = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) return null;
  return files[files.length - 1]!.replace(/\.json$/, "");
}

function byDimensionFromRun(run: ReturnType<typeof loadRunReport>): {
  DIM1: number | null;
  DIM2: number | null;
  DIM3: number | null;
  DIM4: number | null;
  DIM5: number | null;
} {
  const out = {
    DIM1: null as number | null,
    DIM2: null as number | null,
    DIM3: null as number | null,
    DIM4: null as number | null,
    DIM5: null as number | null
  };
  for (const layer of run.layerScores) {
    if (layer.layerName === "Strategic Agent Operations") {
      out.DIM1 = Number(layer.avgFinalLevel.toFixed(6));
    } else if (layer.layerName === "Leadership & Autonomy") {
      out.DIM2 = Number(layer.avgFinalLevel.toFixed(6));
    } else if (layer.layerName === "Culture & Alignment") {
      out.DIM3 = Number(layer.avgFinalLevel.toFixed(6));
    } else if (layer.layerName === "Resilience") {
      out.DIM4 = Number(layer.avgFinalLevel.toFixed(6));
    } else if (layer.layerName === "Skills") {
      out.DIM5 = Number(layer.avgFinalLevel.toFixed(6));
    }
  }
  return out;
}

function byDimensionFromOrgNode(node: NonNullable<ReturnType<typeof loadLatestOrgScorecard>>["nodes"][number]): {
  DIM1: number | null;
  DIM2: number | null;
  DIM3: number | null;
  DIM4: number | null;
  DIM5: number | null;
} {
  const out = {
    DIM1: null as number | null,
    DIM2: null as number | null,
    DIM3: null as number | null,
    DIM4: null as number | null,
    DIM5: null as number | null
  };
  for (const layer of node.layerScores) {
    if (layer.layerName === "Strategic Agent Operations") {
      out.DIM1 = Number(layer.median.toFixed(6));
    } else if (layer.layerName === "Leadership & Autonomy") {
      out.DIM2 = Number(layer.median.toFixed(6));
    } else if (layer.layerName === "Culture & Alignment") {
      out.DIM3 = Number(layer.median.toFixed(6));
    } else if (layer.layerName === "Resilience") {
      out.DIM4 = Number(layer.median.toFixed(6));
    } else if (layer.layerName === "Skills") {
      out.DIM5 = Number(layer.median.toFixed(6));
    }
  }
  return out;
}

function inferHostDir(workspace: string): string | null {
  const direct = workspace;
  if (pathExists(join(direct, "identity", "identity.yaml"))) {
    return direct;
  }
  const amcHost = join(workspace, ".amc");
  if (pathExists(join(amcHost, "identity", "identity.yaml"))) {
    return amcHost;
  }
  const candidate = resolve(workspace, "..", "..");
  if (pathExists(join(candidate, "workspaces")) && pathExists(join(candidate, "host.db"))) {
    return candidate;
  }
  return null;
}

function mapEvidenceKinds(params: {
  eventsByType: Map<string, string[]>;
  facts: FactCatalog;
}): Record<string, { ok: boolean; refs: string[] }> {
  const out: Record<string, { ok: boolean; refs: string[] }> = {};
  const byType = params.eventsByType;
  const add = (kind: string, ok: boolean, refs: string[]) => {
    out[kind] = {
      ok,
      refs: dedupeSorted(refs)
    };
  };
  const hasType = (type: string): { ok: boolean; refs: string[] } => {
    const refs = byType.get(type) ?? [];
    return {
      ok: refs.length > 0,
      refs
    };
  };

  const identity = params.facts.identityYamlSignedAndValid;
  add("IDENTITY_CONFIG_SIGNED", identity.status === "PASS", identity.refs);
  const sso = params.facts.hasSsoLoginsLast30d;
  add("SSO_LOGIN_EVENT", sso.status === "PASS", sso.refs);
  const scim = params.facts.hasScimWritesLast30d;
  add("SCIM_USER_PROVISIONED", scim.status === "PASS", scim.refs);
  const rbac = params.facts.workspaceMembershipsConfigured;
  add("RBAC_MEMBERSHIP_EVENT", rbac.status === "PASS", rbac.refs);
  add("SESSION_AUTH", (hasType("HUMAN_LOGIN_SUCCESS").ok || sso.status === "PASS"), [...(hasType("HUMAN_LOGIN_SUCCESS").refs), ...sso.refs]);

  const leaseScope = params.facts.leasesIncludeWorkspaceClaim;
  add("LEASE_ISSUED", leaseScope.status === "PASS", leaseScope.refs);
  const leaseGuard = params.facts.leaseScopeDenialsTracked;
  add("LEASE_SCOPE_ENFORCED", leaseGuard.status !== "FAIL", leaseGuard.refs);

  const approvalPolicy = params.facts.approvalPolicySigned;
  add("APPROVAL_POLICY_SIGNED", approvalPolicy.status === "PASS", approvalPolicy.refs);
  const approvalDecisions = hasType("APPROVAL_DECIDED");
  add("APPROVAL_DECIDED", approvalDecisions.ok, approvalDecisions.refs);
  add("WORK_ORDER", hasType("WORK_ORDER_CREATED").ok, hasType("WORK_ORDER_CREATED").refs);

  add("POLICY_APPLIED", hasType("POLICY_APPLIED").ok, hasType("POLICY_APPLIED").refs);
  add("SIGNED_CONFIG", params.facts.policyChangesSigned.status === "PASS", params.facts.policyChangesSigned.refs);

  add("TRANSFORM_PLAN_CREATED", hasType("TRANSFORM_PLAN_CREATED").ok, hasType("TRANSFORM_PLAN_CREATED").refs);
  add("TRANSFORM_TASK_ATTESTED", hasType("TRANSFORM_TASK_ATTESTED").ok, hasType("TRANSFORM_TASK_ATTESTED").refs);
  add("RELEASE_MANIFEST", hasType("RELEASE_MANIFEST").ok, hasType("RELEASE_MANIFEST").refs);
  add("RELEASE_BUNDLE_VERIFIED", hasType("RELEASE_BUNDLE_VERIFIED").ok, hasType("RELEASE_BUNDLE_VERIFIED").refs);
  add("TRANSPARENCY_ROOT", hasType("TRANSPARENCY_ROOT").ok, hasType("TRANSPARENCY_ROOT").refs);
  add("MERKLE_ROOT", hasType("MERKLE_ROOT").ok, hasType("MERKLE_ROOT").refs);
  add("EVIDENCE_HASH_CHAIN", params.facts.ledgerHashChainValid.status === "PASS", params.facts.ledgerHashChainValid.refs);
  add("SSE_EVENT", hasType("ORG_SCORECARD_UPDATED").ok || hasType("FORECAST_UPDATED").ok, [...hasType("ORG_SCORECARD_UPDATED").refs, ...hasType("FORECAST_UPDATED").refs]);

  add("OPS_POLICY", params.facts.opsPolicySigned.status === "PASS", params.facts.opsPolicySigned.refs);
  add("TRUST_CONFIG", params.facts.trustConfigSigned.status === "PASS", params.facts.trustConfigSigned.refs);
  add("TOOLS_POLICY_SIGNED", params.facts.toolsPolicySigned.status === "PASS", params.facts.toolsPolicySigned.refs);
  add("BUDGETS_POLICY_SIGNED", params.facts.budgetsPolicySigned.status === "PASS", params.facts.budgetsPolicySigned.refs);
  add("PLUGIN_INSTALLED", hasType("PLUGIN_INSTALLED").ok, hasType("PLUGIN_INSTALLED").refs);
  add("INSTALLED_LOCK", params.facts.pluginsIntegrityValid.status === "PASS", params.facts.pluginsIntegrityValid.refs);
  add("BACKUP_MANIFEST", hasType("BACKUP_CREATED").ok, hasType("BACKUP_CREATED").refs);
  add("REGISTRY_ALLOWLIST", params.facts.registryAllowlistSigned.status === "PASS", params.facts.registryAllowlistSigned.refs);

  add("ASSURANCE_RUN_COMPLETED", hasType("ASSURANCE_RUN_COMPLETED").ok, hasType("ASSURANCE_RUN_COMPLETED").refs);
  add("ADVISORY_CREATED", hasType("ADVISORY_CREATED").ok, hasType("ADVISORY_CREATED").refs);
  add("ADVISORY_ACKNOWLEDGED", hasType("ADVISORY_ACKNOWLEDGED").ok, hasType("ADVISORY_ACKNOWLEDGED").refs);
  add("FREEZE_CHANGED", hasType("FREEZE_CHANGED").ok, hasType("FREEZE_CHANGED").refs);
  add("RETENTION_RUN", hasType("RETENTION_COMPLETED").ok || hasType("RETENTION_DRY_RUN").ok, [...hasType("RETENTION_COMPLETED").refs, ...hasType("RETENTION_DRY_RUN").refs]);

  add("ASSURANCE_POLICY_APPLIED", params.facts.assurancePolicySigned.status === "PASS", params.facts.assurancePolicySigned.refs);
  add("ASSURANCE_CERT_ISSUED", hasType("ASSURANCE_CERT_ISSUED").ok, hasType("ASSURANCE_CERT_ISSUED").refs);
  add("ASSURANCE_SCORE", params.facts.assuranceScoreAboveThreshold.status !== "INSUFFICIENT_EVIDENCE", params.facts.assuranceScoreAboveThreshold.refs);
  add("ASSURANCE_THRESHOLD_BREACH", hasType("ASSURANCE_THRESHOLD_BREACH").ok, hasType("ASSURANCE_THRESHOLD_BREACH").refs);

  add("REDACTION_POLICY", params.facts.promptPolicySigned.status === "PASS", params.facts.promptPolicySigned.refs);
  add("OUTPUT_VALIDATED", params.facts.truthguardValidationObserved.status === "PASS", params.facts.truthguardValidationObserved.refs);
  add("SECRET_SCAN", params.facts.noSecretLeakAudit.status === "PASS", params.facts.noSecretLeakAudit.refs);
  add("BLOB_ENCRYPTION", params.facts.blobEncryptionEnabled.status === "PASS", params.facts.blobEncryptionEnabled.refs);

  add("BRIDGE_POLICY", params.facts.bridgeConfigSigned.status === "PASS", params.facts.bridgeConfigSigned.refs);
  add("ADAPTERS_CONFIG_SIGNED", params.facts.adapterConfigSigned.status === "PASS", params.facts.adapterConfigSigned.refs);
  add("TOOL_DENIED", params.facts.toolDenialsObserved.status !== "INSUFFICIENT_EVIDENCE", params.facts.toolDenialsObserved.refs);
  add("TOOL_ACTION", hasType("TOOL_ACTION").ok, hasType("TOOL_ACTION").refs);

  return out;
}

function eventRefsByType(entries: Array<{ type: string; hash: string }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const current = map.get(entry.type) ?? [];
    current.push(entry.hash);
    map.set(entry.type, current);
  }
  for (const [key, refs] of map.entries()) {
    map.set(key, dedupeSorted(refs));
  }
  return map;
}

function fallbackCgxPackSha(workspace: string): string {
  const graphPath = cgxLatestGraphPath(workspace, {
    type: "workspace",
    id: "workspace"
  });
  return fileSha(graphPath);
}

function evaluateControl(params: {
  control: AuditMapFile["auditMap"]["controlFamilies"][number]["controls"][number];
  kindChecks: Record<string, { ok: boolean; refs: string[] }>;
  checkFacts: FactCatalog;
  integrityIndex: number;
  correlationRatio: number;
}): {
  status: "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";
  reasons: string[];
  evidenceRefs: string[];
} {
  const reasons: string[] = [];
  const evidenceRefs: string[] = [];

  if (params.integrityIndex < params.control.evidenceRequirements.strongClaimGates.minIntegrityIndex) {
    reasons.push("GATE_FAIL_INTEGRITY");
  }
  if (params.correlationRatio < params.control.evidenceRequirements.strongClaimGates.minCorrelationRatio) {
    reasons.push("GATE_FAIL_CORRELATION");
  }

  let missingKind = false;
  for (const kind of params.control.evidenceRequirements.requiredKinds) {
    const row = params.kindChecks[kind];
    if (!row || !row.ok) {
      missingKind = true;
      reasons.push(`MISSING_KIND:${kind}`);
      continue;
    }
    evidenceRefs.push(...row.refs);
  }

  let checkFailed = false;
  let checkInsufficient = false;
  for (const check of params.control.satisfiedBy) {
    const fact = (params.checkFacts as unknown as Record<string, FactResult | undefined>)[check.check];
    if (!fact) {
      checkInsufficient = true;
      reasons.push(`CHECK_UNKNOWN:${check.check}`);
      continue;
    }
    evidenceRefs.push(...fact.refs);
    if (fact.status === "FAIL") {
      checkFailed = true;
      reasons.push(`CHECK_FAIL:${check.check}`);
    } else if (fact.status === "INSUFFICIENT_EVIDENCE") {
      checkInsufficient = true;
      reasons.push(`CHECK_INSUFFICIENT:${check.check}`);
    }
  }

  const sortedReasons = dedupeSorted(reasons);
  const refs = dedupeSorted(evidenceRefs);

  if (checkFailed) {
    return {
      status: "FAIL",
      reasons: sortedReasons.length > 0 ? sortedReasons : ["CHECK_FAIL"],
      evidenceRefs: refs
    };
  }
  if (sortedReasons.some((reason) => reason.startsWith("GATE_FAIL")) || missingKind || checkInsufficient) {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      reasons: sortedReasons.length > 0 ? sortedReasons : ["CHECK_INSUFFICIENT"],
      evidenceRefs: refs
    };
  }
  return {
    status: "PASS",
    reasons: ["CHECK_PASS"],
    evidenceRefs: refs
  };
}

function scopeFromInput(workspace: string, scope: ScopeInput): ScopeInput {
  if (scope.type === "WORKSPACE") {
    return {
      type: "WORKSPACE",
      id: "workspace"
    };
  }
  if (scope.type === "AGENT") {
    return {
      type: "AGENT",
      id: resolveAgentId(workspace, scope.id)
    };
  }
  return {
    type: "NODE",
    id: scope.id
  };
}

export async function collectAuditBinderData(params: {
  workspace: string;
  scope: ScopeInput;
  policy: AuditPolicy;
  map: AuditMapFile;
  nowTs?: number;
  request?: EvidenceRequest | null;
  trust?: import("../trust/trustContext.js").TrustContext;
}): Promise<BinderCollectResult> {
  const nowTs = Number.isFinite(Number(params.nowTs)) ? Number(params.nowTs) : Date.now();
  const scope = scopeFromInput(params.workspace, params.scope);
  const windowStartTs = nowTs - parseWindowToMs("30d");
  const transparencyEntries = readTransparencyEntries(params.workspace)
    .filter((entry) => entry.ts >= windowStartTs && entry.ts <= nowTs)
    .sort((a, b) => a.ts - b.ts);
  const eventsByType = eventRefsByType(transparencyEntries.map((entry) => ({ type: entry.type, hash: entry.hash })));

  const ledger = openLedger(params.workspace);
  const auditTypeRefs = new Map<string, string[]>();
  let truthguardCount = 0;
  let toolDeniedCount = 0;
  let providerAllowlistEvents = 0;
  try {
    const events = ledger.getEventsBetween(windowStartTs, nowTs);
    for (const event of events) {
      if (event.event_type === "output_validated") {
        truthguardCount += 1;
      }
      const meta = parseMeta(event.meta_json);
      const auditType = parseAuditType(meta, event.payload_inline);
      if (event.event_type === "audit" && auditType) {
        const refs = auditTypeRefs.get(auditType) ?? [];
        refs.push(event.event_hash);
        auditTypeRefs.set(auditType, refs);
        if (auditType === "TOOL_DENIED") {
          toolDeniedCount += 1;
        }
        if (auditType === "PROVIDER_DENIED" || auditType === "MODEL_DENIED") {
          providerAllowlistEvents += 1;
        }
      }
    }
  } finally {
    ledger.close();
  }
  for (const [key, refs] of auditTypeRefs.entries()) {
    auditTypeRefs.set(key, dedupeSorted(refs));
  }

  const hostDir = inferHostDir(params.workspace);
  const identityVerify = hostDir ? verifyIdentityConfigSignature(hostDir) : null;
  const workspaceRecord = (() => {
    if (!hostDir || hostDir === params.workspace || hostDir === join(params.workspace, ".amc")) {
      return null;
    }
    try {
      return getWorkspaceRecord(hostDir, workspaceIdFromDirectory(params.workspace));
    } catch {
      return null;
    }
  })();

  const opsSig = verifyOpsPolicySignature(params.workspace);
  const trustSig = verifyTrustConfigSignature(params.workspace);
  const toolsSig = verifyToolsConfigSignature(params.workspace);
  const budgetsSig = verifyBudgetsConfigSignature(params.workspace);
  const approvalSig = verifyApprovalPolicySignature(params.workspace);
  const assuranceSig = verifyAssurancePolicySignature(params.workspace);
  const promptSig = verifyPromptPolicySignature(params.workspace);
  const bridgeSig = verifyBridgeConfigSignature(params.workspace);
  const adaptersSig = verifyAdaptersConfigSignature(params.workspace);
  const benchRegistrySig = verifyBenchRegistriesSignature(params.workspace);
  const pluginVerify = verifyPluginWorkspace({ workspace: params.workspace });
  const tlogVerify = verifyTransparencyLog(params.workspace);
  const merkleVerify = verifyTransparencyMerkle(params.workspace);
  const ledgerVerify = await verifyLedgerIntegrity(params.workspace);

  const retention = retentionStatusCli(params.workspace);
  const assuranceRun = latestAssuranceRun(params.workspace);
  const assuranceCert = latestAssuranceCertificateSummary(params.workspace);
  const assurancePolicy = loadAssurancePolicy(params.workspace);

  const trust = loadTrustConfig(params.workspace);
  const conformance = binderConformanceRun(params.workspace, scope.type === "AGENT" ? scope.id : null, params.trust);
  const notary = await checkNotaryTrust(params.workspace).catch(() => null);

  const opsPolicy = loadOpsPolicy(params.workspace);

  const identityFact = identityVerify
    ? statusFromBoolean(identityVerify.valid, "identity config signature valid", identityVerify.reason ?? "identity config invalid", [fileSha(identityVerify.path)])
    : insufficient("identity config not configured");

  const ssoRefs = dedupeSorted([
    ...(eventsByType.get("OIDC_LOGIN_COMPLETED") ?? []),
    ...(eventsByType.get("SAML_LOGIN_COMPLETED") ?? []),
    ...(eventsByType.get("HUMAN_LOGIN_SUCCESS") ?? [])
  ]);
  const scimRefs = dedupeSorted(
    transparencyEntries
      .filter((entry) => entry.type.startsWith("SCIM_"))
      .map((entry) => entry.hash)
  );

  const facts: FactCatalog = {
    identityYamlSignedAndValid: identityFact,
    hasSsoLoginsLast30d:
      ssoRefs.length > 0
        ? statusFromBoolean(true, "sso login activity observed", "", ssoRefs)
        : insufficient("no SSO login events in window"),
    hasScimWritesLast30d:
      scimRefs.length > 0
        ? statusFromBoolean(true, "scim writes observed", "", scimRefs)
        : insufficient("no SCIM writes in window"),
    workspaceMembershipsConfigured:
      workspaceRecord
        ? statusFromBoolean(workspaceRecord.status === "ACTIVE", "workspace membership record active", "workspace membership record missing/invalid", [sha256Hex(Buffer.from(workspaceRecord.workspaceId, "utf8"))])
        : statusFromBoolean(true, "single-workspace mode", "", []),
    hasApprovalDecisionsLast30d:
      (eventsByType.get("APPROVAL_DECIDED") ?? []).length > 0
        ? statusFromBoolean(true, "approval decisions observed", "", eventsByType.get("APPROVAL_DECIDED") ?? [])
        : insufficient("no approval decisions in window"),
    leasesIncludeWorkspaceClaim:
      (eventsByType.get("LEASE_ISSUED") ?? []).length > 0
        ? statusFromBoolean(true, "lease issuance events observed", "", eventsByType.get("LEASE_ISSUED") ?? [])
        : insufficient("no lease issuance evidence in window"),
    leaseScopeDenialsTracked: (() => {
      const mismatchRefs = dedupeSorted([
        ...(auditTypeRefs.get("LEASE_WORKSPACE_MISMATCH_ATTEMPT") ?? []),
        ...(auditTypeRefs.get("SUSPICIOUS_WORKSPACE_OVERRIDE_ATTEMPT") ?? [])
      ]);
      if (mismatchRefs.length > 0) {
        return statusFromBoolean(true, "workspace override attempts audited", "", mismatchRefs);
      }
      if ((eventsByType.get("LEASE_ISSUED") ?? []).length > 0) {
        return statusFromBoolean(true, "no workspace override attempts observed", "", eventsByType.get("LEASE_ISSUED") ?? []);
      }
      return insufficient("no lease evidence available");
    })(),
    approvalPolicySigned: statusFromBoolean(approvalSig.valid, "approval policy signature valid", approvalSig.reason ?? "approval policy signature invalid", [fileSha(join(params.workspace, ".amc", "approval-policy.yaml"))]),
    opsPolicySigned: statusFromBoolean(opsSig.valid, "ops policy signature valid", opsSig.reason ?? "ops policy signature invalid", [fileSha(opsPolicyPath(params.workspace))]),
    policyChangesSigned: statusFromBoolean(
      opsSig.valid && trustSig.valid && toolsSig.valid && budgetsSig.valid && promptSig.valid,
      "core governance policies are signed",
      "one or more governance signatures are invalid",
      [fileSha(opsPolicyPath(params.workspace)), fileSha(trustConfigPath(params.workspace)), fileSha(join(params.workspace, ".amc", "tools.yaml")), fileSha(join(params.workspace, ".amc", "budgets.yaml")), fileSha(promptPolicyPath(params.workspace))]
    ),
    changeEventsObserved:
      transparencyEntries.filter((entry) => ["POLICY_APPLIED", "PLUGIN_INSTALLED", "APPROVAL_DECIDED", "PROMPT_POLICY_APPLIED"].includes(entry.type)).length > 0
        ? statusFromBoolean(true, "change events observed", "", transparencyEntries.filter((entry) => ["POLICY_APPLIED", "PLUGIN_INSTALLED", "APPROVAL_DECIDED", "PROMPT_POLICY_APPLIED"].includes(entry.type)).map((entry) => entry.hash))
        : insufficient("no policy/change events in window"),
    transformPlansSigned:
      (eventsByType.get("TRANSFORM_PLAN_CREATED") ?? []).length > 0
        ? statusFromBoolean(true, "transform plan events observed", "", eventsByType.get("TRANSFORM_PLAN_CREATED") ?? [])
        : insufficient("no transformation plan events in window"),
    releaseManifestSigned:
      (eventsByType.get("RELEASE_MANIFEST") ?? []).length > 0
        ? statusFromBoolean(true, "release manifest event observed", "", eventsByType.get("RELEASE_MANIFEST") ?? [])
        : insufficient("no release manifest evidence in window"),
    transparencySealValid: statusFromBoolean(tlogVerify.ok, "transparency seal verified", tlogVerify.errors.join("; ") || "transparency verify failed", [fileSha(transparencySealPath(params.workspace))]),
    merkleRootValid: statusFromBoolean(merkleVerify.ok, "merkle root verified", merkleVerify.errors.join("; ") || "merkle verify failed", [currentTransparencyMerkleRoot(params.workspace)?.root ?? "0".repeat(64)]),
    ledgerHashChainValid: statusFromBoolean(ledgerVerify.ok, "ledger hash-chain verified", ledgerVerify.errors.join("; ") || "ledger verify failed", []),
    sseOrgEventsObserved:
      transparencyEntries.length > 0
        ? statusFromBoolean(true, "realtime transparency events observed", "", transparencyEntries.slice(-12).map((entry) => entry.hash))
        : insufficient("no transparency events in window"),
    trustConfigSigned: statusFromBoolean(trustSig.valid, "trust config signature valid", trustSig.reason ?? "trust config invalid", [fileSha(trustConfigPath(params.workspace))]),
    toolsPolicySigned: statusFromBoolean(toolsSig.valid, "tools policy signature valid", toolsSig.reason ?? "tools policy signature invalid", [fileSha(join(params.workspace, ".amc", "tools.yaml"))]),
    budgetsPolicySigned: statusFromBoolean(budgetsSig.valid, "budgets policy signature valid", budgetsSig.reason ?? "budgets policy signature invalid", [fileSha(join(params.workspace, ".amc", "budgets.yaml"))]),
    pluginsIntegrityValid: statusFromBoolean(pluginVerify.ok, "plugin integrity verified", pluginVerify.errors.join("; ") || "plugin integrity failed", []),
    releaseBundlesVerified:
      (eventsByType.get("RELEASE_BUNDLE_VERIFIED") ?? []).length > 0
        ? statusFromBoolean(true, "release bundle verification observed", "", eventsByType.get("RELEASE_BUNDLE_VERIFIED") ?? [])
        : insufficient("no release bundle verification in window"),
    backupManifestSigned:
      (eventsByType.get("BACKUP_CREATED") ?? []).length > 0
        ? statusFromBoolean(true, "backup creation events observed", "", eventsByType.get("BACKUP_CREATED") ?? [])
        : insufficient("no backup manifest evidence in window"),
    registryAllowlistSigned: statusFromBoolean(benchRegistrySig.valid, "registry allowlist signature valid", benchRegistrySig.reason ?? "registry allowlist signature invalid", [fileSha(join(params.workspace, ".amc", "bench", "imports", "registries.yaml"))]),
    assuranceRecentRun: (() => {
      if (!assuranceRun) {
        return insufficient("no assurance run available");
      }
      const fresh = assuranceRun.generatedTs >= nowTs - parseWindowToMs("30d");
      return statusFromBoolean(fresh, "assurance run is recent", "assurance run is stale", [sha256Hex(Buffer.from(assuranceRun.runId, "utf8"))]);
    })(),
    advisoryFlowActive: (() => {
      const refs = dedupeSorted([
        ...(eventsByType.get("ADVISORY_CREATED") ?? []),
        ...(eventsByType.get("ADVISORY_ACKNOWLEDGED") ?? [])
      ]);
      if (refs.length === 0) {
        return insufficient("no advisory events in window");
      }
      return statusFromBoolean(true, "advisory flow active", "", refs);
    })(),
    freezeEventsTracked: (() => {
      const refs = dedupeSorted([
        ...(eventsByType.get("FREEZE_CHANGED") ?? []),
        ...(auditTypeRefs.get("FREEZE_APPLIED") ?? []),
        ...(auditTypeRefs.get("FREEZE_LIFTED") ?? [])
      ]);
      if (refs.length === 0) {
        return insufficient("no freeze events observed");
      }
      return statusFromBoolean(true, "freeze events tracked", "", refs);
    })(),
    retentionStatusHealthy: statusFromBoolean(retention.segmentCount >= 0, "retention status available", "retention status unavailable", [sha256Hex(Buffer.from(String(retention.segmentCount), "utf8"))]),
    assurancePolicySigned: statusFromBoolean(assuranceSig.valid, "assurance policy signature valid", assuranceSig.reason ?? "assurance policy signature invalid", [fileSha(join(params.workspace, ".amc", "assurance", "policy.yaml"))]),
    assuranceCertificateFresh: (() => {
      if (!assuranceCert || !assuranceCert.verify.ok) {
        return insufficient("latest assurance certificate missing or invalid");
      }
      const fresh = assuranceCert.cert.issuedTs >= nowTs - parseWindowToMs("30d");
      return statusFromBoolean(fresh, "assurance certificate is fresh", "assurance certificate is stale", [assuranceCert.sha256]);
    })(),
    assuranceScoreAboveThreshold: (() => {
      if (!assuranceRun || assuranceRun.score.riskAssuranceScore === null) {
        return insufficient("assurance score unavailable");
      }
      const threshold = assurancePolicy.assurancePolicy.thresholds.minRiskAssuranceScore;
      return statusFromBoolean(
        assuranceRun.score.riskAssuranceScore >= threshold,
        `assurance score ${assuranceRun.score.riskAssuranceScore} >= ${threshold}`,
        `assurance score ${assuranceRun.score.riskAssuranceScore} < ${threshold}`,
        [sha256Hex(Buffer.from(assuranceRun.runId, "utf8"))]
      );
    })(),
    assuranceThresholdBreachAbsent: (() => {
      const breached = (eventsByType.get("ASSURANCE_THRESHOLD_BREACH") ?? []).length > 0;
      return statusFromBoolean(!breached, "no assurance threshold breach events", "assurance threshold breach observed", eventsByType.get("ASSURANCE_THRESHOLD_BREACH") ?? []);
    })(),
    promptPolicySigned: statusFromBoolean(promptSig.valid, "prompt policy signature valid", promptSig.reason ?? "prompt policy signature invalid", [fileSha(promptPolicyPath(params.workspace))]),
    truthguardValidationObserved:
      truthguardCount > 0 || (eventsByType.get("OUTPUT_VALIDATED") ?? []).length > 0
        ? statusFromBoolean(true, "truthguard validations observed", "", dedupeSorted([...(eventsByType.get("OUTPUT_VALIDATED") ?? []), ...(auditTypeRefs.get("OUTPUT_VALIDATED") ?? [])]))
        : insufficient("no truthguard validations in window"),
    noSecretLeakAudit: (() => {
      const leakRefs = dedupeSorted([
        ...(auditTypeRefs.get("SECRET_LEAKAGE") ?? []),
        ...(auditTypeRefs.get("PII_LEAKAGE") ?? []),
        ...(auditTypeRefs.get("PROMPT_LINT_FAILED") ?? [])
      ]);
      if (leakRefs.length > 0) {
        return statusFromBoolean(false, "", "secret/privacy leakage findings observed", leakRefs);
      }
      return statusFromBoolean(true, "no secret/privacy leakage findings observed", "", []);
    })(),
    blobEncryptionEnabled: statusFromBoolean(
      opsPolicy.opsPolicy.encryption.blobEncryptionEnabled,
      "blob encryption enabled",
      "blob encryption disabled",
      [fileSha(opsPolicyPath(params.workspace))]
    ),
    bridgeConfigSigned: statusFromBoolean(bridgeSig.valid, "bridge config signature valid", bridgeSig.reason ?? "bridge config signature invalid", [fileSha(join(params.workspace, ".amc", "bridge.yaml"))]),
    adapterConfigSigned: statusFromBoolean(adaptersSig.valid, "adapters config signature valid", adaptersSig.reason ?? "adapters config signature invalid", [fileSha(join(params.workspace, ".amc", "adapters.yaml"))]),
    providerAllowlistEnforced:
      providerAllowlistEvents > 0 || adaptersSig.valid
        ? statusFromBoolean(true, "provider/model allowlist enforcement observable", "", dedupeSorted([...(auditTypeRefs.get("PROVIDER_DENIED") ?? []), ...(auditTypeRefs.get("MODEL_DENIED") ?? [])]))
        : insufficient("no provider/model allowlist evidence"),
    toolDenialsObserved:
      toolDeniedCount > 0 || (eventsByType.get("TOOL_DENIED") ?? []).length > 0
        ? statusFromBoolean(true, "tool denials observed and audited", "", dedupeSorted([...(auditTypeRefs.get("TOOL_DENIED") ?? []), ...(eventsByType.get("TOOL_DENIED") ?? [])]))
        : insufficient("no tool denial events in window")
  };

  const kindChecks = mapEvidenceKinds({
    eventsByType,
    facts
  });

  let maturityOverall: number | null = null;
  let maturityByDim: { DIM1: number | null; DIM2: number | null; DIM3: number | null; DIM4: number | null; DIM5: number | null } = {
    DIM1: null,
    DIM2: null,
    DIM3: null,
    DIM4: null,
    DIM5: null
  };
  let unknownQuestionsCount = 0;
  let maturityRefs: string[] = [];
  let maturityNotes: string[] = [];

  let integrityIndex = 0;
  let correlationRatio = 0;
  let observedShare = 0;
  let attestedShare = 0;
  let selfReportedShare = 1;
  let trustLabel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  let runCount = 0;

  if (scope.type === "AGENT") {
    const runId = findLatestAgentRunId(params.workspace, scope.id);
    if (runId) {
      const run = loadRunReport(params.workspace, runId, scope.id);
      assertNotExample(run, "included in an audit binder");
      maturityOverall = Number((run.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0) / Math.max(1, run.layerScores.length)).toFixed(6));
      maturityByDim = byDimensionFromRun(run);
      unknownQuestionsCount = run.questionScores.filter((row) => row.finalLevel <= 1).length;
      integrityIndex = Number(run.integrityIndex.toFixed(6));
      correlationRatio = Number(run.correlationRatio.toFixed(6));
      observedShare = Number((run.evidenceTrustCoverage?.observed ?? 0).toFixed(6));
      attestedShare = Number((run.evidenceTrustCoverage?.attested ?? 0).toFixed(6));
      selfReportedShare = Number((run.evidenceTrustCoverage?.selfReported ?? 1).toFixed(6));
      trustLabel = mapRunTrustLabel(run.trustLabel);
      runCount = 1;
      maturityRefs = dedupeSorted([sha256Hex(Buffer.from(run.runId, "utf8"))]);
      maturityNotes = dedupeSorted(run.evidenceToCollectNext.slice(0, 6));
    } else {
      maturityNotes = ["No agent diagnostic runs were found."];
    }
  } else {
    const scorecard = loadLatestOrgScorecard(params.workspace);
    const node = scorecard
      ? scope.type === "WORKSPACE"
        ? scorecard.summary.enterpriseRollup ?? (scorecard.nodes[0] ?? null)
        : findNodeScorecard(scorecard, scope.id)
      : null;
    if (node) {
      maturityOverall = Number(node.headline.median.toFixed(6));
      maturityByDim = byDimensionFromOrgNode(node);
      unknownQuestionsCount = node.questionScores.filter((row) => row.median <= 1).length;
      integrityIndex = Number(node.integrityIndex.toFixed(6));
      correlationRatio = Number(node.confidence.medianCorrelationRatio.toFixed(6));
      observedShare = Number(node.evidenceCoverage.observedRatio.toFixed(6));
      attestedShare = Number(node.evidenceCoverage.attestedRatio.toFixed(6));
      selfReportedShare = Number(node.evidenceCoverage.selfReportedRatio.toFixed(6));
      trustLabel = mapRunTrustLabel(node.trustLabel);
      runCount = node.runRefs.length;
      maturityRefs = dedupeSorted([...(node.transparencyRefs ?? []), ...(node.runRefs ?? []).map((row) => sha256Hex(Buffer.from(row, "utf8")))]);
      maturityNotes = dedupeSorted(node.whyCapped.slice(0, 8));
    } else {
      maturityNotes = ["No org scorecard was found for this scope."];
    }
  }

  if (integrityIndex <= 0 || correlationRatio <= 0) {
    // Fallback to trust evidence from trust mode if no diagnostic/org data exists.
    integrityIndex = integrityIndex > 0 ? integrityIndex : 0;
    correlationRatio = correlationRatio > 0 ? correlationRatio : 0;
  }

  if (trustLabel === "LOW") {
    trustLabel = trustLabelFromSignals({
      integrityIndex,
      correlationRatio,
      observedShare
    });
  }

  const strongClaimFailures: string[] = [];
  if (runCount < params.policy.auditPolicy.gates.minRunsForStrongClaims) {
    strongClaimFailures.push(`MIN_RUNS_NOT_MET:${runCount}<${params.policy.auditPolicy.gates.minRunsForStrongClaims}`);
  }
  if (integrityIndex < params.policy.auditPolicy.gates.minIntegrityIndexForStrongClaims) {
    strongClaimFailures.push("MIN_INTEGRITY_NOT_MET");
  }
  if (correlationRatio < params.policy.auditPolicy.gates.minCorrelationRatioForStrongClaims) {
    strongClaimFailures.push("MIN_CORRELATION_NOT_MET");
  }

  const maturityStatus =
    maturityOverall === null || strongClaimFailures.length > 0
      ? "INSUFFICIENT_EVIDENCE"
      : "OK";

  const governanceIdentity = facts.identityYamlSignedAndValid.status === "PASS"
    ? "OK"
    : "INSUFFICIENT_EVIDENCE";
  const governanceApprovals = facts.hasApprovalDecisionsLast30d.status === "PASS" && facts.approvalPolicySigned.status === "PASS"
    ? "OK"
    : "INSUFFICIENT_EVIDENCE";
  const governanceLeases = facts.leasesIncludeWorkspaceClaim.status === "PASS"
    ? "OK"
    : "INSUFFICIENT_EVIDENCE";

  const modelBridge = facts.bridgeConfigSigned.status === "PASS" && facts.promptPolicySigned.status === "PASS"
    ? "OK"
    : "INSUFFICIENT_EVIDENCE";
  const modelAllowlist = facts.adapterConfigSigned.status === "PASS" && facts.providerAllowlistEnforced.status !== "FAIL"
    ? "OK"
    : "INSUFFICIENT_EVIDENCE";
  const modelBudgets = facts.budgetsPolicySigned.status === "PASS"
    ? "OK"
    : "INSUFFICIENT_EVIDENCE";
  const modelTruth = facts.truthguardValidationObserved.status === "PASS"
    ? "OK"
    : "INSUFFICIENT_EVIDENCE";

  const assuranceSectionStatus = assuranceCert?.cert.status ?? null;
  const topFindings = (() => {
    if (!assuranceRun) {
      return [];
    }
    const path = join(params.workspace, ".amc", "assurance", "runs", assuranceRun.runId, "findings.json");
    if (!pathExists(path)) {
      return [];
    }
    try {
      const parsed = JSON.parse(readUtf8(path)) as {
        findings?: Array<{ category?: string; severity?: string; evidenceRefs?: { eventHashes?: string[] } }>;
      };
      return (parsed.findings ?? []).slice(0, 5).map((row) => ({
        category: String(row.category ?? "UNKNOWN"),
        severity: String(row.severity ?? "INFO"),
        evidenceRefs: dedupeSorted((row.evidenceRefs?.eventHashes ?? []).filter((item): item is string => typeof item === "string"))
      }));
    } catch {
      return [];
    }
  })();

  const supplyPlugins = facts.pluginsIntegrityValid.status === "PASS" ? "OK" : "INSUFFICIENT_EVIDENCE";
  const supplyReleases = facts.releaseBundlesVerified.status === "PASS" ? "OK" : "INSUFFICIENT_EVIDENCE";
  const supplyBackups = facts.backupManifestSigned.status === "PASS" ? "OK" : "INSUFFICIENT_EVIDENCE";

  const tuning = (() => {
    try {
      return loadMechanicTuning(params.workspace).mechanicTuning.knobs;
    } catch {
      return null;
    }
  })();

  const forecastSchedulerPath = join(params.workspace, ".amc", "forecast", "scheduler.json");
  const forecastScheduler = pathExists(forecastSchedulerPath)
    ? (JSON.parse(readUtf8(forecastSchedulerPath)) as { lastRefreshTs?: number; nextRefreshTs?: number })
    : {};
  const assuranceSchedulerPath = join(params.workspace, ".amc", "assurance", "scheduler.json");
  const assuranceScheduler = pathExists(assuranceSchedulerPath)
    ? (JSON.parse(readUtf8(assuranceSchedulerPath)) as { lastRunTs?: number; nextRunTs?: number })
    : {};

  const latestBenchCreated = transparencyEntries
    .filter((entry) => entry.type === "BENCH_CREATED")
    .slice(-1)[0] ?? null;

  const families = params.map.auditMap.controlFamilies.map((family) => {
    const controls = family.controls.map((control) => {
      const evaluated = evaluateControl({
        control,
        kindChecks,
        checkFacts: facts,
        integrityIndex,
        correlationRatio
      });
      return {
        controlId: control.controlId,
        status: evaluated.status,
        reasons: evaluated.reasons,
        evidenceRefs: evaluated.evidenceRefs
      };
    });
    const summary = {
      pass: controls.filter((row) => row.status === "PASS").length,
      fail: controls.filter((row) => row.status === "FAIL").length,
      insufficient: controls.filter((row) => row.status === "INSUFFICIENT_EVIDENCE").length
    };
    return auditFamilyResultSchema.parse({
      familyId: family.familyId,
      title: family.title,
      statusSummary: summary,
      controls
    });
  });

  const restrictedControlIds = params.request
    ? params.request.requestedItems
        .filter((item): item is Extract<EvidenceRequest["requestedItems"][number], { kind: "CONTROL" }> => item.kind === "CONTROL")
        .map((item) => item.controlId)
    : [];

  const filteredFamilies: AuditFamilyResult[] = restrictedControlIds.length === 0
    ? families
    : families
        .map((family) => {
          const controls = family.controls.filter((control) => restrictedControlIds.includes(control.controlId));
          if (controls.length === 0) {
            return null;
          }
          const statusSummary = {
            pass: controls.filter((row) => row.status === "PASS").length,
            fail: controls.filter((row) => row.status === "FAIL").length,
            insufficient: controls.filter((row) => row.status === "INSUFFICIENT_EVIDENCE").length
          };
          return auditFamilyResultSchema.parse({
            familyId: family.familyId,
            title: family.title,
            statusSummary,
            controls
          });
        })
        .filter((row): row is AuditFamilyResult => row !== null);

  const includedEventKinds = dedupeSorted(transparencyEntries.map((entry) => entry.type));
  const sourceEventHashes = dedupeSorted(transparencyEntries.map((entry) => entry.hash));

  const scopeHashInput =
    scope.type === "WORKSPACE"
      ? params.policy.auditPolicy.privacy.anonymizeWorkspaceIdDefault
        ? params.workspace
        : "workspace"
      : scope.id;

  const cgxSha =
    scope.type === "AGENT"
      ? fileSha(cgxLatestPackPath(params.workspace, scope.id))
      : fallbackCgxPackSha(params.workspace);

  const calculationManifest = {
    v: 1,
    scope,
    generatedTs: nowTs,
    policySha256: fileSha(join(params.workspace, ".amc", "audit", "policy.yaml")),
    mapSha256: fileSha(join(params.workspace, ".amc", "audit", "maps", "active.yaml")),
    sourceEventHashes,
    refs: {
      maturity: maturityRefs,
      governance: dedupeSorted([
        ...facts.identityYamlSignedAndValid.refs,
        ...facts.hasApprovalDecisionsLast30d.refs,
        ...facts.leasesIncludeWorkspaceClaim.refs
      ])
    }
  };

  const binder = binderJsonSchema.parse({
    v: 1,
    binderId: `ab_${truncateHash(`${scope.type}:${scope.id}:${nowTs}`, params.policy.auditPolicy.privacy.hashTruncBytes)}_${nowTs}`,
    generatedTs: nowTs,
    scope: {
      type: scope.type,
      idHash: truncateHash(scopeHashInput, params.policy.auditPolicy.privacy.hashTruncBytes)
    },
    trust: {
      integrityIndex: Number(integrityIndex.toFixed(6)),
      correlationRatio: Number(correlationRatio.toFixed(6)),
      trustLabel,
      evidenceCoverage: {
        observedShare: Number(observedShare.toFixed(6)),
        attestedShare: Number(attestedShare.toFixed(6)),
        selfReportedShare: Number(selfReportedShare.toFixed(6))
      },
      notary: {
        enabled: trust.trust.mode === "NOTARY",
        fingerprint: trust.trust.mode === "NOTARY" ? notary?.currentFingerprint ?? trust.trust.notary.pinnedPubkeyFingerprint : null,
        attestationAgeMinutes:
          trust.trust.mode === "NOTARY" && Number.isFinite(Number(notary?.lastAttestationTs ?? NaN))
            ? Number((((nowTs - Number(notary?.lastAttestationTs ?? nowTs)) / 60_000).toFixed(3)))
            : null
      }
    },
    bindings: {
      auditPolicySha256: fileSha(join(params.workspace, ".amc", "audit", "policy.yaml")),
      auditMapSha256: fileSha(join(params.workspace, ".amc", "audit", "maps", "active.yaml")),
      canonSha256: fileSha(canonPath(params.workspace)),
      bankSha256: fileSha(diagnosticBankPath(params.workspace)),
      cgxPackSha256: cgxSha,
      promptPolicySha256: fileSha(promptPolicyPath(params.workspace)),
      mechanicTargetsSha256: fileSha(mechanicTargetsPath(params.workspace))
    },
    sections: {
      maturity: {
        status: maturityStatus,
        overall: maturityStatus === "OK" ? maturityOverall : null,
        byDimensions: maturityStatus === "OK" ? maturityByDim : { DIM1: null, DIM2: null, DIM3: null, DIM4: null, DIM5: null },
        unknownQuestionsCount,
        evidenceRefs: maturityRefs,
        notes: dedupeSorted([
          ...maturityNotes,
          ...strongClaimFailures
        ]).slice(0, 16)
      },
      governance: {
        identity: {
          status: governanceIdentity,
          evidenceRefs: facts.identityYamlSignedAndValid.refs,
          notes: [facts.identityYamlSignedAndValid.reason]
        },
        approvals: {
          status: governanceApprovals,
          evidenceRefs: dedupeSorted([...facts.hasApprovalDecisionsLast30d.refs, ...facts.approvalPolicySigned.refs]),
          notes: dedupeSorted([facts.hasApprovalDecisionsLast30d.reason, facts.approvalPolicySigned.reason])
        },
        leases: {
          status: governanceLeases,
          evidenceRefs: dedupeSorted([...facts.leasesIncludeWorkspaceClaim.refs, ...facts.leaseScopeDenialsTracked.refs]),
          notes: dedupeSorted([facts.leasesIncludeWorkspaceClaim.reason, facts.leaseScopeDenialsTracked.reason])
        }
      },
      modelToolGovernance: {
        bridgeEnforcement: {
          status: modelBridge,
          evidenceRefs: dedupeSorted([...facts.bridgeConfigSigned.refs, ...facts.promptPolicySigned.refs]),
          notes: dedupeSorted([facts.bridgeConfigSigned.reason, facts.promptPolicySigned.reason])
        },
        providerAllowlists: {
          status: modelAllowlist,
          evidenceRefs: dedupeSorted([...facts.adapterConfigSigned.refs, ...facts.providerAllowlistEnforced.refs]),
          notes: dedupeSorted([facts.adapterConfigSigned.reason, facts.providerAllowlistEnforced.reason])
        },
        budgets: {
          status: modelBudgets,
          evidenceRefs: facts.budgetsPolicySigned.refs,
          notes: [facts.budgetsPolicySigned.reason]
        },
        truthguard: {
          status: modelTruth,
          evidenceRefs: facts.truthguardValidationObserved.refs,
          notes: [facts.truthguardValidationObserved.reason]
        }
      },
      assurance: {
        lastCert: {
          status: assuranceSectionStatus,
          certSha256: assuranceCert?.sha256 ?? null,
          issuedTs: assuranceCert?.cert.issuedTs ?? null
        },
        riskAssuranceScore: assuranceRun?.score.riskAssuranceScore ?? null,
        topFindings,
        notes: dedupeSorted([
          facts.assurancePolicySigned.reason,
          facts.assuranceRecentRun.reason,
          facts.assuranceScoreAboveThreshold.reason,
          facts.assuranceThresholdBreachAbsent.reason
        ])
      },
      supplyChainIntegrity: {
        plugins: {
          status: supplyPlugins,
          evidenceRefs: facts.pluginsIntegrityValid.refs,
          notes: [facts.pluginsIntegrityValid.reason]
        },
        releases: {
          status: supplyReleases,
          evidenceRefs: dedupeSorted([...facts.releaseManifestSigned.refs, ...facts.releaseBundlesVerified.refs]),
          notes: dedupeSorted([facts.releaseManifestSigned.reason, facts.releaseBundlesVerified.reason])
        },
        backupsRestoreDrills: {
          status: supplyBackups,
          evidenceRefs: dedupeSorted([...facts.backupManifestSigned.refs, ...(eventsByType.get("BACKUP_RESTORED") ?? [])]),
          notes: dedupeSorted([facts.backupManifestSigned.reason, (eventsByType.get("BACKUP_RESTORED") ?? []).length > 0 ? "backup restore evidence observed" : "no backup restore evidence in window"])
        }
      },
      recurrence: {
        diagnosticCadence: {
          configuredHours: tuning?.diagnosticCadenceHours ?? null,
          lastRunTs: scope.type === "AGENT" ? (findLatestAgentRunId(params.workspace, scope.id) ? loadRunReport(params.workspace, findLatestAgentRunId(params.workspace, scope.id)!, scope.id).ts : null) : (loadLatestOrgScorecard(params.workspace)?.computedAt ?? null),
          nextRunTs: tuning?.diagnosticCadenceHours && maturityOverall !== null
            ? nowTs + tuning.diagnosticCadenceHours * 60 * 60 * 1000
            : null,
          status: maturityOverall === null ? "MISSING" : "SCHEDULED"
        },
        forecastCadence: {
          configuredHours: tuning?.forecastCadenceHours ?? null,
          lastRunTs: Number(forecastScheduler.lastRefreshTs ?? null),
          nextRunTs: Number(forecastScheduler.nextRefreshTs ?? null),
          status: Number.isFinite(Number(forecastScheduler.nextRefreshTs)) ? "SCHEDULED" : "UNKNOWN"
        },
        assuranceCadence: {
          configuredHours: assurancePolicy.assurancePolicy.cadence.defaultRunHours,
          lastRunTs: Number(assuranceScheduler.lastRunTs ?? null),
          nextRunTs: Number(assuranceScheduler.nextRunTs ?? null),
          status: Number.isFinite(Number(assuranceScheduler.nextRunTs)) ? "SCHEDULED" : "UNKNOWN"
        },
        benchCadence: {
          configuredDays: tuning?.benchCadenceDays ?? null,
          lastRunTs: latestBenchCreated?.ts ?? null,
          nextRunTs: tuning?.benchCadenceDays && latestBenchCreated
            ? latestBenchCreated.ts + tuning.benchCadenceDays * 24 * 60 * 60 * 1000
            : null,
          status: latestBenchCreated ? "SCHEDULED" : "UNKNOWN"
        }
      },
      controls: {
        mapId: params.map.auditMap.id,
        families: filteredFamilies
      },
      conformanceRun: conformance.section
    },
    proofBindings: {
      transparencyRootSha256: fileSha(transparencySealPath(params.workspace)),
      merkleRootSha256: currentTransparencyMerkleRoot(params.workspace)?.root ?? "0".repeat(64),
      includedEventProofIds: [],
      calculationManifestSha256: sha256Hex(Buffer.from(canonicalize(calculationManifest), "utf8"))
    }
  });

  return { binder, includedEventKinds, calculationManifest, sourceEventHashes, conformanceRun: conformance.run };
}
