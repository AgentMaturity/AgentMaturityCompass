import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import YAML from "yaml";
import { budgetsPath, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import { dispatchStepRequest } from "../src/agent/requestRetry.js";
import { composeNativeAgent } from "../src/agent/nativeAgentComposition.js";
import { NO_HOOKS } from "../src/agent/loopTypes.js";
import { EMPTY_TOOL_SEAM } from "../src/agent/toolSeam.js";
import { AdapterRegistry, type LlmRouteConfig } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { createModelMetadataSnapshot, type ModelMetadataSnapshot } from "../src/llm/modelCatalog.js";
import { lookupProviderCatalog } from "../src/llm/providerCatalog.js";
import { ModelRouter } from "../src/ops/modelRouter.js";
import { parseRequestHeaderMeta, pinnedHeaderMetadata } from "../src/session/requestHeaderMeta.js";
import { SessionService } from "../src/session/sessionService.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { initWorkspace } from "../src/workspace.js";
import { errorResponse, okStream } from "./helpers/llmStubUpstream.js";

const REF = credentialRef("AMC_ROUTE_ORIGINAL");
const OTHER_REF = credentialRef("AMC_ROUTE_REPLACEMENT");
const SECRET = "sk-route-value-must-not-be-in-request-evidence";
const BASE_URL = lookupProviderCatalog("openai")!.defaultBaseUrl!;
const open: { session: SessionService; dir: string }[] = [];

afterEach(() => {
  for (const { session, dir } of open.splice(0)) {
    try { session.close({ reason: "completed" }); } catch { /* Failed composition already closed this session. */ }
    rmSync(dir, { recursive: true, force: true });
  }
});

function reviewed(model = "gpt-4o-mini"): ModelMetadataSnapshot {
  return createModelMetadataSnapshot("openai", "openai-chat-completions", model)!;
}

function route(overrides: Partial<LlmRouteConfig> = {}): LlmRouteConfig {
  return { providerId: "openai", adapter: openaiAdapter, baseUrl: BASE_URL,
    credentialRef: REF, models: ["gpt-4o-mini", "gpt-4o"], ...overrides };
}

function selection() {
  const router = new ModelRouter();
  return router.route({ strategy: "cheapest", requiredCapabilities: ["text-generation"],
    excludeProviders: ["anthropic", "google", "local"] })!;
}

function harness(registry: AdapterRegistry, transport: ConstructorParameters<typeof LlmRuntime>[0]["transport"]) {
  const dir = mkdtempSync(join(tmpdir(), "amc-native-route-"));
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(dir);
  open.push({ session, dir });
  session.open({ agentId: "default", harnessVersion: "test", compositionDigest: "composition", policyDigest: "policy" });
  const systemPromptEventId = session.recordSystemPrompt("Be precise.").eventId;
  session.startTurn({ trigger: "user" });
  session.recordUserMessage("Hello.");
  session.startStep();
  const reads: string[] = [];
  const credentials: CredentialsService = {
    resolve(ref) { reads.push(ref); return SECRET; },
    describe() { return { configured: true, source: "env", writable: false }; },
    async set() {}, async unset() { return false; }
  };
  const runtime = new LlmRuntime({ session, registry, credentials, transport });
  return { session, runtime, systemPromptEventId, reads };
}

function headers(session: SessionService) {
  return session.readEvents().filter(event => event.event_type === "request/header")
    .map(event => JSON.parse(event.meta_json) as Record<string, unknown>);
}

function reidentify(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, requestIdentityDigest: sha256Hex(canonicalize({ providerId: row.providerId, model: row.model,
    encoderId: row.encoderId, encoderVersion: row.encoderVersion, params: row.params, requestDigest: row.requestDigest,
    modelMetadataDigest: (row.modelMetadata as ModelMetadataSnapshot | null)?.digest ?? null,
    ...(row.physicalRoute === undefined ? {} : { physicalRoute: row.physicalRoute, routingDecision: row.routingDecision ?? null }) })) };
}

describe("WP28C native route identity", () => {
  test("pins reviewed metadata and physical route before request preparation, without auth material", () => {
    const registry = new AdapterRegistry();
    const { digest: _digest, ...facts } = reviewed();
    const payload = { ...facts, source: "reviewed-native-selection" };
    const snapshot = { ...payload, digest: sha256Hex(canonicalize(payload)) };
    registry.register(route({ reviewedModels: [snapshot], headers: { authorization: SECRET } }));
    const pinned = registry.pin({ providerId: "openai", model: "gpt-4o-mini" });
    const { runtime, session, systemPromptEventId } = harness(registry, async () => { throw new Error("no send"); });
    registry.replace(route({ baseUrl: "https://replacement.invalid", credentialRef: OTHER_REF }));
    runtime.prepare({ providerId: pinned.providerId, model: pinned.model, params: {}, tools: null, systemPromptEventId, pinned });
    const header = headers(session)[0]!;
    expect(pinned.modelMetadata).toEqual(snapshot);
    expect(header.modelMetadata).toEqual(snapshot);
    expect(header.physicalRoute).toEqual({ schemaVersion: 1, providerId: "openai", model: "gpt-4o-mini",
      protocol: "openai-chat-completions", baseUrl: BASE_URL, adapterId: openaiAdapter.id,
      adapterVersion: openaiAdapter.version, encoderId: openaiAdapter.encoderId, encoderVersion: openaiAdapter.encoderVersion,
      routeConfigDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(parseRequestHeaderMeta(JSON.stringify(header))).not.toBeNull();
    const serialized = JSON.stringify(header);
    for (const value of [SECRET, REF, OTHER_REF, "authorization"]) expect(serialized).not.toContain(value);
  });

  test("endpoint, selected metadata and virtual intent change identity while wire bytes stay identical", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const { runtime, session, systemPromptEventId } = harness(registry, async () => { throw new Error("no send"); });
    const spec = { providerId: "openai", model: "gpt-4o-mini", params: {}, tools: null, systemPromptEventId };
    runtime.prepare(spec);
    registry.replace(route({ baseUrl: "https://other.invalid/v1" }));
    runtime.prepare(spec);
    registry.replace(route());
    const decision = selection();
    runtime.prepare({ ...spec, pinned: runtime.pinVirtual({ intent: "economy", decision }) });
    runtime.prepare({ ...spec, pinned: runtime.pinVirtual({ intent: "interactive", decision }) });
    const changed = { ...reviewed(), source: "operator-reviewed-source" };
    const { digest: _digest, ...payload } = changed;
    registry.replace(route({ reviewedModels: [{ ...payload, digest: sha256Hex(canonicalize(payload)) }] }));
    runtime.prepare(spec);
    const rows = headers(session);
    expect(new Set(rows.map(row => row.requestDigest)).size).toBe(1);
    expect(new Set(rows.map(row => row.requestIdentityDigest)).size).toBe(5);
  });

  test("dispatches an existing router decision and retains route, auth reference and receipt through retry", async () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const seen: { url: string; body: string }[] = [];
    const { runtime, session, systemPromptEventId, reads } = harness(registry, async request => {
      seen.push({ url: request.url, body: request.body.toString("utf8") });
      return seen.length === 1 ? errorResponse(503, "busy") : okStream([
        { data: JSON.stringify({ choices: [{ index: 0, delta: { content: "Hello" } }] }) },
        { data: JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) },
        { data: JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } }) },
        { data: "[DONE]" }
      ]);
    });
    const decision = selection();
    const pinned = runtime.pinVirtual({ intent: "economy", decision });
    // A failed dispatched attempt has unknown token usage. The test operator
    // explicitly accepts that exposure before permitting the retry.
    const budget = loadBudgetsConfig(session.workspace);
    budget.budgets.perAgent.default!.unknownTokenUsage = "ALLOW_WITH_WARNING";
    writeFileSync(budgetsPath(session.workspace), YAML.stringify(budget));
    signBudgetsConfig(session.workspace);
    await dispatchStepRequest({ session, llm: runtime,
      route: { providerId: pinned.providerId, model: pinned.model, params: {}, pinned },
      systemPromptEventId, tools: null, notify() {}, retry: { random: () => 0.5, async sleep() {
        registry.replace(route({ baseUrl: "https://replacement.invalid", credentialRef: OTHER_REF }));
      } } }, 1, 1, new AbortController().signal);
    expect(seen).toHaveLength(2);
    expect(new Set(seen.map(request => request.url)).size).toBe(1);
    expect(seen[0]!.url).toContain("api.openai.com");
    expect(seen.map(request => (JSON.parse(request.body) as { model: string }).model)).toEqual([pinned.model, pinned.model]);
    expect(reads).toEqual([REF, REF]);
    const rows = headers(session);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.routingDecision).toEqual(rows[1]!.routingDecision);
    expect(rows[0]!.requestIdentityDigest).toBe(rows[1]!.requestIdentityDigest);
    expect(rows[0]!.routingDecision).toMatchObject({ schemaVersion: 1, intent: "economy", strategy: decision.strategy });
    expect(rows.every(row => parseRequestHeaderMeta(JSON.stringify(row)) !== null)).toBe(true);
  });

  test("rejects router decisions for a different physical endpoint or provider", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const decision = selection();
    expect(() => registry.pinVirtual({ intent: "economy", decision: { ...decision,
      selectedProvider: { ...decision.selectedProvider, baseUrl: "https://other.invalid" } } })).toThrow(/route|endpoint/i);
    expect(() => registry.pinVirtual({ intent: "economy", decision: { ...decision,
      selectedModel: { ...decision.selectedModel, provider: "other" } } })).toThrow(/provider|route/i);
    expect(() => registry.pinVirtual({ intent: "", decision })).toThrow(/intent|decision/i);
  });

  test.each(["https://user:secret@provider.invalid", "https://provider.invalid?api_key=secret", "https://provider.invalid#secret"])(
    "refuses credential-bearing or ambiguous base URLs: %s", baseUrl => {
      const registry = new AdapterRegistry();
      expect(() => registry.register(route({ baseUrl }))).toThrow(/baseUrl/);
      expect(registry.list()).toEqual([]);
    });

  test("validates reviewed metadata provenance and exact provider/protocol/model before registration", () => {
    for (const change of [{ providerId: "other" }, { protocol: "anthropic-messages" }, { model: "unserved" }, { digest: "0".repeat(64) }]) {
      const { digest: _digest, ...payload } = { ...reviewed(), ...change };
      const snapshot = { ...payload, digest: "digest" in change ? change.digest! : sha256Hex(canonicalize(payload)) };
      const registry = new AdapterRegistry();
      expect(() => registry.register(route({ reviewedModels: [snapshot] }))).toThrow(/metadata/);
      expect(registry.list()).toEqual([]);
    }
    const registry = new AdapterRegistry();
    expect(() => registry.register(route({ reviewedModels: [reviewed(), reviewed()] }))).toThrow(/metadata/);
  });

  test("detaches configured reviewed records, preserving snapshot across caller mutation", () => {
    const registry = new AdapterRegistry();
    const snapshot = JSON.parse(JSON.stringify(reviewed())) as ModelMetadataSnapshot;
    const reviewedModels = [snapshot];
    registry.register(route({ reviewedModels }));
    reviewedModels.length = 0;
    Object.assign(snapshot, { source: "changed", contextWindowTokens: 1 });
    const pinned = registry.pin({ providerId: "openai", model: "gpt-4o-mini" });
    expect(pinned.modelMetadata).toEqual(reviewed());
    expect(Object.isFrozen(pinned.modelMetadata)).toBe(true);
  });

  test("detaches registered route configuration before a caller can change its auth binding", () => {
    const registry = new AdapterRegistry();
    const config = route();
    registry.register(config);
    Object.assign(config, { credentialRef: OTHER_REF, providerId: "changed" });
    const pinned = registry.pin({ providerId: "openai", model: "gpt-4o-mini" });
    expect(pinned.providerId).toBe("openai");
    expect(pinned.credentialRef).toBe(REF);
  });

  test("writer rejects incompatible physical selection and virtual receipts before signing", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const pinned = registry.pinVirtual({ intent: "economy", decision: selection() });
    const params = { providerId: pinned.providerId, model: pinned.model, encoderId: pinned.encoderId,
      encoderVersion: pinned.encoderVersion, params: {}, systemPromptEventId: "system", toolSchema: null,
      projectionCutoffEventId: "cutoff", projectionDigest: "projection", sourceEventIds: [], requestBytes: "{}",
      physicalRoute: pinned.physicalRoute, modelMetadata: pinned.modelMetadata, routingDecision: pinned.routingDecision };
    expect(() => pinnedHeaderMetadata({ ...params, routingDecision: null, physicalRoute: { ...pinned.physicalRoute, providerId: "other" } })).toThrow(/Request physical route/);
    expect(() => pinnedHeaderMetadata({ ...params, routingDecision: null, physicalRoute: { ...pinned.physicalRoute, baseUrl: "invalid" } })).toThrow(/Request physical route/);
    expect(() => pinnedHeaderMetadata({ ...params, routingDecision: { ...pinned.routingDecision!, physicalRouteDigest: "0".repeat(64) } })).toThrow(/routing decision/);
    expect(() => pinnedHeaderMetadata({ ...params, physicalRoute: undefined })).toThrow(/routing decision/);
    expect(() => pinnedHeaderMetadata({ ...params, physicalRoute: undefined, routingDecision: null })).toThrow(/routing decision/);
  });

  test("route configuration identity changes across fresh registries without exposing auth or header values", () => {
    const configs = [route(), route({ credentialRef: OTHER_REF }), route({ headers: { "x-private-key": SECRET } }),
      route({ retry: { mode: "normal", maxRetries: 9 } }), route({ firstByteTimeoutMs: 12345 })];
    const pins = configs.map(config => {
      const registry = new AdapterRegistry();
      registry.register(config);
      return registry.pin({ providerId: "openai", model: "gpt-4o-mini" });
    });
    expect(new Set(pins.map(pin => canonicalize(pin.physicalRoute))).size).toBe(configs.length);
    for (const pin of pins) {
      const text = JSON.stringify(pin.physicalRoute);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(REF);
      expect(text).not.toContain(OTHER_REF);
      expect(text).not.toContain("x-private-key");
    }
  });

  test("fails closed on tampered route, protocol, receipt or metadata binding", () => {
    const registry = new AdapterRegistry();
    registry.register(route());
    const { runtime, session, systemPromptEventId } = harness(registry, async () => { throw new Error("no send"); });
    const pinned = runtime.pinVirtual({ intent: "economy", decision: selection() });
    runtime.prepare({ providerId: pinned.providerId, model: pinned.model, params: {}, tools: null, systemPromptEventId, pinned });
    const row = headers(session)[0]!;
    const physical = row.physicalRoute as Record<string, unknown>;
    for (const change of [{ providerId: "other" }, { model: "other" }, { protocol: "anthropic-messages" },
      { baseUrl: "https://other.invalid" }, { baseUrl: "https://user:secret@provider.invalid" }, { encoderVersion: 99 }]) {
      expect(parseRequestHeaderMeta(JSON.stringify({ ...row, physicalRoute: { ...physical, ...change } }))).toBeNull();
    }
    // Recomputed identity removes the digest mismatch as a reason for refusal:
    // the route/header binding must also reject otherwise well-formed metadata.
    for (const change of [{ providerId: "other" }, { model: "other" }, { encoderId: "openai-responses" },
      { protocol: "anthropic-messages" }, { encoderVersion: 99 }]) {
      expect(parseRequestHeaderMeta(JSON.stringify(reidentify({ ...row, modelMetadata: null,
        routingDecision: null, physicalRoute: { ...physical, ...change } })))).toBeNull();
    }
    expect(parseRequestHeaderMeta(JSON.stringify(reidentify({ ...row,
      routingDecision: { ...(row.routingDecision as object), physicalRouteDigest: "0".repeat(64) } })))).toBeNull();
    expect(parseRequestHeaderMeta(JSON.stringify(reidentify({ ...row, physicalRoute: undefined })))).toBeNull();
    expect(parseRequestHeaderMeta(JSON.stringify(reidentify({ ...row,
      physicalRoute: { ...physical, baseUrl: "https://provider.invalid?api_key=secret" }, routingDecision: null })))).toBeNull();
    expect(parseRequestHeaderMeta(JSON.stringify({ ...row, routingDecision: { ...(row.routingDecision as object), intent: "changed" } }))).toBeNull();
    expect(parseRequestHeaderMeta(JSON.stringify({ ...row, requestIdentityDigest: undefined }))).toBeNull();
  });

  test("native composition dispatches the explicit selection after registry removal and refuses a mismatched pin", async () => {
    for (const mismatch of [false, true]) {
      const dir = mkdtempSync(join(tmpdir(), "amc-native-pinned-composition-"));
      initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
      const session = new SessionService(dir);
      open.push({ session, dir });
      const registry = new AdapterRegistry();
      registry.register(route({ credentialRef: null }));
      const pinned = registry.pinVirtual({ intent: "economy", decision: selection() });
      registry.remove("openai");
      let sent = 0;
      const compose = () => composeNativeAgent({ session,
        open: { agentId: "default", harnessVersion: "test", compositionDigest: "composition", policyDigest: "policy" },
        prompt: { text: "Be precise.", hooks: NO_HOOKS }, tools: () => EMPTY_TOOL_SEAM,
        route: { providerId: pinned.providerId, model: mismatch ? "gpt-4o" : pinned.model, params: {}, pinned },
        makeLlm: current => new LlmRuntime({ session: current, registry, credentials: {
          resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
          async set() {}, async unset() { return false; }
        }, transport: async () => {
          sent += 1;
          return okStream([{ data: JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) },
            { data: JSON.stringify({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 0 } }) }, { data: "[DONE]" }]);
        } }) });
      if (mismatch) {
        expect(compose).toThrow(/pinned|route.*match/i);
        expect(sent).toBe(0);
      } else {
        const composed = compose();
        try {
          composed.driver.send("Hello.", "next-turn", true);
          await composed.driver.whenIdle();
          expect(sent).toBe(1);
          expect(headers(session)[0]!.routingDecision).toEqual(pinned.routingDecision);
        } finally { composed.dispose(); }
      }
    }
  });
});
