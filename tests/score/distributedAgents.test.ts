import { describe, it, expect } from "vitest";
import { scoreDistributedAgents } from "../../src/score/distributedAgents.js";
import type { DistributedAgentEvent } from "../../src/score/distributedAgents.js";

describe("distributed agents maturity scoring", () => {
  const makeEvent = (overrides: Partial<DistributedAgentEvent> = {}): DistributedAgentEvent => ({
    timestamp: Date.now(),
    nodeId: "node-1",
    eventType: "node_healthy",
    ...overrides,
  });

  it("returns zero for no events", () => {
    const result = scoreDistributedAgents({ events: [] });
    expect(result.overallScore).toBe(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("scores partition tolerance with recovery", () => {
    const events = [
      makeEvent({ eventType: "partition_detected", nodeId: "node-1" }),
      makeEvent({ eventType: "partition_recovered", nodeId: "node-1" }),
      makeEvent({ eventType: "partition_detected", nodeId: "node-2" }),
      makeEvent({ eventType: "partition_recovered", nodeId: "node-2" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.partitionTolerance).toBeGreaterThan(0.9);
    expect(result.maturitySignals.some((s) => s.includes("partition"))).toBe(true);
  });

  it("penalizes split-brain events", () => {
    const events = [
      makeEvent({ eventType: "partition_detected", nodeId: "node-1" }),
      makeEvent({ eventType: "split_brain", nodeId: "node-1" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.partitionTolerance).toBeLessThan(0.5);
    expect(result.recommendations.some((r) => r.includes("split-brain"))).toBe(true);
  });

  it("scores state synchronization when conflicts are resolved", () => {
    const events = [
      makeEvent({ eventType: "state_sync", nodeId: "node-1" }),
      makeEvent({ eventType: "state_conflict", nodeId: "node-1" }),
      makeEvent({ eventType: "state_resolved", nodeId: "node-1" }),
      makeEvent({ eventType: "state_sync", nodeId: "node-2" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.stateSynchronization).toBeGreaterThan(0.9);
  });

  it("penalizes unresolved state conflicts", () => {
    const events = [
      makeEvent({ eventType: "state_sync", nodeId: "node-1" }),
      makeEvent({ eventType: "state_conflict", nodeId: "node-1" }),
      makeEvent({ eventType: "state_conflict", nodeId: "node-2" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.stateSynchronization).toBeLessThan(0.9);
    expect(result.recommendations.some((r) => r.includes("conflict"))).toBe(true);
  });

  it("scores failover recovery when completed", () => {
    const events = [
      makeEvent({ eventType: "node_failed", nodeId: "node-1" }),
      makeEvent({ eventType: "failover_started", nodeId: "node-2" }),
      makeEvent({ eventType: "failover_completed", nodeId: "node-2" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.failoverRecovery).toBeGreaterThan(0.3);
  });

  it("penalizes failed failovers", () => {
    const events = [
      makeEvent({ eventType: "node_failed", nodeId: "node-1" }),
      makeEvent({ eventType: "failover_started", nodeId: "node-2" }),
      makeEvent({ eventType: "failover_failed", nodeId: "node-2" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.failoverRecovery).toBeLessThan(0.5);
    expect(result.recommendations.some((r) => r.includes("failover"))).toBe(true);
  });

  it("scores consensus behavior with successful quorum", () => {
    const events = [
      makeEvent({ eventType: "vote_cast", nodeId: "node-1" }),
      makeEvent({ eventType: "vote_cast", nodeId: "node-2" }),
      makeEvent({ eventType: "vote_cast", nodeId: "node-3" }),
      makeEvent({ eventType: "consensus_reached", nodeId: "node-1" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.consensusBehavior).toBeGreaterThan(0.9);
  });

  it("penalizes consensus failures", () => {
    const events = [
      makeEvent({ eventType: "vote_cast", nodeId: "node-1" }),
      makeEvent({ eventType: "consensus_failed", nodeId: "node-1" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.consensusBehavior).toBeLessThan(0.7);
    expect(result.recommendations.some((r) => r.includes("consensus"))).toBe(true);
  });

  it("scores load distribution across nodes", () => {
    const events = [
      makeEvent({ eventType: "task_assigned", nodeId: "node-1" }),
      makeEvent({ eventType: "task_assigned", nodeId: "node-2" }),
      makeEvent({ eventType: "task_rebalanced", nodeId: "node-1" }),
      makeEvent({ eventType: "backpressure_applied", nodeId: "node-2" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.loadDistribution).toBeGreaterThan(0.7);
  });

  it("scores observability depth", () => {
    const events = [
      makeEvent({ eventType: "trace_correlated", nodeId: "node-1" }),
      makeEvent({ eventType: "topology_mapped", nodeId: "node-1" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.observabilityDepth).toBe(1.0);
    expect(result.maturitySignals.some((s) => s.includes("observability"))).toBe(true);
  });

  it("produces high overall score for perfect events", () => {
    const events = [
      makeEvent({ eventType: "partition_detected", nodeId: "node-1" }),
      makeEvent({ eventType: "partition_recovered", nodeId: "node-1" }),
      makeEvent({ eventType: "state_sync", nodeId: "node-1" }),
      makeEvent({ eventType: "state_sync", nodeId: "node-2" }),
      makeEvent({ eventType: "node_failed", nodeId: "node-3" }),
      makeEvent({ eventType: "failover_started", nodeId: "node-1" }),
      makeEvent({ eventType: "failover_completed", nodeId: "node-1" }),
      makeEvent({ eventType: "vote_cast", nodeId: "node-1" }),
      makeEvent({ eventType: "vote_cast", nodeId: "node-2" }),
      makeEvent({ eventType: "consensus_reached", nodeId: "node-1" }),
      makeEvent({ eventType: "task_assigned", nodeId: "node-1" }),
      makeEvent({ eventType: "task_assigned", nodeId: "node-2" }),
      makeEvent({ eventType: "task_rebalanced", nodeId: "node-1" }),
      makeEvent({ eventType: "trace_correlated", nodeId: "node-1" }),
      makeEvent({ eventType: "topology_mapped", nodeId: "node-2" }),
    ];
    const result = scoreDistributedAgents({ events });
    expect(result.overallScore).toBeGreaterThan(0.7);
    expect(result.maturitySignals.length).toBeGreaterThan(0);
  });
});
