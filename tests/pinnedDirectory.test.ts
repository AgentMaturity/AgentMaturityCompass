import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withPinnedDirectory } from "../src/tools/builtin/pinnedDirectory.js";

let root: string;
const originalCwd = process.cwd();
const noCheck = () => {};
beforeEach(() => { root = realpathSync.native(mkdtempSync(join(tmpdir(), "amc-pinned-"))); });
afterEach(() => { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); });

describe("the facts the pin rests on", () => {
  it("process.cwd() after a chdir through a link reports the link target's real path, not the link", () => {
    mkdirSync(join(root, "real", "sub"), { recursive: true });
    symlinkSync(join(root, "real", "sub"), join(root, "link"));
    process.chdir(join(root, "link"));
    expect(process.cwd()).toBe(join(root, "real", "sub"));
  });

  it("process.cwd() is read fresh after each chdir, so a folder renamed since is reported where it is now", () => {
    mkdirSync(join(root, "a"));
    process.chdir(join(root, "a"));
    expect(process.cwd()).toBe(join(root, "a"));
    renameSync(join(root, "a"), join(root, "b"));
    process.chdir(".");
    expect(process.cwd()).toBe(join(root, "b"));
  });
});

describe("withPinnedDirectory", () => {
  it("makes missing folders, writes create-only with a mode, replaces keeping the mode, removes, and restores the working folder", () => {
    const before = process.cwd();
    withPinnedDirectory(root, ["x", "y"], true, (dir) => {
      dir.write("new.txt", Buffer.from("one\n"), { createOnly: true, mode: 0o640, beforeCommit: noCheck });
      dir.write("new.txt", Buffer.from("two\n"), { createOnly: false, beforeCommit: noCheck });
    });
    const file = join(root, "x", "y", "new.txt");
    expect(readFileSync(file, "utf8")).toBe("two\n");
    expect(lstatSync(file).mode & 0o777).toBe(0o640);
    expect(readdirSync(join(root, "x", "y"))).toEqual(["new.txt"]); // no temp file left
    withPinnedDirectory(root, ["x", "y"], false, (dir) => dir.remove("new.txt", noCheck));
    expect(existsSync(file)).toBe(false);
    expect(process.cwd()).toBe(before);
  });

  it("a create-only write never replaces a file that is there", () => {
    writeFileSync(join(root, "kept.txt"), "kept\n");
    expect(() => withPinnedDirectory(root, [], false, (dir) => dir.write("kept.txt", Buffer.from("x"), { createOnly: true, beforeCommit: noCheck }))).toThrow(/EEXIST/);
    expect(readFileSync(join(root, "kept.txt"), "utf8")).toBe("kept\n");
  });

  it("refuses a folder on the path that is a link, makes nothing at its target, and restores the working folder", () => {
    const outside = realpathSync.native(mkdtempSync(join(tmpdir(), "amc-pinned-outside-")));
    try {
      symlinkSync(outside, join(root, "x"));
      const before = process.cwd();
      expect(() => withPinnedDirectory(root, ["x", "y"], true, (dir) => dir.write("evil.txt", Buffer.from("x"), { createOnly: true, beforeCommit: noCheck }))).toThrow(/changed location/);
      expect(readdirSync(outside)).toEqual([]);
      expect(process.cwd()).toBe(before);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  it("refuses a name that is not a plain name, and a removal or a replace of something that is not a regular file", () => {
    mkdirSync(join(root, "folder"));
    for (const name of ["a/b", "a\0b", "..", ".", ""]) expect(() => withPinnedDirectory(root, [], false, (dir) => dir.remove(name, noCheck))).toThrow(/not a plain/);
    expect(() => withPinnedDirectory(root, ["a/b"], true, () => undefined)).toThrow(/not a plain/);
    expect(() => withPinnedDirectory(root, [], false, (dir) => dir.remove("folder", noCheck))).toThrow(/not a regular file/);
    expect(() => withPinnedDirectory(root, [], false, (dir) => dir.write("folder", Buffer.from("x"), { createOnly: false, beforeCommit: noCheck }))).toThrow(/not a regular file/);
    expect(existsSync(join(root, "a"))).toBe(false);
  });

  it("restores the working folder when each inner step throws, and leaves the file as it was", () => {
    writeFileSync(join(root, "f.txt"), "before\n");
    const before = process.cwd();
    const refuse = () => { throw new Error("refused at the commit check"); };
    expect(() => withPinnedDirectory(root, [], false, (dir) => dir.write("f.txt", Buffer.from("x"), { createOnly: false, beforeCommit: refuse }))).toThrow(/refused/);
    expect(process.cwd()).toBe(before);
    expect(() => withPinnedDirectory(root, [], false, (dir) => dir.write("g.txt", Buffer.from("x"), { createOnly: true, beforeCommit: refuse }))).toThrow(/refused/);
    expect(process.cwd()).toBe(before);
    expect(() => withPinnedDirectory(root, [], false, (dir) => dir.remove("f.txt", refuse))).toThrow(/refused/);
    expect(process.cwd()).toBe(before);
    expect(() => withPinnedDirectory(root, ["missing"], false, () => undefined)).toThrow(/ENOENT/);
    expect(process.cwd()).toBe(before);
    expect(readdirSync(root)).toEqual(["f.txt"]); // no temp file, no g.txt
    expect(readFileSync(join(root, "f.txt"), "utf8")).toBe("before\n");
  });

  it("a read-only file is refused as a write would be", () => {
    writeFileSync(join(root, "ro.txt"), "ro\n");
    chmodSync(join(root, "ro.txt"), 0o444);
    expect(() => withPinnedDirectory(root, [], false, (dir) => dir.write("ro.txt", Buffer.from("x"), { createOnly: false, beforeCommit: noCheck }))).toThrow(/EACCES/);
    expect(readFileSync(join(root, "ro.txt"), "utf8")).toBe("ro\n");
  });

  it("a working folder that cannot be restored is reported with its own code", () => {
    const gone = join(root, "gone");
    mkdirSync(gone);
    process.chdir(gone);
    expect(process.cwd()).toBe(gone);
    rmdirSync(gone);
    let caught: unknown;
    try { withPinnedDirectory(root, [], false, () => undefined); } catch (error) { caught = error; }
    expect((caught as NodeJS.ErrnoException).code).toBe("ERR_AMC_PIN_RESTORE");
  });

  it("refuses inside a worker thread, with the reason, and writes nothing", async () => {
    const helper = pathToFileURL(resolve("src/tools/builtin/pinnedDirectory.ts")).href;
    const worker = new Worker(`const { parentPort } = require("node:worker_threads");
      import(${JSON.stringify(helper)}).then((m) => {
        try { m.withPinnedDirectory(${JSON.stringify(root)}, [], false, (dir) => dir.write("w.txt", Buffer.from("x"), { createOnly: true, beforeCommit() {} })); parentPort.postMessage("wrote"); }
        catch (error) { parentPort.postMessage(error.message); }
      }, (error) => parentPort.postMessage("load failed: " + error.message));`, { eval: true });
    const message = await new Promise<string>((done) => worker.once("message", done));
    await worker.terminate();
    expect(message).toBe("a folder cannot be pinned from a worker thread; nothing was changed");
    expect(readdirSync(root)).toEqual([]);
  });
});
