import { assertAutomaticProvenance, PROMPT_TOKENS_FORMULA, surfaceCompactionReceiptSchema } from "../src/session/surfaceCompactionValidation.js";
import { LocalCredentialsService } from "../src/credentials/localCredentialsService.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { LlmRuntime } from "../src/llm/adapter/llmRuntime.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { okStream, stubUpstream } from "./helpers/llmStubUpstream.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createModelMetadataSnapshot } from "../src/llm/modelCatalog.js";
import { estimateNativeUsage, projectNativeCost, renderNativeCost } from "../src/budgets/nativeCostProjection.js";
import { MODEL_PRICING } from "../src/product/modelPricing.js";
import { projectNativeRunUsage, renderNativeRunUsage } from "../src/agent/nativeRunUsage.js";
import { stepUsage } from "../src/agent/stepRunner.js";
import { buildStepEndMeta } from "../src/session/turnLifecycleMeta.js";
import { parseRequestHeaderMeta, pinnedHeaderMetadata } from "../src/session/requestHeaderMeta.js";
import { SessionService } from "../src/session/sessionService.js";
import { initWorkspace } from "../src/workspace.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

const sessionId = "cost-fixture";
const unavailableCost = "Native cost: unavailable (older or invalid cost projection).";
const usage = (extra: Record<string, unknown> = {}) => ({ reported: true, complete: true, inputTokens: 1000,
  outputTokens: 100, cacheReadTokens: 1000, cacheWriteTokens: 0, reasoningTokens: 50, ...extra });
const snapshot = () => createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!;
function event(id: string, event_type: EvidenceEvent["event_type"], meta: Record<string, unknown>): EvidenceEvent {
  return { id, event_type, session_id: sessionId, meta_json: JSON.stringify(meta) } as EvidenceEvent;
}
function header(id: string, modelMetadata: unknown = snapshot()) {
  return event(id, "request/header", { providerId: "openai", model: "gpt-4o", encoderId: "openai-chat", encoderVersion: 4,
    params: {}, systemPromptEventId: "prompt", toolSchemaEventId: null, toolSchemaSha256: null,
    projectionCutoffEventId: "message", projectionDigest: "projection", sourceEventIds: ["prompt", "message"],
    requestDigest: `digest-${id}`, modelMetadata });
}
function outcome(id: string, values: unknown = usage(), failed = false) {
  return event(`${id}-outcome`, failed ? "request/failure" : "request/response", { headerEventId: id,
    requestDigest: `digest-${id}`, providerId: "openai", adapterId: "openai-chat", adapterVersion: 4,
    outcome: failed ? "failed" : "completed", dispatchAttempted: true, usage: values });
}

describe("automatic compaction usage reader compatibility", () => {
  const counts = { inputTokens: 10, outputTokens: 10, cacheRead: 2, cacheWrite: 1 };
  const receipt = surfaceCompactionReceiptSchema.parse({
    v: 2, mode: "drop", reason: "Prune an older tool result after measured prompt pressure.",
    basis: { sessionId, eventId: "measured-step", eventHash: "a".repeat(64), seq: 1 },
    sources: [{ originEventId: "old-tool", sourceEventId: "old-tool", sourceEventHash: "b".repeat(64),
      payloadSha256: "c".repeat(64), bytes: 100 }],
    replacedBytes: 100, replacementBytes: 0, savedBytes: 100, measurement: "payload-bytes-not-tokens",
    trigger: { kind: "automatic", promptTokens: 13, contextWindowTokens: 16, threshold: 0.8,
      ratio: 13 / 16, measuredAtEventId: "measured-step", formula: PROMPT_TOKENS_FORMULA }
  });
  const assertStepUsage = (meta: Record<string, unknown>) => assertAutomaticProvenance(receipt,
    new Map([["measured-step", event("measured-step", "step/end", meta)]]), sessionId);

  it("accepts legacy usage without a version and version 2 reasoning without counting output twice", () => {
    expect(() => assertStepUsage({ usage: counts })).not.toThrow();
    expect(() => assertStepUsage({ usageVersion: 2, usage: { ...counts, reasoningTokens: null } })).not.toThrow();
    expect(() => assertStepUsage({ usageVersion: 2, usage: { ...counts, reasoningTokens: 7 } })).not.toThrow();
  });
  it.each([-1, 11, 0.5, Number.MAX_SAFE_INTEGER + 1])("refuses invalid reasoning subset %s", reasoningTokens => {
    expect(() => assertStepUsage({ usageVersion: 2, usage: { ...counts, reasoningTokens } }))
      .toThrow("automatic compaction trigger disagrees with the signed step usage it cites");
  });
  it.each([1, 3, null, "2"])("refuses unsupported usage version %j", usageVersion => {
    expect(() => assertStepUsage({ usageVersion, usage: counts }))
      .toThrow("automatic compaction trigger disagrees with the signed step usage it cites");
  });
});

describe("native versioned cost projection", () => {
  it.each(["https://private.invalid/token", "sk-live-private", "bad\nidentifier"])("withholds unsafe cost evidence reference %j", id => {
    const result = projectNativeCost([header(id), outcome(id)], sessionId);
    expect(result.status).toBe("invalid");
    expect(result.requests[0]?.headerEventId).toBeNull();
    expect(result.requests[0]?.outcomeEventId).toBeNull();
    expect(result.estimatedSubtotalUsd).toBeNull();
    expect(result.attributedSubtotalUsd).toBeNull();
    expect(JSON.stringify(result)).not.toContain(JSON.stringify(id).slice(1, -1));
  });
  it("prices disjoint cache tokens and does not charge reasoning twice", () => {
    const result = estimateNativeUsage(snapshot(), usage());
    expect(result).toMatchObject({ estimatedCostUsd: 0.00475, estimateComplete: true });
  });
  it("keeps unknown cache rates and missing counts visible with a partial subtotal", () => {
    expect(estimateNativeUsage(snapshot(), usage({ cacheWriteTokens: 20 }))).toMatchObject({ estimateComplete: false });
    expect(estimateNativeUsage(snapshot(), usage({ cacheReadTokens: null }))).toMatchObject({ estimatedCostUsd: 0.0035, estimateComplete: false });
    expect(estimateNativeUsage(null, usage()).estimatedCostUsd).toBeNull();
    expect(estimateNativeUsage(snapshot(), usage({ reported: false })).estimatedCostUsd).toBeNull();
  });
  it("uses reported cost in preference to an independent catalog estimate", () => {
    const result = projectNativeCost([header("a"), outcome("a", usage({ costUsd: 0.2 }))], sessionId);
    expect(result.requests[0]).toMatchObject({ reportedCostUsd: 0.2, estimatedCostUsd: 0.00475,
      attributedCostUsd: 0.2, costBasis: "provider-reported" });
    expect(result).toMatchObject({ reportedSubtotalUsd: 0.2, estimatedSubtotalUsd: 0.00475, completeRequests: 1 });
    const native = projectNativeRunUsage([header("a"), outcome("a", usage({ costUsd: 0.2 }))], sessionId);
    expect(native.cost).toEqual(result);
    expect(renderNativeRunUsage(native)).toContain("Provider-reported cost");
    expect(renderNativeRunUsage(native)).toContain("Catalog estimate");
  });
  it("does not reprice history from today's mutable table", () => {
    const rows = [header("a"), outcome("a")];
    const price = MODEL_PRICING["gpt-4o"]!;
    const original = price.inputPer1kTokens;
    try {
      price.inputPer1kTokens = 999;
      expect(projectNativeCost(rows, sessionId).estimatedSubtotalUsd).toBeCloseTo(0.00475);
    } finally { price.inputPer1kTokens = original; }
    expect(projectNativeCost([header("old", null), outcome("old")], sessionId).estimatedSubtotalUsd).toBeNull();
  });
  it("retains failed partial usage and unknown pending coverage without claiming final cost", () => {
    const result = projectNativeCost([header("failed"), outcome("failed", usage({ complete: false }), true), header("pending")], sessionId);
    expect(result).toMatchObject({ completeRequests: 0, unknownRequests: 1, partialRequests: 1 });
    expect(result.requests[0]).toMatchObject({ estimatedCostUsd: 0.00475, estimateComplete: false, attributedCostUsd: null });
    expect(result.requests[1]).toMatchObject({ estimatedCostUsd: null, reportedCostUsd: null });
  });
  it.each([
    (rows: EvidenceEvent[]) => [...rows, rows[1]!],
    (rows: EvidenceEvent[]) => [rows[1]!],
    (rows: EvidenceEvent[]) => [rows[0]!, { ...rows[1]!, meta_json: rows[1]!.meta_json.replace("digest-a", "wrong") }],
    (rows: EvidenceEvent[]) => [rows[0]!, { ...rows[1]!, session_id: "other" }]
  ])("refuses invalid or duplicate outcomes instead of double counting", change => {
    const result = projectNativeCost(change([header("a"), outcome("a")]), sessionId);
    expect(result.completeRequests).toBe(0);
    expect(result.attributedSubtotalUsd).toBeNull();
  });
  it("rejects altered or provider-incompatible snapshot metadata", () => {
    const bad = { ...snapshot(), model: "different" };
    expect(parseRequestHeaderMeta(header("a", bad).meta_json)).toBeNull();
    expect(projectNativeCost([header("a", bad), outcome("a")], sessionId).estimatedSubtotalUsd).toBeNull();
  });
  it("selects a context price tier from all input classes, not just uncached tokens", () => {
    const { digest: _digest, ...base } = snapshot();
    const low = { upToInputTokens: 1000, inputPer1kTokens: 1, outputPer1kTokens: 2,
      cacheReadPer1kTokens: 0.1, cacheWritePer1kTokens: 1.25 };
    const value = { ...base, pricing: { ...base.pricing!, tiers: [low, { ...low, upToInputTokens: null, inputPer1kTokens: 2 }] } };
    const pinned = { ...value, digest: sha256Hex(canonicalize(value)) };
    expect(estimateNativeUsage(pinned, usage({ inputTokens: 900, cacheReadTokens: 200, outputTokens: 100 })).estimatedCostUsd).toBeCloseTo(2.02);
    expect(estimateNativeUsage(pinned, usage({ cacheWriteTokens: null })).estimatedCostUsd).toBeNull();
    expect(estimateNativeUsage(pinned, usage({ inputTokens: Number.MAX_SAFE_INTEGER, cacheReadTokens: 1 })).estimatedCostUsd).toBeNull();
  });
  it("shows stale snapshot provenance and preserves measured zero", () => {
    const result = projectNativeCost([header("a"), outcome("a", usage({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
      reasoningTokens: 0, costUsd: 0 }))], sessionId, Date.parse("2028-01-01T00:00:00Z"));
    expect(result.requests[0]).toMatchObject({ freshness: "stale", estimatedCostUsd: 0, reportedCostUsd: 0, attributedCostUsd: 0 });
  });
  it.each([
    { reported: false, complete: true, costUsd: 123 },
    { reported: true, complete: true, costUsd: 123, inputTokens: -1 },
    { reported: true, complete: true, costUsd: 123, reasoningTokens: 999 },
  ])("rejects malformed reported cost provenance: %j", extra => {
    const result = projectNativeCost([header("a"), outcome("a", usage(extra))], sessionId);
    expect(result.attributedSubtotalUsd).toBeNull();
    expect(result.completeRequests).toBe(0);
  });
  it("rejects malformed dispatch provenance before attributing cost", () => {
    const bad = outcome("a", usage({ costUsd: 123 }));
    bad.meta_json = bad.meta_json.replace('"dispatchAttempted":true', '"dispatchAttempted":"no"');
    expect(projectNativeCost([header("a"), bad], sessionId).attributedSubtotalUsd).toBeNull();
  });
  it("refuses serialized cost projections whose coverage or money contradict their request rows", () => {
    const valid = projectNativeCost([header("a"), outcome("a", usage({ costUsd: 0.2 }))], sessionId);
    expect(renderNativeCost({ ...valid, reportedSubtotalUsd: 999 })).toBe(unavailableCost);
    expect(renderNativeCost({ ...valid, requests: [] })).toBe(unavailableCost);
    expect(renderNativeCost({ ...valid, requests: [{ ...valid.requests[0], costBasis: "provider-reported", reportedCostUsd: null }] })).toBe(unavailableCost);
  });
  it("rejects duplicate settlement IDs across distinct requests", () => {
    const second = { ...outcome("b"), id: "a-outcome" };
    const result = projectNativeCost([header("a"), outcome("a"), header("b"), second], sessionId);
    expect(result.status).toBe("invalid");
    expect(result.attributedSubtotalUsd).toBeNull();
  });
  it("rejects evidence row identities shared by headers and outcomes", () => {
    const sameId = { ...outcome("a"), id: "a" };
    expect(projectNativeCost([header("a"), sameId], sessionId).status).toBe("invalid");
    const valid = projectNativeCost([header("a"), outcome("a")], sessionId);
    expect(renderNativeCost({ ...valid, requests: [{ ...valid.requests[0], outcomeEventId: "a" }] })).toBe(unavailableCost);
  });
  it("refuses serialized money without unique outcome references or with inverted reported precedence", () => {
    const valid = projectNativeCost([header("a"), outcome("a", usage({ costUsd: 0.2 }))], sessionId);
    expect(renderNativeCost({ ...valid, requests: [{ ...valid.requests[0], outcomeEventId: null }] })).toBe(unavailableCost);
    const changed = { ...valid.requests[0], costBasis: "catalog-estimate", attributedCostUsd: valid.requests[0]!.estimatedCostUsd };
    expect(renderNativeCost({ ...valid, attributedSubtotalUsd: changed.attributedCostUsd, requests: [changed] })).toBe(unavailableCost);
  });
  it("ages pricing provenance independently from model facts", () => {
    const { digest: _digest, ...base } = snapshot();
    const value = { ...base, pricing: { ...base.pricing!, asOf: "2020-01-01", source: "legacy-price-fixture" } };
    const pinned = { ...value, digest: sha256Hex(canonicalize(value)) };
    expect(projectNativeCost([header("a", pinned), outcome("a")], sessionId).requests[0]).toMatchObject({ freshness: "stale", asOf: "2020-01-01" });
  });
  it("changes selection identity when catalog data or request settings change, preserving the wire digest", () => {
    const params = { model: "gpt-4o", providerId: "openai", params: {}, encoderId: "openai-chat", encoderVersion: 4,
      systemPromptEventId: "prompt", toolSchema: null, projectionCutoffEventId: "cutoff", projectionDigest: "projection",
      sourceEventIds: [], requestBytes: "wire-bytes" };
    const initial = pinnedHeaderMetadata(params);
    const price = MODEL_PRICING["gpt-4o"]!;
    const original = price.outputPer1kTokens;
    try {
      price.outputPer1kTokens = original + 1;
      expect(pinnedHeaderMetadata(params).requestIdentityDigest).not.toBe(initial.requestIdentityDigest);
    } finally { price.outputPer1kTokens = original; }
    expect(pinnedHeaderMetadata({ ...params, params: { temperature: 0.5 } }).requestIdentityDigest).not.toBe(initial.requestIdentityDigest);
    const value = { ...JSON.parse(header("a").meta_json), ...initial, requestDigest: sha256Hex("wire-bytes") };
    expect(parseRequestHeaderMeta(JSON.stringify(value))).not.toBeNull();
    expect(parseRequestHeaderMeta(JSON.stringify({ ...value, requestIdentityDigest: "f".repeat(64) }))).toBeNull();
    expect(() => pinnedHeaderMetadata({ ...params, modelMetadata: { ...snapshot(), providerId: "other" } })).toThrow(/metadata/);
    expect(pinnedHeaderMetadata({ ...params, model: "unknown" }).modelMetadata).toBeNull();
  });
  it("returns unavailable rather than throwing while validating a deeply nested header identity", () => {
    const deep = '{"x":'.repeat(10000) + 'null' + '}'.repeat(10000);
    const json = header("a").meta_json.replace('"params":{}', '"params":' + deep)
      .replace('"requestDigest":', '"requestIdentityDigest":"' + 'f'.repeat(64) + '","requestDigest":');
    expect(() => parseRequestHeaderMeta(json)).not.toThrow();
    expect(parseRequestHeaderMeta(json)).toBeNull();
  });
  it("pins metadata in the actual session header without changing its wire digest", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-wp28-pin-"));
    let session: SessionService | undefined;
    try {
      initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
      session = new SessionService(dir);
      session.open({ agentId: "default", harnessVersion: "test", compositionDigest: "a".repeat(64), policyDigest: "b".repeat(64) });
      const prepared = session.recordRequestHeader({ model: "gpt-4o", providerId: "openai", params: {}, encoderId: "openai-chat",
        encoderVersion: 4, systemPromptEventId: "prompt", toolSchema: null, projectionCutoffEventId: "cutoff",
        projectionDigest: "projection", sourceEventIds: [], requestBytes: "wire-bytes" });
      const row = session.readEvents().find(value => value.id === prepared.headerEventId)!;
      const meta = parseRequestHeaderMeta(row.meta_json)!;
      expect(meta.modelMetadata?.digest).toBe(snapshot().digest);
      expect(meta.requestDigest).toBe(sha256Hex("wire-bytes"));
    } finally {
      session?.close({ reason: "completed" });
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("preserves optional reasoning detail in versioned step metadata", () => {
    const converted = stepUsage({ inputTokens: 1, outputTokens: 10, reasoningTokens: 7 });
    expect(converted?.reasoningTokens).toBe(7);
    const meta = buildStepEndMeta({ turn: 1, step: 1, stopReason: "stop", usage: converted, recoveredBy: null });
    expect(meta).toMatchObject({ usageVersion: 2, usage: { reasoningTokens: 7 } });
  });
  it("projects scripted native dispatch cost from the signed header snapshot and recorded outcome", async () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-wp28-runtime-"));
    let session: SessionService | undefined;
    let credentials: LocalCredentialsService | undefined;
    try {
      initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
      session = new SessionService(dir);
      session.open({ agentId: "default", harnessVersion: "wp28-scripted-runtime",
        compositionDigest: "a".repeat(64), policyDigest: "b".repeat(64) });
      const system = session.recordSystemPrompt("Scripted HTTP fixture; no live model or endpoint probe.");
      session.startTurn({ trigger: "user" });
      session.startStep();
      session.recordUserMessage("Return the scripted completion.");
      credentials = new LocalCredentialsService({ env: {}, projectDir: null,
        homeDir: join(dir, "empty-credentials"), includeDotenv: false, watch: false });
      const registry = new AdapterRegistry();
      registry.register({ providerId: "openai", adapter: openaiAdapter,
        baseUrl: "https://wp28-runtime.invalid", credentialRef: null, models: ["gpt-4o"] });
      const upstream = stubUpstream([() => okStream([
        { data: JSON.stringify({ choices: [{ index: 0, delta: { content: "Scripted answer." }, finish_reason: null }] }) },
        { data: JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) },
        { data: JSON.stringify({ choices: [], usage: { prompt_tokens: 2000, completion_tokens: 100,
          prompt_tokens_details: { cached_tokens: 1000 } } }) },
        { data: "[DONE]" }
      ])]);
      const runtime = new LlmRuntime({ session, credentials, registry, transport: upstream.transport });
      const call = runtime.prepare({ providerId: "openai", model: "gpt-4o", params: { max_tokens: 128 },
        systemPromptEventId: system.eventId, tools: null });
      expect(call.route).toMatchObject({ providerId: "openai", model: "gpt-4o", adapterId: "openai-chat" });
      expect(upstream.sent).toHaveLength(0);
      const headerRow = session.readEvents().find(row => row.id === call.headerEventId)!;
      const headerMeta = parseRequestHeaderMeta(headerRow.meta_json)!;
      expect(headerMeta.modelMetadata?.digest).toBe(snapshot().digest);
      expect(headerMeta.modelMetadata).toMatchObject({ providerId: "openai", model: "gpt-4o",
        protocol: "openai-chat-completions", modelSupport: "catalog-not-probed" });
      expect(headerMeta.requestDigest).toBe(call.requestDigest);
      for await (const _chunk of call.stream()) { /* Actual decoder, recorder, and signed settlement. */ }
      expect(upstream.sent).toHaveLength(1);
      expect(JSON.parse(upstream.sent[0]!.body.toString("utf8")).model).toBe("gpt-4o");
      expect(sha256Hex(upstream.sent[0]!.body)).toBe(call.requestDigest);
      const rows = session.readEvents();
      const outcomeRow = rows.find(row => row.id === call.settled?.outcomeEventId)!;
      expect(outcomeRow.event_type).toBe("request/response");
      expect(JSON.parse(outcomeRow.meta_json)).toMatchObject({ headerEventId: headerRow.id,
        requestDigest: call.requestDigest, providerId: "openai", outcome: "completed", dispatchAttempted: true,
        usage: { reported: true, complete: true, inputTokens: 1000, cacheReadTokens: 1000,
          outputTokens: 100, cacheWriteTokens: null } });
      const native = projectNativeRunUsage(rows, session.sessionId);
      expect(native.cost).toMatchObject({ status: "partial", estimatedSubtotalUsd: 0.00475,
        reportedSubtotalUsd: null, attributedSubtotalUsd: null, completeRequests: 0, partialRequests: 1, unknownRequests: 0 });
      expect(native.cost!.requests[0]).toMatchObject({ headerEventId: headerRow.id, outcomeEventId: outcomeRow.id,
        catalogDigest: headerMeta.modelMetadata!.digest, estimateComplete: false, missingComponents: ["cacheWriteTokens"] });
      expect(renderNativeRunUsage(native)).toContain("Catalog estimate subtotal (indicative, not billing): $0.004750");
      expect(renderNativeRunUsage(native)).toContain("Cost coverage: 0 complete, 1 partial, 0 unknown requests");
      session.endStep({ stopReason: "stop", usage: stepUsage(call.settled!.assembly.usage) });
      session.endTurn({ reason: "complete" });
      session.sealTurn();
      session.close({ reason: "fixture-completed" });
      session = undefined;
      const integrity = verifyLedgerIntegrity(dir);
      expect(integrity.chain.ok, integrity.chain.errors.join("\n")).toBe(true);
    } finally {
      session?.disposeWithoutClosing();
      await credentials?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
