/** Authored, UNEXECUTED: P01 selector/discovery integration, not live-provider qualification. */
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { registerAcpCommands } from "../src/acp/acpCli.js";
import { acpRouteFor, startAcpStdio, type AcpStdioInit } from "../src/acp/acpStdioMain.js";
import {
  discoverNativeProviders, nativeRouteFor, paramsFor, registerNativeProviderCommands,
  renderNativeProviderDiscovery, routeFor
} from "../src/cli-agent-options.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { ollamaAdapter } from "../src/llm/providers/ollamaAdapter.js";
import { ollamaChatEncoder } from "../src/llm/request/ollamaChatEncoder.js";
import { STUB_PROVIDER_MODEL } from "../src/agent/stubProvider.js";

const MODEL = "batch1-scripted-model:tag";
const PROVIDERS = ["stub", "anthropic", "openai", "openai-responses", "deepseek", "gemini", "gemini-audio", "ollama"];
const io = () => ({ log: vi.fn<(line: string) => void>(), error: vi.fn<(line: string) => void>(), fail: vi.fn<() => void>() });
const acpOptions = (extra: Partial<AcpStdioInit> = {}): AcpStdioInit => ({
  workspace: "/batch1-no-workspace-created", agentId: "default", providerId: "ollama", model: MODEL,
  systemPrompt: "Selector regression only.", ...extra
});
function commands(positionalOptions = false) {
  const output = io(), program = new Command("amc").enablePositionalOptions(positionalOptions).exitOverride();
  registerAgentCommands(program, output);
  registerAcpCommands(program);
  registerNativeProviderCommands(program, output);
  return { program, output };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("P01 native CLI/ACP selectors", () => {
  it.each(PROVIDERS)("uses the same actual %s route in both selectors and discovery", providerId => {
    const output = io(), model = providerId === "stub" ? undefined : MODEL;
    const cli = routeFor(output, providerId, {}, model);
    const acp = acpRouteFor(acpOptions({ providerId, model }));
    expect(cli).not.toBeNull();
    expect(acp).toEqual(cli);
    if (cli === null || "error" in acp) throw new Error("Expected a native route");
    const registry = new AdapterRegistry(); registry.register(cli);
    const described = discoverNativeProviders(providerId).providers[0]!;
    const registered = registry.describe()[0]!;
    expect(described).toMatchObject({ providerId, adapterId: registered.adapterId,
      adapterVersion: registered.adapterVersion, capabilities: registered.capabilities,
      encoderId: cli.adapter.encoderId, encoderVersion: cli.adapter.encoderVersion });
    expect(described.models).toEqual(providerId === "stub" ? [STUB_PROVIDER_MODEL] : null);
    expect(described.modelSelection).toBe(providerId === "stub" ? "fixed-synthetic" : "explicit-required");
    expect(registry.pin({ providerId, model: cli.models![0]! }).adapter).toBe(cli.adapter);
    expect(output.fail).not.toHaveBeenCalled();
  });

  it("selects native Ollama without reading or defaulting to environment credentials", () => {
    const network = vi.fn(() => { throw new Error("Unexpected network access"); });
    vi.stubGlobal("fetch", network);
    vi.stubEnv("OLLAMA_API_KEY", "batch1-not-a-real-secret");
    vi.stubEnv("AMC_LLM_API_KEY", "batch1-not-a-real-secret");
    const route = nativeRouteFor("ollama", {}, MODEL);
    expect(route).toMatchObject({ providerId: "ollama", adapter: ollamaAdapter,
      baseUrl: "http://127.0.0.1:11434", credentialRef: null, models: [MODEL] });
    expect(acpRouteFor(acpOptions())).toEqual(route);
    expect(network).not.toHaveBeenCalled();
  });

  it("retains an explicit authenticated native origin and reference without treating it as local", () => {
    const options = { baseUrl: "https://batch1-operator.invalid/", credential: "BATCH1_OLLAMA_REF" };
    const cli = nativeRouteFor("ollama", options, MODEL);
    expect(cli).toMatchObject({ baseUrl: "https://batch1-operator.invalid", credentialRef: "BATCH1_OLLAMA_REF" });
    expect(acpRouteFor(acpOptions(options))).toEqual(cli);
    expect(cli.adapter).toBe(ollamaAdapter);
  });

  it.each([undefined, "", "  "])("refuses a missing/blank real model (%j) without selecting the stub", model => {
    const output = io();
    expect(routeFor(output, "ollama", {}, model)).toBeNull();
    expect(output.fail).toHaveBeenCalledOnce();
    expect(output.error.mock.calls[0]![0]).toContain("--model is required");
    expect(acpRouteFor(acpOptions({ model }))).toEqual({ error: "--model is required for provider ollama" });
  });

  it.each(["not-native", "__proto__", "constructor", "ollama-compatible"])("refuses unknown provider %s in execution and discovery", providerId => {
    const output = io();
    expect(routeFor(output, providerId, {}, MODEL)).toBeNull();
    expect(output.fail).toHaveBeenCalledOnce();
    expect(acpRouteFor(acpOptions({ providerId }))).toHaveProperty("error");
    expect(() => discoverNativeProviders(providerId)).toThrow(/unknown provider/);
  });

  it.each([
    "http://localhost:11434/v1", "http://localhost:11434/api/chat",
    "http://user:batch1-sensitive@localhost:11434", "http://localhost:11434?token=batch1-sensitive",
    "http://localhost:11434#batch1-sensitive", "file:///tmp/ollama"
  ])("refuses non-native origin %s through both selectors without echoing embedded secrets", baseUrl => {
    const output = io();
    expect(routeFor(output, "ollama", { baseUrl }, MODEL)).toBeNull();
    const acp = acpRouteFor(acpOptions({ baseUrl }));
    expect(acp).toHaveProperty("error");
    expect(JSON.stringify([output.error.mock.calls, acp])).not.toContain("batch1-sensitive");
  });

  it("refuses a credential value rather than treating it as a reference", () => {
    const credential = "sk-batch1-not-a-real-secret", output = io();
    expect(routeFor(output, "ollama", { credential }, MODEL)).toBeNull();
    const acp = acpRouteFor(acpOptions({ credential }));
    expect(acp).toHaveProperty("error");
    expect(JSON.stringify([output.error.mock.calls, acp])).not.toContain(credential);
  });

  it("maps the CLI token bound into native Ollama request bytes, not an OpenAI envelope", () => {
    const params = paramsFor("ollama", 37);
    expect(params).toEqual({ options: { num_predict: 37 }, stream: true });
    const bytes = ollamaChatEncoder.encode({ model: MODEL, params, system: "Bounded task.", tools: null,
      messages: [{ role: "user", parts: [{ kind: "text", text: "hello" }] }] });
    const route = nativeRouteFor("ollama", {}, MODEL);
    const request = route.adapter.envelope({ model: MODEL, body: bytes, baseUrl: route.baseUrl,
      credential: null, extraHeaders: {} });
    expect(request.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(request.body).toBe(bytes);
    expect(request.headers.authorization).toBeUndefined();
    const body = JSON.parse(bytes.toString("utf8"));
    expect(body).toMatchObject({ model: MODEL, options: { num_predict: 37 }, stream: true });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("stream_options");
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects an invalid native Ollama output bound %s", limit => {
    expect(() => paramsFor("ollama", limit)).toThrow();
  });

  it.each([{ thinking: "enabled" }, { reasoningEffort: "high" }])("does not silently reinterpret DeepSeek-only controls for Ollama: %j", options => {
    expect(() => paramsFor("ollama", 32, options)).toThrow(/require --provider deepseek/);
    // Startup rejects before a credential store, session, transport or stdio listener is created.
    expect(() => startAcpStdio(acpOptions(options))).toThrow(/require --provider deepseek/);
  });

  it("retains the existing provider-specific parameter shapes", () => {
    expect(paramsFor("openai", 32)).toEqual({ max_tokens: 32 });
    expect(paramsFor("openai-responses", 32)).toEqual({ max_output_tokens: 32 });
    expect(paramsFor("anthropic", 32)).toEqual({ max_tokens: 32, stream: true });
    expect(paramsFor("stub", 32)).toEqual({ max_tokens: 32, stream: true });
    for (const provider of ["gemini", "gemini-audio"]) {
      expect(paramsFor(provider, 32)).toMatchObject({ generationConfig: { maxOutputTokens: 32 } });
    }
    expect(paramsFor("deepseek", 32, { thinking: "disabled" })).toMatchObject({ max_tokens: 32, thinking: { type: "disabled" } });
  });
});

describe("P01 explicit operator provider discovery", () => {
  it("reports immutable adapter contracts, not credentials, live models or measured cache rates", () => {
    const discovery = discoverNativeProviders();
    expect(discovery.providers.map(row => row.providerId)).toEqual(PROVIDERS);
    expect(discovery).toMatchObject({ scope: "bundled-native-adapters", measurement: "not-performed",
      modelDiscovery: "not-performed", credentialsChecked: false, selectors: ["agent-loop run", "acp"],
      usageCache: { missingCounts: "unknown-not-zero", tokenShareBasis: "reported-input-token-subtotal",
        requestHitRateBasis: "completed-requests-with-reported-cache-read", invalidEvidence: "rates-unavailable", cost: "not-derived" } });
    const ollama = discovery.providers.find(row => row.providerId === "ollama")!;
    expect(ollama.capabilities).toMatchObject({ protocol: "ollama-chat", modelSupport: "not-probed",
      usage: "reported-required", features: { "cache-read-usage": "supported", "cache-write-usage": "unsupported", "audio-input": "unsupported" } });
    expect(ollama.capabilities).not.toBe(ollamaAdapter.capabilities);
    expect(Object.isFrozen(discovery)).toBe(true);
    expect(Object.isFrozen(discovery.providers)).toBe(true);
    expect(Object.isFrozen(ollama.capabilities?.features)).toBe(true);
    const json = JSON.stringify(discovery), text = renderNativeProviderDiscovery(discovery);
    for (const secretField of ["credentialRef", "baseUrl", "API_KEY", "11434", "cacheReadTokens", "hitRate\""]) {
      expect(json).not.toContain(secretField);
    }
    expect(text).toContain("not request hit rate");
    expect(text).toContain("reported zero is an eligible miss");
    expect(text).toContain("No token counts, cache rates or costs were measured");
    expect(discovery.providers.find(row => row.providerId === "stub")?.capabilities?.usage).toBe("synthetic-demonstration");
  });

  it.each(["agent-loop", "acp"])("%s providers --json lists all adapters, not the ACP default stub", async group => {
    const network = vi.fn(() => { throw new Error("Discovery must not dispatch"); }); vi.stubGlobal("fetch", network);
    const { program, output } = commands();
    await program.parseAsync([group, "providers", "--json"], { from: "user" });
    expect(output.log).toHaveBeenCalledOnce();
    expect(JSON.parse(output.log.mock.calls[0]![0]).providers.map((row: { providerId: string }) => row.providerId)).toEqual(PROVIDERS);
    expect(output.error).not.toHaveBeenCalled();
    expect(output.fail).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it.each(["agent-loop", "acp"])("%s providers filters an exact selected native adapter", async group => {
    const { program, output } = commands();
    await program.parseAsync([group, "providers", "--provider", "ollama", "--json"], { from: "user" });
    const report = JSON.parse(output.log.mock.calls[0]![0]);
    expect(report.providers).toHaveLength(1);
    expect(report.providers[0]).toMatchObject({ providerId: "ollama", adapterId: "ollama-chat", models: null });
    expect(output.fail).not.toHaveBeenCalled();
  });

  it.each([
    { positional: false, args: ["acp", "--provider", "ollama", "providers", "--json"] },
    { positional: false, args: ["acp", "providers", "--provider", "ollama", "--json"] },
    { positional: true, args: ["acp", "--provider", "ollama", "providers", "--json"] },
    { positional: true, args: ["acp", "providers", "--provider", "ollama", "--json"] }
  ])("retains explicit ACP provider selection across Commander flag placement: %j", async ({ positional, args }) => {
    const { program, output } = commands(positional);
    await program.parseAsync(args, { from: "user" });
    const report = JSON.parse(output.log.mock.calls[0]![0]);
    expect(report.providers.map((row: { providerId: string }) => row.providerId)).toEqual(["ollama"]);
    expect(output.fail).not.toHaveBeenCalled();
  });

  it("honors an explicit global JSON flag without inheriting a default provider filter", async () => {
    const { program, output } = commands();
    program.option("--json");
    await program.parseAsync(["--json", "acp", "providers"], { from: "user" });
    expect(JSON.parse(output.log.mock.calls[0]![0]).providers.map((row: { providerId: string }) => row.providerId)).toEqual(PROVIDERS);
    expect(output.fail).not.toHaveBeenCalled();
  });

  it.each(["agent-loop", "acp"])("%s providers refuses an unknown filter without a success document", async group => {
    const { program, output } = commands();
    await program.parseAsync([group, "providers", "--provider", "not-native", "--json"], { from: "user" });
    expect(output.log).not.toHaveBeenCalled();
    expect(output.error.mock.calls[0]![0]).toContain("unknown provider");
    expect(output.fail).toHaveBeenCalledOnce();
  });

  it("requires the actual selector commands rather than constructing a disconnected command group", () => {
    expect(() => registerNativeProviderCommands(new Command(), io())).toThrow(/Register agent-loop and ACP/);
  });
});
