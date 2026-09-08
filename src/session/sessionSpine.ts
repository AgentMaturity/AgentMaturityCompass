import type { EvidenceEvent, EvidenceEventType, RuntimeName } from "../types.js";
import type { SessionEventStore, SessionStoreAppendInput } from "../persistence/sessionEventStore.js";
import { sha256Hex } from "../utils/hash.js";
import {
  embedEnvelope,
  extractEnvelope,
  SESSION_GENESIS,
  type SessionEnvelope,
  type SurfaceKind,
  type SurfaceOp,
  type SurfaceRole
} from "./sessionTypes.js";
import { TurnWindow } from "./turnWindow.js";
import { SessionSpillPolicy } from "./spill/spillPolicy.js";
import { SessionSpillStore } from "./spill/spillStore.js";
import type { SpillPolicyConfig } from "./spill/spillTypes.js";
import type { SessionAttachParams, SessionEventRef } from "./sessionApiTypes.js";
import { newSessionWriterOwner, sessionWriterMeta, SESSION_WRITER_META } from "./sessionOwnership.js";

/**
 * The tier every natively-executed row carries.
 *
 * Exported so the claim has one name and one definition; see the note in
 * `appendSessionEvent` for why it is `OBSERVED` and not `OBSERVED_HARDENED`.
 */
export const NATIVE_TRUST_TIER = "OBSERVED" as const;

/**
 * The spine writer: assign the envelope, commit through the signed
 * hash-chained store, advance the in-memory head from what was actually
 * committed. Nothing else.
 *
 * Split from SessionService at the invariant boundary, not at a feature one.
 * Everything that makes the per-session chain trustworthy -- the single append
 * seam, head advancement only after a durable commit, the seeded resume, the
 * usable/turn/step guards -- lives here; the session vocabulary (turns, tool
 * calls, approvals) stays in the subclass. The chain head itself
 * (`seqCounter`/`prevHash`) is private to THIS class: the subclass records
 * through `appendSessionEvent` like any other caller and cannot move the head.
 */
export abstract class SessionEventWriter {
  readonly workspace: string;

  // The service owns one store for the life of the session — it is the single
  // writer for its own spine — and releases it at close(). Which backend that
  // is (SQLite ledger or signed JSONL) is the workspace's choice, made in
  // openSessionEventStore; nothing below this line knows or cares.
  protected readonly store: SessionEventStore;


  protected sessionIdValue: string | null = null;
  protected runtime: RuntimeName = "amc";
  protected closed = false;

  // Per-session chain head, held in memory rather than re-queried per append
  // because this instance is the only writer for the session. Seeded from the
  // ledger on open(); advanced ONLY after a durable commit, so a throwing append
  // leaves seq/prevHash at the last committed values and a retry re-chains from
  // the true head instead of a phantom one.
  private seqCounter = 0;
  private prevHash: string = SESSION_GENESIS;
  private headEventId: string | null = null;
  private readonly writerOwner = newSessionWriterOwner();

  // Turn / step labels. `seq` is the cryptographic order; turn and step are the
  // human-facing counters carried in the envelope for projection and reporting.
  protected turnNo = 0;
  protected stepNo = 0;
  protected currentTurn: number | null = null;
  protected currentStep: number | null = null;

  // Window and seal-chain accounting — what each turn/seal commits to. Composed
  // rather than inlined; see ./turnWindow.ts for why the arithmetic lives apart
  // from the record methods.
  protected readonly window = new TurnWindow();

  // The post-execute spill policy for this session. Created at open(), because
  // a spill store is session-scoped and there is no session before then. The
  // service runs it ITSELF rather than accepting a caller-supplied spill ref:
  // that is what makes the ref in a signed row a description of bytes actually
  // written rather than an unchecked claim.
  protected spill: SessionSpillPolicy | null = null;
  protected readonly spillConfig: Partial<SpillPolicyConfig>;

  protected constructor(workspace: string, store: SessionEventStore, spillConfig: Partial<SpillPolicyConfig>) {
    this.workspace = workspace;
    this.store = store;
    this.spillConfig = spillConfig;
  }

  // sessionId is assigned by open() (or supplied in SessionOpenParams) and is
  // stable for the life of the service instance.
  get sessionId(): string {
    if (this.sessionIdValue === null) {
      throw new Error("SessionService.sessionId read before open()");
    }
    return this.sessionIdValue;
  }

  protected recordContent(spec: {
    readonly eventType: EvidenceEventType;
    readonly content: string | Buffer;
    readonly slot: string;
    readonly role: SurfaceRole;
    readonly kind: SurfaceKind;
    readonly buildMeta: (payloadSha256: string) => Record<string, unknown>;
    readonly turn: number | null;
    readonly step: number | null;
  }): SessionEventRef {
    this.ensureUsable();
    const bytes = typeof spec.content === "string" ? Buffer.from(spec.content, "utf8") : spec.content;
    // INVARIANT BY CONSTRUCTION: the surface part's sha256 is the payload's, so
    // every projected part is the payload of exactly one logged event. The append
    // recomputes payload_sha256 over the same bytes, so the two always agree.
    const payloadSha256 = sha256Hex(bytes);
    const surface: SurfaceOp = {
      op: "append",
      slot: spec.slot,
      role: spec.role,
      part: { kind: spec.kind, sha256: payloadSha256 }
    };
    return this.appendSessionEvent({
      eventType: spec.eventType,
      typeMeta: spec.buildMeta(payloadSha256),
      surface,
      turn: spec.turn,
      step: spec.step,
      payload: bytes
    });
  }

  // The single append seam. Assigns the envelope, appends through the existing
  // signed, hash-chained Ledger path, then advances the in-memory head from what
  // was actually committed. Content is blob-backed, never inline: retention can
  // physically unlink a blob but cannot touch canonical_payload_inline, so
  // conversation content — the very material retention exists to delete — must
  // not live inline.
  protected appendSessionEvent(spec: {
    readonly eventType: EvidenceEventType;
    readonly typeMeta: Record<string, unknown>;
    readonly surface: SurfaceOp;
    readonly turn: number | null;
    readonly step: number | null;
    readonly payload?: string | Buffer;
    readonly id?: string;
  }): SessionEventRef {
    this.ensureUsable();
    const sessionId = this.sessionId;
    const seq = this.seqCounter;
    const envelope: SessionEnvelope = {
      v: 1,
      sessionId,
      seq,
      prevSessionEventHash: this.prevHash,
      turn: spec.turn,
      step: spec.step,
      surface: spec.surface,
      synthetic: false
    };
    // Every native row is evidence AMC captured itself, through its own
    // instrumented loop and into a signed hash chain. `docs/SCORING_METHODOLOGY.md`
    // grades tiers by verification method, and on that scale this is `OBSERVED` --
    // at least as strong as the gateway-proxy interception the tier is named for.
    //
    // It is stated here, at the one private chokepoint every public recorder
    // funnels through, so the claim covers the whole native spine rather than the
    // call sites someone remembered. Before this, the spine wrote no tier at all
    // and `trustTierFromMeta` read the absence back as `SELF_REPORTED` -- "the
    // agent's own claims", 0.4x weight, filtered out of L4 and L5 entirely -- so
    // AMC scored its own governed runs below a foreign CLI it merely watched.
    //
    // NOT `OBSERVED_HARDENED`: that is documented as sandbox execution with
    // cryptographic attestation. The attestation is real; the sandbox is not
    // (`SandboxRunner.run()` has no production call site), and awarding ourselves
    // the top tier would trade one dishonest label for another.
    const released = spec.eventType === "session/release" || spec.eventType === "session/close";
    const claim = spec.eventType === "session/open" || spec.eventType === "session/resume";
    const meta = embedEnvelope({ trustTier: NATIVE_TRUST_TIER, ...spec.typeMeta, [SESSION_WRITER_META]: sessionWriterMeta(this.writerOwner, released) }, envelope);
    const input: SessionStoreAppendInput = {
      sessionId,
      runtime: this.runtime,
      eventType: spec.eventType,
      meta,
      sessionWriteFence: { owner: this.writerOwner, mode: claim ? "claim" : released ? "release" : "append",
        head: { eventId: this.headEventId, eventHash: this.prevHash, seq: seq - 1 } },
      ...(spec.id !== undefined ? { id: spec.id } : {}),
      ...(spec.payload !== undefined ? { payload: spec.payload } : {})
    };

    const result = this.store.appendSessionEvent(input);

    // Advance ONLY after the commit returned. A throw above leaves seq/prevHash
    // untouched, so the head still points at the last durable event.
    this.seqCounter = seq + 1;
    this.prevHash = result.eventHash;
    this.headEventId = result.id;

    // Every event of the current turn — except the turn's own seal — is a leaf of
    // that turn's window root and lies within its id bounds.
    if (this.currentTurn !== null && spec.eventType !== "turn/seal") {
      this.window.observe(result.id, result.eventHash);
    }

    return {
      eventId: result.id,
      eventHash: result.eventHash,
      seq,
      payloadSha256: result.payloadSha256
    };
  }

  /**
   * Re-open an EXISTING, unsealed session as its next writer (AMC-1511).
   *
   * No sessions row is inserted — it exists — and the first row this writer
   * appends is `session/resume`, naming who resumed and the head they observed,
   * so the handover is itself signed evidence. The caller (sessionResume.ts)
   * has already verified the chain, refused sealed/foreign-format/live
   * sessions, and run crash recovery if the tail needed it; this method only
   * positions the writer. Turn numbering and the seal chain continue from the
   * rows, never restart.
   */
  attach(params: SessionAttachParams): SessionEventRef {
    if (this.sessionIdValue !== null) {
      throw new Error("SessionService.attach called on an opened service");
    }
    this.sessionIdValue = params.sessionId;
    this.runtime = params.runtime ?? "amc";
    this.spill = new SessionSpillPolicy(new SessionSpillStore(this.workspace, params.sessionId), this.spillConfig);
    const rows = this.store.readSessionEvents(params.sessionId);
    if (rows[rows.length - 1]?.id !== params.observedHeadEventId || rows[rows.length - 1]?.event_hash !== params.observedHeadEventHash) throw new Error("STALE_HEAD: verified session head changed before attach");
    this.seedHead(params.sessionId, rows);
    this.seedTurnChain(rows);
    return this.appendSessionEvent({
      eventType: "session/resume",
      typeMeta: {
        runtime: this.runtime,
        agentId: params.agentId,
        harnessVersion: params.harnessVersion,
        compositionDigest: params.compositionDigest,
        policyDigest: params.policyDigest,
        claimant: { ...params.claimant },
        observedHeadEventId: params.observedHeadEventId
      },
      surface: { op: "none" },
      turn: null,
      step: null
    });
  }

  /**
   * Seed the turn counter and the seal chain from the session's rows, so a
   * resumed writer's next `turn/start` and `turn/seal` continue the numbering
   * and the seal chain instead of restarting them (AMC-1511).
   */
  protected seedTurnChain(rows: readonly EvidenceEvent[]): void {
    for (const row of rows) {
      if (extractEnvelope(row.meta_json) === null) continue;
      const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
      if (row.event_type === "turn/start" && typeof meta.turn === "number") {
        this.turnNo = Math.max(this.turnNo, meta.turn);
      }
      if (row.event_type === "turn/seal" && typeof meta.window_merkle_root === "string") {
        this.window.recordSeal(row.id, row.event_hash, meta.window_merkle_root);
      }
    }
  }

  /**
   * Let go of the store WITHOUT sealing: the session stays resumable by a later
   * process. The turn must already be sealed — an open turn is a crash, and a
   * process that means to hand over must not leave one.
   */
  releaseWithoutClosing(): void {
    this.ensureUsable();
    if (this.currentTurn !== null) {
      throw new Error("SessionService.releaseWithoutClosing: a turn is still open; seal it first");
    }
    this.appendSessionEvent({ eventType: "session/release", typeMeta: { reason: "handover" }, surface: { op: "none" }, turn: null, step: null });
    this.closed = true;
    this.store.close();
  }

  /**
   * Drop the store handle as a dying process would: no seal, no check, no
   * `session/close`. Exists so a test can stage the crash that
   * `resumeSession` must recover from; production code has no reason to call
   * it, and its name says so.
   */
  simulateCrash(): void {
    this.disposeWithoutClosing();
  }

  /** Dispose an unusable writer without claiming its incomplete evidence is sealed or released. */
  disposeWithoutClosing(): void {
    this.closed = true;
    this.store.close();
  }

  protected seedHead(sessionId: string, rows = this.store.readSessionEvents(sessionId)): void {
    for (const row of rows) {
      const envelope = extractEnvelope(row.meta_json);
      if (envelope === null) {
        continue;
      }
      this.seqCounter = envelope.seq + 1;
      this.prevHash = row.event_hash;
      this.headEventId = row.id;
    }
  }

  protected ensureUsable(): void {
    if (this.sessionIdValue === null) {
      throw new Error("SessionService used before open()");
    }
    if (this.closed) {
      throw new Error("SessionService used after close()");
    }
  }

  // ensureUsable() has already proved the session is open, so a null policy here
  // would mean open() failed to build one — a programming error, not a state a
  // caller can reach.
  protected requireSpill(): SessionSpillPolicy {
    if (this.spill === null) {
      throw new Error("SessionService: spill policy unavailable before open()");
    }
    return this.spill;
  }

  protected requireTurn(): number {
    this.ensureUsable();
    if (this.currentTurn === null) {
      throw new Error("SessionService: no turn is open");
    }
    return this.currentTurn;
  }

  protected requireStep(): number {
    if (this.currentStep === null) {
      throw new Error("SessionService: no step is open");
    }
    return this.currentStep;
  }
}
