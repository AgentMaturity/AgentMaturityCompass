import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { canonicalToolRequests } from "../src/bridge/hookProviders.js";

const workspace = "/tmp/amc-pi-mapping";
const map = (toolName: string, input: Record<string, unknown>) => canonicalToolRequests("pi", toolName, input, workspace);

// Field names are Pi 1.0.2 and 1.0.4's built-in tool schemas (dist/core/tools/*.js); see docs/adapters/pi.md.
describe("Pi tool_call mapping to canonical ToolHub requests", () => {
  test("bash maps to the shell command plan, one segment per command", () => {
    const mapped = map("bash", { command: "rm -rf /tmp/x" });
    expect(mapped.commandPlan?.status).toBe("parsed");
    expect(mapped.requests).toHaveLength(1);
    expect(mapped.requests[0]).toMatchObject({ name: "process.spawn", args: { binary: "rm", argv: ["-rf", "/tmp/x"] } });
    expect(map("bash", { command: "ls && git push" }).requests.map((request) => request.name)).toEqual(["process.spawn", "git.push"]);
  });

  test("read and the read-only extras map to fs.read", () => {
    expect(map("read", { path: "src/a.ts", offset: 1 }).requests).toEqual([
      expect.objectContaining({ name: "fs.read", args: { path: "src/a.ts" } }),
    ]);
    for (const tool of ["grep", "find"]) {
      expect(map(tool, { pattern: "x", path: "src" }).requests).toEqual([expect.objectContaining({ name: "fs.read", args: { path: "src" } })]);
      expect(map(tool, { pattern: "x" }).requests).toEqual([expect.objectContaining({ name: "fs.read", args: { path: workspace } })]);
    }
    expect(map("ls", {}).requests).toEqual([expect.objectContaining({ name: "fs.read", args: { path: workspace } })]);
  });

  test("edit and write map to fs.write", () => {
    expect(map("write", { path: "out.txt", content: "x" }).requests).toEqual([expect.objectContaining({ name: "fs.write", args: { path: "out.txt" } })]);
    expect(map("edit", { path: "out.txt", edits: [{ oldText: "a", newText: "b" }] }).requests).toEqual([
      expect.objectContaining({ name: "fs.write", args: { path: "out.txt" } }),
    ]);
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
    expect(map("write", { content: "x" }).requests).toEqual([]);
    expect(map("edit", { path: "   " }).requests).toEqual([]);
  });

  test("maps the tool_call events real Pi emitted in the conformance run (Codemode and its nested read)", () => {
    const root = join("tests", "fixtures", "harness-hooks", "pi");
    for (const version of readdirSync(root)) {
      const events = readFileSync(join(root, version, "events.jsonl"), "utf8").trim().split("\n")
        .map((line) => JSON.parse(line) as { type: string; toolName: string; parentToolCallId: string | null; input: Record<string, unknown> });
      const calls = events.filter((event) => event.type === "tool_call");
      expect(calls.map((event) => event.toolName), version).toEqual(["codemode", "read"]);
      expect(map(calls[0]!.toolName, calls[0]!.input).requests).toEqual([]);
      expect(calls[1]!.parentToolCallId).not.toBeNull();
      expect(map(calls[1]!.toolName, calls[1]!.input).requests).toEqual([
        expect.objectContaining({ name: "fs.read", args: { path: "<workspace>/workspace/public.txt" }, minimumActionClass: "READ_ONLY" }),
      ]);
    }
  });
});
