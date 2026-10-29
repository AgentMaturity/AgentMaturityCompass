import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function harness() {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-fs-bounds-")));
  directories.push(workspace);
  const ledger = new ReadBeforeEditLedger();
  const registry = new ToolRegistry();
  for (const tool of fsTools({ ledger })) registry.define(tool);
  const pipeline = new ToolPipeline({ registry, workspace });
  return {
    workspace,
    ledger,
    path: (name: string) => join(workspace, name),
    run: (name: string, args: Record<string, unknown>) => pipeline.execute({ name, agentId: "alice", arguments: args, requestedMode: "EXECUTE" })
  };
}

// A child bounds regressions that would otherwise block Vitest's own event loop.
function child(workspace: string, body: string, setup = "") {
  const imports = ["fsTools", "readBeforeEdit"].map(name => new URL(`../dist/tools/builtin/${name}.js`, import.meta.url).href);
  return spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import fs from "node:fs";
    import { execFileSync } from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    import { dirname } from "node:path";
    const workspace = ${JSON.stringify(workspace)};
    const target = workspace + "/target";
    ${setup}
    syncBuiltinESMExports();
    const { fsTools } = await import(${JSON.stringify(imports[0])});
    const { ReadBeforeEditLedger } = await import(${JSON.stringify(imports[1])});
    const ledger = new ReadBeforeEditLedger();
    const tools = fsTools({ ledger });
    async function run(name, args) {
      const tool = tools.find(tool => tool.name === name);
      try {
        return await tool.body({ token: "bounds", callId: "bounds", rootCallId: "bounds", name, agentId: "alice", workspace,
          actionClass: tool.actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", arguments: args, parentToken: null });
      } catch (error) { return { ok: false, output: error.message }; }
    }
    ${body}
  `], { cwd: resolve("."), encoding: "utf8", timeout: 5_000 });
}

function childResult(result: ReturnType<typeof child>): Record<string, unknown> {
  expect(result.error?.message, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe("fs.read UTF-8 byte bounds", () => {
  it.each([1, 2, 3, 4])("does not split a multibyte character at maxBytes %i", async (maxBytes) => {
    const h = harness();
    writeFileSync(h.path("utf8.txt"), "A😀B");
    const outcome = await h.run("fs.read", { path: "utf8.txt", maxBytes });
    expect(outcome.ok).toBe(true);
    expect(outcome.output).not.toContain("\uFFFD");
    expect(outcome.output.split("\n")[0]).toBe("A");
    expect(outcome.bytes).toBe(1);
    expect(outcome.output).toContain("5 more");
  });

  it("keeps complete multibyte characters at the byte limit, including numbered ranges", async () => {
    const h = harness();
    writeFileSync(h.path("utf8.txt"), "é😀\nlast\n");
    expect((await h.run("fs.read", { path: "utf8.txt", maxBytes: 6 })).output.split("\n")[0]).toBe("é😀");
    const outcome = await h.run("fs.read", { path: "utf8.txt", offset: 1, limit: 1, maxBytes: 10 });
    expect(outcome.output).toBe("     1\té\n[amc: truncated at 10 bytes; 4 more]\n[amc: lines 1-1 of 2]");
    expect(outcome.bytes).toBe(9);
  });

  it("retains only the requested bytes while hashing a 200 MiB file", () => {
    const h = harness();
    const descriptor = openSync(h.path("target"), "w");
    try { ftruncateSync(descriptor, 200 * 1024 * 1024); } finally { closeSync(descriptor); }
    const result = childResult(child(h.workspace, `
      const before = process.resourceUsage().maxRSS;
      const result = await run("fs.read", { path: "target", maxBytes: 1024 });
      console.log(JSON.stringify({ ok: result.ok, bytes: result.bytes,
        retainedGrowthKiB: process.resourceUsage().maxRSS - before, observed: ledger.hasObserved("alice", target) }));
    `));
    expect(result).toMatchObject({ ok: true, bytes: 1024, observed: true });
    expect(result.retainedGrowthKiB).toBeLessThan(64 * 1024);
  });

  it("selects lines across stream chunks and still observes changes beyond the selected range", async () => {
    const h = harness();
    const content = `${"x".repeat(65_535)}é\nsecond\nthird\n`;
    writeFileSync(h.path("chunks.txt"), content);
    expect((await h.run("fs.read", { path: "chunks.txt", offset: 2, limit: 1 })).output)
      .toBe("     2\tsecond\n[amc: lines 2-2 of 3]");
    writeFileSync(h.path("chunks.txt"), content.replace("third", "changed"));
    const outcome = await h.run("fs.edit", { path: "chunks.txt", find: "changed", replace: "edited" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("changed since you read it");
  });
});

describe("filesystem regular-file admission", () => {
  it("refuses FIFO reads, writes, edits and ledger writes without blocking", () => {
    const h = harness();
    execFileSync("mkfifo", [h.path("target")]);
    const result = childResult(child(h.workspace, `
      const started = performance.now();
      const outcomes = [];
      for (const [name, args] of [["fs.read", {}], ["fs.write", { content: "x" }], ["fs.edit", { find: "x", replace: "y" }]]) {
        outcomes.push(await run(name, { path: "target", ...args }));
      }
      outcomes.push(ledger.mayWrite("alice", target));
      console.log(JSON.stringify({ outcomes, durationMs: performance.now() - started }));
    `));
    const outcomes = result.outcomes as { ok: boolean; output?: string; reason?: string }[];
    expect(outcomes).toHaveLength(4);
    expect(result.durationMs).toBeLessThan(1_000);
    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(false);
      expect(outcome.output ?? outcome.reason).toContain("not a regular file");
    }
  });

  it("refuses directories as existing nonregular files instead of treating them as absent", async () => {
    const h = harness();
    mkdirSync(h.path("directory"));
    expect(h.ledger.mayWrite("alice", h.path("directory"))).toMatchObject({ ok: false, reason: expect.stringContaining("not a regular file") });
    for (const name of ["fs.read", "fs.write", "fs.edit"]) {
      const outcome = await h.run(name, { path: "directory", content: "x", find: "x", replace: "y" });
      expect(outcome.ok).toBe(false);
      expect(outcome.output).toContain("not a regular file");
    }
  });

  it("opens nonblocking and checks the descriptor when a regular file becomes a FIFO after admission", () => {
    const h = harness();
    writeFileSync(h.path("target"), "original");
    const result = childResult(child(h.workspace, `
      const outcome = await run("fs.read", { path: "target" });
      console.log(JSON.stringify({ ...outcome,
        nonblocking: (openedFlags & fs.constants.O_NONBLOCK) !== 0, nofollow: (openedFlags & fs.constants.O_NOFOLLOW) !== 0 }));
    `, `
      const originalOpen = fs.openSync;
      let replaced = false;
      let openedFlags = 0;
      fs.openSync = function(path, flags, ...args) {
        if (path === target && !replaced) {
          replaced = true;
          openedFlags = flags;
          fs.unlinkSync(target);
          execFileSync("mkfifo", [target]);
        }
        return originalOpen.call(this, path, flags, ...args);
      };
    `));
    expect(result).toMatchObject({ ok: false, output: expect.stringContaining("not a regular file"), nonblocking: true, nofollow: true });
  });

  it("does not follow a symlink swapped in immediately before open", () => {
    const h = harness();
    writeFileSync(h.path("target"), "original");
    writeFileSync(h.path("other"), "SECRET");
    const result = childResult(child(h.workspace, `
      console.log(JSON.stringify(await run("fs.read", { path: "target" })));
    `, `
      const originalOpen = fs.openSync;
      let replaced = false;
      fs.openSync = function(path, flags, ...args) {
        if (path === target && !replaced) {
          replaced = true;
          fs.unlinkSync(target);
          fs.symlinkSync(workspace + "/other", target);
        }
        return originalOpen.call(this, path, flags, ...args);
      };
    `));
    expect(result.ok).toBe(false);
    expect(result.output).not.toContain("SECRET");
  });

  it("uses stat for absence and refuses errors instead of probing file contents", () => {
    const h = harness();
    writeFileSync(h.path("target"), "original");
    const result = childResult(child(h.workspace, `
      console.log(JSON.stringify({ existing: ledger.mayWrite("alice", target), missing: ledger.mayWrite("alice", target + ".missing") }));
    `, `
      const originalRead = fs.readFileSync;
      fs.readFileSync = function(path, ...args) {
        if (path === target) throw new Error("content probe must not decide existence");
        return originalRead.call(this, path, ...args);
      };
    `));
    expect(result.existing).toMatchObject({ ok: false, reason: expect.stringContaining("read the file, then retry") });
    expect(result.missing).toEqual({ ok: true });
  });

  it("refuses a parent-directory symlink swapped in immediately before open", () => {
    const h = harness();
    const nested = h.path("parent");
    mkdirSync(nested);
    mkdirSync(h.path("elsewhere"));
    writeFileSync(join(nested, "target"), "original");
    writeFileSync(h.path("elsewhere/target"), "ESCAPED-SECRET");
    const result = childResult(child(nested, `
      console.log(JSON.stringify(await run("fs.read", { path: "target" })));
    `, `
      const originalOpen = fs.openSync;
      let replaced = false;
      fs.openSync = function(path, flags, ...args) {
        if (path === target && !replaced) {
          replaced = true;
          fs.renameSync(workspace, workspace + ".old");
          fs.symlinkSync(dirname(workspace) + "/elsewhere", workspace, "dir");
        }
        return originalOpen.call(this, path, flags, ...args);
      };
    `));
    expect(result).toMatchObject({ ok: false, output: expect.stringContaining("changed location") });
    expect(result.output).not.toContain("ESCAPED-SECRET");
  });

  it("refuses a file changed during the streamed observation", () => {
    const h = harness();
    writeFileSync(h.path("target"), "x".repeat(100_000));
    const result = childResult(child(h.workspace, `
      activeRead = true;
      const outcome = await run("fs.read", { path: "target", maxBytes: 10 });
      console.log(JSON.stringify({ ...outcome, observed: ledger.hasObserved("alice", target) }));
    `, `
      const originalRead = fs.readSync;
      let changed = false;
      let activeRead = false;
      fs.readSync = function(...args) {
        const count = originalRead.apply(this, args);
        if (activeRead && !changed && count > 0) {
          changed = true;
          fs.appendFileSync(target, "changed");
        }
        return count;
      };
    `));
    expect(result).toMatchObject({ ok: false, output: expect.stringContaining("changed while being read"), observed: false });
  });

  it("refuses stat permission errors instead of treating them as absence", () => {
    const h = harness();
    writeFileSync(h.path("target"), "original");
    const result = childResult(child(h.workspace, `
      console.log(JSON.stringify(ledger.mayWrite("alice", target)));
    `, `
      const originalStat = fs.lstatSync;
      fs.lstatSync = function(path, ...args) {
        if (path === target) throw Object.assign(new Error("stat denied"), { code: "EACCES" });
        return originalStat.call(this, path, ...args);
      };
    `));
    expect(result).toEqual({ ok: false, reason: "stat denied" });
  });


  it("refuses a different regular inode swapped in immediately before open", () => {
    const h = harness();
    writeFileSync(h.path("target"), "original");
    const result = childResult(child(h.workspace, `
      console.log(JSON.stringify(await run("fs.read", { path: "target" })));
    `, `
      const originalOpen = fs.openSync;
      let replaced = false;
      fs.openSync = function(path, flags, ...args) {
        if (path === target && !replaced) {
          replaced = true;
          fs.renameSync(target, target + ".old");
          fs.writeFileSync(target, "replacement");
        }
        return originalOpen.call(this, path, flags, ...args);
      };
    `));
    expect(result).toMatchObject({ ok: false, output: expect.stringContaining("changed location") });
  });

  it("does not open a path whose parent changed after lstat", () => {
    const h = harness();
    const nested = h.path("parent");
    mkdirSync(nested);
    mkdirSync(h.path("elsewhere"));
    writeFileSync(join(nested, "target"), "original");
    writeFileSync(h.path("elsewhere/target"), "ESCAPED-SECRET");
    const result = childResult(child(nested, `
      const outcome = await run("fs.read", { path: "target" });
      console.log(JSON.stringify({ ...outcome, openedTarget }));
    `, `
      const originalStat = fs.lstatSync;
      const originalOpen = fs.openSync;
      let replaced = false;
      let openedTarget = false;
      fs.lstatSync = function(path, ...args) {
        const status = originalStat.call(this, path, ...args);
        if (path === target && !replaced) {
          replaced = true;
          fs.renameSync(workspace, workspace + ".old");
          fs.symlinkSync(dirname(workspace) + "/elsewhere", workspace, "dir");
        }
        return status;
      };
      fs.openSync = function(path, ...args) {
        if (path === target) openedTarget = true;
        return originalOpen.call(this, path, ...args);
      };
    `));
    expect(result).toMatchObject({ ok: false, output: expect.stringContaining("changed location"), openedTarget: false });
  });

});
