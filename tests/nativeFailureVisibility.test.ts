import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmError } from "../src/llm/llmFailure.js";
import { readAgentRunSummary, renderRunSummary } from "../src/agent/runReport.js";
import { registerSessionCommands } from "../src/cli-session-commands.js";
import { loopHarness, type LoopHarness } from "./helpers/agentLoopHarness.js";
import { lockVault } from "../src/vault/vault.js";

// Source-runtime read-back with an in-process failing adapter. No actual provider,
// installed artifact, browser, reattachment acceptance or platform proof.
const fixtures: LoopHarness[] = [], roots: string[] = [];
const priorExit = process.exitCode;
afterEach(async () => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) {
    await fixture.driver.whenIdle(); fixture.finish(); lockVault(fixture.dir);
    rmSync(fixture.dir, { recursive: true, force: true });
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs(); process.exitCode = priorExit;
});

describe.each(["sqlite", "jsonl"] as const)("native %s failure visibility", backend => {
  it("reads the failed attempt into run and actual session-show diagnostics without raw provider text", async () => {
    const root = mkdtempSync(join(tmpdir(), "amc-failure-visibility-")); roots.push(root);
    vi.stubEnv("AMC_SESSION_STORE", backend);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-failure-visibility-only");
    vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
    vi.stubEnv("AMC_NO_SIGN", undefined); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
    const fixture = loopHarness({ scripts: [async function* () { throw new LlmError("synthetic-provider-text-not-for-diagnostics", "AUTH", { status: 401 }); }] });
    fixtures.push(fixture);
    fixture.driver.followup("Exercise a source fixture authentication refusal.");
    await fixture.driver.whenIdle();
    const summary = readAgentRunSummary(fixture.dir, fixture.sessionId, fixture.driver.status);
    expect(summary.endings.at(-1)?.reason).toBe("error");
    expect(summary.diagnostics?.some(item => item.guidance.code === "AUTH" && item.guidance.httpStatus === 401)).toBe(true);
    expect(JSON.stringify(summary.diagnostics)).not.toContain("synthetic-provider-text");
    expect(renderRunSummary(summary)).toContain("amc agent-loop guide");
    fixture.finish();
    vi.spyOn(process, "cwd").mockReturnValue(fixture.dir);
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation(value => { output.push(String(value)); });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const program = new Command(); registerSessionCommands(program);
    await program.parseAsync(["node", "amc", "session", "show", fixture.sessionId, "--json"]);
    expect(errors).not.toHaveBeenCalled();
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!).diagnostics).toEqual(summary.diagnostics);
  });
});
