import type { ActionClass } from "../../types.js";
import type { UserRole } from "../../auth/roles.js";
import type { RuntimeFirewallMode, RuntimeFirewallPolicy } from "../../runtime/firewall.js";
import type { PosthocAuditSamplingMethod } from "../../audit/posthocAuditSampling.js";
import type { Domain } from "../domainRegistry.js";

/**
 * A regulation, standard or agency page that an operating-profile setting
 * cites. `verified: false` means the primary text could not be read from this
 * harness on `retrievedAt`; `reason` says what was read instead.
 */
export interface ProfileSource {
  id: string;
  title: string;
  url: string;
  reference: string;
  retrievedAt: string;
  verified: boolean;
  reason?: string;
}

/** A setting plus the source it rests on and the sentence that connects them. */
export interface SourcedSetting<T> {
  value: T;
  source: ProfileSource;
  basis: string;
}

export type ProfileRiskTier = "critical" | "high";

export interface ApprovalClassSetting {
  requiredApprovals: number;
  requireDistinctUsers: boolean;
  rolesAllowed: UserRole[];
  ttlMinutes: number;
}

export type ProfileSamplingCadence = "daily" | "weekly" | "monthly" | "quarterly";

export interface IncidentReportingClock {
  id: string;
  trigger: string;
  authority: string;
  deadline: { value: number; unit: "hours" | "days" | "working-days" | "calendar-days" };
  source: ProfileSource;
  basis: string;
}

export interface StationOperatingProfileData {
  station: Domain;
  toolAllowlist: {
    denyByDefault: SourcedSetting<true>;
    execTicketClasses: SourcedSetting<ActionClass[]>;
    networkEgress: SourcedSetting<"deny-by-default" | "allowlist-only">;
  };
  firewall: {
    mode: SourcedSetting<RuntimeFirewallMode>;
    failClosedOnMissingPolicy: SourcedSetting<boolean>;
    rules: SourcedSetting<Partial<RuntimeFirewallPolicy["rules"]>>;
  };
  approvals: Partial<Record<ActionClass, SourcedSetting<ApprovalClassSetting>>>;
  budgets: {
    dailyMaxToolExecutes: Partial<Record<ActionClass, SourcedSetting<number>>>;
  };
  retention: {
    auditLogDays: SourcedSetting<number>;
    payloadPruneDays: SourcedSetting<number>;
  };
  auditSampling: {
    ratePercent: SourcedSetting<number>;
    method: SourcedSetting<PosthocAuditSamplingMethod>;
    cadence: SourcedSetting<ProfileSamplingCadence>;
  };
  humanOversight: {
    requiredReviewerRoles: SourcedSetting<UserRole[]>;
    requireDistinctReviewers: SourcedSetting<boolean>;
    overridePath: SourcedSetting<string>;
  };
  incidentReportingClocks: IncidentReportingClock[];
}

export interface ProfileAssurancePackRef {
  id: string;
  mappedBy: "registry" | "industryMap";
  rationale?: string;
  source?: string;
}

export interface ProfileIndustryPackRef {
  id: string;
  riskTier: string;
  euAIActClassification: string;
}

export interface OperatingProfileConsistency {
  ok: boolean;
  violations: string[];
}

export interface OperatingProfile extends StationOperatingProfileData {
  schemaVersion: "2026-10-03";
  stationName: string;
  agentId: string;
  riskTier: ProfileRiskTier;
  derivedFrom: {
    registryRiskLevel: string;
    euAIActCategory: string;
    regulatoryBasis: string[];
    complianceFrameworks: string[];
    assurancePacks: ProfileAssurancePackRef[];
    industryPacks: ProfileIndustryPackRef[];
  };
  proposedSignedConfigs: {
    approvalPolicy: Record<string, unknown>;
    budgets: Record<string, unknown>;
    tools: Record<string, unknown>;
    actionPolicy: Record<string, unknown>;
    firewall: Record<string, unknown>;
    opsPolicy: Record<string, unknown>;
  };
  operatorFlow: string[];
  consistency: OperatingProfileConsistency;
}
