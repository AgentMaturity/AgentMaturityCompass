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

  test("unmapped tools and missing paths map to nothing, which control denies", () => {
    for (const tool of ["my_ext_tool", "codemode", "powershell", "tool_search", "Read", "run_shell_command"]) {
      expect(map(tool, { path: "x", command: "ls" }).requests).toEqual([]);
    }
    expect(map("read", {}).requests).toEqual([]);
    expect(map("write", { content: "x" }).requests).toEqual([]);
    expect(map("edit", { path: "   " }).requests).toEqual([]);
  });
});
