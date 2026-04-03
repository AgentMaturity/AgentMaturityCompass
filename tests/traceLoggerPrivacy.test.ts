/**
 * AMC-441: Wire privacy tiers into telemetry/trace logging
 */
import { describe, expect, test, vi, afterEach } from "vitest";
import { buildTrace, logTrace } from "../src/runtime/traceLogger.js";

describe("trace logger privacy integration", () => {
  afterEach(() => {
    delete process.env.AMC_PRIVACY_TIER;
    delete process.env.AMC_PRIVACY_HASH_SALT;
    vi.restoreAllMocks();
  });

  test("full tier preserves note content", () => {
    process.env.AMC_PRIVACY_TIER = "full";
    const trace = buildTrace({
      agentId: "agent-1",
      event: "llm_call",
      providerId: "openai",
      model: "gpt-4",
      note: "prompt=What is the meaning of life? response=42",
    });

    expect(trace.note).toContain("meaning of life");
  });

  test("redacted tier hashes note content and removes raw note", () => {
    process.env.AMC_PRIVACY_TIER = "redacted";
    process.env.AMC_PRIVACY_HASH_SALT = "test-salt";

    const trace = buildTrace({
      agentId: "agent-1",
      event: "llm_call",
      providerId: "openai",
      model: "gpt-4",
      note: "prompt=What is the meaning of life? response=42",
    });

    expect(trace.note).toBeUndefined();
    expect(trace.hashes).toBeDefined();
    expect(Object.keys(trace.hashes ?? {}).length).toBeGreaterThan(0);
  });

  test("zero tier strips note content entirely but keeps structural fields", () => {
    process.env.AMC_PRIVACY_TIER = "zero";

    const trace = buildTrace({
      agentId: "agent-1",
      event: "llm_result",
      providerId: "openai",
      model: "gpt-4",
      note: "status=200;prompt=secret stuff;response=secret answer",
      request_id: "req-123",
      receipt: "receipt-456",
    });

    expect(trace.note).toBeUndefined();
    expect(trace.agentId).toBe("agent-1");
    expect(trace.providerId).toBe("openai");
    expect(trace.request_id).toBe("req-123");
    expect(trace.receipt).toBe("receipt-456");
  });

  test("logTrace emits sanitized output under redacted tier", () => {
    process.env.AMC_PRIVACY_TIER = "redacted";
    process.env.AMC_PRIVACY_HASH_SALT = "test-salt";

    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    logTrace({
      agentId: "agent-1",
      event: "llm_call",
      providerId: "openai",
      note: "Authorization: Bearer supersecret-token-value prompt=hello",
    });

    const logged = String(writeSpy.mock.calls[0]?.[0] ?? "");
    expect(logged).not.toContain("supersecret-token-value");
    expect(logged).not.toContain("prompt=hello");
    expect(logged).toContain("hashes");
  });
});
