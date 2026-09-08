import { createHash, randomUUID } from "node:crypto";
import type { EvidenceEvent } from "../types.js";
import { openSessionEventStore } from "../persistence/openSessionEventStore.js";
import type { SessionEventStore } from "../persistence/sessionEventStore.js";
import { sha256Hex } from "../utils/hash.js";
import type { ConversationHistory } from "./surfaceProjection.js";
import { createSessionProjections, type SessionProjections } from "./projection/sessionProjections.js";

import { SessionEventWriter } from "./sessionSpine.js";
export { NATIVE_TRUST_TIER } from "./sessionSpine.js";

import type { RequestHeaderMeta } from "./requestHeaderMeta.js";
import { buildRequestOutcomeMeta, requestOutcomeEventType } from "./requestOutcomeMeta.js";
import type { RequestOutcomeParams } from "./requestOutcomeMeta.js";
import { assertToolSchemaCommitted } from "./toolSchemaCommitment.js";
import { buildStepEndMeta, buildTurnEndMeta } from "./turnLifecycleMeta.js";
import { buildApprovalRow } from "./approvalEventMeta.js";
import { buildLoopEventRow } from "./loopEventMeta.js";
import type { LoopEventRecord } from "./loopEventMeta.js";
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
// for why the split exists and why PreparedRequest stayed here. Only the result
// type every caller of this module already handles is re-exported: mirroring the
// whole list here gave the shapes two import paths and therefore two places to
// drift, and nothing outside this file used the mirror.
export type { SessionEventRef } from "./sessionApiTypes.js";

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

/** A session row's `toolCallId`, when its meta carries one. */
function metaToolCallId(row: EvidenceEvent): string | null {
  try {
    const meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    return typeof meta["toolCallId"] === "string" ? meta["toolCallId"] : null;
  } catch {
    return null;
  }
}

export class SessionService extends SessionEventWriter {

  // The surface fold runs through the projection registry rather than direct
  // calls, so repeated projectHistory() resumes from the cached prefix instead
  // of re-parsing every row's meta_json. Public and per-service: the cache is
  // keyed to ONE log, and a composed runtime registers its own units here.
  readonly projections: SessionProjections = createSessionProjections();

  // `store` is injectable so a caller (a test, a conformance run, a composed
  // service) can pin a backend without going through workspace configuration.
  // Left absent, the workspace's own pinned backend is opened.
  constructor(workspace: string, store?: SessionEventStore, spillConfig: Partial<SpillPolicyConfig> = {}) {
    super(workspace, store ?? openSessionEventStore(workspace), spillConfig);
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
        policyDigest: params.policyDigest,
        ...(params.parent === undefined ? {} : { parentSession: { ...params.parent } })
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
    this.window.openTurn();

    const ref = this.appendSessionEvent({
      eventType: "turn/start",
      typeMeta: { turn, trigger: params.trigger },
      surface: { op: "none" },
      turn,
      step: null
    });
    return { ...ref, turn };
  }

  // Closes the turn this service is driving. `origin: "live"` is what makes a
  // cancellation here spell itself as a cancel WITH a cause and never as the
  // "interrupted" a crash leaves behind — the loop cannot disguise a stop as a
  // death, because buildTurnEndMeta refuses to write one.
  endTurn(params: TurnEndParams): TurnRef {
    const turn = this.requireTurn();
    const ref = this.appendSessionEvent({
      eventType: "turn/end",
      typeMeta: buildTurnEndMeta(
        { turn, reason: params.reason, cancelCause: params.cause ?? null, recovery: null },
        "live"
      ),
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
    const sealed = this.window.seal();
    const { merkleRoot: windowMerkleRoot, sealChainIndex } = sealed;

    const ref = this.appendSessionEvent({
      eventType: "turn/seal",
      typeMeta: {
        turn,
        window_first_event_id: sealed.firstEventId,
        window_last_event_id: sealed.lastEventId,
        window_event_count: sealed.eventCount,
        window_merkle_root: windowMerkleRoot,
        prev_seal_event_id: sealed.prevSealEventId,
        prev_seal_merkle_root: sealed.prevSealMerkleRoot,
        seal_chain_index: sealChainIndex
      },
      surface: { op: "none" },
      turn,
      step: null
    });

    this.window.recordSeal(ref.eventId, ref.eventHash, windowMerkleRoot);
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
      typeMeta: buildStepEndMeta({
        turn,
        step,
        stopReason: params.stopReason,
        // Passed straight through, null included: a step that reported no usage
        // records none rather than a fabricated zero.
        usage: params.usage,
        recoveredBy: null
      }),
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

  /**
   * Record a file the user attached, addressed by its own content.
   *
   * The bytes ARE the address: the row's `payload_sha256` is what the surface
   * part points at, which is the same invariant every other projected part
   * obeys. Attaching identical bytes under two names therefore yields one
   * address, and the row is the only copy.
   *
   * Its own event type rather than a `user/message`, because a reader needs to
   * tell what a person typed from what a person handed over -- and because an
   * attachment is gated on the way in (see ../attachments/attachmentIngest.ts)
   * while a typed message is not.
   */
  recordUserAttachment(params: {
    readonly filename: string;
    readonly content: string | Buffer;
    readonly kind: "text" | "image";
    readonly mimeType: string;
  }): SessionEventRef {
    const turn = this.currentTurn;
    const step = this.currentStep;
    const bytes = typeof params.content === "string"
      ? Buffer.from(params.content, "utf8")
      : params.content;
    return this.recordContent({
      eventType: "user/attachment",
      content: bytes,
      // Names BOTH: the digest makes the slot content-addressed, the filename
      // keeps it legible to a person reading the log.
      slot: `attachment:${params.filename}:${sha256Hex(bytes).slice(0, 12)}`,
      role: "user",
      kind: params.kind,
      buildMeta: () => ({
        turn,
        step,
        filename: params.filename,
        mimeType: params.mimeType,
        bytes: bytes.byteLength
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
  /**
   * Shorten a recorded tool result on the SURFACE, leaving the log untouched.
   *
   * The only writer of a `replace` surface op. The op has existed since the
   * vocabulary was written and `surfaceProjection.ts` has always handled it;
   * nothing emitted one until compaction needed it.
   *
   * WHY THIS DOES NOT REWRITE ANYTHING. The chain is append-only, so this is a
   * NEW row like any other — one whose surface op happens to point the
   * `tool_result:<id>` slot at different bytes. The original row is still there,
   * still hashed, still in the chain. An auditor replaying the log sees the full
   * output; the model, from here on, sees the replacement. That is the whole
   * difference between compaction and editing history.
   *
   * The replacement is this event's OWN payload, because it has to be:
   * `SurfacePartRef.sha256` equals the row's `payload_sha256` by construction,
   * so text that existed only in the projection could not be pointed at.
   */
  compactToolResult(params: {
    readonly toolCallId: string;
    readonly replacement: string;
    /**
     * How many bytes the caller measured for what it is replacing.
     *
     * Declared rather than read here, because session payloads are blob-backed:
     * `payload_inline` is null even for a two-byte row, so a size check against
     * it could never fire. A check that cannot fire is worse than no check, and
     * the pruner deciding WHAT to compact has already measured this.
     */
    readonly replacedBytes: number;
    readonly reason: string;
  }): SessionEventRef {
    this.ensureUsable();
    const slot = `tool_result:${params.toolCallId}`;

    // `replace` on a slot the projection does not hold is a silent no-op, so
    // without this a caller would be told a compaction happened while the model
    // saw no change. Read from this session's own rows rather than the
    // projection handle, which exposes the rendered conversation and not the
    // slots replace targets.
    const rows = this.readEvents();
    const current = [...rows]
      .reverse()
      .find((row) =>
        (row.event_type === "tool/result" || row.event_type === "loop/compact")
        && metaToolCallId(row) === params.toolCallId);
    if (current === undefined) {
      throw new Error(
        `cannot compact ${params.toolCallId}: no tool result for it is on this session's surface`
      );
    }

    const replacement = Buffer.from(params.replacement, "utf8");
    if (replacement.byteLength >= params.replacedBytes) {
      // Compaction that grows the surface is not compaction, and allowing it
      // would spend a signed row and a slice of the context window making things
      // worse.
      throw new Error(
        `refusing to compact ${params.toolCallId}: the replacement is ${replacement.byteLength} bytes, `
        + `not smaller than the ${params.replacedBytes} it would replace`
      );
    }

    const payloadSha256 = sha256Hex(replacement);
    const turn = this.currentTurn;
    const step = this.currentStep;
    return this.appendSessionEvent({
      eventType: "loop/compact",
      typeMeta: {
        turn,
        step,
        toolCallId: params.toolCallId,
        reason: params.reason,
        replacedBytes: params.replacedBytes,
        replacementBytes: replacement.byteLength
      },
      surface: { op: "replace", slot, part: { kind: "tool_result", sha256: payloadSha256 } },
      turn,
      step,
      payload: replacement
    });
  }

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

  // The approval audit pair. BOTH halves are turn-enclosed, and `requireTurn` is
  // what enforces it rather than a comment asking callers to be careful.
  //
  // WHY A TURN IS REQUIRED. The turn is this log's commit and replay boundary:
  // its `turn/seal` commits to a Merkle root over exactly the events inside its
  // window. An approval row appended between turns is in no window, so it is
  // covered by no seal — the one row an auditor most needs sealed would be the
  // one row that is not. The answer row was additionally being written with
  // `turn: null, step: null`, so even the pair's own halves could land in
  // different windows. Both now carry the same open turn and step, so the whole
  // decision sits inside one sealed window.
  //
  // The refusal is deliberately loud. An asker that has no turn open is asking
  // outside the lifetime of the work the answer would authorize, and the honest
  // response to that is to fail, never to log it somewhere weaker.
  recordApproval(record: ApprovalRecord): SessionEventRef {
    const turn = this.requireTurn();
    const step = this.currentStep;
    const row = buildApprovalRow(record, turn, step);
    return this.appendSessionEvent({
      eventType: row.eventType,
      typeMeta: row.meta,
      surface: { op: "none" },
      turn,
      step
    });
  }

  // The agent loop's own control rows — its inbox splices, its cancellations,
  // its pre-step vetoes. One method over a closed union rather than one method
  // per row, because these are the loop's bookkeeping rather than conversation
  // content: their shapes live together in ./loopEventMeta.ts, which is also
  // what keeps their hash pre-image order in one place. Surface op is always
  // `none` — a queued message becomes model-visible only when a step claims it
  // and records a `user/message`.
  recordLoopEvent(record: LoopEventRecord): SessionEventRef {
    this.ensureUsable();
    const row = buildLoopEventRow(record);
    return this.appendSessionEvent({
      eventType: row.eventType,
      typeMeta: row.meta,
      surface: { op: "none" },
      turn: this.currentTurn,
      step: this.currentStep,
      ...(row.payload === null ? {} : { payload: row.payload })
    });
  }

  /**
   * Record a scoreable projection row into this session's spine.
   *
   * THE RULE THIS EXISTS TO ENFORCE: a projection row belongs to the session
   * whose turn caused the fact it projects, and it goes through the session's
   * own writer -- never through `openLedger().appendEvidenceBatch`. Two writers
   * bypassed that (`agentToolset`'s record callback and
   * `delegationEvidenceWriter`), which put rows with NO SESSION ENVELOPE inside
   * sessions that have a spine. Two consequences followed, and only one of them
   * was obvious:
   *
   *   `sessionRootDescriptor` refuses to anchor such a session, because "the
   *   session root would cover less than the session does" -- a correct refusal,
   *   so every session that called a tool became unanchorable.
   *
   *   And a row written after the session was sealed makes the seal's committed
   *   final hash false, which `verifyLedgerIntegrity` reports workspace-wide.
   *   That is not a hidden cost: `assurance/assuranceRunner.ts` turns it into
   *   `status: "INVALID"`, and `evidence/auditPacket.ts` ships it to a customer
   *   as `integrity/ledger-verify.json`.
   *
   * The union is closed to the three projection types on purpose. This is not a
   * general escape hatch into the spine: a caller wanting to record conversation
   * or lifecycle has a named method for it, and widening this one would make
   * "what may enter the spine" a question with no answer.
   */
  recordProjectedEvidence(row: {
    readonly eventType: "audit" | "metric" | "stdout";
    readonly payload: string;
    readonly meta: Record<string, unknown>;
  }): SessionEventRef {
    this.ensureUsable();
    return this.appendSessionEvent({
      eventType: row.eventType,
      typeMeta: row.meta,
      // Projection rows are evidence about the turn, not content the model sees.
      surface: { op: "none" },
      turn: this.currentTurn,
      step: this.currentStep,
      payload: row.payload
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
        sealCount: this.window.sealCount,
        sessionMerkleRoot: this.window.sessionMerkleRoot(),
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
}
