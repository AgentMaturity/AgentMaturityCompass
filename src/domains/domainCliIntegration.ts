import type { AssurancePackDefinition, AssurancePromptContext, ValidationResult } from "../assurance/validators.js";
import { listAssurancePacks } from "../assurance/packs/index.js";
import { INDUSTRY_EVIDENCE_MISSING, INDUSTRY_EVIDENCE_SYNTHETIC } from "../assurance/packs/industryPackManifest.js";
import { envelopeFromDimensions } from "../claims/eligibility/adapters/results.js";
import { evaluateClaimEligibility } from "../claims/eligibility/evaluate.js";
import {
  buildExampleDomainInput,
  EXAMPLE_ASSURANCE_REPLY,
  EXAMPLE_BANNER,
  exampleEnvelope,
  withExampleBanner
} from "../claims/eligibility/exampleMode.js";
import type { ClaimEnvelope, ClaimKind, StatusDimensions } from "../claims/eligibility/types.js";
import { writeFileAtomic } from "../utils/fs.js";
import { assessDomain, type DomainAssessmentInput, type DomainAssessmentResult } from "./domainAssessmentEngine.js";
import { loadDomainEvidence } from "./domainEvidence.js";
import { getDomainModuleActivations } from "./domainModuleMap.js";
import { getDomainMetadata, listDomainMetadata, parseDomain, type Domain, type DomainMetadata } from "./domainRegistry.js";
import { buildDomainReport, renderNotEvaluatedDomainReport } from "./domainReportBuilder.js";

type PartStatus = "evaluated" | "not_evaluated";

/**
 * A domain assessment. Outside example mode it is always not evaluated: the base
 * part comes from the agent's latest sealed run (when there is one) and the
 * domain-rubric questions have no evidence source. `result` exists only in
 * example mode, stamped `synthetic_example`.
 */
export interface DomainAssessmentCliResult {
  status: "not_evaluated";
  agentId: string;
  domain: Domain;
  domainName: string;
  reasons: string[];
  claimKind: ClaimKind;
  statusDimensions: StatusDimensions;
  base: { status: PartStatus; runId: string | null; claimKind: ClaimKind | null; statusDimensions: StatusDimensions | null; reasons: string[] };
  domainRubric: { status: "not_evaluated"; reasons: string[] };
  banner?: string;
  input?: DomainAssessmentInput;
  result?: DomainAssessmentResult;
}

export interface DomainAssurancePackResult {
  packId: string;
  title: string;
  status: "graded" | "not_evaluated";
  reason: string | null;
  scenarioCount: number;
  passed: number;
  failed: number;
  notEvaluated: number; // scenarios not graded: no agent invoked, or the pack refused synthetic or missing evidence
  passRate: number | null;
}

export interface DomainAssuranceRunResult {
  status: "not_evaluated";
  reasons: string[];
  claimKind: ClaimKind;
  statusDimensions: StatusDimensions;
  agentId: string;
  domain: Domain;
  domainMetadata: DomainMetadata;
  packRuns: DomainAssurancePackResult[];
  totalScenarios: number;
  passed: number;
  failed: number;
  notEvaluated: number;
  agentInvoked: false;
  responseSource: "none" | "built-in-synthetic"; // the canned reply is graded only in example mode
  allPassed: false; // no agent is invoked, so nothing here is passing evidence
  banner?: string;
}

export interface DomainReportBuildResult {
  assessment: DomainAssessmentCliResult;
  reportMarkdown: string;
  reportObject?: ReturnType<typeof buildDomainReport>;
  outputPath?: string;
}

export interface DomainCommandOptions {
  workspace?: string;
  /** Labelled synthetic output: illustrative values, never evidence, never written to `.amc/`. */
  example?: boolean;
}

const NO_DOMAIN_EVIDENCE = "domain-rubric questions have no evidence source, so AMC cannot score them";
const NO_AGENT_INVOKED = "no agent was invoked; run `amc assurance run` against a real agent";
const EXAMPLE_REASON = "example mode: illustrative values derived from the agent id, not evidence";

function riskTierForDomain(domain: Domain): AssurancePromptContext["riskTier"] {
  return getDomainMetadata(domain).riskLevel === "critical" ? "critical" : "high";
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

function notEvaluatedEnvelope(producer: string, now: number): ClaimEnvelope {
  return evaluateClaimEligibility({
    producer, method: "runtime_observation", regulated: false, proposed: { result: "not_evaluated", level: null },
    evidence: { eventCount: 0, tiers: [], newestTs: null, boundToControl: true, sameScope: true, contradictory: false,
      signatureValid: null, issuerPinned: null },
    now
  });
}

export function listDomainMetadataCli(): DomainMetadata[] {
  return listDomainMetadata();
}

export function assessDomainForAgent(params: { agentId: string; domain: Domain } & DomainCommandOptions): DomainAssessmentCliResult {
  const { agentId, domain } = params;
  const now = Date.now();
  const producer = `domain:${domain}`;
  const common = { status: "not_evaluated" as const, agentId, domain, domainName: getDomainMetadata(domain).name };
  if (params.example) {
    const envelope = exampleEnvelope(producer, now);
    const input = buildExampleDomainInput(agentId, domain);
    return {
      ...common, reasons: [EXAMPLE_REASON], claimKind: envelope.claimKind, statusDimensions: envelope.statusDimensions,
      base: { status: "not_evaluated", runId: null, claimKind: null, statusDimensions: null, reasons: [EXAMPLE_REASON] },
      domainRubric: { status: "not_evaluated", reasons: [EXAMPLE_REASON] },
      banner: EXAMPLE_BANNER, input, result: assessDomain(input)
    };
  }
  const evidence = loadDomainEvidence(params.workspace ?? process.cwd(), agentId, now);
  const baseEnvelope = evidence.envelope;
  const overall = baseEnvelope ?? notEvaluatedEnvelope(producer, now);
  return {
    ...common,
    reasons: [...evidence.reasons, NO_DOMAIN_EVIDENCE],
    claimKind: overall.claimKind,
    statusDimensions: { ...overall.statusDimensions, result: "not_evaluated" },
    base: {
      status: baseEnvelope ? "evaluated" : "not_evaluated",
      runId: evidence.runId,
      claimKind: baseEnvelope?.claimKind ?? null,
      statusDimensions: baseEnvelope?.statusDimensions ?? null,
      reasons: evidence.reasons
    },
    domainRubric: { status: "not_evaluated", reasons: [NO_DOMAIN_EVIDENCE] }
  };
}

export function getDomainModules(domain: Domain) {
  return getDomainModuleActivations(domain);
}

/** Null when not evaluated, which is always the case outside example mode. */
export function getDomainGaps(agentId: string, domain: Domain, options: DomainCommandOptions = {}) {
  return assessDomainForAgent({ agentId, domain, ...options }).result?.complianceGaps ?? null;
}

/** Null when not evaluated, which is always the case outside example mode. */
export function getDomainRoadmap(agentId: string, domain: Domain, options: DomainCommandOptions = {}) {
  return assessDomainForAgent({ agentId, domain, ...options }).result?.roadmap ?? null;
}

export function buildDomainReportForAgent(params: {
  agentId: string;
  domain: Domain;
  outputPath?: string;
} & DomainCommandOptions): DomainReportBuildResult {
  const assessment = assessDomainForAgent(params);
  const claim = envelopeFromDimensions(`domain:${assessment.domain}`, assessment.claimKind, assessment.statusDimensions);
  const reportObject = assessment.result ? buildDomainReport(assessment.result, claim) : undefined;
  const reportMarkdown = reportObject
    ? withExampleBanner(reportObject.markdown)
    : renderNotEvaluatedDomainReport(assessment.domainName, assessment.reasons, claim);

  if (params.outputPath) {
    writeFileAtomic(params.outputPath, reportMarkdown);
  }

  return { assessment, reportMarkdown, reportObject, outputPath: params.outputPath };
}

function packRun(packId: string, example: boolean, context: AssurancePromptContext,
  availablePacks: ReadonlyMap<string, AssurancePackDefinition>): DomainAssurancePackResult {
  const pack = availablePacks.get(packId);
  if (!pack) {
    return { packId, title: packId, status: "not_evaluated", reason: `assurance pack "${packId}" is not registered`,
      scenarioCount: 0, passed: 0, failed: 0, notEvaluated: 0, passRate: null };
  }
  const total = pack.scenarios.length;
  if (!example) {
    return { packId, title: pack.title, status: "not_evaluated", reason: NO_AGENT_INVOKED,
      scenarioCount: total, passed: 0, failed: 0, notEvaluated: total, passRate: null };
  }
  // Example mode grades the canned reply. A pack that fails closed refuses it as synthetic
  // evidence: that outcome is "not evaluated", never a pass and not a graded failure.
  let passed = 0, failed = 0, notEvaluated = 0;
  for (const scenario of pack.scenarios) {
    const validation = scenario.validate(EXAMPLE_ASSURANCE_REPLY, scenario.buildPrompt(context), context);
    if (isUngradableEvidence(validation)) notEvaluated += 1;
    else if (validation.pass) passed += 1;
    else failed += 1;
  }
  const graded = passed + failed;
  return { packId, title: pack.title, status: graded > 0 ? "graded" : "not_evaluated", reason: graded > 0 ? null : EXAMPLE_REASON,
    scenarioCount: total, passed, failed, notEvaluated, passRate: graded > 0 ? Math.round((passed / total) * 100) : null };
}

export function runDomainAssurance(agentId: string, domain: Domain, options: Pick<DomainCommandOptions, "example"> = {}): DomainAssuranceRunResult {
  const example = options.example === true;
  const metadata = getDomainMetadata(domain);
  const availablePacks = new Map(listAssurancePacks().map((pack) => [pack.id, pack] as const));
  const context = defaultAssuranceContext(agentId, domain);
  const packRuns = metadata.assurancePacks.map((packId) => packRun(packId, example, context, availablePacks));
  const sum = (key: "scenarioCount" | "passed" | "failed" | "notEvaluated") => packRuns.reduce((n, pack) => n + pack[key], 0);
  const envelope = example ? exampleEnvelope(`domain-assurance:${domain}`) : notEvaluatedEnvelope(`domain-assurance:${domain}`, Date.now());
  const missing = packRuns.filter((pack) => pack.scenarioCount === 0).map((pack) => pack.reason ?? pack.packId);

  return {
    status: "not_evaluated",
    reasons: [example ? EXAMPLE_REASON : NO_AGENT_INVOKED, ...missing],
    claimKind: envelope.claimKind,
    statusDimensions: envelope.statusDimensions,
    agentId,
    domain,
    domainMetadata: metadata,
    packRuns,
    totalScenarios: sum("scenarioCount"),
    passed: sum("passed"),
    failed: sum("failed"),
    notEvaluated: sum("notEvaluated"),
    agentInvoked: false,
    responseSource: example ? "built-in-synthetic" : "none",
    allPassed: false,
    ...(example ? { banner: EXAMPLE_BANNER } : {})
  };
}

/**
 * True when a validator refused to grade the response (fail-closed industry
 * packs: synthetic or missing evidence). A graded failure stays a failure.
 */
export function isUngradableEvidence(validation: Pick<ValidationResult, "auditTypes">): boolean {
  return validation.auditTypes.some(
    (type) => type === INDUSTRY_EVIDENCE_SYNTHETIC || type === INDUSTRY_EVIDENCE_MISSING
  );
}

export function parseDomainOrThrow(input: string): Domain {
  return parseDomain(input);
}
