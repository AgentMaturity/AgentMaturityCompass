/**
 * SH-PROVIDERS-01: named OpenAI-compatible native routes and Azure OpenAI.
 *
 * Mutation checks, each named in its test: drop the loopback credential rule → (2) fails; set `image-input` supported on
 * OPENAI_COMPATIBLE_CAPABILITIES → (5) fails; remove RETENTION_ADAPTERS from cacheRetentionEncoders → (6) fails; make
 * paramsFor fall into the Anthropic default for compat ids → (7) fails at encode.
 */
import { describe, expect, test } from "vitest";
import { discoverNativeProviders, nativeRouteFor, paramsFor } from "../src/cli-agent-options.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { assertRequestCapabilities, LlmCapabilityError, OPENAI_COMPATIBLE_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import { OPENAI_COMPATIBLE_ROUTES, openaiCompatibleAdapter, azureOpenaiAdapter } from "../src/llm/providers/openaiCompatibleRoutes.js";
import { parseRequestHeaderMeta } from "../src/session/requestHeaderMeta.js";
import { chatSse, drain, runtimeHarness } from "./helpers/fixtureProviderHarness.js";

const CLOUD = ["groq", "mistral", "xai", "openrouter", "together", "fireworks"] as const;
const LOCAL = ["lmstudio", "vllm", "llamacpp"] as const;

describe("SH-PROVIDERS-01 native OpenAI-compatible routes", () => {
  test("(1) every named route parses with its own id, default origin and credential reference; azure needs --base-url", () => {
    for (const id of CLOUD) {
      const route = nativeRouteFor(id, {}, "m");
      expect(route.providerId).toBe(id);
      expect(route.adapter.id).toBe("openai-compatible-chat");
      expect(String(route.credentialRef)).toBe(OPENAI_COMPATIBLE_ROUTES.find((r) => r.providerId === id)!.defaultCredentialRef);
      expect(route.baseUrl.endsWith("/v1")).toBe(false);
    }
    for (const id of LOCAL) {
      const route = nativeRouteFor(id, {}, "m");
      expect(route.credentialRef).toBeNull();
      expect(route.baseUrl.startsWith("http://127.0.0.1:")).toBe(true);
    }
    expect(() => nativeRouteFor("azure-openai", {}, "m")).toThrow(/--base-url is required/);
    // Skeptic fix: no default origin means no default credential reference; the inventory says so instead of carrying one that can never apply.
    expect(OPENAI_COMPATIBLE_ROUTES.find((r) => r.providerId === "azure-openai")!.defaultCredentialRef).toBeNull();
    expect(() => nativeRouteFor("azure-openai", { baseUrl: "https://res.openai.azure.com/openai" }, "m")).toThrow(/--credential is required for provider azure-openai/);
    const azure = nativeRouteFor("azure-openai", { baseUrl: "https://res.openai.azure.com/openai", credential: "AZ" }, "m");
    expect(azure.adapter.id).toBe("azure-openai-chat");
    expect(() => nativeRouteFor("perplexity", {}, "m")).toThrow(/unknown provider/);
    expect(() => nativeRouteFor("local", {}, "m")).toThrow(/unknown provider/);
  });

  test("(2) a non-loopback origin without a credential is refused, and `localhost` is not loopback (mutation: drop credentialOptionalOrigin → fails)", () => {
    expect(() => nativeRouteFor("lmstudio", { baseUrl: "https://lmstudio.example" }, "m")).toThrow(/--credential is required/);
    expect(() => nativeRouteFor("lmstudio", { baseUrl: "http://localhost:1234" }, "m")).toThrow(/--credential is required/);
    expect(() => nativeRouteFor("groq", { baseUrl: "http://127.0.0.1:9", }, "m")).not.toThrow();
    // The default credential never leaves the provider's own origin.
    expect(() => nativeRouteFor("groq", { baseUrl: "https://proxy.example" }, "m")).toThrow(/--credential is required/);
  });

  test("(3) a loopback route sends no authorization header, posts to /v1/chat/completions and signs its own identity", async () => {
    const h = await runtimeHarness({ responses: [chatSse({ text: "hi" })], model: "local-model", params: { max_tokens: 64 },
      route: (origin) => nativeRouteFor("lmstudio", { baseUrl: origin }, "local-model") });
    const call = h.runtime.prepare(h.spec());
    await drain(call.stream());
    h.finishStep(call);
    const header = h.session.readEvents().find((event) => event.event_type === "request/header")!;
    h.close();
    expect(h.received[0]!.url).toBe("/v1/chat/completions");
    expect(h.received[0]!.headers.authorization).toBeUndefined();
    const meta = parseRequestHeaderMeta(header.meta_json)!;
    expect(meta.providerId).toBe("lmstudio");
    expect(meta.physicalRoute?.adapterId).toBe("openai-compatible-chat");
    expect(meta.encoderId).toBe("openai-chat");
    expect(call.settled?.assembly.usage).toMatchObject({ inputTokens: 10, outputTokens: 3 });
  });

  test("(4) the Azure adapter authenticates with api-key, never a bearer header", async () => {
    const h = await runtimeHarness({ responses: [chatSse({ text: "hi" })], model: "gpt-x", params: { max_tokens: 64 },
      route: (origin) => nativeRouteFor("azure-openai", { baseUrl: `${origin}/openai`, credential: "AMC_PI_FIXTURE_KEY" }, "gpt-x") });
    const call = h.runtime.prepare(h.spec());
    await drain(call.stream());
    h.finishStep(call);
    const header = h.session.readEvents().find((e) => e.event_type === "request/header")!;
    h.close();
    expect(h.received[0]!.url).toBe("/openai/v1/chat/completions");
    expect(h.received[0]!.headers["api-key"]).toBe("fixture-value-not-a-provider-key");
    expect(h.received[0]!.headers.authorization).toBeUndefined();
    expect(parseRequestHeaderMeta(header.meta_json)?.physicalRoute?.adapterId).toBe("azure-openai-chat");
  });

  test("(5) an image part is refused before a header exists because image-input is unknown on a generic endpoint (mutation: mark it supported → fails)", () => {
    expect(OPENAI_COMPATIBLE_CAPABILITIES.features["image-input"]).toBe("unknown");
    expect(() => assertRequestCapabilities(OPENAI_COMPATIBLE_CAPABILITIES, { model: "m", system: null, tools: null, params: {},
      messages: [{ role: "user", parts: [{ kind: "image", sha256: "a".repeat(64), mediaType: "image/png" }] }] }))
      .toThrow(LlmCapabilityError);
    for (const adapter of [openaiCompatibleAdapter, azureOpenaiAdapter]) expect(adapter.capabilities).toBe(OPENAI_COMPATIBLE_CAPABILITIES);
  });

  test("(6) cache retention is refused on compat and Azure routes even though they share the openai-chat encoder (mutation: key admission on the encoder only → fails)", () => {
    expect(() => nativeRouteFor("groq", { cacheRetention: "long" }, "m")).toThrow(/--cache-retention is not admitted/);
    for (const id of ["groq", "lmstudio"]) {
      const registry = new AdapterRegistry();
      expect(() => registry.register({ ...nativeRouteFor(id, {}, "m"), cacheRetention: "long" })).toThrow(/cacheRetention is unsupported by adapter/);
    }
    const azure = new AdapterRegistry();
    expect(() => azure.register({ ...nativeRouteFor("azure-openai", { baseUrl: "https://r.openai.azure.com/openai", credential: "AZ" }, "m"), cacheRetention: "short" }))
      .toThrow(/cacheRetention is unsupported by adapter azure-openai-chat/);
    // The real OpenAI route keeps its retention version.
    const openai = new AdapterRegistry();
    openai.register({ ...nativeRouteFor("openai", { credential: "K" }, "m"), cacheRetention: "long" });
    expect(openai.pin({ providerId: "openai", model: "m" }).encoderVersion).toBe(7);
  });

  test("(7) paramsFor emits the Chat shape for every compat id, and the real encoder accepts it (mutation: fall into the stream:true default → encode fails)", async () => {
    for (const id of [...CLOUD, ...LOCAL, "azure-openai"]) expect(paramsFor(id, 64)).toEqual({ max_tokens: 64 });
    const h = await runtimeHarness({ responses: [chatSse({ text: "hi" })], model: "m", params: paramsFor("vllm", 64),
      route: (origin) => nativeRouteFor("vllm", { baseUrl: origin }, "m") });
    const call = h.runtime.prepare(h.spec());
    await drain(call.stream());
    h.finishStep(call); h.close();
    const body = JSON.parse(h.received[0]!.body.toString("utf8")) as Record<string, unknown>;
    expect(body).toMatchObject({ max_tokens: 64, stream: true, stream_options: { include_usage: true } });
    expect(() => paramsFor("vllm", 64, { thinking: "enabled" })).toThrow(/not admitted for provider "vllm"/);
  });

  test("(8) discovery lists the new ids with their adapter contracts and no catalog claims", () => {
    const discovery = discoverNativeProviders();
    for (const id of [...CLOUD, ...LOCAL, "azure-openai"]) {
      const entry = discovery.providers.find((p) => p.providerId === id)!;
      expect(entry.capabilities?.features["cache-read-usage"]).toBe("unknown");
      expect(entry.reviewedCatalog).toEqual([]);
      expect(entry.models).toBeNull();
    }
    expect(discoverNativeProviders("groq").providers.map((p) => p.adapterId)).toEqual(["openai-compatible-chat"]);
  });
});
