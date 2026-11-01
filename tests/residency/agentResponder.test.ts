/** P2-01 agent responder POST and gateway reachability GET (src/assurance/agentResponder.ts respond / gatewayReachable). */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentResponderInvocationError, resolveAgentResponder, type ResolveAgentResponderInput } from "../../src/assurance/agentResponder.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const ANSWER = JSON.stringify({ choices: [{ message: { content: "answer" } }] });
let root: string, blocked: string, open: string, agent: Listener;
beforeEach(async () => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  agent = await listen((_req, res) => { res.writeHead(200, { "content-type": "application/json" }).end(ANSWER); });
  vi.stubEnv("OPENAI_API_KEY", "k");
  vi.stubEnv("AMC_ASSURANCE_MODEL", "m");
});
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); await closeFixtures(); });

// An unknown agent id selects the OpenAI-compatible default provider; AMC_AGENT_BASE_URL names the direct endpoint.
const direct = (workspace: string, base: string, fetchImpl: typeof fetch = vi.fn(fetch)) => {
  vi.stubEnv("AMC_AGENT_BASE_URL", base);
  return resolveAgentResponder({ workspace, agentId: "residency-fixture", fetchImpl });
};

describe("agent responder", () => {
  test("a denied gateway probe and a denied direct POST call no fetch and open no socket", async () => {
    vi.stubEnv("AMC_AGENT_BASE_URL", "");
    const probe = vi.fn(fetch);
    await expect(resolveAgentResponder({ workspace: blocked, agentId: "residency-fixture", fetchImpl: probe })).rejects.toBeInstanceOf(EgressBlocked);
    expect(probe).not.toHaveBeenCalled();

    const post = vi.fn(fetch);
    const responder = await direct(blocked, agent.url, post);
    await expect(responder.respond("hello")).rejects.toBeInstanceOf(EgressBlocked);
    expect(post).not.toHaveBeenCalled();
    expect(agent.connections).toBe(0);
  });

  test("the probe reads the caller's workspace once: a carrier that later names an open workspace does not widen it", async () => {
    vi.stubEnv("AMC_AGENT_BASE_URL", "");
    let reads = 0;
    const probe = vi.fn(fetch);
    const request = { agentId: "residency-fixture", fetchImpl: probe, get workspace() { reads += 1; return reads === 1 ? blocked : open; } };
    await expect(resolveAgentResponder(request as ResolveAgentResponderInput)).rejects.toBeInstanceOf(EgressBlocked);
    expect(reads).toBe(1);
    expect(probe).not.toHaveBeenCalled();
  });

  test("each respond rechecks the captured workspace: blocked after the first answer, the second POST is refused", async () => {
    const input: ResolveAgentResponderInput = { workspace: open, agentId: "residency-fixture", fetchImpl: vi.fn(fetch) };
    const flipping = await listen((_req, res) => {
      blockResidency(open);
      input.workspace = newWorkspace(root, "unregulated");
      res.writeHead(200, { "content-type": "application/json" }).end(ANSWER);
    });
    vi.stubEnv("AMC_AGENT_BASE_URL", flipping.url);
    const responder = await resolveAgentResponder(input);
    expect((await responder.respond("one")).text).toBe("answer");
    await expect(responder.respond("two")).rejects.toBeInstanceOf(EgressBlocked);
    expect(flipping.requests).toHaveLength(1);
  });

  test("a 3xx from the agent endpoint is an invocation failure, not followed", async () => {
    const redirector = await redirectTo(agent);
    const responder = await direct(open, redirector.url);
    await expect(responder.respond("hello")).rejects.toBeInstanceOf(AgentResponderInvocationError);
    expect(agent.connections).toBe(0);
  });
});
