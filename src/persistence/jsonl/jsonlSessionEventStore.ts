/**
 * The JSONL backend: signed, hash-chained session events in an append-only file.
 *
 * This is NOT an unsigned fast path. dsh's JSONL session logs carry no
 * signatures at all, which is the single largest capability gap between its
 * persistence layer and AMC's; a JSONL backend here that dropped signing to win
 * a benchmark would have thrown away the differentiator the plan says to keep.
 * So every row this backend writes is built from the SAME pre-image helpers the
 * SQLite ledger uses (`canonicalMetadataForHash`, `sanitizeMetaForHash`),
 * chained on `prev_event_hash`, and signed over its own `event_hash` with the
 * workspace monitor key. A row written here and a row written by the ledger
 * differ only in where the bytes landed.
 *
 * Where the two backends genuinely differ, the difference is DECLARED on
 * `capabilities` rather than glossed:
 *
 *  - `concurrentWriters: false`. SQLite serialises writers with BEGIN
 *    IMMEDIATE; a file append has no equivalent, and two writers reading the
 *    same chain head would fork the chain. A writer lock refuses the second
 *    writer at open, turning a silent corruption into a loud failure.
 *  - `powerLossDurable: false`. Every append fsyncs, matching the ledger's
 *    `synchronous = FULL` default, but Node exposes no `F_FULLFSYNC`, so on
 *    macOS/APFS the drive write cache is not flushed. SQLite CAN reach real
 *    power-loss durability here (`PRAGMA fullfsync`, ~96x cost, opt-in per
 *    ADR-0009); this backend cannot, and says so instead of implying parity.
 *
 * What it does NOT differ on, deliberately: the untrusted-writer refusal, the
 * per-event payload size limit, blob-backed payloads, the not-idempotent seal.
 * Each of those is a rule a second backend could quietly become a way around,
 * so each is mirrored here and asserted by the shared conformance suite.
 *
 * One capability is genuinely absent rather than merely different: automatic
 * incident linking, which lives in the same SQLite database as the ledger. For
 * session events this is a no-op on both backends — the 18 spine event types
 * are deliberately excluded from AUTO_INCIDENT_FALLBACK_EVENT_TYPES — so no
 * session-path behaviour changes, but a non-session use of this backend would
 * not get incident auto-linking.
 */
import { createPrivateKey, randomUUID, type KeyObject } from "node:crypto";
import { join } from "node:path";
import type { EvidenceEvent, SessionRecord } from "../../types.js";
import { assertSessionWriteAllowed } from "../../session/sessionOwnership.js";
import { verifyStoredSessionEventMetadata } from "../sessionStoreVerification.js";
import { canonicalMetadataForHash } from "../../ledger/eventHash.js";
import { ensureSigningKeys, getPrivateKeyPem, signHexDigestWith } from "../../crypto/keys.js";
import { loadOpsPolicy } from "../../ops/policy.js";
import { queueEvidenceEventSpan } from "../../observability/otelExporter.js";
import { storeEncryptedBlob } from "../../storage/blobs/blobStore.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import {
  SESSION_STORE_READ_ONLY,
  SESSION_STORE_SEALED,
  type SessionEventStore,
  type SessionStoreOpenOptions,
  type SessionStoreAppendInput,
  type SessionStoreAppendResult,
  type SessionStoreCapabilities,
  type SessionStoreSeal,
  type SessionStoreStartParams
} from "../sessionEventStore.js";
import {
  AppendOnlyFile,
  JsonlWriterLock,
  jsonlEventsPath,
  jsonlLockPath,
  jsonlRoot,
  jsonlSessionsPath,
  lastEventHash,
  readEventRows,
  serializeEventRow
} from "./jsonlEventLog.js";

/** Sentinel head of the global chain, identical to the ledger's. */
const GLOBAL_GENESIS = "GENESIS";

type SessionLifecycleLine =
  | {
      readonly op: "start";
      readonly session_id: string;
      readonly started_ts: number;
      readonly runtime: string;
      readonly binary_path: string;
      readonly binary_sha256: string;
    }
  | {
      readonly op: "seal";
      readonly session_id: string;
      readonly ended_ts: number;
      readonly session_final_event_hash: string;
      readonly session_seal_sig: string;
    };

/**
 * Fold `sessions.jsonl` into the session records it describes.
 *
 * The SQLite table is mutated in place by `sealSession`; an append-only file
 * cannot be, so a seal is a second line that updates the record the start line
 * created. A seal for a session with no start is malformed, not ignorable — it
 * would otherwise be a way to manufacture a sealed session out of nothing.
 */
function readSessionRecords(workspace: string): Map<string, SessionRecord> {
  const path = jsonlSessionsPath(workspace);
  const records = new Map<string, SessionRecord>();
  if (!pathExists(path)) {
    return records;
  }
  const lines = readUtf8(path).split("\n").filter((line) => line.trim().length > 0);
  lines.forEach((line, index) => {
    let parsed: SessionLifecycleLine;
    try {
      parsed = JSON.parse(line) as SessionLifecycleLine;
    } catch {
      throw new Error(`jsonl session log line ${index + 1}: not valid JSON`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || typeof parsed.session_id !== "string" || !parsed.session_id
      || (parsed.op !== "start" && parsed.op !== "seal")) {
      throw new Error(`jsonl session log line ${index + 1}: unsupported lifecycle record`);
    }
    if (parsed.op === "start") {
      if (records.has(parsed.session_id) || !Number.isSafeInteger(parsed.started_ts) || parsed.started_ts < 0
        || typeof parsed.runtime !== "string" || !parsed.runtime || typeof parsed.binary_path !== "string"
        || typeof parsed.binary_sha256 !== "string") {
        throw new Error(`jsonl session log line ${index + 1}: duplicate or malformed session start`);
      }
      records.set(parsed.session_id, {
        session_id: parsed.session_id,
        started_ts: parsed.started_ts,
        ended_ts: null,
        runtime: parsed.runtime as SessionRecord["runtime"],
        binary_path: parsed.binary_path,
        binary_sha256: parsed.binary_sha256,
        session_final_event_hash: null,
        session_seal_sig: null
      });
      return;
    }
    const existing = records.get(parsed.session_id);
    if (existing === undefined) {
      throw new Error(`jsonl session log line ${index + 1}: seal for unstarted session ${parsed.session_id}`);
    }
    if (existing.ended_ts !== null || !Number.isSafeInteger(parsed.ended_ts) || parsed.ended_ts < existing.started_ts
      || typeof parsed.session_final_event_hash !== "string" || !/^[a-f0-9]{64}$/.test(parsed.session_final_event_hash)
      || typeof parsed.session_seal_sig !== "string" || !parsed.session_seal_sig) {
      throw new Error(`jsonl session log line ${index + 1}: duplicate or malformed session seal`);
    }
    records.set(parsed.session_id, {
      ...existing,
      ended_ts: parsed.ended_ts,
      session_final_event_hash: parsed.session_final_event_hash,
      session_seal_sig: parsed.session_seal_sig
    });
  });
  return records;
}

export class JsonlSessionEventStore implements SessionEventStore {
  readonly workspace: string;
  readonly backendId = "jsonl" as const;
  readonly capabilities: SessionStoreCapabilities = {
    powerLossDurable: false,
    concurrentWriters: false
  };
  readonly readOnly: boolean;

  // Null in read-only mode: a reader holds no lock and no descriptors, so
  // verifying a live session does not have to stop it.
  private readonly lock: JsonlWriterLock | null;
  private readonly events: AppendOnlyFile | null;
  private readonly sessions: AppendOnlyFile | null;
  private readonly unsignedSignatures: boolean;

  /**
   * Every event id already in the log, seeded once at open.
   *
   * SQLite gets uniqueness free from `id TEXT PRIMARY KEY`. Re-scanning the log
   * per append to match it would be O(n²) over a session, so the set is built
   * once (O(n) at open) and maintained on write. Without it a caller-supplied
   * duplicate id would produce two rows the verifier's payload/receipt lookups
   * disagree about.
   */
  private readonly knownEventIds: Set<string>;

  private headHash: string;
  private monitorKeyObjectCache: KeyObject | null = null;
  private opsPolicyCache: ReturnType<typeof loadOpsPolicy> | null = null;
  private closed = false;

  constructor(workspace: string, options: SessionStoreOpenOptions = {}) {
    this.workspace = workspace;
    this.readOnly = options.readOnly ?? false;
    this.unsignedSignatures = process.env.AMC_NO_SIGN === "1";

    let lock: JsonlWriterLock | null = null;
    let events: AppendOnlyFile | null = null;
    let sessions: AppendOnlyFile | null = null;
    let head: string = GLOBAL_GENESIS;
    let ids = new Set<string>();

    // A read-only open creates nothing and locks nothing: a verifier that had
    // to mkdir, ensure keys, or take a lock before inspecting a workspace would
    // be changing the thing it is inspecting.
    if (!this.readOnly) {
      ensureDir(jsonlRoot(workspace));
      ensureDir(join(workspace, ".amc", "blobs"));
      // The lock comes before the descriptors: a refused writer must not have
      // created or touched the log files on its way to the error.
      lock = new JsonlWriterLock(jsonlLockPath(workspace));
      try {
        // Authenticate the STORE contract under its mutex. Generic producers
        // have a lower-level schema than native SessionService, so the native
        // continuation callback separately checks original native identity,
        // selected workspace, ownership, configuration and reconstruction.
        // Neither verification reads an empty operations database as history.
        const prior = readEventRows(workspace);
        const records = [...readSessionRecords(workspace).values()];
        if (prior.length) {
          const verified = verifyStoredSessionEventMetadata(workspace, prior, { sessionRecords: records });
          if (!verified.ok) throw new Error("JSONL writer refused: existing history failed authentication; restore the original evidence before appending");
        }
        options.beforeWriterOpen?.();
        lock.assertHeld();
        if (!this.unsignedSignatures) ensureSigningKeys(workspace);
        head = prior.at(-1)?.event_hash ?? GLOBAL_GENESIS;
        ids = new Set(prior.map((row) => row.id));
        events = new AppendOnlyFile(jsonlEventsPath(workspace));
        sessions = new AppendOnlyFile(jsonlSessionsPath(workspace));
      } catch (error) {
        // Release everything this constructor managed to take, or a failed open
        // leaves a descriptor and a lock behind that nothing will ever close.
        events?.close();
        sessions?.close();
        lock.release();
        throw error;
      }
    }

    this.lock = lock;
    this.events = events;
    this.sessions = sessions;
    this.headHash = head;
    this.knownEventIds = ids;
  }

  startSession(params: SessionStoreStartParams): void {
    this.assertWritable();
    if (readSessionRecords(this.workspace).has(params.sessionId)) {
      throw new Error(`session already started: ${params.sessionId}`);
    }
    const line: SessionLifecycleLine = {
      op: "start",
      session_id: params.sessionId,
      started_ts: Date.now(),
      runtime: params.runtime,
      binary_path: params.binaryPath,
      binary_sha256: params.binarySha256
    };
    this.writeSessionLine(line);
  }

  appendSessionEvent(input: SessionStoreAppendInput): SessionStoreAppendResult {
    this.assertWritable();
    const sessionRows = this.readSessionEvents(input.sessionId);
    assertSessionWriteAllowed(input, sessionRows[sessionRows.length - 1] ?? null, this.readSessionRecord(input.sessionId));
    const id = input.id ?? randomUUID();
    if (this.knownEventIds.has(id)) {
      throw new Error(`duplicate event id: ${id}`);
    }
    const ts = input.ts ?? Date.now();

    const stored = this.storePayload(input.payload);
    const metaJson = JSON.stringify(input.meta);
    const canonicalMetadata = canonicalMetadataForHash({
      id,
      ts,
      sessionId: input.sessionId,
      runtime: input.runtime,
      eventType: input.eventType,
      payloadPath: stored.path,
      payloadInline: null,
      metaJson
    });
    const eventHash = sha256Hex(`${this.headHash}${canonicalMetadata}${stored.sha}`);
    const writerSig = this.signMonitorDigest(eventHash);

    const row: EvidenceEvent = {
      id,
      ts,
      session_id: input.sessionId,
      runtime: input.runtime,
      event_type: input.eventType,
      payload_path: stored.path,
      payload_inline: null,
      payload_sha256: stored.sha,
      meta_json: metaJson,
      prev_event_hash: this.headHash,
      event_hash: eventHash,
      writer_sig: writerSig,
      canonical_payload_path: stored.path,
      canonical_payload_inline: null,
      blob_ref: stored.blobRef,
      archived: 0,
      archive_segment_id: null,
      archive_manifest_sha256: null,
      payload_pruned: 0,
      payload_pruned_ts: null
    };

    this.appendOnlyEvents().appendLine(serializeEventRow(row));

    // Advance ONLY after the write returned, exactly as the ledger advances only
    // after its transaction commits: a throw above must leave the head pointing
    // at the last durable row so a retry re-chains from the truth.
    this.headHash = eventHash;
    this.knownEventIds.add(id);
    queueEvidenceEventSpan(row, this.workspace);

    return { id, ts, payloadSha256: stored.sha, eventHash, writerSig };
  }

  readSessionEvents(sessionId: string): readonly EvidenceEvent[] {
    this.assertOpen();
    return readEventRows(this.workspace).filter((row) => row.session_id === sessionId);
  }

  readAllEvents(): readonly EvidenceEvent[] {
    this.assertOpen();
    return readEventRows(this.workspace);
  }

  readSessionRecord(sessionId: string): SessionRecord | null {
    this.assertOpen();
    return readSessionRecords(this.workspace).get(sessionId) ?? null;
  }

  sealSession(sessionId: string): SessionStoreSeal {
    this.assertWritable();
    const record = readSessionRecords(this.workspace).get(sessionId);
    if (record === undefined) {
      throw new Error(`cannot seal unknown session: ${sessionId}`);
    }
    if (record.session_final_event_hash !== null || record.session_seal_sig !== null) {
      throw new Error(SESSION_STORE_SEALED);
    }
    const events = this.readSessionEvents(sessionId);
    // Mirrors the ledger: a session with no events seals to a fixed sentinel
    // digest rather than to nothing, so the sealed/unsealed distinction never
    // depends on an empty string.
    const finalEventHash = events[events.length - 1]?.event_hash ?? sha256Hex("EMPTY_SESSION");
    const sealSig = this.signMonitorDigest(finalEventHash);
    const endedTs = Date.now();
    const line: SessionLifecycleLine = {
      op: "seal",
      session_id: sessionId,
      ended_ts: endedTs,
      session_final_event_hash: finalEventHash,
      session_seal_sig: sealSig
    };
    this.writeSessionLine(line);
    return { sessionId, endedTs, finalEventHash, sealSig };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.events?.close();
    this.sessions?.close();
    this.lock?.release();
  }

  // Writable-mode descriptors. assertWritable has already run, so a null here
  // would be a coding error rather than a caller error.
  private appendOnlyEvents(): AppendOnlyFile {
    if (this.events === null) {
      throw new Error(SESSION_STORE_READ_ONLY);
    }
    return this.events;
  }

  private writeSessionLine(line: SessionLifecycleLine): void {
    if (this.sessions === null) {
      throw new Error(SESSION_STORE_READ_ONLY);
    }
    this.sessions.appendLine(JSON.stringify(line));
  }

  /**
   * Blob-backed payload storage, mirroring `Ledger.storeBlob` including its
   * unencrypted fallback. Sharing the content-addressed blob store is what lets
   * both backends produce the same `payload_sha256` for the same bytes — and
   * the same `payload_path` when encryption is off, since that path is the
   * content digest.
   */
  private storePayload(payload: string | Buffer | undefined): {
    path: string | null;
    sha: string;
    blobRef: string | null;
  } {
    if (payload === undefined) {
      return { path: null, sha: sha256Hex(Buffer.alloc(0)), blobRef: null };
    }
    const bytes = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
    const policy = this.getOpsPolicy();
    const maxBytes = policy.opsPolicy.retention.maxPayloadBytesPerEvent;
    if (bytes.byteLength > maxBytes) {
      throw new Error(`payload exceeds max bytes per event (${bytes.byteLength} > ${maxBytes})`);
    }
    if (bytes.byteLength > policy.opsPolicy.retention.maxBlobBytes) {
      throw new Error(
        `payload exceeds max blob bytes (${bytes.byteLength} > ${policy.opsPolicy.retention.maxBlobBytes})`
      );
    }
    if (!policy.opsPolicy.encryption.blobEncryptionEnabled) {
      const sha = sha256Hex(bytes);
      const name = `${sha}.txt`;
      const full = join(this.workspace, ".amc", "blobs", name);
      if (!pathExists(full)) {
        writeFileAtomic(full, bytes);
      }
      return { path: join(".amc", "blobs", name), sha, blobRef: null };
    }
    const blob = storeEncryptedBlob(this.workspace, bytes);
    return { path: blob.path, sha: blob.payloadSha256, blobRef: blob.blobId };
  }

  private getOpsPolicy(): ReturnType<typeof loadOpsPolicy> {
    if (this.opsPolicyCache === null) {
      this.opsPolicyCache = loadOpsPolicy(this.workspace);
    }
    return this.opsPolicyCache;
  }

  private monitorSigningKey(): KeyObject {
    if (this.monitorKeyObjectCache === null) {
      this.monitorKeyObjectCache = createPrivateKey(getPrivateKeyPem(this.workspace, "monitor"));
    }
    return this.monitorKeyObjectCache;
  }

  private signMonitorDigest(digestHex: string): string {
    return this.unsignedSignatures ? "unsigned" : signHexDigestWith(this.monitorSigningKey(), digestHex);
  }

  /**
   * Mirrors `Ledger.assertTrustedWriter`. Without it the JSONL backend would be
   * a way for an evaluated agent process — the untrusted party AMC exists to
   * observe — to write evidence the SQLite backend would have refused.
   */
  private assertWritable(): void {
    this.assertOpen();
    if (this.readOnly) {
      throw new Error(SESSION_STORE_READ_ONLY);
    }
    this.lock?.assertHeld();
    if (process.env.AMC_EVALUATED_AGENT === "1") {
      throw new Error("untrusted evaluated agent process cannot write to AMC ledger");
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("JsonlSessionEventStore used after close()");
    }
  }
}
