/**
 * Which adapter serves which provider — and the pin that stops the answer from
 * changing mid-call.
 *
 * THE HAZARD THIS EXISTS FOR IS NOT HYPOTHETICAL. P1.4 gave AMC hot module
 * replacement over the composed tree: a fiber can be unloaded and a replacement
 * registered while the process keeps running. A model call is not atomic — it
 * resolves a route, writes a signed `request/header`, dispatches, streams for
 * seconds, and then writes a settlement row. If each of those phases asked the
 * registry again, a reload landing between two of them would produce a call
 * whose header says one adapter and whose bytes went to another, settled by a
 * row naming a third. Every one of those rows would be signed, and all three
 * would be true statements about different calls.
 *
 * So resolution happens EXACTLY ONCE, at {@link AdapterRegistry.pin}, and yields
 * a frozen {@link PinnedRoute} holding the adapter OBJECT — not its id, not a
 * lookup key. Everything downstream reads the pin. Replacing or removing a route
 * afterwards cannot reach an in-flight call, because the call is no longer
 * holding anything the registry owns.
 *
 * `generation` is recorded on the pin for the same reason a receipt records a
 * key fingerprint: it lets a later reader see that the registry moved under a
 * call without that movement having changed the call.
 */
import type { CredentialRef } from "../../credentials/credentialRef.js";
import type { ResolvedRetryPolicy, RetryPolicyConfig } from "../retryPolicy.js";
import { resolveRetryPolicy } from "../retryPolicy.js";
import type { LlmAdapter } from "./adapterTypes.js";

/** Thrown when a route cannot be registered, or cannot be resolved. */
export class LlmRouteError extends Error {
  readonly code: "AMC_LLM_ROUTE_UNKNOWN" | "AMC_LLM_ROUTE_DUPLICATE" | "AMC_LLM_ROUTE_INVALID";

  constructor(code: LlmRouteError["code"], message: string) {
    super(message);
    this.name = "LlmRouteError";
    this.code = code;
  }
}

/** One provider, as an operator configures it. */
export interface LlmRouteConfig {
  /** Stable provider id. Recorded verbatim in every `request/header` row. */
  readonly providerId: string;
  readonly adapter: LlmAdapter;
  /** Origin the adapter builds its URL from. A trailing slash is trimmed. */
  readonly baseUrl: string;
  /**
   * The credential this route authenticates with, by REFERENCE.
   *
   * Null means the route needs none — a local model server, or AMC's own
   * gateway when it is reached over a trusted socket. There is deliberately no
   * way to configure a VALUE: the type is `CredentialRef`, and P3.0's brand
   * makes a plain string unassignable to it.
   */
  readonly credentialRef: CredentialRef | null;
  /**
   * Models this route serves, or null for any.
   *
   * An allowlist rather than a free-for-all because a typo in a model name is
   * otherwise a 404 from a provider, several seconds and one signed header row
   * later. Naming the models a route serves turns that into a refusal before
   * anything is committed.
   */
  readonly models: readonly string[] | null;
  readonly retry?: RetryPolicyConfig;
  /** Static headers every request on this route carries. */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * One resolved route, captured for the life of one call.
 *
 * Frozen, and holding the adapter instance itself. Nothing here is re-read.
 */
export interface PinnedRoute {
  /** Unique per `register` call — distinguishes a replacement from the original. */
  readonly registrationId: string;
  readonly providerId: string;
  readonly model: string;
  readonly adapter: LlmAdapter;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly encoderId: string;
  readonly encoderVersion: number;
  readonly baseUrl: string;
  readonly credentialRef: CredentialRef | null;
  /** Frozen when the route registered, so a policy edit cannot reach this call. */
  readonly retryPolicy: ResolvedRetryPolicy;
  readonly headers: Readonly<Record<string, string>>;
  /** Registry generation at pin time. */
  readonly generation: number;
}

interface Registration {
  readonly registrationId: string;
  readonly config: LlmRouteConfig;
  readonly baseUrl: string;
  readonly retryPolicy: ResolvedRetryPolicy;
  readonly headers: Readonly<Record<string, string>>;
}

function normalizeBaseUrl(baseUrl: string, providerId: string): string {
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new LlmRouteError("AMC_LLM_ROUTE_INVALID", `route ${providerId} has no baseUrl`);
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new LlmRouteError("AMC_LLM_ROUTE_INVALID", `route ${providerId} has a malformed baseUrl`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LlmRouteError(
      "AMC_LLM_ROUTE_INVALID",
      `route ${providerId} baseUrl must be http or https, got ${parsed.protocol}`
    );
  }
  return baseUrl.replace(/\/+$/, "");
}

/** Lowercased header names, so a route cannot shadow an adapter header by case. */
function normalizeHeaders(headers: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    out[key.toLowerCase()] = value;
  }
  return Object.freeze(out);
}

/** The routes a composition offers, and the only place a route is resolved. */
export class AdapterRegistry {
  private readonly routes = new Map<string, Registration>();

  private generationCounter = 0;

  private registrationCounter = 0;

  /** Bumped by every mutation. Recorded on each pin; never read to decide anything. */
  get generation(): number {
    return this.generationCounter;
  }

  /** Provider ids currently registered, in registration order. */
  list(): readonly string[] {
    return [...this.routes.keys()];
  }

  /**
   * Add a route.
   *
   * Refuses to shadow an existing provider id. A silent overwrite is how two
   * compositions that both configure `anthropic` end up with whichever loaded
   * last, with nothing recorded about the other — {@link AdapterRegistry.replace}
   * is how a deliberate swap is spelled.
   */
  register(config: LlmRouteConfig): PinnedRoute["registrationId"] {
    if (this.routes.has(config.providerId)) {
      throw new LlmRouteError(
        "AMC_LLM_ROUTE_DUPLICATE",
        `provider ${config.providerId} is already registered; use replace() to swap it deliberately`
      );
    }
    return this.install(config);
  }

  /**
   * Swap a route, or add it when absent.
   *
   * This is the HMR path. It bumps the generation, and it cannot reach a call
   * that has already pinned — which is the whole point of the pin.
   */
  replace(config: LlmRouteConfig): PinnedRoute["registrationId"] {
    return this.install(config);
  }

  /** Drop a route. Returns whether one was there. In-flight pinned calls survive. */
  remove(providerId: string): boolean {
    const existed = this.routes.delete(providerId);
    if (existed) this.generationCounter += 1;
    return existed;
  }

  /**
   * Resolve one route for one call, once.
   *
   * Every check that can be made before anything is committed is made here: the
   * provider exists, it serves this model, and its adapter transmits the bytes
   * this encoder produces. A route that fails any of them fails BEFORE a signed
   * `request/header` row exists, so a refusal costs nothing durable.
   */
  pin(input: { readonly providerId: string; readonly model: string }): PinnedRoute {
    const registration = this.routes.get(input.providerId);
    if (registration === undefined) {
      throw new LlmRouteError(
        "AMC_LLM_ROUTE_UNKNOWN",
        `no route is registered for provider ${input.providerId} (have: ${this.list().join(", ") || "none"})`
      );
    }
    const models = registration.config.models;
    if (models !== null && !models.includes(input.model)) {
      throw new LlmRouteError(
        "AMC_LLM_ROUTE_UNKNOWN",
        `route ${input.providerId} does not serve model ${input.model} (serves: ${models.join(", ") || "none"})`
      );
    }
    const adapter = registration.config.adapter;
    return Object.freeze({
      registrationId: registration.registrationId,
      providerId: registration.config.providerId,
      model: input.model,
      adapter,
      adapterId: adapter.id,
      adapterVersion: adapter.version,
      encoderId: adapter.encoderId,
      encoderVersion: adapter.encoderVersion,
      baseUrl: registration.baseUrl,
      credentialRef: registration.config.credentialRef,
      retryPolicy: registration.retryPolicy,
      headers: registration.headers,
      generation: this.generationCounter
    });
  }

  private install(config: LlmRouteConfig): string {
    if (typeof config.providerId !== "string" || config.providerId.length === 0) {
      throw new LlmRouteError("AMC_LLM_ROUTE_INVALID", "a route must have a non-empty providerId");
    }
    if (config.models !== null && config.models.length === 0) {
      throw new LlmRouteError(
        "AMC_LLM_ROUTE_INVALID",
        `route ${config.providerId} declares an empty model list; use null to serve any model`
      );
    }
    this.registrationCounter += 1;
    this.generationCounter += 1;
    const registrationId = `${config.providerId}#${this.registrationCounter}`;
    this.routes.set(config.providerId, {
      registrationId,
      config,
      baseUrl: normalizeBaseUrl(config.baseUrl, config.providerId),
      // Resolved and frozen HERE, not at dispatch: an in-flight failure must be
      // judged by the policy in force when its request was sent, not by whatever
      // a later edit put in the registry.
      retryPolicy: resolveRetryPolicy(config.retry, `llm.routes.${config.providerId}.retry`),
      headers: normalizeHeaders(config.headers)
    });
    return registrationId;
  }
}
