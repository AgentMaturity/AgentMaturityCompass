import { describe, expect, it } from "vitest";
import { projectNativeRunUsage, renderNativeRunUsage } from "../src/agent/nativeRunUsage.js";
import type { EvidenceEvent } from "../src/types.js";

// Authored, UNEXECUTED. Declared metadata fixtures are not live cache measurements.
const sessionId = "p01-usage-fixture";
function rows(index: number, extra: Record<string, unknown> = {}): EvidenceEvent[] {
  const id = `request-${index}`;
  const event = (eventId: string, event_type: EvidenceEvent["event_type"], meta: Record<string, unknown>) =>
    ({ id: eventId, session_id: sessionId, event_type, meta_json: JSON.stringify(meta) }) as EvidenceEvent;
  return [event(id, "request/header", { providerId: "openai", model: `model-${index}`, params: {},
    encoderId: "openai-chat", encoderVersion: 3, systemPromptEventId: "prompt", toolSchemaEventId: null, toolSchemaSha256: null,
    projectionCutoffEventId: "message", projectionDigest: "fixture-projection", sourceEventIds: ["prompt", "message"], requestDigest: `digest-${id}` }),
  event(`${id}-outcome`, "request/response", { headerEventId: id, requestDigest: `digest-${id}`, providerId: "openai",
    adapterId: "openai-chat", adapterVersion: 3, dispatchAttempted: true, outcome: "completed",
    usage: { reported: true, complete: true, inputTokens: 20, outputTokens: 8, cacheReadTokens: 60, cacheWriteTokens: 20, reasoningTokens: 3, ...extra } })];
}

describe("P01 recent usage and truthful serialized token shares", () => {
  it("shows the latest routes in chronological order without changing cumulative totals or JSON history", () => {
    const usage = projectNativeRunUsage(Array.from({ length: 12 }, (_, index) => rows(index)).flat(), sessionId);
    const original = JSON.stringify(usage);
    const text = renderNativeRunUsage(usage, { requestWindow: "latest" });
    expect(text).toContain("model model-11;");
    expect(text).toContain("request/header request-11;");
    expect(text).not.toContain("request/header request-0;");
    expect(text.indexOf("request/header request-2;")).toBeLessThan(text.indexOf("request/header request-11;"));
    expect(text).toContain("2 earlier request identities omitted");
    expect(text).toContain("100.00% (12/12 eligible completed requests)");
    expect(text).toContain("remain cumulative for the session");
    expect(JSON.stringify(usage)).toBe(original);
    const legacyView = renderNativeRunUsage(usage);
    expect(legacyView).toContain("request/header request-0;");
    expect(legacyView).not.toContain("request/header request-11;");
  });

  it.each([
    { readShare: 0.99 }, { readTokens: 70 }, { inputTokens: 200 },
    { eligibleRequests: 2 }, { excludedRequests: 1 }, { unreportedWriteRequests: 2 },
    { readShare: 0, readTokens: 0, inputTokens: 0 }, { eligibleRequests: 0 }
  ])("withholds a serialized token rate that disagrees with its supporting subtotal: %j", changed => {
    const usage = projectNativeRunUsage(rows(0), sessionId);
    const text = renderNativeRunUsage({ ...usage, cache: { ...usage.cache, ...changed } });
    expect(text).toContain("Cache-read share: unavailable (serialized token subtotal");
    expect(text).not.toContain("Cache-read share of reported input:");
  });

  it("preserves old aggregate-only token shares without inventing request-hit evidence", () => {
    const usage = projectNativeRunUsage(rows(0), sessionId);
    const { requestReports: _reports, requestCache: _cache, ...legacy } = usage;
    const text = renderNativeRunUsage(legacy, { requestWindow: "latest" });
    expect(text).toContain("60.00% (60/100 tokens");
    expect(text).toContain("identity and request cache-hit rate: unavailable");
    expect(text).not.toContain("100.00%");
  });

  it("keeps a known zero request miss separate from an unavailable token denominator", () => {
    const usage = projectNativeRunUsage(rows(0, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }), sessionId);
    const text = renderNativeRunUsage(usage, { requestWindow: "latest" });
    expect(text).toContain("Request cache-read hit rate: 0.00% (0/1");
    expect(text).toContain("Cache-read share: unavailable (no positive eligible reported-input subtotal)");
    expect(text).not.toContain("serialized token subtotal");
  });
});
