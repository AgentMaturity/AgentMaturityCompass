import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";

/**
 * fs.edit replaces text literally.
 *
 * `String.prototype.replace` expands `$$`, `$&`, `` $` `` and `$'` in the
 * replacement even when the pattern is a string, so an agent writing a shell
 * script or a price would get different bytes from the ones it sent. Each case
 * asserts the exact file contents after the edit.
 */
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

async function editOnce(before: string, find: string, replace: string): Promise<{ ok: boolean; after: string }> {
  const workspace = mkdtempSync(join(tmpdir(), "amc-fsedit-literal-"));
  dirs.push(workspace);
  const registry = new ToolRegistry();
  for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
  const pipeline = new ToolPipeline({ registry, workspace });
  const run = (name: string, args: Record<string, unknown>) =>
    pipeline.execute({ name, agentId: "alice", arguments: args, requestedMode: "EXECUTE" });

  const file = join(workspace, "f.txt");
  writeFileSync(file, before, "utf8");
  expect((await run("fs.read", { path: "f.txt" })).ok).toBe(true);
  const outcome = await run("fs.edit", { path: "f.txt", find, replace });
  return { ok: outcome.ok, after: readFileSync(file, "utf8") };
}

describe("fs.edit literal replacement", () => {
  const applied: ReadonlyArray<readonly [string, string, string, string, string]> = [
    ["$$ is not collapsed to $", "PRICE", "$$5", "cost: PRICE", "cost: $$5"],
    ["$& does not re-insert the match", "X", "a$&b", "1X2", "1a$&b2"],
    ["$` and $' do not insert the surrounding text", "X", "$`-$'", "1X2", "1$`-$'2"],
    ["$1 stays literal (guard)", "X", "$1", "1X2", "1$12"],
    ["a template literal stays literal (guard)", "const a = 1;", "const a = `${b}`;", "const a = 1;", "const a = `${b}`;"]
  ];

  for (const [title, find, replace, before, expected] of applied) {
    it(title, async () => {
      const result = await editOnce(before, find, replace);
      expect(result.ok).toBe(true);
      expect(result.after).toBe(expected);
    });
  }

  it("refuses a find text that appears twice and leaves the file unchanged", async () => {
    const result = await editOnce("x x", "x", "y");
    expect(result.ok).toBe(false);
    expect(result.after).toBe("x x");
  });

  it("refuses a find text that is absent and leaves the file unchanged", async () => {
    const result = await editOnce("abc", "missing", "y");
    expect(result.ok).toBe(false);
    expect(result.after).toBe("abc");
  });
});
