/**
 * Domain-Specific AMC Rubric Packs
 *
 * The seven station rubrics (61 questions). Since P1-53 the questions live only in the catalog, as the self-reported
 * questionnaire catalog/questionnaires/domain-rubrics.yaml; this module reads it once per process and keeps the
 * DomainQuestion shape and order. A rubric score is a self-reported number: it never sets a regulated status.
 */

import { loadCatalog } from "../catalog/loader.js";
import type { QuestionnaireItem } from "../catalog/types.js";
import type { Domain } from "../domains/domainRegistry.js";
import { likert, likertToPercent, percent, percentToLevel } from "./units.js";

export type DomainPack = Domain;

export interface DomainQuestion {
  id: string;
  dimension: string;
  text: string;
  regulatoryRef: string;
  evidenceRequired: string;
  l1: string;
  l3: string;
  l5: string;
  weight: number;
}

export interface DomainPackResult {
  pack: DomainPack;
  /** Every rubric answer is self-reported, so the result is too (truth rule 3). */
  claimKind: "self_reported";
  /** Self-reported score from Likert 1-5 answers. */
  score: number;
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  complianceGaps: string[];
  regulatoryWarnings: string[];
}

const RUBRIC_QUESTIONNAIRE = "domain-rubrics";
let rubricCache: ReadonlyMap<DomainPack, readonly DomainQuestion[]> | null = null;

function toDomainQuestion(item: QuestionnaireItem): DomainQuestion {
  return {
    id: item.id, dimension: item.dimension, text: item.text, regulatoryRef: item.legacyRef.text, evidenceRequired: item.evidenceRequired,
    l1: item.levelDescriptors.l1, l3: item.levelDescriptors.l3, l5: item.levelDescriptors.l5, weight: item.weight
  };
}

/** The rubric questionnaire by station, read from the shipped catalog once per process; a missing or invalid file throws. */
function rubricQuestions(): ReadonlyMap<DomainPack, readonly DomainQuestion[]> {
  if (rubricCache) return rubricCache;
  const cat = loadCatalog();
  const file = `questionnaires/${RUBRIC_QUESTIONNAIRE}.yaml`;
  const problem = cat.issues.find((i) => i.file === file);
  const questionnaire = cat.questionnaires?.get(RUBRIC_QUESTIONNAIRE);
  if (problem || !questionnaire) throw new Error(`catalog ${file} did not load: ${problem?.message ?? "file is missing"}`);
  const byStation = new Map<DomainPack, DomainQuestion[]>();
  for (const item of questionnaire.items) byStation.set(item.station, [...(byStation.get(item.station) ?? []), toDomainQuestion(item)]);
  rubricCache = byStation;
  return byStation;
}

export interface DomainPackAssessment {
  [questionId: string]: number;
}

/**
 * @deprecated Self-reported rubric score; it sets no regulated status. Regulated status comes only from catalog controls
 * evaluated by the catalog evaluator (src/catalog/evidence, run by `amc compliance report`). Removal is P2-29's.
 */
export function scoreDomainPack(pack: DomainPack, assessment: DomainPackAssessment): DomainPackResult {
  const questions = getDomainPackQuestions(pack);
  const complianceGaps: string[] = [];
  const regulatoryWarnings: string[] = [];
  let totalScore = 0;
  let totalWeight = 0;

  for (const q of questions) {
    const level = likert(assessment[q.id] ?? 1);
    const qScore = likertToPercent(level);
    totalScore += (qScore / 100) * q.weight;
    totalWeight += q.weight;

    if (level < 3) {
      complianceGaps.push(`${q.id} (${q.dimension}): at L${level}, needs L3 minimum`);
      regulatoryWarnings.push(`Regulatory risk: ${q.regulatoryRef} — current state: ${q.l1}`);
    }
  }

  const score = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 0;
  const level = `L${percentToLevel(percent(score))}` as DomainPackResult["level"];

  return { pack, claimKind: "self_reported", score, level, complianceGaps, regulatoryWarnings };
}

/** The station's rubric questions from catalog/questionnaires/domain-rubrics.yaml, in file order. */
export function getDomainPackQuestions(pack: DomainPack): DomainQuestion[] {
  return [...(rubricQuestions().get(pack) ?? [])];
}

export function listDomainPacks(): { pack: DomainPack; name: string; regulatoryBasis: string; questionCount: number }[] {
  return [
    { pack: "health", name: "Health Pack", regulatoryBasis: "FDA 510(k), HIPAA, FDA AI/ML Action Plan, EU MDR", questionCount: getDomainPackQuestions("health").length },
    { pack: "education", name: "Education Pack", regulatoryBasis: "FERPA, COPPA, EU AI Act, GDPR", questionCount: getDomainPackQuestions("education").length },
    { pack: "environment", name: "Environment & Critical Infrastructure Pack", regulatoryBasis: "EU AI Act, NERC CIP, EPA, ISO 14001, NIST CSF", questionCount: getDomainPackQuestions("environment").length },
    { pack: "mobility", name: "Mobility Pack", regulatoryBasis: "NHTSA, ISO 26262, UNECE WP.29, ISO 21448, IEC 61508, EU AI Act", questionCount: getDomainPackQuestions("mobility").length },
    { pack: "governance", name: "Governance & Public Sector Pack", regulatoryBasis: "NIST AI RMF, FedRAMP, FISMA, OMB M-25-21, EU AI Act, GDPR", questionCount: getDomainPackQuestions("governance").length },
    { pack: "technology", name: "Technology Pack", regulatoryBasis: "GDPR, CCPA, SOC 2 Type II, ISO 27001, OWASP AI Security", questionCount: getDomainPackQuestions("technology").length },
    { pack: "wealth", name: "Wealth Pack", regulatoryBasis: "SR 26-2, BSA/AML, MiFID II, FINRA, CFTC, Dodd-Frank, SEC Rule 17a-4, GDPR", questionCount: getDomainPackQuestions("wealth").length },
  ];
}
