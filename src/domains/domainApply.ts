import { isAbsolute, join, resolve } from "node:path";
import YAML from "yaml";
import { getAgentPaths } from "../fleet/paths.js";
import { KNOWN_AGENT_CONFIGS, applyGuardrails } from "../guide/guideGenerator.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { assertIndustryPackAccess } from "./industryPackEntitlement.js";
import { assessDomainForAgent } from "./domainCliIntegration.js";
import { parseDomain, type Domain } from "./domainRegistry.js";
import {
  getPackById,
  getPacksForDomain,
  type IndustryPack,
  type IndustryPackQuestion,
  INDUSTRY_PACKS
} from "./industryPacks.js";

export interface DomainApplyOptions {
  agentId: string;
  domain?: string;
  packId?: string;
  dryRun?: boolean;
  compliance?: string[];
  targetFile?: string;
  workspacePath?: string;
}

export interface DomainApplyResult {
  agentId: string;
  domain: string;
  packsApplied: string[];
  guardrailsGenerated: number;
  configFileUpdated: string | null;
  guardrailsEnabled: string[];
  complianceFrameworks: string[];
  assessmentScore: { composite: number; level: string; gaps: number };
  dryRun: boolean;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((part) => part.trim())
      .filter((part) => part.length >= 4)
  );
}

function questionMatchesGapDimension(questionDimension: string, gapDimensions: string[]): boolean {
  if (gapDimensions.length === 0) return false;
  const normalizedQuestion = normalizeText(questionDimension);
  const questionTokens = tokens(questionDimension);

  for (const gapDimension of gapDimensions) {
    const normalizedGap = normalizeText(gapDimension);
    if (normalizedGap === normalizedQuestion) return true;
    if (normalizedGap.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedGap)) return true;

    const gapTokens = tokens(gapDimension);
    for (const token of questionTokens) {
      if (gapTokens.has(token)) return true;
    }
  }
  return false;
}

function selectPackQuestions(pack: IndustryPack, gapDimensions: string[]): IndustryPackQuestion[] {
  const matched = pack.questions.filter((question) => questionMatchesGapDimension(question.dimension, gapDimensions));
  if (matched.length > 0) return matched;
  return pack.questions.slice(0, Math.min(3, pack.questions.length));
}

function toDomainLabel(domain: Domain): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function toRuleText(question: IndustryPackQuestion): string {
  return `Enforce ${question.dimension} at least at L3: ${question.l3}. Escalate or block when unmet; target L5 path: ${question.l5}.`;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function buildGuardrailsContent(params: {
  domain: Domain;
  agentId: string;
  packs: IndustryPack[];
  gapDimensions: string[];
  complianceFrameworks: string[];
}): { content: string; enabledRules: string[] } {
  const lines: string[] = [];
  const enabledRules: string[] = [];
  const domainLabel = toDomainLabel(params.domain);

  lines.push(`# AMC Domain Guardrails — ${domainLabel}`);
  lines.push("");
  lines.push(`Agent: ${params.agentId}`);
  lines.push(`Domain: ${params.domain}`);
  lines.push(`Packs: ${params.packs.map((pack) => pack.id).join(", ")}`);
  if (params.complianceFrameworks.length > 0) {
    lines.push(`Compliance Focus: ${params.complianceFrameworks.join(", ")}`);
  }
  lines.push("");

  for (const pack of params.packs) {
    const selectedQuestions = selectPackQuestions(pack, params.gapDimensions);
    lines.push(`## Pack: ${pack.id} (${pack.name})`);
    lines.push("");
    lines.push(`Regulatory Basis: ${pack.regulatoryBasis.join("; ")}`);
    lines.push("");

    for (const question of selectedQuestions) {
      const regRef = question.regulatoryRef || pack.regulatoryBasis[0] || "Regulatory baseline";
      lines.push(`# [DOMAIN: ${domainLabel}] [PACK: ${pack.id}] [REG: ${regRef}]`);
      lines.push(`# Question: ${question.text}`);
      lines.push(`# Required at L3: ${question.l3}`);
      lines.push(`# Required at L5: ${question.l5}`);
      lines.push(`RULE: ${toRuleText(question)}`);
      lines.push("");
      enabledRules.push(`${pack.id}:${question.id}`);
    }
  }

  return { content: lines.join("\n").trimEnd(), enabledRules: dedupe(enabledRules) };
}

function parseYamlObject(raw: string): Record<string, unknown> {
  const parsed = YAML.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function resolveTargetFile(workspacePath: string, requestedFile?: string): string {
  if (requestedFile && requestedFile.trim().length > 0) {
    return isAbsolute(requestedFile) ? requestedFile : resolve(workspacePath, requestedFile);
  }

  for (const candidate of KNOWN_AGENT_CONFIGS) {
    const full = join(workspacePath, candidate.path);
    if (pathExists(full)) return full;
  }

  return join(workspacePath, "AGENTS.md");
}

function resolveDomainAndPacks(opts: DomainApplyOptions): { domain: Domain; packs: IndustryPack[] } {
  if (!opts.domain && !opts.packId) {
    throw new Error("Provide either --domain <domain> or --pack <packId>.");
  }

  const selectedPack = opts.packId ? getPackById(opts.packId) : undefined;
  if (opts.packId && !selectedPack) {
    const available = Object.keys(INDUSTRY_PACKS).sort().join(", ");
    throw new Error(`Unknown pack: ${opts.packId}. Expected one of: ${available}`);
  }

  const domain = opts.domain ? parseDomain(opts.domain) : selectedPack!.stationId;
  if (selectedPack && selectedPack.stationId !== domain) {
    throw new Error(`Pack "${selectedPack.id}" belongs to domain "${selectedPack.stationId}", not "${domain}".`);
  }

  const packs = selectedPack ? [selectedPack] : getPacksForDomain(domain);
  if (packs.length === 0) {
    throw new Error(`No industry packs found for domain "${domain}".`);
  }

  return { domain, packs };
}

export async function applyDomainToAgent(opts: DomainApplyOptions): Promise<DomainApplyResult> {
  const agentId = opts.agentId?.trim();
  if (!agentId) {
    throw new Error("agentId is required.");
  }

  const workspacePath = resolve(opts.workspacePath ?? process.cwd());
  assertIndustryPackAccess(workspacePath);
  const { domain, packs } = resolveDomainAndPacks(opts);
  const dryRun = opts.dryRun === true;

  const assessment = assessDomainForAgent({ agentId, domain }).result;
  const gapDimensions = assessment.complianceGaps.map((gap) => gap.dimension);
  const complianceFrameworks = dedupe([
    ...packs.flatMap((pack) => pack.complianceFrameworks),
    ...(opts.compliance ?? [])
  ]);

  const rendered = buildGuardrailsContent({
    domain,
    agentId,
    packs,
    gapDimensions,
    complianceFrameworks
  });

  const targetFile = resolveTargetFile(workspacePath, opts.targetFile);
  const readFn = (filePath: string): string | null => (pathExists(filePath) ? readUtf8(filePath) : null);
  const writeFn = dryRun
    ? (_filePath: string, _content: string): void => {}
    : (filePath: string, content: string): void => {
      writeFileAtomic(filePath, content, 0o644);
    };
  const applyResult = applyGuardrails(targetFile, rendered.content, readFn, writeFn);

  const agentPaths = getAgentPaths(workspacePath, agentId);
  const existingGuardrails = pathExists(agentPaths.guardrails) ? parseYamlObject(readUtf8(agentPaths.guardrails)) : {};
  const existingDomainRules = toRecord(existingGuardrails.domainRules);
  const nextDomainRules: Record<string, boolean> = {};

  for (const [ruleId, enabled] of Object.entries(existingDomainRules)) {
    if (typeof enabled === "boolean") {
      nextDomainRules[ruleId] = enabled;
    }
  }
  for (const ruleId of rendered.enabledRules) {
    nextDomainRules[ruleId] = true;
  }

  const nextGuardrails: Record<string, unknown> = {
    ...existingGuardrails,
    domainRules: nextDomainRules,
    domainApply: {
      domain,
      packsApplied: packs.map((pack) => pack.id),
      complianceFrameworks,
      enabledRules: rendered.enabledRules,
      assessmentScore: {
        composite: assessment.compositeScore,
        level: assessment.level,
        gaps: assessment.complianceGaps.length
      }
    }
  };

  if (!dryRun) {
    writeFileAtomic(agentPaths.guardrails, YAML.stringify(nextGuardrails), 0o644);
  }

  return {
    agentId,
    domain,
    packsApplied: packs.map((pack) => pack.id),
    guardrailsGenerated: rendered.enabledRules.length,
    configFileUpdated: applyResult.path,
    guardrailsEnabled: rendered.enabledRules,
    complianceFrameworks,
    assessmentScore: {
      composite: assessment.compositeScore,
      level: assessment.level,
      gaps: assessment.complianceGaps.length
    },
    dryRun
  };
}
