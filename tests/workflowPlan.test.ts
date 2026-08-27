import { describe, expect, it } from "vitest";
import {
  MAX_PLAN_NODES,
  parseWorkflowPlan,
  planAgentCount
} from "../src/workflow/workflowPlan.js";

/**
 * A workflow is DATA, not a script (plan P6.1c).
 *
 * The plan line said "worker-thread scripts, model-written". That cannot be
 * built as written: `d80cc212` established that a worker thread is not a
 * security boundary in Node and that AMC cannot confine one — Code Mode's guard
 * was asking a question the architecture could not answer affirmatively, and
 * passed on every Mac. A second model-written code-execution surface would
 * recreate exactly that.
 *
 * A declared plan gets the orchestration — `agent`, `parallel`, `pipeline` — with
 * no execution surface at all. A model can author one, because authoring it
 * means emitting JSON, and JSON runs nothing.
 */
const agent = (id: string, goal = "g") => ({ kind: "agent", id, runAs: "researcher", goal });

describe("a plan is validated before anything runs", () => {
  it("accepts a single agent node", () => {
    const parsed = parseWorkflowPlan(agent("a"));
    expect(parsed.ok).toBe(true);
  });

  it("accepts nesting of parallel and pipeline", () => {
    const parsed = parseWorkflowPlan({
      kind: "pipeline",
      id: "p",
      stages: [agent("a"), { kind: "parallel", id: "q", children: [agent("b"), agent("c")] }]
    });
    expect(parsed.ok, parsed.ok ? "" : parsed.reason).toBe(true);
  });

  it("refuses duplicate node ids", () => {
    // Outputs are keyed by node id, so a duplicate would silently overwrite one
    // agent's answer with another's and the plan would still report success.
    const parsed = parseWorkflowPlan({ kind: "parallel", id: "q", children: [agent("a"), agent("a")] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("a");
  });

  it("refuses an empty parallel or pipeline", () => {
    // A composite with nothing in it is almost always a truncated plan, and
    // running it would report a successful workflow that did nothing.
    expect(parseWorkflowPlan({ kind: "parallel", id: "q", children: [] }).ok).toBe(false);
    expect(parseWorkflowPlan({ kind: "pipeline", id: "p", stages: [] }).ok).toBe(false);
  });

  it("refuses a plan larger than the node cap", () => {
    // The fan-out bound. A plan is authored by a model, and an unbounded one is
    // an unbounded number of delegations, each spending the operator's budget.
    // Refused as data, before a single agent is spawned.
    const children = Array.from({ length: MAX_PLAN_NODES + 1 }, (_, i) => agent(`a${i}`));
    const parsed = parseWorkflowPlan({ kind: "parallel", id: "q", children });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(String(MAX_PLAN_NODES));
  });

  it("refuses a shape it does not recognise", () => {
    expect(parseWorkflowPlan({ kind: "loop", id: "l" }).ok).toBe(false);
    expect(parseWorkflowPlan(null).ok).toBe(false);
    expect(parseWorkflowPlan({ kind: "agent", id: "a" }).ok, "an agent needs a goal").toBe(false);
  });

  it("counts the agents a plan would spawn, before it spawns them", () => {
    const parsed = parseWorkflowPlan({
      kind: "pipeline",
      id: "p",
      stages: [agent("a"), { kind: "parallel", id: "q", children: [agent("b"), agent("c")] }]
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(planAgentCount(parsed.plan)).toBe(3);
  });
});
