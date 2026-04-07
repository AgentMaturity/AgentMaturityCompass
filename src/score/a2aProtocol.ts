/**
 * A2A (Agent-to-Agent) Protocol Maturity Scoring
 *
 * Scores how well an agent implements the A2A protocol for inter-agent
 * communication, including agent card publishing, task lifecycle management,
 * authentication, message conformance, error handling, and discovery.
 *
 * Sub-dimensions (weights):
 *   - agentCardCompleteness (0.20)
 *   - taskLifecycleCompliance (0.20)
 *   - interAgentAuth (0.20)
 *   - messageFormatConformance (0.15)
 *   - errorHandling (0.15)
 *   - discoveryAndRouting (0.10)
 */

export interface A2AProtocolEvent {
  timestamp: number;
  eventType:
    | "card_published"
    | "task_submitted"
    | "task_completed"
    | "task_failed"
    | "auth_challenge"
    | "auth_success"
    | "auth_failure"
    | "message_sent"
    | "message_received"
    | "message_malformed"
    | "error_handled"
    | "error_unhandled"
    | "peer_discovered"
    | "peer_resolution_failed"
    | "state_transition"
    | "state_skipped";
  peerId?: string;
  details?: Record<string, unknown>;
  cardFields?: string[];
  taskStates?: string[];
}

export interface A2AProtocolInput {
  events: A2AProtocolEvent[];
}

export interface A2AProtocolScore {
  overallScore: number;
  agentCardCompleteness: number;
  taskLifecycleCompliance: number;
  interAgentAuth: number;
  messageFormatConformance: number;
  errorHandling: number;
  discoveryAndRouting: number;
  maturitySignals: string[];
  recommendations: string[];
}

const REQUIRED_CARD_FIELDS = ["name", "description", "capabilities", "endpoint", "authentication"];

function emptyScore(): A2AProtocolScore {
  return {
    overallScore: 0,
    agentCardCompleteness: 0,
    taskLifecycleCompliance: 0,
    interAgentAuth: 0,
    messageFormatConformance: 0,
    errorHandling: 0,
    discoveryAndRouting: 0,
    maturitySignals: [],
    recommendations: ["No A2A protocol events recorded — agent may lack inter-agent communication"],
  };
}

export function scoreA2AProtocol(input: A2AProtocolInput): A2AProtocolScore {
  const { events } = input;

  if (events.length === 0) {
    return emptyScore();
  }

  // ── agentCardCompleteness (0.20) ──
  const cardEvents = events.filter((e) => e.eventType === "card_published");
  let agentCardCompleteness = 0;
  if (cardEvents.length > 0) {
    // Use the latest card event
    const latestCard = cardEvents[cardEvents.length - 1]!;
    const fields = latestCard.cardFields ?? [];
    const presentFields = REQUIRED_CARD_FIELDS.filter((f) => fields.includes(f));
    agentCardCompleteness = presentFields.length / REQUIRED_CARD_FIELDS.length;
  }

  // ── taskLifecycleCompliance (0.20) ──
  const taskSubmitted = events.filter((e) => e.eventType === "task_submitted").length;
  const taskCompleted = events.filter((e) => e.eventType === "task_completed").length;
  const taskFailed = events.filter((e) => e.eventType === "task_failed").length;
  const stateTransitions = events.filter((e) => e.eventType === "state_transition").length;
  const stateSkipped = events.filter((e) => e.eventType === "state_skipped").length;
  let taskLifecycleCompliance = 0;
  const totalTaskEvents = taskSubmitted + taskCompleted + taskFailed + stateTransitions + stateSkipped;
  if (totalTaskEvents > 0) {
    const goodEvents = taskSubmitted + taskCompleted + taskFailed + stateTransitions;
    taskLifecycleCompliance = Math.max(0, goodEvents / totalTaskEvents - (stateSkipped / totalTaskEvents));
  }

  // ── interAgentAuth (0.20) ──
  const authChallenges = events.filter((e) => e.eventType === "auth_challenge").length;
  const authSuccesses = events.filter((e) => e.eventType === "auth_success").length;
  const authFailures = events.filter((e) => e.eventType === "auth_failure").length;
  let interAgentAuth = 0;
  const totalAuth = authChallenges + authSuccesses + authFailures;
  if (totalAuth > 0) {
    // Good: challenges issued and successes; bad: failures
    interAgentAuth = Math.max(0, (authChallenges + authSuccesses) / (totalAuth + authFailures));
    // Bonus: if challenges are issued (proactive auth)
    if (authChallenges > 0 && authFailures === 0) {
      interAgentAuth = Math.min(1, interAgentAuth * 1.1);
    }
  }

  // ── messageFormatConformance (0.15) ──
  const messageSent = events.filter((e) => e.eventType === "message_sent").length;
  const messageReceived = events.filter((e) => e.eventType === "message_received").length;
  const messageMalformed = events.filter((e) => e.eventType === "message_malformed").length;
  let messageFormatConformance = 0;
  const totalMessages = messageSent + messageReceived + messageMalformed;
  if (totalMessages > 0) {
    messageFormatConformance = Math.max(0, 1 - messageMalformed / totalMessages);
  }

  // ── errorHandling (0.15) ──
  const errorsHandled = events.filter((e) => e.eventType === "error_handled").length;
  const errorsUnhandled = events.filter((e) => e.eventType === "error_unhandled").length;
  let errorHandling = 0;
  const totalErrors = errorsHandled + errorsUnhandled;
  if (totalErrors > 0) {
    errorHandling = errorsHandled / totalErrors;
  }

  // ── discoveryAndRouting (0.10) ──
  const peersDiscovered = events.filter((e) => e.eventType === "peer_discovered").length;
  const peerResolutionFailed = events.filter((e) => e.eventType === "peer_resolution_failed").length;
  let discoveryAndRouting = 0;
  const totalDiscovery = peersDiscovered + peerResolutionFailed;
  if (totalDiscovery > 0) {
    discoveryAndRouting = peersDiscovered / totalDiscovery;
  }

  // ── overall weighted score ──
  const overallScore =
    agentCardCompleteness * 0.20 +
    taskLifecycleCompliance * 0.20 +
    interAgentAuth * 0.20 +
    messageFormatConformance * 0.15 +
    errorHandling * 0.15 +
    discoveryAndRouting * 0.10;

  // ── signals & recommendations ──
  const maturitySignals: string[] = [];
  const recommendations: string[] = [];

  if (agentCardCompleteness === 1.0) {
    maturitySignals.push("Agent publishes a complete A2A agent card");
  } else if (agentCardCompleteness === 0) {
    recommendations.push("No agent card published — implement A2A agent card with all required fields");
  } else {
    recommendations.push("Agent card is incomplete — add missing fields: " +
      REQUIRED_CARD_FIELDS.filter((f) => {
        const latest = cardEvents[cardEvents.length - 1];
        return !(latest?.cardFields ?? []).includes(f);
      }).join(", "));
  }

  if (taskLifecycleCompliance > 0.9) {
    maturitySignals.push("Task lifecycle transitions follow A2A protocol correctly");
  }
  if (stateSkipped > 0) {
    recommendations.push(`${stateSkipped} state transitions were skipped — ensure proper lifecycle flow`);
  }

  if (interAgentAuth > 0.9 && authChallenges > 0) {
    maturitySignals.push("Inter-agent authentication is robust with proactive challenges");
  }
  if (authFailures > 0) {
    recommendations.push(`${authFailures} authentication failures detected — review peer trust configuration`);
  }
  if (totalAuth === 0) {
    recommendations.push("No authentication events observed — implement inter-agent authentication");
  }

  if (messageFormatConformance > 0.95) {
    maturitySignals.push("Messages consistently conform to A2A format standards");
  }
  if (messageMalformed > 0) {
    recommendations.push(`${messageMalformed} malformed messages detected — validate JSON-RPC format before sending`);
  }

  if (errorHandling > 0.9) {
    maturitySignals.push("Errors are handled gracefully with proper fallbacks");
  }
  if (errorsUnhandled > 0) {
    recommendations.push(`${errorsUnhandled} unhandled errors — implement timeout, retry, and graceful degradation`);
  }

  if (discoveryAndRouting > 0.9) {
    maturitySignals.push("Peer discovery and routing works reliably");
  }
  if (peerResolutionFailed > 0) {
    recommendations.push(`${peerResolutionFailed} peer resolution failures — implement service registry or fallback discovery`);
  }
  if (totalDiscovery === 0) {
    recommendations.push("No discovery events observed — implement well-known URI or service registry");
  }

  const round = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;

  return {
    overallScore: round(overallScore),
    agentCardCompleteness: round(agentCardCompleteness),
    taskLifecycleCompliance: round(taskLifecycleCompliance),
    interAgentAuth: round(interAgentAuth),
    messageFormatConformance: round(messageFormatConformance),
    errorHandling: round(errorHandling),
    discoveryAndRouting: round(discoveryAndRouting),
    maturitySignals,
    recommendations,
  };
}
