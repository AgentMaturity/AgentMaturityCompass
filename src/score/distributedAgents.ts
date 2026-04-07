/**
 * Distributed Agent Execution Maturity Scoring
 *
 * Scores how well a multi-agent system handles distributed execution concerns
 * including partition tolerance, state synchronization, failover, consensus,
 * load distribution, and observability.
 *
 * Sub-dimensions (weights):
 *   - partitionTolerance (0.25)
 *   - stateSynchronization (0.20)
 *   - failoverRecovery (0.20)
 *   - consensusBehavior (0.15)
 *   - loadDistribution (0.10)
 *   - observabilityDepth (0.10)
 */

export interface DistributedAgentEvent {
  timestamp: number;
  nodeId: string;
  eventType:
    | "partition_detected"
    | "partition_recovered"
    | "split_brain"
    | "state_sync"
    | "state_conflict"
    | "state_resolved"
    | "node_healthy"
    | "node_failed"
    | "failover_started"
    | "failover_completed"
    | "failover_failed"
    | "vote_cast"
    | "consensus_reached"
    | "consensus_failed"
    | "task_assigned"
    | "task_rebalanced"
    | "backpressure_applied"
    | "trace_correlated"
    | "topology_mapped";
  peerNodes?: string[];
  details?: Record<string, unknown>;
}

export interface DistributedAgentsInput {
  events: DistributedAgentEvent[];
}

export interface DistributedAgentsScore {
  overallScore: number;
  partitionTolerance: number;
  stateSynchronization: number;
  failoverRecovery: number;
  consensusBehavior: number;
  loadDistribution: number;
  observabilityDepth: number;
  maturitySignals: string[];
  recommendations: string[];
}

function emptyScore(): DistributedAgentsScore {
  return {
    overallScore: 0,
    partitionTolerance: 0,
    stateSynchronization: 0,
    failoverRecovery: 0,
    consensusBehavior: 0,
    loadDistribution: 0,
    observabilityDepth: 0,
    maturitySignals: [],
    recommendations: ["No distributed agent events recorded — system may lack distributed execution capability"],
  };
}

export function scoreDistributedAgents(input: DistributedAgentsInput): DistributedAgentsScore {
  const { events } = input;

  if (events.length === 0) {
    return emptyScore();
  }

  // ── partitionTolerance (0.25) ──
  const partitionsDetected = events.filter((e) => e.eventType === "partition_detected").length;
  const partitionsRecovered = events.filter((e) => e.eventType === "partition_recovered").length;
  const splitBrains = events.filter((e) => e.eventType === "split_brain").length;
  let partitionTolerance = 0;
  const totalPartitionEvents = partitionsDetected + partitionsRecovered + splitBrains;
  if (totalPartitionEvents > 0) {
    // Recovery is good, split brain is very bad
    partitionTolerance = Math.max(0, (partitionsDetected + partitionsRecovered) / totalPartitionEvents - splitBrains / totalPartitionEvents);
    // Bonus if all partitions were recovered
    if (partitionsRecovered >= partitionsDetected && splitBrains === 0) {
      partitionTolerance = Math.min(1, partitionTolerance * 1.1);
    }
  }

  // ── stateSynchronization (0.20) ──
  const stateSyncs = events.filter((e) => e.eventType === "state_sync").length;
  const stateConflicts = events.filter((e) => e.eventType === "state_conflict").length;
  const stateResolved = events.filter((e) => e.eventType === "state_resolved").length;
  let stateSynchronization = 0;
  const totalStateEvents = stateSyncs + stateConflicts + stateResolved;
  if (totalStateEvents > 0) {
    // Syncs and resolutions are good, unresolved conflicts are bad
    const unresolvedConflicts = Math.max(0, stateConflicts - stateResolved);
    stateSynchronization = Math.max(0, 1 - unresolvedConflicts / totalStateEvents);
    // Bonus for having sync events
    if (stateSyncs > 0 && unresolvedConflicts === 0) {
      stateSynchronization = Math.min(1, stateSynchronization);
    }
  }

  // ── failoverRecovery (0.20) ──
  const nodeHealthy = events.filter((e) => e.eventType === "node_healthy").length;
  const nodeFailed = events.filter((e) => e.eventType === "node_failed").length;
  const failoverStarted = events.filter((e) => e.eventType === "failover_started").length;
  const failoverCompleted = events.filter((e) => e.eventType === "failover_completed").length;
  const failoverFailed = events.filter((e) => e.eventType === "failover_failed").length;
  let failoverRecovery = 0;
  const totalFailoverEvents = nodeFailed + failoverStarted + failoverCompleted + failoverFailed;
  if (totalFailoverEvents > 0) {
    // Completed failovers are good; failed failovers are bad
    failoverRecovery = Math.max(0, failoverCompleted / totalFailoverEvents);
    // If node failures all led to completed failovers
    if (failoverCompleted >= nodeFailed && failoverFailed === 0 && nodeFailed > 0) {
      failoverRecovery = Math.min(1, failoverRecovery * 1.2);
    }
  } else if (nodeHealthy > 0) {
    // All nodes healthy, no failures observed — moderate score
    failoverRecovery = 0.5;
  }

  // ── consensusBehavior (0.15) ──
  const votesCast = events.filter((e) => e.eventType === "vote_cast").length;
  const consensusReached = events.filter((e) => e.eventType === "consensus_reached").length;
  const consensusFailed = events.filter((e) => e.eventType === "consensus_failed").length;
  let consensusBehavior = 0;
  const totalConsensus = votesCast + consensusReached + consensusFailed;
  if (totalConsensus > 0) {
    consensusBehavior = Math.max(0, (votesCast + consensusReached) / (totalConsensus + consensusFailed));
    if (consensusReached > 0 && consensusFailed === 0) {
      consensusBehavior = Math.min(1, consensusBehavior * 1.1);
    }
  }

  // ── loadDistribution (0.10) ──
  const tasksAssigned = events.filter((e) => e.eventType === "task_assigned").length;
  const tasksRebalanced = events.filter((e) => e.eventType === "task_rebalanced").length;
  const backpressure = events.filter((e) => e.eventType === "backpressure_applied").length;
  let loadDistribution = 0;
  const totalLoadEvents = tasksAssigned + tasksRebalanced + backpressure;
  if (totalLoadEvents > 0) {
    // Task assignment is baseline; rebalancing and backpressure show maturity
    loadDistribution = tasksAssigned / totalLoadEvents;
    if (tasksRebalanced > 0) {
      loadDistribution = Math.min(1, loadDistribution + 0.2);
    }
    if (backpressure > 0) {
      loadDistribution = Math.min(1, loadDistribution + 0.1);
    }
    // Check for load distribution across nodes
    const assignedNodes = new Set(events.filter((e) => e.eventType === "task_assigned").map((e) => e.nodeId));
    if (assignedNodes.size > 1) {
      loadDistribution = Math.min(1, loadDistribution + 0.1);
    }
  }

  // ── observabilityDepth (0.10) ──
  const traceCorrelated = events.filter((e) => e.eventType === "trace_correlated").length;
  const topologyMapped = events.filter((e) => e.eventType === "topology_mapped").length;
  let observabilityDepth = 0;
  const totalObservability = traceCorrelated + topologyMapped;
  if (totalObservability > 0) {
    // Both tracing and topology mapping contribute
    observabilityDepth = 0;
    if (traceCorrelated > 0) observabilityDepth += 0.6;
    if (topologyMapped > 0) observabilityDepth += 0.4;
    observabilityDepth = Math.min(1, observabilityDepth);
  }

  // ── overall weighted score ──
  const overallScore =
    partitionTolerance * 0.25 +
    stateSynchronization * 0.20 +
    failoverRecovery * 0.20 +
    consensusBehavior * 0.15 +
    loadDistribution * 0.10 +
    observabilityDepth * 0.10;

  // ── signals & recommendations ──
  const maturitySignals: string[] = [];
  const recommendations: string[] = [];

  if (partitionTolerance > 0.9) {
    maturitySignals.push("System handles network partitions with reliable recovery");
  }
  if (splitBrains > 0) {
    recommendations.push(`${splitBrains} split-brain events detected — implement split-brain detection and resolution`);
  }
  if (totalPartitionEvents === 0) {
    recommendations.push("No partition handling observed — implement partition detection and recovery");
  }

  if (stateSynchronization > 0.9) {
    maturitySignals.push("State synchronization is consistent across nodes");
  }
  if (stateConflicts > stateResolved) {
    recommendations.push(`${stateConflicts - stateResolved} unresolved state conflicts — implement conflict resolution (e.g., CRDTs)`);
  }
  if (totalStateEvents === 0) {
    recommendations.push("No state synchronization observed — implement cross-node state sync");
  }

  if (failoverRecovery > 0.8) {
    maturitySignals.push("Failover recovery is reliable with automatic node replacement");
  }
  if (failoverFailed > 0) {
    recommendations.push(`${failoverFailed} failover attempts failed — improve health checks and failover automation`);
  }
  if (nodeFailed > 0 && failoverStarted === 0) {
    recommendations.push("Node failures detected but no failover initiated — implement automatic failover");
  }

  if (consensusBehavior > 0.9) {
    maturitySignals.push("Consensus protocol operates correctly with reliable quorum decisions");
  }
  if (consensusFailed > 0) {
    recommendations.push(`${consensusFailed} consensus failures — review quorum configuration and vote integrity`);
  }
  if (totalConsensus === 0) {
    recommendations.push("No consensus events observed — implement leader election or quorum protocol");
  }

  if (loadDistribution > 0.8) {
    maturitySignals.push("Work is distributed effectively across nodes");
  }
  if (totalLoadEvents === 0) {
    recommendations.push("No load distribution events observed — implement task assignment and rebalancing");
  }

  if (observabilityDepth > 0.8) {
    maturitySignals.push("Distributed system has deep observability with tracing and topology mapping");
  }
  if (traceCorrelated === 0) {
    recommendations.push("No distributed traces correlated — implement cross-node trace correlation");
  }
  if (topologyMapped === 0) {
    recommendations.push("No topology mapping observed — implement topology discovery and visualization");
  }

  const round = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;

  return {
    overallScore: round(overallScore),
    partitionTolerance: round(partitionTolerance),
    stateSynchronization: round(stateSynchronization),
    failoverRecovery: round(failoverRecovery),
    consensusBehavior: round(consensusBehavior),
    loadDistribution: round(loadDistribution),
    observabilityDepth: round(observabilityDepth),
    maturitySignals,
    recommendations,
  };
}
