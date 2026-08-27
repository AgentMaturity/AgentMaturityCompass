import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";

/**
 * Code Mode's guard must ask whether THIS PROCESS is confined.
 *
 * `runCodeTool` refuses when `confined` is false, and the comment at its call
 * site is exact about why: "a program can bypass the tools binding and the
 * sandbox is the only thing that stops it." The script is model-written and runs
 * through `new Function` in a worker thread (src/codemode/workerBootstrap.ts) --
 * and a worker thread is not a security boundary in Node. It shares the process:
 * same filesystem, same environment, same ability to spawn.
 *
 * But `confined` was computed as `new SandboxRunner().select() !== null`, and
 * `seatbeltBackend.available()` answers `process.platform === "darwin" &&
 * existsSync("/usr/bin/sandbox-exec")`. That is a question about the MACHINE,
 * not about this process. Nothing anywhere re-execs AMC under a sandbox profile
 * -- grep `sandbox-exec` outside the backend returns one comment -- and
 * `SandboxRunner.run` confines a SUBPROCESS, which a worker thread is not.
 *
 * So on any Mac the gate passed and model-written code ran with AMC's full
 * privileges while the system reported itself sandboxed.
 */
const PASS = "codemode-confinement-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-confine-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

describe("confinement is a property of the process, not of the machine", () => {
  it("reports this process as unconfined, because nothing confines it", () => {
    // Asserted unconditionally, INCLUDING on macOS where the old probe said
    // true. Nothing re-execs AMC under a profile, so there is no platform on
    // which this may honestly be true today.
    const dir = workspace();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", mode: "code" });

    expect(toolset.readiness.confined).toBe(false);

    toolset.close();
  });

  it("still reports whether the machine HAS a sandbox backend, separately", () => {
    // The CLI's "no OS sandbox on this machine" warning is a real and different
    // fact, and it should keep being told. Splitting the two is the fix: one
    // question was answering for both.
    const dir = workspace();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", mode: "code" });

    const expected = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
    expect(toolset.readiness.sandboxBackendAvailable).toBe(expected);

    toolset.close();
  });

  it("refuses a Code Mode dispatch while the process is unconfined", async () => {
    const dir = workspace();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", mode: "code" });

    const outcome = await toolset.seam.execute({
      callId: "c1",
      toolName: "run_code",
      rawArguments: JSON.stringify({ source: "return 1 + 1;" }),
      sessionId: "s1",
      turn: 1,
      step: 1,
      parentToken: null,
      dispatch: "code",
      signal: new AbortController().signal
    });

    expect(String(outcome.content)).toMatch(/unconfined|sandbox/i);
    toolset.close();
  });
});
