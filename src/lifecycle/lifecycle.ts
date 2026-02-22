import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

export const lifecycleStages = [
  "development",
  "testing",
  "staging",
  "production",
  "deprecated"
] as const;

export type AgentLifecycleStage = (typeof lifecycleStages)[number];

export const lifecycleRoles = ["developer", "deployer", "operator"] as const;
export type LifecycleRole = (typeof lifecycleRoles)[number];

export interface LifecycleStageDefinition {
  stage: AgentLifecycleStage;
  description: string;
  terminal: boolean;
  canAdvanceTo: AgentLifecycleStage[];
}

export interface LifecycleResponsibilityAssignment {
  accountable: LifecycleRole;
  supports: LifecycleRole[];
  decisionScope: string;
}

export interface GovernanceGateRequirement {
  controlId: string;
  title: string;
  description: string;
  owner: LifecycleRole;
}

export interface LifecycleTransitionRecord {
  transitionId: string;
  fromStage: AgentLifecycleStage;
  toStage: AgentLifecycleStage;
  ts: number;
  actor: string;
  actorRole: LifecycleRole;
  controlsSatisfied: string[];
  note: string | null;
}

export interface AgentLifecycleState {
  agentId: string;
  currentStage: AgentLifecycleStage;
  createdTs: number;
  updatedTs: number;
  stageEnteredTs: Record<AgentLifecycleStage, number | null>;
  transitionTrail: LifecycleTransitionRecord[];
}

export interface AgentLifecycleStatus {
  agentId: string;
  currentStage: AgentLifecycleStage;
  stageDefinitions: Record<AgentLifecycleStage, LifecycleStageDefinition>;
  responsibilityMatrix: Record<AgentLifecycleStage, LifecycleResponsibilityAssignment>;
  governanceGatesByTargetStage: Record<AgentLifecycleStage, GovernanceGateRequirement[]>;
  nextAllowedStages: AgentLifecycleStage[];
  stageEnteredTs: Record<AgentLifecycleStage, number | null>;
  transitionTrail: LifecycleTransitionRecord[];
}

export interface AdvanceLifecycleInput {
  workspace: string;
  agentId?: string;
  toStage: AgentLifecycleStage;
  actor: string;
  actorRole: LifecycleRole;
  controlsSatisfied?: string[];
  note?: string;
  ts?: number;
}

export interface AdvanceLifecycleResult {
  agentId: string;
  fromStage: AgentLifecycleStage;
  toStage: AgentLifecycleStage;
  requiredControls: string[];
  transition: LifecycleTransitionRecord;
  state: AgentLifecycleState;
}

const lifecycleStageSchema = z.enum(lifecycleStages);
const lifecycleRoleSchema = z.enum(lifecycleRoles);

const stageEnteredTsSchema = z.object({
  development: z.number().int().nullable(),
  testing: z.number().int().nullable(),
  staging: z.number().int().nullable(),
  production: z.number().int().nullable(),
  deprecated: z.number().int().nullable()
});

const lifecycleTransitionSchema = z.object({
  transitionId: z.string().min(1),
  fromStage: lifecycleStageSchema,
  toStage: lifecycleStageSchema,
  ts: z.number().int().nonnegative(),
  actor: z.string().min(1),
  actorRole: lifecycleRoleSchema,
  controlsSatisfied: z.array(z.string().min(1)),
  note: z.string().nullable()
});

const lifecycleStateSchema = z.object({
  agentId: z.string().min(1),
  currentStage: lifecycleStageSchema,
  createdTs: z.number().int().nonnegative(),
  updatedTs: z.number().int().nonnegative(),
  stageEnteredTs: stageEnteredTsSchema,
  transitionTrail: z.array(lifecycleTransitionSchema)
});

const lifecycleStageSet = new Set<AgentLifecycleStage>(lifecycleStages);
const lifecycleRoleSet = new Set<LifecycleRole>(lifecycleRoles);

const allowedTransitions: Record<AgentLifecycleStage, AgentLifecycleStage[]> = {
  development: ["testing", "deprecated"],
  testing: ["staging", "deprecated"],
  staging: ["production", "deprecated"],
  production: ["deprecated"],
  deprecated: []
};

export const lifecycleStageDefinitions: Record<AgentLifecycleStage, LifecycleStageDefinition> = {
  development: {
    stage: "development",
    description: "Feature construction and local validation.",
    terminal: false,
    canAdvanceTo: [...allowedTransitions.development]
  },
  testing: {
    stage: "testing",
    description: "Formal test execution and failure triage.",
    terminal: false,
    canAdvanceTo: [...allowedTransitions.testing]
  },
  staging: {
    stage: "staging",
    description: "Pre-production verification in deployment-like conditions.",
    terminal: false,
    canAdvanceTo: [...allowedTransitions.staging]
  },
  production: {
    stage: "production",
    description: "Live operation under monitoring and governance controls.",
    terminal: false,
    canAdvanceTo: [...allowedTransitions.production]
  },
  deprecated: {
    stage: "deprecated",
    description: "Retired from active use; no further progression allowed.",
    terminal: true,
    canAdvanceTo: []
  }
};

export const lifecycleResponsibilityMatrix: Record<AgentLifecycleStage, LifecycleResponsibilityAssignment> = {
  development: {
    accountable: "developer",
    supports: ["deployer", "operator"],
    decisionScope: "Implementation quality, test design, and risk identification."
  },
  testing: {
    accountable: "developer",
    supports: ["deployer", "operator"],
    decisionScope: "Verification depth, defect closure, and release readiness evidence."
  },
  staging: {
    accountable: "deployer",
    supports: ["developer", "operator"],
    decisionScope: "Deployment workflow integrity and pre-production acceptance."
  },
  production: {
    accountable: "operator",
    supports: ["deployer", "developer"],
    decisionScope: "Operational safety, reliability, and incident response quality."
  },
  deprecated: {
    accountable: "operator",
    supports: ["developer", "deployer"],
    decisionScope: "Retirement controls, archival, and decommission governance."
  }
};

export const lifecycleGovernanceGatesByTargetStage: Record<AgentLifecycleStage, GovernanceGateRequirement[]> = {
  development: [],
  testing: [
    {
      controlId: "owner_charter_defined",
      title: "Owner Charter Defined",
      description: "Agent scope and risk assumptions are documented and acknowledged.",
      owner: "developer"
    },
    {
      controlId: "unit_tests_passing",
      title: "Unit Tests Passing",
      description: "Core functionality has deterministic test coverage with green results.",
      owner: "developer"
    },
    {
      controlId: "risk_assessment_documented",
      title: "Risk Assessment Documented",
      description: "Primary misuse/failure modes and mitigations are captured.",
      owner: "developer"
    }
  ],
  staging: [
    {
      controlId: "integration_tests_passing",
      title: "Integration Tests Passing",
      description: "Cross-component workflows pass in environment-like conditions.",
      owner: "developer"
    },
    {
      controlId: "security_review_signed",
      title: "Security Review Signed",
      description: "Security review output is approved for staging promotion.",
      owner: "deployer"
    },
    {
      controlId: "deployment_plan_approved",
      title: "Deployment Plan Approved",
      description: "Deployment procedure, rollback path, and ownership are approved.",
      owner: "deployer"
    }
  ],
  production: [
    {
      controlId: "assurance_pack_passing",
      title: "Assurance Pack Passing",
      description: "High-risk assurance checks are passing for the release candidate.",
      owner: "deployer"
    },
    {
      controlId: "rollback_plan_validated",
      title: "Rollback Plan Validated",
      description: "Rollback execution path has been exercised and validated.",
      owner: "deployer"
    },
    {
      controlId: "monitoring_slo_enabled",
      title: "Monitoring and SLO Enabled",
      description: "Operational telemetry and SLO alerting are active.",
      owner: "operator"
    },
    {
      controlId: "operator_handoff_acknowledged",
      title: "Operator Handoff Acknowledged",
      description: "On-call/operator acceptance is recorded before go-live.",
      owner: "operator"
    }
  ],
  deprecated: [
    {
      controlId: "deprecation_notice_approved",
      title: "Deprecation Notice Approved",
      description: "Stakeholder communication for retirement is approved and published.",
      owner: "operator"
    },
    {
      controlId: "data_retention_reviewed",
      title: "Data Retention Reviewed",
      description: "Retention and archival requirements are completed before shutdown.",
      owner: "operator"
    },
    {
      controlId: "shutdown_runbook_completed",
      title: "Shutdown Runbook Completed",
      description: "Decommission checklist is completed and stored as audit evidence.",
      owner: "deployer"
    }
  ]
};

export function lifecyclePath(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "lifecycle", "state.json");
}

export function parseLifecycleStage(value: string): AgentLifecycleStage {
  const normalized = value.trim().toLowerCase() as AgentLifecycleStage;
  if (!lifecycleStageSet.has(normalized)) {
    throw new Error(
      `Invalid lifecycle stage "${value}". Expected one of: ${lifecycleStages.join(", ")}.`
    );
  }
  return normalized;
}

export function parseLifecycleRole(value: string): LifecycleRole {
  const normalized = value.trim().toLowerCase() as LifecycleRole;
  if (!lifecycleRoleSet.has(normalized)) {
    throw new Error(
      `Invalid lifecycle role "${value}". Expected one of: ${lifecycleRoles.join(", ")}.`
    );
  }
  return normalized;
}

export function requiredControlsForStage(stage: AgentLifecycleStage): string[] {
  return lifecycleGovernanceGatesByTargetStage[stage].map((gate) => gate.controlId);
}

function normalizeControls(controls: string[]): string[] {
  return Array.from(
    new Set(
      controls
        .map((control) => control.trim())
        .filter((control) => control.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function defaultStageEnteredTs(now: number): Record<AgentLifecycleStage, number | null> {
  return {
    development: now,
    testing: null,
    staging: null,
    production: null,
    deprecated: null
  };
}

function defaultLifecycleState(agentId: string, now = Date.now()): AgentLifecycleState {
  return {
    agentId,
    currentStage: "development",
    createdTs: now,
    updatedTs: now,
    stageEnteredTs: defaultStageEnteredTs(now),
    transitionTrail: []
  };
}

function saveLifecycleState(workspace: string, agentId: string, state: AgentLifecycleState): void {
  const path = lifecyclePath(workspace, agentId);
  ensureDir(join(path, ".."));
  writeFileAtomic(path, JSON.stringify(lifecycleStateSchema.parse(state), null, 2), 0o644);
}

function loadLifecycleState(workspace: string, agentId: string): AgentLifecycleState {
  const path = lifecyclePath(workspace, agentId);
  if (!pathExists(path)) {
    const created = defaultLifecycleState(agentId);
    saveLifecycleState(workspace, agentId, created);
    return created;
  }

  const parsed = lifecycleStateSchema.parse(JSON.parse(readUtf8(path)) as unknown);
  if (parsed.agentId !== agentId) {
    throw new Error(
      `Lifecycle state agent mismatch at ${path}: expected ${agentId}, found ${parsed.agentId}.`
    );
  }
  return parsed;
}

export function lifecycleStatus(workspace: string, agentId?: string): AgentLifecycleStatus {
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const state = loadLifecycleState(workspace, resolvedAgentId);
  const currentStage = state.currentStage;
  return {
    agentId: state.agentId,
    currentStage,
    stageDefinitions: lifecycleStageDefinitions,
    responsibilityMatrix: lifecycleResponsibilityMatrix,
    governanceGatesByTargetStage: lifecycleGovernanceGatesByTargetStage,
    nextAllowedStages: [...allowedTransitions[currentStage]],
    stageEnteredTs: { ...state.stageEnteredTs },
    transitionTrail: [...state.transitionTrail]
  };
}

export function advanceLifecycleStage(params: AdvanceLifecycleInput): AdvanceLifecycleResult {
  const resolvedAgentId = resolveAgentId(params.workspace, params.agentId);
  const state = loadLifecycleState(params.workspace, resolvedAgentId);

  const fromStage = state.currentStage;
  const toStage = params.toStage;
  if (fromStage === toStage) {
    throw new Error(`Agent ${resolvedAgentId} is already in lifecycle stage "${toStage}".`);
  }

  const nextStages = allowedTransitions[fromStage];
  if (!nextStages.includes(toStage)) {
    throw new Error(
      `Invalid lifecycle transition: ${fromStage} -> ${toStage}. Allowed targets: ${nextStages.join(", ") || "none"}.`
    );
  }

  const requiredControls = requiredControlsForStage(toStage);
  const normalizedControls = normalizeControls(params.controlsSatisfied ?? []);
  const confirmedControls = new Set(normalizedControls);
  const missingControls = requiredControls.filter((control) => !confirmedControls.has(control));
  if (missingControls.length > 0) {
    throw new Error(
      `Cannot advance ${fromStage} -> ${toStage}. Missing required controls: ${missingControls.join(", ")}.`
    );
  }

  const ts = params.ts ?? Date.now();
  const transition: LifecycleTransitionRecord = {
    transitionId: `lctr_${randomUUID().replace(/-/g, "")}`,
    fromStage,
    toStage,
    ts,
    actor: params.actor.trim(),
    actorRole: params.actorRole,
    controlsSatisfied: normalizedControls,
    note: params.note?.trim() ? params.note.trim() : null
  };

  state.currentStage = toStage;
  state.updatedTs = ts;
  state.stageEnteredTs[toStage] = ts;
  state.transitionTrail.push(transition);

  saveLifecycleState(params.workspace, resolvedAgentId, state);

  return {
    agentId: resolvedAgentId,
    fromStage,
    toStage,
    requiredControls,
    transition,
    state
  };
}
