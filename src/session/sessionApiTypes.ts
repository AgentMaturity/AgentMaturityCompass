/**
 * The call surface of `SessionService`, as data.
 *
 * These are the parameter and result shapes only — no behaviour, no brand, no
 * mint. They were extracted from sessionService.ts when the spill policy landed
 * there: that file was 10 lines under the 800-line cap, and the choice was
 * between splitting it and raising a ratchet baseline. Splitting is the one the
 * repository's rules allow, and types with no logic are the cleanest seam to
 * split on.
 *
 * `PreparedRequest` deliberately did NOT move. Its guarantee is that only
 * `SessionService.recordRequestHeader` can construct one, and that rests on the
 * brand symbol being unnameable outside its module. Exporting the symbol so a
 * second module could mint would have converted a structural property into a
 * convention — the exact trade this codebase keeps refusing.
 */
import type { RuntimeName } from "../types.js";
import type { RecordedGeminiPart } from "./geminiPartMeta.js";
import type {
  ApprovalAnswer,
  SurfaceKind,
  TokenUsage,
  ToolDispatch,
  ToolOutcome,
  TurnCancelCause,
  TurnEndReason,
  TurnTrigger
} from "./sessionTypes.js";
import type { ToolSchemaRef } from "./toolSchemaCommitment.js";

/**
 * Reference returned for every appended session event. Superset of the ledger's
 * AppendEvidenceResult, expressed in session terms. For a content-bearing event
 * payloadSha256 equals the SurfacePartRef.sha256 the event contributes.
 */
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

/**
 * turn/seal carries no payload; its meta commits to the window and the row's own
 * writer_sig IS the seal signature.
 */
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
  /**
   * Set when this session is a FORK: the parent's verified final row. Recorded
   * in the `session/open` row so lineage is a signed claim, not a filename.
   */
  readonly parent?: SessionLineage;
}

/** A verified pointer at another session's last enveloped row. */
export interface SessionLineage {
  readonly sessionId: string;
  readonly finalEventHash: string;
  readonly seq: number;
}

/** Re-open an existing, unsealed session from another process (AMC-1511). */
export interface SessionAttachParams {
  readonly sessionId: string;
  readonly runtime?: RuntimeName;
  readonly agentId: string;
  readonly harnessVersion: string;
  readonly compositionDigest: string;
  readonly policyDigest: string;
  readonly claimant: { readonly pid: number; readonly hostId: string; readonly bootId: string; readonly startedAt: number };
  /** The last enveloped row the resumer observed before claiming. */
  readonly observedHeadEventId: string;
  readonly observedHeadEventHash: string;
}

export interface TurnStartParams {
  readonly trigger: TurnTrigger;
}

/**
 * How a LIVE turn ends. Two shapes, because two facts:
 *
 *   - a cancel MUST name its cause — an unattributed "someone stopped it" is not
 *     evidence, and the cause is signed with the row (see ./turnLifecycleMeta.ts);
 *   - every other live ending carries no cause at all (`cause?: never` makes
 *     attaching one a compile error, not a runtime surprise).
 *
 * `"interrupted"` is deliberately NOT reachable from here. It means "this agent
 * died" and is written only by crash repair; a live loop that could spell it
 * would be able to disguise a cancellation as a crash. `interrupted` is likewise
 * no longer a caller-supplied boolean — it is derived from `reason` on write, so
 * the row cannot contradict itself.
 */
export type TurnEndParams =
  | { readonly reason: "cancelled"; readonly cause: TurnCancelCause }
  | { readonly reason: Exclude<TurnEndReason, "cancelled" | "interrupted">; readonly cause?: never };

export interface StepEndParams {
  readonly stopReason: string | null;
  /**
   * Token accounting, or null when the step produced none.
   *
   * Nullable because a stream that was cancelled or failed reports no usage:
   * StreamAssembly.usage is null on every abort. A non-nullable field would
   * force the caller to invent four zeroes and sign them — a measurement nobody
   * took, recorded as if they had.
   */
  readonly usage: TokenUsage | null;
}

export interface RequestHeaderParams {
  readonly model: string;
  readonly providerId: string;
  readonly params: Record<string, unknown>;
  /**
   * Which deterministic encoder produced `requestBytes`, and at which version of
   * its wire shape. Without this pair the log records bytes nobody can rebuild:
   * derivation has to run the SAME function the send path ran, and "the same"
   * has to be a name in a signed row rather than an assumption about what the
   * tree happened to contain on the day.
   */
  readonly encoderId: string;
  readonly encoderVersion: number;
  readonly systemPromptEventId: string;
  /**
   * The `request/tools` row holding the exact tool-schema bytes, or null for a
   * request with no tools. The service REFUSES a ref that no such row backs —
   * see ./toolSchemaCommitment.ts for why a bare digest was a defect.
   */
  readonly toolSchema: ToolSchemaRef | null;
  readonly projectionCutoffEventId: string;
  readonly projectionDigest: string;
  readonly sourceEventIds: readonly string[];
  /**
   * The EXACT bytes that will be transmitted to the model. recordRequestHeader
   * commits requestDigest = sha256(these) inside the signed request/header row
   * before it hands them back wrapped in a PreparedRequest, so the transmitted
   * bytes are always pinned by a durable, signed event.
   */
  readonly requestBytes: string | Buffer;
}

export interface AssistantBlockInput {
  readonly blockIndex: number;
  readonly blockKind: SurfaceKind;
  readonly stopReason: string | null;
  readonly content: string | Buffer;
  readonly gemini?: RecordedGeminiPart;
}

export interface ToolCallInput {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly dispatch: ToolDispatch;
  readonly parentToken: string | null;
  readonly args: string | Buffer; // payload; argsSha256 = payload_sha256
  readonly gemini?: RecordedGeminiPart;
  /** Request-scoped provider identity; canonical toolName remains the policy key. */
  readonly providerName?: {
    readonly version: 1;
    readonly wireName: string;
    readonly headerEventId: string;
    readonly encoderId: string;
    readonly encoderVersion: number;
  };
}

/**
 * A tool's outcome and its FULL output.
 *
 * There is deliberately no `spilled` field. Spill used to be declared here by
 * the caller, which meant the signed row recorded a claim nobody had checked;
 * the service now runs the spill policy over `content` itself and mints the ref
 * from the bytes it actually wrote (see src/session/spill/spillPolicy.ts). Pass
 * the whole output — however large — and let the policy decide what the model
 * sees.
 */
export interface ToolResultInput {
  readonly toolCallId: string;
  readonly outcome: ToolOutcome;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly denied: boolean;
  readonly content: string | Buffer;
}

/**
 * One shape for both approval/request and approval/answer, discriminated on
 * `phase`, so the two halves of an approval share a call surface.
 *
 * `approvalId` is what PAIRS them, and it is minted by the asker rather than by
 * whoever answers: the question has to be logged before anybody may answer it,
 * so the id cannot come from the answer. See ./approvalEventMeta.ts for the row
 * shapes and for why the answer names the approvals-engine chain it came from.
 */
export type ApprovalRecord =
  | {
      readonly phase: "request";
      readonly approvalId: string;
      readonly toolCallId: string;
      readonly question: string;
      /**
       * The tool and action class the question is about.
       *
       * Recorded on the ROW rather than left to the prose in `question`, because
       * "which tool was this" is the first thing an auditor filters on and a
       * sentence is not a field. Nullable for an ask that is not about a tool.
       */
      readonly toolName?: string | null;
      readonly actionClass?: string | null;
    }
  | {
      readonly phase: "answer";
      readonly approvalId: string;
      readonly answer: ApprovalAnswer;
      readonly answeredBy: string;
      /** The approvals-engine request this verdict came from, or null when none was raised. */
      readonly approvalRequestId?: string | null;
      /** Why — above all, why `unavailable`, which is otherwise indistinguishable from silence. */
      readonly reason?: string | null;
    };

export interface SandboxModeInput {
  readonly backend: string;
  readonly mode: string;
  readonly policyDigest: string;
}

export interface SessionCloseParams {
  readonly reason: string;
}
