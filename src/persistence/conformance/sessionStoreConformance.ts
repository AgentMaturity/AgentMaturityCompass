/**
 * The SHARED conformance suite for `SessionEventStore` backends.
 *
 * The plan's exit criterion is "both backends pass the conformance suite", and
 * the failure mode that phrase usually hides is two test files that started as
 * copies and drifted — at which point "both pass" is true of two different
 * suites. So the assertions live here, once, as data: a backend is a factory,
 * a run is `cases × that factory`, and the only thing a test file supplies is
 * how to make a workspace.
 *
 * Two properties this file is written to preserve:
 *
 *  1. A case FAILS loudly. Cases throw; the runner turns a throw into a named
 *     finding. A backend that omits a rule therefore turns a run red rather
 *     than merely not exercising it. tests/persistence/ proves this by running
 *     deliberately-broken backends through the same suite and asserting which
 *     case each one breaks.
 *
 *  2. No test-framework import. This ships in `src/` so a consumer adding a
 *     backend can run it, and so it can be run outside vitest. Assertions are
 *     plain throws.
 *
 * Cases drive the store the way the spine does — envelope-carrying rows written
 * through a minimal writer here rather than through SessionService — so a
 * backend can be conformance-checked on its own, before it is wired to
 * anything.
 */
import { randomUUID } from "node:crypto";
import type { EvidenceEvent, SessionRecord } from "../../types.js";
import { canonicalMetadataForHash } from "../../ledger/eventHash.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../../crypto/keys.js";
import { loadOpsPolicy } from "../../ops/policy.js";
import {
  embedEnvelope,
  SESSION_GENESIS,
  extractEnvelope,
  type SessionEnvelope
} from "../../session/sessionTypes.js";
import { loadBlobPlaintext } from "../../storage/blobs/blobStore.js";
import { sha256Hex } from "../../utils/hash.js";
import {
  SESSION_STORE_READ_ONLY,
  SESSION_STORE_SEALED,
  type SessionEventStore
} from "../sessionEventStore.js";
import { verifyStoredSessionEvents } from "../sessionStoreVerification.js";

const GLOBAL_GENESIS = "GENESIS";

export interface ConformanceWorkspace {
  readonly workspace: string;
  dispose(): void;
}

/** What a backend must supply to be conformance-checked. */
export interface ConformanceBackend {
  readonly backendId: string;
  /** A fresh, isolated workspace with AMC signing keys available. */
  createWorkspace(): ConformanceWorkspace;
  /** Open a writer on that workspace. Cases open and close more than one. */
  open(workspace: string): SessionEventStore;
  /** Open a reader on that workspace — no writer lock, no writes. */
  openReadOnly(workspace: string): SessionEventStore;
}

export interface ConformanceContext {
  readonly workspace: string;
  readonly backendId: string;
  /** Open a store the runner will close even if the case throws. */
  open(): SessionEventStore;
  /** Open a read-only store the runner will close even if the case throws. */
  openReadOnly(): SessionEventStore;
}

export interface ConformanceCase {
  readonly name: string;
  /** Why the rule exists — read by whoever has to decide if a failure matters. */
  readonly why: string;
  run(ctx: ConformanceContext): void;
}

export interface ConformanceFailure {
  readonly caseName: string;
  readonly message: string;
}

export interface ConformanceReport {
  readonly backendId: string;
  readonly ok: boolean;
  readonly passed: readonly string[];
  readonly failed: readonly ConformanceFailure[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertThrows(fn: () => unknown, label: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${label}: expected a throw, none happened`);
}

/**
 * A minimal single-session writer: assigns the SessionEnvelope, appends, then
 * advances the head from what was committed.
 *
 * This mirrors SessionService's append seam rather than reusing it, so the
 * suite tests the STORE and not the service. If the two ever disagree about how
 * the envelope is assigned, the spine's own tests catch that; here the point is
 * that a backend preserves whatever envelope it was handed, byte for byte,
 * inside the hash.
 */
class ConformanceSpineWriter {
  private seq = 0;
  private prevHash: string = SESSION_GENESIS;

  constructor(
    private readonly store: SessionEventStore,
    readonly sessionId: string
  ) {}

  start(): void {
    this.store.startSession({
      sessionId: this.sessionId,
      runtime: "amc",
      binarySha256: sha256Hex(this.sessionId),
      binaryPath: "conformance-agent"
    });
  }

  append(spec: {
    readonly eventType: EvidenceEvent["event_type"];
    readonly typeMeta?: Record<string, unknown>;
    readonly payload?: string;
    readonly id?: string;
  }): { id: string; eventHash: string } {
    const envelope: SessionEnvelope = {
      v: 1,
      sessionId: this.sessionId,
      seq: this.seq,
      prevSessionEventHash: this.prevHash,
      turn: null,
      step: null,
      surface: { op: "none" },
      synthetic: false
    };
    const result = this.store.appendSessionEvent({
      sessionId: this.sessionId,
      runtime: "amc",
      eventType: spec.eventType,
      meta: embedEnvelope(spec.typeMeta ?? {}, envelope),
      ...(spec.id !== undefined ? { id: spec.id } : {}),
      ...(spec.payload !== undefined ? { payload: spec.payload } : {})
    });
    this.seq += 1;
    this.prevHash = result.eventHash;
    return { id: result.id, eventHash: result.eventHash };
  }
}

/** A short, well-formed session: open, one content event, close. */
function writeSampleSession(store: SessionEventStore, sessionId: string): ConformanceSpineWriter {
  const writer = new ConformanceSpineWriter(store, sessionId);
  writer.start();
  writer.append({ eventType: "session/open", typeMeta: { agentId: "conformance" } });
  writer.append({ eventType: "user/message", payload: "hello from the conformance suite" });
  writer.append({ eventType: "session/close", typeMeta: { reason: "conformance" } });
  return writer;
}

function recordsOf(store: SessionEventStore, sessionIds: readonly string[]): SessionRecord[] {
  const records: SessionRecord[] = [];
  for (const id of sessionIds) {
    const record = store.readSessionRecord(id);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

export const SESSION_STORE_CONFORMANCE_CASES: readonly ConformanceCase[] = [
  {
    name: "append-round-trips-in-commit-order",
    why: "A store that reorders or loses a row breaks every chain check downstream of it.",
    run: (ctx) => {
      const store = ctx.open();
      const writer = new ConformanceSpineWriter(store, randomUUID());
      writer.start();
      const appended = [
        writer.append({ eventType: "session/open" }),
        writer.append({ eventType: "user/message", payload: "one" }),
        writer.append({ eventType: "assistant/block", payload: "two" })
      ];
      const rows = store.readSessionEvents(writer.sessionId);
      assertEqual(rows.length, appended.length, "row count");
      appended.forEach((ref, index) => {
        const row = rows[index];
        assert(row !== undefined, `row ${index} missing`);
        assertEqual(row.id, ref.id, `row ${index} id`);
        assertEqual(row.event_hash, ref.eventHash, `row ${index} event_hash`);
      });
    }
  },
  {
    name: "global-chain-links-from-genesis",
    why: "prev_event_hash is the workspace-wide order; a broken link is undetectable insertion.",
    run: (ctx) => {
      const store = ctx.open();
      writeSampleSession(store, randomUUID());
      const rows = store.readAllEvents();
      assert(rows.length > 0, "no rows were written");
      let previous = GLOBAL_GENESIS;
      for (const row of rows) {
        assertEqual(row.prev_event_hash, previous, `event ${row.id} prev_event_hash`);
        previous = row.event_hash;
      }
    }
  },
  {
    name: "event-hash-is-recomputable-from-the-shared-pre-image",
    why:
      "Writer and verifier must canonicalise identically; a backend that stringifies meta " +
      "differently produces rows that fail their own verification.",
    run: (ctx) => {
      const store = ctx.open();
      writeSampleSession(store, randomUUID());
      for (const row of store.readAllEvents()) {
        const canonical = canonicalMetadataForHash({
          id: row.id,
          ts: row.ts,
          sessionId: row.session_id,
          runtime: row.runtime,
          eventType: row.event_type,
          payloadPath: row.canonical_payload_path ?? row.payload_path,
          payloadInline: row.canonical_payload_inline ?? row.payload_inline,
          metaJson: row.meta_json
        });
        const expected = sha256Hex(`${row.prev_event_hash}${canonical}${row.payload_sha256}`);
        assertEqual(row.event_hash, expected, `event ${row.id} event_hash`);
      }
    }
  },
  {
    name: "every-row-carries-a-valid-monitor-signature",
    why:
      "This is the property dsh's JSONL logs do not have. A backend that skipped signing " +
      "would be a fast path that silently costs the workspace its tamper-evidence.",
    run: (ctx) => {
      const store = ctx.open();
      writeSampleSession(store, randomUUID());
      const monitorKeys = getPublicKeyHistory(ctx.workspace, "monitor");
      assert(monitorKeys.length > 0, "workspace has no monitor public key");
      for (const row of store.readAllEvents()) {
        assert(row.writer_sig !== "unsigned", `event ${row.id} is unsigned`);
        assert(
          verifyHexDigestAny(row.event_hash, row.writer_sig, monitorKeys),
          `event ${row.id} writer signature does not verify`
        );
      }
    }
  },
  {
    name: "per-session-envelope-chain-is-preserved",
    why:
      "seq and prevSessionEventHash live in meta_json and so inside event_hash. A backend " +
      "that re-serialises meta (zod .parse reorders keys) breaks this while everything else " +
      "still looks fine.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      writeSampleSession(store, sessionId);
      let expectedSeq = 0;
      let expectedPrev: string = SESSION_GENESIS;
      for (const row of store.readSessionEvents(sessionId)) {
        const envelope = extractEnvelope(row.meta_json);
        assert(envelope !== null, `event ${row.id} lost its session envelope`);
        assertEqual(envelope.sessionId, sessionId, `event ${row.id} envelope sessionId`);
        assertEqual(envelope.seq, expectedSeq, `event ${row.id} envelope seq`);
        assertEqual(envelope.prevSessionEventHash, expectedPrev, `event ${row.id} envelope prev`);
        expectedSeq += 1;
        expectedPrev = row.event_hash;
      }
      assert(expectedSeq > 0, "session produced no envelope-carrying rows");
    }
  },
  {
    name: "payloads-are-blob-backed-and-retrievable",
    why:
      "Retention can unlink a blob but cannot touch canonical_payload_inline, so conversation " +
      "content must never be inline — and the stored bytes must still match payload_sha256.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      const writer = new ConformanceSpineWriter(store, sessionId);
      writer.start();
      writer.append({ eventType: "session/open" });
      const content = "conformance payload — blob-backed, never inline";
      writer.append({ eventType: "user/message", payload: content });
      const row = store.readSessionEvents(sessionId).find((candidate) => candidate.payload_path !== null);
      assert(row !== undefined, "no blob-backed row was written");
      assertEqual(row.payload_inline, null, "payload_inline");
      assertEqual(row.payload_sha256, sha256Hex(Buffer.from(content, "utf8")), "payload_sha256");
      const loaded = loadBlobPlaintext(ctx.workspace, row.payload_path as string);
      assertEqual(loaded.bytes.toString("utf8"), content, "retrieved payload");
    }
  },
  {
    name: "a-clean-log-verifies",
    why: "The store-level verifier is the seam's oracle; if a clean log fails it, it is useless.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      writeSampleSession(store, sessionId);
      store.sealSession(sessionId);
      const result = verifyStoredSessionEvents(ctx.workspace, store.readAllEvents(), {
        sessionRecords: recordsOf(store, [sessionId])
      });
      assert(result.ok, `clean log failed verification: ${result.errors.join("; ")}`);
    }
  },
  {
    name: "chain-head-survives-a-reopen",
    why:
      "A crashed or restarted writer must chain from the last durable row, not from GENESIS; " +
      "a forked chain is silent history loss.",
    run: (ctx) => {
      const sessionId = randomUUID();
      const first = ctx.open();
      writeSampleSession(first, sessionId);
      const lastBefore = first.readAllEvents().at(-1);
      assert(lastBefore !== undefined, "no rows before reopen");
      first.close();

      const second = ctx.open();
      const resumed = second.appendSessionEvent({
        sessionId,
        runtime: "amc",
        eventType: "session/recovered",
        meta: { note: "reopened" }
      });
      const rows = second.readAllEvents();
      const appended = rows.find((row) => row.id === resumed.id);
      assert(appended !== undefined, "row appended after reopen is missing");
      assertEqual(appended.prev_event_hash, lastBefore.event_hash, "prev_event_hash after reopen");
    }
  },
  {
    name: "sessions-must-be-started-once-and-before-sealing",
    why:
      "Verification reports 'references missing session' for an event with no session row, and a " +
      "second start would fork the session's identity.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      assertThrows(() => store.sealSession(sessionId), "seal of an unstarted session");
      const writer = new ConformanceSpineWriter(store, sessionId);
      writer.start();
      assertThrows(() => writer.start(), "second startSession");
      assert(store.readSessionRecord(sessionId) !== null, "session record missing after start");
    }
  },
  {
    name: "seal-is-not-idempotent",
    why:
      "protect_sessions_sealed_immutable raises on a second seal. A backend that allowed one " +
      "would let a dual-write or cutover re-seal a session under a different tail.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      writeSampleSession(store, sessionId);
      store.sealSession(sessionId);
      const error = assertThrows(() => store.sealSession(sessionId), "second sealSession");
      assert(
        error.message.includes(SESSION_STORE_SEALED),
        `second seal threw the wrong error: ${error.message}`
      );
    }
  },
  {
    name: "seal-names-the-sessions-last-event",
    why:
      "A seal over an arbitrary hash is a valid signature over nothing. The sealed hash must be " +
      "the session's actual tail, and the signature must verify against the monitor key.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      writeSampleSession(store, sessionId);
      const last = store.readSessionEvents(sessionId).at(-1);
      assert(last !== undefined, "session has no events");
      const seal = store.sealSession(sessionId);
      assertEqual(seal.finalEventHash, last.event_hash, "sealed final event hash");
      const record = store.readSessionRecord(sessionId);
      assert(record !== null, "session record missing after seal");
      assertEqual(record.session_final_event_hash, last.event_hash, "recorded final event hash");
      assert(
        verifyHexDigestAny(seal.finalEventHash, seal.sealSig, getPublicKeyHistory(ctx.workspace, "monitor")),
        "seal signature does not verify"
      );
    }
  },
  {
    name: "oversize-payloads-are-refused-without-advancing-the-head",
    why:
      "The per-event size limit is an ops-policy rule, not a SQLite detail; and a refused append " +
      "must leave the head at the last durable row so the retry re-chains from the truth.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      const writer = new ConformanceSpineWriter(store, sessionId);
      writer.start();
      const before = writer.append({ eventType: "session/open" });
      const limit = loadOpsPolicy(ctx.workspace).opsPolicy.retention.maxPayloadBytesPerEvent;
      assertThrows(
        () => writer.append({ eventType: "user/message", payload: "x".repeat(limit + 1) }),
        "oversize payload append"
      );
      const after = writer.append({ eventType: "user/message", payload: "small" });
      const rows = store.readSessionEvents(sessionId);
      assertEqual(rows.length, 2, "row count after a refused append");
      const appended = rows.find((row) => row.id === after.id);
      assert(appended !== undefined, "post-refusal row missing");
      assertEqual(appended.prev_event_hash, before.eventHash, "prev_event_hash after a refused append");
    }
  },
  {
    name: "duplicate-event-ids-are-refused",
    why:
      "SQLite gets this from `id TEXT PRIMARY KEY`. A backend without that guard lets two rows " +
      "share an id, and every id-keyed lookup (receipts, payload checks) then disagrees.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      const writer = new ConformanceSpineWriter(store, sessionId);
      writer.start();
      const pinned = randomUUID();
      writer.append({ eventType: "session/open", id: pinned });
      assertThrows(() => writer.append({ eventType: "user/message", id: pinned }), "duplicate id append");
    }
  },
  {
    name: "an-untrusted-evaluated-agent-cannot-write",
    why:
      "AMC_EVALUATED_AGENT=1 marks the process AMC is observing. A backend that accepted its " +
      "writes would be a way for the observed party to author its own evidence.",
    run: (ctx) => {
      const store = ctx.open();
      const sessionId = randomUUID();
      const writer = new ConformanceSpineWriter(store, sessionId);
      writer.start();
      const prior = process.env.AMC_EVALUATED_AGENT;
      process.env.AMC_EVALUATED_AGENT = "1";
      try {
        assertThrows(() => writer.append({ eventType: "session/open" }), "append as an evaluated agent");
      } finally {
        if (prior === undefined) {
          delete process.env.AMC_EVALUATED_AGENT;
        } else {
          process.env.AMC_EVALUATED_AGENT = prior;
        }
      }
    }
  },
  {
    name: "a-read-only-store-observes-a-live-writer-without-writing",
    why:
      "Verification must be possible WHILE a session is running. A single-writer " +
      "backend that could only be read by stopping the writer would turn its verifier " +
      "into a post-mortem tool.",
    run: (ctx) => {
      const writer = ctx.open();
      const sessionId = randomUUID();
      writeSampleSession(writer, sessionId);

      // Opened while the writer is still open and holding its lock.
      const reader = ctx.openReadOnly();
      assertEqual(reader.readOnly, true, "reader.readOnly");
      assertEqual(
        reader.readSessionEvents(sessionId).length,
        writer.readSessionEvents(sessionId).length,
        "reader row count"
      );
      for (const attempt of [
        () =>
          reader.startSession({
            sessionId: randomUUID(),
            runtime: "amc",
            binaryPath: "reader",
            binarySha256: sha256Hex("reader")
          }),
        () =>
          reader.appendSessionEvent({
            sessionId,
            runtime: "amc",
            eventType: "user/message",
            meta: {}
          }),
        () => reader.sealSession(sessionId)
      ]) {
        const error = assertThrows(attempt, "write through a read-only store");
        assert(
          error.message.includes(SESSION_STORE_READ_ONLY),
          `read-only store threw the wrong error: ${error.message}`
        );
      }
    }
  },
  {
    name: "declared-concurrent-writer-capability-matches-behaviour",
    why:
      "The backends genuinely differ here. A capability that is merely claimed is worse than " +
      "none, so the claim is checked against what a second open actually does.",
    run: (ctx) => {
      const first = ctx.open();
      if (first.capabilities.concurrentWriters) {
        const second = ctx.open();
        assertEqual(second.workspace, first.workspace, "second writer workspace");
        return;
      }
      const error = assertThrows(() => ctx.open(), "second writer on a single-writer backend");
      assert(
        /lock/i.test(error.message),
        `second writer failed, but not with a lock error: ${error.message}`
      );
    }
  }
];

/** Run every case against one backend. Never throws; failures become findings. */
export function runSessionStoreConformance(backend: ConformanceBackend): ConformanceReport {
  const passed: string[] = [];
  const failed: ConformanceFailure[] = [];

  for (const conformanceCase of SESSION_STORE_CONFORMANCE_CASES) {
    const created = backend.createWorkspace();
    const opened: SessionEventStore[] = [];
    const ctx: ConformanceContext = {
      workspace: created.workspace,
      backendId: backend.backendId,
      open: () => {
        const store = backend.open(created.workspace);
        opened.push(store);
        return store;
      },
      openReadOnly: () => {
        const store = backend.openReadOnly(created.workspace);
        opened.push(store);
        return store;
      }
    };
    try {
      conformanceCase.run(ctx);
      passed.push(conformanceCase.name);
    } catch (error) {
      failed.push({ caseName: conformanceCase.name, message: (error as Error).message });
    } finally {
      for (const store of opened) {
        try {
          store.close();
        } catch {
          // A case may have closed a store itself; closing twice is a no-op by
          // contract, and a backend that throws here is reported by its own case.
        }
      }
      created.dispose();
    }
  }

  return { backendId: backend.backendId, ok: failed.length === 0, passed, failed };
}

export interface BackendParityReport {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly eventHashes: Readonly<Record<string, readonly string[]>>;
}

/**
 * Cross-backend determinism: the same control-plane input must produce the same
 * `event_hash` on both backends.
 *
 * This is the check that catches the seam's real risk — that the two row
 * builders drift. It uses control-plane rows (no payload) deliberately: a
 * blob-backed row's `payload_path` embeds a random blob id under the default
 * encrypted blob store, so identical content legitimately yields different
 * hashes. Restricting the claim to what is actually deterministic keeps it a
 * real assertion instead of a flaky one.
 */
export function compareBackendDeterminism(
  backends: readonly ConformanceBackend[]
): BackendParityReport {
  const errors: string[] = [];
  const eventHashes: Record<string, readonly string[]> = {};
  // Pinned ids and timestamps: the hash pre-image includes both, so leaving
  // them to randomUUID/Date.now would make any comparison meaningless.
  const pinned = [
    { id: "00000000-0000-4000-8000-000000000001", ts: 1_700_000_000_000, eventType: "session/open" as const },
    { id: "00000000-0000-4000-8000-000000000002", ts: 1_700_000_000_001, eventType: "turn/start" as const },
    { id: "00000000-0000-4000-8000-000000000003", ts: 1_700_000_000_002, eventType: "session/close" as const }
  ];
  const sessionId = "00000000-0000-4000-8000-0000000000ff";

  for (const backend of backends) {
    const created = backend.createWorkspace();
    let store: SessionEventStore;
    try {
      store = backend.open(created.workspace);
    } catch (error) {
      created.dispose();
      throw error;
    }
    try {
      let seq = 0;
      let prev: string = SESSION_GENESIS;
      const hashes: string[] = [];
      store.startSession({
        sessionId,
        runtime: "amc",
        binaryPath: "parity-agent",
        binarySha256: sha256Hex("parity")
      });
      for (const spec of pinned) {
        const envelope: SessionEnvelope = {
          v: 1,
          sessionId,
          seq,
          prevSessionEventHash: prev,
          turn: null,
          step: null,
          surface: { op: "none" },
          synthetic: false
        };
        const result = store.appendSessionEvent({
          sessionId,
          runtime: "amc",
          eventType: spec.eventType,
          meta: embedEnvelope({ note: "parity" }, envelope),
          id: spec.id,
          ts: spec.ts
        });
        hashes.push(result.eventHash);
        seq += 1;
        prev = result.eventHash;
      }
      eventHashes[backend.backendId] = hashes;
    } finally {
      store.close();
      created.dispose();
    }
  }

  const entries = Object.entries(eventHashes);
  const reference = entries[0];
  if (reference !== undefined) {
    for (const [backendId, hashes] of entries.slice(1)) {
      if (hashes.join(",") !== reference[1].join(",")) {
        errors.push(
          `backend ${backendId} produced different event hashes than ${reference[0]} for identical input`
        );
      }
    }
  }
  return { ok: errors.length === 0, errors, eventHashes };
}
