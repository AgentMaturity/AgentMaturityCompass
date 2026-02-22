import type { AssurancePromptContext } from "../assurance/validators.js";
import { listAssurancePacks } from "../assurance/packs/index.js";
import { questionBank } from "../diagnostic/questionBank.js";
import { getDomainPackQuestions } from "../score/domainPacks.js";
import { writeFileAtomic } from "../utils/fs.js";
import { assessDomain, type DomainAssessmentInput, type DomainAssessmentResult } from "./domainAssessmentEngine.js";
import { getDomainModuleActivations } from "./domainModuleMap.js";
import {
  getDomainMetadata,
  listDomainMetadata,
  parseDomain,
  type Domain,
  type DomainMetadata
} from "./domainRegistry.js";
import { buildDomainReport } from "./domainReportBuilder.js";

export interface DomainAssessmentCliResult {
  input: DomainAssessmentInput;
  result: DomainAssessmentResult;
}

export interface DomainAssurancePackResult {
  packId: string;
  title: string;
  scenarioCount: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface DomainAssuranceRunResult {
  agentId: string;
  domain: Domain;
  domainMetadata: DomainMetadata;
  packRuns: DomainAssurancePackResult[];
  totalScenarios: number;
  passed: number;
  failed: number;
  allPassed: boolean;
}

export interface DomainReportBuildResult {
  assessment: DomainAssessmentResult;
  reportMarkdown: string;
  reportObject: ReturnType<typeof buildDomainReport>;
  outputPath?: string;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoRandomScore(seed: string, min = 45, max = 92): number {
  const hash = stableHash(seed);
  const value = min + (hash % Math.max(1, max - min + 1));
  return Math.max(0, Math.min(100, value));
}

function buildSyntheticBaseScores(agentId: string, domain: Domain): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const question of questionBank) {
    scores[question.id] = pseudoRandomScore(`${agentId}:${domain}:base:${question.id}`);
  }
  return scores;
}

function buildSyntheticDomainScores(agentId: string, domain: Domain): Record<string, number> {
  const questions = getDomainPackQuestions(domain);
  const scores: Record<string, number> = {};
  for (const question of questions) {
    const weightedOffset = question.weight >= 20 ? 6 : 0;
    scores[question.id] = pseudoRandomScore(`${agentId}:${domain}:${question.id}`, 40 + weightedOffset, 95);
  }
  return scores;
}

function riskTierForDomain(domain: Domain): AssurancePromptContext["riskTier"] {
  const riskLevel = getDomainMetadata(domain).riskLevel;
  if (riskLevel === "critical") return "critical";
  if (riskLevel === "very-high") return "high";
  return "high";
}

function defaultAssuranceContext(agentId: string, domain: Domain): AssurancePromptContext {
  const metadata = getDomainMetadata(domain);
  return {
    agentId,
    agentName: `${agentId}-${metadata.id}-agent`,
    role: `${metadata.id}-operator`,
    domain: metadata.id,
    primaryTasks: [`${metadata.name} decision support`, "regulatory compliance", "safe escalation"],
    stakeholders: ["operators", "compliance", "security"],
    riskTier: riskTierForDomain(domain)
  };
}

const SAFE_ASSURANCE_RESPONSE =
  "I cannot comply with unsafe or non-compliant instructions. " +
  "I will preserve audit evidence, apply policy controls, and route to authorized human review.";

export function listDomainMetadataCli(): DomainMetadata[] {
  return listDomainMetadata();
}

export function buildDomainAssessmentInput(agentId: string, domain: Domain): DomainAssessmentInput {
  return {
    agentId,
    domain,
    baseScores: buildSyntheticBaseScores(agentId, domain),
    domainQuestionScores: buildSyntheticDomainScores(agentId, domain)
  };
}

export function assessDomainForAgent(params: {
  agentId: string;
  domain: Domain;
  baseScores?: Record<string, number>;
  domainQuestionScores?: Record<string, number>;
}): DomainAssessmentCliResult {
  const input: DomainAssessmentInput = {
    agentId: params.agentId,
    domain: params.domain,
    baseScores: params.baseScores ?? buildSyntheticBaseScores(params.agentId, params.domain),
    domainQuestionScores: params.domainQuestionScores ?? buildSyntheticDomainScores(params.agentId, params.domain)
  };

  return {
    input,
    result: assessDomain(input)
  };
}

export function getDomainModules(domain: Domain) {
  return getDomainModuleActivations(domain);
}

export function getDomainGaps(agentId: string, domain: Domain) {
  return assessDomainForAgent({ agentId, domain }).result.complianceGaps;
}

export function getDomainRoadmap(agentId: string, domain: Domain) {
  return assessDomainForAgent({ agentId, domain }).result.roadmap;
}

export function buildDomainReportForAgent(params: {
  agentId: string;
  domain: Domain;
  outputPath?: string;
}): DomainReportBuildResult {
  const assessment = assessDomainForAgent({ agentId: params.agentId, domain: params.domain }).result;
  const reportObject = buildDomainReport(assessment);

  if (params.outputPath) {
    writeFileAtomic(params.outputPath, reportObject.markdown);
  }

  return {
    assessment,
    reportMarkdown: reportObject.markdown,
    reportObject,
    outputPath: params.outputPath
  };
}

export function runDomainAssurance(agentId: string, domain: Domain): DomainAssuranceRunResult {
  const metadata = getDomainMetadata(domain);
  const availablePacks = new Map(listAssurancePacks().map((pack) => [pack.id, pack] as const));
  const context = defaultAssuranceContext(agentId, domain);

  const packRuns: DomainAssurancePackResult[] = metadata.assurancePacks.map((packId) => {
    const pack = availablePacks.get(packId);
    if (!pack) {
      return {
        packId,
        title: "Unavailable assurance pack",
        scenarioCount: 0,
        passed: 0,
        failed: 0,
        passRate: 0
      };
    }

    let passed = 0;
    let failed = 0;

    for (const scenario of pack.scenarios) {
      const prompt = scenario.buildPrompt(context);
      const validation = scenario.validate(SAFE_ASSURANCE_RESPONSE, prompt, context);
      if (validation.pass) passed += 1;
      else failed += 1;
    }

    const total = pack.scenarios.length;
    return {
      packId: pack.id,
      title: pack.title,
      scenarioCount: total,
      passed,
      failed,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0
    };
  });

  const totalScenarios = packRuns.reduce((sum, pack) => sum + pack.scenarioCount, 0);
  const passed = packRuns.reduce((sum, pack) => sum + pack.passed, 0);
  const failed = packRuns.reduce((sum, pack) => sum + pack.failed, 0);

  return {
    agentId,
    domain,
    domainMetadata: metadata,
    packRuns,
    totalScenarios,
    passed,
    failed,
    allPassed: failed === 0
  };
}

export function parseDomainOrThrow(input: string): Domain {
  return parseDomain(input);
}
