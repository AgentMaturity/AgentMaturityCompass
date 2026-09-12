import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeTerminalHost, type NativeTerminalGrant, type NativeTerminalRequest, type NativeTerminalHostOptions } from "../src/terminal/nativeTerminal.js";
import { openNativePtyTerminal } from "../src/terminal/nativePtyTerminal.js";
import type { TerminalBackend, TerminalExit } from "../src/terminal/terminalTypes.js";

vi.mock("node:fs", () => ({ realpathSync: (path: string) => path }));
vi.mock("../src/terminal/nativePtySandbox.js", () => ({ nativePtySupport: () => ({
  platform: "unexecuted-test-platform", arch: "unexecuted-test-arch", implementation: "linux-bwrap-python-pty",
  prerequisitesAvailable: false, executionVerified: false, reason: "Mocked, not platform qualification."
}) }));
vi.mock("../src/terminal/nativePtyTerminal.js", () => ({ openNativePtyTerminal: vi.fn() }));

const hosts: NativeTerminalHost[] = [];
let backend: TerminalBackend;
let finish: (exit: TerminalExit) => void;
let revoke: AbortController;
const exited: TerminalExit = { code: null, signal: null, reason: "dispose", treeExitProven: false };
beforeEach(() => {
  vi.clearAllMocks();
  revoke = new AbortController();
  backend = { kind: "pty", ready: Promise.resolve(), done: new Promise(resolve => { finish = resolve; }),
    write: vi.fn(async () => undefined), resize: vi.fn(async () => undefined), dispose: vi.fn(), cancel: vi.fn(),
    onData: () => () => undefined, onExit: () => () => undefined };
  vi.mocked(openNativePtyTerminal).mockReturnValue(backend);
});
afterEach(async () => {
  for (const host of hosts.splice(0)) host.dispose();
  finish(exited);
  await backend.done;
});
function grant(request: NativeTerminalRequest, check: NativeTerminalGrant["check"] = () => undefined): NativeTerminalGrant {
  return { capability: "interactive-pty", workspace: request.workspace,
    policy: { writableRoots: [], network: "deny", signal: revoke.signal, timeoutMs: request.timeoutMs }, check };
}
function host(authorize?: NativeTerminalHostOptions["authorize"]): NativeTerminalHost {
  const value = new NativeTerminalHost({ authorize });
  hosts.push(value);
  return value;
}

describe("P02 native interactive authorization boundary", () => {
  it("denies absent/declined authorization before opening a backend", async () => {
    await expect(host().open({ workspace: "/workspace" })).rejects.toThrow(/authorizer/);
    await expect(host(() => undefined).open({ workspace: "/workspace" })).rejects.toThrow(/denied/);
    expect(openNativePtyTerminal).not.toHaveBeenCalled();
  });

  it("rejects mismatched workspace and broader lifetime grants", async () => {
    await expect(host(request => ({ ...grant(request), workspace: "/other" })).open({ workspace: "/workspace" })).rejects.toThrow(/scope/);
    await expect(host(request => ({ ...grant(request), policy: { ...grant(request).policy, timeoutMs: request.timeoutMs + 1 } }))
      .open({ workspace: "/workspace" })).rejects.toThrow(/lifetime/);
    expect(openNativePtyTerminal).not.toHaveBeenCalled();
  });

  it("rechecks open/input/resize and cannot turn a denial into transmitted bytes", async () => {
    let permitted = true;
    const check = vi.fn((operation: Parameters<NativeTerminalGrant["check"]>[0]) => {
      expect(Object.isFrozen(operation)).toBe(true);
      if (!permitted) throw new Error("revoked by guard");
    });
    const owner = host(request => grant(request, check));
    const session = await owner.open({ workspace: "/workspace", cols: 101, rows: 37 });
    await session.write("approved input\r");
    await session.resize(90, 30);
    expect(check.mock.calls.map(([operation]) => operation.kind)).toEqual(["open", "input", "resize"]);
    expect(backend.write).toHaveBeenCalledTimes(1);
    permitted = false;
    await expect(session.write("denied")).rejects.toThrow(/revoked/);
    expect(backend.write).toHaveBeenCalledTimes(1);
    session.cancel();
    expect(backend.cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects mistakenly asynchronous deny checks instead of using them as approval", async () => {
    const owner = host(request => grant(request, async () => { throw new Error("asynchronous refusal"); }));
    await expect(owner.open({ workspace: "/workspace" })).rejects.toThrow(/synchronously/);
    expect(openNativePtyTerminal).not.toHaveBeenCalled();
    await Promise.resolve();
  });

  it("pins the request and policy instead of observing later caller mutations", async () => {
    const roots: string[] = [];
    const options = { workspace: "/workspace", cols: 80 };
    let resolveGrant!: (value: NativeTerminalGrant) => void;
    let seen!: NativeTerminalRequest;
    const owner = host(request => { seen = request; return new Promise(resolve => { resolveGrant = resolve; }); });
    const opening = owner.open(options);
    expect(Object.isFrozen(seen)).toBe(true);
    options.workspace = "/swapped";
    resolveGrant({ ...grant(seen), policy: { ...grant(seen).policy, writableRoots: roots } });
    await opening;
    roots.push("/outside");
    const actual = vi.mocked(openNativePtyTerminal).mock.calls[0]![0];
    expect(actual.cwd).toBe("/workspace");
    expect(actual.policy.writableRoots).toEqual([]);
    expect(Object.isFrozen(actual.policy.writableRoots)).toBe(true);
  });

  it("does not open a process when disposal wins an outstanding approval", async () => {
    let resolveGrant!: (value: NativeTerminalGrant) => void;
    let seen!: NativeTerminalRequest;
    const owner = host(request => { seen = request; return new Promise(resolve => { resolveGrant = resolve; }); });
    const opening = owner.open({ workspace: "/workspace" });
    owner.dispose();
    resolveGrant(grant(seen));
    await expect(opening).rejects.toThrow(/closed while authorization/);
    expect(openNativePtyTerminal).not.toHaveBeenCalled();
  });

  it("propagates idle revocation and retains live count until observed exit", async () => {
    const owner = host(request => grant(request));
    const session = await owner.open({ workspace: "/workspace" });
    const actual = vi.mocked(openNativePtyTerminal).mock.calls[0]![0];
    expect(owner.openCount).toBe(1);
    revoke.abort();
    expect(actual.policy.signal?.aborted).toBe(true);
    await expect(session.write("late")).rejects.toThrow(/revoked/);
    owner.close(session);
    expect(owner.openCount).toBe(1);
    finish(exited);
    await session.done;
    expect(owner.openCount).toBe(0);
  });

  it("does not turn a prerequisite report into execution qualification", () => {
    expect(host().support()).toMatchObject({ prerequisitesAvailable: false, executionVerified: false });
  });
});
