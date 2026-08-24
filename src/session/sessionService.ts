import { createHash, randomUUID } from "node:crypto";
import type { EvidenceEvent, EvidenceEventType, RuntimeName } from "../types.js";
import { openSessionEventStore } from "../persistence/openSessionEventStore.js";
import type { SessionEventStore, SessionStoreAppendInput } from "../persistence/sessionEventStore.js";
import { sha256Hex } from "../utils/hash.js";
import type { ConversationHistory } from "./surfaceProjection.js";
import { createSessionProjections, type SessionProjections } from "./projection/sessionProjections.js";
import {
  embedEnvelope,
  extractEnvelope,
  SESSION_GENESIS,
  type SessionEnvelope,
  type SurfaceOp,
  type SurfaceRole
} from "./sessionTypes.js";
import { merkleRoot, SESSION_MERKLE_EMPTY } from "./sessionMerkle.js";
import type { RequestHeaderMeta } from "./requestHeaderMeta.js";
import { buildRequestOutcomeMeta, requestOutcomeEventType } from "./requestOutcomeMeta.js";
import type { RequestOutcomeParams } from "./requestOutcomeMeta.js";
import { assertToolSchemaCommitted } from "./toolSchemaCommitment.js";
import type { SurfaceKind } from "./sessionTypes.js";
import { SessionSpillPolicy } from "./spill/spillPolicy.js";
import { SessionSpillStore } from "./spill/spillStore.js";
import { SPILL_META_KEY, type SpillPolicyConfig } from "./spill/spillTypes.js";
import type {
  ApprovalRecord,
  AssistantBlockInput,
  RequestHeaderParams,
  SandboxModeInput,
  SealRef,
  SessionCloseParams,
  SessionEventRef,
  SessionOpenParams,
  StepEndParams,
  StepRef,
  ToolCallInput,
  ToolResultInput,
  TurnEndParams,
  TurnRef,
  TurnStartParams
} from "./sessionApiTypes.js";


// A monitor digest is a 64-char lowercase hex sha256. compositionDigest is
// already one in normal use; anything else is hashed so the sessions row's
// binary_sha256 column is always well-formed.
function normalizeSha256(value: string): string {
  return /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : sha256Hex(value);
}

// SessionService is the SINGLE WRITER for one session's spine. It owns the
// per-session head (seq + prevSessionEventHash) in memory and the current
// turn/step counters, appends every session event through the signed,
// hash-chained persistence seam, and applies the coalescing / step-boundary
// batching policy. Every method below is synchronous: the store contract is
// synchronous, and the coalescer's back-pressure is expressed by a synchronous
// call that does not return until its bytes are flushed — the queue bound IS the
// "model-visible ⊆ logged" bound.

// The parameter and result shapes live in ./sessionApiTypes.js — see its header
// for why the split exists and why PreparedRequest stayed here.
export type {
  AssistantBlockInput,
  ApprovalRecord,
  RequestHeaderParams,
  SandboxModeInput,
  SealRef,
  SessionCloseParams,
  SessionEventRef,
  SessionOpenParams,
  StepEndParams,
  StepRef,
  ToolCallInput,
  ToolResultInput,
  TurnEndParams,
  TurnRef,
  TurnStartParams
} from "./sessionApiTypes.js";

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

  // The service owns one store for the life of the session — it is the single
  // writer for its own spine — and releases it at close(). Which backend that
  // is (SQLite ledger or signed JSONL) is the workspace's choice, made in
  // openSessionEventStore; nothing below this line knows or cares.
  private readonly store: SessionEventStore;

  // The surface fold runs through the projection registry rather than direct
  // calls, so repeated projectHistory() resumes from the cached prefix instead
  // of re-parsing every row's meta_json. Public and per-service: the cache is
  // keyed to ONE log, and a composed runtime registers its own units here.
  readonly projections: SessionProjections = createSessionProjections();

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

  // The post-execute spill policy for this session. Created at open(), because
  // a spill store is session-scoped and there is no session before then. The
  // service runs it ITSELF rather than accepting a caller-supplied spill ref:
  // that is what makes the ref in a signed row a description of bytes actually
  // written rather than an unchecked claim.
  private spill: SessionSpillPolicy | null = null;
  private readonly spillConfig: Partial<SpillPolicyConfig>;

  // `store` is injectable so a caller (a test, a conformance run, a composed
  // service) can pin a backend without going through workspace configuration.
  // Left absent, the workspace's own pinned backend is opened.
  constructor(workspace: string, store?: SessionEventStore, spillConfig: Partial<SpillPolicyConfig> = {}) {
    this.workspace = workspace;
    this.store = store ?? openSessionEventStore(workspace);
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

  open(params: SessionOpenParams): SessionEventRef {
    if (this.sessionIdValue !== null) {
      throw new Error("SessionService.open called twice");
    }
    const sessionId = params.sessionId ?? randomUUID();
    this.sessionIdValue = sessionId;
    this.runtime = params.runtime ?? "amc";
    this.spill = new SessionSpillPolicy(new SessionSpillStore(this.workspace, sessionId), this.spillConfig);

    // Seed the per-session head from any rows already carrying this session id. A
    // fresh session has none, leaving seq=0 / prevHash=SESSION_GENESIS; a resumed
    // one picks up exactly where its last committed event left off.
    this.seedHead(sessionId);

    // The sessions row must exist before any event references it, or verification
    // reports "references missing session". A natively-run agent has no separate
    // binary, so binary_path records the agent id and binary_sha256 the
    // composition it ran under.
    this.store.startSession({
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
    // Checked BEFORE the header is appended: an unbacked tool-schema commitment
    // must not be able to reach the log at all, not merely be unlikely to.
    if (params.toolSchema !== null) {
      assertToolSchemaCommitted(this.readEvents(), params.toolSchema, this.sessionId);
    }
    const requestBytes =
      typeof params.requestBytes === "string" ? Buffer.from(params.requestBytes, "utf8") : params.requestBytes;
    const requestDigest = sha256Hex(requestBytes);
    // Annotated, so a field derivation reads cannot go missing here silently.
    // The LITERAL ORDER below is the hash pre-image order (see requestHeaderMeta).
    const typeMeta: RequestHeaderMeta = {
      model: params.model,
      providerId: params.providerId,
      params: params.params,
      encoderId: params.encoderId,
      encoderVersion: params.encoderVersion,
      systemPromptEventId: params.systemPromptEventId,
      toolSchemaEventId: params.toolSchema?.eventId ?? null,
      toolSchemaSha256: params.toolSchema?.payloadSha256 ?? null,
      projectionCutoffEventId: params.projectionCutoffEventId,
      projectionDigest: params.projectionDigest,
      sourceEventIds: [...params.sourceEventIds],
      requestDigest
    };
    const ref = this.appendSessionEvent({
      eventType: "request/header",
      typeMeta: { ...typeMeta },
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

  // The other half of the send path: what came back. One row per dispatch,
  // recorded AFTER the stream terminated, naming the request/header row it
  // settles. Without it a session records what a model was asked and never what
  // it answered — see ./requestOutcomeMeta.ts for the shape and for why the
  // retry verdict is recorded beside the provider's facts rather than inside
  // them.
  recordRequestOutcome(params: RequestOutcomeParams): SessionEventRef {
    return this.appendSessionEvent({
      eventType: requestOutcomeEventType(params),
      typeMeta: { ...buildRequestOutcomeMeta(params, this.currentTurn, this.currentStep) },
      surface: { op: "none" },
      turn: this.currentTurn,
      step: this.currentStep
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
    return this.projections.surface.evaluate(this.store.readSessionEvents(this.sessionId)).value;
  }

  // This session's committed rows, in commit order. Read-only, and re-read from
  // the store rather than served from a buffer, for the same reason
  // projectHistory() is: a caller building a request from these rows is building
  // it from what is durable, not from what this process happens to remember.
  readEvents(): readonly EvidenceEvent[] {
    this.ensureUsable();
    return this.store.readSessionEvents(this.sessionId);
  }

  // Commit the EXACT tool-schema bytes a request will carry, giving the header's
  // `toolSchemaSha256` a durable referent. Surface op is `none` because the tool
  // schema is part of the request envelope, not of the conversation — see
  // ./toolSchemaCommitment.ts for the full argument and for the alternative
  // (a spill-style side file) that was rejected.
  recordToolSchema(schemaBytes: string | Buffer): SessionEventRef {
    this.ensureUsable();
    const bytes = typeof schemaBytes === "string" ? Buffer.from(schemaBytes, "utf8") : schemaBytes;
    return this.appendSessionEvent({
      eventType: "request/tools",
      typeMeta: { turn: this.currentTurn, step: this.currentStep, toolSchemaSha256: sha256Hex(bytes) },
      surface: { op: "none" },
      turn: this.currentTurn,
      step: this.currentStep,
      payload: bytes
    });
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

  // The post-execute point: the tool has run, and its output is about to become
  // both model-visible and logged. The spill policy runs HERE, over the full
  // output, and what it returns is what gets recorded — so an oversized result
  // cannot reach the model in one form and the evidence in another. The full
  // bytes' sha256 rides in `spilled` inside meta_json, hence inside event_hash,
  // hence under writer_sig: spilling relocates the bytes, never the commitment.
  recordToolResult(result: ToolResultInput): SessionEventRef {
    this.ensureUsable();
    const turn = this.currentTurn;
    const step = this.currentStep;
    const full = typeof result.content === "string" ? Buffer.from(result.content, "utf8") : result.content;
    const outcome = this.requireSpill().apply({ nameSeed: result.toolCallId, content: full });
    return this.recordContent({
      eventType: "tool/result",
      content: outcome.content,
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
        [SPILL_META_KEY]: outcome.ref
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

    // sealSession is NOT idempotent — the contract makes a second seal throw on
    // every backend — so it runs exactly once, guarded by `closed`. The sealed
    // final hash then equals this close event's hash (it is the last event), so
    // the seal and the close event cross-check.
    this.store.sealSession(sessionId);
    this.closed = true;
    this.store.close();
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
    const input: SessionStoreAppendInput = {
      sessionId,
      runtime: this.runtime,
      eventType: spec.eventType,
      meta,
      ...(spec.id !== undefined ? { id: spec.id } : {}),
      ...(spec.payload !== undefined ? { payload: spec.payload } : {})
    };

    const result = this.store.appendSessionEvent(input);

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
    for (const row of this.store.readSessionEvents(sessionId)) {
      const envelope = extractEnvelope(row.meta_json);
      if (envelope === null) {
        continue;
      }
      this.seqCounter = envelope.seq + 1;
      this.prevHash = row.event_hash;
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

  // ensureUsable() has already proved the session is open, so a null policy here
  // would mean open() failed to build one — a programming error, not a state a
  // caller can reach.
  private requireSpill(): SessionSpillPolicy {
    if (this.spill === null) {
      throw new Error("SessionService: spill policy unavailable before open()");
    }
    return this.spill;
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
