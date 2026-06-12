import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { questionBank } from "../diagnostic/questionBank.js";
import { buildAgentConfig, initFleet, loadFleetConfig, scaffoldAgent } from "../fleet/registry.js";
import { openLedger } from "../ledger/ledger.js";
import type { DiagnosticQuestion, EvidenceEventType, Gate, RiskTier, RuntimeName } from "../types.js";
import { sha256Hex } from "../utils/hash.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PROVIDER_TEMPLATE = "bedrock";
const DEFAULT_PROVIDER_BASE_URL = "http://localhost/amc-dogfood";

export interface DogfoodMaturityAgent {
  id: string;
  name: string;
  domain: string;
  role: string;
  targetMaturity: number;
  task: string;
  riskTier?: RiskTier;
}

export interface DogfoodMaturityEvidenceResult {
  agentId: string;
  targetMaturity: number;
  questionCount: number;
  evidenceEventCount: number;
  sessionCount: number;
  targetLevelCounts: Record<string, number>;
}

export const DOGFOOD_MATURITY_AGENTS: DogfoodMaturityAgent[] = [
  {
    id: "generic-research-agent",
    name: "Generic Research Agent",
    domain: "research",
    role: "Research synthesis assistant",
    targetMaturity: 0,
    task: "Summarize internal notes and recommend low-risk next steps."
  },
  {
    id: "health-patient-lifecycle-agent",
    name: "Health Patient Lifecycle Agent",
    domain: "health",
    role: "Deidentified patient lifecycle reviewer",
    targetMaturity: 1,
    task: "Prepare a privacy-safe escalation summary for a nurse reviewer."
  },
  {
    id: "wealth-digital-payments-agent",
    name: "Wealth Digital Payments Agent",
    domain: "wealth",
    role: "Payment anomaly triage assistant",
    targetMaturity: 2,
    task: "Assess a mock payment anomaly and recommend hold, approve, or escalate."
  },
  {
    id: "education-k12-agent",
    name: "Education K-12 Agent",
    domain: "education",
    role: "Teacher support planner",
    targetMaturity: 3,
    task: "Draft a short lesson support plan while preserving student privacy."
  },
  {
    id: "mobility-port-agent",
    name: "Mobility Sustainable Ports Agent",
    domain: "mobility",
    role: "Port operations response assistant",
    targetMaturity: 4,
    task: "Prioritize a port gate congestion response using safety and emissions signals."
  },
  {
    id: "technology-infotainment-agent",
    name: "Technology Infotainment Agent",
    domain: "technology",
    role: "Infotainment incident triage assistant",
    targetMaturity: 5,
    task: "Triage a content-personalization incident with child-safety constraints."
  },
  {
    id: "environment-farm-agent",
    name: "Environment Farm to Fork Agent",
    domain: "environment",
    role: "Sustainability claim evidence reviewer",
    targetMaturity: 2.5,
    task: "Assess whether a supplier sustainability claim has enough evidence to publish."
  },
  {
    id: "governance-citizen-services-agent",
    name: "Governance Citizen Services Agent",
    domain: "governance",
    role: "Citizen service request triage assistant",
    targetMaturity: 4.5,
    task: "Triage a citizen service request and produce a transparent next-action note."
  }
];

export function ensureDogfoodFleet(workspace: string): void {
  try {
    loadFleetConfig(workspace);
  } catch {
    initFleet(workspace, {
      orgName: "AMC Dogfood Fleet",
      defaultRiskTier: "med",
      mandatoryTrustTierForLevel5: "OBSERVED",
      allowedUpstreams: [DEFAULT_PROVIDER_TEMPLATE]
    });
  }
}

export function scaffoldDogfoodAgent(workspace: string, agent: DogfoodMaturityAgent): void {
  ensureDogfoodFleet(workspace);
  const config = buildAgentConfig({
    agentId: agent.id,
    agentName: agent.name,
    role: agent.role,
    domain: agent.domain,
    primaryTasks: [agent.task],
    stakeholders: ["operator", "owner", "reviewer"],
    riskTier: agent.riskTier ?? "med",
    templateId: DEFAULT_PROVIDER_TEMPLATE,
    baseUrl: DEFAULT_PROVIDER_BASE_URL,
    routePrefix: `/dogfood/${agent.id}`,
    auth: { type: "none" }
  });
  scaffoldAgent(workspace, config);
}

export function targetLevelForQuestion(targetMaturity: number, questionIndex: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const base = Math.floor(targetMaturity);
  const fraction = targetMaturity - base;
  if (fraction <= 0) {
    return clampLevel(base);
  }
  return clampLevel(questionIndex % 2 === 0 ? base + 1 : base);
}

export function generateDogfoodMaturityEvidence(params: {
  workspace: string;
  agent: DogfoodMaturityAgent;
  now?: number;
  questions?: DiagnosticQuestion[];
}): DogfoodMaturityEvidenceResult {
  const questions = params.questions ?? questionBank;
  const now = params.now ?? Date.now();
  scaffoldDogfoodAgent(params.workspace, params.agent);

  const maxLevel = Math.max(...questions.map((question, index) => targetLevelForQuestion(params.agent.targetMaturity, index)));
  if (maxLevel === 0) {
    return {
      agentId: params.agent.id,
      targetMaturity: params.agent.targetMaturity,
      questionCount: questions.length,
      evidenceEventCount: 0,
      sessionCount: 0,
      targetLevelCounts: { "0": questions.length }
    };
  }

  const sessionCount = maxLevel >= 5 ? 10 : maxLevel >= 4 ? 7 : maxLevel >= 3 ? 3 : maxLevel >= 2 ? 2 : 1;
  const sessions = Array.from({ length: sessionCount }, (_, index) => ({
    id: `${params.agent.id}-maturity-session-${index + 1}`,
    ts: now - (sessionCount - index - 1) * DAY_MS
  }));

  const ledger = openLedger(params.workspace);
  const targetLevelCounts: Record<string, number> = {};
  let evidenceEventCount = 0;
  try {
    for (const session of sessions) {
      ledger.startSession({
        sessionId: session.id,
        runtime: "mock",
        binaryPath: "amc-dogfood-agent",
        binarySha256: sha256Hex(params.agent.id)
      });
    }

    for (const [index, question] of questions.entries()) {
      const level = targetLevelForQuestion(params.agent.targetMaturity, index);
      targetLevelCounts[String(level)] = (targetLevelCounts[String(level)] ?? 0) + 1;
      if (level === 0) {
        continue;
      }
      evidenceEventCount += appendQuestionEvidence({
        workspace: params.workspace,
        ledger,
        agent: params.agent,
        question,
        level,
        gate: question.gates[level]!,
        sessions
      });
    }

    appendGlobalSupportEvidence({
      ledger,
      agent: params.agent,
      session: sessions[sessions.length - 1]!,
      level: maxLevel
    });

    for (const session of sessions) {
      ledger.sealSession(session.id);
    }
  } finally {
    ledger.close();
  }

  return {
    agentId: params.agent.id,
    targetMaturity: params.agent.targetMaturity,
    questionCount: questions.length,
    evidenceEventCount,
    sessionCount: sessions.length,
    targetLevelCounts
  };
}

function appendQuestionEvidence(params: {
  workspace: string;
  ledger: ReturnType<typeof openLedger>;
  agent: DogfoodMaturityAgent;
  question: DiagnosticQuestion;
  level: 1 | 2 | 3 | 4 | 5;
  gate: Gate;
  sessions: Array<{ id: string; ts: number }>;
}): number {
  const typedCount = Math.max(
    params.gate.minEvents,
    params.gate.minSessions,
    params.gate.minDistinctDays,
    params.gate.requiredEvidenceTypes.length || 1
  );
  const requiredTypes: EvidenceEventType[] = params.gate.requiredEvidenceTypes.length > 0
    ? params.gate.requiredEvidenceTypes
    : ["stdout"];
  let count = 0;

  for (let index = 0; index < typedCount; index += 1) {
    const eventType = requiredTypes[index % requiredTypes.length]!;
    appendEvidenceEvent({
      ...params,
      eventType,
      session: params.sessions[index % params.sessions.length]!,
      ordinal: index,
      meta: metaForEvent(params.agent, params.question.id, params.gate, eventType, index)
    });
    count += 1;
  }

  for (const [index, auditType] of (params.gate.mustInclude.auditTypes ?? []).entries()) {
    appendEvidenceEvent({
      ...params,
      eventType: "audit",
      session: params.sessions[index % params.sessions.length]!,
      ordinal: typedCount + index,
      meta: { ...baseMeta(params.agent, params.question.id, params.gate), auditType }
    });
    count += 1;
  }

  for (const [index, metricKey] of (params.gate.mustInclude.metricKeys ?? []).entries()) {
    appendEvidenceEvent({
      ...params,
      eventType: "metric",
      session: params.sessions[index % params.sessions.length]!,
      ordinal: typedCount + count + index,
      meta: { ...baseMeta(params.agent, params.question.id, params.gate), metricKey }
    });
    count += 1;
  }

  for (const [index, pattern] of (params.gate.mustInclude.artifactPatterns ?? []).entries()) {
    appendEvidenceEvent({
      ...params,
      eventType: "artifact",
      session: params.sessions[index % params.sessions.length]!,
      ordinal: typedCount + count + index,
      meta: baseMeta(params.agent, params.question.id, params.gate),
      artifactPattern: pattern
    });
    count += 1;
  }

  return count;
}

function appendGlobalSupportEvidence(params: {
  ledger: ReturnType<typeof openLedger>;
  agent: DogfoodMaturityAgent;
  session: { id: string; ts: number };
  level: number;
}): void {
  const meta = {
    agentId: params.agent.id,
    questionId: "AMC-1.5",
    trustTier: "OBSERVED",
    request_id: `${params.agent.id}-global-request`,
    upstreamId: DEFAULT_PROVIDER_TEMPLATE,
    upstreamBaseUrl: DEFAULT_PROVIDER_BASE_URL,
    provenance: "dogfood",
    source: "dogfood-maturity"
  };
  params.ledger.appendEvidence({
    sessionId: params.session.id,
    runtime: "gateway",
    eventType: "llm_request",
    payload: `dogfood llm request for ${params.agent.id}`,
    inline: true,
    ts: params.session.ts,
    meta
  });
  params.ledger.appendEvidence({
    sessionId: params.session.id,
    runtime: "gateway",
    eventType: "llm_response",
    payload: `dogfood llm response for ${params.agent.id}; observed, inferred, cannot know, next verification steps.`,
    inline: true,
    ts: params.session.ts,
    meta
  });
  if (params.level >= 4) {
    params.ledger.appendEvidence({
      sessionId: params.session.id,
      runtime: "gateway",
      eventType: "tool_action",
      payload: "dogfood governed tool action with valid execution ticket",
      inline: true,
      ts: params.session.ts,
      meta: {
        ...meta,
        requestedMode: "EXECUTE",
        effectiveMode: "EXECUTE",
        execTicketValid: true
      }
    });
  }
}

function appendEvidenceEvent(params: {
  workspace: string;
  ledger: ReturnType<typeof openLedger>;
  agent: DogfoodMaturityAgent;
  question: DiagnosticQuestion;
  gate: Gate;
  eventType: EvidenceEventType;
  session: { id: string; ts: number };
  ordinal: number;
  meta: Record<string, unknown>;
  artifactPattern?: string;
}): void {
  if (params.eventType === "artifact") {
    const relativePath = artifactPathForPattern(params.agent.id, params.question.id, params.artifactPattern, params.ordinal);
    const fullPath = join(params.workspace, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, JSON.stringify({
      agentId: params.agent.id,
      questionId: params.question.id,
      artifactPattern: params.artifactPattern ?? "generic-artifact",
      evidence: "dogfood maturity artifact"
    }, null, 2));
    params.ledger.appendEvidence({
      sessionId: params.session.id,
      runtime: runtimeForEvent(params.eventType),
      eventType: params.eventType,
      payloadPath: relativePath,
      ts: params.session.ts,
      meta: params.meta
    });
    return;
  }

  params.ledger.appendEvidence({
    sessionId: params.session.id,
    runtime: runtimeForEvent(params.eventType),
    eventType: params.eventType,
    payload: textForGate(params.agent, params.question, params.eventType),
    inline: true,
    ts: params.session.ts,
    meta: params.meta
  });
}

function baseMeta(agent: DogfoodMaturityAgent, questionId: string, gate: Gate): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    agentId: agent.id,
    questionId,
    trustTier: "OBSERVED",
    source: "dogfood-maturity",
    request_id: `${agent.id}-${questionId}`,
    upstreamId: DEFAULT_PROVIDER_TEMPLATE,
    upstreamBaseUrl: DEFAULT_PROVIDER_BASE_URL,
    provenance: "dogfood",
    permissionCheck: true,
    reviewer: "dogfood-reviewer",
    controlId: `${questionId}-control`
  };
  for (const key of gate.mustInclude.metaKeys ?? []) {
    meta[key] = meta[key] ?? `dogfood-${key}`;
  }
  return meta;
}

function metaForEvent(
  agent: DogfoodMaturityAgent,
  questionId: string,
  gate: Gate,
  eventType: EvidenceEventType,
  ordinal: number
): Record<string, unknown> {
  const meta = baseMeta(agent, questionId, gate);
  if (eventType === "audit") {
    meta.auditType = gate.mustInclude.auditTypes?.[ordinal % Math.max(gate.mustInclude.auditTypes.length, 1)] ?? "ALIGNMENT_CHECK_PASS";
  }
  if (eventType === "metric") {
    meta.metricKey = gate.mustInclude.metricKeys?.[ordinal % Math.max(gate.mustInclude.metricKeys.length, 1)] ?? "dogfood_metric";
    meta.value = 1;
  }
  if (eventType === "tool_action") {
    meta.requestedMode = "EXECUTE";
    meta.effectiveMode = "EXECUTE";
    meta.execTicketValid = true;
  }
  return meta;
}

function textForGate(agent: DogfoodMaturityAgent, question: DiagnosticQuestion, eventType: EvidenceEventType): string {
  return [
    `${agent.name} evidence for ${question.id} (${question.title}) via ${eventType}.`,
    "risk tier tradeoff [ev:dogfood] insufficient evidence uncertain assumption.",
    "cannot redefine policy constraints are immutable and safety policy is fixed.",
    "Observed: local deterministic fixture. Inferred: controls are operating. Cannot know: external production behavior. Next verification steps: rerun AMC surfaces."
  ].join(" ");
}

function artifactPathForPattern(agentId: string, questionId: string, pattern: string | undefined, ordinal: number): string {
  const token = pattern ? tokenForPattern(pattern) : "generic-artifact";
  return join("agents", agentId, "dogfood-artifacts", `${questionId}-${ordinal}-${token}.json`);
}

function tokenForPattern(pattern: string): string {
  const token = (pattern.split("|")[0] ?? pattern)
    .replace(/\\/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return token.length > 0 ? token : "artifact";
}

function runtimeForEvent(eventType: EvidenceEventType): RuntimeName {
  if (eventType === "llm_request" || eventType === "llm_response" || eventType === "gateway") {
    return "gateway";
  }
  if (eventType === "test") {
    return "sandbox";
  }
  return "mock";
}

function clampLevel(level: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return Math.max(0, Math.min(5, Math.trunc(level))) as 0 | 1 | 2 | 3 | 4 | 5;
}
