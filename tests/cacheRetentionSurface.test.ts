/**
 * SH-PROVIDERS-06: `--cache-retention` reaches the route, the pinned encoder version and the bytes on the wire.
 *
 * Mutation checks: drop RETENTION_PROVIDERS from routeExtras → (2) fails on the flag message (the registry still refuses
 * through its adapter gate, which tests/nativeOpenaiCompatibleRoutes.test.ts (6) pins); stop passing `extras` through
 * nativeRouteFor → (1) fails.
 */
import { describe, expect, test } from "vitest";
import { nativeRouteFor } from "../src/cli-agent-options.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { parseRequestHeaderMeta } from "../src/session/requestHeaderMeta.js";
import { drain, runtimeHarness } from "./helpers/fixtureProviderHarness.js";
import { anthropicTextStream } from "./helpers/llmStubUpstream.js";

const sse = (events: readonly { event: string; data: string }[]) => events.map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join("");

describe("SH-PROVIDERS-06 cache retention on native surfaces", () => {
  test("(1) the flag becomes route retention, pins the retention encoder version and marks the 1h TTL on the wire", async () => {
    const h = await runtimeHarness({ responses: [sse(anthropicTextStream({ text: ["hi"], inputTokens: 10, outputTokens: 3 }))], model: "claude-x",
      params: { max_tokens: 64, stream: true },
      route: (origin) => nativeRouteFor("anthropic", { baseUrl: origin, credential: "AMC_PI_FIXTURE_KEY", cacheRetention: "long" }, "claude-x") });
    expect(h.route.cacheRetention).toBe("long");
    const call = h.runtime.prepare(h.spec());
    expect(call.route.encoderVersion).toBe(5);
    await drain(call.stream());
    h.finishStep(call);
    const header = h.session.readEvents().find((e) => e.event_type === "request/header")!;
    h.close();
    const body = h.received[0]!.body.toString("utf8");
    expect(body).toContain('"ttl":"1h"');
    expect(body).not.toContain("cacheRetention");
    const meta = parseRequestHeaderMeta(header.meta_json)!;
    expect(meta.encoderVersion).toBe(5);
    expect(meta.params).toMatchObject({ cacheRetention: "long" });
  });

  test("(2) refused for providers without a reviewed retention wire, before any row, with the flag named", () => {
    for (const id of ["gemini", "deepseek", "ollama", "stub"]) {
      expect(() => nativeRouteFor(id, { cacheRetention: "long", credential: "K" }, "m")).toThrow(/--cache-retention is not admitted/);
    }
    expect(() => nativeRouteFor("anthropic", { cacheRetention: "24h", credential: "K" }, "m")).toThrow(/short or long/);
    const registry = new AdapterRegistry();
    registry.register(nativeRouteFor("openai-responses", { cacheRetention: "short", credential: "K" }, "m"));
    expect(registry.pin({ providerId: "openai-responses", model: "m" })).toMatchObject({ encoderVersion: 4, cacheRetention: "short" });
  });
});
