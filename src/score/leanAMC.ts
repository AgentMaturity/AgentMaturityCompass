/**
 * leanAMC.ts — Team-size-aware profiles, domain-specific module additions,
 * and time-to-level estimation.
 */

export interface LeanAMCProfile {
  requiredModules: string[];
  skippableModules: string[];
  estimatedSetupHours: number;
  maximumAchievableLevel: number;
  tradeoffs: string[];
  teamSize: 'solo' | 'small' | 'medium' | 'large';
  domain?: string;
  timeToLevel: Record<number, number>; // level -> estimated hours
}

export type TeamSize = 'solo' | 'small' | 'medium' | 'large';

/* ── Team size configs ───────────────────────────────────────────── */

const TEAM_PROFILES: Record<TeamSize, { maxLevel: number; baseHours: number; multiplier: number }> = {
  solo: { maxLevel: 2, baseHours: 16, multiplier: 1.0 },
  small: { maxLevel: 3, baseHours: 32, multiplier: 1.2 },
  medium: { maxLevel: 4, baseHours: 80, multiplier: 1.5 },
  large: { maxLevel: 5, baseHours: 160, multiplier: 2.0 },
};

/* ── Domain-specific module additions ────────────────────────────── */

const DOMAIN_MODULES: Record<string, string[]> = {
  finance: ['compliance/complianceEngine', 'audit/insiderRisk', 'vault/invoiceFraud'],
  healthcare: ['vault/dlp', 'compliance/dataResidency', 'vault/dsarAutopilot'],
  legal: ['vault/dlp', 'compliance/complianceEngine', 'vault/dsarAutopilot'],
  saas: ['ops/circuitBreaker', 'ops/overheadAccounting', 'drift/alerts'],
  general: [],
};

/* ── Core modules by level ───────────────────────────────────────── */

const LEVEL_MODULES: Record<number, string[]> = {
  1: ['diagnostic/questionBank', 'score/formalSpec', 'shield/guardEngine'],
  2: ['evidence/evidenceStore', 'shield/analyzer', 'shield/injectionDetector', 'enforce/policyFirewall'],
  3: ['vault/dlp', 'watch/outputAttestation', 'ledger/ledger', 'assurance/assuranceRunner'],
  4: ['audit/auditApi', 'compliance/complianceEngine', 'drift/alerts', 'transparency/merkleIndexStore'],
  5: ['federation/federationSync', 'experiments/experimentRunner', 'forecast/forecastEngine', 'org/orgEngine'],
};

/* ── Time-to-level estimation ────────────────────────────────────── */

function estimateTimeToLevel(teamSize: TeamSize): Record<number, number> {
  const config = TEAM_PROFILES[teamSize];
  const result: Record<number, number> = {};
  let cumulative = 0;
  for (let level = 1; level <= config.maxLevel; level++) {
    const levelHours = config.baseHours * (level / 2) * config.multiplier;
    cumulative += levelHours;
    result[level] = Math.round(cumulative);
  }
  return result;
}

/* ── Profile generation ──────────────────────────────────────────── */

export function getLeanAMCProfile(teamSize?: TeamSize, domain?: string): LeanAMCProfile {
  const size = teamSize ?? 'small';
  const config = TEAM_PROFILES[size];
  const dom = domain ?? 'general';

  // Required = all modules up to achievable level
  const required: string[] = [];
  for (let l = 1; l <= config.maxLevel; l++) {
    required.push(...(LEVEL_MODULES[l] ?? []));
  }
  // Add domain modules
  required.push(...(DOMAIN_MODULES[dom] ?? []));
  const uniqueRequired = [...new Set(required)];

  // Skippable = modules beyond achievable level
  const skippable: string[] = [];
  for (let l = config.maxLevel + 1; l <= 5; l++) {
    skippable.push(...(LEVEL_MODULES[l] ?? []));
  }
  const uniqueSkippable = [...new Set(skippable)].filter(m => !uniqueRequired.includes(m));

  const tradeoffs: string[] = [];
  if (config.maxLevel < 4) tradeoffs.push('No enterprise-wide telemetry; limited dashboard and manual review cadence.');
  if (config.maxLevel < 5) tradeoffs.push('Reduced evidence depth for strategic/team-governance dimensions (L4-L5).');
  if (config.maxLevel < 3) tradeoffs.push('No 24/7 red-team simulation; fewer adversarial cycles per day.');
  if (size === 'solo') tradeoffs.push('Single point of failure for oversight and approval workflows.');
  tradeoffs.push(`Best suited for L1-L${config.maxLevel} outcomes with staged growth plan.`);

  return {
    requiredModules: uniqueRequired,
    skippableModules: uniqueSkippable,
    estimatedSetupHours: config.baseHours,
    maximumAchievableLevel: config.maxLevel,
    tradeoffs,
    teamSize: size,
    domain: dom !== 'general' ? dom : undefined,
    timeToLevel: estimateTimeToLevel(size),
  };
}

/* ── Available domains ───────────────────────────────────────────── */

export function listDomains(): string[] {
  return Object.keys(DOMAIN_MODULES);
}

/* ── Compare profiles ────────────────────────────────────────────── */

export function compareProfiles(a: LeanAMCProfile, b: LeanAMCProfile): {
  additionalModules: string[];
  removedModules: string[];
  hoursDelta: number;
  levelDelta: number;
} {
  return {
    additionalModules: b.requiredModules.filter(m => !a.requiredModules.includes(m)),
    removedModules: a.requiredModules.filter(m => !b.requiredModules.includes(m)),
    hoursDelta: b.estimatedSetupHours - a.estimatedSetupHours,
    levelDelta: b.maximumAchievableLevel - a.maximumAchievableLevel,
  };
}
