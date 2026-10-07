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
import { emitOperatingProfile, resolveOperatingProfilePath } from "./operatingProfiles/operatingProfileEmit.js";
import type { OperatingProfileConsistency, ProfileRiskTier } from "./operatingProfiles/operatingProfileTypes.js";

export interface DomainApplyOptions {
  agentId: string;
  domain?: string;
  packId?: string;
  dryRun?: boolean;
  compliance?: string[];
  targetFile?: string;
  workspacePath?: string;
  /** Where to write the station operating profile; defaults to amc-operating-profiles/<agent>/<station>.operating-profile.json. Never under .amc/. */
  profileOut?: string;
}

export interface DomainApplyOperatingProfileSummary {
  station: Domain;
  riskTier: ProfileRiskTier;
  path: string;
  written: boolean;
  consistency: OperatingProfileConsistency;
}

export interface DomainApplyResult {
  agentId: string;
  domain: string;
  packsApplied: string[];
  guardrailsGenerated: number;
  configFileUpdated: string | null;
  /** Proposed controls (`<pack>:<question>`). AMC does not enforce them; only a compiled, activated plan is enforced (P1-12). */
  guardrailsProposed: string[];
  /** @deprecated Always empty since P1-12: domain apply enables nothing. Kept for one minor release. */
  guardrailsEnabled: string[];
  complianceFrameworks: string[];
  /** Domain assessments are not evaluated without evidence (P0-15), so no gap steers rule selection. */
  assessment: { status: "not_evaluated"; reasons: string[] };
  dryRun: boolean;
  operatingProfile: DomainApplyOperatingProfileSummary;
}

/** No assessed gap can steer rule selection (P0-15), so each pack contributes its first three questions. */
function selectPackQuestions(pack: IndustryPack): IndustryPackQuestion[] {
  return pack.questions.slice(0, 3);
}

function toDomainLabel(domain: Domain): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function toRuleText(question: IndustryPackQuestion): string {
  return `Proposed control (not enforced by AMC until compiled): ${question.dimension} at least at L3: ${question.l3}; target L5 path: ${question.l5}.`;
}

/** The guardrails.yaml row for one proposed rule. Proposals claim nothing: AMC enforces only compiled plans. */
interface DomainRuleProposal { id: string; packId: string; questionId: string; status: "proposed"; enforcement: "none" }
function proposal(id: string): DomainRuleProposal {
  const at = id.indexOf(":");
  return { id, packId: id.slice(0, Math.max(at, 0)), questionId: id.slice(at + 1), status: "proposed", enforcement: "none" };
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
  complianceFrameworks: string[];
}): { content: string; proposedRules: string[] } {
  const lines: string[] = [];
  const proposedRules: string[] = [];
  const domainLabel = toDomainLabel(params.domain);

  lines.push(`# AMC Domain Guardrails — ${domainLabel}`);
  lines.push("");
  lines.push("These are proposed controls for review. AMC does not enforce them; it enforces only a compiled, activated control plan (amc catalog compile).");
  lines.push("");
  lines.push(`Agent: ${params.agentId}`);
  lines.push(`Domain: ${params.domain}`);
  lines.push(`Packs: ${params.packs.map((pack) => pack.id).join(", ")}`);
  if (params.complianceFrameworks.length > 0) {
    lines.push(`Compliance Focus: ${params.complianceFrameworks.join(", ")}`);
  }
  lines.push("");

  for (const pack of params.packs) {
    const selectedQuestions = selectPackQuestions(pack);
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
      lines.push(toRuleText(question));
      lines.push("");
      proposedRules.push(`${pack.id}:${question.id}`);
    }
  }

  return { content: lines.join("\n").trimEnd(), proposedRules: dedupe(proposedRules) };
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
  // Refuse a profile target under .amc/ before anything else is written.
  const profilePath = resolveOperatingProfilePath({ workspacePath, agentId, station: domain, outputPath: opts.profileOut });

  const { status, reasons } = assessDomainForAgent({ agentId, domain, workspace: workspacePath });
  const complianceFrameworks = dedupe([
    ...packs.flatMap((pack) => pack.complianceFrameworks),
    ...(opts.compliance ?? [])
  ]);

  const rendered = buildGuardrailsContent({
    domain,
    agentId,
    packs,
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
  const { domainRules: legacyRules, ...existingGuardrails } = pathExists(agentPaths.guardrails) ? parseYamlObject(readUtf8(agentPaths.guardrails)) : {};
  // Legacy `domainRules: { "<pack>:<question>": true }` claimed rules nothing read; they become proposals.
  const legacyIds = Object.entries(toRecord(legacyRules)).filter(([, on]) => on === true).map(([id]) => id);
  const existingIds = (Array.isArray(existingGuardrails.domainRuleProposals) ? existingGuardrails.domainRuleProposals : [])
    .flatMap((row) => (typeof toRecord(row).id === "string" ? [toRecord(row).id as string] : []));

  const nextGuardrails: Record<string, unknown> = {
    ...existingGuardrails,
    domainRuleProposals: dedupe([...existingIds, ...legacyIds, ...rendered.proposedRules]).map(proposal),
    domainApply: {
      domain,
      packsApplied: packs.map((pack) => pack.id),
      complianceFrameworks,
      proposedRules: rendered.proposedRules,
      assessment: { status, reasons }
    }
  };

  if (!dryRun) {
    writeFileAtomic(agentPaths.guardrails, YAML.stringify(nextGuardrails), 0o644);
  }

  // The operating profile is a proposal outside .amc/; the operator signs it
  // with the existing commands listed in the profile's operatorFlow.
  const emitted = emitOperatingProfile({
    workspacePath,
    station: domain,
    agentId,
    dryRun,
    outputPath: profilePath
  });
  if (!emitted.consistency.ok) {
    throw new Error(`Operating profile for ${domain} is inconsistent with its risk tier: ${emitted.consistency.violations.join("; ")}`);
  }

  return {
    agentId,
    domain,
    packsApplied: packs.map((pack) => pack.id),
    guardrailsGenerated: rendered.proposedRules.length,
    configFileUpdated: applyResult.path,
    guardrailsProposed: rendered.proposedRules,
    guardrailsEnabled: [],
    complianceFrameworks,
    assessment: { status, reasons },
    dryRun,
    operatingProfile: {
      station: emitted.station,
      riskTier: emitted.riskTier,
      path: emitted.path,
      written: emitted.written,
      consistency: emitted.consistency
    }
  };
}
