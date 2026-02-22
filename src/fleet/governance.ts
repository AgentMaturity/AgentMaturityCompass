import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import type { DiagnosticReport, LayerName, TrustLabel } from "../types.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getAgentPaths } from "./paths.js";
import { listAgents, loadAgentConfig, saveAgentConfig, type AgentConfig } from "./registry.js";

export type FleetEnvironment = "development" | "staging" | "production";
export type FleetDimension = 1 | 2 | 3 | 4 | 5;
export type FleetSloStatus = "HEALTHY" | "BREACHED";
export type FleetAlertKind = "DRIFT" | "SLO_BREACH" | "SLO_RECOVERY";
export type FleetAlertSeverity = "INFO" | "WARN" | "CRITICAL";

export interface FleetGovernancePolicy {
  policyId: string;
  description: string;
  minimumIntegrityIndex: number;
  minimumDimensionLevel: Partial<Record<FleetDimension, number>>;
  enforcedGuardrails: Record<string, unknown>;
  updatedTs: number;
}

export interface FleetGovernanceAlert {
  alertId: string;
  kind: FleetAlertKind;
  severity: FleetAlertSeverity;
  ts: number;
  message: string;
  agentId: string | null;
  sloId: string | null;
}

export interface FleetSloDefinition {
  sloId: string;
  objective: string;
  environment: FleetEnvironment;
  dimension: FleetDimension;
  minimumLevel: number;
  requiredPercent: number;
  createdTs: number;
  updatedTs: number;
}

export interface FleetSloEvaluation {
  sloId: string;
  objective: string;
  environment: FleetEnvironment;
  dimension: FleetDimension;
  minimumLevel: number;
  requiredPercent: number;
  eligibleAgents: number;
  compliantAgents: number;
  complianceRatio: number;
  status: FleetSloStatus;
}

export interface FleetAgentHealth {
  agentId: string;
  environment: FleetEnvironment;
  runId: string | null;
  runTs: number | null;
  integrityIndex: number | null;
  overallLevel: number | null;
  trustLabel: TrustLabel | "NO_DATA";
  dimensions: Record<FleetDimension, number | null>;
  belowBaseline: boolean;
}

export interface FleetHealthDashboard {
  generatedTs: number;
  baselineIntegrityIndex: number;
  agentCount: number;
  scoredAgentCount: number;
  averageIntegrityIndex: number;
  averageOverallLevel: number;
  dimensionAverages: Record<FleetDimension, number>;
  trustLabelCounts: Record<string, number>;
  agents: FleetAgentHealth[];
  alerts: FleetGovernanceAlert[];
  sloStatuses: FleetSloEvaluation[];
  overallSloStatus: FleetSloStatus;
}

interface FleetGovernanceState {
  schemaVersion: 1;
  baselineIntegrityIndex: number | null;
  baselineSetTs: number | null;
  policies: {
    globalPolicy: FleetGovernancePolicy | null;
    byEnvironment: Partial<Record<FleetEnvironment, FleetGovernancePolicy>>;
  };
  slos: FleetSloDefinition[];
  lastScores: Record<string, number>;
  lastSloStatus: Record<string, FleetSloStatus>;
  alerts: FleetGovernanceAlert[];
}

const LAYER_BY_DIMENSION: Record<FleetDimension, LayerName> = {
  1: "Strategic Agent Operations",
  2: "Leadership & Autonomy",
  3: "Culture & Alignment",
  4: "Resilience",
  5: "Skills"
};

const DIMENSIONS: FleetDimension[] = [1, 2, 3, 4, 5];
const ALERT_HISTORY_LIMIT = 200;

const ENV_ALIASES: Record<string, FleetEnvironment> = {
  dev: "development",
  development: "development",
  stage: "staging",
  staging: "staging",
  prod: "production",
  production: "production"
};

function governanceStatePath(workspace: string): string {
  return join(workspace, ".amc", "fleet", "governance-state.json");
}

function defaultGovernanceState(): FleetGovernanceState {
  return {
    schemaVersion: 1,
    baselineIntegrityIndex: null,
    baselineSetTs: null,
    policies: {
      globalPolicy: null,
      byEnvironment: {}
    },
    slos: [],
    lastScores: {},
    lastSloStatus: {},
    alerts: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function normalizePolicy(policy: {
  policyId: string;
  description: string;
  minimumIntegrityIndex?: number;
  minimumDimensionLevel?: Partial<Record<FleetDimension, number>>;
  enforcedGuardrails?: Record<string, unknown>;
  updatedTs?: number;
}): FleetGovernancePolicy {
  const dimensionLevels: Partial<Record<FleetDimension, number>> = {};
  for (const dimension of DIMENSIONS) {
    const raw = policy.minimumDimensionLevel?.[dimension];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      dimensionLevels[dimension] = clamp(raw, 0, 5);
    }
  }
  return {
    policyId: policy.policyId,
    description: policy.description,
    minimumIntegrityIndex: round(clamp(policy.minimumIntegrityIndex ?? 0.6, 0, 1), 4),
    minimumDimensionLevel: dimensionLevels,
    enforcedGuardrails: isRecord(policy.enforcedGuardrails) ? policy.enforcedGuardrails : {},
    updatedTs: policy.updatedTs ?? Date.now()
  };
}

function loadGovernanceState(workspace: string): FleetGovernanceState {
  const path = governanceStatePath(workspace);
  if (!pathExists(path)) {
    return defaultGovernanceState();
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(raw)) {
      return defaultGovernanceState();
    }
    const base = defaultGovernanceState();
    const policiesRaw = isRecord(raw.policies) ? raw.policies : {};
    const byEnvRaw = isRecord(policiesRaw.byEnvironment) ? policiesRaw.byEnvironment : {};
    const byEnvironment: Partial<Record<FleetEnvironment, FleetGovernancePolicy>> = {};
    for (const key of Object.keys(byEnvRaw)) {
      if (key === "development" || key === "staging" || key === "production") {
        const policyRaw = byEnvRaw[key];
        if (isRecord(policyRaw) && typeof policyRaw.policyId === "string" && typeof policyRaw.description === "string") {
          byEnvironment[key] = normalizePolicy({
            policyId: policyRaw.policyId,
            description: policyRaw.description,
            minimumIntegrityIndex: typeof policyRaw.minimumIntegrityIndex === "number" ? policyRaw.minimumIntegrityIndex : undefined,
            minimumDimensionLevel: isRecord(policyRaw.minimumDimensionLevel)
              ? (policyRaw.minimumDimensionLevel as Partial<Record<FleetDimension, number>>)
              : undefined,
            enforcedGuardrails: isRecord(policyRaw.enforcedGuardrails) ? policyRaw.enforcedGuardrails : undefined,
            updatedTs: typeof policyRaw.updatedTs === "number" ? policyRaw.updatedTs : undefined
          });
        }
      }
    }
    const globalPolicyRaw = policiesRaw.globalPolicy;
    const globalPolicy =
      isRecord(globalPolicyRaw) && typeof globalPolicyRaw.policyId === "string" && typeof globalPolicyRaw.description === "string"
        ? normalizePolicy({
            policyId: globalPolicyRaw.policyId,
            description: globalPolicyRaw.description,
            minimumIntegrityIndex:
              typeof globalPolicyRaw.minimumIntegrityIndex === "number" ? globalPolicyRaw.minimumIntegrityIndex : undefined,
            minimumDimensionLevel: isRecord(globalPolicyRaw.minimumDimensionLevel)
              ? (globalPolicyRaw.minimumDimensionLevel as Partial<Record<FleetDimension, number>>)
              : undefined,
            enforcedGuardrails: isRecord(globalPolicyRaw.enforcedGuardrails) ? globalPolicyRaw.enforcedGuardrails : undefined,
            updatedTs: typeof globalPolicyRaw.updatedTs === "number" ? globalPolicyRaw.updatedTs : undefined
          })
        : null;

    const slosRaw = Array.isArray(raw.slos) ? raw.slos : [];
    const slos: FleetSloDefinition[] = [];
    for (const item of slosRaw) {
      if (!isRecord(item)) continue;
      if (
        typeof item.sloId === "string" &&
        typeof item.objective === "string" &&
        typeof item.environment === "string" &&
        (item.environment === "development" || item.environment === "staging" || item.environment === "production") &&
        typeof item.dimension === "number" &&
        item.dimension >= 1 &&
        item.dimension <= 5 &&
        typeof item.minimumLevel === "number" &&
        Number.isFinite(item.minimumLevel) &&
        typeof item.requiredPercent === "number" &&
        Number.isFinite(item.requiredPercent) &&
        typeof item.createdTs === "number" &&
        Number.isFinite(item.createdTs) &&
        typeof item.updatedTs === "number" &&
        Number.isFinite(item.updatedTs)
      ) {
        slos.push({
          sloId: item.sloId,
          objective: item.objective,
          environment: item.environment,
          dimension: item.dimension as FleetDimension,
          minimumLevel: clamp(item.minimumLevel, 0, 5),
          requiredPercent: clamp(item.requiredPercent, 0, 1),
          createdTs: item.createdTs,
          updatedTs: item.updatedTs
        });
      }
    }

    const lastScoresRaw = isRecord(raw.lastScores) ? raw.lastScores : {};
    const lastScores: Record<string, number> = {};
    for (const [key, value] of Object.entries(lastScoresRaw)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        lastScores[key] = clamp(value, 0, 1);
      }
    }

    const lastSloStatusRaw = isRecord(raw.lastSloStatus) ? raw.lastSloStatus : {};
    const lastSloStatus: Record<string, FleetSloStatus> = {};
    for (const [key, value] of Object.entries(lastSloStatusRaw)) {
      if (value === "HEALTHY" || value === "BREACHED") {
        lastSloStatus[key] = value;
      }
    }

    const alertsRaw = Array.isArray(raw.alerts) ? raw.alerts : [];
    const alerts: FleetGovernanceAlert[] = [];
    for (const item of alertsRaw) {
      if (!isRecord(item)) continue;
      if (
        typeof item.alertId === "string" &&
        typeof item.kind === "string" &&
        (item.kind === "DRIFT" || item.kind === "SLO_BREACH" || item.kind === "SLO_RECOVERY") &&
        typeof item.severity === "string" &&
        (item.severity === "INFO" || item.severity === "WARN" || item.severity === "CRITICAL") &&
        typeof item.ts === "number" &&
        typeof item.message === "string"
      ) {
        alerts.push({
          alertId: item.alertId,
          kind: item.kind,
          severity: item.severity,
          ts: item.ts,
          message: item.message,
          agentId: typeof item.agentId === "string" ? item.agentId : null,
          sloId: typeof item.sloId === "string" ? item.sloId : null
        });
      }
    }

    return {
      schemaVersion: 1,
      baselineIntegrityIndex:
        typeof raw.baselineIntegrityIndex === "number" && Number.isFinite(raw.baselineIntegrityIndex)
          ? clamp(raw.baselineIntegrityIndex, 0, 1)
          : base.baselineIntegrityIndex,
      baselineSetTs:
        typeof raw.baselineSetTs === "number" && Number.isFinite(raw.baselineSetTs) ? raw.baselineSetTs : base.baselineSetTs,
      policies: {
        globalPolicy,
        byEnvironment
      },
      slos,
      lastScores,
      lastSloStatus,
      alerts: alerts.slice(-ALERT_HISTORY_LIMIT)
    };
  } catch {
    return defaultGovernanceState();
  }
}

function saveGovernanceState(workspace: string, state: FleetGovernanceState): string {
  const path = governanceStatePath(workspace);
  ensureDir(dirname(path));
  writeFileAtomic(path, JSON.stringify(state, null, 2), 0o644);
  return path;
}

function listFleetAgentIds(workspace: string): string[] {
  const ids = new Set<string>(["default"]);
  for (const row of listAgents(workspace)) {
    ids.add(row.id);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function loadLatestReportForAgent(workspace: string, agentId: string): DiagnosticReport | null {
  const runsDir = getAgentPaths(workspace, agentId).runsDir;
  if (!pathExists(runsDir)) {
    return null;
  }
  const files = readdirSync(runsDir).filter((file) => file.endsWith(".json"));
  let latest: DiagnosticReport | null = null;
  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(runsDir, file), "utf8")) as DiagnosticReport;
      if (!parsed || typeof parsed !== "object" || typeof parsed.ts !== "number" || typeof parsed.agentId !== "string") {
        continue;
      }
      if (!latest || parsed.ts > latest.ts) {
        latest = parsed;
      }
    } catch {
      continue;
    }
  }
  return latest;
}

function getEnvironmentForAgent(workspace: string, agentId: string): FleetEnvironment {
  try {
    const config = loadAgentConfig(workspace, agentId);
    return normalizeFleetEnvironment(config.environment ?? "development");
  } catch {
    return "development";
  }
}

function computeOverallLevel(report: DiagnosticReport): number {
  const count = report.layerScores.length;
  if (count === 0) return 0;
  const total = report.layerScores.reduce((sum, row) => sum + row.avgFinalLevel, 0);
  return round(total / count, 3);
}

function dimensionLevel(report: DiagnosticReport, dimension: FleetDimension): number {
  const layer = LAYER_BY_DIMENSION[dimension];
  const found = report.layerScores.find((row) => row.layerName === layer);
  return round(found?.avgFinalLevel ?? 0, 3);
}

function emptyDimensions(): Record<FleetDimension, number | null> {
  return {
    1: null,
    2: null,
    3: null,
    4: null,
    5: null
  };
}

function appendAlerts(state: FleetGovernanceState, nextAlerts: FleetGovernanceAlert[]): void {
  if (nextAlerts.length === 0) {
    return;
  }
  state.alerts = [...state.alerts, ...nextAlerts].slice(-ALERT_HISTORY_LIMIT);
}

function evaluateSloStatuses(agents: FleetAgentHealth[], slos: FleetSloDefinition[]): FleetSloEvaluation[] {
  const rows: FleetSloEvaluation[] = [];
  for (const slo of slos) {
    const eligible = agents.filter((agent) => agent.environment === slo.environment && agent.integrityIndex !== null);
    const compliant = eligible.filter((agent) => {
      const value = agent.dimensions[slo.dimension];
      return typeof value === "number" && value >= slo.minimumLevel;
    });
    const complianceRatio = eligible.length > 0 ? compliant.length / eligible.length : 0;
    rows.push({
      sloId: slo.sloId,
      objective: slo.objective,
      environment: slo.environment,
      dimension: slo.dimension,
      minimumLevel: slo.minimumLevel,
      requiredPercent: slo.requiredPercent,
      eligibleAgents: eligible.length,
      compliantAgents: compliant.length,
      complianceRatio: round(complianceRatio, 4),
      status: complianceRatio >= slo.requiredPercent ? "HEALTHY" : "BREACHED"
    });
  }
  rows.sort((a, b) => a.sloId.localeCompare(b.sloId));
  return rows;
}

function evaluateOverallSloStatus(statuses: FleetSloEvaluation[]): FleetSloStatus {
  return statuses.some((row) => row.status === "BREACHED") ? "BREACHED" : "HEALTHY";
}

function driftSeverity(delta: number): FleetAlertSeverity {
  if (delta >= 0.2) return "CRITICAL";
  if (delta >= 0.1) return "WARN";
  return "INFO";
}

function parseGuardrails(path: string): Record<string, unknown> {
  if (!pathExists(path)) {
    return {};
  }
  try {
    const parsed = YAML.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function applyPolicyToGuardrails(workspace: string, agentId: string, policy: FleetGovernancePolicy, environment: FleetEnvironment): string {
  const paths = getAgentPaths(workspace, agentId);
  const existing = parseGuardrails(paths.guardrails);
  const thresholds = isRecord(existing.thresholds) ? { ...existing.thresholds } : {};
  const currentThreshold = typeof thresholds.minIntegrityIndex === "number" ? thresholds.minIntegrityIndex : 0;
  thresholds.minIntegrityIndex = round(Math.max(currentThreshold, policy.minimumIntegrityIndex), 4);

  const governanceSection = isRecord(existing.governance) ? { ...existing.governance } : {};
  const mergedGuardrails = { ...governanceSection, ...policy.enforcedGuardrails };

  const next = {
    ...existing,
    thresholds,
    governance: mergedGuardrails,
    fleetPolicy: {
      policyId: policy.policyId,
      description: policy.description,
      environment,
      minimumIntegrityIndex: policy.minimumIntegrityIndex,
      minimumDimensionLevel: policy.minimumDimensionLevel,
      updatedTs: policy.updatedTs
    }
  };

  writeFileAtomic(paths.guardrails, YAML.stringify(next), 0o644);
  return paths.guardrails;
}

function renderComplianceMarkdown(health: FleetHealthDashboard, state: FleetGovernanceState): string {
  const policyLines: string[] = [];
  if (state.policies.globalPolicy) {
    policyLines.push(`- Global: ${state.policies.globalPolicy.policyId} (minIntegrity=${state.policies.globalPolicy.minimumIntegrityIndex.toFixed(3)})`);
  } else {
    policyLines.push("- Global: none");
  }
  for (const env of ["development", "staging", "production"] as FleetEnvironment[]) {
    const policy = state.policies.byEnvironment[env];
    if (policy) {
      policyLines.push(`- ${env}: ${policy.policyId} (minIntegrity=${policy.minimumIntegrityIndex.toFixed(3)})`);
    }
  }

  const agentRows = health.agents
    .map((agent) => {
      const integrity = agent.integrityIndex === null ? "-" : agent.integrityIndex.toFixed(3);
      const overall = agent.overallLevel === null ? "-" : agent.overallLevel.toFixed(2);
      const dim2 = agent.dimensions[2] === null ? "-" : agent.dimensions[2]!.toFixed(2);
      const drift = agent.belowBaseline ? "yes" : "no";
      return `| ${agent.agentId} | ${agent.environment} | ${integrity} | ${overall} | ${dim2} | ${agent.trustLabel} | ${drift} |`;
    })
    .join("\n");

  const sloRows =
    health.sloStatuses.length === 0
      ? "- none"
      : health.sloStatuses
          .map(
            (row) =>
              `- ${row.sloId}: ${row.status} (${(row.complianceRatio * 100).toFixed(1)}% >= ${(row.requiredPercent * 100).toFixed(
                1
              )}% target, env=${row.environment}, dim=${row.dimension}, L${row.minimumLevel}+)`
          )
          .join("\n");

  const alerts =
    health.alerts.length === 0
      ? "- none"
      : health.alerts
          .slice(-20)
          .map((alert) => `- [${alert.severity}] ${alert.kind} ${new Date(alert.ts).toISOString()} ${alert.message}`)
          .join("\n");

  return [
    "# AMC Fleet Compliance Report",
    "",
    `- Generated: ${new Date(health.generatedTs).toISOString()}`,
    `- Agents: ${health.agentCount} (scored: ${health.scoredAgentCount})`,
    `- Baseline Integrity Index: ${health.baselineIntegrityIndex.toFixed(3)}`,
    `- Avg Integrity Index: ${health.averageIntegrityIndex.toFixed(3)}`,
    `- Avg Overall Level: ${health.averageOverallLevel.toFixed(2)}`,
    `- Overall SLO Status: ${health.overallSloStatus}`,
    "",
    "## Active Policies",
    ...policyLines,
    "",
    "## Fleet Health",
    "| Agent | Environment | Integrity | Overall | Dimension 2 | Trust Label | Below Baseline |",
    "|---|---|---:|---:|---:|---|---|",
    agentRows || "| - | - | - | - | - | - | - |",
    "",
    "## Fleet SLO Status",
    sloRows,
    "",
    "## Recent Alerts",
    alerts,
    ""
  ].join("\n");
}

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function renderSimplePdf(lines: string[]): Buffer {
  const clipped = lines.map((line) => line.trimEnd()).slice(0, 120);
  const content: string[] = ["BT", "/F1 10 Tf", "36 806 Td"];
  let first = true;
  for (const line of clipped) {
    if (!first) {
      content.push("0 -12 Td");
    }
    first = false;
    const cleaned = line.length > 110 ? `${line.slice(0, 107)}...` : line;
    content.push(`(${escapePdfText(cleaned.length > 0 ? cleaned : " ")}) Tj`);
  }
  content.push("ET");
  const stream = content.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

export function normalizeFleetEnvironment(input: string): FleetEnvironment {
  const key = input.trim().toLowerCase();
  const mapped = ENV_ALIASES[key];
  if (!mapped) {
    throw new Error(`Invalid environment: ${input}. Use dev|staging|production.`);
  }
  return mapped;
}

export function parseFleetSloObjective(objective: string): {
  environment: FleetEnvironment;
  dimension: FleetDimension;
  minimumLevel: number;
  requiredPercent: number;
} {
  const pattern =
    /^\s*(\d+(?:\.\d+)?)%\s+of\s+(development|dev|staging|production|prod)\s+agents\s+must\s+score\s+L([1-5])\+\s+on\s+dimension\s+([1-5])\s*$/i;
  const match = objective.match(pattern);
  if (!match) {
    throw new Error(
      'Invalid SLO objective. Expected format: "95% of production agents must score L3+ on dimension 2".'
    );
  }
  const requiredPercent = clamp(Number.parseFloat(match[1] ?? "0") / 100, 0, 1);
  const environment = normalizeFleetEnvironment(match[2] ?? "development");
  const minimumLevel = clamp(Number.parseInt(match[3] ?? "0", 10), 0, 5);
  const dimension = clamp(Number.parseInt(match[4] ?? "1", 10), 1, 5) as FleetDimension;
  return {
    environment,
    dimension,
    minimumLevel,
    requiredPercent
  };
}

export function defineFleetSlo(params: { workspace: string; objective: string; sloId?: string }): FleetSloDefinition {
  const parsed = parseFleetSloObjective(params.objective);
  const now = Date.now();
  const state = loadGovernanceState(params.workspace);
  const sloId = params.sloId?.trim() || `fleet_slo_${randomUUID().slice(0, 8)}`;
  const existing = state.slos.find((row) => row.sloId === sloId);
  const next: FleetSloDefinition = {
    sloId,
    objective: params.objective.trim(),
    environment: parsed.environment,
    dimension: parsed.dimension,
    minimumLevel: parsed.minimumLevel,
    requiredPercent: parsed.requiredPercent,
    createdTs: existing?.createdTs ?? now,
    updatedTs: now
  };
  const without = state.slos.filter((row) => row.sloId !== sloId);
  without.push(next);
  state.slos = without.sort((a, b) => a.sloId.localeCompare(b.sloId));
  saveGovernanceState(params.workspace, state);
  return next;
}

export function listFleetSlos(workspace: string): FleetSloDefinition[] {
  return loadGovernanceState(workspace).slos;
}

export function listFleetGovernancePolicies(workspace: string): {
  globalPolicy: FleetGovernancePolicy | null;
  byEnvironment: Partial<Record<FleetEnvironment, FleetGovernancePolicy>>;
} {
  const state = loadGovernanceState(workspace);
  return {
    globalPolicy: state.policies.globalPolicy,
    byEnvironment: state.policies.byEnvironment
  };
}

export function tagFleetAgentEnvironment(params: {
  workspace: string;
  agentId: string;
  environment: string;
}): { agentId: string; environment: FleetEnvironment; configPath: string; sigPath: string; appliedPolicyId: string | null } {
  const normalizedEnv = normalizeFleetEnvironment(params.environment);
  const existing = loadAgentConfig(params.workspace, params.agentId);
  const next = {
    ...existing,
    environment: normalizedEnv,
    updatedTs: Date.now()
  } satisfies AgentConfig;

  const saved = saveAgentConfig(params.workspace, next);
  const state = loadGovernanceState(params.workspace);
  const policy = state.policies.byEnvironment[normalizedEnv] ?? state.policies.globalPolicy;
  if (policy) {
    applyPolicyToGuardrails(params.workspace, existing.id, policy, normalizedEnv);
  }
  return {
    agentId: existing.id,
    environment: normalizedEnv,
    configPath: saved.configPath,
    sigPath: saved.sigPath,
    appliedPolicyId: policy?.policyId ?? null
  };
}

export function applyFleetGovernancePolicy(params: {
  workspace: string;
  policyId: string;
  description: string;
  minimumIntegrityIndex?: number;
  minimumDimensionLevel?: Partial<Record<FleetDimension, number>>;
  enforcedGuardrails?: Record<string, unknown>;
  environment?: string;
}): {
  policy: FleetGovernancePolicy;
  environment: FleetEnvironment | "all";
  updatedAgentIds: string[];
  statePath: string;
} {
  const state = loadGovernanceState(params.workspace);
  const environment = params.environment ? normalizeFleetEnvironment(params.environment) : null;
  const policy = normalizePolicy({
    policyId: params.policyId,
    description: params.description,
    minimumIntegrityIndex: params.minimumIntegrityIndex,
    minimumDimensionLevel: params.minimumDimensionLevel,
    enforcedGuardrails: params.enforcedGuardrails,
    updatedTs: Date.now()
  });

  if (environment) {
    state.policies.byEnvironment[environment] = policy;
  } else {
    state.policies.globalPolicy = policy;
  }

  const candidates = listFleetAgentIds(params.workspace);
  const updatedAgentIds: string[] = [];
  for (const agentId of candidates) {
    const agentEnv = getEnvironmentForAgent(params.workspace, agentId);
    if (environment && agentEnv !== environment) {
      continue;
    }
    applyPolicyToGuardrails(params.workspace, agentId, policy, agentEnv);
    updatedAgentIds.push(agentId);
  }

  const statePath = saveGovernanceState(params.workspace, state);
  return {
    policy,
    environment: environment ?? "all",
    updatedAgentIds: updatedAgentIds.sort((a, b) => a.localeCompare(b)),
    statePath
  };
}

export function buildFleetHealthDashboard(params: {
  workspace: string;
  reports?: DiagnosticReport[];
  nowTs?: number;
}): FleetHealthDashboard {
  const nowTs = params.nowTs ?? Date.now();
  const state = loadGovernanceState(params.workspace);
  const reportMap = new Map<string, DiagnosticReport>();
  if (params.reports) {
    for (const report of params.reports) {
      const existing = reportMap.get(report.agentId);
      if (!existing || report.ts > existing.ts) {
        reportMap.set(report.agentId, report);
      }
    }
  }

  const agentIds = new Set<string>(listFleetAgentIds(params.workspace));
  for (const reportAgentId of reportMap.keys()) {
    agentIds.add(reportAgentId);
  }

  const agents: FleetAgentHealth[] = [];
  for (const agentId of [...agentIds].sort((a, b) => a.localeCompare(b))) {
    const report = reportMap.get(agentId) ?? loadLatestReportForAgent(params.workspace, agentId);
    const environment = getEnvironmentForAgent(params.workspace, agentId);
    if (!report) {
      agents.push({
        agentId,
        environment,
        runId: null,
        runTs: null,
        integrityIndex: null,
        overallLevel: null,
        trustLabel: "NO_DATA",
        dimensions: emptyDimensions(),
        belowBaseline: false
      });
      continue;
    }
    agents.push({
      agentId,
      environment,
      runId: report.runId,
      runTs: report.ts,
      integrityIndex: round(report.integrityIndex, 4),
      overallLevel: computeOverallLevel(report),
      trustLabel: report.trustLabel,
      dimensions: {
        1: dimensionLevel(report, 1),
        2: dimensionLevel(report, 2),
        3: dimensionLevel(report, 3),
        4: dimensionLevel(report, 4),
        5: dimensionLevel(report, 5)
      },
      belowBaseline: false
    });
  }

  const scored = agents.filter((agent): agent is FleetAgentHealth & { integrityIndex: number; overallLevel: number } => {
    return typeof agent.integrityIndex === "number" && typeof agent.overallLevel === "number";
  });
  const averageIntegrityIndex =
    scored.length > 0 ? round(scored.reduce((sum, row) => sum + row.integrityIndex, 0) / scored.length, 4) : 0;
  const averageOverallLevel =
    scored.length > 0 ? round(scored.reduce((sum, row) => sum + row.overallLevel, 0) / scored.length, 3) : 0;

  const dimensionAverages: Record<FleetDimension, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };
  for (const dimension of DIMENSIONS) {
    const values = scored
      .map((row) => row.dimensions[dimension])
      .filter((value): value is number => typeof value === "number");
    dimensionAverages[dimension] =
      values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 3) : 0;
  }

  let baselineIntegrityIndex =
    state.baselineIntegrityIndex === null ? averageIntegrityIndex : round(state.baselineIntegrityIndex, 4);
  if (state.baselineIntegrityIndex === null) {
    state.baselineIntegrityIndex = baselineIntegrityIndex;
    state.baselineSetTs = nowTs;
  } else if (averageIntegrityIndex > baselineIntegrityIndex) {
    baselineIntegrityIndex = averageIntegrityIndex;
    state.baselineIntegrityIndex = baselineIntegrityIndex;
  }

  const newAlerts: FleetGovernanceAlert[] = [];
  const refreshedAgents = agents.map((agent) => {
    if (agent.integrityIndex === null) {
      return agent;
    }
    const previous = state.lastScores[agent.agentId];
    const belowBaseline = agent.integrityIndex < baselineIntegrityIndex;
    if (belowBaseline && (previous === undefined || previous >= baselineIntegrityIndex)) {
      const delta = baselineIntegrityIndex - agent.integrityIndex;
      newAlerts.push({
        alertId: `fleet_alert_${randomUUID().slice(0, 10)}`,
        kind: "DRIFT",
        severity: driftSeverity(delta),
        ts: nowTs,
        message: `${agent.agentId} dropped below fleet baseline (${agent.integrityIndex.toFixed(3)} < ${baselineIntegrityIndex.toFixed(3)})`,
        agentId: agent.agentId,
        sloId: null
      });
    }
    state.lastScores[agent.agentId] = agent.integrityIndex;
    return {
      ...agent,
      belowBaseline
    };
  });

  const sloStatuses = evaluateSloStatuses(refreshedAgents, state.slos);
  for (const status of sloStatuses) {
    const previous = state.lastSloStatus[status.sloId];
    if (status.status === "BREACHED" && previous !== "BREACHED") {
      newAlerts.push({
        alertId: `fleet_alert_${randomUUID().slice(0, 10)}`,
        kind: "SLO_BREACH",
        severity: "CRITICAL",
        ts: nowTs,
        message: `${status.sloId} breached (${(status.complianceRatio * 100).toFixed(1)}% < ${(status.requiredPercent * 100).toFixed(1)}%)`,
        agentId: null,
        sloId: status.sloId
      });
    } else if (status.status === "HEALTHY" && previous === "BREACHED") {
      newAlerts.push({
        alertId: `fleet_alert_${randomUUID().slice(0, 10)}`,
        kind: "SLO_RECOVERY",
        severity: "INFO",
        ts: nowTs,
        message: `${status.sloId} recovered (${(status.complianceRatio * 100).toFixed(1)}%)`,
        agentId: null,
        sloId: status.sloId
      });
    }
    state.lastSloStatus[status.sloId] = status.status;
  }

  appendAlerts(state, newAlerts);
  saveGovernanceState(params.workspace, state);

  const trustLabelCounts: Record<string, number> = {
    "HIGH TRUST": 0,
    "LOW TRUST": 0,
    "UNRELIABLE — DO NOT USE FOR CLAIMS": 0,
    NO_DATA: 0
  };
  for (const agent of refreshedAgents) {
    trustLabelCounts[agent.trustLabel] = (trustLabelCounts[agent.trustLabel] ?? 0) + 1;
  }

  return {
    generatedTs: nowTs,
    baselineIntegrityIndex,
    agentCount: refreshedAgents.length,
    scoredAgentCount: scored.length,
    averageIntegrityIndex,
    averageOverallLevel,
    dimensionAverages,
    trustLabelCounts,
    agents: refreshedAgents,
    alerts: state.alerts,
    sloStatuses,
    overallSloStatus: evaluateOverallSloStatus(sloStatuses)
  };
}

export function fleetSloStatus(workspace: string): {
  generatedTs: number;
  overallStatus: FleetSloStatus;
  statuses: FleetSloEvaluation[];
} {
  const health = buildFleetHealthDashboard({ workspace });
  return {
    generatedTs: health.generatedTs,
    overallStatus: health.overallSloStatus,
    statuses: health.sloStatuses
  };
}

export function generateFleetComplianceReport(params: {
  workspace: string;
  outFile: string;
  format: "md" | "pdf";
}): {
  outFile: string;
  format: "md" | "pdf";
  agentCount: number;
  sha256: string;
} {
  const health = buildFleetHealthDashboard({ workspace: params.workspace });
  const state = loadGovernanceState(params.workspace);
  const markdown = renderComplianceMarkdown(health, state);

  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));

  let bytes: Buffer;
  if (params.format === "pdf") {
    const lines = markdown
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").replaceAll("|", " ").trim())
      .filter((line) => line.length > 0);
    bytes = renderSimplePdf(lines);
    writeFileAtomic(outFile, bytes, 0o644);
  } else {
    writeFileAtomic(outFile, `${markdown}\n`, 0o644);
    bytes = Buffer.from(`${markdown}\n`, "utf8");
  }

  return {
    outFile,
    format: params.format,
    agentCount: health.agentCount,
    sha256: sha256Hex(bytes)
  };
}

