/**
 * Retention floors per regime (P2-26 slice D). Rules come from the active compiled plan: an applicable
 * logging-and-retention (Layer 0 family 10) control whose in-scope citations name a regime, or the plan's jurisdiction
 * pull-ins for a regime the register does not yet carry. The effective minimum for each record class is the largest
 * applicable minimum. An ops policy whose pruning would undercut it is refused when it is signed and again by the
 * retention executor, naming the regime. Conflicting maximums are listed for a reviewer, never resolved here. A rule
 * that needs WORM without a configured target leaves its control not_evaluated.
 *
 * Every rule is agent-drafted and experimental (verified: false) until the D-08 experts review it. AMC is designed to
 * support these duties and claims no conformity with the AI Act, CERT-In directions or SEC Rule 17a-4.
 */
import { activeControlPlan } from "../../catalog/compiler/activate.js";
import type { RequirementDecision } from "../../catalog/compiler/types.js";
import type { OpsPolicy } from "../policy.js";

type RetentionClass = "evidence_events" | "payloads" | "receipts" | "logs";

export interface RegimeRetentionRule {
  regimeId: string;
  registerRef: string | null;
  minimumDays: number;
  maximumDays: number | null;
  appliesTo: RetentionClass;
  wormRequired: boolean;
  /** Residency the regime asks for; P2-01's residency registry enforces it, this module only names it. */
  residency: string | null;
  verified: false;
  basis: string;
}

/** Rule templates: `when` matches the plan; the template is the strategy's example, experimental until D-08 review. */
const TEMPLATES: ReadonlyArray<{ when: (requirements: readonly RequirementDecision[]) => boolean; rule: Omit<RegimeRetentionRule, "verified"> }> = [
  {
    when: (rs) => rs.some((r) => r.applicability === "applicable" && r.citationsInScope.includes("eu-ai-act-art-26-6")),
    rule: { regimeId: "eu-ai-act-art-26-6-deployer-logs", registerRef: "eu-ai-act", minimumDays: 183, maximumDays: null, appliesTo: "logs",
      wormRequired: false, residency: null, basis: "AI Act Art. 26(6): deployers keep automatically generated logs at least six months (L0-LOG-03 citation in scope)" }
  },
  {
    when: (rs) => rs.some((r) => r.applicability === "applicable" && r.pulledInBy.includes("jurisdiction:IN")),
    rule: { regimeId: "in-cert-in-logs-180d", registerRef: null, minimumDays: 180, maximumDays: null, appliesTo: "logs", wormRequired: false,
      residency: "IN", basis: "CERT-In direction of 28 April 2022: ICT system logs kept 180 days within India; no register row yet (P3-09)" }
  },
  {
    when: (rs) => rs.some((r) => r.applicability === "applicable" && r.citationsInScope.some((key) => key.startsWith("sec-17a-4"))),
    rule: { regimeId: "us-sec-17a-4-records", registerRef: "us-sec-17a-4", minimumDays: 2190, maximumDays: null, appliesTo: "receipts", wormRequired: true,
      residency: null, basis: "SEC Rule 17a-4: broker-dealer records kept six years in non-rewriteable, non-erasable form (export via P2-09)" }
  }
];

/** The rules the plan's applicable requirements bring in; none without a plan. */
export function regimeRetentionRules(requirements: readonly RequirementDecision[] | null): RegimeRetentionRule[] {
  if (requirements === null) return [];
  return TEMPLATES.filter((template) => template.when(requirements)).map((template) => ({ ...template.rule, verified: false }));
}

/** The ops-policy knobs that delete each record class. */
const KNOBS: Record<RetentionClass, ReadonlyArray<keyof OpsPolicy["opsPolicy"]["retention"]>> = {
  payloads: ["prunePayloadsAfterDays"],
  logs: ["prunePayloadsAfterDays", "pruneGuardEventsAfterDays", "keepArchiveSegmentsDays"],
  evidence_events: ["keepArchiveSegmentsDays", "pruneGuardEventsAfterDays"],
  receipts: ["keepArchiveSegmentsDays"]
};

export interface EffectiveRetention {
  /** Per class: the largest applicable minimum and the regimes that set it. */
  minimums: Partial<Record<RetentionClass, { days: number; regimeIds: string[] }>>;
  /** A maximum below another regime's minimum for the same class: for a reviewer, as compiler conflicts are. */
  conflicts: Array<{ appliesTo: RetentionClass; maximum: { regimeId: string; days: number }; minimum: { regimeId: string; days: number } }>;
  controls: Array<{ regimeId: string; status: "enforced_at_retention" | "not_evaluated"; reason: string | null }>;
}

export function effectiveRetention(rules: readonly RegimeRetentionRule[], wormTargetConfigured = false): EffectiveRetention {
  const minimums: EffectiveRetention["minimums"] = {};
  for (const rule of rules) {
    const current = minimums[rule.appliesTo];
    if (!current || rule.minimumDays > current.days) minimums[rule.appliesTo] = { days: rule.minimumDays, regimeIds: [rule.regimeId] };
    else if (rule.minimumDays === current.days) current.regimeIds.push(rule.regimeId);
  }
  const conflicts = rules.flatMap((max) => max.maximumDays === null ? [] : rules
    .filter((min) => min.appliesTo === max.appliesTo && min.minimumDays > max.maximumDays!)
    .map((min) => ({ appliesTo: max.appliesTo, maximum: { regimeId: max.regimeId, days: max.maximumDays! }, minimum: { regimeId: min.regimeId, days: min.minimumDays } })));
  const controls = rules.map((rule) => rule.wormRequired && !wormTargetConfigured
    ? { regimeId: rule.regimeId, status: "not_evaluated" as const, reason: "WORM retention required and no WORM export target is configured (P2-09)" }
    : { regimeId: rule.regimeId, status: "enforced_at_retention" as const, reason: null });
  return { minimums, conflicts, controls };
}

/** Each knob that would delete a class sooner than its floor, naming the regimes. An absent optional knob deletes nothing. */
export function retentionFloorViolations(policy: OpsPolicy, rules: readonly RegimeRetentionRule[]): string[] {
  const { minimums } = effectiveRetention(rules);
  const retention = policy.opsPolicy.retention;
  return (Object.entries(minimums) as Array<[RetentionClass, { days: number; regimeIds: string[] }]>).flatMap(([cls, floor]) =>
    KNOBS[cls].flatMap((knob) => {
      const days = retention[knob];
      return typeof days === "number" && days < floor.days
        ? [`${knob} ${days} days undercuts the ${floor.days}-day ${cls} minimum of ${floor.regimeIds.join(", ")} (experimental, pending D-08 review)`] : [];
    }));
}

export class RegimeRetentionRefused extends Error {
  readonly code = "REGIME_RETENTION_REFUSED" as const;
  constructor(readonly violations: string[]) {
    super(`retention refused: ${violations.join("; ")}`);
    this.name = "RegimeRetentionRefused";
  }
}

/**
 * Refuses a policy that undercuts the active plan's regimes. A plan that cannot be read refuses too: without it the
 * floors are unknown, and deleting under unknown floors could destroy records a regime still requires.
 */
export function assertRetentionMeetsRegimes(workspace: string, policy: OpsPolicy): void {
  let requirements: readonly RequirementDecision[] | null;
  try {
    requirements = activeControlPlan(workspace)?.requirements ?? null;
  } catch (error) {
    throw new RegimeRetentionRefused([`the active compiled plan could not be read, so regime floors are unknown (${error instanceof Error ? error.message : String(error)})`]);
  }
  const violations = retentionFloorViolations(policy, regimeRetentionRules(requirements));
  if (violations.length > 0) throw new RegimeRetentionRefused(violations);
}
