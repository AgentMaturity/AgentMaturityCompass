import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AMCTraceV1 } from "../correlation/traceSchema.js";
import type { ProductionTrace } from "../agents/traceIngestion.js";
import { getAgentPaths } from "../fleet/paths.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import type { EpisodeRecord } from "../lifecycle/episodeRecord.js";
import type { DiagnosticReport } from "../types.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export type TraceFailureClass =
  | "tool_misuse"
  | "invalid_schema"
  | "refusal_overreach"
  | "hallucinated_claim"
  | "unsafe_action"
  | "latency_timeout"
  | "retrieval_error"
  | "memory_error"
  | "orchestration_dead_end"
  | "policy_violation"
  | "unknown_failure";

export type TraceFailureOutcome = "ok" | "warning" | "error" | "unknown";
export type TraceFailureSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface TraceFailureIndexEntry {
  entryId: string;
  traceId: string;
  runId: string;
  episodeId: string | null;
  lifecycleRunId: string | null;
  agentId: string;
  tool: string | null;
  model: string | null;
  provider: string | null;
  lifecycleStage: string | null;
  timestamp: string;
  outcome: TraceFailureOutcome;
  policyDecision: string | null;
  scoreImpact: number;
  failureClass: TraceFailureClass;
  severity: TraceFailureSeverity;
  reasons: string[];
  evidenceRefs: string[];
  rawTraceRef: string | null;
  redactedSnippet: string;
}

export interface TraceFailureCluster {
  clusterId: string;
  failureClass: TraceFailureClass;
  fingerprint: string;
  count: number;
  severity: TraceFailureSeverity;
  scoreImpact: number;
  agents: string[];
  runs: string[];
  episodes: string[];
  tools: string[];
  models: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  sampleEntryIds: string[];
  sampleEvidenceRefs: string[];
  sampleSnippet: string;
  recommendationIds: string[];
  suggestedRepairInput: {
    failureClass: TraceFailureClass;
    reasons: string[];
    affectedAgents: string[];
    affectedRuns: string[];
  };
}

export interface TraceFailureIndex {
  schemaVersion: "2026-05-22";
  indexId: string;
  workspace: string;
  agentId: string;
  runId: string;
  episodeId: string | null;
  lifecycleRunId: string | null;
  generatedAt: string;
  rawTraceStorage: {
    policy: "separate";
    refsOnly: boolean;
    redacted: boolean;
  };
  entries: TraceFailureIndexEntry[];
  clusters: TraceFailureCluster[];
  summary: {
    entryCount: number;
    clusterCount: number;
    topFailureClass: TraceFailureClass | null;
    totalScoreImpact: number;
    affectedAgents: string[];
  };
  signaturePath: string | null;
}

export interface TraceFailureIndexRef {
  indexId: string;
  path: string;
  clusterCount: number;
  entryCount: number;
}

export interface BuildTraceFailureIndexInput {
  workspace: string;
  agentId?: string;
  report?: DiagnosticReport;
  episode?: EpisodeRecord;
  traces?: Array<AMCTraceV1 | ProductionTrace>;
  runId?: string;
}

const SECRET_RE = /(sk-[a-z0-9_-]{10,}|bearer\s+[a-z0-9._-]{10,}|(?:api|secret|token|key)\s*[:=]\s*[a-z0-9._-]{10,})/gi;

function redactSnippet(text: string, maxChars = 260): string {
  const redacted = text.replace(SECRET_RE, "[REDACTED]");
  return redacted.length > maxChars ? `${redacted.slice(0, maxChars)}...` : redacted;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(SECRET_RE, " secret ")
    .replace(/\b[0-9a-f]{8,}\b/gi, " id ")
    .replace(/\d+/g, " n ")
    .replace(/[^a-z0-9_ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function severityFor(scoreImpact: number): TraceFailureSeverity {
  if (scoreImpact >= 80) return "critical";
  if (scoreImpact >= 55) return "high";
  if (scoreImpact >= 30) return "medium";
  if (scoreImpact > 0) return "low";
  return "info";
}

function classifyFromText(text: string): TraceFailureClass {
  const normalized = normalizeText(text);
  if (/\b(tool|function|api call|permission|scope|argument)\b/.test(normalized)) return "tool_misuse";
  if (/\b(schema|json|parse|validation|invalid|malformed|missing field|required)\b/.test(normalized)) return "invalid_schema";
  if (/\b(refusal|refuse|overreach|cannot help|policy blanket)\b/.test(normalized)) return "refusal_overreach";
  if (/\b(unsupported|hallucinat|fabricat|claim|citation|source)\b/.test(normalized)) return "hallucinated_claim";
  if (/\b(unsafe|delete|drop|transfer|credential|secret|jailbreak|injection)\b/.test(normalized)) return "unsafe_action";
  if (/\b(timeout|latency|slow|deadline|rate limit)\b/.test(normalized)) return "latency_timeout";
  if (/\b(retrieval|rag|vector|search|context missing|not found)\b/.test(normalized)) return "retrieval_error";
  if (/\b(memory|poison|recall|writeback|state)\b/.test(normalized)) return "memory_error";
  if (/\b(orchestrat|loop|dead end|planner|handoff|stuck)\b/.test(normalized)) return "orchestration_dead_end";
  if (/\b(policy|guardrail|approval|ticket|workorder|blocked|denied)\b/.test(normalized)) return "policy_violation";
  return "unknown_failure";
}

export function classifyTraceFailure(input: {
  flags?: string[];
  finalLevel?: number;
  note?: string | null;
  errorMessage?: string | null;
  event?: string | null;
  outcome?: TraceFailureOutcome;
}): TraceFailureClass {
  const text = [
    ...(input.flags ?? []),
    input.note ?? "",
    input.errorMessage ?? "",
    input.event ?? "",
    input.outcome ?? ""
  ].join(" ");
  const classified = classifyFromText(text);
  if (classified !== "unknown_failure") return classified;
  if (typeof input.finalLevel === "number" && input.finalLevel < 3) return "unknown_failure";
  return "unknown_failure";
}

function entryIdFor(parts: string[]): string {
  return `tfi_${sha256Hex(parts.join(":")).slice(0, 16)}`;
}

function scoreImpactFor(finalLevel: number, flags: string[]): number {
  return Math.max(10, Math.min(100, (5 - finalLevel) * 18 + flags.length * 4));
}

function entriesFromReport(report: DiagnosticReport, episode?: EpisodeRecord): TraceFailureIndexEntry[] {
  return report.questionScores
    .filter((question) => question.flags.length > 0 || question.finalLevel < 3)
    .map((question) => {
      const evidenceRefs = question.evidenceEventIds.length > 0 ? question.evidenceEventIds : [`question:${question.questionId}`];
      const reasons = question.flags.length > 0 ? question.flags : [`final level ${question.finalLevel} below production baseline`];
      const failureClass = classifyTraceFailure({ flags: reasons, finalLevel: question.finalLevel, note: question.narrative });
      const scoreImpact = scoreImpactFor(question.finalLevel, question.flags);
      const traceId = evidenceRefs[0] ?? `${report.runId}:${question.questionId}`;
      return {
        entryId: entryIdFor([report.runId, question.questionId, failureClass, traceId]),
        traceId,
        runId: report.runId,
        episodeId: episode?.episodeId ?? `episode-${report.runId}`,
        lifecycleRunId: episode?.lifecycleRunId ?? `lifecycle-${report.runId}`,
        agentId: report.agentId,
        tool: null,
        model: null,
        provider: null,
        lifecycleStage: episode?.lifecycleStage ?? "score.generated",
        timestamp: new Date(report.ts).toISOString(),
        outcome: question.finalLevel < 3 ? "warning" : "unknown",
        policyDecision: question.flags.find((flag) => /blocked|denied|policy|guardrail/i.test(flag)) ?? null,
        scoreImpact,
        failureClass,
        severity: severityFor(scoreImpact),
        reasons,
        evidenceRefs,
        rawTraceRef: traceId,
        redactedSnippet: redactSnippet(question.narrative || reasons.join("; "))
      } satisfies TraceFailureIndexEntry;
    });
}

function isProductionTrace(trace: AMCTraceV1 | ProductionTrace): trace is ProductionTrace {
  return typeof (trace as ProductionTrace).traceId === "string" && "durationMs" in trace;
}

function entriesFromTraces(input: BuildTraceFailureIndexInput, runId: string): TraceFailureIndexEntry[] {
  const traces = input.traces ?? [];
  return traces
    .map((trace): TraceFailureIndexEntry | null => {
      const prod = isProductionTrace(trace);
      const traceId = prod ? trace.traceId : trace.request_id ?? `${trace.agentId}:${trace.ts}:${trace.event}`;
      const agentId = prod ? trace.agentId : trace.agentId;
      const errorMessage = prod ? trace.errorMessage ?? "" : trace.note ?? "";
      const outcome: TraceFailureOutcome = prod
        ? trace.error ? "error" : "ok"
        : /error|fail|denied|blocked|timeout/i.test(trace.note ?? "") ? "warning" : "unknown";
      if (outcome === "ok") {
        return null;
      }
      const failureClass = classifyTraceFailure({
        note: prod ? JSON.stringify({ input: trace.input, output: trace.output, metadata: trace.metadata }) : trace.note,
        errorMessage,
        event: prod ? trace.agentType : trace.event,
        outcome
      });
      const scoreImpact = prod && trace.error ? 70 : outcome === "warning" ? 35 : 15;
      return {
        entryId: entryIdFor([runId, traceId, failureClass]),
        traceId,
        runId,
        episodeId: input.episode?.episodeId ?? null,
        lifecycleRunId: input.episode?.lifecycleRunId ?? null,
        agentId,
        tool: prod ? String(trace.metadata.tool ?? trace.metadata.toolName ?? "") || null : trace.event.includes("tool") ? trace.event : null,
        model: prod ? String(trace.metadata.model ?? "") || null : trace.model ?? null,
        provider: prod ? String(trace.metadata.providerId ?? "") || null : trace.providerId ?? null,
        lifecycleStage: input.episode?.lifecycleStage ?? null,
        timestamp: new Date(prod ? trace.timestamp : trace.ts).toISOString(),
        outcome,
        policyDecision: /blocked|denied/i.test(errorMessage) ? "blocked" : null,
        scoreImpact,
        failureClass,
        severity: severityFor(scoreImpact),
        reasons: [errorMessage || `Trace ${traceId} produced ${outcome}`],
        evidenceRefs: [traceId],
        rawTraceRef: traceId,
        redactedSnippet: redactSnippet(errorMessage || (prod ? JSON.stringify(trace.output) : trace.note ?? trace.event))
      };
    })
    .filter((entry): entry is TraceFailureIndexEntry => Boolean(entry));
}

function clusterFingerprint(entry: TraceFailureIndexEntry): string {
  const reason = normalizeText(entry.reasons[0] ?? entry.redactedSnippet).slice(0, 64);
  return `${entry.failureClass}:${reason || "generic"}`;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim().length > 0)))].sort();
}

function buildClusters(entries: TraceFailureIndexEntry[]): TraceFailureCluster[] {
  const groups = new Map<string, TraceFailureIndexEntry[]>();
  for (const entry of entries) {
    const key = clusterFingerprint(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()]
    .map(([fingerprint, rows]) => {
      const sorted = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const scoreImpact = rows.reduce((sum, row) => sum + row.scoreImpact, 0);
      const topSeverity = rows.reduce((max, row) => Math.max(max, row.scoreImpact), 0);
      const failureClass = rows[0]?.failureClass ?? "unknown_failure";
      return {
        clusterId: `tfcl_${sha256Hex(fingerprint).slice(0, 16)}`,
        failureClass,
        fingerprint,
        count: rows.length,
        severity: severityFor(topSeverity),
        scoreImpact,
        agents: uniqueSorted(rows.map((row) => row.agentId)),
        runs: uniqueSorted(rows.map((row) => row.runId)),
        episodes: uniqueSorted(rows.map((row) => row.episodeId)),
        tools: uniqueSorted(rows.map((row) => row.tool)),
        models: uniqueSorted(rows.map((row) => row.model)),
        firstSeenAt: sorted[0]?.timestamp ?? new Date(0).toISOString(),
        lastSeenAt: sorted[sorted.length - 1]?.timestamp ?? new Date(0).toISOString(),
        sampleEntryIds: rows.slice(0, 5).map((row) => row.entryId),
        sampleEvidenceRefs: uniqueSorted(rows.flatMap((row) => row.evidenceRefs)).slice(0, 8),
        sampleSnippet: rows[0]?.redactedSnippet ?? "",
        recommendationIds: [`repair.${failureClass}`, `score.trace.${failureClass}`],
        suggestedRepairInput: {
          failureClass,
          reasons: uniqueSorted(rows.flatMap((row) => row.reasons)).slice(0, 5),
          affectedAgents: uniqueSorted(rows.map((row) => row.agentId)),
          affectedRuns: uniqueSorted(rows.map((row) => row.runId))
        }
      } satisfies TraceFailureCluster;
    })
    .sort((a, b) => b.scoreImpact - a.scoreImpact || b.count - a.count);
}

export function traceFailureIndexesDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "trace-indexes");
}

export function traceFailureIndexPath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(traceFailureIndexesDir(workspace, agentId), `${runId}.json`);
}

export function buildTraceFailureIndex(input: BuildTraceFailureIndexInput): TraceFailureIndex {
  const workspace = resolve(input.workspace);
  const agentId = input.agentId ?? input.report?.agentId ?? input.episode?.agentId ?? input.traces?.[0]?.agentId ?? "default";
  const runId = input.runId ?? input.report?.runId ?? input.episode?.runId ?? `trace-${Date.now()}`;
  const entries = [
    ...(input.report ? entriesFromReport(input.report, input.episode) : []),
    ...entriesFromTraces(input, runId)
  ];
  const deduped = [...new Map(entries.map((entry) => [entry.entryId, entry])).values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const clusters = buildClusters(deduped);
  return {
    schemaVersion: "2026-05-22",
    indexId: `trace-index-${runId}`,
    workspace,
    agentId,
    runId,
    episodeId: input.episode?.episodeId ?? (input.report ? `episode-${input.report.runId}` : null),
    lifecycleRunId: input.episode?.lifecycleRunId ?? (input.report ? `lifecycle-${input.report.runId}` : null),
    generatedAt: new Date().toISOString(),
    rawTraceStorage: {
      policy: "separate",
      refsOnly: true,
      redacted: true
    },
    entries: deduped,
    clusters,
    summary: {
      entryCount: deduped.length,
      clusterCount: clusters.length,
      topFailureClass: clusters[0]?.failureClass ?? null,
      totalScoreImpact: deduped.reduce((sum, entry) => sum + entry.scoreImpact, 0),
      affectedAgents: uniqueSorted(deduped.map((entry) => entry.agentId))
    },
    signaturePath: null
  };
}

export function writeTraceFailureIndex(input: BuildTraceFailureIndexInput): { index: TraceFailureIndex; path: string; signaturePath: string | null; ref: TraceFailureIndexRef } {
  const index = buildTraceFailureIndex(input);
  const path = traceFailureIndexPath(input.workspace, index.agentId, index.runId);
  writeFileAtomic(path, `${JSON.stringify(index, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace: input.workspace, path, artifactKind: "trace-failure-index" });
  const signedIndex = signed ? { ...index, signaturePath: signed.sigPath } : index;
  if (signed) {
    writeFileAtomic(path, `${JSON.stringify(signedIndex, null, 2)}\n`, 0o644);
    trySignArtifactFile({ workspace: input.workspace, path, artifactKind: "trace-failure-index" });
  }
  return {
    index: signedIndex,
    path,
    signaturePath: signed?.sigPath ?? null,
    ref: {
      indexId: signedIndex.indexId,
      path,
      clusterCount: signedIndex.clusters.length,
      entryCount: signedIndex.entries.length
    }
  };
}

function redactPath(path: string, workspace: string): string {
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

export function redactTraceFailureIndex(index: TraceFailureIndex): TraceFailureIndex {
  return {
    ...index,
    workspace: "$WORKSPACE",
    signaturePath: index.signaturePath ? redactPath(index.signaturePath, index.workspace) : null,
    entries: index.entries.map((entry) => ({
      ...entry,
      rawTraceRef: entry.rawTraceRef ? redactSnippet(entry.rawTraceRef) : null,
      redactedSnippet: redactSnippet(entry.redactedSnippet)
    }))
  };
}

export function listTraceFailureIndexes(input: { workspace: string; agentId?: string; limit?: number; redacted?: boolean }): TraceFailureIndex[] {
  const dir = traceFailureIndexesDir(input.workspace, input.agentId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readUtf8(join(dir, entry))) as TraceFailureIndex)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
    .map((index) => input.redacted ? redactTraceFailureIndex(index) : index);
}

export function loadTraceFailureIndex(input: { workspace: string; selector: string; agentId?: string; redacted?: boolean }): TraceFailureIndex {
  const directRunId = input.selector.startsWith("trace-index-") ? input.selector.slice("trace-index-".length) : input.selector;
  const directPath = traceFailureIndexPath(input.workspace, input.agentId, directRunId);
  if (existsSync(directPath)) {
    const index = JSON.parse(readUtf8(directPath)) as TraceFailureIndex;
    return input.redacted ? redactTraceFailureIndex(index) : index;
  }
  const found = listTraceFailureIndexes({ workspace: input.workspace, agentId: input.agentId })
    .find((index) => index.indexId === input.selector || index.runId === input.selector || index.episodeId === input.selector);
  if (!found) {
    throw new Error(`Trace failure index not found: ${input.selector}`);
  }
  return input.redacted ? redactTraceFailureIndex(found) : found;
}

export function topTraceFailureClusters(input: { workspace: string; agentId?: string; limit?: number; redacted?: boolean }): TraceFailureCluster[] {
  const indexes = listTraceFailureIndexes({ workspace: input.workspace, agentId: input.agentId, limit: 20, redacted: input.redacted });
  const clusters = indexes.flatMap((index) => index.clusters);
  const merged = new Map<string, TraceFailureCluster>();
  for (const cluster of clusters) {
    const existing = merged.get(cluster.fingerprint);
    if (!existing) {
      merged.set(cluster.fingerprint, cluster);
      continue;
    }
    merged.set(cluster.fingerprint, {
      ...existing,
      count: existing.count + cluster.count,
      scoreImpact: existing.scoreImpact + cluster.scoreImpact,
      agents: uniqueSorted([...existing.agents, ...cluster.agents]),
      runs: uniqueSorted([...existing.runs, ...cluster.runs]),
      episodes: uniqueSorted([...existing.episodes, ...cluster.episodes]),
      tools: uniqueSorted([...existing.tools, ...cluster.tools]),
      models: uniqueSorted([...existing.models, ...cluster.models]),
      firstSeenAt: existing.firstSeenAt < cluster.firstSeenAt ? existing.firstSeenAt : cluster.firstSeenAt,
      lastSeenAt: existing.lastSeenAt > cluster.lastSeenAt ? existing.lastSeenAt : cluster.lastSeenAt,
      sampleEntryIds: uniqueSorted([...existing.sampleEntryIds, ...cluster.sampleEntryIds]).slice(0, 5),
      sampleEvidenceRefs: uniqueSorted([...existing.sampleEvidenceRefs, ...cluster.sampleEvidenceRefs]).slice(0, 8)
    });
  }
  return [...merged.values()].sort((a, b) => b.scoreImpact - a.scoreImpact || b.count - a.count).slice(0, input.limit ?? 10);
}
