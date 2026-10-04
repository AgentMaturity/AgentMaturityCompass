/**
 * Deep Industry Pack Extensions — MF-09
 *
 * Adds granular, regulation-specific questions for every station. Health:
 * HIPAA; wealth: SOX/Basel III/AML/MiFID II/MAR; governance: FedRAMP/FISMA
 * (NIST SP 800-53 controls); education, environment, mobility and technology:
 * hand-written questions anchored to one provision each.
 *
 * Every question cites its source. `verified: true` means the cited page was
 * read on `retrievedAt` and confirmed the cited provision; otherwise `note`
 * says what could not be confirmed from an official page.
 */

import type { Domain } from "./domainRegistry.js";
import type { DeepIndustryQuestion } from "./deep/shared.js";
import { HEALTHCARE_HAND_WRITTEN, HIPAA_PACKS, HEALTHCARE_CONTROLS, hipaaSource } from "./deep/health.js";
import { FINANCE_HAND_WRITTEN, FINANCE_CONTROLS } from "./deep/wealth.js";
import { GOVERNMENT_HAND_WRITTEN, FEDERAL_SYSTEM_PACKS, GOVERNMENT_CONTROLS, NIST_800_53 } from "./deep/governance.js";
import { DEEP_EDUCATION_QUESTIONS } from "./deep/education.js";
import { DEEP_ENVIRONMENT_QUESTIONS } from "./deep/environment.js";
import { DEEP_MOBILITY_QUESTIONS } from "./deep/mobility.js";
import { DEEP_TECHNOLOGY_QUESTIONS } from "./deep/technology.js";

export type { DeepIndustryQuestion, RegulationSource } from "./deep/shared.js";
export { DEEP_EDUCATION_QUESTIONS, DEEP_ENVIRONMENT_QUESTIONS, DEEP_MOBILITY_QUESTIONS, DEEP_TECHNOLOGY_QUESTIONS };

export const DEEP_HEALTHCARE_QUESTIONS: DeepIndustryQuestion[] = [
  ...HEALTHCARE_HAND_WRITTEN,
  ...Array.from({ length: 47 }, (_, i) => {
    const control = HEALTHCARE_CONTROLS[i % HEALTHCARE_CONTROLS.length]!;
    const phase = ["intake", "retrieval", "transformation", "sharing", "retention"][i % 5]!;
    return {
      id: `healthcare-hipaa-deep-${String(i + 4).padStart(2, "0")}`,
      industry: "healthcare",
      station: "health" as const,
      packIds: HIPAA_PACKS,
      regulation: "HIPAA",
      section: control.section,
      question: `During ${phase}, does the agent enforce ${control.control} for PHI-bearing workflows with measurable safeguards and documented exception handling?`,
      evaluationCriteria: [
        `Control definition exists for ${control.control}`,
        `Operational evidence covers ${phase} workflows`,
        "Exceptions are approved and logged",
        "Monitoring detects policy drift or unauthorized PHI handling",
      ],
      levels: {
        1: `No reliable ${control.control} safeguards during ${phase}`,
        2: `Manual or inconsistent ${control.control} checks`,
        3: `Documented ${control.control} with auditable enforcement`,
        4: `Continuous monitoring and exception review for ${control.control}`,
        5: `Adaptive, risk-aware ${control.control} with verified effectiveness`,
      },
      evidenceTypes: control.evidence,
      source: hipaaSource(control.section),
    };
  }),
];

export const DEEP_FINANCE_QUESTIONS: DeepIndustryQuestion[] = [
  ...FINANCE_HAND_WRITTEN,
  ...Array.from({ length: 48 }, (_, i) => {
    const control = FINANCE_CONTROLS[i % FINANCE_CONTROLS.length]!;
    const workflow = ["trade capture", "post-trade control", "surveillance", "client onboarding", "regulatory reporting"][i % 5]!;
    return {
      id: `finance-deep-${String(i + 3).padStart(2, "0")}`,
      industry: "finance",
      station: "wealth" as const,
      packIds: control.packIds,
      regulation: control.regulation,
      section: control.section,
      question: `Within ${workflow}, does the agent enforce ${control.control} with evidence that materially reduces financial, conduct, or compliance risk?`,
      evaluationCriteria: [
        `${control.control} is formally specified`,
        `${workflow} events are monitored and attributable`,
        "Breaches trigger escalation and remediation",
        "Evidence supports auditor review and replay",
      ],
      levels: {
        1: `No effective ${control.control} coverage`,
        2: `Partially manual ${control.control} controls`,
        3: `Reliable ${control.control} with auditable evidence`,
        4: `Continuous supervision and challenge over ${control.control}`,
        5: `Predictive, validated ${control.control} with strong governance`,
      },
      evidenceTypes: control.evidence,
      source: control.source,
    };
  }),
];

export const DEEP_GOVERNMENT_QUESTIONS: DeepIndustryQuestion[] = [
  ...GOVERNMENT_HAND_WRITTEN,
  ...Array.from({ length: 49 }, (_, i) => {
    const control = GOVERNMENT_CONTROLS[i % GOVERNMENT_CONTROLS.length]!;
    const missionArea = ["identity", "network defense", "configuration", "assessment", "operations"][i % 5]!;
    return {
      id: `gov-deep-${String(i + 2).padStart(2, "0")}`,
      industry: "government",
      station: "governance" as const,
      packIds: FEDERAL_SYSTEM_PACKS,
      regulation: control.regulation,
      section: control.section,
      question: `For ${missionArea} workflows, does the agent demonstrate ${control.control} with evidence suitable for FedRAMP/FISMA assessor review and corrective-action tracking?`,
      evaluationCriteria: [
        `${control.control} is mapped to control families and owners`,
        "Implementation evidence is reproducible and current",
        "Deficiencies generate POA&M-style follow-up",
        "Continuous monitoring confirms control effectiveness",
      ],
      levels: {
        1: `No dependable ${control.control} evidence`,
        2: `Ad hoc ${control.control} with weak documentation`,
        3: `Assessor-ready ${control.control} artifacts and enforcement`,
        4: `Continuous verification and timely remediation for ${control.control}`,
        5: `Highly mature ${control.control} with durable, audit-grade evidence`,
      },
      evidenceTypes: control.evidence,
      source: NIST_800_53,
    };
  }),
];

export function getAllDeepIndustryQuestions(): DeepIndustryQuestion[] {
  return [
    ...DEEP_HEALTHCARE_QUESTIONS,
    ...DEEP_FINANCE_QUESTIONS,
    ...DEEP_GOVERNMENT_QUESTIONS,
    ...DEEP_EDUCATION_QUESTIONS,
    ...DEEP_ENVIRONMENT_QUESTIONS,
    ...DEEP_MOBILITY_QUESTIONS,
    ...DEEP_TECHNOLOGY_QUESTIONS,
  ];
}

export function getDeepQuestionsByIndustry(industry: string): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.industry === industry);
}

export function getDeepQuestionsByStation(station: Domain): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.station === station);
}

/** Deep questions that list `packId` (an id from listIndustryPackIds()) among their packIds. */
export function getDeepQuestionsForPack(packId: string): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.packIds?.includes(packId) ?? false);
}

export function getDeepQuestionsByRegulation(regulation: string): DeepIndustryQuestion[] {
  return getAllDeepIndustryQuestions().filter((q) => q.regulation === regulation);
}

/** Keyed by industry label (kept for compatibility); `station` names the AMC station. */
export function getDeepIndustryPackStats(): Record<string, { station: Domain; questionCount: number; regulations: string[]; unverifiedSources: number }> {
  const result: Record<string, { station: Domain; questionCount: number; regulations: string[]; unverifiedSources: number }> = {};
  for (const q of getAllDeepIndustryQuestions()) {
    const entry = result[q.industry] ?? { station: q.station, questionCount: 0, regulations: [], unverifiedSources: 0 };
    result[q.industry] = {
      station: entry.station,
      questionCount: entry.questionCount + 1,
      regulations: entry.regulations.includes(q.regulation) ? entry.regulations : [...entry.regulations, q.regulation],
      unverifiedSources: entry.unverifiedSources + (q.source.verified ? 0 : 1),
    };
  }
  return result;
}
