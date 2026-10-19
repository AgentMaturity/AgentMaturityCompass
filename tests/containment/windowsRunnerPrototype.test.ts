import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { exerciseWindowsTokenProtocol, runWindowsTokenPrototype,
  type FakeTokenApi, type WindowsPrototypeRequest, type WindowsPrototypeResult } from "../../src/sandbox/windowsRunnerPrototype.js";

const forbidden = vi.hoisted(() => ({ spawn: vi.fn(), exec: vi.fn(), execFile: vi.fn(),
  spawnSync: vi.fn(), execSync: vi.fn(), execFileSync: vi.fn(), runProcess: vi.fn(), sandboxRun: vi.fn() }));
vi.mock("node:child_process", () => forbidden);
vi.mock("../../src/exec/runProcess.js", () => ({ runProcess: forbidden.runProcess }));
vi.mock("../../src/sandbox/sandboxRunner.js", () => ({ SandboxRunner: class { run = forbidden.sandboxRun; } }));
beforeEach(() => { for (const spy of Object.values(forbidden)) spy.mockClear(); });
afterEach(() => { for (const spy of Object.values(forbidden)) expect(spy).not.toHaveBeenCalled(); });

const request = (): WindowsPrototypeRequest => ({ argv: ["fixture-command", "literal argument"],
  cwd: "C:\\synthetic-workspace", policySha256: "a".repeat(64) });
type Invocation = WindowsPrototypeRequest & { readonly callNonce: string };
type Reply = { childId: number; launcherExitCode: number; statusBytes: Uint8Array | null };
const bytes = (value: unknown): Uint8Array => Buffer.from(JSON.stringify(value));
const good = (call: Invocation, exitCode = 0): Reply => ({ childId: 42, launcherExitCode: exitCode,
  statusBytes: bytes({ version: 1, callNonce: call.callNonce, childId: 42, policySha256: call.policySha256, exitCode }) });
function fixture(change: (reply: Reply, call: Invocation) => unknown = reply => reply) {
  const events: string[] = [];
  const api = { available: vi.fn(() => ({ ok: true } as const)),
    run: vi.fn(async (call: Invocation) => { events.push("run"); return change(good(call), call); }),
    cleanup: vi.fn(async () => { events.push("cleanup"); }) };
  return { api, events };
}
function noEvidence(result: WindowsPrototypeResult): void {
  expect(result.confined).toBe(false); expect(result.treeExitProven).toBe(false); expect(result.exitCode).toBeNull();
  expect(result.measurement).toBe("not-measured");
  expect(Object.keys(result).sort()).toEqual(["claimKind", "confined", "exitCode", "kind", "measurement", "reason", "simulatedExitCode", "treeExitProven"].sort());
}
function refused(result: WindowsPrototypeResult, reason: WindowsPrototypeResult["reason"]): void {
  noEvidence(result); expect(result).toMatchObject({ kind: "refused", reason, simulatedExitCode: null });
}
async function exercise(f: ReturnType<typeof fixture>, value = request()): Promise<WindowsPrototypeResult> {
  const result = await exerciseWindowsTokenProtocol(value, f.api); noEvidence(result);
  expect(result.claimKind).toBe("synthetic_example"); return result;
}

// These tests exercise a fake protocol on the real host. They are not Windows escape tests.
describe("P2-14 cut-first Windows prototype boundary", () => {
  test("real host entry always refuses and has no API or platform override", async () => {
    const f = fixture();
    const invoke = runWindowsTokenPrototype as unknown as (...args: unknown[]) => Promise<WindowsPrototypeResult>;
    const result = await invoke(request(), f.api, "win32");
    refused(result, process.platform === "win32" ? "prototype-not-qualified" : "unsupported-platform");
    expect(result.claimKind).toBe("none"); expect(f.api.available).not.toHaveBeenCalled(); expect(f.events).toEqual([]);
  });
  test("missing or malformed fake API refuses before run", async () => {
    for (const api of [undefined, {}, { available: () => ({ ok: true }), run: vi.fn() }]) {
      refused(await exerciseWindowsTokenProtocol(request(), api as unknown as FakeTokenApi), "api-unavailable");
    }
  });
  test("unavailable and malformed availability answers do not launch", async () => {
    for (const verdict of [{ ok: false }, { ok: "true" }, null]) {
      const f = fixture(); f.api.available.mockReturnValue(verdict as never);
      refused(await exercise(f), "api-unavailable"); expect(f.events).toEqual([]);
    }
  });
  test("availability exceptions have bounded public reasons", async () => {
    const f = fixture(); f.api.available.mockImplementation(() => { throw new Error("C:\\private\\CANARY"); });
    const result = await exercise(f); refused(result, "api-failure");
    expect(JSON.stringify(result)).not.toContain("CANARY"); expect(f.events).toEqual([]);
  });
  test("malformed requests refuse before fake API invocation", async () => {
    for (const value of [{ ...request(), argv: [] }, { ...request(), argv: ["bad\0argument"] },
      { ...request(), cwd: "" }, { ...request(), policySha256: "bad" }, { ...request(), allowUnconfined: true }]) {
      const f = fixture(); refused(await exercise(f, value), "invalid-request");
      expect(f.api.available).not.toHaveBeenCalled(); expect(f.events).toEqual([]);
    }
  });
  test("valid status completes only a synthetic simulation after cleanup", async () => {
    const f = fixture(), result = await exercise(f);
    expect(result).toMatchObject({ kind: "simulation-complete", reason: "simulation-complete", simulatedExitCode: 0 });
    expect(f.api.run).toHaveBeenCalledTimes(1); expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("complete nonzero simulated exits are distinct from a native exit", async () => {
    for (const code of [3, 0xc0000005]) {
      const f = fixture((_reply, call) => good(call, code));
      expect(await exercise(f)).toMatchObject({ kind: "simulation-complete", simulatedExitCode: code, exitCode: null });
      expect(f.events).toEqual(["run", "cleanup"]);
    }
  });
  test("missing launcher status cannot complete the simulation", async () => {
    for (const statusBytes of [null, new Uint8Array()]) {
      const f = fixture(reply => ({ ...reply, statusBytes }));
      refused(await exercise(f), "status-missing"); expect(f.events).toEqual(["run", "cleanup"]);
    }
  });
  test("malformed JSON, strict fields and type confusion refuse", async () => {
    for (const malformed of ["{", "null", "[]", "7", "{}{}", "{}"] ) {
      const f = fixture(reply => ({ ...reply, statusBytes: Buffer.from(malformed) }));
      refused(await exercise(f), "status-invalid"); expect(f.events).toEqual(["run", "cleanup"]);
    }
    for (const patch of [{ version: 2 }, { childId: "42" }, { exitCode: true }, { unknown: true }]) {
      const f = fixture(reply => ({ ...reply, statusBytes: bytes({ ...JSON.parse(Buffer.from(reply.statusBytes!).toString()), ...patch }) }));
      refused(await exercise(f), "status-invalid"); expect(f.events).toEqual(["run", "cleanup"]);
    }
  });
  test("oversized status refuses before successful parsing", async () => {
    const f = fixture(reply => ({ ...reply, statusBytes: Buffer.concat([Buffer.from(reply.statusBytes!), Buffer.alloc(64_001, 32)]) }));
    refused(await exercise(f), "status-invalid"); expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("shadowed status byteLength cannot bypass the captured-byte cap", async () => {
    const f = fixture(reply => {
      const statusBytes = Buffer.concat([Buffer.from(reply.statusBytes!), Buffer.alloc(64_001, 32)]);
      Object.defineProperty(statusBytes, "byteLength", { value: 1 });
      return { ...reply, statusBytes };
    });
    refused(await exercise(f), "status-invalid"); expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("status for another child refuses with all other bindings valid", async () => {
    const f = fixture((reply, call) => ({ ...reply, statusBytes: bytes({ version: 1, callNonce: call.callNonce,
      childId: 43, policySha256: call.policySha256, exitCode: 0 }) }));
    refused(await exercise(f), "status-mismatch"); expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("status for another valid policy digest refuses", async () => {
    const f = fixture(reply => ({ ...reply, statusBytes: bytes({ ...JSON.parse(Buffer.from(reply.statusBytes!).toString()), policySha256: "b".repeat(64) }) }));
    refused(await exercise(f), "status-mismatch"); expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("status for another invocation nonce refuses", async () => {
    const f = fixture(reply => ({ ...reply, statusBytes: bytes({ ...JSON.parse(Buffer.from(reply.statusBytes!).toString()), callNonce: "00000000-0000-4000-8000-000000000001" }) }));
    refused(await exercise(f), "status-mismatch"); expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("replaying a previous otherwise matching status refuses on the new nonce", async () => {
    const replies: Reply[] = [], nonces: string[] = [];
    const f = fixture((reply, call) => { nonces.push(call.callNonce); replies.push(reply); return replies[0]; });
    expect(await exercise(f)).toMatchObject({ kind: "simulation-complete" });
    refused(await exercise(f), "status-mismatch"); expect(nonces[0]).not.toBe(nonces[1]);
    expect(f.events).toEqual(["run", "cleanup", "run", "cleanup"]);
  });
  test("invalid transport child identities and exit values refuse without coercion", async () => {
    for (const patch of [{ childId: 0 }, { childId: -1 }, { childId: 1.5 }, { childId: Number.MAX_SAFE_INTEGER + 1 },
      { launcherExitCode: -1 }, { launcherExitCode: 1.5 }, { launcherExitCode: "0" }, { launcherExitCode: null }, { launcherExitCode: 0x100000000 }]) {
      const f = fixture(reply => ({ ...reply, ...patch }));
      refused(await exercise(f), "status-invalid"); expect(f.events).toEqual(["run", "cleanup"]);
    }
  });
  test("a different valid launcher exit cannot authenticate status exit zero", async () => {
    const f = fixture(reply => ({ ...reply, launcherExitCode: 3 }));
    refused(await exercise(f), "status-mismatch"); expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("stdout cannot substitute for the separate launcher status channel", async () => {
    const f = fixture(reply => ({ ...reply, statusBytes: null, stdout: Buffer.from(reply.statusBytes!).toString() }));
    refused(await exercise(f), "status-missing"); expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("run exceptions clean partial fake resources without leaking errors", async () => {
    const f = fixture(); f.api.run.mockImplementation(async () => { f.events.push("run"); throw new Error("C:\\private\\CANARY"); });
    const result = await exercise(f); refused(result, "api-failure");
    expect(f.events).toEqual(["run", "cleanup"]); expect(JSON.stringify(result)).not.toContain("CANARY");
  });
  test("cleanup failure overrides both valid and invalid status without tree proof", async () => {
    for (const invalid of [false, true]) {
      const f = fixture(reply => invalid ? { ...reply, statusBytes: null } : reply);
      f.api.cleanup.mockImplementation(async () => { f.events.push("cleanup"); throw new Error("cleanup CANARY"); });
      refused(await exercise(f), "cleanup-failed"); expect(f.events).toEqual(["run", "cleanup"]);
      expect(f.api.cleanup).toHaveBeenCalledTimes(1);
    }
  });
  test("validating the response uses a frozen snapshot, not mutable caller inputs", async () => {
    const value = { argv: ["fixture-command", "original"], cwd: "C:\\synthetic-workspace", policySha256: "a".repeat(64) };
    const f = fixture((_reply, call) => {
      expect(Object.isFrozen(call)).toBe(true); expect(Object.isFrozen(call.argv)).toBe(true);
      value.argv[1] = "changed"; value.cwd = "C:\\other-workspace"; value.policySha256 = "b".repeat(64);
      expect(call.argv[1]).toBe("original"); expect(call.cwd).toBe("C:\\synthetic-workspace");
      expect(call.policySha256).toBe("a".repeat(64)); return good(call);
    });
    expect(await exercise(f, value)).toMatchObject({ kind: "simulation-complete" });
    expect(f.events).toEqual(["run", "cleanup"]);
  });
  test("fake enforcement claims never fabricate a native receipt or fallback", async () => {
    const f = fixture(reply => ({ ...reply, statusBytes: null, confined: true, treeExitProven: true,
      exitCode: 0, enforcement: { boundary: "invented-windows-boundary" } }));
    refused(await exercise(f), "status-missing"); expect(f.events).toEqual(["run", "cleanup"]);
  });
});
