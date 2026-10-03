import { approvalPolicySchema } from "../../approvals/approvalPolicySchema.js";
import { defaultApprovalPolicy } from "../../approvals/approvalPolicyEngine.js";
import { defaultBudgets } from "../../budgets/budgets.js";
import { actionPolicySchema } from "../../governor/actionPolicySchema.js";
import { defaultActionPolicy } from "../../governor/actionPolicyEngine.js";
import { defaultOpsPolicy } from "../../ops/policy.js";
import { defaultRuntimeFirewallPolicy } from "../../runtime/firewall.js";
import { defaultToolsConfig, toolsConfigSchema } from "../../toolhub/toolsSchema.js";
import type { ActionClass } from "../../types.js";
import {
  getDomainMetadata,
  getIndustryAssurancePacksForStation,
  type Domain
} from "../domainRegistry.js";
import { getPacksForDomain } from "../industryPacks.js";
import { checkOperatingProfileConsistency } from "./operatingProfileConsistency.js";
import type {
  OperatingProfile,
  ProfileRiskTier,
  StationOperatingProfileData
} from "./operatingProfileTypes.js";
import { EDUCATION_PROFILE, ENVIRONMENT_PROFILE, HEALTH_PROFILE, MOBILITY_PROFILE } from "./stationProfilesA.js";
import { GOVERNANCE_PROFILE, TECHNOLOGY_PROFILE, WEALTH_PROFILE } from "./stationProfilesB.js";

export const STATION_OPERATING_PROFILES: Record<Domain, StationOperatingProfileData> = {
  health: HEALTH_PROFILE,
  education: EDUCATION_PROFILE,
  environment: ENVIRONMENT_PROFILE,
  mobility: MOBILITY_PROFILE,
  governance: GOVERNANCE_PROFILE,
  technology: TECHNOLOGY_PROFILE,
  wealth: WEALTH_PROFILE
};

/** Mirrors riskTierForDomain in domainCliIntegration.ts: only "critical" stations are critical; the rest are "high". */
export function profileRiskTier(domain: Domain): ProfileRiskTier {
  return getDomainMetadata(domain).riskLevel === "critical" ? "critical" : "high";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildApprovalPolicy(data: StationOperatingProfileData): Record<string, unknown> {
  const policy = defaultApprovalPolicy();
  for (const [actionClass, setting] of Object.entries(data.approvals)) {
    if (!setting) continue;
    const key = actionClass as ActionClass;
    const existing = policy.approvalPolicy.actionClasses[key];
    policy.approvalPolicy.actionClasses[key] = {
      ...(existing ?? { requiredApprovals: 0, rolesAllowed: ["APPROVER", "OWNER"], requireDistinctUsers: false, ttlMinutes: 15 }),
      requiredApprovals: setting.value.requiredApprovals,
      requireDistinctUsers: setting.value.requireDistinctUsers,
      rolesAllowed: [...setting.value.rolesAllowed],
      ttlMinutes: setting.value.ttlMinutes
    };
  }
  return approvalPolicySchema.parse(policy) as unknown as Record<string, unknown>;
}

function buildBudgets(data: StationOperatingProfileData, agentId: string): Record<string, unknown> {
  const budgets = defaultBudgets(agentId);
  const agentBudget = budgets.budgets.perAgent[agentId];
  if (agentBudget) {
    for (const [actionClass, setting] of Object.entries(data.budgets.dailyMaxToolExecutes)) {
      if (!setting) continue;
      agentBudget.daily.maxToolExecutes[actionClass as ActionClass] = setting.value;
    }
  }
  return budgets as unknown as Record<string, unknown>;
}

function buildTools(data: StationOperatingProfileData): Record<string, unknown> {
  const tools = defaultToolsConfig();
  tools.tools.denyByDefault = data.toolAllowlist.denyByDefault.value;
  const ticketed = new Set<ActionClass>(data.toolAllowlist.execTicketClasses.value);
  for (const tool of tools.tools.allowedTools) {
    if (ticketed.has(tool.actionClass)) tool.requireExecTicket = true;
  }
  return toolsConfigSchema.parse(tools) as unknown as Record<string, unknown>;
}

function buildActionPolicy(data: StationOperatingProfileData, riskTier: ProfileRiskTier): Record<string, unknown> {
  const policy = clone(defaultActionPolicy());
  const ticketed = new Set<ActionClass>(data.toolAllowlist.execTicketClasses.value);
  for (const rule of policy.actions) {
    if (ticketed.has(rule.actionClass)) {
      rule.requireExecTicket = true;
      if (riskTier === "critical") rule.requireTrustTierAtLeast = "OBSERVED_HARDENED";
    }
    if (rule.actionClass === "SECURITY" && riskTier === "critical") rule.allowExecute = false;
  }
  return actionPolicySchema.parse(policy) as unknown as Record<string, unknown>;
}

function buildFirewall(data: StationOperatingProfileData, generatedAt: string): Record<string, unknown> {
  const policy = defaultRuntimeFirewallPolicy(data.firewall.mode.value);
  return {
    ...policy,
    failClosedOnMissingPolicy: data.firewall.failClosedOnMissingPolicy.value,
    rules: { ...policy.rules, ...data.firewall.rules.value },
    updatedAt: generatedAt
  };
}

function buildOpsPolicy(data: StationOperatingProfileData): Record<string, unknown> {
  const policy = defaultOpsPolicy();
  policy.opsPolicy.retention.keepArchiveSegmentsDays = data.retention.auditLogDays.value;
  policy.opsPolicy.retention.prunePayloadsAfterDays = data.retention.payloadPruneDays.value;
  policy.opsPolicy.retention.archivePayloadsAfterDays = Math.min(
    policy.opsPolicy.retention.archivePayloadsAfterDays,
    data.retention.payloadPruneDays.value
  );
  return policy as unknown as Record<string, unknown>;
}

export const OPERATOR_FLOW: readonly string[] = [
  "Review the emitted profile; nothing under .amc/ is written by this step.",
  "amc policy approval init   # creates and signs .amc/approval-policy.yaml with defaults; edit it to match proposedSignedConfigs.approvalPolicy (no CLI re-sign exists at HEAD; see docs/INDUSTRY_OPERATING_PROFILES.md)",
  "amc budgets init && <edit .amc/budgets.yaml to proposedSignedConfigs.budgets> && amc budgets sign",
  "amc tools init && <edit .amc/tools.yaml to proposedSignedConfigs.tools> && amc tools sign",
  "amc policy action init && <edit .amc/action-policy.yaml to proposedSignedConfigs.actionPolicy> && amc fix-signatures",
  "amc ops init && <edit .amc/ops-policy.yaml retention to proposedSignedConfigs.opsPolicy> && amc ops sign",
  "amc firewall enable --mode <firewall.mode.value>   # writes and signs the runtime firewall policy; rule toggles are not CLI-settable at HEAD"
];

export interface BuildOperatingProfileInput {
  station: Domain;
  agentId?: string;
  generatedAt?: string;
}

export function buildOperatingProfile(input: BuildOperatingProfileInput): OperatingProfile {
  const metadata = getDomainMetadata(input.station);
  const agentId = input.agentId?.trim() || "default";
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const riskTier = profileRiskTier(input.station);
  const data = clone(STATION_OPERATING_PROFILES[input.station]);

  const registryPacks = metadata.assurancePacks.map((id) => ({ id, mappedBy: "registry" as const }));
  const industryPacks = getIndustryAssurancePacksForStation(input.station)
    .filter((entry) => !metadata.assurancePacks.includes(entry.packId))
    .map((entry) => ({ id: entry.packId, mappedBy: "industryMap" as const, rationale: entry.rationale, source: entry.source }));

  const profile: OperatingProfile = {
    schemaVersion: "2026-10-03",
    ...data,
    stationName: metadata.name,
    agentId,
    riskTier,
    derivedFrom: {
      registryRiskLevel: metadata.riskLevel,
      euAIActCategory: metadata.euAIActCategory,
      regulatoryBasis: [...metadata.regulatoryBasis],
      complianceFrameworks: [...metadata.complianceFrameworks],
      assurancePacks: [...registryPacks, ...industryPacks],
      industryPacks: getPacksForDomain(input.station).map((pack) => ({
        id: pack.id,
        riskTier: pack.riskTier,
        euAIActClassification: pack.euAIActClassification
      }))
    },
    proposedSignedConfigs: {
      approvalPolicy: buildApprovalPolicy(data),
      budgets: buildBudgets(data, agentId),
      tools: buildTools(data),
      actionPolicy: buildActionPolicy(data, riskTier),
      firewall: buildFirewall(data, generatedAt),
      opsPolicy: buildOpsPolicy(data)
    },
    operatorFlow: [...OPERATOR_FLOW],
    consistency: { ok: true, violations: [] }
  };

  profile.consistency = checkOperatingProfileConsistency(profile);
  return profile;
}
