import { afterEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ probe: vi.fn(), rebuild: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: native.rebuild }));
vi.mock("node:module", () => ({ createRequire: () => () => native.probe }));

const originalArgv = process.argv;
afterEach(() => { process.argv = originalArgv; vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); native.probe.mockReset(); native.rebuild.mockReset(); });
async function startup(args: string[]) {
  vi.stubEnv("AMC_NO_AUTO_REBUILD", ""); vi.stubEnv("CI", ""); vi.stubEnv("CONTINUOUS_INTEGRATION", "");
  process.argv = [process.execPath, "/installed/amc/dist/cli.js", ...args];
  native.probe.mockImplementationOnce(function () { throw new Error("NODE_MODULE_VERSION mismatch"); });
  native.probe.mockImplementation(function () { return { close() {} }; });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  await import("../src/storage/nativeGuard.js");
}

describe("read-only guide startup", () => {
  it.each([
    ["agent-loop", "guide"],
    ["--agent", "another", "agent-loop", "guide", "--provider", "openai", "--model", "--help", "--json"],
    ["agent-loop", "guide", "--provider=stub", "--credentials-home=/tmp/a b"],
    ["--help", "--all"],
    ["help", "agent-loop", "run"],
    ["agent-loop", "run", "--help"],
    ["credentials", "set", "--help"]
  ])("does not load or rebuild the database for %j", async (...args) => {
    await startup(args);
    expect(native.probe).not.toHaveBeenCalled();
    expect(native.rebuild).not.toHaveBeenCalled();
  });
  it.each([
    ["agent-loop", "run", "hello"],
    ["agent-loop", "run", "--model", "--help"],
    ["agent-loop", "run", "--", "--help"],
    ["--agent", "agent-loop", "run", "hello"],
    ["agent-loop", "guide", "unexpected-positional"],
    ["run", "--help", "--arbitrary"]
  ])("retains ABI repair for non-guide command %j", async (...args) => {
    await startup(args);
    expect(native.probe).toHaveBeenCalledTimes(2);
    expect(native.rebuild).toHaveBeenCalledWith(expect.any(String), ["rebuild", "better-sqlite3"], expect.objectContaining({ stdio: "ignore" }));
  });
});
