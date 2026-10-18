/**
 * P1-23 independent review (round three): Grep and Glob from a root that holds AMC's files, an allow that grants instead
 * of only restricting, hooks Claude Code runs that the settings scan missed (plugins, skill and agent frontmatter,
 * `--settings`), Bash arguments that name AMC's files, and a re-registration that moves the session's settings.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runHookForward } from "../src/adapters/hookForwarder.js";
import { clearPiDigestCache } from "../src/adapters/pi/piInstall.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { registerClaudeCodeSession } from "../src/bridge/claudeCodeSessionRegistry.js";
import { agentId, claudeWorkspace, controlRequest, decide, lease, recorded, register } from "./helpers/claudeCodeHookFixtures.js";
import { freePort, removeFixtureWorkspaces } from "./helpers/piHookFixtures.js";

afterEach(() => {
  removeFixtureWorkspaces();
  clearPiDigestCache();
});

let calls = 0;
const sessionOf = (workspace: string) => String(recorded("SessionStart-startup", workspace).session_id);
const cwdOf = (workspace: string) => String(recorded("PreToolUse-read", workspace).cwd);
function call(workspace: string, toolName: string, toolInput: Record<string, unknown>) {
  calls += 1;
  return decide(workspace, controlRequest({ ...recorded("PreToolUse-read", workspace), session_id: sessionOf(workspace), tool_use_id: `toolu_r3_${calls}`,
    tool_name: toolName, tool_input: toolInput }));
}
const PROTECTED = "AMC protects its hook configuration.";

describe("1. Grep and Glob never search a root that holds AMC's files", () => {
  test("a search of the workspace root, an ancestor of it or the user's Claude Code directory is denied; a subdirectory is not", () => {
    const workspace = claudeWorkspace();
    const root = cwdOf(workspace);
    mkdirSync(join(root, "src"), { recursive: true });
    for (const [tool, input] of [["Grep", { pattern: "LEASE" }], ["Grep", { pattern: "LEASE", path: root }], ["Grep", { pattern: "LEASE", glob: "*.lease" }],
      ["Glob", { pattern: "**/*" }], ["Glob", { pattern: "**/*", path: root }], ["Grep", { pattern: "x", path: join(root, "..") }],
      ["Grep", { pattern: "x", path: join(root, ".claude") }], ["Glob", { pattern: "*", path: homedir() }]] as const) {
      const decision = call(workspace, tool, input);
      expect(decision.decision, JSON.stringify(input)).toBe("deny");
      expect(decision.reason, JSON.stringify(input)).toContain(PROTECTED);
    }
    expect(call(workspace, "Grep", { pattern: "x", path: join(root, "src") }).reason).not.toContain(PROTECTED);
  });
});

describe("2. AMC only restricts: a verified allow defers to Claude Code's own permissions", () => {
  test("the answer to an allowed call is exit 0 with no permission decision", async () => {
    const port = await freePort();
    const workspace = claudeWorkspace({ bridgeBase: `http://127.0.0.1:${port}` });
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    try {
      const read = { ...recorded("PreToolUse-read", workspace), tool_use_id: "toolu_r3_allow", tool_input: { file_path: join(cwdOf(workspace), "workspace", "public.txt") } };
      const outcome = await runHookForward({ provider: "claude-code", mode: "control", agent: agentId, tokenFile: ".amc/hooks/claude-code.lease",
        bridgeUrl: `http://127.0.0.1:${port}`, event: "PreToolUse" }, async () => Buffer.from(JSON.stringify(read)), workspace, 5_000);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).not.toContain("permissionDecision");
      expect(JSON.parse(outcome.stdout)).toEqual({});
    } finally {
      await bridge.close();
    }
  });
});

describe("3. a session whose Claude Code runs hooks AMC did not install is not registered", () => {
  const refused = expect.objectContaining({ statusCode: 400 });
  const write = (path: string, text: string) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  };
  const hookFrontmatter = "---\nname: x\nhooks:\n  PreToolUse:\n    - matcher: \"*\"\n      hooks:\n        - type: command\n          command: /bin/true\n---\nbody\n";

  test("an enabled plugin, in project or user settings", () => {
    const project = claudeWorkspace({ register: false });
    write(join(project, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "rewriter@market": true } }));
    expect(() => register(project, "plugin-project")).toThrowError(refused);
    const user = claudeWorkspace({ register: false });
    const configDir = join(user, ".fixture-home", ".claude");
    write(join(configDir, "settings.json"), JSON.stringify({ enabledPlugins: { "rewriter@market": true } }));
    expect(() => register(user, "plugin-user", configDir)).toThrowError(refused);
  });

  test("skill or agent frontmatter hooks, in the project or the user's directory", () => {
    for (const rel of [[".claude", "skills", "s", "SKILL.md"], [".claude", "agents", "a.md"]]) {
      const workspace = claudeWorkspace({ register: false });
      write(join(workspace, ...rel), hookFrontmatter);
      expect(() => register(workspace, `frontmatter-${rel[1]}`), rel.join("/")).toThrowError(refused);
    }
    const workspace = claudeWorkspace({ register: false });
    const configDir = join(workspace, ".fixture-home", ".claude");
    write(join(configDir, "agents", "a.md"), hookFrontmatter);
    expect(() => register(workspace, "frontmatter-user", configDir)).toThrowError(refused);
  });

  test("a Claude Code process started with --settings", async () => {
    const workspace = claudeWorkspace({ register: false });
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", "--", "--settings", "/tmp/extra.json"], { stdio: "ignore" });
    try {
      await new Promise((done) => setTimeout(done, 300));
      expect(() => register(workspace, "settings-flag", join(workspace, ".fixture-home", ".claude"), child.pid)).toThrowError(refused);
    } finally {
      child.kill();
    }
  });

  test("with allowManagedHooksOnly and AMC's hooks delivered by managed settings, a project plugin no longer refuses", () => {
    const workspace = claudeWorkspace({ register: false });
    const managedDir = join(workspace, ".fixture-managed");
    const local = JSON.parse(readFileSync(join(workspace, ".claude", "settings.local.json"), "utf8")) as { hooks: unknown };
    write(join(managedDir, "managed-settings.json"), JSON.stringify({ allowManagedHooksOnly: true, hooks: local.hooks }));
    write(join(workspace, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "rewriter@market": true } }));
    const configDir = join(workspace, ".fixture-home", ".claude");
    mkdirSync(configDir, { recursive: true });
    const body = (sessionId: string) => JSON.stringify({ hook_event_name: "SessionStart", session_id: sessionId, amc: { claudePid: process.pid, configDir } });
    expect(registerClaudeCodeSession({ workspace, authenticatedAgentId: agentId, rawInput: body("managed-only"), managedDir, lease }))
      .toMatchObject({ registered: true });
    write(join(managedDir, "managed-settings.json"), JSON.stringify({ allowManagedHooksOnly: true, hooks: local.hooks, enabledPlugins: { "forced@market": true } }));
    expect(() => registerClaudeCodeSession({ workspace, authenticatedAgentId: agentId, rawInput: body("managed-plugin"), managedDir, lease })).toThrowError(refused);
  });
});

describe("4. a Bash command that names AMC's files is denied", () => {
  test("arguments naming .amc, the hook lease or a Claude Code settings file", () => {
    const workspace = claudeWorkspace();
    const root = cwdOf(workspace);
    for (const command of ["'/bin/cat' '.amc/hooks/claude-code.lease'", `'/bin/cat' '${root}/.amc/hooks/claude-code.lease'`, "'/bin/rm' './.amc'",
      "'/usr/bin/sed' '-i' '' 's/x/y/' '.claude/settings.local.json'", "'/bin/cp' 'x' '--target-directory=.amc/hooks'"]) {
      const decision = call(workspace, "Bash", { command, description: "x" });
      expect(decision.decision, command).toBe("deny");
      expect(decision.reason, command).toContain(PROTECTED);
    }
    expect(call(workspace, "Bash", { command: "'/bin/echo' 'hello'", description: "x" }).reason).not.toContain(PROTECTED);
  });
});

describe("4b. a Bash word that names AMC's files anywhere inside it is denied", () => {
  test(".amc, .claude/settings and a hook lease after a prefix (@, -f, -C, =) or before a non-alphanumeric character", () => {
    const workspace = claudeWorkspace();
    const root = cwdOf(workspace);
    for (const command of ["'/usr/bin/curl' '-d' '@.amc/hooks/claude-code.lease' 'http://127.0.0.1:9/'", `'/usr/bin/curl' '--data-binary' '@${root}/.amc/hooks/claude-code.lease'`,
      "'/bin/cat' '-f.amc/hooks/claude-code.lease'", "'/bin/cat' '-F.AMC/hooks/x'", `'/bin/cat' '${root}/.amc\u200b/x'`, "'/bin/cat' '-f.claude/settings.local.json'",
      "'/bin/cat' '@.Claude/Settings.json'", "'/bin/cp' '/tmp/stolen/claude-code.lease' 'x'"]) {
      const decision = call(workspace, "Bash", { command, description: "x" });
      expect(decision.decision, command).toBe("deny");
      // A non-ASCII word (the zero-width space) is not classified at all: the pure-form refusal.
      expect(decision.reason, command).toMatch(/AMC protects its hook configuration\.|pure form/);
    }
    for (const command of ["'/bin/echo' 'release.amcrelease'", "'/bin/echo' 'hello'"]) expect(call(workspace, "Bash", { command, description: "x" }).reason).not.toContain(PROTECTED);
  });
});

describe("4c. Bash words are checked as bash passes them, and only plain words are classified", () => {
  test("quoting tricks, escapes, globs, braces, ANSI-C quoting and non-ASCII lookalikes are denied", () => {
    const workspace = claudeWorkspace();
    const words = ["'.am''c/hooks/x'", "'.\\amc/hooks/x'", "$'\\x2eamc'/hooks/x", "'\uff0eamc/hooks/x'", "'.AMC/hooks/x'", "'.a\\mc/hooks/x'",
      "'{.amc,x}'", "'.am?/hooks/claude-code.lease'", "'x/*'", "'a$b'", "'a`id`'", "'x~y'", "'[ab]'"];
    for (const word of words) {
      const command = `'/bin/cat' ${word}`;
      const decision = call(workspace, "Bash", { command, description: "x" });
      expect(decision.decision, command).toBe("deny");
      expect(decision.reason, command).toMatch(/pure form|AMC protects its hook configuration/);
    }
    expect(call(workspace, "Bash", { command: "'/bin/echo' 'plain-words_1.2' '~/notes' 'a b'", description: "x" }).reason).not.toMatch(/pure form|AMC protects/);
  });
});

describe("6. a session's Claude Code configuration directory is bound by its first registration", () => {
  test("a re-registration naming another configuration directory is refused", () => {
    const workspace = claudeWorkspace();
    expect(() => register(workspace, sessionOf(workspace), join(workspace, ".fixture-home", "elsewhere")))
      .toThrowError(expect.objectContaining({ statusCode: 409 }));
    expect(register(workspace, sessionOf(workspace))).toMatchObject({ registered: true, idempotentReplay: true });
  });
});
