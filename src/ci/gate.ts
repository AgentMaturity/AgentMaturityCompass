import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { DiagnosticReport, GatePolicy, LayerName } from "../types.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  isAuditEvidenceSha256 as isSha256,
  auditTimestampPresent as timestampPresent,
  uniqueAuditReasons as unique,
  auditEvidenceRefsValid as releaseGateEvidenceValid,
  hashAuditEvidence,
  collectAuditSourceIds,
  finalizeAuditEvidenceReceipt,
  beginAuditReceiptVerification,
  finalizeAuditEvidenceExport
} from "../audit/auditEvidenceAccounting.js";
import type { FleetEnvironment } from "../fleet/registry.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { loadBundleRunAndTrustMap, verifyEvidenceBundle } from "../bundles/bundle.js";
import { untrustedReasons, workspaceSelfTrust } from "../trust/index.js";
import { writeSignedGatePolicy, verifyGatePolicySignature, prepareSignedGatePolicy } from "./gatePolicyPublication.js";
export { writeSignedGatePolicy, verifyGatePolicySignature, prepareSignedGatePolicy } from "./gatePolicyPublication.js";
import { writeCiWorkflowSuffix, relativeAgentPathFromWorkspace, pinnedBundleVerify } from "./ciWorkflow.js";
import { captureConfigSignatureAuthority } from "../config/configSignaturePair.js";
import { captureVaultPurposeContinuity, vaultStatus } from "../vault/vault.js";
import { boundProviderKey } from "../keys/keyset.js";
import { loadTrustConfig, resolveNotaryAuthSecret } from "../trust/trustConfig.js";
import { captureWorkspaceLogAuthority, appendTransparencyEntryAttemptAsync } from "../transparency/asyncWorkspaceAppend.js";
import { initTransparencyLogAttemptAsync } from "../transparency/logChain.js";
import { captureTransparencyAppendPublication } from "../transparency/workspacePublication.js";
import { assertOrgPairsCurrent, captureOrgFiles } from "../org/preparedOrgPairs.js";
import { physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { canonicalize } from "../utils/json.js";

const layerNames: LayerName[] = [
  "Strategic Agent Operations",
  "Leadership & Autonomy",
  "Culture & Alignment",
  "Resilience",
  "Skills"
];

const gatePolicySchema = z.object({
  minIntegrityIndex: z.number().min(0).max(1),
  minOverall: z.number().min(0).max(5),
  minLayer: z.object({
    "Strategic Agent Operations": z.number().min(0).max(5),
    "Leadership & Autonomy": z.number().min(0).max(5),
    "Culture & Alignment": z.number().min(0).max(5),
    Resilience: z.number().min(0).max(5),
    Skills: z.number().min(0).max(5)
  }),
  requireObservedForLevel5: z.boolean(),
  denyIfLowTrust: z.boolean(),
  minValueScore: z.number().min(0).max(100).optional(),
  minEconomicSignificanceIndex: z.number().min(0).max(100).optional(),
  denyIfValueRegression: z.boolean().optional(),
  maxCostIncreaseRatio: z.number().positive().optional(),
  requireExperimentPass: z
    .object({
      enabled: z.boolean(),
      experimentId: z.string().min(1),
      minUpliftSuccessRate: z.number(),
      minUpliftValuePoints: z.number()
    })
    .optional()
});

export type ReleaseGateOverrideStatus = "none" | "requested" | "approved" | "rejected" | "expired";
export type ReleaseGateControlKind = "score" | "security" | "compliance" | "cost" | "observability";
export type ReleaseGateControlStatus = "not_recorded" | "passed" | "failed" | "missing";

export interface ReleaseGateSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface ReleaseGateEvidenceLink {
  eventId: string;
  eventHash: string;
  eventType: string;
  signedEvidenceRef: string;
}

export interface ReleaseGateOverrideRecord {
  overrideId: string;
  status: Exclude<ReleaseGateOverrideStatus, "none">;
  requesterId: string;
  approverId?: string;
  reason: string;
  decidedAt?: string;
  signedEvidenceRef?: string;
  signatureSha256?: string;
}

export interface ReleaseGateControlEvidence {
  control: ReleaseGateControlKind;
  passed: boolean;
  evidenceRef: string;
  reason: string;
}

export interface ReleaseGateRunRecord {
  gateId: string;
  agentId: string;
  environment: FleetEnvironment;
  gateConfig: GatePolicy;
  policyPath?: string;
  bundlePath?: string;
  evaluatedAt: string;
  passed: boolean;
  failureReasons: string[];
  runReceiptRef: string;
  runReceiptHash: string;
  override?: ReleaseGateOverrideRecord;
  controlEvidence?: ReleaseGateControlEvidence[];
  evidenceRefs: ReleaseGateEvidenceLink[];
  sourceCitationIds?: string[];
}

export interface ReleaseGateReceiptRow {
  gateId: string;
  agentId: string;
  environment: FleetEnvironment;
  gateConfig: GatePolicy;
  gateConfigHash: string;
  policyPath: string | null;
  bundlePath: string | null;
  evaluatedAt: string;
  passed: boolean;
  failureReasons: string[];
  runReceiptRef: string;
  runReceiptHash: string;
  overrideStatus: ReleaseGateOverrideStatus;
  overrideId: string | null;
  controlStatus: ReleaseGateControlStatus;
  controlEvidence: ReleaseGateControlEvidence[];
  sourceCitationIds: string[];
  evidenceRefs: ReleaseGateEvidenceLink[];
  evidenceChainHash: string;
  rowHash: string;
}

export interface ReleaseGateReceipt {
  receiptId: string;
  generatedAt: string;
  sourceCitations: ReleaseGateSourceCitation[];
  rows: ReleaseGateReceiptRow[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface ReleaseGateReceiptVerification {
  valid: boolean;
  reasons: string[];
}

export function defaultGatePolicy(): GatePolicy {
  return {
    minIntegrityIndex: 0.8,
    minOverall: 3.5,
    minLayer: {
      "Strategic Agent Operations": 3,
      "Leadership & Autonomy": 3,
      "Culture & Alignment": 3,
      Resilience: 3,
      Skills: 3
    },
    requireObservedForLevel5: true,
    denyIfLowTrust: true
  };
}

export function parseGatePolicy(raw: unknown): GatePolicy {
  return gatePolicySchema.parse(raw);
}

function overallScore(report: DiagnosticReport): number {
  if (report.layerScores.length === 0) {
    return 0;
  }
  const total = report.layerScores.reduce((sum, layer) => sum + layer.avgFinalLevel, 0);
  return total / report.layerScores.length;
}

export function evaluateGatePolicy(params: {
  report: DiagnosticReport;
  policy: GatePolicy;
  eventTrustTier?: Map<string, string>;
}): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (params.report.integrityIndex < params.policy.minIntegrityIndex) {
    reasons.push(
      `IntegrityIndex ${params.report.integrityIndex.toFixed(3)} is below minimum ${params.policy.minIntegrityIndex.toFixed(3)}`
    );
  }

  const overall = overallScore(params.report);
  if (overall < params.policy.minOverall) {
    reasons.push(`Overall maturity ${overall.toFixed(3)} is below minimum ${params.policy.minOverall.toFixed(3)}`);
  }

  for (const layerName of layerNames) {
    const actual = params.report.layerScores.find((layer) => layer.layerName === layerName)?.avgFinalLevel ?? 0;
    const required = params.policy.minLayer[layerName];
    if (actual < required) {
      reasons.push(`${layerName} score ${actual.toFixed(3)} is below minimum ${required.toFixed(3)}`);
    }
  }

  if (params.policy.denyIfLowTrust && params.report.trustLabel !== "HIGH TRUST") {
    reasons.push(`Trust label ${params.report.trustLabel} is disallowed by gate policy.`);
  }

  if (params.policy.requireObservedForLevel5) {
    const trustMap = params.eventTrustTier ?? new Map<string, string>();
    for (const question of params.report.questionScores) {
      if (question.finalLevel !== 5) {
        continue;
      }
      if (question.evidenceEventIds.length === 0) {
        reasons.push(`${question.questionId} is level 5 but has no evidence event IDs.`);
        continue;
      }
      const nonObserved = question.evidenceEventIds.filter((eventId) => {
        const tier = trustMap.get(eventId);
        return tier !== "OBSERVED" && tier !== "OBSERVED_HARDENED";
      });
      if (nonObserved.length > 0) {
        reasons.push(
          `${question.questionId} is level 5 but has non-OBSERVED evidence: ${nonObserved.slice(0, 5).join(",")}`
        );
      }
    }
  }

  return {
    pass: reasons.length === 0,
    reasons
  };
}


export function initCiForAgent(params: {
  workspace: string;
  agentId?: string;
  signPolicy?: boolean;
}): {
  workflowPath: string;
  policyPath: string;
  policySigPath: string | null;
  suggestedBundlePath: string;
  signed: boolean;
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const agentPaths = getAgentPaths(params.workspace, agentId);
  const signPolicy = params.signPolicy !== false;

  const policy = defaultGatePolicy();
  const savedPolicy = signPolicy
    ? writeSignedGatePolicy({
        workspace: params.workspace,
        policyPath: agentPaths.gatePolicy,
        policy
      })
    : (() => {
        ensureDir(dirname(agentPaths.gatePolicy));
        writeFileAtomic(agentPaths.gatePolicy, JSON.stringify(policy, null, 2), 0o644);
        return {
          policyPath: agentPaths.gatePolicy,
          sigPath: null
        };
      })();

  return writeCiWorkflowSuffix(params, agentId, agentPaths, signPolicy, savedPolicy).result;
}

/** Partial native facts; a returned member is not a helper readback or an atomic multi-file commit. */
class CiInitializationError extends Error {
  readonly code = "CI_INITIALIZATION_INCOMPLETE";
  constructor(readonly progress: Readonly<{ phase: string; returnedPolicyMembers: readonly string[]; pairReturned: boolean;
    initialization: Awaited<ReturnType<typeof initTransparencyLogAttemptAsync>>["progress"] | null;
    initializationEntered: boolean; entryHash: string | null; workflowEntered: boolean; workflowWriteSelected: boolean;
    workflowHelperReturned: boolean; workflowAcknowledged: boolean; firstRefusalObserved: boolean; firstRefusal: unknown }>, cause: unknown) {
    super("CI initialization did not complete; earlier policy/log/workflow effects may remain", { cause });
    this.name = "CiInitializationError";
  }
}
/** Fixed signed attempt. Legacy sync/initial unsigned or global no-sign callers keep initCiForAgent. */
export async function initCiForAgentAttemptAsync(params: { workspace: string; agentId?: string }, beforePublish?: () => void) {
  const workspace = params.workspace, agentId = resolveAgentId(workspace, params.agentId);
  const agentPaths = getAgentPaths(workspace, agentId), policy = defaultGatePolicy(), root = resolve(workspace);
  let phase = "capture", pairEntered = false, pairReturned = false, initializationEntered = false;
  let initialization: Awaited<ReturnType<typeof initTransparencyLogAttemptAsync>>["progress"] | null = null;
  let entryHash: string | null = null, workflowEntered = false, workflowWriteSelected = false, workflowHelperReturned = false, workflowAcknowledged = false;
  let firstRefusalObserved = false, firstRefusal: unknown;
  const returnedPolicyMembers: string[] = [];
  const checked = (negative: () => void) => {
    if (firstRefusalObserved) throw firstRefusal;
    try { negative(); } catch (cause) {
      if (!firstRefusalObserved) { firstRefusalObserved = true; firstRefusal = cause; }
      throw cause;
    }
  };
  const failure = (cause: unknown) => new CiInitializationError(Object.freeze({ phase,
    returnedPolicyMembers: Object.freeze([...returnedPolicyMembers]), pairReturned, initialization, initializationEntered,
    entryHash, workflowEntered, workflowWriteSelected, workflowHelperReturned, workflowAcknowledged, firstRefusalObserved, firstRefusal }), cause);
  try {
    const physicalRoot = realpathSync(root), originalRoot = lstatSync(physicalRoot);
    if (!originalRoot.isDirectory()) throw new Error("CI initialization workspace must be a directory");
    const selectedPaths = canonicalize(agentPaths), workflowPath = join(workspace, ".github", "workflows", "amc.yml");
    const physicalWorkflow = physicalPathWithMissingSuffix(workflowPath);
    let expectedWorkflow = captureOrgFiles([workflowPath]);
    const enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); };
    const inputs = () => checked(() => {
      enabled(); beforePublish?.(); enabled();
      const now = lstatSync(physicalRoot);
      if (resolve(workspace) !== root || realpathSync(root) !== physicalRoot || !now.isDirectory()
        || now.dev !== originalRoot.dev || now.ino !== originalRoot.ino)
        throw new Error("original CI workspace changed");
      if (canonicalize(getAgentPaths(workspace, agentId)) !== selectedPaths)
        throw new Error("original CI agent path selection changed");
      if (physicalPathWithMissingSuffix(workflowPath) !== physicalWorkflow) throw new Error("original CI workflow destination changed");
      assertOrgPairsCurrent(expectedWorkflow);
    });
    // This real constructor captures its public config negative BEFORE the first supplied actor. No duplicate public constructor.
    const config = captureConfigSignatureAuthority(workspace, inputs), log = captureWorkspaceLogAuthority(workspace, inputs);
    const usesNotary = [log.sealSigner.descriptor, log.rootSigner.descriptor].some(row => row.mode === "NOTARY");
    const secretRef = usesNotary ? loadTrustConfig(workspace).trust.notary.auth.secretRef : null;
    const originalSecret = secretRef === null ? null : resolveNotaryAuthSecret(workspace, secretRef);
    // Stabilize actual secret authentication before retaining any selected managed local file material.
    const configMaterial = (boundProviderKey(workspace, "config-signature")?.binding.provider ?? "file") === "file"
      ? captureVaultPurposeContinuity(workspace, "config-signature") : null;
    const artifactFile = [log.sealSigner.descriptor, log.rootSigner.descriptor].some(row => row.mode === "VAULT")
      && (boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file") === "file";
    const artifactMaterial = artifactFile ? captureVaultPurposeContinuity(workspace, "artifact-seal") : null;
    let policyCurrent: (() => void) | null = null;
    const stable = () => checked(() => {
      inputs(); configMaterial?.(); artifactMaterial?.();
      if (secretRef !== null) {
        if (!vaultStatus(workspace).unlocked) throw new Error("original CI notary credential vault is locked");
        if (resolveNotaryAuthSecret(workspace, secretRef) !== originalSecret) throw new Error("original CI notary credential changed");
      }
      configMaterial?.(); artifactMaterial?.(); config.assertCurrent(); log.assertIntrinsicCurrent(); policyCurrent?.(); inputs();
    });
    stable();
    const initialLog = captureTransparencyAppendPublication(workspace);
    const preparingPair = () => checked(() => { stable(); initialLog.assertCurrent(); });
    phase = "policy-sign";
    const prepared = await prepareSignedGatePolicy({ workspace, policyPath: agentPaths.gatePolicy, policy },
      { beforePublish: stable, assertInputsCurrent: preparingPair });
    policyCurrent = prepared.assertCurrent; preparingPair();
    phase = "policy-pair"; pairEntered = true;
    // The real helper calls this after native return and BEFORE observe: record return only, never synthesize acknowledgment.
    const savedPolicy = prepared.publish(path => returnedPolicyMembers.push(path));
    pairReturned = true; preparingPair();
    phase = "log-initialization"; preparingPair(); initializationEntered = true;
    // Original full-family state retires at actual synchronous init capture. Stable members never replay that old CAS.
    const initialized = await initTransparencyLogAttemptAsync(workspace, stable);
    initialization = initialized.progress; stable();
    phase = "gate-policy-log";
    const appended = await appendTransparencyEntryAttemptAsync({ workspace, type: "GATE_POLICY_SIGNED", agentId: "system",
      artifact: { kind: "policy", sha256: prepared.digestSha256, id: "gate-policy" } }, {
      beforeCommit: () => checked(() => { stable(); initialized.assertCurrent(); }), beforeMember: stable
    });
    entryHash = appended.entry.hash;
    const latest = () => checked(() => { stable(); appended.assertCurrent(); });
    phase = "workflow-suffix"; latest(); workflowEntered = true;
    const written = writeCiWorkflowSuffix({ workspace }, agentId, agentPaths, true, savedPolicy, () => {
      latest(); phase = "workflow-write"; workflowWriteSelected = true;
    });
    workflowHelperReturned = true; phase = "workflow-readback";
    const own = captureOrgFiles([workflowPath]), row = own.members[0];
    if (row === undefined || row.mode !== 0o644 || row.bytes === null || !row.bytes.equals(Buffer.from(written.wire, "utf8")))
      throw new Error("returned CI workflow differs from exact intended bytes or mode");
    expectedWorkflow = own; workflowAcknowledged = true;
    const completed = () => checked(() => { latest(); assertOrgPairsCurrent(expectedWorkflow); });
    completed(); phase = "complete";
    return Object.freeze({ result: written.result, assertCurrent() {
      try { completed(); } catch (cause) { throw failure(cause); }
    } });
  } catch (cause) {
    // Preserve genuine early provider/locked diagnostics; this says nothing about public-reader/warm/migration effects.
    if (!pairEntered && !initializationEntered && !workflowEntered) throw cause;
    throw failure(cause);
  }
}


export function printCiSteps(params: {
  workspace: string;
  agentId?: string;
}): string[] {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const agentPaths = getAgentPaths(params.workspace, agentId);
  const bundlePath = join(agentPaths.bundlesDir, "latest.amcbundle");
  return [
    "npm ci",
    "npm run build",
    pinnedBundleVerify(relativeAgentPathFromWorkspace(params.workspace, bundlePath), "$AMC_AUDITOR_PUB_FILE"),
    `amc outcomes report --agent ${agentId} --window 14d --out ${relativeAgentPathFromWorkspace(
      params.workspace,
      join(agentPaths.rootDir, "outcomes", "reports", "ci-latest.json")
    )}`,
    `if [ -n "$AMC_EXPERIMENT_ID" ] && [ -f "${relativeAgentPathFromWorkspace(
      params.workspace,
      join(agentPaths.rootDir, "experimentGate.json")
    )}" ]; then amc experiment gate --agent ${agentId} --experiment "$AMC_EXPERIMENT_ID" --policy ${relativeAgentPathFromWorkspace(
      params.workspace,
      join(agentPaths.rootDir, "experimentGate.json")
    )}; fi`,
    `amc gate --bundle ${relativeAgentPathFromWorkspace(params.workspace, bundlePath)} --policy ${relativeAgentPathFromWorkspace(params.workspace, agentPaths.gatePolicy)}`
  ];
}

export async function runBundleGate(params: {
  workspace: string;
  bundlePath: string;
  policyPath: string;
  requireSignedPolicy?: boolean;
}): Promise<{ pass: boolean; reasons: string[]; report: DiagnosticReport; policy: GatePolicy }> {
  // The gate checks a bundle against this workspace's own keys (workspace-self), so a bundle signed elsewhere fails.
  const verification = await verifyEvidenceBundle(resolve(params.workspace, params.bundlePath), workspaceSelfTrust(params.workspace));
  const reasons: string[] = [];
  if (!verification.ok) {
    reasons.push(...untrustedReasons(verification.report).map((error) => `bundle verify failed: ${error}`));
  }

  const policyRaw = JSON.parse(readFileSync(resolve(params.workspace, params.policyPath), "utf8")) as unknown;
  const policy = parseGatePolicy(policyRaw);
  if (params.requireSignedPolicy !== false) {
    const signature = verifyGatePolicySignature({
      workspace: params.workspace,
      policyPath: params.policyPath
    });
    if (!signature.valid) {
      reasons.push(`gate policy signature invalid: ${signature.reason ?? "unknown"}`);
    }
  }

  const loaded = loadBundleRunAndTrustMap(resolve(params.workspace, params.bundlePath));
  const evaluation = evaluateGatePolicy({
    report: loaded.run,
    policy,
    eventTrustTier: loaded.eventTrustTier
  });
  reasons.push(...evaluation.reasons);

  const outcome = loaded.outcomeReport;
  if (typeof policy.minValueScore === "number") {
    const measured = typeof outcome?.valueScore === "number" ? outcome.valueScore : null;
    if (measured === null) {
      reasons.push("Value gate configured but outcomes/report.json is missing in bundle.");
    } else if (measured < policy.minValueScore) {
      reasons.push(`ValueScore ${measured.toFixed(3)} is below minimum ${policy.minValueScore.toFixed(3)}.`);
    }
  }
  if (typeof policy.minEconomicSignificanceIndex === "number") {
    const measured = typeof outcome?.economicSignificanceIndex === "number" ? outcome.economicSignificanceIndex : null;
    if (measured === null) {
      reasons.push("Economic significance gate configured but outcomes/report.json is missing in bundle.");
    } else if (measured < policy.minEconomicSignificanceIndex) {
      reasons.push(
        `EconomicSignificanceIndex ${measured.toFixed(3)} is below minimum ${policy.minEconomicSignificanceIndex.toFixed(3)}.`
      );
    }
  }
  if (policy.denyIfValueRegression) {
    const regression = typeof outcome?.valueRegressionRisk === "number" ? outcome.valueRegressionRisk : null;
    if (regression === null) {
      reasons.push("Value regression gate configured but outcomes/report.json is missing in bundle.");
    } else if (regression > 0) {
      reasons.push(`Value regression detected (ValueRegressionRisk=${regression.toFixed(3)}).`);
    }
  }

  const experiment = loaded.experimentReport;
  if (policy.requireExperimentPass?.enabled) {
    if (!experiment) {
      reasons.push("Experiment gate enabled but experiments/report.json is missing in bundle.");
    } else {
      const experimentId = typeof experiment.experimentId === "string" ? experiment.experimentId : null;
      const upliftSuccessRate =
        typeof experiment.upliftSuccessRate === "number" ? experiment.upliftSuccessRate : Number.NaN;
      const upliftValuePoints =
        typeof experiment.upliftValuePoints === "number" ? experiment.upliftValuePoints : Number.NaN;
      if (!experimentId) {
        reasons.push("Experiment report is present but missing experimentId.");
      } else if (experimentId !== policy.requireExperimentPass.experimentId) {
        reasons.push(
          `Experiment ID mismatch: expected ${policy.requireExperimentPass.experimentId}, got ${experimentId}.`
        );
      }
      if (!Number.isFinite(upliftSuccessRate)) {
        reasons.push("Experiment report missing upliftSuccessRate.");
      } else if (upliftSuccessRate < policy.requireExperimentPass.minUpliftSuccessRate) {
        reasons.push(
          `Experiment upliftSuccessRate ${upliftSuccessRate.toFixed(4)} is below ${policy.requireExperimentPass.minUpliftSuccessRate.toFixed(4)}.`
        );
      }
      if (!Number.isFinite(upliftValuePoints)) {
        reasons.push("Experiment report missing upliftValuePoints.");
      } else if (upliftValuePoints < policy.requireExperimentPass.minUpliftValuePoints) {
        reasons.push(
          `Experiment upliftValuePoints ${upliftValuePoints.toFixed(4)} is below ${policy.requireExperimentPass.minUpliftValuePoints.toFixed(4)}.`
        );
      }
    }
  }
  if (typeof policy.maxCostIncreaseRatio === "number" && experiment) {
    const baseline =
      typeof experiment.baselineCostPerSuccess === "number" ? experiment.baselineCostPerSuccess : Number.NaN;
    const candidate =
      typeof experiment.candidateCostPerSuccess === "number" ? experiment.candidateCostPerSuccess : Number.NaN;
    if (Number.isFinite(baseline) && Number.isFinite(candidate) && baseline > 0) {
      const ratio = candidate / baseline;
      if (ratio > policy.maxCostIncreaseRatio) {
        reasons.push(`Experiment cost increase ratio ${ratio.toFixed(4)} exceeds ${policy.maxCostIncreaseRatio.toFixed(4)}.`);
      }
    }
  }

  return {
    pass: reasons.length === 0,
    reasons,
    report: loaded.run,
    policy
  };
}

function releaseGateRowHash(row: Omit<ReleaseGateReceiptRow, "rowHash">): string {
  return hashAuditEvidence(row);
}

function releaseGateReceiptHash(receipt: Omit<ReleaseGateReceipt, "receiptHash">): string {
  return hashAuditEvidence(receipt);
}

function releaseGateOverrideValid(override: ReleaseGateOverrideRecord | undefined): boolean {
  if (!override) {
    return true;
  }
  return Boolean(
    override.overrideId
    && override.status
    && override.requesterId
    && override.approverId
    && override.reason
    && timestampPresent(override.decidedAt)
    && override.signedEvidenceRef
    && isSha256(override.signatureSha256)
  );
}

const requiredReleaseGateControls: ReleaseGateControlKind[] = ["score", "security", "compliance", "cost", "observability"];

function releaseGateControlStatus(controlEvidence: ReleaseGateControlEvidence[] | undefined): ReleaseGateControlStatus {
  if (!controlEvidence) {
    return "not_recorded";
  }
  const byControl = new Map(controlEvidence.map((evidence) => [evidence.control, evidence]));
  if (requiredReleaseGateControls.some((control) => !byControl.has(control))) {
    return "missing";
  }
  if (controlEvidence.some((evidence) => !evidence.evidenceRef || !evidence.reason)) {
    return "missing";
  }
  return controlEvidence.every((evidence) => evidence.passed) ? "passed" : "failed";
}

function releaseGateControlEvidenceReasons(params: {
  gateLabel: string;
  passed: boolean;
  failureReasons: string[];
  controlEvidence: ReleaseGateControlEvidence[] | undefined;
}): string[] {
  if (!params.controlEvidence) {
    return [];
  }
  const reasons: string[] = [];
  const byControl = new Map(params.controlEvidence.map((evidence) => [evidence.control, evidence]));
  for (const control of requiredReleaseGateControls) {
    const evidence = byControl.get(control);
    if (!evidence) {
      reasons.push(`${params.gateLabel}:controlEvidence:${control}:missing`);
      continue;
    }
    if (!evidence.evidenceRef) {
      reasons.push(`${params.gateLabel}:controlEvidence:${control}:evidenceRef:missing`);
    }
    if (!evidence.reason) {
      reasons.push(`${params.gateLabel}:controlEvidence:${control}:reason:missing`);
    }
    if (params.passed && !evidence.passed) {
      reasons.push(`${params.gateLabel}:controlEvidence:${control}:failed`);
    }
  }
  if (!params.passed && params.controlEvidence.some((evidence) => !evidence.passed) && params.failureReasons.length === 0) {
    reasons.push(`${params.gateLabel}:controlEvidence:failureReason:missing`);
  }
  return reasons;
}

function validateReleaseGateRow(row: ReleaseGateReceiptRow): string[] {
  const reasons: string[] = [];
  if (!row.gateId) reasons.push("gateId:missing");
  if (!row.agentId) reasons.push(`${row.gateId || "unknown"}:agentId:missing`);
  if (!["development", "staging", "production"].includes(row.environment)) {
    reasons.push(`${row.gateId || "unknown"}:environment:invalid`);
  }
  try {
    parseGatePolicy(row.gateConfig);
  } catch {
    reasons.push(`${row.gateId || "unknown"}:gateConfig:invalid`);
  }
  if (!isSha256(row.gateConfigHash)) reasons.push(`${row.gateId || "unknown"}:gateConfigHash:invalid`);
  if (!timestampPresent(row.evaluatedAt)) reasons.push(`${row.gateId || "unknown"}:evaluatedAt:missing`);
  if (!row.passed && row.failureReasons.length === 0) {
    reasons.push(`${row.gateId || "unknown"}:failureReason:missing`);
  }
  if (!row.runReceiptRef || !isSha256(row.runReceiptHash)) {
    reasons.push(`${row.gateId || "unknown"}:runReceipt:missing`);
  }
  if (!releaseGateEvidenceValid(row.evidenceRefs)) {
    reasons.push(`${row.gateId || "unknown"}:evidenceChain:missing`);
  }
  const recalculatedConfigHash = hashAuditEvidence(row.gateConfig);
  if (row.gateConfigHash !== recalculatedConfigHash) {
    reasons.push(`${row.gateId || "unknown"}:gateConfigHash:mismatch`);
  }
  if (row.evidenceChainHash !== hashAuditEvidence(row.evidenceRefs)) {
    reasons.push(`${row.gateId || "unknown"}:evidenceChainHash:mismatch`);
  }
  const expectedControlStatus = releaseGateControlStatus(row.controlEvidence.length > 0 ? row.controlEvidence : undefined);
  if (row.controlStatus !== expectedControlStatus) {
    reasons.push(`${row.gateId || "unknown"}:controlStatus:mismatch`);
  }
  reasons.push(...releaseGateControlEvidenceReasons({
    gateLabel: row.gateId || "unknown",
    passed: row.passed,
    failureReasons: row.failureReasons,
    controlEvidence: row.controlEvidence.length > 0 ? row.controlEvidence : undefined
  }));
  const { rowHash: actual, ...baseRow } = row;
  if (releaseGateRowHash(baseRow) !== actual) {
    reasons.push(`${row.gateId || "unknown"}:rowHash:mismatch`);
  }
  return reasons;
}

export function buildReleaseGateReceipt(input: {
  receiptId: string;
  sourceCitations: ReleaseGateSourceCitation[];
  gates: ReleaseGateRunRecord[];
  generatedAt?: string;
}): ReleaseGateReceipt {
  const failClosedReasons: string[] = [];
  const sourceIds = collectAuditSourceIds(input.sourceCitations, failClosedReasons);

  const rows = input.gates.map((gate): ReleaseGateReceiptRow => {
    const gateLabel = gate.gateId || "unknown";
    const sourceCitationIds = gate.sourceCitationIds ?? [...sourceIds];
    if (sourceCitationIds.length === 0) {
      failClosedReasons.push(`${gateLabel}:sourceCitation:missing`);
    }
    if (sourceCitationIds.some((sourceId) => !sourceIds.has(sourceId))) {
      failClosedReasons.push(`${gateLabel}:sourceCitation:unknown`);
    }
    try {
      parseGatePolicy(gate.gateConfig);
    } catch {
      failClosedReasons.push(`${gateLabel}:gateConfig:invalid`);
    }
    if (!timestampPresent(gate.evaluatedAt)) {
      failClosedReasons.push(`${gateLabel}:evaluatedAt:missing`);
    }
    if (!gate.passed && gate.failureReasons.length === 0) {
      failClosedReasons.push(`${gateLabel}:failureReason:missing`);
    }
    if (!gate.runReceiptRef || !isSha256(gate.runReceiptHash)) {
      failClosedReasons.push(`${gateLabel}:runReceipt:missing`);
    }
    if (!releaseGateEvidenceValid(gate.evidenceRefs)) {
      failClosedReasons.push(`${gateLabel}:evidenceChain:missing`);
    }
    if (gate.override && !releaseGateOverrideValid(gate.override)) {
      failClosedReasons.push(`${gateLabel}:override:missing`);
    }
    failClosedReasons.push(...releaseGateControlEvidenceReasons({
      gateLabel,
      passed: gate.passed,
      failureReasons: gate.failureReasons,
      controlEvidence: gate.controlEvidence
    }));

    const gateConfigHash = hashAuditEvidence(gate.gateConfig);
    const evidenceChainHash = hashAuditEvidence(gate.evidenceRefs);
    const controlEvidence = gate.controlEvidence ?? [];
    const baseRow: Omit<ReleaseGateReceiptRow, "rowHash"> = {
      gateId: gate.gateId,
      agentId: gate.agentId,
      environment: gate.environment,
      gateConfig: gate.gateConfig,
      gateConfigHash,
      policyPath: gate.policyPath ?? null,
      bundlePath: gate.bundlePath ?? null,
      evaluatedAt: gate.evaluatedAt,
      passed: gate.passed,
      failureReasons: gate.failureReasons,
      runReceiptRef: gate.runReceiptRef,
      runReceiptHash: gate.runReceiptHash,
      overrideStatus: gate.override?.status ?? "none",
      overrideId: gate.override?.overrideId ?? null,
      controlStatus: releaseGateControlStatus(gate.controlEvidence),
      controlEvidence,
      sourceCitationIds,
      evidenceRefs: gate.evidenceRefs,
      evidenceChainHash
    };
    return {
      ...baseRow,
      rowHash: releaseGateRowHash(baseRow)
    };
  });

  if (rows.length === 0) {
    failClosedReasons.push("rows:missing");
  }

  return finalizeAuditEvidenceReceipt(input, rows, failClosedReasons);
}

export function verifyReleaseGateReceipt(receipt: ReleaseGateReceipt): ReleaseGateReceiptVerification {
  const reasons = beginAuditReceiptVerification(receipt, "rows:missing");
  for (const row of receipt.rows) {
    reasons.push(...validateReleaseGateRow(row));
  }
  const { receiptHash: actual, ...withoutHash } = receipt;
  if (releaseGateReceiptHash(withoutHash) !== actual) {
    reasons.push("receiptHash:mismatch");
  }
  return {
    valid: reasons.length === 0,
    reasons: unique(reasons)
  };
}

export function renderReleaseGateAuditExport(receipt: ReleaseGateReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Release Gate Audit Export");
  lines.push("");
  lines.push(`- Receipt: \`${receipt.receiptId}\``);
  lines.push(`- Generated: \`${receipt.generatedAt}\``);
  lines.push(`- Status: ${receipt.failClosed ? "FAIL-CLOSED" : "VALID"}`);
  lines.push(`- Receipt hash: \`${receipt.receiptHash}\``);
  lines.push("");
  lines.push("## Source Citations");
  for (const citation of receipt.sourceCitations) {
    lines.push(`- ${citation.sourceId}: ${citation.title} (${citation.url})`);
  }
  lines.push("");
  lines.push("## Release Gates");
  lines.push("");
  lines.push("| Gate | Agent | Environment | Result | Control status | Override | Run receipt | Failure reasons |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of receipt.rows) {
    lines.push([
      row.gateId,
      row.agentId,
      row.environment,
      row.passed ? "passed" : "failed",
      `control ${row.controlStatus}`,
      `override ${row.overrideStatus}`,
      `${row.runReceiptRef || "MISSING"} (${row.runReceiptHash || "MISSING"})`,
      row.failureReasons.join("; ") || "none"
    ].map((value) => value.replace(/\|/g, "\\|")).join(" | ").replace(/^/, "| ").concat(" |"));
  }
  if (receipt.rows.some((row) => row.controlEvidence.length > 0)) {
    lines.push("");
    lines.push("## Release Controls");
    lines.push("");
    lines.push("| Gate | Control | Result | Evidence | Reason |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of receipt.rows) {
      for (const control of row.controlEvidence) {
        lines.push([
          row.gateId,
          control.control,
          control.passed ? "passed" : "failed",
          control.evidenceRef || "MISSING",
          control.reason || "missing"
        ].map((value) => value.replace(/\|/g, "\\|")).join(" | ").replace(/^/, "| ").concat(" |"));
      }
    }
  }
  return finalizeAuditEvidenceExport(lines, receipt);
}
