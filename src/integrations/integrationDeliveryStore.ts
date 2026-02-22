import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import type { WebhookDeliveryReceipt } from "./webhookDelivery.js";

const DEFAULT_MAX_RECEIPTS = 2_000;
const DEFAULT_MAX_DEAD_LETTERS = 1_000;

const integrationDeliveryRecordSchema = z.object({
  recordId: z.string().min(1),
  ts: z.number().int(),
  channelId: z.string().min(1),
  eventName: z.string().min(1),
  agentId: z.string().min(1),
  deliveryId: z.string().min(1),
  sequence: z.number().int().positive(),
  delivered: z.boolean(),
  attempts: z.number().int().nonnegative(),
  httpStatus: z.number().int().nullable(),
  error: z.string().nullable(),
  payloadSha256: z.string().length(64),
  url: z.string().min(1),
  receipt: z.unknown()
});

const integrationDeadLetterSchema = z.object({
  deadLetterId: z.string().min(1),
  ts: z.number().int(),
  channelId: z.string().min(1),
  eventName: z.string().min(1),
  agentId: z.string().min(1),
  deliveryId: z.string().min(1),
  sequence: z.number().int().positive(),
  payloadSha256: z.string().length(64),
  url: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  httpStatus: z.number().int().nullable(),
  error: z.string().nullable(),
  resolved: z.boolean().default(false),
  resolvedTs: z.number().int().nullable().default(null),
  receipt: z.unknown()
});

const integrationDeliveryJournalSchema = z.object({
  v: z.literal(1),
  updatedTs: z.number().int(),
  sequenceByChannel: z.record(z.string(), z.number().int().nonnegative()),
  receipts: z.array(integrationDeliveryRecordSchema),
  deadLetters: z.array(integrationDeadLetterSchema)
});

export type IntegrationDeliveryRecord = z.infer<typeof integrationDeliveryRecordSchema>;
export type IntegrationDeadLetter = z.infer<typeof integrationDeadLetterSchema>;
export type IntegrationDeliveryJournal = z.infer<typeof integrationDeliveryJournalSchema>;

function defaultJournal(): IntegrationDeliveryJournal {
  return {
    v: 1,
    updatedTs: Date.now(),
    sequenceByChannel: {},
    receipts: [],
    deadLetters: []
  };
}

export function integrationDeliveryJournalPath(workspace: string): string {
  return join(workspace, ".amc", "integrations-delivery-journal.json");
}

export function loadIntegrationDeliveryJournal(workspace: string): IntegrationDeliveryJournal {
  const path = integrationDeliveryJournalPath(workspace);
  if (!pathExists(path)) {
    return defaultJournal();
  }
  return integrationDeliveryJournalSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

function saveIntegrationDeliveryJournal(workspace: string, journal: IntegrationDeliveryJournal): string {
  ensureDir(join(workspace, ".amc"));
  const path = integrationDeliveryJournalPath(workspace);
  writeFileAtomic(path, JSON.stringify(integrationDeliveryJournalSchema.parse(journal), null, 2), 0o644);
  return path;
}

export function nextIntegrationChannelSequence(workspace: string, channelId: string): number {
  const journal = loadIntegrationDeliveryJournal(workspace);
  const next = (journal.sequenceByChannel[channelId] ?? 0) + 1;
  journal.sequenceByChannel[channelId] = next;
  journal.updatedTs = Date.now();
  saveIntegrationDeliveryJournal(workspace, journal);
  return next;
}

function terminalAttempt(receipt: WebhookDeliveryReceipt): {
  httpStatus: number | null;
  error: string | null;
} {
  const attempt = receipt.attempts[receipt.attempts.length - 1];
  if (!attempt) {
    return {
      httpStatus: null,
      error: "no-attempts-recorded"
    };
  }
  return {
    httpStatus: attempt.httpStatus,
    error: attempt.error
  };
}

export function recordIntegrationDelivery(params: {
  workspace: string;
  channelId: string;
  eventName: string;
  agentId: string;
  sequence: number;
  payloadSha256: string;
  receipt: WebhookDeliveryReceipt;
  maxReceipts?: number;
}): IntegrationDeliveryRecord {
  const maxReceipts = Number.isFinite(params.maxReceipts)
    ? Math.max(1, Math.floor(params.maxReceipts!))
    : DEFAULT_MAX_RECEIPTS;
  const finalAttempt = terminalAttempt(params.receipt);
  const record: IntegrationDeliveryRecord = {
    recordId: `idr_${randomUUID().replace(/-/g, "")}`,
    ts: Date.now(),
    channelId: params.channelId,
    eventName: params.eventName,
    agentId: params.agentId,
    deliveryId: params.receipt.deliveryId,
    sequence: params.sequence,
    delivered: params.receipt.delivered,
    attempts: params.receipt.attempts.length,
    httpStatus: finalAttempt.httpStatus,
    error: finalAttempt.error,
    payloadSha256: params.payloadSha256,
    url: params.receipt.url,
    receipt: params.receipt
  };

  const journal = loadIntegrationDeliveryJournal(params.workspace);
  journal.receipts.push(record);
  if (journal.receipts.length > maxReceipts) {
    journal.receipts = journal.receipts.slice(journal.receipts.length - maxReceipts);
  }
  journal.updatedTs = Date.now();
  saveIntegrationDeliveryJournal(params.workspace, journal);
  return record;
}

export function addIntegrationDeadLetter(params: {
  workspace: string;
  channelId: string;
  eventName: string;
  agentId: string;
  sequence: number;
  payloadSha256: string;
  receipt: WebhookDeliveryReceipt;
  maxDeadLetters?: number;
}): IntegrationDeadLetter {
  const maxDeadLetters = Number.isFinite(params.maxDeadLetters)
    ? Math.max(1, Math.floor(params.maxDeadLetters!))
    : DEFAULT_MAX_DEAD_LETTERS;
  const finalAttempt = terminalAttempt(params.receipt);
  const entry: IntegrationDeadLetter = {
    deadLetterId: `idl_${randomUUID().replace(/-/g, "")}`,
    ts: Date.now(),
    channelId: params.channelId,
    eventName: params.eventName,
    agentId: params.agentId,
    deliveryId: params.receipt.deliveryId,
    sequence: params.sequence,
    payloadSha256: params.payloadSha256,
    url: params.receipt.url,
    attempts: params.receipt.attempts.length,
    httpStatus: finalAttempt.httpStatus,
    error: finalAttempt.error,
    resolved: false,
    resolvedTs: null,
    receipt: params.receipt
  };

  const journal = loadIntegrationDeliveryJournal(params.workspace);
  journal.deadLetters.push(entry);
  if (journal.deadLetters.length > maxDeadLetters) {
    journal.deadLetters = journal.deadLetters.slice(journal.deadLetters.length - maxDeadLetters);
  }
  journal.updatedTs = Date.now();
  saveIntegrationDeliveryJournal(params.workspace, journal);
  return entry;
}

export function resolveIntegrationDeadLetter(params: {
  workspace: string;
  deadLetterId: string;
}): IntegrationDeadLetter | null {
  const journal = loadIntegrationDeliveryJournal(params.workspace);
  const entry = journal.deadLetters.find((row) => row.deadLetterId === params.deadLetterId);
  if (!entry) {
    return null;
  }
  entry.resolved = true;
  entry.resolvedTs = Date.now();
  journal.updatedTs = Date.now();
  saveIntegrationDeliveryJournal(params.workspace, journal);
  return entry;
}

export function listIntegrationDeliveries(workspace: string, limit = 100): IntegrationDeliveryRecord[] {
  const bounded = Math.max(0, Math.floor(limit));
  const journal = loadIntegrationDeliveryJournal(workspace);
  return journal.receipts
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .slice(0, bounded);
}

export function listIntegrationDeadLetters(params: {
  workspace: string;
  unresolvedOnly?: boolean;
  limit?: number;
}): IntegrationDeadLetter[] {
  const bounded = Math.max(0, Math.floor(params.limit ?? 100));
  const journal = loadIntegrationDeliveryJournal(params.workspace);
  const rows = params.unresolvedOnly === true
    ? journal.deadLetters.filter((row) => !row.resolved)
    : journal.deadLetters;
  return rows
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .slice(0, bounded);
}

export function exportIntegrationDeliveryJournal(params: {
  workspace: string;
  outFile: string;
}): {
  outFile: string;
  receiptCount: number;
  deadLetterCount: number;
} {
  const journal = loadIntegrationDeliveryJournal(params.workspace);
  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  writeFileAtomic(outFile, JSON.stringify(journal, null, 2), 0o644);
  return {
    outFile,
    receiptCount: journal.receipts.length,
    deadLetterCount: journal.deadLetters.length
  };
}
