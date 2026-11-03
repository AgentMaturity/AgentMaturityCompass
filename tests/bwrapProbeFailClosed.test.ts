import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openLedger } from "../src/ledger/ledger.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { bwrapBackend, bwrapHostChecks } from "../src/sandbox/bwrapBackend.js";
import { nativeShellReadiness } from "../src/sandbox/nativeShellGate.js";
import { SandboxRunner } from "../src/sandbox/sandboxRunner.js";
import { initWorkspace } from "../src/workspace.js";

// The Linux backend's fail-closed decision, driven on any OS: the namespace launch result
// is injected, so a refused launch must make every surface refuse and launch nothing.
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const dirs: string[] = [];
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = "bwrap-probe-test-passphrase";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-bwrap-probe-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "probe-agent", trustBoundaryMode: "isolated" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: "probe-session", runtime: "amc", binaryPath: "test", binarySha256: "test" });
  ledger.close();
  initBudgets(dir, "probe-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

/** A Linux host whose Bubblewrap is installed and whose namespace launch returns `launch`. */
function linuxHost(launch: ReturnType<typeof bwrapHostChecks.namespaceLaunch>) {
  vi.spyOn(bwrapHostChecks, "installation").mockReturnValue({ ok: true });
  const probe = vi.spyOn(bwrapHostChecks, "namespaceLaunch").mockReturnValue(launch);
  Object.defineProperty(process, "platform", { ...platform, value: "linux" });
  return probe;
}

describe("the Bubblewrap namespace probe fails closed", () => {
  it("a refused namespace launch makes the backend, readiness and shell gate refuse, and nothing runs", async () => {
    const dir = workspace();
    const reason = "Bubblewrap is installed but this host's kernel or AppArmor policy refuses unprivileged user namespaces (bwrap: setting up uid map: Permission denied); see docs/NATIVE_SANDBOX_UBUNTU.md";
    const probe = linuxHost({ ok: false, installed: true, reason });
    expect(bwrapBackend().available()).toEqual({ ok: false, installed: true, reason });

    const toolset = agentToolset({ workspace: dir, agentId: "probe-agent", sessionId: "probe-session", mode: "code" });
    try {
      expect(toolset.readiness.sandboxBackendAvailable).toBe(false);
      expect(toolset.readiness.sandboxReason).toContain("refuses unprivileged user namespaces");
    } finally { toolset.close(); }

    const shell = nativeShellReadiness(dir);
    expect(shell).toMatchObject({ offered: false, decision: "refused", enforcement: "none", boundary: null });
    expect(shell.reason).toContain("docs/NATIVE_SANDBOX_UBUNTU.md");
    expect(shell.reason).not.toMatch(/install Bubblewrap/i);

    const marker = join(dir, "ran.txt");
    const outcome = await new SandboxRunner({ backends: [bwrapBackend()] }).run(["/bin/sh", "-c", `echo ran > ${marker}`], dir,
      { writableRoots: [dir], network: "deny", timeoutMs: 5_000 });
    expect(outcome).toMatchObject({ confined: false, backend: "none", exitCode: null, failure: { kind: "unavailable" }, treeExitProven: true });
    expect(existsSync(marker)).toBe(false);
    expect(probe).toHaveBeenCalled();
  });

  it("a missing Bubblewrap still says to install it", () => {
    const dir = workspace();
    vi.spyOn(bwrapHostChecks, "installation").mockReturnValue({ ok: false, reason: "Install a supported system Bubblewrap at /usr/bin/bwrap" });
    const probe = vi.spyOn(bwrapHostChecks, "namespaceLaunch");
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    expect(nativeShellReadiness(dir).reason).toContain("apt install bubblewrap");
    expect(probe).not.toHaveBeenCalled();
  });

  it("a successful namespace launch reports the backend available and the shell confined", () => {
    const dir = workspace();
    linuxHost({ ok: true });
    expect(bwrapBackend().available()).toEqual({ ok: true });
    expect(new SandboxRunner({ backends: [bwrapBackend()] }).select()?.kind).toBe("bwrap");
    expect(nativeShellReadiness(dir)).toMatchObject({ offered: true, decision: "confined", boundary: "linux-bwrap" });
  });
});
