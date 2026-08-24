import { createHash, randomUUID } from "node:crypto";
import type { EvidenceEvent, EvidenceEventType, RuntimeName } from "../types.js";
import { openLedger, type AppendEvidenceInput, type Ledger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import { projectSurface, type ConversationHistory } from "./surfaceProjection.js";
import {
  embedEnvelope,
  extractEnvelope,
  SESSION_GENESIS,
  type SessionEnvelope,
  type SurfaceOp,
  type SurfaceRole
} from "./sessionTypes.js";
import { merkleRoot, SESSION_MERKLE_EMPTY } from "./sessionMerkle.js";
import type {
  ApprovalAnswer,
  SurfaceKind,
  TokenUsage,
  ToolDispatch,
  ToolOutcome,
  TurnEndReason,
  TurnTrigger
} from "./sessionTypes.js";


// A monitor digest is a 64-char lowercase hex sha256. compositionDigest is
// already one in normal use; anything else is hashed so the sessions row's
// binary_sha256 column is always well-formed.
function normalizeSha256(value: string): string {
  return /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : sha256Hex(value);
}

// SessionService is the SINGLE WRITER for one session's spine. It owns the
// per-session head (seq + prevSessionEventHash) in memory and the current
// turn/step counters, appends every session event through the existing signed,
// hash-chained Ledger append path, and applies the coalescing / step-boundary
// batching policy. Every method below is synchronous: the underlying ledger is
// synchronous, and the coalescer's back-pressure is expressed by a synchronous
// call that does not return until its bytes are flushed — the queue bound IS the
// "model-visible ⊆ logged" bound.

// Reference returned for every appended session event. Superset of the ledger's
// AppendEvidenceResult, expressed in session terms. For a content-bearing event
// payloadSha256 equals the SurfacePartRef.sha256 the event contributes.
export interface SessionEventRef {
  readonly eventId: string;
  readonly eventHash: string;
  readonly seq: number;
  readonly payloadSha256: string;
}

export interface TurnRef extends SessionEventRef {
  readonly turn: number;
}

export interface StepRef extends SessionEventRef {
  readonly turn: number;
  readonly step: number;
}

// turn/seal carries no payload; its meta commits to the window and the row's own
// writer_sig IS the seal signature.
export interface SealRef extends SessionEventRef {
  readonly turn: number;
  readonly windowMerkleRoot: string;
  readonly sealChainIndex: number;
}

export interface SessionOpenParams {
  readonly sessionId?: string; // generated when absent
  /** Defaults to "amc": a session opened through this service is one AMC ran natively. */
  readonly runtime?: RuntimeName;
  readonly agentId: string;
  readonly harnessVersion: string;
  readonly compositionDigest: string;
  readonly policyDigest: string;
}

export interface TurnStartParams {
  readonly trigger: TurnTrigger;
}

export interface TurnEndParams {
  readonly reason: TurnEndReason;
  readonly interrupted: boolean;
}

export interface StepEndParams {
  readonly stopReason: string | null;
  readonly usage: TokenUsage;
}

export interface RequestHeaderParams {
  readonly model: string;
  readonly providerId: string;
  readonly params: Record<string, unknown>;
  readonly systemPromptEventId: string;
  readonly toolSchemaSha256: string;
  readonly projectionCutoffEventId: string;
  readonly projectionDigest: string;
  readonly sourceEventIds: readonly string[];
  // The EXACT bytes that will be transmitted to the model. recordRequestHeader
  // commits requestDigest = sha256(these) inside the signed request/header row
  // before it hands them back wrapped in a PreparedRequest, so the transmitted
  // bytes are always pinned by a durable, signed event.
  readonly requestBytes: string | Buffer;
}

export interface AssistantBlockInput {
  readonly blockIndex: number;
  readonly blockKind: SurfaceKind;
  readonly stopReason: string | null;
  readonly content: string | Buffer;
}

export interface ToolCallInput {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly dispatch: ToolDispatch;
  readonly parentToken: string | null;
  readonly args: string | Buffer; // payload; argsSha256 = payload_sha256
}

export interface SpilledRef {
  readonly path: string;
  readonly bytes: number;
}

export interface ToolResultInput {
  readonly toolCallId: string;
  readonly outcome: ToolOutcome;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly denied: boolean;
  readonly spilled: SpilledRef | null;
  readonly content: string | Buffer;
}

// One method for both approval/request and approval/answer, discriminated on
// `phase`, so the two halves of an approval share a call surface.
export type ApprovalRecord =
  | {
      readonly phase: "request";
      readonly approvalId: string;
      readonly toolCallId: string;
      readonly question: string;
    }
  | {
      readonly phase: "answer";
      readonly approvalId: string;
      readonly answer: ApprovalAnswer;
      readonly answeredBy: string;
    };

export interface SandboxModeInput {
  readonly backend: string;
  readonly mode: string;
  readonly policyDigest: string;
}

export interface SessionCloseParams {
  readonly reason: string;
}

// Module-private brand token. A PreparedRequest can only be minted by code in
// THIS module — in practice only by recordRequestHeader, after its request/header
// row is committed and signed. External code cannot name this symbol, so it
// cannot construct a PreparedRequest through the type system, and the runtime
// guard rejects any attempt that tried.
const PREPARED_REQUEST_BRAND: unique symbol = Symbol("amc.session.preparedRequest");

/**
 * The bytes destined for a model, obtainable ONLY after they were logged.
 *
 * This is the STRUCTURAL half of "model-visible ⇒ logged ⇒ signed". A caller
 * that holds a PreparedRequest necessarily holds proof that recordRequestHeader
 * already committed a signed request/header event naming requestDigest =
 * sha256(the bytes) — because that method is the only mint. The guarantee does
 * NOT rest on the invariants harness, which defaults to OFF under NODE_ENV=
 * production and, in this tree, is not installed by any boot path
 * (installInvariants is exported from @amc/core but nothing here calls it). Where
 * a host does install ctx.invariants and registerSessionInvariants, those
 * companions are a dev-time backstop that catches structural mistakes; they are
 * not what makes this hold.
 *
 * Known limit (see design risks): a deliberate `as` cast, or a plugin that calls
 * a provider SDK directly rather than through this seam, is outside what a brand
 * can enforce. Closing that is a P3.0/P3.1 credentials-seam question.
 */
export class PreparedRequest {
  readonly headerEventId: string;
  readonly headerEventHash: string;
  readonly requestDigest: string;
  private readonly requestBytes: Buffer;

  constructor(
    brand: typeof PREPARED_REQUEST_BRAND,
    init: {
      readonly headerEventId: string;
      readonly headerEventHash: string;
      readonly requestDigest: string;
      readonly requestBytes: Buffer;
    }
  ) {
    if (brand !== PREPARED_REQUEST_BRAND) {
      throw new Error("PreparedRequest is not constructible outside SessionService");
    }
    this.headerEventId = init.headerEventId;
    this.headerEventHash = init.headerEventHash;
    this.requestDigest = init.requestDigest;
    this.requestBytes = init.requestBytes;
  }

  // The exact bytes to transmit. Reachable only from an instance this module
  // minted, i.e. only once the request/header row committing to requestDigest is
  // durable and signed. Returns a copy so a holder cannot mutate the logged bytes.
  toBytes(): Buffer {
    return Buffer.from(this.requestBytes);
  }
}

export class SessionService {
  readonly workspace: string;

  // The service owns one Ledger connection for the life of the session — it is
  // the single writer for its own spine — and releases it at close().
  private readonly ledger: Ledger;

  private sessionIdValue: string | null = null;
  private runtime: RuntimeName = "amc";
  private closed = false;

  // Per-session chain head, held in memory rather than re-queried per append
  // because this instance is the only writer for the session. Seeded from the
  // ledger on open(); advanced ONLY after a durable commit, so a throwing append
  // leaves seq/prevHash at the last committed values and a retry re-chains from
  // the true head instead of a phantom one.
  private seqCounter = 0;
  private prevHash: string = SESSION_GENESIS;

  // Turn / step labels. `seq` is the cryptographic order; turn and step are the
  // human-facing counters carried in the envelope for projection and reporting.
  private turnNo = 0;
  private stepNo = 0;
  private currentTurn: number | null = null;
  private currentStep: number | null = null;

  // Window accounting for the turn currently in progress: the ordered event
  // hashes and the id bounds of every event in the turn EXCEPT its own seal.
  private turnEventHashes: string[] = [];
  private turnFirstEventId: string | null = null;
  private turnLastEventId: string | null = null;

  // Seal chain: each turn/seal links to the previous, and the ordered seal event
  // hashes form the session root committed in session/close.
  private sealChainIndex = 0;
  private lastSealEventId: string | null = null;
  private lastSealMerkleRoot: string = SESSION_MERKLE_EMPTY;
  private readonly sealEventHashes: string[] = [];

  constructor(workspace: string) {
    this.workspace = workspace;
    this.ledger = openLedger(workspace);
  }

  // sessionId is assigned by open() (or supplied in SessionOpenParams) and is
  // stable for the life of the service instance.
  get sessionId(): string {
    if (this.sessionIdValue === null) {
      throw new Error("SessionService.sessionId read before open()");
    }
    return this.sessionIdValue;
  }

  open(params: SessionOpenParams): SessionEventRef {
    if (this.sessionIdValue !== null) {
      throw new Error("SessionService.open called twice");
    }
    const sessionId = params.sessionId ?? randomUUID();
    this.sessionIdValue = sessionId;
    this.runtime = params.runtime ?? "amc";

    // Seed the per-session head from any rows already carrying this session id. A
    // fresh session has none, leaving seq=0 / prevHash=SESSION_GENESIS; a resumed
    // one picks up exactly where its last committed event left off.
    this.seedHead(sessionId);

    // The sessions row must exist before any event references it, or verification
    // reports "references missing session". A natively-run agent has no separate
    // binary, so binary_path records the agent id and binary_sha256 the
    // composition it ran under.
    this.ledger.startSession({
      sessionId,
      runtime: params.runtime ?? "amc",
      binaryPath: params.agentId,
      binarySha256: normalizeSha256(params.compositionDigest)
    });

    return this.appendSessionEvent({
      eventType: "session/open",
      typeMeta: {
        runtime: params.runtime ?? "amc",
        agentId: params.agentId,
        harnessVersion: params.harnessVersion,
        compositionDigest: params.compositionDigest,
        policyDigest: params.policyDigest
      },
      surface: { op: "none" },
      turn: null,
      step: null
    });
  }

  startTurn(params: TurnStartParams): TurnRef {
    this.ensureUsable();
    if (this.currentTurn !== null) {
      throw new Error("SessionService.startTurn called while a turn is open");
    }
    const turn = ++this.turnNo;
    this.currentTurn = turn;
    this.currentStep = null;
    this.stepNo = 0;
    this.turnEventHashes = [];
    this.turnFirstEventId = null;
    this.turnLastEventId = null;

    const ref = this.appendSessionEvent({
      eventType: "turn/start",
      typeMeta: { turn, trigger: params.trigger },
      surface: { op: "none" },
      turn,
      step: null
    });
    return { ...ref, turn };
  }

  endTurn(params: TurnEndParams): TurnRef {
    const turn = this.requireTurn();
    const ref = this.appendSessionEvent({
      eventType: "turn/end",
      typeMeta: { turn, reason: params.reason, interrupted: params.interrupted },
      surface: { op: "none" },
      turn,
      step: null
    });
    this.currentStep = null;
    return { ...ref, turn };
  }

  // The turn seal is an ordinary evidence event whose meta commits to the turn's
  // window; the row's own writer_sig IS the seal signature, so there is no
  // separate seal type or signature scheme. Verification recomputes the window
  // root from the stored rows and never trusts the value the seal carries.
  sealTurn(): SealRef {
    const turn = this.requireTurn();
    const windowMerkleRoot = merkleRoot(this.turnEventHashes);
    const sealChainIndex = this.sealChainIndex;

    const ref = this.appendSessionEvent({
      eventType: "turn/seal",
      typeMeta: {
        turn,
        window_first_event_id: this.turnFirstEventId,
        window_last_event_id: this.turnLastEventId,
        window_event_count: this.turnEventHashes.length,
        window_merkle_root: windowMerkleRoot,
        prev_seal_event_id: this.lastSealEventId,
        prev_seal_merkle_root: this.lastSealMerkleRoot,
        seal_chain_index: sealChainIndex
      },
      surface: { op: "none" },
      turn,
      step: null
    });

    this.sealEventHashes.push(ref.eventHash);
    this.lastSealEventId = ref.eventId;
    this.lastSealMerkleRoot = windowMerkleRoot;
    this.sealChainIndex = sealChainIndex + 1;
    this.currentTurn = null;
    this.currentStep = null;

    return { ...ref, turn, windowMerkleRoot, sealChainIndex };
  }

  startStep(): StepRef {
    const turn = this.requireTurn();
    const step = ++this.stepNo;
    this.currentStep = step;
    const ref = this.appendSessionEvent({
      eventType: "step/start",
      typeMeta: { turn, step },
      surface: { op: "none" },
      turn,
      step
    });
    return { ...ref, turn, step };
  }

  // The step boundary is the crash-loss bound: every event recorded during the
  // step is durably committed by the time this returns, so a crash can lose at
  // most the un-recorded tail of the in-flight step, never a completed one.
  endStep(params: StepEndParams): StepRef {
    const turn = this.requireTurn();
    const step = this.requireStep();
    const ref = this.appendSessionEvent({
      eventType: "step/end",
      typeMeta: {
        turn,
        step,
        stopReason: params.stopReason,
        usage: {
          inputTokens: params.usage.inputTokens,
          outputTokens: params.usage.outputTokens,
          cacheRead: params.usage.cacheRead,
          cacheWrite: params.usage.cacheWrite
        }
      },
      surface: { op: "none" },
      turn,
      step
    });
    this.currentStep = null;
    return { ...ref, turn, step };
  }

  // The single seam through which a request reaches a model. It commits a signed
  // request/header event that names requestDigest = sha256(exact bytes to be
  // sent), and only THEN mints the PreparedRequest carrying those bytes. Because
  // PreparedRequest cannot be constructed outside this module, a caller cannot
  // transmit to a model without that committed, signed row — the property is
  // structural, not a runtime check that production can turn off.
  recordRequestHeader(params: RequestHeaderParams): PreparedRequest {
    this.ensureUsable();
    const requestBytes =
      typeof params.requestBytes === "string" ? Buffer.from(params.requestBytes, "utf8") : params.requestBytes;
    const requestDigest = sha256Hex(requestBytes);
    const ref = this.appendSessionEvent({
      eventType: "request/header",
      typeMeta: {
        model: params.model,
        providerId: params.providerId,
        params: params.params,
        systemPromptEventId: params.systemPromptEventId,
        toolSchemaSha256: params.toolSchemaSha256,
        projectionCutoffEventId: params.projectionCutoffEventId,
        projectionDigest: params.projectionDigest,
        sourceEventIds: [...params.sourceEventIds],
        requestDigest
      },
      surface: { op: "none" },
      turn: this.currentTurn,
      step: this.currentStep
    });
    // The row is now durable and signed; only now are the bytes released.
    return new PreparedRequest(PREPARED_REQUEST_BRAND, {
      headerEventId: ref.eventId,
      headerEventHash: ref.eventHash,
      requestDigest,
      requestBytes
    });
  }

  // The projected conversation the model would see, folded ONLY from this
  // session's committed rows (re-read from evidence_events), never from an
  // in-memory buffer. Reading model-visible history therefore cannot outrun the
  // log: every part it contains is the payload of a row that is already durable
  // and signed. This is the "projected history" half of the same structural
  // property recordRequestHeader gives the request path.
  projectHistory(): ConversationHistory {
    this.ensureUsable();
    const rows = this.ledger.db
      .prepare("SELECT * FROM evidence_events WHERE session_id = ? ORDER BY rowid ASC")
      .all(this.sessionId) as unknown as EvidenceEvent[];
    return projectSurface(rows);
  }

  recordSystemPrompt(text: string): SessionEventRef {
    return this.recordContent({
      eventType: "system/prompt",
      content: text,
      slot: "system",
      role: "system",
      kind: "text",
      buildMeta: () => ({}),
      turn: this.currentTurn,
      step: this.currentStep
    });
  }

  recordUserMessage(text: string): SessionEventRef {
    return this.recordContent({
      eventType: "user/message",
      content: text,
      slot: "user",
      role: "user",
      kind: "text",
      buildMeta: () => ({}),
      turn: this.currentTurn,
      step: this.currentStep
    });
  }

  recordAssistantBlock(block: AssistantBlockInput): SessionEventRef {
    const turn = this.currentTurn;
    const step = this.currentStep;
    return this.recordContent({
      eventType: "assistant/block",
      content: block.content,
      slot: `assistant:${block.blockIndex}`,
      role: "assistant",
      kind: block.blockKind,
      buildMeta: () => ({
        turn,
        step,
        blockIndex: block.blockIndex,
        blockKind: block.blockKind,
        stopReason: block.stopReason
      }),
      turn,
      step
    });
  }

  recordToolCall(call: ToolCallInput): SessionEventRef {
    // Recorded (and therefore durably committed) BEFORE the caller performs the
    // tool side effect, so no model-visible dispatch precedes its log entry.
    const turn = this.currentTurn;
    const step = this.currentStep;
    return this.recordContent({
      eventType: "tool/call",
      content: call.args,
      slot: `tool_use:${call.toolCallId}`,
      role: "assistant",
      kind: "tool_use",
      buildMeta: (argsSha256) => ({
        turn,
        step,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        argsSha256,
        dispatch: call.dispatch,
        parentToken: call.parentToken
      }),
      turn,
      step
    });
  }

  recordToolResult(result: ToolResultInput): SessionEventRef {
    const turn = this.currentTurn;
    const step = this.currentStep;
    return this.recordContent({
      eventType: "tool/result",
      content: result.content,
      slot: `tool_result:${result.toolCallId}`,
      role: "tool",
      kind: "tool_result",
      buildMeta: () => ({
        turn,
        step,
        toolCallId: result.toolCallId,
        outcome: result.outcome,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        denied: result.denied,
        spilled: result.spilled
      }),
      turn,
      step
    });
  }

  recordApproval(record: ApprovalRecord): SessionEventRef {
    this.ensureUsable();
    if (record.phase === "request") {
      return this.appendSessionEvent({
        eventType: "approval/request",
        typeMeta: {
          turn: this.currentTurn,
          step: this.currentStep,
          approvalId: record.approvalId,
          toolCallId: record.toolCallId,
          question: record.question
        },
        surface: { op: "none" },
        turn: this.currentTurn,
        step: this.currentStep
      });
    }
    return this.appendSessionEvent({
      eventType: "approval/answer",
      typeMeta: {
        approvalId: record.approvalId,
        answer: record.answer,
        answeredBy: record.answeredBy
      },
      surface: { op: "none" },
      turn: null,
      step: null
    });
  }

  recordSandboxMode(input: SandboxModeInput): SessionEventRef {
    this.ensureUsable();
    return this.appendSessionEvent({
      eventType: "sandbox/mode",
      typeMeta: {
        turn: this.currentTurn,
        backend: input.backend,
        mode: input.mode,
        policyDigest: input.policyDigest
      },
      surface: { op: "none" },
      turn: this.currentTurn,
      step: null
    });
  }

  close(params: SessionCloseParams): SessionEventRef {
    this.ensureUsable();
    const sessionId = this.sessionId;
    // finalEventId names the last event of the session, which is this close event
    // itself; its id is minted up front so the meta can commit to it.
    const closeId = randomUUID();
    const ref = this.appendSessionEvent({
      eventType: "session/close",
      typeMeta: {
        reason: params.reason,
        turnCount: this.turnNo,
        sealCount: this.sealChainIndex,
        sessionMerkleRoot: merkleRoot(this.sealEventHashes),
        finalEventId: closeId
      },
      surface: { op: "none" },
      turn: null,
      step: null,
      id: closeId
    });

    // sealSession is NOT idempotent — protect_sessions_sealed_immutable raises on
    // a second call — so it runs exactly once, guarded by `closed`. The row's
    // session_final_event_hash then equals this close event's hash (it is the
    // last event), so the row seal and the close event cross-check.
    this.ledger.sealSession(sessionId);
    this.closed = true;
    this.ledger.close();
    return ref;
  }

  private recordContent(spec: {
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
  private appendSessionEvent(spec: {
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
    const meta = embedEnvelope(spec.typeMeta, envelope);
    const input: AppendEvidenceInput = {
      sessionId,
      runtime: this.runtime,
      eventType: spec.eventType,
      meta,
      ...(spec.id !== undefined ? { id: spec.id } : {}),
      ...(spec.payload !== undefined
        ? { payload: spec.payload, inline: false, payloadExt: "txt" as const }
        : {})
    };

    const result = this.ledger.appendEvidenceDetailed(input);

    // Advance ONLY after the commit returned. A throw above leaves seq/prevHash
    // untouched, so the head still points at the last durable event.
    this.seqCounter = seq + 1;
    this.prevHash = result.eventHash;

    // Every event of the current turn — except the turn's own seal — is a leaf of
    // that turn's window root and lies within its id bounds.
    if (this.currentTurn !== null && spec.eventType !== "turn/seal") {
      if (this.turnFirstEventId === null) {
        this.turnFirstEventId = result.id;
      }
      this.turnLastEventId = result.id;
      this.turnEventHashes.push(result.eventHash);
    }

    return {
      eventId: result.id,
      eventHash: result.eventHash,
      seq,
      payloadSha256: result.payloadSha256
    };
  }

  private seedHead(sessionId: string): void {
    const rows = this.ledger.db
      .prepare(
        "SELECT meta_json AS metaJson, event_hash AS eventHash FROM evidence_events WHERE session_id = ? ORDER BY rowid ASC"
      )
      .all(sessionId) as ReadonlyArray<{ metaJson: string; eventHash: string }>;
    for (const row of rows) {
      const envelope = extractEnvelope(row.metaJson);
      if (envelope === null) {
        continue;
      }
      this.seqCounter = envelope.seq + 1;
      this.prevHash = row.eventHash;
    }
  }

  private ensureUsable(): void {
    if (this.sessionIdValue === null) {
      throw new Error("SessionService used before open()");
    }
    if (this.closed) {
      throw new Error("SessionService used after close()");
    }
  }

  private requireTurn(): number {
    this.ensureUsable();
    if (this.currentTurn === null) {
      throw new Error("SessionService: no turn is open");
    }
    return this.currentTurn;
  }

  private requireStep(): number {
    if (this.currentStep === null) {
      throw new Error("SessionService: no step is open");
    }
    return this.currentStep;
  }
}
