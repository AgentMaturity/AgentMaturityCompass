import type { ActionClass } from "../../types.js";
import type {
  OperatingProfile,
  OperatingProfileConsistency,
  ProfileFact,
  ProfileFactStatus,
  ProfileSource
} from "./operatingProfileTypes.js";

/** Sections every station profile must carry; a missing one is a violation, not a default. */
export const REQUIRED_PROFILE_SECTIONS = [
  "toolAllowlist",
  "firewall",
  "approvals",
  "budgets",
  "retention",
  "auditSampling",
  "humanOversight",
  "incidentReportingClocks"
] as const;

const CRITICAL_TICKETED: ActionClass[] = ["WRITE_HIGH", "DEPLOY", "SECURITY"];
const CRITICAL_MIN_SAMPLING_PERCENT = 10;

const FACT_STATUSES: readonly ProfileFactStatus[] = ["asserted", "observed", "reviewed"];

/** A sourced setting or an incident clock: an entry with a source, a basis sentence and a fact status. */
export interface ProfileFactEntry {
  source: ProfileSource;
  basis: unknown;
  fact?: ProfileFact;
}

function isFactEntry(value: unknown): value is ProfileFactEntry {
  return !!value && typeof value === "object" && "source" in value && "basis" in value;
}

function sourceProblems(source: ProfileSource | undefined, where: string): string[] {
  if (!source) return [`${where}: missing source`];
  const problems: string[] = [];
  if (!source.title?.trim()) problems.push(`${where}: source.title empty`);
  if (!source.url?.trim()) problems.push(`${where}: source.url empty`);
  if (!source.reference?.trim()) problems.push(`${where}: source.reference empty`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.retrievedAt ?? "")) problems.push(`${where}: source.retrievedAt not a date`);
  if (source.verified === false && !source.reason?.trim()) problems.push(`${where}: unverified source without reason`);
  return problems;
}

function factProblems(fact: ProfileFact | undefined, where: string): string[] {
  if (!fact || !FACT_STATUSES.includes(fact.status)) return [`${where}: fact status missing or unknown`];
  if (fact.status === "reviewed" && !(fact.reviewedBy?.trim() && /^\d{4}-\d{2}-\d{2}/.test(fact.reviewedAt ?? ""))) {
    return [`${where}: a reviewed fact needs reviewedBy and reviewedAt`];
  }
  return [];
}

/** Calls `visit` for every setting and clock under the required sections, with its path. */
export function visitProfileFacts(profile: object, visit: (path: string, entry: ProfileFactEntry) => void): void {
  const walk = (value: unknown, path: string): void => {
    if (isFactEntry(value)) {
      visit(path, value);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) walk(child, `${path}.${key}`);
    }
  };
  for (const section of REQUIRED_PROFILE_SECTIONS) walk((profile as Record<string, unknown>)[section], section);
}

export function countProfileFacts(profile: object): Record<ProfileFactStatus, number> {
  const counts: Record<ProfileFactStatus, number> = { asserted: 0, observed: 0, reviewed: 0 };
  visitProfileFacts(profile, (_path, entry) => {
    if (entry.fact && FACT_STATUSES.includes(entry.fact.status)) counts[entry.fact.status] += 1;
  });
  return counts;
}

function approvalPolicyClass(profile: OperatingProfile, actionClass: ActionClass): { requiredApprovals?: number; requireDistinctUsers?: boolean } | undefined {
  const policy = profile.proposedSignedConfigs.approvalPolicy as { approvalPolicy?: { actionClasses?: Record<string, { requiredApprovals?: number; requireDistinctUsers?: boolean }> } };
  return policy.approvalPolicy?.actionClasses?.[actionClass];
}

export function checkOperatingProfileConsistency(profile: OperatingProfile): OperatingProfileConsistency {
  const violations: string[] = [];

  for (const section of REQUIRED_PROFILE_SECTIONS) {
    if (!(section in profile) || profile[section] === undefined || profile[section] === null) {
      violations.push(`missing section: ${section}`);
    }
  }
  visitProfileFacts(profile, (path, entry) => {
    violations.push(...sourceProblems(entry.source, path));
    if (typeof entry.basis !== "string" || entry.basis.trim().length === 0) violations.push(`${path}: basis empty`);
    violations.push(...factProblems(entry.fact, path));
  });
  const facts = countProfileFacts(profile);
  if (FACT_STATUSES.some((status) => profile.profileFacts?.[status] !== facts[status])) {
    violations.push("profileFacts: does not match the fact statuses in the profile");
  }

  const writeHigh = profile.approvals.WRITE_HIGH;
  if (!writeHigh) {
    violations.push("approvals.WRITE_HIGH: missing");
  } else if (profile.riskTier === "critical") {
    if (writeHigh.value.requiredApprovals < 2) violations.push("approvals.WRITE_HIGH: critical tier requires at least 2 approvals");
    if (!writeHigh.value.requireDistinctUsers) violations.push("approvals.WRITE_HIGH: critical tier requires distinct users");
  } else if (writeHigh.value.requiredApprovals < 1) {
    violations.push("approvals.WRITE_HIGH: high tier requires at least 1 approval");
  }

  if (profile.riskTier === "critical" && profile.firewall.mode.value !== "block") {
    violations.push(`firewall.mode: critical tier requires block, got ${profile.firewall.mode.value}`);
  }
  if (!profile.firewall.failClosedOnMissingPolicy.value) {
    violations.push("firewall.failClosedOnMissingPolicy: must be true");
  }

  if (profile.toolAllowlist.denyByDefault.value !== true) {
    violations.push("toolAllowlist.denyByDefault: must be true");
  }
  if (profile.riskTier === "critical") {
    for (const actionClass of CRITICAL_TICKETED) {
      if (!profile.toolAllowlist.execTicketClasses.value.includes(actionClass)) {
        violations.push(`toolAllowlist.execTicketClasses: critical tier must ticket ${actionClass}`);
      }
    }
    const security = profile.budgets.dailyMaxToolExecutes.SECURITY;
    if (!security || security.value !== 0) violations.push("budgets.dailyMaxToolExecutes.SECURITY: critical tier must be 0");
    const deploy = profile.budgets.dailyMaxToolExecutes.DEPLOY;
    if (!deploy || deploy.value > 1) violations.push("budgets.dailyMaxToolExecutes.DEPLOY: critical tier must be at most 1");
    if (profile.auditSampling.ratePercent.value < CRITICAL_MIN_SAMPLING_PERCENT) {
      violations.push(`auditSampling.ratePercent: critical tier must be at least ${CRITICAL_MIN_SAMPLING_PERCENT}`);
    }
    if (!profile.humanOversight.requireDistinctReviewers.value) {
      violations.push("humanOversight.requireDistinctReviewers: critical tier must be true");
    }
  }

  if (profile.incidentReportingClocks.length === 0) {
    violations.push("incidentReportingClocks: at least one clock is required");
  }
  for (const entry of profile.incidentReportingClocks) {
    if (!(entry.deadline.value > 0)) violations.push(`incidentReportingClocks[${entry.id}]: deadline must be positive`);
    if (!entry.trigger.trim() || !entry.authority.trim()) violations.push(`incidentReportingClocks[${entry.id}]: trigger and authority required`);
  }

  if (profile.retention.auditLogDays.value < 365) violations.push("retention.auditLogDays: must be at least 365");
  if (profile.retention.payloadPruneDays.value > profile.retention.auditLogDays.value) {
    violations.push("retention.payloadPruneDays: must not exceed auditLogDays");
  }
  const rate = profile.auditSampling.ratePercent.value;
  if (!(rate > 0 && rate <= 100)) violations.push("auditSampling.ratePercent: must be in (0, 100]");

  for (const [actionClass, setting] of Object.entries(profile.approvals)) {
    if (!setting) continue;
    const proposed = approvalPolicyClass(profile, actionClass as ActionClass);
    if (!proposed || proposed.requiredApprovals !== setting.value.requiredApprovals || proposed.requireDistinctUsers !== setting.value.requireDistinctUsers) {
      violations.push(`proposedSignedConfigs.approvalPolicy.${actionClass}: does not mirror approvals.${actionClass}`);
    }
  }
  const firewall = profile.proposedSignedConfigs.firewall as { mode?: string; failClosedOnMissingPolicy?: boolean };
  if (firewall.mode !== profile.firewall.mode.value || firewall.failClosedOnMissingPolicy !== profile.firewall.failClosedOnMissingPolicy.value) {
    violations.push("proposedSignedConfigs.firewall: does not mirror firewall section");
  }

  return { ok: violations.length === 0, violations };
}
