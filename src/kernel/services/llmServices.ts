/**
 * The LLM seam as a composed service (P3.1).
 *
 * `ctx.amcLlm` is what the agent loop (P3.2) will inject rather than
 * constructing a runtime, for the same reason the evidence spine became
 * injectable in P2.1 and credentials did in P3.0: a consumer that declares
 * `inject: ["amcLlm"]` stays PENDING when no provider is composed, instead of
 * quietly reaching for a module-level default and behaving as though a model
 * route had been configured.
 *
 * WHAT THIS SERVICE OWNS AND WHAT IT BORROWS. It owns the adapter registry —
 * the routes are a property of the composition, and a registry shared across
 * fibers would let one composition's `replace()` reach another's calls. It
 * borrows the session and the credentials store, because both are already
 * seams with their own lifetimes and duplicating either here would create a
 * second source of truth for something that must have exactly one.
 *
 * WHY THE SERVICE HOLDS NO CONNECTION. Unlike the credentials service there is
 * nothing here to dispose: the transport is a function, the registry is a map,
 * and every in-flight call holds its own pinned route rather than a handle into
 * this object. That is deliberate — it is what makes an `amcLlm` fiber
 * replaceable under HMR without cancelling a model call that is mid-stream.
 *
 * This module lives under src/kernel/ because it imports workspace packages the
 * published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "../amcRuntime.js";
import type { Context } from "../amcRuntime.js";
import type { CredentialsService } from "../../credentials/credentialsService.js";
import type { SessionService } from "../../session/sessionService.js";
import { AdapterRegistry } from "../../llm/adapter/adapterRegistry.js";
import type { LlmRouteConfig, PinnedRoute } from "../../llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../../llm/adapter/llmRuntime.js";
import type { LlmCallSpec, PreparedCall } from "../../llm/adapter/llmRuntime.js";
import type { RequestEncoderRegistry } from "../../llm/request/requestEncoder.js";
import type { StreamChunk } from "../../llm/streamChunk.js";
import type { HttpTransport } from "../../llm/adapter/transport.js";
import type { LiveTextPreviewEvent } from "../../llm/adapter/liveTextPreview.js";

export const LLM_SEAM = defineSeam("amcLlm");

export interface LlmServiceConfig {
  /** The session this runtime records into. Single writer, supplied by the host. */
  readonly session: SessionService;
  /** Resolved per request; never captured. See P3.0. */
  readonly credentials: CredentialsService;
  /** Routes to register at composition time. More can be added later. */
  readonly routes?: readonly LlmRouteConfig[];
  /** Defaults to the platform `fetch`. A stub upstream replaces it in tests. */
  readonly transport?: HttpTransport;
  readonly encoders?: RequestEncoderRegistry;
  readonly now?: () => number;
  readonly onLiveText?: (event: LiveTextPreviewEvent) => void;
}

/**
 * The model seam, on the tree.
 *
 * Delegation, not reimplementation: every rule that matters — route pinning,
 * per-request credential resolution, the stream grammar, the durable settlement
 * — has exactly one implementation in src/llm/, and this class must not acquire
 * a second one. In particular there is no caching of pinned routes here: a pin
 * is per call by design, and a cache in the facade would silently turn it into a
 * pin per process.
 */
export class LlmSeamService extends AmcSeam {
  private readonly registry: AdapterRegistry;

  private readonly runtime: LlmRuntime;

  /** Kept so a child runtime can be built over the same routes and credentials. */
  private readonly config: LlmServiceConfig;

  constructor(ctx: Context, config: LlmServiceConfig) {
    super(ctx, LLM_SEAM.name);
    this.config = config;
    this.registry = new AdapterRegistry();
    for (const route of config.routes ?? []) {
      this.registry.register(route);
    }
    this.runtime = new LlmRuntime({
      session: config.session,
      credentials: config.credentials,
      registry: this.registry,
      ...(config.onLiveText === undefined ? {} : { onLiveText: config.onLiveText }),
      ...(config.transport !== undefined ? { transport: config.transport } : {}),
      ...(config.encoders !== undefined ? { encoders: config.encoders } : {}),
      ...(config.now !== undefined ? { now: config.now } : {})
    });
  }

  /**
   * A runtime over the SAME routes and credentials, bound to another session.
   *
   * `LlmRuntime` captures its session at construction and calls
   * `prepareRequest(this.init.session, …)`, so a delegated child sharing this
   * seam's runtime would write its `request/header` and `request/response` rows
   * into the PARENT's session — two runs interleaved in one hash chain, and the
   * child's provider traffic attributed to its parent.
   *
   * The registry is shared deliberately: a child must not be able to reach a
   * provider its parent could not. Only the session differs.
   */
  runtimeForSession(session: LlmServiceConfig["session"]): LlmRuntime {
    return new LlmRuntime({
      session,
      credentials: this.config.credentials,
      registry: this.registry,
      ...(this.config.onLiveText === undefined ? {} : { onLiveText: this.config.onLiveText }),
      ...(this.config.transport !== undefined ? { transport: this.config.transport } : {}),
      ...(this.config.encoders !== undefined ? { encoders: this.config.encoders } : {}),
      ...(this.config.now !== undefined ? { now: this.config.now } : {})
    });
  }

  /** Prepare and dispatch in one call — the direct `ctx.llm.stream()` path. */
  stream(spec: LlmCallSpec): AsyncIterable<StreamChunk> {
    return this.runtime.stream(spec);
  }

  /** Pin the route and log the request without sending it. See {@link LlmRuntime.prepare}. */
  prepare(spec: LlmCallSpec): PreparedCall {
    return this.runtime.prepare(spec);
  }

  /** Providers this composition can reach. */
  providers(): readonly string[] {
    return this.runtime.providers();
  }

  /**
   * Add a route after composition.
   *
   * Exposed because a workspace can gain a provider without a restart — an
   * operator adds a credential, a tenant is onboarded — and the alternative to
   * this method is a composition reload, which would take every other route
   * down with it.
   */
  addRoute(route: LlmRouteConfig): void {
    this.registry.register(route);
  }

  /**
   * Swap a route deliberately.
   *
   * This is the hot-reload path, and the reason {@link PinnedRoute} exists: a
   * call that already pinned keeps the adapter it pinned, so a replacement
   * cannot land between a request header and its settlement.
   */
  replaceRoute(route: LlmRouteConfig): void {
    this.registry.replace(route);
  }

  /** Remove a route. In-flight pinned calls are unaffected. */
  removeRoute(providerId: string): boolean {
    return this.registry.remove(providerId);
  }

  /** Resolve a route without dispatching — for diagnostics and doctor output. */
  pin(input: { readonly providerId: string; readonly model: string }): PinnedRoute {
    return this.registry.pin(input);
  }
}

/**
 * Registers the model seam.
 *
 * A single-service plugin rather than a group: unlike the evidence spine, whose
 * four halves are useless apart, this seam is complete on its own.
 */
export const llmServices = {
  name: "amc-llm-services",
  apply(ctx: Context, config: LlmServiceConfig): void {
    ctx.plugin(LlmSeamService, config);
  }
};
