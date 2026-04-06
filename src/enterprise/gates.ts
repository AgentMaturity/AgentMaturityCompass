import type { KeyObject } from "node:crypto";
import { getLicenseStatus, type LicenseValidationResult } from "./license.js";
import { minimumTierForFeature, tierIncludes, type LicenseTier } from "./tiers.js";

export interface FeatureGateResult {
  readonly allowed: boolean;
  readonly feature: string;
  readonly currentTier: LicenseTier;
  readonly requiredTier: LicenseTier;
  readonly message: string;
  readonly warning?: string;
}

const FEATURE_LABELS: Record<string, string> = {
  "full-diagnostic": "full 235-question diagnostic",
  "pdf-export": "PDF export",
  "html-export": "HTML export",
  badges: "maturity badges",
  "compliance-reports": "compliance reports",
  "compare-runs": "run comparison",
  "compare-models": "model comparison",
  "upgrade-wizard": "upgrade wizard",
  "tune-wizard": "tuning wizard",
  "industry-packs": "industry packs",
  "org-wide-assessments": "org-wide assessments",
  "custom-scoring-rubrics": "custom scoring rubrics",
  "api-access": "API access",
  "sso-ready-config": "SSO configuration",
  "fleet-governance": "fleet governance",
  "siem-export": "SIEM audit export",
  "signed-audit-trails": "signed audit trails",
  "multi-tenant": "multi-tenant workspaces",
  "usage-metering": "usage metering"
};

function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

function resolveValidation(params: {
  workspace: string;
  publicKey?: KeyObject;
  now?: Date;
}): LicenseValidationResult {
  if (!params.publicKey) {
    return {
      valid: false,
      status: "invalid",
      effectiveTier: "FREE",
      claims: null,
      graceDaysRemaining: 0,
      errors: ["no public key provided"]
    };
  }
  return getLicenseStatus({
    workspace: params.workspace,
    publicKey: params.publicKey,
    now: params.now
  }).validation;
}

export function checkFeatureGate(params: {
  workspace: string;
  publicKey?: KeyObject;
  feature: string;
  now?: Date;
}): FeatureGateResult {
  const validation = resolveValidation(params);
  const currentTier = validation.effectiveTier;
  const requiredTier = minimumTierForFeature(params.feature);

  const hasAccess =
    currentTier === requiredTier || tierIncludes(currentTier, requiredTier);

  if (!hasAccess) {
    return {
      allowed: false,
      feature: params.feature,
      currentTier,
      requiredTier,
      message: `${featureLabel(params.feature)} requires AMC ${requiredTier}. ` +
        `Current tier: ${currentTier}. Activate with: amc license activate <key>`
    };
  }

  const warning =
    validation.status === "grace"
      ? `License in grace period — ${validation.graceDaysRemaining} days remaining before downgrade`
      : undefined;

  return {
    allowed: true,
    feature: params.feature,
    currentTier,
    requiredTier,
    message: `${featureLabel(params.feature)} is available on your ${currentTier} plan`,
    warning
  };
}

export function ensureFeatureGate(params: {
  workspace: string;
  publicKey?: KeyObject;
  feature: string;
  now?: Date;
}): FeatureGateResult {
  const gate = checkFeatureGate(params);
  if (!gate.allowed) {
    throw new Error(gate.message);
  }
  return gate;
}
