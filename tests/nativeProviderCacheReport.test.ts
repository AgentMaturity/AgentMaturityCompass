import { describe, expect, it } from "vitest";
import { projectNativeRunUsage, renderNativeRunUsage } from "../src/agent/nativeRunUsage.js";
import { renderRunSummary, type AgentRunSummary } from "../src/agent/runReport.js";
import type { EvidenceEvent } from "../src/types.js";

// AUTHORED UNEXECUTED in task12. These are declared metadata fixtures, not live
// provider/cache measurements or signed-history/adapter qualification.
const sessionId = "provider-cache-fixture";
function event(id: string, event_type: EvidenceEvent["event_type"], meta: Record<string, unknown>): EvidenceEvent {
  return { id, session_id: sessionId, event_type, meta_json: JSON.stringify(meta) } as EvidenceEvent;
}
function header(id: string, extra: Record<string, unknown> = {}): EvidenceEvent {
  return event(id, "request/header", { providerId: "openai", model: "org/model:tag", params: {},
    encoderId: "openai-chat", encoderVersion: 3, systemPromptEventId: "prompt",
    toolSchemaEventId: null, toolSchemaSha256: null, projectionCutoffEventId: "message",
    projectionDigest: "fixture-projection", sourceEventIds: ["prompt", "message"], requestDigest: `digest-${id}`, ...extra });
}
function outcome(request: EvidenceEvent, usage?: Record<string, unknown>, extra: Record<string, unknown> = {},
  type: "request/response" | "request/failure" = "request/response"): EvidenceEvent {
  const meta = JSON.parse(request.meta_json);
  return event(`${request.id}-outcome`, type, { headerEventId: request.id, requestDigest: meta.requestDigest,
    providerId: meta.providerId, adapterId: "openai-chat", adapterVersion: 3, dispatchAttempted: true,
    outcome: type === "request/response" ? "completed" : "failed", ...(usage === undefined ? {} : { usage }), ...extra });
}
const reported = (extra: Record<string, unknown> = {}) => ({ reported: true, complete: true,
  inputTokens: 20, outputTokens: 8, cacheReadTokens: 60, cacheWriteTokens: 20, reasoningTokens: 3, ...extra });
function summary(rows: EvidenceEvent[]): AgentRunSummary {
  return { sessionId, driverStatus: "idle", events: rows.length, turns: 0, steps: 0,
    requests: rows.filter(row => row.event_type === "request/header").length, retried: 0, retriesAbandoned: 0,
    toolCalls: 0, endings: [], assistantText: [], unsignedRows: rows.length,
    validation: { status: "not-requested", turn: null, configSha256: null, checks: [] },
    usage: projectNativeRunUsage(rows, sessionId) };
}

describe("native recorded provider and request-cache presentation", () => {
  it("projects exact header/outcome provenance, not a current route or aggregate token guess", () => {
    const request = header("selected");
    const result = summary([request, outcome(request, reported())]);
    expect(result.usage?.requestReports).toEqual([{
      headerEventId: "selected", outcomeEventId: "selected-outcome", providerId: "openai", model: "org/model:tag",
      encoderId: "openai-chat", encoderVersion: 3, adapterId: "openai-chat", adapterVersion: 3,
      outcome: "completed", dispatchAttempted: true, usageStatus: "complete", cacheReadTokens: 60
    }]);
    expect(result.usage?.cache.readShare).toBe(0.6);
    expect(result.usage?.requestCache).toEqual({ basis: "completed-requests-with-reported-cache-read",
      hitRequests: 1, eligibleRequests: 1, excludedRequests: 0, hitRate: 1 });
    const text = renderRunSummary(result);
    expect(text).toContain("provider openai; model org/model:tag");
    expect(text).toContain("encoder openai-chat@3; adapter openai-chat@3");
    expect(text).toContain("request/header selected; outcome selected-outcome");
    expect(text).toContain("60.00% (60/100 tokens");
    expect(text).toContain("Request cache-read hit rate: 100.00% (1/1");
    expect(text).toContain("not remote identity or capability proof");
  });

  it("keeps provider/model changes, failed subtotals, missing usage and retry boundaries separate", () => {
    const hit = header("hit"), miss = header("miss", { providerId: "anthropic", model: "other-model", encoderId: "anthropic-messages" });
    const failed = header("failed"), noCache = header("no-cache"), missing = header("missing"), pending = header("pending");
    const stub = header("stub", { providerId: "stub" });
    const rows = [hit, outcome(hit, reported()), miss, outcome(miss, reported({ inputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: null }),
      { adapterId: "anthropic-messages" }), failed, outcome(failed, reported({ complete: false, cacheReadTokens: 70 }), {}, "request/failure"),
      noCache, outcome(noCache, reported({ cacheReadTokens: null })), missing, outcome(missing), pending,
      stub, outcome(stub, reported()), event("copy", "step/end", { usage: reported() })];
    const result = projectNativeRunUsage(rows, sessionId);
    expect(result).toMatchObject({ status: "partial", requests: 7, syntheticRequests: 1, reportedRequests: 4,
      completeRequests: 3, pendingRequests: 1 });
    expect(result.cache).toMatchObject({ readShare: 0.4, readTokens: 60, inputTokens: 150 });
    expect(result.requestCache).toMatchObject({ hitRequests: 1, eligibleRequests: 2, excludedRequests: 4, hitRate: 0.5 });
    expect(result.requestReports?.find(row => row.headerEventId === "failed")).toMatchObject({ outcome: "failed", usageStatus: "partial", cacheReadTokens: 70 });
    expect(result.requestReports?.find(row => row.headerEventId === "pending")).toMatchObject({ outcome: "pending", outcomeEventId: null, usageStatus: "unavailable" });
    const text = renderNativeRunUsage(result);
    expect(text).toContain("provider anthropic; model other-model");
    expect(text).toContain("Request cache-read hit rate (eligible subset): 50.00% (1/2");
    expect(text).toContain("4 provider requests excluded");
    expect(text).toContain("1 failed; 1 partial usage reports");
  });

  it.each([undefined, { inputTokens: 0, outputTokens: 0 }, reported({ reported: false, complete: false }),
    reported({ complete: false }), reported({ cacheReadTokens: null })])("does not infer a hit/miss denominator from unavailable fields: %j", usage => {
    const request = header("missing");
    const result = projectNativeRunUsage([request, outcome(request, usage, { cacheHit: true, cachedTokens: 100 })], sessionId);
    expect(result.requestCache).toMatchObject({ hitRate: null, eligibleRequests: 0, excludedRequests: 1 });
    expect(renderNativeRunUsage(result)).toContain("Request cache-read hit rate: unavailable");
  });

  it("counts an explicitly reported zero as a request miss without inventing a positive token denominator", () => {
    const request = header("zero");
    const result = projectNativeRunUsage([request, outcome(request, reported({ inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }))], sessionId);
    expect(result.cache.readShare).toBeNull();
    expect(result.requestCache).toMatchObject({ hitRate: 0, eligibleRequests: 1, hitRequests: 0 });
    expect(renderNativeRunUsage(result)).toContain("Request cache-read hit rate: 0.00% (0/1");
  });

  it("does not mistake cache writes for request hits or add reasoning to output totals", () => {
    const request = header("write-only");
    const result = projectNativeRunUsage([request, outcome(request, reported({ cacheReadTokens: 0, cacheWriteTokens: 60 }))], sessionId);
    expect(result.requestCache).toMatchObject({ hitRequests: 0, eligibleRequests: 1, hitRate: 0 });
    expect(result.cache).toMatchObject({ readTokens: 0, inputTokens: 80, readShare: 0 });
    expect(result.totals.outputTokens.observedTokens).toBe(8);
    expect(result.totals.reasoningTokens.observedTokens).toBe(3);
  });

  it("does not upgrade failed usage to complete just because its token fields are present", () => {
    const request = header("failed");
    const result = projectNativeRunUsage([request, outcome(request, reported(), {}, "request/failure")], sessionId);
    expect(result.status).toBe("invalid");
    expect(result.issues).toContainEqual({ eventId: "failed-outcome", code: "USAGE_PROVENANCE_INVALID" });
    expect(result.requestCache?.hitRate).toBeNull();
    expect(renderNativeRunUsage(result)).toContain("no cache rate was computed");
  });

  it.each([{ dispatchAttempted: false }, { dispatchAttempted: "yes" }])("rejects contradictory or malformed dispatch provenance: %j", extra => {
    const request = header("dispatch");
    const result = projectNativeRunUsage([request, outcome(request, reported(), extra)], sessionId);
    expect(result.status).toBe("invalid");
    expect(result.requestCache?.hitRate).toBeNull();
  });

  it("keeps missing historical adapter identity and dispatch provenance unavailable", () => {
    const request = header("historical");
    const result = projectNativeRunUsage([request, outcome(request, { inputTokens: 0, outputTokens: 0 },
      { adapterId: undefined, adapterVersion: undefined, dispatchAttempted: undefined })], sessionId);
    expect(result.requestReports?.[0]).toMatchObject({ providerId: "openai", model: "org/model:tag",
      adapterId: null, adapterVersion: null, dispatchAttempted: null, usageStatus: "unavailable" });
    expect(renderNativeRunUsage(result)).toContain("adapter unavailable/withheld@unavailable/withheld");
  });

  it("never forwards credential objects, URL-shaped labels, parameters or provider failure text", () => {
    const secret = "fixture-secret-value-not-a-real-key";
    const url = `https://user:${secret}@private.invalid/path?token=${secret}`;
    const request = header("safe-id", { providerId: url, model: url, encoderId: "bad\nlabel",
      params: { apiKey: secret, endpoint: url }, credentialRef: url });
    const result = summary([request, outcome(request, reported({ complete: false }), {
      adapterId: "sk-fixture-secret-label", credential: { ref: url, value: secret, source: url },
      failure: { message: secret, requestId: url }, endpoint: url
    }, "request/failure")]);
    const encoded = JSON.stringify(result), text = renderRunSummary(result);
    for (const output of [encoded, text]) {
      expect(output).not.toContain(secret);
      expect(output).not.toContain("private.invalid");
      expect(output).not.toContain("bad\\nlabel");
      expect(output).not.toContain("sk-fixture-secret-label");
      expect(output).not.toContain("credentialRef");
    }
    expect(result.usage?.requestReports?.[0]).toMatchObject({ providerId: null, model: null, encoderId: null, adapterId: null });
    expect(text).toContain("unavailable/withheld");
  });

  it("does not echo unsafe event identifiers as evidence links", () => {
    const request = header("https://private.invalid/token");
    const result = projectNativeRunUsage([request, outcome(request, reported())], sessionId);
    expect(result.requestReports?.[0]).toMatchObject({ headerEventId: null, outcomeEventId: null });
    expect(JSON.stringify(result)).not.toContain("private.invalid");
  });

  it("does not derive request hits or identities for older serialized projections", () => {
    const request = header("old"), result = projectNativeRunUsage([request, outcome(request, reported())], sessionId);
    const { requestReports: _reports, requestCache: _cache, ...old } = result;
    expect(renderNativeRunUsage(old)).toContain("identity and request cache-hit rate: unavailable");
    expect(renderNativeRunUsage(old)).toContain("60.00% (60/100 tokens");
  });

  it("withholds serialized request rates whose numerator, denominator or records disagree", () => {
    const request = header("serialization"), result = projectNativeRunUsage([request, outcome(request, reported())], sessionId);
    for (const value of [
      { ...result, requestCache: { ...result.requestCache, hitRate: 0 } },
      { ...result, requestCache: { ...result.requestCache, eligibleRequests: 2 } },
      { ...result, cache: { ...result.cache, eligibleRequests: 2 } },
      { ...result, requestReports: [] },
      { ...result, requestReports: [{ ...result.requestReports![0], model: "https://private.invalid" }] }
    ]) expect(renderNativeRunUsage(value)).toContain("identity and request cache-hit rate: unavailable");
  });

  it("rejects duplicated request references in a serialized projection even when aggregate counts agree", () => {
    const first = header("first"), second = header("second");
    const result = projectNativeRunUsage([first, outcome(first, reported()), second, outcome(second, reported())], sessionId);
    const duplicated = { ...result, requestReports: [result.requestReports![0], result.requestReports![0]] };
    expect(renderNativeRunUsage(duplicated)).toContain("identity and request cache-hit rate: unavailable");
  });

  it("withholds the new rate on duplicate outcomes and ignores other sessions", () => {
    const request = header("linked"), response = outcome(request, reported());
    const invalid = projectNativeRunUsage([request, response, response], sessionId);
    expect(invalid.status).toBe("invalid");
    expect(invalid.requestCache?.hitRate).toBeNull();
    const foreign = [request, response].map(row => ({ ...row, session_id: "other" }));
    const result = projectNativeRunUsage(foreign, sessionId);
    expect(result.requestReports).toEqual([]);
    expect(result.requestCache).toMatchObject({ eligibleRequests: 0, hitRate: null });
  });

  it("bounds text identity output while JSON preserves every actual request reference", () => {
    const rows = Array.from({ length: 12 }, (_, index) => {
      const request = header(`request-${index}`);
      return [request, outcome(request, reported())];
    }).flat();
    const result = projectNativeRunUsage(rows, sessionId);
    expect(result.requestReports).toHaveLength(12);
    expect(renderNativeRunUsage(result)).toContain("2 further request identities omitted from text");
    expect(renderNativeRunUsage(result)).not.toContain("request/header request-11;");
    expect(JSON.stringify(result)).toContain("request-11-outcome");
  });
});
