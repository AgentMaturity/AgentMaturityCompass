import { describe, expect, test } from "vitest";
import { credentialRef } from "../src/credentials/credentialRef.js";
import {
  AdapterRegistry,
  DEFAULT_RETRYABLE_CODES,
  LLM_FAILURE_CODE,
  LlmRouteError,
  RetryPolicyConfigError,
  anthropicAdapter,
  isRetryableFailure,
  openaiAdapter
} from "../src/llm/index.js";
import type { LlmAdapter } from "../src/llm/index.js";

/**
 * P3.1 stage 3 — the registry, and the pin that makes a call survive a reload.
 *
 * These are the cheap checks: no session, no workspace, no transport. They exist
 * because the expensive end-to-end test can only demonstrate that the pin works
 * for the one hot-swap it stages, while the properties below are the ones the
 * pin is actually built from — a resolution happens once, it captures the
 * adapter OBJECT, and the registry can be mutated afterwards without any of that
 * changing.
 */
const REF = credentialRef("AMC_TEST_KEY");

function route(overrides: Partial<Parameters<AdapterRegistry["register"]>[0]> = {}) {
  return {
    providerId: "anthropic",
    adapter: anthropicAdapter,
    baseUrl: "https://api.anthropic.invalid",
    credentialRef: REF,
    models: ["claude-test-1"],
    ...overrides
  };
}

describe("the adapter registry", () => {
  test("pins the adapter object, so a later replacement cannot reach the pin", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const pinned = registry.pin({ providerId: "anthropic", model: "claude-test-1" });

    registry.replace(route({ adapter: openaiAdapter, models: ["claude-test-1"] }));

    // Identity, not equality: the pin holds the instance, so nothing the
    // registry does afterwards can be observed through it.
    expect(pinned.adapter).toBe(anthropicAdapter);
    expect(pinned.adapterId).toBe(anthropicAdapter.id);
    expect(pinned.encoderId).toBe(anthropicAdapter.encoderId);
    expect(registry.pin({ providerId: "anthropic", model: "claude-test-1" }).adapter).toBe(openaiAdapter);
  });

  test("removing a route leaves an already-pinned call intact", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const pinned = registry.pin({ providerId: "anthropic", model: "claude-test-1" });

    expect(registry.remove("anthropic")).toBe(true);
    expect(registry.remove("anthropic")).toBe(false);
    expect(pinned.adapter).toBe(anthropicAdapter);
    expect(() => registry.pin({ providerId: "anthropic", model: "claude-test-1" })).toThrow(LlmRouteError);
  });

  test("a pin is frozen, so nothing downstream can rewrite what a call resolved", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const pinned = registry.pin({ providerId: "anthropic", model: "claude-test-1" });
    expect(Object.isFrozen(pinned)).toBe(true);
  });

  test("the retry policy is resolved at registration and outlives a replacement", () => {
    const registry = new AdapterRegistry();
    registry.register(route({ retry: { mode: "normal", retryableCodes: [LLM_FAILURE_CODE.RATE_LIMIT] } }));
    const pinned = registry.pin({ providerId: "anthropic", model: "claude-test-1" });

    // The operator edits the policy while a call is in flight.
    registry.replace(route({ retry: { mode: "normal", retryableCodes: [LLM_FAILURE_CODE.SERVER] } }));

    // NEGATIVE for the freeze: the in-flight call is still judged by the policy
    // that was in force when it was dispatched.
    expect(isRetryableFailure(pinned.retryPolicy, { message: "", code: LLM_FAILURE_CODE.RATE_LIMIT })).toBe(true);
    expect(isRetryableFailure(pinned.retryPolicy, { message: "", code: LLM_FAILURE_CODE.SERVER })).toBe(false);
    expect(Object.isFrozen(pinned.retryPolicy)).toBe(true);
  });

  test("the default policy is the shipped retryable set", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const pinned = registry.pin({ providerId: "anthropic", model: "claude-test-1" });
    expect(pinned.retryPolicy.mode).toBe("normal");
    for (const code of DEFAULT_RETRYABLE_CODES) {
      expect(isRetryableFailure(pinned.retryPolicy, { message: "", code })).toBe(true);
    }
    expect(isRetryableFailure(pinned.retryPolicy, { message: "", code: LLM_FAILURE_CODE.AUTH })).toBe(false);
  });

  test("NEGATIVE: registering over an existing provider is refused, not silently applied", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    // Two compositions both configuring `anthropic` must not resolve to
    // whichever loaded last with nothing recorded about the other.
    expect(() => registry.register(route({ adapter: openaiAdapter }))).toThrow(/already registered/);
    expect(registry.pin({ providerId: "anthropic", model: "claude-test-1" }).adapter).toBe(anthropicAdapter);
    // The deliberate swap has its own verb.
    expect(() => registry.replace(route({ adapter: openaiAdapter }))).not.toThrow();
  });

  test("NEGATIVE: an unserved model is refused before anything is committed", () => {
    const registry = new AdapterRegistry();
    registry.register(route({ models: ["claude-test-1"] }));
    expect(() => registry.pin({ providerId: "anthropic", model: "claude-typo-9" })).toThrow(
      /does not serve model claude-typo-9/
    );
    // A null model list means "any", which is a different configuration and not
    // the same thing as an empty one.
    registry.replace(route({ models: null }));
    expect(registry.pin({ providerId: "anthropic", model: "anything-at-all" }).model).toBe("anything-at-all");
  });

  test("NEGATIVE: malformed route configuration is refused at registration", () => {
    const registry = new AdapterRegistry();
    expect(() => registry.register(route({ models: [] }))).toThrow(/empty model list/);
    expect(() => registry.register(route({ baseUrl: "not-a-url" }))).toThrow(/malformed baseUrl/);
    expect(() => registry.register(route({ baseUrl: "ftp://provider.invalid" }))).toThrow(/must be http or https/);
    expect(() => registry.register(route({ providerId: "" }))).toThrow(/non-empty providerId/);
    expect(() =>
      registry.register(route({ retry: { mode: "normal", maxRetries: -1 } }))
    ).toThrow(RetryPolicyConfigError);
    expect(registry.list()).toEqual([]);
  });

  test("route headers are lowercased so an adapter header cannot be shadowed by case", () => {
    const registry = new AdapterRegistry();
    registry.register(route({ headers: { "X-Tenant": "acme", "Content-Type": "text/plain" } }));
    const pinned = registry.pin({ providerId: "anthropic", model: "claude-test-1" });
    expect(pinned.headers).toEqual({ "x-tenant": "acme", "content-type": "text/plain" });

    // And the adapter's own headers still win: the envelope spreads route
    // headers first for exactly this reason.
    const request = pinned.adapter.envelope({
      baseUrl: pinned.baseUrl,
      model: pinned.model,
      body: Buffer.from("{}"),
      credential: "value",
      extraHeaders: pinned.headers
    });
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers["x-tenant"]).toBe("acme");
  });

  test("a trailing slash on baseUrl does not become a double slash in the URL", () => {
    const registry = new AdapterRegistry();
    registry.register(route({ baseUrl: "https://api.anthropic.invalid///" }));
    const pinned = registry.pin({ providerId: "anthropic", model: "claude-test-1" });
    const request = pinned.adapter.envelope({
      baseUrl: pinned.baseUrl,
      model: pinned.model,
      body: Buffer.from("{}"),
      credential: null,
      extraHeaders: {}
    });
    expect(request.url).toBe("https://api.anthropic.invalid/v1/messages");
  });

  test("generation moves with every mutation and is recorded on the pin", () => {
    const registry = new AdapterRegistry();
    expect(registry.generation).toBe(0);
    registry.register(route());
    const first = registry.pin({ providerId: "anthropic", model: "claude-test-1" });
    registry.replace(route());
    const second = registry.pin({ providerId: "anthropic", model: "claude-test-1" });
    // Recorded, never consulted: it exists so a later reader can see the
    // registry moved under a call without that movement having changed it.
    expect(second.generation).toBeGreaterThan(first.generation);
    expect(second.registrationId).not.toBe(first.registrationId);
  });

  test("an adapter declares the encoder it transmits, so a mismatched pairing is visible", () => {
    // Not a runtime check but a structural one: the runtime takes the encoder
    // FROM the pinned adapter rather than from the caller, so there is no
    // parameter through which a mismatched pairing can be expressed.
    const adapters: readonly LlmAdapter[] = [anthropicAdapter, openaiAdapter];
    for (const adapter of adapters) {
      expect(adapter.encoderId.length).toBeGreaterThan(0);
      expect(adapter.encoderVersion).toBeGreaterThan(0);
    }
    expect(anthropicAdapter.encoderId).not.toBe(openaiAdapter.encoderId);
  });
});
