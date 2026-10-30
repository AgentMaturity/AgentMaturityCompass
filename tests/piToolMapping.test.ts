import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { canonicalToolRequests, piRefusal } from "../src/bridge/hookProviders.js";

const workspace = mkdtempSync(join(tmpdir(), "amc-pi-mapping-"));
mkdirSync(join(workspace, ".amc", "keys"), { recursive: true });
mkdirSync(join(workspace, "workspace"), { recursive: true });
writeFileSync(join(workspace, ".amc", "keys", "receipt.pub"), "key");
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

// Pi resolves against its working directory, which on macOS is the physical path of a /var/folders workspace.
const pi = { cwd: realpathSync.native(workspace), builtinTool: true };
const map = (toolName: string, input: Record<string, unknown>) => canonicalToolRequests("pi", toolName, input, workspace, pi);
const at = (...parts: string[]) => join(workspace, ...parts);

// Field names are Pi 1.0.2 and 1.0.4's built-in tool schemas (dist/core/tools/*.js); see docs/adapters/pi.md.
describe("Pi tool_call mapping to canonical ToolHub requests", () => {
  test("bash maps to the shell command plan, one segment per command", () => {
    const mapped = map("bash", { command: "rm -rf /tmp/x" });
    expect(mapped.commandPlan?.status).toBe("parsed");
    expect(mapped.requests).toHaveLength(1);
    expect(mapped.requests[0]).toMatchObject({ name: "process.spawn", args: { binary: "rm", argv: ["-rf", "/tmp/x"] } });
    expect(map("bash", { command: "ls && git push" }).requests.map((request) => request.name)).toEqual(["process.spawn", "git.push"]);
  });

  test("read and the read-only extras map to fs.read at the location Pi opens", () => {
    expect(map("read", { path: "src/a.ts", offset: 1 }).requests).toEqual([
      expect.objectContaining({ name: "fs.read", args: { path: at("src", "a.ts") } }),
    ]);
    for (const tool of ["grep", "find"]) {
      expect(map(tool, { pattern: "x", path: "src" }).requests).toEqual([expect.objectContaining({ name: "fs.read", args: { path: at("src") } })]);
      expect(map(tool, { pattern: "x" }).requests).toEqual([expect.objectContaining({ name: "fs.read", args: { path: workspace } })]);
    }
    expect(map("ls", {}).requests).toEqual([expect.objectContaining({ name: "fs.read", args: { path: workspace } })]);
    expect(map("ls", { path: "" }).requests).toEqual([expect.objectContaining({ name: "fs.read", args: { path: workspace } })]);
  });

  test("edit and write map to fs.write", () => {
    expect(map("write", { path: "out.txt", content: "x" }).requests).toEqual([expect.objectContaining({ name: "fs.write", args: { path: at("out.txt") } })]);
    expect(map("edit", { path: "out.txt", edits: [{ oldText: "a", newText: "b" }] }).requests).toEqual([
      expect.objectContaining({ name: "fs.write", args: { path: at("out.txt") } }),
    ]);
  });

  test("paths resolve as Pi resolves them: a leading @, Unicode spaces, file URLs, symlinks and case all reach the real target", () => {
    const path = (toolName: string, value: string) => map(toolName, { path: value, content: "x" }).requests.map((request) => request.args.path);
    for (const tool of ["read", "write", "edit", "grep", "find", "ls"]) {
      expect(path(tool, "@.amc/keys/receipt.pub"), tool).toEqual([at(".amc", "keys", "receipt.pub")]);
      expect(path(tool, `file://${pi.cwd}/.amc/keys/receipt.pub`), tool).toEqual([at(".amc", "keys", "receipt.pub")]);
    }
    expect(path("write", "file:///etc/hosts")).toEqual([realpathSync.native("/etc/hosts")]);
    expect(path("write", "@workspace/new file.txt")).toEqual([at("workspace", "new file.txt")]);
    symlinkSync(join(workspace, ".amc"), join(workspace, "workspace", "state"));
    expect(path("read", "workspace/state/keys/receipt.pub")).toEqual([at(".amc", "keys", "receipt.pub")]);
    expect(path("write", "workspace/state/keys/new.pub")).toEqual([at(".amc", "keys", "new.pub")]);
    if (realpathSync.native(at(".amc")) === realpathSync.native(at(".AMC"))) {
      expect(path("write", ".AMC/keys/new.pub")).toEqual([at(".amc", "keys", "new.pub")]);
    }
  });

  test("read covers the macOS name variants Pi falls back to when the named file is missing", () => {
    expect(map("read", { path: "workspace/Shot 1.02 PM.png" }).requests[0]?.args.path).toEqual(expect.arrayContaining([
      at("workspace", "Shot 1.02 PM.png"), at("workspace", "Shot 1.02 PM.png")]));
    expect(map("read", { path: "workspace/l'été.txt" }).requests[0]?.args.path).toEqual(expect.arrayContaining([
      at("workspace", "l'été.txt"), at("workspace", "l’été.txt"), at("workspace", "l'été.txt")]));
    expect(map("write", { path: "workspace/l'été.txt" }).requests[0]?.args.path).toEqual(at("workspace", "l'été.txt"));
  });

  test("a path AMC cannot resolve as Pi does maps to nothing: home-relative paths, foreign file URLs, dangling links", () => {
    symlinkSync(join(workspace, "nowhere", "target"), join(workspace, "workspace", "dangling"));
    for (const value of ["~", "~/.ssh/authorized_keys", "@~/.ssh/authorized_keys", "file://host/etc/hosts", "workspace/dangling", "workspace/dangling/x"]) {
      expect(map("write", { path: value, content: "x" }).requests, value).toEqual([]);
    }
  });

  test("every mapped Pi tool names the lowest action class the signed config may give it", () => {
    const classes = (toolName: string, input: Record<string, unknown>) => map(toolName, input).requests.map((request) => request.minimumActionClass);
    for (const tool of ["read", "grep", "find", "ls"]) expect(classes(tool, { path: "p" })).toEqual(["READ_ONLY"]);
    for (const tool of ["write", "edit"]) expect(classes(tool, { path: "p" })).toEqual(["WRITE_LOW"]);
    // An arbitrary binary is at least WRITE_HIGH; git subcommands keep the classes the signed config gives git.*.
    expect(classes("bash", { command: "node x.js && git status" })).toEqual(["WRITE_HIGH", undefined]);
  });

  test("unmapped tools and missing paths map to nothing, which control denies", () => {
    for (const tool of ["my_ext_tool", "codemode", "powershell", "tool_search", "Read", "run_shell_command",
      "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(map(tool, { path: "x", command: "ls" }).requests).toEqual([]);
    }
    expect(map("read", {}).requests).toEqual([]);
    expect(map("read", { path: "" }).requests).toEqual([]);
    expect(map("write", { content: "x" }).requests).toEqual([]);
    expect(map("edit", { path: 7 }).requests).toEqual([]);
    expect(canonicalToolRequests("pi", "read", { path: "x" }, workspace).requests).toEqual([]);
  });

  test("refuses before mapping: a working directory other than the workspace, or a mapped name an extension took over", () => {
    expect(piRefusal({ ...pi, version: "1.0.4" }, workspace, "read")).toBeNull();
    expect(piRefusal({ ...pi, version: "1.0.4", cwd: join(workspace, "workspace") }, workspace, "read")).toContain("working directory");
    expect(piRefusal({ ...pi, version: "1.0.4", builtinTool: false }, workspace, "read")).toContain("not Pi's built-in");
    expect(piRefusal({ ...pi, version: "1.0.4", builtinTool: false }, workspace, "my_ext_tool")).toBeNull();
    expect(piRefusal({ ...pi, version: "1.1.0" }, workspace, "read")).toBe("AMC has not qualified Pi 1.1.0");
  });

  test("maps the tool_call events real Pi emitted in the conformance run (Codemode and its nested read)", () => {
    const root = join("tests", "fixtures", "harness-hooks", "pi");
    for (const version of readdirSync(root)) {
      const events = readFileSync(join(root, version, "events.jsonl"), "utf8").replaceAll("<workspace>", workspace).trim().split("\n")
        .map((line) => JSON.parse(line) as { type: string; toolName: string; parentToolCallId: string | null; input: Record<string, unknown> });
      const calls = events.filter((event) => event.type === "tool_call");
      expect(calls.map((event) => event.toolName), version).toEqual(["codemode", "read"]);
      expect(map(calls[0]!.toolName, calls[0]!.input).requests).toEqual([]);
      expect(calls[1]!.parentToolCallId).not.toBeNull();
      expect(map(calls[1]!.toolName, calls[1]!.input).requests).toEqual([
        expect.objectContaining({ name: "fs.read", args: { path: at("workspace", "public.txt") }, minimumActionClass: "READ_ONLY" }),
      ]);
    }
  });
});
