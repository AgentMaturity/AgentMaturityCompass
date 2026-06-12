import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import type { DiagnosticReport } from "../types.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { ObservabilityLaneRef } from "./observabilityLane.js";
import { writeTraceFailureIndex, type TraceFailureIndexRef } from "../watch/traceFailureIndex.js";

export interface EpisodeRecord {
  schemaVersion: "2026-05-22";
  episodeId: string;
  runId: string;
  lifecycleRunId: string;
  agentId: string;
  workspace: string;
  source: "cli" | "studio" | "api" | "ci" | "import";
  command: string;
  lifecycleStage: "score.generated" | "org.run.completed" | "org.role.completed" | "import.completed";
  startedAt: string;
  endedAt: string;
  rawTraceRefs: string[];
  distilledEvidenceRefs: Array<{
    kind: "diagnostic-json" | "diagnostic-markdown";
    path: string;
  }>;
  failureClassifications: Array<{
    questionId: string;
    flags: string[];
    finalLevel: number;
  }>;
  evaluations: {
    diagnosticRunId: string;
    status: DiagnosticReport["status"];
    integrityIndex: number;
    evidenceCoverage: number;
    questionCount: number;
  };
  resourceManifestIds: string[];
  receipts: string[];
  observabilityRecords: ObservabilityLaneRef[];
  traceFailureIndexRef?: TraceFailureIndexRef;
}

export interface WriteEpisodeRecordInput {
  workspace: string;
  report: DiagnosticReport;
  source: EpisodeRecord["source"];
  command: string;
  lifecycleStage?: EpisodeRecord["lifecycleStage"];
  resourceManifestIds?: string[];
  receipts?: string[];
  observabilityRecords?: ObservabilityLaneRef[];
}

export interface WriteEpisodeRecordResult {
  episode: EpisodeRecord;
  episodePath: string;
}

export interface EpisodeRecordExportResult {
  episode: EpisodeRecord;
  outputPath: string;
  format: "json" | "markdown";
  redacted: boolean;
}

function uniqueEvidenceEventIds(report: DiagnosticReport): string[] {
  return [...new Set(report.questionScores.flatMap((question) => question.evidenceEventIds))].sort();
}

export function buildEpisodeRecord(input: WriteEpisodeRecordInput): EpisodeRecord {
  const paths = getAgentPaths(input.workspace, input.report.agentId);
  const diagnosticJson = join(paths.runsDir, `${input.report.runId}.json`);
  const diagnosticMarkdown = join(paths.reportsDir, `${input.report.runId}.md`);
  return {
    schemaVersion: "2026-05-22",
    episodeId: `episode-${input.report.runId}`,
    runId: input.report.runId,
    lifecycleRunId: `lifecycle-${input.report.runId}`,
    agentId: input.report.agentId,
    workspace: resolve(input.workspace),
    source: input.source,
    command: input.command,
    lifecycleStage: input.lifecycleStage ?? "score.generated",
    startedAt: new Date(input.report.windowStartTs).toISOString(),
    endedAt: new Date(input.report.windowEndTs).toISOString(),
    rawTraceRefs: uniqueEvidenceEventIds(input.report),
    distilledEvidenceRefs: [
      { kind: "diagnostic-json", path: diagnosticJson },
      { kind: "diagnostic-markdown", path: diagnosticMarkdown }
    ],
    failureClassifications: input.report.questionScores
      .filter((question) => question.flags.length > 0 || question.finalLevel < 3)
      .map((question) => ({
        questionId: question.questionId,
        flags: question.flags,
        finalLevel: question.finalLevel
      })),
    evaluations: {
      diagnosticRunId: input.report.runId,
      status: input.report.status,
      integrityIndex: input.report.integrityIndex,
      evidenceCoverage: input.report.evidenceCoverage,
      questionCount: input.report.questionScores.length
    },
    resourceManifestIds: input.resourceManifestIds ?? [],
    receipts: input.receipts ?? [],
    observabilityRecords: input.observabilityRecords ?? []
  };
}

export function writeEpisodeRecord(input: WriteEpisodeRecordInput): WriteEpisodeRecordResult {
  let episode = buildEpisodeRecord(input);
  if (episode.rawTraceRefs.length > 0 || episode.failureClassifications.length > 0) {
    const traceIndex = writeTraceFailureIndex({
      workspace: input.workspace,
      agentId: input.report.agentId,
      report: input.report,
      episode
    });
    episode = {
      ...episode,
      traceFailureIndexRef: traceIndex.ref
    };
  }
  const episodePath = episodeRecordPath(input.workspace, input.report.agentId, input.report.runId);
  writeFileAtomic(episodePath, `${JSON.stringify(episode, null, 2)}\n`, 0o644);
  return { episode, episodePath };
}

function redactPathForExport(path: string, workspace: string): string {
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) {
    return "$WORKSPACE";
  }
  if (full.startsWith(`${root}/`)) {
    return `$WORKSPACE/${full.slice(root.length + 1)}`;
  }
  return path;
}

export function redactEpisodeRecord(episode: EpisodeRecord): EpisodeRecord {
  return {
    ...episode,
    workspace: "$WORKSPACE",
    distilledEvidenceRefs: episode.distilledEvidenceRefs.map((ref) => ({
      ...ref,
      path: redactPathForExport(ref.path, episode.workspace)
    })),
    traceFailureIndexRef: episode.traceFailureIndexRef
      ? {
          ...episode.traceFailureIndexRef,
          path: redactPathForExport(episode.traceFailureIndexRef.path, episode.workspace)
        }
      : undefined
  };
}

export function episodeRecordsDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "episodes");
}

export function episodeRecordPath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(episodeRecordsDir(workspace, agentId), `${runId}.json`);
}

export function listEpisodeRecords(input: { workspace: string; agentId?: string; limit?: number }): EpisodeRecord[] {
  const dir = episodeRecordsDir(input.workspace, input.agentId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readUtf8(join(dir, entry))) as EpisodeRecord)
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

export function loadEpisodeRecord(input: { workspace: string; selector: string; agentId?: string }): EpisodeRecord {
  const dir = episodeRecordsDir(input.workspace, input.agentId);
  const directRunId = input.selector.startsWith("episode-") ? input.selector.slice("episode-".length) : input.selector;
  const directPath = join(dir, `${directRunId}.json`);
  if (existsSync(directPath)) {
    return JSON.parse(readUtf8(directPath)) as EpisodeRecord;
  }
  const found = listEpisodeRecords({ workspace: input.workspace, agentId: input.agentId })
    .find((episode) => episode.episodeId === input.selector || episode.runId === input.selector || episode.lifecycleRunId === input.selector);
  if (!found) {
    throw new Error(`Episode not found: ${input.selector}`);
  }
  return found;
}

function episodeRecordMarkdown(episode: EpisodeRecord): string {
  return [
    `# AMC Episode ${episode.episodeId}`,
    "",
    `- Run: ${episode.runId}`,
    `- Lifecycle: ${episode.lifecycleRunId}`,
    `- Agent: ${episode.agentId}`,
    `- Command: ${episode.command}`,
    `- Stage: ${episode.lifecycleStage}`,
    `- Started: ${episode.startedAt}`,
    `- Ended: ${episode.endedAt}`,
    `- Status: ${episode.evaluations.status}`,
    `- Integrity index: ${episode.evaluations.integrityIndex}`,
    `- Evidence coverage: ${episode.evaluations.evidenceCoverage}`,
    `- Questions: ${episode.evaluations.questionCount}`,
    `- Raw trace refs: ${episode.rawTraceRefs.length}`,
    `- Failure classifications: ${episode.failureClassifications.length}`,
    `- Enforce resource manifests: ${episode.resourceManifestIds.length}`,
    `- Observability records: ${episode.observabilityRecords.length}`,
    `- Trace failure clusters: ${episode.traceFailureIndexRef?.clusterCount ?? 0}`,
    "",
    "## Distilled Evidence",
    ...episode.distilledEvidenceRefs.map((ref) => `- ${ref.kind}: ${ref.path}`),
    "",
    "## Resource Manifests",
    ...(episode.resourceManifestIds.length > 0 ? episode.resourceManifestIds.map((id) => `- ${id}`) : ["- None"]),
    "",
    "## Observability Records",
    ...(episode.observabilityRecords.length > 0 ? episode.observabilityRecords.map((record) => `- ${record.observabilityId}: ${record.path}`) : ["- None"]),
    "",
    "## Trace Failure Index",
    ...(episode.traceFailureIndexRef
      ? [
          `- ${episode.traceFailureIndexRef.indexId}`,
          `- Entries: ${episode.traceFailureIndexRef.entryCount}`,
          `- Clusters: ${episode.traceFailureIndexRef.clusterCount}`,
          `- Path: ${episode.traceFailureIndexRef.path}`
        ]
      : ["- None"]),
    "",
    "## Failure Classifications",
    ...(episode.failureClassifications.length > 0
      ? episode.failureClassifications.map((failure) => `- ${failure.questionId}: L${failure.finalLevel} ${failure.flags.join(", ")}`)
      : ["- None"]),
    ""
  ].join("\n");
}

export function exportEpisodeRecord(input: {
  workspace: string;
  selector: string;
  outputPath: string;
  format?: "json" | "markdown";
  agentId?: string;
  redacted?: boolean;
}): EpisodeRecordExportResult {
  const loaded = loadEpisodeRecord(input);
  const episode = input.redacted ? redactEpisodeRecord(loaded) : loaded;
  const format = input.format ?? (input.outputPath.endsWith(".md") ? "markdown" : "json");
  const body = format === "markdown"
    ? episodeRecordMarkdown(episode)
    : `${JSON.stringify(episode, null, 2)}\n`;
  writeFileAtomic(resolve(input.outputPath), body, 0o644);
  return { episode, outputPath: resolve(input.outputPath), format, redacted: Boolean(input.redacted) };
}
