import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runNativeInteractiveSession, type NativeChatOptions } from "../src/setup/nativeInteractiveSession.js";
import { renderNativeGuideCommand } from "../src/setup/nativeFirstUseGuide.js";
import { prepareSkillTurn } from "../src/skills/skillTurn.js";

// This is a composition regression, not a real PTY, provider or signed-session
// acceptance. The child is simulated; its actual emitted argv selects the real
// filesystem skill resolver so dropping --credentials-home is observable.
const seam = vi.hoisted(() => ({
  answers: [] as string[],
  commands: [] as { executable: string; argv: string[]; cwd: string; shell: boolean }[],
  onCommand: null as null | ((argv: string[], cwd: string) => { code: number; stdout: string }),
  killed: [] as unknown[]
}));

vi.mock("node:readline", async importOriginal => {
  const actual = await importOriginal<typeof import("node:readline")>();
  const { EventEmitter } = await import("node:events");
  return { ...actual, createInterface: () => {
    const terminal = new EventEmitter();
    let closed = false;
    return Object.assign(terminal, {
      question: (_prompt: string, _options: unknown, answer: (line: string) => void) => {
        queueMicrotask(() => answer(seam.answers.shift() ?? "/exit"));
      },
      close: () => { if (!closed) { closed = true; terminal.emit("close"); } }
    });
  } };
});

vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return { ...actual, spawn: (executable: string, argv: string[], options: { cwd: string; shell: boolean }) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(),
      kill: (signal: unknown) => { seam.killed.push(signal); return true; }
    });
    seam.commands.push({ executable, argv: [...argv], cwd: options.cwd, shell: options.shell });
    queueMicrotask(() => {
      let result: { code: number; stdout: string };
      try { result = seam.onCommand?.(argv, options.cwd) ?? { code: 1, stdout: "{}" }; }
      catch { result = { code: 1, stdout: "{}" }; }
      child.stdout.end(result.stdout);
      child.stderr.end();
      queueMicrotask(() => child.emit("close", result.code));
    });
    return child;
  } };
});

function option(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index < 0 ? undefined : argv[index + 1];
}

describe("AMC-1512 native home propagation through the chat composition seam", () => {
  let root: string;
  let workspace: string;
  let home: string;
  let file: string;
  let priorInput: PropertyDescriptor | undefined;
  let priorOutput: PropertyDescriptor | undefined;
  let logs: string[];
  let errors: string[];
  let loaded: { ok: boolean; sourcePath: string | null; body: string | null }[];
  const secret = "synthetic-home-propagation-secret-never-render";
  const fail = vi.fn();

  function skill(base: string, name: string, body: string): string {
    const directory = join(base, "skills", name);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "SKILL.md");
    writeFileSync(path, `---\nname: ${name}\ndescription: Fixture ${name}\n---\n${body}\n`);
    return path;
  }
  function options(extra: Partial<NativeChatOptions> = {}): NativeChatOptions {
    return { workspace, agentId: "reviewer", provider: "stub", credentialsHome: home,
      credentialsFile: file, env: {}, userEnvPath: join(root, "absent-user.env"), ...extra };
  }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "amc-native-home-propagation-"));
    workspace = join(root, "workspace");
    home = join(root, "shared home with 'quote'");
    const secrets = join(root, "independent credential store");
    mkdirSync(join(workspace, ".amc"), { recursive: true });
    writeFileSync(join(workspace, ".amc", "amc.config.yaml"), "profile: dev\n");
    mkdirSync(home, { mode: 0o700 });
    mkdirSync(secrets, { mode: 0o700 });
    file = join(secrets, "selected.yaml");
    writeFileSync(file, `OPENAI_API_KEY: ${secret}\n`, { mode: 0o600 });
    priorInput = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    priorOutput = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    seam.answers = []; seam.commands = []; seam.killed = [];
    logs = []; errors = []; loaded = []; fail.mockReset();
    seam.onCommand = (argv, cwd) => {
      const prompt = argv[argv.indexOf("--") + 1]!;
      const result = prepareSkillTurn({ workspace: cwd, amcHome: option(argv, "--credentials-home"), prompt });
      loaded.push({ ok: result.ok, sourcePath: result.ok ? result.loaded?.sourcePath ?? null : null,
        body: result.ok ? result.loaded?.body ?? null : null });
      return { code: result.ok ? 0 : 1, stdout: JSON.stringify({
        sessionId: option(argv, "--session") ?? "simulated-child-session",
        driverStatus: result.ok ? "idle" : "failed",
        assistantText: loaded.map(item => item.body ?? "No skill loaded"),
        endings: [{ reason: result.ok ? "complete" : "error" }],
        validation: { status: "not-requested" }
      }) };
    };
  });
  afterEach(() => {
    if (priorInput) Object.defineProperty(process.stdin, "isTTY", priorInput);
    else Reflect.deleteProperty(process.stdin, "isTTY");
    if (priorOutput) Object.defineProperty(process.stdout, "isTTY", priorOutput);
    else Reflect.deleteProperty(process.stdout, "isTTY");
    seam.onCommand = null;
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it("keeps a home-only skill resolvable on the first child, follow-up and printed resume", async () => {
    const path = skill(home, "home-only", "Shared instructions selected by the operator.");
    seam.answers = ["/home-only first", "/home-only second", "/exit"];
    await runNativeInteractiveSession(options(), { log: line => logs.push(line), error: line => errors.push(line), fail });
    expect(fail).not.toHaveBeenCalled();
    expect(seam.commands).toHaveLength(2);
    expect(loaded).toEqual([
      { ok: true, sourcePath: path, body: "Shared instructions selected by the operator.\n" },
      { ok: true, sourcePath: path, body: "Shared instructions selected by the operator.\n" }
    ]);
    for (const command of seam.commands) {
      expect(command.shell).toBe(false);
      expect(command.cwd).toBe(workspace);
      expect(option(command.argv, "--credentials-home")).toBe(home);
      expect(option(command.argv, "--credentials-file")).toBe(file);
      expect(command.argv.at(-1)).toMatch(/^\/home-only /);
    }
    expect(option(seam.commands[1]!.argv, "--session")).toBe("simulated-child-session");
    const resume = logs.find(line => line.startsWith("Resume in this workspace:"));
    expect(resume).toContain(renderNativeGuideCommand({ cwd: workspace, argv: ["--credentials-home", home] }));
    expect(resume).toContain(renderNativeGuideCommand({ cwd: workspace, argv: ["--credentials-file", file] }));
    expect(resume).toContain("--session simulated-child-session");
    expect([...logs, ...errors].join("\n")).not.toContain(secret);
    expect(seam.killed).toEqual([]);
    expect(logs.join("\n")).toContain("this summary contains no usage projection");
  });

  it("preserves the same home on an explicitly resumed session while workspace skills still win", async () => {
    skill(home, "review", "Shared version.");
    const workspacePath = skill(join(workspace, ".amc"), "review", "Workspace override.");
    seam.answers = ["/review resumed task", "/exit"];
    await runNativeInteractiveSession(options({ session: "existing-simulated-session" }), {
      log: line => logs.push(line), error: line => errors.push(line), fail
    });
    expect(fail).not.toHaveBeenCalled();
    expect(seam.commands).toHaveLength(1);
    expect(option(seam.commands[0]!.argv, "--session")).toBe("existing-simulated-session");
    expect(option(seam.commands[0]!.argv, "--credentials-home")).toBe(home);
    expect(loaded).toEqual([{ ok: true, sourcePath: workspacePath, body: "Workspace override.\n" }]);
  });

  it("does not treat the credential file's directory as an implicit shared skill home", async () => {
    const workspacePath = skill(join(workspace, ".amc"), "local", "Workspace instructions.");
    seam.answers = ["/local task", "/exit"];
    await runNativeInteractiveSession(options({ credentialsHome: undefined }), {
      log: line => logs.push(line), error: line => errors.push(line), fail
    });
    expect(fail).not.toHaveBeenCalled();
    expect(seam.commands).toHaveLength(1);
    expect(option(seam.commands[0]!.argv, "--credentials-home")).toBeUndefined();
    expect(option(seam.commands[0]!.argv, "--credentials-file")).toBe(file);
    expect(loaded[0]?.sourcePath).toBe(workspacePath);
    expect(logs.find(line => line.startsWith("Resume in this workspace:"))).not.toContain("--credentials-home");
  });

  it("shows only the configured credential reference and source before a real-provider route is used", async () => {
    seam.answers = ["/exit"];
    await runNativeInteractiveSession(options({ provider: "openai", model: "fixture-model", credential: "OPENAI_API_KEY" }), {
      log: line => logs.push(line), error: line => errors.push(line), fail
    });
    expect(fail).not.toHaveBeenCalled();
    expect(seam.commands).toEqual([]);
    expect(logs.join("\n")).toContain("Credential reference: OPENAI_API_KEY; local source file");
    expect(logs.join("\n")).toContain("not remote authentication proof");
    expect([...logs, ...errors].join("\n")).not.toContain(secret);
  });

  it("stops on a mismatched resumed result and retains only the previously known reference", async () => {
    seam.answers = ["task", "must not be submitted", "/exit"];
    seam.onCommand = () => ({ code: 0, stdout: JSON.stringify({ sessionId: "wrong-session", driverStatus: "idle", assistantText: ["Unadmitted reply"] }) });
    await runNativeInteractiveSession(options({ session: "known-session" }), {
      log: line => logs.push(line), error: line => errors.push(line), fail
    });
    expect(fail).toHaveBeenCalledOnce();
    expect(seam.commands).toHaveLength(1);
    expect(errors.join("\n")).toContain("SESSION_MISMATCH");
    expect(logs.join("\n")).not.toContain("Unadmitted reply");
    expect(logs.join("\n")).not.toContain("wrong-session");
    expect(logs.find(line => line.startsWith("Resume in this workspace:"))).toContain("--session known-session");
  });
  it("does not adopt the parent as a new fork or submit another task after the bad result", async () => {
    seam.answers = ["/fork", "forked task", "must not be submitted", "/exit"];
    seam.onCommand = () => ({ code: 0, stdout: JSON.stringify({ sessionId: "parent-session", driverStatus: "idle", assistantText: ["Not a fork reply"] }) });
    await runNativeInteractiveSession(options({ session: "parent-session" }), {
      log: line => logs.push(line), error: line => errors.push(line), fail
    });
    expect(fail).toHaveBeenCalledOnce();
    expect(seam.commands).toHaveLength(1);
    expect(option(seam.commands[0]!.argv, "--fork-from")).toBe("parent-session");
    expect(errors.join("\n")).toContain("FORK_IDENTITY_INVALID");
    expect(logs.join("\n")).not.toContain("Not a fork reply");
    expect(logs.find(line => line.startsWith("Resume in this workspace:"))).toContain("--session parent-session");
  });
  it("adopts a distinct fork child and uses that exact reference on the next operator task", async () => {
    seam.answers = ["/fork", "forked task", "follow-up", "/exit"];
    seam.onCommand = () => ({ code: 0, stdout: JSON.stringify({ sessionId: "new-child-session", driverStatus: "idle", assistantText: ["Child reply"] }) });
    await runNativeInteractiveSession(options({ session: "parent-session" }), {
      log: line => logs.push(line), error: line => errors.push(line), fail
    });
    expect(fail).not.toHaveBeenCalled();
    expect(seam.commands).toHaveLength(2);
    expect(option(seam.commands[0]!.argv, "--fork-from")).toBe("parent-session");
    expect(option(seam.commands[1]!.argv, "--session")).toBe("new-child-session");
    expect(logs.find(line => line.startsWith("Resume in this workspace:"))).toContain("--session new-child-session");
  });
  it("stops when a closed child reports running instead of printing an adopted reply", async () => {
    seam.answers = ["task", "must not be submitted", "/exit"];
    seam.onCommand = () => ({ code: 0, stdout: JSON.stringify({ sessionId: "unusable-session", driverStatus: "running", assistantText: ["Unadmitted reply"] }) });
    await runNativeInteractiveSession(options(), { log: line => logs.push(line), error: line => errors.push(line), fail });
    expect(fail).toHaveBeenCalledOnce();
    expect(seam.commands).toHaveLength(1);
    expect(errors.join("\n")).toContain("RESULT_STATE_INVALID");
    expect(logs.join("\n")).not.toContain("Unadmitted reply");
    expect(logs.some(line => line.startsWith("Resume in this workspace:"))).toBe(false);
  });
  it("keeps a valid matching failed outcome visible without claiming completion", async () => {
    seam.answers = ["task", "/exit"];
    seam.onCommand = () => ({ code: 1, stdout: JSON.stringify({ sessionId: "known-session", driverStatus: "failed",
      assistantText: [], endings: [{ reason: "error" }], validation: { status: "unavailable" } }) });
    await runNativeInteractiveSession(options({ session: "known-session" }), {
      log: line => logs.push(line), error: line => errors.push(line), fail
    });
    expect(fail).toHaveBeenCalledOnce();
    expect(logs.join("\n")).toContain("driver failed");
    expect(logs.join("\n")).toContain("recorded turn ending error");
    expect(errors.join("\n")).toContain("No successful task completion is claimed");
    expect(logs.find(line => line.startsWith("Resume in this workspace:"))).toContain("--session known-session");
  });
});
