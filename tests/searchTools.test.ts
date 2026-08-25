import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { searchTools } from "../src/tools/builtin/searchTools.js";

/**
 * Search is capped, and every cap says what it dropped.
 *
 * A truncated result that does not admit to being truncated is a claim about
 * the codebase nobody checked: the model concludes "there are three matches"
 * when there were four hundred, and acts on it.
 *
 * Three caps rather than one, because each defeats the others on its own. A
 * match limit is defeated by a single 50 MB minified line; a byte limit lets a
 * million one-character matches through; a file limit says nothing about
 * either.
 */
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function harness(): {
  workspace: string;
  run: (name: string, args: Record<string, unknown>) => ReturnType<ToolPipeline["execute"]>;
} {
  const workspace = mkdtempSync(join(tmpdir(), "amc-search-"));
  dirs.push(workspace);
  const registry = new ToolRegistry();
  for (const tool of searchTools()) registry.define(tool);
  const pipeline = new ToolPipeline({ registry, workspace });
  return {
    workspace,
    run: (name, args) => pipeline.execute({ name, agentId: "alice", arguments: args, requestedMode: "EXECUTE" })
  };
}

function write(workspace: string, relative: string, content: string): void {
  const full = join(workspace, relative);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

describe("glob", () => {
  it("matches across directories with a globstar", async () => {
    const h = harness();
    write(h.workspace, "src/a.ts", "");
    write(h.workspace, "src/deep/b.ts", "");
    write(h.workspace, "src/c.js", "");

    const outcome = await h.run("glob", { pattern: "**/*.ts" });
    expect(outcome.output).toContain("src/a.ts");
    expect(outcome.output).toContain("src/deep/b.ts");
    expect(outcome.output, "a .js file is not a .ts file").not.toContain("c.js");
  });

  it("treats regex metacharacters in a pattern as literal", async () => {
    // `a.ts` as a regex would match `axts`. A glob is not a regex, and a
    // pattern silently reinterpreted as one matches the wrong files quietly.
    const h = harness();
    write(h.workspace, "a.ts", "");
    write(h.workspace, "axts", "");

    const outcome = await h.run("glob", { pattern: "a.ts" });
    expect(outcome.output).toContain("a.ts");
    expect(outcome.output).not.toContain("axts");
  });

  it("says how many matches it did not show", async () => {
    const h = harness();
    for (let i = 0; i < 30; i += 1) write(h.workspace, `f${i}.txt`, "");

    const outcome = await h.run("glob", { pattern: "*.txt", maxResults: 5 });
    expect(outcome.output).toContain("25 more matches not shown");
  });

  it("says plainly when nothing matched", async () => {
    const h = harness();
    write(h.workspace, "a.ts", "");
    const outcome = await h.run("glob", { pattern: "*.rs" });
    expect(outcome.output).toContain("no files match");
  });
});

describe("grep", () => {
  it("reports path, line number and the matching line", async () => {
    const h = harness();
    write(h.workspace, "src/a.ts", "one\nNEEDLE here\nthree\n");

    const outcome = await h.run("grep", { pattern: "NEEDLE" });
    expect(outcome.output).toContain("src/a.ts:2:NEEDLE here");
  });

  it("narrows to an include glob", async () => {
    const h = harness();
    write(h.workspace, "a.ts", "NEEDLE");
    write(h.workspace, "b.md", "NEEDLE");

    const outcome = await h.run("grep", { pattern: "NEEDLE", include: "*.ts" });
    expect(outcome.output).toContain("a.ts");
    expect(outcome.output).not.toContain("b.md");
  });

  it("stops at the match cap and says more exist", async () => {
    const h = harness();
    write(h.workspace, "many.txt", "hit\n".repeat(50));

    const outcome = await h.run("grep", { pattern: "hit", maxResults: 5 });
    expect(outcome.output).toContain("stopped at 5 matches");
    expect(outcome.output.split("\n").filter((l) => l.includes("many.txt")).length).toBe(5);
  });

  it("stops at the BYTE cap even when the match count is low", async () => {
    // One enormous line defeats a match limit entirely. Without a byte bound,
    // "maxResults: 100" is not a bound on anything the model has to read.
    const h = harness();
    write(h.workspace, "wide.txt", `${"NEEDLE".padEnd(50_000, "x")}\n`.repeat(20));

    const outcome = await h.run("grep", { pattern: "NEEDLE", maxResults: 100, maxBytes: 2_000 });
    expect(Buffer.byteLength(outcome.output, "utf8")).toBeLessThan(6_000);
    expect(outcome.output).toContain("stopped at 2000 bytes");
  });

  it("clips a very long line rather than emitting it whole", async () => {
    const h = harness();
    write(h.workspace, "wide.txt", `${"NEEDLE".padEnd(20_000, "x")}\n`);

    const outcome = await h.run("grep", { pattern: "NEEDLE" });
    expect(outcome.output).toContain("line clipped");
    expect(outcome.output.length, "the clip is what keeps one line from being the whole budget").toBeLessThan(2_000);
  });

  it("skips binary files", async () => {
    const h = harness();
    // A NUL byte plus a REAL occurrence of the search string. The previous
    // fixture interleaved the NUL inside the word, so grep would not have
    // matched it even with the binary check removed.
    writeFileSync(
      join(h.workspace, "blob.bin"),
      Buffer.concat([Buffer.from([0x00, 0x01, 0x02]), Buffer.from("NEEDLE in a binary")])
    );
    write(h.workspace, "text.txt", "NEEDLE");

    const outcome = await h.run("grep", { pattern: "NEEDLE" });
    expect(outcome.output).toContain("text.txt");
    expect(outcome.output, "a NUL byte means this is not text to quote at a model").not.toContain("blob.bin");
  });

  it("refuses an invalid regular expression instead of matching nothing", async () => {
    // Silently returning "no matches" for a broken pattern would have the
    // model conclude the codebase lacks something it never searched for.
    const h = harness();
    write(h.workspace, "a.txt", "hello");
    const outcome = await h.run("grep", { pattern: "([unclosed" });

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("invalid search pattern");
  });

  it("says plainly when there are no matches", async () => {
    const h = harness();
    write(h.workspace, "a.txt", "hello");
    expect((await h.run("grep", { pattern: "ABSENT" })).output).toContain("no matches");
  });
});

describe("the walk stays inside the workspace", () => {
  it("does not follow a symlinked directory out of the workspace", async () => {
    // A link pointing outside would let search read exactly what the
    // workspace bound exists to keep out.
    const h = harness();
    const outside = mkdtempSync(join(tmpdir(), "amc-outside-"));
    dirs.push(outside);
    writeFileSync(join(outside, "secret.txt"), "OUTSIDE-SECRET");
    symlinkSync(outside, join(h.workspace, "escape"));
    write(h.workspace, "inside.txt", "fine");

    const globbed = await h.run("glob", { pattern: "**/*.txt" });
    expect(globbed.output).toContain("inside.txt");
    expect(globbed.output).not.toContain("secret.txt");

    const grepped = await h.run("grep", { pattern: "OUTSIDE-SECRET" });
    expect(grepped.output, "the search must not read through the link").toContain("no matches");
  });

  it("does not return a symlinked FILE that points outside", async () => {
    // A link to a file is as much a way out as a link to a directory: glob
    // returning it would hand the model a path that fs.read then refuses, and
    // any consumer walking the list itself would read straight through.
    const h = harness();
    const outside = mkdtempSync(join(tmpdir(), "amc-outside-"));
    dirs.push(outside);
    writeFileSync(join(outside, "secret.txt"), "OUTSIDE-SECRET");
    symlinkSync(join(outside, "secret.txt"), join(h.workspace, "innocent.txt"));
    write(h.workspace, "real.txt", "fine");

    const outcome = await h.run("glob", { pattern: "*.txt" });
    expect(outcome.output).toContain("real.txt");
    expect(outcome.output, "a link is not a file in this workspace").not.toContain("innocent.txt");
  });

  it("skips directories that are never worth walking", async () => {
    const h = harness();
    write(h.workspace, "node_modules/pkg/index.js", "NEEDLE");
    write(h.workspace, ".git/config", "NEEDLE");
    write(h.workspace, "src/real.ts", "NEEDLE");

    const outcome = await h.run("grep", { pattern: "NEEDLE" });
    expect(outcome.output).toContain("src/real.ts");
    expect(outcome.output).not.toContain("node_modules");
    expect(outcome.output).not.toContain(".git");
  });
});
