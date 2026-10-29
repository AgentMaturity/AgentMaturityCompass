import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../dist/tools/toolRegistry.js";
import { ToolPipeline } from "../dist/tools/toolPipeline.js";
import { searchTools } from "../dist/tools/builtin/searchTools.js";

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

const execFileAsync = promisify(execFile);

/** A broken regex or missing worker termination must fail without hanging Vitest. */
async function isolatedSearch(workspace: string, args: Record<string, unknown>, cancelAfterMs?: number, name = "grep"): Promise<{
  result: { ok: boolean; output: string; timedOut?: boolean };
  ticks: number;
  elapsed: number;
}> {
  const modulePath = fileURLToPath(new URL("../dist/tools/builtin/searchTools.js", import.meta.url));
  const source = `
    import { pathToFileURL } from "node:url";
    const { searchTools } = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
    const controller = new AbortController();
    let ticks = 0;
    const heartbeat = setInterval(() => { ticks += 1; }, 5);
    const cancelAfterMs = ${JSON.stringify(cancelAfterMs ?? null)};
    if (cancelAfterMs === -1) controller.abort();
    const cancellation = cancelAfterMs !== null && cancelAfterMs >= 0
      ? setTimeout(() => controller.abort(), cancelAfterMs) : undefined;
    const started = performance.now();
    const result = await searchTools().find(tool => tool.name === ${JSON.stringify(name)}).body({
      workspace: ${JSON.stringify(workspace)}, arguments: ${JSON.stringify(args)}, signal: controller.signal
    });
    clearInterval(heartbeat);
    clearTimeout(cancellation);
    console.log(JSON.stringify({ result, ticks, elapsed: performance.now() - started }));
  `;
  const child = await execFileAsync(process.execPath, ["--input-type=module", "--eval", source], {
    timeout: 3_000,
    maxBuffer: 100_000
  });
  return JSON.parse(child.stdout) as { result: { ok: boolean; output: string; timedOut?: boolean }; ticks: number; elapsed: number };
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

  it("times out catastrophic regexes while the main event loop stays responsive", async () => {
    const h = harness();
    write(h.workspace, "slow.txt", `${"a".repeat(50_000)}b`);

    const outcome = await isolatedSearch(h.workspace, { pattern: "(a+)+$", timeoutMs: 150 });
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.output).toContain("search exceeded 150 ms; results incomplete");
    expect(outcome.result.timedOut).toBe(true);
    expect(outcome.elapsed).toBeLessThan(1_500);
    expect(outcome.ticks).toBeGreaterThan(2);
  });

  it("cancels and terminates a worker blocked inside a regex", async () => {
    const h = harness();
    write(h.workspace, "slow.txt", `${"a".repeat(50_000)}b`);

    const outcome = await isolatedSearch(h.workspace, { pattern: "(a+)+$", timeoutMs: 2_000 }, 150);
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.output).toContain("search cancelled; results incomplete");
    expect(outcome.elapsed).toBeLessThan(1_500);
    expect(outcome.ticks).toBeGreaterThan(2);
  });

  it("refuses an already cancelled search", async () => {
    const h = harness();
    write(h.workspace, "a.txt", "NEEDLE");
    const outcome = await isolatedSearch(h.workspace, { pattern: "NEEDLE" }, -1);
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.output).toContain("search cancelled; results incomplete");
    expect(outcome.result.output).not.toContain("a.txt:1:NEEDLE");
  });

  it("caps total input bytes even when there are no matches", async () => {
    const h = harness();
    write(h.workspace, "a.txt", "x".repeat(60));
    write(h.workspace, "b.txt", "x".repeat(60));
    write(h.workspace, "c.txt", "NEEDLE");
    const outcome = await h.run("grep", { pattern: "NEEDLE", maxScannedBytes: 100 });
    expect(outcome.output).toContain("stopped at 100 bytes scanned; results incomplete");
    expect(outcome.output).not.toContain("c.txt:1:NEEDLE");
    expect(outcome.output).not.toContain("no matches");
  });

  it("honours an explicit case-insensitive flag", async () => {
    const h = harness();
    write(h.workspace, "upper.txt", "NEEDLE");
    expect((await h.run("grep", { pattern: "needle" })).output).toContain("no matches");
    expect((await h.run("grep", { pattern: "needle", caseInsensitive: true })).output).toContain("upper.txt:1:NEEDLE");
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

describe("repository ignore files", () => {
  it.each(["glob", "grep"])("refuses unsupported POSIX named classes instead of silently bypassing ignore rules in %s", async (name) => {
    const h = harness();
    write(h.workspace, ".gitignore", "[[:digit:]].txt\n");
    write(h.workspace, "7.txt", "NEEDLE");
    const outcome = await h.run(name, { pattern: name === "glob" ? "**/*" : "NEEDLE" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("unsupported POSIX named character classes");
    expect(outcome.output).toContain("results incomplete");
    expect(outcome.output).not.toContain("7.txt");
    expect(outcome.output).not.toContain("NEEDLE");
  });

  it("times out a catastrophic ignore rule during glob while the main event loop stays responsive", async () => {
    const h = harness();
    write(h.workspace, ".gitignore", `${"*a".repeat(20)}*b\n`);
    write(h.workspace, `${"a".repeat(200)}.txt`, "NEEDLE");
    const outcome = await isolatedSearch(h.workspace, { pattern: "**/*", timeoutMs: 150 }, undefined, "glob");
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.output).toContain("search exceeded 150 ms; results incomplete");
    expect(outcome.result.timedOut).toBe(true);
    expect(outcome.elapsed).toBeLessThan(1_500);
    expect(outcome.ticks).toBeGreaterThan(2);
  });

  it.each(["glob", "grep"])("refuses oversized ignore files instead of leaking excluded files through %s", async (name) => {
    const h = harness();
    write(h.workspace, ".gitignore", `${"# comment\n".repeat(8_000)}hidden.txt\n`);
    write(h.workspace, "hidden.txt", "NEEDLE");
    const outcome = await h.run(name, { pattern: name === "glob" ? "**/*" : "NEEDLE" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("ignore file .gitignore exceeded 64000 bytes or changed during reading; results incomplete");
    expect(outcome.output).not.toContain("hidden.txt");
    expect(outcome.output).not.toContain("NEEDLE");
  });

  it("honours ignore character classes, escapes and significant spaces without changing glob syntax", async () => {
    const h = harness();
    write(h.workspace, ".gitignore", [
      "# a comment", "letter[0-9].txt", "negated[!a-c].txt", "\\#literal.txt", "\\!literal.txt",
      "space\\ name.txt", "trailing.txt   ", "trailing-space\\ ", " leading.txt", "cache/**/generated[0-9].js", "priority.txt"
    ].join("\n"));
    write(h.workspace, ".ignore", "!priority.txt\n");
    const excluded = ["letter7.txt", "negatedz.txt", "#literal.txt", "!literal.txt", "space name.txt", "trailing.txt", "trailing-space ", " leading.txt", "cache/generated1.js", "cache/deep/generated2.js"];
    const included = ["letterx.txt", "negatedb.txt", "ordinary.txt", "trailing-space", "priority.txt", "literal[ab].txt", "literala.txt"];
    for (const path of [...excluded, ...included]) write(h.workspace, path, "NEEDLE");
    for (const name of ["glob", "grep"]) {
      const outcome = await h.run(name, { pattern: name === "glob" ? "**/*" : "NEEDLE" });
      const paths = outcome.output.split("\n").map(line => name === "grep" ? line.split(":1:")[0] : line);
      for (const path of excluded) expect(paths).not.toContain(path);
      for (const path of included) expect(paths).toContain(path);
    }
    const literalGlob = await h.run("glob", { pattern: "literal[ab].txt" });
    expect(literalGlob.output).toBe("literal[ab].txt");
  });

  it("applies root and nested rules, negation and explicit includeIgnored to both searches", async () => {
    const h = harness();
    write(h.workspace, ".gitignore", "build/\n*.log\n!keep.log\n/root-only.txt\n");
    write(h.workspace, "src/.gitignore", "local.txt\n");
    write(h.workspace, ".ignore", "custom.txt\n");
    for (const path of ["build/out.js", "src/drop.log", "keep.log", "root-only.txt", "src/root-only.txt", "src/local.txt", "src/real.js", "custom.txt"]) {
      write(h.workspace, path, "NEEDLE");
    }
    for (const name of ["glob", "grep"]) {
      const args = name === "glob" ? { pattern: "**/*" } : { pattern: "NEEDLE" };
      const outcome = await h.run(name, args);
      expect(outcome.output).toContain("keep.log");
      expect(outcome.output).toContain("src/root-only.txt");
      expect(outcome.output).toContain("src/real.js");
      expect(outcome.output).not.toContain("build/out.js");
      expect(outcome.output).not.toContain("src/drop.log");
      expect(outcome.output).not.toContain("src/local.txt");
      expect(outcome.output).not.toContain("custom.txt");
      expect(outcome.output.split("\n").some(line => line.startsWith("root-only.txt"))).toBe(false);
      const explicit = await h.run(name, { ...args, includeIgnored: true });
      expect(explicit.output).toContain("build/out.js");
      expect(explicit.output).toContain("src/local.txt");
      expect(explicit.output).toContain("custom.txt");
    }
  });
});

describe("safe search file opens", () => {
  it("bounds a read before allocating and does not call a capped prefix a complete file", async () => {
    const h = harness();
    write(h.workspace, "wide.txt", "0123456789");
    const { readWorkspaceFile } = await import("../dist/tools/builtin/workspaceWalk.js");
    const prefix = readWorkspaceFile(h.workspace, "wide.txt", 4, 20);
    expect(prefix?.bytes.toString()).toBe("0123");
    expect(prefix?.complete).toBe(false);
    const oversized = readWorkspaceFile(h.workspace, "wide.txt", 100, 4);
    expect(oversized?.bytes.length).toBe(0);
    expect(oversized?.complete).toBe(false);
  });

  it("does not call a file complete if it grew during the read", async () => {
    const h = harness();
    write(h.workspace, "growing.txt", "NEEDLE");
    const modulePath = fileURLToPath(new URL("../dist/tools/builtin/workspaceWalk.js", import.meta.url));
    const source = `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      import { pathToFileURL } from "node:url";
      const { readWorkspaceFile } = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
      const original = fs.readSync;
      let grew = false;
      fs.readSync = (...args) => {
        const count = original(...args);
        if (!grew) { grew = true; fs.appendFileSync(${JSON.stringify(join(h.workspace, "growing.txt"))}, "-GROWN"); }
        return count;
      };
      syncBuiltinESMExports();
      const result = readWorkspaceFile(${JSON.stringify(h.workspace)}, "growing.txt", 100);
      console.log(JSON.stringify({ complete: result?.complete, grew }));
    `;
    const child = await execFileAsync(process.execPath, ["--input-type=module", "--eval", source], { timeout: 3_000 });
    expect(JSON.parse(child.stdout)).toEqual({ complete: false, grew: true });
  });

  it.each(["fifo", "symlink", "parent-symlink", "file-replaced"])("refuses a %s substituted immediately before open", async (replacement) => {
    const h = harness();
    const outside = mkdtempSync(join(tmpdir(), "amc-search-outside-"));
    dirs.push(outside);
    write(outside, "target.txt", "OUTSIDE-SECRET");
    write(h.workspace, "folder/target.txt", "INSIDE");
    const modulePath = fileURLToPath(new URL("../dist/tools/builtin/workspaceWalk.js", import.meta.url));
    const source = `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      import { execFileSync } from "node:child_process";
      import { pathToFileURL } from "node:url";
      import { join } from "node:path";
      const { readWorkspaceFile } = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
      const workspace = fs.realpathSync(${JSON.stringify(h.workspace)});
      const outside = ${JSON.stringify(outside)};
      const target = join(workspace, "folder/target.txt");
      const original = fs.openSync;
      let swapped = false;
      fs.openSync = (path, ...args) => {
        if (String(path) === target && !swapped) {
          swapped = true;
          if (${JSON.stringify(replacement)} === "file-replaced") {
            const descriptor = original(path, ...args);
            fs.renameSync(target, join(workspace, "original.txt"));
            fs.writeFileSync(target, "REPLACEMENT");
            return descriptor;
          }
          if (${JSON.stringify(replacement)} === "parent-symlink") {
            fs.renameSync(join(workspace, "folder"), join(workspace, "held"));
            fs.symlinkSync(outside, join(workspace, "folder"));
          } else {
            fs.unlinkSync(target);
            if (${JSON.stringify(replacement)} === "fifo") execFileSync("mkfifo", [target]);
            else fs.symlinkSync(join(outside, "target.txt"), target);
          }
        }
        return original(path, ...args);
      };
      syncBuiltinESMExports();
      const result = readWorkspaceFile(workspace, "folder/target.txt", 100);
      console.log(JSON.stringify({ refused: result === null, swapped }));
    `;
    const child = await execFileAsync(process.execPath, ["--input-type=module", "--eval", source], { timeout: 3_000 });
    expect(JSON.parse(child.stdout)).toEqual({ refused: true, swapped: true });
  });
});
