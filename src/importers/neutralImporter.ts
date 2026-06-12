import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { parseTraceLines, type AMCTraceV1 } from "../correlation/traceSchema.js";
import { writeEnforceResourceManifest, enforceResourceManifestRef, type WriteEnforceResourceManifestResult } from "../enforce/resourceManifest.js";
import { getAgentPaths, normalizeAgentId } from "../fleet/paths.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { writeEpisodeRecord, type WriteEpisodeRecordResult } from "../lifecycle/episodeRecord.js";
import { writeLifecycleRunArtifact, type WriteLifecycleRunArtifactResult } from "../lifecycle/lifecycleRunArtifact.js";
import { appendRuntimeRunEvent } from "../runtime/runManager.js";
import { writeTraceFailureIndex, type TraceFailureIndexRef } from "../watch/traceFailureIndex.js";
import type { ProductionTrace } from "../agents/traceIngestion.js";
import type { DiagnosticReport, QuestionScore } from "../types.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const neutralImportCategorySchema = z.enum([
  "trace-jsonl",
  "event-log",
  "run-directory",
  "workflow-graph",
  "agent-config",
  "memory-store",
  "eval-output",
  "benchmark-result"
]);

export type NeutralImportCategory = z.infer<typeof neutralImportCategorySchema>;
export type NeutralImportMode = "dry-run" | "validate" | "import";
export type NeutralImportStatus = "ready" | "unsupported" | "blocked";

export interface NeutralImportCandidate {
  category: NeutralImportCategory;
  path: string;
  format: "json" | "jsonl" | "yaml";
  digest: string;
  bytes: number;
  recordCount: number;
  confidence: number;
  summary: string;
  redactionCount: number;
}

export interface NeutralImportUnsupported {
  path: string;
  reason: string;
}

export interface NeutralImportPlan {
  schemaVersion: "2026-05-22";
  importId: string;
  workspace: string;
  agentId: string;
  sourcePath: string;
  detectedAt: string;
  status: NeutralImportStatus;
  summary: string;
  candidateCount: number;
  redactionCount: number;
  categories: NeutralImportCategory[];
  candidates: NeutralImportCandidate[];
  unsupported: NeutralImportUnsupported[];
  warnings: string[];
  wouldWrite: string[];
}

export interface NeutralImportRunManifest {
  schemaVersion: "2026-05-22";
  importId: string;
  workspace: string;
  agentId: string;
  sourcePath: string;
  createdAt: string;
  mode: "import";
  plan: NeutralImportPlan;
  normalizedPath: string;
  diagnosticReportPath: string;
  diagnosticMarkdownPath: string;
  episodePath: string | null;
  lifecycleRunPath: string | null;
  resourceManifestPath: string | null;
  traceFailureIndexPath: string | null;
  collaborationTelemetryEvents: NeutralCollaborationTelemetryRef[];
  writtenPaths: string[];
}

export interface NeutralImportResult {
  schemaVersion: "2026-05-22";
  importId: string;
  mode: NeutralImportMode;
  applied: boolean;
  plan: NeutralImportPlan;
  normalizedPath: string | null;
  importManifestPath: string | null;
  signaturePath: string | null;
  diagnosticReportPath: string | null;
  diagnosticMarkdownPath: string | null;
  episode: WriteEpisodeRecordResult | null;
  lifecycleRun: WriteLifecycleRunArtifactResult | null;
  resourceManifest: WriteEnforceResourceManifestResult | null;
  traceFailureIndex: {
    path: string;
    ref: TraceFailureIndexRef;
    signaturePath: string | null;
  } | null;
  collaborationTelemetryEvents: NeutralCollaborationTelemetryRef[];
  writtenPaths: string[];
}

export interface NeutralImportRollbackEntry {
  path: string;
  status: "removed" | "missing" | "skipped";
}

export interface NeutralImportRollbackResult {
  schemaVersion: "2026-05-22";
  importId: string;
  rolledBackAt: string;
  manifestPath: string;
  receiptPath: string;
  removed: NeutralImportRollbackEntry[];
}

interface ParsedCandidate {
  candidate: NeutralImportCandidate;
  redacted: unknown;
  traces: Array<AMCTraceV1 | ProductionTrace>;
  collaborationTelemetry: CollaborationTelemetryCandidate[];
  evidenceRefs: string[];
  flags: string[];
}

interface CollaborationTelemetryCandidate {
  sourcePath: string;
  traceId: string | null;
  stage: string;
  eventType: string;
  participants: string[];
  payload: Record<string, unknown>;
}

export interface NeutralCollaborationTelemetryRef {
  runId: string;
  eventId: string;
  eventPath: string;
  sourcePath: string;
  participants: string[];
}

const SECRET_RE = /(sk-[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._-]{10,}|(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9._-]{8,})/gi;
const MAX_SCAN_FILES = 200;
const MAX_FILE_BYTES = 1_500_000;

function importsRoot(workspace: string): string {
  return join(resolve(workspace), ".amc", "imports");
}

function importRunsDir(workspace: string): string {
  return join(importsRoot(workspace), "runs");
}

function importRunDir(workspace: string, importId: string): string {
  return join(importRunsDir(workspace), importId);
}

function importManifestsDir(workspace: string): string {
  return join(importsRoot(workspace), "manifests");
}

function importManifestPath(workspace: string, importId: string): string {
  return join(importManifestsDir(workspace), `${importId}.json`);
}

function rollbackDir(workspace: string): string {
  return join(importsRoot(workspace), "rollbacks");
}

function workspaceRelative(workspace: string, path: string): string {
  const root = resolve(workspace);
  const full = resolve(path);
  const rel = relative(root, full).replaceAll("\\", "/");
  return rel.length === 0 ? "." : rel;
}

function sourceRelative(sourceRoot: string, path: string): string {
  const root = resolve(sourceRoot);
  const full = resolve(path);
  if (full === root && statSync(full).isFile()) {
    return basename(full);
  }
  const base = statSync(root).isDirectory() ? root : dirname(root);
  const rel = relative(base, full).replaceAll("\\", "/");
  return rel.length === 0 ? basename(full) : rel;
}

function fileFormat(path: string): "json" | "jsonl" | "yaml" | null {
  const ext = extname(path).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".jsonl" || ext === ".ndjson") return "jsonl";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isScalarRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every(isRecord);
}

function lowerKeys(value: Record<string, unknown>): Set<string> {
  return new Set(Object.keys(value).map((key) => key.toLowerCase()));
}

function hasAnyKey(value: Record<string, unknown>, keys: string[]): boolean {
  const lowered = lowerKeys(value);
  return keys.some((key) => lowered.has(key.toLowerCase()));
}

function recordCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) {
    for (const key of ["events", "traces", "runs", "nodes", "memories", "results", "samples", "cases", "entries"]) {
      const nested = value[key];
      if (Array.isArray(nested)) return nested.length;
    }
    return Object.keys(value).length;
  }
  return 1;
}

function redactString(value: string): { value: string; count: number } {
  let count = 0;
  const redacted = value.replace(SECRET_RE, () => {
    count += 1;
    return "[REDACTED]";
  });
  return { value: redacted, count };
}

function redactDeep(value: unknown): { value: unknown; count: number } {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    let count = 0;
    const out = value.map((item) => {
      const redacted = redactDeep(item);
      count += redacted.count;
      return redacted.value;
    });
    return { value: out, count };
  }
  if (isRecord(value)) {
    let count = 0;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const redacted = redactDeep(item);
      count += redacted.count;
      out[key] = redacted.value;
    }
    return { value: out, count };
  }
  return { value, count: 0 };
}

function textHasSecret(text: string): boolean {
  SECRET_RE.lastIndex = 0;
  return SECRET_RE.test(text);
}

function safeJsonParse(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function parseFile(path: string, format: "json" | "jsonl" | "yaml"): unknown {
  const text = readUtf8(path);
  if (format === "jsonl") {
    const rows: unknown[] = [];
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        rows.push(JSON.parse(trimmed) as unknown);
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return rows;
  }
  if (format === "yaml") {
    return YAML.parse(text) as unknown;
  }
  return safeJsonParse(text);
}

function looksLikeTraceRecord(value: Record<string, unknown>): boolean {
  return hasAnyKey(value, ["traceId", "request_id", "amc_trace_v", "spanId", "sessionId"])
    || (hasAnyKey(value, ["input", "output"]) && hasAnyKey(value, ["timestamp", "ts", "durationMs", "error"]));
}

function looksLikeEventLog(value: Record<string, unknown>): boolean {
  return hasAnyKey(value, ["event", "event_type", "type", "timestamp", "ts", "level", "message"]);
}

function looksLikeCollaborationEvent(value: Record<string, unknown>): boolean {
  return hasAnyKey(value, [
    "fromAgent",
    "from_agent",
    "toAgent",
    "to_agent",
    "sourceAgent",
    "targetAgent",
    "participants",
    "handoff",
    "handoffId",
    "sharedStateRef",
    "messageRef",
    "collaborationEvent"
  ]);
}

function detectCategory(path: string, format: "json" | "jsonl" | "yaml", parsed: unknown): NeutralImportCategory | null {
  const lower = basename(path).toLowerCase();
  if (format === "jsonl") {
    if (isScalarRecordArray(parsed) && parsed.some(looksLikeTraceRecord)) return "trace-jsonl";
    if (isScalarRecordArray(parsed) && parsed.some(looksLikeEventLog)) return "event-log";
    if (isScalarRecordArray(parsed) && parsed.some(looksLikeCollaborationEvent)) return "event-log";
  }

  if (Array.isArray(parsed)) {
    const records = parsed.filter(isRecord);
    if (records.some(looksLikeTraceRecord)) return "event-log";
    if (records.some(looksLikeEventLog)) return "event-log";
    if (records.some(looksLikeCollaborationEvent)) return "event-log";
  }

  if (!isRecord(parsed)) return null;
  if (hasAnyKey(parsed, ["collaborationEvents", "handoffs", "handoffEvents", "agentMessages"])) return "event-log";
  if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) return "workflow-graph";
  if (hasAnyKey(parsed, ["workflow", "dag", "graph"]) && (Array.isArray(parsed.steps) || Array.isArray(parsed.nodes))) return "workflow-graph";
  if (hasAnyKey(parsed, ["agent", "agents", "model", "tools", "guardrails", "policies"]) && !Array.isArray(parsed.results)) return "agent-config";
  if (hasAnyKey(parsed, ["memories", "memory", "semanticMemory", "episodicMemory"]) || lower.includes("memory")) return "memory-store";
  if (hasAnyKey(parsed, ["eval", "suite", "tests", "cases", "assertions"]) || (Array.isArray(parsed.results) && lower.includes("eval"))) return "eval-output";
  if (hasAnyKey(parsed, ["benchmark", "metrics", "samples", "latency", "throughput"]) && (lower.includes("bench") || hasAnyKey(parsed, ["benchmark"]))) return "benchmark-result";
  if (hasAnyKey(parsed, ["runId", "runs", "spans", "artifacts"])) return "run-directory";
  if (Array.isArray(parsed.results)) return "eval-output";
  return null;
}

function traceTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function toProductionTrace(row: Record<string, unknown>, fallback: { agentId: string; index: number; source: string }): ProductionTrace {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const error = Boolean(row.error) || typeof row.errorMessage === "string" || /error|failed|timeout|denied|blocked/i.test(String(row.status ?? row.outcome ?? ""));
  return {
    traceId: String(row.traceId ?? row.id ?? row.request_id ?? `${fallback.source}:${fallback.index}`),
    agentId: String(row.agentId ?? row.agent_id ?? fallback.agentId),
    agentType: String(row.agentType ?? row.agent_type ?? row.role ?? "imported-agent"),
    input: row.input ?? row.prompt ?? row.request ?? null,
    output: row.output ?? row.response ?? row.result ?? null,
    durationMs: Number(row.durationMs ?? row.duration_ms ?? row.latencyMs ?? 0),
    timestamp: traceTimestamp(row.timestamp ?? row.ts),
    spanCount: typeof row.spanCount === "number" ? row.spanCount : undefined,
    sessionId: typeof row.sessionId === "string" ? row.sessionId : typeof row.session_id === "string" ? row.session_id : undefined,
    error,
    errorMessage: String(row.errorMessage ?? row.error ?? row.message ?? (error ? row.status ?? "imported trace reported failure" : "")) || undefined,
    metadata: {
      ...metadata,
      tool: row.tool ?? row.toolName ?? metadata.tool,
      model: row.model ?? metadata.model,
      providerId: row.providerId ?? row.provider ?? metadata.providerId
    }
  };
}

function tracesFromCandidate(category: NeutralImportCategory, redacted: unknown, agentId: string, source: string): Array<AMCTraceV1 | ProductionTrace> {
  if (category !== "trace-jsonl" && category !== "event-log" && category !== "run-directory") {
    return [];
  }
  if (Array.isArray(redacted)) {
    return redacted
      .filter(isRecord)
      .map((row, index) => toProductionTrace(row, { agentId, index, source }));
  }
  if (isRecord(redacted)) {
    const rows = [redacted.traces, redacted.events, redacted.runs, redacted.spans]
      .find((value): value is unknown[] => Array.isArray(value));
    if (rows) {
      return rows
        .filter(isRecord)
        .map((row, index) => toProductionTrace(row, { agentId, index, source }));
    }
  }
  return [];
}

function stringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function participantList(row: Record<string, unknown>, fallbackAgentId: string): string[] {
  const participants = new Set<string>();
  const explicit = row.participants;
  if (Array.isArray(explicit)) {
    for (const value of explicit) {
      if (typeof value === "string" && value.trim().length > 0) {
        participants.add(value.trim());
      }
    }
  }
  for (const key of ["fromAgent", "from_agent", "sourceAgent", "source_agent", "toAgent", "to_agent", "targetAgent", "target_agent", "agentId", "agent_id"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      participants.add(value.trim());
    }
  }
  if (participants.size === 0) {
    participants.add(fallbackAgentId);
  }
  return [...participants].sort();
}

function collaborationRows(redacted: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(redacted)) {
    return redacted.filter(isRecord).filter(looksLikeCollaborationEvent);
  }
  if (!isRecord(redacted)) return [];
  const rows = [redacted.collaborationEvents, redacted.handoffs, redacted.handoffEvents, redacted.agentMessages, redacted.events]
    .find((value): value is unknown[] => Array.isArray(value));
  if (rows) {
    return rows.filter(isRecord).filter((row) => looksLikeCollaborationEvent(row) || looksLikeEventLog(row));
  }
  return looksLikeCollaborationEvent(redacted) ? [redacted] : [];
}

function collaborationTelemetryFromCandidate(redacted: unknown, agentId: string, source: string): CollaborationTelemetryCandidate[] {
  return collaborationRows(redacted).map((row, index) => {
    const traceId = stringField(row, ["traceId", "trace_id", "spanId", "span_id", "eventId", "event_id", "handoffId", "handoff_id"]);
    const eventType = stringField(row, ["event", "event_type", "type", "kind", "handoffType", "handoff_type"]) ?? "collaboration.telemetry";
    const stage = stringField(row, ["stage", "phase"]) ?? "collaboration.telemetry";
    const participants = participantList(row, agentId);
    return {
      sourcePath: source,
      traceId: traceId ?? `${source}:collaboration:${index + 1}`,
      stage,
      eventType,
      participants,
      payload: {
        scope: "telemetry-only",
        sourcePath: source,
        eventType,
        participants,
        event: row
      }
    };
  });
}

function amcTracesFromText(path: string, text: string): AMCTraceV1[] {
  if (fileFormat(path) !== "jsonl") return [];
  return parseTraceLines(text);
}

function categorySummary(category: NeutralImportCategory, count: number): string {
  switch (category) {
    case "trace-jsonl": return `${count} trace row(s) ready for Watch failure indexing`;
    case "event-log": return `${count} event row(s) ready for evidence distillation`;
    case "run-directory": return `${count} run artifact(s) ready for lifecycle linkage`;
    case "workflow-graph": return `${count} workflow graph element(s) ready for Enforce manifest tracking`;
    case "agent-config": return `${count} agent config field(s) ready for resource manifest tracking`;
    case "memory-store": return `${count} memory item(s) ready for redacted evidence linkage`;
    case "eval-output": return `${count} evaluator result(s) ready for Score evidence`;
    case "benchmark-result": return `${count} benchmark metric/sample item(s) ready for lifecycle evidence`;
  }
}

function scanFiles(path: string): string[] {
  const root = resolve(path);
  if (!existsSync(root)) {
    throw new Error(`Import path does not exist: ${path}`);
  }
  const stat = statSync(root);
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (files.length >= MAX_SCAN_FILES) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= MAX_SCAN_FILES) return;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files;
}

function parseCandidates(input: { workspace: string; inputPath: string; agentId?: string }): {
  importId: string;
  candidates: ParsedCandidate[];
  unsupported: NeutralImportUnsupported[];
  warnings: string[];
} {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const sourcePath = resolve(input.inputPath);
  const parsedCandidates: ParsedCandidate[] = [];
  const unsupported: NeutralImportUnsupported[] = [];
  const warnings: string[] = [];

  for (const file of scanFiles(sourcePath)) {
    const format = fileFormat(file);
    if (!format) {
      unsupported.push({ path: file, reason: "Add JSON, JSONL, YAML, or NDJSON files for AMC to import this artifact." });
      continue;
    }
    const stat = statSync(file);
    if (stat.size > MAX_FILE_BYTES) {
      unsupported.push({ path: file, reason: `File is larger than ${MAX_FILE_BYTES} bytes; split it into smaller JSON, JSONL, or YAML artifacts.` });
      continue;
    }
    const raw = readFileSync(file);
    const text = raw.toString("utf8");
    let parsed: unknown;
    try {
      parsed = parseFile(file, format);
    } catch (error) {
      unsupported.push({ path: file, reason: `Could not parse ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    const category = detectCategory(file, format, parsed);
    if (!category) {
      unsupported.push({ path: file, reason: "Unsupported shape. Add traces, event logs, run artifacts, workflow graphs, configs, memory stores, evaluator outputs, or benchmark results." });
      continue;
    }
    const redacted = redactDeep(parsed);
    const amcTraces = amcTracesFromText(file, text);
    const traces = amcTraces.length > 0
      ? amcTraces
      : tracesFromCandidate(category, redacted.value, agentId, sourceRelative(sourcePath, file));
    const collaborationTelemetry = collaborationTelemetryFromCandidate(redacted.value, agentId, sourceRelative(sourcePath, file));
    const count = recordCount(parsed);
    const flags = [
      ...(redacted.count > 0 || textHasSecret(text) ? ["redacted sensitive values"] : []),
      ...(category === "eval-output" && canonicalize(parsed).match(/failed|false|timeout|error/i) ? ["eval failures present"] : []),
      ...(category === "trace-jsonl" && traces.some((trace) => "error" in trace && trace.error) ? ["trace failures present"] : []),
      ...(collaborationTelemetry.length > 0 ? ["collaboration telemetry only"] : [])
    ];
    parsedCandidates.push({
      candidate: {
        category,
        path: file,
        format,
        digest: sha256Hex(raw),
        bytes: stat.size,
        recordCount: count,
        confidence: 0.9,
        summary: categorySummary(category, count),
        redactionCount: redacted.count
      },
      redacted: redacted.value,
      traces,
      collaborationTelemetry,
      evidenceRefs: [`import:${sourceRelative(sourcePath, file)}:${sha256Hex(raw).slice(0, 12)}`],
      flags
    });
  }

  if (unsupported.length > 0 && parsedCandidates.length > 0) {
    warnings.push(`${unsupported.length} file(s) were skipped because they were unsupported or malformed.`);
  }
  if (parsedCandidates.some((candidate) => candidate.candidate.redactionCount > 0)) {
    warnings.push("Sensitive-looking values were redacted before persistence.");
  }
  if (parsedCandidates.some((candidate) => candidate.collaborationTelemetry.length > 0)) {
    warnings.push("Collaboration records were mapped to telemetry-only runtime events; no hidden coordination runtime was created.");
  }

  const importSeed = canonicalize({
    sourcePath,
    agentId,
    candidates: parsedCandidates.map((candidate) => ({
      category: candidate.candidate.category,
      digest: candidate.candidate.digest,
      path: sourceRelative(sourcePath, candidate.candidate.path)
    }))
  });
  const importId = `neutral-import-${sha256Hex(importSeed).slice(0, 16)}`;
  return { importId, candidates: parsedCandidates, unsupported, warnings };
}

export function validateNeutralImport(input: {
  workspace: string;
  inputPath: string;
  agentId?: string;
}): NeutralImportPlan {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const sourcePath = resolve(input.inputPath);
  const parsed = parseCandidates({ workspace, inputPath: sourcePath, agentId });
  const candidates = parsed.candidates.map((candidate) => ({
    ...candidate.candidate,
    path: sourceRelative(sourcePath, candidate.candidate.path)
  }));
  const categories = [...new Set(candidates.map((candidate) => candidate.category))].sort() as NeutralImportCategory[];
  const redactionCount = candidates.reduce((sum, candidate) => sum + candidate.redactionCount, 0);
  const status: NeutralImportStatus = candidates.length > 0 ? "ready" : "unsupported";
  const wouldWriteBase = importRunDir(workspace, parsed.importId);
  const hasCollaborationTelemetry = parsed.candidates.some((candidate) => candidate.collaborationTelemetry.length > 0);
  return {
    schemaVersion: "2026-05-22",
    importId: parsed.importId,
    workspace,
    agentId,
    sourcePath,
    detectedAt: new Date().toISOString(),
    status,
    summary: status === "ready"
      ? `Detected ${candidates.length} neutral artifact(s): ${categories.join(", ")}.`
      : "Unsupported import. Add JSON, JSONL, YAML, or NDJSON artifacts with traces, runs, configs, workflow graphs, memory, evaluator, or benchmark data.",
    candidateCount: candidates.length,
    redactionCount,
    categories,
    candidates,
    unsupported: parsed.unsupported.map((entry) => ({ ...entry, path: sourceRelative(sourcePath, entry.path) })),
    warnings: parsed.warnings,
    wouldWrite: [
      join(wouldWriteBase, "normalized.json"),
      importManifestPath(workspace, parsed.importId),
      join(getAgentPaths(workspace, agentId).runsDir, `${parsed.importId}.json`),
      join(getAgentPaths(workspace, agentId).rootDir, "episodes", `${parsed.importId}.json`),
      join(getAgentPaths(workspace, agentId).rootDir, "lifecycle-runs", `${parsed.importId}.json`),
      join(getAgentPaths(workspace, agentId).rootDir, "trace-indexes", `${parsed.importId}.json`),
      ...(hasCollaborationTelemetry ? [join(getAgentPaths(workspace, agentId).rootDir, "runtime-runs", parsed.importId)] : [])
    ].map((path) => workspaceRelative(workspace, path))
  };
}

function buildImportedDiagnosticReport(input: {
  workspace: string;
  agentId: string;
  importId: string;
  plan: NeutralImportPlan;
  parsedCandidates: ParsedCandidate[];
}): DiagnosticReport {
  const ts = Date.now();
  const evidenceCoverage = Math.min(1, input.plan.candidateCount / 6);
  const questionScores: QuestionScore[] = input.parsedCandidates.map((candidate, index) => {
    const flags = candidate.flags;
    const finalLevel = flags.some((flag) => /failure|malformed|unsupported/i.test(flag)) ? 2 : flags.length > 0 ? 3 : 4;
    return {
      questionId: `IMPORT-${index + 1}.${candidate.candidate.category}`,
      claimedLevel: 4,
      supportedMaxLevel: finalLevel,
      finalLevel,
      confidence: candidate.candidate.confidence,
      evidenceEventIds: candidate.evidenceRefs,
      flags,
      narrative: candidate.candidate.summary
    };
  });
  const reportBase: Omit<DiagnosticReport, "reportJsonSha256"> = {
    agentId: input.agentId,
    runId: input.importId,
    ts,
    windowStartTs: ts,
    windowEndTs: ts,
    status: "UNSIGNED",
    verificationPassed: false,
    trustBoundaryViolated: input.plan.redactionCount > 0,
    trustBoundaryMessage: input.plan.redactionCount > 0 ? "Imported artifacts contained sensitive-looking values that were redacted before persistence." : null,
    integrityIndex: input.plan.status === "ready" ? 0.72 : 0.2,
    trustLabel: "DEVELOPING — some evidence, needs more coverage",
    targetProfileId: null,
    layerScores: [
      {
        layerName: "Resilience",
        avgFinalLevel: questionScores.length === 0 ? 0 : questionScores.reduce((sum, row) => sum + row.finalLevel, 0) / questionScores.length,
        confidenceWeightedFinalLevel: questionScores.length === 0 ? 0 : questionScores.reduce((sum, row) => sum + row.finalLevel * row.confidence, 0) / questionScores.length
      }
    ],
    questionScores,
    inflationAttempts: [],
    unsupportedClaimCount: input.plan.unsupported.length,
    contradictionCount: 0,
    correlationRatio: questionScores.length > 0 ? 1 : 0,
    invalidReceiptsCount: 0,
    correlationWarnings: input.plan.warnings,
    evidenceCoverage,
    evidenceTrustCoverage: {
      observed: Number(evidenceCoverage.toFixed(6)),
      attested: 0,
      selfReported: 0
    },
    targetDiff: [],
    prioritizedUpgradeActions: input.plan.unsupported.length > 0
      ? ["Review skipped files and convert them to JSON, JSONL, YAML, or NDJSON with recognized trace, run, graph, config, memory, eval, or benchmark fields."]
      : [],
    evidenceToCollectNext: ["Run a full AMC score after importing to correlate imported evidence with live maturity questions."],
    runSealSig: "unsigned-import",
  };
  return {
    ...reportBase,
    reportJsonSha256: sha256Hex(canonicalize(reportBase))
  };
}

function renderImportedReportMarkdown(report: DiagnosticReport, plan: NeutralImportPlan): string {
  return [
    `# AMC Neutral Import ${plan.importId}`,
    "",
    `- Agent: ${report.agentId}`,
    `- Source: ${plan.sourcePath}`,
    `- Categories: ${plan.categories.join(", ") || "none"}`,
    `- Candidates: ${plan.candidateCount}`,
    `- Redactions: ${plan.redactionCount}`,
    `- Status: ${plan.status}`,
    "",
    "## Imported Artifacts",
    ...plan.candidates.map((candidate) => `- ${candidate.category}: ${candidate.path} (${candidate.recordCount} record(s))`),
    "",
    "## Warnings",
    ...(plan.warnings.length > 0 ? plan.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    ""
  ].join("\n");
}

function normalizedImportBody(input: {
  plan: NeutralImportPlan;
  parsedCandidates: ParsedCandidate[];
}): string {
  const artifacts = input.parsedCandidates.map((candidate) => ({
    category: candidate.candidate.category,
    path: candidate.candidate.path,
    digest: candidate.candidate.digest,
    redactionCount: candidate.candidate.redactionCount,
    recordCount: candidate.candidate.recordCount,
    data: candidate.redacted
  }));
  return `${JSON.stringify({
    schemaVersion: "2026-05-22",
    importId: input.plan.importId,
    createdAt: new Date().toISOString(),
    redactionPolicy: {
      persistedRawPayloads: false,
      redactedBeforeWrite: true
    },
    plan: input.plan,
    artifacts
  }, null, 2)}\n`;
}

function assertReady(plan: NeutralImportPlan): void {
  if (plan.status !== "ready") {
    throw new Error(`Unsupported import: ${plan.summary}`);
  }
}

function writeCollaborationTelemetryRuntimeEvents(input: {
  workspace: string;
  agentId: string;
  runId: string;
  episodeId: string;
  lifecycleRunId: string;
  candidates: ParsedCandidate[];
}): NeutralCollaborationTelemetryRef[] {
  const events = input.candidates.flatMap((candidate) => candidate.collaborationTelemetry);
  return events.map((event) => {
    const written = appendRuntimeRunEvent({
      workspace: input.workspace,
      runId: input.runId,
      agentId: input.agentId,
      episodeId: input.episodeId,
      lifecycleRunId: input.lifecycleRunId,
      source: "watch",
      type: "trace.received",
      stage: event.stage,
      severity: "info",
      message: `Imported telemetry-only collaboration event: ${event.eventType}.`,
      payload: event.payload,
      links: {
        traceId: event.traceId
      },
      createIfMissing: true
    });
    return {
      runId: written.run.runId,
      eventId: written.event.eventId,
      eventPath: written.eventPath,
      sourcePath: event.sourcePath,
      participants: event.participants
    };
  });
}

export function runNeutralImport(input: {
  workspace: string;
  inputPath: string;
  agentId?: string;
  mode?: NeutralImportMode;
}): NeutralImportResult {
  const workspace = resolve(input.workspace);
  const agentId = normalizeAgentId(input.agentId ?? "default");
  const mode = input.mode ?? "dry-run";
  const sourcePath = resolve(input.inputPath);
  const parsed = parseCandidates({ workspace, inputPath: sourcePath, agentId });
  const plan = validateNeutralImport({ workspace, inputPath: sourcePath, agentId });
  if (mode === "dry-run" || mode === "validate") {
    return {
      schemaVersion: "2026-05-22",
      importId: plan.importId,
      mode,
      applied: false,
      plan,
      normalizedPath: null,
      importManifestPath: null,
      signaturePath: null,
      diagnosticReportPath: null,
      diagnosticMarkdownPath: null,
      episode: null,
      lifecycleRun: null,
      resourceManifest: null,
      traceFailureIndex: null,
      collaborationTelemetryEvents: [],
      writtenPaths: []
    };
  }
  assertReady(plan);

  const paths = getAgentPaths(workspace, agentId);
  const runDir = importRunDir(workspace, plan.importId);
  const normalizedPath = join(runDir, "normalized.json");
  const diagnosticReportPath = join(paths.runsDir, `${plan.importId}.json`);
  const diagnosticMarkdownPath = join(paths.reportsDir, `${plan.importId}.md`);
  ensureDir(runDir);

  writeFileAtomic(normalizedPath, normalizedImportBody({ plan, parsedCandidates: parsed.candidates }), 0o600);
  const signature = trySignArtifactFile({ workspace, path: normalizedPath, artifactKind: "neutral-import-artifact" });
  const report = buildImportedDiagnosticReport({
    workspace,
    agentId,
    importId: plan.importId,
    plan,
    parsedCandidates: parsed.candidates
  });
  writeFileAtomic(diagnosticReportPath, `${JSON.stringify(report, null, 2)}\n`, 0o644);
  writeFileAtomic(diagnosticMarkdownPath, renderImportedReportMarkdown(report, plan), 0o644);

  const resourceManifest = writeEnforceResourceManifest({ workspace, agentId });
  const episode = writeEpisodeRecord({
    workspace,
    report,
    source: "import",
    command: `amc import ${sourcePath}`,
    lifecycleStage: "import.completed",
    resourceManifestIds: [resourceManifest.manifest.manifestId]
  });
  const traces = parsed.candidates.flatMap((candidate) => candidate.traces);
  const traceFailureIndex = traces.length > 0
    ? writeTraceFailureIndex({
        workspace,
        agentId,
        traces,
        runId: report.runId,
        episode: episode.episode
      })
    : null;
  const collaborationTelemetryEvents = writeCollaborationTelemetryRuntimeEvents({
    workspace,
    agentId,
    runId: report.runId,
    episodeId: episode.episode.episodeId,
    lifecycleRunId: episode.episode.lifecycleRunId,
    candidates: parsed.candidates
  });
  const lifecycleRun = writeLifecycleRunArtifact({
    workspace,
    report,
    source: "import",
    command: `amc import ${sourcePath}`,
    stage: "import.completed",
    episodeRecords: [{ episodeId: episode.episode.episodeId, path: episode.episodePath }],
    resourceManifests: [enforceResourceManifestRef(resourceManifest)],
    surfaceOverrides: {
      Watch: {
        status: traceFailureIndex ? "complete" : "partial",
        summary: traceFailureIndex
          ? `Imported trace evidence produced ${traceFailureIndex.ref.entryCount} trace failure index entrie(s).`
          : "Imported evidence did not include trace rows.",
        refs: traceFailureIndex ? [traceFailureIndex.ref.indexId] : []
      },
      Enforce: {
        status: "complete",
        summary: "Neutral import artifacts were included in the resource manifest.",
        refs: [resourceManifest.manifest.manifestId]
      }
    }
  });

  const writtenPaths = [
    normalizedPath,
    ...(signature ? [signature.sigPath] : []),
    diagnosticReportPath,
    diagnosticMarkdownPath,
    episode.episodePath,
    ...(episode.episode.traceFailureIndexRef?.path ? [episode.episode.traceFailureIndexRef.path] : []),
    ...(traceFailureIndex ? [traceFailureIndex.path] : []),
    ...(traceFailureIndex?.signaturePath ? [traceFailureIndex.signaturePath] : []),
    ...(collaborationTelemetryEvents.length > 0 ? [join(paths.rootDir, "runtime-runs", report.runId)] : []),
    lifecycleRun.artifactPath,
    ...(lifecycleRun.signaturePath ? [lifecycleRun.signaturePath] : []),
    resourceManifest.manifestPath,
    ...(resourceManifest.manifestSigPath ? [resourceManifest.manifestSigPath] : [])
  ];
  const manifest: NeutralImportRunManifest = {
    schemaVersion: "2026-05-22",
    importId: plan.importId,
    workspace,
    agentId,
    sourcePath,
    createdAt: new Date().toISOString(),
    mode: "import",
    plan,
    normalizedPath,
    diagnosticReportPath,
    diagnosticMarkdownPath,
    episodePath: episode.episodePath,
    lifecycleRunPath: lifecycleRun.artifactPath,
    resourceManifestPath: resourceManifest.manifestPath,
    traceFailureIndexPath: traceFailureIndex?.path ?? null,
    collaborationTelemetryEvents,
    writtenPaths: [...new Set(writtenPaths)]
  };
  const manifestPath = importManifestPath(workspace, plan.importId);
  writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 0o600);

  return {
    schemaVersion: "2026-05-22",
    importId: plan.importId,
    mode,
    applied: true,
    plan,
    normalizedPath,
    importManifestPath: manifestPath,
    signaturePath: signature?.sigPath ?? null,
    diagnosticReportPath,
    diagnosticMarkdownPath,
    episode,
    lifecycleRun,
    resourceManifest,
    traceFailureIndex: traceFailureIndex
      ? { path: traceFailureIndex.path, ref: traceFailureIndex.ref, signaturePath: traceFailureIndex.signaturePath }
      : null,
    collaborationTelemetryEvents,
    writtenPaths: manifest.writtenPaths
  };
}

export function loadNeutralImportManifest(input: { workspace: string; importId: string }): NeutralImportRunManifest {
  const path = importManifestPath(input.workspace, input.importId);
  if (!existsSync(path)) {
    throw new Error(`Neutral import not found: ${input.importId}`);
  }
  return JSON.parse(readUtf8(path)) as NeutralImportRunManifest;
}

export function listNeutralImports(input: { workspace: string; limit?: number }): NeutralImportRunManifest[] {
  const dir = importManifestsDir(input.workspace);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => join(dir, entry))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readUtf8(path)) as NeutralImportRunManifest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

function safeWorkspacePath(workspace: string, path: string): string | null {
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root || full.startsWith(`${root}/`)) return full;
  return null;
}

export function rollbackNeutralImport(input: { workspace: string; importId: string }): NeutralImportRollbackResult {
  const workspace = resolve(input.workspace);
  const manifestPath = importManifestPath(workspace, input.importId);
  const manifest = loadNeutralImportManifest({ workspace, importId: input.importId });
  const paths = [...new Set([...manifest.writtenPaths, manifestPath])].sort((a, b) => b.length - a.length);
  const removed: NeutralImportRollbackEntry[] = [];
  for (const path of paths) {
    const full = safeWorkspacePath(workspace, path);
    if (!full) {
      removed.push({ path, status: "skipped" });
      continue;
    }
    if (!existsSync(full)) {
      removed.push({ path: full, status: "missing" });
      continue;
    }
    rmSync(full, { force: true, recursive: true });
    removed.push({ path: full, status: "removed" });
  }
  const runDir = importRunDir(workspace, input.importId);
  if (existsSync(runDir) && readdirSync(runDir).length === 0) {
    rmSync(runDir, { force: true, recursive: true });
  }
  const receipt: NeutralImportRollbackResult = {
    schemaVersion: "2026-05-22",
    importId: input.importId,
    rolledBackAt: new Date().toISOString(),
    manifestPath,
    receiptPath: join(rollbackDir(workspace), `${input.importId}-${Date.now()}.json`),
    removed
  };
  writeFileAtomic(receipt.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 0o600);
  return receipt;
}
