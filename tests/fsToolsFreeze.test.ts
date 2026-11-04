import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";
import { getAgentPaths } from "../src/fleet/paths.js";

/**
 * AXR-02/AXR-03: native WRITE_LOW tools (fs.write, fs.edit) are not bound to an authorization record by default, so
 * the recheck's freeze check never saw them. An integrity freeze (an incident file that cannot be read or verified)
 * holds every class above READ_ONLY, and the native plane must refuse them as ToolHub does.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function harness() {
  const workspace = mkdtempSync(join(tmpdir(), "amc-fsfreeze-"));
  dirs.push(workspace);
  const registry = new ToolRegistry();
  for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
  const pipeline = new ToolPipeline({ registry, workspace });
  return {
    workspace,
    tamperIncident: () => {
      const dir = join(getAgentPaths(workspace, "alice").rootDir, "incidents");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "inc_tampered.json"), "{ not an incident");
    },
    run: (name: string, args: Record<string, unknown>) =>
      pipeline.execute({ name, agentId: "alice", arguments: args, requestedMode: "EXECUTE" })
  };
}

describe("native WRITE_LOW tools under an integrity freeze", () => {
  it("refuses fs.write and leaves the file unwritten", async () => {
    const h = harness();
    h.tamperIncident();
    const outcome = await h.run("fs.write", { path: "out.txt", content: "x" });
    expect(outcome.ok).toBe(false);
    expect(outcome.denied?.stage).toBe("authorization");
    expect(outcome.denied?.reason).toContain("action_class_frozen");
    expect(existsSync(join(h.workspace, "out.txt"))).toBe(false);
  });

  it("refuses fs.edit but still lets reads through", async () => {
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "hello world");
    expect((await h.run("fs.read", { path: "a.txt" })).ok).toBe(true);
    h.tamperIncident();
    expect((await h.run("fs.read", { path: "a.txt" })).ok, "READ_ONLY is not integrity-frozen").toBe(true);
    const outcome = await h.run("fs.edit", { path: "a.txt", find: "hello", replace: "goodbye" });
    expect(outcome.denied?.reason).toContain("action_class_frozen");
    expect(readFileSync(join(h.workspace, "a.txt"), "utf8")).toBe("hello world");
  });

  it("writes normally with no freeze", async () => {
    const h = harness();
    expect((await h.run("fs.write", { path: "out.txt", content: "x" })).ok).toBe(true);
  });
});
