/**
 * AMC Industry Packs — 41 industry-specific diagnostic sub-packs
 * Organized across 7 domain stations
 * 7 stations: Environment, Health, Wealth, Education, Mobility, Technology, Governance
 * Pack content lives in packs/stations/<station>.ts, one file per station.
 */
import type { Domain } from "./domainRegistry.js";
import { withRegulatoryCurrency, type ComplianceFrameworkRef, type RegulatoryReference } from "./packs/regulatorySchema.js";
import { farmToFork, weaveToWear, materialToMachines, sourceToSustenance, ubiquityToUtility, sipToSanitation } from "./packs/stations/environment.js";
import { digitalHealthRecord, wellnessManagement, patientLifecycle, clinicalLifecycle, professionalPractice, lifeTechnology, drugDiscovery, clinicalTrials, specializedMedicine } from "./packs/stations/health.js";
import { futureOfWork, digitalPayments, noPoverty, circularEconomy, blockchain } from "./packs/stations/wealth.js";
import { k12Pm3, higherEducation, skillsTraining, specializedEducation, differentlyAbled } from "./packs/stations/education.js";
import { sustainableCommunities, sustainablePorts, sustainableRealEstate, virtualInfrastructure, privacySecurityMobility, freight3plWarehouse } from "./packs/stations/mobility.js";
import { cognitionToIntelligence, networkedEcosystems, osSustainableOutcomes, infotainment, partnershipsProsperity } from "./packs/stations/technology.js";
import { digitalCitizensRights, danceOfDemocracy, petitionToLaw, citizenServices, publicPrivateCollaboration } from "./packs/stations/governance.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IndustryPackId =
  | "farm-to-fork"
  | "weave-to-wear"
  | "material-to-machines"
  | "source-to-sustenance"
  | "ubiquity-to-utility"
  | "sip-to-sanitation"
  | "digital-health-record"
  | "wellness-management"
  | "patient-lifecycle"
  | "clinical-lifecycle"
  | "professional-practice"
  | "life-technology"
  | "drug-discovery"
  | "clinical-trials"
  | "specialized-medicine"
  | "future-of-work"
  | "digital-payments"
  | "no-poverty"
  | "circular-economy"
  | "blockchain"
  | "k12-pm3"
  | "higher-education"
  | "skills-training"
  | "specialized-education"
  | "differently-abled"
  | "sustainable-communities"
  | "sustainable-ports"
  | "sustainable-real-estate"
  | "virtual-infrastructure"
  | "privacy-security-mobility"
  | "freight-3pl-warehouse"
  | "cognition-to-intelligence"
  | "networked-ecosystems"
  | "os-sustainable-outcomes"
  | "infotainment"
  | "partnerships-prosperity"
  | "digital-citizens-rights"
  | "dance-of-democracy"
  | "petition-to-law"
  | "citizen-services"
  | "public-private-collaboration";

export interface IndustryPackQuestion {
  id: string;
  dimension: string;
  text: string;
  regulatoryRef: string;
  l1: string;
  l3: string;
  l5: string;
  weight: number;
}

export interface IndustryPack {
  id: IndustryPackId;
  stationId: Domain;
  name: string;
  description: string;
  regulatoryBasis: string[];
  questions: IndustryPackQuestion[];
  certificationThreshold: number;
  complianceFrameworks: string[];
  /**
   * Industry-specific risk tier — distinct from core RiskTier ("low"|"med"|"high"|"critical").
   * Sector packs use regulatory-aligned tiers: critical > very-high > high > elevated.
   */
  riskTier: "critical" | "very-high" | "high" | "elevated";
  euAIActClassification: string;
  sdgAlignment: string[];
  certificationPath: string;
  keyRisks: string[];
  /** Pack content version (PackCurrencyFields v1); stamped at registry build when a pack literal omits it. */
  version?: string;
  /** ISO date of the pack's last regulatory-currency review (see packs/regulatorySchema.ts). */
  lastReviewed?: string;
  /** Derived: regulatoryBasis entries resolved to catalogued instruments with currency. */
  regulatoryReferences?: RegulatoryReference[];
  /** Derived: complianceFrameworks entries normalized to built-in or catalogued external frameworks. */
  complianceFrameworkRefs?: ComplianceFrameworkRef[];
}

export interface IndustryPackAssessment {
  packId: IndustryPackId;
  responses: Record<string, number>;
}

// IndustryPackScoreResult is defined later in the functions section.

// ---------------------------------------------------------------------------
// REGISTRY — all 41 packs
// ---------------------------------------------------------------------------

const PACK_CONTENT: Record<IndustryPackId, IndustryPack> = {
  // Environment (6)
  "farm-to-fork": farmToFork,
  "weave-to-wear": weaveToWear,
  "material-to-machines": materialToMachines,
  "source-to-sustenance": sourceToSustenance,
  "ubiquity-to-utility": ubiquityToUtility,
  "sip-to-sanitation": sipToSanitation,
  // Health (9)
  "digital-health-record": digitalHealthRecord,
  "wellness-management": wellnessManagement,
  "patient-lifecycle": patientLifecycle,
  "clinical-lifecycle": clinicalLifecycle,
  "professional-practice": professionalPractice,
  "life-technology": lifeTechnology,
  "drug-discovery": drugDiscovery,
  "clinical-trials": clinicalTrials,
  "specialized-medicine": specializedMedicine,
  // Wealth (5)
  "future-of-work": futureOfWork,
  "digital-payments": digitalPayments,
  "no-poverty": noPoverty,
  "circular-economy": circularEconomy,
  "blockchain": blockchain,
  // Education (5)
  "k12-pm3": k12Pm3,
  "higher-education": higherEducation,
  "skills-training": skillsTraining,
  "specialized-education": specializedEducation,
  "differently-abled": differentlyAbled,
  // Mobility (5)
  "sustainable-communities": sustainableCommunities,
  "sustainable-ports": sustainablePorts,
  "sustainable-real-estate": sustainableRealEstate,
  "virtual-infrastructure": virtualInfrastructure,
  "privacy-security-mobility": privacySecurityMobility,
  "freight-3pl-warehouse": freight3plWarehouse,
  // Technology (5)
  "cognition-to-intelligence": cognitionToIntelligence,
  "networked-ecosystems": networkedEcosystems,
  "os-sustainable-outcomes": osSustainableOutcomes,
  "infotainment": infotainment,
  "partnerships-prosperity": partnershipsProsperity,
  // Governance (5)
  "digital-citizens-rights": digitalCitizensRights,
  "dance-of-democracy": danceOfDemocracy,
  "petition-to-law": petitionToLaw,
  "citizen-services": citizenServices,
  "public-private-collaboration": publicPrivateCollaboration,
};

/** Registry with derived regulatory currency (regulatoryReferences, complianceFrameworkRefs) attached. */
export const INDUSTRY_PACKS = Object.fromEntries(
  Object.entries(PACK_CONTENT).map(([id, pack]) => [id, withRegulatoryCurrency(pack)])
) as Record<IndustryPackId, IndustryPack>;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export function getIndustryPacksByStation(stationId: Domain): IndustryPack[] {
  return Object.values(INDUSTRY_PACKS).filter(p => p.stationId === stationId);
}

export function getPacksForDomain(domain: Domain): IndustryPack[] {
  return getIndustryPacksByStation(domain);
}

export function listIndustryPacks(): IndustryPack[] {
  return Object.values(INDUSTRY_PACKS);
}

export function getIndustryPack(id: IndustryPackId): IndustryPack {
  return INDUSTRY_PACKS[id];
}

export function getPackById(packId: string): IndustryPack | undefined {
  return (INDUSTRY_PACKS as Record<string, IndustryPack | undefined>)[packId];
}

export interface IndustryPackScoreResult {
  packId: IndustryPackId;
  packName: string;
  stationId: Domain;
  percentage: number;
  level: number;
  certified: boolean;
  questionResults: Array<{
    id: string;
    dimension: string;
    score: number;
    weight: number;
    percentage: number;
  }>;
  complianceGaps: string[];
  riskTier: string;
}

export function scoreIndustryPack(
  packId: IndustryPackId,
  responses: Record<string, number>
): IndustryPackScoreResult {
  const pack = INDUSTRY_PACKS[packId];
  let totalEarned = 0;
  let totalPossible = 0;
  const questionResults: IndustryPackScoreResult["questionResults"] = [];
  const complianceGaps: string[] = [];

  for (const q of pack.questions) {
    const level = Math.min(5, Math.max(1, responses[q.id] ?? 1));
    const levelPct = (level - 1) / 4;
    const earned = q.weight * levelPct;
    totalEarned += earned;
    totalPossible += q.weight;
    questionResults.push({
      id: q.id,
      dimension: q.dimension,
      score: Math.round(earned * 10) / 10,
      weight: q.weight,
      percentage: Math.round(levelPct * 100),
    });
    if (level < 3) {
      complianceGaps.push(`${q.id} (${q.dimension}): L${level} — below minimum. Ref: ${q.regulatoryRef}`);
    }
  }

  const percentage = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
  const level = percentage >= 90 ? 5 : percentage >= 75 ? 4 : percentage >= 55 ? 3 : percentage >= 30 ? 2 : 1;
  const certified = percentage >= pack.certificationThreshold && complianceGaps.length === 0;

  return {
    packId,
    packName: pack.name,
    stationId: pack.stationId,
    percentage,
    level,
    certified,
    questionResults,
    complianceGaps,
    riskTier: pack.riskTier,
  };
}

export function listIndustryPackIds(): IndustryPackId[] {
  return Object.keys(INDUSTRY_PACKS) as IndustryPackId[];
}

/**
 * Maps an IndustryPack sector riskTier to the agent-level RiskTier used by
 * the diagnostic runner and AgentConfig.
 *
 * NOTE: IndustryPack uses sector-specific risk tiers ("very-high", "elevated")
 * while AgentConfig uses operational tiers ("low" | "med" | "high" | "critical").
 * These are intentionally separate type systems — sector risk describes regulatory
 * exposure; operational risk describes deployment blast radius.
 */
export function sectorRiskToAgentRiskTier(
  sectorRisk: IndustryPack["riskTier"]
): "low" | "med" | "high" | "critical" {
  switch (sectorRisk) {
    case "critical": return "critical";
    case "very-high": return "high";
    case "high": return "high";
    case "elevated": return "med";
    default: return "med";
  }
}

export function getStationSummary(stationId: Domain): {
  stationId: Domain;
  packCount: number;
  totalQuestions: number;
  frameworks: string[];
} {
  const packs = getIndustryPacksByStation(stationId);
  const frameworks = [...new Set(packs.flatMap(p => p.complianceFrameworks))];
  return {
    stationId,
    packCount: packs.length,
    totalQuestions: packs.reduce((s, p) => s + p.questions.length, 0),
    frameworks,
  };
}
