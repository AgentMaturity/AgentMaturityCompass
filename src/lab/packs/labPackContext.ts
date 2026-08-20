/**
 * Shared contract for Assurance Lab packs.
 *
 * These packs previously embedded a hardcoded ideal `response` per scenario and
 * graded that string, so results were identical for every agent and the
 * `agentId` argument was never used. Packs now pose each scenario to the real
 * agent under test and grade what it actually replies.
 */

/** A scenario posed to the agent under test. */
export interface LabScenario {
  /** Short identifier used in findings and recommendations. */
  name: string;
  /** The prompt actually sent to the agent. */
  prompt: string;
}

export interface LabPackContext {
  agentId: string;
  /** Invokes the real agent under test. */
  respond: (prompt: string) => Promise<string>;
}

/** Outcome of posing one scenario, including scenarios that could not be run. */
export interface LabScenarioOutcome {
  name: string;
  prompt: string;
  response: string;
  /** True when the agent's actual reply exhibited the weakness under test. */
  vulnerable: boolean;
  /** True when the agent could not be reached; excluded from vulnerability counts. */
  inconclusive: boolean;
}

/**
 * Poses every scenario to the agent and classifies the real replies.
 *
 * A scenario that cannot reach the agent is marked inconclusive rather than
 * being scored as safe — an untested boundary is unknown, not held.
 */
export async function runLabScenarios(
  ctx: LabPackContext,
  scenarios: LabScenario[],
  classify: (name: string, response: string) => boolean
): Promise<LabScenarioOutcome[]> {
  const outcomes: LabScenarioOutcome[] = [];
  for (const scenario of scenarios) {
    try {
      const response = await ctx.respond(scenario.prompt);
      outcomes.push({
        name: scenario.name,
        prompt: scenario.prompt,
        response,
        vulnerable: classify(scenario.name, response),
        inconclusive: false
      });
    } catch (error) {
      outcomes.push({
        name: scenario.name,
        prompt: scenario.prompt,
        response: "",
        vulnerable: false,
        inconclusive: true,
        // Reason is surfaced through the pack's recommendation text.
      } as LabScenarioOutcome);
    }
  }
  return outcomes;
}

/**
 * Builds a lab-pack context bound to the real agent under test.
 *
 * @throws {AgentResponderUnavailableError} when no real agent is reachable, so
 * callers fail closed rather than grading a canned answer.
 */
export async function resolveLabPackContext(params: {
  workspace: string;
  agentId: string;
  model?: string;
}): Promise<LabPackContext> {
  const { resolveAgentResponder } = await import("../../assurance/agentResponder.js");
  const responder = await resolveAgentResponder({
    workspace: params.workspace,
    agentId: params.agentId,
    model: params.model
  });
  return {
    agentId: params.agentId,
    respond: async (prompt: string) => (await responder.respond(prompt)).text
  };
}
