import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseNativeChatResult, type NativeChatChildSummary } from "../src/setup/nativeChatResult.js";
import { runNativeInteractiveSession, type NativeChatOptions } from "../src/setup/nativeInteractiveSession.js";
import * as usage from "../src/agent/nativeRunUsage.js";

// Authored, UNEXECUTED. Synthetic readline, child and setup seams exercise chat
// composition without a real terminal, credentials, signed session or provider.
const seam = vi.hoisted(() => ({
  answers: [] as string[], commands: [] as string[][], results: [] as { body: unknown; code: number }[],
  signals: [] as unknown[], cancelWhileApproving: false, abortedAtKill: false,
  questionSignal: undefined as AbortSignal | undefined,
  cancelApproval: vi.fn(), closeApproval: vi.fn(), preview: ""
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
  if (seam.cancelWhileApproving) void options.question("Approval: ", controller.signal);
  return {
    cancel: () => { seam.cancelApproval(); controller.abort(); options.child.kill("SIGINT"); },
    close: async () => { seam.closeApproval(); controller.abort(); }
  };
} }));
vi.mock("../src/setup/nativeChatProfile.js", () => ({
  resolveNativeChatProfile: () => ({ effectiveOptions: {}, presetId: null }),
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
    inputTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    outputTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    seam.answers = []; seam.commands = []; seam.results = []; seam.signals = [];
    seam.cancelWhileApproving = false; seam.abortedAtKill = false; seam.questionSignal = undefined;
    seam.preview = ""; seam.cancelApproval.mockClear(); seam.closeApproval.mockClear();
    logs = []; errors = []; streams = []; sequence = []; fail.mockReset();
    vi.spyOn(process.stderr, "write").mockImplementation(chunk => {
      streams.push(String(chunk)); sequence.push(`stream:${String(chunk)}`); return true;
    });
  });
  afterEach(() => {
    if (inputTTY) Object.defineProperty(process.stdin, "isTTY", inputTTY); else Reflect.deleteProperty(process.stdin, "isTTY");
    if (outputTTY) Object.defineProperty(process.stdout, "isTTY", outputTTY); else Reflect.deleteProperty(process.stdout, "isTTY");
    vi.restoreAllMocks();
  });
  const option = (args: readonly string[], flag: string) => { const at = args.indexOf(flag); return at < 0 ? undefined : args[at + 1]; };
  async function run(extra: Partial<NativeChatOptions> = {}) {
    await runNativeInteractiveSession({ workspace: "/synthetic/p01", provider: "stub", agentId: "reviewer", ...extra }, {
      log: line => { logs.push(line); sequence.push(`log:${line}`); }, error: line => errors.push(line), fail
    });
  }

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
});
