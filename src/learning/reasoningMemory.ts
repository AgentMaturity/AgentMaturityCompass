import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type EnforceResourceKind } from "../enforce/resourceManifest.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import {
  episodeRecordPath,
  loadEpisodeRecord,
  type EpisodeRecord
} from "../lifecycle/episodeRecord.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

export type ReasoningMemoryLessonType = "success_pattern" | "failure_lesson";
export type ReasoningMemoryPrivacyClass = "public" | "internal" | "restricted";
export type ReasoningMemoryConsumer = "score" | "recommendation" | "fixer" | "studio";
export type ReasoningMemoryStatus = "active" | "merged" | "expired" | "rejected";

export interface ReasoningMemoryEvidenceRef {
  kind: "episode" | "trace-index" | "diagnostic" | "question" | "receipt";
  ref: string;
}

export interface ReasoningMemoryAffectedResource {
  kind: EnforceResourceKind | "unknown";
  id: string | null;
  path: string | null;
}

export interface ReasoningMemoryItem {
  schemaVersion: "2026-05-22";
  memoryId: string;
  agentId: string;
  sourceEpisodeId: string;
  sourceEpisodeIds: string[];
  sourceRunId: string;
  lifecycleRunId: string;
  lessonType: ReasoningMemoryLessonType;
  summary: string;
  evidenceRefs: ReasoningMemoryEvidenceRef[];
  affectedResource: ReasoningMemoryAffectedResource;
  confidence: number;
  privacyClass: ReasoningMemoryPrivacyClass;
  allowedConsumers: ReasoningMemoryConsumer[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  reviewAfter: string;
  status: ReasoningMemoryStatus;
  occurrenceCount: number;
  duplicateOf: string | null;
  fingerprint: string;
  itemSha256: string;
  signaturePath: string | null;
}

export interface ReasoningMemoryGate {
  id: string;
  status: "passed" | "blocked";
  reason: string;
}

export interface ReasoningMemoryWritebackReceipt {
  schemaVersion: "2026-05-22";
  receiptId: string;
  receiptType: "reasoning-memory.writeback";
  agentId: string;
  sourceEpisodeId: string;
  sourceRunId: string;
  lifecycleRunId: string;
  memoryId: string | null;
  decision: "accepted" | "merged" | "rejected";
  reason: string;
  createdAt: string;
  gates: ReasoningMemoryGate[];
  signaturePath: string | null;
}

export interface ReasoningMemoryWritebackResult {
  agentId: string;
  sourceEpisodeId: string;
  items: ReasoningMemoryItem[];
  receipts: ReasoningMemoryWritebackReceipt[];
}

export interface ReasoningMemoryRetrievalResult {
  agentId: string;
  consumer: ReasoningMemoryConsumer;
  query: string | null;
  items: ReasoningMemoryItem[];
  citations: Array<{
    memoryId: string;
    summary: string;
    evidenceRefs: ReasoningMemoryEvidenceRef[];
  }>;
}

const VALID_CONSUMERS: ReasoningMemoryConsumer[] = ["score", "recommendation", "fixer", "studio"];

function reasoningMemoryRoot(workspace: string, agentId: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "memory", "reasoning");
}

function itemsDir(workspace: string, agentId: string): string {
  return join(reasoningMemoryRoot(workspace, agentId), "items");
}

function receiptsDir(workspace: string, agentId: string): string {
  return join(reasoningMemoryRoot(workspace, agentId), "receipts");
}

function itemPath(workspace: string, agentId: string, memoryId: string): string {
  return join(itemsDir(workspace, agentId), `${memoryId}.json`);
}

function receiptPath(workspace: string, agentId: string, receiptId: string): string {
  return join(receiptsDir(workspace, agentId), `${receiptId}.json`);
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizeConsumers(values?: string[] | ReasoningMemoryConsumer[]): ReasoningMemoryConsumer[] {
  const requested = values && values.length > 0 ? values : VALID_CONSUMERS;
  const out = requested
    .map((value) => String(value).trim() as ReasoningMemoryConsumer)
    .filter((value): value is ReasoningMemoryConsumer => VALID_CONSUMERS.includes(value));
  return unique(out).length > 0 ? unique(out) : [...VALID_CONSUMERS];
}

function sanitizeSummary(input: string): string {
  const cleaned = input
    .replace(/sk-[a-z0-9_-]{8,}/gi, "[REDACTED]")
    .replace(/bearer\s+[a-z0-9._-]{8,}/gi, "[REDACTED]")
    .replace(/(api[_-]?key|token|secret)\s*[:=]\s*[a-z0-9._-]{8,}/gi, "$1=[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 420 ? `${cleaned.slice(0, 420)}...` : cleaned;
}

function containsSecret(input: string): boolean {
  return /sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9._-]{8,}|(api[_-]?key|token|secret)\s*[:=]\s*[a-z0-9._-]{8,}/i.test(input);
}

function evidenceRefsForEpisode(episode: EpisodeRecord): ReasoningMemoryEvidenceRef[] {
  const refs: ReasoningMemoryEvidenceRef[] = [
    { kind: "episode", ref: episode.episodeId },
    ...episode.distilledEvidenceRefs.map((ref) => ({ kind: "diagnostic" as const, ref: ref.path })),
    ...episode.failureClassifications.map((failure) => ({ kind: "question" as const, ref: failure.questionId })),
    ...episode.receipts.map((receipt) => ({ kind: "receipt" as const, ref: receipt }))
  ];
  if (episode.traceFailureIndexRef) {
    refs.push({ kind: "trace-index", ref: episode.traceFailureIndexRef.indexId });
  }
  return refs.filter((ref) => ref.ref.trim().length > 0);
}

function affectedResourceForEpisode(episode: EpisodeRecord): ReasoningMemoryAffectedResource {
  const haystack = episode.failureClassifications.flatMap((failure) => failure.flags).join(" ").toLowerCase();
  if (haystack.includes("schema") || haystack.includes("json")) {
    return { kind: "schema", id: null, path: null };
  }
  if (haystack.includes("policy") || haystack.includes("unsafe")) {
    return { kind: "policy", id: null, path: null };
  }
  if (haystack.includes("memory")) {
    return { kind: "memory", id: null, path: null };
  }
  if (haystack.includes("unsupported") || haystack.includes("claim") || haystack.includes("citation")) {
    return { kind: "prompt", id: null, path: null };
  }
  return { kind: "unknown", id: null, path: null };
}

function lessonTypeForEpisode(episode: EpisodeRecord): ReasoningMemoryLessonType {
  return episode.failureClassifications.length > 0 || episode.evaluations.integrityIndex < 0.8
    ? "failure_lesson"
    : "success_pattern";
}

function summaryForEpisode(episode: EpisodeRecord, lessonType: ReasoningMemoryLessonType): string {
  if (lessonType === "success_pattern") {
    return `Run ${episode.runId} completed with ${episode.evaluations.status}, ${round(episode.evaluations.integrityIndex)} integrity, and ${round(episode.evaluations.evidenceCoverage)} evidence coverage. Reuse this as positive context only when future scoring can cite the same episode evidence.`;
  }
  const classes = episode.failureClassifications
    .slice(0, 6)
    .map((failure) => `${failure.questionId}:L${failure.finalLevel}`)
    .join(", ");
  return `Run ${episode.runId} produced ${episode.failureClassifications.length} failure classification(s) (${classes}). Future recommendations and fixer proposals must cite evidence, preserve rollback, and avoid copying raw trace content.`;
}

function fingerprintFor(input: {
  agentId: string;
  lessonType: ReasoningMemoryLessonType;
  summary: string;
  affectedResource: ReasoningMemoryAffectedResource;
  allowedConsumers: ReasoningMemoryConsumer[];
}): string {
  return sha256Hex(canonicalize({
    agentId: input.agentId,
    lessonType: input.lessonType,
    summary: input.summary.toLowerCase(),
    affectedResource: input.affectedResource,
    allowedConsumers: input.allowedConsumers
  }));
}

function itemSha256(item: Omit<ReasoningMemoryItem, "itemSha256" | "signaturePath">): string {
  return sha256Hex(canonicalize(item));
}

function itemHashInput(item: ReasoningMemoryItem): Omit<ReasoningMemoryItem, "itemSha256" | "signaturePath"> {
  const { itemSha256: _itemSha256, signaturePath: _signaturePath, ...rest } = item;
  return rest;
}

function buildCandidate(input: {
  episode: EpisodeRecord;
  summaryOverride?: string;
  allowedConsumers?: ReasoningMemoryConsumer[];
  ttlDays?: number;
  reviewDays?: number;
}): Omit<ReasoningMemoryItem, "itemSha256" | "signaturePath"> {
  const createdAtDate = new Date();
  const createdAt = createdAtDate.toISOString();
  const lessonType = lessonTypeForEpisode(input.episode);
  const summary = sanitizeSummary(input.summaryOverride ?? summaryForEpisode(input.episode, lessonType));
  const allowedConsumers = normalizeConsumers(input.allowedConsumers);
  const affectedResource = affectedResourceForEpisode(input.episode);
  const fingerprint = fingerprintFor({
    agentId: input.episode.agentId,
    lessonType,
    summary,
    affectedResource,
    allowedConsumers
  });
  return {
    schemaVersion: "2026-05-22",
    memoryId: `mem_${fingerprint.slice(0, 16)}`,
    agentId: input.episode.agentId,
    sourceEpisodeId: input.episode.episodeId,
    sourceEpisodeIds: [input.episode.episodeId],
    sourceRunId: input.episode.runId,
    lifecycleRunId: input.episode.lifecycleRunId,
    lessonType,
    summary,
    evidenceRefs: evidenceRefsForEpisode(input.episode),
    affectedResource,
    confidence: round(Math.max(0.1, Math.min(0.95, input.episode.evaluations.evidenceCoverage * 0.6 + input.episode.evaluations.integrityIndex * 0.4))),
    privacyClass: input.episode.rawTraceRefs.length > 0 ? "internal" : "public",
    allowedConsumers,
    createdAt,
    updatedAt: createdAt,
    expiresAt: addDays(createdAtDate, input.ttlDays ?? 90),
    reviewAfter: addDays(createdAtDate, input.reviewDays ?? 30),
    status: "active",
    occurrenceCount: 1,
    duplicateOf: null,
    fingerprint
  };
}

function gatesForCandidate(input: {
  episode: EpisodeRecord;
  candidate: Omit<ReasoningMemoryItem, "itemSha256" | "signaturePath">;
  originalSummary: string;
}): ReasoningMemoryGate[] {
  const hasEvidence = input.candidate.evidenceRefs.length > 1 || Boolean(input.episode.traceFailureIndexRef);
  const expires = Date.parse(input.candidate.expiresAt) > Date.parse(input.candidate.createdAt);
  const review = Date.parse(input.candidate.reviewAfter) > Date.parse(input.candidate.createdAt);
  const consumersValid = input.candidate.allowedConsumers.length > 0
    && input.candidate.allowedConsumers.every((consumer) => VALID_CONSUMERS.includes(consumer));
  const summaryStillSecret = containsSecret(input.candidate.summary);
  return [
    {
      id: "evidence-required",
      status: hasEvidence ? "passed" : "blocked",
      reason: hasEvidence ? "Source episode has durable evidence references." : "Memory writeback requires source episode evidence."
    },
    {
      id: "redaction-applied",
      status: summaryStillSecret ? "blocked" : "passed",
      reason: input.originalSummary === input.candidate.summary ? "Summary contains no detected secrets." : "Detected secret-like content was redacted before storage."
    },
    {
      id: "expiry-present",
      status: expires && review ? "passed" : "blocked",
      reason: expires && review ? "Memory item has expiry and review timestamps." : "Memory item requires future expiry and review timestamps."
    },
    {
      id: "allowed-consumers-valid",
      status: consumersValid ? "passed" : "blocked",
      reason: consumersValid ? "Allowed consumers are limited to score, recommendation, fixer, and Studio." : "Allowed consumers are missing or unsupported."
    }
  ];
}

function loadItemFile(path: string): ReasoningMemoryItem | null {
  try {
    return JSON.parse(readUtf8(path)) as ReasoningMemoryItem;
  } catch {
    return null;
  }
}

function saveItem(workspace: string, item: ReasoningMemoryItem): ReasoningMemoryItem {
  const agentId = resolveAgentId(workspace, item.agentId);
  ensureDir(itemsDir(workspace, agentId));
  const path = itemPath(workspace, agentId, item.memoryId);
  writeFileAtomic(path, `${JSON.stringify(item, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace, path, artifactKind: "reasoning-memory-item" });
  const signedItem = signed ? { ...item, signaturePath: signed.sigPath } : item;
  if (signed) {
    writeFileAtomic(path, `${JSON.stringify(signedItem, null, 2)}\n`, 0o644);
    trySignArtifactFile({ workspace, path, artifactKind: "reasoning-memory-item" });
  }
  return signedItem;
}

function saveReceipt(workspace: string, receipt: ReasoningMemoryWritebackReceipt): ReasoningMemoryWritebackReceipt {
  const agentId = resolveAgentId(workspace, receipt.agentId);
  ensureDir(receiptsDir(workspace, agentId));
  const path = receiptPath(workspace, agentId, receipt.receiptId);
  writeFileAtomic(path, `${JSON.stringify(receipt, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace, path, artifactKind: "reasoning-memory-receipt" });
  const signedReceipt = signed ? { ...receipt, signaturePath: signed.sigPath } : receipt;
  if (signed) {
    writeFileAtomic(path, `${JSON.stringify(signedReceipt, null, 2)}\n`, 0o644);
    trySignArtifactFile({ workspace, path, artifactKind: "reasoning-memory-receipt" });
  }
  return signedReceipt;
}

function appendReceiptToEpisode(workspace: string, episode: EpisodeRecord, receiptId: string): void {
  const path = episodeRecordPath(workspace, episode.agentId, episode.runId);
  if (!existsSync(path)) return;
  const updated: EpisodeRecord = {
    ...episode,
    receipts: unique([...episode.receipts, receiptId])
  };
  writeFileAtomic(path, `${JSON.stringify(updated, null, 2)}\n`, 0o644);
}

function existingByFingerprint(workspace: string, agentId: string, fingerprint: string): ReasoningMemoryItem | null {
  return listReasoningMemoryItems({ workspace, agentId, includeExpired: true })
    .find((item) => item.fingerprint === fingerprint && item.status !== "expired") ?? null;
}

function receiptFor(input: {
  episode: EpisodeRecord;
  memoryId: string | null;
  decision: ReasoningMemoryWritebackReceipt["decision"];
  reason: string;
  gates: ReasoningMemoryGate[];
}): ReasoningMemoryWritebackReceipt {
  return {
    schemaVersion: "2026-05-22",
    receiptId: `memrec_${sha256Hex(`${input.episode.episodeId}:${input.memoryId ?? "none"}:${randomUUID()}`).slice(0, 16)}`,
    receiptType: "reasoning-memory.writeback",
    agentId: input.episode.agentId,
    sourceEpisodeId: input.episode.episodeId,
    sourceRunId: input.episode.runId,
    lifecycleRunId: input.episode.lifecycleRunId,
    memoryId: input.memoryId,
    decision: input.decision,
    reason: input.reason,
    createdAt: new Date().toISOString(),
    gates: input.gates,
    signaturePath: null
  };
}

export function writeReasoningMemoryFromEpisode(input: {
  workspace: string;
  agentId?: string;
  episodeSelector: string;
  allowedConsumers?: ReasoningMemoryConsumer[];
  ttlDays?: number;
  reviewDays?: number;
  summaryOverride?: string;
}): ReasoningMemoryWritebackResult {
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId ?? "default");
  const episode = loadEpisodeRecord({ workspace, agentId, selector: input.episodeSelector });
  const originalSummary = input.summaryOverride ?? summaryForEpisode(episode, lessonTypeForEpisode(episode));
  const candidateBase = buildCandidate({
    episode,
    summaryOverride: input.summaryOverride,
    allowedConsumers: input.allowedConsumers,
    ttlDays: input.ttlDays,
    reviewDays: input.reviewDays
  });
  const gates = gatesForCandidate({ episode, candidate: candidateBase, originalSummary });
  const blocked = gates.find((gate) => gate.status === "blocked");
  if (blocked) {
    const receipt = saveReceipt(workspace, receiptFor({
      episode,
      memoryId: null,
      decision: "rejected",
      reason: blocked.reason,
      gates
    }));
    appendReceiptToEpisode(workspace, episode, receipt.receiptId);
    return { agentId, sourceEpisodeId: episode.episodeId, items: [], receipts: [receipt] };
  }

  const duplicate = existingByFingerprint(workspace, agentId, candidateBase.fingerprint);
  if (duplicate) {
    const updatedBase: ReasoningMemoryItem = {
      ...duplicate,
      sourceEpisodeIds: unique([...duplicate.sourceEpisodeIds, episode.episodeId]),
      sourceRunId: episode.runId,
      lifecycleRunId: episode.lifecycleRunId,
      updatedAt: new Date().toISOString(),
      status: "active",
      occurrenceCount: duplicate.occurrenceCount + 1,
      duplicateOf: duplicate.memoryId,
      itemSha256: "",
      signaturePath: duplicate.signaturePath
    };
    const item = saveItem(workspace, {
      ...updatedBase,
      itemSha256: itemSha256(itemHashInput(updatedBase))
    });
    const receipt = saveReceipt(workspace, receiptFor({
      episode,
      memoryId: item.memoryId,
      decision: "merged",
      reason: "Duplicate lesson merged into an existing active memory item.",
      gates
    }));
    appendReceiptToEpisode(workspace, episode, receipt.receiptId);
    return { agentId, sourceEpisodeId: episode.episodeId, items: [item], receipts: [receipt] };
  }

  const item = saveItem(workspace, {
    ...candidateBase,
    itemSha256: itemSha256(candidateBase),
    signaturePath: null
  });
  const receipt = saveReceipt(workspace, receiptFor({
    episode,
    memoryId: item.memoryId,
    decision: "accepted",
    reason: "Evidence-backed reasoning memory item accepted after redaction, expiry, and consumer gates.",
    gates
  }));
  appendReceiptToEpisode(workspace, episode, receipt.receiptId);
  return { agentId, sourceEpisodeId: episode.episodeId, items: [item], receipts: [receipt] };
}

export function listReasoningMemoryItems(input: {
  workspace: string;
  agentId?: string;
  includeExpired?: boolean;
  limit?: number;
}): ReasoningMemoryItem[] {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  const dir = itemsDir(input.workspace, agentId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => loadItemFile(join(dir, entry)))
    .filter((item): item is ReasoningMemoryItem => item !== null)
    .filter((item) => input.includeExpired || item.status !== "expired")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

export function listReasoningMemoryReceipts(input: {
  workspace: string;
  agentId?: string;
  limit?: number;
}): ReasoningMemoryWritebackReceipt[] {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  const dir = receiptsDir(input.workspace, agentId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      try {
        return JSON.parse(readUtf8(join(dir, entry))) as ReasoningMemoryWritebackReceipt;
      } catch {
        return null;
      }
    })
    .filter((receipt): receipt is ReasoningMemoryWritebackReceipt => receipt !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

export function loadReasoningMemoryItem(input: {
  workspace: string;
  agentId?: string;
  selector: string;
}): ReasoningMemoryItem {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  const directPath = itemPath(input.workspace, agentId, input.selector);
  if (existsSync(directPath)) {
    const item = loadItemFile(directPath);
    if (item) return item;
  }
  const found = listReasoningMemoryItems({ workspace: input.workspace, agentId, includeExpired: true })
    .find((item) =>
      item.memoryId === input.selector ||
      item.sourceEpisodeId === input.selector ||
      item.sourceEpisodeIds.includes(input.selector) ||
      item.sourceRunId === input.selector ||
      item.lifecycleRunId === input.selector
    );
  if (!found) {
    throw new Error(`Reasoning memory item not found: ${input.selector}`);
  }
  return found;
}

export function expireReasoningMemory(input: {
  workspace: string;
  agentId?: string;
  now?: string;
}): string[] {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  const now = Date.parse(input.now ?? new Date().toISOString());
  const expired: string[] = [];
  for (const item of listReasoningMemoryItems({ workspace: input.workspace, agentId, includeExpired: true })) {
    if (item.status !== "expired" && Date.parse(item.expiresAt) <= now) {
      const updated = {
        ...item,
        status: "expired" as const,
        updatedAt: new Date(now).toISOString()
      };
      saveItem(input.workspace, {
        ...updated,
        itemSha256: itemSha256(itemHashInput(updated))
      });
      expired.push(item.memoryId);
    }
  }
  return expired;
}

export function retrieveReasoningMemory(input: {
  workspace: string;
  agentId?: string;
  consumer: ReasoningMemoryConsumer;
  query?: string;
  limit?: number;
  now?: string;
}): ReasoningMemoryRetrievalResult {
  const agentId = resolveAgentId(input.workspace, input.agentId ?? "default");
  expireReasoningMemory({ workspace: input.workspace, agentId, now: input.now });
  const query = input.query?.trim().toLowerCase() ?? "";
  const items = listReasoningMemoryItems({ workspace: input.workspace, agentId, limit: input.limit ?? 20 })
    .filter((item) => item.allowedConsumers.includes(input.consumer))
    .filter((item) => Date.parse(item.expiresAt) > Date.parse(input.now ?? new Date().toISOString()))
    .filter((item) =>
      query.length === 0 ||
      item.summary.toLowerCase().includes(query) ||
      item.evidenceRefs.some((ref) => ref.ref.toLowerCase().includes(query))
    )
    .slice(0, input.limit ?? 20);
  return {
    agentId,
    consumer: input.consumer,
    query: query.length > 0 ? query : null,
    items,
    citations: items.map((item) => ({
      memoryId: item.memoryId,
      summary: item.summary,
      evidenceRefs: item.evidenceRefs
    }))
  };
}

function redactPath(path: string, workspace: string): string {
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

export function redactReasoningMemoryItem(item: ReasoningMemoryItem, workspace: string): ReasoningMemoryItem {
  return {
    ...item,
    evidenceRefs: item.evidenceRefs.map((ref) => ({
      ...ref,
      ref: ref.ref.startsWith("/") ? redactPath(ref.ref, workspace) : ref.ref
    })),
    affectedResource: {
      ...item.affectedResource,
      path: item.affectedResource.path ? redactPath(item.affectedResource.path, workspace) : null
    },
    signaturePath: item.signaturePath ? redactPath(item.signaturePath, workspace) : null
  };
}
