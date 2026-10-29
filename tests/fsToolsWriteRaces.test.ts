import * as fs from "node:fs";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { sha256Hex } from "../src/utils/hash.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-fs-write-race-")));
  directories.push(workspace);
  const registry = new ToolRegistry();
  const ledger = new ReadBeforeEditLedger();
  for (const tool of fsTools({ ledger })) registry.define(tool);
  const pipeline = new ToolPipeline({ registry, workspace });
  return { workspace, ledger, path: join(workspace, "file.txt"),
    run: (name: string, args: Record<string, unknown>) => pipeline.execute({ name, agentId: "alice", arguments: args, requestedMode: "EXECUTE" }) };
}

function afterStaging(race: () => void) {
  const sync = fs.fsyncSync;
  let armed = true;
  vi.spyOn(fs, "fsyncSync").mockImplementation(fd => {
    sync(fd);
    if (armed) { armed = false; race(); }
  });
}

describe("filesystem commit freshness", () => {
  it("checks a supplied write snapshot against the agent observation", () => {
    const f = fixture();
    writeFileSync(f.path, "observed");
    f.ledger.recordRead("alice", f.path, Buffer.from("observed"));
    expect(f.ledger.mayWrite("alice", f.path, sha256Hex("unobserved"))).toMatchObject({ ok: false });
    expect(readFileSync(f.path, "utf8")).toBe("observed");
  });

  it.each(["fs.write", "fs.edit"])("%s binds authorization to the exact planning snapshot", async name => {
    class SnapshotRaceLedger extends ReadBeforeEditLedger {
      override mayEdit(agent: string, path: string, snapshotDigest?: string) {
        writeFileSync(path, "observed\n");
        const verdict = super.mayEdit(agent, path, snapshotDigest);
        writeFileSync(path, "unobserved\n");
        return verdict;
      }
    }
    const f = fixture();
    const ledger = new SnapshotRaceLedger();
    const registry = new ToolRegistry();
    for (const tool of fsTools({ ledger })) registry.define(tool);
    const pipeline = new ToolPipeline({ registry, workspace: f.workspace });
    writeFileSync(f.path, "observed\n");
    ledger.recordRead("alice", f.path, Buffer.from("observed\n"));
    writeFileSync(f.path, "unobserved\n");
    const args = name === "fs.write" ? { content: "replacement\n" } : { find: "unobserved", replace: "replacement" };
    const outcome = await pipeline.execute({ name, agentId: "alice", arguments: { path: "file.txt", ...args }, requestedMode: "EXECUTE" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("changed since you read");
    expect(readFileSync(f.path, "utf8")).toBe("unobserved\n");
  });

  it.each(["fs.write", "fs.edit"])("%s refuses a change made while the replacement is staged", async name => {
    const f = fixture();
    writeFileSync(f.path, "original\n");
    await f.run("fs.read", { path: "file.txt" });
    afterStaging(() => writeFileSync(f.path, "competing write\n"));
    const args = name === "fs.write" ? { content: "replacement\n" } : { find: "original", replace: "replacement" };
    const outcome = await f.run(name, { path: "file.txt", ...args });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toMatch(/changed.*read.*again/);
    expect(readFileSync(f.path, "utf8")).toBe("competing write\n");
    expect(f.ledger.mayEdit("alice", f.path).ok, "a refused write must not refresh the observation").toBe(false);
    expect(readdirSync(f.workspace).filter(name => name.startsWith(".amc-tmp-"))).toEqual([]);
  });

  it("rechecks the read observation after staging even when file bytes stay unchanged", async () => {
    const f = fixture();
    writeFileSync(f.path, "original\n");
    await f.run("fs.read", { path: "file.txt" });
    afterStaging(() => f.ledger.forget("alice"));
    const outcome = await f.run("fs.edit", { path: "file.txt", find: "original", replace: "replacement" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("reading");
    expect(readFileSync(f.path, "utf8")).toBe("original\n");
  });

  it("refuses a file created between the absence check and exclusive open", async () => {
    const f = fixture();
    const open = fs.openSync;
    let raced = false;
    vi.spyOn(fs, "openSync").mockImplementation((path, flags, mode) => {
      if (!raced && String(path) === f.path) {
        raced = true;
        writeFileSync(f.path, "created by another writer\n");
      }
      return open(path, flags, mode);
    });
    const outcome = await f.run("fs.write", { path: "file.txt", content: "must not overwrite\n" });
    expect(raced).toBe(true);
    expect(outcome.ok).toBe(false);
    expect(readFileSync(f.path, "utf8")).toBe("created by another writer\n");
    expect(f.ledger.hasObserved("alice", f.path)).toBe(false);
    expect(readdirSync(f.workspace)).toEqual(["file.txt"]);
  });

  it("rechecks containment after creating a new parent directory", async () => {
    const f = fixture();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-fs-create-outside-")));
    directories.push(outside);
    const parent = join(f.workspace, "sub");
    const mkdir = fs.mkdirSync;
    vi.spyOn(fs, "mkdirSync").mockImplementation((path, options) => {
      const result = mkdir(path, options);
      if (String(path) === parent) {
        renameSync(parent, join(f.workspace, "moved"));
        symlinkSync(outside, parent);
      }
      return result;
    });
    const outcome = await f.run("fs.write", { path: "sub/file.txt", content: "must stay inside" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("escapes the workspace");
    expect(readdirSync(outside)).toEqual([]);
  });

  it("refuses a workspace directory redirected outside while staging", async () => {
    const f = fixture();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-fs-write-outside-")));
    directories.push(outside);
    fs.mkdirSync(join(f.workspace, "sub"));
    const target = join(f.workspace, "sub", "file.txt");
    writeFileSync(target, "original\n");
    writeFileSync(join(outside, "file.txt"), "original\n");
    await f.run("fs.read", { path: "sub/file.txt" });
    afterStaging(() => {
      renameSync(join(f.workspace, "sub"), join(f.workspace, "moved"));
      symlinkSync(outside, join(f.workspace, "sub"));
    });
    const outcome = await f.run("fs.edit", { path: "sub/file.txt", find: "original", replace: "replacement" });
    expect(outcome.ok).toBe(false);
    expect(readFileSync(join(outside, "file.txt"), "utf8")).toBe("original\n");
    expect(readFileSync(join(f.workspace, "moved", "file.txt"), "utf8")).toBe("original\n");
  });
});
