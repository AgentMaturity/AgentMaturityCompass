/**
 * Schema creation and the one-time redaction migration for the integration
 * delivery queue.
 *
 * Split out of integrationDeliveryQueue.ts, which crossed its line budget when
 * the migration gained a version gate. The scrub redacts destinations, secret
 * refs, headers, errors and receipts in rows written before every write path
 * normalized its own values — it is history, not steady-state behaviour, and
 * reads better away from the queue's live logic.
 */
import type Database from "better-sqlite3";
import {
  normalizeWebhookDeliveryError,
  redactWebhookDeliveryReceipt,
  type WebhookDeliveryReceipt
} from "./webhookDelivery.js";
// Type-only, so it erases at compile time: integrationDeliveryQueue.ts imports
// ensureSchema from here.
import type { IntegrationQueueRow } from "./integrationDeliveryQueue.js";

/** Local copy of the queue's receipt parser; the queue keeps its own. */
function parseWebhookReceipt(raw: string | null): WebhookDeliveryReceipt | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebhookDeliveryReceipt;
  } catch {
    return null;
  }
}

/** Bumped when the historical redaction scrub changes. */
export const SCRUB_MIGRATION_VERSION = 1;

export function ensureSchema(db: Database.Database): boolean {
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
      binding_digest TEXT,
      binding_signature TEXT,
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
      finalized_ts INTEGER,
      CHECK(state IN ('PENDING','DELIVERED','DEAD_LETTER'))
    );
    CREATE INDEX IF NOT EXISTS idx_integration_queue_channel_pending_order
      ON integration_delivery_queue(channel_id, state, seq);
    CREATE INDEX IF NOT EXISTS idx_integration_queue_state_ts
      ON integration_delivery_queue(state, updated_ts);
  `);
  const columns = db.prepare("PRAGMA table_info(integration_delivery_queue)").all() as Array<{
    name: string;
  }>;
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("binding_digest")) {
    db.exec("ALTER TABLE integration_delivery_queue ADD COLUMN binding_digest TEXT");
  }
  if (!columnNames.has("binding_signature")) {
    db.exec("ALTER TABLE integration_delivery_queue ADD COLUMN binding_signature TEXT");
  }
  if (!columnNames.has("finalized_ts")) {
    db.exec("ALTER TABLE integration_delivery_queue ADD COLUMN finalized_ts INTEGER");
  }
  // The scrub below redacts historical rows written before every write path
  // normalized its own values. It is a one-time migration, but it ran on every
  // open — and every exported function in this file opens the db — so each
  // operation cost a full table scan plus a transaction over every row.
  //
  // Gating it on user_version is safe because inserts already write NULL for
  // destination_url/destination_ref/secret_ref and "{}" for extra_headers_json,
  // and every update passes last_error through normalizeWebhookDeliveryError
  // and receipts through redactWebhookDeliveryReceipt. Verified by reading all
  // four write paths before adding the gate.
  const schemaVersion = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  if (schemaVersion >= SCRUB_MIGRATION_VERSION) {
    return false;
  }

  const rows = db.prepare(
    `SELECT queue_id, destination_url, destination_ref, secret_ref,
            extra_headers_json, last_error, delivery_receipt_json
     FROM integration_delivery_queue`
  ).all() as Array<Pick<IntegrationQueueRow,
    "queue_id" |
    "destination_url" |
    "destination_ref" |
    "secret_ref" |
    "extra_headers_json" |
    "last_error" |
    "delivery_receipt_json"
  >>;
  const update = db.prepare(
    `UPDATE integration_delivery_queue
     SET destination_url = NULL,
         destination_ref = NULL,
         secret_ref = NULL,
         extra_headers_json = '{}',
         last_error = ?,
         delivery_receipt_json = ?
     WHERE queue_id = ?`
  );
  let scrubbed = false;
  const transaction = db.transaction(() => {
    for (const row of rows) {
      const receipt = parseWebhookReceipt(row.delivery_receipt_json);
      const safeReceipt = receipt ? JSON.stringify(redactWebhookDeliveryReceipt(receipt)) : null;
      const safeError = row.last_error ? normalizeWebhookDeliveryError(row.last_error) : null;
      const needsScrub = Boolean(
        row.destination_url ||
        row.destination_ref ||
        row.secret_ref ||
        row.extra_headers_json !== "{}" ||
        row.last_error !== safeError ||
        row.delivery_receipt_json !== safeReceipt
      );
      if (!needsScrub) {
        continue;
      }
      update.run(safeError, safeReceipt, row.queue_id);
      scrubbed = true;
    }
  });
  transaction();
  db.pragma(`user_version = ${SCRUB_MIGRATION_VERSION}`);
  return scrubbed;
}