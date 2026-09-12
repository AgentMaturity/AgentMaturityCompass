import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import type {
  SessionEventStore,
  SessionStoreAppendInput,
  SessionStoreAppendResult,
  SessionStoreCapabilities,
  SessionStoreSeal,
  SessionStoreStartParams
} from "../src/persistence/sessionEventStore.js";
import { jsonlEventsPath } from "../src/persistence/jsonl/jsonlEventLog.js";
import { SESSION_ENVELOPE_META_KEY } from "../src/session/sessionTypes.js";
import type { EvidenceEvent, SessionRecord } from "../src/types.js";
import {
  compareBackendDeterminism,
  runSessionStoreConformance,
  SESSION_STORE_CONFORMANCE_CASES,
  type ConformanceBackend,
  type ConformanceWorkspace
} from "../src/persistence/conformance/sessionStoreConformance.js";

/**
 * The P2.3 persistence seam, held to ONE suite.
 *
 * The first half of this file is the plan's exit criterion: the same
 * `SESSION_STORE_CONFORMANCE_CASES` array, run against both backends, so "both
 * backends pass the conformance suite" is a statement about one suite rather
 * than about two files that were copies once.
 *
 * The second half is the part that makes the first half mean anything. A suite
 * that only ever runs against correct backends proves nothing about its own
 * teeth: it could be asserting `true === true` and still be green. So each
 * `brokenBackend` below violates exactly ONE rule, and the test asserts that
 * the run goes red AND that the named case is the one that failed. Delete a
 * conformance rule and its mutation test turns this file red.
 */
const PASS = "session-store-conformance-passphrase";

function makeWorkspace(): ConformanceWorkspace {
  const workspace = mkdtempSync(join(tmpdir(), "amc-store-conf-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  return {
    workspace,
    dispose: () => rmSync(workspace, { recursive: true, force: true })
  };
}

function withPassphrase<T>(fn: () => T): T {
  const prior = process.env["AMC_VAULT_PASSPHRASE"];
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  try {
    return fn();
  } finally {
    if (prior === undefined) delete process.env["AMC_VAULT_PASSPHRASE"];
    else process.env["AMC_VAULT_PASSPHRASE"] = prior;
  }
}

const sqliteBackend: ConformanceBackend = {
  backendId: "sqlite",
  createWorkspace: makeWorkspace,
  open: (workspace) => openSessionEventStore(workspace, "sqlite"),
  openReadOnly: (workspace) => openSessionEventStore(workspace, "sqlite", { readOnly: true })
};

const jsonlBackend: ConformanceBackend = {
  backendId: "jsonl",
  createWorkspace: makeWorkspace,
  open: (workspace) => openSessionEventStore(workspace, "jsonl"),
  openReadOnly: (workspace) => openSessionEventStore(workspace, "jsonl", { readOnly: true })
};

/** Delegates every contract method, so a subclass can break exactly one. */
class DelegatingStore implements SessionEventStore {
  constructor(protected readonly inner: SessionEventStore) {}
  get workspace(): string {
    return this.inner.workspace;
  }
  get backendId(): SessionEventStore["backendId"] {
    return this.inner.backendId;
  }
  get capabilities(): SessionStoreCapabilities {
    return this.inner.capabilities;
  }
  get readOnly(): boolean {
    return this.inner.readOnly;
  }
  startSession(params: SessionStoreStartParams): void {
    this.inner.startSession(params);
  }
  appendSessionEvent(input: SessionStoreAppendInput): SessionStoreAppendResult {
    return this.inner.appendSessionEvent(input);
  }
  readSessionEvents(sessionId: string): readonly EvidenceEvent[] {
    return this.inner.readSessionEvents(sessionId);
  }
  readAllEvents(): readonly EvidenceEvent[] {
    return this.inner.readAllEvents();
  }
  readSessionRecord(sessionId: string): SessionRecord | null {
    return this.inner.readSessionRecord(sessionId);
  }
  sealSession(sessionId: string): SessionStoreSeal {
    return this.inner.sealSession(sessionId);
  }
  close(): void {
    this.inner.close();
  }
}

function rewriteLastLine(workspace: string, edit: (row: Record<string, unknown>) => void): void {
  const path = jsonlEventsPath(workspace);
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.trim().length > 0);
  const last = lines.pop();
  if (last === undefined) return;
  const parsed = JSON.parse(last) as Record<string, unknown>;
  edit(parsed);
  writeFileSync(path, `${[...lines, JSON.stringify(parsed)].join("\n")}\n`);
}

function dropLastLine(workspace: string): void {
  const path = jsonlEventsPath(workspace);
  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.trim().length > 0);
  lines.pop();
  writeFileSync(path, lines.length === 0 ? "" : `${lines.join("\n")}\n`);
}

/**
 * Signature stripped. `writer_sig` is not part of `event_hash`, so rewriting it
 * leaves every chain intact — the ONLY thing that can catch this is the
 * signature rule itself. That isolation is the point: it is precisely the
 * "unsigned fast path" a JSONL backend would be tempted into.
 */
class UnsignedStore extends DelegatingStore {
  override appendSessionEvent(input: SessionStoreAppendInput): SessionStoreAppendResult {
    const result = this.inner.appendSessionEvent(input);
    // Forge the signature bytes without changing the row's length: the JSONL
    // writer refuses to append to a target whose size moved under it, and that
    // guard must stay out of this mutation so only the signature rule can fire.
    rewriteLastLine(this.inner.workspace, (row) => {
      row["writer_sig"] = "A".repeat(String(row["writer_sig"]).length);
    });
    return result;
  }
}

/**
 * A re-signed forgery: the envelope's `seq` is mangled BEFORE the row is built,
 * so the row is correctly hashed and correctly signed over a wrong per-session
 * order. Every global check passes. Only the per-session chain catches it —
 * the same isolation tests/sessionVerifierNegative proves for the verifier.
 */
class BrokenSeqStore extends DelegatingStore {
  override appendSessionEvent(input: SessionStoreAppendInput): SessionStoreAppendResult {
    const envelope = input.meta[SESSION_ENVELOPE_META_KEY] as { seq: number } | undefined;
    const meta =
      envelope === undefined
        ? input.meta
        : { ...input.meta, [SESSION_ENVELOPE_META_KEY]: { ...envelope, seq: envelope.seq + 1 } };
    return this.inner.appendSessionEvent({ ...input, meta });
  }
}

/** Truncation: the row is written, then removed behind the writer's back. */
class TruncatingStore extends DelegatingStore {
  override appendSessionEvent(input: SessionStoreAppendInput): SessionStoreAppendResult {
    const result = this.inner.appendSessionEvent(input);
    dropLastLine(this.inner.workspace);
    return result;
  }
}

/** Claims concurrent writers it does not support. */
class LyingCapabilityStore extends DelegatingStore {
  override get capabilities(): SessionStoreCapabilities {
    return { ...this.inner.capabilities, concurrentWriters: true };
  }
}

/** Swallows the second seal, the exact behaviour the SQLite trigger forbids. */
class IdempotentSealStore extends DelegatingStore {
  private sealed: SessionStoreSeal | null = null;
  override sealSession(sessionId: string): SessionStoreSeal {
    if (this.sealed !== null) return this.sealed;
    this.sealed = this.inner.sealSession(sessionId);
    return this.sealed;
  }
}

function brokenBackend(
  id: string,
  wrap: (inner: SessionEventStore) => SessionEventStore
): ConformanceBackend {
  return {
    backendId: id,
    createWorkspace: makeWorkspace,
    open: (workspace) => wrap(openSessionEventStore(workspace, "jsonl")),
    openReadOnly: (workspace) => openSessionEventStore(workspace, "jsonl", { readOnly: true })
  };
}

describe("session store conformance — both backends, one suite", () => {
  it("has cases at all (a suite that ran zero cases would pass vacuously)", () => {
    expect(SESSION_STORE_CONFORMANCE_CASES.length).toBeGreaterThanOrEqual(15);
  });

  it("the SQLite backend passes every case", () => {
    const report = withPassphrase(() => runSessionStoreConformance(sqliteBackend));
    expect(report.failed).toEqual([]);
    expect(report.passed).toHaveLength(SESSION_STORE_CONFORMANCE_CASES.length);
  });

  it("the JSONL backend passes every case — signed and chained, not a fast path", () => {
    const report = withPassphrase(() => runSessionStoreConformance(jsonlBackend));
    expect(report.failed).toEqual([]);
    expect(report.passed).toHaveLength(SESSION_STORE_CONFORMANCE_CASES.length);
  });

  it("both backends run the identical case list", () => {
    const sqlite = withPassphrase(() => runSessionStoreConformance(sqliteBackend));
    const jsonl = withPassphrase(() => runSessionStoreConformance(jsonlBackend));
    expect(jsonl.passed).toEqual(sqlite.passed);
  });

  it("identical control-plane input yields identical event hashes on both backends", () => {
    const parity = withPassphrase(() => compareBackendDeterminism([sqliteBackend, jsonlBackend]));
    expect(parity.errors).toEqual([]);
    expect(parity.eventHashes["jsonl"]).toEqual(parity.eventHashes["sqlite"]);
    expect(parity.eventHashes["sqlite"]).toHaveLength(3);
  });

  it("the two backends declare different capabilities, and say so honestly", () => {
    withPassphrase(() => {
      const created = makeWorkspace();
      try {
        const sqlite = openSessionEventStore(created.workspace, "sqlite");
        expect(sqlite.capabilities.concurrentWriters).toBe(true);
        sqlite.close();
      } finally {
        created.dispose();
      }
      const jsonlWs = makeWorkspace();
      try {
        const jsonl = openSessionEventStore(jsonlWs.workspace, "jsonl");
        // Node exposes no F_FULLFSYNC, so JSONL cannot claim power-loss
        // durability. Declared, not implied.
        expect(jsonl.capabilities.powerLossDurable).toBe(false);
        expect(jsonl.capabilities.concurrentWriters).toBe(false);
        jsonl.close();
      } finally {
        jsonlWs.dispose();
      }
    });
  });
});

describe("the conformance suite has teeth (mutation tests)", () => {
  const mutations: ReadonlyArray<{
    readonly id: string;
    readonly wrap: (inner: SessionEventStore) => SessionEventStore;
    readonly expectedCase: string;
  }> = [
    {
      id: "unsigned",
      wrap: (inner) => new UnsignedStore(inner),
      expectedCase: "every-row-carries-a-valid-monitor-signature"
    },
    {
      id: "broken-session-seq",
      wrap: (inner) => new BrokenSeqStore(inner),
      expectedCase: "per-session-envelope-chain-is-preserved"
    },
    {
      id: "truncating",
      wrap: (inner) => new TruncatingStore(inner),
      expectedCase: "append-round-trips-in-commit-order"
    },
    {
      id: "lying-capability",
      wrap: (inner) => new LyingCapabilityStore(inner),
      expectedCase: "declared-concurrent-writer-capability-matches-behaviour"
    },
    {
      id: "idempotent-seal",
      wrap: (inner) => new IdempotentSealStore(inner),
      expectedCase: "seal-is-not-idempotent"
    }
  ];

  for (const mutation of mutations) {
    it(`fails a backend that breaks ${mutation.id}`, () => {
      const report = withPassphrase(() =>
        runSessionStoreConformance(brokenBackend(mutation.id, mutation.wrap))
      );
      expect(report.ok).toBe(false);
      expect(report.failed.map((failure) => failure.caseName)).toContain(mutation.expectedCase);
    });
  }

  it("the signature mutation is caught ONLY by the signature rule", () => {
    // writer_sig is outside event_hash, so every chain check still passes. If
    // this ever starts failing other cases too, the isolation has been lost and
    // the signature rule is no longer independently proven.
    const report = withPassphrase(() =>
      runSessionStoreConformance(brokenBackend("unsigned", (inner) => new UnsignedStore(inner)))
    );
    // The JSONL writer also authenticates existing history before it will append again, so a forged
    // signature is caught a third time at reopen — still the signature rule, applied at open.
    expect(report.failed.map((failure) => failure.caseName), report.failed.map((failure) => `${failure.caseName}: ${failure.message}`).join("\n")).toEqual([
      "every-row-carries-a-valid-monitor-signature",
      "a-clean-log-verifies",
      "chain-head-survives-a-reopen"
    ]);
  });
});
