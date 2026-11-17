import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { credentialRef } from "../src/credentials/credentialRef.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import { AdapterRegistry, LlmRouteError } from "../src/llm/adapter/adapterRegistry.js";
import { LlmDispatchError, LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { LlmCapabilityError } from "../src/llm/adapter/providerCapabilities.js";
import type { HttpTransport } from "../src/llm/adapter/transport.js";
import type { LlmAdapter } from "../src/llm/adapter/adapterTypes.js";
import { LlmError } from "../src/llm/llmFailure.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import { EgressBlocked } from "../src/residency/checkEgress.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspaceWithoutActionPolicy } from "./helpers/actionPolicyFixtures.js";
import { anthropicTextStream, okStream, refusingUpstream, stubUpstream } from "./helpers/llmStubUpstream.js";

let workspace: string;
const sessions: SessionService[] = [];
const credentials: CredentialsService = {
  resolve: () => null, describe: () => ({ configured: false, source: null, writable: false }),
  set: async () => { throw new Error("unused"); }, unset: async () => false
};
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "amc-llm-runtime-refusals-"));
  initWorkspaceWithoutActionPolicy({ workspacePath: workspace, trustBoundaryMode: "isolated" });
});
afterEach(() => {
  for (const session of sessions.splice(0)) { try { session.close({ reason: "completed" }); } catch { /* fixture teardown */ } }
  rmSync(workspace, { recursive: true, force: true });
});
function session() {
  const value = new SessionService(workspace); sessions.push(value);
  value.open({ agentId: "default", harnessVersion: "runtime-test", compositionDigest: "runtime-test", policyDigest: "runtime-test" });
  const prompt = value.recordSystemPrompt("Runtime fixture");
  value.startTurn({ trigger: "user" }); value.recordUserMessage("Say done"); value.startStep();
  return { value, spec: { providerId: "fixture", model: "fixture", params: { max_tokens: 20, stream: true }, systemPromptEventId: prompt.eventId, tools: null } };
}
function runtime(value: SessionService, transport: HttpTransport, ref: string | null = null, adapter: LlmAdapter = anthropicAdapter) {
  const registry = new AdapterRegistry();
  registry.register({ providerId: "fixture", models: ["fixture"], adapter, baseUrl: "https://fixture.invalid",
    credentialRef: ref === null ? null : credentialRef(ref) });
  return new LlmRuntime({ session: value, registry, credentials, transport });
}
const response = () => okStream(anthropicTextStream({ text: ["done"], inputTokens: 10, outputTokens: 3 }));
async function drain(stream: AsyncIterable<unknown>) { for await (const _ of stream) { /* consume */ } }
async function failure(stream: AsyncIterable<unknown>): Promise<LlmError> {
  try { await drain(stream); } catch (error) { if (error instanceof LlmError) return error; throw error; }
  throw new Error("expected the stream to fail");
}
const failureRows = (value: SessionService) => value.readEvents().filter(row => row.event_type === "request/failure")
  .map(row => JSON.parse(row.meta_json) as { failure: { code: string }; cause?: string });

describe("LlmRuntime: discovery and single-use calls", () => {
  test("lists and describes the registered providers", () => {
    const { value } = session(); const llm = runtime(value, stubUpstream([response]).transport);
    expect(llm.providers()).toEqual(["fixture"]);
    expect(JSON.stringify(llm.describeProviders())).toContain("fixture");
  });

  test("a prepared call sends exactly once; a second stream() is refused before any network", async () => {
    const { value, spec } = session(); const upstream = stubUpstream([response]); const llm = runtime(value, upstream.transport);
    const call = llm.prepare(spec);
    await drain(call.stream());
    expect(call.settled?.failure).toBeNull();
    let refused: unknown;
    try { call.stream(); } catch (error) { refused = error; }
    expect(refused).toBeInstanceOf(LlmDispatchError);
    expect(refused).toMatchObject({ code: "AMC_LLM_CALL_ALREADY_DISPATCHED", message: `request ${call.headerEventId} was already dispatched; a prepared call sends exactly once` });
    expect(upstream.sent).toHaveLength(1);
  });
});

describe("LlmRuntime: refusals before anything is signed", () => {
  test("a pinned route for another provider or model is refused", () => {
    const { value, spec } = session(); const llm = runtime(value, stubUpstream([response]).transport);
    const pinned = llm.pin({ providerId: "fixture", model: "fixture" });
    expect(() => llm.prepare({ ...spec, model: "other", pinned })).toThrow(new LlmRouteError("AMC_LLM_ROUTE_UNKNOWN", "the step pinned fixture/fixture, not fixture/other"));
  });

  test("a required protocol the route does not declare is refused", () => {
    const { value, spec } = session(); const llm = runtime(value, stubUpstream([response]).transport);
    expect(() => llm.prepare({ ...spec, requiredProtocol: "no-such-protocol" })).toThrow(LlmCapabilityError);
  });

  test("cacheRetention cannot be passed as a request param", () => {
    const { value, spec } = session(); const llm = runtime(value, stubUpstream([response]).transport);
    expect(() => llm.prepare({ ...spec, params: { ...spec.params, cacheRetention: "long" } })).toThrow("cacheRetention is a route setting");
  });
});

describe("LlmRuntime: failures are typed and recorded", () => {
  test("a request cancelled before dispatch is recorded as ABORTED and never sent", async () => {
    const { value, spec } = session(); const upstream = stubUpstream([response]); const llm = runtime(value, upstream.transport);
    const abort = new AbortController(); abort.abort();
    const error = await failure(llm.stream({ ...spec, signal: abort.signal }));
    expect(error.code).toBe("ABORTED");
    expect(upstream.sent).toHaveLength(0);
    expect(failureRows(value).at(-1)?.failure.code).toBe("ABORTED");
  });

  test("a route whose credential no layer supplies fails before the network with MISSING_CREDENTIAL", async () => {
    const { value, spec } = session(); const upstream = stubUpstream([response]); const llm = runtime(value, upstream.transport, "FIXTURE_UNSET_KEY");
    const error = await failure(llm.stream(spec));
    expect(error.code).toBe("MISSING_CREDENTIAL");
    expect(error.message).toBe("no layer supplies credential FIXTURE_UNSET_KEY for provider fixture");
    expect(upstream.sent).toHaveLength(0);
  });

  test("a residency block raised by the transport is recorded as AMC_RESIDENCY_EGRESS_BLOCKED", async () => {
    const blocked = new EgressBlocked({ verdict: "blocked", reason: "destination_not_allowed", destinationId: null, ruleIds: [] } as never,
      { controlIds: [] } as never);
    const { value, spec } = session(); const llm = runtime(value, refusingUpstream(blocked).transport);
    const error = await failure(llm.stream(spec));
    expect(error.code).toBe("AMC_RESIDENCY_EGRESS_BLOCKED");
    expect(error.message).toContain("Residency egress blocked: destination_not_allowed");
    // The decision's codes are recorded beside the failure (a decision without a detail records its reason twice).
    expect(failureRows(value).at(-1)).toMatchObject({ residency: { reason: "destination_not_allowed", detail: "destination_not_allowed" } });
  });

  test("a redirect is refused, not followed", async () => {
    const redirect = new TypeError("fetch failed", { cause: new Error("unexpected redirect") });
    const { value, spec } = session(); const llm = runtime(value, refusingUpstream(redirect).transport);
    const error = await failure(llm.stream(spec));
    expect(error.code).toBe("AMC_REDIRECT_REFUSED");
    expect(error.message).toContain("AMC does not follow redirects");
  });

  test("a typed provider error raised by the adapter mid-stream keeps its code and is recorded as a provider failure", async () => {
    const adapter: LlmAdapter = { ...anthropicAdapter, decode: async function* () {
      throw new LlmError("provider overloaded mid-stream", "SERVER");
    } };
    const { value, spec } = session(); const llm = runtime(value, stubUpstream([response]).transport, null, adapter);
    const error = await failure(llm.stream(spec));
    expect(error).toMatchObject({ code: "SERVER", message: "provider overloaded mid-stream" });
    expect(failureRows(value).at(-1)).toMatchObject({ failure: { code: "SERVER" } });
  });

  test("an untyped error while decoding a started stream is recorded as TRANSPORT, not UNKNOWN", async () => {
    const adapter: LlmAdapter = { ...anthropicAdapter, decode: async function* () {
      throw new Error("socket hang up");
    } };
    const { value, spec } = session(); const llm = runtime(value, stubUpstream([response]).transport, null, adapter);
    const error = await failure(llm.stream(spec));
    expect(error.code).toBe("TRANSPORT");
    expect(failureRows(value).at(-1)).toMatchObject({ failure: { code: "TRANSPORT" } });
  });

  test("an error response whose body breaks while being read keeps the typed failure from the body", async () => {
    const broken: HttpTransport = async () => ({ status: 503, headers: {}, body: (async function* () {
      yield new Uint8Array([123]);
      throw new LlmError("upstream reset", "SERVER");
    })() });
    const { value, spec } = session(); const llm = runtime(value, broken);
    const error = await failure(llm.stream(spec));
    expect(error.code).toBe("SERVER");
    expect(failureRows(value).at(-1)?.failure.code).toBe("SERVER");
  });
});
