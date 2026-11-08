import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { lsTool } from "../src/tools/builtin/lsTool.js";

/** ls (SH-TOOLS-02): one level, sorted, ignore-aware, capped and honest, never inside .git/.amc or outside the workspace. */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function harness() {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-ls-")));
  dirs.push(workspace);
  const registry = new ToolRegistry();
  registry.define(lsTool());
  const pipeline = new ToolPipeline({ registry, workspace });
  mkdirSync(join(workspace, "src/nested"), { recursive: true });
  mkdirSync(join(workspace, ".git/hooks"), { recursive: true });
  mkdirSync(join(workspace, "build"));
  writeFileSync(join(workspace, "src/a.ts"), "aa");
  writeFileSync(join(workspace, "src/b.ts"), "b");
  writeFileSync(join(workspace, "src/ignored.log"), "log");
  writeFileSync(join(workspace, ".gitignore"), "*.log\nbuild/\n");
  symlinkSync(join(workspace, "src/a.ts"), join(workspace, "src/link.ts"));
  const run = (args: Record<string, unknown>) => pipeline.execute({ name: "ls", agentId: "a", arguments: args, requestedMode: "EXECUTE" });
  return { workspace, run };
}

describe("ls", () => {
  it("lists the root with no arguments and a subdirectory by path, applying ignore rules", async () => {
    const h = harness();
    const root = await h.run({});
    expect(root.ok).toBe(true);
    expect(root.output.split("\n")).toEqual(["f .gitignore  13", "d src/", "[amc: 1 entries hidden by ignore rules; pass includeIgnored to see them]"]);
    const src = await h.run({ path: "src" });
    expect(src.output.split("\n")).toEqual(["f a.ts  2", "f b.ts  1", "l link.ts", "d nested/", "[amc: 1 entries hidden by ignore rules; pass includeIgnored to see them]"]);
    const all = await h.run({ path: "./src", includeIgnored: true });
    expect(all.output).toContain("f ignored.log  3");
    expect(all.output).not.toContain("hidden by ignore rules");
  });

  it("caps the listing and says how many were left out", async () => {
    const h = harness();
    const outcome = await h.run({ path: "src", maxEntries: 2, includeIgnored: true });
    expect(outcome.output.split("\n")).toEqual(["f a.ts  2", "f b.ts  1", "[amc: 3 more entries not shown; raise maxEntries or list a subdirectory]"]);
  });

  it("refuses .git, a path outside the workspace, and a file path", async () => {
    const h = harness();
    expect((await h.run({ path: ".git" })).output).toMatch(/protected|\.git/);
    expect((await h.run({ path: "../" })).output).toContain("escapes the workspace");
    expect((await h.run({ path: "src/a.ts" })).output).toContain("is not a directory");
    expect((await h.run({ path: "src/nested" })).output).toContain("has no entries to show");
  });
});
