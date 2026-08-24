/**
 * Provider-owned retry policy: the only place that decides whether a failure is
 * worth repeating.
 *
 * Ported from dsh (`packages/llm/llm/src/retry-policy.ts`). What matters more
 * than the code is the SHAPE, so it is stated plainly:
 *
 *   retryability is a POLICY LOOKUP over a failure's `code`.
 *   It is not, and must never become, a field on the failure.
 *
 * `LlmFailure` records what the provider did; this module records what AMC has
 * decided to do about failures of that class. They are signed differently and
 * they change at different rates: the facts are permanent, the policy is an
 * operator setting. Folding the decision into the facts would sign an opinion
 * as an observation, and the next policy edit would make every earlier signed
 * row wrong about a decision it never actually recorded.
 *
 * A resolved policy is captured and FROZEN when a provider route registers, so
 * later route replacement or disposal cannot change an in-flight failure's
 * recovery policy underneath it.
 *
 * This module does NOT execute retries. Nothing here sleeps, counts attempts or
 * reopens a turn. Turn-boundary retry belongs to the agent loop (P3.2), which
 * is what dispatches a request and therefore what can durably record a second
 * attempt; a retry executor living in the transport would be a subsystem with
 * no production caller and no way to write the evidence a retry owes.
 */
import type { LlmFailure } from "./llmFailure.js";
import { LLM_FAILURE_CODE } from "./llmFailure.js";

/**
 * Node's timer ceiling: a delay above this overflows to firing immediately,
 * which turns a long backoff into a hot loop. Bounding here means a
 * misconfigured policy fails at resolution rather than at 3am.
 */
export const MAX_RETRY_DELAY_MS = 2_147_483_647;

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;
const DEFAULT_JITTER_RATIO = 0.1;

/**
 * The codes a default policy will repeat, and the complete list of them.
 *
 * Everything absent from this set is terminal by default — `AUTH`, `QUOTA`,
 * `INVALID_REQUEST`, `CONTEXT_WINDOW_EXCEEDED`, `INVALID_CREDENTIAL`,
 * `MISSING_CREDENTIAL`, `ABORTED`, `UNKNOWN` and every `HTTP_<status>`. Two are
 * worth naming because the reasoning is not obvious:
 *
 * - `EMPTY_RESPONSE` IS retryable: the attempt produced nothing durable, so
 *   repeating it cannot duplicate a side effect.
 * - `INVALID_CREDENTIAL` is NOT: a malformed credential fails identically on
 *   every attempt, and retrying only delays the operator's fix.
 */
export const DEFAULT_RETRYABLE_CODES: readonly string[] = Object.freeze([
  LLM_FAILURE_CODE.EMPTY_RESPONSE,
  LLM_FAILURE_CODE.RATE_LIMIT,
  LLM_FAILURE_CODE.SERVER,
  LLM_FAILURE_CODE.TIMEOUT,
  LLM_FAILURE_CODE.TRANSPORT
]);

/** Bounded exponential backoff with symmetric jitter around each local delay. */
export interface BackoffConfig {
  /** Initial local exponential-backoff delay in milliseconds (default 500). */
  readonly initialDelayMs?: number;
  /** Maximum locally scheduled or accepted provider delay in milliseconds (default 10000). */
  readonly maxDelayMs?: number;
  /** Symmetric random multiplier range around one (default 0.1). */
  readonly jitterRatio?: number;
}

/** Retry only the configured transient failure codes. */
export interface NormalRetryPolicyConfig {
  readonly mode: "normal";
  /** Maximum eligible retries after the first request (default 5). */
  readonly maxRetries?: number;
  /** Failure codes eligible under this policy. */
  readonly retryableCodes?: readonly string[];
  readonly backoff?: BackoffConfig;
}

/**
 * Retry every model-request failure until success, cancellation, or disposal.
 *
 * Deliberately kept, because the honest alternative to an operator who wants
 * this is an operator who writes their own retry loop outside the evidence
 * spine — where nothing is recorded at all.
 */
export interface AlwaysRetryPolicyConfig {
  readonly mode: "always";
  readonly backoff?: BackoffConfig;
}

/** Provider-owned model-request retry policy configuration. */
export type RetryPolicyConfig = NormalRetryPolicyConfig | AlwaysRetryPolicyConfig;

/** Fully resolved backoff shared by both modes. */
export interface ResolvedRetryBackoff {
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
}

/** Fully resolved bounded transient retry policy. */
export interface ResolvedNormalRetryPolicy extends ResolvedRetryBackoff {
  readonly mode: "normal";
  readonly maxRetries: number;
  readonly retryableCodes: readonly string[];
}

/** Fully resolved unbounded retry policy. */
export interface ResolvedAlwaysRetryPolicy extends ResolvedRetryBackoff {
  readonly mode: "always";
}

/** Immutable provider policy, captured when its adapter route is registered. */
export type ResolvedRetryPolicy = ResolvedNormalRetryPolicy | ResolvedAlwaysRetryPolicy;

const NORMAL_POLICY_KEYS: ReadonlySet<string> = new Set([
  "mode",
  "maxRetries",
  "retryableCodes",
  "backoff"
]);

// Layered configuration can retain normal-only fields after a mode switch;
// always mode ignores those inactive values while still rejecting typos.
const ALWAYS_POLICY_KEYS: ReadonlySet<string> = NORMAL_POLICY_KEYS;

const BACKOFF_KEYS: ReadonlySet<string> = new Set([
  "initialDelayMs",
  "maxDelayMs",
  "jitterRatio"
]);

/** Thrown when a provider's retry configuration cannot be resolved. */
export class RetryPolicyConfigError extends Error {
  readonly code = "AMC_LLM_RETRY_POLICY_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "RetryPolicyConfigError";
  }
}

function assertKnownKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new RetryPolicyConfigError(`${path}: unknown key "${key}"`);
    }
  }
}

function resolveBackoff(config: BackoffConfig | undefined, path: string): ResolvedRetryBackoff {
  if (config !== undefined) assertKnownKeys(config, BACKOFF_KEYS, path);
  const initialDelayMs = config?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = config?.jitterRatio ?? DEFAULT_JITTER_RATIO;

  if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > MAX_RETRY_DELAY_MS) {
    throw new RetryPolicyConfigError(
      `${path}.initialDelayMs must be a positive finite number no greater than ${MAX_RETRY_DELAY_MS}`
    );
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > MAX_RETRY_DELAY_MS) {
    throw new RetryPolicyConfigError(
      `${path}.maxDelayMs must be a positive finite number no greater than ${MAX_RETRY_DELAY_MS}`
    );
  }
  if (initialDelayMs > maxDelayMs) {
    throw new RetryPolicyConfigError(`${path}.initialDelayMs must be less than or equal to maxDelayMs`);
  }
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new RetryPolicyConfigError(`${path}.jitterRatio must be between 0 and 1`);
  }

  return Object.freeze({ initialDelayMs, maxDelayMs, jitterRatio });
}

/**
 * Validate, default and detach one provider-owned retry policy.
 *
 * The result is frozen because it is captured at route registration and read
 * later, possibly after the route it came from has been replaced. An in-flight
 * failure must be judged by the policy that was in force when its request was
 * dispatched, not by whatever the registry says afterwards.
 *
 * @param config provider configuration; omission selects the normal defaults.
 * @param path diagnostic path naming the provider config that owns the value.
 */
export function resolveRetryPolicy(
  config: RetryPolicyConfig | undefined,
  path: string
): ResolvedRetryPolicy {
  if (config === undefined) {
    return Object.freeze({
      mode: "normal" as const,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryableCodes: DEFAULT_RETRYABLE_CODES,
      ...resolveBackoff(undefined, `${path}.backoff`)
    });
  }

  switch (config.mode) {
    case "normal": {
      assertKnownKeys(config, NORMAL_POLICY_KEYS, path);
      const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
      const retryableCodes = config.retryableCodes ?? DEFAULT_RETRYABLE_CODES;
      if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
        throw new RetryPolicyConfigError(`${path}.maxRetries must be a non-negative safe integer`);
      }
      if (retryableCodes.length === 0) {
        throw new RetryPolicyConfigError(`${path}.retryableCodes must not be empty`);
      }
      if (retryableCodes.some((code) => typeof code !== "string" || code.length === 0)) {
        throw new RetryPolicyConfigError(`${path}.retryableCodes must contain only non-empty strings`);
      }
      if (new Set(retryableCodes).size !== retryableCodes.length) {
        throw new RetryPolicyConfigError(`${path}.retryableCodes must not contain duplicates`);
      }
      return Object.freeze({
        mode: "normal" as const,
        maxRetries,
        retryableCodes: Object.freeze([...retryableCodes]),
        ...resolveBackoff(config.backoff, `${path}.backoff`)
      });
    }
    case "always":
      assertKnownKeys(config, ALWAYS_POLICY_KEYS, path);
      return Object.freeze({
        mode: "always" as const,
        ...resolveBackoff(config.backoff, `${path}.backoff`)
      });
    default:
      throw new RetryPolicyConfigError(`${path}.mode must be "normal" or "always"`);
  }
}

/**
 * The single retryability question, answered in the single place it belongs.
 *
 * Note the argument order: the POLICY decides, the failure is only evidence.
 * Anything that wants to know "is this retryable" must hold a policy to ask,
 * which is what stops the answer being cached onto the failure and signed.
 */
export function isRetryableFailure(policy: ResolvedRetryPolicy, failure: LlmFailure): boolean {
  if (policy.mode === "always") return true;
  return policy.retryableCodes.includes(failure.code);
}
