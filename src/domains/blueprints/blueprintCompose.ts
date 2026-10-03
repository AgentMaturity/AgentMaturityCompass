import type { ActionClass } from "../../types.js";
import type { ReceiptKind } from "../../receipts/receipt.js";
import { ACTION_CLASSES, isActionClass } from "../../governor/actionCatalog.js";
import { defaultActionPolicy } from "../../governor/actionPolicyEngine.js";
import { defaultApprovalPolicy } from "../../approvals/approvalPolicyEngine.js";
import { defaultBudgets } from "../../budgets/budgets.js";
import { getDomainMetadata, parseDomain, type Domain } from "../domainRegistry.js";
import { INDUSTRY_PACKS, getPackById, getPacksForDomain, type IndustryPack, type IndustryPackQuestion } from "../industryPacks.js";
import { evaluateBlueprint, resolveStationProfile, zeroQuotaClasses, type StationProfileSource } from "./stationProfile.js";
import {
  BlueprintRefusedError,
  type AgentBlueprint,
  type BlueprintApprovals,
  type BlueprintBudget,
  type BlueprintGuardrail,
  type BlueprintRequest,
  type BlueprintSource,
  type BlueprintVerdict,
  type GuardrailSelection
} from "./blueprintTypes.js";

export interface ComposeOptions {
  readonly profileSource?: StationProfileSource;
}

/** Station-level blueprints keep the N heaviest questions per pack; pack-level keeps all. */
const STATION_GUARDRAILS_PER_PACK = 3;
const DEFAULT_TOOL_CLASSES: readonly ActionClass[] = ["READ_ONLY", "WRITE_LOW"];
/** Mirrors `ReceiptKind` in src/receipts/receipt.ts; `work_accepted` is a wire receipt, not a turn receipt. */
const TURN_RECEIPTS: readonly ReceiptKind[] = ["llm_request", "llm_response", "tool_action", "tool_result", "guard_check"];
/** The `sections` keys of the binder built in src/audit/binderCollector.ts, minus the ones a new agent cannot have yet (recurrence, supplyChainIntegrity). */
const BINDER_SECTIONS: readonly string[] = ["maturity", "governance", "modelToolGovernance", "assurance", "controls"];

function resolvePacks(station: Domain, packId: string | undefined): readonly IndustryPack[] {
  if (packId === undefined) {
    const packs = getPacksForDomain(station);
    if (packs.length === 0) throw new Error(`No industry packs found for station "${station}".`);
    return packs;
  }
  const pack = getPackById(packId);
  if (!pack) throw new Error(`Unknown pack: ${packId}. Expected one of: ${Object.keys(INDUSTRY_PACKS).sort().join(", ")}`);
  if (pack.stationId !== station) throw new Error(`Pack "${pack.id}" belongs to station "${pack.stationId}", not "${station}".`);
  return [pack];
}

function guardrailFor(pack: IndustryPack, question: IndustryPackQuestion): BlueprintGuardrail {
  return {
    id: `${pack.id}:${question.id}`,
    text:
      `[${question.id}] Enforce ${question.dimension} at least at L3: ${question.l3}. ` +
      `Escalate or block when unmet; L5 path: ${question.l5}.`,
    derivedFrom: { packId: pack.id, questionId: question.id, dimension: question.dimension, regulatoryRef: question.regulatoryRef }
  };
}

function selectGuardrails(packs: readonly IndustryPack[], packLevel: boolean): { guardrails: BlueprintGuardrail[]; selection: GuardrailSelection } {
  if (packLevel) {
    return {
      guardrails: packs.flatMap((pack) => pack.questions.map((question) => guardrailFor(pack, question))),
      selection: { mode: "all-questions", perPack: null, omittedQuestionIds: [] }
    };
  }
  const guardrails: BlueprintGuardrail[] = [];
  const omitted: string[] = [];
  for (const pack of packs) {
    const ranked = [...pack.questions].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    ranked.slice(0, STATION_GUARDRAILS_PER_PACK).forEach((question) => guardrails.push(guardrailFor(pack, question)));
    ranked.slice(STATION_GUARDRAILS_PER_PACK).forEach((question) => omitted.push(question.id));
  }
  return { guardrails, selection: { mode: "top-weighted-per-pack", perPack: STATION_GUARDRAILS_PER_PACK, omittedQuestionIds: omitted } };
}

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function resolveToolClasses(requested: readonly ActionClass[] | undefined): readonly ActionClass[] {
  const classes = dedupe(requested ?? DEFAULT_TOOL_CLASSES);
  for (const actionClass of classes) {
    if (!isActionClass(actionClass)) throw new Error(`Unknown tool class "${String(actionClass)}". Expected one of: ${ACTION_CLASSES.join(", ")}`);
  }
  return classes;
}

function buildApprovals(classes: readonly ActionClass[], overrides: BlueprintRequest["approvals"]): BlueprintApprovals {
  const policy = defaultApprovalPolicy().approvalPolicy.actionClasses;
  const gated = classes.filter((actionClass) => (policy[actionClass]?.requiredApprovals ?? 0) > 0);
  const strictest = gated.map((actionClass) => policy[actionClass]!).sort((a, b) => b.requiredApprovals - a.requiredApprovals)[0];
  const execTicket = defaultActionPolicy().actions.filter((rule) => rule.requireExecTicket && classes.includes(rule.actionClass)).map((rule) => rule.actionClass);
  return {
    gatedClasses: gated,
    requiredApprovals: overrides?.requiredApprovals ?? strictest?.requiredApprovals ?? 0,
    requireDistinctUsers: overrides?.requireDistinctUsers ?? strictest?.requireDistinctUsers ?? false,
    rolesAllowed: overrides?.rolesAllowed ?? strictest?.rolesAllowed ?? [],
    ttlMinutes: overrides?.ttlMinutes ?? strictest?.ttlMinutes ?? 0,
    requireExecTicketFor: dedupe(execTicket)
  };
}

function buildBudget(classes: readonly ActionClass[]): BlueprintBudget {
  const daily = defaultBudgets().budgets.perAgent["default"]!.daily;
  const maxToolExecutes = Object.fromEntries(
    ACTION_CLASSES.map((actionClass) => [actionClass, classes.includes(actionClass) ? (daily.maxToolExecutes[actionClass] ?? 0) : 0])
  ) as Record<ActionClass, number>;
  return {
    basis: "defaultBudgets() daily limits; every class outside toolScope.classes is set to 0",
    daily: { maxLlmRequests: daily.maxLlmRequests, maxLlmTokens: daily.maxLlmTokens, maxCostUsd: daily.maxCostUsd, maxToolExecutes }
  };
}

function requiredAssurancePacks(station: Domain, classes: readonly ActionClass[]): string[] {
  const fromStation = getDomainMetadata(station).assurancePacks;
  const fromActionPolicy = defaultActionPolicy().actions.filter((rule) => classes.includes(rule.actionClass)).flatMap((rule) => Object.keys(rule.requireAssurancePacks));
  const approvalClasses = defaultApprovalPolicy().approvalPolicy.actionClasses;
  const fromApprovalPolicy = classes.flatMap((actionClass) => Object.keys(approvalClasses[actionClass]?.requireAssurancePacks ?? {}));
  return dedupe([...fromStation, ...fromActionPolicy, ...fromApprovalPolicy]);
}

function buildSources(packs: readonly IndustryPack[], guardrails: readonly BlueprintGuardrail[]): BlueprintSource[] {
  const citations = new Map<string, string[]>();
  const cite = (title: string, by: string) => citations.set(title, [...(citations.get(title) ?? []), by]);
  for (const pack of packs) for (const basis of pack.regulatoryBasis) cite(basis, `${pack.id}:regulatoryBasis`);
  for (const guardrail of guardrails) cite(guardrail.derivedFrom.regulatoryRef, guardrail.id);
  return [...citations.entries()].map(([title, citedBy]) => ({
    title,
    url: null,
    retrievedAt: null,
    verified: false,
    reason: "cited from the industry pack as shipped at this commit; blueprint render does not retrieve primary text",
    citedBy: dedupe(citedBy)
  }));
}

export function composeBlueprint(request: BlueprintRequest, options: ComposeOptions = {}): AgentBlueprint {
  const station = parseDomain(request.station);
  const packs = resolvePacks(station, request.packId);
  const packLevel = request.packId !== undefined;
  const { profile, source } = resolveStationProfile(station, packs, options.profileSource);
  const classes = resolveToolClasses(request.toolClasses);
  const { guardrails, selection } = selectGuardrails(packs, packLevel);
  const metadata = getDomainMetadata(station);
  const lead = packs[0]!;

  const blueprint: AgentBlueprint = {
    schemaVersion: 1,
    station,
    ...(packLevel ? { packId: lead.id } : {}),
    name: request.name ?? (packLevel ? `${metadata.name} / ${lead.name} agent` : `${metadata.name} station agent`),
    purpose: request.purpose ?? (packLevel ? lead.description : metadata.description),
    riskStatements: dedupe(packs.flatMap((pack) => pack.keyRisks)),
    classification: dedupe(packs.map((pack) => pack.euAIActClassification)),
    profile: { source, tier: profile.tier, ruleId: profile.ruleId, forbiddenClasses: profile.forbiddenClasses, zeroQuotaClasses: zeroQuotaClasses() },
    guardrails,
    guardrailSelection: selection,
    toolScope: {
      classes,
      allowlist: dedupe(request.allowlist ?? []),
      allowlistNote: "Every tool the agent may call must also be granted in the signed .amc/tools.yaml allowlist; this list is the operator's intended narrowing."
    },
    approvals: buildApprovals(classes, request.approvals),
    budget: buildBudget(classes),
    requiredAssurancePacks: requiredAssurancePacks(station, classes),
    evidence: { receipts: TURN_RECEIPTS, binderSections: BINDER_SECTIONS },
    sources: buildSources(packs, guardrails),
    renderedFrom: { packIds: packs.map((pack) => pack.id), questionCount: packs.reduce((sum, pack) => sum + pack.questions.length, 0) }
  };

  const verdict = evaluateBlueprint(blueprint);
  if (!verdict.ok) throw new BlueprintRefusedError(verdict.refusals);
  return blueprint;
}

/** Re-check a blueprint after the operator edited the rendered file. */
export function validateBlueprint(blueprint: AgentBlueprint): BlueprintVerdict {
  return evaluateBlueprint(blueprint);
}
