import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { signFileWithAuditor } from "../org/orgSigner.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { runAutoAnswer } from "../diagnostic/autoAnswer/autoAnswerEngine.js";
import { loadLatestMechanicPlan, loadMechanicPlanById, saveMechanicPlan, verifyMechanicPlanSignatures } from "./planStore.js";
import {
  initMechanicTargets,
  loadMechanicTargets,
  saveMechanicTargets,
  verifyMechanicTargetsSignature,
  mechanicRoot
} from "./targetsStore.js";
import {
  initMechanicProfiles,
  listMechanicProfiles,
  applyMechanicProfile,
  verifyMechanicProfilesSignature
} from "./profiles.js";
import {
  initMechanicTuning,
  loadMechanicTuning,
  saveMechanicTuning,
  verifyMechanicTuningSignature
} from "./tuningStore.js";
import { buildGapAnalysis } from "./gapAnalysis.js";
import { createMechanicUpgradePlan } from "./upgradePlanner.js";
import { diffMechanicPlanAgainstCurrent } from "./planDiff.js";
import { requestPlanApprovals } from "./executionEngine.js";
import { mechanicPlanExecuteForAuthority } from "./mechanicExecutionPublication.js";
import { loadLatestMechanicSimulation, simulateMechanicPlan, verifyMechanicSimulationSignature } from "./simulator.js";
import { mechanicGapReportSchema } from "./mechanicSchema.js";
import type { MechanicScope, MechanicTargets } from "./targetSchema.js";
import type { MechanicTuning } from "./tuningSchema.js";

function normalizeScope(params: {
  scopeType?: string | null;
  scopeId?: string | null;
}): MechanicScope {
  const typeRaw = String(params.scopeType ?? "WORKSPACE").toUpperCase();
  const type = typeRaw === "AGENT" || typeRaw === "NODE" ? typeRaw : "WORKSPACE";
  const id = (params.scopeId ?? (type === "WORKSPACE" ? "workspace" : "default")).trim() || (type === "WORKSPACE" ? "workspace" : "default");
  return { type, id } as MechanicScope;
}

function gapReportPath(workspace: string, ts: number): string {
  return join(mechanicRoot(workspace), "reports", `gap_${ts}.json`);
}

function saveGapReport(workspace: string, report: ReturnType<typeof mechanicGapReportSchema.parse>): {
  path: string;
  sigPath: string;
} {
  const path = gapReportPath(workspace, report.generatedTs);
  ensureDir(join(mechanicRoot(workspace), "reports"));
  writeFileAtomic(path, `${JSON.stringify(report, null, 2)}\n`, 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return {
    path,
    sigPath
  };
}

function appendMechanicTransparency(params: {
  workspace: string;
  type:
    | "MECHANIC_TARGETS_APPLIED"
    | "MECHANIC_PROFILE_APPLIED"
    | "MECHANIC_PLAN_CREATED"
    | "MECHANIC_PLAN_APPROVAL_REQUESTED"
    | "MECHANIC_PLAN_EXECUTED"
    | "MECHANIC_PLAN_EXECUTION_FAILED"
    | "MECHANIC_SIMULATION_CREATED";
  scopeId: string;
  sha256: string;
  artifactId: string;
}): string {
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: params.type,
    agentId: params.scopeId,
    artifact: {
      kind: "policy",
      sha256: params.sha256,
      id: params.artifactId
    }
  });
  return entry.hash;
}

export function initMechanicWorkspace(params: {
  workspace: string;
  scopeType?: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
}) {
  const scope = normalizeScope({
    scopeType: params.scopeType ?? "WORKSPACE",
    scopeId: params.scopeId ?? "workspace"
  });
  const targets = initMechanicTargets({
    workspace: params.workspace,
    scope,
    mode: "DESIRED"
  });
  const profiles = initMechanicProfiles(params.workspace);
  const tuning = initMechanicTuning({
    workspace: params.workspace,
    scope
  });
  return {
    targets,
    profiles,
    tuning
  };
}

export function mechanicTargetsForApi(workspace: string): {
  targets: MechanicTargets;
  signature: ReturnType<typeof verifyMechanicTargetsSignature>;
} {
  return {
    targets: loadMechanicTargets(workspace),
    signature: verifyMechanicTargetsSignature(workspace)
  };
}

export function mechanicTargetsApplyForApi(params: {
  workspace: string;
  targets: MechanicTargets;
  reason: string;
  actor: string;
}) {
  const saved = saveMechanicTargets({
    workspace: params.workspace,
    targets: params.targets,
    reason: params.reason
  });
  const digest = sha256Hex(readFileSync(saved.path));
  const transparencyHash = appendMechanicTransparency({
    workspace: params.workspace,
    type: "MECHANIC_TARGETS_APPLIED",
    scopeId: params.targets.mechanicTargets.scope.id,
    sha256: digest,
    artifactId: `${params.targets.mechanicTargets.scope.type}:${params.targets.mechanicTargets.scope.id}`
  });
  return {
    ...saved,
    actor: params.actor,
    transparencyHash
  };
}

export function mechanicProfilesForApi(workspace: string): {
  profiles: ReturnType<typeof listMechanicProfiles>;
  signature: ReturnType<typeof verifyMechanicProfilesSignature>;
} {
  return {
    profiles: listMechanicProfiles(workspace),
    signature: verifyMechanicProfilesSignature(workspace)
  };
}

export function mechanicProfileApplyForApi(params: {
  workspace: string;
  profileId: string;
  mode: "DESIRED" | "EXCELLENCE";
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  reason: string;
  actor: string;
}) {
  const applied = applyMechanicProfile({
    workspace: params.workspace,
    profileId: params.profileId,
    mode: params.mode,
    scopeType: params.scopeType,
    scopeId: params.scopeId,
    reason: params.reason
  });
  const digest = sha256Hex(readFileSync(applied.path));
  const transparencyHash = appendMechanicTransparency({
    workspace: params.workspace,
    type: "MECHANIC_PROFILE_APPLIED",
    scopeId: params.scopeId,
    sha256: digest,
    artifactId: params.profileId
  });
  return {
    ...applied,
    actor: params.actor,
    transparencyHash
  };
}

export function mechanicTuningForApi(workspace: string): {
  tuning: MechanicTuning;
  signature: ReturnType<typeof verifyMechanicTuningSignature>;
} {
  return {
    tuning: loadMechanicTuning(workspace),
    signature: verifyMechanicTuningSignature(workspace)
  };
}

export function mechanicTuningApplyForApi(params: {
  workspace: string;
  tuning: MechanicTuning;
  reason: string;
  actor: string;
}) {
  const saved = saveMechanicTuning({
    workspace: params.workspace,
    tuning: params.tuning,
    reason: params.reason
  });
  const digest = sha256Hex(readFileSync(saved.path));
  const transparencyHash = appendMechanicTransparency({
    workspace: params.workspace,
    type: "MECHANIC_TARGETS_APPLIED",
    scopeId: params.tuning.mechanicTuning.scope.id,
    sha256: digest,
    artifactId: "tuning"
  });
  return {
    ...saved,
    actor: params.actor,
    transparencyHash
  };
}

export async function mechanicGapForApi(params: {
  workspace: string;
  scopeType?: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
}) {
  const scope = normalizeScope({
    scopeType: params.scopeType,
    scopeId: params.scopeId
  });
  const measured = await runAutoAnswer({
    workspace: params.workspace,
    agentId: scope.type === "AGENT" ? scope.id : "default",
    createPlan: false
  });
  const gap = buildGapAnalysis({
    workspace: params.workspace,
    scope,
    targets: loadMechanicTargets(params.workspace),
    measured
  });
  const saved = saveGapReport(params.workspace, gap);
  return {
    gap,
    measured,
    ...saved
  };
}

export async function mechanicCreatePlanForApi(params: {
  workspace: string;
  scopeType?: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
}) {
  const scope = normalizeScope({
    scopeType: params.scopeType,
    scopeId: params.scopeId
  });
  const created = await createMechanicUpgradePlan({
    workspace: params.workspace,
    scopeType: scope.type,
    scopeId: scope.id
  });
  const saved = saveMechanicPlan(params.workspace, created.plan);
  const digest = sha256Hex(readFileSync(saved.latestPath));
  const transparencyHash = appendMechanicTransparency({
    workspace: params.workspace,
    type: "MECHANIC_PLAN_CREATED",
    scopeId: scope.id,
    sha256: digest,
    artifactId: created.plan.planId
  });
  return {
    ...created,
    ...saved,
    transparencyHash
  };
}

export function mechanicLatestPlanForApi(workspace: string): {
  plan: ReturnType<typeof loadLatestMechanicPlan>;
  signatures: ReturnType<typeof verifyMechanicPlanSignatures>;
} {
  return {
    plan: loadLatestMechanicPlan(workspace),
    signatures: verifyMechanicPlanSignatures(workspace)
  };
}

export function mechanicPlanDiffForApi(params: {
  workspace: string;
  planId: string;
}) {
  const plan = loadMechanicPlanById(params.workspace, params.planId);
  return diffMechanicPlanAgainstCurrent({
    workspace: params.workspace,
    plan
  });
}

export function mechanicPlanRequestApprovalForApi(params: {
  workspace: string;
  planId: string;
  actor: string;
  reason: string;
}) {
  const requested = requestPlanApprovals({
    workspace: params.workspace,
    planId: params.planId,
    actor: params.actor,
    reason: params.reason
  });
  const digest = sha256Hex(Buffer.from(JSON.stringify(requested.approvalRequests), "utf8"));
  const transparencyHash = appendMechanicTransparency({
    workspace: params.workspace,
    type: "MECHANIC_PLAN_APPROVAL_REQUESTED",
    scopeId: requested.plan.scope.id,
    sha256: digest,
    artifactId: requested.plan.planId
  });
  return {
    ...requested,
    transparencyHash
  };
}

export async function mechanicPlanExecuteForApi(params: {
  workspace: string;
  planId: string;
}) {
  return mechanicPlanExecuteForAuthority(params, () => {});
}

export async function mechanicSimulateForApi(params: {
  workspace: string;
  planId: string;
}) {
  const plan = loadMechanicPlanById(params.workspace, params.planId);
  const gap = await mechanicGapForApi({
    workspace: params.workspace,
    scopeType: plan.scope.type,
    scopeId: plan.scope.id
  });
  const simulated = simulateMechanicPlan({
    workspace: params.workspace,
    plan,
    integrityIndex: gap.gap.global.integrityIndex,
    correlationRatio: gap.gap.global.correlationRatio
  });
  const digest = sha256Hex(readFileSync(simulated.path));
  const transparencyHash = appendMechanicTransparency({
    workspace: params.workspace,
    type: "MECHANIC_SIMULATION_CREATED",
    scopeId: plan.scope.id,
    sha256: digest,
    artifactId: simulated.simulation.simulationId
  });
  return {
    ...simulated,
    transparencyHash
  };
}

export function mechanicLatestSimulationForApi(workspace: string): {
  simulation: ReturnType<typeof loadLatestMechanicSimulation>;
  signature: ReturnType<typeof verifyMechanicSimulationSignature>;
} {
  return {
    simulation: loadLatestMechanicSimulation(workspace),
    signature: verifyMechanicSimulationSignature(workspace)
  };
}

export function verifyMechanicWorkspace(workspace: string): {
  ok: boolean;
  errors: string[];
  targets: ReturnType<typeof verifyMechanicTargetsSignature>;
  profiles: ReturnType<typeof verifyMechanicProfilesSignature>;
  tuning: ReturnType<typeof verifyMechanicTuningSignature>;
  plans: ReturnType<typeof verifyMechanicPlanSignatures>;
  simulation: ReturnType<typeof verifyMechanicSimulationSignature>;
} {
  const targets = verifyMechanicTargetsSignature(workspace);
  const profiles = verifyMechanicProfilesSignature(workspace);
  const tuning = verifyMechanicTuningSignature(workspace);
  const plans = verifyMechanicPlanSignatures(workspace);
  const simulation = verifyMechanicSimulationSignature(workspace);
  const errors: string[] = [];
  if (!targets.valid) {
    errors.push(`targets: ${targets.reason ?? "invalid signature"}`);
  }
  if (!profiles.valid) {
    errors.push(`profiles: ${profiles.reason ?? "invalid signature"}`);
  }
  if (!tuning.valid) {
    errors.push(`tuning: ${tuning.reason ?? "invalid signature"}`);
  }
  if (plans.latest.signatureExists && !plans.latest.valid) {
    errors.push(`latest plan: ${plans.latest.reason ?? "invalid signature"}`);
  }
  for (const row of plans.snapshots) {
    if (!row.verify.valid) {
      errors.push(`plan snapshot ${row.path}: ${row.verify.reason ?? "invalid signature"}`);
    }
  }
  if (simulation.signatureExists && !simulation.valid) {
    errors.push(`simulation: ${simulation.reason ?? "invalid signature"}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    targets,
    profiles,
    tuning,
    plans,
    simulation
  };
}
