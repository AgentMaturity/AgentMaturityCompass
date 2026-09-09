import { describe, expect, it } from "vitest";
import { projectNativeRunUsage, renderNativeRunUsage } from "../src/agent/nativeRunUsage.js";
import type { EvidenceEvent } from "../src/types.js";

// Explicit projection fixtures, not real provider measurements or signed proofs.
const sessionId = "usage-fixture";
function event(id: string, type: EvidenceEvent["event_type"], meta: Record<string, unknown>, session = sessionId): EvidenceEvent {
  return { id, event_type: type, session_id: session, meta_json: JSON.stringify(meta) } as EvidenceEvent;
}
function header(id: string, providerId = "openai"): EvidenceEvent {
  return event(id, "request/header", { providerId, model: "fixture-model", params: {}, encoderId: "fixture-encoder", encoderVersion: 1,
    systemPromptEventId: "prompt", toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: "message",
    projectionDigest: "fixture-projection-digest", sourceEventIds: ["prompt", "message"], requestDigest: `digest-${id}` });
}
function outcome(id: string, usage?: Record<string, unknown>, extra: Record<string, unknown> = {}, type: "request/response" | "request/failure" = "request/response"): EvidenceEvent {
  return event(`${id}-outcome`, type, { headerEventId: id, requestDigest: `digest-${id}`, providerId: "openai",
    outcome: type === "request/response" ? "completed" : "failed", ...(usage === undefined ? {} : { usage }), ...extra });
}
const reported = (extra: Record<string, unknown> = {}) => ({ reported: true, complete: true, inputTokens: 20, outputTokens: 8,
  cacheReadTokens: 60, cacheWriteTokens: 20, reasoningTokens: 3, ...extra });

describe("recorded native usage visibility", () => {
  it("uses disjoint input and cache counts without adding output reasoning twice", () => {
    const result = projectNativeRunUsage([header("a"), outcome("a", reported())], sessionId);
    expect(result.status).toBe("recorded");
    expect(result.totals.inputTokens.observedTokens).toBe(20);
    expect(result.totals.outputTokens.observedTokens).toBe(8);
    expect(result.totals.reasoningTokens.observedTokens).toBe(3);
    expect(result.cache).toMatchObject({ readTokens: 60, inputTokens: 100, readShare: 0.6, eligibleRequests: 1, excludedRequests: 0 });
    expect(renderNativeRunUsage(result)).toContain("60.00% (60/100 tokens");
  });
  it("retains nullable cache counts and labels the exact denominator coverage", () => {
    const result = projectNativeRunUsage([header("a"), outcome("a", reported({ cacheWriteTokens: null }))], sessionId);
    expect(result.totals.cacheWriteTokens).toEqual({ observedTokens: null, reportedRequests: 0 });
    expect(result.cache).toMatchObject({ readShare: 0.75, inputTokens: 80, unreportedWriteRequests: 1 });
    expect(renderNativeRunUsage(result)).toContain("cache write unreported");
    expect(renderNativeRunUsage(result)).toContain("1 eligible reports omit cache-write counts");
    expect(renderNativeRunUsage(result)).toContain("not an all-request hit probability");
  });
  it("counts failed reported subtotals and a retry separately, never a step/end copy", () => {
    const rows = [header("failed"), outcome("failed", reported({ complete: false, inputTokens: 5 }), {}, "request/failure"),
      header("retry"), outcome("retry", reported()), event("step", "step/end", { usage: reported() }), header("pending")];
    const result = projectNativeRunUsage(rows, sessionId);
    expect(result).toMatchObject({ status: "partial", requests: 3, reportedRequests: 2, completeRequests: 1, pendingRequests: 1, unreportedRequests: 1 });
    expect(result.totals.inputTokens.observedTokens).toBe(25);
    expect(result.cache).toMatchObject({ eligibleRequests: 1, excludedRequests: 2, readShare: 0.6 });
  });
  it.each([undefined, { inputTokens: 0, outputTokens: 0 }, { inputTokens: 7, outputTokens: 2 },
    reported({ reported: false, complete: false, inputTokens: 0, outputTokens: 0 })])("does not invent provenance for missing/historical usage: %j", usage => {
    const result = projectNativeRunUsage([header("a"), outcome("a", usage)], sessionId);
    expect(result.status).toBe("unavailable");
    expect(result.reportedRequests).toBe(0);
    expect(result.totals.inputTokens.observedTokens).toBeNull();
    expect(result.cache.readShare).toBeNull();
  });
  it("keeps measured zero distinct from missing usage and does not divide by zero", () => {
    const result = projectNativeRunUsage([header("a"), outcome("a", reported({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }))], sessionId);
    expect(result.status).toBe("recorded");
    expect(result.totals.cacheReadTokens).toEqual({ observedTokens: 0, reportedRequests: 1 });
    expect(result.cache.readShare).toBeNull();
    expect(renderNativeRunUsage(result)).not.toContain("0.00%");
  });
  it("shows no cache rate when the provider did not report cache reads", () => {
    const result = projectNativeRunUsage([header("a"), outcome("a", reported({ cacheReadTokens: null }))], sessionId);
    expect(result.totals.cacheReadTokens.observedTokens).toBeNull();
    expect(result.cache).toMatchObject({ readShare: null, eligibleRequests: 0, excludedRequests: 1 });
  });
  it("excludes the explicit local demonstration from provider/cache measurements", () => {
    const result = projectNativeRunUsage([header("a", "stub"), outcome("a", reported(), { providerId: "stub" })], sessionId);
    expect(result).toMatchObject({ status: "unavailable", requests: 1, syntheticRequests: 1, reportedRequests: 0 });
    expect(result.totals.cacheReadTokens.observedTokens).toBeNull();
    expect(renderNativeRunUsage(result)).toContain("1 local demonstration requests excluded");
  });
  it("ignores a different session rather than mixing its reports into this one", () => {
    const foreign = [header("foreign"), outcome("foreign", reported())].map(row => ({ ...row, session_id: "other" }));
    const result = projectNativeRunUsage([...foreign, header("a"), outcome("a", reported())], sessionId);
    expect(result.requests).toBe(1);
    expect(result.totals.cacheReadTokens.observedTokens).toBe(60);
  });
  it.each([
    [header("a"), outcome("a", reported()), outcome("a", reported())],
    [header("a"), header("a"), outcome("a", reported())],
    [outcome("orphan", reported())],
    [header("a"), outcome("a", reported(), { requestDigest: "different" })],
    [header("a"), outcome("a", reported(), { providerId: "different" })],
    [header("a"), outcome("a", reported(), { outcome: "failed" })],
    [event("broken", "request/header", {})]
  ])("withholds all totals and rate for invalid request linkage", (...rows) => {
    const result = projectNativeRunUsage(rows, sessionId);
    expect(result.status).toBe("invalid");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.totals.cacheReadTokens.observedTokens).toBeNull();
    expect(result.cache.readShare).toBeNull();
    expect(renderNativeRunUsage(result)).toContain("no cache rate was computed");
  });
  it.each([{ inputTokens: -1 }, { outputTokens: 0.5 }, { cacheReadTokens: "60" }, { reasoningTokens: 9 },
    { inputTokens: Number.MAX_SAFE_INTEGER + 1 }, { reported: "true" }, { complete: "true" }])("withholds invalid usage counts/provenance: %j", extra => {
    const result = projectNativeRunUsage([header("a"), outcome("a", reported(extra))], sessionId);
    expect(result.status).toBe("invalid");
    expect(result.totals.inputTokens.observedTokens).toBeNull();
    expect(result.cache.readShare).toBeNull();
  });
  it("does not round an unsafe aggregate into a purported exact measurement", () => {
    const result = projectNativeRunUsage([header("a"), outcome("a", reported({ inputTokens: Number.MAX_SAFE_INTEGER })),
      header("b"), outcome("b", reported())], sessionId);
    expect(result.status).toBe("invalid");
    expect(result.issues.some(issue => issue.code === "USAGE_TOTAL_OVERFLOW")).toBe(true);
    expect(result.cache.readShare).toBeNull();
  });
  it("renders older serialized summaries as unavailable rather than zero", () => {
    expect(renderNativeRunUsage(undefined)).toContain("unavailable");
    expect(renderNativeRunUsage(undefined)).not.toContain("0%");
  });
  it.each([null, {}, { scope: "recorded-session", status: "recorded" }])("does not crash or invent counts for a malformed serialized projection: %j", value => {
    expect(renderNativeRunUsage(value)).toContain("unsupported or malformed");
    expect(renderNativeRunUsage(value)).not.toContain("%");
  });
});
