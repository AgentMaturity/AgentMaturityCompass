import { getDomainPackQuestions, type DomainQuestion } from "../score/domainPacks.js";
import { getDomainMetadata, type Domain, type DomainMetadata } from "./domainRegistry.js";
import { getDomainModuleActivations } from "./domainModuleMap.js";
import { getIndustryPacksByStation } from "./industryPacks.js";

export interface DomainAssessmentInput {
  agentId: string;
  domain: Domain;
  baseScores: Record<string, number>;
  domainQuestionScores: Record<string, number>;
}

export interface DomainAssessmentResult {
  domain: Domain;
  domainMetadata: DomainMetadata;
  baseScore: number;
  domainScore: number;
  compositeScore: number;
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  certificationReadiness: boolean;
  complianceGaps: ComplianceGap[];
  activeModules: ActiveModuleProfile[];
  roadmap: DomainRoadmapItem[];
  regulatoryWarnings: string[];
  euAIActClassification: EuAIActClassification;
  certification: CertificationOutcome;
}

/** Station-level EU AI Act category plus each station pack's Annex III classification. */
export interface EuAIActClassification {
  domainCategory: DomainMetadata["euAIActCategory"];
  packs: Array<{
    packId: string;
    packName: string;
    classification: string;
    /** Annex III points (1-8) named in the classification text. */
    annexIIIPoints: number[];
    generalPurpose: boolean;
  }>;
}

/** Certification is ready when compositeScore >= threshold and no critical control sits at L1. */
export interface CertificationOutcome {
  threshold: number;
  comparison: ">=";
  compositeScore: number;
  meetsThreshold: boolean;
  blockingGaps: string[];
  ready: boolean;
}

export interface ComplianceGap {
  questionId: string;
  dimension: string;
  currentLevel: number;
  requiredLevel: number;
  regulatoryRef: string;
  remediation: string;
}

export interface ActiveModuleProfile {
  moduleId: string;
  moduleName: string;
  relevance: "critical" | "high" | "medium" | "low";
  currentStatus: "active" | "inactive" | "partial";
  activationReason: string;
}

export interface DomainRoadmapItem {
  priority: 1 | 2 | 3;
  action: string;
  moduleId?: string;
  timeframe: "30d" | "60d" | "90d";
  regulatoryImpact: string;
}

const CERTIFICATION_THRESHOLDS: Record<Domain, number> = {
  health: 75,
  education: 72,
  environment: 78,
  mobility: 80,
  governance: 74,
  technology: 70,
  wealth: 76
};

const CRITICAL_QUESTION_IDS = new Set<string>([
  "HC-1", "HC-2", "HC-7",
  "FIN-1", "FIN-3", "FIN-7",
  "SC-1", "SC-2", "SC-6",
  "ED-1", "ED-2",
  "ENV-1", "ENV-3", "ENV-4",
  "MOB-1", "MOB-3", "MOB-4",
  "GOV-1", "GOV-2", "GOV-4",
  "TECH-1", "TECH-2", "TECH-3",
  "WLT-1", "WLT-2", "WLT-6"
]);

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function normalizeScore(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw <= 5) {
    const boundedLevel = Math.max(1, Math.min(5, raw));
    return ((boundedLevel - 1) / 4) * 100;
  }
  return clampScore(raw);
}

function levelFromRaw(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  if (raw <= 5) return Math.max(1, Math.min(5, Math.round(raw)));
  const score = normalizeScore(raw);
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  return 1;
}

function averageScores(scores: Record<string, number>): number {
  const values = Object.values(scores).filter((value) => Number.isFinite(value));
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + normalizeScore(value), 0);
  return Math.round(total / values.length);
}

function calculateDomainScore(questions: DomainQuestion[], domainQuestionScores: Record<string, number>): number {
  if (questions.length === 0) return 0;
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const question of questions) {
    const score = normalizeScore(domainQuestionScores[question.id] ?? 0);
    weightedTotal += score * question.weight;
    totalWeight += question.weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round(weightedTotal / totalWeight);
}

function toMaturityLevel(score: number): DomainAssessmentResult["level"] {
  if (score >= 90) return "L5";
  if (score >= 75) return "L4";
  if (score >= 60) return "L3";
  if (score >= 40) return "L2";
  return "L1";
}

function requiredLevelForQuestion(question: DomainQuestion): number {
  if (CRITICAL_QUESTION_IDS.has(question.id)) return 4;
  if (question.weight >= 20) return 4;
  return 3;
}

function buildComplianceGaps(
  questions: DomainQuestion[],
  domainQuestionScores: Record<string, number>
): ComplianceGap[] {
  const gaps: ComplianceGap[] = [];

  for (const question of questions) {
    const currentLevel = levelFromRaw(domainQuestionScores[question.id] ?? 0);
    const requiredLevel = requiredLevelForQuestion(question);
    if (currentLevel >= requiredLevel) continue;

    const remediation =
      `Raise ${question.id} from L${currentLevel} to L${requiredLevel}. ` +
      `Implement evidence for ${question.dimension} and capture: ${question.evidenceRequired}.`;

    gaps.push({
      questionId: question.id,
      dimension: question.dimension,
      currentLevel,
      requiredLevel,
      regulatoryRef: question.regulatoryRef,
      remediation
    });
  }

  return gaps;
}

function moduleStatusForScore(
  relevance: ActiveModuleProfile["relevance"],
  compositeScore: number
): ActiveModuleProfile["currentStatus"] {
  const thresholds: Record<ActiveModuleProfile["relevance"], { active: number; partial: number }> = {
    critical: { active: 78, partial: 60 },
    high: { active: 70, partial: 52 },
    medium: { active: 62, partial: 45 },
    low: { active: 55, partial: 40 }
  };

  const threshold = thresholds[relevance];
  if (compositeScore >= threshold.active) return "active";
  if (compositeScore >= threshold.partial) return "partial";
  return "inactive";
}

function buildActiveModules(domain: Domain, compositeScore: number): ActiveModuleProfile[] {
  return getDomainModuleActivations(domain).map((module) => ({
    moduleId: module.moduleId,
    moduleName: module.moduleName,
    relevance: module.relevance,
    currentStatus: moduleStatusForScore(module.relevance, compositeScore),
    activationReason: module.activationReason
  }));
}

function buildRoadmap(
  metadata: DomainMetadata,
  complianceGaps: ComplianceGap[],
  activeModules: ActiveModuleProfile[]
): DomainRoadmapItem[] {
  const sortedGaps = [...complianceGaps].sort((a, b) => {
    const aDelta = a.requiredLevel - a.currentLevel;
    const bDelta = b.requiredLevel - b.currentLevel;
    if (bDelta !== aDelta) return bDelta - aDelta;
    return a.questionId.localeCompare(b.questionId);
  });

  const moduleBacklog = activeModules.filter((module) => module.currentStatus !== "active");
  const roadmap: DomainRoadmapItem[] = [];

  for (let index = 0; index < 3; index += 1) {
    const priority = (index + 1) as 1 | 2 | 3;
    const timeframe = priority === 1 ? "30d" : priority === 2 ? "60d" : "90d";

    const gap = sortedGaps[index];
    const fallbackModule = moduleBacklog[index] ?? activeModules[index];
    const moduleId = metadata.primaryModules[index] ?? fallbackModule?.moduleId;

    if (gap) {
      roadmap.push({
        priority,
        action: `Close compliance gap ${gap.questionId}: ${gap.remediation}`,
        moduleId,
        timeframe,
        regulatoryImpact: gap.regulatoryRef
      });
      continue;
    }

    roadmap.push({
      priority,
      action: `Increase operational coverage for ${metadata.name} controls by hardening ${fallbackModule?.moduleName ?? "domain controls"}.`,
      moduleId,
      timeframe,
      regulatoryImpact: metadata.regulatoryBasis[0] ?? "Domain regulatory baseline"
    });
  }

  return roadmap;
}

function buildRegulatoryWarnings(complianceGaps: ComplianceGap[]): string[] {
  const warnings = new Set<string>();
  for (const gap of complianceGaps) {
    const severity = gap.currentLevel <= 1 ? "Critical" : gap.currentLevel === 2 ? "Elevated" : "Moderate";
    warnings.add(`${severity} risk in ${gap.questionId} against ${gap.regulatoryRef}.`);
  }
  return [...warnings];
}

function evaluateCertification(
  domain: Domain,
  compositeScore: number,
  complianceGaps: ComplianceGap[]
): CertificationOutcome {
  const threshold = CERTIFICATION_THRESHOLDS[domain];
  const blockingGaps = complianceGaps
    .filter((gap) => CRITICAL_QUESTION_IDS.has(gap.questionId) && gap.currentLevel <= 1)
    .map((gap) => gap.questionId);
  const meetsThreshold = compositeScore >= threshold;
  return { threshold, comparison: ">=", compositeScore, meetsThreshold, blockingGaps, ready: meetsThreshold && blockingGaps.length === 0 };
}

const ANNEX_III_POINT_COUNT = 8;

/** Annex III points named after "Annex III" (e.g. "§2 ... / §4" gives [2, 4]) and whether GPAI is declared. */
export function parseAnnexIIIPoints(classification: string): { points: number[]; generalPurpose: boolean } {
  const annexAt = classification.indexOf("Annex III");
  const points = new Set<number>();
  if (annexAt >= 0) {
    for (const match of classification.slice(annexAt).matchAll(/§\s*(\d+)/g)) {
      const point = Number(match[1]);
      if (point >= 1 && point <= ANNEX_III_POINT_COUNT) points.add(point);
    }
  }
  return { points: [...points].sort((a, b) => a - b), generalPurpose: /General Purpose AI/i.test(classification) };
}

function buildEuAIActClassification(domain: Domain, metadata: DomainMetadata): EuAIActClassification {
  return {
    domainCategory: metadata.euAIActCategory,
    packs: getIndustryPacksByStation(domain).map((pack) => {
      const parsed = parseAnnexIIIPoints(pack.euAIActClassification);
      return {
        packId: pack.id,
        packName: pack.name,
        classification: pack.euAIActClassification,
        annexIIIPoints: parsed.points,
        generalPurpose: parsed.generalPurpose
      };
    })
  };
}

export function assessDomain(input: DomainAssessmentInput): DomainAssessmentResult {
  const metadata = getDomainMetadata(input.domain);
  const questions = getDomainPackQuestions(input.domain);

  const baseScore = averageScores(input.baseScores);
  const domainScore = calculateDomainScore(questions, input.domainQuestionScores);
  const compositeScore = Math.round((baseScore * 0.6) + (domainScore * 0.4));
  const complianceGaps = buildComplianceGaps(questions, input.domainQuestionScores);
  const activeModules = buildActiveModules(input.domain, compositeScore);
  const roadmap = buildRoadmap(metadata, complianceGaps, activeModules);
  const regulatoryWarnings = buildRegulatoryWarnings(complianceGaps);
  const certification = evaluateCertification(input.domain, compositeScore, complianceGaps);

  return {
    domain: input.domain,
    domainMetadata: metadata,
    baseScore,
    domainScore,
    compositeScore,
    level: toMaturityLevel(compositeScore),
    certificationReadiness: certification.ready,
    complianceGaps,
    activeModules,
    roadmap,
    regulatoryWarnings,
    euAIActClassification: buildEuAIActClassification(input.domain, metadata),
    certification
  };
}
