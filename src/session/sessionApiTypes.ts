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
import type {
  ApprovalAnswer,
  SurfaceKind,
  TokenUsage,
  ToolDispatch,
  ToolOutcome,
  TurnEndReason,
  TurnTrigger
} from "./sessionTypes.js";

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
}

export interface ToolCallInput {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly dispatch: ToolDispatch;
  readonly parentToken: string | null;
  readonly args: string | Buffer; // payload; argsSha256 = payload_sha256
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
 */
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
