import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export type RuntimeRunSource = "cli" | "studio" | "api" | "gateway" | "bridge" | "sdk" | "watch" | "fleet" | "firewall";
export type RuntimeRunSeverity = "info" | "low" | "medium" | "high" | "critical";
export type RuntimeRunStatus = "running" | "degraded" | "canceled" | "completed";
export type RuntimeRunEventType =
  | "run.started"
  | "stage.changed"
  | "trace.received"
  | "score.updated"
  | "policy.decision"
  | "alert.raised"
  | "receipt.written"
  | "candidate.proposed"
  | "commit.applied"
  | "rollback.applied"
  | "run.resumed"
  | "run.degraded"
  | "run.canceled"
  | "run.completed";

export interface RuntimeRunEventLinks {
  receiptId: string | null;
  decisionId: string | null;
  policyDecisionId: string | null;
  traceId: string | null;
  candidateId: string | null;
  commitId: string | null;
  rollbackId: string | null;
}

export interface RuntimeRunEvent {
  schemaVersion: "2026-05-22";
  eventId: string;
  runId: string;
  agentId: string;
  episodeId: string | null;
  lifecycleRunId: string | null;
  source: RuntimeRunSource;
  type: RuntimeRunEventType;
  stage: string | null;
  severity: RuntimeRunSeverity;
  createdAt: string;
  message: string;
  payloadRef: string | null;
  payloadSha256: string | null;
  payloadPreview: string | null;
  redacted: boolean;
  links: RuntimeRunEventLinks;
  eventPath: string | null;
  signaturePath: string | null;
}

export interface RuntimeManagedRun {
  schemaVersion: "2026-05-22";
  runId: string;
  agentId: string;
  episodeId: string | null;
  lifecycleRunId: string | null;
  source: RuntimeRunSource;
  status: RuntimeRunStatus;
  currentStage: string;
  severity: RuntimeRunSeverity;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  resumedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  degradedAt: string | null;
  cancelReason: string | null;
  degradedReason: string | null;
  completionReason: string | null;
  eventCount: number;
  alertCount: number;
  policyDecisionCount: number;
  receiptCount: number;
  candidateCount: number;
  redactedEventCount: number;
  lastEventId: string | null;
  lastEventAt: string | null;
  resumeToken: string;
  statePath: string | null;
  signaturePath: string | null;
  eventsDir: string | null;
}

export interface RuntimeRunLifecycleSummary {
  runId: string;
  agentId: string;
  status: RuntimeRunStatus;
  currentStage: string;
  eventCount: number;
  alertCount: number;
  policyDecisionCount: number;
  receiptCount: number;
  latestEventAt: string | null;
  path: string;
}

export interface RuntimeRunInspection {
  run: RuntimeManagedRun;
  events: RuntimeRunEvent[];
}

export interface RuntimeRunWriteResult {
  run: RuntimeManagedRun;
  event: RuntimeRunEvent;
  statePath: string;
  eventPath: string;
  signaturePath: string | null;
}

export interface RuntimeRunExportResult {
  outputPath: string;
  format: "json" | "jsonl";
  redacted: boolean;
  count: number;
}

export interface RuntimeRunAppendInput {
  workspace: string;
  runId: string;
  agentId?: string | null;
  episodeId?: string | null;
  lifecycleRunId?: string | null;
  source: RuntimeRunSource;
  type: RuntimeRunEventType;
  stage?: string | null;
  severity?: RuntimeRunSeverity;
  message?: string;
  payload?: unknown;
  payloadRef?: string | null;
  links?: Partial<RuntimeRunEventLinks>;
  createIfMissing?: boolean;
}

const SECRET_RE = /(sk-[a-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[a-z0-9-]{10,}|api[_-]?key\s*[:=]\s*["']?[^"'\s,}]+)/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CREDIT_CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

const severityRank: Record<RuntimeRunSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

function runtimeRunsRoot(workspace: string, agentId?: string | null): string {
  return join(getAgentPaths(workspace, agentId ?? undefined).rootDir, "runtime-runs");
}

function runtimeRunDir(workspace: string, agentId: string, runId: string): string {
  return join(runtimeRunsRoot(workspace, agentId), runId);
}

export function runtimeRunStatePath(workspace: string, agentId: string, runId: string): string {
  return join(runtimeRunDir(workspace, agentId, runId), "state.json");
}

export function runtimeRunEventsDir(workspace: string, agentId: string, runId: string): string {
  return join(runtimeRunDir(workspace, agentId, runId), "events");
}

function runtimeRunPayloadsDir(workspace: string, agentId: string, runId: string): string {
  return join(runtimeRunDir(workspace, agentId, runId), "payloads");
}

function runtimeRunEventPath(workspace: string, agentId: string, runId: string, eventId: string): string {
  return join(runtimeRunEventsDir(workspace, agentId, runId), `${eventId}.json`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function eventIdFor(type: RuntimeRunEventType): string {
  return `rte_${type.replaceAll(".", "_")}_${randomUUID()}`;
}

function normalizeSource(source: RuntimeRunSource | string | undefined): RuntimeRunSource {
  if (
    source === "cli" ||
    source === "studio" ||
    source === "api" ||
    source === "gateway" ||
    source === "bridge" ||
    source === "sdk" ||
    source === "watch" ||
    source === "fleet" ||
    source === "firewall"
  ) {
    return source;
  }
  return "api";
}

function normalizeSeverity(severity: RuntimeRunSeverity | string | undefined): RuntimeRunSeverity {
  if (severity === "info" || severity === "low" || severity === "medium" || severity === "high" || severity === "critical") {
    return severity;
  }
  return "info";
}

function maxSeverity(a: RuntimeRunSeverity, b: RuntimeRunSeverity): RuntimeRunSeverity {
  return severityRank[b] > severityRank[a] ? b : a;
}

function redacts(text: string): boolean {
  return SECRET_RE.test(text) || EMAIL_RE.test(text) || CREDIT_CARD_RE.test(text) || SSN_RE.test(text);
}

function resetRegex(): void {
  SECRET_RE.lastIndex = 0;
  EMAIL_RE.lastIndex = 0;
  CREDIT_CARD_RE.lastIndex = 0;
  SSN_RE.lastIndex = 0;
}

function redactText(text: string, maxChars = 1200): { text: string; redacted: boolean } {
  resetRegex();
  const hadSensitive = redacts(text);
  resetRegex();
  const redacted = text
    .replace(SECRET_RE, "[REDACTED_SECRET]")
    .replace(CREDIT_CARD_RE, "[REDACTED_CARD]")
    .replace(SSN_RE, "[REDACTED_SSN]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]");
  const truncated = redacted.length > maxChars ? `${redacted.slice(0, maxChars)}...` : redacted;
  return { text: truncated, redacted: hadSensitive || redacted.length > maxChars };
}

function canonicalPayload(payload: unknown): string | null {
  if (payload === undefined || payload === null) {
    return null;
  }
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload, null, 2);
}

function defaultLinks(links?: Partial<RuntimeRunEventLinks>): RuntimeRunEventLinks {
  return {
    receiptId: links?.receiptId ?? null,
    decisionId: links?.decisionId ?? null,
    policyDecisionId: links?.policyDecisionId ?? null,
    traceId: links?.traceId ?? null,
    candidateId: links?.candidateId ?? null,
    commitId: links?.commitId ?? null,
    rollbackId: links?.rollbackId ?? null
  };
}

function eventMessage(type: RuntimeRunEventType, stage?: string | null): string {
  if (type === "stage.changed") return `Stage changed to ${stage ?? "unknown"}.`;
  if (type === "run.started") return "Runtime run started.";
  if (type === "run.resumed") return "Runtime run resumed.";
  if (type === "run.completed") return "Runtime run completed.";
  if (type === "run.canceled") return "Runtime run canceled.";
  if (type === "run.degraded") return "Runtime run marked degraded.";
  return type.replaceAll(".", " ");
}

function relativePathForExport(path: string | null, workspace: string): string | null {
  if (!path) return null;
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

function signState(workspace: string, statePath: string): string | null {
  const signed = trySignArtifactFile({ workspace, path: statePath, artifactKind: "runtime-run-state" });
  return signed?.sigPath ?? null;
}

function signEvent(workspace: string, eventPath: string): string | null {
  const signed = trySignArtifactFile({ workspace, path: eventPath, artifactKind: "runtime-run-event" });
  return signed?.sigPath ?? null;
}

function writeState(workspace: string, run: RuntimeManagedRun): RuntimeManagedRun {
  const statePath = runtimeRunStatePath(workspace, run.agentId, run.runId);
  const withPath: RuntimeManagedRun = {
    ...run,
    statePath,
    eventsDir: runtimeRunEventsDir(workspace, run.agentId, run.runId)
  };
  writeFileAtomic(statePath, `${JSON.stringify(withPath, null, 2)}\n`, 0o644);
  const signaturePath = signState(workspace, statePath);
  const signed: RuntimeManagedRun = { ...withPath, signaturePath };
  writeFileAtomic(statePath, `${JSON.stringify(signed, null, 2)}\n`, 0o644);
  return signed;
}

function buildEvent(input: RuntimeRunAppendInput, run: RuntimeManagedRun): RuntimeRunEvent {
  const payload = canonicalPayload(input.payload);
  const payloadHash = payload === null ? null : sha256Hex(payload);
  const redacted = payload === null ? { text: null as string | null, redacted: false } : redactText(payload);
  const stage = input.stage ?? (input.type === "stage.changed" ? input.stage ?? run.currentStage : run.currentStage);
  return {
    schemaVersion: "2026-05-22",
    eventId: eventIdFor(input.type),
    runId: run.runId,
    agentId: run.agentId,
    episodeId: input.episodeId ?? run.episodeId,
    lifecycleRunId: input.lifecycleRunId ?? run.lifecycleRunId,
    source: normalizeSource(input.source),
    type: input.type,
    stage: stage ?? null,
    severity: normalizeSeverity(input.severity),
    createdAt: nowIso(),
    message: input.message ?? eventMessage(input.type, stage),
    payloadRef: input.payloadRef ?? null,
    payloadSha256: payloadHash,
    payloadPreview: redacted.text,
    redacted: redacted.redacted,
    links: defaultLinks(input.links),
    eventPath: null,
    signaturePath: null
  };
}

function writeEvent(workspace: string, event: RuntimeRunEvent, payload: unknown): RuntimeRunEvent {
  const eventPath = runtimeRunEventPath(workspace, event.agentId, event.runId, event.eventId);
  let payloadRef = event.payloadRef;
  const payloadBody = canonicalPayload(payload);
  if (!payloadRef && payloadBody && payloadBody.length > 1200) {
    const redactedPayload = redactText(payloadBody, 50_000);
    payloadRef = join(runtimeRunPayloadsDir(workspace, event.agentId, event.runId), `${event.eventId}.json`);
    writeFileAtomic(payloadRef, `${redactedPayload.text}\n`, 0o644);
  }
  const withPath: RuntimeRunEvent = {
    ...event,
    payloadRef,
    eventPath
  };
  writeFileAtomic(eventPath, `${JSON.stringify(withPath, null, 2)}\n`, 0o644);
  const signaturePath = signEvent(workspace, eventPath);
  const signed: RuntimeRunEvent = { ...withPath, signaturePath };
  writeFileAtomic(eventPath, `${JSON.stringify(signed, null, 2)}\n`, 0o644);
  return signed;
}

function applyEventToRun(run: RuntimeManagedRun, event: RuntimeRunEvent): RuntimeManagedRun {
  const status: RuntimeRunStatus =
    event.type === "run.completed"
      ? "completed"
      : event.type === "run.canceled"
        ? "canceled"
        : event.type === "run.degraded" || event.type === "alert.raised" && severityRank[event.severity] >= severityRank.high
          ? "degraded"
          : run.status;
  const updatedAt = event.createdAt;
  return {
    ...run,
    status,
    currentStage: event.type === "stage.changed" || event.stage ? event.stage ?? run.currentStage : run.currentStage,
    severity: maxSeverity(run.severity, event.severity),
    updatedAt,
    resumedAt: event.type === "run.resumed" ? updatedAt : run.resumedAt,
    completedAt: event.type === "run.completed" ? updatedAt : run.completedAt,
    canceledAt: event.type === "run.canceled" ? updatedAt : run.canceledAt,
    degradedAt: status === "degraded" && !run.degradedAt ? updatedAt : run.degradedAt,
    cancelReason: event.type === "run.canceled" ? event.message : run.cancelReason,
    degradedReason: event.type === "run.degraded" ? event.message : run.degradedReason,
    completionReason: event.type === "run.completed" ? event.message : run.completionReason,
    eventCount: run.eventCount + 1,
    alertCount: run.alertCount + (event.type === "alert.raised" ? 1 : 0),
    policyDecisionCount: run.policyDecisionCount + (event.type === "policy.decision" ? 1 : 0),
    receiptCount: run.receiptCount + (event.type === "receipt.written" || event.links.receiptId ? 1 : 0),
    candidateCount: run.candidateCount + (event.type === "candidate.proposed" ? 1 : 0),
    redactedEventCount: run.redactedEventCount + (event.redacted ? 1 : 0),
    lastEventId: event.eventId,
    lastEventAt: event.createdAt
  };
}

export function createRuntimeRun(input: {
  workspace: string;
  agentId?: string | null;
  runId?: string;
  episodeId?: string | null;
  lifecycleRunId?: string | null;
  source?: RuntimeRunSource;
  stage?: string;
  message?: string;
}): RuntimeRunWriteResult {
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId ?? undefined);
  const runId = input.runId && input.runId.trim().length > 0 ? input.runId.trim() : `runtime-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const createdAt = nowIso();
  const run: RuntimeManagedRun = {
    schemaVersion: "2026-05-22",
    runId,
    agentId,
    episodeId: input.episodeId ?? null,
    lifecycleRunId: input.lifecycleRunId ?? null,
    source: normalizeSource(input.source ?? "cli"),
    status: "running",
    currentStage: input.stage ?? "created",
    severity: "info",
    createdAt,
    updatedAt: createdAt,
    startedAt: createdAt,
    resumedAt: null,
    completedAt: null,
    canceledAt: null,
    degradedAt: null,
    cancelReason: null,
    degradedReason: null,
    completionReason: null,
    eventCount: 0,
    alertCount: 0,
    policyDecisionCount: 0,
    receiptCount: 0,
    candidateCount: 0,
    redactedEventCount: 0,
    lastEventId: null,
    lastEventAt: null,
    resumeToken: `resume_${sha256Hex(`${runId}:${createdAt}`).slice(0, 24)}`,
    statePath: null,
    signaturePath: null,
    eventsDir: null
  };
  ensureDir(runtimeRunEventsDir(workspace, agentId, runId));
  const startEvent = buildEvent({
    workspace,
    runId,
    agentId,
    episodeId: input.episodeId,
    lifecycleRunId: input.lifecycleRunId,
    source: normalizeSource(input.source ?? "cli"),
    type: "run.started",
    stage: input.stage ?? "created",
    severity: "info",
    message: input.message ?? "Runtime run started."
  }, run);
  const writtenEvent = writeEvent(workspace, startEvent, undefined);
  const updated = writeState(workspace, applyEventToRun(run, writtenEvent));
  return {
    run: updated,
    event: writtenEvent,
    statePath: runtimeRunStatePath(workspace, agentId, runId),
    eventPath: writtenEvent.eventPath!,
    signaturePath: updated.signaturePath
  };
}

export function loadRuntimeRun(input: { workspace: string; runId: string; agentId?: string | null }): RuntimeManagedRun {
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId ?? undefined);
  const direct = runtimeRunStatePath(workspace, agentId, input.runId);
  if (existsSync(direct)) {
    return JSON.parse(readUtf8(direct)) as RuntimeManagedRun;
  }
  const found = listRuntimeRuns({ workspace, agentId, limit: Number.POSITIVE_INFINITY, redacted: false })
    .find((run) => run.runId === input.runId || run.lifecycleRunId === input.runId || run.episodeId === input.runId);
  if (!found) {
    throw new Error(`Runtime run not found: ${input.runId}`);
  }
  return found;
}

export function listRuntimeRuns(input: { workspace: string; agentId?: string | null; limit?: number; redacted?: boolean }): RuntimeManagedRun[] {
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId ?? undefined);
  const root = runtimeRunsRoot(workspace, agentId);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, "state.json"))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readUtf8(path)) as RuntimeManagedRun)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
    .map((run) => input.redacted ? redactRuntimeRun(run, workspace) : run);
}

export function listRuntimeRunEvents(input: {
  workspace: string;
  runId: string;
  agentId?: string | null;
  limit?: number;
  stage?: string | null;
  receiptId?: string | null;
  redacted?: boolean;
}): RuntimeRunEvent[] {
  const workspace = resolve(input.workspace);
  const run = loadRuntimeRun({ workspace, runId: input.runId, agentId: input.agentId });
  const dir = runtimeRunEventsDir(workspace, run.agentId, run.runId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => JSON.parse(readUtf8(join(dir, entry))) as RuntimeRunEvent)
    .filter((event) => !input.stage || event.stage === input.stage)
    .filter((event) => !input.receiptId || event.links.receiptId === input.receiptId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY)
    .map((event) => input.redacted ? redactRuntimeRunEvent(event, workspace) : event);
}

export function appendRuntimeRunEvent(input: RuntimeRunAppendInput): RuntimeRunWriteResult {
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId ?? undefined);
  let run: RuntimeManagedRun;
  try {
    run = loadRuntimeRun({ workspace, runId: input.runId, agentId });
  } catch (error) {
    if (!input.createIfMissing) {
      throw error;
    }
    run = createRuntimeRun({
      workspace,
      agentId,
      runId: input.runId,
      episodeId: input.episodeId,
      lifecycleRunId: input.lifecycleRunId,
      source: input.source,
      stage: input.stage ?? "created",
      message: "Runtime run materialized from first event."
    }).run;
  }
  if (run.status === "completed" || run.status === "canceled") {
    throw new Error(`Runtime run ${run.runId} is ${run.status} and cannot accept new events`);
  }
  const event = buildEvent(input, run);
  const writtenEvent = writeEvent(workspace, event, input.payload);
  const updated = writeState(workspace, applyEventToRun(run, writtenEvent));
  return {
    run: updated,
    event: writtenEvent,
    statePath: runtimeRunStatePath(workspace, run.agentId, run.runId),
    eventPath: writtenEvent.eventPath!,
    signaturePath: updated.signaturePath
  };
}

export function resumeRuntimeRun(input: { workspace: string; runId: string; agentId?: string | null; source?: RuntimeRunSource; stage?: string; message?: string }): RuntimeRunWriteResult {
  const run = loadRuntimeRun(input);
  if (run.status === "completed" || run.status === "canceled") {
    throw new Error(`Runtime run ${run.runId} is ${run.status} and cannot be resumed`);
  }
  return appendRuntimeRunEvent({
    workspace: input.workspace,
    runId: run.runId,
    agentId: run.agentId,
    episodeId: run.episodeId,
    lifecycleRunId: run.lifecycleRunId,
    source: input.source ?? "cli",
    type: "run.resumed",
    stage: input.stage ?? run.currentStage,
    severity: "info",
    message: input.message ?? "Runtime run resumed from persisted state."
  });
}

export function cancelRuntimeRun(input: { workspace: string; runId: string; agentId?: string | null; source?: RuntimeRunSource; reason?: string }): RuntimeRunWriteResult {
  const run = loadRuntimeRun(input);
  return appendRuntimeRunEvent({
    workspace: input.workspace,
    runId: run.runId,
    agentId: run.agentId,
    episodeId: run.episodeId,
    lifecycleRunId: run.lifecycleRunId,
    source: input.source ?? "cli",
    type: "run.canceled",
    stage: run.currentStage,
    severity: "medium",
    message: input.reason ?? "Runtime run canceled by operator."
  });
}

export function markRuntimeRunDegraded(input: { workspace: string; runId: string; agentId?: string | null; source?: RuntimeRunSource; reason?: string }): RuntimeRunWriteResult {
  const run = loadRuntimeRun(input);
  return appendRuntimeRunEvent({
    workspace: input.workspace,
    runId: run.runId,
    agentId: run.agentId,
    episodeId: run.episodeId,
    lifecycleRunId: run.lifecycleRunId,
    source: input.source ?? "cli",
    type: "run.degraded",
    stage: run.currentStage,
    severity: "high",
    message: input.reason ?? "Runtime run marked degraded."
  });
}

export function completeRuntimeRun(input: { workspace: string; runId: string; agentId?: string | null; source?: RuntimeRunSource; reason?: string }): RuntimeRunWriteResult {
  const run = loadRuntimeRun(input);
  return appendRuntimeRunEvent({
    workspace: input.workspace,
    runId: run.runId,
    agentId: run.agentId,
    episodeId: run.episodeId,
    lifecycleRunId: run.lifecycleRunId,
    source: input.source ?? "cli",
    type: "run.completed",
    stage: "completed",
    severity: "info",
    message: input.reason ?? "Runtime run completed."
  });
}

export function inspectRuntimeRun(input: {
  workspace: string;
  runId: string;
  agentId?: string | null;
  includeEvents?: boolean;
  limit?: number;
  redacted?: boolean;
}): RuntimeRunInspection {
  const workspace = resolve(input.workspace);
  const run = loadRuntimeRun({ workspace, runId: input.runId, agentId: input.agentId });
  const events = input.includeEvents === false
    ? []
    : listRuntimeRunEvents({
        workspace,
        runId: run.runId,
        agentId: run.agentId,
        limit: input.limit,
        redacted: input.redacted
      });
  return {
    run: input.redacted ? redactRuntimeRun(run, workspace) : run,
    events
  };
}

export function redactRuntimeRun(run: RuntimeManagedRun, workspace = run.statePath ? resolve(run.statePath, "..", "..", "..") : process.cwd()): RuntimeManagedRun {
  return {
    ...run,
    statePath: relativePathForExport(run.statePath, workspace),
    signaturePath: relativePathForExport(run.signaturePath, workspace),
    eventsDir: relativePathForExport(run.eventsDir, workspace)
  };
}

export function redactRuntimeRunEvent(event: RuntimeRunEvent, workspace = process.cwd()): RuntimeRunEvent {
  return {
    ...event,
    payloadRef: relativePathForExport(event.payloadRef, workspace),
    eventPath: relativePathForExport(event.eventPath, workspace),
    signaturePath: relativePathForExport(event.signaturePath, workspace)
  };
}

export function exportRuntimeRunEvents(input: {
  workspace: string;
  runId: string;
  agentId?: string | null;
  outputPath: string;
  format?: "json" | "jsonl";
  redacted?: boolean;
  limit?: number;
  stage?: string | null;
  receiptId?: string | null;
}): RuntimeRunExportResult {
  const workspace = resolve(input.workspace);
  const events = listRuntimeRunEvents({
    workspace,
    runId: input.runId,
    agentId: input.agentId,
    limit: input.limit,
    stage: input.stage,
    receiptId: input.receiptId,
    redacted: input.redacted ?? true
  });
  const format = input.format ?? (input.outputPath.endsWith(".json") ? "json" : "jsonl");
  const body = format === "json"
    ? `${JSON.stringify({ events, total: events.length }, null, 2)}\n`
    : `${events.map((event) => JSON.stringify(event)).join("\n")}${events.length > 0 ? "\n" : ""}`;
  writeFileAtomic(resolve(workspace, input.outputPath), body, 0o644);
  return {
    outputPath: resolve(workspace, input.outputPath),
    format,
    redacted: input.redacted ?? true,
    count: events.length
  };
}

export function runtimeRunSummaryForLifecycle(input: { workspace: string; agentId?: string | null; runId: string }): RuntimeRunLifecycleSummary[] {
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId ?? undefined);
  try {
    const run = loadRuntimeRun({ workspace, agentId, runId: input.runId });
    return [{
      runId: run.runId,
      agentId: run.agentId,
      status: run.status,
      currentStage: run.currentStage,
      eventCount: run.eventCount,
      alertCount: run.alertCount,
      policyDecisionCount: run.policyDecisionCount,
      receiptCount: run.receiptCount,
      latestEventAt: run.lastEventAt,
      path: run.statePath ?? runtimeRunStatePath(workspace, run.agentId, run.runId)
    }];
  } catch {
    return [];
  }
}

export function runtimeRunStatus(workspace: string, agentId?: string | null): {
  agentId: string;
  total: number;
  running: number;
  degraded: number;
  canceled: number;
  completed: number;
  latest: RuntimeManagedRun | null;
} {
  const resolvedAgent = resolveAgentId(workspace, agentId ?? undefined);
  const runs = listRuntimeRuns({ workspace, agentId: resolvedAgent, redacted: true });
  return {
    agentId: resolvedAgent,
    total: runs.length,
    running: runs.filter((run) => run.status === "running").length,
    degraded: runs.filter((run) => run.status === "degraded").length,
    canceled: runs.filter((run) => run.status === "canceled").length,
    completed: runs.filter((run) => run.status === "completed").length,
    latest: runs[0] ?? null
  };
}
