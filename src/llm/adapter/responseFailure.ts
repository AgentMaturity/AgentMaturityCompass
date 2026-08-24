/**
 * How a non-2xx response becomes a typed failure — once, for every provider.
 *
 * The classification lives here rather than in each adapter because the whole
 * value of the taxonomy is that it is provider-neutral: a 429 must mean
 * `RATE_LIMIT` whether it came from Anthropic, from OpenAI, or from AMC's own
 * gateway relaying one of them. An adapter that classified for itself would be
 * an adapter that could get it wrong for itself, and a retry policy keyed on a
 * code only works if the code means the same thing everywhere.
 *
 * An adapter may still REFINE the result — a provider's error body carries a
 * request id, and sometimes says an account is out of credit rather than merely
 * rate-limited — through {@link import("./adapterTypes.js").LlmAdapter.describeFailure}.
 * The refinement is applied on top of the baseline, never instead of it, so an
 * adapter that has no opinion (or a broken one) still produces a correctly
 * classified failure.
 */
import { LlmError, httpFailureCode, parseProviderRetryAfterMs } from "../llmFailure.js";
import type { AdapterFailureHint, LlmAdapter } from "./adapterTypes.js";
import type { HttpResponse } from "./transport.js";

/** How much provider error text is quoted into the thrown message and the row. */
const MAX_QUOTED_DETAIL = 500;

/** Ask the adapter for a refinement, and survive an adapter that throws. */
function hintFrom(
  adapter: LlmAdapter,
  input: { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly bodyText: string }
): AdapterFailureHint {
  if (adapter.describeFailure === undefined) return {};
  try {
    return adapter.describeFailure(input) ?? {};
  } catch {
    // A refinement that throws must not replace a real provider failure with a
    // decode error: the operator's problem is the 429, not the parser.
    return {};
  }
}

/**
 * Turn one failed response into the error the seam throws and records.
 *
 * `detail` — what the classifier reads to tell an exhausted quota from a
 * transient rate limit — is the raw body text. It is passed whole to
 * {@link httpFailureCode} and only then truncated for the message, so a
 * classification never depends on where a quote happened to be cut.
 *
 * @param now injectable clock, because a `Retry-After` HTTP-date is relative.
 */
export function classifyResponseFailure(input: {
  readonly adapter: LlmAdapter;
  readonly response: Pick<HttpResponse, "status" | "headers">;
  readonly bodyText: string;
  readonly now: () => number;
}): LlmError {
  const { adapter, response, bodyText } = input;
  const hint = hintFrom(adapter, { status: response.status, headers: response.headers, bodyText });
  const code = hint.code ?? httpFailureCode(response.status, bodyText);
  const retryAfter =
    hint.providerRetryAfterMs ?? parseProviderRetryAfterMs(response.headers["retry-after"], input.now());
  const quoted = (hint.message ?? bodyText).trim().slice(0, MAX_QUOTED_DETAIL);
  const message =
    quoted.length > 0
      ? `${adapter.id} request failed with HTTP ${response.status}: ${quoted}`
      : `${adapter.id} request failed with HTTP ${response.status}`;
  return new LlmError(message, code, {
    // The status is always carried: it is the one fact every consumer of a
    // provider failure needs and the one a message quote cannot be parsed for.
    status: response.status,
    ...(retryAfter === undefined ? {} : { providerRetryAfterMs: retryAfter }),
    ...(hint.requestId === undefined || hint.requestId.length === 0 ? {} : { requestId: hint.requestId })
  });
}
