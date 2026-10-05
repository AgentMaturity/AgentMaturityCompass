import { describe, expect, it } from "vitest";
import { runGateDag } from "../scripts/lib/gateDag.mjs";

function node(id: string, status = "passed", needs: string[] = [], after: string[] = [], allowFailure = false) {
  return { id, needs, after, allowFailure, run: async () => ({ id, status }) };
}
const skip = (task: { id: string }, blocked: string[]) => ({ id: task.id, status: "skipped", blocked });

describe("sequential release gate dependency DAG", () => {
  it("orders out-of-order declarations by dependencies", async () => {
    const result = await runGateDag([node("consumer", "passed", ["build"]), node("build")], skip);
    expect(result.map(row => row.id)).toEqual(["build", "consumer"]);
  });
  it.each(["failed", "skipped"])("skips all required descendants after %s", async status => {
    const result = await runGateDag([node("build", status), node("packed", "passed", ["build"]), node("verify", "passed", ["packed"])], skip);
    expect(result.map(row => row.status)).toEqual([status, "skipped", "skipped"]);
  });
  it("after orders independent checks without requiring success", async () => {
    const result = await runGateDag([node("typecheck", "passed", [], ["lint"]), node("lint", "failed")], skip);
    expect(result.map(row => row.id)).toEqual(["lint", "typecheck"]);
    expect(result.map(row => row.status)).toEqual(["failed", "passed"]);
  });
  it("records an explicitly tolerated failure without rewriting it as success", async () => {
    const result = await runGateDag([node("optional", "failed", [], [], true), node("consumer", "passed", ["optional"])], skip);
    expect(result[0]).toMatchObject({ status: "failed", allowFailure: true });
    expect(result[1].status).toBe("passed");
  });
  it.each([
    [node("a"), node("a")],
    [node("a", "passed", ["missing"])],
    [node("a", "passed", ["b"]), node("b", "passed", [], ["a"])]
  ])("rejects invalid graphs before execution", async (...nodes) => {
    let ran = false;
    for (const task of nodes) task.run = async () => { ran = true; return { id: task.id, status: "passed" }; };
    await expect(runGateDag(nodes, skip)).rejects.toThrow();
    expect(ran).toBe(false);
  });
  it("rejects a result with a mismatched gate identity", async () => {
    await expect(runGateDag([{ id: "a", run: async () => ({ id: "b", status: "passed" }) }], skip)).rejects.toThrow(/invalid result/);
  });
});
