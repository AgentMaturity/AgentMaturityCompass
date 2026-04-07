import { describe, it, expect } from "vitest";
import { scoreA2AProtocol } from "../../src/score/a2aProtocol.js";
import type { A2AProtocolEvent } from "../../src/score/a2aProtocol.js";

describe("A2A protocol maturity scoring", () => {
  const makeEvent = (overrides: Partial<A2AProtocolEvent> = {}): A2AProtocolEvent => ({
    timestamp: Date.now(),
    eventType: "message_sent",
    ...overrides,
  });

  it("returns zero for no events", () => {
    const result = scoreA2AProtocol({ events: [] });
    expect(result.overallScore).toBe(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("scores high for a complete agent card", () => {
    const events = [
      makeEvent({
        eventType: "card_published",
        cardFields: ["name", "description", "capabilities", "endpoint", "authentication"],
      }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.agentCardCompleteness).toBe(1.0);
    expect(result.maturitySignals).toContain("Agent publishes a complete A2A agent card");
  });

  it("penalizes incomplete agent card", () => {
    const events = [
      makeEvent({
        eventType: "card_published",
        cardFields: ["name", "endpoint"],
      }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.agentCardCompleteness).toBe(2 / 5);
    expect(result.recommendations.some((r) => r.includes("incomplete"))).toBe(true);
  });

  it("scores high for proper task lifecycle compliance", () => {
    const events = [
      makeEvent({ eventType: "task_submitted" }),
      makeEvent({ eventType: "state_transition", taskStates: ["submitted", "working"] }),
      makeEvent({ eventType: "task_completed" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.taskLifecycleCompliance).toBe(1.0);
  });

  it("penalizes skipped state transitions", () => {
    const events = [
      makeEvent({ eventType: "task_submitted" }),
      makeEvent({ eventType: "state_skipped" }),
      makeEvent({ eventType: "task_completed" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.taskLifecycleCompliance).toBeLessThan(1.0);
    expect(result.recommendations.some((r) => r.includes("skipped"))).toBe(true);
  });

  it("scores high for successful authentication", () => {
    const events = [
      makeEvent({ eventType: "auth_challenge", peerId: "agent-B" }),
      makeEvent({ eventType: "auth_success", peerId: "agent-B" }),
      makeEvent({ eventType: "auth_challenge", peerId: "agent-C" }),
      makeEvent({ eventType: "auth_success", peerId: "agent-C" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.interAgentAuth).toBeGreaterThan(0.9);
    expect(result.maturitySignals.some((s) => s.includes("authentication"))).toBe(true);
  });

  it("penalizes authentication failures", () => {
    const events = [
      makeEvent({ eventType: "auth_challenge", peerId: "agent-B" }),
      makeEvent({ eventType: "auth_failure", peerId: "agent-B" }),
      makeEvent({ eventType: "auth_failure", peerId: "agent-C" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.interAgentAuth).toBeLessThan(0.5);
    expect(result.recommendations.some((r) => r.includes("authentication failures"))).toBe(true);
  });

  it("scores high for well-formed messages", () => {
    const events = [
      makeEvent({ eventType: "message_sent" }),
      makeEvent({ eventType: "message_received" }),
      makeEvent({ eventType: "message_sent" }),
      makeEvent({ eventType: "message_received" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.messageFormatConformance).toBe(1.0);
  });

  it("penalizes malformed messages", () => {
    const events = [
      makeEvent({ eventType: "message_sent" }),
      makeEvent({ eventType: "message_malformed" }),
      makeEvent({ eventType: "message_malformed" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.messageFormatConformance).toBeLessThan(0.5);
    expect(result.recommendations.some((r) => r.includes("malformed"))).toBe(true);
  });

  it("scores error handling based on handled vs unhandled", () => {
    const events = [
      makeEvent({ eventType: "error_handled" }),
      makeEvent({ eventType: "error_handled" }),
      makeEvent({ eventType: "error_unhandled" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.errorHandling).toBeCloseTo(2 / 3, 1);
    expect(result.recommendations.some((r) => r.includes("unhandled"))).toBe(true);
  });

  it("scores discovery and routing", () => {
    const events = [
      makeEvent({ eventType: "peer_discovered", peerId: "agent-A" }),
      makeEvent({ eventType: "peer_discovered", peerId: "agent-B" }),
      makeEvent({ eventType: "peer_resolution_failed", peerId: "agent-C" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.discoveryAndRouting).toBeCloseTo(2 / 3, 1);
    expect(result.recommendations.some((r) => r.includes("resolution failures"))).toBe(true);
  });

  it("produces high overall score for perfect events", () => {
    const events = [
      makeEvent({ eventType: "card_published", cardFields: ["name", "description", "capabilities", "endpoint", "authentication"] }),
      makeEvent({ eventType: "task_submitted" }),
      makeEvent({ eventType: "state_transition" }),
      makeEvent({ eventType: "task_completed" }),
      makeEvent({ eventType: "auth_challenge", peerId: "agent-B" }),
      makeEvent({ eventType: "auth_success", peerId: "agent-B" }),
      makeEvent({ eventType: "message_sent" }),
      makeEvent({ eventType: "message_received" }),
      makeEvent({ eventType: "error_handled" }),
      makeEvent({ eventType: "peer_discovered", peerId: "agent-B" }),
    ];
    const result = scoreA2AProtocol({ events });
    expect(result.overallScore).toBeGreaterThan(0.8);
    expect(result.maturitySignals.length).toBeGreaterThan(0);
  });
});
