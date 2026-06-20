export type MaturityRiskSource = "diagnostic" | "override";

export type RiskAppetiteStatus = "BELOW" | "AT" | "ABOVE";

export type RiskQuantificationInput = {
  agentId: string;
  maturityLevel: number;
  maturitySource: MaturityRiskSource;
  baselineAnnualIncidentFrequency?: number;
  averageIncidentCost?: number;
  riskAppetite?: number;
  currency?: string;
  generatedAt?: string;
};

export type RiskQuantificationResult = {
  schemaVersion: 1;
  agentId: string;
  generatedAt: string;
  currency: string;
  maturity: {
    level: number;
    roundedLevel: string;
    source: MaturityRiskSource;
  };
  model: {
    name: string;
    formula: string;
    riskMultiplierScale: Record<"L0" | "L1" | "L2" | "L3" | "L4" | "L5", number>;
    caveat: string;
    sources: Array<{ title: string; url: string; note: string }>;
  };
  inputs: {
    baselineAnnualIncidentFrequency: number;
    averageIncidentCost: number;
    riskAppetite: number | null;
    defaulted: {
      baselineAnnualIncidentFrequency: boolean;
      averageIncidentCost: boolean;
      currency: boolean;
    };
  };
  baseline: {
    annualIncidentFrequency: number;
    expectedAnnualLoss: number;
  };
  residual: {
    maturityRiskMultiplier: number;
    annualIncidentFrequency: number;
    expectedAnnualLoss: number;
    annualIncidentReduction: number;
    expectedAnnualLossReduction: number;
    reductionPct: number;
  };
  riskAppetite: {
    annualLossLimit: number;
    status: RiskAppetiteStatus;
    delta: number;
  } | null;
  confidence: "LOW" | "MEDIUM";
  assumptions: string[];
  recommendations: string[];
};

export const DEFAULT_BASELINE_ANNUAL_INCIDENT_FREQUENCY = 4;
export const DEFAULT_AVERAGE_INCIDENT_COST = 50_000;
export const DEFAULT_RISK_CURRENCY = "USD";

const RISK_MULTIPLIERS = {
  L0: 1,
  L1: 0.82,
  L2: 0.62,
  L3: 0.38,
  L4: 0.2,
  L5: 0.1
} as const;

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite number greater than or equal to 0.`);
  }
}

function assertMaturity(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw new Error("maturityLevel must be a finite number between 0 and 5.");
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function multiplierForIntegerLevel(level: number): number {
  switch (level) {
    case 0: return RISK_MULTIPLIERS.L0;
    case 1: return RISK_MULTIPLIERS.L1;
    case 2: return RISK_MULTIPLIERS.L2;
    case 3: return RISK_MULTIPLIERS.L3;
    case 4: return RISK_MULTIPLIERS.L4;
    case 5: return RISK_MULTIPLIERS.L5;
    default: return RISK_MULTIPLIERS.L0;
  }
}

export function maturityRiskMultiplier(maturityLevel: number): number {
  assertMaturity(maturityLevel);
  const bounded = clamp(maturityLevel, 0, 5);
  const lower = Math.floor(bounded);
  const upper = Math.ceil(bounded);
  if (lower === upper) {
    return multiplierForIntegerLevel(lower);
  }
  const lowerMultiplier = multiplierForIntegerLevel(lower);
  const upperMultiplier = multiplierForIntegerLevel(upper);
  const progress = bounded - lower;
  return lowerMultiplier + (upperMultiplier - lowerMultiplier) * progress;
}

function classifyRiskAppetite(expectedAnnualLoss: number, annualLossLimit: number): RiskAppetiteStatus {
  if (expectedAnnualLoss > annualLossLimit) {
    return "ABOVE";
  }
  if (annualLossLimit === 0) {
    return expectedAnnualLoss === 0 ? "BELOW" : "ABOVE";
  }
  return expectedAnnualLoss >= annualLossLimit * 0.9 ? "AT" : "BELOW";
}

export function quantifyMaturityRisk(input: RiskQuantificationInput): RiskQuantificationResult {
  assertMaturity(input.maturityLevel);

  const baselineAnnualIncidentFrequency =
    input.baselineAnnualIncidentFrequency ?? DEFAULT_BASELINE_ANNUAL_INCIDENT_FREQUENCY;
  const averageIncidentCost = input.averageIncidentCost ?? DEFAULT_AVERAGE_INCIDENT_COST;
  const currency = input.currency ?? DEFAULT_RISK_CURRENCY;

  assertFiniteNonNegative(baselineAnnualIncidentFrequency, "baselineAnnualIncidentFrequency");
  assertFiniteNonNegative(averageIncidentCost, "averageIncidentCost");
  if (input.riskAppetite !== undefined) {
    assertFiniteNonNegative(input.riskAppetite, "riskAppetite");
  }

  const multiplier = maturityRiskMultiplier(input.maturityLevel);
  const baselineExpectedAnnualLoss = baselineAnnualIncidentFrequency * averageIncidentCost;
  const residualAnnualIncidentFrequency = baselineAnnualIncidentFrequency * multiplier;
  const residualExpectedAnnualLoss = residualAnnualIncidentFrequency * averageIncidentCost;
  const annualIncidentReduction = baselineAnnualIncidentFrequency - residualAnnualIncidentFrequency;
  const expectedAnnualLossReduction = baselineExpectedAnnualLoss - residualExpectedAnnualLoss;
  const reductionPct = baselineExpectedAnnualLoss === 0
    ? 0
    : (expectedAnnualLossReduction / baselineExpectedAnnualLoss) * 100;

  const assumptions = [
    "Expected annual loss is computed as annual incident frequency multiplied by average incident cost.",
    "Residual frequency is a heuristic maturity adjustment, not an actuarial guarantee.",
    "Calibrate baseline frequency and average incident cost with observed incident, claims, audit, and finance data before board use."
  ];
  if (input.baselineAnnualIncidentFrequency === undefined) {
    assumptions.push(`Default baseline frequency ${DEFAULT_BASELINE_ANNUAL_INCIDENT_FREQUENCY}/year was used.`);
  }
  if (input.averageIncidentCost === undefined) {
    assumptions.push(`Default average incident cost ${DEFAULT_AVERAGE_INCIDENT_COST} was used.`);
  }

  const riskAppetite = input.riskAppetite === undefined
    ? null
    : {
        annualLossLimit: input.riskAppetite,
        status: classifyRiskAppetite(residualExpectedAnnualLoss, input.riskAppetite),
        delta: residualExpectedAnnualLoss - input.riskAppetite
      };

  const recommendations: string[] = [];
  if (input.maturityLevel < 2) {
    recommendations.push("Raise the agent to at least L2 before relying on it for regulated or customer-impacting workflows.");
  }
  if (input.maturityLevel < 3) {
    recommendations.push("Prioritize L3 evidence coverage so residual risk can be defended in a risk register.");
  }
  if (riskAppetite?.status === "ABOVE") {
    recommendations.push("Residual expected annual loss is above risk appetite; reduce autonomy, add controls, or lower exposure.");
  }
  if (input.baselineAnnualIncidentFrequency === undefined || input.averageIncidentCost === undefined) {
    recommendations.push("Replace defaults with organization-specific incident frequency and cost data.");
  }

  return {
    schemaVersion: 1,
    agentId: input.agentId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    currency,
    maturity: {
      level: Number(input.maturityLevel.toFixed(3)),
      roundedLevel: `L${Math.round(input.maturityLevel)}`,
      source: input.maturitySource
    },
    model: {
      name: "AMC maturity-linked expected annual loss model",
      formula: "baselineExpectedAnnualLoss = baselineAnnualIncidentFrequency * averageIncidentCost; residualExpectedAnnualLoss = baselineExpectedAnnualLoss * maturityRiskMultiplier",
      riskMultiplierScale: { ...RISK_MULTIPLIERS },
      caveat: "Planning estimate for enterprise risk registers; calibrate with real loss data before financial reporting.",
      sources: [
        {
          title: "NIST SP 800-30 Rev. 1",
          url: "https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-30r1.pdf",
          note: "Grounds risk as a combination of event likelihood and adverse impact."
        },
        {
          title: "NIST AI RMF 1.0",
          url: "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf",
          note: "Frames AI risk tolerance as contextual to the organization and use case."
        }
      ]
    },
    inputs: {
      baselineAnnualIncidentFrequency,
      averageIncidentCost,
      riskAppetite: input.riskAppetite ?? null,
      defaulted: {
        baselineAnnualIncidentFrequency: input.baselineAnnualIncidentFrequency === undefined,
        averageIncidentCost: input.averageIncidentCost === undefined,
        currency: input.currency === undefined
      }
    },
    baseline: {
      annualIncidentFrequency: Number(baselineAnnualIncidentFrequency.toFixed(4)),
      expectedAnnualLoss: Number(baselineExpectedAnnualLoss.toFixed(2))
    },
    residual: {
      maturityRiskMultiplier: Number(multiplier.toFixed(4)),
      annualIncidentFrequency: Number(residualAnnualIncidentFrequency.toFixed(4)),
      expectedAnnualLoss: Number(residualExpectedAnnualLoss.toFixed(2)),
      annualIncidentReduction: Number(annualIncidentReduction.toFixed(4)),
      expectedAnnualLossReduction: Number(expectedAnnualLossReduction.toFixed(2)),
      reductionPct: Number(reductionPct.toFixed(2))
    },
    riskAppetite,
    confidence: input.baselineAnnualIncidentFrequency !== undefined && input.averageIncidentCost !== undefined
      ? "MEDIUM"
      : "LOW",
    assumptions,
    recommendations
  };
}

export function formatRiskCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}
