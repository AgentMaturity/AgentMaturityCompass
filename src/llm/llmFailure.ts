/**
 * The typed failure vocabulary of the LLM seam.
 *
 * Ported from dsh (`packages/llm/llm/src/{error,adapter-failure}.ts`) with one
 * structural rule preserved deliberately and one AMC-specific rule added.
 *
 * PRESERVED — retryability is NOT a property of a failure. `LlmFailure` carries
 * provider FACTS (what happened, which status, what delay the provider asked
 * for) and nothing else. Whether those facts are worth another attempt is a
 * per-provider POLICY lookup over `code`, resolved in retryPolicy.ts. AMC has a
 * harder reason to keep the split than dsh did: these facts land in a signed,
 * hash-chained, externally anchored row. A `retryable: boolean` signed beside
 * them would be a policy DECISION recorded as a provider FACT, and the next
 * policy edit would make the signed row a lie. Sign the facts; compute the
 * decision at read time. The compile-time assertion below pins this.
 *
 * ADDED — every provider-supplied number is validated before it can enter a
 * failure, because a failure is on its way to a durable row and a row is
 * forever. dsh validates at the same three boundaries; AMC's are just more
 * expensive to get wrong.
 *
 * NEVER — a credential value must not appear in `message`, in a `cause` chain,
 * or in any field here. Errors are the likeliest escape route for a secret
 * (they get logged, attached to evidence, pasted into bug reports), and in AMC
 * an escaped secret is Merkle-anchored rather than merely embarrassing. Name
 * the `credentialRef`, never the value — the same rule the credentials seam
 * states in src/credentials/credentialsErrors.ts.
 */

/**
 * Serializable provider or transport failure facts.
 *
 * `code` is the routing discriminant: consumers switch on it and never parse
 * `message`. `status`, `providerRetryAfterMs` and `requestId` are present only
 * when the provider actually supplied a usable value — an absent field means
 * "not reported", which is different from zero.
 */
export interface LlmFailure {
  /** Human-readable provider or transport failure. Never carries a secret. */
  readonly message: string;
  /** Stable provider-neutral machine-routing code. */
  readonly code: string;
  /** HTTP status returned by the provider, when available (100..599). */
  readonly status?: number;
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number;
  /** Opaque provider-issued request identifier, for diagnostics only. */
  readonly requestId?: string;
}

type AssertTrue<T extends true> = T;

/**
 * Compile-time proof that a policy decision has not been smuggled onto the
 * facts. If anyone adds `retryable` (or any other verdict field) to
 * `LlmFailure`, this alias stops compiling. Without it the split above is a
 * comment; with it, it is checked on every build.
 */
type _FailureCarriesNoPolicyDecision = AssertTrue<
  "retryable" extends keyof LlmFailure ? false : true
>;

/**
 * The provider-neutral routing codes AMC ships.
 *
 * Spelled exactly as dsh spells them, on purpose: these strings are the shared
 * classification vocabulary an adapter ported from dsh already produces, and a
 * silent respelling would make a ported classifier route into nothing. They are
 * deliberately NOT `AMC_`-prefixed — the prefix in this repository marks AMC's
 * own contract violations (see `LlmStreamProtocolCode`), and a provider's rate
 * limit is not an AMC contract violation.
 *
 * `code` on `LlmFailure` stays a plain `string` rather than this union, because
 * an unclassifiable HTTP status becomes `HTTP_<status>` and the set is
 * therefore open by construction.
 */
export const LLM_FAILURE_CODE = Object.freeze({
  /** Provider refused the credential presented (401/403). */
  AUTH: "AUTH",
  /** Caller or a higher layer cancelled before the provider finished. */
  ABORTED: "ABORTED",
  /** Request exceeded the model's context window. One canonical code, whether thrown or in-band. */
  CONTEXT_WINDOW_EXCEEDED: "CONTEXT_WINDOW_EXCEEDED",
  /**
   * A terminal stop that carried no content at all. Classified as a failure
   * rather than yielded as an empty assistant message, because an empty message
   * ends the turn with nothing for the user or the loop to act on. The attempt
   * produced nothing durable, so it is safe to repeat — hence retryable by
   * default.
   */
  EMPTY_RESPONSE: "EMPTY_RESPONSE",
  /** Request was malformed or rejected on its content (400, 413). */
  INVALID_REQUEST: "INVALID_REQUEST",
  /**
   * A credential was supplied but cannot be used — malformed, not absent.
   * Deliberately outside the default retryable set: a malformed credential
   * fails identically on every attempt.
   */
  INVALID_CREDENTIAL: "INVALID_CREDENTIAL",
  /** No credential was resolvable for the request's credentialRef. */
  MISSING_CREDENTIAL: "MISSING_CREDENTIAL",
  /** Account quota, balance or budget is exhausted. Terminal — waiting does not refill it. */
  QUOTA: "QUOTA",
  /** Transient request-rate limit (429). Retryable. */
  RATE_LIMIT: "RATE_LIMIT",
  /** Provider-side error (5xx). Retryable. */
  SERVER: "SERVER",
  /** The stream stalled past its idle bound, or the request timed out. Retryable. */
  TIMEOUT: "TIMEOUT",
  /** Connection-level failure before or during the exchange. Retryable. */
  TRANSPORT: "TRANSPORT",
  /** A thrown value the seam could not classify as any of the above. */
  UNKNOWN: "UNKNOWN"
} as const);

/** The codes AMC itself produces; providers may widen the space with `HTTP_<status>`. */
export type LlmFailureCode = (typeof LLM_FAILURE_CODE)[keyof typeof LLM_FAILURE_CODE];

/** Structured provider facts accepted by {@link LlmError}. */
export interface LlmErrorOptions extends ErrorOptions {
  /** Valid HTTP status observed at the provider boundary. */
  readonly status?: number;
  /** Positive finite provider-requested delay in milliseconds. */
  readonly providerRetryAfterMs?: number;
  /** Non-empty opaque provider request id. */
  readonly requestId?: string;
}

/**
 * The seam's thrown error. Carries the same {@link LlmFailure} an in-band
 * terminal finish would carry, so the two sanctioned error paths — a throw from
 * `stream()`, or a `finish {kind:"error"|"aborted", failure}` — produce one type
 * for consumers and one set of facts for the durable row.
 *
 * The constructor validates rather than trusts. Every one of these values came
 * from a provider response and is heading for a signed event; a status of
 * `"429 "`, a negative retry delay or an empty request id must fail here, at
 * the boundary, and not be discovered later inside an anchored row.
 */
export class LlmError extends Error {
  /** Stable machine-routable failure class. Route on this, never on `message`. */
  readonly code: string;

  /** Frozen serializable facts, safe to hand to a durable writer. */
  readonly failure: LlmFailure;

  constructor(message: string, code: string, options?: LlmErrorOptions) {
    if (typeof message !== "string" || message.length === 0) {
      throw new Error("LlmError message must be a non-empty string");
    }
    if (typeof code !== "string" || code.length === 0) {
      throw new Error("LlmError code must be a non-empty string");
    }
    if (
      options?.status !== undefined &&
      (!Number.isInteger(options.status) || options.status < 100 || options.status > 599)
    ) {
      throw new Error("LlmError status must be an integer from 100 through 599");
    }
    if (
      options?.providerRetryAfterMs !== undefined &&
      (!Number.isFinite(options.providerRetryAfterMs) || options.providerRetryAfterMs <= 0)
    ) {
      throw new Error("LlmError providerRetryAfterMs must be a positive finite number");
    }
    if (
      options?.requestId !== undefined &&
      (typeof options.requestId !== "string" || options.requestId.length === 0)
    ) {
      throw new Error("LlmError requestId must be a non-empty string");
    }
    super(message, options);
    this.name = "LlmError";
    this.code = code;
    this.failure = Object.freeze({
      message,
      code,
      ...(options?.status === undefined ? {} : { status: options.status }),
      ...(options?.providerRetryAfterMs === undefined
        ? {}
        : { providerRetryAfterMs: options.providerRetryAfterMs }),
      ...(options?.requestId === undefined ? {} : { requestId: options.requestId })
    });
  }
}

/** Narrow a caught value to {@link LlmError}. Duck-typed copies do not narrow. */
export function isLlmError(value: unknown): value is LlmError {
  return value instanceof LlmError;
}

/** Structured codes and plain phrases that name a context bound being exceeded. */
const STRUCTURED_CONTEXT_OVERFLOW = new RegExp(
  String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` +
    String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`,
  "i"
);

/** Request-size wording that ties "too large" directly to model context capacity. */
const TOO_LARGE_FOR_CONTEXT = new RegExp(
  String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` +
    String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` +
    String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`,
  "i"
);

/** "Exceeds" wording is safe only when its object is explicitly the model context. */
const EXCEEDS_MODEL_CONTEXT = new RegExp(
  String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` +
    String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` +
    String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`,
  "i"
);

/**
 * Recognize the context-overflow wording OpenAI-compatible providers use.
 *
 * @param detail provider code, type and message text joined into one string.
 */
export function isContextWindowExceededDetail(detail: string): boolean {
  return (
    STRUCTURED_CONTEXT_OVERFLOW.test(detail) ||
    /\b(?:maximum|max)(?:\s+(?:allowed|supported))?\s+context\s+(?:length|window)\b/i.test(detail) ||
    TOO_LARGE_FOR_CONTEXT.test(detail) ||
    /\b(?:input|prompt|request)\s+(?:is\s+)?too\s+(?:long|large)\s+for\s+(?:this|the)\s+model\b/i.test(
      detail
    ) ||
    EXCEEDS_MODEL_CONTEXT.test(detail)
  );
}

/**
 * Recognize wording that identifies an exhausted account quota rather than a
 * transient request-rate limit. The distinction decides retryability, so it is
 * checked BEFORE the status code in {@link httpFailureCode}.
 */
export function isQuotaExceededDetail(detail: string): boolean {
  return (
    /\binsufficient[\s_-]+(?:quota|balance|credits?)\b/i.test(detail) ||
    /\b(?:quota|usage[\s_-]+limit)[\s_-]+(?:exceeded|exhausted|reached)\b/i.test(detail) ||
    /\bexceed(?:ed|s)?[\s_-]+(?:(?:your|the)[\s_-]+)?(?:current[\s_-]+)?quota\b/i.test(detail) ||
    /\b(?:balance|credits?)[\s_-]+(?:exhausted|depleted)\b/i.test(detail) ||
    /\bout[\s_-]+of[\s_-]+(?:credits?|budget)\b/i.test(detail)
  );
}

/**
 * Classify one provider HTTP status into the routing vocabulary.
 *
 * Ordering is load-bearing and is the reason this is one function rather than a
 * lookup table: quota wording is tested BEFORE 429, because providers signal an
 * exhausted balance with the same status as a transient rate limit. Getting
 * that order wrong makes a terminal failure retry forever.
 *
 * @param status HTTP status from the provider response.
 * @param detail provider code, type and message text joined into one string;
 *   pass "" when the provider supplied no structured error body.
 */
export function httpFailureCode(status: number, detail = ""): string {
  if (status === 401 || status === 403) return LLM_FAILURE_CODE.AUTH;
  if (status === 413) return LLM_FAILURE_CODE.INVALID_REQUEST;
  if (isQuotaExceededDetail(detail)) return LLM_FAILURE_CODE.QUOTA;
  if (status === 429) return LLM_FAILURE_CODE.RATE_LIMIT;
  if (status === 400) {
    if (isContextWindowExceededDetail(detail)) return LLM_FAILURE_CODE.CONTEXT_WINDOW_EXCEEDED;
    return LLM_FAILURE_CODE.INVALID_REQUEST;
  }
  if (status >= 500) return LLM_FAILURE_CODE.SERVER;
  return `HTTP_${status}`;
}

/**
 * Parse a `Retry-After` header value into milliseconds.
 *
 * Both sanctioned forms are accepted (bare delta-seconds and an HTTP-date), and
 * anything that does not resolve to a positive finite delay returns undefined
 * rather than a guess. A provider's hint is provider-supplied input arriving at
 * a durable boundary, so it is validated here and again by {@link LlmError}.
 *
 * @param value raw header value, or null when the header was absent.
 * @param now injectable clock for the HTTP-date form, so the parse is testable.
 */
export function parseProviderRetryAfterMs(
  value: string | null | undefined,
  now: number = Date.now()
): number | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const ms = /^\d+$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed) - now;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/**
 * Detach serializable provider facts from an arbitrary thrown value.
 *
 * Every read here goes through `Object.getOwnPropertyDescriptor` and accepts
 * the value only when `"value" in descriptor` — an OWN DATA property, never an
 * accessor. That is not paranoia in AMC's setting: a getter that answers
 * differently on two reads would let the signed row disagree with what the user
 * was shown. Read the facts once, freeze them, then sign.
 *
 * A carried `failure` is trusted only when its `code` agrees with the error's
 * own `code` property, because cross-package copies preserve own data but not
 * class identity. A third-party SDK's own `code` is never adopted as AMC
 * taxonomy — an unrecognized throw is `UNKNOWN`.
 */
export function normalizeLlmFailure(value: unknown): LlmFailure {
  const error = value instanceof Error ? value : new Error(thrownMessage(value));
  const carried = ownFailureSnapshot(error);
  if (carried !== undefined && carried.code === ownErrorCode(error)) return carried;
  return Object.freeze({
    message: errorMessage(error),
    code: isLlmError(error) ? error.code : LLM_FAILURE_CODE.UNKNOWN
  });
}

/** Render a non-Error throw without letting hostile coercion escape normalization. */
function thrownMessage(value: unknown): string {
  try {
    const message = String(value);
    return message.length > 0 ? message : "LLM adapter failed";
  } catch {
    // A throwing toString/Symbol.toPrimitive is the only way here; the whole
    // point of normalization is that nothing escapes it.
    return "LLM adapter failed";
  }
}

/** Read a foreign error's own data-backed `code` without invoking accessors. */
function ownErrorCode(error: Error): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Snapshot an own data `failure` property without invoking an SDK-defined accessor. */
function ownFailureSnapshot(error: Error): LlmFailure | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "failure");
    return descriptor !== undefined && "value" in descriptor
      ? failureSnapshot(descriptor.value)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Validate and detach an arbitrary serializable failure payload. */
function failureSnapshot(value: unknown): LlmFailure | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    const candidate = value as Partial<LlmFailure>;
    const { message, code, status, providerRetryAfterMs, requestId } = candidate;
    if (
      typeof message !== "string" ||
      message.length === 0 ||
      typeof code !== "string" ||
      code.length === 0 ||
      (status !== undefined && (!Number.isInteger(status) || status < 100 || status > 599)) ||
      (providerRetryAfterMs !== undefined &&
        (!Number.isFinite(providerRetryAfterMs) || providerRetryAfterMs <= 0)) ||
      (requestId !== undefined && (typeof requestId !== "string" || requestId.length === 0))
    ) {
      return undefined;
    }
    return Object.freeze({
      message,
      code,
      ...(status === undefined ? {} : { status }),
      ...(providerRetryAfterMs === undefined ? {} : { providerRetryAfterMs }),
      ...(requestId === undefined ? {} : { requestId })
    });
  } catch {
    return undefined;
  }
}

/** Read an SDK error message without letting an accessor replace the primary failure. */
function errorMessage(error: Error): string {
  try {
    const message: unknown = error.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // Fall through: a failure is still produced, just without the SDK's text.
  }
  return "LLM adapter failed";
}
