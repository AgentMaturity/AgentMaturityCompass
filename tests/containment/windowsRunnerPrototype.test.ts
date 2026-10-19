import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const forbidden = vi.hoisted(() => ({ spawn: vi.fn(), exec: vi.fn(), execFile: vi.fn(),
  spawnSync: vi.fn(), execSync: vi.fn(), execFileSync: vi.fn(), runProcess: vi.fn(), sandboxRun: vi.fn() }));
vi.mock("node:child_process", () => forbidden);
vi.mock("../../src/exec/runProcess.js", () => ({ runProcess: forbidden.runProcess }));
vi.mock("../../src/sandbox/sandboxRunner.js", () => ({ SandboxRunner: class { run = forbidden.sandboxRun; } }));
beforeEach(() => { for (const spy of Object.values(forbidden)) spy.mockClear(); });
afterEach(() => { for (const spy of Object.values(forbidden)) expect(spy).not.toHaveBeenCalled(); });

// Adoption-seam RED only: absence becomes an assertion, not a collection error.
// The preserved full protocol suite replaces this scaffold when the source is adopted.
describe("P2-14 cut-first Windows prototype boundary", () => {
  test("real host entry always refuses and has no API or platform override", async () => {
    const modulePath = "../../src/sandbox/windowsRunnerPrototype.js";
    const prototype = await import(modulePath).catch(() => null);
    expect(prototype, "the cut-first prototype must expose its refusing real entry").not.toBeNull();
    const api = { available: vi.fn(() => ({ ok: true })), run: vi.fn(), cleanup: vi.fn() };
    const result = await prototype!.runWindowsTokenPrototype({ argv: ["fixture-command", "literal argument"],
      cwd: "C:\\synthetic-workspace", policySha256: "a".repeat(64) }, api, "win32");
    expect(result).toEqual({ kind: "refused", reason: process.platform === "win32" ? "prototype-not-qualified" : "unsupported-platform",
      claimKind: "none", confined: false, treeExitProven: false, exitCode: null, measurement: "not-measured", simulatedExitCode: null });
    expect(api.available).not.toHaveBeenCalled(); expect(api.run).not.toHaveBeenCalled(); expect(api.cleanup).not.toHaveBeenCalled();
  });
});
