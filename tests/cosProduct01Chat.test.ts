import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseNativeChatResult, type NativeChatChildSummary } from "../src/setup/nativeChatResult.js";
import { runNativeInteractiveSession, type NativeChatOptions } from "../src/setup/nativeInteractiveSession.js";
import * as usage from "../src/agent/nativeRunUsage.js";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initWorkspace } from "../src/workspace.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { nativeMcpToolName } from "../src/mcp/nativeMcpClient.js";
import { sha256Hex } from "../src/utils/hash.js";

// Synthetic readline, child and setup seams exercise chat composition without
// a real terminal, credentials, signed session or provider. The separate measured
// terminal suite covers public CLI workflows.
// Operational command audit has its own signed-publication regression suite.
vi.mock("../src/setup/nativeInteractiveCommandAudit.js", () => ({
  runNativeInteractiveCommand: async (_input: unknown, run: () => Promise<unknown>) => run()
}));

const seam = vi.hoisted(() => ({
  answers: [] as string[], commands: [] as string[][], results: [] as { body: unknown; code: number }[],
  signals: [] as unknown[], cancelWhileApproving: false, abortedAtKill: false,
  questionSignal: undefined as AbortSignal | undefined,
  cancelApproval: vi.fn(), closeApproval: vi.fn(), preview: "", selectionChecks: 0, changedSelectionAt: 0,
  withdrawCalls: [] as string[], withdrawStatus: "withdrawn",
  presetOptions: {} as Record<string, unknown>, reviewers: 0
}));

vi.mock("node:readline", async importOriginal => {
  const actual = await importOriginal<typeof import("node:readline")>();
  const { EventEmitter } = await import("node:events");
  return { ...actual, createInterface: () => {
    const terminal = new EventEmitter();
    let closed = false;
    return Object.assign(terminal, {
      question: (prompt: string, options: { signal: AbortSignal }, answer: (line: string) => void) => {
        if (prompt.startsWith("Approval:")) {
          seam.questionSignal = options.signal;
          queueMicrotask(() => { terminal.emit("SIGINT"); terminal.emit("SIGINT"); answer("approve"); });
        } else queueMicrotask(() => answer(seam.answers.shift() ?? "/exit"));
      },
      close: () => { if (!closed) { closed = true; terminal.emit("close"); } }
    });
  } };
});
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  return { ...actual, spawn: (_executable: string, argv: string[]) => {
    seam.commands.push([...argv]);
    const result = seam.results.shift() ?? { code: 1, body: {} };
    let closed = false;
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null, signalCode: null,
      kill: (signal: unknown) => {
        seam.signals.push(signal); seam.abortedAtKill = seam.questionSignal?.aborted === true;
        queueMicrotask(finish); return true;
      }
    });
    function finish() {
      if (closed) return;
      closed = true;
      child.stdout.end(JSON.stringify(result.body)); child.stderr.end(); child.exitCode = result.code;
      queueMicrotask(() => child.emit("close", result.code));
    }
    queueMicrotask(() => {
      if (seam.preview) child.stderr.write(seam.preview);
      if (!seam.cancelWhileApproving) finish();
    });
    return child;
  } };
});
vi.mock("../src/setup/nativeInteractiveApprovals.js", () => ({ createNativeInteractiveApprovals: (options: {
  child: ChildProcess; question: (prompt: string, signal?: AbortSignal) => Promise<string | null>
}) => {
  const controller = new AbortController();
  seam.reviewers++;
  if (seam.cancelWhileApproving) void options.question("Approval: ", controller.signal);
  return {
    cancel: () => { seam.cancelApproval(); controller.abort(); options.child.kill("SIGINT"); },
    close: async () => { seam.closeApproval(); controller.abort(); }
  };
} }));
vi.mock("../src/setup/nativeChatProfile.js", () => ({
  resolveNativeChatProfile: () => ({ effectiveOptions: seam.presetOptions, presetId: Object.keys(seam.presetOptions).length === 0 ? null : "reviewer" }),
  nativeChatProfileArgv: () => [], assertNativeChatProfileCurrent: () => {}
}));
vi.mock("../src/setup/nativeValidationConfig.js", () => ({ resolveNativeValidationSelection: () => undefined }));
vi.mock("../src/setup/nativeFirstUseGuide.js", () => ({
  inspectNativeFirstUse: async (options: NativeChatOptions) => ({ status: "ready", agentId: options.agentId ?? "reviewer",
    model: "synthetic-model", baseUrl: null, credential: null,
    nextAction: { argv: ["amc", "agent-loop", "run", "--credentials-file", "/synthetic/refs.yaml"] } }),
  renderNativeFirstUseGuide: () => "Synthetic setup only",
  renderNativeGuideCommand: (command: { argv: readonly string[] }) => command.argv.join(" ")
}));
vi.mock("../src/extensions/nativeExtensionRuntime.js", () => ({
  loadNativeExtensions: () => ({ list: () => [], prepareTurn: () => ({ commands: [] }), unloadAll: () => {} }),
  nativeExtensionRunArgv: () => []
}));
vi.mock("../src/setup/nativeInteractiveNavigation.js", () => {
  const row = { sessionId: "known-session", source: "native", state: "released", canResume: true, agentId: "reviewer",
    parentSessionId: null, headEventId: "head", headEventHash: "a".repeat(64), updatedAt: 1, turns: 1 };
  return {
    listNativeInteractiveSessions: () => [row], renderNativeInteractiveSession: () => "Session known-session · released",
    assertNativeInteractiveSelection: () => {
      seam.selectionChecks++;
      if (seam.changedSelectionAt === seam.selectionChecks) throw new Error("Session changed since selection. Use /resume again; no task was sent.");
      return row;
    }
  };
});
vi.mock("../src/setup/nativeInteractiveWithdraw.js", () => ({
  listNativeQueuedSubmissions: (_workspace: string, sessionId: string) => {
    seam.withdrawCalls.push(`list:${sessionId}`);
    return { headEventId: "listed-head", pending: [{ messageId: "queued-1", target: "next-turn", origin: "followup" }] };
  },
  withdrawNativeQueuedSubmission: (_workspace: string, sessionId: string, messageId: string, head: string) => {
    seam.withdrawCalls.push(`withdraw:${sessionId}:${messageId}:${head}`);
    return { status: seam.withdrawStatus, messageId };
  }
}));
vi.mock("../src/skills/skillTurn.js", () => ({ workspaceSkillRoots: () => [], prepareSkillTurn: () => ({ ok: false, reason: "No synthetic skill" }) }));
vi.mock("../src/skills/skillCatalog.js", () => ({ buildSkillCatalog: () => ({ skills: [], problems: [] }) }));

const summary = (extra: Partial<NativeChatChildSummary> = {}): NativeChatChildSummary => ({
  sessionId: "known-session", driverStatus: "idle", assistantText: ["Earlier reply"],
  endings: [{ reason: "complete", turn: 1 }], validation: { status: "not-requested" }, ...extra
});
const parse = (current: NativeChatChildSummary, previous = summary(), forkFrom: string | null = null) =>
  parseNativeChatResult({ stdout: JSON.stringify(current), truncated: false,
    requestedSessionId: previous.sessionId, forkFrom, previousSummary: previous });

describe("P01 resumed chat history admission", () => {
  it("accepts exact prefixes and preserves the new turn identity", () => {
    const current = summary({ assistantText: ["Earlier reply", "New reply"], endings: [
      { reason: "complete", turn: 1 }, { reason: "cancelled", turn: 2 }
    ] });
    expect(parse(current)).toEqual({ ok: true, summary: current });
  });
  it.each([
    { assistantText: [] }, { assistantText: ["Rewritten earlier reply", "New reply"] },
    { endings: [] }, { endings: [{ reason: "cancelled" as const, turn: 1 }] },
    { endings: [{ reason: "complete" as const, turn: 2 }] }
  ])("refuses a changed cumulative history instead of silently advancing its display cursor: %j", changed => {
    const result = parse(summary(changed));
    expect(result).toMatchObject({ ok: false, code: "RESULT_HISTORY_CHANGED" });
    expect(JSON.stringify(result)).not.toContain("Rewritten earlier reply");
  });
  it("does not copy a parent cursor into a distinct fork child", () => {
    const current = summary({ sessionId: "fork-child", assistantText: ["Independent child reply"] });
    expect(parse(current, summary(), "known-session")).toEqual({ ok: true, summary: current });
  });
  it.each([0, -1, 1.5, "2", null])("rejects a malformed supplied turn index: %j", turn => {
    expect(parseNativeChatResult({ stdout: JSON.stringify({ ...summary(), endings: [{ reason: "complete", turn }] }),
      truncated: false, requestedSessionId: null, forkFrom: null })).toMatchObject({ ok: false, code: "RESULT_INVALID" });
  });
  it("withholds explicitly unsigned text without calling a zero-count summary verified", () => {
    for (const unsignedRows of [1, 8]) {
      const result = parseNativeChatResult({ stdout: JSON.stringify({ ...summary(), unsignedRows }),
        truncated: false, requestedSessionId: null, forkFrom: null });
      expect(result).toMatchObject({ ok: false, code: "RESULT_UNSIGNED" });
      expect(JSON.stringify(result)).not.toContain("Earlier reply");
    }
    const result = parseNativeChatResult({ stdout: JSON.stringify({ ...summary(), unsignedRows: 0 }),
      truncated: false, requestedSessionId: null, forkFrom: null });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('"verified"');
  });
});

describe("P01 connected native chat behavior", () => {
  let inputTTY: PropertyDescriptor | undefined, outputTTY: PropertyDescriptor | undefined;
  let logs: string[], errors: string[], streams: string[], sequence: string[];
  const fail = vi.fn();
  beforeEach(() => {
    vi.stubEnv("TERM", "xterm-256color");
    inputTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    outputTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    seam.answers = []; seam.commands = []; seam.results = []; seam.signals = [];
    seam.cancelWhileApproving = false; seam.abortedAtKill = false; seam.questionSignal = undefined;
    seam.preview = ""; seam.selectionChecks = 0; seam.changedSelectionAt = 0; seam.cancelApproval.mockClear(); seam.closeApproval.mockClear();
    seam.withdrawCalls = []; seam.withdrawStatus = "withdrawn"; seam.presetOptions = {}; seam.reviewers = 0;
    logs = []; errors = []; streams = []; sequence = []; fail.mockReset();
    vi.spyOn(process.stderr, "write").mockImplementation(chunk => {
      streams.push(String(chunk)); sequence.push(`stream:${String(chunk)}`); return true;
    });
  });
  afterEach(() => {
    if (inputTTY) Object.defineProperty(process.stdin, "isTTY", inputTTY); else Reflect.deleteProperty(process.stdin, "isTTY");
    if (outputTTY) Object.defineProperty(process.stdout, "isTTY", outputTTY); else Reflect.deleteProperty(process.stdout, "isTTY");
    vi.restoreAllMocks(); vi.unstubAllEnvs();
  });
  const option = (args: readonly string[], flag: string) => { const at = args.indexOf(flag); return at < 0 ? undefined : args[at + 1]; };
  async function run(extra: Partial<NativeChatOptions> = {}) {
    await runNativeInteractiveSession({ workspace: "/synthetic/p01", provider: "stub", agentId: "reviewer", ...extra }, {
      log: line => { logs.push(line); sequence.push(`log:${line}`); }, error: line => errors.push(line), fail
    });
  }

  // SH-SANDBOX-04 in chat: an explicit --approval-mode replaces a preset's approveTools, as agent-loop run does; only
  // an explicit --approve-tools or --approve-risk beside the mode is refused. A gating mode's requests are reviewed here.
  it("an explicit --approval-mode replaces the preset's approveTools gate and this terminal reviews the mode's requests", async () => {
    seam.presetOptions = { approveTools: "WRITE_HIGH" };
    seam.answers = ["task", "/exit"];
    seam.results = [{ code: 0, body: summary() }];
    await run({ approvalMode: "default" });
    expect(fail).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("Approval mode default replaces the preset's approveTools WRITE_HIGH.");
    expect(seam.commands).toHaveLength(1);
    expect(option(seam.commands[0]!, "--approval-mode")).toBe("default");
    expect(seam.commands[0]).not.toContain("--approve-tools");
    expect(seam.commands[0]).toContain("--interactive-approvals");
    expect(seam.reviewers).toBe(1);
  });

  it("refuses an explicit --approve-tools or --approve-risk beside --approval-mode, with or without a preset", async () => {
    for (const extra of [{ approveTools: "WRITE_HIGH" }, { approveRisk: "low" }]) {
      fail.mockReset(); errors = []; seam.commands = [];
      seam.presetOptions = { approveTools: "WRITE_LOW" };
      await run({ approvalMode: "default", ...extra });
      expect(fail).toHaveBeenCalledTimes(1);
      expect(errors.join("\n")).toContain("--approval-mode composes its own gate");
      expect(seam.commands).toEqual([]);
    }
  });

  it("rechecks selected history before task dispatch and refuses a newly stale session", async () => {
    seam.answers = ["/resume", "1", "resume", "explicit task", "/exit"];
    seam.changedSelectionAt = 3;
    seam.results = [{ code: 0, body: { inspected: true } }];
    await run();
    expect(seam.selectionChecks).toBe(3);
    expect(seam.commands).toHaveLength(1);
    expect(seam.commands[0]).toEqual(expect.arrayContaining(["session", "show", "--", "known-session"]));
    expect(errors.join("\n")).toContain("Session changed since selection");
    expect(logs.join("\n")).not.toContain("Running stub/");
  });

  it("keeps plain terminal help honest about unsupported completion and history keys", async () => {
    vi.stubEnv("TERM", "dumb"); seam.answers = ["/exit"];
    await run();
    expect(logs.join("\n")).toContain("/help lists commands");
    expect(logs.join("\n")).not.toContain("Tab completes");
    expect(logs.join("\n")).not.toContain("Up/Down");
  });

  it("lists described built-ins without sending help to the model", async () => {
    seam.answers = ["/help", "/exit"];
    await run();
    expect(seam.commands).toEqual([]);
    expect(logs.join("\n")).toContain("/resume — Inspect and select");
    expect(logs.join("\n")).toContain("Tab completes");
    expect(fail).not.toHaveBeenCalled();
  });

  it.each([" /exit", "/EXIT", "/help extra"])("refuses noncanonical slash input before dispatch: %s", async input => {
    seam.answers = [input, "/exit"];
    await run();
    expect(seam.commands).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("refuses non-terminal input before provider setup or child execution", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    await run();
    expect(seam.commands).toEqual([]);
    expect(errors.join("\n")).toContain("Interactive chat requires a terminal");
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it("stops approval input before the cancellation signal, drains the reply and does not retry", async () => {
    seam.cancelWhileApproving = true; seam.answers = ["task", "/exit"];
    seam.results = [{ code: 0, body: summary({ endings: [{ reason: "cancelled", turn: 1 }] }) }];
    await run({ approveTools: "WRITE_LOW" });
    expect(seam.commands).toHaveLength(1);
    expect(seam.signals).toEqual(["SIGINT"]);
    expect(seam.cancelApproval).toHaveBeenCalledTimes(1);
    expect(seam.closeApproval).toHaveBeenCalledTimes(1);
    expect(seam.abortedAtKill).toBe(true);
    expect(logs.join("\n")).toContain("recorded turn ending cancelled");
    expect(logs.join("\n")).toContain("Task completion is not established: cancelled; cancellation was requested");
    expect(logs.find(line => line.startsWith("Resume in this workspace:"))).toContain("--session known-session");
  });

  it("labels provisional streaming and shows recent provider reports through the existing run boundary", async () => {
    seam.answers = ["task", "/exit"]; seam.preview = "provisional text without newline";
    seam.results = [{ code: 0, body: summary() }];
    const render = vi.spyOn(usage, "renderNativeRunUsage");
    await run();
    expect(seam.commands[0]).toEqual(expect.arrayContaining(["--keep-open", "--json", "--stream"]));
    expect(render).toHaveBeenCalledWith(undefined, { requestWindow: "latest" });
    expect(streams).toEqual([seam.preview, "\n"]);
    expect(sequence.findIndex(line => line.startsWith("log:Live output is provisional")))
      .toBeLessThan(sequence.indexOf(`stream:${seam.preview}`));
    expect(sequence.indexOf(`stream:${seam.preview}`)).toBeLessThan(sequence.indexOf("log:Recorded reply:"));
    expect(fail).not.toHaveBeenCalled();
  });

  it.each([true, false, undefined])("forwards --unsafe-unconfined-shell to the turn child and the printed resume only when opted in: %s", async unsafeUnconfinedShell => {
    seam.answers = ["task", "/exit"];
    seam.results = [{ code: 0, body: summary() }];
    await run(unsafeUnconfinedShell === undefined ? {} : { unsafeUnconfinedShell });
    const flags = (args: readonly string[]) => args.filter(arg => arg === "--unsafe-unconfined-shell").length;
    const expected = unsafeUnconfinedShell === true ? 1 : 0;
    expect(seam.commands).toHaveLength(1);
    expect(seam.commands[0]!.join(" ")).toContain(" agent-loop run ");
    expect(flags(seam.commands[0]!)).toBe(expected);
    const resume = logs.find(line => line.startsWith("Resume in this workspace:"));
    expect(resume).toContain("amc agent-loop chat");
    expect(flags(resume!.split(/\s+/))).toBe(expected);
    expect(fail).not.toHaveBeenCalled();
  });

  it("clears a queued fork without changing history or dispatching a command for the cancellation", async () => {
    seam.answers = ["/fork", "/fork cancel", "continue parent", "/exit"];
    seam.results = [{ code: 0, body: summary() }];
    await run({ session: "known-session" });
    expect(seam.commands).toHaveLength(1);
    expect(option(seam.commands[0]!, "--session")).toBe("known-session");
    expect(option(seam.commands[0]!, "--fork-from")).toBeUndefined();
    expect(logs.join("\n")).toContain("Queued fork cleared. The next task resumes known-session");
  });

  it("prints the not-yet-created fork continuation even when no session was opened", async () => {
    seam.answers = ["/exit"];
    await run({ forkFrom: "parent-only" });
    expect(seam.commands).toEqual([]);
    expect(logs.join("\n")).toContain("fork remains queued, not created");
    expect(logs.join("\n")).toContain("--fork-from parent-only");
    expect(logs.join("\n")).not.toContain("--session parent-only");
  });

  it("does not print a repeat-fork command after an ambiguous child result", async () => {
    seam.answers = ["fork task", "do not send", "/exit"];
    seam.results = [{ code: 0, body: summary({ sessionId: "parent-only" }) }];
    await run({ forkFrom: "parent-only" });
    expect(seam.commands).toHaveLength(1);
    expect(errors.join("\n")).toContain("Do not repeat it blindly");
    expect(logs.join("\n")).not.toContain("--fork-from parent-only");
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it("does not relabel the preceding turn's ending as the outcome of a later child", async () => {
    seam.answers = ["first", "second", "/exit"];
    seam.results = [{ code: 0, body: summary() }, { code: 0, body: summary() }];
    await run();
    expect(logs.filter(line => line === "Earlier reply")).toHaveLength(1);
    expect(logs.filter(line => line.includes("recorded turn ending complete"))).toHaveLength(1);
    expect(logs.join("\n")).toContain("Task completion is not established: no recorded turn ending");
  });

  it("stops after changed resume history and retains only the known reference", async () => {
    seam.answers = ["first", "second", "do not send", "/exit"];
    seam.results = [{ code: 0, body: summary() }, { code: 0, body: summary({ assistantText: ["Rewritten reply"] }) }];
    await run();
    expect(seam.commands).toHaveLength(2);
    expect(errors.join("\n")).toContain("RESULT_HISTORY_CHANGED");
    expect(logs.join("\n")).not.toContain("Rewritten reply");
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it("refuses /withdraw before any session exists without reading or writing history", async () => {
    seam.answers = ["/withdraw", "/exit"];
    await run();
    expect(seam.withdrawCalls).toEqual([]); expect(seam.commands).toEqual([]);
    expect(errors.join("\n")).toContain("before withdrawing a queued submission");
  });

  it.each([
    ["withdrawn", "Withdrawn: queued-1 was removed from the queue by a signed cancel row"],
    ["dispatched", "Not withdrawn: queued-1 was already dispatched to a recorded turn"],
    ["in-flight", "Not withdrawn: queued-1 was already dispatched to a turn that has no recorded ending; it is in flight or its outcome is TOOL_OUTCOME_UNKNOWN"],
    ["already-withdrawn", "Not changed: queued-1 was already withdrawn."],
    ["unknown", "Not withdrawn: no queued submission queued-1 exists"]
  ])("/withdraw lists queued work and reports a %s outcome without dispatching a turn", async (status, expected) => {
    seam.withdrawStatus = status; seam.answers = ["/withdraw", "queued-1", "/exit"];
    await run({ session: "known-session" });
    expect(seam.withdrawCalls).toEqual(["list:known-session", "withdraw:known-session:queued-1:listed-head"]);
    expect(seam.commands).toEqual([]);
    expect(logs.join("\n")).toContain("queued-1 · next-turn · from followup");
    expect(logs.join("\n")).toContain(expected);
    if (status !== "withdrawn") expect(logs.join("\n")).not.toContain("Withdrawn:");
  });

  it("/withdraw with a blank ID cancels without a withdrawal attempt", async () => {
    seam.answers = ["/withdraw", "", "/exit"];
    await run({ session: "known-session" });
    expect(seam.withdrawCalls).toEqual(["list:known-session"]);
  });

  describe("WP21c several reviewed MCP servers per chat", () => {
    const roots: string[] = [];
    afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
    // Review only: the run child repeats it and mounts. No server starts here.
    function reviewed() {
      vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp21c-chat-mcp");
      const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp21c-chat-mcp-"))); roots.push(workspace);
      initWorkspace({ workspacePath: workspace, agentId: "reviewer", trustBoundaryMode: "isolated" });
      const paths: string[] = [], pins: string[] = [];
      for (const [id, actionClass] of [["first", "READ_ONLY"], ["second", "WRITE_HIGH"]] as const) {
        const path = join(workspace, `${id}.json`);
        writeFileSync(path, JSON.stringify({ schemaVersion: 1, server: { id, command: process.execPath, args: ["-e", ""] },
          expectedCatalogDigest: "c".repeat(64), grants: [{ name: "lookup", actionClass }] }));
        paths.push(path); pins.push(sha256Hex(readFileSync(path)));
      }
      const config = loadToolsConfig(workspace);
      initToolsConfig(workspace, { ...config, tools: { ...config.tools, allowedTools: [{ name: "tool_search", actionClass: "READ_ONLY" },
        { name: nativeMcpToolName("first", "lookup"), actionClass: "READ_ONLY" }, { name: nativeMcpToolName("second", "lookup"), actionClass: "WRITE_HIGH" }] } });
      return { workspace, paths, pins };
    }
    const chat = (f: ReturnType<typeof reviewed>, extra: Partial<NativeChatOptions> = {}) =>
      run({ workspace: f.workspace, tools: "workspace", approveTools: "READ_ONLY", mcpConfig: f.paths, mcpConfigSha256: f.pins, ...extra });

    it("forwards every reviewed config with its pin to the turn child and the printed resume", async () => {
      const f = reviewed(); seam.answers = ["task", "/exit"]; seam.results = [{ code: 0, body: summary() }];
      await chat(f);
      const pairs = (args: readonly string[]) => args.flatMap((arg, at) => arg === "--mcp-config" ? [[args[at + 1], args[at + 3]]] : []);
      expect(errors).toEqual([]); expect(seam.commands).toHaveLength(1);
      expect(pairs(seam.commands[0]!)).toEqual([[f.paths[0], f.pins[0]], [f.paths[1], f.pins[1]]]);
      expect(pairs(logs.find(line => line.startsWith("Resume in this workspace:"))!.split(/\s+/))).toEqual(pairs(seam.commands[0]!));
    });

    it.each([
      ["tampered", /changed from its pinned digest/, (f: ReturnType<typeof reviewed>) => writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8") + "\n")],
      ["unreviewed", /explicit grants/, (f: ReturnType<typeof reviewed>) => { writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8").replace(/,"grants":\[[^\]]*\]/, "")); f.pins[1] = sha256Hex(readFileSync(f.paths[1]!)); }],
      ["unsigned-class", /exact generated name and action class/, (f: ReturnType<typeof reviewed>) => { writeFileSync(f.paths[1]!, readFileSync(f.paths[1]!, "utf8").replace("WRITE_HIGH", "READ_ONLY")); f.pins[1] = sha256Hex(readFileSync(f.paths[1]!)); }],
      ["unpaired", /one --mcp-config-sha256 per --mcp-config/, (f: ReturnType<typeof reviewed>) => { f.pins.pop(); }],
      ["duplicate", /distinct server id/, (f: ReturnType<typeof reviewed>) => { f.paths[1] = f.paths[0]!; f.pins[1] = f.pins[0]!; }]
    ])("refuses a %s server before any child or server starts", async (_case, reason, damage) => {
      const f = reviewed(); damage(f); seam.answers = ["task", "/exit"];
      await chat(f);
      expect(seam.commands).toEqual([]); expect(errors).toEqual([expect.stringMatching(reason)]); expect(fail).toHaveBeenCalledTimes(1);
    });
  });
});
