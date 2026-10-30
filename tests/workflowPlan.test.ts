import { describe, expect, it } from "vitest";
import {
  MAX_PLAN_NODES,
  MAX_PLAN_DEPTH,
  MAX_PLAN_BYTES,
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

  it("refuses an oversized child list before inspecting its nodes", () => {
    let inspected = false;
    const children = Array.from({ length: MAX_PLAN_NODES }, (_, index) => agent(`a${index}`));
    Object.defineProperty(children[0], "goal", { get: () => { inspected = true; return "g"; } });
    expect(parseWorkflowPlan({ kind: "parallel", id: "root", children }).ok).toBe(false);
    expect(inspected).toBe(false);
  });

  it("counts nodes across nested branches before admitting a late sibling", () => {
    const children = Array.from({ length: MAX_PLAN_NODES - 2 }, (_, index) => agent(`a${index}`));
    const parsed = parseWorkflowPlan({ kind: "parallel", id: "root", children: [
      { kind: "parallel", id: "branch", children }, agent("late")
    ] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain(String(MAX_PLAN_NODES));
  });

  it("admits the depth boundary and refuses the next level before stack growth", () => {
    const nested = (depth: number): unknown => {
      let node: unknown = agent("leaf");
      for (let level = 1; level < depth; level += 1) {
        node = { kind: "pipeline", id: `p${level}`, stages: [node] };
      }
      return node;
    };
    expect(parseWorkflowPlan(nested(MAX_PLAN_DEPTH)).ok).toBe(true);
    const parsed = parseWorkflowPlan(nested(MAX_PLAN_DEPTH + 1));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("depth");
    expect(parseWorkflowPlan(nested(5000)).ok).toBe(false);
  });

  it("counts UTF-8 bytes across all node fields before accepting a plan", () => {
    expect(parseWorkflowPlan(agent("a", "界".repeat(100_000))).ok).toBe(false);
    const goal = "g".repeat(140_000);
    expect(parseWorkflowPlan(agent("a", goal)).ok).toBe(true);
    expect(parseWorkflowPlan({ kind: "parallel", id: "root", children: [agent("a", goal), agent("b", goal)] }).ok).toBe(false);
    expect(parseWorkflowPlan(agent("a", "\u0000".repeat(50_000))).ok).toBe(false);
    expect(parseWorkflowPlan(agent("a", "\ud800".repeat(50_000))).ok).toBe(false);
    expect(parseWorkflowPlan({ ...agent("a"), scope: Array.from({ length: MAX_PLAN_BYTES }, () => "READ_ONLY") }).ok).toBe(false);
  });

  it("refuses cyclic nodes and deeply nested unknown kinds without serializing them", () => {
    const cyclic: { kind: string; id: string; children: unknown[] } = { kind: "parallel", id: "root", children: [] };
    cyclic.children.push(cyclic);
    expect(parseWorkflowPlan(cyclic).ok).toBe(false);
    let kind: unknown = {};
    for (let depth = 0; depth < 10_000; depth += 1) kind = { nested: kind };
    const parsed = parseWorkflowPlan({ kind, id: "unknown" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("unknown kind object");
  });

  it("ignores unused metadata while retaining delegation scope validation", () => {
    const unused: { self?: unknown } = {};
    unused.self = unused;
    expect(parseWorkflowPlan({ ...agent("a"), unused, scope: ["READ_ONLY"] })).toMatchObject({
      ok: true, plan: { scope: ["READ_ONLY"] }
    });
    expect(parseWorkflowPlan({ ...agent("a"), scope: [] }).ok).toBe(false);
    expect(parseWorkflowPlan({ ...agent("a"), scope: ["UNKNOWN"] }).ok).toBe(false);
  });

  it("refuses a shape it does not recognise", () => {
    expect(parseWorkflowPlan({ kind: "loop", id: "l" }).ok).toBe(false);
    expect(parseWorkflowPlan(null).ok).toBe(false);
    expect(parseWorkflowPlan({ kind: "agent", id: "a" }).ok, "an agent needs a goal").toBe(false);
  });

  it("refuses a deeply nested scope instead of overflowing the stack", () => {
    let scope: unknown = [];
    for (let depth = 0; depth < 5000; depth += 1) scope = [scope];
    const parsed = parseWorkflowPlan({ ...agent("a"), scope });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("node a: scope must be an array of strings");
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
