import { mean } from "../experiments/stats.js";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import { openLedger } from "../ledger/ledger.js";
import type { EvidenceEvent, EvidenceEventType, TrustTier } from "../types.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import {
  detectEvidenceStreamAnomalies,
  type ObservabilityAnomaly
} from "./anomalyDetector.js";

interface RunReportQuestionScore {
  finalLevel: number;
  evidenceEventIds: string[];
}

interface RunReportLike {
  runId: string;
  ts: number;
  integrityIndex: number;
  trustLabel: string;
  questionScores: RunReportQuestionScore[];
}

interface EvidenceTimelineRow {
  row_id: number;
  id: string;
  ts: number;
  event_type: EvidenceEventType;
  meta_json: string;
}

export interface TimelineScorePoint {
  ts: number;
  runId: string;
  score: number;
  scorePercent: number;
  deltaPercent: number | null;
  integrityIndex: number;
  trustLabel: string;
  linkedEvidenceEventIds: string[];
}

export interface TimelineEvidencePoint {
  ts: number;
  eventId: string;
  eventType: EvidenceEventType;
  trustTier: TrustTier;
  severity: string;
  questionId: string | null;
  dimension: string | null;
}

export interface TimelineEvent {
  ts: number;
  kind: "score_change" | "evidence_event";
  scorePercent?: number;
  deltaPercent?: number | null;
  runId?: string;
  integrityIndex?: number;
  trustLabel?: string;
  eventId?: string;
  eventType?: EvidenceEventType;
  trustTier?: TrustTier;
  severity?: string;
  questionId?: string | null;
  dimension?: string | null;
}

export interface AgentTimelineData {
  agentId: string;
  generatedTs: number;
  scoreSeries: TimelineScorePoint[];
  evidenceSeries: TimelineEvidencePoint[];
  timeline: TimelineEvent[];
  anomalies: ObservabilityAnomaly[];
  summary: {
    runCount: number;
    evidenceCount: number;
    startTs: number | null;
    endTs: number | null;
  };
}

export interface BuildAgentTimelineOptions {
  workspace: string;
  agentId: string;
  maxRuns?: number;
  maxEvidenceEvents?: number;
}

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    return JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getString(meta: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeTrustTier(meta: Record<string, unknown>, eventType: EvidenceEventType): TrustTier {
  const trustTier = meta.trustTier;
  if (
    trustTier === "OBSERVED" ||
    trustTier === "OBSERVED_HARDENED" ||
    trustTier === "ATTESTED" ||
    trustTier === "SELF_REPORTED"
  ) {
    return trustTier;
  }
  return eventType === "review" ? "SELF_REPORTED" : "OBSERVED";
}

function normalizeSeverity(meta: Record<string, unknown>, eventType: EvidenceEventType): string {
  const severity = getString(meta, ["severity"]);
  if (severity) return severity.toUpperCase();
  if (eventType === "stderr" || eventType === "agent_stderr") return "HIGH";
  return "INFO";
}

function normalizeAgent(meta: Record<string, unknown>): string | null {
  return getString(meta, ["agentId", "agent_id"]);
}

function average(values: number[]): number {
  return mean(values);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function parseRunReport(value: unknown, fallbackRunId: string): RunReportLike | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const runId = typeof obj.runId === "string" && obj.runId.length > 0 ? obj.runId : fallbackRunId;
  const ts = typeof obj.ts === "number" && Number.isFinite(obj.ts) ? obj.ts : null;
  if (ts === null) return null;
  const integrityIndex = typeof obj.integrityIndex === "number" && Number.isFinite(obj.integrityIndex)
    ? obj.integrityIndex
    : 0;
  const trustLabel = typeof obj.trustLabel === "string" ? obj.trustLabel : "UNKNOWN";
  const rawQuestionScores = Array.isArray(obj.questionScores) ? obj.questionScores : [];
  const questionScores: RunReportQuestionScore[] = [];

  for (const raw of rawQuestionScores) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const finalLevel = typeof row.finalLevel === "number" && Number.isFinite(row.finalLevel) ? row.finalLevel : 0;
    const evidenceEventIds = Array.isArray(row.evidenceEventIds)
      ? row.evidenceEventIds
        .filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
    questionScores.push({
      finalLevel,
      evidenceEventIds
    });
  }

  return {
    runId,
    ts,
    integrityIndex,
    trustLabel,
    questionScores
  };
}

function readRunsForAgent(workspace: string, agentId: string, maxRuns: number): RunReportLike[] {
  const paths = getAgentPaths(workspace, agentId);
  if (!pathExists(paths.runsDir)) {
    return [];
  }
  const files = readdirSync(paths.runsDir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const parsed: RunReportLike[] = [];
  for (const file of files) {
    const full = join(paths.runsDir, file);
    const json = readUtf8(full);
    try {
      const value = JSON.parse(json) as unknown;
      const run = parseRunReport(value, basename(file, ".json"));
      if (run) {
        parsed.push(run);
      }
    } catch {
      // ignore malformed run files
    }
  }

  parsed.sort((a, b) => a.ts - b.ts);
  if (parsed.length > maxRuns) {
    return parsed.slice(parsed.length - maxRuns);
  }
  return parsed;
}

function readEvidenceForAgent(
  workspace: string,
  agentId: string,
  maxEvidenceEvents: number
): TimelineEvidencePoint[] {
  const ledger = openLedger(workspace);
  try {
    const rows = ledger.db
      .prepare(
        `SELECT rowid as row_id, id, ts, event_type, meta_json
         FROM evidence_events
         ORDER BY ts DESC
         LIMIT ?`
      )
      .all(maxEvidenceEvents * 4) as EvidenceTimelineRow[];

    const normalizedAgent = agentId.trim().toLowerCase();
    const filtered = rows
      .map((row) => {
        const meta = parseMeta(row.meta_json);
        const eventAgent = normalizeAgent(meta)?.toLowerCase() ?? "unknown";
        const matchesAgent = eventAgent === normalizedAgent || (normalizedAgent === "default" && eventAgent === "unknown");
        if (!matchesAgent) return null;
        return {
          ts: row.ts,
          eventId: row.id,
          eventType: row.event_type,
          trustTier: normalizeTrustTier(meta, row.event_type),
          severity: normalizeSeverity(meta, row.event_type),
          questionId: getString(meta, ["questionId", "question_id"]),
          dimension: getString(meta, ["dimension", "dimensionId", "dimension_id"])
        } as TimelineEvidencePoint;
      })
      .filter((row): row is TimelineEvidencePoint => row !== null)
      .sort((a, b) => a.ts - b.ts);

    if (filtered.length > maxEvidenceEvents) {
      return filtered.slice(filtered.length - maxEvidenceEvents);
    }
    return filtered;
  } finally {
    ledger.close();
  }
}

function buildScoreSeries(runs: RunReportLike[], evidenceLookup: Set<string>): TimelineScorePoint[] {
  const out: TimelineScorePoint[] = [];
  let previousPercent: number | null = null;
  for (const run of runs) {
    const levels = run.questionScores.map((score) => score.finalLevel);
    const avgLevel = average(levels);
    const scorePercent = Number((avgLevel * 20).toFixed(2));
    const evidenceIds = dedupeStrings(
      run.questionScores.flatMap((score) => score.evidenceEventIds)
    ).filter((eventId) => evidenceLookup.has(eventId));
    out.push({
      ts: run.ts,
      runId: run.runId,
      score: Number(avgLevel.toFixed(4)),
      scorePercent,
      deltaPercent: previousPercent === null ? null : Number((scorePercent - previousPercent).toFixed(2)),
      integrityIndex: Number(run.integrityIndex.toFixed(4)),
      trustLabel: run.trustLabel,
      linkedEvidenceEventIds: evidenceIds
    });
    previousPercent = scorePercent;
  }
  return out;
}

function mergeTimeline(scoreSeries: TimelineScorePoint[], evidenceSeries: TimelineEvidencePoint[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...scoreSeries.map((point) => ({
      ts: point.ts,
      kind: "score_change" as const,
      scorePercent: point.scorePercent,
      deltaPercent: point.deltaPercent,
      runId: point.runId,
      integrityIndex: point.integrityIndex,
      trustLabel: point.trustLabel
    })),
    ...evidenceSeries.map((event) => ({
      ts: event.ts,
      kind: "evidence_event" as const,
      eventId: event.eventId,
      eventType: event.eventType,
      trustTier: event.trustTier,
      severity: event.severity,
      questionId: event.questionId,
      dimension: event.dimension
    }))
  ];

  return events.sort((a, b) => a.ts - b.ts);
}

export function buildAgentTimelineData(options: BuildAgentTimelineOptions): AgentTimelineData {
  const maxRuns = options.maxRuns ?? 200;
  const maxEvidenceEvents = options.maxEvidenceEvents ?? 1000;
  const runs = readRunsForAgent(options.workspace, options.agentId, maxRuns);
  const evidenceSeries = readEvidenceForAgent(options.workspace, options.agentId, maxEvidenceEvents);
  const evidenceLookup = new Set(evidenceSeries.map((row) => row.eventId));
  const scoreSeries = buildScoreSeries(runs, evidenceLookup);
  const timeline = mergeTimeline(scoreSeries, evidenceSeries);

  const anomalies = detectEvidenceStreamAnomalies({
    evidencePoints: evidenceSeries.map((event) => ({
      ts: event.ts,
      eventId: event.eventId,
      eventType: event.eventType,
      trustTier: event.trustTier
    })),
    scorePoints: scoreSeries.map((point) => ({
      ts: point.ts,
      score: point.scorePercent,
      runId: point.runId
    }))
  });

  const startTs = timeline.length > 0 ? timeline[0]!.ts : null;
  const endTs = timeline.length > 0 ? timeline[timeline.length - 1]!.ts : null;
  return {
    agentId: options.agentId,
    generatedTs: Date.now(),
    scoreSeries,
    evidenceSeries,
    timeline,
    anomalies,
    summary: {
      runCount: scoreSeries.length,
      evidenceCount: evidenceSeries.length,
      startTs,
      endTs
    }
  };
}

export function evidenceEventToSignalPoint(event: EvidenceEvent): {
  ts: number;
  eventId: string;
  eventType: EvidenceEventType;
  trustTier: TrustTier;
} {
  const meta = parseMeta(event.meta_json);
  return {
    ts: event.ts,
    eventId: event.id,
    eventType: event.event_type,
    trustTier: normalizeTrustTier(meta, event.event_type)
  };
}
