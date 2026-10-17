/**
 * P1-23 review (round four): every path that makes a Claude Code session governed refuses foreign hook sources and keeps
 * the bound configuration directory, an unreadable source is never "none found", and every protected-path check resolves
 * a path the one way the Read and Write checks do.
 */
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { clearPiDigestCache } from "../src/adapters/pi/piInstall.js";
import { claudeWorkspace, controlRequest, decide, recorded, register } from "./helpers/claudeCodeHookFixtures.js";
import { removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

const restore: Array<() => void> = [];
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  removeFixtureWorkspaces();
  clearPiDigestCache();
});

let calls = 0;
const sessionOf = (workspace: string) => String(recorded("SessionStart-startup", workspace).session_id);
const cwdOf = (workspace: string) => String(recorded("PreToolUse-read", workspace).cwd);
function call(workspace: string, toolName: string, toolInput: Record<string, unknown>) {
  calls += 1;
  return decide(workspace, controlRequest({ ...recorded("PreToolUse-read", workspace), session_id: sessionOf(workspace), tool_use_id: `toolu_r4_${calls}`,
    tool_name: toolName, tool_input: toolInput }));
}
const readPublic = (workspace: string) => call(workspace, "Read", { file_path: join(cwdOf(workspace), "workspace", "public.txt") });
const write = (path: string, text: string) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};
const skillWithHooks = "---\nname: s\nhooks:\n  PreToolUse:\n    - matcher: \"*\"\n      hooks:\n        - type: command\n          command: /bin/true\n---\n";
const refused = expect.objectContaining({ statusCode: 400 });

describe("1. every path to a governed session refuses foreign hook sources", () => {
  test("resume: a re-registration of the session after a skill declares hooks is refused", () => {
    const workspace = claudeWorkspace();
    write(join(workspace, ".claude", "skills", "s", "SKILL.md"), skillWithHooks);
    expect(() => register(workspace, sessionOf(workspace))).toThrowError(refused);
  });

  test("a skill, agent or plugin added after registration makes the session not governed at its next decision", () => {
    for (const change of [
      (ws: string) => write(join(ws, ".claude", "skills", "s", "SKILL.md"), skillWithHooks),
      (ws: string) => write(join(ws, ".claude", "agents", "a.md"), skillWithHooks),
      (ws: string) => write(join(ws, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "p@m": true } })),
      (ws: string) => write(join(ws, ".claude", "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "/bin/true" }] }] } })),
    ]) {
      const workspace = claudeWorkspace();
      expect(readPublic(workspace).decision).toBe("allow");
      change(workspace);
      const after = readPublic(workspace);
      expect(after.decision).toBe("deny");
      expect(after.reason).toMatch(/not governed/);
    }
  });

  test("an unreadable or malformed source refuses: a skills directory AMC cannot list, a truncated settings file, malformed enabledPlugins", () => {
    const locked = claudeWorkspace({ register: false });
    const skills = join(locked, ".claude", "skills");
    mkdirSync(skills, { recursive: true });
    chmodSync(skills, 0o000);
    restore.push(() => chmodSync(skills, 0o700));
    expect(() => register(locked, "locked-skills")).toThrowError(refused);

    const truncated = claudeWorkspace({ register: false });
    write(join(truncated, ".claude", "settings.json"), "{\"hooks\": {");
    expect(() => register(truncated, "truncated-settings")).toThrowError(refused);

    const malformed = claudeWorkspace({ register: false });
    write(join(malformed, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: ["p@m"] }));
    expect(() => register(malformed, "malformed-plugins")).toThrowError(refused);
  });

  test("a missing settings file is read as empty, as Claude Code reads it", () => {
    const workspace = claudeWorkspace({ register: false });
    expect(register(workspace, "no-user-settings", join(workspace, ".fixture-home", "fresh-config"))).toMatchObject({ registered: true });
  });
});

describe("2. every protected-path check resolves paths the way Read and Write do", () => {
  // `.AMC`, `./x/../.amc`, a symlink to .amc, a full-width lookalike, a trailing dot and a trailing slash.
  function forms(root: string): string[] {
    symlinkSync(join(root, ".amc"), join(root, "amc-link"));
    return [".AMC", "./x/../.amc", "amc-link", "．ａｍｃ", ".amc.", ".amc/"];
  }
  test("Read, Grep, Glob and Bash words naming .amc in any of its forms are denied", () => {
    const workspace = claudeWorkspace();
    const root = cwdOf(workspace);
    for (const form of forms(root)) {
      const absolute = `${root}/${form}`;
      const lease = `${absolute.replace(/\/$/, "")}/hooks/claude-code.lease`;
      for (const [tool, input] of [["Read", { file_path: lease }], ["Grep", { pattern: "x", path: absolute }], ["Glob", { pattern: "*", path: absolute }],
        ["Bash", { command: `'/bin/cat' '${form.replace(/\/$/, "")}/hooks/claude-code.lease'`, description: "x" }],
        ["Bash", { command: `'/bin/ls' '${form}'`, description: "x" }]] as const) {
        const decision = call(workspace, tool, input);
        expect(decision.decision, `${tool} ${form}`).toBe("deny");
        expect(decision.reason, `${tool} ${form}`).toContain("AMC protects its hook configuration.");
      }
    }
  });
});
