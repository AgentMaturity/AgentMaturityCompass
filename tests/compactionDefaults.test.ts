import { describe, expect, it } from "vitest";
import { resolveRouteCompaction, resolveCompactionConfig, compactionFromFlags } from "../src/agent/compaction/promptPressure.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { createModelMetadataSnapshot } from "../src/llm/modelCatalog.js";
import { assertAutomaticProvenance, parseCompactionReceipt } from "../src/session/surfaceCompactionValidation.js";
import type { EvidenceEvent } from "../src/types.js";

const route = { providerId: "anthropic", model: "claude-sonnet-4-20250514" };
const snapshot = () => createModelMetadataSnapshot(route.providerId, "anthropic-messages", route.model);

describe("catalog defaults and exact signed compaction overrides", () => {
  it("enables a reviewed 200000-token route without a declared window", () => {
    expect(resolveRouteCompaction(undefined, route, snapshot())).toMatchObject({ contextWindowTokens: 200000, reserveTokens: 16384, keepRecentSteps: 2 });
  });

  it.each([8000, 16384])("uses a ratio for windows too small for the default reserve: %s", window => {
    const { digest: _digest, ...original } = snapshot()!;
    const small = { ...original, contextWindowTokens: window };
    expect(resolveRouteCompaction(undefined, route, { ...small, digest: sha256Hex(canonicalize(small)) }))
      .toMatchObject({ contextWindowTokens: window, reserveTokens: null, threshold: 0.8 });
    expect(resolveRouteCompaction({ contextWindowTokens: window }, route, snapshot()))
      .toMatchObject({ contextWindowTokens: window, reserveTokens: null });
  });

  it.each([10000, 10001])("refuses an explicit reserve that cannot fit the effective window: %s", reserveTokens => {
    expect(() => resolveCompactionConfig({ contextWindowTokens: 10000, reserveTokens })).toThrow(/reserve/i);
    expect(() => resolveCompactionConfig({ modelOverrides: [{ ...route, contextWindowTokens: 10000, reserveTokens }] })).toThrow(/reserve/i);
    expect(() => resolveRouteCompaction({ contextWindowTokens: 10000, reserveTokens }, route, snapshot())).toThrow(/reserve/i);
  });

  it("keeps unknown, mismatched and tampered model metadata unknown", () => {
    for (const metadata of [null, { ...snapshot(), providerId: "other-provider" }, { ...snapshot(), contextWindowTokens: 900000 }]) {
      expect(resolveRouteCompaction(undefined, route, metadata).contextWindowTokens).toBeNull();
    }
    expect(resolveRouteCompaction(undefined, { ...route, providerId: "other-provider" }, snapshot()).contextWindowTokens).toBeNull();
    expect(resolveRouteCompaction(undefined, { ...route, model: "other-model" }, snapshot()).contextWindowTokens).toBeNull();
  });

  it("resolves each exact provider/model override field independently", () => {
    const policy = { keepRecentSteps: 4, pruneMinBytes: 8000, reserveTokens: 3000, modelOverrides: [
      { providerId: route.providerId, model: "other-model", contextWindowTokens: 19, keepRecentSteps: 98 },
      { providerId: "other-provider", model: route.model, contextWindowTokens: 17, keepRecentSteps: 99 },
      { providerId: route.providerId, model: route.model, reserveTokens: 24000, summarize: false }
    ] };
    expect(resolveRouteCompaction(policy, route, snapshot())).toMatchObject({ contextWindowTokens: 200000, reserveTokens: 24000,
      keepRecentSteps: 4, pruneMinBytes: 8000, summarize: false });
    expect(resolveRouteCompaction({ contextWindowTokens: null }, route, snapshot()).contextWindowTokens).toBeNull();
    expect(resolveRouteCompaction({ threshold: 0.7 }, route, snapshot())).toMatchObject({ threshold: 0.7, reserveTokens: null });
  });

  it("treats undefined fields as absent independently at each override layer", () => {
    expect(resolveRouteCompaction({ contextWindowTokens: undefined, reserveTokens: 3000, modelOverrides: [
      { ...route, reserveTokens: undefined, summarize: false }
    ] }, route, snapshot())).toMatchObject({ contextWindowTokens: 200000, reserveTokens: 3000, summarize: false });
  });

  it("lets a window-only CLI override inherit the catalog reserve independently", () => {
    const selected = compactionFromFlags({ contextWindow: "300000" });
    expect(resolveRouteCompaction(selected, route, snapshot())).toMatchObject({ contextWindowTokens: 300000, reserveTokens: 16384 });
    expect(selected).toEqual({ contextWindowTokens: 300000 });
    expect(resolveRouteCompaction(compactionFromFlags({ contextWindow: "8000" }), route, null))
      .toMatchObject({ contextWindowTokens: 8000, reserveTokens: null, threshold: 0.8 });
  });

  it("keeps explicit CLI fields above exact preset fields", () => {
    const config = compactionFromFlags({ contextWindow: "300000", compactThreshold: "0.9" }, {
      keepRecentSteps: 7, modelOverrides: [{ ...route, contextWindowTokens: 100000, reserveTokens: 1000, summarize: false }]
    }, route);
    expect(config).toMatchObject({ contextWindowTokens: 300000, threshold: 0.9, reserveTokens: null, keepRecentSteps: 7, summarize: false });
    expect(resolveRouteCompaction(config, route, snapshot()).contextWindowTokens).toBe(300000);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN])("refuses invalid reserve %s", reserveTokens => {
    expect(() => resolveCompactionConfig({ reserveTokens })).toThrow(/Automatic compaction needs/);
  });

  it.each([
    { keepRecentTokens: 20000 },
    { modelOverrides: [{ providerId: "", model: "model" }] },
    { modelOverrides: [{ providerId: "provider", model: "" }] },
    { modelOverrides: [{ providerId: "provider", model: "model", unknownSetting: true }] }
  ])("refuses unknown fields or empty exact model identities %j", policy => {
    expect(() => resolveCompactionConfig(policy as Parameters<typeof resolveCompactionConfig>[0])).toThrow(/Automatic compaction needs/);
  });

  it("refuses duplicate model overrides instead of picking an arbitrary policy", () => {
    expect(() => resolveRouteCompaction({ modelOverrides: [{ ...route, summarize: true }, { ...route, summarize: false }] }, route, snapshot()))
      .toThrow(/duplicate.*compaction/i);
  });
});

function receipt(promptTokens: number, reserveTokens?: number) {
  return parseCompactionReceipt({ v: 2, mode: "replace", reason: "synthetic reserve policy", basis: {
    sessionId: "session", eventId: "basis", eventHash: "1".repeat(64), seq: 1
  }, sources: [{ originEventId: "origin", sourceEventId: "origin", sourceEventHash: "2".repeat(64), payloadSha256: "3".repeat(64), bytes: 8192 }],
  replacedBytes: 8192, replacementBytes: 192, savedBytes: 8000, measurement: "payload-bytes-not-tokens", trigger: {
    kind: "automatic", promptTokens, contextWindowTokens: 200000, threshold: 0.8, ratio: promptTokens / 200000,
    measuredAtEventId: "measured", formula: "inputTokens+cacheRead+cacheWrite", ...(reserveTokens === undefined ? {} : { reserveTokens })
  } });
}
function measured(promptTokens: number) {
  return new Map([["measured", { id: "measured", event_type: "step/end", session_id: "session", meta_json: JSON.stringify({
    usage: { inputTokens: promptTokens, outputTokens: 1, cacheRead: null, cacheWrite: null }
  }) } as EvidenceEvent]]);
}

describe("reserve triggers remain authenticated during replay", () => {
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("refuses malformed receipt reserve %s", reserve => {
    expect(() => receipt(183616, reserve)).toThrow(/complete measurement receipt/);
  });

  it.each([200000, 200001])("refuses a receipt reserve that consumes the whole context window: %s", reserve => {
    expect(() => receipt(0, reserve)).toThrow(/complete measurement receipt/);
  });

  it("accepts the exact reserve boundary and rejects an earlier forged trigger", () => {
    expect(() => assertAutomaticProvenance(receipt(183616, 16384), measured(183616), "session")).not.toThrow();
    expect(() => assertAutomaticProvenance(receipt(183615, 16384), measured(183615), "session")).toThrow(/trigger disagrees/);
  });

  it("accepts a declared large reserve below the legacy ratio but still checks measured usage", () => {
    expect(() => assertAutomaticProvenance(receipt(150000, 50000), measured(150000), "session")).not.toThrow();
    expect(() => assertAutomaticProvenance(receipt(150000, 50000), measured(149999), "session")).toThrow(/trigger disagrees/);
    expect(() => assertAutomaticProvenance(receipt(150000), measured(150000), "session")).toThrow(/trigger disagrees/);
  });
});
