import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { withWorkspaceScope } from "../enforce/evidenceEmitter.js";
import { EgressBlocked } from "../residency/checkEgress.js";
import {
  verifyHexDigestAny
} from "../crypto/keys.js";
import { ensureDir } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  computeBackoffDelayMs,
  deliverWebhookWithRetry,
  defaultWebhookHttpClient,
  normalizeWebhookDeliveryError,
  redactWebhookDeliveryReceipt,
  type WebhookDeliveryPolicy,
  type WebhookDeliveryReceipt
} from "./webhookDelivery.js";
import { openIntegrationQueueDb } from "./integrationQueueDb.js";
import { canonicalize } from "../utils/json.js";
import { getVaultSecretReadOnly } from "../vault/vault.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { IntegrationAuthorityRefused, IntegrationDispatchPartialError, captureIntegrationQueueReader, queueBindingDigest } from "./integrationQueueEnqueue.js";
export { enqueueIntegrationDeliveries, enqueueIntegrationDeliveriesAsync } from "./integrationQueueEnqueue.js";
import {
  loadIntegrationsConfig,
  resolveSecretRef,
  verifyIntegrationsConfigSignature
} from "./integrationStore.js";

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
  finalizedTs: number | null;
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

export interface IntegrationQueueRow {
  seq: number;
  queue_id: string;
  channel_id: string;
  channel_type: IntegrationChannelType;
  event_name: string;
  agent_id: string;
  payload_body: string;
  payload_sha256: string;
  ordered_sequence: number | null;
  binding_digest: string | null;
  binding_signature: string | null;
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
  finalized_ts: number | null;
}

export interface IntegrationDeliveryArtifacts {
  eventId: string;
  receiptId: string;
  receipt: string;
}

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

/**
 * Deletes delivered rows older than `beforeTs`, returning the count removed.
 *
 * Nothing ever deleted from this table, so DELIVERED rows accumulated forever
 * and every queue operation — including studio's 60-second drain tick — got
 * permanently slower. Only terminal, successfully-delivered rows are removed;
 * PENDING and DEAD_LETTER rows are left for the operator.
 */
export function pruneDeliveredIntegrationQueue(workspace: string, beforeTs: number): number {
  const db = openIntegrationQueueDb(workspace);
  try {
    const result = db
      .prepare(`DELETE FROM integration_delivery_queue WHERE state = 'DELIVERED' AND updated_ts < ?`)
      .run(beforeTs);
    return Number(result.changes ?? 0);
  } finally {
    db.close();
  }
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
    deliveryReceipt: parseWebhookReceipt(row.delivery_receipt_json),
    finalizedTs: typeof row.finalized_ts === "number" ? row.finalized_ts : null
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
      message: normalizeWebhookDeliveryError(last.error),
      httpStatus: typeof last.httpStatus === "number" ? last.httpStatus : null
    };
  }
  if (typeof last.httpStatus === "number") {
    return {
      message: `HTTP_${last.httpStatus}`,
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

function verifyQueueBinding(workspace: string, row: IntegrationQueueRow): boolean {
  const payloadSha256 = sha256Hex(Buffer.from(row.payload_body, "utf8"));
  if (payloadSha256 !== row.payload_sha256) {
    return false;
  }
  if (!row.binding_digest || !row.binding_signature) {
    return false;
  }
  const expectedDigest = queueBindingDigest({
    queueId: row.queue_id,
    channelId: row.channel_id,
    channelType: row.channel_type,
    eventName: row.event_name,
    agentId: row.agent_id,
    payloadSha256: row.payload_sha256,
    orderedSequence: row.ordered_sequence,
    maxRounds: row.max_rounds,
    createdTs: row.created_ts
  });
  return row.binding_digest === expectedDigest && verifyHexDigestAny(
    expectedDigest,
    row.binding_signature,
    getPurposeKeyHistory(workspace, "artifact-seal")
  );
}

function buildDeliveryRequest(params: {
  workspace: string;
  row: IntegrationQueueRow;
}): {
  url: string;
  secret: string;
  headers: Record<string, string>;
} {
  const signature = verifyIntegrationsConfigSignature(params.workspace);
  if (!signature.valid) {
    throw new Error("integrations config invalid");
  }
  const channel = loadIntegrationsConfig(params.workspace).integrations.channels.find(
    (candidate) => candidate.id === params.row.channel_id
  );
  if (!channel || !channel.enabled || channel.type !== params.row.channel_type) {
    throw new Error("integration channel configuration missing or disabled");
  }
  const headers: Record<string, string> = {
    ...parseHeaders(params.row.extra_headers_json),
    "x-amc-channel-id": params.row.channel_id
  };
  if (typeof params.row.ordered_sequence === "number") {
    headers["x-amc-ordered-sequence"] = String(params.row.ordered_sequence);
  }

  if (channel.type === "webhook") {
    const secret = resolveSecretRef(params.workspace, channel.secretRef);
    if (!secret || secret.trim().length === 0) {
      throw new Error("missing webhook secret");
    }
    return {
      url: channel.url,
      secret: secret.trim(),
      headers
    };
  }

  const url = resolveSecretRef(params.workspace, channel.webhookUrlRef);
  if (!url || url.trim().length === 0) {
    throw new Error("missing Slack webhook destination");
  }
  return {
    url: url.trim(),
    secret: sha256Hex(`${params.row.channel_id}:${params.row.event_name}`),
    headers
  };
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

export function listDueIntegrationChannelIds(params: {
  workspace: string;
  nowTs?: number;
  limit?: number;
}): string[] {
  const nowTs = params.nowTs ?? Date.now();
  const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 100)));
  const db = openIntegrationQueueDb(params.workspace);
  try {
    const rows = db.prepare(
      `SELECT channel_id, MIN(seq) AS first_seq
       FROM integration_delivery_queue
       WHERE state = 'PENDING' AND next_attempt_ts <= ?
       GROUP BY channel_id
       ORDER BY first_seq ASC
       LIMIT ?`
    ).all(nowTs, limit) as Array<{ channel_id: string }>;
    return rows.map((row) => row.channel_id);
  } finally {
    db.close();
  }
}

export function listIntegrationDeliveriesNeedingFinalization(
  workspace: string,
  limit = 500
): IntegrationQueueDeliveryStatus[] {
  const bounded = Math.max(1, Math.min(5_000, Math.floor(limit)));
  const db = openIntegrationQueueDb(workspace);
  try {
    const rows = db.prepare(
      `SELECT * FROM integration_delivery_queue
       WHERE state IN ('DELIVERED', 'DEAD_LETTER') AND finalized_ts IS NULL
       ORDER BY seq ASC
       LIMIT ?`
    ).all(bounded) as IntegrationQueueRow[];
    return rows.map((row) => mapDeliveryStatus(row));
  } finally {
    db.close();
  }
}

export function markIntegrationDeliveriesFinalized(params: {
  workspace: string;
  queueIds: string[];
  finalizedTs?: number;
}): number {
  const queueIds = [...new Set(params.queueIds.filter((value) => value.length > 0))];
  if (queueIds.length === 0) {
    return 0;
  }
  const db = openIntegrationQueueDb(params.workspace);
  try {
    const placeholders = queueIds.map(() => "?").join(",");
    const result = db.prepare(
      `UPDATE integration_delivery_queue
       SET finalized_ts = ?, updated_ts = ?
       WHERE queue_id IN (${placeholders})
         AND state IN ('DELIVERED', 'DEAD_LETTER')
         AND finalized_ts IS NULL`
    ).run(params.finalizedTs ?? Date.now(), params.finalizedTs ?? Date.now(), ...queueIds);
    return result.changes;
  } finally {
    db.close();
  }
}

/** Internal terminal publication. The row preimage is checked last under the short SQLite writer transaction. */
export function finalizeIntegrationDeliveryWithAuthority(workspace: string, status: IntegrationQueueDeliveryStatus,
  beforeCommit: () => void, publishJournals: (assertRow: () => void) => void): void {
  beforeCommit(); const db = openIntegrationQueueDb(workspace);
  try { db.transaction(() => {
    const assertRow = () => {
      const current = db.prepare("SELECT * FROM integration_delivery_queue WHERE queue_id = ?").get(status.queueId) as IntegrationQueueRow | undefined;
      if (!current || canonicalize(mapDeliveryStatus(current)) !== canonicalize(status)) throw new Error("selected terminal integration row changed");
    };
    beforeCommit(); assertRow(); publishJournals(assertRow);
    const finalizedTs = Date.now(); beforeCommit(); assertRow();
    db.prepare("UPDATE integration_delivery_queue SET finalized_ts = ?, updated_ts = ? WHERE queue_id = ?").run(finalizedTs, finalizedTs, status.queueId);
  }).immediate(); } finally { db.close(); }
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
           finalized_ts = NULL,
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

/** Internal immutable pending selection, captured before the outer dispatch schedule awaits. */
export function captureIntegrationPendingRows(workspace: string, channelIds: readonly string[], beforeCommit: () => void): IntegrationQueueRow[] {
  beforeCommit();
  const db = openIntegrationQueueDb(workspace);
  try { return db.prepare("SELECT * FROM integration_delivery_queue WHERE state = 'PENDING' ORDER BY seq ASC").all()
    .filter((row: unknown) => channelIds.includes((row as IntegrationQueueRow).channel_id)) as IntegrationQueueRow[]; }
  finally { db.close(); }
}

type ChannelQueueInput = {
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
  }, beforeCommit?: () => void) => Promise<IntegrationDeliveryArtifacts | null>;
};

/** Public compatibility entry; no caller authority is inferred from the event or queue body. */
export async function processIntegrationChannelQueue(params: ChannelQueueInput): Promise<ProcessIntegrationQueueResult> {
  return processChannelQueueAttempt(params);
}

/** Internal maintained-caller counterpart. The callback can only refuse; selected rows are immutable snapshots. */
export async function processIntegrationChannelQueueWithAuthority(params: ChannelQueueInput, beforeCommit: () => void,
  selectedRows: readonly IntegrationQueueRow[], terminalWrites: IntegrationQueueDeliveryStatus[] = [], ownRows?: IntegrationQueueRow[]): Promise<ProcessIntegrationQueueResult> {
  return processChannelQueueAttempt(params, beforeCommit, selectedRows, terminalWrites, ownRows);
}

async function processChannelQueueAttempt(params: ChannelQueueInput, beforeCommit?: () => void,
  selectedRows?: readonly IntegrationQueueRow[], terminalWrites?: IntegrationQueueDeliveryStatus[], ownRows?: IntegrationQueueRow[]): Promise<ProcessIntegrationQueueResult> {
  const input = { ...params };
  const workspace = input.workspace.trim() ? resolve(input.workspace) : input.workspace;
  const maxRows = Math.max(1, Math.min(500, Math.floor(input.maxRows ?? DEFAULT_MAX_PROCESS_ROWS)));
  const now = input.now ?? Date.now;
  const policy = {
    ...DEFAULT_WEBHOOK_POLICY,
    ...(input.deliveryPolicy ?? {})
  };
  beforeCommit?.();
  const assertReader = beforeCommit ? captureIntegrationQueueReader(workspace) : undefined;
  const db = openIntegrationQueueDb(workspace);
  const selected = selectedRows ? new Map(selectedRows.map(row => [row.queue_id, canonicalize(row)])) : null;
  const nativePost = defaultWebhookHttpClient.post.bind(defaultWebhookHttpClient);
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
           receipt = ?,
           finalized_ts = NULL
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
           dead_letter_ts = ?,
           finalized_ts = NULL
       WHERE queue_id = ?`
    );

    for (let processedCount = 0; processedCount < maxRows; processedCount += 1) {
      const row = loadNext.get(input.channelId) as IntegrationQueueRow | undefined;
      if (!row) {
        break;
      }

      if (selected !== null && !selected.has(row.queue_id)) { blockedByOrdering = true; break; }
      const nativePosts: Array<{ entered: number; httpStatus: number | null; error: string | null }> = [];
      let nativePostCallsEntered = 0, returnedReceipt: WebhookDeliveryReceipt | null = null;
      let returnedArtifacts: IntegrationDeliveryArtifacts | null = null, refusal: IntegrationAuthorityRefused | null = null;
      const guard = () => {
        if (!beforeCommit) return;
        try {
          beforeCommit(); assertReader?.();
          const current = loadNext.get(input.channelId) as IntegrationQueueRow | undefined;
          if (current?.queue_id !== row.queue_id || canonicalize(current) !== selected!.get(row.queue_id)) throw new Error("selected integration queue row changed");
        } catch (cause) {
          refusal = new IntegrationAuthorityRefused(cause, Object.freeze({ queueId: row.queue_id, nativePostCallsEntered, nativePosts: nativePosts.map(item => ({ ...item })),
            returnedReceipt: returnedReceipt ? redactWebhookDeliveryReceipt(returnedReceipt) : null,
            returnedArtifacts, processed: processed.map(item => ({ ...item })) }));
          throw refusal;
        }
      };
      const commit = (operation: () => void) => {
        if (!beforeCommit) { operation(); return; }
        const written = db.transaction(() => {
          guard(); operation();
          return db.prepare("SELECT * FROM integration_delivery_queue WHERE queue_id = ?").get(row.queue_id) as IntegrationQueueRow;
        }).immediate();
        ownRows?.push({ ...written });
        if (written.state === "DELIVERED" || written.state === "DEAD_LETTER") terminalWrites?.push(mapDeliveryStatus(written));
      };
      const readNow = () => { try { return now(); } catch (cause) {
        if (!beforeCommit) throw cause;
        throw new IntegrationDispatchPartialError(cause, { queueId: row.queue_id, nativePostCallsEntered,
          nativePosts: nativePosts.map(item => ({ ...item })), returnedReceipt, returnedArtifacts, processed: processed.map(item => ({ ...item })) });
      } };
      const nowTs = readNow(); guard();
      if (row.next_attempt_ts > nowTs) {
        blockedByOrdering = true;
        break;
      }

      const attemptRound = row.attempt_round + 1;

      try {
        if (!verifyQueueBinding(workspace, row)) {
          throw new Error("DELIVERY_QUEUE_BINDING_INVALID");
        }
        const deliveryRequest = buildDeliveryRequest({
          workspace,
          row
        });
        const requestSnapshot = canonicalize(deliveryRequest);
        const checkRequest = () => {
          if (!beforeCommit) return;
          // Read-only final secret lookup never implicitly unlocks or changes the selected destination.
          const config = loadIntegrationsConfig(workspace), channel = config.integrations.channels.find(item => item.id === row.channel_id);
          let currentRequest: typeof deliveryRequest | null = null;
          if (channel?.enabled && channel.type === row.channel_type) {
            const ref = channel.type === "webhook" ? channel.secretRef : channel.webhookUrlRef;
            const value = ref.startsWith("vault:") ? getVaultSecretReadOnly(workspace, ref.slice(6)) : null;
            if (value) currentRequest = { url: channel.type === "webhook" ? channel.url : value.trim(),
              secret: channel.type === "webhook" ? value.trim() : sha256Hex(`${row.channel_id}:${row.event_name}`), headers: deliveryRequest.headers };
          }
          if (currentRequest === null || canonicalize(currentRequest) !== requestSnapshot)
            throw new Error("selected integration destination or secret changed");
        };
        guard();
        const receipt = await withWorkspaceScope(workspace, () => deliverWebhookWithRetry({
          request: {
            url: deliveryRequest.url,
            eventType: row.event_name,
            payload: row.payload_body,
            secret: deliveryRequest.secret,
            headers: deliveryRequest.headers
          },
          policy,
          deliveryId: `int_${row.queue_id}`,
          dependencies: beforeCommit ? {
            client: { post: async request => {
              try { checkRequest(); guard(); }
              catch (cause) {
                if (cause instanceof IntegrationAuthorityRefused) throw cause;
                refusal = new IntegrationAuthorityRefused(cause, Object.freeze({ queueId: row.queue_id, nativePostCallsEntered, nativePosts: nativePosts.map(item => ({ ...item })),
                  returnedReceipt, returnedArtifacts, processed: processed.map(item => ({ ...item })) }));
                throw refusal;
              }
              nativePostCallsEntered += 1;
              try {
                const response = await nativePost(request);
                nativePosts.push({ entered: nativePostCallsEntered, httpStatus: response.status, error: null }); return response;
              } catch (cause) {
                nativePosts.push({ entered: nativePostCallsEntered, httpStatus: null, error: normalizeWebhookDeliveryError(cause) }); throw cause;
              }
            } },
            // The legacy retry catches transport errors. A saved authority refusal is never retried as a native request.
            sleep: async ms => { if (refusal) throw refusal; await new Promise<void>(done => setTimeout(done, ms)); }
          } : undefined
        }));
        if (refusal) throw refusal;
        returnedReceipt = beforeCommit ? JSON.parse(canonicalize(receipt)) as WebhookDeliveryReceipt : receipt; guard();
        const lastHttpStatus = receipt.attempts[receipt.attempts.length - 1]?.httpStatus ?? null;

        if (receipt.delivered) {
          const deliveryInput = { queueId: row.queue_id, channelId: row.channel_id, eventName: row.event_name,
            agentId: row.agent_id, payloadBody: row.payload_body, payloadSha256: row.payload_sha256,
            orderedSequence: typeof row.ordered_sequence === "number" ? row.ordered_sequence : null,
            httpStatus: lastHttpStatus ?? 200,
            receipt: beforeCommit ? JSON.parse(canonicalize(receipt)) as WebhookDeliveryReceipt : receipt };
          const callbackArtifacts = (await (beforeCommit ? input.onDelivered?.call(params, deliveryInput, guard)
            : input.onDelivered?.call(params, deliveryInput))) ?? null;
          const artifacts = beforeCommit && callbackArtifacts ? { eventId: callbackArtifacts.eventId, receiptId: callbackArtifacts.receiptId,
            receipt: callbackArtifacts.receipt } : callbackArtifacts;
          returnedArtifacts = artifacts;
          const updatedTs = readNow();
          commit(() => markDelivered.run(
            attemptRound,
            lastHttpStatus,
            JSON.stringify(redactWebhookDeliveryReceipt(receipt)),
            updatedTs,
            updatedTs,
            artifacts?.eventId ?? null,
            artifacts?.receiptId ?? null,
            artifacts?.receipt ?? null,
            row.queue_id
          ));
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
        const updatedTs = readNow();
        const receiptJson = JSON.stringify(redactWebhookDeliveryReceipt(receipt));
        if (attemptRound >= row.max_rounds) {
          commit(() => markDeadLetter.run(
            attemptRound,
            failure.message,
            failure.httpStatus,
            receiptJson,
            updatedTs,
            updatedTs,
            row.queue_id
          ));
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
        commit(() => markPending.run(
          attemptRound,
          nextAttemptTs,
          failure.message,
          failure.httpStatus,
          receiptJson,
          updatedTs,
          row.queue_id
        ));
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
        if (refusal) throw refusal;
        if (error instanceof IntegrationDispatchPartialError || error instanceof EgressBlocked) throw error;
        if (beforeCommit && returnedReceipt?.delivered) throw new IntegrationDispatchPartialError(error, Object.freeze({
          queueId: row.queue_id, nativePostCallsEntered, returnedReceipt: redactWebhookDeliveryReceipt(returnedReceipt),
          returnedArtifacts, processed: processed.map(item => ({ ...item })) }));
        const message = normalizeWebhookDeliveryError(error);
        const updatedTs = readNow(); guard();
        if (message === "DELIVERY_QUEUE_BINDING_INVALID" || attemptRound >= row.max_rounds) {
          commit(() => markDeadLetter.run(attemptRound, message, null, null, updatedTs, updatedTs, row.queue_id));
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
        commit(() => markPending.run(
          attemptRound,
          nextAttemptTs,
          message,
          null,
          null,
          updatedTs,
          row.queue_id
        ));
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
      channelId: input.channelId,
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
