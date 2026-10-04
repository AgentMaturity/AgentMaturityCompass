import type { ActionClass } from "../../types.js";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import { defaultApprovalPolicy } from "../../approvals/approvalPolicyEngine.js";
import { defaultBudgets } from "../../budgets/budgets.js";
import type { Domain } from "../domainRegistry.js";
import type { IndustryPack } from "../industryPacks.js";
import type { AgentBlueprint, BlueprintRefusal, BlueprintVerdict, RiskTier } from "./blueprintTypes.js";

/**
 * The station profile a blueprint is validated against. Fail closed: a
 * blueprint may never grant a tool class the profile forbids, and WRITE_HIGH
 * may never be granted with fewer approvers than the workspace's default
 * approval policy demands.
 *
 * Two sources, in order:
 *   1. an injected `StationProfileSource` (the seam for F1's operating
 *      profiles module, whose shape is unknown at commit 8f57ce63);
 *   2. the built-in table below, keyed by the pack risk tier.
 *
 * The tier table is an AMC blueprint DEFAULT, not a regulatory requirement.
 * The zero-quota baseline is read from `defaultBudgets()` so the blueprint
 * cannot drift from the budget the runtime already ships.
 */

export interface StationProfile {
  readonly station: Domain;
  readonly tier: RiskTier;
  readonly forbiddenClasses: readonly ActionClass[];
  readonly ruleId: string;
}

export type StationProfileSource = (station: Domain, tier: RiskTier) => StationProfile | undefined;

const TIER_RANK: Readonly<Record<RiskTier, number>> = { elevated: 0, high: 1, "very-high": 2, critical: 3 };

const TIER_FORBIDDEN: Readonly<Record<RiskTier, readonly ActionClass[]>> = {
  critical: ["DEPLOY", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"],
  "very-high": ["DEPLOY", "IDENTITY"],
  high: ["DEPLOY"],
  elevated: []
};

export function highestRiskTier(packs: readonly IndustryPack[]): RiskTier {
  let tier: RiskTier = "elevated";
  for (const pack of packs) if (TIER_RANK[pack.riskTier] > TIER_RANK[tier]) tier = pack.riskTier;
  return tier;
}

/** Classes whose daily `maxToolExecutes` is 0 in the shipped default budget. */
export function zeroQuotaClasses(): readonly ActionClass[] {
  const daily = defaultBudgets().budgets.perAgent["default"]?.daily.maxToolExecutes ?? {};
  return ACTION_CLASSES.filter((actionClass) => daily[actionClass] === 0);
}

export function resolveStationProfile(
  station: Domain,
  packs: readonly IndustryPack[],
  source?: StationProfileSource
): { readonly profile: StationProfile; readonly source: "pack-risk-tier" | "station-profile-source" } {
  const tier = highestRiskTier(packs);
  const injected = source?.(station, tier);
  if (injected) return { profile: injected, source: "station-profile-source" };
  return { profile: { station, tier, forbiddenClasses: TIER_FORBIDDEN[tier], ruleId: `station-profile/${tier}` }, source: "pack-risk-tier" };
}

/**
 * Every refusal, not just the first: the operator fixes them all in one pass.
 * The rule ids are stable strings the summary and the tests name verbatim.
 */
export function evaluateBlueprint(blueprint: AgentBlueprint): BlueprintVerdict {
  const refusals: BlueprintRefusal[] = [];
  const { ruleId, forbiddenClasses, zeroQuotaClasses: zeroQuota } = blueprint.profile;

  for (const actionClass of blueprint.toolScope.classes) {
    if (zeroQuota.includes(actionClass)) {
      refusals.push({
        rule: `budget-default/zero-quota/${actionClass}`,
        message: `${actionClass} has a daily quota of 0 in the default budget; a blueprint cannot grant it in any station`
      });
    }
    if (forbiddenClasses.includes(actionClass)) {
      refusals.push({
        rule: `${ruleId}/forbidden-class/${actionClass}`,
        message: `the ${blueprint.profile.tier} station profile for "${blueprint.station}" forbids ${actionClass}`
      });
    }
  }

  if (blueprint.toolScope.classes.includes("WRITE_HIGH")) {
    const required = defaultApprovalPolicy().approvalPolicy.actionClasses.WRITE_HIGH;
    const gated = blueprint.approvals.gatedClasses.includes("WRITE_HIGH");
    const enoughApprovers = required === undefined || blueprint.approvals.requiredApprovals >= required.requiredApprovals;
    const distinctOk = required === undefined || !required.requireDistinctUsers || blueprint.approvals.requireDistinctUsers;
    if (!gated || !enoughApprovers || !distinctOk) {
      refusals.push({
        rule: `${ruleId}/write-high-requires-approval`,
        message:
          `WRITE_HIGH in a ${blueprint.profile.tier} station requires at least ` +
          `${required?.requiredApprovals ?? "the default number of"} approvals` +
          `${required?.requireDistinctUsers ? " from distinct users" : ""}; the blueprint declares ` +
          `${blueprint.approvals.requiredApprovals} (distinct: ${blueprint.approvals.requireDistinctUsers}, gated: ${gated})`
      });
    }
  }

  return refusals.length === 0 ? { ok: true } : { ok: false, refusals };
}
