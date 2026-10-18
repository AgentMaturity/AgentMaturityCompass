import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { toolEvidenceFor, type ToolEvidenceRecord } from "../src/tools/toolEvidence.js";
import type { ToolMode } from "../src/tools/toolTypes.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger } from "../src/tools/builtin/readBeforeEdit.js";

/**
 * File tools parity (P1-36): numbered line ranges for fs.read, replaceAll and
 * all-or-nothing multi-edit for fs.edit, unified diffs from fs.write and
 * fs.edit, and before/after hashes in their audit rows. Every refusal asserts
 * the file is byte-identical afterwards.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

function harness(ledger = new ReadBeforeEditLedger()) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-fs-parity-")));
  dirs.push(workspace);
  const registry = new ToolRegistry();
  for (const tool of fsTools({ ledger })) registry.define(tool);
  const records: ToolEvidenceRecord[] = [];
  const pipeline = new ToolPipeline({ registry, workspace, record: (execution, outcome) => records.push(...toolEvidenceFor(execution, outcome)) });
  const path = (name: string) => join(workspace, name);
  return {
    workspace,
    path,
    put: (name: string, content: string | Buffer) => writeFileSync(path(name), content),
    bytes: (name: string) => readFileSync(path(name)),
    text: (name: string) => readFileSync(path(name), "utf8"),
    run: (name: string, args: Record<string, unknown>, requestedMode: ToolMode = "EXECUTE") =>
      pipeline.execute({ name, agentId: "alice", arguments: args, requestedMode }),
    audits: () => records.filter(row => row.eventType === "audit").map(row => JSON.parse(row.payload) as Record<string, unknown>)
  };
}

async function editAfterRead(before: string, args: Record<string, unknown>) {
  const h = harness();
  h.put("f.txt", before);
  expect((await h.run("fs.read", { path: "f.txt" })).ok).toBe(true);
  const outcome = await h.run("fs.edit", { path: "f.txt", ...args });
  return { h, outcome, after: h.text("f.txt") };
}

describe("fs.read line ranges", () => {
  const tenLines = Array.from({ length: 10 }, (_, index) => `l${index + 1}`).join("\n");

  it("returns numbered lines and a range trailer", async () => {
    const h = harness();
    h.put("f.txt", tenLines);
    const outcome = await h.run("fs.read", { path: "f.txt", offset: 3, limit: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toBe("     3\tl3\n     4\tl4\n[amc: lines 3-4 of 10]");
  });

  it("refuses an offset past the end", async () => {
    const h = harness();
    h.put("f.txt", `${tenLines}\n`);
    const outcome = await h.run("fs.read", { path: "f.txt", offset: 20 });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("offset 20 is past the end of the file (10 lines)");
  });

  it("keeps the raw output byte-identical without offset or limit", async () => {
    const h = harness();
    h.put("f.txt", "abc");
    expect((await h.run("fs.read", { path: "f.txt" })).output).toBe("abc");
  });

  it("defaults the offset to 1 when only limit is given, and keeps carriage returns", async () => {
    const h = harness();
    h.put("f.txt", "a\r\nb\r\nc\r\n");
    expect((await h.run("fs.read", { path: "f.txt", limit: 2 })).output).toBe("     1\ta\r\n     2\tb\r\n[amc: lines 1-2 of 3]");
  });

  it("applies maxBytes after selecting the lines", async () => {
    const h = harness();
    h.put("f.txt", tenLines);
    const outcome = await h.run("fs.read", { path: "f.txt", offset: 2, limit: 3, maxBytes: 10 });
    expect(outcome.output).toBe("     2\tl2\n\n[amc: truncated at 10 bytes; 19 more]\n[amc: lines 2-4 of 10]");
  });

  it("refuses binary and non-UTF-8 files deterministically, and leaves the raw read as it was", async () => {
    const h = harness();
    h.put("nul.bin", Buffer.from([0x61, 0x00, 0x62]));
    h.put("latin1.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    for (const name of ["nul.bin", "latin1.txt"]) {
      const outcome = await h.run("fs.read", { path: name, offset: 1 });
      expect(outcome.ok).toBe(false);
      expect(outcome.output).toContain("is not UTF-8 text");
    }
    expect((await h.run("fs.read", { path: "nul.bin" })).output).toBe("a\u0000b");
  });

  it("lets a slice read satisfy read-before-edit for the whole file", async () => {
    const h = harness();
    h.put("f.txt", "one\ntwo\nthree\n");
    expect((await h.run("fs.read", { path: "f.txt", offset: 1, limit: 1 })).ok).toBe(true);
    expect((await h.run("fs.edit", { path: "f.txt", find: "three", replace: "3" })).ok).toBe(true);
    expect(h.text("f.txt")).toBe("one\ntwo\n3\n");
  });

  it("keeps the workspace bound for a line-range read", async () => {
    const h = harness();
    const outcome = await h.run("fs.read", { path: "../../../etc/hosts", offset: 1 });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("escapes the workspace");
  });
});

describe("fs.edit replaceAll and multi-edit", () => {
  it("replaces every occurrence with replaceAll", async () => {
    const { outcome, after } = await editAfterRead("a b a", { find: "a", replace: "x", replaceAll: true });
    expect(outcome.ok).toBe(true);
    expect(after).toBe("x b x");
    expect(outcome.output.split("\n")[0]).toBe("edited f.txt (2 replacements)");
  });

  it("refuses replaceAll when the text is absent", async () => {
    const { outcome, after } = await editAfterRead("a b a", { find: "q", replace: "x", replaceAll: true });
    expect(outcome.ok).toBe(false);
    expect(after).toBe("a b a");
  });

  it("applies edits in order", async () => {
    const { outcome, after } = await editAfterRead("a", { edits: [{ find: "a", replace: "b" }, { find: "b", replace: "c" }] });
    expect(outcome.ok).toBe(true);
    expect(after).toBe("c");
  });

  it("refuses the whole list when one edit fails, and names it", async () => {
    const { outcome, after } = await editAfterRead("a", { edits: [{ find: "a", replace: "b" }, { find: "zz", replace: "y" }] });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("edit 2 of 2");
    expect(after, "all or nothing: the first edit is not written").toBe("a");
  });

  it("names the count and the fix for an ambiguous edit in a list", async () => {
    const { outcome, after } = await editAfterRead("k x x x x", { edits: [{ find: "k", replace: "K" }, { find: "x", replace: "y" }, { find: "K", replace: "k2" }] });
    expect(outcome.output).toContain("edit 2 of 3: that text appears 4 times in f.txt; include more context or set replaceAll");
    expect(after).toBe("k x x x x");
  });

  it("writes replacement text literally under replaceAll", async () => {
    const { outcome, after } = await editAfterRead("x x", { find: "x", replace: "$&$$", replaceAll: true });
    expect(outcome.ok).toBe(true);
    expect(after).toBe("$&$$ $&$$");
  });

  it("refuses an edit whose find equals its replace", async () => {
    const { outcome, after } = await editAfterRead("a", { find: "a", replace: "a" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("identical");
    expect(after).toBe("a");
  });

  it("counts overlapping matches, so a unique edit is really unique", async () => {
    const { outcome, after } = await editAfterRead("aaa", { find: "aa", replace: "b" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("appears 2 times");
    expect(after).toBe("aaa");
  });

  it.each([
    ["find and edits", { find: "a", replace: "b", edits: [{ find: "a", replace: "b" }] }],
    ["replaceAll beside edits", { replaceAll: true, edits: [{ find: "a", replace: "b" }] }],
    ["neither", {}],
    ["an empty list", { edits: [] }],
    ["51 edits", { edits: Array.from({ length: 51 }, () => ({ find: "a", replace: "b" })) }],
    ["a path inside an edit", { edits: [{ find: "a", replace: "b", path: "other.txt" }] }]
  ])("refuses %s by validation", async (_name, args) => {
    const { outcome, after } = await editAfterRead("a", args);
    expect(outcome.ok).toBe(false);
    expect(after).toBe("a");
  });

  it("returns the plan and the diff in SIMULATE without writing", async () => {
    const h = harness();
    h.put("f.txt", "a\n");
    await h.run("fs.read", { path: "f.txt" });
    const outcome = await h.run("fs.edit", { path: "f.txt", find: "a", replace: "b" }, "SIMULATE");
    expect(outcome.ok).toBe(true);
    expect(h.text("f.txt")).toBe("a\n");
    expect(outcome.output).toBe("SIMULATE fs.edit f.txt (1 replacement)\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-a\n+b");
    expect(h.audits()[0]).not.toHaveProperty("fileChange");
  });

  it("refuses to edit a file that is not valid UTF-8, which a text round trip would corrupt", async () => {
    const h = harness();
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    h.put("f.txt", latin1);
    await h.run("fs.read", { path: "f.txt" });
    const outcome = await h.run("fs.edit", { path: "f.txt", find: "caf", replace: "CAF" });
    expect(outcome.ok).toBe(false);
    expect(h.bytes("f.txt")).toEqual(latin1);
  });

  it("keeps a byte-order mark", async () => {
    const { outcome, h } = await editAfterRead("﻿hello", { find: "hello", replace: "bye" });
    expect(outcome.ok).toBe(true);
    expect(h.bytes("f.txt")).toEqual(Buffer.from("﻿bye", "utf8"));
  });

  it("refuses when the file changes between this call's read and its write", async () => {
    // The ledger's check runs between the body's read and its write, so a
    // ledger that rewrites the file there is a writer racing the call.
    class RacingLedger extends ReadBeforeEditLedger {
      override mayEdit(agentId: string, path: string) {
        const verdict = super.mayEdit(agentId, path);
        writeFileSync(path, "raced\n");
        return verdict;
      }
    }
    const h = harness(new RacingLedger());
    h.put("f.txt", "a\n");
    await h.run("fs.read", { path: "f.txt" });
    const outcome = await h.run("fs.edit", { path: "f.txt", find: "a", replace: "b" });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("changed while this call ran");
    expect(h.text("f.txt"), "the racing write survives; the stale plan is not written over it").toBe("raced\n");
  });
});

describe("diffs and evidence", () => {
  it("returns a diff from fs.edit and records the hashes of the bytes on disk, with no content", async () => {
    const h = harness();
    h.put("f.txt", "keep\nold line\n");
    const before = h.bytes("f.txt");
    await h.run("fs.read", { path: "f.txt" });
    const outcome = await h.run("fs.edit", { path: "f.txt", find: "old", replace: "new" });
    expect(outcome.output).toBe("edited f.txt (1 replacement)\n--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n keep\n-old line\n+new line");
    const after = h.bytes("f.txt");
    const audit = h.audits().find(row => row.tool === "fs.edit")!;
    expect(audit.fileChange).toEqual({
      path: "f.txt",
      beforeSha256: sha256(before),
      afterSha256: sha256(after),
      bytesBefore: before.length,
      bytesAfter: after.length,
      replacements: 1,
      diffSha256: sha256(outcome.output.slice(outcome.output.indexOf("\n") + 1)),
      diffTruncated: false
    });
    expect(JSON.stringify(h.audits())).not.toContain("old line");
    expect(JSON.stringify(h.audits())).not.toContain("new line");
  });

  it("creates a new file with a null before hash and no diff", async () => {
    const h = harness();
    const outcome = await h.run("fs.write", { path: "new.txt", content: "fresh\n" });
    expect(outcome.output).toBe("created new.txt");
    expect(h.audits()[0]!.fileChange).toEqual({
      path: "new.txt", beforeSha256: null, afterSha256: sha256("fresh\n"), bytesBefore: 0, bytesAfter: 6,
      replacements: null, diffSha256: null, diffTruncated: false
    });
  });

  it("returns a diff when fs.write overwrites a file it read", async () => {
    const h = harness();
    h.put("f.txt", "a\n");
    await h.run("fs.read", { path: "f.txt" });
    const outcome = await h.run("fs.write", { path: "f.txt", content: "b\n" });
    expect(outcome.output).toBe("wrote f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-a\n+b");
    expect(h.audits().find(row => row.tool === "fs.write")!.fileChange).toMatchObject({ beforeSha256: sha256("a\n"), afterSha256: sha256("b\n") });
  });

  it("shows a binary notice instead of a diff for binary content", async () => {
    const h = harness();
    h.put("f.bin", Buffer.from([0x00, 0x01]));
    await h.run("fs.read", { path: "f.bin" });
    const outcome = await h.run("fs.write", { path: "f.bin", content: "text\n" });
    expect(outcome.output).toBe("wrote f.bin\nBinary files a/f.bin and b/f.bin differ");
  });

  it("redacts secrets from the diff before it reaches the tool result or the evidence", async () => {
    const h = harness();
    const key = `sk-${"A1b2C3d4".repeat(4)}`;
    h.put("config.env", "MODE=dev\n");
    await h.run("fs.read", { path: "config.env" });
    const outcome = await h.run("fs.edit", { path: "config.env", find: "MODE=dev\n", replace: `MODE=dev\nOPENAI=${key}\n` });
    expect(outcome.ok).toBe(true);
    expect(outcome.output).not.toContain(key);
    expect(outcome.output).toContain("+OPENAI=[AMC_REDACTED:openai_key]");
    expect(JSON.stringify(h.audits())).not.toContain(key);
    expect(h.text("config.env"), "redaction is for display; the file gets the bytes asked for").toContain(key);
  });

  it("records no file change for a refused edit", async () => {
    const { h, outcome } = await editAfterRead("a", { find: "zz", replace: "y" });
    expect(outcome.ok).toBe(false);
    expect(h.audits().find(row => row.tool === "fs.edit")).not.toHaveProperty("fileChange");
  });
});
