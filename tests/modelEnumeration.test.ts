import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { credentialRef } from "../src/credentials/credentialRef.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { listModelMetadata, parseModelMetadataSnapshot } from "../src/llm/modelCatalog.js";
import { enumerateRemoteModels, parseModelDiscoveryResult, pinDiscoveredModel } from "../src/llm/modelEnumeration.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { EgressBlocked } from "../src/residency/checkEgress.js";
import { destinationRegistryPath } from "../src/residency/destinationRegistry.js";
import { activateKillSwitch, KillSwitchDenied } from "../src/runtime/killSwitch.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";

let root: string;
let workspace: string;
const protocol = "openai-chat-completions";
const credentials = { resolve: vi.fn((): string | null => "secret-value") };
const input = () => ({ workspace, providerId: "openai", protocol, credentials });
const reply = (value: unknown = { data: [{ id: "remote-model", context_length: 999999, pricing: { prompt: 0 } }] }, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(value), { status }));
const review = (digest: string) => ({ expectedDiscoveryDigest: digest, model: "remote-model", source: "operator review: provider documentation", asOf: "2026-10-30" });

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-model-enumeration-")));
  workspace = join(root, "workspace");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  credentials.resolve.mockReset().mockReturnValue("secret-value");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("operator-invoked advisory model enumeration", () => {
  it("uses provider defaults and per-operation credentials without changing routes or reviewed catalog", async () => {
    const fetch = reply();
    const registry = new AdapterRegistry();
    registry.register({ providerId: "openai", adapter: openaiAdapter, baseUrl: "https://api.openai.com", credentialRef: credentialRef("OPENAI_API_KEY"), models: ["gpt-4o"] });
    const beforeRoutes = registry.describe();
    const beforeCatalog = listModelMetadata("openai", protocol);
    expect(fetch).not.toHaveBeenCalled();
    const result = await enumerateRemoteModels(input());
    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({ method: "GET", redirect: "error", signal: expect.any(AbortSignal), headers: { accept: "application/json", authorization: "Bearer secret-value" } }));
    expect(credentials.resolve).toHaveBeenCalledWith("OPENAI_API_KEY");
    expect(result).toMatchObject({ schemaVersion: 1, providerId: "openai", protocol, trust: "advisory", coverage: "single-response", modelSupport: "not-probed", source: "https://api.openai.com/v1/models",
      models: [{ model: "remote-model", contextWindowTokens: null, maxOutputTokens: null, modalities: null, reasoning: null, pricing: null }] });
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(parseModelDiscoveryResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.models)).toBe(true);
    expect(Object.isFrozen(result.models[0])).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-value");
    expect(registry.describe()).toEqual(beforeRoutes);
    expect(listModelMetadata("openai", protocol)).toEqual(beforeCatalog);
    expect(() => registry.pin({ providerId: "openai", model: "remote-model" })).toThrow(/does not serve model/);
    credentials.resolve.mockReturnValueOnce("rotated-secret");
    await enumerateRemoteModels(input());
    expect(credentials.resolve).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ headers: { accept: "application/json", authorization: "Bearer rotated-secret" } }));
  });

  it("uses the native DeepSeek models path and explicit endpoint/credential references", async () => {
    const fetch = reply({ data: [{ id: "deepseek-chat" }] });
    const result = await enumerateRemoteModels({ ...input(), providerId: "deepseek", protocol: "deepseek-chat-completions", baseUrl: "https://operator.example/", credentialRef: credentialRef("OPERATOR_KEY") });
    expect(result.providerId).toBe("deepseek");
    expect(fetch).toHaveBeenCalledWith("https://operator.example/models", expect.anything());
    expect(credentials.resolve).toHaveBeenCalledWith("OPERATOR_KEY");
  });

  it.each([["unknown", protocol], ["openai", "anthropic-messages"], ["anthropic", "anthropic-messages"], ["openai-responses", protocol]])(
    "refuses unsupported provider/protocol %s/%s before resolving credentials or sending", async (providerId, selectedProtocol) => {
      const fetch = reply();
      await expect(enumerateRemoteModels({ ...input(), providerId, protocol: selectedProtocol })).rejects.toThrow(/enumeration is unsupported/);
      expect(credentials.resolve).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each(["https://user:secret@example.com", "https://example.com?key=secret", "https://example.com/#fragment", "https://example.com/v1", "file:///tmp/models", "https://example.com/../", "https://example.com\\secret"])(
    "refuses unsafe or ambiguous base URL %s", async baseUrl => {
      const fetch = reply();
      await expect(enumerateRemoteModels({ ...input(), baseUrl })).rejects.toThrow(/credential-free HTTP\(S\) origin/);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each([null, "", " \t"])("refuses missing credential %s before dispatch", async value => {
    const fetch = reply();
    credentials.resolve.mockReturnValue(value);
    await expect(enumerateRemoteModels(input())).rejects.toThrow(/credential is unavailable/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses an omitted credential reference on an authenticated provider", async () => {
    const fetch = reply();
    await expect(enumerateRemoteModels({ ...input(), credentialRef: null })).rejects.toThrow(/credential is unavailable/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks explicit workspace scope and residency before fetch", async () => {
    const fetch = reply();
    await expect(enumerateRemoteModels({ ...input(), workspace: "" })).rejects.toThrow();
    mkdirSync(dirname(destinationRegistryPath(workspace)), { recursive: true });
    writeFileSync(destinationRegistryPath(workspace), "schemaVersion: amc.residency-destinations/v1\n");
    await expect(enumerateRemoteModels(input())).rejects.toBeInstanceOf(EgressBlocked);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the provider-scoped kill switch before fetch", async () => {
    const fetch = reply();
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    await activateKillSwitch({ workspace, issuedBy: "owner-1", scope: { kind: "provider", id: "openai" }, mode: "stop_all", reason: "enumeration fixture", incidentId: "enum-1" });
    await expect(enumerateRemoteModels(input())).rejects.toBeInstanceOf(KillSwitchDenied);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["secret-value", "prefix-secret-value-suffix"])("refuses a credential-echo model ID %s without returning advisory data", async model => {
    reply({ data: [{ id: "remote-model" }, { id: model }] });
    const outcome = await enumerateRemoteModels(input()).then(
      value => ({ value, error: null }), error => ({ value: null, error })
    );
    expect(outcome.error).toBeInstanceOf(Error);
    expect(outcome.value).toBeNull();
    expect((outcome.error as Error).message).toBe("Model enumeration response contains credential material");
    expect((outcome.error as Error).message).not.toContain("secret-value");
  });

  it.each([302, 401, 500])("refuses HTTP %s without exposing provider error contents", async status => {
    reply({ secret: "secret-value" }, status);
    await expect(enumerateRemoteModels(input())).rejects.toThrow(`Model enumeration failed: HTTP ${status}`);
  });

  it.each([{}, { data: [{ id: "" }] }, { data: [{ id: "bad\nmodel" }] }, { data: [{ id: "duplicate" }, { id: "duplicate" }] }, { data: [{ id: "m" }], has_more: true }])(
    "refuses malformed or incomplete model inventories", async body => {
      reply(body);
      await expect(enumerateRemoteModels(input())).rejects.toThrow(/invalid model enumeration response/);
    }
  );

  it("cancels an oversized streaming body before reading later chunks", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { reads += 1; controller.enqueue(new Uint8Array(600_000)); }, cancel
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
    await expect(enumerateRemoteModels(input())).rejects.toThrow(/model enumeration response exceeds/);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(reads).toBeLessThanOrEqual(3);
  });

  it("bounds remote response bytes and inventory size", async () => {
    reply({ data: [{ id: "model" }], ignored: "x".repeat(1_048_576) });
    await expect(enumerateRemoteModels(input())).rejects.toThrow(/model enumeration response exceeds/);
    vi.restoreAllMocks();
    reply({ data: Array.from({ length: 5001 }, (_, index) => ({ id: `model-${index}` })) });
    await expect(enumerateRemoteModels(input())).rejects.toThrow(/invalid model enumeration response/);
  });
});

describe("explicit review of advisory discovery", () => {
  it("pins only the explicitly reviewed exact model while keeping prices and unreviewed facts null", async () => {
    reply();
    const result = await enumerateRemoteModels(input());
    const snapshot = pinDiscoveredModel(result, review(result.digest));
    expect(snapshot).toMatchObject({ providerId: "openai", protocol, model: "remote-model", source: review(result.digest).source,
      asOf: "2026-10-30", freshness: "verified", contextWindowTokens: null, maxOutputTokens: null, modalities: null, reasoning: null, pricing: null, modelSupport: "catalog-not-probed" });
    expect(parseModelMetadataSnapshot(snapshot)).toEqual(snapshot);
    expect(snapshot.discoveryDigest).toBe(result.digest);
    expect(snapshot.reviewKind).toBe("operator-declared");
    expect(pinDiscoveredModel(result, { ...review(result.digest), contextWindowTokens: 128000, maxOutputTokens: 16384, modalities: { input: ["text"], output: ["text"] }, reasoning: false }))
      .toMatchObject({ contextWindowTokens: 128000, maxOutputTokens: 16384, reasoning: false, pricing: null });
    expect(listModelMetadata("openai", protocol).some(entry => entry.model === "remote-model")).toBe(false);
  });

  it("rejects digest mismatch, tampered advisory data and a model absent from the selected inventory", async () => {
    reply();
    const result = await enumerateRemoteModels(input());
    expect(() => pinDiscoveredModel(result, review("0".repeat(64)))).toThrow(/discovery digest/);
    expect(() => pinDiscoveredModel({ ...result, providerId: "other" }, review(result.digest))).toThrow(/discovery digest/);
    expect(() => pinDiscoveredModel(result, { ...review(result.digest), model: "not-listed" })).toThrow(/not present/);
    const { digest: _digest, ...payload } = result;
    const trusted = { ...payload, trust: "verified" };
    expect(parseModelDiscoveryResult({ ...trusted, digest: sha256Hex(canonicalize(trusted)) })).toBeNull();
    const altered = { ...payload, models: [{ ...result.models[0], contextWindowTokens: 999999 }] };
    expect(parseModelDiscoveryResult({ ...altered, digest: sha256Hex(canonicalize(altered)) })).toBeNull();
  });

  it("requires independent review provenance and validates reviewed facts", async () => {
    reply();
    const result = await enumerateRemoteModels(input());
    expect(() => pinDiscoveredModel(result, { ...review(result.digest), source: "" })).toThrow();
    expect(() => pinDiscoveredModel(result, { ...review(result.digest), asOf: "2026-02-30" })).toThrow();
    expect(() => pinDiscoveredModel(result, { ...review(result.digest), contextWindowTokens: 0 })).toThrow();
  });
});
