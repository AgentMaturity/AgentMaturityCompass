import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { readAgentRunSummary, verifyAgentRun, type AgentRunSummary } from "../src/agent/runReport.js";
import { AMCNativeTurn } from "../src/sdk/nativeAgentClient.js";
import { loadNativeValidationConfiguration } from "../src/setup/nativeValidationConfig.js";

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test.each(["CLI", "SDK"] as const)("actual built %s distinguishes completed turns from unavailable selected checks and seals evidence", async surface => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "amc-validation-surfaces-"))); roots.push(scratch);
  const workspace = join(scratch, "project"), home = join(scratch, "home"), checks = join(scratch, "public-checks.json");
  mkdirSync(workspace); mkdirSync(home);
  const pass = "synthetic-native-validation-pass";
  vi.stubEnv("AMC_VAULT_PASSPHRASE", pass); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(scratch, "checkpoints"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" }); initBudgets(workspace, "default");
  writeFileSync(checks, JSON.stringify({ schemaVersion: 1, checks: [{ id: "public", title: "Public check", command: "printf unexpected > must-not-run", timeoutMs: 1000 }] }));
  const config = loadNativeValidationConfiguration(checks);
  const env = { HOME: home, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass, AMC_CONTROL_CHECKPOINT_DIR: join(scratch, "checkpoints"), NO_COLOR: "1" };
  const cli = resolve("dist/cli.js");
  expect(existsSync(cli), "Build the coordinated candidate first.").toBe(true);
  let summary: AgentRunSummary;
  if (surface === "CLI") {
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((done, reject) => {
      const child = spawn(process.execPath, [cli, "agent-loop", "run", "hello", "--provider", "stub", "--tools", "none", "--json",
        "--validation-config", checks, "--validation-config-sha256", config.sha256, "--validate", "public"], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), 25000), kill = setTimeout(() => child.kill("SIGKILL"), 28000);
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", (data: string) => { stdout += data; if (stdout.length > 1_000_000) child.kill("SIGKILL"); });
      child.stderr.on("data", (data: string) => { stderr += data; if (stderr.length > 1_000_000) child.kill("SIGKILL"); });
      child.once("error", error => { clearTimeout(timer); clearTimeout(kill); reject(error); });
      child.once("close", code => { clearTimeout(timer); clearTimeout(kill); done({ stdout, stderr, code }); });
    });
    expect(result.code, result.stderr).toBe(1);
    summary = JSON.parse(result.stdout) as AgentRunSummary;
  } else {
    const { AMCNativeClient } = await import(pathToFileURL(resolve("dist/sdk/nativeAgentClient.js")).href) as typeof import("../src/sdk/nativeAgentClient.js");
    const client = await AMCNativeClient.start({ workspace, provider: "stub", tools: "none", env,
      validationConfig: checks, validationConfigSha256: config.sha256, validate: ["public"], timeoutMs: 25000 });
    try {
      const session = await client.newSession(), result = await session.prompt("hello").result;
      expect(result.stopReason).toBe("end_turn"); expect(result.state).toBe("completed");
      expect(result.validation.status).toBe("unavailable"); expect(result.verification).toBe("not-verified");
      await client.close(); summary = readAgentRunSummary(workspace, session.sessionId, "idle");
      expect(result.validation).toEqual(summary.validation);
    } finally { await client.close(); }
  }
  expect(summary.endings.at(-1)?.reason).toBe("complete");
  expect(summary.validation).toMatchObject({ status: "unavailable", configSha256: config.sha256, turn: 1,
    checks: [{ id: "public", status: "unavailable", exitCode: null }] });
  expect(summary.toolCalls).toBe(0); // No fabricated model call for an operator check.
  expect(existsSync(join(workspace, "must-not-run"))).toBe(false);
  const verified = await verifyAgentRun(workspace, summary.sessionId);
  expect(verified.ok, JSON.stringify(verified)).toBe(true);
}, 35000);

test("SDK never turns absent or malformed validation metadata into a pass", async () => {
  const legacy = new AMCNativeTurn("legacy", () => undefined);
  legacy.finish({ stopReason: "end_turn" });
  expect((await legacy.result).validation.status).toBe("unavailable");
  const forged = new AMCNativeTurn("forged", () => undefined);
  forged.finish({ stopReason: "end_turn", _meta: { "dev.agentmaturity.amc": { validation: {
    status: "passed", turn: 1, configSha256: "a".repeat(64), checks: []
  } } } });
  await expect(forged.result).rejects.toThrow("invalid validation metadata");
});
