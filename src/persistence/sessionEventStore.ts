/**
 * The persistence seam for the session spine (plan P2.3).
 *
 * Before this module the spine had no seam at all: SessionService opened a
 * concrete `Ledger` in its constructor and then reached past even that API
 * twice with raw SQL (`projectHistory`, `seedHead`). This interface is the one
 * contract both backends implement, and it is deliberately NARROWER than the
 * `Ledger` it replaces:
 *
 *  - no `db` handle — the pre-existing `EvidenceLedgerReader` leaks
 *    `better-sqlite3` into its own type, which is exactly why it could not be
 *    reused here: a JSONL backend cannot implement it;
 *  - no `inline` payload option — session content is ALWAYS blob-backed,
 *    because retention can unlink a blob but cannot touch
 *    `canonical_payload_inline`, and conversation content is the very material
 *    retention exists to delete. Making that unexpressible in the contract is
 *    stronger than documenting it;
 *  - no batch append — event N's envelope commits to event N-1's post-insert
 *    `event_hash`, so consecutive session events cannot share a transaction.
 *    A backend that offered batching here would be offering a broken chain.
 *
 * What a backend MUST NOT do is trade tamper-evidence for speed. Every row a
 * backend returns carries `event_hash` over the same pre-image
 * (`canonicalMetadataForHash`) and a `writer_sig` over that hash by the
 * workspace monitor key — the property dsh's JSONL logs do not have and the
 * reason a second backend here is not simply "the fast path". The shared
 * conformance suite (./conformance/sessionStoreConformance.ts) is what makes
 * that claim checkable rather than aspirational.
 */
import type { EvidenceEvent, EvidenceEventType, RuntimeName, SessionRecord } from "../types.js";
import type { SessionWriteFence } from "../session/sessionOwnership.js";

/** Backends shipped in-tree. A new backend adds a member and a conformance run. */
export type SessionStoreBackendId = "sqlite" | "jsonl";

/**
 * One session event to append.
 *
 * `meta` is written verbatim: KEY ORDER IS LOAD-BEARING. `sanitizeMetaForHash`
 * re-stringifies meta in insertion order and `canonicalize` never descends into
 * it, so a backend that round-trips this object through a schema library (zod
 * `.parse` reorders to schema key order) silently changes every `event_hash`.
 * Backends must serialise it with `JSON.stringify` and store the resulting
 * string unchanged.
 */
export interface SessionStoreAppendInput {
  readonly sessionId: string;
  readonly runtime: RuntimeName;
  readonly eventType: EvidenceEventType;
  readonly meta: Record<string, unknown>;
  /** Blob-backed when present; absent means a control-plane row with no payload. */
  readonly payload?: string | Buffer;
  /** Supplied only when the caller must commit to the id inside the meta it is hashing. */
  readonly id?: string;
  readonly ts?: number;
  /** Checked atomically with append, before payload writes. Native sessions require it. */
  readonly sessionWriteFence?: SessionWriteFence;
}

/** Mirrors the ledger's `AppendEvidenceResult`, which callers already depend on. */
export interface SessionStoreAppendResult {
  readonly id: string;
  readonly ts: number;
  readonly payloadSha256: string;
  readonly eventHash: string;
  readonly writerSig: string;
}

export interface SessionStoreStartParams {
  readonly sessionId: string;
  readonly runtime: RuntimeName;
  readonly binaryPath: string;
  readonly binarySha256: string;
}

/** The result of sealing, returned rather than swallowed so a caller can log it. */
export interface SessionStoreSeal {
  readonly sessionId: string;
  readonly endedTs: number;
  readonly finalEventHash: string;
  readonly sealSig: string;
}

/**
 * Backend properties a caller may legitimately branch on.
 *
 * These exist so a real difference between the backends is DECLARED and
 * conformance-checked rather than discovered in production. The suite asserts
 * the declared value matches observed behaviour where that is observable — a
 * backend claiming `concurrentWriters: false` must fail a second writer loudly,
 * and one claiming `true` must accept it.
 */
export interface SessionStoreCapabilities {
  /**
   * Whether a committed append survives a power cut (not merely a process
   * crash). SQLite reaches this through `PRAGMA fullfsync` when the workspace
   * opts in; Node exposes no `F_FULLFSYNC`, so the JSONL backend reports false
   * on macOS even when the workspace asks for power-loss durability. Stated,
   * not silently equated — see jsonlSessionEventStore's header.
   */
  readonly powerLossDurable: boolean;
  /** Whether more than one process may hold a writer on the same workspace. */
  readonly concurrentWriters: boolean;
}

/**
 * The contract. One session's writer holds one store for the life of the
 * session and releases it at `close()`.
 *
 * Every method is SYNCHRONOUS, and that is a security property rather than a
 * convenience: the queue bound IS the "model-visible ⊆ logged" bound, so a
 * write-behind backend (dsh batches on a 200ms window) would convert a
 * structural guarantee into a race. A future async backend must argue that
 * invariant survives and prove it with a kill-mid-turn test.
 */
export interface SessionEventStore {
  readonly workspace: string;
  readonly backendId: SessionStoreBackendId;
  readonly capabilities: SessionStoreCapabilities;
  /** True when every write method throws and no writer lock is held. */
  readonly readOnly: boolean;

  /**
   * Record the session before any event references it. Verification reports
   * "references missing session" otherwise. Throws if the session already
   * exists — a second start would fork the session's identity.
   */
  startSession(params: SessionStoreStartParams): void;

  /** Append one signed, hash-chained session event. Returns once it is durable. */
  appendSessionEvent(input: SessionStoreAppendInput): SessionStoreAppendResult;

  /** This session's events in commit order. */
  readSessionEvents(sessionId: string): readonly EvidenceEvent[];

  /** Every event in the workspace, in global chain order. */
  readAllEvents(): readonly EvidenceEvent[];

  /** The session's lifecycle row, or null if it was never started. */
  readSessionRecord(sessionId: string): SessionRecord | null;

  /**
   * Seal the session to its last event. NOT idempotent by contract: a second
   * seal throws, mirroring the `protect_sessions_sealed_immutable` trigger, so
   * a dual-write or cutover cannot silently re-seal. Throws for a session that
   * was never started.
   */
  sealSession(sessionId: string): SessionStoreSeal;

  /** Release the backend's resources. Further calls throw. */
  close(): void;
}

/**
 * How to open a store.
 *
 * `readOnly` exists because verification must be possible on a LIVE workspace.
 * The JSONL backend refuses a second writer (see its `concurrentWriters`
 * capability), so without a read-only mode the only way to verify a running
 * session would be to stop it — which would make the verifier something an
 * operator runs after the fact rather than while it matters. A read-only store
 * takes no writer lock and throws from every write method.
 */
export interface SessionStoreOpenOptions {
  readonly readOnly?: boolean;
}

/** Thrown when a write is attempted on a read-only store. */
export const SESSION_STORE_READ_ONLY = "session event store is read-only";

/** Thrown when a second writer attempts to open a single-writer backend. */
export const SESSION_STORE_LOCKED = "session event store is locked by another writer";

/** Thrown on a second `sealSession`. Matches the SQLite trigger's wording. */
export const SESSION_STORE_SEALED = "sealed sessions are immutable";
