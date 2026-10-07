import { getDomainPackQuestions, type DomainQuestion } from "../score/domainPacks.js";
import {
  level, levelToPercent, likert, likertToPercent, percent, percentToLevel, type Level0to5, type Likert1to5
} from "../score/units.js";
import { getDomainMetadata, type Domain, type DomainMetadata } from "./domainRegistry.js";
import { getDomainModuleActivations } from "./domainModuleMap.js";

export interface DomainAssessmentInput {
  agentId: string;
  domain: Domain;
  /** Diagnostic levels per base question. */
  baseScores: Record<string, Level0to5>;
  /** Self-declared answers per domain question; an unanswered question counts as 1. Any other number throws. */
  domainQuestionScores: Record<string, Likert1to5>;
}

export interface DomainAssessmentResult {
  domain: Domain;
  domainMetadata: DomainMetadata;
  baseScore: number;
  domainScore: number;
  compositeScore: number;
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  complianceGaps: ComplianceGap[];
  activeModules: ActiveModuleProfile[];
  roadmap: DomainRoadmapItem[];
  regulatoryWarnings: string[];
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

/** The answer to a domain question, validated again because callers may pass untyped JSON. */
function answerFor(question: DomainQuestion, domainQuestionScores: Record<string, Likert1to5>): Likert1to5 {
  return likert(domainQuestionScores[question.id] ?? 1);
}

function averageScores(scores: Record<string, Level0to5>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + levelToPercent(level(value)), 0);
  return Math.round(total / values.length);
}

function calculateDomainScore(questions: DomainQuestion[], domainQuestionScores: Record<string, Likert1to5>): number {
  if (questions.length === 0) return 0;
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const question of questions) {
    const score = likertToPercent(answerFor(question, domainQuestionScores));
    weightedTotal += score * question.weight;
    totalWeight += question.weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round(weightedTotal / totalWeight);
}

function toMaturityLevel(score: number): DomainAssessmentResult["level"] {
  return `L${percentToLevel(percent(score))}` as DomainAssessmentResult["level"];
}

/** The level a domain question needs before it reports no compliance gap: L4 for critical or weight >= 20, else L3. */
export function requiredLevelForQuestion(question: DomainQuestion): number {
  if (CRITICAL_QUESTION_IDS.has(question.id)) return 4;
  if (question.weight >= 20) return 4;
  return 3;
}

function buildComplianceGaps(
  questions: DomainQuestion[],
  domainQuestionScores: Record<string, Likert1to5>
): ComplianceGap[] {
  const gaps: ComplianceGap[] = [];

  for (const question of questions) {
    const currentLevel: number = answerFor(question, domainQuestionScores);
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

  return {
    domain: input.domain,
    domainMetadata: metadata,
    baseScore,
    domainScore,
    compositeScore,
    level: toMaturityLevel(compositeScore),
    complianceGaps,
    activeModules,
    roadmap,
    regulatoryWarnings
  };
}
