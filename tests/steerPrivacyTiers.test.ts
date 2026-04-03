import { describe, expect, test } from "vitest";
import {
  sanitizeTelemetryEvent,
  validatePrivacyCompliance,
  type TelemetryEvent,
  type PrivacyConfig,
} from "../src/steer/privacyTiers.js";

const BASE_EVENT: TelemetryEvent = {
  eventId: "evt-001",
  agentId: "agent-1",
  timestamp: Date.now(),
  eventType: "llm_call",
  prompt: "What is the meaning of life?",
  response: "42",
  systemPrompt: "You are a helpful assistant.",
  model: "gpt-4",
  providerId: "openai",
  latencyMs: 150,
  tokenCount: 25,
  microScore: 0.85,
};

describe("sanitizeTelemetryEvent", () => {
  test("full tier preserves all content", () => {
    const config: PrivacyConfig = { tier: "full" };
    const result = sanitizeTelemetryEvent(BASE_EVENT, config);
    expect(result.prompt).toBe(BASE_EVENT.prompt);
    expect(result.response).toBe(BASE_EVENT.response);
    expect(result.systemPrompt).toBe(BASE_EVENT.systemPrompt);
    expect(result.privacyTier).toBe("full");
  });

  test("redacted tier replaces content with hashes", () => {
    const config: PrivacyConfig = { tier: "redacted" };
    const result = sanitizeTelemetryEvent(BASE_EVENT, config);
    expect(result.prompt).toBeUndefined();
    expect(result.response).toBeUndefined();
    expect(result.systemPrompt).toBeUndefined();
    expect(result.promptHash).toBeDefined();
    expect(result.responseHash).toBeDefined();
    expect(result.systemPromptHash).toBeDefined();
    expect(result.promptHash!.length).toBe(16);
    expect(result.redactedFields).toContain("prompt");
  });

  test("zero tier strips all content and hashes", () => {
    const config: PrivacyConfig = { tier: "zero" };
    const result = sanitizeTelemetryEvent(BASE_EVENT, config);
    expect(result.prompt).toBeUndefined();
    expect(result.response).toBeUndefined();
    expect(result.systemPrompt).toBeUndefined();
    expect(result.promptHash).toBeUndefined();
    expect(result.responseHash).toBeUndefined();
    expect(result.redactedFields).toContain("prompt");
    expect(result.redactedFields).toContain("response");
  });

  test("zero tier preserves structural metadata and scores", () => {
    const config: PrivacyConfig = { tier: "zero" };
    const result = sanitizeTelemetryEvent(BASE_EVENT, config);
    expect(result.model).toBe("gpt-4");
    expect(result.providerId).toBe("openai");
    expect(result.latencyMs).toBe(150);
    expect(result.tokenCount).toBe(25);
    expect(result.microScore).toBe(0.85);
    expect(result.promptLength).toBe(BASE_EVENT.prompt!.length);
    expect(result.responseLength).toBe(BASE_EVENT.response!.length);
  });

  test("alwaysRedact removes specific fields regardless of tier", () => {
    const config: PrivacyConfig = {
      tier: "full",
      alwaysRedact: ["systemPrompt"],
    };
    const result = sanitizeTelemetryEvent(BASE_EVENT, config);
    expect(result.prompt).toBe(BASE_EVENT.prompt); // full tier
    expect(result.systemPrompt).toBeUndefined(); // always redacted
  });

  test("custom hash salt produces different hashes", () => {
    const config1: PrivacyConfig = {
      tier: "redacted",
      hashSalt: "salt-a",
    };
    const config2: PrivacyConfig = {
      tier: "redacted",
      hashSalt: "salt-b",
    };
    const result1 = sanitizeTelemetryEvent(BASE_EVENT, config1);
    const result2 = sanitizeTelemetryEvent(BASE_EVENT, config2);
    expect(result1.promptHash).not.toBe(result2.promptHash);
  });
});

describe("validatePrivacyCompliance", () => {
  test("zero-tier event with content fails validation", () => {
    const event = sanitizeTelemetryEvent(BASE_EVENT, { tier: "full" });
    // Force the tier to zero but keep the content (simulating a bug)
    event.privacyTier = "zero";
    const violations = validatePrivacyCompliance(event);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.includes("prompt"))).toBe(true);
  });

  test("properly sanitized zero-tier event passes validation", () => {
    const event = sanitizeTelemetryEvent(BASE_EVENT, { tier: "zero" });
    const violations = validatePrivacyCompliance(event);
    expect(violations).toEqual([]);
  });

  test("properly sanitized redacted-tier event passes validation", () => {
    const event = sanitizeTelemetryEvent(BASE_EVENT, { tier: "redacted" });
    const violations = validatePrivacyCompliance(event);
    expect(violations).toEqual([]);
  });
});
