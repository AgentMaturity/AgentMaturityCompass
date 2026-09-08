/**
 * The wire shape of the two rows that SETTLE a `request/header` (plan P3.1).
 *
 * P2.2 gave the send path half a story: a signed row committing to the bytes a
 * model was about to be shown. Nothing said what came back. That gap is not
 * cosmetic — it is the difference between "AMC recorded a request" and "AMC can
 * answer what this turn cost and why it stopped". Two rows close it:
 *
 *   `request/response` — the provider completed the response it intended.
 *                        Carries the finish reason and the token accounting.
 *   `request/failure`  — the provider (or the transport, or the consumer)
 *                        ended the dispatch without a completed response.
 *
 * WHY TWO TYPES AND NOT ONE. A workspace-wide query for "every model call that
 * failed" is the question an operator actually asks, and answering it by
 * scanning a single `request/outcome` type and re-reading meta is the kind of
 * detail that gets skipped in a report. They are also read by different people:
 * the response row feeds cost and context-pressure projections, the failure row
 * feeds incident review.
 *
 * WHY THE RETRY VERDICT LIVES UNDER `policy` AND NOT UNDER `failure`. Because
 * src/llm/retryPolicy.ts's rule is that retryability is a policy LOOKUP over a
 * failure code and never a field on the failure: the facts are permanent and the
 * policy is an operator setting that changes independently. Folding them into
 * one object would sign an opinion as an observation, and the next policy edit
 * would make every earlier row wrong about a decision it never recorded. They
 * are therefore recorded side by side and separately labelled — the provider's
 * facts under `failure`, AMC's decision at dispatch time under `policy`.
 *
 * WHAT MUST NEVER APPEAR HERE. A credential value. `credential` carries the
 * reference NAME and the answering layer — exactly what
 * `CredentialsService.describe()` returns, which is structurally incapable of
 * carrying a value — because "which layer supplied the key that got a 401" is
 * the useful question and the key itself never is.
 */
import type { SurfaceKind } from "./sessionTypes.js";

/** Terminal finish kinds that mean the provider completed the response. */
export type CompletedFinishKind = "stop" | "tool_calls" | "max_tokens";

/** Terminal finish kinds that mean it did not. */
export type FailedFinishKind = "error" | "aborted";

/**
 * The provider's facts about one failure, as recorded.
 *
 * Deliberately spelled here rather than imported from `src/llm/llmFailure.ts`.
 * The session spine must be able to describe a durable row without depending on
 * the seam that happens to produce it today, and the absence of a `retryable`
 * field is a property of THIS shape that a future edit to the LLM seam must not
 * be able to change by accident.
 */
export interface RecordedFailure {
  /** Provider message, with any resolved credential value already removed. */
  readonly message: string;
  /** Stable machine-routable failure class (`RATE_LIMIT`, `AUTH`, …). */
  readonly code: string;
  /** HTTP status when the failure came from a response, else null. */
  readonly status: number | null;
  /** Provider-advertised wait before retrying, in ms, or null. */
  readonly providerRetryAfterMs: number | null;
  /** Provider-side request id for support escalation, or null. */
  readonly requestId: string | null;
}

/** Numeric compatibility fields plus explicit report/completeness provenance.
 * Missing reports are unknown; their zero fields are not measured totals. */
export interface RecordedUsage {
  /** Added provenance; omitted on historical rows. No provider report is not measured zero. */
  readonly reported?: boolean;
  /** A failed stream may retain a reported subtotal without claiming final usage. */
  readonly complete?: boolean;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly reasoningTokens: number | null;
}

/** What was known about the credential the dispatch used. Never its value. */
export interface RecordedCredential {
  readonly ref: string;
  readonly configured: boolean;
  readonly source: string | null;
}

/**
 * One block of a stream, as the settlement row names it.
 *
 * `eventId` is null exactly when the block was not given a row of its own —
 * which is what `status: "dropped"` means. The ordinal, kind and reason are
 * still recorded, so a later reader can say what was dropped and why without
 * having to trust that an absence meant something.
 */
export interface RecordedBlockRef {
  /** The `assistant/block` or `tool/call` row, or null when the block was dropped. */
  readonly eventId: string | null;
  /** First-seen position in the stream, 0-based and contiguous. */
  readonly ordinal: number;
  readonly kind: SurfaceKind;
  readonly status: "completed" | "truncated" | "dropped";
  /** Why it was dropped; null otherwise. */
  readonly reason: string | null;
}

/** Fields both settlement rows carry. */
export interface RequestOutcomeMetaBase {
  /** New runtime provenance; omitted on historical rows. An admitted attempt may still fail before any bytes reach the provider. */
  readonly dispatchAttempted?: boolean;
  readonly turn: number | null;
  readonly step: number | null;
  /** The `request/header` row this settles. */
  readonly headerEventId: string;
  /** That row's `requestDigest`, repeated so a settlement joins without a lookup. */
  readonly requestDigest: string;
  readonly providerId: string;
  /** Which adapter registration dispatched — the pin, recorded. */
  readonly adapterId: string;
  readonly adapterVersion: number;
  /** Response status, or null when no response was received at all. */
  readonly httpStatus: number | null;
  /** Dispatch to termination, in milliseconds. */
  readonly durationMs: number;
  /**
   * Every block the stream produced, in stream order, with its disposition.
   *
   * Present on BOTH shapes, and TOTAL on both. A failed stream can still have
   * produced complete blocks before it broke, and a block the assembler decided
   * to drop — a tool call cut off mid-arguments, a whitespace-only text block —
   * is recorded here with its reason rather than vanishing. "Nothing the model
   * produced disappears without a signed statement about it" is the property,
   * and a list of surviving row ids alone could not carry it.
   */
  readonly blocks: readonly RecordedBlockRef[];
}

export interface RequestResponseMeta extends RequestOutcomeMetaBase {
  readonly outcome: "completed";
  readonly finishReason: CompletedFinishKind;
  readonly usage: RecordedUsage;
}

export interface RequestFailureMeta extends RequestOutcomeMetaBase {
  readonly outcome: "failed";
  readonly finishReason: FailedFinishKind;
  readonly failure: RecordedFailure;
  readonly usage?: RecordedUsage;
  /** AMC's decision at dispatch time — not a property of the failure. */
  readonly policy: { readonly mode: "normal" | "always"; readonly retryable: boolean };
  readonly credential: RecordedCredential;
}

export type RequestOutcomeMeta = RequestResponseMeta | RequestFailureMeta;

/** Everything a caller states about a settled dispatch, minus turn/step. */
export type RequestOutcomeParams =
  | Omit<RequestResponseMeta, "turn" | "step">
  | Omit<RequestFailureMeta, "turn" | "step">;

/**
 * The event type each outcome is recorded under.
 *
 * A function rather than a ternary at the call site so the mapping exists once:
 * a row typed `request/response` whose meta says `failed` would be a row that
 * two different queries disagree about.
 */
export function requestOutcomeEventType(
  params: RequestOutcomeParams
): "request/response" | "request/failure" {
  return params.outcome === "completed" ? "request/response" : "request/failure";
}

/**
 * Build the type meta for a settlement row.
 *
 * The literal order below is the hash pre-image order — `sanitizeMetaForHash`
 * re-stringifies meta in insertion order — so it is fixed here, in one place,
 * rather than at each call site. See ./requestHeaderMeta.ts for the full note.
 */
export function buildRequestOutcomeMeta(
  params: RequestOutcomeParams,
  turn: number | null,
  step: number | null
): RequestOutcomeMeta {
  const base = {
    turn,
    step,
    headerEventId: params.headerEventId,
    requestDigest: params.requestDigest,
    providerId: params.providerId,
    adapterId: params.adapterId,
    adapterVersion: params.adapterVersion,
    httpStatus: params.httpStatus,
    durationMs: params.durationMs,
    blocks: [...params.blocks],
    ...(params.dispatchAttempted === undefined ? {} : { dispatchAttempted: params.dispatchAttempted })
  };
  if (params.outcome === "completed") {
    return { ...base, outcome: "completed", finishReason: params.finishReason, usage: params.usage };
  }
  return {
    ...base,
    outcome: "failed",
    finishReason: params.finishReason,
    failure: params.failure,
    ...(params.usage === undefined ? {} : { usage: params.usage }),
    policy: params.policy,
    credential: params.credential
  };
}
