export type LicenseTier = "FREE" | "PRO" | "ENTERPRISE";

export interface TierDefinition {
  readonly tier: LicenseTier;
  readonly label: string;
  readonly quickscoreQuestionLimit: number;
  readonly rapidOnly: boolean;
  readonly features: readonly string[];
}

const FREE_FEATURES = ["rapid-quickscore"] as const;

const PRO_FEATURES = [
  ...FREE_FEATURES,
  "full-diagnostic",
  "pdf-export",
  "html-export",
  "badges",
  "compliance-reports",
  "compare-runs",
  "compare-models",
  "upgrade-wizard",
  "tune-wizard"
] as const;

const ENTERPRISE_FEATURES = [
  ...PRO_FEATURES,
  "industry-packs",
  "org-wide-assessments",
  "custom-scoring-rubrics",
  "api-access",
  "sso-ready-config",
  "fleet-governance",
  "siem-export",
  "signed-audit-trails",
  "multi-tenant",
  "usage-metering"
] as const;

export const TIER_DEFINITIONS: Readonly<Record<LicenseTier, TierDefinition>> = {
  FREE: {
    tier: "FREE",
    label: "Community",
    quickscoreQuestionLimit: 5,
    rapidOnly: true,
    features: FREE_FEATURES
  },
  PRO: {
    tier: "PRO",
    label: "Professional",
    quickscoreQuestionLimit: 235,
    rapidOnly: false,
    features: PRO_FEATURES
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    label: "Enterprise",
    quickscoreQuestionLimit: 235,
    rapidOnly: false,
    features: ENTERPRISE_FEATURES
  }
};

const TIER_ORDER: readonly LicenseTier[] = ["FREE", "PRO", "ENTERPRISE"];

export function getTierDefinition(tier: LicenseTier): TierDefinition {
  return TIER_DEFINITIONS[tier];
}

export function resolveTierFeatures(tier: LicenseTier): readonly string[] {
  return TIER_DEFINITIONS[tier].features;
}

export function tierIncludes(higher: LicenseTier, lower: LicenseTier): boolean {
  const hi = TIER_ORDER.indexOf(higher);
  const lo = TIER_ORDER.indexOf(lower);
  return hi > lo;
}

export function minimumTierForFeature(feature: string): LicenseTier {
  for (const tier of TIER_ORDER) {
    if (TIER_DEFINITIONS[tier].features.includes(feature)) {
      return tier;
    }
  }
  return "ENTERPRISE";
}
