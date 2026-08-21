import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { pruneDeliveredIntegrationQueue } from "../../src/integrations/integrationDeliveryQueue.js";

/**
 * ensureSchema ran a one-time redaction migration on every open — and every
 * exported function in that module opens the db — so each queue operation cost
 * a full table scan plus a transaction over every row. Nothing ever deleted
 * DELIVERED rows either, so the table only grew and studio's 60-second drain
 * tick got permanently slower.
 */
function queuePath(workspace: string): string {
  return join(workspace, ".amc", "integration-delivery.sqlite");
}

describe("integration queue maintenance", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-iq-"));
    mkdirSync(join(workspace, ".amc"), { recursive: true });
  });
  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  it("stamps a schema version so the scrub does not re-run", () => {
    // First open runs the migration and records the version.
    pruneDeliveredIntegrationQueue(workspace, 0);
    const db = new Database(queuePath(workspace), { readonly: true });
    const version = db.pragma("user_version", { simple: true }) as number;
    db.close();
    expect(version).toBeGreaterThanOrEqual(1);
  });

  it("removes delivered rows older than the cutoff and keeps the rest", () => {
    pruneDeliveredIntegrationQueue(workspace, 0);
    const db = new Database(queuePath(workspace));
    const insert = db.prepare(
      `INSERT INTO integration_delivery_queue
        (queue_id, channel_id, channel_type, event_name, agent_id, payload_body,
         payload_sha256, ordered_sequence, binding_digest, binding_signature,
         destination_url, destination_ref, secret_ref, extra_headers_json,
         state, attempt_round, max_rounds, next_attempt_ts, created_ts, updated_ts)
       VALUES (?, 'c', 'webhook', 'e', 'default', '{}', 'sha', NULL, 'd', 's',
               NULL, NULL, NULL, '{}', ?, 0, 3, 0, ?, ?)`
    );
    insert.run("old-delivered", "DELIVERED", 100, 100);
    insert.run("new-delivered", "DELIVERED", 5000, 5000);
    insert.run("old-pending", "PENDING", 100, 100);
    insert.run("old-dead", "DEAD_LETTER", 100, 100);
    db.close();

    const removed = pruneDeliveredIntegrationQueue(workspace, 1000);
    expect(removed).toBe(1);

    const after = new Database(queuePath(workspace), { readonly: true });
    const ids = (after.prepare("SELECT queue_id FROM integration_delivery_queue").all() as Array<{
      queue_id: string;
    }>).map((r) => r.queue_id);
    after.close();

    expect(ids).not.toContain("old-delivered");
    // A pending delivery and a dead letter are the operator's business, not
    // maintenance's, however old they are.
    expect(ids).toEqual(expect.arrayContaining(["new-delivered", "old-pending", "old-dead"]));
  });
});
