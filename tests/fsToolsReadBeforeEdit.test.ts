import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";

/**
 * Read-before-edit, and the workspace bound.
 *
 * The policy has two halves defending different things. READ FIRST stops a
 * blind edit — a find-and-replace over content the model believes is there.
 * UNCHANGED SINCE stops everything else, because a path is not a stable
 * identity: it can be re-pointed by a symlink, replaced between two calls, or
 * written by another process while the agent was thinking.
 */
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function harness(): { workspace: string; run: (name: string, args: Record<string, unknown>, agent?: string) => ReturnType<ToolPipeline["execute"]> } {
  const workspace = mkdtempSync(join(tmpdir(), "amc-fstools-"));
  dirs.push(workspace);
  const registry = new ToolRegistry();
  for (const tool of fsTools({ ledger: new ReadBeforeEditLedger() })) registry.define(tool);
  const pipeline = new ToolPipeline({ registry, workspace });
  return {
    workspace,
    run: (name, args, agent = "alice") =>
      pipeline.execute({ name, agentId: agent, arguments: args, requestedMode: "EXECUTE" })
  };
}

describe("read before edit", () => {
  it("refuses an edit to a file this agent has not read", async () => {
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "hello world");

    const outcome = await h.run("fs.edit", { path: "a.txt", find: "hello", replace: "goodbye" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("read the file, then retry");
    expect(readFileSync(join(h.workspace, "a.txt"), "utf8"), "the file is untouched").toBe("hello world");
  });

  it("allows the edit once the file has been read", async () => {
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "hello world");

    expect((await h.run("fs.read", { path: "a.txt" })).ok).toBe(true);
    const outcome = await h.run("fs.edit", { path: "a.txt", find: "hello", replace: "goodbye" });

    expect(outcome.ok).toBe(true);
    expect(readFileSync(join(h.workspace, "a.txt"), "utf8")).toBe("goodbye world");
  });

  it("refuses when the file changed after the read", async () => {
    // Another process wrote while the agent was thinking. The recorded digest
    // is what makes this check about the FILE rather than about the name.
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "original");
    await h.run("fs.read", { path: "a.txt" });
    writeFileSync(join(h.workspace, "a.txt"), "someone else wrote this");

    const outcome = await h.run("fs.edit", { path: "a.txt", find: "someone", replace: "nobody" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("changed since you read it");
  });

  it("is per agent — one agent's read does not authorise another's edit", async () => {
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "shared");
    await h.run("fs.read", { path: "a.txt" }, "alice");

    const outcome = await h.run("fs.edit", { path: "a.txt", find: "shared", replace: "taken" }, "bob");
    expect(outcome.ok, "the policy is about what THIS agent knows").toBe(false);
  });

  it("survives a symlink re-pointed between the read and the edit", async () => {
    // Path-keyed state alone would see one entry and allow the edit. The
    // digest is what catches it.
    const h = harness();
    writeFileSync(join(h.workspace, "real.txt"), "real contents");
    writeFileSync(join(h.workspace, "other.txt"), "a different file entirely");
    symlinkSync(join(h.workspace, "real.txt"), join(h.workspace, "link.txt"));

    await h.run("fs.read", { path: "link.txt" });
    rmSync(join(h.workspace, "link.txt"));
    symlinkSync(join(h.workspace, "other.txt"), join(h.workspace, "link.txt"));

    const outcome = await h.run("fs.edit", { path: "link.txt", find: "different", replace: "REPLACED" });
    expect(outcome.ok, "the link now points somewhere the agent never read").toBe(false);
    expect(readFileSync(join(h.workspace, "other.txt"), "utf8")).not.toContain("REPLACED");
  });

  it("treats a symlink and its target as one file, once read through either", async () => {
    // Canonicalised to the real path. Having read the file through a link,
    // the agent HAS read the file — refusing the edit under its real name
    // would be a policy about spelling rather than about knowledge.
    const h = harness();
    writeFileSync(join(h.workspace, "real.txt"), "contents here");
    symlinkSync(join(h.workspace, "real.txt"), join(h.workspace, "link.txt"));

    await h.run("fs.read", { path: "link.txt" });
    const outcome = await h.run("fs.edit", { path: "real.txt", find: "contents", replace: "CONTENTS" });

    expect(outcome.ok, "the same file under two names is one file").toBe(true);
    expect(readFileSync(join(h.workspace, "real.txt"), "utf8")).toBe("CONTENTS here");
  });

  it("treats ./a.txt and a.txt as the same file", async () => {
    // Canonicalised, so an equivalent spelling is not a spurious refusal.
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "hello");
    await h.run("fs.read", { path: "./a.txt" });
    expect((await h.run("fs.edit", { path: "a.txt", find: "hello", replace: "hi" })).ok).toBe(true);
  });
});

describe("writing", () => {
  it("creates a new file without demanding a prior read", async () => {
    // There is nothing to have read. Refusing would make the first write of
    // every new file impossible.
    const h = harness();
    const outcome = await h.run("fs.write", { path: "new.txt", content: "fresh" });
    expect(outcome.ok).toBe(true);
    expect(readFileSync(join(h.workspace, "new.txt"), "utf8")).toBe("fresh");
  });

  it("refuses to overwrite an existing file that was never read", async () => {
    // A write over content the agent has not seen is a blind destructive act.
    const h = harness();
    writeFileSync(join(h.workspace, "existing.txt"), "precious");
    const outcome = await h.run("fs.write", { path: "existing.txt", content: "clobbered" });

    expect(outcome.ok).toBe(false);
    expect(readFileSync(join(h.workspace, "existing.txt"), "utf8")).toBe("precious");
  });

  it("lets a create be edited without an intervening read", async () => {
    // A write refreshes the observation to what it just produced. Demanding a
    // re-read of content the agent itself wrote trains it to read reflexively,
    // which defeats the policy by making it noise.
    const h = harness();
    await h.run("fs.write", { path: "new.txt", content: "alpha beta" });
    const outcome = await h.run("fs.edit", { path: "new.txt", find: "alpha", replace: "gamma" });

    expect(outcome.ok).toBe(true);
    expect(readFileSync(join(h.workspace, "new.txt"), "utf8")).toBe("gamma beta");
  });

  it("lets an edit be followed by another edit", async () => {
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "one two three");
    await h.run("fs.read", { path: "a.txt" });
    expect((await h.run("fs.edit", { path: "a.txt", find: "one", replace: "1" })).ok).toBe(true);
    expect((await h.run("fs.edit", { path: "a.txt", find: "two", replace: "2" })).ok).toBe(true);
    expect(readFileSync(join(h.workspace, "a.txt"), "utf8")).toBe("1 2 three");
  });
});

describe("editing matches exactly once", () => {
  it("refuses an ambiguous match rather than picking one", async () => {
    // An edit that silently changed the first of several matches would be a
    // different edit from the one intended, and nothing downstream could tell.
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "x = 1\nx = 2\nx = 3\n");
    await h.run("fs.read", { path: "a.txt" });

    const outcome = await h.run("fs.edit", { path: "a.txt", find: "x = ", replace: "y = " });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("appears 3 times");
    expect(readFileSync(join(h.workspace, "a.txt"), "utf8"), "nothing changed").toContain("x = 1");
  });

  it("reports a match that is not there", async () => {
    const h = harness();
    writeFileSync(join(h.workspace, "a.txt"), "hello");
    await h.run("fs.read", { path: "a.txt" });
    const outcome = await h.run("fs.edit", { path: "a.txt", find: "absent", replace: "x" });
    expect(outcome.output).toContain("no occurrence");
  });
});

describe("the workspace bound", () => {
  it("refuses a path that resolves outside the workspace", async () => {
    // Resolved and then checked, rather than filtered as a string: filtering
    // is a guessing game, resolution is what the filesystem actually does.
    const h = harness();
    const outcome = await h.run("fs.read", { path: "../../../etc/hosts" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("escapes the workspace");
  });

  it("refuses an absolute path outside the workspace", async () => {
    const h = harness();
    expect((await h.run("fs.read", { path: "/etc/hosts" })).ok).toBe(false);
  });

  it("refuses a symlink inside the workspace that points OUTSIDE it", async () => {
    // The lexical check is not enough. `resolve` + `relative` does not follow
    // links and `readFileSync` does, so `ln -s /etc/shadow ws/notes.txt`
    // passes a purely textual containment test and then reads the target.
    // Containment has to be decided on the path the filesystem will actually
    // open.
    const h = harness();
    const outside = mkdtempSync(join(tmpdir(), "amc-outside-"));
    dirs.push(outside);
    writeFileSync(join(outside, "secret.txt"), "OUTSIDE-SECRET-CONTENTS");
    symlinkSync(join(outside, "secret.txt"), join(h.workspace, "notes.txt"));

    const outcome = await h.run("fs.read", { path: "notes.txt" });
    expect(outcome.ok, "a link out of the workspace is a way out of the workspace").toBe(false);
    expect(outcome.output).not.toContain("OUTSIDE-SECRET-CONTENTS");
  });

  it("refuses a WRITE through a symlink that points outside", async () => {
    const h = harness();
    const outside = mkdtempSync(join(tmpdir(), "amc-outside-"));
    dirs.push(outside);
    writeFileSync(join(outside, "target.txt"), "original");
    symlinkSync(join(outside, "target.txt"), join(h.workspace, "innocent.txt"));

    const outcome = await h.run("fs.write", { path: "innocent.txt", content: "CLOBBERED" });
    expect(outcome.ok).toBe(false);
    // The reason matters: read-before-edit would also refuse this, and a test
    // that accepted either would pass with containment removed entirely.
    expect(outcome.output, "refused for escaping, not for being unread").toContain("escapes the workspace");
    expect(readFileSync(join(outside, "target.txt"), "utf8"), "the outside file is untouched").toBe("original");
  });

  it("refuses to read the workspace's own .amc directory", async () => {
    // .amc holds the vault and the signing keys. It is inside the workspace,
    // so containment alone permits it — and a tool that can read the keys or
    // rewrite the signed tool policy is a privilege escalation, not a file
    // read. The signed allowlist denies these globs too; this is the second
    // lock, because a guard that is not composed enforces nothing.
    const h = harness();
    mkdirSync(join(h.workspace, ".amc", "keys"), { recursive: true });
    writeFileSync(join(h.workspace, ".amc", "keys", "auditor.pem"), "PRIVATE-KEY-MATERIAL");

    const outcome = await h.run("fs.read", { path: ".amc/keys/auditor.pem" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).not.toContain("PRIVATE-KEY-MATERIAL");
  });

  it("refuses to write into .git, where a hook is arbitrary code execution", async () => {
    const h = harness();
    const outcome = await h.run("fs.write", { path: ".git/hooks/pre-commit", content: "#!/bin/sh\ncurl evil" });
    expect(outcome.ok, "a git hook runs on the next commit").toBe(false);
  });

  it("allows a nested path inside the workspace", async () => {
    const h = harness();
    mkdirSync(join(h.workspace, "deep", "nested"), { recursive: true });
    writeFileSync(join(h.workspace, "deep", "nested", "f.txt"), "found");
    const outcome = await h.run("fs.read", { path: "deep/nested/f.txt" });
    expect(outcome.ok, "the bound must not be a wall").toBe(true);
    expect(outcome.output).toBe("found");
  });
});

describe("reading is bounded", () => {
  it("truncates at maxBytes and says how much is missing", async () => {
    const h = harness();
    writeFileSync(join(h.workspace, "big.txt"), "A".repeat(5_000));
    const outcome = await h.run("fs.read", { path: "big.txt", maxBytes: 100 });

    expect(outcome.output).toContain("truncated at 100 bytes");
    expect(outcome.output).toContain("4900 more");
  });

  it("lets a truncated read still authorise an edit", async () => {
    // Recording only the bytes returned would make the digest disagree with
    // the file forever, so every read of a large file would permanently lock
    // it against editing. The record is over the whole file.
    const h = harness();
    writeFileSync(join(h.workspace, "big.txt"), `${"A".repeat(1_000)}NEEDLE`);
    await h.run("fs.read", { path: "big.txt", maxBytes: 20 });

    const outcome = await h.run("fs.edit", { path: "big.txt", find: "NEEDLE", replace: "FOUND" });
    expect(outcome.ok, "a capped read must not lock the file").toBe(true);
  });

  it("records the digest of the WHOLE file, not the truncated slice", async () => {
    // Otherwise a change past the cap would be invisible to the policy, and an
    // edit would proceed against content the agent never saw.
    const h = harness();
    const path = join(h.workspace, "big.txt");
    writeFileSync(path, `${"A".repeat(200)}TAIL`);
    await h.run("fs.read", { path: "big.txt", maxBytes: 50 });

    writeFileSync(path, `${"A".repeat(200)}CHANGED`);
    const outcome = await h.run("fs.edit", { path: "big.txt", find: "CHANGED", replace: "X" });
    expect(outcome.ok, "a change past the read cap must still invalidate").toBe(false);
    expect(outcome.output).toContain("changed since you read it");
  });
});
