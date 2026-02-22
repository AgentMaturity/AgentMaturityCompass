import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { ensureDir } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  computeBackoffDelayMs,
  deliverWebhookWithRetry,
  type WebhookDeliveryPolicy,
  type WebhookDeliveryReceipt
} from "./webhookDelivery.js";
import { resolveSecretRef } from "./integrationStore.js";

export type IntegrationChannelType = "webhook" | "slack_webhook";
export type IntegrationQueueState = "PENDING" | "DELIVERED" | "DEAD_LETTER";

export interface IntegrationQueueItemInput {
  channelId: string;
  channelType: IntegrationChannelType;
  eventName: string;
  agentId: string;
  payloadBody: string;
  destinationUrl?: string | null;
  destinationRef?: string | null;
  secretRef?: string | null;
  extraHeaders?: Record<string, string>;
  orderedSequence?: number | null;
  maxRounds?: number;
}

export interface QueuedIntegrationDelivery {
  queueId: string;
  channelId: string;
  channelType: IntegrationChannelType;
  eventName: string;
  agentId: string;
  payloadSha256: string;
  orderedSequence: number | null;
  seq: number;
  state: IntegrationQueueState;
  attemptRound: number;
  maxRounds: number;
  createdTs: number;
  nextAttemptTs: number;
}

export interface IntegrationQueueDeliveryStatus extends QueuedIntegrationDelivery {
  lastError: string | null;
  lastHttpStatus: number | null;
  deliveredTs: number | null;
  deadLetterTs: number | null;
  eventId: string | null;
  receiptId: string | null;
  receipt: string | null;
  deliveryReceipt: WebhookDeliveryReceipt | null;
}

export interface IntegrationQueueStats {
  pending: number;
  delivered: number;
  deadLetter: number;
  oldestPendingTs: number | null;
  newestDeadLetterTs: number | null;
}

export interface ProcessedIntegrationDelivery {
  queueId: string;
  channelId: string;
  state: IntegrationQueueState;
  attemptRound: number;
  maxRounds: number;
  lastError: string | null;
  lastHttpStatus: number | null;
}

export interface ProcessIntegrationQueueResult {
  channelId: string;
  processed: ProcessedIntegrationDelivery[];
  blockedByOrdering: boolean;
}

interface IntegrationQueueRow {
  seq: number;
  queue_id: string;
  channel_id: string;
  channel_type: IntegrationChannelType;
  event_name: string;
  agent_id: string;
  payload_body: string;
  payload_sha256: string;
  ordered_sequence: number | null;
  destination_url: string | null;
  destination_ref: string | null;
  secret_ref: string | null;
  extra_headers_json: string;
  state: IntegrationQueueState;
  attempt_round: number;
  max_rounds: number;
  next_attempt_ts: number;
  last_error: string | null;
  last_http_status: number | null;
  delivery_receipt_json: string | null;
  created_ts: number;
  updated_ts: number;
  delivered_ts: number | null;
  dead_letter_ts: number | null;
  event_id: string | null;
  receipt_id: string | null;
  receipt: string | null;
}

export interface IntegrationDeliveryArtifacts {
  eventId: string;
  receiptId: string;
  receipt: string;
}

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_ROUND_BACKOFF_MS = 5_000;
const MAX_ROUND_BACKOFF_MS = 60_000;
const DEFAULT_MAX_PROCESS_ROWS = 100;

const DEFAULT_WEBHOOK_POLICY: Required<WebhookDeliveryPolicy> = {
  maxAttempts: 3,
  initialBackoffMs: 250,
  maxBackoffMs: 5_000,
  jitterFactor: 0,
  timeoutMs: 10_000
};

function integrationQueuePath(workspace: string): string {
  return join(workspace, ".amc", "integration-delivery.sqlite");
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_delivery_queue (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id TEXT NOT NULL UNIQUE,
      channel_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      event_name TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      payload_body TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL,
      ordered_sequence INTEGER,
      destination_url TEXT,
      destination_ref TEXT,
      secret_ref TEXT,
      extra_headers_json TEXT NOT NULL,
      state TEXT NOT NULL,
      attempt_round INTEGER NOT NULL DEFAULT 0,
      max_rounds INTEGER NOT NULL DEFAULT 3,
      next_attempt_ts INTEGER NOT NULL,
      last_error TEXT,
      last_http_status INTEGER,
      delivery_receipt_json TEXT,
      created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL,
      delivered_ts INTEGER,
      dead_letter_ts INTEGER,
      event_id TEXT,
      receipt_id TEXT,
      receipt TEXT,
      CHECK(state IN ('PENDING','DELIVERED','DEAD_LETTER'))
    );
    CREATE INDEX IF NOT EXISTS idx_integration_queue_channel_pending_order
      ON integration_delivery_queue(channel_id, state, seq);
    CREATE INDEX IF NOT EXISTS idx_integration_queue_state_ts
      ON integration_delivery_queue(state, updated_ts);
  `);
}

function openIntegrationQueueDb(workspace: string): Database.Database {
  ensureDir(join(workspace, ".amc"));
  const db = new Database(integrationQueuePath(workspace));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  ensureSchema(db);
  return db;
}

function clampMaxRounds(input: number | undefined): number {
  if (!Number.isFinite(input)) {
    return DEFAULT_MAX_ROUNDS;
  }
  return Math.max(1, Math.min(20, Math.floor(input ?? DEFAULT_MAX_ROUNDS)));
}

function parseHeaders(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function parseWebhookReceipt(raw: string | null): WebhookDeliveryReceipt | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as WebhookDeliveryReceipt;
  } catch {
    return null;
  }
}

function mapQueuedDelivery(row: IntegrationQueueRow): QueuedIntegrationDelivery {
  return {
    queueId: row.queue_id,
    channelId: row.channel_id,
    channelType: row.channel_type,
    eventName: row.event_name,
    agentId: row.agent_id,
    payloadSha256: row.payload_sha256,
    orderedSequence: typeof row.ordered_sequence === "number" ? row.ordered_sequence : null,
    seq: row.seq,
    state: row.state,
    attemptRound: row.attempt_round,
    maxRounds: row.max_rounds,
    createdTs: row.created_ts,
    nextAttemptTs: row.next_attempt_ts
  };
}

function mapDeliveryStatus(row: IntegrationQueueRow): IntegrationQueueDeliveryStatus {
  return {
    ...mapQueuedDelivery(row),
    lastError: row.last_error,
    lastHttpStatus: typeof row.last_http_status === "number" ? row.last_http_status : null,
    deliveredTs: typeof row.delivered_ts === "number" ? row.delivered_ts : null,
    deadLetterTs: typeof row.dead_letter_ts === "number" ? row.dead_letter_ts : null,
    eventId: row.event_id,
    receiptId: row.receipt_id,
    receipt: row.receipt,
    deliveryReceipt: parseWebhookReceipt(row.delivery_receipt_json)
  };
}

function summarizeDeliveryFailure(receipt: WebhookDeliveryReceipt): {
  message: string;
  httpStatus: number | null;
} {
  const last = receipt.attempts[receipt.attempts.length - 1] ?? null;
  if (!last) {
    return {
      message: "delivery failed",
      httpStatus: null
    };
  }
  if (last.error && last.error.trim().length > 0) {
    return {
      message: last.error,
      httpStatus: typeof last.httpStatus === "number" ? last.httpStatus : null
    };
  }
  if (typeof last.httpStatus === "number") {
    return {
      message: `HTTP ${last.httpStatus}`,
      httpStatus: last.httpStatus
    };
  }
  return {
    message: "delivery failed",
    httpStatus: null
  };
}

function roundBackoffMs(attemptRound: number): number {
  return computeBackoffDelayMs({
    attempt: attemptRound,
    initialBackoffMs: DEFAULT_ROUND_BACKOFF_MS,
    maxBackoffMs: MAX_ROUND_BACKOFF_MS,
    jitterFactor: 0
  });
}

function buildDeliveryRequest(params: {
  workspace: string;
  row: IntegrationQueueRow;
}): {
  url: string;
  secret: string;
  headers: Record<string, string>;
} {
  const headers = parseHeaders(params.row.extra_headers_json);
  if (typeof params.row.ordered_sequence === "number") {
    headers["x-amc-ordered-sequence"] = String(params.row.ordered_sequence);
  }

  const url = (() => {
    if (params.row.destination_url && params.row.destination_url.trim().length > 0) {
      return params.row.destination_url.trim();
    }
    if (params.row.destination_ref && params.row.destination_ref.trim().length > 0) {
      const resolved = resolveSecretRef(params.workspace, params.row.destination_ref);
      if (!resolved || resolved.trim().length === 0) {
        throw new Error(`missing destination: ${params.row.destination_ref}`);
      }
      return resolved.trim();
    }
    throw new Error("missing destination configuration");
  })();

  if (params.row.channel_type === "webhook") {
    if (!params.row.secret_ref || params.row.secret_ref.trim().length === 0) {
      throw new Error("missing webhook secretRef");
    }
    const secret = resolveSecretRef(params.workspace, params.row.secret_ref);
    if (!secret || secret.trim().length === 0) {
      throw new Error(`missing secret: ${params.row.secret_ref}`);
    }
    headers["x-amc-integration-secret"] = secret.trim();
    return {
      url,
      secret: secret.trim(),
      headers
    };
  }

  return {
    url,
    secret: sha256Hex(`${params.row.channel_id}:${params.row.event_name}`),
    headers
  };
}

export function enqueueIntegrationDeliveries(params: {
  workspace: string;
  deliveries: IntegrationQueueItemInput[];
  nowTs?: number;
}): QueuedIntegrationDelivery[] {
  const nowTs = typeof params.nowTs === "number" ? params.nowTs : Date.now();
  const db = openIntegrationQueueDb(params.workspace);
  try {
    const insert = db.prepare(`
      INSERT INTO integration_delivery_queue (
        queue_id,
        channel_id,
        channel_type,
        event_name,
        agent_id,
        payload_body,
        payload_sha256,
        ordered_sequence,
        destination_url,
        destination_ref,
        secret_ref,
        extra_headers_json,
        state,
        attempt_round,
        max_rounds,
        next_attempt_ts,
        created_ts,
        updated_ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?, ?)
    `);

    const queued: QueuedIntegrationDelivery[] = [];
    const tx = db.transaction(() => {
      for (const item of params.deliveries) {
        const queueId = `iq_${randomUUID().replace(/-/g, "")}`;
        const payloadSha256 = sha256Hex(Buffer.from(item.payloadBody, "utf8"));
        const maxRounds = clampMaxRounds(item.maxRounds);
        const extraHeaders = JSON.stringify(item.extraHeaders ?? {});
        const result = insert.run(
          queueId,
          item.channelId,
          item.channelType,
          item.eventName,
          item.agentId,
          item.payloadBody,
          payloadSha256,
          typeof item.orderedSequence === "number" ? item.orderedSequence : null,
          item.destinationUrl ?? null,
          item.destinationRef ?? null,
          item.secretRef ?? null,
          extraHeaders,
          maxRounds,
          nowTs,
          nowTs,
          nowTs
        );
        queued.push({
          queueId,
          channelId: item.channelId,
          channelType: item.channelType,
          eventName: item.eventName,
          agentId: item.agentId,
          payloadSha256,
          orderedSequence: typeof item.orderedSequence === "number" ? item.orderedSequence : null,
          seq: Number(result.lastInsertRowid),
          state: "PENDING",
          attemptRound: 0,
          maxRounds,
          createdTs: nowTs,
          nextAttemptTs: nowTs
        });
      }
    });
    tx();

    return queued;
  } finally {
    db.close();
  }
}

export function getIntegrationDeliveryStatusByQueueId(
  workspace: string,
  queueId: string
): IntegrationQueueDeliveryStatus | null {
  const db = openIntegrationQueueDb(workspace);
  try {
    const row = db
      .prepare("SELECT * FROM integration_delivery_queue WHERE queue_id = ? LIMIT 1")
      .get(queueId) as IntegrationQueueRow | undefined;
    return row ? mapDeliveryStatus(row) : null;
  } finally {
    db.close();
  }
}

export function getIntegrationDeliveryStatusByQueueIds(
  workspace: string,
  queueIds: string[]
): IntegrationQueueDeliveryStatus[] {
  if (queueIds.length === 0) {
    return [];
  }
  const db = openIntegrationQueueDb(workspace);
  try {
    const placeholders = queueIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT * FROM integration_delivery_queue WHERE queue_id IN (${placeholders}) ORDER BY seq ASC`
      )
      .all(...queueIds) as IntegrationQueueRow[];
    return rows.map((row) => mapDeliveryStatus(row));
  } finally {
    db.close();
  }
}

export function integrationQueueStats(workspace: string): IntegrationQueueStats {
  const db = openIntegrationQueueDb(workspace);
  try {
    const counts = db
      .prepare(
        "SELECT state, COUNT(*) AS count FROM integration_delivery_queue GROUP BY state"
      )
      .all() as Array<{ state: IntegrationQueueState; count: number }>;

    const pending = counts.find((row) => row.state === "PENDING")?.count ?? 0;
    const delivered = counts.find((row) => row.state === "DELIVERED")?.count ?? 0;
    const deadLetter = counts.find((row) => row.state === "DEAD_LETTER")?.count ?? 0;

    const oldestPending = db
      .prepare(
        "SELECT MIN(created_ts) AS ts FROM integration_delivery_queue WHERE state = 'PENDING'"
      )
      .get() as { ts: number | null };
    const newestDeadLetter = db
      .prepare(
        "SELECT MAX(dead_letter_ts) AS ts FROM integration_delivery_queue WHERE state = 'DEAD_LETTER'"
      )
      .get() as { ts: number | null };

    return {
      pending,
      delivered,
      deadLetter,
      oldestPendingTs: typeof oldestPending.ts === "number" ? oldestPending.ts : null,
      newestDeadLetterTs: typeof newestDeadLetter.ts === "number" ? newestDeadLetter.ts : null
    };
  } finally {
    db.close();
  }
}

export function listIntegrationDeadLetters(
  workspace: string,
  options?: { channelId?: string; limit?: number }
): IntegrationQueueDeliveryStatus[] {
  const limit = Math.max(1, Math.min(500, Math.floor(options?.limit ?? 100)));
  const db = openIntegrationQueueDb(workspace);
  try {
    const rows = options?.channelId
      ? (db
          .prepare(
            `SELECT * FROM integration_delivery_queue
             WHERE state = 'DEAD_LETTER' AND channel_id = ?
             ORDER BY dead_letter_ts DESC, seq DESC
             LIMIT ?`
          )
          .all(options.channelId, limit) as IntegrationQueueRow[])
      : (db
          .prepare(
            `SELECT * FROM integration_delivery_queue
             WHERE state = 'DEAD_LETTER'
             ORDER BY dead_letter_ts DESC, seq DESC
             LIMIT ?`
          )
          .all(limit) as IntegrationQueueRow[]);
    return rows.map((row) => mapDeliveryStatus(row));
  } finally {
    db.close();
  }
}

export function requeueIntegrationDeadLetters(params: {
  workspace: string;
  channelId?: string;
  limit?: number;
  nowTs?: number;
}): { requeued: number; queueIds: string[] } {
  const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 100)));
  const nowTs = typeof params.nowTs === "number" ? params.nowTs : Date.now();
  const db = openIntegrationQueueDb(params.workspace);
  try {
    const rows = params.channelId
      ? (db
          .prepare(
            `SELECT queue_id
             FROM integration_delivery_queue
             WHERE state = 'DEAD_LETTER' AND channel_id = ?
             ORDER BY dead_letter_ts ASC, seq ASC
             LIMIT ?`
          )
          .all(params.channelId, limit) as Array<{ queue_id: string }>)
      : (db
          .prepare(
            `SELECT queue_id
             FROM integration_delivery_queue
             WHERE state = 'DEAD_LETTER'
             ORDER BY dead_letter_ts ASC, seq ASC
             LIMIT ?`
          )
          .all(limit) as Array<{ queue_id: string }>);

    if (rows.length === 0) {
      return { requeued: 0, queueIds: [] };
    }

    const queueIds = rows.map((row) => row.queue_id);
    const placeholders = queueIds.map(() => "?").join(",");
    db.prepare(
      `UPDATE integration_delivery_queue
       SET state = 'PENDING',
           attempt_round = 0,
           next_attempt_ts = ?,
           last_error = NULL,
           last_http_status = NULL,
           dead_letter_ts = NULL,
           updated_ts = ?
       WHERE queue_id IN (${placeholders})`
    ).run(nowTs, nowTs, ...queueIds);

    return {
      requeued: queueIds.length,
      queueIds
    };
  } finally {
    db.close();
  }
}

export async function processIntegrationChannelQueue(params: {
  workspace: string;
  channelId: string;
  deliveryPolicy?: WebhookDeliveryPolicy;
  maxRows?: number;
  now?: () => number;
  onDelivered?: (input: {
    queueId: string;
    channelId: string;
    eventName: string;
    agentId: string;
    payloadBody: string;
    payloadSha256: string;
    orderedSequence: number | null;
    httpStatus: number;
    receipt: WebhookDeliveryReceipt;
  }) => Promise<IntegrationDeliveryArtifacts | null>;
}): Promise<ProcessIntegrationQueueResult> {
  const maxRows = Math.max(1, Math.min(500, Math.floor(params.maxRows ?? DEFAULT_MAX_PROCESS_ROWS)));
  const now = params.now ?? Date.now;
  const policy = {
    ...DEFAULT_WEBHOOK_POLICY,
    ...(params.deliveryPolicy ?? {})
  };

  const db = openIntegrationQueueDb(params.workspace);
  const processed: ProcessedIntegrationDelivery[] = [];
  let blockedByOrdering = false;

  try {
    const loadNext = db.prepare(
      `SELECT * FROM integration_delivery_queue
       WHERE channel_id = ? AND state = 'PENDING'
       ORDER BY seq ASC
       LIMIT 1`
    );

    const markDelivered = db.prepare(
      `UPDATE integration_delivery_queue
       SET state = 'DELIVERED',
           attempt_round = ?,
           last_error = NULL,
           last_http_status = ?,
           delivery_receipt_json = ?,
           updated_ts = ?,
           delivered_ts = ?,
           event_id = ?,
           receipt_id = ?,
           receipt = ?
       WHERE queue_id = ?`
    );

    const markPending = db.prepare(
      `UPDATE integration_delivery_queue
       SET state = 'PENDING',
           attempt_round = ?,
           next_attempt_ts = ?,
           last_error = ?,
           last_http_status = ?,
           delivery_receipt_json = ?,
           updated_ts = ?
       WHERE queue_id = ?`
    );

    const markDeadLetter = db.prepare(
      `UPDATE integration_delivery_queue
       SET state = 'DEAD_LETTER',
           attempt_round = ?,
           last_error = ?,
           last_http_status = ?,
           delivery_receipt_json = ?,
           updated_ts = ?,
           dead_letter_ts = ?
       WHERE queue_id = ?`
    );

    for (let processedCount = 0; processedCount < maxRows; processedCount += 1) {
      const row = loadNext.get(params.channelId) as IntegrationQueueRow | undefined;
      if (!row) {
        break;
      }

      const nowTs = now();
      if (row.next_attempt_ts > nowTs) {
        blockedByOrdering = true;
        break;
      }

      const attemptRound = row.attempt_round + 1;

      try {
        const deliveryRequest = buildDeliveryRequest({
          workspace: params.workspace,
          row
        });

        const receipt = await deliverWebhookWithRetry({
          request: {
            url: deliveryRequest.url,
            eventType: row.event_name,
            payload: row.payload_body,
            secret: deliveryRequest.secret,
            headers: deliveryRequest.headers
          },
          policy,
          deliveryId: `int_${row.queue_id}`
        });

        const lastHttpStatus = receipt.attempts[receipt.attempts.length - 1]?.httpStatus ?? null;

        if (receipt.delivered) {
          const artifacts =
            (await params.onDelivered?.({
              queueId: row.queue_id,
              channelId: row.channel_id,
              eventName: row.event_name,
              agentId: row.agent_id,
              payloadBody: row.payload_body,
              payloadSha256: row.payload_sha256,
              orderedSequence: typeof row.ordered_sequence === "number" ? row.ordered_sequence : null,
              httpStatus: lastHttpStatus ?? 200,
              receipt
            })) ?? null;
          const updatedTs = now();
          markDelivered.run(
            attemptRound,
            lastHttpStatus,
            JSON.stringify(receipt),
            updatedTs,
            updatedTs,
            artifacts?.eventId ?? null,
            artifacts?.receiptId ?? null,
            artifacts?.receipt ?? null,
            row.queue_id
          );
          processed.push({
            queueId: row.queue_id,
            channelId: row.channel_id,
            state: "DELIVERED",
            attemptRound,
            maxRounds: row.max_rounds,
            lastError: null,
            lastHttpStatus
          });
          continue;
        }

        const failure = summarizeDeliveryFailure(receipt);
        const updatedTs = now();
        const receiptJson = JSON.stringify(receipt);
        if (attemptRound >= row.max_rounds) {
          markDeadLetter.run(
            attemptRound,
            failure.message,
            failure.httpStatus,
            receiptJson,
            updatedTs,
            updatedTs,
            row.queue_id
          );
          processed.push({
            queueId: row.queue_id,
            channelId: row.channel_id,
            state: "DEAD_LETTER",
            attemptRound,
            maxRounds: row.max_rounds,
            lastError: failure.message,
            lastHttpStatus: failure.httpStatus
          });
          continue;
        }

        const nextAttemptTs = updatedTs + roundBackoffMs(attemptRound);
        markPending.run(
          attemptRound,
          nextAttemptTs,
          failure.message,
          failure.httpStatus,
          receiptJson,
          updatedTs,
          row.queue_id
        );
        processed.push({
          queueId: row.queue_id,
          channelId: row.channel_id,
          state: "PENDING",
          attemptRound,
          maxRounds: row.max_rounds,
          lastError: failure.message,
          lastHttpStatus: failure.httpStatus
        });
        blockedByOrdering = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const updatedTs = now();
        if (attemptRound >= row.max_rounds) {
          markDeadLetter.run(attemptRound, message, null, null, updatedTs, updatedTs, row.queue_id);
          processed.push({
            queueId: row.queue_id,
            channelId: row.channel_id,
            state: "DEAD_LETTER",
            attemptRound,
            maxRounds: row.max_rounds,
            lastError: message,
            lastHttpStatus: null
          });
          continue;
        }

        const nextAttemptTs = updatedTs + roundBackoffMs(attemptRound);
        markPending.run(
          attemptRound,
          nextAttemptTs,
          message,
          null,
          null,
          updatedTs,
          row.queue_id
        );
        processed.push({
          queueId: row.queue_id,
          channelId: row.channel_id,
          state: "PENDING",
          attemptRound,
          maxRounds: row.max_rounds,
          lastError: message,
          lastHttpStatus: null
        });
        blockedByOrdering = true;
        break;
      }
    }

    return {
      channelId: params.channelId,
      processed,
      blockedByOrdering
    };
  } finally {
    db.close();
  }
}

export function exportIntegrationDeliverySnapshot(params: {
  workspace: string;
  outFile: string;
  includeDelivered?: boolean;
  includePending?: boolean;
  includeDeadLetters?: boolean;
  limit?: number;
}): {
  outFile: string;
  exportedCount: number;
  generatedTs: number;
} {
  const includeDelivered = params.includeDelivered ?? false;
  const includePending = params.includePending ?? true;
  const includeDeadLetters = params.includeDeadLetters ?? true;
  const limit = Math.max(1, Math.min(10_000, Math.floor(params.limit ?? 2_000)));

  const states: IntegrationQueueState[] = [];
  if (includePending) states.push("PENDING");
  if (includeDelivered) states.push("DELIVERED");
  if (includeDeadLetters) states.push("DEAD_LETTER");
  if (states.length === 0) {
    throw new Error("at least one state must be included for export");
  }

  const db = openIntegrationQueueDb(params.workspace);
  try {
    const placeholders = states.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT * FROM integration_delivery_queue
         WHERE state IN (${placeholders})
         ORDER BY seq ASC
         LIMIT ?`
      )
      .all(...states, limit) as IntegrationQueueRow[];

    const counts = db
      .prepare(
        "SELECT state, COUNT(*) AS count FROM integration_delivery_queue GROUP BY state"
      )
      .all() as Array<{ state: IntegrationQueueState; count: number }>;
    const oldestPending = db
      .prepare(
        "SELECT MIN(created_ts) AS ts FROM integration_delivery_queue WHERE state = 'PENDING'"
      )
      .get() as { ts: number | null };
    const newestDeadLetter = db
      .prepare(
        "SELECT MAX(dead_letter_ts) AS ts FROM integration_delivery_queue WHERE state = 'DEAD_LETTER'"
      )
      .get() as { ts: number | null };
    const stats: IntegrationQueueStats = {
      pending: counts.find((row) => row.state === "PENDING")?.count ?? 0,
      delivered: counts.find((row) => row.state === "DELIVERED")?.count ?? 0,
      deadLetter: counts.find((row) => row.state === "DEAD_LETTER")?.count ?? 0,
      oldestPendingTs: typeof oldestPending.ts === "number" ? oldestPending.ts : null,
      newestDeadLetterTs: typeof newestDeadLetter.ts === "number" ? newestDeadLetter.ts : null
    };

    const payload = {
      v: 1,
      generatedTs: Date.now(),
      workspace: params.workspace,
      stats,
      items: rows.map((row) => mapDeliveryStatus(row))
    };

    const outFile = resolve(params.workspace, params.outFile);
    ensureDir(dirname(outFile));
    writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");

    return {
      outFile,
      exportedCount: rows.length,
      generatedTs: payload.generatedTs
    };
  } finally {
    db.close();
  }
}
