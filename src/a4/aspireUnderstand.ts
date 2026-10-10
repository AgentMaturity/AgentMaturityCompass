/**
 * Aspire's Understand detectors (P1-59; design §9.3, §10.1). Each wraps an existing AMC function and becomes one
 * stage_output ref, self_reported: workspace facts in the implementation lane (a file scan is a weak method, never an
 * observation), classifications in the recommendation lane. Nothing here is observed. Register entries keep their
 * `verified` flags verbatim; whether an entry applies is decided at Adapt, not here. The reflection restates the answers
 * and lists what is assumed and what is unknown; it is deterministic.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listArchetypes } from "../archetypes/index.js";
import { getRegisterEntriesForStation } from "../compliance/regulatory/index.js";
import { loadContextGraph, type ContextGraph } from "../context/contextGraph.js";
import { getDomainMetadata } from "../domains/domainRegistry.js";
import { getPacksForDomain } from "../domains/industryPacks.js";
import { parseStation, type Station } from "../domains/stations.js";
import { getAgentPaths } from "../fleet/paths.js";
import { listAgents, loadAgentConfig, type AgentConfig } from "../fleet/registry.js";
import { detectFramework } from "../guide/guideGenerator.js";
import { detectAgentInstructionSources, detectFrameworksForOnboarding } from "../setup/setupWizard.js";
import { pathExists } from "../utils/fs.js";
import { answerGaps, CHOICES, listValue, PREFILL_SOURCES, textValue } from "./spec/aspire.js";
import type { A4Answer } from "./a4Schema.js";

export interface AspireFact {
  readonly id: string;
  readonly lane: "implementation" | "recommendation";
  /** The claim method the ref is labelled with: a file scan or a keyword match is a weak method (claims/eligibility). */
  readonly method: "path_presence" | "keyword_match" | null;
  readonly label: string;
  readonly body: Record<string, unknown>;
}
export interface AspireReflection {
  readonly agent: string | null;
  readonly mission: string | null;
  readonly audiences: string[];
  readonly workflow: string | null;
  readonly goals: string[];
  readonly constraints: string[];
  readonly nonGoals: string[];
  readonly assumptions: string[];
  readonly unknowns: string[];
}
export interface AspireUnderstanding {
  readonly facts: AspireFact[];
  readonly reflection: AspireReflection;
  /** Pre-fills for unanswered questions, recorded `source: "inferred"`. */
  readonly inferred: Array<{ questionId: string; value: unknown; from: string }>;
  readonly stations: Station[];
  readonly archetypeIds: string[];
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 300);
const WORD = /[a-z]{4,}/g;
const words = (text: string): Set<string> => new Set(text.toLowerCase().match(WORD) ?? []);

/** The agent's config and context graph as the fleet reads them; an unreadable file is reported, never guessed. */
function agentFiles(workspace: string, agentId: string): { config: AgentConfig | null; graph: ContextGraph | null; notes: Record<string, string> } {
  const paths = getAgentPaths(workspace, agentId);
  const notes: Record<string, string> = {};
  let config: AgentConfig | null = null;
  let graph: ContextGraph | null = null;
  try {
    if (pathExists(paths.agentConfig)) config = loadAgentConfig(workspace, agentId);
  } catch (error) {
    notes.agentConfig = errorText(error);
  }
  try {
    if (pathExists(paths.contextGraph)) graph = loadContextGraph(workspace, agentId);
  } catch (error) {
    notes.contextGraph = errorText(error);
  }
  return { config, graph, notes };
}

/** Stations from the answer, else from the agent config's domain; values that name no station are listed as unknown. */
function classifyStations(values: ReadonlyMap<string, unknown>, config: AgentConfig | null): { source: string | null; stations: Station[]; unknown: string[] } {
  const answered = listValue(values.get("stations"));
  const raw = answered.length > 0 ? answered : config ? [config.domain] : [];
  const stations: Station[] = [];
  const unknown: string[] = [];
  for (const value of raw) {
    try {
      const station = parseStation(value);
      if (!stations.includes(station)) stations.push(station);
    } catch {
      unknown.push(value);
    }
  }
  return { source: answered.length > 0 ? "answers.stations" : config ? "agent config domain" : null, stations, unknown };
}

/** Archetypes ranked by shared words with the agent, problem and goals (a keyword match; the named interest first). */
function matchArchetypes(values: ReadonlyMap<string, unknown>, interest: string | null) {
  const asked = words([textValue(values.get("agent")), textValue(values.get("problem")), ...listValue(values.get("goals"))].filter(Boolean).join(" "));
  return listArchetypes().map((archetype) => {
    const shared = [...words(`${archetype.name} ${archetype.description}`)].filter((word) => asked.has(word)).sort();
    return { id: archetype.id, name: archetype.name, recommendedRiskTier: archetype.recommendedRiskTier, sharedWords: shared,
      named: archetype.id === interest };
  }).sort((a, b) => Number(b.named) - Number(a.named) || b.sharedWords.length - a.sharedWords.length || a.id.localeCompare(b.id));
}

/** Runs every detector for `agentId` in `workspace` and reflects the answers. Reads files; writes nothing. */
export function understandAspire(workspace: string, agentId: string, answers: readonly A4Answer[],
  profile: { expertise?: unknown; archetype?: unknown }): AspireUnderstanding {
  const values = new Map(answers.map((answer) => [answer.questionId, answer.value]));
  const read = (rel: string): string | null => {
    try {
      return readFileSync(join(workspace, rel), "utf8");
    } catch {
      return null;
    }
  };
  const framework = detectFramework((rel) => existsSync(join(workspace, rel)), read);
  const { config, graph, notes } = agentFiles(workspace, agentId);
  const stations = classifyStations(values, config);
  const archetypes = matchArchetypes(values, textValue(values.get("archetypeInterest")) ?? (typeof profile.archetype === "string" ? profile.archetype : null));
  const register = [...new Map(stations.stations.flatMap((station) => getRegisterEntriesForStation(station)).map((entry) => [entry.id, {
    id: entry.id, jurisdiction: entry.jurisdiction, instrument: entry.instrument, status: entry.status, bindingForce: entry.bindingForce,
    stations: entry.stations, verified: entry.verified, openQuestions: entry.openQuestions.length }])).values()];
  const facts: AspireFact[] = [
    { id: "framework", lane: "implementation", method: "path_presence", label: "aspire understand: agent framework (detectFramework, a file scan)", body: { detected: framework } },
    { id: "frameworks", lane: "implementation", method: "path_presence", label: "aspire understand: onboarding frameworks (a file scan)",
      body: { detections: detectFrameworksForOnboarding(workspace) } },
    { id: "instructionSources", lane: "implementation", method: "path_presence", label: "aspire understand: agent instruction sources (a file scan)",
      body: { sources: detectAgentInstructionSources(workspace) } },
    { id: "contextGraph", lane: "implementation", method: null, label: "aspire understand: the agent's context graph",
      body: graph ? { state: "valid", mission: graph.mission, riskTier: graph.riskTier } : { state: notes.contextGraph ? "invalid" : "absent", error: notes.contextGraph ?? null } },
    { id: "agents", lane: "implementation", method: null, label: "aspire understand: agents in this workspace",
      body: { agents: listAgents(workspace), thisAgent: { id: agentId, configured: config !== null, error: notes.agentConfig ?? null } } },
    { id: "stations", lane: "recommendation", method: null, label: "aspire understand: station classification",
      body: { source: stations.source, unknown: stations.unknown, stations: stations.stations.map((station) => ({ station, name: getDomainMetadata(station).name,
        packs: getPacksForDomain(station).map((pack) => ({ id: pack.id, name: pack.name })) })) } },
    { id: "archetypes", lane: "recommendation", method: "keyword_match", label: "aspire understand: matching archetypes (a keyword match)",
      body: { matches: archetypes.slice(0, 5) } },
    { id: "register", lane: "recommendation", method: null, label: "aspire understand: register entries for the stations (verified flags as recorded)",
      body: { entries: register, applicability: "not evaluated at Aspire; decided at Adapt" } }
  ];
  const gaps = answerGaps(answers);
  const tier = textValue(values.get("riskTier"));
  const reflection: AspireReflection = {
    agent: textValue(values.get("agent")), mission: textValue(values.get("problem")), audiences: listValue(values.get("audience")),
    workflow: textValue(values.get("currentWorkflow")), goals: listValue(values.get("goals")), constraints: listValue(values.get("constraints")),
    nonGoals: listValue(values.get("forbiddenActions")),
    assumptions: [
      tier ? `Risk tier "${tier}" as answered` : "No risk tier yet: AMC treats unknown risk as high",
      ...(stations.stations.length > 0 ? [`Stations ${stations.stations.join(", ")} (from ${stations.source})`] : []),
      ...(framework ? [`Framework ${framework.name} detected from ${framework.detectedFrom} (a file scan, not an observation)`] : []),
      "Aspire runs no model: nothing here was produced by or observed from the agent"
    ],
    unknowns: [
      ...gaps.missing.map((id) => `Not answered yet: ${id}`), ...gaps.stale.map((id) => `Needs confirming because an answer it depends on changed: ${id}`),
      ...gaps.invalid.map((id) => `Not one of ${CHOICES[id]?.join(", ")}: ${id}`),
      ...(listValue(values.get("markets")).length === 0 ? ["Markets unknown: which rules apply is decided at Adapt"] : []),
      ...stations.unknown.map((value) => `Not a station: ${value}`),
      "Maturity levels are not evaluated at Aspire"
    ]
  };
  const inferredTier = tier ?? graph?.riskTier ?? config?.riskTier ?? null;
  const candidates: Array<[string, unknown]> = [
    ["agent", config ? `${config.agentName}: ${config.role}` : null], ["problem", graph?.mission ?? null],
    ["successMetrics", graph?.successMetrics ?? null], ["constraints", graph?.constraints ?? null], ["forbiddenActions", graph?.forbiddenActions ?? null],
    ["riskTier", inferredTier], ["stations", stations.source === "agent config domain" && stations.stations.length > 0 ? stations.stations : null],
    ["expertise", typeof profile.expertise === "string" ? profile.expertise : null],
    ["archetypeInterest", archetypes.find((entry) => entry.named)?.id ?? null],
    ["governance", inferredTier === null ? null : inferredTier === "high" || inferredTier === "critical" ? "regulated" : "standard"]
  ];
  const inferred = candidates.filter(([id, value]) => value !== null && !values.has(id)).map(([questionId, value]) => ({ questionId, value, from: PREFILL_SOURCES[questionId]! }));
  return { facts, reflection, inferred, stations: stations.stations, archetypeIds: archetypes.slice(0, 3).map((entry) => entry.id) };
}
