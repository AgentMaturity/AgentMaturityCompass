import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools/toolRegistry.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { toolEvidenceFor, type ToolEvidenceRecord } from "../src/tools/toolEvidence.js";
import { DefiniteFailureError, type ToolExecution, type ToolMode } from "../src/tools/toolTypes.js";
import { sessionPayloadCap } from "../src/session/sessionPayloadCap.js";
import { applyPatchTool } from "../src/tools/builtin/applyPatchTool.js";
import { fsTools } from "../src/tools/builtin/fsTools.js";
import { ReadBeforeEditLedger, type EditVerdict } from "../src/tools/builtin/readBeforeEdit.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * apply_patch (SH-TOOLS-01) through the pipeline: every section checked before any write, the read-before-edit
 * ledger threaded once, deletion and move bounded to the entry named, and one fileChanges entry per file on the
 * audit row. Every refusal asserts the files are byte-identical afterwards.
 */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const patch = (body: string): string => `*** Begin Patch\n${body}\n*** End Patch\n`;

function harness(ledger = new ReadBeforeEditLedger()) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-apply-patch-")));
  dirs.push(workspace);
  const registry = new ToolRegistry();
  for (const tool of fsTools({ ledger })) registry.define(tool);
  registry.define(applyPatchTool({ ledger }));
  const records: ToolEvidenceRecord[] = [];
  const pipeline = new ToolPipeline({ registry, workspace, record: (execution, outcome) => records.push(...toolEvidenceFor(execution, outcome)) });
  const path = (name: string) => join(workspace, name);
  const run = (name: string, args: Record<string, unknown>, requestedMode: ToolMode = "EXECUTE") =>
    pipeline.execute({ name, agentId: "alice", arguments: args, requestedMode });
  return {
    workspace, path, records, ledger,
    put: (name: string, content: string | Buffer) => { mkdirSync(join(workspace, name, ".."), { recursive: true }); writeFileSync(path(name), content); },
    text: (name: string) => readFileSync(path(name), "utf8"),
    read: async (...names: string[]) => { for (const name of names) expect((await run("fs.read", { path: name })).ok).toBe(true); },
    apply: (text: string, mode: ToolMode = "EXECUTE") => run("apply_patch", { patch: text }, mode),
    lastAudit: () => JSON.parse(records.filter((row) => row.eventType === "audit").at(-1)!.payload) as { fileChanges?: unknown[]; fileChange?: unknown; auditType: string },
    lastMeta: () => records.filter((row) => row.eventType === "audit").at(-1)!.meta,
    /** The body called directly, as the journal sees it: a refusal that wrote nothing must be a DefiniteFailureError. */
    bodyOf: (name: string) => registry.visible().get(name)!.body
  };
}

describe("apply_patch", () => {
  it("adds, updates, moves and deletes in one call, with one fileChanges entry per file and the diffs", async () => {
    const h = harness();
    h.put("a.txt", "one\ntwo\nthree\n");
    h.put("b.txt", "keep\ndrop\n");
    h.put("gone.txt", "bye\n");
    await h.read("a.txt", "b.txt", "gone.txt");
    const outcome = await h.apply(patch([
      "*** Add File: new/dir/n.txt", "+hello",
      "*** Update File: a.txt", "@@", " one", "-two", "+TWO",
      "*** Update File: b.txt", "*** Move to: moved/b.txt", "@@", " keep", "-drop",
      "*** Delete File: gone.txt"
    ].join("\n")));
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("applied patch: 4 file(s)");
    expect(outcome.output).toContain("-two\n+TWO");
    expect(h.text("new/dir/n.txt")).toBe("hello\n");
    expect(h.text("a.txt")).toBe("one\nTWO\nthree\n");
    expect(h.text("moved/b.txt")).toBe("keep\n");
    expect(existsSync(h.path("b.txt"))).toBe(false);
    expect(existsSync(h.path("gone.txt"))).toBe(false);
    const audit = h.lastAudit();
    expect(audit.auditType).toBe("TOOL_CALL_ALLOWED");
    expect(audit.fileChanges).toHaveLength(5);
    expect(audit.fileChanges).toMatchObject([
      { path: "new/dir/n.txt", beforeSha256: null, afterSha256: sha256Hex("hello\n") },
      { path: "a.txt", beforeSha256: sha256Hex("one\ntwo\nthree\n"), afterSha256: sha256Hex("one\nTWO\nthree\n"), replacements: 2 },
      { path: "moved/b.txt", beforeSha256: null, afterSha256: sha256Hex("keep\n") },
      { path: "b.txt", beforeSha256: sha256Hex("keep\ndrop\n"), afterSha256: null, bytesAfter: 0 },
      { path: "gone.txt", beforeSha256: sha256Hex("bye\n"), afterSha256: null, bytesAfter: 0 }
    ]);
    // The payload carries the list once; the plain metadata names no file and holds no digest.
    expect(audit.fileChange).toBeUndefined();
    expect(h.lastMeta()).not.toHaveProperty("fileChange");
    expect(h.lastMeta()).not.toHaveProperty("fileChanges");
    expect(JSON.stringify(h.lastMeta())).not.toContain("n.txt");
    // The file the call just produced counts as read: a follow-up edit needs no re-read.
    expect((await h.apply(patch("*** Update File: a.txt\n@@\n-TWO\n+2"))).ok).toBe(true);
  });

  it("writes nothing when a later section fails to plan (hunk mismatch), and reports it as a definite failure", async () => {
    const h = harness();
    h.put("a.txt", "a\n"); h.put("b.txt", "b\n");
    await h.read("a.txt", "b.txt");
    const outcome = await h.apply(patch("*** Update File: a.txt\n@@\n-a\n+A\n*** Update File: b.txt\n@@\n-nope\n+B"));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("hunk 1 of b.txt does not match");
    expect(h.text("a.txt")).toBe("a\n");
    expect(h.lastAudit().fileChanges).toBeUndefined();
  });

  it.each([
    ["an unread file", (h: ReturnType<typeof harness>) => { h.put("u.txt", "x\n"); }, "*** Update File: u.txt\n@@\n-x\n+y", /requires reading/],
    ["a deleted unread file", (h: ReturnType<typeof harness>) => { h.put("u.txt", "x\n"); }, "*** Delete File: u.txt", /requires reading/],
    ["adding an existing file", (h: ReturnType<typeof harness>) => { h.put("e.txt", "x\n"); }, "*** Add File: e.txt\n+y", /already exists/],
    ["a missing file", () => {}, "*** Delete File: missing.txt", /does not exist/],
    ["a path outside the workspace", () => {}, "*** Add File: a/../../out.txt\n+y", /must not contain/],
    ["a protected directory", () => {}, "*** Add File: .git/hooks/pre-commit\n+y", /protected|\.git/]
  ])("refuses %s with nothing written", async (_label, setup, body, reason) => {
    const h = harness();
    setup(h);
    const outcome = await h.apply(patch(body));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toMatch(reason);
    expect(existsSync(h.path("out.txt"))).toBe(false);
    if (existsSync(h.path("u.txt"))) expect(h.text("u.txt")).toBe("x\n");
  });

  it("refuses a redaction placeholder in added patch content before writing any file", async () => {
    const h = harness();
    h.put("a.txt", "original\n");
    await h.read("a.txt");
    const outcome = await h.apply(patch("*** Add File: b.txt\n+normal\n*** Update File: a.txt\n@@\n-original\n+[AMC_REDACTED:api-key]"));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("redaction placeholder");
    expect(h.text("a.txt")).toBe("original\n");
    expect(existsSync(h.path("b.txt"))).toBe(false);
  });

  it("refuses a file changed after it was read, before any write", async () => {
    const h = harness();
    h.put("a.txt", "a\n"); h.put("b.txt", "b\n");
    await h.read("a.txt", "b.txt");
    h.put("b.txt", "changed\n");
    const outcome = await h.apply(patch("*** Update File: a.txt\n@@\n-a\n+A\n*** Delete File: b.txt"));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("changed since you read it");
    expect(h.text("a.txt")).toBe("a\n");
    expect(h.text("b.txt")).toBe("changed\n");
  });

  it("refuses to delete or move through a symlink, and a non-UTF-8 update", async () => {
    const h = harness();
    mkdirSync(h.path("real")); h.put("real/t.txt", "t\n");
    symlinkSync(h.path("real/t.txt"), h.path("link.txt"));
    symlinkSync(h.path("real"), h.path("linkdir"));
    h.put("bin.dat", Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    await h.read("link.txt", "linkdir/t.txt", "bin.dat");
    for (const body of ["*** Delete File: link.txt", "*** Update File: linkdir/t.txt\n*** Move to: elsewhere.txt\n@@\n t", "*** Add File: linkdir/new.txt\n+x"]) {
      const outcome = await h.apply(patch(body));
      expect(outcome.ok).toBe(false);
      expect(outcome.output).toContain("traverses a symlink");
    }
    expect(existsSync(h.path("link.txt"))).toBe(true);
    expect(h.text("real/t.txt")).toBe("t\n");
    const binary = await h.apply(patch("*** Update File: bin.dat\n@@\n-x\n+y"));
    expect(binary.ok).toBe(false);
    expect(binary.output).toContain("not valid UTF-8");
  });

  it("refuses one real file named twice through two spellings", async () => {
    const h = harness();
    h.put("d/a.txt", "a\n");
    await h.read("d/a.txt");
    const outcome = await h.apply(patch("*** Update File: d/a.txt\n@@\n-a\n+b\n*** Update File: ./d/a.txt\n@@\n-a\n+c"));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("names one file twice");
    expect(h.text("d/a.txt")).toBe("a\n");
  });

  it("refuses two paths that differ only by case or Unicode form as one file, before any write", async () => {
    const h = harness();
    for (const body of ["*** Add File: n.txt\n+a\n*** Add File: N.txt\n+b", "*** Add File: caf\u00e9.txt\n+a\n*** Add File: cafe\u0301.txt\n+b"]) {
      const outcome = await h.apply(patch(body));
      expect(outcome.ok).toBe(false);
      expect(outcome.output).toContain("names one file twice");
    }
    expect(existsSync(h.path("n.txt"))).toBe(false);
    expect(existsSync(h.path("N.txt"))).toBe(false);
  });

  it("refuses a patch whose evidence row would not fit the workspace's payload cap, before any write", async () => {
    const h = harness();
    const long = (index: number) => `${"d".repeat(200)}/${"e".repeat(200)}/${"f".repeat(150)}_${index}.txt`;
    const body = Array.from({ length: 100 }, (_, index) => `*** Add File: ${long(index)}\n+x`).join("\n");
    const outcome = await h.apply(patch(body));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain(`${sessionPayloadCap(h.workspace)}-byte per-event payload cap`);
    expect(existsSync(h.path("d".repeat(200)))).toBe(false);
    expect(h.lastAudit().fileChanges).toBeUndefined();
    // Just inside the cap, the same shape applies and its evidence row holds every entry.
    const smaller = Array.from({ length: 40 }, (_, index) => `*** Add File: ${long(index)}\n+x`).join("\n");
    expect((await h.apply(patch(smaller))).ok).toBe(true);
    expect(h.lastAudit().fileChanges).toHaveLength(40);
  });

  it("refuses as a definite failure, writing nothing, when the workspace's payload cap cannot be read", async () => {
    const h = harness();
    h.put(".amc/ops-policy.yaml", "retention: [unclosed\n");
    const exec = { workspace: h.workspace, agentId: "alice", arguments: { patch: patch("*** Add File: n.txt\n+a") }, effectiveMode: "EXECUTE",
      name: "apply_patch", token: "t", parentToken: null, callId: null, actionClass: "WRITE_LOW", requestedMode: "EXECUTE" } as unknown as ToolExecution;
    let thrown: unknown;
    try { await h.bodyOf("apply_patch")(exec); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(DefiniteFailureError);
    expect((thrown as Error).message).toContain("payload cap could not be read");
    expect(existsSync(h.path("n.txt"))).toBe(false);
  });

  it("keeps the source file's permission bits across a move", async () => {
    const h = harness();
    h.put("deploy.sh", "#!/bin/sh\necho hi\n"); chmodSync(h.path("deploy.sh"), 0o755);
    h.put("secret.env", "KEY=1\n"); chmodSync(h.path("secret.env"), 0o600);
    await h.read("deploy.sh", "secret.env");
    const outcome = await h.apply(patch("*** Update File: deploy.sh\n*** Move to: scripts/deploy.sh\n@@\n-echo hi\n+echo bye\n*** Update File: secret.env\n*** Move to: moved.env\n@@\n KEY=1"));
    expect(outcome.ok).toBe(true);
    expect(statSync(h.path("scripts/deploy.sh")).mode & 0o777).toBe(0o755);
    expect(statSync(h.path("moved.env")).mode & 0o777).toBe(0o600);
  });

  it("treats a directory in the way, and any other pre-write refusal, as a definite failure in every writing tool", async () => {
    const h = harness();
    mkdirSync(h.path("out")); h.put("a.txt", "a\n");
    const exec = (name: string, args: Record<string, unknown>): ToolExecution =>
      ({ workspace: h.workspace, agentId: "alice", arguments: args, effectiveMode: "EXECUTE", name, token: "t", parentToken: null, callId: null, actionClass: "WRITE_LOW", requestedMode: "EXECUTE" } as unknown as ToolExecution);
    const cases: Array<[string, Record<string, unknown>]> = [
      ["apply_patch", { patch: patch("*** Add File: out\n+y") }],
      ["apply_patch", { patch: patch("*** Delete File: out") }],
      ["apply_patch", { patch: patch("*** Add File: a.txt/b.txt\n+y") }],
      ["fs.write", { path: "out", content: "x" }],
      ["fs.write", { path: "../escape.txt", content: "x" }],
      ["fs.edit", { path: "out", find: "a", replace: "b" }],
      ["fs.edit", { path: ".git/config", find: "a", replace: "b" }]
    ];
    for (const [name, args] of cases) {
      let thrown: unknown;
      try { await h.bodyOf(name)(exec(name, args)); } catch (error) { thrown = error; }
      expect(thrown, `${name} ${JSON.stringify(args)}`).toBeInstanceOf(DefiniteFailureError);
      expect((thrown as Error).message, name).not.toContain(h.workspace);
    }
    expect(existsSync(h.path("escape.txt"))).toBe(false);
  });

  it("shares one locate budget across the patch's sections", async () => {
    // Each section alone costs about 15 million line comparisons to prove its match unique; four together pass the
    // call's budget, so the patch is refused before any file is written.
    const h = harness();
    const names = ["s1.txt", "s2.txt", "s3.txt", "s4.txt"];
    for (const [index, name] of names.entries()) h.put(name, `${"same\n".repeat(30_000)}end-${index}\n`);
    await h.read(...names);
    const section = (name: string, index: number) => `*** Update File: ${name}\n@@\n${" same\n".repeat(500)}-end-${index}\n+END-${index}`;
    const outcome = await h.apply(patch(names.map(section).join("\n")));
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toMatch(/hunk 1 of s4\.txt would pass this patch's budget/);
    for (const [index, name] of names.entries()) expect(h.text(name).endsWith(`end-${index}\n`)).toBe(true);
    // Three of the same sections fit in one call.
    expect((await h.apply(patch(names.slice(0, 3).map(section).join("\n")))).ok).toBe(true);
  });

  it("SIMULATE returns the diffs and writes nothing", async () => {
    const h = harness();
    h.put("a.txt", "a\n");
    await h.read("a.txt");
    const outcome = await h.apply(patch("*** Update File: a.txt\n@@\n-a\n+A\n*** Add File: n.txt\n+n"), "SIMULATE");
    expect(outcome.ok).toBe(true);
    expect(outcome.output).toContain("SIMULATE apply_patch: 2 file(s), nothing written");
    expect(outcome.output).toContain("-a\n+A");
    expect(h.text("a.txt")).toBe("a\n");
    expect(existsSync(h.path("n.txt"))).toBe(false);
  });
});

/**
 * The commit-time checks (R8). Phase 1 passes; the ledger's second `mayEdit` for the same file is the commit check,
 * and this ledger changes the file right before it. Dropping the digest check in `deleteIfUnchanged` or
 * `writeIfUnchanged` lets the file go, which these tests catch.
 */
class RaceLedger extends ReadBeforeEditLedger {
  constructor(private readonly target: string, private readonly rewrite: () => void) { super(); }
  private calls = 0;
  override mayEdit(agentId: string, path: string, snapshotDigest?: string): EditVerdict {
    if (path === this.target && ++this.calls === 2) this.rewrite();
    return super.mayEdit(agentId, path, snapshotDigest);
  }
}

function raceHarness(name: string, content: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-apply-patch-race-")));
  dirs.push(dir);
  const target = join(dir, name);
  const ledger = new RaceLedger(target, () => writeFileSync(target, "late change\n"));
  const registry = new ToolRegistry();
  for (const tool of fsTools({ ledger })) registry.define(tool);
  registry.define(applyPatchTool({ ledger }));
  const records: ToolEvidenceRecord[] = [];
  const pipeline = new ToolPipeline({ registry, workspace: dir, record: (execution, outcome) => records.push(...toolEvidenceFor(execution, outcome)) });
  writeFileSync(target, content);
  const run = (tool: string, args: Record<string, unknown>) => pipeline.execute({ name: tool, agentId: "a", arguments: args, requestedMode: "EXECUTE" });
  return { dir, target, records, run };
}

describe("apply_patch commit checks", () => {
  it("refuses a delete whose file changed between planning and commit", async () => {
    const h = raceHarness("d.txt", "original\n");
    expect((await h.run("fs.read", { path: "d.txt" })).ok).toBe(true);
    const outcome = await h.run("apply_patch", { patch: patch("*** Delete File: d.txt") });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("changed while this call ran");
    expect(readFileSync(h.target, "utf8")).toBe("late change\n");
  });

  it("refuses an update whose file changed between planning and commit, after an earlier section landed", async () => {
    const h = raceHarness("u.txt", "original\n");
    expect((await h.run("fs.read", { path: "u.txt" })).ok).toBe(true);
    const outcome = await h.run("apply_patch", { patch: patch("*** Add File: first.txt\n+first\n*** Update File: u.txt\n@@\n-original\n+changed") });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("apply_patch stopped at section 2 of 2");
    expect(outcome.output).toContain("written: first.txt");
    expect(outcome.output).toContain("not written: u.txt");
    expect(readFileSync(join(h.dir, "first.txt"), "utf8")).toBe("first\n");
    expect(readFileSync(h.target, "utf8")).toBe("late change\n");
    const audit = JSON.parse(h.records.filter((row) => row.eventType === "audit").at(-1)!.payload) as { auditType: string; fileChanges: unknown[] };
    expect(audit.auditType).toBe("TOOL_CALL_FAILED");
    expect(audit.fileChanges).toMatchObject([{ path: "first.txt", afterSha256: sha256Hex("first\n") }]);
  });

  it("reports a move whose target landed before its source delete failed as written, from what landed", async () => {
    const h = raceHarness("b.txt", "b\n");
    writeFileSync(join(h.dir, "a.txt"), "a\n");
    expect((await h.run("fs.read", { path: "a.txt" })).ok).toBe(true);
    expect((await h.run("fs.read", { path: "b.txt" })).ok).toBe(true);
    const outcome = await h.run("apply_patch", { patch: patch("*** Update File: a.txt\n@@\n-a\n+A\n*** Update File: b.txt\n*** Move to: moved/b.txt\n@@\n-b\n+B") });
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("written: a.txt, moved/b.txt");
    expect(outcome.output).toContain("not written: b.txt");
    expect(readFileSync(join(h.dir, "moved/b.txt"), "utf8")).toBe("B\n");
    expect(readFileSync(h.target, "utf8")).toBe("late change\n");
    const audit = JSON.parse(h.records.filter((row) => row.eventType === "audit").at(-1)!.payload) as { fileChanges: Array<{ path: string }> };
    expect(audit.fileChanges.map((entry) => entry.path)).toEqual(["a.txt", "moved/b.txt"]);
  });
});
