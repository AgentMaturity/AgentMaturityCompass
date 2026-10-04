export type Domain =
  | "health"
  | "education"
  | "environment"
  | "mobility"
  | "governance"
  | "technology"
  | "wealth";

export interface DomainMetadata {
  id: Domain;
  name: string;
  description: string;
  aliases: string[];
  sectorTags: string[];
  recommendedIndustryPacks: string[];
  regulatoryBasis: string[];
  riskLevel: "high" | "very-high" | "critical";
  euAIActCategory: "prohibited" | "high-risk" | "limited-risk" | "general-purpose";
  questionCount: number;
  assurancePacks: string[];
  primaryModules: string[];
  complianceFrameworks: string[];
}

export const DOMAIN_REGISTRY: Record<Domain, DomainMetadata> = {
  health: {
    id: "health",
    name: "Health",
    description: "Clinical and care-delivery agents operating under medical safety, PHI constraints, and functional safety requirements.",
    aliases: ["healthcare", "clinical", "medical", "digital-health"],
    sectorTags: ["clinical-decision-support", "phi", "medical-devices", "patient-care"],
    recommendedIndustryPacks: ["digital-health-record", "patient-lifecycle", "clinical-lifecycle", "professional-practice", "specialized-medicine"],
    regulatoryBasis: ["FDA 510(k)", "HIPAA", "FDA AI/ML Action Plan", "EU MDR", "IEC 62304"],
    riskLevel: "critical",
    euAIActCategory: "high-risk",
    questionCount: 9,
    assurancePacks: ["healthcarePHI", "safetyCriticalSIL"],
    primaryModules: ["V4", "S10", "E19", "W3", "E5", "E2"],
    complianceFrameworks: ["FDA 510(k)", "HIPAA", "EU MDR", "HL7 FHIR", "IEC 62304"]
  },
  education: {
    id: "education",
    name: "Education",
    description: "Learner-facing agents with FERPA/COPPA protections and educator oversight requirements.",
    aliases: ["edtech", "learning", "students", "school"],
    sectorTags: ["k12", "higher-education", "skills-training", "accessibility"],
    recommendedIndustryPacks: ["k12-pm3", "higher-education", "skills-training", "specialized-education", "differently-abled"],
    regulatoryBasis: ["FERPA", "COPPA", "EU AI Act", "GDPR"],
    riskLevel: "very-high",
    euAIActCategory: "high-risk",
    questionCount: 6,
    assurancePacks: ["educationFERPA"],
    primaryModules: ["V4", "S9", "E22", "W5"],
    complianceFrameworks: ["FERPA", "COPPA", "EU AI Act", "GDPR"]
  },
  environment: {
    id: "environment",
    name: "Environment / Critical Infrastructure",
    description: "Infrastructure, environmental, and supply-chain operations with resilience, isolation, traceability, and safety-stop requirements.",
    aliases: ["critical-infrastructure", "infrastructure", "energy", "environmental", "supply-chain", "supply chain", "supplychain", "scm", "procurement", "vendor-risk"],
    sectorTags: ["supply-chain", "supplier-risk", "procurement", "traceability", "materials", "energy-grid", "food-chain"],
    recommendedIndustryPacks: ["farm-to-fork", "weave-to-wear", "material-to-machines", "source-to-sustenance", "ubiquity-to-utility"],
    regulatoryBasis: ["EU AI Act", "NERC CIP", "EPA Regulations", "ISO 14001", "NIST CSF"],
    riskLevel: "critical",
    euAIActCategory: "high-risk",
    questionCount: 6,
    assurancePacks: ["environmentalInfra"],
    primaryModules: ["E5", "E28", "E19", "S2", "W6"],
    complianceFrameworks: ["EU AI Act", "NERC CIP", "ISO 14001", "NIST CSF", "IEC 62443"]
  },
  mobility: {
    id: "mobility",
    name: "Mobility",
    description: "Transportation, logistics, and connected-infrastructure agents with ASIL/SOTIF/SIL safety obligations, OTA cybersecurity constraints, and deterministic fail-safe requirements.",
    aliases: ["transport", "transportation", "safety-critical", "logistics", "freight", "3pl", "third-party-logistics", "warehouse", "warehousing", "carrier", "carrier-management", "port-logistics", "supply-chain-logistics"],
    sectorTags: ["logistics", "freight", "3pl", "warehouse", "carrier-management", "ports", "connected-infrastructure"],
    recommendedIndustryPacks: ["freight-3pl-warehouse", "sustainable-ports", "virtual-infrastructure", "privacy-security-mobility", "sustainable-communities"],
    regulatoryBasis: ["NHTSA AV Guidelines", "ISO 26262", "UNECE WP.29", "ISO 21448", "IEC 61508", "EU AI Act"],
    riskLevel: "critical",
    euAIActCategory: "high-risk",
    questionCount: 14,
    assurancePacks: ["mobilityFunctionalSafety", "safetyCriticalSIL"],
    primaryModules: ["E2", "E5", "E17", "S3", "W4"],
    complianceFrameworks: ["ISO 26262", "UNECE R155", "UNECE R156", "ISO 21448", "IEC 61508", "SAE J3016", "DO-178C"]
  },
  governance: {
    id: "governance",
    name: "Governance / Public Sector",
    description: "Public-impact systems requiring accountability, contestability, and democratic safeguards.",
    aliases: ["public-sector", "government", "civic", "citizen-services"],
    sectorTags: ["public-services", "elections", "civic-identity", "public-private-partnerships"],
    recommendedIndustryPacks: ["digital-citizens-rights", "dance-of-democracy", "petition-to-law", "citizen-services", "public-private-collaboration"],
    regulatoryBasis: ["NIST AI RMF", "EU AI Act", "FedRAMP", "FISMA", "OMB M-24-10", "GDPR"],
    riskLevel: "very-high",
    euAIActCategory: "high-risk",
    questionCount: 6,
    assurancePacks: ["governanceNISTRMF"],
    primaryModules: ["W3", "E15", "W1", "W7", "E34"],
    complianceFrameworks: ["NIST AI RMF", "FedRAMP", "FISMA", "OMB M-24-10", "GDPR", "EU AI Act"]
  },
  technology: {
    id: "technology",
    name: "Technology / General AI Services",
    description: "General-purpose AI services with privacy, incident response, and supply-chain security expectations.",
    aliases: ["tech", "general-ai", "platform", "saas", "software"],
    sectorTags: ["privacy", "soc2", "ai-services", "content-platforms", "software-supply-chain"],
    recommendedIndustryPacks: ["cognition-to-intelligence", "networked-ecosystems", "os-sustainable-outcomes", "infotainment"],
    regulatoryBasis: ["GDPR", "CCPA", "SOC 2 Type II", "ISO 27001", "OWASP AI Security", "EU AI Act"],
    riskLevel: "high",
    euAIActCategory: "general-purpose",
    questionCount: 6,
    assurancePacks: ["technologyGDPRSOC"],
    primaryModules: ["S1", "S10", "E1", "E5", "V2", "W3"],
    complianceFrameworks: ["GDPR", "CCPA", "SOC 2 Type II", "ISO 27001", "OWASP AI Top 10"]
  },
  wealth: {
    id: "wealth",
    name: "Wealth",
    description: "Financial services and investment agents covering model risk, AML, explainability, fiduciary duty, and market-abuse controls.",
    aliases: ["financial", "finance", "fintech", "banking", "payments", "insurance", "crypto"],
    sectorTags: ["wealth-management", "payments", "lending", "aml", "market-abuse", "model-risk"],
    recommendedIndustryPacks: ["digital-payments", "no-poverty", "blockchain"],
    regulatoryBasis: ["SR 11-7", "BSA/AML", "SEC Rule 17a-4", "UDAAP/ECOA", "MiFID II", "CFTC", "FINRA", "Dodd-Frank", "FCA SYSC", "GDPR"],
    riskLevel: "very-high",
    euAIActCategory: "high-risk",
    questionCount: 14,
    assurancePacks: ["wealthManagementMiFID", "financialModelRisk"],
    primaryModules: ["E20", "E23", "E5", "V8", "S15", "W3"],
    complianceFrameworks: ["SR 11-7", "BSA/AML", "SEC 17a-4", "ECOA", "MiFID II", "FINRA 2111", "SEC Reg BI", "CFTC 1.73", "GDPR", "CCPA"]
  }
};

const DOMAIN_IDS: Domain[] = Object.keys(DOMAIN_REGISTRY) as Domain[];

/**
 * Industry-specific assurance packs (src/assurance/packs). Every id here must
 * resolve to at least one station through `assurancePacks` above or through
 * INDUSTRY_ASSURANCE_PACK_STATIONS below; tests/domainRegistry.test.ts holds
 * that line. The first nine are the registry's own `assurancePacks`; the rest
 * were reachable only by explicit id before 2026-10-03.
 */
export const INDUSTRY_ASSURANCE_PACK_IDS = [
  "healthcarePHI",
  "safetyCriticalSIL",
  "educationFERPA",
  "environmentalInfra",
  "mobilityFunctionalSafety",
  "governanceNISTRMF",
  "technologyGDPRSOC",
  "wealthManagementMiFID",
  "financialModelRisk",
  "hipaaCompliance",
  "pharmaCompliance",
  "financialSOX",
  "legalCompliance",
  "euAiActArticle",
  "globalAIRegulatory",
  "iso42005ImpactAssessment",
  "realtime-voice-safety",
  "sbom-supply-chain"
] as const;

export type IndustryAssurancePackId = (typeof INDUSTRY_ASSURANCE_PACK_IDS)[number];

export interface IndustryAssurancePackStationMapping {
  stations: Domain[];
  /** One line: why the pack's scenarios belong to these stations. */
  rationale: string;
  /** The rule or page the rationale rests on, as read on 2026-10-03; 'unverified' entries say why. */
  source: string;
}

const GOVINFO_CFR_2024 = "govinfo CFR-2024 annual edition, read 2026-10-03";
const EU_AI_ACT_UNVERIFIED = "Regulation (EU) 2024/1689 (unverified: EUR-Lex unreachable 2026-10-03; europa.eu AI Act policy page read)";

export const INDUSTRY_ASSURANCE_PACK_STATIONS: Record<IndustryAssurancePackId, IndustryAssurancePackStationMapping> = {
  healthcarePHI: { stations: ["health"], rationale: "PHI output and access scenarios apply to covered entities and business associates.", source: `45 CFR 164.312 (${GOVINFO_CFR_2024})` },
  safetyCriticalSIL: { stations: ["health", "mobility"], rationale: "Determinism and fail-safe scenarios apply to medical devices and vehicle functions.", source: "IEC 61508 / ISO 26262 (unverified: iso.org 403 on 2026-10-03); registry regulatoryBasis" },
  educationFERPA: { stations: ["education"], rationale: "Education-record isolation and parental-consent scenarios.", source: `34 CFR 99.32 and 16 CFR 312.5 (${GOVINFO_CFR_2024})` },
  environmentalInfra: { stations: ["environment"], rationale: "Physical-action isolation and emergency-stop scenarios for infrastructure.", source: "NERC CIP-008-6 R4 (nerc.com PDF pages 9-12 read 2026-10-03)" },
  mobilityFunctionalSafety: { stations: ["mobility"], rationale: "ASIL verification and manual-override scenarios.", source: "49 CFR 573.6 (govinfo CFR-2024 read 2026-10-03); ISO 26262 (unverified)" },
  governanceNISTRMF: { stations: ["governance"], rationale: "Govern/Map/Measure/Manage completeness scenarios for public-sector systems.", source: "NIST AI RMF 1.0 (nist.gov page read 2026-10-03)" },
  technologyGDPRSOC: { stations: ["technology"], rationale: "Privacy-by-design, incident-response and vendor scenarios for general AI services.", source: "GDPR Art. 33 (unverified: EUR-Lex unreachable 2026-10-03; ICO 72-hour page read)" },
  wealthManagementMiFID: { stations: ["wealth"], rationale: "Fiduciary, suitability and market-abuse scenarios.", source: "17 CFR 240.17a-4 (govinfo CFR-2024 read 2026-10-03); MiFID II (unverified)" },
  financialModelRisk: { stations: ["wealth"], rationale: "Decision explainability, numeric validation and AML scenarios.", source: "31 CFR 1020.320 (govinfo CFR-2024 read 2026-10-03); SR 11-7 (title/date page read)" },
  hipaaCompliance: { stations: ["health"], rationale: "De-identification, minimum-necessary, audit-trail, breach and BAA scenarios are HIPAA Privacy/Security/Breach Rule obligations of covered entities.", source: `45 CFR 164.308, 164.312, 164.316, 164.404 (${GOVINFO_CFR_2024})` },
  pharmaCompliance: { stations: ["health"], rationale: "Drug interaction, dosing, controlled-substance and black-box scenarios belong to clinical and pharmaceutical practice, which the health station's clinical-trials and drug-discovery packs already cover.", source: `21 CFR 11.10 and 21 CFR 312.32 (${GOVINFO_CFR_2024}); DEA 21 CFR 1301-1321 (registry regulatoryBasis, not fetched)` },
  financialSOX: { stations: ["wealth"], rationale: "Segregation of duties, MNPI, reporting integrity, whistleblower and audit-evidence scenarios are securities-law obligations of financial-services firms.", source: `17 CFR 240.17a-4 (${GOVINFO_CFR_2024}); SOX 302/404, 15 U.S.C. 7241/7262 (unverified: not fetched)` },
  legalCompliance: { stations: ["governance", "wealth"], rationale: "Unauthorized-practice, privilege, filing-jurisdiction and conflict scenarios arise in civic/legal process (governance: petition-to-law, citizen-services packs) and in regulated financial filings (wealth).", source: "unverified: professional-conduct rules are state-level (no single federal primary text); mapping rests on the stations' industry packs in src/domains/industryPacks.ts" },
  euAiActArticle: { stations: ["health", "education", "environment", "mobility", "governance", "wealth"], rationale: "Articles 9-17 bind high-risk systems; these six stations carry euAIActCategory high-risk in this registry (technology is general-purpose).", source: EU_AI_ACT_UNVERIFIED },
  globalAIRegulatory: { stations: ["governance", "technology"], rationale: "Cross-jurisdiction inventory and classification scenarios fall on general AI service providers and on public bodies that must keep an AI use case inventory.", source: "OMB M-25-21 pages 1-4 read 2026-10-03 (annual AI use case inventory); EU AI Act (unverified)" },
  iso42005ImpactAssessment: { stations: ["governance", "wealth"], rationale: "Impact-assessment scope, identification, evaluation and treatment scenarios map to the deployers obliged to run a fundamental rights impact assessment: public bodies and credit/insurance deployers.", source: `${EU_AI_ACT_UNVERIFIED}, Art. 27; ISO/IEC 42005:2025 (unverified: iso.org 403)` },
  "realtime-voice-safety": { stations: ["technology", "wealth"], rationale: "Voice impersonation, authority manipulation, consent and session-hijack scenarios target consumer voice agents and voice-channel financial fraud.", source: "16 CFR 461.3 (govinfo CFR-2025 read 2026-10-03); FCC AI-voice TCPA ruling (unverified: fcc.gov 403)" },
  "sbom-supply-chain": { stations: ["technology", "environment"], rationale: "Unverified-dependency, typosquat and unsigned-binary scenarios are software-supply-chain controls for AI service providers and for critical-infrastructure operators.", source: "EO 14028 (cisa.gov page read 2026-10-03); NIST SP 800-218 (csrc.nist.gov page read); NERC CIP-013-2 (unverified: not fetched)" }
};

export function getIndustryAssurancePacksForStation(domain: Domain): Array<{ packId: IndustryAssurancePackId; rationale: string; source: string }> {
  return INDUSTRY_ASSURANCE_PACK_IDS
    .filter((packId) => INDUSTRY_ASSURANCE_PACK_STATIONS[packId].stations.includes(domain))
    .map((packId) => ({
      packId,
      rationale: INDUSTRY_ASSURANCE_PACK_STATIONS[packId].rationale,
      source: INDUSTRY_ASSURANCE_PACK_STATIONS[packId].source
    }));
}

export function listIndustryAssurancePackStations(packId: string): Domain[] {
  const mapped = (INDUSTRY_ASSURANCE_PACK_STATIONS as Record<string, IndustryAssurancePackStationMapping | undefined>)[packId];
  const stations = new Set<Domain>(mapped?.stations ?? []);
  for (const id of DOMAIN_IDS) {
    if (DOMAIN_REGISTRY[id].assurancePacks.includes(packId)) stations.add(id);
  }
  return [...stations];
}

/** Industry assurance pack ids that no station reaches; the registry test expects this to be empty. */
export function listUnmappedIndustryAssurancePacks(): string[] {
  return INDUSTRY_ASSURANCE_PACK_IDS.filter((packId) => listIndustryAssurancePackStations(packId).length === 0);
}

function cloneDomainMetadata(metadata: DomainMetadata): DomainMetadata {
  return {
    ...metadata,
    aliases: [...metadata.aliases],
    sectorTags: [...metadata.sectorTags],
    recommendedIndustryPacks: [...metadata.recommendedIndustryPacks],
    regulatoryBasis: [...metadata.regulatoryBasis],
    assurancePacks: [...metadata.assurancePacks],
    primaryModules: [...metadata.primaryModules],
    complianceFrameworks: [...metadata.complianceFrameworks]
  };
}

function normalizeDomainToken(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function findAliasDomain(value: string): Domain | null {
  const normalized = normalizeDomainToken(value);
  for (const id of DOMAIN_IDS) {
    const metadata = DOMAIN_REGISTRY[id];
    const candidates = [...metadata.aliases, ...metadata.sectorTags];
    if (candidates.some((candidate) => normalizeDomainToken(candidate) === normalized)) {
      return id;
    }
  }
  return null;
}

export function listDomainMetadata(): DomainMetadata[] {
  return DOMAIN_IDS.map((id) => cloneDomainMetadata(DOMAIN_REGISTRY[id]));
}

export function getDomainMetadata(domain: Domain): DomainMetadata {
  return cloneDomainMetadata(DOMAIN_REGISTRY[domain]);
}

export function isDomain(value: string): value is Domain {
  return (DOMAIN_IDS as string[]).includes(normalizeDomainToken(value));
}

export function parseDomain(value: string): Domain {
  const normalized = normalizeDomainToken(value);
  if ((DOMAIN_IDS as string[]).includes(normalized)) {
    return normalized as Domain;
  }
  const aliasDomain = findAliasDomain(value);
  if (aliasDomain) {
    return aliasDomain;
  }
  const aliases = DOMAIN_IDS.flatMap((id) => DOMAIN_REGISTRY[id].aliases).sort();
  throw new Error(`Unknown domain: ${value}. Expected one of: ${DOMAIN_IDS.join(", ")}. Common aliases: ${aliases.join(", ")}`);
}

export function listDomainIds(): Domain[] {
  return [...DOMAIN_IDS];
}
