import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeTerminalTools } from "../src/terminal/nativeTerminalTools.js";
import type { NativeTerminalGrant, NativeTerminalRequest } from "../src/terminal/nativeTerminal.js";
import type { TerminalBackend, TerminalExit } from "../src/terminal/terminalTypes.js";
import { openNativePtyTerminal } from "../src/terminal/nativePtyTerminal.js";
import { ToolPipeline } from "../src/tools/toolPipeline.js";
import { ToolRegistry } from "../src/tools/toolRegistry.js";

let supported = true;
vi.mock("node:fs", async importOriginal => ({ ...await importOriginal<typeof import("node:fs")>(), realpathSync: (path: string) => path }));
vi.mock("../src/terminal/nativePtySandbox.js", () => ({ nativePtySupport: () => ({
  platform: "mock-only", arch: "mock-only", implementation: "linux-bwrap-python-pty", prerequisitesAvailable: supported,
  executionVerified: false, reason: "No qualified native PTY prerequisite; no fallback."
}) }));
vi.mock("../src/terminal/nativePtyTerminal.js", () => ({ openNativePtyTerminal: vi.fn() }));

const WORKSPACE = "/tmp/amc-wp16-terminal-tools";
const exits: TerminalExit = { code: null, signal: "SIGTERM", reason: "dispose", treeExitProven: true };
let owner = "session-alice";
let revoked: AbortController;
let permitted = true;
const runtimes: NativeTerminalTools[] = [];
interface FakeTerminal {
  readonly backend: TerminalBackend;
  emit(text: string): void;
  finish(exit?: TerminalExit): void;
  autoExit: boolean;
}
const fakes: FakeTerminal[] = [];
function fakeTerminal(): FakeTerminal {
  const listeners = new Set<(text: string) => void>();
  let resolveDone!: (exit: TerminalExit) => void;
  let cwd = WORKSPACE;
  const fake: FakeTerminal = {
    autoExit: true,
    emit(text) { for (const listener of listeners) listener(text); },
    finish(exit = exits) { resolveDone(exit); },
    backend: {
      kind: "pty", ready: Promise.resolve(), done: new Promise(resolve => { resolveDone = resolve; }),
      write: vi.fn(async (text: string) => {
        if (text === "cd sub\n") cwd = `${WORKSPACE}/sub`;
        if (text === "pwd\n") fake.emit(`${cwd}\n`);
        const marker = text.match(/'(AMC[0-9a-f]+)'/);
        if (marker) fake.emit(`${marker[1]}0\n`);
      }),
      resize: vi.fn(async () => undefined),
      onData(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      onExit: () => () => undefined,
      cancel: vi.fn(() => { if (fake.autoExit) fake.finish(); }),
      dispose: vi.fn(() => { if (fake.autoExit) fake.finish(); })
    }
  };
  fakes.push(fake);
  return fake;
}
function grant(request: NativeTerminalRequest): NativeTerminalGrant {
  return { capability: "interactive-pty", workspace: request.workspace,
    policy: { writableRoots: [], timeoutMs: request.timeoutMs, network: "deny", signal: revoked.signal },
    check: () => { if (!permitted) throw new Error("interactive authority revoked"); } };
}
function fixture(options: Partial<ConstructorParameters<typeof NativeTerminalTools>[0]> = {}) {
  const runtime = new NativeTerminalTools({ workspace: WORKSPACE, sessionId: () => owner, native: { authorize: grant },
    cleanupGraceMs: 10, ...options });
  runtimes.push(runtime);
  const registry = new ToolRegistry();
  for (const tool of runtime.tools()) registry.define(tool);
  // Test harness admission is explicit; production uses its signed policy/approval/authorization guards.
  const pipeline = new ToolPipeline({ registry, workspace: WORKSPACE, authorizeClasses: new Set() });
  const call = (name: string, args: Record<string, unknown> = {}, extra: Partial<Parameters<ToolPipeline["execute"]>[0]> = {}) => pipeline.execute({
    name, arguments: args, agentId: "agent", requestedMode: "EXECUTE", callId: "terminal-call",
    ownerStep: { sessionId: owner, turn: 1, step: 2, callId: "terminal-call" }, ...extra
  });
  const open = async () => {
    const result = await call("terminal_open");
    expect(result.ok, result.output).toBe(true);
    return JSON.parse(result.output).terminal_id as string;
  };
  return { runtime, call, open, registry };
}
beforeEach(() => {
  vi.clearAllMocks();
  supported = true; owner = "session-alice"; permitted = true; revoked = new AbortController();
  vi.mocked(openNativePtyTerminal).mockImplementation(() => fakeTerminal().backend);
});
afterEach(async () => {
  for (const fake of fakes.splice(0)) fake.finish();
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
});

describe("WP16 governed terminal tools", () => {
  it("refuses unavailable PTYs and missing interactive grants without a host-shell fallback", async () => {
    supported = false;
    const unavailable = fixture();
    expect(await unavailable.call("terminal_open")).toMatchObject({ ok: false, effect: "not_applied", output: expect.stringContaining("no fallback") });
    supported = true;
    const ungranted = fixture({ native: {} });
    expect(await ungranted.call("terminal_open")).toMatchObject({ ok: false, effect: "not_applied", output: expect.stringContaining("bash approval") });
    expect(openNativePtyTerminal).not.toHaveBeenCalled();
  });

  it("requires trusted session-step metadata and simulates every tool without effects", async () => {
    const { call, registry } = fixture();
    expect(await call("terminal_open", {}, { ownerStep: undefined })).toMatchObject({ ok: false, effect: "not_applied" });
    const argumentsByName: Record<string, Record<string, unknown>> = {
      terminal_open: {}, terminal_list: {}, terminal_read: { terminal_id: "missing" }, terminal_send: { terminal_id: "missing", text: "echo unsafe" },
      terminal_resize: { terminal_id: "missing" }, terminal_signal: { terminal_id: "missing", signal: "SIGTERM" }, terminal_close: { terminal_id: "missing" }
    };
    for (const name of registry.visible().keys()) {
      const result = await call(name, argumentsByName[name], { requestedMode: "SIMULATE" });
      expect(result).toMatchObject({ ok: true, effect: "not_applied" });
    }
    expect(openNativePtyTerminal).not.toHaveBeenCalled();
  });

  it("keeps commands in one persistent shell and records the starting step", async () => {
    const { call, open } = fixture();
    const id = await open();
    const listed = JSON.parse((await call("terminal_list")).output);
    expect(listed[0].ownerStep).toEqual({ sessionId: owner, turn: 1, step: 2, callId: "terminal-call" });
    expect((await call("terminal_send", { terminal_id: id, text: "cd sub" })).ok).toBe(true);
    const pwd = await call("terminal_send", { terminal_id: id, text: "pwd" });
    expect(pwd.ok, pwd.output).toBe(true);
    expect(JSON.parse(pwd.output).output).toContain(`${WORKSPACE}/sub`);
    expect(openNativePtyTerminal).toHaveBeenCalledTimes(1);
  });

  it("hides foreign terminal ids and output cursors identically to absent ids", async () => {
    const { call, open } = fixture();
    const id = await open();
    fakes[0]!.emit("alice private output");
    owner = "session-bob";
    expect(JSON.parse((await call("terminal_list")).output)).toEqual([]);
    for (const [name, extra] of [["terminal_read", { offset: 0, count: 32 }], ["terminal_send", { text: "secret" }],
      ["terminal_resize", {}], ["terminal_signal", { signal: "SIGTERM" }], ["terminal_close", {}]] as const) {
      const foreign = await call(name, { terminal_id: id, ...extra });
      const absent = await call(name, { terminal_id: "absent", ...extra });
      expect(foreign).toMatchObject({ ok: false, effect: "not_applied" });
      expect(foreign.output).toBe(absent.output);
      expect(foreign.output).not.toContain("alice private");
    }
    expect(fakes[0]!.backend.write).not.toHaveBeenCalled();
    expect(fakes[0]!.backend.resize).not.toHaveBeenCalled();
    expect(fakes[0]!.backend.cancel).not.toHaveBeenCalled();
  });

  it("bounds output with head/tail retention, byte paging and stale-snapshot refusal", async () => {
    const { call, open } = fixture({ maxOutputBytes: 128 });
    const id = await open();
    fakes[0]!.emit("HEAD" + "x".repeat(4096) + "TAIL");
    const read = JSON.parse((await call("terminal_read", { terminal_id: id, count: 128 })).output);
    const text = Buffer.from(read.contentBase64, "base64").toString("utf8");
    expect(read.retainedBytes).toBeLessThanOrEqual(128);
    expect(read.droppedBytes).toBeGreaterThan(0);
    expect(text).toContain("HEAD"); expect(text).toContain("TAIL");
    const page = JSON.parse((await call("terminal_read", { terminal_id: id, offset: 2, count: 7, revision: read.revision })).output);
    expect(Buffer.from(page.contentBase64, "base64")).toHaveLength(7);
    fakes[0]!.emit("new output");
    expect(await call("terminal_read", { terminal_id: id, revision: read.revision })).toMatchObject({ ok: false, output: expect.stringContaining("changed") });
    expect(await call("terminal_read", { terminal_id: id, count: 65_537 })).toMatchObject({ ok: false });
  });

  it("rechecks revocation before input and resize, and refuses authority revoked while idle", async () => {
    const { call, open } = fixture();
    const id = await open();
    permitted = false;
    expect((await call("terminal_send", { terminal_id: id, text: "unsafe", submit: false })).ok).toBe(false);
    expect((await call("terminal_resize", { terminal_id: id, cols: 101, rows: 31 })).ok).toBe(false);
    expect(fakes[0]!.backend.write).not.toHaveBeenCalled();
    expect(fakes[0]!.backend.resize).not.toHaveBeenCalled();
    permitted = true; revoked.abort();
    expect((await call("terminal_send", { terminal_id: id, text: "late", submit: false })).ok).toBe(false);
    expect(fakes[0]!.backend.write).not.toHaveBeenCalled();
  });

  it("does not turn requested or unproven cleanup into success or a freed quota", async () => {
    const { call, open, runtime } = fixture({ maxActive: 1 });
    const id = await open();
    fakes[0]!.autoExit = false;
    const close = await call("terminal_close", { terminal_id: id });
    expect(close).toMatchObject({ ok: false, effect: "unknown", output: expect.stringContaining("TOOL_OUTCOME_UNKNOWN") });
    expect((await call("terminal_open")).ok).toBe(false);
    expect(openNativePtyTerminal).toHaveBeenCalledTimes(1);
    expect(await runtime.dispose()).toBe(false);
    expect((await call("terminal_open")).ok).toBe(false);
  });

  it("keeps unresolved reservations bounded across session-id rotation", async () => {
    const { call, open } = fixture({ maxActive: 1 });
    await open();
    fakes[0]!.autoExit = false;
    owner = "session-bob";
    expect(await call("terminal_open")).toMatchObject({ ok: false, output: expect.stringContaining("quota") });
    expect(openNativePtyTerminal).toHaveBeenCalledTimes(1);
  });

  it("observes all owned exits before reporting successful session disposal", async () => {
    const { open, runtime } = fixture();
    await open(); await open();
    expect(runtime.hasOwnedWork()).toBe(true);
    expect(await runtime.dispose()).toBe(true);
    expect(runtime.hasOwnedWork()).toBe(false);
    for (const fake of fakes) expect(fake.backend.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not confuse direct-child closure with proven tree cleanup", async () => {
    const { open, runtime, call } = fixture({ maxActive: 1 });
    const id = await open();
    fakes[0]!.finish({ ...exits, treeExitProven: false });
    await Promise.resolve(); await Promise.resolve();
    expect(await call("terminal_close", { terminal_id: id })).toMatchObject({ ok: false, effect: "unknown" });
    expect((await call("terminal_open")).ok).toBe(false);
    expect(await runtime.dispose()).toBe(false);
  });

  it("disposes pending authorization even when the authorizer never resolves", async () => {
    let asked = false;
    const { call, runtime } = fixture({ native: { authorize: () => { asked = true; return new Promise(() => undefined); } } });
    const opening = call("terminal_open");
    for (let attempts = 0; attempts < 20 && !asked; attempts++) await Promise.resolve();
    expect(asked).toBe(true);
    expect(await runtime.dispose()).toBe(true);
    expect((await opening).ok).toBe(false);
    expect(openNativePtyTerminal).not.toHaveBeenCalled();
  });

  it("cancels pending launch authorization before a backend can appear", async () => {
    let authorize!: (grant: NativeTerminalGrant) => void;
    let request!: NativeTerminalRequest;
    const { call, runtime } = fixture({ native: { authorize: incoming => {
      request = incoming; return new Promise(resolve => { authorize = resolve; });
    } } });
    const cancel = new AbortController();
    const opening = call("terminal_open", {}, { signal: cancel.signal });
    for (let attempts = 0; attempts < 20 && !authorize; attempts++) await Promise.resolve();
    expect(authorize).toBeTypeOf("function");
    cancel.abort();
    authorize(grant(request));
    expect((await opening).ok).toBe(false);
    expect(openNativePtyTerminal).not.toHaveBeenCalled();
    expect(await runtime.dispose()).toBe(true);
  });
});
