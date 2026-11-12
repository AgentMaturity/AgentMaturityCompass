import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { AdapterRegistry, type LlmRouteConfig } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { openaiResponsesAdapter } from "../src/llm/providers/openaiResponsesAdapter.js";
import { DEFAULT_REQUEST_ENCODERS, deriveRecordedRequest, deriveSessionRequests } from "../src/llm/request/deriveRequest.js";
import { usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import { cacheRetentionEncoderVersion } from "../src/llm/request/cacheRetentionEncoders.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";

const protocols = [
  { id: "anthropic-messages", adapter: anthropicAdapter, previous: 4, version: 5, params: { max_tokens: 64, stream: true } },
  { id: "openai-chat", adapter: openaiAdapter, previous: 6, version: 7, params: { max_tokens: 64 } },
  { id: "openai-responses", adapter: openaiResponsesAdapter, previous: 3, version: 4, params: { max_output_tokens: 64 } }
] as const;
const REQUEST: EncodableRequest = {
  model: "fixture-model", params: {}, system: "Stable system prefix.",
  tools: [{ name: "fs.read", description: "Read", parameters: { type: "object", properties: { cache_control: { type: "string" } } } }],
  messages: [{ role: "user", parts: [{ kind: "text", text: "First request." }] }]
};
const credentials: CredentialsService = {
  resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
  set: async () => { throw new Error("Fixture has no credentials"); }, unset: async () => false
};
const folders: string[] = [], sessions: SessionService[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.disposeWithoutClosing();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function encoder(protocol: typeof protocols[number]) {
  const found = DEFAULT_REQUEST_ENCODERS.get(protocol.id, protocol.version);
  if (found === null) throw new Error(`Missing retention encoder ${protocol.id}@${protocol.version}`);
  return found;
}
function encoded(protocol: typeof protocols[number], params: Record<string, unknown>, changes: Partial<EncodableRequest> = {}) {
  return JSON.parse(encoder(protocol).encode({ ...REQUEST, ...changes, params: { ...protocol.params, ...params } }).toString()) as Record<string, any>;
}
function route(protocol: typeof protocols[number], cacheRetention?: "short" | "long"): LlmRouteConfig {
  return { providerId: "fixture", adapter: protocol.adapter, baseUrl: "https://provider.invalid", credentialRef: null,
    models: [REQUEST.model], ...(cacheRetention === undefined ? {} : { cacheRetention }) };
}
function harness(protocol: typeof protocols[number], cacheRetention: "short" | "long") {
  const workspace = mkdtempSync(join(tmpdir(), "amc-cache-retention-")); folders.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  const session = new SessionService(workspace); sessions.push(session);
  session.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
  const system = session.recordSystemPrompt(REQUEST.system!);
  session.startTurn({ trigger: "user" }); session.recordUserMessage("First request."); session.startStep();
  const registry = new AdapterRegistry(); registry.register(route(protocol, cacheRetention));
  const runtime = new LlmRuntime({ session, registry, credentials });
  const spec = { providerId: "fixture", model: REQUEST.model, params: protocol.params, systemPromptEventId: system.eventId, tools: REQUEST.tools };
  return { workspace, session, registry, runtime, spec };
}

describe("PXA-15 route cache retention uses reconstructable encoder versions", () => {
  test.each(protocols)("$id registers a retention version, keeps the adapter's default and every historical version", protocol => {
    expect(protocol.adapter.encoderVersion).toBe(protocol.previous);
    expect(cacheRetentionEncoderVersion(protocol.adapter.id, protocol.id, protocol.previous)).toBe(protocol.version);
    const plain = new AdapterRegistry(); plain.register(route(protocol));
    expect(plain.pin({ providerId: "fixture", model: REQUEST.model })).toMatchObject({ encoderVersion: protocol.previous });
    expect(plain.pin({ providerId: "fixture", model: REQUEST.model }).cacheRetention).toBeUndefined();
    const retained = new AdapterRegistry(); retained.register(route(protocol, "short"));
    expect(retained.pin({ providerId: "fixture", model: REQUEST.model })).toMatchObject({ encoderVersion: protocol.version, cacheRetention: "short" });
    expect(usesProviderToolNames(protocol.id, protocol.version)).toBe(true);
    for (let version = 1; version <= protocol.previous; version++) expect(DEFAULT_REQUEST_ENCODERS.get(protocol.id, version)).not.toBeNull();
    const request = { ...REQUEST, params: protocol.params };
    expect(encoder(protocol).encode(request)).toEqual(DEFAULT_REQUEST_ENCODERS.get(protocol.id, protocol.previous)!.encode(request));
  });

  test("Anthropic long upgrades only the three existing cache breakpoints to 1h", () => {
    const body = encoded(protocols[0], { cacheRetention: "long" });
    expect(body.cacheRetention).toBeUndefined();
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(body.tools[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(body.tools[0].input_schema.properties.cache_control).toEqual({ type: "string" });
    expect(JSON.stringify(body).match(/"ttl":"1h"/g)).toHaveLength(3);
  });

  test("Anthropic short keeps the historical default TTL bytes", () => {
    const protocol = protocols[0];
    expect(encoder(protocol).encode({ ...REQUEST, params: { ...protocol.params, cacheRetention: "short" } }))
      .toEqual(DEFAULT_REQUEST_ENCODERS.get(protocol.id, protocol.previous)!.encode({ ...REQUEST, params: protocol.params }));
  });

  test.each(protocols.slice(1))("$id translates retention and keeps a deterministic prefix key as history grows", protocol => {
    const short = encoded(protocol, { cacheRetention: "short" });
    const long = encoded(protocol, { cacheRetention: "long" });
    expect(short.prompt_cache_retention).toBe("in_memory");
    expect(long.prompt_cache_retention).toBe("24h");
    expect(long.cacheRetention).toBeUndefined();
    expect(long.prompt_cache_key).toMatch(/^amc:[a-f0-9]{64}$/);
    expect(short.prompt_cache_key).toBe(long.prompt_cache_key);
    expect(encoded(protocol, { cacheRetention: "long" }, { messages: [...REQUEST.messages,
      { role: "assistant", parts: [{ kind: "text", text: "Next reply." }] }] }).prompt_cache_key).toBe(long.prompt_cache_key);
    for (const changes of [{ system: "Other system." }, { tools: null }, { model: "other-model" }]) {
      expect(encoded(protocol, { cacheRetention: "long" }, changes).prompt_cache_key).not.toBe(long.prompt_cache_key);
    }
    expect(encoded(protocol, { cacheRetention: "long" })).toEqual(long);
  });

  test.each(protocols)("$id refuses invalid retention values rather than sending them to the provider", protocol => {
    for (const cacheRetention of [null, "none", "24h", false, 1, {}]) {
      expect(() => encoded(protocol, { cacheRetention })).toThrow(/cacheRetention/);
    }
  });

  test.each(protocols)("$id refuses conflicting wire cache controls", protocol => {
    const keys = protocol.id === "anthropic-messages" ? ["cache_control"] : ["prompt_cache_key", "prompt_cache_retention", "prompt_cache_options"];
    for (const key of keys) expect(() => encoded(protocol, { cacheRetention: "long", [key]: "caller value" })).toThrow(/cache/);
  });

  test.each(protocols)("$id freezes the route option at registration and preserves existing pins", protocol => {
    const registry = new AdapterRegistry(), config = { ...route(protocol, "long") };
    registry.register(config);
    Object.assign(config, { cacheRetention: "short" });
    const pinned = registry.pin({ providerId: "fixture", model: REQUEST.model });
    expect(pinned.cacheRetention).toBe("long");
    registry.replace(route(protocol, "short"));
    expect(pinned.cacheRetention).toBe("long");
    expect(registry.pin({ providerId: "fixture", model: REQUEST.model }).cacheRetention).toBe("short");
  });

  test.each(protocols)("$id rejects invalid policies and old encoder routes before registering", protocol => {
    for (const cacheRetention of [null, "none", 0]) {
      expect(() => new AdapterRegistry().register({ ...route(protocol), cacheRetention } as unknown as LlmRouteConfig)).toThrow(/cacheRetention/);
    }
    expect(() => new AdapterRegistry().register({ ...route(protocol, "long"), adapter: { ...protocol.adapter, encoderVersion: protocol.previous - 1 } })).toThrow(/cacheRetention/);
  });

  for (const cacheRetention of ["short", "long"] as const) {
    test.each(protocols)(`$id route ${cacheRetention} commits the pinned policy and reconstructs cold with the signed digest`, protocol => {
      const h = harness(protocol, cacheRetention);
      const pinned = h.runtime.pin({ providerId: "fixture", model: REQUEST.model });
      h.registry.replace(route(protocol, cacheRetention === "long" ? "short" : "long"));
      const prepared = h.runtime.prepare({ ...h.spec, pinned });
      const events = h.session.readEvents();
      const header = events.find(event => event.id === prepared.headerEventId)!;
      expect(JSON.parse(header.meta_json)).toMatchObject({ params: { cacheRetention }, encoderVersion: protocol.version });
      expect(deriveRecordedRequest({ workspace: h.workspace, events, headerEventId: prepared.headerEventId })).toMatchObject({
        status: "reconstructed", derivedDigest: prepared.requestDigest
      });
      const tampered = events.map(event => event.id === header.id ? { ...event,
        meta_json: JSON.stringify({ ...JSON.parse(event.meta_json), params: { ...protocol.params, cacheRetention: cacheRetention === "long" ? "short" : "long" } }) } : event);
      // The header's identity digest commits its params, so a swapped retention never reconstructs.
      expect(deriveRecordedRequest({ workspace: h.workspace, events: tampered, headerEventId: header.id }).status).not.toBe("reconstructed");
      h.session.endStep({ stopReason: "end_turn", usage: null }); h.session.endTurn({ reason: "complete" });
      h.session.sealTurn(); h.session.close({ reason: "completed" });
      const derived = deriveSessionRequests({ workspace: h.workspace, sessionId: h.session.sessionId });
      expect(derived).toHaveLength(1);
      expect(derived[0]).toMatchObject({ status: "reconstructed", derivedDigest: prepared.requestDigest });
      const body = JSON.parse(derived[0]!.bytes!.toString());
      if (protocol.id === "anthropic-messages") expect(body.system[0].cache_control).toEqual({ type: "ephemeral", ...(cacheRetention === "long" ? { ttl: "1h" } : {}) });
      else expect(body.prompt_cache_retention).toBe(cacheRetention === "long" ? "24h" : "in_memory");
    });
  }

  test.each(protocols)("$id caller cannot override the route policy before a signed request header exists", protocol => {
    const h = harness(protocol, "short");
    expect(() => h.runtime.prepare({ ...h.spec, params: { ...protocol.params, cacheRetention: "long" } })).toThrow(/cacheRetention/);
    expect(h.session.readEvents().filter(event => event.event_type === "request/header")).toHaveLength(0);
  });
});
