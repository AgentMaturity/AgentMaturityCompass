/**
 * AMC's own gateway, as an LLM provider.
 *
 * WHY THIS EXISTS. AMC already runs a recording proxy: foreign agents point
 * their base URL at it, and every request and response becomes evidence. Once
 * AMC can call models natively, there are suddenly two paths to a provider — the
 * native one and the proxied one — and the tempting simplification is to keep
 * only the native one. That would be a regression: the gateway is what applies
 * lease verification, the egress allowlist and redaction to traffic AMC does not
 * originate, and pointing native calls straight at a provider means AMC's own
 * traffic is the one thing its proxy never sees.
 *
 * So the gateway is a ROUTE, not a wire format. This adapter wraps another
 * adapter and changes exactly two things:
 *
 *   1. THE ADDRESS. The inner adapter builds its own path (`/v1/messages`,
 *      `/v1/chat/completions`) beneath the gateway's route prefix, so the
 *      gateway's existing prefix routing forwards it upstream unchanged.
 *   2. WHO AUTHENTICATES. The client presents an AMC LEASE, not a provider key.
 *      The gateway resolves the upstream credential itself, through the same
 *      P3.0 seam, from its own configuration. That is the point: a provider key
 *      that never leaves the gateway is a provider key the agent side cannot
 *      leak.
 *
 * Everything else — the encoder, the decoder, the block model, the failure
 * taxonomy — is the inner adapter's, unchanged. There is no second decoder to
 * drift, which is the whole reason this is a wrapper and not a third provider.
 */
import type { StreamChunk } from "../streamChunk.js";
import type {
  AdapterEnvelopeInput,
  AdapterFailureHint,
  AdapterFailureInput,
  LlmAdapter
} from "../adapter/adapterTypes.js";
import type { HttpRequest, HttpResponse } from "../adapter/transport.js";

/** Header the gateway reads the agent identity from. */
const AGENT_ID_HEADER = "x-amc-agent-id";

/** Header the gateway reads a lease token from. */
const LEASE_HEADER = "x-amc-lease";

/** Header the gateway stamps its own request id on. */
const GATEWAY_REQUEST_ID_HEADER = "x-amc-request-id";

export interface GatewayAdapterOptions {
  /** The wire adapter the gateway is fronting. */
  readonly inner: LlmAdapter;
  /**
   * The gateway route prefix that forwards to this upstream, e.g. `/anthropic`.
   *
   * Kept separate from the route's `baseUrl` so an operator configures the
   * gateway origin once and the prefix per provider — which is how the
   * gateway's own config is shaped.
   */
  readonly prefix: string;
  /** The agent identity the gateway attributes this traffic to. */
  readonly agentId: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Wrap an adapter so its traffic goes through AMC's gateway.
 *
 * A factory rather than a constant because the prefix and agent id are
 * deployment facts, and baking them into a module-level adapter would mean one
 * gateway per process.
 */
export function gatewayAdapter(options: GatewayAdapterOptions): LlmAdapter {
  const prefix = options.prefix.replace(/\/+$/, "");
  const inner = options.inner;
  return {
    // The id names BOTH halves, because a settlement row saying only "gateway"
    // would not say which wire format produced the blocks it settles.
    id: `gateway+${inner.id}`,
    version: inner.version,
    // The body is the inner adapter's, byte for byte: the gateway forwards it
    // untouched, so the encoder that must reconstruct it is the inner one.
    encoderId: inner.encoderId,
    encoderVersion: inner.encoderVersion,

    ...(inner.assertParams === undefined
      ? {}
      : { assertParams: (params: Record<string, unknown>): void => inner.assertParams?.(params) }),

    envelope(input: AdapterEnvelopeInput): HttpRequest {
      return inner.envelope({
        ...input,
        baseUrl: `${input.baseUrl}${prefix}`,
        // The provider credential is deliberately NOT forwarded. The gateway
        // holds it; the agent side presents a lease. Passing null here is what
        // stops the inner adapter from setting a provider auth header at all.
        credential: null,
        extraHeaders: {
          ...input.extraHeaders,
          [AGENT_ID_HEADER]: options.agentId,
          ...(input.credential === null ? {} : { [LEASE_HEADER]: input.credential })
        }
      });
    },

    decode(response: HttpResponse): AsyncIterable<StreamChunk> {
      return inner.decode(response);
    },

    describeFailure(input: AdapterFailureInput): AdapterFailureHint {
      const requestId = input.headers[GATEWAY_REQUEST_ID_HEADER];
      const delegated = inner.describeFailure?.(input) ?? {};
      // The gateway's own refusals — a missing lease, a denied egress host — are
      // a flat `{ "error": "..." }`, which no provider adapter recognises. Read
      // it here so an operator sees the gateway's reason rather than an
      // unexplained status.
      let gatewayMessage: string | undefined;
      try {
        const parsed = record(JSON.parse(input.bodyText));
        const message = parsed?.error;
        if (typeof message === "string" && message.length > 0) {
          gatewayMessage = `amc gateway: ${message}`;
        }
      } catch {
        gatewayMessage = undefined;
      }
      return {
        ...delegated,
        ...(requestId === undefined ? {} : { requestId }),
        // The gateway's own message wins when it produced one: at that point the
        // request never reached the provider, so a provider-shaped reading of
        // the body would be describing something that did not happen.
        // No `code`: like every other adapter here, classification stays with
        // the shared status classifier so one ordering rule governs all routes.
        ...(gatewayMessage === undefined ? {} : { message: gatewayMessage })
      };
    }
  };
}
