/**
 * The Postgres backend (P2-09d, ADR 018 decision 5): signed, hash-chained
 * session events in a Postgres database, so an HA Postgres (CloudNativePG,
 * Patroni, a managed service) keeps evidence rows through the loss of a node.
 *
 * Rows are built by the same helpers as the JSONL backend and hashed over the
 * ledger's pre-image, so they verify with the same verifier. What Postgres adds
 * is one writer per chain across processes and hosts:
 *
 *  - every append locks the chain head row (`SELECT … FOR UPDATE`) inside one
 *    transaction, so concurrent writers queue instead of reading the same head;
 *  - `UNIQUE (chain_id, prev_event_hash)` makes a fork unwritable even if the
 *    lock were bypassed, and the head update is conditional on the head it read;
 *  - appends are idempotent by event id: a retry of an append whose commit
 *    landed but whose reply was lost returns the committed row, and a different
 *    event under a used id is refused.
 *
 * During a primary loss every call fails closed with PostgresUnavailableError
 * and writes nothing; the next call reconnects, so appends resume once the
 * operator's HA setup has promoted a new primary.
 *
 * Not covered: blobs stay on the workspace volume (`.amc/blobs`), and so do the
 * keys. Postgres protects the rows, not the payload bytes they point at.
 * Provider-delegated ledger signing is refused here rather than half-supported:
 * its usage accounting reads the SQLite and JSONL streams only.
 */
import { randomUUID, type KeyObject } from "node:crypto";
import { join } from "node:path";
import type { EvidenceEvent, SessionRecord } from "../../types.js";
import { ensureSigningKeys, signHexDigestWith } from "../../crypto/keys.js";
import { cachedSigningKey } from "../../keys/cachedSigningKey.js";
import { withDelegationUseLock } from "../../keys/delegationUsage.js";
import { readOperationalDelegationState } from "../../keys/operationalDelegationState.js";
import { loadOpsPolicy } from "../../ops/policy.js";
import { queueEvidenceEventSpan } from "../../observability/otelExporter.js";
import { assertSessionWriteAllowed } from "../../session/sessionOwnership.js";
import { workspaceSelfTrust } from "../../trust/trustContext.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { buildSessionEventRow, EMPTY_SESSION_SEAL_DIGEST, GLOBAL_GENESIS, storeSessionPayload } from "../sessionEventRows.js";
import { verifyStoredSessionEventMetadata } from "../sessionStoreVerification.js";
import {
  SESSION_STORE_READ_ONLY,
  SESSION_STORE_SEALED,
  type SessionEventStore,
  type SessionStoreAppendInput,
  type SessionStoreAppendResult,
  type SessionStoreCapabilities,
  type SessionStoreOpenOptions,
  type SessionStoreSeal,
  type SessionStoreStartParams
} from "../sessionEventStore.js";
import { postgresChainProblems, readSignedPostgresHeadForCheck, recordSignedPostgresHead, type PostgresChainSnapshot } from "./postgresHead.js";
import { ensurePostgresSchema, EVENT_READ_COLUMNS, numberOrNull, SESSION_READ_COLUMNS } from "./postgresSchema.js";
import { PostgresStatementError, readPostgresUrl, SyncPgClient, type SyncPgOptions } from "./syncPgClient.js";

export interface PostgresStoreOpenOptions extends SessionStoreOpenOptions {
  /** Driver and timeout. Code-only: nothing reads these from env or argv. */
  readonly pg?: SyncPgOptions;
}

const UNIQUE_VIOLATION = "23505";
const EVENT_SELECT = `SELECT ${EVENT_READ_COLUMNS.join(", ")} FROM evidence_events`;
const SESSION_SELECT = `SELECT ${SESSION_READ_COLUMNS.join(", ")} FROM sessions`;

/** The workspace's chain id in a shared database, recorded on first writable open. */
function chainIdPath(workspace: string): string {
  return join(workspace, ".amc", "postgres-store.json");
}

export function readPostgresChainId(workspace: string): string | null {
  const path = chainIdPath(workspace);
  if (!pathExists(path)) return null;
  const parsed = JSON.parse(readUtf8(path)) as { chainId?: unknown };
  if (typeof parsed.chainId !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(parsed.chainId)) {
    throw new Error(".amc/postgres-store.json is malformed; restore it from the workspace backup");
  }
  return parsed.chainId;
}

/** The recorded chain id, or `chainId` recorded now (migration passes the id it committed under). */
export function ensurePostgresChainId(workspace: string, chainId: string = randomUUID()): string {
  const existing = readPostgresChainId(workspace);
  if (existing !== null) return existing;
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(chainIdPath(workspace), `${JSON.stringify({ v: 1, chainId }, null, 2)}\n`, 0o644);
  return chainId;
}

function toEvent(row: Record<string, unknown>): EvidenceEvent {
  return {
    ...(row as unknown as EvidenceEvent),
    ts: Number(row.ts),
    archived: Number(row.archived ?? 0),
    payload_pruned: Number(row.payload_pruned ?? 0),
    payload_pruned_ts: numberOrNull(row.payload_pruned_ts)
  };
}

function toSession(row: Record<string, unknown>): SessionRecord {
  return { ...(row as unknown as SessionRecord), started_ts: Number(row.started_ts), ended_ts: numberOrNull(row.ended_ts) };
}

function payloadSha(payload: string | Buffer | undefined): string {
  return sha256Hex(payload === undefined ? Buffer.alloc(0) : typeof payload === "string" ? Buffer.from(payload, "utf8") : payload);
}

export class PostgresSessionEventStore implements SessionEventStore {
  readonly workspace: string;
  readonly backendId = "postgres" as const;
  readonly capabilities: SessionStoreCapabilities = {
    // Durability is the server's fsync and synchronous-replication settings,
    // which a client cannot observe. Stated as false rather than assumed.
    powerLossDurable: false,
    concurrentWriters: true
  };
  readonly readOnly: boolean;

  /** Null on a read-only open of a workspace that never wrote here: it reads as empty. */
  private readonly chainId: string | null;
  private readonly client: SyncPgClient;
  private readonly unsignedSignatures = process.env.AMC_NO_SIGN === "1";
  private readonly monitorSigningKey: () => KeyObject;
  private opsPolicyCache: ReturnType<typeof loadOpsPolicy> | null = null;
  private closed = false;

  constructor(workspace: string, options: PostgresStoreOpenOptions = {}) {
    this.workspace = workspace;
    this.readOnly = options.readOnly ?? false;
    this.monitorSigningKey = cachedSigningKey(workspace, "ledger-row");
    this.chainId = this.readOnly ? readPostgresChainId(workspace) : ensurePostgresChainId(workspace);
    this.client = new SyncPgClient(readPostgresUrl(), options.pg);
    if (this.readOnly) return;
    try {
      ensurePostgresSchema(this.client);
      this.client.query(
        "INSERT INTO amc_chain_heads (chain_id, head_hash, head_seq) VALUES ($1, $2, 0) ON CONFLICT (chain_id) DO NOTHING",
        [this.chainId, GLOBAL_GENESIS]
      );
      // Authenticate the history this writer will chain from, as JSONL does:
      // rows in a database are as editable as lines in a file.
      const signed = readSignedPostgresHeadForCheck(workspace);
      const snapshot = this.readChainSnapshot();
      if (snapshot === null) throw new Error("Postgres writer has no chain id");
      const prior = snapshot.events.map((entry) => entry.event);
      const verified = verifyStoredSessionEventMetadata(workspace, prior, { sessionRecords: snapshot.sessions, trust: workspaceSelfTrust(workspace) });
      if ((prior.length > 0 && !verified.ok) || postgresChainProblems(workspace, snapshot, signed).length > 0) {
        throw new Error("Postgres writer refused: existing history failed authentication; restore the original evidence before appending");
      }
      options.beforeWriterOpen?.();
      if (!this.unsignedSignatures) ensureSigningKeys(workspace);
    } catch (error) {
      this.client.close();
      throw error;
    }
  }

  startSession(params: SessionStoreStartParams): void {
    this.assertWritable();
    try {
      this.client.query(
        "INSERT INTO sessions (chain_id, session_id, started_ts, ended_ts, runtime, binary_path, binary_sha256) VALUES ($1, $2, $3, NULL, $4, $5, $6)",
        [this.chainId, params.sessionId, Date.now(), params.runtime, params.binaryPath, params.binarySha256]
      );
    } catch (error) {
      if (error instanceof PostgresStatementError && error.sqlState === UNIQUE_VIOLATION) {
        throw new Error(`session already started: ${params.sessionId}`);
      }
      throw error;
    }
  }

  appendSessionEvent(input: SessionStoreAppendInput): SessionStoreAppendResult {
    this.assertWritable();
    const id = input.id ?? randomUUID();
    const ts = input.ts ?? Date.now();
    const metaJson = JSON.stringify(input.meta);
    return withDelegationUseLock(this.workspace, () => {
      if (!this.unsignedSignatures && readOperationalDelegationState(this.workspace) !== null) {
        throw new Error("the Postgres session store does not support provider-delegated ledger signing; use the sqlite or jsonl store");
      }
      const committed = this.transaction(() => {
        const head = this.client.query("SELECT head_hash, head_seq FROM amc_chain_heads WHERE chain_id = $1 FOR UPDATE", [this.chainId]).rows[0];
        if (head === undefined) throw new Error("Postgres chain head is missing; reopen the store");
        // Ids are keyed per chain. An id another workspace's chain holds is never this chain's retry.
        if (this.client.query("SELECT 1 AS hit FROM evidence_events WHERE id = $1 AND chain_id <> $2 LIMIT 1", [id, this.chainId]).rows.length > 0) {
          throw new Error(`event id ${id} is already used by another chain in this database; refused`);
        }
        const existing = this.client.query(`${EVENT_SELECT} WHERE chain_id = $1 AND id = $2`, [this.chainId, id]).rows[0];
        if (existing !== undefined) return { result: this.retriedAppend(toEvent(existing), input, metaJson), committedSeq: null };
        const last = this.client.query(`${EVENT_SELECT} WHERE chain_id = $1 AND session_id = $2 ORDER BY chain_seq DESC LIMIT 1`,
          [this.chainId, input.sessionId]).rows[0];
        assertSessionWriteAllowed(input, last === undefined ? null : toEvent(last), this.readSessionRecord(input.sessionId));
        const prevHash = String(head.head_hash);
        const seq = Number(head.head_seq) + 1;
        const stored = storeSessionPayload(this.workspace, this.getOpsPolicy(), input.payload);
        const row = buildSessionEventRow({ id, ts, input, metaJson, stored, prevHash, sign: (digest) => this.signMonitorDigest(digest) });
        const values = [this.chainId, seq, ...EVENT_READ_COLUMNS.map((column) => row[column as keyof EvidenceEvent] ?? null)];
        this.client.query(
          `INSERT INTO evidence_events (chain_id, chain_seq, ${EVENT_READ_COLUMNS.join(", ")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})`,
          values
        );
        const moved = this.client.query(
          "UPDATE amc_chain_heads SET head_hash = $2, head_seq = $3 WHERE chain_id = $1 AND head_hash = $4",
          [this.chainId, row.event_hash, seq, prevHash]
        );
        if (moved.rowCount !== 1) throw new Error("Postgres chain head moved during the append; nothing was committed");
        queueEvidenceEventSpan(row, this.workspace);
        return { result: { id, ts, payloadSha256: stored.sha, eventHash: row.event_hash, writerSig: row.writer_sig }, committedSeq: seq };
      });
      // Sign only the head this writer committed, never one read back from the database.
      if (committed.committedSeq !== null) recordSignedPostgresHead(this.workspace, this.chainId!, committed.result.eventHash, committed.committedSeq);
      return committed.result;
    });
  }

  readSessionEvents(sessionId: string): readonly EvidenceEvent[] {
    this.assertOpen();
    if (this.chainId === null) return [];
    return this.client.query(`${EVENT_SELECT} WHERE chain_id = $1 AND session_id = $2 ORDER BY chain_seq ASC`, [this.chainId, sessionId]).rows.map(toEvent);
  }

  readAllEvents(): readonly EvidenceEvent[] {
    this.assertOpen();
    if (this.chainId === null) return [];
    return this.client.query(`${EVENT_SELECT} WHERE chain_id = $1 ORDER BY chain_seq ASC`, [this.chainId]).rows.map(toEvent);
  }

  readSessionRecord(sessionId: string): SessionRecord | null {
    this.assertOpen();
    if (this.chainId === null) return null;
    const row = this.client.query(`${SESSION_SELECT} WHERE chain_id = $1 AND session_id = $2`, [this.chainId, sessionId]).rows[0];
    return row === undefined ? null : toSession(row);
  }

  sealSession(sessionId: string): SessionStoreSeal {
    this.assertWritable();
    return this.transaction(() => {
      const record = this.client.query(`${SESSION_SELECT} WHERE chain_id = $1 AND session_id = $2 FOR UPDATE`, [this.chainId, sessionId]).rows[0];
      if (record === undefined) throw new Error(`cannot seal unknown session: ${sessionId}`);
      if (record.session_final_event_hash !== null || record.session_seal_sig !== null) throw new Error(SESSION_STORE_SEALED);
      const last = this.client.query(`SELECT event_hash FROM evidence_events WHERE chain_id = $1 AND session_id = $2 ORDER BY chain_seq DESC LIMIT 1`,
        [this.chainId, sessionId]).rows[0];
      const finalEventHash = last === undefined ? EMPTY_SESSION_SEAL_DIGEST : String(last.event_hash);
      const sealSig = this.signMonitorDigest(finalEventHash);
      const endedTs = Date.now();
      const sealed = this.client.query(
        `UPDATE sessions SET ended_ts = $3, session_final_event_hash = $4, session_seal_sig = $5
          WHERE chain_id = $1 AND session_id = $2 AND session_final_event_hash IS NULL AND session_seal_sig IS NULL`,
        [this.chainId, sessionId, endedTs, finalEventHash, sealSig]
      );
      if (sealed.rowCount !== 1) throw new Error(SESSION_STORE_SEALED);
      return { sessionId, endedTs, finalEventHash, sealSig };
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.client.close();
  }

  /**
   * Rows, sequence numbers, the database head and session records from one
   * snapshot (REPEATABLE READ), so a live writer cannot make them disagree.
   * Null on a read-only open of a workspace that never wrote to Postgres.
   */
  readChainSnapshot(): (PostgresChainSnapshot & { readonly sessions: SessionRecord[] }) | null {
    this.assertOpen();
    const chainId = this.chainId;
    if (chainId === null) return null;
    return this.transaction(() => {
      const head = this.client.query("SELECT head_hash, head_seq FROM amc_chain_heads WHERE chain_id = $1", [chainId]).rows[0];
      const events = this.client.query(`SELECT chain_seq, ${EVENT_READ_COLUMNS.join(", ")} FROM evidence_events WHERE chain_id = $1 ORDER BY chain_seq ASC`, [chainId])
        .rows.map((row) => ({ seq: Number(row.chain_seq), event: toEvent(Object.fromEntries(Object.entries(row).filter(([key]) => key !== "chain_seq"))) }));
      const sessions = this.client.query(`${SESSION_SELECT} WHERE chain_id = $1`, [chainId]).rows.map(toSession);
      return { chainId, events, sessions, head: head === undefined ? null : { hash: String(head.head_hash), seq: Number(head.head_seq) } };
    }, "BEGIN ISOLATION LEVEL REPEATABLE READ");
  }

  /** A retry whose first attempt committed returns that row; anything else under a used id is refused. */
  private retriedAppend(existing: EvidenceEvent, input: SessionStoreAppendInput, metaJson: string): SessionStoreAppendResult {
    const same = existing.session_id === input.sessionId && existing.event_type === input.eventType
      && existing.runtime === input.runtime && existing.meta_json === metaJson
      && existing.payload_sha256 === payloadSha(input.payload);
    if (!same) throw new Error(`duplicate event id: ${existing.id}`);
    return { id: existing.id, ts: existing.ts, payloadSha256: existing.payload_sha256, eventHash: existing.event_hash, writerSig: existing.writer_sig };
  }

  private transaction<T>(body: () => T, begin = "BEGIN"): T {
    this.client.query(begin);
    try {
      const result = body();
      this.client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        this.client.query("ROLLBACK");
      } catch {
        // The connection is gone; the server aborts the transaction with it.
      }
      throw error;
    }
  }

  private getOpsPolicy(): ReturnType<typeof loadOpsPolicy> {
    this.opsPolicyCache ??= loadOpsPolicy(this.workspace);
    return this.opsPolicyCache;
  }

  private signMonitorDigest(digestHex: string): string {
    return this.unsignedSignatures ? "unsigned" : signHexDigestWith(this.monitorSigningKey(), digestHex);
  }

  /** Mirrors `Ledger.assertTrustedWriter`: the observed agent never writes its own evidence. */
  private assertWritable(): void {
    this.assertOpen();
    if (this.readOnly) throw new Error(SESSION_STORE_READ_ONLY);
    if (process.env.AMC_EVALUATED_AGENT === "1") throw new Error("untrusted evaluated agent process cannot write to AMC ledger");
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("PostgresSessionEventStore used after close()");
  }
}
