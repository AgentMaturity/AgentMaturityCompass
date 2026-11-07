import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// A desktop launcher runtime (`npm install --prefix <runtime> <tgz>`) hoists better-sqlite3 above the AMC package.
const native = vi.hoisted(() => ({ probe: vi.fn(), rebuild: vi.fn(), sqlite: "/runtime/node_modules/better-sqlite3/package.json" }));
vi.mock("node:child_process", () => ({ execFileSync: native.rebuild }));
vi.mock("node:module", () => ({ createRequire: () => Object.assign(() => native.probe, { cache: {}, resolve: () => native.sqlite }) }));

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
    ["credentials", "set", "--help"],
    ["connect", "hooks", "forward", "--provider", "claude-code", "--mode", "control", "--agent", "a", "--token-file", ".amc/hooks/claude-code.lease"]
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
    ["run", "--help", "--arbitrary"],
    ["connect", "hooks", "status", "--provider", "claude-code"],
    ["connect", "hooks", "forward-extra"]
  ])("retains ABI repair for non-guide command %j", async (...args) => {
    await startup(args);
    expect(native.probe).toHaveBeenCalledTimes(2);
    expect(native.rebuild).toHaveBeenCalledWith("npm", ["rebuild", "better-sqlite3"], expect.objectContaining({ stdio: "ignore" }));
  });
  it("rebuilds in the project whose node_modules holds better-sqlite3, through a shell on Windows", async () => {
    await startup(["up", "--demo"]);
    expect(native.rebuild).toHaveBeenCalledWith("npm", ["rebuild", "better-sqlite3"], expect.objectContaining({ cwd: resolve(native.sqlite, "../../..") }));
    vi.resetModules();
    native.rebuild.mockReset();
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      await startup(["up", "--demo"]);
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
    // npm.cmd starts only through a shell (CVE-2024-27980); one command string avoids DEP0190.
    expect(native.rebuild).toHaveBeenCalledWith("npm rebuild better-sqlite3", expect.objectContaining({ cwd: resolve(native.sqlite, "../../.."), shell: true }));
  });
});
